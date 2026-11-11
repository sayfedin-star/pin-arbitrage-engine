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
| **Rounds 14–16 (Crawler Egress & Micro-Traps Defusal)** | Creator Fleet Egress Defense, Shard-Affine Partitioning Parity, CTE History Consolidation & 10M Ceiling Guard | Lock 3, Lock 7, Invariants 32–37 | **SEALED** |
| **Round 23 (Phase 8 UI Parity)** | Room 5 Pruning Healing, Creator Combined Audience 24h Surge, Tag Bridge Gains & Crossover Velocity Alignment | Invariants 30, 31, 33, Locks 1, 4, 13 | **SEALED** |
| **Round 24 (Phases 1–4 Forensic Single-DB Optimization)** | 80% Egress Row Deduplication, Legacy KV/D1/Hyperdrive Isolation, Room 1–6 Count/Velocity Parity, Domain Studio KPI Sync, Creator 10M+ Ceiling & Dossier Provenance Fix | Migration 047, Invariant 44, Locks 1–14 | **SEALED** |
| **Round 25 (Visual Crossover Alignment)** | Complete Blueprint Eradication, Frequency-First Anchor Sorting & Joint Pins 24h Velocity Preview | Invariants 13, 22, 28, Locks 1, 5, 13 | **SEALED** |
| **Round 26 (Pure Neon & VPS/Coolify Readiness)** | Complete Cloudflare (KV/D1/Hyperdrive) Purge, Pure Neon Serverless Postgres Architecture & Test Modernization | Invariant 2, Invariant 6, Locks 6, 13 | **SEALED** |
| **Round 27 (InstaBox Dedicated Postgres Migration)** | 100% Neon ➡️ InstaBox Streaming Migration, Cloudflare Zero Trust Tunnel, CI Security Parity | Invariants 1–44, Locks 1–14 | **SEALED** |
| **Round 28 (Forensic Landmine Neutralization & Native VPS SSOT)** | Neutralization of Landmines A–E, Elimination of Sharding Residues, Intraday Step Gains & Native VPS PostgreSQL SSOT Parity | Invariants 1–44, Locks 1–14 | **SEALED** |
| **Round 29 (Neon Eradication & Strict VPS Execution)** | Complete Eradication of Neon DSNs, Direct VPS Migration 050 Application & Live Server Service Restart | Invariants 1–44, Locks 1–14 | **SEALED** |
| **Round 30 (Canonical De-Poisoning & Independence)** | Eradication of Canonical Save-Stealing, Repin Conflation & GREATEST Ratchets | Invariant 28, Lock 14 | **SEALED** |
| **Round 31 (Unified Single-DB Consolidation)** | Single VPS PostgreSQL Database Architecture & Removal of Multi-Shard Branches | Invariants 1–44, Locks 1–14 | **SEALED** |
| **Round 32 (Frontend UI Hydration & Consolidation)** | Hydration Chart Zero-Exclusion, Pulse Transient Retry, Shared Formatters & Canonical PinRow | Rule 31, Invariants 28, 31, Locks 1–14 | **SEALED** |

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

---

## Rounds 14–16: Creator Fleet Egress Defense, CTE History Consolidation & 10M Ceiling Guard

- **Thematic Focus:** Multi-Worker GHA Creator Swarm Egress Optimization, CTE Single-Roundtrip History Seeking, Lock 3 Partitioning Parity & Pinterest 10M Ceiling Safeguard.
- **Trap / Failure Mode:**
  1. *Dispatcher GITHUB_OUTPUT Bloat*: Passing 2,938 comma-separated integer IDs across all 20 matrix rows inflated GITHUB_OUTPUT by >300 KB, causing slow action setups.
  2. *Mode A 58,760-Row Neon Blast*: Emptying `all_account_ids` caused 20 workers to fall back to `SELECT id FROM competitor_profiles WHERE is_active = TRUE`, pulling 58,760 rows across the wire just to print an account count.
  3. *Unpartitioned Creator pa_pins Egress*: Crawling `pa_pins` without projecting explicit columns pulled heavy text blobs (`description`, `alt_text`, `annotations`, `metadata`) into worker memory.
  4. *Triple History Roundtrip Overhead*: `syncCompetitorProfile` ran 3 sequential queries (`prior24h`, `baseline7d`, `earliest`) using subqueries on `cleanUsername`, multiplying database roundtrips to ~6,000 queries per fleet sweep.
  5. *10M Ceiling Snapshot Overwrites*: Pinterest profile scraping caps reach/views at `10000001` (representing 10M+). If an account previously had an authentic count (e.g. 10.4M), snapshot updates on conflict unconditionally overwrote the value with `10000001`, injecting bogus -400k negative delta drops.
  6. *Barrier Peer Heartbeat Drift*: Workers processing 147 accounts in Phase 1 without intermediate heartbeats caused their registered heartbeats to age past the 3-minute threshold, causing peer workers at the barrier to falsely mark them as dead and exit prematurely.
- **Root Cause & Technical Mechanism:**
  - Redundant parameter serialization in CI matrices and full table fallbacks when assigned slices are already present.
  - Subquery-based history querying without reusing the known profile ID.
  - Lack of 10M ceiling preservation in `competitor_history_snapshots` `ON CONFLICT DO UPDATE`.
- **Verified Solution & Invariant Rules:**
  - Pruned `all_account_ids` in `scripts/creator-fleet-dispatcher.mjs` while keeping `allFleetAccountIds` fallback guarded by `accountIdsInput.length === 0`.
  - Preserved Lock 3 `WHERE p.shard_id = ANY(assignedWinningArray)` pushdown while selecting only necessary lightweight telemetry columns from `pa_pins`.
  - Consolidated `prior24h`, `baseline7d`, and `earliest` into a single CTE roundtrip in `src/modules/creators/service.mjs` using direct indexed `competitor_id = ${existingProfile.id}`.
  - Added 10,000,001 ceiling protection in `competitor_history_snapshots` `ON CONFLICT DO UPDATE` mirroring `competitor_profiles`.
  - Added 25-account periodic heartbeat refresh in `scripts/creator-velocity-crawler.mjs`, increased barrier timeout to 4 minutes, and added 250-500ms pulse jitter.
  - Pruned `SELECT *` in `scripts/keyword-velocity-crawler.mjs` and `scripts/keyword-fleet-consolidator.mjs` to target lightweight columns only.
- **Verification Method:** `node scripts/test_creator_intelligence_fleet.mjs` (13/13 PASS), `node scripts/verify_regression_locks.mjs` (Locks 1–14 PASS), `npm run check`, and `npm test` (all 21 suites PASS).

---

## Round 17: Creator Auto-Promote & Breakout Rules Engine (Dynamic Settings & Lock 12 Parity)

- **Thematic Focus:** Dynamic Breakout Promotion Settings, Sub-Router Path Normalization Defense, Winning Pin Qualification Rule Inheritance & Dual-Placement UI Configuration.
- **Trap / Failure Mode:**
  1. *Sub-Router Path Normalization 404*: `handleCreatorsRoutes` in `src/routes/creators.mjs` immediately rewrites `/api/creators/*` into `/api/competitors/*`. Any subsequent check strictly matching `/api/creators/settings` fails with 404 Not Found.
  2. *Disconnected Qualification Rules*: Creating UI fields for `min_saves` and `min_velocity` without persisting them into `competitor_profiles.metadata->'qualification_rules'` causes `reconcileQualifiedCatalogPins` to fall back to hardcoded defaults (100 saves / 3.5 velocity), rendering the user's settings ineffective.
  3. *In-Loop Settings Query Overhead*: Fetching `getCreatorHubSettings(sql)` inside the account iteration loop forces 147+ redundant roundtrips per worker to Central Hub `app_settings`.
  4. *Lock 12 Regressions*: Renaming or removing `AUTO_PROMOTE_PULSE_DELTA_24H` breaks Lock 12 in `scripts/verify_regression_locks.mjs`.
- **Root Cause & Technical Mechanism:**
  - Prefix rewrite in router discriminator.
  - Decoupling between global app settings and per-creator metadata consumed by catalog reconciliation.
