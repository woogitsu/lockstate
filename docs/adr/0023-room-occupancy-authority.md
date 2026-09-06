# ADR 0023: Where a room's occupancy comes from

## Status

**Accepted, 2026-08-25 — read the amendment of 2026-08-25 below before acting on
§1 step 2.** Not superseded by [ADR 0028](./0028-object-placement-and-derived-room-capacity.md),
deliberately: 0028 is the design for the object placement this ADR makes the
authority, and the owner kept this document accepted so that its authored
*nominal* fallback stays available if that build proves too large. The amendment
records what the fallback would actually have to do to change anything.

The owner delegated this question, and this document is the record of what was
chosen under that delegation. Nothing in `src/` implements it: no room definition
carries a capacity field, and `RoomZoningService` still registers every instance
with `capacity: 0` and `objectCapabilities: []`
(`src/simulation/rooms/zoning.ts`, `const instance: RoomInstance` in `zone`).

What was signed off is one thing: **a room's occupancy is resolved from the
objects standing in it, and a room definition may carry an
authored *nominal* occupancy that is used only as a fallback when no object
supplies one. The authored figure is never the authority.**

Two claims are deliberately *not* being made. This ADR does not say what the
nominal figures are — numbers are content and a product call — and it does not
say that a nominal figure will ever be authored for a given room type. It says
where authority lives when both exist.

Had the decision gone the other way, the alternative it would have gone to is
**alternative A**, an authored capacity per room type as the sole authority. That
is named here as the reversal target rather than as a discarded idea, because it
is the cheap answer and the honest reason to refuse it is not that it is wrong
in isolation — it is that nothing in the comparable-game sample ships it as the
sole authority for an accommodation room, and this repository's own
`src/simulation/rooms/zoning.ts` header already states the opposite model as
fact.

### What the evidence rests on, stated because it bounds every claim below

Three tiers appear here and they are not equally verifiable. Every external
claim below is labelled with its tier in place, and the labels are not
decoration: one load-bearing claim is search-only and this ADR's fallback field
depends on it.

**Tier 1 — repository claims.** Structural facts about this tree, re-verified
against `origin/main` at v0.0.34 while writing this. Every `file:line` below
resolves there unless the text says otherwise. No browser measurement was taken
for this ADR; the two pixel figures quoted in §*The legibility answer* are
quoted from files in this tree and from
[ADR 0022](./0022-room-zoning-surface.md), and are attributed as such.

**Tier 2 — shipped artifacts, opened and read.** Game data files and decompiled
game assemblies fetched from `raw.githubusercontent.com`, which is the only
host of this kind the egress proxy allows. **These are unofficial community
mirrors of shipped artifacts, not vendor-published source.** A mirror can be
stale or edited, and none of them is a citable specification. What makes them
usable is that they are verbatim game data (`materials.txt`,
`base-language.txt`) or machine decompilation whose shape is not the sort of
thing a mirror maintainer rewrites. Each claim below names the file it came
from, and each was opened and read rather than searched for.

**Tier 3 — search results, opened nothing.** The two wiki hosts that document
Prison Architect's room rules — `prisonarchitect.paradoxwikis.com` and
`prison-architect.fandom.com` — are **blocked by the egress proxy**, confirmed
by attempting both. Claims that rest only on search-result snippets are marked
**search-only** every time they appear.

`AGENTS.md` is explicit that research may inform mechanics while Lockstate must
have its own implementation and identity. Nothing below is a formula, a table or
a layout to copy; the evidence is used to decide *where authority lives*, which
is a structural question.

## Context

### What this repository already says, and the decision agrees with it

This is the reason the question is an ADR rather than a field added to a schema.
The tree already states a model, in prose, as fact — and it is the model this
decision keeps.

`src/simulation/rooms/zoning.ts:48-65` says, in the code's own words:

- `RoomInstance` carries a `capacity` and an `objectCapabilities` list, and
  **"in this codebase both come from the objects standing in the room: a cell
  holds as many prisoners as it has beds"** (`:50-52`). Verified: `RoomInstance`
  is `{ instanceId, roomCatalogId, anchorTile, capacity, objectCapabilities }`
  (`src/simulation/prisoners/room-instance-registry.ts:21-27`), and
  `IntakeSystem`/`ActionSystem` gate on capability tags that
  `src/content/object-catalog.ts` puts on objects
  (`src/simulation/prisoners/intake-system.ts:30-32`,
  `src/simulation/prisoners/actions.ts:28`).
- **"Object placement does not exist"** (`:54`), citing
  `docs/HUD_PROJECTIONS.md` gap 13. Verified: gap 13
  (`docs/HUD_PROJECTIONS.md:315-329`) says no system tracks which objects are
  physically in which room and that `RoomInstance.objectCapabilities` is
  declared at registration. `room-instance-registry.ts:8-19` states the same
  scope assumption at the type it applies to.
- `0` and `[]` **"are not a constant chosen to make a feature work — they are
  what an empty rectangle accommodates"** (`:56-58`). Verified at the
  registration site: `zoning.ts:252-261` registers `capacity: 0` and
  `objectCapabilities: []` with a comment saying exactly that.
- **"The room catalog carries no capacity of its own and none is invented
  here"**, and giving a zoned room a usable capacity **"needs a content
  addition — the smallest being one authored occupancy figure per room
  definition — and that is a product decision"** (`:60-65`). Verified:
  `roomDefinitionSchema` is `.strict()` over exactly six fields —
  `schemaVersion`, `id`, `numericId`, `nameKey`, `category`, `requirements` —
  and carries no capacity of any kind (`src/content/room-catalog.ts:52-61`).

`docs/PRISONER_OPERATIONS.md:162-184` restates the same thing from the intake
side and adds the consequence: a zoned cell is a *matching* instance that can
never free up, so `accommodation-assignment` retries against it forever rather
than failing fast.

**The decision above is consistent with that model, and an authoritative
authored figure would contradict it.** A *fallback* leaves "capacity comes from
the objects" true wherever an object exists; a room-type constant makes it false
everywhere. That distinction is the whole of what this ADR decides.

### The mechanism the decision has to fit

Verified, because the decision is a sentence about a resolver and this is what
the resolver feeds.

