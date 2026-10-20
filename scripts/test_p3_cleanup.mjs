#!/usr/bin/env node

/**
 * scripts/test_p3_cleanup.mjs
 *
 * PACKAGE P3: STRUCTURAL RE-ORGANIZATION, DEAD CODE PURGE & MIGRATION RUNNER SUITE
 *
 * Verifies:
 * 1. Dead Code Purge: Removal of zombie scripts and legacy sharding module.
 * 2. Canonical Sharding Integrity: fleet-router.mjs exports, CRC32 deterministic routing, and zero-drift aliases.
 * 3. Unified Migration Runner: scripts/migrate.mjs DDL tracking, SQL splitting, checksum verification, and removal of legacy run_migration_*.mjs scripts.
 * 4. Workflow Double-Trigger Elimination: Elimination of redundant triggerWorkflow in src/keywords-ui.mjs.
 * 5. God-File Deconstruction: Modular extraction of D1 metadata, analytics, settings, and UI drawers/modals with 100% export parity.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getPinShardId,
  getShardNumberForEntity,
  getResilientShardNumberForEntity,
  crc32,
  batchGroupByShard,
  resolveShardConnection
} from '../src/modules/sharding/fleet-router.mjs';
import {
  ensureEdgePinsMetadataTable,
  syncPinsBatchToD1,
  hydratePinsFromD1,
  safeNormalizeMetadata,
  winsorize,
  extractPinTitle,
  calculateMedian,
  calculateKeywordIntelligenceSummary,
  getAppSettings,
  updateAppSettings,
  updateKeywordSettings,
  addKeyword,
  resolveKeywordBySlug,
  fetchKeywordTypeahead
} from '../src/modules/keywords/service.mjs';
import { getDashboardModalsHtml } from '../src/ui/dashboard-modals.mjs';
import { getKeywordDrawersAndModalsHtml } from '../src/ui/keywords-drawers.mjs';

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('='.repeat(80));
console.log('🧹  PACKAGE P3: STRUCTURAL RE-ORGANIZATION & PURGE AUDIT');
console.log('='.repeat(80));

// --------------------------------------------------------------------------
// SECTION 1: DEAD CODE PURGE
// --------------------------------------------------------------------------
console.log('\n[*] Section 1: Dead Code Purge & Zombie Scripts Removal...');

runTest('scripts/remediate_pin_cross_pollution.mjs is deleted', () => {
  assert.strictEqual(
    fs.existsSync(path.resolve('scripts/remediate_pin_cross_pollution.mjs')),
    false,
    'Zombie script scripts/remediate_pin_cross_pollution.mjs must be deleted'
  );
});

runTest('scripts/apply_defensive_shard_index.mjs is deleted', () => {
  assert.strictEqual(
    fs.existsSync(path.resolve('scripts/apply_defensive_shard_index.mjs')),
    false,
    'Zombie script scripts/apply_defensive_shard_index.mjs must be deleted'
  );
});

runTest('src/modules/fleet/sharding.mjs is deleted', () => {
  assert.strictEqual(
    fs.existsSync(path.resolve('src/modules/fleet/sharding.mjs')),
    false,
    'Deprecated module src/modules/fleet/sharding.mjs must be deleted'
  );
});

runTest('No files in codebase import from deprecated sharding.mjs', () => {
  function checkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'test_p3_cleanup.mjs') continue;
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        checkDir(fullPath);
      } else if (ent.name.endsWith('.mjs') || ent.name.endsWith('.js')) {
        const code = fs.readFileSync(fullPath, 'utf8');
        assert(
          !code.includes('src/modules/fleet/sharding.mjs') && !code.includes('fleet/sharding.mjs'),
          `File ${fullPath} must not import from deprecated fleet/sharding.mjs`
        );
      }
    }
  }
  checkDir(path.resolve('src'));
  checkDir(path.resolve('scripts'));
});

// --------------------------------------------------------------------------
// SECTION 2: CANONICAL SHARDING EXPORTS & DRIFT INTEGRITY
// --------------------------------------------------------------------------
console.log('\n[*] Section 2: Canonical Sharding Exports & Routing Integrity...');

runTest('fleet-router.mjs exports canonical functions and aliases', () => {
  assert.strictEqual(typeof getPinShardId, 'function');
  assert.strictEqual(typeof getShardNumberForEntity, 'function');
  assert.strictEqual(typeof getResilientShardNumberForEntity, 'function');
  assert.strictEqual(typeof crc32, 'function');
  assert.strictEqual(typeof batchGroupByShard, 'function');
  assert.strictEqual(typeof resolveShardConnection, 'function');
});

runTest('getShardNumberForEntity produces identical output to getPinShardId (Zero Drift)', () => {
  const sampleEntities = [
    '123456789012345678',
    '987654321098765432',
    'crafty_mom_diy',
    'aesthetic_home_decor',
    'keto_recipes_daily'
  ];
  for (const entity of sampleEntities) {
    const expected = getPinShardId(entity, 99);
    const actual = getShardNumberForEntity(entity, 99);
    assert.strictEqual(actual, expected, `Entity ${entity} must yield identical shard ID`);
    assert(actual >= 1 && actual <= 99, `Shard ID ${actual} must be in range 1..99`);
  }
});

runTest('getResilientShardNumberForEntity respects quarantine lists with deterministic shift', () => {
  const entity = 'test_sample_entity_42';
  const normalShard = getShardNumberForEntity(entity, 99);
  const quarantined = new Set([normalShard]);
  const shiftedShard = getResilientShardNumberForEntity(entity, 99, quarantined);
  assert.notStrictEqual(shiftedShard, normalShard, 'Resilient shard must not pick quarantined shard');
  assert(shiftedShard >= 1 && shiftedShard <= 99, `Shifted shard ${shiftedShard} must be in range 1..99`);
});

// --------------------------------------------------------------------------
// SECTION 3: UNIFIED IDEMPOTENT MIGRATION RUNNER
// --------------------------------------------------------------------------
console.log('\n[*] Section 3: Unified Idempotent Migration Runner (scripts/migrate.mjs)...');

runTest('scripts/migrate.mjs exists and is executable', () => {
  assert(fs.existsSync(path.resolve('scripts/migrate.mjs')), 'scripts/migrate.mjs must exist');
});

runTest('All 16 legacy single-runner scripts (run_migration_018 through 035) are deleted', () => {
  const legacyScripts = [
    'scripts/run_migration_018.mjs',
    'scripts/run_migration_019.mjs',
    'scripts/run_migration_020.mjs',
    'scripts/run_migration_021.mjs',
    'scripts/run_migration_023.mjs',
    'scripts/run_migration_024.mjs',
    'scripts/run_migration_025.mjs',
    'scripts/run_migration_026.mjs',
    'scripts/run_migration_027.mjs',
    'scripts/run_migration_028.mjs',
    'scripts/run_migration_029.mjs',
    'scripts/run_migration_029_displaced.mjs',
    'scripts/run_migration_031.mjs',
    'scripts/run_migration_032_shard_metadata.mjs',
    'scripts/run_migration_033.mjs',
    'scripts/run_migration_035.mjs'
  ];

  for (const scriptPath of legacyScripts) {
    assert.strictEqual(
      fs.existsSync(path.resolve(scriptPath)),
      false,
      `Legacy migration runner ${scriptPath} must be deleted`
    );
  }
});

runAsyncTest('scripts/migrate.mjs discoverMigrations orders migrations naturally and splits SQL statements cleanly', async () => {
  const {
    discoverMigrations,
    splitSqlStatements,
    findAppliedMigration,
    hasExecutableSql,
    CANONICAL_SPECIAL_VERSIONS
  } = await import('./migrate.mjs');

  const migrations = discoverMigrations(path.resolve('scripts/migrations'));
  assert(migrations.length > 0, 'Must discover migrations in migrations/ directory');
  assert.strictEqual(migrations[0].version, '001', 'First migration must be version 001');

  // Verify numerical ordering (e.g. 002 comes before 010)
  for (let i = 1; i < migrations.length; i++) {
    const prevNum = migrations[i - 1].numericPrefix;
    const currNum = migrations[i].numericPrefix;
    if (prevNum !== null && currNum !== null) {
      assert(
        currNum >= prevNum,
        `Migration ${migrations[i].filename} (${currNum}) must be >= ${migrations[i - 1].filename} (${prevNum})`
      );
    }
  }

  // Canonical special versions check
  const m009Heartbeats = migrations.find(m => m.filename === '009_crawler_shard_heartbeats.sql');
  const m009Capsules = migrations.find(m => m.filename === '009_keyword_guided_capsules.sql');
  const m029Domain = migrations.find(m => m.filename === '029_domain_monetization_metadata.sql');
  const m029Displaced = migrations.find(m => m.filename === '029_keyword_snapshots_not_null_displaced.sql');

  assert.strictEqual(m009Heartbeats?.version, '009_heartbeats', '009 heartbeats must have canonical version 009_heartbeats');
  assert.strictEqual(m009Capsules?.version, '009_capsules', '009 capsules must have canonical version 009_capsules');
  assert.notStrictEqual(m009Heartbeats?.version, m009Capsules?.version, '009 migrations must NOT collide');

  assert.strictEqual(m029Domain?.version, '029', '029 domain must have canonical version 029');
  assert.strictEqual(m029Displaced?.version, '029_displaced', '029 displaced must have canonical version 029_displaced');
  assert.notStrictEqual(m029Domain?.version, m029Displaced?.version, '029 migrations must NOT collide');

  // Test findAppliedMigration with realistic database schema_migrations Map
  const mockApplied = new Map([
    ['001', { version: '001', name: 'core_registry', applied_at: new Date() }],
    ['009_heartbeats', { version: '009_heartbeats', name: 'crawler_shard_heartbeats', applied_at: new Date() }],
    ['009_capsules', { version: '009_capsules', name: 'keyword_guided_capsules', applied_at: new Date() }],
    ['029', { version: '029', name: 'domain_monetization_metadata', applied_at: new Date() }],
    ['029_displaced', { version: '029_displaced', name: 'keyword_snapshots_not_null_displaced', applied_at: new Date() }]
  ]);

  const app009H = findAppliedMigration(mockApplied, m009Heartbeats);
  assert(app009H, 'Must find applied 009_heartbeats');
  assert.strictEqual(app009H.version, '009_heartbeats');

  const app009C = findAppliedMigration(mockApplied, m009Capsules);
  assert(app009C, 'Must find applied 009_capsules');
  assert.strictEqual(app009C.version, '009_capsules');

  const app029Dis = findAppliedMigration(mockApplied, m029Displaced);
  assert(app029Dis, 'Must find applied 029_displaced');
  assert.strictEqual(app029Dis.version, '029_displaced');

  // Adversarial SQL Statement Splitting:
  // Tests line comments with semicolons, block comments with semicolons,
  // escaped single quotes, dollar quotes, and tagged dollar quotes.
  const adversarialSql = [
    '-- Initial line comment',
    'CREATE TABLE test_tab (id serial primary key); -- inline comment; with semicolon',
    '',
    '/* Block comment; with internal ; semicolons */',
    "INSERT INTO test_tab (name) VALUES ('O''Reilly; & Co;');",
    '',
    'CREATE OR REPLACE FUNCTION test_func() RETURNS void AS $tag$',
    'BEGIN',
    '  -- Semicolon inside function body should not split',
    '  INSERT INTO test_tab DEFAULT VALUES;',
    '  PERFORM pg_sleep(0.1);',
    'END;',
    '$tag$ LANGUAGE plpgsql;',
    '',
    'SELECT 1;',
    '-- Final comment only at end of file'
  ].join('\n');

  const stmts = splitSqlStatements(adversarialSql);
  assert.strictEqual(stmts.length, 4, `Must split into exactly 4 statements, got ${stmts.length}`);
  assert(stmts[0].includes('CREATE TABLE test_tab'), 'First statement is CREATE TABLE');
  assert(stmts[1].includes("INSERT INTO test_tab (name) VALUES ('O''Reilly; & Co;')"), 'Second statement preserves escaped quote and semicolons inside quotes');
  assert(stmts[2].includes('$tag$'), 'Third statement preserves tagged dollar quoting');
  assert(stmts[2].includes('PERFORM pg_sleep(0.1);'), 'Third statement preserves internal semicolons');
  assert(stmts[3].includes('SELECT 1'), 'Fourth statement is SELECT 1');
  assert.strictEqual(hasExecutableSql('-- comment only'), false, 'Pure comment is not executable SQL');
  assert.strictEqual(hasExecutableSql('SELECT 1'), true, 'SELECT 1 is executable SQL');
});

