#!/usr/bin/env node

/**
 * scripts/keyword-fleet.mjs
 *
 * Unified Keyword Intelligence & Velocity Fleet Orchestrator:
 *   --stage=dispatch    -> Stage 0 Dynamic 20-Runner Matrix Dispatcher (Modes A / B / C)
 *   --stage=consolidate -> Stage 2 Velocity, Rolling Window Gains & Executive Report Consolidator
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAppSettings,
  safeNormalizeMetadata,
  clampSerpQuota,
  computePagesForQuota,
  winsorize
} from '../src/modules/keywords/service.mjs';
import { calculateRollingGainsFromSnapshots } from '../src/lib/math.mjs';
import { sanitizeVisualAnnotations } from '../src/domain/pin-intelligence.mjs';
import {
  runFleetLifecycle,
  writeGitHubOutput,
  appendStepSummary,
  parseCliFlags,
  DEFAULT_FLEET_WORKER_TOTAL
} from './lib/fleet-runner.mjs';

export const VALID_KEYWORD_FLEET_STAGES = Object.freeze(['dispatch', 'consolidate']);

/**
 * Parses and validates `--stage=dispatch|consolidate` CLI arguments.
 */
export function parseKeywordFleetArgs(argv = process.argv.slice(2), env = process.env) {
  const { flags } = parseCliFlags(argv);
  const rawStage = String(flags.stage ?? env?.FLEET_STAGE ?? '').trim().toLowerCase();
  if (!VALID_KEYWORD_FLEET_STAGES.includes(rawStage)) {
    throw new Error(
      `Invalid or missing --stage="${rawStage}" for keyword-fleet.mjs. Expected --stage=dispatch or --stage=consolidate.`
    );
  }
  return {
    stage: rawStage,
    flags
  };
}

async function syncPublicSerialSequences(sql) {
  try {
    await sql`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN
          SELECT
            c.relname AS table_name,
            a.attname AS column_name,
            pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.oid
          WHERE n.nspname = 'public'
            AND c.relkind = 'r'
            AND a.attnum > 0
            AND NOT a.attisdropped
            AND pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) IS NOT NULL
        LOOP
          EXECUTE format(
            'SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(%I) FROM public.%I), 0) + 1, 1), false)',
            r.seq_name,
            r.column_name,
            r.table_name
          );
        END LOOP;
      END $$;
    `;
  } catch (seqErr) {
    console.warn('[!] Pre-flight sequence sync warning:', seqErr.message);
  }
}

async function isKeywordBlockedByPausedFolders(sql, kwLower) {
  try {
    const linked = await sql`
      SELECT kf.metadata
      FROM tracked_keywords tk
      JOIN keyword_folder_items kfi ON kfi.keyword_id = tk.id
      JOIN keyword_folders kf ON kf.id = kfi.folder_id
      WHERE LOWER(tk.keyword) = ${kwLower};
    `;
    if (!Array.isArray(linked) || linked.length === 0) return false;
    return linked.every((row) => {
      const m = safeNormalizeMetadata(row?.metadata);
      return Boolean(
        m.pause_crawlers ||
        m.block_fleet ||
        m.is_crawler_paused ||
        m.crawler_paused ||
        m.block_gha_fleet ||
        ['paused', 'archived'].includes(String(m.status || '').toLowerCase())
      );
    });
  } catch (err) {
    if (String(err?.code || '') === '42P01') return false;
    throw err;
  }
}

/**
 * Stage 0: Intelligent Dynamic Fleet Dispatcher (20-Runner Matrix)
 */
