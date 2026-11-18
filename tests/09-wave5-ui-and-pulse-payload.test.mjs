import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createFastifyApp } from '../src/server.mjs';
import { getGlobal24hPulseService, invalidateGlobalPulseCache, synthesizePinBlueprint } from '../src/modules/pulse/service.mjs';
import {
  safeApiFetch,
  apiFetch,
  sanitizeCsvCell,
  escapeHtml,
  formatUniversalAge,
  formatNumber,
  safeUrl
} from '../src/ui/shared-formatters.mjs';
import {
  parseHtmlElementTree,
  validateInlineScriptsForPage,
  countTagBalance,
  verifyAlpineTemplateXIfSingleRoot
} from '../scripts/check-syntax-and-templates.mjs';

function buildTaggedSqlText(strings, values) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += `$${i + 1}`;
  }
  return out;
}

function collectNodes(node, pred, acc = []) {
  if (pred(node)) acc.push(node);
  for (const child of node.children || []) {
    collectNodes(child, pred, acc);
  }
  return acc;
}

test('Wave 5B: GET /pae-shell.js serves cached runtime with ETag/304, executes window.PAE & apiFetch cleanly, and preserves fast 404 on unknown assets', async (t) => {
  const noopSql = async () => [];
  noopSql.end = async () => {};

  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: noopSql
  });

  t.after(async () => {
    await app.close();
  });

  // 1. GET /pae-shell.js -> 200 OK with strong SHA-256 ETag & Cache-Control
  const shellRes = await app.inject({ method: 'GET', url: '/pae-shell.js' });
  assert.equal(shellRes.statusCode, 200);
  assert.match(String(shellRes.headers['content-type']), /^application\/javascript/i);
  assert.equal(shellRes.headers['cache-control'], 'public, max-age=3600, must-revalidate');
  assert.equal(shellRes.headers['x-content-type-options'], 'nosniff');
  const etag = shellRes.headers.etag;
  assert.match(String(etag), /^"[a-f0-9]{64}"$/);
  assert.ok(shellRes.body.length > 1000);

  // 2. HEAD /pae-shell.js -> 200 OK with empty body & matching ETag; If-None-Match -> 304; POST -> 405
  const headRes = await app.inject({ method: 'HEAD', url: '/pae-shell.js' });
  assert.equal(headRes.statusCode, 200);
  assert.equal(headRes.headers.etag, etag);
  assert.equal(headRes.body, '');

  const notModRes = await app.inject({
    method: 'GET',
    url: '/pae-shell.js',
    headers: { 'if-none-match': etag }
  });
  assert.equal(notModRes.statusCode, 304);
  assert.equal(notModRes.body, '');

  const postShellRes = await app.inject({ method: 'POST', url: '/pae-shell.js' });
  assert.equal(postShellRes.statusCode, 405);

  // 3. Unknown static assets still trigger fast 404 trap without SSR fallthrough
  for (const missingAsset of ['/nonexistent.png', '/missing-bundle.js', '/assets/unknown.css']) {
    const res404 = await app.inject({ method: 'GET', url: missingAsset });
    assert.equal(res404.statusCode, 404, `Expected fast 404 on ${missingAsset}`);
    assert.equal(res404.body, 'Asset Not Found');
  }

  // 4. Execute /pae-shell.js in a clean VM browser sandbox and verify window.PAE + window.apiFetch
  const fetchCalls = [];
  let attemptCounter = 0;
  const sandboxWindow = {
    Headers,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => (k === 'pae_admin_api_key' ? 'browser-admin-token' : null)
    },
    fetch: async (url, init = {}) => {
      fetchCalls.push({ url, init });
      attemptCounter++;
      if (String(url).includes('/api/cold-start') && attemptCounter === 1) {
        return new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' }
        });
      }
      if (String(url).includes('/api/auth-missing')) {
        return new Response(JSON.stringify({ error: 'AUTH_NOT_CONFIGURED' }), {
          status: 503,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ success: true, items: [1, 2, 3] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  };
  sandboxWindow.window = sandboxWindow;
  sandboxWindow.globalThis = sandboxWindow;

  const compiledShell = new vm.Script(shellRes.body, { filename: 'pae-shell.js' });
  compiledShell.runInNewContext(sandboxWindow);

  assert.equal(typeof sandboxWindow.apiFetch, 'function');
  assert.equal(typeof sandboxWindow.safeApiFetch, 'function');
  assert.equal(typeof sandboxWindow.PAE.toast, 'function');
  assert.equal(typeof sandboxWindow.PAE.confirm, 'function');

  // Formatter parity between /pae-shell.js and Node-side shared-formatters.mjs
  assert.equal(sandboxWindow.PAE.safeUrl('javascript:alert(1)'), '#');
  assert.equal(sandboxWindow.PAE.safeUrl('https://pinterest.com/pin/1/'), safeUrl('https://pinterest.com/pin/1/'));
  assert.equal(sandboxWindow.PAE.sanitizeCsvCell('=SUM(A1:A2)'), sanitizeCsvCell('=SUM(A1:A2)'));
  assert.equal(sandboxWindow.PAE.sanitizeCsvCell('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
  assert.equal(sandboxWindow.PAE.formatUniversalAge(400), formatUniversalAge(400));
  assert.equal(sandboxWindow.PAE.formatUniversalAge(145), '145d');
  assert.equal(sandboxWindow.PAE.formatNumber(12500, { compact: true }), formatNumber(12500, { compact: true }));
  assert.equal(sandboxWindow.PAE.escapeHtml('<script>"x"</script>'), escapeHtml('<script>"x"</script>'));

  // Retry recovery on 502 with fresh AbortSignal + automatic x-api-key header injection
  const recovered = await sandboxWindow.apiFetch('/api/cold-start', { retries: 1, retryDelay: 5 });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.status, 200);
  assert.deepEqual((await recovered.json()).items, [1, 2, 3]);
  assert.equal(fetchCalls.length, 2);
  assert.notEqual(fetchCalls[0].init.signal, fetchCalls[1].init.signal, 'Each retry must receive a fresh AbortSignal');
  assert.equal(fetchCalls[0].init.headers.get('x-api-key'), 'browser-admin-token');

  // 503 AUTH_NOT_CONFIGURED must NOT retry and must surface AUTH_NOT_CONFIGURED cleanly
  const beforeAuthCalls = fetchCalls.length;
  const auth503 = await sandboxWindow.apiFetch('/api/auth-missing', { retries: 2, retryDelay: 5 });
  assert.equal(auth503.ok, false);
  assert.equal(auth503.status, 503);
  assert.equal(auth503.data.error, 'AUTH_NOT_CONFIGURED');
  assert.equal(fetchCalls.length - beforeAuthCalls, 1, 'AUTH_NOT_CONFIGURED 503 must fail fast without retrying');

  // Node-side re-export check
  assert.equal(apiFetch, safeApiFetch);
  const nodeRes = await safeApiFetch('http://local.test/api/ok', {
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  assert.equal(nodeRes.ok, true);
});

test('Wave 5B & 5C: All studio pages load /pae-shell.js, /pin/:id renders ONE unified sticky header with contextual back-links/actions, and /keywords has zero deprecated crossover markup', async (t) => {
  const noopSql = async () => [];
  noopSql.end = async () => {};

  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: noopSql
  });

  t.after(async () => {
    await app.close();
  });

  const studioRoutes = [
    '/',
    '/accounts',
    '/keywords',
    '/domains',
    '/folders',
    '/discovery',
    '/pulse',
    '/pin/1098245059167667976'
  ];

  for (const route of studioRoutes) {
    const res = await app.inject({ method: 'GET', url: route });
    assert.equal(res.statusCode, 200, `Expected 200 OK for ${route}`);
    const html = res.body;
    assert.ok(html.includes('<!DOCTYPE html>'), `${route} should render full HTML document`);
    assert.match(html, /<script src="\/pae-shell\.js\?v=[a-f0-9]{12}"><\/script>/, `${route} must include versioned /pae-shell.js`);
    validateInlineScriptsForPage(route, html);
    countTagBalance(html, route);
    const domTree = parseHtmlElementTree(html);
    verifyAlpineTemplateXIfSingleRoot(domTree, route);

    if (route === '/keywords') {
      const crossoverDivs = collectNodes(
        domTree,
        (n) => n.tag === 'div' && String(n.attrs?.['x-show'] || '').includes("activeTab === 'crossover'")
      );
      assert.equal(crossoverDivs.length, 0, '/keywords must not contain deprecated hidden crossover tab markup');
    }

    if (route === '/pin/1098245059167667976') {
      const headers = collectNodes(domTree, (n) => n.tag === 'header');
      assert.equal(headers.length, 1, '/pin/:id must render exactly ONE unified sticky <header>');

      const headerSubtree = headers[0];
      const backLinks = collectNodes(headerSubtree, (n) => n.tag === 'a' && n.attrs?.[':href'] === 'getBackUrl()');
      assert.equal(backLinks.length, 1, 'Unified /pin/:id header must preserve getBackUrl() back-link');

      const syncBtns = collectNodes(headerSubtree, (n) => n.tag === 'button' && String(n.attrs?.['@click'] || '').includes('triggerLiveDeepSync'));
      assert.equal(syncBtns.length, 1, 'Unified /pin/:id header must preserve Live Deep Sync button');

      const purgeBtns = collectNodes(headerSubtree, (n) => n.tag === 'button' && String(n.attrs?.['@click'] || '').includes('requestPurgePin'));
      assert.equal(purgeBtns.length, 1, 'Unified /pin/:id header must preserve Purge Pin button');

      const breadcrumbNav = collectNodes(headerSubtree, (n) => n.tag === 'nav' && n.attrs?.['aria-label'] === 'Breadcrumb');
      assert.equal(breadcrumbNav.length, 1, 'Unified /pin/:id header must preserve contextual Breadcrumb nav');

      // Execute pinDetailApp controller to verify ?folder_id=...&return_url=... contextual back-link behavior
      const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
      const pinAppScript = inlineScripts.find((code) => code.includes('function pinDetailApp('));
      assert.ok(pinAppScript, 'pinDetailApp inline controller must be present');

      const pinCtx = {
        URL,
        URLSearchParams,
        console,
        setTimeout: () => 1,
        clearTimeout: () => {},
        window: {
          location: {
            origin: 'https://pae.example.com',
            search: '?folder_id=42&folder=Autumn%20Recipes&return_url=%2Ffolders%2F42%2Fkeywords'
          },
          history: { replaceState: () => {} },
          sessionStorage: { getItem: () => null, setItem: () => {} },
          safeApiFetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true, pin_id: '1098245059167667976' }) })
        }
      };
      pinCtx.globalThis = pinCtx;
      new vm.Script(pinAppScript).runInNewContext(pinCtx);
      const instance = pinCtx.pinDetailApp('1098245059167667976');
      await instance.init();
      assert.equal(instance.originFolderId, '42');
      assert.equal(instance.getBackUrl(), '/folders/42/keywords');

      instance.originReturnUrl = '';
      assert.equal(instance.getBackUrl(), '/folders/42');
    }
  }
});