**This section cites by quotation, not by `file:line`, and that is issue #645's
ruling of 2026-08-30 (option 3).** Every citation below quotes the code it means
and names the file that code is in, and
`tests/foundation/adr-quotation-verbatim-contract.test.ts` re-checks each
quotation against that file on every run. A citation here can therefore no
longer become wrong quietly. What it can still become is a quotation of
something that *changed* — which is visible to a reader and red in CI, and is
the whole of the difference. **The rest of this document still cites by line and
is not covered by that gate**; the subsection at the end of this one records
what these anchors had drifted to before they were replaced.

Two spellings in particular survive below this section and are known to be
stale: §2 of the decision, §*Alternatives considered* and the 2026-08-25
amendment all say `findAvailable` and `instance.capacity`, and neither name
exists in `src/` any more — they are `findAvailableResidence`/`findBestAvailable`
and `residentCapacity`. Those sentences are load-bearing parts of the decision
and of a dated amendment rather than evidence a reader would follow, so #645
left them alone and named them here instead of rewording a decision to fix a
citation.

- The registry rejects an instance on **both** counts, on two consecutive lines:
  `if (this.occupancyOf(instance.instanceId) >= instance.residentCapacity) return false;`
  `if (requiredObjectCapability !== undefined && !instance.objectCapabilities.includes(requiredObjectCapability)) return false;`
  (both verbatim in `src/simulation/prisoners/room-instance-registry.ts`). The
  call that actually houses an arrival re-checks the residency half
  independently:
  `if (occupants.size >= instance.residentCapacity) return false;`
  (verbatim in `src/simulation/prisoners/room-instance-registry.ts`).
- The capability intake asks for is `'sleep-surface'`, and **exactly two objects
  in the catalog carry it** — `object.bed` and `object.medical-bed`, whose
  definitions end
  `capabilities: ['sleep-surface'] },`
  `capabilities: ['sleep-surface', 'medical-treatment'] },`
  (both verbatim in `src/content/object-catalog.ts`). No other definition in
  that file declares it.
- `DEFAULT_ACCOMMODATION_POLICY` names **two** room ids, not three, and offers
  both of them to both classification groups, in opposite orders:
  `return classificationGroupId === 'high-risk' ? [SOLITARY_CELL, CELL] : [CELL, SOLITARY_CELL];`
  (verbatim in `src/simulation/prisoners/intake-system.ts`). Both targets carry
  the same capability requirement:
  `{ roomCatalogId: 'room.cell', requiredObjectCapability: 'sleep-surface' }`
  `{ roomCatalogId: 'room.solitary-cell', requiredObjectCapability: 'sleep-surface' }`
  (both verbatim in `src/simulation/prisoners/intake-system.ts`).
  **`room.holding-cell` is named by neither** — which matters below, because it
  is the room whose real-world analogue is the one PA's own onboarding tells the
  player to build.
- Both refusal paths are still distinguished by the caller, and they are the two
  branches §1 of the decision depends on. The structural gap that retrying
  cannot fix is terminal:
  `this.records.intakeStage[index] = intakeStageIndex('failed');`
  (verbatim in `src/simulation/prisoners/intake-system.ts`). The recoverable one
  counts a tick and stays in the stage:
  `this.accommodationBacklogTicks += 1;`
  `continue; // stay in accommodation-assignment; retried next scheduled tick`
  (both verbatim in `src/simulation/prisoners/intake-system.ts`).
- The projection layer already separates the two numbers the decision separates.
  `RoomOccupancyViewModel` declares
  `readonly current: number;`
  `readonly capacity: number;`
  `readonly utilization?: BoundedValue;`
  `readonly free: number;`
  (all verbatim in `src/simulation/presentation/room-projection.ts`), and
  `utilization` is documented absent for a zero-capacity instance:
  `Absent for an instance whose resident capacity is zero -- a share of nothing has no meaning.`
  (verbatim in `src/simulation/presentation/room-projection.ts`). The status
  strip sums the same figure across instances —
  `roomCapacity += instance.residentCapacity;`
  (verbatim in `src/simulation/presentation/status-strip-projection.ts`) — and
  says in place which of the two capacities that is:
  `The resident capacity, because this counter sits beside the prisoner`
  (verbatim in `src/simulation/presentation/status-strip-projection.ts`).

There are 18 room definitions, `numericId` 1 through 18. The first and the last
are
`id: 'room.cell', numericId: 1,`
`id: 'room.utility-room', numericId: 18,`
(both verbatim in `src/content/room-catalog.ts`). Exactly three of them name a
bed in their `requirements`. `room.cell` and `room.solitary-cell` each carry the
same pair:
`{ type: 'object', objectId: 'object.bed', minQuantity: 1 },`
`{ type: 'object', objectId: 'object.toilet', minQuantity: 1 },`
(both verbatim in `src/content/room-catalog.ts`). `room.infirmary` carries a
medical bed instead:
`{ type: 'object', objectId: 'object.medical-bed', minQuantity: 1 },`
(verbatim in `src/content/room-catalog.ts`). The remaining housing room,
`room.holding-cell`, requires
`{ type: 'object', objectId: 'object.bench', minQuantity: 1 },`
(verbatim in `src/content/room-catalog.ts`) and no bed at all — the one
accommodation room in the catalog that no bed requirement and no accommodation
policy touches.

#### What this section said before 2026-08-30, and what had gone wrong with it

Recorded rather than overwritten, because the *shape* of the drift is the whole
argument for the form above. This section was written against `origin/main` at
v0.0.34 (§*What the evidence rests on, stated because it bounds every claim
below*) and issue #645 re-read it at `4f0b508` (v0.0.238). Its citations are
given here as bare basenames, which is this corpus's form for an anchor quoted
as history rather than offered as current. Six had moved. Five are the ones the
issue tabulated, and all five are confirmed:

- It cited `RoomInstanceRegistry.findAvailable(roomCatalogId, requiredObjectCapability?)`
  at `room-instance-registry.ts:81-87`, with the two gates at `:83` and `:84`
  and the re-check at `:93`. **No method of that name survives.** ADR 0028
  decision 3 split it into `findAvailableResidence` and `findAvailableForUse`,
  and `IntakeSystem` now reaches the first through `findBestAvailable`.
  `:81-87` is inside the `RoomInstance` interface declaration.
- It said the gate reads `instance.capacity`. **That field no longer exists.**
  It is `residentCapacity`, and `RoomInstance` carries a second, differently
  scoped capacity beside it — which is why the old spelling could not simply
  have been renamed in place and the sentence left alone.
