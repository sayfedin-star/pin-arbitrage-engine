#!/usr/bin/env bash
# ==============================================================================
# scripts/instabox-boot-sync.sh
#
# InstaBox VM Boot-Time & Wake-Up Self-Sync Hook (Layer 2 & Layer 3)
# Ensures that whenever the InstaBox VM wakes up from cold sleep or starts
# pae-server.service, /data/app is synchronized with origin/main, PostgreSQL 16
# is provisioned/tuned safely, and pending schema migrations are applied.
# ==============================================================================

set -uo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

APP_DIR="${INSTABOX_APP_DIR:-/data/app}"
MODE="${1:---sync}"

# Strict allowlist validation for MODE before any privileged execution or user switch
case "${MODE}" in
  --sync|--boot|--force|--install-hook|--check-uptime|--reset-epoch)
    ;;
  *)
    echo "[instabox-boot-sync] ❌ Invalid mode '${MODE}'. Allowed: --sync|--boot|--force|--install-hook|--check-uptime|--reset-epoch" >&2
    exit 2
    ;;
esac

enforce_env_permissions() {
  if [ -f "/data/app/.env" ]; then
    chmod 600 "/data/app/.env" 2>/dev/null || true
  fi
  if [ -f "${APP_DIR}/.env" ]; then
    chmod 600 "${APP_DIR}/.env" 2>/dev/null || true
  fi
}

# ------------------------------------------------------------------------------
# Preemptive 410-Minute Epoch Reset Safeguard (Approaching 480m Hard Ceiling)
# ------------------------------------------------------------------------------
check_and_reset_uptime_epoch() {
  if [ -f "/proc/uptime" ]; then
    local uptime_seconds
    uptime_seconds=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
    local uptime_minutes=$((uptime_seconds / 60))
    local force_reset=0
    if [ "${MODE}" = "--reset-epoch" ] || [ "${1:-}" = "--reset-epoch" ]; then
      force_reset=1
    fi
    if [ "${uptime_minutes}" -ge 410 ] || [ "${force_reset}" -eq 1 ]; then
      echo "[instabox-boot-sync] ⏳ Machine continuous uptime is ${uptime_minutes}m (>= 410m threshold approaching 480m hard ceiling, or forced reset)."
      if [ "${INSTABOX_ORCHESTRATOR:-0}" = "1" ] || [ -n "${INSTABOX_HOST:-}" ]; then
        if command -v instabox >/dev/null 2>&1; then
          echo "[instabox-boot-sync] Running external orchestrator suspend/start cycle..."
          instabox suspend && sleep 5 && instabox resume || true
        elif [ -n "${INSTABOX_API_KEY:-}" ] && [ -n "${INSTABOX_MACHINE_ID:-}" ]; then
          echo "[instabox-boot-sync] Triggering external suspend -> poll -> start via InstaBox OpenAPI..."
          local suspend_key
          suspend_key=$(uuidgen 2>/dev/null || date +%s%N)
          curl -s -X POST "https://api.instabox.sh/v1/machines/${INSTABOX_MACHINE_ID}/suspend" \
            -H "Authorization: Bearer ${INSTABOX_API_KEY}" \
            -H "X-API-Key: ${INSTABOX_API_KEY}" \
            -H "Content-Type: application/json" \
            -H "Idempotency-Key: ${suspend_key}" \
            -d '{}' >/dev/null 2>&1 || true

          local poll_retries=30
          while [ "${poll_retries}" -gt 0 ]; do
            local status
            status=$(curl -s -H "Authorization: Bearer ${INSTABOX_API_KEY}" "https://api.instabox.sh/v1/machines/${INSTABOX_MACHINE_ID}" 2>/dev/null | sed -nE 's/.*"(state|status)"[[:space:]]*:[[:space:]]*"([^"]+)".*/\2/p' | head -n1 || echo "")
            if [ "${status}" = "suspended" ] || [ "${status}" = "stopped" ]; then
              break
            fi
            sleep 2
            poll_retries=$((poll_retries - 1))
          done

          local start_key
          start_key=$(uuidgen 2>/dev/null || date +%s%N)
          curl -s -X POST "https://api.instabox.sh/v1/machines/${INSTABOX_MACHINE_ID}/start" \
            -H "Authorization: Bearer ${INSTABOX_API_KEY}" \
            -H "X-API-Key: ${INSTABOX_API_KEY}" \
            -H "Content-Type: application/json" \
            -H "Idempotency-Key: ${start_key}" \
            -d '{}' >/dev/null 2>&1 || true
        fi
      else
        echo "[instabox-boot-sync] Notice: Running in-VM without external orchestrator; power transitions are managed externally by CI Stage 0 or Wake-Shield."
      fi
    else
      echo "[instabox-boot-sync] Continuous uptime is ${uptime_minutes}m (< 410m threshold). No epoch reset needed."
    fi
  else
    echo "[instabox-boot-sync] /proc/uptime not present. Non-Linux or container environment."
  fi
}

