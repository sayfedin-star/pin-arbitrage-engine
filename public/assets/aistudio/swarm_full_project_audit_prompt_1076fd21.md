# 🐝 Swarm Master Prompt: Full Forensic Audit & Legacy Complexity Eradication (`pin-arbitrage-engine`)

> **كيفية الاستخدام:** انسخ النص الموجود داخل صندوق **`[PROMPT TO PASTE AFTER 🐝 swarm]`** أدناه بالكامل، والصقه مباشرةً بعد اختيار مهارة **`🐝 swarm`** في محرر الأكواد لديك. تم تصميم هذا البرومبت ليتوافق 100% مع قواعد مهارة `swarm` (`status`, `models`, `add`, `post_message`, `read_board`, `swarm_wait`) وليمنع أي تضارب في تعديل الملفات (`workspace: "share"` مع ملكية صارمة لكل ملف) مع الحفاظ التام على أقفال الفحص (`npm run check` و `npm test` و `npm run test:offline`).

---

## 📋 [PROMPT TO PASTE AFTER `🐝 swarm`]

```markdown
Run a coordinated multi-agent Swarm to perform a comprehensive line-by-line forensic audit and surgical cleanup of the entire `pin-arbitrage-engine` repository (post-Round 28, commit `a87b049b`).

### 🎯 Mission Objective
We have migrated to a **Unified Native VPS PostgreSQL 16 SSOT** (`DATABASE_TOPOLOGY = 'unified_postgres'` on InstaBox + Cloudflare Zero Trust Tunnel + `src/server.mjs`). While Round 28 patched 5 immediate execution landmines (`Landmines A–E`) by adding `if (isUnifiedPostgres(env))` guards, a forensic scan shows that **the legacy 99-virtual-shard / 20-physical-Neon-DB / Cloudflare D1-KV-Hyperdrive architecture was only short-circuited (`if (!isUnifiedPostgres(env))`), NOT removed**, and several routes/services still query `neon_projects_registry` directly without guards.

Your mission as Swarm Coordinator is to orchestrate a parallel forensic audit and surgical cleanup across the entire codebase (`src/`, `scripts/`, `workers/`, `.github/workflows/`) in two synchronized phases:
- **Phase 1 (Forensic Audit & Dependency Mapping — Read-Only / Zero Regressions):** Verify every remaining legacy complexity, dead code branch, unguarded `neon_projects_registry` query, redundant hover-warm ping, and regression-lock coupling across the repository.
- **Phase 2 (Surgical Eradication & Verification):** Neutralize and clean up all remaining legacy sharding/Neon/D1/KV/Hyperdrive complexities while updating `scripts/verify_regression_locks.mjs` and test suites in lockstep so that `npm run check`, `npm test`, and `npm run test:offline` pass with **0 errors and 0 warnings**.

---

### 🚨 Known Forensic Findings to Seed on the Board (`#general` / Area Channels)
Post these exact findings to the board immediately so workers start with pinpoint accuracy instead of scanning blindly:

1. **Unprotected `neon_projects_registry` Queries Still Live in Fleet Routes & Services:**
   - `src/routes/fleet.mjs` (lines 48–75): `GET /api/fleet/projects` and `GET /api/fleet/shards` still execute `SELECT ... FROM neon_projects_registry` directly without checking `isUnifiedPostgres(env)`.
   - `src/routes/fleet.mjs` (lines 77–91): `POST /api/fleet/projects` (`registerNewProject`) and `POST /api/fleet/sync` (`syncFleetDatabases`) still mutate/sync `neon_projects_registry` and enforce `*.neon.tech` hostnames (`src/modules/fleet/service.mjs` lines 35–270).
   - `src/modules/fleet/guardrails.mjs` (line 43): `auditFleetSchemaVersions(hubSql)` still queries `FROM neon_projects_registry WHERE status = 'active'`.
   - `src/worker.mjs` (lines 882–915): Still checks `shardKeyToDsn.get(cleanKey)` and houses the legacy `FROM neon_projects_registry` fallback block inside `else if (!isUnifiedPostgres(env))`.

