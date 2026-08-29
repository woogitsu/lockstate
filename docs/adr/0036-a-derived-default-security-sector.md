# ADR 0036: A default security sector, derived from the world rather than authored

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation.** The owner did not
read this document. Shown #396's three options they chose the first, a *derived*
default sector, and when the design questions underneath it were put to them they
answered *"choose yourself"*. So this is a real approval of the judgement
delegated, and not of the text. A reader who disagrees with a decision below
should treat it as open rather than as settled by someone who weighed it.

What the owner did weigh, because it is the reason this exists: **nothing in
`src/` registered a security sector in a new session.** `securitySectors.register`
had one call site, inside the restore path, reading a save payload — so
deployment, patrol, incident response and contraband search were all inert in
every session a player could start, and ADR 0032's incident consequences with
them. The alternatives were a player-facing sector-drawing gesture (a large
feature that first needs a decision about what a sector *means* to a player) or
declaring the tier unshipped and saying so in the five documents that describe it
as working. The first option was chosen because it makes an entire tier reachable
without inventing a gesture nobody asked for.

**This is the answer to ADR 0034 decision 9**, which put that ship-or-not
judgement to the owner rather than deciding it.

This document answers [ADR 0034](./0034-releasing-a-claimed-guard.md)'s
**decision 9** — the ship/don't-ship judgement it put to the owner explicitly —
and its **open question 5**, *"What registers a security sector in a new
session? […] it needs a decision about where a sector comes from (zoned rooms?
an authored starting layout? a player gesture?) rather than an implementation."*
It is issue **#396**, which 0034's decision 9 point 3 asked for as its own issue
rather than fixed inside a gameplay-surface change.

0034 is Accepted (by delegation, 2026-08-26), so the surface it argued about
shipped and the blocker it named is this. Of #396's three options this takes
**option 1, deriving rather than authoring**: it is the smallest change that
makes an entire tier reachable, it needs no new player gesture, and the seam is
already there because a session's world knows what land it owns.

### The queue-entry debt, which is owed and quoted rather than paid

