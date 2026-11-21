/**
 * src/modules/newborn/orchestrator.mjs
 *
 * Newborn Discovery, Snowball Expansion, Watchlist Polling, and Schedule-Driven Autonomous Cycle Orchestrators.
 */

import { Semaphore, sanitizeForJsonb } from '../../utils.mjs';
import {
  invalidateEdgeCache,
  isValidPinId,
  redactSecrets
} from '../../http/security-and-response.mjs';
import {
  evaluateAutomationSchedule,
  stampAutomationRunTimestamp,
  resolveEffectiveNewbornSettings,
  resolveNewbornRawCookie
} from './settings.mjs';
import { NewbornCookieRouter } from './cookie-router.mjs';
import { mergeCandidatePinRecords } from './surface-normalizers.mjs';
import {
  pretriageCandidatesWithPidgets,
  hydratePinZeroCookie,
  hydrateUserZeroCookie
} from './surface-hydrators.mjs';
import {
  scoreNewbornCandidate,
  evaluatePinAutoRules,
  scoreRookieCreator,
  evaluateRookieAutoRules,
  buildPeerAnnotationCounts,
  synthesizeNewbornCrossoverBlueprint
} from './intelligence.mjs';
import {
  upsertStagedCandidatesBatch,
  upsertStagedRookiesBatch,
  executeNewbornHarvestPipeline
} from './harvester.mjs';
import {
  promoteNewbornCandidates,
  promoteNewbornRookies
} from './promotions.mjs';

/**
 * Runs the 8-Surface Newborn Discovery pipeline + autonomous rule evaluation.
 */
export async function runNewbornDiscovery(sql, options = {}) {
  const res = await executeNewbornHarvestPipeline(sql, {
    ...options,
    runType: options.runType || 'discovery',
    onAutoPromotePins: async (pinIds, settings) => {
      return await promoteNewbornCandidates(sql, {
        pinIds,
        destinations: settings.automation.pin_promotion_rules.destinations,
        source: 'auto_rule',
        env: options.env,
        ctx: options.ctx
      });
    },
    onAutoPromoteRookies: async (usernames, settings) => {
      const rRules = settings.automation.rookie_promotion_rules;
      return await promoteNewbornRookies(sql, {
        usernames,
        trackingMode: rRules.destination_tracking_mode,
        folderId: rRules.destination_folder_id,
        source: 'auto_rule',
        env: options.env,
        ctx: options.ctx
      });
    }
  });

  await invalidateEdgeCache('newborn');
  return res;
}

/**
 * Runs targeted Multi-Hop `RelatedModulesResource/get` Snowball expansion on explicit pin IDs
 * or the top staged Golden Pins in `newborn_candidates`.
 */
export async function runNewbornSnowball(sql, options = {}) {
  let seedPinIds = Array.isArray(options.seedPinIds)
    ? options.seedPinIds.map((id) => String(id || '').trim()).filter(isValidPinId)
    : [];

  if (seedPinIds.length === 0 && sql && typeof sql === 'function') {
    const { settings } = await resolveEffectiveNewbornSettings(sql, {
      profileId: options.profileId,
      overrides: options.settingsOverrides
    });
    const cap = settings.discovery.snowball.seed_cap || 10;
    const rows = await sql`
      SELECT pin_id
      FROM newborn_candidates
      WHERE stage IN ('discovered', 'watchlist')
        AND is_golden_pin = TRUE
      ORDER BY repin_count DESC NULLS LAST, golden_score DESC, first_seen_at DESC
      LIMIT ${cap};
    `;
    seedPinIds = (rows || []).map((r) => String(r.pin_id));
  }

  return await runNewbornDiscovery(sql, {
    ...options,
    seedPinIds,
    snowballOnly: true,
    runType: 'snowball'
  });
}

/**
 * Polls staged `watchlist` pins & rookie accounts via strict zero-cookie hydrators
 * (parallelized with Semaphore(6) / Semaphore(4)), records daily staging snapshots,
 * advances `consecutive_qualifying_days`, and auto-promotes winners meeting `promote_thresholds`.
 */
