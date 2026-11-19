/**
 * Global 24-Hour Algorithmic Pulse & Multi-Dimensional Crossover Service
 *
 * Centerpiece daily command intelligence engine:
 * 1. Executes 5 ultra-fast, zero-Cartesian Hub queries concurrently via Promise.all.
 * 2. Strictly obeys Central Hub Skeletal Compaction (no description/alt_text/seo_title on keyword_serp_positions).
 * 3. In-memory N-Gram Set Mining for 1-Gram, 2-Pairs (A+B), and 3-Triplets (A+B+C) with 10-annotation cap per pin.
 * 4. Guided Search Capsules cross-keyword bridge detection across 1,398 capsules.
 * 5. Breakout Creators with historical snapshot delta fallbacks and Top 3 Driver Pins.
 * 6. Multi-Keyword / Cross-Folder Pixie Bridge Pins and 24h SERP Vacuum opportunities.
 * 7. Hidden Gems telemetry (Winning Boards, Vacuum Hijacks, Creation Methods, Color Palette, Arbitrage Domains).
 * 8. One-Click 5-Source Scientific Pin Blueprint Data Synthesizer.
 * 9. Process-local LRU Caching (max 25, 120s TTL) with 15s force-refresh cooldown and in-flight stampede guard.
 *
 * // [INVARIANT: CENTRAL-HUB-SKELETAL-COMPACTION]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: FOLDER-SINGLE-PASS-CTE]
 */

import {
  isSyntheticGarbageTitle,
  CORRUPTED_OBJECT_STRING_RE,
  isAggregatedClusterPin
} from '../../domain/pin-intelligence.mjs';
import {
  computeAnscombeInflectionScore
} from '../../lib/math.mjs';
import { TtlSingleflightCache } from '../../lib/ttl-cache.mjs';

// Bounded Process-Local LRU Cache (max 25 entries, 120s TTL) with Epoch Invalidation
export const PULSE_MEMORY_CACHE_MAX = 25;
export const PULSE_MEMORY_TTL_MS = 120_000;
export const pulseMemoryCache = new TtlSingleflightCache({
  maxEntries: PULSE_MEMORY_CACHE_MAX,
  defaultTtlMs: PULSE_MEMORY_TTL_MS
});

// Per-key force-refresh cooldown (15s cooldown)
export const PULSE_FORCE_REFRESH_COOLDOWN_MS = 15_000;
export const pulseForceRefreshCooldown = new TtlSingleflightCache({
  maxEntries: 200,
  defaultTtlMs: PULSE_FORCE_REFRESH_COOLDOWN_MS
});

// In-flight deduplication map backed by pulseMemoryCache
export const inflightPulse = pulseMemoryCache.inflight;

const tagNormCache = new Map();
function getNormalizedTag(label) {
  let norm = tagNormCache.get(label);
  if (norm === undefined) {
    norm = label.toLowerCase().replace(/\s+/g, ' ');
    if (tagNormCache.size < 2000) tagNormCache.set(label, norm);
  }
  return norm;
}

const fastParseIsoDateMs = (val) => {
  if (!val) return NaN;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
  if (typeof val !== 'string') return NaN;
  if (val.length >= 10 && val.charCodeAt(4) === 45 && val.charCodeAt(7) === 45) {
    const y = +val.slice(0, 4);
    const m = (+val.slice(5, 7)) - 1;
    const d = +val.slice(8, 10);
    const t = Date.UTC(y, m, d);
    if (!Number.isNaN(t)) return t;
  }
  return Date.parse(val);
};

export function getCanonicalCreativeKey(p) {
  if (!p) return '';
  if (p._cKey !== undefined) return p._cKey;
  const t = (p.title || '').trim().toLowerCase();
  const d = (p.domain || '').trim().toLowerCase();
  let key;
  if (t && t.length >= 8 && d && d !== 'uploaded by user' && !d.includes('pinterest.')) {
    key = `td:${d}:${t}`;
  } else if (p.image_url) {
    const url = String(p.image_url);
    const slashIdx = url.lastIndexOf('/');
    key = slashIdx >= 0 ? `img:${url.slice(slashIdx + 1).toLowerCase()}` : `img:${url}`;
  } else if (t && d) {
    key = `td:${d}:${t}`;
  } else {
    key = `pid:${p.pin_id || ''}`;
  }
  p._cKey = key;
  return key;
}

/**
 * Normalizes and extracts clean visual annotations from polymorphic shapes:
 * - Plain string arrays: ["Dinner Ideas", "Quick Meals"]
 * - Object arrays: [{"name": "Summer Outfits", "idea_id": "123"}]
 * - Stringified JSON strings
 * - Wrapped objects: { tags: [...] }
 * Deduplicates intra-pin tags, filters labels < 2 chars, and preserves { norm, display } structure.
 */
export function extractCleanAnnotations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw) && raw._clean) return raw._clean;
  let arr = raw;
  if (typeof arr === 'string' && arr.trim()) {
    try {
      arr = JSON.parse(arr);
    } catch (_) {
      arr = arr.split(',').map(s => s.trim());
    }
  }
  if (arr && typeof arr === 'object' && !Array.isArray(arr) && Array.isArray(arr.tags)) {
    arr = arr.tags;
  }
  if (!Array.isArray(arr)) return [];
  if (arr._clean) return arr._clean;
  if (arr.length === 0) return [];
  if (typeof arr[0] === 'object' && arr[0]?.norm && arr[0]?.display) {
    return arr.filter((entry) => {
      const disp = String(entry?.display || '').trim();
      const norm = String(entry?.norm || '').trim().toLowerCase();
      return disp.length >= 2 && norm.length >= 2 && !CORRUPTED_OBJECT_STRING_RE.test(disp) && !CORRUPTED_OBJECT_STRING_RE.test(norm) && norm !== 'object object';
    });
  }

  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const label = typeof item === 'string'
      ? item.trim()
      : String(item?.display || item?.name || item?.tag || item?.label || item?.display_label || item?.term || item?.norm || '').trim();
    if (!label || label.length < 2 || CORRUPTED_OBJECT_STRING_RE.test(label)) continue;
    const norm = label.toLowerCase().replace(/\s+/g, ' ');
    if (!norm || norm.length < 2 || norm === 'object object') continue;
    let duplicate = false;
    for (let j = 0; j < result.length; j++) {
      if (result[j].norm === norm) { duplicate = true; break; }
    }
    if (!duplicate) {
      result.push({ norm, display: label });
    }
  }
  try { arr._clean = result; } catch (_) {}
  return result;
}

/**
 * Invalidate in-memory pulse caches with epoch advancement so pre-invalidation
 * in-flight queries never write stale results back into `pulseMemoryCache`.
 */
export async function invalidateGlobalPulseCache(_env = null, _ctx = null) {
  pulseMemoryCache.invalidate();
  pulseForceRefreshCooldown.invalidate();
}

/**
 * Numeric Sanitization Helpers (Anti-NaN Shield)
 * Enforces Rule 3 (Numeric & Object Cast Hygiene): Math.max(5, NaN) === NaN.
 */
export const safeNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function isPlaceholderColor(hex) {
  if (!hex || typeof hex !== 'string') return true;
  const clean = hex.trim().toLowerCase();
  return ['', '#888888', '#1e1e24', '#000000', '#18181b', 'none', 'null', 'undefined'].includes(clean);
}

export const safeNullableNum = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Inline fast numeric validator (Anti-NaN Shield, Rule 3)
 */
export const fastNum = (v) => {
  if (typeof v === 'number') return (v === v && v !== Infinity && v !== -Infinity) ? v : 0;
  if (!v) return 0;
  const n = +v;
  return (n === n && n !== Infinity && n !== -Infinity) ? n : 0;
};

/**
 * Static module-level comparators for high-frequency sorting (zero closure allocation)
 */
const tagNormAscComparator = (a, b) => (a.norm < b.norm ? -1 : (a.norm > b.norm ? 1 : 0));

const activePinSortComparator = (a, b) => {
  if (b.is_hydrated_int !== a.is_hydrated_int) {
    return b.is_hydrated_int - a.is_hydrated_int;
  }
  if (b.effective_24h_gain !== a.effective_24h_gain) {
    return b.effective_24h_gain - a.effective_24h_gain;
  }
  if (b.effective_24h_momentum !== a.effective_24h_momentum) {
    return b.effective_24h_momentum - a.effective_24h_momentum;
  }
  if (b.daily_save_velocity !== a.daily_save_velocity) {
    return b.daily_save_velocity - a.daily_save_velocity;
  }
  return b.save_count - a.save_count;
};

const gainThenCountDescComparator = (a, b) => {
  if (b.total_24h_gain !== a.total_24h_gain) return b.total_24h_gain - a.total_24h_gain;
  return b.pin_count - a.pin_count;
};

const capsuleGroupSortComparator = (a, b) => {
  if (b.keyword_count !== a.keyword_count) return b.keyword_count - a.keyword_count;
  if (b.cross_serp_velocity !== a.cross_serp_velocity) return b.cross_serp_velocity - a.cross_serp_velocity;
  return b.max_score - a.max_score;
};

import {
  queryActiveSerp,
  queryVaultAndVacuum,
  queryViralCreatorPins,
  queryGuidedCapsules,
  queryBreakoutCreators,
  queryWinnersAndDomains,
  queryKPIs
} from './pulse-queries.mjs';
export {
  queryActiveSerp,
  queryVaultAndVacuum,
  queryViralCreatorPins,
  queryGuidedCapsules,
  queryBreakoutCreators,
  queryWinnersAndDomains,
  queryKPIs
};


/**
 * Merges and ratchets a pin row into pinMap across Active SERP, Displaced Vault, and Creator Viral feeds.
 * Ensures highest save_count, velocities, longest non-synthetic title, alt_text, description, and unioned annotations.
 */
