#!/usr/bin/env node

/**
 * scripts/newborn-fleet.mjs
 *
 * Autonomous Newborn Breakout Hunter Fleet Orchestrator & Sharded Worker CLI.
 *
 * Modes (`--mode=<mode>` or `NEWBORN_MODE`):
 *   - `dispatch`       -> Stage 0 Orchestrator & Schedule Evaluator (emits `matrix_tasks` for 1..20 workers)
 *   - `auto_cycle`     -> Schedule-driven or forced Watchlist Poll + 8-Surface Discovery
 *   - `discovery`      -> Multi-Surface Discovery (supports query/board/pin sharding across workers)
 *   - `watchlist_poll` -> Deterministic modulo-partitioned (`worker_index` / `worker_total`) Watchlist Poll
 *   - `snowball`       -> Multi-hop `RelatedModulesResource` Golden Pin Snowball expansion
 *   - `consolidate`    -> Stage 2 Executive Telemetry & Crossover Step Summary Consolidator
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setDefaultDispatcher } from '../src/core/pinterest/index.mjs';
import { invalidateEdgeCache, redactSecrets } from '../src/http/security-and-response.mjs';
import { sanitizeForJsonb } from '../src/utils.mjs';
import { stampAutomationRunTimestamp } from '../src/modules/newborn/settings.mjs';
import {
  parseSmartHuntInput,
  getNewbornSettings,
  evaluateAutomationSchedule,
  getNewbornOverview,
  runNewbornDiscovery,
  runNewbornSnowball,
  pollNewbornWatchlist,
  runNewbornAutoCycle
} from '../src/modules/newborn/service.mjs';
import {
  runFleetLifecycle,
  resolveWorkerPartition,
  writeGitHubOutput,
  appendStepSummary,
  parseCliFlags,
  DEFAULT_FLEET_WORKER_TOTAL
} from './lib/fleet-runner.mjs';

const MODE_ALIASES = Object.freeze({
  dispatch: 'dispatch',
  auto: 'auto_cycle',
  auto_cycle: 'auto_cycle',
  'auto-cycle': 'auto_cycle',
  discover: 'discovery',
  discovery: 'discovery',
  watchlist: 'watchlist_poll',
  watchlist_poll: 'watchlist_poll',
  'watchlist-poll': 'watchlist_poll',
  poll: 'watchlist_poll',
  snowball: 'snowball',
  db_run: 'db_run',
  'db-run': 'db_run',
  consolidate: 'consolidate'
});

export const VALID_NEWBORN_FLEET_MODES = Object.freeze([
  'dispatch',
  'auto_cycle',
  'discovery',
  'watchlist_poll',
  'snowball',
  'db_run',
  'consolidate'
]);

const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'partial',
  'partial_rate_limited',
  'cancelled',
  'failed'
]);

function parsePositiveInt(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseBoolFlag(val, fallback = false) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'boolean') return val;
  const lower = String(val).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(lower)) return true;
  if (['false', '0', 'no', 'off'].includes(lower)) return false;
  return fallback;
}

function splitCsvInputs(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean);
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parses and validates CLI flags + environment configuration for `newborn-fleet.mjs`.
 */
