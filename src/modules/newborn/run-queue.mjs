/**
 * src/modules/newborn/run-queue.mjs
 *
 * Bounded Async Run Queue + Single-Flight Deduplication (Sub-50ms HTTP 202).
 * Owns the single module-level `newbornBackgroundQueue` and `inflightNewbornRuns` singletons.
 */

import {
  invalidateEdgeCache,
  isValidPinId,
  redactSecrets,
  tripPinterestCircuitBreaker
} from '../../http/security-and-response.mjs';
import { CircuitBreakerOpenError } from '../../core/pinterest/client.mjs';
import { getNewbornRuleProfile } from './settings.mjs';
import {
  runNewbornDiscovery,
  runNewbornSnowball,
  pollNewbornWatchlist,
  runNewbornAutoCycle
} from './orchestrator.mjs';

export class NewbornRunQueue {
  constructor(concurrency = 2, maxPending = 30) {
    this.concurrency = Math.max(1, Number(concurrency) || 2);
    this.maxPending = Math.max(1, Number(maxPending) || 30);
    this.running = 0;
    this.reserved = 0;
    this.queue = [];
    this._idleWaiters = [];
  }

  get pending() {
    return this.queue.length + this.reserved;
  }

  get isSaturated() {
    return (this.queue.length + this.reserved) >= this.maxPending;
  }

  reserveSlot() {
    if ((this.queue.length + this.reserved) >= this.maxPending) {
      return null;
    }
    this.reserved++;
    return { committed: false, released: false };
  }

  releaseSlot(slot) {
    if (!slot || slot.committed || slot.released) return;
    slot.released = true;
    this.reserved = Math.max(0, this.reserved - 1);
    this._notifyIdleIfDone();
  }

  add(taskFn, slot = null) {
    if (slot) {
      if (slot.committed || slot.released) {
        const err = new Error('Newborn queue reservation slot is no longer valid');
        err.code = 'QUEUE_SLOT_INVALID';
        err.status = 503;
        err.statusCode = 503;
        return Promise.reject(err);
      }
      slot.committed = true;
      this.reserved = Math.max(0, this.reserved - 1);
    } else if ((this.queue.length + this.reserved) >= this.maxPending) {
      const err = new Error(`Newborn worker queue saturated (pending=${this.queue.length + this.reserved}, maxPending=${this.maxPending})`);
      err.code = 'QUEUE_SATURATED';
      err.status = 503;
      err.statusCode = 503;
      return Promise.reject(err);
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ fn: taskFn, resolve, reject });
      this._drain();
    });
  }

  _notifyIdleIfDone() {
    if (this.running === 0 && this.queue.length === 0 && this.reserved === 0 && this._idleWaiters.length > 0) {
      const waiters = this._idleWaiters.splice(0, this._idleWaiters.length);
      for (const resolve of waiters) resolve();
    }
  }

  _drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      this.running++;
      Promise.resolve()
        .then(() => item.fn())
        .then(item.resolve, item.reject)
        .finally(() => {
          this.running = Math.max(0, this.running - 1);
          this._drain();
          this._notifyIdleIfDone();
        });
    }
    this._notifyIdleIfDone();
  }

  drain(timeoutMs = 4000) {
    if (this.running === 0 && this.queue.length === 0 && this.reserved === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      let timerId = null;
      const done = () => {
        if (settled) return;
        settled = true;
        if (timerId !== null) clearTimeout(timerId);
        resolve();
      };
      timerId = setTimeout(done, Math.max(10, Number(timeoutMs) || 4000));
      if (typeof timerId.unref === 'function') timerId.unref();
      this._idleWaiters.push(done);
    });
  }
}

export const newbornBackgroundQueue = new NewbornRunQueue(2, 30);
export const inflightNewbornRuns = new Map();

export function clearNewbornInflightRunsForTest() {
  inflightNewbornRuns.clear();
}

