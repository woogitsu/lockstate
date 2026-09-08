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
#   * PostgreSQL + pgTAP, because supabase/ carries migrations and pgTAP
#     suites that the Supabase local stack cannot run here (its container
#     images are blocked by network policy). A plain Postgres runs the SQL
#     itself -- see docs/CLOUD_SAVE.md for what that does and does not prove.
#     That step lives in scripts/provision-postgres.sh, shared with CI.
#
# It deliberately does NOT provision everything CI provisions. scripts/ holds
# four provision-*.sh; this calls one. The two it skips are expensive rather
# than forgotten -- `git lfs pull` is metered bandwidth and the Playwright
# browsers are a ~280 MiB download -- so instead of paying that on every
# session start, the summary printed at the end of this hook names what was
# skipped and which commands it disables. Issue #138: that gap had been
# rediscovered and re-explained in at least three consecutive sessions, and a
# line of output is cheaper than another handover note.
#
# Idempotent: every step checks before it acts, so `resume` and `clear`
# re-runs are cheap.
set -euo pipefail

# Local machines already have their own toolchain; this only fixes up the
# remote container.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Read from `.node-version` rather than repeating it. That file is the source
# of truth CI reads at three points, and `tests/foundation/repository-contract.test.ts`
# pins it deliberately so a bump fails the suite. A third literal here was not
# deliberate (issue #124): it would have gone stale silently on the next bump,
# and this hook is the one place whose disagreement nothing would catch.
REQUIRED_NODE="$(tr -d '[:space:]' < "${PROJECT_DIR}/.node-version")"
if [ -z "${REQUIRED_NODE}" ]; then
  echo "[session-start] .node-version is missing or empty; cannot provision Node." >&2
  exit 1
fi

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

# --- git history (for pnpm verify) ------------------------------------
# A remote container clones SHALLOW, and that breaks `pnpm verify` -- which is
# the one thing the header of this file says the hook exists to make runnable.
#
# WHAT IT COSTS TO LEAVE ALONE, MEASURED ON 2026-09-07 IN A CONTAINER THIS HOOK
# HAD JUST FINISHED PROVISIONING: `.git/shallow` present, `git rev-list --count
# HEAD` 192, no tags at all, and `git rev-list --remotes=origin --tags` 254.
# `tests/foundation/documentation-commit-citation-contract.test.ts` needs that
# last number above 500 -- it is the vacuity guard on "cites only commits this
# repository publishes", because with almost no published commits in hand every
# citation in the corpus reads as unpublished -- so three of its cases fail with
# `expected 254 to be greater than 500` and a diff listing the whole corpus.
# That is `pnpm test` red, and therefore `pnpm verify` red, on an untouched
# container for a reason that has nothing to do with the tree under test.
#
# The test says so itself, in its own failure message: "Either this checkout is
# shallow (see the first case) ... `git fetch origin` first." It is written to
# fail loudly rather than skip, deliberately (see `.github/workflows/ci.yml`'s
# `fetch-depth: 0` comment, which says a gate that skips itself on a shallow
# clone "would never run where it matters").
#
# WHY THIS ONE IS FIXED RATHER THAN REPORTED, WHICH IS THE OPPOSITE OF THE TWO
# BELOW. The section below skips Git LFS and the Playwright browsers on cost --
# metered bandwidth and ~280 MiB -- and reports the gap instead. That argument
# does not reach history. `.github/workflows/ci.yml` measured the same fetch
# this runs:
#
#   git fetch --unshallow   over https   wall 2.180 s,
#                                        pack 7863 -> 8315 objects,
#                                        6.99 -> 7.78 MiB
#
# Two seconds and under a megabyte, because this repository's bulk is the ~55 MB
# of art in Git LFS and that never enters the git pack. Three orders of
# magnitude below either skipped step, against a gate that is otherwise red.
#
# Idempotent like every other step here: `.git/shallow` is the condition, and
# `--unshallow` on a complete clone is an error rather than a no-op, so the
# check is not decoration. A failure is a WARNING and not a hook failure, on the
# same reasoning the postgres step gives: a container that cannot reach the
# network still runs typecheck, build and every test but these three.
HISTORY_IS_COMPLETE=1

ensure_full_history() {
  if [ ! -f "${PROJECT_DIR}/.git/shallow" ]; then
    return 0
  fi

  log "deepening a shallow clone -- pnpm verify reads history and fails without it"
  # `--tags` for parity with CI: `actions/checkout` at `fetch-depth: 0` fetches
  # them, and the count the gate reads is over `--remotes=origin --tags` both.
  if git -C "$PROJECT_DIR" fetch --unshallow --tags origin >/dev/null 2>&1; then
    log "  history complete: $(git -C "$PROJECT_DIR" rev-list --count HEAD) commits on HEAD," \
        "$(git -C "$PROJECT_DIR" rev-list --remotes=origin --tags 2>/dev/null | wc -l) reachable from origin refs and tags"
  else
    HISTORY_IS_COMPLETE=0
    log "WARNING: could not deepen the clone. Three cases in"
    log "  tests/foundation/documentation-commit-citation-contract.test.ts will fail"
    log "  with 'expected <n> to be greater than 500', and pnpm verify with them."
    log "  That is this container, not the tree. Retry: git fetch --unshallow --tags origin"
  fi
}

