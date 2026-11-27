import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getStandardPinterestHeaders,
  sanitizeGuestCookie,
  PinterestCircuitBreaker,
  pinterestFetch,
  globalPinterestCircuitBreaker
} from '../src/core/pinterest/client.mjs';
import {
  extractPinFromHtml,
  formatPin,
  PINTEREST_CEILING_VALUE,
  MAX_METRIC_CAP
} from '../src/core/pinterest/pins.mjs';
import { shouldSkipFreshPinEnrichment } from '../src/domain/pin-intelligence.mjs';
import { savePinterestCookie } from '../src/modules/keywords/settings.mjs';
import { evaluateHydrationGuard } from '../scripts/keyword-velocity-crawler.mjs';
import {
  prefetchBatchPidgets,
  processCreatorCatalogPin,
  buildCreatorPhase2FreshnessClause
} from '../scripts/creator-velocity-crawler.mjs';
import {
  parsePinCandidate,
  pruneClusterArbitrageMetrics,
  runClusterIntelligenceLifecycle
} from '../scripts/cluster-intelligence.mjs';
import {
  runFleetLifecycle,
  resolveWorkerPartition,
  writeGitHubOutput,
  appendStepSummary
} from '../scripts/lib/fleet-runner.mjs';
import { parseKeywordFleetArgs } from '../scripts/keyword-fleet.mjs';
import { parseCreatorFleetArgs } from '../scripts/creator-fleet.mjs';
import { parseDomainEnrichArgs } from '../scripts/domain-enrich.mjs';

test('Wave 4A.1: extractPinFromHtml ignores LikeAction for saves, rejects empty SaveAction counts, and accepts explicit SaveAction counts', () => {
  const htmlLikeOnly = `
    <!doctype html>
    <html>
      <head>
        <meta property="og:title" content="Garlic Butter Steak Bites" />
        <meta property="og:image" content="https://i.pinimg.com/736x/ab/cd/ef/abcdef123456.jpg" />
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "SocialMediaPosting",
            "headline": "Garlic Butter Steak Bites",
            "datePublished": "2026-02-10T12:00:00Z",
            "interactionStatistic": [
              {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/LikeAction",
                "userInteractionCount": 42
              },
              {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/SaveAction"
              }
            ]
          }
        </script>
      </head>
      <body></body>
    </html>
  `;

  const parsedLikeOnly = extractPinFromHtml(htmlLikeOnly, '88990011223344');
  assert.ok(parsedLikeOnly);
  assert.equal(parsedLikeOnly.pin_id, '88990011223344');
  assert.equal(parsedLikeOnly.save_count, null);
  assert.equal(parsedLikeOnly.saves, null);
  assert.equal(parsedLikeOnly.has_explicit_saves, false);
  assert.equal(parsedLikeOnly.reaction_count, 42);

  const htmlExplicitSave = `
    <!doctype html>
    <html>
      <head>
        <meta property="og:title" content="Crispy Baked Tacos" />
        <meta property="og:image" content="https://i.pinimg.com/originals/11/22/33/112233445566.jpg" />
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "SocialMediaPosting",
            "headline": "Crispy Baked Tacos",
            "datePublished": "2026-01-20T08:30:00Z",
            "interactionStatistic": [
              {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/LikeAction",
                "userInteractionCount": 19
              },
              {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/SaveAction",
                "userInteractionCount": 18450
              }
            ]
          }
        </script>
      </head>
      <body></body>
    </html>
  `;

  const parsedSave = extractPinFromHtml(htmlExplicitSave, '77665544332211');
  assert.ok(parsedSave);
  assert.equal(parsedSave.save_count, 18450);
  assert.equal(parsedSave.saves, 18450);
  assert.equal(parsedSave.has_explicit_saves, true);
  assert.equal(parsedSave.reaction_count, 19);
});

