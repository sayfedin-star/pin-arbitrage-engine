#!/usr/bin/env node

/**
 * Account-Scoped Related Pins & Intersections Crawler
 * 100% Zero-Cookie Architecture.
 * Extracts Pinterest RelatedModulesResource graph nodes for specific competitor seeds.
 * Captures Pixie Telemetry, calculates Account Retention Rate, and stores into Unified PostgreSQL.
 */

import { sanitizeForJsonb } from '../src/utils.mjs';
import {
  randomJitterMs,
  sleep,
  setDefaultDispatcher
} from '../src/core/pinterest/index.mjs';
import {
  buildZoneARelatedModulesHeaders,
  fetchRelatedModulesWithZoneA
} from '../src/modules/newborn/cookie-router.mjs';
import { resolveNewbornRawCookie } from '../src/modules/newborn/settings.mjs';
import {
  extractCreatorAndLinkMeta,
  upsertCandidateGraphEdges
} from '../src/modules/related-pins/graph-writer.mjs';

import {
  runFleetLifecycle
} from './lib/fleet-runner.mjs';

let sql = null;
let undiciAgent = null;

function getCliArg(flag) {
  const eq = process.argv.find(a => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=')[1];
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx < process.argv.length - 1) return process.argv[idx + 1];
  return '';
}

// Configuration & CLI args
const targetAccountArg = process.env.TARGET_ACCOUNT || getCliArg('--account') || '';
const targetPinIdsArg = process.env.TARGET_PIN_IDS || getCliArg('--pins') || '';
const maxPages = Math.min(Math.max(1, parseInt(process.env.MAX_PAGES || getCliArg('--pages') || '2', 10)), 10);

const cleanAccount = String(targetAccountArg || '').replace(/^@+/, '').trim().toLowerCase();

let isShuttingDown = false;
process.on('SIGINT', () => {
  console.log('\n[!] SIGINT received. Completing active work and exiting gracefully...');
  isShuttingDown = true;
});
process.on('SIGTERM', () => {
  console.log('\n[!] SIGTERM received. Completing active work and exiting gracefully...');
  isShuttingDown = true;
});

export function buildAccountRelatedHeaders(seedPinId, rawCookie = '') {
  return buildZoneARelatedModulesHeaders({ pinId: seedPinId, rawCookie });
}