function mergePinIntoMap(pinMap, row, sourceTag, keywordFoldersMap = null) {
  const pid = String(row.pin_id);

  if (row.created_at_pinterest instanceof Date) {
    row.created_at_pinterest = row.created_at_pinterest.toISOString();
  }

  const rawSaves = row.save_count ?? row.saves;
  const rowSaves = (typeof rawSaves === 'number') ? rawSaves : fastNum(rawSaves);
  const rawRepins = row.repin_count ?? row.repins;
  const rowRepins = (typeof rawRepins === 'number') ? rawRepins : fastNum(rawRepins);
  const rawVel = row.daily_save_velocity ?? row.velocity;
  const rowVel = (typeof rawVel === 'number') ? rawVel : fastNum(rawVel);
  const rowDeltaSaves = (typeof row.delta_saves_24h === 'number') ? row.delta_saves_24h : fastNum(row.delta_saves_24h);
  const rawDeltaRepins = (typeof row.delta_repins_24h === 'number') ? row.delta_repins_24h : fastNum(row.delta_repins_24h);
  let rowDeltaRepins = rawDeltaRepins;
  // [INVARIANT: ANTI-HYDRATION-SPIKE-REPINS]
  // Protect against unhydrated 0-repin or skeleton repin baselines jumping to full lifetime repins
  const isSkeletonRepinJump =
    (rowRepins >= 15 && rowDeltaRepins >= rowRepins && rowVel === 0 && rowDeltaSaves === 0) ||
    (
      rowRepins >= 200 &&
      rowDeltaRepins >= 150 &&
      (rowRepins - rowDeltaRepins) <= Math.max(60, rowRepins * 0.05) &&
      rowVel < rowDeltaRepins * 0.15 &&
      rowDeltaSaves < rowDeltaRepins * 0.15
    );
  if (isSkeletonRepinJump) {
    rowDeltaRepins = 0;
  }

  const rowGains5d = (typeof row.gains_5d === 'number') ? row.gains_5d : (row.gains_5d ? fastNum(row.gains_5d) : 0);
  const rowGains7d = (typeof row.gains_7d === 'number') ? row.gains_7d : (row.gains_7d ? fastNum(row.gains_7d) : 0);
  const rowGains10d = (typeof row.gains_10d === 'number') ? row.gains_10d : (row.gains_10d ? fastNum(row.gains_10d) : 0);
  const rowGains15d = (typeof row.gains_15d === 'number') ? row.gains_15d : (row.gains_15d ? fastNum(row.gains_15d) : 0);
  const rowUrlGlobalSaves = (typeof row.url_global_saves === 'number') ? row.url_global_saves : (row.url_global_saves ? fastNum(row.url_global_saves) : 0);

  const rawAnns = row.visual_annotations || row.annotations;
  const rowCleanAnns = (rawAnns && rawAnns.length > 0) ? extractCleanAnnotations(rawAnns) : null;

  let p = pinMap.get(pid);
  if (!p) {
    p = {
      pin_id: pid,
      title: row.title || '',
      domain: row.domain || '',
      destination_url: row.destination_url || row.link || '',
      image_url: row.image_url || '',
      creator_username: row.creator_username || row.account_username || '',
      board_name: row.board_name || '',
      dominant_color: row.dominant_color || '#888888',
      save_count: rowSaves,
      repin_count: rowRepins,
      daily_save_velocity: rowVel,
      delta_saves_24h: rowDeltaSaves,
      delta_repins_24h: rowDeltaRepins,
      gains_5d: rowGains5d,
      gains_7d: rowGains7d,
      gains_10d: rowGains10d,
      gains_15d: rowGains15d,
      url_global_saves: rowUrlGlobalSaves,
      description: row.description || '',
      alt_text: row.alt_text || '',
      cleanAnnotations: rowCleanAnns || [],
      created_at_pinterest: row.created_at_pinterest || null,
      creation_method: row.creation_method || 'pinterest_platform',
      crawled_at: row.crawled_at || null,
      keywords: [],
      folderList: [],
      sources: [sourceTag],
      best_rank: safeNullableNum(row.rank_position) ?? safeNullableNum(row.last_known_rank),
      best_prev_rank: safeNullableNum(row.prev_rank_position)
    };
    pinMap.set(pid, p);
  } else {
    if (!p.sources.includes(sourceTag)) {
      p.sources.push(sourceTag);
    }
    // Ratchet telemetry
    if (rowSaves > p.save_count) p.save_count = rowSaves;
    if (rowRepins > p.repin_count) p.repin_count = rowRepins;
    if (rowVel > p.daily_save_velocity) p.daily_save_velocity = rowVel;
    if (rowDeltaSaves > p.delta_saves_24h) p.delta_saves_24h = rowDeltaSaves;
    const isPrimaryPin = p.sources.includes('active_serp') || p.sources.includes('vault_surge');
    const isIncomingSecondary = sourceTag === 'creator_feed' || sourceTag === 'pinarchive_winner';
    if (rowDeltaRepins > p.delta_repins_24h && !(isPrimaryPin && isIncomingSecondary)) {
      p.delta_repins_24h = rowDeltaRepins;
    }
    if (rowGains5d > p.gains_5d) p.gains_5d = rowGains5d;
    if (rowGains7d > p.gains_7d) p.gains_7d = rowGains7d;
    if (rowGains10d > p.gains_10d) p.gains_10d = rowGains10d;
    if (rowGains15d > p.gains_15d) p.gains_15d = rowGains15d;
    if (rowUrlGlobalSaves > p.url_global_saves) p.url_global_saves = rowUrlGlobalSaves;

    // Prefer longest, non-empty, non-synthetic title
    if ((!p.title || isSyntheticGarbageTitle(p.title)) && row.title && !isSyntheticGarbageTitle(row.title)) {
      p.title = row.title;
    } else if (row.title && !isSyntheticGarbageTitle(row.title) && row.title.length > (p.title || '').length) {
      p.title = row.title;
    }

    if (!p.image_url && row.image_url) p.image_url = row.image_url;
    if (!p.domain && row.domain) p.domain = row.domain;
    if (!p.destination_url && row.destination_url) p.destination_url = row.destination_url;
    if (!p.creator_username && row.creator_username) p.creator_username = row.creator_username;
    if (!p.board_name && row.board_name) p.board_name = row.board_name;
    if (!p.description && row.description) p.description = row.description;
    else if (row.description && row.description.length > (p.description || '').length) p.description = row.description;
    if (!p.alt_text && row.alt_text) p.alt_text = row.alt_text;
    else if (row.alt_text && row.alt_text.length > (p.alt_text || '').length) p.alt_text = row.alt_text;

    if (p.dominant_color === '#888888' && row.dominant_color && row.dominant_color !== '#888888') {
      p.dominant_color = row.dominant_color;
    }

    if (!p.created_at_pinterest && row.created_at_pinterest) {
      p.created_at_pinterest = row.created_at_pinterest;
    }
    if (p.created_at_pinterest instanceof Date) {
      p.created_at_pinterest = p.created_at_pinterest.toISOString();
    }

    // Union clean annotations (zero Set allocation)
    if (rowCleanAnns && rowCleanAnns.length > 0) {
      for (let i = 0; i < rowCleanAnns.length; i++) {
        const ann = rowCleanAnns[i];
        let exists = false;
        for (let j = 0; j < p.cleanAnnotations.length; j++) {
          if (p.cleanAnnotations[j].norm === ann.norm) { exists = true; break; }
        }
        if (!exists) {
          p.cleanAnnotations.push(ann);
        }
      }
    }
  }

  const kid = row.keyword_id ? fastNum(row.keyword_id) : null;
  const fList = (Array.isArray(row.folders) && row.folders.length > 0)
    ? row.folders
    : (kid && keywordFoldersMap?.get(kid)) || null;
  if (fList && fList.length > 0) {
    for (let i = 0; i < fList.length; i++) {
      const f = fList[i];
      const fid = safeNullableNum(f?.folder_id);
      if (fid != null) {
        let seenFolder = false;
        for (let fi = 0; fi < p.folderList.length; fi++) {
          if (p.folderList[fi].folder_id === fid) { seenFolder = true; break; }
        }
        if (!seenFolder) {
          p.folderList.push(f);
        }
      }
    }
  }

  if (row.keyword_id && row.keyword_text) {
    let existingKw = null;
    for (let i = 0; i < p.keywords.length; i++) {
      if (p.keywords[i].keyword_id === kid) {
        existingKw = p.keywords[i];
        break;
      }
    }
    const rp = safeNullableNum(row.rank_position) ?? safeNullableNum(row.last_known_rank);
    const prp = safeNullableNum(row.prev_rank_position);
    const folderName = (fList && fList.length > 0) ? (fList[0]?.folder_name || '') : '';
    if (!existingKw) {
      p.keywords.push({
        keyword_id: kid,
        keyword_text: row.keyword_text || '',
        keyword_category: row.keyword_category || 'General',
        rank_position: rp,
        prev_rank_position: prp,
        folder_name: folderName
      });
    } else if (!existingKw.folder_name && folderName) {
      existingKw.folder_name = folderName;
    }
    if (rp != null) {
      if (p.best_rank === null || rp < p.best_rank) p.best_rank = rp;
    }
    if (prp != null) {
      if (p.best_prev_rank === null || prp < p.best_prev_rank) p.best_prev_rank = prp;
    }
  }

  return p;
}

/**
 * Main Service Function: getGlobal24hPulseService
 */