test('Wave 4A.2 & 4A.3: formatPin preserves 10,000,001 (10M+) ceiling and classifies specific creation_method values', () => {
  assert.equal(PINTEREST_CEILING_VALUE, 10000001);
  assert.equal(MAX_METRIC_CAP, 10000000);

  const megaViralPin = formatPin({
    id: '91919191919191',
    title: 'Mega Viral Holiday Recipe',
    aggregated_pin_data: {
      aggregated_stats: {
        saves: '10M+'
      }
    },
    repin_count: '10M+',
    pinner: {
      username: 'megacreator',
      follower_count: '10M+'
    },
    images: {
      orig: { url: 'https://i.pinimg.com/originals/aa/bb/cc/aabbccddeeff00112233445566778899.jpg' }
    }
  });

  assert.ok(megaViralPin);
  assert.equal(megaViralPin.save_count, PINTEREST_CEILING_VALUE);
  assert.equal(megaViralPin.saves, PINTEREST_CEILING_VALUE);
  assert.equal(megaViralPin.repin_count, PINTEREST_CEILING_VALUE);
  assert.equal(megaViralPin.creator_followers, PINTEREST_CEILING_VALUE);
  assert.equal(megaViralPin.creation_method, 'pinterest_platform');

  const unhydratedStub = formatPin({
    id: '51515151515151',
    title: 'Search Stub Pin',
    repin_count: 25
  });
  assert.equal(unhydratedStub.save_count, null);
  assert.equal(unhydratedStub.creation_method, 'unhydrated_stub');

  const videoPin = formatPin({
    id: '61616161616161',
    title: 'Quick Pasta Video',
    is_video: true,
    aggregated_pin_data: { aggregated_stats: { saves: 400 } }
  });
  assert.equal(videoPin.creation_method, 'video');

  const providerPin = formatPin({
    id: '71717171717171',
    title: 'Scheduled via Tailwind',
    provider_name: 'Tailwind',
    aggregated_pin_data: { aggregated_stats: { saves: 120 } }
  });
  assert.equal(providerPin.creation_method, 'tailwind');
});

