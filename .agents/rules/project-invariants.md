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

## 26. User Search Casing Preservation vs. Database SARGability (UI Invariant)
- **Display vs. Query Separation:** While database queries MUST normalize search arguments (`normalizeKeyword()`, `normalizeCleanDomain()`) to ensure SARGable index seeking, the user interface and drawer contracts MUST preserve the user's authentic casing in breadcrumbs, filter badges, and drawer titles.
- **Contract Parity:** Never mutate or lowercase the display property of a keyword or entity when returning it to the frontend.

## 27. Fast-Path Empty-Match Contract Integrity (API Invariant)
- **Zero-Match Structural Contract:** When an endpoint query yields 0 results (e.g. newly discovered keyword, unranked domain, empty filter), the response MUST return the complete expected schema contract (e.g. `{ overview: { total: 0, ...defaults }, items: [] }`).
- **Ban on Naked Empty Arrays:** Never return a bare array `[]` or `null` from an endpoint that normally returns an object container (`{ overview, domains }`), as this causes frontend destructuring and template property access to crash.

## 28. Anti-Hydration-Spike & Symmetrical Velocity Ratchet Invariant
- **The Hydration Spike Trap:** Pins discovered in Stage 0 SERPs start with `save_count = 0` (or null baseline). When deep closeup hydration discovers 100k+ lifetime saves, calculating `currentSaves - 0` treats lifetime saves as a 1-day delta, hitting the 25,000 ceiling.
- **Mandatory 0-Baseline Guard (`[INVARIANT: ANTI-HYDRATION-SPIKE]`):** Never compute a daily velocity delta if `baseline_day_saves = 0` or if the pin was unhydrated prior to the crawl (`isHydrationJump`). Lifetime saves must be amortized across pin age or suppressed to 0 until an authentic Day-2 crawl differential exists.
- **Symmetric Velocity Updates:** Monotonic clamps like `GREATEST(COALESCE(MAX(daily_save_velocity), 0), ...)` are strictly prohibited. Daily save velocity must update symmetrically downward when save activity slows or ceases.

## 29. Dossier Rollup Decoupling & Read-Path Mutation Shield
- **The Read-Path Mutation Hazard:** Dossier drawer endpoints optimize response times by bounding query result sets (e.g. `displacedLimit = 30`).
- **Strict Decoupling:** Bounded/paginated dossier read paths (`getDomainDeepDossier`) MUST NEVER trigger full-entity rollup mutations (`syncSingleDomainRollup`). Global rollups belong strictly to complete post-crawl aggregations or surgical single-column updates (WHOIS age, ads.txt). Opening or closing a drawer/dossier must leave leaderboard metrics 100% invariant.

## 30. Multi-Room Campaign Workspace & Popstate URL Preservation
- **SSR Room Architecture:** Campaign folder rooms (`/folders/:id`, `/folders/:id/keywords`, `/folders/:id/creators`, `/folders/:id/domains`) MUST reuse canonical studio UI modules (`campaign-folders-ui.mjs`, `keywords-ui.mjs`, `dashboard-ui.mjs`, `domains-ui.mjs`) scoped by `folderId`.
- **Central Hub Relational Invariant:** Folder item mappings (`folder_competitor_items`, `folder_pinned_domains`) reside exclusively on Central Hub with single-pass zero-Cartesian CTEs (< 5ms SLA). Heavy pin snapshots remain on 99 storage shards.
- **Popstate Preservation (`[INVARIANT: FOLDER-SCOPED-POPSTATE-PRESERVATION]`):** Detail drawer URLs opened within a folder sub-route MUST preserve the `/folders/:id/*` route prefix. Browser Back/Forward (`popstate`) must never eject the operator into global routes.

## 31. Universal Strict Time Formatting Rule
- **Standardized Display Rule:**
  - If duration/age is $\ge 365\text{ days}$: display strictly in **years only** (e.g. `11.2y`, `2.1y` — NEVER show days in parentheses).
  - If duration/age is $< 365\text{ days}$: display strictly in **days only** (e.g. `145d`).