export async function getGlobal24hPulseService(sql, env, options = {}) {
  const folderId = options.folderId || options.folder_id || 'all';
  const windowParam = String(options.window || '24h').toLowerCase();
  const forceRefresh = Boolean(options.forceRefresh || options.force_refresh);
  const minAudience = Number(options.minAudience || options.min_audience || 0);
  const ctx = options.ctx || null;
  const bypassCache = Boolean(options.bypassCache || options.skipCache);
  const testId = options.testId ? String(options.testId).trim() : '';

  const parsedFolderId = (folderId && folderId !== 'all') ? Number(folderId) : null;
  const folderIdNum = Number.isFinite(parsedFolderId) ? parsedFolderId : null;
  const cacheKey = options.cacheKey || (
    testId
      ? `pulse:${folderId || 'all'}:${windowParam}:${minAudience}:${testId}`
      : `pulse:${folderId || 'all'}:${windowParam}:${minAudience}`
  );

  let effectiveRefresh = forceRefresh;
  if (!bypassCache && effectiveRefresh && env && (env.DATABASE_URL || env.ENFORCE_COOLDOWN)) {
    if (pulseForceRefreshCooldown.has(cacheKey)) {
      effectiveRefresh = false;
    }
  }

  if (!bypassCache && effectiveRefresh) {
    pulseForceRefreshCooldown.set(cacheKey, Date.now());
  }

  const computePulsePayload = async () => {
    const startEpoch = pulseMemoryCache.epoch;
    // 4. Concurrent Execution of Hub Queries (including viral creator pins and matview KPIs)
    const [
      activeSerpRows,
      vaultData,
      guidedCapsuleRows,
      creatorBreakoutRows,
      winnerData,
      creatorViralRows,
      matviewKpis
    ] = await Promise.all([
      queryActiveSerp(sql, folderIdNum),
      queryVaultAndVacuum(sql, folderIdNum, env),
      queryGuidedCapsules(sql, folderIdNum),
      queryBreakoutCreators(sql, folderIdNum),
      queryWinnersAndDomains(sql),
      queryViralCreatorPins(sql, folderIdNum).catch(() => []),
      queryKPIs(sql, folderIdNum).catch(() => null)
    ]);

    const { vacuumRows, vaultPins } = vaultData;
    const { paWinners, domainRollups } = winnerData;

    // Vacuum Keyword Map for rapid lookup
    const vacuumKwMap = new Map();
    for (let i = 0; i < vacuumRows.length; i++) {
      const v = vacuumRows[i];
      vacuumKwMap.set(Number(v.keyword_id), v);
    }

    // 5. Unified Cross-Table Merge into pinMap (Active SERP + Displaced Vault + Creator Viral)
    const pinMap = new Map();
    const keywordPinStats = new Map();
    const keywordFoldersMap = new Map();

    for (const row of activeSerpRows) {
      const pid = String(row.pin_id);
      const kid = Number(row.keyword_id);

      if (kid && Array.isArray(row.folders) && row.folders.length > 0 && !keywordFoldersMap.has(kid)) {
        keywordFoldersMap.set(kid, row.folders);
      }

      // Aggregate keyword stats
      let kwStats = keywordPinStats.get(kid);
      if (!kwStats) {
        kwStats = {
          keyword_id: kid,
          keyword_text: row.keyword_text || '',
          active_pins_count: 0,
          total_velocity: 0,
          top_pin: null
        };
        keywordPinStats.set(kid, kwStats);
      }
      kwStats.active_pins_count++;
      const rowVel = (typeof row.daily_save_velocity === 'number') ? row.daily_save_velocity : fastNum(row.daily_save_velocity);
      kwStats.total_velocity += rowVel;
      if (!kwStats.top_pin || rowVel > kwStats.top_pin.daily_save_velocity) {
        kwStats.top_pin = {
          pin_id: pid,
          title: row.title || '',
          image_url: row.image_url || '',
          save_count: (typeof row.save_count === 'number') ? row.save_count : fastNum(row.save_count),
          daily_save_velocity: rowVel
        };
      }

      mergePinIntoMap(pinMap, row, 'active_serp', keywordFoldersMap);
    }

    // Merge Displaced Vault Surges (top 250) into unified surge pool
    for (const vp of vaultPins) {
      mergePinIntoMap(pinMap, vp, 'vault_surge', keywordFoldersMap);
    }

    // Merge Creator Viral Pins (top 150) into unified surge pool
    for (const cp of (creatorViralRows || [])) {
      const pid = String(cp.pin_id);
      if (!folderIdNum || pinMap.has(pid)) {
        mergePinIntoMap(pinMap, cp, 'creator_feed', keywordFoldersMap);
      }
    }

    // Merge Top 100 Qualified PinArchive Winners into unified surge pool [Round 16 Gate 5.3]
    for (const pa of (paWinners || [])) {
      const pid = String(pa.pin_id);
      if (!folderIdNum || pinMap.has(pid)) {
        mergePinIntoMap(pinMap, pa, 'pinarchive_winner', keywordFoldersMap);
      }
    }

    const candidatePinIds = Array.from(pinMap.keys());
    const p2pGraphRows = candidatePinIds.length > 0
      ? await sql`SELECT DISTINCT candidate_pin_id FROM candidate_graph_nodes WHERE candidate_pin_id = ANY(${candidatePinIds}::text[]);`.catch(() => [])
      : [];
    const p2pPinSet = new Set((p2pGraphRows || []).map(r => String(r.candidate_pin_id || '')));

    // 6. Process Merged Pins, Compute Unified 24h Velocity & Extract N-Grams
    const allActivePins = [];
    const paPinsList = [];
    let totalSavesVelocity = 0;
    let totalRepinsDelta = 0;
    let pinsGainingCount = 0;
    let freshRocketCount = 0;
    let bridgePinsCount = 0;

    // N-Gram mining storage
    const singleTagMap = new Map();
    const boardStatsMap = new Map();
    const colorStatsMap = new Map();
    const creationMethodMap = new Map();

    const nowMs = Date.now();

    for (const p of pinMap.values()) {
      if (p.sources.includes('pinarchive_winner')) {
        paPinsList.push(p);
      }
      const overlapCount = p.keywords.length;
      if (overlapCount >= 2) bridgePinsCount++;

      const folders = p.folderList;
      const folderOverlapCount = folders.length;
      const bestRank = p.best_rank;
      const rankClimb24h = (p.best_prev_rank != null && bestRank != null) ? (p.best_prev_rank - bestRank) : 0;

      // Calculate Age
      let pinAgeDays = null;
      if (p.created_at_pinterest) {
        const createdMs = fastParseIsoDateMs(p.created_at_pinterest);
        if (Number.isFinite(createdMs) && createdMs <= nowMs) {
          pinAgeDays = Math.floor((nowMs - createdMs) / 86400000);
        }
      }
      const isFresh14d = pinAgeDays !== null ? (pinAgeDays <= 14) : false;
      const isFresh30d = pinAgeDays !== null ? (pinAgeDays <= 30) : false;
      p.pin_age_days = pinAgeDays;
      p.is_fresh_14d = isFresh14d;
      p.is_fresh_30d = isFresh30d;
      p.lifetime_velocity = (pinAgeDays !== null && pinAgeDays > 0)
        ? Math.round((p.save_count / pinAgeDays) * 10) / 10
        : null;

      // Unified 24h Velocity & Effective Gain [Fix 2.1 SSOT: Math.max()]
      // [INVARIANT: ANTI-HYDRATION-SPIKE-REPINS]
      // Zero out delta_repins_24h if 0-repin or skeleton-to-lifetime hydration jump is detected
      const isPostMergeSkeletonRepinJump =
        (p.repin_count >= 20 && p.delta_repins_24h >= p.repin_count && p.daily_save_velocity === 0 && p.delta_saves_24h === 0) ||
        (
          p.repin_count >= 200 &&
          p.delta_repins_24h >= 150 &&
          (p.repin_count - p.delta_repins_24h) <= Math.max(60, p.repin_count * 0.05) &&
          p.daily_save_velocity < p.delta_repins_24h * 0.15 &&
          p.delta_saves_24h < p.delta_repins_24h * 0.15
        );
      if (isPostMergeSkeletonRepinJump) {
        p.delta_repins_24h = 0;
      }

      let effectiveSaves24h = p.delta_saves_24h;
      if (effectiveSaves24h <= 0 || !Number.isFinite(effectiveSaves24h)) {
        effectiveSaves24h = p.daily_save_velocity;
      } else if (p.daily_save_velocity > 0 && p.daily_save_velocity < effectiveSaves24h * 5) {
        effectiveSaves24h = (p.daily_save_velocity > p.delta_saves_24h) ? p.daily_save_velocity : p.delta_saves_24h;
      }
      const effectiveRepins24h = (p.delta_repins_24h > 0) ? p.delta_repins_24h : 0;
      const effective24hGain = (effectiveSaves24h > effectiveRepins24h) ? effectiveSaves24h : effectiveRepins24h;
      p.effective_24h_gain = effective24hGain;

      // Windowed Momentum Calculation (never suppressed to 0 if 24h deltas are positive)
      let windowSavesGain = effectiveSaves24h;
      let effectiveMomentum = effective24hGain;
      if (windowParam === '5d') {
        windowSavesGain = (p.gains_5d > effectiveSaves24h) ? p.gains_5d : effectiveSaves24h;
        effectiveMomentum = (effective24hGain > p.gains_5d) ? effective24hGain : p.gains_5d;
      } else if (windowParam === '7d') {
        windowSavesGain = (p.gains_7d > effectiveSaves24h) ? p.gains_7d : effectiveSaves24h;
        effectiveMomentum = (effective24hGain > p.gains_7d) ? effective24hGain : p.gains_7d;
      } else if (windowParam === '15d') {
        windowSavesGain = (p.gains_15d > effectiveSaves24h) ? p.gains_15d : effectiveSaves24h;
        effectiveMomentum = (effective24hGain > p.gains_15d) ? effective24hGain : p.gains_15d;
      } else {
        const momFallback = p.daily_save_velocity + (p.delta_repins_24h * 0.5);
        effectiveMomentum = (momFallback > effective24hGain) ? momFallback : effective24hGain;
      }
      p.window_saves_gain = windowSavesGain;

      // Single-pass Anscombe & algorithmic velocity acceleration via SSOT math (uses precomputed p.pin_age_days)
      const anscombeScores = computeAnscombeInflectionScore(p);
      const accelerationRatio = anscombeScores.acceleration_score;
      const isAccelerating = accelerationRatio >= 1.5;

      p.anscombe_z_gain = anscombeScores.anscombe_z_gain;
      p.repin_lead_score = anscombeScores.repin_lead_score;

      // Cross-Pillar Breakout Conviction Score (B_cross)
      // 1. Normalized 24h velocity (logarithmic scaling: 0-100)
      const velForScore = Math.max(0, p.effective_24h_gain > 0 ? p.effective_24h_gain : (p.daily_save_velocity || 0));
      const sVel = Math.min(100, Math.round(Math.log10(velForScore + 1) * 33.3));
      // 2. Multi-keyword SERP rank weight (0-100)
      let rankWeightSum = 0;
      if (Array.isArray(p.keywords)) {
        for (let ki = 0; ki < p.keywords.length; ki++) {
          const kw = p.keywords[ki];
          const rPos = Number(kw.rank_position ?? kw.last_known_rank ?? 50);
          rankWeightSum += Math.max(0.1, 1 - Math.min(50, rPos) / 55);
        }
      }
      const sSerp = Math.min(100, Math.round(rankWeightSum * 35));
      // 3. Competitor board presence (0-100)
      const hasCompetitorBoard = Boolean(
        (p.sources && p.sources.includes('creator_feed')) ||
        (p.board_name && p.board_name.trim().length > 0 && p.creator_username)
      );
      const sComp = hasCompetitorBoard ? 100 : 0;
      // 4. P2P graph presence (0-100)
      const hasP2PGraph = p2pPinSet.has(String(p.pin_id));
      const sP2p = hasP2PGraph ? 100 : 0;
      // Unified B_cross conviction score: 40% velocity, 30% SERP rank, 15% competitor board, 15% P2P graph
      const bCross = Math.min(100, Math.round((sVel * 0.40) + (sSerp * 0.30) + (sComp * 0.15) + (sP2p * 0.15)));
      p.b_cross = bCross;
      p.breakout_conviction_score = bCross;
      p.breakout_score = Math.max(bCross, anscombeScores.breakout_score);

      const urlLeverageRatio = (p.url_global_saves > 0 && p.save_count > 0)
        ? Math.round((p.url_global_saves / p.save_count) * 100) / 100
        : 1.0;

      // True Domainless Viral Pins: true ONLY when no authentic external domain [Fix 2.5 SSOT]
      const isDomainless = Boolean(
        !p.domain ||
        p.domain === 'Uploaded by user' ||
        p.domain.includes('pinterest.') ||
        !p.destination_url
      );
      p.is_domainless_viral = isDomainless;

      // Vacuum Target Check
      let isVacuumHijackTarget = false;
      for (let i = 0; i < p.keywords.length; i++) {
        const vInfo = vacuumKwMap.get(p.keywords[i].keyword_id);
        if (vInfo && vInfo.displaced_top10_24h_count > 0) {
          if (bestRank != null && (bestRank <= 15 || effective24hGain > 0 || rankClimb24h > 0)) {
            isVacuumHijackTarget = true;
            break;
          }
        }
      }

      totalSavesVelocity += (windowParam !== '24h' ? windowSavesGain : effectiveSaves24h);
      totalRepinsDelta += p.delta_repins_24h;
      if (effective24hGain > 0 || p.daily_save_velocity > 0 || p.delta_repins_24h > 0 || windowSavesGain > 0) pinsGainingCount++;
      if (isFresh14d && (effective24hGain > 0 || p.daily_save_velocity > 0 || p.delta_repins_24h > 0 || windowSavesGain > 0)) freshRocketCount++;

      // Clean annotations is already guaranteed normalized on p
      const cleanAnnotations = p.cleanAnnotations;

      // Augment p in-place
      p.pin_age_days = pinAgeDays;
      p.is_fresh_14d = isFresh14d;
      p.is_fresh_30d = isFresh30d;
      p.effective_24h_momentum = Math.round(effectiveMomentum * 100) / 100;
      p.acceleration_ratio = accelerationRatio;
      p.is_accelerating = isAccelerating;
      p.breakout_conviction_score = bCross;
      p.b_cross = bCross;
      p.cross_pillar_conviction = bCross;
      p.p2p_graph_presence = hasP2PGraph;
      p.competitor_board_presence = hasCompetitorBoard;
      p.overlap_count = overlapCount;
      p.folder_overlap_count = folderOverlapCount;
      p.best_rank = bestRank;
      p.rank_climb_24h = rankClimb24h;
      p.is_vacuum_hijack_target = isVacuumHijackTarget;
      p.cleanAnnotations = cleanAnnotations;
      p.folders = folders;
      p.url_leverage_ratio = urlLeverageRatio;
      p.keyword_text = p.keywords[0]?.keyword_text || '';
      p.is_hydrated = Boolean(p.image_url || (p.title && !isSyntheticGarbageTitle(p.title)));
      p.is_hydrated_int = p.is_hydrated ? 1 : 0;

      allActivePins.push(p);
    }

    // Sort All Active Pins by Hydration Status, Unified 24h Gain then Momentum
    allActivePins.sort(activePinSortComparator);


    // Determine if dataset has positive gain pins, or enable fallback for minimal unit-test fixtures
    let positiveGainPinsCount = 0;
    for (let i = 0; i < allActivePins.length; i++) {
      const p = allActivePins[i];
      if ((p.effective_24h_gain > 0 || p.daily_save_velocity > 0)) {
        positiveGainPinsCount++;
      }
    }
    const allowZeroGainFallback = positiveGainPinsCount < 5;

    // Accumulate singleTagMap, boardStatsMap, colorStatsMap, and creationMethodMap
    // Deduplicated by creative key and filtered for positive 24h momentum
    for (let i = 0; i < allActivePins.length; i++) {
      const p = allActivePins[i];
      const pinGain = p.effective_24h_gain > 0 ? p.effective_24h_gain : p.daily_save_velocity;
      const cKey = getCanonicalCreativeKey(p);

      // 1-Gram (single_annotations) - capped at top 6 tags
      if (pinGain > 0 || (allowZeroGainFallback && p.save_count > 0)) {
        const pinVel = (windowParam !== '24h' && p.window_saves_gain > 0)
          ? p.window_saves_gain
          : (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
        const cleanAnnotations = p.cleanAnnotations || [];
        const numTags = Math.min(cleanAnnotations.length, 6);
        for (let ti = 0; ti < numTags; ti++) {
          const tag = cleanAnnotations[ti];
          let st = singleTagMap.get(tag.norm);
          if (!st) {
            st = {
              tag_norm: tag.norm,
              tag_display: tag.display,
              pin_count: 0,
              kwIds: [],
              total_velocity: 0,
              total_24h_gain: 0,
              total_saves: 0,
              total_repins_delta: 0,
              sample_pins: [],
              matchingPins: [],
              seenCreatives: new Set()
            };
            singleTagMap.set(tag.norm, st);
          }
          if (!st.seenCreatives.has(cKey)) {
            st.seenCreatives.add(cKey);
            st.pin_count++;
            st.total_velocity += pinVel;
            st.total_24h_gain += pinVel;
            st.total_saves += p.save_count;
            st.total_repins_delta += p.delta_repins_24h;
            if (st.kwIds.length < 4) {
              for (let ki = 0; ki < p.keywords.length; ki++) {
                const kw = p.keywords[ki];
                if (!st.kwIds.includes(kw.keyword_id)) {
                  st.kwIds.push(kw.keyword_id);
                  if (st.kwIds.length >= 4) break;
                }
              }
            }
            if (st.matchingPins.length < 4) {
              st.matchingPins.push(p);
            }
          }
        }
      }

      // Board Telemetry
      const cleanBoard = p.board_name;
      if (cleanBoard && cleanBoard !== 'unknown') {
        let bEntry = boardStatsMap.get(cleanBoard);
        if (!bEntry) {
          bEntry = {
            board_name: cleanBoard,
            creator_username: p.creator_username || '',
            pin_count: 0,
            total_velocity: 0,
            total_saves: 0,
            sample_pins: [],
            seenCreatives: new Set()
          };
          boardStatsMap.set(cleanBoard, bEntry);
        }
        if (!bEntry.seenCreatives.has(cKey)) {
          bEntry.seenCreatives.add(cKey);
          bEntry.pin_count++;
          bEntry.total_velocity += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
          bEntry.total_saves += p.save_count;
          if (bEntry.sample_pins.length < 2) {
            bEntry.sample_pins.push({
              pin_id: p.pin_id,
              title: p.title,
              image_url: p.image_url
            });
          }
        }
      }

      // Dominant Color Telemetry (Exclude placeholders, group by perceptual RGB bucket so shades coalesce)
      if (p.dominant_color && !isPlaceholderColor(p.dominant_color)) {
        const colorHex = String(p.dominant_color).trim();
        let bucketKey = colorHex.toLowerCase();
        if (colorHex.length === 7 && colorHex.charCodeAt(0) === 35) {
          const r = parseInt(colorHex.slice(1, 3), 16);
          const g = parseInt(colorHex.slice(3, 5), 16);
          const b = parseInt(colorHex.slice(5, 7), 16);
          if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
            bucketKey = `rgb:${r >> 5}:${g >> 5}:${b >> 5}`;
          }
        }
        let cEntry = colorStatsMap.get(bucketKey);
        if (!cEntry) {
          cEntry = { color: colorHex, pin_count: 0, total_velocity: 0, sample_pins: [], matchingPins: [], seenCreatives: new Set() };
          colorStatsMap.set(bucketKey, cEntry);
        }
        if (!cEntry.seenCreatives.has(cKey)) {
          cEntry.seenCreatives.add(cKey);
          cEntry.pin_count++;
          cEntry.total_velocity += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
          if (cEntry.sample_pins.length < 2) {
            cEntry.sample_pins.push({
              pin_id: p.pin_id,
              title: p.title,
              image_url: p.image_url
            });
          }
          if (cEntry.matchingPins.length < 6) {
            cEntry.matchingPins.push(p);
          }
        }
      }

      // Creation Method Telemetry
      const cm = p.creation_method || 'pinterest_platform';
      let cmEntry = creationMethodMap.get(cm);
      if (!cmEntry) {
        cmEntry = { method: cm, pin_count: 0, total_velocity: 0 };
        creationMethodMap.set(cm, cmEntry);
      }
      cmEntry.pin_count++;
      cmEntry.total_velocity += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
    }

    // Build inverted index maps from sorted allActivePins for O(1) matching_pins lookup & deduplicated capsule metrics
    const keywordIdToPinsMap = new Map();
    const tagNormToPinsMap = new Map();
    const kwSeenCreative = new Map();
    const tagSeenCreative = new Map();
    const topPinsForIndex = Math.min(allActivePins.length, 350);
    for (let pi = 0; pi < topPinsForIndex; pi++) {
      const p = allActivePins[pi];
      const pinGain = p.effective_24h_gain > 0 ? p.effective_24h_gain : p.daily_save_velocity;
      if (pinGain <= 0 && (!allowZeroGainFallback || p.save_count <= 0)) continue;
      const cKey = getCanonicalCreativeKey(p);
      for (let ki = 0; ki < p.keywords.length; ki++) {
        const kw = p.keywords[ki];
        let kwPins = keywordIdToPinsMap.get(kw.keyword_id);
        let seenSet = kwSeenCreative.get(kw.keyword_id);
        if (!kwPins) {
          kwPins = [];
          keywordIdToPinsMap.set(kw.keyword_id, kwPins);
          seenSet = new Set();
          kwSeenCreative.set(kw.keyword_id, seenSet);
        }
        if (kwPins.length < 12 && !seenSet.has(cKey)) {
          seenSet.add(cKey);
          kwPins.push(p);
        }
      }
      const numAnns = Math.min(p.cleanAnnotations.length, 6);
      for (let ti = 0; ti < numAnns; ti++) {
        const tag = p.cleanAnnotations[ti];
        let tagPins = tagNormToPinsMap.get(tag.norm);
        let seenSet = tagSeenCreative.get(tag.norm);
        if (!tagPins) {
          tagPins = [];
          tagNormToPinsMap.set(tag.norm, tagPins);
          seenSet = new Set();
          tagSeenCreative.set(tag.norm, seenSet);
        }
        if (tagPins.length < 6 && !seenSet.has(cKey)) {
          seenSet.add(cKey);
          tagPins.push(p);
        }
      }
    }

    // High-Momentum Candidate Pins for 2-Pair and 3-Triplet Crossover Mining (top 400 surging pins, sorted before slicing)
    const candidatePins = [];
    const candidateSeenCreative = new Set();
    for (let i = 0; i < allActivePins.length; i++) {
      const p = allActivePins[i];
      if (p.cleanAnnotations && p.cleanAnnotations.length > 0) {
        const pinGain = p.effective_24h_gain > 0 ? p.effective_24h_gain : p.daily_save_velocity;
        if (pinGain <= 0 && (!allowZeroGainFallback || p.save_count <= 0)) continue;
        const cKey = getCanonicalCreativeKey(p);
        if (candidateSeenCreative.has(cKey)) continue;
        candidateSeenCreative.add(cKey);
        candidatePins.push(p);
        if (candidatePins.length >= 400) break;
      }
    }
    const pairTagMap = new Map();
    const tripletTagMap = new Map();

    for (const p of candidatePins) {
      const rawTags = p.cleanAnnotations;
      if (!rawTags || rawTags.length < 2) continue;
      // Sort alphabetically FIRST, then slice to 5 tags so shared tags are never dropped by pre-sort truncation
      const sortedTags = [...rawTags].sort(tagNormAscComparator).slice(0, 5);
      const K = sortedTags.length;
      if (K < 2) continue;

      const pinVel = (windowParam !== '24h' && p.window_saves_gain > 0)
        ? p.window_saves_gain
        : (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);

      // 2-Pairs (A + B)
      for (let i = 0; i < K - 1; i++) {
        for (let j = i + 1; j < K; j++) {
          const tA = sortedTags[i];
          const tB = sortedTags[j];
          const pairKey = `${tA.norm} +++ ${tB.norm}`;
          let pt = pairTagMap.get(pairKey);
          if (!pt) {
            pt = {
              tag_a_norm: tA.norm,
              tag_a_display: tA.display,
              tag_b_norm: tB.norm,
              tag_b_display: tB.display,
              crossover_label: `${tA.display} + ${tB.display}`,
              pin_count: 0,
              kwIds: [],
              total_velocity: 0,
              total_24h_gain: 0,
              total_saves: 0,
              total_repins_delta: 0,
              sample_pins: [],
              matchingPins: [],
              seenCreatives: new Set()
            };
            pairTagMap.set(pairKey, pt);
          }
          const cKey = getCanonicalCreativeKey(p);
          if (pt.seenCreatives.has(cKey)) continue;
          pt.seenCreatives.add(cKey);

          pt.pin_count++;
          pt.total_velocity += pinVel;
          pt.total_24h_gain += pinVel;
          pt.total_saves += p.save_count;
          pt.total_repins_delta += p.delta_repins_24h;
          if (pt.kwIds.length < 6) {
            for (const kw of p.keywords) {
              if (!pt.kwIds.includes(kw.keyword_id)) {
                pt.kwIds.push(kw.keyword_id);
                if (pt.kwIds.length >= 6) break;
              }
            }
          }
          if (pt.matchingPins.length < 4) {
            let exists = false;
            for (let mpi = 0; mpi < pt.matchingPins.length; mpi++) {
              if (pt.matchingPins[mpi].pin_id === p.pin_id) { exists = true; break; }
            }
            if (!exists) pt.matchingPins.push(p);
          }
        }
      }

      // 3-Triplets (A + B + C)
      for (let i = 0; i < K - 2; i++) {
        for (let j = i + 1; j < K - 1; j++) {
          for (let k = j + 1; k < K; k++) {
            const tA = sortedTags[i];
            const tB = sortedTags[j];
            const tC = sortedTags[k];
            const tripKey = `${tA.norm} +++ ${tB.norm} +++ ${tC.norm}`;
            let tt = tripletTagMap.get(tripKey);
            if (!tt) {
              tt = {
                tag_a_norm: tA.norm,
                tag_a_display: tA.display,
                tag_b_norm: tB.norm,
                tag_b_display: tB.display,
                tag_c_norm: tC.norm,
                tag_c_display: tC.display,
                crossover_label: `${tA.display} + ${tB.display} + ${tC.display}`,
                pin_count: 0,
                kwIds: [],
                total_velocity: 0,
                total_24h_gain: 0,
                total_saves: 0,
                total_repins_delta: 0,
                sample_pins: [],
                matchingPins: [],
                seenCreatives: new Set()
              };
              tripletTagMap.set(tripKey, tt);
            }
            const cKey = getCanonicalCreativeKey(p);
            if (tt.seenCreatives.has(cKey)) continue;
            tt.seenCreatives.add(cKey);

            tt.pin_count++;
            tt.total_velocity += pinVel;
            tt.total_24h_gain += pinVel;
            tt.total_saves += p.save_count;
            tt.total_repins_delta += p.delta_repins_24h;
            if (tt.kwIds.length < 6) {
              for (const kw of p.keywords) {
                if (!tt.kwIds.includes(kw.keyword_id)) {
                  tt.kwIds.push(kw.keyword_id);
                  if (tt.kwIds.length >= 6) break;
                }
              }
            }
            if (tt.matchingPins.length < 4) {
              let exists = false;
              for (let mpi = 0; mpi < tt.matchingPins.length; mpi++) {
                if (tt.matchingPins[mpi].pin_id === p.pin_id) { exists = true; break; }
              }
              if (!exists) tt.matchingPins.push(p);
            }
          }
        }
      }
    }

    // Helper to format compact pin summary preserving 100% of Pulse UI & Blueprint fields (< 900 KB wire budget)
    // Memoized on p._summary [Wave 5A Wire-Budget Optimization]
    const formatPinSummary = (p) => {
      if (p._summary) return p._summary;
      const cleanAnns = p.cleanAnnotations || [];
      const annStrings = (cleanAnns.length > 4 ? cleanAnns.slice(0, 4) : cleanAnns)
        .map(a => (typeof a === 'string' ? a : (a.display || a.norm || '')))
        .filter(Boolean);
      const effectiveSaves24h = (p.daily_save_velocity > p.delta_saves_24h) ? p.daily_save_velocity : p.delta_saves_24h;
      const effectiveRepins24h = (p.delta_repins_24h > 0) ? p.delta_repins_24h : 0;
      const effective24hGain = Number.isFinite(p.effective_24h_gain)
        ? p.effective_24h_gain
        : (effectiveSaves24h > effectiveRepins24h ? effectiveSaves24h : effectiveRepins24h);

      const isDomainless = Boolean(
        !p.domain ||
        p.domain === 'Uploaded by user' ||
        p.domain.includes('pinterest.') ||
        !p.destination_url
      );

      const primaryKw = (p.keywords && p.keywords[0]) ? p.keywords[0] : null;
      const kwText = p.keyword_text || primaryKw?.keyword_text || '';
      const kwId = primaryKw?.keyword_id ?? (p.keyword_id ?? null);
      const rankPosition = primaryKw?.rank_position ?? p.best_rank ?? null;
      const isVaultSurge = Boolean(p.sources && p.sources.includes('vault_surge'));
      const isDisplaced = Boolean(isVaultSurge || (p.sources && p.sources.includes('displaced')) || p.is_displaced);
      const dailyVel = p.daily_save_velocity > 0 ? p.daily_save_velocity : effectiveSaves24h;
      const winGain = p.window_saves_gain ?? dailyVel;
      const overlapCount = p.overlap_count ?? (p.keywords ? p.keywords.length : 0);
      const rankClimb = p.rank_climb_24h ?? 0;
      const rawDest = p.destination_url || '';
      const qIdx = rawDest.indexOf('?');
      const cleanDest = isDomainless ? '' : (qIdx > 0 ? rawDest.slice(0, qIdx) : rawDest);
      const rawTitle = String(p.title || '').trim();
      const compactTitle = rawTitle.length > 105 ? `${rawTitle.slice(0, 104)}…` : rawTitle;
      const rawBoard = String(p.board_name || '').trim();
      const compactBoard = rawBoard.length > 48 ? `${rawBoard.slice(0, 47)}…` : rawBoard;

      const summary = {
        pin_id: String(p.pin_id),
        title: compactTitle,
        ...(annStrings.length > 0 ? { visual_annotations: annStrings } : {}),
        ...(p.keywords && p.keywords.length > 1 ? {
          keywords: p.keywords.slice(0, 2).map(k => ({
            keyword_id: k.keyword_id,
            keyword_text: k.keyword_text || '',
            rank: k.rank_position
          }))
        } : {}),
        ...(p.domain ? { domain: p.domain } : {}),
        ...(cleanDest ? { destination_url: cleanDest } : {}),
        image_url: p.image_url || '',
        ...(p.creator_username ? { creator_username: p.creator_username } : {}),
        ...(compactBoard ? { board_name: compactBoard } : {}),
        ...(!isPlaceholderColor(p.dominant_color) ? { dominant_color: p.dominant_color } : {}),
        save_count: p.save_count,
        daily_save_velocity: dailyVel,
        ...(winGain !== dailyVel ? { window_saves_gain: winGain } : {}),
        ...(p.delta_saves_24h > 0 && p.delta_saves_24h !== dailyVel ? { delta_saves_24h: p.delta_saves_24h } : {}),
        ...(p.delta_repins_24h > 0 ? { delta_repins_24h: p.delta_repins_24h } : {}),
        ...(isAggregatedClusterPin({
          daily_save_velocity: dailyVel,
          delta_repins_24h: p.delta_repins_24h,
          save_count: p.save_count,
          repin_count: p.repin_count
        }) ? { is_aggregated_cluster: true } : {}),
        ...(effective24hGain !== dailyVel ? { effective_24h_gain: effective24hGain } : {}),
        ...(p.pin_age_days != null ? { pin_age_days: p.pin_age_days } : {}),
        ...(p.is_fresh_14d ? { is_fresh_14d: true } : {}),
        ...(isDomainless ? { is_domainless_viral: true } : {}),
        ...(p.creation_method && p.creation_method !== 'pinterest_platform' ? { creation_method: p.creation_method } : {}),
        ...(kwId != null ? { keyword_id: kwId } : {}),
        ...(kwText ? { keyword_text: kwText } : {}),
        ...(rankPosition != null ? { rank_position: rankPosition } : {}),
        ...(isVaultSurge ? { is_vault_surge: true } : {}),
        ...(isDisplaced ? { is_displaced: true } : {}),
        ...(overlapCount > 1 ? { overlap_count: overlapCount } : {}),
        ...(p.best_rank != null && p.best_rank !== rankPosition ? { best_rank: p.best_rank } : {}),
        ...(rankClimb !== 0 ? { rank_climb_24h: rankClimb } : {})
      };
      p._summary = summary;
      return summary;
    };

    // Lightweight Memoized Matrix Pin Summary (for drill-downs & matching pins, 3 compact tag strings)
    const formatMatrixPinSummary = (p) => {
      if (p._matrixSummary) return p._matrixSummary;
      const cleanAnns = p.cleanAnnotations || [];
      const annStrings = (cleanAnns.length > 3 ? cleanAnns.slice(0, 3) : cleanAnns)
        .map(a => (typeof a === 'string' ? a : (a.display || a.norm || '')))
        .filter(Boolean);
      const effectiveSaves24h = (p.daily_save_velocity > p.delta_saves_24h) ? p.daily_save_velocity : p.delta_saves_24h;
      const dailyVel = p.daily_save_velocity > 0 ? p.daily_save_velocity : effectiveSaves24h;
      const winGain = p.window_saves_gain ?? dailyVel;
      const rawTitle = String(p.title || '').trim();
      const compactTitle = rawTitle.length > 80 ? `${rawTitle.slice(0, 79)}…` : rawTitle;

      const matrixSummary = {
        pin_id: String(p.pin_id),
        title: compactTitle,
        image_url: p.image_url || '',
        ...(p.domain ? { domain: p.domain } : {}),
        save_count: p.save_count,
        daily_save_velocity: dailyVel,
        ...(winGain !== dailyVel ? { window_saves_gain: winGain } : {}),
        ...(p.delta_repins_24h > 0 ? { delta_repins_24h: p.delta_repins_24h } : {}),
        ...(isAggregatedClusterPin({
          daily_save_velocity: dailyVel,
          delta_repins_24h: p.delta_repins_24h,
          save_count: p.save_count,
          repin_count: p.repin_count
        }) ? { is_aggregated_cluster: true } : {}),
        ...(p.pin_age_days != null ? { pin_age_days: p.pin_age_days } : {}),
        ...(annStrings.length > 0 ? { visual_annotations: annStrings } : {})
      };
      p._matrixSummary = matrixSummary;
      return matrixSummary;
    };

    // Unified Breakout Pins Feed (Full un-truncated surging feed with windowed UI pagination)
    const seenBreakoutIds = new Set();
    const seenCreativeKeys = new Set();
    const breakoutPinsTop250 = [];

    const hydratedPins = [];
    const skeletonPins = [];
    const freshRocketCandidates = [];
    const seenFreshRocketKeys = new Set();
    const vacuumHijackCandidates = [];
    const domainlessViralCandidates = [];
    const vaultSurgeCandidates = [];
    let domainlessViralTotalCount = 0;
    let vaultSurgeTotalCount = 0;

    for (let i = 0; i < allActivePins.length; i++) {
      const p = allActivePins[i];
      const hasGain = (p.effective_24h_gain > 0 || p.daily_save_velocity > 0 || p.delta_repins_24h > 0 || (p.window_saves_gain || 0) > 0);
      if (p.is_hydrated_int === 1) {
        if ((hasGain || hydratedPins.length < 100) && hydratedPins.length < 500) {
          hydratedPins.push(p);
        }
      } else {
        if (skeletonPins.length < 15) skeletonPins.push(p);
      }
      if (freshRocketCandidates.length < 100 && p.is_fresh_14d && hasGain) {
        const cKey = getCanonicalCreativeKey(p);
        if (!cKey || !seenFreshRocketKeys.has(cKey)) {
          if (cKey) seenFreshRocketKeys.add(cKey);
          freshRocketCandidates.push(p);
        }
      }
      if (vacuumHijackCandidates.length < 25 && p.is_vacuum_hijack_target) {
        vacuumHijackCandidates.push(p);
      }
      if (p.is_domainless_viral && (hasGain || p.save_count >= 100)) {
        domainlessViralTotalCount++;
        if (domainlessViralCandidates.length < 100) {
          domainlessViralCandidates.push(p);
        }
      }
      if (p.sources && p.sources.includes('vault_surge') && hasGain) {
        vaultSurgeTotalCount++;
        if (vaultSurgeCandidates.length < 150) {
          vaultSurgeCandidates.push(p);
        }
      }
    }

    for (let i = 0; i < hydratedPins.length; i++) {
      if (breakoutPinsTop250.length >= 250) break;
      const p = hydratedPins[i];
      const cKey = getCanonicalCreativeKey(p);
      if (seenBreakoutIds.has(p.pin_id) || (cKey && seenCreativeKeys.has(cKey))) continue;
      seenBreakoutIds.add(p.pin_id);
      if (cKey) seenCreativeKeys.add(cKey);
      breakoutPinsTop250.push(formatPinSummary(p));
    }
    for (let i = 0; i < paPinsList.length; i++) {
      if (breakoutPinsTop250.length >= 250) break;
      const p = paPinsList[i];
      const cKey = getCanonicalCreativeKey(p);
      if (!seenBreakoutIds.has(p.pin_id) && (!cKey || !seenCreativeKeys.has(cKey))) {
        seenBreakoutIds.add(p.pin_id);
        if (cKey) seenCreativeKeys.add(cKey);
        breakoutPinsTop250.push(formatPinSummary(p));
      }
    }
    for (let i = 0; i < skeletonPins.length; i++) {
      if (breakoutPinsTop250.length >= 250) break;
      const p = skeletonPins[i];
      const cKey = getCanonicalCreativeKey(p);
      if (!seenBreakoutIds.has(p.pin_id) && (!cKey || !seenCreativeKeys.has(cKey))) {
        seenBreakoutIds.add(p.pin_id);
        if (cKey) seenCreativeKeys.add(cKey);
        breakoutPinsTop250.push(formatPinSummary(p));
      }
    }

    const freshRocketPinsTop100 = freshRocketCandidates.slice(0, 100).map(formatPinSummary);
    const vaultSurgePinsFormatted = vaultSurgeCandidates.slice(0, 150).map(formatPinSummary);

    // Section 3: Format N-Gram Crossovers with Slicing FIRST & Hard Support Floor (pin_count >= 2) [Round 16]
    const singleAnnotations = Array.from(singleTagMap.values())
      .sort(gainThenCountDescComparator)
      .slice(0, 25)
      .map(t => {
        const matchingPins = (t.matchingPins || [])
          .slice(0, 3)
          .map(formatMatrixPinSummary);
        return {
          label: t.tag_display,
          tag_norm: t.tag_norm,
          pin_count: t.pin_count,
          keywords_count: t.kwIds.length,
          total_24h_gain: Number((t.total_24h_gain != null ? t.total_24h_gain : t.total_velocity).toFixed(2)),
          total_velocity: Number(t.total_velocity.toFixed(2)),
          avg_velocity: t.pin_count > 0 ? Number((t.total_velocity / t.pin_count).toFixed(2)) : 0,
          ...(t.total_repins_delta > 0 ? { total_repins_delta: t.total_repins_delta } : {}),
          total_saves: t.total_saves,
          matching_pins: matchingPins
        };
      });

    const pairCrossovers = Array.from(pairTagMap.values())
      .filter(p => p.pin_count >= 2) // [INVARIANT: HARD-SUPPORT-FLOOR-MIN-2: eliminate all count=1 rows]
      .sort(gainThenCountDescComparator)
      .slice(0, 25)
      .map(p => {
        const matchingPins = (p.matchingPins || [])
          .slice(0, 3)
          .map(formatMatrixPinSummary);
        return {
          label: p.crossover_label,
          pair: p.crossover_label,
          tag_a_norm: p.tag_a_norm,
          tag_b_norm: p.tag_b_norm,
          pin_count: p.pin_count,
          keywords_count: p.kwIds.length,
          total_24h_gain: Number((p.total_24h_gain != null ? p.total_24h_gain : p.total_velocity).toFixed(2)),
          total_velocity: Number(p.total_velocity.toFixed(2)),
          avg_velocity: p.pin_count > 0 ? Number((p.total_velocity / p.pin_count).toFixed(2)) : 0,
          ...(p.total_repins_delta > 0 ? { total_repins_delta: p.total_repins_delta } : {}),
          total_saves: p.total_saves,
          matching_pins: matchingPins
        };
      });

    const tripletCrossovers = Array.from(tripletTagMap.values())
      .filter(t => t.pin_count >= 2) // [INVARIANT: HARD-SUPPORT-FLOOR-MIN-2: eliminate all count=1 rows]
      .sort(gainThenCountDescComparator)
      .slice(0, 20)
      .map(t => {
        const matchingPins = (t.matchingPins || [])
          .slice(0, 3)
          .map(formatMatrixPinSummary);
        return {
          label: t.crossover_label,
          triplet: t.crossover_label,
          tag_a_norm: t.tag_a_norm,
          tag_b_norm: t.tag_b_norm,
          tag_c_norm: t.tag_c_norm,
          pin_count: t.pin_count,
          keywords_count: t.kwIds.length,
          total_24h_gain: Number((t.total_24h_gain != null ? t.total_24h_gain : t.total_velocity).toFixed(2)),
          total_velocity: Number(t.total_velocity.toFixed(2)),
          avg_velocity: t.pin_count > 0 ? Number((t.total_velocity / t.pin_count).toFixed(2)) : 0,
          ...(t.total_repins_delta > 0 ? { total_repins_delta: t.total_repins_delta } : {}),
          total_saves: t.total_saves,
          matching_pins: matchingPins
        };
      });

    // Section 4: Group Guided Search Capsules Crossovers (deduplicated by LOWER(TRIM(display_label)))
    const capsuleGroupMap = new Map();
    for (const c of guidedCapsuleRows) {
      const labelNorm = String(c.display_label || c.term || '').trim().toLowerCase();
      if (!labelNorm) continue;
      let cg = capsuleGroupMap.get(labelNorm);
      if (!cg) {
        cg = {
          term: c.term || c.display_label,
          display_label: c.display_label || c.term,
          label_norm: labelNorm,
          dominant_color: c.dominant_color || '#3b82f6',
          max_score: Number(c.score || 0),
          kwIds: [],
          keywords: []
        };
        capsuleGroupMap.set(labelNorm, cg);
      }
      const kid = Number(c.keyword_id);
      if (!cg.kwIds.includes(kid)) {
        cg.kwIds.push(kid);
        if (cg.keywords.length < 4) {
          cg.keywords.push({
            keyword_id: kid,
            keyword_text: c.keyword_text || '',
            keyword_category: c.keyword_category || 'General',
            score: Number(c.score || 0),
            display_order: Number(c.display_order || 10)
          });
        }
      }
      if (c.score > cg.max_score) cg.max_score = c.score;
    }

    let sharedCapsulesCount = 0;
    // Fast initial pass across all capsule groups (bounded to avoid O(N*M) string scans)
    const maxSystemVel = totalSavesVelocity > 0 ? totalSavesVelocity : Infinity;
    const maxSystemPins = allActivePins.length > 0 ? allActivePins.length : Infinity;
    for (const cg of capsuleGroupMap.values()) {
      let rawVel = 0;
      let rawPins = 0;
      const kwCap = Math.min(cg.kwIds.length, 15);
      for (let i = 0; i < kwCap; i++) {
        const stats = keywordPinStats.get(cg.kwIds[i]);
        if (stats) {
          rawVel += stats.total_velocity;
          rawPins += stats.active_pins_count;
        }
      }
      cg.keyword_count = cg.kwIds.length;
      cg.cross_serp_velocity = Math.round(Math.min(rawVel, maxSystemVel) * 100) / 100;
      cg.cross_serp_pins = Math.min(rawPins, maxSystemPins);
      if (cg.keyword_count >= 2) sharedCapsulesCount++;
    }

    // Sort and slice to top 12 FIRST [Round 16 CPU Optimization]
    const topCapsuleGroups = Array.from(capsuleGroupMap.values())
      .sort(capsuleGroupSortComparator)
      .slice(0, 12);

    // Compute exact deduplicated pin count/velocity and gather semantically matching pins ONLY for top 12 in O(1) time
    const guidedCapsuleCrossovers = topCapsuleGroups.map(cg => {
      const targetLabelNorm = (cg.label_norm || cg.display_label || cg.term || '').toLowerCase();
      const matchingPinsRaw = [];
      const fallbackPinsRaw = [];
      const seenCapsuleCreative = new Set();
      const seenPinIds = new Set();
      let dedupedVel = 0;
      let dedupedPinCount = 0;

      // 1. O(1) tag index lookup first (exact visual tag match)
      const tagPins = tagNormToPinsMap.get(targetLabelNorm);
      if (tagPins) {
        for (let pi = 0; pi < tagPins.length; pi++) {
          const p = tagPins[pi];
          if (!seenPinIds.has(p.pin_id)) {
            seenPinIds.add(p.pin_id);
            dedupedPinCount++;
            dedupedVel += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
          }
          const cKey = getCanonicalCreativeKey(p);
          if (!seenCapsuleCreative.has(cKey) && matchingPinsRaw.length < 6) {
            seenCapsuleCreative.add(cKey);
            matchingPinsRaw.push(p);
          }
        }
      }

      // 2. Scan indexed keyword pins for semantic match & deduplicated stats across cg.kwIds
      for (let ki = 0; ki < cg.kwIds.length; ki++) {
        const kid = cg.kwIds[ki];
        const kwPins = keywordIdToPinsMap.get(kid);
        if (!kwPins) continue;
        for (let pi = 0; pi < kwPins.length; pi++) {
          const p = kwPins[pi];
          const isNewPin = !seenPinIds.has(p.pin_id);
          if (isNewPin) {
            seenPinIds.add(p.pin_id);
            dedupedPinCount++;
            dedupedVel += (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
          }
          if (!p.image_url) continue;
          const cKey = getCanonicalCreativeKey(p);
          if (seenCapsuleCreative.has(cKey)) continue;
          if (matchingPinsRaw.length < 6) {
            const titleLower = (p.title || '').toLowerCase();
            const kwLower = (p.keyword_text || '').toLowerCase();
            if (titleLower.includes(targetLabelNorm) || kwLower.includes(targetLabelNorm)) {
              seenCapsuleCreative.add(cKey);
              matchingPinsRaw.push(p);
            } else if (fallbackPinsRaw.length < 6) {
              fallbackPinsRaw.push(p);
            }
          }
        }
      }

      // 3. Fill remaining slots up to 6 from fallbackPinsRaw if needed
      if (matchingPinsRaw.length < 6 && fallbackPinsRaw.length > 0) {
        for (let fi = 0; fi < fallbackPinsRaw.length; fi++) {
          const p = fallbackPinsRaw[fi];
          const cKey = getCanonicalCreativeKey(p);
          if (!seenCapsuleCreative.has(cKey)) {
            seenCapsuleCreative.add(cKey);
            matchingPinsRaw.push(p);
            if (matchingPinsRaw.length >= 6) break;
          }
        }
      }

      const matchingPins = matchingPinsRaw.slice(0, 3).map(formatMatrixPinSummary);
      const effectivePinCount = dedupedPinCount > 0 ? dedupedPinCount : (cg.cross_serp_pins > 0 ? cg.cross_serp_pins : matchingPins.length);
      const effectiveVelocity = dedupedVel > 0 ? Number(dedupedVel.toFixed(2)) : cg.cross_serp_velocity;
      const effectiveScore = cg.max_score > 0
        ? Number(safeNum(cg.max_score).toFixed(2))
        : Number(safeNum(effectiveVelocity > 0 ? effectiveVelocity : (cg.keyword_count * 10 + effectivePinCount)).toFixed(2));

      return {
        term: cg.term,
        display_label: cg.display_label,
        dominant_color: cg.dominant_color,
        pin_count: effectivePinCount,
        score: effectiveScore,
        max_score: effectiveScore,
        avg_velocity: effectivePinCount > 0 ? Number((effectiveVelocity / effectivePinCount).toFixed(2)) : effectiveVelocity,
        keyword_text: cg.keywords[0]?.keyword_text || '',
        keyword_count: cg.keyword_count,
        cross_serp_velocity: effectiveVelocity,
        keywords: cg.keywords.slice(0, 2),
        matching_pins: matchingPins
      };
    });

    // Section 5: Creator Breakouts (Strictly positive growth only + David Accounts boundary fix) [Fix 2.5 SSOT]
    let breakoutCreatorsCount = 0;
    const creatorBreakouts = creatorBreakoutRows
      .filter(cp => {
        const reach = Number(cp.monthly_reach || 0);
        if (minAudience > 0 && reach < minAudience) return false;
        const deltaReach = Number(cp.effective_delta_reach_24h || cp.delta_reach_24h || 0);
        const deltaViews = Number(cp.effective_delta_views_24h || cp.delta_views_24h || 0);
        const driverPins = Array.isArray(cp.driver_pins) ? cp.driver_pins : [];
        const maxPinVel = driverPins.reduce((max, dp) => Math.max(max, Number(dp.daily_save_velocity || dp.delta_saves_24h || 0)), 0);

        // Strictly positive growth: eliminate negative drop accounts and stagnant zero accounts with no active driver pins
        if (deltaReach < 0 && deltaViews < 0) return false;
        if (deltaReach <= 0 && deltaViews <= 0 && maxPinVel <= 0) return false;
        return true;
      })
      .map(cp => {
        const reach = Number(cp.monthly_reach || 0);
        const views = Number(cp.profile_views || 0);
        const deltaReach = Number(cp.effective_delta_reach_24h || cp.delta_reach_24h || 0);
        const deltaViews = Number(cp.effective_delta_views_24h || cp.delta_views_24h || 0);
        const reach7d = Number(cp.effective_reach_delta_7d || cp.reach_delta_7d || 0);
        const views7d = Number(cp.effective_views_delta_7d || cp.views_delta_7d || 0);
        const totalPins = Number(cp.total_pins || 0);
        const followers = Number(cp.follower_count || 0);

        if (deltaReach > 0 || deltaViews > 0) breakoutCreatorsCount++;

        // Filter driver pins for valid non-empty images and compute age-based velocity fallback if 24h delta is 0
        const mappedDriverPins = (Array.isArray(cp.driver_pins) ? cp.driver_pins : [])
          .filter(dp => dp && dp.image_url && typeof dp.image_url === 'string' && dp.image_url.trim().length > 0)
          .map(dp => {
            const saves = Number(dp.save_count || 0);
            let vel = Number(dp.daily_save_velocity || 0);
            let dSaves = Number(dp.delta_saves_24h || 0);
            if (vel <= 0 && dSaves <= 0 && saves > 0 && dp.created_at_pinterest) {
              const createdMs = fastParseIsoDateMs(dp.created_at_pinterest);
              if (Number.isFinite(createdMs) && createdMs < nowMs) {
                const ageDays = Math.max(1, Math.floor((nowMs - createdMs) / 86400000));
                vel = Number((saves / ageDays).toFixed(1));
              }
            }
            return {
              ...dp,
              dossier_url: '/pin/' + encodeURIComponent(dp.pin_id),
              daily_save_velocity: vel > 0 ? vel : dSaves,
              delta_saves_24h: dSaves > 0 ? dSaves : vel,
              save_count: saves,
              repin_count: Number(dp.repin_count || 0)
            };
          });
        const positiveDriverPins = mappedDriverPins.filter(dp => dp.daily_save_velocity > 0 || dp.delta_saves_24h > 0);
        const rawDriverPins = positiveDriverPins.length > 0 ? positiveDriverPins : mappedDriverPins;

        const maxPinVel = rawDriverPins.reduce((max, dp) => Math.max(max, dp.daily_save_velocity || dp.delta_saves_24h || 0), 0);
        const audiencePerPin = totalPins > 0 ? Math.round(reach / totalPins) : 0;

        // Fix 2.5: require totalPins > 0 && totalPins <= 250 && reach <= 500000 && positive delta
        const isDavidBreakout = totalPins > 0 && totalPins <= 250 && reach <= 500000 && (deltaReach >= 1000 || deltaViews >= 5000 || maxPinVel >= 20);

        let milestoneTier = 'Emerging';
        if (reach >= 10_000_000) milestoneTier = 'Titan (10M+)';
        else if (reach >= 1_000_000) milestoneTier = 'Whale (1M+)';
        else if (reach >= 250_000) milestoneTier = 'Established (250K+)';
        else if (reach >= 50_000) milestoneTier = 'Growth (50K+)';

        return {
          id: cp.id,
          username: cp.username,
          display_name: cp.display_name || cp.username,
          avatar_url: cp.avatar_url || '',
          bio: String(cp.bio || '').slice(0, 120),
          website_url: cp.website_url || '',
          monthly_reach: reach,
          profile_views: views,
          total_pins: totalPins,
          total_boards: Number(cp.total_boards || 0),
          follower_count: followers,
          effective_delta_reach_24h: deltaReach,
          effective_delta_views_24h: deltaViews,
          reach_delta_7d: reach7d,
          views_delta_7d: views7d,
          delta_pins_24h: Number(cp.delta_pins_24h || 0),
          last_synced_at: cp.last_synced_at,
          audience_per_pin: audiencePerPin,
          is_david_breakout: isDavidBreakout,
          is_david_account: isDavidBreakout,
          milestone_tier: milestoneTier,
          max_pin_velocity: maxPinVel,
          driver_pins: rawDriverPins
        };
      })
      .sort((a, b) => {
        const aReach = a.effective_delta_reach_24h;
        const bReach = b.effective_delta_reach_24h;
        if (bReach !== aReach) return bReach - aReach;
        const aReach7d = a.reach_delta_7d;
        const bReach7d = b.reach_delta_7d;
        if (bReach7d !== aReach7d) return bReach7d - aReach7d;
        if (b.max_pin_velocity !== a.max_pin_velocity) return b.max_pin_velocity - a.max_pin_velocity;
        const aGain = Math.max(a.effective_delta_reach_24h, a.effective_delta_views_24h);
        const bGain = Math.max(b.effective_delta_reach_24h, b.effective_delta_views_24h);
        if (bGain !== aGain) return bGain - aGain;
        return b.monthly_reach - a.monthly_reach;
      })
      .slice(0, 20);

    // Section 6: Keyword Vacuums & Multi-Keyword Pixie Bridges (prioritizing actively surging pins) [Fix 2.5 SSOT]
    const bridgePins = allActivePins
      .filter(p => p.overlap_count >= 2)
      .sort((a, b) => {
        const aSurging = (a.effective_24h_gain > 0) ? 1 : 0;
        const bSurging = (b.effective_24h_gain > 0) ? 1 : 0;
        if (bSurging !== aSurging) return bSurging - aSurging;
        if (b.effective_24h_gain !== a.effective_24h_gain) return b.effective_24h_gain - a.effective_24h_gain;
        const aKwCount = a.keywords ? a.keywords.length : (a.overlap_count || 0);
        const bKwCount = b.keywords ? b.keywords.length : (b.overlap_count || 0);
        if (bKwCount !== aKwCount) return bKwCount - aKwCount;
        return (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0);
      })
      .slice(0, 150)
      .map(formatPinSummary);

    let totalVacuumTop10_24h = 0;
    const keywordVacuumOpportunities = Array.from(vacuumKwMap.values())
      .map(v => {
        const top10_24h = v.displaced_top10_24h_count;
        totalVacuumTop10_24h += top10_24h;
        const count24h = v.displaced_24h_count;
        const top10_7d = v.displaced_top10_7d_count;

        const kwStats = keywordPinStats.get(v.keyword_id) || {
          active_pins_count: 0,
          total_velocity: 0,
          top_pin: null
        };

        const vacuumScore = (top10_24h * 15) + (count24h * 5) + (top10_7d * 2);
        let urgency = 'STABLE';
        if (top10_24h >= 2) urgency = 'CRITICAL_VACUUM';
        else if (top10_24h >= 1) urgency = 'HIGH_VACUUM';
        else if (count24h >= 3) urgency = 'MODERATE_CHURN';

        return {
          keyword_id: v.keyword_id,
          keyword_text: v.keyword_text,
          displaced_24h_count: count24h,
          displaced_top10_24h_count: top10_24h,
          displaced_top10_7d_count: top10_7d,
          active_pins_count: kwStats.active_pins_count,
          avg_velocity: kwStats.active_pins_count > 0 ? Number((safeNum(kwStats.total_velocity) / kwStats.active_pins_count).toFixed(2)) : 0,
          top_pin: kwStats.top_pin ? {
            ...kwStats.top_pin,
            save_count: safeNum(kwStats.top_pin.save_count),
            daily_save_velocity: safeNum(kwStats.top_pin.daily_save_velocity)
          } : null,
          vacuum_score: vacuumScore,
          urgency
        };
      })
      .sort((a, b) => {
        if (b.vacuum_score !== a.vacuum_score) return b.vacuum_score - a.vacuum_score;
        return b.displaced_top10_24h_count - a.displaced_top10_24h_count;
      })
      .slice(0, 20);

    // Section 7: Hidden Gems Telemetry
    const winningBoards = Array.from(boardStatsMap.values())
      .map(b => ({
        board_name: b.board_name,
        creator_username: b.creator_username,
        pin_count: b.pin_count,
        total_velocity: Number(b.total_velocity.toFixed(2)),
        total_saves: b.total_saves,
        avg_velocity: b.pin_count > 0 ? Number((b.total_velocity / b.pin_count).toFixed(2)) : 0
      }))
      .sort((a, b) => {
        if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
        return b.pin_count - a.pin_count;
      })
      .slice(0, 10);

    const vacuumHijackPins = vacuumHijackCandidates.slice(0, 25).map(formatPinSummary);
    const domainlessViralPins = domainlessViralCandidates.slice(0, 100).map(formatPinSummary);

    const uniqueActiveSerpPinsCount = allActivePins.filter(p => p.sources && p.sources.includes('active_serp')).length;
    const totalActiveSerpSlots = activeSerpRows[0]?.full_count || uniqueActiveSerpPinsCount;
    const totalActivePinsCount = uniqueActiveSerpPinsCount || totalActiveSerpSlots;
    const creationMethodBreakdown = Array.from(creationMethodMap.values())
      .map(cm => ({
        method: cm.method,
        pin_count: cm.pin_count,
        total_velocity: Number(cm.total_velocity.toFixed(2)),
        pct_of_active_serp: totalActivePinsCount > 0 ? Number(((cm.pin_count / totalActivePinsCount) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.pin_count - a.pin_count);

    // Dominant Color Palette exporting both pin_count and count: pin_count [Fix 2.5 SSOT]
    const dominantColorPalette = Array.from(colorStatsMap.values())
      .map(c => ({
        color: c.color,
        pin_count: c.pin_count,
        count: c.pin_count, // Dual export: pin_count AND count
        total_velocity: Number(c.total_velocity.toFixed(2)),
        avg_velocity: c.pin_count > 0 ? Number((c.total_velocity / c.pin_count).toFixed(2)) : 0,
        matching_pins: (c.matchingPins || []).slice(0, 3).map(formatMatrixPinSummary)
      }))
      .sort((a, b) => {
        const aMulti = a.pin_count >= 2 ? 1 : 0;
        const bMulti = b.pin_count >= 2 ? 1 : 0;
        if (bMulti !== aMulti) return bMulti - aMulti;
        if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
        return b.pin_count - a.pin_count;
      })
      .slice(0, 12);

    const domainRollupLookup = new Map();
    for (const dr of (domainRollups || [])) {
      if (dr && dr.domain) domainRollupLookup.set(String(dr.domain).toLowerCase(), dr);
    }

    const liveDomainMap = new Map();
    for (let i = 0; i < allActivePins.length; i++) {
      const p = allActivePins[i];
      const dom = String(p.domain || '').trim().toLowerCase();
      if (!dom || dom === 'uploaded by user' || dom.includes('pinterest.') || dom.includes('pinimg.')) continue;
      let dEntry = liveDomainMap.get(dom);
      if (!dEntry) {
        dEntry = {
          domain: dom,
          total_pins: 0,
          active_serp_pins: 0,
          top10_pins: 0,
          total_saves: 0,
          total_velocity: 0,
          total_repins_delta: 0,
          kwSet: new Set(),
          matchingPins: []
        };
        liveDomainMap.set(dom, dEntry);
      }
      dEntry.total_pins++;
      if (p.sources && p.sources.includes('active_serp')) dEntry.active_serp_pins++;
      if (p.best_rank != null && p.best_rank <= 10) dEntry.top10_pins++;
      dEntry.total_saves += (p.save_count || 0);
      const pinVel = (windowParam !== '24h' && p.window_saves_gain > 0)
        ? p.window_saves_gain
        : (p.daily_save_velocity > 0 ? p.daily_save_velocity : p.effective_24h_gain);
      dEntry.total_velocity += (pinVel || 0);
      dEntry.total_repins_delta += (p.delta_repins_24h || 0);
      for (let ki = 0; ki < (p.keywords || []).length; ki++) {
        dEntry.kwSet.add(p.keywords[ki].keyword_id);
      }
      if (dEntry.matchingPins.length < 6 && p.image_url) {
        dEntry.matchingPins.push(p);
      }
    }

    const topArbitrageDomains = Array.from(liveDomainMap.values())
      .map(d => {
        const rollup = domainRollupLookup.get(d.domain) || {};
        const totalVel = Number(d.total_velocity.toFixed(2));
        const avgVel = d.total_pins > 0 ? Number((d.total_velocity / d.total_pins).toFixed(2)) : Number(rollup.avg_velocity || 0);
        return {
          domain: d.domain,
          label: d.domain,
          total_pins: d.total_pins,
          pin_count: d.total_pins,
          active_serp_pins: d.active_serp_pins,
          top10_pins: d.top10_pins,
          keywords_count: d.kwSet.size,
          visibility_score: Number(rollup.visibility_score || (d.top10_pins * 10 + d.active_serp_pins * 2)),
          total_saves: d.total_saves,
          total_velocity: totalVel,
          avg_velocity: avgVel,
          total_repins_delta: d.total_repins_delta,
          ad_network: rollup.ad_network || 'unchecked',
          age_days: Number(rollup.age_days || 0),
          ...(rollup.age_years != null ? { age_years: Number(rollup.age_years) } : {}),
          arbitrage_score: Number(rollup.arbitrage_score || totalVel),
          matching_pins: d.matchingPins.slice(0, 3).map(formatMatrixPinSummary)
        };
      })
      .sort((a, b) => {
        if (b.total_velocity !== a.total_velocity) return b.total_velocity - a.total_velocity;
        if (b.total_repins_delta !== a.total_repins_delta) return b.total_repins_delta - a.total_repins_delta;
        return b.total_saves - a.total_saves;
      })
      .slice(0, 25);

    // Section 1: Executive KPI Ribbon (incorporates mv_pulse_24h_summary with fallback)
    const kpis = {
      total_active_serp_pins: totalActivePinsCount,
      total_active_serp_slots: totalActiveSerpSlots,
      pins_gaining_24h_count: pinsGainingCount,
      total_24h_saves_velocity: Number(totalSavesVelocity.toFixed(2)),
      total_24h_repins_delta: totalRepinsDelta,
      fresh_rocket_pins_14d_count: freshRocketCount,
      breakout_creators_count: breakoutCreatorsCount,
      multi_keyword_bridge_pins_count: bridgePinsCount,
      shared_guided_capsules_count: sharedCapsulesCount,
      serp_vacuum_top10_24h_count: totalVacuumTop10_24h,
      domainless_viral_pins_count: domainlessViralTotalCount,
      vault_surge_pins_count: vaultSurgeTotalCount,
      active_pins_24h: matviewKpis?.active_pins_24h ?? totalActivePinsCount,
      active_domains_24h: matviewKpis?.active_domains_24h ?? liveDomainMap.size,
      active_creators_24h: matviewKpis?.active_creators_24h ?? breakoutCreatorsCount,
      avg_velocity_24h: matviewKpis?.avg_velocity_24h ?? (pinsGainingCount > 0 ? Number((totalSavesVelocity / pinsGainingCount).toFixed(2)) : 0),
      max_velocity_24h: matviewKpis?.max_velocity_24h ?? (breakoutPinsTop250[0]?.daily_save_velocity || breakoutPinsTop250[0]?.velocity || 0),
      total_delta_saves_24h: matviewKpis?.total_delta_saves_24h ?? Math.round(totalSavesVelocity),
      matview_refreshed_at: matviewKpis?.refreshed_at ?? null,
      from_matview: Boolean(matviewKpis?.from_matview)
    };

    const payload = {
      success: true,
      generated_at: new Date().toISOString(),
      filters: {
        folder_id: folderId || 'all',
        window: windowParam,
        min_audience: minAudience
      },
      kpis,
      breakout_pins: breakoutPinsTop250,
      fresh_rocket_pins: freshRocketPinsTop100,
      vault_surge_pins: vaultSurgePinsFormatted,
      pinarchive_winners: paWinners.slice(0, 10).map(p => ({
        ...p,
        saves: Number(p.saves || 0),
        repins: Number(p.repins || 0),
        comments: Number(p.comments || 0),
        velocity: Number(p.velocity || 0),
        annotations: extractCleanAnnotations(p.annotations)
      })),
      annotation_crossovers: {
        single_annotations: singleAnnotations,
        pair_crossovers: pairCrossovers,
        triplet_crossovers: tripletCrossovers
      },
      guided_capsule_crossovers: guidedCapsuleCrossovers,
      creator_breakouts: creatorBreakouts,
      keyword_vacuums_and_bridges: {
        bridge_pins: bridgePins,
        keyword_vacuum_opportunities: keywordVacuumOpportunities
      },
      hidden_gems_telemetry: {
        winning_boards: winningBoards,
        vacuum_hijack_pins: vacuumHijackPins,
        domainless_viral_pins: domainlessViralPins,
        creation_method_breakdown: creationMethodBreakdown,
        dominant_color_palette: dominantColorPalette,
        top_arbitrage_domains: topArbitrageDomains
      }
    };

    if (!bypassCache && pulseMemoryCache.isWriteValid(cacheKey, startEpoch)) {
      pulseForceRefreshCooldown.set(cacheKey, Date.now());
    }

    return payload;
  };

  if (bypassCache) {
    return await computePulsePayload();
  }

  return await pulseMemoryCache.getOrFetch(cacheKey, computePulsePayload, {
    ttlMs: PULSE_MEMORY_TTL_MS,
    forceRefresh: effectiveRefresh,
    shouldCache: (val) => Boolean(val && val.success !== false)
  });
}

/**
 * Section 8 Helper: Synthesizes One-Click 5-Source Scientific Pin Blueprint
 */
export function synthesizePinBlueprint(pinId, pulseData) {
  if (!pulseData || typeof pulseData !== 'object') return null;
  const targetId = String(pinId || '').trim();

  // Search pin in breakout_pins, fresh_rocket_pins, vault_surge_pins, or pinarchive_winners
  const pin = (pulseData.breakout_pins || []).find(p => String(p.pin_id) === targetId)
    || (pulseData.fresh_rocket_pins || []).find(p => String(p.pin_id) === targetId)
    || (pulseData.vault_surge_pins || []).find(p => String(p.pin_id) === targetId)
    || (pulseData.pinarchive_winners || []).find(p => String(p.pin_id) === targetId)
    || { pin_id: targetId, title: 'Untitled Pin', dominant_color: '#888888' };

  const pinAnnotations = extractCleanAnnotations(pin.visual_annotations || pin.annotations || []);
  const annotationNorms = new Set(pinAnnotations.map(a => a.norm));

  // Match relevant Guided Search Capsules
  const relevantCapsules = (pulseData.guided_capsule_crossovers || []).filter(c => {
    const termNorm = (c.term || c.display_label || '').toLowerCase();
    if (!termNorm) return false;
    if (annotationNorms.has(termNorm)) return true;
    for (const an of annotationNorms) {
      if (an.includes(termNorm) || termNorm.includes(an)) return true;
    }
    if (pin.title && pin.title.toLowerCase().includes(termNorm)) return true;
    if (Array.isArray(pin.keywords)) {
      for (const kw of pin.keywords) {
        if ((kw.keyword_text || '').toLowerCase().includes(termNorm)) return true;
      }
    }
    return false;
  }).slice(0, 10);

  // Match relevant Triplet Crossovers
  const relevantTriplets = (pulseData.annotation_crossovers?.triplet_crossovers || []).filter(t => {
    return annotationNorms.has(t.tag_a_norm) || annotationNorms.has(t.tag_b_norm) || annotationNorms.has(t.tag_c_norm);
  }).slice(0, 8);

  // Match relevant Pair Crossovers
  const relevantPairs = (pulseData.annotation_crossovers?.pair_crossovers || []).filter(p => {
    return annotationNorms.has(p.tag_a_norm) || annotationNorms.has(p.tag_b_norm);
  }).slice(0, 8);

  // Recommended Target Board
  const winningBoards = pulseData.hidden_gems_telemetry?.winning_boards || [];
  let recommendedBoard = pin.board_name || (winningBoards[0]?.board_name || 'Winning Arbitrage Board');

  // Recommended Color Palette
  const dominantPalette = pulseData.hidden_gems_telemetry?.dominant_color_palette || [];
  const recommendedColors = [pin.dominant_color || '#888888', ...dominantPalette.map(c => c.color).filter(c => c !== pin.dominant_color)].slice(0, 5);

  return {
    pin_id: pin.pin_id,
    title: pin.title || '',
    domain: pin.domain || '',
    destination_url: pin.destination_url || '',
    image_url: pin.image_url || '',
    creator_username: pin.creator_username || '',
    board_name: pin.board_name || '',
    dominant_color: pin.dominant_color || '#888888',
    recommended_target_board: recommendedBoard,
    recommended_color_palette: recommendedColors,
    relevant_guided_capsules: relevantCapsules,
    relevant_triplet_crossovers: relevantTriplets,
    relevant_pair_crossovers: relevantPairs,
    metrics: {
      save_count: Number(pin.save_count || pin.saves || 0),
      repin_count: Number(pin.repin_count || pin.repins || 0),
      daily_save_velocity: Number(pin.daily_save_velocity || pin.velocity || 0),
      delta_repins_24h: Number(pin.delta_repins_24h || 0),
      pin_age_days: pin.pin_age_days ?? null,
      is_fresh_14d: Boolean(pin.is_fresh_14d),
      url_leverage_ratio: Number(pin.url_leverage_ratio || 1.0),
      rank_climb_24h: Number(pin.rank_climb_24h || 0)
    },
    five_source_relevance: {
      source_1_serp: {
        keywords: pin.keywords || (pin.keyword_text ? [{ keyword_id: pin.keyword_id ?? null, keyword_text: pin.keyword_text, rank: pin.rank_position ?? null }] : []),
        best_rank: pin.best_rank ?? pin.rank_position ?? null,
        rank_climb_24h: Number(pin.rank_climb_24h || 0)
      },
      source_2_guided_capsules: relevantCapsules.map(c => ({
        label: c.display_label,
        score: c.max_score,
        keyword_count: c.keyword_count
      })),
      source_3_cv_annotations: pinAnnotations,
      source_4_pinsage_board: {
        current_board: pin.board_name || '',
        recommended_target_board: recommendedBoard
      },
      source_5_domain_leverage: {
        domain: pin.domain || '',
        url_global_saves: Number(pin.url_global_saves || 0),
        url_leverage_ratio: Number(pin.url_leverage_ratio || 1.0)
      }
    }
  };
}

/**
 * Shared Folder Pulse Analytics Engine
 * Bridges folder crossover calculations with the core Pulse Intelligence Engine.
 *
 * @param {Function} sql - Unified PostgreSQL client
 * @param {number|string} folderId - Target Folder ID
 * @param {object} [options={}] - Options (refresh, env, ctx)
 * @returns {Promise<object>}
 */
export async function getFolderPulseCrossoverAnalytics(sql, folderId, options = {}) {
  const fid = Number(folderId);
  return await getGlobal24hPulseService(sql, options.env, {
    folderId: fid,
    forceRefresh: Boolean(options.refresh || options.forceRefresh),
    ctx: options.ctx,
    ...options
  });
}

