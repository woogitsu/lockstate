#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Brings a fresh remote container to the point where `pnpm verify` and
# `pnpm verify:sql` both run without manual setup:
#
#   * Node 24.19.0 exactly -- tests/foundation/repository-contract.test.ts
#     asserts `process.version`, and remote containers start on Node 22, so
#     the suite fails on an untouched container for an unrelated reason.
#   * pnpm via corepack at the version package.json pins.
#   * PostgreSQL 16 + pgTAP, because supabase/ carries migrations and pgTAP
#     suites that the Supabase local stack cannot run here (its container
#     images are blocked by network policy). A plain Postgres runs the SQL
#     itself -- see docs/CLOUD_SAVE.md for what that does and does not prove.
#
# Idempotent: every step checks before it acts, so `resume` and `clear`
# re-runs are cheap.
set -euo pipefail

# Local machines already have their own toolchain; this only fixes up the
# remote container.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REQUIRED_NODE="24.19.0"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

log() { echo "[session-start] $*"; }

# --- Node -------------------------------------------------------------
# nvm's location varies between images (/opt/nvm here, $HOME/.nvm on
# others), and its script is not `set -u` clean, so source it defensively
# and ask nvm itself where the binary landed rather than guessing a path.
load_nvm() {
  local candidate
  for candidate in "${NVM_DIR:-}" /opt/nvm "$HOME/.nvm" /usr/local/nvm; do
    [ -n "$candidate" ] && [ -s "$candidate/nvm.sh" ] || continue
    export NVM_DIR="$candidate"
    set +u
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    set -u
    return 0
  done
  return 1
}

if load_nvm; then
  # `nvm which` is the idempotency check: it succeeds only when that exact
  # version is already on disk, so a resume/clear re-run skips the download.
  if ! nvm which "$REQUIRED_NODE" >/dev/null 2>&1; then
    log "installing Node ${REQUIRED_NODE}"
    nvm install "$REQUIRED_NODE" >/dev/null
    nvm alias default "$REQUIRED_NODE" >/dev/null 2>&1 || true
  fi
else
  log "WARNING: nvm not found; staying on $(node --version 2>/dev/null || echo 'no node')"
fi

if NODE_BIN="$(dirname "$(nvm which "$REQUIRED_NODE" 2>/dev/null || true)")" \
   && [ -x "${NODE_BIN}/node" ]; then
  export PATH="${NODE_BIN}:$PATH"
  # Persist for the session: without this the agent's own shells fall back
  # to the container's Node 22 and the contract test fails again.
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"${NODE_BIN}:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
fi

if [ "$(node --version 2>/dev/null || true)" != "v${REQUIRED_NODE}" ]; then
  log "WARNING: expected Node v${REQUIRED_NODE}, got $(node --version 2>/dev/null || echo none); pnpm test will fail its contract check"
else
  log "node $(node --version)"
fi

# --- pnpm and project dependencies ------------------------------------
corepack enable >/dev/null 2>&1 || true
corepack prepare --activate >/dev/null 2>&1 || true

cd "$PROJECT_DIR"
log "installing project dependencies"
pnpm install --frozen-lockfile

# --- PostgreSQL 16 + pgTAP (for pnpm verify:sql) ----------------------
if ! [ -x /usr/lib/postgresql/16/bin/postgres ] || ! ls /usr/share/postgresql/16/extension/pgtap.control >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
    log "installing postgresql-16 and pgTAP"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq -o DPkg::Lock::Timeout=120 >/dev/null 2>&1 || true
    apt-get install -y -qq -o DPkg::Lock::Timeout=120 \
      postgresql-16 postgresql-16-pgtap postgresql-client-16 >/dev/null 2>&1 \
      || log "WARNING: postgres install failed; pnpm verify:sql will not run"
  else
    log "WARNING: cannot install postgres (needs apt-get as root); pnpm verify:sql will not run"
  fi
fi

if command -v pg_ctlcluster >/dev/null 2>&1; then
  pg_isready -q 2>/dev/null || pg_ctlcluster 16 main start >/dev/null 2>&1 || true

  if pg_isready -q 2>/dev/null; then
    # A superuser role named after the current user lets psql connect over
    # peer auth with no password and no DATABASE_URL, which is what
    # scripts/verify-supabase-sql.mjs assumes by default.
    CURRENT_USER="$(id -un)"
    su postgres -c "psql -tAc \"select 1 from pg_roles where rolname = '${CURRENT_USER}'\"" 2>/dev/null | grep -q 1 \
      || su postgres -c "psql -q -c \"create role \\\"${CURRENT_USER}\\\" login superuser\"" >/dev/null 2>&1 || true
    log "postgres ready ($(su postgres -c 'psql -tAc "show server_version"' 2>/dev/null || echo unknown))"
  else
    log "WARNING: postgres did not start; pnpm verify:sql will not run"
  fi
fi

log "done"
