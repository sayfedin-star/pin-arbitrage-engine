import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import zlib from 'node:zlib';
import * as acorn from 'acorn';
import { createFastifyApp } from '../src/server.mjs';
import {
  negotiateEncoding,
  COMPRESSION_THRESHOLD_BYTES
} from '../src/http/compression.mjs';
import {
  CLIENT_JS_ASSET_NAMES,
  getClientJsAsset,
  listClientJsAssets
} from '../src/ui/client-assets.mjs';
import { invalidateGlobalPulseCache } from '../src/modules/pulse/service.mjs';
import {
  parseHtmlElementTree,
  validateExtractedClientJsAssets,
  verifyReferencedClientAssetTags
} from '../scripts/check-syntax-and-templates.mjs';

function makeNoopSql() {
  const fn = async () => [];
  fn.unsafe = async () => [];
  fn.begin = async (cb) => cb(fn);
  fn.end = async () => {};
  return fn;
}

function collectDomNodes(node, pred, acc = []) {
  if (pred(node)) acc.push(node);
  for (const child of node.children || []) {
    collectDomNodes(child, pred, acc);
  }
  return acc;
}

function walkAcornAst(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item.type === 'string') {
          walkAcornAst(item, visitor);
        }
      }
    } else if (val && typeof val.type === 'string') {
      walkAcornAst(val, visitor);
    }
  }
}

function findNativeConfirmCalls(jsCode) {
  const ast = acorn.parse(jsCode, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true
  });
  const hits = [];
  walkAcornAst(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee;
    if (callee?.type === 'Identifier' && callee.name === 'confirm') {
      hits.push({ kind: 'confirm()', line: node.loc?.start?.line || 0 });
    } else if (
      callee?.type === 'MemberExpression' &&
      !callee.computed &&
      callee.object?.type === 'Identifier' &&
      (callee.object.name === 'window' || callee.object.name === 'globalThis' || callee.object.name === 'self') &&
      callee.property?.type === 'Identifier' &&
      callee.property.name === 'confirm'
    ) {
      hits.push({ kind: `${callee.object.name}.confirm()`, line: node.loc?.start?.line || 0 });
    }
  });
  return hits;
}

