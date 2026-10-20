# Cloudflare Workers Platform Limits & Neon Serverless Documentation Reference

> **Document Status:** Authoritative Architectural Single Source of Truth (SSOT)  
> **Target System:** Pin Arbitrage Engine (PAE)  
> **Sources:**  
> - Cloudflare Official Documentation: `cloudflare/cloudflare-docs` (`limits.mdx`, Context7 MCP `/llmstxt/developers_cloudflare_workers_llms-full_txt`)  
> - Neon Serverless Official Documentation: `mcp-server-neon` (Architecture Overview, Choose Connection, Serverless Driver, Scale-to-Zero, Latency, Connection Pooling)

---

## 1. Executive Summary & Architectural Invariant Mapping

The Pin Arbitrage Engine (PAE) operates a distributed architecture combining:
1. **Edge Runtime:** Cloudflare Workers (Single Worker Router + Domain Routers, D1 Edge Metadata Cache, KV High-Performance Cache, Hyperdrive Connection Pooler).
2. **Central Hub Database:** Neon Serverless PostgreSQL storing operational catalog, SERP active states, competitor tracking, and PinArchive pointers.
3. **99 Distributed Storage Shards:** Neon Serverless PostgreSQL shards partitioned by `(crc32(pin_id) % 99) + 1` housing `universal_master_pins`, `pins_daily_metrics`, and `pin_serp_positions`.

To achieve zero downtime, prevent runtime errors, and avoid silent data loss, the codebase must adhere strictly to the platform physics and limits of both Cloudflare Workers and Neon Serverless.

---

## 2. Cloudflare Workers Platform Limits

### 2.1 Outgoing Connections & Subrequest Ceiling

| Limit Type | Free Plan | Paid (Standard / Workers Paid) | Enterprise | Impact on PAE Architecture |
| :--- | :--- | :--- | :--- | :--- |
| **Simultaneous Outgoing Connections** | **6** | **6** | **6** (Default) | **CRITICAL BOTTLENECK:** Any Worker invocation can only have 6 open outgoing connections waiting for response headers simultaneously. Connections 7+ are queued internally in a FIFO queue. |
| **Subrequests per Request** | 50 | **10,000** (Configurable to 10M via `[limits] subrequests = ...`) | 10,000+ | Unbounded fan-out across 99 shards or external Pinterest calls can exhaust subrequests if misconfigured. |
| **Simultaneous Open WebSockets** | 5 | 32,768 (inbound) / 32 (outbound) | Custom | Not actively used for batch queries. |

#### ⚠️ The 6 Simultaneous Outgoing Connection Trap
- Cloudflare Workers limits each request context to **6 concurrent active outgoing connections** (counting `fetch()`, KV reads/writes, Cache API, R2, and TCP `connect()`).
- When `Promise.allSettled(shards.map(...))` triggers 63 to 99 requests simultaneously, only 6 requests hit the wire immediately.
- Requests 7 through 99 sit in Cloudflare's internal isolate queue. If an `AbortSignal.timeout(2500)` or `5000` is attached, the timer starts ticking while the request is *still queued*, leading to widespread synthetic `AbortError` timeouts before the request even leaves the edge!
- **Mandatory Directive:** All multi-shard queries (e.g. `hydrateDisplacedIndexFromShards`) MUST use an explicit concurrency limiter capped at **$\le 4$ simultaneous connections** with a minimum 6,000ms timeout.

---

### 2.2 Execution Time, Memory & Compute Limits