- **Universal Parity:** Apply this rule uniformly across tables, cards, drawer headers, and Pin Dossier trajectories via `formatUniversalAge()`.

## 32. Room 1–5 Sibling DOM Hierarchy & Unclipped Workspace Header
- **Direct Sibling Isolation:** In `src/campaign-folders-ui.mjs`, Room 5 (`x-show="currentRoom === 'settings'"`) MUST remain a direct sibling of Room 1 (`x-show="currentRoom !== 'settings'"`), enclosed exclusively within VIEW A (`x-show="activeFolderId"`). Room 5 must never be nested inside Room 1, preventing conflicting Alpine visibility evaluations.
- **Unclipped Header Geometry:** In `src/ui/campaign-workspace-header.mjs`, the outer workspace header container (`.rounded-2xl`) must NEVER specify `overflow-hidden` or `overflow-x-hidden`. Workspace headers house floating relative/absolute elements (such as the folder switcher dropdown and export menus) that must render unobstructed with zero pixel clipping.

## 33. Universal Shard-Affine SQL Pushdown (Neon Egress Shield)
- **Zero Whole-Table Scans across Distributed Runners:** Distributed fleet runners (such as `scripts/creator-velocity-crawler.mjs`) MUST NEVER query full Hub tables (`pa_pins`, `competitor_pins`) into Node.js memory to filter by assigned shards.
- **Mandatory Storage Shard Predicates:** All runner queries against `pa_pins` and `competitor_pins` must push shard filtering down to the database engine via stored generated `shard_id` (`WHERE shard_id = ANY(${assignedShards}::smallint[])`), utilizing physical B-tree indexes (`idx_pa_pins_shard_id`, `idx_competitor_pins_shard_id`) to eliminate 95% of egress transfer.
- **CRC32 Shard Function Parity:** All shard-assignment and partitioning logic in SQL queries must use canonical `pae_crc32_shard_id(pin_id, 99)`. Bob Jenkins' `hashtext` is strictly banned.

## 34. Authentic Rolling Multi-Window Gains (Anti-Linear-Multiplier Invariant)
- **Ban on Linear Extrapolation:** Multi-window velocity gains (`delta_repins_24h`, `gains_5d`, `gains_7d`, `gains_10d`, `gains_15d`) MUST NEVER be synthesized via linear multiplication (`Math.round(vel * 7)`).
- **Physical Column Pre-Computation:** Central Hub tables (`keyword_serp_current`, `keyword_displaced_index`) maintain physical rolling window columns populated from authentic historical shard snapshots via scheduled fleet crawlers.
- **Crossover & Rollup Wiring:** `_executeFolderCrossover` in `src/modules/keywords/folders-service.mjs` must project `row.gains_7d` directly, and wire `top_creators: creatorMonopoly` with joined `competitor_profiles` audience deltas so cluster rollup bars display authentic growth deltas instead of static zeroes.

## 35. Lightweight SERP Business Creator Pulse
- **Fast-Path Profile Monitoring:** Auto-discovered ranking creators linked from SERPs default to `tracking_mode = 'pulse_only'`. Crawler loops (`scripts/creator-velocity-crawler.mjs`, `scripts/crawler-engine.mjs`) MUST bypass pin harvesting, board crawling, and `pa_pins` reconciliation for pulse-only accounts.
- **24h & 7d Metric Deltas:** Profile syncs update `competitor_profiles` with authentic daily deltas (`delta_reach_24h`, `delta_views_24h`, `reach_delta_7d`, `views_delta_7d`, `pins_delta_7d`, `boards_delta_7d`) derived from `competitor_history_snapshots`, consuming less than 1 KB per account without database bloat.
- **Room 3 Discovery Parity:** The Creator Hub UI (`src/dashboard-ui.mjs`) must preserve `creatorDiscoveryFilter` ('all', 'tracked', 'auto_discovered') and display auto-discovered creators with custom label badges (`SERP Auto • ...`) and delta telemetry.

