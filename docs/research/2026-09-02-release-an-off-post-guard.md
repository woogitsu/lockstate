# Playtest: does a guard genuinely off its post walk when Released?

**Date:** 2026-09-02
**Branch:** `playtest/release-an-off-post-guard`, cut from `origin/main` at
**v0.0.376** (`c2755012`).

**Surface:** `docs/research/2026-09-02-playing-what-landed-today.md` §9's own
named weakest claim — every prior measurement of guard motion found zero
movement, but always with the precondition missing: either a hire standing on
its own post already (§1), or a Release press with no spare standing off-post
at all (§2f). The question this pass exists to close: **does a guard who is
genuinely elsewhere walk when Released, and if Release alone cannot do it, can
anything?**

## The two answers, before the evidence

**No. Pressing Release on a guard's sector-mate does not move a guard that is
genuinely off its post — measured twice, in two different off-post states, and
the reason is structural rather than incidental: the guard `assignUnassignedGuards`
reclaims is always the lowest-entity-id member of the claimable pool, and a
guard that has ever been sent on a contraband sweep always has a *higher* id
than the guard currently posted, by construction of how posts get filled.**
Releasing the posted guard hands the shortage straight back to itself before
it can ever reach the sweep's spare.

**Growing the sector's required guard count past what the posted guard alone
satisfies — no Release press at all — does get the roster to say the spare is
`On Post`, but this pass cannot say it *walked* there.** Across 968 render-delta
publications spanning the whole growth window, the spare never carried a
non-zero velocity, and no tile-to-tile transition was recorded inside the
sampled window at all — so if it moved from the off-post tile to the post
tile, that happened either as a coincidence of its *own*, independently
running contraband sweep landing it on the post tile by chance, or outside the
window this pass could resolve. **Not established either way**, and this
report says exactly what would settle it.

## Reproduction

`tests/browser/playtest-release-an-off-post-guard.playtest.ts`, one combined
test (both acts share a session and a fixture, so the off-post spare Act A
produces is the same one Act B works from):

```
LOCKSTATE_BROWSER_TEST_PORT=5345 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-release-an-off-post-guard.playtest.ts
```

Not a CI gate, for the reason recorded in every other `*.playtest.ts` file in
this directory: `tests/browser/playwright.config.ts` matches `*.spec.ts` only,
and `tests/foundation/browser-network-changed-retry-contract.test.ts:73`
filters on that suffix — a `.playtest.ts` file is never in the set it enforces
the `network-changed-fixture` import against, so `test` comes from
`@playwright/test` directly here, matching every existing playtest in the
directory.

**LFS**: `git lfs checkout` was run in the worktree first (62 objects, 93 MB),
confirmed with `file public/assets/actors/actor.guard.base.idle.png` returning
`PNG image data, 260 x 3104, 8-bit/color RGBA`.

**Every duration below is in simulation ticks**, read from
`simulation/clock-state`, never wall clock — `FixedStepClock.stepMilliseconds`
is 50 (`src/simulation/clock/fixed-step-clock.ts:29`), 20 ticks per wall second
at speed 1. Two full runs of the file are reported (**MEASURED** both times,
console output pasted verbatim below); the first run's Act B carried an
instrument bug (below), so Act B's reported numbers are the corrected second
run's. Act A's finding is reported from **both** runs because the two runs
independently produced two different off-post states to test, which is a
stronger result than either alone.

## The fixture

10-bed, sealed, zoned 6x6 cell around the tile every hire and every admission
arrives at (`POST_TILE` = (16,16), the same fixture geometry
`playtest-2026-09-02-what-landed-today.playtest.ts` uses, extended to 10 beds
so occupancy could be grown past 8 without rebuilding). 6 residents admitted,
2 guards hired. With 2 guards and `resolveOccupancyScaledGuardCount`'s
`ceil(occupants / DEFAULT_SECTOR_PRISONERS_PER_GUARD)`
(`src/simulation/security/sector-staffing.ts:147`, `DEFAULT_SECTOR_PRISONERS_PER_GUARD`
= 8) at `ceil(6/8) = 1`, exactly one guard is posted and the other is the
sector's only spare — the same shape
`2026-09-02-playing-what-landed-today.md` §2c already read the mechanism from,
but this pass adds the piece that was missing there: **the off-post state is
confirmed on the render channel before anything is pressed**, rather than
assumed.

