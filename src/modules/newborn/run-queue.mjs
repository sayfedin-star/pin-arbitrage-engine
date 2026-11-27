/**
 * src/modules/newborn/run-queue.mjs
 *
 * Bounded Async Run Queue + Single-Flight Deduplication (Sub-50ms HTTP 202).
 * Owns the single module-level `newbornBackgroundQueue` and `inflightNewbornRuns` singletons.
 */

import { sanitizeForJsonb } from '../../utils.mjs';
import {
  invalidateEdgeCache,
  isValidPinId,
  redactSecrets,
  tripPinterestCircuitBreaker
} from '../../http/security-and-response.mjs';
import {
  dispatchGitHubWorkflow,
  cancelGitHubWorkflowRun
} from '../../http/github-workflow.mjs';
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

const MAX_PROGRESS_CACHE_ENTRIES = 100;
const TERMINAL_PROGRESS_TTL_MS = 15 * 60 * 1000;
const ACTIVE_RUN_STATUSES = new Set(['queued', 'running']);
const TERMINAL_RUN_STATUSES = new Set(['completed', 'partial', 'partial_rate_limited', 'cancelled', 'failed']);

export const inMemoryRunProgressCache = new Map();
export const activeRunAbortControllers = new Map();

function pruneProgressCache(nowMs = Date.now()) {
  for (const [id, entry] of inMemoryRunProgressCache.entries()) {
    if (entry._terminalAt && (nowMs - entry._terminalAt) > TERMINAL_PROGRESS_TTL_MS) {
      inMemoryRunProgressCache.delete(id);
    }
  }
  while (inMemoryRunProgressCache.size > MAX_PROGRESS_CACHE_ENTRIES) {
    const oldestKey = inMemoryRunProgressCache.keys().next().value;
    if (oldestKey === undefined) break;
    inMemoryRunProgressCache.delete(oldestKey);
  }
}

export function setInMemoryRunProgress(runId, patch = {}) {
  const numericId = Number(runId);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const existing = inMemoryRunProgressCache.get(numericId) || {};
  const mergedTelemetry = {
    ...(existing.telemetry && typeof existing.telemetry === 'object' ? existing.telemetry : {}),
    ...(patch.telemetry && typeof patch.telemetry === 'object' ? patch.telemetry : {})
  };
  const nextStatus = patch.status ?? existing.status ?? 'running';
  const isTerminal = TERMINAL_RUN_STATUSES.has(nextStatus);
  const resolvedWsId = Number.isInteger(Number(patch.workspace_id ?? existing.workspace_id)) && Number(patch.workspace_id ?? existing.workspace_id) > 0
    ? Number(patch.workspace_id ?? existing.workspace_id)
    : 1;
  const nextEntry = {
    ...existing,
    ...patch,
    id: numericId,
    workspace_id: resolvedWsId,
    execution_mode: patch.execution_mode ?? existing.execution_mode ?? 'direct',
    status: nextStatus,
    telemetry: mergedTelemetry,
    _updatedAt: Date.now(),
    _terminalAt: isTerminal ? (existing._terminalAt || Date.now()) : null
  };
  // Refresh LRU insertion order
  inMemoryRunProgressCache.delete(numericId);
  inMemoryRunProgressCache.set(numericId, nextEntry);
  pruneProgressCache();
  return nextEntry;
}

function stripCacheInternalFields(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const { _updatedAt: _u, _terminalAt: _t, ...publicCopy } = entry;
  return {
    ...publicCopy,
    telemetry: publicCopy.telemetry ? { ...publicCopy.telemetry } : {}
  };
}

/**
 * Returns the latest in-process progress snapshot for a Direct Newborn run (<1ms, zero DB),
 * or null if not cached or expired.
 */
export function getInMemoryRunProgress(runId) {
  const numericId = Number(runId);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const entry = inMemoryRunProgressCache.get(numericId);
  if (!entry) return null;
  if (entry._terminalAt && (Date.now() - entry._terminalAt) > TERMINAL_PROGRESS_TTL_MS) {
    inMemoryRunProgressCache.delete(numericId);
    return null;
  }
  // Refresh LRU recency
  inMemoryRunProgressCache.delete(numericId);
  inMemoryRunProgressCache.set(numericId, entry);
  return stripCacheInternalFields(entry);
}

