# ADR 0027: Cell-sharing assessment — what is recorded, who may override, and how a cell-scoped risk reaches a sector-scoped trigger

## Status

**Proposed — pending human approval.** Not accepted.

Nothing in `src/` implements any decision in this document. What *is* in
`src/` is deliberately the part that needed no decision, and it is described
in §*What already landed, and why it is not a decision* so that a reviewer
can tell the two apart without reading the diff.

A reviewer is being asked to settle three questions. They are separable and
can be answered independently, but they are filed together because answering
one in isolation forces a guess at the other two.

1. **Is a cell-sharing rating recomputed on demand, or recorded state?**
2. **Is the rating advisory or binding — and if binding, who may override it?**
3. **How does a cell-scoped pairing risk reach the sector-scoped incident
   trigger system, which has no notion of a cell?**

## Context

Issue #79 observes that `RoomInstanceRegistry.findAvailable` decides where an
arriving prisoner sleeps by asking three questions — the room type, an
occupancy *count*, and an object capability — and never asks who is already in
the room. It proposes a Cell Sharing Risk Assessment: a compatibility check
consulted at placement, producing a rating rather than a boolean, visible to
the player, overridable, and feeding the existing incident trigger system.

Three preconditions bound everything below, and all three are structural
rather than incidental.

**Co-occupancy is not reachable in a shipped session.** `RoomZoningService`
registers every room instance with `capacity: 0`
(`RoomZoningService.zone`, `src/simulation/rooms/zoning.ts`, pinned by
`rooms-zoning.test.ts`'s "gives a freshly zoned room no capacity and no
object capabilities"), because object placement does not exist
and an empty rectangle accommodates nobody — ADR 0023 §1 records that as the
decision rather than as an oversight. So `occupancyOf(instanceId) >=
instance.capacity` is `0 >= 0` for every zoned room, `findAvailable` can never
succeed through the live path, and no session this codebase can produce has
two prisoners in one cell. Every claim about shared cells here, and every test
of the code that landed, is reachable only by registering an instance
directly.

**Re-measured after #312, because that is the change that could have expired
it.** The Rooms tab gave `ZoneRoom` its first producer, so a player can now
create and destroy room instances and a live session containing real rooms
exists for the first time — which is exactly the shape of change that turns a
precondition into a stale sentence. It did not: zoning two cells through the
real service still yields `capacity: 0` and an empty capability list,
`findAvailable` and `findBestAvailable` both return `undefined` for
`room.cell` with and without the `sleep-surface` filter, an admitted prisoner
is never housed (`completedCount` 0, `failedCount` 0, the backlog counter
climbing, because the room type exists and retrying is correct), and
`assign` on a zoned instance returns `false`. What #312 *did* change is that
this is now observable end to end rather than only argued: it is
`prisoners-intake-system.test.ts`'s "houses nobody at all through the shipped
session path, because a zoned room has no capacity", which before the Rooms
tab could not have been written at all. That case is a tripwire, not
decoration — it fails the day capacity is derived from placed objects
(**ADR 0028**, itself Proposed), which is the day this precondition expires and
#79 becomes reachable for real.

**Three of #79's four named inputs do not exist to be read.** Gang membership
exists as a registry but `new-session.ts` constructs it empty and
`IntakeSystem` does not receive it; incident participation exists but has no
per-participant index, so a participant query is a full scan of the log on a
per-tick path; vulnerability has no field, no flag, and no occurrence
anywhere in `src/`. Classification distance is the one input that is
populated, indexed, and in hand at the moment allocation runs.

**The occupants this reads are only as trustworthy as an `EntityId` is.**
Reading an occupant's record means resolving a stored `EntityId` back to a
slot, and what that resolution is worth is
[ADR 0026](./0026-entity-id-lifetime.md)'s question, not this one:
`IntakeSystem` filters occupants through `EntityStore.isAlive` before rating
them, and at a generation wrap `isAlive` reports a stale handle as live, so
the rating would read whoever now holds the recycled index. That is why this
ADR takes the higher number of the pair — every question below assumes an
occupant list that means what it says, and 0026 is where that assumption is
settled.

## What already landed, and why it is not a decision

Stated first, because the honest boundary between "implemented" and "still
open" is the most useful thing this document carries.

`RoomInstanceRegistry.findBestAvailable` is `findAvailable` with the current
occupants handed to a caller-supplied rating function: lowest rating wins,
ties go to the lowest instance id, and a non-finite rating skips the
instance. `IntakeSystem` passes `cell-sharing.ts`'s `rateCellSharing`, whose
single term is the worst classification distance across the live occupants.

That is a mechanism, not a policy, on four counts:

- **It adds no state.** Nothing is stored, nothing is saved, no schema moves.
- **It refuses nothing.** It reorders a candidate list whose members are all
  already permissible. A full prison behaves exactly as it did.
- **It changes no existing outcome**, and the reason is counted rather than
  asserted: 36 of the cell registrations in this tree are `capacity: 1`, so
  every *free* instance holds nobody, every rating is 0, and the tie-break
  returns exactly what `findAvailable` returned. Two determinism fixtures do
  register a cell above 1 — `snapshot-restore-fidelity.test.ts` at 4, which
  genuinely houses several prisoners together through `admitPrisoner`, and
  `projection-ordering.test.ts` at 8 — and in both that instance is the only
  one of its room type, so a ranking has nothing to reorder. The remaining
  shared cells are the ones this branch's own tests register, which is the
  point of them.
- **It names no rating bands.** A number is not a vocabulary. Naming bands
  would require message keys under `src/content/simulation-message-keys.ts`'s
  completeness gate, and which bands exist is question 2's business.

The determinism obligation it does carry is discharged in code and is worth
recording because it is invisible to the guard that would normally catch it:
occupants are sorted ascending by entity id before the rating sees them.
`occupantsOf` returns insertion order, which is *assignment* order live and
*ascending id* order after a restore, so an unsorted consumer places a
prisoner differently on the two sides of a save;
`tests/determinism/canonical-iteration-contract.test.ts` cannot see that
expression and says so in its own header.

## The three questions

### 1. Recomputed on demand, or recorded state?

**Recomputed** is what landed, because it is what the absence of a decision
permits: no schema, no migration, no new registry.

**Recorded** is what real practice and #79's own text describe — England and
Wales require a Cell Sharing Risk Assessment rating to be *recorded in the
prison management system* before anyone is located in a shared cell. A
recorded rating is the only form that can answer "on what basis was this
placement made, and what did we not know at the time", which is the question
an audit trail exists for, and the only form that can become *stale* — which
is what makes reassessment a mechanic rather than a recomputation.

The cost is concrete and is why this is not an implementation detail.
`SAVE_SCHEMA_VERSION` is 4 (`src/persistence/save-schema.ts`); a recorded
rating is a V5 payload section, a migration in the chain, and a new
snapshotted registry with `getSnapshot`/`loadSnapshot` in canonical order.
`AGENTS.md` boundary 7 requires that decision to be taken deliberately.

**Not decided here.** The two options are not close in cost and the cheaper
one is not obviously right.

### 2. Advisory or binding, and who overrides?

What landed is advisory: it ranks and never refuses. `findBestAvailable`
already carries the mechanism a binding policy would use — a non-finite
rating means "not a permissible placement" — and nothing in `src/` returns
one.

Making it binding is not a flag. `IntakeSystem` is fully autonomous: there is
no player input to placement at all. The entire command surface is
`PlaceBuildOrder`, `CancelBuildOrder`, `ZoneRoom`, `UnzoneRoom`,
`PurchaseMaterials`, `Undo` and `Redo`
(`src/simulation/protocol/commands.ts`) — seven, since #312 added the
removal half — and not one of them concerns a prisoner, so an override needs a new
command type, its codec case, a handler branch, and a decision about whether
intake *blocks* waiting for a human or proceeds and reports. Commands sit in
the kernel's snapshotted pending queue, so a new type touches ADR 0009's
replay-verification surface.

#79 is explicit that this matters: *"a game that simply forbids the risky
choice has removed the decision."* A binding rating with no override is the
one option the issue rules out; an advisory rating with no visible
consequence is the one that makes the mechanic inert. Both remaining shapes
cost a command.

**Not decided here.**

### 3. How does a cell-scoped risk reach a sector-scoped trigger?

#79 asks that bad pairings raise incident probability "through the existing
trigger system rather than a bespoke path". The existing seam is
`SectorRiskSampler`, and it is **sector**-keyed: sector occupancy is computed
from prisoners standing on a sector's post tile.

**There is no cell-to-sector mapping anywhere in the codebase.**
`RoomInstance` carries an `anchorTile` and no sector field;
`SecuritySectorRegistry` definitions carry a `postTile` and `doorIds`. So the
instruction "feed the existing trigger system" currently has no route, and
inventing one is a modelling decision about what a sector *is* — which ADR
0023 already touched from the other side when it recorded that the zoning
plane stores a room type and not an instance id, leaving "which instance is
this tile part of" unanswerable.

`IncidentCauseFactor` itself is open-shaped and needs no change. The mapping
is the whole of the work.

**Not decided here.** It is also the question most likely to be answered by
something else first: real geometry validation, or object placement, either
of which forces the tile-to-instance question.

## Consequences

- **The mechanism is in place and the policy is not**, which is a stable
  state rather than a half-finished one: `findBestAvailable` with a constant
  rating is `findAvailable`, so nothing depends on a decision arriving.
- **The rating's content is deliberately one term.** Adding gang affiliation
  or incident history is a wiring change with nothing populated to read, and
  would look like a mechanic while behaving as a constant. When #39 lands
  relationships or a scenario populates `GangRegistry`, the term list is the
  place to extend and `rateCellSharing`'s signature does not move.
- **#78 is not a blocker for the metric, and is what makes it a loop.**
  `riskTier` is already a four-value scale, so the distance term works today.
  What #78 adds is *mutability* under periodic review — a pairing that was
  fine becoming unwise — which is what gives question 1's recorded rating
  something to go stale about and what turns a placement filter into the
  feedback loop #79 is actually asking for.
- **A shared-cell fixture is now a permanent test requirement.** Any future
  work on placement that cannot be exercised with `capacity > 1` is
  unfalsifiable by construction, because the live registrar supplies 0.

## What this decision does not settle

1. **Whether first-night or induction accommodation exists.**
   `room.holding-cell` is declared in the catalog with no reader, and
   `'reception'` is an intake *stage* the entity leaves within one scheduled
   tick — a moment, not a place. #79 argues the assessment's natural home is
   an induction phase. Adding one lengthens the pipeline, needs a message
   key, and shifts tick arithmetic several existing tests count explicitly.
2. **The rating's bands and their names.** A number has no vocabulary. Bands
   are content, gated by the message-key completeness test, and only worth
   naming once question 2 says what a band *does*.
3. **Whether `assign`'s ignored return value should be handled.**
   `intake-system.ts` discards it; harmless while `findBestAvailable` checked
   capacity three statements earlier in the same tick with no interleaving,
   and a real gap the moment anything else can place a prisoner.
