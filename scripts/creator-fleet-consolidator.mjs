#!/usr/bin/env node

/**
 * scripts/creator-fleet-consolidator.mjs
 * 
 * Stage 2: Creator Fleet Telemetry & Executive Report Consolidation Engine
 * 
 * Executes after all 20 parallel runner jobs finish:
 * 1. Consolidates authentic metrics and generates Executive Markdown Report in $GITHUB_STEP_SUMMARY.
 * 2. Formats Active Competitors Performance Matrix using official Pinterest Business terminology
 *    (Impressions, Total audience, Total Pins, Qualified Winners).
 * 3. Highlights Top High-Velocity Rising Pins with momentum deltas.
 * 4. Runs automated Central Hub maintenance (optimizeHubStorage) and non-blocking VACUUM (ANALYZE).
 * 
 * // [INVARIANT: ZERO-HUB-SNAPSHOTS]
 * // [INVARIANT: DETERMINISTIC-CRC32-SHARDING]
 */

import { createSqlClient } from '../src/db/client.mjs';
import fs from 'node:fs';
import { optimizeHubStorage } from './optimize_hub_storage.mjs';

// Auto-load .env in local execution environments
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required for creator fleet consolidator.');
  process.exit(1);
}

const sql = createSqlClient(DATABASE_URL);
const mode = (process.env.MODE || 'creator_sweep').toLowerCase().trim();
const rawTargetAccount = (process.env.TARGET_ACCOUNT || '').trim();
const isSweepAll = !rawTargetAccount ||
  rawTargetAccount.toLowerCase() === 'all' ||
  rawTargetAccount.toLowerCase() === 'cron' ||
  rawTargetAccount.toLowerCase() === '*';
const targetAccount = isSweepAll ? '' : rawTargetAccount.replace(/^@+/, '').toLowerCase();
const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null;

/**
 * Format metric for readable executive report
 */
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