- **Verified Solution & Invariant Rules:**
  - Placed `(pathname === '/api/competitors/settings' || pathname === '/api/creators/settings' || originalPathname === '/api/creators/settings')` in the top literal section using Central Hub `sql || targetSql`.
  - Implemented `src/modules/creators/settings.mjs` storing `creator_hub_settings` in `app_settings`.
  - Fetched settings once before Phase 1 account loop in `scripts/creator-velocity-crawler.mjs`, while preserving `AUTO_PROMOTE_PULSE_DELTA_24H` and `AUTO_PROMOTE_PULSE_DELTA_7D` as fallback anchors.
  - Persisted user-configured `min_saves` and `min_velocity` into `metadata.qualification_rules` on promoted profiles so `reconcileQualifiedCatalogPins` genuinely enforces them.
  - Added dual button placements in `src/dashboard-ui.mjs` (main header `/accounts` and campaign folder creator view) paired with the Swiss-grid modal in `src/ui/dashboard-modals.mjs`.
- **Verification Method:** `node scripts/test_auto_promote_settings.mjs` (all PASS), `node scripts/verify_regression_locks.mjs` (Locks 1–14 PASS), `npm run check`, and `npm test` (all 21 suites PASS).

---

## Round 18: Eradication of 5 Hidden Qualification & Auto-Promote Landmines

- **Thematic Focus:** 3-Tier OR Bypass Immunity, Pinterest `page_size: 50` Formula Parity, Double-Harvest Prevention, Anti-NaN Type Hygiene, and Lucide Icon Lifecycle.
- **Trap / Failure Mode:**
  1. *3-Tier OR Bypass in Pin Qualification*: Pinterest `repin_count` roughly mirrors `save_count`. In `reconcileQualifiedCatalogPins`, `reEvaluateCompetitorPins`, and `qualifyPin`, `tier2_min_repins` defaulting to 100 or hardcoded `(save_count >= 50 AND velocity >= 2.0)` allowed 100-save pins to bypass user-configured high thresholds (e.g. `min_saves = 500`, `min_velocity = 10.0`).
  2. *Double-Harvest & Execution Race*: Newly auto-promoted creators had 0 pins in `competitor_pins`; executing reconciliation before fresh pin sync or executing boards/pins twice in the same crawl pass caused missed promotions or duplicate network overhead.
  3. *`harvestPages` Formula Mismatch*: `fetchUserActivityPinsResource` uses `page_size: 50`. Dividing `max_pins_harvest` by 25 doubled requested pages unnecessarily (200 pins fetched when 100 requested).
  4. *NaN Poisoning & Missing 405 Method Guard*: Non-numeric inputs to `updateCreatorHubSettings` risked writing `NaN` to JSONB in PostgreSQL. Non-GET/POST calls to `/api/competitors/settings` lacked explicit 405 Method Not Allowed handling.
  5. *Modal Open Lucide Icon Blanking*: Awaiting API fetch before calling `window.lucide.createIcons()` left icons blank during network latency.
- **Root Cause & Technical Mechanism:**
  - Unbounded fallback OR-branches in SQL queries and rule inheritance that did not scale with custom thresholds.
  - Mismatch between crawler pagination math and Pinterest API parameters.
- **Verified Solution & Invariant Rules:**
  - In `scripts/creator-velocity-crawler.mjs`, dynamically persist `tier1_min_saves`, `tier2_min_repins: minSaves`, `tier2_min_velocity: minVelocity`, and `tier3_min_saves: Math.min(minSaves, Math.max(25, Math.floor(minSaves / 2)))` with `auto_promote_inherited: true`.
  - In `src/modules/creators/service.mjs` (`reconcileQualifiedCatalogPins`, `reEvaluateCompetitorPins`, and `qualifyPin`), guard the 50-save / 2.0-velocity fallback with `allowVelocityFallback = Boolean(minSaves <= 100 && minVelocity <= 3.5)`, completely disabling the fallback when stricter user rules are active.
  - In `scripts/creator-velocity-crawler.mjs`, enforce single-pass execution order: profile update -> auto-promote evaluation -> board sync -> fresh pin sync (`harvestPages = Math.ceil(maxPins / 50)`) -> catalog pin reconciliation into `pa_pins`.
  - In `src/modules/creators/settings.mjs`, implement `cleanNum(val, fallback, min, max)` enforcing `Number.isFinite` and clamping.
  - In `src/routes/creators.mjs`, return strict 405 Method Not Allowed on non-GET/POST requests.
  - In `src/dashboard-ui.mjs`, invoke `this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });` immediately upon opening the modal.
- **Verification Method:** `node scripts/test_auto_promote_settings.mjs` (all 6 suites PASS), `node scripts/verify_regression_locks.mjs` (Locks 1–14 PASS), `npm run check`, and `npm test` (all 21 suites PASS).


---

## Round 19: Single-DB Backend Refactoring (`unified_postgres`) & Elimination of Shard Scatter-Gather

- **Thematic Focus:** Single-DB Architecture (`unified_postgres`), Mock Test Compatibility, Circuit Breaker Key Bi-Mapping, Fast Central Hub Creative Joins, and Anti-Placeholder Visual Palette.
- **Trap / Failure Mode:**
  1. *Shard Scatter-Gather Latency & Egress*: Querying 20 remote physical shards in parallel for displaced creative metadata in `folders-service.mjs` and `fleet-router.mjs` added excessive connection overhead, cold-start timeouts, and network hops.
  2. *Mock Client Bypasses in Unit Tests*: Setting `DATABASE_TOPOLOGY` default to `'unified_postgres'` unconditionally broke unit tests that mock shard clients via `_setShardSqlClient`, `globalShardMap`, `NEON_SHARD_DSN_TEMPLATE`, or `PIN_ENGINE_KV`.
  3. *Circuit Breaker Shard-ID Key Mismatch*: In `test_unified_phase1_phase2_adversarial.mjs`, tests set and inspected breaker state on virtual `chaosShardId` (77), while the router indexed exclusively by `physicalKey` (17). The breaker tripped open on 17, but left key 77 undefined, causing false fast-fail assertion failures.
  4. *Folder Crossover Displaced Pin Latency*: Displaced rows from `keyword_displaced_index` lacked creative fields (`title`, `image_url`, `dominant_color`, etc.) requiring expensive post-crossover shard sweeps.
  5. *Placeholder Dominant Colors in Palette*: Fake colors like `#888888`, `#1e1e24`, `#000000`, and `#18181b` polluted `dominantColorPalette`, distorting visual telemetry.
- **Root Cause & Technical Mechanism:**
  - Circuit breaker maps indexed solely by physical shard ID [1..20] instead of bi-mapping virtual shard IDs [1..99].
  - Topology resolution not checking in-memory mock client registry before falling back to Hub SQL.
  - Missing `LEFT JOIN universal_master_pins` on Central Hub for displaced rows.
- **Verified Solution & Invariant Rules:**
  - Configured `DATABASE_TOPOLOGY = "unified_postgres"` in `wrangler.toml` under `[vars]` and `[env.preview.vars]`.
  - In `src/modules/sharding/fleet-router.mjs`:
    - `getDatabaseTopology(env)` defaults to `'unified_postgres'` while honoring `'sharded_neon'`.
    - `resolveShardConnection` prioritizes `dsnTemplate`, cached `shardSqlClients`, and `PIN_ENGINE_KV` before unified Hub resolution, maintaining 100% unit test mock compatibility.
    - `writeBatchToDeterministicShards` deduplicates all pins in a single JavaScript `Map` sorted by `pin_id ASC` and performs a single-batch upsert on `hubSql` when in unified mode with zero mock clients, while preserving `coalesceShardGroupsByPhysical` for Lock 3G.
    - Synchronized `circuitBreakers` to index both `physicalKey` and `cleanShardId`.
  - In `src/modules/pulse/service.mjs`:
    - Joined `universal_master_pins ump` in `queryVaultAndVacuum` and `queryBreakoutCreators` (with `CROSS JOIN LATERAL` regex-shielded metrics).
    - Excluded placeholder colors (`isPlaceholderColor`) from `colorStatsMap` and populated `matching_pins` in `dominantColorPalette`.
    - Enriched missing creative fields from D1.
  - In `src/modules/keywords/folders-service.mjs`:
    - Joined `universal_master_pins ump` in `displacedRows` query to return creative assets in < 5ms.
    - Enforced strict vacuum pin calculation `Boolean(p.image_url) && (!p.domain || p.domain === 'Uploaded by user') && safeNum(p.save_count) >= 100`.
    - Incrementally pushed hydrated rows in `hydrateShardBatch`.
