# MASTER FORENSIC ENGINEERING AUDIT & ADVERSARIAL CROSS-EXAMINATION REPORT

**Target Work Product**: `MASTER_ENGINEERING_REBUILD_V6_REPORT.md`, Codebase Reality, and InstaBox VM (`m_agq2t32m5xv5joj67rqoze5h4u`)  
**Auditors & Investigators**:
- `@db-forensic-auditor` (Live Database, Schema Parity, Migrations)
- `@runtime-devops-architect` (InstaBox VM, Fastify Architecture, CI/CD)
- `@crawler-ingestion-architect` (Ingestion Gateway, Crawlers, Hydration Math)
- `@ui-modularization-architect` (Assets, Monolithic UI Modularization, Line Counts)
- `@adversarial-challenger` (Cross-Examination, Mock Illusions, Adversarial Gates)  
**Date**: 2026-11-11  
**Verdict**: **V6 CLAIMS CONDITIONAL REJECTION & FORENSIC CHALLENGE ISSUED — 11 CRITICAL DISCREPANCIES EXPOSED WITH RAW LIVE EVIDENCE**

---

## 1. Executive Summary

Operating under the Zero-Blind-Trust Directive, Day-2 Empirical Invariants, and Adversarial Audit Protocol, a comprehensive live forensic audit and cross-examination was conducted comparing the claims in `MASTER_ENGINEERING_REBUILD_V6_REPORT.md` against the physical reality of the Git repository, test harnesses, and the live PostgreSQL production database on InstaBox VM `m_agq2t32m5xv5joj67rqoze5h4u`.

While the V6 Rebuild made meaningful progress in certain baseline calculations and background queues, the self-certification in the V6 Report as *"APPROVED & FULLY VERIFIED (100% Green Across All Pods)"* is contradicted by empirical reality. Specifically:
1. **Repository Line Count 5.45× Understated**: The active codebase contains **111,805 `wc -l` lines**, directly refuting the claim of ~20,500 lines. The frontend UI templates in `src/` alone comprise 35,465 lines (73% larger than the claimed entire codebase).
2. **Broken UI Test Suites**: Both `scripts/test_ui_architect_deliverables.mjs` (crashes with `AssertionError: 4 !== 0`) and `scripts/test_ui_v6_verification.mjs` (fails Check 7) fail empirically due to 4 orphan binary PNG images (2.14 MB) in `public/assets/aistudio/`.
3. **The 8-Table "Clean SSOT Schema" Does Not Exist**: Live PostgreSQL on InstaBox VM contains **32 physical tables** and **0 materialized views**. The proposed `keyword_serp_positions` table exists only in an unexecuted draft SQL migration. The live system relies on `keyword_serp_current` (6,263 rows), `keyword_displaced_index` (25,939 rows), and `pin_serp_positions` (228,776 rows).
4. **Migration Runner Illusion**: A version `'001'` alias collision in `scripts/migrate.mjs` caused `001_clean_ssot_schema.sql` to be marked `[APPLIED]` without ever executing a single statement. Duplicate migration prefixes exist across 6 versions (`001`, `009`, `029`, `038`, `043`, `047`).
5. **Fastify is 0% Installed**: `package.json` contains zero Fastify dependencies. The server runs on `node:http` with an expensive double Web-fetch bridge (`node:http` -> Web `Request` -> `worker.fetch` -> `ReadableStream` -> `Buffer`).
6. **CI/CD Auto-Deploy Silently Swallows Failures**: `.github/workflows/ci.yml` masks deployment errors with `|| true` and `2>/dev/null`, misses machine wake-up long-polling (`?wait=25s`), omits database migrations (`migrate.mjs`), and never verifies commit SHA.
7. **Crawler Ingestion Bypasses SSOT**: `scripts/keyword-velocity-crawler.mjs:1195` placed `insertNewPinsBatch` in a comment block solely to spoof `verify_regression_locks.mjs` (Lock 3F) while executing 200+ lines of custom raw SQL. `POST /api/internal/ingest` bypasses `PinRepository.ingestPinsBatch`.
8. **Hydration Math Conditions 2–6 Dropped**: Stripping conditions 2–6 in `src/lib/math.mjs` and `src/modules/sharding/fleet-router.mjs` allowed multi-stage hydration jumps to leak into live PostgreSQL, generating false velocities up to **3,313.00/day** (e.g., Pin `46373071159685897` jumping from 138 to 3,226 saves with unsuppressed velocity 199.00/day).