export function buildNewbornDedupeKey(
  runType,
  { seedQueries = [], seedPinIds = [], seedBoards = [], folderId = null, settingsOverrides = null } = {}
) {
  const cleanQueries = Array.from(new Set(
    (Array.isArray(seedQueries) ? seedQueries : [seedQueries])
      .map((q) => String(q || '').trim().toLowerCase())
      .filter(Boolean)
  )).sort();
  const cleanPins = Array.from(new Set(
    (Array.isArray(seedPinIds) ? seedPinIds : [seedPinIds])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )).sort();
  const cleanBoards = Array.from(new Set(
    (Array.isArray(seedBoards) ? seedBoards : [])
      .map((b) => String(b?.board_id || b?.clean_path || b?.url || '').trim().toLowerCase())
      .filter(Boolean)
  )).sort();
  const normalizedSeeds = JSON.stringify({ q: cleanQueries, p: cleanPins, b: cleanBoards });
  const fid = folderId !== null && folderId !== undefined && Number(folderId) > 0 ? Number(folderId) : 'global';
  const hasOverrides = settingsOverrides && typeof settingsOverrides === 'object' && Object.keys(settingsOverrides).length > 0;
  const overrideSig = hasOverrides ? `|${JSON.stringify(settingsOverrides)}` : '';
  return `${String(runType || 'discovery').toLowerCase()}|${normalizedSeeds}|${fid}${overrideSig}`;
}

/**
 * Fetches a single Newborn run by ID for `GET /api/newborn/runs/:id` live progress polling.
 */
export async function getNewbornRunById(sql, runId) {
  if (!sql || typeof sql !== 'function') return null;
  const numericId = Number(runId);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const rows = await sql`
    SELECT *
    FROM newborn_runs
    WHERE id = ${numericId}
    LIMIT 1;
  `;
  return rows?.[0] || null;
}

/**
 * Validates input, deduplicates in-flight hunts on `(run_type, normalized_seeds, folder_id)`,
 * creates a `newborn_runs` row (`status = 'running'`, `progress_stage = 'queued'`, `progress_pct = 0`),
 * enqueues background execution on `newbornBackgroundQueue` with guaranteed `try/catch/finally`
 * terminal status finalization, and resolves in `< 50ms` for HTTP 202 Accepted!
 */