| Metric | Free Plan | Workers Paid (Standard / Bundled) | Workers Paid (Graduated / Extended Compute) |
| :--- | :--- | :--- | :--- |
| **CPU Time per Request** | 10 ms | 30 ms (default) / Up to 50 ms | Up to 30,000 ms (30s CPU time) |
| **Wall-Clock Time (HTTP Request)** | Up to 15 minutes (as long as client connection remains open and not idle) | Up to 15 minutes | Up to 15 minutes |
| **Wall-Clock Time (Cron Triggers / Scheduled)** | 15 minutes | 15 minutes | 15 minutes |
| **Memory per Isolate** | 128 MB | 128 MB (default) | Configurable up to **10 GB** (10,240 MB) via `wrangler.toml` `[compute] memory = ...` |
| **Script Size (Compressed)** | 1 MB | 10 MB | 10 MB |
| **Environment Variables & Secrets** | 1,000 per worker (5 KB max value) | 1,000 per worker (5 KB max value) | 1,000 per worker (5 KB max value) |

---

### 2.3 Cloudflare D1 Limits (Relational Edge Cache)

| Metric | Official Specification Limit | Architectural Protection Rule in PAE |
| :--- | :--- | :--- |
| **Bound Parameters per SQL Query** | **100 parameters maximum** | Any `SELECT ... WHERE pin_id IN (?, ?, ...)` or batch insert with $> 100$ variables throws `D1_ERROR: too many parameters`. Multi-pin queries MUST be chunked in batches of $\le 50$. |
| **Maximum Row Size** | **2 MB** | Creative metadata (`title`, `description`, `raw_metadata`) must be truncated or sanitized before D1 insertion. |
| **Database Size** | 10 GB per D1 database | D1 in PAE is strictly an ephemeral 12-hour LRU metadata cache (`edge_pins_metadata`), not a persistent archive. |
| **Batch Operations** | Supported via `env.DB.batch([...])` | Atomic round-trip for multi-statement cache refreshes; avoids individual round-trip network hops. |

---

### 2.4 Cloudflare KV Limits (Global Key-Value Cache)

| Metric | Official Specification Limit | Architectural Protection Rule in PAE |
| :--- | :--- | :--- |
| **Write Rate to Same Key** | **1 write per second** | High-frequency writes to the exact same key (e.g. global counters or hot pin dossiers) will be rate-limited (HTTP 429). Evictions and syncs must not spam identical keys in tight loops. |
| **Minimum Expiration TTL** | **60 seconds** | `expirationTtl` must be $\ge 60\text{s}$. (CacheTtl on read can be 30s). |
| **Maximum Value Size** | **25 MB** | Pin dossier JSON is well within limits ($\approx 5\text{ KB} - 15\text{ KB}$). |
| **Consistency Model** | Eventual consistency (up to 60s global propagation) | Local memory L0 cache must be invalidated immediately when KV is updated. Live sync MUST purge D1 and KV keys in tandem. |

---

### 2.5 Cloudflare Hyperdrive Limits

| Metric | Official Specification Limit | Architectural Protection Rule in PAE |
| :--- | :--- | :--- |
| **Origin Connections (Soft Limit)** | **20 connections** (Free) / **60–100 connections** (Paid) | Hyperdrive pools connections to Neon Central Hub. Workers must NOT open multiple separate `postgres.js` instances per request. Instances must be reused or scoped cleanly with `max: 1` or `max: 2`. |
| **Statement Timeout** | **60 seconds** | Hub compaction or multi-table updates must complete well within 60s. |
| **Cached Query Response Size** | **50 MB** | Large analytical exports must stream or paginate. |

---

## 3. Neon Serverless Architecture & Operational Limits

### 3.1 Decoupled Lakebase Architecture

