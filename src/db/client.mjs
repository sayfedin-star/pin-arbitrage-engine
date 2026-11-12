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
 * or transient connection drop safe for bounded exponential-backoff retry.
 */
export function isTransientPgConnectionError(err) {
  if (!err) return false;
  const code = String(err.code || err.sqlState || '').trim();
  if (PG_TRANSIENT_CONNECTION_CODES.has(code)) return true;
  const msg = String(err.message || '');
  return /too many clients already|remaining connection slots are reserved|sorry, too many clients/i.test(msg);
}

/**
 * Executes an async database operation with Exponential Backoff + Jitter on SQLSTATE 53300.
 *
 * @template T
 * @param {() => Promise<T>} operation
 * @param {{ maxRetries?: number, baseDelayMs?: number, maxDelayMs?: number, jitterFn?: () => number, sleepFn?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<T>}
 */
export async function withDbRetry(operation, options = {}) {
  const maxRetries = Math.max(0, Number(options.maxRetries ?? 4));
  const baseDelayMs = Math.max(10, Number(options.baseDelayMs ?? 120));
  const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs ?? 3000));
  const jitterFn = typeof options.jitterFn === 'function' ? options.jitterFn : Math.random;
  const sleepFn = typeof options.sleepFn === 'function'
    ? options.sleepFn
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err) {
      if (!isTransientPgConnectionError(err) || attempt >= maxRetries) {
        throw err;
      }
      const expDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      const jitter = Math.floor(jitterFn() * Math.max(20, Math.floor(expDelay * 0.5)));
      attempt += 1;
      await sleepFn(expDelay + jitter);
    }
  }
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
  if (origBegin) {
    pgClient.begin = async (...args) => withDbRetry(() => origBegin(...args), retryOptions);
  }

  const origUnsafe = typeof pgClient.unsafe === 'function' ? pgClient.unsafe.bind(pgClient) : null;
  if (origUnsafe) {
    pgClient.unsafe = (...args) => {
      const invoke = () => origUnsafe(...args);
      const pending = invoke();
      return wrapPendingQueryRetry(pending, invoke, retryOptions);
    };
  }

  if (typeof pgClient.transaction !== 'function' && typeof pgClient.begin === 'function') {
    pgClient.transaction = async (queriesOrFn) => {
      return await pgClient.begin(async (tx) => {
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
        return [];
      });
    };
  }

  pgClient.__unifiedTxAttached = true;

  return new Proxy(pgClient, {
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
  let settledPromise = null;

  const executeWithRetry = () => {
    if (!settledPromise) {
      settledPromise = (async () => {
        try {
          return await new Promise((resolve, reject) => {
            origThen(resolve, reject);
          });
        } catch (err) {
          if (!isTransientPgConnectionError(err)) {
            throw err;
          }
          return await withDbRetry(async () => {
            const nextQuery = invokeFn();
            if (nextQuery && typeof nextQuery.then === 'function') {
              return await nextQuery;
            }
            return nextQuery;
          }, retryOptions);
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

  const pgClient = postgres(cleanDsn, {
    max: maxConnections,
    timeout: Number(options.timeout ?? 15), // [INVARIANT: NON-BLOCKING-QUERY-TIMEOUT]
    idle_timeout: Number(options.idle_timeout ?? 20),
    connect_timeout: Number(options.connect_timeout ?? 10),
    max_lifetime: Number(options.max_lifetime ?? 300),
    keep_alive: Number(options.keep_alive ?? 30),
    onnotice: typeof options.onnotice === 'function' ? options.onnotice : () => {},
    connection: {
      ...(options.connection || {}),
      statement_timeout: Number(options.connection?.statement_timeout ?? 15000),
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
  if (!client || client.__atomicBuilderWrapped) {
    return client;
  }
  if (typeof client.transaction !== 'function' && typeof client.begin === 'function') {
    client.transaction = async (queriesOrFn) => {
      return await client.begin(async (tx) => {
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
        return [];
      });
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

