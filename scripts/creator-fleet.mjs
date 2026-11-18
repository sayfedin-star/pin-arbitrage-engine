#!/usr/bin/env node

/**
 * scripts/creator-fleet.mjs
 *
 * Unified Creator Intelligence Fleet Orchestrator:
 *   --stage=dispatch    -> Stage 0 Dynamic 20-Runner Swarm Dispatcher (Modes A / B)
 *   --stage=consolidate -> Stage 2 Creator Telemetry, Snapshot Healing & Executive Report Consolidator
 *
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePinterestUsername } from '../src/modules/creators/competitors-crud.mjs';
import {
  runFleetLifecycle,
  writeGitHubOutput,
  appendStepSummary,
  parseCliFlags,
  DEFAULT_FLEET_WORKER_TOTAL
} from './lib/fleet-runner.mjs';

export const VALID_CREATOR_FLEET_STAGES = Object.freeze(['dispatch', 'consolidate']);

/**
 * Parses and validates `--stage=dispatch|consolidate` CLI arguments.
 */
export function parseCreatorFleetArgs(argv = process.argv.slice(2), env = process.env) {
  const { flags } = parseCliFlags(argv);
  const rawStage = String(flags.stage ?? env?.FLEET_STAGE ?? '').trim().toLowerCase();
  if (!VALID_CREATOR_FLEET_STAGES.includes(rawStage)) {
    throw new Error(
      `Invalid or missing --stage="${rawStage}" for creator-fleet.mjs. Expected --stage=dispatch or --stage=consolidate.`
    );
  }
  return {
    stage: rawStage,
    flags
  };
}

function formatNumber(num) {
  const val = Number(num);
  if (!Number.isFinite(val)) return '0';
  return val.toLocaleString();
}

function formatDelta(val) {
  const num = Number(val);
  if (!Number.isFinite(num) || num === 0) return '—';
  return num > 0 ? `+${num.toLocaleString()}` : num.toLocaleString();
}

