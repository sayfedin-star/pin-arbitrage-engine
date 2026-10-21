---
trigger: always_on
---

# Pin Arbitrage Engine (PAE) Permanent Architectural Invariants

Refer to `PROJECT_CHARTER_AND_DIRECTIVES.md` for full context. The following rules are PERMANENT, IMMUTABLE, and MUST NEVER BE VIOLATED across any conversation, task, or refactor:

## 1. Strict Unauthenticated / Guest Scraping Invariant (NO LOGGED-IN COOKIES)
- **Zero Logged-In User Cookies:** Pin details (`fetchPinFromPinterest`) MUST NEVER use authenticated cookies (`_auth=1`). Authenticated user cookies cause Pinterest to replace public aggregate counters (total saves/repins) with current-viewer state zeroes (`saves: 0`).
- **Guest Session Fingerprinting:** Queries must run strictly as unauthenticated / guest sessions (`_auth=0` or zero login cookies) while sending complete browser headers (`priority: "u=0, i"`, `upgrade-insecure-requests: 1`, `accept`, `accept-language`, modern desktop `User-Agent`).
- **SSR & PinResource Fallback:** Extract pin metadata from embedded SSR JSON (`__PWS_DATA__`) and use `PinResource/get/?data=...` as a fast fallback.
- **Deep 48-Field Extraction:** Always preserve carousel detection (`method === 'carousel'`), affiliate/arbitrage links (`utmLink`, `trackedLink`), and real-time creator audience (`closeupUnifiedAttribution.followerCount`).

## 2. Neon Serverless Distributed Sharding (Hub vs 99 Shards)
- **Central Hub Authority:** Stores active keyword state (`tracked_keywords`), real-time SERP rankings (`keyword_serp_current`), monitored competitors (`competitor_pins`), and PinArchive (`pa_pins`).
- **99 Storage Shards Authority:** Houses `universal_master_pins` and all historical time-series snapshots (`pins_daily_metrics`, `pin_serp_positions`). Handled exclusively via `fleet-router.mjs`.
- **Zero Historical Writes to Hub:** Never write historical daily snapshots directly into the Central Hub in application code.

## 3. Four-Pillar Sync Parity (Live Deep Sync)
- Any pin refresh or live sync MUST synchronously update all applicable pillars:
  1. `universal_master_pins` on the designated Storage Shard.
  2. `keyword_serp_current` on the Central Hub.
  3. `competitor_pins` on the Central Hub (if pin belongs to a tracked competitor).
  4. `pa_pins` on the Central Hub (if pin is archived in PinArchive).
  5. `pins_daily_metrics` on the Shard, with today's snapshot preserving reaction count and velocity.

## 4. Edge Caching & D1/KV Eviction Integrity
- **D1 Stale Ghosting Prevention:** `fleet-router.mjs` caches pin metadata in Cloudflare D1 `edge_pins_metadata` for 12 hours. Any live sync MUST execute:
  `DELETE FROM edge_pins_metadata WHERE pin_id = ?` on D1 immediately to ensure subsequent page refreshes do not display stale data.
- **KV SERP Eviction:** Evict `serp:comp:${kid}` from `PIN_ENGINE_KV` alongside individual dossier keys (`dossier:pin:*`, `traj:pin:*`).

## 5. Defensive SQL & UI Resiliency
- **Anti-22007 Timestamp Guard:** Never pass empty strings `""` to PostgreSQL `::timestamptz`. Sanitize dates with `safeIsoDate()` or pass explicit `null`.
- **No Error Swallowing on DDL/DML:** Never swallow SQL syntax or non-existent column errors with `.catch(() => {})`. All database operations must log errors explicitly.
- **UI AbortSignal Protection:** All frontend mutation fetches MUST use `AbortSignal.timeout(15000)` and check `res.ok` before decoding JSON to survive 502/504 errors cleanly.

