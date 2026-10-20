# Phase A Master Zero-Landmine Remediation Plan
> **Consolidated Target:** Pin Arbitrage Engine (PAE) — Phases 1 through 4  
> **Audits Synthesized:**  
> - Report 1: [`docs/audits/REPORT_1_FORENSIC_AUDIT_PHASES_1_4.md`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/docs/audits/REPORT_1_FORENSIC_AUDIT_PHASES_1_4.md) (Rating 4.2 / 10)  
> - Report 2: [`docs/audits/REPORT_2_FORENSIC_AUDIT_PHASES_1_4.md`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/docs/audits/REPORT_2_FORENSIC_AUDIT_PHASES_1_4.md) (Rating 4.5 / 10)  
> **Platform Physics Reference:** [`docs/references/CLOUDFLARE_WORKERS_AND_NEON_PLATFORM_LIMITS_REFERENCE.md`](file:///c:/Users/D.Mouad/Desktop/SaaS/pin-arbitrage-engine/docs/references/CLOUDFLARE_WORKERS_AND_NEON_PLATFORM_LIMITS_REFERENCE.md)  
> **Enforcement Rules:** `adversarial-audit.md`, `canonical-registry.md`, `project-invariants.md`, `neon-rules.md`

---

## 1. Executive Triangulation & Defect Consensus Matrix

Both forensic audits and live platform specifications confirm **five critical failure axes** currently threatening production stability:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              THE 5 DEFECT AXES IN PAE                                  │
├───────────────────────────────┬────────────────────────────────────────────────────────┤
│ 1. 4-Pillar Live Deep Sync    │ Non-existent SQL columns crash sync; math receives NaN │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ 2. Cache Invalidation Races   │ D1 async write-through races foreground delete         │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ 3. Hub Compaction Data Loss   │ Purging displaced pins without saving shard snapshots   │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ 4. Cloudflare 6-Conn Ceiling  │ 99-Shard scatter-gather queues in FIFO, tripping aborts│
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ 5. Pooler & Query Hardening   │ Hyperdrive pool leaks; SET lock_timeout lost in PgBouncer│
└───────────────────────────────┴────────────────────────────────────────────────────────┘
```

### Detailed Consensus Defect Register

| Defect ID | Severity | Root Cause File & Line | Platform Limit / Schema Collision | Consensus |
| :--- | :---: | :--- | :--- | :---: |
| **DEF-01** | **P0 Critical** | `src/routes/pins.mjs:330-391` | Queries non-existent columns (`catalog_rank`, `saves`, `pin_created_at`, `raw_metadata`, `last_crawled_at`). Throws Postgres 42703 or silently swallows updates. | **2/2 (100%)** |
| **DEF-02** | **P0 Critical** | `src/routes/pins.mjs:337` | `calculateDailyVelocity` called positionally instead of destructured options object; evaluates velocity to 0 on every live sync. | **2/2 (100%)** |
| **DEF-03** | **P0 Critical** | `src/routes/pins.mjs:444-458`, `src/worker.mjs:188-208` | `fetchUniversalPinDossier` queues async `ctx.waitUntil(d1Write)` racing `DELETE FROM edge_pins_metadata`; KV leaves keyword-scoped keys stale. | **2/2 (100%)** |
| **DEF-04** | **P1 High** | `scripts/optimize_hub_storage.mjs:91-242` | Deletes displaced pins from `keyword_serp_current` without writing final metrics/ranks to `pins_daily_metrics` and `pin_serp_positions`; omits `domain` column. | **2/2 (100%)** |
| **DEF-05** | **P1 High** | `src/modules/keywords/service.mjs:401-457` | `hydrateDisplacedIndexFromShards` fires unbounded `Promise.allSettled` to up to 99 shards, violating Cloudflare's 6-connection ceiling. | **2/2 (100%)** |
| **DEF-06** | **P1 High** | `src/worker.mjs:731-763` | `pSql.transaction` falls back to `Promise.all` without `BEGIN/COMMIT`; Hyperdrive connection pool soft limit risked with `max: 3`. | **2/2 (100%)** |
| **DEF-07** | **P1 High** | `scripts/migrations/035_displaced_index_domain.sql:3` | `SET lock_timeout` executed outside transaction block in PgBouncer transaction mode; discarded immediately. | **2/2 (100%)** |
| **DEF-08** | **P2 Medium** | `src/modules/cluster/service.mjs:313-316` | Unescaped regex characters (`+`, `*`, `(`, `[`) in `getTrueTypeaheadSuggestions` cause POSIX regex runtime crashes. | **2/2 (100%)** |
| **DEF-09** | **P2 Medium** | `src/modules/keywords/service.mjs:38-68` | D1 schema bootstrap latches `isReady = true` on failure; redundant `ALTER TABLE` executed on cold boots. | **2/2 (100%)** |

---

## 2. Wave 1: Phase A Engineering Remediation Blueprint

### Step 1: Implement Canonical `syncPinAcrossAllFourPillars` in `fleet-router.mjs`
* **Invariant:** `[INVARIANT: FOUR-PILLAR-SYNC-PARITY]`
* **Location:** `src/modules/sharding/fleet-router.mjs`
* **Specification:**
  1. Resolve shard connection via `getPinShardId(pinId, 99)`.
  2. Upsert `universal_master_pins` on target shard (deduplicated creative assets).
  3. Query `keyword_serp_current` on Hub using exact DDL columns (`save_count`, `created_at_pinterest`, `is_displaced`, `rank_position`).
  4. Compute velocity via `calculateDailyVelocity({ currentSaves, baselineSaves, currentDate, baselineDate })`.
  5. Upsert `pins_daily_metrics` and `pin_serp_positions` on target shard for today's snapshot.
  6. Update `keyword_serp_current` on Hub using canonical columns (`save_count`, `repin_count`, `comment_count`, `share_count`, `destination_url`, `metadata`, `daily_save_velocity`, `updated_at`).
  7. Update `competitor_pins` on Hub using canonical columns (`link_domain`, `save_count`, `repin_count`, `comment_count`, `metadata`, `updated_at`).
  8. Update `pa_pins` on Hub using canonical columns (`last_updated_at`, `saves`, `repins`, `comments`, `reactions`, `annotations`).
  9. Perform synchronous cache invalidation in order: Invalidate memory L0 $\rightarrow$ Evict D1 `edge_pins_metadata` $\rightarrow$ Evict KV keys (`dossier:pin:${pinId}`, `dossier:pin:${pinId}:${kid}`, `serp:comp:${kid}`, `traj:pin:${pinId}`).

### Step 2: Refactor `POST /api/pins/:id/sync` in `src/routes/pins.mjs`
* **Invariant:** Single Source of Truth (SSOT)
* **Changes:**
  - Remove all inline, duplicated, error-swallowing SQL updates.
  - Call the canonical `syncPinAcrossAllFourPillars({ hubSql: sql, pinId, scrapedPin: pin, env, ctx })`.
  - Return the refreshed dossier cleanly.

### Step 3: Eliminate D1 Write-Through vs Delete Race
* **Invariant:** `[INVARIANT: EDGE-EVICTION-TANDEM]`
* **Protocol:**
  - When `syncPinAcrossAllFourPillars` runs with `bypassEdgeCache: true`, ensure `fetchUniversalPinDossier` does NOT fire a background `ctx.waitUntil` to write stale metadata to D1.
  - The cache eviction (`DELETE FROM edge_pins_metadata WHERE pin_id = ?`) must execute and await *before* any new write-through occurs.

### Step 4: Correct Object Destructuring in `calculateDailyVelocity`
* **Invariant:** Anti-NaN Poisoning (`isFinite` guard)
* **Location:** `src/lib/math.mjs` & all callers.
* **Call Signature:**
  ```javascript
  const syncVelocity = calculateDailyVelocity({
    currentSaves: newSaves,
    baselineSaves: Number(prevRow?.save_count || 0),
    currentDate: new Date(),
    baselineDate: prevRow?.crawled_at ? new Date(prevRow.crawled_at) : null
  });
  ```

---

## 3. Wave 2: Phase B Hub Compaction & Data Safety

### Step 1: Prevent Data Loss in `scripts/optimize_hub_storage.mjs`
* **Invariant:** `[INVARIANT: ZERO-HUB-SNAPSHOTS]`
* **Changes:**
  - Before executing `DELETE FROM keyword_serp_current WHERE is_displaced = TRUE`, offload their state to the target shards:
    1. Upsert `universal_master_pins` on target shard.
    2. Upsert `pins_daily_metrics` (preserving `save_count`, `repin_count`, `daily_save_velocity`).
    3. Upsert `pin_serp_positions` (recording `keyword_id`, `rank_position = NULL`, `is_displaced = TRUE`, `last_known_rank`).
  - Add `domain` column to the `INSERT INTO keyword_displaced_index` query (aligning with Migration 035).

### Step 2: Fix PgBouncer Transaction Pooling in Migration 035
* **Location:** `scripts/migrations/035_displaced_index_domain.sql`
* **Changes:**
  - Wrap session variable configuration inside a transaction block:
    ```sql
    BEGIN;
    SET LOCAL lock_timeout = '3000';
    ALTER TABLE keyword_displaced_index ADD COLUMN IF NOT EXISTS domain VARCHAR(128);
    CREATE INDEX IF NOT EXISTS idx_kdi_domain ON keyword_displaced_index (domain) WHERE domain IS NOT NULL AND domain <> '';
    COMMIT;
    ```

---

## 4. Wave 3: Phase C Cloudflare Concurrency & Input Hygiene

### Step 1: Bounded Concurrency Limiter in `hydrateDisplacedIndexFromShards`
* **Platform Limit:** Cloudflare 6 Simultaneous Outgoing Connections Ceiling
* **Location:** `src/modules/keywords/service.mjs:401-457`
* **Changes:**
  - Implement a chunked concurrency limiter (`CONCURRENCY_LIMIT = 4`).
  - Increase per-shard timeout from 2,500ms to 6,000ms.
  - Chunk pins per shard to stay well within D1's 100 bound parameter limit ($\le 50$ parameters).

### Step 2: Harden Hyperdrive Client & Transaction Safety
* **Location:** `src/worker.mjs:731-763`
* **Changes:**
  - Configure Hyperdrive connection pool with `max: 1` per isolate.
  - Remove fake transactional fallback `Promise.all`: throw a descriptive invariant error if non-builder query arrays are passed to `pSql.transaction()`.

### Step 3: POSIX Regex Escaping in Cluster Service
* **Location:** `src/modules/cluster/service.mjs:313-316`
* **Changes:**
  - Sanitize user input by escaping all POSIX regular expression metacharacters (`[-[\]{}()*+?.,\\^$|#\s]`) before constructing `wordBoundaryRegex`.

---

## 5. Verification & Zero-Regression Protocol

Every change across Phases A, B, and C must pass:
1. `npm run check` (Dynamic AST syntax check + inline script check + UI route manifest + SQL schema parity + ESLint).
2. `npm test` (All 43 unit and integration test suites passing 100%).
3. Explicit verification that `POST /api/pins/:id/sync` executes cleanly against live Neon PostgreSQL Hub and Shard schemas without column errors or swallowed exceptions.
