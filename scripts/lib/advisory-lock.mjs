/**
 * scripts/lib/advisory-lock.mjs
 *
 * Postgres Advisory Lock Engine for Distributed Concurrency Coordination
 * Zero Redis required: Uses Postgres engine internal shared-memory 64-bit advisory locks.
 */

/**
 * Attempts to acquire a transaction-level advisory lock using 32-bit hashtext.
 * Non-blocking: returns true if acquired, false immediately if another worker holds it.
 * Automatically released when the transaction ends (commit or rollback) or connection terminates.
 *
 * @param {Function} sql - Neon SQL tagged template instance
 * @param {string|number} lockKey - Unique identifier (e.g. keyword, seed_pin_id, competitor_username)
 * @returns {Promise<boolean>} True if lock acquired, false if held by another worker
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
 * Attempts to acquire a session-level advisory lock.
 * Non-blocking: returns true if acquired, false if held by another worker.
 * Must be released with releaseAdvisoryLock(sql, lockKey) or connection close.
 *
 * @param {Function} sql - Neon SQL tagged template instance
 * @param {string|number} lockKey - Unique identifier
 * @returns {Promise<boolean>}
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
 * Releases a previously acquired session-level advisory lock.
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
 * Higher-order lock guard: executes workFn only if the advisory lock is successfully acquired.
 * If locked by a peer worker, gracefully skips execution without blocking or queue pileup.
 *
 * @param {Function} sql - Neon SQL tagged template instance
 * @param {string|number} lockKey - Unique identifier
 * @param {Function} workFn - Async function to execute if lock is granted
 * @returns {Promise<{ executed: boolean, skipped: boolean, result?: any, reason?: string }>}
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
