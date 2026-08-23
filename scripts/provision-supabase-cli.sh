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
set -euo pipefail

REQUIRED_VERSION="${SUPABASE_CLI_VERSION:-2.115.0}"
INSTALL_DIR="${SUPABASE_CLI_INSTALL_DIR:-/usr/local/bin}"

log() { echo "[provision-supabase-cli] $*"; }

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

if [ -w "$INSTALL_DIR" ]; then
  install -m 0755 "${workdir}/supabase" "${INSTALL_DIR}/supabase"
else
  sudo install -m 0755 "${workdir}/supabase" "${INSTALL_DIR}/supabase"
fi

log "ready: $(supabase --version 2>/dev/null || echo 'version unavailable')"
