---
name: adversarial-forensic-audit
description: >-
  Systematic adversarial forensic audit runbook for inspecting code modifications, schema migrations, and crawler logic in pin-arbitrage-engine.
---

# Adversarial Forensic Audit Skill

This skill provides an exhaustive, step-by-step checklist and automated verification procedure to catch second-order bugs, scope leaks, NaN poisoning, and SQL schema mismatches before code is committed or deployed.

## When to Activate This Skill
- Before completing substantial edits or preparing a PR/commit.
- After modifying crawlers, `PinRepository` ingestion, PostgreSQL queries/migrations, or Fastify API routes.
- Whenever a bug fix changes data structures (e.g., primitives to objects, `NULL` vs `0` unhydrated semantics).

---

## 1. Automated Landmine Verification
Always execute the automated verification suite:

```bash
npm run check
node scripts/audit_ui.mjs
npm test
node --test tests/*.mjs
```

`npm run check` validates `.mjs` syntax, inline UI script compilation, route structure, SQL schema parity (`verify_sql_schema_parity.mjs`), ESLint (`--max-warnings=0`), and DOM nesting (`verify_dom_nesting.mjs`).

If any check fails, do NOT proceed. Inspect the failure and resolve root causes.

---

## 2. The 7-Point Forensic Checklist

### Checklist 1: Scope & Lifecycle Hoisting
- [ ] Inspect every variable accessed inside a `finally` block. Is it declared with `let` before `try`?
- [ ] Inspect loop-scoped variables. Are UTC day boundaries (`todayUtcIso`, `todayIso`) declared at outer phase scope so downstream batch writes share a consistent day?

### Checklist 2: Numeric Type Integrity & Anti-NaN Guard
- [ ] Trace all occurrences of `baselineMap.get(...)` or in-memory lookup maps. Does an entry return `{ saves, date }` or a number?
- [ ] Unpack numbers explicitly (`Number(entry?.saves ?? 0)` or `null` when unhydrated) and verify `Math.max()` / `Math.round()` cannot receive `NaN`.

### Checklist 3: SQL Schema Parity (Unified PostgreSQL 16 4-Table SSOT)
Verify every query and migration against the live 4-Table SSOT schema (`scripts/migrations/060`–`064`):
- [ ] `universal_master_pins`: primary SSOT catalog (`pin_id` PK, `creator_username`, `clean_domain`, `save_count`, `repin_count`, `daily_save_velocity`, `is_hydrated`, `visual_annotations`, `fillfactor = 80`).
- [ ] `pins_daily_metrics`: daily snapshots (`(pin_id, recorded_date)` PK, `snapshot_date` generated alias, `save_count`, `repin_count`, `comment_count`, `share_count`, `reaction_count`, `daily_save_velocity`, `daily_repin_velocity`).
- [ ] `keyword_serp_positions`: active + displaced SERP rankings (`(keyword_id, pin_id)` PK, `rank_position`, `is_displaced`, `last_known_rank`, `vacuum_opportunity_score`).
- [ ] `competitor_board_pins`: lightweight account/board-to-pin relation (`(competitor_id, board_id, pin_id)` PK).
- [ ] Never reference retired pre-060 tables (`keyword_serp_current`, `keyword_displaced_index`, `pa_pins`, `competitor_pins`, `pin_serp_positions`).

### Checklist 4: Catch-Swallow & Secret Leak Inspection
- [ ] Verify no `.catch(() => [])` or `.catch(() => {})` hides SQL syntax or missing-column errors.
- [ ] Verify credential endpoints (`/api/settings*`, cookie storage) never return cookie prefixes/secrets and always emit `Cache-Control: no-store`.

### Checklist 5: Ratchet Logic, NULL Unhydrated State & 20-Worker Partitioning
- [ ] Unhydrated discovery pins MUST keep `save_count = NULL` and `is_hydrated = FALSE` (never substitute `repin_count` for missing `save_count`).
- [ ] Never lock metrics behind monotonic `GREATEST` ratchets that block downward corrections; allow fresh crawls (`PinRepository.ingestPinsBatch`) to update velocity symmetrically.
- [ ] Batch `jsonb_to_recordset` upserts MUST deduplicate by conflict key and sort `ORDER BY pin_id ASC` to prevent `SQLSTATE 21000` and `40P01`.
- [ ] Parallel crawler slicing MUST use `ABS(hashtext(pin_id::text)::bigint) % 20` matching `idx_*_hashtext_mod20`.

### Checklist 6: Day-2 Execution Path Tracing
- [ ] Trace Day-1 unhydrated (`NULL` saves) -> first hydration jump (velocity MUST suppress to `0`) -> Day-2 delta computation.
- [ ] Trace `PinRepository.ingestPinsBatch` when `universal_master_pins` and `pins_daily_metrics` already hold prior-day rows.

### Checklist 7: Zero vs Falsy Guards & HOT Update Safety
- [ ] Distinguish `save_count === null` (unhydrated) from `save_count === 0` (`has_explicit_saves === true`), so explicit 0-save pins do not trigger wasted fallback loops or false hydration jumps.
- [ ] Ensure secondary indexes do not include volatile counters (`save_count`, `daily_save_velocity`, `last_scraped_at`) that break PostgreSQL HOT updates.