export function parseNewbornFleetArgs(argv = process.argv.slice(2), env = process.env) {
  const { flags } = parseCliFlags(argv);
  const rawMode = String(flags.mode ?? flags.stage ?? env?.NEWBORN_MODE ?? env?.MODE ?? 'auto_cycle')
    .trim()
    .toLowerCase();
  const mode = MODE_ALIASES[rawMode] || null;
  if (!mode) {
    throw new Error(
      `Invalid --mode="${rawMode}" for newborn-fleet.mjs. Expected one of: ${VALID_NEWBORN_FLEET_MODES.join(', ')}.`
    );
  }

  const rawTargetMode = String(flags['target-mode'] ?? flags.target_mode ?? env?.TARGET_MODE ?? 'auto_cycle')
    .trim()
    .toLowerCase();
  const targetMode = MODE_ALIASES[rawTargetMode] && MODE_ALIASES[rawTargetMode] !== 'dispatch' && MODE_ALIASES[rawTargetMode] !== 'consolidate'
    ? MODE_ALIASES[rawTargetMode]
    : 'auto_cycle';

  const profileId = String(flags.profile ?? flags['profile-id'] ?? env?.NEWBORN_PROFILE ?? '').trim() || null;
  const rawQuery = String(flags.query ?? flags.queries ?? env?.NEWBORN_QUERY ?? '').trim();
  const rawPins = String(flags.pins ?? flags['pin-ids'] ?? env?.NEWBORN_PIN_IDS ?? '').trim();
  const rawBoards = String(flags.boards ?? flags['board-urls'] ?? env?.NEWBORN_BOARDS ?? '').trim();
  const force = parseBoolFlag(flags.force ?? env?.NEWBORN_FORCE, false);
  const runId = parsePositiveInt(flags['run-id'] ?? flags.run_id ?? env?.NEWBORN_RUN_ID ?? env?.RUN_ID);
  const clusterId = parsePositiveInt(flags['cluster-id'] ?? flags.cluster_id ?? env?.NEWBORN_CLUSTER_ID ?? env?.CLUSTER_ID);
  const workspaceId = parsePositiveInt(flags['workspace-id'] ?? flags.workspace_id ?? env?.NEWBORN_WORKSPACE_ID ?? env?.WORKSPACE_ID) || 1;

  const rawShards = flags.shards ?? flags['worker-total'] ?? env?.NEWBORN_SHARDS ?? '';
  let shards = null;
  if (rawShards !== '' && rawShards !== null && rawShards !== undefined) {
    const parsedShards = Number(rawShards);
    if (!Number.isInteger(parsedShards) || parsedShards < 1 || parsedShards > DEFAULT_FLEET_WORKER_TOTAL) {
      throw new RangeError(`Invalid --shards="${rawShards}": must be an integer between 1 and ${DEFAULT_FLEET_WORKER_TOTAL}.`);
    }
    shards = parsedShards;
  }

  const seedInputs = splitCsvInputs(rawQuery);
  const explicitPinIds = splitCsvInputs(rawPins);
  const seedQueries = [];
  const seedPinIds = [...explicitPinIds];
  const seedBoards = [];
  const seenBoardKeys = new Set();

  const pushUniqueBoard = (boardObj) => {
    if (!boardObj || typeof boardObj !== 'object') return;
    const key = String(boardObj.clean_path || boardObj.url || boardObj.board_id || '').trim().toLowerCase();
    if (!key || seenBoardKeys.has(key)) return;
    seenBoardKeys.add(key);
    seedBoards.push(boardObj);
  };

  for (const item of seedInputs) {
    const parsed = parseSmartHuntInput(item);
    if (!parsed) continue;
    if (parsed.kind === 'pin') seedPinIds.push(parsed.pinId);
    else if (parsed.kind === 'board') {
      pushUniqueBoard(parsed.board);
      if (parsed.query) seedQueries.push(parsed.query);
    } else if (parsed.query) {
      seedQueries.push(parsed.query);
    }
  }

  if (rawBoards) {
    let parsedBoardsJson = null;
    if (rawBoards.startsWith('[')) {
      try {
        const arr = JSON.parse(rawBoards);
        if (Array.isArray(arr)) parsedBoardsJson = arr;
      } catch (_) {}
    }
    if (parsedBoardsJson) {
      for (const entry of parsedBoardsJson) {
        if (typeof entry === 'string') {
          const parsed = parseSmartHuntInput(entry);
          if (parsed?.kind === 'board') pushUniqueBoard(parsed.board);
        } else if (entry && typeof entry === 'object' && (entry.clean_path || entry.url || entry.board_id)) {
          pushUniqueBoard(entry);
        }
      }
    } else {
      for (const item of splitCsvInputs(rawBoards)) {
        const parsed = parseSmartHuntInput(item);
        if (parsed?.kind === 'board') {
          pushUniqueBoard(parsed.board);
        }
      }
    }
  }

  const hasExplicitWorker = Boolean(
    flags['worker-index'] !== undefined ||
    flags.worker_index !== undefined ||
    env?.WORKER_INDEX !== undefined ||
    env?.SHARD_NUMBER !== undefined
  );

  const partition = hasExplicitWorker
    ? resolveWorkerPartition({
        workerIndex: flags['worker-index'] ?? flags.worker_index,
        workerTotal: flags['worker-total'] ?? flags.worker_total ?? shards,
        env,
        defaultTotal: shards ?? 1
      })
    : {
        workerIndex: 0,
        workerTotal: shards ?? 1,
        workerSlot: 1,
        hasExplicitIndex: false
      };

  return {
    mode,
    targetMode,
    profileId,
    runId,
    clusterId,
    workspaceId,
    seedQueries,
    seedPinIds,
    seedBoards,
    rawQuery,
    force,
    shards,
    ...partition,
    flags
  };
}

