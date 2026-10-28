/**
 * scripts/test_baseline_qa.mjs
 * 
 * Gate 1 Baseline Penetration Test Harness
 * Live Headless & End-to-End QA Enforcer
 */

import fs from 'node:fs';
import vm from 'node:vm';
import { neon } from '@neondatabase/serverless';
import worker from '../src/worker.mjs';

// Load .env
let dbUrl = '';
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
        if (key === 'DATABASE_URL') dbUrl = val;
      }
    }
  }
} catch (_) {}

const sql = dbUrl ? neon(dbUrl) : null;
const env = {
  DATABASE_URL: dbUrl
};

const results = {
  timestamp: new Date().toISOString(),
  endpoints: [],
  syntaxErrors: [],
  consoleErrors: [],
  prefetchTest: null,
  crossoverLatencies: [],
  domainCounts: {},
  actionButtons: {},
  summary: {
    totalEndpointsTested: 0,
    totalConsoleErrors: 0,
    failures: []
  }
};

async function testHttp(name, path, options = {}) {
  const url = `http://localhost${path}`;
  const start = performance.now();
  let status = 0;
  let text = '';
  let error = null;
  let headers = {};
  try {
    const req = new Request(url, {
      method: options.method || 'GET',
      headers: {
        'Accept': options.accept || 'text/html',
        ...(options.headers || {})
      }
    });
    const res = await worker.fetch(req, env);
    status = res.status;
    for (const [k, v] of res.headers.entries()) {
      headers[k] = v;
    }
    text = await res.text();
  } catch (err) {
    error = err.message;
  }
  const latency = Math.round(performance.now() - start);

  const entry = {
    name,
    path,
    status,
    latencyMs: latency,
    contentLength: text.length,
    contentType: headers['content-type'] || '',
    cacheControl: headers['cache-control'] || '',
    error
  };
  results.endpoints.push(entry);
  results.summary.totalEndpointsTested++;
  console.log(`[HTTP] ${status} (${latency}ms) ${name} -> ${path}`);
  return { status, text, latency, headers };
}

// --------------------------------------------------------------------------
// 1. HTTP Endpoint Penetration
// --------------------------------------------------------------------------
async function runHttpTests() {
  console.log('\n--- 1. Testing Core HTML Routes ---');
  await testHttp('Folder Hub Index', '/folders');
  await testHttp('Folder 5 Studio (Room 1)', '/folders/5');
  await testHttp('Folder 5 Keywords (Room 2)', '/folders/5/keywords');
  await testHttp('Folder 5 Creators (Room 3)', '/folders/5/creators');
  await testHttp('Folder 5 Domains (Room 4)', '/folders/5/domains');
  await testHttp('Folder 6 Studio (Room 1)', '/folders/6');
  await testHttp('Domain Studio', '/domains');

  console.log('\n--- 2. Testing API Endpoints & Crossover Latency ---');
  await testHttp('API List Folders', '/api/folders', { accept: 'application/json' });
  await testHttp('API Folder 5 Detail', '/api/folders/5', { accept: 'application/json' });
  
  const cross5 = await testHttp('API Folder 5 Crossover', '/api/folders/5/raw-visual-crossover', { accept: 'application/json' });
  results.crossoverLatencies.push({ folderId: 5, latencyMs: cross5.latency, status: cross5.status });

  await testHttp('API Folder 6 Detail', '/api/folders/6', { accept: 'application/json' });
  const cross6 = await testHttp('API Folder 6 Crossover', '/api/folders/6/raw-visual-crossover', { accept: 'application/json' });
  results.crossoverLatencies.push({ folderId: 6, latencyMs: cross6.latency, status: cross6.status });

  console.log('\n--- 3. Testing Prefetch on Pin Endpoint ---');
  const prefetchRes = await testHttp(
    'Pin Prefetch Cache-Miss',
    '/api/pins/1098245059167667976?prefetch=true',
    { accept: 'application/json' }
  );
  results.prefetchTest = {
    url: '/api/pins/1098245059167667976?prefetch=true',
    status: prefetchRes.status,
    cacheControl: prefetchRes.headers['cache-control'] || '',
    body: prefetchRes.text.slice(0, 300)
  };
  console.log(`[PREFETCH RESULT] Status: ${prefetchRes.status}, Cache-Control: ${prefetchRes.headers['cache-control']}`);
}

