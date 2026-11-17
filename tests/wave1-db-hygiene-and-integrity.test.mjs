import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  syncPinAcrossAllFourPillars,
  resavePinsMetricsBatch,
  ingestPinsBatch
} from '../src/modules/pins/repository.mjs';
import {
  deletePinSnapshotByTarget,
  reconcilePinMetricsAfterSnapshotDelete
} from '../src/routes/pins.mjs';
import {
  fetchBoardSectionsResource,
  fetchCreatorLatestPinsPidgets
} from '../src/core/pinterest/creators.mjs';
import { crawlKeywordSERP } from '../src/modules/keywords/service.mjs';
import { CANONICAL_SPECIAL_VERSIONS } from '../scripts/migrate.mjs';

function createTxSpySql(responder = null) {
  const queries = [];
  let txCount = 0;
  let rollbacks = 0;
  let aborted = false;

  const execSql = (isTx = false) => {
    const fn = async (strings, ...values) => {
      if (isTx && aborted) {
        const err = new Error('current transaction is aborted, commands ignored until end of transaction block');
        err.code = '25P02';
        throw err;
      }
      const sqlText = strings.join('?').replace(/\s+/g, ' ').trim();
      queries.push({ sql: sqlText, values, inTx: isTx });
      if (typeof responder === 'function') {
        try {
          return await responder(sqlText, values, isTx);
        } catch (err) {
          if (isTx) aborted = true;
          throw err;
        }
      }
      return [];
    };
    return fn;
  };

  const rootSql = execSql(false);
  rootSql.begin = async (callback) => {
    txCount++;
    aborted = false;
    const tx = execSql(true);
    try {
      return await callback(tx);
    } catch (err) {
      rollbacks++;
      throw err;
    }
  };
  rootSql.transaction = async (queriesOrFn) => {
    return await rootSql.begin(async (tx) => {
      if (typeof queriesOrFn === 'function') return await queriesOrFn(tx);
      const out = [];
      for (const item of queriesOrFn) {
        out.push(typeof item === 'function' ? await item(tx) : await item);
      }
      return out;
    });
  };
  rootSql.getStats = () => ({ queries, txCount, rollbacks });
  return rootSql;
}

test('Wave 1.1: ensure_indexes.mjs removes trigger DDL and Migration 066 is registered without CONCURRENTLY', () => {
  const ensureContent = fs.readFileSync(path.resolve(process.cwd(), 'scripts/ensure_indexes.mjs'), 'utf8');
  assert.doesNotMatch(ensureContent, /CREATE OR REPLACE FUNCTION\s+public\.pae_sync_clean_domain/i);
  assert.doesNotMatch(ensureContent, /CREATE OR REPLACE FUNCTION\s+public\.pae_sync_canonical_keyword/i);
  assert.doesNotMatch(ensureContent, /CREATE TRIGGER\s+trg_ump_sync_clean_domain/i);

  const mig066 = fs.readFileSync(
    path.resolve(process.cwd(), 'scripts/migrations/066_db_hygiene_and_pulse_indexes.sql'),
    'utf8'
  );
  const mig066NoComments = mig066.replace(/--.*$/gm, '');
  assert.doesNotMatch(mig066NoComments, /\bCONCURRENTLY\b/i, 'Migration 066 must not use CONCURRENTLY inside transaction block');
  assert.match(mig066, /CREATE OR REPLACE FUNCTION public\.pae_sync_clean_domain\(\)/i);
  assert.match(mig066, /\^www\\\./);
  assert.match(mig066, /\(\?:www\\\.\)\?/);
  assert.match(mig066, /CREATE INDEX IF NOT EXISTS idx_competitor_history_recorded_date_comp/i);
  assert.match(mig066, /INCLUDE\s*\(\s*monthly_reach\s*,\s*profile_views\s*\)/i);
  assert.match(mig066, /CREATE INDEX IF NOT EXISTS idx_ump_dest_url_pattern/i);
  assert.match(mig066, /text_pattern_ops/i);
  assert.match(mig066, /SET save_count = NULL,\s*is_hydrated = FALSE/is);

  assert.ok(CANONICAL_SPECIAL_VERSIONS['066_db_hygiene_and_pulse_indexes.sql']);
  assert.equal(CANONICAL_SPECIAL_VERSIONS['066_db_hygiene_and_pulse_indexes.sql'].version, '066');
});

