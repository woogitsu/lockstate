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
cd "${1:-$(git rev-parse --show-toplevel)}" || exit 1
while true; do
  for w in $(git worktree list --porcelain | grep '^worktree ' | cut -d' ' -f2); do
    b=$(git -C "$w" branch --show-current 2>/dev/null)
    case "$b" in agent/*) ;; *) continue ;; esac
    # Committed but unpushed, to the branch itself.
    git -C "$w" push -q origin "$b" 2>/dev/null
    # Uncommitted, to a wip ref.
    sha=$(git -C "$w" stash create "wip sweep $(date -u +%H:%M)" 2>/dev/null)
    if [ -n "$sha" ]; then
      git -C "$w" push -qf origin "$sha:refs/heads/wip/${b#agent/}" 2>/dev/null \
        && echo "$(date -u +%H:%M:%S) snapshotted $b"
    fi
  done
  sleep 180
done