// --------------------------------------------------------------------------
// 4. DevTools Console ReferenceError & Alpine Expression Simulation
// --------------------------------------------------------------------------
function simulateAlpineOnHtml(pageName, html, componentFactoryName, componentArgs = []) {
  console.log(`\n--- Simulating Alpine on ${pageName} (${componentFactoryName}) ---`);
  
  // 1. Create headless DOM/window sandbox
  const sandbox = {
    window: {},
    document: {
      documentElement: {
        classList: {
          add: () => {},
          remove: () => {},
          contains: () => false
        }
      },
      addEventListener: () => {},
      activeElement: null
    },
    localStorage: {
      getItem: (k) => (k === 'pa_theme' ? 'dark' : null),
      setItem: () => {},
      removeItem: () => {}
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    navigator: { userAgent: 'HeadlessTest' },
    location: {
      pathname: pageName,
      search: '',
      href: `http://localhost${pageName}`
    },
    performance: { now: () => Date.now() },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    confirm: () => true,
    alert: () => {},
    fetch: () => Promise.resolve(new Response(JSON.stringify({}))),
    safeApiFetch: () => Promise.resolve(new Response(JSON.stringify({}))),
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    Number: globalThis.Number,
    String: globalThis.String,
    Boolean: globalThis.Boolean,
    Math: globalThis.Math,
    Date: globalThis.Date,
    JSON: globalThis.JSON,
    parseInt: globalThis.parseInt,
    parseFloat: globalThis.parseFloat,
    isNaN: globalThis.isNaN,
    isFinite: globalThis.isFinite,
    encodeURIComponent: globalThis.encodeURIComponent,
    decodeURIComponent: globalThis.decodeURIComponent,
    __INITIAL_KEYWORD_SLUG__: ''
  };
  sandbox.window = sandbox;

  const ctx = vm.createContext(sandbox);

  // 2. Extract and execute all inline scripts
  const scriptRegex = /<script[\s\S]*?>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const code = match[1];
    if (code && !code.includes('src=')) {
      try {
        vm.runInContext(code, ctx);
      } catch (err) {
        console.error(`[SCRIPT ERR in ${pageName}]:`, err.message);
      }
    }
  }

  // 3. Instantiate component data object
  let componentData = {
    $nextTick: (fn) => fn && fn(),
    $watch: () => {},
    $dispatch: () => {},
    $refs: {},
    $el: {}
  };
  try {
    const factory = vm.runInContext(componentFactoryName, ctx);
    if (typeof factory === 'function') {
      const inst = factory(...componentArgs);
      Object.assign(componentData, inst);
      componentData.$nextTick = (fn) => fn && fn();
      componentData.$watch = () => {};
      componentData.$dispatch = () => {};
    }
  } catch (err) {
    console.error(`[FACTORY ERR] Could not instantiate ${componentFactoryName}:`, err.message);
  }

  // 4. Extract all Alpine expressions from HTML
  // We want to detect syntax errors in ANY expression, and ReferenceErrors in non-loop expressions
  const directiveRegex = /(?:\s|^)(x-show|x-text|x-html|x-title|:class|:title|:data-lucide|:href|:value|:style|:disabled|@click|@change|x-init)="([^"]*)"/gi;
  const expressions = [];
  let dirMatch;
  while ((dirMatch = directiveRegex.exec(html)) !== null) {
    const directive = dirMatch[1];
    const expr = dirMatch[2].trim();
    if (expr && !expr.startsWith('//')) {
      expressions.push({ directive, expr });
    }
  }

  console.log(`Found ${expressions.length} Alpine directive expressions in ${pageName}`);

  // Find loop variables in templates to avoid false positives on x-for iterations
  const forRegex = /x-for="(?:\(([a-zA-Z0-9_$,\s]+)\)|([a-zA-Z0-9_$]+))\s+in\s+([^"]+)"/gi;
  const loopVars = new Set();
  let forMatch;
  while ((forMatch = forRegex.exec(html)) !== null) {
    if (forMatch[1]) {
      forMatch[1].split(',').forEach(v => loopVars.add(v.trim()));
    } else if (forMatch[2]) {
      loopVars.add(forMatch[2].trim());
    }
  }

  // Add dummy loop variables to scope so that only REAL component errors fail
  const scopeWithLoopVars = Object.create(componentData);
  for (const lv of loopVars) {
    scopeWithLoopVars[lv] = {};
  }

  const errorsFound = [];

  for (const { directive, expr } of expressions) {
    if (!expr || expr === 'true' || expr === 'false' || expr === "''" || /^\d+$/.test(expr)) {
      continue;
    }

    // A. Check for raw syntax errors
    const isEventHandler = directive.startsWith('@') || directive === 'x-init';
    const testCode = isEventHandler ? `(() => { ${expr} })` : `void (${expr})`;
    
    try {
      new vm.Script(testCode);
    } catch (syntaxErr) {
      const errEntry = {
        page: pageName,
        directive,
        expression: expr,
        errorType: 'SyntaxError',
        errorMessage: syntaxErr.message
      };
      results.syntaxErrors.push(errEntry);
      console.error(`  ❌ [SYNTAX ERROR in ${pageName}]: ${syntaxErr.message} in ${directive}="${expr}"`);
      continue;
    }

    // B. Check evaluation against component scope
    // We only evaluate read-only expressions (x-show, x-text, :class, :title, etc.)
    // We do NOT execute mutative @click handlers during passive DOM compilation check
    if (isEventHandler) {
      continue;
    }

    ctx.componentScope = scopeWithLoopVars;
    const evalScript = `
      try {
        with (componentScope) {
          void (${expr});
        }
      } catch (e) {
        throw { name: e.name, message: e.message, stack: e.stack };
      }
    `;

    try {
      vm.runInContext(evalScript, ctx);
    } catch (err) {
      // Check if it's a real ReferenceError on component globals (isDark, darkMode, competitors, keywords, overview, etc.)
      const isCoreRefError = ['isDark', 'darkMode', 'competitors', 'keywords', 'overview', 'folder'].some(v => err.message.includes(`${v} is not defined`));
      
      const errorEntry = {
        page: pageName,
        directive,
        expression: expr,
        errorName: err.name || 'Error',
        errorMessage: err.message || String(err),
        isCoreRefError
      };
      errorsFound.push(errorEntry);
      results.consoleErrors.push(errorEntry);
      results.summary.totalConsoleErrors++;
      if (isCoreRefError) {
        console.error(`  🔥 [CRITICAL Console ReferenceError on ${pageName}]: ${err.message} in ${directive}="${expr}"`);
      } else {
        console.log(`  ⚠️ [Console ${err.name} on ${pageName}]: ${err.message} in ${directive}="${expr}"`);
      }
    }
  }

  return errorsFound;
}