This document owes [`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 an entry and does
not have one. **That is a debt, not an exemption.** The brief this work was done
under names that file as one it may not touch, so the entry is quoted verbatim in
this branch's pull request instead, in the shape ADR 0032 set and 0033 and 0034
repeated. §2 already records that pattern as its own rule failing under
concurrency rather than as an author's oversight — it has now failed a fifth
time — and names the fix it needs (*"a file per entry in a directory, most
likely"*). Whoever next edits that file should paste the quoted entry in.

**Nothing in this change can be applied to a stored save.** If this document is
rejected the code comes out with it and no player's file has been altered: no
save-schema version moves, no migration exists, and the only thing a load does
differently is register a sector it derives from the world it just restored.

### The number

**0036**, and the check `docs/adr/README.md`'s stated next-free cannot make was
made rather than assumed. `mcp__github__list_pull_requests` at the time of
writing returns exactly **one** open pull request on this repository:

- **#355** (`fix/340-343-close-prison-id-oracles`) — its `docs/adr/` listing
  holds 0001–0029 with 0018 absent; it carries no ADR.

`origin/main` holds 0035 as its highest number (0035 merged with #395, and #397
accepted 0034 and 0035 by delegation), and the index's stated next-free is 0036.
**Nothing holds 0036.** `docs/adr/README.md`'s next-free moves to **0037** in
this commit, because `tests/foundation/adr-numbering-contract.test.ts` derives it
from the highest number on disk.

**And the pre-commitment, because three collisions this week say the enumeration
is correct and insufficient:** if a branch turns up holding 0036, *this* is the
document that renumbers. 0035 renumbered from 0034 on exactly this
pre-commitment; that is the habit and this document keeps it.

### What the evidence rests on

**Tier R — this repository, and nothing else.** Every figure below was measured
by executing this tree: real commands through the real command handler, the real
kernel, the real navigation system, the real intake pipeline and the real
incident log. `tests/integration/security-default-sector.test.ts` carries the
whole trace and `tests/unit/security-default-sector.test.ts` carries the
derivation rule. There is no external tier. The two product judgements — that a
prison is one sector until a player says otherwise, and that a session's one
sector asks for one guard — are named as such in decisions 1 and 3 and are the
owner's to make.

---

## Context

### The measurement, re-run rather than cited

Issue #396 reports one `grep`. It was re-run on this tree before anything was
written, because a finding this size is worth confirming and because the tree
moves:

```
$ grep -rn "securitySectors.register" src/
src/simulation/runtime/session-systems.ts:587:  for (const sector of systems.security.sectorDefinitions)
                                                  runtime.securitySectors.register({ ...sector });
```

One call site, inside `restoreSecuritySystems`, reading
`systems.security.sectorDefinitions` out of a save payload written at `:512`.
`grep -n "sectorDefinitions" src/simulation/runtime/new-session.ts` is empty.

So a session a player can start holds **zero** `SecuritySectorDefinition`s, and a
sector is what the tier hangs off: `DeploymentSystem.assignUnassignedGuards`
iterates `sectors.all()`, `PatrolSystem` walks a sector's `patrolRoute`,
`IncidentResponseSystem` reads `requireDefinition(incident.sectorId).postTile`
for a responder's destination and sets lockdown by sector id, `gangs.ts` resolves
territory by sector, and two projections read the registry.

### The part #396's `grep` cannot reach: it is three registries, not one

**This is the correction this document makes to the issue it closes, and it
matters because registering the sector alone would have looked like a fix and
changed nothing.** Two more collections are empty for the same reason and each of
them is independently sufficient to keep the tier dark:

| collection | what reads it | what an empty one does |
|---|---|---|
| `securitySectors` | four systems and two projections | `assignUnassignedGuards` iterates nothing |
| `securitySchedules` | `DeploymentSystem.requiredGuardCountFor` | answers `0` for a sector with no schedule, so `shortage <= 0` and nobody is posted |
| `incidentSectorIds` | `IncidentTriggerSystem.update` | samples nothing, so no incident is ever opened |

Measured on this tree with a sector registered and the other two left alone: a
guard hired through `HireStaff` stays `'unassigned'` for ever, and 40,000 ticks
of an overcrowded prison open no incident. A sector on its own is not a fix.

### Why the convention that caused this was right about content and wrong about reachability

`new-session.ts` says of this block: *"no sectors, no hired guards and no
deployment schedules until a session/scenario registers them (the same 'no
fabricated default content' convention as `containers`/`jobs`/`electricity`/
`water` above)"*. That convention is correct and has been since #19, and it is
what made this happen: **it is a rule about authored content that was silently
also deciding reachability.** An empty `ContainerRegistry` is honest — a prison
has no containers until somebody builds one. An empty sector registry is not the
same kind of statement, because a prison always *has* a place guards stand; the
game simply had no way to say where.

The distinction this document draws, and it is the whole of the argument for
option 1 over option 3: **a derived sector is not fabricated content.** It
carries no authored geometry, no name, no grade nobody chose, no patrol route
nobody drew. It is a function of the world.

## Decision

### 1. One sector, for the whole prison, derived — and the tier ships

`security-sector.prison`, registered by `applyDefaultSecuritySector`
(`src/simulation/security/default-sector.ts`) from `createNewSimulationRuntime`.

**One, not a taxonomy.** A second sector needs an answer to *what a sector means
to a player* — where its boundary is, who draws it, what a prisoner belongs to —
and every candidate answer is #396's option 2, a feature rather than a
registration. One sector for the whole prison is the smallest statement that is
also *true*: a prison with no zoned rooms and no doors genuinely is one
undifferentiated place, and calling it one sector says exactly that.

**Answering 0034 decision 9 in its own terms.** That decision offered the owner
two readings — ship a control for a state the game cannot reach, or take the
surface out. This takes neither: it makes the state reachable. 0034's tripwire in
`tests/browser/app-shell.spec.ts` fired in the sense that mattered (its stated
reason is false now and has been rewritten), and decision 8 of this document says
exactly what it now claims and what it no longer can.

### 2. The post tile is the middle of the first owned chunk, in canonical `(y, x)` order

`deriveDefaultSecuritySectorPostTile`: sort the world's owned chunks with
`compareChunkPositions` (`left.y - right.y || left.x - right.x`), take the first,
and answer the tile at `chunk * chunkSize + floor(chunkSize / 2)`. For a new
session — one owned chunk at (0,0), 32 tiles wide — that is **(16, 16)**.

**Derived from ownership, not from zoned rooms**, and that is the decision inside
the decision. Rooms are optional: a new prison has none, so a rule that read them
would need a fallback, which is two rules and a re-derivation trigger.
**Ownership is not optional** — a session owns chunk (0,0) and nothing in `src/`
un-owns a chunk — so one rule with no branches produces a total answer, which is
what "no sector" being unacceptable requires. (The function still answers for a
world that owns nothing, using the origin chunk, because a hand-edited save must
not be able to make the tier vanish.)

**(16, 16) is also `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, and the coincidence
is load-bearing three times over.** Both are "the middle of owned land", so:

1. **A hire is posted without a route request.** `beginDeployment`'s `sameTile`
   branch fires, so the first guard a player hires is `'on-post'` on the tick the
   command lands — measured, no navigation request at all.
2. **An arrival with nowhere to sleep is a sector occupant.**
   `resolveSectorOccupants` in `new-session.ts` counts prisoners standing exactly
   on the post tile, and `IntakeSystem` leaves an unhoused admission standing on
   the arrival tile. That is what puts `needsPressure` into `sampleSectorRisk`,
   and it is the reason a riot is reachable at all (decision 7).
3. **It is on owned, walkable ground.** Measured: dirt, and a route from (0,0)
   resolves.

**That third property is a fact about today's world and is not guaranteed.** A
player can build a wall on (16, 16). `continueDeploymentTravel` then counts a
`deploymentFailures` and returns the guard to the pool, retryable next cycle —
degradation rather than a crash, and honestly reported. It is listed as an open
question rather than defended.

### 3. Three registrations in one function, and the requirement is one guard

`applyDefaultSecuritySector` fills the sector registry, `securitySchedules` and
`incidentSectorIds`. **One function rather than three call sites**, for the
reason the Context section measures: two of the three are individually sufficient
to keep the tier inert, so a caller that could fill one and not the others is a
caller that can reproduce #396.

`DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT = 1`, all day, through
`constantDeploymentSchedule`. A **directional default, not a balance decision**,
in the sense `DEFAULT_SECTOR_RISK_POLICY` and `DEFAULT_NAVIGATION_SYSTEM_OPTIONS`
already use — but the reasoning is stated, because the number has a consequence
that is not about balance at all:

**`DeploymentSystem` and `IncidentResponseSystem` and `SearchSystem` draw from
one pool.** `claimableResponders` and `submitOrder` both read
`GuardRoster.unassignedGuardIds()`, and a guard `DeploymentSystem` has posted is
`'on-post'`. So a requirement of *n* means the first *n* guards a player hires
can never respond to anything and never search anything. Zero is the value that
needs no argument and is also the value that leaves `DeploymentSystem` inert, so
it is unavailable. **One is the smallest number that is not zero**, and at one the
first hire is visibly posted and every hire after it is claimable.

The cost is real and shows up immediately in this repository's own tests: eight
of #352's reproduction assertions and eight of ADR 0034's had to be told that
guard 0 is now spoken for (decision 9).

### 4. Derived once, never re-derived, and the id is a constant

The **post tile** is derived. The **id** is not: `security-sector.prison` is a
constant, because a sector id is written into incident records, guard records,
gang territory claims, `SectorRiskTracker` state and the save payload. An id that
moved with the world would strand every one of them, which is the hazard #337
records for un-zoning removing two rooms.

**And the derivation does not re-run when the player zones, unzones, or buys
land.** Three reasons, in order of weight:

1. **A sector id must not change under a live incident.** `IncidentResponseSystem`
   holds records keyed by incident id and reads `requireDefinition(sectorId)`
   through both `setControlState` and `incidentTile`; a sector that disappeared
   mid-response throws out of `Kernel.step()`. ADR 0033 had to add
   `liftLockdownNoOpenIncidentJustifies` for a milder version of exactly this.
2. **`SecuritySectorRegistry` has no un-register and no replace**, deliberately:
   it captures each governed door's baseline state at `register` time. Adding one
   is a decision about what happens to the sector's live control state and to
   anything naming it, and that decision is not this document's.
3. **Deriving from ownership rather than zoning means the input does not change
   under ordinary play anyway**, so the question is mostly moot today. It stops
   being moot the moment a parcel purchase exists, which is why it is decision 4
   rather than a footnote.

### 5. No doors, no patrol route — and both costs are stated rather than hidden

**`doorIds` is empty.** A sector's door set is its *perimeter*, and a perimeter is
the one thing a derivation cannot know. Three facts, each sufficient:

- A new session has no doors at all, so a door set derived at construction time
  would be empty whatever rule produced it.
- `register` captures each governed door's baseline state, and there is no way to
  adopt a door built later (decision 4 point 2).
- Governing *every* door would make a severity-6 riot lock the player's cell
  doors and whatever else they had built, in a prison with no perimeter for a
  lockdown to mean anything about.

**So a lockdown is a control state that cascades onto nothing.** Measured:
`setControlState(…, 'lockdown')` moves the state, the state reaches the save
payload and `projectSecurity`, and a door the player built stays exactly as it
was. That is the honest cost of a sector nobody drew, and **it is the strongest
argument in this document for #396's option 2** — a player-facing sector gesture
is what would supply a perimeter, and nothing else can.

**`patrolRoute` is absent**, so `PatrolSystem` remains a no-op. `sector.ts` states
that a sector may have static coverage with no route at all, a route is an
ordered loop of authored waypoints, and a derived loop would be a made-up path
across whatever the player happened to have built. Measured: a guard on post for
5,000 ticks walks no leg and every patrol metric stays zero.

### 6. Derived state is re-derived, not restored — which is why no save-schema version moves

**`SAVE_SCHEMA_VERSION` stays 5.** `src/persistence/save-schema.ts` is untouched,
no persisted field is added, no persisted shape moves, `tests/fixtures/persistence/`
is unchanged, and there is no migration. **V6 stays free**, which #337 wants and
#361 contends.

That falls out of purity rather than being arranged. `restoreSimulationRuntime`
builds its session through `createNewSimulationRuntime` — deliberately, so there
is one definition of how a session is assembled — and it hands in the restored
world. The derivation reads only that world. **So a restored session derives what
a live one derived, necessarily.** It is the same reading `restore-session.ts`
already takes of room geometry and navigation caches: state that is genuinely
derived is recomputed on load.

Three mechanical consequences, each of which had to be built:

- **The restore loop skips a sector id already registered.** `register` throws on
  a duplicate, and the runtime handed to `restoreSessionSystems` already holds the
  derived sector — so without this guard *every* save would fail to load. The
  payload's row for this sector is therefore never read. That is only sound while
  the two are the same definition, so it is asserted rather than assumed:
  `security-default-sector.test.ts` compares what a capture writes against what a
  restore derives. **Change the derivation rule and that assertion fails**, which
  is the forcing function this arrangement is worth having.
- **`applyDefaultSecuritySector` runs again at the end of the restore**, because
  steps 5 and 7 clear and refill `securitySchedules` and `incidentSectorIds` from
  the payload. Without the second call, loading a save written before this ADR
  would strip the requirement and the watch entry and the tier would go dark
  again on exactly the files players already have.
- **Anything the payload already carries wins.** The derivation is authoritative
  only where the payload is silent, so a session can hold a requirement for this
  sector other than the derived one and keep it across a save.

**Two things this costs, said plainly.**

1. **A save written before this ADR gains three entries when it is re-saved.**
   Loading it is a pure re-hydration; saving it again writes the sector, the
   schedule and the watch id. Nothing is lost and no version moves, but the file
   is not byte-identical to what it was, which is a property ADR 0033 valued.
2. **"Deliberately no schedule at all" cannot be expressed.** Silence is read as
   "derive it". A schedule asking for *zero* guards is an entry and does survive,
   which is what the test helper `withoutDefaultSectorDeploymentDemand` uses, but
   there is no way to say "this sector has no requirement and I mean it".

### 7. No command, no refusal, no locale key: this is not a player gesture

The derivation happens at composition time, so there is nothing to acknowledge,
nothing to refuse and nothing to say to anybody. No wire vocabulary is added, no
`Record` over a refusal union is widened, `src/ui/hud/**` gains no text and
`src/content/default-locale-en.ts` is untouched.

**Stated because its absence is a decision.** A player-facing sector would need
all four — the gesture, the versioned command, the worker-side validation and a
refusal reason from an exhaustive `Record` — and that is a large part of why #396's
option 2 is a feature rather than a registration. What a player *sees* change is
second-order: the Staff panel's `staffUnassigned` count now moves, and the
held-guards block ADR 0034 built now draws a row when a guard is hired.

### 8. The measurement: the whole tier, from the front door

`tests/integration/security-default-sector.test.ts`, real commands only — the
five a player can send today (`PurchaseMaterials`, `ZoneRoom`, `PlaceObject`,
`AdmitPrisoner`, `HireStaff`). The trace, measured on seed `0x396`:

| tick | what happened |
|---|---|
| 0 | one sector, one one-guard schedule, one watched id; coverage reports `required 1, assigned 0, shortage 1` |
| ~200 | a cell zoned, a plank bought, a bed standing |
| ~205 | three prisoners admitted for one bed; two stay unhoused at (16, 16), safety decaying |
| **15,600** | `incident.riot.1` opens in `security-sector.prison` — **severity 6**, participants `[1, 2]`, `needsPressure 0.604`, `staffingShortfall 1`, score `0.602` |
| 15,606 | five `HireStaff` commands at (0, 0); guard 0 begins travelling to the post |
| **15,621** | the riot is `'responding'`: guards 1, 2 and 3 claimed, walked from (0, 0), standing on (16, 16); sector `'lockdown'`; `respondersDispatched 3`, `routeFailures 0` |
| **15,681** | `resolved`, `injuredEntityIds: []`, `propertyDamage: 3`; sector back to `'normal'`; every responder back in the pool |

**What is now reachable in a session a player starts:** guard deployment
(including a real route from anywhere else on the map), sector coverage
reporting, sector risk sampling, riot triggering from real prisoner needs and
real understaffing, incident response with lockdown and containment, incident
resolution — and therefore ADR 0032's consequence tier, which reads the record a
closed incident leaves.

**What is not, and why — measured in the same file rather than asserted here:**

- **Patrol.** No `patrolRoute` (decision 5). Every patrol metric stays zero with
  a guard on post for 5,000 ticks.
- **A lockdown with a physical effect.** No `doorIds` (decision 5).
- **Contraband search, for a reason that was never a sector.**
  `SearchSystem.submitOrder` has **no caller in `src/` at all** and
  `runtime.searchPolicies` is only ever populated from a save. A sector was not
  what search was missing; a command is. This is the one item on #396's list of
  four that this document does not move at all, and saying so is the point.
- **`'unattributed'`**, ADR 0034's fourth claim kind, still needs a save taken
  during a response.

### 9. The bound that decides the shape of the play, and it is not a defect

Decision 3's shared pool has a consequence worth its own decision, because it
determines what a riot in a one-sector prison *is*.

`staffingShortfall` is `shortage / required`, and `shortage` is non-zero exactly
when `DeploymentSystem` could not fill the sector — which is exactly when
`unassignedGuardIds()` is empty. **So the term that makes a riot possible and the
pool a response draws from are mutually exclusive.** With
`DEFAULT_SECTOR_RISK_POLICY`'s weights, `needsPressure` alone caps the score at
0.5 against a `hotThreshold` of 0.6, so a riot in a one-sector prison **cannot be
answered by the guards whose absence caused it.**

It is answered by guards hired *after* it starts, inside
`responseDeadlineTicks` (600). That is coherent play — the prison riots because
it is understaffed, and the player answers by staffing it — and it is exactly the
sequence the trace in decision 8 records. But it is a consequence of there being
one sector, and it changes the moment there are two: with two sectors a shortfall
in one can coexist with a pool filled from the other, and a riot becomes
answerable by guards who were already hired.

**What else breaks when a second sector exists**, stated now because a reader of
this document is the person who will add one:

- **`resolveSectorOccupants` stops being adequate.** It counts prisoners standing
  exactly on the post tile. That works here only because the post tile is the
  arrival tile; with a drawn boundary it would attribute a prison's occupants to
  whichever sector happened to own the tile they stood on. Real sector membership
  — a tile-to-sector map — is what a second sector needs first.
- **`assignUnassignedGuards` fills sectors in sorted id order** and takes what it
  needs from the front of the pool, so a lexicographically later sector starves
  when the roster is thin. Today there is one sector and the question does not
  arise.
- **`security-sector.prison` becomes a reserved id.** The derivation registers it
  if nothing else has, so a scenario or a player-drawn sector must not use it.

### 10. Twenty-nine existing assertions changed, and none of them were wrong

Recorded because the size of the fallout is itself evidence that the tier was
dark, and because a reviewer should be able to check each one:

| file | red | why, and what changed |
|---|---|---|
| `integration/incident-response-restore.test.ts` | 12 | #352's reproduction counts guards exactly; the fixture zeroes the derived sector's demand, and three `sectorControlStates` assertions gained the derived sector's `'normal'` row |
| `integration/security-guard-release.test.ts` | 8 | eighteen assertions about which guard is held by what; same fixture change |
| `unit/new-session-runtime.test.ts` | 4 | three fixtures needed a second guard because the first is now posted; **and one asserted `incidentSectorIds` and `securitySchedules` empty as an invariant, which was the bug** |
| `unit/hud-projections.test.ts` | 2 | the scenario's two sectors are three |
| `integration/staff-hiring-loop.test.ts` | 1 | **its comment said "a new session registers no deployment schedule, so `DeploymentSystem` has no sector to send anybody to"** — the defect, documented as honest behaviour |
| `integration/session-save-round-trip.test.ts` | 1 | five guards over three sectors no longer leave a severity-6 riot a quorum; the fixture hires a sixth |
| `determinism/snapshot-restore-fidelity.test.ts` | 1 | two guards for two one-guard search jobs became one, serialising them, so the FIFO queue's order decided which item was found; the fixture hires a third |

The two in bold are the ones worth a reviewer's attention: both were *records of
unreachability that had outlived nothing*, because the fact was still true when
they were written.

## Consequences

- **No save-schema version, and no persisted shape moves.** Decision 6 has the
  detail. `SAVE_SCHEMA_VERSION` stays **5**; V6 stays free.
- **The first guard a player hires is spoken for.** Deployment takes it, so
  incidents and searches draw from the second hire onward. Decision 3 argues the
  number; this is the price.
- **A save written before this ADR gains a working security tier on load** and
  gains three payload entries when next saved. Decision 6 cost 1.
- **`security-sector.prison` is a reserved id** and the derivation will not
  overwrite anything already registered under it.
- **`SparseWorld` gained one public accessor**, `ownedChunkPositions()`, in
  canonical `(y, x)` order — and `snapshot()` now reads `ownedChunks` from it, so
  there is one definition of "the owned chunks, in order" rather than two.
- **`ADR 0034`'s browser tripwire is rewritten rather than deleted, and its claim
  is now weaker.** The three `Release` rows are still never laid out in the
  all-controls sweep — but because that sweep presses no `.hud-staff__hire`, not
  because the game cannot hold a guard. One press would recover one of the three
  rows (the derived requirement is one guard); it is not made here because a
  held-guards block changes the Staff panel's height and the sweep's box-chain
  and rail assertions are measured to the pixel at five viewports. The old
  reason is quoted in the constant's comment so the change is visible rather than
  silent.

  **Amended by issue #533 (2026-08-29): every clause of the bullet above except
  its first sentence is now false, and it is left standing rather than rewritten
  so the correction is visible.** The sweep *does* press `.hud-staff__hire` — three
  times at every viewport, so that the `Dismiss` control #533 puts on the roster is
  measured rather than exempted — and the press recovers **none** of the three
  `Release` rows rather than one. The estimate of one was right about the derived
  requirement and wrong about when it is met: `assignUnassignedGuards` is reached
  only from `DeploymentSystem.update`, and that sweep runs with the clock paused,
  so ADR 0051's paused drain lands the `HireStaff` command without any system ever
  looking at the new guard. All three hires stay `'unassigned'`, so the exemption
  survives with a *stronger* reason than this ADR left it with, not a weaker one.
  The pixel objection was half right and is answered by measurement rather than by
  avoidance: the Staff panel's box does grow at two of the five viewports (by
  88.4px and 19.9px) and never overflows the rail — but the panels in `.hud__side`
  swap by tab, so `.hud-staff` has no box at all while those box-chain and rail
  assertions are taken. The ten measurements are on the constant's comment in
  `tests/browser/app-shell.spec.ts`.