export async function crawlSeedPin(competitorId, seedPinId, targetUsername, options = {}) {
  const dbSql = options.sql || sql;
  const pageCap = options.maxPages !== undefined
    ? Math.min(Math.max(1, Number(options.maxPages) || 1), 10)
    : maxPages;
  const resolvedCookie = typeof options.rawCookie === 'string'
    ? options.rawCookie
    : (await resolveNewbornRawCookie(dbSql, options.env || process.env).catch(() => ({ rawCookie: '' })))?.rawCookie || '';

  console.log(`\n[*] ---> Scraping Related Nodes for Seed Pin: ${seedPinId} (Account: @${targetUsername})...`);
  let totalDiscoveredForSeed = 0;
  let bookmark = null;

  for (let page = 1; page <= pageCap; page++) {
    if (page > 1) {
      const delay = options.skipDelay ? 0 : randomJitterMs(200, 400);
      if (delay > 0) await sleep(delay);
    }

    const optionsObj = {
      pin_id: String(seedPinId),
      additional_fields: ["pin.gen_ai_topics"],
      context_pin_ids: [],
      context_near_dup_image_sigs: [],
      homefeed_source_sig: null,
      page_size: 24,
      search_query: "",
      source: "deep_linking",
      top_level_source: "deep_linking",
      top_level_source_depth: 1,
      is_pdp: false,
      client_tracking_params: "CwABAAAAEDE0ODExNTU0MzQxNjE4ODgLAAcAAAAPdW5rbm93bi91bmtub3duAA"
    };
    if (bookmark) {
      optionsObj.bookmarks = [bookmark];
    }

    const dataParam = JSON.stringify({
      options: optionsObj,
      context: {}
    });

    const url = `https://www.pinterest.com/resource/RelatedModulesResource/get/?source_url=${encodeURIComponent(`/pin/${seedPinId}/`)}&data=${encodeURIComponent(dataParam)}`;

    let zoneRes;
    try {
      zoneRes = await fetchRelatedModulesWithZoneA(url, {
        pinId: String(seedPinId),
        sql: dbSql,
        env: options.env || process.env,
        rawCookie: resolvedCookie,
        fetchImpl: options.fetchImpl,
        dispatcher: undiciAgent,
        timeoutMs: 8000
      });
    } catch (err) {
      console.warn(`    [-] Network timeout / abort on page ${page} for seed ${seedPinId}:`, err.message);
      break;
    }

    if (!zoneRes.ok || !zoneRes.data) {
      console.warn(`    [-] HTTP ${zoneRes.status} on page ${page} for seed ${seedPinId}. Skipping further pages.`);
      break;
    }

    const json = zoneRes.data;

    const resResponse = json?.resource_response || json;
    const items = resResponse?.data || [];
    bookmark = resResponse?.bookmark || null;

    if (items.length === 0) {
      console.log(`    [*] End of feed at page ${page}.`);
      break;
    }

    // Extract valid pins & upsert into unified candidate_graph_nodes via shared graph writer
    const rawEdges = [];
    for (const item of items) {
      const isPin = item?.type === 'pin' || (item?.id && /^\d+$/.test(String(item.id)));
      if (!isPin) continue;

      const candId = String(item.id);
      if (candId === String(seedPinId)) continue; // ignore self-reference

      const title = typeof item.title === 'string' ? item.title : (typeof item.grid_title === 'string' ? item.grid_title : '');
      const rawSaves = item.aggregated_pin_data?.aggregated_stats?.saves ?? item.save_count;
      const saves = (rawSaves !== null && rawSaves !== undefined && String(rawSaves).trim() !== '' && Number.isFinite(Number(rawSaves)))
        ? Math.max(0, Math.round(Number(rawSaves)))
        : null;
      const rawRepins = item.repin_count;
      const repins = (rawRepins !== null && rawRepins !== undefined && String(rawRepins).trim() !== '' && Number.isFinite(Number(rawRepins)))
        ? Math.max(0, Math.round(Number(rawRepins)))
        : null;
      const meta = extractCreatorAndLinkMeta(item);
      const img = item.images?.['236x']?.url || item.images?.['736x']?.url || item.images?.orig?.url || '';
      const rawColor = typeof item.dominant_color === 'string' ? item.dominant_color.trim() : '';
      const dominantColor = (rawColor && rawColor.toLowerCase() !== '#888888') ? rawColor : null;
      const isProduct = Boolean(item.is_product || item.commerce_product);

      rawEdges.push({
        seed_pin_id: String(seedPinId),
        candidate_pin_id: candId,
        title: title.slice(0, 500),
        image_url: img,
        dominant_color: dominantColor,
        saves,
        repins,
        domain: meta.domain,
        clean_domain: meta.clean_domain,
        destination_url: meta.destination_url,
        is_product: isProduct,
        creator_username: meta.creator_username,
        creator_name: meta.creator_name,
        provenance_engine: 'P2P_TWO_TOWER'
      });
    }

    if (rawEdges.length > 0) {
      const { upsertedCount } = await upsertCandidateGraphEdges(dbSql, rawEdges, {
        mode: 'quick',
        chunkSize: 100,
        defaultSeedPinId: String(seedPinId)
      });

      totalDiscoveredForSeed += upsertedCount;
      console.log(`    [+] Page ${page}: Upserted ${upsertedCount} related nodes into candidate_graph_nodes.`);
    }

    if (!bookmark) break;
  }

  // Update last_crawled_at for this seed only if crawl was successful (discovered nodes > 0) [CAP-28]
  if (totalDiscoveredForSeed > 0) {
    await dbSql`
      UPDATE competitor_seed_pins 
      SET last_crawled_at = NOW() 
      WHERE competitor_id = ${competitorId} AND pin_id = ${String(seedPinId)};
    `;
  }

  return totalDiscoveredForSeed;
}

