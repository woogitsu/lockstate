# ADR 0045: Must a zoned room be enclosed

> **The number was a placeholder; 0045 was assigned on landing.** ADR numbers in
> this repository are assigned centrally after parallel drafts return —
> `AGENTS.md` and `docs/AGENT_WORKFLOW.md` §2 both say so, because two agents
> took `0034` within an hour of each other last session. This draft carried
> `XXXX` and did not edit `docs/adr/README.md`; the index row, heading and
> filename were one edit made by the integrator.
>
> Three drafts returned in that pass and the two genuine gaps went first: 0042
> to the consequence-loop ADR and 0043 to the account-session ADR. This one took
> 0045, the stated next free number, so README's next-free line moved to 0046
> and the paragraph recording those gaps is now a record of gaps that were used.

## Status

**Accepted, 2026-08-27, on decisions 1 and 8; decisions 2–7 remain the author's
judgement and stay open to a disagreeing reader.**

Decision 1 is the owner's own ruling, quoted below. Decisions 2–8 are the shape
that ruling has to take in this codebase, written under the owner's standing
delegation to decide autonomously and do it properly ("jakościowo, nie tanio").

**Decision 8 was put back to the owner rather than kept**, because the author
named it as this document's weakest claim: the ruling settles the *outcome*
(`zone` refuses an open room) and not what `enclosed` *means*, and no other
reading of `enclosed` is implementable without first building the region query
`TopologyManager` does not have. The owner was asked directly whether a room
drawn inside a larger sealed hall should stay zonable, was shown the cost —
every room needs its own closed boundary, so an open-plan sub-room becomes a
subdivision — and answered **no: the room's own boundary must be closed.** So
the redefinition is the owner's, not an inference, and the "false negative" this
document argues is a chosen definition is now recorded as such.

That closes the reversal route this document offered. It is still cheap —
nothing is written to disk that a reversal would have to migrate back — but it
is no longer the expected outcome.

**The edge-of-owned-land consequence below is superseded rather than answered.**
This document records that a room flush against the edge of owned land can never
be sealed, because its south and east boundaries live on tiles the player cannot
build on, and that the ruling promotes that from a wrong readout to a wrong
refusal. Asked to choose between counting an unowned neighbour as a wall and
leaving the refusal correct, the owner rejected the framing and asked for a
different world model instead: owned land as open ground, with the player
raising a building — foundation and walls — and rooms living inside it.

**That routing was wrong, and [ADR 0047](./0047-raising-a-building-on-open-ground.md)
says so.** A building has a south boundary stored on the row below it for
exactly the reason a room does, so the building layer inherits this consequence
verbatim rather than dissolving it. The cause is not the world model; it is one
asymmetric predicate. `submitOrder` tests ownership of the order's *own* tile,
so the north and west faces of owned land are wallable and the south and east
faces are not — the same physical wall on the same property line. ADR 0047's
slice 0 is the fix, it is roughly one predicate plus the bounds check beside it,
and it answers this consequence without the building layer at all.

Until slice 0 lands the consequence stands unfixed and known. Today's damage is
bounded, and the reason is worth recording because it will stop being true: no
land purchase exists — `canPurchaseParcel` has no caller and there is no
`PurchaseParcel` command — so a session owns one chunk and only its last row and
column are affected. **The option this document weighed, that the player buys
the adjoining parcel, named a route the player cannot take.**

## Context

### The ruling