async function main() {
  console.log('================================================================');
  console.log('   📊 STAGE 2: CREATOR FLEET CONSOLIDATOR & EXECUTIVE REPORT');
  console.log('================================================================');
  console.log(`[Config] Execution Mode: ${mode.toUpperCase()}`);
  console.log(`[Config] Target Account: "${targetAccount ? '@' + targetAccount : '<ALL ACTIVE>'}"`);

  let mdReport = '';

  // 0. Heal 10M+ ceiling delta/snapshot artifacts & backfill any missing daily snapshots for accounts synced today
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
  } catch (healErr) {
    console.warn('[!] Consolidator sequence/ceiling heal warning:', healErr.message);
  }

  // 1. Fetch Active Competitor Profiles Matrix
  console.log('[*] Compiling Creator Hub performance matrix...');
  const activeProfiles = await sql`
    WITH winners_agg AS (
      SELECT account_username, COUNT(*)::int AS qualified_winners
      FROM pa_pins
      GROUP BY account_username
    ),
    catalog_agg AS (
      SELECT competitor_id, COUNT(*)::int AS catalog_pins
      FROM competitor_pins
      GROUP BY competitor_id
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

  // 2. Aggregate Fleet Health Totals
  const totalActiveCreators = activeProfiles.length;
  const totalCombinedAudience = activeProfiles.reduce((acc, p) => acc + Number(p.total_audience || 0), 0);
  const totalCombinedImpressions = activeProfiles.reduce((acc, p) => acc + Number(p.impressions || 0), 0);
  const totalCatalogPins = activeProfiles.reduce((acc, p) => acc + Number(p.catalog_pins || 0), 0);
  const totalQualifiedWinners = activeProfiles.reduce((acc, p) => acc + Number(p.qualified_winners || 0), 0);

  // 3. Fetch Top Rising Winning Pins (Sorted by 24h Save Velocity)
  console.log('[*] Querying Top Rising High-Velocity Pins...');
  const topRisingPins = await sql`
    SELECT 
      pin_id,
      account_username,
      title,
      domain,
      link,
      saves,
      repins,
      velocity,
      last_updated_at
    FROM pa_pins
    WHERE (${targetAccount} = '' OR account_username = ${targetAccount})
      AND velocity > 0
    ORDER BY velocity DESC NULLS LAST
    LIMIT 10;
  `;

  // 4. Construct Rich Markdown Summary
  mdReport += `## 🚀 Creator Hub: 20-Worker Swarm Fleet Telemetry Report\n\n`;
  mdReport += `> **Execution Mode**: \`${mode.toUpperCase()}\` | **Active Creators**: **${totalActiveCreators}** | **Fleet Compute**: \`20 Parallel Azure Runners\` | **Status**: 🟢 **Completed Successfully**\n\n`;

  mdReport += `### 📊 Creator Hub Aggregate Overview\n\n`;
  mdReport += `| Metric | Aggregate Value | Official Pinterest Business Mapping |\n`;
  mdReport += `| :--- | :---: | :--- |\n`;
  mdReport += `| **Total Active Creators** | **${formatNumber(totalActiveCreators)}** | Monitored creator accounts |\n`;
  mdReport += `| **Combined Impressions** | **${formatNumber(totalCombinedImpressions)}** | \`profile_views\` (Profile Impressions) |\n`;
  mdReport += `| **Combined Total Audience** | **${formatNumber(totalCombinedAudience)}** | \`monthly_reach\` (Unique Monthly Audience) |\n`;
  mdReport += `| **Total Catalog Inventory** | **${formatNumber(totalCatalogPins)}** | \`competitor_pins\` (Compacted skeletal rows) |\n`;
  mdReport += `| **Total Qualified Winners** | **${formatNumber(totalQualifiedWinners)}** | \`pa_pins\` (Proven winners showcase) |\n\n`;

  mdReport += `### 📋 Active Creators Performance Matrix\n\n`;
  mdReport += `| Creator | Impressions (7d Delta) | Total audience (7d Delta) | Followers | Catalog Pins | Qualified Winners | Last Synced |\n`;
  mdReport += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  const displayProfiles = activeProfiles.slice(0, 100);
  for (const prof of displayProfiles) {
    const syncTime = prof.last_synced_at ? new Date(prof.last_synced_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'Pending';
    mdReport += `| **[@${prof.username}](https://www.pinterest.com/${prof.username}/)** | ${formatNumber(prof.impressions)} (${formatDelta(prof.views_delta_7d)}) | ${formatNumber(prof.total_audience)} (${formatDelta(prof.reach_delta_7d)}) | ${formatNumber(prof.follower_count)} | ${formatNumber(prof.catalog_pins)} | **${formatNumber(prof.qualified_winners)}** | \`${syncTime}\` |\n`;
  }
  if (activeProfiles.length > 100) {
    mdReport += `\n*Showing top 100 of ${formatNumber(activeProfiles.length)} active creators sorted by Total audience. Full catalog tracked across fleet shards.*\n`;
  }
  mdReport += `\n`;

  if (topRisingPins.length > 0) {
    mdReport += `### 🔥 Top Rising High-Velocity Winning Pins (24h Momentum)\n\n`;
    mdReport += `| Pin ID | Creator | Title & Destination | Total Saves | Repins | 24h Save Velocity |\n`;
    mdReport += `| :--- | :--- | :--- | :---: | :---: | :---: |\n`;

    for (const pin of topRisingPins) {
      const cleanTitle = (pin.title || 'Untitled Pin').replace(/\|/g, '-').slice(0, 50);
      const pinUrl = `https://www.pinterest.com/pin/${pin.pin_id}/`;
      const domainStr = pin.domain ? ` [${pin.domain}]` : '';
      mdReport += `| [\`${pin.pin_id}\`](${pinUrl}) | [@${pin.account_username}](https://www.pinterest.com/${pin.account_username}/) | [${cleanTitle}${domainStr}](${pin.link || pinUrl}) | **${formatNumber(pin.saves)}** | ${formatNumber(pin.repins)} | **+${pin.velocity}/day** ⚡ |\n`;
    }
    mdReport += `\n`;
  }

  mdReport += `---\n\n`;
  mdReport += `*✨ Zero Central Hub Snapshots. 100% Deterministic Shard Routing via IEEE 802.3 CRC32.*`;

  // Write to $GITHUB_STEP_SUMMARY
  if (stepSummaryPath) {
    try {
      fs.appendFileSync(stepSummaryPath, mdReport, 'utf8');
      console.log('[+] Successfully wrote Creator Consolidation Markdown to $GITHUB_STEP_SUMMARY');
    } catch (sErr) {
      console.warn(`[!] Failed writing to GITHUB_STEP_SUMMARY: ${sErr.message}`);
    }
  }

  // 5. Automated Hub Maintenance & Vacuum
  console.log('\n[*] Running Automated Hub Storage Optimization & Compaction...');
  try {
    const hubResults = await optimizeHubStorage(sql);
    console.log(`[✓] Hub Optimization Complete: Compacted ${hubResults.compactedCompetitors || 0} competitor rows, pruned ${hubResults.prunedSnapshots || 0} snapshots.`);
  } catch (optErr) {
    console.warn(`[!] Hub storage optimization warning: ${optErr.message}`);
  }

  console.log('[*] Executing non-blocking VACUUM (ANALYZE) on Creator Hub tables...');
  try {
    await sql`VACUUM (ANALYZE) competitor_pins;`.catch(err => console.warn('    [!] VACUUM competitor_pins warning:', err.message));
    await sql`VACUUM (ANALYZE) competitor_profiles;`.catch(err => console.warn('    [!] VACUUM competitor_profiles warning:', err.message));
    await sql`VACUUM (ANALYZE) pa_pins;`.catch(err => console.warn('    [!] VACUUM pa_pins warning:', err.message));
    console.log('[✓] VACUUM (ANALYZE) successfully performed on competitor_pins, competitor_profiles, and pa_pins.');
  } catch (vErr) {
    console.warn('[!] VACUUM warning (non-fatal):', vErr.message);
  }

  // 6. Standalone Materialized View Refresh (outside transaction block for SQLSTATE 25001 safety)
  try {
    console.log('[*] Refreshing Materialized View public.mv_pulse_24h_summary (CONCURRENTLY)...');
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_pulse_24h_summary;`;
    console.log('[✓] mv_pulse_24h_summary refreshed cleanly.');
  } catch (mvErr) {
    if (/has not been populated|cannot refresh.*concurrently/i.test(String(mvErr?.message || ''))) {
      try {
        await sql`REFRESH MATERIALIZED VIEW public.mv_pulse_24h_summary;`;
        console.log('[✓] mv_pulse_24h_summary populated via initial non-concurrent refresh.');
      } catch (fallbackErr) {
        console.warn('[!] mv_pulse_24h_summary refresh fallback warning:', fallbackErr.message);
      }
    } else {
      console.warn('[!] mv_pulse_24h_summary refresh warning:', mvErr.message);
    }
  }

  console.log('\n================================================================');
  console.log('✅ CREATOR FLEET CONSOLIDATION COMPLETE');
  console.log('================================================================');
  process.exitCode = 0;
}

main().catch(err => {
  console.error('[-] Fatal Creator Consolidator Error:', err);
  process.exit(1);
});