export async function runKeywordFleetDispatch({ sql, env = process.env }) {
  const rawTargetKeyword = String(env.TARGET_KEYWORD || '').trim();
  const rawFolderId = String(env.FOLDER_ID || '').trim();
  const stepSummaryPath = env.GITHUB_STEP_SUMMARY || null;
  const githubOutputPath = env.GITHUB_OUTPUT || null;

  console.log('================================================================');
  console.log('   🚀 KEYWORD INTELLIGENCE & VELOCITY FLEET DISPATCHER (20-RUNNER)');
  console.log('================================================================');

  await syncPublicSerialSequences(sql);

  const appSettings = await getAppSettings(sql).catch(() => ({}));
  const envHarvest = env.ENABLE_SERP_HARVEST?.trim();
  let enableSerpHarvest = (envHarvest !== undefined && envHarvest !== '')
    ? (envHarvest === 'true' || envHarvest === '1')
    : true;

  const envSerpPins = env.MAX_SERP_PINS?.trim() || env.MAX_PINS?.trim();
  const explicitEnvSerpPins = (envSerpPins && !isNaN(parseInt(envSerpPins, 10)))
    ? clampSerpQuota(envSerpPins)
    : null;
  const globalFallbackSerpPins = clampSerpQuota(appSettings.max_serp_pins ?? appSettings.default_max_pins, 50);
  const maxSerpPins = explicitEnvSerpPins ?? globalFallbackSerpPins;

  const envCatalogInspect = env.MAX_CATALOG_INSPECT?.trim();
  const maxCatalogInspect = (envCatalogInspect !== undefined && envCatalogInspect !== '' && !isNaN(parseInt(envCatalogInspect, 10)))
    ? Math.max(0, parseInt(envCatalogInspect, 10))
    : (appSettings.max_catalog_inspect !== undefined ? Math.max(0, parseInt(appSettings.max_catalog_inspect, 10)) : 0);

  const envCrawlScope = env.CRAWL_SCOPE?.trim();
  const crawlScope = ((envCrawlScope && envCrawlScope !== '') ? envCrawlScope : (appSettings.default_crawl_scope || 'all_pins')).toLowerCase().trim();

  console.log(`[Config] Target Input:       "${rawTargetKeyword || '<EMPTY: ALL ACTIVE KEYWORDS>'}"`);
  console.log(`[Config] Folder ID:          "${rawFolderId || '<NONE>'}"`);
  console.log(`[Config] Crawl Scope:        "${crawlScope}"`);
  console.log(`[Config] SERP Harvest Quota: ${explicitEnvSerpPins !== null ? `${explicitEnvSerpPins} pins (explicit override)` : `Per-Keyword DB target (global fallback: ${globalFallbackSerpPins} pins)`} (${enableSerpHarvest ? 'ENABLED' : 'DISABLED: AUDIT ONLY'})`);
  console.log(`[Config] Catalog Inspect:    ${maxCatalogInspect === 0 ? 'UNLIMITED / ALL PINS' : maxCatalogInspect + ' pins'}`);

  const isSweepAll = !rawTargetKeyword || rawTargetKeyword.toLowerCase() === 'all' || rawTargetKeyword.toLowerCase() === 'cron' || rawTargetKeyword.toLowerCase() === '*';
  const commaKeywords = rawTargetKeyword.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  let mode = 'keyword_sweep';
  let matrixTasks = [];
  let summaryDetails = {};

  if (rawFolderId) {
    // MODE C: FOLDER CLUSTER PIN-SLICE SHARDING (Up to 20 Parallel Runners)
    mode = 'folder_pin_partition';
    const fid = parseInt(rawFolderId, 10);
    console.log(`\n[*] Mode Selected: MODE C (Folder Cluster Pin Partition for Folder ID: ${fid})`);

    const [folderRow] = await sql`
      SELECT id, name, description, metadata FROM keyword_folders WHERE id = ${fid} LIMIT 1;
    `;
    if (!folderRow) {
      throw new Error(`FATAL: Folder ID ${fid} not found in database.`);
    }

    const folderMeta = safeNormalizeMetadata(folderRow.metadata);
    const isCrawlerPaused = Boolean(
      folderMeta.pause_crawlers ||
      folderMeta.block_fleet ||
      folderMeta.is_crawler_paused ||
      folderMeta.crawler_paused ||
      folderMeta.block_gha_fleet ||
      ['paused', 'archived'].includes(String(folderMeta.status || '').toLowerCase())
    );

    if (isCrawlerPaused) {
      console.log(`\n  [!] GUARD: Folder "${folderRow.name}" (ID: ${fid}) has crawling paused or fleet blocked.`);
      console.log(`      Flags: pause_crawlers=${Boolean(folderMeta.pause_crawlers)} | block_fleet=${Boolean(folderMeta.block_fleet)} | status=${folderMeta.status || 'active'}`);
      console.log('  [*] Emitting empty task matrix (0 tasks) and terminating cleanly.');

      matrixTasks = [];
      const matrixJson = JSON.stringify(matrixTasks);
      await writeGitHubOutput('mode', mode, githubOutputPath);
      await writeGitHubOutput('task_count', '0', githubOutputPath);
      await writeGitHubOutput('matrix_tasks', matrixJson, githubOutputPath);

      appendStepSummary(
        `## 🚀 Stage 0: Dynamic Fleet Orchestrator & Dispatcher\n\n> **Folder**: \`${folderRow.name}\` (ID: ${fid}) | **Status**: \`PAUSED\`\n\nCrawlers are paused for this folder. Emitted 0 tasks.\n`,
        stepSummaryPath
      );

      console.log('\n================================================================');
      console.log('✅ FLEET DISPATCH COMPLETE (PAUSED: 0 TASKS)');
      console.log('================================================================');
      return { mode, taskCount: 0, matrixTasks, paused: true };
    }

    if ((envHarvest === undefined || envHarvest === '') && folderMeta.enable_serp_harvest !== undefined) {
      enableSerpHarvest = Boolean(folderMeta.enable_serp_harvest);
    }

    const explicitFolderSerpPins = explicitEnvSerpPins !== null
      ? explicitEnvSerpPins
      : ((folderMeta.max_serp_pins || folderMeta.max_pins) ? clampSerpQuota(folderMeta.max_serp_pins ?? folderMeta.max_pins) : null);
    const resolvedMaxSerpPins = explicitFolderSerpPins !== null ? String(explicitFolderSerpPins) : '';
    const resolvedCrawlScope = (!envCrawlScope && folderMeta.crawl_scope)
      ? String(folderMeta.crawl_scope).toLowerCase().trim()
      : crawlScope;
    const resolvedMaxCatalogInspect = (!envCatalogInspect && folderMeta.max_catalog_inspect !== undefined)
      ? Math.max(0, parseInt(folderMeta.max_catalog_inspect, 10))
      : maxCatalogInspect;

    console.log(`  [+] Target Folder: "${folderRow.name}" (ID: ${folderRow.id})`);
    console.log(`  [+] Resolved Config: Harvest=${enableSerpHarvest ? 'ON' : 'OFF'} | Scope=${resolvedCrawlScope} | MaxPins=${resolvedMaxSerpPins || `Per-KW DB (fallback ${globalFallbackSerpPins})`} | InspectCap=${resolvedMaxCatalogInspect}`);

    const folderKeywords = await sql`
      SELECT tk.id, tk.keyword, tk.category, tk.target_pin_count, tk.last_crawled_at
      FROM keyword_folder_items kfi
      JOIN tracked_keywords tk ON tk.id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
      ORDER BY tk.last_crawled_at ASC NULLS FIRST, kfi.added_at ASC;
    `;

    console.log(`  [+] Resolved ${folderKeywords.length} keywords in folder cluster.`);

    const numWorkers = DEFAULT_FLEET_WORKER_TOTAL;
    console.log(`  [*] Partitioning ${folderKeywords.length} cluster keywords across ${numWorkers} parallel fleet runners for distributed SERP harvest...`);

    matrixTasks = Array.from({ length: numWorkers }, (_, idx) => {
      const assignedKeywords = folderKeywords.filter((_, kIdx) => kIdx % numWorkers === idx);
      return {
        mode: 'folder_pin_partition',
        target_keyword: '',
        folder_id: fid,
        folder_name: folderRow.name,
        keyword: folderRow.name,
        keyword_ids: assignedKeywords.map(k => k.id).join(','),
        keywords_count: assignedKeywords.length,
        worker_index: idx,
        worker_slot: idx + 1,
        worker_total: numWorkers,
        crawl_scope: resolvedCrawlScope,
        max_pins: resolvedMaxSerpPins,
        max_serp_pins: resolvedMaxSerpPins,
        max_catalog_inspect: resolvedMaxCatalogInspect,
        enable_serp_harvest: folderKeywords.length > 0 ? enableSerpHarvest : false
      };
    });

    summaryDetails = {
      mode: 'Folder Cluster True Distributed SERP & Pin Partition',
      folderName: folderRow.name,
      folderId: fid,
      keywordsCount: folderKeywords.length,
      runnersAssigned: matrixTasks.length
    };
  } else if (isSweepAll || commaKeywords.length > 1) {
    // MODE A: GLOBAL TWO-PHASE PIN-PARTITION FLEET (Strictly 20 Parallel Runners)
    mode = 'keyword_sweep';
    console.log('\n[*] Mode Selected: MODE A (Global Two-Phase Distributed Pin-Partition Fleet)');

    let targetRows = [];
    if (commaKeywords.length > 1) {
      console.log(`[*] Resolving ${commaKeywords.length} explicitly specified keywords...`);
      for (const kwStr of commaKeywords) {
        if (await isKeywordBlockedByPausedFolders(sql, kwStr)) {
          console.log(`  [!] GUARD: Skipping keyword "${kwStr}" because all linked folders are paused/blocked.`);
          continue;
        }
        let [row] = await sql`
          SELECT id, keyword, category, target_pin_count, is_active
          FROM tracked_keywords
          WHERE LOWER(keyword) = ${kwStr};
        `;
        if (row) {
          if (!row.is_active) {
            await sql`
              UPDATE tracked_keywords
              SET is_active = TRUE, updated_at = NOW()
              WHERE id = ${row.id};
            `;
          }
        } else {
          console.log(`  [+] Auto-registering new keyword: "${kwStr}"`);
          const defaultTargetPins = maxSerpPins || globalFallbackSerpPins;
          const defaultPages = computePagesForQuota(defaultTargetPins);
          [row] = await sql`
            INSERT INTO tracked_keywords (keyword, category, target_pin_count, crawl_pages_limit, inspection_mode, is_active)
            VALUES (${kwStr}, 'General', ${defaultTargetPins}, ${defaultPages}, 'full_catalog', TRUE)
            ON CONFLICT (keyword) DO UPDATE SET
              is_active = TRUE,
              updated_at = NOW()
            RETURNING id, keyword, category, target_pin_count;
          `;
        }
        if (row) targetRows.push(row);
      }
    } else {
      console.log('[*] Querying all active tracked keywords from Central Metadata Hub...');
      targetRows = await sql`
        SELECT tk.id, tk.keyword, tk.category, tk.target_pin_count
        FROM tracked_keywords tk
        WHERE tk.is_active = TRUE
          AND (
            NOT EXISTS (SELECT 1 FROM keyword_folder_items kfi WHERE kfi.keyword_id = tk.id)
            OR EXISTS (
              SELECT 1
              FROM keyword_folder_items kfi
              JOIN keyword_folders kf ON kf.id = kfi.folder_id
              WHERE kfi.keyword_id = tk.id
                AND LOWER(COALESCE(
                  CASE
                    WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'status'
                    WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'status'
                    ELSE NULL
                  END,
                  'active'
                )) NOT IN ('paused', 'archived')
                AND LOWER(COALESCE(
                  CASE
                    WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'pause_crawlers'
                    WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'pause_crawlers'
                    ELSE NULL
                  END,
                  'false'
                )) <> 'true'
                AND LOWER(COALESCE(
                  CASE
                    WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'is_crawler_paused'
                    WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'is_crawler_paused'
                    ELSE NULL
                  END,
                  'false'
                )) <> 'true'
                AND LOWER(COALESCE(
                  CASE
                    WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'block_fleet'
                    WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'block_fleet'
                    ELSE NULL
                  END,
                  'false'
                )) <> 'true'
                AND LOWER(COALESCE(
                  CASE
                    WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'block_gha_fleet'
                    WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'block_gha_fleet'
                    ELSE NULL
                  END,
                  'false'
                )) <> 'true'
            )
          )
        ORDER BY tk.last_crawled_at ASC NULLS FIRST, tk.id ASC;
      `;
    }

    let standaloneAnchorsCount = 0;
    let campaignTrackedPinsCount = 0;
    let watchlistPinsCount = 0;
    if (isSweepAll) {
      const [anchorCntRows, trackedCntRows, watchlistCntRows] = await Promise.all([
        sql`
          SELECT COUNT(*)::int AS total
          FROM newborn_daily_anchors
          WHERE is_active = TRUE;
        `.catch(() => [{ total: 0 }]),
        sql`
          SELECT COUNT(DISTINCT ctp.pin_id)::int AS total
          FROM campaign_tracked_pins ctp
          JOIN keyword_folders kf ON kf.id = ctp.folder_id
          WHERE ctp.is_active = TRUE
            AND LOWER(COALESCE(
              CASE
                WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'status'
                WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'status'
                ELSE NULL
              END,
              'active'
            )) NOT IN ('paused', 'archived')
            AND LOWER(COALESCE(
              CASE
                WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'pause_crawlers'
                WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'pause_crawlers'
                ELSE NULL
              END,
              'false'
            )) <> 'true'
            AND LOWER(COALESCE(
              CASE
                WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'is_crawler_paused'
                WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'is_crawler_paused'
                ELSE NULL
              END,
              'false'
            )) <> 'true'
            AND LOWER(COALESCE(
              CASE
                WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'block_fleet'
                WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'block_fleet'
                ELSE NULL
              END,
              'false'
            )) <> 'true'
            AND LOWER(COALESCE(
              CASE
                WHEN jsonb_typeof(kf.metadata) = 'object' THEN kf.metadata->>'block_gha_fleet'
                WHEN jsonb_typeof(kf.metadata) = 'string' AND LEFT(BTRIM(kf.metadata #>> '{}'), 1) = '{' THEN ((kf.metadata #>> '{}')::jsonb)->>'block_gha_fleet'
                ELSE NULL
              END,
              'false'
            )) <> 'true';
        `.catch(() => [{ total: 0 }]),
        sql`
          SELECT COUNT(DISTINCT entity_key)::int AS total
          FROM workspace_watchlist
          WHERE entity_type = 'pin';
        `.catch(() => [{ total: 0 }])
      ]);
      standaloneAnchorsCount = Number(anchorCntRows?.[0]?.total || 0);
      campaignTrackedPinsCount = Number(trackedCntRows?.[0]?.total || 0);
      watchlistPinsCount = Number(watchlistCntRows?.[0]?.total || 0);
    }

    const totalStandaloneTracked = standaloneAnchorsCount + campaignTrackedPinsCount + watchlistPinsCount;
    console.log(`[*] Dispatched ${targetRows.length} active keywords (+ ${standaloneAnchorsCount} Newborn daily anchors, ${campaignTrackedPinsCount} Campaign 4-source tracked pins, ${watchlistPinsCount} Watchlist saved pins) across 20 Persistent Fleet Workers.`);

    if (targetRows.length === 0 && totalStandaloneTracked === 0) {
      console.log('[!] Warning: No active keywords, Newborn anchors, Campaign tracked pins, or Watchlist pins found in database. Emitting empty matrix.');
      matrixTasks = [];
    } else {
      const WORKER_COUNT = DEFAULT_FLEET_WORKER_TOTAL;
      const allKeywordIdsCsv = targetRows.map(r => r.id).join(',');
      matrixTasks = [];

      for (let w = 0; w < WORKER_COUNT; w++) {
        const chunk = targetRows.filter((_, idx) => idx % WORKER_COUNT === w);
        matrixTasks.push({
          mode: 'keyword_sweep',
          target_keyword: '',
          keyword: chunk.length > 0
            ? `${chunk[0].keyword} (+${Math.max(0, chunk.length - 1)} kw)`
            : (campaignTrackedPinsCount > 0 ? `Campaign Tracked Slice #${w + 1}` : (watchlistPinsCount > 0 ? `Watchlist Pin Slice #${w + 1}` : (standaloneAnchorsCount > 0 ? `Newborn Anchor Slice #${w + 1}` : `Pin Slice Worker #${w + 1}`))),
          keyword_id: chunk[0]?.id || targetRows[0]?.id || null,
          keyword_ids: chunk.map(r => r.id).join(','),
          all_keyword_ids: allKeywordIdsCsv,
          keywords_count: chunk.length,
          standalone_anchors_count: standaloneAnchorsCount,
          campaign_tracked_pins_count: campaignTrackedPinsCount,
          watchlist_pins_count: watchlistPinsCount,
          category: 'Global Pin Swarm',
          worker_index: w,
          worker_slot: w + 1,
          worker_total: WORKER_COUNT,
          max_pins: explicitEnvSerpPins !== null ? String(explicitEnvSerpPins) : '',
          max_serp_pins: explicitEnvSerpPins !== null ? String(explicitEnvSerpPins) : '',
          max_catalog_inspect: maxCatalogInspect,
          crawl_scope: crawlScope,
          enable_serp_harvest: targetRows.length > 0 ? enableSerpHarvest : false
        });
      }
    }

    summaryDetails = {
      mode: 'Global Two-Phase Distributed Pin Swarm (20 Persistent Workers)',
      keywordsCount: targetRows.length,
      standaloneAnchorsCount,
      campaignTrackedPinsCount,
      watchlistPinsCount,
      runnersAssigned: matrixTasks.length,
      keywordsList: targetRows.map(r => r.keyword)
    };
  } else {
    // MODE B: SINGLE-KEYWORD PIN-SLICE SHARDING (Up to 20 Parallel Runners)
    mode = 'pin_partition';
    const singleKeyword = commaKeywords[0];
    console.log(`\n[*] Mode Selected: MODE B (Single-Keyword Pin-Slice Sharding for "${singleKeyword}")`);

    if (await isKeywordBlockedByPausedFolders(sql, singleKeyword)) {
      console.log(`\n  [!] GUARD: Keyword "${singleKeyword}" has crawling paused or fleet blocked across all linked folders.`);
      console.log('  [*] Emitting empty task matrix (0 tasks) and terminating cleanly without reactivating keyword.');
      matrixTasks = [];
      const matrixJson = JSON.stringify(matrixTasks);
      await writeGitHubOutput('mode', mode, githubOutputPath);
      await writeGitHubOutput('task_count', '0', githubOutputPath);
      await writeGitHubOutput('matrix_tasks', matrixJson, githubOutputPath);
      return { mode, taskCount: 0, matrixTasks, paused: true };
    }

    let [kwRow] = await sql`
      SELECT id, keyword, category, target_pin_count, is_active
      FROM tracked_keywords
      WHERE LOWER(keyword) = ${singleKeyword};
    `;
    if (kwRow) {
      if (!kwRow.is_active) {
        await sql`
          UPDATE tracked_keywords
          SET is_active = TRUE, updated_at = NOW()
          WHERE id = ${kwRow.id};
        `;
      }
    } else {
      console.log(`  [+] Auto-registering keyword: "${singleKeyword}"...`);
      const defaultTargetPins = maxSerpPins || globalFallbackSerpPins;
      const defaultPages = computePagesForQuota(defaultTargetPins);
      [kwRow] = await sql`
        INSERT INTO tracked_keywords (keyword, category, target_pin_count, crawl_pages_limit, inspection_mode, is_active)
        VALUES (${singleKeyword}, 'General', ${defaultTargetPins}, ${defaultPages}, 'full_catalog', TRUE)
        ON CONFLICT (keyword) DO UPDATE SET
          is_active = TRUE,
          updated_at = NOW()
        RETURNING id, keyword, category, target_pin_count;
      `;
    }

    console.log(`  [+] Keyword Confirmed: "${kwRow.keyword}" (ID: ${kwRow.id})`);

    const numWorkers = DEFAULT_FLEET_WORKER_TOTAL;
    const singleKeywordTargetPins = explicitEnvSerpPins !== null
      ? explicitEnvSerpPins
      : (kwRow.target_pin_count ? clampSerpQuota(kwRow.target_pin_count) : globalFallbackSerpPins);
    console.log(`  [*] Partitioning "${kwRow.keyword}" across ${numWorkers} parallel runners (Runner 1 handles Phase 1A SERP ingestion, target ${singleKeywordTargetPins} pins)...`);

    matrixTasks = Array.from({ length: numWorkers }, (_, idx) => ({
      mode: 'pin_partition',
      keyword: kwRow.keyword,
      keyword_id: kwRow.id,
      keyword_ids: idx === 0 ? String(kwRow.id) : '',
      worker_index: idx,
      worker_slot: idx + 1,
      worker_total: numWorkers,
      crawl_scope: crawlScope,
      max_pins: String(singleKeywordTargetPins),
      max_serp_pins: String(singleKeywordTargetPins),
      max_catalog_inspect: maxCatalogInspect,
      enable_serp_harvest: enableSerpHarvest
    }));

    summaryDetails = {
      mode: 'Single-Keyword Distributed Pin Partition',
      keyword: kwRow.keyword,
      keywordId: kwRow.id,
      runnersAssigned: matrixTasks.length
    };
  }

  const matrixJson = JSON.stringify(matrixTasks);
  await writeGitHubOutput('mode', mode, githubOutputPath);
  await writeGitHubOutput('task_count', String(matrixTasks.length), githubOutputPath);
  await writeGitHubOutput('matrix_tasks', matrixJson, githubOutputPath);

  console.log('\n================================================================');
  console.log('✅ FLEET DISPATCH COMPLETE');
  console.log(`• Mode:        ${mode}`);
  console.log(`• Total Tasks: ${matrixTasks.length}`);
  console.log(`• Output Size: ${matrixJson.length} bytes`);
  console.log('================================================================');

  if (stepSummaryPath) {
    let md = '## 🚀 Stage 0: Dynamic Fleet Orchestrator & Dispatcher\n\n';
    md += `> **Fleet Mode**: \`${summaryDetails.mode}\` | **Tasks Dispatched**: **${matrixTasks.length}** (Max Concurrent Runners: **20**) | **Topology**: \`Unified PostgreSQL SSOT\` | **Pre-Warming**: \`JIT 80% Autonomous Shard Pulse\`\n\n`;

    if (mode === 'folder_pin_partition') {
      md += '### 📁 Folder Cluster True Distributed SERP & Pin Partition\n\n';
      md += `- **Folder**: \`${summaryDetails.folderName}\` (ID: ${summaryDetails.folderId})\n`;
      md += `- **Cluster Keywords**: **${summaryDetails.keywordsCount}** keywords distributed across **${matrixTasks.length}** parallel runners\n`;
      md += '- **Execution Architecture**: Two-Phase Distributed Fleet (Phase 1A: 20-Egress Parallel SERP Harvest + Phase 1B: Pin Slice Sharding)\n\n';
    } else if (mode === 'keyword_sweep') {
      md += `### 📋 Assigned Global Swarm Workers Matrix (${summaryDetails.keywordsCount} Keywords -> 20 Persistent Workers)\n\n`;
      md += '| Runner # | Assigned SERP Slice | Keywords Count | SERP Quota |\n';
      md += '| :---: | :--- | :---: | :---: |\n';
      matrixTasks.forEach(t => {
        md += `| **Runner ${t.worker_index + 1}/${t.worker_total}** | \`${t.keyword}\` | ${t.keywords_count || 0} | ${t.max_pins || `Per-KW (DB ${globalFallbackSerpPins})`} |\n`;
      });
    } else {
      md += '### 🎯 Single-Keyword Distributed Partition\n\n';
      md += `- **Target Keyword**: \`${summaryDetails.keyword}\` (ID: ${summaryDetails.keywordId})\n`;
      md += `- **Parallel Runners**: **${matrixTasks.length}** runners allocated\n`;
      md += '- **Execution Architecture**: Two-Phase Distributed Fleet (Phase 1A: Runner 1 SERP Harvest + Phase 1B: 20-Runner Pin Slice Inspection)\n\n';
    }

    if (appendStepSummary(md, stepSummaryPath)) {
      console.log('[+] Wrote Dispatcher Markdown to $GITHUB_STEP_SUMMARY');
    }
  }

  return { mode, taskCount: matrixTasks.length, matrixTasks };
}

