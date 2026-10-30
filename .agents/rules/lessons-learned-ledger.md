---
trigger: always_on
---

# Pin Arbitrage Engine (PAE) Lessons Learned & Architectural Memory Ledger

> **Purpose:** Single Source of Truth (SSOT) and permanent Git-native memory ledger capturing all distilled architectural lessons, runtime traps, landmine resolutions, and verified engineering patterns across PAE development rounds.
> **Enforcement Rule:** All agents MUST review this ledger during pre-execution recall before proposing modifications, refactoring code, or debugging failures. When resolving non-trivial issues, agents MUST append verified distillations directly to this file.

---

## Ledger Summary Index

| Round / Milestone | Thematic Scope | Key Invariants Enforced | Status |
| :--- | :--- | :--- | :---: |
| **Round 1 (Wave 1)** | Edge Runtime Security, Hyperdrive Non-Blocking Sockets & Mutation Hardening | `SEC-01` to `SEC-06`, Invariant 14 | **SEALED** |
| **Round 2 (Wave 2)** | Distributed Fleet Concurrency, Clock-Skew Immunity & Shard-Affine Partitioning | `LND-01`, `LND-02`, Invariants 18–20 | **SEALED** |
| **Round 3 (Wave 3)** | PostgreSQL 100% HOT Updates, Fillfactor 80 & SARGable B-Tree Seeking | Migration 037, `LND-08`, Invariant 21 | **SEALED** |
| **Round 4 (Wave 4)** | Dynamic UI Route Lazy Loading & Core Pillar 1 Absolute Defense | Invariant 17, Invariant 22 | **SEALED** |
| **Round 5 (Milestone 5)** | Shard-Affine Egress Shield, Authentic Rolling Gains & 7-Lock Anti-Regression Gate | Migrations 038–040, Invariants 32–37, Locks 1–7 | **SEALED** |
| **Round 6 (Milestone 6)** | Residual Defect Closure, Arbitrage Alpha Engines & 12-Lock Anti-Regression Shield | Migration 041, Invariants 38–41, Locks 8–12 | **SEALED** |
| **Round 9 & 10 (Master Execution)** | Hidden Endpoints Parity, 1200x Media Waterfall, Deep UTM Sanitization & LND-801..824 Defusal | Migration 042, Invariant 42, Locks 13–14 | **SEALED** |

---

## Round 1 (Wave 1): Edge Security, Non-Blocking Socket Lifecycle & Mutation Hardening

- **Thematic Focus:** Cloudflare Workers Edge Security, Hyperdrive Pool Lifecycle & Mutation Method Discipline.
- **Trap / Failure Mode:**
  1. *Fail-Closed Auth Failure (`SEC-01`)*: Permissive default auth in edge environments allows unauthenticated access if environment secrets are unconfigured. Passing API keys via URL query strings (`?api_key=secret`) leaks credentials into edge server access logs, reverse proxy headers, and browser history (CWE-598).
  2. *Hyperdrive Synchronous Socket Drain Crash*: Calling `await closePromise` inside the synchronous worker request loop holds HTTP responses open for 20–26 seconds during connection draining, triggering Cloudflare 504 Gateway Timeouts.
  3. *Unauthenticated State Mutation on GET (`SEC-03`)*: Mutative endpoints (`/api/domains/refresh-rollup`, `/api/keywords/trends/refresh`, `/api/fleet/keep-alive`) mapped to HTTP `GET` allow automated browser prefetchers, crawler bots, and search engines to trigger expensive database updates.
  4. *Hover Prefetch Shard Wakeup (`LND-03`)*: Mouseover hover events triggering `/api/fleet/warm` wake up sleeping serverless Postgres instances, consuming unnecessary Neon compute hours.
- **Root Cause & Technical Mechanism:**
  - `@neondatabase/serverless` and `postgres` pool handles must be closed cleanly, but blocking client responses violates edge latency SLAs.
  - Browser engines execute speculative GET prefetching on hovered links (`<link rel="prefetch">`).
