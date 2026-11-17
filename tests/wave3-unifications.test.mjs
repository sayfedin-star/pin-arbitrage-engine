import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  syncPinAcrossAllFourPillars,
  getPinDossier,
  fetchUniversalPinDossier
} from '../src/modules/pins/repository.mjs';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';
import { getKeywordsPageHtml } from '../src/keywords-ui.mjs';
import { getDomainsPageHtml } from '../src/domains-ui.mjs';
import { getDiscoveryPageHtml } from '../src/discovery-ui.mjs';
import { getPulsePageHtml } from '../src/pulse-ui.mjs';
import { getCampaignFoldersPageHtml } from '../src/campaign-folders-ui.mjs';
import { getPinDetailPageHtml } from '../src/pin-details-ui.mjs';

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

test('Wave 3.1: syncPinAcrossAllFourPillars runs inside sql.begin, delegates to ingestPinsBatch with all SSR fields, and rolls back cleanly', async () => {
  const spySql = createTxSpySql(async (sqlText) => {
    if (sqlText.includes('FROM universal_master_pins') && sqlText.includes('LIMIT 1')) {
      return [{
        pin_id: '987654321012',
        save_count: 40,
        repin_count: 5,
        is_hydrated: true,
        metadata: { existing_key: 'keep_me' },
        visual_annotations: ['Healthy Meal'],
        creation_method: 'video'
      }];
    }
    return [];
  });

  const result = await syncPinAcrossAllFourPillars({
    sql: spySql,
    pinId: '987654321012',
    scrapedPin: {
      title: 'Protein Oats',
      domain: 'www.HealthyBlog.com',
      destination_url: 'https://www.healthyblog.com/protein-oats',
      save_count: 42,
      repin_count: 0,
      has_explicit_saves: true,
      has_explicit_repins: true,
      creation_method: 'carousel',
      is_product: true,
      is_video: false,
      image_signature: 'sig_abc123',
      canonical_pin_id: '111222333444',
      annotations: ['Breakfast', 'High Protein'],
      utm_link: 'https://www.healthyblog.com/protein-oats?utm_source=pinterest',
      tracked_link: 'https://go.healthyblog.com/offer',
      seo_related_interests: ['Clean Eating'],
      rich_metadata: { recipe: { servings: 2 } }
    }
  });

  assert.equal(result.synced, true);
  const stats = spySql.getStats();
  assert.equal(stats.txCount, 1, 'syncPinAcrossAllFourPillars must wrap writes in sql.begin');
  assert.equal(stats.rollbacks, 0);

  const masterInsert = stats.queries.find((q) => q.sql.includes('INSERT INTO universal_master_pins'));
  assert.ok(masterInsert, 'Must delegate pin persistence to ingestPinsBatch');
  assert.equal(masterInsert.inTx, true, 'ingestPinsBatch must execute inside transaction');
  assert.ok(!masterInsert.sql.includes('catalog_rank'), 'Must not construct dead catalog_rank column');

  const payload = JSON.parse(masterInsert.values[0])[0];
  assert.equal(payload.clean_domain, 'healthyblog.com');
  assert.equal(payload.creation_method, 'carousel');
  assert.equal(payload.is_product, true);
  assert.equal(payload.is_video, false);
  assert.equal(payload.image_signature, 'sig_abc123');
  assert.equal(payload.canonical_pin_id, '111222333444');
  assert.equal(payload.save_count, 42);
  assert.equal(payload.repin_count, 0, 'Authentic explicit repins=0 must be preserved, not coerced to null');
  assert.equal(payload.is_hydrated, true);
  assert.equal(payload.metadata.utm_link, 'https://www.healthyblog.com/protein-oats?utm_source=pinterest');
  assert.equal(payload.metadata.tracked_link, 'https://go.healthyblog.com/offer');
  assert.deepEqual(payload.metadata.seo_related_interests, ['Clean Eating']);
  assert.deepEqual(payload.metadata.rich_metadata, { recipe: { servings: 2 } });

  // Verify transaction rollback on mid-transaction failure (after ingestPinsBatch writes)
  const failingSql = createTxSpySql(async (sqlText) => {
    if (sqlText.includes('FROM keyword_serp_positions ksp') && sqlText.includes('is_displaced = FALSE')) {
      return [{ keyword_id: 7, rank_position: 4, is_displaced: false, save_count: 10, repin_count: 0 }];
    }
    if (sqlText.includes('INSERT INTO keyword_serp_positions')) {
      throw new Error('simulated serp update failure');
    }
    return [];
  });

  await assert.rejects(
    syncPinAcrossAllFourPillars({
      sql: failingSql,
      pinId: '987654321012',
      scrapedPin: { title: 'Rollback Pin', save_count: 10, has_explicit_saves: true }
    }),
    /simulated serp update failure/
  );
  assert.equal(failingSql.getStats().txCount, 1);
  assert.equal(failingSql.getStats().rollbacks, 1);
});

