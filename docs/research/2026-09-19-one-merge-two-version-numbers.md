# One merge, two version numbers: what it has actually cost the anchor budget

**Date:** 2026-09-19.
**Tree:** `origin/main` at `ab3bf7ba` (v0.0.693), in a worktree cut from it.
**Question:** [#1205](https://github.com/woogitsu/lockstate/issues/1205) says
`.github/workflows/version.yml`'s *"ONE VERSION NUMBER PER MERGE"* contract has
been broken and that each break spends a unit of the
`docs/adr/STATUS-QUEUE.md` anchor staleness budget. **How many version numbers
were really spent on nothing, and how much budget has that cost — today, not
on 2026-09-15?**
**Author's standing:** this record measures. It changes no workflow, moves no
budget constant, and touches no anchor.
**Instruments:** `git log --first-parent` over all 1,590 first-parent commits
of `main`, and the GitHub Actions API read with `curl` — every `Version`
workflow run the API will serve, which for this workflow is **all of them**
(736 runs, `total_count` for all events equals the push-event count, earliest
`2026-08-24T12:33:22Z`, which is the workflow's own first run).

## The answer in four numbers

| Claim | Measured |
|---|---|
| Version numbers ever spent on nothing | **1** — `deac3215` (v0.0.616), from the duplicated push delivery on `a27c437f`/#1189 |
| Release commits sitting directly on another release commit | **41** of 693 (5.9%), of which **40 are not waste** |
| Budget that duplicate costs **today** | **0** merges of `ANCHOR_STALENESS_BUDGET_MERGES`; **1** commit of `ANCHOR_STALENESS_BUDGET_COMMITS`'s 100, once, in a window closed on 2026-09-15 |
| Budget it cost **before** #1214 landed | **1** merge of re-anchor lead time, once — the 2026-09-15 red, which is the failure #1214 was written from |

**So the premise that double release commits are eating merge throughput today
is false, and it is false by construction rather than by luck.** #1214 changed
the gate's unit on 2026-09-15 from `package.json` patch numbers to first-parent
commits whose subject is not `chore(release): v`
(`tests/foundation/adr-status-queue-anchor-contract.test.ts:773`,
`landingsSince`). A duplicated bump adds no such commit, so it contributes
exactly zero to the number that fires. The remedy #1205's own second comment
recommended is merged; this record is the measurement that was owed to it.

## 1. The duplicate rate, settled over the whole history rather than a window

#1205's second comment grouped 1,000 `push` runs by `(workflow, head_sha)` and
found one duplicate, but that window (2026-08-28 → 2026-09-15) is bounded by
the API's 1,000-result cap over *all* workflows. Asking the same question of
the `version.yml` workflow alone gets under the cap and covers the workflow's
entire life:

```
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  ".../actions/workflows/version.yml/runs?event=push&branch=main&per_page=100&page=N"
```

736 runs, `2026-08-24T12:33:22Z` → `2026-09-19T16:20:10Z`. Grouped by
`head_sha`, **exactly one sha carries more than one run**:

| run | head_sha | created | attempt | check_suite | conclusion |
|---|---|---|---|---|---|
| 34869370386 | `a27c437f` | 2026-09-14T16:33:43Z | 1 | 94424139949 | success |
| 34869384906 | `a27c437f` | 2026-09-14T16:33:53Z | 1 | 94424183230 | success |

`total_count` for the workflow across **all** events is also 736, so no
`workflow_dispatch` or other-event run exists outside this set and nothing is
hidden behind the event filter. **One duplicated delivery in 736 runs, over
26 days and 693 version numbers.** The mechanism is #1205's and is not
re-derived here: run B reset onto run A's release commit
(`version.yml:227-228`) and bumped that, because the job-level guard inspects
the event payload's head commit rather than what `origin/main` holds by the
time the job executes.

## 2. Adjacency is not waste, and the largest run of it is the proof

The `awk` one-liner in #1205's body — release commit directly on release commit
in first-parent order — now returns **41** pairs against 693 release commits,
up from the 24 of 628 recorded in the gate's own docblock. It is the same
pattern growing, not a worsening one: the detector has a false-positive mode
that #1205's first comment named and this record can now price.

The largest instance is 2026-09-17, four release commits in a row:

```
64a3ad2c 19:41:57Z  Merge pull request #1232
53e34560 19:42:04Z  Merge pull request #1245
9792fe27 19:42:10Z  Merge pull request #1284
90d62621 19:43:27Z  Merge pull request #1238
ce710028 20:24:48Z  chore(release): v0.0.657
b50632b2 20:25:02Z  chore(release): v0.0.658
1ab77187 20:38:24Z  chore(release): v0.0.659
7b41e8e4 20:38:38Z  chore(release): v0.0.660
```

Four merges, four version numbers, nothing lost and nothing duplicated. The
Actions API confirms it run by run — four runs, four distinct `head_sha`s, one
each (35266423963, 35266435401, 35266444915, 35266568685), all `run_attempt: 1`,
all `success`. What separates the merges from the releases is **41 minutes of
runner queue**: each run was created within seconds of its merge and executed
much later, so by the time the first bump was pushed all four merges had
already landed and every bump committed on top of a release commit. First-parent
order then shows four adjacent releases with no merge between them.

`version.yml`'s deliberate absence of a `concurrency` group is what makes this
shape possible and it is the right trade — #1205's second comment measured a
Version run queuing **56m 50s** for a runner, and a `concurrency` group would
evict such a run silently, costing a *missing* version rather than an adjacent
one. Nothing here argues against it.

**So 40 of the 41 adjacencies are serialised races and 1 is waste.** A count of
adjacencies is not a count of un-earned releases, and the two differ by a factor
of 41 on this repository's own history.

## 3. What it costs the gate, today

`tests/foundation/adr-status-queue-anchor-contract.test.ts` carries two budgets
and the duplicate touches them differently:

- **`ANCHOR_STALENESS_BUDGET_MERGES = 10`** counts first-parent commits since
  the anchor whose subject is not `chore(release): v`. `deac3215` is such a
  commit's opposite — it *is* a release commit — so it contributes **zero**.
  Not "less than before": zero, and the same is true of all 41 adjacencies and
  of every release commit this repository will ever make.
- **`ANCHOR_STALENESS_BUDGET_COMMITS = 100`** counts every first-parent commit,
  release commits included, so `deac3215` spends **1 of 100** in whatever window
  contains it. That window closed on 2026-09-15 and the assertion was at 66 of
  100 when the sibling budget fired, so it cost nothing that was scarce.

**The current window carries no duplicate at all.** Anchor `0bf1731d`
(v0.0.682) to `ab3bf7ba` (v0.0.693): **10 merges** — the budget exactly — over
**21** first-parent commits and 11 release numbers. Every one of the 10 is a
pull-request merge. Whatever is making the anchor gate fire often now, it is not
this: it is merge throughput, and the budget is doing precisely what its own
failure message says it is for.

The one real historical cost is the one #1205 identified: on 2026-09-15 the
window `d57b97ba`..`7e9c3043` held nine merges and eleven releases, and the
gate — counting releases then — demanded a re-anchor one merge before any work
had earned one. That is one re-anchor pass dispatched early, once, and it is
the evidence #1214 was written from.

## 4. What this refutes in the repository's own documentation

`tests/foundation/adr-status-queue-anchor-contract.test.ts`'s docblock, in the
section that argues the unit change, says of the adjacency count:

> Over the whole of first-parent `main`, **24 of the 628 release commits sit
> directly on another release commit** — 3.8% of every version number this
> repository has ever issued … Every one of them spends a release of this
> budget on nothing.

**The last sentence is false and the count is the detector's, not waste's.**
One of the 24 spent a release on nothing; the rest are the shape §2 measures.
The correction is appended to that docblock in the same commit as this record
rather than left to be found again — the paragraph it corrects is kept in place,
per `docs/AGENT_WORKFLOW.md` §4. **It changes no assertion and no constant**:
the conclusion that docblock draws — that a release is a worse unit than a
merge — survives intact, because it rests equally on the other half of the
argument, the twenty landings that went under a single version number between
`491fcdce` and `450c9819`. That half is untouched and is the stronger one:
skipped bumps outnumber duplicated ones **42 to 1** on this history (735
non-release first-parent commits since v0.0.1 against 693 release commits).

`tooling/anchor-budget-spend.mjs`'s header repeats the same "24 of 628" figure
but draws only the claim that survives — *"a version number can be spent on
nothing"* — and names the single duplicated delivery as its instance. It is left
alone.

## 5. What is NOT recommended, and why that is the owner's to accept

`version.yml` is deploy configuration and reserved to the owner
(`AGENTS.md` reservation 3). **Nothing here asks for a release.** #1205's own
body proposed a guard there and its second comment withdrew the proposal on
evidence — a duplicate delivery and a serialised race are topologically
identical, so any guard reading commit topology also drops earned bumps — and
this record's §2 is that argument measured again on a larger sample: 40 shapes a
topology guard would misread against 1 it would catch. At one duplicate per 26
days, costing zero units of the budget that fires, there is nothing left to buy.

**The one thing that would reopen it**, unchanged from #1205's second comment:
the same-sha duplicate recurring more than about once a week, or one landing
while the first run is mid-push — which would cost a *failed* bump rather than
an extra one, and a missing version is the failure mode `version.yml:91-105`
says cannot be detected.

## What would change my mind

- **The API is the only discriminator and it is one source.** Everything in §1
  rests on GitHub's own run list being complete for this workflow. It is
  self-consistent (736 = 736, earliest run at the workflow's introduction) and
  nothing independent corroborates it. A run deleted or expired from retention
  would be invisible here, and would look exactly like an absence of a
  duplicate.
- **The classification in §2 is an inference for 39 of the 40 false positives.**
  Four were checked run-by-run against the API; the rest are classified by the
  absence of a duplicate `head_sha` in §1, which is sound only if a duplicated
  bump can arise *only* from a duplicated delivery. A second `Version` run
  bumping twice inside one run would not show up as two runs at all.
- **Weakest claim, named:** that "zero merge-budget units" holds prospectively.
  It holds for as long as the gate counts merges. If the unit is ever moved back
  to releases — which the gate's own docblock says should happen if a human ever
  cuts a release by hand — every figure in §3 changes and this record becomes
  history rather than an answer.