- **Verified Solution & Invariant Rules:**
  - `verifyApiAuthentication` in `src/worker.mjs` fails closed with HTTP 503 if `API_SECRET_KEY` is missing in production, strictly rejects `?api_key=` URL queries, and validates `x-api-key` or `Authorization: Bearer`. Local test suites safely exempted via `isTestOrLocalDev`.
  - Hyperdrive socket draining implemented as non-blocking background loop: `while (processedCount < store.bgPromises.length)` with a 26-second ceiling, guaranteed `clearTimeout(drainTimerId)`, offloaded exclusively to `ctx.waitUntil(closePromise)` (`// [INVARIANT: NON-BLOCKING-SOCKET-CLEANUP]`).
  - Mutative endpoints migrated strictly to `POST` with CSRF protection; local dev server `scripts/dashboard.mjs` binds strictly to `127.0.0.1:3456` with strict Host/Origin checking.
  - Hover prefetching served strictly from Cloudflare D1 or KV edge cache in < 3ms without background database wakeups (`// [INVARIANT: SAFE-PREFETCH-EDGE-ONLY]`).
- **Verification Method:** `npm run check` and `node scripts/verify_ui_routes_reorganization.mjs`.

---

## Round 2 (Wave 2): Distributed Fleet Concurrency, Clock-Skew Immunity & Shard-Affine Partitioning

- **Thematic Focus:** Multi-VM Crawler Fleet Synchronization, Shard Connection Multiplexing & PostgreSQL Batch Upserts.
- **Trap / Failure Mode:**
  1. *Clock-Skew Barrier Collapse (`LND-01`)*: Multi-phase crawlers synchronizing 20 Azure VM runners via relative timestamp math (`new Date(Date.now() - 300000)`) collapse prematurely ($\Delta t < 0$) or freeze in permanent 60s timeouts ($\Delta t > 0$) due to virtualization scheduling jitter and NTP clock steps.
  2. *The GCD Connection Blast Trap (`LND-02`)*: Slicing tasks across $W = 20$ workers and $S = 99$ shards using item-level hashing (`crc32(id) % 20`) scatters connections across all 99 shards for every worker because $\gcd(20, 99) = 1$, opening $20 \times 99 = 1{,}980$ simultaneous database connections and exhausting Neon pool limits.
  3. *PostgreSQL Error 21000 in Batch Upserts (`LND-06`)*: Executing `INSERT ... ON CONFLICT (pin_id, snapshot_date, keyword_id) DO UPDATE` via `jsonb_to_recordset` fails fatally with `SQLSTATE 21000: ON CONFLICT DO UPDATE command cannot affect row a second time` if duplicate compound keys exist in the batch.
  4. *PL/pgSQL Jenkins hashtext Mismatch (`LND-07`)*: PostgreSQL's built-in `hashtext()` implements Jenkins' `lookup3` algorithm, differing by 98.9% from IEEE 802.3 CRC32 used in application code, scattering pins across incorrect shards.
- **Root Cause & Technical Mechanism:**
  - Distributed cloud VMs cannot rely on synchronized wall clocks for barrier synchronization.
  - Item-level modulo over co-prime integers guarantees uniform scattering across all shards.
  - PostgreSQL conflict arbitration requires distinct candidate keys per statement.
- **Verified Solution & Invariant Rules:**
  - Option B Logical State Barrier: Runners synchronize strictly via database logical tokens (`metadata->'phase1a_completed_token'`) with explicit `CRAWL_RUN_ID` / `GITHUB_RUN_ID` propagation. Zero timestamp subtraction.
  - Shard-Affine Partitioning: Workers are assigned fixed subsets of shards: $S_w = \{s \in [1, 99] \mid (s - 1) \bmod W === w\}$. Each worker connects only to its assigned $\le 5$ shards, capping peak fleet connections at 99 (a 95% reduction).
  - Pre-serialization `Map` deduplication by compound identifier before `JSON.stringify()` in `writeBatchToDeterministicShards`.
  - Canonical PL/pgSQL function `pae_crc32_shard_id(pin_id, 99)` implementing bitwise IEEE 802.3 polynomial `0xEDB88320` deployed across all database triggers and DDL.
- **Verification Method:** `node scripts/verify_regression_locks.mjs` (Lock 3) and `npm run check`.

---

## Round 3 (Wave 3): PostgreSQL 100% HOT Updates, Fillfactor 80 & SARGable B-Tree Seeking

