#!/usr/bin/env bash
# Provisions the Git LFS client the `assets` CI job needs, and nothing else.
#
# `tooling/validate-runtime-atlas.mjs` reads the runtime atlas PNGs, and
# `.gitattributes` routes every one of them through Git LFS. A checkout without
# LFS content leaves 130-byte pointer files in their place, so the validator has
# nothing real to check.
#
# WHY A SCRIPT RATHER THAN AN ASSUMED RUNNER PREREQUISITE.
# The `assets` CI job checks out without `lfs: true` and then runs an explicit
# `git lfs pull`, so this can provision the binary inside that job, before the
# step that needs it. A gate that depends on undocumented, hand-installed runner
# state is not a gate -- the same reasoning as `scripts/provision-postgres.sh`
# (PR #54), and the reason `git-lfs` missing from the runner was able to break
# CI silently in the first place.
#
# Note that provisioning could *not* live in that job if it used
# `actions/checkout` with `lfs: true`: checkout is the first step of its own job,
# so nothing can install the binary that step requires. See the comments in
# `.github/workflows/ci.yml` for why an explicit pull is the better shape
# regardless.
#
# IDEMPOTENT, AND UNLIKE `provision-postgres.sh` IT ALWAYS WAS. It checks before
# it acts, so a re-run does no apt work and exits in well under a second -- and
# the check is `command -v git-lfs` with the whole elevation block INSIDE it, so
# a host that already has the binary never asks for root and never fails for
# want of it. That is the shape `provision-postgres.sh` was given on 2026-09-07
# after its own top-level root gate turned `main` red on a runner that needed
# nothing installed. Recorded here because this file is the example that was
# already right, and the next person to move an elevation check should copy it
# rather than rediscover it.
#
# NO THIRD-PARTY APT REPOSITORY. `git-lfs` is in the distribution archive
# (3.7.1-1 on Ubuntu 26.04); nothing here adds an external source or pins a
# version.
#
# DOES NOT TOUCH GIT FILTER CONFIGURATION. `git lfs pull` materialises content
# explicitly and needs no clean/smudge filter to do it. Writing `filter.lfs.*`
# here would only add a way for one job to change how a later job on the same
# self-hosted runner materialises files.
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
    fail "git-lfs is missing and this shell has neither root nor passwordless sudo to install it.
[provision-git-lfs] This repository cannot fix that -- it is the machine's state. Either grant the runner user passwordless sudo, or pre-provision the host so this script has nothing to do, as root: apt-get install -y git-lfs
[provision-git-lfs] It is in the distribution archive; no third-party apt source is needed."
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
