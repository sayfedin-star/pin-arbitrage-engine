#!/usr/bin/env node

/**
 * scripts/remediate_creation_methods.mjs
 *
 * Forensic & Idempotent Remediation Script: Pin creation_method Fleet Repair.
 * Inspects pins currently degraded to 'pinterest_platform' (or null/empty)
 * and deep-enriches them via live Pinterest Guest Scraping (_auth=0).
 *
 * Synchronously repairs:
 * 1. Central Hub: keyword_serp_current.creation_method and metadata
 * 2. Designated Storage Shard: universal_master_pins.metadata (crc32(pin_id) % 99 + 1)
 *
 * CLI Usage:
 *   node scripts/remediate_creation_methods.mjs --pin_id 330803535154760775,693132198915648745,155233518398209329
 *   node scripts/remediate_creation_methods.mjs --keyword_id 119 --limit 20
 *   node scripts/remediate_creation_methods.mjs --limit 50 --dry-run
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPinFromPinterest } from './lib/pinterest.mjs';
import { resolveShardConnection, preloadNeonRegistry, getPinShardId } from '../src/modules/sharding/fleet-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env safely
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const envPath = path.resolve(process.cwd(), '.env');
if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

// Parse CLI Arguments
const args = process.argv.slice(2);
let argLimit = 50;
let argPinIds = [];
let argKeywordId = null;
let isDryRun = false;
let isForce = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--limit' && args[i + 1]) {
    argLimit = parseInt(args[++i], 10) || 50;
  } else if (a === '--pin_id' && args[i + 1]) {
    argPinIds = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  } else if (a === '--keyword_id' && args[i + 1]) {
    argKeywordId = parseInt(args[++i], 10);
  } else if (a === '--dry-run') {
    isDryRun = true;
  } else if (a === '--force') {
    isForce = true;
  }
}

const hubSql = neon(DATABASE_URL);

/**
 * Concurrency Limiter Semaphore
 */
