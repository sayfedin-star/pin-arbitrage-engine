/**
 * Unified PostgreSQL Client (Native VPS PostgreSQL SSOT)
 * Direct, zero-proxy postgres.js connection pool for the Unified Single-Database Architecture.
 */

import postgres from 'postgres';

let sharedClient = null;
let sharedDsn = null;

/**
 * Wraps a postgres.js client with a clean `.transaction()` helper that bridges onto `.begin()`
 * without any Proxy interception or Neon HTTP header overhead.
 *
 * @param {Function} pgClient
 * @returns {Function}
 */
export function attachTransactionBridge(pgClient) {
  if (!pgClient || pgClient.__unifiedTxAttached) {
    return pgClient;
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
  return pgClient;
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

  const defaultPoolMax = (typeof process !== 'undefined' && process.env?.GITHUB_ACTIONS) ? 4 : 15;
  const maxConnections = Number(
    options.max ||
    (typeof process !== 'undefined' ? process.env?.PG_POOL_MAX : defaultPoolMax) ||
    defaultPoolMax
  );

  const pgClient = postgres(cleanDsn, {
    max: maxConnections,
    idle_timeout: Number(options.idle_timeout ?? 20),
    connect_timeout: Number(options.connect_timeout ?? 15),
    max_lifetime: Number(options.max_lifetime ?? 300),
    keep_alive: Number(options.keep_alive ?? 30),
    onnotice: () => {},
    connection: {
      max_parallel_workers_per_gather: 0,
      ...(options.connection || {})
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

  return attachTransactionBridge(pgClient);
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