export async function pollNewbornWatchlist(sql, options = {}) {
  const {
    profileId = null,
    folderId = null,
    existingRunId = null,
    settingsOverrides = null,
    rawCookieOverride = null,
    routerOptions = {},
    workerIndex = 0,
    workerTotal = 1,
    nowMs = Date.now(),
    autoPromote = null,
    env = null,
    ctx = null
  } = options;

  const { settings, profile } = await resolveEffectiveNewbornSettings(sql, {
    profileId,
    overrides: settingsOverrides
  });

  const resolvedCookie = rawCookieOverride !== null && rawCookieOverride !== undefined
    ? { rawCookie: String(rawCookieOverride).trim() }
    : await resolveNewbornRawCookie(sql, env || routerOptions.env || {});

  const router = new NewbornCookieRouter({
    rawCookie: resolvedCookie.rawCookie,
    ...routerOptions
  });

  const wTotal = Math.max(1, Number(workerTotal) || 1);
  const wIdx = Math.max(0, Math.min(wTotal - 1, Number(workerIndex) || 0));
  const numericFolderId = folderId !== null && folderId !== undefined && Number(folderId) > 0 ? Number(folderId) : null;

  let runRowId = existingRunId !== null && existingRunId !== undefined && Number(existingRunId) > 0
    ? Number(existingRunId)
    : null;

  if (runRowId === null) {
    try {
      const [rRow] = await sql`
        INSERT INTO newborn_runs (
          run_type, status, progress_stage, progress_detail, progress_pct,
          profile_id, folder_id, cookie_mode, started_at
        )
        VALUES (
          'watchlist_poll', 'running', 'hydrating_pins', 'Polling watchlist pins on Pinterest...', 15,
          ${profile?.id ?? null}, ${numericFolderId}, 'zero_cookie', NOW()
        )
        RETURNING id;
      `;
      runRowId = rRow?.id ? Number(rRow.id) : null;
    } catch (_) {}
  }

  const updateRunProgress = async (stage, detail, pct) => {
    if (runRowId === null) return;
    await sql`
      UPDATE newborn_runs
      SET progress_stage = ${stage}, progress_detail = ${detail}, progress_pct = ${Math.max(0, Math.min(100, Math.round(pct)))}
      WHERE id = ${runRowId};
    `.catch(() => {});
  };

  try {
    await updateRunProgress('hydrating_pins', 'Loading watchlisted pins & creators...', 15);

    const watchlistPins = wTotal === 20
      ? await sql`
          SELECT *
          FROM newborn_candidates
          WHERE stage = 'watchlist'
            AND (ABS(hashtext(pin_id::text)::bigint) % 20) = ${wIdx}
          ORDER BY pin_id ASC;
        `
      : (wTotal > 1
          ? await sql`
              SELECT *
              FROM newborn_candidates
              WHERE stage = 'watchlist'
                AND (ABS(hashtext(pin_id::text)::bigint) % ${wTotal}) = ${wIdx}
              ORDER BY pin_id ASC;
            `
          : await sql`
              SELECT *
              FROM newborn_candidates
              WHERE stage = 'watchlist'
              ORDER BY pin_id ASC;
            `);

    const watchlistRookies = wIdx === 0
      ? await sql`
          SELECT *
          FROM newborn_rookie_accounts
          WHERE stage = 'watchlist'
          ORDER BY username ASC;
        `
      : [];

    const pinIds = (watchlistPins || []).map((p) => String(p.pin_id));
    const pidgetsMap = pinIds.length > 0
      ? await pretriageCandidatesWithPidgets(pinIds, router)
      : new Map();

    await updateRunProgress('hydrating_pins', `Refreshing ${pinIds.length} watchlisted pin${pinIds.length === 1 ? '' : 's'} on Pinterest...`, 40);

    const pinSem = new Semaphore(6);
    const rootPinCache = new Map();
    const refreshedCandidates = await Promise.all(
      (watchlistPins || []).map((row) => pinSem.run(async () => {
        let merged = { ...row };
        const pInfo = pidgetsMap.get(String(row.pin_id));
        if (pInfo) {
          merged = mergeCandidatePinRecords(merged, pInfo);
        }

        const hyd = await hydratePinZeroCookie(String(row.pin_id), router, {
          rootPinCache,
          nowMs,
          resolveRootPin: Boolean(settings.qualification?.resolve_root_pin === true)
        });
        if (hyd.ok && hyd.pin) {
          merged = mergeCandidatePinRecords(merged, hyd.pin);
        }

        const scored = scoreNewbornCandidate(merged, settings, { nowMs });
        scored.stage = 'watchlist';
        return scored;
      }))
    );

    const watchlistPeerAnnCounts = buildPeerAnnotationCounts(refreshedCandidates);
    for (const scored of refreshedCandidates) {
      scored.crossover_blueprint = synthesizeNewbornCrossoverBlueprint(scored, watchlistPeerAnnCounts);
    }

    let persistedPins = [];
    if (refreshedCandidates.length > 0) {
      const upRes = await upsertStagedCandidatesBatch(sql, refreshedCandidates, {
        profileId: profile?.id ?? null,
        runId: runRowId,
        folderId: numericFolderId,
        nowMs,
        isWatchlistPoll: true
      });
      persistedPins = upRes.rows;
    }

    await updateRunProgress('hydrating_creators', `Refreshing ${(watchlistRookies || []).length} watchlisted creator${(watchlistRookies || []).length === 1 ? '' : 's'}...`, 78);

    const persistedPinsByUser = new Map();
    for (const p of persistedPins) {
      const uname = p?.effective_creator_username;
      if (!uname) continue;
      let list = persistedPinsByUser.get(uname);
      if (!list) {
        list = [];
        persistedPinsByUser.set(uname, list);
      }
      list.push(p);
    }

    const userSem = new Semaphore(4);
    const refreshedRookiesRaw = await Promise.all(
      (watchlistRookies || []).map((rkRow) => userSem.run(async () => {
        const uRes = await hydrateUserZeroCookie(rkRow.username, router);
        if (uRes.ok && uRes.user) {
          const assocPins = persistedPinsByUser.get(rkRow.username) || [];
          const scoredRk = scoreRookieCreator(uRes.user, assocPins, settings);
          scoredRk.stage = 'watchlist';
          scoredRk.golden_pins_count = Math.max(Number(rkRow.golden_pins_count || 0), scoredRk.golden_pins_count);
          return scoredRk;
        }
        return null;
      }))
    );
    const refreshedRookies = refreshedRookiesRaw.filter(Boolean);

    let persistedRookies = [];
    if (refreshedRookies.length > 0) {
      const rkUpRes = await upsertStagedRookiesBatch(sql, refreshedRookies, {
        nowMs,
        isWatchlistPoll: true
      });
      persistedRookies = rkUpRes.rows;
    }

    const shouldAutoPromote = autoPromote !== null
      ? Boolean(autoPromote)
      : Boolean(settings.automation.auto_track_enabled);

    let promotedPinsResult = { promoted_count: 0, pin_ids: [] };
    let promotedRookiesResult = { promoted_count: 0, competitors: [] };

    if (shouldAutoPromote) {
      const winningPinIds = persistedPins
        .filter((c) => evaluatePinAutoRules(c, settings).meets_promotion)
        .map((c) => c.pin_id);

      if (winningPinIds.length > 0) {
        promotedPinsResult = await promoteNewbornCandidates(sql, {
          pinIds: winningPinIds,
          destinations: settings.automation.pin_promotion_rules.destinations,
          source: 'watchlist_auto_rule',
          env,
          ctx
        });
      }

      const winningRookies = persistedRookies
        .filter((r) => evaluateRookieAutoRules(r, settings).meets_promotion)
        .map((r) => r.username);

      if (winningRookies.length > 0) {
        const rRules = settings.automation.rookie_promotion_rules;
        promotedRookiesResult = await promoteNewbornRookies(sql, {
          usernames: winningRookies,
          trackingMode: rRules.destination_tracking_mode,
          folderId: rRules.destination_folder_id,
          source: 'watchlist_auto_rule',
          env,
          ctx
        });
      }
    }

    await stampAutomationRunTimestamp(sql, 'watchlist_poll', new Date(nowMs).toISOString()).catch(() => {});

    const totalAutoPromoted = Number(promotedPinsResult.promoted_count || 0) + Number(promotedRookiesResult.promoted_count || 0);
    if (runRowId !== null) {
      await sql`
        UPDATE newborn_runs
        SET
          status = 'completed',
          progress_stage = 'completed',
          progress_detail = ${`Polled ${persistedPins.length} watchlisted pin${persistedPins.length === 1 ? '' : 's'} (${totalAutoPromoted} auto-promoted).`},
          progress_pct = 100,
          error_message = NULL,
          candidates_discovered = ${persistedPins.length},
          candidates_qualified = ${persistedPins.filter((c) => c.qualified !== false).length},
          golden_pins_count = ${persistedPins.filter((c) => c.is_golden_pin).length},
          rookie_creators_count = ${persistedRookies.length},
          auto_promoted_count = ${totalAutoPromoted},
          telemetry = ${JSON.stringify(sanitizeForJsonb({
            router: router.getRedactedTelemetry(),
            promoted_pin_ids: promotedPinsResult.pin_ids || []
          }))}::jsonb,
          completed_at = NOW()
        WHERE id = ${runRowId};
      `.catch(() => {});
    }

    await invalidateEdgeCache('newborn');

    return {
      ok: true,
      run_id: runRowId,
      polled_pins_count: persistedPins.length,
      polled_rookies_count: persistedRookies.length,
      auto_promoted_pins: promotedPinsResult.pin_ids || [],
      auto_promoted_rookies: (promotedRookiesResult.competitors || []).map((c) => c.username),
      candidates: persistedPins,
      rookies: persistedRookies
    };
  } catch (err) {
    const safeErrMsg = redactSecrets(err?.message || 'Watchlist poll failed').slice(0, 1000);
    if (runRowId !== null) {
      await sql`
        UPDATE newborn_runs
        SET
          status = 'failed',
          progress_stage = 'failed',
          progress_detail = ${safeErrMsg},
          error_message = ${safeErrMsg},
          completed_at = NOW()
        WHERE id = ${runRowId};
      `.catch(() => {});
    }
    throw err;
  }
}

