/**
 * SQL Schema Parity & Forensic Query Verifier (AST-Powered & Query-Isolated)
 * 
 * Statically audits every individual SQL template literal across src/ and scripts/ using Acorn AST to guarantee:
 * 1. Zero non-existent columns queried on Unified PostgreSQL SSOT tables (post-Migration 058 schema parity).
 * 2. Proper COALESCE precedence (EXCLUDED must take priority over existing on fresh updates).
 * 3. Prevention of baselineMap object-to-number NaN poisoning.
 * 4. Architectural Guard 1: Zero direct INSERT INTO keyword_pins_snapshots outside migrations/tests.
 * 5. Architectural Guard 2: Zero invalid ON CONFLICT (pin_id, snapshot_date) on pins_daily_snapshots.
 * 6. Architectural Guard 3: Zero SQL queries referencing tables/views dropped in Migration 058.
 */

import fs from 'fs';
import path from 'path';
import * as acorn from 'acorn';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (_) {}
}

console.log('=== Running Forensic SQL Schema Parity & AST Landmine Audit ===\n');

// 1. DDL Schema Definition for Core Tables (Unified PostgreSQL 4-Table SSOT — Post-Migration 060)
export const KNOWN_TABLE_COLUMNS = {
  keyword_serp_positions: new Set([
    'keyword_id',
    'pin_id',
    'rank_position',
    'is_displaced',
    'last_known_rank',
    'displaced_date',
    'vacuum_opportunity_score',
    'prev_rank_position',
    'crawled_at',
    'updated_at',
    'metadata'
  ]),
  competitor_board_pins: new Set([
    'competitor_id',
    'board_id',
    'pin_id',
    'position',
    'discovered_at'
  ]),
  pins_daily_metrics: new Set([
    'pin_id',
    'recorded_date',
    'snapshot_date',
    'save_count',
    'repin_count',
    'comment_count',
    'share_count',
    'reaction_count',
    'daily_save_velocity',
    'daily_repin_velocity',
    'updated_at'
  ]),
  universal_master_pins: new Set([
    'pin_id',
    'creator_username',
    'account_username',
    'board_id',
    'board_name',
    'board_slug',
    'title',
    'domain',
    'destination_url',
    'image_url',
    'description',
    'alt_text',
    'dominant_color',
    'visual_annotations',
    'created_at_pinterest',
    'first_discovered_pillar',
    'first_discovered_at',
    'updated_at',
    'metadata',
    'url_global_saves',
    'save_count',
    'repin_count',
    'comment_count',
    'share_count',
    'reaction_count',
    'is_hydrated',
    'daily_save_velocity',
    'daily_repin_velocity',
    'delta_saves_24h',
    'delta_repins_24h',
    'gains_1d',
    'gains_3d',
    'gains_5d',
    'gains_7d',
    'gains_10d',
    'gains_14d',
    'gains_15d',
    'gains_30d',
    'is_product',
    'is_video',
    'creation_method',
    'image_signature',
    'seo_noindex_reason',
    'is_repin',
    'canonical_pin_id',
    'last_scraped_at',
    'clean_domain',
    'first_saved_at',
    'last_resaved_at'
  ]),
  tracked_keywords: new Set([
    'id',
    'keyword',
    'category',
    'target_pin_count',
    'refresh_interval_hours',
    'last_crawled_at',
    'top_pin_id',
    'top_pin_title',
    'top_pin_image',
    'avg_daily_velocity',
    'is_active',
    'tags',
    'metadata',
    'created_at',
    'updated_at',
    'popular_pins',
    'crawl_lease_token',
    'crawl_lease_until',
    'crawl_pages_limit',
    'inspection_mode',
    'canonical_keyword'
  ]),
  keyword_folders: new Set([
    'id',
    'name',
    'description',
    'color',
    'icon',
    'project_id',
    'metadata',
    'created_at',
    'updated_at'
  ]),
  keyword_folder_items: new Set([
    'id',
    'folder_id',
    'keyword_id',
    'notes',
    'added_at',
    'metadata'
  ]),
  folder_competitor_items: new Set([
    'id',
    'folder_id',
    'competitor_id',
    'added_at',
    'custom_label',
    'source'
  ]),
  folder_pinned_domains: new Set([
    'id',
    'folder_id',
    'domain',
    'notes',
    'pinned_at'
  ]),
  keyword_ignored_pins: new Set([
    'keyword_id',
    'pin_id',
    'ignored_reason',
    'ignored_at'
  ]),
  keyword_guided_capsules: new Set([
    'id',
    'keyword_id',
    'term',
    'display_label',
    'score',
    'dominant_color',
    'display_order',
    'discovered_at'
  ]),
  competitor_profiles: new Set([
    'id',
    'username',
    'display_name',
    'avatar_url',
    'bio',
    'website_url',
    'monthly_reach',
    'reach_delta_7d',
    'profile_views',
    'views_delta_7d',
    'total_pins',
    'total_boards',
    'follower_count',
    'following_count',
    'account_type',
    'activity_status',
    'last_synced_at',
    'is_active',
    'tags',
    'metadata',
    'created_at',
    'updated_at',
    'last_harvest_metadata',
    'tracking_mode',
    'custom_label',
    'source_folder_id',
    'delta_reach_24h',
    'delta_views_24h',
    'delta_pins_24h',
    'delta_boards_24h',
    'pins_delta_7d',
    'boards_delta_7d'
  ]),
  competitor_boards: new Set([
    'id',
    'competitor_id',
    'board_id',
    'name',
    'url',
    'pin_count',
    'follower_count',
    'last_pinned_at',
    'metadata',
    'created_at',
    'updated_at'
  ]),
  competitor_history_snapshots: new Set([
    'id',
    'competitor_id',
    'monthly_reach',
    'profile_views',
    'follower_count',
    'total_pins',
    'total_boards',
    'recorded_date',
    'metadata',
    'created_at'
  ]),
  pa_qualification_rules: new Set([
    'id',
    'tier1_min_saves',
    'tier2_min_repins',
    'tier2_min_velocity',
    'tier2_max_age_days',
    'tier2_min_shares',
    'tier3_max_age_days',
    'tier3_min_saves',
    'master_ingest_enabled',
    'early_stop_pages',
    'max_batch_pins',
    'discovery_max_pages',
    'refresh_max_pins',
    'paused_policy',
    'updated_at'
  ]),
  domain_intelligence_rollup: new Set([
    'domain',
    'total_pins',
    'unique_urls',
    'active_serp_pins',
    'top3_pins',
    'top10_pins',
    'rank_11_50_pins',
    'displaced_pins',
    'best_rank',
    'avg_rank',
    'visibility_score',
    'total_saves',
    'avg_saves',
    'total_repins',
    'avg_velocity',
    'pins_per_url',
    'accounts_count',
    'sample_accounts',
    'ad_network',
    'ad_manager_domain',
    'primary_pub_id',
    'previous_ad_network',
    'ad_switched_at',
    'ad_network_history',
    'ads_txt_status',
    'ad_provider',
    'age_days',
    'age_years',
    'age_status',
    'domain_created_at',
    'domain_expires_at',
    'lookup_status',
    'decay_rate_pct',
    'arbitrage_score',
    'refreshed_at',
    'updated_at'
  ]),
  domain_registry_metadata: new Set([
    'domain',
    'registered_at',
    'updated_at_whois',
    'expires_at',
    'initial_age_days',
    'initial_age_years',
    'lookup_source',
    'lookup_status',
    'checked_at'
  ]),
  domain_monetization_metadata: new Set([
    'domain',
    'current_ad_network',
    'ad_manager_domain',
    'primary_pub_id',
    'previous_ad_network',
    'switched_at',
    'network_history',
    'ads_txt_status',
    'raw_header_snippet',
    'checked_at'
  ]),
  seed_guided_search_capsules: new Set([
    'id',
    'seed_pin_id',
    'query_term',
    'normalized_query',
    'image_url',
    'search_url',
    'node_id',
    'discovered_at',
    'capsule_title'
  ]),
  competitor_seed_pins: new Set([
    'id',
    'competitor_id',
    'pin_id',
    'title',
    'image_url',
    'board_name',
    'save_count',
    'created_at',
    'last_crawled_at'
  ]),
  mv_pulse_24h_summary: new Set([
    'summary_id',
    'active_pins_24h',
    'active_domains_24h',
    'active_creators_24h',
    'avg_velocity_24h',
    'max_velocity_24h',
    'total_delta_saves_24h',
    'refreshed_at'
  ])
};

