#!/usr/bin/env bash
# Delete every remote branch whose commits are all reachable from `main`.
#
# ## What this replaced, and why the replacement is a different kind of thing
#
# This file used to be a HARDCODED LIST of 33 branch names, written on
# 2026-08-23 against the tree of that day. It was not a cleanup mechanism; it
# was one afternoon's cleanup, frozen. Two consequences followed and both were
# visible in the repository six days later:
#
#   1. It could never keep up, because it named branches rather than describing
#      them. On 2026-08-29 there were 344 remote branches, 106 of them fully
#      merged into `main` -- and issues #291 and #292 had reported the same
#      condition at 100 and 92 respectively. The numbers grew because nothing
#      was running that could shrink them.
#   2. Running it again would abort. `git push --delete` fails on a branch that
#      is already gone, and `set -e` turns the first such failure into an exit,
#      so the frozen list stopped working the moment any of its 33 names was
#      deleted by hand.
#
# `.github/workflows/delete-branches.yml` had a "Verify branches to delete"
# step that computed the set DYNAMICALLY with `git branch -r --merged`, printed
# it, and then ran this script -- which ignored that result completely. The
# workflow looked like it was doing the thing its own log said it was doing.
#
# ## The safety property, which is the whole argument for doing this at all
#
# A branch fully merged into `main` has every one of its commits reachable from
# `main`. Deleting the ref therefore loses NO history: `git log main` still
# reaches every commit the branch pointed at. That is checked here per branch,
# immediately before the delete, with `git merge-base --is-ancestor` -- not
# inferred from a naming convention and not carried over from an earlier scan.
#
# A count that FALLS after this runs is the cleanup working, not history being
# lost: `.github/workflows/ci.yml` records the same effect from the other side,
# where `git rev-list --count --remotes=origin` went 1,115 -> 1,086 because
# deleted branches stopped making their unmerged commits reachable. The commits
# that vanish from that count are the ones that were never merged, which is why
# this script refuses to touch an unmerged branch at all.
#
# ## Usage
#
#   bash deletebranches.sh              # DRY RUN -- prints what it would delete
#   bash deletebranches.sh --apply      # actually deletes
#
# Dry run is the default deliberately. The previous version deleted the moment
# it was invoked, which is the wrong default for an irreversible operation on a
# shared remote, and it is why the workflow now passes --apply explicitly.

set -euo pipefail

# `python3` is assumed at the `open_heads` assignment below and provisioned by
# nothing in this repository (#1089's audit, row `delete-branches.yml` /
# `python3` -- which cites this line, not the workflow: the workflow file
# names no interpreter at all). It cannot be provisioned from here either:
# installing it needs root, which no job here has.
#
# **That sentence read "and the `woogitsu-linux-*` pool has no passwordless
# sudo (proved on job 101846181533, 2026-09-07)", and it is corrected in
# place rather than deleted.** The measurement is real and it is about a pool
# this repository no longer runs on: read off `runner_name` for every job of
# the four most recent completed runs, the pool is
# `lockstate-wsl-DOM-NEW-01/02/03` and the runner user is `mateusz`. Whether
# THIS pool grants passwordless sudo is untested, because every
# `scripts/provision-*.sh` short-circuits on it
# (`[provision-postgres] packages already present`) and so never reaches an
# elevation path.
#
# `set -euo pipefail` above already makes a missing `python3` fail the script
# rather than leave `open_heads` empty -- which matters, because an empty
# `open_heads` would leave every open pull request's head branch unprotected,
# the same catastrophe the `curl` guard further down refuses to risk. **So
# this check adds no safety. It adds a sentence**: without it the run dies on
# a bare `python3: command not found` at line 107 of a script whose visible
# purpose is deleting branches, and the operator has to read the script to
# learn what was actually missing.
if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is not on PATH." >&2
  echo "       This script reads the open pull requests' head branches with" >&2
  echo "       python3, and refuses to run without that list -- every open" >&2
  echo "       pull request's head branch would otherwise be unprotected." >&2
  echo "       Nothing in this repository can install it: the step needs" >&2
  echo "       root, which no job here has. Pre-provision the host" >&2
  echo "       (apt-get install -y python3) and re-dispatch." >&2
  exit 1