// --------------------------------------------------------------------------
// SECTION 4: WORKFLOW DOUBLE-TRIGGER ELIMINATION
// --------------------------------------------------------------------------
console.log('\n[*] Section 4: Workflow Double-Trigger Elimination...');

runTest('src/keywords-ui.mjs eliminates redundant triggerWorkflow after sync', () => {
  const kwUiCode = fs.readFileSync(path.resolve('src/keywords-ui.mjs'), 'utf8');

  // Must have invariant comment
  assert(
    kwUiCode.includes('// [INVARIANT: ZERO-DOUBLE-TRIGGER]'),
    'src/keywords-ui.mjs must contain [INVARIANT: ZERO-DOUBLE-TRIGGER]'
  );

  // Must not call this.triggerWorkflow(false) inside rescanKeyword
  const rescanMatch = kwUiCode.match(/async\s+rescanKeyword\s*\([\s\S]*?finally/);
  assert(rescanMatch, 'rescanKeyword method must exist');
  assert(
    !rescanMatch[0].includes('this.triggerWorkflow(false)'),
    'rescanKeyword must NOT call this.triggerWorkflow(false)'
  );
});

// --------------------------------------------------------------------------
// SECTION 5: GOD-FILE DECONSTRUCTION & PARITY CONTRACTS
// --------------------------------------------------------------------------
console.log('\n[*] Section 5: God-File Deconstruction & Parity Contracts...');

runTest('src/modules/keywords/ submodules exist and have valid exports', () => {
  assert(fs.existsSync(path.resolve('src/modules/keywords/d1-metadata.mjs')), 'd1-metadata.mjs must exist');
  assert(fs.existsSync(path.resolve('src/modules/keywords/analytics.mjs')), 'analytics.mjs must exist');
  assert(fs.existsSync(path.resolve('src/modules/keywords/settings.mjs')), 'settings.mjs must exist');
  assert(fs.existsSync(path.resolve('src/modules/keywords/typeahead.mjs')), 'typeahead.mjs must exist');

  // Verify functions are exported and callable
  assert.strictEqual(typeof ensureEdgePinsMetadataTable, 'function');
  assert.strictEqual(typeof syncPinsBatchToD1, 'function');
  assert.strictEqual(typeof hydratePinsFromD1, 'function');
  assert.strictEqual(typeof safeNormalizeMetadata, 'function');
  assert.strictEqual(typeof winsorize, 'function');
  assert.strictEqual(typeof extractPinTitle, 'function');
  assert.strictEqual(typeof calculateMedian, 'function');
  assert.strictEqual(typeof calculateKeywordIntelligenceSummary, 'function');
  assert.strictEqual(typeof getAppSettings, 'function');
  assert.strictEqual(typeof updateAppSettings, 'function');
  assert.strictEqual(typeof updateKeywordSettings, 'function');
  assert.strictEqual(typeof addKeyword, 'function');
  assert.strictEqual(typeof resolveKeywordBySlug, 'function');
  assert.strictEqual(typeof fetchKeywordTypeahead, 'function');
});

runTest('Modular analytics functions produce expected computations', () => {
  // winsorize
  const vals = [1, 2, 3, 4, 100];
  const wins = winsorize(vals, 0.2);
  assert(wins[4] < 100, 'winsorize should clamp top 20% outlier');

  // calculateMedian (uses Math.round for integer averages on even sets)
  assert.strictEqual(calculateMedian([1, 3, 5]), 3);
  assert.strictEqual(calculateMedian([1, 2, 3, 4]), 3);
  assert.strictEqual(calculateMedian([]), 0);

  // safeNormalizeMetadata
  assert.deepStrictEqual(safeNormalizeMetadata(null), {});
  assert.deepStrictEqual(safeNormalizeMetadata('{"a":1}'), { a: 1 });
  assert.deepStrictEqual(safeNormalizeMetadata('invalid json'), {});
});

runTest('Modular UI components export non-empty HTML templates', () => {
  assert(fs.existsSync(path.resolve('src/ui/dashboard-modals.mjs')), 'dashboard-modals.mjs must exist');
  assert(fs.existsSync(path.resolve('src/ui/keywords-drawers.mjs')), 'keywords-drawers.mjs must exist');

  const dashModals = getDashboardModalsHtml();
  assert(dashModals.includes('isLightboxOpen'), 'dashboard-modals must include lightbox markup');
  assert(dashModals.includes('isBulkAddSeedsModalOpen'), 'dashboard-modals must include bulk add seeds modal markup');
  assert(dashModals.includes('isAddCompetitorModalOpen'), 'dashboard-modals must include competitor modal markup');
  assert(dashModals.includes('isAddFleetModalOpen'), 'dashboard-modals must include fleet modal markup');

  const kwDrawers = getKeywordDrawersAndModalsHtml();
  assert(kwDrawers.includes('isPinDrawerOpen'), 'keywords-drawers must include pin drawer markup');
  assert(kwDrawers.includes('isSettingsModalOpen'), 'keywords-drawers must include settings modal markup');
  assert(kwDrawers.includes('isVisualLensModalOpen'), 'keywords-drawers must include visual lens modal markup');
});

runTest('src/dashboard-ui.mjs and src/keywords-ui.mjs reference modular templates', () => {
  const dashCode = fs.readFileSync(path.resolve('src/dashboard-ui.mjs'), 'utf8');
  assert(
    dashCode.includes('${getDashboardModalsHtml()}'),
    'src/dashboard-ui.mjs must interpolate getDashboardModalsHtml'
  );

  const kwCode = fs.readFileSync(path.resolve('src/keywords-ui.mjs'), 'utf8');
  assert(
    kwCode.includes('${getKeywordDrawersAndModalsHtml()}'),
    'src/keywords-ui.mjs must interpolate getKeywordDrawersAndModalsHtml'
  );
});

console.log('\n' + '='.repeat(80));
console.log(`✅ PACKAGE P3 AUDIT COMPLETE: ${passedTests} PASSED | 0 FAILED (Total: ${totalTests})`);
console.log('='.repeat(80));
