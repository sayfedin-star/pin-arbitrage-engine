import assert from 'node:assert';
import {
  DEFAULT_CREATOR_HUB_SETTINGS,
  getCreatorHubSettings,
  updateCreatorHubSettings
} from '../src/modules/creators/settings.mjs';
import {
  STANDARD_QUALIFICATION_DEFAULTS,
  qualifyPin
} from '../src/modules/creators/service.mjs';
import { handleCreatorsRoutes } from '../src/routes/creators.mjs';

async function runTests() {
  console.log('[*] Suite 1: Testing DEFAULT_CREATOR_HUB_SETTINGS...');
  assert.strictEqual(DEFAULT_CREATOR_HUB_SETTINGS.auto_promote_enabled, true);
  assert.strictEqual(DEFAULT_CREATOR_HUB_SETTINGS.auto_promote_delta_24h, 25000);
  assert.strictEqual(DEFAULT_CREATOR_HUB_SETTINGS.auto_promote_delta_7d, 100000);
  assert.strictEqual(DEFAULT_CREATOR_HUB_SETTINGS.auto_harvest_pins, true);
  assert.strictEqual(DEFAULT_CREATOR_HUB_SETTINGS.max_pins_harvest, 100);
  assert.strictEqual(DEFAULT_CREATOR_HUB_SETTINGS.qualification_rules.min_saves, 500);
  assert.strictEqual(DEFAULT_CREATOR_HUB_SETTINGS.qualification_rules.min_velocity, 10.0);
  console.log('  ✓ [PASS] DEFAULT_CREATOR_HUB_SETTINGS matches specifications');

  console.log('\n[*] Suite 2: Testing getCreatorHubSettings with null sql fallback...');
  const fallback = await getCreatorHubSettings(null);
  assert.deepStrictEqual(fallback, DEFAULT_CREATOR_HUB_SETTINGS);
  console.log('  ✓ [PASS] Null SQL safely returns default settings');

  console.log('\n[*] Suite 3: Testing mock SQL round-trip & merging...');
  let stored = null;
  const mockSql = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes('SELECT key, value')) {
      return stored ? [{ key: 'creator_hub_settings', value: stored, updated_at: new Date().toISOString() }] : [];
    }
    if (query.includes('INSERT INTO app_settings')) {
      stored = values[0]; // JSON string
      return [{ key: 'creator_hub_settings' }];
    }
    return [];
  };

  const initial = await getCreatorHubSettings(mockSql);
  assert.strictEqual(initial.auto_promote_delta_24h, 25000);
  console.log('  ✓ [PASS] Unseeded table returns default values');

  const updated = await updateCreatorHubSettings(mockSql, {
    auto_promote_delta_24h: 15000,
    qualification_rules: { min_saves: 750 }
  });
  assert.strictEqual(updated.auto_promote_delta_24h, 15000);
  assert.strictEqual(updated.qualification_rules.min_saves, 750);
  assert.strictEqual(updated.auto_promote_delta_7d, 100000); // Preserved
  console.log('  ✓ [PASS] Partial update correctly merges and preserves existing values');

  const loaded = await getCreatorHubSettings(mockSql);
  assert.strictEqual(loaded.auto_promote_delta_24h, 15000);
  assert.strictEqual(loaded.qualification_rules.min_saves, 750);
  console.log('  ✓ [PASS] Subsequent get reads persisted values');

  console.log('\n[*] Suite 4: Testing Anti-NaN and Cast Hygiene (cleanNum)...');
  const dirtyUpdate = await updateCreatorHubSettings(mockSql, {
    auto_promote_delta_24h: 'not-a-number',
    auto_promote_delta_7d: null,
    qualification_rules: {
      min_saves: -100,
      min_velocity: NaN
    }
  });
  assert.strictEqual(typeof dirtyUpdate.auto_promote_delta_24h, 'number');
  assert.ok(Number.isFinite(dirtyUpdate.auto_promote_delta_24h), 'auto_promote_delta_24h must be finite');
  assert.strictEqual(dirtyUpdate.qualification_rules.min_saves, 0, 'min_saves clamped to 0 on negative');
  assert.strictEqual(dirtyUpdate.qualification_rules.min_velocity, 10.0, 'min_velocity fell back on NaN');
  console.log('  ✓ [PASS] Anti-NaN shields prevent database corruption');

  console.log('\n[*] Suite 5: Testing Qualification Rules Anti-Bypass Gate (qualifyPin)...');
  const autoRules = {
    tier1_min_saves: 500,
    tier2_min_repins: 500,
    tier2_min_velocity: 10.0,
    tier3_min_saves: 250,
    auto_promote_inherited: true
  };

  // Pin with 100 saves & 100 repins (passes standard rules, MUST FAIL auto-promote rules)
  const pin100 = { saves: 100, repins: 100, velocity: 1.0, age_days: 100 };
  assert.strictEqual(qualifyPin(pin100, STANDARD_QUALIFICATION_DEFAULTS).qualified, true, 'pin100 qualifies under standard');
  assert.strictEqual(qualifyPin(pin100, autoRules).qualified, false, 'pin100 rejected under auto-promote rules');

  // Pin with 60 saves & 2.5 velocity (passes standard rules fallback, MUST FAIL auto-promote rules)
  const pinFallback = { saves: 60, repins: 60, velocity: 2.5, age_days: 24 };
  assert.strictEqual(qualifyPin(pinFallback, STANDARD_QUALIFICATION_DEFAULTS).qualified, true, 'pinFallback qualifies under standard');
  assert.strictEqual(qualifyPin(pinFallback, autoRules).qualified, false, 'pinFallback rejected under auto-promote rules');

  // Pin with 550 saves (passes auto-promote rules Tier 1)
  const pinWinner = { saves: 550, repins: 550, velocity: 5.0, age_days: 110 };
  assert.strictEqual(qualifyPin(pinWinner, autoRules).qualified, true, 'pinWinner qualifies under auto-promote tier 1');
  assert.strictEqual(qualifyPin(pinWinner, autoRules).matchedTier, 'tier1');

  // Pin with high velocity breakout (saves: 300, velocity: 15.0, age: 20d)
  const pinBreakout = { saves: 300, repins: 300, velocity: 15.0, age_days: 20 };
  assert.strictEqual(qualifyPin(pinBreakout, autoRules).qualified, true, 'pinBreakout qualifies under auto-promote tier 2');
  assert.strictEqual(qualifyPin(pinBreakout, autoRules).matchedTier, 'tier2');
  console.log('  ✓ [PASS] Auto-promote qualification rules strictly enforced with zero 3-tier OR bypass');

  console.log('\n[*] Suite 6: Testing HTTP Route Method Guard (GET & POST allowed, others 405)...');
  const routeCtxBase = {
    pathname: '/api/competitors/settings',
    sql: mockSql,
    targetSql: mockSql,
    jsonResponse: (data, status) => ({ status, body: data }),
    invalidateEdgeCache: () => {}
  };

  const getRes = await handleCreatorsRoutes({ ...routeCtxBase, method: 'GET' });
  assert.strictEqual(getRes.status, 200);

  const deleteRes = await handleCreatorsRoutes({ ...routeCtxBase, method: 'DELETE' });
  assert.strictEqual(deleteRes.status, 405, 'DELETE must return 405 Method Not Allowed');

  const putRes = await handleCreatorsRoutes({ ...routeCtxBase, method: 'PUT' });
  assert.strictEqual(putRes.status, 405, 'PUT must return 405 Method Not Allowed');
  console.log('  ✓ [PASS] Route guard returns 405 Method Not Allowed on non-GET/POST');

  console.log('\n🎉 ALL AUTO-PROMOTE SETTINGS & QUALIFICATION UNIT TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});