test('Wave 5A: getGlobal24hPulseService caps breakout_pins <= 250 and UI slices cleanly (< 900 KB) while preserving exact full-population KPIs', async () => {
  await invalidateGlobalPulseCache();

  const nowIso = new Date(Date.now() - 5 * 86400_000).toISOString();
  const oldIso = new Date(Date.now() - 90 * 86400_000).toISOString();

  // Build 600 unique active SERP pins (320 ranking for 2 keywords -> 920 active SERP rows; 180 fresh <=14d; 160 domainless)
  const activeSerpRows = [];
  for (let i = 1; i <= 600; i++) {
    const pid = `109824505916${String(i).padStart(6, '0')}`;
    const isFresh = i <= 180;
    const isDomainless = i > 440; // 160 domainless pins (441..600)
    const baseRow = {
      full_count: 920,
      keyword_id: (i % 20) + 1,
      keyword_text: `dinner idea ${(i % 20) + 1}`,
      keyword_category: 'Food',
      folders: [{ folder_id: 1, folder_name: 'Weeknight Dinners', folder_color: '#e11d48' }],
      pin_id: pid,
      rank_position: (i % 25) + 1,
      prev_rank_position: (i % 25) + 3,
      title: `Crispy Garlic Herb Recipe Variation Number ${i}`,
      domain: isDomainless ? '' : `kitchenblog${i % 45}.com`,
      destination_url: isDomainless ? '' : `https://kitchenblog${i % 45}.com/recipes/item-${i}`,
      image_url: `https://i.pinimg.com/736x/aa/bb/pin_${i}.jpg`,
      creator_username: `creator_${i % 30}`,
      board_name: `Board ${i % 18}`,
      description: 'Flavorful weeknight dinner recipe with garlic butter sauce.',
      alt_text: 'Plated dinner dish on rustic table',
      save_count: 500 + (600 - i) * 5,
      repin_count: 120 + (600 - i),
      daily_save_velocity: 25 + ((600 - i) % 90),
      delta_saves_24h: 25 + ((600 - i) % 90),
      delta_repins_24h: 6 + (i % 10),
      gains_5d: 110,
      gains_7d: 160,
      gains_10d: 210,
      gains_15d: 290,
      url_global_saves: 1200,
      dominant_color: `#${String((10 + (i % 80))).padStart(2, '0')}5533`,
      visual_annotations: ['garlic dinner', 'easy meal', `tag_${i % 12}`],
      created_at_pinterest: isFresh ? nowIso : oldIso,
      creation_method: 'pinterest_platform',
      crawled_at: nowIso
    };
    activeSerpRows.push(baseRow);

    if (i <= 320) {
      activeSerpRows.push({
        ...baseRow,
        keyword_id: ((i + 5) % 20) + 21,
        keyword_text: `quick meal ${((i + 5) % 20) + 21}`,
        rank_position: (i % 15) + 1
      });
    }
  }

  // Build 320 distinct surging Displaced Vault pins (distinct pin_ids so vault_surge_pins_count === 320)
  const vaultPins = [];
  for (let v = 1; v <= 320; v++) {
    const pid = `209824505916${String(v).padStart(6, '0')}`;
    vaultPins.push({
      keyword_id: (v % 10) + 1,
      keyword_text: `dinner idea ${(v % 10) + 1}`,
      keyword_category: 'Food',
      pin_id: pid,
      last_known_rank: (v % 12) + 1,
      vacuum_opportunity_score: 75,
      displaced_date: nowIso.slice(0, 10),
      save_count: 900 + v,
      repin_count: 150 + v,
      daily_save_velocity: 18 + (v % 40),
      delta_saves_24h: 18 + (v % 40),
      delta_repins_24h: 4,
      gains_5d: 80,
      gains_7d: 120,
      gains_10d: 150,
      gains_15d: 200,
      domain: `vaultsite${v % 20}.com`,
      creator_username: `vault_creator_${v % 15}`,
      title: `Surging Displaced Vault Recipe Idea ${v}`,
      description: 'Surging displaced vault recipe',
      alt_text: 'Vault dish photo',
      image_url: `https://i.pinimg.com/736x/cc/dd/vault_${v}.jpg`,
      destination_url: `https://vaultsite${v % 20}.com/post-${v}`,
      board_name: `Vault Board ${v % 8}`,
      dominant_color: '#cc6644',
      visual_annotations: ['comfort food', 'easy meal'],
      created_at_pinterest: oldIso
    });
  }

  // Build 80 distinct PinArchive winners
  const paWinners = Array.from({ length: 80 }, (_, idx) => ({
    pin_id: `309824505916${String(idx + 1).padStart(6, '0')}`,
    account_username: `winner_user_${idx % 10}`,
    title: `PinArchive Winner Showcase Recipe ${idx + 1}`,
    domain: `winnersite${idx % 10}.com`,
    destination_url: `https://winnersite${idx % 10}.com/win-${idx + 1}`,
    image_url: `https://i.pinimg.com/736x/ee/ff/win_${idx + 1}.jpg`,
    saves: 4200 + idx * 10,
    repins: 600 + idx,
    comments: 15,
    velocity: 45 + (idx % 20),
    delta_saves_24h: 45 + (idx % 20),
    delta_repins_24h: 8,
    annotations: ['dinner winner', 'easy meal'],
    created_at_pinterest: oldIso
  }));

  const vacuumRows = [
    { keyword_id: 1, keyword_text: 'dinner idea 1', displaced_24h_count: 6, displaced_top10_24h_count: 3, displaced_top10_7d_count: 5 }
  ];

  let currentActiveRows = activeSerpRows;
  const pulseSql = async (strings, ...values) => {
    const q = buildTaggedSqlText(strings, values);
    if (q.includes('COUNT(*) OVER()::int AS full_count')) return currentActiveRows;
    if (q.includes('displaced_top10_24h_count')) return vacuumRows;
    if (q.includes('WITH top_vault AS MATERIALIZED')) return vaultPins;
    if (q.includes('FROM candidate_graph_nodes')) return [];
    if (q.includes('FROM mv_pulse_24h_summary')) return [];
    if (q.includes('FROM domain_intelligence_rollup')) return [];
    if (q.includes('ump.save_count AS saves') && q.includes('LIMIT 100')) return paWinners;
    return [];
  };

  const payload = await getGlobal24hPulseService(pulseSql, {}, { bypassCache: true });
  assert.equal(payload.success, true);

  // 1. Strict array slice caps enforced across hydratedPins & paPinsList
  assert.equal(payload.breakout_pins.length, 250, 'breakout_pins must be strictly capped at 250');
  assert.equal(payload.fresh_rocket_pins.length, 100, 'fresh_rocket_pins must be capped at top 100');
  assert.equal(payload.vault_surge_pins.length, 150, 'vault_surge_pins must be capped at top 150');
  assert.equal(payload.keyword_vacuums_and_bridges.bridge_pins.length, 150, 'bridge_pins must be capped at top 150');
  assert.equal(payload.hidden_gems_telemetry.domainless_viral_pins.length, 100, 'domainless_viral_pins must be capped at top 100');

  // 2. Full-population KPI counters remain 100% exact (computed BEFORE slicing)
  assert.equal(payload.kpis.total_active_serp_pins, 600);
  assert.equal(payload.kpis.total_active_serp_slots, 920);
  assert.equal(payload.kpis.vault_surge_pins_count, 320);
  assert.equal(payload.kpis.multi_keyword_bridge_pins_count, 320);
  assert.equal(payload.kpis.fresh_rocket_pins_14d_count, 180);
  assert.equal(payload.kpis.domainless_viral_pins_count, 160);

  // 3. Total JSON payload size stays strictly below 900 KB
  const byteSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  assert.ok(
    byteSize < 900 * 1024,
    `Expected /api/pulse/24h payload < 900 KB (921,600 bytes), got ${byteSize} bytes`
  );

  // 4. Verify synthesizePinBlueprint works seamlessly on compact pin summaries
  const topPinId = payload.breakout_pins[0].pin_id;
  const bp = synthesizePinBlueprint(topPinId, payload);
  assert.equal(bp.pin_id, topPinId);
  assert.ok(bp.five_source_relevance.source_3_cv_annotations.length >= 1);

  // 5. Also verify paPinsList loop enforces >= 250 cap when hydratedPins < 250 (210 active + 80 paWinners -> 250)
  currentActiveRows = activeSerpRows.filter((row) => Number(row.pin_id.slice(-6)) <= 210 && row.keyword_id <= 20);
  const paOverflowPayload = await getGlobal24hPulseService(pulseSql, { folder_id: 999 }, { bypassCache: true });
  assert.equal(paOverflowPayload.kpis.total_active_serp_pins, 210);
  assert.equal(paOverflowPayload.breakout_pins.length, 250, 'paPinsList loop must also enforce breakout_pins <= 250 cap');
});