export function clearNewbornInflightRunsForTest() {
  inflightNewbornRuns.clear();
  inMemoryRunProgressCache.clear();
  for (const controller of activeRunAbortControllers.values()) {
    try { controller.abort(new DOMException('Test reset', 'AbortError')); } catch (_) {}
  }
  activeRunAbortControllers.clear();
}

export function buildNewbornDedupeKey(
  runType,
  {
    seedQueries = [],
    seedPinIds = [],
    seedBoards = [],
    folderId = null,
    workspaceId = 1,
    profileId = null,
    clusterId = null,
    workerIndex = null,
    settingsOverrides = null
  } = {}
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
  const wid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0 ? Number(workspaceId) : 1;
  const pid = profileId !== null && profileId !== undefined && String(profileId).trim() !== '' ? `|p:${String(profileId).trim()}` : '';
  const cid = clusterId !== null && clusterId !== undefined && Number(clusterId) > 0 ? `|c:${Number(clusterId)}` : '';
  const widx = workerIndex !== null && workerIndex !== undefined && Number.isInteger(Number(workerIndex)) && Number(workerIndex) > 0 ? `|w:${Number(workerIndex)}` : '';
  const hasOverrides = settingsOverrides && typeof settingsOverrides === 'object' && Object.keys(settingsOverrides).length > 0;
  const overrideSig = hasOverrides ? `|${JSON.stringify(settingsOverrides)}` : '';
  return `${String(runType || 'discovery').toLowerCase()}|ws:${wid}|${normalizedSeeds}|${fid}${pid}${cid}${widx}${overrideSig}`;
}

/**
 * Fetches a single Newborn run by ID for `GET /api/newborn/runs/:id` live progress polling.
 * When `lite: true` (or for active in-process Direct runs), serves from `inMemoryRunProgressCache`
 * in <2ms with zero PostgreSQL queries; on cache miss with `lite: true`, projects only lightweight
 * polling fields while preserving nested `telemetry.funnel` compatibility.
 */
export async function getNewbornRunById(sql, runId, { lite = false, workspaceId = null } = {}) {
  const numericId = Number(runId);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const wid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0
    ? Number(workspaceId)
    : null;

  const cached = getInMemoryRunProgress(numericId);
  if (cached) {
    if (wid !== null && Number(cached.workspace_id || 1) !== wid) {
      return null;
    }
    if (cached.execution_mode !== 'fleet' && (lite || ACTIVE_RUN_STATUSES.has(cached.status))) {
      return cached;
    }
  }

  if (!sql || typeof sql !== 'function') {
    return cached || null;
  }

  if (lite) {
    let rows;
    try {
      rows = wid !== null
        ? await sql`
            SELECT
              id, workspace_id, run_type, status, execution_mode,
              progress_stage, progress_detail, progress_pct, error_message,
              cookie_mode, candidates_discovered, candidates_qualified,
              golden_pins_count, rookie_creators_count,
              shards_total, shards_completed, shards_failed,
              github_run_id, github_run_url, cancel_requested_at,
              started_at, completed_at,
              telemetry->'funnel' AS telemetry_funnel,
              telemetry->'idea_page' AS telemetry_idea_page,
              telemetry->>'stop_reason' AS stop_reason,
              telemetry->'surface_diagnostics' AS surface_diagnostics
            FROM newborn_runs
            WHERE id = ${numericId} AND workspace_id = ${wid}
            LIMIT 1;
          `
        : await sql`
            SELECT
              id, run_type, status, execution_mode,
              progress_stage, progress_detail, progress_pct, error_message,
              cookie_mode, candidates_discovered, candidates_qualified,
              golden_pins_count, rookie_creators_count,
              shards_total, shards_completed, shards_failed,
              github_run_id, github_run_url, cancel_requested_at,
              started_at, completed_at,
              telemetry->'funnel' AS telemetry_funnel,
              telemetry->'idea_page' AS telemetry_idea_page,
              telemetry->>'stop_reason' AS stop_reason,
              telemetry->'surface_diagnostics' AS surface_diagnostics
            FROM newborn_runs
            WHERE id = ${numericId}
            LIMIT 1;
          `;
    } catch (err) {
      if (String(err?.code || '') !== '42703') throw err;
      if (wid !== null && wid !== 1) return null;
      rows = await sql`
        SELECT
          id, run_type, status, execution_mode,
          progress_stage, progress_detail, progress_pct, error_message,
          cookie_mode, candidates_discovered, candidates_qualified,
          golden_pins_count, rookie_creators_count,
          shards_total, shards_completed, shards_failed,
          github_run_id, github_run_url, cancel_requested_at,
          started_at, completed_at,
          telemetry->'funnel' AS telemetry_funnel,
          telemetry->'idea_page' AS telemetry_idea_page,
          telemetry->>'stop_reason' AS stop_reason,
          telemetry->'surface_diagnostics' AS surface_diagnostics
        FROM newborn_runs
        WHERE id = ${numericId}
        LIMIT 1;
      `;
    }
    const row = rows?.[0];
    if (!row) return null;
    const {
      telemetry_funnel: tf,
      telemetry_idea_page: tip,
      stop_reason: sr,
      surface_diagnostics: sd,
      ...rest
    } = row;
    return {
      ...rest,
      stop_reason: sr || null,
      telemetry: {
        ...(tf ? { funnel: tf } : {}),
        ...(tip ? { idea_page: tip } : {}),
        ...(sr ? { stop_reason: sr } : {}),
        ...(sd ? { surface_diagnostics: sd } : {})
      }
    };
  }

  let rows;
  try {
    rows = wid !== null
      ? await sql`
          SELECT *
          FROM newborn_runs
          WHERE id = ${numericId} AND workspace_id = ${wid}
          LIMIT 1;
        `
      : await sql`
          SELECT *
          FROM newborn_runs
          WHERE id = ${numericId}
          LIMIT 1;
        `;
  } catch (err) {
    if (String(err?.code || '') !== '42703') throw err;
    if (wid !== null && wid !== 1) return null;
    rows = await sql`
      SELECT *
      FROM newborn_runs
      WHERE id = ${numericId}
      LIMIT 1;
    `;
  }
  return rows?.[0] || null;
}

