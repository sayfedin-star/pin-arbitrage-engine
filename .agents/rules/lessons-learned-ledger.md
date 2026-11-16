---
trigger: always_on
---

# Pin Arbitrage Engine (PAE) Lessons Learned & Architectural Memory Ledger

> **Purpose:** High-signal Git-native memory ledger capturing active failure modes, root causes, and verified patterns for the unified Fastify v5 + PostgreSQL 16 4-Table SSOT system (pruned of pre-060 Neon/D1/KV/99-shard history).

---

## Ledger Index

| Milestone | Scope | Key Pattern Enforced |
| :--- | :--- | :--- |
| **Migration 060 Clean-Slate SSOT** | Consolidation into 4 canonical PG16 tables | `universal_master_pins`, `pins_daily_metrics`, `keyword_serp_positions`, `competitor_board_pins`; dropped legacy hub/shard duplicate tables |
| **Migrations 061–062 Tuning & Partitioning** | MV `mv_pulse_24h_summary`, `pa_topic_clusters_page`, HOT updates & 20-worker partition indexes | `fillfactor = 80`; dropped volatile timestamp indexes; `ABS(hashtext(pin_id::text)::bigint) % 20` |
| **Migrations 063–064 Security & Schema Hygiene** | Regex escaping, advisory locks, orphan cleanup, index deduplication & security hardening | `pae_sync_canonical_keyword` advisory lock; cookie redaction + `no-store`; wildcard & cast guards |
| **Core Crawler & Repository Consolidation** | Unified `PinRepository`, `src/core/pinterest/`, Undici dispatcher parity & CI resilience | Preserve `NULL` on unhydrated pins; `ORDER BY pin_id ASC`; `Map` deduplication (`21000`/`40P01`) |
| **Frontend Hydration & Safety Audit** | SVG chart zero-exclusion, Rule 31 formatting, `safeUrl`, CSV DDE neutralization & Alpine DOM rules | `firstPosIdx` slice, `prevSaves <= 0` jump guard, `AbortSignal.timeout(15000)`, non-blocking toasts |

---

## 1. Unhydrated `NULL` Preservation vs Counter Conflation (`[INVARIANT: PINTEREST-SAVES-REPINS-INDEPENDENCE]`)
- **Failure Mode:** Stage-0 SERP/feed scrapes omit `aggregated_stats.saves`. Coercing missing saves to `0` or copying `repin_count` into `save_count` creates sawtooth velocity oscillations and false +25k/d hydration spikes when deep closeup hydration later reads authentic lifetime saves.
- **Verified Fix:** `src/core/pinterest/parser.mjs` emits `save_count: null, has_explicit_saves: false` when saves are omitted. `PinRepository.ingestPinsBatch` preserves `NULL` on unhydrated rows and forces `daily_save_velocity = 0` whenever `prevSaves <= 0`.

## 2. Node 22/24 Undici Dispatcher & Stateles Crawler Resilience
- **Failure Mode:** Passing an external `undici@8` `Agent` directly to Node's built-in `fetch` throws `UND_ERR_INVALID_ARG` because built-in `fetch` uses `Symbol.for('undici.globalDispatcher.1')`.
- **Verified Fix:** Prime once (`fetch('data:text/plain,ok')`) and construct from `globalThis[Symbol.for('undici.globalDispatcher.1')].constructor`. Crawlers support HTTP ingestion (`POST /api/internal/ingest`) alongside direct `PinRepository.ingestPinsBatch` with `Map` deduplication and ascending ID ordering.

## 3. PostgreSQL HOT Updates, Partitioning & Race-Free Triggers
- **Failure Mode:** Secondary indexes on frequently updated columns (`last_scraped_at`, `updated_at`, `save_count`) block PostgreSQL Heap-Only Tuple (HOT) updates, causing table bloat. Concurrent `tracked_keywords` inserts without locks suffered TOCTOU races on `canonical_keyword`.
- **Verified Fix:**
  - Migration `062` set `fillfactor = 80` on all 4 SSOT tables, dropped HOT-blocking timestamp indexes, and created `ABS(hashtext(pin_id::text)::bigint) % 20` indexes for 20-worker parallel slicing.
  - Migration `063` fixed regex dot escaping (`\.`) in `pae_sync_clean_domain()`, added `pg_advisory_xact_lock` in `pae_sync_canonical_keyword()`, set `fillfactor = 80` on `domain_intelligence_rollup`, and cleaned orphan `keyword_serp_positions` rows.
  - Migration `064` cleans remaining duplicate indexes, redundant `dominant_color = '#888888'` placeholders, orphan `competitor_board_pins` / `pins_daily_metrics` rows, and unused heavy indexes (`idx_ump_visual_annotations_gin`).

## 4. Security, Secret Redaction & SARGable Performance Fixes
- **Failure Mode:** Settings API responses exposed 42-char prefixes of `pinterest_cookie` and lacked `Cache-Control: no-store`. Test-mode detection checked full CLI path substrings instead of `path.basename`. `queryBreakoutCreators` failed to align `COALESCE(ump.creator_username, '')` with `idx_ump_creator_clean` (1318 ms -> 25 ms), and `aspect_ratio::numeric` threw `SQLSTATE 22P02`/`42804` on dirty strings.
- **Verified Fix:**
  - `src/routes/keywords.mjs`, `src/plugins/api-routes.mjs`, `src/routes/cluster.mjs`, and `src/modules/keywords/settings.mjs` redact `pinterest_cookie: ''`, return `preview: '[CONFIGURED]'` / `has_pinterest_cookie`, and enforce `Cache-Control: no-store, no-cache, must-revalidate, private`.
  - `src/http/security-and-response.mjs` and `src/server.mjs` inspect only script filenames (`path.basename`) for test-mode detection.
  - `src/modules/cluster/service.mjs` guards `aspect_ratio` with numeric regex before `::numeric`; `keywords/service.mjs` and `creators/boards-service.mjs` escape `ILIKE` wildcards (`ESCAPE '\\'`); `pulse/service.mjs` uses `idx_ump_creator_clean`-aligned `COALESCE(..., '')`.

## 5. InstaBox Infrastructure & CI Pipeline Guardrails
- **Failure Mode:** Long-running CI jobs outlasted InstaBox's 30m auto-pause when downstream steps set `skip-wakeup: 'true'`, causing `ECONNRESET` across the tunnel. Duplicate `VACUUM` calls stalled consolidators.
- **Verified Fix:** Set `skip-wakeup: 'false'` on consolidation stages, bound pool sizes in `src/db/client.mjs` (`max: 3..4` in CI with `statement_timeout: 45000`), ensure fail-closed deploys when `IB_API_KEY` is missing, and execute `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_pulse_24h_summary` outside transactions.

## 6. Frontend Safety & Asset Hygiene
- Guard browser globals (`localStorage`, `window`, `document`) for Node evaluation, pin Alpine (`3.14.8`) and Lucide (`0.469.0`), wrap `<template x-if>` in a single root `<div>`, slice leading `0`-save snapshots out of SVG charts, enforce `safeUrl` + `sanitizeCsvCell`, and avoid `window.alert()`.