## 36. Context-Preserving Pin Dossier Navigation & Untracked Creator Guard
- **Explicit Provenance Propagation:** Pin links generated in Campaign Folders (`src/campaign-folders-ui.mjs`) and Domain Studio (`src/domains-ui.mjs`) must append origin context parameters (`?folder_id=...&folder=...&return_url=...` or `?domain=...`).
- **4-Tier Context Resolution:** `src/pin-details-ui.mjs` inspects URL parameters (Tier 1), `sessionStorage` (Tier 2), and same-origin `document.referrer` (Tier 3, supporting `/folders`, `/domains`, and `/keywords`).
- **Untracked Competitor Shield:** Tier 4 fallback in `src/pin-details-ui.mjs` must strictly verify `creatorCtx?.is_tracked_competitor === true`. Guest-scraped creators must never set `originSource = 'creator'`.
- **Ghost Board Execution Prevention:** In `src/dashboard-ui.mjs`, all `openCreatorByHandle(...).then(...)` callbacks MUST guard with `if (!this.activeCreator) return;` to prevent opening 404 ghost boards when navigating to untracked creator routes.

## 37. Defensive D1 Coalescence & Epoch Cache Coherency
- **Defensive D1 Count Coalescence:** `syncFolderToD1` in `src/worker.mjs` must use `COALESCE(excluded.creator_count, edge_campaign_folders.creator_count)` and `COALESCE(excluded.unique_pins_count, edge_campaign_folders.unique_pins_count)`. Incoming undefined counts must never overwrite D1 edge caches with `0`.
- **Global Epoch Invalidation:** Edge caches for folder crossover and creator listings are namespaced with `fleet:cache_epoch` in Workers KV (`fep:${epoch}:folder:${id}:*`). Scheduled crawler consolidators invalidate all Cloudflare edge PoPs globally via authenticated `POST /api/fleet/cache-invalidate`.
- **Full Catalog Guard:** `syncKeywordsCatalogToD1` must only prune obsolete records when `options.isFullCatalog === true` is explicitly provided, never defaulting to full catalog based on arbitrary array lengths (`keywords.length >= 20`).
- **Cache Eviction v3 Parity:** `getPinKvKeysToEvict` must purge both v1/v2 and active v3 dossier keys (`pin:dossier:v3?pin_id=...`, `dossier:v3:pin:...`).

## 38. Daily Multi-Window Rolling Gains Automation & Shard Ingestion Parity (Lock 8)
- **Mandatory Workflow Step (`[INVARIANT: ROLLING-GAINS-WORKFLOW-AUTOMATION]`):** The daily GitHub Actions crawling workflow (`.github/workflows/keyword-intelligence-velocity.yml`) MUST execute `node scripts/backfill_rolling_window_gains.mjs` in Stage 2 (`consolidate` job) immediately following `keyword-fleet-consolidator.mjs` and prior to edge fleet cache invalidation. Execution must be guaranteed (with `if: always()` or unconditional workflow sequencing) so newly ranked pins never suffer from stale or null multi-window rolling telemetry (`gains_5d`, `gains_7d`, `gains_10d`, `gains_15d`, `delta_repins_24h`).
- **Deterministic Shard Partitioning & Shard Fallback:** Backfill calculations map pins to their designated Neon Storage Shards using canonical `getPinShardId(pin_id, 99)` / `pae_crc32_shard_id`. In ingestion queries or fallback handlers where a legacy or unpartitioned row lacks a computed `shard_id`, systems MUST use `COALESCE(shard_id, 1)` or fallback to `pae_crc32_shard_id(pin_id, 99)` to prevent null-pointer dereferences or omitted shard queries, ensuring zero dropped rows during shard history collection.
- **Anti-Hydration Suppression Invariant (`[INVARIANT: ANTI-HYDRATION-SPIKE]`):** Multi-window gain computation must evaluate `isMultiStageHydrationJump(bestSnap, latest)`. Any transition where baseline saves are 0 or unhydrated while current saves are large must be suppressed to 0, ensuring authentic day-over-day save deltas without artificial inflation.

