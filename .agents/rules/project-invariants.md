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

## 12. Strict Internal Routing Credential Hygiene (ANTI-POISONING KV INVARIANT)
- **Zero Masked URLs in Internal KV:** The Workers KV key `'fleet:shards_map'` and all internal shard routing tables MUST strictly contain raw, unmasked PostgreSQL connection strings. Masking (`maskDatabaseUrl`) with Unicode bullets (`••••••••`) is reserved EXCLUSIVELY for client-facing JSON responses (`clientProjects`).
- **The ByteString Header Invariant:** `@neondatabase/serverless` communicates over HTTP by setting `headers: { "Neon-Connection-String": dsn }`. Non-ASCII characters (such as bullet `•` charCode 8226) or redacted placeholders cannot be converted to a ByteString in HTTP headers and will throw `NeonDbError: invalid header: neon-connection-string`, causing complete shard query failures and false 2-day fallback degradations.
- **Mandatory DSN Sanitization:** All connection strings read from KV or cache MUST be validated with `isValidShardDsn()` before invoking `neon()`. Any poisoned entry must be purged from KV immediately and reloaded from the Central Hub `neon_projects_registry`.
- **Array Format Parity:** Postgres `assigned_shards` can be returned as string `"{11}"` or array `[11]`. All routing checks MUST normalize with `normalizeAssignedShards()`.

## 13. Creator Hub Unified Architecture, Pinterest Naming & One-Way Promotion
- **Official Pinterest Business Analytics Parity:** Column headers and metrics MUST strictly align with official Pinterest Business terminology:
  - `Profile Views` ➡️ **`Impressions`** (mapped internally to `competitor_profiles.profile_views`).
  - `Monthly Reach` ➡️ **`Total audience`** (mapped internally to `competitor_profiles.monthly_reach`).
  - Subsystem Title: Strictly **`Creator Hub`** (never "Creator Intelligence & PinArchive").
- **Elimination of Redundant Abstractions:**
  - `Smart Topic Clusters` are permanently eradicated from the system.
  - Global `pa_qualification_rules` table is bypassed; **`competitor_profiles.metadata->'qualification_rules'`** is the single source of truth for qualification criteria.
  - `/accounts` renders the Creator Ledger directly; the 5 legacy KPI cards and 4 sub-tabs are permanently removed.
- **Strict One-Way Promotion Invariant:**
  - `competitor_pins` is the complete catalog inventory (~41k+ rows, compacted).
  - `pa_pins` is strictly an operational winner showcase for qualified pins (~2.3% of catalog).
  - Pins flow strictly in one direction: `competitor_pins` $\xrightarrow{\text{qualify}}$ `pa_pins`. Re-hydrating catalog pins back from `pa_pins` is strictly prohibited.

## 14. Hyperdrive Non-Blocking Drain Loop & Crawl Fencing (Wave 1 Invariant)
- **Non-Blocking Socket Drain:** Sockets must never block HTTP responses. `src/worker.mjs` must drain pending Hyperdrive promises iteratively up to a 26,000ms ceiling using `while (processedCount < store.bgPromises.length)` with guaranteed `clearTimeout(drainTimerId)` cleanup, delegated exclusively to `ctx.waitUntil(closePromise)` under the comment `// [INVARIANT: NON-BLOCKING-SOCKET-CLEANUP]`.
- **Crawl Lease Fencing & Heartbeat:** Crawl tasks must acquire a UUID fencing token and emit a heartbeat every 5 pages. Forced crawls (`force = true`) must be restricted to active leaseholders or expired leases (> 300s) to prevent concurrent split-brain crawling.
- **Shard-Affine Runner Partitioning:** Fleet crawlers must deterministically partition target shards using `(s - 1) % workerTotal === workerIndex % workerTotal`. Workers must only connect to their assigned subset of shards, capping peak fleet connections at 99 instead of 1,980.

