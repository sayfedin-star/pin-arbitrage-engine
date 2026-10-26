---
trigger: always_on
---

# Adversarial Forensic Audit & Zero-Landmine Directives

## 1. Ban on Blind Trust in Mocks & Syntax Checks (The Day-2 Invariant)
- **The Mock Illusion:** Unit tests using in-memory or empty-state mocks only verify Day-0 behavior (`baselineMap.size === 0`, fresh database). Never declare a crawler, parser, or database change complete based solely on mocked tests.
- **Mandatory Day-2 Execution Trace:** Before committing any change, you MUST mentally or programmatically trace the execution path for Day 2+:
  - A previous crawl exists (`baselineMap.has(pinId) === true`).
  - Prior snapshots exist in Neon Hub and Shard tables.
  - The pin was already deep-hydrated on a previous date.

## 2. Strict Scope & Hoisting Discipline
- **The `try/finally` Scope Rule:** Any variable referenced in a `finally` block MUST be declared with `let` (never `const` for state flags) *outside* and *before* the `try` block. Connection handles and clients must be guarded with optional chaining (e.g. `await client?.release()`) to prevent unhandled TypeErrors if the connection fails during initialization. Never declare flags inside `try` that govern cleanup in `finally`.
- **Top-Level Variable Hoisting:** Loop counters, UTC calendar day references (`todayUtc`), and shared math parameters MUST be declared at the outer function/phase scope, never scoped inside an inner loop if needed downstream.

## 3. Numeric & Object Cast Hygiene (Anti-NaN Poisoning)
- **Unpacked Type Safety:** If an in-memory Map or cache stores an object `{ saves, date }` instead of a primitive number, you MUST explicitly unpack the numeric property (`Number(entry.saves || 0)`) before passing it to `Math.max()`, `Math.round()`, arithmetic operations, or Postgres integer/bigint columns.
- **NaN Shield:** In JavaScript, `Math.max(5, NaN) === NaN`. Always guard numeric inputs with `isFinite()` or default fallbacks.

## 4. SQL DDL Parity & Swallow Inspection
- **Strict Table Schema Matching:** Never query or update columns that do not exist in the actual PostgreSQL DDL.
  - `keyword_serp_current` has NO `reaction_count` column.
  - `keyword_displaced_index` uses `last_known_rank`, `save_count`, and `updated_at` (NOT `last_rank`, `last_saves`, `last_checked_at`).
  - `pin_serp_positions` uses `(pin_id, snapshot_date, keyword_id)` unique constraint.
- **Naked Query Testing:** Never introduce `.catch(() => [])` or `.catch(() => {})` on database queries without first verifying that the query executes cleanly on live PostgreSQL. Error-swallowing catches must only absorb expected network timeouts, NEVER SQL syntax or non-existent column exceptions.
- **The PostgreSQL View Upsert Landmine:** In PostgreSQL (`parse_clause.c`), `INSERT ... ON CONFLICT` (UPSERT) is strictly rejected on views—even auto-updatable views or views with `INSTEAD OF` triggers—because conflict arbitration requires a physical unique index on a base relation (`relkind = 'r'`). NEVER propose replacing physical tables that receive upserts (`pa_pins`, `competitor_pins`, `keyword_serp_current`, `universal_master_pins`) with PostgreSQL `VIEW`s.

## 5. Algorithmic Ratchet & Precedence Integrity
- **COALESCE Precedence:** On updates of real-time telemetry (like `crawled_at`), fresh incoming values MUST take precedence: `COALESCE(EXCLUDED.crawled_at, existing.crawled_at)`.
- **Velocity Ratchet Symmetry:** When updating `daily_save_velocity`, ensure live/un-cached crawls can adjust velocity downward if saves slowed: `WHEN NOT u.from_hydration_cache AND u.daily_save_velocity IS NOT NULL THEN u.daily_save_velocity::numeric`. Do not trap velocity in an eternal monotonic `GREATEST` ratchet unless explicitly intended.