ensure_full_history

# --- What this hook did not provision ---------------------------------
# CI runs scripts/provision-git-lfs.sh (assets, browser jobs) and
# scripts/provision-playwright-browsers.sh (browser job); this hook runs
# neither, because `git lfs pull` is metered bandwidth and the browsers are a
# ~280 MiB download, and most sessions need neither.
#
# The cost of leaving that unsaid was measured: issue #138 records the
# LFS-pointer browser failure being rediscovered, and explained again in a
# handover, in at least three consecutive sessions. So report the state instead
# of assuming it -- the checks below look at what is actually on disk, because
# some container images ship a pre-baked Chromium even though this hook never
# installs one, and "not provisioned" would then be false.
report_unprovisioned() {
  local lfs_sample="${PROJECT_DIR}/public/assets/actors/actor.guard.base.idle.png"

  if [ -f "$lfs_sample" ] && head -c 64 "$lfs_sample" | grep -q 'git-lfs.github.com'; then
    log "NOT provisioned: Git LFS content. The atlas PNGs under public/assets/ and"
    log "  public/game-content/ are ~131-byte LFS pointer text files, not images."
    log "  This DISABLES 'pnpm verify:assets' -- the atlas validator correctly"
    log "  refuses a pointer -- and it makes the browser suite's \"the art is real"
    log "  image data\" test in tests/browser/app-shell.spec.ts fail on a decode"
    log "  error. Both are the EXPECTED BASELINE in this container, not a"
    log "  regression, and not something to debug or work around."
    log "  To get the real bytes: bash scripts/provision-git-lfs.sh && git lfs pull"
    log "  (metered bandwidth -- that is why this hook leaves it to you)."
  else
    log "Git LFS content looks present; pnpm verify:assets can run."
  fi

  local browsers="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

  if compgen -G "${browsers}/chromium*" >/dev/null 2>&1; then
    log "Chromium found in ${browsers} (shipped by the image, not by this hook);"
    log "  pnpm test:browser can launch."
  else
    log "NOT provisioned: the Playwright browsers. Nothing is in ${browsers}, so"
    log "  'pnpm test:browser' fails at launch with \"Executable doesn't exist\"."
    log "  To install: bash scripts/provision-playwright-browsers.sh (~280 MiB)."
  fi

  # Conditional, because this sentence was FALSE for as long as it stood
  # unconditionally: a shallow clone made `pnpm test` and `pnpm verify` red
  # while this line said they were expected to pass, which is the same defect
  # issue #138 recorded for the LFS gap and the same one this whole section
  # exists to stop. It is kept rather than deleted, and now it has to earn
  # itself.
  if [ "$HISTORY_IS_COMPLETE" = "1" ]; then
    log "Everything else -- pnpm typecheck, pnpm test, pnpm build, pnpm verify,"
    log "  pnpm verify:sql -- is provisioned and expected to pass."
  else
    log "Everything else -- pnpm typecheck, pnpm build, pnpm verify:sql -- is"
    log "  provisioned and expected to pass. pnpm test and pnpm verify are NOT:"
    log "  see the shallow-clone warning above."
  fi
}

report_unprovisioned

# ---------------------------------------------------------------------------
# The agent-worktree snapshotter, restarted because THIS HOOK is what stops it.
#
# `scripts/wip-sweep.sh` pushes every agent worktree to a `wip/` ref every
# three minutes, so a session cut off by a usage limit does not take an agent's
# uncommitted work with it. It is started by hand, and a session `resume`
# replaces the process tree it was started in -- so the very event that means
# "somebody is about to run agents again" is the event that leaves them
# unprotected.
#
# Measured on 2026-08-31: it died twice in one day, both times to a resume and
# neither time to a crash, and on both occasions three or more agents were
# working with no snapshots being taken. Restarting it by hand needs somebody
# to notice, which is exactly what did not happen.
#
# Idempotent, like every other step here: `pgrep -f` is matched against the
# script path rather than a bare name, and `-x`-style exactness is not
# available for a `bash script.sh` invocation, so the pattern is the full
# relative path the launch below uses. Nothing is started if one is already up
# -- two sweepers would push the same refs twice, which is waste rather than
# damage, but it is still waste and it happened once today.
start_wip_sweep() {
  local script="${PROJECT_DIR}/scripts/wip-sweep.sh"

  if [ ! -x "$script" ]; then
    log "No scripts/wip-sweep.sh to start; agent worktrees are NOT being snapshotted."
    return 0
  fi

  # `[w]ip-sweep` keeps this check from matching its own `pgrep`, the way the
  # repository's own docs write the idiom.
  if pgrep -f "[w]ip-sweep.sh" >/dev/null 2>&1; then
    log "wip-sweep is already running; leaving it alone."
    return 0
  fi

  nohup bash "$script" "$PROJECT_DIR" >/dev/null 2>&1 &
  disown 2>/dev/null || true
  log "Started scripts/wip-sweep.sh (pid $!) -- agent worktrees snapshot to wip/ every 3 min."
}

start_wip_sweep

log "done"
