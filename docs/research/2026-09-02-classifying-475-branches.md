# Classifying 475 branches without trusting ancestry

**Date:** 2026-09-02
**Branch:** `chore/classify-the-branches`, cut from `origin/main` at `846af73a` (v0.0.384) in a
worktree (`/workspace/wt-branchgc`) with `node_modules` symlinked from the main checkout.
**Instrument:** `scripts/classify-branches.sh`, re-run three times over roughly an hour against a
repository that kept moving under it (`main` advanced from `846af73a` (v0.0.384) to `7fcff8d1`
(v0.0.385) mid-session, and PR #835 merged while the second run was in flight — both are used below
as evidence, not noise).
The figures quoted are from the **third and final run**, captured at 2026-09-02T20:27:38Z against
`origin/main` at `7fcff8d1` (v0.0.385): `git ls-remote --refs --heads origin` → 475 branches,
`GET /repos/matmaxalez/lockstate/pulls?state=all` (paginated, 6 pages) → 524 pull requests.
**This pass deleted nothing.** No `git push --delete` was run against any branch in this session,
against the task's explicit instruction. `scripts/wip-reap.sh` (§5) was run only in its default,
disarmed dry-run mode.

**Claim tiers**, per `docs/research/README.md`: every count in §§2–4 is **VERIFIED** — obtained by
running the classifier or a one-off `git`/`curl` command quoted beside it, on this repository, at
the timestamp above. Nothing here is FROM MEMORY.

---

## 1. Three things the brief got wrong or approximate, before anything else

**There is no deletebranches.sh under `scripts/`.** The file this replaces the reasoning of is
`deletebranches.sh` **at the repository root**, not under `scripts/`. It is real, it is exactly as
dangerous as described, and its own docblock already tells the story the brief tells — a 33-name
hardcoded list from 2026-08-23, replaced by a dynamic `--is-ancestor` scan after issues #291 and
#292 both reported the branch count growing faster than manual cleanup could shrink it. Its logic
is sound for its own stated goal (never touch a branch with an unmerged commit) and blind to
exactly the case this task exists to cover: a squash merge leaves zero of the branch's commits
reachable from `main`, so `--is-ancestor` reports every squash-merged branch as *not* deletable,
forever. This classifier does not replace `deletebranches.sh`; it answers the question that
script's own dynamic scan cannot.

**The branch count is real but `git branch -r` cannot be used to get it.** `git ls-remote --refs
--heads origin | wc -l` measured **475** (474 an hour earlier — the count grew during this
session, exactly as the brief predicted it would), confirming the brief's headline number. But
this repository's *local* `refs/remotes/origin/*` namespace carries stale entries — `1/head`,
`100/head`, `137/head`, 417 of them — left over from some earlier one-off fetch that used a
refspec the configured one (`+refs/heads/*:refs/remotes/origin/*`) never claims, so `git fetch
--prune` never removes them. `git branch -r` there reports **1,330** entries, nearly 3x the real
count. `classify-branches.sh` builds its branch list from `git ls-remote --refs --heads origin`
for exactly this reason — it asks the remote directly and cannot be fooled by local clutter. A
script that used `git for-each-ref refs/remotes/origin` or `git branch -r` here would silently
classify 855 things that are not branches.

**The `wip/*` count is right, but "younger than 72h" needed a decision the brief left implicit.**
75 of 475 branches matched `wip/*`, confirming the brief exactly. What it did not say: whether
"younger than 72h" is evaluated against the ref's *push* time or its *commit* time. `wip-sweep.sh`
writes each snapshot with `git stash create`, which stamps the commit at creation time and is
pushed within the same 3-minute loop iteration, so the two are the same to within the sweep
interval here — but the classifier uses **commit** time (`git log -1 --format=%ct`), which is the
one that survives a re-push of an unchanged snapshot and is the more conservative choice if the
two ever diverge.

---

## 2. Verdict counts