- **Thematic Focus:** Neon PostgreSQL Internals, Heap-Only Tuple (HOT) Updates & Query Index SARGability.
- **Trap / Failure Mode:**
  1. *The Volatile Column Covering Index Trap (`LND-08`)*: Creating secondary indexes with `INCLUDE` clauses containing daily updating telemetry (`save_count`, `daily_save_velocity`, `repin_count`) permanently disables PostgreSQL Heap-Only Tuple (HOT) updates (`nbtinsert.c`). Every crawl row update forces an expensive index insertion and table bloat.
  2. *Expression-Wrapped Predicates (`LND-09`)*: Wrapping indexed columns in SQL expressions (e.g. `WHERE LOWER(REGEXP_REPLACE(domain, '^www\.', '')) = ...` or `WHERE LOWER(account_username) = ...`) defeats B-Tree index seeks and forces sequential table scans.
  3. *Sequential Query Waterfall in Creator Profiles*: Running 17 sequential single-row queries to assemble creator details created 800ms+ latency bottlenecks.
- **Root Cause & Technical Mechanism:**
  - In PostgreSQL, if any updated column is indexed (even as an unindexed `INCLUDE` payload), a new index tuple must be inserted, preventing HOT optimization.
  - B-Tree indexes only match raw column values, not functional transformations.
- **Verified Solution & Invariant Rules:**
  - Migration 037 dropped covering indexes on volatile columns (`idx_ksc_active_covering`, `idx_cp_link_domain_clean`). Deployed clean B-Tree indexes on search keys only and applied `fillfactor = 80` on high-update tables (`keyword_serp_current`, `competitor_pins`, `keyword_displaced_index`).
  - Search arguments sanitized in the application layer (`normalizeCleanDomain`, `normalizePinterestUsername`). Structured optional SQL predicates as `AND (${cleanBoardSlug}::text IS NULL OR cp.board_slug = ${cleanBoardSlug})` for direct B-Tree seeking.
  - Collapsed 17 sequential queries in `getCompetitorDetail` into 1 profile seek + 3 parallel aggregations with single-pass `COUNT(*) OVER()::int`.
- **Verification Method:** `scripts/migrations/037_sargable_and_hot_cleanup.sql` and `node scripts/verify_sql_schema_parity.mjs`.

---

## Round 4 (Wave 4): Dynamic UI Route Lazy Loading & Core Pillar 1 Absolute Defense

- **Thematic Focus:** Worker Isolate Memory Optimization, Dynamic ES Imports & Live vs Dead Code Boundaries.
- **Trap / Failure Mode:**
  1. *Static Page Import Memory Bloat*: Static top-level `import` of all 6 studio UI templates in `src/routes/pages.mjs` bloated Worker isolate cold-start memory to > 6.5 MB, pushing isolates toward Cloudflare 128 MB limits.
  2. *Accidental Purge of Active Pillar 1 Infrastructure*: Mistaking Active Core Pillar 1 ("Seed Pin Cluster Graph & P2P Arbitrage" in `scripts/cluster-intelligence.mjs`, `src/routes/cluster.mjs`, `candidate_graph_nodes`) for deprecated PinArchive "Smart Topic Clusters" (`pa_topic_clusters_page`).
- **Root Cause & Technical Mechanism:**
  - V8 isolates allocate memory for all statically imported modules during initial script evaluation, even for routes that are never requested during an execution.
- **Verified Solution & Invariant Rules:**
  - Converted all studio route renderers in `src/routes/pages.mjs` to dynamic on-demand imports: `await import('../...-ui.mjs')`, saving 1.65 MB per isolate and keeping boot memory under 5 MB. Static page routes return an immediate 200 on `HEAD` requests.
  - Clean 6-phase purge executed for legacy shims (`src/routes/pinarchive.mjs`, `src/routes/competitors.mjs`) while establishing strict architectural defense of Core Pillar 1 (`scripts/cluster-intelligence.mjs`, `cluster-intelligence.yml`).
- **Verification Method:** `npm run check` and `node scripts/verify_ui_routes_reorganization.mjs`.

---

## Round 5 (Milestone 5): Shard-Affine Egress Shield, Authentic Rolling Gains & 7-Lock Anti-Regression Gate

- **Thematic Focus:** Neon Network Transfer Optimization, Shard Metric Projection & Anti-Amnesia Code Locks.
- **Trap / Failure Mode:**
  1. *Neon Central Hub Egress Waste (SYM-A / 4.6 GB / 92.1% egress wasted)*: Querying Central Hub `pa_pins` and `competitor_pins` pulled entire tables into runner memory because rows lacked stored shard partitioning.
  2. *Linear Gain Extrapolation Illusion*: Projecting weekly gains via `daily_save_velocity * 7` produced artificial, misleading trends during velocity drops.
  3. *The Anti-Hydration-Spike Trap (`[INVARIANT: ANTI-HYDRATION-SPIKE]`)*: When pins discovered with `save_count = 0` are deep-hydrated with 100k+ saves, naive delta math (`current - baseline`) evaluates lifetime saves as a 1-day jump.
  4. *Untracked Creator Navigation 404s*: Clicking creator links on unmonitored pins opened 404 ghost boards.
  5. *D1 Folder Count 0-Overwrite*: Unconditional D1 folder updates zeroed out existing pin and creator counts when child lists were empty.
  6. *Recurring Agent Regression Cycle*: Successive agent sessions continuously re-introduced fixed DOM nesting bugs and broken query patterns.