- It cited `intake-system.ts:126-130` for the `'failed'` branch and `:133-135`
  for the backlog branch. **Both anchors now land inside a doc comment** about
  deduplicating accommodation targets; the branches themselves are several
  hundred lines below. It also said the `'failed'` branch tests
  `allByRoomCatalogId` directly; that test now sits one call in, inside
  `resolveExistingTarget`.
- It cited `room-projection.ts:97-103` for `RoomOccupancyViewModel` and `:100`
  for the *"a share of nothing has no meaning"* sentence. **Both anchors now
  land inside an unrelated doc comment** about how far a room requirement can be
  checked against an instance. The view model's four fields are unchanged; only
  its position is.
- It cited `status-strip-projection.ts:150-155` for the capacity summation.
  **That anchor is an interface declaration** — `StatusStripViewModel`'s
  `counts` block. The summation is around three hundred lines lower.
- It cited `room-catalog.ts:66-159` as the bounds of the 18 definitions, and
  `:66-71`, `:72-76`, `:77-82` and `:130` for four of them individually. **The
  definitions moved down the file**, `:159` is now `room.security-office`
  (`numericId` 13), and each of those four sub-anchors names a different room
  than it did.
- The sixth, which issue #645 did not tabulate and which is a wrong *claim*
  rather than a wrong anchor: it said `DEFAULT_ACCOMMODATION_POLICY` targets
  *"`room.solitary-cell` for the `high-risk` classification group and
  `room.cell` for everything else"*. **Both groups now list both rooms**, in
  opposite orders, so the sentence is false about which rooms a group may be
  housed in, even though the count of distinct room ids it gives is still two.

Every one of those anchors was correct on the day it was written, and none of
them was edited afterwards. That is the case for quoting rather than anchoring,
put as a measurement instead of as a preference.

### Why the binary was false

The question arrived framed as a choice between an authored capacity per room
type — cheap, opaque, one number in a data module — and object placement, a
whole missing pillar that is legible because the player can see the beds.

The research does not support either half as a sole authority, and the precise
form of that finding is what the decision is built on:

**No game in the sample makes an authored per-room-type number the sole
authority for an accommodation room.** Two of the three do not give a room a
capacity field at all (tier 2, opened, below). The third derives its shared
accommodation from area (tier 2, opened) and reserves a fixed figure for its
single-occupant room only (tier 3, search-only).

**And no game in the sample lets an object count decide alone.** Every one of
them also has a size or space rule that participates: Prison Architect's shared
rooms grade on "Squares per Prisoner", Oxygen Not Included's room types carry
both minimum *and maximum* cell-count constraints, and RimWorld computes an
area-derived room Space stat separate from any bed. All three are tier 2 and
opened.

So "object placement or an authored number" was never the shape of the answer in
any comparable game. The shape is: **objects decide, geometry constrains, and
the room type decides what kind of room it is.**

## Decision

### 1. Occupancy is resolved at the room-instance registration site

A resolver runs where a `RoomInstance` is constructed —
`zoning.ts:252-261` today, and the restore path
(`prisoners.roomInstanceDefinitions`, per
`room-instance-registry.ts:111-120`) alongside it. It resolves in this order:

1. **If any placed object in the room supplies occupancy, aggregate those
   objects' capabilities.** The resolved figure is the sum over the objects'
   own contributions, and the resolved capability set is their union.
2. **Otherwise, fall back to the room definition's authored nominal figure**, if
   the definition carries one.
3. **Otherwise `0`**, which is what happens today for every room and is already
   correct: an empty rectangle accommodates nobody.

Step 1 is unimplementable today and this ADR does not pretend otherwise: object
placement does not exist (`docs/HUD_PROJECTIONS.md` gap 13), so until it does,
the resolver's only reachable branches are 2 and 3. That is the point of
ordering them this way — the fallback is what makes a zoned cell usable *before*
the pillar lands, and it stops being consulted, room by room, as objects arrive.

### 2. The authored figure and the resolved figure are separate fields with different meanings

Not one field written from two sources. Two fields:

- **The room definition's authored nominal occupancy** is content, on
  `RoomCatalogDefinition`. It describes what a room of this type is *intended*
  to hold. It is never read by `findAvailable`, never summed into
  `roomCapacity`, and never shown as a room's occupancy.
- **The room instance's resolved `capacity`** stays exactly what it is today
  (`room-instance-registry.ts:25`): the number `findAvailable` and `assign`
  gate on (`:83`, `:93`) and the number the projection reports as
  `occupancy.capacity` (`room-projection.ts:99`).

The reason to keep them apart is not tidiness. One field written from two
sources cannot answer "is this room holding what it was meant to hold" — the
question a player asks of a half-furnished cell block — and it cannot be
migrated later without guessing which source wrote each stored value. Two fields
make the interesting case representable: a room whose resolved capacity is below
its nominal figure is a room that needs furniture, and that is a sentence an
interface can say.

`roomDefinitionSchema` is `.strict()` (`room-catalog.ts:61`), so this is a
content-schema change and not an additive accident: the schema rejects an
undeclared key, and every definition carries
`schemaVersion: z.literal(ROOM_CATALOG_SCHEMA_VERSION)` (`:54`), so whether that
version bumps is part of the same change. This ADR does not decide the field's
name, whether it is optional, or whether the version moves.

### 3. Assignment lives on the object, not on the room

This is the part of the decision with the clearest external evidence, and it is
a constraint on the implementation rather than a preference.

**RimWorld puts assignment on the bed** (tier 2, opened —
`RimWorld/Building_Bed.cs` and `RimWorld/BedUtility.cs` in the
`Chillu1/RimWorldDecompiled` mirror):

- `public List<Pawn> OwnersForReading => CompAssignableToPawn.AssignedPawnsForReading;`
  and `public CompAssignableToPawn CompAssignableToPawn => GetComp<CompAssignableToPawn>();`
  — the owner list is a *component on the bed*, reached through the bed's comp.
- `public int SleepingSlotsCount => BedUtility.GetSleepingSlotsCount(def.size);`,
  and `GetSleepingSlotsCount` is the whole of RimWorld's accommodation capacity
  arithmetic: its body is `return bedSize.x;`. Capacity is the bed's width in
  tiles.

