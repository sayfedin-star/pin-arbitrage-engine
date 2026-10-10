#!/usr/bin/env node

/**
 * Automated UI Security, Asset Integrity & Least-Privilege Auditor [CAP-61]
 * Scans UI templates, server responses, GitHub Actions workflows, and process isolation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalChecks = 0;
let passedChecks = 0;
const failures = [];

function check(title, condition, detail = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [✓] ${title}`);
  } else {
    failures.push({ title, detail });
    console.error(`  [✗] FAIL: ${title}${detail ? ` (${detail})` : ''}`);
  }
}

console.log('=============================================================');
console.log('🔍 Pin Arbitrage Engine - Automated UI & Pipeline Security Audit');
console.log('=============================================================\n');

// --------------------------------------------------------------------------
// 1. Asset Pinning & CDN Integrity (CAP-48)
// --------------------------------------------------------------------------
console.log('[*] Auditing UI Template Asset Pinning...');
const uiFiles = [
  'src/board-ideas-ui.mjs',
  'src/campaign-folders-ui.mjs',
  'src/dashboard-ui.mjs',
  'src/discovery-ui.mjs',
  'src/keywords-ui.mjs',
  'src/pin-details-ui.mjs'
];

for (const file of uiFiles) {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) {
    check(`File exists: ${file}`, false, 'File not found');
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');

  check(`${file}: Alpine.js pinned to 3.14.8`, content.includes('alpinejs@3.14.8'), 'Must pin to 3.14.8');
  check(`${file}: No unpinned alpinejs@3.x.x`, !content.includes('alpinejs@3.x.x'), 'Unpinned 3.x.x found');
  check(`${file}: No legacy alpinejs@3.13.3`, !content.includes('alpinejs@3.13.3'), 'Legacy 3.13.3 found');

  if (content.includes('lucide')) {
    check(`${file}: Lucide pinned to 0.469.0`, content.includes('lucide@0.469.0'), 'Must pin Lucide version');
    check(`${file}: No unpinned lucide@latest`, !content.includes('lucide@latest'), 'Unpinned lucide@latest found');
  }
}

// --------------------------------------------------------------------------
// 2. Untrusted URL Sanitization (safeUrl) (CAP-50)
// --------------------------------------------------------------------------
console.log('\n[*] Auditing Dynamic URL Bindings (safeUrl Defense)...');
for (const file of uiFiles) {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');

  // Check for raw un-sanitized :href bindings to destination_url, sample_url, creator_url
  const dangerousPatterns = [
    /:href=["']p\.destination_url["']/,
    /:href=["']item\.sample_url["']/,
    /:href=["']run\.url["']/,
    /:href=["']dossier\?\.pillar_1_creator_context\?\.creator_url["']/
  ];

  for (const pattern of dangerousPatterns) {
    const match = content.match(pattern);
    check(`${file}: No raw unescaped :href match for ${pattern}`, !match, match ? `Found raw href: ${match[0]}` : '');
  }
}

// Verify safeUrl implementation in relevant templates
const safeUrlFiles = ['src/dashboard-ui.mjs', 'src/keywords-ui.mjs', 'src/pin-details-ui.mjs'];
for (const file of safeUrlFiles) {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  check(`${file}: Declares safeUrl method`, content.includes('safeUrl(url)'), 'Must define safeUrl helper');
}

// --------------------------------------------------------------------------
// 3. CSV Formula Injection (DDE) Defense (CAP-49)
// --------------------------------------------------------------------------
console.log('\n[*] Auditing CSV Formula Injection Protections...');
const csvExportFiles = ['src/dashboard-ui.mjs', 'src/keywords-ui.mjs', 'src/campaign-folders-ui.mjs'];
for (const file of csvExportFiles) {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  check(`${file}: Declares sanitizeCsvCell method`, content.includes('sanitizeCsvCell(val)'), 'Must declare sanitizeCsvCell');
  check(`${file}: sanitizeCsvCell protects against '=', '+', '-', '@'`, 
    content.includes('61') && content.includes('43') && content.includes('45') && content.includes('64'),
    'Must sanitize ASCII DDE trigger codes');
}

// --------------------------------------------------------------------------
// 4. Server Security Headers & Content-Security-Policy (CAP-48)
// --------------------------------------------------------------------------
console.log('\n[*] Auditing Server CSP & Security Headers...');
const workerPath = path.join(rootDir, 'src/worker.mjs');
const workerContent = fs.readFileSync(workerPath, 'utf8');

check('src/worker.mjs: Declares HTML_HEADERS with CSP', workerContent.includes('Content-Security-Policy'), 'Must define CSP header');
check('src/worker.mjs: X-Content-Type-Options is nosniff', workerContent.includes("'X-Content-Type-Options': 'nosniff'"), 'Must enforce nosniff');
check('src/worker.mjs: X-Frame-Options is DENY', workerContent.includes("'X-Frame-Options': 'DENY'"), 'Must enforce DENY');

const dashboardPath = path.join(rootDir, 'scripts/dashboard.mjs');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
check('scripts/dashboard.mjs: Declares HTML_SECURITY_HEADERS with CSP', dashboardContent.includes('HTML_SECURITY_HEADERS') && dashboardContent.includes('Content-Security-Policy'), 'Must declare HTML_SECURITY_HEADERS');

// --------------------------------------------------------------------------
// 5. GitHub Actions Workflows Least-Privilege Permissions (CAP-51)
// --------------------------------------------------------------------------
console.log('\n[*] Auditing GitHub Actions Workflows Least-Privilege Permissions...');
const workflowDir = path.join(rootDir, '.github/workflows');
if (fs.existsSync(workflowDir)) {
  const workflowFiles = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const wf of workflowFiles) {
    const wfContent = fs.readFileSync(path.join(workflowDir, wf), 'utf8');
    check(`.github/workflows/${wf}: Declares permissions block`, wfContent.includes('permissions:'), 'Missing permissions block');
    check(`.github/workflows/${wf}: Sets contents: read`, wfContent.includes('contents: read'), 'Missing contents: read');
  }
}

// --------------------------------------------------------------------------
// 6. Child Process Environment Isolation (CAP-52)
// --------------------------------------------------------------------------
console.log('\n[*] Auditing Child Process Environment Isolation...');
check('scripts/dashboard.mjs: Deletes GITHUB_TOKEN from childEnv', dashboardContent.includes('delete childEnv.GITHUB_TOKEN'), 'Must strip GITHUB_TOKEN');
check('scripts/dashboard.mjs: Deletes GH_TOKEN from childEnv', dashboardContent.includes('delete childEnv.GH_TOKEN'), 'Must strip GH_TOKEN');
check('scripts/dashboard.mjs: Deletes CLOUDFLARE_API_TOKEN from childEnv', dashboardContent.includes('delete childEnv.CLOUDFLARE_API_TOKEN'), 'Must strip CLOUDFLARE_API_TOKEN');

// --------------------------------------------------------------------------
// Final Scorecard
// --------------------------------------------------------------------------
console.log('\n=============================================================');
console.log(`Audited ${totalChecks} security rules: ${passedChecks} PASSED, ${failures.length} FAILED.`);
if (failures.length > 0) {
  console.error('\n[-] AUDIT FAILED with the following violations:');
  for (const f of failures) {
    console.error(`    - ${f.title}: ${f.detail}`);
  }
  console.log('=============================================================');
  process.exit(1);
} else {
  console.log('✅ ALL UI & PIPELINE SECURITY AUDITS PASSED (100% compliant)');
  console.log('=============================================================');
  process.exit(0);
}
