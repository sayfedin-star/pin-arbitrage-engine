# Pin Arbitrage Engine (PAE) — Architectural & Security Invariants (SSOT)

> **Purpose:** Single canonical engineering rulebook reflecting verified runtime, schema, and security reality across `pin-arbitrage-engine`.

---

## 1. Canonical Runtime & Module Topology

| Layer | Canonical Module(s) | Responsibility |
| :--- | :--- | :--- |
| **Edge Gate & Wake Proxy** | `workers/wake-shield/src/index.mjs` | Zero-trust Cloudflare Worker enforcing HMAC-SHA256 expiring cookies (`SameSite=Strict`), PIN brute-force rate limiting, same-origin CSRF checks before `x-api-key` injection, and InstaBox `POST /v1/machines/{id}/start` wakeups. |
| **Origin HTTP Server** | `src/server.mjs`, `src/plugins/api-routes.mjs`, `src/http/security-and-response.mjs` | Native Fastify v5 server, `AsyncTaskQueue(4)` (`serverBackgroundTaskQueue`) for non-blocking background work, closed-by-default CORS, secret redaction, and bounded in-memory SWR cache. |
| **SSR Studio Pages** | `src/routes/pages.mjs`, `src/*-ui.mjs`, `src/ui/**` | Lazy dynamic-imported HTML studio renderers (`private, no-cache, no-store, must-revalidate`, `Vary: Cookie`). |
| **PostgreSQL 16 Client** | `src/db/client.mjs` | `postgres@3.4.9` (`createSqlClient` / `getSqlClient`), automatic transient read-query retries (`isReadOnlyQuery` + `withDbRetry`), and non-replayable write transactions (`enteredCallback` guard on `sql.begin`). |
| **Pin Persistence & Dossiers** | `src/modules/pins/repository.mjs`, `src/modules/pins/dossier-reader.mjs` | Single-writer `ingestPinsBatch`, `insertNewPinsBatch`, `resavePinsMetricsBatch`, and read-only `getPinDossier`. |
| **Pinterest Scraping Core** | `src/core/pinterest/{client,pins,creators,urls,index}.mjs`, `src/domain/pin-intelligence.mjs` | Unauthenticated `_auth=0` guest headers (Chrome 131 fingerprint), `__PWS_DATA__` / Relay `v3GetPinQueryv2` / Pidgets / `PinResource` extraction (`formatPin`, `extractPinFromHtml`, `extractPinData`), URL canonicalization (`canonicalizeArticleUrlForCount`), and annotation n-gram intelligence. |
| **CLI & InstaBox Leases** | `scripts/lib/cli-utils.mjs`, `scripts/instabox-boot-sync.sh` | Official InstaBox Activity Lease API (`PUT` / `DELETE /v1/machines/{id}/activity-leases/{taskId}`), `Semaphore`-throttled 20-worker crawlers, and hardened VPS boot/PostgreSQL provisioning. |

---

## 2. Unified PostgreSQL 16 Schema & Query Invariants (Migrations `060`–`066`)

1. **4-Table Pin SSOT + Domain/Cluster/Pulse Supporting Tables:**
   - `universal_master_pins` (`pin_id` PK): master pin catalog, latest counters (`::bigint`), `clean_domain`, visual annotations, and rolling gains.
   - `pins_daily_metrics` (`(pin_id, recorded_date)` PK): daily time-series snapshots.
   - `keyword_serp_positions` (`(keyword_id, pin_id)` PK): active SERP (`is_displaced = FALSE`) and Displaced Vault (`is_displaced = TRUE`).
   - `competitor_board_pins` (`(competitor_id, board_id, pin_id)` PK): creator/board-to-pin join.
   - Supporting tables & MVs: `tracked_keywords`, `keyword_folders`, `keyword_folder_items`, `competitor_profiles`, `competitor_boards`, `domain_intelligence_rollup`, `candidate_graph_nodes`, and `mv_pulse_24h_summary` (`REFRESH MATERIALIZED VIEW CONCURRENTLY` outside transactions).
2. **HOT Update & Index Hygiene (`fillfactor = 80`):**
   - Preserve `fillfactor = 80` on the 4 SSOT tables and `domain_intelligence_rollup`. Never add secondary indexes on volatile daily counters (`last_scraped_at`, `updated_at`, `save_count`, `daily_save_velocity`).
3. **20-Worker Deterministic Partitioning:**
   - Parallel crawler fleets slice pins in PostgreSQL using `ABS(hashtext(pin_id::text)::bigint) % 20 = $workerIndex` backed by `idx_*_hashtext_mod20`.
4. **Multi-Row Upsert Safety (`SQLSTATE 21000` & `40P01`):**
   - Deduplicate every batch payload in-memory with `Map` keyed by conflict target prior to `JSON.stringify()`, and enforce deterministic ascending sort (`ORDER BY pin_id ASC`, `(keyword_id, pin_id)`, or `competitor_id ASC`) on `jsonb_to_recordset` upserts.
5. **SARGable Queries, Wildcard Escaping & Safe Casts:**
   - Escape all dynamic `LIKE` / `ILIKE` user or URL inputs with `escapeSqlWildcards()` + `ESCAPE '\\'`.
   - Guard string-to-numeric casts (such as `aspect_ratio`) with regex validation (`~ '^\d+(\.\d+)?$'`) before `::numeric`, and cast cumulative counters as `::bigint`.
   - Never silently swallow SQL query errors with `.catch(() => [])` or `.catch(() => {})` on read/migration paths; `scripts/migrate.mjs` (`getAppliedMigrations`) MUST fail closed on SQL errors.