test('Wave 4A.1: Fastify HTTP compression supports gzip & brotli on HTML/JS/JSON (>1KB), honors Vary/q-values, and keeps /api/pulse/24h < 900KB', async (t) => {
  // Unit check RFC 9110 Accept-Encoding negotiation
  assert.equal(negotiateEncoding('gzip, deflate, br'), 'br');
  assert.equal(negotiateEncoding('gzip, deflate'), 'gzip');
  assert.equal(negotiateEncoding('br;q=0.5, gzip;q=1.0'), 'gzip');
  assert.equal(negotiateEncoding('br;q=0, gzip;q=0.8'), 'gzip');
  assert.equal(negotiateEncoding('br;q=0, gzip;q=0'), null);
  assert.equal(negotiateEncoding('identity'), null);
  assert.equal(negotiateEncoding(''), null);

  invalidateGlobalPulseCache();

  const pulseMockSql = Object.assign(
    async (strings) => {
      const q = Array.from(strings).join(' ');
      if (q.includes('COUNT(*) OVER()::int AS full_count')) {
        return Array.from({ length: 40 }, (_, i) => ({
          full_count: 40,
          keyword_id: (i % 5) + 1,
          keyword_text: `weeknight dinner ${i % 5}`,
          keyword_category: 'Food',
          folders: [{ folder_id: 1, folder_name: 'Dinners', folder_color: '#e11d48' }],
          pin_id: `109824505916760${String(i).padStart(4, '0')}`,
          rank_position: (i % 20) + 1,
          prev_rank_position: (i % 20) + 3,
          title: `High Velocity Garlic Butter Dinner Pin ${i}`,
          domain: `recipehub${i % 8}.com`,
          destination_url: `https://recipehub${i % 8}.com/post-${i}`,
          image_url: `https://i.pinimg.com/736x/aa/bb/pin_${i}.jpg`,
          creator_username: `chef_${i % 6}`,
          board_name: `Board ${i % 4}`,
          description: 'Quick dinner recipe',
          alt_text: 'Dinner plate',
          save_count: 800 + i * 25,
          repin_count: 140 + i * 3,
          daily_save_velocity: 35 + i,
          delta_saves_24h: 35 + i,
          delta_repins_24h: 5,
          gains_5d: 120,
          gains_7d: 170,
          gains_10d: 210,
          gains_15d: 280,
          url_global_saves: 950,
          dominant_color: '#cc5533',
          visual_annotations: ['garlic dinner', 'quick meal'],
          created_at_pinterest: new Date(Date.now() - 4 * 86400_000).toISOString(),
          creation_method: 'pinterest_platform',
          crawled_at: new Date().toISOString()
        }));
      }
      return [];
    },
    { unsafe: async () => [], begin: async (cb) => cb(pulseMockSql), end: async () => {} }
  );

  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: pulseMockSql
  });
  t.after(async () => {
    await app.close();
  });

  // 1. HTML route: gzip + brotli + Vary: Cookie, Accept-Encoding
  const htmlRaw = await app.inject({ method: 'GET', url: '/' });
  const htmlGz = await app.inject({ method: 'GET', url: '/', headers: { 'accept-encoding': 'gzip' } });
  const htmlBr = await app.inject({ method: 'GET', url: '/', headers: { 'accept-encoding': 'gzip, deflate, br' } });

  assert.equal(htmlRaw.statusCode, 200);
  assert.equal(htmlRaw.headers['content-encoding'], undefined);
  assert.match(String(htmlRaw.headers.vary || ''), /\bCookie\b/);
  assert.match(String(htmlRaw.headers.vary || ''), /\bAccept-Encoding\b/);

  assert.equal(htmlGz.statusCode, 200);
  assert.equal(htmlGz.headers['content-encoding'], 'gzip');
  assert.match(String(htmlGz.headers.vary || ''), /\bAccept-Encoding\b/);
  assert.ok(htmlGz.rawPayload.length < htmlRaw.rawPayload.length * 0.25, 'HTML gzip should achieve >75% reduction');
  assert.equal(zlib.gunzipSync(htmlGz.rawPayload).toString('utf8'), htmlRaw.body);

  assert.equal(htmlBr.statusCode, 200);
  assert.equal(htmlBr.headers['content-encoding'], 'br');
  assert.ok(htmlBr.rawPayload.length < htmlGz.rawPayload.length, 'HTML brotli should beat gzip');
  assert.equal(zlib.brotliDecompressSync(htmlBr.rawPayload).toString('utf8'), htmlRaw.body);

  // 2. Extracted JS route: gzip + brotli decompression matches exact raw JS bytes
  const dashAsset = getClientJsAsset('dashboard');
  const jsRaw = await app.inject({ method: 'GET', url: dashAsset.url });
  const jsGz = await app.inject({ method: 'GET', url: dashAsset.url, headers: { 'accept-encoding': 'gzip' } });
  const jsBr = await app.inject({ method: 'GET', url: dashAsset.url, headers: { 'accept-encoding': 'br, gzip' } });
  assert.equal(jsGz.headers['content-encoding'], 'gzip');
  assert.equal(jsBr.headers['content-encoding'], 'br');
  assert.match(String(jsBr.headers.vary || ''), /\bAccept-Encoding\b/);
  assert.equal(zlib.gunzipSync(jsGz.rawPayload).toString('utf8'), jsRaw.body);
  assert.equal(zlib.brotliDecompressSync(jsBr.rawPayload).toString('utf8'), jsRaw.body);

  // 3. JSON API route (/api/pulse/24h): uncompressed < 900 KB AND compressed gzip/br round-trips cleanly
  const pulseRaw = await app.inject({ method: 'GET', url: '/api/pulse/24h' });
  const pulseGz = await app.inject({ method: 'GET', url: '/api/pulse/24h', headers: { 'accept-encoding': 'gzip' } });
  const pulseBr = await app.inject({ method: 'GET', url: '/api/pulse/24h', headers: { 'accept-encoding': 'br' } });

  assert.equal(pulseRaw.statusCode, 200);
  assert.ok(pulseRaw.rawPayload.length > COMPRESSION_THRESHOLD_BYTES, 'Pulse payload must exceed 1KB threshold');
  assert.ok(pulseRaw.rawPayload.length < 900 * 1024, 'Pulse uncompressed payload must remain < 900 KB');
  assert.equal(pulseGz.headers['content-encoding'], 'gzip');
  assert.match(String(pulseGz.headers.vary || ''), /\bAccept-Encoding\b/);
  assert.equal(pulseBr.headers['content-encoding'], 'br');
  assert.deepEqual(JSON.parse(zlib.gunzipSync(pulseGz.rawPayload).toString('utf8')), pulseRaw.json());
  assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(pulseBr.rawPayload).toString('utf8')), pulseRaw.json());

  // 4. Small JSON payloads (<= 1 KB, e.g. /api/health) stay uncompressed
  const healthRes = await app.inject({ method: 'GET', url: '/api/health', headers: { 'accept-encoding': 'br, gzip' } });
  assert.equal(healthRes.statusCode, 200);
  assert.ok(healthRes.rawPayload.length <= COMPRESSION_THRESHOLD_BYTES);
  assert.equal(healthRes.headers['content-encoding'], undefined, 'Responses <= 1KB must NOT be compressed');
});

