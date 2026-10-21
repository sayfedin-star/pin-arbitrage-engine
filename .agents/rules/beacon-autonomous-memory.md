# Beacon Autonomous Memory & Continuous Learning Protocol

> **Purpose:** Single Source of Truth for autonomous cross-session and cross-harness learning using Agent Beacon.
> **Enforcement Rule:** The agent MUST autonomously recall past lessons when facing errors, and distill verified solutions into Beacon memory upon resolving non-trivial issues—WITHOUT waiting for explicit user prompts.

---

## 1. Autonomous Pre-Execution Recall (الاسترجاع الذاتي المسبق)
- **Trigger Conditions:**
  - When encountering a failing build, test failure, runtime crash, database error (Neon/Postgres, Hyperdrive, D1/KV), or unhandled exception.
  - Before starting a non-trivial architectural refactoring or migration.
- **Protocol:**
  - Check Beacon memory for known solutions using:
    ```powershell
    beacon memory list -q "<error keyword or component>"
    ```
    or invoke the `beacon-memory-recall` skill.
  - If a matching lesson exists, adopt the verified pattern immediately instead of guessing or repeating trial-and-error cycles.

---

## 2. Autonomous Post-Resolution Distillation (الحفظ التلقائي بعد الحل)
- **Trigger Conditions:**
  - Whenever a non-trivial debugging cycle, cryptic error, edge-case failure, or complex integration issue has been successfully resolved and verified.
- **Protocol:**
  - The agent MUST summarize the lesson into Beacon memory automatically at the conclusion of the fix:
    - **Title:** Direct summary of the trap or failure.
    - **Kind:** `debugging_pattern`, `gotcha`, `workflow`, or `convention`.
    - **Applicability:** Exact conditions under which this issue occurs.
    - **Lesson Body:** Root cause analysis and the exact working fix.
- **CLI Registration Method:**
  ```powershell
  # Fetch latest trace ID
  $lastTrace = (beacon endpoint traces list --limit 1 --json | ConvertFrom-Json).traces[0].id
  # Create candidate
  $cand = beacon memory candidates create `
    --trace $lastTrace `
    --title "<Clear Title>" `
    --kind "debugging_pattern" `
    --applicability "<When this occurs>" `
    --body "<Root cause and verified fix>" `
    --json | ConvertFrom-Json
  # Approve into permanent project memory
  beacon memory candidates approve $cand.id --reason "Verified fix in session"
  ```

---

## 3. High-Signal Quality Bar (معايير جودة الذاكرة)
- ❌ **DO NOT Log:** Trivial typos, standard git merges, minor CSS tweaks, or routine dependency installs.
- ✅ **DO Log:**
  - DDL / Schema parity mismatches (PostgreSQL vs Neon vs Hyperdrive).
  - Silent caching ghosts (D1, KV, L0 in-memory Map).
  - Rate limiting / 429 / 403 scrapers workarounds and header requirements.
  - Shard routing (`(crc32(pin_id) % 99) + 1`) and constraint collisions.
  - Type-cast gotchas (`NaN` poisoning, `BigInt` truncation).

---

## 4. Cross-Harness Parity
- Lessons persisted in Beacon memory are shared across all tools:
  - Antigravity 2.0
  - Cursor
  - OpenCode / CLI agents
- What is learned in one environment protects all future sessions across all harnesses.