| Verdict | Count | Rule(s) that produced it |
| --- | --- | --- |
| KEEP | 41 | main (1); open PR head (11); live worktree (18); wip/* < 72h (11) |
| DELETE-SAFE | 348 | merged PR, including squash (346); no PR, patch-equivalent to main (2) |
| REVIEW | 86 | closed PR never merged (4); no PR, not patch-equivalent (82) |
| **Total** | **475** | |

KEEP's four reasons overlap in the raw worktree data (33 branches are checked out by a local
worktree, but 15 of those are *also* an open PR's head and are attributed to that rule instead,
since open-PR-head outranks worktree in the precedence order) — the 18 above is what is left after
that precedence is applied, not the raw worktree count.

---

## 3. How a squash merge is detected, and why it matters here

The GitHub REST API's pull request resource carries `merged`/`merged_at` and `merge_commit_sha`
independently of whether the merge commit's parents include the branch tip. A squash or rebase
merge still sets `merged_at` to a real timestamp; the branch's own commits simply never become
ancestors of `main`, because GitHub replayed the diff as one new commit rather than fast-forwarding
or merging the originals in. `classify-branches.sh` therefore keys DELETE-SAFE (rule 5) on
`merged_at` non-null alone, and — purely as evidence, never as a gate — separately checks
`git merge-base --is-ancestor <branch-tip> <merge_commit_sha>` for every branch it calls
DELETE-SAFE this way, to show whether the old `--is-ancestor` test would have agreed.

**It never did, once, in this repository.** All 346 merged-PR branches came back
`branch-tip-ancestor-of-merge-commit: NO` — the merge commit's parent is not the branch tip:

```
$ git merge-base --is-ancestor origin/agent/0042-step3-recurring-debit origin/main; echo $?
1
$ git show -s --format='%H %P' 916ac460b9663c62b92f9e10991b7d6c7d418b71
916ac460b9663c62b92f9e10991b7d6c7d418b71 b30ae9b16645005d2e37e979c0705816b37723ab
```

`916ac46` is PR #455's `merge_commit_sha` for that branch; it has **one** parent (`b30ae9b`, the
prior tip of `main`), not two, and that one parent is not `27194162` (the branch's own tip) — the
signature of a squash merge, and the reason a real merge commit's ancestry test cannot see it.
`git branch -r --merged origin/main` independently confirms the branch is absent from that list
despite PR #455 having merged it 2026-08-28. Zero of the 346 real-merge/fast-forward ancestor cases
this repository's history could in principle contain actually occurred — every merge here is a
squash or a rebase. This is the entire reason issue #292's 22-branch measurement (every one already
merged or superseded) and issue #537's deleted-worktree incident both happened: nothing in
`--is-ancestor` was ever going to say yes.

**Live confirmation, not staged.** Between the first and third run of this classifier (roughly one
hour apart), PR #835 (`fix/the-remove-hint-says-what-cancel-does`) merged. The second run still
showed it `KEEP — head of open PR #835`; the third showed
`DELETE-SAFE — merged PR #835 (merge_commit_sha=f19b9ef2…; … NO — squash/rebase merge)` with no
code change — the classifier picked up the state change on its own, which is the point of
`git ls-remote`/the API being the source of truth rather than a cached scan.

---

## 4. What landed in REVIEW, and why each bucket stayed there

**4 branches: a closed PR that was never merged.** Its content was never compared to `main` by
this pass, on purpose — rule 6 does not attempt a patch-equivalence check for these, because a
closed-without-merging PR usually means the change was rejected, superseded by different code, or
abandoned mid-review, and treating "not patch-identical to main" as the test would call all four
DELETE-SAFE for the wrong reason (of course a rejected patch is not on `main`) while calling one
that happened to get silently absorbed elsewhere REVIEW for the wrong reason too. A human decision,
not a computed one, is what rule 6 is for:

- `claude/construction-materials-supply` — closed PR #91, never merged
- `claude/lockstate-agents-prompt-tlyafw` — closed PR #430, never merged
- `fix/352-incident-response-record-persistence` — closed PR #361, never merged
- `fix/735-rooms-arm-from-removal` — closed PR #742, never merged

**82 branches: no PR at all, and `git cherry origin/main <branch>` found at least one commit not
patch-equivalent to anything on `main`.** These split into two populations that this classifier
cannot tell apart without reading content, which is exactly why it does not try:

- Agent- or Claude-authored working branches that were superseded by a *different* PR's branch for
  the same work (e.g. issue-numbered pairs like `wip/0076-relocate-residents` alongside a merged
  `agent/0076-*`) — likely safe to delete once a human confirms the superseding PR covers the same
  ground, but "likely" is not "provably," which is the bar rule 7 sets.
- 82 of these are `git cherry`'s honest answer that the branch's diff, whatever it is, is not
  reproduced on `main` today — which includes both "this was simply never shipped" and "this is
  mid-flight work a session is about to finish." Nothing in git history distinguishes those from
  here; a live worktree check (rule 3) already protects anything currently checked out, so what is
  left in this bucket is unshepherded, not necessarily unwanted.

No REVIEW branch was deleted, moved, or otherwise touched. `docs/HANDOVER-2026-08-26.md` was not
read or modified by this pass — the classifier's rules never inspect file content, only branch
metadata, so the two allowlist entries the documentation-commit-citation-contract test depends on
were never at risk.

---

## 5. The `wip/*` retention policy: proposed, not armed

`scripts/wip-reap.sh` (new, alongside `scripts/wip-sweep.sh`) implements the three-tier policy the
task asked for:

| Age | Verdict |
| --- | --- |
| < 72h | KEEP, always — inside the loss window `wip-sweep.sh` exists to cover |
| 72h – 7d | DELETE only if the branch/worktree it snapshots is inactive (no live worktree on it, and the shadowed `agent/<name>` branch itself has not been pushed to in the last 72h) |
| > 7d | DELETE by default, unless a `keep/<name>` ref exists on `origin` (an explicit, git-native opt-out — a real branch, not a file, so no code change is needed to set one) |

**The arming flag is `--apply`, and nobody has passed it.** `scripts/wip-reap.sh` with no
arguments only prints its verdicts; `scripts/wip-reap.sh --apply` is the only path that calls
`git push --delete`, and that path was never exercised in this session. A dry run against the live
repository at capture time found:

```
75 wip/* refs total
11 KEEP  (< 72h)
 3 KEEP  (72h-7d, source still active: wip/639-clock-is-stopped, wip/641-economy-costing,
          wip/683-escape-says-nothing)
61 DELETE (either > 7d, or 72h-7d with an inactive source)
```

No `keep/*` opt-out ref exists yet in this repository, so the `> 7d` default was not exercised
against a real opt-out in this run — that path is implemented and read but not yet observed
turning a DELETE into a KEEP here.

---

## 6. The full DELETE-SAFE list (348)

Every one of these is either the head of a pull request the GitHub API reports `merged_at` for
(346), or has no pull request at all and an empty `git cherry origin/main <branch>` (2:
`agent/609-strip-housed-count`, `agent/backlog-triage`). Deleting any of them is a proposal, not
an action taken by this pass.

- `adr/0082-build-order-execution-order`
- `agent/0042-step3-recurring-debit`
- `agent/0076-adr-quotations`
- `agent/0076-relocate-residents`
- `agent/0076-relocation-notice`
- `agent/118-adr-status-truth`
- `agent/157-projection-channel`
- `agent/169-generation-wrap`
- `agent/182-codec-boundary`
- `agent/288-tick-cost-claims`
- `agent/337-adjacent-room-unzone`
- `agent/372-cell-sharing-integration`
- `agent/378-reachability`
- `agent/403-save-generations`
- `agent/410-benchmark-production-code`
- `agent/411-keyboard-zoning`
- `agent/413-navigation-tick-budget`
- `agent/414-delta-channel`
- `agent/414-draw-the-guards`
- `agent/431-restore-refusal-reasons`
- `agent/432-keep-unreadable-generations`
- `agent/434-contention-fairness`
- `agent/435-substitution-cost`
- `agent/436-need-routes`
- `agent/437-undo-inversion`
- `agent/440-empty-action-categories`
- `agent/441-sentence-end`
- `agent/442-incident-producers`
- `agent/443-need-consequences`
- `agent/449-reanchor-status-queue`
- `agent/449-reanchor-v0152`
- `agent/449-status-queue-reanchor`
- `agent/451-observation-surface`
- `agent/456-post-eligibility`
- `agent/470-app-shell-order`
- `agent/478-unzone-occupied-recovery`
- `agent/479-master-seed`
- `agent/492-refusal-supersession`
- `agent/493-preconfirm-enclosure`
- `agent/506-incident-type`
- `agent/506-regime-empty-roster`
- `agent/507-event-channel`
- `agent/514-duplicate-build-order`
- `agent/516-stuck-pointer-gesture`
- `agent/528-room-requirement-quantity`
- `agent/529-room-requirements-visible`
- `agent/531-door-edge-choice`
- `agent/532-kitchen-and-yard`
- `agent/533-dismiss-staff`
- `agent/540-tier-three`
- `agent/543-false-comments`
- `agent/543-stale-comments`
- `agent/545-ui-scale`
- `agent/548-number-field-commit`
- `agent/549-over-admission-signal`
- `agent/550-where-readout`
- `agent/552-contraband-search`
- `agent/552-search-adr`
- `agent/555-incident-events`
- `agent/559-v4-room-bounds`
- `agent/562-discharge-distribution`
- `agent/585-occupied-place`
- `agent/585-occupied-place-audit`
- `agent/588-coverage-safety`
- `agent/593-longer-sentences`
- `agent/593-tier-comment-sweep`
- `agent/602-typecheck-blind-spot`
- `agent/609-room-occupants-reader`
- `agent/609-strip-housed-badge`
- `agent/609-strip-housed-count`
- `agent/616-network-changed-retry`
- `agent/627-just-in-time-materials`
- `agent/629-hidden-requirements`
- `agent/632-unreachable-thresholds`
- `agent/634-strip-breakpoint`
- `agent/639-clock-is-stopped`
- `agent/639-wage-not-a-fee`
- `agent/640-playtest-just-in-time`
- `agent/641-economy-costing`
- `agent/641-waste-multiplier`
- `agent/642-dead-content`
- `agent/645-adr-quotations`
- `agent/648-649-settle`
- `agent/652-artifact-retry`
- `agent/661-polish-candidates`
- `agent/662-catalogue-delivery`
- `agent/664-pseudo-locale-sweep`
- `agent/675-play-into-the-lock`
- `agent/677-weapons-unreachable`
- `agent/680-first-press-already-initialized`
- `agent/683-escape-says-nothing`
- `agent/684-rooms-arm-toggle`
- `agent/687-refund-undone-by-the-clock`
- `agent/687-the-jit-gate-hole`
- `agent/692-negative-balance-and-loans`
- `agent/694-loans-persistence-proof`
- `agent/703-negative-balance-first`
- `agent/703-negative-balance-floor`
- `agent/80-assault-consequences`
- `agent/backlog-triage`
- `agent/build-catalogue-roving-tabindex`
- `agent/busy-group-focus`
- `agent/canteen-wasted-walk`
- `agent/contention-arithmetic`
- `agent/describedby-merge`
- `agent/door-drawn-as-wall`
- `agent/econ-hardlock-and-recycling`
- `agent/environment-art`
- `agent/income-risk-tier`
- `agent/paused-start`
- `agent/playtest-2026-08-31`
- `agent/playtest-main-after-today`
- `agent/playtest-mouse-2`
- `agent/playtest-naive-route`
- `agent/playtest-ordering`
- `agent/playtest-research-note`
- `agent/playtest-save-restore`
- `agent/prisoner-need-bar`
- `agent/production-artifact-smoke`
- `agent/reanchor-status-queue-2`
- `agent/reanchor-status-queue-v0163`
- `agent/reanchor-status-queue-v0170`
- `agent/reanchor-status-queue-v0177`
- `agent/reanchor-status-queue-v0187`
- `agent/reanchor-v0195`
- `agent/reanchor-v0201`
- `agent/reanchor-v0208`
- `agent/reanchor-v0214`
- `agent/riot-regime-effect`
- `agent/rooms-without-actions`
- `agent/sentence-length-variation`
- `agent/sim-001-stale-routes`
- `agent/source-comment-path-contract`
- `agent/status-queue-0074-entry`
- `agent/wip-sweep-discipline`
- `audit/navigation-determinism`
- `chore/one-times-sign-and-a-ruling-recorded`
- `claude/620-verify-branch-count`
- `claude/622-corrections`
- `claude/accept-adr-0022-0023-0028`
- `claude/accept-adr-0024-to-0027`
- `claude/accept-adr-0029`
- `claude/accept-adr-0075-0076`
- `claude/admit-prisoner-command`
- `claude/adr-0007-dangling-accessors`
- `claude/adr-0025-absence-clause`
- `claude/adr-0076-requote-after-660`
- `claude/adr-0081-purchase-atomicity`
- `claude/adr-corpus-corrections`
- `claude/adr-object-placement`
- `claude/adr-room-capacity`
- `claude/adr-room-zoning-surface`
- `claude/adr-status-queue-rows`
- `claude/adr-status-truth`
- `claude/adr-status-truth-0012-remedy`
- `claude/adr-statuses-approved`
- `claude/alerts-evict-by-severity`
- `claude/alerts-unfolded-by-default`
- `claude/allocation-and-entity-generations`
- `claude/branch-cleanup-dynamic`
- `claude/build-panel-fold-900x600`
- `claude/challenge-verification-guards`
- `claude/citation-truth-after-merge`
- `claude/classification-target-reachability`
- `claude/close-two-handed-over-stale-claims`
- `claude/compare-replay-final-tick`
- `claude/count-concurrent-room-use`
- `claude/delete-branches-pr-scope`
- `claude/determinism-does-not-hash-money`
- `claude/determinism-economy-exclusion`
- `claude/doc-path-citation-gate`
- `claude/door-connectivity-guard`
- `claude/evict-chunk-topologies`
- `claude/finish-the-two-corrections`
- `claude/fix-uiscale-doc-rot`
- `claude/guard-hiring-surface`
- `claude/kill-surviving-mutations-264`
- `claude/lockstate-agent-workflow-73di6u`
- `claude/lockstate-repo-audit-szb4cc`
- `claude/message-kind-reachability`
- `claude/mutation-survivors`
- `claude/needs-decay-exact-level-pin`
- `claude/needs-decay-fixed-point`
- `claude/object-placement-phase-1`
- `claude/object-placement-phase-2`
- `claude/object-placement-phase-3`
- `claude/playtest-the-twelve`
- `claude/prisoner-day-income`
- `claude/procurement-cancel-refund`
- `claude/projection-channel-completion`
- `claude/prompt-przekazania-pracy-x66hvh`
- `claude/purchase-stepper`
- `claude/reachable-undo`
- `claude/reanchor-status-queue-v284`
- `claude/reanchor-status-queue-v291`
- `claude/reanchor-v0-0-225`
- `claude/reanchor-v0-0-234`
- `claude/reanchor-v0-0-242`
- `claude/reanchor-v0-0-252`
- `claude/reanchor-v0-0-268`
- `claude/reanchor-v0-0-276`
- `claude/render-actors`
- `claude/report-refusals`
- `claude/research-records`
- `claude/rng-derivation-vector`
- `claude/rooms-panel-small-viewport`
- `claude/rooms-tab-zoning`
- `claude/rpc-status-mapping`
- `claude/save-import`
- `claude/slow-test-timing`
- `claude/sql-tier-audit`
- `claude/stale-comments-audit`
- `claude/stale-status-claims`
- `claude/status-queue-0051-accepted`
- `claude/status-queue-anchor-narrative`
- `claude/strip-comments-single-pass`
- `claude/topology-id-determinism`
- `claude/unify-comment-strippers`
- `claude/wip-sweep-survives-resume`
- `claude/wooden-door-geometry`
- `claude/worker-fault-reporting`
- `claude/zone-room-registers`
- `docs/0088-walking-is-unobservable-amendment`
- `docs/345-cloud-save-coverage-count`
- `docs/657-what-a-refusal-is`
- `docs/718-what-cadence-a-pulled-readout-has`
- `docs/accept-0033-and-0007-amendment`
- `docs/accept-0034-0035`
- `docs/accept-0036`
- `docs/accept-adr-0031-0032`
- `docs/alerts-what-a-player-is-owed`
- `docs/are-the-risk-tiers-reachable`
- `docs/close-capacity-zero-claims`
- `docs/comment-truth-v0-0-76`
- `docs/copy-variants-for-the-owner`
- `docs/four-traps-that-cost-a-red-ci`
- `docs/handover-2026-08-26`
- `docs/hud-width-decisions`
- `docs/navigation-claims-after-destination-rooting`
- `docs/playtest-first-five-minutes`
- `docs/playtest-money-2026-09-01`
- `docs/playtest-people-2026-09-01`
- `docs/playtest-reload-2026-09-01`
- `docs/playtest-rooms-2026-09-01`
- `docs/playtest-the-clock`
- `docs/playtest-the-world-view`
- `docs/playtest-what-landed-today`
- docs/re-anchor-status-queue-at-v0.0.350
- docs/re-anchor-status-queue-at-v0.0.358
- docs/re-anchor-status-queue-at-v0.0.377
- docs/re-anchor-status-queue-at-v0.0.383
- `docs/re-anchor-the-status-queue-at-v0-0-328`
- `docs/re-anchor-the-status-queue-at-v0-0-340`
- `docs/re-anchor-the-status-queue-at-v0-0-346`
- `docs/reanchor-status-queue`
- `docs/reanchor-status-queue-319`
- `docs/reanchor-status-queue-again`
- docs/reanchor-status-queue-v0.0.301
- `docs/reanchor-status-queue-v2`
- `docs/reanchor-v0-0-111`
- `docs/recount-the-post-hoc-additions`
- `docs/the-measurements-that-were-owed`
- `docs/three-mechanics-traps`
- `docs/triage-the-open-issue-backlog`
- `docs/two-rulings-0092-and-0093`
- `feat/0076-a-finished-object-returns-nothing`
- `feat/0082-placement-order`
- `feat/0084-a-terminal-outcome-gets-its-moment`
- `feat/0084-what-the-alerts-log-owes`
- `feat/104-general-projection-channel`
- `feat/285-cancel-material-purchase`
- `feat/341-edge-label-probe`
- `feat/390-catalogue-category-filter`
- `feat/396-default-security-sector`
- `feat/662-664-a-second-locale-can-be-loaded`
- `feat/703-contraband-discovered-alert`
- `feat/749-say-it-when-it-works`
- `feat/767-a-crossed-rung-is-a-condition-and-an-event`
- `feat/768-771-a-third-tone-and-a-number-that-unblocks`
- `feat/771-a-fresh-prison-can-always-buy-its-first-plank`
- `feat/78-80-incident-consequences`
- `feat/793-the-minimap-navigates`
- `feat/adr0028-phase-4-object-catalogue`
- `feat/cancel-build-order`
- `feat/cancel-refunds-money`
- `feat/construction-single-crew-slot`
- `feat/door-wooden-registers-door`
- `feat/guard-returning-after-restore`
- `feat/insolvency-ladder-thresholds`
- `feat/name-the-rung-on-screen`
- `feat/overdraft-visible-and-coverage-short`
- `feat/redispatch-and-release-claims`
- `feat/rooms-panel-missing-readout`
- `fix/174-build-panel-fold`
- `fix/177-169-entity-ids-and-adr-0007`
- `fix/280-sql-tier-findings`
- `fix/315-content-validation-in-production`
- `fix/338-prison-id-uuid`
- `fix/344-deploy-secret-scan`
- `fix/352-release-held-claim-on-restore`
- `fix/357-360-navigation-cache-and-shared-plan`
- `fix/403-404-never-delete-the-last-save`
- `fix/405-406-restore-rng-and-overdue-commands`
- `fix/407-carry-job-dropoff-compensation`
- `fix/408-close-the-deploy-gate`
- `fix/409-unknown-buildable-refusal`
- `fix/417-version-claims-in-prose`
- `fix/419-unknown-destination-container`
- `fix/425-assert-the-worker-answer-before-polling-the-clock`
- `fix/689-stop-removing-stands-the-tool-down`
- `fix/700-the-escape-is-seen`
- `fix/720-alerts-log-clipping`
- `fix/735-draw-on-map-draws`
- `fix/739-a-column-a-sentence-fits-in`
- `fix/740-a-guard-walks-to-its-post`
- `fix/760-764-an-index-row-and-a-dismiss-control`
- `fix/765-the-255ms-promise-that-was-measured-false`
- `fix/765-two-comments-that-stopped-being-true`
- `fix/772-the-buy-button-says-what-it-can-do`
- `fix/777-780-what-clears-a-refusal`
- `fix/788-medium-is-a-warning-not-a-skipped-step`
- `fix/adr-0081-corrections`
- `fix/adr-0092-status-names-what-landed`
- `fix/capability-scoped-room-use-ceiling`
- `fix/catalogue-arrows-do-not-pan`
- `fix/close-the-handovers-of-2026-09-01`
- `fix/main-is-red-two-greens-collided`
- `fix/nav-heuristic-admissibility`
- `fix/occupants-of-canonical-order`
- `fix/restore-what-a-reload-says`
- `fix/the-hire-button-says-what-it-can-do`
- `fix/the-remove-hint-says-what-cancel-does`
- `fix/the-two-gates-that-could-not-fail`
- `fix/two-comments-that-deny-a-signed-decision`
- `fix/worker-refusal-says-what-host-says`
- `fix/worker-refusal-visible-band`
- `guard-deploy-checkout-ref`
- `measure-job-performing-restart`
- `playtest/after-rulings-18-25`
- `playtest/what-act-six-never-reached`
- `research/failure-modes`
- `save-migration-chain-audit`
- `test/264-close-surviving-mutations`
- `test/375-unreachable-guards`
- `test/build-panel-edge-label-behaviour`
- `worktree-agent-a645c98521f15d400`
- `worktree-agent-a7191d2ae1992befb`
- `worktree-agent-aa85d8d2e1d2ae2dc`

## Appendix: the full REVIEW list (86), with reason

- `agent/535-adr-0052-0054-review` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `agent/569-alerts-badge` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `agent/703-strip-overflow` — no PR found; 10 of 10 commits are NOT patch-equivalent to main (git cherry)
- `agent/build-order-execution-order` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `agent/playtest-mouse-route` — no PR found; 5 of 5 commits are NOT patch-equivalent to main (git cherry)
- `agent/playtest-ordering-harness` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `claude/adr-0049-accept-and-supersede` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `claude/concurrent-use-ceiling-research` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `claude/construction-materials-supply` — closed PR #91, never merged -- content not compared, needs a human look
- `claude/doc-truth-v0-0-37` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `claude/lockstate-agents-prompt-tlyafw` — closed PR #430, never merged -- content not compared, needs a human look
- `claude/lockstate-autonomous-work-36pxxv` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `claude/lockstate-environment-setup-gmi1pd` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `claude/purchase-refusal-seam` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `claude/static-review-2026-08-25` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `claude/workflow-traps-correction` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `feat/771-buying-and-building-stop-together` — no PR found; 10 of 10 commits are NOT patch-equivalent to main (git cherry)
- `fix/352-incident-response-record-persistence` — closed PR #361, never merged -- content not compared, needs a human look
- `fix/735-rooms-arm-from-removal` — closed PR #742, never merged -- content not compared, needs a human look
- `fix/refusal-band-lifetime` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `measure/the-construction-schedule-window` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `rescue/169-generation-tripwire` — no PR found; 1 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/0076-adr-quotations` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/0076-relocate-residents` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/0076-relocation-notice` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/337-adjacent-room-unzone` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/410-benchmark-production-code` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/414-delta-channel` — no PR found; 12 of 12 commits are NOT patch-equivalent to main (git cherry)
- `wip/431-restore-refusal-reasons` — no PR found; 5 of 5 commits are NOT patch-equivalent to main (git cherry)
- `wip/436-need-routes` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/443-need-consequences` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/507-event-channel` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/529-room-requirements-visible` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/532-kitchen-and-yard` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/533-dismiss-staff` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/543-false-comments` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/543-stale-comments` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/545-ui-scale` — no PR found; 5 of 5 commits are NOT patch-equivalent to main (git cherry)
- `wip/548-number-field-commit` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/549-over-admission-signal` — no PR found; 5 of 5 commits are NOT patch-equivalent to main (git cherry)
- `wip/550-where-readout` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `wip/552-contraband-search` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/555-incident-events` — no PR found; 5 of 5 commits are NOT patch-equivalent to main (git cherry)
- `wip/559-v4-room-bounds` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/562-discharge-distribution` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `wip/569-alerts-badge` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `wip/585-occupied-place` — no PR found; 6 of 6 commits are NOT patch-equivalent to main (git cherry)
- `wip/585-occupied-place-audit` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/588-coverage-safety` — no PR found; 11 of 11 commits are NOT patch-equivalent to main (git cherry)
- `wip/593-longer-sentences` — no PR found; 5 of 5 commits are NOT patch-equivalent to main (git cherry)
- `wip/593-tier-comment-sweep` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `wip/602-typecheck-blind-spot` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/609-strip-housed-badge` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/616-network-changed-retry` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/627-just-in-time-materials` — no PR found; 9 of 9 commits are NOT patch-equivalent to main (git cherry)
- `wip/632-unreachable-thresholds` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/639-clock-is-stopped` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/639-wage-not-a-fee` — no PR found; 8 of 8 commits are NOT patch-equivalent to main (git cherry)
- `wip/640-playtest-just-in-time` — no PR found; 14 of 14 commits are NOT patch-equivalent to main (git cherry)
- `wip/641-economy-costing` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/641-waste-multiplier` — no PR found; 5 of 5 commits are NOT patch-equivalent to main (git cherry)
- `wip/645-adr-quotations` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/648-649-settle` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `wip/652-artifact-retry` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/675-play-into-the-lock` — no PR found; 12 of 12 commits are NOT patch-equivalent to main (git cherry)
- `wip/680-first-press-already-initialized` — no PR found; 3 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/683-escape-says-nothing` — no PR found; 7 of 7 commits are NOT patch-equivalent to main (git cherry)
- `wip/684-rooms-arm-toggle` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/687-refund-undone-by-the-clock` — no PR found; 5 of 5 commits are NOT patch-equivalent to main (git cherry)
- `wip/econ-hardlock-and-recycling` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/playtest-main-after-today` — no PR found; 19 of 19 commits are NOT patch-equivalent to main (git cherry)
- `wip/playtest-mouse-2` — no PR found; 9 of 9 commits are NOT patch-equivalent to main (git cherry)
- `wip/playtest-mouse-route` — no PR found; 3 of 3 commits are NOT patch-equivalent to main (git cherry)
- `wip/playtest-naive-route` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/playtest-research-note` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/playtest-save-restore` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `wip/prisoner-need-bar` — no PR found; 6 of 6 commits are NOT patch-equivalent to main (git cherry)
- `wip/production-artifact-smoke` — no PR found; 10 of 10 commits are NOT patch-equivalent to main (git cherry)
- `wip/reanchor-status-queue-v0187` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/reanchor-v0195` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `wip/reanchor-v0201` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)
- `wip/reanchor-v0208` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/reanchor-v0214` — no PR found; 2 of 2 commits are NOT patch-equivalent to main (git cherry)
- `wip/sentence-length-variation` — no PR found; 4 of 4 commits are NOT patch-equivalent to main (git cherry)
- `wip/sim-001-stale-routes` — no PR found; 8 of 8 commits are NOT patch-equivalent to main (git cherry)
- `wip/wip-sweep-discipline` — no PR found; 1 of 1 commits are NOT patch-equivalent to main (git cherry)


---

## 7. What would change my mind

The two structural weak points, named rather than hidden:

- **The 82-branch "no PR, not patch-equivalent" REVIEW bucket is where a real defect would hide if
  one exists.** I did not open any of these 82 branches' diffs. If one turns out to duplicate a
  merged PR's content under materially different commits (not just squashed, but independently
  rewritten), `git cherry`'s patch-id comparison would correctly call it non-equivalent and this
  classifier would call it REVIEW forever, which is the safe failure mode but not a free one — it
  means this list needs an actual second pass, by a human or a smarter diff, not just a re-run of
  this script on a later day.
- **"Source branch/worktree is inactive" in `wip-reap.sh`'s 72h–7d bucket is a heuristic, named as
  one in its own comments.** It cannot see a worktree on a machine this script never runs on, and
  it cannot tell "abandoned" from "being edited without a commit in 72h." Both are stated in the
  script; neither has been tested against a case where they disagree with what a human would say.

If either of those turned out wrong on inspection, the fix is to narrow the rule that produced the
wrong verdict, not to widen `--is-ancestor` back in — the whole reason this script exists is that
ancestry alone already produced a worse answer.