async function main() {
  console.log('================================================================');
  console.log('🚀 Account-Scoped Related Pins & Intersections Crawler Engine');
  console.log('================================================================');

  if (!cleanAccount) {
    console.error('[-] FATAL: TARGET_ACCOUNT is required (e.g. TARGET_ACCOUNT=freshmancook)');
    process.exitCode = 1;
    return;
  }

  // 1. Resolve Competitor Profile
  const [comp] = await sql`
    SELECT id, username, display_name 
    FROM competitor_profiles 
    WHERE LOWER(username) = ${cleanAccount}
    LIMIT 1;
  `;

  let competitorId;
  let username = cleanAccount;

  if (comp) {
    competitorId = comp.id;
    username = comp.username;
    console.log(`[+] Found Competitor Profile #${competitorId}: @${username}`);
  } else {
    // Upsert a profile row if not existing
    console.log(`[*] Competitor @${cleanAccount} not tracked yet. Auto-registering...`);
    const [inserted] = await sql`
      INSERT INTO competitor_profiles (username, display_name, account_type, activity_status)
      VALUES (${cleanAccount}, ${cleanAccount}, 'competitor', 'active')
      ON CONFLICT (username) DO UPDATE SET updated_at = NOW()
      RETURNING id, username;
    `;
    competitorId = inserted.id;
    username = inserted.username;
  }

  // 2. Identify Target Seed Pins
  let seedIds = [];
  if (targetPinIdsArg) {
    seedIds = targetPinIdsArg.split(/[\s,]+/).map(s => s.trim().replace(/\D+/g, '')).filter(Boolean);
    console.log(`[+] Explicit Pin IDs supplied via args (${seedIds.length} seeds):`, seedIds);
  } else {
    // Read from competitor_seed_pins
    const dbSeeds = await sql`
      SELECT pin_id 
      FROM competitor_seed_pins 
      WHERE competitor_id = ${competitorId}
      ORDER BY created_at DESC;
    `;
    seedIds = dbSeeds.map(r => r.pin_id);
    console.log(`[+] Loaded ${seedIds.length} stored seeds from competitor_seed_pins for #${competitorId}`);
  }

  if (seedIds.length === 0) {
    // Fail-safe auto-seeding: fetch top 10 saved pins from competitor_board_pins if available
    const topPins = await sql`
      SELECT cbp.pin_id 
      FROM competitor_board_pins cbp
      JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
      WHERE cbp.competitor_id = ${competitorId} 
      ORDER BY ump.save_count DESC NULLS LAST 
      LIMIT 10;
    `;
    if (topPins.length > 0) {
      seedIds = topPins.map(p => p.pin_id);
      console.log(`[*] No explicit seeds found, auto-seeded top ${seedIds.length} winning pins from competitor_board_pins.`);
    } else {
      console.log('[-] No seed pins found to crawl. Register seeds first via UI or --pins argument.');
      return;
    }
  }

  // Atomically ensure all seedIds exist in competitor_seed_pins with metadata (Deadlock-Free Batch Upsert)
  const cleanSeedIds = [...new Set(seedIds)].sort();
  if (cleanSeedIds.length > 0) {
    const metaRows = await sql`
      SELECT cbp.pin_id, ump.title, ump.image_url, ump.board_name, ump.save_count
      FROM competitor_board_pins cbp
      JOIN universal_master_pins ump ON ump.pin_id = cbp.pin_id
      WHERE cbp.competitor_id = ${competitorId} AND cbp.pin_id = ANY(${cleanSeedIds});
    `;
    const metaMap = new Map();
    for (const m of metaRows) metaMap.set(m.pin_id, m);

    const seedRecords = cleanSeedIds.map(sid => {
      const meta = metaMap.get(sid);
      return {
        competitor_id: competitorId,
        pin_id: sid,
        title: (meta?.title || `Seed ${sid}`).slice(0, 500),
        image_url: meta?.image_url || null,
        board_name: (meta?.board_name || null)?.slice(0, 255),
        save_count: Number(meta?.save_count || 0)
      };
    });

    seedRecords.sort((a, b) => a.pin_id.localeCompare(b.pin_id));

    await sql`
      INSERT INTO universal_master_pins (pin_id, first_discovered_pillar)
      SELECT x.pin_id, 'creator'
      FROM jsonb_to_recordset(${JSON.stringify(sanitizeForJsonb(seedRecords))}::jsonb) AS x(pin_id varchar)
      ON CONFLICT (pin_id) DO NOTHING;
    `;

    await sql`
      INSERT INTO competitor_seed_pins (competitor_id, pin_id, title, image_url, board_name, save_count)
      SELECT x.competitor_id, x.pin_id, x.title, x.image_url, x.board_name, x.save_count
      FROM jsonb_to_recordset(${JSON.stringify(sanitizeForJsonb(seedRecords))}::jsonb) AS x(
        competitor_id int, pin_id varchar, title text, image_url text, board_name varchar, save_count bigint
      )
      ON CONFLICT (competitor_id, pin_id) DO UPDATE SET
        title = CASE WHEN EXCLUDED.title <> '' AND EXCLUDED.title NOT LIKE 'Seed %' THEN EXCLUDED.title ELSE competitor_seed_pins.title END,
        image_url = COALESCE(EXCLUDED.image_url, competitor_seed_pins.image_url),
        board_name = COALESCE(EXCLUDED.board_name, competitor_seed_pins.board_name),
        save_count = CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE competitor_seed_pins.save_count END;
    `;
  }

  // 3. Harvest each seed
  for (let i = 0; i < seedIds.length; i++) {
    if (isShuttingDown) {
      console.log('[!] Graceful shutdown initiated. Skipping remaining seeds.');
      break;
    }
    const sid = seedIds[i];
    console.log(`\n=============================================================`);
    console.log(`[Seed ${i + 1}/${seedIds.length}] Processing Seed Pin: ${sid}`);
    console.log(`=============================================================`);
    try {
      await crawlSeedPin(competitorId, sid, username);
    } catch (err) {
      console.error(`[-] Error crawling seed ${sid}:`, err.message);
    }
  }

  // 4. Compute Account Intelligence & Retention Telemetry (strictly inner join active seeds)
  console.log('\n================================================================');
  console.log('📊 Account Graph Radar & Retention Summary');
  console.log('================================================================');

  const [retentionRow] = await sql`
    SELECT 
      COUNT(*)::int AS total_nodes,
      COUNT(DISTINCT cgn.candidate_pin_id)::int AS unique_candidates,
      COUNT(*) FILTER (
        WHERE BTRIM(COALESCE(cgn.creator_username, '')) <> ''
          AND LOWER(LTRIM(BTRIM(cgn.creator_username), '@')) = LOWER(LTRIM(BTRIM(COALESCE(cp.username, '')), '@'))
      )::int AS self_nodes,
      COUNT(*) FILTER (
        WHERE NOT (
          BTRIM(COALESCE(cgn.creator_username, '')) <> ''
          AND LOWER(LTRIM(BTRIM(cgn.creator_username), '@')) = LOWER(LTRIM(BTRIM(COALESCE(cp.username, '')), '@'))
        )
      )::int AS rival_nodes
    FROM competitor_seed_pins csp
    INNER JOIN competitor_profiles cp ON cp.id = csp.competitor_id
    INNER JOIN candidate_graph_nodes cgn ON cgn.seed_pin_id = csp.pin_id
    WHERE csp.competitor_id = ${competitorId};
  `;

  const totalNodes = Number(retentionRow?.total_nodes || 0);
  const uniqueCand = Number(retentionRow?.unique_candidates || 0);
  const selfNodes = Number(retentionRow?.self_nodes || 0);
  const rivalNodes = Number(retentionRow?.rival_nodes || 0);
  const retentionRate = totalNodes > 0 ? ((selfNodes / totalNodes) * 100).toFixed(1) : 0;
  const leakageRate = (100 - Number(retentionRate)).toFixed(1);

  console.log(`  Total Related Nodes Tracked:    ${totalNodes}`);
  console.log(`  Unique Candidate Pins:         ${uniqueCand}`);
  console.log(`  Self-Retention Pins (Own):     ${selfNodes} (${retentionRate}%)`);
  console.log(`  Traffic Leakage Pins (Rivals): ${rivalNodes} (${leakageRate}%)`);

  // 5. Intersections Count (Multi-Seed Overlap >= 2 among active registered seeds)
  const [intersectionsRow] = await sql`
    SELECT COUNT(*)::int AS multi_hit_hubs
    FROM (
      SELECT cgn.candidate_pin_id
      FROM competitor_seed_pins csp
      INNER JOIN candidate_graph_nodes cgn ON cgn.seed_pin_id = csp.pin_id
      WHERE csp.competitor_id = ${competitorId}
      GROUP BY cgn.candidate_pin_id
      HAVING COUNT(DISTINCT cgn.seed_pin_id) >= 2
    ) sub;
  `;
  const multiHitHubs = Number(intersectionsRow?.multi_hit_hubs || 0);
  console.log(`  🎯 Multi-Seed Intersections (2+ Seeds): ${multiHitHubs} Hubs`);
  console.log('================================================================\n');
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const isDirectRun = Boolean(
  process.argv[1] && (
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('account-related-crawler.mjs')
  )
);

if (isDirectRun) {
  runFleetLifecycle(
    'account-related-crawler',
    async ({ sql: lifecycleSql, dispatcher }) => {
      sql = lifecycleSql;
      undiciAgent = dispatcher;
      await main();
    },
    { setDefaultDispatcher }
  ).then(() => {
    if (process.exitCode) {
      process.exit(process.exitCode);
    }
  }).catch((err) => {
    console.error('[-] Fatal error in crawler:', err);
    process.exit(1);
  });
}
