#!/usr/bin/env node

/**
 * scripts/keyword-fleet-dispatcher.mjs
 * 
 * Intelligent Dynamic Fleet Orchestrator & Dispatcher
 * Coordinates the 20-Runner Distributed GitHub Actions Fleet:
 * 
 * - Mode A (Global Two-Phase Pin-Partition Sweep):
 *   Dispatches all active keywords across 20 persistent parallel runners (Single Wave).
 *   Phase 1A: 20 runners harvest SERPs in parallel.
 *   Phase 1B: 20 runners partition 100% of unique Active + Displaced Vault pins evenly.
 * 
 * - Mode B (Single-Keyword Pin-Slice Sharding):
 *   Partitions a single keyword's Active SERP + Displaced Vault pins across 20 runners.
 * 
 * - Mode C (Folder Cluster Pin-Slice Sharding):
 *   Partitions a campaign folder's keywords and unique pins across 20 runners.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import { getAppSettings, safeNormalizeMetadata } from '../src/modules/keywords/service.mjs';

// Auto-load .env in local environments
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required for keyword fleet dispatcher.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const rawTargetKeyword = (process.env.TARGET_KEYWORD || '').trim();
const rawFolderId = (process.env.FOLDER_ID || '').trim();
const githubOutputPath = process.env.GITHUB_OUTPUT || null;
const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null;

async function writeOutput(key, value) {
  if (githubOutputPath) {
    try {
      fs.appendFileSync(githubOutputPath, `${key}=${value}\n`, 'utf8');
    } catch (err) {
      console.warn(`[!] Failed writing to GITHUB_OUTPUT: ${err.message}`);
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('   🚀 KEYWORD INTELLIGENCE & VELOCITY FLEET DISPATCHER (20-RUNNER)');
  console.log('================================================================');

  // Dynamically resolve configuration from DB app_settings with ENV overrides
  const appSettings = await getAppSettings(sql).catch(() => ({}));
  const envHarvest = process.env.ENABLE_SERP_HARVEST?.trim();
  // [INVARIANT: CRON-SERP-HARVEST-DEFAULT-TRUE]
  // Guarantee that scheduled runs at 0 1 * * * or triggers omitting ENABLE_SERP_HARVEST always default to true
  let enableSerpHarvest = (envHarvest !== undefined && envHarvest !== '')
    ? (envHarvest === 'true' || envHarvest === '1')
    : true;

  const envSerpPins = process.env.MAX_SERP_PINS?.trim() || process.env.MAX_PINS?.trim();
  const maxSerpPins = (envSerpPins && !isNaN(parseInt(envSerpPins, 10)))
    ? Math.max(10, Math.min(2000, parseInt(envSerpPins, 10)))
    : (appSettings.max_serp_pins || appSettings.default_max_pins || 50);

  const envCatalogInspect = process.env.MAX_CATALOG_INSPECT?.trim();
  const maxCatalogInspect = (envCatalogInspect !== undefined && envCatalogInspect !== '' && !isNaN(parseInt(envCatalogInspect, 10)))
    ? Math.max(0, parseInt(envCatalogInspect, 10))
    : (appSettings.max_catalog_inspect !== undefined ? Math.max(0, parseInt(appSettings.max_catalog_inspect, 10)) : 0);

  const envCrawlScope = process.env.CRAWL_SCOPE?.trim();
  const crawlScope = ((envCrawlScope && envCrawlScope !== '') ? envCrawlScope : (appSettings.default_crawl_scope || 'all_pins')).toLowerCase().trim();

  console.log(`[Config] Target Input:       "${rawTargetKeyword || '<EMPTY: ALL ACTIVE KEYWORDS>'}"`);
  console.log(`[Config] Folder ID:          "${rawFolderId || '<NONE>'}"`);
  console.log(`[Config] Crawl Scope:        "${crawlScope}"`);
  console.log(`[Config] SERP Harvest Quota: ${maxSerpPins} pins (${enableSerpHarvest ? 'ENABLED' : 'DISABLED: AUDIT ONLY'})`);
  console.log(`[Config] Catalog Inspect:    ${maxCatalogInspect === 0 ? 'UNLIMITED / ALL PINS' : maxCatalogInspect + ' pins'}`);

  const isSweepAll = !rawTargetKeyword || rawTargetKeyword.toLowerCase() === 'all' || rawTargetKeyword.toLowerCase() === 'cron' || rawTargetKeyword.toLowerCase() === '*';
  const commaKeywords = rawTargetKeyword.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  let mode = 'keyword_sweep';
  let matrixTasks = [];
  let summaryDetails = {};

  if (rawFolderId) {
    // =========================================================================
    // MODE C: FOLDER CLUSTER PIN-SLICE SHARDING (Up to 20 Parallel Runners)
    // =========================================================================
    mode = 'folder_pin_partition';
    const fid = parseInt(rawFolderId, 10);
    console.log(`\n[*] Mode Selected: MODE C (Folder Cluster Pin Partition for Folder ID: ${fid})`);

    const [folderRow] = await sql`
      SELECT id, name, description, metadata FROM keyword_folders WHERE id = ${fid} LIMIT 1;
    `;
    if (!folderRow) {
      console.error(`[-] FATAL: Folder ID ${fid} not found in database.`);
      process.exit(1);
    }

    const folderMeta = safeNormalizeMetadata(folderRow.metadata);

    if ((envHarvest === undefined || envHarvest === '') && folderMeta.enable_serp_harvest !== undefined) {
      enableSerpHarvest = Boolean(folderMeta.enable_serp_harvest);
    }

    const resolvedMaxSerpPins = (!envSerpPins && folderMeta.max_serp_pins)
      ? Math.max(10, Math.min(2000, parseInt(folderMeta.max_serp_pins, 10)))
      : maxSerpPins;
    const resolvedCrawlScope = (!envCrawlScope && folderMeta.crawl_scope)
      ? String(folderMeta.crawl_scope).toLowerCase().trim()
      : crawlScope;
    const resolvedMaxCatalogInspect = (!envCatalogInspect && folderMeta.max_catalog_inspect !== undefined)
      ? Math.max(0, parseInt(folderMeta.max_catalog_inspect, 10))
      : maxCatalogInspect;

    console.log(`  [+] Target Folder: "${folderRow.name}" (ID: ${folderRow.id})`);
    console.log(`  [+] Resolved Config: Harvest=${enableSerpHarvest ? 'ON' : 'OFF'} | Scope=${resolvedCrawlScope} | MaxPins=${resolvedMaxSerpPins} | InspectCap=${resolvedMaxCatalogInspect}`);

    const folderKeywords = await sql`
      SELECT tk.id, tk.keyword, tk.category, tk.target_pin_count, tk.last_crawled_at
      FROM keyword_folder_items kfi
      JOIN tracked_keywords tk ON tk.id = kfi.keyword_id
      WHERE kfi.folder_id = ${fid}
      ORDER BY tk.last_crawled_at ASC NULLS FIRST, kfi.added_at ASC;
    `;

    console.log(`  [+] Resolved ${folderKeywords.length} keywords in folder cluster.`);

    const numWorkers = 20;
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
        enable_serp_harvest: enableSerpHarvest
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
    // =========================================================================
    // MODE A: GLOBAL TWO-PHASE PIN-PARTITION FLEET (Strictly 20 Parallel Runners)
    // =========================================================================
    mode = 'keyword_sweep';
    console.log('\n[*] Mode Selected: MODE A (Global Two-Phase Distributed Pin-Partition Fleet)');

    let targetRows = [];
    if (commaKeywords.length > 1) {
      console.log(`[*] Resolving ${commaKeywords.length} explicitly specified keywords...`);
      for (const kwStr of commaKeywords) {
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
          const defaultTargetPins = maxSerpPins || 50;
          const defaultPages = Math.min(100, Math.max(1, Math.ceil(defaultTargetPins / 25)));
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
        SELECT id, keyword, category, target_pin_count 
        FROM tracked_keywords 
        WHERE is_active = TRUE 
        ORDER BY last_crawled_at ASC NULLS FIRST, id ASC;
      `;
    }

    console.log(`[*] Dispatched ${targetRows.length} active keywords across 20 Persistent Fleet Workers.`);

    if (targetRows.length === 0) {
      console.log('[!] Warning: No active keywords found in database. Emitting empty matrix.');
      matrixTasks = [];
    } else {
      // Strictly cap matrix to 20 persistent workers (Single GitHub Actions Wave, zero queuing delay).
      // Phase 1A: Each worker harvests SERPs for its modulo slice (~5-6 keywords/worker).
      // Phase 1B: All 20 workers partition 100% of unique Active + Displaced Vault pins via Push-Down SQL Hash.
      const WORKER_COUNT = 20;
      const allKeywordIdsCsv = targetRows.map(r => r.id).join(',');
      matrixTasks = [];

      for (let w = 0; w < WORKER_COUNT; w++) {
        const chunk = targetRows.filter((_, idx) => idx % WORKER_COUNT === w);
        matrixTasks.push({
          mode: 'keyword_sweep',
          target_keyword: '',
          keyword: chunk.length > 0
            ? `${chunk[0].keyword} (+${Math.max(0, chunk.length - 1)} kw)`
            : `Pin Slice Worker #${w + 1}`,
          keyword_id: chunk[0]?.id || targetRows[0].id,
          keyword_ids: chunk.map(r => r.id).join(','),
          all_keyword_ids: allKeywordIdsCsv,
          keywords_count: chunk.length,
          category: 'Global Pin Swarm',
          worker_index: w,
          worker_slot: w + 1,
          worker_total: WORKER_COUNT,
          max_pins: maxSerpPins,
          max_serp_pins: maxSerpPins,
          max_catalog_inspect: maxCatalogInspect,
          crawl_scope: crawlScope,
          enable_serp_harvest: enableSerpHarvest
        });
      }
    }

    summaryDetails = {
      mode: 'Global Two-Phase Distributed Pin Swarm (20 Persistent Workers)',
      keywordsCount: targetRows.length,
      runnersAssigned: matrixTasks.length,
      keywordsList: targetRows.map(r => r.keyword)
    };

  } else {
    // =========================================================================
    // MODE B: SINGLE-KEYWORD PIN-SLICE SHARDING (Up to 20 Parallel Runners)
    // =========================================================================
    mode = 'pin_partition';
    const singleKeyword = commaKeywords[0];
    console.log(`\n[*] Mode Selected: MODE B (Single-Keyword Pin-Slice Sharding for "${singleKeyword}")`);

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
      const defaultTargetPins = maxSerpPins || 50;
      const defaultPages = Math.min(100, Math.max(1, Math.ceil(defaultTargetPins / 25)));
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

    const numWorkers = 20;
    console.log(`  [*] Partitioning "${kwRow.keyword}" across ${numWorkers} parallel runners (Runner 1 handles Phase 1A SERP ingestion)...`);

    matrixTasks = Array.from({ length: numWorkers }, (_, idx) => ({
      mode: 'pin_partition',
      keyword: kwRow.keyword,
      keyword_id: kwRow.id,
      keyword_ids: idx === 0 ? String(kwRow.id) : '',
      worker_index: idx,
      worker_slot: idx + 1,
      worker_total: numWorkers,
      crawl_scope: crawlScope,
      max_pins: maxSerpPins,
      max_serp_pins: maxSerpPins,
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

  // ===========================================================================
  // OUTPUT SERIALIZATION FOR GITHUB ACTIONS MATRIX
  // ===========================================================================
  const matrixJson = JSON.stringify(matrixTasks);
  await writeOutput('mode', mode);
  await writeOutput('task_count', String(matrixTasks.length));
  await writeOutput('matrix_tasks', matrixJson);

  console.log('\n================================================================');
  console.log(`✅ FLEET DISPATCH COMPLETE`);
  console.log(`• Mode:        ${mode}`);
  console.log(`• Total Tasks: ${matrixTasks.length}`);
  console.log(`• Output Size: ${matrixJson.length} bytes`);
  console.log('================================================================');

  if (stepSummaryPath) {
    try {
      let md = `## 🚀 Stage 0: Dynamic Fleet Orchestrator & Dispatcher\n\n`;
      md += `> **Fleet Mode**: \`${summaryDetails.mode}\` | **Tasks Dispatched**: **${matrixTasks.length}** (Max Concurrent Runners: **20**) | **Pre-Warming**: \`JIT 80% Autonomous Shard Pulse\`\n\n`;

      if (mode === 'folder_pin_partition') {
        md += `### 📁 Folder Cluster True Distributed SERP & Pin Partition\n\n`;
        md += `- **Folder**: \`${summaryDetails.folderName}\` (ID: ${summaryDetails.folderId})\n`;
        md += `- **Cluster Keywords**: **${summaryDetails.keywordsCount}** keywords distributed across **${matrixTasks.length}** parallel runners\n`;
        md += `- **Execution Architecture**: Two-Phase Distributed Fleet (Phase 1A: 20-Egress Parallel SERP Harvest + Phase 1B: Pin Slice Sharding)\n\n`;
      } else if (mode === 'keyword_sweep') {
        md += `### 📋 Assigned Global Swarm Workers Matrix (${summaryDetails.keywordsCount} Keywords -> 20 Persistent Workers)\n\n`;
        md += `| Runner # | Assigned SERP Slice | Keywords Count | SERP Quota |\n`;
        md += `| :---: | :--- | :---: | :---: |\n`;
        matrixTasks.forEach(t => {
          md += `| **Runner ${t.worker_index + 1}/${t.worker_total}** | \`${t.keyword}\` | ${t.keywords_count || 0} | ${t.max_pins} |\n`;
        });
      } else {
        md += `### 🎯 Single-Keyword Distributed Partition\n\n`;
        md += `- **Target Keyword**: \`${summaryDetails.keyword}\` (ID: ${summaryDetails.keywordId})\n`;
        md += `- **Parallel Runners**: **${matrixTasks.length}** runners allocated\n`;
        md += `- **Execution Architecture**: Two-Phase Distributed Fleet (Phase 1A: Runner 1 SERP Harvest + Phase 1B: 20-Runner Pin Slice Inspection)\n\n`;
      }

      fs.appendFileSync(stepSummaryPath, md, 'utf8');
      console.log('[+] Wrote Dispatcher Markdown to $GITHUB_STEP_SUMMARY');
    } catch (sErr) {
      console.warn(`[!] Failed writing to GITHUB_STEP_SUMMARY: ${sErr.message}`);
    }
  }

  process.exitCode = 0;
  return;
}

main().catch(err => {
  console.error('[-] Fatal Dispatcher Error:', err);
  process.exit(1);
});