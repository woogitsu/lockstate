#!/usr/bin/env bash
# Classify every remote branch: KEEP, DELETE-SAFE or REVIEW, with a reason.
#
# ## Why this exists instead of running `deletebranches.sh` harder
#
# `deletebranches.sh` (repository root) deletes a branch only when
# `git merge-base --is-ancestor` says every one of its commits is reachable
# from `main`. That test is correct for a fast-forward or a real merge commit,
# and it is BLIND to a squash or rebase merge: GitHub replays the PR's diff as
# a brand-new commit on `main` with a new SHA, so none of the branch's own
# commits ever become ancestors of `main`, and `--is-ancestor` reports false
# forever -- on a branch that shipped. Issue #292 measured this directly: of
# 22 branches that were not ancestors of `main`, every one was already merged
# or superseded. Issue #537 records the cost of trusting ancestry anyway: the
# existing cleanup deleted an active worktree's branch on that assumption.
#
# This script never deletes anything. It only classifies, so a human (or a
# later, separately-reviewed script) can decide what to do with each verdict.
#
# ## The reliable signal for a squash merge
#
# The GitHub REST API's Pull Request resource carries `merged` (bool) and
# `merge_commit_sha` independently of whether the merge commit's parents
# include the head branch's tip. A squash or rebase merge still sets
# `merged: true` and a `merge_commit_sha` -- that field names whatever commit
# landed on the base branch, not a promise that the head is its ancestor. So
# "is this PR's `merged_at` non-null" is checked instead of, and never
# alongside, ancestry. For every branch classified DELETE-SAFE via a merged
# PR, this script ALSO runs the ancestry test and reports it in the reason
# purely as evidence of how often it would have been wrong alone -- ancestry
# never gates the verdict.
#
# ## Verdicts, in precedence order (first match wins)
#
#   1. KEEP      -- main.
#   2. KEEP      -- head of an OPEN pull request (from the API, not guessed).
#   3. KEEP      -- checked out by a live local worktree (`git worktree list`).
#   4. KEEP      -- a wip/* ref younger than 72h.
#   5. DELETE-SAFE -- head of a MERGED pull request (`merged_at` non-null),
#                     including squash and rebase merges.
#   6. REVIEW    -- head of a CLOSED, never-merged pull request. Content has
#                   to be looked at; this script does not attempt to guess.
#   7. DELETE-SAFE -- no PR at all, AND `git cherry` proves every commit on the
#                     branch is patch-equivalent to something already on
#                     `main` (i.e. it would produce an empty diff against it).
#      REVIEW       -- no PR at all, and that is not provably true.
#   8. REVIEW    -- anything the rules above could not place. Should not be
#                   reached; kept as a safety net rather than a guess.
#
# ## Usage
#
#   GITHUB_TOKEN=... scripts/classify-branches.sh [--repo owner/name]
#
# Prints one TSV line per branch to stdout: `<verdict>\t<branch>\t<reason>`,
# sorted by verdict then branch name. Nothing here is destructive: it reads
# the remote, reads the GitHub API, and reads local git history. Re-running it
# is always safe and picks up whatever has changed on the remote since.

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-woogitsu/lockstate}"
WIP_KEEP_HOURS=72

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    *) echo "error: unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "error: GITHUB_TOKEN is required to list pull requests (open, merged and closed)." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "Fetching origin (pruned)..." >&2
git fetch --prune --quiet origin

# --- 1. The authoritative branch list -------------------------------------
#
# NOT `git branch -r` / `for-each-ref refs/remotes/origin`: this repository's
# local remote-tracking namespace carries stale refs left over from earlier
# one-off fetches (e.g. `origin/137/head`) that the configured fetch refspec
# (`+refs/heads/*:refs/remotes/origin/*`) never claims and `--prune` therefore
# never removes -- `git branch -r` here reports 1,330+ entries against the
# ~475 the remote actually has. `git ls-remote --refs --heads` asks the
# remote directly and is immune to local clutter.
echo "Listing remote branches..." >&2
git ls-remote --refs --heads origin \
  | awk '{ print $2 }' | sed 's#^refs/heads/##' | sort > "$tmpdir/branches.txt"