## 39. Time-Window Synchronized Audience Gains & Zero-Floor Clamping (Lock 9)
- **Dynamic Time-Window Synchronization (`[INVARIANT: DYNAMIC-WINDOW-AUDIENCE-GAINS]`):** In `src/campaign-folders-ui.mjs`, the Cluster Rollup KPI metric `Competitor Gains` computed via `clusterCompetitorAudienceGains` MUST dynamically respond to the user's active `selectedTimeWindow` state (`'24h'`, `'5d'`, `'7d'`, `'10d'`, `'15d'`, `'all'`). The getter must dynamically project metric properties from `top_creators` (`delta_reach_24h`, `reach_delta_7d`, `delta_audience_30d`, or proportional window extrapolations like `Math.round((d7 / 7) * windowDays)`) rather than reading a static 30-day reach delta.
- **Mandatory Zero-Floor Clamping (`Math.max(0, val)`):** Pinterest algorithmic fluctuations and audience churn frequently produce temporary negative 24h deltas for individual creator profiles. When aggregating cluster-wide competitor audience expansion across multiple ranking creators, individual creator gains MUST be clamped with `Math.max(0, val)` before summing (`return sum + Math.max(0, val)`). This prevents a single creator's transient negative reach drop from zeroing out or corrupting the collective positive momentum of the entire cluster.
- **Reactive UI Header Binding:** The KPI card header must reflect the active window label dynamically (e.g. `x-text="'Competitor Gains (' + selectedTimeWindow + ')'"`), preserving full visual clarity for the operator.

## 40. Room 3 Single-Creator SERP Track Fallback & Pulse Default (Lock 10)
- **Unindexed Handle & Synthetic ID Resolution (`[INVARIANT: SERP-CREATOR-FALLBACK-RESOLUTION]`):** In Campaign Folder Room 3 (`Creator Hub`), auto-discovered SERP creators are presented before they are indexed as tracked competitors in `competitor_profiles`, generating synthetic IDs (such as `'serp_<username>'` or `null` `competitor_id`). In both edge routes (`src/routes/keywords.mjs`) and local dev servers (`scripts/dashboard.mjs`), `POST /api/folders/:id/creators` and `DELETE /api/folders/:id/creators` MUST inspect the incoming payload: if `competitor_id` is non-numeric or starts with `serp_`, the endpoints MUST cleanly strip the `^serp_` prefix and fallback to resolving the creator by `username` via `toggleFolderCreatorTracking(sql, folderId, cleanUsername)`. Never cast raw string handles directly to integer (`Number('serp_...')` $\rightarrow$ `NaN`), which results in silent SQL failures or 400 Bad Request errors.
- **Lightweight Pulse Tracking Default (`tracking_mode = 'pulse_only'`):** Newly auto-tracked creators promoted from SERP auto-discovery into `competitor_profiles` MUST default to lightweight pulse tracking: `tracking_mode = 'pulse_only'`, `discovery_source = 'serp_auto'`, `discovered_from_folder_id = ${fid}`, and `metadata = jsonb_build_object('profile_pulse_only', true)`. This prevents unintended full catalog sweeps (500 pages of pins/boards) for serendipitous SERP creators, preserving database storage, egress limits, and crawler runtime.
- **Delete Resolution & Cache Eviction:** Unlinking or untracking unindexed creators via `DELETE /api/folders/:id/creators` must resolve `id FROM competitor_profiles WHERE LOWER(username) = LOWER(${cleanUsername})` and invoke `invalidateFolderCache(folderId)` to guarantee edge cache coherence.

