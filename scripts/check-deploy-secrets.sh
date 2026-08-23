#!/usr/bin/env bash
# Fails a deployment before it starts if its configuration is missing or is
# obviously the wrong kind of value.
#
# WHY THIS EXISTS. A Vite build does not fail when `VITE_SUPABASE_URL` is
# empty -- it inlines an empty string and ships a bundle that cannot reach the
# backend. The failure then surfaces as a runtime error in a browser, far from
# the cause. Checking here turns a silent bad deploy into a loud refusal.
#
# THE SECOND CHECK IS THE IMPORTANT ONE. Everything prefixed `VITE_` is inlined
# into the browser bundle by Vite and is therefore public. A Supabase *secret*
# (service-role) key behind a `VITE_` name would be published to every visitor.
# `AGENTS.md` forbids service-role keys in client code, and ADR 0008 makes the
# browser an untrusted zone, so this refuses rather than trusting the name.
set -euo pipefail

fail() {
  echo "::error::$1"
  FAILED=1
}

FAILED=0

for name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY; do
  if [ -z "${!name:-}" ]; then
    fail "Required secret ${name} is not set for this environment. See docs/DEPLOYMENT.md."
  fi
done

# Never print a secret. Only ever report shape.
url="${VITE_SUPABASE_URL:-}"
if [ -n "$url" ] && [[ ! "$url" =~ ^https:// ]]; then
  fail "VITE_SUPABASE_URL must be an https:// URL."
fi

key="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"
if [ -n "$key" ]; then
  case "$key" in
    sb_secret_*|*service_role*|sbp_*)
      fail "VITE_SUPABASE_PUBLISHABLE_KEY looks like a SECRET key. Anything named VITE_* is inlined into the public browser bundle. Use the publishable/anon key only."
      ;;
  esac
fi

# A JWT-form key carries its role in the payload; decode only enough to check
# it, and print nothing from it.
if [[ "$key" == eyJ* ]]; then
  payload="$(printf '%s' "$key" | cut -d. -f2)"
  # base64url -> base64, padded.
  payload="$(printf '%s' "$payload" | tr '_-' '/+')"
  case $(( ${#payload} % 4 )) in
    2) payload="${payload}==" ;;
    3) payload="${payload}=" ;;
  esac
  if printf '%s' "$payload" | base64 -d 2>/dev/null | grep -q 'service_role'; then
    fail "VITE_SUPABASE_PUBLISHABLE_KEY is a service_role JWT. It must never be inlined into the browser bundle."
  fi
fi

if [ "$FAILED" -ne 0 ]; then
  echo "Deployment configuration rejected; nothing was deployed."
  exit 1
fi

echo "Deployment configuration present and shaped correctly."
