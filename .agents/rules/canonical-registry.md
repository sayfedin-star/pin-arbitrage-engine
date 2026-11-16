---
trigger: always_on
---

# Pin Arbitrage Engine (PAE) Canonical Function & Routing Registry

> **Purpose:** Single Source of Truth (SSOT) defining the live canonical modules, tables, and query flows in `pin-arbitrage-engine`.
> **Enforcement Rule:** Reuse these canonical modules directly. Do NOT create duplicate SQL upsert pipelines or obsolete Neon/Cloudflare sharding wrappers.

---

## 1. Unified PostgreSQL 16 Database Core (4-Table SSOT, Migrations `060`–`064`)

| Entity | Canonical Table | Primary Key / Natural Key | Primary Service / Location |
| :--- | :--- | :--- | :--- |
| **Database Connection Pool** | `pgClient` (`postgres.js`) | `getSqlClient()` / `createSqlClient()` | `src/db/client.mjs` |
| **Master Pin Catalog** | `universal_master_pins` | `pin_id` (`VARCHAR(255) PK`) | `src/modules/pins/repository.mjs` |
| **Daily Time-Series Metrics** | `pins_daily_metrics` | `(pin_id, recorded_date)` (`PK`) | `src/modules/pins/repository.mjs` |
| **SERP & Displaced Vault** | `keyword_serp_positions` | `(keyword_id, pin_id)` (`PK`, `is_displaced`) | `src/modules/keywords/service.mjs`, `src/modules/pins/repository.mjs` |
| **Creator/Board Pin Links** | `competitor_board_pins` | `(competitor_id, board_id, pin_id)` (`PK`) | `src/modules/creators/*.mjs` |
| **Tracked Creators & Boards** | `competitor_profiles`, `competitor_boards` | `id` / `LOWER(username)` | `src/modules/creators/*.mjs` |
| **Keywords & Folders** | `tracked_keywords`, `keyword_folders`, `keyword_folder_items` | `id` / `canonical_keyword` | `src/modules/keywords/*.mjs` |
| **Domain Rollups** | `domain_intelligence_rollup` | `domain` / `clean_domain` | `src/modules/domains/service.mjs` |
| **Cluster Graph** | `candidate_graph_nodes` | `seed_pin_id`, `pin_id` | `src/modules/cluster/service.mjs` |
| **24h Pulse Summary MV** | `mv_pulse_24h_summary` | `summary_id = 1` (`REFRESH CONCURRENTLY`) | `src/modules/pulse/service.mjs` |

---

## 2. Canonical Application & Crawler Modules

### A. Database Client & Atomic Transactions (`src/db/client.mjs`)
- Use `getSqlClient(env)` or `createSqlClient(dsn)` (never import legacy sharding routers or `@neondatabase/serverless`).
- All multi-statement atomic transactions use `sql.begin(async (tx) => ...)` or lazy builders passed to `sql.transaction(builders)`.
- Automatic backoff retries cover transient `SQLSTATE 53300`/socket errors (`withDbRetry`); read-only queries automatically retry on transient drops via proxy without double-retrying writes.

### B. Unified Pin Persistence & Dossier Reads (`src/modules/pins/repository.mjs`)
- **`ingestPinsBatch(sql, pins, options)`**: Single canonical atomic ingestion pipeline computing velocities, protecting unhydrated `NULL` state, and upserting `universal_master_pins`, `pins_daily_metrics`, and `keyword_serp_positions` with `Map` deduplication and `ORDER BY pin_id ASC`.
- **`insertNewPinsBatch(sql, pins, pillar)`**: First-time discovery ingestion delegating cleanly to `ingestPinsBatch`.
- **`resavePinsMetricsBatch(sql, pins)`**: Metric refresh & daily snapshot persistence.
- **`getPinDossier(sql, pinId, options)`**: Single-roundtrip read-only pin dossier (creative metadata, creator context, keyword rankings, 30-day trajectory from `pins_daily_metrics`) with ZERO read-path DB mutations.

### C. Pinterest Scraping & Parsing Core (`src/core/pinterest/`)
- HTTP client (`src/core/pinterest/client.mjs`), HTML/Relay SSR parser (`src/core/pinterest/parser.mjs`), batch Pidgets/PinResource helpers (`src/core/pinterest/pins.mjs`), creator extraction (`src/core/pinterest/creators.mjs`), URL canonicalizer (`src/core/pinterest/urls.mjs`), all re-exported through `src/core/pinterest/index.mjs`.
- Enforces guest `_auth=0` requests, Chrome 131 fingerprinting, 48 deep SSR fields, and explicit `save_count = null` + `has_explicit_saves = false` when saves are omitted.

### D. Fastify v5 HTTP Server & API Routes (`src/server.mjs`, `src/plugins/api-routes.mjs`)
- Native Fastify v5 server hosting SSR studio HTML pages (`src/routes/pages.mjs` with lazy dynamic imports) and API routes (`src/routes/keywords.mjs`, `creators.mjs`, `domains.mjs`, `cluster.mjs`, `pins.mjs`).
- Background non-blocking work executes via `serverBackgroundTaskQueue` (`p-limit(4)`), never blocking HTTP responses.
- Settings & cookie endpoints (`/api/settings*`) strictly redact secret values and emit `Cache-Control: no-store`.

### E. 20-Worker Crawler Partitioning (`scripts/*`)
- Partition pins in PostgreSQL using `ABS(hashtext(pin_id::text)::bigint) % 20 = $workerIndex` (backed by `idx_*_hashtext_mod20` from Migration `062`).
- Crawlers route pin batches through `PinRepository.ingestPinsBatch` (or HTTP `POST /api/internal/ingest` when ingest endpoint is configured).

---

## 3. Prohibited Anti-Patterns

1. ❌ Importing or recreating Neon 99-shard routers, `@neondatabase/serverless`, `pae_crc32_shard_id`, or `shard_id` columns.
2. ❌ Referencing Cloudflare Workers KV (`PIN_ENGINE_KV`), D1 (`PIN_D1_DB`, `edge_pins_metadata`), or `HYPERDRIVE` bindings inside application runtime code.
3. ❌ Querying dropped pre-060 tables (`keyword_serp_current`, `keyword_displaced_index`, `pa_pins`, `competitor_pins`, `pin_serp_positions`, `pins_daily_snapshots`, `keyword_pins_snapshots`).
4. ❌ Duplicating raw `INSERT INTO universal_master_pins ... ON CONFLICT` SQL in crawlers instead of calling `PinRepository.ingestPinsBatch`.
5. ❌ Falling back `save_count` to `repin_count` or turning unhydrated `NULL` saves into `0`.
6. ❌ Exposing raw or partial `pinterest_cookie` prefixes in any API response or omitting `Cache-Control: no-store` on settings endpoints.
