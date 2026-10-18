---
name: adversarial-forensic-audit
description: >-
  Systematic adversarial forensic audit runbook for inspecting code modifications, schema migrations, and crawler logic in pin-arbitrage-engine.
---

# Adversarial Forensic Audit Skill

This skill provides an exhaustive, step-by-step checklist and automated verification procedure to catch second-order bugs, scope leaks, NaN poisoning, and SQL schema mismatches before code is committed or deployed.

## When to Activate This Skill
- Before executing any `git commit` or merging a PR.
- After making substantial changes to crawlers, database queries, sharding routers, or caching logic.
- Whenever a bug fix changes data structures (e.g., numbers to objects, arrays to sets).

---

## 1. Automated Landmine Verification
Always execute the automated verification suite:

```bash
npm run check
npm test
```

`npm run check` automatically verifies 100% of `.mjs` syntax dynamically, executes inline UI script validation, audits route re-organization, runs `verify_sql_schema_parity.mjs`, and enforces ESLint scope rules with `--max-warnings=0`.

If any check fails, do NOT proceed. Inspect the failure and resolve root causes.

---

## 2. The 7-Point Forensic Checklist

### Checklist 1: Scope & Lifecycle Hoisting
- [ ] Inspect every variable accessed inside a `finally` block. Is it declared before `try`?
- [ ] Inspect loop-scoped variables. Are timestamps like `todayUtc` or `todayIso` declared at outer Phase scope so downstream logic has access?

### Checklist 2: Numeric Type Integrity & Anti-NaN Guard
- [ ] Trace all occurrences of `baselineMap.get(...)` or any in-memory map. Does it return `{ saves, date }` or a primitive number?
- [ ] If returning an object, ensure `Number(entry.saves || 0)` is used instead of `Number(entry)`.
- [ ] Verify that `Math.max()` does not receive `NaN`.

### Checklist 3: SQL Schema Parity (Neon Hub & Shard DDL)
- [ ] Does `keyword_serp_current` have the column? (No `reaction_count` column).
- [ ] Does `keyword_displaced_index` have the column? (`last_known_rank`, `save_count`, `updated_at`).
- [ ] Does `pin_serp_positions` have the column? (`(pin_id, snapshot_date, keyword_id)`).

### Checklist 4: Catch-Swallow Inspection
- [ ] Does any `.catch(() => [])` mask a fatal SQL syntax error?
- [ ] Run raw queries in test scripts without catch blocks to verify PostgreSQL acceptance.

### Checklist 5: Ratchet Logic & Monotonic Velocity
- [ ] Is `GREATEST()` trapping values forever? Ensure fresh crawls can update velocity.
- [ ] In `COALESCE`, is fresh incoming data (`EXCLUDED`) listed first where appropriate?

### Checklist 6: Day-2 Execution Path Tracing
- [ ] Trace crawler behavior on Day 2 when `baselineMap.has(pinId)` is `true`.
- [ ] Trace shard router when `universal_master_pins` already contains records.

### Checklist 7: Zero vs Falsy Guards
- [ ] Does `saves >= 0` cause an unintended early return when `saves === 0`?
- [ ] Use `saves > 0` for early returns, and retain `fallbackFormatted` for deep fallbacks (JSON-LD and Meta tags).

---

## 3. Invoking the Adversarial Auditor Subagent
When performing high-stakes changes, invoke the specialized subagent:

```json
{
  "TypeName": "adversarial-auditor",
  "Role": "Adversarial Code Auditor",
  "Prompt": "Review the latest git diff and audit for all 7 forensic landmines."
}
```