## 41. Domain Studio Deep-Link Hydration, BigInt Cast Parity & Breakout Auto-Promotion (Locks 11 & 12)
- **Cross-Studio Deep-Link Hydration (`[INVARIANT: ACCOUNTS-DEEPLINK-HYDRATION]`):** When navigating from Domain Studio (`src/domains-ui.mjs`) or sidebar links to `/accounts` with query parameters (`?creator=...`, `?username=...`, `?untracked=1`, `?search=...`, `?action=track`), `initDashboard()` in `src/dashboard-ui.mjs` MUST parse `window.location.search` via `new URLSearchParams(...)`. If `action === 'track'` or `action === 'new'`, it must open the Add Competitor modal with the target handle prefilled (`this.openAddCompetitorModal()`, `this.newCompetitorHandle = targetCreator`). If a target handle is supplied without action, it must immediately load the creator dossier via `this.openCreatorByHandle(targetCreator, 'overview', false)` without dead-ending on a blank accounts ledger.
- **BigInt Cast Parity (Anti-Truncation Invariant):** High-volume Pinterest aggregate metrics (`saves`, `repins`) frequently exceed PostgreSQL 32-bit signed integer limits (`2,147,483,647`). In `scripts/crawler-engine.mjs` and all crawler ingestion queries, casts to `::int` on saves or repins are strictly prohibited. Ingestion queries MUST strictly cast `COALESCE(x.saves, 0)::bigint` and `COALESCE(x.repins, 0)::bigint` (and in `GREATEST(cp.save_count, x.saves::bigint)`) to maintain 100% bit-for-bit parity with `scripts/creator-velocity-crawler.mjs` and prevent integer overflow exceptions (SQLSTATE 22003).
- **Breakout Auto-Promotion Engine (`[INVARIANT: AUTO-PROMOTE-PULSE-BREAKOUT]`):** In `scripts/creator-velocity-crawler.mjs`, lightweight `pulse_only` creators are continuously evaluated during Phase 1 profile syncs against breakout thresholds: `AUTO_PROMOTE_PULSE_DELTA_24H` (default: `25,000`) and `AUTO_PROMOTE_PULSE_DELTA_7D` (default: `100,000`). If `delta_reach_24h >= 25000` OR `reach_delta_7d >= 100000`, the crawler must automatically promote the creator (`UPDATE competitor_profiles SET tracking_mode = 'full', custom_label = COALESCE(NULLIF(custom_label, ''), 'Breakout Auto-Promoted'), metadata = ... || jsonb_build_object('profile_pulse_only', false, 'auto_promoted_at', NOW()::text, 'auto_promote_reason', 'reach_breakout')`). The crawler immediately sets `isPulseOnly = false` for that run so the creator's boards and fresh winning pins are harvested in the same pass.
- **Zero-Sort Composite Shard Indexes (Migration 041):** Shard-affine queries filtering by `shard_id` and sorting by saves or ID must be supported by composite B-tree indexes defined in `scripts/migrations/041_composite_shard_indexes.sql`: `idx_pa_pins_shard_saves_desc ON pa_pins (shard_id, saves DESC NULLS LAST)` and `idx_competitor_pins_comp_shard_id_asc ON competitor_pins (competitor_id, shard_id, id ASC)`. This eliminates expensive in-memory sort nodes and disk spills on heavy multi-runner queries.
- **Campaign Studio Arbitrage Alpha Filters:** In `src/campaign-folders-ui.mjs`, Room 1 supports rapid arbitrage filtering via `onlyBreakoutBabyDomains` (`domain_age_days <= 730 && gains_7d >= 15`) and `onlyVacuumPins` (`(!domain || domain === 'Uploaded by user') && save_count >= 100`) to expose high-ROI unmonetized traffic vacuums.