test('Wave 4A.2: Extracted /assets/js/*.js routes enforce SHA-256 ETag, 304 Not Modified, immutable Cache-Control on ?v= match, and slash inline HTML JS across all 8 SSR routes', async (t) => {
  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: makeNoopSql()
  });
  t.after(async () => {
    await app.close();
  });

  // 1. Static verifier validates all 9 extracted client JS assets cleanly
  const validatedCount = validateExtractedClientJsAssets();
  assert.equal(validatedCount, CLIENT_JS_ASSET_NAMES.length);
  assert.equal(CLIENT_JS_ASSET_NAMES.length, 9);

  // 2. Every /assets/js/<name>.js route supports strong ETag, 304 (strong + weak W/), immutable ?v=, HEAD, and 405 POST
  for (const asset of listClientJsAssets()) {
    const pinnedRes = await app.inject({ method: 'GET', url: asset.url });
    assert.equal(pinnedRes.statusCode, 200, `GET ${asset.url} must return 200`);
    assert.match(String(pinnedRes.headers['content-type']), /^application\/javascript/i);
    assert.equal(pinnedRes.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(pinnedRes.headers.etag, asset.etag);
    assert.match(String(pinnedRes.headers.etag), /^"[a-f0-9]{64}"$/);
    assert.equal(pinnedRes.headers['x-content-type-options'], 'nosniff');
    assert.equal(pinnedRes.body, asset.code);

    // Unversioned or stale ?v= falls back to revalidating Cache-Control
    const unpinnedRes = await app.inject({ method: 'GET', url: `/assets/js/${asset.name}.js?v=stale0000000` });
    assert.equal(unpinnedRes.statusCode, 200);
    assert.equal(unpinnedRes.headers['cache-control'], 'public, max-age=3600, must-revalidate');

    // If-None-Match -> 304 (exact ETag and weak W/ ETag)
    const notModStrong = await app.inject({
      method: 'GET',
      url: asset.url,
      headers: { 'if-none-match': asset.etag }
    });
    assert.equal(notModStrong.statusCode, 304);
    assert.equal(notModStrong.body, '');

    const notModWeak = await app.inject({
      method: 'GET',
      url: asset.url,
      headers: { 'if-none-match': `W/${asset.etag}` }
    });
    assert.equal(notModWeak.statusCode, 304);
    assert.equal(notModWeak.body, '');

    // HEAD -> 200 empty body; POST -> 405
    const headRes = await app.inject({ method: 'HEAD', url: asset.url });
    assert.equal(headRes.statusCode, 200);
    assert.equal(headRes.body, '');
    assert.equal(headRes.headers.etag, asset.etag);

    const postRes = await app.inject({ method: 'POST', url: asset.url });
    assert.equal(postRes.statusCode, 405);
  }

  // Unknown /assets/js/*.js still triggers fast 404 trap
  const missingJs = await app.inject({ method: 'GET', url: '/assets/js/does-not-exist.js' });
  assert.equal(missingJs.statusCode, 404);
  assert.equal(missingJs.body, 'Asset Not Found');

  // 3. All 8 SSR routes drop inline JS to tiny bootstrap (< 2.5 KB) and reference versioned assets
  const ssrExpectations = [
    { route: '/', expectedAssets: ['command-palette', 'dashboard'], maxRawKb: 640 },
    { route: '/keywords', expectedAssets: ['command-palette', 'keywords'], maxRawKb: 370 },
    { route: '/folders', expectedAssets: ['command-palette', 'folders'], maxRawKb: 215 },
    { route: '/newborn', expectedAssets: ['command-palette', 'newborn'], maxRawKb: 225 },
    { route: '/domains', expectedAssets: ['command-palette', 'domains'], maxRawKb: 210 },
    { route: '/pin/1098245059167667976', expectedAssets: ['command-palette', 'pin-details'], maxRawKb: 185 },
    { route: '/pulse', expectedAssets: ['command-palette', 'pulse'], maxRawKb: 145 },
    { route: '/discovery', expectedAssets: ['command-palette', 'discovery'], maxRawKb: 120 }
  ];

  for (const { route, expectedAssets, maxRawKb } of ssrExpectations) {
    const res = await app.inject({ method: 'GET', url: route });
    assert.equal(res.statusCode, 200, `GET ${route} must return 200`);
    const html = res.body;

    // Verify every referenced asset tag matches registered SHA-256 hash
    const verifiedRefs = verifyReferencedClientAssetTags(route, html);
    assert.equal(verifiedRefs, expectedAssets.length, `${route} must reference ${expectedAssets.length} extracted JS assets`);
    for (const assetName of expectedAssets) {
      const asset = getClientJsAsset(assetName);
      assert.ok(html.includes(`<script src="${asset.url}"></script>`), `${route} must include <script src="${asset.url}">`);
    }

    // Inline JS size must stay tiny (< 2.5 KB: only FOUC theme script + tailwind config + tiny JSON bootstrap)
    const inlineJsBytes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((m) => !/\bsrc\s*=/i.test(m[1]))
      .reduce((acc, m) => acc + Buffer.byteLength(m[2], 'utf8'), 0);
    assert.ok(inlineJsBytes < 2560, `${route} inline JS must be < 2.5 KB, got ${inlineJsBytes} bytes`);

    // Uncompressed HTML payload significantly reduced compared to pre-Wave-4A baseline
    const rawBytes = Buffer.byteLength(html, 'utf8');
    assert.ok(rawBytes < maxRawKb * 1024, `${route} uncompressed HTML expected < ${maxRawKb} KB, got ${(rawBytes / 1024).toFixed(1)} KB`);
  }

  // 4. Safe SSR data separation: /folders/42/creators bootstraps folderId via window.__PAE_PAGE_DATA__ without mutating dashboard.js hash
  const folderCreatorsRes = await app.inject({ method: 'GET', url: '/folders/42/creators' });
  assert.equal(folderCreatorsRes.statusCode, 200);
  assert.ok(folderCreatorsRes.body.includes('window.__PAE_PAGE_DATA__ = {"folderId":"42"}'));
  assert.ok(folderCreatorsRes.body.includes(`<script src="${getClientJsAsset('dashboard').url}"></script>`));
});

