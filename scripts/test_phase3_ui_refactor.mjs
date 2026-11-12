import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { renderPinRowTemplate } from '../src/ui/pin-row.mjs';
import { renderAppSidebar } from '../src/ui/app-sidebar.mjs';
import {
  renderPinDossierDrawer,
  renderPinDossierHeader,
  renderPinDossierTextBlock,
  renderPinDossierKpiGrid
} from '../src/ui/pin-dossier-drawer.mjs';
import { getKeywordDrawersAndModalsHtml } from '../src/ui/keywords-drawers.mjs';
import { getDashboardModalsHtml } from '../src/ui/dashboard-modals.mjs';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';
import { getEdgeShieldClientScript } from '../src/edge-shield-client.mjs';

const readText = (relPath) => fs.readFileSync(path.resolve(relPath), 'utf8');

test('Step 3.1: renderPinRowTemplate is imported and invoked across all 6 target screens', () => {
  const screenFiles = [
    'src/pulse-ui.mjs',
    'src/ui/keywords/keywords-serp-studio.mjs',
    'src/ui/folders/folders-studio-view.mjs',
    'src/ui/domains/domains-studio-view.mjs',
    'src/ui/dashboard/dashboard-related-pins.mjs',
    'src/ui/dashboard/dashboard-creators.mjs'
  ];

  for (const file of screenFiles) {
    const code = readText(file);
    assert.ok(code.includes('renderPinRowTemplate'), `${file} must import and invoke renderPinRowTemplate`);
  }

  const defaultRow = renderPinRowTemplate();
  assert.ok(defaultRow.includes('pin.pin_id'), 'default row must preserve pin.pin_id binding');
  assert.ok(defaultRow.includes('tabular-nums'), 'default row must preserve tabular-nums styling');

  const customRow = renderPinRowTemplate({
    pinVar: 'item',
    pinIdExpr: 'item.candidate_pin_id',
    extraCellsAfterRepins: '<td class="custom-slot">EXTRA</td>',
    extraCellsBeforeAge: '<td class="age-slot">PRE-AGE</td>'
  });
  assert.ok(customRow.includes('item.candidate_pin_id'), 'custom pinIdExpr must be rendered');
  assert.ok(customRow.includes('<td class="custom-slot">EXTRA</td>'), 'extraCellsAfterRepins slot must render');
  assert.ok(customRow.includes('<td class="age-slot">PRE-AGE</td>'), 'extraCellsBeforeAge slot must render');
});

test('Step 3.2: Dashboard unifies sidebar via renderAppSidebar({ isDashboardSpa: true })', () => {
  const dashUi = readText('src/dashboard-ui.mjs');
  assert.ok(dashUi.includes('renderAppSidebar({'), 'src/dashboard-ui.mjs must call renderAppSidebar');
  assert.ok(dashUi.includes('isDashboardSpa: true'), 'src/dashboard-ui.mjs must pass isDashboardSpa: true');

  const spaSidebar = renderAppSidebar({ activeNav: 'overview', isDashboardSpa: true, refreshHandler: 'refreshAll()' });
  assert.ok(spaSidebar.includes("switchTab('overview')"), 'SPA sidebar must include overview tab switch');
  assert.ok(spaSidebar.includes("switchTab('related_pins')"), 'SPA sidebar must include related_pins tab switch');
  assert.ok(spaSidebar.includes("switchTab('creators_archive')"), 'SPA sidebar must include creators_archive tab switch');
  assert.ok(spaSidebar.includes('crawlStatus.is_crawling'), 'SPA sidebar must surface active crawl telemetry');

  const mpaSidebar = renderAppSidebar({ activeNav: 'pulse', isDashboardSpa: false });
  assert.ok(mpaSidebar.includes('href="/pulse"'), 'MPA sidebar must keep standard anchor navigation');

  const fullDashHtml = getDashboardHtml();
  assert.ok(fullDashHtml.includes("switchTab('related_pins')"), 'Full dashboard HTML must render unified SPA sidebar');
});