- **Root Cause & Technical Mechanism:**
  - Unpartitioned queries force database engines to transmit all rows across the wire before client filtering.
  - LLM context truncation causes historical conversational instructions to be lost between sessions.
- **Verified Solution & Invariant Rules:**
  - Migration 038 added stored generated column `shard_id SMALLINT GENERATED ALWAYS AS (pae_crc32_shard_id(pin_id, 99)) STORED` with B-Tree indexes, enabling `WHERE shard_id = ANY(...)` pushdown and eliminating 95% of egress.
  - Migration 039 added physical rolling gain columns (`gains_5d`, `gains_7d`, `gains_10d`, `gains_15d`) populated from genuine historical snapshots via `scripts/backfill_rolling_window_gains.mjs`.
  - Anti-hydration jump detector `detectHydrationJump()` suppresses discovery jumps (`baseSaves === 0`) to 0 or amortizes them across age.
  - Pin links propagate `?folder_id=...&return_url=...`; 4-tier context resolver safely validates `is_tracked_competitor` before routing to creator dashboards.
  - D1 folder sync uses defensive `COALESCE(excluded.creator_count, ...)` to preserve valid existing counts.
  - Created `scripts/verify_regression_locks.mjs` executing in < 25ms, wired into `npm run check`, enforcing Locks 1–7 and Invariants 32–37 permanently. Distilled into Beacon memory `memory_b861290ed9bdc427e434f4b0522009d8`.
- **Verification Method:** `node scripts/verify_regression_locks.mjs` and `node scripts/verify_dom_nesting.mjs`.

---

## Round 6 (Milestone 6): Residual Defect Closure, Arbitrage Alpha Engines & 12-Lock Anti-Regression Shield

- **Thematic Focus:** Daily Gains Automation, Window-Aware Audience Clamping, 1-Click SERP Creator Tracking, Breakout Alpha & Migration 041 (`77db678`, Invariants 38–41, Locks 8–12).
- **Trap / Failure Mode:**
  1. *Unscheduled Rolling Gains (Defect A1)*: Central Hub rolling gains (`gains_5d..15d`) were not automated in GitHub Actions, leaving tables unrefreshed after daily crawls.
  2. *Negative Cluster Audience Gains Dip (Defect A2)*: `clusterCompetitorAudienceGains` ignored `selectedTimeWindow` and allowed single creator drops to drag cluster totals negative.
  3. *Auto-Discovered SERP Creator Track Failure (Defect A3)*: String IDs `serp_<username>` passed to `POST /api/folders/:id/creators` cast to `NaN`, silently failing to link or track the creator.
  4. *Domain Studio `/accounts` Deep-Link Parameter Drop (Defect A4)*: Navigating from Domain Studio to `/accounts?creator=username` failed to read query params on page load.
  5. *32-Bit Integer Overflow in Crawler Engine (Defect A5)*: `x.saves::int` in `scripts/crawler-engine.mjs` risked `SQLSTATE 22003` integer overflow on accounts exceeding 2.14B impressions/saves.
  6. *Viral Creator Breakout Lag (Upgrade B1)*: Viral breakout accounts tracked in lightweight `pulse_only` mode required manual operator intervention to upgrade to full pin harvesting.
- **Root Cause & Technical Mechanism:**
  - Post-crawl workflows lacked the execution step for `backfill_rolling_window_gains.mjs`.
  - Non-numeric ID strings coerced via `Number()` produce `NaN` in JavaScript, causing SQL parameterization failures.
  - PostgreSQL 32-bit `integer` tops out at 2,147,483,647; high-volume creator telemetry exceeds this threshold.
