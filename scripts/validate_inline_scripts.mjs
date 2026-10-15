import fs from 'fs';
import vm from 'node:vm';
import { getDashboardHtml } from '../src/dashboard-ui.mjs';
import { getKeywordsPageHtml } from '../src/keywords-ui.mjs';
import { getDiscoveryPageHtml } from '../src/discovery-ui.mjs';
import { getPinDetailPageHtml } from '../src/pin-details-ui.mjs';
import { getCampaignFoldersPageHtml } from '../src/campaign-folders-ui.mjs';
import { getDomainsPageHtml } from '../src/domains-ui.mjs';

function validateHtml(name, html) {
  const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  console.log(`Found ${scriptMatches.length} script tags in ${name}()`);

  let hasError = false;
  scriptMatches.forEach((s, i) => {
    if (!s.includes('src=')) {
      const code = s.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
      try {
        new vm.Script(code);
        console.log(`[${name}] Script ${i}: Syntax OK (valid JS)`);
      } catch (err) {
        hasError = true;
        console.error(`[-] [${name}] SCRIPT ${i} HAS SYNTAX ERROR:`, err.message);
        const lines = code.split('\n');
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
  return !hasError;
}

const ok1 = validateHtml('getDashboardHtml', getDashboardHtml());
const ok2 = validateHtml('getKeywordsPageHtml', getKeywordsPageHtml());
const ok4 = validateHtml('getDiscoveryPageHtml', getDiscoveryPageHtml());
const ok5 = validateHtml('getPinDetailPageHtml', getPinDetailPageHtml('1098245059167667976'));
const ok6 = validateHtml('getCampaignFoldersPageHtml', getCampaignFoldersPageHtml());
const ok7 = validateHtml('getDomainsPageHtml', getDomainsPageHtml());

if (ok1 && ok2 && ok4 && ok5 && ok6 && ok7) {
  console.log('[+] ALL inline scripts in all 6 suites have 100% valid JavaScript syntax!');
} else {
  process.exit(1);
}

