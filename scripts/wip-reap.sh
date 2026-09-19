#!/usr/bin/env bash
# Proposed retention policy for `wip/*` refs. DRY RUN BY DEFAULT. Nobody has
# run this with --apply; it ships disarmed on purpose, exactly like
# `deletebranches.sh` at the repository root.
#
# ## Why `wip/*` needs its own policy, separate from `classify-branches.sh`
#
# `scripts/wip-sweep.sh` pushes a fresh `wip/<name>` snapshot roughly every
# three minutes for every live agent worktree, so the count of `wip/*` refs
# grows on its own even when nothing is wrong -- 75 of them existed the day
# this was written. `classify-branches.sh` already protects any `wip/*` ref
# younger than 72h with a KEEP verdict (rule 4) and leaves everything older to
# fall through to its generic "no PR at all" patch-equivalence check, which is
# the wrong test for a `wip/` ref: these are `git stash create` snapshots of
# uncommitted work, not pull-request candidates, and the fact that a snapshot
# is not patch-equivalent to `main` says nothing about whether it is safe to
# throw away -- most of them never will be, by design.
#
# So `wip/*` gets a policy of its own, keyed on age and on whether the work it
# shadows is still live:
#
#   < 72h        -- KEEP.        Inside the loss window `wip-sweep.sh` exists
#                                 to cover. Never touched here.
#   72h .. 7d    -- DELETE       only if the branch/worktree it snapshots is
#                                 INACTIVE (see below). Otherwise KEEP: an
#                                 agent that has been heads-down for four days
#                                 on one branch should not lose its safety net
#                                 because the clock, not the work, moved.
#   > 7d         -- DELETE       by default, active or not -- a week-old
#                                 uncommitted snapshot of a branch that is
#                                 either still being pushed to (so has its own
#                                 history to fall back on) or abandoned (so the
#                                 snapshot serves nobody) has stopped being a
#                                 safety net either way. An opt-out marker
#                                 (below) is the escape hatch for the case this
#                                 default gets wrong.
#
# ## What "the source is active" means, precisely
#
# `wip-sweep.sh` writes `wip/<name>` from an agent worktree checked out on
# `agent/<name>` (`b="agent/*"`; `wip/${b#agent/}`). The shadowed branch is
# "active" here if EITHER:
#   (a) a live local worktree (`git worktree list`) is currently checked out
#       on `agent/<name>`, or any other branch whose name ends in `/<name>`
#       (an agent's branch is not always literally `agent/<name>` once it
#       renames itself on completion) -- checked at run time, same as
#       `classify-branches.sh` rule 3, or
#   (b) the remote branch `agent/<name>` still exists AND its own tip commit
#       is younger than 72h -- i.e. someone has pushed real, committed work
#       to it more recently than the snapshot cadence, so the branch does not
#       need its stash-snapshot safety net tonight.
# Neither test is perfect -- (a) is blind to a worktree on a machine this
# script never runs on, and (b) is blind to an agent that is actively editing
# but has not committed in over 72h. Both are named here so a reviewer can
# see exactly what "active" checked, rather than trusting the word.
#
# ## The opt-out marker
#
# A `keep/<name>` ref on `origin` (mirroring the `wip/<name>` naming) exempts
# `wip/<name>` from the ">7d, delete by default" bucket permanently, until
# that ref is removed. It is a real branch, not a file, so it needs no code
# change to create (`git push origin main:refs/heads/keep/<name>`) and is
# visible to the same `git ls-remote` this script already runs.
#
# ## Usage
#
#   scripts/wip-reap.sh                # DRY RUN -- prints the bucket and the
#                                       # verdict for every wip/* ref, deletes
#                                       # nothing.
#   scripts/wip-reap.sh --apply        # Deletes the refs this run classifies
#                                       # DELETE. Never touches a non-wip/
#                                       # branch -- this script's only write
#                                       # path is `git push --delete origin
#                                       # wip/<name>`.
#
# --apply has never been run. Dry-run output is the only evidence this policy
# has, by design, the same as `deletebranches.sh`'s own default.

set -euo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

INACTIVE_HOURS=72   # bucket boundary: 72h .. 7d is the "only if inactive" band
STALE_HOURS=168     # 7d: delete by default past here

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git fetch --prune --quiet origin

now_epoch="$(date -u +%s)"

# Live local worktree branches, same source classify-branches.sh rule 3 uses.
worktree_branches="$(git worktree list --porcelain \
  | awk '/^branch / { sub("refs/heads/", "", $2); print $2 }')"

# Every ref on origin, once, to test both wip/* and keep/* and agent/* without
# three separate remote round-trips.
all_refs="$(git ls-remote --refs --heads origin | awk '{ print $2 }' | sed 's#^refs/heads/##')"

wip_refs="$(printf '%s\n' "$all_refs" | grep '^wip/' || true)"
if [ -z "$wip_refs" ]; then
  echo "No wip/* refs on origin."
  exit 0
fi

keep_markers="$(printf '%s\n' "$all_refs" | grep '^keep/' | sed 's#^keep/##' || true)"

to_delete=()

while IFS= read -r ref; do
  [ -z "$ref" ] && continue
  name="${ref#wip/}"

  commit_epoch="$(git log -1 --format=%ct "origin/$ref" 2>/dev/null || echo "$now_epoch")"
  age_h=$(( (now_epoch - commit_epoch) / 3600 ))

  if [ "$age_h" -lt "$INACTIVE_HOURS" ]; then
    echo "KEEP    $ref  (${age_h}h old, inside the ${INACTIVE_HOURS}h loss window)"
    continue
  fi

  if printf '%s\n' "$keep_markers" | grep -qxF "$name"; then
    echo "KEEP    $ref  (${age_h}h old, opted out via keep/$name)"
    continue
  fi

  if [ "$age_h" -ge "$STALE_HOURS" ]; then
    echo "DELETE  $ref  (${age_h}h old, past the ${STALE_HOURS}h default-delete bucket)"
    to_delete+=("$ref")
    continue
  fi

  # 72h .. 7d: delete only if the source is inactive.
  source_branch="agent/$name"
  active=0

  if printf '%s\n' "$worktree_branches" | grep -qE "(^|/)${name}\$"; then
    active=1
  fi

  if [ "$active" -eq 0 ] && printf '%s\n' "$all_refs" | grep -qxF "$source_branch"; then
    src_epoch="$(git log -1 --format=%ct "origin/$source_branch" 2>/dev/null || echo 0)"
    src_age_h=$(( (now_epoch - src_epoch) / 3600 ))
    if [ "$src_age_h" -lt "$INACTIVE_HOURS" ]; then
      active=1
    fi
  fi

  if [ "$active" -eq 1 ]; then
    echo "KEEP    $ref  (${age_h}h old, source still active)"
  else
    echo "DELETE  $ref  (${age_h}h old, source inactive)"
    to_delete+=("$ref")
  fi
done <<< "$wip_refs"

echo
if [ ${#to_delete[@]} -eq 0 ]; then
  echo "Nothing to delete."
  exit 0
fi

echo "${#to_delete[@]} wip/* ref(s) would be deleted:"
printf '  %s\n' "${to_delete[@]}"

if [ "$APPLY" -ne 1 ]; then
  echo
  echo "Dry run. Re-run with --apply to delete these. Nothing has been deleted."
  exit 0
fi

printf '%s\n' "${to_delete[@]}" | xargs -n 25 git push --delete origin
echo "Deleted ${#to_delete[@]} wip/* ref(s)."
