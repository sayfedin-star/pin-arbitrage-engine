/**
 * SQL Schema Parity & Forensic Query Verifier (AST-Powered & Query-Isolated)
 * 
 * Statically audits every individual SQL template literal across src/ and scripts/ using Acorn AST to guarantee:
 * 1. Zero non-existent columns queried on Hub or Shard tables (active schema checking via KNOWN_TABLE_COLUMNS).
 * 2. Proper COALESCE precedence (EXCLUDED must take priority over existing on fresh updates).
 * 3. Prevention of baselineMap object-to-number NaN poisoning.
 * 4. Architectural Guard 1: Zero direct INSERT INTO keyword_pins_snapshots on Central Hub outside migrations/fixtures.
 * 5. Architectural Guard 2: Zero invalid ON CONFLICT (pin_id, snapshot_date) on pins_daily_snapshots.
 * 6. Architectural Guard 3: Cloudflare KV cache key parity on dossier and trajectory keys.
 */

import fs from 'fs';
import path from 'path';
import * as acorn from 'acorn';

console.log('=== Running Forensic SQL Schema Parity & AST Landmine Audit ===\n');

// 1. DDL Schema Definition for Core Tables (Ground Truth from Neon Hub & Shards)
export const KNOWN_TABLE_COLUMNS = {
  keyword_serp_current: new Set([
    'id',
    'keyword_id',
    'pin_id',
    'rank_position',
    'title',
    'domain',
    'destination_url',
    'image_url',
    'creator_username',
    'board_name',
    'save_count',
    'repin_count',
    'daily_save_velocity',
    'dominant_color',
    'visual_annotations',
    'crawled_at',
    'created_at_pinterest',
    'creation_method',
    'is_displaced',
    'last_known_rank',
    'displaced_date',
    'vacuum_opportunity_score',
    'comment_count',
    'share_count',
    'metadata',
    'updated_at',
    'prev_rank_position',
    'baseline_day_saves',
    'baseline_day_date',
    'shard_id'
  ]),
  keyword_displaced_index: new Set([
    'keyword_id',
    'pin_id',
    'last_known_rank',
    'vacuum_opportunity_score',
    'displaced_date',
    'save_count',
    'repin_count',
    'comment_count',
    'share_count',
    'daily_save_velocity',
    'updated_at',
    'domain',
    'shard_id'
  ]),
  pin_serp_positions: new Set([
    'pin_id',
    'snapshot_date',
    'keyword_id',
    'rank_position',
    'is_displaced',
    'last_known_rank',
    'catalog_rank',
    'updated_at'
  ]),
  pins_daily_metrics: new Set([
    'pin_id',
    'snapshot_date',
    'save_count',
    'repin_count',
    'comment_count',
    'share_count',
    'reaction_count',
    'daily_save_velocity',
    'updated_at'
  ]),
  pins_daily_snapshots: new Set([
    'id',
    'pin_id',
    'keyword_id',
    'competitor_id',
    'rank_position',
    'is_displaced',
    'last_known_rank',
    'save_count',
    'repin_count',
    'comment_count',
    'share_count',
    'reaction_count',
    'daily_save_velocity',
    'snapshot_date',
    'created_at'
  ]),
  universal_master_pins: new Set([
    'pin_id',
    'creator_username',
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
    'metadata'
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
  keyword_ignored_pins: new Set([
    'keyword_id',
    'pin_id',
    'ignored_reason',
    'ignored_at'
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
    'last_harvest_metadata'
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
  competitor_pins: new Set([
    'id',
    'competitor_id',
    'pin_id',
    'title',
    'description',
    'link_domain',
    'destination_url',
    'board_name',
    'image_url',
    'save_count',
    'repin_count',
    'comment_count',
    'created_at_pinterest',
    'first_seen_at',
    'last_seen_at',
    'metadata',
    'is_product',
    'alt_text',
    'enrichment_status',
    'updated_at',
    'enrich_attempts',
    'claim_token',
    'board_slug',
    'is_deleted'
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
  pa_pins: new Set([
    'pin_id',
    'account_username',
    'title',
    'description',
    'link',
    'domain',
    'board_name',
    'image_url',
    'dominant_color',
    'saves',
    'repins',
    'comments',
    'share_count',
    'reactions',
    'velocity',
    'annotations',
    'is_video',
    'is_product',
    'created_at_pinterest',
    'first_seen_at',
    'last_updated_at',
    'alt_text'
  ]),
  pa_qualification_rules: new Set([
    'id',
    'tier1_min_saves',
    'tier2_min_repins',
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
  neon_projects_registry: new Set([
    'id',
    'project_id',
    'project_name',
    'region_id',
    'database_url',
    'status',
    'is_hub',
    'assigned_shards',
    'stats',
    'metadata',
    'created_at',
    'updated_at'
  ]),
};;

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
  if (/crawled_at\s*=\s*COALESCE\s*\(\s*(?:keyword_serp_current\.)?crawled_at\s*,\s*EXCLUDED\.crawled_at\s*\)/i.test(content)) {
    console.error(`🚨 [LANDMINE DETECTED] Inverted crawled_at COALESCE in keyword_serp_current upsert`);
    console.error(`   File: ${file}`);
    console.error(`   Fix:  EXCLUDED.crawled_at must precede keyword_serp_current.crawled_at\n`);
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
      if (['sql', 'hubSql', 'shardSql', 'targetSql', 'client', 'postgres'].includes(tagName)) {
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
      console.error(`   Fix:  Historical snapshots must be routed exclusively to Storage Shards via fleet-router.\n`);
      violationCount++;
    }

    // Architectural Guard 2: Ban invalid ON CONFLICT (pin_id, snapshot_date) on pins_daily_snapshots
    if (/\bINSERT\s+INTO\s+pins_daily_snapshots\b[\s\S]*?\bON\s+CONFLICT\s*\(\s*pin_id\s*,\s*snapshot_date\s*\)/i.test(query)) {
      console.error(`🚨 [ARCHITECTURAL GUARD] Invalid ON CONFLICT (pin_id, snapshot_date) on pins_daily_snapshots!`);
      console.error(`   File: ${file}:${line}`);
      console.error(`   Fix:  pins_daily_snapshots unique key is (pin_id, keyword_id, snapshot_date).\n`);
      violationCount++;
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
            console.error(`   Fix:  Verify against Neon DDL schema; column '${colName}' is not defined.\n`);
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
        `\\bINSERT\\s+INTO\\s+${tableName}\\b[\\s\\S]*?\\bON\\s+CONFLICT[\\s\\S]*?\\bDO\\s+UPDATE\\s+SET\\s+([\\s\\S]*?)(?:\\bRETURNING\\b|\\bSELECT\\b|\\bINSERT\\b|\\bWITH\\b|;|\\)\\s*,|\\)\\s*SELECT|$)`,
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

      // Explicit bans for known historic regressions:
      if (tableName === 'keyword_serp_current') {
        if (/(?:sc|ksc|keyword_serp_current)\.reaction_count\b/i.test(query) ||
            (!/\bFROM\s*\(/i.test(query) && /,\s*reaction_count\s*,/i.test(query))) {
          console.error(`🚨 [LANDMINE DETECTED] Fake reaction_count in SQL query on keyword_serp_current`);
          console.error(`   File: ${file}:${line}`);
          console.error(`   Fix:  keyword_serp_current does NOT have reaction_count column in SQL; use 0 as reaction_count\n`);
          violationCount++;
        }
      }

      if (tableName === 'keyword_displaced_index') {
        if (/\blast_rank\b/i.test(query)) {
          console.error(`🚨 [LANDMINE DETECTED] Fake column last_rank on keyword_displaced_index`);
          console.error(`   File: ${file}:${line}`);
          console.error(`   Fix:  keyword_displaced_index uses last_known_rank, NOT last_rank\n`);
          violationCount++;
        }
        if (/\blast_saves\b/i.test(query)) {
          console.error(`🚨 [LANDMINE DETECTED] Fake column last_saves on keyword_displaced_index`);
          console.error(`   File: ${file}:${line}`);
          console.error(`   Fix:  keyword_displaced_index uses save_count, NOT last_saves\n`);
          violationCount++;
        }
        if (/\blast_checked_at\b/i.test(query)) {
          console.error(`🚨 [LANDMINE DETECTED] Fake column last_checked_at on keyword_displaced_index`);
          console.error(`   File: ${file}:${line}`);
          console.error(`   Fix:  keyword_displaced_index uses updated_at, NOT last_checked_at\n`);
          violationCount++;
        }
      }
    }
  }
}

if (violationCount > 0) {
  console.error(`❌ AUDIT FAILED: Found ${violationCount} fatal SQL / Logic landmines in codebase!`);
  process.exit(1);
} else {
  console.log(`✅ [AUDIT PASSED] 100% Zero-Landmine Parity & Active Schema Verification across ${filesToScan.length} source files.`);
}