test('Wave 3.2: dossier-reader uses single 4-query loader without dead tables/fields and propagates errors cleanly', async () => {
  const dossierReaderSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/modules/pins/dossier-reader.mjs'), 'utf8');
  assert.doesNotMatch(dossierReaderSrc, /competitor_board_pins/, 'Must not query redundant competitor_board_pins');
  assert.doesNotMatch(dossierReaderSrc, /masterRecord\?\.is_deleted/, 'Must not reference ghost masterRecord?.is_deleted');

  const pinsRouteSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/pins.mjs'), 'utf8');
  assert.doesNotMatch(pinsRouteSrc, /repo_fallback/, 'Must remove ?repo_fallback=true double-fetch branch');

  const executedQueries = [];
  const spySql = async (strings, ...values) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    executedQueries.push({ q, values });
    if (q.includes('FROM universal_master_pins') && q.includes('WHERE pin_id')) {
      return [{
        pin_id: '555666777888',
        title: 'Unified Dossier Pin',
        creator_username: 'chef_test',
        save_count: 120,
        repin_count: 15,
        daily_save_velocity: 4.5,
        visual_annotations: ['Dinner', 'Quick'],
        metadata: { creation_method: 'standard' }
      }];
    }
    if (q.includes('FROM pins_daily_metrics')) {
      return [{
        pin_id: '555666777888',
        snapshot_date: '2026-10-01',
        save_count: 120,
        repin_count: 15,
        daily_save_velocity: 4.5,
        updated_at: '2026-10-01T12:00:00Z'
      }];
    }
    if (q.includes('FROM keyword_serp_positions ksp')) {
      return [{
        keyword_id: 7,
        keyword_name: 'easy dinner',
        rank_position: 3,
        is_displaced: false,
        metadata: {}
      }];
    }
    if (q.includes('FROM competitor_profiles cp')) {
      return [{ id: 9, username: 'chef_test', display_name: 'Chef Test', is_active: true, metadata: {} }];
    }
    return [];
  };

  const dossierA = await getPinDossier(spySql, '555666777888');
  assert.equal(executedQueries.length, 4, 'getPinDossier must issue exactly 4 queries');
  assert.equal(dossierA.pin_id, '555666777888');
  assert.equal(dossierA.pillar_2_keywords_context.ranking_keywords[0].keyword, 'easy dinner');

  executedQueries.length = 0;
  const dossierB = await fetchUniversalPinDossier({ sql: spySql, pinId: '555666777888' });
  assert.equal(executedQueries.length, 4, 'fetchUniversalPinDossier must issue exactly 4 queries');
  assert.equal(dossierB.creative.title, 'Unified Dossier Pin');
  assert.equal(dossierB.pillar_1_creator_context.competitor_tracked, true);

  // Error handling contract: getPinDossier throws on DB error while fetchUniversalPinDossier returns DB_UNAVAILABLE
  const errorSql = async () => {
    const err = new Error('connection timeout');
    err.code = 'ETIMEDOUT';
    throw err;
  };
  await assert.rejects(getPinDossier(errorSql, '555666777888'), /connection timeout/);
  const envelope = await fetchUniversalPinDossier({ sql: errorSql, pinId: '555666777888' });
  assert.equal(envelope.success, false);
  assert.equal(envelope.error, 'DB_UNAVAILABLE');
});

