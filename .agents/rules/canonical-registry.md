---
trigger: always_on
---

# Pin Arbitrage Engine (PAE) Canonical Function & Routing Registry

> **Purpose:** Single Source of Truth (SSOT) defining the mandatory canonical functions and routing protocols across PAE.
> **Enforcement Rule:** AI Agents and developers MUST use these exact functions. Creating duplicate or competing query flows for the operations below is strictly prohibited.

---

## 1. Universal Shard Resolution & Routing

| Entity | Canonical Routing Function | Primary Location | Authority / Schema |
| :--- | :--- | :--- | :--- |
| **Pin Records (`universal_master_pins`)** | `getPinShardId(pinId, 99)` | `src/modules/sharding/fleet-router.mjs` | Neon Storage Shard `(crc32(pin_id) % 99) + 1` |
| **Pin Daily Metrics (`pins_daily_metrics`)** | `getPinShardId(pinId, 99)` | `src/modules/sharding/fleet-router.mjs` | Neon Storage Shard `(crc32(pin_id) % 99) + 1` |
| **Pin SERP History (`pin_serp_positions`)** | `getPinShardId(pinId, 99)` | `src/modules/sharding/fleet-router.mjs` | Neon Storage Shard `(crc32(pin_id) % 99) + 1` |
| **Active SERP (`keyword_serp_current`)** | `keyword_id` direct index | `src/modules/keywords/service.mjs` | Central Neon Hub |
| **Displaced Index (`keyword_displaced_index`)** | `(keyword_id, pin_id)` composite index | `src/modules/keywords/service.mjs` | Central Neon Hub (Numeric + Domain only) |
| **Tracked Creators (`competitor_profiles`)** | `id` or `username` natural key | `src/modules/creators/service.mjs` | Central Neon Hub |
| **Creator Qualified Winners (`pa_pins`)** | `pin_id` natural key | `src/modules/creators/service.mjs` | Central Neon Hub (Physical table, Qualified Pins only) |

---

## 2. Canonical Business Logic Functions

### A. Pin Synchronization (The 4-Pillar Live Deep Sync)
* **Canonical Function:** `syncPinAcrossAllFourPillars({ hubSql, pinId, scrapedPin, env, ctx })`
* **File Location:** `src/modules/sharding/fleet-router.mjs`
* **Callers:**
  - `POST /api/pins/:id/sync` (`src/worker.mjs`)
  - `GET /api/pins/:id` manual deep sync (`src/worker.mjs`)
  - `getPinDeepDossier` (`src/modules/keywords/service.mjs`)
  - `scripts/keyword-velocity-crawler.mjs`
* **Mandatory Execution Steps:**
  1. Upsert `universal_master_pins` on target shard `getPinShardId(pinId, 99)`.
  2. Upsert `pins_daily_metrics` on target shard for today's snapshot.
  3. Update `keyword_serp_current` on Hub (including `daily_save_velocity`).
  4. Update `competitor_pins` on Hub (if tracked competitor pin).
  5. Update `pa_pins` on Hub (if qualified winning pin).
  6. Execute cache evictions in order: Invalidate memory L0 -> Evict KV -> Purge D1 `edge_pins_metadata`.

### B. Pin Dossier & Trajectory Retrieval
* **Universal Pin Dossier:** `fetchUniversalPinDossier({ hubSql, pinId, ctx, env, bypassEdgeCache })`
  - Location: `src/modules/sharding/fleet-router.mjs`
  - Protocol: Reads D1/KV first -> falls back to Shard `universal_master_pins` -> decorates with active SERP & competitor status from Hub.
* **Pin Historical Trajectory:** `fetchPinTrajectoryFromShard({ shardSql, pinId, timeframe })`
  - Location: `src/modules/sharding/fleet-router.mjs`
  - Rule: Queries `pins_daily_metrics` and `pin_serp_positions` on the Shard. MUST NEVER query the Hub for snapshots.

### C. Atomic Multi-Statement Transactions
* **Hyperdrive & Neon HTTP Pattern:**
  ```javascript
  const builders = [
    (db) => db`INSERT INTO keyword_displaced_index ...`,
    (db) => db`DELETE FROM keyword_serp_current ...`
  ];
  if (typeof sql.begin === 'function') {
    // Hyperdrive TCP (postgres.js) - sequential single-connection execution
    await sql.begin(async (tx) => { for (const b of builders) await b(tx); });
  } else if (typeof sql.transaction === 'function') {
    // Neon Serverless HTTP - atomic transaction batch
    await sql.transaction(builders.map(b => b(sql)));
  }
  ```

### D. Safe Edge Prefetch Handler
* **Protocol:**
  ```javascript
  if (searchParams.get('prefetch') === 'true') {
    // [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]
    // 1. Return immediately from Cloudflare D1 or KV edge cache (< 3ms)
    // 2. NEVER trigger live Pinterest scraping (bgEnrichPromise)
    // 3. NEVER wake up sleeping Shard databases
    return await getFastEdgeDossier(pinId, env);
  }
  ```

### E. Creator Hub Operations & Synchronization
* **Quick Pulse (Profile-Level Sync ~3s):** `quickPulseCreator({ sql, competitorId, env, ctx })`
  - Fetches live creator profile metadata, followers, Impressions, and Total audience without crawling pins.
* **Deep Harvest (Full Catalog Sweep ~30s):** `deepHarvestCreator({ sql, competitorId, env, ctx, options })`
  - Uses in-process worker pool (`p-limit(4)`) to crawl feed + profile pins, upserts into `competitor_pins`, evaluates qualification, and executes one-way promotion to `pa_pins`.
* **One-Way Qualified Pin Promotion:** `reconcileQualifiedCatalogPins({ sql, competitorId, options })`
  - Single authority evaluating `competitor_pins` against `competitor_profiles.metadata->'qualification_rules'` and upserting into `pa_pins`.

---

## 3. Disallowed Anti-Patterns & Prohibitions

1. ❌ **Direct Snapshot Writes to Hub:** `INSERT INTO keyword_pins_snapshots` or `INSERT INTO pa_pin_metrics` on Hub.
2. ❌ **Snapshot Reads from Hub:** `SELECT * FROM pa_pin_metrics` or `SELECT * FROM keyword_pins_snapshots`.
3. ❌ **Unbounded Scatter-Gather:** `Promise.all(shards.map(...))` without concurrency limiter.
4. ❌ **Raw Promise Array in Hyperdrive Transactions:** `sql.transaction([sql`...`, sql`...`])`.
5. ❌ **Delete / Update on Views:** `DELETE FROM pins_daily_snapshots` (violates migration 033 View DDL).
6. ❌ **BigInt Double Truncation:** `Number(snapshotId)` for 60-bit snowflake IDs (exceeds 53-bit `Number.MAX_SAFE_INTEGER`).
7. ❌ **The View Upsert Ban:** Converting physical tables that receive `INSERT ... ON CONFLICT` (`pa_pins`, `competitor_pins`, `keyword_serp_current`) into PostgreSQL `VIEW`s. PostgreSQL rejects conflict arbitration on views.
8. ❌ **Bi-Directional Pin Hydration:** Re-hydrating `competitor_pins` from `pa_pins` (`autoHydrateCompetitorPinsFromArchive`). Promotion is strictly one-way (`competitor_pins` ➡️ `pa_pins`).
