#!/usr/bin/env bash
# Provisions the PostgreSQL server `pnpm verify:sql` needs, and nothing else.
#
# `scripts/verify-supabase-sql.mjs` shells out to `psql`, creates and drops a
# scratch database, and applies `scripts/sql/supabase-compat-harness.sql`,
# which creates the `pgtap` and `pgcrypto` extensions plus the Supabase client
# roles. That requires, on the machine running the command:
#
#   * a PostgreSQL server and the `psql` client;
#   * the pgTAP extension available to that server;
#   * a running cluster;
#   * a login role for the invoking user with SUPERUSER (extension creation
#     and role creation are superuser operations; CREATEDB alone is not
#     enough for the harness).
#
# Two callers share it so the setup cannot drift apart:
#
#   * `.github/workflows/ci.yml`, so the pgTAP suite is part of the gate
#     rather than a step someone remembers to run by hand;
#   * `.claude/hooks/session-start.sh`, for fresh remote containers.
#
# VERSION-AGNOSTIC BY DESIGN. It uses whichever PostgreSQL major version is
# already installed, or failing that whichever one the distribution offers,
# and installs the matching `postgresql-<major>-pgtap`. Nothing here pins 16:
# the schema is executed and green on 16.13 + pgTAP 1.3.2 and on
# 18.6 + pgTAP 1.3.4, and Ubuntu 26.04 does not package 16 at all. No
# third-party apt repository (PGDG included) is added.
#
# IDEMPOTENT. Every step checks before it acts, so a re-run does no apt work,
# leaves a running cluster alone and exits in well under a second.
#
# AND THAT SENTENCE WAS FALSE WITHOUT ROOT UNTIL 2026-09-07, WHICH IS THE WHOLE
# OF THE FIX BELOW. The elevation block used to be the FIRST thing that ran and
# a hard `fail`, so a machine with PostgreSQL installed, pgTAP present, the
# cluster online and the role already usable -- a machine with nothing left to
# do -- still exited with "needs root or passwordless sudo to install and start
# PostgreSQL". It never reached a single one of the checks the paragraph above
# promises. Measured on the woogitsu-linux pool, where the runner user has no
# passwordless sudo: that is job 101846181533's failure at step 12, and it is
# what turned `main` red on 2026-09-07 (recorded in #1071's own commit).
#
# Elevation is therefore LAZY now. Detecting what is installed, reading the
# cluster's status, and the self-check that proves what `verify:sql` actually
# needs are all unprivileged and always were; only three things are not --
# installing packages, creating or starting the cluster, and creating a role.
# The script fails at the first of those it genuinely has to do, naming it,
# rather than at the door. A fully provisioned machine now succeeds with no
# elevation at all, which is exactly the state a repaired runner should be in.
#
# Usage:
#   scripts/provision-postgres.sh
#
# Environment:
#   LOCKSTATE_DB_ROLE  login role to ensure (default: the invoking user)
#   DATABASE_URL       when set, verify:sql talks to that server instead of a
#                      local peer-auth connection, so the role step is skipped
set -euo pipefail

log() { echo "[provision-postgres] $*"; }
fail() { echo "[provision-postgres] ERROR: $*" >&2; exit 1; }

# Package installation, cluster control and `psql` as the postgres superuser
# need root. The CI runner used to have passwordless sudo and the new pool does
# not; remote containers already run as root. When there is neither, this is no
# longer a failure at the door -- see the header. `as_root` and `as_postgres`
# become the failure itself, so the script gets exactly as far as it can and
# then says which privileged step it could not take.
needs_elevation() {
  fail "this shell has neither root nor passwordless sudo, so it cannot ${1}.
[provision-postgres] Everything this script can do unprivileged is already done; what is left is a step that installs a package, controls the cluster or creates a role.
[provision-postgres] This repository cannot fix that -- it is the machine's state. Either grant the runner user passwordless sudo, or pre-provision the host so this script has nothing left to do: install postgresql-${MAJOR:-<major>}, postgresql-client-${MAJOR:-<major>} and postgresql-${MAJOR:-<major>}-pgtap, start the ${MAJOR:-<major>}/main cluster, and create a LOGIN SUPERUSER role named after the user the job runs as ($(id -un))."
}