# ------------------------------------------------------------------------------
# Mode 1: Install systemd ExecStartPre boot hook on InstaBox VPS
# ------------------------------------------------------------------------------
if [ "${MODE}" = "--install-hook" ]; then
  enforce_env_permissions
  chmod +x "${APP_DIR}/scripts/instabox-boot-sync.sh" 2>/dev/null || true
  if command -v systemctl >/dev/null 2>&1; then
    echo "[instabox-boot-sync] Configuring systemd ExecStartPre boot-sync hook for pae-server.service..."
    sudo mkdir -p /etc/systemd/system/pae-server.service.d
    sudo tee /etc/systemd/system/pae-server.service.d/boot-sync.conf >/dev/null <<EOF
[Service]
ExecStartPre=+/bin/bash ${APP_DIR}/scripts/instabox-boot-sync.sh --boot
EOF
    sudo systemctl daemon-reload || true
    echo "[instabox-boot-sync] ✅ systemd boot-sync hook installed."
  fi
  exit 0
fi

if [ "${MODE}" = "--check-uptime" ] || [ "${MODE}" = "--reset-epoch" ]; then
  check_and_reset_uptime_epoch "${MODE}"
  exit 0
fi

# ------------------------------------------------------------------------------
# PostgreSQL 16 Container Provisioning, Secret Protection & Database Tuning
# ------------------------------------------------------------------------------
sync_postgres_container() {
  enforce_env_permissions

  if [ "${PAE_POSTGRES_SYNCED:-0}" = "1" ] && [ "${1:-}" != "--force" ]; then
    return 0
  fi
  if ! command -v docker >/dev/null 2>&1 || [ ! -d "/data/postgres" ]; then
    return 0
  fi

  mkdir -p /data/tmp
  chmod 1777 /data/tmp 2>/dev/null || true

  local needs_recreate=0
  if docker ps -a --format '{{.Names}}' | grep -Eq '^pae-postgres$'; then
    local current_shm
    current_shm=$(docker inspect pae-postgres --format '{{.HostConfig.ShmSize}}' 2>/dev/null || echo 0)
    local has_tmp_mount
    has_tmp_mount=$(docker inspect pae-postgres --format '{{range .Mounts}}{{if eq .Destination "/data/tmp"}}found{{end}}{{end}}' 2>/dev/null || echo "")

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
    echo "[instabox-boot-sync] Launching pae-postgres with --shm-size=1g, TMPDIR=/data/tmp, and max_connections=250..."
    local pg_pass="${POSTGRES_PASSWORD:-}"
    if [ -z "${pg_pass}" ] && command -v node >/dev/null 2>&1; then
      local env_file=""
      if [ -f "/data/app/.env" ]; then
        env_file="/data/app/.env"
      elif [ -f "${APP_DIR}/.env" ]; then
        env_file="${APP_DIR}/.env"
      fi
      if [ -n "${env_file}" ]; then
        pg_pass=$(node -e '
          const fs = require("fs");
          try {
            const m = fs.readFileSync(process.argv[1], "utf8").match(/^DATABASE_URL=["'"'"']?([^"'"'"'\r\n]+)/m);
            if (m) {
              const u = new URL(m[1].trim());
              process.stdout.write(decodeURIComponent(u.password || ""));
            }
          } catch (_) {}
        ' "${env_file}" 2>/dev/null || true)
      fi
    fi
    if [ -z "${pg_pass}" ] && [ -f "/data/app/.env" ]; then
      pg_pass=$(grep -E '^DATABASE_URL=' /data/app/.env | head -n1 | sed -E 's|^DATABASE_URL=["'\'' ]?||; s|["'\'' ]*$||' | sed -nE 's|^postgres(ql)?://[^:]+:([^@]+)@.*|\2|p' || true)
    fi
    if [ -z "${pg_pass}" ] && [ -f "${APP_DIR}/.env" ]; then
      pg_pass=$(grep -E '^DATABASE_URL=' "${APP_DIR}/.env" | head -n1 | sed -E 's|^DATABASE_URL=["'\'' ]?||; s|["'\'' ]*$||' | sed -nE 's|^postgres(ql)?://[^:]+:([^@]+)@.*|\2|p' || true)
    fi
    if [ -z "${pg_pass}" ]; then
      pg_pass=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
      echo "[instabox-boot-sync] Generated ephemeral random PostgreSQL password fallback (no POSTGRES_PASSWORD/.env found)."
    fi

    # Pass POSTGRES_PASSWORD via temporary 0600 --env-file so credentials never appear in ps aux
    local pg_env_file
    pg_env_file=$(mktemp /data/tmp/pae-pg-env.XXXXXX 2>/dev/null || mktemp /tmp/pae-pg-env.XXXXXX)
    chmod 600 "${pg_env_file}"
    printf 'TMPDIR=/data/tmp\nPOSTGRES_DB=pin_arbitrage\nPOSTGRES_PASSWORD=%s\n' "${pg_pass}" > "${pg_env_file}"

    docker run -d \
      --name pae-postgres \
      --restart unless-stopped \
      --shm-size=1g \
      -v /data/postgres:/var/lib/postgresql/data \
      -v /data/tmp:/data/tmp \
      --env-file "${pg_env_file}" \
      -p 127.0.0.1:5432:5432 \
      postgres:16-alpine \
      -c max_connections=250
    local docker_rc=$?
    rm -f "${pg_env_file}"
    if [ "${docker_rc}" -ne 0 ]; then
      echo "[instabox-boot-sync] ❌ Failed starting pae-postgres container (exit ${docker_rc})." >&2
      return "${docker_rc}"
    fi
  fi

  # Wait for PostgreSQL readiness
  local retries=30
  while [ "${retries}" -gt 0 ]; do
    if docker exec pae-postgres pg_isready -U postgres -d pin_arbitrage >/dev/null 2>&1; then
      break
    fi
    sleep 1
    retries=$((retries - 1))
  done

  # Apply idempotent PostgreSQL 16 database-level tuning parameters
  docker exec pae-postgres psql -U postgres -d pin_arbitrage \
    -c "ALTER DATABASE pin_arbitrage SET statement_timeout = '60s';" \
    -c "ALTER DATABASE pin_arbitrage SET lock_timeout = '15s';" \
    -c "ALTER DATABASE pin_arbitrage SET idle_in_transaction_session_timeout = '60s';" \
    -c "ALTER DATABASE pin_arbitrage SET random_page_cost = 1.1;" \
    -c "ALTER DATABASE pin_arbitrage SET work_mem = '32MB';" >/dev/null 2>&1 || true

  local verified_shm
  verified_shm=$(docker inspect pae-postgres --format '{{.HostConfig.ShmSize}}' 2>/dev/null || echo 0)
  if [ "${verified_shm}" -ge 1073741824 ]; then
    docker exec pae-postgres psql -U postgres -d pin_arbitrage \
      -c "ALTER DATABASE pin_arbitrage SET max_parallel_workers_per_gather = 2;" \
      -c "ALTER SYSTEM RESET max_parallel_workers_per_gather;" \
      -c "SELECT pg_reload_conf();" >/dev/null 2>&1 || true
    echo "[instabox-boot-sync] ✅ pae-postgres verified with 1G /dev/shm and PG16 tuning parameters."
  fi
  export PAE_POSTGRES_SYNCED=1
}

# ------------------------------------------------------------------------------
# Mode 2: Boot / On-Demand Git + Dependencies + Migration Self-Sync
# ------------------------------------------------------------------------------
enforce_env_permissions

if [ ! -d "${APP_DIR}/.git" ]; then
  echo "[instabox-boot-sync] Skipping: ${APP_DIR}/.git not found."
  exit 0
fi

# Ensure PostgreSQL container and /dev/shm are synchronized while running as root
sync_postgres_container
export PAE_POSTGRES_SYNCED=1

# Drop privileges using positional arguments only (no su -c shell interpolation)
APP_OWNER=$(stat -c '%U' "${APP_DIR}" 2>/dev/null || echo "")
if [ "$(id -u 2>/dev/null || echo 1)" = "0" ] && [ -n "${APP_OWNER}" ] && [ "${APP_OWNER}" != "root" ]; then
  if command -v runuser >/dev/null 2>&1; then
    exec env PAE_POSTGRES_SYNCED=1 INSTABOX_APP_DIR="${APP_DIR}" \
      runuser -u "${APP_OWNER}" -- /bin/bash "${APP_DIR}/scripts/instabox-boot-sync.sh" "${MODE}"
  else
    exec sudo -u "${APP_OWNER}" env PAE_POSTGRES_SYNCED=1 INSTABOX_APP_DIR="${APP_DIR}" \
      /bin/bash "${APP_DIR}/scripts/instabox-boot-sync.sh" "${MODE}"
  fi
fi

enforce_env_permissions
cd "${APP_DIR}" || exit 0

check_and_reset_uptime_epoch

OLD_SHA=$(git -c safe.directory="${APP_DIR}" rev-parse HEAD 2>/dev/null || echo "unknown")
echo "[instabox-boot-sync] Checking origin/main updates (current SHA: ${OLD_SHA})..."

if git -c safe.directory="${APP_DIR}" fetch origin main --quiet 2>/dev/null; then
  REMOTE_SHA=$(git -c safe.directory="${APP_DIR}" rev-parse origin/main 2>/dev/null || echo "${OLD_SHA}")
  if [ "${OLD_SHA}" != "${REMOTE_SHA}" ] || [ "${MODE}" = "--force" ]; then
    echo "[instabox-boot-sync] 🔄 Updating ${APP_DIR} from ${OLD_SHA} -> ${REMOTE_SHA}..."
    git -c safe.directory="${APP_DIR}" reset --hard origin/main
    chmod +x "${APP_DIR}/scripts/instabox-boot-sync.sh" 2>/dev/null || true
    enforce_env_permissions

    if [ ! -d "${APP_DIR}/node_modules/fastify" ] || git -c safe.directory="${APP_DIR}" diff --name-only "${OLD_SHA}" "${REMOTE_SHA}" 2>/dev/null | grep -qE '^package(-lock)?\.json$'; then
      echo "[instabox-boot-sync] 📦 Synchronizing production dependencies..."
      npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund || true
    fi

    sync_postgres_container

    echo "[instabox-boot-sync] 🗄️ Running idempotent database migrations..."
    if ! node scripts/migrate.mjs; then
      echo "[instabox-boot-sync] ❌ Database migration failed; aborting sync." >&2
      exit 1
    fi
    echo "[instabox-boot-sync] ✅ Synchronized to ${REMOTE_SHA}."
  else
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