Because ownership is a component on the object, deleting the object deletes the
assignment with it, and the room is not consulted. A room-level occupant list
does not have that property: it forces an eviction decision the moment one
object moves, and `RoomInstanceRegistry` holds exactly such a list today
(`occupants`, `room-instance-registry.ts:31`, with `instancesOccupiedBy`
scanning it at `:103-109`). The registry is not wrong — it predates object
placement and says so (`:8-19`) — but the day objects carry slots, the occupant
set belongs beside them, and this ADR records that rather than leaving it to be
discovered when the first bed is deleted.

### 4. The legibility answer: a three-state verdict, per room, on demand

This is the direct response to the "an authored number is opaque" objection, and
the shape to copy is Oxygen Not Included's (tier 2, opened —
`Assembly-CSharp/RoomType.cs` in the `Kupie/ONI_Decomp` mirror).

`RoomType.isSatisfactory(Room candidate_room)` returns a
`RoomType.RoomIdentificationResult`, an enum with exactly three members:
`all_satisfied`, `primary_satisfied`, `primary_unsatisfied`. The method returns
`primary_unsatisfied` if the primary constraint fails, `primary_satisfied` if
the primary holds but any additional constraint fails, and `all_satisfied`
otherwise.

That middle state is the whole value. It is the difference between an interface
that can say *"this would be a cell except for X"* and one that can only say
*"this is not a cell"*. A player who is told the second learns nothing about
what to do next.

**Lockstate is one step short of that and one step past it at the same time.**
`requirementStatus` (`room-projection.ts:180-190`) already returns a three-state
`RoomRequirementStatus` — `'satisfied-by-capability' | 'missing-capability' |
'not-evaluated'` (`:84`) — *per requirement*, and `RoomListRowViewModel` already
rolls those up as counts: `{ total, objectRequirements, satisfiedByCapability,
missingCapability, notEvaluated }` (`:113-131`). What does not exist is the
room-level verdict — the single answer ONI's enum gives. Counts are strictly
more information and strictly less legible; a surface that has to render one
line needs the verdict, and the counts are what it would compute the verdict
from.

