# Where room occupancy comes from — evidence for ADR 0023

Research memo. No code written, no repository files changed.

## 0. What I could and could not check

**Network reality differs from the briefing.** `WebSearch` works. `WebFetch` is
blocked for every game wiki and forum I tried (`prisonarchitect.paradoxwikis.com`,
`prison-architect.fandom.com`, `rimworldwiki.com`, `steamcommunity.com`,
`forums.introversion.co.uk` — each returned an explicit egress block).
`raw.githubusercontent.com` works and serves whole files. `api.github.com`
returns 403.

So there are three evidence tiers below, and **every external claim carries its
tier inline**:

- **VERIFIED (opened)** — I downloaded the file and read the lines I quote.
  These are community mirrors of shipped artifacts: verbatim game data files
  (`materials.txt`, `base-language.txt`, `needs.txt`) and machine decompilations
  (RimWorld, Oxygen Not Included). A mirror can be stale or edited and none is a
  vendor specification, but I read the actual bytes rather than a summary of them.
- **VERIFIED (repo)** — read directly in `/workspace/lockstate`.
- **SEARCH-ONLY** — a search engine's summary of a page I could not open. Treat
  as community consensus, not as fact. Anything load-bearing that is search-only
  is flagged again at the point of use.
- **FROM MEMORY** — I believe it, I could not check it. Used sparingly and
  always labelled.
- **UNKNOWN** — stated as unknown rather than filled in.

**I re-verified the existing ADR 0023 draft's external quotes rather than
trusting them.** The `ceos_letter` quote, the `roomgrading_*` strings, the
`NumSlots` reading, `BedUtility.GetSleepingSlotsCount`, ONI's `Room` field list
and `RoomType.isSatisfactory` all check out verbatim. I found no fabrication.
I did find **three things that draft got wrong or missed**, listed in §6.

---

## 1. How comparable games actually derive room capacity

The answer differs sharply between them, and the axis of difference is not
"object vs. room vs. area" — it is **whether the game has a room-occupancy
concept at all.** Four of the six do not.

| Game | Is capacity a room property? | An object count? | A function of area? | Tier |
|---|---|---|---|---|
| **RimWorld** | No — no room capacity exists | Yes, entirely: bed slots | No (area is a separate *stat*) | VERIFIED (opened) |
| **Oxygen Not Included** | No — no capacity field on a room | Yes: duplicants are assigned to beds | No, but area is a **hard min *and max*** gate on the room's *type* | VERIFIED (opened) |
| **The Sims** | No — rooms have no capacity | Yes: bed sleeping slots | No | SEARCH-ONLY |
| **Theme Hospital** | No | Yes: beds you buy, wall-placed | Indirectly — walls limit bed count | SEARCH-ONLY |
| **Two Point Hospital** | No | Yes: beds placed | Indirectly, plus screens/nurses throttle throughput | SEARCH-ONLY |
| **Prison Architect** | **Yes, and it varies per room type** | Partly | Partly | mixed, see §2 |

### RimWorld — VERIFIED (opened)

Mirror `Chillu1/RimWorldDecompiled`, files downloaded and read.

`Verse/Room.cs` (20,802 bytes) contains **no occurrence of "capacity" or
"occupan" in any casing.** I grepped the whole file after downloading it. There
is no room capacity in RimWorld.

Capacity is the bed's, and it is one line. `RimWorld/BedUtility.cs`, complete
method:

```csharp
public static int GetSleepingSlotsCount(IntVec2 bedSize)
{
    return bedSize.x;
}
```

That is the entirety of RimWorld's accommodation arithmetic: **a bed holds as
many pawns as it is tiles wide.** `Building_Bed.cs:253` is
`public int SleepingSlotsCount => BedUtility.GetSleepingSlotsCount(def.size);`.

Assignment lives on the object too: `Building_Bed.cs:40-42` —
`OwnersForReading => CompAssignableToPawn.AssignedPawnsForReading;` reached via
`GetComp<CompAssignableToPawn>()`. Delete the bed and the assignment goes with
it; the room is never consulted.

Area participates, but as a **stat, not a capacity**.
`RoomStatWorker_Space.GetScore` returns `350f` for a psychologically-outdoor
room, else sums `1.4f` per standable cell + `0.5f` per walkable-not-standable
cell, clamped to `350f`. That number feeds mood, not headcount.