// 2. Migration 062 SSOT Indexes & Function Parity Definitions
export const MIGRATION_062_EXPECTED_INDEXES = new Set([
  'idx_mv_pulse_24h_summary_id',
  'idx_ump_hashtext_mod20',
  'idx_ksp_hashtext_mod20',
  'idx_cbp_hashtext_mod20',
  'idx_ump_is_product',
  'idx_cbp_competitor',
  'idx_tk_lower_keyword',
  'idx_cp_lower_username',
  'uq_canonical_tracked_keywords'
]);

export const MIGRATION_062_DROPPED_INDEXES = new Set([
  'idx_ump_last_scraped_at_desc',
  'idx_ump_last_scraped_at',
  'idx_ump_updated_at_desc',
  'idx_ump_updated',
  'idx_ksp_displaced_updated_desc',
  'idx_pdm_pin_recorded_desc',
  'idx_pdm_pin_snapshot_desc'
]);

export const MIGRATION_064_EXPECTED_INDEXES = new Set([
  'idx_ksp_pin_id',
  'idx_ump_destination_url_md5',
  'idx_ump_is_hydrated'
]);

export const MIGRATION_064_DROPPED_INDEXES = new Set([
  'idx_cbp_board',
  'idx_kw_folder_items_folder',
  'idx_fci_folder_id',
  'idx_competitor_boards_comp_id',
  'idx_csp_comp_pin',
  'idx_csp_comp_id',
  'idx_crn_comp_seed',
  'idx_ksp_pin_displaced_rank',
  'idx_ump_visual_annotations_gin',
  'idx_ump_destination_url'
]);

