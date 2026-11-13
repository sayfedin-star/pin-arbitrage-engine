/**
 * Unified PostgreSQL Client (Native VPS PostgreSQL SSOT)
 * Direct, zero-proxy postgres.js connection pool for the Unified Single-Database Architecture.
 */

import postgres from 'postgres';

let sharedClient = null;
let sharedDsn = null;

const PG_TRANSIENT_CONNECTION_CODES = new Set(['53300', '53400', '08006', '08001']);

/**
 * Returns true if error is a PostgreSQL connection slot exhaustion (SQLSTATE 53300)
 * or transient connection drop safe for automatic exponential-backoff retry.
 */
export function isTransientPgConnectionError(err) {
  if (!err) return false;
  const code = String(err.code || err.sqlState || '').trim();
  if (PG_TRANSIENT_CONNECTION_CODES.has(code)) return true;
  const msg = String(err.message || '');
  return /too many clients already|remaining connection slots are reserved|sorry, too many clients/i.test(msg);
}

/**
 * Returns true if error is a PostgreSQL statement timeout cancellation (SQLSTATE 57014).
 * Intentionally separated from automatic global retries so non-idempotent writes and fast Web APIs fail fast,
 * while explicit idempotent read callers can opt in via `withDbRetry(..., { retryOnStatementTimeout: true })`.
 */
export function isStatementTimeoutError(err) {
  if (!err) return false;
  const code = String(err.code || err.sqlState || '').trim();
  if (code === '57014') return true;
  const msg = String(err.message || '');
  return /canceling statement due to statement timeout/i.test(msg);
}

/**
 * Executes an async database operation with Exponential Backoff + Jitter on transient connection errors
 * (and optionally SQLSTATE 57014 statement timeouts when `retryOnStatementTimeout: true` is passed for idempotent reads).
 *
 * @template T
 * @param {() => Promise<T>} operation
 * @param {{ maxRetries?: number, baseDelayMs?: number, maxDelayMs?: number, retryOnStatementTimeout?: boolean, jitterFn?: () => number, sleepFn?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<T>}
 */
export async function withDbRetry(operation, options = {}) {
  const maxRetries = Math.max(0, Number(options.maxRetries ?? 4));
  const baseDelayMs = Math.max(10, Number(options.baseDelayMs ?? 120));
  const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs ?? 3000));
  const retryOnStatementTimeout = Boolean(options.retryOnStatementTimeout);
  const jitterFn = typeof options.jitterFn === 'function' ? options.jitterFn : Math.random;
  const sleepFn = typeof options.sleepFn === 'function'
    ? options.sleepFn
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err) {
      const canRetry = isTransientPgConnectionError(err) || (retryOnStatementTimeout && isStatementTimeoutError(err));
      if (!canRetry || attempt >= maxRetries) {
        throw err;
      }
      const expDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      const jitter = Math.floor(jitterFn() * Math.max(20, Math.floor(expDelay * 0.5)));
      attempt += 1;
      await sleepFn(expDelay + jitter);
    }
  }
}

function executeAtomicTransaction(beginFn, queriesOrFn) {
  return beginFn(async (tx) => {
    if (typeof queriesOrFn === 'function') {
      const res = await queriesOrFn(tx);
      if (Array.isArray(res)) {
        const out = [];
        for (const item of res) {
          out.push(typeof item === 'function' ? await item(tx) : await item);
        }
        return out;
      }
      return res;
    }
    if (Array.isArray(queriesOrFn)) {
      const out = [];
      for (const q of queriesOrFn) {
        out.push(typeof q === 'function' ? await q(tx) : await q);
      }
      return out;
    }
    throw new TypeError(
      '[INVARIANT: HYPERDRIVE-ATOMIC-BUILDER] sql.transaction() strictly requires a callback or an array of lazy query builders.'
    );
  });
}

/**
 * Wraps a postgres.js client with:
 * 1. Lazy fragment-safe SQLSTATE 53300 retry bridge (intercepting .then() only when awaited, never altering nested PendingQuery fragments).
 * 2. Clean `.transaction()` helper bridged onto `.begin()` with 53300 retry.
 *
 * @param {Function} pgClient
 * @param {object} [retryOptions]
 * @returns {Function}
 */