## 6. Architectural Invariants & Fail-Safe Sharding
- **Zero Historical Writes to Central Hub:** Direct `INSERT INTO keyword_pins_snapshots` is strictly forbidden on the Central Hub in application code; all daily time-series rows must be routed exclusively to Storage Shards via `fleet-router.mjs`.
- **Composite Key Constraint on Shard Snapshots:** `pins_daily_snapshots` has a composite primary unique constraint `(pin_id, keyword_id, snapshot_date)`. Never write `ON CONFLICT (pin_id, snapshot_date)` without `keyword_id`.
- **KV Key Parity & Invalidation Tandem:** Pin dossiers and trajectories can be accessed with or without a keyword ID (`dossier:pin:${pinId}` and `dossier:pin:${pinId}:${kid}`). Any cache invalidation must purge both formats to prevent stale reads.

## 7. Mandatory Static Audit Command
- Before any commit or task completion, always execute `npm run check` and `npm test`. Both must pass with zero warnings and zero violations.

## 8. Database DSN Hygiene & ByteString Header Safety (Anti-Poisoning Rule)
- **Zero Masked DSNs in Internal Routing:** Never write masked database connection strings (`••••••••`) or redacted placeholders (`[REDACTED_DATABASE_URL]`) into internal routing caches, Workers KV (`fleet:shards_map`), or connection pools.
- **The ByteString Crash Invariant:** `@neondatabase/serverless` communicates over HTTP by sending `headers: { "Neon-Connection-String": dsn }`. Unicode bullets (`•` code 8226) or non-ASCII characters crash the HTTP request with `NeonDbError: invalid header: neon-connection-string`.
- **Mandatory Validation:** Always validate resolved DSNs with `isValidShardDsn()` before instantiating SQL clients, and normalize array formats with `normalizeAssignedShards()`.

## 9. SARGable SQL Queries & Clean B-Tree Index Seeking (Anti-Expression Wrapping)
- **The Expression Wrap Anti-Pattern:** Never wrap indexed database columns in functional transformations (`LOWER()`, `REGEXP_REPLACE()`, `REPLACE()`, `TRIM()`) inside `WHERE` or `JOIN` predicates.
  - ❌ `WHERE LOWER(REGEXP_REPLACE(ksc.domain, '^www\.', '')) = ${cleanDomain}` (forces sequential table scan).
  - ✅ `WHERE ksc.domain = ${cleanDomain}` (enables instant B-tree index seek via `idx_ksc_domain_clean`).
  - ❌ `WHERE LOWER(REPLACE(account_username, '@', '')) = ${cleanUsername}`.
  - ✅ `WHERE account_username = ${cleanUsername}` (enables instant B-tree seek via `idx_pa_pins_account_username_clean`).
- **Sanitize in Application Layer:** Always clean and normalize query inputs in JavaScript (`normalizeCleanDomain()`, `normalizePinterestUsername()`) prior to SQL parameterization. Ingestion triggers guarantee database columns are already normalized.

## 10. Sharding Hash Parity: PL/pgSQL CRC32 vs Jenkins `hashtext`
- **The `hashtext()` Invariant:** PostgreSQL's built-in `hashtext(string)` function implements Bob Jenkins' `lookup3` algorithm, NOT IEEE 802.3 CRC32. Applying `(hashtext(pin_id) % 99) + 1` in SQL mismatches application sharding `(crc32(pin_id) % 99) + 1` by 98.9%, scattering pins across incorrect shards.
- **Mandatory Canonical Function:** In SQL triggers, migrations, and DDL, strictly use `pae_crc32_shard_id(pin_id, 99)`. Never substitute `hashtext` for CRC32.