function buildGitHubRunUrl(env = {}) {
  const ghRunId = parsePositiveInt(env?.GITHUB_RUN_ID);
  if (!ghRunId) return { githubRunId: null, githubRunUrl: null };
  const serverUrl = String(env?.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
  const repo = String(env?.GITHUB_REPOSITORY || '').trim();
  const githubRunUrl = repo ? `${serverUrl}/${repo}/actions/runs/${ghRunId}` : null;
  return { githubRunId: ghRunId, githubRunUrl };
}

/**
 * Stage 0: Evaluates dynamic settings/schedule and emits deterministic worker matrix tasks.
 */
export async function runNewbornFleetDispatch({ sql, parsedArgs, env = process.env, nowMs = Date.now() }) {
  const githubOutputPath = env?.GITHUB_OUTPUT || null;
  const stepSummaryPath = env?.GITHUB_STEP_SUMMARY || null;

  const settings = await getNewbornSettings(sql);
  const schedule = evaluateAutomationSchedule(settings, new Date(nowMs));

  let watchlistCount = 0;
  if (sql && typeof sql === 'function') {
    const cntRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM newborn_candidates
      WHERE stage = 'watchlist';
    `.catch(() => [{ total: 0 }]);
    watchlistCount = Number(cntRows?.[0]?.total || 0);
  }

  const isScheduledEvent = String(env?.GITHUB_EVENT_NAME || '').toLowerCase() === 'schedule';
  const effectiveForce = parsedArgs.force || (!isScheduledEvent && parsedArgs.targetMode !== 'auto_cycle');
  const requestedMode = (parsedArgs.targetMode === 'db_run' || parsedArgs.runId) ? 'db_run' : (parsedArgs.targetMode || 'auto_cycle');

  const matrixTasks = [];
  let skipReason = '';
  let resolvedRunId = parsedArgs.runId || null;
  let resolvedClusterId = parsedArgs.clusterId || null;

  if (requestedMode === 'db_run') {
    if (!resolvedRunId) {
      skipReason = 'missing_run_id';
    } else if (!sql || typeof sql !== 'function') {
      skipReason = 'database_unavailable';
    } else {
      const [runRow] = await sql`
        SELECT
          id, status, cancel_requested_at, selected_keywords, seed_queries,
          config_snapshot, shards_total, cluster_id, profile_id, folder_id
        FROM newborn_runs
        WHERE id = ${resolvedRunId}
        LIMIT 1;
      `.catch(() => []);

      if (!runRow) {
        skipReason = 'run_not_found';
      } else if (runRow.cancel_requested_at || runRow.status === 'cancelled') {
        skipReason = 'run_cancelled';
      } else if (TERMINAL_RUN_STATUSES.has(String(runRow.status || ''))) {
        skipReason = 'run_already_terminal';
      } else {
        const selectedKw = Array.isArray(runRow.selected_keywords) && runRow.selected_keywords.length > 0
          ? runRow.selected_keywords
          : (Array.isArray(runRow.seed_queries) && runRow.seed_queries.length > 0
            ? runRow.seed_queries
            : (parsedArgs.seedQueries || []));
        const snapshot = runRow.config_snapshot && typeof runRow.config_snapshot === 'object'
          ? runRow.config_snapshot
          : {};
        const seedBoardsCount = Array.isArray(snapshot.seed_boards) ? snapshot.seed_boards.length : 0;
        const requestedShards = parsedArgs.shards || Number(runRow.shards_total) || 1;
        const seedCapacity = selectedKw.length > 0
          ? selectedKw.length
          : (seedBoardsCount > 0 ? seedBoardsCount : 1);
        const effectiveShards = (selectedKw.length > 0 || seedBoardsCount > 0 || (Array.isArray(snapshot.seed_pin_ids) && snapshot.seed_pin_ids.length > 0))
          ? Math.max(1, Math.min(DEFAULT_FLEET_WORKER_TOTAL, requestedShards, seedCapacity))
          : Math.max(1, Math.min(DEFAULT_FLEET_WORKER_TOTAL, requestedShards));

        if (!resolvedClusterId && runRow.cluster_id) {
          resolvedClusterId = Number(runRow.cluster_id) || null;
        }

        const { githubRunId, githubRunUrl } = buildGitHubRunUrl(env);
        await sql`
          UPDATE newborn_runs
          SET
            status = 'running',
            progress_stage = 'running',
            progress_detail = ${`Fleet dispatched (${effectiveShards} parallel shard${effectiveShards === 1 ? '' : 's'})…`},
            progress_pct = GREATEST(progress_pct, 5),
            shards_total = ${effectiveShards},
            github_run_id = COALESCE(${githubRunId}::bigint, github_run_id),
            github_run_url = COALESCE(${githubRunUrl}::text, github_run_url)
          WHERE id = ${resolvedRunId}
            AND status IN ('queued', 'running');
        `.catch(() => {});

        for (let w = 0; w < effectiveShards; w++) {
          matrixTasks.push({
            mode: 'db_run',
            run_id: String(resolvedRunId),
            cluster_id: resolvedClusterId ? String(resolvedClusterId) : '',
            label: `Run #${resolvedRunId} Shard ${w + 1}/${effectiveShards}`,
            profile: runRow.profile_id ? String(runRow.profile_id) : (parsedArgs.profileId || ''),
            query: '',
            boards: '',
            pin_ids: '',
            worker_index: w,
            worker_slot: w + 1,
            worker_total: effectiveShards,
            force: 'true'
          });
        }
      }
    }
  } else if (requestedMode === 'auto_cycle') {
    if (!effectiveForce && !schedule.auto_track_enabled) {
      skipReason = 'auto_track_disabled';
    } else {
      const runPoll = Boolean(effectiveForce || schedule.watchlist_poll_due);
      const runDisc = Boolean(effectiveForce || schedule.discovery_due);

      if (!runPoll && !runDisc) {
        skipReason = schedule.cooldown_active
          ? 'cooldown_active'
          : (!schedule.in_target_window ? 'outside_target_utc_window' : 'interval_not_elapsed');
      } else {
        if (runPoll && watchlistCount > 0) {
          const pollShards = parsedArgs.shards
            ? Math.min(parsedArgs.shards, DEFAULT_FLEET_WORKER_TOTAL)
            : (watchlistCount >= 20 ? DEFAULT_FLEET_WORKER_TOTAL : Math.min(4, Math.max(1, watchlistCount)));
          for (let w = 0; w < pollShards; w++) {
            matrixTasks.push({
              mode: 'watchlist_poll',
              label: `Watchlist Poll #${w + 1}/${pollShards}`,
              profile: parsedArgs.profileId || '',
              query: '',
              pin_ids: '',
              worker_index: w,
              worker_slot: w + 1,
              worker_total: pollShards,
              force: effectiveForce ? 'true' : 'false'
            });
          }
        }
        if (runDisc) {
          const queries = parsedArgs.seedQueries || [];
          const boards = parsedArgs.seedBoards || [];
          const totalItems = Math.max(queries.length, boards.length);
          const discShards = totalItems > 1
            ? Math.min(parsedArgs.shards || totalItems, totalItems, DEFAULT_FLEET_WORKER_TOTAL)
            : 1;
          for (let w = 0; w < discShards; w++) {
            const sliceQueries = queries.length > 1
              ? queries.filter((_, idx) => idx % discShards === w)
              : (w === 0 ? queries : []);
            const sliceBoards = boards.length > 1
              ? boards.filter((_, idx) => idx % discShards === w)
              : (w === 0 ? boards : []);
            matrixTasks.push({
              mode: 'discovery',
              label: sliceQueries.length > 0
                ? `Discovery: ${sliceQueries[0]}${sliceQueries.length > 1 ? ` (+${sliceQueries.length - 1})` : ''}`
                : (sliceBoards.length > 0
                  ? `Board Discovery: ${sliceBoards[0].clean_path || sliceBoards[0].url || 'board'}${sliceBoards.length > 1 ? ` (+${sliceBoards.length - 1})` : ''}`
                  : '8-Surface Autonomous Discovery'),
              profile: parsedArgs.profileId || '',
              query: sliceQueries.join(','),
              boards: sliceBoards.length > 0 ? JSON.stringify(sliceBoards) : '',
              pin_ids: w === 0 ? (parsedArgs.seedPinIds || []).join(',') : '',
              worker_index: w,
              worker_slot: w + 1,
              worker_total: discShards,
              force: effectiveForce ? 'true' : 'false'
            });
          }
        }
      }
    }
  } else if (requestedMode === 'watchlist_poll') {
    const pollShards = parsedArgs.shards || (watchlistCount >= 20 ? DEFAULT_FLEET_WORKER_TOTAL : 1);
    for (let w = 0; w < pollShards; w++) {
      matrixTasks.push({
        mode: 'watchlist_poll',
        label: `Watchlist Poll #${w + 1}/${pollShards}`,
        profile: parsedArgs.profileId || '',
        query: '',
        boards: '',
        pin_ids: '',
        worker_index: w,
        worker_slot: w + 1,
        worker_total: pollShards,
        force: 'true'
      });
    }
  } else if (requestedMode === 'snowball') {
    matrixTasks.push({
      mode: 'snowball',
      label: 'Multi-Hop Golden Pin Snowball',
      profile: parsedArgs.profileId || '',
      query: '',
      boards: '',
      pin_ids: (parsedArgs.seedPinIds || []).join(','),
      worker_index: 0,
      worker_slot: 1,
      worker_total: 1,
      force: 'true'
    });
  } else {
    // discovery
    const queries = parsedArgs.seedQueries || [];
    const boards = parsedArgs.seedBoards || [];
    const totalItems = Math.max(queries.length, boards.length);
    const discShards = totalItems > 1
      ? Math.min(parsedArgs.shards || totalItems, totalItems, DEFAULT_FLEET_WORKER_TOTAL)
      : 1;
    for (let w = 0; w < discShards; w++) {
      const sliceQueries = queries.length > 1
        ? queries.filter((_, idx) => idx % discShards === w)
        : (w === 0 ? queries : []);
      const sliceBoards = boards.length > 1
        ? boards.filter((_, idx) => idx % discShards === w)
        : (w === 0 ? boards : []);
      matrixTasks.push({
        mode: 'discovery',
        label: sliceQueries.length > 0
          ? `Discovery: ${sliceQueries[0]}${sliceQueries.length > 1 ? ` (+${sliceQueries.length - 1})` : ''}`
          : (sliceBoards.length > 0
            ? `Board Discovery: ${sliceBoards[0].clean_path || sliceBoards[0].url || 'board'}${sliceBoards.length > 1 ? ` (+${sliceBoards.length - 1})` : ''}`
            : '8-Surface Discovery Sweep'),
        profile: parsedArgs.profileId || '',
        query: sliceQueries.join(','),
        boards: sliceBoards.length > 0 ? JSON.stringify(sliceBoards) : '',
        pin_ids: w === 0 ? (parsedArgs.seedPinIds || []).join(',') : '',
        worker_index: w,
        worker_slot: w + 1,
        worker_total: discShards,
        force: 'true'
      });
    }
  }

  await writeGitHubOutput('effective_mode', requestedMode, githubOutputPath);
  await writeGitHubOutput('task_count', String(matrixTasks.length), githubOutputPath);
  await writeGitHubOutput('matrix_tasks', JSON.stringify(matrixTasks), githubOutputPath);
  await writeGitHubOutput('skip_reason', skipReason, githubOutputPath);
  await writeGitHubOutput('run_id', resolvedRunId ? String(resolvedRunId) : '', githubOutputPath);
  await writeGitHubOutput('cluster_id', resolvedClusterId ? String(resolvedClusterId) : '', githubOutputPath);

  if (stepSummaryPath) {
    let md = '## Newborn Breakout Hunter — Stage 0 Fleet Dispatcher\n\n';
    md += `- **Requested Mode**: \`${requestedMode}\`\n`;
    if (resolvedRunId) md += `- **DB Run ID**: \`#${resolvedRunId}\`${resolvedClusterId ? ` (Cluster \`#${resolvedClusterId}\`)` : ''}\n`;
    md += `- **Auto-Track Master Switch**: \`${schedule.auto_track_enabled ? 'ENABLED' : 'DISABLED'}\`\n`;
    md += `- **UTC Target Window**: \`${schedule.target_window_utc.start_hour}:00–${schedule.target_window_utc.end_hour}:59 UTC\` (In Window: \`${schedule.in_target_window}\`)\n`;
    md += `- **Staged Watchlist Queue**: **${watchlistCount}** pins\n`;
    md += `- **Dispatched Worker Tasks**: **${matrixTasks.length}**${skipReason ? ` (Skipped: \`${skipReason}\`)` : ''}\n\n`;
    appendStepSummary(md, stepSummaryPath);
  }

  return {
    ok: true,
    effectiveMode: requestedMode,
    runId: resolvedRunId,
    clusterId: resolvedClusterId,
    taskCount: matrixTasks.length,
    skipReason: skipReason || null,
    schedule,
    watchlistCount,
    matrixTasks
  };
}

/**
 * Stage 1: Executes a single sharded or coordinator Newborn fleet worker (`db_run`, `discovery`, `watchlist_poll`, `snowball`, or `auto_cycle`).
 */
export async function runNewbornFleetWorker({
  sql,
  parsedArgs,
  env = process.env,
  routerOptions = {},
  nowMs = Date.now()
}) {
  const {
    mode,
    profileId,
    runId,
    clusterId,
    workspaceId = 1,
    seedQueries,
    seedPinIds,
    seedBoards,
    force,
    workerIndex,
    workerTotal
  } = parsedArgs;

  const effectiveRouterOpts = { env, ...routerOptions };

  if (mode === 'db_run') {
    if (!runId) {
      throw new Error('db_run mode requires a valid positive --run-id / NEWBORN_RUN_ID.');
    }
    if (!sql || typeof sql !== 'function') {
      throw new Error('db_run mode requires an active database connection.');
    }

    let runRow = null;
    try {
      [runRow] = await sql`
        SELECT
          id, COALESCE(workspace_id, 1)::int AS workspace_id, status, cancel_requested_at, selected_keywords, seed_queries,
          config_snapshot, cluster_id, folder_id, profile_id, shards_total
        FROM newborn_runs
        WHERE id = ${runId}
        LIMIT 1;
      `;
    } catch (err) {
      if (String(err?.code || '') !== '42703') throw err;
      [runRow] = await sql`
        SELECT
          id, status, cancel_requested_at, selected_keywords, seed_queries,
          config_snapshot, cluster_id, folder_id, profile_id, shards_total
        FROM newborn_runs
        WHERE id = ${runId}
        LIMIT 1;
      `;
    }

    if (!runRow) {
      return { ok: true, skipped: true, reason: 'run_not_found', run_id: runId };
    }
    if (runRow.cancel_requested_at || runRow.status === 'cancelled') {
      return { ok: true, skipped: true, reason: 'cancelled', run_id: runId };
    }
    const resolvedWorkspaceId = Number(runRow.workspace_id) || 1;
    if (runRow.folder_id) {
      const [folderRow] = await sql`
        SELECT id, metadata
        FROM keyword_folders
        WHERE id = ${Number(runRow.folder_id)}
        LIMIT 1;
      `.catch(() => []);
      if (folderRow?.metadata) {
        const meta = typeof folderRow.metadata === 'string'
          ? (() => { try { return JSON.parse(folderRow.metadata); } catch (_) { return {}; } })()
          : (folderRow.metadata && typeof folderRow.metadata === 'object' ? folderRow.metadata : {});
        const statusStr = String(meta?.status || '').trim().toLowerCase();
        if (
          statusStr === 'paused' ||
          statusStr === 'archived' ||
          meta?.pause_crawlers === true ||
          meta?.is_crawler_paused === true ||
          meta?.crawler_paused === true ||
          meta?.block_fleet === true ||
          meta?.block_gha_fleet === true
        ) {
          return { ok: true, skipped: true, reason: 'folder_paused_or_blocked', run_id: runId, folder_id: Number(runRow.folder_id) };
        }
      }
    }

    const allKeywords = Array.isArray(runRow.selected_keywords) && runRow.selected_keywords.length > 0
      ? runRow.selected_keywords
      : (Array.isArray(runRow.seed_queries) ? runRow.seed_queries : []);
    const snapshot = runRow.config_snapshot && typeof runRow.config_snapshot === 'object'
      ? runRow.config_snapshot
      : {};
    const effectiveTotal = Math.max(1, Number(workerTotal) || Number(runRow.shards_total) || 1);
    const effectiveIndex = Math.max(0, Math.min(effectiveTotal - 1, Number(workerIndex) || 0));

    // Deterministic round-robin keyword sharding across workers
    const myQueries = allKeywords.length > 0
      ? allKeywords.filter((_, idx) => idx % effectiveTotal === effectiveIndex)
      : [];

    const allBoards = Array.isArray(snapshot.seed_boards) ? snapshot.seed_boards : (seedBoards || []);
    const myBoards = allBoards.length > 1
      ? allBoards.filter((_, idx) => idx % effectiveTotal === effectiveIndex)
      : (effectiveIndex === 0 ? allBoards : []);

    const allPinIds = Array.isArray(snapshot.seed_pin_ids) ? snapshot.seed_pin_ids : (seedPinIds || []);
    const myPinIds = effectiveIndex === 0 ? allPinIds : [];

    const {
      seed_boards: _seedBoardsMeta,
      seed_pin_ids: _seedPinIdsMeta,
      settings_overrides: wrappedOverridesSnake,
      settingsOverrides: wrappedOverridesCamel,
      ...rootOverrides
    } = snapshot;
    const settingsOverrides = wrappedOverridesSnake
      || wrappedOverridesCamel
      || (Object.keys(rootOverrides).length > 0 ? rootOverrides : null);

    if (allKeywords.length > 0 && myQueries.length === 0 && myBoards.length === 0 && myPinIds.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: 'empty_shard_slice',
        run_id: runId,
        shard_index: effectiveIndex,
        shard_total: effectiveTotal
      };
    }

    return await runNewbornDiscovery(sql, {
      seedQueries: myQueries,
      seedBoards: myBoards,
      seedPinIds: myPinIds,
      existingRunId: runId,
      shardMode: true,
      shardIndex: effectiveIndex,
      shardTotal: effectiveTotal,
      settingsOverrides,
      profileId: runRow.profile_id ?? profileId ?? null,
      workspaceId: resolvedWorkspaceId,
      folderId: runRow.folder_id ?? null,
      clusterId: runRow.cluster_id ?? clusterId ?? null,
      routerOptions: effectiveRouterOpts,
      nowMs,
      env
    });
  }

  if (mode === 'watchlist_poll') {
    return await pollNewbornWatchlist(sql, {
      profileId,
      workspaceId,
      workerIndex,
      workerTotal,
      routerOptions: effectiveRouterOpts,
      nowMs,
      env
    });
  }

  if (mode === 'snowball') {
    return await runNewbornSnowball(sql, {
      seedPinIds,
      profileId,
      workspaceId,
      routerOptions: effectiveRouterOpts,
      nowMs,
      env
    });
  }

  if (mode === 'discovery') {
    // Stage 0 `runNewbornFleetDispatch` already slices queries, boards, and pins per shard.
    // Do NOT apply a second modulo pass here, which would drop queries across shards.
    return await runNewbornDiscovery(sql, {
      seedQueries,
      seedPinIds,
      seedBoards,
      profileId,
      workspaceId,
      routerOptions: effectiveRouterOpts,
      nowMs,
      env
    });
  }

  return await runNewbornAutoCycle(sql, {
    force,
    seedQueries,
    profileId,
    workspaceId,
    routerOptions: effectiveRouterOpts,
    nowMs,
    env
  });
}

/**
 * Stage 2: Consolidates DB-backed Fleet runs (final status & authoritative counts) + Executive Telemetry Summary.
 */
export async function runNewbornFleetConsolidate({ sql, parsedArgs = null, env = process.env, nowMs = Date.now() }) {
  const stepSummaryPath = env?.GITHUB_STEP_SUMMARY || null;
  const runId = parsedArgs?.runId ?? parsePositiveInt(env?.NEWBORN_RUN_ID ?? env?.RUN_ID);
  let consolidatedRun = null;

  if (runId && sql && typeof sql === 'function') {
    const [runRow] = await sql`
      SELECT
        id, status, cancel_requested_at, shards_total, shards_completed, shards_failed,
        surfaces_used, telemetry, candidates_discovered, candidates_qualified, golden_pins_count
      FROM newborn_runs
      WHERE id = ${runId}
      LIMIT 1;
    `.catch(() => []);

    if (runRow) {
      const existingTelemetry = runRow.telemetry && typeof runRow.telemetry === 'object' ? runRow.telemetry : {};
      const shardsMap = existingTelemetry.shards && typeof existingTelemetry.shards === 'object'
        ? existingTelemetry.shards
        : {};
      const shardEntries = Object.values(shardsMap).filter((s) => s && typeof s === 'object');

      let totalScrolled = 0;
      let totalMatchedRepins = 0;
      let totalHydrated = 0;
      let anyRateLimited = false;
      const mergedSurfacesSet = new Set(
        (Array.isArray(runRow.surfaces_used) ? runRow.surfaces_used : [])
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      );
      for (const s of shardEntries) {
        totalScrolled += Number(s.scrolled_pins || 0);
        totalMatchedRepins += Number(s.matched_repins || 0);
        totalHydrated += Number(s.hydrated_pins || 0);
        if (s.status === 'partial_rate_limited') anyRateLimited = true;
        if (Array.isArray(s.surfaces_used)) {
          for (const surf of s.surfaces_used) {
            const cleanSurf = String(surf || '').trim();
            if (cleanSurf) mergedSurfacesSet.add(cleanSurf);
          }
        }
      }
      const mergedSurfaces = Array.from(mergedSurfacesSet);
      if (shardEntries.length === 0) {
        totalScrolled = Number(runRow.candidates_discovered || 0);
      }

      const [authCounts] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE rc.qualified_in_run = TRUE)::int AS verified_winners,
          COUNT(*) FILTER (WHERE rc.qualified_in_run = TRUE AND c.is_golden_pin = TRUE)::int AS golden_pins_count
        FROM newborn_run_candidates rc
        LEFT JOIN newborn_candidates c ON c.pin_id = rc.pin_id
        WHERE rc.run_id = ${runId};
      `.catch(() => [{ verified_winners: null, golden_pins_count: null }]);

      const verifiedWinners = authCounts?.verified_winners !== null && authCounts?.verified_winners !== undefined
        ? Number(authCounts.verified_winners)
        : Number(runRow.candidates_qualified || 0);
      const goldenCount = authCounts?.golden_pins_count !== null && authCounts?.golden_pins_count !== undefined
        ? Number(authCounts.golden_pins_count)
        : Number(runRow.golden_pins_count || 0);

      const shardsTotal = Math.max(1, Number(runRow.shards_total) || shardEntries.length || 1);
      const shardsCompleted = Number(runRow.shards_completed || 0);
      const shardsFailed = Number(runRow.shards_failed || 0);

      let finalStatus = 'completed';
      let stopReason = null;
      if (runRow.cancel_requested_at || runRow.status === 'cancelled') {
        finalStatus = 'cancelled';
        stopReason = 'operator_cancelled';
      } else if (shardsCompleted === 0) {
        finalStatus = 'failed';
        stopReason = shardsFailed > 0 ? 'all_shards_failed' : 'zero_shards_completed';
      } else if (anyRateLimited) {
        finalStatus = 'partial_rate_limited';
        stopReason = 'pinterest_rate_limit_circuit_open';
      } else if (shardsFailed > 0 || shardsCompleted < shardsTotal) {
        finalStatus = 'partial';
        stopReason = shardsFailed > 0 ? 'partial_shard_failures' : 'incomplete_shards';
      }

      const finalDetail = finalStatus === 'cancelled'
        ? `Fleet run cancelled (${shardsCompleted}/${shardsTotal} shards completed, ${verifiedWinners} winners saved).`
        : (finalStatus === 'failed'
          ? (shardsFailed > 0
            ? `Fleet run failed across ${shardsFailed}/${shardsTotal} shards.`
            : `Fleet run failed (0/${shardsTotal} shards completed).`)
          : (finalStatus === 'partial_rate_limited'
            ? `Fleet finished with rate-limit salvage (${shardsCompleted}/${shardsTotal} shards, ${totalScrolled} scrolled -> ${verifiedWinners} winners).`
            : (finalStatus === 'partial'
              ? `Fleet finished partially (${shardsCompleted}/${shardsTotal} shards completed, ${shardsFailed} failed, ${verifiedWinners} winners).`
              : `Fleet completed (${shardsCompleted}/${shardsTotal} shards, ${totalScrolled} scrolled -> ${verifiedWinners} winners, ${goldenCount} golden).`)));

      const mergedTelemetry = sanitizeForJsonb({
        ...existingTelemetry,
        stop_reason: stopReason,
        funnel: {
          ...(existingTelemetry.funnel || {}),
          scrolled_pins: totalScrolled,
          matched_repins: totalMatchedRepins,
          hydrated_pins: totalHydrated,
          verified_winners: verifiedWinners
        },
        consolidated_at: new Date(nowMs).toISOString()
      });

      await sql`
        UPDATE newborn_runs
        SET
          status = ${finalStatus},
          progress_stage = ${finalStatus},
          progress_detail = ${finalDetail},
          progress_pct = 100,
          candidates_discovered = ${totalScrolled},
          candidates_qualified = ${verifiedWinners},
          golden_pins_count = ${goldenCount},
          surfaces_used = ${JSON.stringify(mergedSurfaces)}::jsonb,
          telemetry = ${JSON.stringify(mergedTelemetry)}::jsonb,
          completed_at = NOW()
        WHERE id = ${runId};
      `.catch(() => {});

      await stampAutomationRunTimestamp(sql, 'discovery', new Date(nowMs).toISOString()).catch(() => {});
      await invalidateEdgeCache('newborn').catch(() => {});

      consolidatedRun = {
        run_id: runId,
        status: finalStatus,
        stop_reason: stopReason,
        shards_total: shardsTotal,
        shards_completed: shardsCompleted,
        shards_failed: shardsFailed,
        scrolled_pins: totalScrolled,
        verified_winners: verifiedWinners,
        golden_pins_count: goldenCount,
        surfaces_used: mergedSurfaces
      };
    }
  }

  const overview = await getNewbornOverview(sql, env);
  const c = overview.counts || {};

  let md = '## Newborn Breakout Hunter — Executive Telemetry Summary\n\n';
  if (consolidatedRun) {
    md += `### Consolidated Fleet Run #${consolidatedRun.run_id}\n\n`;
    md += `- **Final Status**: \`${consolidatedRun.status}\` (Shards: **${consolidatedRun.shards_completed}/${consolidatedRun.shards_total}** ok, **${consolidatedRun.shards_failed}** failed)\n`;
    md += `- **Funnel**: **${consolidatedRun.scrolled_pins}** scrolled -> **${consolidatedRun.verified_winners}** verified winners (**${consolidatedRun.golden_pins_count}** golden)\n\n`;
  }
  md += '| Metric | Count / Status |\n';
  md += '| :--- | :---: |\n';
  md += `| **Staged Candidates (Total)** | **${c.total_candidates || 0}** |\n`;
  md += `| **Golden Pins Qualified** | **${c.golden_pins_count || 0}** (Avg Score: \`${c.avg_golden_score || 0}\`) |\n`;
  md += `| **Linkless Arbitrage Vacuums** | **${c.linkless_vacuum_count || 0}** |\n`;
  md += `| **Active Watchlist Queue** | **${c.watchlist_count || 0}** |\n`;
  md += `| **Promoted to SSOT** | **${c.promoted_count || 0}** |\n`;
  md += `| **01:00 UTC Daily Velocity Anchors** | **${c.active_daily_anchors_count || 0}** |\n`;
  md += `| **Rookie Rising Accounts** | **${c.rookie_accounts_count || 0}** |\n`;
  md += `| **Cookie Routing Zone** | \`${overview.cookie_status?.zone_routing_mode || 'guest_zero_cookie_fallback'}\` |\n\n`;

  if (Array.isArray(overview.crossover_highlights) && overview.crossover_highlights.length > 0) {
    md += '### Top Semantic Crossover Clusters\n\n';
    md += '| Cluster Term | Conviction | Pins | Golden Pins | Linkless % | Avg Repin/d |\n';
    md += '| :--- | :---: | :---: | :---: | :---: | :---: |\n';
    for (const cl of overview.crossover_highlights.slice(0, 8)) {
      md += `| \`${cl.term}\` | **${cl.conviction_score}** | ${cl.pin_count} | ${cl.golden_pin_count} | ${cl.linkless_share_pct}% | +${cl.avg_repin_per_day}/d |\n`;
    }
    md += '\n';
  }

  appendStepSummary(md, stepSummaryPath);
  return consolidatedRun ? { ...overview, consolidated_run: consolidatedRun } : overview;
}

