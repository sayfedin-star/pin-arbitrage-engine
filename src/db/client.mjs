/**
 * Unified PostgreSQL Client (Native VPS PostgreSQL SSOT)
 * Direct, zero-proxy postgres.js connection pool for the Unified Single-Database Architecture.
 */

import postgres from 'postgres';

let sharedClient = null;
let sharedDsn = null;
let activeQueryCount = 0;
let totalQueryCount = 0;

const PG_TRANSIENT_CONNECTION_CODES = new Set([
  '53300', '53400', '08006', '08001', '08003', '08004', '57P01', '57P02', '57P03',
  'CONNECTION_CLOSED', 'CONNECTION_DESTROYED', 'CONNECT_TIMEOUT',
  'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'
]);

/**
 * Returns true if error is a PostgreSQL connection slot exhaustion (SQLSTATE 53300)
 * or transient socket/connection drop safe for automatic exponential-backoff retry.
 */
export function isTransientPgConnectionError(err) {
  if (!err) return false;
  const code = String(err.code || err.sqlState || '').trim();
  if (PG_TRANSIENT_CONNECTION_CODES.has(code)) return true;
  const msg = String(err.message || '');
  return /too many clients already|remaining connection slots are reserved|sorry, too many clients|CONNECTION_CLOSED|CONNECTION_DESTROYED|CONNECT_TIMEOUT|ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|write EPIPE|Cannot read properties of null \(reading 'write'\)/i.test(msg);
}

/**
 * Returns true if a SQL query is read-only (SELECT, EXPLAIN, SHOW, TABLE, read-only CTE),
 * ensuring non-idempotent mutations (INSERT, UPDATE, DELETE) are not blindly re-executed on socket drops.
 *
 * @param {string|Array<string>|object} queryInput
 * @returns {boolean}
 */