export function attachTransactionBridge(pgClient, retryOptions = {}) {
  if (!pgClient || pgClient.__unifiedTxAttached) {
    return pgClient;
  }

  const origBegin = typeof pgClient.begin === 'function' ? pgClient.begin.bind(pgClient) : null;
  const origUnsafe = typeof pgClient.unsafe === 'function' ? pgClient.unsafe.bind(pgClient) : null;

  // Expose an unwrapped noRetry sibling so callers inside explicit `withDbRetry(...)` never double-stack retries
  const noRetryTransaction = origBegin
    ? async (queriesOrFn) => executeAtomicTransaction(origBegin, queriesOrFn)
    : undefined;

  const noRetryClient = new Proxy(pgClient, {
    get(target, prop, receiver) {
      if (prop === 'begin' && origBegin) return origBegin;
      if (prop === 'unsafe' && origUnsafe) return origUnsafe;
      if (prop === 'transaction' && noRetryTransaction) return noRetryTransaction;
      if (prop === 'noRetry') return noRetryClient;
      return Reflect.get(target, prop, receiver);
    },
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args);
    }
  });

  if (origBegin) {
    pgClient.begin = async (...args) => withDbRetry(() => origBegin(...args), retryOptions);
  }

  if (origUnsafe) {
    pgClient.unsafe = (...args) => {
      const invoke = () => origUnsafe(...args);
      const pending = invoke();
      return wrapPendingQueryRetry(pending, invoke, retryOptions);
    };
  }

  if (typeof pgClient.transaction !== 'function' && typeof pgClient.begin === 'function') {
    pgClient.transaction = async (queriesOrFn) => {
      return await executeAtomicTransaction(pgClient.begin, queriesOrFn);
    };
  }

  pgClient.__unifiedTxAttached = true;
  pgClient.__atomicBuilderWrapped = true;

  return new Proxy(pgClient, {
    get(target, prop, receiver) {
      if (prop === 'noRetry') return noRetryClient;
      return Reflect.get(target, prop, receiver);
    },
    apply(target, thisArg, args) {
      const invoke = () => Reflect.apply(target, thisArg, args);
      const result = invoke();
      const isTemplateCall = Array.isArray(args[0]) && Object.hasOwn(args[0], 'raw');
      if (isTemplateCall && result && typeof result.then === 'function') {
        return wrapPendingQueryRetry(result, invoke, retryOptions);
      }
      return result;
    }
  });
}

function wrapPendingQueryRetry(pending, invokeFn, retryOptions = {}) {
  if (!pending || typeof pending.then !== 'function' || pending.__paeRetryWrapped) {
    return pending;
  }
  const origThen = pending.then.bind(pending);
  const modifiers = [];
  for (const modName of ['values', 'raw', 'simple']) {
    if (typeof pending[modName] === 'function') {
      const origMod = pending[modName].bind(pending);
      Object.defineProperty(pending, modName, {
        value: (...modArgs) => {
          modifiers.push([modName, modArgs]);
          const res = origMod(...modArgs);
          return res === pending || !res ? pending : wrapPendingQueryRetry(res, () => {
            let rebuilt = invokeFn();
            for (const [m, a] of modifiers) {
              if (rebuilt && typeof rebuilt[m] === 'function') rebuilt = rebuilt[m](...a);
            }
            return rebuilt;
          }, retryOptions);
        },
        configurable: true,
        enumerable: false,
        writable: true
      });
    }
  }

  let settledPromise = null;

  const executeWithRetry = () => {
    if (!settledPromise) {
      settledPromise = (async () => {
        try {
          return await new Promise((resolve, reject) => {
            origThen(resolve, reject);
          });
        } catch (err) {
          const maxRetries = Math.max(0, Number(retryOptions.maxRetries ?? 4));
          if (!isTransientPgConnectionError(err) || maxRetries === 0) {
            throw err;
          }
          const baseDelayMs = Math.max(10, Number(retryOptions.baseDelayMs ?? 120));
          const maxDelayMs = Math.max(baseDelayMs, Number(retryOptions.maxDelayMs ?? 3000));
          const jitterFn = typeof retryOptions.jitterFn === 'function' ? retryOptions.jitterFn : Math.random;
          const sleepFn = typeof retryOptions.sleepFn === 'function'
            ? retryOptions.sleepFn
            : (ms) => new Promise((resolve) => setTimeout(resolve, ms));

          const firstDelay = Math.min(maxDelayMs, baseDelayMs);
          const firstJitter = Math.floor(jitterFn() * Math.max(20, Math.floor(firstDelay * 0.5)));
          await sleepFn(firstDelay + firstJitter);

          return await withDbRetry(async () => {
            let nextQuery = invokeFn();
            for (const [modName, modArgs] of modifiers) {
              if (nextQuery && typeof nextQuery[modName] === 'function') {
                nextQuery = nextQuery[modName](...modArgs);
              }
            }
            if (nextQuery && typeof nextQuery.then === 'function') {
              return await nextQuery;
            }
            return nextQuery;
          }, {
            ...retryOptions,
            maxRetries: Math.max(0, maxRetries - 1),
            baseDelayMs: Math.min(maxDelayMs, baseDelayMs * 2)
          });
        }
      })();
    }
    return settledPromise;
  };

  Object.defineProperty(pending, '__paeRetryWrapped', { value: true, enumerable: false });
  Object.defineProperty(pending, 'then', {
    value: (onFulfilled, onRejected) => executeWithRetry().then(onFulfilled, onRejected),
    configurable: true,
    enumerable: false,
    writable: true
  });
  return pending;
}