fi

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

git fetch --prune --quiet origin

# Open pull requests' head branches. An open PR's head is normally NOT merged
# into main -- that is what makes it open -- so the ancestor test below already
# excludes it. This is the second lock on the same door, because "normally" is
# not "always": a PR can be open on a branch whose commits reached main by
# another route, and deleting its head closes it as abandoned.
#
# Needs GITHUB_TOKEN. Without one, this script REFUSES to run rather than
# deleting with one fewer protection -- silently degrading a safety check is
# how a cleanup script becomes a data-loss script.
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "error: GITHUB_TOKEN is required so open pull requests' head branches can be protected." >&2
  exit 1
fi

repository="${GITHUB_REPOSITORY:-woogitsu/lockstate}"
# THE LOOKUP AND ITS FAILURE ARE SEPARATED ON PURPOSE.
#
# These used to be one pipeline, and on 2026-08-30 that cost a diagnosis. The
# workflow's `permissions:` block granted `contents: write` and nothing else,
# which sets every other scope to `none`; this repository is private, so the
# call below could only return 403. What the run's log showed was `curl: (22)`
# followed by twelve lines of Python traceback ending in
# `json.decoder.JSONDecodeError: Expecting value` -- an error about parsing,
# raised by the second half of a pipeline whose first half had already
# failed, naming neither the permission nor the URL.
#
# So `curl` is run on its own and its exit is inspected before anything reads
# the body. The abort is unchanged and deliberate: this list protects the head
# branch of every open pull request, and a run that cannot fetch it must stop
# rather than proceed with an empty one. The `-z "${GITHUB_TOKEN:-}"` check
# above guards a MISSING token; this guards a token that is present and
# powerless, which is a different failure and was the one that happened.
open_pulls_json=""
if ! open_pulls_json="$(
  curl -fsS -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${repository}/pulls?state=open&per_page=100"
)"; then
  echo "error: could not read open pull requests for ${repository}." >&2
  echo "       GET /repos/${repository}/pulls?state=open failed." >&2
  echo "       A 403 here with a token present means the token lacks the" >&2
  echo "       'pull-requests: read' scope -- a workflow that declares any" >&2
  echo "       permissions: block sets every scope it omits to none, and this" >&2
  echo "       repository is private, so that read is not public." >&2
  echo "       Refusing to continue: without this list, every open pull" >&2
  echo "       request's head branch would be unprotected." >&2
  exit 1
fi

open_heads="$(
  printf '%s' "$open_pulls_json" \
  | python3 -c 'import sys, json; [print(p["head"]["ref"]) for p in json.load(sys.stdin)]'
)"

deletable=()
for ref in $(git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin); do
  # `HEAD` is origin/HEAD, a symbolic ref, not a branch.
  [ "$ref" = "HEAD" ] && continue
  [ "$ref" = "main" ] && continue

  # `wip/*` are snapshots pushed by scripts/wip-sweep.sh for agents that may be
  # running right now. They carry work that exists nowhere else -- that is
  # their entire purpose -- so they are never candidates, merged or not.
  case "$ref" in wip/*) continue ;; esac

  if printf '%s\n' "$open_heads" | grep -qxF "$ref"; then continue; fi

  if git merge-base --is-ancestor "origin/$ref" origin/main 2>/dev/null; then
    deletable+=("$ref")
  fi
done

if [ ${#deletable[@]} -eq 0 ]; then
  echo "Nothing to delete: no remote branch outside main is fully merged into it."
  exit 0
fi

echo "${#deletable[@]} branch(es) fully merged into main:"
printf '  %s\n' "${deletable[@]}"

if [ "$APPLY" -ne 1 ]; then
  echo
  echo "Dry run. Re-run with --apply to delete these."
  exit 0
fi

# In batches, because a single push with hundreds of refspecs is one failure
# away from telling you nothing about which ones went.
printf '%s\n' "${deletable[@]}" | xargs -n 25 git push --delete origin
echo "Deleted ${#deletable[@]} branch(es)."