2. **Monolithic Zombie Sharding Logic in `src/modules/sharding/fleet-router.mjs` (3,869 lines):**
   - `d1Record` dead code at lines 1205–1245 (`const d1Record = null; const d1UpdatedMs = parseD1DateMs(d1Record?.updated_at); const hasValidD1 = ...`).
   - Dead `else` branches after `if (isUnifiedPostgres(env))` in `preloadNeonRegistry` (lines 670–715), `resolveShardConnection` (lines 520–665), `writeBatchToDeterministicShards` (lines 3548–3620), and `batchGroupByShard` / `coalesceShardGroupsByPhysical`.
   - Audit which exported symbols in `fleet-router.mjs` are still imported by `src/`, `scripts/`, and `scripts/ test_*.mjs` so we simplify internal implementations to pure Unified Postgres fast-paths without breaking module imports.

3. **Dead `!isUnifiedPostgres(env)` Shard Hydration Loops in Core Services:**
   - `src/modules/keywords/service.mjs` (lines 139–175, 374–410, 2323): Multi-shard fan-out loops sitting behind `!isUnifiedPostgres(env)` (Note: check `scripts/verify_regression_locks.mjs` Lock 7 at line 318 which regex-checks `/!isUnifiedPostgres\(\s*env\s*\)/` in `src/modules/keywords/service.mjs`!).
   - `src/modules/keywords/folders-service.mjs` (lines 2670–2710): Legacy Tier-3 20-shard loop in `_executeFolderCrossover`.
   - `src/modules/pulse/service.mjs`, `src/modules/creators/service.mjs` (5,439 lines), `src/modules/domains/service.mjs` (3,130 lines), and `src/modules/cluster/service.mjs` (1,005 lines): Audit for any residual shard-loop overhead, duplicate query round-trips, or `[INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]` legacy shims.

4. **Crawlers, Maintenance Scripts & CI Workflows (`scripts/` & `.github/workflows/`):**
   - `scripts/crawler-engine.mjs` (lines 217, 313, 739, 2211–2245), `scripts/keyword-velocity-crawler.mjs` (lines 1518, 1563), `scripts/creator-velocity-crawler.mjs` (lines 168, 269), `scripts/keyword-fleet-consolidator.mjs` (line 511), `scripts/optimize_hub_storage.mjs` (lines 130, 398), and `scripts/backfill_rolling_window_gains.mjs` (line 360): Verify that all crawler and maintenance scripts execute 100% against the single unified PostgreSQL connection with zero shard-loop deadweight or `NEON_SHARD_DSN_TEMPLATE` fallbacks.

5. **Client-Side Hover Shard-Warming & Edge Wake Shield (`src/edge-shield-client.mjs`, `src/routes/fleet.mjs`, `workers/wake-shield/`):**
   - `src/edge-shield-client.mjs` (imported into `dashboard-ui.mjs`, `keywords-ui.mjs`, `domains-ui.mjs`, `discovery-ui.mjs`, `campaign-folders-ui.mjs`, `pin-details-ui.mjs`) triggers `/api/fleet/warm` on hover to wake sleeping Neon shards. In Unified VPS Postgres mode, verify whether `/api/fleet/warm` should be a lightweight no-op / health check instead of running shard-coalescing logic (`src/routes/fleet.mjs` lines 160–240).
   - `workers/wake-shield/src/index.mjs` (lines 18–19): Inspect hardcoded fallback `MACHINE_ID` and `DEFAULT_PIN = 'pae2026'` and verify security posture and env-var overrides.

6. **Regression Locks & Test Suite Coupling (`scripts/verify_regression_locks.mjs` & `scripts/test_*.mjs`):**
   - Any modification to `fleet-router.mjs`, `src/modules/keywords/service.mjs`, or `src/edge-shield-client.mjs` MUST respect or cleanly update `scripts/verify_regression_locks.mjs`, `scripts/verify_sql_schema_parity.mjs`, and the 21 test suites in `npm test` + 13 suites in `npm run test:offline`.

---

### 🏗️ Swarm Architecture & Coordinator Execution Plan