# `ELEVATION` exists because `needs_elevation` ends in `exit`, and an `exit`
# inside `$( ... || true )` kills the SUBSHELL and hands its status to the
# assignment rather than being caught by the `|| true` -- so the one probe below
# that runs in a substitution has to ask this variable instead of finding out by
# calling. Measured while writing this: without the guard the script died with
# status 1, at the right place, printing NOTHING, because that substitution also
# carries `2>/dev/null`. A silent exit is worse than the failure it replaced.
if [ "$(id -u)" -eq 0 ]; then
  ELEVATION=root
  as_root() { "$@"; }
  as_postgres() { su -s /bin/sh postgres -c "$1"; }
elif sudo -n true >/dev/null 2>&1; then
  ELEVATION=sudo
  as_root() { sudo -n "$@"; }
  as_postgres() { sudo -n -u postgres sh -c "$1"; }
else
  ELEVATION=none
  as_root() { needs_elevation "run: $*"; }
  as_postgres() { needs_elevation "run this as the postgres superuser: $1"; }
fi

# Refreshing the package lists is the one expensive step, so it happens at
# most once per run and only when something actually needs it. A container
# image ships with empty lists, which is why detection may need it too.
APT_REFRESHED=false
apt_refresh() {
  if [ "$APT_REFRESHED" = true ]; then return 0; fi
  command -v apt-get >/dev/null 2>&1 || return 1
  log "refreshing apt package lists"
  as_root env DEBIAN_FRONTEND=noninteractive apt-get update -qq -o DPkg::Lock::Timeout=180
  APT_REFRESHED=true
}

server_binary() { echo "/usr/lib/postgresql/$1/bin/postgres"; }
pgtap_control() { echo "/usr/share/postgresql/$1/extension/pgtap.control"; }

