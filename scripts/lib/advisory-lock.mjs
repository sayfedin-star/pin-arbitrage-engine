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
 * (`tryAcquireKeywordLease`, `tryAcquireSeedLease`) which leverage `UPDATE ... RETURNING`
 * with cryptographic lease tokens (`gen_random_uuid()`) and time-bounded expiration.
 */

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
  try {
    const [res] = await sql`
      UPDATE tracked_keywords 
      SET crawl_lease_token = gen_random_uuid(),
          crawl_lease_until = NOW() + (${leaseMinutes} || ' minutes')::interval
      WHERE id = ${keywordId} 
        AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
      RETURNING crawl_lease_token;
    `;
    return res?.crawl_lease_token || null;
  } catch (err) {
    console.warn(`[RowLease] Warning acquiring lease for keyword ${keywordId}:`, err.message);
    return null;
  }
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
      WHERE id = ${keywordId} AND crawl_lease_token = ${leaseToken}
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
  try {
    const [res] = await sql`
      UPDATE cluster_seeds
      SET crawl_lease_token = gen_random_uuid(),
          crawl_lease_until = NOW() + (${leaseMinutes} || ' minutes')::interval
      WHERE pin_id = ${seedPinId}
        AND (crawl_lease_until IS NULL OR crawl_lease_until < NOW())
      RETURNING crawl_lease_token;
    `;
    return res?.crawl_lease_token || null;
  } catch (err) {
    console.warn(`[RowLease] Warning acquiring lease for seed ${seedPinId}:`, err.message);
    return null;
  }
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
      WHERE pin_id = ${seedPinId} AND crawl_lease_token = ${leaseToken}
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

/**
 * Legacy session advisory lock (Retained for backward compatibility).
 * WARNING: Not recommended over stateless Neon HTTP connections.
 */
export async function tryAcquireAdvisorySessionLock(sql, lockKey) {
  try {
    const [res] = await sql`
      SELECT pg_try_advisory_lock(hashtext(${String(lockKey)})) AS acquired;
    `;
    return Boolean(res?.acquired);
  } catch (err) {
    console.warn(`[AdvisoryLock] Warning acquiring session lock for "${lockKey}":`, err.message);
    return false;
  }
}

/**
 * Legacy session advisory unlock.
 */
export async function releaseAdvisorySessionLock(sql, lockKey) {
  try {
    const [res] = await sql`
      SELECT pg_advisory_unlock(hashtext(${String(lockKey)})) AS unlocked;
    `;
    return Boolean(res?.unlocked);
  } catch (err) {
    console.warn(`[AdvisoryLock] Warning releasing session lock for "${lockKey}":`, err.message);
    return false;
  }
}

/**
 * Higher-order lock guard using session advisory locks.
 */
export async function withAdvisoryLock(sql, lockKey, workFn) {
  const acquired = await tryAcquireAdvisorySessionLock(sql, lockKey);
  if (!acquired) {
    return { executed: false, skipped: true, reason: 'locked_by_peer_worker' };
  }
  try {
    const result = await workFn();
    return { executed: true, skipped: false, result };
  } finally {
    await releaseAdvisorySessionLock(sql, lockKey).catch(() => {});
  }
}