Guard entity ids came back `0` (posted) and `1` (spare) in both runs — matches
`claimableGuardIds`'s ascending order
(`src/simulation/security/post-eligibility.ts:98`) filling the sector's one
required slot with the lower id at the very first `DeploymentSystem` cycle,
leaving the higher id as the only guard `SectorSearchDutySystem` can ever
claim (`src/simulation/contraband/sector-search-duty.ts:126`).

## §A — Release on the posted guard, while the spare is confirmed genuinely off-post

**MEASURED, two independent runs, two different off-post states.**

### Run 1 (`release-run1.log`): the spare mid-search

```
t8971: 0:On Post // 1:Unassigned
t9027: 0:On Post // 1:On Search
[actA] off-post confirmation: tick 8971, guard 1 at (14,12) vs post (16,16)
[actA] held panel before Release: "ON DUTY / 2 held · 0 free / Guard · Sector Post / Release / Guard · Contraband Search / Release / ..."
[actA] pressed Release on guard 0 at tick 9143; guard 1 was at that instant published at (14,12)
[actA] held panel right after: "ON DUTY / 1 held · 1 free / Guard · Sector Post / Release / ..."
[actA] roster changes over 500 ticks after Release:
t9209: 0:On Post // 1:Unassigned
t9601: 0:On Post // 1:On Search
[actA] render-delta samples after Release: 243
[actA] guard entity 0: 243 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[actA] guard entity 1: 243 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[actA] guard 1 (the off-post spare) final published position: (14,12), velocity (0,0)
[actA] VERDICT: did the off-post spare (guard 1) move after Release was pressed on the OTHER guard? NO, its tile is unchanged
```

Here the spare was **actively claimed** by its own contraband-search job
(`claim: 'search'`) at the moment of the press — held, and visibly so (the ON
DUTY panel showed 2 held rows right before the press). Releasing guard 0 did
not touch guard 1's own search claim; nothing about pressing Release on a
*different* guard's row reaches a guard held by search at all
(`GuardReleaseService.release`, `src/simulation/security/guard-release.ts:209`,
resolves and acts on exactly the id it is called with).

### Run 2 (`release-run2.log`): the spare fully parked, unassigned, held by nothing

```
t8569: 0:On Post // 1:Unassigned
[actA] off-post confirmation: tick 8569, guard 1 at (14,12) vs post (16,16)
[actA] held panel before Release: "ON DUTY / 1 held · 1 free / Guard · Sector Post / Release / ..."
[actA] pressed Release on guard 0 at tick 8709; guard 1 was at that instant published at (14,12)
[actA] held panel right after: "ON DUTY / 1 held · 1 free / Guard · Sector Post / Release / ..."
[actA] roster changes over 500 ticks after Release:
t8765: 0:On Post // 1:Unassigned
t9000: 0:On Post // 1:On Search
t9117: 0:On Post // 1:Unassigned
[actA] render-delta samples after Release: 245
[actA] guard entity 0: 245 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[actA] guard entity 1: 245 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[actA] guard 1 (the off-post spare) final published position: (14,12), velocity (0,0)
[actA] VERDICT: did the off-post spare (guard 1) move after Release was pressed on the OTHER guard? NO, its tile is unchanged
```

