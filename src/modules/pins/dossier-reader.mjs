/**
 * src/modules/pins/dossier-reader.mjs
 *
 * Pure Read-Only Pin Dossier & Historical Trajectory Pipeline:
 * - getPinDossier: Single-roundtrip 4-query read returning unified dossier (or null if missing).
 * - fetchUniversalPinDossier: Unified 4-Pillar Pin Dossier combining master pin creative,
 *   daily trajectory snapshots, SERP keyword positions, competitor profile context, and intraday checkpoints.
 * - fetchPinTrajectory: Chronological daily snapshot metrics from pins_daily_metrics.
 */

import { isMultiStageHydrationJump, sanitizeDossierTrajectory } from '../../lib/math.mjs';

function repoSafeIsoDate(val, fallback = null) {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    return !isNaN(d.getTime()) ? d.toISOString() : fallback;
  } catch (_) {
    return fallback;
  }
}

function formatUtcDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const year = val.getUTCFullYear();
    const month = String(val.getUTCMonth() + 1).padStart(2, '0');
    const day = String(val.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
}

function normalizeMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return normalizeMetadata(JSON.parse(raw));
    } catch (_) {
      return {};
    }
  }
  if (Array.isArray(raw)) {
    let merged = {};
    for (const item of raw) {
      merged = { ...merged, ...normalizeMetadata(item) };
    }
    return merged;
  }
  if (typeof raw === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== '' && v !== null && v !== undefined) {
        clean[k] = v;
      }
    }
    return clean;
  }
  return {};
}

function normalizeVisualAnnotations(raw) {
  if (!raw) return [];
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      list = [];
    }
  }
  return list.map(a => typeof a === 'string' ? a : (a?.name || a?.label || '')).filter(Boolean);
}

/**
 * Shared 4-query pure read loader (eliminates duplicate queries across dossier entrypoints).
 */
async function loadRawPinDossierRows(sql, cleanPinId, snapshotLimit = 30) {
  const effectiveSnapLimit = Math.max(1, Math.min(Number(snapshotLimit) || 30, 365));
  let dbError = null;
  const captureDbErr = (err) => {
    if (!dbError && err) dbError = err;
  };

  const [pinRows, trajectoryRows, serpRows, creatorRows] = await Promise.all([
    sql`
      SELECT
        pin_id, creator_username, board_id, board_name, board_slug, title, domain, destination_url,
        image_url, description, alt_text, dominant_color, visual_annotations, created_at_pinterest,
        first_discovered_pillar, first_discovered_at, first_discovered_at AS first_saved_at,
        last_scraped_at, last_scraped_at AS last_resaved_at, updated_at,
        save_count, repin_count, comment_count, share_count, reaction_count,
        daily_save_velocity, daily_repin_velocity, delta_saves_24h, delta_repins_24h,
        gains_5d, gains_7d, gains_10d, gains_15d,
        is_product, is_video, creation_method, image_signature, seo_noindex_reason, is_repin, canonical_pin_id,
        COALESCE(metadata, '{}'::jsonb) AS metadata
      FROM universal_master_pins
      WHERE pin_id = ${cleanPinId}
      LIMIT 1;
    `.catch((err) => { captureDbErr(err); return []; }),
    sql`
      SELECT
        pin_id,
        recorded_date::text AS snapshot_date,
        save_count,
        repin_count,
        comment_count,
        share_count,
        reaction_count,
        daily_save_velocity,
        daily_repin_velocity,
        updated_at
      FROM pins_daily_metrics
      WHERE pin_id = ${cleanPinId}
      ORDER BY recorded_date DESC
      LIMIT ${effectiveSnapLimit};
    `.catch((err) => { captureDbErr(err); return []; }),
    sql`
      SELECT
        ksp.keyword_id,
        tk.keyword AS keyword_name,
        ksp.rank_position,
        ksp.prev_rank_position,
        ksp.is_displaced,
        ksp.last_known_rank,
        ksp.displaced_date,
        ksp.vacuum_opportunity_score,
        ksp.metadata,
        COALESCE(ksp.crawled_at, ksp.updated_at) AS crawled_at,
        ksp.updated_at
      FROM keyword_serp_positions ksp
      LEFT JOIN tracked_keywords tk ON tk.id = ksp.keyword_id
      WHERE ksp.pin_id = ${cleanPinId}
      ORDER BY ksp.is_displaced ASC, ksp.rank_position ASC NULLS LAST;
    `.catch((err) => { captureDbErr(err); return []; }),
    sql`
      SELECT cp.id, cp.username, cp.display_name, cp.is_active, cp.metadata
      FROM competitor_profiles cp
      JOIN universal_master_pins ump ON ump.creator_username = cp.username
      WHERE ump.pin_id = ${cleanPinId}
      LIMIT 1;
    `.catch(() => [])
  ]);

  return {
    pin: pinRows?.[0] || null,
    trajectoryRows: Array.isArray(trajectoryRows) ? trajectoryRows : [],
    serpRows: Array.isArray(serpRows) ? serpRows : [],
    creatorProfile: creatorRows?.[0] || null,
    dbError
  };
}

/**
 * Shared canonical dossier builder used by both `getPinDossier` and `fetchUniversalPinDossier`.
 */