test('Wave 3.3: All 7 UI shells emit single shared-head runtime without <\\/script> and wire PAEFormatters cleanly', () => {
  const pages = [
    { name: 'dashboard', html: getDashboardHtml(''), appFn: 'dashboardApp', args: [''] },
    { name: 'keywords', html: getKeywordsPageHtml(), appFn: 'keywordStudio', args: [] },
    { name: 'domains', html: getDomainsPageHtml('', ''), appFn: 'domainsApp', args: ['', ''] },
    { name: 'discovery', html: getDiscoveryPageHtml(), appFn: 'discoveryApp', args: [] },
    { name: 'pulse', html: getPulsePageHtml(''), appFn: 'pulseStudioApp', args: [''] },
    { name: 'folders', html: getCampaignFoldersPageHtml(), appFn: 'foldersApp', args: [''] },
    { name: 'pin-details', html: getPinDetailPageHtml('1234567890'), appFn: 'pinDetailApp', args: ['1234567890'] }
  ];

  for (const p of pages) {
    assert.equal(p.html.includes('<\\/script>'), false, `${p.name} HTML must not contain literal <\\/script>`);
    assert.equal((p.html.match(/window\.PAEFormatters\s*=/g) || []).length, 1, `${p.name} must emit PAEFormatters once`);
    assert.equal((p.html.match(/window\.resolvePinImageUrl\s*=/g) || []).length, 1, `${p.name} must emit resolvePinImageUrl once`);
    assert.equal((p.html.match(/window\.handlePinImgError\s*=/g) || []).length, 1, `${p.name} must emit handlePinImgError once`);
    assert.equal((p.html.match(/window\.__paeAuthInterceptorInstalled\s*=\s*true/g) || []).length, 1, `${p.name} must emit auth interceptor once`);
    assert.equal((p.html.match(/removeAttribute\('x-cloak'\)/g) || []).length, 1, `${p.name} must emit x-cloak failsafe once`);

    // Evaluate all inline scripts together in a browser-like VM context so window.PAEFormatters is wired
    const inlineCodes = [];
    const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = scriptRe.exec(p.html)) !== null) {
      inlineCodes.push(m[1]);
    }
    const sandbox = {
      window: null,
      document: {
        documentElement: { classList: { add() {}, remove() {} } },
        body: { hasAttribute: () => false, removeAttribute() {} },
        readyState: 'complete',
        addEventListener() {}
      },
      localStorage: { getItem: () => null, setItem() {} },
      fetch: async () => ({ ok: true, json: async () => ({}) }),
      Headers: class {},
      location: { pathname: '/', search: '', hash: '', origin: 'http://localhost:3000' },
      history: { pushState() {}, replaceState() {} },
      setTimeout: () => 0,
      clearTimeout: () => {},
      addEventListener() {},
      removeEventListener() {},
      tailwind: {},
      console,
      URLSearchParams,
      URL
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    for (const code of inlineCodes) {
      vm.runInContext(code, ctx);
    }

    assert.ok(ctx.window.PAEFormatters, `${p.name} must initialize window.PAEFormatters`);
    assert.equal(ctx.window.PAEFormatters.safeUrl('https://pinterest.com/pin/1/'), 'https://pinterest.com/pin/1/');
    assert.equal(ctx.window.PAEFormatters.safeUrl('javascript:alert(1)'), '#');
    assert.equal(ctx.window.PAEFormatters.safeUrl('//evil.example/x'), '#');
    assert.equal(ctx.window.PAEFormatters.safeUrl('ftp://evil.example/x'), '#');

    const instance = ctx[p.appFn](...p.args);
    assert.equal(instance.safeUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(instance.safeUrl('javascript:alert(1)'), '#');
    assert.equal(instance.safeUrl('//evil.example/x'), '#');
  }
});

test('Wave 3.4: instabox-boot-sync.sh executes migrate.mjs fail-loud without || true', () => {
  const bootScript = fs.readFileSync(path.resolve(process.cwd(), 'scripts/instabox-boot-sync.sh'), 'utf8');
  const migrateLine = bootScript.split('\n').find((line) => line.includes('node scripts/migrate.mjs'));
  assert.ok(migrateLine, 'instabox-boot-sync.sh must invoke node scripts/migrate.mjs');
  assert.equal(migrateLine.includes('|| true'), false, 'migrate.mjs invocation must not swallow errors with || true');
  assert.match(bootScript, /if\s+!\s+node scripts\/migrate\.mjs/, 'instabox-boot-sync.sh must fail loudly if migrate.mjs fails');
});
