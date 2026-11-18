# InstaBox Free-Tier Lifecycle, Resilience & PostgreSQL 16 Playbook

> **Scope**: Pin Arbitrage Engine (PAE) VPS Infrastructure (`m_agq2t32m5xv5joj67rqoze5h4u`), Official InstaBox Free-Plan Lifecycle Mechanics, Activity Lease API, and Dedicated PostgreSQL 16 Tuning.

---

## 1. Architecture Overview

Pin Arbitrage Engine operates on an InstaBox sandbox instance (`m_agq2t32m5xv5joj67rqoze5h4u`), running:
- **Dedicated PostgreSQL 16 container** (`pae-postgres`) on a 20 GiB persistent volume (`/data/postgres`) with `-c max_connections=250`.
- **Shared memory & temp spill**: 1 GiB `/dev/shm` allocation with `/data/tmp` host mounting (`TMPDIR=/data/tmp`).
- **Fastify v5 Origin Server**: Listening on `http://127.0.0.1:3000` (`pae-server.service`).
- **Cloudflare Zero Trust Tunnel (`cloudflared`) + Edge Wake-Shield**: Routes `https://app.hymum.com` and `db.hymum.com` without open inbound firewall ports.
- **Systemd Boot Hook**: `scripts/instabox-boot-sync.sh` installed as `ExecStartPre=+/bin/bash /data/app/scripts/instabox-boot-sync.sh --boot` on `pae-server.service`.

---

## 2. Official InstaBox Free-Plan Lifecycle Mechanics

### A. Fixed 30-Minute Idle Auto-Pause (`0s` Cooldown)
- InstaBox free-plan machines have a fixed **`30-minute` (`1800s`)** idle auto-pause window (`autoSuspendAfterSeconds: 1800`).
- Entering natural 30-minute idle auto-pause incurs **`0 seconds` cooldown** (`cooldownUntil: null`) AND **resets max-run cooldown escalation steps**.
- Releasing activity leases promptly as soon as crawls finish allows the machine to sleep cleanly between scheduled runs with zero penalty.

### B. Dynamic `maxRunMinutes` (`120m` -> `480m`) & Escalating Max-Run Cooldowns
- When a machine resumes from suspended/stopped state, `maxRunMinutes` starts at **`120 minutes` (2 hours)** and **automatically grows with active guest usage** (`>= 1 minute` of active execution within a `30-minute` window) up to a hard ceiling of **`480 minutes` (8 hours)**.
- Once a machine reaches its `maxRunMinutes` ceiling (especially the hard `480m` wall where no further auto-extension is possible), InstaBox forcibly suspends the VM and applies an **escalating mandatory cooldown** (`5–20m` -> `60–75m` -> `120–135m`).

### C. Smart CI Stage 0 Preemptive Reset (`410m` Guard) & Active-Use Registration
In `.github/actions/setup-instabox-db/action.yml` (when `skip-wakeup` is `false` and `IB_API_KEY` is configured):
1. Queries `GET https://api.instabox.sh/v1/machines/${IB_MACHINE_ID}` and inspects `state`, `runStartedAt`, `maxRunMinutes`, and `cooldownUntil`.
2. If the machine has been running continuously past **`410 minutes`** (approaching the hard `480m` ceiling), CI performs a clean external reset before launching a 60-minute crawl:
   - `POST /v1/machines/${IB_MACHINE_ID}/suspend` (with `Idempotency-Key`)
   - Polls until `state === 'suspended'`
   - `POST /v1/machines/${IB_MACHINE_ID}/start` (with `Idempotency-Key`)
3. Dispatches a lightweight guest `POST /v1/machines/${IB_MACHINE_ID}/exec` (`["echo", "pae-stage0-active"]`) readiness probe during Stage 0 so InstaBox records active guest execution and enables natural `120m -> 240m -> 480m` growth when consecutive pipelines run.

---

## 3. Official Activity Lease API (`PUT` / `DELETE /activity-leases/{taskId}`)

> **Important:** Passive `GET /v1/machines/{id}` metadata polls do **NOT** count as machine activity and do **NOT** prevent the 30-minute idle auto-pause!

Long-running CLI crawlers and consolidation jobs use `startInstaBoxActivityLease(taskName)` in `scripts/lib/cli-utils.mjs`:
- **Acquire & Renew (`PUT`):**
  - Immediately on startup and every **`240,000 ms` (4 minutes)** thereafter, sends:
    ```http
    PUT https://api.instabox.sh/v1/machines/{machineId}/activity-leases/{taskId}
    Authorization: Bearer <INSTABOX_API_KEY>
    X-API-Key: <INSTABOX_API_KEY>
    Content-Type: application/json

    {"ttlSeconds": 600}
    ```
  - `taskId` is sanitized to `[a-zA-Z0-9_-]+` (e.g., `pae-keyword-velocity-crawler-<pid>`).
- **Deterministic Release (`DELETE` in `finally`):**
  - Every crawler/rollup script (`keyword-velocity-crawler.mjs`, `creator-velocity-crawler.mjs`, `cluster-intelligence.mjs`, `account-related-crawler.mjs`, `refresh-domain-rollup.mjs`, `backfill_rolling_window_gains.mjs`) calls `await lease.stop()` in its `finally` block alongside `await sql.end()`:
    ```http
    DELETE https://api.instabox.sh/v1/machines/{machineId}/activity-leases/{taskId}
    Authorization: Bearer <INSTABOX_API_KEY>
    X-API-Key: <INSTABOX_API_KEY>
    ```
  - Deleting the lease immediately upon completion lets the VM enter clean `30m` idle auto-pause (`0s` cooldown) instead of lingering unnecessarily.

---

## 4. Hardened Boot Provisioning & PostgreSQL 16 Tuning (`scripts/instabox-boot-sync.sh`)

1. **Secret & Privilege Hardening:**
   - Validates `MODE` against an explicit `case` allowlist (`--sync|--boot|--force|--install-hook|--check-uptime|--reset-epoch`) and drops privileges with positional `runuser` / `sudo -u` arguments (never `su -c` string interpolation).
   - Enforces `chmod 600` on `/data/app/.env` and passes `POSTGRES_PASSWORD` to `docker run` via a temporary `0600` `--env-file` deleted immediately after container creation (never exposing passwords in `ps aux` argv).
   - Installs systemd drop-in `ExecStartPre=+/bin/bash /data/app/scripts/instabox-boot-sync.sh --boot` (`+` grants root Docker access; omitting `-` halts service startup if SQL migrations fail).
2. **Container & Database-Level PostgreSQL 16 Tuning:**
   - Provisions `pae-postgres` (`postgres:16-alpine -c max_connections=250`) with `--shm-size=1g` and `-v /data/tmp:/data/tmp`.
   - Applies idempotent database-level settings on `pin_arbitrage`:
     ```sql
     ALTER DATABASE pin_arbitrage SET statement_timeout = '60s';
     ALTER DATABASE pin_arbitrage SET lock_timeout = '15s';
     ALTER DATABASE pin_arbitrage SET idle_in_transaction_session_timeout = '60s';
     ALTER DATABASE pin_arbitrage SET random_page_cost = 1.1;
     ALTER DATABASE pin_arbitrage SET work_mem = '32MB';
     ALTER DATABASE pin_arbitrage SET max_parallel_workers_per_gather = 2;
     ```