## 15. SSOT Dossier Retrieval & confirmedPinIds Batch Commits (Wave 2 Invariant)
- **SSOT Dossier Wrapper:** `getPinDeepDossier` and `getPinDetailWithMetrics` must remain thin wrappers around `fetchUniversalPinDossier`, using Schema Projection Adapters to preserve UI and test contracts.
- **Atomic Batch Commits with Confirmation:** Batch shard writes via `writeBatchToDeterministicShards` must use `jsonb_to_recordset` and return `confirmedPinIds`. Only successfully confirmed pin IDs may be acknowledged or pruned from upstream processing queues.
- **KV Dual Trajectory Contract:** Edge KV caches storing pin trajectory must preserve the dual contract (`trajectory.snapshots = trajectory`). Deserialization layers must explicitly re-attach `.snapshots` to prevent breaking frontend chart components.

## 16. Database Acceleration: HOT Updates, Fillfactor 80 & Skeletal Compaction (Wave 3 Invariant)
- **PostgreSQL 100% HOT Updates:** Tables receiving high-frequency updates (`competitor_pins`, `keyword_serp_current`) must maintain `fillfactor = 80` and remain free of secondary indexes covering updated columns (such as `idx_cp_domain_rollup_covering`).
- **IEEE 802.3 Bitwise CRC32 Sharding:** All database triggers and functions computing shard IDs must use `pae_crc32_shard_id(pin_id, 99)`, strictly implementing IEEE 802.3 CRC32 polynomial `0xEDB88320` with 100% bit-for-bit parity to Node.js `@node-rs/crc32`. `hashtext()` is strictly prohibited.
- **Skeletal Compaction on Central Hub:** `competitor_pins` on Central Hub must store only numeric telemetry and identity references (`pin_id`, `competitor_id`, `board_name`, `save_count`, `repin_count`, `created_at_pinterest`). Large text and creative assets must reside exclusively on the 99 Storage Shards.

## 17. Edge Route Lazy Loading & Memory Shield (Wave 4 Invariant)
- **Dynamic Route Imports:** Static top-level page imports are prohibited in `src/routes/pages.mjs`. All HTML view renderers must be imported on demand via `await import(...)` inside the route handler to keep Worker isolate boot memory footprint under 5MB (saving 1.65MB per isolate).
- **Instant HEAD 200 OK:** Static page routes must return an immediate HTTP 200 OK on `HEAD` requests with standard headers, avoiding template execution and database queries.
- **Zero-Account-Sharding SSOT:** All competitor intelligence functions (`getFleetCompetitors`, `listCompetitors`, `getCompetitorsOverview`) query Central Hub directly. Never query or loop through Storage Shards for competitor profiles or boards.

## 18. Clock-Skew Immune Distributed Barrier Synchronization (Option B Invariant)
- **Elimination of Timestamp Math:** Multi-phase crawlers must never synchronize distributed runners using relative timestamp subtraction (`new Date(Date.now() - 300000)`). NTP clock drift and virtualization scheduling delays cause premature barrier collapses ($\Delta t < 0$) or permanent 60-second timeouts ($\Delta t > 0$).
- **Mandatory Logical State Tokens:** Phase barriers must be sealed with a unique logical token stamped in the database (`UPDATE tracked_keywords SET metadata = jsonb_set(metadata, '{phase1a_completed_token}', to_jsonb(${runToken}::text))`).
- **Explicit Run-ID Parameter Passing:** Runners must propagate `process.env.CRAWL_RUN_ID` or GitHub Run ID to guarantee barrier token parity across minute boundaries.

## 19. Shard-Affine Partitioning & Connection Cap (Anti-Blast Invariant)
- **The GCD Connection Blast Trap:** When partitioning tasks across $W$ workers and $S$ storage shards, if $\gcd(W, S) = 1$, random item hashing (`crc32(id) % W`) scatters work across all $S$ shards for every worker, generating $W \times S$ concurrent connections ($20 \times 99 = 1{,}980$ connections).
- **Mandatory Shard-Affine Slicing:** Workers must be assigned a fixed subset of shards: $S_w = \{s \in [1, 99] \mid (s - 1) \bmod W === w\}$. Each worker opens connections exclusively to its designated $\le \lceil S/W \rceil$ shards, capping fleet database connections to $S$ (99 connections, a 95% reduction).

