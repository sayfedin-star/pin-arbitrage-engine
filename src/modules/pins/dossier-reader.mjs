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
import { normalizeCanonicalCreationMethod, decodeHtmlEntities } from '../newborn/surface-normalizers.mjs';

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

function extractIdeaIdFromAnnotationUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/ideas\/[^/?#]+\/(\d{4,25})(?:\/|$|\?)/i);
  return match ? match[1] : null;
}

function extractLinkedAnnotationsFromRaw(raw) {
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
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || item.label || item.tag || item.term || '').trim();
    if (name.length < 2 || /^\[object\s+object\]$/i.test(name)) continue;
    const url = typeof item.url === 'string' && item.url.trim() ? item.url.trim() : null;
    const rawId = item.idea_id || item.annotation_id || item.id || extractIdeaIdFromAnnotationUrl(url);
    const ideaId = rawId && String(rawId).trim() !== '0' ? String(rawId).trim() : null;
    if (url || ideaId) {
      out.push({ name, idea_id: ideaId, url });
    }
  }
  return out;
}

function mergeLinkedAnnotations(...sources) {
  const byKey = new Map();
  for (const src of sources) {
    for (const item of extractLinkedAnnotationsFromRaw(src)) {
      const key = item.name.toLowerCase();
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, item);
      } else {
        byKey.set(key, {
          name: existing.name || item.name,
          idea_id: existing.idea_id || item.idea_id || null,
          url: existing.url || item.url || null
        });
      }
    }
  }
  return Array.from(byKey.values());
}

function resolveBestCanonicalMethod(candidates, { isHydrated = true, isCarousel = false } = {}) {
  const normalized = [];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) continue;
    const clean = normalizeCanonicalCreationMethod(raw, { isHydrated });
    if (clean) normalized.push(clean);
  }
  const specific = normalized.find((m) => m !== 'pinterest_platform' && m !== 'unhydrated_stub');
  if (specific) return specific;
  if (isCarousel) return 'carousel';
  if (normalized.includes('pinterest_platform')) return 'pinterest_platform';
  return normalized[0] || 'pinterest_platform';
}

function maxFiniteMetric(a, b) {
  const aValid = a !== null && a !== undefined && a !== '' && Number.isFinite(Number(a));
  const bValid = b !== null && b !== undefined && b !== '' && Number.isFinite(Number(b));
  if (aValid && bValid) return Math.max(Number(a), Number(b));
  if (aValid) return Number(a);
  if (bValid) return Number(b);
  return null;
}

/**
 * Pure 4-Pillar canonical master record synthesizer.
 * Unifies `universal_master_pins` (Pillars 1-3) with `newborn_candidates` (Pillar 4)
 * so every pin discovered in @discover renders a full Universal Dossier without 404s.
 */
