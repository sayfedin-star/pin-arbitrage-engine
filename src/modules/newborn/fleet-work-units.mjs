/**
 * src/modules/newborn/fleet-work-units.mjs
 *
 * Pure, Deterministic Multi-Dimensional Fleet Work-Unit Planner (SSOT).
 *
 * Replaces single-dimensional (`1 Shard = 1 Keyword`) sharding so:
 * 1. Single-keyword multi-surface hunts (e.g. `stuffing recipes` with Search + Idea Page + Boards)
 *    fan out in parallel across surfaces and board slices (`board_slice_index / board_slice_total`).
 * 2. Multi-keyword hunts (`keywords.length >= requestedShards`) shard keywords cleanly while also
 *    distributing `seed_boards` and `seed_pin_ids` round-robin across all workers (no worker-0 bottleneck).
 * 3. `Scroll Related` (`runType === 'snowball'`) distributes `seed_pin_ids` across up to 20 parallel
 *    GitHub Actions Fleet runners.
 */

const MAX_FLEET_SHARDS = 20;

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function deepClonePlain(val) {
  if (Array.isArray(val)) return val.map(deepClonePlain);
  if (isPlainObject(val)) {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = deepClonePlain(v);
    }
    return out;
  }
  return val;
}

/**
 * Extracts pure `settingsOverrides` from a persisted `newborn_runs.config_snapshot`,
 * stripping transport/planning metadata keys (`seed_boards`, `seed_pin_ids`, `shard_plan`).
 */
export function extractSettingsOverridesFromSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) return null;
  const {
    seed_boards: _sb,
    seed_pin_ids: _sp,
    shard_plan: _plan,
    settings_overrides: wrappedSnake,
    settingsOverrides: wrappedCamel,
    ...rootOverrides
  } = snapshot;
  if (isPlainObject(wrappedSnake)) return deepClonePlain(wrappedSnake);
  if (isPlainObject(wrappedCamel)) return deepClonePlain(wrappedCamel);
  return Object.keys(rootOverrides).length > 0 ? deepClonePlain(rootOverrides) : null;
}

function resolveSurfaceActivity(settingsOverrides = null) {
  const surfaces = isPlainObject(settingsOverrides?.discovery?.surfaces)
    ? settingsOverrides.discovery.surfaces
    : {};

  // Defaults match SURFACES_CATALOG in src/modules/newborn/settings.mjs
  const searchEnabled = surfaces.pin_serp_capsules?.enabled !== false;
  const ideasEnabled = surfaces.ideas_feeds?.enabled !== false;
  const freshBoardsEnabled = surfaces.fresh_boards?.enabled !== false;
  const boardMoreIdeasEnabled = surfaces.board_more_ideas?.enabled !== false;
  const boardFeedEnabled = surfaces.board_feed?.enabled === true;
  const boardsEnabled = freshBoardsEnabled && (boardMoreIdeasEnabled || boardFeedEnabled);
  const homeFeedEnabled = surfaces.home_feed?.enabled === true;
  const snowballEnabled = surfaces.related_pin_snowball?.enabled === true
    || settingsOverrides?.discovery?.snowball?.enabled === true;

  const rawMaxBoards = Number(
    surfaces.fresh_boards?.max_boards_to_expand
    ?? surfaces.fresh_boards?.max_boards
    ?? 10
  );
  const maxBoards = Number.isFinite(rawMaxBoards) && rawMaxBoards > 0
    ? Math.max(1, Math.min(50, Math.round(rawMaxBoards)))
    : 10;

  return {
    searchEnabled,
    ideasEnabled,
    freshBoardsEnabled,
    boardMoreIdeasEnabled,
    boardFeedEnabled,
    boardsEnabled,
    homeFeedEnabled,
    snowballEnabled,
    maxBoards
  };
}

/**
 * Plans deterministic multi-dimensional work units and optimal shard count (`effectiveShards`)
 * for any Newborn Fleet run (`discovery`, `cluster`, `snowball`).
 */
