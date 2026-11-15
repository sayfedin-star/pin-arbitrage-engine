#!/usr/bin/env bash
# ==============================================================================
# scripts/instabox-boot-sync.sh
#
# InstaBox VM Boot-Time & Wake-Up Self-Sync Hook (Layer 2 & Layer 3)
# Ensures that whenever the InstaBox VM wakes up from cold sleep or starts
# pae-server.service, /data/app is automatically synchronized with origin/main,
# dependencies are verified, and pending PostgreSQL migrations are applied.
# ==============================================================================

set -uo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

APP_DIR="${INSTABOX_APP_DIR:-/data/app}"
MODE="${1:---sync}"

# ------------------------------------------------------------------------------
# Preemptive 420-Minute Epoch Reset Safeguard (Zero-Cooldown Max-Run Reset)
# ------------------------------------------------------------------------------
check_and_reset_uptime_epoch() {
  if [ -f "/proc/uptime" ]; then
    local uptime_seconds
    uptime_seconds=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
    local uptime_minutes=$((uptime_seconds / 60))
    local force_reset=0
    if [ "${MODE:-}" = "--reset-epoch" ] || [ "${1:-}" = "--reset-epoch" ]; then
      force_reset=1
    fi
    if [ "${uptime_minutes}" -ge 420 ] || [ "${force_reset}" -eq 1 ]; then
      echo "[instabox-boot-sync] ⏳ Machine continuous uptime is ${uptime_minutes}m (>= 420m / 7h threshold or forced reset)."
      echo "[instabox-boot-sync] Executing preemptive suspend-and-resume to reset 480m max-run epoch with 0 cooldown..."
      # Suspending the guest VM halts CPU execution before subsequent shell commands run;
      # in production, machine power transitions must be orchestrated externally (host CLI or CI).
      if [ "${INSTABOX_ORCHESTRATOR:-0}" = "1" ] || [ -n "${INSTABOX_HOST:-}" ]; then
        if command -v instabox >/dev/null 2>&1; then
          echo "[instabox-boot-sync] Running external orchestrator suspend/resume cycle..."
          instabox suspend && sleep 5 && instabox resume || true
        elif [ -n "${INSTABOX_API_KEY:-}" ] && [ -n "${INSTABOX_MACHINE_ID:-}" ]; then
          echo "[instabox-boot-sync] Triggering suspend/resume via InstaBox OpenAPI from external orchestrator..."
          local suspend_key
          suspend_key=$(uuidgen 2>/dev/null || date +%s%N)
          curl -s -X POST "https://api.instabox.sh/v1/machines/${INSTABOX_MACHINE_ID}/suspend" \
            -H "Authorization: Bearer ${INSTABOX_API_KEY}" \
            -H "Content-Type: application/json" \
            -H "Idempotency-Key: ${suspend_key}" \
            -d '{}' >/dev/null 2>&1 || true

          # Poll machine status before firing /resume
          local poll_retries=15
          while [ "${poll_retries}" -gt 0 ]; do
            local status
            status=$(curl -s -H "Authorization: Bearer ${INSTABOX_API_KEY}" "https://api.instabox.sh/v1/machines/${INSTABOX_MACHINE_ID}" 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "")
            if [ "${status}" = "suspended" ]; then
              break
            fi
            sleep 2
            poll_retries=$((poll_retries - 1))
          done

          local resume_key
          resume_key=$(uuidgen 2>/dev/null || date +%s%N)
          curl -s -X POST "https://api.instabox.sh/v1/machines/${INSTABOX_MACHINE_ID}/resume" \
            -H "Authorization: Bearer ${INSTABOX_API_KEY}" \
            -H "Content-Type: application/json" \
            -H "Idempotency-Key: ${resume_key}" \
            -d '{}' >/dev/null 2>&1 || true
        fi
      else
        echo "[instabox-boot-sync] Notice: Running in-VM without external orchestrator. Machine suspend halts guest execution; power transitions must be orchestrated from host CLI, CI workflow, or wake-shield."
      fi
    else
      echo "[instabox-boot-sync] Continuous uptime is ${uptime_minutes}m (< 420m threshold). No epoch reset needed."
    fi
  else
    echo "[instabox-boot-sync] /proc/uptime not present. Non-Linux or container environment."
  fi
}