The room's *role* is derived from contents by pure scoring functions.
`RoomRoleWorker_PrisonCell.GetScore` returns `170000f` when the room contains
exactly one non-medical prisoner bed, `100000f` for exactly one medical one,
`0f` otherwise — so a second prisoner bed zeroes the Prison Cell score and the
room becomes a Prison Barracks.

### Oxygen Not Included — VERIFIED (opened)

Mirror `Kupie/ONI_Decomp`, files downloaded and read.

`Room.cs` declares exactly four fields:

```csharp
public CavityInfo cavity;
public RoomType roomType;
private List<KPrefabID> primary_buildings = new List<KPrefabID>();
private List<Ownables> current_owners = new List<Ownables>();
```

**No capacity, no occupancy number.** Occupants are computed on demand:
`NumOwners()` is `GetOwners().Count`, and `GetOwners()` walks the room's primary
buildings, reads each one's `Ownable` component, and follows `component.assignee`.
Occupancy is a *derived view over the objects*, never stored on the room.

`RoomType`'s constructor takes fifteen parameters — id, name, description,
tooltip, effect, category, primary_constraint, additional_constraints,
display_details, priority, upgrade_paths, single_assignee, priority_building_use,
effects, sortKey — and **not one of them resembles a capacity.**

Area is a hard gate on room *type*, in both directions.
`RoomConstraints.cs` declares `MINIMUM_SIZE_12/24/32` as
`room.cavity.NumCells >= N` and `MAXIMUM_SIZE_64/96/120` as
`room.cavity.NumCells <= N`. **A room can be too large as well as too small.**
Bed constraints are separate: `HAS_BED`, `HAS_LUXURY_BED`, `NO_LUXURY_BEDS`,
`LUXURY_BED_SINGLE`.

In `Database/RoomTypes.cs`: `Barracks` uses `HAS_BED` as its primary constraint,
`Bedroom` uses `HAS_LUXURY_BED`, `PrivateBedroom` uses `LUXURY_BED_SINGLE`. So a
Private Bedroom is *a room with exactly one luxury bed in it*; add a second and
it becomes a Bedroom. Klei shipped a full room system with a type registry, an
upgrade-path graph and per-type morale effects, **and declined to give a room an
occupancy number.**

### The Sims — SEARCH-ONLY

Single beds hold one Sim, doubles hold two, and two Sims share a double only if
related or romantically involved. Ownership is per-bed and player-settable in
Sims 3. Rooms in The Sims are not gameplay containers with capacity at all —
enclosure and decor feed a *Room / Environment* motive, which is relevant to §3
but is not occupancy.

### Theme Hospital / Two Point Hospital — SEARCH-ONLY

Theme Hospital's Ward: minimum 6×6, "the room can be as large as the player
wishes and can have as many beds as the player is willing to buy, but beds may
only be placed against the walls" — so capacity is a bed count that geometry
indirectly limits. Two Point Hospital's Ward: minimum 4×3, capacity is beds
placed, but *effective* throughput is throttled by changing screens (roughly one
per three beds) and nurses. Neither has a room capacity property.

**Note the shape here, because it recurs:** in both hospital games the room's
capacity is objects, and the room's *minimum size* is authored. Lockstate
already authors minimum sizes (§5).

---

## 2. Prison Architect specifically

This is the game the framing leans on, and the honest answer is: **capacity in
Prison Architect comes from the room designation, and each housing designation
computes it by a different rule.** The bed is a *legality requirement*, not the
source of the number.

**VERIFIED (opened)** — mirror `originalfoo/Prison-Architect-API`, file
`main/data/language/base-language.txt` (202,658 bytes), downloaded and grepped.
Quoted exactly, key first:

- `buildtoolbar_popup_room_cell` — "Where your prisoners live."
- `buildtoolbar_popup_room_holdingcell` — "A room where new recruits are placed
  until a cell is found for them."
- `buildtoolbar_popup_room_dormitory` — "A variable-size room for housing
  multiple prisoners. The bigger the dormitory, the more prisoners it can house."
- `buildtoolbar_popup_room_sharedcell` — "A multiple-occupancy cell for holding
  multiple prisoners. **Can hold up to 8 prisoners.**"
- `adviser_deathrow_roomrequirements2` — "The Cell needs a Bed and a Toilet."
- `roomgrading_cell_roomsize` — "Room size at least *X Squares"
- `roomgrading_cell_item` — "Item : *X"
- `roomgrading_dormitory_roomsize` — "Room size at least *X Squares **per
  Prisoner**"
