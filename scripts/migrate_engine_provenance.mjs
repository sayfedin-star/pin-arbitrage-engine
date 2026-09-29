#!/usr/bin/env node

/**
 * Migration Script: High-Performance Batch Reclassification in Neon Postgres
 */

import { neon } from '@neondatabase/serverless';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[-] CRITICAL: DATABASE_URL environment variable is missing.');
  process.exit(1);
}
const sql = neon(DATABASE_URL);

function quantizeHex(hex) {
  if (!hex || typeof hex !== 'string') return '#888888';
  const clean = hex.replace('#', '').toLowerCase();
  if (clean.length < 6) return '#888888';
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#888888';
  const step = 40;
  const qr = Math.min(255, Math.round(r / step) * step).toString(16).padStart(2, '0');
  const qg = Math.min(255, Math.round(g / step) * step).toString(16).padStart(2, '0');
  const qb = Math.min(255, Math.round(b / step) * step).toString(16).padStart(2, '0');
  return `#${qr}${qg}${qb}`;
}

function computeClusteredCentroids(candidates) {
  if (!candidates || candidates.length === 0) return [];
  const clusters = new Map();
  for (const c of candidates) {
    const raw = (c.dominant_color || '#888888').toLowerCase();
    const bucket = quantizeHex(raw);
    if (!clusters.has(bucket)) {
      clusters.set(bucket, { hex: raw, count: 0 });
    }
    clusters.get(bucket).count++;
  }

  return Array.from(clusters.values())
    .map(c => ({
      color: c.hex,
      count: c.count,
      percentage: Number(((c.count / candidates.length) * 100).toFixed(1))
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

async function runMigration() {
  console.log('[*] Starting Neon Database Engine Provenance & Centroids Fast Batch Migration...');

  // 1. Single instant set-based SQL UPDATE for all rows in candidate_graph_nodes
  console.log('[*] Executing calibrated SQL update on candidate_graph_nodes...');
  await sql`
    UPDATE candidate_graph_nodes
    SET 
      provenance_engine = CASE
        WHEN is_product = true THEN 'P2P_SHOPPING_CORPUS'
        WHEN age_days <= 22 AND saves < 800 THEN 'FRESH_COLD_START'
        WHEN saves >= 6500 OR daily_velocity >= 20.0 OR (save_rate >= 35.0 AND daily_velocity >= 10.0) THEN 'P2P_NAVBOOST'
        WHEN sequence_role IN ('DESSERT_HERO', 'BEVERAGE_PAIRING', 'PASTRY_BITES', 'SESSION_FINISHER') AND saves >= 350 THEN 'P2P_RECGPT'
        WHEN saves >= 1200 THEN 'P2P_RANDOMWALK'
        ELSE 'P2P_TWO_TOWER'
      END,
      recgpt_transition_score = CASE
        WHEN sequence_role = 'DESSERT_HERO' THEN ROUND(LEAST(99.9, 95.0 * CASE WHEN save_rate > 0 THEN (0.7 + 0.3 * LEAST(1.0, save_rate / 100.0)) ELSE (0.75 + 0.25 * LEAST(1.0, LOG(GREATEST(saves, 10)) / 5.0)) END)::numeric, 1)
        WHEN sequence_role = 'SESSION_FINISHER' THEN ROUND(LEAST(99.9, 94.0 * CASE WHEN save_rate > 0 THEN (0.7 + 0.3 * LEAST(1.0, save_rate / 100.0)) ELSE (0.75 + 0.25 * LEAST(1.0, LOG(GREATEST(saves, 10)) / 5.0)) END)::numeric, 1)
        WHEN sequence_role = 'BEVERAGE_PAIRING' THEN ROUND(LEAST(99.9, 91.0 * CASE WHEN save_rate > 0 THEN (0.7 + 0.3 * LEAST(1.0, save_rate / 100.0)) ELSE (0.75 + 0.25 * LEAST(1.0, LOG(GREATEST(saves, 10)) / 5.0)) END)::numeric, 1)
        WHEN sequence_role = 'PASTRY_BITES' THEN ROUND(LEAST(99.9, 88.0 * CASE WHEN save_rate > 0 THEN (0.7 + 0.3 * LEAST(1.0, save_rate / 100.0)) ELSE (0.75 + 0.25 * LEAST(1.0, LOG(GREATEST(saves, 10)) / 5.0)) END)::numeric, 1)
        WHEN sequence_role = 'DINNER_ANCHOR' THEN ROUND(LEAST(99.9, 90.0 * CASE WHEN save_rate > 0 THEN (0.7 + 0.3 * LEAST(1.0, save_rate / 100.0)) ELSE (0.75 + 0.25 * LEAST(1.0, LOG(GREATEST(saves, 10)) / 5.0)) END)::numeric, 1)
        WHEN sequence_role = 'NAVBOOST_CO_VISITOR' THEN ROUND(LEAST(99.9, 85.0 * CASE WHEN save_rate > 0 THEN (0.7 + 0.3 * LEAST(1.0, save_rate / 100.0)) ELSE (0.75 + 0.25 * LEAST(1.0, LOG(GREATEST(saves, 10)) / 5.0)) END)::numeric, 1)
        ELSE 0
      END,
      is_recgpt_candidate = (sequence_role IN ('DESSERT_HERO', 'SESSION_FINISHER', 'BEVERAGE_PAIRING', 'PASTRY_BITES'));
  `;
  console.log(`[+] Calibrated update completed successfully.`);

  // 2. Recompute and update cluster_arbitrage_metrics for all seeds
  const seeds = await sql`SELECT DISTINCT seed_pin_id FROM candidate_graph_nodes;`;
  console.log(`[+] Recomputing color centroids for ${seeds.length} tracked seeds...`);

  for (const s of seeds) {
    const seedPinId = s.seed_pin_id;
    const candidates = await sql`
      SELECT dominant_color 
      FROM candidate_graph_nodes 
      WHERE seed_pin_id = ${seedPinId};
    `;
    const clusteredCentroids = computeClusteredCentroids(candidates);

    await sql`
      UPDATE cluster_arbitrage_metrics
      SET winning_color_centroids = ${JSON.stringify(clusteredCentroids)}::jsonb
      WHERE seed_pin_id = ${seedPinId};
    `;
    console.log(`[+] Seed ${seedPinId}: Updated ${clusteredCentroids.length} clustered color centroids.`);
  }

  // 3. Print verified final distribution for active seed 1125829606880675896
  const activeSeedCounts = await sql`
    SELECT provenance_engine, count(*) 
    FROM candidate_graph_nodes 
    WHERE seed_pin_id = '1125829606880675896'
    GROUP BY provenance_engine 
    ORDER BY count DESC;
  `;
  console.log('\n[+] Verified Provenance Engine Distribution for Seed 1125829606880675896:');
  console.table(activeSeedCounts);

  // 4. Overall distribution across entire DB
  const totalCounts = await sql`
    SELECT provenance_engine, count(*) 
    FROM candidate_graph_nodes 
    GROUP BY provenance_engine 
    ORDER BY count DESC;
  `;
  console.log('\n[+] Overall Provenance Engine Distribution Across Entire Database:');
  console.table(totalCounts);

  // 5. Sample centroids from cluster_arbitrage_metrics
  const sampleMetrics = await sql`
    SELECT seed_pin_id, winning_color_centroids 
    FROM cluster_arbitrage_metrics 
    WHERE seed_pin_id = '1125829606880675896'
    LIMIT 1;
  `;
  console.log('\n[+] Clustered Color Centroids in Neon for Seed 1125829606880675896:');
  console.table(sampleMetrics[0]?.winning_color_centroids);
}

runMigration()
  .then(() => {
    console.log('[+] Migration completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[-] Migration failed:', err);
    process.exit(1);
  });
