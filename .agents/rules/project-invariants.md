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

## 2. Unified Single-DB PostgreSQL Architecture (Local VPS SSOT)
- **Single-Database Authority:** Active runtime topology is `DATABASE_TOPOLOGY = "unified_postgres"`. All keyword state (`tracked_keywords`), real-time SERP rankings (`keyword_serp_current`), displaced vault (`keyword_displaced_index`), monitored competitors (`competitor_pins`), PinArchive (`pa_pins`), master pin catalog (`universal_master_pins`), and time-series tables (`pins_daily_metrics`, `pin_serp_positions`) reside in a single unified PostgreSQL database managed via `src/db/client.mjs` and `src/modules/pins/repository.mjs`.
- **Single-Pass Reads & Writes:** Never fan out 20–99 parallel shard connections when `isUnifiedPostgres()` is active. Use bounded single-pass queries and `jsonb_to_recordset` batch upserts.

## 3. Four-Pillar Sync Parity (Live Deep Sync)
- Any pin refresh or live sync MUST synchronously update all applicable pillars:
  1. `universal_master_pins` (Central SSOT catalog).
  2. `keyword_serp_current` (active keyword SERP rankings).
  3. `competitor_pins` (if pin belongs to a tracked competitor).
  4. `pa_pins` (if pin is archived in PinArchive).
  5. `pins_daily_metrics` (with today's snapshot preserving reaction count and velocity).

## 4. In-Memory Edge Caching & Invalidations Integrity
- **Stale Ghosting Prevention:** Live pin syncs and mutations must invalidate L0 in-memory edge caches cleanly via `invalidateEdgeCache` / cache epoch bumps so subsequent page refreshes do not display stale data.
- **No Cloudflare D1/KV Bindings:** Legacy Cloudflare D1 (`PIN_D1_DB`), Workers KV (`PIN_ENGINE_KV`), and Hyperdrive (`HYPERDRIVE`) bindings are permanently retired.

## 5. Defensive SQL & UI Resiliency
- **Anti-22007 Timestamp Guard:** Never pass empty strings `""` to PostgreSQL `::timestamptz`. Sanitize dates with `safeIsoDate()` or pass explicit `null`.
- **No Error Swallowing on DDL/DML:** Never swallow SQL syntax or non-existent column errors with `.catch(() => {})`. All database operations must log errors explicitly.
- **UI AbortSignal Protection:** All frontend mutation fetches MUST use `AbortSignal.timeout(15000)` and check `res.ok` before decoding JSON to survive 502/504 errors cleanly.

## 6. Clean Separation Between Operational SERP State & Historical Time-Series
- **Normalized Storage:** Operational SERP state (`keyword_serp_current`) and displaced summaries (`keyword_displaced_index`) stay lean while historical time-series belong to normalized `pins_daily_metrics` and `pin_serp_positions` (`keyword_pins_snapshots` is a read-only compatibility `VIEW`, Migration `051`; never `DELETE`, `INSERT`, or `VACUUM` it).
- **Clean Repository Layer:** Route `universal_master_pins`, `pins_daily_metrics`, and `pin_serp_positions` mutations through `src/modules/pins/repository.mjs`.

## 7. Single-Operator & Safe Prefetching (NO BACKGROUND LIVE CRAWLS ON HOVER)
- **Single-Operator Profile:** The platform is engineered for a single operator.
- **Safe Hover Prefetch:** `mouseover` UI hooks in `edge-shield-client.mjs` must never flood backend scrape endpoints.
- **Prefetch Live Crawl Ban:** `GET /api/pins/:id` MUST inspect `searchParams.get('prefetch') === 'true'`. When true, it MUST NEVER trigger background live Pinterest scraping (`bgEnrichPromise`).

## 8. Atomic Query Builders (NO RAW PROMISE.ALL TRANSACTIONS)
- **Lazy Query Builders:** In `postgres.js`, raw query promises `sql\`...\`` created outside a transaction execute against the connection pool. To guarantee single-connection atomic execution, all multi-statement transactions MUST use Lazy Query Builders inside `sql.begin(...)` or `sql.transaction(...)`.

## 9. Subrequest & Concurrency Shield
- **Pagination Required:** Displaced pin listings and historical SERP tables must paginate cleanly (`<= 30`–`50` pins per page) rather than unbounded bursts.
- **Bounded Pool:** PostgreSQL connections use `PG_POOL_MAX` (`2`–`4` in GitHub Actions CI, `10`–`15` on server) with `SQLSTATE 53300` exponential-backoff + jitter retry in `src/db/client.mjs`.

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

## 12. Strict Connection Hygiene & Credential Safety
- **Zero Masking Leaks & Zero Hardcoded DSNs:** Masked URLs (`maskDatabaseUrl` with Unicode bullets) are strictly for UI display only. Production scripts must read `process.env.DATABASE_URL` directly and never embed fallback passwords or DSN literals.
- **Array Format Parity:** Normalize PostgreSQL array fields safely in helpers.

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

## 14. Non-Blocking Fastify Execution & Crawl Fencing (Wave 1 Invariant)
- **Non-Blocking Task Queue:** Long-running background tasks in Fastify (`src/server.mjs`) use `serverBackgroundTaskQueue` (`p-limit(4)`) and bounded timeouts in `src/worker.mjs` so HTTP responses never stall on background cleanup.
- **Crawl Lease Fencing & Heartbeat:** Crawl tasks must acquire a UUID fencing token and emit a heartbeat every 5 pages. Forced crawls (`force = true`) must be restricted to active leaseholders or expired leases (> 300s) to prevent concurrent split-brain crawling.

## 15. SSOT Dossier Retrieval & confirmedPinIds Batch Commits (Wave 2 Invariant)
- **SSOT Dossier Wrapper:** `getPinDeepDossier` and `getPinDetailWithMetrics` must remain thin wrappers around `fetchUniversalPinDossier` / `getPinDossier`, using Schema Projection Adapters to preserve UI and test contracts.
- **Atomic Batch Commits with Confirmation:** Batch writes via `writeBatchToDeterministicShards` / `repository.mjs` must use `jsonb_to_recordset` and return `confirmedPinIds`.

## 16. Database Acceleration: HOT Updates & Fillfactor (Wave 3 Invariant)
- **PostgreSQL 100% HOT Updates:** Tables receiving high-frequency updates (`competitor_pins`, `keyword_serp_current`, `keyword_displaced_index`) must maintain `fillfactor` headroom (`70`–`80`) and remain free of secondary indexes covering updated volatile counters.

## 17. Dynamic Route Imports & Single-DB Creator Queries (Wave 4 Invariant)
- **Dynamic Route Imports:** Static top-level page imports are prohibited in `src/routes/pages.mjs`. All HTML view renderers must be imported on demand via `await import(...)` inside the route handler.
- **Instant HEAD 200 OK:** Static page routes must return an immediate HTTP 200 OK on `HEAD` requests with standard headers, avoiding template execution and database queries.
- **Zero-Account-Sharding SSOT:** All competitor intelligence functions (`getFleetCompetitors`, `listCompetitors`, `getCompetitorsOverview`) query PostgreSQL directly without fan-out shard loops.

## 18. Clock-Skew Immune Distributed Barrier Synchronization (Option B Invariant)
- **Elimination of Timestamp Math:** Multi-phase crawlers must never synchronize distributed runners using relative timestamp subtraction (`new Date(Date.now() - 300000)` or `< runStartTime`).
- **Mandatory Logical State Tokens:** All Phase 1A barriers (Folder Mode, Mode A, Mode B) must be sealed with a unique logical token (`UPDATE tracked_keywords SET metadata = jsonb_set(..., '{phase1a_completed_token}', to_jsonb(${runToken}::text))`) and polled via `(metadata->>'phase1a_completed_token') IS DISTINCT FROM ${runToken}`.
- **Explicit Run-ID Parameter Passing:** Runners propagate `process.env.CRAWL_RUN_ID` or `GITHUB_RUN_ID` to guarantee barrier token parity across minute boundaries.

## 19. Deterministic PostgreSQL Runner Partitioning (`MD5` Modulo)
- **Zero Legacy Shard Columns:** Following Migration `052`, `shard_id` columns and `pae_crc32_shard_id()` are dropped. Distributed runners partition pin workloads directly in PostgreSQL using `MOD(ABS(('x' || SUBSTR(MD5(pin_id::text), 1, 8))::bit(32)::int), workerTotal) = workerIndex`.

## 20. PostgreSQL Error 21000 Map Deduplication in Batch Upserts
- **The Cardinality Landmine:** In multi-row batch upserts using `jsonb_to_recordset` with `ON CONFLICT DO UPDATE`, duplicate keys within the same payload trigger fatal `PostgreSQL Error 21000: ON CONFLICT DO UPDATE command cannot affect row a second time`.
- **Pre-Serialization Map Deduplication:** All payload rows must be deduplicated in-memory via `Map` keyed by target unique identifiers prior to JSON stringification, supported by SQL `DISTINCT ON` clauses and deterministic ordering (`ORDER BY pin_id ASC`).

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

## 33. Unified Clean Schema SARGable Domain & Index Pushdown
- **SARGable `clean_domain` Index Seeks:** All pin/domain tables (`keyword_serp_current`, `keyword_displaced_index`, `universal_master_pins`, `competitor_pins`, `pa_pins`) maintain indexed `clean_domain` columns synchronized via `pae_sync_clean_domain()` (Migrations `052`, `053`, `057`). Never wrap `domain` in `LOWER(TRIM(...))` inside hot lookup `WHERE` clauses.
- **Partitioning Parity:** Use PostgreSQL native `SUBSTR(MD5(pin_id::text), 1, 8)` modulo slicing for parallel runner pin batches (`shard_id` / `pae_crc32_shard_id` are dropped).

## 34. Authentic Rolling Multi-Window Gains (Anti-Linear-Multiplier Invariant)
- **Ban on Linear Extrapolation:** Multi-window velocity gains (`delta_repins_24h`, `gains_5d`, `gains_7d`, `gains_10d`, `gains_15d`) MUST NEVER be synthesized via linear multiplication (`Math.round(vel * 7)`).
- **Physical Column Pre-Computation:** Central operational tables (`keyword_serp_current`, `keyword_displaced_index`, `universal_master_pins`) maintain physical rolling window columns populated from authentic historical snapshots (`pins_daily_metrics`) via scheduled fleet crawlers.
- **Crossover & Rollup Wiring:** `_executeFolderCrossover` in `src/modules/keywords/folders-service.mjs` must project `row.gains_7d` directly, and wire `top_creators: creatorMonopoly` with joined `competitor_profiles` audience deltas so cluster rollup bars display authentic growth deltas instead of static zeroes.

## 35. Lightweight SERP Business Creator Pulse
- **Fast-Path Profile Monitoring:** Auto-discovered ranking creators linked from SERPs default to `tracking_mode = 'pulse_only'`. Crawler loops (`scripts/creator-velocity-crawler.mjs`) MUST bypass pin harvesting, board crawling, and `pa_pins` reconciliation for pulse-only accounts.
- **24h & 7d Metric Deltas:** Profile syncs update `competitor_profiles` with authentic daily deltas (`delta_reach_24h`, `delta_views_24h`, `reach_delta_7d`, `views_delta_7d`, `pins_delta_7d`, `boards_delta_7d`) derived from `competitor_history_snapshots`.
- **Room 3 Discovery Parity:** The Creator Hub UI (`src/dashboard-ui.mjs`) must preserve `creatorDiscoveryFilter` ('all', 'tracked', 'auto_discovered') and display auto-discovered creators with custom label badges (`SERP Auto • ...`) and delta telemetry.

## 36. Context-Preserving Pin Dossier Navigation & Untracked Creator Guard
- **Explicit Provenance Propagation:** Pin links generated in Campaign Folders (`src/campaign-folders-ui.mjs`) and Domain Studio (`src/domains-ui.mjs`) must append origin context parameters (`?folder_id=...&folder=...&return_url=...` or `?domain=...`).
- **4-Tier Context Resolution:** `src/pin-details-ui.mjs` inspects URL parameters (Tier 1), `sessionStorage` (Tier 2), and same-origin `document.referrer` (Tier 3, supporting `/folders`, `/domains`, and `/keywords`).
- **Untracked Competitor Shield:** Tier 4 fallback in `src/pin-details-ui.mjs` must strictly verify `creatorCtx?.is_tracked_competitor === true`. Guest-scraped creators must never set `originSource = 'creator'`.
- **Ghost Board Execution Prevention:** In `src/dashboard-ui.mjs`, all `openCreatorByHandle(...).then(...)` callbacks MUST guard with `if (!this.activeCreator) return;` to prevent opening 404 ghost boards when navigating to untracked creator routes.

## 37. Defensive Count Coalescence & Epoch Cache Coherency
- **Defensive Folder Count Coalescence:** Folder metadata sync helpers must coalesce nullable counts rather than overwriting existing values with `0` on partial updates.
- **Standalone MV & Cache Refresh:** Consolidators refresh `mv_pulse_24h_summary` concurrently outside transaction blocks (`SQLSTATE 25001` safe) and hit `POST /api/fleet/cache-invalidate` with InstaBox wake-up active (`skip-wakeup: 'false'`).

## 38. Daily Multi-Window Rolling Gains Automation & Anti-Hydration Parity (Lock 8)
- **Mandatory Workflow Step (`[INVARIANT: ROLLING-GAINS-WORKFLOW-AUTOMATION]`):** The daily GitHub Actions crawling workflow (`.github/workflows/keyword-intelligence-velocity.yml`) MUST execute `node scripts/backfill_rolling_window_gains.mjs` in Stage 2 (`consolidate` job) immediately following `keyword-fleet-consolidator.mjs` and prior to edge fleet cache invalidation.
- **Single-DB Rolling Calculation:** Backfill calculations join normalized `pins_daily_metrics` directly inside Unified PostgreSQL without multi-shard fan-out.
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

## 43. Critical Pinterest Domain Law (`repin_count` vs `save_count`) & Anti-Sawtooth Invariant
- **Independent Counter Domain Law:** On Pinterest, `repin_count` and `save_count` are two distinct counters returned by separate internal Pinterest services (`repin_count` vs `aggregated_pin_data.aggregated_stats.saves`). On authentic Pinterest pins, `repin_count` is genuinely greater than `save_count` (`repin_count > save_count`) on many viral pins.
- **Strict Ban on Counter Substitution (`Anti-Sawtooth Invariant`):** Lightweight Pinterest endpoints (such as `/resource/PinResource/get/`) frequently omit `saves` (`rawSaves = 0`). Application code and scrapers MUST NEVER overwrite `saves = rawRepins` when `rawSaves === 0`, and MUST NEVER assume `save_count = Math.max(save_count, repin_count)`. When `rawSaves === 0` in telemetry-only responses, crawlers MUST preserve the previous known `save_count` and never overwrite `pins_daily_metrics.save_count` with repins, preventing destructive non-monotonic sawtooth drops.
- **Symmetric Repin Surge Velocity:** Because repin gains and save gains represent distinct user interactions, `delta_repins_24h` MUST NOT be clamped to `daily_save_velocity`. Never classify `save_count < repin_count` as a hydration jump.
- **Visual Annotations Cross-Pollination:** `queryActiveSerp` and `queryViralCreatorPins` in `src/modules/pulse/service.mjs` MUST synthesize visual annotations using `COALESCE(NULLIF(ksc.visual_annotations, '[]'::jsonb), NULLIF(ump.visual_annotations, '[]'::jsonb), '[]'::jsonb)` to guarantee complete annotation parity across active and master pin tables.

## 44. Unified Single-DB Architecture (`unified_postgres`), Egress Row Deduplication & Cross-Room Data Parity (Phases 1–4)
- **Unified Single-DB Topology (`isUnifiedPostgres`):** In production and local runtime (`DATABASE_TOPOLOGY = "unified_postgres"`), all 99 logical shards and Central Hub operational tables reside in a single unified Neon PostgreSQL database. Legacy Cloudflare KV (`PIN_ENGINE_KV`), D1 (`PIN_D1_DB`), and Hyperdrive (`HYPERDRIVE`) bindings in `wrangler.toml` are disabled, and runtime cache/fallback paths are strictly guarded with `!isUnifiedPostgres(env)`.
- **80% Network Transfer (Egress) Reduction in Folder Crossover:** In `_executeFolderCrossover` (`src/modules/keywords/folders-service.mjs`), `pinRows` and `displacedRows` partition multi-keyword pin appearances via `ROW_NUMBER() OVER (PARTITION BY pin_id ...) AS pin_rn` and only project heavy creative strings (`title`, `image_url`, `destination_url`, `board_name`, `seo_title`) and `visual_annotations` JSONB when `pin_rn = 1` (and `NOT fk.in_active_serp` for displaced rows). Tier 3 20-shard loop fallback is bypassed when `isUnifiedPostgres(env)` is true.
- **Room 1 (`Crossover`) & Room 6 (`24h Pulse Radar`) Velocity & Count Parity:** Active SERP queries enforce `rank_position >= 1` (`LIMIT 5000`), and folder crossover preserves the full unique pin set without `.slice(0, 1500)` truncation. Velocity calculation falls back across `saves_24h`, `daily_save_velocity`, `delta_saves_24h`, and `Math.round(gains_7d / 7)` so displaced vault movers with positive 7-day gains never display `+0/d` while appearing in 24h Pulse Radar.
- **Domain Studio Filter-Synchronized KPIs & Anti-Placeholder Visual DNA:** In `src/domains-ui.mjs` and `src/modules/domains/service.mjs`, top KPI cards (`RANKED PINS`, `MONEY ARTICLES`, `MULTIPLIER`, `TOTAL SAVES`) dynamically reflect the active status filter (`All`, `Active SERP`, `Displaced`), article pin thumbnails are deduplicated by `pin_id`, displaced pins surface `Vault #<last_known_rank> · <primary_keyword>`, and placeholder hex colors (`#888888`, `#1e1e24`, `#000000`, `#18181b`) are purged from Visual DNA palettes and pin rows.
- **Creator Hub 10M+ Ceiling Badge & Cadence Outlier Guard:** Pinterest API ceiling values (`10,000,001`) render with an explicit `10M+` badge and deterministic tie-breaker sorting (`pin_count`, `top_pin_saves`, `follower_count`). Marketplace aggregators with $\ge 1{,}000{,}000$ catalog pins (`@etsy`, `@etsy_uk`, `@etsyca`) are excluded from `avg_pinning_cadence` so cluster cadence is never skewed.
- **Pin Dossier Provenance & Theme Parity:** `src/pin-details-ui.mjs` wraps conditional creator branches in a single root `<div>` inside `<template x-if>` (satisfying Alpine.js single-root DOM requirements), displays `Unified Hub SSOT` / `Unified Central Hub` when `topology === 'unified_postgres'`, supports Light/Dark theme toggling, and routes `24h Pulse Radar` contextually to `/folders/:id/pulse`.