- `roomgrading_dormitory_item` — "Item : 1 *X **per 4 Prisoners**"
- `roomgrading_dormitory_outsidewindow` — "1 Outdoor Window per 8 Prisoners"
- `roomgrading_sharedcell_roomsize` — "Room size at least *X Squares per Prisoner"
- `roomgrading_currentoccupant` — "Occupant entitled to grade *X"
- `roomgrading_unoccupied` — "Unoccupied"
- `roomgrading_shared_occupuants` — "Current Occupants: *X / *Y" (typo is the
  shipped file's)
- `interfacetopbar_prisoners_nocells` — "*X Prisoners are unable to be assigned
  a cell"
- `interfacetopbar_prisonercells_shared` — "Shared capacity: *X"

**The grammatical contrast is the evidence.** The Cell's grading strings are
absolute and singular ("Room size at least *X Squares", "Item : *X") and its
occupancy readouts are singular ("Occupant entitled to grade *X", "Unoccupied").
The shared rooms' strings are per-prisoner and plural, and their readout is a
fraction ("Current Occupants: *X / *Y"). **PA's Cell is a single-occupant room
and its shared rooms are counted against a computed maximum.** That is what the
shipped strings prove. They do not state the Cell's number.

Answering the question as asked, per designation:

| Designation | Where capacity comes from | Tier |
|---|---|---|
| **Cell** | The designation. Fixed at 1. A bed is a *requirement* (`roomrequirement`), not a quantity — a second bed does not make it hold 2. | SEARCH-ONLY for the number "1"; VERIFIED (opened) that its strings are singular and that it requires a Bed and a Toilet |
| **Holding Cell** | Nothing — **uncapped**. Beds are **not** a requirement. | SEARCH-ONLY |
| **Shared Cell** | Authored cap of **8**, plus a per-prisoner area grading rule. | VERIFIED (opened) for "Can hold up to 8 prisoners" |
| **Dormitory** | **min(area ÷ 4, bed slots)** — "1 prisoner per 4 squares, given there are enough beds for all prisoners", with an exception: a 2×3 dormitory with one bunk bed holds 2 on 6 squares. | VERIFIED (opened) that the rule is per-prisoner area; SEARCH-ONLY for the divisor 4 and the 2×3 exception |

**So yes, PA distinguishes them sharply, and by *rule kind*, not just by number:**
one designation is a fixed authored constant, one is uncapped, one is an
authored cap, one is a min() of an area rule and an object count. This is the
single most decision-relevant external finding in this memo: **the genre's most
faithful reference implementation does not have one occupancy rule. It has one
per room type.**

### A trap I checked and confirmed is a trap — VERIFIED (opened)

PA's `main/data/materials.txt` gives objects a `NumSlots` field, which looks
exactly like an object-supplied capacity. It is not accommodation capacity.
Downloaded and read:

```
Name Bed        Height 2   NumSlots 2
Name BunkBed    Height 2   NumSlots 2
Name SuperiorBed Height 2  NumSlots 2
Name Table      Width  4   NumSlots 4
Name Bench      Width  4   NumSlots 4
Name Chair      (no dims)  NumSlots 1
```

`BunkBed` — the canonical way to fit two prisoners into one bed's floor space —
carries **the same `NumSlots` as a single Bed.** In every case `NumSlots` equals
the object's tile length. It is a **usage/footprint slot count**: how many
actors can stand at the thing at once. An implementation that grepped for it and
wired it into a capacity field would be putting a footprint number in an
occupancy field.

But note the *other* half of that: `NumSlots` **is** the right concept for
"how many can use this room simultaneously" — which is a different quantity from
"how many sleep here", and one that Lockstate's single `capacity` field is
currently being asked to express as well. §5 returns to this.

---

## 3. The needs question — and this is where the framing needs correcting

The premise of the question is that under option (b) "the six needs have nothing
to be satisfied BY." **That premise is measurably wrong about this codebase, and
it is wrong in both directions at once.** I read the code.

### What the genre does when an object is missing

Nobody blocks. Everybody **degrades, visibly, with a named consequence.**

**Prison Architect — VERIFIED (opened).** `main/data/needs.txt`, downloaded and
read. Every need is a block with `TimeToAction` and `TimeToFailure`, and some
carry a `FailureAction`:

```
BEGIN Need
    Name                 Bladder
    Priority             9
    FailureAction        Urinate
    TimeToAction         600.000
    TimeToFailure        720.000
END

BEGIN Need
    Name                 Bowels
    FailureAction        SoilSuit
    TimeToAction         600.000
    TimeToFailure        1440.00
END
```

The three distinct `FailureAction` values in the whole file are `Urinate`,
`SoilSuit` and `Withdrawal`. **A prisoner who cannot reach a toilet does not
stall — he urinates on the floor, and the mess is a thing staff must clean.**
The unsatisfiable need becomes visible content rather than a blocked state
machine.

**RimWorld — VERIFIED (opened).** `Toils_LayDown.cs:212-214`:

```csharp
if (bed == null || bed.CostListAdjusted().Count == 0)
{
    actor.needs.mood.thoughts.memories.TryGainMemory(ThoughtDefOf.SleptOnGround);
}
```

A pawn with no bed **sleeps on the ground** and takes a mood memory for it,
alongside `SleptOutside`, `SleptInBedroom`, `SleptInBarracks`. The sleep need is
satisfied without any object; only the mood cost differs. (The *magnitude* of the
penalty lives in XML defs I did not open — UNKNOWN.)

**Prison Architect's Holding Cell is the exact case being asked about, and it
ships.** SEARCH-ONLY: "A holding cell can hold an unlimited number of prisoners
temporarily… Beds are not a requirement for holding cells… beds are recommended
for prisoners without an individual cell to be able to relieve their sleep need."
And VERIFIED (opened), `ceos_letter` point 2, PA's own induction text:

> Individual jail cells are expensive, especially early on when funds are very
> tight. Save money by starting with a single large Holding Cell, which can be
> shared between many prisoners at once.

So the genre's flagship title **tells the new player to unblock intake with an
uncapped, bed-free, abstract shared room** — and accepts as a consequence that
the sleep need in it goes unsatisfied and the room becomes a riot risk. That is
not a scaffold the developers were embarrassed by; it is the onboarding path.

### Is there precedent for a room satisfying a need with no object in it? Yes.

**VERIFIED (opened), PA `needs.txt`.** Four of PA's needs have no `FailureAction`
and no object that satisfies them:

- **Privacy** — satisfied by floor area per prisoner. SEARCH-ONLY for the
  specific rule ("the dormitory must be larger than 12 squares times the number
  of prisoners housed in it"), but VERIFIED that `Privacy` is a need block and
  that the dormitory grading strings are per-prisoner area rules.
- **Environment** — note its block carries **no `AutoCharge` property**, unlike
  almost every other need. It is ambient: room cleanliness and quality, not an
  action against an object.
- **Comfort**, **Freedom** — likewise not object-satisfied.

The Sims' *Room/Environment* motive is the same idea (SEARCH-ONLY). RimWorld's
room stats — Space, Beauty, Impressiveness — are computed from geometry and
contents and feed mood directly with no action taken (VERIFIED for Space).

**So the answer to "is there precedent for a room itself satisfying a need" is
yes, clearly, in at least three of the six games.** But note *which* needs: the
ambient, slow, mood-shaped ones. No game in the sample lets a room satisfy
bladder, hunger or sleep without an object. Those are the ones with failure
actions.

### What option (b) would actually produce in *this* codebase

Here I stop citing other games and read `/workspace/lockstate`. All VERIFIED (repo).

`DEFAULT_ACTIONS` (`src/simulation/prisoners/actions.ts:25-60`) has eight
entries. Sorting them by how they resolve a target
(`src/simulation/prisoners/action-system.ts:211-217`):

```csharp
private resolveTargetInstance(entityId, action): RoomInstance | undefined {
  if (action.target.kind === 'own-accommodation') {
    const instanceId = this.coldState.getAccommodation(entityId);
    return instanceId === undefined ? undefined : this.roomInstances.getById(instanceId);
  }
  return this.roomInstances.findAvailable(action.target.roomCatalogId, action.requiredObjectCapability);
}
```

**Two different resolution paths, and this is load-bearing:**

- **`own-accommodation` (3 actions: `action.sleep`, `action.eat-in-cell`,
  `action.use-toilet`)** calls `getById`. It checks **neither capacity nor
  capability.** `action.sleep` declares `requiredObjectCapability:
  'sleep-surface'` and `action.use-toilet` declares `'sanitation'`, and
  **neither is ever checked on this path.** Once a prisoner holds an
  accommodation, sleeping and using the toilet work regardless of what is in
  the room.
- **`room-catalog-id` (5 actions: `eat-meal`, `shower`, `yard-recreation`,
  `common-room-recreation`, `classroom-education`)** calls `findAvailable`,
  which gates on **both** counts
  (`src/simulation/prisoners/room-instance-registry.ts:81-87`):

```csharp
public findAvailable(roomCatalogId, requiredObjectCapability?) {
  return this.allByRoomCatalogId(roomCatalogId).find((instance) => {
    if (this.occupancyOf(instance.instanceId) >= instance.capacity) return false;
    if (requiredObjectCapability !== undefined && !instance.objectCapabilities.includes(requiredObjectCapability)) return false;
    return true;
  });
}
```

Three consequences follow, and the first is the finding that changes the decision:

**(i) Option (b) as literally stated does not unblock population.** Authoring an
occupancy number per room type sets `capacity`. But `IntakeSystem`'s
`DEFAULT_ACCOMMODATION_POLICY` (`intake-system.ts:27-34`) asks
`findAvailable('room.cell', 'sleep-surface')`, and the registration site
(`zoning.ts:252-261`) sets `objectCapabilities: []`. **The capability half of
that `find` predicate still fails.** A capacity of 2 on `room.cell` changes
nothing: every arrival still accrues `accommodationBacklogTicks` forever. The
minimum viable content change is **two** fields, not one — a number *and* a
capability set.

**(ii) `capacity: 0` blocks far more than intake.** All five `room-catalog-id`
actions go through `findAvailable`, so `0 >= 0` rejects every instance and
**`eat-meal`, `shower`, `yard-recreation`, `common-room-recreation` and
`classroom-education` are all unreachable today**, including the three that
require no object capability at all. The zero is not only an accommodation
problem; it is switching off most of the needs loop.

**(iii) Once intake succeeds, five of six needs become serviceable — and the
sixth needs only one authored capability.** Because `own-accommodation` never
re-checks capability:

| Need | Decay/tick | Satisfied by | Blocked by, under a capacity-only fix |
|---|---|---|---|
| bladder | 0.08 | `action.use-toilet` (own-accommodation) | nothing — works |
| hunger | 0.05 | `action.eat-in-cell` (own-accom) + `action.eat-meal` (canteen, needs `dining`) | in-cell works; canteen needs a capability |
| sleep | 0.03 | `action.sleep` (own-accommodation) | nothing — works |
| hygiene | 0.02 | `action.shower` (shower-room, needs `hygiene`) | **needs a capability** |
| recreation | 0.015 | yard / common-room / classroom — **no capability required** | nothing — works |
| safety | 0.01 | trickle from `action.sleep` (+0.2) and yard (+0.1) | nothing — works |

(Decay rates VERIFIED at `src/simulation/prisoners/needs.ts:52-57`.)

### So: does option (b) produce a game that visibly works, or prisoners starving in an abstract box?

**Neither, as stated — and the honest answer is more useful than either.**

Prisoners would **not** starve: `action.eat-in-cell` requires no object and
`hunger` is the second-fastest decay. And they would not sit blocked in an
abstract box: sleep, bladder, hunger and recreation all become serviceable the
moment a prisoner holds an accommodation instance.

But **option (b) as the briefing states it — "author one occupancy number per
room type" — does not get a prisoner into an accommodation at all**, because the
capability gate is independent of the capacity gate. Option (b) is not a small
version of a working game; **it is a change that produces no observable
difference whatsoever.** That is the thing I would most want the owner to know
before choosing between (a), (b) and (c).

The variant that *does* work — call it **(b′): a nominal occupancy number **and**
a nominal capability set per room type** — produces a game where all six needs
are serviceable and the whole intake→assignment→action→needs loop runs
end-to-end. That is genuinely a visibly working game. Its real cost is not
"prisoners starve"; it is that **every empty rectangle behaves as though it were
fully furnished**, which removes exactly the pressure that object placement is
supposed to create, and hands the player nothing to look at inside the room.

---

## 4. Sequencing — what development histories actually show

Honest summary: **I found no game that shipped abstract rooms first and added
objects later. I found the opposite pattern twice, and both are search-only.**

- **Oxygen Not Included: objects came first, the room system came later.**
  SEARCH-ONLY, and the search results were partly self-contradictory. What they
  agree on: ONI released into early access in May 2017, cots existed before the
  room-type system, and room types were introduced progressively across later
  builds (one result names build `OC-254439` as adding recreational, greenhouse
  and powerplant room types; another names the Oil Upgrade, `OI-235856`,
  October 2017, as adding the Comfy Bed and the Bedroom/Barracks distinction).
  I could not open the version-history pages to reconcile the build numbers.
  **Direction: confident. Dates and build numbers: LOW CONFIDENCE.**
  Corroborating this indirectly, VERIFIED (opened): ONI's `RoomType` has an
  `upgrade_paths` array and `Barracks` lists `{ Bedroom, PrivateBedroom }` as
  its upgrades — the shape of a system that grew room types on top of existing
  buildings.

- **Prison Architect: the single Cell shipped first; multi-occupancy shipped
  later.** SEARCH-ONLY: the Dormitory and Shared Cell room types, and the Bunk
  Bed, arrived in "Update 1" (post-1.0, 2016) as a new room type with "multiple
  occupancy cells and BUNK BEDS". Objects — Bed, Toilet — were room
  *requirements* from early alpha. So PA's order was: object-gated single
  occupancy first, then the more abstract counted rooms. **The opposite of the
  sequencing option (b) would imply.** I could not open the changelog
  (`forums.introversion.co.uk` is blocked), so the attribution to "Update 1" is
  search-only.

- **RimWorld: UNKNOWN.** I could not establish when room roles or room stats
  were added relative to beds. `rimworldwiki.com` is blocked and searches
  returned nothing on the timeline.

- **The Sims, Theme Hospital, Two Point Hospital: UNKNOWN.** Not investigated
  for sequencing.

- **Did any game migrate *from* an authored room capacity *to* an
  object-derived one? NOT FOUND.** I searched for this specifically and found
  no patch note, changelog or developer statement describing such a migration.
  Absence of evidence here, not evidence of absence — but it means **nothing in
  this memo supports "author it now, migrate later" as a path other people have
  walked.** If the owner picks that path, they are picking it on this project's
  own reasoning, not on precedent.

---

## 5. The smallest thing that makes the game visibly work

### First, three facts about this repository that reframe the cost

All VERIFIED (repo).

**(1) Geometry is already authored, and already dead content.** Every one of the
18 room definitions carries a `minimum-size` requirement with `minWidth`,
`minHeight` and `minTiles` — `room.cell` is `{ minWidth: 2, minHeight: 3,
minTiles: 6 }`, which is exactly Prison Architect's 2×3 minimum cell. But
`RoomZoningService.zone()` (`src/simulation/rooms/zoning.ts:203-262`) **never
evaluates `definition.requirements` at all.** It checks dimension bounds 1…64,
chunk existence, land ownership and zoning overlap, then writes. The authored
minimum sizes are currently enforced nowhere.

**(2) The requirements block is already a complete bill of materials for a
fully-furnished room, and it already resolves to capabilities.**
`room.cell` requires `object.bed` ×1 and `object.toilet` ×1. The object catalog
maps `object.bed → ['sleep-surface']` and `object.toilet → ['sanitation']`, with
footprints `{1,2}` and `{1,1}` (`src/content/object-catalog.ts:40-42`). So a
room type's *nominal* capability set — what a fully-furnished room of this type
would offer — is **a pure function of content that already exists.** No new
authored data, no schema change, no `schemaVersion` bump. `roomDefinitionSchema`
is `.strict()` over six fields, so avoiding a schema change is worth real money.

**(3) `object.bed`'s footprint is `{ width: 1, height: 2 }` — RimWorld's single
bed exactly.** RimWorld's entire capacity rule is `bedSize.x`. Applying that
rule to Lockstate's authored bed requirement gives `room.cell` a capacity of 1
with no number invented anywhere.

**(4) But `RoomInstance` does not carry the room's size.** It is
`{ instanceId, roomCatalogId, anchorTile, capacity, objectCapabilities }`
(`room-instance-registry.ts:21-27`) — anchor tile only, no width/height. The
`zone()` request *has* `width` and `height` and throws them away. So any
area-derived rule needs a new field on `RoomInstance`, and that type is
persisted as `prisoners.roomInstanceDefinitions` — a save-format change with a
migration. That is a real cost to name, and it is why I do not recommend an
area-first rule.

**(5) One field is doing two jobs.** `RoomInstance.capacity` gates both
"how many prisoners live here" (housing rooms, via intake) and "how many can use
this room at once" (canteen, yard, shower room, via `findAvailable` in
`action-system.ts`). Prison Architect keeps these separate: room occupancy is a
per-designation rule, while concurrent use comes from object `NumSlots`
(VERIFIED, §2). Lockstate's `category` field already distinguishes `'housing'`
from the rest, so the split is available without new content.

### Recommendation

**Resolve both `capacity` and `objectCapabilities` at registration from the
`requirements` block that is already authored. Add no content, change no schema.**

Concretely, one new resolver called from `zoning.ts:252-261` and from the restore
path:

- `objectCapabilities` = the union of `capabilities` over every object named in
  the definition's `requirements`, looked up in the object catalog.
- `capacity`, for `category: 'housing'` = Σ over required objects carrying
  `'sleep-surface'` of `minQuantity × footprint.width`. (RimWorld's rule, applied
  to the authored requirement.) → `room.cell` = 1, `room.solitary-cell` = 1,
  `room.infirmary` = 1.
- `capacity`, for every other category = Σ over **all** required objects of
  `minQuantity × footprint.width`. (Prison Architect's `NumSlots` rule.)
  → canteen = 2 tables×3 + 4 benches×2 = 14; shower-room = 2; common-room = 4;
  classroom = 1 bookshelf×2 + 4 chairs×1 = 6.

Why this is the smallest thing that visibly works:

- **Zero new content and zero schema change.** No `roomDefinitionSchema` field,
  no `ROOM_CATALOG_SCHEMA_VERSION` bump, no numbers to balance. The figures are
  not invented; they are what the already-authored requirements imply.
- **It fixes the capability gate, which is the actual blocker.** `room.cell`
  gets `['sleep-surface', 'sanitation']`, so `findAvailable('room.cell',
  'sleep-surface')` succeeds and intake completes. Neither (a) nor (b) as framed
  addresses this.
- **All six needs become serviceable**, including hygiene (shower-room gets
  `['hygiene','shower']`) and canteen meals (`['dining','seating','recreation']`).
- **It converges to object placement rather than being replaced by it.** The
  resolver is a function from *a list of objects* to *(capacity, capabilities)*.
  Today the list is "the objects this room type requires"; the day gap 13 closes,
  the same function takes "the objects standing in this room." That is a
  one-line change of input, not a rewrite — and it keeps
  `zoning.ts:50-52`'s stated model ("capacity comes from the objects standing in
  the room") true in spirit throughout.
- **It leaves the honest three-state verdict available.** Nominal (from
  requirements) vs. resolved (from placed objects) are then two computations of
  the same function over different inputs, so "this room holds 1 of the 2 it was
  meant to" is expressible — the middle state ONI's
  `RoomIdentificationResult.primary_satisfied` exists to express (VERIFIED,
  opened).

**One hole, stated plainly:** `room.yard` declares no object requirements
(`{ type: 'outdoors' }` + `minimum-size` only), so the rule gives it capacity 0
and `action.yard-recreation` stays blocked. Either the yard gets an area-derived
figure from its already-authored `minTiles: 64` — which needs fact (4) above,
the new `RoomInstance` size field and its migration — or it gets the one
authored number in the whole catalog. I would take the single authored number
first and defer the migration.

### The strongest argument against my own recommendation

**It derives a capacity from a validation list, and those two concepts will
diverge — quietly, and in a way that corrupts saves.**

`requirements` answers "what must be here for this designation to be legal."
Capacity answers "how many fit." Today they coincide for the cell because a cell
requires one bed and holds one prisoner. They will stop coinciding almost
immediately: a canteen that *requires* 2 tables should seat more than 2 tables'
worth once the player builds 10; a big cell should still hold 1; a yard needs
none and holds 40. The moment someone tunes a requirement for legality reasons —
"a kitchen should need two stoves" — they silently change a capacity, and because
`RoomInstance` is persisted, they silently change the population of every saved
prison. That is a worse failure than an explicit authored field, which at least
has one obvious meaning and one place to look.

There is a sharper version of the same objection: **my recommendation makes every
empty rectangle behave as if it were fully furnished, and that is a lie the
player can see.** Prison Architect's Cell requires a Bed and a Toilet *and does
not function until they are there* — the requirement is a gate the player must
clear, and clearing it is the gameplay. My resolver hands the player the reward
for furnishing a room without making them furnish it, which removes the pressure
object placement exists to create, and it does so in the one file
(`zoning.ts`) whose header currently tells the truth.

If the owner weights that objection above the cost of a schema change, the right
answer is **(a)** — build object placement — and accept a longer blocked period.
The evidence in §1 and §2 genuinely favours (a) on faithfulness: four of six
games have no room capacity at all, and the two hospital games derive it from
beds. What the evidence does *not* support is the idea that authoring a number
is unprecedented — Prison Architect's Shared Cell ships a hard "up to 8"
(VERIFIED, opened) and its Holding Cell ships uncapped and bed-free.

---

## 6. Corrections to the existing ADR 0023 draft

I checked the draft's external quotes and found no fabrication. Three defects:

1. **The draft's central practical claim is incomplete, and it matters.** It
   frames the decision as being about `RoomInstance.capacity`, and rejects
   alternative A on the ground that it would "admit prisoners the same tick."
   It would not. `findAvailable` gates on capacity **and** capability
   (`room-instance-registry.ts:83-84`), and `objectCapabilities` is `[]`, so a
   capacity-only change is a no-op for intake. Any decision here must resolve
   both fields or it produces no observable behaviour. (VERIFIED, repo.)
2. **"There is no confirmation step" about RimWorld's room-role flip is
   overstated.** `RoomRoleWorker_PrisonCell` also implements
   `GetScoreDeltaIfBuildingPlaced`, which returns `-170000f` when placing a bed
   in a room that is currently a Prison Cell — a hook that exists precisely so
   the build UI can warn before the flip. I did not trace its callers, so
   *whether* it surfaces a warning is UNKNOWN, but the delta hook is there.
   (VERIFIED opened: `RW_RoomRoleWorker_PrisonCell.cs:42-53`.)
3. **The draft missed `buildtoolbar_popup_room_sharedcell` — "Can hold up to 8
   prisoners"** — in the same file it quotes from. That is a hard authored
   per-room-type capacity in Prison Architect's shipped strings, VERIFIED
   (opened). It materially strengthens the case the draft marked as its weakest,
   search-only link: an authored accommodation figure *does* ship in the sample.
   The draft also missed that PA's Dormitory rule is a **min()** of an area rule
   and a bed count, which is the closest thing in the sample to option (c).

Two smaller notes: the draft's `base-language.txt` path is
`main/data/language/base-language.txt` (its prose says "in the same
`base-language.txt`" without the path; `main/data/base-language.txt` 404s), and
the mirror also carries `main/data/needs.txt`, which the draft did not open and
which is the strongest single piece of evidence on the needs question (§3).

---

## OPTIONS FOR THE OWNER

**Option 1 — Build furniture placement first.**
Let players put beds, toilets and tables in rooms, and count what is standing
there; a cell holds as many people as it has beds.
*Cost:* the largest of the four — a new building system, new save data, new
interface, and the game stays unable to hold anybody until it lands.
*Forecloses:* nothing, but it delays every other feature that needs a populated
prison, and you will not see a prisoner in a cell for a long time.

**Option 2 — Write a capacity number and a facilities list onto each room type.**
Say in the content files that a cell holds 2 and counts as having a bed and a
toilet, and let the player's empty rectangle behave as if it were furnished.
*Cost:* small — a couple of fields, a version bump, a day or two.
*Forecloses:* nothing permanently, but it removes any reason for the player to
want furniture, so the furniture system loses its purpose and may never feel
necessary. **Note: writing only the number, without the facilities list, changes
nothing at all — the game would still refuse every prisoner.**

**Option 3 — Read the numbers off the shopping list each room type already has.
(Recommended.)**
Each room type already lists what it must contain — a cell already says "one bed,
one toilet" — so compute the capacity and the facilities from that list instead
of writing new numbers, and later compute them from the furniture actually
placed using the very same rule.
*Cost:* smallest of the three that work — one new piece of logic, no new content,
no save-format change, no numbers to balance. One exception needs a single
authored number: the outdoor yard, which lists no furniture.
*Forecloses:* nothing, and it is the only option that turns into Option 1 by
changing what it reads rather than by being thrown away. The real risk is that
"what a room must contain to be legal" and "how many people fit" are different
ideas, so a later tweak to a room's shopping list would quietly change how many
prisoners your saved prisons hold.

**Option 4 — Decide capacity from floor space.**
Bigger rooms hold more people, as Prison Architect's dormitories do.
*Cost:* moderate and larger than it looks — rooms currently do not remember their
own size, so this needs a change to saved games and a migration.
*Forecloses:* little, but it makes a bare patch of floor into accommodation,
which is the least believable of the four, and it still does not tell the game
that a cell has a bed in it.
