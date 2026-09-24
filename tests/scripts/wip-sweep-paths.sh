#!/usr/bin/env bash
# Run with: bash tests/scripts/wip-sweep-paths.sh [path-to-wip-sweep.sh]
set -euo pipefail

script=$(cd "$(dirname "${1:-scripts/wip-sweep.sh}")" && pwd -P)/$(basename "${1:-scripts/wip-sweep.sh}")
tmp_base=$(cd "${TMPDIR:-/tmp}" && pwd -P)
tmp=$(mktemp -d "$tmp_base/wip sweep.XXXXXX")
cleanup() {
  # Only remove the directory created for this test, inside the chosen temp root.
  [[ $tmp == "$tmp_base"/wip\ sweep.* && -d $tmp ]] && rm -rf -- "$tmp"
}
trap cleanup EXIT

git init -q --bare "$tmp/remote.git"
git init -q "$tmp/main repo"
git -C "$tmp/main repo" config user.name 'Sweep test'
git -C "$tmp/main repo" config user.email 'sweep@example.invalid'
printf 'before\n' > "$tmp/main repo/tracked.txt"
git -C "$tmp/main repo" add tracked.txt
git -C "$tmp/main repo" commit -qm initial
git -C "$tmp/main repo" branch -M main
git -C "$tmp/main repo" remote add origin "$tmp/remote.git"
git -C "$tmp/main repo" push -q -u origin main
git -C "$tmp/main repo" switch -qc feature
git -C "$tmp/main repo" push -q -u origin feature
git -C "$tmp/main repo" switch -q main
git -C "$tmp/main repo" worktree add -q "$tmp/worker with spaces" feature
printf 'after\n' > "$tmp/worker with spaces/tracked.txt"

# The sweep is periodic. Stop it after the first iteration, then inspect the
# bare remote: this checks that the real push was made for the whole path.
timeout 3s bash "$script" "$tmp/main repo" >/dev/null 2>&1 || result=$?
if [[ ${result:-0} != 124 ]]; then
  echo "sweep exited unexpectedly: ${result:-0}" >&2
  exit 1
fi
snapshot=$(git --git-dir="$tmp/remote.git" rev-parse refs/heads/wip/feature)
actual=$(git --git-dir="$tmp/remote.git" show "$snapshot:tracked.txt")
[[ $actual == after ]] || { echo "wrong snapshot: $actual" >&2; exit 1; }
echo 'PASS: worktree path with spaces was snapshotted to wip/feature'
