/**
 * Shared CLI & Fleet Worker Utilities (scripts/lib/cli-utils.mjs)
 * Centralizes InstaBox activity lease heartbeats, database connection cleanup,
 * GitHub Actions output writing, terminal progress bars, and .env loading.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads .env variables into process.env if present in local execution environments.
 */
export function loadDotEnvIfPresent(envFilePath = '.env') {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envFilePath);
    } catch (_) {}
  }
  const resolved = path.resolve(process.cwd(), envFilePath);
  if (!fs.existsSync(resolved)) return;
  try {
    const content = fs.readFileSync(resolved, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch (_) {}
}

/**
 * Periodically pings InstaBox machine API during long-running CLI tasks to keep VM lease active.
 */
export function startInstaBoxActivityLease(intervalMs = 300000) {
  const machineId = process.env.INSTABOX_MACHINE_ID;
  const apiKey = process.env.INSTABOX_API_KEY;
  if (!machineId || !apiKey) return { stop: () => {} };
  const timer = setInterval(async () => {
    try {
      await fetch(`https://api.instabox.sh/v1/machines/${machineId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000)
      }).catch(() => {});
    } catch (_) {}
  }, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

/**
 * Gracefully closes a postgres.js SQL client and exits the process.
 */
export async function closeCrawlerDb(sql, exitCode = 0) {
  try {
    if (sql && typeof sql.end === 'function') {
      await sql.end({ timeout: 2 });
    }
  } catch (_) {}
  process.exit(exitCode);
}

/**
 * Appends a key=value pair to GITHUB_OUTPUT when running in GitHub Actions.
 */
export async function writeOutput(key, value, githubOutputPath = process.env.GITHUB_OUTPUT || null) {
  if (githubOutputPath) {
    try {
      fs.appendFileSync(githubOutputPath, `${key}=${value}\n`, 'utf8');
    } catch (err) {
      console.warn(`[!] Failed writing to GITHUB_OUTPUT: ${err.message}`);
    }
  }
}

/**
 * Renders a unicode terminal progress bar: [████░░░░] 50.0% (5/10)
 */
export function renderProgressBar(current, total, width = 30) {
  const safeTotal = Math.max(1, total);
  const ratio = total > 0 ? Math.min(1, Math.max(0, current / safeTotal)) : 0;
  const filled = Math.round(width * ratio);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pct = (ratio * 100).toFixed(1);
  return `[${bar}] ${pct}% (${current}/${total})`;
}
