/**
 * tests/round17-postgres-resilience-and-truth.test.mjs
 *
 * Round 17 Verification Suite:
 * 1. postgres@3.4.9 postinstall null-socket / closed / rollback patcher
 * 2. Transient PG connection error classifier & withDbRetry recovery
 * 3. isRepinHydrationJump & calculateRollingGainsFromSnapshots anti-hydration shield
 * 4. Pulse service skeleton repin suppression & secondary-source non-ratchet
 * 5. Pin Dossier live SERP/master merge & single-snapshot velocity parity
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { patchPostgresFiles } from '../scripts/patch-postgres.mjs';
import { isTransientPgConnectionError, withDbRetry } from '../src/db/client.mjs';
import { isRepinHydrationJump, sanitizeDossierTrajectory } from '../src/lib/math.mjs';
import { calculateRollingGainsFromSnapshots } from '../scripts/backfill_rolling_window_gains.mjs';
import {
  getGlobal24hPulseService,
  pulseMemoryCache,
  pulseForceRefreshCooldown,
  inflightPulse
} from '../src/modules/pulse/service.mjs';
import { fetchUniversalPinDossier } from '../src/modules/pins/repository.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function resetPulseCaches() {
  pulseMemoryCache.clear();
  pulseForceRefreshCooldown.clear();
  inflightPulse.clear();
}

describe('Round 17: Phase 1 Postgres Resilience & Null-Socket Shield', () => {
  it('patchPostgresFiles is idempotent on already-patched workspace and patches clean copies cleanly', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pae-pg-patch-'));
    try {
      const tmpPgSrc = path.join(tmpRoot, 'node_modules', 'postgres', 'src');
      fs.mkdirSync(tmpPgSrc, { recursive: true });
      const realConn = fs.readFileSync(path.join(ROOT_DIR, 'node_modules', 'postgres', 'src', 'connection.js'), 'utf8');
      const realIndex = fs.readFileSync(path.join(ROOT_DIR, 'node_modules', 'postgres', 'src', 'index.js'), 'utf8');

      // Strip markers to simulate fresh npm install postgres@3.4.9 source
      const unpatchedConn = realConn
        .replace(
          /  function nextWrite\(fn\) \{[\s\S]*?return x\n  \}/,
          `  function nextWrite(fn) {\n    const x = socket.write(chunk, fn)\n    nextWriteTimer !== null && clearImmediate(nextWriteTimer)\n    chunk = nextWriteTimer = null\n    return x\n  }`
        )
        .replace(
          /  async function closed\(hadError\) \{[\s\S]*?    socket\.removeAllListeners\(\)\n      socket = null\n    \}/,
          `  async function closed(hadError) {\n    incoming = Buffer.alloc(0)\n    remaining = 0\n    incomings = null\n    clearImmediate(nextWriteTimer)\n    socket.removeListener('data', data)\n    socket.removeListener('connect', connected)\n    idleTimer.cancel()\n    lifeTimer.cancel()\n    connectTimer.cancel()\n\n    socket.removeAllListeners()\n    socket = null`
        );
      const unpatchedIndex = realIndex.replace(
        /      \} catch \(e\) \{\n        \/\/ \[pae-postgres-patch:rollback-catch\][\s\S]*?throw e instanceof PostgresError && e\.code === '25P02' && uncaughtError \|\| e\n      \}/,
        `      } catch (e) {\n        await (name\n          ? sql\`rollback to \${ sql(name) }\`\n          : sql\`rollback\`\n        )\n        throw e instanceof PostgresError && e.code === '25P02' && uncaughtError || e\n      }`
      );

      fs.writeFileSync(path.join(tmpPgSrc, 'connection.js'), unpatchedConn, 'utf8');
      fs.writeFileSync(path.join(tmpPgSrc, 'index.js'), unpatchedIndex, 'utf8');

      const firstRun = patchPostgresFiles(tmpRoot);
      assert.deepStrictEqual(firstRun, {
        nextWrite: 'patched',
        closed: 'patched',
        rollback: 'patched'
      });

      const patchedConn = fs.readFileSync(path.join(tmpPgSrc, 'connection.js'), 'utf8');
      assert.ok(patchedConn.includes('if (!socket || socket.destroyed)'));
      assert.ok(patchedConn.includes('if (socket) {'));

      const secondRun = patchPostgresFiles(tmpRoot);
      assert.deepStrictEqual(secondRun, {
        nextWrite: 'already_patched',
        closed: 'already_patched',
        rollback: 'already_patched'
      });

      // Fail-loud check when file does not contain expected pattern
      fs.writeFileSync(path.join(tmpPgSrc, 'connection.js'), '// tampered postgres source', 'utf8');
      assert.throws(() => patchPostgresFiles(tmpRoot), /FAIL-LOUD/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('isTransientPgConnectionError and withDbRetry recover on null-socket write & tunnel drops', async () => {
    const nullWriteErr = new TypeError("Cannot read properties of null (reading 'write')");
    const closedErr = Object.assign(new Error('write CONNECTION_CLOSED'), { code: 'CONNECTION_CLOSED' });
    const adminShutdownErr = Object.assign(new Error('terminating connection'), { code: '57P01' });
    const syntaxErr = Object.assign(new Error('relation does not exist'), { code: '42P01' });

    assert.strictEqual(isTransientPgConnectionError(nullWriteErr), true);
    assert.strictEqual(isTransientPgConnectionError(closedErr), true);
    assert.strictEqual(isTransientPgConnectionError(adminShutdownErr), true);
    assert.strictEqual(isTransientPgConnectionError(syntaxErr), false);

    let attempts = 0;
    const recovered = await withDbRetry(async () => {
      attempts++;
      if (attempts === 1) throw nullWriteErr;
      if (attempts === 2) throw closedErr;
      return 'ok';
    }, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 20, sleepFn: async () => {} });

    assert.strictEqual(recovered, 'ok');
    assert.strictEqual(attempts, 3);

    await assert.rejects(
      withDbRetry(async () => {
        throw syntaxErr;
      }, { maxRetries: 3, baseDelayMs: 10, sleepFn: async () => {} }),
      /relation does not exist/
    );
  });
});

describe('Round 17: Phase 2 Anti-Hydration Repin Shield & Non-Ratchet', () => {
  beforeEach(() => {
    resetPulseCaches();
  });

  it('isRepinHydrationJump suppresses skeleton-to-lifetime jumps while preserving real repin surges', () => {
    // False spike: 48 -> 2248 repins while saves went 2851 -> 2892 (+41)
    assert.strictEqual(
      isRepinHydrationJump(
        { save_count: 2851, repin_count: 48 },
        { save_count: 2892, repin_count: 2248 }
      ),
      true
    );

    // Unhydrated zero repin baseline: 0 -> 500
    assert.strictEqual(
      isRepinHydrationJump(
        { save_count: 1000, repin_count: 0 },
        { save_count: 1010, repin_count: 500 }
      ),
      true
    );

    // Real viral repin growth: 7979 -> 8743 (+764) with saves 7998 -> 8759 (+761)
    assert.strictEqual(
      isRepinHydrationJump(
        { save_count: 7998, repin_count: 7979 },
        { save_count: 8759, repin_count: 8743 }
      ),
      false
    );

    // Authentic small step: 2205 -> 2248 (+43) with saves 2851 -> 2892 (+41)
    assert.strictEqual(
      isRepinHydrationJump(
        { save_count: 2851, repin_count: 2205 },
        { save_count: 2892, repin_count: 2248 }
      ),
      false
    );
  });

  it('calculateRollingGainsFromSnapshots zeroes poisoned skeleton repin spikes and preserves real surges', () => {
    const poisoned = calculateRollingGainsFromSnapshots([
      { snapshot_date: '2026-11-14', save_count: 2892, repin_count: 2248 },
      { snapshot_date: '2026-11-13', save_count: 2851, repin_count: 48 }
    ], new Date('2026-11-14T12:00:00Z'));

    assert.strictEqual(poisoned.daily_save_velocity, 41);
    assert.strictEqual(poisoned.delta_repins_24h, 0);

    const authentic = calculateRollingGainsFromSnapshots([
      { snapshot_date: '2026-11-14', save_count: 8759, repin_count: 8743 },
      { snapshot_date: '2026-11-13', save_count: 7998, repin_count: 7979 }
    ], new Date('2026-11-14T12:00:00Z'));

    assert.strictEqual(authentic.daily_save_velocity, 761);
    assert.strictEqual(authentic.delta_repins_24h, 764);
  });

  it('Pulse service suppresses skeleton +2200 repin spikes and blocks creator_feed from ratcheting SERP deltas', async () => {
    const mockSql = async (strings) => {
      const q = Array.isArray(strings) ? strings.join('?') : String(strings);
      if (q.includes('kw_folders') && q.includes('keyword_serp_current')) {
        return [
          {
            keyword_id: 1,
            keyword_text: 'high protein meals dinner',
            keyword_category: 'Food',
            folders: [],
            pin_id: '1073475261427369161',
            rank_position: 32,
            prev_rank_position: 32,
            title: 'Weeknight Sheet Pan Cashew Chicken',
            domain: 'reciperella.com',
            destination_url: 'https://reciperella.com/cashew',
            image_url: 'https://i.pinimg.com/236x/cashew.jpg',
            creator_username: 'reciperella1',
            board_name: 'Easy Chicken Recipe',
            save_count: 2892,
            repin_count: 2248,
            daily_save_velocity: 41,
            delta_saves_24h: 41,
            delta_repins_24h: 2200, // Poisoned skeleton spike (2248 - 2200 = 48 <= 112.4)
            gains_5d: 100,
            gains_7d: 150,
            gains_10d: 200,
            gains_15d: 300,
            url_global_saves: 3041,
            dominant_color: '#884422',
            visual_annotations: ['Sheet Pan Dinners'],
            created_at_pinterest: new Date(Date.now() - 400 * 86400000).toISOString(),
            crawled_at: new Date().toISOString()
          },
          {
            keyword_id: 2,
            keyword_text: 'healthy dinner',
            keyword_category: 'Food',
            folders: [],
            pin_id: 'pin_primary_clean',
            rank_position: 5,
            prev_rank_position: 7,
            title: 'Clean Primary SERP Pin',
            domain: 'cleanblog.com',
            destination_url: 'https://cleanblog.com/post',
            image_url: 'https://i.pinimg.com/236x/clean.jpg',
            creator_username: 'cleanchef',
            board_name: 'Healthy Eats',
            save_count: 3500,
            repin_count: 1400,
            daily_save_velocity: 120,
            delta_saves_24h: 120,
            delta_repins_24h: 43, // Real repin delta from primary SERP
            gains_5d: 300,
            gains_7d: 500,
            gains_10d: 700,
            gains_15d: 900,
            url_global_saves: 3600,
            dominant_color: '#10b981',
            visual_annotations: ['Healthy Dinners'],
            created_at_pinterest: new Date(Date.now() - 20 * 86400000).toISOString(),
            crawled_at: new Date().toISOString()
          }
        ];
      }
      if (q.includes('FROM competitor_pins') && !q.includes('active_creators') && !q.includes('top_creators')) {
        return [
          {
            pin_id: 'pin_primary_clean',
            title: 'Clean Primary SERP Pin',
            description: 'Desc',
            alt_text: 'Alt',
            image_url: 'https://i.pinimg.com/236x/clean.jpg',
            destination_url: 'https://cleanblog.com/post',
            domain: 'cleanblog.com',
            board_name: 'Healthy Eats',
            creator_username: 'cleanchef',
            save_count: 3500,
            repin_count: 1400,
            daily_save_velocity: 120,
            delta_saves_24h: 120,
            delta_repins_24h: 650, // Stale secondary creator metadata must NOT ratchet over primary SERP 43
            created_at_pinterest: new Date(Date.now() - 20 * 86400000).toISOString(),
            visual_annotations: ['Healthy Dinners']
          }
        ];
      }
      if (q.includes('displaced_24h_count') || q.includes('FROM keyword_displaced_index')) return [];
      if (q.includes('keyword_guided_capsules')) return [];
      if (q.includes('active_creators')) return [];
      if (q.includes('FROM pa_pins')) return [];
      if (q.includes('mv_pulse_24h_summary')) return [];
      return [];
    };

    const res = await getGlobal24hPulseService(mockSql, {}, { bypassCache: true });
    const pinPoisoned = res.breakout_pins.find(p => p.pin_id === '1073475261427369161');
    const pinClean = res.breakout_pins.find(p => p.pin_id === 'pin_primary_clean');

    assert.ok(pinPoisoned, 'Poisoned pin should remain visible due to save velocity 41');
    assert.strictEqual(pinPoisoned.delta_repins_24h, 0, 'Skeleton +2200 repin spike must be suppressed to 0');
    assert.ok(pinClean, 'Primary SERP pin must exist');
    assert.strictEqual(pinClean.delta_repins_24h, 43, 'creator_feed must not ratchet delta_repins_24h over active_serp');
  });
});

describe('Round 17: Phase 3 Pin Dossier Trajectory & Velocity Parity', () => {
  it('fetchUniversalPinDossier merges today live SERP crawl after latest DB snapshot and reflects +761/d', async () => {
    const pinId = '388717011610355413';
    const mockSql = async (strings) => {
      const q = Array.isArray(strings) ? strings.join('?') : String(strings);

      if (q.includes('FROM universal_master_pins')) {
        return [{
          pin_id: pinId,
          creator_username: 'stellashousejourney',
          board_name: 'Things I want for our future home',
          title: 'Kitchen Organisation: A Clever Way to Store Food Containers and Lids',
          domain: 'uploaded by user',
          destination_url: '',
          image_url: 'https://i.pinimg.com/736x/test.jpg',
          description: 'Kitchen organiser',
          alt_text: 'glass dishes stacked',
          dominant_color: '#888888',
          visual_annotations: [],
          created_at_pinterest: '2026-10-16T00:00:00.000Z',
          first_discovered_pillar: 'keyword',
          first_saved_at: '2026-11-13T13:18:00.000Z',
          last_resaved_at: '2026-11-14T08:00:00.000Z',
          updated_at: '2026-11-14T08:00:00.000Z',
          save_count: 8759,
          repin_count: 8743,
          comment_count: 0,
          share_count: 0,
          reaction_count: 0,
          daily_save_velocity: 761,
          delta_saves_24h: 761,
          delta_repins_24h: 764,
          gains_5d: 761,
          gains_7d: 761,
          gains_10d: 761,
          gains_15d: 761,
          is_product: false,
          is_video: false,
          creation_method: 'scraped',
          metadata: {}
        }];
      }

      if (q.includes('FROM pins_daily_metrics')) {
        return [{
          pin_id: pinId,
          snapshot_date: '2026-11-13',
          save_count: 7998,
          repin_count: 7979,
          comment_count: 0,
          share_count: 0,
          reaction_count: 0,
          daily_save_velocity: 0,
          updated_at: '2026-11-13T13:18:00.000Z'
        }];
      }

      if (q.includes('FROM pins_daily_snapshots')) {
        return [];
      }

      if (q.includes('FROM keyword_serp_current ksc') && q.includes('ORDER BY ksc.is_displaced ASC')) {
        return [{
          keyword_id: 99,
          keyword_name: 'kitchen organization',
          rank_position: 9,
          prev_rank_position: 3,
          is_displaced: false,
          last_known_rank: 9,
          crawled_at: '2026-11-14T08:00:00.000Z',
          updated_at: '2026-11-14T08:00:00.000Z'
        }];
      }

      if (q.includes('FROM keyword_serp_current sc') && q.includes('UNION ALL')) {
        return [{
          keyword_id: 99,
          pin_id: pinId,
          title: 'Kitchen Organisation: A Clever Way to Store Food Containers and Lids',
          domain: 'uploaded by user',
          destination_url: '',
          image_url: 'https://i.pinimg.com/736x/test.jpg',
          creator_username: 'stellashousejourney',
          board_name: 'Things I want for our future home',
          save_count: 8759,
          repin_count: 8743,
          comment_count: 0,
          share_count: 0,
          reaction_count: 0,
          daily_save_velocity: 761,
          dominant_color: '#888888',
          visual_annotations: [],
          rank_position: 9,
          prev_rank_position: 3,
          last_known_rank: 9,
          is_displaced: false,
          metadata: {},
          crawled_at: '2026-11-14T08:00:00.000Z',
          updated_at: '2026-11-14T08:00:00.000Z',
          baseline_day_saves: 7998,
          baseline_day_date: '2026-11-13',
          keyword_name: 'kitchen organization',
          creation_method: 'scraped',
          created_at_pinterest: '2026-10-16T00:00:00.000Z'
        }];
      }

      return [];
    };

    const dossier = await fetchUniversalPinDossier({ sql: mockSql, pinId });
    assert.strictEqual(dossier.success, true);
    assert.strictEqual(dossier.creative.save_count, 8759);
    assert.strictEqual(dossier.creative.daily_save_velocity, 761);
    assert.strictEqual(dossier.daily_trajectory.length, 2, 'Dossier should render 2-day progression (2026-11-14 and 2026-11-13)');
    assert.strictEqual(dossier.daily_trajectory[0].snapshot_date, '2026-11-14');
    assert.strictEqual(dossier.daily_trajectory[0].save_count, 8759);
    assert.strictEqual(dossier.daily_trajectory[1].snapshot_date, '2026-11-13');
    assert.strictEqual(dossier.daily_trajectory[1].save_count, 7998);
  });

  it('sanitizeDossierTrajectory preserves valid creative velocity when only one snapshot exists', () => {
    const dossier = {
      creative: {
        save_count: 8759,
        daily_save_velocity: 761
      },
      daily_trajectory: [
        {
          snapshot_date: '2026-11-13',
          save_count: 7998,
          repin_count: 7979,
          daily_save_velocity: 0
        }
      ]
    };

    sanitizeDossierTrajectory(dossier);
    assert.strictEqual(dossier.creative.daily_save_velocity, 761);
  });
});