Follow the `swarm` coordinator protocol strictly:
1. Call `swarm(action: "status")` and `swarm(action: "models")` first.
2. Title the swarm: `swarm(action: "title", title: "PAE Unified Postgres Forensic Audit & Cleanup")`.
3. Create 5 focused channels on the message board via `post_message` (`#sharding-core`, `#backend-services`, `#crawlers-scripts`, `#ui-edge-security`, `#verification-locks`) and post the relevant forensic targets into each channel.
4. Spawn **non-colliding workers** with strict file-ownership boundaries (`workspace: "share"` so edits apply to the shared working tree without git worktree merge conflicts, and **never assign the same file to two workers**):

#### 👥 Worker Roster & Strict File Ownership Boundaries

- **Worker 1 (`router-fleet-auditor`) — Channel: `#sharding-core`**
  - **Exclusive File Scope:** `src/modules/sharding/fleet-router.mjs`, `src/modules/fleet/service.mjs`, `src/modules/fleet/guardrails.mjs`, `src/routes/fleet.mjs`, `src/worker.mjs`.
  - **Task:**
    1. Guard `GET /api/fleet/projects`, `GET /api/fleet/shards`, `POST /api/fleet/projects`, `POST /api/fleet/sync` in `src/routes/fleet.mjs` and `getFleetProjects` / `syncFleetDatabases` / `auditFleetSchemaVersions` in `src/modules/fleet/` with `isUnifiedPostgres(env)` so Unified VPS mode returns clean single-hub status without querying `neon_projects_registry` or enforcing `*.neon.tech` URLs.
    2. Clean up `d1Record` dead code (lines 1205–1245) and unreachable legacy shard routing branches in `src/modules/sharding/fleet-router.mjs` and `src/worker.mjs` (lines 882–915) while preserving all exported function signatures required by callers and tests.
    3. Post a complete summary of every changed function and line range to `#sharding-core`.

- **Worker 2 (`services-auditor`) — Channel: `#backend-services`**
  - **Exclusive File Scope:** `src/modules/keywords/service.mjs`, `src/modules/keywords/folders-service.mjs`, `src/modules/keywords/analytics.mjs`, `src/modules/keywords/trends-service.mjs`, `src/modules/keywords/visual-lens-cache.mjs`, `src/modules/pulse/service.mjs`, `src/modules/creators/service.mjs`, `src/modules/domains/service.mjs`, `src/modules/domains/ad-network-service.mjs`, `src/modules/cluster/service.mjs`, `src/routes/keywords.mjs`, `src/routes/creators.mjs`, `src/routes/domains.mjs`, `src/routes/pins.mjs`, `src/routes/cluster.mjs`.
  - **Task:**
    1. Audit all service and route modules for any remaining multi-shard hydration loops, redundant database round-trips, or unguarded legacy fallbacks.
    2. Streamline the `!isUnifiedPostgres(env)` shard loops in `src/modules/keywords/service.mjs` and `src/modules/keywords/folders-service.mjs` (keeping compatibility with `scripts/verify_regression_locks.mjs` Lock 7 or coordinating with Worker 5).
    3. Verify that all SQL queries in `creators`, `domains`, `pulse`, `cluster`, and `keywords` run optimally against the single Unified PostgreSQL database with zero N+1 shard queries.
    4. Post findings and exact edits to `#backend-services`.

- **Worker 3 (`crawlers-ops-auditor`) — Channel: `#crawlers-scripts`**
  - **Exclusive File Scope:** `scripts/crawler-engine.mjs`, `scripts/keyword-velocity-crawler.mjs`, `scripts/creator-velocity-crawler.mjs`, `scripts/cluster-intelligence.mjs`, `scripts/account-related-crawler.mjs`, `scripts/keyword-fleet-consolidator.mjs`, `scripts/optimize_hub_storage.mjs`, `scripts/backfill_rolling_window_gains.mjs`, `scripts/vps-scheduler.mjs`, `scripts/migrate.mjs`, `.github/workflows/`.
  - **Task:**
    1. Audit every crawler, consolidator, scheduler, and GitHub Actions workflow to confirm 100% Unified VPS PostgreSQL execution with zero `neon_projects_registry` queries, zero `NEON_SHARD_DSN_TEMPLATE` leaks, and zero 20-shard fan-out loops.
    2. Simplify dead `!isUnifiedPostgres()` branches in `scripts/crawler-engine.mjs`, `scripts/keyword-velocity-crawler.mjs`, `scripts/creator-velocity-crawler.mjs`, `scripts/keyword-fleet-consolidator.mjs`, and `scripts/optimize_hub_storage.mjs`.
    3. Post findings and exact edits to `#crawlers-scripts`.