test('Wave 4A.3 & 4B.1: Two-Lane hydration guard separates 10m Pidgets dedup from 18h deep PinResource gate', async () => {
  const nowMs = Date.now();
  const fiveMinAgoIso = new Date(nowMs - 5 * 60 * 1000).toISOString();
  const oneHourAgoIso = new Date(nowMs - 60 * 60 * 1000).toISOString();
  const fiveHoursAgoIso = new Date(nowMs - 5 * 60 * 60 * 1000).toISOString();

  for (const creationMethod of ['pinterest_platform', 'organic_pin']) {
    const keywordPin = {
      pin_id: '44556677889900',
      save_count: 920,
      repin_count: 140,
      daily_save_velocity: 18.5,
      created_at_pinterest: '2025-11-01T10:00:00Z',
      last_scraped_at: oneHourAgoIso,
      crawled_at: fiveMinAgoIso, // SERP touch must NEVER block Pidgets telemetry
      is_hydrated: true,
      creation_method: creationMethod,
      image_signature: '0892528dd65edc951b271ec3b26d3993',
      visual_annotations: ['dinner recipes', 'easy weeknight meals']
    };

    // Deep PinResource SSOT gate (18h) remains intact
    assert.equal(shouldSkipFreshPinEnrichment(keywordPin, 18, nowMs), true);
    assert.equal(
      shouldSkipFreshPinEnrichment({ ...keywordPin, last_scraped_at: fiveHoursAgoIso }, 18, nowMs),
      true
    );

    // Within 10m of last_scraped_at -> cached (unless force: true)
    const freshDedupGuard = evaluateHydrationGuard(
      { ...keywordPin, last_scraped_at: fiveMinAgoIso },
      nowMs,
      { force: false }
    );
    assert.equal(freshDedupGuard.shouldFetch, false);
    assert.equal(freshDedupGuard.lane, 'cache');
    assert.equal(freshDedupGuard.reason, 'pidgets_dedup_window_10m');

    // Force bypasses 10m dedup window -> routes to Pidgets lane (not deep)
    const forcedGuard = evaluateHydrationGuard(
      { ...keywordPin, last_scraped_at: fiveMinAgoIso },
      nowMs,
      { force: true }
    );
    assert.equal(forcedGuard.shouldFetch, true);
    assert.equal(forcedGuard.lane, 'pidgets');
    assert.equal(forcedGuard.shouldFetchDeep, false);

    // 1h old last_scraped_at (even with fresh 5m crawled_at) -> routes to Lane 1 Pidgets fast telemetry!
    const pidgetsGuard = evaluateHydrationGuard(keywordPin, nowMs, { force: false });
    assert.equal(pidgetsGuard.shouldFetch, true);
    assert.equal(pidgetsGuard.lane, 'pidgets');
    assert.equal(pidgetsGuard.shouldFetchDeep, false);
    assert.equal(pidgetsGuard.reason, 'pidgets_fast_telemetry');

    // Creator Pidgets pre-pass skips within 10m dedup window, runs at 1h, and keeps 0 PinResource/HTML calls
    let pidgetsSkippedWithin10m = false;
    const skippedMap = await prefetchBatchPidgets(
      [{ ...keywordPin, last_scraped_at: fiveMinAgoIso, ump_saves: 920, ump_repins: 140 }],
      {
        useFreshnessGate: true,
        useUmpFields: true,
        forceRefresh: false,
        nowMs,
        batchPidgetsFn: async () => {
          pidgetsSkippedWithin10m = true;
          return new Map();
        }
      }
    );
    assert.equal(pidgetsSkippedWithin10m, false);
    assert.equal(skippedMap.size, 0);

    let pidgetsCalledAt1h = false;
    const pidgetsAt1hMap = await prefetchBatchPidgets(
      [{ ...keywordPin, ump_saves: 920, ump_repins: 140 }],
      {
        useFreshnessGate: true,
        useUmpFields: true,
        forceRefresh: false,
        nowMs,
        batchPidgetsFn: async (ids) => {
          pidgetsCalledAt1h = true;
          return new Map([[ids[0], { pin_id: ids[0], saves: 960, save_count: 960, repins: 145, repin_count: 145, has_explicit_saves: true, has_explicit_repins: true, is_missing: false }]]);
        }
      }
    );
    assert.equal(pidgetsCalledAt1h, true);
    assert.equal(pidgetsAt1hMap.size, 1);

    let liveDeepFetchCalled = false;
    const collectors = {
      refreshedPins: [],
      metricSnapshots: [],
      masterPinsToSync: []
    };
    // When Pidgets payload is provided for 1h-old pin, Creator updates saves with 0 PinResource/HTML calls
    const okPidgets = await processCreatorCatalogPin(
      {
        ...keywordPin,
        ump_saves: 920,
        ump_repins: 140,
        ump_comments: 3,
        ump_shares: 7,
        prev_velocity: 18.5
      },
      {
        fallbackUsername: 'chefcreator',
        useFreshnessGate: true,
        useUmpFields: true,
        forceRefresh: false,
        nowMs,
        pidgetsMap: pidgetsAt1hMap,
        fetchPinFromPinResourceFn: async () => {
          liveDeepFetchCalled = true;
          return null;
        },
        fetchPinFromPinterestFn: async () => {
          liveDeepFetchCalled = true;
          return { ok: false };
        }
      },
      collectors
    );
    assert.equal(okPidgets.refreshed, true);
    assert.equal(okPidgets.usedPidgets, true);
    assert.equal(okPidgets.fromCache, false);
    assert.equal(liveDeepFetchCalled, false);
    assert.equal(collectors.refreshedPins[0].saves, 960);

    // When Pidgets returns cliff-drop saves (<80% of prevSaves), processCreatorCatalogPin falls back to live deep fetch and reports usedPidgets: false
    let fallbackHtmlCalled = false;
    const cliffCollectors = { refreshedPins: [], metricSnapshots: [], masterPinsToSync: [] };
    const cliffPidgetsMap = new Map([
      [keywordPin.pin_id, { pin_id: keywordPin.pin_id, saves: 100, save_count: 100, repins: 20, repin_count: 20, has_explicit_saves: true, has_explicit_repins: true, is_missing: false }]
    ]);
    const cliffRes = await processCreatorCatalogPin(
      {
        ...keywordPin,
        ump_saves: 920,
        ump_repins: 140,
        ump_comments: 3,
        ump_shares: 7,
        prev_velocity: 18.5
      },
      {
        fallbackUsername: 'chefcreator',
        useFreshnessGate: true,
        useUmpFields: true,
        forceRefresh: false,
        nowMs,
        pidgetsMap: cliffPidgetsMap,
        fetchPinFromPinResourceFn: async () => null,
        fetchPinFromPinterestFn: async () => {
          fallbackHtmlCalled = true;
          return {
            ok: true,
            pin: {
              pin_id: keywordPin.pin_id,
              saves: 955,
              save_count: 955,
              repins: 145,
              repin_count: 145,
              has_explicit_saves: true,
              has_explicit_repins: true
            }
          };
        }
      },
      cliffCollectors
    );
    assert.equal(fallbackHtmlCalled, true);
    assert.equal(cliffRes.refreshed, true);
    assert.equal(cliffRes.usedPidgets, false, 'Fallback to live HTML must report usedPidgets: false so caller applies cooldown');
    assert.equal(cliffRes.fromCache, false);

    // Without Pidgets map on 1h-old complete pin, 18h deep freshness gate still protects PinResource/HTML
    const cachedCollectors = { refreshedPins: [], metricSnapshots: [], masterPinsToSync: [] };
    const okCached = await processCreatorCatalogPin(
      {
        ...keywordPin,
        ump_saves: 920,
        ump_repins: 140,
        ump_comments: 3,
        ump_shares: 7,
        prev_velocity: 18.5
      },
      {
        fallbackUsername: 'chefcreator',
        useFreshnessGate: true,
        useUmpFields: true,
        forceRefresh: false,
        nowMs,
        fetchPinFromPinResourceFn: async () => {
          liveDeepFetchCalled = true;
          return null;
        },
        fetchPinFromPinterestFn: async () => {
          liveDeepFetchCalled = true;
          return { ok: false };
        }
      },
      cachedCollectors
    );
    assert.equal(okCached.refreshed, true);
    assert.equal(okCached.usedPidgets, false);
    assert.equal(okCached.fromCache, true);
    assert.equal(liveDeepFetchCalled, false);
    assert.equal(cachedCollectors.refreshedPins[0].from_hydration_cache, true);
    assert.equal(cachedCollectors.refreshedPins[0].delta_repins, null);

    // Verify Mode A Phase 2 SQL freshness predicate aligns with 10m Pidgets dedup window and honors FORCE_REFRESH
    const renderTag = (strings, ...values) => strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), '');
    const defaultPhase2Sql = buildCreatorPhase2FreshnessClause(renderTag, { forceRefresh: false });
    assert.match(defaultPhase2Sql, /MAKE_INTERVAL\(mins => 10\)/);
    assert.match(defaultPhase2Sql, /MAKE_INTERVAL\(hours => 18\)/);
    assert.match(defaultPhase2Sql, /jsonb_array_length\(p\.visual_annotations\) > 0/);
    const forcedPhase2Sql = buildCreatorPhase2FreshnessClause(renderTag, { forceRefresh: true });
    assert.equal(forcedPhase2Sql.trim(), 'TRUE');
  }

  // Unhydrated stubs must still trigger Lane 2 deep hydration even if recently touched
  const stubGuard = evaluateHydrationGuard(
    {
      pin_id: '10101010101010',
      save_count: null,
      is_hydrated: false,
      creation_method: 'unhydrated_stub',
      created_at_pinterest: '2026-01-01T00:00:00Z',
      last_scraped_at: fiveMinAgoIso
    },
    nowMs,
    { force: false }
  );
  assert.equal(stubGuard.shouldFetch, true);
  assert.equal(stubGuard.lane, 'deep');
});

