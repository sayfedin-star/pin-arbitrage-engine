import { neon } from '@neondatabase/serverless';
import { fetchUniversalPinDossier, preloadNeonRegistry } from '../src/modules/sharding/fleet-router.mjs';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('--- Benchmarking Dossier Latency ---');
  await preloadNeonRegistry(sql);

  const { listKeywords } = await import('../src/modules/keywords/service.mjs');
  const tKw0 = Date.now();
  const kwList = await listKeywords(sql, { limit: 50 });
  console.log(`listKeywords (50 items): ${Date.now() - tKw0} ms | Count: ${kwList.length}`);

  const explainPlan = await sql`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT 
      k.*,
      COALESCE(s_count.cnt, 0)::int AS snapshots_count
    FROM tracked_keywords k
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        NULLIF((SELECT COUNT(*)::int FROM keyword_serp_current WHERE keyword_id = k.id AND is_displaced = FALSE AND rank_position >= 1), 0),
        (
          SELECT COUNT(*)::int 
          FROM keyword_pins_snapshots 
          WHERE keyword_id = k.id 
            AND is_displaced IS NOT TRUE 
            AND snapshot_date = (
              SELECT MAX(snapshot_date) 
              FROM keyword_pins_snapshots 
              WHERE keyword_id = k.id 
                AND is_displaced IS NOT TRUE
            )
        ),
        0
      )::int AS cnt
    ) s_count ON true
    ORDER BY k.created_at DESC
    LIMIT 50;
  `;
  console.log('--- listKeywords Query Plan ---');
  console.log(explainPlan.map(r => Object.values(r)[0]).join('\n'));

  const [p1] = await sql`SELECT pin_id FROM keyword_serp_current LIMIT 1;`;
  const pinId = p1?.pin_id || '1618549865590506';
  console.log('Testing with pinId:', pinId);

  const t0 = Date.now();
  const d1 = await fetchUniversalPinDossier({ hubSql: sql, pinId });
  const time1 = Date.now() - t0;
  console.log(`First fetch (cold): ${time1} ms | Shard: #${d1.shard_id} | Success: ${d1.success}`);

  const t1 = Date.now();
  const d2 = await fetchUniversalPinDossier({ hubSql: sql, pinId });
  const time2 = Date.now() - t1;
  console.log(`Second fetch (warm): ${time2} ms | Shard: #${d2.shard_id} | Success: ${d2.success}`);
}

run().catch(console.error);