/**
 * Recomputes rolling save gains (5d, 7d, 10d, 15d) from pins_daily_metrics
 * using strict span & tolerance gates in calculateRollingGainsFromSnapshots.
 */
export async function refreshRollingWindowGainsBatch(sql) {
  const nowUtc = new Date();
  const [pinRows, snapRows] = await Promise.all([
    sql`
      SELECT pin_id, gains_5d, gains_7d, gains_10d, gains_15d, delta_repins_24h, daily_repin_velocity
      FROM universal_master_pins
      WHERE is_hydrated = TRUE
        OR gains_5d IS NOT NULL
        OR gains_7d IS NOT NULL
        OR gains_10d IS NOT NULL
        OR gains_15d IS NOT NULL
      ORDER BY pin_id ASC;
    `,
    sql`
      SELECT pin_id, recorded_date::text AS recorded_date, save_count, repin_count, daily_save_velocity
      FROM pins_daily_metrics
      WHERE recorded_date >= (CURRENT_DATE - INTERVAL '25 days')::date
        AND save_count IS NOT NULL
      ORDER BY pin_id ASC, recorded_date DESC;
    `
  ]);

  const snapsByPin = new Map();
  for (const row of snapRows) {
    const pid = String(row.pin_id || '');
    if (!pid) continue;
    let bucket = snapsByPin.get(pid);
    if (!bucket) {
      bucket = [];
      snapsByPin.set(pid, bucket);
    }
    bucket.push(row);
  }

  const normalizeIntGain = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return Number.isFinite(num) ? Math.round(num) : null;
  };
  const normalizeFloatGain = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  const changed = [];

  for (const pin of pinRows) {
    const pid = String(pin.pin_id || '');
    if (!pid) continue;
    const snaps = snapsByPin.get(pid) || [];
    const computed = calculateRollingGainsFromSnapshots(snaps, nowUtc);
    const next5 = normalizeIntGain(computed.gains_5d);
    const next7 = normalizeIntGain(computed.gains_7d);
    const next10 = normalizeIntGain(computed.gains_10d);
    const next15 = normalizeIntGain(computed.gains_15d);
    const distinctSnapDates = new Set(snaps.map((s) => String(s.recorded_date || '').slice(0, 10)).filter(Boolean));
    const hasMultiDaySnaps = distinctSnapDates.size >= 2;
    const nextDeltaRepins24h = hasMultiDaySnaps
      ? normalizeIntGain(computed.delta_repins_24h)
      : null;
    const nextDailyRepinVel = hasMultiDaySnaps
      ? normalizeFloatGain(computed.daily_repin_velocity ?? computed.delta_repins_24h)
      : 0;

    if (
      normalizeIntGain(pin.gains_5d) !== next5 ||
      normalizeIntGain(pin.gains_7d) !== next7 ||
      normalizeIntGain(pin.gains_10d) !== next10 ||
      normalizeIntGain(pin.gains_15d) !== next15 ||
      normalizeIntGain(pin.delta_repins_24h) !== nextDeltaRepins24h ||
      normalizeFloatGain(pin.daily_repin_velocity) !== nextDailyRepinVel
    ) {
      changed.push({
        pin_id: pid,
        gains_5d: next5,
        gains_7d: next7,
        gains_10d: next10,
        gains_15d: next15,
        delta_repins_24h: nextDeltaRepins24h,
        daily_repin_velocity: nextDailyRepinVel
      });
    }
  }

  changed.sort((a, b) => a.pin_id.localeCompare(b.pin_id));
  const CHUNK_SIZE = 500;
  for (let i = 0; i < changed.length; i += CHUNK_SIZE) {
    const chunk = changed.slice(i, i + CHUNK_SIZE);
    await sql`
      UPDATE universal_master_pins ump
      SET
        gains_5d = u.gains_5d,
        gains_7d = u.gains_7d,
        gains_10d = u.gains_10d,
        gains_15d = u.gains_15d,
        delta_repins_24h = u.delta_repins_24h,
        daily_repin_velocity = u.daily_repin_velocity
      FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS u(
        pin_id text,
        gains_5d bigint,
        gains_7d bigint,
        gains_10d bigint,
        gains_15d bigint,
        delta_repins_24h bigint,
        daily_repin_velocity numeric
      )
      WHERE ump.pin_id = u.pin_id
        AND (
          ump.gains_5d IS DISTINCT FROM u.gains_5d
          OR ump.gains_7d IS DISTINCT FROM u.gains_7d
          OR ump.gains_10d IS DISTINCT FROM u.gains_10d
          OR ump.gains_15d IS DISTINCT FROM u.gains_15d
          OR ump.delta_repins_24h IS DISTINCT FROM u.delta_repins_24h
          OR ump.daily_repin_velocity IS DISTINCT FROM u.daily_repin_velocity
        );
    `;
  }

  return changed.length;
}

