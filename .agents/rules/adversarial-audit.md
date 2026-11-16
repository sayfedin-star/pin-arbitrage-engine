---
trigger: always_on
---

# Adversarial Forensic Audit & Zero-Landmine Directives

## 1. Ban on Blind Trust in Mocks & Syntax Checks (The Day-2 Invariant)
- **The Mock Illusion:** Unit tests using in-memory mocks only verify isolated logic. Never declare a crawler, parser, or SQL change complete without verifying live PostgreSQL schema parity and Day-2+ paths.
- **Mandatory Day-2 Execution Trace:** Before finishing any crawler or repository change, trace:
  - Day 1 discovery with `save_count = NULL` (`is_hydrated = FALSE`).
  - First deep hydration jump (`prevSaves <= 0 && currSaves > 0`), where daily velocity MUST be suppressed to `0`.
  - Day 2+ crawl where prior rows exist in `universal_master_pins`, `pins_daily_metrics`, and `keyword_serp_positions`.

## 2. Strict Scope & Hoisting Discipline
- **The `try/finally` Scope Rule:** Variables referenced in `finally` MUST be declared with `let` outside and before `try`. Always drain/close connections safely inside `finally`.
- **Top-Level Variable Hoisting:** UTC calendar day references (`todayUtc`, `todayIso`) and batch counters MUST be declared at outer phase scope so downstream batches agree on the active calendar day.

## 3. Numeric, NULL & Object Cast Hygiene (Anti-NaN Poisoning)
- **Preserve `NULL` for Unhydrated Saves:** Never coerce unhydrated `save_count = null` into `0` before hydration jump checks, and NEVER fall back to `repin_count` when `has_explicit_saves === false`.
- **Unpacked Type Safety & NaN Shield:** Unpack object entries explicitly (`Number(entry?.saves ?? 0)`) and validate numeric inputs with `Number.isFinite()` before arithmetic or `Math.max()`.
- **BigInt Cast Parity:** Cumulative Pinterest counters can exceed 32-bit signed integers (`2,147,483,647`). Cast cumulative save/repin/reach counters as `::bigint`, never `::int`.

## 4. SQL DDL Parity, Views & Swallow Inspection
- **Strict 4-Table SSOT Schema Matching (Migrations `060`–`064`):**
  - `universal_master_pins`: master pin catalog, latest counters, clean domain, annotations, and rolling gains.
  - `pins_daily_metrics`: daily time-series snapshots keyed by `(pin_id, recorded_date)`.
  - `keyword_serp_positions`: active SERP (`is_displaced = FALSE`) and displaced vault (`is_displaced = TRUE`) keyed by `(keyword_id, pin_id)`.
  - `competitor_board_pins`: account/board-to-pin join keyed by `(competitor_id, board_id, pin_id)`.
- **Naked Query Testing:** Never introduce `.catch(() => [])` or `.catch(() => {})` on PostgreSQL queries to hide SQL syntax or missing-column exceptions.
- **No View Upserts:** Never target a SQL `VIEW` with `INSERT ... ON CONFLICT`; upserts belong strictly on base physical tables (`relkind = 'r'`).

## 5. Algorithmic Ratchet, PinRepository & Symmetry Integrity
- **Anti-Hydration Delta Check (`[INVARIANT: ANTI-HYDRATION-SPIKE]`):** Any jump from unhydrated/`0` prior saves to positive lifetime saves is a hydration jump and MUST emit `0` velocity until a genuine Day-2 diff exists.
- **COALESCE & Symmetrical Velocity:** Fresh authenticated guest telemetry overrides stale metrics (`CASE WHEN EXCLUDED.save_count IS NOT NULL ...`). Never trap `daily_save_velocity` in a permanent monotonic `GREATEST()` ratchet.
- **Single-Writer Repository Discipline:** All pin + daily metric + SERP batch persistence routes through `src/modules/pins/repository.mjs` (`PinRepository.ingestPinsBatch`, `insertNewPinsBatch`, `resavePinsMetricsBatch`).

## 6. SARGable SQL Queries & Clean B-Tree Seeking
- **Zero Expression Wrapping in Hot Predicates:** Do not wrap indexed columns in `LOWER()`, `REGEXP_REPLACE()`, `REPLACE()`, or `TRIM()` in `WHERE`/`JOIN` predicates unless an explicit matching functional index exists (such as `idx_ump_creator_clean` or `idx_cp_lower_username`). Prefer normalized `clean_domain` and `canonical_keyword`.
- **Single-Pass Counting:** Use `COUNT(*) OVER()::int AS full_count` in paginated list queries where total counts are needed.

## 7. Multi-Row Upsert Duplicate & Deadlock Prevention (`21000` & `40P01`)
- Deduplicate every batch payload in-memory using `Map` keyed by conflict target prior to `JSON.stringify()`.
- Include `SELECT DISTINCT ON (...)` and deterministic ascending sort (`ORDER BY pin_id ASC`, or `(keyword_id, pin_id)`, or `competitor_id ASC`) on `jsonb_to_recordset` upserts.

## 8. 20-Worker Partitioning & HOT Update Hygiene
- **Deterministic PG16 20-Worker Partitioning:** Parallel fleet workers partition pins directly in PostgreSQL using:
  `ABS(hashtext(pin_id::text)::bigint) % 20 = $workerIndex`
  backed by `idx_ump_hashtext_mod20`, `idx_ksp_hashtext_mod20`, and `idx_cbp_hashtext_mod20`.
- **PostgreSQL HOT Updates (`fillfactor = 80`):** Keep `fillfactor = 80` on the 4 SSOT tables and `domain_intelligence_rollup`. Do NOT re-add secondary indexes covering volatile daily counters (`last_scraped_at`, `updated_at`, `save_count`, `daily_save_velocity`).

## 9. Security, Privacy & No-Cache Enforcement
- **Zero Secret/Cookie Exposure:** API settings routes (`/api/settings`, `/api/settings/cookie`) must redact `pinterest_cookie` (`''`), return only boolean `has_pinterest_cookie` or `preview: '[CONFIGURED]'`, and emit `Cache-Control: no-store, no-cache, must-revalidate, private`.
- **Regex & SQL Escaping:** Sanitize SQL `ILIKE` user search terms with `escapeSqlWildcards` + `ESCAPE '\\'`, and guard string numeric casts (e.g. `aspect_ratio`) with regex checks before `::numeric`.

## 10. Anti-Hallucination & Verification Gate
- **Verify Before Deleting or Editing:** Always read target files in full and `grep` all callers across `src/`, `scripts/`, `tests/`, `.github/`, and `package.json`.
- **Mandatory Verification Commands:** Before declaring any change complete, pass `npm run check`, `node scripts/audit_ui.mjs`, `npm test`, and `node --test tests/*.mjs`.
