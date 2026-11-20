/**
 * Shared Related Pins Graph Writer & Cleanup Core Module
 *
 * Single SSOT for:
 *  - Extracting creator attribution & destination URL metadata from Pinterest pin objects
 *  - Deduplicating & deterministically sorting (seed_pin_id, candidate_pin_id) edge batches
 *  - Non-destructive batch upserts into unified `candidate_graph_nodes` (`deep` and `quick` modes)
 *  - Orphan-safe edge pruning across `cluster_seeds` and `competitor_seed_pins`
 *  - Dynamic `is_same_account` handle normalization/matching
 */

import { sanitizeForJsonb, normalizeCleanDomain, chunkArray } from '../../utils.mjs';

/**
 * Normalize a Pinterest creator handle for case-insensitive, `@`-stripped comparison.
 */
export function normalizeCreatorHandle(username) {
  return String(username || '').trim().replace(/^@+/, '').trim().toLowerCase();
}

/**
 * Dynamic JavaScript parity check for `is_same_account` matching SQL logic:
 *   BTRIM(COALESCE(creator_username, '')) <> ''
 *   AND LOWER(LTRIM(BTRIM(creator_username), '@')) = LOWER(LTRIM(BTRIM(target_username), '@'))
 */
export function isSameCreatorAccount(creatorUsername, targetUsername) {
  const cleanCreator = normalizeCreatorHandle(creatorUsername);
  const cleanTarget = normalizeCreatorHandle(targetUsername);
  return cleanCreator.length > 0 && cleanTarget.length > 0 && cleanCreator === cleanTarget;
}

/**
 * Extract creator attribution, destination URL, and cleaned domain from a raw Pinterest pin payload.
 */
export function extractCreatorAndLinkMeta(rawPin) {
  const pin = rawPin && typeof rawPin === 'object' ? rawPin : {};
  const rawCreator =
    pin.pinner?.username ||
    pin.origin_pinner?.username ||
    pin.native_creator?.username ||
    pin.creator_username ||
    '';
  const creatorUsername = String(rawCreator).trim().replace(/^@+/, '').trim().slice(0, 100);

  const rawCreatorName =
    pin.pinner?.full_name ||
    pin.origin_pinner?.full_name ||
    pin.native_creator?.full_name ||
    pin.creator_name ||
    '';
  const creatorName = String(rawCreatorName).trim().slice(0, 255);

  const destinationUrl = String(pin.link || pin.destination_url || '').trim();

  const rawDomainVal = pin.domain || pin.link_domain?.id || pin.link_domain || '';
  const rawDomain = typeof rawDomainVal === 'string' ? rawDomainVal.trim() : '';
  const cleanDomain = normalizeCleanDomain(rawDomain || destinationUrl, { strictFqdn: true }) || null;
  const domain = (cleanDomain || rawDomain || '').slice(0, 255);

  return {
    creator_username: creatorUsername,
    creator_name: creatorName,
    destination_url: destinationUrl,
    clean_domain: cleanDomain,
    domain
  };
}