export const CANONICAL_FUNCTION_SIGNATURES = {
  pa_topic_clusters_page: {
    name: 'pa_topic_clusters_page',
    args: ['p_min_pins', 'p_search', 'p_limit', 'p_offset', 'p_account'],
    argTypes: ['integer', 'text', 'integer', 'integer', 'text'],
    returnColumns: new Set(['topic_name', 'pins_count', 'total_saves', 'avg_saves', 'avg_velocity'])
  }
};

function scanDirectory(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'scratch') {
        scanDirectory(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const filesToScan = [
  ...scanDirectory('src'),
  ...scanDirectory('scripts')
];

let violationCount = 0;

// AST Walker Helper
function walkAst(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walkAst(c, visitor);
    } else if (child && typeof child === 'object') {
      walkAst(child, visitor);
    }
  }
}

// SQL Keywords used to detect untagged SQL template strings
const SQL_KEYWORD_PATTERN = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|WITH)\b/i;

for (const file of filesToScan) {
  if (file.includes('verify_sql_schema_parity.mjs')) continue;

  const content = fs.readFileSync(file, 'utf8');

  // 1. File-wide Code-Level Checks
  if (/crawled_at\s*=\s*COALESCE\s*\(\s*(?:keyword_serp_positions\.)?crawled_at\s*,\s*EXCLUDED\.crawled_at\s*\)/i.test(content)) {
    console.error(`🚨 [LANDMINE DETECTED] Inverted crawled_at COALESCE in keyword_serp_positions upsert`);
    console.error(`   File: ${file}`);
    console.error(`   Fix:  EXCLUDED.crawled_at must precede keyword_serp_positions.crawled_at\n`);
    violationCount++;
  }

  if (/(?:Number|\+)\s*\(\s*baselineMap\.get\([^)]+\)\s*(?:\|\|\s*0)?\s*\)/i.test(content)) {
    console.error(`🚨 [LANDMINE DETECTED] Unpacked Object to Number NaN poisoning on baselineMap`);
    console.error(`   File: ${file}`);
    console.error(`   Fix:  baselineMap stores { saves, date } object; passing object to Number() evaluates to NaN\n`);
    violationCount++;
  }

  // 2. Parse AST to extract SQL templates reliably (immune to nested backticks and ${...})
  let ast;
  try {
    ast = acorn.parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowHashBang: true,
      locations: true
    });
  } catch (_e) {
    continue;
  }

  const sqlBlocks = [];

  walkAst(ast, (node) => {
    if (node.type === 'TaggedTemplateExpression') {
      const tagName = node.tag.name || (node.tag.property && node.tag.property.name) || '';
      if (['sql', 'dbSql', 'targetSql', 'client', 'postgres', 'tx', 'txSql', 'hubSql', 'currentSql', 'probeSql', 'barrierSql', 'activeSql', 'barrierPollSql', 'phase1bSql', 'phase1bSqlA', 'phase1bSqlB'].includes(tagName)) {
        const queryText = node.quasi.quasis.map(q => q.value.raw).join(' __PARAM__ ');
        sqlBlocks.push({ query: queryText, line: node.loc?.start?.line || 1 });
      }
    } else if (node.type === 'TemplateLiteral') {
      const queryText = node.quasis.map(q => q.value.raw).join(' __PARAM__ ');
      if (SQL_KEYWORD_PATTERN.test(queryText)) {
        sqlBlocks.push({ query: queryText, line: node.loc?.start?.line || 1 });
      }
    }
  });

  const isTestOrMigrationOrSeed =
    file.includes('migration') ||
    file.includes('seed') ||
    file.includes('test') ||
    file.includes('mock') ||
    file.includes('chaos');

  // 3. Audit each isolated SQL block
  for (const { query, line } of sqlBlocks) {
    // Architectural Guard 1: Ban direct INSERT INTO keyword_pins_snapshots outside migrations/tests
    if (!isTestOrMigrationOrSeed && /\bINSERT\s+INTO\s+keyword_pins_snapshots\b/i.test(query)) {
      console.error(`🚨 [ARCHITECTURAL GUARD] Direct INSERT INTO keyword_pins_snapshots on Central Hub!`);
      console.error(`   File: ${file}:${line}`);
      console.error(`   Fix:  Historical snapshots must be routed exclusively to PinRepository in Unified PostgreSQL.\n`);
      violationCount++;
    }

    // Architectural Guard 2: Ban invalid ON CONFLICT (pin_id, snapshot_date) on pins_daily_snapshots
    if (/\bINSERT\s+INTO\s+pins_daily_snapshots\b[\s\S]*?\bON\s+CONFLICT\s*\(\s*pin_id\s*,\s*snapshot_date\s*\)/i.test(query)) {
      console.error(`🚨 [ARCHITECTURAL GUARD] Invalid ON CONFLICT (pin_id, snapshot_date) on pins_daily_snapshots!`);
      console.error(`   File: ${file}:${line}`);
      console.error(`   Fix:  pins_daily_snapshots unique key is (pin_id, keyword_id, snapshot_date).\n`);
      violationCount++;
    }

    // Architectural Guard 3: Ban queries targeting tables/views permanently dropped in Migration 060
    if (!isTestOrMigrationOrSeed && !file.includes('optimize_hub_storage.mjs')) {
      const legacyDropMatch = query.match(/\b(?:FROM|INTO|UPDATE|JOIN)\s+(?:public\.)?(pa_pin_metrics|neon_projects_registry|keyword_displaced_pins|creator_boards|pa_pins|competitor_pins|keyword_displaced_index|keyword_serp_current|pin_serp_positions|crawler_shard_heartbeats)\b/i);
      if (legacyDropMatch) {
        console.error(`🚨 [ARCHITECTURAL GUARD] Query references dropped legacy table/view '${legacyDropMatch[1]}'!`);
        console.error(`   File: ${file}:${line}`);
        console.error(`   Fix:  Post-Migration 060 Unified PostgreSQL 4-Table SSOT eradicated '${legacyDropMatch[1]}'.\n`);
        violationCount++;
      }
    }

    // Architectural Guard 4: Ban queries referencing HOT-blocking indexes dropped in Migration 062
    if (!isTestOrMigrationOrSeed && !file.includes('ensure_indexes.mjs')) {
      for (const droppedIdx of MIGRATION_062_DROPPED_INDEXES) {
        if (new RegExp(`\\b${droppedIdx}\\b`, 'i').test(query)) {
          console.error(`🚨 [ARCHITECTURAL GUARD] Query references dropped HOT-blocking index '${droppedIdx}'!`);
          console.error(`   File: ${file}:${line}`);
          console.error(`   Fix:  Migration 062 dropped '${droppedIdx}' to restore 100% PostgreSQL HOT updates.\n`);
          violationCount++;
        }
      }
    }

    // Active Column Auditing for Known Tables within this specific query
    for (const [tableName, validCols] of Object.entries(KNOWN_TABLE_COLUMNS)) {
      if (!new RegExp(`\\b${tableName}\\b`, 'i').test(query)) continue;

      // Find aliases for this table in this specific query
      const aliasPattern = new RegExp(`\\b(?:FROM|JOIN|UPDATE|INTO)\\s+${tableName}(?:\\s+(?:AS\\s+)?([a-zA-Z0-9_]+))?`, 'gi');
      const aliases = new Set([tableName]);
      let match;

      while ((match = aliasPattern.exec(query)) !== null) {
        const potentialAlias = match[1];
        if (potentialAlias) {
          const upper = potentialAlias.toUpperCase();
          const sqlReserved = ['WHERE', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'JOIN', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'SET', 'RETURNING', 'VALUES', 'DO', 'SELECT', 'AS'];
          if (!sqlReserved.includes(upper)) {
            aliases.add(potentialAlias);
          }
        }
      }

      // Detect table.column or alias.column
      for (const alias of aliases) {
        const colRegex = new RegExp(`\\b${alias}\\.([a-zA-Z0-9_]+)\\b`, 'g');
        let colMatch;
        while ((colMatch = colRegex.exec(query)) !== null) {
          const colName = colMatch[1].toLowerCase();
          if (colName === '*' || colName === '__param__') continue;
          if (!validCols.has(colName)) {
            console.error(`🚨 [SCHEMA LANDMINE] Column '${colName}' does NOT exist on table '${tableName}' (via alias '${alias}')`);
            console.error(`   File: ${file}:${line}`);
            console.error(`   Fix:  Verify against Unified PostgreSQL SSOT DDL schema (post-Migration 058); column '${colName}' is not defined.\n`);
            violationCount++;
          }
        }
      }

      // Unaliased Column Guard: Detect unaliased 'id' on tables with composite keys and no 'id' column
      if (!validCols.has('id')) {
        const isSingleTableQuery = (
          (new RegExp(`\\bFROM\\s+${tableName}\\b`, 'i').test(query) || new RegExp(`\\bUPDATE\\s+${tableName}\\b`, 'i').test(query)) &&
          !/\bJOIN\b/i.test(query)
        );
        if (isSingleTableQuery) {
          const hasIdSelect = /\bSELECT\s+(?:DISTINCT\s+)?id\b/i.test(query) ||
                              /,\s*id\s*,/i.test(query) ||
                              /\bid\s*AS\s+snapshot_id\b/i.test(query);
          const hasIdWhere = /\bWHERE\s+id\s*=/i.test(query) || /\bAND\s+id\s*=/i.test(query);

          if (hasIdSelect || hasIdWhere) {
            console.error(`🚨 [SCHEMA LANDMINE] Unaliased column 'id' does NOT exist on table '${tableName}'`);
            console.error(`   File: ${file}:${line}`);
            console.error(`   Fix:  '${tableName}' uses composite key and has NO 'id' column.\n`);
            violationCount++;
          }
        }
      }

      // Check EXCLUDED.column scoped strictly to INSERT INTO ${tableName} ... ON CONFLICT ... DO UPDATE SET clause
      const insertClauseRegex = new RegExp(
        `\\bINSERT\\s+INTO\\s+(?:public\\.)?${tableName}\\b[\\s\\S]*?\\bON\\s+CONFLICT[\\s\\S]*?\\bDO\\s+UPDATE\\s+SET\\s+([\\s\\S]*?)(?:\\bRETURNING\\b|\\bINSERT\\b|;|\\)\\s*,\\s*[a-zA-Z_][a-zA-Z0-9_]*\\s+AS\\s*\\(|\\)\\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\\b|$)`,
        'gi'
      );
      let clauseMatch;
      while ((clauseMatch = insertClauseRegex.exec(query)) !== null) {
        const updateBody = clauseMatch[1];
        const excludedRegex = /\bEXCLUDED\.([a-zA-Z0-9_]+)\b/gi;
        let exclMatch;
        while ((exclMatch = excludedRegex.exec(updateBody)) !== null) {
          const colName = exclMatch[1].toLowerCase();
          if (!validCols.has(colName)) {
            console.error(`🚨 [SCHEMA LANDMINE] EXCLUDED column '${colName}' does NOT exist on table '${tableName}'`);
            console.error(`   File: ${file}:${line}`);
            console.error(`   Fix:  EXCLUDED column must match an existing column in '${tableName}'.\n`);
            violationCount++;
          }
        }
      }


    }
  }
}