/**
 * Cooperatively cancels an active Direct or Fleet Newborn run:
 * - Marks `cancel_requested_at = NOW()`
 * - Aborts in-process Direct AbortController cleanly (`AbortError`, never tripping breakers)
 * - Cancels GitHub Actions workflow run for Fleet runs when `github_run_id` is recorded
 * - Immediately transitions `queued` / Fleet / orphaned runs to `status = 'cancelled'`
 */
export async function cancelNewbornRun(sql, runId, { env = null, workspaceId = null } = {}) {
  const numericId = Number(runId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return {
      ok: false,
      status: 400,
      error: 'BAD_REQUEST',
      message: `Invalid run ID "${runId}". Expected a positive integer.`
    };
  }

  const wid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0
    ? Number(workspaceId)
    : null;

  let row = null;
  let dbQueried = false;
  if (sql && typeof sql === 'function') {
    dbQueried = true;
    try {
      const rows = wid !== null
        ? await sql`
            SELECT id, workspace_id, run_type, status, execution_mode, github_run_id, github_run_url, cancel_requested_at
            FROM newborn_runs
            WHERE id = ${numericId} AND workspace_id = ${wid}
            LIMIT 1;
          `
        : await sql`
            SELECT id, run_type, status, execution_mode, github_run_id, github_run_url, cancel_requested_at
            FROM newborn_runs
            WHERE id = ${numericId}
            LIMIT 1;
          `;
      row = rows?.[0] || null;
    } catch (err) {
      if (String(err?.code || '') !== '42703') throw err;
      if (wid !== null && wid !== 1) {
        return {
          ok: false,
          status: 404,
          error: 'NOT_FOUND',
          message: `Newborn run #${numericId} not found.`
        };
      }
      const rows = await sql`
        SELECT id, run_type, status, execution_mode, github_run_id, github_run_url, cancel_requested_at
        FROM newborn_runs
        WHERE id = ${numericId}
        LIMIT 1;
      `;
      row = rows?.[0] || null;
    }
  }
  if (!row) {
    const memRow = getInMemoryRunProgress(numericId);
    if (memRow && (wid === null || Number(memRow.workspace_id || 1) === wid)) {
      if (!dbQueried || wid === null || Number(memRow.workspace_id || 1) === wid) {
        row = memRow;
      }
    }
  }
  if (!row) {
    return {
      ok: false,
      status: 404,
      error: 'NOT_FOUND',
      message: `Newborn run #${numericId} not found.`
    };
  }

  if (TERMINAL_RUN_STATUSES.has(row.status)) {
    return {
      ok: true,
      cancelled: false,
      already_terminal: true,
      run_id: numericId,
      status: row.status,
      execution_mode: row.execution_mode || 'direct'
    };
  }

  const nowIso = new Date().toISOString();
  if (sql && typeof sql === 'function') {
    try {
      if (wid !== null) {
        await sql`
          UPDATE newborn_runs
          SET cancel_requested_at = COALESCE(cancel_requested_at, NOW())
          WHERE id = ${numericId} AND workspace_id = ${wid};
        `;
      } else {
        await sql`
          UPDATE newborn_runs
          SET cancel_requested_at = COALESCE(cancel_requested_at, NOW())
          WHERE id = ${numericId};
        `;
      }
    } catch (err) {
      if (String(err?.code || '') === '42703' && (wid === null || wid === 1)) {
        await sql`
          UPDATE newborn_runs
          SET cancel_requested_at = COALESCE(cancel_requested_at, NOW())
          WHERE id = ${numericId};
        `.catch(() => {});
      }
    }
  }

  const controller = activeRunAbortControllers.get(numericId);
  let abortedInProcess = false;
  if (controller) {
    abortedInProcess = true;
    try {
      controller.abort(new DOMException('Operator cancelled', 'AbortError'));
    } catch (_) {}
  }

  let githubCancelResult = null;
  if (row.execution_mode === 'fleet' && row.github_run_id) {
    githubCancelResult = await cancelGitHubWorkflowRun(env, {
      runId: row.github_run_id,
      allowPat: true
    }).catch((err) => ({ ok: false, error: redactSecrets(err?.message || 'GitHub cancel failed') }));
  }

  const immediateCancel = row.status === 'queued' || row.execution_mode === 'fleet' || !abortedInProcess;
  if (immediateCancel) {
    if (sql && typeof sql === 'function') {
      try {
        if (wid !== null) {
          await sql`
            UPDATE newborn_runs
            SET
              status = 'cancelled',
              progress_stage = 'cancelled',
              progress_detail = 'Cancelled by operator.',
              cancel_requested_at = COALESCE(cancel_requested_at, NOW()),
              completed_at = COALESCE(completed_at, NOW())
            WHERE id = ${numericId}
              AND workspace_id = ${wid}
              AND status IN ('queued', 'running');
          `;
        } else {
          await sql`
            UPDATE newborn_runs
            SET
              status = 'cancelled',
              progress_stage = 'cancelled',
              progress_detail = 'Cancelled by operator.',
              cancel_requested_at = COALESCE(cancel_requested_at, NOW()),
              completed_at = COALESCE(completed_at, NOW())
            WHERE id = ${numericId}
              AND status IN ('queued', 'running');
          `;
        }
      } catch (err) {
        if (String(err?.code || '') === '42703' && (wid === null || wid === 1)) {
          await sql`
            UPDATE newborn_runs
            SET
              status = 'cancelled',
              progress_stage = 'cancelled',
              progress_detail = 'Cancelled by operator.',
              cancel_requested_at = COALESCE(cancel_requested_at, NOW()),
              completed_at = COALESCE(completed_at, NOW())
            WHERE id = ${numericId}
              AND status IN ('queued', 'running');
          `.catch(() => {});
        }
      }
    }
    if (inMemoryRunProgressCache.has(numericId)) {
      setInMemoryRunProgress(numericId, {
        status: 'cancelled',
        progress_stage: 'cancelled',
        progress_detail: 'Cancelled by operator.',
        cancel_requested_at: nowIso,
        completed_at: nowIso,
        telemetry: { stop_reason: 'operator_cancelled' }
      });
    }
  } else if (inMemoryRunProgressCache.has(numericId)) {
    setInMemoryRunProgress(numericId, {
      cancel_requested_at: nowIso,
      progress_detail: 'Cancellation requested — saving verified winners and stopping…'
    });
  }

  await invalidateEdgeCache('newborn').catch(() => {});

  return {
    ok: true,
    cancelled: true,
    run_id: numericId,
    status: immediateCancel ? 'cancelled' : 'running',
    execution_mode: row.execution_mode || 'direct',
    cancel_requested_at: nowIso,
    aborted_in_process: abortedInProcess,
    github_cancelled: Boolean(githubCancelResult?.ok),
    ...(githubCancelResult && !githubCancelResult.ok ? { github_cancel_error: redactSecrets(githubCancelResult.error || '') } : {})
  };
}

