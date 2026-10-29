#!/usr/bin/env node

/**
 * scripts/creator-fleet-dispatcher.mjs
 * 
 * Intelligent Dynamic Fleet Orchestrator & Dispatcher for Creator Intelligence
 * Coordinates the 20-Runner Distributed GitHub Actions Fleet:
 * 
 * - Mode A (Scheduled Sweep - All Active Creators):
 *   Partitions all active creator profiles (competitor_profiles WHERE is_active = TRUE)
 *   modulo 20 across 20 persistent parallel runners (Single Wave, zero queuing latency).
 * 
 * - Mode B (Targeted Account Swarm):
 *   Partitions a single target account's catalog inspection across 20 runners.
 * 
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import { normalizePinterestUsername } from '../src/modules/creators/service.mjs';

// Auto-load .env in local execution environments
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required for creator fleet dispatcher.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const rawTargetAccount = (process.env.TARGET_ACCOUNT || '').trim();
const rawCrawlMode = (process.env.CRAWL_MODE || '').trim().toLowerCase();
const rawMaxPages = (process.env.MAX_PAGES || '').trim();
const personalBoardsOnly = process.env.PERSONAL_BOARDS_ONLY !== 'false';
const targetBoards = (process.env.TARGET_BOARDS || '').trim();
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
  console.log('   🚀 CREATOR INTELLIGENCE FLEET DISPATCHER (20-RUNNER SWARM)');
  console.log('================================================================');

  const isSweepAll = !rawTargetAccount ||
    rawTargetAccount.toLowerCase() === 'all' ||
    rawTargetAccount.toLowerCase() === 'cron' ||
    rawTargetAccount.toLowerCase() === '*';

  const cleanTargetAccount = normalizePinterestUsername(rawTargetAccount);

  console.log(`[Config] Target Account:    "${rawTargetAccount ? '@' + cleanTargetAccount : '<ALL ACTIVE CREATORS>'}"`);
  console.log(`[Config] Crawl Mode:        "${rawCrawlMode || (isSweepAll ? 'refresh' : 'sharded_boards')}"`);
  console.log(`[Config] Max Pages Cap:     "${rawMaxPages || (isSweepAll ? '3' : '1000')}"`);
  console.log(`[Config] Personal Only:     ${personalBoardsOnly}`);
  console.log(`[Config] Target Boards:     "${targetBoards || '<ALL BOARDS>'}"`);

  let mode = 'creator_sweep';
  let matrixTasks = [];
  let summaryDetails = {};

  const WORKER_COUNT = 20;

  // [INVARIANT: FOLDER-PAUSE-ENFORCEMENT] Inspect folder pause flags if FOLDER_ID is provided
  const rawFolderId = (process.env.FOLDER_ID || '').trim();
  if (rawFolderId) {
    const fid = parseInt(rawFolderId, 10);
    console.log(`[Config] Folder Scope:      ID ${fid}`);
    const [folderRow] = await sql`
      SELECT id, name, metadata, status FROM keyword_folders WHERE id = ${fid} LIMIT 1;
    `;
    if (folderRow) {
      const folderMeta = typeof folderRow.metadata === 'object' && folderRow.metadata !== null
        ? folderRow.metadata
        : {};
      const isCompetitorPaused = Boolean(
        folderMeta.pause_competitors ||
        folderMeta.block_fleet ||
        folderMeta.block_gha_fleet ||
        folderMeta.status === 'paused' ||
        (folderRow.status && String(folderRow.status).toLowerCase() === 'paused')
      );
      if (isCompetitorPaused) {
        console.log(`\n  [!] GUARD: Folder "${folderRow.name}" competitor tracking is paused (pause_competitors=${Boolean(folderMeta.pause_competitors)}, block_fleet=${Boolean(folderMeta.block_fleet)}).`);
        console.log(`  [*] Emitting empty task matrix (0 tasks) and terminating cleanly.`);
        matrixTasks = [];
        const matrixJson = JSON.stringify(matrixTasks);
        await writeOutput('mode', mode);
        await writeOutput('task_count', '0');
        await writeOutput('matrix_tasks', matrixJson);
        process.exitCode = 0;
        return;
      }
    }
  }

  if (isSweepAll) {
    // =========================================================================
    // MODE A: SCHEDULED SWEEP (All Active Competitor Profiles Modulo 20)
    // =========================================================================
    mode = 'creator_sweep';
    console.log('\n[*] Mode Selected: MODE A (Scheduled Sweep across All Active Creators)');

    console.log('[*] Querying all active creator profiles from Central Hub...');
    const activeProfiles = await sql`
      SELECT id, username, display_name, monthly_reach, profile_views, total_pins, total_boards, is_active, last_synced_at
      FROM competitor_profiles
      WHERE is_active = TRUE
      ORDER BY last_synced_at ASC NULLS FIRST, id ASC;
    `;

    console.log(`[*] Resolved ${activeProfiles.length} active creator profile(s) in Central Hub.`);

    if (activeProfiles.length === 0) {
      console.log('[!] Warning: Zero active creator profiles found in database. Emitting empty matrix.');
      matrixTasks = [];
      summaryDetails = {
        mode: 'Scheduled Creator Sweep (0 Active Accounts)',
        accountsCount: 0,
        runnersAssigned: 0
      };
    } else {
      const allAccountIdsCsv = activeProfiles.map(p => p.id).join(',');
      const maxPages = rawMaxPages && !isNaN(parseInt(rawMaxPages, 10))
        ? Math.max(1, parseInt(rawMaxPages, 10))
        : 3; // Default 3 pages early-stop for scheduled refresh
      const crawlMode = rawCrawlMode || 'refresh';

      matrixTasks = Array.from({ length: WORKER_COUNT }, (_, w) => {
        const chunk = activeProfiles.filter((_, idx) => idx % WORKER_COUNT === w);
        return {
          mode: 'creator_sweep',
          target_account: '',
          account_name: chunk.length > 0
            ? `@${chunk[0].username} (+${Math.max(0, chunk.length - 1)} creators)`
            : `Creator Swarm Worker #${w + 1}`,
          account_id: chunk[0]?.id || activeProfiles[0].id,
          account_ids: chunk.map(p => p.id).join(','),
          account_usernames: chunk.map(p => p.username).join(','),
          all_account_ids: allAccountIdsCsv,
          accounts_count: chunk.length,
          worker_index: w,
          worker_slot: w + 1,
          worker_total: WORKER_COUNT,
          max_pages: maxPages,
          crawl_mode: crawlMode,
          personal_boards_only: personalBoardsOnly,
          target_boards: targetBoards
        };
      });

      summaryDetails = {
        mode: 'Global Two-Phase Creator Swarm (20 Persistent Workers)',
        accountsCount: activeProfiles.length,
        runnersAssigned: matrixTasks.length,
        accountsList: activeProfiles.map(p => '@' + p.username)
      };
    }
  } else {
    // =========================================================================
    // MODE B: TARGETED ACCOUNT SWARM (Single Account Sliced across 20 Runners)
    // =========================================================================
    mode = 'single_account_swarm';
    console.log(`\n[*] Mode Selected: MODE B (Single-Account 20-Worker Swarm for @${cleanTargetAccount})`);

    // [INVARIANT: SARGABLE-QUERIES] Sanitize input in JS and seek indexed column directly
    let [accRow] = await sql`
      SELECT id, username, display_name, monthly_reach, profile_views, total_pins, is_active
      FROM competitor_profiles
      WHERE username = ${cleanTargetAccount}
      LIMIT 1;
    `;

    if (accRow) {
      if (!accRow.is_active) {
        console.log(`  [+] Reactivating profile @${cleanTargetAccount} in Central Hub...`);
        await sql`
          UPDATE competitor_profiles
          SET is_active = TRUE, updated_at = NOW()
          WHERE id = ${accRow.id};
        `;
      }
    } else {
      console.log(`  [+] Auto-registering new creator profile: @${cleanTargetAccount}...`);
      [accRow] = await sql`
        INSERT INTO competitor_profiles (username, display_name, account_type, is_active, created_at, updated_at)
        VALUES (${cleanTargetAccount}, ${cleanTargetAccount}, 'competitor', TRUE, NOW(), NOW())
        ON CONFLICT (username) DO UPDATE SET
          is_active = TRUE,
          updated_at = NOW()
        RETURNING id, username, display_name, monthly_reach, profile_views, total_pins, is_active;
      `;
    }

    console.log(`  [+] Creator Profile Confirmed: @${accRow.username} (ID: ${accRow.id})`);

    const maxPages = rawMaxPages && !isNaN(parseInt(rawMaxPages, 10))
      ? Math.max(1, parseInt(rawMaxPages, 10))
      : 1000;
    const crawlMode = rawCrawlMode || 'sharded_boards';

    matrixTasks = Array.from({ length: WORKER_COUNT }, (_, idx) => ({
      mode: 'single_account_swarm',
      target_account: accRow.username,
      account_name: `@${accRow.username}`,
      account_id: accRow.id,
      account_ids: String(accRow.id),
      account_usernames: accRow.username,
      all_account_ids: String(accRow.id),
      accounts_count: 1,
      worker_index: idx,
      worker_slot: idx + 1,
      worker_total: WORKER_COUNT,
      max_pages: maxPages,
      crawl_mode: crawlMode,
      personal_boards_only: personalBoardsOnly,
      target_boards: targetBoards
    }));

    summaryDetails = {
      mode: 'Single-Account Distributed 20-Worker Swarm',
      targetAccount: '@' + accRow.username,
      accountId: accRow.id,
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
  console.log('✅ CREATOR FLEET DISPATCH COMPLETE');
  console.log(`• Mode:        ${mode}`);
  console.log(`• Total Tasks: ${matrixTasks.length}`);
  console.log(`• Output Size: ${matrixJson.length} bytes`);
  console.log('================================================================');

  if (stepSummaryPath) {
    try {
      let md = `## 🚀 Stage 0: Creator Intelligence Fleet Dispatcher\n\n`;
      md += `> **Fleet Mode**: \`${summaryDetails.mode}\` | **Tasks Dispatched**: **${matrixTasks.length}** (Max Concurrent Runners: **20**) | **Architecture**: \`20-Worker Swarm\`\n\n`;

      if (mode === 'creator_sweep') {
        md += `### 📋 Assigned Creator Swarm Workers (${summaryDetails.accountsCount} Creators -> 20 Persistent Workers)\n\n`;
        md += `| Runner # | Assigned Slice | Creators Count |\n`;
        md += `| :---: | :--- | :---: |\n`;
        matrixTasks.forEach(t => {
          md += `| **Runner ${t.worker_index + 1}/${t.worker_total}** | \`${t.account_name}\` | ${t.accounts_count || 0} |\n`;
        });
      } else {
        md += `### 🎯 Targeted Creator Swarm\n\n`;
        md += `- **Target Creator**: \`${summaryDetails.targetAccount}\` (ID: ${summaryDetails.accountId})\n`;
        md += `- **Parallel Runners**: **${matrixTasks.length}** runners allocated\n`;
        md += `- **Execution Protocol**: Worker 0 conducts board/feed ingestion; all 20 runners slice catalog for parallel enrichment & qualification\n\n`;
      }

      fs.appendFileSync(stepSummaryPath, md, 'utf8');
      console.log('[+] Wrote Creator Dispatcher Markdown to $GITHUB_STEP_SUMMARY');
    } catch (sErr) {
      console.warn(`[!] Failed writing to GITHUB_STEP_SUMMARY: ${sErr.message}`);
    }
  }

  process.exitCode = 0;
}

main().catch(err => {
  console.error('[-] Fatal Creator Dispatcher Error:', err);
  process.exit(1);
});
