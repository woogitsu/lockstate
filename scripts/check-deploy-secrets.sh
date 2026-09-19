#!/usr/bin/env bash
# Refuses a deployment whose configuration is missing, or whose configuration
# or build output carries a credential that must never be public.
#
# WHY THIS EXISTS. A Vite build does not fail when `VITE_SUPABASE_URL` is
# empty -- it inlines an empty string and ships a bundle that cannot reach the
# backend. The failure then surfaces as a runtime error in a browser, far from
# the cause. Checking here turns a silent bad deploy into a loud refusal.
#
# THE SECRET CHECK IS THE IMPORTANT ONE. Everything prefixed `VITE_` is inlined
# into the browser bundle by Vite and is therefore public. A Supabase *secret*
# (service-role) key behind a `VITE_` name would be published to every visitor.
# `AGENTS.md` forbids service-role keys in client code, and ADR 0008 makes the
# browser an untrusted zone (Z0), so this refuses rather than trusting the name.
#
# TWO MODES, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS (issue #344).
#
#   env     Pre-build. Sweeps *every* `VITE_`-prefixed variable in the
#           environment, not a list of names this file happens to know. Runs
#           before a build is spent, and catches a secret that is configured
#           but not yet referenced -- which the bundle cannot show, because
#           Vite only inlines a `VITE_` variable that some module reads.
#
#   bundle  Post-build, pre-upload. Scans the built artefact for
#           secret-shaped material. This is the question the rule above
#           actually poses: what reaches a visitor. It is the only mode that
#           covers the routes that do not go through a `VITE_` name at all --
#           a credential committed into a source file, a value spliced in
#           through Vite's `define` (`vite.config.ts` passes
#           `buildIdentityDefines()`), or a file dropped into `public/`.
#
#   all     Both, in that order. Default for a local invocation.
#
# Neither mode subsumes the other, so the pipeline runs both. The environment
# scan is a pre-flight; the bundle scan is the one whose green line says
# something true about what was shipped.
#
# NOTHING HERE EVER PRINTS ANY PART OF A VALUE. Every refusal names the
# variable or the file, and describes the *shape* that was recognised.
set -euo pipefail

usage() {
  echo "Usage: bash scripts/check-deploy-secrets.sh [env|bundle|all]" >&2
  echo "  env     scan the environment before the build (default in CI)" >&2
  echo "  bundle  scan the built artefact under \${LOCKSTATE_BUNDLE_DIR:-dist}" >&2
  echo "  all     both" >&2
}

MODE="${1:-all}"
case "$MODE" in
  env | bundle | all) ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    echo "::error::Unknown mode '${MODE}'."
    usage
    exit 2
    ;;
esac

FAILED=0

fail() {
  echo "::error::$1"
  FAILED=1
}

# Presence is per name: only a named variable can be reported missing. This
# list stays specific for that reason, and stays strict -- see
# docs/DEPLOYMENT.md, "Why `VITE_` is the dangerous prefix", for why the two
# Supabase names are required ahead of the client that will read them.
REQUIRED_NAMES=(
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
)

# A `VITE_` name containing one of these words is refused on the name alone,
# whatever its value. None of these words has a legitimate public meaning, so
# the name itself is the mistake: it declares an intent to inline a secret.
#
# `TOKEN` and `KEY` are deliberately NOT here. Both have legitimate public
# forms -- `VITE_SUPABASE_PUBLISHABLE_KEY` is the required one, and site
# tokens for bot-protection widgets are designed to be public. Refusing them
# by name would make this check a nuisance that someone deletes rather than
# fixes. They are covered by the value-shape tests below instead.
name_declares_a_secret() {
  local upper="${1^^}"
  case "$upper" in
    *SECRET* | *SERVICE_ROLE* | *PRIVATE_KEY* | *PASSWORD* | *CREDENTIAL*) return 0 ;;
  esac
  return 1
}

# A JWT carries its role in the payload. Decode only enough to read it, and
# print nothing from it.
jwt_claims_service_role() {
  local token="$1" payload
  [[ "$token" == eyJ*.*.* ]] || return 1
  payload="$(printf '%s' "$token" | cut -d. -f2 | tr '_-' '/+')"
  case $((${#payload} % 4)) in
    2) payload="${payload}==" ;;
    3) payload="${payload}=" ;;
    1) return 1 ;;
  esac
  printf '%s' "$payload" | base64 -d 2>/dev/null | grep -q 'service_role'
}

# Recognises a value as a credential that must not be public. Sets
# SHAPE_REASON to a description of the shape -- never to the value.
SHAPE_REASON=''
looks_like_a_secret() {
  local value="$1"
  SHAPE_REASON=''
  case "$value" in
    sb_secret_*)
      SHAPE_REASON='a Supabase secret-key prefix (sb_secret_)'
      return 0
      ;;
    sbp_*)
      SHAPE_REASON='a Supabase access-token prefix (sbp_)'
      return 0
      ;;
    *service_role*)
      SHAPE_REASON='the literal service_role'
      return 0
      ;;
    *'PRIVATE KEY-----'*)
      SHAPE_REASON='a PEM private key block'
      return 0
      ;;
  esac
  if jwt_claims_service_role "$value"; then
    SHAPE_REASON='a service_role JWT'
    return 0
  fi
  return 1
}

