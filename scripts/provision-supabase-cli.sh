#!/usr/bin/env bash
# Provisions the Supabase CLI the database-migration job needs, and nothing else.
#
# WHY A SCRIPT RATHER THAN AN ASSUMED RUNNER PREREQUISITE.
# The same argument as scripts/provision-postgres.sh and
# scripts/provision-git-lfs.sh: a gate that only passes because someone
# installed a binary by hand is not a gate, it is a coincidence. A runner
# rebuilt from scratch must reach the same result without anyone remembering a
# manual step.
#
# Installs the standalone release rather than adding a devDependency:
# `AGENTS.md` forbids adding a dependency for something outside the product's
# own build graph, and the CLI is CI tooling, not part of what ships.
#
# Idempotent: an already-present CLI short-circuits.
#
# ELEVATION IS PROBED, NOT ASSUMED (#1089). This script used to reach for a bare
# `sudo install` whenever `$INSTALL_DIR` was not writable. The runner pool this
# repository moved to in September 2026 has **no passwordless sudo** --
# `scripts/provision-postgres.sh`'s header records the same discovery and the
# job that found it -- so on those hosts that line does not install anything: it
# either blocks on a password prompt where there is a TTY, or fails with a bare
# `sudo: a password is required` where there is not.
#
# Measured before the fix, running as a non-root user with a `sudo` that refuses
# `-n`: the script printed exactly `sudo: a password is required` and exited 1,
# naming neither the step it could not take nor anything the operator could do
# about it. That is the whole defect. The download, the architecture check and
# the extraction had all already succeeded; only the last move needed a
# privilege the host does not grant.
#
# So the probe below is `scripts/provision-postgres.sh`'s, narrowed to the one
# privileged step this script has, and the failure names all three ways out.
set -euo pipefail

REQUIRED_VERSION="${SUPABASE_CLI_VERSION:-2.115.0}"
INSTALL_DIR="${SUPABASE_CLI_INSTALL_DIR:-/usr/local/bin}"

log() { echo "[provision-supabase-cli] $*"; }
fail() { echo "[provision-supabase-cli] ERROR: $*" >&2; exit 1; }

if command -v supabase >/dev/null 2>&1; then
  current="$(supabase --version 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$current" = "$REQUIRED_VERSION" ]; then
    log "already present: ${current}"
    exit 0
  fi
  log "found ${current:-unknown}, wanted ${REQUIRED_VERSION} — replacing"
fi

case "$(uname -m)" in
  x86_64) arch="amd64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *) log "unsupported architecture $(uname -m)"; exit 1 ;;
esac

tarball="supabase_linux_${arch}.tar.gz"
url="https://github.com/supabase/cli/releases/download/v${REQUIRED_VERSION}/${tarball}"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

log "downloading ${REQUIRED_VERSION} (${arch})"
curl --fail --silent --show-error --location --retry 3 --output "${workdir}/${tarball}" "$url"
tar -xzf "${workdir}/${tarball}" -C "$workdir" supabase

# `-w` is asked first and answers for root too, so a container running as root
# never probes for a `sudo` it does not need and may not have installed.
if [ -w "$INSTALL_DIR" ]; then
  install -m 0755 "${workdir}/supabase" "${INSTALL_DIR}/supabase"
elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  # `-n` on the real call as well as on the probe: without it a host whose
  # timestamp expires between the two lines still reaches a password prompt,
  # which is the hang this replaces rather than a narrower version of it.
  sudo -n install -m 0755 "${workdir}/supabase" "${INSTALL_DIR}/supabase"
else
  fail "cannot install the Supabase CLI into ${INSTALL_DIR}: it is not writable by $(id -un) and this shell has neither root nor passwordless sudo.
[provision-supabase-cli] Everything else this script does is already done -- v${REQUIRED_VERSION} downloaded and extracted -- and the only step left needs a privilege this host does not grant.
[provision-supabase-cli] Three ways out, any one of which is enough: set SUPABASE_CLI_INSTALL_DIR to a directory the job can write (\$HOME/.local/bin on PATH is the usual one); grant the runner user passwordless sudo; or pre-install supabase v${REQUIRED_VERSION} on the host, which makes this script short-circuit at its first check."
fi

log "ready: $(supabase --version 2>/dev/null || echo 'version unavailable')"