- **Verification Method:**
  - `npm run check` (183 files syntax verified, AST schema parity 0 landmines, ESLint 0 warnings, Locks 1–14 100% PASS).
  - `npm run test:offline` (13 suites, 100% PASS).
  - `npm test` (21 suites, 100% PASS).
  - `node --test tests/round15-pulse-v2.test.mjs tests/round16-pulse-503-and-data-truth.test.mjs` (37 tests, 100% PASS).
  - Live Central Hub diagnostic verified: 0 Untitled pins, 0 empty images in breakout pins, 0 placeholder colors in palette, active creator breakouts with driver pins velocity > 0.


---

## Round 20: Crawler Sanitization, Missing-Age Healing & Unified Network Transfer Optimization
- **Round / Feature**: Phase 3 — Crawler Sanitization, Displaced Cooldown Offset & Modulo Pushdown
- **Trap / Failure Mode**: 
  1. Placeholder hex colors (`#1e1e24`, `'#888888'`) injected at scraping and reconciliation points polluted analytics palettes.
  2. Displaced pins in `keyword_displaced_index` lacked `created_at_pinterest` and their freshly stamped `updated_at` during Stage 1 SERP harvest triggered `displaced_cooldown_active` in Stage 2, skipping them from inspection.
  3. All 20 fleet workers simultaneously downloaded the full table of creator IDs before slicing locally, generating redundant network egress.
- **Root Cause & Technical Mechanism**:
  1. Default fallbacks `pin.dominant_color || '#1e1e24'` in `scripts/lib/pinterest.mjs` and `'#888888'` in `reconcileQualifiedCatalogPins`.
  2. Displaced pin partitions selected `NULL as created_at_pinterest` without joining `universal_master_pins`, and lacked the 6-hour timestamp offset `kdi.updated_at >= runStartTime ? (kdi.updated_at - INTERVAL '6 hours') : kdi.updated_at`.
  3. `scripts/creator-velocity-crawler.mjs` fetched all creator IDs across all workers via an unbounded `SELECT id FROM competitor_profiles`.
- **Verified Solution & Invariant Codification**:
  1. Changed placeholder color fallbacks to `null` and joined `universal_master_pins` in `reconcileQualifiedCatalogPins` to extract authentic `ump.dominant_color`.
  2. In `scripts/keyword-velocity-crawler.mjs`, added `LEFT JOIN universal_master_pins ump ON ump.pin_id = kdi.pin_id` across all three displaced partitions (`folder_pin_partition`, `pin_partition`, `global_pin_partition`), applied the 6-hour offset, and added `missing_created_at_pinterest` cache bypass in `evaluateHydrationGuard`.
  3. Pushed the worker modulo filter into SQL via `ordered_creators` CTE with `ROW_NUMBER() - 1` and `MOD(row_idx, ${workerTotal}) = ${workerIndex}` in `scripts/creator-velocity-crawler.mjs`.
  4. Added top-level `env: DATABASE_TOPOLOGY: unified_postgres` across all 5 `.github/workflows/*.yml` pipelines.
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 100/100 files, 14 locks PASS)
  - `npm run test:offline` (100% PASS)
  - `npm test` (100% PASS)


---

## Round 21: Phase 7 — Zero-404 Pin Dossiers, Pulse Velocity Parity & Folder Crossover Deduplication
- **Round / Feature**: Phase 7 — Pin Dossier Multi-Tier Fallback Synthesis, Velocity Symmetrical Clamp & Creative Deduplication
- **Trap / Failure Mode**: 
  1. Pin Dossier `/pin/:id` returned 404 NOT_FOUND for active folder/crossover pins that were pruned from `universal_master_pins` during storage compaction or resided only in `competitor_pins`, `pa_pins`, or D1 edge cache.
  2. Pulse Radar displayed a misleading purple `+468/d REPIN SURGE` badge for pins whose authentic save velocity was `+371/d` because stale repin deltas were allowed to exceed save velocity and `Math.max(saves, repins)` overrode authentic save gains.
  3. Folder Crossover Room 2 displayed duplicate identical visual pins side-by-side because different creators pinned the same image or post under distinct Pinterest pin IDs.
- **Root Cause & Technical Mechanism**:
  1. In `src/modules/sharding/fleet-router.mjs`, `fetchUniversalPinDossier` only checked `universal_master_pins` on the shard/hub. If `masterRecord` was null, it failed immediately with 404 without synthesizing from `competitor_pins`, `pa_pins`, or D1 `edge_pins_metadata`.
  2. In `scripts/backfill_rolling_window_gains.mjs` and `src/modules/pulse/service.mjs`, `delta_repins_24h` lacked an upper bound against daily save velocity. When Pinterest repin counters fluctuated or lagged, stale repin deltas exceeded daily saves.
  3. In `src/modules/keywords/folders-service.mjs`, `_executeFolderCrossover` mapped pins purely by `p.pin_id`, retaining identical duplicate creative assets across different boards/accounts.
- **Verified Solution & Invariant Codification**:
  1. Multi-Tier Dossier Synthesis: Enhanced `fetchUniversalPinDossier` to query `competitor_pins` and `pa_pins` in parallel with SERP/KDI, synthesize `masterRecord` from any available pillar, fall back to on-demand D1 query, and synthesize a 1-day fallback snapshot in `snapshotMap` so `daily_trajectory` is never empty.
  2. Physical Invariant Clamping: Enforced `if (saveDelta24h > 0 && delta_repins_24h > saveDelta24h) delta_repins_24h = saveDelta24h` in `calculateRollingGainsFromSnapshots` and `service.mjs`, and updated `src/pulse-ui.mjs` to prioritize rose Save Velocity whenever `daily_save_velocity || delta_saves_24h > 0`.
  3. Crossover Creative Deduplication: Grouped `allPins` by canonical creative key (`img:hash` or `ts:title:saves`), merging multi-keyword rankings into a single canonical pin card before computing Super Pins and tag bridges.
  4. Cache Busting & Compaction: Bumped cache keys to `crossover:v4` and `pulse:global_24h:summary:v2`, cleared `keyword_folder_synopses`, and ran `VACUUM FULL ANALYZE` keeping Central Hub storage at 170 MB (< 195 MB limit).
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 101/101 files, 14 locks PASS)
  - `npm run test:offline` (13 suites, 100% PASS)
  - `npm test` (21 suites, 100% PASS)
  - Live Neon Hub verification: Pin #1098245059160132988 displays exact +371/d velocity across Pulse Radar and Dossier; Pin #524950900340768832 resolves cleanly; Folder 5 Crossover has 0 duplicate twin pins and 10/10 working dossiers.

---

## Round 22: Phase 8 — End-to-End Forensic Database Reality Healing & Clean-Slate Single-DB Pipeline Rewrite
- **Round / Feature**: Phase 8 — Critical Domain Law (`repin_count` vs `save_count`), Anti-Sawtooth Database Healing, Room 2 Tag Matrix Hydration & Room 3 Surging Creator Parity
- **Trap / Failure Mode**: 
  1. The Sawtooth Hydration Spike Trap: Pins with steady saves (e.g. 19,236 saves) oscillated between authentic saves and repins (11,989), producing fake recurring daily velocity spikes (+7,247/d).
  2. Banned Assumption Trap (`save_count >= repin_count`): Code previously assumed `saves >= repins`, treating `prevSaves < prevRepins` as a hydration jump and clamping `delta_repins_24h <= daily_save_velocity`. On authentic Pinterest pins, `repin_count` is frequently greater than `save_count`.
  3. Room 2 Empty Pattern Trap: Visual annotations were missing in `keyword_serp_current`, and candidate pin selection was artificially choked to 40 pins with 4 tags, resulting in empty co-occurrence matrices.
  4. Room 3 Creator Inversion Trap: Snapshot subtraction of unhydrated 0-reach/views snapshots (`monthly_reach - 0`) generated millions of fake reach delta, pushing stagnant accounts to #1 and burying authentic breakout creators (+296k, +168k). Driver pins displayed "No driver pins in SERP" due to strict velocity > 0 filtering and case-sensitive username mismatch.