Neon decouples **Compute** (ephemeral PostgreSQL engines) from **Storage** (Lakebase distributed storage engine):
```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers Edge                  │
└──────────────┬───────────────────────────────┬──────────────┘
               │ (Hyperdrive TCP / HTTP)       │ (Stateless HTTP / HTTPS)
               ▼                               ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│  Neon Central Hub (Compute)  │ │  Neon Shards 1..99 (Compute) │
│   - Scale-to-zero (300s-900s)│ │   - Scale-to-zero (300s)     │
│   - PgBouncer Transaction Pool│ │   - Ephemeral Stateless      │
└──────────────┬───────────────┘ └──────────────┬───────────────┘
               │                                │
               ▼                                ▼
┌─────────────────────────────────────────────────────────────┐
│                   Neon Storage Layer (Lakebase)             │
│  1. Safekeepers (Paxos consensus quorum for durable WAL)    │
│  2. Pageservers (On-demand random page cache & snapshotting)│
│  3. S3 / GCS Object Storage (Cold durable block store)      │
└─────────────────────────────────────────────────────────────┘
```

1. **Safekeepers:** Form a Paxos consensus quorum receiving WAL records. A commit is acknowledged once safely stored across safekeepers.
2. **Pageservers:** Process WAL records and serve PostgreSQL read requests for pages not cached in compute RAM.
3. **Scale-to-Zero Invariant:** When no client queries a compute node for 5 minutes (default `suspend_timeout_seconds = 300`), the compute suspends. Storage remains 100% durable and intact.

---

### 3.2 Cold Start Latency & Keep-Alive Strategies

| Compute State | Time to First Byte (TTFB) | Architectural Handling in PAE |
| :--- | :--- | :--- |
| **Warm Compute (Active)** | $10\text{ms} - 35\text{ms}$ | Fast path for operational catalog reads and live updates. |
| **Cold Compute (Scale-to-Zero)** | **$500\text{ms} - 2,500\text{ms}$** | Waking a suspended shard takes up to 2.5 seconds. Querying 63 cold shards concurrently through Cloudflare's 6-connection ceiling results in $(63 / 6) \times 1.5\text{s} \approx 15.75\text{s}$ total queue latency! |

#### Optimization Directives for Cold Starts:
1. **Hub Keep-Alive for Operator Session:** The Central Hub should have its compute suspension timeout set to `suspend_timeout_seconds = 900` (15 minutes). During a single-operator work session, the Hub remains warm, preventing repeated cold-start penalties.
2. **Shard Queries Strictly On-Demand:** Shards should scale to zero after 300s. Never attempt to "warm up" all 99 shards simultaneously. Queries to shards must be localized to only the specific `getPinShardId(pinId, 99)` needed.
3. **HTTP Client Transport for Shards:** Use stateless `@neondatabase/serverless` `neon(shardUrl)` HTTP calls. HTTP connections do not hold stateful TCP sockets and naturally absorb cold starts without leaving orphaned socket leaks.

---

### 3.3 Neon Driver Transport Strategy: HTTP vs WebSocket vs Hyperdrive TCP

| Feature / Trait | Neon HTTP (`neon(url)`) | Neon WebSocket (`Pool` / `Client`) | Hyperdrive TCP (`postgres.js`) |
| :--- | :--- | :--- | :--- |
| **Connection Mechanism** | Stateless HTTPS/HTTP2 requests | Persistent WebSocket connection | TCP connection proxied through Cloudflare Edge |
| **Handshake Latency** | **Fastest (~3 round trips)** | Moderate (~5 round trips) | Moderate (~8 round trips without Hyperdrive) / Fast with Hyperdrive |
| **Interactive Transactions** | ❌ No (`BEGIN; ...; COMMIT;` must be passed as an atomic batch array via `neon.transaction([...])`) | ✅ Full interactive support | ✅ Full interactive support (`sql.begin(async tx => ...)`) |
| **Resource Cleanup** | **Zero cleanup required** (stateless) | Must call `client.release()` or `pool.end()` | Must close or rely on Hyperdrive connection lifetime |
| **Best Used For in PAE** | **Mandatory for 99 Shards & stateless Hub queries** | N/A (WebSockets unnecessary for PAE query profile) | **Central Hub multi-table complex transactions only** |

---

### 3.4 PgBouncer Connection Pooling in Transaction Mode