test('Wave 4A.4: getStandardPinterestHeaders never leaks process.env.PINTEREST_COOKIE and savePinterestCookie never mutates process.env', async () => {
  const prevEnvCookie = process.env.PINTEREST_COOKIE;
  process.env.PINTEREST_COOKIE = '_auth=1; _pinterest_sess=SENSITIVE_LOGGED_IN_TOKEN';

  try {
    const defaultHeaders = getStandardPinterestHeaders({
      referer: 'https://www.pinterest.com/pin/12345/'
    });
    assert.equal(defaultHeaders.Cookie, undefined);
    assert.equal(defaultHeaders.cookie, undefined);

    const explicitGuestHeaders = getStandardPinterestHeaders({
      cookie: '_auth=1; csrftoken=guest123'
    });
    assert.equal(explicitGuestHeaders.Cookie, '_auth=0; csrftoken=guest123');
    assert.equal(sanitizeGuestCookie('_auth=1; foo=bar'), '_auth=0; foo=bar');

    process.env.PINTEREST_COOKIE = 'ORIGINAL_ENV_VALUE';
    let persistedQueries = 0;
    const mockSql = async () => {
      persistedQueries++;
      return [];
    };

    const res = await savePinterestCookie(mockSql, '_pinterest_sess=NEW_DB_ONLY_COOKIE');
    assert.equal(res.has_cookie, true);
    assert.ok(persistedQueries >= 1);
    assert.equal(process.env.PINTEREST_COOKIE, 'ORIGINAL_ENV_VALUE');
  } finally {
    if (prevEnvCookie === undefined) {
      delete process.env.PINTEREST_COOKIE;
    } else {
      process.env.PINTEREST_COOKIE = prevEnvCookie;
    }
  }
});