test('Step 3.3: Shared slide-over Pin Dossier Drawer serves both Keywords and Dashboard without forbidden patterns', () => {
  const drawerSource = readText('src/ui/pin-dossier-drawer.mjs');
  const keywordsDrawersSource = readText('src/ui/keywords-drawers.mjs');
  const dashboardModalsSource = readText('src/ui/dashboard-modals.mjs');

  assert.ok(keywordsDrawersSource.includes("from './pin-dossier-drawer.mjs'"), 'keywords-drawers.mjs must import pin-dossier-drawer.mjs');
  assert.ok(dashboardModalsSource.includes("from './pin-dossier-drawer.mjs'"), 'dashboard-modals.mjs must import pin-dossier-drawer.mjs');

  // Lock 14F & test_p0_hotfixes regression invariants
  assert.equal(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(drawerSource), false, 'pin-dossier-drawer.mjs must contain zero Arabic characters');
  assert.equal(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(dashboardModalsSource), false, 'dashboard-modals.mjs must contain zero Arabic characters');
  assert.equal(drawerSource.includes('activeFolderId'), false, 'pin-dossier-drawer.mjs must not reference activeFolderId');
  assert.equal(keywordsDrawersSource.includes('activeFolderId'), false, 'keywords-drawers.mjs must not reference activeFolderId');

  const keywordsHtml = getKeywordDrawersAndModalsHtml();
  assert.ok(keywordsHtml.includes('aria-label="Pin Deep Dossier"'), 'Keywords drawer must render Pin Deep Dossier dialog');
  assert.ok(keywordsHtml.includes('Creative Performance KPIs'), 'Keywords drawer must render shared KPI grid');

  const dashModalsHtml = getDashboardModalsHtml();
  assert.ok(dashModalsHtml.includes('aria-label="Candidate Pin Deep-Inspection Dossier"'), 'Dashboard modals must render Candidate Dossier dialog');
  assert.ok(dashModalsHtml.includes('aria-label="Pixie Gravitational Centroid Dossier"'), 'Dashboard modals must render Pixie Centroid Dossier dialog');

  // Direct unit check on drawer helpers
  const sample = renderPinDossierDrawer({
    showExpr: 'isOpen',
    closeExpr: 'isOpen = false',
    ariaLabel: 'Sample Drawer',
    headerHtml: renderPinDossierHeader({ titleHtml: '<h3>Sample</h3>', closeExpr: 'isOpen = false' }),
    bodyHtml: renderPinDossierTextBlock({ title: 'OCR', bodyTextExpr: 'pin.ocr' }) +
      renderPinDossierKpiGrid({ items: [{ label: 'Saves', valueExpr: 'pin.saves' }] })
  });
  assert.ok(sample.includes('role="dialog"') && sample.includes('aria-modal="true"'));
  assert.ok(sample.includes('tabular-nums'));
});

test('Step 3.4: Zero blocking alert() calls in Dashboard client and async Toast UI is present', () => {
  const clientFiles = [
    'src/ui/dashboard/dashboard-client-app.mjs',
    'src/ui/dashboard/dashboard-client-intersections.mjs',
    'src/ui/dashboard/dashboard-client-archive-rules.mjs',
    'src/ui/dashboard/dashboard-client-seeds.mjs'
  ];

  for (const file of clientFiles) {
    const code = readText(file);
    assert.equal(/\balert\s*\(/.test(code), false, `${file} must have zero blocking alert() calls`);
  }

  const clientAppCode = readText('src/ui/dashboard/dashboard-client-app.mjs');
  assert.ok(clientAppCode.includes("showToast(msg, type = 'success')"), 'dashboard-client-app.mjs must support typed async toasts');

  const dashHtml = getDashboardHtml();
  assert.ok(dashHtml.includes('role="status"') && dashHtml.includes('aria-live="polite"'), 'Toast notification banner must expose accessible live region');
});

test('Step 3.5: Ghost hover prefetch and getFastEdgeDossier are cleanly removed', () => {
  const edgeClient = readText('src/edge-shield-client.mjs');
  assert.equal(edgeClient.includes('hoverPrefetchTimer'), false, 'hoverPrefetchTimer must be removed from edge-shield-client.mjs');
  assert.equal(edgeClient.includes('warmCache'), false, 'warmCache hover trigger must be removed');
  assert.equal(edgeClient.includes("addEventListener('mouseover'"), false, 'mouseover prefetch listener must be removed');

  const runtimeEdgeScript = getEdgeShieldClientScript();
  assert.ok(runtimeEdgeScript.includes('window.safeApiFetch'), 'safeApiFetch must remain intact');

  for (const backendFile of [
    'src/modules/sharding/fleet-router.mjs',
    'src/routes/pins.mjs',
    'src/worker.mjs',
    'src/plugins/api-routes.mjs'
  ]) {
    const code = readText(backendFile);
    assert.equal(code.includes('getFastEdgeDossier'), false, `${backendFile} must not reference removed getFastEdgeDossier`);
    assert.equal(code.includes('prefetch=true'), false, `${backendFile} must not gate on ?prefetch=true`);
  }
});

test('Step 3.6 & 3.7: Dashboard Overview replaces hardcoded fallbacks with explicit skeletons and client logic is modularized', () => {
  const overviewHtml = readText('src/ui/dashboard/dashboard-overview.mjs');
  for (const fakeLiteral of ['13895921', '1301989', '32.5k Pins Monitored', '|| 4', '|| 0.6']) {
    assert.equal(overviewHtml.includes(fakeLiteral), false, `dashboard-overview.mjs must not contain misleading literal ${fakeLiteral}`);
  }
  assert.ok(overviewHtml.includes('!isOverviewLoaded'), 'dashboard-overview.mjs must gate KPI cards on isOverviewLoaded');
  assert.ok(overviewHtml.includes('animate-pulse'), 'dashboard-overview.mjs must render explicit animate-pulse skeleton loaders');

  const clientSubmodules = [
    'src/ui/dashboard/dashboard-client-intersections.mjs',
    'src/ui/dashboard/dashboard-client-archive-rules.mjs',
    'src/ui/dashboard/dashboard-client-seeds.mjs'
  ];
  for (const sub of clientSubmodules) {
    assert.ok(fs.existsSync(path.resolve(sub)), `${sub} must exist`);
    const lines = readText(sub).split('\n').length;
    assert.ok(lines <= 600, `${sub} must stay modular (<= 600 lines, got ${lines})`);
  }
});
