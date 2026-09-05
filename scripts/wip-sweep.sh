#!/bin/bash
# Push a snapshot of every agent worktree to a `wip/<branch>` ref, every 3 minutes.
#
# A session can be cut off by a usage limit with no warning, and everything in
# its container dies with it. Agents are told to commit and push after each
# coherent chunk, but on 2026-08-29 one committed and stopped without pushing
# and its work was one container restart from gone. This does not depend on
# them complying.
#
# Usage: scripts/wip-sweep.sh [repo-root] &
# Stop it by killing the pid; it is a development aid, never part of CI.
#
# `git stash create` writes a commit object and touches NEITHER the index nor
# the working tree, so it cannot race an agent's own git operations. Committed
# work is pushed to the real branch; uncommitted work goes to `wip/` so it never
# lands on a branch an agent is about to push to itself.
#
# 2026-09-05: this filtered on `agent/*` and so swept FIVE of fifty-four
# worktrees. Nothing in this repository's briefs asks for that prefix --
# `grep -c "agent/" AGENTS.md docs/AGENT_WORKFLOW.md CLAUDE.md` returns 0, 0, 0
# -- and the prefixes actually in use across one session were fix 15, docs 7,
# playtest 5, agent 5, research 4, feat 4, measure 3. The filter and the
# paragraph above it landed in the same commit (`31f63131`, 2026-08-29), so the
# guarantee in that paragraph was never kept for the other forty-nine. An
# unrestored production mutation did sit in a worktree through a container
# restart on 2026-09-04 and was found by hand, which is what a swept snapshot
# is for.
#
# Now: every worktree except the one this script was pointed at -- the
# integrator's own tree, which must not be auto-pushed -- and except detached
# heads, which have no branch to push to. A worktree whose tree is clean AND
# whose branch already matches its remote-tracking ref is skipped before any
# network call, so the common case of forty-odd finished worktrees costs local
# `status` and `rev-parse` rather than forty-odd pushes every three minutes.
# The tracking ref can be stale; the cost of that is one needless push.
root=$(cd "${1:-$(git rev-parse --show-toplevel)}" && pwd -P) || exit 1
cd "$root" || exit 1
while true; do
  for w in $(git worktree list --porcelain | grep '^worktree ' | cut -d' ' -f2); do
    [ "$(cd "$w" && pwd -P)" = "$root" ] && continue
    b=$(git -C "$w" branch --show-current 2>/dev/null)
    [ -z "$b" ] && continue
    dirty=$(git -C "$w" status --porcelain 2>/dev/null)
    # Does the branch still exist upstream? A merged branch is deleted on
    # `origin`, and pushing it back would RESURRECT it -- so the direct push is
    # gated on the tracking ref existing, and only the `wip/` snapshot is
    # unconditional. Both reads are local; no network in this test.
    upstream=$(git -C "$w" rev-parse --verify -q "origin/$b" 2>/dev/null)
    # Nothing to snapshot: clean tree, and either the branch is where its
    # tracking ref says or it has no tracking ref left to be ahead of.
    if [ -z "$dirty" ]; then
      [ -z "$upstream" ] && continue
      [ "$(git -C "$w" rev-parse "$b" 2>/dev/null)" = "$upstream" ] && continue
    fi
    # Committed but unpushed, to the branch itself -- only while it is still a
    # branch on `origin`.
    [ -n "$upstream" ] && git -C "$w" push -q origin "$b" 2>/dev/null
    # Uncommitted, to a wip ref.
    sha=$(git -C "$w" stash create "wip sweep $(date -u +%H:%M)" 2>/dev/null)
    if [ -n "$sha" ]; then
      git -C "$w" push -qf origin "$sha:refs/heads/wip/${b#agent/}" 2>/dev/null \
        && echo "$(date -u +%H:%M:%S) snapshotted $b"
    fi
  done
  sleep 180
done