test('Wave 4A.5: PinterestCircuitBreaker enforces single HALF_OPEN probe and pinterestFetch isolates external caller aborts', async () => {
  const breaker = new PinterestCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 25 });
  assert.equal(breaker.canExecute(), true);

  breaker.recordFailure(429);
  breaker.recordFailure(403);
  assert.equal(breaker.getState().state, 'OPEN');
  assert.equal(breaker.canExecute(), false);

  await new Promise((r) => setTimeout(r, 35));

  // Strictly ONE probe request allowed through in HALF_OPEN; concurrent stampede blocked
  assert.equal(breaker.canExecute(), true);
  assert.equal(breaker.getState().state, 'HALF_OPEN');
  assert.equal(breaker.getState().probeInFlight, true);
  assert.equal(breaker.canExecute(), false);
  assert.equal(breaker.canExecute(), false);

  // Failed probe immediately re-opens circuit and resets probeInFlight
  breaker.recordFailure(429);
  assert.equal(breaker.getState().state, 'OPEN');
  assert.equal(breaker.getState().probeInFlight, false);

  await new Promise((r) => setTimeout(r, 35));
  assert.equal(breaker.canExecute(), true);
  assert.equal(breaker.canExecute(), false);
  breaker.recordSuccess();
  assert.equal(breaker.getState().state, 'CLOSED');
  assert.equal(breaker.getState().probeInFlight, false);
  assert.equal(breaker.canExecute(), true);

  // External caller AbortController cancellation must NOT trip globalPinterestCircuitBreaker
  globalPinterestCircuitBreaker.reset();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    return new Promise((_resolve, reject) => {
      const onAbort = () => {
        const err = new DOMException('Caller aborted request', 'AbortError');
        reject(err);
      };
      if (init?.signal?.aborted) {
        onAbort();
        return;
      }
      init?.signal?.addEventListener('abort', onAbort, { once: true });
    });
  };

  try {
    for (let i = 0; i < 6; i++) {
      const callerController = new AbortController();
      const pending = pinterestFetch('https://www.pinterest.com/pin/123/', {
        signal: callerController.signal,
        maxRetries: 2
      });
      callerController.abort();
      await assert.rejects(pending, (err) => err?.name === 'AbortError');
    }

    const stateAfterCallerAborts = globalPinterestCircuitBreaker.getState();
    assert.equal(stateAfterCallerAborts.state, 'CLOSED');
    assert.equal(stateAfterCallerAborts.consecutiveFailures, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Wave 4A.4 & 4B.3: cluster-intelligence preserves null saves when explicit saves are absent, prunes >90 snapshots, and cleans up on throw', async () => {
  const unhydratedCandidate = parsePinCandidate(
    {
      id: '33445566778899',
      title: 'Candidate Without Explicit Saves',
      repin_count: 37,
      domain: ' publisher-example.com ',
      images: { orig: { url: 'https://i.pinimg.com/originals/aa/bb/cc/123.jpg', width: 1000, height: 1500 } }
    },
    '11223344556677'
  );
  assert.ok(unhydratedCandidate);
  assert.equal(unhydratedCandidate.saves, null);
  assert.equal(unhydratedCandidate.repins, 37);

  let executedSqlText = '';
  const mockSql = async (strings, ...values) => {
    executedSqlText = strings.join('?') + ' :: ' + JSON.stringify(values);
    return [];
  };
  mockSql.end = async () => {};

  await pruneClusterArbitrageMetrics(mockSql, '11223344556677', 90);
  assert.ok(executedSqlText.includes('DELETE FROM cluster_arbitrage_metrics'));
  assert.ok(executedSqlText.includes('90'));

  let leaseStopped = false;
  let sqlEnded = false;
  await assert.rejects(
    runClusterIntelligenceLifecycle(
      async () => {
        throw new Error('simulated_cluster_failure');
      },
      {
        lease: {
          stop: async () => {
            leaseStopped = true;
          }
        },
        sqlClient: Object.assign(async () => [], {
          end: async () => {
            sqlEnded = true;
          }
        })
      }
    ),
    /simulated_cluster_failure/
  );
  assert.equal(leaseStopped, true);
  assert.equal(sqlEnded, true);
});