Issue [#446](https://github.com/matmaxalez/lockstate/issues/446) listed four
product questions as the owner's alone. The third was:

> *Is `roomPerimeterEnclosure` meant to stay advisory? It refuses nothing today
> — `zone` accepts an open room and only the Rooms panel reads the result.*

The owner has ruled:

> **`roomPerimeterEnclosure` is NOT to stay advisory. `zone` must refuse an open
> room.**

That is a change to `RoomZoningService.zone`'s contract, not a bug fix, which is
why it is an ADR.

### What the code does today, and what it says about why

`RoomZoningService.zone` evaluates enclosure **after** it has painted the
zoning plane and registered the `RoomInstance`, puts the answer on the accepted
outcome and on a `ZoningNotice`, and refuses nothing. The comment above that
evaluation states the decision explicitly — *"It refuses nothing, and that is
the decision rather than caution"* — and gives two reasons. Both have to be
answered before the ruling can be implemented honestly, because one of them is
still true and the other is an assumption the ruling overturns.

**Reason one, which the ruling overturns.** `roomPerimeterEnclosure` asks
whether *this rectangle's own perimeter* carries edge geometry on all four
sides. `src/simulation/rooms/enclosure.ts` calls that narrower than enclosure
and names the gap as a **false negative**: a rectangle drawn strictly inside a
larger sealed building, with no partition walls of its own, is reported `'open'`
while being topologically indoors.
`tests/unit/rooms-enclosure.test.ts`'s final block pins that case as a
limitation, and both places conclude that refusing on the answer *"would block a
legitimate designation"*.

That conclusion rests on an unstated premise: that `enclosed` means
**topologically indoors**. Under that reading the predicate really is narrow and
refusing on it really is wrong. But the reading is a design opinion, not a fact
about the world model, and it is not the only coherent one. Under the other
reading — `enclosed` means *this room's boundary is closed* — the same function
is not narrow at all. It is **exact**: it answers precisely the question, with
no false negatives and no false positives, and its own header already says so
for the case it can state honestly ("*for a rectangle that is the same thing as
'no walk in the four directions leaves it'*").

**The ruling settles which reading is in force.** Decision 8 records what that
costs and what it saves.

**Reason two, which is still true and is what decisions 3 and 7 are about.**
Enclosure is checked at *designation* time, while walls are built afterwards by
construction orders that take materials and ticks. That does not block the
change, but it does fix the order of the checks and it does decide what happens
to saves.

The comment's third reason has already expired and is quoted here only so a
reader does not resurrect it: it used to say a sealed room could not have a way
in, because `edgeNumericIdFor` answered `0` for `door-wooden`. A completed door
order now writes `DOOR_EDGE_NUMERIC_ID` into the same edge layer *and* registers
a `DoorDefinition`, so a room with a door in its wall line reads `'sealed'`
correctly. `enclosure.ts` records the correction; the Rooms panel's own comment
does not, and this change fixes that.

### Is the refusal reachable — can a player actually seal a room?

Asked and measured rather than assumed, because a refusal nobody can satisfy is
a deadlock and not a rule.

| fact | value | where |
| --- | --- | --- |
| a wall segment | `wall-brick`, `workRequired: 50`, `materialsRequired: 2 × item.brick` | `BUILDABLE_REGISTRY`, `src/simulation/construction/definition.ts` |
| a brick | 40 minor units | `PROCUREMENT_CATALOG`, `src/content/procurement-catalog.ts` |
| so a wall segment | 80 minor units | derived |
| a 2×3 cell's perimeter | `2 × (2 + 3)` = 10 segments = 800 minor units | derived |
| a new prison's treasury | `TREASURY_STARTING_BALANCE_MINOR_UNITS` = 25 000 | `src/simulation/economy/treasury.ts` |
| does work need a hired worker? | **no** — `ConstructionSystem.update` advances an in-progress order by a fixed 10 per scheduled tick, one order at a time | `src/simulation/construction/system.ts` |

A fresh prison can therefore afford roughly thirty-one 2×3 cells' worth of wall
out of its opening balance, and the work drains without anyone being hired. The
bootstrap is not deadlocked: buy bricks, order the walls, wait, zone. There is
no path in which the player needs a room in order to get the money or the labour
to build the walls the room now requires.

**One reachability trap is real and is not closed here.**
`roomPerimeterEnclosure` reads the *south* boundary as the north edge of the row
**below** the rectangle and the *east* boundary as the west edge of the column to
its **right** — edges belonging to tiles outside the rectangle. If those
neighbouring tiles are on land the player does not own, or in a chunk that was
never materialised, the player cannot build there and the rectangle can never be
sealed. A room flush against the edge of owned land is therefore unzonable until
the adjoining parcel is bought. That is a consequence of where the world stores
an edge, it existed before this change as a wrong *readout*, and this change
promotes it to a wrong *refusal*. It is recorded under Consequences rather than
solved, because solving it means deciding whether an unowned neighbour counts as
a wall, which is a separate product question.

### What a refusal costs the existing suite, measured

The probe was a four-line refusal on `enclosureRequirement(definition) ===
'enclosed' && enclosure === 'open'`, applied to `zone` before the write, run per
file with `--testTimeout=60000` (the shipped 5 s timeout flakes under load and
would have scored bogus failures), and then removed by hand.

| file | failing / total |
| --- | --- |
| `tests/unit/rooms-zoning.test.ts` + `tests/unit/rooms-enclosure.test.ts` + `tests/integration/room-zoning-loop.test.ts` | 28 / 58 |
| `tests/integration/object-removal-loop.test.ts` | 13 / 16 |
| `tests/integration/object-placement-loop.test.ts` | 12 / 14 |
| `tests/integration/furnished-cell-loop.test.ts` | 10 / 11 |
| `tests/integration/furnished-prison-loop.test.ts` | 8 / 9 |
| `tests/integration/prisoner-admission-loop.test.ts` | 8 / 10 |
| `tests/integration/incident-consequence-loop.test.ts` | 5 / 8 |
| `tests/migrations/save-v4-to-v5.test.ts` | 5 / 10 |
| `tests/integration/contended-canteen-meal-fallback.test.ts` | 4 / 4 |
| `tests/unit/simulation-refusals.test.ts` | 3 / 29 |
| `tests/integration/cell-only-meal-fallback.test.ts`, `security-default-sector.test.ts`, `unzoned-target-mid-journey.test.ts` | 2 each |
| `tests/integration/own-accommodation-claim-restore.test.ts`, `tests/unit/prisoners-intake-system.test.ts` | 1 each |

**About 104 tests in 16 files.** Every one of them is a fixture that zones an
`enclosed` room on open ground and then asserts something downstream of the
acceptance. None is a test *of* enclosure. `tests/foundation/` and
`tests/contract/` are untouched — 402 tests in 43 files, all green under the
probe — and so are `tests/determinism/` and `tests/perf/`.

**No benchmark zones a room at all.** `grep -rn 'ZoneRoom\|roomZoning\|zone('
benchmarks/ scripts/` is empty, so `verify:benchmark`'s eleven deterministic
scenarios are not in the blast radius.

That number is the honest cost of the ruling and it is not an argument against
it: a fixture that zones a cell in open ground now describes a prison the
simulation forbids, so those fixtures are wrong in the same way the production
code was.

## Decision

### 1. `zone` refuses. It does not accept-and-mark

An `enclosed` room whose own perimeter is open is **refused before anything is
written**. The advisory readout stays for what it can still say (decision 5).

**Alternative A, rejected: keep it advisory (the status quo).** This is what the
owner ruled against. Recorded with its actual merit, which is not nothing: the
warning is truthful, it costs the player nothing, and it leaves the walls-later
build order open. What it cannot do is stop the state it warns about, and a
prison full of `enclosed` rooms that are not enclosed is a prison in which the
`enclosed` requirement means nothing at all — which is what all 18 room
definitions have been authoring since #17 for no reader.

**Alternative B, rejected: accept and persist a `degraded` flag on the
instance.** Rejected on two independent grounds. It is a *derived* value —
recomputable at any moment from the rectangle and the world's edge layers — and
persisting a derived value onto a `RoomInstance` is precisely the shape ADR 0028
decision 6 **removed** (it dropped `capacity` and `objectCapabilities` for this
reason and made `restoreSessionSystems` recompute them). And it would need a
save-format change, a V6 and a migration, to buy a flag that changes nothing:
nothing in `src/` gates on it, so a degraded room would behave exactly like an
undegraded one and the player would be back at a warning with no teeth.

### 2. The refusal's shape: an eighth `ZoneRoomRefusalReason`, `not-enclosed`

Inside the existing vocabulary, not beside it. `zone` already refuses seven ways
— `unknown-room-type`, `invalid-area`, `below-minimum-size`, `out-of-bounds`,
`unowned-land`, `overlaps-existing-room`, `duplicate-instance-id` — and the
whole route from the service to a sentence on screen is table-driven and
exhaustive at compile time:

```
ZoneRoomRefusalReason  →  ZONE_REFUSAL_REASONS  →  RefusalReason ('zone.not-enclosed')
                          (refusals/refusal-log.ts)   (protocol/types.ts)
                       →  REFUSAL_MESSAGE_KEY   →  'hud.alert.refusal.zone.not-enclosed'
                          (src/ui/simulation-alerts.ts)  (src/content/default-locale-en.ts)
```

Each of those is a `Readonly<Record<Union, …>>`, so the new member does not
compile until every hop has been decided. That property is the reason to use
this mechanism rather than invent a parallel one, and it is why the change
necessarily touches four files outside `src/simulation/rooms/**`.

**The name.** `not-enclosed`, matching the adjectival, player-facing register of
`unowned-land` and `below-minimum-size` rather than the mechanism
(`open-perimeter`). Like `below-minimum-size` it is a **content** refusal, not a
geometric one: it fires only for a room whose definition authors an `enclosed`
requirement, so the same rectangle is refused for a cell and accepted for a yard.

**The refusal carries where the gap is.** `ZoneRoomRefusal` already has an
optional `tile` for the per-tile refusals; `roomPerimeterEnclosure` already
returns the first gap in a canonical perimeter order as a `{ tile, edge }` pair,
so the tile costs nothing and is exactly what that field is for. `edge` is added
as a second optional field, because a tile alone is ambiguous — the world stores
a north edge and a west edge per tile, and "the gap is at (6,4)" does not say
which. Both are for the in-worker diagnosis window
(`recentRefusals`, `MAX_RECORDED_ZONING_REFUSALS`); neither crosses the worker
boundary, because `RefusalLog` deliberately holds no coordinates and this ADR
does not reopen that.

### 3. Order of checks: enclosure last, after the per-tile loop, before any write

The order becomes: room type → area → authored minimum → duplicate anchor →
per-tile (bounds, ownership, overlap) → **enclosure** → write.

**Not primarily a cost decision, and the brief's presumption about cost is
wrong.** Enclosure is `2 × (width + height)` edge reads; the per-tile loop is
`width × height` tile reads with a `canBuildAt` call each. For a 2×3 cell that
is 10 against 6 — enclosure is the *more* expensive of the two — and the two
cross over around 4×4, after which enclosure is dramatically cheaper (256
against 4 096 at the 64×64 ceiling). Cost therefore does not settle the order in
either direction, and something else has to.

**Two things do, and they agree.**

*Correctness.* `roomPerimeterEnclosure` reads the north edge of the row *below*
the rectangle and the west edge of the column to its *right*.
`SparseWorld.getTopEdge`/`getLeftEdge` answer `0` for a chunk that does not
exist. So for a request that is partly outside the materialised world, enclosure
answers `'open'` with a gap on a tile that is not merely unwalled but not there
— a diagnosis that would send the player to build a wall in a chunk that does
not exist. `out-of-bounds` must therefore win, and not as a tie-break.

*What the player can act on.* This is the criterion `zone` already applies, in
so many words, when it puts `below-minimum-size` ahead of every per-tile check:
*"the size is a fact about what they asked for and the ownership is a fact about
where — and the first is the one they can fix by dragging again."* Extending it:
`unowned-land` and `overlaps-existing-room` are facts about whether the player
may designate **there at all**, and `not-enclosed` is a fact about what they have
**built**. Telling somebody to go and wall a rectangle that sits on land they do
not own, or on top of another room, is strictly worse advice than telling them
the truth about the land.

**Before the write, which is where it also moves.** Today the evaluation runs
*after* `setZoning` has painted the plane and the instance has been registered.
Painting does not change the answer — `setZoning` writes the zoning plane and
never an edge layer — so this is not a bug being fixed, but a refusal cannot be
returned from there. The single call now happens before the write and its result
serves both the refusal and the accepted outcome's notice, so the change adds no
second evaluation.

### 4. Saves that already contain an open zoned room are left exactly alone

**No migration. No `SAVE_SCHEMA_VERSION` bump. No V6.** `zone` gates the
*command*; it does not audit the *state*. A save that carries an open `enclosed`
room restores it, the Rooms panel counts it, prisoners keep living in it, and
the player may un-zone it, wall it, or leave it.

This is the answer ADR 0038 §1's compatibility rule gives, applied literally:

> A save is compatible with a build when the build can interpret every section
> the save carries, and every section the build needs and the save omits has
> exactly one meaning.

A V5 `prisoners.roomInstanceDefinitions` row carries `instanceId`,
`roomCatalogId`, `anchorTile` and an optional `width`/`height`. This build
interprets every one of those exactly as the writing build did. **No field
changes meaning and no field is added**, so `AGENTS.md` boundary 7 ("every
persistent format must have a version and migration strategy before release") is
not engaged: there is no new persistent format. What changed is an admission
rule on a command, and commands are not persisted state — the one place a
command *is* persisted, a queued `ZoneRoom` in a save's command queue, is
re-decoded and re-dispatched through `zone`, so it meets the new rule on the way
in, which is correct.

Nor is an open room in a save a corrupt row. Enclosure is a function of the
world's edge layers, and the save carries those too. An open room is a room
whose walls the player has not built yet — a true statement about a real prison,
recoverable by the player with the same bricks anyone else uses.

**Alternative C, rejected: migrate open rooms to unzoned at restore.**
Destructive, and it breaks a rule the codebase already enforces in the opposite
direction. `unzone` refuses `room-occupied` precisely so that unregistering an
instance cannot leave a prisoner's cold-state `accommodationInstanceId` naming a
room that no longer exists. A restore-time purge has no such guard and **cannot**
have one: `restoreSessionSystems` registers room instances in its step 2 and
loads prisoner occupancy and cold state in step 3, so at the moment the purge
would run, occupancy is not yet known. It would create exactly the dangling
reference `unzone` exists to prevent, and it would do it to the player's saved
prison without asking.

**Alternative D, rejected: mark the restored rooms degraded.** This is
alternative B (decision 1) wearing a migration, and it fails for the same two
reasons plus a third: the flag would have to be recomputed at restore anyway,
from the rectangle and the edge layers, so persisting it buys nothing and can
only disagree with the world it was derived from.

**If a future build does want to act on pre-existing open rooms**, the cheap and
non-destructive route is a *projection*, not a migration: `projectRoomList`
already answers "which rooms are unfinished and what each one lacks", it is
recomputed every time it is asked, and adding "and this one is not enclosed" to
it changes no byte on disk. That is recorded as the exit, not taken here.

### 5. `hud.rooms.enclosure-open-required` is retired; its sentence moves to the refusal

After decision 1, an *accepted* zoning of a room whose requirement is `enclosed`
is always `sealed`. `ZoningNotice` is written only on an accepted zoning and is
not snapshotted, so the pair the Rooms panel warns on — `requirement ===
'enclosed' && enclosure === 'open'` — becomes unreachable in every session,
restored or fresh. Leaving the key would leave exactly the orphan
`docs/LOCALIZATION.md` treats as a defect class and the owner is separately
unhappy about elsewhere in the build.

So the key and its branch go, and its sentence changes namespace rather than
disappearing: *"This room should be enclosed, and the area you drew is open on
at least one side"* becomes `hud.alert.refusal.zone.not-enclosed`, reworded into
the house style every other `zone.*` sentence uses (*"The room was not zoned —
…"*). The player is told the same thing, at the moment it can still be acted on,
through the channel that already exists for "the prison is exactly as it was".

**The enclosure readout stays and is not orphaned.** `hud.rooms.enclosure`,
`-none`, `-sealed` and `-open` all keep live readings: an accepted `outdoors`
room reports `open` and an accepted `enclosed` room reports `sealed`, which is
now a confirmation rather than a warning.

**The better sentence is the one this ADR does not build**, and it is named so
nobody thinks it was overlooked: a *pre-confirm* warning, beside the
`pendingIsTooSmall()` one that already exists, telling the player their pending
rectangle will be refused before they press Confirm. The Rooms panel cannot do
it today — `AGENTS.md` boundary 1 forbids `src/ui/hud/**` from importing the
simulation, and the panel has no edge data — so it needs a projection carrying
the pending rectangle's enclosure across the worker boundary. That is a HUD
projection decision, not this one.

### 6. `unzone` gets no symmetric refusal, and the two were checked rather than assumed

`unzone` refuses three ways — `invalid-area`, `nothing-to-remove`,
`room-occupied` — and **must not** gain an enclosure refusal. `unzone` exists
because a zoned room was otherwise permanent for the life of the session; making
removal conditional on the room's walls would make an open room unremovable,
which is the exact defect the command was built to close, and it would do it to
the rooms this decision has just made hardest to create.

Nor is there a hidden coupling in the other direction: `unzone` reads the zoning
plane and the instance registry and never the edge layers.

**The duplicated size cap was checked and is not a gap — and this paragraph is
a correction of an earlier draft of itself.** `zone` and `unzone` carry a
byte-identical `width < 1 || height < 1 || width > MAX_ZONE_DIMENSION_TILES ||
height > MAX_ZONE_DIMENSION_TILES` condition, and issue #445 reported the `>` on
`zone`'s copy as a surviving mutant. This section first said that `zone`'s copy
was now guarded and `unzone`'s was not, and that the survivor carried forward.
**That was wrong, and it was wrong in the direction of asserting a defect
without opening the file.** Both copies are guarded, in adjacent cases in
`tests/unit/rooms-zoning.test.ts`: *"accepts a rectangle exactly
MAX_ZONE_DIMENSION_TILES per side, so the cap is inclusive"* and *"accepts a
removal rectangle exactly MAX_ZONE_DIMENSION_TILES per side, so the cap is
inclusive here too"*, the second of which says in its own comment that `unzone`
carried "its own copy of the same hole". #445's survivor list predates both.

The duplication itself remains — one condition written twice, in two methods,
with no shared constant beyond `MAX_ZONE_DIMENSION_TILES` — and this ADR does
not touch it, because factoring it out is an unrelated change in a commit about
enclosure.

### 7. Only `enclosed`. An `outdoors` or `none` room is accepted at any perimeter

`enclosureRequirement` answers `'enclosed'` (17 of the 18 shipped rooms),
`'outdoors'` (`room.yard`, exactly one) or `'none'` (no shipped room, and a real
answer rather than a fallback — the reader never invents a default). The refusal
fires on `'enclosed'` alone.

`'outdoors'` **is not** given the mirror-image refusal, and this is a decision
and not an omission. Two reasons, either sufficient:

- **A walled yard is an ordinary prison yard.** An exercise yard surrounded by a
  perimeter wall is the archetype, not the exception, so refusing a `sealed`
  yard would refuse the most obviously correct thing a player could build.
- **The world cannot express the question.** `sealed` is a statement about
  *walls*. `outdoors` is a statement about a *roof*, and there is no roof in this
  world model at all — `grep -rn roof --include=*.ts src/` finds nothing about
  one. Enforcing `outdoors` with a wall predicate would be answering a question
  with the wrong instrument, which is the mistake this ADR spends its Context
  section unpicking.

`'none'` is likewise unenforced, for the reason `requirements.ts` gives about
every absent requirement: content saying nothing is content's statement, not a
hole to fill with a default.

### 8. What `enclosed` now means, and what that buys and costs

Recording this explicitly, because it is the part of the ruling that is easy to
implement without noticing.

**`enclosed` now means "this room's own boundary is closed", not "this room is
topologically indoors."** Under that definition `roomPerimeterEnclosure` is not a
narrow proxy for the real question — it *is* the question, computed exactly, in
`2 × (width + height)` edge reads with no false positives and no false negatives.

**What that buys.** The region-level enclosure query that
`src/simulation/rooms/enclosure.ts` names as the thing to build first stops being
a prerequisite for this feature. `TopologyManager` does region *detection*,
exposes no enclosure query, and its `update()` has no caller anywhere in `src/`,
so `getTopologyId` answers `0` for every tile in a running session; a refusal
that needed it would have needed all of that built, plus a rule about the
materialised world's frontier that nobody has written. This decision needs none
of it. The "false negative" in `enclosure.ts`'s header and in
`rooms-enclosure.test.ts`'s final block is not a defect being shipped — it is a
definition being chosen, and both places should be reworded to say so rather
than left claiming the opposite.

**What it costs, stated plainly so nobody is surprised by it in play.** An
open-plan room — a rectangle inside a larger sealed hall, with no partitions of
its own — is no longer zonable as an `enclosed` room. Every room must be
individually walled. Adjacent rooms may *share* a wall (room A's east boundary
and room B's west boundary are the same stored edge), so this is subdivision and
not double-walling, but it is a real constraint on how a prison is laid out and
it is the constraint the ruling chose.

## Consequences

- **`zone` acquires an eighth refusal** and one new evaluation before the write.
  The evaluation is not new work: the same single `roomPerimeterEnclosure` call
  that already ran moves earlier and serves both outcomes.
- **About 104 tests in 16 files must have their fixtures walled** before the
  suite is green again. Twelve of those files are outside the surface this ADR's
  implementing agent was given; that is a scoping fact for whoever integrates the
  branch, and it is measured above rather than estimated.
- **A room flush against the edge of owned land is unzonable** until the
  adjoining parcel is bought, because its south and east boundaries are stored on
  tiles outside it. See Context. Not solved here.
- **The player's route to a room is now build-then-zone.** Zoning is still free
  and instant; what it now requires is that the walls already exist. Nothing
  forces the walls to be built in any particular order, and nothing prevents the
  player from un-zoning, walling and re-zoning.
- **`hud.rooms.enclosure-open-required` and its message key are deleted**, and
  `tests/browser/ui-shell.spec.ts`'s *"reads out what the simulation found about
  the room, and warns only when it disagrees"* asserts that sentence and must be
  updated with it. The browser suite cannot be run in the dev container —
  `public/assets/**` is Git LFS pointer text there, which is #446's documented
  baseline — so that edit is made and disclosed unrun.
- **Two production comments become wrong and are corrected in the same change**:
  `zone`'s *"It refuses nothing, and that is the decision rather than caution"*,
  and the Rooms panel's *"a door cannot currently seal anything"*, which was
  already stale before this ADR.

## What would change this decision

- **A region-enclosure query landing.** If `TopologyManager` ever gains one and a
  frontier rule, the topological reading of `enclosed` becomes implementable and
  decision 8 is worth re-opening — as a *widening*, letting a sub-room inside a
  sealed hall through, not as a return to advisory.
- **Play showing that build-then-zone is the wrong order for this game.** The
  reversal is narrow and cheap by construction: delete the refusal branch, keep
  the notice. Nothing is written to disk that a reversal would have to migrate
  back, which is decision 4's second dividend.
