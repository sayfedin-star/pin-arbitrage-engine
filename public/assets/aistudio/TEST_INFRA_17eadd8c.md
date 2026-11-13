# 🧪 Pin Arbitrage Engine (PAE) — Test Infrastructure Specification (TEST_INFRA.md)

> **Document Version:** 1.0.0 (Adversarial Remediation & Hardening E2E Suite)  
> **Status:** Authoritative Test Infrastructure Specification  
> **Target Harness:** Node.js 22+ (Native ESM)  
> **Primary Suite:** `scripts/test_e2e_master_suite.mjs`  

---

## 1. Test Philosophy & Design Principles

### 1.1 Opaque-Box, Requirement-Driven Testing
The PAE End-to-End Master Test Suite adopts a strict **opaque-box, requirement-driven methodology**. Rather than coupling assertions to internal function variables or implementation trivia, tests target **external entry points and observable interfaces**:
- Public module exports (`PinRepository`, `verifyApiAuthentication`, `fetchAdsTxt`, `parseAdsTxtContent`, `normalizePinterestUsername`, etc.).
- HTTP request/response lifecycles via Fastify route injection (`fastify.inject()`) and Edge Worker handlers.
- SQL query generation, parameterization, and AST structural integrity (preventing SQLSTATE 21000 and 22003).
- Data ingestion pipelines and normalization contracts (48 SSR fields, color hygiene, BigInt telemetry).
- Network safety perimeters (SSRF DNS resolution, private IP filters, loopback blocking, redirect caps).

### 1.2 Zero-Facade & Anti-Amnesia Policy
- **No Facade Tests:** Every test case must exercise real algorithmic logic, parser engines, validation schemas, or database transaction builders. No test may use tautological assertions (`assert.strictEqual(true, true)`).
- **Authoritative Expected Output Derivation:** Every expected value is derived directly from the system specifications in `PROJECT_CHARTER_AND_DIRECTIVES.md`, `PROJECT.md`, `SCOPE.md`, and `ORIGINAL_REQUEST.md`.
- **Progressive Testability & Isolation:** Each test case creates its own isolated input fixtures, executes independently of execution order, and cleans up any allocated isolate resources.

---

## 2. 4-Tier Test Coverage Framework

The test suite is structured into four distinct, hierarchically rigorous tiers:

| Tier | Focus | Granularity | Minimum Tests Required | Actual Target |
| :--- | :--- | :--- | :---: | :---: |
| **Tier 1: Feature Coverage** | Happy-path contracts for all 18 features (F01–F18) | 5 tests per feature | 90 tests | 90 tests |
| **Tier 2: Boundary & Corner Cases** | Edge cases, malformed payloads, overflows, error paths | 5 tests per feature | 90 tests | 90 tests |
| **Tier 3: Cross-Feature Interactions** | Pairwise module interactions across security, DB, and UI | Cross-cutting suites | 18 tests | 18 tests |
| **Tier 4: Real-World Application Scenarios** | Full end-to-end workflows simulating production operations | Multi-step workflows | 9 tests | 9 tests |
| **Total Test Count** | **Comprehensive E2E Verification** | **Entire System** | **207 tests** | **207 tests** |

---

## 3. Feature Inventory & Coverage Mapping (F01 – F18)