function parseNullableInt(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function parseNullableNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a raw candidate graph edge into a canonical `candidate_graph_nodes` payload record.
 * Preserves `saves = null` when explicit saves are omitted (unhydrated state invariant).
 */
export function normalizeCandidateGraphEdge(edge, { defaultSeedPinId = '' } = {}) {
  if (!edge || typeof edge !== 'object') return null;

  const seedPinId = String(edge.seed_pin_id || defaultSeedPinId || '').trim();
  const candidatePinId = String(edge.candidate_pin_id || '').trim();
  if (!seedPinId || !candidatePinId || seedPinId === candidatePinId) return null;

  const rawColor = typeof edge.dominant_color === 'string' ? edge.dominant_color.trim() : '';
  const dominantColor = (rawColor && rawColor.toLowerCase() !== '#888888') ? rawColor.slice(0, 32) : null;

  const rawDomain = typeof edge.domain === 'string' ? edge.domain.trim() : '';
  const destinationUrl = typeof edge.destination_url === 'string' ? edge.destination_url.trim() : '';
  const cleanDomain = edge.clean_domain || normalizeCleanDomain(rawDomain || destinationUrl, { strictFqdn: true }) || null;
  const domain = (cleanDomain || rawDomain || '').slice(0, 255);

  const creatorUsername = String(edge.creator_username || '').trim().replace(/^@+/, '').trim().slice(0, 100);
  const creatorName = String(edge.creator_name || '').trim().slice(0, 255);

  const saves = parseNullableInt(edge.saves);
  const repins = parseNullableInt(edge.repins);

  return {
    seed_pin_id: seedPinId.slice(0, 64),
    candidate_pin_id: candidatePinId.slice(0, 64),
    title: typeof edge.title === 'string' ? edge.title.trim().slice(0, 500) : '',
    image_url: typeof edge.image_url === 'string' ? edge.image_url.trim() : '',
    dominant_color: dominantColor,
    aspect_ratio: parseNullableNumber(edge.aspect_ratio),
    saves,
    repins,
    save_rate: parseNullableNumber(edge.save_rate),
    domain,
    destination_url: destinationUrl,
    is_product: Boolean(edge.is_product),
    ocr_text: typeof edge.ocr_text === 'string' ? edge.ocr_text.trim() : '',
    pin_created_at: edge.pin_created_at ? String(edge.pin_created_at).trim() : null,
    age_days: parseNullableNumber(edge.age_days),
    daily_velocity: parseNullableNumber(edge.daily_velocity),
    provenance_engine: typeof edge.provenance_engine === 'string' && edge.provenance_engine.trim()
      ? edge.provenance_engine.trim().slice(0, 64)
      : 'P2P_TWO_TOWER',
    individual_prod_score: parseNullableNumber(edge.individual_prod_score),
    recgpt_transition_score: parseNullableNumber(edge.recgpt_transition_score),
    sequence_role: typeof edge.sequence_role === 'string' && edge.sequence_role.trim()
      ? edge.sequence_role.trim().slice(0, 64)
      : 'DIRECT_MATCH',
    is_recgpt_candidate: Boolean(edge.is_recgpt_candidate),
    visual_entropy_score: parseNullableNumber(edge.visual_entropy_score),
    is_video: Boolean(edge.is_video),
    ingestion_method: typeof edge.ingestion_method === 'string' && edge.ingestion_method.trim()
      ? edge.ingestion_method.trim().slice(0, 64)
      : 'uploaded',
    creator_username: creatorUsername,
    creator_name: creatorName
  };
}

/**
 * Deduplicate edges in-memory via Map keyed by `(seed_pin_id, candidate_pin_id)` and
 * sort deterministically ascending by `(seed_pin_id, candidate_pin_id)` to prevent
 * PostgreSQL SQLSTATE 21000 cardinality violations and 40P01 lock-order deadlocks.
 */
export function deduplicateAndSortCandidateEdges(edges, options = {}) {
  if (!Array.isArray(edges) || edges.length === 0) return [];
  const edgeMap = new Map();

  for (const raw of edges) {
    const normalized = normalizeCandidateGraphEdge(raw, options);
    if (!normalized) continue;

    const key = `${normalized.seed_pin_id}:${normalized.candidate_pin_id}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, normalized);
      continue;
    }

    const existing = edgeMap.get(key);
    const incomingHasHigherSaves =
      normalized.saves !== null && (existing.saves === null || normalized.saves > existing.saves);
    const primary = incomingHasHigherSaves ? normalized : existing;
    const secondary = incomingHasHigherSaves ? existing : normalized;

    edgeMap.set(key, {
      ...primary,
      title: primary.title || secondary.title,
      image_url: primary.image_url || secondary.image_url,
      dominant_color: primary.dominant_color || secondary.dominant_color,
      domain: primary.domain || secondary.domain,
      destination_url: primary.destination_url || secondary.destination_url,
      creator_username: primary.creator_username || secondary.creator_username,
      creator_name: primary.creator_name || secondary.creator_name,
      ocr_text: primary.ocr_text || secondary.ocr_text,
      saves: primary.saves !== null ? primary.saves : secondary.saves,
      repins: primary.repins !== null && secondary.repins !== null
        ? Math.max(primary.repins, secondary.repins)
        : (primary.repins !== null ? primary.repins : secondary.repins),
      is_product: Boolean(primary.is_product || secondary.is_product),
      is_video: Boolean(primary.is_video || secondary.is_video)
    });
  }

  return Array.from(edgeMap.values()).sort((a, b) => {
    const seedCmp = a.seed_pin_id.localeCompare(b.seed_pin_id);
    if (seedCmp !== 0) return seedCmp;
    return a.candidate_pin_id.localeCompare(b.candidate_pin_id);
  });
}

/**
 * Batch upsert unified directed edges into `candidate_graph_nodes`.
 *
 * Modes:
 *  - `quick` (`account-related-crawler.mjs`, `harvestSinglePinRelatedLive`):
 *      Inserts defaults for deep fields when creating a new row, and on conflict ONLY
 *      merges quick-crawl metadata non-destructively — NEVER clobbering deep-crawl
 *      analytics (`ocr_text`, `sequence_role`, `aspect_ratio`, `daily_velocity`, etc.).
 *  - `deep` (`cluster-intelligence.mjs`, `importRawJsonClusterDataService`):
 *      Persists full algorithmic signals + creator/destination metadata while merging
 *      non-destructively via `COALESCE(NULLIF(..., ''), existing)` so empty deep fields
 *      never erase populated quick-crawl metadata.
 */
export async function upsertCandidateGraphEdges(sql, edges, {
  mode = 'quick',
  chunkSize = 50,
  defaultSeedPinId = '',
  queryWrapper = null
} = {}) {
  const prepared = deduplicateAndSortCandidateEdges(edges, { defaultSeedPinId });
  if (prepared.length === 0) return { upsertedCount: 0, batches: 0 };

  const execQuery = typeof queryWrapper === 'function' ? queryWrapper : (fn) => fn();
  const safeChunkSize = Math.max(1, Number(chunkSize) || 50);
  const chunks = chunkArray(prepared, safeChunkSize);

  for (const chunk of chunks) {
    const payload = JSON.stringify(sanitizeForJsonb(chunk));

    if (mode === 'deep') {
      await execQuery(() => sql`
        INSERT INTO candidate_graph_nodes (
          seed_pin_id, candidate_pin_id, title, dominant_color, aspect_ratio,
          saves, repins, save_rate, domain, destination_url,
          is_product, ocr_text, extracted_at,
          pin_created_at, age_days, daily_velocity, provenance_engine,
          individual_prod_score, recgpt_transition_score, sequence_role,
          is_recgpt_candidate, visual_entropy_score,
          image_url, is_video, ingestion_method,
          creator_username, creator_name
        )
        SELECT
          x.seed_pin_id,
          x.candidate_pin_id,
          x.title,
          COALESCE(NULLIF(x.dominant_color, ''), '#888888'),
          COALESCE(x.aspect_ratio, 0.56),
          x.saves,
          COALESCE(x.repins, 0),
          COALESCE(x.save_rate, 0),
          x.domain,
          NULLIF(x.destination_url, ''),
          COALESCE(x.is_product, FALSE),
          x.ocr_text,
          NOW(),
          NULLIF(TRIM(COALESCE(x.pin_created_at, '')), '')::timestamptz,
          COALESCE(x.age_days, 180),
          COALESCE(x.daily_velocity, 0),
          COALESCE(NULLIF(x.provenance_engine, ''), 'P2P_TWO_TOWER'),
          COALESCE(x.individual_prod_score, 0),
          COALESCE(x.recgpt_transition_score, 0),
          COALESCE(NULLIF(x.sequence_role, ''), 'DIRECT_MATCH'),
          COALESCE(x.is_recgpt_candidate, FALSE),
          COALESCE(x.visual_entropy_score, 0),
          x.image_url,
          COALESCE(x.is_video, FALSE),
          COALESCE(NULLIF(x.ingestion_method, ''), 'uploaded'),
          NULLIF(x.creator_username, ''),
          NULLIF(x.creator_name, '')
        FROM (
          SELECT *
          FROM jsonb_to_recordset(${payload}::jsonb) AS raw(
            seed_pin_id varchar,
            candidate_pin_id varchar,
            title text,
            dominant_color varchar,
            aspect_ratio numeric,
            saves bigint,
            repins bigint,
            save_rate numeric,
            domain text,
            destination_url text,
            is_product boolean,
            ocr_text text,
            pin_created_at text,
            age_days numeric,
            daily_velocity numeric,
            provenance_engine varchar,
            individual_prod_score numeric,
            recgpt_transition_score numeric,
            sequence_role varchar,
            is_recgpt_candidate boolean,
            visual_entropy_score numeric,
            image_url text,
            is_video boolean,
            ingestion_method varchar,
            creator_username varchar,
            creator_name varchar
          )
          ORDER BY raw.seed_pin_id ASC, raw.candidate_pin_id ASC
        ) x
        ON CONFLICT (seed_pin_id, candidate_pin_id) DO UPDATE SET
          title = COALESCE(NULLIF(EXCLUDED.title, ''), candidate_graph_nodes.title),
          dominant_color = COALESCE(NULLIF(NULLIF(EXCLUDED.dominant_color, ''), '#888888'), candidate_graph_nodes.dominant_color),
          aspect_ratio = COALESCE(EXCLUDED.aspect_ratio, candidate_graph_nodes.aspect_ratio),
          saves = CASE
            WHEN EXCLUDED.saves IS NOT NULL AND EXCLUDED.saves > 0 THEN EXCLUDED.saves
            ELSE COALESCE(candidate_graph_nodes.saves, EXCLUDED.saves)
          END,
          repins = CASE
            WHEN EXCLUDED.repins IS NOT NULL AND EXCLUDED.repins > 0 THEN EXCLUDED.repins
            ELSE COALESCE(candidate_graph_nodes.repins, EXCLUDED.repins, 0)
          END,
          save_rate = CASE
            WHEN EXCLUDED.repins > 0 AND (CASE WHEN EXCLUDED.saves IS NOT NULL AND EXCLUDED.saves > 0 THEN EXCLUDED.saves ELSE candidate_graph_nodes.saves END) > 0
              THEN ROUND((EXCLUDED.repins::numeric / (CASE WHEN EXCLUDED.saves IS NOT NULL AND EXCLUDED.saves > 0 THEN EXCLUDED.saves ELSE candidate_graph_nodes.saves END)::numeric) * 100, 2)
            WHEN candidate_graph_nodes.repins > 0 AND (CASE WHEN EXCLUDED.saves IS NOT NULL AND EXCLUDED.saves > 0 THEN EXCLUDED.saves ELSE candidate_graph_nodes.saves END) > 0
              THEN ROUND((candidate_graph_nodes.repins::numeric / (CASE WHEN EXCLUDED.saves IS NOT NULL AND EXCLUDED.saves > 0 THEN EXCLUDED.saves ELSE candidate_graph_nodes.saves END)::numeric) * 100, 2)
            ELSE COALESCE(EXCLUDED.save_rate, candidate_graph_nodes.save_rate)
          END,
          domain = COALESCE(NULLIF(EXCLUDED.domain, ''), candidate_graph_nodes.domain),
          destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), candidate_graph_nodes.destination_url),
          is_product = COALESCE(candidate_graph_nodes.is_product, FALSE) OR COALESCE(EXCLUDED.is_product, FALSE),
          ocr_text = COALESCE(NULLIF(EXCLUDED.ocr_text, ''), candidate_graph_nodes.ocr_text),
          extracted_at = NOW(),
          pin_created_at = COALESCE(EXCLUDED.pin_created_at, candidate_graph_nodes.pin_created_at),
          age_days = COALESCE(EXCLUDED.age_days, candidate_graph_nodes.age_days),
          daily_velocity = COALESCE(EXCLUDED.daily_velocity, candidate_graph_nodes.daily_velocity, 0),
          provenance_engine = COALESCE(NULLIF(EXCLUDED.provenance_engine, ''), candidate_graph_nodes.provenance_engine),
          individual_prod_score = EXCLUDED.individual_prod_score,
          recgpt_transition_score = EXCLUDED.recgpt_transition_score,
          sequence_role = COALESCE(NULLIF(EXCLUDED.sequence_role, ''), candidate_graph_nodes.sequence_role),
          is_recgpt_candidate = EXCLUDED.is_recgpt_candidate,
          visual_entropy_score = EXCLUDED.visual_entropy_score,
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), candidate_graph_nodes.image_url),
          is_video = COALESCE(candidate_graph_nodes.is_video, FALSE) OR COALESCE(EXCLUDED.is_video, FALSE),
          ingestion_method = COALESCE(NULLIF(EXCLUDED.ingestion_method, ''), candidate_graph_nodes.ingestion_method),
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), candidate_graph_nodes.creator_username),
          creator_name = COALESCE(NULLIF(EXCLUDED.creator_name, ''), candidate_graph_nodes.creator_name);
      `);
    } else {
      await execQuery(() => sql`
        INSERT INTO candidate_graph_nodes (
          seed_pin_id, candidate_pin_id, title, image_url, dominant_color,
          saves, repins, domain, destination_url, is_product,
          creator_username, creator_name, provenance_engine, extracted_at
        )
        SELECT
          x.seed_pin_id,
          x.candidate_pin_id,
          x.title,
          x.image_url,
          COALESCE(NULLIF(x.dominant_color, ''), '#888888'),
          x.saves,
          COALESCE(x.repins, 0),
          x.domain,
          NULLIF(x.destination_url, ''),
          COALESCE(x.is_product, FALSE),
          NULLIF(x.creator_username, ''),
          NULLIF(x.creator_name, ''),
          COALESCE(NULLIF(x.provenance_engine, ''), 'P2P_TWO_TOWER'),
          NOW()
        FROM (
          SELECT *
          FROM jsonb_to_recordset(${payload}::jsonb) AS raw(
            seed_pin_id varchar,
            candidate_pin_id varchar,
            title text,
            image_url text,
            dominant_color varchar,
            saves bigint,
            repins bigint,
            domain text,
            destination_url text,
            is_product boolean,
            creator_username varchar,
            creator_name varchar,
            provenance_engine varchar
          )
          ORDER BY raw.seed_pin_id ASC, raw.candidate_pin_id ASC
        ) x
        ON CONFLICT (seed_pin_id, candidate_pin_id) DO UPDATE SET
          title = COALESCE(NULLIF(EXCLUDED.title, ''), candidate_graph_nodes.title),
          image_url = COALESCE(NULLIF(EXCLUDED.image_url, ''), candidate_graph_nodes.image_url),
          dominant_color = COALESCE(NULLIF(NULLIF(EXCLUDED.dominant_color, ''), '#888888'), candidate_graph_nodes.dominant_color),
          saves = CASE
            WHEN EXCLUDED.saves IS NOT NULL AND EXCLUDED.saves > 0 THEN EXCLUDED.saves
            ELSE COALESCE(candidate_graph_nodes.saves, EXCLUDED.saves)
          END,
          repins = CASE
            WHEN EXCLUDED.repins IS NOT NULL AND EXCLUDED.repins > 0 THEN EXCLUDED.repins
            ELSE COALESCE(candidate_graph_nodes.repins, EXCLUDED.repins, 0)
          END,
          domain = COALESCE(NULLIF(EXCLUDED.domain, ''), candidate_graph_nodes.domain),
          destination_url = COALESCE(NULLIF(EXCLUDED.destination_url, ''), candidate_graph_nodes.destination_url),
          is_product = COALESCE(candidate_graph_nodes.is_product, FALSE) OR COALESCE(EXCLUDED.is_product, FALSE),
          creator_username = COALESCE(NULLIF(EXCLUDED.creator_username, ''), candidate_graph_nodes.creator_username),
          creator_name = COALESCE(NULLIF(EXCLUDED.creator_name, ''), candidate_graph_nodes.creator_name),
          extracted_at = NOW();
      `);
    }
  }

  return { upsertedCount: prepared.length, batches: chunks.length };
}

/**
 * Orphan-safe pruning of `candidate_graph_nodes` edges for given seed pin IDs.
 * Only deletes edges whose `seed_pin_id` is absent from BOTH `cluster_seeds`
 * AND `competitor_seed_pins`, preventing cross-queue data loss on shared seeds.
 */
export async function pruneOrphanCandidateGraphNodes(sql, seedPinIds) {
  const list = Array.isArray(seedPinIds) ? seedPinIds : [seedPinIds];
  const cleanIds = [...new Set(list.map(id => String(id || '').trim()).filter(Boolean))];
  if (cleanIds.length === 0) return { prunedSeedIds: [] };

  await sql`
    DELETE FROM candidate_graph_nodes cgn
    WHERE cgn.seed_pin_id = ANY(${cleanIds}::varchar[])
      AND NOT EXISTS (
        SELECT 1 FROM cluster_seeds cs WHERE cs.pin_id = cgn.seed_pin_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM competitor_seed_pins csp WHERE csp.pin_id = cgn.seed_pin_id
      );
  `;

  return { prunedSeedIds: cleanIds };
}