function stripSqlCommentsAndLiterals(sqlText) {
  let out = '';
  const n = sqlText.length;
  let i = 0;

  while (i < n) {
    const ch = sqlText[i];
    const next = i + 1 < n ? sqlText[i + 1] : '';

    // 1. Line comment: -- ... \n
    if (ch === '-' && next === '-') {
      i += 2;
      while (i < n && sqlText[i] !== '\n') i++;
      out += ' ';
      continue;
    }

    // 2. Block comment (supports PostgreSQL nested /* /* */ */)
    if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sqlText[i] === '/' && sqlText[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sqlText[i] === '*' && sqlText[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      out += ' ';
      continue;
    }

    // 3. Escape string literal: E'...' / e'...'
    if ((ch === 'E' || ch === 'e') && next === '\'') {
      i += 2;
      while (i < n) {
        if (sqlText[i] === '\\') {
          i += 2;
          continue;
        }
        if (sqlText[i] === '\'') {
          if (sqlText[i + 1] === '\'') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += ' __LIT__ ';
      continue;
    }

    // 4. Standard single-quoted string literal: '...'
    if (ch === '\'') {
      i++;
      while (i < n) {
        if (sqlText[i] === '\'') {
          if (sqlText[i + 1] === '\'') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += ' __LIT__ ';
      continue;
    }

    // 5. Dollar-quoted string literal: $tag$...$tag$ or $$...$$
    if (ch === '$') {
      const rest = sqlText.slice(i);
      const tagMatch = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        const endIdx = sqlText.indexOf(tag, i + tag.length);
        if (endIdx !== -1) {
          i = endIdx + tag.length;
          out += ' __LIT__ ';
          continue;
        }
      }
    }

    out += ch;
    i++;
  }

  return out;
}

function isSafeSqlParameterValue(val) {
  if (val === null || val === undefined) return true;
  const t = typeof val;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') return true;
  if (val instanceof Date || Buffer.isBuffer(val) || ArrayBuffer.isView(val)) return true;
  if (val.constructor?.name === 'Parameter') return true;
  return false;
}

function expandSqlFragment(input, values = [], seen = new Set(), depth = 0) {
  if (depth > 12) return null; // Conservatively treat deeply nested/recursive SQL as non-read-only

  let parts = null;
  let nestedValues = values;

  if (typeof input === 'string') {
    parts = [input];
  } else if (Array.isArray(input)) {
    parts = input;
  } else if (input && typeof input === 'object') {
    if (seen.has(input)) return null;
    seen.add(input);
    if (Array.isArray(input.strings)) {
      parts = input.strings;
      if (nestedValues.length === 0) {
        if (Array.isArray(input.args)) nestedValues = input.args;
        else if (Array.isArray(input.values)) nestedValues = input.values;
      }
    } else if (Array.isArray(input.raw)) {
      parts = input.raw;
    } else {
      return null;
    }
  } else {
    return null;
  }

  let out = '';
  for (let i = 0; i < parts.length; i++) {
    out += String(parts[i] ?? '');
    if (i < nestedValues.length) {
      const v = nestedValues[i];
      if (isSafeSqlParameterValue(v)) {
        out += ' ';
      } else if (Array.isArray(v)) {
        // Plain array of primitives/JSON params (e.g. ANY(${ids})) vs array of nested SQL fragments
        let hasFragment = false;
        const expandedItems = [];
        for (const item of v) {
          if (isSafeSqlParameterValue(item)) continue;
          if (item && typeof item === 'object' && (
            Array.isArray(item.strings) || Array.isArray(item.raw) ||
            typeof item.then === 'function' || item.constructor?.name === 'Builder'
          )) {
            hasFragment = true;
            const sub = expandSqlFragment(item, [], seen, depth + 1);
            if (sub === null) return null;
            expandedItems.push(sub);
          }
        }
        out += hasFragment ? ` ${expandedItems.join(' ')} ` : ' ';
      } else if (v && typeof v === 'object') {
        const isNestedFragment =
          Array.isArray(v.strings) ||
          Array.isArray(v.raw) ||
          typeof v.then === 'function' ||
          v.constructor?.name === 'Builder' ||
          v.__paeRetryWrapped === true ||
          v.__sqlFrag === true;
        if (isNestedFragment) {
          if (v.constructor?.name === 'Builder') {
            return null; // Conservatively reject opaque postgres.js sql(...) builders
          }
          const sub = expandSqlFragment(v, [], seen, depth + 1);
          if (sub === null) return null;
          out += ` ${sub} `;
        } else {
          // Plain JSON object bound parameter
          out += ' ';
        }
      } else {
        // Functions or other unexpected interpolated values -> conservative reject
        return null;
      }
    }
  }
  return out;
}

export function isReadOnlyQuery(queryInput, interpolatedValues = []) {
  const text = expandSqlFragment(queryInput, Array.isArray(interpolatedValues) ? interpolatedValues : []);
  if (!text || typeof text !== 'string') {
    return false;
  }

  const stripped = stripSqlCommentsAndLiterals(text).trim();
  if (!stripped) return false;

  // Allow at most one optional trailing semicolon; reject any multi-statement semicolons
  const cleaned = stripped.replace(/;\s*$/, '').trim();
  if (!cleaned || cleaned.includes(';')) return false;

  const firstWordMatch = cleaned.match(/^([a-zA-Z]+)/);
  if (!firstWordMatch) return false;
  const firstWord = firstWordMatch[1].toUpperCase();

  if (!['SELECT', 'EXPLAIN', 'SHOW', 'TABLE', 'VALUES', 'WITH'].includes(firstWord)) {
    return false;
  }

  // Reject row-locking clauses (FOR UPDATE / FOR NO KEY UPDATE / FOR SHARE / FOR KEY SHARE)
  if (/\bFOR\s+(?:NO\s+KEY\s+)?(?:UPDATE|SHARE|KEY\s+SHARE)\b/i.test(cleaned)) {
    return false;
  }

  // Reject side-effecting PostgreSQL sequence, advisory-lock, session, or LO functions
  if (/"?\b(?:nextval|setval|pg_advisory_(?:xact_)?lock(?:_shared)?|pg_try_advisory_(?:xact_)?lock(?:_shared)?|pg_advisory_unlock(?:_shared|_all)?|pg_terminate_backend|pg_cancel_backend|lo_create|lo_unlink|lo_import|lo_export)\b"?\s*\(/i.test(cleaned)) {
    return false;
  }

  // Reject mutating DDL/DML/procedural statements anywhere outside string literals
  if (/\b(?:INSERT|UPDATE|DELETE|MERGE|COPY|DO|CALL|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|VACUUM|LOCK|REINDEX|CLUSTER|REFRESH)\b/i.test(cleaned)) {
    return false;
  }

  return true;
}

export const isReadOnlySql = isReadOnlyQuery;

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
      const canRetry = !err?.__paeEnteredTxCallback && (
        isTransientPgConnectionError(err) ||
        (retryOnStatementTimeout && isStatementTimeoutError(err))
      );
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
      '[INVARIANT: ATOMIC-TRANSACTION-BUILDER] sql.transaction() strictly requires a callback or an array of lazy query builders.'
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

  // Guarded begin helper: marks errors with __paeEnteredTxCallback = true once the transaction callback starts
  // so outer `withDbRetry` loops (including callers using `sql.noRetry.begin`) NEVER replay committed writes.
  const runGuardedBeginOnce = async (...args) => {
    let enteredCallback = false;
    const cbIdx = args.findLastIndex((a) => typeof a === 'function');
    const wrappedArgs = cbIdx === -1
      ? args
      : args.map((arg, idx) => {
          if (idx !== cbIdx) return arg;
          return async (...cbArgs) => {
            enteredCallback = true;
            return await arg(...cbArgs);
          };
        });

    activeQueryCount++;
    totalQueryCount++;
    try {
      return await origBegin(...wrappedArgs);
    } catch (err) {
      if (enteredCallback) {
        const nonRetryableErr = err && typeof err === 'object' ? err : new Error(String(err));
        Object.defineProperty(nonRetryableErr, '__paeEnteredTxCallback', {
          value: true,
          enumerable: false,
          configurable: true
        });
        throw nonRetryableErr;
      }
      throw err;
    } finally {
      activeQueryCount = Math.max(0, activeQueryCount - 1);
    }
  };

  // Expose an unwrapped noRetry sibling so callers inside explicit `withDbRetry(...)` never double-stack retries,
  // while still preserving the non-retryable transaction callback guard.
  const noRetryBegin = origBegin ? (...args) => runGuardedBeginOnce(...args) : null;
  const noRetryTransaction = noRetryBegin
    ? async (queriesOrFn) => executeAtomicTransaction(noRetryBegin, queriesOrFn)
    : undefined;

  const noRetryClient = new Proxy(pgClient, {
    get(target, prop, receiver) {
      if (prop === 'begin' && noRetryBegin) return noRetryBegin;
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
    pgClient.begin = async (...args) => {
      return await withDbRetry(() => runGuardedBeginOnce(...args), retryOptions);
    };
  }

  if (origUnsafe) {
    pgClient.unsafe = (...args) => {
      const invoke = () => origUnsafe(...args);
      const pending = invoke();
      const isReadOnly = isReadOnlyQuery(args[0]);
      return wrapPendingQueryRetry(pending, invoke, { ...retryOptions, isReadOnly });
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
        const isReadOnly = isReadOnlyQuery(args[0], args.slice(1));
        return wrapPendingQueryRetry(result, invoke, { ...retryOptions, isReadOnly });
      }
      return result;
    }
  });
}

function RetryablePendingQuery() {}

function wrapPendingQueryRetry(pending, invokeFn, retryOptions = {}) {
  if (!pending || typeof pending.then !== 'function' || pending.__paeRetryWrapped) {
    return pending;
  }
  const isReadOnly = retryOptions.isReadOnly !== false;
  const origThen = pending.then.bind(pending);
  if (pending.constructor === Promise) {
    // Silence eager unhandled rejection before .then() is awaited and ensure V8 PromiseResolve invokes custom .then
    origThen(() => {}, () => {});
    Object.defineProperty(pending, 'constructor', {
      value: RetryablePendingQuery,
      configurable: true,
      enumerable: false,
      writable: true
    });
  }
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
          activeQueryCount = Math.max(0, activeQueryCount + 1);
          totalQueryCount++;
          try {
            return await new Promise((resolve, reject) => {
              origThen(resolve, reject);
            });
          } finally {
            activeQueryCount = Math.max(0, activeQueryCount - 1);
          }
        } catch (err) {
          const maxRetries = (isReadOnly || retryOptions.forceRetry) ? Math.max(0, Number(retryOptions.maxRetries ?? 4)) : 0;
          if (maxRetries === 0 || !isTransientPgConnectionError(err)) {
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
            activeQueryCount = Math.max(0, activeQueryCount + 1);
            totalQueryCount++;
            try {
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
            } finally {
              activeQueryCount = Math.max(0, activeQueryCount - 1);
            }
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
  const parseSafePoolMax = (raw, fallback) => {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const requestedMax = options.max !== undefined
    ? parseSafePoolMax(options.max, defaultMax)
    : parseSafePoolMax(typeof process !== 'undefined' ? process.env?.PG_POOL_MAX : undefined, defaultMax);
  // Cap GITHUB_ACTIONS pool size to 3-4 connections
  const maxConnections = isCi ? Math.max(1, Math.min(requestedMax, 4)) : Math.max(1, requestedMax);
  const defaultStatementTimeoutMs = isCi ? 45000 : 15000;
  const resolvedStatementTimeoutMs = Number(options.connection?.statement_timeout ?? defaultStatementTimeoutMs);
  const defaultIdleInTxTimeoutMs = Math.max(isCi ? 60000 : 30000, resolvedStatementTimeoutMs);

  const pgClient = postgres(cleanDsn, {
    max: maxConnections,
    idle_timeout: Number(options.idle_timeout ?? 20),
    connect_timeout: Number(options.connect_timeout ?? 10),
    max_lifetime: Number(options.max_lifetime ?? (isCi ? 180 : 300)),
    keep_alive: Number(options.keep_alive ?? (isCi ? 15 : 30)),
    onnotice: typeof options.onnotice === 'function' ? options.onnotice : () => {},
    connection: {
      ...(options.connection || {}),
      statement_timeout: resolvedStatementTimeoutMs,
      idle_in_transaction_session_timeout: Number(
        options.connection?.idle_in_transaction_session_timeout ?? defaultIdleInTxTimeoutMs
      )
    },
    prepare: true,
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
  if (env?.SQL_CLIENT) {
    return env.SQL_CLIENT;
  }

  const dsn = String(
    env?.DATABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.DATABASE_URL : '') ||
    ''
  ).trim();

  if (sharedClient) {
    if (sharedDsn === dsn) {
      return sharedClient;
    }
    try {
      if (typeof sharedClient.end === 'function') {
        sharedClient.end({ timeout: 5 }).catch(() => {});
      }
    } catch (_) {}
    sharedClient = null;
    sharedDsn = null;
  }

  sharedClient = createSqlClient(dsn);
  sharedDsn = dsn;
  return sharedClient;
}

/**
 * Returns real-time connection pool and query telemetry metrics.
 *
 * @param {Function} [client] - Optional postgres client instance
 * @returns {{ active: number, idle: number, max: number, total_executed: number }}
 */
export function getPoolStats(client = null) {
  const targetClient = client || sharedClient;
  if (!targetClient) {
    return { active: 0, idle: 0, max: 0, total_executed: totalQueryCount };
  }
  const envMax = Number(process.env.PG_POOL_MAX);
  const fallbackMax = Number.isFinite(envMax) && envMax > 0 ? Math.floor(envMax) : 15;
  const max = targetClient.options?.max ?? fallbackMax;
  const active = Math.max(0, activeQueryCount);
  const idle = Math.max(0, max - active);
  return {
    active,
    idle,
    max,
    total_executed: totalQueryCount
  };
}

/**
 * Gracefully drains the shared PostgreSQL connection pool.
 *
 * @param {object} [options]
 * @param {number} [options.timeout=5] - Seconds before timing out connection draining
 * @returns {Promise<void>}
 */
export async function drainSqlClient({ timeout = 5 } = {}) {
  if (sharedClient) {
    const client = sharedClient;
    sharedClient = null;
    sharedDsn = null;
    if (typeof client.end === 'function') {
      await client.end({ timeout });
    }
  }
}

/**
 * Global process-level sql client instance (or null if DATABASE_URL is not set).
 */
export const sql = (
  typeof process !== 'undefined' &&
  process.env?.NODE_ENV !== 'test' &&
  process.env?.ENVIRONMENT !== 'test' &&
  process.env?.DATABASE_URL
)
  ? getSqlClient()
  : null;