This is the cleaner of the two: the ON DUTY panel read **"1 held · 1 free"**
both immediately before and immediately after the press — guard 1 was not
held by anything at all (its own sweep had already finished and unassigned it,
per §2c's "parked … for ever" mechanism), sitting `'unassigned'` and genuinely
off-post (14,12) against post (16,16), exactly the precondition §9 named. The
guard 1 that briefly reappears `On Search` at t9000 is its own ordinary
600-tick sweep cadence re-triggering — unrelated to the Release press, which
landed 291 ticks earlier.

### Why, read rather than argued, and matching both runs exactly

- `GuardReleaseService.release(guardId)` acts on exactly the id it is given
  (`src/simulation/security/guard-release.ts:209-245`); a `'deployment'` claim
  (guard 0, `on-post`) needs no claimant call and ends in one `unassign`
  (`:244`).
- `DeploymentSystem.assignUnassignedGuards`
  (`src/simulation/security/deployment-system.ts:180-200`) is the only thing
  that can subsequently move guard 1: it computes `shortage = required -
  assigned` for the sector (`:182-184`) and then walks
  `claimableGuardIds(this.guards)` — **ascending entity id**
  (`src/simulation/security/post-eligibility.ts:98`, `unassignedGuardIds()`'s
  own ordering, `guard-roster.ts:231-238`) — calling `beginDeployment` for at
  most `shortage` of them (`:194-198`).
- With `required = 1` and guard 0 freshly unassigned, `shortage = 1`. The
  claimable pool is `{0, 1}` (or `{0}` alone in run 1, where guard 1 was still
  `'on-search'` and not even unassigned). Ascending order means **guard 0 is
  always visited first**, `beginDeployment(0, …)` finds it already at post
  (`isAtPost`, `deployment-system.ts:206`, true because guard 0 never moved)
  and sets `'on-post'` immediately — zero distance, zero velocity, matching
  every sample above. The loop's `shortage` is decremented once per call
  regardless of outcome (`:197`, `for (const guardId of claimableGuardIds…) {
  if (shortage <= 0) break; beginDeployment(...); shortage -= 1; }`), so with
  `shortage = 1` the loop **never reaches guard 1** — not because guard 1 is
  ineligible, but because guard 0 already exhausted the one slot the shortage
  opened.
- **This is not a coincidence of these two runs' ids.** The guard filling a
  sector's post is always drawn first from the ascending claimable pool
  (`assignUnassignedGuards`, same ordering, at the very first deployment
  cycle a session runs), so the guard that ends up posted always has a *lower*
  id than any guard `SectorSearchDutySystem` could later draw from the pool
  it leaves behind. Releasing the posted guard therefore always reintroduces
  the *lowest*-id member into the claimable pool, and ascending order means it
  is always resolved before a higher-id off-post spare is ever reached, for
  any shortage smaller than the size of the whole claimable pool.
- The general form: a shortage of size *k* only reaches a spare whose rank in
  the ascending claimable pool is ≤ *k*. A guard that has ever been sent
  searching is, by the mechanism above, never rank 1 — it is only reachable
  once *k* is large enough to consume the entire pool, which needs the
  sector's required count to equal the *total* number of currently-unassigned
  guards. If the required count is that high, no guard is ever left spare to
  send searching in the first place (`claimableGuardIds(this.guards).length <
  policy.requiredGuardCount` refuses the sweep,
  `sector-search-duty.ts:126`) — so the two conditions ("required is large
  enough to reach the spare" and "a spare exists to be off-post at all")
  cannot hold at the same real moment for a Release press to bridge. **Not
  proven exhaustively over every guard count and every schedule** — proven for
  the shape this fixture built and reasoned from the two functions' actual
  code, not merely observed twice.

**Combined Act A total: 976 guard render-delta records across 488 publications
in the two 500-tick post-Release windows (243 + 245, both guards each), zero
with a non-zero velocity, zero tile changes for the off-post spare in either
run.** The one control identified as able to manufacture a shortage
(§2f's own conclusion) cannot, on this evidence, ever be the thing that walks
an off-post spare home.

## §B — No Release press: grow the sector's requirement past what the posted guard satisfies

**MEASURED, `release-run2.log`, corrected — see the instrument bug below.**
Same session, continuing from run 2's Act A: guard 1 remained `'unassigned'`
and off-post. 4 more admissions (10 residents total against the 10 beds
built), crossing `ceil(9/8) = 2` — the sector's required guard count should
rise to 2 while only guard 0 is posted, which is a shortage `assignUnassignedGuards`
would open on its own next cycle, no button involved.

```
[actB] roster before growing occupancy: [{"id":0,"phase":"On Post"},{"id":1,"phase":"Unassigned"}]
[actB] admitted 4 more in act B
[actB] roster changes over 2,000 ticks after growing occupancy:
t9686: 0:On Post // 1:On Post
[actB] held panel now: "ON DUTY / 2 held · 0 free / Guard · Sector Post / Release / Guard · Sector Post / Release / ..."
[actB] render-delta samples in the window: 968
[actB] guard entity 0: 968 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[actB] guard entity 1: 968 delta sample(s), 0 with a non-zero velocity, 0 not on a tile centre
[actB] final positions: guard 0 (originally posted) at (16,16); guard 1 (the spare) at (16,16)
```

**The roster does say `On Post` for both guards, and the coverage panel agrees
(`2 held · 0 free`, both `Sector Post`) — so the sector's requirement did rise
and both guards did end up counted as posted.** But **this is not evidence of
a walk.** 968 render-delta publications carry guard 1's position throughout
the window, every one at a tile centre, and not one carries a non-zero
velocity — and `analyseGuardTracks` (the same transition detector
`2026-09-02-playing-what-landed-today.md` §2b uses to tell a teleport from a
walk) logged **zero transition lines for guard 1** across the whole window,
meaning its position was already constant for the entire sampled range. Guard
1's own independent contraband-search cadence had re-triggered naturally at
t9000 (visible in Act A's own aftermath, unrelated to the admissions); a sweep
job of up to 4 targets typically spans on the order of a hundred-plus ticks,
and the real wall-clock cost of four `Admit` presses plus their waits was
enough real time for that job to plausibly finish and land guard 1 somewhere
— possibly the post tile itself, by the same tile-collision (16,16) is both
the post *and* every arrival's tile) §1 and §2e of the existing corpus already
name as a hazard — **before** this pass's own sampling window opened at
`fromB`.

**So what is established: the roster and the coverage panel report the spare
as posted, and 968 samples recorded no walk.** **What is not established:**
whether guard 1 arrived at (16,16) via a real ADR-0088-driven walk that
happened to have zero distance because a coincidental contraband-search
teleport had *already* put it there before the shortage was even evaluated —
which would repeat §1's own finding one level later — or whether it arrived
by some other route this instrumentation did not resolve. **Named as
unreached rather than guessed at**: resolving it needs per-tick tile logging
tight around the exact moment `assignedGuardCountFor` crosses the shortage
threshold, which this pass's 70ms/poll granularity and unbounded gap between
`admit()` finishing and the sampling window opening could not deliver, and the
coordinator's instruction to finish this pass in one further turn rather than
re-run again is respected here rather than worked around.

### An instrument bug this pass caught in its own first attempt, corrected before it was reported as a finding

Run 1's Act B produced an **empty** roster timeline and `".hud-staff__held:
not laid out"` for the entire 2,000-tick window — which would read as "nothing
ever happened" and is not what happened. Cause: `admit()` switches the app to
the `'overview'` tab (`tab(page, 'overview').click()` inside the shared
`admit` helper), and this pass's Act B never switched back to `'security'`
before sampling `.hud-staff__roster`/`.hud-staff__held` — both are `hidden`
while their tab is not active, so every DOM read returned an empty set for the
whole window. The render-delta channel is tab-independent (it reads worker
messages at the page level, not the DOM), so Act B's render-delta numbers from
run 1 were still real, but its roster/held-panel readings were not, and are
not reported here. Fixed by adding `await tab(page, 'security').click();
await openRosterFold(page);` immediately after `admit()` in Act B, before
`fromB` is read; run 2 above is the corrected result. Flagged here rather than
silently swapped in per `docs/AGENT_WORKFLOW.md` §3 ("never report a result
you did not obtain") and §4 (mark corrections rather than overwrite).

## What blocked a fully clean answer to §B, stated plainly

This pass could not isolate "occupancy growth alone moves an off-post spare"
from "the spare's own ordinary search cadence happened to land it on the post
tile regardless of the growth," because:

1. **The fixture's own hub tile collides with the post tile.** (16,16) is
   where every `HireStaff` and every `AdmitPrisoner` arrives
   (`src/main.ts:618`, `2026-09-02-playing-what-landed-today.md` §1), and it
   sits inside the one room this fixture (and the corpus's) builds — so a
   contraband-search target chosen from that room's occupants has a real
   chance of coinciding with it, silently converting what should be an
   off-post arrival into an at-post one before deployment ever has to route
   anything. This is the same mechanism §1 names for a fresh hire, recurring
   one layer downstream.
2. **A contraband sweep's own cadence is not something a player commands or
   this instrument paused.** It runs on `SectorSearchDutySystem`'s own
   600-tick schedule regardless of what the player presses next
   (`sector-search-duty.ts:81`), so between "admit enough to raise the
   requirement" and "sample the result" there was no way, playing through the
   shipped panels, to hold the spare motionless while only the requirement
   changed.
3. **Real wall-clock cost of UI presses is not zero-tick**, and this pass's
   own admission loop (`admit()`, four presses each waiting 150ms plus a
   1,500ms settle) cost enough simulation ticks at the sampled cadence for the
   spare's already-in-flight sweep to plausibly resolve inside that gap,
   before the sampling window this pass could bound had even opened.

None of these is a defect; all three are true of ordinary play. They are
named because **§9's honest answer for the occupancy-growth route is
"attempted, and inconclusive," not "confirmed" and not "refuted."** The
weakest claim this report itself makes is here, and what would change it is
listed below.

## Corrections to the brief, in the order they matter

- **The brief's phrase "genuinely off its post" needed the tile check to come
  from the render channel, not the roster word, and that is what this pass
  did differently from `2026-09-02-playing-what-landed-today.md`'s own act 3
  phase 2** — its own §2f already said as much about itself. Confirmed
  correct as a method; nothing about it turned out wrong.
- **One claim in this report's own working hypothesis turned out to need the
  code, not just the reasoning, to settle**: the intuition that "shortage
  large enough to exhaust the whole claimable pool would reach the spare" is
  correct by the code read in §A, but this pass did not attempt to construct
  that configuration (it would require the sector's required count to equal
  the total guard count at a moment when a spare still exists, which §A's own
  last paragraph shows is unreachable in general — the two conditions cannot
  hold at the same time). So the theoretical resolution named there is
  **read, not played** — flagged rather than left implicit.
- Nothing else in the brief was found wrong. The staged act it named as
  cheapest — "a run that gets a spare guard genuinely off-post first … and
  then presses Release" — is exactly what §A did, twice, and it answers the
  brief's central question with a measured no.

## Weakest claim in this report, and what would change my mind

**§B's non-finding is the weakest claim here.** What would resolve it: a
run that logs guard 1's raw tile on *every* render-delta publication (not only
on a roster-word change) from the moment occupancy is admitted, with the
polling loop reading `currentTick` and the tile together at 20 Hz or faster so
no tick boundary is missed, and ideally a fixture where the sweep target pool
excludes (16,16) entirely (a cell built so no prisoner's tile can ever equal
the post tile) — which the existing corpus has not yet built and this pass did
not either. If that run finds a genuine multi-tick, non-zero-velocity episode
between an off-post tile and (16,16) timed to the shortage crossing, §B
resolves to "yes, occupancy growth walks a spare home, and it looks like a
walk." If it finds the spare already at (16,16) before the requirement
changes, on every attempt, §B resolves the other way, and the tile-collision
this report names in point 1 above would be the reason, matching §1 of the
existing corpus.