- **Root Cause & Technical Mechanism**:
  1. `formatPin` in `scripts/lib/pinterest.mjs` had `const saves = hasExplicitSaves ? Math.max(rawSaves, rawRepins) : rawRepins;`. When lightweight `PinResource` returned `rawSaves = 0`, repins were stored in `save_count`, creating non-monotonic sawtooth drops.
  2. Anti-hydration guards in `math.mjs`, `fleet-router.mjs`, and `pin-details-ui.mjs` checked `if (prevSaves < prevRepins) return true`, suppressing valid trajectories.
  3. `queryActiveSerp` used `COALESCE(ksc.visual_annotations, '[]'::jsonb)` without joining `universal_master_pins.visual_annotations`.
  4. `queryBreakoutCreators` computed `monthly_reach - sp1.prev_reach_1d` even when `prev_reach_1d = 0`.
- **Verified Solution & Invariant Codification**:
  1. Database Reality Healing (`scripts/phase8_db_healer.mjs`): Repaired 2,082 sawtooth rows in `pins_daily_metrics`, recalculated 7,198 velocities, synchronized 1,772 KSC and 2,489 KDI rows, cross-pollinated 875 visual annotation rows, pruned 10,450 zero snapshots, keeping database size at 155 MB (< 195 MB limit).
  2. Authentic Pinterest Law Codified: Eradicated all `Math.max(saves, repins)` overrides and removed `prevSaves < prevRepins` jump checks across crawlers, math library, and UI components.
  3. Visual Annotations Cross-Pollination: Added `COALESCE(NULLIF(ksc.visual_annotations, '[]'::jsonb), NULLIF(ump.visual_annotations, '[]'::jsonb), '[]'::jsonb)` in `queryActiveSerp` and `queryViralCreatorPins`.
  4. Room 3 Surging Creators Parity: Added `AND sp1.prev_reach_1d > 0` guard, sorted top creators by `effective_delta_reach_24h DESC`, case-normalized username joins, and preserved portfolio driver pins without requiring velocity > 0.
  5. Cache Invalidation: Bumped KV cache keys to `pulse:global_24h:summary:v3` and `crossover:v5`.
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 111/111 files, 14 locks PASS)
  - `npm run test:offline` (13 suites, 100% PASS)
  - `npm test` (21 suites, 100% PASS)
  - `node tests/round15-pulse-v2.test.mjs` (21/21 PASS)
  - `node tests/round16-pulse-503-and-data-truth.test.mjs` (16/16 PASS)
  - Live Neon Hub verification: Pin #911134568440407967 velocity strictly 0; Room 3 ranks Sarah Scoop (+296k) at #1 with 3 driver pins; Folder #5 crossover velocity is strictly 0.

---

## Round 23: Phase 8 UI Parity — Room 5 Pruning Healing, Creator Combined Audience 24h Surge, Tag Bridge Gains & Crossover Velocity Alignment
- **Round / Feature**: Phase 8 UI Parity — Room 5 Pruning Restoration, Creator Hub Combined Audience 24h Surge, Shared Annotation Tag Gains & Crossover Velocity Alignment
- **Trap / Failure Mode**: 
  1. Room 5 Smart Pin Pruning returned 0 candidates on Folder #5 (`high protein`), leaving `Execute Atomic Prune` permanently disabled.
  2. Harvest Quota slider in Room 5 updated only `max_serp_pins`, leaving `max_pins` at the old value when saved. Opening `/folders/:id/settings` blocked for 30s executing visual crossover analysis.
  3. Creator Hub `COMBINED AUDIENCE` displayed `+0 24h` despite active 24h creator gains (e.g. +160k, +118k, etc.).
  4. Shared Annotations Hub displayed `+0 saves_gain` across all rows and fabricated velocity with `(pin_count * 2.4).toFixed(1)`.
  5. Crossover Room 2 suppressed authentic 24h velocity on breakout pins appearing at top of 24h Pulse Radar and ignored `delta_repins_24h` on repin surges.
  6. Stale D1/KV folder cache reads served old folder settings and empty `items: []` in `isUnifiedPostgres` mode.
- **Root Cause & Technical Mechanism**:
  1. In `getPruningCandidates`, line 1469 contained `AND (${resolvedMinPinAge === null})`. When the default `min_pin_age_days: 30` was sent, this evaluated to `AND FALSE`, completely disabling the `keyword_displaced_index` branch.
  2. Range slider had `x-model="folderSettings.max_serp_pins"` without syncing `folderSettings.max_pins`.
  3. `listFolderCreatorsWithDiscovery` calculated `combined_audience`, `combined_impressions`, `combined_pins`, but omitted `delta_24h`, `delta_reach_24h`, `delta_impressions_24h`, `delta_pins_24h` from `totals`. `get folderCompetitorTotals()` returned the backend object directly where `delta_24h` was undefined.
  4. `tagMap` in `folders-service.mjs` Dimension B only accumulated `pin_count` and `total_saves`, omitting `saves_gain` and `velocity_gain`.
  5. Legacy pre-Phase-8 `Math.abs((rowSaves - rowRepins) - vel)` zeroing check and `delta24h = Math.min(delta24h, rowGains7d)` clamped legitimate 24h breakouts where 7d gains were not yet backfilled.
  6. KV and D1 caches lacked `!isUnifiedPostgres(env)` bypass in folder read routes.