test('Wave 1.2: repository.mjs escapes ^www\\. in SQL and maps string annotations without null', async () => {
  const queries = [];
  const spySql = async (strings, ...values) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    queries.push({ sql: text, values });
    if (text.includes('SELECT COUNT(*)')) return [{ total: 0 }];
    if (text.includes('FROM universal_master_pins') && text.includes('LIMIT 1')) {
      return [{ pin_id: '123456789012', metadata: {}, visual_annotations: ['Clean Eats', 'Meal Prep'] }];
    }
    return [];
  };

  await resavePinsMetricsBatch(spySql, [{ pin_id: '123456789012', domain: 'www.example.com', save_count: 10, has_explicit_saves: true }]);
  await ingestPinsBatch(spySql, [{ pin_id: '123456789012', domain: 'www.example.com', save_count: 10, has_explicit_saves: true }]);

  const resaveSql = queries.find((q) => q.sql.includes('upd_master AS'))?.sql || '';
  const ingestSql = queries.find((q) => q.sql.includes('upsert_pins AS'))?.sql || '';
  assert.ok(resaveSql.includes("'^www\\.'"), 'resavePinsMetricsBatch SQL must send escaped ^www\\. to PostgreSQL');
  assert.ok(ingestSql.includes("'^www\\.'"), 'ingestPinsBatch SQL must send escaped ^www\\. to PostgreSQL');

  queries.length = 0;
  await syncPinAcrossAllFourPillars({
    sql: spySql,
    pinId: '123456789012',
    scrapedPin: {
      title: 'Protein Bowl',
      annotations: ['High Protein', 'Meal Prep', { name: 'Dinner Ideas' }],
      save_count: 55,
      has_explicit_saves: true,
      repin_count: 12,
      has_explicit_repins: true
    }
  });

  const insertMaster = queries.find((q) => q.sql.includes('INSERT INTO universal_master_pins'));
  assert.ok(insertMaster, 'syncPinAcrossAllFourPillars must insert into universal_master_pins');
  const payloadRow = JSON.parse(insertMaster.values[0])[0];
  assert.deepEqual(payloadRow.visual_annotations, ['High Protein', 'Meal Prep', 'Dinner Ideas']);
});