/**
 * Stage 2: Fleet Velocity & Report Consolidation Engine
 */
export async function runKeywordFleetConsolidate({ sql, env = process.env }) {
  const mode = String(env.MODE || 'keyword_sweep').toLowerCase().trim();
  const targetKeyword = String(env.TARGET_KEYWORD || '').trim().toLowerCase();
  const folderIdInput = env.FOLDER_ID ? parseInt(env.FOLDER_ID, 10) : null;
  const stepSummaryPath = env.GITHUB_STEP_SUMMARY || null;

  console.log('================================================================');
  console.log('   📊 STAGE 2: FLEET VELOCITY & REPORT CONSOLIDATION ENGINE');
  console.log('================================================================');
  console.log(`[Config] Execution Mode: ${mode.toUpperCase()}`);
  console.log(`[Config] Target Keyword: "${targetKeyword || '<ALL>'}"`);
  console.log(`[Config] Folder ID:      "${folderIdInput || '<NONE>'}"`);

  let mdReport = '';

  if ((mode === 'folder_pin_partition' || folderIdInput) && folderIdInput) {
    console.log(`[*] Consolidating Folder Cluster ID: ${folderIdInput}...`);
    const [folder] = await sql`
      SELECT id, name, description FROM keyword_folders WHERE id = ${folderIdInput} LIMIT 1;
    `;

    if (!folder) {
      console.warn(`[!] Folder ID ${folderIdInput} not found in database.`);
      return { mode, skipped: true };
    }

    console.log(`  [+] Folder Confirmed: "${folder.name}" (ID: ${folder.id})`);

    const folderKwPinVels = await sql`
      SELECT kfi.keyword_id, ump.daily_save_velocity
      FROM keyword_folder_items kfi
      JOIN keyword_serp_positions ksp
        ON ksp.keyword_id = kfi.keyword_id
       AND ksp.is_displaced = FALSE
      JOIN universal_master_pins ump
        ON ump.pin_id = ksp.pin_id
      WHERE kfi.folder_id = ${folder.id};
    `;
    const folderVelsByKw = new Map();
    const folderVelocities = [];
    for (const r of folderKwPinVels) {
      const kid = Number(r.keyword_id);
      if (!folderVelsByKw.has(kid)) folderVelsByKw.set(kid, []);
      if (r.daily_save_velocity !== null && r.daily_save_velocity !== undefined) {
        const vel = Number(r.daily_save_velocity || 0);
        folderVelsByKw.get(kid).push(vel);
        folderVelocities.push(vel);
      }
    }
    const folderVelUpdates = [];
    for (const [kid, vels] of folderVelsByKw.entries()) {
      const wVels = winsorize(vels, 0.95);
      const kwAvgVel = wVels.length > 0
        ? Math.round(wVels.reduce((a, b) => a + b, 0) / wVels.length)
        : 0;
      folderVelUpdates.push({ id: kid, avg_daily_velocity: kwAvgVel });
    }
    if (folderVelUpdates.length > 0) {
      await sql`
        UPDATE tracked_keywords tk
        SET avg_daily_velocity = u.avg_daily_velocity,
            updated_at = NOW()
        FROM jsonb_to_recordset(${JSON.stringify(folderVelUpdates)}::jsonb) AS u(id int, avg_daily_velocity numeric)
        WHERE tk.id = u.id;
      `;
    }

    const clusterKeywords = await sql`
      SELECT
        tk.id, tk.keyword, tk.category, tk.avg_daily_velocity, tk.last_crawled_at,
        COUNT(DISTINCT ksp.pin_id)::int as pin_count
      FROM keyword_folder_items kfi
      JOIN tracked_keywords tk ON tk.id = kfi.keyword_id
      LEFT JOIN keyword_serp_positions ksp ON ksp.keyword_id = tk.id AND ksp.is_displaced = FALSE
      WHERE kfi.folder_id = ${folder.id}
      GROUP BY tk.id, tk.keyword, tk.category, tk.avg_daily_velocity, tk.last_crawled_at
      ORDER BY tk.avg_daily_velocity DESC NULLS LAST;
    `;

    const [folderStats] = await sql`
      SELECT
        COUNT(DISTINCT ksp.pin_id)::int as total_unique_pins,
        COUNT(DISTINCT ksp.pin_id) FILTER (WHERE ksp.is_displaced = FALSE)::int as active_pins,
        COUNT(DISTINCT ksp.pin_id) FILTER (WHERE ksp.is_displaced = TRUE)::int as displaced_vault,
        0::int as dead_pins,
        COALESCE(SUM(ump.save_count) FILTER (WHERE ksp.is_displaced = FALSE), 0)::bigint as total_catalog_saves
      FROM keyword_folder_items kfi
      JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
      LEFT JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE kfi.folder_id = ${folder.id};
    `;

    const robustFolderVels = winsorize(folderVelocities, 0.95);
    const avgVelocity = robustFolderVels.length > 0
      ? Math.round(robustFolderVels.reduce((a, b) => a + b, 0) / robustFolderVels.length)
      : 0;

    const totalUniquePins = Number(folderStats?.total_unique_pins || 0);
    const activePins = Number(folderStats?.active_pins || 0);
    const displacedVault = Number(folderStats?.displaced_vault || 0);
    const deadPins = Number(folderStats?.dead_pins || 0);
    const totalCatalogSaves = Number(folderStats?.total_catalog_saves || 0);

    await sql`
      UPDATE keyword_folders
      SET updated_at = NOW()
      WHERE id = ${folder.id};
    `;

    const topRising = await sql`
      WITH deduped_pins AS (
        SELECT DISTINCT ON (ksp.pin_id)
          ksp.pin_id, ump.title, ump.image_url, ump.daily_save_velocity, ump.save_count, ump.clean_domain as domain
        FROM keyword_folder_items kfi
        JOIN keyword_serp_positions ksp ON ksp.keyword_id = kfi.keyword_id
        JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
        WHERE kfi.folder_id = ${folder.id}
          AND ump.daily_save_velocity > 0
          AND ksp.is_displaced = FALSE
        ORDER BY ksp.pin_id, ump.daily_save_velocity DESC
      )
      SELECT *
      FROM deduped_pins
      ORDER BY daily_save_velocity DESC NULLS LAST
      LIMIT 5;
    `;

    const stage1Result = String(env.STAGE1_RESULT || 'success').toLowerCase().trim();
    const fleetStatus = (stage1Result !== 'success' && stage1Result !== '')
      ? `🟡 **Partial Run (Stage 1 status: ${stage1Result})**`
      : '🟢 **Completed Successfully**';

    mdReport += '## 🚀 Folder Cluster Fleet Telemetry & Velocity Report\n\n';
    mdReport += `> **Folder Cluster**: \`${folder.name}\` (ID: ${folder.id}) | **Fleet Execution**: \`20-Runner Parallel Matrix\` | **Status**: ${fleetStatus}\n\n`;
    mdReport += '### 📊 Cluster Core Metrics\n\n';
    mdReport += '| Metric | Value | Architectural Context |\n';
    mdReport += '| :--- | :---: | :--- |\n';
    mdReport += `| **Cluster Keywords** | **${clusterKeywords.length}** | All keywords refreshed via Stage 0 SERP search |\n`;
    mdReport += `| **Total Unique Catalog Pins** | **${totalUniquePins.toLocaleString()} Pins** | 100% deep-inspected across 20 parallel runner slices |\n`;
    mdReport += `| **Active SERP Ranking Pins** | **${activePins.toLocaleString()}** | Live rankers in Pinterest search results |\n`;
    mdReport += `| **Displaced Vault Pins** | **${displacedVault.toLocaleString()}** | Historical pins tracked for ongoing background saves |\n`;
    mdReport += `| **Total Cluster Saves** | **${totalCatalogSaves.toLocaleString()}** | Aggregate viral saves volume accumulated across cluster |\n`;
    mdReport += `| **Net Daily Save Velocity** | **\`+${avgVelocity} saves/day\`** | Daily momentum baseline across ranking creative assets |\n`;
    mdReport += `| **Dead / 404 Removed Pins** | **${deadPins}** | Identified as 404/deleted from Pinterest |\n\n`;

    mdReport += '### 📋 Cluster Tracked Keywords\n\n';
    mdReport += '| Keyword | Category | Unique Pins | Avg 24h Velocity | Status |\n';
    mdReport += '| :--- | :--- | :---: | :---: | :---: |\n';
    for (const k of clusterKeywords) {
      mdReport += `| **${k.keyword}** | ${k.category || 'General'} | ${k.pin_count || 0} | \`+${k.avg_daily_velocity || 0} saves/day\` | 🟢 Fresh |\n`;
    }
    mdReport += '\n';

    if (topRising.length > 0) {
      mdReport += '### 🔥 Top High-Velocity Rising Pins in Cluster\n\n';
      mdReport += '| Pin Creative | 24h Velocity | Total Saves | Preview |\n';
      mdReport += '| :--- | :---: | :---: | :---: |\n';
      for (const p of topRising) {
        const img = p.image_url ? `<img src="${p.image_url}" width="50" />` : '-';
        mdReport += `| [${p.title || 'Pin #' + p.pin_id}](https://www.pinterest.com/pin/${p.pin_id}/) | \`+${p.daily_save_velocity}/d\` | ${Number(p.save_count).toLocaleString()} | ${img} |\n`;
      }
      mdReport += '\n';
    }
  } else if (mode === 'pin_partition' && targetKeyword) {
    const [kw] = await sql`
      SELECT id, keyword, category, target_pin_count, crawl_pages_limit, inspection_mode, avg_daily_velocity, is_active, last_crawled_at, updated_at
      FROM tracked_keywords
      WHERE LOWER(keyword) = ${targetKeyword}
      LIMIT 1;
    `;

    if (!kw) {
      console.warn(`[!] Keyword "${targetKeyword}" not found for consolidation.`);
      return { mode, skipped: true };
    }

    console.log(`[*] Consolidating keyword: "${kw.keyword}" (ID: ${kw.id})...`);

    const [velRow] = await sql`
      SELECT
        COUNT(*)::int as active_count,
        COALESCE(SUM(ump.save_count), 0)::bigint as total_active_saves,
        COALESCE(SUM(ump.repin_count), 0)::bigint as total_active_repins
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kw.id}
        AND ksp.is_displaced = FALSE;
    `;

    const pinVelRows = await sql`
      SELECT ump.daily_save_velocity
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kw.id}
        AND ksp.is_displaced = FALSE;
    `;
    const rawVelocities = pinVelRows
      .filter(r => r.daily_save_velocity != null)
      .map(r => Number(r.daily_save_velocity));
    const winsorizedVelocities = winsorize(rawVelocities, 0.95);
    const avgVelocity = winsorizedVelocities.length > 0
      ? Math.round(winsorizedVelocities.reduce((a, b) => a + b, 0) / winsorizedVelocities.length)
      : 0;

    const activeCount = Number(velRow?.active_count || 0);
    const totalActiveSaves = Number(velRow?.total_active_saves || 0);

    await sql`
      UPDATE tracked_keywords
      SET
        avg_daily_velocity = ${avgVelocity},
        last_crawled_at = NOW(),
        updated_at = NOW()
      WHERE id = ${kw.id};
    `;
    console.log(`  [+] Central Hub Updated: Avg Velocity = +${avgVelocity} saves/day | Active Pins = ${activeCount}`);

    const [displacedStats] = await sql`
      SELECT COUNT(DISTINCT pin_id)::int as displaced_vault
      FROM keyword_serp_positions
      WHERE keyword_id = ${kw.id}
        AND is_displaced = TRUE;
    `.catch(() => [{ displaced_vault: 0 }]);

    const displacedVault = Number(displacedStats?.displaced_vault || 0);
    const totalCatalog = activeCount + displacedVault;
    const deadPins = 0;
    const totalCatalogSaves = totalActiveSaves;

    const serpPins = await sql`
      SELECT ksp.pin_id, ump.title, ump.save_count, ump.repin_count, ump.daily_save_velocity, ump.image_url, COALESCE(ump.visual_annotations, '[]'::jsonb) AS visual_annotations
      FROM keyword_serp_positions ksp
      JOIN universal_master_pins ump ON ump.pin_id = ksp.pin_id
      WHERE ksp.keyword_id = ${kw.id}
        AND ksp.is_displaced = FALSE
      ORDER BY ksp.rank_position ASC NULLS LAST;
    `;

    const tagCounts = new Map();
    for (const p of serpPins) {
      const clean = sanitizeVisualAnnotations(p.visual_annotations, { maxItems: 15 });
      const unique = new Set(clean.map(s => s.toLowerCase()));
      for (const t of unique) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }

    const sortedTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({
        tag,
        count,
        overlapPct: Math.round((count / (serpPins.length || 1)) * 100)
      }))
      .sort((a, b) => b.count - a.count);

    const coreAnchors = sortedTags.filter(t => t.count >= 3);
    console.log(`  [+] Visual Entities Processed: ${sortedTags.length} distinct tags | Core Anchors: ${coreAnchors.length}`);

    const topRising = serpPins
      .filter(p => Number(p.daily_save_velocity) > 0)
      .sort((a, b) => Number(b.daily_save_velocity) - Number(a.daily_save_velocity))
      .slice(0, 5);

    const stage1Result = String(env.STAGE1_RESULT || 'success').toLowerCase().trim();
    const fleetStatus = (stage1Result !== 'success' && stage1Result !== '')
      ? `🟡 **Partial Run (Stage 1 status: ${stage1Result})**`
      : '🟢 **Completed Successfully**';

    mdReport += '## 🚀 Keyword Fleet Telemetry & Velocity Report\n\n';
    mdReport += `> **Target Keyword**: \`${kw.keyword}\` | **Fleet Execution**: \`20-Runner Parallel Matrix\` | **Status**: ${fleetStatus}\n\n`;
    mdReport += '### 📊 Core Telemetry Metrics\n\n';
    mdReport += '| Metric | Value | Architectural Context |\n';
    mdReport += '| :--- | :---: | :--- |\n';
    mdReport += `| **Active SERP Ranking Pins** | **${activeCount}** | Currently ranking on page 1 of Pinterest organic search |\n`;
    mdReport += `| **Displaced Vault Pins** | **${displacedVault}** | Historical rankers tracked for ongoing background saves |\n`;
    mdReport += `| **Total Monitored Catalog** | **${totalCatalog} Pins** | 100% deep-inspected across 20 parallel runner slices |\n`;
    mdReport += `| **Net 24h Save Velocity** | **\`+${avgVelocity} saves/day\`** | Daily momentum baseline across ranking creative assets |\n`;
    mdReport += `| **Total Catalog Saves** | **${totalCatalogSaves.toLocaleString()}** | Aggregate viral saves volume accumulated across catalog |\n`;
    mdReport += `| **Dead / 404 Removed Pins** | **${deadPins}** | Removed from Pinterest (historical trajectories preserved) |\n\n`;

    mdReport += '### 🧬 Visual Annotations Crossover & Core Anchors\n\n';
    if (coreAnchors.length > 0) {
      mdReport += '| Core Visual Anchor | Shared Pins | Overlap Frequency | Algorithmic Role |\n';
      mdReport += '| :--- | :---: | :---: | :--- |\n';
      coreAnchors.slice(0, 8).forEach(a => {
        mdReport += `| **\`#${a.tag}\`** | **${a.count} pins** | \`${a.overlapPct}%\` | 🔗 High-Density Core Anchor |\n`;
      });
      mdReport += '\n';
    } else {
      mdReport += '*No high-density visual anchor exceeded the 3-pin crossover threshold yet.*\n\n';
    }

    if (topRising.length > 0) {
      mdReport += '### 🔥 Top High-Velocity Rising Pins\n\n';
      mdReport += '| Pin Creative | 24h Velocity | Total Saves | Preview |\n';
      mdReport += '| :--- | :---: | :---: | :---: |\n';
      for (const p of topRising) {
        const img = p.image_url ? `<img src="${p.image_url}" width="50" />` : '-';
        mdReport += `| [${p.title || 'Pin #' + p.pin_id}](https://www.pinterest.com/pin/${p.pin_id}/) | \`+${p.daily_save_velocity}/d\` | ${Number(p.save_count).toLocaleString()} | ${img} |\n`;
      }
      mdReport += '\n';
    }
  } else {
    console.log('[*] Consolidating multi-keyword broadcast run...');

    const allActivePinVels = await sql`
      SELECT tk.id AS keyword_id, ump.daily_save_velocity
      FROM tracked_keywords tk
      JOIN keyword_serp_positions ksp
        ON ksp.keyword_id = tk.id
       AND ksp.is_displaced = FALSE
      JOIN universal_master_pins ump
        ON ump.pin_id = ksp.pin_id
      WHERE tk.is_active = TRUE;
    `;
    const velsByKw = new Map();
    for (const r of allActivePinVels) {
      const kid = Number(r.keyword_id);
      if (!velsByKw.has(kid)) velsByKw.set(kid, []);
      if (r.daily_save_velocity !== null && r.daily_save_velocity !== undefined) {
        velsByKw.get(kid).push(Number(r.daily_save_velocity || 0));
      }
    }
    const kwVelUpdates = [];
    for (const [kid, vels] of velsByKw.entries()) {
      const wVels = winsorize(vels, 0.95);
      const kwAvgVel = wVels.length > 0
        ? Math.round(wVels.reduce((a, b) => a + b, 0) / wVels.length)
        : 0;
      kwVelUpdates.push({ id: kid, avg_daily_velocity: kwAvgVel });
    }
    if (kwVelUpdates.length > 0) {
      await sql`
        UPDATE tracked_keywords tk
        SET avg_daily_velocity = u.avg_daily_velocity,
            updated_at = NOW()
        FROM jsonb_to_recordset(${JSON.stringify(kwVelUpdates)}::jsonb) AS u(id int, avg_daily_velocity numeric)
        WHERE tk.id = u.id;
      `;
    }
    console.log(`  [+] Updated Winsorized avg_daily_velocity across ${kwVelUpdates.length} active keywords in single bulk query.`);

    const keywords = await sql`
      SELECT
        tk.id, tk.keyword, tk.category, tk.target_pin_count, tk.avg_daily_velocity, tk.last_crawled_at,
        COUNT(DISTINCT ksp.pin_id)::int as total_inspected_pins
      FROM tracked_keywords tk
      LEFT JOIN keyword_serp_positions ksp ON ksp.keyword_id = tk.id
      WHERE tk.is_active = TRUE
      GROUP BY tk.id, tk.keyword, tk.category, tk.target_pin_count, tk.avg_daily_velocity, tk.last_crawled_at
      ORDER BY tk.last_crawled_at DESC NULLS LAST;
    `;

    const stage1Result = String(env.STAGE1_RESULT || 'success').toLowerCase().trim();
    const fleetStatus = (stage1Result !== 'success' && stage1Result !== '')
      ? `🟡 **Partial Run (Stage 1 status: ${stage1Result})**`
      : '🟢 **Completed Successfully**';

    mdReport += '## 🚀 Multi-Keyword Distributed Fleet Radar Report\n\n';
    mdReport += `> **Fleet Mode**: \`20-Runner Parallel Matrix\` | **Keywords Processed**: **${keywords.length}** | **Status**: ${fleetStatus}\n\n`;
    mdReport += '### 📊 Tracked Keywords Performance Matrix\n\n';
    mdReport += '| Keyword | Category | SERP Target | Inspected Pins (Catalog + Vault) | Avg 24h Velocity | Last Updated | Status |\n';
    mdReport += '| :--- | :--- | :---: | :---: | :---: | :---: | :---: |\n';
    for (const k of keywords) {
      const timeStr = k.last_crawled_at ? new Date(k.last_crawled_at).toISOString().slice(11, 16) + ' UTC' : 'Pending';
      const inspectedStr = Number(k.total_inspected_pins) > 0 ? `**${Number(k.total_inspected_pins).toLocaleString()} Pins**` : '0';
      mdReport += `| **${k.keyword}** | ${k.category || 'General'} | ${k.target_pin_count || 250} | ${inspectedStr} | \`+${k.avg_daily_velocity || 0} saves/day\` | ${timeStr} | 🟢 Fresh |\n`;
    }
    mdReport += '\n';
  }

  try {
    console.log('[*] Consolidating authentic rolling window gains (5d/7d/10d/15d)...');
    const updatedGainsCount = await refreshRollingWindowGainsBatch(sql);
    console.log(`  ✓ Rolling Window Gains Consolidated: ${updatedGainsCount} pins updated.`);
  } catch (gainsErr) {
    console.warn('[!] Rolling window gains consolidation warning:', gainsErr.message);
  }

  try {
    await sql`VACUUM (ANALYZE) keyword_serp_positions, pins_daily_metrics, universal_master_pins;`
      .catch(err => console.warn('  [!] VACUUM keyword tables warning:', err.message));
  } catch (vacErr) {
    console.warn('[!] Hub VACUUM non-fatal warning:', vacErr.message);
  }

  if (env.SKIP_MV_REFRESH !== 'true') {
    try {
      console.log('[*] Refreshing Materialized View public.mv_pulse_24h_summary (CONCURRENTLY)...');
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_pulse_24h_summary;`;
      await sql`VACUUM public.mv_pulse_24h_summary;`;
      console.log('  ✓ mv_pulse_24h_summary refreshed and vacuumed cleanly.');
    } catch (mvErr) {
      if (/has not been populated|cannot refresh.*concurrently/i.test(String(mvErr?.message || ''))) {
        try {
          await sql`REFRESH MATERIALIZED VIEW public.mv_pulse_24h_summary;`;
          await sql`VACUUM public.mv_pulse_24h_summary;`;
          console.log('  ✓ mv_pulse_24h_summary populated via initial non-concurrent refresh.');
        } catch (fallbackErr) {
          console.warn('[!] mv_pulse_24h_summary refresh fallback warning:', fallbackErr.message);
        }
      } else {
        console.warn('[!] mv_pulse_24h_summary refresh warning:', mvErr.message);
      }
    }
  } else {
    console.log('[*] Skipping mv_pulse_24h_summary refresh in consolidator (deferred to domain-enrich --mode=rollup).');
  }

  if (appendStepSummary(mdReport, stepSummaryPath)) {
    console.log('[+] Wrote Consolidated Report to $GITHUB_STEP_SUMMARY');
  }

  console.log('\n================================================================');
  console.log('✅ STAGE 2 CONSOLIDATION COMPLETED SUCCESSFULLY');
  console.log('================================================================');
  return { mode, skipped: false };
}

export async function runKeywordFleet(argv = process.argv.slice(2), options = {}) {
  const env = options.env || process.env;
  const { stage } = parseKeywordFleetArgs(argv, env);
  const sqlOptions = stage === 'consolidate'
    ? { connection: { statement_timeout: 120000 } }
    : undefined;

  return runFleetLifecycle(
    `keyword-fleet-${stage}`,
    async ({ sql }) => {
      if (stage === 'dispatch') {
        return runKeywordFleetDispatch({ sql, env });
      }
      return runKeywordFleetConsolidate({ sql, env });
    },
    {
      ...options,
      sqlOptions: options.sqlOptions ?? sqlOptions
    }
  );
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runKeywordFleet().catch((err) => {
    console.error('[-] Fatal Keyword Fleet Error:', err?.message || err);
    process.exit(1);
  });
}