test('Wave 4C: runFleetLifecycle guarantees lease.stop() and sql.end() on throw, and consolidated fleet CLIs parse --stage / --mode cleanly', async () => {
  let leaseStopCalls = 0;
  let sqlEndArgs = null;

  const fakeSql = Object.assign(async () => [], {
    end: async (opts) => {
      sqlEndArgs = opts;
    }
  });
  const fakeLease = {
    stop: async () => {
      leaseStopCalls++;
    }
  };

  await assert.rejects(
    runFleetLifecycle(
      'unit-test-failing-fleet',
      async ({ workerIndex, workerTotal }) => {
        assert.equal(workerIndex, 7);
        assert.equal(workerTotal, 20);
        throw new Error('boom_inside_fleet_task');
      },
      {
        sqlClient: fakeSql,
        lease: fakeLease,
        loadEnv: false,
        worker: { env: { WORKER_INDEX: '7', WORKER_TOTAL: '20' } }
      }
    ),
    /boom_inside_fleet_task/
  );

  assert.equal(leaseStopCalls, 1);
  assert.deepEqual(sqlEndArgs, { timeout: 3 });

  // 20-worker modulo validation
  assert.deepEqual(resolveWorkerPartition({ env: { SHARD_NUMBER: '20', SHARD_TOTAL: '20' } }), {
    workerIndex: 19,
    workerTotal: 20,
    workerSlot: 20,
    hasExplicitIndex: true
  });
  assert.throws(
    () => resolveWorkerPartition({ env: { WORKER_INDEX: '20', WORKER_TOTAL: '20' } }),
    RangeError
  );

  // GitHub Actions output & summary helpers
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pae-wave4-'));
  const outPath = path.join(tmpDir, 'gh_output.txt');
  const sumPath = path.join(tmpDir, 'gh_summary.md');
  try {
    await writeGitHubOutput('task_count', '20', outPath);
    appendStepSummary('### Fleet Summary OK\n', sumPath);
    assert.equal(fs.readFileSync(outPath, 'utf8'), 'task_count=20\n');
    assert.equal(fs.readFileSync(sumPath, 'utf8'), '### Fleet Summary OK\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Consolidated CLI entrypoint flag parsers
  assert.equal(parseKeywordFleetArgs(['--stage=dispatch']).stage, 'dispatch');
  assert.equal(parseKeywordFleetArgs(['--stage', 'consolidate']).stage, 'consolidate');
  assert.throws(() => parseKeywordFleetArgs(['--stage=unknown']), /Invalid or missing --stage/);

  assert.equal(parseCreatorFleetArgs(['--stage=dispatch']).stage, 'dispatch');
  assert.equal(parseCreatorFleetArgs(['--stage=consolidate']).stage, 'consolidate');
  assert.throws(() => parseCreatorFleetArgs([]), /Invalid or missing --stage/);

  assert.equal(parseDomainEnrichArgs(['--mode=whois']).mode, 'whois');
  assert.equal(parseDomainEnrichArgs(['--mode=ads', '--force']).forceRefresh, true);
  assert.equal(parseDomainEnrichArgs(['--mode=rollup']).mode, 'rollup');
  const allParsed = parseDomainEnrichArgs(['--mode=all', '--batch=30', '--concurrency=5', '--max=100']);
  assert.equal(allParsed.mode, 'all');
  assert.equal(allParsed.whoisBatchSize, 30);
  assert.equal(allParsed.whoisConcurrency, 5);
  assert.equal(allParsed.maxTotal, 100);
  assert.throws(() => parseDomainEnrichArgs(['--mode=invalid']), /Invalid or missing --mode/);
});