// --------------------------------------------------------------------------
// 5. Domain Count Parity Inspection
// --------------------------------------------------------------------------
async function inspectDomainCountParity() {
  console.log('\n--- 5. Inspecting Domain Count Parity Across Views & Database ---');
  if (!sql) {
    console.warn('Skipping SQL domain parity check (no sql connection)');
    return;
  }

  // A. Database Truth: distinct SERP domains for folder keywords
  const dbCounts = await sql`
    SELECT 
      f.id AS folder_id,
      f.name AS folder_name,
      count(DISTINCT ksc.domain) AS distinct_serp_domains,
      count(DISTINCT ksc.pin_id) AS distinct_pins
    FROM keyword_folders f
    LEFT JOIN keyword_folder_items fi ON fi.folder_id = f.id
    LEFT JOIN keyword_serp_current ksc ON ksc.keyword_id = fi.keyword_id
    WHERE f.id IN (5, 6)
    GROUP BY f.id, f.name
    ORDER BY f.id;
  `;

  // B. Pinned domains in folder
  const pinnedCounts = await sql`
    SELECT folder_id, count(*) AS pinned_count 
    FROM folder_pinned_domains 
    WHERE folder_id IN (5, 6) 
    GROUP BY folder_id;
  `;

  // C. API values from /api/folders
  const apiFoldersReq = new Request('http://localhost/api/folders');
  const apiFoldersRes = await worker.fetch(apiFoldersReq, env);
  const apiFoldersJson = await apiFoldersRes.json();
  const folder5FromApi = apiFoldersJson.folders?.find(f => Number(f.id) === 5);
  const folder6FromApi = apiFoldersJson.folders?.find(f => Number(f.id) === 6);

  // D. Single Folder 5 API (/api/folders/5)
  const apiF5Req = new Request('http://localhost/api/folders/5');
  const apiF5Res = await worker.fetch(apiF5Req, env);
  const apiF5Json = await apiF5Res.json();

  // E. Single Folder 6 API (/api/folders/6)
  const apiF6Req = new Request('http://localhost/api/folders/6');
  const apiF6Res = await worker.fetch(apiF6Req, env);
  const apiF6Json = await apiF6Res.json();

  // F. Crossover API (/api/folders/5/raw-visual-crossover)
  const crossF5Req = new Request('http://localhost/api/folders/5/raw-visual-crossover');
  const crossF5Res = await worker.fetch(crossF5Req, env);
  const crossF5Json = await crossF5Res.json().catch(() => ({}));

  // G. Domains API (/api/domains)
  const apiDomainsReq = new Request('http://localhost/api/domains');
  const apiDomainsRes = await worker.fetch(apiDomainsReq, env);
  const apiDomainsJson = await apiDomainsRes.json().catch(() => ({}));

  results.domainCounts = {
    databaseTruth: dbCounts,
    pinnedCounts,
    folder5: {
      dbDistinctSerpDomains: Number(dbCounts.find(d => Number(d.folder_id) === 5)?.distinct_serp_domains || 0),
      apiFoldersDomainCount: folder5FromApi?.domain_count,
      apiFolder5DomainCount: apiF5Json.folder?.domain_count,
      crossoverMonopolyLength: crossF5Json.crossover?.domain_monopoly?.length || crossF5Json.domain_monopoly?.length || 0
    },
    folder6: {
      dbDistinctSerpDomains: Number(dbCounts.find(d => Number(d.folder_id) === 6)?.distinct_serp_domains || 0),
      apiFoldersDomainCount: folder6FromApi?.domain_count,
      apiFolder6DomainCount: apiF6Json.folder?.domain_count
    },
    globalDomainsTotal: apiDomainsJson.overview?.total_domains || apiDomainsJson.total || 0
  };

  console.log('[DOMAIN COUNTS CHECK]:', JSON.stringify(results.domainCounts, null, 2));
}