/**
 * Creates a clean direct postgres.js client for the Unified Single-Database system.
 *
 * @param {string} dsn - PostgreSQL connection string
 * @param {object} [options] - Connection pool options
 * @returns {Function} postgres.js SQL tag function
 */
export function createSqlClient(dsn, options = {}) {
  const cleanDsn = String(
    dsn ||
    (typeof process !== 'undefined' ? process.env?.DATABASE_URL : '') ||
    ''
  ).trim();

  if (!cleanDsn) {
    throw new Error('[db/client] DATABASE_URL is required to initialize the PostgreSQL client.');
  }

  const isCi = typeof process !== 'undefined' && Boolean(process.env?.GITHUB_ACTIONS);
  const defaultMax = isCi ? 3 : 15;
  const requestedMax = Number(
    options.max ||
    (typeof process !== 'undefined' ? process.env?.PG_POOL_MAX : 0) ||
    defaultMax
  );
  // Cap GITHUB_ACTIONS pool size to 3-4 connections
  const maxConnections = isCi ? Math.max(1, Math.min(requestedMax, 4)) : Math.max(1, requestedMax);
  const defaultStatementTimeoutMs = isCi ? 45000 : 15000;

  const pgClient = postgres(cleanDsn, {
    max: maxConnections,
    idle_timeout: Number(options.idle_timeout ?? 20),
    connect_timeout: Number(options.connect_timeout ?? 10),
    max_lifetime: Number(options.max_lifetime ?? 300),
    keep_alive: Number(options.keep_alive ?? 30),
    onnotice: typeof options.onnotice === 'function' ? options.onnotice : () => {},
    connection: {
      ...(options.connection || {}),
      statement_timeout: Number(options.connection?.statement_timeout ?? defaultStatementTimeoutMs),
      idle_in_transaction_session_timeout: Number(options.connection?.idle_in_transaction_session_timeout ?? 10000),
      max_parallel_workers_per_gather: 0
    },
    prepare: false,
    transform: {
      undefined: null
    },
    types: {
      json: {
        to: 114,
        from: [114, 3802],
        serialize: (x) => (typeof x === 'string' ? x : JSON.stringify(x)),
        parse: (x) => {
          if (typeof x !== 'string') return x;
          try {
            return JSON.parse(x);
          } catch (_) {
            return x;
          }
        }
      }
    }
  });

  return attachTransactionBridge(pgClient, options.retry);
}

/**
 * Returns the shared singleton PostgreSQL client for the active process.
 *
 * @param {object} [env] - Optional environment bindings
 * @returns {Function}
 */
export function getSqlClient(env = null) {
  const dsn = String(
    env?.DATABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.DATABASE_URL : '') ||
    ''
  ).trim();

  if (sharedClient && sharedDsn === dsn) {
    return sharedClient;
  }

  sharedClient = createSqlClient(dsn);
  sharedDsn = dsn;
  return sharedClient;
}

/**
 * Validates that a resolved DSN is a clean, genuine, unmasked Postgres connection string.
 * Guards against poisoned KV entries containing UI masks or redacted placeholders.
 */
export function isValidShardDsn(dsn) {
  if (!dsn || typeof dsn !== 'string') return false;
  const trimmed = dsn.trim();
  // [INVARIANT: BYTESTRING-HEADER-SAFETY]
  if (/[\x80-\uFFFF]/.test(trimmed)) return false;
  return (
    trimmed.startsWith('postgres://') ||
    trimmed.startsWith('postgresql://')
  ) &&
  trimmed.includes('@') &&
  !trimmed.includes('••••') &&
  !trimmed.includes('[REDACTED');
}

