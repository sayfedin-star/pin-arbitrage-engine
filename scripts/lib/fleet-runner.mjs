/**
 * Unified Fleet Runner & CLI Lifecycle Engine (scripts/lib/fleet-runner.mjs)
 *
 * Centralizes:
 * 1. .env loading via native Node.js `process.loadEnvFile()`
 * 2. Undici keep-alive HTTP dispatcher bootstrap
 * 3. InstaBox Activity Lease acquisition, renewal & teardown (`PUT` / `DELETE /activity-leases/{taskId}`)
 * 4. `runFleetLifecycle(taskName, async ({ sql, lease }) => ...)` guaranteeing `lease.stop()`
 *    and `sql.end({ timeout: 3 })` in `finally` on both success and uncaught errors
 * 5. Deterministic 20-worker modulo validation (`workerIndex`, `workerTotal`)
 * 6. GitHub Actions outputs (`writeGitHubOutput`), step summaries (`appendStepSummary`),
 *    CLI flag parsing (`parseCliFlags`), and terminal progress bars (`renderProgressBar`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createSqlClient } from '../../src/db/client.mjs';

const DEFAULT_LEASE_RENEW_INTERVAL_MS = 240_000; // 4 minutes
const DEFAULT_LEASE_TTL_SECONDS = 600; // 10 minutes
export const DEFAULT_FLEET_WORKER_TOTAL = 20;

/**
 * Loads `.env` variables into `process.env` when present on disk using native `process.loadEnvFile()`.
 */
export function loadDotEnvIfPresent(envFilePath = '.env') {
  const resolved = path.resolve(process.cwd(), envFilePath);
  if (!fs.existsSync(resolved)) return false;

  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(resolved);
      return true;
    } catch (_) {}
  }

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
        if (k && process.env[k] === undefined) {
          process.env[k] = v;
        }
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Dynamically initializes and registers an Undici keep-alive Agent on
 * `globalThis[Symbol.for('undici.globalDispatcher.1')]` without static edge imports.
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

/**
 * Acquires, periodically renews (every 240s), and cleanly releases (on `await lease.stop()`)
 * an official InstaBox Activity Lease (`PUT` / `DELETE /v1/machines/{id}/activity-leases/{taskId}`).
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
 * Validates and resolves 20-worker modulo slice coordinates (`workerIndex`, `workerTotal`, `workerSlot`).
 * Supports both `WORKER_INDEX`/`WORKER_TOTAL` (0-based) and `SHARD_NUMBER`/`SHARD_TOTAL` (1-based).
 */
export function resolveWorkerPartition(options = {}) {
  const env = options.env || process.env || {};
  const defaultTotal = options.defaultTotal ?? DEFAULT_FLEET_WORKER_TOTAL;

  const rawTotal = options.workerTotal ?? env.WORKER_TOTAL ?? env.SHARD_TOTAL;
  let workerTotal = defaultTotal;
  if (rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== '') {
    const parsedTotal = Number(rawTotal);
    if (!Number.isInteger(parsedTotal) || parsedTotal < 1) {
      throw new RangeError(`Invalid workerTotal "${rawTotal}": must be a positive integer >= 1.`);
    }
    workerTotal = parsedTotal;
  }

  let workerIndex = 0;
  let hasExplicitIndex = false;

  if (options.workerIndex !== undefined && options.workerIndex !== null && String(options.workerIndex).trim() !== '') {
    const parsedIdx = Number(options.workerIndex);
    if (!Number.isInteger(parsedIdx) || parsedIdx < 0 || parsedIdx >= workerTotal) {
      throw new RangeError(`Invalid workerIndex "${options.workerIndex}": must be an integer in [0, ${workerTotal - 1}].`);
    }
    workerIndex = parsedIdx;
    hasExplicitIndex = true;
  } else if (env.SHARD_NUMBER !== undefined && String(env.SHARD_NUMBER).trim() !== '') {
    const parsedShardNum = Number(env.SHARD_NUMBER);
    if (!Number.isInteger(parsedShardNum) || parsedShardNum < 1 || parsedShardNum > workerTotal) {
      throw new RangeError(`Invalid SHARD_NUMBER "${env.SHARD_NUMBER}": must be an integer in [1, ${workerTotal}].`);
    }
    workerIndex = parsedShardNum - 1;
    hasExplicitIndex = true;
  } else if (env.WORKER_INDEX !== undefined && String(env.WORKER_INDEX).trim() !== '') {
    const parsedIdx = Number(env.WORKER_INDEX);
    if (!Number.isInteger(parsedIdx) || parsedIdx < 0 || parsedIdx >= workerTotal) {
      throw new RangeError(`Invalid WORKER_INDEX "${env.WORKER_INDEX}": must be an integer in [0, ${workerTotal - 1}].`);
    }
    workerIndex = parsedIdx;
    hasExplicitIndex = true;
  } else if (env.SHARD_INDEX !== undefined && String(env.SHARD_INDEX).trim() !== '') {
    const parsedIdx = Number(env.SHARD_INDEX);
    if (!Number.isInteger(parsedIdx) || parsedIdx < 0 || parsedIdx >= workerTotal) {
      throw new RangeError(`Invalid SHARD_INDEX "${env.SHARD_INDEX}": must be an integer in [0, ${workerTotal - 1}].`);
    }
    workerIndex = parsedIdx;
    hasExplicitIndex = true;
  }

  return {
    workerIndex,
    workerTotal,
    workerSlot: workerIndex + 1,
    hasExplicitIndex
  };
}