test('Wave 1.3: pins.mjs aborts transaction cleanly without 25P02, preserves null on intraday promotion, and prevents hydration/bot spikes', async () => {
  // A) Error inside tx propagates cleanly so sql.begin rolls back without 25P02
  const failingSql = createTxSpySql((sqlText) => {
    if (sqlText.includes('INSERT INTO universal_master_pins')) {
      throw new Error('simulated tombstone write error');
    }
    return [];
  });

  await assert.rejects(
    () => deletePinSnapshotByTarget({
      sql: failingSql,
      pinId: '123456789012',
      rawTarget: '2026-04-10',
      throwOnError: true
    }),
    /simulated tombstone write error/
  );
  const stats = failingSql.getStats();
  assert.equal(stats.rollbacks, 1, 'Failed query inside tx must roll back immediately');
  assert.equal(
    stats.queries.some((q) => q.sql.includes('SELECT recorded_date, save_count')),
    false,
    'Must not issue follow-up tx queries after error (prevents 25P02)'
  );

  // B) Intraday promotion preserves null instead of coercing null -> 0
  const promoSql = createTxSpySql((sqlText) => {
    if (sqlText.includes('SELECT metadata FROM universal_master_pins')) {
      return [{
        metadata: {
          intraday_snapshots: [{
            id: 'intra_1',
            snapshot_date: '2026-04-10',
            recorded_at: '2026-04-10T10:00:00.000Z',
            save_count: null,
            repin_count: null,
            comment_count: null,
            share_count: null
          }]
        }
      }];
    }
    return [];
  });

  await deletePinSnapshotByTarget({
    sql: promoSql,
    pinId: '123456789012',
    rawTarget: '2026-04-10',
    throwOnError: true
  });
  const promoUpdate = promoSql.getStats().queries.find((q) => q.sql.includes('UPDATE pins_daily_metrics SET save_count ='));
  assert.ok(promoUpdate, 'Intraday promotion query must execute');
  assert.equal(promoUpdate.values[0], null, 'Promoted save_count must stay null when unhydrated');
  assert.equal(promoUpdate.values[1], null, 'Promoted repin_count must stay null when unhydrated');
  assert.equal(promoUpdate.values[2], null, 'Promoted comment_count must stay null when unhydrated');
  assert.equal(promoUpdate.values[3], null, 'Promoted share_count must stay null when unhydrated');

  // C) reconcilePinMetricsAfterSnapshotDelete rejects hydration jumps and caps at 25000
  const spikeSql = createTxSpySql((sqlText) => {
    if (sqlText.includes('FROM pins_daily_metrics')) {
      return [
        { recorded_date: '2026-04-01', save_count: 0, repin_count: 0, comment_count: 0, share_count: 0 },
        { recorded_date: '2026-04-02', save_count: 50000, repin_count: 2000, comment_count: 0, share_count: 0 },
        { recorded_date: '2026-04-03', save_count: 90000, repin_count: 3000, comment_count: 0, share_count: 0 }
      ];
    }
    return [];
  });
  await reconcilePinMetricsAfterSnapshotDelete({ sql: spikeSql, pinId: '123456789012' });
  const umpUpdate = spikeSql.getStats().queries.find((q) => q.sql.includes('UPDATE universal_master_pins SET save_count ='));
  assert.ok(umpUpdate);
  const pdmBatch = spikeSql.getStats().queries.find((q) => q.sql.includes('UPDATE pins_daily_metrics pdm'));
  const parsedBatch = JSON.parse(pdmBatch.values[0]);
  assert.equal(parsedBatch[1].daily_save_velocity, 0, '0 -> 50000 hydration jump must compute 0 velocity');
  assert.equal(parsedBatch[2].daily_save_velocity, 25000, '40000/day non-jump spike must be capped at 25000');
});