// --------------------------------------------------------------------------
// 6. Action Button & Toolbar Visibility Inspection
// --------------------------------------------------------------------------
async function inspectActionButtons() {
  console.log('\n--- 6. Inspecting Action Button & Toolbar Visibility ---');

  // A. /domains HTML
  const domReq = new Request('http://localhost/domains');
  const domRes = await worker.fetch(domReq, env);
  const domHtml = await domRes.text();

  const hasDomainsActionsHeader = domHtml.includes('ACTIONS') || domHtml.includes('>Actions<');
  const hasPinActionButton = domHtml.includes('togglePinDomain') || domHtml.includes('📌');
  const hasDossierActionButton = domHtml.includes('openDomainDossier') || domHtml.includes('Dossier');

  // B. /folders/5 HTML (Room 1)
  const f5Req = new Request('http://localhost/folders/5');
  const f5Res = await worker.fetch(f5Req, env);
  const f5Html = await f5Res.text();

  const hasBlueprintBtn = f5Html.includes('Content Blueprint') || f5Html.includes('showBlueprint');
  const hasRerunBtn = f5Html.includes('Re-Run Crossover') || f5Html.includes('refreshCrossover');
  const hasSettingsBtn = f5Html.includes('Settings') || f5Html.includes('openSettingsModal') || f5Html.includes('isSettingsModalOpen');
  const hasAuditBtn = f5Html.includes('Deep Cluster Audit') || f5Html.includes('dispatchAudit');
  const hasDeleteBtn = f5Html.includes('Delete') || f5Html.includes('openDeleteModal');

  // Check for raw text overflow or duplicate icons on Room 1
  const hasRawFolderText = f5Html.includes('>folder<') || f5Html.includes('">folder<');
  const hasDoubleEmojis = f5Html.includes('⚡ ⚡') || f5Html.includes('🔍 🎯') || f5Html.includes('👥 👥') || f5Html.includes('🌐 🌐');
  const hasDuplicateGlobalHeader = (f5Html.match(/Campaign Folders Studio/g) || []).length > 1;

  // C. /folders/5/domains HTML (Room 4)
  const f5dReq = new Request('http://localhost/folders/5/domains');
  const f5dRes = await worker.fetch(f5dReq, env);
  const f5dHtml = await f5dRes.text();

  const hasF5dActionsHeader = f5dHtml.includes('ACTIONS') || f5dHtml.includes('>Actions<');
  const hasF5dPinAction = f5dHtml.includes('togglePinDomain') || f5dHtml.includes('Pin');

  results.actionButtons = {
    domainsPage: {
      hasActionsHeader: hasDomainsActionsHeader,
      hasPinButton: hasPinActionButton,
      hasDossierButton: hasDossierActionButton
    },
    folderStudioRoom1: {
      hasBlueprintBtn,
      hasRerunBtn,
      hasSettingsBtn,
      hasAuditBtn,
      hasDeleteBtn,
      hasRawFolderText,
      hasDoubleEmojis,
      hasDuplicateGlobalHeader
    },
    folderDomainsRoom4: {
      hasActionsHeader: hasF5dActionsHeader,
      hasPinAction: hasF5dPinAction
    }
  };

  console.log('[ACTION BUTTONS & TOOLBAR INSPECTION]:', JSON.stringify(results.actionButtons, null, 2));
}