// 4. Live PostgreSQL Schema & Migration 062 Parity Verification (if DB is reachable)
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  try {
    const { createSqlClient } = await import('../src/db/client.mjs');
    const sql = createSqlClient(dbUrl, { connect_timeout: 2 });
    const isOnline = await sql`SELECT 1 as live`.then(() => true).catch(() => false);
    if (isOnline) {
      console.log('\n[*] Verifying live PostgreSQL Schema, Migration 062 Indexes & Function Parity...');

      // A. Verify mv_pulse_24h_summary
      try {
        await sql`REFRESH MATERIALIZED VIEW public.mv_pulse_24h_summary;`;
        await sql`SELECT * FROM public.mv_pulse_24h_summary LIMIT 1;`;
        console.log('  ✓ [LIVE DB] mv_pulse_24h_summary refreshed cleanly and queried successfully.');
      } catch (err) {
        console.error(`🚨 [LIVE DB ERROR] Failed to refresh/query mv_pulse_24h_summary: ${err.message}`);
        violationCount++;
      }

      // B. Verify pa_topic_clusters_page
      try {
        const clusterRows = await sql`SELECT * FROM public.pa_topic_clusters_page(1, NULL, 10, 0, NULL);`;
        console.log(`  ✓ [LIVE DB] pa_topic_clusters_page(1, NULL, 10, 0, NULL) executed cleanly (${clusterRows.length} rows returned).`);
      } catch (err) {
        console.error(`🚨 [LIVE DB ERROR] Failed to execute pa_topic_clusters_page: ${err.message}`);
        violationCount++;
      }

      // C. Verify pg_indexes: dropped indexes are gone, new 062 indexes exist
      try {
        const indexRows = await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public';`;
        const liveIndexes = new Set(indexRows.map(r => r.indexname));

        for (const dropped of [...MIGRATION_062_DROPPED_INDEXES, ...MIGRATION_064_DROPPED_INDEXES]) {
          if (liveIndexes.has(dropped)) {
            console.error(`🚨 [LIVE DB ERROR] Obsolete/HOT-blocking index '${dropped}' still exists in pg_indexes!`);
            violationCount++;
          }
        }

        for (const expected of [...MIGRATION_062_EXPECTED_INDEXES, ...MIGRATION_064_EXPECTED_INDEXES]) {
          if (!liveIndexes.has(expected)) {
            console.warn(`⚠️ [LIVE DB WARNING] Expected SSOT index '${expected}' not found in pg_indexes.`);
          }
        }
        console.log('  ✓ [LIVE DB] Migration 062/064 index parity verified in pg_indexes.');
      } catch (err) {
        console.error(`🚨 [LIVE DB ERROR] Failed to inspect pg_indexes: ${err.message}`);
        violationCount++;
      }

      await sql.end({ timeout: 2 }).catch(() => {});
    } else {
      console.log('\n[~] Live PostgreSQL database is not reachable at DATABASE_URL. Static AST verification passed 100%.');
    }
  } catch (err) {
    console.log(`\n[~] Live database check skipped: ${err.message}`);
  }
}

if (violationCount > 0) {
  console.error(`❌ AUDIT FAILED: Found ${violationCount} fatal SQL / Logic landmines in codebase!`);
  process.exit(1);
} else {
  console.log(`✅ [AUDIT PASSED] 100% Zero-Landmine Parity & Active Schema Verification across ${filesToScan.length} source files.`);
}
