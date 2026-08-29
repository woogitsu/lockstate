# ADR draft (unnumbered): Dismissing a staff member, and what an empty sector asks for

> **This draft deliberately carries no number.** `AGENTS.md`: *"A number is not
> reserved until it appears in `docs/adr/README.md`."* At the time of writing,
> `docs/adr/` on `origin/main` (`a6b262e`, v0.0.186) holds **0068** as its
> highest number and the index's **Next free number** line reads **0069** — so
> `max + 1` computed off disk is 0069. The integrator's brief said ADR 0069 had
> already landed; it has not landed on `origin/main`, and a branch that has not
> merged is invisible from the index, which is exactly the condition
> ADR 0065's and ADR 0066's drafts declined a number under.
>
> It is filed here rather than in `docs/adr/` because
> `tests/foundation/adr-numbering-contract.test.ts` requires the file, its row
> in `docs/adr/README.md` and a moved **Next free number** line **in one
> commit**; a placeholder id fails the filename check and a numbered file with
> no row fails the other two. So there is no such thing as an unnumbered ADR
> draft in `docs/adr/`, and this is the shape a draft can take.
>
> **This document pre-commits to renumbering without argument.** On being given
> a number it moves to `docs/adr/NNNN-...md` with its row and the index line in
> the same commit, `max + 1` re-derived from disk at that moment rather than
> taken from this paragraph, and every citation added by
> `agent/533-dismiss-staff` moves with it.

## Status

**Draft, 2026-08-29.** Decided under the owner's standing mandate (`AGENTS.md`,
"The owner's standing mandate"), and directed by the owner's decision on issue
#535 decision 4 and issue #533 — which asked for **both** halves explicitly and
rejected either alone. The implementation landed on `agent/533-dismiss-staff`
ahead of this document, for the reason ADR 0063 and ADR 0065 both give for the
same order: the defect is live rather than hypothetical, and this document is
what the branch should be judged against.

**Two things here are explicitly not decided.** The severance/refund *amount*
and the guards-per-prisoner ratio are balance and stay the owner's; decision 3
below takes the neutral option rather than choosing a figure. The four drafted
locale strings are flagged for the owner's review under `AGENTS.md`'s fourth
exclusion.

## Context

Measured by playing, on `origin/main` @ `a6b262e` (v0.0.186) and reproduced from the
branch's cut point:

- An empty prison — no prisoners, no rooms — reads `Guard coverage · 0 of 1 ·
  Unguarded` and `Nobody is on duty. Hire 1 to cover this population.` The
  population it names is zero.
- Obeying costs 80 minor units at the click (`StaffHiringService.hire`) **and**
  80 again at the next in-game day boundary (`PayrollSystem`), against an income
  of nothing.
- There is no way back. `src/simulation/staff/hiring.ts` says so in its own
  words — *"nothing in `src/` ever removes a staff member from it"* — and the
  protocol carries four `hire.*` refusals and no dismissal.
  `tests/foundation/unconsumed-command-contract.test.ts` measured thirteen
  declared commands, thirteen producers, none missing.
- `ReleaseGuardAssignment` exists and is not this: its own schema comment states
  *"Not a dismissal … firing destroys an entity, which is ADR 0026's subject and
  needs its own decision about id reuse."* ADR 0034 records the honest limit
  that makes a release insufficient — *"`DeploymentSystem` will re-assign a
  released guard on its next cycle if the sector is still short, so releasing a
  deployed guard is a re-shuffle rather than a dismissal."*

The requirement tracks at one guard per eight occupants with a floor of one
(`DEFAULT_SECTOR_PRISONERS_PER_GUARD`, ADR 0048 decision 3) — verified at
populations 0, 5 and 12.

Two defects, not one. The threshold makes a player walk into the trap by being
obedient; the missing command means they cannot walk out.

## Decision 1 — an empty sector requires nobody, where its occupant count is complete

`resolveOccupancyScaledGuardCount` answers `0` for a sector holding nobody. The
schedule floor of one is unchanged and returns with the first admission.

This **amends ADR 0048 decision 3's "it only ever raises"**, and the amendment is
marked in `sector-staffing.ts` rather than overwritten, per
`docs/AGENT_WORKFLOW.md` §4.

**Gated on `sectorOccupantCountIsComplete(sectorId)`, and today that is the
derived sector alone.** `resolveSectorOccupants` answers two questions under one
name (ADR 0048 decision 1): the derived sector's occupants are every prisoner on
owned land, and any *other* sector's are the prisoners standing on its single
post tile. That undercount is harmless while occupancy can only raise a
requirement — the authored schedule stands — and silently destructive if it can
lower one, because a scenario's `constantDeploymentSchedule('sector-a', 1)`
would go to zero unless somebody happened to be standing on one tile.

The first cut of this change did exactly that, and three scenario fixtures
caught it. It is recorded rather than quietly fixed because the general lesson
is reusable: **a fallback measure that is safe in one direction is not
automatically safe in the other.**

### Why not "do not show the requirement at all"