## 11. Adversarial Peer Review Anti-Hallucination Gate
- **Zero Blind Trust in External Reviews:** External audit reports (human or LLM peer reviews) must be treated as untrusted input.
- **Mandatory Grep Verification:** Before applying any patch suggested by a peer reviewer:
  1. Grep the exact variable name in the codebase (e.g. `requestContextStorage` vs reviewer's hallucinated `requestContextStore`).
  2. Verify column names against the live PostgreSQL `information_schema.columns`.
  3. Verify existing test assertions (`scripts/verify_*.mjs`, `scripts/test_*.mjs`) to avoid renaming variables guarded by literal string checks (e.g. `closePromise`, `// [INVARIANT: NON-BLOCKING-SOCKET-CLEANUP]`).

## 12. The Clock-Skew Simulation Rule
- Never approve distributed barrier synchronizations that calculate timestamps backwards or forwards (`Date.now() - X`). Distributed runners across cloud VMs must synchronize strictly via logical state tokens (`metadata->'phase_token'`) with run-id parameter passing to survive clock drift, virtual machine freeze, and NTP steps.

## 13. The Connection Blast GCD Invariant
- When partitioning tasks across $W$ workers and $S$ shards, verify whether $\gcd(W, S) = 1$. If true, random item hashing (`crc32(id) % W`) scatters work across all $S$ shards for every worker, multiplying concurrent database connections to $W \times S$. Always partition the shards ($S_w$), never the items.

## 14. The Multi-Row Upsert Duplicate Trap (PostgreSQL Error 21000)
- Any batch `jsonb_to_recordset` query with `ON CONFLICT ... DO UPDATE` must guarantee pre-serialization deduplication via in-memory `Map`. A single repeated compound conflict key will abort the entire transaction with SQLSTATE 21000.

## 15. The Volatile Column Covering Index Trap
- Never approve `INCLUDE` clauses containing columns that update on daily crawls (`save_count`, `daily_save_velocity`, `repin_count`). Volatile covering indexes permanently disable PostgreSQL Heap-Only Tuple (HOT) updates, forcing sequential table bloat.

## 16. The String Replacement Pattern Trap (`$'` Anti-Duplication & Anti-No-Op Assertions)
- **The Special Pattern Hazard:** JavaScript's `String.prototype.replace(target, replacement)` parses `$` tokens in the replacement string (`$'` inserts the following text, `$&` inserts the match, `$\`` inserts preceding text, `$1..$9` insert captures). If replacement code contains `$'` (common in shell scripts, regex, or inline JS templates), `replace` blows up the file, duplicating thousands of lines into the target.
- **Mandatory Functional Replacer:** Never pass raw strings with potential `$` characters to `.replace()`. Strictly use the arrow function replacer:
  `content.replace(target, () => replacement)`
- **Mandatory Target Existence Assertion:** Before applying any replacement or regex patch, assert that the target exists in the target string. Never execute blind replacements that silently fail (`no-op`):
  `if (!content.includes(target)) throw new Error(`Target not found in file: ${target.slice(0, 50)}...`);`

## 17. Headless & Node.js Execution Shield for Browser Globals (`localStorage`, `window`, `document`)
- **The Headless Test Runner Crash:** Code embedded within UI template files (`src/*-ui.mjs`) is evaluated in Node.js environments during automated tests (`npm run check`, syntax validators, benchmark scripts). Top-level or un-guarded calls to browser globals (`localStorage.getItem(...)`, `window.location`, `document.querySelector`) throw fatal `ReferenceError: localStorage is not defined`.
- **Mandatory Environment Guards:** Always guard browser-only globals:
  `const theme = (typeof localStorage !== 'undefined') ? localStorage.getItem('pa_theme') : null;`
  Ensure DOM-dependent logic is encapsulated inside browser event handlers (`document.addEventListener`) or Alpine component lifecycle hooks (`init()`).

## 18. Aggregated Rollup Freshness & Post-Crawl Workflow Synchronization
- **The Frozen Materialization Anti-Pattern:** Materialized aggregate tables (such as `domain_intelligence_rollup`) do not update automatically on base table upserts. Leaving workflows without post-crawl rollup triggers causes dashboards and leaderboards to freeze on stale snapshots.
- **Mandatory Workflow Triggering:** Any workflow performing bulk data collection (`crawler-pipeline.yml`, `keyword-intelligence-velocity.yml`) MUST execute a downstream rollup step (e.g. `scripts/refresh-domain-rollup.mjs`) upon successful completion.
- **Incremental Single-Entity Sync:** Point enrichments (such as single domain age, ad network, or pin deep sync) must incrementally update the rollup row via dedicated helper (`syncSingleDomainRollup`) so individual dossier views and leaderboards stay 100% coherent without awaiting full database rollups.