- **Verified Solution & Invariant Codification**:
  1. In `getPruningCandidates`: Fixed age check `(${resolvedMinPinAge === null} OR ${resolvedMinPinAge <= 0} OR ump.created_at_pinterest IS NULL OR ump.created_at_pinterest <= NOW() - (${resolvedMinPinAge} || ' days')::interval)` and joined `universal_master_pins` for title and date. Tested on Folder #5: returned 205 actual candidates (from 0).
  2. In `src/campaign-folders-ui.mjs`: Added `@input="folderSettings.max_pins = folderSettings.max_serp_pins"`, added `Target Scope` dropdown (`Displaced Vault Pins`, `All Cluster Pins (Active + Vault)`, `Active SERP Only`), passed `scope` in `runPrunePreview` and `executePrune`, and bypassed crossover analysis when `currentRoom === 'settings'`.
  3. In `listFolderCreatorsWithDiscovery`: Computed `totalDeltaAudience24h`, `totalDeltaImpressions24h`, `totalDeltaPins24h` and added them to `totals`. Tested on Folder #5: `totals.delta_24h = 5,462,227` matching sum of `delta_reach_24h`. In `src/dashboard-ui.mjs`, dynamically compute totals across filtered list.
  4. In `folders-service.mjs`: Added `saves_gain` and `velocity_gain` accumulation to `tagMap` and exported in `tagBridges` and `metric_gains`.
  5. In `folders-service.mjs`: Removed obsolete zeroing and clamping heuristics, computed `effective_velocity: vel > 0 ? vel : safeNum(row.delta_repins_24h, 0)` on `pinMap`, and aligned sorting.
  6. In `src/routes/keywords.mjs`: Added `!isUnifiedPostgres(env)` guards to KV reads on folders and creators, added full KV eviction and epoch bump on folder patch and prune.
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 106/106 files, 14 locks PASS)
  - `npm test` (21 suites, 100% PASS)
  - `node --env-file=.env scripts/verify_bug_fixes.mjs` (205 candidates for Folder #5, 5.46M 24h delta audience)

---

## Round 24: Phases 1–4 — Forensic Single-DB Optimization, 80% Egress Deduplication & Cross-Studio Data Parity
- **Round / Feature**: Phases 1–4 — Unified Single-DB Isolation, Folder Crossover SQL Row Deduplication (`pin_rn = 1`), Room 1 & Room 6 Count/Velocity Parity, Domain Studio KPI & Visual DNA Sync, Creator Hub 10M+ Ceiling & Cadence Outlier Guard, and Pin Dossier Provenance Fix
- **Trap / Failure Mode**:
  1. *Room 1 vs Room 6 Velocity & Count Discrepancy*: Displaced Vault pins (e.g., `#175077504261403628` and `#1098245059161615952`) displayed `+0/d` & `+0 (24h)` in Room 1 (`Crossover & Super-Pins`) while ranking at #2 (`+498/d`) and #5 (`+367/d`) in Room 6 (`24h Pulse Radar`). Meanwhile, Room 6 showed `596` Active SERP pins instead of `930` because `queryActiveSerp` capped rows at `LIMIT 1200` before deduplicating `pin_id`, and Room 1 silently truncated `all_pins` with `.slice(0, 1500)`.
  2. *Domain Studio KPI Mismatch, Duplicate Article Thumbnails & `#888888` Visual DNA Pollution*: `makeourrecipes.com` showed `30` Money Articles in the top KPI card while the tab badge showed `44` because KPIs only counted `active_serp` while the tab defaulted to `All` (`Active + Displaced`). Pins that had both active and displaced rows appeared twice side-by-side inside the same article card, and `#888888` polluted 22% of the Visual DNA color palette.
  3. *Pin Dossier Blank Creator Row, Hardcoded Global Pulse Link & Locked Dark Theme*: In `src/pin-details-ui.mjs`, `Provenance Ledger -> Creator` rendered completely blank because an outer `<template x-if>` contained two sibling `<template x-if>` elements without a single wrapper `<div>` (Alpine.js only mounts `content.firstElementChild`). The `24h Pulse Radar` header button hardcoded `/pulse` instead of `/folders/:id/pulse`, and no Light/Dark theme switcher existed.
  4. *Creator Hub `10,000,001` Ceiling Clustering & `2791 Pins / Day` Cadence Skew*: Multiple creators tied at Pinterest's `10,000,001` API ceiling lacked a `10M+` badge and secondary tie-breaker sorting, and marketplace aggregators (`@etsy`, `@etsy_uk`, `@etsyca` with 380M–955M pins) skewed `AVG PINNING CADENCE` to `2791 Pins / Day`.
  5. *Folder Crossover Network Egress Multiplication & Redundant 20-Shard Loop*: `_executeFolderCrossover` transmitted heavy creative strings and `visual_annotations` JSONB across the wire for every keyword appearance of a multi-ranking pin, and executed 20 sequential shard fallback queries against the same single database when `stillMissingAfterHub.length > 0`.
- **Verified Solution & Invariant Codification**:
  1. Unified velocity calculation across `folders-service.mjs` and `campaign-folders-ui.mjs` (`saves_24h` -> `daily_save_velocity` -> `delta_saves_24h` -> `Math.round(gains_7d / 7)`), raised `queryActiveSerp` to `LIMIT 5000` with `rank_position >= 1`, and removed `.slice(0, 1500)` truncation on `all_pins`.
  2. Synchronized Domain Studio KPI cards (`RANKED PINS`, `MONEY ARTICLES`, `MULTIPLIER`, `TOTAL SAVES`) with `studioFilter`, deduplicated article pin cards by `pin_id`, added `Vault #<last_known_rank> · <primary_keyword>` badges, and purged placeholder colors (`#888888`, `#1e1e24`, etc.) from `visual_dna.dominant_colors` and pin rows.
  3. Wrapped the Creator `Provenance Ledger` branches in a single `<div>` inside `<template x-if>`, added Light/Dark theme persistence (`pae_theme`), wired contextual `/folders/:id/pulse` routing, and updated topology labels to `UNIFIED HUB SSOT` / `Unified Central Hub`.
  4. Added `10M+` badges and deterministic tie-breaker sorting in Creator Hub, excluded `>= 1,000,000` pin aggregators from `avg_pinning_cadence`, and synced the `Folder:` select dropdown with `activeFolderId`.
  5. Partitioned `pinRows` and `displacedRows` in `_executeFolderCrossover` with `ROW_NUMBER() OVER (PARTITION BY pin_id ...) AS pin_rn` so heavy creative columns and `visual_annotations` are transmitted at most once per unique pin (`pin_rn = 1`), joined `universal_master_pins` directly in `pinRows`, guarded Tier 3 shard loops and legacy KV/D1 bindings with `!isUnifiedPostgres(env)`, and created `scripts/migrations/047_drop_unused_legacy_tables.sql`.
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 101/101 files, 14/14 locks PASS)
  - `npm test` & `npm run test:offline` (100% PASS)

---

## Round 25: Visual Annotations Crossover Hub Alignment & Algorithmic Blueprint Eradication
- **Round / Feature**: Visual Annotations Crossover Hub UX/Data Upgrade & Complete Algorithmic Topic Cluster Blueprint Removal
- **Trap / Failure Mode**:
  1. *Repetitive 5-Pin Combinatorial Trap*: In Visual Annotations Crossover Hub, default sorting by `synergy_desc` (`lift * log2(support + 1)`) elevated dozens of 5-pin combinatorial permutations of identical pins sharing multiple tags, creating perceptual clutter and appearing redundant compared to the 24h Pulse Radar Intent Matrix.
  2. *Obsolete Synthetic Blueprint Abstraction*: The "Algorithmic Topic Cluster Blueprint" (Section 2 in campaign folders and Dimension 6 in keywords) generated static synthetic spoke prompts and CSV content plans that had become redundant with the live 24h Pulse Radar and Visual Hub.
  3. *Missing Visual Preview & Daily Velocity*: Power pair cards lacked direct visual evidence of the pins that constituted each semantic pairing, and offered no 24h save velocity signal for evaluating current momentum.
- **Root Cause & Technical Mechanism**:
  1. High lift on low-support pairs (`joint_count = 5`) mathematically rivaled high-support pairs under the logarithmic dampener, pushing high-frequency structural anchors (`joint_count >= 30`) down the list.
  2. Spoke generation logic in `folders-service.mjs` was an early synthetic placeholder prior to the introduction of authentic SERP computer-vision visual annotation graphs.
- **Verified Solution & Invariant Codification**:
  1. *Complete Blueprint Removal*: Eradicated Section 2 from `src/campaign-folders-ui.mjs`, Dimension 6 from `src/keywords-ui.mjs`, and synthetic spoke generator from `src/modules/keywords/folders-service.mjs`. Updated UI buttons to directly target `#visual-crossover-hub`.
  2. *Frequency-First Default Sort*: Set `powerPairsSort: 'freq_desc'` by default, ranking macro-pillars (48, 38, 37 pins) at the top and eliminating combinatorial repeats.
  3. *Joint Pins Preview & 24h Velocity*: Updated `computePowerPairs()` to store matching pin summaries (`pairPinsMap`) and aggregate daily save velocity (`total_velocity`). Rendered a 4-pin thumbnail strip with individual `+X/d` velocity badges, top-bar `⚡ +X/d` aggregate badge, sortable `24h Velocity` column in Table view, and context-preserving pin navigation (`[INVARIANT-LOCK 5]`).
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 102/102 files, 14 locks PASS)
  - `npm run test:offline` (13 suites, 100% PASS)


---

## Round 26: Complete Cloudflare (KV, D1, Hyperdrive) Architectural Purge & Pure Neon / Coolify Readiness
- **Round / Feature**: Architectural Purge of Cloudflare Layers (`PIN_ENGINE_KV`, `PIN_D1_DB`, `createHyperdriveClient`, `edge_pins_metadata`, `d1-metadata.mjs`) & Complete Node.js / Coolify VPS Portability
- **Trap / Failure Mode**:
  1. *Dual Runtime Entanglement*: The codebase contained legacy Cloudflare edge wrappers (`PIN_ENGINE_KV`, `PIN_D1_DB`, `Hyperdrive`, `d1-metadata.mjs`, socket drain loops) that complicated standalone Node.js execution on a VPS container (Coolify / Docker).
  2. *Legacy Tests Breakage*: 5 test suites (`test_cloudflare_edge_modernization.mjs`, `test_phase2_read_acceleration.mjs`, `test_p3_cleanup.mjs`, `test_jit_warming_and_d1_trajectory.mjs`, `test_domain_dossier_benchmark.mjs`) were hardcoded to expect deleted Cloudflare layers.
  3. *Folder Matrix Deficiencies*: Guided Search Capsules suffered from keyword bleeding, syndicated repin clones polluted triplets and color palettes, and `dominant_color` was missing in `ranked_active` queries.
- **Root Cause & Technical Mechanism**:
  1. Cloudflare Workers KV and D1 edge caches were remnants of the early edge deployment before consolidating onto Neon Serverless PostgreSQL with in-memory L0 caching (`getCachedOrFetch`).
  2. Legacy tests had explicit imports of deleted functions (`createHyperdriveClient`, `ensureEdgePinsMetadataTable`, `deleteFolderFromD1`).
