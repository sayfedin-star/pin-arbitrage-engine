---
trigger: always_on
---

# pin-arbitrage-engine Workspace Directives

## 1. Database Directive (Neon Serverless Override)

- **Engine Override:** We are strictly using **Neon Serverless Postgres** via `@neondatabase/serverless`.
- **Supabase MCP Bypass:** Supabase MCP directive is explicitly disabled for this workspace. Do not attempt live verification via Supabase.
- **Connection Variable:** Live database operations and migrations rely on `DATABASE_URL` (Neon pooled string).

## 2. GitHub Account Context

- All commits, branches, and PRs executed via `github-mcp-server` belong to the secondary dedicated GitHub profile. Ensure git operations stay scoped to this project's remote origin.

## 3. Strict Zero-Hallucination Policy

- **Evidence-Based Auditing:** Never report fake bugs, hallucinated status updates, or fabricated test results. Every claim MUST be backed by actual code references (file path + line numbers) or command output.
- **Build & Test Verification:** Always run local typechecks (`npm run build` or equivalent) before marking any task or feature as complete.

## 4. Non-Destructive Architectural Integrity

- **Isolate New Features:** Create dedicated, isolated new files and tables. Never alter working logic unless explicitly instructed.
- **Backward Compatibility:** Ensure all code additions preserve system stability across Neon projects.

## 5. Implementation Plan First

- Always inspect the workspace and propose a clear, step-by-step Implementation Plan before writing code.

## 6. Security & Fail-Safe Standards

- **Zero Hardcoded Secrets:** Never hardcode secrets in source files. All keys must reference environment variables (`.env`, Cloudflare Secrets, or GitHub Action Secrets).
- **Resilient Requests:** Inject explicit timeouts (`AbortSignal.timeout(8000)`) and jitter delays (2500ms-4000ms) on Pinterest endpoints to absorb HTTP 429/403 status codes cleanly.