/**
 * Top-level injectable CLI lifecycle entry point (`runFleetLifecycle` + InstaBox Activity Lease + `sql.end()`).
 */
export async function executeNewbornFleetCli(argv = process.argv.slice(2), options = {}) {
  const env = options.env || process.env;
  const parsedArgs = parseNewbornFleetArgs(argv, env);

  return await runFleetLifecycle(
    `newborn-fleet-${parsedArgs.mode}`,
    async ({ sql }) => {
      if (parsedArgs.mode === 'dispatch') {
        return await runNewbornFleetDispatch({
          sql,
          parsedArgs,
          env,
          nowMs: options.nowMs ?? Date.now()
        });
      }
      if (parsedArgs.mode === 'consolidate') {
        return await runNewbornFleetConsolidate({
          sql,
          parsedArgs,
          env,
          nowMs: options.nowMs ?? Date.now()
        });
      }
      return await runNewbornFleetWorker({
        sql,
        parsedArgs,
        env,
        routerOptions: options.routerOptions || {},
        nowMs: options.nowMs ?? Date.now()
      });
    },
    {
      setDefaultDispatcher: options.setDefaultDispatcher !== undefined ? options.setDefaultDispatcher : setDefaultDispatcher,
      sqlClient: options.sqlClient || null,
      lease: options.lease || null,
      leaseOptions: options.leaseOptions || {},
      loadEnv: options.loadEnv,
      dbUrl: options.dbUrl,
      worker: {
        workerIndex: parsedArgs.workerIndex,
        workerTotal: parsedArgs.workerTotal,
        env
      }
    }
  );
}

const isDirectRun = Boolean(
  process.argv[1] && (
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('newborn-fleet.mjs')
  )
);

if (isDirectRun) {
  executeNewbornFleetCli()
    .then((res) => {
      console.log('[+] Newborn Fleet task completed cleanly:', redactSecrets(JSON.stringify({
        ok: res?.ok ?? res?.success ?? true,
        mode: res?.effectiveMode || res?.run_type || 'done',
        taskCount: res?.taskCount,
        skipReason: res?.skipReason
      })));
    })
    .catch((err) => {
      console.error('[-] Newborn Fleet fatal error:', redactSecrets(err?.message || String(err)));
      process.exit(1);
    });
}
