import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { safeUrl, safeColor } from '../src/ui/shared-formatters.mjs';
import { renderCampaignWorkspaceHeader } from '../src/ui/campaign-workspace-header.mjs';
import { getPulsePageHtml } from '../src/pulse-ui.mjs';
import { getDiscoveryPageHtml } from '../src/discovery-ui.mjs';
import { getCampaignFoldersPageHtml } from '../src/campaign-folders-ui.mjs';
import { getDomainsPageHtml } from '../src/domains-ui.mjs';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';
import { getKeywordsPageHtml } from '../src/keywords-ui.mjs';
import { getPinDetailPageHtml } from '../src/pin-details-ui.mjs';
import { renderAppSidebar } from '../src/ui/app-sidebar.mjs';

function extractFunctionFromHtml(html, fnName) {
  const scriptTags = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  const target = scriptTags.find((s) => s.includes(`function ${fnName}`));
  assert.ok(target, `Expected <script> block containing function ${fnName}`);
  const code = target.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
  const ctx = {
    window: {
      resolvePinImageUrl: (u) => u || '',
      handlePinImgError: () => {},
      addEventListener: () => {},
      location: { pathname: '/', search: '', href: 'http://localhost:3000/' }
    },
    document: {
      documentElement: { classList: { add: () => {}, remove: () => {} } },
      readyState: 'complete',
      addEventListener: () => {}
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    URLSearchParams,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    console
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { fn: ctx[fnName], ctx };
}

test('shared-formatters safeColor allows valid CSS colors and blocks CSS injection payloads', () => {
  assert.equal(safeColor('#e11d48'), '#e11d48');
  assert.equal(safeColor('#abc'), '#abc');
  assert.equal(safeColor('#aabbcc80'), '#aabbcc80');
  assert.equal(safeColor('rgb(10, 20, 30)'), 'rgb(10, 20, 30)');
  assert.equal(safeColor('rgba(10, 20, 30, 0.5)'), 'rgba(10, 20, 30, 0.5)');
  assert.equal(safeColor('emerald'), 'emerald');

  // CSS/attribute injection vectors must fall back cleanly
  assert.equal(safeColor('red; background-image: url(https://evil.test)'), '#cbd5e1');
  assert.equal(safeColor('#fff" onclick="alert(1)'), '#cbd5e1');
  assert.equal(safeColor('expression(alert(1))'), '#cbd5e1');
  assert.equal(safeColor(null, '#6366f1'), '#6366f1');
});

test('shared-formatters safeUrl blocks javascript: and data:text/html schemes', () => {
  assert.equal(safeUrl('https://pinterest.com/pin/123'), 'https://pinterest.com/pin/123');
  assert.equal(safeUrl('/folders/42'), '/folders/42');
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('  JaVaScRiPt:alert(1) '), '#');
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '#');
  assert.equal(safeUrl(''), '#');
});

test('renderCampaignWorkspaceHeader escapes HTML/JS XSS payloads and sanitizes folder color', () => {
  const html = renderCampaignWorkspaceHeader({
    activeRoom: 'crossover',
    folderId: "42'><script>alert(1)</script>",
    folder: {
      name: '<img src=x onerror="alert(1)">',
      description: "Test 'desc' & \"quotes\"",
      icon: '<b>',
      color: '#123456; background: url(javascript:alert(1))'
    }
  });

  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('background: url(javascript:alert(1))') === false);
  assert.ok(html.includes('#E11D4820'));
  assert.ok(html.includes('Lock 1: Unclipped Header Wrapper'));
});

test('pulseStudioApp injects safeApiFetch, enforces safeUrl/safeColor, and keeps matrix getters pure', () => {
  const html = getPulsePageHtml('12');
  assert.ok(html.includes('window.safeApiFetch'), 'Pulse HTML must inject Edge-Shield safeApiFetch');

  const { fn: pulseStudioApp } = extractFunctionFromHtml(html, 'pulseStudioApp');
  const app = pulseStudioApp('12');

  // Verify safeUrl and safeColor allowlists work properly (proper regex escaping in template literal)
  assert.equal(app.safeUrl('https://www.pinterest.com/pin/123/'), 'https://www.pinterest.com/pin/123/');
  assert.equal(app.safeUrl('/pin/123'), '/pin/123');
  assert.equal(app.safeUrl('javascript:alert(1)'), '#');
  assert.equal(app.safeColor('#e11d48'), '#e11d48');
  assert.equal(app.safeColor('red; position:fixed', '#cbd5e1'), '#cbd5e1');

  // Pure getters must not mutate selectedMatrixItem when unset
  app.annotation_crossovers.pair_crossovers = [
    { pair: 'easy + dinner', pin_count: 5, matching_pins: [{ pin_id: '1', image_url: 'https://i.pinimg.com/236x/a.jpg' }] }
  ];
  assert.equal(app.selectedMatrixItem, null);
  const entities = app.getMatrixEntities();
  assert.equal(entities.length, 1);
  assert.equal(app.selectedMatrixItem, null, 'getMatrixEntities must remain a pure getter without state mutation');

  const pins = app.getSelectedMatrixPins();
  assert.equal(pins.length, 1);
  assert.equal(app.selectedMatrixItem, null, 'getSelectedMatrixPins must fall back to entities[0] without mutating state');
});

