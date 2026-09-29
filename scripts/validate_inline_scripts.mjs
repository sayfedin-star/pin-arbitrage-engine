import fs from 'fs';
import vm from 'node:vm';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';

const html = getDashboardHtml();
const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi);

console.log(`Found ${scriptMatches.length} script tags in getDashboardHtml()`);

let hasError = false;
scriptMatches.forEach((s, i) => {
  if (!s.includes('src=')) {
    const code = s.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
    try {
      new vm.Script(code);
      console.log(`Script ${i}: Syntax OK (valid JS)`);
    } catch (err) {
      hasError = true;
      console.error(`[-] SCRIPT ${i} HAS SYNTAX ERROR:`, err.message);
      const lines = code.split('\n');
      // find line number from stack
      const match = err.stack.match(/<anonymous>:(\d+)/);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        console.error(`    At line ${lineNum}:`);
        for (let l = Math.max(0, lineNum - 3); l <= Math.min(lines.length - 1, lineNum + 3); l++) {
          console.error(`    ${l + 1}: ${lines[l]}`);
        }
      }
    }
  }
});

if (!hasError) {
  console.log('[+] ALL inline scripts have 100% valid JavaScript syntax!');
}
