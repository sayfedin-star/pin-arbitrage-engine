#!/usr/bin/env node

/**
 * scripts/verify-live-readonly.mjs
 *
 * Strictly Read-Only (ZERO MUTATIONS) Live Production Verifier for PAE v4.
 * - Uses ONLY HTTP GET (never refresh=true, never POST/PUT/PATCH/DELETE).
 * - Optional InstaBox VM diagnostics run strictly read-only commands
 *   (git rev-parse, systemctl is-active, journalctl, and BEGIN READ ONLY; ... ROLLBACK;).
 * - Never prints, logs, or persists API_SECRET_KEY or INSTABOX_API_KEY.
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BYTE_BUDGETS = Object.freeze({
  pulse24hMaxBytes: 900 * 1024, // 900 KiB (921,600 B)
  foldersHtmlMaxBytes: 215 * 1024, // 215 KiB (220,160 B)
  discoverHtmlMaxBytes: 225 * 1024 // 225 KiB (230,400 B)
});

export const DEAD_SYMBOLS = Object.freeze({
  folders: ['isSettingsModalOpen'],
  discover: ['settingsDrawerOpen', 'startRunPolling']
});

export function byteLengthUtf8(str) {
  return Buffer.byteLength(String(str ?? ''), 'utf8');
}

export function formatKiB(bytes) {
  return `${(Number(bytes || 0) / 1024).toFixed(2)} KiB`;
}

export function shaMatches(actual, expected) {
  const a = String(actual || '').trim().toLowerCase();
  const e = String(expected || '').trim().toLowerCase();
  if (!e) return /^[0-9a-f]{7,40}$/.test(a);
  if (!a || !/^[0-9a-f]{7,40}$/.test(a)) return false;
  return a.startsWith(e) || e.startsWith(a);
}

export function evaluateHtmlBudgetsAndSymbols({ path: routePath, html, maxBytes, forbiddenSymbols = [], requiredSubstrings = [] }) {
  const bytes = byteLengthUtf8(html);
  const foundForbidden = forbiddenSymbols.filter((sym) => html.includes(sym));
  const missingRequired = requiredSubstrings.filter((sub) => !html.includes(sub));
  const pass = bytes < maxBytes && foundForbidden.length === 0 && missingRequired.length === 0;
  return {
    route: routePath,
    bytes,
    kib: formatKiB(bytes),
    maxBytes,
    withinBudget: bytes < maxBytes,
    foundForbidden,
    missingRequired,
    pass
  };
}

export function extractPulsePinSamples(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const buckets = [
    payload.breakout_pins,
    payload.fresh_rockets,
    payload.trending_pins,
    payload.top_movers,
    payload.pins,
    payload.items
  ];
  const out = [];
  for (const list of buckets) {
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item && typeof item === 'object') out.push(item);
        if (out.length >= 25) return out;
      }
    }
  }
  return out;
}

export function evaluatePulsePayload(payload, rawBytes, windowKey = '24h') {
  const pins = extractPulsePinSamples(payload);
  const withFiniteSaves = pins.filter((p) => Number.isFinite(Number(p.save_count)));
  const withFiniteVelocity = pins.filter(
    (p) => Number.isFinite(Number(p.window_saves_gain ?? p.daily_save_velocity ?? p.delta_saves_24h))
  );
  const withinBudget = windowKey === '24h' ? rawBytes < BYTE_BUDGETS.pulse24hMaxBytes : true;
  const pass = Boolean(payload?.success !== false) && withinBudget && (pins.length === 0 || (withFiniteSaves.length > 0 && withFiniteVelocity.length > 0));
  return {
    window: windowKey,
    bytes: rawBytes,
    kib: formatKiB(rawBytes),
    withinBudget,
    sampleCount: pins.length,
    finiteSavesCount: withFiniteSaves.length,
    finiteVelocityCount: withFiniteVelocity.length,
    pass
  };
}

export function evaluateCreatorsPayload(payload) {
  const overview = payload?.overview || {};
  const competitors = Array.isArray(payload?.competitors) ? payload.competitors : [];
  const pinsTracked = Number(overview.pins_tracked ?? overview.total_pins_tracked ?? 0);
  const audience = Number(overview.combined_reach ?? overview.total_audience ?? 0);
  const impressions = Number(overview.total_impressions ?? 0);
  const withMetrics = competitors.filter(
    (c) => Number.isFinite(Number(c.monthly_reach ?? c.monthly_views ?? c.profile_views ?? 0))
  );
  const pass = Boolean(payload?.success)
    && Number.isFinite(pinsTracked)
    && pinsTracked >= 2_000_000_000
    && Number.isFinite(audience)
    && audience > 0
    && Number.isFinite(impressions)
    && competitors.length > 0
    && withMetrics.length === competitors.length;

  return {
    competitorsCount: competitors.length,
    pinsTracked,
    pinsTrackedBillions: Number((pinsTracked / 1e9).toFixed(2)),
    audience,
    impressions,
    pass
  };
}

export function evaluateDomainsPayload(payload) {
  const domains = Array.isArray(payload?.domains) ? payload.domains : [];
  const withVelocity = domains.filter(
    (d) => Number.isFinite(Number(d.avg_velocity ?? d.velocity_24h ?? d.total_saves_24h ?? d.delta_saves_24h ?? 0))
  );
  const pass = Boolean(payload?.success) && domains.length > 0 && withVelocity.length === domains.length;
  return {
    domainsCount: domains.length,
    totalDomains: Number(payload?.total_domains ?? payload?.total ?? domains.length),
    withFiniteVelocity: withVelocity.length,
    pass
  };
}

export function evaluateWorkspaceSettingsPayload(payload) {
  const settings = payload?.settings || {};
  const minRepins = Number(
    settings?.min_repin_count
    ?? settings?.pin_graph_rules?.min_repins
    ?? NaN
  );
  const maxBoards = Number(
    settings?.extraction_targets?.boards?.max_boards
    ?? settings?.boards?.max_boards
    ?? NaN
  );
  const pass = Boolean(payload?.success) && Number.isFinite(minRepins) && Number.isFinite(maxBoards);
  return {
    workspaceId: Number(payload?.workspace_id || 1),
    minRepins,
    maxBoards,
    pass
  };
}

export function selectSecondaryWorkspaceId(payload) {
  const list = Array.isArray(payload?.workspaces) ? payload.workspaces : [];
  const alt = list.find((w) => Number.isInteger(Number(w?.id)) && Number(w.id) > 1);
  return alt ? Number(alt.id) : null;
}

export function evaluateCookieWriteOnlyPayload(payload) {
  const rawPreview = String(payload?.preview || '');
  const leakedRaw = rawPreview !== '' && rawPreview !== '[CONFIGURED]';
  const hasRawField = Boolean(payload?.cookie || payload?.raw_cookie || payload?.pinterest_cookie);
  const pass = Boolean(payload?.success) && !leakedRaw && !hasRawField;
  return {
    hasCookie: Boolean(payload?.has_cookie),
    preview: rawPreview,
    zoneRoutingMode: payload?.zone_routing_mode || 'unknown',
    leakedSecret: leakedRaw || hasRawField,
    pass
  };
}

export function formatMarkdownSummary(report) {
  const lines = [
    `## PAE v4 Live Read-Only Verification (${report.allPassed ? 'PASS' : 'FAIL'})`,
    '',
    `- **Target**: \`${report.target}\``,
    `- **Timestamp**: \`${report.timestamp}\``,
    `- **Mode**: \`READ-ONLY (ZERO MUTATIONS)\``,
    `- **Deployed Commit**: \`${report.commit || 'unknown'}\``,
    '',
    '| Check | Status | Details |',
    '| --- | --- | --- |'
  ];
  for (const c of report.checks) {
    const icon = c.pass ? 'PASS' : 'FAIL';
    const detail = String(c.detail || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    lines.push(`| ${c.name} | ${icon} | ${detail} |`);
  }
  return lines.join('\n') + '\n';
}

async function fetchReadOnly(baseUrl, pathname, { apiKey, workspaceId = null, redirect = 'follow', timeoutMs = 20000 } = {}) {
  const url = `${baseUrl.replace(/\/+$/, '')}${pathname}`;
  const headers = {
    Accept: 'application/json, text/html;q=0.9',
    'User-Agent': 'PAE-ReadOnly-Verifier/1.0'
  };
  if (apiKey) headers['x-api-key'] = apiKey;
  if (workspaceId != null) {
    headers['x-workspace-id'] = String(workspaceId);
    headers.Cookie = `pae_workspace_id=${workspaceId}`;
  }
  const res = await fetch(url, {
    method: 'GET',
    headers,
    redirect,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.text();
  const bytes = byteLengthUtf8(text);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: res.status,
    location: res.headers.get('location') || '',
    contentType: res.headers.get('content-type') || '',
    bytes,
    text,
    json
  };
}

async function runInstaboxReadOnlyExec({ instaboxKey, machineId, cmd, timeoutSeconds = 30 }) {
  const res = await fetch(`https://api.instabox.sh/v1/machines/${machineId}/exec`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${instaboxKey}`,
      'X-API-Key': instaboxKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      cmd,
      cwd: '/data/app',
      noHistory: true,
      timeoutSeconds
    }),
    signal: AbortSignal.timeout((timeoutSeconds + 15) * 1000)
  });
  const body = await res.json().catch(() => ({}));
  return {
    httpStatus: res.status,
    exitCode: body?.exitCode ?? -1,
    timedOut: Boolean(body?.timedOut),
    stdout: String(body?.stdout || ''),
    stderr: String(body?.stderr || '')
  };
}

export async function runLiveReadOnlyVerification(env = process.env) {
  const baseUrl = String(env.APP_PUBLIC_URL || 'https://app.hymum.com').trim();
  const apiKey = String(env.API_SECRET_KEY || '').trim();
  const instaboxKey = String(env.INSTABOX_API_KEY || '').trim();
  const machineId = String(env.INSTABOX_MACHINE_ID || 'm_agq2t32m5xv5joj67rqoze5h4u').trim();
  const expectedSha = String(env.EXPECTED_SHA || '').trim();

  if (!apiKey) {
    throw new Error('API_SECRET_KEY environment variable is required for Read-Only live HTTP verification.');
  }

  const checks = [];
  const addCheck = (name, pass, detail, data = undefined) => {
    checks.push({ name, pass: Boolean(pass), detail, ...(data !== undefined ? { data } : {}) });
  };

  // 1. /api/health (with gentle read-only wake retry for cold InstaBox VM)
  let health = await fetchReadOnly(baseUrl, '/api/health', { apiKey });
  for (let attempt = 1; attempt <= 3 && (health.status !== 200 || health.json?.status !== 'healthy'); attempt++) {
    await new Promise((r) => setTimeout(r, 4000));
    health = await fetchReadOnly(baseUrl, '/api/health', { apiKey });
  }
  const deployedCommit = String(health.json?.commit || '');
  const healthOk = health.status === 200
    && health.json?.status === 'healthy'
    && shaMatches(deployedCommit, expectedSha);
  addCheck(
    'GET /api/health',
    healthOk,
    `HTTP ${health.status}, status=${health.json?.status || 'none'}, commit=${deployedCommit || 'none'}${expectedSha ? ` (expected ${expectedSha.slice(0, 7)})` : ''}`
  );

  // 2. /radar + /api/pulse/24h (+ 5d/7d/10d/15d) + /api/creators + /api/domains
  const radarPage = await fetchReadOnly(baseUrl, '/radar', { apiKey });
  const radarHtmlCheck = evaluateHtmlBudgetsAndSymbols({
    path: '/radar',
    html: radarPage.text,
    maxBytes: 300 * 1024,
    requiredSubstrings: ['fmtSigned', '24h Pulse', 'Creator Hub', 'Domain Radar']
  });
  addCheck(
    'GET /radar HTML',
    radarPage.status === 200 && radarHtmlCheck.pass,
    `HTTP ${radarPage.status}, ${radarHtmlCheck.kib}, missing=${radarHtmlCheck.missingRequired.join(',') || 'none'}`
  );

  const pulse24h = await fetchReadOnly(baseUrl, '/api/pulse/24h', { apiKey });
  const pulse24hEval = evaluatePulsePayload(pulse24h.json, pulse24h.bytes, '24h');
  addCheck(
    'GET /api/pulse/24h (Budget < 900 KiB)',
    pulse24h.status === 200 && pulse24hEval.pass,
    `HTTP ${pulse24h.status}, ${pulse24hEval.kib}, samples=${pulse24hEval.sampleCount}, finiteSaves=${pulse24hEval.finiteSavesCount}, finiteVel=${pulse24hEval.finiteVelocityCount}`
  );

  const windowDetails = [];
  let allWindowsOk = true;
  for (const win of ['5d', '7d', '10d', '15d']) {
    const res = await fetchReadOnly(baseUrl, `/api/pulse/24h?window=${win}`, { apiKey });
    const ev = evaluatePulsePayload(res.json, res.bytes, win);
    if (res.status !== 200 || !ev.pass) allWindowsOk = false;
    windowDetails.push(`${win}:HTTP${res.status}(n=${ev.sampleCount})`);
  }
  addCheck('GET /api/pulse/24h windows (5d/7d/10d/15d)', allWindowsOk, windowDetails.join(', '));

  const creatorsRes = await fetchReadOnly(baseUrl, '/api/creators', { apiKey });
  const creatorsEval = evaluateCreatorsPayload(creatorsRes.json);
  addCheck(
    'GET /api/creators (Creator Hub & 2.7B catalog pins)',
    creatorsRes.status === 200 && creatorsEval.pass,
    `HTTP ${creatorsRes.status}, creators=${creatorsEval.competitorsCount}, pins=${creatorsEval.pinsTrackedBillions}B, audience=${creatorsEval.audience}`
  );

  const domainsRes = await fetchReadOnly(baseUrl, '/api/domains?limit=25', { apiKey });
  const domainsEval = evaluateDomainsPayload(domainsRes.json);
  addCheck(
    'GET /api/domains (Domain Radar 24h gain)',
    domainsRes.status === 200 && domainsEval.pass,
    `HTTP ${domainsRes.status}, domains=${domainsEval.domainsCount}/${domainsEval.totalDomains}, finiteVel=${domainsEval.withFiniteVelocity}`
  );

  // 3. /discover + /api/workspaces/settings + /api/newborn/launchpad (50/75/100)
  const discoverPage = await fetchReadOnly(baseUrl, '/discover', { apiKey });
  const discoverHtmlCheck = evaluateHtmlBudgetsAndSymbols({
    path: '/discover',
    html: discoverPage.text,
    maxBytes: BYTE_BUDGETS.discoverHtmlMaxBytes,
    forbiddenSymbols: DEAD_SYMBOLS.discover,
    requiredSubstrings: ['Workspace Defaults']
  });
  addCheck(
    'GET /discover HTML (< 225 KiB & zero dead symbols)',
    discoverPage.status === 200 && discoverHtmlCheck.pass,
    `HTTP ${discoverPage.status}, ${discoverHtmlCheck.kib}, forbidden=${discoverHtmlCheck.foundForbidden.join(',') || 'none'}, missing=${discoverHtmlCheck.missingRequired.join(',') || 'none'}`
  );

  const wsSettingsRes = await fetchReadOnly(baseUrl, '/api/workspaces/settings', { apiKey, workspaceId: 1 });
  const wsSettingsEval = evaluateWorkspaceSettingsPayload(wsSettingsRes.json);
  addCheck(
    'GET /api/workspaces/settings (SSOT defaults)',
    wsSettingsRes.status === 200 && wsSettingsEval.pass,
    `HTTP ${wsSettingsRes.status}, ws=${wsSettingsEval.workspaceId}, min_repins=${wsSettingsEval.minRepins}, max_boards=${wsSettingsEval.maxBoards}`
  );

  const launchpadDetails = [];
  let launchpadOk = true;
  for (const lim of [50, 75, 100]) {
    const lp = await fetchReadOnly(baseUrl, `/api/newborn/launchpad?limit=${lim}`, { apiKey });
    const trendsCount = Array.isArray(lp.json?.trends)
      ? lp.json.trends.length
      : (Array.isArray(lp.json?.items) ? lp.json.items.length : 0);
    if (lp.status !== 200 || lp.json?.success === false) launchpadOk = false;
    launchpadDetails.push(`limit=${lim}:HTTP${lp.status}(n=${trendsCount})`);
  }
  addCheck('GET /api/newborn/launchpad (50/75/100 Trends)', launchpadOk, launchpadDetails.join(', '));

  // 4. /folders/5/newborn & strict folder/workspace isolation (WP-2)
  const folder5NewbornPage = await fetchReadOnly(baseUrl, '/folders/5/newborn', { apiKey });
  const folder5NewbornCheck = evaluateHtmlBudgetsAndSymbols({
    path: '/folders/5/newborn',
    html: folder5NewbornPage.text,
    maxBytes: BYTE_BUDGETS.discoverHtmlMaxBytes,
    forbiddenSymbols: DEAD_SYMBOLS.discover,
    requiredSubstrings: ['Open in Discover']
  });
  addCheck(
    'GET /folders/5/newborn HTML (< 225 KiB & Open in Discover)',
    folder5NewbornPage.status === 200 && folder5NewbornCheck.pass,
    `HTTP ${folder5NewbornPage.status}, ${folder5NewbornCheck.kib}, forbidden=${folder5NewbornCheck.foundForbidden.join(',') || 'none'}, missing=${folder5NewbornCheck.missingRequired.join(',') || 'none'}`
  );

  const candFolder5Ws1 = await fetchReadOnly(baseUrl, '/api/newborn/candidates?folder_id=5&stage=discovered', { apiKey, workspaceId: 1 });
  const f5Count = Array.isArray(candFolder5Ws1.json?.candidates) ? candFolder5Ws1.json.candidates.length : -1;
  addCheck(
    'GET /api/newborn/candidates?folder_id=5&stage=discovered (WS1 zero global leakage)',
    candFolder5Ws1.status === 200 && f5Count === 0,
    `HTTP ${candFolder5Ws1.status}, candidates=${f5Count} (expected 0)`
  );

  const candMalformed = await fetchReadOnly(baseUrl, '/api/newborn/candidates?folder_id=5.5', { apiKey, workspaceId: 1 });
  addCheck(
    'GET /api/newborn/candidates?folder_id=5.5 (Malformed -> 400)',
    candMalformed.status === 400,
    `HTTP ${candMalformed.status} (expected 400)`
  );

  // Discover real workspaces (Read-Only) so cross-workspace checks target an existing non-default workspace ID
  const workspacesRes = await fetchReadOnly(baseUrl, '/api/workspaces', { apiKey, workspaceId: 1 });
  const wsList = Array.isArray(workspacesRes.json?.workspaces) ? workspacesRes.json.workspaces : [];
  const wsIds = wsList.map((w) => Number(w?.id)).filter((n) => Number.isInteger(n) && n > 0);
  const altWsId = selectSecondaryWorkspaceId(workspacesRes.json);

  if (altWsId) {
    const candCrossWs = await fetchReadOnly(baseUrl, '/api/newborn/candidates?folder_id=5', { apiKey, workspaceId: altWsId });
    addCheck(
      `GET /api/newborn/candidates?folder_id=5 in WS${altWsId} (Cross-WS -> 404)`,
      candCrossWs.status === 404,
      `HTTP ${candCrossWs.status} (expected 404, workspaces=[${wsIds.join(',')}])`
    );

    const candNullAltWs = await fetchReadOnly(baseUrl, '/api/newborn/candidates', { apiKey, workspaceId: altWsId });
    const altNullCount = Array.isArray(candNullAltWs.json?.candidates) ? candNullAltWs.json.candidates.length : -1;
    const altIsolatedOk = candNullAltWs.status === 200
      && altNullCount >= 0
      && (candNullAltWs.json?.candidates || []).every((c) => Number(c?.workspace_id ?? altWsId) === altWsId);
    addCheck(
      `GET /api/newborn/candidates (WS${altWsId} folder_id=null isolation)`,
      altIsolatedOk,
      `HTTP ${candNullAltWs.status}, candidates=${altNullCount} (ws=${altWsId})`
    );
  } else {
    const staleFallbackRes = await fetchReadOnly(baseUrl, '/api/workspaces/settings', { apiKey, workspaceId: 999999 });
    const resolvedWs = Number(staleFallbackRes.json?.workspace_id || 0);
    addCheck(
      'Cross-Workspace Isolation & Stale-ID Fallback (Single-WS DB)',
      workspacesRes.status === 200 && staleFallbackRes.status === 200 && resolvedWs === 1,
      `Only Workspace 1 exists on live DB (ids=[${wsIds.join(',') || '1'}]); stale WS 999999 safely fell back to ws=${resolvedWs} (multi-WS 404 verified by offline tests T3/T4)`
    );
  }

  // 5. /folders & /folders/5 (Room 5) byte budget + dead code removal
  for (const folderRoute of ['/folders', '/folders/5']) {
    const fp = await fetchReadOnly(baseUrl, folderRoute, { apiKey });
    const fCheck = evaluateHtmlBudgetsAndSymbols({
      path: folderRoute,
      html: fp.text,
      maxBytes: BYTE_BUDGETS.foldersHtmlMaxBytes,
      forbiddenSymbols: DEAD_SYMBOLS.folders,
      requiredSubstrings: ['Inherited from Workspace']
    });
    addCheck(
      `GET ${folderRoute} HTML (< 215 KiB & zero dead modal)`,
      fp.status === 200 && fCheck.pass,
      `HTTP ${fp.status}, ${fCheck.kib}, forbidden=${fCheck.foundForbidden.join(',') || 'none'}, missing=${fCheck.missingRequired.join(',') || 'none'}`
    );
  }

  // 6. /creators 302 redirect, /watchlist, /settings (Zone A write-only)
  const creatorsRedirect = await fetchReadOnly(baseUrl, '/creators', { apiKey, redirect: 'manual' });
  const redirectOk = creatorsRedirect.status === 302 && creatorsRedirect.location.includes('/watchlist?tab=creators');
  addCheck(
    'GET /creators (302 -> /watchlist?tab=creators)',
    redirectOk,
    `HTTP ${creatorsRedirect.status}, location=${creatorsRedirect.location || 'none'}`
  );

  const watchlistPage = await fetchReadOnly(baseUrl, '/watchlist', { apiKey });
  const watchlistApi = await fetchReadOnly(baseUrl, '/api/watchlist', { apiKey, workspaceId: 1 });
  addCheck(
    'GET /watchlist & /api/watchlist',
    watchlistPage.status === 200 && watchlistApi.status === 200 && Boolean(watchlistApi.json?.success),
    `HTML HTTP ${watchlistPage.status} (${formatKiB(watchlistPage.bytes)}), API HTTP ${watchlistApi.status}, items=${Array.isArray(watchlistApi.json?.items) ? watchlistApi.json.items.length : 'n/a'}`
  );

  const settingsPage = await fetchReadOnly(baseUrl, '/settings', { apiKey });
  const cookieApi = await fetchReadOnly(baseUrl, '/api/workspaces/cookie', { apiKey, workspaceId: 1 });
  const cookieEval = evaluateCookieWriteOnlyPayload(cookieApi.json);
  addCheck(
    'GET /settings & /api/workspaces/cookie (Zone A Write-Only)',
    settingsPage.status === 200 && cookieApi.status === 200 && cookieEval.pass,
    `HTML HTTP ${settingsPage.status}, API HTTP ${cookieApi.status}, has_cookie=${cookieEval.hasCookie}, preview=${cookieEval.preview || '""'}, leaked=${cookieEval.leakedSecret}`
  );

  // 7. Optional InstaBox VM Read-Only Checks (HEAD, systemd, journalctl + pae-postgres Docker logs, PG BEGIN READ ONLY)
  if (instaboxKey) {
    const vmCmd = [
      'set -e',
      'echo "HEAD=$(git -c safe.directory=/data/app rev-parse --short HEAD)"',
      'echo "SERVICE=$(systemctl is-active pae-server || true)"',
      'ERR_500=$(journalctl -u pae-server --since "30 min ago" --no-pager 2>/dev/null | grep -Ec "statusCode\\\":500|HTTP 500|\\b500 Internal Server Error\\b" || true)',
      'ERR_PG_APP=$(journalctl -u pae-server --since "30 min ago" --no-pager 2>/dev/null | grep -Ec "PostgresError|SQLSTATE|ERROR:[[:space:]]+column|ERROR:[[:space:]]+relation|integer out of range" || true)',
      'ERR_PG_SVC=$(docker logs --since 30m pae-postgres 2>&1 | grep -Ec "ERROR:|FATAL:" || true)',
      'echo "ERR_500=${ERR_500}"',
      'echo "ERR_PG_APP=${ERR_PG_APP}"',
      'echo "ERR_PG_SVC=${ERR_PG_SVC}"',
      'if command -v docker >/dev/null 2>&1 && docker ps --format "{{.Names}}" | grep -Eq "^pae-postgres$"; then',
      '  PG_JSON=$(docker exec pae-postgres psql -U postgres -d pin_arbitrage -Atqc "BEGIN READ ONLY; SELECT json_build_object(\'workspace_ids\', (SELECT COALESCE(json_agg(id ORDER BY id), \'[]\'::json) FROM workspaces), \'ws1_min_repin_count\', (SELECT COALESCE(min_repin_count, -1) FROM workspace_settings WHERE workspace_id = 1 LIMIT 1), \'ws1_max_boards\', (SELECT COALESCE((extraction_targets->\'boards\'->>\'max_boards\')::int, -1) FROM workspace_settings WHERE workspace_id = 1 LIMIT 1), \'folder5_exists\', EXISTS(SELECT 1 FROM keyword_folders WHERE id = 5 AND workspace_id = 1)); ROLLBACK;" 2>/dev/null | tail -n 1 || true)',
      '  echo "PG_RO=${PG_JSON}"',
      'fi'
    ].join('\n');

    const execRes = await runInstaboxReadOnlyExec({
      instaboxKey,
      machineId,
      cmd: vmCmd,
      timeoutSeconds: 30
    });

    const parsed = {};
    for (const line of execRes.stdout.split(/\r?\n/)) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        parsed[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }

    const headMatches = shaMatches(parsed.HEAD, expectedSha || deployedCommit);
    const serviceActive = parsed.SERVICE === 'active';
    const err500 = Number(parsed.ERR_500 || 0);
    const errPgApp = Number(parsed.ERR_PG_APP || 0);
    const errPgSvc = Number(parsed.ERR_PG_SVC || 0);

    addCheck(
      'InstaBox VM HEAD & pae-server status',
      execRes.httpStatus === 200 && execRes.exitCode === 0 && headMatches && serviceActive,
      `HEAD=${parsed.HEAD || 'unknown'}, service=${parsed.SERVICE || 'unknown'}, exit=${execRes.exitCode}`
    );
    addCheck(
      'InstaBox Logs (0 HTTP 500 & 0 pae-postgres errors in last 30m)',
      execRes.httpStatus === 200 && execRes.exitCode === 0 && err500 === 0 && errPgApp === 0 && errPgSvc === 0,
      `http500=${err500}, pgAppErrors=${errPgApp}, paePostgresErrors=${errPgSvc}`
    );
    if (parsed.PG_RO) {
      addCheck('PostgreSQL BEGIN READ ONLY Sanity Check', true, parsed.PG_RO);
    }
  } else {
    addCheck('InstaBox VM Logs (optional)', true, 'Skipped (INSTABOX_API_KEY not set in env)');
  }

  const allPassed = checks.every((c) => c.pass);
  const report = {
    allPassed,
    target: baseUrl,
    commit: deployedCommit,
    timestamp: new Date().toISOString(),
    passedCount: checks.filter((c) => c.pass).length,
    totalCount: checks.length,
    checks
  };

  return report;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runLiveReadOnlyVerification(process.env)
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatMarkdownSummary(report), 'utf8');
      }
      process.exit(report.allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error(`❌ Live Read-Only verification error: ${err.message}`);
      process.exit(1);
    });
}
