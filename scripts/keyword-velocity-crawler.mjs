#!/usr/bin/env node

/**
 * Keyword Intelligence & Velocity Autonomous SERP Runner
 * Executes daily/on-demand crawls across tracked keywords in Neon Postgres,
 * calculates save velocities, stores ranked guides, and writes a rich
 * Markdown summary to $GITHUB_STEP_SUMMARY.
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import { crawlKeywordSERP, listKeywords } from '../src/modules/keywords/service.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const targetKeyword = (process.env.TARGET_KEYWORD || '').trim().toLowerCase();
const cookie = process.env.PINTEREST_COOKIE || null;
const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null;

async function run() {
  console.log('===============================================================');
  console.log('🚀 KEYWORD INTELLIGENCE & VELOCITY SERP RADAR PIPELINE');
  console.log('===============================================================');

  let keywordsToProcess = [];
  if (targetKeyword) {
    console.log(`[*] Target keyword mode: "${targetKeyword}"`);
    keywordsToProcess = await sql`
      SELECT * FROM tracked_keywords 
      WHERE LOWER(keyword) = ${targetKeyword} AND is_active = TRUE;
    `;
    if (keywordsToProcess.length === 0) {
      console.log(`[!] Keyword "${targetKeyword}" not found in database. Auto-registering...`);
      const [newRow] = await sql`
        INSERT INTO tracked_keywords (keyword, category, target_pin_count, is_active)
        VALUES (${targetKeyword}, 'General', 100, TRUE)
        RETURNING *;
      `;
      keywordsToProcess = [newRow];
    }
  } else {
    console.log('[*] Sweeping all active tracked keywords from Neon...');
    keywordsToProcess = await sql`
      SELECT * FROM tracked_keywords 
      WHERE is_active = TRUE
      ORDER BY last_crawled_at ASC NULLS FIRST
      LIMIT 100;
    `;
  }

  console.log(`[*] Found ${keywordsToProcess.length} keywords to crawl.`);
  if (keywordsToProcess.length === 0) {
    console.log('[!] No active keywords to crawl. Exiting.');
    return;
  }

  const results = [];
  let totalPinsCrawled = 0;
  let totalGuidesDiscovered = 0;

  for (let i = 0; i < keywordsToProcess.length; i++) {
    const kw = keywordsToProcess[i];
    console.log(`\n[${i + 1}/${keywordsToProcess.length}] Crawling SERP for keyword: "${kw.keyword}" (ID: ${kw.id})...`);
    
    // Non-blocking Postgres Advisory Lock to coordinate concurrent runners without Redis
    const lockKey = `kw_serp_${kw.id}`;
    let lockAcquired = true;
    try {
      const [lRes] = await sql`SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS acquired;`;
      lockAcquired = Boolean(lRes?.acquired);
    } catch (_) {}

    if (!lockAcquired) {
      console.log(`  [AdvisoryLock] Keyword "${kw.keyword}" (ID: ${kw.id}) is actively locked by a peer crawler. Non-blocking skip ✅`);
      results.push({ id: kw.id, keyword: kw.keyword, status: 'skipped', error: 'locked_by_peer' });
      continue;
    }

    try {
      const crawlRes = await crawlKeywordSERP(sql, kw.id, cookie);
      if (crawlRes.success) {
        totalPinsCrawled += (crawlRes.crawled_pins || 0);
        totalGuidesDiscovered += (crawlRes.guides_count || 0);
        results.push({
          id: kw.id,
          keyword: kw.keyword,
          category: kw.category,
          crawled_pins: crawlRes.crawled_pins,
          avg_velocity: crawlRes.avg_velocity,
          guides_count: crawlRes.guides_count,
          top_pin: crawlRes.top_pin,
          summary: crawlRes.summary,
          status: 'success'
        });
        console.log(`  [+] Success: Crawled ${crawlRes.crawled_pins} pins | Guides: ${crawlRes.guides_count} | Velocity: +${crawlRes.avg_velocity} saves/day`);
      } else {
        console.warn(`  [!] Crawl warning:`, crawlRes.message || 'Unknown issue');
        results.push({ id: kw.id, keyword: kw.keyword, status: 'skipped', error: crawlRes.message });
      }
    } catch (err) {
      console.error(`  [-] Error crawling "${kw.keyword}":`, err.message);
      results.push({ id: kw.id, keyword: kw.keyword, status: 'error', error: err.message });
    } finally {
      await sql`SELECT pg_advisory_unlock(hashtext(${lockKey}));`.catch(() => {});
    }

    // Jitter delay between requests to preserve Pinterest rate limits cleanly
    if (i < keywordsToProcess.length - 1) {
      const delay = 2500 + Math.floor(Math.random() * 1500);
      console.log(`  [~] Backoff jitter: ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.log('\n===============================================================');
  console.log(`✅ PIPELINE FINISHED: Processed ${results.length} keywords.`);
  console.log(`📦 Total Pins Updated: ${totalPinsCrawled} | Guides: ${totalGuidesDiscovered}`);
  console.log('===============================================================');

  // Render GitHub Step Summary if available
  if (stepSummaryPath) {
    try {
      let md = `## 🔍 Keyword Intelligence & Velocity SERP Radar Report\n\n`;
      md += `> **Execution Summary**: Processed **${results.length}** keywords | **${totalPinsCrawled}** pins indexed | **${totalGuidesDiscovered}** semantic modifiers discovered.\n\n`;
      
      md += `### 📊 Tracked Keywords Performance\n\n`;
      md += `| Keyword | Category | Tracked Pins | Avg Velocity | Modifiers | Status |\n`;
      md += `| :--- | :--- | :---: | :---: | :---: | :---: |\n`;
      for (const r of results) {
        if (r.status === 'success') {
          md += `| **${r.keyword}** | ${r.category || 'General'} | ${r.crawled_pins} | \`+${r.avg_velocity} saves/day\` | ${r.guides_count} | 🟢 Success |\n`;
        } else {
          md += `| **${r.keyword}** | - | - | - | - | 🔴 ${r.error || 'Failed'} |\n`;
        }
      }

      md += `\n### 🚀 High-Velocity Rising Pins\n\n`;
      const successful = results.filter(r => r.status === 'success' && r.top_pin);
      if (successful.length > 0) {
        md += `| Keyword | Top Ranked Pin | Image Preview |\n`;
        md += `| :--- | :--- | :---: |\n`;
        for (const s of successful.slice(0, 5)) {
          const img = s.top_pin?.imageUrl ? `<img src="${s.top_pin.imageUrl}" width="60" />` : '-';
          md += `| **${s.keyword}** | [${s.top_pin.title || 'View Pin'}](https://www.pinterest.com/pin/${s.top_pin.pinId}/) | ${img} |\n`;
        }
      }

      fs.appendFileSync(stepSummaryPath, md, 'utf8');
      console.log('[+] Wrote Markdown summary to $GITHUB_STEP_SUMMARY');
    } catch (summaryErr) {
      console.warn('[!] Failed to write GITHUB_STEP_SUMMARY:', summaryErr.message);
    }
  }
}

run().catch(err => {
  console.error('[-] Fatal pipeline error:', err);
  process.exit(1);
});
