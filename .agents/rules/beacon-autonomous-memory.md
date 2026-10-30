---
trigger: always_on
---

# Beacon & Git-Native Autonomous Memory Protocol

> **Purpose:** Single Source of Truth (SSOT) for autonomous cross-session and cross-harness learning across Pin Arbitrage Engine (PAE).
> **Enforcement Rule:** All agents MUST follow a **Dual-Tier Memory Architecture**:
> 1. **Primary Mandatory Tier (Git-Native Local Markdown):** Reading and appending to `.agents/rules/lessons-learned-ledger.md` and `.agents/rules/project-invariants.md`. This is 100% offline-first, version-controlled, and mandatory.
> 2. **Secondary Best-Effort Tier (Beacon CLI):** Mirroring distillations to Beacon CLI when available. Beacon CLI operations are strictly non-blocking and optional; if Beacon CLI is offline, missing, or errors, agents MUST NOT fail or block execution.

---

## 1. Dual-Tier Memory Architecture (البنية الثنائية للذاكرة)

| Attribute | Primary Tier: Git-Native Markdown | Secondary Tier: Beacon CLI |
| :--- | :--- | :--- |
| **Storage Target** | `.agents/rules/lessons-learned-ledger.md`<br>`.agents/rules/project-invariants.md` | Local Beacon Endpoint & Asymptote (`beacon memory`) |
| **Availability** | 100% Offline-First, Zero-Dependency, Git-Versioned | Best-Effort / Optional (Requires local Beacon binary & endpoint) |
| **Enforcement** | **MANDATORY**: Checked by `verify_regression_locks.mjs` (Lock 13) | **BEST-EFFORT**: Never blocks task completion if offline |
| **Scope** | Main repo working tree, visible across all agents & subagents | Shared across harnesses (Antigravity, Cursor, OpenCode) |

---

## 2. Autonomous Pre-Execution Recall (الاسترجاع الذاتي المسبق)

### Protocol:
1. **Step 1 (Mandatory Primary):**
   - Before starting non-trivial debugging, refactoring, or database migration, the agent MUST inspect:
     - `.agents/rules/lessons-learned-ledger.md` for known gotchas, regression patterns, and empirical fixes.
     - `.agents/rules/project-invariants.md` for constitutional architectural boundaries.
   - If a matching lesson exists, adopt the verified pattern immediately instead of repeating trial-and-error cycles.

2. **Step 2 (Secondary Best-Effort):**
   - If the Beacon CLI is available in the shell, optionally query approved memory:
     ```powershell
     beacon memory list -q "<error keyword or component>"
     ```
   - If Beacon is unavailable, unresponsive, or returns an error, safely ignore and proceed using the Primary Tier.

---

## 3. Autonomous Post-Resolution Distillation (الحفظ التلقائي بعد الحل)

### Trigger Conditions:
- Whenever a non-trivial debugging cycle, cryptic error, edge-case failure, schema mismatch, or architectural integration issue has been successfully resolved and verified.

### Protocol:
1. **Step 1 (Mandatory Primary — Git-Native Markdown):**
   - Append a structured distillation entry to `.agents/rules/lessons-learned-ledger.md` containing:
     - **Round / Feature**: Milestone and component identifier.
     - **Trap / Failure Mode**: Clear description of the runtime failure, crash, or data-loss trap.
     - **Root Cause & Technical Mechanism**: File paths, lines, SQL errors, or platform limits causing the issue.
     - **Verified Solution & Invariant Codification**: Exact working fix, canonical functions used, and regression locks attached.
     - **Verification Command**: Automated command proving the fix (`npm run check`, `node scripts/verify_regression_locks.mjs`).
   - If the lesson establishes a permanent system constraint, append the authoritative prose definition to `.agents/rules/project-invariants.md`.

2. **Step 2 (Secondary Best-Effort — Beacon CLI):**
   - If `beacon` CLI is installed and responsive, register the distillation into Beacon memory:
     ```powershell
     # Fetch latest trace or use synthetic event
     $lastTrace = (beacon endpoint traces list --limit 1 --json 2>$null | ConvertFrom-Json).traces[0].id
     if ($lastTrace) {
       $cand = beacon memory candidates create `
         --trace $lastTrace `
         --title "<Clear Descriptive Title>" `
         --kind "debugging_pattern" `
         --applicability "<Conditions where this occurs>" `
         --body "<Root cause and verified fix>" `
         --json | ConvertFrom-Json
       if ($cand.id) {
         beacon memory candidates approve $cand.id --reason "Sealed in current session"
       }
     }
     ```
   - **Candidate Approval Policy:** If an existing candidate (such as `candidate_6_round6` or `candidate_b744d73809cfb5d783058f52b3ee580a`) is referenced in the mission mandate, attempt approval:
     ```powershell
     beacon memory candidates approve <candidate_id> --reason "Sealed in Round 8"
     ```
   - **Fail-Safe Non-Blocking Rule:** If the Beacon CLI is offline, throws `candidate not found`, or fails for any reason, log a diagnostic notice and **continue execution without error**. Never fail a build, test suite, or subagent handoff due to Beacon CLI unavailability.

---

## 4. High-Signal Quality Bar (معايير جودة الذاكرة)

- ❌ **DO NOT Log:** Trivial syntax typos, standard git branch operations, minor CSS padding tweaks, or routine npm installs.
- ✅ **DO Log:**
  - DDL / Schema parity mismatches (PostgreSQL vs Neon Serverless vs Cloudflare D1).
  - Silent caching ghosts (Cloudflare Workers KV `cacheTtl`, D1 `edge_pins_metadata`, L0 in-memory Map).
  - Rate limiting / 429 / 403 scrapers workarounds and unauthenticated guest cookie requirements (`_auth=0`).
  - Shard routing (`pae_crc32_shard_id(pin_id, 99)`) and PostgreSQL Error 21000 duplicate upsert traps.
  - Type-cast gotchas (`NaN` poisoning, `BigInt` truncation, 32-bit `::int` overflow `SQLSTATE 22003`).
  - Distributed barrier synchronization failures and clock-skew immunity.
