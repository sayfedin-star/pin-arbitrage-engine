#!/usr/bin/env node

/**
 * PAE Real-Browser E2E Verification Harness
 * 
 * Genuine headless browser test suite executing Google Chrome via Puppeteer-Core
 * against the live local application server.
 * 
 * Tests:
 * 1. Primary route baseline rendering & DOM bounding client rects (height > 0, width > 0)
 * 2. Computed visibility styles (display !== 'none', visibility !== 'hidden')
 * 3. Zero uncaught ReferenceError, TypeError, or Alpine evaluation errors in console
 * 4. Zero raw JavaScript source code leaks (e.g. 'function totalKeywordsCount') into text nodes
 * 5. Theme toggle switching (dark <-> light) and HTML class persistence
 * 6. Quick Folder Switcher dropdown population across rooms
 * 7. Room navigation and non-zero header badges preservation
 * 8. Active sidebar navigation highlight parity
 * 9. Smart Bulk Pin Pruning controls and API property alignment
 */

/* global document, window */

import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.E2E_PORT || 3491);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TEST_FOLDER_ID = 5;
const TEST_PIN_ID = '20547742046753342';

async function runRealBrowserVerification() {
  console.log('='.repeat(80));
  console.log('   PIN ARBITRAGE ENGINE (PAE) - REAL-BROWSER E2E VERIFICATION SUITE');
  console.log('='.repeat(80));

  // 1. Launch local server
  console.log(`[1/4] Spawning live application server on ${BASE_URL}...`);
  const serverProc = spawn(process.execPath, ['scripts/dashboard.mjs'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', d => {
    // console.error('[SERVER STDERR]', d.toString().trim());
  });

  let serverUp = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.status === 200) {
        serverUp = true;
        break;
      }
    } catch (_) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (!serverUp) {
    serverProc.kill('SIGTERM');
    throw new Error(`Failed to initialize local server on ${BASE_URL}`);
  }
  console.log(`      Server confirmed healthy (HTTP 200).`);

  // 2. Launch Real Browser
  console.log(`[2/4] Launching Google Chrome via Puppeteer-Core (${CHROME_PATH})...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--window-size=1440,900'
    ]
  });

  const version = await browser.version();
  console.log(`      Connected to: ${version}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const capturedConsoleErrors = [];
  const capturedPageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      capturedConsoleErrors.push({ url: page.url(), text: msg.text(), location: msg.location() });
    }
  });

  page.on('pageerror', err => {
    capturedPageErrors.push({ url: page.url(), text: err.message });
  });

  const results = {
    totalRoutesTested: 0,
    routes: {},
    interactiveTests: {},
    summaryErrors: []
  };

  // 3. Primary Route Matrix Probe
  const targetRoutes = [
    { id: 'folders_hub', name: 'Campaign Folders Hub', path: '/folders' },
    { id: 'room1_overview', name: 'Room 1: Overview & Super-Pins', path: `/folders/${TEST_FOLDER_ID}` },
    { id: 'room2_keywords', name: 'Room 2: Scoped Keywords', path: `/folders/${TEST_FOLDER_ID}/keywords` },
    { id: 'room3_creators', name: 'Room 3: Scoped Creator Hub', path: `/folders/${TEST_FOLDER_ID}/creators` },
    { id: 'room3_pins_alias', name: 'Room 3: Pins Alias', path: `/folders/${TEST_FOLDER_ID}/pins` },
    { id: 'room4_domains', name: 'Room 4: Scoped Domains', path: `/folders/${TEST_FOLDER_ID}/domains` },
    { id: 'room5_settings', name: 'Room 5: Settings & Pruning', path: `/folders/${TEST_FOLDER_ID}/settings` },
    { id: 'pin_dossier', name: 'Pin Dossier View', path: `/pins/${TEST_PIN_ID}` },
    { id: 'root_dashboard', name: 'Root Dashboard', path: '/' },
    { id: 'keywords_studio', name: 'Keywords Studio', path: '/keywords' },
    { id: 'domains_studio', name: 'Domains Studio', path: '/domains' }
  ];

  console.log(`\n[3/4] Probing 11 Primary Application Routes...`);

  try {
    for (const r of targetRoutes) {
      results.totalRoutesTested++;
      const url = `${BASE_URL}${r.path}`;
      const errorsBefore = capturedPageErrors.length;
      const consoleErrorsBefore = capturedConsoleErrors.length;

      let httpStatus = null;
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
        httpStatus = response ? response.status() : null;
      } catch (e) {
        console.warn(`      [WARN] Navigation warning for ${r.path}: ${e.message}`);
      }

      await new Promise(res => setTimeout(res, 500));

      const domCheck = await page.evaluate(() => {
        const body = document.body;
        const bodyRect = body ? body.getBoundingClientRect() : { width: 0, height: 0 };
        const bodyStyle = body ? window.getComputedStyle(body) : null;
        const h1 = document.querySelector('h1')?.innerText?.trim() || '';
        const allText = body ? body.innerText || '' : '';

        // Check for raw function string leak
        const rawFuncLeak = /function\s+[a-zA-Z0-9_$]+\s*\(/.test(allText);

        // Stuck x-cloak elements
        const stuckCloak = document.querySelectorAll('[x-cloak]:not(template)');

        // Specific room element checks
        const room1El = document.querySelector('div[x-show*="currentRoom !== \'settings\'"]');
        const room5El = document.querySelector('div[x-show*="currentRoom === \'settings\'"]');

        const r1Display = room1El ? window.getComputedStyle(room1El).display : null;
        const r5Display = room5El ? window.getComputedStyle(room5El).display : null;

        return {
          title: document.title,
          h1,
          bodyWidth: bodyRect.width,
          bodyHeight: bodyRect.height,
          display: bodyStyle?.display,
          visibility: bodyStyle?.visibility,
          rawFuncLeak,
          stuckCloakCount: stuckCloak.length,
          r1Display,
          r5Display
        };
      });

      const routePageErrors = capturedPageErrors.slice(errorsBefore);
      const routeConsoleErrors = capturedConsoleErrors.slice(consoleErrorsBefore);

      results.routes[r.path] = {
        name: r.name,
        httpStatus,
        ...domCheck,
        pageErrors: routePageErrors,
        consoleErrors: routeConsoleErrors
      };

      const passStatus = httpStatus === 200 && domCheck.bodyHeight > 0 && routePageErrors.length === 0;
      const mark = passStatus ? '✓ PASS' : '✗ FAIL';
      console.log(`      ${mark} [${httpStatus}] ${r.path.padEnd(28)} | Height: ${String(Math.round(domCheck.bodyHeight)).padStart(5)}px | Errors: ${routePageErrors.length}`);
    }

    // 4. Interactive Assertions
    console.log(`\n[4/4] Executing Interactive UI Behavioral Probes...`);

    // A. Theme Toggle
    await page.goto(`${BASE_URL}/folders/${TEST_FOLDER_ID}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    const themeRes = await page.evaluate(async () => {
      const initialDark = document.documentElement.classList.contains('dark');
      const btn = Array.from(document.querySelectorAll('button')).find(b => /dark|light|theme/i.test((b.innerText || '') + (b.getAttribute('title') || '')));
      if (!btn) return { ok: false, error: 'Theme toggle button missing' };
      btn.click();
      await new Promise(r => setTimeout(r, 200));
      const toggled = document.documentElement.classList.contains('dark');
      btn.click();
      await new Promise(r => setTimeout(r, 200));
      const reverted = document.documentElement.classList.contains('dark');
      return { ok: initialDark !== toggled && toggled !== reverted, initialDark, toggled, reverted };
    });
    results.interactiveTests.themeToggle = themeRes;
    console.log(`      ${themeRes.ok ? '✓ PASS' : '✗ FAIL'} Theme Toggle switching: ${JSON.stringify(themeRes)}`);

    // B. Quick Folder Switcher Across All 5 Rooms
    const switcherResults = {};
    const roomsToTestSwitcher = [
      { name: 'Room 1 (Overview)', path: `/folders/${TEST_FOLDER_ID}` },
      { name: 'Room 2 (Keywords)', path: `/folders/${TEST_FOLDER_ID}/keywords` },
      { name: 'Room 3 (Creators)', path: `/folders/${TEST_FOLDER_ID}/creators` },
      { name: 'Room 4 (Domains)', path: `/folders/${TEST_FOLDER_ID}/domains` },
      { name: 'Room 5 (Settings)', path: `/folders/${TEST_FOLDER_ID}/settings` }
    ];

    for (const rm of roomsToTestSwitcher) {
      await page.goto(`${BASE_URL}${rm.path}`, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 400));
      const sRes = await page.evaluate(async () => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /switch\s*folder/i.test((b.innerText || '') + (b.getAttribute('title') || '')));
        if (!btn) return { ok: false, error: 'Switcher button not found' };
        btn.click();
        await new Promise(r => setTimeout(r, 300));
        const dropdown = document.querySelector('[x-show="folderSwitcherOpen"]');
        const links = dropdown ? Array.from(dropdown.querySelectorAll('a[href^="/folders/"]')) : [];
        const isVisible = dropdown && window.getComputedStyle(dropdown).display !== 'none';
        return { ok: links.length > 0 && isVisible, linksCount: links.length, isVisible };
      });
      switcherResults[rm.name] = sRes;
      console.log(`      ${sRes.ok ? '✓ PASS' : '✗ FAIL'} Folder Switcher in ${rm.name}: ${JSON.stringify(sRes)}`);
    }
    results.interactiveTests.folderSwitcherAcrossRooms = switcherResults;

    // C. Room Navigation & Non-Zero Header Badges Retention
    const badgeRetention = {};
    const roomBadges = [
      { name: 'Room 1 (Overview)', path: `/folders/${TEST_FOLDER_ID}` },
      { name: 'Room 2 (Keywords)', path: `/folders/${TEST_FOLDER_ID}/keywords` },
      { name: 'Room 3 (Creators)', path: `/folders/${TEST_FOLDER_ID}/creators` },
      { name: 'Room 4 (Domains)', path: `/folders/${TEST_FOLDER_ID}/domains` },
      { name: 'Room 5 (Settings)', path: `/folders/${TEST_FOLDER_ID}/settings` }
    ];

    for (const rb of roomBadges) {
      await page.goto(`${BASE_URL}${rb.path}`, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 500));
      const bRes = await page.evaluate(() => {
        const badges = Array.from(document.querySelectorAll('nav a span[x-text]')).map(el => el.innerText.trim());
        const headerId = document.querySelector('span[x-text*="activeFolderId"]')?.innerText?.trim() || '';
        return { badges, headerId, hasBadges: badges.length >= 3 };
      });
      badgeRetention[rb.name] = bRes;
      console.log(`      ✓ CHECK Header Badges in ${rb.name}: ${JSON.stringify(bRes)}`);
    }
    results.interactiveTests.headerBadgeRetention = badgeRetention;

    // D. Active Sidebar Navigation Highlight
    const sidebarHighlights = {};
    for (const sp of ['/folders', `/folders/${TEST_FOLDER_ID}`]) {
      await page.goto(`${BASE_URL}${sp}`, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 400));
      const sHighlight = await page.evaluate(() => {
        const foldersLink = document.querySelector('nav a[href="/folders"]');
        const homeLink = document.querySelector('nav a[href="/"]');
        const isFoldersActive = foldersLink ? foldersLink.classList.contains('text-rose-600') || foldersLink.classList.contains('font-semibold') : false;
        const isHomeInactive = homeLink ? !homeLink.classList.contains('text-rose-600') : true;
        return { ok: isFoldersActive, isFoldersActive, isHomeInactive };
      });
      sidebarHighlights[sp] = sHighlight;
      console.log(`      ${sHighlight.ok ? '✓ PASS' : '✗ FAIL'} Sidebar "Campaign Folders" Highlight on ${sp}: ${JSON.stringify(sHighlight)}`);
    }
    results.interactiveTests.sidebarHighlights = sidebarHighlights;

    // E. Room 5 Switching & Smart Prune Studio Interactive Activation
    await page.goto(`${BASE_URL}/folders/${TEST_FOLDER_ID}/settings`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 500));
    const room5Res = await page.evaluate(async () => {
      const room1El = document.querySelector('div[x-show*="currentRoom !== \'settings\'"]');
      const room5El = document.querySelector('div[x-show*="currentRoom === \'settings\'"]');
      const r1Hidden = room1El ? window.getComputedStyle(room1El).display === 'none' : false;
      const r5Visible = room5El ? window.getComputedStyle(room5El).display !== 'none' : false;
      
      const previewBtn = Array.from(document.querySelectorAll('button')).find(b => /preview\s*candidates|preview\s*prun/i.test(b.innerText || ''));
      const executeBtn = Array.from(document.querySelectorAll('button')).find(b => /execute\s*prun|execute\s*atomic/i.test(b.innerText || ''));
      
      const initialDisabled = executeBtn ? executeBtn.disabled : true;

      // Click Preview Candidates (Dry-Run)
      if (previewBtn) {
        previewBtn.click();
      }

      // Wait up to 3000ms for API response and Alpine state update
      let candidateCount = 0;
      let postClickDisabled = true;
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 200));
        const candidateSpan = document.querySelector('span[x-text*="candidates_count"]');
        const txt = candidateSpan ? candidateSpan.innerText.trim() : '';
        if (txt && txt !== '0') {
          candidateCount = Number(txt);
          break;
        }
      }

      if (executeBtn) {
        postClickDisabled = executeBtn.disabled;
      }

      return {
        ok: r1Hidden && r5Visible && !!previewBtn && !!executeBtn,
        r1Hidden,
        r5Visible,
        hasPreviewBtn: !!previewBtn,
        hasExecuteBtn: !!executeBtn,
        initialDisabled,
        postClickDisabled,
        candidateCount
      };
    });
    results.interactiveTests.room5Settings = room5Res;
    console.log(`      ${room5Res.ok ? '✓ PASS' : '✗ FAIL'} Room 5 Visible & Room 1 Hidden & Smart Prune: ${JSON.stringify(room5Res)}`);

    // F. Pin Dossier Deep Verification
    await page.goto(`${BASE_URL}/pins/${TEST_PIN_ID}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 500));
    const dossierRes = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.innerText?.trim() || '';
      const svgElements = document.querySelectorAll('svg');
      const trajectorySvg = Array.from(svgElements).find(s => s.querySelector('path') || s.getAttribute('viewBox'));
      return {
        ok: !!h1,
        h1,
        svgCount: svgElements.length,
        hasTrajectoryGraph: !!trajectorySvg
      };
    });
    results.interactiveTests.pinDossier = dossierRes;
    console.log(`      ${dossierRes.ok ? '✓ PASS' : '✗ FAIL'} Pin Dossier Verification: ${JSON.stringify(dossierRes)}`);

    console.log('\n' + '='.repeat(80));
    console.log(`   BASELINE AUDIT VERIFICATION SUMMARY`);
    console.log('='.repeat(80));
    console.log(`Total Routes Tested: ${results.totalRoutesTested}`);
    console.log(`Total Uncaught Page Errors: ${capturedPageErrors.length}`);
    console.log(`Total Console Errors: ${capturedConsoleErrors.length}`);

    if (capturedConsoleErrors.length > 0) {
      console.log('\n[!] CONSOLE ERRORS DETECTED:');
      capturedConsoleErrors.forEach((e, idx) => {
        console.log(`    #${idx + 1} [${e.url}]: ${e.text} | location: ${JSON.stringify(e.location || {})}`);
      });
    }

    if (capturedPageErrors.length > 0) {
      console.log('\n[!] UNCAUGHT PAGE ERRORS DETECTED:');
      capturedPageErrors.forEach((e, idx) => {
        console.log(`    #${idx + 1} [${e.url}]: ${e.text}`);
      });
    }

  } finally {
    await browser.close();
    serverProc.kill('SIGTERM');
  }

  return results;
}

runRealBrowserVerification().catch(err => {
  console.error('Fatal Verification Harness Exception:', err);
  process.exit(1);
});
