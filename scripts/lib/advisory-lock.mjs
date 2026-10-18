/**
 * scripts/lib/advisory-lock.mjs
 *
 * Distributed Concurrency Coordination for Neon Serverless Postgres
 *
 * ARCHITECTURAL DIRECTIVE (Neon HTTP Driver):
 * Session-level advisory locks (`pg_try_advisory_lock`) are bound to the specific
 * backend connection. Under the stateless Neon HTTP driver (`@neondatabase/serverless`),
 * each query runs in an independent pooled HTTP session, making session advisory locks
 * unreliable across distributed queries.
 *
 * For robust, fail-closed concurrency coordination, use the atomic row lease functions
 * (`acquireAtomicRowLease`, `tryAcquireKeywordLease`, `tryAcquireSeedLease`) which leverage
 * `UPDATE ... RETURNING` with cryptographic lease tokens (`crypto.randomUUID()`) and time-bounded expiration.
 */

/**
 * Universal Atomic Row Lease Engine
 * Explicitly guards against dynamic SQL injection while supporting all lease-coordinated tables.
 *
 * @param {Function} sql - Neon SQL tagged template instance
 * @param {'tracked_keywords'|'competitor_profiles'|'cluster_seeds'} tableName
 * @param {number|string} rowId - Primary key (numeric id for keywords/profiles, pin_id for cluster_seeds)
 * @param {number} [leaseMinutes=15] - Expiration duration in minutes
 * @returns {Promise<string|null>} UUID lease token if acquired, null if held by another worker
 */
export async function acquireAtomicRowLease(sql, tableName, rowId, leaseMinutes = 15) {
  const token = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (await import('crypto')).randomUUID();
  const mins = Math.max(1, Math.min(120, parseInt(leaseMinutes, 10) || 15));

  try {
    let rows = [];
    switch (tableName) {
      case 'tracked_keywords':
        rows = await sql`
          UPDATE tracked_keywords
          SET crawl_lease_token = ${token}::uuid,
              crawl_lease_until = NOW() + (${mins} * INTERVAL '1 minute')
          WHERE id = ${Number(rowId)}
            AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
          RETURNING crawl_lease_token;
        `;
        break;
      case 'competitor_profiles':
        rows = await sql`
          UPDATE competitor_profiles
          SET crawl_lease_token = ${token}::uuid,
              crawl_lease_until = NOW() + (${mins} * INTERVAL '1 minute')
          WHERE id = ${Number(rowId)}
            AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
          RETURNING crawl_lease_token;
        `;
        break;
      case 'cluster_seeds':
        rows = await sql`
          UPDATE cluster_seeds
          SET crawl_lease_token = ${token}::uuid,
              crawl_lease_until = NOW() + (${mins} * INTERVAL '1 minute')
          WHERE pin_id = ${String(rowId)}
            AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
          RETURNING crawl_lease_token;
        `;
        break;
      default:
        throw new Error(`[RowLease] Unsupported lease table: ${tableName}`);
    }

    return rows?.[0]?.crawl_lease_token ? token : null;
  } catch (err) {
    console.warn(`[RowLease] Warning acquiring lease on ${tableName} for ${rowId}:`, err.message);
    return null;
  }
}

/**
 * Attempts to acquire an atomic row lease on a tracked keyword.
 * Non-blocking: returns UUID token if acquired, null if held by another worker.
 *
 * @param {Function} sql - Neon SQL tagged template instance
 * @param {number|string} keywordId - Tracked keyword ID
 * @param {number} leaseMinutes - Expiration in minutes (default 15)
 * @returns {Promise<string|null>} Lease token UUID or null
 */
export async function tryAcquireKeywordLease(sql, keywordId, leaseMinutes = 15) {
  return acquireAtomicRowLease(sql, 'tracked_keywords', keywordId, leaseMinutes);
}

/**
 * Releases an atomic row lease on a tracked keyword.
 *
 * @param {Function} sql - Neon SQL tagged template instance
 * @param {number|string} keywordId - Tracked keyword ID
 * @param {string} leaseToken - UUID token received when lease was acquired
 * @returns {Promise<boolean>}
 */
export async function releaseKeywordLease(sql, keywordId, leaseToken) {
  if (!leaseToken) return false;
  try {
    const [res] = await sql`
      UPDATE tracked_keywords 
      SET crawl_lease_token = NULL,
          crawl_lease_until = NOW()
      WHERE id = ${Number(keywordId)} AND crawl_lease_token = ${leaseToken}::uuid
      RETURNING id;
    `;
    return Boolean(res);
  } catch (err) {
    console.warn(`[RowLease] Warning releasing lease for keyword ${keywordId}:`, err.message);
    return false;
  }
}

/**
 * Attempts to acquire an atomic row lease on a cluster seed pin.
 *
 * @param {Function} sql - Neon SQL tagged template instance
 * @param {string} seedPinId - Cluster seed pin ID
 * @param {number} leaseMinutes - Expiration in minutes (default 15)
 * @returns {Promise<string|null>} Lease token UUID or null
 */
export async function tryAcquireSeedLease(sql, seedPinId, leaseMinutes = 15) {
  return acquireAtomicRowLease(sql, 'cluster_seeds', seedPinId, leaseMinutes);
}

/**
 * Releases an atomic row lease on a cluster seed pin.
 *
 * @param {Function} sql - Neon SQL tagged template instance
 * @param {string} seedPinId - Cluster seed pin ID
 * @param {string} leaseToken - UUID token received when lease was acquired
 * @returns {Promise<boolean>}
 */
export async function releaseSeedLease(sql, seedPinId, leaseToken) {
  if (!leaseToken) return false;
  try {
    const [res] = await sql`
      UPDATE cluster_seeds
      SET crawl_lease_token = NULL,
          crawl_lease_until = NOW()
      WHERE pin_id = ${String(seedPinId)} AND crawl_lease_token = ${leaseToken}::uuid
      RETURNING pin_id;
    `;
    return Boolean(res);
  } catch (err) {
    console.warn(`[RowLease] Warning releasing lease for seed ${seedPinId}:`, err.message);
    return false;
  }
}

/**
 * Attempts to acquire a transaction-level advisory lock using 32-bit hashtext.
 * Note: Only effective within a single interactive transaction block.
 */
export async function tryAcquireAdvisoryXactLock(sql, lockKey) {
  try {
    const [res] = await sql`
      SELECT pg_try_advisory_xact_lock(hashtext(${String(lockKey)})) AS acquired;
    `;
    return Boolean(res?.acquired);
  } catch (err) {
    console.warn(`[AdvisoryLock] Warning acquiring lock for "${lockKey}":`, err.message);
    return false;
  }
}