- **Determinism is unaffected.** The derivation draws no RNG, reads no clock,
  sorts its one input with `compareChunkPositions` rather than trusting a `Set`,
  and runs once at composition. Two runs of one seed are hash-identical through
  the riot (`hashFullRuntime`), and a restored session derives what the live one
  did.
- **Nothing reaches the database.** `supabase/` is untouched.
- **`src/ui/hud/**` gains no text** and no locale key (ADR 0011); no command, no
  refusal reason and no wire vocabulary are added.
- **If this ADR is rejected**, `default-sector.ts`, its two call sites, the two
  test files and the fixture helper come out together; the twenty-nine assertions
  in decision 10 revert to what they said; ADR 0034 open question 5 re-opens; and
  no player's save has been altered.

## Open questions

1. **What happens when the player builds on the post tile?** A wall at (16, 16)
   makes the post unroutable: `deploymentFailures` counts and the guard returns to
   the pool, retried every cycle, for ever. Nothing tells the player. The
   candidate answers are all decisions of their own — refuse the build, move the
   post, or raise a refusal on a state rather than a command — and the third is a
   shape this repository does not have yet.
2. **Should the derivation re-run when the player buys land?** Decision 4 says no
   and notes that the question is mostly moot until a parcel purchase exists.
   When it does, "the first owned chunk" can change, and a session that derived
   its post tile before the purchase and one that derived it after would disagree
   — which the *once* in decision 4 hides rather than solves.
