#!/usr/bin/env node

/**
 * scripts/keyword-fleet-dispatcher.mjs
 * 
 * Intelligent Dynamic Fleet Orchestrator & Dispatcher
 * Coordinates the 20-Runner Distributed GitHub Actions Fleet:
 * 
 * - Mode A (Multi-Keyword Sweep):
 *   Dispatches up to 20 active keywords from Central Hub to 20 parallel runners.
 * 
 * - Mode B (Single-Keyword Pin-Slice Sharding):
 *   Ingests the keyword SERP, queries all associated pins (Active SERP + Displaced Vault = 200+ pins),
 *   and partitions them mathematically across 20 runners (~10 pins/runner) for ~30s execution!
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import { crawlKeywordSERP } from '../src/modules/keywords/service.mjs';

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
const crawlScope = (process.env.CRAWL_SCOPE || 'all_pins').toLowerCase().trim();
const cookie = process.env.PINTEREST_COOKIE || null;
const maxPinsInput = Math.max(5, Math.min(250, parseInt(process.env.MAX_PINS || '100', 10)));
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
  console.log(`[Config] Target Input: "${rawTargetKeyword || '<EMPTY: ALL ACTIVE KEYWORDS>'}"`);
  console.log(`[Config] Crawl Scope:  "${crawlScope}"`);
  console.log(`[Config] Max Pins:     ${maxPinsInput}`);

  const isSweepAll = !rawTargetKeyword || rawTargetKeyword.toLowerCase() === 'all' || rawTargetKeyword.toLowerCase() === 'cron' || rawTargetKeyword.toLowerCase() === '*';
  const commaKeywords = rawTargetKeyword.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  let mode = 'keyword_sweep';
  let matrixTasks = [];
  let summaryDetails = {};

  if (isSweepAll || commaKeywords.length > 1) {
    // =========================================================================
    // MODE A: MULTI-KEYWORD BROADCAST MATRIX (Up to 20 Parallel Runners)
    // =========================================================================
    mode = 'keyword_sweep';
    console.log('\n[*] Mode Selected: MODE A (Multi-Keyword Broadcast Fleet)');

    let targetRows = [];
    if (commaKeywords.length > 1) {
      console.log(`[*] Resolving ${commaKeywords.length} explicitly specified keywords...`);
      for (const kwStr of commaKeywords.slice(0, 20)) {
        let [row] = await sql`
          SELECT id, keyword, category, target_pin_count 
          FROM tracked_keywords 
          WHERE LOWER(keyword) = ${kwStr} AND is_active = TRUE;
        `;
        if (!row) {
          console.log(`  [+] Auto-registering new keyword: "${kwStr}"`);
          [row] = await sql`
            INSERT INTO tracked_keywords (keyword, category, target_pin_count, is_active)
            VALUES (${kwStr}, 'General', 100, TRUE)
            RETURNING id, keyword, category, target_pin_count;
          `;
        }
        if (row) targetRows.push(row);
      }
    } else {
      console.log('[*] Querying top active keywords from Central Metadata Hub...');
      targetRows = await sql`
        SELECT id, keyword, category, target_pin_count 
        FROM tracked_keywords 
        WHERE is_active = TRUE 
        ORDER BY last_crawled_at ASC NULLS FIRST 
        LIMIT 20;
      `;
    }

    console.log(`[*] Dispatched ${targetRows.length} active keywords.`);

    if (targetRows.length === 0) {
      console.log('[!] Warning: No active keywords found in database. Emitting empty matrix.');
      matrixTasks = [];
    } else {
      matrixTasks = targetRows.map((row, idx) => ({
        mode: 'keyword_sweep',
        keyword: row.keyword,
        keyword_id: row.id,
        category: row.category || 'General',
        worker_index: idx,
        worker_total: targetRows.length,
        max_pins: maxPinsInput,
        crawl_scope: crawlScope
      }));
    }

    summaryDetails = {
      mode: 'Multi-Keyword Broadcast',
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

    // 1. Resolve / Register Keyword in Central Hub
    let [kwRow] = await sql`
      SELECT id, keyword, category, target_pin_count 
      FROM tracked_keywords 
      WHERE LOWER(keyword) = ${singleKeyword} AND is_active = TRUE;
    `;
    if (!kwRow) {
      console.log(`  [+] Auto-registering keyword: "${singleKeyword}"...`);
      [kwRow] = await sql`
        INSERT INTO tracked_keywords (keyword, category, target_pin_count, is_active)
        VALUES (${singleKeyword}, 'General', 100, TRUE)
        RETURNING id, keyword, category, target_pin_count;
      `;
    }

    console.log(`  [+] Keyword Confirmed: "${kwRow.keyword}" (ID: ${kwRow.id})`);

    // 2. Stage 1: Fast SERP Search Ingestion (~5-8s)
    console.log('  [*] Executing Stage 1 Fast SERP Ingestion via Pinterest API...');
    try {
      const crawlRes = await crawlKeywordSERP(sql, kwRow.id, cookie);
      if (crawlRes?.success) {
        console.log(`  [+] Stage 1 Complete: Captured ${crawlRes.crawled_pins} pins | Avg Velocity: +${crawlRes.avg_velocity} saves/day`);
      } else {
        console.warn(`  [!] Stage 1 Warning: ${crawlRes?.message || 'Incomplete SERP fetch'}`);
      }
    } catch (serpErr) {
      console.warn(`  [!] Stage 1 Warning (proceeding to catalog inspection): ${serpErr.message}`);
    }

    // 3. Query All Relevant Pins for this Keyword (Active SERP + Displaced Vault)
    let candidatePins = [];
    if (crawlScope === 'active_serp') {
      console.log('  [*] Scope: active_serp (Top organic ranking pins only)');
      candidatePins = await sql`
        SELECT pin_id, rank_position, FALSE as is_displaced
        FROM keyword_serp_current
        WHERE keyword_id = ${kwRow.id} AND pin_id ~ '^[0-9]+$'
        ORDER BY rank_position ASC;
      `;
    } else {
      console.log('  [*] Scope: all_pins (Active SERP + Displaced Vault full catalog)');
      candidatePins = await sql`
        SELECT DISTINCT ON (pin_id) pin_id, rank_position, is_displaced
        FROM (
          SELECT pin_id, rank_position, FALSE as is_displaced
          FROM keyword_serp_current
          WHERE keyword_id = ${kwRow.id} AND pin_id ~ '^[0-9]+$'
          UNION ALL
          SELECT pin_id, rank_position, is_displaced
          FROM keyword_pins_snapshots
          WHERE keyword_id = ${kwRow.id} AND pin_id ~ '^[0-9]+$'
        ) combined
        ORDER BY pin_id, rank_position ASC NULLS LAST;
      `;
    }

    const totalPinsFound = candidatePins.length;
    console.log(`  [+] Total Catalog Pins Discovered: ${totalPinsFound} pins`);

    if (totalPinsFound === 0) {
      console.log('  [!] No valid pins discovered for this keyword. Spawning 1 fallback runner.');
      matrixTasks = [{
        mode: 'pin_partition',
        keyword: kwRow.keyword,
        keyword_id: kwRow.id,
        worker_index: 0,
        worker_total: 1,
        total_pins: 0,
        crawl_scope: crawlScope,
        max_pins: maxPinsInput
      }];
    } else {
      // Calculate optimal runners count (up to 20 runners)
      const numWorkers = Math.min(20, Math.max(1, totalPinsFound));
      console.log(`  [*] Partitioning ${totalPinsFound} pins across ${numWorkers} concurrent runners (~${Math.ceil(totalPinsFound / numWorkers)} pins/runner)...`);

      matrixTasks = Array.from({ length: numWorkers }, (_, idx) => ({
        mode: 'pin_partition',
        keyword: kwRow.keyword,
        keyword_id: kwRow.id,
        worker_index: idx,
        worker_total: numWorkers,
        total_pins: totalPinsFound,
        crawl_scope: crawlScope,
        max_pins: maxPinsInput
      }));
    }

    summaryDetails = {
      mode: 'Single-Keyword Pin-Slice Sharding',
      keyword: kwRow.keyword,
      keywordId: kwRow.id,
      totalCatalogPins: totalPinsFound,
      runnersAssigned: matrixTasks.length,
      averagePinsPerRunner: Math.ceil(totalPinsFound / (matrixTasks.length || 1))
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

  // Write Markdown summary to $GITHUB_STEP_SUMMARY if available
  if (stepSummaryPath) {
    try {
      let md = `## 🚀 Stage 0: Dynamic Fleet Orchestrator & Dispatcher\n\n`;
      md += `> **Fleet Mode**: \`${summaryDetails.mode}\` | **Parallel Runners Allocated**: **${matrixTasks.length} / 20**\n\n`;

      if (mode === 'keyword_sweep') {
        md += `### 📋 Assigned Keywords Matrix\n\n`;
        md += `| Runner # | Assigned Keyword | Category | Target Pins |\n`;
        md += `| :---: | :--- | :--- | :---: |\n`;
        matrixTasks.forEach(t => {
          md += `| **Runner ${t.worker_index + 1}/${t.worker_total}** | \`${t.keyword}\` | ${t.category} | ${t.max_pins} |\n`;
        });
      } else {
        md += `### 🎯 Single-Keyword 201-Pin Catalog Partition\n\n`;
        md += `- **Target Keyword**: \`${summaryDetails.keyword}\` (ID: ${summaryDetails.keywordId})\n`;
        md += `- **Total Catalog Pins**: **${summaryDetails.totalCatalogPins}** (Active SERP + Displaced Vault)\n`;
        md += `- **Slices Created**: **${matrixTasks.length}** concurrent partitions (~${summaryDetails.averagePinsPerRunner} pins/runner)\n`;
        md += `- **Estimated Inspection Latency**: **~30 seconds** across 20 Azure egress IPs\n\n`;
      }

      fs.appendFileSync(stepSummaryPath, md, 'utf8');
      console.log('[+] Wrote Dispatcher Markdown to $GITHUB_STEP_SUMMARY');
    } catch (sErr) {
      console.warn(`[!] Failed writing to GITHUB_STEP_SUMMARY: ${sErr.message}`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[-] Fatal Dispatcher Error:', err);
  process.exit(1);
});