/**
 * Executes a CLI / Fleet task inside a hardened lifecycle wrapper that guarantees
 * `await lease.stop()` and `await sql.end({ timeout: 3 })` run unconditionally in `finally`
 * on both normal completion and uncaught exceptions.
 *
 * @param {string} taskName
 * @param {(ctx: { sql: any, lease: any, dispatcher: any, workerIndex: number, workerTotal: number, workerSlot: number }) => Promise<any>} taskFn
 * @param {object} [options={}]
 */
export async function runFleetLifecycle(taskName, taskFn, options = {}) {
  if (typeof taskFn !== 'function') {
    throw new TypeError('runFleetLifecycle requires an async task callback function.');
  }

  const {
    sqlClient = null,
    sqlOptions = undefined,
    requireDb = true,
    lease: injectedLease = null,
    leaseOptions = {},
    setDefaultDispatcher = null,
    loadEnv = process.env.NODE_ENV !== 'test',
    createSqlClientFn = createSqlClient,
    worker: workerOptions = {}
  } = options;

  if (loadEnv) {
    loadDotEnvIfPresent();
  }

  const dispatcher = setDefaultDispatcher
    ? await bootstrapUndiciKeepAliveDispatcher(setDefaultDispatcher)
    : null;

  const lease = injectedLease || startInstaBoxActivityLease(taskName, leaseOptions);
  let sql = sqlClient || null;

  try {
    const dbUrl = options.dbUrl !== undefined ? options.dbUrl : process.env.DATABASE_URL;
    if (!sql) {
      if (dbUrl) {
        sql = createSqlClientFn(dbUrl, sqlOptions);
      } else if (requireDb) {
        throw new Error(`DATABASE_URL environment variable is required for ${taskName}.`);
      }
    }

    const worker = resolveWorkerPartition(workerOptions);
    return await taskFn({
      sql,
      lease,
      dispatcher,
      ...worker
    });
  } finally {
    try {
      if (lease && typeof lease.stop === 'function') {
        await lease.stop();
      }
    } catch (_) {}
    try {
      if (sql && typeof sql.end === 'function') {
        await sql.end({ timeout: 3 });
      }
    } catch (_) {}
  }
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
      await sql.end({ timeout: 3 });
    }
  } catch (_) {}
  process.exit(exitCode);
}

/**
 * Appends a `key=value` pair to `$GITHUB_OUTPUT` when running in GitHub Actions.
 */
export async function writeGitHubOutput(key, value, githubOutputPath = process.env.GITHUB_OUTPUT || null) {
  if (!githubOutputPath) return false;
  try {
    const strVal = String(value ?? '');
    if (strVal.includes('\n')) {
      const delimiter = `PAE_EOF_${Date.now()}`;
      fs.appendFileSync(githubOutputPath, `${key}<<${delimiter}\n${strVal}\n${delimiter}\n`, 'utf8');
    } else {
      fs.appendFileSync(githubOutputPath, `${key}=${strVal}\n`, 'utf8');
    }
    return true;
  } catch (err) {
    console.warn(`[!] Failed writing to GITHUB_OUTPUT: ${err.message}`);
    return false;
  }
}

export const writeOutput = writeGitHubOutput;

/**
 * Appends Markdown telemetry to `$GITHUB_STEP_SUMMARY` when running in GitHub Actions.
 */
export function appendStepSummary(markdown, stepSummaryPath = process.env.GITHUB_STEP_SUMMARY || null) {
  if (!stepSummaryPath || !markdown) return false;
  try {
    fs.appendFileSync(stepSummaryPath, String(markdown), 'utf8');
    return true;
  } catch (err) {
    console.warn(`[!] Failed writing to GITHUB_STEP_SUMMARY: ${err.message}`);
    return false;
  }
}

/**
 * Renders a unicode terminal progress bar: `[████░░░░] 50.0% (5/10)`
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
 * Parses CLI flags (`--key=value`, `--key value`, `--boolean-flag`) into a plain object.
 */
export function parseCliFlags(argv = process.argv.slice(2)) {
  const flags = {};
  const positionals = [];
  const args = Array.isArray(argv) ? argv : [];

  for (let i = 0; i < args.length; i++) {
    const token = String(args[i] ?? '');
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const eqIdx = body.indexOf('=');
    if (eqIdx !== -1) {
      const k = body.slice(0, eqIdx).trim();
      const v = body.slice(eqIdx + 1).trim();
      if (k) flags[k] = v;
    } else {
      const k = body.trim();
      if (!k) continue;
      const next = args[i + 1];
      if (next !== undefined && !String(next).startsWith('--')) {
        flags[k] = String(next).trim();
        i++;
      } else {
        flags[k] = true;
      }
    }
  }

  return { flags, positionals };
}
