# Pin Arbitrage Engine (PAE) — Architectural & Security Invariants (SSOT)

> **Purpose:** Single canonical engineering rulebook reflecting verified runtime, schema, and security reality across `pin-arbitrage-engine` (Post-Wave 5 Final Architecture).

---

## 1. Canonical Runtime & Module Topology

| Layer | Canonical Module(s) | Responsibility |
| :--- | :--- | :--- |
| **Edge Gate & Wake Proxy** | `workers/wake-shield/src/index.mjs` | Zero-trust Cloudflare Worker enforcing HMAC-SHA256 expiring cookies (`SameSite=Strict`), PIN brute-force rate limiting, same-origin CSRF checks before `x-api-key` injection, and InstaBox `POST /v1/machines/{id}/start` wakeups. |
| **Origin HTTP Server** | `src/server.mjs`, `src/plugins/api-routes.mjs`, `src/http/security-and-response.mjs` | Native Fastify v5 server, `AsyncTaskQueue(4)` (`serverBackgroundTaskQueue`) for non-blocking background work, `/api/competitors/*` -> `/api/creators/*` zero-404 `onRequest` rewrite, closed-by-default CORS, secret redaction, and `TtlSingleflightCache` (`src/lib/ttl-cache.mjs`). |
| **SSR Studio Pages & Shell** | `src/routes/pages.mjs`, `src/ui/{dashboard,keywords,domains,folders,discovery,pulse,pin-details}/index.mjs`, `public/pae-shell.js` | Lazy dynamic-imported HTML studio renderers (`private, no-cache, no-store, must-revalidate`, `Vary: Cookie`) + cached `/pae-shell.js` static browser client (`ETag` SHA-256, `window.PAE`, `window.apiFetch`, non-blocking `toast`/`confirm`). |
| **PostgreSQL 16 Client** | `src/db/client.mjs` | `postgres@3.4.9` (`createSqlClient` / `getSqlClient`), automatic transient read-query retries (`isReadOnlyQuery` + `withDbRetry`), and non-replayable write transactions (`enteredCallback` guard on `sql.begin`). |
| **Pin Persistence & Dossiers** | `src/modules/pins/repository.mjs`, `src/modules/pins/dossier-reader.mjs` | Single-writer `ingestPinsBatch`, `insertNewPinsBatch`, `resavePinsMetricsBatch`, and read-only `getPinDossier`. |
| **Pinterest Scraping & SSRF Guard** | `src/core/pinterest/{client,pins,creators,urls,index}.mjs`, `src/lib/net-guard.mjs`, `src/domain/pin-intelligence.mjs` | Unauthenticated `_auth=0` guest headers (Chrome 131), single-probe `HALF_OPEN` circuit breaker, pinned-IP DNS-rebinding SSRF guard (`pinnedSafeFetch`), 18h hydration freshness gate, and `10,000,001` (`10M+`) ceiling preservation. |
| **CLI Fleets & InstaBox Leases** | `scripts/lib/fleet-runner.mjs`, `scripts/{keyword-fleet,creator-fleet,domain-enrich}.mjs`, `scripts/instabox-boot-sync.sh` | Unified `runFleetLifecycle` guaranteeing InstaBox Activity Lease `PUT`/`DELETE` and `sql.end()` cleanup in `finally`, `Semaphore`-throttled 20-worker crawlers, and hardened VPS boot/PostgreSQL provisioning. |

---

## 2. Unified PostgreSQL 16 Schema & Query Invariants (Squashed Baseline `001`–`002`)