/**
 * Enforces PgBouncer transaction connection pooling (-pooler) on Neon URLs.
 * @param {string} url - Postgres DSN
 * @returns {string} Pooled Postgres DSN
 */
export function enforceNeonPoolerUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const cleanUrl = url.trim().replace(/[\r\n]/g, '');
  if (!cleanUrl.includes('.neon.tech') || cleanUrl.includes('-pooler')) return cleanUrl;

  return cleanUrl.replace(/(@|:\/\/)([a-z0-9_-]+)(\.[a-z0-9_.-]*neon\.tech)/i, (match, prefix, endpointId, suffix) => {
    if (endpointId.endsWith('-pooler')) return match;
    return `${prefix}${endpointId}-pooler${suffix}`;
  });
}

export const shardSqlClients = new Map(); // clean canonical dsn -> postgres client
export const MAX_SHARD_SQL_CLIENTS = 48;

export function getCachedShardSqlClient(dsn) {
  if (!dsn) return null;
  const cleanDsn = enforceNeonPoolerUrl(dsn);
  if (!shardSqlClients.has(cleanDsn)) return null;
  const client = shardSqlClients.get(cleanDsn);
  shardSqlClients.delete(cleanDsn);
  shardSqlClients.set(cleanDsn, client);
  return client;
}

export function setCachedShardSqlClient(dsn, client) {
  if (!dsn || !client) return;
  const cleanDsn = enforceNeonPoolerUrl(dsn);
  if (shardSqlClients.has(cleanDsn)) {
    shardSqlClients.delete(cleanDsn);
  } else if (shardSqlClients.size >= MAX_SHARD_SQL_CLIENTS) {
    const oldestKey = shardSqlClients.keys().next().value;
    if (oldestKey) {
      const evicted = shardSqlClients.get(oldestKey);
      shardSqlClients.delete(oldestKey);
      try {
        evicted?.end?.({ timeout: 1 });
      } catch (_) {}
    }
  }
  shardSqlClients.set(cleanDsn, client);
}

export function wrapShardNeonTransaction(client) {
  if (!client || client.__atomicBuilderWrapped || client.__unifiedTxAttached) {
    if (client && !client.__atomicBuilderWrapped) {
      client.__atomicBuilderWrapped = true;
    }
    return client;
  }
  if (typeof client.begin === 'function') {
    client.transaction = async (queriesOrFn) => {
      return await executeAtomicTransaction(client.begin.bind(client), client, queriesOrFn);
    };
    client.__atomicBuilderWrapped = true;
    return client;
  }
  if (typeof client.transaction !== 'function') {
    return client;
  }
  const origTransaction = client.transaction.bind(client);
  // [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]
  client.transaction = async (queriesOrFn, opts) => {
    if (typeof queriesOrFn === 'function') {
      return await origTransaction((tx) => {
        const res = queriesOrFn(tx);
        if (Array.isArray(res)) {
          return res.map(item => (typeof item === 'function' ? item(tx) : item));
        }
        return res;
      }, opts);
    }
    if (Array.isArray(queriesOrFn)) {
      if (queriesOrFn.length === 0) return [];
      const builtQueries = queriesOrFn.map(q => (typeof q === 'function' ? q(client) : q));
      return await origTransaction(builtQueries, opts);
    }
    throw new TypeError(
      '[INVARIANT: HYPERDRIVE-ATOMIC-BUILDER] shardSql.transaction() strictly requires a callback or an array of lazy query builders.'
    );
  };
  client.__atomicBuilderWrapped = true;
  return client;
}

/**
 * Unified PostgreSQL Connector (Native VPS TCP postgres.js SSOT)
 */
export function createUniversalSqlClient(dsn, options = {}) {
  if (!dsn || typeof dsn !== 'string') {
    throw new Error('createUniversalSqlClient requires a valid PostgreSQL connection string');
  }
  const cleanDsn = dsn.trim();
  return wrapShardNeonTransaction(createSqlClient(cleanDsn, options));
}

export function getOrCreateShardSqlClient(pooledDsn) {
  let client = getCachedShardSqlClient(pooledDsn);
  if (!client) {
    client = createUniversalSqlClient(pooledDsn);
    setCachedShardSqlClient(pooledDsn, client);
  }
  return client;
}

/**
 * Test helper: Register in-memory SQL client for a DSN
 */
export function _setShardSqlClient(dsn, client) {
  setCachedShardSqlClient(enforceNeonPoolerUrl(dsn), client);
}