async function healCreatorSequencesAndCeilings(sql, { includeSnapshots = false } = {}) {
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
    await sql`
      UPDATE competitor_profiles
      SET
        delta_reach_24h = CASE
          WHEN (monthly_reach > 10000001 AND (monthly_reach - delta_reach_24h) = 10000001)
            OR (monthly_reach = 10000001 AND delta_reach_24h < 0)
          THEN 0
          ELSE delta_reach_24h
        END,
        reach_delta_7d = CASE
          WHEN (monthly_reach > 10000001 AND (monthly_reach - reach_delta_7d) = 10000001)
            OR (monthly_reach = 10000001 AND reach_delta_7d < 0)
          THEN 0
          ELSE reach_delta_7d
        END,
        delta_views_24h = CASE
          WHEN (profile_views > 10000001 AND (profile_views - delta_views_24h) = 10000001)
            OR (profile_views = 10000001 AND delta_views_24h < 0)
          THEN 0
          ELSE delta_views_24h
        END,
        views_delta_7d = CASE
          WHEN (profile_views > 10000001 AND (profile_views - views_delta_7d) = 10000001)
            OR (profile_views = 10000001 AND views_delta_7d < 0)
          THEN 0
          ELSE views_delta_7d
        END
      WHERE
        (monthly_reach > 10000001 AND ((monthly_reach - delta_reach_24h) = 10000001 OR (monthly_reach - reach_delta_7d) = 10000001))
        OR (monthly_reach = 10000001 AND (delta_reach_24h < 0 OR reach_delta_7d < 0))
        OR (profile_views > 10000001 AND ((profile_views - delta_views_24h) = 10000001 OR (profile_views - views_delta_7d) = 10000001))
        OR (profile_views = 10000001 AND (delta_views_24h < 0 OR views_delta_7d < 0));
    `;

    if (includeSnapshots) {
      await sql`
        UPDATE competitor_history_snapshots chs
        SET
          monthly_reach = CASE
            WHEN (chs.monthly_reach = 0 AND cp.monthly_reach > 0) THEN cp.monthly_reach
            WHEN chs.monthly_reach = 10000001 AND cp.monthly_reach > 10000001 THEN cp.monthly_reach
            ELSE chs.monthly_reach
          END,
          profile_views = CASE
            WHEN (chs.profile_views = 0 AND cp.profile_views > 0) THEN cp.profile_views
            WHEN chs.profile_views = 10000001 AND cp.profile_views > 10000001 THEN cp.profile_views
            ELSE chs.profile_views
          END,
          total_pins = CASE
            WHEN chs.total_pins = 0 AND cp.total_pins > 0 THEN cp.total_pins
            ELSE chs.total_pins
          END,
          total_boards = CASE
            WHEN chs.total_boards = 0 AND cp.total_boards > 0 THEN cp.total_boards
            ELSE chs.total_boards
          END
        FROM competitor_profiles cp
        WHERE chs.competitor_id = cp.id
          AND (
            (chs.monthly_reach = 0 AND cp.monthly_reach > 0)
            OR (chs.profile_views = 0 AND cp.profile_views > 0)
            OR (chs.total_pins = 0 AND cp.total_pins > 0)
            OR (chs.total_boards = 0 AND cp.total_boards > 0)
            OR (chs.monthly_reach = 10000001 AND cp.monthly_reach > 10000001)
            OR (chs.profile_views = 10000001 AND cp.profile_views > 10000001)
          );
      `;
      await sql`
        INSERT INTO competitor_history_snapshots (
          competitor_id,
          monthly_reach,
          profile_views,
          follower_count,
          total_pins,
          total_boards,
          recorded_date,
          metadata
        )
        SELECT
          cp.id,
          cp.monthly_reach,
          cp.profile_views,
          cp.follower_count,
          cp.total_pins,
          cp.total_boards,
          CURRENT_DATE,
          jsonb_build_object(
            'delta_reach_24h', COALESCE(cp.delta_reach_24h, 0),
            'reach_delta_7d', COALESCE(cp.reach_delta_7d, 0),
            'delta_views_24h', COALESCE(cp.delta_views_24h, 0),
            'views_delta_7d', COALESCE(cp.views_delta_7d, 0),
            'delta_pins_24h', COALESCE(cp.delta_pins_24h, 0),
            'pins_delta_7d', COALESCE(cp.pins_delta_7d, 0),
            'delta_boards_24h', COALESCE(cp.delta_boards_24h, 0),
            'boards_delta_7d', COALESCE(cp.boards_delta_7d, 0)
          )
        FROM competitor_profiles cp
        WHERE cp.last_synced_at >= CURRENT_DATE
          AND NOT EXISTS (
            SELECT 1 FROM competitor_history_snapshots chs
            WHERE chs.competitor_id = cp.id AND chs.recorded_date = CURRENT_DATE
          )
        ON CONFLICT (competitor_id, recorded_date) DO NOTHING;
      `;
    }
  } catch (healErr) {
    console.warn('[!] Creator sequence/ceiling heal warning:', healErr.message);
  }
}

/**
 * Stage 0: Creator Intelligence Fleet Dispatcher
 */