Because the panel already reads correctly. `describeStaffCoverage` maps
`required: 0` onto its `success` branch — authored for the save-carried
exemption case — so an empty prison now reads *Covered* using
`securityCoverageMetHint`, and **this half of the change adds no locale key at
all**. Hiding the block would have needed a new rendering rule and would have
removed a readout that starts mattering at the first admission; a block that
appears without warning is worse than one that says "nothing is required yet".

### What the floor's own argument survives

`DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` argues the floor from two facts,
and both are about a prison with people in it: a requirement of zero leaves
`DeploymentSystem` inert so no hire is visibly posted, and deployment and
incident response draw from one pool so a floor above one starves the responder
pool. A sector with no occupants has nothing to post a guard *against* and
produces no incident. `sampleSectorRisk` already reads `staffingShortfall` as
`0` whenever `required` is `0`, so this makes the risk term unreachable rather
than undefined.

### The visible consequence, stated rather than hidden

A guard hired into an empty prison now stays `'unassigned'` instead of standing
on a post. That is not a regression of issue #396's tier-inert defect and the
difference is checkable: the sector, the schedule and the watch entry are all
still registered, and a guard is posted the moment the prison holds anybody.
`tests/integration/staff-hiring-loop.test.ts` carries all three readings of that
line — #396's bug, ADR 0036's fix, and this — rather than overwriting them.

## Decision 2 — dismissal routes through the claimant, in a fixed order

`DismissStaff { staffId }` → `StaffDismissalService.dismiss` →
`GuardReleaseService` → `GuardRoster.forget` → `EntityStore.destroy`.

The order is the correctness argument, and it is `releasePrisoner`'s with one
step added at the front: liveness; **read the path request before anything can
clear it**; cancel the route (both `cancelRequest` and `clearResult`); release
the claim *through its claimant* where `claimOf` says there is one; contraband;
name; roster record; entity.

**Not `GuardRoster.unassign`, and not `GuardRoster.forget` alone.** ADR 0034
argues at length that unassigning without telling the claimant swaps a stuck
guard for a corrupt one — a search job still routing somebody, a response still
counting them toward `arrivedGuardIds`. All of that is true of somebody who has
been deleted, and sharper: the id names nobody.

**`claimOf` decides whether to call `release` at all**, because `'not-held'` is
the right answer to `ReleaseGuardAssignment` and the wrong shape here —
dismissing an idle guard is the ordinary case.

**The route cancel is the `ObjectPlacementService.remove` mistake avoided.**
`NavigationSystem.cancelRequest` had exactly one caller in all of `src/`
(`releasePrisoner`), so no guard's route had ever been cancelled by anything.
Without this step, one stranded request per travelling guard dismissed, for the
life of the session and — through the navigation snapshot — of the save.

**No `still-on-duty` refusal.** Dismissing a guard mid-patrol is the case a
player most wants, and a prison that could only sack idle staff would have
re-created the trap for anybody whose one guard is permanently posted.

## Decision 3 — a dismissal moves no money

Neither refund nor severance, and this is the neutral option rather than a
figure.

A hire pays one day's wage at the click and payroll bills the same figure again
at the day boundary, so a guard's first day costs two days' wage. A **refund**
would pay money back for a day already worked and would interact with that
double charge in a way nobody chose. A **severance** would take money from a
player whose entire reason for pressing this is that they have none — which is
the state #533 was measured in, 25,000 spent down to 0 with arrears accruing.

Both are balance, and balance is the owner's. What a dismissal ends is the
*future* payroll, which ends by itself the moment the roster no longer holds the
id — that is the mechanism, and it is the whole of what the player asked for.

Stated in `dismissal.ts` rather than left implicit, so a later balance pass has
something to disagree with — the practice
`DEFAULT_SECTOR_PRISONERS_PER_GUARD` already follows.

## Decision 4 — no save-format change, and no new refusal for ADR 0065 to catch

No `SAVE_SCHEMA_VERSION` bump, no migration, no new persisted field.

A dismissal writes no new *kind* of value. The guard roster's payload is an
`EncodedEntityStoreSnapshot` plus a list of `[EntityId, GuardRecord]` pairs; a
dismissal shortens the list and marks a slot dead in the ledger.
`entity-codec.ts` run-length encodes `generations` and `alive` in full and
writes the free list's live prefix verbatim, so a recycled staff index
round-trips at the same index under the same id.

- **A save written before this command**, loaded on this build: unchanged. There
  is no field to be absent.
- **A save written after it**, loaded on an older build: also unchanged.
  ADR 0038's rule is that a build refuses *a value it cannot interpret*, and a
  dead slot with a bumped generation is a value every build since the store was
  written interprets — and has interpreted for prisoners since #441.
  [ADR 0065](../adr/0065-what-happens-to-a-save-this-build-cannot-read.md)
  governs what happens when an older build *does* refuse a newer save; nothing
  here adds a refusal for that machinery to catch, which is the check that
  matters rather than a claim that quarantine would cope.

Verified by round-tripping a prison whose staff store has recycled an index, and
asserting the *same ids* come back rather than the same count.