| Feature ID | Feature Name | Primary Architectural Entrypoint | Tier 1 (Coverage) | Tier 2 (Boundaries) | Tier 3 (Cross) | Tier 4 (E2E) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **F01** | Decouple Edge Wake Gate & Eradicate Cookie Bypass | `src/worker.mjs` (`verifyApiAuthentication`), `src/plugins/api-routes.mjs` | 5 | 5 | ✓ | ✓ |
| **F02** | SSRF Defense in `fetchAdsTxt` | `src/modules/domains/ad-network-service.mjs` (`fetchAdsTxt`, IP validation) | 5 | 5 | ✓ | ✓ |
| **F03** | Eradicate Cookie Preview Leak | `src/routes/cluster.mjs`, `src/plugins/api-routes.mjs` (`GET /api/settings/cookie`) | 5 | 5 | ✓ | ✓ |
| **F04** | Wake-Shield Edge Hardening | `workers/wake-shield/src/index.mjs` (timeout, machineId, no default PIN) | 5 | 5 | ✓ | ✓ |
| **F05** | Map Deduplication for SQLSTATE 21000 | `src/modules/creators/service.mjs` (`syncCompetitorBoards`, Map dedup) | 5 | 5 | ✓ | ✓ |
| **F06** | 32-bit Integer Overflow & Lock Order | `src/modules/cluster/service.mjs`, `creators/service.mjs` (`BigInt` casts) | 5 | 5 | ✓ | ✓ |
| **F07** | SARGable B-tree Index Seeking | `src/modules/creators/service.mjs` (`WHERE username = ...` seeks) | 5 | 5 | ✓ | ✓ |
| **F08** | Safe Storage Optimizer View Guard | `scripts/optimize_hub_storage.mjs` (`isUnifiedPostgres` view shield) | 5 | 5 | ✓ | ✓ |
| **F09** | Unified Ingestion SSOT | `src/modules/pins/repository.mjs` (`PinRepository.ingestPinsBatch`) | 5 | 5 | ✓ | ✓ |
| **F10** | Phantom Color Eradication | `src/modules/pins/repository.mjs`, `scripts/creator-velocity-crawler.mjs` | 5 | 5 | ✓ | ✓ |
| **F11** | Modernize Rogue Crawler | `scripts/account-related-crawler.mjs`, `src/core/pinterest-client.mjs` | 5 | 5 | ✓ | ✓ |
| **F12** | Prune Dead Fleet Routes | `src/routes/fleet.mjs`, `src/modules/fleet/service.mjs` (retain cache-invalid) | 5 | 5 | ✓ | ✓ |
| **F13** | Clean Dead Neon Registry Query | `src/modules/sharding/fleet-router.mjs` (`preloadNeonRegistry` bypass) | 5 | 5 | ✓ | ✓ |
| **F14** | Modernize Test Suites to Single-DB | `scripts/test_*.mjs`, `src/modules/sharding/fleet-router.mjs` | 5 | 5 | ✓ | ✓ |
| **F15** | Delete Obsolete Regression Locks | `scripts/verify_regression_locks.mjs`, code comment cleanup | 5 | 5 | ✓ | ✓ |
| **F16** | Delete Redundant Formatters Wrapper | `src/ui/shared-formatters.mjs` (SSOT formatter functions) | 5 | 5 | ✓ | ✓ |
| **F17** | Retain Cloudflared in Workflows | `.github/workflows/`, `.github/actions/setup-instabox-db` | 5 | 5 | ✓ | ✓ |
| **F18** | Comprehensive E2E System Health | Full stack verification, AST check, syntax parity | 5 | 5 | ✓ | ✓ |

---

## 4. Test Architecture & Runner Details

### 4.1 Invocation Commands
```bash
# Execute Master E2E Suite Standalone
node scripts/test_e2e_master_suite.mjs

# Execute as Part of npm test Lifecycle
npm test

# Static Integrity & Schema Parity Check
npm run check
```

### 4.2 Runner Implementation Details (`scripts/test_e2e_master_suite.mjs`)
- **Zero Heavy External Test Runners:** Uses standard Node.js runtime with `node:assert/strict` for zero-overhead, hyper-fast execution (< 3000ms).
- **ANSI Terminal Reporter:** Formatted colored output with detailed section headers, test progress indicators (`✓ [PASS]`, `❌ [FAIL]`), execution timestamps, and tier-by-tier scorecards.
- **Strict Exit Code Discipline:** Emits exit code `0` when 100% of test cases pass; exits with non-zero exit code (`1`) on any assertion failure or unhandled rejection.
- **Deterministic Mock Database Harness:** High-fidelity in-memory SQL mock verifying query templates, parameter serialization, CTE generation, and batch conflict deduplication without requiring live InstaBox VM tunnel availability during testing.

---

## 5. Pass/Fail Quality Gates

Before publishing `TEST_READY.md` or submitting the final handoff:
1. **Total Test Count:** Must be $\ge 207$ tests.
2. **Pass Rate:** Must be $100\%$ green (0 failures, 0 skipped, 0 unhandled rejections).
3. **Execution Time:** Must finish within $\le 10$ seconds.
4. **Syntax & Lint:** Must produce 0 warnings and 0 violations under `npm run check`.