test('Wave 4A.3: Zero native confirm() calls remain across all served SSR inline scripts and extracted /assets/js/*.js bundles (AST verified)', async (t) => {
  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: makeNoopSql()
  });
  t.after(async () => {
    await app.close();
  });

  // 1. Parse every served /assets/js/*.js bundle with Acorn AST and assert 0 native confirm() / window.confirm() calls
  for (const asset of listClientJsAssets()) {
    const res = await app.inject({ method: 'GET', url: asset.url });
    assert.equal(res.statusCode, 200);
    const hits = findNativeConfirmCalls(res.body);
    assert.deepEqual(
      hits,
      [],
      `Found forbidden native confirm() calls in /assets/js/${asset.name}.js: ${JSON.stringify(hits)}`
    );
  }

  // 2. Also verify every inline <script> block on all 8 SSR routes has 0 native confirm() calls
  for (const route of ['/', '/keywords', '/folders', '/newborn', '/domains', '/pin/1098245059167667976', '/pulse', '/discovery']) {
    const res = await app.inject({ method: 'GET', url: route });
    assert.equal(res.statusCode, 200);
    const inlineBlocks = [...res.body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((m) => !/\bsrc\s*=/i.test(m[1]))
      .map((m) => m[2]);
    for (const block of inlineBlocks) {
      const hits = findNativeConfirmCalls(block);
      assert.deepEqual(hits, [], `Found forbidden native confirm() in inline script on ${route}`);
    }
  }
});