## 42. Hidden Endpoints Parity, 1200x Media Waterfall, Deep UTM/Entity Sanitization & LND-801..824 Shields (Lock 14)
- **Batch 50-Pin Pidgets Extraction (`fetchPinsBatchFromPidgets`):** Scrapers chunk arbitrary pin IDs into slices of at most 50 IDs per subrequest querying `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=...`. Saves are extracted from `aggregated_pin_data.aggregated_stats.saves` (with `repin_count` fallback), HD images are derived via path rewrite to `/1200x/`, titles fall back to story or rich metadata (never overwriting non-empty existing DB titles), and omitted IDs are indexed as `{ pin_id, is_missing: true }` without throwing 404s.
- **Deep URL Canonicalization & Global Saves Counter (`sanitizeDestinationUrl` & `canonicalizeArticleUrlForCount`):** Destination URLs querying `https://api.pinterest.com/v1/urls/count.json` MUST be pre-cleaned: HTML entities are decoded (`&amp;` -> `&`), fragments are stripped (`parsed.hash = ''`), and tracking / WordPress plugin parameters (`utm_*`, `fb_*`, `tp_*`, `pin_*`, `amp;*`, `ref`, `fbclid`, `gclid`, `epik`, `srsltid`, `_ga`, `mc_*`, `igshid`) are purged. This eliminates the 100% false-zero failure rate caused by uncanonicalized URL strings. JSONP callbacks (`receiveCount({...})`) are parsed safely via regular expression.
- **Creator Visual Stream & RSS pubDate Fusion (`fetchCreatorLatestPinsPidgets`):** Pin visual streams query Pidgets (50 hydrated pins) and `feed.rss` (25 pins with exact `<pubDate>`) in parallel via `Promise.allSettled`, fusing creation dates and save counts in `<350ms`. User objects must be marked `has_official_reach: false` so callers NEVER overwrite official `monthly_reach` or `profile_views` with zeroes.
- **Board Sections & Shortlink Direct Inspection:** Subsections and section pin counts are extracted via `BoardSectionsResource` using canonical `getPinterestXhrHeaders` (including `X-Requested-With: XMLHttpRequest` and `sec-ch-ua`). Shortlinks (`pin.it/:slug`) are resolved via direct HTTP redirect inspection against `url_shortener/:slug/redirect/` parsing `Location: /pin/(\d+)/` in `<170ms` without headless browsers.
- **Universal Anti-Hydration Delta Guard (`LND-801`):** In `src/lib/math.mjs` and `src/modules/keywords/service.mjs`, all batch-enriched pins must calculate velocity via `calculateDailyVelocity`. Transitions from `baseline === 0` to positive saves, or unhydrated records (`wasDeepHydrated === false && curSaves >= 30` or `prevSaves < 10 && curSaves >= 100`), are flagged by `detectHydrationJump` and suppressed to 0 or amortized across age, preventing Day-1 spikes.
- **Compaction, Fillfactor 70 & Serialized Row Locking (`LND-810`, `LND-811`, `LND-812`):** Central tables receiving continuous high-frequency updates (`keyword_serp_current`, `keyword_displaced_index`, `competitor_pins`) maintain `fillfactor = 70` (Migration 042) to reserve page space for 100% Heap-Only Tuple (HOT) updates. Ingestion upserts enforce `ORDER BY u.pin_id ASC` to prevent `SQLSTATE 40P01` deadlocks, and `SELECT DISTINCT ON (cp.pin_id)` to prevent `SQLSTATE 21000` duplicate row conflicts.
- **Defensive Multi-Window Rolling Gains Coalescence (`LND-802`):** `scripts/backfill_rolling_window_gains.mjs` updates `keyword_serp_current` and `keyword_displaced_index` using `COALESCE(NULLIF(u.gains_5d, 0), ksc.gains_5d)` (and across `7d`, `10d`, `15d`), and absorbs shard connection exceptions without zeroing out authentic historical gains.
- **Edge Subrequest & D1 Batch Discipline (`LND-805`, `LND-815`, `LND-817`, `LND-818`):** Folder cache purges invalidate global PoPs via `fleet:cache_epoch` increments rather than multi-thousand key loops; floating D1 synchronization promises are wrapped in `safeWaitUntil(ctx, ...)`; D1 `.batch()` statements are chunked to `<= 100` statements; and `edge_pins_metadata` automatically prunes entries older than 14 days via SQLite triggers and LRU indexing.
- **Frontend Safety & Responsive Cockpit Ergonomics (`LND-806`, `LND-807`, `LND-813`, `LND-814`, `LND-821`, `LND-823`):** High-volume data tables (Displaced Pins, Competitor Intelligence) enforce client-side windowed pagination (`pageSize = 25/50`) to prevent DOM freezing. Data fetching routines attach `AbortController` and sequence counters (`_loadReqSeq`) to drop stale responses. Cross-studio navigations hydrate `window.location.search` (`?q=...`, `?domain=...`, `?creator=...`) in `init()` inside headless guards. Modal dialogs enforce clean English SaaS microcopy with zero legacy Arabic strings.