branch_count="$(wc -l < "$tmpdir/branches.txt" | tr -d ' ')"
echo "  $branch_count branches on origin." >&2

# --- 2. Every pull request, open and closed, paginated ---------------------
echo "Fetching pull requests from ${REPO}..." >&2
: > "$tmpdir/prs.jsonl"
page=1
while :; do
  resp="$(curl -fsS \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/pulls?state=all&per_page=100&page=${page}")" \
    || { echo "error: could not list pull requests for ${REPO} (page ${page})." >&2; exit 1; }
  n="$(printf '%s' "$resp" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))')"
  [ "$n" -eq 0 ] && break
  printf '%s' "$resp" | python3 -c '
import sys, json
for p in json.load(sys.stdin):
    print(json.dumps({
        "number": p["number"],
        "head": p["head"]["ref"],
        "state": p["state"],
        "merged_at": p.get("merged_at"),
        "merge_commit_sha": p.get("merge_commit_sha"),
    }))
' >> "$tmpdir/prs.jsonl"
  page=$((page + 1))
done
pr_count="$(wc -l < "$tmpdir/prs.jsonl" | tr -d ' ')"
echo "  $pr_count pull requests (all states)." >&2

# Collapse to one row per branch that still exists, applying precedence
# open > merged > closed-unmerged when a branch had more than one PR over its
# life (reopened, or a second PR after the first was closed unmerged).
python3 -c '
import json

branches = set(l.strip() for l in open("'"$tmpdir"'/branches.txt") if l.strip())
best = {}
RANK = {"open": 0, "merged": 1, "closed_unmerged": 2}
with open("'"$tmpdir"'/prs.jsonl") as f:
    for line in f:
        p = json.loads(line)
        head = p["head"]
        if head not in branches:
            continue
        if p["state"] == "open":
            cls = "open"
        elif p["merged_at"]:
            cls = "merged"
        else:
            cls = "closed_unmerged"
        cur = best.get(head)
        if cur is None or RANK[cls] < RANK[cur["cls"]]:
            best[head] = {"cls": cls, "number": p["number"], "merge_commit_sha": p.get("merge_commit_sha")}

with open("'"$tmpdir"'/pr_lookup.tsv", "w") as out:
    for head, info in best.items():
        cls = info["cls"]
        number = info["number"]
        msha = info.get("merge_commit_sha") or ""
        out.write(head + "\t" + cls + "\t" + str(number) + "\t" + msha + "\n")
'

# --- 3. Local worktrees ------------------------------------------------------
git worktree list --porcelain \
  | awk '/^branch / { sub("refs/heads/", "", $2); print $2 }' \
  | sort -u > "$tmpdir/worktree_branches.txt"
echo "  $(wc -l < "$tmpdir/worktree_branches.txt" | tr -d ' ') branches checked out by a local worktree." >&2

now_epoch="$(date -u +%s)"

declare -A pr_cls pr_num pr_msha
while IFS=$'\t' read -r head cls num msha; do
  [ -z "$head" ] && continue
  pr_cls["$head"]="$cls"
  pr_num["$head"]="$num"
  pr_msha["$head"]="$msha"
done < "$tmpdir/pr_lookup.tsv"

declare -A is_worktree
while IFS= read -r b; do
  [ -z "$b" ] && continue
  is_worktree["$b"]=1
done < "$tmpdir/worktree_branches.txt"