// --------------------------------------------------------------------------
// MAIN ORCHESTRATION
// --------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(80));
  console.log('🛡️ LIVE HEADLESS-BROWSER & END-TO-END QA BASELINE PENETRATION');
  console.log('='.repeat(80));

  // 1. HTTP Tests
  await runHttpTests();

  // 2. Fetch HTML for AST & Alpine Simulation
  const routesToSimulate = [
    { page: '/folders', factory: 'foldersApp', args: [''] },
    { page: '/folders/5', factory: 'foldersApp', args: ['5'] },
    { page: '/folders/5/keywords', factory: 'keywordStudio', args: [] },
    { page: '/folders/5/creators', factory: 'dashboardApp', args: [] },
    { page: '/folders/5/domains', factory: 'domainsApp', args: ['', '5'] },
    { page: '/folders/6', factory: 'foldersApp', args: ['6'] },
    { page: '/domains', factory: 'domainsApp', args: [''] }
  ];

  for (const { page, factory, args } of routesToSimulate) {
    const res = await worker.fetch(new Request(`http://localhost${page}`), env);
    const html = await res.text();
    simulateAlpineOnHtml(page, html, factory, args);
  }

  // 3. Domain Count Parity
  await inspectDomainCountParity();

  // 4. Action Buttons & Toolbar
  await inspectActionButtons();

  console.log('\n' + '='.repeat(80));
  console.log('📊 PENETRATION AUDIT SUMMARY');
  console.log('='.repeat(80));
  console.log(`Endpoints Tested: ${results.summary.totalEndpointsTested}`);
  console.log(`Total Syntax Errors in Templates: ${results.syntaxErrors.length}`);
  console.log(`Total DevTools Console Errors: ${results.consoleErrors.length}`);
  const coreErrors = results.consoleErrors.filter(e => e.isCoreRefError);
  console.log(`Core ReferenceErrors (isDark, darkMode, overview, etc.): ${coreErrors.length}`);
  console.log(`Prefetch 404 Bug Confirmed: ${results.prefetchTest?.status === 404}`);
  console.log(`Crossover Latencies:`, results.crossoverLatencies);

  // Write full raw results to a JSON file for the report
  fs.writeFileSync('scripts/qa_baseline_results.json', JSON.stringify(results, null, 2));
  console.log('Saved baseline penetration results to scripts/qa_baseline_results.json');
}

main().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
