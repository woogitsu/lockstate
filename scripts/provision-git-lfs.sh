#!/usr/bin/env bash
# Provisions the Git LFS client the `assets` CI job needs, and nothing else.
#
# `tooling/validate-runtime-atlas.mjs` reads the runtime atlas PNGs, and
# `.gitattributes` routes every one of them through Git LFS. A checkout without
# LFS content leaves 130-byte pointer files in their place, so the validator has
# nothing real to check.
#
# WHY A SCRIPT RATHER THAN AN ASSUMED RUNNER PREREQUISITE.
# `actions/checkout` is the first step of its own job, so nothing inside the
# `assets` job can install `git-lfs` before that job's `lfs: true` checkout
# runs. On a runner without the binary that checkout fails in seconds with
# "Unable to locate executable file: git-lfs" -- which is exactly how the gap
# was found. `.github/workflows/ci.yml` therefore runs this in the `verify` job,
# which `assets` depends on, so the binary exists before the LFS checkout
# happens. Same reasoning as `scripts/provision-postgres.sh` (PR #54): a gate
# that depends on undocumented, hand-installed runner state is not a gate.
#
# IDEMPOTENT. It checks before it acts, so a re-run does no apt work and exits
# in well under a second.
#
# NO THIRD-PARTY APT REPOSITORY. `git-lfs` is in the distribution archive
# (3.7.1-1 on Ubuntu 26.04); nothing here adds an external source or pins a
# version.
#
# DOES NOT TOUCH GIT FILTER CONFIGURATION. `actions/checkout` with `lfs: true`
# fetches and checks out LFS content itself. Writing `filter.lfs.*` here would
# only add a way for one job to change how a later job on the same self-hosted
# runner materialises files.
#
# Usage:
#   scripts/provision-git-lfs.sh
set -euo pipefail

log() { echo "[provision-git-lfs] $*"; }
fail() { echo "[provision-git-lfs] ERROR: $*" >&2; exit 1; }

if ! command -v git-lfs >/dev/null 2>&1; then
  # Package installation needs root. The CI runner has passwordless sudo;
  # containers already run as root. Anything else is a hard failure with an
  # actionable message rather than a silent skip that yields pointer files.
  if [ "$(id -u)" -eq 0 ]; then
    as_root() { "$@"; }
  elif sudo -n true >/dev/null 2>&1; then
    as_root() { sudo -n "$@"; }
  else
    fail "git-lfs is missing and this needs root or passwordless sudo to install it"
  fi

  command -v apt-get >/dev/null 2>&1 \
    || fail "git-lfs is missing and this is not an apt system; install Git LFS by hand"

  log "installing git-lfs from the distribution archive"
  as_root env DEBIAN_FRONTEND=noninteractive apt-get update -qq -o DPkg::Lock::Timeout=180
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq -o DPkg::Lock::Timeout=180 git-lfs
fi

# --- self-check -------------------------------------------------------
# Prove what the caller actually needs, rather than assuming the step above
# added up to it: the binary is on PATH and can run.
command -v git-lfs >/dev/null 2>&1 || fail "git-lfs is still not on PATH"
git lfs env >/dev/null 2>&1 || fail "git-lfs is installed but 'git lfs env' failed"
log "ready: $(git-lfs version)"