## 6. Absolute Zero-Snapshot Hub Invariant (NO SNAPSHOT WRITES OR READS ON HUB)
- **Zero Snapshot Writes to Central Hub:** Application code MUST NEVER insert or update historical daily snapshots (`keyword_pins_snapshots`, `pa_pin_metrics`) on the Central Hub. All daily time-series metrics belong exclusively to the 99 Storage Shards (`pins_daily_metrics`, `pin_serp_positions`).
- **Zero Snapshot Reads from Central Hub:** All trajectory graphs, PinArchive velocity charts, and historical rank queries MUST read exclusively from the Storage Shards via deterministic `(crc32(pin_id) % 99) + 1` or D1/KV edge cache.
- **Hub Operational State Only:** The Hub is strictly an ultra-slim operational state catalog ($\le 25\text{ MB}$). `keyword_displaced_index` stores numeric indicators + `domain VARCHAR(128)` ONLY; it MUST NEVER store creative metadata (`title`, `image_url`, `description`).

## 7. Single-Operator & Safe Prefetching (NO BACKGROUND LIVE CRAWLS ON HOVER)
- **Single-Operator Profile:** The platform is engineered for a single operator ($\le 6$ hours/day). All databases must scale to zero after 5 minutes of inactivity.
- **Safe Hover Prefetch:** `mouseover` prefetching in `edge-shield-client.mjs` MUST be served strictly from Cloudflare D1 / KV cache in $< 3\text{ms}$.
- **Prefetch Live Crawl Ban:** `GET /api/pins/:id` MUST inspect `searchParams.get('prefetch') === 'true'`. When true, it MUST NEVER trigger background live Pinterest scraping (`bgEnrichPromise`) and MUST NEVER wake up Shard databases.

## 8. Hyperdrive Atomic Query Builders (NO RAW PROMISE.ALL TRANSACTIONS)
- **Lazy Query Builders:** In `postgres.js`, raw query promises `sql\`...\`` created outside a transaction execute against the connection pool. To guarantee single-connection atomic execution, all multi-statement transactions MUST use Lazy Query Builders:
  ```javascript
  const builders = [
    (db) => db`INSERT INTO ...`,
    (db) => db`DELETE FROM ...`
  ];
  if (typeof sql.begin === 'function') {
    await sql.begin(async (tx) => { for (const b of builders) await b(tx); });
  } else if (typeof sql.transaction === 'function') {
    await sql.transaction(builders.map(b => b(sql)));
  }
  ```

## 9. Cloudflare Edge & Subrequest Concurrency Shield
- **Pagination Required:** Displaced pin listings and historical SERP tables must paginate at $\le 30$ pins per page. Never request 150 pins in a single unbounded burst.
- **Concurrency Semaphore:** Any scatter-gather hydration from Shards must be capped at $\le 4$ parallel connections with `AbortSignal.timeout(2000)`.
- **D1 Read-Through:** D1 `edge_pins_metadata` must always be consulted first. Shard queries are executed only for cache misses, with results lazily backfilled to D1.

## 10. Mandatory In-Code Explanatory Comments (INVARIANT TAGGING)
- **The "WHY" Requirement:** Every modified or created function, transaction, and query MUST include explanatory in-line comments detailing the architectural rationale.
- **Invariant Tags:** Critical code blocks must be preceded by standardized uppercase invariant tags:
  - `// [INVARIANT: ZERO-HUB-SNAPSHOTS]`
  - `// [INVARIANT: DETERMINISTIC-CRC32-SHARDING]`
  - `// [INVARIANT: HYPERDRIVE-ATOMIC-BUILDER]`
  - `// [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]`
- **Preserve Existing Documentation:** Never wipe or strip existing docstrings or inline comments during refactoring.

## 11. Public Repository & Distributed Fleet Scaling Invariants
- **Public Repo Unlimited Actions:** The repository `sayfedin-star/pin-arbitrage-engine` is 100% PUBLIC. GitHub Actions runner minutes are completely FREE and UNLIMITED. Never warn about or factor in Action minutes depletion.
- **Intelligent 20-Runner Pin Partitioning:** Mode B (`single-keyword`) slices whatever pin volume is requested (50 to 5,000 pins) dynamically and deterministically across the 20 isolated Azure runner VMs (`crc32(pin_id) % 20 === workerIndex`).
- **Re-Crawl Button Cloudflare Edge Boundary:** The `Re-Crawl` button in the UI table row is strictly designated for fast, immediate Cloudflare Edge SERP discovery (< 2s). The 20-runner fleet pipeline is preserved for daily scheduled deep sweeps and explicit bulk operations.