test('Discovery, Folders, and Domains UI Alpine scripts evaluate safeUrl and safeColor without regex escaping bugs', () => {
  const discoveryHtml = getDiscoveryPageHtml();
  const { ctx: discCtx } = extractFunctionFromHtml(discoveryHtml, 'discoveryApp');
  assert.equal(discCtx.safeUrl('https://pinterest.com/ideas/'), 'https://pinterest.com/ideas/');
  assert.equal(discCtx.safeUrl('/keywords/test'), '/keywords/test');
  assert.equal(discCtx.safeUrl('javascript:alert(1)'), '#');
  assert.equal(discCtx.safeUrl('ftp://evil.example/file'), '#');

  const foldersHtml = getCampaignFoldersPageHtml();
  const { fn: foldersApp } = extractFunctionFromHtml(foldersHtml, 'foldersApp');
  const fApp = foldersApp('');
  assert.equal(fApp.safeUrl('https://pinterest.com/pin/999/'), 'https://pinterest.com/pin/999/');
  assert.equal(fApp.safeUrl('javascript:alert(1)'), '#');
  assert.equal(fApp.safeColor('#6366f1'), '#6366f1');
  assert.equal(fApp.safeColor('invalid;color', '#6366f1'), '#6366f1');

  const domainsHtml = getDomainsPageHtml();
  const { fn: domainsApp } = extractFunctionFromHtml(domainsHtml, 'domainsApp');
  const dApp = domainsApp('', '');
  assert.equal(dApp.safeUrl('https://example.com/post'), 'https://example.com/post');
  assert.equal(dApp.safeUrl('data:text/html,hi'), '#');
  assert.equal(dApp.safeColor('#10b981'), '#10b981');
  assert.equal(dApp.safeColor('red;color:blue', '#888888'), '#888888');
});

test('Migration 063 hardens clean_domain regex, advisory locks, duplicate index drops, and fillfactor', () => {
  const mig063Path = path.resolve(process.cwd(), 'scripts/migrations/063_forensic_audit_hardening.sql');
  assert.equal(fs.existsSync(mig063Path), true, 'Migration 063 must exist');
  const mig063 = fs.readFileSync(mig063Path, 'utf8');

  assert.match(mig063, /\^www\\\./, 'pae_sync_clean_domain trigger must escape dot in ^www\\.');
  assert.match(mig063, /pg_advisory_xact_lock/, 'pae_sync_canonical_keyword trigger must take advisory xact lock');
  assert.match(mig063, /DROP INDEX IF EXISTS (?:public\.)?idx_competitor_history_date/i);
  assert.match(mig063, /DROP INDEX IF EXISTS (?:public\.)?idx_kip_keyword_pin/i);
  assert.match(mig063, /DROP INDEX IF EXISTS (?:public\.)?idx_tracked_keywords_keyword/i);
  assert.match(mig063, /DROP INDEX IF EXISTS (?:public\.)?idx_fpd_folder_id/i);
  assert.match(mig063, /ALTER TABLE (?:public\.)?domain_intelligence_rollup SET \(fillfactor = 80\)/i);
});

test('All studio pages enclose app-sidebar inside x-data defining isSidebarCollapsed and never place x-show directly on data-lucide <i> tags', () => {
  const sidebarHtml = renderAppSidebar({ activeNav: 'overview' });
  assert.equal(/<i[^>]*\bx-show=[^>]*data-lucide=/i.test(sidebarHtml), false, 'app-sidebar must wrap x-show icons in <span>');
  assert.equal(/<i[^>]*data-lucide=[^>]*\bx-show=/i.test(sidebarHtml), false, 'app-sidebar must wrap x-show icons in <span>');

  const pages = [
    { name: 'dashboard', html: getDashboardHtml(''), fn: 'dashboardApp', args: [''] },
    { name: 'pulse', html: getPulsePageHtml(''), fn: 'pulseStudioApp', args: [''] },
    { name: 'domains', html: getDomainsPageHtml('', ''), fn: 'domainsApp', args: ['', ''] },
    { name: 'folders', html: getCampaignFoldersPageHtml(), fn: 'foldersApp', args: [''] },
    { name: 'keywords', html: getKeywordsPageHtml(), fn: 'keywordStudio', args: [] },
    { name: 'discovery', html: getDiscoveryPageHtml(), fn: 'discoveryApp', args: [] },
    { name: 'pin-details', html: getPinDetailPageHtml('1234567890'), fn: 'pinDetailApp', args: ['1234567890'] }
  ];

  for (const page of pages) {
    assert.match(page.html, /<body[^>]*\bx-data="/i, `${page.name} <body> must declare x-data`);
    assert.equal(/<i[^>]*\bx-show=[^>]*data-lucide=/i.test(page.html), false, `${page.name} must not put x-show directly on <i data-lucide>`);
    assert.equal(/<i[^>]*data-lucide=[^>]*\bx-show=/i.test(page.html), false, `${page.name} must not put x-show directly on <i data-lucide>`);

    const { fn } = extractFunctionFromHtml(page.html, page.fn);
    const state = fn(...page.args);
    assert.equal(typeof state.isSidebarCollapsed, 'boolean', `${page.name} (${page.fn}) must define boolean isSidebarCollapsed`);
    assert.equal(typeof state.isMobileMenuOpen, 'boolean', `${page.name} (${page.fn}) must define boolean isMobileMenuOpen`);
    assert.equal(typeof state.toggleSidebar, 'function', `${page.name} (${page.fn}) must define toggleSidebar()`);
  }
});

