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
import { redactSecrets } from '../src/http/security-and-response.mjs';
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
  consolidate: 'consolidate'
});

export const VALID_NEWBORN_FLEET_MODES = Object.freeze([
  'dispatch',
  'auto_cycle',
  'discovery',
  'watchlist_poll',
  'snowball',
  'consolidate'
]);

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
  const requestedMode = parsedArgs.targetMode || 'auto_cycle';

  const matrixTasks = [];
  let skipReason = '';

  if (requestedMode === 'auto_cycle') {
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

  if (stepSummaryPath) {
    let md = '## Newborn Breakout Hunter — Stage 0 Fleet Dispatcher\n\n';
    md += `- **Requested Mode**: \`${requestedMode}\`\n`;
    md += `- **Auto-Track Master Switch**: \`${schedule.auto_track_enabled ? 'ENABLED' : 'DISABLED'}\`\n`;
    md += `- **UTC Target Window**: \`${schedule.target_window_utc.start_hour}:00–${schedule.target_window_utc.end_hour}:59 UTC\` (In Window: \`${schedule.in_target_window}\`)\n`;
    md += `- **Staged Watchlist Queue**: **${watchlistCount}** pins\n`;
    md += `- **Dispatched Worker Tasks**: **${matrixTasks.length}**${skipReason ? ` (Skipped: \`${skipReason}\`)` : ''}\n\n`;
    appendStepSummary(md, stepSummaryPath);
  }

  return {
    ok: true,
    effectiveMode: requestedMode,
    taskCount: matrixTasks.length,
    skipReason: skipReason || null,
    schedule,
    watchlistCount,
    matrixTasks
  };
}

/**
 * Stage 1: Executes a single sharded or coordinator Newborn fleet worker (`discovery`, `watchlist_poll`, `snowball`, or `auto_cycle`).
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
    seedQueries,
    seedPinIds,
    seedBoards,
    force,
    workerIndex,
    workerTotal
  } = parsedArgs;

  const effectiveRouterOpts = { env, ...routerOptions };

  if (mode === 'watchlist_poll') {
    return await pollNewbornWatchlist(sql, {
      profileId,
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
      routerOptions: effectiveRouterOpts,
      nowMs,
      env
    });
  }

  return await runNewbornAutoCycle(sql, {
    force,
    seedQueries,
    profileId,
    routerOptions: effectiveRouterOpts,
    nowMs,
    env
  });
}

/**
 * Stage 2: Consolidates Newborn Staging, Rookie Radar, Daily Anchors & Crossover Telemetry into `$GITHUB_STEP_SUMMARY`.
 */
export async function runNewbornFleetConsolidate({ sql, env = process.env }) {
  const stepSummaryPath = env?.GITHUB_STEP_SUMMARY || null;
  const overview = await getNewbornOverview(sql, env);
  const c = overview.counts || {};

  let md = '## Newborn Breakout Hunter — Executive Telemetry Summary\n\n';
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
  return overview;
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
        return await runNewbornFleetConsolidate({ sql, env });
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
