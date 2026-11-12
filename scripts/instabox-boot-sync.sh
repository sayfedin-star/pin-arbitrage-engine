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

# ------------------------------------------------------------------------------
# Mode 2: Boot / On-Demand Git + Dependencies + Migration Self-Sync
# ------------------------------------------------------------------------------
if [ ! -d "${APP_DIR}/.git" ]; then
  echo "[instabox-boot-sync] Skipping: ${APP_DIR}/.git not found."
  exit 0
fi

# Preserve repository owner if systemd runs ExecStartPre as root while repo is owned by dev
APP_OWNER=$(stat -c '%U' "${APP_DIR}" 2>/dev/null || echo "")
if [ "$(id -u 2>/dev/null || echo 1)" = "0" ] && [ -n "${APP_OWNER}" ] && [ "${APP_OWNER}" != "root" ]; then
  exec su -s /bin/bash "${APP_OWNER}" -c "INSTABOX_APP_DIR='${APP_DIR}' bash '${APP_DIR}/scripts/instabox-boot-sync.sh' '${MODE}'"
fi

cd "${APP_DIR}" || exit 0

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

    echo "[instabox-boot-sync] 🗄️ Running idempotent database migrations..."
    node scripts/migrate.mjs || true
    echo "[instabox-boot-sync] ✅ Synchronized to ${REMOTE_SHA}."
  else
    # Even if SHA matches, ensure fastify is installed
    if [ ! -d "${APP_DIR}/node_modules/fastify" ]; then
      echo "[instabox-boot-sync] 📦 Installing missing production dependencies..."
      npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund || true
    fi
    echo "[instabox-boot-sync] ✅ Already at latest commit (${REMOTE_SHA})."
  fi
else
  echo "[instabox-boot-sync] ⚠️ Could not reach origin/main (offline or transient DNS); proceeding with local HEAD (${OLD_SHA})."
fi

exit 0