- **Verified Solution & Invariant Codification**:
  1. *Complete Codebase Purge*: Purged all references to `PIN_ENGINE_KV`, `PIN_D1_DB`, `createHyperdriveClient`, `getPinKvKeysToEvict`, and `d1-metadata` across `src/` (0 occurrences remain, verified by Lock 6). Deleted `src/modules/keywords/d1-metadata.mjs`.
  2. *Pure Neon Architecture*: `server.mjs` and `worker.mjs` operate on standard HTTP + pure Neon Serverless PostgreSQL (`topology: unified_postgres`).
  3. *Folder Matrix Upgrades*: Fixed whole-word matching and folder umbrella term exclusion in Guided Search Capsules; unified syndicated duplicate repin clones via normalized image signature and domain; joined `universal_master_pins` for `dominant_color` in `ranked_active`.
  4. *Test Modernization*: Modernized all 5 legacy test suites to test pure Neon architecture.
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 103 files, 14/14 locks PASS)
  - `npm test` (All 21 test suites, 100% PASS, exit code 0)

---

## Round 27: Complete InstaBox Dedicated PostgreSQL 16 Migration, Cloudflare Zero Trust Tunnel & CI Hardening
- **Round / Feature**: 100% Zero-Loss Database Migration from Neon Serverless to InstaBox Dedicated PostgreSQL 16 on 20 GiB persistent volume (`/data/postgres`), Cloudflare Zero Trust Tunnel (`cloudflared`) routing `https://app.hymum.com`, and CI Security & DDL Parity.
- **Trap / Failure Mode**:
  1. *Schema Omission on Migration*: Columns `created_at_pinterest` (TIMESTAMPTZ) and `creation_method` (VARCHAR) in `keyword_serp_current` existed in live Neon but were absent from SQL migration files, causing `Failed to load Pulse data: column ksc.created_at_pinterest does not exist` on `/pulse` and silent `.catch(() => [])` query swallowing on `/keywords/:slug` resulting in false "No Snapshots" empty states.
  2. *Truncate Cascade Foreign Key Invalidation*: Truncating parent table `keyword_folders` cascaded across foreign keys to `folder_competitor_items`. Re-syncing required strict FK pre-filtering against existing InstaBox `competitor_profiles` and `keyword_folders`.
  3. *CI Security Audit Helper Omission*: `src/dashboard-ui.mjs` was missing `safeUrl(url)`, causing GitHub Actions `CI Quality & Security Pipeline` to fail on push.
- **Root Cause & Technical Mechanism**:
  1. Ad-hoc DDL modifications in production without formal migration files cause subtle schema drift during physical database migrations.
  2. In PostgreSQL, `TRUNCATE ... CASCADE` recursively truncates all child tables referencing foreign keys.
- **Verified Solution & Invariant Codification**:
  1. *Complete DDL & Data Backfill*: Added `created_at_pinterest` and `creation_method` to `keyword_serp_current` on InstaBox, streamed all 6,050 rows from Neon, and synchronized all 19 database tables (`keyword_folders` 6, `keyword_folder_items` 115, `folder_competitor_items` 7,630, `keyword_guided_capsules` 1,422, `keyword_tombstones` 8, `competitor_related_nodes` 1,218).
  2. *Cloudflare Tunnel Deployment*: Dockerized `cloudflared` with tunnel `Api-PAE` routing `app.hymum.com` directly to `http://localhost:3000` on InstaBox with dual-stack `HOST=::`.
  3. *CI Audit Compliance*: Implemented `safeUrl(url)` with URL prefix filtering in `src/dashboard-ui.mjs`, achieving 100% green CI pipeline runs.
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 14/14 locks PASS)
  - `node scripts/audit_ui.mjs` (83/83 rules passed, 100% compliant)
  - Live HTTP endpoints: `curl http://localhost:3000/api/pulse/24h` (HTTP 200), `curl http://localhost:3000/api/folders` (HTTP 200), `curl http://localhost:3000/api/keywords/serp-compare?slug=marry-me-chicken-crock-pot` (HTTP 200).

---

## Round 28: Forensic Landmine Neutralization (Landmines A–E) & Native VPS PostgreSQL SSOT
- **Round / Feature**: Forensic Neutralization of 5 Architectural Landmines (A–E) in routing, live synchronization, monotonic velocity clamps, canonical pin resolution, and UI/CI topology nomenclature.
- **Trap / Failure Mode**:
  1. *Landmine A (Registry Leak & Shard Map Poisoning)*: In `src/modules/sharding/fleet-router.mjs` and `scripts/crawler-engine.mjs`, `preloadNeonRegistry` queried `neon_projects_registry` whenever `DATABASE_TOPOLOGY` was not explicitly passed in CLI runs, re-populating `globalShardMap` with legacy Neon shard URLs and hijacking database routing away from Native VPS PostgreSQL.
  2. *Landmine B (Dirty `updated_at` Timestamp & Omitted Master Pin Telemetry)*: In `syncPinAcrossAllFourPillars`, Step 4 updated `updated_at = NOW()` before Step 7 evaluated `COALESCE(last_scraped_at, updated_at)`. If `last_scraped_at` was NULL, the fresh `updated_at` deceived the logic into archiving false intraday snapshots. Crucially, Step 7 updated `daily_save_velocity` but omitted core counters (`save_count`, `repin_count`, `comment_count`, `share_count`, `reaction_count`) in `universal_master_pins`.
  3. *Landmine C (Monotonic Clamp Lock & Intraday Multi-Crawl Deficit)*: `universal_master_pins` updates in `keyword-velocity-crawler.mjs` used `WHEN EXCLUDED.daily_save_velocity > 0`, refusing to update velocity to 0 when growth flattened. Furthermore, running multiple crawls on the same day for displaced pins caused `inspectPin` to compute isolated step gains rather than compounding intraday deltas onto existing daily velocity.
  4. *Landmine D (SSR HTML Fallback Omission for Repin Variants)*: When resolving pins with `canonical_pin_id` whose child pin reported 0 saves or less than repins/minExpectedSaves, `fetchPinFromPinterest` only called `fetchPinFromPinResource(canonId)`. If PinResource failed to return `aggregated_pin_data` for unauthenticated requests, it failed without falling back to full SSR HTML for the canonical pin.
  5. *Landmine E (Legacy Shard Topology & Worker URL Residue)*: Pin details UI badges and logs displayed outdated labels ("Unified Central Hub", "Shard #N", "The Neon Serverless Shard containing this pin is waking up"), and GitHub Actions workflows referenced deprecated `CLOUDFLARE_WORKER_URL`.
- **Root Cause & Technical Mechanism**:
  1. Guard conditions evaluated optional parameters without an unconditional `isUnifiedPostgres(env)` short-circuit.
  2. Step ordering in live sync mutated timestamp columns before reading them for snapshot arbitration, and the SQL `UPDATE` statement lacked primary counter assignments.
  3. Strict `> 0` `CASE` filters prevented downward velocity ratcheting, violating Invariant 5 & Invariant 28.
  4. PinResource unauthenticated endpoints often suppress public aggregates for deep repins, requiring full SSR HTML scraping.
- **Verified Solution & Invariant Codification**:
  1. Hardened `preloadNeonRegistry` with `if (isUnifiedPostgres(env)) return 0;` and enforced single-batch direct `hubSql` execution in `writeBatchToDeterministicShards`.
  2. Updated `save_count`, `repin_count`, `comment_count`, `share_count`, and `reaction_count` atomically in `universal_master_pins` within `syncPinAcrossAllFourPillars`. Restated intraday snapshot condition to require `universal_master_pins.last_scraped_at IS NOT NULL AND (last_scraped_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date`.
  3. Allowed downward velocity updates in `universal_master_pins` when a crawl is live and authentic (`last_scraped_at < NOW() - INTERVAL '2 hours'`), and compounded intraday deltas via `Number(pin.daily_save_velocity || 0) + rawDelta`.
  4. Added `!opts._isCanonicalHop` SSR HTML fallback in `fetchPinFromPinterest` targeting `canonical_pin_id`.
  5. Rebranded all UI telemetry badges to `Native VPS PostgreSQL` / `VPS PostgreSQL SSOT`, and switched workflow notifications to `APP_PUBLIC_URL`.
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 104 files, 14/14 locks PASS)
  - `node scripts/verify_regression_locks.mjs` (All 14 locks 100% green)

---

