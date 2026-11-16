---
trigger: always_on
---

# Beacon & Git-Native Autonomous Memory Protocol

> **Purpose:** Single Source of Truth (SSOT) for autonomous cross-session learning across Pin Arbitrage Engine (PAE).
> **Enforcement Rule:** Follow a **Dual-Tier Memory Architecture**:
> 1. **Primary Mandatory Tier (Git-Native Markdown):** Inspect and update `.agents/rules/lessons-learned-ledger.md` and `.agents/rules/project-invariants.md`. This is offline-first and version-controlled.
> 2. **Secondary Best-Effort Tier (Beacon CLI):** Optional non-blocking mirror when `beacon` CLI is installed locally; never block or fail tasks if unavailable.

---

## 1. Autonomous Pre-Execution Recall
Before non-trivial debugging, refactoring, or database migrations:
1. Inspect `.agents/rules/lessons-learned-ledger.md` for known gotchas and empirical fixes.
2. Inspect `.agents/rules/project-invariants.md` and `.agents/rules/canonical-registry.md` for SSOT boundaries (`4-Table SSOT`, `src/db/client.mjs`, `PinRepository`).

---

## 2. Autonomous Post-Resolution Distillation
When resolving a non-trivial bug, schema mismatch, or security issue:
1. Append a concise, grounded entry to `.agents/rules/lessons-learned-ledger.md` summarizing the failure mode, root cause, verified fix, and verification commands (`npm run check`, `npm test`, `node --test tests/*.mjs`).
2. If a permanent architectural constraint is established, add it to `.agents/rules/project-invariants.md`.

---

## 3. High-Signal Quality Bar
- ❌ **Do NOT log:** Trivial formatting edits, routine dependency updates, or temporary debugging notes.
- ✅ **DO log:**
  - PostgreSQL 16 schema/index/HOT update findings (`4-Table SSOT`, `fillfactor = 80`, `SQLSTATE 21000` / `40P01` / `22P02`).
  - Pinterest scraper invariants (`_auth=0`, 48 SSR fields, `NULL` unhydrated saves vs `repin_count` independence).
  - Security & runtime hardening (`Cache-Control: no-store`, secret redaction, fail-closed auth, Fastify queue isolation).