1. **4-Table Pin SSOT + Domain/Cluster/Pulse Supporting Tables:**
   - `universal_master_pins` (`pin_id` PK): master pin catalog, latest counters (`::bigint`), `clean_domain`, visual annotations, and rolling gains (`>= 60%` span / `<= 40%` tolerance).
   - `pins_daily_metrics` (`(pin_id, recorded_date)` PK): daily time-series snapshots.
   - `keyword_serp_positions` (`(keyword_id, pin_id)` PK): active SERP (`is_displaced = FALSE`) and Displaced Vault (`is_displaced = TRUE`).
   - `competitor_board_pins` (`(competitor_id, board_id, pin_id)` PK): creator/board-to-pin join.
   - Supporting tables & MVs: `tracked_keywords`, `keyword_folders`, `keyword_folder_items`, `competitor_profiles`, `competitor_boards`, `competitor_snapshots`, `domain_intelligence_rollup` (single-table domain SSOT), `candidate_graph_nodes`, `app_settings` (global qualification rules SSOT), and `mv_pulse_24h_summary`.
2. **HOT Update & Index Hygiene (`fillfactor = 80`):**
   - Preserve `fillfactor = 80` on the 4 SSOT tables and `domain_intelligence_rollup`. Never add secondary indexes on volatile daily counters (`last_scraped_at`, `updated_at`, `save_count`, `daily_save_velocity`).
3. **20-Worker Deterministic Partitioning:**
   - Parallel crawler fleets slice pins in PostgreSQL using `ABS(hashtext(pin_id::text)::bigint) % 20 = $workerIndex` backed by `idx_*_hashtext_mod20`.
4. **Multi-Row Upsert Safety (`SQLSTATE 21000` & `40P01`):**
   - Deduplicate every batch payload in-memory with `Map` keyed by conflict target prior to `JSON.stringify()`, and enforce deterministic ascending sort (`ORDER BY pin_id ASC`, `(keyword_id, pin_id)`, or `competitor_id ASC`) on `jsonb_to_recordset` upserts.
5. **SARGable Queries, Wildcard Escaping & Safe Casts:**
   - Escape all dynamic `LIKE` / `ILIKE` user or URL inputs with `escapeSqlWildcards()` + `ESCAPE '\\'`.
   - Guard string-to-numeric casts (`aspect_ratio`) with regex validation (`~ '^\d+(\.\d+)?$'`) before `::numeric`, and cast cumulative counters as `::bigint`.
   - Never silently swallow SQL query errors with `.catch(() => [])` or `.catch(() => {})` on read/migration paths; `scripts/migrate.mjs` (`getAppliedMigrations`) MUST fail closed on SQL errors.
6. **Non-Idempotent Write Transaction Safety:**
   - `src/db/client.mjs` (`attachTransactionBridge`) tracks `enteredCallback` inside `sql.begin`: initial pre-callback connection slot errors (`53300`) may retry, but once the callback begins executing statements, `withDbRetry` MUST NEVER replay a mutating transaction on mid-`COMMIT` socket resets.

---

## 3. Pinterest Telemetry, Velocity & Pulse Payload Invariants

1. **Strict Guest Scraping (`_auth=0`):** Public pin and SERP scrapers MUST strip `_auth=1`, run with `_auth=0`, and never implicitly read or mutate `process.env.PINTEREST_COOKIE`.
2. **Independent Counters & `NULL` Unhydrated State:**
   - `save_count` and `repin_count` are independent metrics (`repin_count` can legitimately exceed `save_count`; never treat `prev.save_count < prev.repin_count` as unhydrated). NEVER copy `repin_count` or `LikeAction` into `save_count`.
   - When explicit saves are omitted (`has_explicit_saves === false`), preserve `save_count = null` and `daily_save_velocity = null` (`is_hydrated = FALSE`). Only explicit zero saves (`has_explicit_saves === true`) store `0`.
3. **Anti-Hydration Spike, Gap Decay & Symmetrical Velocity:**
   - Transitions from `prevSaves === null` (or `0` jump) to positive lifetime saves are first-hydration jumps and MUST emit `daily_save_velocity = 0` until a Day-2 baseline exists.
   - Crawl gaps `> 7` days compute decayed daily velocity (`Math.pow(daysDiff, 1.15)`) rather than zeroing velocity, and never lock `daily_save_velocity` behind a monotonic `GREATEST()` ratchet.
