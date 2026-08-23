#!/usr/bin/env bash
# Provisions the Chromium build `pnpm test:browser` needs, and nothing else.
#
# `@playwright/test` is an exact-pinned devDependency but its browser binaries
# are not in the package and are not checked in, so `playwright test` on a
# machine that has never run it fails with "Executable doesn't exist". That is
# how the browser layer -- the one that has already found a real adapter defect
# (#19) and three real HUD layout/accessibility defects -- ended up running only
# when a human remembered to run it.
#
# WHY A SCRIPT RATHER THAN AN ASSUMED RUNNER PREREQUISITE.
# Same reasoning as `scripts/provision-postgres.sh` (PR #54) and
# `scripts/provision-git-lfs.sh`: a gate that depends on undocumented,
# hand-installed runner state is not a gate. A runner rebuilt from scratch has
# to go green without anyone remembering a manual step, so provisioning lives
# in the job that needs it.
#
# IDEMPOTENT AND CHEAP ON A RE-RUN. It checks before it acts, and the check is
# the same launch the suite performs. When the browser is already on disk and
# runs, it does no download and no unpacking at all -- one Node process and out.
# The self-hosted runner keeps `~/.cache/ms-playwright` between jobs, so that is
# the normal case.
#
# NO APT WORK, NO THIRD-PARTY REPOSITORY, NO ROOT. Unlike the PostgreSQL and
# Git LFS scripts this needs none of them: Playwright's Chromium is a
# self-contained tree under the user's cache directory. `playwright install
# --with-deps` is deliberately NOT used -- it is only needed when the shared
# libraries Chromium links against are missing, it requires root, and on Ubuntu
# 26.04 it fails for the same platform reason as a plain install. This script
# proves the point by launching the browser, and if that ever fails it reports
# exactly which library `ldd` says is missing, which is actionable in a way that
# "try it with sudo" is not.
#
# UNSUPPORTED-HOST FALLBACK. Playwright publishes per-distribution builds and
# refuses outright on a release it has no listing for:
#
#   ERROR: Playwright does not support chromium on ubuntu26.04-x64
#
# `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE` makes it download the nearest build it
# does publish, which runs correctly. Verified on a 26.04 host: installed this
# way into an empty browsers directory, the whole suite is green, and no
# override is needed at run time -- this is an install-time concern only.
#
# The override is applied *only after* an unmodified install has been tried and
# has failed with that specific message, so this stops overriding by itself on a
# Playwright release that supports the host natively, and it never masks an
# unrelated install failure.
#
# Usage:
#   scripts/provision-playwright-browsers.sh
#
# Environment:
#   PLAYWRIGHT_BROWSERS_PATH                 where browsers are installed
#                                            (Playwright's own variable; default
#                                            ~/.cache/ms-playwright)
#   LOCKSTATE_PLAYWRIGHT_PLATFORM_OVERRIDE   build to fall back to on a host
#                                            Playwright has no listing for
#                                            (default: ubuntu24.04-<arch>)
set -euo pipefail

log() { echo "[provision-playwright] $*"; }
fail() { echo "[provision-playwright] ERROR: $*" >&2; exit 1; }

cd "$(dirname "$0")/.."

command -v pnpm >/dev/null 2>&1 || fail "pnpm is not on PATH"
[ -d node_modules ] || fail "node_modules is missing; run 'pnpm install' before provisioning browsers"

playwright_version="$(pnpm exec playwright --version 2>/dev/null)" \
  || fail "'playwright --version' failed; is @playwright/test installed?"
log "using ${playwright_version}"

# One probe answers both questions this script has: where the pinned Playwright
# expects its Chromium, and whether that Chromium actually runs. Asking
# Playwright rather than guessing a path means this can never drift from the
# revision the pinned version launches, and launching rather than stat-ing the
# file is what makes a half-unpacked or dynamically-broken tree fail here
# instead of in the first test.
#
# `browserName: 'chromium'` in headless mode may launch the headless shell
# rather than the full binary, so the probe goes through Playwright's own
# launcher -- the same path `pnpm test:browser` takes.
probe() {
  pnpm exec node --input-type=module <<'NODE'
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const executable = chromium.executablePath();
if (!existsSync(executable)) {
  console.error(`no browser at ${executable}`);
  process.exit(2);
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<main>ok</main>');
  const text = await page.evaluate(() => document.querySelector('main')?.textContent ?? '');
  if (text !== 'ok') {
    console.error('the browser launched but a page did not render');
    process.exit(1);
  }
  console.log(`${executable}\t${browser.version()}`);
} finally {
  await browser.close();
}
NODE
}

report_ready() {
  local executable version
  executable="${1%%$'\t'*}"
  version="${1##*$'\t'}"
  log "ready: Chromium ${version} at ${executable}"
}

if probed="$(probe 2>/dev/null)"; then
  report_ready "$probed"
  exit 0
fi

# --- install ----------------------------------------------------------
# Chromium only. `tests/browser/playwright.config.ts` pins
# `browserName: 'chromium'` and nothing in the suite launches a second engine,
# so there is no reason to download Firefox and WebKit as well.
log "installing Chromium for ${playwright_version}"
install_log="$(mktemp)"
trap 'rm -f "$install_log"' EXIT

if pnpm exec playwright install chromium >"$install_log" 2>&1; then
  log "installed the build for this host's own platform (no override needed)"
elif grep -q 'does not support chromium on' "$install_log"; then
  case "$(uname -m)" in
    x86_64) arch='x64' ;;
    aarch64 | arm64) arch='arm64' ;;
    *) fail "unknown architecture $(uname -m); set LOCKSTATE_PLAYWRIGHT_PLATFORM_OVERRIDE by hand" ;;
  esac
  override="${LOCKSTATE_PLAYWRIGHT_PLATFORM_OVERRIDE:-ubuntu24.04-${arch}}"
  log "$(grep -m1 'does not support chromium on' "$install_log" | sed 's/^ERROR: //')"
  log "retrying with the ${override} build"
  PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="$override" pnpm exec playwright install chromium \
    || fail "installing the ${override} Chromium build failed"
else
  cat "$install_log" >&2
  fail "'playwright install chromium' failed"
fi

# --- self-check -------------------------------------------------------
# Prove what `pnpm test:browser` actually needs, rather than assuming the
# install added up to it.
if probed="$(probe)"; then
  report_ready "$probed"
  exit 0
fi

# It did not launch. Say why in terms someone can act on, rather than leaving
# the reader with a stack trace from the first failing test.
executable="$(pnpm exec node --input-type=module <<'NODE'
import { chromium } from '@playwright/test';
console.log(chromium.executablePath());
NODE
)" || fail "Chromium did not launch and its path could not be resolved"

missing_libraries="$(ldd "$executable" 2>/dev/null | awk '/not found/ { print $1 }' | sort -u || true)"
[ -z "$missing_libraries" ] \
  || fail "Chromium at ${executable} is missing shared libraries: $(echo "$missing_libraries" | tr '\n' ' ')"

fail "Chromium is installed at ${executable} with every shared library present, but Playwright could not launch it"