export function planNewbornFleetShards({
  runType = 'discovery',
  keywords = [],
  seedBoards = [],
  seedPinIds = [],
  settingsOverrides = null,
  requestedShards = 4,
  maxShards = MAX_FLEET_SHARDS
} = {}) {
  const cleanRunType = String(runType || 'discovery').trim().toLowerCase() || 'discovery';
  const cleanKeywords = Array.from(new Set(
    (Array.isArray(keywords) ? keywords : [keywords])
      .map((q) => String(q || '').trim().toLowerCase())
      .filter(Boolean)
  ));
  const cleanBoards = Array.isArray(seedBoards)
    ? seedBoards.filter((b) => b && (b.board_id || b.clean_path || b.url))
    : [];
  const cleanPinIds = Array.from(new Set(
    (Array.isArray(seedPinIds) ? seedPinIds : [seedPinIds])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  ));

  const maxCap = Math.max(1, Math.min(MAX_FLEET_SHARDS, Math.round(Number(maxShards) || MAX_FLEET_SHARDS)));
  const clampedRequested = Math.max(1, Math.min(maxCap, Math.round(Number(requestedShards) || 1)));
  const activity = resolveSurfaceActivity(settingsOverrides);

  // Mode 1: Explicit Snowball run (or pin-only run with no keywords/boards/home_feed)
  if (cleanRunType === 'snowball' || (cleanKeywords.length === 0 && cleanBoards.length === 0 && !activity.homeFeedEnabled && cleanPinIds.length > 0)) {
    const units = cleanPinIds.map((pinId) => ({ type: 'snowball_pin', pin_id: pinId }));
    const effectiveShards = cleanPinIds.length > 0
      ? Math.max(1, Math.min(clampedRequested, cleanPinIds.length))
      : 1;
    return {
      strategy: 'snowball_pins',
      runType: 'snowball',
      requestedShards: clampedRequested,
      effectiveShards,
      units,
      keywords: [],
      seedBoards: [],
      seedPinIds: cleanPinIds,
      settingsOverrides: settingsOverrides ? deepClonePlain(settingsOverrides) : null,
      activity
    };
  }

  // Mode 2: Multi-keyword run where keywords already saturate requested shards
  if (cleanKeywords.length >= clampedRequested) {
    const units = cleanKeywords.map((keyword) => ({ type: 'keyword_full', keyword }));
    return {
      strategy: 'keyword_sharded',
      runType: cleanRunType,
      requestedShards: clampedRequested,
      effectiveShards: clampedRequested,
      units,
      keywords: cleanKeywords,
      seedBoards: cleanBoards,
      seedPinIds: cleanPinIds,
      settingsOverrides: settingsOverrides ? deepClonePlain(settingsOverrides) : null,
      activity
    };
  }

  // Mode 3: Keywords > 0 AND Keywords < requestedShards -> Multi-dimensional surface + board-slice fan-out
  if (cleanKeywords.length > 0) {
    const units = [];
    const fixedPerKeyword = (activity.searchEnabled ? 1 : 0) + (activity.ideasEnabled ? 1 : 0);
    const nonBoardUnitsCount =
      (cleanKeywords.length * fixedPerKeyword) +
      (activity.homeFeedEnabled ? 1 : 0) +
      cleanBoards.length +
      cleanPinIds.length;

    const remainingForBoards = Math.max(cleanKeywords.length, clampedRequested - nonBoardUnitsCount);
    const boardSlicesPerKeyword = activity.boardsEnabled
      ? Math.max(1, Math.min(activity.maxBoards, Math.floor(remainingForBoards / cleanKeywords.length) || 1))
      : 0;

    for (const keyword of cleanKeywords) {
      if (activity.searchEnabled) {
        units.push({ type: 'pin_serp_capsules', keyword });
      }
      if (activity.ideasEnabled) {
        units.push({ type: 'ideas_feeds', keyword });
      }
      if (activity.boardsEnabled && boardSlicesPerKeyword > 0) {
        for (let sliceIdx = 0; sliceIdx < boardSlicesPerKeyword; sliceIdx++) {
          units.push({
            type: 'query_boards_slice',
            keyword,
            board_slice_index: sliceIdx,
            board_slice_total: boardSlicesPerKeyword
          });
        }
      }
      // Fallback if operator disabled all 3 keyword surfaces: still keep 1 unit so keyword isn't dropped
      if (!activity.searchEnabled && !activity.ideasEnabled && !activity.boardsEnabled) {
        units.push({ type: 'keyword_full', keyword });
      }
    }

    if (activity.homeFeedEnabled) {
      units.push({ type: 'home_feed' });
    }
    for (const board of cleanBoards) {
      units.push({ type: 'seed_board', board });
    }
    for (const pinId of cleanPinIds) {
      units.push({ type: 'snowball_pin', pin_id: pinId });
    }

    const effectiveShards = Math.max(1, Math.min(clampedRequested, Math.max(1, units.length)));
    return {
      strategy: 'multi_dimensional',
      runType: cleanRunType,
      requestedShards: clampedRequested,
      effectiveShards,
      units,
      keywords: cleanKeywords,
      seedBoards: cleanBoards,
      seedPinIds: cleanPinIds,
      settingsOverrides: settingsOverrides ? deepClonePlain(settingsOverrides) : null,
      activity
    };
  }

  // Mode 4: Board-only / Home-feed-only / Unseeded autonomous sweep
  if (cleanBoards.length > 0 || activity.homeFeedEnabled) {
    const units = [];
    for (const board of cleanBoards) {
      units.push({ type: 'seed_board', board });
    }
    if (activity.homeFeedEnabled) {
      units.push({ type: 'home_feed' });
    }
    for (const pinId of cleanPinIds) {
      units.push({ type: 'snowball_pin', pin_id: pinId });
    }
    const effectiveShards = Math.max(1, Math.min(clampedRequested, Math.max(1, units.length)));
    return {
      strategy: 'seed_assets',
      runType: cleanRunType,
      requestedShards: clampedRequested,
      effectiveShards,
      units,
      keywords: [],
      seedBoards: cleanBoards,
      seedPinIds: cleanPinIds,
      settingsOverrides: settingsOverrides ? deepClonePlain(settingsOverrides) : null,
      activity
    };
  }

  return {
    strategy: 'autonomous',
    runType: cleanRunType,
    requestedShards: clampedRequested,
    effectiveShards: clampedRequested,
    units: [],
    keywords: [],
    seedBoards: [],
    seedPinIds: [],
    settingsOverrides: settingsOverrides ? deepClonePlain(settingsOverrides) : null,
    activity
  };
}