- **Verified Solution & Invariant Rules:**
  - Automated `node scripts/backfill_rolling_window_gains.mjs` as Step 5 in Stage 2 (`consolidate`) of `keyword-intelligence-velocity.yml` (Lock 8 / Invariant 38).
  - Dynamic `selectedTimeWindow` switching in `clusterCompetitorAudienceGains` with `Math.max(0, val)` clamping (Lock 9 / Invariant 39).
  - Dual-environment string handle fallback to `toggleFolderCreatorTracking` inside `POST /api/folders/:id/creators` in both Edge and local Node servers (Lock 10 / Invariant 40).
  - Deep-link URL parsing in `initDashboard` via `URLSearchParams(window.location.search)` within browser guards; complete `::bigint` cast parity across all cumulative counters (Lock 11 / Invariant 41).
  - Auto-promote viral breakout accounts at `AUTO_PROMOTE_PULSE_DELTA_24H = 25000` / `7D = 100000`; Breakout Baby Domains (`<2y + 15 7d gains`) and Linkless SERP Vacuums filters in Campaign Folders; Migration 041 composite shard indexes (Lock 12 / Invariant 41).
  - Expanded `scripts/verify_regression_locks.mjs` to 12 permanent locks. Distilled into Beacon memory `memory_da731fca7b919e0e059abaf875628fc0` (`candidate_b744d73809cfb5d783058f52b3ee580a`).
- **Verification Method:** `node scripts/verify_regression_locks.mjs` (Locks 1–12), `node scripts/test_adversarial_round6_m5_2.mjs`, and `node scripts/test_empirical_round6_verification.mjs`.


---

## Round 9 & 10 (Master Surgical Execution): Hidden Endpoints Parity, 1200x Media Waterfall, Deep UTM Sanitization & LND-801..824 Defusal

- **Thematic Focus:** Reverse-Engineered Hidden Pinterest Endpoints, Pidgets Batch Ingestion, 1200x HD Waterfall, Deep UTM Canonicalization, PostgreSQL Deadlock Prevention, Edge Subrequest Throttling & 14-Lock Anti-Regression Gate (Migration 042, Invariant 42, Locks 13–14).
- **Trap / Failure Mode:**
  1. *UTM-Poisoned Article Save Counter (`Round 9 Section 1.4`)*: Pinterest's `urls/count.json` performs exact string-indexed database seeks. Passing uncanonicalized URLs with HTML-encoded ampersands (`&amp;utm_medium=...`), URL fragments (`#recipe`), or tracking/WordPress query parameters (`utm_*`, `tp_*`, `pin_*`, `fb_*`) resulted in a 100% false-zero failure rate (`count: 0`), blinding the engine to viral destination URLs.
  2. *Single-Day Velocity Spikes on Pidgets Discovery (`LND-801`)*: Batch Pidgets enrichment hydrated 100% of SERP pins with authentic lifetime saves. Computing velocity via naive subtraction `(p.save_count - baseSaves) / daysElapsed` evaluated unhydrated pins (starting at `baseSaves === 0`) as single-day jumps, injecting bogus $+5,000/\text{day}$ velocity spikes.
  3. *PostgreSQL Deadlock on Batch Upsert (`LND-810`, SQLSTATE 40P01)*: Concurrent crawlers executing multi-row `INSERT ... ON CONFLICT (keyword_id, pin_id) DO UPDATE` against `keyword_serp_current` locked rows in non-deterministic order, causing mutual deadlocks and transaction rollbacks.
  4. *PostgreSQL Error 21000 in Creator Promotion (`LND-811`)*: Promoting pins from `competitor_pins` into `pa_pins` via batch upsert failed with `ON CONFLICT DO UPDATE command cannot affect row a second time` if duplicate candidate keys existed in the batch.
  5. *Rolling Gains Zero Overwrite on Shard Timeout (`LND-802`)*: Network hiccups or scale-to-zero cold boots during `backfill_rolling_window_gains.mjs` triggered a `catch` block that unconditionally assigned `{ gains_5d: 0, gains_7d: 0, ... }`, overwriting authentic multi-window gains with zeroes.
  6. *Edge KV Subrequest Storm on Folder Eviction (`LND-805`)*: Deleting 18 legacy and v3 cache keys per pin in an unconstrained `Promise.all` loop generated ~3,600 subrequests, breaching Cloudflare Worker subrequest limits (50/request).
  7. *D1 Batch Array Limit Exceeded (`LND-817`)*: Slicing pin hydration into an unbounded array of SQL statements passed to `env.PIN_D1_DB.batch(stmts)` exceeded Cloudflare D1's 100-statement limit.
  8. *Monotonic D1 Table Bloat (`LND-818`)*: `edge_pins_metadata` lacked an LRU or retention pruning policy, monotonically growing toward Cloudflare storage thresholds.
  9. *DOM Explosion & Thread Freezes on High-Density Tables (`LND-806`)*: Rendering 1,000+ displaced pins or creator rows simultaneously generated >20,000 DOM nodes, locking browser main threads for 4–8 seconds.
  10. *Race Conditions on Studio Filter Churn (`LND-807`)*: Rapid keystrokes in Domain Studio search dispatched concurrent fetches; slower earlier responses arriving late overwrote newer filtered results.
  11. *Akamai User-Agent WAF Flagging (`LND-820`)*: Synthetic `Chrome/151.0.0.0` User-Agent strings mismatched client hint headers, triggering Akamai bot challenges on Pinterest endpoints.
  12. *Synthetic ID Numeric Coercion Failure (`LND-813`)*: Discovered creators with string handles (`serp_<username>`) passed to folder tracking endpoints were coerced via `Number()`, producing `NaN` and failing SQL parameterization.
  13. *Cross-Studio Deep Link Parameter Loss (`LND-814`)*: Navigation from Pin Dossier to Domain Studio with `?q=...` or `?domain=...` failed to inspect `window.location.search`, loading default un-filtered domains.
  14. *Residual Arabic Strings in Production Modals (`LND-823`)*: Legacy modal templates retained Arabic strings, violating SaaS localization standards.