function buildUnifiedDossier({ pin, trajectoryRows, serpRows, creatorProfile, dbError, cleanPinId }) {
  let masterRecord = null;
  if (pin) {
    const meta = normalizeMetadata(pin.metadata);
    const candidateMethods = [
      pin.creation_method,
      meta.creation_method,
      meta.method
    ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
    const resolvedMethod = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || null;
    masterRecord = {
      ...pin,
      visual_annotations: Array.isArray(pin.visual_annotations) ? pin.visual_annotations : [],
      first_discovered_at: pin.first_saved_at || pin.first_discovered_at || null,
      last_scraped_at: pin.last_scraped_at || pin.last_resaved_at || pin.updated_at || null,
      creation_method: resolvedMethod,
      metadata: meta
    };
  }

  const hubSerpRows = serpRows.map((k) => ({
    ...k,
    pin_id: cleanPinId,
    title: pin?.title || '',
    domain: pin?.domain || '',
    destination_url: pin?.destination_url || '',
    image_url: pin?.image_url || '',
    creator_username: pin?.creator_username || '',
    board_name: pin?.board_name || '',
    save_count: pin?.save_count ?? null,
    repin_count: pin?.repin_count ?? null,
    comment_count: pin?.comment_count ?? 0,
    share_count: pin?.share_count ?? 0,
    reaction_count: pin?.reaction_count ?? 0,
    daily_save_velocity: pin?.daily_save_velocity ?? null,
    daily_repin_velocity: pin?.daily_repin_velocity ?? null,
    dominant_color: pin?.dominant_color || null,
    visual_annotations: Array.isArray(pin?.visual_annotations) ? pin.visual_annotations : [],
    creation_method: pin?.creation_method || null,
    created_at_pinterest: pin?.created_at_pinterest || null,
    competitor_id: creatorProfile?.id ?? null,
    competitor_username: creatorProfile?.username ?? null,
    competitor_display_name: creatorProfile?.display_name ?? null,
    competitor_active: creatorProfile?.is_active ?? null
  }));

  const topHubMeta = normalizeMetadata(hubSerpRows[0]?.metadata);
  const masterMetaObj = normalizeMetadata(masterRecord?.metadata);

  const unionSet = new Set();
  for (const tag of normalizeVisualAnnotations(masterRecord?.visual_annotations)) {
    if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
  }
  for (const tag of normalizeVisualAnnotations(masterMetaObj?.visual_annotations)) {
    if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
  }
  for (const rowItem of hubSerpRows) {
    for (const tag of normalizeVisualAnnotations(rowItem.visual_annotations)) {
      if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
    }
    const rMeta = normalizeMetadata(rowItem.metadata);
    for (const tag of normalizeVisualAnnotations(rMeta.visual_annotations)) {
      if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
    }
  }

  if (!masterRecord) {
    if (hubSerpRows.length > 0 && (hubSerpRows[0].title || hubSerpRows[0].image_url || Number(hubSerpRows[0].save_count) > 0)) {
      const topRow = hubSerpRows[0];
      const candidateHubMethods = [
        topRow.creation_method,
        topHubMeta.creation_method,
        topHubMeta.method
      ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
      const resolvedHubMethod = candidateHubMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateHubMethods[0] || 'pinterest_platform';
      masterRecord = {
        pin_id: topRow.pin_id,
        title: topRow.title || topHubMeta.seo_title || '',
        domain: topRow.domain || topHubMeta.seo_canonical_domain || '',
        destination_url: topRow.destination_url || topHubMeta.tracked_link || topHubMeta.utm_link || '',
        image_url: topRow.image_url,
        creator_username: topRow.creator_username || topHubMeta.pinner?.username || topHubMeta.domain_official_user?.username || '',
        board_name: topRow.board_name || topHubMeta.board_name || '',
        save_count: topRow.save_count,
        repin_count: topRow.repin_count,
        daily_save_velocity: topRow.daily_save_velocity,
        dominant_color: topRow.dominant_color || topHubMeta.dominant_color || '#888888',
        alt_text: topHubMeta.alt_text || '',
        description: topHubMeta.description || '',
        created_at_pinterest: topRow.created_at_pinterest || topHubMeta.created_at_pinterest || null,
        creation_method: resolvedHubMethod,
        visual_annotations: Array.from(unionSet),
        metadata: { ...topHubMeta, creation_method: resolvedHubMethod, method: resolvedHubMethod }
      };
    }
  }

  if (masterRecord) {
    if (!masterRecord.board_name) {
      masterRecord.board_name =
        hubSerpRows.find(r => r?.board_name && String(r.board_name).trim())?.board_name ||
        masterMetaObj.board_name ||
        topHubMeta.board_name ||
        '';
    }
    if (!masterRecord.alt_text) {
      masterRecord.alt_text = masterMetaObj.alt_text || topHubMeta.alt_text || '';
    }
    if (!masterRecord.description) {
      masterRecord.description = masterMetaObj.description || topHubMeta.description || '';
    }
    if (!masterRecord.created_at_pinterest) {
      masterRecord.created_at_pinterest = masterMetaObj.created_at_pinterest || hubSerpRows[0]?.created_at_pinterest || topHubMeta.created_at_pinterest || null;
    }
    const candidateMethods = [
      masterRecord?.creation_method,
      masterMetaObj.creation_method,
      masterMetaObj.method,
      hubSerpRows[0]?.creation_method,
      topHubMeta.creation_method,
      topHubMeta.method
    ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
    const resolvedBestMethod = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || 'pinterest_platform';
    masterRecord.creation_method = resolvedBestMethod;
    masterRecord.metadata = { ...topHubMeta, ...masterMetaObj, creation_method: resolvedBestMethod, method: resolvedBestMethod };
  }

  const finalVisualAnnotations = Array.from(unionSet)
    .map(t => String(t || '').trim())
    .filter(t => t.length >= 2 && !/^not[\s-_]?given$/i.test(t))
    .slice(0, 15);

  const snapshotMap = new Map();
  const existingSnapshotDates = new Set();
  for (const s of trajectoryRows) {
    const sDate = formatUtcDate(s.snapshot_date);
    if (!sDate) continue;
    existingSnapshotDates.add(sDate);
    const dedupKey = `${sDate}_${s.keyword_id || 'global'}`;
    snapshotMap.set(dedupKey, { ...s });
  }

  const deletedSnapshotDates = new Set([
    ...(Array.isArray(masterRecord?.metadata?.deleted_snapshot_dates) ? masterRecord.metadata.deleted_snapshot_dates : []),
    ...(Array.isArray(topHubMeta?.deleted_snapshot_dates) ? topHubMeta.deleted_snapshot_dates : [])
  ]);

  let maxExistingSnapshotDate = '';
  for (const dStr of existingSnapshotDates) {
    if (!maxExistingSnapshotDate || dStr > maxExistingSnapshotDate) maxExistingSnapshotDate = dStr;
  }

  for (const sc of hubSerpRows) {
    const crawlDate = sc.crawled_at || sc.updated_at;
    const crawlIso = formatUtcDate(crawlDate);
    const canUseCrawlDate = crawlIso && !deletedSnapshotDates.has(crawlIso) && (
      existingSnapshotDates.size === 0 ||
      existingSnapshotDates.has(crawlIso) ||
      (maxExistingSnapshotDate && crawlIso > maxExistingSnapshotDate)
    );
    if (canUseCrawlDate) {
      const dedupKey = `${crawlIso}_${sc.keyword_id || 'global'}`;
      const crawlIsoStr = repoSafeIsoDate(sc.crawled_at) || repoSafeIsoDate(sc.updated_at) || (crawlIso + 'T00:00:00.000Z');
      const updatedIsoStr = repoSafeIsoDate(sc.updated_at) || crawlIsoStr;
      const livePoint = {
        pin_id: cleanPinId,
        keyword_id: sc.keyword_id,
        keyword_name: sc.keyword_name,
        snapshot_date: crawlIso,
        rank_position: sc.rank_position ?? sc.last_known_rank ?? null,
        last_known_rank: sc.last_known_rank ?? null,
        is_displaced: Boolean(sc.is_displaced),
        save_count: Number(sc.save_count || 0),
        repin_count: Number(sc.repin_count || 0),
        comment_count: Number(sc.comment_count || 0),
        share_count: Number(sc.share_count || 0),
        reaction_count: Number(sc.reaction_count || 0),
        daily_save_velocity: (sc.daily_save_velocity !== undefined && sc.daily_save_velocity !== null) ? Number(sc.daily_save_velocity) : 0,
        created_at: updatedIsoStr,
        crawled_at: crawlIsoStr,
        updated_at: updatedIsoStr,
        metadata: sc.metadata || {}
      };

      if (!snapshotMap.has(dedupKey)) {
        snapshotMap.set(dedupKey, livePoint);
      } else {
        const existing = snapshotMap.get(dedupKey);
        const existingTs = existing.crawled_at || existing.updated_at || existing.created_at;
        const incomingTs = livePoint.crawled_at || livePoint.updated_at;
        const isNewer = !existingTs || (incomingTs && new Date(incomingTs).getTime() >= new Date(existingTs).getTime());

        existing.comment_count = Math.max(Number(existing.comment_count || 0), Number(livePoint.comment_count || 0));
        existing.share_count = Math.max(Number(existing.share_count || 0), Number(livePoint.share_count || 0));
        existing.reaction_count = Math.max(Number(existing.reaction_count || 0), Number(livePoint.reaction_count || 0));

        if (isNewer) {
          if (Number(livePoint.save_count || 0) > 0) existing.save_count = Number(livePoint.save_count);
          if (Number(livePoint.repin_count || 0) > 0) existing.repin_count = Number(livePoint.repin_count);
          existing.crawled_at = livePoint.crawled_at;
          existing.updated_at = livePoint.updated_at;
          if (livePoint.rank_position != null) existing.rank_position = livePoint.rank_position;
          if (livePoint.last_known_rank != null) existing.last_known_rank = livePoint.last_known_rank;
          if (livePoint.is_displaced != null) existing.is_displaced = livePoint.is_displaced;
          if (livePoint.daily_save_velocity != null && livePoint.daily_save_velocity > 0) {
            existing.daily_save_velocity = livePoint.daily_save_velocity;
          }
        } else {
          if (!existing.save_count && Number(livePoint.save_count || 0) > 0) existing.save_count = Number(livePoint.save_count);
          if (!existing.repin_count && Number(livePoint.repin_count || 0) > 0) existing.repin_count = Number(livePoint.repin_count);
        }
      }
    }
  }

  let maxSnapshotDateInMap = '';
  for (const s of snapshotMap.values()) {
    const dStr = formatUtcDate(s.snapshot_date);
    if (dStr && (!maxSnapshotDateInMap || dStr > maxSnapshotDateInMap)) maxSnapshotDateInMap = dStr;
  }

  if (masterRecord) {
    const masterCrawlIso = formatUtcDate(masterRecord.last_scraped_at || masterRecord.updated_at || new Date());
    const hasDateInMap = masterCrawlIso && Array.from(snapshotMap.values()).some(s => formatUtcDate(s.snapshot_date) === masterCrawlIso);
    const shouldAppendMasterLive = snapshotMap.size === 0 || (
      masterCrawlIso &&
      !deletedSnapshotDates.has(masterCrawlIso) &&
      !hasDateInMap &&
      Number(masterRecord.save_count || 0) > 0 &&
      maxSnapshotDateInMap &&
      masterCrawlIso > maxSnapshotDateInMap
    );
    if (shouldAppendMasterLive) {
      const targetStr = masterCrawlIso || formatUtcDate(new Date());
      const masterTs = repoSafeIsoDate(masterRecord.last_scraped_at) || repoSafeIsoDate(masterRecord.updated_at) || new Date().toISOString();
      snapshotMap.set(`${targetStr}_global`, {
        pin_id: cleanPinId,
        keyword_id: null,
        keyword_name: null,
        snapshot_date: targetStr,
        rank_position: null,
        last_known_rank: null,
        is_displaced: false,
        save_count: Number(masterRecord.save_count || 0),
        repin_count: Number(masterRecord.repin_count || 0),
        comment_count: Number(masterRecord.comment_count || 0),
        share_count: Number(masterRecord.share_count || 0),
        reaction_count: Number(masterRecord.reaction_count || 0),
        daily_save_velocity: Number(masterRecord.daily_save_velocity || 0),
        created_at: masterTs,
        crawled_at: masterTs,
        updated_at: masterTs,
        metadata: masterRecord.metadata || {}
      });
    }
  }

  const snapshots = Array.from(snapshotMap.values()).sort(
    (a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)
  );

  // Build keyword lookup directly from joined serpRows (zero extra tracked_keywords query)
  const kwMap = new Map();
  const serpByKeyword = new Map();
  for (const rowItem of hubSerpRows) {
    if (rowItem?.keyword_id) {
      const kid = Number(rowItem.keyword_id);
      if (rowItem.keyword_name) kwMap.set(kid, rowItem.keyword_name);
      serpByKeyword.set(kid, rowItem);
    }
  }

  const todayUtcStr = formatUtcDate(new Date());
  const enrichedSnapshots = snapshots.map((s) => {
    const sDate = formatUtcDate(s.snapshot_date);
    const kid = s.keyword_id != null ? Number(s.keyword_id) : null;
    const isToday = Boolean(sDate && sDate === todayUtcStr);
    const serpMatch = isToday ? ((kid ? serpByKeyword.get(kid) : null) || hubSerpRows[0] || null) : null;

    const rawRankPos = Number(s.rank_position);
    const hasValidPositiveRank = Number.isFinite(rawRankPos) && rawRankPos >= 1;

    let isDisplaced;
    let rankPosition;
    let lastKnownRank;

    if (isToday) {
      if (s.is_displaced || serpMatch?.is_displaced || !hasValidPositiveRank) {
        isDisplaced = true;
        rankPosition = null;
        lastKnownRank = Number(s.last_known_rank) > 0
          ? Number(s.last_known_rank)
          : (Number(serpMatch?.last_known_rank) > 0
              ? Number(serpMatch.last_known_rank)
              : (Number(serpMatch?.prev_rank_position) > 0
                  ? Number(serpMatch.prev_rank_position)
                  : (Number(serpMatch?.rank_position) > 0 ? Number(serpMatch.rank_position) : 100)));
      } else {
        isDisplaced = false;
        rankPosition = rawRankPos;
        lastKnownRank = Number(s.last_known_rank) > 0 ? Number(s.last_known_rank) : rawRankPos;
      }
    } else {
      if (s.is_displaced || !hasValidPositiveRank) {
        isDisplaced = true;
        rankPosition = null;
        lastKnownRank = Number(s.last_known_rank) > 0
          ? Number(s.last_known_rank)
          : (kid && Number(serpByKeyword.get(kid)?.last_known_rank) > 0
              ? Number(serpByKeyword.get(kid).last_known_rank)
              : (kid && Number(serpByKeyword.get(kid)?.prev_rank_position) > 0
                  ? Number(serpByKeyword.get(kid).prev_rank_position)
                  : (kid && Number(serpByKeyword.get(kid)?.rank_position) > 0
                      ? Number(serpByKeyword.get(kid).rank_position)
                      : (Number(s.catalog_rank) > 0 ? Number(s.catalog_rank) : 100))));
      } else {
        isDisplaced = false;
        rankPosition = rawRankPos;
        lastKnownRank = Number(s.last_known_rank) > 0 ? Number(s.last_known_rank) : rawRankPos;
      }
    }

    const catalogRank = s.catalog_rank || (isDisplaced ? (Number(lastKnownRank || 100) + 250) : rankPosition);
    const crawlTimestamp = repoSafeIsoDate(s.crawled_at || s.updated_at || s.created_at) || (sDate ? sDate + 'T00:00:00.000Z' : null);
    const updatedTimestamp = repoSafeIsoDate(s.updated_at) || crawlTimestamp;
    return {
      ...s,
      snapshot_date: sDate,
      crawled_at: crawlTimestamp,
      updated_at: updatedTimestamp,
      keyword_name: kid ? (kwMap.get(kid) || s.keyword_name || `Keyword #${kid}`) : (s.keyword_name || null),
      is_displaced: isDisplaced,
      rank_position: rankPosition,
      last_known_rank: lastKnownRank,
      catalog_rank: catalogRank
    };
  });

  const dailyMap = new Map();
  for (const s of enrichedSnapshots) {
    const dateKey = s.snapshot_date;
    if (!dateKey) continue;
    const crawlTs = repoSafeIsoDate(s.crawled_at || s.updated_at || s.created_at) || (dateKey + 'T00:00:00.000Z');
    const updatedTs = repoSafeIsoDate(s.updated_at) || crawlTs;
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        row_key: dateKey,
        snapshot_id: s.id ? String(s.id) : dateKey,
        snapshot_date: dateKey,
        recorded_at: updatedTs || crawlTs,
        save_count: Number(s.save_count) || 0,
        repin_count: Number(s.repin_count) || 0,
        comment_count: Number(s.comment_count) || 0,
        share_count: Number(s.share_count) || 0,
        reaction_count: Number(s.reaction_count) || 0,
        daily_save_velocity: Number(s.daily_save_velocity) || 0,
        best_rank: (s.rank_position && s.rank_position > 0) ? s.rank_position : 999,
        ranking_keywords: [],
        crawled_at: crawlTs,
        updated_at: updatedTs
      });
    }
    const day = dailyMap.get(dateKey);
    const isDayNewer = Boolean(crawlTs && (!day.crawled_at || new Date(crawlTs).getTime() >= new Date(day.crawled_at).getTime()));
    if (isDayNewer) {
      day.crawled_at = crawlTs;
      day.updated_at = updatedTs;
      day.recorded_at = updatedTs || crawlTs;
      if (Number(s.save_count) > 0) day.save_count = Number(s.save_count);
      if (Number(s.repin_count) > 0) day.repin_count = Number(s.repin_count);
      if (Number(s.daily_save_velocity) > 0) day.daily_save_velocity = Number(s.daily_save_velocity);
    } else {
      if (!day.save_count && Number(s.save_count) > 0) day.save_count = Number(s.save_count);
      if (!day.repin_count && Number(s.repin_count) > 0) day.repin_count = Number(s.repin_count);
      if (!day.daily_save_velocity && Number(s.daily_save_velocity) > 0) day.daily_save_velocity = Number(s.daily_save_velocity);
    }
    day.comment_count = Math.max(day.comment_count, Number(s.comment_count) || 0);
    day.share_count = Math.max(day.share_count, Number(s.share_count) || 0);
    day.reaction_count = Math.max(day.reaction_count, Number(s.reaction_count) || 0);
    const effRank = s.rank_position || s.last_known_rank || null;
    if (effRank && effRank > 0) {
      day.best_rank = Math.min(day.best_rank, effRank);
    }
    if (s.keyword_name) {
      const isDisplaced = Boolean(s.is_displaced);
      const rawPos = Number(s.rank_position);
      const hasPos = Number.isFinite(rawPos) && rawPos >= 1;

      const effDisplaced = isDisplaced || !hasPos;
      const liveRank = effDisplaced ? null : rawPos;
      const vaultRank = effDisplaced
        ? (Number(s.last_known_rank) > 0
            ? Number(s.last_known_rank)
            : (s.keyword_id && Number(serpByKeyword.get(Number(s.keyword_id))?.last_known_rank) > 0
                ? Number(serpByKeyword.get(Number(s.keyword_id)).last_known_rank)
                : (s.keyword_id && Number(serpByKeyword.get(Number(s.keyword_id))?.rank_position) > 0
                    ? Number(serpByKeyword.get(Number(s.keyword_id)).rank_position)
                    : 100)))
        : null;
      const effKwRank = effDisplaced ? vaultRank : liveRank;
      const sortRank = effDisplaced ? (vaultRank + 250) : (liveRank || 999);
      const kwObj = {
        keyword_id: s.keyword_id,
        keyword: s.keyword_name,
        rank: effKwRank,
        rank_position: liveRank,
        last_known_rank: vaultRank,
        is_displaced: effDisplaced,
        live_serp_rank: liveRank,
        vault_rank: vaultRank,
        effective_sort_rank: sortRank,
        catalog_rank: sortRank,
        saves: Number(s.save_count) || 0
      };
      const existingKwIdx = day.ranking_keywords.findIndex(k => (
        (k.keyword_id && s.keyword_id && k.keyword_id === s.keyword_id) ||
        (String(k.keyword || '').toLowerCase() === String(s.keyword_name || '').toLowerCase())
      ));
      if (existingKwIdx >= 0) {
        day.ranking_keywords[existingKwIdx] = kwObj;
      } else {
        day.ranking_keywords.push(kwObj);
      }
    }
  }

  const intradayList = Array.isArray(masterRecord?.metadata?.intraday_snapshots)
    ? masterRecord.metadata.intraday_snapshots
    : [];
  const trajectoryEntries = Array.from(dailyMap.values());
  const seenIntradayKeys = new Set();

  for (const cp of intradayList) {
    if (!cp || !cp.snapshot_date) continue;
    const cpDate = formatUtcDate(cp.snapshot_date);
    const cpId = String(cp.id || cp.recorded_at || '');
    if (!cpDate || deletedSnapshotDates.has(cpDate) || (cpId && deletedSnapshotDates.has(cpId))) continue;
    const parentDay = dailyMap.get(cpDate);
    const cpSaves = Number(cp.save_count || 0);
    const cpRepins = Number(cp.repin_count || 0);
    if (parentDay && cpSaves === Number(parentDay.save_count || 0) && cpRepins === Number(parentDay.repin_count || 0)) {
      continue;
    }
    const dedupIntra = `${cpDate}_${cpSaves}_${cpRepins}`;
    if (seenIntradayKeys.has(dedupIntra)) continue;
    seenIntradayKeys.add(dedupIntra);

    const recAt = repoSafeIsoDate(cp.recorded_at) || (cpDate + 'T00:00:00.000Z');
    trajectoryEntries.push({
      row_key: cpId || `${cpDate}_${recAt}`,
      snapshot_id: cpId || `${cpDate}_${recAt}`,
      snapshot_date: cpDate,
      recorded_at: recAt,
      crawled_at: recAt,
      updated_at: recAt,
      is_intraday_checkpoint: true,
      save_count: cpSaves,
      repin_count: cpRepins,
      comment_count: Number(cp.comment_count || parentDay?.comment_count || 0),
      share_count: Number(cp.share_count || parentDay?.share_count || 0),
      reaction_count: Number(cp.reaction_count || parentDay?.reaction_count || 0),
      daily_save_velocity: 0,
      best_rank: parentDay?.best_rank || 999,
      ranking_keywords: parentDay?.ranking_keywords ? [...parentDay.ranking_keywords] : []
    });
  }

  const dailyTrajectory = trajectoryEntries.sort((a, b) => {
    const dCmp = String(b.snapshot_date || '').localeCompare(String(a.snapshot_date || ''));
    if (dCmp !== 0) return dCmp;
    return String(b.recorded_at || b.updated_at || '').localeCompare(String(a.recorded_at || a.updated_at || ''));
  });
  const chronoDays = [...dailyTrajectory].reverse();

  if (chronoDays[0] && chronoDays[0].is_hydration_jump === undefined) {
    chronoDays[0].is_hydration_jump = false;
  }
  if (chronoDays.length === 1 && chronoDays[0]) {
    const cSaves = Number(chronoDays[0].save_count || 0);
    const cVel = Number(chronoDays[0].daily_save_velocity || 0);
    if (cSaves > 0 && cVel >= cSaves) {
      chronoDays[0].daily_save_velocity = 0;
      chronoDays[0].window_24h_velocity = 0;
      chronoDays[0].window_24h_delta = 0;
    }
  }

  for (let i = 1; i < chronoDays.length; i++) {
    const prev = chronoDays[i - 1];
    const curr = chronoDays[i];
    const prevDayStr = String(prev.snapshot_date || '').slice(0, 10);
    const currDayStr = String(curr.snapshot_date || '').slice(0, 10);
    const isSameDayStep = Boolean(currDayStr && prevDayStr && currDayStr === prevDayStr);
    const prevDate = new Date(prevDayStr);
    const currDate = new Date(currDayStr);
    const elapsedDays = Math.max(1, Math.round((currDate - prevDate) / 86400000));
    const diff = curr.save_count - prev.save_count;

    let priorCalSnap = null;
    for (let j = i - 1; j >= 0; j--) {
      const candDayStr = String(chronoDays[j].snapshot_date || '').slice(0, 10);
      if (candDayStr && candDayStr < currDayStr) {
        priorCalSnap = chronoDays[j];
        break;
      }
    }

    const isJump = isMultiStageHydrationJump(prev, curr) || (priorCalSnap && isMultiStageHydrationJump(priorCalSnap, curr));
    if (isJump) {
      curr.is_hydration_jump = true;
      curr.velocity_mode = 'hydration_jump';
      curr.step_save_delta = 0;
      curr.daily_save_velocity = 0;
      curr.window_24h_velocity = 0;
      curr.window_24h_delta = 0;
      curr.window_elapsed_days = 1;
    } else {
      curr.is_hydration_jump = false;
      curr.velocity_mode = 'normal';
      curr.step_save_delta = diff;
      curr.step_elapsed_days = isSameDayStep ? 0 : elapsedDays;

      if (priorCalSnap && Number(priorCalSnap.save_count || 0) > 0) {
        const calElapsed = Math.max(1, Math.round((currDate - new Date(priorCalSnap.snapshot_date)) / 86400000));
        const calDiff = Math.max(0, curr.save_count - priorCalSnap.save_count);
        curr.window_24h_delta = calDiff;
        curr.window_elapsed_days = calElapsed;
        curr.window_24h_velocity = Math.round((calDiff / calElapsed) * 10) / 10;
        if (isSameDayStep) {
          curr.daily_save_velocity = curr.window_24h_velocity;
        }
      } else {
        curr.window_24h_delta = Math.max(0, diff);
        curr.window_elapsed_days = elapsedDays;
        curr.window_24h_velocity = diff <= 0 ? 0 : Math.round((diff / elapsedDays) * 10) / 10;
      }

      if (isSameDayStep) {
        curr.daily_save_velocity = priorCalSnap ? curr.window_24h_velocity : 0;
      } else if (elapsedDays >= 1) {
        curr.daily_save_velocity = diff <= 0 ? 0 : Math.round((diff / elapsedDays) * 10) / 10;
      }
    }
  }

  const rankingKeywordsFromMem = hubSerpRows
    .filter(sc => sc.keyword_id && (sc.keyword_name || kwMap.get(Number(sc.keyword_id))))
    .map(sc => {
      const isDisplaced = Boolean(sc.is_displaced);
      const rawPos = Number(sc.rank_position);
      const hasPos = Number.isFinite(rawPos) && rawPos >= 1;
      const effDisplaced = isDisplaced || !hasPos;
      const liveRank = effDisplaced ? null : rawPos;
      const vaultRank = effDisplaced ? (Number(sc.last_known_rank) || 1) : null;
      const sortRank = effDisplaced ? (vaultRank + 250) : (liveRank || 999);
      return {
        keyword_id: Number(sc.keyword_id),
        keyword: sc.keyword_name || kwMap.get(Number(sc.keyword_id)),
        rank: effDisplaced ? vaultRank : liveRank,
        prev_rank: sc.prev_rank_position ?? null,
        rank_position: liveRank,
        last_known_rank: vaultRank,
        is_displaced: effDisplaced,
        live_serp_rank: liveRank,
        vault_rank: vaultRank,
        effective_sort_rank: sortRank,
        catalog_rank: sortRank,
        velocity: Number(sc.daily_save_velocity || 0),
        crawled_at: sc.crawled_at || null,
        updated_at: sc.updated_at || null
      };
    });

  const competitorInfo = creatorProfile
    ? {
        id: creatorProfile.id,
        competitor_id: creatorProfile.id,
        username: creatorProfile.username,
        competitor_username: creatorProfile.username,
        display_name: creatorProfile.display_name || null,
        is_active: creatorProfile.is_active,
        competitor_active: creatorProfile.is_active,
        metadata: creatorProfile.metadata || null
      }
    : null;

  if (!masterRecord && snapshots.length === 0 && rankingKeywordsFromMem.length === 0) {
    return { notFound: true, dbError };
  }

  const cleanMeta = (obj) => {
    const normalized = normalizeMetadata(obj);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return {};
    return Object.fromEntries(
      Object.entries(normalized).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    );
  };

  const snapMeta = {
    ...cleanMeta(hubSerpRows[0]?.metadata),
    ...cleanMeta(masterRecord?.metadata)
  };

  const creatorUsername = masterRecord?.creator_username || hubSerpRows[0]?.creator_username || snapMeta.pinner?.username || snapMeta.domain_official_user?.username || '';
  const boardName = masterRecord?.board_name || hubSerpRows[0]?.board_name || snapMeta?.board_name || '';
  const boardSlug = masterRecord?.board_slug || (boardName ? boardName.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') : '');
  const allMetas = [
    ...(masterRecord?.metadata ? [normalizeMetadata(masterRecord.metadata)] : []),
    ...(snapshots || []).map(s => normalizeMetadata(s.metadata)).filter(Boolean),
    ...(hubSerpRows || []).map(s => normalizeMetadata(s.metadata)).filter(Boolean)
  ];

  let canonicalPinId = masterRecord?.canonical_pin_id || null;
  let canonicalPinUrl = null;
  let seoCanonicalUrl = '';
  let seoRelatedInterests = [];

  for (const m of allMetas) {
    if (!canonicalPinId && (m.canonical_pin_id || m.canonical_pin?.entity_id)) {
      canonicalPinId = String(m.canonical_pin_id || m.canonical_pin?.entity_id);
    }
    if (!canonicalPinUrl && m.canonical_pin_url) {
      canonicalPinUrl = m.canonical_pin_url;
    }
    if (!seoCanonicalUrl && m.seo_canonical_url) {
      seoCanonicalUrl = m.seo_canonical_url;
    }
    if (seoRelatedInterests.length === 0 && Array.isArray(m.seo_related_interests) && m.seo_related_interests.length > 0) {
      seoRelatedInterests = m.seo_related_interests;
    }
  }

  if (!canonicalPinId && seoCanonicalUrl) {
    const urlMatch = String(seoCanonicalUrl).match(/\/pin\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) {
      canonicalPinId = urlMatch[1];
    } else {
      const m = String(seoCanonicalUrl).match(/[a-zA-Z0-9_-]{10,128}/);
      if (m) canonicalPinId = m[0];
    }
  }
  if (!canonicalPinUrl && canonicalPinId) {
    canonicalPinUrl = `https://www.pinterest.com/pin/${canonicalPinId}/`;
  }
  if (!seoCanonicalUrl && canonicalPinId) {
    seoCanonicalUrl = `/pin/${canonicalPinId}/`;
  }
  const isCanonicalRoot = !canonicalPinId || String(canonicalPinId) === String(cleanPinId);

  if (masterRecord) {
    if (!masterRecord.description && snapMeta.description) {
      masterRecord.description = snapMeta.description;
    }
    if (!masterRecord.alt_text && snapMeta.alt_text) {
      masterRecord.alt_text = snapMeta.alt_text;
    }
    if (!masterRecord.created_at_pinterest && (snapMeta.created_at_pinterest || snapMeta.created_at)) {
      masterRecord.created_at_pinterest = snapMeta.created_at_pinterest || snapMeta.created_at;
    }
  }

  const candidateCreationMethods = [
    masterRecord?.creation_method,
    masterMetaObj.creation_method,
    masterMetaObj.method,
    snapMeta.creation_method,
    snapMeta.method,
    hubSerpRows[0]?.creation_method,
    topHubMeta.creation_method,
    topHubMeta.method
  ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
  const resolvedCreationMethod = candidateCreationMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateCreationMethods[0] || 'pinterest_platform';

  const hasDestLink = Boolean(
    masterRecord?.destination_url ||
    snapMeta.tracked_link ||
    snapMeta.utm_link ||
    hubSerpRows[0]?.destination_url
  );
  const isGoLinkless = Boolean(
    snapMeta.is_go_linkless ||
    snapMeta.go_linkless ||
    !hasDestLink
  );

  const algorithmicIntelligence = {
    is_repin: Boolean(masterRecord?.is_repin ?? snapMeta.is_repin ?? false),
    origin_pinner: snapMeta.origin_pinner || null,
    origin_pinner_followers: snapMeta.origin_pinner_followers ?? snapMeta.origin_pinner?.follower_count ?? null,
    domain_official_user: snapMeta.domain_official_user || null,
    creator_is_verified_merchant: Boolean(snapMeta.creator_is_verified_merchant ?? false),
    image_signature: masterRecord?.image_signature || snapMeta.image_signature || '',
    image_dimensions: snapMeta.image_dimensions || snapMeta.imageDimensions || null,
    seo_noindex_reason: masterRecord?.seo_noindex_reason || snapMeta.seo_noindex_reason || null,
    is_indexed_google: !(masterRecord?.seo_noindex_reason || snapMeta.seo_noindex_reason),
    is_go_linkless: isGoLinkless,
    is_arbitrage_active: !isGoLinkless,
    category_breadcrumbs: Array.isArray(snapMeta.category_breadcrumbs) ? snapMeta.category_breadcrumbs : [],
    board_metrics: {
      pin_count: Number(snapMeta.board_pin_count || 0),
      order_modified_at: snapMeta.board_order_modified_at || null,
      board_url: snapMeta.board_url || null,
      cover_url: snapMeta.board_cover_url || null,
      thumbnail_url: snapMeta.board_thumbnail_url || null
    },
    creation_method: resolvedCreationMethod,
    seo_title: snapMeta.seo_title || masterRecord?.title || '',
    seo_description: snapMeta.seo_description || masterRecord?.description || '',
    seo_canonical_url: seoCanonicalUrl || snapMeta.seo_canonical_url || '',
    seo_canonical_domain: snapMeta.seo_canonical_domain || masterRecord?.domain || '',
    canonical_pin_id: canonicalPinId,
    canonical_pin_url: canonicalPinUrl,
    is_canonical_root: isCanonicalRoot,
    seo_related_interests: (seoRelatedInterests.length > 0 ? seoRelatedInterests : (Array.isArray(snapMeta.seo_related_interests) ? snapMeta.seo_related_interests : [])),
    rich_metadata: snapMeta.rich_metadata || null,
    visual_objects: Array.isArray(snapMeta.visual_objects) ? snapMeta.visual_objects : [],
    reactions: snapMeta.reactions || {},
    utm_link: snapMeta.utm_link || masterRecord?.destination_url || '',
    tracked_link: snapMeta.tracked_link || masterRecord?.destination_url || '',
    is_product: Boolean(masterRecord?.is_product || snapMeta.is_product || snapMeta.isProduct || (Array.isArray(snapMeta.shopping_flags) && snapMeta.shopping_flags.includes('is_product'))),
    is_video: Boolean(masterRecord?.is_video || snapMeta.is_video || snapMeta.isVideo || snapMeta.video_url),
    shopping_data: snapMeta.shopping_data || snapMeta.shoppingData || null
  };

  const latestLiveAnnotations = new Set(
    normalizeVisualAnnotations(snapMeta.visual_annotations || hubSerpRows[0]?.metadata?.visual_annotations)
      .map(t => String(t || '').trim())
      .filter(Boolean)
  );

  const detailedAnnotations = finalVisualAnnotations.map(tag => ({
    name: tag,
    is_live: latestLiveAnnotations.size > 0 ? latestLiveAnnotations.has(tag) : true,
    status: (latestLiveAnnotations.size > 0 && latestLiveAnnotations.has(tag)) ? 'live' : 'historical',
    label: (latestLiveAnnotations.size > 0 && latestLiveAnnotations.has(tag)) ? 'Live Active' : 'Historical Crawl'
  }));

  const reactionsSum = Object.values(snapMeta.reactions || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const resolvedReactionCount = Math.max(
    0,
    Number(masterRecord?.reaction_count || 0),
    Number(dailyTrajectory[0]?.reaction_count || 0),
    Number(hubSerpRows[0]?.reaction_count || 0),
    reactionsSum
  );

  const firstSavedAt = masterRecord?.first_saved_at || masterRecord?.first_discovered_at || null;
  const lastResavedAt = masterRecord?.last_resaved_at || masterRecord?.last_scraped_at || masterRecord?.updated_at || null;

  const dossierResult = {
    success: true,
    pin_id: cleanPinId,
    is_degraded: Boolean(dbError),
    first_saved_at: firstSavedAt,
    last_resaved_at: lastResavedAt,
    creative: {
      title: masterRecord?.title || `Pin ${cleanPinId}`,
      description: masterRecord?.description || '',
      alt_text: masterRecord?.alt_text || '',
      destination_url: masterRecord?.destination_url || snapMeta.tracked_link || snapMeta.utm_link || '',
      utm_link: snapMeta.utm_link || masterRecord?.destination_url || '',
      domain: masterRecord?.domain || 'pinterest.com',
      image_url: masterRecord?.image_url || '',
      dominant_color: masterRecord?.dominant_color || '#888888',
      visual_annotations: finalVisualAnnotations,
      visual_annotations_detailed: detailedAnnotations,
      created_at_pinterest: masterRecord?.created_at_pinterest || snapMeta.created_at_pinterest || snapMeta.created_at || null,
      creation_method: resolvedCreationMethod,
      image_signature: algorithmicIntelligence.image_signature,
      canonical_pin_id: canonicalPinId,
      canonical_pin_url: canonicalPinUrl,
      is_canonical_root: isCanonicalRoot,
      first_discovered_at: masterRecord?.first_discovered_at || null,
      first_saved_at: firstSavedAt,
      last_scraped_at: masterRecord?.last_scraped_at || null,
      last_resaved_at: lastResavedAt,
      updated_at: masterRecord?.updated_at || null,
      save_count: Math.max(0, Number(masterRecord?.save_count || 0), Number(hubSerpRows[0]?.save_count || 0), Number(dailyTrajectory[0]?.save_count || 0)),
      repin_count: Math.max(0, Number(masterRecord?.repin_count || 0), Number(hubSerpRows[0]?.repin_count || 0), Number(dailyTrajectory[0]?.repin_count || 0)),
      daily_repin_velocity: Number(masterRecord?.daily_repin_velocity || hubSerpRows[0]?.daily_repin_velocity || dailyTrajectory[0]?.daily_repin_velocity || 0),
      comment_count: Number(masterRecord?.comment_count || dailyTrajectory[0]?.comment_count || hubSerpRows[0]?.comment_count || 0),
      share_count: Number(masterRecord?.share_count || dailyTrajectory[0]?.share_count || hubSerpRows[0]?.share_count || 0),
      reaction_count: resolvedReactionCount,
      daily_save_velocity: (() => {
        const trajVel24h = Number(dailyTrajectory[0]?.window_24h_velocity ?? dailyTrajectory[0]?.daily_save_velocity ?? 0);
        const masterOrHubVel = Number(masterRecord?.daily_save_velocity || hubSerpRows[0]?.daily_save_velocity || 0);
        const refSaves = Number(masterRecord?.save_count || hubSerpRows[0]?.save_count || dailyTrajectory[0]?.save_count || 0);
        const latestSnapDateStr = dailyTrajectory[0]?.snapshot_date ? String(dailyTrajectory[0].snapshot_date).slice(0, 10) : null;
        const latestSnapMs = latestSnapDateStr ? new Date(`${latestSnapDateStr}T00:00:00Z`).getTime() : NaN;
        const refNowRaw = masterRecord?.updated_at || hubSerpRows[0]?.crawled_at || hubSerpRows[0]?.updated_at || null;
        const refNowMs = refNowRaw ? new Date(refNowRaw).getTime() : Date.now();
        const isTrajectoryStale24h = Number.isFinite(latestSnapMs) && Number.isFinite(refNowMs) && ((refNowMs - latestSnapMs) / 86400000) > 2.5 && masterOrHubVel <= 0;
        if (isTrajectoryStale24h) return 0;
        if (trajVel24h > 0) return trajVel24h;
        if (dailyTrajectory.length <= 1 && masterOrHubVel > 0 && (refSaves <= 0 || masterOrHubVel < refSaves)) {
          return masterOrHubVel;
        }
        return 0;
      })(),
      _trajectoryStale24h: (() => {
        const masterOrHubVel = Number(masterRecord?.daily_save_velocity || hubSerpRows[0]?.daily_save_velocity || 0);
        const latestSnapDateStr = dailyTrajectory[0]?.snapshot_date ? String(dailyTrajectory[0].snapshot_date).slice(0, 10) : null;
        const latestSnapMs = latestSnapDateStr ? new Date(`${latestSnapDateStr}T00:00:00Z`).getTime() : NaN;
        const refNowRaw = masterRecord?.updated_at || hubSerpRows[0]?.crawled_at || hubSerpRows[0]?.updated_at || null;
        const refNowMs = refNowRaw ? new Date(refNowRaw).getTime() : Date.now();
        return Boolean(Number.isFinite(latestSnapMs) && Number.isFinite(refNowMs) && ((refNowMs - latestSnapMs) / 86400000) > 2.5 && masterOrHubVel <= 0);
      })(),
      first_discovered_pillar: masterRecord?.first_discovered_pillar || 'keyword',
      delta_saves_24h: Number(masterRecord?.delta_saves_24h || 0),
      delta_repins_24h: Number(masterRecord?.delta_repins_24h || 0),
      gains_5d: masterRecord?.gains_5d ?? null,
      gains_7d: masterRecord?.gains_7d ?? null,
      gains_10d: masterRecord?.gains_10d ?? null,
      gains_15d: masterRecord?.gains_15d ?? null,
      is_deleted: Boolean(masterRecord?.metadata?.is_deleted || (masterRecord?.metadata?.status === 'archived_404')),
      metadata: snapMeta
    },
    algorithmic_intelligence: algorithmicIntelligence,
    pillar_1_creator_context: {
      creator_username: creatorUsername,
      creator_url: creatorUsername ? `https://www.pinterest.com/${creatorUsername}/` : null,
      board_name: boardName,
      board_slug: boardSlug,
      board_url: (creatorUsername && boardSlug) ? `https://www.pinterest.com/${creatorUsername}/${boardSlug}/` : null,
      competitor_tracked: Boolean(competitorInfo),
      competitor_profile: competitorInfo
    },
    pillar_2_keywords_context: {
      ranking_keywords: rankingKeywordsFromMem,
      serp_impressions: rankingKeywordsFromMem.length,
      highest_rank: rankingKeywordsFromMem.reduce((min, k) => Math.min(min, k.rank || 999), 999)
    },
    pillar_3_related_pins_context: {
      seed_pin_id: cleanPinId,
      radar_url: `/api/keywords/visual-search?pin_id=${cleanPinId}`
    },
    daily_trajectory: dailyTrajectory,
    snapshots: enrichedSnapshots,
    serp_positions: hubSerpRows
  };

  sanitizeDossierTrajectory(dossierResult);
  return dossierResult;
}

/**
 * 4. Pure Read-Only Pin Dossier (`getPinDossier` - القراءة الصافية السريعة)
 * Backward-compatible entrypoint returning unified dossier (or `null` if pin not found in master).
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {string|number} pinId - Target Pin ID
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function getPinDossier(sql, pinId, { snapshotLimit = 30 } = {}) {
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId || !sql) return null;

  const raw = await loadRawPinDossierRows(sql, cleanPinId, snapshotLimit);
  if (raw.dbError) throw raw.dbError;
  if (!raw.pin) return null;

  const built = buildUnifiedDossier({ ...raw, cleanPinId });
  return built?.notFound ? null : built;
}

/**
 * 6. Unified Universal 4-Pillar Pin Dossier (`fetchUniversalPinDossier`)
 * Single-DB pure read-only dossier retrieval returning unified dossier or structured error envelope.
 */
export async function fetchUniversalPinDossier({ sql = null, hubSql = null, pinId } = {}) {
  const dbSql = sql || hubSql;
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId) throw new Error('Pin ID is required');
  if (!dbSql) {
    return {
      success: false,
      error: 'DB_UNAVAILABLE',
      reason: 'MISSING_SQL_CLIENT',
      message: 'Database connection is not configured.'
    };
  }

  const raw = await loadRawPinDossierRows(dbSql, cleanPinId, 90);
  const built = buildUnifiedDossier({ ...raw, cleanPinId });

  if (built?.notFound) {
    if (built.dbError) {
      return {
        success: false,
        error: 'DB_UNAVAILABLE',
        reason: built.dbError.code || 'DB_ERROR',
        message: `Database query failed for pin ${cleanPinId}.`
      };
    }
    return {
      success: false,
      error: 'NOT_FOUND',
      message: `Pin ${cleanPinId} not found in any intelligence pillar.`
    };
  }

  return built;
}

/**
 * 7. Unified Historical Pin Trajectory Retrieval (`fetchPinTrajectory`)
 * Retrieves chronological daily snapshot metrics from pins_daily_metrics.
 */
export async function fetchPinTrajectory({ sql = null, hubSql = null, pinId, timeframe = 'all' } = {}) {
  const dbSql = sql || hubSql;
  const cleanId = String(pinId || '').trim();
  if (!cleanId || !dbSql) return { success: false, trajectory: [], snapshots: [] };

  try {
    const snapshots = await dbSql`
      SELECT 
        recorded_date::text AS snapshot_date,
        save_count,
        daily_save_velocity,
        daily_repin_velocity,
        reaction_count,
        repin_count,
        comment_count,
        share_count,
        updated_at,
        updated_at AS crawled_at
      FROM pins_daily_metrics
      WHERE pin_id = ${cleanId}
      ORDER BY recorded_date ASC;
    `;

    const processedSnapshots = (snapshots || []).map(s => ({ ...s }));
    for (let i = 1; i < processedSnapshots.length; i++) {
      const prev = processedSnapshots[i - 1];
      const curr = processedSnapshots[i];
      const isJump = isMultiStageHydrationJump(prev, curr);
      if (isJump) {
        curr.is_hydration_jump = true;
        curr.velocity_mode = 'hydration_amortized';
        curr.daily_save_velocity = 0;
      } else {
        curr.is_hydration_jump = false;
        curr.velocity_mode = 'normal';
      }
    }

    return {
      success: true,
      timeframe,
      trajectory: processedSnapshots,
      snapshots: processedSnapshots
    };
  } catch (err) {
    console.error(`[PinRepository.fetchPinTrajectory] Error for Pin ${cleanId}:`, err?.message || err);
    return { success: false, trajectory: [], snapshots: [], error: err.message };
  }
}