export async function enqueueNewbornRun(sql, options = {}) {
  if (!sql || typeof sql !== 'function') {
    const err = new Error('Database client is required to enqueue a Newborn run.');
    err.status = 503;
    throw err;
  }

  const {
    runType = 'discovery',
    seedQueries = [],
    seedPinIds = [],
    seedBoards = [],
    profileId = null,
    folderId = null,
    clusterId = null,
    settingsOverrides = null,
    workerIndex = 0,
    workerTotal = 1,
    autoPromote = null,
    force = false,
    forceDiscovery = false,
    forceWatchlist = false,
    routerOptions = {},
    env = null,
    ctx = null,
    workerExecutor = null
  } = options;

  const cleanSeeds = Array.from(new Set(
    (Array.isArray(seedQueries) ? seedQueries : [seedQueries])
      .map((q) => String(q || '').trim().toLowerCase())
      .filter(Boolean)
  ));
  const cleanPinIds = Array.from(new Set(
    (Array.isArray(seedPinIds) ? seedPinIds : [seedPinIds])
      .map((id) => String(id || '').trim())
      .filter(isValidPinId)
  ));
  const cleanBoards = Array.isArray(seedBoards)
    ? seedBoards.filter((b) => b && (b.board_id || b.clean_path || b.url))
    : [];
  const numericFolderId = folderId !== null && folderId !== undefined && Number(folderId) > 0 ? Number(folderId) : null;
  const numericClusterId = clusterId !== null && clusterId !== undefined && Number(clusterId) > 0 ? Number(clusterId) : null;

  const dedupeKey = buildNewbornDedupeKey(runType, {
    seedQueries: cleanSeeds,
    seedPinIds: cleanPinIds,
    seedBoards: cleanBoards,
    folderId: numericFolderId,
    clusterId: numericClusterId,
    settingsOverrides
  });

  // Single-flight deduplication on (run_type, normalized_seeds, folder_id) with synchronous reservation
  // to eliminate TOCTOU duplicate inserts & queue-saturation orphan `running` rows.
  while (true) {
    const existingInflight = inflightNewbornRuns.get(dedupeKey);
    if (!existingInflight) break;

    if (existingInflight.pending && existingInflight.reservationPromise) {
      try {
        const reserved = await existingInflight.reservationPromise;
        if (reserved && reserved.runId) {
          const currentRow = await getNewbornRunById(sql, reserved.runId).catch(() => reserved.run);
          if (currentRow && currentRow.status === 'running') {
            return {
              ok: true,
              queued: true,
              deduplicated: true,
              run_id: reserved.runId,
              cluster_id: numericClusterId,
              run: currentRow
            };
          }
        }
      } catch (_) {
        // Prior reservation failed before enqueuing; loop to re-check or reserve cleanly
      }
      if (inflightNewbornRuns.get(dedupeKey) === existingInflight) {
        inflightNewbornRuns.delete(dedupeKey);
      }
      continue;
    }

    const currentRow = await getNewbornRunById(sql, existingInflight.runId).catch(() => null);
    if (currentRow && currentRow.status === 'running') {
      return {
        ok: true,
        queued: true,
        deduplicated: true,
        run_id: existingInflight.runId,
        cluster_id: numericClusterId,
        run: currentRow
      };
    }
    if (inflightNewbornRuns.get(dedupeKey) === existingInflight) {
      inflightNewbornRuns.delete(dedupeKey);
    }
    break;
  }

  // Synchronously reserve BOTH a queue slot AND the inflight dedupeKey BEFORE any await
  const queueSlot = newbornBackgroundQueue.reserveSlot();
  if (!queueSlot) {
    const err = new Error('Newborn background hunt queue is currently full. Please retry in a few seconds.');
    err.status = 503;
    err.code = 'QUEUE_SATURATED';
    throw err;
  }

  let resolveReservation;
  let rejectReservation;
  const reservationPromise = new Promise((res, rej) => {
    resolveReservation = res;
    rejectReservation = rej;
  });
  reservationPromise.catch(() => {});

  const reservationEntry = {
    runId: null,
    run: null,
    pending: true,
    reservationPromise,
    startedAt: Date.now()
  };
  inflightNewbornRuns.set(dedupeKey, reservationEntry);

  let runRowId = null;
  let insertedRun = null;

  try {
    // Resolve numeric profile ID quickly if slug/ID passed
    let resolvedProfileId = null;
    if (profileId !== null && profileId !== undefined && profileId !== '') {
      const prof = await getNewbornRuleProfile(sql, profileId).catch(() => null);
      resolvedProfileId = prof?.id ?? null;
    }

    const displaySeedList = [
      ...cleanSeeds,
      ...cleanBoards.map((b) => b.url || b.clean_path || b.board_id).filter(Boolean),
      ...cleanPinIds.map((id) => `pin:${id}`)
    ];

    const [createdRow] = await sql`
      INSERT INTO newborn_runs (
        run_type, status, progress_stage, progress_detail, progress_pct,
        profile_id, folder_id, cluster_id, seed_queries, cookie_mode, started_at
      )
      VALUES (
        ${runType},
        'running',
        'queued',
        'Queued — starting Newborn hunt...',
        0,
        ${resolvedProfileId},
        ${numericFolderId},
        ${numericClusterId},
        ${JSON.stringify(displaySeedList)}::jsonb,
        'pending',
        NOW()
      )
      RETURNING *;
    `;
    insertedRun = createdRow;
    runRowId = Number(insertedRun.id);

    if (numericClusterId !== null) {
      await sql`
        UPDATE newborn_keyword_clusters
        SET last_run_id = ${runRowId}, updated_at = NOW()
        WHERE id = ${numericClusterId};
      `.catch(() => {});
    }

    const executeBackgroundTask = async () => {
      let finishedCleanly = false;
      try {
        if (typeof workerExecutor === 'function') {
          await workerExecutor({ runId: runRowId, sql, options });
        } else if (runType === 'snowball') {
          await runNewbornSnowball(sql, {
            seedPinIds: cleanPinIds,
            profileId: resolvedProfileId,
            folderId: numericFolderId,
            existingRunId: runRowId,
            settingsOverrides,
            routerOptions,
            env,
            ctx
          });
        } else if (runType === 'watchlist_poll') {
          await pollNewbornWatchlist(sql, {
            profileId: resolvedProfileId,
            folderId: numericFolderId,
            existingRunId: runRowId,
            workerIndex,
            workerTotal,
            autoPromote,
            routerOptions,
            env,
            ctx
          });
        } else if (runType === 'auto_cycle') {
          await runNewbornAutoCycle(sql, {
            force,
            forceDiscovery,
            forceWatchlist,
            seedQueries: cleanSeeds,
            profileId: resolvedProfileId,
            folderId: numericFolderId,
            existingRunId: runRowId,
            routerOptions,
            env,
            ctx
          });
        } else {
          await runNewbornDiscovery(sql, {
            seedQueries: cleanSeeds,
            seedPinIds: cleanPinIds,
            seedBoards: cleanBoards,
            profileId: resolvedProfileId,
            folderId: numericFolderId,
            clusterId: numericClusterId,
            existingRunId: runRowId,
            settingsOverrides,
            routerOptions,
            env,
            ctx
          });
        }
        finishedCleanly = true;
      } catch (err) {
        const safeErrMsg = redactSecrets(err?.message || 'Background Newborn run failed').slice(0, 1000);
        if (err instanceof CircuitBreakerOpenError || err?.name === 'CircuitBreakerOpenError') {
          await tripPinterestCircuitBreaker(env, 'Newborn CircuitBreakerOpenError', 300).catch(() => {});
        }
        await sql`
          UPDATE newborn_runs
          SET
            status = 'failed',
            progress_stage = 'failed',
            progress_detail = ${safeErrMsg},
            error_message = ${safeErrMsg},
            completed_at = COALESCE(completed_at, NOW())
          WHERE id = ${runRowId};
        `.catch(() => {});
      } finally {
        if (inflightNewbornRuns.get(dedupeKey) === reservationEntry) {
          inflightNewbornRuns.delete(dedupeKey);
        }
        // Guarantee terminal status even if an unexpected early return left status = 'running'
        await sql`
          UPDATE newborn_runs
          SET
            status = ${finishedCleanly ? 'completed' : 'failed'},
            progress_stage = ${finishedCleanly ? 'completed' : 'failed'},
            progress_pct = CASE WHEN ${finishedCleanly} THEN 100 ELSE progress_pct END,
            error_message = CASE
              WHEN ${finishedCleanly} THEN error_message
              ELSE COALESCE(error_message, 'Run terminated unexpectedly')
            END,
            completed_at = COALESCE(completed_at, NOW())
          WHERE id = ${runRowId}
            AND status = 'running';
        `.catch(() => {});
        await invalidateEdgeCache('newborn').catch(() => {});
      }
    };

    // Enqueue onto reserved slot; catch any synchronous or pre-start enqueue rejection cleanly
    let enqueueRejectedErr = null;
    const bgPromise = newbornBackgroundQueue.add(executeBackgroundTask, queueSlot);
    bgPromise.catch((err) => {
      enqueueRejectedErr = err;
    });
    // Yield one microtask if slot was somehow rejected immediately by a mocked/saturated queue
    await Promise.resolve();
    if (enqueueRejectedErr) {
      throw enqueueRejectedErr;
    }

    reservationEntry.runId = runRowId;
    reservationEntry.run = insertedRun;
    reservationEntry.pending = false;
    resolveReservation({ runId: runRowId, run: insertedRun });

    return {
      ok: true,
      queued: true,
      deduplicated: false,
      run_id: runRowId,
      run: insertedRun
    };
  } catch (err) {
    newbornBackgroundQueue.releaseSlot(queueSlot);
    if (inflightNewbornRuns.get(dedupeKey) === reservationEntry) {
      inflightNewbornRuns.delete(dedupeKey);
    }
    if (runRowId !== null) {
      const safeErrMsg = redactSecrets(err?.message || 'Failed to enqueue Newborn background run').slice(0, 1000);
      await sql`
        UPDATE newborn_runs
        SET
          status = 'failed',
          progress_stage = 'failed',
          progress_detail = ${safeErrMsg},
          error_message = ${safeErrMsg},
          completed_at = COALESCE(completed_at, NOW())
        WHERE id = ${runRowId}
          AND status = 'running';
      `.catch(() => {});
    }
    rejectReservation(err);
    throw err;
  }
}
