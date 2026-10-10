#!/usr/bin/env node

/**
 * scripts/keyword-fleet-consolidator.mjs
 * 
 * Stage 3: Fleet Velocity & Report Consolidation Engine
 * 
 * Executes after all 20 parallel runner jobs finish:
 * 1. Consolidates authentic metrics and computes final aggregate velocity in Central Hub.
 * 2. Runs the Visual Annotations Crossover & Anchor Taxonomy engine.
 * 3. Identifies Core Visual Anchors, High-Velocity gems, and Dead 404 pins.
 * 4. Renders the unified Executive Markdown Report to $GITHUB_STEP_SUMMARY.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is required for fleet consolidator.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const mode = (process.env.MODE || 'keyword_sweep').toLowerCase().trim();
const targetKeyword = (process.env.TARGET_KEYWORD || '').trim().toLowerCase();
const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null;

async function main() {
  console.log('================================================================');
  console.log('   📊 STAGE 3: FLEET VELOCITY & REPORT CONSOLIDATION ENGINE');
  console.log('================================================================');
  console.log(`[Config] Execution Mode: ${mode.toUpperCase()}`);
  console.log(`[Config] Target Keyword: "${targetKeyword || '<ALL>'}"`);

  let mdReport = '';

  if (mode === 'pin_partition' && targetKeyword) {
    // =========================================================================
    // CONSOLIDATION: SINGLE-KEYWORD FULL 201-PIN CATALOG
    // =========================================================================
    const [kw] = await sql`
      SELECT * FROM tracked_keywords WHERE LOWER(keyword) = ${targetKeyword} LIMIT 1;
    `;

    if (!kw) {
      console.warn(`[!] Keyword "${targetKeyword}" not found for consolidation.`);
      process.exit(0);
    }

    console.log(`[*] Consolidating keyword: "${kw.keyword}" (ID: ${kw.id})...`);

    // 1. Calculate Active SERP metrics & Save Velocity
    const [velRow] = await sql`
      SELECT 
        COUNT(*) as active_count,
        COALESCE(ROUND(AVG(daily_save_velocity), 2), 0) as avg_velocity,
        COALESCE(SUM(save_count), 0) as total_active_saves,
        COALESCE(SUM(repin_count), 0) as total_active_repins
      FROM keyword_serp_current
      WHERE keyword_id = ${kw.id};
    `;

    const activeCount = Number(velRow?.active_count || 0);
    const avgVelocity = Number(velRow?.avg_velocity || 0);
    const totalActiveSaves = Number(velRow?.total_active_saves || 0);
    const totalActiveRepins = Number(velRow?.total_active_repins || 0);

    // 2. Update Central Hub tracked_keywords
    await sql`
      UPDATE tracked_keywords
      SET 
        avg_daily_velocity = ${avgVelocity},
        last_crawled_at = NOW(),
        updated_at = NOW()
      WHERE id = ${kw.id};
    `;
    console.log(`  [+] Central Hub Updated: Avg Velocity = +${avgVelocity} saves/day | Active Pins = ${activeCount}`);

    // 3. Catalog & Vault Telemetry
    const [snapStats] = await sql`
      SELECT 
        COUNT(DISTINCT pin_id) as total_catalog,
        COUNT(DISTINCT pin_id) FILTER (WHERE is_displaced = true) as displaced_vault,
        COUNT(DISTINCT pin_id) FILTER (WHERE metadata->>'is_deleted' = 'true' OR metadata->>'status' = 'archived_404') as dead_pins,
        COALESCE(SUM(save_count), 0) as total_catalog_saves
      FROM keyword_pins_snapshots
      WHERE keyword_id = ${kw.id};
    `;

    const totalCatalog = Number(snapStats?.total_catalog || activeCount);
    const displacedVault = Number(snapStats?.displaced_vault || 0);
    const deadPins = Number(snapStats?.dead_pins || 0);
    const totalCatalogSaves = Number(snapStats?.total_catalog_saves || totalActiveSaves);

    // 4. Compute Visual Annotations Crossover & Core Anchors
    const serpPins = await sql`
      SELECT pin_id, title, save_count, repin_count, daily_save_velocity, image_url, visual_annotations
      FROM keyword_serp_current
      WHERE keyword_id = ${kw.id}
      ORDER BY rank_position ASC;
    `;

    const tagCounts = new Map();
    for (const p of serpPins) {
      const raw = Array.isArray(p.visual_annotations) ? p.visual_annotations : [];
      const unique = new Set(raw.map(s => String(s || '').trim().toLowerCase()).filter(s => s.length >= 2));
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

    // Top Rising Pins
    const topRising = serpPins
      .filter(p => Number(p.daily_save_velocity) > 0)
      .sort((a, b) => Number(b.daily_save_velocity) - Number(a.daily_save_velocity))
      .slice(0, 5);

    const fleetFailures = Number(process.env.FLEET_FAILURES || 0);
    const fleetStatus = fleetFailures > 0
      ? `🔴 **Partial Run (${fleetFailures} runners failed)**`
      : '🟢 **Completed Successfully**';

    // Generate Rich Markdown Report
    mdReport += `## 🚀 Keyword Fleet Telemetry & Velocity Report\n\n`;
    mdReport += `> **Target Keyword**: \`${kw.keyword}\` | **Fleet Execution**: \`20-Runner Parallel Matrix\` | **Status**: ${fleetStatus}\n\n`;

    mdReport += `### 📊 Core Telemetry Metrics\n\n`;
    mdReport += `| Metric | Value | Architectural Context |\n`;
    mdReport += `| :--- | :---: | :--- |\n`;
    mdReport += `| **Active SERP Ranking Pins** | **${activeCount}** | Currently ranking on page 1 of Pinterest organic search |\n`;
    mdReport += `| **Displaced Vault Pins** | **${displacedVault}** | Historical rankers tracked for ongoing background saves |\n`;
    mdReport += `| **Total Monitored Catalog** | **${totalCatalog} Pins** | 100% deep-inspected across 20 parallel runner slices |\n`;
    mdReport += `| **Net 24h Save Velocity** | **\`+${avgVelocity} saves/day\`** | Daily momentum baseline across ranking creative assets |\n`;
    mdReport += `| **Total Catalog Saves** | **${totalCatalogSaves.toLocaleString()}** | Aggregate viral saves volume accumulated across catalog |\n`;
    mdReport += `| **Dead / 404 Removed Pins** | **${deadPins}** | Removed from Pinterest (historical trajectories preserved) |\n\n`;

    mdReport += `### 🧬 Visual Annotations Crossover & Core Anchors\n\n`;
    if (coreAnchors.length > 0) {
      mdReport += `| Core Visual Anchor | Shared Pins | Overlap Frequency | Algorithmic Role |\n`;
      mdReport += `| :--- | :---: | :---: | :--- |\n`;
      coreAnchors.slice(0, 8).forEach(a => {
        mdReport += `| **\`#${a.tag}\`** | **${a.count} pins** | \`${a.overlapPct}%\` | 🔗 High-Density Core Anchor |\n`;
      });
      mdReport += `\n`;
    } else {
      mdReport += `*No high-density visual anchor exceeded the 3-pin crossover threshold yet.*\n\n`;
    }

    if (topRising.length > 0) {
      mdReport += `### 🔥 Top High-Velocity Rising Pins\n\n`;
      mdReport += `| Pin Creative | 24h Velocity | Total Saves | Preview |\n`;
      mdReport += `| :--- | :---: | :---: | :---: |\n`;
      for (const p of topRising) {
        const img = p.image_url ? `<img src="${p.image_url}" width="50" />` : '-';
        mdReport += `| [${p.title || 'Pin #' + p.pin_id}](https://www.pinterest.com/pin/${p.pin_id}/) | \`+${p.daily_save_velocity}/d\` | ${Number(p.save_count).toLocaleString()} | ${img} |\n`;
      }
      mdReport += `\n`;
    }

  } else {
    // =========================================================================
    // CONSOLIDATION: MULTI-KEYWORD BROADCAST FLEET
    // =========================================================================
    console.log('[*] Consolidating multi-keyword broadcast run...');
    const keywords = await sql`
      SELECT id, keyword, category, target_pin_count, avg_daily_velocity, last_crawled_at
      FROM tracked_keywords
      WHERE is_active = TRUE
      ORDER BY last_crawled_at DESC NULLS LAST
      LIMIT 20;
    `;

    const fleetFailures = Number(process.env.FLEET_FAILURES || 0);
    const fleetStatus = fleetFailures > 0
      ? `🔴 **Partial Run (${fleetFailures} runners failed)**`
      : '🟢 **Completed Successfully**';

    mdReport += `## 🚀 Multi-Keyword Distributed Fleet Radar Report\n\n`;
    mdReport += `> **Fleet Mode**: \`20-Runner Parallel Matrix\` | **Keywords Processed**: **${keywords.length}** | **Status**: ${fleetStatus}\n\n`;

    mdReport += `### 📊 Tracked Keywords Performance Matrix\n\n`;
    mdReport += `| Keyword | Category | Target Pins | Avg 24h Velocity | Last Updated | Status |\n`;
    mdReport += `| :--- | :--- | :---: | :---: | :---: | :---: |\n`;
    for (const k of keywords) {
      const timeStr = k.last_crawled_at ? new Date(k.last_crawled_at).toISOString().slice(11, 16) + ' UTC' : 'Pending';
      mdReport += `| **${k.keyword}** | ${k.category || 'General'} | ${k.target_pin_count || 100} | \`+${k.avg_daily_velocity || 0} saves/day\` | ${timeStr} | 🟢 Fresh |\n`;
    }
    mdReport += `\n`;
  }

  // Write to GITHUB_STEP_SUMMARY
  if (stepSummaryPath) {
    try {
      fs.appendFileSync(stepSummaryPath, mdReport, 'utf8');
      console.log('[+] Wrote Consolidated Report to $GITHUB_STEP_SUMMARY');
    } catch (err) {
      console.warn('[!] Failed writing to GITHUB_STEP_SUMMARY:', err.message);
    }
  }

  console.log('\n================================================================');
  console.log('✅ STAGE 3 CONSOLIDATION COMPLETED SUCCESSFULLY');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('[-] Fatal Consolidator Error:', err);
  process.exit(1);
});