export function synthesizeCanonicalMasterRecord({ pin = null, newbornContextRow = null, cleanPinId = '' } = {}) {
  if (!pin && !newbornContextRow) return null;

  const pinMeta = normalizeMetadata(pin?.metadata);
  const ncMeta = normalizeMetadata(newbornContextRow?.metadata);
  const isHydrated = Boolean(
    pin ||
    newbornContextRow?.is_hydrated ||
    Number(newbornContextRow?.save_count || 0) > 0 ||
    Number(newbornContextRow?.repin_count || 0) > 0
  );
  const isCarousel = Boolean(
    pinMeta.is_carousel ||
    newbornContextRow?.is_carousel ||
    ncMeta.is_carousel
  );

  const resolvedMethod = resolveBestCanonicalMethod([
    pin?.creation_method,
    pinMeta.creation_method,
    pinMeta.method,
    newbornContextRow?.raw_creation_method,
    ncMeta.creation_method,
    ncMeta.method
  ], { isHydrated, isCarousel });

  const mergedLinkedAnnotations = mergeLinkedAnnotations(
    pinMeta.annotations_with_links,
    pin?.visual_annotations,
    ncMeta.annotations_with_links,
    newbornContextRow?.visual_annotations
  );

  const ncCreatorUsername = newbornContextRow
    ? (newbornContextRow.effective_creator_username || newbornContextRow.origin_creator_username || newbornContextRow.pinner_username || '')
    : '';
  const ncBoardName = newbornContextRow
    ? (newbornContextRow.pin_board_name || newbornContextRow.board_name || newbornContextRow.discovery_board_name || '')
    : '';
  const ncBoardUrl = newbornContextRow
    ? (newbornContextRow.pin_board_url || newbornContextRow.board_url || newbornContextRow.discovery_board_url || ncMeta.board_url || null)
    : null;

  const ncPinnerObj = newbornContextRow && (newbornContextRow.pinner_username || newbornContextRow.pinner_full_name || newbornContextRow.pinner_followers != null)
    ? {
        ...(ncMeta.pinner && typeof ncMeta.pinner === 'object' ? ncMeta.pinner : {}),
        ...(newbornContextRow.pinner_username ? { username: newbornContextRow.pinner_username } : {}),
        ...(newbornContextRow.pinner_full_name ? { full_name: newbornContextRow.pinner_full_name } : {}),
        ...(newbornContextRow.pinner_followers != null ? { follower_count: Number(newbornContextRow.pinner_followers) } : {})
      }
    : (ncMeta.pinner || null);

  const ncOriginPinnerObj = newbornContextRow && (newbornContextRow.origin_creator_username || newbornContextRow.origin_creator_full_name || newbornContextRow.origin_creator_followers != null)
    ? {
        ...(ncMeta.origin_pinner && typeof ncMeta.origin_pinner === 'object' ? ncMeta.origin_pinner : {}),
        ...(newbornContextRow.origin_creator_username ? { username: newbornContextRow.origin_creator_username } : {}),
        ...(newbornContextRow.origin_creator_full_name ? { full_name: newbornContextRow.origin_creator_full_name } : {}),
        ...(newbornContextRow.origin_creator_followers != null ? { follower_count: Number(newbornContextRow.origin_creator_followers) } : {})
      }
    : (ncMeta.origin_pinner || null);

  const synthesizedNcMeta = newbornContextRow ? {
    ...ncMeta,
    ...(ncPinnerObj ? { pinner: ncPinnerObj } : {}),
    ...(ncOriginPinnerObj ? { origin_pinner: ncOriginPinnerObj } : {}),
    ...(newbornContextRow.origin_creator_followers != null ? { origin_pinner_followers: Number(newbornContextRow.origin_creator_followers) } : {}),
    ...(newbornContextRow.effective_creator_followers != null ? { creator_followers: Number(newbornContextRow.effective_creator_followers) } : {}),
    ...(ncBoardName ? { board_name: ncBoardName } : {}),
    ...(ncBoardUrl ? { board_url: ncBoardUrl } : {}),
    ...(newbornContextRow.board_order_modified_at ? { board_order_modified_at: repoSafeIsoDate(newbornContextRow.board_order_modified_at) } : {}),
    ...(newbornContextRow.is_linkless ? { is_go_linkless: true } : {}),
    ...(isCarousel ? { is_carousel: true } : {}),
    ...(newbornContextRow.golden_score != null ? { newborn_golden_score: Number(newbornContextRow.golden_score) } : {}),
    ...(newbornContextRow.outlier_ratio != null ? { newborn_outlier_ratio: Number(newbornContextRow.outlier_ratio) } : {})
  } : {};

  const mergedMeta = {
    ...synthesizedNcMeta,
    ...pinMeta,
    creation_method: resolvedMethod,
    method: resolvedMethod,
    ...(mergedLinkedAnnotations.length > 0 ? { annotations_with_links: mergedLinkedAnnotations } : {})
  };

  if (pin) {
    const pinAnns = normalizeVisualAnnotations(pin.visual_annotations);
    const ncAnns = normalizeVisualAnnotations(newbornContextRow?.visual_annotations);
    return {
      ...pin,
      title: pin.title || newbornContextRow?.title || '',
      description: pin.description || newbornContextRow?.description || '',
      alt_text: pin.alt_text || newbornContextRow?.alt_text || '',
      image_url: pin.image_url || newbornContextRow?.image_url || '',
      image_signature: pin.image_signature || newbornContextRow?.image_signature || null,
      dominant_color: (pin.dominant_color && String(pin.dominant_color).toLowerCase() !== '#888888')
        ? pin.dominant_color
        : (newbornContextRow?.dominant_color || pin.dominant_color || '#888888'),
      destination_url: pin.destination_url || newbornContextRow?.destination_url || '',
      domain: pin.domain || newbornContextRow?.clean_domain || '',
      creator_username: pin.creator_username || ncCreatorUsername || '',
      board_id: pin.board_id || newbornContextRow?.board_id || null,
      board_name: pin.board_name || ncBoardName || '',
      created_at_pinterest: pin.created_at_pinterest || newbornContextRow?.created_at_pinterest || null,
      is_repin: Boolean(pin.is_repin || newbornContextRow?.is_repin),
      is_product: Boolean(pin.is_product || newbornContextRow?.is_product),
      is_video: Boolean(pin.is_video || newbornContextRow?.is_video),
      save_count: maxFiniteMetric(pin.save_count, newbornContextRow?.save_count),
      repin_count: maxFiniteMetric(pin.repin_count, newbornContextRow?.repin_count),
      comment_count: maxFiniteMetric(pin.comment_count, newbornContextRow?.comment_count) ?? 0,
      share_count: maxFiniteMetric(pin.share_count, newbornContextRow?.share_count) ?? 0,
      reaction_count: maxFiniteMetric(pin.reaction_count, newbornContextRow?.reaction_count) ?? 0,
      visual_annotations: pinAnns.length > 0 ? pinAnns : ncAnns,
      first_discovered_at: pin.first_saved_at || pin.first_discovered_at || newbornContextRow?.first_seen_at || null,
      last_scraped_at: pin.last_scraped_at || pin.last_resaved_at || pin.updated_at || newbornContextRow?.last_seen_at || newbornContextRow?.updated_at || null,
      creation_method: resolvedMethod,
      metadata: mergedMeta
    };
  }

  // Pillar 4 (newborn_candidates)-only pin: construct full canonical Universal Dossier masterRecord
  const nc = newbornContextRow;
  const ncAnns = normalizeVisualAnnotations(nc.visual_annotations);
  const firstSeenIso = repoSafeIsoDate(nc.first_seen_at);
  const lastSeenIso = repoSafeIsoDate(nc.last_seen_at || nc.updated_at || nc.first_seen_at);
  return {
    pin_id: String(nc.pin_id || cleanPinId),
    creator_username: ncCreatorUsername,
    board_id: nc.board_id || null,
    board_name: ncBoardName,
    board_slug: null,
    title: nc.title || '',
    domain: nc.clean_domain || '',
    destination_url: nc.destination_url || '',
    image_url: nc.image_url || '',
    description: nc.description || '',
    alt_text: nc.alt_text || '',
    dominant_color: nc.dominant_color || '#888888',
    visual_annotations: ncAnns,
    created_at_pinterest: nc.created_at_pinterest || null,
    first_discovered_pillar: 'newborn',
    first_discovered_at: firstSeenIso,
    first_saved_at: firstSeenIso,
    last_scraped_at: lastSeenIso,
    last_resaved_at: lastSeenIso,
    updated_at: repoSafeIsoDate(nc.updated_at || nc.last_seen_at || nc.first_seen_at),
    save_count: nc.save_count != null ? Number(nc.save_count) : 0,
    repin_count: nc.repin_count != null ? Number(nc.repin_count) : 0,
    comment_count: nc.comment_count != null ? Number(nc.comment_count) : 0,
    share_count: nc.share_count != null ? Number(nc.share_count) : 0,
    reaction_count: nc.reaction_count != null ? Number(nc.reaction_count) : 0,
    daily_save_velocity: nc.daily_save_delta != null ? Number(nc.daily_save_delta) : (nc.save_per_day != null ? Number(nc.save_per_day) : 0),
    daily_repin_velocity: nc.daily_repin_delta != null ? Number(nc.daily_repin_delta) : (nc.repin_per_day != null ? Number(nc.repin_per_day) : 0),
    delta_saves_24h: nc.daily_save_delta != null ? Number(nc.daily_save_delta) : null,
    delta_repins_24h: nc.daily_repin_delta != null ? Number(nc.daily_repin_delta) : null,
    gains_5d: null,
    gains_7d: null,
    gains_10d: null,
    gains_15d: null,
    is_product: Boolean(nc.is_product),
    is_video: Boolean(nc.is_video),
    creation_method: resolvedMethod,
    image_signature: nc.image_signature || null,
    seo_noindex_reason: null,
    is_repin: Boolean(nc.is_repin),
    canonical_pin_id: null,
    metadata: mergedMeta
  };
}