test('Wave 1.4: creators.mjs preserves null saves/repins when stats omitted', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const str = String(url);
    if (str.includes('BoardSectionsResource')) {
      return new Response(JSON.stringify({
        resource_response: {
          data: [{
            id: 'sec_1',
            title: 'Dinner',
            slug: 'dinner',
            pin_count: 1,
            preview_pins: [{ id: '999000111222', images: { '736x': { url: 'https://i.pinimg.com/736x/a.jpg' } } }]
          }]
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (str.includes('pidgets')) {
      return new Response(JSON.stringify({
        data: {
          user: { full_name: 'Chef' },
          pins: [{ id: '999000111333', title: 'Test', images: { '736x': { url: 'https://i.pinimg.com/736x/b.jpg' } } }]
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('<rss><channel></channel></rss>', {
      status: 200,
      headers: { 'Content-Type': 'application/xml' }
    });
  };

  try {
    const secRes = await fetchBoardSectionsResource('12345', 'chef', 'dinner');
    assert.equal(secRes.ok, true);
    assert.equal(secRes.sections[0].preview_pins[0].save_count, null);
    assert.equal(secRes.sections[0].preview_pins[0].has_explicit_saves, false);
    assert.equal(secRes.sections[0].preview_pins[0].repin_count, null);
    assert.equal(secRes.sections[0].preview_pins[0].has_explicit_repins, false);

    const userRes = await fetchCreatorLatestPinsPidgets('chef');
    assert.equal(userRes.ok, true);
    assert.equal(userRes.pins[0].save_count, null);
    assert.equal(userRes.pins[0].has_explicit_saves, false);
    assert.equal(userRes.pins[0].repin_count, null);
    assert.equal(userRes.pins[0].has_explicit_repins, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wave 1.5: cluster-intelligence & creator-velocity-crawler hardening contracts', () => {
  const clusterContent = fs.readFileSync(path.resolve(process.cwd(), 'scripts/cluster-intelligence.mjs'), 'utf8');
  assert.doesNotMatch(clusterContent, /\bcrc32\(/, 'cluster-intelligence must not use crc32 split-brain sharding');
  assert.match(clusterContent, /ABS\(hashtext\(seed_pin_id::text\)::bigint\)/);
  assert.doesNotMatch(clusterContent, /save_count\s*\?\?\s*formatted\.repin_count/, 'fetchPinDetails must never fall back saves to repin_count');

  const crawlerContent = fs.readFileSync(path.resolve(process.cwd(), 'scripts/creator-velocity-crawler.mjs'), 'utf8');
  assert.match(crawlerContent, /p\.last_scraped_at IS NULL OR p\.last_scraped_at < NOW\(\) - MAKE_INTERVAL/, 'Phase 2 must enforce last_scraped_at freshness gate');
  assert.match(crawlerContent, /LIMIT \$\{PHASE2_MAX_PINS\}/, 'Phase 2 must bound slice with LIMIT');
  assert.match(crawlerContent, /\{ useFreshnessGate: true, useUmpFields: false \}/, 'Phase 2 must enable processCreatorCatalogPin freshness gate');
});

test('Wave 1.6: crawlKeywordSERP runs pin batch upserts inside same atomic transaction and rolls back on failure', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('BaseSearchResource')) {
      const results = Array.from({ length: 8 }, (_, idx) => ({
        id: String(555000111222 + idx),
        type: 'pin',
        title: `Atomic SERP Pin ${idx + 1}`,
        domain: 'example.com',
        link: `https://example.com/atomic-${idx + 1}`,
        images: { '736x': { url: `https://i.pinimg.com/736x/atomic-${idx + 1}.jpg` } },
        aggregated_pin_data: { aggregated_stats: { saves: 150 + idx } },
        repin_count: 10
      }));
      return new Response(JSON.stringify({
        resource_response: {
          data: { results },
          bookmark: '-end-'
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ resource_response: { data: {} } }), { status: 200 });
  };

  try {
    // Failure inside insertNewPinsBatch (universal_master_pins) must abort BEFORE inserting keyword_serp_positions
    const rollbackSql = createTxSpySql((sqlText) => {
      if (sqlText.includes('UPDATE tracked_keywords SET crawl_lease_token =')) return [{ id: 88 }];
      if (sqlText.includes('SELECT id, keyword, target_pin_count')) {
        return [{ id: 88, keyword: 'atomic test', target_pin_count: 10, crawl_pages_limit: 1, is_active: true, metadata: {} }];
      }
      if (sqlText.includes('INSERT INTO universal_master_pins')) {
        throw new Error('simulated ump insert failure');
      }
      return [];
    });

    await assert.rejects(
      () => crawlKeywordSERP(rollbackSql, 88, { force: true }),
      /simulated ump insert failure/
    );
    const stats = rollbackSql.getStats();
    assert.equal(stats.txCount, 1);
    assert.equal(stats.rollbacks, 1);
    assert.equal(
      stats.queries.some((q) => q.inTx && q.sql.includes('INSERT INTO keyword_serp_positions')),
      false,
      'Must roll back before inserting keyword_serp_positions when master pin insert fails'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