/**
 * Creates a Fleet-backed `newborn_runs` row (`status = 'queued'`, `execution_mode = 'fleet'`)
 * and dispatches `newborn-hunter.yml` in `db_run` mode across 1..20 GitHub Actions runners.
 */
export async function createFleetBackedNewbornRun(sql, options = {}) {
  if (!sql || typeof sql !== 'function') {
    const err = new Error('Database client is required to launch a Fleet Newborn run.');
    err.status = 503;
    throw err;
  }

  const {
    runType = 'discovery',
    seedQueries = [],
    seedBoards = [],
    seedPinIds = [],
    selectedKeywords = [],
    profileId = null,
    folderId = null,
    workspaceId = 1,
    clusterId = null,
    settingsOverrides = null,
    shards = 4,
    env = null
  } = options;

  const combinedKeywords = Array.from(new Set(
    [
      ...(Array.isArray(selectedKeywords) ? selectedKeywords : []),
      ...(Array.isArray(seedQueries) ? seedQueries : [seedQueries])
    ]
      .map((q) => String(q || '').trim().toLowerCase())
      .filter(Boolean)
  ));

  const normalizedBoards = Array.isArray(seedBoards)
    ? seedBoards.filter(Boolean).slice(0, 50)
    : [];
  const normalizedPinIds = Array.isArray(seedPinIds)
    ? Array.from(new Set(seedPinIds.map((p) => String(p || '').trim()).filter(Boolean))).slice(0, 50)
    : [];

  const rawShards = Math.max(1, Math.min(20, Math.round(Number(shards) || 4)));
  const seedCapacity = combinedKeywords.length > 0
    ? combinedKeywords.length
    : (normalizedBoards.length > 0 ? normalizedBoards.length : 1);
  const clampedShards = (combinedKeywords.length > 0 || normalizedBoards.length > 0 || normalizedPinIds.length > 0)
    ? Math.max(1, Math.min(rawShards, seedCapacity))
    : rawShards;

  const numericFolderId = folderId !== null && folderId !== undefined && Number(folderId) > 0 ? Number(folderId) : null;
  const numericClusterId = clusterId !== null && clusterId !== undefined && Number(clusterId) > 0 ? Number(clusterId) : null;
  const wid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0 ? Number(workspaceId) : 1;

  let resolvedProfileId = null;
  if (profileId !== null && profileId !== undefined && profileId !== '') {
    const prof = await getNewbornRuleProfile(sql, profileId, { workspaceId: wid }).catch(() => null);
    resolvedProfileId = prof?.id ?? null;
  }

  const baseSnapshot = settingsOverrides && typeof settingsOverrides === 'object' ? { ...settingsOverrides } : {};
  if (normalizedBoards.length > 0) baseSnapshot.seed_boards = normalizedBoards;
  if (normalizedPinIds.length > 0) baseSnapshot.seed_pin_ids = normalizedPinIds;
  const configSnapshot = sanitizeForJsonb(baseSnapshot);

  const rows = await sql`
    INSERT INTO newborn_runs (
      run_type, status, execution_mode, progress_stage, progress_detail, progress_pct,
      profile_id, folder_id, cluster_id, seed_queries, selected_keywords, config_snapshot,
      shards_total, shards_completed, shards_failed, cookie_mode, telemetry, started_at, workspace_id
    )
    VALUES (
      ${runType},
      'queued',
      'fleet',
      'queued',
      ${`Queued — dispatching ${clampedShards} GitHub Actions Fleet runner${clampedShards === 1 ? '' : 's'}…`},
      2,
      ${resolvedProfileId},
      ${numericFolderId},
      ${numericClusterId},
      ${JSON.stringify(combinedKeywords)}::jsonb,
      ${JSON.stringify(combinedKeywords)}::jsonb,
      ${JSON.stringify(configSnapshot)}::jsonb,
      ${clampedShards},
      0,
      0,
      'pending',
      '{"shards":{},"funnel":{}}'::jsonb,
      NOW(),
      ${wid}
    )
    RETURNING *;
  `;
  const createdRow = rows?.[0];

  const runRowId = Number(createdRow.id);

  if (numericClusterId !== null) {
    await sql`
      UPDATE newborn_keyword_clusters
      SET last_run_id = ${runRowId}, updated_at = NOW()
      WHERE id = ${numericClusterId}
        AND workspace_id = ${wid};
    `.catch(() => {});
  }

  const ghRes = await dispatchGitHubWorkflow(env, {
    workflowFile: 'newborn-hunter.yml',
    allowPat: true,
    inputs: {
      mode: 'db_run',
      run_id: String(runRowId),
      cluster_id: numericClusterId ? String(numericClusterId) : '',
      shards: String(clampedShards),
      force: 'true'
    }
  });

  if (!ghRes.ok) {
    const safeErr = redactSecrets(ghRes.error || 'Failed to dispatch newborn-hunter.yml workflow.').slice(0, 1000);
    await sql`
      UPDATE newborn_runs
      SET
        status = 'failed',
        progress_stage = 'failed',
        progress_detail = ${safeErr},
        error_message = ${safeErr},
        completed_at = NOW()
      WHERE id = ${runRowId};
    `.catch(() => {});

    return {
      ok: false,
      status: ghRes.missingToken ? 400 : (ghRes.status || 502),
      missingToken: Boolean(ghRes.missingToken),
      error: ghRes.missingToken ? 'GITHUB_TOKEN_MISSING' : 'DISPATCH_FAILED',
      message: safeErr,
      run_id: runRowId
    };
  }

  await invalidateEdgeCache('newborn').catch(() => {});

  return {
    ok: true,
    queued: true,
    deduplicated: false,
    execution_mode: 'fleet',
    run_id: runRowId,
    cluster_id: numericClusterId,
    shards_total: clampedShards,
    workflow: 'newborn-hunter.yml',
    repo: ghRes.githubRepo,
    run: createdRow
  };
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
    workspaceId = 1,
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
  const wid = Number.isInteger(Number(workspaceId)) && Number(workspaceId) > 0 ? Number(workspaceId) : 1;

  const dedupeKey = buildNewbornDedupeKey(runType, {
    seedQueries: cleanSeeds,
    seedPinIds: cleanPinIds,
    seedBoards: cleanBoards,
    folderId: numericFolderId,
    workspaceId: wid,
    profileId: profileId ?? null,
    clusterId: numericClusterId,
    workerIndex,
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
          if (currentRow && ACTIVE_RUN_STATUSES.has(currentRow.status)) {
            return {
              ok: true,
              queued: true,
              deduplicated: true,
              execution_mode: currentRow.execution_mode || 'direct',
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
    if (currentRow && ACTIVE_RUN_STATUSES.has(currentRow.status)) {
      return {
        ok: true,
        queued: true,
        deduplicated: true,
        execution_mode: currentRow.execution_mode || 'direct',
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
      const prof = await getNewbornRuleProfile(sql, profileId, { workspaceId: wid }).catch(() => null);
      resolvedProfileId = prof?.id ?? null;
    }

    const displaySeedList = [
      ...cleanSeeds,
      ...cleanBoards.map((b) => b.url || b.clean_path || b.board_id).filter(Boolean),
      ...cleanPinIds.map((id) => `pin:${id}`)
    ];

    const rows = await sql`
      INSERT INTO newborn_runs (
        run_type, status, progress_stage, progress_detail, progress_pct,
        profile_id, folder_id, cluster_id, seed_queries, cookie_mode, started_at, workspace_id
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
        NOW(),
        ${wid}
      )
      RETURNING *;
    `;
    const createdRow = rows?.[0];
    insertedRun = createdRow;
    runRowId = Number(insertedRun.id);

    if (numericClusterId !== null) {
      await sql`
        UPDATE newborn_keyword_clusters
        SET last_run_id = ${runRowId}, updated_at = NOW()
        WHERE id = ${numericClusterId}
          AND workspace_id = ${wid};
      `.catch(() => {});
    }

    const abortController = new AbortController();
    activeRunAbortControllers.set(runRowId, abortController);

    setInMemoryRunProgress(runRowId, {
      id: runRowId,
      workspace_id: wid,
      run_type: runType,
      status: 'running',
      execution_mode: 'direct',
      progress_stage: 'queued',
      progress_detail: 'Queued — starting Newborn hunt...',
      progress_pct: 0,
      error_message: null,
      cookie_mode: insertedRun?.cookie_mode || 'pending',
      candidates_discovered: 0,
      candidates_qualified: 0,
      golden_pins_count: 0,
      rookie_creators_count: 0,
      shards_total: 1,
      shards_completed: 0,
      shards_failed: 0,
      github_run_id: null,
      github_run_url: null,
      cancel_requested_at: null,
      seed_queries: displaySeedList,
      started_at: insertedRun?.started_at || new Date().toISOString(),
      completed_at: null,
      telemetry: { funnel: null }
    });

    const handleLiveProgress = (ev = {}) => {
      const nextStatus = ev.status || (TERMINAL_RUN_STATUSES.has(ev.stage) ? ev.stage : 'running');
      setInMemoryRunProgress(runRowId, {
        status: nextStatus,
        progress_stage: ev.stage || 'running',
        progress_detail: ev.detail || '',
        progress_pct: Number(ev.pct ?? 0),
        ...(ev.cookie_mode ? { cookie_mode: ev.cookie_mode } : {}),
        ...(ev.counters?.candidates_discovered !== undefined ? { candidates_discovered: ev.counters.candidates_discovered } : {}),
        ...(ev.counters?.candidates_qualified !== undefined ? { candidates_qualified: ev.counters.candidates_qualified } : {}),
        ...(ev.counters?.golden_pins_count !== undefined ? { golden_pins_count: ev.counters.golden_pins_count } : {}),
        ...(ev.counters?.rookie_creators_count !== undefined ? { rookie_creators_count: ev.counters.rookie_creators_count } : {}),
        ...(TERMINAL_RUN_STATUSES.has(nextStatus) ? { completed_at: new Date().toISOString() } : {}),
        telemetry: {
          ...(ev.funnel ? { funnel: ev.funnel } : {}),
          ...(ev.idea_page ? { idea_page: ev.idea_page } : {}),
          ...(ev.stop_reason !== undefined ? { stop_reason: ev.stop_reason } : {}),
          ...(ev.salvaged_pins_count !== undefined ? { salvaged_pins_count: ev.salvaged_pins_count } : {}),
          ...(ev.surface_diagnostics ? { surface_diagnostics: ev.surface_diagnostics } : {})
        }
      });
    };

    const executeBackgroundTask = async () => {
      let finishedCleanly = false;
      let taskResultStatus = null;
      const { signal } = abortController;
      try {
        if (signal.aborted) {
          taskResultStatus = 'cancelled';
          finishedCleanly = true;
          await sql`
            UPDATE newborn_runs
            SET
              status = 'cancelled',
              progress_stage = 'cancelled',
              progress_detail = 'Cancelled by operator.',
              error_message = NULL,
              completed_at = COALESCE(completed_at, NOW())
            WHERE id = ${runRowId};
          `.catch(() => {});
          setInMemoryRunProgress(runRowId, {
            status: 'cancelled',
            progress_stage: 'cancelled',
            progress_detail: 'Cancelled by operator.',
            error_message: null,
            completed_at: new Date().toISOString(),
            telemetry: { stop_reason: 'operator_cancelled' }
          });
          return;
        }

        let res = null;
        if (typeof workerExecutor === 'function') {
          res = await workerExecutor({ runId: runRowId, sql, options, signal, onProgress: handleLiveProgress });
        } else if (runType === 'snowball') {
          res = await runNewbornSnowball(sql, {
            seedPinIds: cleanPinIds,
            profileId: resolvedProfileId,
            folderId: numericFolderId,
            workspaceId: wid,
            existingRunId: runRowId,
            settingsOverrides,
            routerOptions,
            signal,
            onProgress: handleLiveProgress,
            env,
            ctx
          });
        } else if (runType === 'watchlist_poll') {
          res = await pollNewbornWatchlist(sql, {
            profileId: resolvedProfileId,
            folderId: numericFolderId,
            workspaceId: wid,
            existingRunId: runRowId,
            workerIndex,
            workerTotal,
            autoPromote,
            routerOptions,
            signal,
            onProgress: handleLiveProgress,
            env,
            ctx
          });
        } else if (runType === 'auto_cycle') {
          res = await runNewbornAutoCycle(sql, {
            force,
            forceDiscovery,
            forceWatchlist,
            seedQueries: cleanSeeds,
            profileId: resolvedProfileId,
            folderId: numericFolderId,
            workspaceId: wid,
            existingRunId: runRowId,
            routerOptions,
            signal,
            onProgress: handleLiveProgress,
            env,
            ctx
          });
        } else {
          res = await runNewbornDiscovery(sql, {
            seedQueries: cleanSeeds,
            seedPinIds: cleanPinIds,
            seedBoards: cleanBoards,
            profileId: resolvedProfileId,
            folderId: numericFolderId,
            clusterId: numericClusterId,
            workspaceId: wid,
            existingRunId: runRowId,
            settingsOverrides,
            routerOptions,
            signal,
            onProgress: handleLiveProgress,
            env,
            ctx
          });
        }
        taskResultStatus = res?.status || (signal.aborted ? 'cancelled' : 'completed');
        finishedCleanly = true;
      } catch (err) {
        const wasAborted = Boolean(signal.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERR');
        if (wasAborted) {
          taskResultStatus = 'cancelled';
          finishedCleanly = true;
          await sql`
            UPDATE newborn_runs
            SET
              status = 'cancelled',
              progress_stage = 'cancelled',
              progress_detail = 'Cancelled by operator.',
              error_message = NULL,
              completed_at = COALESCE(completed_at, NOW())
            WHERE id = ${runRowId};
          `.catch(() => {});
          setInMemoryRunProgress(runRowId, {
            status: 'cancelled',
            progress_stage: 'cancelled',
            progress_detail: 'Cancelled by operator.',
            error_message: null,
            completed_at: new Date().toISOString(),
            telemetry: { stop_reason: 'operator_cancelled' }
          });
        } else {
          taskResultStatus = 'failed';
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
          setInMemoryRunProgress(runRowId, {
            status: 'failed',
            progress_stage: 'failed',
            progress_detail: safeErrMsg,
            error_message: safeErrMsg,
            completed_at: new Date().toISOString()
          });
        }
      } finally {
        activeRunAbortControllers.delete(runRowId);
        if (inflightNewbornRuns.get(dedupeKey) === reservationEntry) {
          inflightNewbornRuns.delete(dedupeKey);
        }
        const fallbackStatus = signal.aborted
          ? 'cancelled'
          : (taskResultStatus || (finishedCleanly ? 'completed' : 'failed'));
        // Guarantee terminal status even if an unexpected early return left status in ('queued', 'running')
        await sql`
          UPDATE newborn_runs
          SET
            status = CASE
              WHEN cancel_requested_at IS NOT NULL THEN 'cancelled'
              ELSE ${fallbackStatus}
            END,
            progress_stage = CASE
              WHEN cancel_requested_at IS NOT NULL THEN 'cancelled'
              ELSE ${fallbackStatus}
            END,
            progress_pct = CASE WHEN ${finishedCleanly} THEN 100 ELSE progress_pct END,
            error_message = CASE
              WHEN cancel_requested_at IS NOT NULL OR ${finishedCleanly} THEN error_message
              ELSE COALESCE(error_message, 'Run terminated unexpectedly')
            END,
            completed_at = COALESCE(completed_at, NOW())
          WHERE id = ${runRowId}
            AND status IN ('queued', 'running');
        `.catch(() => {});

        const currentCached = inMemoryRunProgressCache.get(runRowId);
        if (currentCached && ACTIVE_RUN_STATUSES.has(currentCached.status)) {
          setInMemoryRunProgress(runRowId, {
            status: fallbackStatus,
            progress_stage: fallbackStatus,
            progress_pct: finishedCleanly ? 100 : currentCached.progress_pct,
            completed_at: new Date().toISOString()
          });
        }
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
      execution_mode: 'direct',
      run_id: runRowId,
      run: insertedRun
    };
  } catch (err) {
    newbornBackgroundQueue.releaseSlot(queueSlot);
    if (inflightNewbornRuns.get(dedupeKey) === reservationEntry) {
      inflightNewbornRuns.delete(dedupeKey);
    }
    if (runRowId !== null) {
      activeRunAbortControllers.delete(runRowId);
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
          AND status IN ('queued', 'running');
      `.catch(() => {});
      if (inMemoryRunProgressCache.has(runRowId)) {
        setInMemoryRunProgress(runRowId, {
          status: 'failed',
          progress_stage: 'failed',
          progress_detail: safeErrMsg,
          error_message: safeErrMsg,
          completed_at: new Date().toISOString()
        });
      }
    }
    rejectReservation(err);
    throw err;
  }
}
