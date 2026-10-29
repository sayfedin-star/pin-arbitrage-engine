/**
 * Verification Script: verify_dom_nesting.mjs
 * Proves that Room 5 (<div x-show="currentRoom === 'settings'">) in src/campaign-folders-ui.mjs
 * has x-show="activeFolderId" as its ONLY x-show ancestor, is a direct sibling of Room 1,
 * and that VIEW A closes cleanly before VIEW B.
 */

import { getCampaignFoldersPageHtml } from '../src/campaign-folders-ui.mjs';

export function parseHtmlElementTree(html) {
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const tagRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9-]+)((?:\s+[^"'/>\s]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/)?>/g;

  const root = { tag: 'ROOT', attrs: {}, children: [], parent: null };
  const stack = [root];

  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const full = match[0];
    if (full.startsWith('<!--')) {
      continue;
    }
    const isClosing = Boolean(match[1]);
    const tagName = match[2].toLowerCase();
    const rawAttrs = match[3] || '';
    const isSelfClosing = Boolean(match[4]) || voidTags.has(tagName);

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
        const name = attrMatch[1];
        const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        attrs[name] = val;
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

export function runDomNestingVerification() {
  const html = getCampaignFoldersPageHtml('test_folder_123', 'settings');
  const root = parseHtmlElementTree(html);

  function findNodes(node, predicate, results = []) {
    if (predicate(node)) results.push(node);
    for (const child of node.children) {
      findNodes(child, predicate, results);
    }
    return results;
  }

  // 1. Locate Room 5
  const room5Nodes = findNodes(root, n => n.attrs && n.attrs['x-show'] === "currentRoom === 'settings'");
  if (room5Nodes.length === 0) {
    throw new Error('FAIL: Room 5 (<div x-show="currentRoom === \'settings\'">) not found in HTML output!');
  }
  const room5 = room5Nodes[0];

  // 2. Locate Room 1
  const room1Nodes = findNodes(root, n => n.attrs && n.attrs['x-show'] === "currentRoom !== 'settings'");
  if (room1Nodes.length === 0) {
    throw new Error('FAIL: Room 1 (<div x-show="currentRoom !== \'settings\'">) not found in HTML output!');
  }
  const room1 = room1Nodes[0];

  // 3. Locate VIEW A and VIEW B
  const viewANodes = findNodes(root, n => n.attrs && n.attrs['x-show'] === "activeFolderId");
  if (viewANodes.length === 0) {
    throw new Error('FAIL: VIEW A (<div x-show="activeFolderId">) not found in HTML output!');
  }
  const viewA = viewANodes[0];

  const viewBNodes = findNodes(root, n => n.attrs && n.attrs['x-show'] === "!activeFolderId");
  if (viewBNodes.length === 0) {
    throw new Error('FAIL: VIEW B (<div x-show="!activeFolderId">) not found in HTML output!');
  }
  const viewB = viewBNodes[0];

  // 4. Trace ancestors of Room 5
  const room5Ancestors = [];
  let curr = room5.parent;
  while (curr && curr.tag !== 'ROOT') {
    room5Ancestors.push(curr);
    curr = curr.parent;
  }
  const room5XShowAncestors = room5Ancestors.filter(a => a.attrs && a.attrs['x-show']);

  // Assertions
  if (room5XShowAncestors.length !== 1 || room5XShowAncestors[0].attrs['x-show'] !== 'activeFolderId') {
    throw new Error(`FAIL: Room 5 x-show ancestors are [${room5XShowAncestors.map(a => a.attrs['x-show']).join(', ')}]. Expected ONLY ['activeFolderId']!`);
  }

  // Assert Room 5 is NOT inside Room 1
  if (room5Ancestors.includes(room1)) {
    throw new Error('FAIL: Room 5 is physically nested inside Room 1!');
  }

  // Assert Room 1 and Room 5 share the same direct parent (VIEW A)
  if (room1.parent !== viewA || room5.parent !== viewA) {
    throw new Error(`FAIL: Room 1 and Room 5 must be direct children of VIEW A! (room1.parent=${room1.parent?.attrs?.['x-show']}, room5.parent=${room5.parent?.attrs?.['x-show']})`);
  }

  // Assert VIEW A and VIEW B are siblings under main
  if (viewA.parent !== viewB.parent) {
    throw new Error('FAIL: VIEW A and VIEW B must share the same parent container!');
  }

  console.log('✅ [DOM NESTING VERIFIED] Room 5 has x-show="activeFolderId" as its ONLY x-show ancestor.');
  console.log('✅ [DOM NESTING VERIFIED] Room 1 and Room 5 are direct siblings inside VIEW A.');
  console.log('✅ [DOM NESTING VERIFIED] VIEW A closes cleanly before VIEW B.');
  return true;
}

try {
  runDomNestingVerification();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