- **Worker 4 (`ui-edge-security-auditor`) — Channel: `#ui-edge-security`**
  - **Exclusive File Scope:** `src/edge-shield-client.mjs`, `src/server.mjs`, `src/dashboard-ui.mjs`, `src/keywords-ui.mjs`, `src/domains-ui.mjs`, `src/campaign-folders-ui.mjs`, `src/pin-details-ui.mjs`, `src/pulse-ui.mjs`, `src/discovery-ui.mjs`, `src/ui/`, `workers/wake-shield/src/index.mjs`, `wrangler.toml`.
  - **Task:**
    1. Audit `src/edge-shield-client.mjs` and UI files to ensure hover prewarming and API fetch wrappers do not spam unnecessary shard-warming requests in Unified VPS mode while keeping `safeApiFetch`, `apiFetch`, and `getEdgeShieldClientScript` exports intact for `test_p2_verification.mjs` and `test_jit_warming_and_d1_trajectory.mjs`.
    2. Audit `workers/wake-shield/src/index.mjs` and `src/server.mjs` for security, hardcoded secret fallbacks, and clean Cloudflare Tunnel / InstaBox health-check integration.
    3. Verify that UI topology labels and diagnostics consistently reflect `Unified Central Hub` / `UNIFIED HUB SSOT` rather than legacy 20-shard Neon labels.
    4. Post findings and exact edits to `#ui-edge-security`.

- **Worker 5 (`verifier-and-lock-guardian`) — Channel: `#verification-locks`**
  - **Exclusive File Scope:** `scripts/verify_regression_locks.mjs`, `scripts/verify_sql_schema_parity.mjs`, `scripts/test_*.mjs`, `.agents/rules/lessons-learned-ledger.md`.
  - **Task:**
    1. Act as independent Verifier across Workers 1–4 (`read_board` across `#sharding-core`, `#backend-services`, `#crawlers-scripts`, `#ui-edge-security`).
    2. Run the full verification suite:
       - `npm run check` (`verify_all_syntax.mjs`, `validate_inline_scripts.mjs`, `verify_ui_routes_reorganization.mjs`, `verify_sql_schema_parity.mjs`, `npm run lint`, `verify_dom_nesting.mjs`, `verify_regression_locks.mjs`)
       - `npm test` (all 21 test suites)
       - `npm run test:offline` (all 13 offline adversarial suites)
       - `node scripts/audit_ui.mjs`
    3. If any regression lock or legacy test fails due to dead-code removal, either align the test/lock to the Unified Postgres SSOT invariant or report the exact discrepancy to the owning worker to fix immediately.
    4. Record Round 29 in `.agents/rules/lessons-learned-ledger.md` documenting the full Swarm audit and complexity eradication.

- **Auxiliary Agents (if role models are available in `swarm(action: "models")`):**
  - Spawn `narrator` (`role: "narrator"`) and `monitor` (`role: "monitor"`) to track progress and wake stalled workers.

---

### ✅ Definition of Done (Strict Exit Gate)
Do NOT close the swarm until:
1. Every worker has posted its final forensic report and diff summary to its channel.
2. `Worker 5 (verifier-and-lock-guardian)` confirms on `#verification-locks` that:
   - `npm run check` exits with `0` (0 errors, 0 warnings, all locks PASS).
   - `npm test` exits with `0` (21/21 suites PASS).
   - `npm run test:offline` exits with `0` (13/13 suites PASS).
   - `grep -rn "FROM neon_projects_registry" src/` has zero unguarded occurrences in active Unified Postgres execution paths.
3. Synthesize a clear executive report in Arabic summarizing:
   - What legacy complexities & hidden traps were found across the repository.
   - What was surgically cleaned up vs. what compatibility exports were intentionally retained for regression locks.
   - Final verification results across all test and lint suites.
```