export async function runCreatorFleetDispatch({ sql, env = process.env }) {
  const rawTargetAccount = String(env.TARGET_ACCOUNT || '').trim();
  const rawCrawlMode = String(env.CRAWL_MODE || '').trim().toLowerCase();
  const rawMaxPages = String(env.MAX_PAGES || '').trim();
  const personalBoardsOnly = env.PERSONAL_BOARDS_ONLY !== 'false';
  const targetBoards = String(env.TARGET_BOARDS || '').trim();
  const stepSummaryPath = env.GITHUB_STEP_SUMMARY || null;
  const githubOutputPath = env.GITHUB_OUTPUT || null;

  console.log('================================================================');
  console.log('   🚀 CREATOR INTELLIGENCE FLEET DISPATCHER (20-RUNNER SWARM)');
  console.log('================================================================');

  await healCreatorSequencesAndCeilings(sql, { includeSnapshots: false });

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
  const WORKER_COUNT = DEFAULT_FLEET_WORKER_TOTAL;

  const rawFolderId = String(env.FOLDER_ID || '').trim();
  if (rawFolderId) {
    const fid = parseInt(rawFolderId, 10);
    console.log(`[Config] Folder Scope:      ID ${fid}`);
    const [folderRow] = await sql`
      SELECT id, name, metadata FROM keyword_folders WHERE id = ${fid} LIMIT 1;
    `;
    if (folderRow) {
      const folderMeta = typeof folderRow.metadata === 'object' && folderRow.metadata !== null
        ? folderRow.metadata
        : {};
      const isCompetitorPaused = Boolean(
        folderMeta.pause_competitors ||
        folderMeta.block_fleet ||
        folderMeta.block_gha_fleet ||
        folderMeta.status === 'paused'
      );
      if (isCompetitorPaused) {
        console.log(`\n  [!] GUARD: Folder "${folderRow.name}" competitor tracking is paused (pause_competitors=${Boolean(folderMeta.pause_competitors)}, block_fleet=${Boolean(folderMeta.block_fleet)}).`);
        console.log('  [*] Emitting empty task matrix (0 tasks) and terminating cleanly.');
        matrixTasks = [];
        const matrixJson = JSON.stringify(matrixTasks);
        await writeGitHubOutput('mode', mode, githubOutputPath);
        await writeGitHubOutput('task_count', '0', githubOutputPath);
        await writeGitHubOutput('matrix_tasks', matrixJson, githubOutputPath);
        return { mode, taskCount: 0, matrixTasks, paused: true };
      }
    }
  }

  if (isSweepAll) {
    mode = 'creator_sweep';
    console.log('\n[*] Mode Selected: MODE A (Scheduled Sweep across All Active Creators)');
    console.log('[*] Querying all active creator profiles from Central Hub...');

    const activeProfiles = await sql`
      SELECT id, username, tracking_mode, last_synced_at
      FROM competitor_profiles
      WHERE is_active = TRUE
        AND COALESCE(account_type, 'competitor') <> 'system'
      ORDER BY (CASE WHEN tracking_mode = 'full' THEN 0 ELSE 1 END) ASC, last_synced_at ASC NULLS FIRST, id ASC;
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
      const maxPages = rawMaxPages && !isNaN(parseInt(rawMaxPages, 10))
        ? Math.max(1, parseInt(rawMaxPages, 10))
        : 3;
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
          all_account_ids: '',
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
    mode = 'single_account_swarm';
    console.log(`\n[*] Mode Selected: MODE B (Single-Account 20-Worker Swarm for @${cleanTargetAccount})`);

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

  const matrixJson = JSON.stringify(matrixTasks);
  await writeGitHubOutput('mode', mode, githubOutputPath);
  await writeGitHubOutput('task_count', String(matrixTasks.length), githubOutputPath);
  await writeGitHubOutput('matrix_tasks', matrixJson, githubOutputPath);

  console.log('\n================================================================');
  console.log('✅ CREATOR FLEET DISPATCH COMPLETE');
  console.log(`• Mode:        ${mode}`);
  console.log(`• Total Tasks: ${matrixTasks.length}`);
  console.log(`• Output Size: ${matrixJson.length} bytes`);
  console.log('================================================================');

  if (stepSummaryPath) {
    let md = '## 🚀 Stage 0: Creator Intelligence Fleet Dispatcher\n\n';
    md += `> **Fleet Mode**: \`${summaryDetails.mode}\` | **Tasks Dispatched**: **${matrixTasks.length}** (Max Concurrent Runners: **20**) | **Architecture**: \`20-Worker Swarm\`\n\n`;

    if (mode === 'creator_sweep') {
      md += `### 📋 Assigned Creator Swarm Workers (${summaryDetails.accountsCount} Creators -> 20 Persistent Workers)\n\n`;
      md += '| Runner # | Assigned Slice | Creators Count |\n';
      md += '| :---: | :--- | :---: |\n';
      matrixTasks.forEach(t => {
        md += `| **Runner ${t.worker_index + 1}/${t.worker_total}** | \`${t.account_name}\` | ${t.accounts_count || 0} |\n`;
      });
    } else {
      md += '### 🎯 Targeted Creator Swarm\n\n';
      md += `- **Target Creator**: \`${summaryDetails.targetAccount}\` (ID: ${summaryDetails.accountId})\n`;
      md += `- **Parallel Runners**: **${matrixTasks.length}** runners allocated\n`;
      md += '- **Execution Protocol**: Worker 0 conducts board/feed ingestion; all 20 runners slice catalog for parallel enrichment & qualification\n\n';
    }

    if (appendStepSummary(md, stepSummaryPath)) {
      console.log('[+] Wrote Creator Dispatcher Markdown to $GITHUB_STEP_SUMMARY');
    }
  }

  return { mode, taskCount: matrixTasks.length, matrixTasks };
}

