# Playtest: does a prison survive being closed and reopened — and does it still earn?

Recorded 2026-08-30 against `origin/main` at `603b718` (v0.0.226), in a real
Chromium at 1440x900, driving `index.html` + `src/main.ts` — not a harness page.
The script is `tests/browser/playtest-save-restore.playtest.ts` and it **is in
this tree**, collected by `tests/browser/playwright.playtest.config.ts`, which
nothing in CI runs.

The brief was the owner's: *"znajdź bugi i błędy grając, bo ja nie mogłem
postawić więzienia itp grając sam"* — find defects by playing.

## Every claim here is VERIFIED, and the tier means one thing

`docs/research/README.md` labels claims VERIFIED / SEARCH-SUMMARY / FROM MEMORY
/ UNKNOWN. Everything below is **VERIFIED** and that means one of two things,
both first-party: a number pasted verbatim from a run of the script named above
against a real Chromium, or a `file:line` in this repository that was opened.
**SEARCH-SUMMARY and FROM MEMORY do not occur.** One UNKNOWN is marked inline.

## The question, and why the usual check does not answer it

[#569](https://github.com/matmaxalez/lockstate/issues/569) already established
the static half — *"save → reload → load of a mouse-built prison loses nothing
measurable except the Rooms panel's selection"* — and that result survived its
retraction, because it was measured independently of the claim that was
withdrawn. This record does not re-litigate it. It confirms it and then asks the
question that a count cannot answer.

**Reading back a roster count proves the save carried a number. It does not
prove the restored prison still works.** State income is derived per resident of
a room instance — `stateIncomeForCompletedDay` walks
`roomInstances.residentIds()` (`src/simulation/economy/income.ts`) — so the
interesting failure is a prison that restores *looking* correct, with the right
prisoner count, the right rooms and the right funds, and then quietly **stops
earning**, because a residency edge is exactly the kind of derived link a
restore can drop while every count still reads right.

> **Correction, 2026-08-30, and it strengthens this record rather than
> weakening it.** The paragraph above names the wrong method.
> `stateIncomeForCompletedDay` walks
> **`roomInstances.residentIdsWithExistingPlace()`**
> (`src/simulation/economy/income.ts:407`), not `residentIds()`. Found by an
> independent read-only audit of `origin/main`; the line was opened and
> confirmed before this correction was written.
>
> The paragraph is kept above rather than edited, per this corpus's convention,
> because what it got wrong is worth seeing. **What it got right is the part the
> measurement rests on**: payment is per *occupied place*, walked as a list of
> entity ids, and a restore that dropped those edges would still show the right
> counts. The correction makes the paying source **stricter** than this record
> assumed. `OccupiedPlaceSource` (`income.ts:229`) declares
> `residentIdsWithExistingPlace` as its **only** member, and the comment above
> it records that `totalOccupancy` was deliberately removed because issue #585
> broke the identity between a resident count and an occupied place: *"a prison
> holding three prisoners above one bed has a `totalOccupancy` of 3 and one
> occupied place."*
>
> So the 1,120-before / 1,120-after result was measured against a source that
> checks the bed still exists, which is a harder thing to survive a reload than
> the one described. **No number in this record changes.** The prison was built
> with four beds for four prisoners, so the two notions coincide for it — which
> is also the limit, and it is promoted to a named UNKNOWN below.


So the last act is not an assertion about the load screen. It runs the restored
prison **past an in-game day boundary** and reads what was actually credited.

## What was played

A 6x6 enclosed cell at tiles (12,12)–(17,17) with **4 beds** and one toilet,
built with the mouse through the real command path, **4 prisoners** admitted,
**1 guard** hired. Then: run to the first day boundary, save, navigate away for
real, come back, load, and run to the second day boundary.

## The answer: it survives, and it still earns exactly the same

```
FIRST DAY BOUNDARY at 4800:   treasury delta = 1120
  last before: {"tick":4793,"prisoners":4,"rooms":1,"roomCapacity":4,
                "accommodationCapacity":4,"roomOccupants":4,
                "treasuryMinorUnits":22130,
                "stateIncomeAccruedTodayMinorUnits":1197,
                "dailyWageBillMinorUnits":80,"staff":1}
  first after: {"tick":4834,...,"treasuryMinorUnits":23250,...}

RESTORE DIFF: none of the compared fields moved

SECOND DAY BOUNDARY at 7200:  treasury delta = 1120
  last before: {"tick":7183,...,"treasuryMinorUnits":23250,
                "stateIncomeAccruedTodayMinorUnits":1192,...}
  first after: {"tick":7224,...,"treasuryMinorUnits":24370,...}

VERDICT: earned 1120 before the reload and 1120 after it
```

The nine compared fields — `prisoners`, `prisonersInIntake`, `rooms`,
`roomCapacity`, `accommodationCapacity`, `roomOccupants`, `treasuryMinorUnits`,
`staff`, `dailyWageBillMinorUnits` — are **identical across the reload**, and
the restored prison credits **the same 1,120 minor units** at its next day
boundary as the original did at its last.

**The arithmetic checks out against the source rather than being taken on
trust.** 4 residents x `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` (300) = 1,200
gross; minus a `dailyWageBillMinorUnits` of 80 for one guard = **1,120 net**.
Both boundaries agree, and the accrual reading just before each (1,197 and 1,192
at ticks 12 and 17 short of the boundary) extrapolates to 1,200 at the boundary
itself.

**This is a negative result and it is worth its minutes.** The class it rules
out — a prison that loads looking whole and then earns nothing — is invisible to
every count-based check, is exactly what a player would report as *"my prison
stopped making money and I don't know why"*, and is the single most expensive
thing that could be wrong with a save.

## What the restore banner claims, and that it is accurate

The load reports, on screen:

> Restored: kernel tick and command queue, RNG stream states, world terrain and
> ownership, construction orders and undo/redo, entity id liveness, prisoners,
> needs, actions and cell assignments, jobs, containers and utility networks,
> doors, security sectors, guards and patrols, contraband, intelligence and
> searches, incidents, gangs and tunnels, prisoner and staff names. **Not
> carried by this save version:** room and topology caches (recomputed from the
> world), navigation caches and in-flight path requests (re-issued on the next
> tick).

Both exclusions are consistent with what was measured: the room count and
capacities come back correct because they are *recomputed from the world*, and
nothing about a dropped path request showed up in a day of subsequent play.
This is a good banner — it states its own limits, in a place the player sees.

## Two things that looked like defects and are not

Both are recorded because the next person will see them and reach for the same
conclusion.

**1. `New Prison (3 gen)` beside `Saved (generation gen-mtffpbdy-4)`.** The list
label and the status line disagree — 3 against 4 — and that reads like an
off-by-one. It is not. `(N gen)` is the count of *retained readable*
generations, from `readableGenerationIds`
(`src/persistence/local/generation-policy.ts:105`), which filters out
quarantined ids; `gen-…-4` is the identifier of the save just written, kept as a
stable string *"so a player reporting a problem can name the exact save"*
(`src/ui/save-panel.ts:75`). Two correct answers to different questions.

**2. `.hud-overview: ABSENT`.** The script asked for a panel that does not
exist. There is no `hud-overview` class anywhere in `src/ui/hud/`; the Overview
tab shows the **intake** panel — `intakePanel.setVisible(state.activeTab ===
'overview')` (`src/ui/hud/hud.ts:1724`). A harness error, not a missing panel.
It is left in the script's output rather than silently corrected, because #569's
retraction records the same shape of mistake in the other direction — a survey
that enumerates known regions cannot find what sits outside them — and a
selector that says ABSENT is doing its job by saying so.

## The trap that silently degraded the first run

**The first run of this playtest lost every actor sprite, and passed.**

```
Failed to process file: image "/assets/actors/actor.guard.base.idle.png"
World renderer: Error: Atlas image "…actor.cook.base.idle.png" did not load.
  at registerAtlasTextures (src/rendering/phaser/atlas-textures.ts:26)
  at async WorldScene.loadActorAtlases (src/rendering/scene/world-scene.ts:917)
World renderer: InvalidStateError: The source image could not be decoded.
```

All ten actor atlases, both idle and walk, for cook / guard / medic / prisoner /
staff. The cause is not in the product:

```
$ file public/assets/actors/actor.guard.base.idle.png     # in the worktree
ASCII text
$ head -1 public/assets/actors/actor.guard.base.idle.png
version https://git-lfs.github.com/spec/v1
$ file /workspace/lockstate/public/…/actor.guard.base.idle.png   # main checkout
PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced
```

**`git worktree add` does not run the Git LFS smudge filter**, so a worktree
gets pointer files where the main checkout has images. The session-start hook
reports *"Git LFS content looks present"* — true of the checkout it looked at,
and false of every worktree made from it.

`git lfs checkout` in the worktree fixes it (62 objects, 93 MB), and the run was
repeated with the art present: **zero atlas errors, and every number in this
record reproduced exactly.** Both runs are reported rather than only the clean
one, because the failure mode is the point — **a playtest in a worktree renders
no actors and still passes**, since the simulation lives in the worker and does
not care whether anything was drawn. A rendering finding measured in a worktree
would be worthless and would not announce itself.

This is now written down in `docs/AGENT_WORKFLOW.md` beside the
`ERR_PNPM_UNSAFE_MODULES_DIR` trap it rhymes with.

## What this does NOT establish

**UNKNOWN: whether a prison built by a *player* survives as well as one built by
this script.** The script builds by the informed route — buy bricks, run the
clock, lay four wall runs, *then* zone — which is the route
[#569](https://github.com/matmaxalez/lockstate/issues/569)'s retraction names as
the still-unexplained difficulty: *"nothing on screen states that order"*. A
prison built some other way might carry state this one does not. What would
settle it: the same measurement on a prison built by the naive route, once that
route is known to work at all.

**UNKNOWN, promoted here by the correction above: whether a prison whose
occupied places and residents DISAGREE survives a reload.** Payment walks
`residentIdsWithExistingPlace()`; the status strip's `roomOccupants` counts
something else, and reaches nobody (issue #609). This playtest used four beds
for four prisoners, so every notion of "occupant" coincided and nothing could
have come apart. What would settle it: the same day-boundary measurement on a
prison with more residents than beds — admit twelve against three beds, save,
reload, and read what is credited. If a restore rebuilds residency from the
world but not the bed check, such a prison pays the exploit rate after a reload
and the correct rate before it, and no count on screen would say so.

Also not reached: more than one room; prisons with unmet needs at the boundary
(`stateIncomeAccruedTodayMinorUnits` never fell below the 300/prisoner rate
here, so the unmet-need reduction was never exercised across a restore);
Import/Export; more than one reload; a save made *during* construction rather
than after it.

## The weakest claim

**That "the compared fields did not move" means the restore is complete.** Nine
fields are nine fields. What makes this stronger than a field comparison is the
day-boundary credit, which is a *derived* quantity that walks the residency
edges — so it fails if those edges are wrong even when every count is right.
That is one derived quantity, not all of them. A restore defect in something no
counter reads, and that does not reach income, would still pass this playtest
silently.
