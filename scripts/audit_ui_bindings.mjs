import fs from 'fs';

const content = fs.readFileSync('src/dashboard-ui.mjs', 'utf8');

// Find start and end of dashboardApp
const appStart = content.indexOf('function dashboardApp() {');
const appEnd = content.indexOf('</script>', appStart);
const appCode = content.slice(appStart, appEnd);

// Extract all method calls in @click / @change / @submit
const clickMatches = content.matchAll(/@(click|change|submit)(?:\.[a-z]+)*="([^"]+)"/g);
const calledMethods = new Set();
for (const m of clickMatches) {
  const expr = m[2].trim();
  const subExpressions = expr.split(';');
  for (let s of subExpressions) {
    s = s.trim();
    const methodMatch = s.match(/^([a-zA-Z0-9_$]+)\s*\(/);
    if (methodMatch) {
      calledMethods.add(methodMatch[1]);
    }
  }
}

const builtins = new Set(['confirm', 'alert', 'console', 'window', 'Math', 'Number', 'String', 'Array', 'Date', 'Boolean', 'encodeURIComponent', 'decodeURIComponent']);
const missing = [];
for (const method of calledMethods) {
  if (builtins.has(method)) continue;
  const hasDef = new RegExp('(?:async\\s+)?' + method + '\\s*\\(').test(appCode) || new RegExp(method + '\\s*:').test(appCode);
  if (!hasDef) {
    missing.push(method);
  }
}

console.log('Called methods count:', calledMethods.size);
console.log('Missing methods from dashboardApp:', missing);

// Check x-model properties
const modelMatches = content.matchAll(/x-model(?:\.[a-z]+)*="([^"]+)"/g);
const modelProps = new Set();
for (const m of modelMatches) {
  const prop = m[1].trim();
  if (prop.includes('.')) {
    modelProps.add(prop.split('.')[0]);
  } else {
    modelProps.add(prop);
  }
}

const missingProps = [];
for (const prop of modelProps) {
  const hasDef = new RegExp('^\\s*' + prop + '\\s*:', 'm').test(appCode);
  if (!hasDef) {
    missingProps.push(prop);
  }
}

console.log('Model properties count:', modelProps.size);
console.log('Missing x-model properties from dashboardApp:', missingProps);
