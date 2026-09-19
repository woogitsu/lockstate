# What a reload keeps, and what it says: the contraband sentence, the coverage census, and the exclusions list walked against a player

**Date:** 2026-08-31
**Branch:** `fix/restore-what-a-reload-says`, cut from `origin/main` at **v0.0.295**
(`c6cd3e3`).
**Question:** the playtest record *"the alerts log was opened, and every sentence in it is
cut to thirteen characters"* (2026-08-31, on the unmerged branch
`playtest/play-the-twelve`, so it is cited by title rather than by path here and
below) §13 recorded two things about a reload, both by playing and neither diagnosed.
A restored prison came back with **`2 CONTRABAND`** and nothing anywhere saying
what the two were, and it came back reading **`0 COVERAGE` under a green
`Covered` badge** on a twelve-prisoner prison. Are either of those defects, and
if so where do they live? And, since the answer to both turns on
`docs/PERSISTENCE.md`'s *"What is deliberately excluded from the payload"*: does
that list still hold when it is walked against **what a player sees after a
reload** rather than against the schema?

**Method.** Headless, through the real save boundary every time —
`captureSessionSnapshot` → `createSaveEnvelope` (Zod + checksum) →
`JSON.parse(JSON.stringify(...))`, the round trip an IndexedDB write performs →
`decodeSaveEnvelope` as a payload of unknown provenance →
`restoreSimulationRuntime`. Nothing here was measured by driving a browser: the
playtest above already did that, and this pass exists to say what its two
screenshots mean.

## Claim tiers

- **MEASURED** — this pass ran it and the output is quoted.
- **VERIFIED, read** — the file was opened at the line cited and quoted.
- **REASONED** — follows from two of the above, and says which.
- **UNKNOWN** — could not be established, and named as such.

---

## Summary

| | verdict |
| --- | --- |
| **Finding 2 — `0 COVERAGE` under `Covered`** | **Reproduces. A defect, and it was in the restore path.** Fixed on this branch: the coverage census is derived state that was re-derived on the system's first scheduled update, and a restored session is paused, so there is no first update until the player presses play. |
| **Finding 1 — a reload restores every figure and no sentence** | **Not a persistence defect, and the exclusion has not become wrong.** The chip's *name* for a single find survives a reload unchanged — measured. What the playtest met is the projection deliberately refusing to name two categories with one word, which it did **before** the save as well. The real gap is that the confiscation ledger is fully persisted, fully projected on `hud/contraband`, and **has no panel** — before or after a reload alike. |
| **The exclusions list, walked** | Nine entries. **One was missing from the list entirely** (the coverage census, now added and fixed); **one costs a player a wrong word on two panels** (a guard mid-journey comes back labelled *on post*); one is a benefit rather than a cost. The rest are invisible. |

---

# Part A — finding 2: `0 COVERAGE` under a green `Covered`

## A.1 It reproduces, headlessly, on the first attempt

**MEASURED.** The shared determinism scenario (`tests/helpers/determinism-scenario.ts`),
advanced 400 ticks, then taken through the save boundary above and projected with
`projectStatusCounts`:

```
BEFORE { prisoners: 4, covered: 4, understaffed: 0, unguarded: 0 }
AFTER  { prisoners: 4, covered: 0, understaffed: 0, unguarded: 0 }
```

Four prisoners standing on a covered rung before the save; four prisoners and an
empty census after the load. The playtest's twelve-prisoner screenshot is this,
at three times the population.

## A.2 The two readouts do **not** disagree, and that matters for where the fix goes

The brief that commissioned this pass framed the finding as *"two readouts of the
same fact disagree on screen"*. They do not, and the distinction is the whole of
where the fault lives.

**VERIFIED, read.** `src/ui/hud/projection.ts:471` sets the chip's number to
`counts.prisonersCovered`, and `:473-474` sets its tone and badge from
`coverageTone(counts)` / `coverageBadge(counts)`, both of which read the *same*
three fields of the *same* counts object. `coverageTone` returns `undefined`
when neither `prisonersUnguarded` nor `prisonersUnderstaffed` is positive, and
`coverageBadge` then prints `securityCoverageMet` — the word *Covered* — with
tone `success`.