Neon pooled connection strings (`-pooler.region.neon.tech`) use PgBouncer in **transaction pooling** mode:
1. **Session Variables Do NOT Persist:**
   - Any `SET` or `RESET` executed outside a transaction block is discarded the moment that query completes!
   - *Example Bug in Migration `035_displaced_index_domain.sql`:*
     ```sql
     -- INEFFECTIVE in PgBouncer transaction mode:
     SET lock_timeout = '3000';
     ALTER TABLE keyword_displaced_index ADD COLUMN IF NOT EXISTS domain VARCHAR(128);
     ```
     The `SET` runs in its own single-query transaction and is immediately reset.
   - *Correct Implementation:*
     ```sql
     BEGIN;
     SET LOCAL lock_timeout = '3000';
     ALTER TABLE keyword_displaced_index ADD COLUMN IF NOT EXISTS domain VARCHAR(128);
     COMMIT;
     ```
2. **Unsupported PgBouncer Features in Transaction Mode:**
   - `LISTEN` / `NOTIFY` (not used in PAE).
   - Temporary tables (`CREATE TEMP TABLE` spans multiple transactions and fails).
   - Session-level advisory locks (`pg_advisory_lock` must use transaction-level `pg_advisory_xact_lock`).
   - Prepared statements without special configuration (handled transparently by `@neondatabase/serverless` HTTP driver).

---

## 4. Synthesis: PAE Remediation Blueprint Based on Platform Limits

| Defect Identified in Forensic Audits | Underlying Platform Constraint | Required Remediation Pattern |
| :--- | :--- | :--- |
| **Scatter-Gather Subrequest Exhaustion & AbortError** (`src/modules/keywords/service.mjs:401-457`) | Cloudflare 6-connection ceiling + Neon 2.5s cold start | Implement concurrency limiter `limit = 4`. Group shard queries into sequential chunks of 4. Set per-shard HTTP timeout to 6,000ms. |
| **D1 Parameter Limit Crash** (`D1_ERROR: too many parameters`) | Cloudflare D1 strictly allows $\le 100$ bound parameters per query | Multi-pin bulk queries (`SELECT ... WHERE pin_id IN (...)`) must be capped at 50 IDs per batch. |
| **Hyperdrive Pool Leaks & Fake Transactions** (`src/worker.mjs:731-763`) | Hyperdrive origin limit (20-60 connections) + `postgres.js` pool leaks | Wrap transactional builders cleanly. Never pass raw promise arrays to `sql.transaction(...)`. Ensure `max: 1` connection per request isolate. |
| **4-Pillar Live Sync SQL Mismatch** (`src/routes/pins.mjs:330-391`) | PostgreSQL 42703 (undefined column) on Central Hub | Align all column names with canonical DDL (`save_count`, `created_at_pinterest`, `pin_id`). Remove non-existent columns (`catalog_rank`, `raw_metadata`, `last_crawled_at`). |
| **calculateDailyVelocity 0-Value Poisoning** (`src/routes/pins.mjs:337`) | Object destructuring requirement in `src/lib/math.mjs` | Pass single options object: `calculateDailyVelocity({ currentSaves: newSaves, baselineSaves: prevSaves, currentDate: todayUtc, baselineDate: prevDate })`. |
| **D1 Write vs Delete Invalidation Race** (`src/routes/pins.mjs:444-450`) | Cloudflare Workers asynchronous `ctx.waitUntil()` order of operations | Invalidate caches *before* or *synchronously with* returning data. A live sync must first delete old D1 metadata, then lazily write fresh data without race conditions. |
| **Compaction Data Destruction** (`scripts/optimize_hub_storage.mjs:91-242`) | Zero-Hub-Snapshot Invariant + 035 DDL schema | Offload displaced pin metrics to Shards (`pins_daily_metrics`, `pin_serp_positions`) before deleting from Hub `keyword_serp_current`. Include `domain` in `keyword_displaced_index`. |