## 20. PostgreSQL Error 21000 Map Deduplication in Batch Upserts
- **The Cardinality Landmine:** In multi-row batch upserts using `jsonb_to_recordset` with `ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE`, duplicate compound keys within the same payload trigger fatal `PostgreSQL Error 21000: ON CONFLICT DO UPDATE command cannot affect row a second time`.
- **Pre-Serialization Map Deduplication:** All payload rows must be deduplicated in-memory via `Map` keyed by target compound identifiers prior to JSON stringification, supported by database-level `DISTINCT ON` clauses.

## 21. PostgreSQL 100% HOT Updates & Zero Volatile Index Columns
- **The HOT Blocking Mechanism:** In PostgreSQL (`nbtinsert.c`), Heap-Only Tuple (HOT) updates are strictly forbidden if any modified column belongs to any secondary index on the table, even if the column is merely in an `INCLUDE` clause.
- **Volatile Column Ban:** Frequently updated counters (`save_count`, `daily_save_velocity`, `repin_count`) must NEVER be included in secondary indexes on operational tables (`keyword_serp_current`, `competitor_pins`, `keyword_displaced_index`).
- **Page Headroom:** Tables receiving continuous ingestion must maintain `fillfactor = 80`. Index maintenance scripts (`ensure_indexes.mjs`) must never re-create dropped covering indexes.

## 22. Active Core Pillar 1 (Cluster Graph) Absolute Defense
- **The Pillar 1 Invariant:** `scripts/cluster-intelligence.mjs`, `src/routes/cluster.mjs`, `src/modules/cluster/service.mjs`, and `.github/workflows/cluster-intelligence.yml` are permanent core infrastructure powering Seed Pin Cluster Graph, candidate graph nodes, and P2P Arbitrage.
- **Strict Distinction:** They must never be confused with deprecated PinArchive `Smart Topic Clusters` (`pa_topic_clusters_page`). Pillar 1 files and workflows are strictly protected against deletion.

## 23. SARGable SQL Queries & Optional B-Tree Filtering (User Directive 1)
- **Zero Expression Wrapping in WHERE:** Never wrap indexed columns in functions (`LOWER()`, `REGEXP_REPLACE()`, `TRIM()`). Always normalize search arguments in the application layer.
- **Optional Index Seeking:** When filtering on nullable criteria (e.g. `board_slug`), structure SQL predicates as:
  `AND (${cleanBoardSlug}::text IS NULL OR cp.board_slug = ${cleanBoardSlug})`
  This enables direct B-tree seeks when active while transparently returning all rows when omitted.
- **Single-Pass Window Counting:** Always use `COUNT(*) OVER()::int AS full_count` in paginated queries to eliminate separate expensive `COUNT(*)` round-trips.

## 24. Fail-Closed Edge Authentication & URL-Key Deprecation (SEC-01)
- **Fail-Closed in Production:** If `API_SECRET_KEY` is missing in production environments, `verifyApiAuthentication` must immediately reject all incoming requests with `503 Service Unavailable`.
- **URL Query-String Deprecation (CWE-598):** API keys passed via URL parameters (`?api_key=` or `?key=`) must be rejected with `401 Unauthorized` to prevent credential exposure in access logs and proxies. Authentication is strictly accepted via `x-api-key` or `Authorization: Bearer`.
- **Test Mode Exception:** Local test suites and benchmark scripts are safely exempted via strict `isTestOrLocalDev` inspection.

## 25. Localhost Loopback Binding & CSRF Session Shield (SEC-02)
- **IPv4 Loopback Binding:** Local development servers (such as `scripts/dashboard.mjs`) must bind exclusively to `127.0.0.1`, never wildcard `0.0.0.0`.
- **Strict Host & Origin Validation:** Reject requests with mismatched `Host` headers to prevent DNS rebinding attacks. Restrict CORS strictly to `http://localhost:3456` and `http://127.0.0.1:3456`.
- **Session CSRF Token:** Generate a cryptographically secure token on startup, inject it into the dashboard window context, and validate `x-csrf-token` on all browser-originated mutative POST requests.