scan_environment() {
  local name value

  for name in "${REQUIRED_NAMES[@]}"; do
    if [ -z "${!name:-}" ]; then
      fail "Required secret ${name} is not set for this environment. See docs/DEPLOYMENT.md."
    fi
  done

  local url="${VITE_SUPABASE_URL:-}"
  if [ -n "$url" ] && [[ ! "$url" =~ ^https:// ]]; then
    fail "VITE_SUPABASE_URL must be an https:// URL."
  fi

  # The class, not a list of names. `compgen -v` enumerates what is actually
  # set, so a `VITE_` variable added tomorrow is covered without editing this
  # file -- which was the whole defect in issue #344.
  local swept=0
  for name in $(compgen -v || true); do
    case "$name" in
      VITE_*) ;;
      *) continue ;;
    esac
    swept=$((swept + 1))
    value="${!name:-}"

    if name_declares_a_secret "$name"; then
      fail "${name} is a VITE_-prefixed name that declares a secret. Everything named VITE_* is inlined into the public browser bundle, so a secret cannot live behind one. Give it a non-VITE_ name and consume it server-side (ADR 0008, Z2)."
    fi

    if [ -n "$value" ] && looks_like_a_secret "$value"; then
      fail "${name} carries ${SHAPE_REASON}. Anything named VITE_* is inlined into the public browser bundle and served to every visitor. Use a publishable/anon credential only."
    fi
  done

  echo "Swept ${swept} VITE_-prefixed variable(s) in the environment."
}

scan_bundle() {
  local dir="${LOCKSTATE_BUNDLE_DIR:-dist}"

  if [ ! -d "$dir" ]; then
    fail "Bundle scan found no build output at '${dir}'. Build before scanning, or set LOCKSTATE_BUNDLE_DIR. A bundle check that passes with nothing to look at is the defect it is meant to close."
    return
  fi

  local file_count
  file_count="$(find "$dir" -type f | wc -l | tr -d '[:space:]')"
  if [ "$file_count" -eq 0 ]; then
    fail "Bundle scan found '${dir}' empty. Build before scanning."
    return
  fi

  # Prefix rules require a credential-length tail so that a short coincidence
  # in minified output is not a refusal. `service_role` and the PEM header are
  # matched literally -- neither has an innocent reason to be in a bundle.
  local rule pattern description files file token
  for rule in \
    'sb_secret_[A-Za-z0-9_-]{16,}|a Supabase secret key (sb_secret_ prefix)' \
    'sbp_[A-Za-z0-9_-]{16,}|a Supabase access token (sbp_ prefix)' \
    'service_role|the literal service_role' \
    '-----BEGIN [A-Z ]*PRIVATE KEY-----|a PEM private key block'; do
    pattern="${rule%%|*}"
    description="${rule#*|}"
    files="$(grep -rlaE -- "$pattern" "$dir" 2>/dev/null || true)"
    if [ -n "$files" ]; then
      while IFS= read -r file; do
        [ -n "$file" ] || continue
        fail "${file} contains ${description}. This artefact is served to every visitor (ADR 0008, Z0)."
      done <<< "$files"
    fi
  done

  while IFS= read -r file; do
    while IFS= read -r token; do
      [ -n "$token" ] || continue
      if jwt_claims_service_role "$token"; then
        fail "${file} contains a service_role JWT. It must never reach the browser bundle."
      fi
    done < <(grep -oaE 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' "$file" 2>/dev/null || true)
  done < <(find "$dir" -type f -print)

  # The routes that never touch a `VITE_` name: a non-public credential that
  # this pipeline holds, appearing in the artefact by any means at all. Checked
  # by value and reported by name, so nothing is printed.
  local name value
  for name in $(compgen -v || true); do
    case "$name" in
      VITE_*) continue ;;
    esac
    if ! name_declares_a_secret "$name" && [ "$name" != 'CLOUDFLARE_API_TOKEN' ]; then
      continue
    fi
    value="${!name:-}"
    # Too short to be a credential, a path, or a value with whitespace: not a
    # credential worth a false positive over.
    if [ "${#value}" -lt 20 ]; then
      continue
    fi
    case "$value" in
      *[[:space:]]*) continue ;;
    esac
    if [ -e "$value" ]; then
      continue
    fi
    files="$(grep -rlaF -- "$value" "$dir" 2>/dev/null || true)"
    if [ -n "$files" ]; then
      while IFS= read -r file; do
        [ -n "$file" ] || continue
        fail "The value of ${name}, which is not a public variable, appears in ${file}. Nothing outside the VITE_ prefix may reach the artefact."
      done <<< "$files"
    fi
  done

  echo "Scanned ${file_count} file(s) under '${dir}' for secret-shaped material."
}

case "$MODE" in
  env) scan_environment ;;
  bundle) scan_bundle ;;
  all)
    scan_environment
    scan_bundle
    ;;
esac

if [ "$FAILED" -ne 0 ]; then
  echo "Deployment configuration rejected; nothing was deployed."
  exit 1
fi

case "$MODE" in
  env) echo "Deployment configuration present and shaped correctly. This says nothing about the built artefact; run 'bundle' after the build for that." ;;
  bundle) echo "Built artefact carries no secret-shaped material." ;;
  all) echo "Deployment configuration and built artefact both carry no secret-shaped material." ;;
esac