async function mapConcurrent(items, limit, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('================================================================');
  console.log('🔧 PAE FLEET REMEDIATION: Pin creation_method Ingestion Repair');
  console.log(`Modes: dry-run=${isDryRun}, force=${isForce}, limit=${argLimit}`);
  if (argPinIds.length > 0) console.log(`Target Pins: ${argPinIds.join(', ')}`);
  if (argKeywordId) console.log(`Target Keyword: ${argKeywordId}`);
  console.log('================================================================\n');

  await preloadNeonRegistry(hubSql);

  // 1. Discover Target Pins to Remediate
  let candidatePins = [];
  if (argPinIds.length > 0) {
    const pinList = argPinIds.map(String);
    const rows = await hubSql`
      SELECT DISTINCT pin_id, creation_method, title
      FROM keyword_serp_current
      WHERE pin_id = ANY(${pinList}::text[]);
    `;
    const foundPinMap = new Map();
    for (const r of rows) foundPinMap.set(String(r.pin_id), r);

    for (const pid of pinList) {
      if (foundPinMap.has(pid)) {
        candidatePins.push(foundPinMap.get(pid));
      } else {
        candidatePins.push({ pin_id: pid, creation_method: null, title: 'External Target Pin' });
      }
    }
  } else if (argKeywordId) {
    const filterSql = isForce
      ? hubSql`SELECT DISTINCT pin_id, creation_method, title FROM keyword_serp_current WHERE keyword_id = ${argKeywordId} LIMIT ${argLimit}`
      : hubSql`SELECT DISTINCT pin_id, creation_method, title FROM keyword_serp_current WHERE keyword_id = ${argKeywordId} AND (creation_method IS NULL OR creation_method = '' OR creation_method = 'pinterest_platform') LIMIT ${argLimit}`;
    candidatePins = await filterSql;
  } else {
    const filterSql = isForce
      ? hubSql`SELECT DISTINCT pin_id, creation_method, title FROM keyword_serp_current LIMIT ${argLimit}`
      : hubSql`SELECT DISTINCT pin_id, creation_method, title FROM keyword_serp_current WHERE creation_method IS NULL OR creation_method = '' OR creation_method = 'pinterest_platform' LIMIT ${argLimit}`;
    candidatePins = await filterSql;
  }

  if (candidatePins.length === 0) {
    console.log('[+] Zero degraded pins matching criteria. Everything is healthy!');
    return;
  }

  console.log(`[*] Discovered ${candidatePins.length} pins to inspect & remediate.\n`);

  const CONCURRENCY = 4;
  const shardClients = new Map();
  async function getShardSql(shardId) {
    if (!shardClients.has(shardId)) {
      const client = await resolveShardConnection({ hubSql, shardId });
      shardClients.set(shardId, client);
    }
    return shardClients.get(shardId);
  }

  let repairedCount = 0;
  let genericCount = 0;
  let errorCount = 0;

  await mapConcurrent(candidatePins, CONCURRENCY, async (p) => {
    const pinId = String(p.pin_id);
    const prevMethod = p.creation_method || 'null';
    const targetShardId = getPinShardId(pinId, 99);

    // Jitter delay between 1000ms and 2500ms to stay resilient against rate-limiting
    const jitter = Math.floor(Math.random() * 1500) + 1000;
    await sleep(jitter);

    try {
      const fetchRes = await fetchPinFromPinterest(pinId);
      if (!fetchRes.ok || !fetchRes.pin) {
        console.warn(`[-] Pin ${pinId}: Scraping failed (${fetchRes.error || 'no_data'})`);
        errorCount++;
        return;
      }

      const scrapedPin = fetchRes.pin;
      const isCarousel = Boolean(
        scrapedPin.is_carousel ||
        scrapedPin.isCarousel ||
        scrapedPin.method === 'carousel' ||
        scrapedPin.creation_method === 'carousel'
      );
      const candidateMethods = [
        isCarousel ? 'carousel' : null,
        scrapedPin.method,
        scrapedPin.creation_method
      ].filter(m => m && typeof m === 'string' && m.trim().length > 0);
      const authenticMethod = candidateMethods.find(m => m.trim().toLowerCase() !== 'pinterest_platform') || candidateMethods[0] || 'pinterest_platform';

      if (!isForce && authenticMethod === 'pinterest_platform' && prevMethod !== 'null' && prevMethod !== 'pinterest_platform' && prevMethod !== '') {
        console.warn(`[~] Pin ${pinId}: Scrape yielded generic 'pinterest_platform' but existing authentic method is '${prevMethod}'. Preserving.`);
        return;
      }

      if (!isDryRun) {
        const metaPatch = JSON.stringify({ creation_method: authenticMethod, method: authenticMethod });

        // 1. Update Central Hub keyword_serp_current
        await hubSql`
          UPDATE keyword_serp_current
          SET creation_method = ${authenticMethod},
              metadata = (CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END) || ${metaPatch}::jsonb,
              updated_at = NOW()
          WHERE pin_id = ${pinId};
        `;

        // 2. Update Storage Shard universal_master_pins
        const shardSql = await getShardSql(targetShardId);
        await shardSql`
          UPDATE universal_master_pins
          SET metadata = (CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END) || ${metaPatch}::jsonb,
              updated_at = NOW()
          WHERE pin_id = ${pinId};
        `;
      }

      if (authenticMethod !== 'pinterest_platform') {
        repairedCount++;
        console.log(`[+] [Shard ${String(targetShardId).padStart(2, '0')}] Pin ${pinId}: ${prevMethod} -> ${authenticMethod} ${isDryRun ? '(DRY-RUN)' : '✓ REPAIRED'}`);
      } else {
        genericCount++;
        console.log(`[*] [Shard ${String(targetShardId).padStart(2, '0')}] Pin ${pinId}: Confirmed generic '${authenticMethod}'`);
      }
    } catch (err) {
      errorCount++;
      console.error(`[!] Pin ${pinId} remediation exception: ${err.message}`);
    }
  });

  console.log('\n================================================================');
  console.log('🏁 REMEDIATION SUMMARY:');
  console.log(`  • Repaired Authentic Methods: ${repairedCount}`);
  console.log(`  • Generic/Platform Confirmed: ${genericCount}`);
  console.log(`  • Errors / Unreachable:       ${errorCount}`);
  console.log(`  • Total Processed:            ${candidatePins.length}`);
  console.log('================================================================');
}

run().catch((err) => {
  console.error('[-] Fatal error running remediation script:', err);
  process.exit(1);
});
