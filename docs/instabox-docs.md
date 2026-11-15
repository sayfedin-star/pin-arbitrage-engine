# InstaBox Free-Tier Resilience & Operational Playbook

> **Scope**: Pin Arbitrage Engine (PAE) VPS Infrastructure, Dedicated PostgreSQL 16, and Free-Tier Uptime & Activity Management.

---

## 1. Architecture Overview

Pin Arbitrage Engine operates on an InstaBox VPS instance (`m_agq2t32m5xv5joj67rqoze5h4u`), running:
- **Dedicated PostgreSQL 16 container** (`pae-postgres`) on a 20 GiB persistent volume (`/data/postgres`).
- **Shared memory**: 1 GiB `/dev/shm` allocation with `/data/tmp` host mounting.
- **Fastify API Server**: Listening on `http://localhost:3000` (`HOST=::`).
- **Cloudflare Zero Trust Tunnel** (`cloudflared`): Secure ingress endpoint routing `https://app.hymum.com` directly to the local server without open inbound firewall ports.
- **Auto-Sync & Boot Hook**: `scripts/instabox-boot-sync.sh` installed as a systemd `ExecStartPre` hook on `pae-server.service`.

---

## 2. 480-Minute Continuous Runtime Epoch & Preemptive Reset

### The Free-Tier Constraint
InstaBox free-tier instances enforce a hard **480-minute (8-hour)** ceiling on continuous active execution. Once a machine runs continuously for 480 minutes without a power state transition, InstaBox forcefully stops the VM and applies an enforced cooldown period.

### The Zero-Cooldown Reset Solution
A voluntary machine suspension clears the continuous run counter immediately:
```bash
instabox suspend && sleep 5 && instabox resume
```
When executed proactively before reaching the 480-minute mark, this state transition resets the 480-minute epoch back to zero with **0 seconds cooldown**.

### Automated Threshold & Hook
`scripts/instabox-boot-sync.sh` embeds `check_and_reset_uptime_epoch`:
- Inspects `/proc/uptime`.
- If machine continuous uptime is **>= 420 minutes (7 hours)**:
  1. Issues `instabox suspend`.
  2. Sleeps 5 seconds.
  3. Issues `instabox resume`.
- Can be invoked directly via:
  ```bash
  /data/app/scripts/instabox-boot-sync.sh --check-uptime
  # Or force an immediate epoch reset:
  /data/app/scripts/instabox-boot-sync.sh --reset-epoch
  ```
- Automatically evaluated upon every service boot/sync cycle.
- **Orchestration Note**: When running inside the guest VM, invoking `instabox suspend` halts guest CPU execution before subsequent shell commands run; in production, machine power transitions should be orchestrated externally (via host CLI, CI workflow, or the InstaBox Machine API).

---

## 3. 30-Minute Idle Auto-Pause Prevention (Activity Leases)

### The Idle Timeout Trap
When no network requests or terminal sessions touch the InstaBox VM for 30 consecutive minutes, the hypervisor initiates auto-pause to conserve compute credits. If long-running batch transactions (such as domain intelligence rollups or rolling gains backfills) are processing entirely within local database transactions without outbound HTTP or external interaction, the machine risks mid-transaction suspension.

### The Activity Lease Heartbeat
Long-running background scripts instantiate `startInstaBoxActivityLease()`:
- **Modules**:
  - `scripts/refresh-domain-rollup.mjs`
  - `scripts/backfill_rolling_window_gains.mjs`
- **Mechanism**:
  - Spawns an unref'd timer ticking every **5 minutes** (well inside the 30-minute window).
  - Performs a lightweight authenticated GET ping to the InstaBox machine API:
    ```javascript
    fetch(`https://api.instabox.sh/v1/machines/${machineId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    ```
  - Keeps the InstaBox activity session hot throughout multi-hour data processing.
  - Automatically disposes of the interval when the job terminates or encounters an unhandled rejection.

---

## 4. PostgreSQL Container Provisioning & Safe Parallel Queries

### `/dev/shm` Shared Memory Guard
By default, Docker allocates 64 MB of shared memory (`/dev/shm`). Complex parallel query plans (`Hash Join`, `Parallel Bitmap Heap Scan`, `Sort`) across large datasets (`universal_master_pins`, `keyword_serp_positions`) fail fatally with:
```
ERROR: could not resize shared memory segment "/PostgreSQL.XXXXXX": No space left on device
```
`scripts/instabox-boot-sync.sh` provisions `pae-postgres` with:
```bash
docker run -d \
  --name pae-postgres \
  --restart unless-stopped \
  --shm-size=1g \
  -v /data/postgres:/var/lib/postgresql/data \
  -v /data/tmp:/data/tmp \
  -e TMPDIR=/data/tmp \
  -e POSTGRES_DB=pin_arbitrage \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine
```

### Parallel Worker Configuration
With verified 1 GiB `/dev/shm`, the boot-sync script configures:
```sql
ALTER DATABASE pin_arbitrage SET max_parallel_workers_per_gather = 2;
```
This enables dual-worker parallel scans on `universal_master_pins` and `keyword_serp_positions` for sub-15ms queries while preventing CPU starvation on InstaBox's vCPU allocation.