test('Wave 4A.4: /pae-shell.js exposes unified PAE helpers (confirm modal, copyText, downloadCsv, toggleTheme, toggleSidebar, resolveHdImageUrl) and preserves same-origin /api/ auth guard', async (t) => {
  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: makeNoopSql()
  });
  t.after(async () => {
    await app.close();
  });

  const shellRes = await app.inject({ method: 'GET', url: '/pae-shell.js' });
  assert.equal(shellRes.statusCode, 200);

  // Build minimal DOM + Browser sandbox to exercise PAE.confirm, copyText, downloadCsv, toggleTheme, toggleSidebar, resolveHdImageUrl
  const storage = new Map();
  const docClasses = new Set();
  const dispatchedEvents = [];
  const docListeners = new Map();
  let clipboardText = '';
  let downloadedName = '';
  let lastBlobParts = null;
  let mockDoc = null;

  function makeEl(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      attrs: {},
      style: {},
      children: [],
      parentNode: null,
      listeners: {},
      textContent: '',
      value: '',
      className: '',
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      hasAttribute(k) { return Object.hasOwn(this.attrs, k); },
      removeAttribute(k) { delete this.attrs[k]; },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter((c) => c !== child);
        child.parentNode = null;
        return child;
      },
      addEventListener(ev, fn) {
        this.listeners[ev] = this.listeners[ev] || [];
        this.listeners[ev].push(fn);
      },
      click() {
        if (this.attrs.download) downloadedName = this.attrs.download;
        for (const fn of this.listeners.click || []) fn({ target: this });
      },
      focus() { mockDoc.activeElement = this; }
    };
    return el;
  }

  const mockBody = makeEl('body');
  mockDoc = {
    body: mockBody,
    activeElement: null,
    documentElement: {
      classList: {
        add: (c) => docClasses.add(c),
        remove: (c) => docClasses.delete(c),
        contains: (c) => docClasses.has(c)
      }
    },
    createElement: (tag) => makeEl(tag),
    getElementById: () => null,
    addEventListener: (ev, fn) => {
      docListeners.set(ev, [...(docListeners.get(ev) || []), fn]);
    },
    removeEventListener: (ev, fn) => {
      docListeners.set(ev, (docListeners.get(ev) || []).filter((f) => f !== fn));
    }
  };

  class MockBlob {
    constructor(parts, opts) {
      this.parts = parts;
      this.type = opts?.type;
      lastBlobParts = parts;
    }
  }

  const fetchAuthLog = [];
  const sandbox = {
    Headers,
    URL: Object.assign(URL, {
      createObjectURL: () => 'blob:mock-csv',
      revokeObjectURL: () => {}
    }),
    Blob: MockBlob,
    CustomEvent: class MockCustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    AbortController,
    AbortSignal,
    setTimeout: () => 1,
    clearTimeout: () => {},
    document: mockDoc,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v))
    },
    navigator: {
      clipboard: {
        writeText: async (text) => { clipboardText = text; }
      }
    },
    location: { origin: 'https://pae.example.com' },
    dispatchEvent: (ev) => dispatchedEvents.push(ev),
    fetch: async (url, init = {}) => {
      fetchAuthLog.push({ url, apiKey: init?.headers?.get?.('x-api-key') || null });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  new vm.Script(shellRes.body, { filename: 'pae-shell.js' }).runInNewContext(sandbox);

  // 1. Verify all unified helpers are exposed
  for (const fnName of ['confirm', 'copyText', 'downloadCsv', 'toggleTheme', 'toggleSidebar', 'resolveHdImageUrl', 'resolveLosslessImageUrl']) {
    assert.equal(typeof sandbox.PAE[fnName], 'function', `window.PAE.${fnName} must be exposed`);
  }

  // 2. PAE.confirm renders accessible alertdialog with aria-labelledby/describedby and resolves true on confirm click / false on Escape
  const confirmPromise = sandbox.PAE.confirm('Delete item?', { title: 'Confirm Delete', confirmLabel: 'Delete', danger: true });
  assert.equal(mockBody.children.length, 1);
  const overlay = mockBody.children[0];
  const dialog = overlay.children[0];
  assert.equal(dialog.attrs.role, 'alertdialog');
  assert.equal(dialog.attrs['aria-modal'], 'true');
  assert.ok(dialog.attrs['aria-labelledby']);
  assert.ok(dialog.attrs['aria-describedby']);
  const btnRow = dialog.children[2];
  const confirmBtn = btnRow.children[1];
  confirmBtn.click();
  assert.equal(await confirmPromise, true);
  assert.equal(mockBody.children.length, 0, 'Overlay must be removed after confirm');

  const escPromise = sandbox.PAE.confirm('Cancel via Escape?');
  for (const fn of docListeners.get('keydown') || []) {
    fn({ key: 'Escape', preventDefault: () => {} });
  }
  assert.equal(await escPromise, false);
  assert.equal(mockBody.children.length, 0);

  // 3. PAE.copyText copies via clipboard API
  const copied = await sandbox.PAE.copyText('pin-12345');
  assert.equal(copied, true);
  assert.equal(clipboardText, 'pin-12345');

  // 4. PAE.downloadCsv sanitizes formula injection and downloads .csv
  const csvOut = sandbox.PAE.downloadCsv('pins-report', [
    ['=SUM(A1)', 'Normal Title'],
    ['+1234', 'Safe "Quoted"']
  ], { headers: ['Formula', 'Title'] });
  assert.equal(downloadedName, 'pins-report.csv');
  assert.ok(csvOut.includes('"\'=SUM(A1)"'), 'CSV formula injection must be neutralized');
  assert.ok(csvOut.includes('"Safe ""Quoted"""'));
  assert.equal(lastBlobParts.length, 1);
  assert.equal(lastBlobParts[0], csvOut);

  // 5. PAE.toggleTheme toggles .dark strictly on documentElement and persists pa_theme
  assert.equal(sandbox.PAE.toggleTheme(), true);
  assert.equal(docClasses.has('dark'), true);
  assert.equal(storage.get('pa_theme'), 'dark');
  assert.equal(sandbox.PAE.toggleTheme(), false);
  assert.equal(docClasses.has('dark'), false);
  assert.equal(storage.get('pa_theme'), 'light');

  // 6. PAE.toggleSidebar toggles pae_sidebar_collapsed
  assert.equal(sandbox.PAE.toggleSidebar(), true);
  assert.equal(storage.get('pae_sidebar_collapsed'), 'true');
  assert.equal(sandbox.PAE.toggleSidebar(), false);
  assert.equal(storage.get('pae_sidebar_collapsed'), 'false');

  // 7. PAE.resolveHdImageUrl upgrades Pinterest thumbnails to 1200x
  assert.equal(
    sandbox.PAE.resolveHdImageUrl('https://i.pinimg.com/236x/aa/bb/cc.jpg'),
    'https://i.pinimg.com/1200x/aa/bb/cc.jpg'
  );
  assert.equal(
    sandbox.PAE.resolveLosslessImageUrl('https://i.pinimg.com/736x/aa/bb/cc.jpg'),
    'https://i.pinimg.com/originals/aa/bb/cc.jpg'
  );
  assert.equal(sandbox.resolveHdImageUrl('https://i.pinimg.com/474x/x.jpg'), 'https://i.pinimg.com/1200x/x.jpg');

  // 8. Same-origin /api/ x-api-key guard preserved (never leaks key to external origin)
  storage.set('pae_admin_api_key', 'secret-admin-key');
  await sandbox.fetch('/api/overview');
  await sandbox.fetch('https://evil.example/api/overview');
  assert.equal(fetchAuthLog[0].apiKey, 'secret-admin-key');
  assert.equal(fetchAuthLog[1].apiKey, null, 'External origin must never receive x-api-key');
});

