#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Brings a fresh remote container to the point where every check this
# repository can run here does so without manual setup:
#
#   * Node 24.19.0 exactly -- tests/foundation/repository-contract.test.ts
#     asserts `process.version`, and remote containers start on Node 22, so
#     the suite fails on an untouched container for an unrelated reason.
#   * pnpm via corepack at the version package.json pins.
#   * PostgreSQL + pgTAP, because supabase/ carries migrations and pgTAP
#     suites that the Supabase local stack cannot run here (its container
#     images are blocked by network policy). A plain Postgres runs the SQL
#     itself -- see docs/CLOUD_SAVE.md for what that does and does not prove.
#     That step lives in scripts/provision-postgres.sh, shared with CI.
#   * The Git LFS client, so `git lfs pull` is available for the runtime
#     atlases `pnpm verify:assets` and tests/browser/app-shell.spec.ts read.
#     The client only -- the pull itself is left to whoever needs the art,
#     for the same reason the `verify` CI job stays on a pointer-only
#     checkout: LFS bandwidth is metered and most sessions never open a PNG.
#   * Playwright's Chromium, so `pnpm test:browser` runs. The script probes
#     by launching the browser, so a container that already ships one (this
#     image has it under PLAYWRIGHT_BROWSERS_PATH) downloads nothing.
#
# Every provisioning step is a repository script that CI runs too, so the two
# environments cannot drift into provisioning different things.
#
# NOT PROVISIONED, deliberately: the Supabase local stack behind
# `pnpm verify:stack`. It needs Docker images, and the container registry is
# refused by this environment's egress policy, so there is nothing to install
# that would make that check run -- see docs/TESTING.md.
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

# --- PostgreSQL + pgTAP (for pnpm verify:sql) -------------------------
# Delegated to scripts/provision-postgres.sh, which CI runs too, so the two
# environments cannot drift into provisioning different databases. A failure
# here is a warning rather than a hook failure: a container without a
# database can still do everything except `pnpm verify:sql`, and CI is where
# missing SQL provisioning must be fatal.
if ! bash "${PROJECT_DIR}/scripts/provision-postgres.sh"; then
  log "WARNING: postgres provisioning failed; pnpm verify:sql will not run"
fi

# --- Git LFS client (for pnpm verify:assets) --------------------------
# Same shape as the database step: the shared script, and a warning rather
# than a hook failure, because a container without it can still do
# everything except read the art.
if ! bash "${PROJECT_DIR}/scripts/provision-git-lfs.sh"; then
  log "WARNING: git-lfs provisioning failed; the runtime atlases stay pointers"
fi

# --- Playwright's Chromium (for pnpm test:browser) --------------------
# Note that the browser suite's app-shell spec also needs the atlases as real
# pixels, which is a `git lfs pull --include="public/assets/actors"` away;
# the rest of the suite runs on a pointer-only tree.
if ! bash "${PROJECT_DIR}/scripts/provision-playwright-browsers.sh"; then
  log "WARNING: Chromium provisioning failed; pnpm test:browser will not run"
fi

log "done"
