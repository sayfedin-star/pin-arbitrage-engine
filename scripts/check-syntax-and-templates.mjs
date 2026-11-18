#!/usr/bin/env node

/**
 * scripts/check-syntax-and-templates.mjs
 *
 * Unified Fast Offline Static Verifier (Zero DB, Zero Network):
 * 1. Parses 100% of `.mjs` files across `src/`, `scripts/`, `workers/`, and `tests/` via Acorn.
 * 2. Compiles inline `<script>` blocks across all 7 SSR UI page renderers via `new vm.Script`.
 * 3. Verifies balanced `<main>` / `<div>` DOM tags, Campaign Folders Room hierarchy, and
 *    Alpine.js `<template x-if>` single-root element nesting across all SSR views.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

import { getDashboardHtml } from '../src/ui/dashboard/index.mjs';
import { getKeywordsPageHtml } from '../src/ui/keywords/index.mjs';
import { getDiscoveryPageHtml } from '../src/ui/discovery/index.mjs';
import { getPinDetailPageHtml } from '../src/ui/pin-details/index.mjs';
import { getCampaignFoldersPageHtml } from '../src/ui/folders/index.mjs';
import { getDomainsPageHtml } from '../src/ui/domains/index.mjs';
import { getPulsePageHtml } from '../src/ui/pulse/index.mjs';

const VOID_HTML_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

export function scanMjsFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'scratch') {
        scanMjsFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function verifyAllMjsSyntax(rootDir = process.cwd()) {
  const dirs = ['src', 'scripts', 'workers', 'tests'];
  const files = [];
  for (const d of dirs) {
    scanMjsFiles(path.join(rootDir, d), files);
  }

  let failedCount = 0;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    try {
      acorn.parse(content, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowHashBang: true,
        locations: true
      });
    } catch (acornErr) {
      console.error(`❌ Syntax Error in ${file} at line ${acornErr?.loc?.line || '?'}:${acornErr?.loc?.column || '?'}:`);
      console.error(acornErr.message);
      try {
        execFileSync(process.execPath, ['-c', file], { stdio: 'pipe' });
      } catch (v8Err) {
        if (v8Err.stderr) console.error(v8Err.stderr.toString());
      }
      failedCount++;
    }
  }

  if (failedCount > 0) {
    throw new Error(`Acorn syntax verification failed on ${failedCount} of ${files.length} .mjs files.`);
  }
  return files.length;
}

export function validateInlineScriptsForPage(name, html) {
  const scriptMatches = html.match(/<script\b[\s\S]*?<\/script>/gi) || [];
  let compiledCount = 0;

  scriptMatches.forEach((rawTag, idx) => {
    const openTagMatch = rawTag.match(/^<script\b([^>]*)>/i);
    const openAttrs = openTagMatch ? openTagMatch[1] : '';
    if (/\bsrc\s*=/i.test(openAttrs)) return;
    const typeMatch = openAttrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    if (typeMatch && !/^(text\/javascript|application\/javascript|module)$/i.test(typeMatch[1])) {
      return;
    }

    const code = rawTag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      new vm.Script(code, { filename: `${name}-inline-script-${idx}.js` });
      compiledCount++;
    } catch (err) {
      const lines = code.split('\n');
      const lineMatch = String(err.stack || '').match(/:(\d+)\n/);
      if (lineMatch) {
        const lineNum = parseInt(lineMatch[1], 10);
        for (let l = Math.max(0, lineNum - 3); l <= Math.min(lines.length - 1, lineNum + 3); l++) {
          console.error(`    ${l + 1}: ${lines[l]}`);
        }
      }
      throw new Error(`[${name}] Inline <script> #${idx} syntax error: ${err.message}`);
    }
  });

  return compiledCount;
}

function stripRawTextElements(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

export function parseHtmlElementTree(html) {
  const cleanHtml = stripRawTextElements(html);
  const tagRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9-]+)((?:\s+[^"'/>\s]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/)?>/g;

  const root = { tag: 'ROOT', attrs: {}, children: [], parent: null };
  const stack = [root];

  let match;
  while ((match = tagRegex.exec(cleanHtml)) !== null) {
    const full = match[0];
    if (full.startsWith('<!--')) continue;

    const isClosing = Boolean(match[1]);
    const tagName = match[2].toLowerCase();
    const rawAttrs = match[3] || '';
    const isSelfClosing = Boolean(match[4]) || VOID_HTML_TAGS.has(tagName);

    if (isClosing) {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tag === tagName) {
          while (stack.length > i) {
            stack.pop();
          }
          break;
        }
      }
    } else {
      const attrs = {};
      const attrRegex = /([a-zA-Z0-9_:@.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = attrMatch[1];
        const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        attrs[attrName] = attrVal;
      }

      const node = {
        tag: tagName,
        attrs,
        children: [],
        parent: stack[stack.length - 1],
        index: match.index
      };

      stack[stack.length - 1].children.push(node);
      if (!isSelfClosing) {
        stack.push(node);
      }
    }
  }

  return root;
}

function findNodes(node, predicate, results = []) {
  if (predicate(node)) results.push(node);
  for (const child of node.children) {
    findNodes(child, predicate, results);
  }
  return results;
}

export function countTagBalance(html, label) {
  const cleanHtml = stripRawTextElements(html);
  const openMain = (cleanHtml.match(/<main\b/gi) || []).length;
  const closeMain = (cleanHtml.match(/<\/main>/gi) || []).length;
  const openDiv = (cleanHtml.match(/<div\b/gi) || []).length;
  const closeDiv = (cleanHtml.match(/<\/div>/gi) || []).length;

  if (openMain !== 1 || closeMain !== 1) {
    throw new Error(`FAIL [${label}]: <main> count imbalance detected (open=${openMain}, close=${closeMain}, expected 1/1).`);
  }
  if (openDiv !== closeDiv) {
    throw new Error(`FAIL [${label}]: <div> tag imbalance detected (open=${openDiv}, close=${closeDiv}).`);
  }
  return { openMain, closeMain, openDiv, closeDiv };
}

export function verifyAlpineTemplateXIfSingleRoot(root, label) {
  const xIfTemplates = findNodes(root, (n) => n.tag === 'template' && n.attrs && Object.hasOwn(n.attrs, 'x-if'));
  for (const tpl of xIfTemplates) {
    const expr = String(tpl.attrs['x-if'] || '').trim();
    if (tpl.children.length === 0) {
      throw new Error(
        `FAIL [${label}]: <template x-if="${expr}"> is empty (expected 1 root element).`
      );
    }
    if (tpl.children.length > 1) {
      throw new Error(
        `FAIL [${label}]: <template x-if="${expr}"> has ${tpl.children.length} root elements (Alpine.js strictly requires 1 root element).`
      );
    }
  }
  return xIfTemplates.length;
}

export function runSyntaxAndTemplateChecks(rootDir = process.cwd()) {
  const startTime = performance.now();

  // 1. Parse 100% of .mjs files across src/, scripts/, workers/, and tests/, plus public/pae-shell.js
  const mjsCount = verifyAllMjsSyntax(rootDir);
  const paeShellPath = path.join(rootDir, 'public', 'pae-shell.js');
  if (fs.existsSync(paeShellPath)) {
    const shellCode = fs.readFileSync(paeShellPath, 'utf8');
    new vm.Script(shellCode, { filename: 'pae-shell.js' });
  }

  // 2. Render all 7 SSR UI pages (including folder-scoped variants) with zero DB/network
  const foldersSettingsHtml = getCampaignFoldersPageHtml('test_folder_123', 'settings');
  const ssrPages = [
    ['dashboard-ui', getDashboardHtml('test_folder_123')],
    ['keywords-ui', getKeywordsPageHtml()],
    ['keywords-ui (folder-scoped)', getKeywordsPageHtml('', '', 'test_folder_123')],
    ['discovery-ui', getDiscoveryPageHtml()],
    ['pin-details-ui', getPinDetailPageHtml('1098245059167667976')],
    ['campaign-folders-ui', getCampaignFoldersPageHtml()],
    ['campaign-folders-ui (settings)', foldersSettingsHtml],
    ['domains-ui', getDomainsPageHtml('example.com')],
    ['pulse-ui', getPulsePageHtml()]
  ];

  // 3. Compile inline <script> blocks via vm.Script & verify DOM tag balance + <template x-if> single-root nesting
  let totalInlineScripts = 0;
  let totalXIfTemplates = 0;
  for (const [label, html] of ssrPages) {
    totalInlineScripts += validateInlineScriptsForPage(label, html);
    countTagBalance(html, label);
    const tree = parseHtmlElementTree(html);
    totalXIfTemplates += verifyAlpineTemplateXIfSingleRoot(tree, label);
  }

  // 4. Verify Campaign Folders Room 1 / Room 5 / VIEW A / VIEW B sibling & ancestor hierarchy
  const foldersRoot = parseHtmlElementTree(foldersSettingsHtml);
  const room5 = findNodes(foldersRoot, (n) => n.attrs?.['x-show'] === "currentRoom === 'settings'")[0];
  const room1 = findNodes(foldersRoot, (n) => n.attrs?.['x-show'] === "currentRoom !== 'settings'")[0];
  const viewA = findNodes(foldersRoot, (n) => n.attrs?.['x-show'] === 'activeFolderId')[0];
  const viewB = findNodes(foldersRoot, (n) => n.attrs?.['x-show'] === '!activeFolderId')[0];

  if (!room5 || !room1 || !viewA || !viewB) {
    throw new Error('FAIL [campaign-folders-ui]: Missing Room 1, Room 5, VIEW A, or VIEW B container.');
  }

  const room5Ancestors = [];
  let curr = room5.parent;
  while (curr && curr.tag !== 'ROOT') {
    room5Ancestors.push(curr);
    curr = curr.parent;
  }
  const room5XShowAncestors = room5Ancestors.filter((a) => a.attrs && a.attrs['x-show']);
  if (room5XShowAncestors.length !== 1 || room5XShowAncestors[0].attrs['x-show'] !== 'activeFolderId') {
    throw new Error(
      `FAIL [campaign-folders-ui]: Room 5 x-show ancestors are [${room5XShowAncestors.map((a) => a.attrs['x-show']).join(', ')}]; expected ['activeFolderId'].`
    );
  }
  if (room5Ancestors.includes(room1)) {
    throw new Error('FAIL [campaign-folders-ui]: Room 5 must not be nested inside Room 1.');
  }
  if (room1.parent !== viewA || room5.parent !== viewA) {
    throw new Error('FAIL [campaign-folders-ui]: Room 1 and Room 5 must be direct children of VIEW A.');
  }
  if (viewA.parent !== viewB.parent) {
    throw new Error('FAIL [campaign-folders-ui]: VIEW A and VIEW B must share the same parent container.');
  }

  const durationMs = (performance.now() - startTime).toFixed(1);
  console.log(
    `✅ [STATIC CHECK PASSED] ${mjsCount} .mjs files, ${totalInlineScripts} inline <script> blocks, ${ssrPages.length} SSR DOM trees, and ${totalXIfTemplates} <template x-if> roots verified in ${durationMs}ms.`
  );
  return { mjsCount, totalInlineScripts, ssrViews: ssrPages.length, totalXIfTemplates };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runSyntaxAndTemplateChecks(process.cwd());
  } catch (err) {
    console.error(`❌ [STATIC CHECK FAILED] ${err?.message || err}`);
    process.exit(1);
  }
}