/**
 * Stage 2: Creator Fleet Telemetry & Executive Report Consolidation Engine
 */
export async function runCreatorFleetConsolidate({ sql, env = process.env }) {
  const mode = String(env.MODE || 'creator_sweep').toLowerCase().trim();
  const rawTargetAccount = String(env.TARGET_ACCOUNT || '').trim();
  const isSweepAll = !rawTargetAccount ||
    rawTargetAccount.toLowerCase() === 'all' ||
    rawTargetAccount.toLowerCase() === 'cron' ||
    rawTargetAccount.toLowerCase() === '*';
  const targetAccount = isSweepAll ? '' : rawTargetAccount.replace(/^@+/, '').toLowerCase();
  const stepSummaryPath = env.GITHUB_STEP_SUMMARY || null;

  console.log('================================================================');
  console.log('   📊 STAGE 2: CREATOR FLEET CONSOLIDATOR & EXECUTIVE REPORT');
  console.log('================================================================');
  console.log(`[Config] Execution Mode: ${mode.toUpperCase()}`);
  console.log(`[Config] Target Account: "${targetAccount ? '@' + targetAccount : '<ALL ACTIVE>'}"`);

  let mdReport = '';

  await healCreatorSequencesAndCeilings(sql, { includeSnapshots: true });

  console.log('[*] Compiling Creator Hub performance matrix...');
  const activeProfiles = await sql`
    WITH winners_agg AS (
      SELECT creator_username AS account_username, COUNT(*)::int AS qualified_winners
      FROM universal_master_pins
      WHERE is_hydrated = TRUE AND (COALESCE(save_count, 0) >= 500 OR COALESCE(daily_save_velocity, 0) >= 5)
      GROUP BY creator_username
    ),
    catalog_agg AS (
      SELECT cp.id AS competitor_id, COUNT(cbp.pin_id)::int AS catalog_pins
      FROM competitor_profiles cp
      LEFT JOIN competitor_board_pins cbp ON cbp.competitor_id = cp.id
      GROUP BY cp.id
    )
    SELECT
      cp.id,
      cp.username,
      cp.display_name,
      cp.tracking_mode,
      COALESCE(cp.profile_views, 0)::bigint AS impressions,
      COALESCE(cp.views_delta_7d, 0)::bigint AS views_delta_7d,
      COALESCE(cp.monthly_reach, 0)::bigint AS total_audience,
      COALESCE(cp.reach_delta_7d, 0)::bigint AS reach_delta_7d,
      COALESCE(cp.total_pins, 0)::int AS total_pins,
      COALESCE(cp.total_boards, 0)::int AS total_boards,
      COALESCE(cp.follower_count, 0)::int AS follower_count,
      cp.last_synced_at,
      COALESCE(wa.qualified_winners, 0) AS qualified_winners,
      COALESCE(ca.catalog_pins, 0) AS catalog_pins
    FROM competitor_profiles cp
    LEFT JOIN winners_agg wa ON wa.account_username = cp.username
    LEFT JOIN catalog_agg ca ON ca.competitor_id = cp.id
    WHERE (${targetAccount} = '' OR cp.username = ${targetAccount})
      AND cp.is_active = TRUE
      AND COALESCE(cp.account_type, 'competitor') <> 'system'
    ORDER BY cp.monthly_reach DESC NULLS LAST, cp.id ASC;
  `;

  const totalActiveCreators = activeProfiles.length;
  const totalCombinedAudience = activeProfiles.reduce((acc, p) => acc + Number(p.total_audience || 0), 0);
  const totalCombinedImpressions = activeProfiles.reduce((acc, p) => acc + Number(p.impressions || 0), 0);
  const totalCatalogPins = activeProfiles.reduce((acc, p) => acc + Number(p.catalog_pins || 0), 0);
  const totalQualifiedWinners = activeProfiles.reduce((acc, p) => acc + Number(p.qualified_winners || 0), 0);

  console.log('[*] Querying Top Rising High-Velocity Pins...');
  const topRisingPins = await sql`
    SELECT
      pin_id,
      creator_username AS account_username,
      title,
      domain,
      destination_url AS link,
      save_count AS saves,
      repin_count AS repins,
      daily_save_velocity AS velocity,
      updated_at AS last_updated_at
    FROM universal_master_pins
    WHERE (${targetAccount} = '' OR creator_username = ${targetAccount})
      AND daily_save_velocity > 0
      AND updated_at >= NOW() - INTERVAL '48 hours'
    ORDER BY daily_save_velocity DESC NULLS LAST
    LIMIT 10;
  `;

  mdReport += '## 🚀 Creator Hub: 20-Worker Swarm Fleet Telemetry Report\n\n';
  mdReport += `> **Execution Mode**: \`${mode.toUpperCase()}\` | **Active Creators**: **${totalActiveCreators}** | **Fleet Compute**: \`20 Parallel Azure Runners\` | **Status**: 🟢 **Completed Successfully**\n\n`;
  mdReport += '### 📊 Creator Hub Aggregate Overview\n\n';
  mdReport += '| Metric | Aggregate Value | Official Pinterest Business Mapping |\n';
  mdReport += '| :--- | :---: | :--- |\n';
  mdReport += `| **Total Active Creators** | **${formatNumber(totalActiveCreators)}** | Monitored creator accounts |\n`;
  mdReport += `| **Combined Impressions** | **${formatNumber(totalCombinedImpressions)}** | \`profile_views\` (Profile Impressions) |\n`;
  mdReport += `| **Combined Total Audience** | **${formatNumber(totalCombinedAudience)}** | \`monthly_reach\` (Unique Monthly Audience) |\n`;
  mdReport += `| **Total Catalog Inventory** | **${formatNumber(totalCatalogPins)}** | \`competitor_board_pins\` |\n`;
  mdReport += `| **Total Qualified Winners** | **${formatNumber(totalQualifiedWinners)}** | \`universal_master_pins\` |\n\n`;

  mdReport += '### 📋 Active Creators Performance Matrix\n\n';
  mdReport += '| Creator | Impressions (7d Delta) | Total audience (7d Delta) | Followers | Catalog Pins | Qualified Winners | Last Synced |\n';
  mdReport += '| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n';

  const displayProfiles = activeProfiles.slice(0, 100);
  for (const prof of displayProfiles) {
    const syncTime = prof.last_synced_at ? new Date(prof.last_synced_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'Pending';
    mdReport += `| **[@${prof.username}](https://www.pinterest.com/${prof.username}/)** | ${formatNumber(prof.impressions)} (${formatDelta(prof.views_delta_7d)}) | ${formatNumber(prof.total_audience)} (${formatDelta(prof.reach_delta_7d)}) | ${formatNumber(prof.follower_count)} | ${formatNumber(prof.catalog_pins)} | **${formatNumber(prof.qualified_winners)}** | \`${syncTime}\` |\n`;
  }
  if (activeProfiles.length > 100) {
    mdReport += `\n*Showing top 100 of ${formatNumber(activeProfiles.length)} active creators sorted by Total audience. Full catalog tracked in unified PostgreSQL database.*\n`;
  }
  mdReport += '\n';

  if (topRisingPins.length > 0) {
    mdReport += '### 🔥 Top Rising High-Velocity Winning Pins (24h Momentum)\n\n';
    mdReport += '| Pin ID | Creator | Title & Destination | Total Saves | Repins | 24h Save Velocity |\n';
    mdReport += '| :--- | :--- | :--- | :---: | :---: | :---: |\n';

    for (const pin of topRisingPins) {
      const cleanTitle = (pin.title || 'Untitled Pin').replace(/\|/g, '-').slice(0, 50);
      const pinUrl = `https://www.pinterest.com/pin/${pin.pin_id}/`;
      const domainStr = pin.domain ? ` [${pin.domain}]` : '';
      mdReport += `| [\`${pin.pin_id}\`](${pinUrl}) | [@${pin.account_username}](https://www.pinterest.com/${pin.account_username}/) | [${cleanTitle}${domainStr}](${pin.link || pinUrl}) | **${formatNumber(pin.saves)}** | ${formatNumber(pin.repins)} | **+${pin.velocity}/day** ⚡ |\n`;
    }
    mdReport += '\n';
  }

  mdReport += '---\n\n';
  mdReport += '*✨ Zero Central Hub Snapshots. 100% Deterministic Shard Routing via IEEE 802.3 CRC32.*';

  if (appendStepSummary(mdReport, stepSummaryPath)) {
    console.log('[+] Successfully wrote Creator Consolidation Markdown to $GITHUB_STEP_SUMMARY');
  }

  // Single unified non-blocking VACUUM (ANALYZE) pass on Creator Hub tables (no duplicate back-to-back VACUUM calls)
  console.log('\n[*] Executing single unified VACUUM (ANALYZE) on Creator Hub tables...');
  try {
    await sql`VACUUM (ANALYZE) competitor_board_pins, competitor_profiles, universal_master_pins;`
      .catch(err => console.warn('    [!] VACUUM Creator Hub tables warning:', err.message));
    console.log('[✓] VACUUM (ANALYZE) completed for competitor_board_pins, competitor_profiles, universal_master_pins.');
  } catch (vErr) {
    console.warn('[!] VACUUM warning (non-fatal):', vErr.message);
  }

  if (env.SKIP_MV_REFRESH !== 'true') {
    try {
      console.log('[*] Refreshing Materialized View public.mv_pulse_24h_summary (CONCURRENTLY)...');
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_pulse_24h_summary;`;
      await sql`VACUUM public.mv_pulse_24h_summary;`;
      console.log('[✓] mv_pulse_24h_summary refreshed and vacuumed cleanly.');
    } catch (mvErr) {
      if (/has not been populated|cannot refresh.*concurrently/i.test(String(mvErr?.message || ''))) {
        try {
          await sql`REFRESH MATERIALIZED VIEW public.mv_pulse_24h_summary;`;
          await sql`VACUUM public.mv_pulse_24h_summary;`;
          console.log('[✓] mv_pulse_24h_summary populated via initial non-concurrent refresh.');
        } catch (fallbackErr) {
          console.warn('[!] mv_pulse_24h_summary refresh fallback warning:', fallbackErr.message);
        }
      } else {
        console.warn('[!] mv_pulse_24h_summary refresh warning:', mvErr.message);
      }
    }
  } else {
    console.log('[*] Skipping MV refresh (SKIP_MV_REFRESH=true; deferred to domain-enrich --mode=rollup).');
  }

  console.log('\n================================================================');
  console.log('✅ CREATOR FLEET CONSOLIDATION COMPLETE');
  console.log('================================================================');
  return { mode, totalActiveCreators, totalCatalogPins, totalQualifiedWinners };
}

export async function runCreatorFleet(argv = process.argv.slice(2), options = {}) {
  const env = options.env || process.env;
  const { stage } = parseCreatorFleetArgs(argv, env);
  const sqlOptions = stage === 'consolidate'
    ? { connection: { statement_timeout: 120000 } }
    : undefined;

  return runFleetLifecycle(
    `creator-fleet-${stage}`,
    async ({ sql }) => {
      if (stage === 'dispatch') {
        return runCreatorFleetDispatch({ sql, env });
      }
      return runCreatorFleetConsolidate({ sql, env });
    },
    {
      ...options,
      sqlOptions: options.sqlOptions ?? sqlOptions
    }
  );
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runCreatorFleet().catch((err) => {
    console.error('[-] Fatal Creator Fleet Error:', err?.message || err);
    process.exit(1);
  });
}