4. **Bounded `< 900 KB` Global Pulse Payload (`src/modules/pulse/service.mjs`):**
   - `getGlobal24hPulseService` computes exact full-population KPI totals BEFORE slicing display arrays (`breakout_pins <= 250`, `fresh_rocket_pins <= 100`, `vault_surge_pins <= 150`, `bridge_pins <= 150`, `domainless_viral_pins <= 100`).

---

## 4. Edge, Origin, Creators API & InstaBox Lifecycle Security

1. **Cloudflare Wake-Shield (`workers/wake-shield/src/index.mjs`):**
   - Issue expiring `<expUnixSec>.<hmacSha256Hex>` cookies (`HttpOnly; SameSite=Strict; Secure; Path=/`), rate-limit `POST /api/shield-auth` (`<= 5` failures / `10m` -> `429`), enforce same-origin CSRF checks before `x-api-key` injection, normalize logout redirects strictly to same-origin paths, and never leak `machineId`.
2. **Fastify Origin & `/api/creators` Separation:**
   - Fail closed (`503`) in production when `API_SECRET_KEY` is missing; reject URL query string keys (`?api_key=`, `?key=`) with `401`; require auth on side-effecting GET parameters (`?refresh=true`, `?auto_create=true`).
   - Keep creator account history snapshot deletion (`DELETE /api/creators/snapshot`) strictly isolated from pin daily metric snapshot deletion (`DELETE /api/creators/pin-snapshot`, `DELETE /api/pins/:pin_id/snapshots/:target`, `DELETE /api/pins/:pin_id/daily-metrics/:date`), and preserve per-creator rule overrides (`GET`/`POST /api/creators/rules?id=<competitor_id>`).
3. **Official InstaBox Lifecycle (`scripts/lib/fleet-runner.mjs`):**
   - Long-running crawlers and rollups acquire and renew official activity leases via `PUT /v1/machines/{id}/activity-leases/{taskId}` (`{ ttlSeconds: 600 }` every `240s`) and release them via `DELETE` inside `finally` alongside `await sql.end()`.

---

## 5. UI/UX & Behavioral Testing Mandate

1. **Design & Frontend Safety (`public/pae-shell.js`, `src/ui/**`):**
   - Preserve Light-Mode Bento defaults (`pa_theme`, `.dark` toggled on `document.documentElement` only), `Geist` + `JetBrains Mono` (`tabular-nums`), official Pinterest Business labels (`Impressions`, `Total audience`, `Creator Hub`, `10M+`), single unified sticky header on `/pin/:id` (with contextual breadcrumbs, `Live Deep Sync`, and `Purge Pin`), `window.apiFetch` (`15s` timeout + `res.ok` guards), `window.PAE` formatters (`safeUrl`, `sanitizeCsvCell`, `formatUniversalAge`, `formatNumber`, `escapeHtml`), and single-root wrappers inside every `<template x-if>`.
2. **Strict Offline Verification & BAN on Source-Regex Lock Tests:**
   - `npm run check` (`node scripts/check-syntax-and-templates.mjs && npm run lint`) and `DATABASE_URL="" npm test` (`tests/01..09-*.test.mjs`) MUST run 100% offline and NEVER connect to `DATABASE_URL` or external networks.
   - **ABSOLUTE BAN ON `fs.readFileSync` SOURCE-REGEX LOCK TESTS:** Never write tests that read `.mjs`, `.js`, `.yml`, `.sql`, or `.sh` source files and assert regex substrings against implementation code. All tests in `tests/*.test.mjs` MUST verify runtime behavior through real function calls, `createFastifyApp().inject()`, `vm.Script` execution, Worker `fetch()`, and controlled mocks/fixtures (`tests/fixtures/`).
