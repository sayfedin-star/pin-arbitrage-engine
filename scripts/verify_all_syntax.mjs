/**
 * Dynamic Universal Syntax & Compilation Verifier
 * 
 * Automatically walks src/ and scripts/ and executes `node -c` across 100% of .mjs files,
 * eliminating the need for brittle, error-prone manual command chains in package.json.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

console.log('=== Running Dynamic Universal Syntax Verification ===\n');

function scanDirectory(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'scratch') {
        scanDirectory(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const files = [
  ...scanDirectory('src'),
  ...scanDirectory('scripts')
];

let failedCount = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['-c', file], { stdio: 'pipe' });
  } catch (err) {
    console.error(`❌ Syntax Error in ${file}:`);
    console.error(err.stderr ? err.stderr.toString() : err.message);
    failedCount++;
  }
}

if (failedCount > 0) {
  console.error(`\n❌ Failed syntax check on ${failedCount} files!`);
  process.exit(1);
} else {
  console.log(`✅ [SYNTAX CHECK PASSED] 100% of ${files.length} .mjs files compiled with zero syntax errors.\n`);
}