# --- 4. Classify, one branch at a time --------------------------------------
: > "$tmpdir/out.tsv"
while IFS= read -r branch; do
  [ -z "$branch" ] && continue

  if [ "$branch" = "main" ]; then
    printf 'KEEP\t%s\tmain\n' "$branch" >> "$tmpdir/out.tsv"
    continue
  fi

  cls="${pr_cls[$branch]:-}"

  if [ "$cls" = "open" ]; then
    printf 'KEEP\t%s\thead of open PR #%s\n' "$branch" "${pr_num[$branch]}" >> "$tmpdir/out.tsv"
    continue
  fi

  if [ -n "${is_worktree[$branch]:-}" ]; then
    printf 'KEEP\t%s\tchecked out by a live local worktree\n' "$branch" >> "$tmpdir/out.tsv"
    continue
  fi

  case "$branch" in
    wip/*)
      commit_epoch="$(git log -1 --format=%ct "origin/$branch" 2>/dev/null || echo 0)"
      age_h=$(( (now_epoch - commit_epoch) / 3600 ))
      if [ "$age_h" -lt "$WIP_KEEP_HOURS" ]; then
        printf 'KEEP\t%s\twip snapshot, %sh old (< %sh retention window)\n' \
          "$branch" "$age_h" "$WIP_KEEP_HOURS" >> "$tmpdir/out.tsv"
        continue
      fi
      ;;
  esac

  if [ "$cls" = "merged" ]; then
    msha="${pr_msha[$branch]}"
    ancestor="no evidence"
    if [ -n "$msha" ] && git cat-file -e "$msha" 2>/dev/null; then
      if git merge-base --is-ancestor "origin/$branch" "$msha" 2>/dev/null \
         && git merge-base --is-ancestor "$msha" origin/main 2>/dev/null; then
        ancestor="yes (real merge or fast-forward)"
      else
        ancestor="NO -- squash/rebase merge, --merged/--is-ancestor would have missed this"
      fi
    fi
    printf 'DELETE-SAFE\t%s\tmerged PR #%s (merge_commit_sha=%s; branch-tip-ancestor-of-merge-commit: %s)\n' \
      "$branch" "${pr_num[$branch]}" "${msha:-none}" "$ancestor" >> "$tmpdir/out.tsv"
    continue
  fi

  if [ "$cls" = "closed_unmerged" ]; then
    printf 'REVIEW\t%s\tclosed PR #%s, never merged -- content not compared, needs a human look\n' \
      "$branch" "${pr_num[$branch]}" >> "$tmpdir/out.tsv"
    continue
  fi

  # No PR at all (cls is empty). Patch-equivalence against main: `git cherry`
  # marks each commit on the branch that is NOT in main with `+`, and every
  # commit whose patch already has an equivalent in main with `-`. A branch
  # with no `+` lines (including no output at all, e.g. an ancestor of main)
  # has nothing left to contribute.
  cherry_out="$(git cherry origin/main "origin/$branch" 2>/dev/null || echo "__CHERRY_FAILED__")"
  if [ "$cherry_out" = "__CHERRY_FAILED__" ]; then
    printf 'REVIEW\t%s\tno PR found, and git cherry against main failed -- needs a human look\n' \
      "$branch" >> "$tmpdir/out.tsv"
    continue
  fi
  if [ -z "$cherry_out" ]; then
    printf 'DELETE-SAFE\t%s\tno PR found; git cherry against main is empty (no commits ahead)\n' \
      "$branch" >> "$tmpdir/out.tsv"
    continue
  fi
  plus_count="$(printf '%s\n' "$cherry_out" | grep -c '^+' || true)"
  if [ "$plus_count" -eq 0 ]; then
    printf 'DELETE-SAFE\t%s\tno PR found; every commit is patch-equivalent to one already on main (git cherry: all "-")\n' \
      "$branch" >> "$tmpdir/out.tsv"
  else
    total_count="$(printf '%s\n' "$cherry_out" | grep -c '^[+-]' || true)"
    printf 'REVIEW\t%s\tno PR found; %s of %s commits are NOT patch-equivalent to main (git cherry)\n' \
      "$branch" "$plus_count" "$total_count" >> "$tmpdir/out.tsv"
  fi
done < "$tmpdir/branches.txt"

# Anything that reached this point unclassified is a bug in the rules above,
# not a branch property -- surface it loudly rather than silently dropping it.
classified_count="$(wc -l < "$tmpdir/out.tsv" | tr -d ' ')"
if [ "$classified_count" -ne "$branch_count" ]; then
  echo "warning: classified $classified_count of $branch_count branches -- the remainder fall through every rule; treat as REVIEW." >&2
  comm -23 "$tmpdir/branches.txt" <(cut -f2 "$tmpdir/out.tsv" | sort) | while IFS= read -r b; do
    [ -z "$b" ] && continue
    printf 'REVIEW\t%s\tunclassified -- fell through every rule\n' "$b" >> "$tmpdir/out.tsv"
  done
fi

sort -t "$(printf '\t')" -k1,1 -k2,2 "$tmpdir/out.tsv"
