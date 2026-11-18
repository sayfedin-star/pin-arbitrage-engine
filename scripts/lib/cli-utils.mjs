/**
 * Shared CLI & Fleet Worker Utilities (scripts/lib/cli-utils.mjs)
 * Centralizes official InstaBox activity leases (PUT/DELETE /activity-leases/{taskId}),
 * database connection cleanup, GitHub Actions output writing, terminal progress bars,
 * and .env loading.
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LEASE_RENEW_INTERVAL_MS = 240_000; // 4 minutes
const DEFAULT_LEASE_TTL_SECONDS = 600; // 10 minutes

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
 * Acquires, periodically renews (every 240s), and cleanly releases (on `await lease.stop()`)
 * an official InstaBox Activity Lease (`PUT` / `DELETE /v1/machines/{id}/activity-leases/{taskId}`)
 * so long-running crawlers prevent 30-minute idle auto-pause while active, and allow immediate
 * 0s-cooldown idle sleep once finished.
 *
 * @param {string|number|object} [taskNameOrOptions='cli-worker']
 * @param {object} [maybeOptions={}]
 * @returns {{ active: boolean, taskId: string, ready: Promise<boolean>, stop: () => Promise<void> }}
 */
export function startInstaBoxActivityLease(taskNameOrOptions = 'cli-worker', maybeOptions = {}) {
  let rawTaskName = 'cli-worker';
  let opts = {};

  if (typeof taskNameOrOptions === 'string') {
    rawTaskName = taskNameOrOptions;
    opts = maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {};
  } else if (typeof taskNameOrOptions === 'number') {
    opts = { intervalMs: taskNameOrOptions };
  } else if (taskNameOrOptions && typeof taskNameOrOptions === 'object') {
    opts = taskNameOrOptions;
    if (typeof opts.taskName === 'string') {
      rawTaskName = opts.taskName;
    }
  }

  const machineId = String(opts.machineId ?? process.env.INSTABOX_MACHINE_ID ?? '').trim();
  const apiKey = String(opts.apiKey ?? process.env.INSTABOX_API_KEY ?? '').trim();
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const intervalMs = Math.max(1000, Number(opts.intervalMs ?? DEFAULT_LEASE_RENEW_INTERVAL_MS));
  const ttlSeconds = Math.max(60, Math.floor(Number(opts.ttlSeconds ?? DEFAULT_LEASE_TTL_SECONDS)));
  const pid = opts.pid ?? process.pid;

  const sanitizedName = String(rawTaskName || 'cli-worker')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cli-worker';
  const taskId = String(opts.taskId || `pae-${sanitizedName}-${pid}`)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 96);

  if (!machineId || !apiKey || typeof fetchFn !== 'function') {
    return {
      active: false,
      taskId,
      ready: Promise.resolve(false),
      stop: async () => {}
    };
  }

  const leaseUrl = `https://api.instabox.sh/v1/machines/${encodeURIComponent(machineId)}/activity-leases/${encodeURIComponent(taskId)}`;
  const authHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'X-API-Key': apiKey
  };

  let stopped = false;

  const acquireOrRenew = async () => {
    if (stopped) return false;
    try {
      const res = await fetchFn(leaseUrl, {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttlSeconds }),
        signal: AbortSignal.timeout(8000)
      });
      return Boolean(res?.ok);
    } catch (_) {
      return false;
    }
  };

  // Acquire activity lease immediately on start
  const initialPromise = acquireOrRenew();

  const timer = setInterval(() => {
    acquireOrRenew().catch(() => {});
  }, intervalMs);
  timer.unref?.();

  return {
    active: true,
    taskId,
    ready: initialPromise,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await initialPromise.catch(() => {});
      try {
        await fetchFn(leaseUrl, {
          method: 'DELETE',
          headers: authHeaders,
          signal: AbortSignal.timeout(8000)
        });
      } catch (_) {}
    }
  };
}

/**
 * Gracefully releases any active InstaBox activity lease, closes a postgres.js SQL client,
 * and exits the process.
 */
export async function closeCrawlerDb(sql, exitCode = 0, lease = null) {
  try {
    if (lease && typeof lease.stop === 'function') {
      await lease.stop();
    }
  } catch (_) {}
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

/**
 * Dynamically initializes and registers an Undici keep-alive Agent on
 * globalThis[Symbol.for('undici.globalDispatcher.1')] without static undici imports
 * or fragile version gates.
 */
export async function bootstrapUndiciKeepAliveDispatcher(setDefaultDispatcherFn = null) {
  let undiciAgent = null;
  try {
    await fetch('data:text/plain,ok').catch(() => {});
    const sym = Symbol.for('undici.globalDispatcher.1');
    let candidateAgent = null;
    if (globalThis[sym]?.constructor?.name && globalThis[sym].constructor.name !== 'Dispatcher1Wrapper') {
      try {
        candidateAgent = new globalThis[sym].constructor({ keepAliveTimeout: 30000, connections: 50, pipelining: 1 });
      } catch (_) {}
    }
    if (!candidateAgent) {
      const undiciMod = await import('undici').catch(() => null);
      const AgentCtor = undiciMod?.Agent || undiciMod?.default?.Agent;
      if (AgentCtor) {
        candidateAgent = new AgentCtor({ keepAliveTimeout: 30000, connections: 50, pipelining: 1 });
      }
    }
    if (candidateAgent) {
      globalThis[sym] = candidateAgent;
      undiciAgent = candidateAgent;
      await import('undici').catch(() => {});
      globalThis[sym] = candidateAgent;
      if (typeof setDefaultDispatcherFn === 'function') {
        setDefaultDispatcherFn(undiciAgent);
      }
    }
  } catch (_) {}
  return undiciAgent;
}