/**
 * Evaluates the dynamic automation schedule (`evaluateAutomationSchedule`) and executes
 * due watchlist polling and/or multi-surface discovery.
 */
export async function runNewbornAutoCycle(sql, options = {}) {
  const {
    nowMs = Date.now(),
    force = false,
    forceDiscovery = false,
    forceWatchlist = false,
    seedQueries = [],
    profileId = null,
    folderId = null,
    existingRunId = null,
    routerOptions = {},
    env = null,
    ctx = null
  } = options;

  const { settings } = await resolveEffectiveNewbornSettings(sql, { profileId });
  const schedule = evaluateAutomationSchedule(settings, new Date(nowMs));
  const numericRunId = existingRunId !== null && existingRunId !== undefined && Number(existingRunId) > 0
    ? Number(existingRunId)
    : null;

  if (!force && !forceDiscovery && !forceWatchlist && !schedule.auto_track_enabled) {
    if (numericRunId !== null && sql && typeof sql === 'function') {
      await sql`
        UPDATE newborn_runs
        SET
          status = 'completed',
          progress_stage = 'completed',
          progress_detail = 'Skipped — Auto-Track automation is currently disabled.',
          progress_pct = 100,
          completed_at = NOW()
        WHERE id = ${numericRunId};
      `.catch(() => {});
    }
    return {
      ok: true,
      executed: false,
      reason: 'auto_track_disabled',
      schedule
    };
  }

  const results = {
    ok: true,
    executed: false,
    schedule,
    watchlist_poll: null,
    discovery: null
  };

  const runDisc = Boolean(force || forceDiscovery || schedule.discovery_due);
  const runWatch = Boolean(force || forceWatchlist || schedule.watchlist_poll_due);

  if (runWatch) {
    results.watchlist_poll = await pollNewbornWatchlist(sql, {
      profileId,
      folderId,
      existingRunId: !runDisc ? numericRunId : null,
      routerOptions,
      nowMs,
      env,
      ctx
    });
    results.executed = true;
  }

  if (runDisc) {
    results.discovery = await runNewbornDiscovery(sql, {
      seedQueries,
      profileId,
      folderId,
      existingRunId: numericRunId,
      routerOptions,
      runType: 'auto_cycle',
      nowMs,
      env,
      ctx
    });
    results.executed = true;
  }

  if (!results.executed) {
    results.reason = schedule.cooldown_active
      ? 'cooldown_active'
      : (!schedule.in_target_window ? 'outside_target_utc_window' : 'interval_not_elapsed');
    if (numericRunId !== null && sql && typeof sql === 'function') {
      await sql`
        UPDATE newborn_runs
        SET
          status = 'completed',
          progress_stage = 'completed',
          progress_detail = ${`Skipped (${results.reason}).`},
          progress_pct = 100,
          completed_at = NOW()
        WHERE id = ${numericRunId};
      `.catch(() => {});
    }
  }

  return results;
}