**REASONED, from that.** `0 / 0 / 0` is exactly what an **empty prison** looks
like, and *Covered* is the right word for an empty prison; the projection's own
docblock says so — *"It is also what an empty prison reads, which is correct for
the same reason it is correct on the panel: a prison with nobody in a sector has
all the coverage it needs."* So the projection is not lying about its input. Its
input is wrong.

**This also means the fix the playtest floated — "0 covered with prisoners
present is not `Covered`" — would have been the wrong instrument**, and would
have made the strip worse: `0 / 0 / 0` with prisoners present is legitimately
reachable in a running session, because the three rungs sum to the prisoners
standing *in a sector* and a prisoner in transit is in none of them (the same
docblock, at `:461-467`). A rule keyed on "prisoners exist" would go amber on
every busy intake.

## A.3 Where it actually lives

**VERIFIED, read.** `src/simulation/prisoners/safety-coverage-system.ts` holds
the census in a field and hands it back by reference — a deliberate choice, and
a good one: the strip is projected on every publication and re-walking the
population per read would pay `resolveOccupants` again for an answer the system
already has. The field is filled by `update`, which is scheduled at
`intervalTicks: 10`.

**VERIFIED, read.** `src/simulation/worker/state-machine.ts`, at the end of
`handleInitialize`: the machine constructs `new FixedStepClock(50, { mode:
'paused' })`, transitions to `paused`, posts `simulation/ready`, and then calls
`this.publishStatusCounts(this.performanceNow())` under a comment saying exactly
why — *"A restored session arrives `paused`, so the tick loop is not running and
the next publication would otherwise wait for the player to press play — leaving
a prison that has a population on screen as the same row of zeros this channel
exists to remove."*

**REASONED, from those two.** The publication that comment exists to make honest
is the one that carries the dishonest number. The census's staleness bound was
documented as *"ten ticks, which is the same staleness every other ten-tick
cadence in the kernel carries"* — true of a running session and false of the one
place it was written about. Nothing steps the kernel after a load until the
player presses play, so ten ticks is however long they leave it: a prison with
twelve people in a guarded sector reads `0 COVERAGE`, and the badge above it says
the prison is fine.

## A.4 The fix, and why it changes no contract

`restoreSimulationRuntime` now calls `SafetyCoverageSystem.takeCensus(runtime.kernel.tick)`
after every population is in place.

- **Nothing is added to the payload and `SAVE_SCHEMA_VERSION` does not move.**
  The census stays *derived* — `docs/PERSISTENCE.md`'s rule is unchanged. What
  moves is *when* the derivation happens, from "the first scheduled update" to
  "the load itself". That is `IncidentResponseSystem`'s shape under ADR 0033: a
  repair recomputed from the payload on every load, so a player who dislikes the
  outcome still has the file they had.