# Majors with a server installed, newest first.
installed_majors() {
  local path major
  for path in /usr/lib/postgresql/*/bin/postgres; do
    [ -x "$path" ] || continue
    major="${path#/usr/lib/postgresql/}"
    echo "${major%%/*}"
  done | sort -rn
}

# The major the distribution's `postgresql` metapackage points at. Its
# candidate version starts with the major ("18+290ubuntu1"), which is how
# Debian and Ubuntu express "the PostgreSQL we ship".
candidate_major() {
  command -v apt-cache >/dev/null 2>&1 || return 1
  local candidate
  candidate="$(apt-cache policy postgresql 2>/dev/null | awk '/Candidate:/ { print $2 }')"
  case "$candidate" in
    [0-9]*) echo "${candidate%%[!0-9]*}"; return 0 ;;
  esac
  # Fall back to the highest `postgresql-<major>` the archive actually lists,
  # for a distribution whose metapackage is missing or renamed.
  apt-cache --names-only search '^postgresql-[0-9]+$' 2>/dev/null \
    | awk '{ print $1 }' | sed 's/^postgresql-//' | sort -rn | head -1 \
    | grep -E '^[0-9]+$' || return 1
}

# Prefer an installed major that already has pgTAP, then the newest installed
# major, then the distribution's. Reusing what is installed avoids creating a
# second cluster on a machine that already works.
select_major() {
  local major
  for major in $(installed_majors); do
    if [ -f "$(pgtap_control "$major")" ]; then echo "$major"; return 0; fi
  done
  major="$(installed_majors | head -1)"
  if [ -n "$major" ]; then echo "$major"; return 0; fi
  candidate_major
}

MAJOR="$(select_major || true)"
if [ -z "$MAJOR" ]; then
  apt_refresh || true
  MAJOR="$(select_major || true)"
fi
[ -n "$MAJOR" ] || fail "could not determine a PostgreSQL major version to install (no server installed and no apt candidate)"
log "target PostgreSQL major version: ${MAJOR}"

# --- packages ---------------------------------------------------------
missing=()
[ -x "$(server_binary "$MAJOR")" ] || missing+=("postgresql-${MAJOR}")
command -v psql >/dev/null 2>&1 || missing+=("postgresql-client-${MAJOR}")
[ -f "$(pgtap_control "$MAJOR")" ] || missing+=("postgresql-${MAJOR}-pgtap")

if [ ${#missing[@]} -eq 0 ]; then
  log "packages already present (postgresql-${MAJOR} + pgTAP)"
else
  command -v apt-get >/dev/null 2>&1 \
    || fail "missing ${missing[*]} and this is not an apt system; install PostgreSQL ${MAJOR} and pgTAP by hand"
  log "installing ${missing[*]}"
  apt_refresh
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq -o DPkg::Lock::Timeout=180 "${missing[@]}"
  [ -f "$(pgtap_control "$MAJOR")" ] \
    || fail "postgresql-${MAJOR}-pgtap did not provide $(pgtap_control "$MAJOR")"
fi

# --- cluster ----------------------------------------------------------
command -v pg_lsclusters >/dev/null 2>&1 \
  || fail "pg_lsclusters not found; this script expects Debian/Ubuntu cluster tooling"

cluster_status() {
  pg_lsclusters -h 2>/dev/null | awk -v major="$MAJOR" '$1 == major && $2 == "main" { print $4 }'
}

status="$(cluster_status)"
if [ -z "$status" ]; then
  log "creating cluster ${MAJOR}/main"
  as_root pg_createcluster "$MAJOR" main --start >/dev/null
elif [ "$status" != "online" ]; then
  log "starting cluster ${MAJOR}/main (was ${status})"
  as_root pg_ctlcluster "$MAJOR" main start
else
  log "cluster ${MAJOR}/main already online"
fi

port="$(pg_lsclusters -h 2>/dev/null | awk -v major="$MAJOR" '$1 == major && $2 == "main" { print $3 }')"
ready=false
for _ in $(seq 1 30); do
  if pg_isready -q -p "${port:-5432}" 2>/dev/null; then ready=true; break; fi
  sleep 1
done
[ "$ready" = true ] || fail "cluster ${MAJOR}/main did not become ready"

# --- login role -------------------------------------------------------
# verify-supabase-sql.mjs connects over peer auth as the invoking user unless
# DATABASE_URL is set, so that user needs a role. SUPERUSER, not just
# CREATEDB: the compatibility harness creates extensions and roles.
ROLE="${LOCKSTATE_DB_ROLE:-$(id -un)}"
if [ -n "${DATABASE_URL:-}" ]; then
  log "DATABASE_URL is set; leaving roles alone (verify:sql will use that connection)"
else
  # Asked over this user's OWN connection first, which needs no elevation: if
  # they can log in and are a superuser, the role step has nothing to do and a
  # host with no passwordless sudo gets past here. Only when that comes back
  # short is `as_postgres` reached, and on such a host that is the point the
  # script correctly refuses.
  #
  # Guarded on the role being this user's, because `LOCKSTATE_DB_ROLE` can name
  # somebody else's and `current_user` would then answer about the wrong one.
  own_is_usable=false
  if [ "$ROLE" = "$(id -un)" ] \
    && [ "$(psql -X -tAc 'select rolsuper from pg_roles where rolname = current_user' -d postgres 2>/dev/null || true)" = "t" ]; then
    own_is_usable=true
  fi

  if [ "$own_is_usable" = true ]; then
    log "role ${ROLE} already usable"
    role_attributes="t|t"
  elif [ "$ELEVATION" = none ]; then
    # Asked here rather than by calling `as_postgres` inside the substitution
    # below -- see the ELEVATION comment above for what that costs.
    needs_elevation "create or repair the login role ${ROLE}"
  else
    role_attributes="$(as_postgres "psql -X -tAc \"select rolsuper, rolcanlogin from pg_roles where rolname = '${ROLE}'\"" 2>/dev/null || true)"
  fi
  case "$role_attributes" in
    "") log "creating login role ${ROLE}"
        as_postgres "psql -X -q -c \"create role \\\"${ROLE}\\\" login superuser createdb\"" ;;
    "t|t") [ "$own_is_usable" = true ] || log "role ${ROLE} already usable" ;;
    *)  log "repairing role ${ROLE} (was ${role_attributes})"
        as_postgres "psql -X -q -c \"alter role \\\"${ROLE}\\\" with login superuser createdb\"" ;;
  esac
fi

# --- self-check -------------------------------------------------------
# Prove the thing verify:sql actually needs, rather than assuming the steps
# above added up to it: this exact user can connect and pgTAP is available.
if [ -z "${DATABASE_URL:-}" ]; then
  version="$(psql -X -tAc 'show server_version' -d postgres)" \
    || fail "role ${ROLE} cannot connect to the local cluster"
  pgtap_version="$(psql -X -tAc "select default_version from pg_available_extensions where name = 'pgtap'" -d postgres)"
  [ -n "$pgtap_version" ] || fail "pgTAP is not available to this server"
  log "ready: PostgreSQL ${version} with pgTAP ${pgtap_version} as role ${ROLE}"
else
  log "ready: packages and cluster provisioned; connection comes from DATABASE_URL"
fi