test('Wave 4A.5: Fetch hygiene, AbortController cancellation, discovery safeUrl delegation, single WorkspaceHeader on /folders/:id/keywords, debounced Lucide icons & 2026 labels', async (t) => {
  const app = createFastifyApp({
    NODE_ENV: 'test',
    DATABASE_URL: '',
    SQL_CLIENT: makeNoopSql()
  });
  t.after(async () => {
    await app.close();
  });

  // 1. /folders/42/keywords renders Campaign Workspace Header EXACTLY ONCE (not twice), keeps isSettingsModalOpen, and uses fetchKeywords(true) refresh
  const folderKwRes = await app.inject({ method: 'GET', url: '/folders/42/keywords' });
  assert.equal(folderKwRes.statusCode, 200);
  const workspaceHeaderCount = (folderKwRes.body.match(/Scope: Folder #42 Active/g) || []).length;
  assert.equal(workspaceHeaderCount, 1, '/folders/:id/keywords must render Campaign Workspace Header exactly ONCE');
  assert.ok(folderKwRes.body.includes('isSettingsModalOpen'), 'keywords-drawers.mjs must preserve isSettingsModalOpen');

  const folderKwTree = parseHtmlElementTree(folderKwRes.body);
  const refreshButtons = collectDomNodes(
    folderKwTree,
    (n) => n.tag === 'button' && n.attrs?.title === 'Refresh Workspace Data'
  );
  assert.equal(refreshButtons.length, 1);
  assert.match(String(refreshButtons[0].attrs['@click'] || ''), /fetchKeywords\(true\)/);

  // Verify /folders/42/creators, /folders/42/domains, /folders/42/newborn, /folders/42/pulse refresh handlers
  const roomRefreshChecks = [
    ['/folders/42/creators', /refreshAll\(\)/],
    ['/folders/42/domains', /refreshDomains\(\)/],
    ['/folders/42/newborn', /refreshWorkspace\(true\)/],
    ['/folders/42/pulse', /refreshPulse\(true\)/],
    ['/folders/42', /runCrossoverAnalysis\(true\)/]
  ];
  for (const [route, expectedPattern] of roomRefreshChecks) {
    const res = await app.inject({ method: 'GET', url: route });
    assert.equal(res.statusCode, 200);
    const tree = parseHtmlElementTree(res.body);
    const btns = collectDomNodes(tree, (n) => n.tag === 'button' && n.attrs?.title === 'Refresh Workspace Data');
    assert.equal(btns.length, 1, `${route} must render exactly 1 workspace Refresh button`);
    assert.match(String(btns[0].attrs['@click'] || ''), expectedPattern, `${route} Refresh handler mismatch`);
  }

  // 2. Pinterest 2026 labels fixed on / (no 'Total Profile Views', no 'monthly reach'; preserves isSettingsModalOpen on /folders)
  const dashHtmlRes = await app.inject({ method: 'GET', url: '/' });
  assert.equal(dashHtmlRes.statusCode, 200);
  assert.equal(dashHtmlRes.body.includes('Total Profile Views'), false, 'Deprecated Total Profile Views label must be replaced with Impressions');
  assert.equal(/monthly reach/i.test(dashHtmlRes.body), false, 'Deprecated monthly reach label must be replaced with Total audience');
  assert.ok(dashHtmlRes.body.includes('Total audience'));
  assert.ok(dashHtmlRes.body.includes('Impressions'));

  const foldersHtmlRes = await app.inject({ method: 'GET', url: '/folders' });
  assert.ok(foldersHtmlRes.body.includes('isSettingsModalOpen'), 'folders-modals.mjs must preserve isSettingsModalOpen');

  // 3. discovery-client-app.mjs delegates safeUrl directly to window.PAEFormatters.safeUrl (zero shadow)
  const discAsset = getClientJsAsset('discovery');
  let safeUrlDelegatedArgs = [];
  const discVm = {
    console,
    URLSearchParams,
    localStorage: { getItem: () => null, setItem: () => {} },
    window: {
      PAEFormatters: {
        safeUrl: (u) => {
          safeUrlDelegatedArgs.push(u);
          return u === 'javascript:alert(1)' ? '#' : u;
        }
      }
    }
  };
  discVm.globalThis = discVm;
  new vm.Script(discAsset.code).runInNewContext(discVm);
  const discApp = discVm.discoveryApp();
  assert.equal(discApp.safeUrl('https://pinterest.com/ideas/'), 'https://pinterest.com/ideas/');
  assert.equal(discApp.safeUrl('javascript:alert(1)', '/safe-fallback'), '/safe-fallback');
  assert.deepEqual(safeUrlDelegatedArgs, ['https://pinterest.com/ideas/', 'javascript:alert(1)']);

  // 4. Dashboard refreshAll() defers heavy ?limit=5000 / ?limit=1000 intersections on Overview, avoids duplicate /api/creators/boards, and aborts stale fetches on switchTab()
  const dashAsset = getClientJsAsset('dashboard');
  const dashFetchLog = [];
  const dashVm = {
    console,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout: () => 1,
    clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    window: {
      location: { origin: 'https://pae.example.com', pathname: '/', search: '' },
      history: { pushState: () => {}, replaceState: () => {} },
      scrollTo: () => {},
      PAE: { confirm: async () => true },
      apiFetch: async (url, opts = {}) => {
        dashFetchLog.push({ url: String(url), signal: opts?.signal || null });
        if (String(url).includes('/api/creators/detail')) {
          return new Response(JSON.stringify({
            profile: { id: 7, username: 'chef_amelia' },
            snapshots: [],
            boards: [{ id: 'b1', name: 'Dinners' }]
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          overview: { tracked_profiles: 25, combined_reach: 100000 },
          competitors: [{ id: 7, username: 'chef_amelia' }],
          keywords: [],
          boards: [{ id: 'b1', name: 'Dinners' }],
          pins: [],
          total: 0
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
  };
  dashVm.window.safeApiFetch = dashVm.window.apiFetch;
  dashVm.globalThis = dashVm;
  new vm.Script(dashAsset.code).runInNewContext(dashVm);

  const dash = dashVm.dashboardApp('');
  dash.$nextTick = () => {};
  await dash.refreshAll();

  const overviewUrls = dashFetchLog.map((e) => e.url);
  assert.equal(overviewUrls.some((u) => u.includes('/api/creators?limit=5000')), false, 'Initial overview must NOT eagerly fetch ?limit=5000 creators');
  assert.equal(overviewUrls.some((u) => u.includes('/api/intersections')), false, 'Initial overview must defer /api/intersections to related_pins tab');
  assert.equal(overviewUrls.some((u) => u.includes('/api/keywords?limit=1000')), false, 'Initial overview must NOT eagerly fetch ?limit=1000 keywords');
  assert.ok(overviewUrls.some((u) => u.includes('/api/creators?limit=12')), 'Overview should load lightweight creator preview');

  // Switching to creators_archive fetches full creators list and wires AbortSignal
  dashFetchLog.length = 0;
  dash.switchTab('creators_archive');
  await new Promise((r) => setTimeout(r, 10));
  const creatorsEntry = dashFetchLog.find((e) => e.url.includes('/api/creators?limit=5000'));
  assert.ok(creatorsEntry, 'Activating creators_archive tab must load full creators list');
  assert.ok(creatorsEntry.signal, 'fetchCompetitors must attach AbortSignal');

  // Opening creator page on boards tab reuses detail.boards without firing duplicate /api/creators/boards
  dashFetchLog.length = 0;
  await dash.openCreatorPage({ id: 7, username: 'chef_amelia' }, 'boards', false);
  const boardCalls = dashFetchLog.filter((e) => e.url.includes('/api/creators/boards'));
  assert.equal(boardCalls.length, 0, 'openCreatorPage(boards) must reuse detail.boards instead of duplicate /api/creators/boards fetch');
  assert.equal(dash.activeCreatorBoards.length, 1);

  // Switching back to overview aborts any in-flight creator requests
  let pendingSignal = null;
  dashVm.window.apiFetch = async (url, opts = {}) => {
    if (String(url).includes('/api/creators/top-urls')) {
      pendingSignal = opts.signal;
      return await new Promise((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
  dashVm.window.safeApiFetch = dashVm.window.apiFetch;
  const topUrlsPromise = dash.fetchCreatorTopUrls();
  assert.ok(pendingSignal, 'fetchCreatorTopUrls must attach AbortSignal');
  assert.equal(pendingSignal.aborted, false);
  dash.switchTab('overview');
  assert.equal(pendingSignal.aborted, true, 'Switching tabs must abort stale in-flight requests');
  await topUrlsPromise;

  // 5. app-sidebar.mjs (command-palette.js) coalesces/debounces redundant lucide.createIcons() calls
  const cmdAsset = getClientJsAsset('command-palette');
  let createIconsCalls = 0;
  const queuedTimers = [];
  const docEvents = {};
  const winEvents = {};
  const sidebarVm = {
    Date,
    setTimeout: (fn) => { queuedTimers.push(fn); return queuedTimers.length; },
    clearTimeout: (id) => { queuedTimers[id - 1] = null; },
    document: {
      readyState: 'loading',
      querySelector: () => ({ tagName: 'I' }),
      addEventListener: (ev, fn) => { docEvents[ev] = fn; }
    },
    window: {
      PAE: {},
      lucide: { createIcons: () => { createIconsCalls++; } },
      addEventListener: (ev, fn) => { winEvents[ev] = fn; }
    }
  };
  sidebarVm.globalThis = sidebarVm;
  new vm.Script(cmdAsset.code).runInNewContext(sidebarVm);

  // Simulate DOMContentLoaded + alpine:initialized + load firing in rapid succession
  docEvents.DOMContentLoaded?.();
  docEvents['alpine:initialized']?.();
  winEvents.load?.();
  for (const fn of queuedTimers) {
    if (typeof fn === 'function') fn();
  }
  assert.equal(createIconsCalls, 1, `Expected rapid lifecycle events to coalesce into 1 lucide.createIcons() call, got ${createIconsCalls}`);
});

test('Wave 4A.6: AbortController cancels stale in-flight requests on rapid switches in keywords, folders, domains, and newborn studios', async () => {
  const makeAbortableFetch = () => {
    const signals = [];
    const fn = async (_url, opts = {}) => {
      signals.push(opts?.signal || null);
      return await new Promise((resolve, reject) => {
        if (opts?.signal?.aborted) {
          const e = new Error('Aborted');
          e.name = 'AbortError';
          reject(e);
          return;
        }
        opts?.signal?.addEventListener?.('abort', () => {
          const e = new Error('Aborted');
          e.name = 'AbortError';
          reject(e);
        });
        setTimeout(() => {
          resolve(new Response(JSON.stringify({ success: true, keywords: [], folders: [], candidates: [], domains: [], clusters: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }));
        }, 25);
      });
    };
    return { fn, signals };
  };

  // 1. Keywords: rapid fetchKeywords() aborts prior request
  {
    const { fn, signals } = makeAbortableFetch();
    const ctx = {
      console,
      URLSearchParams,
      AbortController,
      localStorage: { getItem: () => null, setItem: () => {} },
      window: { location: { search: '' }, apiFetch: fn, safeApiFetch: fn }
    };
    ctx.globalThis = ctx;
    new vm.Script(getClientJsAsset('keywords').code).runInNewContext(ctx);
    const app = ctx.keywordStudio();
    app.$nextTick = () => {};
    app.showToast = () => {};
    const p1 = app.fetchKeywords();
    const p2 = app.fetchKeywords();
    assert.equal(signals.length, 2);
    assert.equal(signals[0]?.aborted, true, 'keywords: second fetchKeywords() must abort first signal');
    assert.equal(signals[1]?.aborted, false);
    await Promise.all([p1, p2]);
  }

  // 2. Folders: rapid runCrossoverAnalysis() aborts prior request
  {
    const { fn, signals } = makeAbortableFetch();
    const ctx = {
      console,
      AbortController,
      localStorage: { getItem: () => null, setItem: () => {} },
      window: { location: { pathname: '/folders/7', search: '' }, safeApiFetch: fn, apiFetch: fn }
    };
    ctx.globalThis = ctx;
    new vm.Script(getClientJsAsset('folders').code).runInNewContext(ctx);
    const app = ctx.foldersApp('7');
    app.showToast = () => {};
    app.computePowerPairs = () => {};
    const p1 = app.runCrossoverAnalysis(false);
    const p2 = app.runCrossoverAnalysis(true);
    assert.equal(signals.length, 2);
    assert.equal(signals[0]?.aborted, true, 'folders: second runCrossoverAnalysis() must abort first signal');
    assert.equal(signals[1]?.aborted, false);
    await Promise.all([p1, p2]);
  }

  // 3. Domains: switching openDossier() aborts prior dossier request
  {
    const { fn, signals } = makeAbortableFetch();
    const ctx = {
      console,
      AbortController,
      localStorage: { getItem: () => null, setItem: () => {} },
      window: { location: { pathname: '/domains', search: '' }, history: { pushState: () => {} }, safeApiFetch: fn, apiFetch: fn }
    };
    ctx.globalThis = ctx;
    new vm.Script(getClientJsAsset('domains').code).runInNewContext(ctx);
    const app = ctx.domainsApp('');
    app.showToast = () => {};
    const p1 = app.openDossier('first.example', false);
    const p2 = app.openDossier('second.example', false);
    assert.equal(signals.length, 2);
    assert.equal(signals[0]?.aborted, true, 'domains: switching openDossier() must abort first signal');
    assert.equal(signals[1]?.aborted, false);
    await Promise.all([p1, p2]);
  }

  // 4. Newborn: rapid loadCandidates() aborts prior request
  {
    const { fn, signals } = makeAbortableFetch();
    const ctx = {
      console,
      URLSearchParams,
      AbortController,
      localStorage: { getItem: () => null, setItem: () => {} },
      window: { location: { pathname: '/newborn', search: '' }, localStorage: { getItem: () => null }, safeApiFetch: fn, apiFetch: fn, PAE: { toast: () => {} } }
    };
    ctx.globalThis = ctx;
    new vm.Script(getClientJsAsset('newborn').code).runInNewContext(ctx);
    const app = ctx.newbornStudioApp('', 'hunt');
    app.refreshIcons = () => {};
    const p1 = app.loadCandidates();
    const p2 = app.loadCandidates();
    assert.equal(signals.length, 2);
    assert.equal(signals[0]?.aborted, true, 'newborn: second loadCandidates() must abort first signal');
    assert.equal(signals[1]?.aborted, false);
    await Promise.all([p1, p2]);
  }
});