6. **Non-Idempotent Write Transaction Safety:**
   - `src/db/client.mjs` (`attachTransactionBridge`) tracks `enteredCallback` inside `sql.begin`: initial pre-callback connection slot errors (`53300`) may retry, but once the callback begins executing statements, `withDbRetry` MUST NEVER replay a mutating transaction on mid-`COMMIT` socket resets.

---

## 3. Pinterest Telemetry & Velocity Invariants

1. **Strict Guest Scraping (`_auth=0`):** Public pin and SERP scrapers MUST strip `_auth=1` and run with `_auth=0` (`sanitizeGuestCookie` / `formatPinterestCookie`). Logged-in cookies cause Pinterest to zero out public aggregate save counts.
2. **Independent Counters & `NULL` Unhydrated State:**
   - `save_count` and `repin_count` are independent metrics (`repin_count` can legitimately exceed `save_count`). NEVER copy `repin_count` into `save_count`.
   - When explicit saves are omitted (`has_explicit_saves === false`), preserve `save_count = null` and `daily_save_velocity = null` (`is_hydrated = FALSE`). Only explicit zero saves (`has_explicit_saves === true`) store `0`.
3. **Anti-Hydration Spike & Symmetrical Velocity:**
   - Transitions from `prevSaves <= 0` (or `NULL`) to positive lifetime saves are first-hydration jumps and MUST emit `daily_save_velocity = 0` until a genuine Day-2 baseline exists.
   - Never lock `daily_save_velocity` behind a permanent monotonic `GREATEST()` ratchet.

---

## 4. Edge, Origin & InstaBox Lifecycle Security

1. **Cloudflare Wake-Shield (`workers/wake-shield/src/index.mjs`):**
   - Issue expiring `<expUnixSec>.<hmacSha256Hex>` cookies (`HttpOnly; SameSite=Strict; Secure; Path=/`), verified in constant time with `Date.now() / 1000 < exp`.
   - Rate-limit failed `POST /api/shield-auth` attempts per `CF-Connecting-IP` (`<= 5` failures / `10m` -> `429` with `Retry-After`, bounded `Map <= 2000`).
   - Enforce same-origin CSRF checks (`Origin === url.origin` and `Sec-Fetch-Site === 'same-origin'` when present) on all mutating cookie-authenticated requests BEFORE injecting `x-api-key` or waking/proxying the origin.
   - Normalize logout redirect targets strictly to same-origin paths (`'/' + rawPath.replace(/^[\\/]+/, '')`), escape `<`, `>`, `&` (`\u003c`, `\u003e`, `\u0026`) in inline script JSON, and never leak `machineId` in HTML or JSON responses.
2. **Fastify Origin Hardening:**
   - Fail closed (`503`) in production when `API_SECRET_KEY` is missing; reject URL query string keys (`?api_key=`, `?key=`) with `401`.
   - Keep `getCorsHeaders()` closed when `ALLOWED_ORIGINS` is unset (never reflect arbitrary `Origin` or emit `*` by default).
   - Redact secrets (`redactSecrets()`) across error payloads and `/api/health`; redact `pinterest_cookie` (`''`) and emit `Cache-Control: no-store, no-cache, must-revalidate, private` on `/api/settings*`.
3. **Official InstaBox Lifecycle (`scripts/lib/cli-utils.mjs` & `.github/`):**
   - Long-running crawlers and rollups acquire and renew official activity leases via `PUT /v1/machines/{id}/activity-leases/{taskId}` (`{ ttlSeconds: 600 }` every `240s`) and release them via `DELETE` inside `finally` alongside `await sql.end()`, allowing clean `30m` idle auto-pause (`0s` cooldown).

---

## 5. UI/UX & Behavioral Testing Mandate

1. **Design & Frontend Safety (`DESIGN.md`, `.agents/skills/web-design-guidelines`, `.agents/skills/writing-guidelines`):**
   - Preserve Light-Mode Bento defaults (`pa_theme`, `.dark` toggled on `document.documentElement` only), `Geist` + `JetBrains Mono` (`tabular-nums`), official Pinterest Business labels (`Impressions`, `Total audience`, `Creator Hub`, `10M+`), `safeUrl()`, `sanitizeCsvCell()`, browser global `typeof` guards, and single-root `<div>` wrappers inside `<template x-if>`.
2. **Strict Offline Verification & BAN on Source-Regex Lock Tests:**
   - `npm run check` (`node scripts/check-syntax-and-templates.mjs && npm run lint`) and `npm test` (`NODE_ENV=test node --test tests/*.test.mjs`) MUST run 100% offline and NEVER connect to, lock, refresh views on, or write to `DATABASE_URL` or external networks.
   - **ABSOLUTE BAN ON `fs.readFileSync` SOURCE-REGEX LOCK TESTS:** Never write tests that read `.mjs`, `.yml`, `.sql`, or `.sh` source files and assert regex substrings against implementation code. All tests in `tests/*.test.mjs` MUST verify runtime behavior through real function calls, `createFastifyApp().inject()`, Worker `fetch()`, and controlled mocks/fixtures (`tests/fixtures/`).