- **Root Cause & Technical Mechanism:**
  - Exact string hashing in third-party counters requires pre-normalization.
  - Non-atomic row locking without ordered keys triggers cycle waits in PostgreSQL concurrency control.
  - V8 microtask scheduling and unbounded concurrent edge I/O trigger platform resource caps.
  - Unbounded reactive DOM rendering without virtualization or pagination overwhelms browser layout engines.
- **Verified Solution & Invariant Rules:**
  - Implemented `sanitizeDestinationUrl` & `canonicalizeArticleUrlForCount` decoding `&amp;`, stripping `.hash = ''`, and removing all tracking parameters (`utm_*`, `fb_*`, `tp_*`, `pin_*`, `amp;*`, `ref`, etc.) before calling `urls/count.json`.
  - Enforced `calculateDailyVelocity` with `detectHydrationJump` across batch Pidgets SERP pre-enrichment (`LND-801`), suppressing Day-1 jumps from 0 to realistic values or amortizing across age.
  - Added `ORDER BY u.pin_id ASC` in batch SERP upserts (`LND-810`) and `SELECT DISTINCT ON (cp.pin_id)` in competitor pin promotions (`LND-811`).
  - Set `fillfactor = 70` on high-churn tables (`keyword_serp_current`, `keyword_displaced_index`, `competitor_pins`) via Migration 042 (`LND-812`) to reserve page headroom for 100% HOT updates.
  - Removed destructive zero-overwrite catch in `backfill_rolling_window_gains.mjs` and applied defensive `COALESCE(NULLIF(u.gains_7d, 0), existing)` (`LND-802`).
  - Replaced unbounded KV deletions with global `fleet:cache_epoch` increments and capped primary key evictions (`<= 20` keys) (`LND-805`).
  - Chunked D1 batch operations into slices of `<= 100` statements (`LND-817`) and deployed 14-day LRU auto-pruning triggers in Migration 0004 (`LND-818`).
  - Added client-side windowed pagination (`pageSize = 25/50`) to displaced pins and competitors (`LND-806`).
  - Attached `AbortController` and `_loadReqSeq` sequence counters to drop stale out-of-order responses (`LND-807`).
  - Aligned User-Agent and `sec-ch-ua` to canonical `Chrome/131.0.0.0` (`LND-820`) while strictly preserving guest scraping invariants (`// [INVARIANT: STRICT-GUEST-SCRAPING]`, Lock 1).
  - Supported string creator handles in `assignCreatorToFolder` (`LND-813`), parsed `window.location.search` in Domain Studio `init()` (`LND-814`), and translated 100% of modal strings to clean English SaaS copy (`LND-823`).
  - Expanded `scripts/verify_regression_locks.mjs` to 14 permanent locks (`14/14 PASS`).
- **Verification Method:** `npm run check`, `node scripts/verify_regression_locks.mjs` (Locks 1–14 PASS), `node scripts/test_p2_verification.mjs`, `node scripts/verify_dom_nesting.mjs`, `node scripts/validate_inline_scripts.mjs`, and `node scripts/verify_round10_live_e2e.mjs`.