## Decision 5 — entity ids: generation wrap is already answered, and retirement moves the real bug

This was flagged as the highest-risk part of the change. It is not, and the
reason is worth recording because it is a case of a hazard being retired by
someone else first.

`EntityStore` packs 20 index bits and 12 generation bits — 32 of 32, no spare —
so widening the generation field could only be paid for out of the index field
and would halve capacity. Before **ADR 0026 question 1's answer (#169)**, a
slot's 4,096th death wrapped its generation back to its first life's value and
put the index straight back on the free list, so the next `spawn()` produced an
id indistinguishable from a handle a caller might still hold. Adding the first
staff destroy path would have made that reachable for staff.

`EntityStore.destroy` now **retires** a slot dying at generation 4,095 instead of
recycling it. The id genuinely never comes back; there is no stale handle to
confuse with a live one; and nothing here has to touch the id format.

**What this change does newly reach is the other end of retirement, and it was a
real defect.** `StaffHiringService`'s `roster-full` gate compared
`allGuardIds().length` against `entityStore.capacity`, under a comment claiming
that reading "was already the one that survives a destroy path arriving here".
It was not: with retirement, a store can be out of indices while the headcount
sits below capacity, so the gate would have passed and `spawn()` would have
thrown `'EntityStore capacity exhausted'` out of the kernel's command handler —
a crashed tick on a command the worker had already acknowledged as queued, which
is precisely the failure that check exists to prevent. It is now
`EntityStore.canSpawn`, which is the question `spawn()` asks and which
`admitPrisoner`'s `population-full` refusal already used.

**Completeness is executable.** ADR 0026 question 2 asks *what mechanism keeps
the list complete*, not whether the list should exist.
`tests/unit/staff-dismissal-completeness.test.ts` is that mechanism for staff:
it walks the real session's object graph for a staff id forced to `(7 << 20) |
0`, dismisses, and requires nothing mentions it afterwards — ADR 0050's method
pointed at the other store, with the walk extracted to
`tests/helpers/entity-graph-walk.ts` so one implementation serves both
departures.

## Consequences

- **A guard hired into an empty prison stays unassigned.** Honest, and stated
  above.
- **`InformantRegistry` and `IntelligenceLedger` are string-keyed and cleared by
  neither departure path.** Reported rather than fixed: **neither has a producer
  anywhere in `src/`** — `recruit` and `report` are called only from tests — so
  no session can leak into them today. It is a real gap for whichever change
  gives them a producer first, and it predates this one. `ContrabandRegistry` is
  the third string-keyed store and *is* cleared, by name, in both paths.
- **The expanded height of the new roster block has not been measured.** There
  is no browser in the environment this was written in and
  `vitest.config.ts` is `environment: 'node'`. The block is *collapsed* on
  arrival, so the claim made — that the panel's arrival height is unchanged — is
  the one the collapse alone supports. The expanded fold is the browser job's to
  confirm.
- **Four locale strings are drafted and flagged**, and no more:
  `hud.alert.refusal.dismiss.unknown-staff` (forced — `REFUSAL_LABEL_KEYS` is a
  `Record` over a closed union, so the reason does not compile without one),
  `hud.security.roster`, `hud.security.roster-dismiss`,
  `hud.security.roster-hint`. The block reuses `hud.security.held-row`,
  `-row-unnamed` and `held-more`; that reuse costs a placeholder named `claim`
  being filled with a deployment phase, recorded in two places rather than
  papered over.
- **No confirmation step on an irreversible control.** There is no confirmation
  primitive in this repository and inventing a modal inside one panel would be a
  UI pattern decided in the wrong place. `hud.security.roster-hint` states the
  consequence beside the button. Worth proposing once a pattern exists.

## Open questions

1. **Should hiring and dismissal be undoable?** ADR 0025 left it open for
   hiring and ADR 0022 for zoning; `DismissStaff` carries no `transactionId` for
   the same reason and makes the question a third time. It should be answered
   once for all three.
2. **What happens to a *held* guard's share of a claim when several are
   dismissed at once?** Not reachable today — the control dismisses one row per
   press — but `SearchSystem` claims `policy.requiredGuardCount` guards for a
   job, and dismissing all of them leaves a job with no claimants. `SearchSystem`
   already tolerates that (the job stays queued), which is why this is a
   question and not a defect.
3. **`sectorOccupantCountIsComplete` returns `true` for one id.** The day a
   player can draw a sector with an extent, that sector's count becomes complete
   too, and this predicate is where that is said. Named so the next author finds
   it rather than re-deriving the asymmetry.

## Weakest claim, and what would change my mind

**That a dismissal leaves nothing behind.** The reflection gate is blunt by
design and cannot see a store keyed by a stringified id, a `WeakRef`, or a
typed array — the first of those is a real family with three members in this
codebase, and only one of the three is covered by a named assertion because only
one has a producer. Evidence that a staff id survives a dismissal in a store the
walk cannot reach would change my mind about the completeness claim, though not
about the ordering.

The second weakest is the **height** claim, which is why it is stated as the
narrow version above rather than the one I would like to make.