## Round 29: Neon Total Eradication & Strict VPS-Exclusive Execution Lock
- **Round / Feature**: Permanent eradication of Neon connection strings, removal of legacy local `.env` Neon drift, and locking all migrations, index runs, and API operations strictly to the Native VPS PostgreSQL instance (`pin-arbitrage` on InstaBox, `127.0.0.1:5432/pin_arbitrage`).
- **Trap / Failure Mode**: Local `.env` still pointed `DATABASE_URL` to the deprecated Neon pooler DSN (`ep-polished-unit-axp6khxi-pooler.c-4.us-east-2.aws.neon.tech`), causing local tooling runs (`scripts/migrate.mjs`) to apply changes to Neon while the VPS was paused, creating a false impression of live execution.
- **Root Cause & Technical Mechanism**: Disconnection between developer machine local `.env` and production VPS configuration, combined with VM auto-suspend.
- **Verified Solution & Invariant Codification**:
  1. Resumed InstaBox VM `m_agq2t32m5xv5joj67rqoze5h4u` (`pin-arbitrage`).
  2. Pulled latest git commits into `/data/app` on the VPS.
  3. Ran Migration 050 and `scripts/ensure_indexes.mjs` directly against the live VPS PostgreSQL database (`postgresql://postgres:***@127.0.0.1:5432/pin_arbitrage`), dropping `neon_projects_registry`, `pa_pin_metrics`, and `keyword_pins_snapshots`.
  4. Verified 0 dropped tables remaining and verified core data count: 80,857 pins, 5,619 competitors, 121 keywords.
  5. Restarted `pae-server.service` and confirmed HTTP health probe returns `topology: unified_postgres`.
  6. Replaced `DATABASE_URL` in local `.env` with the VPS PostgreSQL URL and purged logged-in cookies (`_auth=1`).
- **Verification Command**:
  - `npm run check` inside `/data/app` on VPS (100% green, 14/14 locks).
  - `curl -s http://127.0.0.1:3000/api/health` (HTTP 200, healthy).

---

## Round 30: Canonical Pin Metric De-Poisoning, Counter Independence & Monotonic Velocity Compounding Eradication
- **Round / Feature**: Complete eradication of cross-pin canonical save-stealing, `repin_count` $\rightarrow$ `save_count` counter conflation, `GREATEST` save/repin locks, same-day baseline feedback loops, and `flushToStorageShards` / `syncPinAcrossAllFourPillars` velocity compounding across the entire codebase and VPS database.
- **Trap / Failure Mode**:
  1. *Landmine A (Canonical Pin Metric Hijacking)*: In `scripts/lib/pinterest.mjs` (`fetchPinHybrid` and `fetchPinFromPinterest`), when a pin had `saves <= repins` or `saves < minExpectedSaves`, the scraper hopped to `canonical_pin_id` and overwrote the child pin's saves and repins with the canonical pin's saves (e.g. #348888302405814587 had 9 saves but inherited 4,229 saves; #1130966525258943811 had 357 saves but inherited 8,570 saves).
  2. *Landmine B (`flushToStorageShards` Property Typo & Yesterday Velocity Compounding)*: In `scripts/keyword-velocity-crawler.mjs` (`flushToStorageShards`), `todayPrev` matched `allSnaps[0]` even when `allSnaps[0]` was yesterday's snapshot (`snapIso < todayUtcIso`), adding yesterday's velocity onto today's delta (`+ intradayAdd`), AND read `gains.delta_saves_24h` (which was `undefined` on `calculateMultiWindowGains`) instead of `gains.daily_save_velocity`, causing `computedVel` to evaluate to `0` and locking `211 + 44 = +255/d` on pin `#1152288254700579018`.
  3. *Landmine C (Same-Day Displaced Baseline Feedback Loop)*: Candidate queries for `keyword_displaced_index` passed `(kdi.updated_at AT TIME ZONE 'UTC')::date as baseline_day_date` unconditionally. When a displaced pin was updated earlier on the same UTC day, a second crawl treated the same-day `save_count` as `baseline_day_saves` with `baseline_day_date = today`, collapsing `delta` to `0`.
  4. *Landmine D (Monotonic `GREATEST` & `Math.max` Save/Repin Locks)*: `inspectPin` (`Math.max(prevKnownSaves, detailSaves)`), `flushBatchToHub` (`COALESCE((ksc.metadata->>'is_deep_hydrated')::boolean, false) = false` and `GREATEST(ksc.save_count, u.authentic_saves)`), `pins_daily_metrics` (`GREATEST` + `EXCLUDED.save_count - pins_daily_metrics.save_count` velocity addition), `fleet-router.mjs`, `keywords/service.mjs`, `creator-velocity-crawler.mjs`, and `crawler-engine.mjs` locked inflated `save_count` and `repin_count` values and blocked downward self-healing.
  5. *Landmine E (`repin_count` Conflation into `save_count`)*: `scripts/lib/pinterest.mjs` (`fetchPinsBatchFromPidgets`), `src/modules/keywords/service.mjs`, `src/modules/cluster/service.mjs`, and `src/campaign-folders-ui.mjs` fell back to `repin_count` when `saves` was omitted or `0`, violating `[INVARIANT: PINTEREST-SAVES-REPINS-INDEPENDENCE]`.
  6. *Landmine F (Explicit Zero-Save Blindness)*: `formatPin` in `scripts/lib/pinterest.mjs` did not distinguish between an omitted `aggregated_pin_data` object and an explicit `saves: 0` field (`has_explicit_saves: true`), causing unnecessary 3-request fallback loops on new 0-save pins (`#4598949345276753984`).
- **Root Cause & Technical Mechanism**:
  Conflation of a pin's authentic metrics with its SEO `canonicalPin` or `repin_count`, asymmetric `GREATEST`/`Math.max` ratchets on `save_count`/`repin_count`, unguarded same-day displaced baseline projection, and reading `gains.delta_saves_24h` instead of `gains.daily_save_velocity` while mixing `todayPrevSnap` with `priorDaySnaps`.
- **Verified Solution & Invariant Codification**:
  1. Completely eradicated the canonical hop in `fetchPinHybrid` and `fetchPinFromPinterest`, removed `canonicalPin?.saveCount`, and added explicit `has_explicit_saves` detection in `formatPin` and `fetchPinsBatchFromPidgets`.
  2. Separated `todayPrevSnap` (`snapIso === todayUtcIso`) from `priorDaySnaps` (`snapIso < todayUtcIso`) in `flushToStorageShards`, fixed `gains.daily_save_velocity`, removed `+ intradayAdd` velocity compounding, and removed `GREATEST` locks and `EXCLUDED.save_count - pins_daily_metrics.save_count` velocity addition in `pins_daily_metrics`.
  3. Guarded `keyword_displaced_index` baseline projection across all 3 candidate queries with `WHEN (kdi.updated_at AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date` and guarded `hasExplicitBaseline` in `inspectPin` with `!rawBaseDateIso || rawBaseDateIso < todayIso`.
  4. Removed `GREATEST` and `Math.max` locks on `save_count` and `repin_count` across `keyword-velocity-crawler.mjs`, `src/modules/sharding/fleet-router.mjs`, `src/modules/keywords/service.mjs`, `scripts/creator-velocity-crawler.mjs`, and `scripts/crawler-engine.mjs`, and added automatic downward self-healing for `keyword_serp_current.baseline_day_saves` whenever `baseline_day_saves > authentic_saves`.
  5. Purged all `repin_count` $\rightarrow$ `save_count` fallbacks in `scripts/lib/pinterest.mjs`, `src/modules/keywords/service.mjs`, `src/modules/cluster/service.mjs`, and `src/campaign-folders-ui.mjs`.
  6. Upgraded `scripts/remediate-canonical-poisoning.mjs` to inspect all canonical-linked and repin-conflated pins via `fetchPinHybrid`, heal `baseline_day_saves` and historical `pins_daily_metrics` velocities, and synchronize all 4 pillars (`universal_master_pins`, `keyword_serp_current`, `keyword_displaced_index`, `competitor_pins`, `pa_pins`).
  7. Codified permanent regression checks in `Lock 14` (`14G`) of `scripts/verify_regression_locks.mjs`.
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 105 files, 14/14 locks PASS).
  - `node scripts/test_p0_hotfixes.mjs && node scripts/test_p1_consolidation.mjs && node scripts/test_phase3_write_and_crawlers.mjs` (100% PASS).