/**
 * Shared 4-query pure read loader (eliminates duplicate queries across dossier entrypoints).
 */
async function loadRawPinDossierRows(sql, cleanPinId, snapshotLimit = 30, workspaceId = null) {
  const effectiveSnapLimit = Math.max(1, Math.min(Number(snapshotLimit) || 30, 365));
  const cleanWid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0 ? Number(workspaceId) : null;
  let dbError = null;
  const captureDbErr = (err) => {
    if (!dbError && err) dbError = err;
  };

  const effectiveWatchlistWid = cleanWid || 1;
  const [pinRows, trajectoryRows, serpRows, creatorRows, trackedCampaignRows, newbornRows, watchlistRows] = await Promise.all([
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
        '{}'::jsonb AS metadata,
        COALESCE(ksp.crawled_at, ksp.updated_at) AS crawled_at,
        ksp.updated_at
      FROM keyword_serp_positions ksp
      LEFT JOIN tracked_keywords tk ON tk.id = ksp.keyword_id
      WHERE ksp.pin_id = ${cleanPinId}
      ORDER BY ksp.is_displaced ASC, ksp.rank_position ASC NULLS LAST;
    `.catch((err) => { captureDbErr(err); return []; }),
    sql`
      SELECT
        cp.id,
        cp.username,
        cp.display_name,
        cp.avatar_url,
        cp.account_type,
        cp.tracking_mode,
        cp.is_active,
        cp.monthly_reach,
        cp.delta_reach_24h,
        cp.reach_delta_7d,
        cp.profile_views,
        cp.delta_views_24h,
        cp.views_delta_7d,
        cp.total_pins,
        cp.delta_pins_24h,
        cp.pins_delta_7d,
        cp.total_boards,
        cp.delta_boards_24h,
        cp.boards_delta_7d,
        cp.follower_count,
        cp.activity_status,
        cp.last_synced_at,
        cp.metadata
      FROM competitor_profiles cp
      JOIN (
        SELECT NULLIF(LTRIM(BTRIM(creator_username), '@'), '') AS username, 1 AS priority
        FROM public.universal_master_pins
        WHERE pin_id = ${cleanPinId}
          AND creator_username IS NOT NULL
          AND btrim(creator_username) <> ''
        UNION ALL
        SELECT COALESCE(
          NULLIF(LTRIM(BTRIM(metadata->'pinner'->>'username'), '@'), ''),
          NULLIF(LTRIM(BTRIM(metadata->'origin_pinner'->>'username'), '@'), ''),
          NULLIF(LTRIM(BTRIM(metadata->'domain_official_user'->>'username'), '@'), '')
        ) AS username, 2 AS priority
        FROM public.universal_master_pins
        WHERE pin_id = ${cleanPinId}
          AND jsonb_typeof(metadata) = 'object'
        UNION ALL
        SELECT COALESCE(
          NULLIF(LTRIM(BTRIM(effective_creator_username), '@'), ''),
          NULLIF(LTRIM(BTRIM(origin_creator_username), '@'), ''),
          NULLIF(LTRIM(BTRIM(pinner_username), '@'), '')
        ) AS username, 3 AS priority
        FROM public.newborn_candidates
        WHERE pin_id = ${cleanPinId}
      ) pc ON LOWER(LTRIM(BTRIM(cp.username), '@')) = LOWER(LTRIM(BTRIM(pc.username), '@'))
      WHERE pc.username IS NOT NULL AND btrim(pc.username) <> ''
        AND COALESCE(cp.account_type, 'competitor') <> 'system'
      ORDER BY pc.priority ASC, cp.last_synced_at DESC NULLS LAST, cp.id ASC
      LIMIT 1;
    `.catch((err) => {
      console.warn(`[dossier-reader] Creator profile enrichment query warning for pin ${cleanPinId}:`, err?.message || err);
      return [];
    }),
    sql`
      WITH explicit_tracked AS (
        SELECT
          ctp.folder_id,
          COALESCE(ctp.workspace_id, kf.workspace_id, 1) AS workspace_id,
          kf.name AS folder_name,
          kf.color AS folder_color,
          ctp.source_type,
          ctp.source_ref,
          ctp.seed_query,
          ctp.added_at,
          NULL::text AS notes,
          'tracked'::text AS membership_type,
          TRUE AS can_remove
        FROM campaign_tracked_pins ctp
        JOIN keyword_folders kf ON kf.id = ctp.folder_id
        WHERE ctp.pin_id = ${cleanPinId}
          AND ctp.is_active = TRUE
          AND (${cleanWid}::int IS NULL OR COALESCE(ctp.workspace_id, kf.workspace_id, 1) = ${cleanWid})
      ),
      newborn_promoted AS (
        SELECT DISTINCT ON (nb.folder_id)
          nb.folder_id,
          COALESCE(kf.workspace_id, 1) AS workspace_id,
          kf.name AS folder_name,
          kf.color AS folder_color,
          'newborn'::text AS source_type,
          'discover_promote'::text AS source_ref,
          nb.seed_query,
          nb.added_at,
          nb.notes,
          'newborn_promoted'::text AS membership_type,
          TRUE AS can_remove
        FROM (
          SELECT
            nc.folder_id,
            nc.seed_query,
            COALESCE(nc.promoted_at, nc.updated_at, nc.first_seen_at) AS added_at,
            NULL::text AS notes,
            0 AS priority
          FROM newborn_candidates nc
          WHERE nc.pin_id = ${cleanPinId}
            AND nc.folder_id IS NOT NULL
            AND (
              nc.stage = 'promoted'
              OR EXISTS (
                SELECT 1 FROM newborn_daily_anchors nda
                WHERE nda.pin_id = nc.pin_id AND nda.is_active = TRUE
              )
            )
          UNION ALL
          SELECT
            nda.folder_id,
            nda.seed_query,
            COALESCE(nda.promoted_at, nda.updated_at) AS added_at,
            nda.notes,
            1 AS priority
          FROM newborn_daily_anchors nda
          WHERE nda.pin_id = ${cleanPinId}
            AND nda.folder_id IS NOT NULL
            AND nda.is_active = TRUE
        ) nb
        JOIN keyword_folders kf ON kf.id = nb.folder_id
        WHERE (${cleanWid}::int IS NULL OR COALESCE(kf.workspace_id, 1) = ${cleanWid})
          AND NOT EXISTS (
            SELECT 1 FROM explicit_tracked et_ex WHERE et_ex.folder_id = nb.folder_id
          )
        ORDER BY nb.folder_id ASC, nb.priority ASC, nb.added_at DESC NULLS LAST
      ),
      serp_cluster_folders AS (
        SELECT
          kf.id AS folder_id,
          COALESCE(kf.workspace_id, 1) AS workspace_id,
          kf.name AS folder_name,
          kf.color AS folder_color,
          CASE
            WHEN BOOL_OR(ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1)
              THEN 'serp'
            ELSE 'vault'
          END AS source_type,
          COUNT(DISTINCT ksp.keyword_id)::int AS keyword_count,
          MIN(COALESCE(ksp.rank_position, ksp.last_known_rank))::int AS best_rank,
          MAX(COALESCE(ksp.last_seen_at, ksp.updated_at, ksp.first_seen_at)) AS latest_seen_at
        FROM keyword_serp_positions ksp
        JOIN keyword_folder_items kfi ON kfi.keyword_id = ksp.keyword_id
        JOIN keyword_folders kf ON kf.id = kfi.folder_id
        WHERE ksp.pin_id = ${cleanPinId}
          AND ((ksp.is_displaced = FALSE AND ksp.rank_position IS NOT NULL AND ksp.rank_position >= 1) OR ksp.is_displaced = TRUE)
          AND NOT EXISTS (
            SELECT 1 FROM keyword_ignored_pins kip
            WHERE kip.keyword_id = ksp.keyword_id AND kip.pin_id = ksp.pin_id
          )
          AND (${cleanWid}::int IS NULL OR COALESCE(kf.workspace_id, 1) = ${cleanWid})
        GROUP BY kf.id, kf.workspace_id, kf.name, kf.color
      )
      SELECT
        et.folder_id,
        et.workspace_id,
        et.folder_name,
        et.folder_color,
        et.source_type,
        et.source_ref,
        et.seed_query,
        et.added_at,
        et.notes,
        et.membership_type,
        et.can_remove,
        COALESCE(scf.keyword_count, 0)::int AS keyword_count,
        scf.best_rank
      FROM explicit_tracked et
      LEFT JOIN serp_cluster_folders scf ON scf.folder_id = et.folder_id
      UNION ALL
      SELECT
        np.folder_id,
        np.workspace_id,
        np.folder_name,
        np.folder_color,
        np.source_type,
        np.source_ref,
        np.seed_query,
        np.added_at,
        np.notes,
        np.membership_type,
        np.can_remove,
        COALESCE(scf.keyword_count, 0)::int AS keyword_count,
        scf.best_rank
      FROM newborn_promoted np
      LEFT JOIN serp_cluster_folders scf ON scf.folder_id = np.folder_id
      UNION ALL
      SELECT
        scf.folder_id,
        scf.workspace_id,
        scf.folder_name,
        scf.folder_color,
        scf.source_type,
        NULL::text AS source_ref,
        NULL::text AS seed_query,
        scf.latest_seen_at AS added_at,
        NULL::text AS notes,
        'cluster_serp'::text AS membership_type,
        FALSE AS can_remove,
        scf.keyword_count,
        scf.best_rank
      FROM serp_cluster_folders scf
      WHERE NOT EXISTS (
        SELECT 1 FROM explicit_tracked et2 WHERE et2.folder_id = scf.folder_id
      )
        AND NOT EXISTS (
          SELECT 1 FROM newborn_promoted np2 WHERE np2.folder_id = scf.folder_id
        )
      ORDER BY can_remove DESC, added_at DESC NULLS LAST, folder_id ASC;
    `.catch((err) => {
      console.warn(`[dossier-reader] Campaign provenance query warning for pin ${cleanPinId}:`, err?.message || err);
      return [];
    }),
    sql`
      SELECT
        nc.pin_id,
        nc.seed_query,
        nc.stage,
        nc.qualified,
        nc.first_surface AS discovery_surface,
        nc.discovered_surfaces,
        nc.folder_id,
        nc.first_seen_at,
        nc.last_seen_at,
        nc.updated_at,
        nc.promoted_at,
        nc.title,
        nc.description,
        nc.alt_text,
        nc.image_url,
        nc.image_signature,
        nc.dominant_color,
        nc.destination_url,
        nc.clean_domain,
        nc.is_linkless,
        nc.pinner_username,
        nc.pinner_full_name,
        nc.pinner_followers,
        nc.origin_creator_username,
        nc.origin_creator_full_name,
        nc.origin_creator_followers,
        nc.effective_creator_username,
        nc.effective_creator_followers,
        nc.creator_monthly_reach,
        nc.creator_profile_views,
        nc.creator_pin_count,
        nc.is_repin,
        nc.board_id,
        nc.board_name,
        nc.board_url,
        nc.discovery_board_name,
        nc.discovery_board_url,
        nc.pin_board_name,
        nc.pin_board_url,
        nc.board_order_modified_at,
        nc.upload_provenance,
        nc.raw_creation_method,
        nc.has_ai_disclosure,
        nc.is_video,
        nc.is_carousel,
        nc.is_product,
        nc.created_at_pinterest,
        nc.age_days,
        nc.save_count,
        nc.repin_count,
        nc.comment_count,
        nc.share_count,
        nc.reaction_count,
        nc.is_hydrated,
        nc.repin_per_day,
        nc.save_per_day,
        nc.daily_repin_delta,
        nc.daily_save_delta,
        nc.golden_score,
        nc.is_golden_pin,
        nc.is_rookie_outlier,
        nc.outlier_ratio,
        nc.visual_annotations,
        nc.guided_capsules,
        nc.crossover_blueprint,
        COALESCE(nc.metadata, '{}'::jsonb) AS metadata,
        nc.save_count AS anchor_baseline_saves,
        nda.is_active AS anchor_active,
        nda.last_crawled_at AS anchor_last_crawled_at,
        nda.notes AS anchor_notes,
        nkf.name AS folder_name,
        nkf.color AS folder_color
      FROM newborn_candidates nc
      LEFT JOIN newborn_daily_anchors nda ON nda.pin_id = nc.pin_id
      LEFT JOIN keyword_folders nkf
        ON nkf.id = COALESCE(nc.folder_id, nda.folder_id)
        AND (${cleanWid}::int IS NULL OR COALESCE(nkf.workspace_id, 1) = ${cleanWid})
      WHERE nc.pin_id = ${cleanPinId}
      ORDER BY nc.promoted_at DESC NULLS LAST, nc.first_seen_at DESC NULLS LAST
      LIMIT 1;
    `.catch((err) => {
      console.warn(`[dossier-reader] Newborn provenance query warning for pin ${cleanPinId}:`, err?.message || err);
      return [];
    }),
    sql`
      SELECT id, workspace_id, entity_type, entity_key, notes, created_at
      FROM workspace_watchlist
      WHERE workspace_id = ${effectiveWatchlistWid}
        AND entity_type = 'pin'
        AND entity_key = ${cleanPinId}
      LIMIT 1;
    `.catch((err) => {
      console.warn(`[dossier-reader] Watchlist lookup warning for pin ${cleanPinId}:`, err?.message || err);
      return [];
    })
  ]);

  return {
    pin: pinRows?.[0] || null,
    trajectoryRows: Array.isArray(trajectoryRows) ? trajectoryRows : [],
    serpRows: Array.isArray(serpRows) ? serpRows : [],
    creatorProfile: creatorRows?.[0] || null,
    trackedCampaignRows: Array.isArray(trackedCampaignRows) ? trackedCampaignRows : [],
    newbornContextRow: newbornRows?.[0] || null,
    watchlistRow: watchlistRows?.[0] || null,
    workspaceId: effectiveWatchlistWid,
    dbError
  };
}

/**
 * Shared canonical dossier builder used by both `getPinDossier` and `fetchUniversalPinDossier`.
 */
function buildUnifiedDossier({ pin, trajectoryRows, serpRows, creatorProfile, trackedCampaignRows = [], newbornContextRow = null, watchlistRow = null, workspaceId = 1, dbError, cleanPinId }) {
  let masterRecord = synthesizeCanonicalMasterRecord({ pin, newbornContextRow, cleanPinId });

  const hubSerpRows = serpRows.map((k) => ({
    ...k,
    pin_id: cleanPinId,
    title: masterRecord?.title || pin?.title || '',
    domain: masterRecord?.domain || pin?.domain || '',
    destination_url: masterRecord?.destination_url || pin?.destination_url || '',
    image_url: masterRecord?.image_url || pin?.image_url || '',
    creator_username: masterRecord?.creator_username || pin?.creator_username || '',
    board_name: masterRecord?.board_name || pin?.board_name || '',
    save_count: masterRecord?.save_count ?? pin?.save_count ?? null,
    repin_count: masterRecord?.repin_count ?? pin?.repin_count ?? null,
    comment_count: masterRecord?.comment_count ?? pin?.comment_count ?? 0,
    share_count: masterRecord?.share_count ?? pin?.share_count ?? 0,
    reaction_count: masterRecord?.reaction_count ?? pin?.reaction_count ?? 0,
    daily_save_velocity: masterRecord?.daily_save_velocity ?? pin?.daily_save_velocity ?? null,
    daily_repin_velocity: masterRecord?.daily_repin_velocity ?? pin?.daily_repin_velocity ?? null,
    dominant_color: masterRecord?.dominant_color || pin?.dominant_color || null,
    visual_annotations: Array.isArray(masterRecord?.visual_annotations) ? masterRecord.visual_annotations : [],
    creation_method: masterRecord?.creation_method || pin?.creation_method || null,
    created_at_pinterest: masterRecord?.created_at_pinterest || pin?.created_at_pinterest || null,
    competitor_id: creatorProfile?.id ?? null,
    competitor_username: creatorProfile?.username ?? null,
    competitor_display_name: creatorProfile?.display_name ?? null,
    competitor_active: creatorProfile?.is_active ?? null
  }));

  const topHubMeta = normalizeMetadata(hubSerpRows[0]?.metadata);
  const masterMetaObj = normalizeMetadata(masterRecord?.metadata);

  const masterTags = normalizeVisualAnnotations(masterRecord?.visual_annotations);
  const unionSet = new Set();
  for (const tag of masterTags) {
    if (tag && typeof tag === 'string' && tag.trim()) unionSet.add(tag.trim());
  }
  // Only fall back to Pillar 4 / legacy metadata / SERP row annotations when primary master has none,
  // so fresh Live Deep Sync / annotations_with_links updates immediately replace older tags cleanly.
  if (unionSet.size === 0) {
    for (const tag of normalizeVisualAnnotations(newbornContextRow?.visual_annotations)) {
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
  }

  if (!masterRecord) {
    if (hubSerpRows.length > 0 && (hubSerpRows[0].title || hubSerpRows[0].image_url || Number(hubSerpRows[0].save_count) > 0)) {
      const topRow = hubSerpRows[0];
      const resolvedHubMethod = resolveBestCanonicalMethod([
        topRow.creation_method,
        topHubMeta.creation_method,
        topHubMeta.method
      ], { isHydrated: true });
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
    const resolvedBestMethod = resolveBestCanonicalMethod([
      masterRecord?.creation_method,
      masterMetaObj.creation_method,
      masterMetaObj.method,
      newbornContextRow?.raw_creation_method,
      hubSerpRows[0]?.creation_method,
      topHubMeta.creation_method,
      topHubMeta.method
    ], { isHydrated: true, isCarousel: Boolean(masterMetaObj.is_carousel || newbornContextRow?.is_carousel) });
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
    const masterCrawlIso = formatUtcDate(masterRecord.last_scraped_at || masterRecord.updated_at);
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

  if (chronoDays[0]) {
    if (chronoDays[0].is_hydration_jump === undefined) {
      chronoDays[0].is_hydration_jump = false;
    }
    chronoDays[0].is_baseline = true;
    chronoDays[0].daily_save_velocity = 0;
    chronoDays[0].window_24h_velocity = 0;
    chronoDays[0].window_24h_delta = 0;
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
    ? (() => {
        const monthlyReach = creatorProfile.monthly_reach != null ? Number(creatorProfile.monthly_reach) : null;
        const profileViews = creatorProfile.profile_views != null ? Number(creatorProfile.profile_views) : null;
        const totalPins = creatorProfile.total_pins != null ? Number(creatorProfile.total_pins) : null;
        const totalBoards = creatorProfile.total_boards != null ? Number(creatorProfile.total_boards) : null;
        const followerCount = creatorProfile.follower_count != null ? Number(creatorProfile.follower_count) : null;
        const lastSyncedAt = repoSafeIsoDate(creatorProfile.last_synced_at);
        return {
          id: creatorProfile.id,
          competitor_id: creatorProfile.id,
          username: creatorProfile.username,
          competitor_username: creatorProfile.username,
          display_name: creatorProfile.display_name || null,
          avatar_url: creatorProfile.avatar_url || null,
          account_type: creatorProfile.account_type || 'competitor',
          tracking_mode: creatorProfile.tracking_mode || 'pulse_only',
          is_active: creatorProfile.is_active !== false,
          competitor_active: creatorProfile.is_active !== false,
          monthly_reach: monthlyReach,
          total_audience: monthlyReach,
          profile_views: profileViews,
          impressions: profileViews,
          total_pins: totalPins,
          total_boards: totalBoards,
          follower_count: followerCount,
          followers: followerCount,
          delta_reach_24h: creatorProfile.delta_reach_24h != null ? Number(creatorProfile.delta_reach_24h) : 0,
          reach_delta_7d: creatorProfile.reach_delta_7d != null ? Number(creatorProfile.reach_delta_7d) : 0,
          delta_views_24h: creatorProfile.delta_views_24h != null ? Number(creatorProfile.delta_views_24h) : 0,
          views_delta_7d: creatorProfile.views_delta_7d != null ? Number(creatorProfile.views_delta_7d) : 0,
          delta_pins_24h: creatorProfile.delta_pins_24h != null ? Number(creatorProfile.delta_pins_24h) : 0,
          pins_delta_7d: creatorProfile.pins_delta_7d != null ? Number(creatorProfile.pins_delta_7d) : 0,
          delta_boards_24h: creatorProfile.delta_boards_24h != null ? Number(creatorProfile.delta_boards_24h) : 0,
          boards_delta_7d: creatorProfile.boards_delta_7d != null ? Number(creatorProfile.boards_delta_7d) : 0,
          activity_status: creatorProfile.activity_status || null,
          last_synced_at: lastSyncedAt,
          is_synced: Boolean(lastSyncedAt),
          metadata: creatorProfile.metadata || null
        };
      })()
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

  const resolvedCreationMethod = resolveBestCanonicalMethod([
    masterRecord?.creation_method,
    masterMetaObj.creation_method,
    masterMetaObj.method,
    newbornContextRow?.raw_creation_method,
    snapMeta.creation_method,
    snapMeta.method,
    hubSerpRows[0]?.creation_method,
    topHubMeta.creation_method,
    topHubMeta.method
  ], { isHydrated: true, isCarousel: Boolean(snapMeta.is_carousel || newbornContextRow?.is_carousel) });

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
    (masterTags.length > 0
      ? masterTags
      : normalizeVisualAnnotations(newbornContextRow?.visual_annotations || snapMeta.visual_annotations || hubSerpRows[0]?.metadata?.visual_annotations))
      .map(t => String(t || '').trim())
      .filter(Boolean)
  );
  const linkedAnnotationLookup = new Map();
  const allLinkedAnnotations = mergeLinkedAnnotations(
    snapMeta.annotations_with_links,
    newbornContextRow?.visual_annotations,
    pin?.visual_annotations
  );
  for (const item of allLinkedAnnotations) {
    if (item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim()) {
      linkedAnnotationLookup.set(item.name.trim().toLowerCase(), {
        idea_id: item.idea_id || null,
        url: item.url || null
      });
    }
  }

  const detailedAnnotations = finalVisualAnnotations.map(tag => {
    const linked = linkedAnnotationLookup.get(String(tag || '').trim().toLowerCase()) || null;
    const isLive = latestLiveAnnotations.size > 0 ? latestLiveAnnotations.has(tag) : true;
    return {
      name: tag,
      is_live: isLive,
      status: isLive ? 'live' : 'historical',
      label: isLive ? 'Live Active' : 'Historical Crawl',
      ...(linked?.idea_id ? { idea_id: linked.idea_id } : {}),
      ...(linked?.url ? { url: linked.url } : {})
    };
  });

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

  const isWatchlisted = Boolean(watchlistRow && watchlistRow.id != null);
  const watchlistItemId = isWatchlisted ? Number(watchlistRow.id) : null;

  const dossierResult = {
    success: true,
    pin_id: cleanPinId,
    is_degraded: Boolean(dbError),
    is_watchlisted: isWatchlisted,
    watchlist_item_id: watchlistItemId,
    watchlist: {
      is_watchlisted: isWatchlisted,
      item_id: watchlistItemId,
      workspace_id: watchlistRow?.workspace_id != null ? Number(watchlistRow.workspace_id) : (Number(workspaceId) || 1)
    },
    first_saved_at: firstSavedAt,
    last_resaved_at: lastResavedAt,
    creative: {
      title: decodeHtmlEntities(masterRecord?.title || '') || `Pin ${cleanPinId}`,
      description: decodeHtmlEntities(masterRecord?.description || ''),
      alt_text: decodeHtmlEntities(masterRecord?.alt_text || ''),
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
      daily_repin_velocity: (() => {
        const distinctDays = new Set(dailyTrajectory.map(d => String(d.snapshot_date || '').slice(0, 10)).filter(Boolean)).size;
        if (distinctDays <= 1) return 0;
        return Number(masterRecord?.daily_repin_velocity || hubSerpRows[0]?.daily_repin_velocity || dailyTrajectory[0]?.daily_repin_velocity || 0);
      })(),
      comment_count: Number(masterRecord?.comment_count || dailyTrajectory[0]?.comment_count || hubSerpRows[0]?.comment_count || 0),
      share_count: Number(masterRecord?.share_count || dailyTrajectory[0]?.share_count || hubSerpRows[0]?.share_count || 0),
      reaction_count: resolvedReactionCount,
      distinct_snapshot_days: new Set(dailyTrajectory.map(d => String(d.snapshot_date || '').slice(0, 10)).filter(Boolean)).size,
      is_day1_baseline: new Set(dailyTrajectory.map(d => String(d.snapshot_date || '').slice(0, 10)).filter(Boolean)).size <= 1,
      daily_save_velocity: (() => {
        const distinctDays = new Set(dailyTrajectory.map(d => String(d.snapshot_date || '').slice(0, 10)).filter(Boolean)).size;
        if (distinctDays <= 1) return 0;
        const trajVel24h = Number(dailyTrajectory[0]?.window_24h_velocity ?? dailyTrajectory[0]?.daily_save_velocity ?? 0);
        const masterOrHubVel = Number(masterRecord?.daily_save_velocity || hubSerpRows[0]?.daily_save_velocity || 0);
        const latestSnapDateStr = dailyTrajectory[0]?.snapshot_date ? String(dailyTrajectory[0].snapshot_date).slice(0, 10) : null;
        const latestSnapMs = latestSnapDateStr ? new Date(`${latestSnapDateStr}T00:00:00Z`).getTime() : NaN;
        const refNowRaw = masterRecord?.updated_at || hubSerpRows[0]?.crawled_at || hubSerpRows[0]?.updated_at || null;
        const refNowMs = refNowRaw ? new Date(refNowRaw).getTime() : Date.now();
        const isTrajectoryStale24h = Number.isFinite(latestSnapMs) && Number.isFinite(refNowMs) && ((refNowMs - latestSnapMs) / 86400000) > 2.5 && masterOrHubVel <= 0;
        if (isTrajectoryStale24h) return 0;
        if (trajVel24h > 0) return trajVel24h;
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
      delta_saves_24h: (new Set(dailyTrajectory.map(d => String(d.snapshot_date || '').slice(0, 10)).filter(Boolean)).size <= 1)
        ? null
        : Number(masterRecord?.delta_saves_24h || 0),
      delta_repins_24h: (new Set(dailyTrajectory.map(d => String(d.snapshot_date || '').slice(0, 10)).filter(Boolean)).size <= 1)
        ? null
        : Number(masterRecord?.delta_repins_24h || 0),
      gains_5d: masterRecord?.gains_5d ?? null,
      gains_7d: masterRecord?.gains_7d ?? null,
      gains_10d: masterRecord?.gains_10d ?? null,
      gains_15d: masterRecord?.gains_15d ?? null,
      is_deleted: Boolean(masterRecord?.metadata?.is_deleted || (masterRecord?.metadata?.status === 'archived_404')),
      metadata: snapMeta
    },
    algorithmic_intelligence: algorithmicIntelligence,
    ...(() => {
      const normalizedCampaigns = (Array.isArray(trackedCampaignRows) ? trackedCampaignRows : []).map((row) => {
        const membershipType = String(row.membership_type || 'tracked').trim().toLowerCase();
        const canRemove = row.can_remove !== undefined && row.can_remove !== null
          ? Boolean(row.can_remove)
          : membershipType !== 'cluster_serp';
        const seedQuery = row.seed_query ? String(row.seed_query).trim() : null;
        return {
          folder_id: Number(row.folder_id),
          folder_name: row.folder_name || `Campaign #${row.folder_id}`,
          folder_color: row.folder_color || null,
          source_type: String(row.source_type || 'manual').trim().toLowerCase(),
          source_query: seedQuery,
          membership_type: membershipType,
          can_remove: canRemove,
          keyword_count: row.keyword_count != null ? Number(row.keyword_count) : 0,
          best_rank: row.best_rank != null ? Number(row.best_rank) : null,
          seed_query: seedQuery,
          added_at: repoSafeIsoDate(row.added_at),
          notes: row.notes || null
        };
      });
      return {
        tracked_campaigns: normalizedCampaigns,
        campaigns: normalizedCampaigns
      };
    })(),
    newborn_context: newbornContextRow ? {
      pin_id: String(newbornContextRow.pin_id || cleanPinId),
      seed_query: newbornContextRow.seed_query ? String(newbornContextRow.seed_query).trim() : null,
      stage: String(newbornContextRow.stage || 'discovered').trim().toLowerCase(),
      qualified: newbornContextRow.qualified != null ? Boolean(newbornContextRow.qualified) : null,
      discovery_surface: newbornContextRow.discovery_surface || null,
      discovered_surfaces: Array.isArray(newbornContextRow.discovered_surfaces) ? newbornContextRow.discovered_surfaces : [],
      folder_id: newbornContextRow.folder_id != null ? Number(newbornContextRow.folder_id) : null,
      folder_name: newbornContextRow.folder_name ? String(newbornContextRow.folder_name).trim() : null,
      folder_color: newbornContextRow.folder_color || null,
      first_seen_at: repoSafeIsoDate(newbornContextRow.first_seen_at),
      promoted_at: repoSafeIsoDate(newbornContextRow.promoted_at),
      anchor_active: Boolean(newbornContextRow.anchor_active),
      anchor_baseline_saves: newbornContextRow.anchor_baseline_saves != null ? Number(newbornContextRow.anchor_baseline_saves) : null,
      anchor_last_crawled_at: repoSafeIsoDate(newbornContextRow.anchor_last_crawled_at),
      golden_score: newbornContextRow.golden_score != null ? Number(newbornContextRow.golden_score) : null,
      is_golden_pin: Boolean(newbornContextRow.is_golden_pin),
      is_rookie_outlier: Boolean(newbornContextRow.is_rookie_outlier),
      outlier_ratio: newbornContextRow.outlier_ratio != null ? Number(newbornContextRow.outlier_ratio) : null,
      upload_provenance: newbornContextRow.upload_provenance || null,
      raw_creation_method: newbornContextRow.raw_creation_method
        ? normalizeCanonicalCreationMethod(newbornContextRow.raw_creation_method, { isHydrated: Boolean(newbornContextRow.is_hydrated) })
        : null,
      creator_monthly_reach: newbornContextRow.creator_monthly_reach != null ? Number(newbornContextRow.creator_monthly_reach) : null,
      creator_profile_views: newbornContextRow.creator_profile_views != null ? Number(newbornContextRow.creator_profile_views) : null,
      creator_pin_count: newbornContextRow.creator_pin_count != null ? Number(newbornContextRow.creator_pin_count) : null,
      effective_creator_followers: newbornContextRow.effective_creator_followers != null ? Number(newbornContextRow.effective_creator_followers) : null
    } : null,
    pillar_1_creator_context: {
      creator_username: creatorUsername,
      creator_url: creatorUsername ? `https://www.pinterest.com/${creatorUsername}/` : null,
      board_name: decodeHtmlEntities(boardName || ''),
      board_slug: boardSlug,
      board_url: snapMeta.board_url || ((creatorUsername && boardSlug) ? `https://www.pinterest.com/${creatorUsername}/${boardSlug}/` : null),
      is_tracked_competitor: Boolean(competitorInfo),
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

  if (dossierResult.creative.is_day1_baseline && Array.isArray(dossierResult.daily_trajectory)) {
    for (const dayRow of dossierResult.daily_trajectory) {
      dayRow.daily_save_velocity = 0;
      dayRow.window_24h_velocity = null;
      dayRow.window_24h_delta = null;
    }
  }

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
export async function getPinDossier(sql, pinId, { snapshotLimit = 30, workspaceId = null } = {}) {
  const cleanPinId = String(pinId || '').trim();
  if (!cleanPinId || !sql) return null;

  const raw = await loadRawPinDossierRows(sql, cleanPinId, snapshotLimit, workspaceId);
  if (raw.dbError) throw raw.dbError;
  if (!raw.pin && !raw.newbornContextRow) return null;

  const built = buildUnifiedDossier({ ...raw, cleanPinId });
  return built?.notFound ? null : built;
}

/**
 * 6. Unified Universal 4-Pillar Pin Dossier (`fetchUniversalPinDossier`)
 * Single-DB pure read-only dossier retrieval returning unified dossier or structured error envelope.
 */
export async function fetchUniversalPinDossier({ sql = null, hubSql = null, pinId, workspaceId = null } = {}) {
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

  const raw = await loadRawPinDossierRows(dbSql, cleanPinId, 90, workspaceId);
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