- **`takeCensus` is `update`'s own loop at zero elapsed ticks**, extracted as a
  private `walk(tick, ticksElapsed)`, so there is still exactly one place that
  decides which rung a prisoner is standing on — the property the type's own
  docblock asks for (*"a second pass to count what the first pass just decided
  would be a second chance to disagree with it"*).
- **It provisions nobody.** `provisionSafety` is exactly linear in
  `ticksElapsed`, so at zero every `setScaled` writes back the level it read.
  MEASURED, and it is a guard rather than an assumption — see A.5.
- **Determinism is untouched.** The census appears in no snapshot, no save field
  and no state hash: `grep -n "safetyCoverage\|census" tests/helpers/determinism-state.ts
  src/simulation/determinism/*.ts` returns nothing.

## A.5 Red-then-green, and one mutation that survived

| control | result |
| --- | --- |
| new integration case against the unfixed tree | **red**, `AssertionError: expected +0 to be 4` |
| the same case, fixed | **green**, `16 passed` |
| delete the `takeCensus` call at the restore site | **red**, the same case |
| hand `takeCensus` the system's own `intervalTicks` instead of `0` | **red**, `expected 25660 to be 25500` — 160 is `0.08 × 200 × 10`, ten ticks of provisioning nobody lived through |
| `walk(0, 0)` instead of `walk(tick, 0)` inside `takeCensus` | **red**, `expected [ +0 ] to deeply equal [ 7000 ]` |
| **pass `0` instead of `runtime.kernel.tick` at the call site** | **SURVIVED** |

Two of those are worth reading rather than counting.

**The `intervalTicks` mutant survived the first version of its own guard.** A
covered prison sits clamped at `NEED_MAX_SCALED`, and `provisionSafety` clamps,
so ten ticks of spurious provisioning is invisible there. The test now puts every
prisoner at half the range before the save, and the comment beside that line says
this is the whole test.

**The surviving mutant is unkillable on this fixture, by construction, and that
is a fact about the fixture.** The tick only reaches the report through
`resolveRequiredGuardCount(schedule, tick)`
(`src/simulation/security/deployment-system.ts:102-105`), and every schedule in
`tests/helpers/determinism-scenario.ts:177` is a `constantDeploymentSchedule` —
so no tick in that prison reports different coverage from any other. The unit
case *"asks the deployment report about the tick it was given"* pins the
parameter's meaning with a tick-sensitive stub; nothing pins the argument. What
would close it is an integration fixture with a schedule whose blocks differ
across the day, saved at a tick in a different block from 0.

---

# Part B — finding 1: what a reload keeps about contraband, and what it says

## B.1 What is persisted, against what is shown

**MEASURED**, same save boundary, on a prison carrying one search-discovered
item (`item-a`, `contraband.drug`, found at tick 20 by the scenario's own search)
and one hand-recorded confiscation added by this pass:

| the fact | before the save | after the load |
| --- | --- | --- |
| `SearchSystem.getMetrics().itemsDiscovered` — the number the chip prints | `1` | `1` |
| `ConfiscationLedger.all()` — item id, category, tick, provenance, holder, finding guard | `[['item-a','contraband.drug',20]]` | identical |
| `ContrabandRegistry.all()` — each item's `'concealed'` / `'confiscated'` state | 4 items, 1 confiscated | identical |
| `projectStatusCounts(...).contrabandDiscovered` — the chip | `1` | `1` |
| **`projectStatusCounts(...).contrabandNameKey` — the chip's badge, the word `Drug`** | `'contraband.drug.name'` | **`'contraband.drug.name'`** |
| `SimulationEventLog.count` — the sentences | `1` | `0` |

The row in bold is the one that decides this finding, and it is the row the
playtest could not have taken: **the name survives the reload.** A restored
prison that found one phone still says *Phone*, on a chip that is on screen with
nothing opened. #703 ruling 13's *"a found phone stops being the character `1`"*
is kept across a save.

## B.2 So what did the playtest see?

**VERIFIED, read.** `soleDiscoveredContrabandNameKey`
(`src/simulation/presentation/status-strip-projection.ts:594-602`) returns
nothing in three cases, and its docblock names them: an empty ledger; a ledger
whose length disagrees with `itemsDiscovered`; and **several categories**, on the
ground that *"One word cannot describe a phone and a weapon, and choosing one
would be a claim about the other."*

**VERIFIED, quoted from the playtest.** Act 2's prison found *two* items of
*two* kinds — `Contraband found: Tool.` and `Contraband found: Currency.` — and
that record's §2 measures the chip **before** any save: *"With two finds of two
different kinds it read `2 CONTRABAND` with **no** badge (act 2) — the projection
withholds the name when the count covers more than one item, which
`src/ui/hud/projection.ts` argues at length and which is the right answer."*

**REASONED, from those two.** The `2 CONTRABAND` with nothing beside it that §13
met after the reload is the same `2 CONTRABAND` with nothing beside it that §2
met before it. **The reload did not take the name away; the projection had
already, deliberately, declined to give one.**

## B.3 What the reload did take, and whether the exclusion that takes it is wrong

It took the two alert rows. `docs/PERSISTENCE.md` excludes `SimulationEventLog`
and argues `contraband.discovered` specifically, *"on the relocation notice's
terms rather than the arrears'"*: the **outcome** is what the save carries, so a
restored prison has nothing to re-announce.

**That argument is measured true by the table in B.1**, and it is stronger than
the doc claims. The outcome persists; so does the ledger of evidence; so does the
count; **and so does the name on the chip**. There is no fact in the lost
sentence that the save does not still hold.

**So the exclusion is not a defect and has not become wrong.** Both of the fixes
a reader might reach for are worse than the state of the tree:

- **Snapshotting the log** would have a loaded prison announce a confiscation
  that already happened — the exact thing the entry, and ADR 0076's relocation
  notice before it, exists to refuse. There is also no dismissal on that channel.
- **Synthesising a row at load from the ledger** is authoring a player-facing
  sentence, which is `AGENTS.md`'s fourth exclusion, *and* it is a worse sentence
  than the one it replaces: a present-tense report of a past tick.

## B.4 The gap that is actually there, and it is not persistence

**The durable answer to "what were the two?" is not missing from the save. It is
missing from the screen — and it was missing before the reload too.**

**VERIFIED, read.** `projectContraband`
(`src/simulation/presentation/contraband-projection.ts`) turns exactly the
persisted ledger into a `discovered` list carrying each find's category, holder,
provenance and tick. It is wired: `PROJECTION_CATALOG['hud/contraband']`
(`src/simulation/worker/projection-catalog.ts:389`) answers it from
`runtime.confiscations` with a comment insisting on `all()` and never `drain()`.

**MEASURED.** `grep -o "'hud/[a-z-]*'" over `src/ui/` and `src/main.ts` returns
nine ids, and `hud/contraband` is not among them. This is not a passing
observation — it is a **gated** fact:
`tests/foundation/projection-reachability-contract.test.ts:324-325` pins
`'hud/contraband': 'No reader. …'`, and that gate is written to fail in both
directions, so the entry cannot go stale once a reader appears.
`src/simulation/contraband/confiscation.ts:31` says the same thing in its own
words: the projection *"has a route and no panel yet"*.

**REASONED.** A player who reloads and asks what the two items were is in
exactly the position of a player who never reloads and asks the same question one
in-game day later, once the two alert rows have scrolled or been forgotten. The
sentence was never the durable surface. The durable surface is a panel over the
confiscation ledger, and there is no such panel.

And the transient surface is worse than "transient": the same playtest's §1
measures an alert row's label at `labelScrollWidth: 538` against
`labelClientWidth: 88`, identical at 1280×800 and 1920×1080 — so
`Contraband found: Tool.` reached the player as `Contraband f...` **before** the
reload as well.

## B.5 Verdict, in the brief's own three options

**Not a defect; not a deliberate exclusion that has become wrong.** The third
option — *a decision that is genuinely absent* — is the closest, but it is not
absent in a way an ADR closes, and filing one would be filing the wrong
instrument:

- the architectural decision (*is the event log snapshotted?*) is **taken**, is
  written down in two places, and this pass measured its stated premise and found
  it true;
- what is missing is a **panel** — a scheduled piece of work whose blocker is
  already recorded (`UNPAINTED_PROJECTION_IDS`, and behind it
  `AWAITING_CONSUMER['selection.primary']`) — and whose content is player-facing
  copy, which `AGENTS.md`'s fourth exclusion reserves to the owner.

**The one thing worth putting to the owner**, stated as a question rather than a
proposal, because the answer is copy: *the chip names a single find and keeps
that name across a reload; it deliberately says nothing when two kinds have been
found. Is the multi-kind case a case the chip should answer at all, or the case
that is waiting for the contraband panel?* Nothing in this repository can decide
that.

---

# Part C — the exclusions list, walked against a player rather than a schema

`docs/PERSISTENCE.md`'s *"What is deliberately excluded from the payload"* is the
contract. Walked entry by entry, asking only two questions: **would a player be
surprised, and would they be misled?**

| exclusion | surprised? | misled? | evidence |
| --- | --- | --- | --- |
| Topology geometry | no | no | no readout; recomputed from the world |
| **Navigation caches and the pending path-request queue** | **yes, mildly** | **yes, in one word** | MEASURED, see C.1 |
| `IncidentResponseSystem` (reconciled and re-dispatched, ADR 0033) | no | no | its cost is `respondersDispatched` counting twice, and MEASURED: `grep -rn "respondersDispatched" src/ui/` returns nothing. There is no incidents panel — `ls src/ui/hud/` is build, intake, regime, rooms, staff, status-strip |
| Per-system `requestSequence` counters | no | no | mint names for requests nothing can reference after a load |
| `JobSystem.performingSince` | no | no | bounded at 5 ticks, and already measured in `tests/determinism/job-performing-restart-bound.test.ts` |
| `EntityQuery`'s `ComponentBitset` | no | no | re-derived from the ledger |
| Generic per-component entity state | no | no | nothing attaches prototype components |
| **`RefusalLog`** | no | no — **and it is a benefit** | see C.3 |
| **`SimulationEventLog`** | see Part B | no | Part B |
| Storage backend, compression, encryption | no | no | out of scope per #18 |
| **the coverage census — was not on the list at all** | **yes** | **yes** | Part A; now on the list |

Plus one that lives outside this heading and is worth carrying here because a
player meets it: **`admittedCount`**, which
`src/simulation/prisoners/prisoner-operations-runtime.ts:299-311` documents as
observability-only.

## C.1 A guard who was walking comes back *on post*

**MEASURED**, by projecting **every** route in `PROJECTION_CATALOG` on the same
runtime before and after a reload and diffing the two view models field by field.
Six routes were identical. Four were not:

```
[hud/held-guards]  .view.held.rows[0].deploymentPhase: "travelling" -> "on-post"
[hud/staff]        .view.roster.rows[0].assignment.deploymentPhase: "travelling" -> "on-post"
[hud/staff]        .view.roster.rows[0].assignment.patrolWaypointIndex: -1 -> (absent)
[hud/staff]        .view.countsByDeploymentPhase[travelling].count: 1 -> 0
[hud/staff]        .view.countsByDeploymentPhase[on-post].count:    2 -> 3
[hud/security]     .view.sectors[0].patrol.patrollingGuardCount: 1 -> 0
[hud/security]     .view.sectors[0].staffing.onPost:    0 -> 1
[hud/security]     .view.sectors[0].staffing.travelling: 1 -> 0
[hud/prisoner-roster] .view.everAdmitted: true -> false
```

**VERIFIED, read.** This is the navigation exclusion working exactly as
documented. `GuardRoster.loadSnapshot`
(`src/simulation/security/guard-roster.ts:225-241`) drops a `'travelling'`
guard's dead path request and puts them back to `'on-post'` if they have a sector
— *"exactly like `PrisonerOperationsRuntime` and `JobBoard` reset stale in-flight
travel on restore"* — and `PatrolSystem` restarts the loop from wherever the
guard's tile actually is.

**REASONED, and this is the part the doc does not say.** The reset is right; the
**word** is not quite. `hud/staff` and `hud/held-guards` are both read by the UI
(`src/ui/simulation-staff-coverage.ts`, `src/ui/simulation-held-guards.ts`), so
a player who saves while a guard is crossing the yard reloads to a Staff panel
that says that guard is **on post** while they are standing wherever they had got
to. Coverage is not affected — `assignedGuardCountFor` already counted a
travelling guard — so nothing downstream is wrong; what is wrong is one word on a
row.

**Not fixed here, and the reason is that the honest alternatives are all worse
than the word.** Keeping `'travelling'` means keeping a phase whose path request
no longer exists; adding a fourth phase for "assigned, position unverified" is a
new enum member with a new player-facing label, which is `AGENTS.md`'s fourth
exclusion. **Handed over as a question about copy, not a defect to fix.**

> **Answered, 2026-08-31, owner's ruling 24 — and the paragraph above is kept
> as written rather than edited, because it is what was true when this record
> was taken.** The owner supplied the word: **Returning**. Two of the three
> options this paragraph weighed were the ones on the table and the third was
> not seen: the word is *derived at projection time* from the state the restore
> already leaves behind — phase `'on-post'`, tile not the sector's post tile —
> so no enum member is added, nothing new is persisted, and the fourth
> exclusion is discharged by the owner naming the label rather than by an agent
> drafting one. `src/simulation/security/deployment-phase.ts` carries the
> reasoning; `docs/SECURITY.md`'s *A guard restored halfway to its post* is the
> permanent home.
>
> Two corrections to the sentences above fall out of implementing it:
>
> - *"Coverage is not affected"* stands, and is now pinned by a test rather
>   than by a reading: a returning guard still counts toward its sector, which
>   is what it did as `'on-post'`. The **weakest claim** named at the foot of
>   this record — that nothing drove a restored session forward to see whether
>   a tile-sensitive reader would disagree with the phase label — was the right
>   thing to be uneasy about. Driven forward, it did: in a sector with **no**
>   patrol route, which since ADR 0036 is every session a player can start,
>   nothing in `src/` ever moved the restored guard again, so it stood in that
>   corridor counted as on post for the rest of the session.
>   `DeploymentSystem.walkBackToPost` now walks it home.
> - *"`patrollingGuardCount: 1 → 0` … reaches nobody"* is still true, and so is
>   the same record's note that `hud/security`'s `staffing.onPost` has no
>   reader (`grep -rn "onPost" src/` finds it only inside
>   `security-projection.ts`). That tally still counts a returning guard as
>   on post. It is left alone deliberately — a view model nothing renders is
>   not a lie a player is told — and whoever gives the Security panel that
>   block should take the same derivation with it.

`patrollingGuardCount: 1 → 0` on `hud/security` is the same reset seen from the
other side and reaches nobody: that route has no reader either.

## C.2 `everAdmitted` comes back false, and on a populated prison nobody sees it

**MEASURED**, above: `true → false`, exactly the case
`prisoner-operations-runtime.ts:299-311` predicts in its own words and the
playtest confirmed by play.

**VERIFIED, read, and this bounds it.** `src/ui/hud/regime-panel.ts:647` is
`rosterEmpty.hidden = shown.length > 0 || roster.everAdmitted;` — so the *"Nobody
has been admitted yet"* box is hidden whenever any row is drawn. On the twelve-
prisoner prison the playtest reloaded, the false flag reaches no pixel. It
reaches one only on a prison that **is empty now and was populated once**, which
is the case the source comment already names. **Surprising: no. Misleading: not
in the state a player is likely to be in.**

## C.3 The refusal log's exclusion is currently a feature

**REASONED**, from the same playtest's §9: a single mis-clicked *Remove* on an
empty tile pins *"Nothing was removed — there is no object on that tile, and none
being built there."* across the top of the world, and `clearRefusal` runs only
when the same action kind next succeeds — measured still standing at tick 33,300.
`RefusalLog` is not snapshotted, and a reload resets the page, so **a reload is
presently the only way a player has to clear that band.** Recorded so that
whoever fixes §9 knows this exclusion is holding a door open, and does not close
it by accident.

---

# Part D — what this pass did not reach

- **No browser run.** Another agent holds Playwright. Everything above is
  headless, and the two screenshots this pass explains were taken by the
  playtest, not by it. The browser assertion that would pin finding 2 end to end
  is written in the report accompanying this record and was **not** executed.
- **UNKNOWN: whether the guard-phase word in C.1 costs a player anything in
  practice.** It is a one-word difference on a panel row, and no measurement here
  says how often a save is taken with a guard in transit.
- **UNKNOWN: the multi-category chip question in B.5.** It is copy.
- **Not attempted:** an integration fixture with a time-varying security schedule,
  which is what the surviving mutant in A.5 needs.

## The weakest claim in this record, and what would change my mind

**B.3's "there is no fact in the lost sentence that the save does not still
hold"** was the weakest claim when this record was drafted, and the measurement
that would have falsified it was cheap, so it was taken rather than left open.

The table in B.1 was taken on a prison with **one** search-discovered item, so
the badge it proves survives is the single-category badge. The case it did not
cover is two finds of the **same** category, where the surviving badge depends
on `soleDiscoveredContrabandNameKey`'s `records.length !== itemsDiscovered`
guard round-tripping rather than on the category test. **MEASURED**, same save
boundary, two `contraband.drug` finds:

```
BADGE before { n: 2, nameKey: 'contraband.drug.name', ledger: 2 }
BADGE after  { n: 2, nameKey: 'contraband.drug.name', ledger: 2 }
```

So the count and the ledger length round-trip together and the name survives a
two-item find as well. **The probe is honest about one impurity**: the second
find was staged by recording a confiscation and incrementing
`SearchSystem`'s private `itemsDiscovered`, rather than by getting a seeded
search to draw two detections of one category — so it proves the *save* carries
the pair, not that the *discovery path* always writes them together. The latter
is already asserted where it belongs, at `src/simulation/contraband/search-system.ts:428-447`,
whose comment states the ordering as the guard `soleDiscoveredContrabandNameKey`
depends on.

**The weakest claim that remains is C.1's "coverage is not affected".** It rests
on reading `assignedGuardCountFor`
(`src/simulation/security/deployment-system.ts:121-127`) counting any guard whose
phase is not `'unassigned'`, which makes `'travelling'` and `'on-post'`
interchangeable *for the coverage report* — and the projection sweep did show
`hud/security`'s `staffing.onPost` and `staffing.travelling` swapping without
`shortage` moving. What would change my mind is a case where `PatrolSystem`'s
restarted loop leaves a guard off their post tile long enough for a
tile-sensitive reader to disagree with the phase label; nothing in this pass
drove the restored session forward to look.