test('Wave 5C Safeguards: /api/creators/* & /api/competitors/* parity, per-creator rule overrides, and creator snapshot vs pin metric deletion isolation', async (t) => {
  const executedSql = [];
  let perCreatorRulesSaved = null;

  const mockSql = async (strings, ...values) => {
    const q = buildTaggedSqlText(strings, values);
    executedSql.push({ q, values });

    if (q.includes('DELETE FROM competitor_history_snapshots')) {
      return [{ id: values[0] }];
    }
    if (q.includes('DELETE FROM pins_daily_metrics')) {
      return [{ pin_id: values[0] }];
    }
    if (q.includes('SELECT metadata FROM universal_master_pins')) {
      return [{ metadata: {} }];
    }
    if (q.includes('FROM pins_daily_metrics') && q.includes('ORDER BY recorded_date DESC')) {
      return [];
    }
    if (q.includes("UPDATE competitor_profiles") && q.includes("jsonb_build_object('qualification_rules'")) {
      perCreatorRulesSaved = typeof values[0] === 'string' ? JSON.parse(values[0]) : values[0];
      return [{ id: 7, username: 'chef_amelia', rules: perCreatorRulesSaved }];
    }
    if (q.includes("SELECT id, username, metadata->'qualification_rules' AS rules")) {
      return [{
        id: 7,
        username: 'chef_amelia',
        rules: perCreatorRulesSaved || { tier1_min_saves: 75, tier2_min_repins: 15 }
      }];
    }
    if (q.includes('FROM app_settings')) {
      return [{
        rules: { tier1_min_saves: 50, tier2_min_repins: 10, master_ingest_enabled: true },
        updated_at: '2026-04-01T00:00:00.000Z'
      }];
    }
    if (q.includes('FROM competitor_profiles')) {
      return [{
        id: 7,
        username: 'chef_amelia',
        display_name: 'Chef Amelia',
        follower_count: 18500,
        monthly_reach: 2400000,
        profile_views: 3900000,
        total_pins: 510,
        total_boards: 16,
        is_active: true
      }];
    }
    return [];
  };
  mockSql.begin = async (cb) => cb(mockSql);
  mockSql.unsafe = async () => [];
  mockSql.end = async () => {};

  const app = createFastifyApp({
    NODE_ENV: 'test',
    API_SECRET_KEY: 'wave5-test-key',
    DATABASE_URL: '',
    SQL_CLIENT: mockSql
  });

  t.after(async () => {
    await app.close();
  });

  const authHeaders = { 'x-api-key': 'wave5-test-key' };

  // 1. Zero-404 parity between /api/creators/* and legacy /api/competitors/*
  const creatorsRes = await app.inject({ method: 'GET', url: '/api/creators?limit=5' });
  const competitorsRes = await app.inject({ method: 'GET', url: '/api/competitors?limit=5' });
  assert.equal(creatorsRes.statusCode, 200);
  assert.equal(competitorsRes.statusCode, 200);
  assert.deepEqual(creatorsRes.json(), competitorsRes.json());

  // 2. Per-creator qualification rule overrides (?id=7) remain distinct from global qualification rules
  const globalRulesRes = await app.inject({ method: 'GET', url: '/api/creators/rules' });
  assert.equal(globalRulesRes.statusCode, 200);
  assert.equal(globalRulesRes.json().rules.tier1_min_saves, 50);

  const saveCreatorRuleRes = await app.inject({
    method: 'POST',
    url: '/api/creators/rules',
    headers: authHeaders,
    payload: {
      competitor_id: 7,
      rules: { tier1_min_saves: 240, tier2_min_repins: 35, articles_only: true }
    }
  });
  assert.equal(saveCreatorRuleRes.statusCode, 200);
  assert.equal(saveCreatorRuleRes.json().success, true);

  const creatorRulesRes = await app.inject({ method: 'GET', url: '/api/creators/rules?id=7' });
  const legacyCreatorRulesRes = await app.inject({ method: 'GET', url: '/api/competitors/rules?id=7' });
  assert.equal(creatorRulesRes.statusCode, 200);
  assert.equal(legacyCreatorRulesRes.statusCode, 200);
  assert.equal(creatorRulesRes.json().rules.tier1_min_saves, 240);
  assert.equal(creatorRulesRes.json().rules.tier2_min_repins, 35);
  assert.deepEqual(creatorRulesRes.json(), legacyCreatorRulesRes.json());

  // Global qualification rules remain untouched (50, not 240)
  const globalRulesAfterRes = await app.inject({ method: 'GET', url: '/api/creators/rules' });
  assert.equal(globalRulesAfterRes.json().rules.tier1_min_saves, 50);

  // 3. Safeguard 1: Creator account snapshot deletion vs. Pin daily metric deletion are strictly isolated
  executedSql.length = 0;
  const delCreatorSnap = await app.inject({
    method: 'DELETE',
    url: '/api/creators/snapshot?id=881',
    headers: authHeaders
  });
  assert.equal(delCreatorSnap.statusCode, 200);
  assert.equal(delCreatorSnap.json().deleted_snapshot_id, '881');
  assert.equal(executedSql.some((e) => e.q.includes('DELETE FROM competitor_history_snapshots')), true);
  assert.equal(executedSql.some((e) => e.q.includes('DELETE FROM pins_daily_metrics')), false);

  executedSql.length = 0;
  const delPinDaily = await app.inject({
    method: 'DELETE',
    url: '/api/pins/1098245059167667976/daily-metrics/2026-04-01',
    headers: authHeaders
  });
  assert.equal(delPinDaily.statusCode, 200);
  assert.equal(delPinDaily.json().success, true);
  assert.equal(executedSql.some((e) => e.q.includes('DELETE FROM pins_daily_metrics')), true);
  assert.equal(executedSql.some((e) => e.q.includes('DELETE FROM competitor_history_snapshots')), false);
});