**And it has to be per-room and on demand, not a panel.** ADR 0022 measured the
always-visible pixel budget on a local merge of #282 and #283 and found
**12.2px at 900×600 and 38.2px at 1280×720**, against a `--tap-target` of 44px
(`src/ui/tokens.css:150`) — so no always-visible control fits at either. This
tree carries a smaller number pointing the same way: `src/ui/hud/hud.css:2770-2815`
(re-anchored 2026-09-06 -- `:786-789` was already an unrelated rule,
`[data-action-failed]`'s outline, before this window opened) records the Build
panel's short-viewport fix closing a 67.7px shortfall at
900×600. **Re-anchored further: the figure has since been refined past
"3.8px to spare" to exactly 0 -- "the panel arrives at 338.1px of content in a
338.1px slot with nothing scrolled anywhere" -- because a fourth declaration
was added to recover 4.1px the catalogue's own floor had miscounted
(`hud.css:2799-2809`).** The residual slack, whichever figure,
is not the always-visible budget, and it is quoted
here only because it is the figure this tree states about that viewport; ADR
0022's 12.2px is the budget figure and was measured on a branch merge rather
than on `main`. Both say the same thing about a room-status panel: there is no
room for one.

## The genre evidence

Recorded in full because §*Why the binary was false* is the load-bearing part of
this ADR and a reader has to be able to check it. Tier and open/not-opened are
stated for every item.

### Oxygen Not Included — a shipped room system with no occupancy number

**Tier 2, opened.** `Assembly-CSharp/Room.cs` and
`Assembly-CSharp/RoomType.cs`, mirror `Kupie/ONI_Decomp`.

`Room` declares exactly four fields: `public CavityInfo cavity;`,
`public RoomType roomType;`, `private List<KPrefabID> primary_buildings;` and
`private List<Ownables> current_owners;`. **There is no capacity field and no
occupancy field.** Occupants are computed: `GetOwners()` clears
`current_owners`, walks `GetPrimaryEntities()`, and for each entity reads
`GetComponent<Ownable>()` and follows `component.assignee`. `NumOwners()` is
`GetOwners().Count`. `GetPrimaryEntities()` filters the cavity's `buildings`
**and its `plants`** through `roomType.primary_constraint.building_criteria`.

`RoomType`'s constructor takes `(id, name, description, tooltip, effect,
category, primary_constraint, additional_constraints, display_details,
priority, upgrade_paths, single_assignee, priority_building_use, effects,
sortKey)`. Fifteen parameters, and **nothing resembling a capacity.**

Klei shipped a full room system, gave it a room-type registry, an upgrade-path
graph, per-type effects and a `single_assignee` flag — and declined to give a
room an occupancy number.

**Two further ONI facts, both opened, both used above:**

- `Assembly-CSharp/RoomConstraints.cs` declares `MAXIMUM_SIZE_64`,
  `MAXIMUM_SIZE_96` and `MAXIMUM_SIZE_120` as constraints of the form
  `room.cavity.NumCells <= N`, beside `MINIMUM_SIZE_12`, `MINIMUM_SIZE_24` and
  `MINIMUM_SIZE_32`. A room can be **too large** as well as too small — which is
  a failure mode named in §*Consequences*.
- `LUXURY_BED_SINGLE` counts luxury beds in the room and returns `num5 == 1`.
  In `Assembly-CSharp/Database/RoomTypes.cs`, `PrivateBedroom` uses it as its
  primary constraint while `Bedroom` uses `HAS_LUXURY_BED` and `Barracks` uses
  `HAS_BED`, all three with `MINIMUM_SIZE_12`-or-`_24` and `MAXIMUM_SIZE_64`.
  So a Private Bedroom is a room with **exactly one** bed in it, and a second
  bed makes it a Bedroom.

### RimWorld — no room capacity at all, and a role that flips silently

**Tier 2, opened.** `Verse/Room.cs`, `RimWorld/BedUtility.cs`,
`RimWorld/Building_Bed.cs`, `RimWorld/RoomRoleWorker_Barracks.cs`,
`RimWorld/RoomRoleWorker_PrisonCell.cs`,
`RimWorld/RoomRoleWorker_PrisonBarracks.cs`,
`RimWorld/RoomStatWorker_Space.cs`, `RimWorld/Toils_LayDown.cs`; mirror
`Chillu1/RimWorldDecompiled`.

**No room capacity whatsoever.** `Verse/Room.cs` contains no occurrence of
"capacity" or "occupan" in any casing — searched over the whole file after
opening it. Capacity is the bed's, and it is one line:
`GetSleepingSlotsCount(IntVec2 bedSize)` returns `bedSize.x`. Assignment is the
bed's too (§3).

**The room's *role* is derived from its contents, and it flips with no
confirmation.** `RoomRoleWorker_Barracks.GetScore(Room room)` walks
`room.ContainedAndAdjacentThings`, counts non-medical humanlike beds that count
for bedroom-or-barracks into `num`, returns `0f` if any of them is
`ForPrisoners`, then `return 0f` when `RoomRoleWorker_Bedroom.IsBedroom(tmpBeds)`
and otherwise `return (float)num * 100100f`.

`RoomRoleWorker_PrisonCell.GetScore` counts prisoner beds and returns
`170000f` when there is exactly one non-medical one (`if (num == 1)`), `100000f`
when there is exactly one *medical* one, and `0f` otherwise.
`RoomRoleWorker_PrisonBarracks.GetScore` returns `0f` when the two counts sum to
`<= 1` and a positive score otherwise. **So placing a second prisoner bed takes
the Prison Cell score to `0f` and the Prison Barracks score above it, and the
room silently becomes a Prison Barracks.** There is no confirmation step in
either worker; both are pure scoring functions over room contents.

**Area participates, as a stat rather than as a capacity.**
`RoomStatWorker_Space.GetScore` returns `350f` for a psychologically-outdoor
room, and otherwise sums `1.4f` per standable cell and `0.5f` per
walkable-but-not-standable cell, clamped to `350f`. It is a room stat, computed
from geometry, and it is not a capacity.

**And the object never hard-fails the action.** `Toils_LayDown` grants
`ThoughtDefOf.SleptOnGround` when `bed == null || bed.CostListAdjusted().Count
== 0`, alongside `SleptOutside`, `SleptInBedroom`, `SleptInBarracks`,
`SleptInCold` and `SleptInHeat`. A pawn with no bed sleeps on the ground and
takes a mood memory for it. **The magnitude of that penalty lives in XML defs
this ADR did not open** — what is verified is the code path that grants the
thought, not the number attached to it.

### Prison Architect — shared accommodation is area-derived, from shipped strings

**Tier 2, opened.** `main/data/language/base-language.txt` and
`main/data/materials.txt`, mirror `originalfoo/Prison-Architect-API`. These are
verbatim shipped data files, not decompilation. Quoted exactly, key first:

- `buildtoolbar_popup_room_dormitory` — "A variable-size room for housing
  multiple prisoners. The bigger the dormitory, the more prisoners it can
  house."
- `roomgrading_dormitory_roomsize` — "Room size at least *X Squares per
  Prisoner"; and `roomgrading_sharedcell_roomsize` says the same. Beside them,
  `roomgrading_dormitory_outsidewindow` — "1 Outdoor Window per 8 Prisoners" —
  and `roomgrading_dormitory_item` — "Item : 1 *X per 4 Prisoners".
- `roomgrading_shared_occupuants` — "Current Occupants: *X / *Y". (The typo in
  the key is the shipped file's.)
- `buildtoolbar_popup_room_holdingcell` — "A room where new recruits are placed
  until a cell is found for them."
- `interfacetopbar_prisoners_nocells` — "*X Prisoners are unable to be assigned
  a cell".
- `roomrequirement_secure` — "Secure (behind at least one Door)"; and
  `roomrequirement_enclosed` — "Enclosed (surrounded by walls and doors)".
- `adviser_deathrow_roomrequirements2` — "The Cell needs a Bed and a Toilet."

**A contrast in the same file, worth more than any of the individual strings.**
The Cell's grading criteria are absolute and singular where the shared rooms'
are per-prisoner and plural: `roomgrading_cell_roomsize` is "Room size at least
*X Squares" with no per-prisoner clause, `roomgrading_cell_item` is "Item : *X"
with no per-prisoner divisor, and the occupancy readouts split cleanly —
`roomgrading_currentoccupant`, "Occupant entitled to grade *X", and
`roomgrading_unoccupied`, "Unoccupied", against the shared rooms' "Current
Occupants: *X / *Y". Shipped strings therefore corroborate that PA's Cell is a
**single-occupant** room and its shared rooms are counted. They do **not** state
a number, and they say nothing about how beds affect it.

### Prison Architect's own onboarding says to unblock intake with an uncapped shared room

**Tier 2, opened.** `ceos_letter` in the same `base-language.txt`, point 2,
verbatim:

> Individual jail cells are expensive, especially early on when funds are very
> tight. Save money by starting with a single large Holding Cell, which can be
> shared between many prisoners at once.

That is this repository's situation one layer up. A player who cannot yet afford
per-prisoner accommodation is told, by the game's own induction text, to
designate one large shared room and get on with it. **It is the strongest
argument in the sample that a non-object-derived accommodation room is a
shipping choice rather than only a scaffold** — and it lands on the one housing
room this tree has that no policy targets (`room.holding-cell`, and
`intake-system.ts:27-34`).

### A tempting misreading, killed

**Tier 2, opened.** `main/data/materials.txt`.

Prison Architect's shipped object definitions carry a `NumSlots` field, and it
looks exactly like the object-supplied capacity §1 asks for. It is not.

`Bed` declares `Height 2` and `NumSlots 2`. `BunkBed` declares `Height 2` and
`NumSlots 2` — **the same figure as the single bed**, in the game where a bunk
bed is the canonical way to fit two prisoners into one cell's worth of floor.
`Table` declares `Width 4` and `NumSlots 4`; `Bench` declares `Width 4` and
`NumSlots 4`; `Chair`, `Toilet`, `Crib` and `PlayMat` each declare no `Width` or
`Height` at all — so 1x1 — and `NumSlots 1`. In each of those seven, `NumSlots`
equals the object's tile length, and the pattern holds past them: `Sink` is
`Width 3` / `NumSlots 3` and `ServingTable` is `Width 5` / `NumSlots 5`. It is a
usage/footprint slot count.

So even in the game whose object definitions most look like they should carry
prisoner capacity, **capacity is decided outside them.** This is recorded
because the misreading is one grep away, and because an implementation that
copied it would put a footprint number into a capacity field.

### The search-only claim, and what depends on it

**Tier 3 — search-only. Nothing was opened; both documenting hosts are blocked
by the egress proxy**, confirmed by attempting `prisonarchitect.paradoxwikis.com`
and `prison-architect.fandom.com` and receiving an egress block for each. No
shipped artifact reachable from here states PA's room rules: the mirror above
carries `base-language.txt` and `materials.txt` but no room-definition data
file, and a search of that repository for a room capacity field returns nothing.

The claim, as search-result snippets state it:

- a Cell is a basic room for holding **one** prisoner, and that does not change
  with the number of beds in it;
- a Holding Cell holds an **unlimited** number of prisoners temporarily, and
  **beds are not a requirement** for one.

**This is the sample's only clean example of an authored accommodation capacity
shipping as an authored figure, so if it is wrong the case for the fallback
field weakens.** Stated here rather than buried, because it is the one place
where this ADR's decision rests on a tier it could not verify. What survives
regardless: §*Why the binary was false*'s first half, which rests on ONI and
RimWorld having no capacity field at all (tier 2, opened); §3, which rests on
`Building_Bed` (tier 2, opened); and §4, which rests on `RoomType.isSatisfactory`
(tier 2, opened). What weakens: the fallback in §1 step 2 loses its shipped
precedent and becomes a scaffold argued from this repository's own position
rather than from the genre. It would not become *wrong* — the CEO letter above is
tier 2 and points the same way — but it would be a thinner case, and a reviewer
who can reach those hosts should check this paragraph first.

### No migration precedent was found, and this ADR claims none

**Searched, found nothing.** No patch note, changelog or developer post was
found in which any game **removed** an authored room capacity and migrated to an
object-derived one.

The only pattern in the sample that resembles a transition at all is
**additive**, and it is a layer beside an occupancy figure rather than a
replacement of one: Prison Architect's `roomgrading_cell_*` keys grade a Cell on
its contents and its floor area — `roomgrading_cell_item`, "Item : *X",
`roomgrading_cell_roomsize`, "Room size at least *X Squares" (tier 2, opened) —
without stating the Cell's occupancy anywhere. **Whether that grading layer
arrived after the room type is not evidenced here**, because no changelog was
opened; what is evidenced is that the two coexist, in the shipped strings, as
separate things.

So this ADR **must not** be read as following precedent for a migration. §1's
ordering is not "authored now, object-derived later, and here is who else did
that". It is "object-derived is the model this tree already states, and the
authored figure is a fallback for the rooms objects do not reach yet". Nobody
was found to have done the migration, and saying otherwise would be the
invented-consequence defect this repository spends the most effort on.

## Alternatives considered

### A — an authored capacity per room type, as the sole authority. **Rejected, and named as the reversal target.**

One number per room definition; `RoomInstance.capacity` copies it at
registration; objects never participate. Cheap: a field on
`roomDefinitionSchema`, a schema-version bump, one line at
`zoning.ts:252-261`, and a zoned cell admits prisoners the same tick.

Rejected on two grounds, in this order:

1. **It contradicts a statement this tree already makes as fact.**
   `zoning.ts:50-52` says capacity comes from the objects standing in the room.
   Alternative A does not extend that sentence, it falsifies it — and it
   falsifies it in the one file a future implementer will read first.
2. **Nothing in the sample ships it as the sole authority for an accommodation
   room.** Two of three games have no room capacity field at all (tier 2,
   opened); the third derives its shared rooms from area (tier 2, opened) and
   reserves a fixed figure for a single-occupant room (tier 3, search-only).

It is named as the reversal target rather than discarded because the second
ground is exactly as strong as the tier-3 claim it leans on, and because the
first ground is a statement in a comment, which an owner may overrule. If A is
chosen, the honest change is to edit `zoning.ts:48-65` in the same commit rather
than leaving the header contradicting the schema.

### B — objects only, with no authored fallback. **Rejected.**

`RoomInstance.capacity` is the aggregate of placed objects and nothing else;
rooms with no objects stay at `0` until object placement ships.

This is the purest reading of the existing model and it is what the tree does
today. It is rejected for one reason, and it is a product reason rather than an
architectural one: **it leaves intake structurally blocked for as long as object
placement takes.** `findAvailable` rejects every zero-capacity instance
(`room-instance-registry.ts:83`), so every arrival either fails
(`intake-system.ts:126-130`) or accrues backlog ticks forever (`:133-135`), and
`docs/PRISONER_OPERATIONS.md:177-184` already records that the retry's stated
justification — that capacity may return — does not hold for a room with no beds
in it.

B is also the alternative this decision reduces to on its own, room by room,
as objects arrive. Choosing the fallback does not foreclose B; it schedules it.

### C — occupancy derived from area. **Rejected as a decision, left open as a rule.**

Prison Architect's shared rooms do exactly this — "Room size at least *X Squares
per Prisoner" (tier 2, opened) — and the geometry is already available:
`zone` takes a `width` and a `height` (`zoning.ts:203-213`) and refuses anything
outside 1…64 per side.

Rejected as *the* answer because a rectangle of floor with nothing in it is not
accommodation in this tree's own terms, and because area alone reproduces the
opacity objection in a different unit. But it is **not** rejected as a
participant: every game in the sample has a size rule that binds alongside
objects, and §*What this does not settle* leaves whether Lockstate gains one
open rather than answering it here.

## Consequences

- **Assignment must live on the object.** §3. RimWorld survives bed deletion
  because ownership is a comp on the bed; `RoomInstanceRegistry`'s room-level
  `occupants` map (`room-instance-registry.ts:31`) forces an eviction decision
  the moment one object moves. Whoever ships object placement owes that
  decision, and this ADR is where it was foreseen rather than discovered.

- **Six failure modes to design around.** Each is attributed to where it was
  observed; none is invented here.

  1. **A designated room silently holding nobody.** A zoned cell with no bed and
     no nominal figure is a matching instance that never frees up
     (`docs/PRISONER_OPERATIONS.md:177-184`). Two answers exist in the sample and
     they are different in kind. Prison Architect keeps a persistent counter on
     the top bar — `interfacetopbar_prisoners_nocells`, "*X Prisoners are unable
     to be assigned a cell" (tier 2, opened). RimWorld degrades instead: the
     pawn sleeps on the ground and takes a `SleptOnGround` mood memory
     (`Toils_LayDown.cs`, tier 2, opened), so the action never hard-fails. This
     tree currently does the third thing — it hard-fails or retries forever
     (`intake-system.ts:126-135`) — and says nothing to the player: nothing in
     `src/` outside `intake-system.ts` reads `getMetrics()` (`:80-82`), so
     `IntakeMetrics.accommodationBacklogTicks` reaches no projection and no
     surface.
  2. **A room's type flipping when its contents change.** RimWorld's role
     workers are pure scoring functions with no confirmation step: a second
     prisoner bed drops `RoomRoleWorker_PrisonCell` to `0f` and lifts
     `RoomRoleWorker_PrisonBarracks` above it. ONI does the same at the
     constraint level — `LUXURY_BED_SINGLE` returns `num5 == 1`, so a second
     luxury bed demotes a Private Bedroom. Both tier 2, opened. Lockstate is not
     exposed to this today, because the zoning plane stores a room *type* the
     player chose (`zoning.ts:243-251`) and nothing re-derives it — but a
     resolver that reads objects is one step from a system that would.
  3. **A space rule binding below the object count.** PA grades a dormitory on
     both "Squares per Prisoner" and its bed places (tier 2, opened; the
     interaction between them is tier 3). When two rules bind, **the interface
     must name which one binds** — "no space" and "no beds" are different
     instructions to the player, and a single number cannot carry either.
  4. **Capacity thrash on edit.** A resolver that runs at registration is stable;
     one that runs on every object placement makes capacity a value that changes
     under an assignment. Nothing in this tree re-runs registration today
     (`zoning.ts:262` registers once), and §1 deliberately places the resolver at
     registration for that reason.
  5. **Ambiguity about what counts as "in the room".** RimWorld counts
     `ContainedAndAdjacentThings` — every role worker above iterates it (tier 2,
     opened) — so a bed in a doorway counts for the rooms on *both* sides.
     **This has to be decided before placement exists, not after.** The zoning
     plane cannot currently answer it in either direction: a zoned tile holds a
     room type and not an instance id (`zoning.ts:41-46`), so "which instance is
     this tile part of" is unanswerable, and `docs/HUD_PROJECTIONS.md` gap 15
     records that `RoomInstanceRegistry` has no enumeration of its own.
  6. **Enclosure edits invalidating a room, including by growing it.** PA's
     `roomrequirement_enclosed` is "Enclosed (surrounded by walls and doors)"
     and ONI carries `MAXIMUM_SIZE_64`/`_96`/`_120` as
     `room.cavity.NumCells <= N` beside its minimums (both tier 2, opened) — so
     a room can be invalidated by becoming too *large*. Lockstate has minimums
     only, as `minimum-size` requirements in the catalog
     (`room-catalog.ts:66-159`), and `requirementStatus` projects them as
     `'not-evaluated'` (`room-projection.ts:185`), so today neither direction is
     checked.

- **The legibility shape to copy is a three-state verdict per room, computed on
  demand.** §4. `requirementStatus` already produces three states per
  requirement (`room-projection.ts:84`) and `RoomListRowViewModel` already rolls
  them up as counts (`:113-131`); what is owed is the room-level verdict ONI's
  `RoomIdentificationResult` gives, and it must be per-room and on demand
  because there is no always-visible budget for a panel (ADR 0022's 12.2px at
  900×600 against a 44px `--tap-target`, `src/ui/tokens.css:150`).

- **The room catalog's content schema changes, and every definition is
  re-validated.** `roomDefinitionSchema` is `.strict()` with six fields
  (`room-catalog.ts:52-61`) and the module throws at load time if any of the 18
  definitions fails (`:187-189`), so §2's field cannot be added quietly.
  Whether `ROOM_CATALOG_SCHEMA_VERSION` (`:5`) moves and whether the field is
  optional are the implementation's calls, not this ADR's; what is certain is
  that all 18 definitions are re-parsed against the new schema on the next
  module load.

- **`roomCapacity` on the status strip starts being non-zero for a room with no
  objects in it**, and that is a behaviour change a reader should not have to
  infer. `status-strip-projection.ts:150-155` sums `instance.capacity`, and
  `docs/HUD_PROJECTIONS.md` gap 13 currently records `roomCapacity: 0` as the
  room's true state. Under this decision, a zoned room of a type carrying a
  nominal figure resolves non-zero at registration, so gap 13's second paragraph
  and `docs/PRISONER_OPERATIONS.md:171-184` both stop being accurate and are
  owed an edit by the implementation.

- **`zoning.ts:48-65` is owed an edit too, and a small one.** Its claim that
  capacity comes from the objects stays true; what changes is `:60-65`, which
  says the room catalog carries no capacity and that the content addition is a
  product decision recorded on #261. Under this decision that product decision
  has been taken, and the header should cite this ADR instead of deferring.

- **Nothing here is enforced by a test, and nothing here changes a test.** This
  is docs-only: the ADR and its row in `docs/adr/README.md` are the whole of the
  change. `tests/foundation/adr-numbering-contract.test.ts` gates the number,
  the heading, the status and the index row in both directions, and it is the
  only test this commit touches the inputs of. No gate can assert that an
  authored figure is a fallback rather than an authority; that is held by this
  document and by the row that reports its status.

## What this decision does not settle

Left open deliberately. None has an answer in the tree, and inventing one here
would be worse than leaving it named.

1. **The authored nominal figures themselves.** Numbers are content and a
   product call. This ADR says where the figure sits and what reads it, not
   what it is for `room.cell`, and not whether every room type gets one.
2. **Whether a space rule ever participates.** Alternative C. Every game in the
   sample has one; this tree has `minimum-size` requirements that
   `requirementStatus` reports as `'not-evaluated'`
   (`room-projection.ts:185`) and no maximum at all. Whether occupancy is
   additionally bounded by floor area is a separate decision, and it is the one
   most likely to arrive with real geometry validation
   (`docs/HUD_PROJECTIONS.md` gap 14).
3. **The minimum object set for a functioning room.** The evidence disagrees
   with itself, which is why this is open rather than decided: Prison Architect
   requires a bed *and a toilet* for a Cell —
   `adviser_deathrow_roomrequirements2`, "The Cell needs a Bed and a Toilet."
   (tier 2, opened) — while RimWorld requires exactly one prisoner bed and no
   toilet (`RoomRoleWorker_PrisonCell`, tier 2, opened). This tree's
   `room.cell` and `room.solitary-cell` both already require bed + toilet
   (`room-catalog.ts:66-71`, `:77-82`), which matches PA; whether the *toilet*
   should gate occupancy or only grade the room is unsettled.
4. **Whether a door is a capability or a room requirement.** The research found
   **no game treating a door as a capability provider.** Prison Architect
   treats it as a room requirement — `roomrequirement_secure`, "Secure (behind
   at least one Door)" (tier 2, opened) — which is cheaper and more legible: a
   requirement is a sentence a room either satisfies or does not, while a
   capability would have to be aggregated and then interpreted. This ADR
   records the finding and takes no decision — and it is more open than it
   looks, because this catalog has already done the *other* thing once:
   `room.delivery-bay` requires `object.loading-dock-door`
   (`room-catalog.ts:152`), which is an `object` requirement over a definition
   whose capability is `'delivery-access'` (`object-catalog.ts:58`). So a door
   already reaches a room through the capability path here, for access rather
   than for security, while `DoorRegistry` is where a door's own state lives.
   Whether a *security* door should follow that path or PA's is exactly what is
   unsettled.
5. **Whether the resolver ever re-runs.** §1 places it at registration and
   failure mode 4 explains why. What happens the day a bed is placed inside an
   already-registered room is the object-placement feature's decision, not
   this one's — but it is the decision that makes or breaks §3.

---

## Amendment — 2026-08-25: the fallback resolves a capability set as well as a number, or it resolves nothing

**Everything above this line is unchanged and stays unchanged.** The *Decision*
section still records what was chosen under the delegation, and §1's ordering —
objects first, an authored nominal figure second, `0` third — is what was
accepted. This amendment corrects one claim the document rests on and states the
fallback's real relationship to
[ADR 0028](./0028-object-placement-and-derived-room-capacity.md), because this
ADR was **kept accepted rather than marked superseded** and must therefore not be
left asserting something that is not true of `main`.

### The correction: this ADR frames the question as being about `capacity`, and capacity is only half the gate

§*The mechanism the decision has to fit* above states both halves of
`findAvailable` correctly. What the rest of the document then does is treat the
decision as being about **`capacity`** — §1 resolves "occupancy", §2 is titled
"the authored figure and the resolved figure", and step 2 of §1 falls back to
"the room definition's authored nominal figure" and says nothing about
capabilities. That framing is wrong in a way that matters: **a fallback that
resolves only a number produces no observable behaviour at all.**

Verified on `main` at `d5c50f8` (v0.0.56), by reading each site and then by
constructing the case. **This amendment is left as it was written at that
commit, and two of its sentences about §*The mechanism* stopped being literally
true on 2026-08-30**, when #645 rewrote that section to quote code instead of
anchoring to it: the method it names there is no longer called `findAvailable`
(ADR 0028 decision 3 split it into `findAvailableResidence` and
`findAvailableForUse`) and the field is no longer called `capacity` (it is
`residentCapacity`). Both halves of the gate are still stated there, which is
what the correction below turns on, so the substance of these two sentences
holds and only the spellings have moved. They are marked rather than rewritten
because the amendment is dated evidence about `d5c50f8`:

- `RoomInstanceRegistry.findAvailable`
  (`src/simulation/prisoners/room-instance-registry.ts`, `public findAvailable`)
  rejects an instance on two independent counts — `occupancyOf(instanceId) >=
  instance.capacity`, and, when a capability is asked for,
  `!instance.objectCapabilities.includes(requiredObjectCapability)`.
- `findBestAvailable` (same file, `public findBestAvailable`) repeats **both**
  checks before it rates anything, and it — not `findAvailable` — is the lookup
  on the intake path since #79's cell-sharing rating landed
  (`src/simulation/prisoners/intake-system.ts`, the `accommodation-assignment`
  stage). §*The mechanism* above named only `findAvailable` when this was
  written; the second lookup gates identically, so the correction applies to
  both.
- `DEFAULT_ACCOMMODATION_POLICY` asks for `'sleep-surface'` for both of the room
  ids it targets (`intake-system.ts`, `DEFAULT_ACCOMMODATION_POLICY`), and
  `RoomZoningService` registers every zoned instance with `objectCapabilities:
  []` (`src/simulation/rooms/zoning.ts`, `const instance: RoomInstance`).
- Constructed and run: a `room.cell` instance registered with `capacity: 2` and
  `objectCapabilities: []` is returned by neither `findAvailable` nor
  `findBestAvailable` for that policy's target, while `findAvailable('room.cell')`
  with no capability argument returns it and `assign` accepts an occupant into
  it. So the capability half is what refuses, the capacity half is satisfied, and
  a nominal figure of 2 on `room.cell` would leave every arrival accruing
  `accommodationBacklogTicks` exactly as `capacity: 0` does today.

ADR 0028 §*Context* records the same correction independently and in the same
terms, and traces it to the room-occupancy research memo's §6
(`docs/research/2026-08-25-room-occupancy.md`). It also records the two
consequences that follow and are not restated here: that the zero switches off
the five `room-catalog-id` actions through `ActionSystem` as well as intake, and
that `own-accommodation` re-checks neither gate, so the first placed bed buys
more than sleep.

**What this changes about §1 step 2, and it is the whole of the change.** If the
fallback is ever built, the room definition has to author a *capability set*
beside its nominal number — or the resolver has to derive one — and §2's "two
fields with different meanings" becomes two fields and a set. Authoring only the
number is not a cheap partial version of this decision; it is a change with no
effect, and it would read as one shipped and working. **Nothing in §1, §2 or
§*Consequences* is otherwise disturbed:** the ordering, the two-field split, the
six failure modes and §3's "assignment lives on the object" all stand.

### Why this ADR is Accepted rather than Superseded

0028 answers the question this ADR asks, and answers it by building the
authority §1 names. The obvious bookkeeping would be to mark this ADR superseded
by it. The owner deliberately did not, and the reason is the schedule rather than
the design: **object placement is the largest item in the backlog**, 0028 carries
a phase order that says how many phases pass before a prisoner can sleep, and if
that build proves too large the authored nominal fallback is the thing that keeps
a zoned cell usable in the meantime. Superseding this document would retire the
fallback along with the question.

So the two stand together, with the precedence unchanged from §1: objects decide,
and the authored figure is consulted only where no object does. What this
amendment adds is that "consulted" has to mean a capability as well as a count.

### Status of this amendment

**Accepted, 2026-08-25**, with the ADR. It corrects a claim rather than deciding
anything: it authors no number, names no field, and does not move
`ROOM_CATALOG_SCHEMA_VERSION`. §*What this decision does not settle* is unchanged
and all five items stay open.