3. **Is one guard the right requirement, and should it vary?** Decision 3 argues
   the minimum non-zero. A schedule that asked for more at night is exactly what
   `DeploymentBlock` exists for and nothing authors one; a requirement that scaled
   with the prisoner population would be a different kind of rule again. Neither
   is derivable from the world.
4. **Does the sector need a name a player can read?** `SecuritySectorDefinition`
   carries no `nameKey`, `projectSecurity` reports a `gradeNameKey` and a raw
   `sectorId`, and no panel reads `hud/security` at all — so the question is not
   live yet. It becomes live with the first surface that shows a sector, and ADR
   0011 means the answer is a locale key rather than a string in the simulation.
5. **When a player can draw a sector, what happens to this one?** The honest
   answers are "it is the first one and can be redrawn" and "it disappears the
   moment a real one exists", and they imply different things about the id, about
   `SecuritySectorRegistry` needing an un-register (decision 4 point 2), and about
   what an incident open in it does. This document deliberately does not choose,
   and choosing is #396's option 2.
6. **Should `resolveSectorOccupants` become real sector membership now?**
   Decision 9 says a second sector needs it first. Doing it now would be building
   for a sector that does not exist; not doing it means the one measurement that
   makes a riot reachable rests on a post tile and an arrival tile being the same
   tile, which decision 2 records as a coincidence that is currently true.
