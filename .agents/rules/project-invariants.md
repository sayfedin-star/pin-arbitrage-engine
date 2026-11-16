---
trigger: always_on
---

# Pin Arbitrage Engine (PAE) Permanent Architectural Invariants

Refer to `PROJECT_CHARTER_AND_DIRECTIVES.md` and `.agents/rules/canonical-registry.md` for full context. These architectural invariants are permanent for the Fastify + Native PostgreSQL 16 (`pae-postgres`) 4-Table SSOT system:

## 1. Strict Unauthenticated / Guest Scraping Invariant (`_auth=0`)
- **Zero Logged-In User Cookies for Public Pin Metrics:** Public pin/SERP scrapers in `src/core/pinterest/` MUST run unauthenticated (`_auth=0` / no user auth cookies). Logged-in cookies cause Pinterest to zero out public aggregate counters (`saves: 0`).
- **48 Deep SSR Fields:** Extract pin metadata from `__PWS_DATA__` SSR JSON with `PinResource/get` and Pidgets fallbacks, preserving `creation_method` (`carousel`, `video`), affiliate/tracking links (`utmLink`, `trackedLink`), and `closeupUnifiedAttribution.followerCount`.

## 2. Independent Counters (`save_count` vs `repin_count`) & `NULL` Unhydrated State
- **`[INVARIANT: PINTEREST-SAVES-REPINS-INDEPENDENCE]`:** `save_count` and `repin_count` are independent counters (`repin_count` may legitimately exceed `save_count`). NEVER copy `repin_count` into `save_count` when `has_explicit_saves === false`.
- **Unhydrated `NULL` Preservation:** Unhydrated Stage-0 pins keep `save_count = NULL`, `daily_save_velocity = NULL`, and `is_hydrated = FALSE`. Explicit zero saves (`has_explicit_saves === true`) store `0`.

## 3. Anti-Hydration Spike & Symmetrical Velocity
- **`[INVARIANT: ANTI-HYDRATION-SPIKE]`:** When a pin transitions from `prevSaves <= 0` (or `NULL`) to positive lifetime saves on hydration, suppress daily velocity to `0` rather than recording lifetime saves as a 1-day jump.
- **No Monotonic `GREATEST` Velocity Ratchets:** Allow fresh live crawls to adjust `daily_save_velocity` downward when momentum slows, and remove stale `GREATEST` save/repin locks so corrections self-heal.

## 4. Clean-Slate 4-Table SSOT Schema (`Migrations 060–064`)
- Active core tables:
  1. `universal_master_pins` (`pin_id` PK)
  2. `pins_daily_metrics` (`(pin_id, recorded_date)` PK)
  3. `keyword_serp_positions` (`(keyword_id, pin_id)` PK, `is_displaced` separates active SERP vs Displaced Vault)
  4. `competitor_board_pins` (`(competitor_id, board_id, pin_id)` PK)
- All database access flows through `src/db/client.mjs` (`getSqlClient`) and `src/modules/pins/repository.mjs` (`PinRepository`).
- **Partitioning Invariant:** 20 parallel crawler workers partition deterministically in SQL using `ABS(hashtext(pin_id::text)::bigint) % 20 = $workerIndex`.

## 5. Multi-Row Upsert Safety & HOT Update Hygiene
- **SQLSTATE `21000` & `40P01` Prevention:** Deduplicate batch arrays by conflict key via `Map` prior to JSON serialization, select `DISTINCT ON`, and order deterministically (`ORDER BY pin_id ASC`, `competitor_id ASC`) inside `jsonb_to_recordset` upserts.
- **HOT Updates (`fillfactor = 80`):** All 4 SSOT tables and `domain_intelligence_rollup` maintain `fillfactor = 80` with zero secondary indexes on frequently updated volatile counters (`last_scraped_at`, `updated_at`, `save_count`, `daily_save_velocity`).

## 6. SARGable Queries, Wildcard Escaping & Safe Casts
- Normalize domains (`clean_domain` via `normalizeCleanDomain` + trigger `pae_sync_clean_domain()`) and creator handles in JS before querying. Do not wrap indexed columns in redundant SQL functions in `WHERE`/`JOIN` predicates without matching indexes (`idx_ump_creator_clean`, `idx_cp_lower_username`, `idx_tk_lower_keyword`).
- Escape `ILIKE` user inputs with `escapeSqlWildcards` + `ESCAPE '\\'`.
- Guard nullable text-to-numeric casts (such as `aspect_ratio`) with regex format validation (`~ '^\d+(\.\d+)?$'`) to prevent `SQLSTATE 22P02` / `42804`.
- Use `safeIsoDate()` before PostgreSQL `::timestamptz` casts (`SQLSTATE 22007` prevention) and NEVER silently swallow SQL errors with `.catch(() => {})`.

## 7. Security, Privacy & Fastify v5 Runtime
- **Fail-Closed Auth & Secret Redaction:** Production endpoints fail closed (`503`) if `API_SECRET_KEY` is missing when auth is enforced and reject `?api_key=` URL params (`401`). Settings routes (`/api/settings*`) never leak `pinterest_cookie` prefixes and always set `Cache-Control: no-store`.
- **Non-Blocking Fastify Execution:** Long-running background work runs on `serverBackgroundTaskQueue` (`p-limit(4)`), lazy dynamic imports load UI modules per route (`src/routes/pages.mjs`), and static `HEAD` requests return fast `200 OK`.
- **URL Canonicalization:** `sanitizeDestinationUrl` / `canonicalizeArticleUrlForCount` strip fragments and tracking query params (`utm_*`, `fb_*`, `tp_*`, `pin_*`) before URL count queries.

## 8. Frontend & Studio Display Invariants
- **Official Pinterest Business Terminology:** `Profile Views` -> **Impressions**, `Monthly Reach` -> **Total audience**, Subsystem Title -> **Creator Hub**, `10,000,001` ceiling renders **`10M+`**.
- **Rule 31 Universal Time Formatting:** Durations $\ge 365\text{ days}$ render strictly in years (`11.2y`), $< 365\text{ days}$ strictly in days (`145d`) via `formatUniversalAge()`.
- **Resilient Fetch & Alpine DOM Safety:**
  - All UI fetches use `AbortSignal.timeout(15000)`, `AbortController`/sequence checks for stale requests, and check `res.ok` before `.json()`.
  - Browser globals (`localStorage`, `window`, `document`) MUST be guarded (`typeof ... !== 'undefined'`) for headless Node tests.
  - Wrap conditional `<template x-if>` blocks in a single root `<div>` element; keep workspace headers free of `overflow-hidden`; avoid `window.alert()`.
- **Context-Preserving Navigation:** Preserve `?folder_id=...&return_url=...` across pin dossier navigation and validate `is_tracked_competitor === true` before routing to creator dashboards.

## 9. Core Pillar 1 (Cluster Graph) & InstaBox Operations
- Preserve `scripts/cluster-intelligence.mjs`, `src/routes/cluster.mjs`, `src/modules/cluster/service.mjs`, and `.github/workflows/cluster-intelligence.yml` (Seed Pin Cluster Graph & `candidate_graph_nodes`).
- On InstaBox (`pae-postgres` PG16), run DDL only through sequential files in `scripts/migrations/` (`060` baseline through `064+`) and keep `workers/wake-shield/` strictly as a minimal scale-to-zero origin wakeup proxy.