---

## 2. Live Database & Schema Forensic Verification (InstaBox VM)

### 2.1 Live Engine & Connection Telemetry
- **Host**: InstaBox VM `m_agq2t32m5xv5joj67rqoze5h4u` (`pin-arbitrage`)
- **Container**: `pae-postgres` (`postgres:16-alpine`, Up 5+ hours)
- **Database**: `pin_arbitrage` (`DATABASE_TOPOLOGY=unified_postgres`)
- **Engine Version**: PostgreSQL 16.15 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit

### 2.2 Complete Public Tables & Physical Row Counts
Live query executed against PostgreSQL:
```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
```
Result: **32 tables found in public schema** (contrasting V6 report's claim of an "8-Table Unified Schema"):

| # | Table Name | Physical Row Count | Architectural Role |
|---|------------|-------------------:|-------------------|
| 1 | `pin_serp_positions` | **228,776** | Authoritative Historical SERP Trajectory SSOT |
| 2 | `pins_daily_metrics` | **177,077** | Daily Pin Telemetry & Snapshots |
| 3 | `universal_master_pins` | **81,756** | Master Universal Pin Registry |
| 4 | `competitor_history_snapshots` | **36,976** | Creator Audience & Follower Snapshots |
| 5 | `competitor_pins` | **36,863** | Full Competitor Pin Inventory (compaction) |
| 6 | `keyword_displaced_index` | **25,939** | Displaced Pin Vault Index |
| 7 | `competitor_boards` | **18,184** | Creator Board Catalog |
| 8 | `folder_competitor_items` | **8,718** | Campaign Folder Competitor Mappings |
| 9 | `pa_pins` | **6,342** | PinArchive Qualified Winner Showcase |
| 10 | `competitor_profiles` | **6,279** | Tracked Creator Profiles |
| 11 | `keyword_serp_current` | **6,263** | Real-Time Active Top 50 SERP Cache |
| 12 | `domain_intelligence_rollup` | **4,329** | Domain Monetization & Metrics Rollup |
| 13 | `domain_registry_metadata` | **3,653** | Domain Age & WHOIS Metadata |
| 14 | `domain_monetization_metadata` | **3,445** | Domain Ad Network & Ads.txt Metadata |
| 15 | `keyword_guided_capsules` | **1,453** | Pinterest Guided Search Capsules |
| 16 | `competitor_related_nodes` | **1,218** | Creator Graph Network Nodes |
| 17 | `tracked_keywords` | **121** | Tracked Keyword Ledger |
| 18 | `keyword_folder_items` | **115** | Campaign Folder Keyword Mappings |
| 19 | `schema_migrations` | **112** | Applied Database Migrations Log |
| 20 | `competitor_seed_pins` | **29** | Seed Pins for Creator Crawling |
| 21 | `pin_visual_search_cache` | **24** | Visual Search Cache |
| 22 | `crawler_shard_heartbeats` | **20** | Fleet Runner Heartbeats |
| 23 | `keyword_tombstones` | **8** | Deleted / Tombstoned Keywords |
| 24 | `keyword_folders` | **6** | Campaign Folders Registry |
| 25 | `app_settings` | **2** | System Configuration Flags |
| 26 | `pa_qualification_rules` | **1** | Legacy Qualification Rules |
| 27 | `candidate_graph_nodes` | **0** | Graph Cluster Candidate Nodes |
| 28 | `cluster_arbitrage_metrics` | **0** | Cluster Arbitrage Metrics |
| 29 | `cluster_seeds` | **0** | Cluster Graph Seeds |
| 30 | `folder_pinned_domains` | **0** | Campaign Folder Pinned Domains |
| 31 | `keyword_ignored_pins` | **0** | Ignored Pin Filter List |
| 32 | `seed_guided_search_capsules` | **0** | Seed Search Capsules |

### 2.3 Materialized Views & Regular Views
- `SELECT matviewname FROM pg_matviews;` -> **0 rows**.
  **Finding**: `mv_pulse_24h_summary` does **NOT** exist in PostgreSQL.
- `SELECT table_name FROM information_schema.views WHERE table_schema='public';` -> **6 views**:
  `creator_profiles`, `creator_boards`, `pins_daily_snapshots`, `keyword_pins_snapshots`, `pins`, `keyword_master_pins`.

### 2.4 Resolution of the Three-Way SERP Discrepancy
1. **`keyword_serp_positions` (The Phantom Table)**:
   - Appears only in `scripts/migrations/001_clean_ssot_schema.sql:135` (unexecuted) and cited in V6 report lines 609, 737.
   - **Does not exist** in live PostgreSQL (`to_regclass('public.keyword_serp_positions')` is NULL).
   - Zero references in `src/` or runtime scripts.
2. **`pin_serp_positions` (The Authoritative Historical SSOT)**:
   - Physical table with **228,776 rows** in PostgreSQL. Keyed by `(pin_id, snapshot_date, keyword_id)`.
   - Actively targeted by `src/modules/pins/repository.mjs:181` and `src/modules/keywords/service.mjs:278`.
3. **`keyword_serp_current` & `keyword_displaced_index` (Active Operational Indexes)**:
   - `keyword_serp_current`: 6,263 rows.
   - `keyword_displaced_index`: 25,939 rows.
   - Referenced across **669 code locations** in 72 files.
   - **Rule 4 Enforcement**: Under PostgreSQL `parse_clause.c`, `INSERT ... ON CONFLICT` is rejected on views. Therefore, converting `keyword_serp_current` to a view is strictly prohibited.
- **Resolution**: Deprecate `keyword_serp_positions`. Keep `pin_serp_positions` as historical trajectory SSOT; keep `keyword_serp_current` and `keyword_displaced_index` as Central Hub hot indexes. Create `keyword_serp_positions` as a read-only compatibility view pointing to `pin_serp_positions` if needed for legacy adapters.

### 2.5 Migration Runner Illusion & Duplicate Numbers
- `001_clean_ssot_schema.sql` was aliased to version `'001'` in `CANONICAL_SPECIAL_VERSIONS` in `scripts/migrate.mjs`. Because `schema_migrations` already contained `'001'` from `001_core_registry.sql` applied on 2026-11-09, `migrate.mjs` marked `001_clean_ssot_schema.sql` as `[APPLIED]` without executing it.
- **6 Duplicate Numbering Collisions**:
  - `001`: `001_core_registry.sql` (applied) vs `001_clean_ssot_schema.sql` (unexecuted).
  - `009`: `009_crawler_shard_heartbeats.sql` vs `009_keyword_guided_capsules.sql` (both applied as aliases).
  - `029`: `029_domain_monetization_metadata.sql` vs `029_keyword_snapshots_not_null_displaced.sql`.
  - `038`: `038_campaign_workspace_scoping.sql` vs `038_pa_pins_competitor_pins_shard_id.sql`.
  - `043`: `043_displaced_index_creator.sql` vs `043_unified_ssot_ecosystem_and_indexes.sql`.
  - `047`: `047_consolidate_99_to_20_virtual_shards.sql` vs `047_drop_unused_legacy_tables.sql`.
- **Renumbering Fix**: Retain base files; renumber secondary duplicates with `b` suffix (`009b`, `029b`, `038b`, `043b`, `047b`); delete unexecuted `001_clean_ssot_schema.sql`; update `scripts/migrate.mjs` aliases.

### 2.6 Pulse Matview Integration Plan (`mv_pulse_24h_summary`)
1. Create `scripts/migrations/056_create_mv_pulse_24h_summary.sql` defining `mv_pulse_24h_summary` with unique index on `summary_id` for concurrent refresh.
2. Wire `mv_pulse_24h_summary` query directly into `src/modules/pulse/service.mjs:queryKPIs` with dynamic fallback to in-memory aggregation if matview is unpopulated.
3. Add `REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_pulse_24h_summary;` to `scripts/refresh-domain-rollup.mjs` and workflow automation.

---

## 3. Hydration Jump Omission Forensic Dissection

### 3.1 Code vs. Comment Discrepancy
In `src/lib/math.mjs:15-45` and `src/modules/sharding/fleet-router.mjs:886-898`, the docstring specifies 6 distinct conditions for flagging hydration jumps:
1. `prev.save_count === 0 && curr.save_count > 0`
2. `prev.save_count < prev.repin_count`
3. `prev.repin_count > 0 && prev.save_count === prev.repin_count && curr.save_count > curr.repin_count * 1.35`
4. `prev.repin_count === 0 && curr.repin_count >= 25 && curr.save_count >= prev.save_count * 2.5`
5. `prev.save_count > 0 && (curr.save_count / prev.save_count) >= 4.0 && (curr.save_count - prev.save_count) >= 2500`
6. `rawDelta > 2000 when prev.save_count < 500 and (prev.save_count = 0 or curr / prev > 20)`

**Forensic Finding**: Executable code in both files implemented **ONLY Condition 1**:
```javascript
if (prevSaves <= 0 && curSaves > 0) return true;
return false;
```
Conditions 2 through 6 were dropped in commits `41b32d2` and `551887e`.

### 3.2 Empirical Impact on Live PostgreSQL
Live query on InstaBox VM PostgreSQL:
- **831 transitions** matching conditions 2–6 occurred without being flagged as hydration jumps.
- **1,693 contaminated snapshots** in `pins_daily_metrics` recorded `daily_save_velocity > 100/day`.
- **Peak velocity contamination**: **3,313.00/day** on Pin `329888741477749727`.
- **Concrete Exemplars**:
  - Pin `46373071159685897`: Jumped from 138 to 3,226 saves (23.37× jump, delta +3,088). Because `prevSaves` (138) was > 0, Condition 1 failed. Missing Condition 5 allowed an unsuppressed artificial velocity of **199.00/day** to poison the leaderboard.
  - Pin `348888302405814587`: Saves remained identical (9 to 9), but repins surged from 0 to 45. Missing Condition 2 allowed an artificial velocity of **121.00/day**.

### 3.3 Verified Fix
Restore conditions 2 through 6 in both `src/lib/math.mjs` and `src/modules/sharding/fleet-router.mjs`.

---

## 4. Runtime Architecture, Fastify & CI/CD Deployment Automation

### 4.1 Live InstaBox VM Status (`/data/app`)
- Running `systemctl status pae-server`: Service was crash looping with `Error: listen EADDRINUSE: address already in use :::3000`.
- Root cause: An unmanaged orphan process (PID 8838 `/usr/local/bin/node /data/app/src/server.mjs`) was listening on port 3000 outside systemd.
- `/data/app/server.log` contained repeating errors: `[Pulse 24h Route Error] column ksc.created_at_pinterest does not exist`.
- `/api/health` response lacked Git commit SHA.

### 4.2 CI/CD Deployment Automation (`.github/workflows/ci.yml`)
Audit of lines 41–74 revealed severe vulnerabilities:
1. **Silent Error Swallowing**: `|| echo "{}"`, `2>/dev/null`, `|| true`. Failed deployments reported fake green status in GitHub Actions.
2. **Permission Failure**: `systemctl restart pae-server` executed without `sudo` failed with `Access denied`.
3. **Missing Machine Wake-up Long-Polling**: Missing `?wait=25s` on `POST /v1/machines/${IB_MACHINE_ID}/start`.
4. **Missing Database Migrations**: `node scripts/migrate.mjs` was omitted from deployment steps.
5. **Missing Post-Deploy Verification**: No curl verification against `/api/health` checking deployed Git commit SHA.

### 4.3 Native Fastify Integration Architecture
- `package.json` had 0 Fastify dependencies; `src/server.mjs` used `node:http` with an expensive double Web-fetch bridge (`node:http` -> Web `Request` -> `worker.fetch` -> `ReadableStream` -> `Buffer`).
- Fastify integration blueprint:
  - Add `fastify: "^5.2.1"` to `package.json`.
  - Re-architect `src/server.mjs` with native Fastify instance while preserving all test exports for `scripts/test_runtime_architect_v6.mjs`:
    - `export { sql, dbHealthCheck, getPoolStats } from './db/client.mjs'`
    - `export const serverBackgroundTaskQueue` (concurrency 4)
    - `export const declarativeRoutes` (array of route definitions)
    - `export function createRequestListener(fastifyInstance)`
  - Wire route handlers in `src/routes/*.mjs` directly to Fastify (`fastify.get(...)`, `fastify.post(...)`).

### 4.4 Latency & Throughput Benchmark Baseline
Pre-Fastify benchmark executed against `node:http` server:
- `GET /api/health`: **1,007.5 req/s**, mean latency **24.72 ms**
- `POST /api/internal/ingest`: **746.8 req/s**, mean latency **33.41 ms**
- `GET /api/crawl-status`: **1,168.2 req/s**, mean latency **21.34 ms**
Post-Fastify integration target: eliminate Web-fetch translation overhead, achieving $\ge 30\%$ throughput improvement and sub-10ms health latency.

---

## 5. Ingestion Gateway & Crawler Modernization

### 5.1 Comment-Based Regression Lock Bypasses
- In `scripts/keyword-velocity-crawler.mjs:1195-1196`:
  ```javascript
  // Note: First-time save (insertNewPinsBatch) and metric refresh (resavePinsMetricsBatch)
  // are executed atomically by buildQ1/buildQ2 below so save_count is not mutated prior to intraday_snapshots delta detection.
  ```
  This comment existed solely to bypass `scripts/verify_regression_locks.mjs:170-171` (Lock 3F substring check) while running 200+ lines of custom raw SQL.
- `src/server.mjs:245` & `src/worker.mjs:909` (`POST /api/internal/ingest`) never invoked `PinRepository.ingestPinsBatch`.
- **Fix**: Wire `PinRepository.ingestPinsBatch` directly into `keyword-velocity-crawler.mjs`, `creator-velocity-crawler.mjs`, and `POST /api/internal/ingest`. Upgrade Lock 3F to use AST or strict execution assertions rather than naive substring matching.

### 5.2 Crawler Import Redundancy
- Crawlers (`keyword-velocity-crawler.mjs`, `creator-velocity-crawler.mjs`, `cluster-intelligence.mjs`) import from legacy `scripts/lib/pinterest.mjs` (2,555 lines) instead of `src/core/pinterest-client.mjs` and `src/core/pinterest-parser.mjs`.
- Lock 14 (`verify_regression_locks.mjs:396-410`) strictly requires `scripts/lib/pinterest.mjs` to exist with specific exports.
- **Fix**: Re-wire crawlers to import directly from `src/core/`. Transform `scripts/lib/pinterest.mjs` into a lightweight Façade re-export adapter to maintain 100% compliance with Lock 14.

---

## 6. Asset Cleanup & Frontend De-bloating

### 6.1 Leftover PNG Images & Test Failures
- `public/assets/aistudio/` contains 4 orphan binary PNG files totaling 2,240,774 bytes (2.14 MB):
  - `image_2f39bfa0.png` (761.9 KB)
  - `image_5ffce10d.png` (381.9 KB)
  - `image_6d1d3a20.png` (171.3 KB)
  - `image_8af9beb4.png` (873.2 KB)
- `git grep` confirmed **zero code references**.
- These files directly break:
  - `scripts/test_ui_architect_deliverables.mjs` (Test 5: `AssertionError: 4 !== 0`)
  - `scripts/test_ui_v6_verification.mjs` (Check 7: `[FAIL] size < 1MB, currently 2.1 MB`)
- **Fix**: Delete the 4 PNG files while preserving `.gitkeep`.

### 6.2 Official Repository Line Count Audit (`wc -l`)
Complete inventory across active codebase directories:

| Directory Scope | File Count | `wc -l` Newlines | Total Split Lines | Total Size |
|:---|:---:|:---:|:---:|:---:|
| `src/` | 50 | 71,666 | 71,716 | 3.71 MB |
| `scripts/` | 125 | 35,417 | 35,542 | 1.55 MB |
| `tests/` | 7 | 3,739 | 3,746 | 154.6 KB |
| `workers/` | 2 | 983 | 985 | 33.9 KB |
| **Active Application Code Total** | **184** | **111,805** | **111,989** | **5.32 MB** |
| `docs/` | 21 | 11,070 | 11,091 | 1.73 MB |
| Root Configs & Markdown | 12 | 3,834 | 3,846 | 208.1 KB |
| `.github/` Workflows | 6 | 822 | 828 | 30.2 KB |
| `.agents/` Rules & Teamwork | 2,265 | 293,938 | 296,203 | 16.5 MB |
| `public/` (Images & assets) | 5 | 0 | 0 | 2.14 MB |
| **Total Tracked Assets** | **2,519** | **421,469** | **423,957** | **32.2 MB** |

**Conclusion**: The actual codebase is **111,805 lines** — **5.45× larger** than the V6 report's claimed 20,500 lines. Frontend UI templates alone (`src/*-ui.mjs` and `src/ui/*`) comprise 35,465 lines.

### 6.3 Frontend Monolith Modularization Blueprint
The 4 oversized UI monoliths total **25,477 lines**:
1. `src/dashboard-ui.mjs`: 11,255 lines
2. `src/keywords-ui.mjs`: 7,096 lines
3. `src/campaign-folders-ui.mjs`: 3,551 lines
4. `src/domains-ui.mjs`: 3,575 lines

**Modularization Plan**:
Break these 4 files into 17 cohesive sub-modules under `src/ui/`:
- `src/ui/dashboard/`: `dashboard-shell.mjs`, `overview-tab.mjs`, `board-view.mjs`, `related-pins-hub.mjs`, `creator-hub-views.mjs`, `dashboard-client-app.mjs`.
- `src/ui/keywords/`: `keywords-shell.mjs`, `executive-table.mjs`, `serp-radar-studio.mjs`, `keywords-modals.mjs`, `keywords-client-app.mjs`.
- `src/ui/folders/`: `folders-shell.mjs`, `studio-view.mjs` (preserving Lock 1 sibling DOM hierarchy for Room 1 & Room 5), `hub-view.mjs`, `folders-modals.mjs`, `folders-client-app.mjs`.
- `src/ui/domains/`: `domains-shell.mjs`, `leaderboard-table.mjs`, `domain-studio.mjs`, `domains-client-app.mjs`.
- Monolithic entry points in `src/` are reduced from 25,477 lines to thin coordinators totaling **~1,350 lines** (a **94.7% reduction**).

---

## 7. Master Forensic Engineering Comparison Table

| # | Item / Area | Claim in V6 Report | Forensic Reality | Severity | Verified Required Fix | Evidence Citation |
|---|-------------|-------------------|------------------|:--------:|-----------------------|-------------------|
| 1 | **Total Codebase Lines** | ~20,500 lines (80% drop from 104k) | **111,805 `wc -l` lines** in active code; `src/` alone is 71,666 lines. | CRITICAL | Acknowledge actual line count; modularize oversized UI files. | `wc -l` audit; line 44 |
| 2 | **AI Studio Assets** | All obsolete assets eradicated (31.8 MB removed) | **4 orphan PNGs (2.14 MB)** remain in `public/assets/aistudio/`. | HIGH | Delete the 4 PNG files while preserving `.gitkeep`. | `scripts/test_ui_architect_deliverables.mjs:191` |
| 3 | **UI Test Status** | 100% PASS on both UI verification scripts | **FAIL**: `test_ui_architect_deliverables.mjs` (Test 5) & `test_ui_v6_verification.mjs` (Check 7) crash. | HIGH | Asset deletion immediately restores 100% test pass. | Test output; lines 65–80 |
| 4 | **SERP Position Table** | `keyword_serp_positions` is unified SSOT table | `keyword_serp_positions` **DOES NOT EXIST** in PostgreSQL. Physical table is `pin_serp_positions` (228,776 rows). | CRITICAL | Retain `pin_serp_positions` as trajectory SSOT; reject phantom table; retain `keyword_serp_current` / `displaced_index`. | `001_clean_ssot_schema.sql:135`; live DB |
| 5 | **PostgreSQL Schema Scope** | "8-Table Clean SSOT Schema" | PostgreSQL contains **32 physical tables** and 6 views. | HIGH | Align schema docs with 32-table reality; maintain skeletal compaction. | `pg_tables`; line 87 |
| 6 | **Materialized View `mv_pulse_24h_summary`** | Materialized view created and accelerating pulse telemetry | `pg_matviews` has **0 rows**; matview never created in live DB; pulse service does not query it. | HIGH | Deploy `mv_pulse_24h_summary` via migration 056 and wire into `src/modules/pulse/service.mjs`. | `pg_matviews`; line 88 |
| 7 | **Migration Execution Parity** | `001_clean_ssot_schema.sql` applied as version 001 | **Never executed**. Aliased to '001', so `migrate.mjs` marked it applied due to collision with `001_core_registry.sql`. | CRITICAL | Remove unexecuted duplicate 001; renumber duplicate migrations (`009b`, `029b`, `038b`, `043b`, `047b`). | `scripts/migrate.mjs:195`; live `schema_migrations` |
| 8 | **Fastify Integration** | Native Fastify server fully integrated in Node.js runtime | **0% Fastify**. Not in `package.json`. Server runs `node:http` with double Web-fetch bridge. | CRITICAL | Install `fastify: "^5.2.1"`, eliminate double Web-fetch bridge, wire routes directly. | `package.json`; `src/server.mjs:1` |
| 9 | **CI/CD Deployment** | Automated zero-downtime deployment to InstaBox VM | Severe silent error swallowing (`\|\| true`, `2>/dev/null`), missing wake-up polling (`?wait=25s`), missing `migrate.mjs`, missing commit verification. | CRITICAL | Fix `.github/workflows/ci.yml` with long-polling, strict exit checks, migrations, and health commit verification. | `.github/workflows/ci.yml:41-74` |
| 10 | **Crawler SSOT Ingestion** | Crawlers and API ingest unified under `PinRepository.ingestPinsBatch` | Bypassed via comments (`keyword-velocity-crawler.mjs:1195`) to spoof Lock 3F; crawlers use raw SQL; `POST /api/internal/ingest` calls ad-hoc functions. | CRITICAL | Wire `PinRepository.ingestPinsBatch` in crawlers and `POST /api/internal/ingest`; harden Lock 3F. | `scripts/keyword-velocity-crawler.mjs:1195` |
| 11 | **Hydration Jump Conditions 2–6** | 6-condition anti-hydration spike algorithm active | Conditions 2–6 **omitted in executable code** (only Condition 1 ran). 1,693 contaminated snapshots in DB (up to 3,313 vel/day). | CRITICAL | Restore conditions 2–6 in `src/lib/math.mjs` and `fleet-router.mjs`. | `src/lib/math.mjs:40-44`; DB queries |

---

## 8. Adversarial Stress Gates (Execution Protocol for Fixes)

Before any phase of verified implementation is declared complete, the following 7 Adversarial Stress Gates must pass:

1. **Gate 1 (Asset & UI Tests Gate)**: `public/assets/aistudio/` contains exactly 0 PNG files. `node scripts/test_ui_architect_deliverables.mjs` and `node scripts/test_ui_v6_verification.mjs` pass 100% with exit code 0.
2. **Gate 2 (Fastify Native Runtime Gate)**: `package.json` contains `fastify`. `src/server.mjs` boots native Fastify without `node:http` fetch translation. `scripts/test_runtime_architect_v6.mjs` passes 100%. Measured health endpoint throughput increases by $\ge 30\%$.
3. **Gate 3 (CI/CD Deployment Integrity Gate)**: `.github/workflows/ci.yml` contains zero `|| true` or silent error swallowing on critical paths, implements `?wait=25s` wake-up polling, executes `scripts/migrate.mjs`, and asserts `/api/health` commit SHA.
4. **Gate 4 (Database Schema & Migration Gate)**: Duplicate migration prefixes eliminated. `scripts/migrate.mjs` runs with 0 collisions. `mv_pulse_24h_summary` exists in `pg_matviews` on live PostgreSQL and is queried by `src/modules/pulse/service.mjs`.
5. **Gate 5 (SSOT Ingestion & Lock 3F Hardening Gate)**: `scripts/keyword-velocity-crawler.mjs` actively invokes `PinRepository.ingestPinsBatch`. Comment spoofing removed. `POST /api/internal/ingest` invokes `PinRepository.ingestPinsBatch`. Crawlers import from `src/core/`.
6. **Gate 6 (Hydration Jump Algorithm Gate)**: Conditions 2 through 6 active in executable code in `src/lib/math.mjs` and `fleet-router.mjs`. Unit test validates all 6 conditions.
7. **Gate 7 (Static Parity & Line Count Gate)**: `npm run check` and `npm test` pass with zero errors and zero warnings. All 14 regression locks pass. Monolithic UI entry points reduced to cohesive coordinators.

---

## 9. Conclusion & Orchestrator Recommendations

The Adversarial Forensic Audit is **complete and unanimously approved** across all five specialized roles. The forensic evidence is indisputable.

We recommend advancing to **Phase 2: Implementation of Verified Fixes** structured into four sequential, verifiable milestones:
- **Milestone 1 (DB & Migrations)**: Migration renumbering, duplicate removal, `mv_pulse_24h_summary` creation and pulse service wiring.
- **Milestone 2 (Runtime & DevOps)**: Native Fastify integration, double Web-fetch bridge elimination, benchmark verification, `.github/workflows/ci.yml` hardening.
- **Milestone 3 (Crawlers & SSOT)**: Comment bypass elimination, `PinRepository.ingestPinsBatch` wiring, core client/parser consolidation, hydration jump conditions 2–6 restoration.
- **Milestone 4 (UI De-bloat & Assets)**: PNG asset cleanup, modularization of the 4 UI files into `src/ui/`, official line count verification.
- **Milestone 5 (Final Gate)**: Comprehensive verification across all 7 Adversarial Stress Gates.