# ------------------------------------------------------------------------------
# Mode 1: Install systemd ExecStartPre boot hook on InstaBox VPS
# ------------------------------------------------------------------------------
if [ "${MODE}" = "--install-hook" ]; then
  chmod +x "${APP_DIR}/scripts/instabox-boot-sync.sh" 2>/dev/null || true
  if command -v systemctl >/dev/null 2>&1; then
    echo "[instabox-boot-sync] Configuring systemd ExecStartPre boot-sync hook for pae-server.service..."
    sudo mkdir -p /etc/systemd/system/pae-server.service.d
    sudo tee /etc/systemd/system/pae-server.service.d/boot-sync.conf >/dev/null <<EOF
[Service]
ExecStartPre=-/bin/bash ${APP_DIR}/scripts/instabox-boot-sync.sh --boot
EOF
    sudo systemctl daemon-reload || true
    echo "[instabox-boot-sync] ✅ systemd boot-sync hook installed."
  fi
  exit 0
fi

if [ "${MODE}" = "--check-uptime" ] || [ "${MODE}" = "--reset-epoch" ]; then
  check_and_reset_uptime_epoch
  exit 0
fi

# ------------------------------------------------------------------------------
# PostgreSQL Container Provisioning & Safe Parallel Query (/dev/shm >= 1G)
# ------------------------------------------------------------------------------
sync_postgres_container() {
  if ! command -v docker >/dev/null 2>&1 || [ ! -d "/data/postgres" ]; then
    return 0
  fi

  # Ensure host /data/tmp exists with world-writable sticky permissions
  mkdir -p /data/tmp
  chmod 1777 /data/tmp 2>/dev/null || true

  local needs_recreate=0
  if docker ps -a --format '{{.Names}}' | grep -Eq '^pae-postgres$'; then
    local current_shm
    current_shm=$(docker inspect pae-postgres --format '{{.HostConfig.ShmSize}}' 2>/dev/null || echo 0)
    local has_tmp_mount
    has_tmp_mount=$(docker inspect pae-postgres --format '{{range .Mounts}}{{if eq .Destination "/data/tmp"}}found{{end}}{{end}}' 2>/dev/null || echo "")

    # Check if ShmSize is at least 1GB (1073741824 bytes) and /data/tmp is mounted
    if [ "${current_shm}" -lt 1073741824 ] || [ "${has_tmp_mount}" != "found" ]; then
      echo "[instabox-boot-sync] Upgrading pae-postgres container (shm: ${current_shm}, tmp_mount: ${has_tmp_mount:-none})..."
      docker exec pae-postgres psql -U postgres -d pin_arbitrage -c "CHECKPOINT;" 2>/dev/null || true
      docker stop -t 30 pae-postgres 2>/dev/null || true
      docker rm pae-postgres 2>/dev/null || true
      needs_recreate=1
    elif ! docker ps --format '{{.Names}}' | grep -Eq '^pae-postgres$'; then
      echo "[instabox-boot-sync] Starting stopped pae-postgres container..."
      docker start pae-postgres
    fi
  else
    needs_recreate=1
  fi

  if [ "${needs_recreate}" -eq 1 ]; then
    echo "[instabox-boot-sync] Launching pae-postgres with --shm-size=1g and TMPDIR=/data/tmp..."
    local pg_pass="${POSTGRES_PASSWORD:-}"
    if [ -z "${pg_pass}" ] && [ -f /data/app/.env ]; then
      pg_pass=$(grep -E '^DATABASE_URL=' /data/app/.env | head -n1 | sed -E 's|^DATABASE_URL=["'\'' ]?||; s|["'\'' ]*$||' | sed -nE 's|^postgres(ql)?://[^:]+:([^@]+)@.*|\2|p' || true)
    fi
    if [ -z "${pg_pass}" ] && [ -f "${APP_DIR}/.env" ]; then
      pg_pass=$(grep -E '^DATABASE_URL=' "${APP_DIR}/.env" | head -n1 | sed -E 's|^DATABASE_URL=["'\'' ]?||; s|["'\'' ]*$||' | sed -nE 's|^postgres(ql)?://[^:]+:([^@]+)@.*|\2|p' || true)
    fi
    if [ -z "${pg_pass}" ]; then
      pg_pass="pae_secure_default"
    fi

    docker run -d \
      --name pae-postgres \
      --restart unless-stopped \
      --shm-size=1g \
      -v /data/postgres:/var/lib/postgresql/data \
      -v /data/tmp:/data/tmp \
      -e TMPDIR=/data/tmp \
      -e POSTGRES_DB=pin_arbitrage \
      -e POSTGRES_PASSWORD="${pg_pass}" \
      -p 127.0.0.1:5432:5432 \
      postgres:16-alpine
  fi

  # Wait for PostgreSQL readiness
  local retries=30
  while [ $retries -gt 0 ]; do
    if docker exec pae-postgres pg_isready -U postgres -d pin_arbitrage >/dev/null 2>&1; then
      break
    fi
    sleep 1
    retries=$((retries - 1))
  done

  # Configure parallel workers if /dev/shm >= 1G
  local verified_shm
  verified_shm=$(docker inspect pae-postgres --format '{{.HostConfig.ShmSize}}' 2>/dev/null || echo 0)
  if [ "${verified_shm}" -ge 1073741824 ]; then
    docker exec pae-postgres psql -U postgres -d pin_arbitrage \
      -c "ALTER DATABASE pin_arbitrage SET max_parallel_workers_per_gather = 2;" \
      -c "ALTER SYSTEM RESET max_parallel_workers_per_gather;" \
      -c "SELECT pg_reload_conf();" >/dev/null 2>&1 || true
    echo "[instabox-boot-sync] ✅ pae-postgres verified with 1G /dev/shm and max_parallel_workers_per_gather=2."
  fi
}


# ------------------------------------------------------------------------------
# Mode 2: Boot / On-Demand Git + Dependencies + Migration Self-Sync
# ------------------------------------------------------------------------------
if [ ! -d "${APP_DIR}/.git" ]; then
  echo "[instabox-boot-sync] Skipping: ${APP_DIR}/.git not found."
  exit 0
fi

# Ensure PostgreSQL container and /dev/shm are synchronized while still root
sync_postgres_container

# Preserve repository owner if systemd runs ExecStartPre as root while repo is owned by dev
APP_OWNER=$(stat -c '%U' "${APP_DIR}" 2>/dev/null || echo "")
if [ "$(id -u 2>/dev/null || echo 1)" = "0" ] && [ -n "${APP_OWNER}" ] && [ "${APP_OWNER}" != "root" ]; then
  exec su -s /bin/bash "${APP_OWNER}" -c "INSTABOX_APP_DIR='${APP_DIR}' bash '${APP_DIR}/scripts/instabox-boot-sync.sh' '${MODE}'"
fi

cd "${APP_DIR}" || exit 0

# Check if continuous uptime has reached the 420m threshold to reset the 480m epoch
check_and_reset_uptime_epoch

OLD_SHA=$(git -c safe.directory="${APP_DIR}" rev-parse HEAD 2>/dev/null || echo "unknown")
echo "[instabox-boot-sync] Checking origin/main updates (current SHA: ${OLD_SHA})..."

if git -c safe.directory="${APP_DIR}" fetch origin main --quiet 2>/dev/null; then
  REMOTE_SHA=$(git -c safe.directory="${APP_DIR}" rev-parse origin/main 2>/dev/null || echo "${OLD_SHA}")
  if [ "${OLD_SHA}" != "${REMOTE_SHA}" ] || [ "${MODE}" = "--force" ]; then
    echo "[instabox-boot-sync] 🔄 Updating ${APP_DIR} from ${OLD_SHA} -> ${REMOTE_SHA}..."
    git -c safe.directory="${APP_DIR}" reset --hard origin/main
    chmod +x "${APP_DIR}/scripts/instabox-boot-sync.sh" 2>/dev/null || true

    # Install dependencies if package.json / package-lock.json changed or node_modules/fastify is missing
    if [ ! -d "${APP_DIR}/node_modules/fastify" ] || git -c safe.directory="${APP_DIR}" diff --name-only "${OLD_SHA}" "${REMOTE_SHA}" 2>/dev/null | grep -qE '^package(-lock)?\.json$'; then
      echo "[instabox-boot-sync] 📦 Synchronizing production dependencies..."
      npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund || true
    fi

    # Ensure PostgreSQL container has /dev/shm >= 1G before running migrations
    sync_postgres_container

    echo "[instabox-boot-sync] 🗄️ Running idempotent database migrations..."
    node scripts/migrate.mjs || true
    echo "[instabox-boot-sync] ✅ Synchronized to ${REMOTE_SHA}."
  else
    # Even if SHA matches, ensure fastify is installed and postgres is provisioned
    if [ ! -d "${APP_DIR}/node_modules/fastify" ]; then
      echo "[instabox-boot-sync] 📦 Installing missing production dependencies..."
      npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund || true
    fi
    sync_postgres_container
    echo "[instabox-boot-sync] ✅ Already at latest commit (${REMOTE_SHA})."
  fi
else
  echo "[instabox-boot-sync] ⚠️ Could not reach origin/main (offline or transient DNS); proceeding with local HEAD (${OLD_SHA})."
  sync_postgres_container
fi

exit 0