/**
 * Resolves the exact workload slice (`myQueries`, `myBoards`, `myPinIds`, `snowballOnly`,
 * `workerSettingsOverrides`, `empty`) for a specific Fleet worker `(workerIndex, workerTotal)`.
 */
export function resolveShardAssignmentForWorker(plan, workerIndex = 0, workerTotal = null) {
  const effectiveTotal = Math.max(1, Number(workerTotal) || Number(plan?.effectiveShards) || 1);
  const effectiveIndex = Math.max(0, Math.min(effectiveTotal - 1, Number(workerIndex) || 0));
  const baseOverrides = plan?.settingsOverrides ? deepClonePlain(plan.settingsOverrides) : {};
  const activity = plan?.activity || resolveSurfaceActivity(baseOverrides);

  // 1. Snowball strategy
  if (plan?.strategy === 'snowball_pins') {
    const allPinIds = Array.isArray(plan.seedPinIds) ? plan.seedPinIds : [];
    const myPinIds = allPinIds.filter((_, idx) => idx % effectiveTotal === effectiveIndex);
    const empty = allPinIds.length > 0 && myPinIds.length === 0;
    return {
      strategy: 'snowball_pins',
      runType: 'snowball',
      snowballOnly: true,
      myQueries: [],
      myBoards: [],
      myPinIds,
      workerSettingsOverrides: Object.keys(baseOverrides).length > 0 ? baseOverrides : null,
      units: myPinIds.map((pin_id) => ({ type: 'snowball_pin', pin_id })),
      empty
    };
  }

  // 2. Keyword-sharded strategy (keywords >= shards): round-robin across keywords, boards, and pins
  if (plan?.strategy === 'keyword_sharded') {
    const myQueries = (plan.keywords || []).filter((_, idx) => idx % effectiveTotal === effectiveIndex);
    const myBoards = (plan.seedBoards || []).filter((_, idx) => idx % effectiveTotal === effectiveIndex);
    const myPinIds = (plan.seedPinIds || []).filter((_, idx) => idx % effectiveTotal === effectiveIndex);
    const workerOverrides = deepClonePlain(baseOverrides);
    if (activity.homeFeedEnabled && effectiveIndex > 0) {
      workerOverrides.discovery = isPlainObject(workerOverrides.discovery) ? workerOverrides.discovery : {};
      workerOverrides.discovery.surfaces = isPlainObject(workerOverrides.discovery.surfaces) ? workerOverrides.discovery.surfaces : {};
      workerOverrides.discovery.surfaces.home_feed = {
        ...(isPlainObject(workerOverrides.discovery.surfaces.home_feed) ? workerOverrides.discovery.surfaces.home_feed : {}),
        enabled: false
      };
    }
    const empty = myQueries.length === 0 && myBoards.length === 0 && myPinIds.length === 0 && !(activity.homeFeedEnabled && effectiveIndex === 0);
    return {
      strategy: 'keyword_sharded',
      runType: plan.runType || 'discovery',
      snowballOnly: false,
      myQueries,
      myBoards,
      myPinIds,
      workerSettingsOverrides: Object.keys(workerOverrides).length > 0 ? workerOverrides : null,
      units: myQueries.map((keyword) => ({ type: 'keyword_full', keyword })),
      empty
    };
  }

  // 3. Multi-dimensional & seed_assets strategies
  if (plan?.strategy === 'multi_dimensional' || plan?.strategy === 'seed_assets') {
    const allUnits = Array.isArray(plan.units) ? plan.units : [];
    const myUnits = allUnits.filter((_, idx) => idx % effectiveTotal === effectiveIndex);
    if (myUnits.length === 0) {
      return {
        strategy: plan.strategy,
        runType: plan.runType || 'discovery',
        snowballOnly: false,
        myQueries: [],
        myBoards: [],
        myPinIds: [],
        workerSettingsOverrides: null,
        units: [],
        empty: true
      };
    }

    const querySet = new Set();
    const myBoards = [];
    const myPinIds = [];
    let hasSearch = false;
    let hasIdeas = false;
    let hasBoardSlice = false;
    let hasFullKeyword = false;
    let hasHomeFeed = false;
    const boardSliceIndices = [];
    let boardSliceTotal = 1;

    for (const u of myUnits) {
      if (u.type === 'pin_serp_capsules') {
        hasSearch = true;
        if (u.keyword) querySet.add(u.keyword);
      } else if (u.type === 'ideas_feeds') {
        hasIdeas = true;
        if (u.keyword) querySet.add(u.keyword);
      } else if (u.type === 'query_boards_slice') {
        hasBoardSlice = true;
        if (u.keyword) querySet.add(u.keyword);
        if (Number.isInteger(u.board_slice_index)) boardSliceIndices.push(u.board_slice_index);
        if (Number(u.board_slice_total) > boardSliceTotal) boardSliceTotal = Number(u.board_slice_total);
      } else if (u.type === 'keyword_full') {
        hasFullKeyword = true;
        if (u.keyword) querySet.add(u.keyword);
      } else if (u.type === 'seed_board' && u.board) {
        myBoards.push(u.board);
      } else if (u.type === 'home_feed') {
        hasHomeFeed = true;
      } else if (u.type === 'snowball_pin' && u.pin_id) {
        myPinIds.push(u.pin_id);
      }
    }

    const myQueries = Array.from(querySet);
    const hasOnlyPinUnits = myPinIds.length > 0 && myQueries.length === 0 && myBoards.length === 0 && !hasHomeFeed;
    const workerOverrides = deepClonePlain(baseOverrides);
    workerOverrides.discovery = isPlainObject(workerOverrides.discovery) ? workerOverrides.discovery : {};
    workerOverrides.discovery.surfaces = isPlainObject(workerOverrides.discovery.surfaces) ? workerOverrides.discovery.surfaces : {};
    const surf = workerOverrides.discovery.surfaces;

    if (!hasFullKeyword) {
      const hasAnyBoardWork = hasBoardSlice || myBoards.length > 0;
      surf.pin_serp_capsules = { ...(isPlainObject(surf.pin_serp_capsules) ? surf.pin_serp_capsules : {}), enabled: hasSearch };
      surf.ideas_feeds = { ...(isPlainObject(surf.ideas_feeds) ? surf.ideas_feeds : {}), enabled: hasIdeas };
      surf.fresh_boards = { ...(isPlainObject(surf.fresh_boards) ? surf.fresh_boards : {}), enabled: hasBoardSlice };
      surf.board_more_ideas = {
        ...(isPlainObject(surf.board_more_ideas) ? surf.board_more_ideas : {}),
        enabled: hasAnyBoardWork ? activity.boardMoreIdeasEnabled : false
      };
      surf.board_feed = {
        ...(isPlainObject(surf.board_feed) ? surf.board_feed : {}),
        enabled: hasAnyBoardWork ? activity.boardFeedEnabled : false
      };
      surf.home_feed = { ...(isPlainObject(surf.home_feed) ? surf.home_feed : {}), enabled: hasHomeFeed };
      if (myPinIds.length > 0) {
        surf.related_pin_snowball = { ...(isPlainObject(surf.related_pin_snowball) ? surf.related_pin_snowball : {}), enabled: true };
      } else if (!hasSearch && !hasIdeas && !hasAnyBoardWork) {
        surf.related_pin_snowball = { ...(isPlainObject(surf.related_pin_snowball) ? surf.related_pin_snowball : {}), enabled: false };
      }
    }

    if (hasBoardSlice && boardSliceTotal > 1) {
      const sortedSlices = Array.from(new Set(boardSliceIndices)).sort((a, b) => a - b);
      workerOverrides.discovery.board_slice_total = boardSliceTotal;
      workerOverrides.discovery.board_slice_index = sortedSlices[0] ?? 0;
      workerOverrides.discovery.board_slice_indices = sortedSlices;
    }

    return {
      strategy: plan.strategy,
      runType: hasOnlyPinUnits ? 'snowball' : (plan.runType || 'discovery'),
      snowballOnly: hasOnlyPinUnits,
      myQueries,
      myBoards,
      myPinIds,
      workerSettingsOverrides: workerOverrides,
      units: myUnits,
      empty: false
    };
  }

  // 4. Autonomous sweep fallback
  return {
    strategy: 'autonomous',
    runType: plan?.runType || 'discovery',
    snowballOnly: false,
    myQueries: [],
    myBoards: [],
    myPinIds: [],
    workerSettingsOverrides: Object.keys(baseOverrides).length > 0 ? baseOverrides : null,
    units: [],
    empty: false
  };
}