---

## Round 31: Unified Single-Database Consolidation & Complete Eradication of Legacy Sharding Locks
- **Round / Feature**: Architectural restructuring of the project database layer into a unified single-database system (`Native VPS PostgreSQL`), stripping out legacy multi-shard routing paths, duplicate shard-vs-unified SQL branches, and all remaining computational/mathematical locks (`GREATEST` / `Math.max` / `runningMax` / `runningMaxSaves`) inherited from the 99-shard architecture.
- **Trap / Failure Mode**:
  1. *Legacy Trajectory Ratchet Locks*: `sanitizeDossierTrajectory` (`runningMax`) and `fetchUniversalPinDossier` (`runningMaxSaves`) in `src/modules/sharding/fleet-router.mjs` enforced a monotonic ceiling across historical daily snapshots (`if (s < runningMaxSaves) d.save_count = runningMaxSaves`), masking authentic downward corrections in Pin Dossier trajectories.
  2. *Cross-Table Read `GREATEST` Locks*: `src/modules/pulse/service.mjs`, `src/modules/domains/service.mjs`, and `src/modules/keywords/folders-service.mjs` joined `keyword_serp_current` / `keyword_displaced_index` / `competitor_pins` / `pa_pins` with `universal_master_pins` using `GREATEST(COALESCE(ksc.save_count, 0), COALESCE(ump.save_count, 0))` (and `Math.max` in JS), causing any stale un-remediated counter in a secondary table to override the clean SSOT value.
  3. *Write-Path `GREATEST` Locks*: `src/modules/creators/service.mjs`, `src/modules/cluster/service.mjs`, `scripts/cluster-intelligence.mjs`, `scripts/account-related-crawler.mjs`, `scripts/crawler-engine.mjs`, `scripts/optimize_hub_storage.mjs`, `scripts/backfill_rolling_window_gains.mjs`, and `scripts/keyword-velocity-crawler.mjs` still contained residual `GREATEST(..., EXCLUDED.save_count)` or `GREATEST(..., EXCLUDED.repin_count)` locks on write paths.
  4. *Duplicate Multi-Shard Code Paths*: `src/modules/sharding/fleet-router.mjs` (`resolveShardConnection`, `getFleetShardsMap`, `preloadNeonRegistry`, `writeBatchToDeterministicShards`) and `scripts/crawler-engine.mjs` (`bulkInsertMetrics`, `bulkSyncPinsToDeterministicShards`) maintained duplicate `if (isUnifiedPostgres()) { ... } else { ... }` 200-line SQL blocks and dead `neon_projects_registry` fallback queries.
- **Root Cause & Technical Mechanism**:
  During the 99-shard Neon era, cross-shard latency and partial hydration led to defensive `GREATEST` / `Math.max` ratchets and dual-branch SQL routing. In the unified single-database architecture, `universal_master_pins` and `pins_daily_metrics` reside in the same database with atomic transactions, making `GREATEST` ratchets harmful (locking stale inflated numbers) and duplicate SQL branches redundant.
- **Verified Solution & Invariant Codification**:
  1. Removed `runningMax` and `runningMaxSaves` ratchets in `sanitizeDossierTrajectory` and `fetchUniversalPinDossier` (`src/modules/sharding/fleet-router.mjs`).
  2. Replaced all cross-table `GREATEST(COALESCE(..., 0), COALESCE(ump..., 0))` and `Math.max` read locks in `src/modules/pulse/service.mjs`, `src/modules/domains/service.mjs`, and `src/modules/keywords/folders-service.mjs` with clean SSOT resolution (`COALESCE(NULLIF(ksc.save_count, 0), ump.save_count, 0)` / `COALESCE(NULLIF(ump.save_count, 0), ...)`).
  3. Replaced all residual write-path `GREATEST` locks on `saves`/`save_count` and `repins`/`repin_count` across `src/modules/creators/service.mjs`, `src/modules/cluster/service.mjs`, `scripts/cluster-intelligence.mjs`, `scripts/account-related-crawler.mjs`, `scripts/crawler-engine.mjs`, `scripts/optimize_hub_storage.mjs`, `scripts/backfill_rolling_window_gains.mjs`, and `scripts/keyword-velocity-crawler.mjs` with `CASE WHEN EXCLUDED.save_count > 0 THEN EXCLUDED.save_count ELSE ... END`.
  4. Consolidated `resolveShardConnection`, `getFleetShardsMap`, `preloadNeonRegistry`, and `writeBatchToDeterministicShards` in `src/modules/sharding/fleet-router.mjs`, and `bulkInsertMetrics` / `bulkSyncPinsToDeterministicShards` in `scripts/crawler-engine.mjs` into single unified paths, and added `scripts/migrations/051_unified_single_db_consolidation.sql`.
- **Verification Command**:
  - `npm run check` (0 errors, 0 warnings, 105 files, 14/14 locks PASS).
  - `node scripts/test_p0_hotfixes.mjs && node scripts/test_p1_consolidation.mjs && node scripts/test_phase3_write_and_crawlers.mjs && node scripts/test_jit_warming_and_d1_trajectory.mjs` (100% PASS).

---

## Round 32: Frontend UI Hydration Invariant Healing, Pulse Transient Retry, Shared Formatters & Canonical PinRow Consolidation
- **Round / Feature**: Round 32: Frontend UI Hydration Invariant Healing, Pulse Transient Retry, Shared Formatters & Canonical PinRow Consolidation.
- **Trap / Failure Mode**:
  1. *Pin Dossier Trajectory Cliff Wall*: In `src/pin-details-ui.mjs` (`computeChartPoints`), leading zero-save snapshots predating the first positive crawl day were included in SVG coordinate calculation, rendering a false 0 baseline followed by a vertical cliff wall.
  2. *Uncalibrated Baseline 24h Velocity*: In `isHydrationJump`, `prevSaves <= 0 && currSaves > 0` was not immediately caught, causing newly hydrated pins to display artificial amortized lifetime velocity instead of recognizing baseline calibration.
  3. *Missing Reactions in Engagement Card*: Cell 5 displayed only comments and shares, omitting audience reactions (`reaction_count`) despite reactions being included in `totalEngagementScore`.
  4. *Inconsistent Canonical Root Detection*: Top status bar and technical cards lacked explicit `is_canonical_root` handling, causing derivative repins to be indistinguishable from original root pins.
  5. *Pulse Cold-Start / Transient Network Timeout Drops*: `fetchPulseData` lacked retry handling for `TimeoutError`, `AbortError`, or transient network drops, leaving operators with a failed screen when VPS cold-starts took > 15s.
  6. *Duplicated Formatting & Component Redundancy*: Table views across Pulse, Keywords, Folders, and Domains duplicated formatting logic and `<tr>` markup, violating Rule 31 formatting consistency and cluttering maintenance.
- **Root Cause & Technical Mechanism**:
  Lack of leading zero-snapshot exclusion on SVG chart rendering, uncalibrated baseline jump detection, absence of network error catching in the fetch retry loop, and absence of unified UI formatter and component primitives.
- **Verified Solution & Invariant Codification**:
  1. Updated `computeChartPoints()` in `src/pin-details-ui.mjs` to exclude leading zero-save snapshots predating the first positive hydration day.
  2. Enforced `if (prevSaves <= 0 && currSaves > 0) return true;` in `isHydrationJump`.
  3. Returned `'0 today (Hydrated Baseline)'` in `format24hSaveDelta` when `delta === null`.
  4. Added `totalReactions()`, updated `totalEngagementScore()`, and codified `isCanonicalRoot()` and `canonicalPinId()` consistently.
  5. Implemented resilient multi-attempt retry loop in `src/pulse-ui.mjs` with fresh `AbortSignal.timeout(15000)` handling both HTTP 502/503/504 and transient network/timeout errors.
  6. Created `src/ui/shared-formatters.mjs` (and `src/shared-formatters.mjs`) implementing Rule 31, anti-NaN guards, and tabular figures.
  7. Built `src/ui/pin-row.mjs` providing shared `PinRow` template generation with 4-tier image degradation waterfall.
  8. Cleaned up 35MB of orphaned files in `public/assets/aistudio/`.
- **Verification Command**:
  - `node scripts/test_ui_architect_deliverables.mjs` (100% PASS).
  - `npm run check` (109 files, 14/14 regression locks PASS).

