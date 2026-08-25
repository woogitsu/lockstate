# What a room's concurrent-use ceiling counts — evidence for the open-area gap in ADR 0028

Dated evidence, gathered 2026-08-25 against `origin/main` at `74446fb`
(v0.0.66). No production code was written to gather it.

The question it was commissioned to answer was narrow: **where should a room's
occupancy capacity come from for a room type with no object requirement — in
practice, the yard?** That is ADR 0028's open question 4. Answering it required
correcting the question twice, and the second correction is the substance of
this record: the gap is not the yard's, and it is measurable on the ADR's own
worked example.

Read this as history. Per [`docs/research/README.md`](./README.md) a record here
is what was known when it was gathered, including what could not be
established; it is not documentation of how the code works and it is not
updated to match a later decision.

---

## 0. Tiers, what was opened, and the measuring rig

- **VERIFIED (opened)** — the bytes were downloaded and the quoted lines read.
  Every external source here is a *community mirror* of shipped data or a
  machine decompilation, never a vendor specification; a mirror can be stale or
  edited.
- **VERIFIED (repo)** — read on disk in this repository, at the revision named.
- **MEASURED** — the shipped code was run and its output is quoted.
- **SEARCH-SUMMARY** — a real page exists and a search tool summarised it, but
  the page was never opened. `WebFetch` is blocked for every game wiki and
  forum. A genuinely weaker tier; every load-bearing use is re-flagged in place.
- **FROM MEMORY** — believed, not checked.
- **UNKNOWN** — said as unknown rather than filled in.

Opened first-hand:

| Source | What it is |
|---|---|
| `originalfoo/Prison-Architect-API@master`: `main/data/language/base-language.txt`, `main/data/materials.txt`, `main/data/needs.txt` | Prison Architect's shipped strings, object table and need table |
| `Chillu1/RimWorldDecompiled@master`: `Verse/Room.cs`, `RimWorld/Need_Outdoors.cs`, `RimWorld/RoomStatWorker_Space.cs`, `RimWorld/RoomRequirement_Area.cs` | RimWorld decompilation |
| `Kupie/ONI_Decomp@master`: `Assembly-CSharp/RoomConstraints.cs`, `Assembly-CSharp/Database/RoomTypes.cs`, `Assembly-CSharp/RoomType.cs` | Oxygen Not Included decompilation |
| `CorsixTH/CorsixTH@master`: `CorsixTH/Lua/room.lua`, `rooms/ward.lua`, `rooms/toilets.lua`, `queue.lua`, `entities/humanoids/patient.lua` | Open-source **reimplementation** of Theme Hospital — faithful, but not Bullfrog's code |

Two Point Hospital and The Sims are closed-source with no mirror. They are
SEARCH-SUMMARY throughout and nothing below rests on them.

**The rig, so §2 can be re-run or disbelieved.** The measurements drive the
real path — `deriveRoomCapacity`, then `RoomInstanceRegistry.register`, then
`findAvailableForUse` with `claimUse` after each hit, counting how many actors
the gate admits before it refuses. Run under the repository's own vitest
against `origin/main` at `74446fb`. The probe was a scratch test file, deleted
after the run; nothing was left in `tests/`.

---

## 1. The question, and the premise that had to be corrected first

**The brief said `room.yard` "resolves to `concurrentUseCapacity: 0`
permanently". That is false** (VERIFIED repo, `origin/main`).
`deriveRoomCapacity` adds `catalogue(objectId).footprint.width` to
`concurrentUseCapacity` for **every** recognised object in the rectangle, and
filters on a capability only for `residentCapacity`
(`src/simulation/objects/room-capacity.ts`). So a yard with anything at all
standing in it has a non-zero concurrent-use capacity today, and the yard's
zero is a statement about an *empty* yard rather than about the yard.

Two things follow, and the second is why this record exists.

**The yard is not a special case of anything.** Nothing in the rule mentions
outdoors, and nothing exempts the yard. The yard is simply the room whose
content declares no object, so it is the room most often empty.

**The rule over-counts in every room, not only in the yard.** A ceiling summed
over *every* object is checked against a request that names *one* capability.
Those are different questions, and §2 measures what the difference costs.

For the record, the three repository premises the brief carried that do hold
(all VERIFIED repo, `origin/main`):

1. **`minimum-size` is enforced.** `RoomZoningService.zone` refuses
   `'below-minimum-size'` when `width < minWidth || height < minHeight ||
   width * height < minTiles` (`src/simulation/rooms/zoning.ts`). `room.yard`
   authors `minWidth: 8, minHeight: 8, minTiles: 64`, so **every zoned yard is
   at least 64 tiles** and the "1×1 yard holding nobody" pathology cannot be
   zoned at all. ADR 0028's open question 3, which says nothing enforces these,
   is stale.
2. **`MAX_ZONE_DIMENSION_TILES = 64`** (same file), so a single yard rectangle
   is between 64 and 4,096 tiles. Nothing caps the number of adjacent yards.
3. **`action.yard-recreation` declares no `requiredObjectCapability`**, and it
   is the strongest recreation action in the set: `{ recreation: 3, safety: 0.1
   }` for `minDurationTicks: 100`, against the common room's `{ recreation: 2 }`
   and the classroom's `{ recreation: 1 }` (`src/simulation/prisoners/actions.ts`).
   Of the five `room-catalog-id` actions, **three** declare no capability —
   `yard-recreation`, `common-room-recreation`, `classroom-education` — so
   capacity is the only gate those three have.

And two the brief carried that do **not** hold on `origin/main` at `74446fb`:

4. **`RoomInstance` does carry `width` and `height`.** They are optional —
   absent for an instance restored from a save written before bounds were
   recorded — alongside `residentCapacity`, `concurrentUseCapacity` and
   `objectCapabilities` (`src/simulation/prisoners/room-instance-registry.ts`).
   ADR 0028 decision 6 has landed. So has phase 6: `findAvailableForUse` gates
   on `useOccupancyOf`, and the concurrent-use ceiling is a real ceiling rather
   than a zero-check.
5. **Exactly 1 of 18 room definitions has no `object` requirement, and it is
   `room.yard`** — enumerated programmatically from
   `src/content/room-catalog.ts` rather than read off the ADR. That much is
   confirmed. What does *not* follow is that a rule keyed on "no object
   requirement" is a rule about the yard: the rule in question is keyed on the
   *action's* capability, and three actions qualify.

`object.bench` is `footprint: { width: 2 }`
(`src/content/object-catalog.ts`), so the "just require two benches in a yard"
workaround the brief floated would give a 64-tile yard a
`concurrentUseCapacity` of 4. Sixty-four tiles, four users. VERIFIED repo, and
it is a smaller wrong number rather than a fix.

---

## 2. What the rule actually produces (MEASURED)

Every figure in this section was produced by the run described in §0.

An 8×8 yard — the smallest the zoning gate permits — with one thing in it:

| What is in the 64-tile yard | `concurrentUseCapacity` | `yard-recreation` users admitted |
|---|---|---|
| nothing | 0 | **0** |
| one toilet (`width: 1`) | 1 | **1** |
| one loading-dock door (`width: 3`) | 3 | **3** |
| four benches (`width: 2` each) | 8 | **8** |

**A delivery door grants three prisoners outdoor exercise. Sixty-four tiles of
open ground grant none.**

Then ADR 0028's own worked example, which the ADR states as "a canteen with 2
dining tables and 4 benches seats `2×3 + 4×2 = 14`". Measured, it does. Add
four toilets and a storage rack to that same canteen and ask the question
`action.eat-meal` asks — `findAvailableForUse('room.canteen', 'dining')`:

```
CANTEEN                        concurrentUseCapacity 14
CANTEEN + 4 toilets + 1 rack   concurrentUseCapacity 19
DINERS admitted with 'dining' required: 19
```

**Nineteen prisoners eat in a canteen with fourteen seats, because four toilets
and a shelf are in the room.** The capability check passes — the room does offer
`'dining'`, somewhere — and the ceiling it is checked against is the footprint
total of everything present. So this is not a yard quirk; it is a general
over-count, and it is visible on the example the ADR chose to illustrate the
rule.

**Reachability, stated precisely, because the table above overstates it.** Only
four buildables exist today — `wall-brick`, `door-wooden`, `bed-wooden`,
`toilet-brick` (`src/simulation/construction/definition.ts`, VERIFIED repo). ADR
0028 phase 4, the rest of the object catalogue, has not landed. So of the rows
above, the ones a player can reach through the Build panel today are the empty
yard and the toilet; the loading-dock door and the benches are properties of the
derivation that become reachable when phase 4 ships. The over-count is real now
and gets worse with every object buildable added.

One more measured detail worth keeping: with a bed in it, a yard becomes a valid
residence at the registry level — `findAvailableResidence('room.yard',
'sleep-surface')` returns the instance. Nobody is housed there only because
`DEFAULT_ACCOMMODATION_POLICY` names its room types explicitly
(`src/simulation/prisoners/intake-system.ts`). The type discipline lives in the
caller, not in the rule.

---

## 3. Is the "every object" sum a defect or an intended abstraction?

**This is the one judgement in this record, and it is labelled as one.** The
behaviour is stated in the ADR and restated in the code, so a reasonable reader
can call it intended. What the evidence supports is narrower: that it was never
*argued*.

**(a) The ADR states the rule and gives no reason for the word "every".**
Decision 2, verbatim:

```
residentCapacity(R) = Σ over objects(R) whose capabilities include 'sleep-surface'
                      of catalogue(objectId).footprint.width
concurrentUse(R)    = Σ over objects(R) of catalogue(objectId).footprint.width
```

The prose that follows defends `footprint.width` as the *quantity* and defends
the residency filter. No sentence anywhere in the document argues that an object
which cannot serve the action being gated should raise that action's ceiling.
The asymmetry is presented, never defended. (VERIFIED repo.)

**(b) The precedent it cites for the quantity does not exist.** See §5 — PA
authors `NumSlots` rather than deriving it, and gates *the object* with it
rather than summing slots into a room ceiling.

**(c) The code comment restates the rule as intent and argues everything
except this.** `src/simulation/objects/room-capacity.ts` opens with "ADR 0028
decision 2, verbatim and with nothing authored anywhere", repeats the three-line
formula including the sum "over every object", and then spends its remaining
paragraphs on orientation, on `localeCompare` and determinism, and on an unknown
catalogue id contributing nothing. The one thing it does not discuss is the
"every". Textually intended; substantively unexamined. (VERIFIED repo.)

**(d) The one test that exercises this case has a comment contradicting its own
assertion.** `tests/unit/objects-room-capacity.test.ts`, as read on
`origin/main` at `74446fb`:

```ts
    // Two sleep surfaces of width 1 each, and the toilet counts toward neither
    // -- so residency and concurrent use come apart on the same set of objects.
    expect(derived.residentCapacity).toBe(2);
    expect(derived.concurrentUseCapacity).toBe(3);
```

The toilet does not count toward neither: **it is the entire difference between
2 and 3.** If it counted toward neither, both numbers would be 2 and nothing
would "come apart". The assertions are correct descriptions of the behaviour;
only the sentence attached to them is wrong. That is this repository's own
documented defect class — a true-looking sentence beside a passing assertion,
which nothing mechanical reads.

### Why the shape is wrong rather than untidy

ADR 0028's own §*Context* makes exactly this argument one level up, and is right
there: `capacity` was two quantities, because "a canteen that seats fourteen
houses nobody, and a cell that holds one prisoner is not a statement about how
many can stand in it". **The identical objection applies to the field it split
off.** Concurrent use is not one question either. It is asked per action, and
different actions in the same room consume different objects:
`findAvailableForUse(roomCatalogId, requiredObjectCapability?)` takes a
capability precisely because the caller's need is specific, and then compares
the headcount against a ceiling that is not.

One scalar cannot be a correct ceiling for two actions that consume different
objects. The canteen measurement in §2 is that mismatch costing five phantom
seats.

**What would change this reading**, stated as the record's own falsifier: any
sentence — in the ADR, an issue, or a review — arguing that a room's
simultaneous-use ceiling *should* be its total furnished footprint irrespective
of what the occupant is doing there. That is a coherent position: it treats a
room as a floor-space allocation rather than as a set of usable stations. It
could not be found anywhere. If the owner holds it, then the canteen seating
nineteen is correct by design, the yard should count its ground too, and
area-derived capacity becomes the consistent answer rather than an ad-hoc one.

---

## 4. Where an open area's capacity comes from in games that ship one

**The finding is unanimous in everything that could be opened: none of them
gives an open area a headcount, because none of them has a per-room occupancy
number for such a space at all.** The differences are in what they put there
instead.

| Game | Room-level capacity? | An object count? | A function of floor area? | Tier |
|---|---|---|---|---|
| **RimWorld** | **No** — a case-insensitive grep of `Verse/Room.cs` for `capacit` and `occupan` returns nothing | Yes, entirely (bed slots) | No — area is a saturated *stat*, and past a size the room loses its role | VERIFIED (opened) |
| **Oxygen Not Included** | **No** — `RoomType` has no such field | Assignment is per-building | No — area is a **minimum *and maximum*** gate on the room's *type* | VERIFIED (opened) |
| **Theme Hospital** (via CorsixTH) | Yes: an authored default of **1**, overridden per room class | Yes, for 2 of 23 classes | No — and the corridor is *not a room* | VERIFIED (opened, reimplementation) |
| **Prison Architect** | Yes, for the **three housing designations only**, by a different rule each | Partly | Partly (housing only) | mixed — §5 |
| **Two Point Hospital** | Not evidenceable | Beds placed | No; outdoor seating is a happiness/attractiveness input | SEARCH-SUMMARY |
| **The Sims** | No per-room limit | Yes (bed slots, 1 or 2) | No | SEARCH-SUMMARY |

### RimWorld — VERIFIED (opened)

`Verse/Room.cs` is 20,802 bytes and contains no occurrence of `capacit` or
`occupan` in any casing. There is no room capacity to give.

What an outdoor area gets instead is a saturated stat and a per-pawn need.
`RoomStatWorker_Space.GetScore`, complete:

```csharp
if (room.PsychologicallyOutdoors) { return 350f; }
float num = 0f;
foreach (IntVec3 cell in room.Cells) {
    if (cell.Standable(room.Map)) num += 1.4f;
    else if (cell.WalkableByNormal(room.Map)) num += 0.5f;
}
return Mathf.Min(num, 350f);
```

An outdoor room short-circuits to the **maximum**, and the indoor branch is
clamped to the same 350 — so RimWorld caps the *reward* for area rather than
capping the area. `Need_Outdoors.NeedInterval` is the model for outdoor time:
`8f` under open sky, `1f` under a thin roof, `-0.4f` under a thick one,
`-0.32f`/`-0.45f` indoors, all scaled by `0.0025f`; fall far enough and
`CurCategory` walks `NeedFreshAir → CabinFeverLight → CabinFeverSevere →
Trapped → Entombed`. **Any number of pawns satisfy it in the same square metre
simultaneously. There is no slot to occupy.**

Two further RimWorld facts that bear on an area rule:

- `RoomRequirement_Area.Met` is `r.CellCount >= area`. RimWorld authors area
  figures as **requirements**, never as a divisor producing a headcount.
- `Room.IsHuge => RegionCount > 60`, and `UpdateRoomStatsAndRole` assigns a role
  only when `ProperRoom && RegionCount <= 60`, otherwise `role =
  RoomRoleDefOf.None`. **Past a size a RimWorld room stops being a kind of room
  at all** — a shipped answer to the enormous-rectangle worry, and a
  *classification* answer rather than a capacity one.

### Oxygen Not Included — VERIFIED (opened)

`RoomType`'s constructor parameters are `id, name, description, tooltip, effect,
category, primary_constraint, additional_constraints, display_details, priority,
upgrade_paths, single_assignee, priority_building_use, effects, sortKey`. **No
capacity and no occupancy.** `single_assignee` is the only field that resembles
one; the prior research round reports it as assigned in the constructor and
never read anywhere, from a full-tree grep of 6,876 decompiled files. That
full-tree grep was **not repeated for this record** — the three files named in
§0 were re-read, the grep was not — so treat "dead code" as inherited rather
than re-verified.

The Park is the precedent that matches an exercise yard most exactly: an open
recreational area whose point is space.

```csharp
this.Park = base.Add(new RoomType("Park", …, RoomConstraints.PARK_BUILDING, new RoomConstraints.Constraint[]
{
    RoomConstraints.WILDPLANT,
    RoomConstraints.NO_INDUSTRIAL_MACHINERY,
    RoomConstraints.MINIMUM_SIZE_12,
    RoomConstraints.MAXIMUM_SIZE_64
}, …
```

Nature Reserve is the same shape at `MINIMUM_SIZE_32`/`MAXIMUM_SIZE_120`, the
Rec Room at `MINIMUM_SIZE_12`/`MAXIMUM_SIZE_96`. `MINIMUM_SIZE_n` is
`room.cavity.NumCells >= n` and `MAXIMUM_SIZE_n` is `room.cavity.NumCells <= n`.
So Klei's answer for an open area is two area bounds gating the room's *type*, a
token object, and a morale `effect` — and no headcount. Its `display_details`
are `SIZE`, `BUILDING_COUNT`, `CREATURE_COUNT`, `PLANT_COUNT`: counts shown to
the player, none of them a limit.

**`MAXIMUM_SIZE` is the most reusable idea here.** It is the only shipped
mechanism found that answers "a room can be too large", and it answers it by
refusing the designation rather than by capping a number.

### Theme Hospital, via CorsixTH — VERIFIED (opened, reimplementation)

`Lua/room.lua`: `self.maximum_patients = 1 -- A good default for most rooms`.
Two classes override it, both by counting objects at build time —
`rooms/ward.lua` `self.maximum_patients = beds` and `rooms/toilets.lua`
`self.maximum_patients = number`. Every other room keeps the authored 1. So an
authored default overridden by an object count is a shipped pattern; note what
it authors, though — a floor of **1**, for rooms where one patient at a time is
the truth.

**And the open area has no capacity, only comfort.** The corridor is not a room,
so nothing bounds how many patients stand in it. What a bench does, from
`Patient:_dailyObjectHappinessEffects`:

```lua
-- sitting makes you happy whilst standing and walking does not
if self:goingToUseObject("bench") then
  self:changeAttribute("happiness", 0.00002)
else
  self:changeAttribute("happiness", -0.00002)
end
```

A bench is a happiness delta, not a slot that gates entry. The only authored
ceiling nearby is the *queue* — `max_size = 6`, clamped at 30 by
`increaseMaxSize` — which bounds a line for a door, not the population of a
space.

This is the closest structural analogue found in code that could be opened: an
unbounded open area, plus objects that improve the experience of being in it.

### Two Point Hospital and The Sims — SEARCH-SUMMARY

Guidance-level summaries describe adding more benches, including outdoors, when
patients stand around waiting, and an inspectable "attractiveness area" per
decorative item. That is a radius-of-comfort model rather than a capacity model.
No page was opened and nothing is asserted about the internals. UNKNOWN whether
Two Point Hospital has any outdoor *room* concept at all.

For The Sims: single beds hold one Sim, doubles hold two, sharing gated on
relationship, and no per-room occupancy limit was described anywhere seen.
Absence is exactly what a search summary evidences worst, so this is the weakest
row in the table.

---

## 5. Prison Architect's Yard, and the two ADR 0028 citations that do not hold

### The Yard has no occupancy limit, and the shipped strings show it never had one

VERIFIED (opened), `base-language.txt`. The complete set of `roomgrading_*` keys
is fifteen lines covering **exactly three room types** — `cell`, `dormitory`,
`sharedcell` — plus the shared readouts `roomgrading_result`,
`roomgrading_currentoccupant`, `roomgrading_unoccupied` and
`roomgrading_shared_occupuants` ("Current Occupants: `*X / *Y`", typo shipped).
**There is no `roomgrading_yard_*` key of any kind**, and no
`roomgrading_canteen_*` either. The occupancy machinery exists only for the
three rooms prisoners *live* in.

Every occurrence of "yard" in the file is a name, a build-toolbar blurb, an
objective, a scripted weights-bench event, or this — `regimetooltip_yard`,
quoted verbatim:

> Prisoners are let out of the facility and into the yard for some much needed
> exercise, sunlight and fresh air.\n\nPrisoners will make use of any facilities
> within the yard during this time, like the weight benches for working out,
> telephones to call loved ones, showers etc.

That is Introversion stating the design in shipped text: **the yard is a place
prisoners are let into on a timetable, and the objects in it are optional
facilities used if present.** Not slots. The controlling quantity is the regime.

The nine `*capacity*` keys in the file are prison-wide accommodation counters
plus `interfacetopbar_prisoners_capacity`, "Maximum safe capacity: `*X`" — so PA
answers "too many people" **globally rather than per room**. A grep for
`crowd`/`overcrowd`/"room is full"/"not enough space" returns one unrelated hit
about escapes.

Crowding in PA is a need, not a cap: `needs.txt` defines `Privacy` with
`MisbehaviorType Spoiling`, `Priority 5`, `TimeToAction 1440`, beside `Exercise`,
`Recreation`, `Comfort`, `Environment` and `Freedom`. The whole file's
`FailureAction` values are three distinct ones — `Urinate`, `SoilSuit`,
`Withdrawal` (four occurrences). Unmet needs produce behaviour, not blocked
actors. VERIFIED (opened).

**This is the weakest load-bearing claim in the record and it stays flagged
wherever it is used: it is verified as an *absence in one artifact*.** No
`roomgrading_yard_*` key, no yard capacity string, no crowding string, in the
English `base-language.txt` of one community mirror. PA's room logic is compiled
into the executable — there is no `rooms.txt` in the data directory, which was
checked — so a yard cap could exist in code with no localised string, and a
mirror can be from a version that predates or postdates a change. §7 says what
would change it.

SEARCH-SUMMARY corroborates the object side: the Paradox and Fandom wiki pages
summarise the Yard as requiring no objects at all, prisoners jogging the
perimeter or using Weights Benches if any are placed. One summary states a 5×5
minimum and a door-enclosure rule; the page could not be opened, and the
*numbers* are not relied on anywhere here.

### Correction 1: `NumSlots` is authored, not footprint-derived

ADR 0028 decision 2 states, as the justification for its concurrent-use
quantity, that "Prison Architect's `NumSlots` equals the object's tile length in
every row the research memo opened", and §*Context* calls it "a separate
footprint-derived usage count". **Both are false.** All 41 objects carrying the
field were extracted mechanically from `materials.txt` (VERIFIED, opened;
absent `Width`/`Height` read as 1):

```
Bed            1x2  NumSlots 2      BunkBed        1x2  NumSlots 2
Table          4x1  NumSlots 4      Bench          4x1  NumSlots 4
WeightsBench   1x1  NumSlots 1      MedicalBed     2x2  NumSlots 1
LibraryBookshelf 3x1 NumSlots 1     SchoolDesk     1x2  NumSlots 1
PoolTable      3x2  NumSlots 2      VisitorTable   3x2  NumSlots 4
FireEngine     2x7  NumSlots 4      RiotVan        2x5  NumSlots 6
TroopTruck     2x5  NumSlots 6      MorgueSlab     1x2  NumSlots 1
```

Counted over all 41: **13 have a `NumSlots` that is not `max(width, height)`,
and 8 have one that equals neither dimension.** `RiotVan` and `TroopTruck` carry
*more* slots than either dimension. So `NumSlots` is an authored per-object
number that correlates with footprint and is not derived from it. Introversion
authors the slot count; PA does not compute it.

Two further mismatches in the same citation, both VERIFIED (opened):

- **`NumSlots` gates the object, not the room.** PA's only room-level occupancy
  machinery is the fifteen `roomgrading_*` keys above, covering the three
  housing designations. Nothing in the shipped data sums slots into a room
  ceiling. The cited precedent supports a per-object station count, which is a
  different quantity in a different place.
- **A single `Bed` carries `NumSlots 2`**, the same as a `BunkBed`, while a PA
  cell houses one prisoner. So whatever `NumSlots` counts, it is not sleepers.
  What it *does* mean is UNKNOWN here, because PA's room logic is compiled.

This matters beyond bookkeeping. ADR 0028's headline virtue is that "no capacity
is authored anywhere in this design", offered as being what the reference
implementations do. On the evidence the closest reference implementation authors
exactly that number. The purity is Lockstate's own design choice, which is a
perfectly good reason to hold it — but it is not the genre's practice, and that
is a materially different argument.

### Correction 2: the Dormitory's "divide by 4" is not in the shipped files

ADR 0028 cites PA's Dormitory as `min(area ÷ 4, bed slots)` at "tier E, all
verified in shipped game files". What the file actually contains, verbatim
(VERIFIED, opened):

```
roomgrading_cell_roomsize            Room size at least *X Squares
roomgrading_dormitory_roomsize       Room size at least *X Squares per Prisoner
roomgrading_dormitory_item           Item : 1 *X per 4 Prisoners
roomgrading_dormitory_outsidewindow  1 Outdoor Window per 8 Prisoners
roomgrading_sharedcell_roomsize      Room size at least *X Squares per Prisoner
roomgrading_sharedcell_item          Item : 1 *X per 4 Prisoners
```

`*X` is substituted at runtime, so **the area figure is not in the data.** The
only literal `4` sits in the *item* rules — "1 [object] per 4 Prisoners" — which
is an object-to-prisoner ratio, not an area divisor. It is recorded here as a
live possibility that "÷ 4" reached the ADR by reading that line as an area
rule.

What the strings *do* prove is the **grammar**: the Cell's rules are absolute
and singular, the Dormitory's and Shared Cell's are per-prisoner and plural.
That is real evidence that a per-prisoner area rule exists. It is not evidence
of its constant.

SEARCH-SUMMARY (unopened wiki pages) gives "1 prisoner per 4 squares", with a
stated exception that a 2×3 dormitory plus a bunk bed holds 2 on 6 squares, and
separately that a dormitory must exceed 12 squares per prisoner to satisfy
privacy. If both are right, PA runs two area thresholds at once on the same
room — a hard cap at ÷4 and a comfort threshold at ×12 — and the gap between
them is where the interesting decision lives. **Both numbers are wiki-sourced,
both are uncertain, and they are deliberately not averaged into a range or
picked between.**

One structural note: PA applies that hybrid to **housing**. Nobody applies it to
an open recreation area. Using the Dormitory as the yard's precedent transplants
a rule across exactly the boundary ADR 0028 decision 3 draws — residency versus
concurrent use.

---

## 6. An area-derived rule, priced against this tree

Area is standard as a **gate** and absent as a **divisor**. No shipped
implementation of capacity = area ÷ N could be opened.

- area as an authored **minimum** to be a room: ONI `MINIMUM_SIZE_12/24/32`,
  RimWorld `RoomRequirement_Area`, CorsixTH `room.minimum_size`, and this tree's
  own enforced `minimum-size` — all VERIFIED;
- area as an authored **maximum**: ONI `MAXIMUM_SIZE_64/96/120` — VERIFIED;
- area as a **capped stat**: RimWorld's Space, clamp `350f` — VERIFIED;
- area as a **classification cliff**: RimWorld `IsHuge`, role `None` past 60
  regions — VERIFIED;
- area as a **divisor producing a headcount**: only PA's Dormitory, and
  SEARCH-SUMMARY only.

Against this codebase the arithmetic is unkind:

- **The undersized yard cannot happen.** `minimum-size` is enforced, so a yard
  is ≥ 64 tiles.
- **The oversized one can.** `MAX_ZONE_DIMENSION_TILES = 64` bounds one yard at
  4,096 tiles: ÷4 gives 16…1,024, ÷8 gives 8…512, ÷16 gives 4…256. Against a
  prison of tens of prisoners, **every plausible divisor is indistinguishable
  from "no limit"** at the sizes players will build. The rule buys precision
  nobody can observe.
- **The divisor is an authored number.** One figure in one place instead of
  eighteen, but ADR 0028's stated principle is that *nothing* is authored. An
  area rule relocates that; it does not preserve it.
- **Tiling defeats it.** Nothing stops four adjacent 64-tile yards instead of
  one 256-tile yard, so a per-instance cap is not a cap on the prison.
- **Where area genuinely earns its place** is the ONI direction — refusing a
  designation that is absurdly large, at the zoning gate where `minimum-size`
  already lives — and the RimWorld direction — capping the *benefit* of area so
  a 4,096-tile yard is not 64× better than a 64-tile one. Both are gates on the
  room. Neither is a capacity.

A capability supplied by the yard's own tiles is the most elegant of the
candidates and does not escape the problem either. It has a real precedent
*shape* — ONI's Park is recognised by a token building plus a wild plant, and
bounded by area in both directions — but converting tiles into a number of
simultaneous users still needs a divisor, and that divisor is authored. It moves
the authored number somewhere nicer; it does not remove it.

---

## 7. The weakest claims, and what would change them

**Weakest load-bearing claim: that Prison Architect's Yard has *no* occupancy
limit.** What is verified is an absence in one artifact (§5). **What would
change it:** a decompilation or a save-file field showing a per-room occupancy
on a Yard, or a shipped string in a version not read here. A wiki page or a
forum post would not, in either direction.

**Second: the PA Dormitory hybrid**, on which ADR 0028 leans. The *shape* is
verified from the shipped strings; both **numbers** — the ÷4 divisor and the ×12
privacy threshold — are search summaries that could not be opened, and both are
uncertain. Building on that hybrid requires verifying them first, which probably
requires the game.

**Third: that the "every object" sum is a defect rather than a deliberate
floor-space abstraction is a judgement, not a fact** (§3). The evidence that it
was unexamined is circumstantial: an absent argument, a false citation, and a
test comment that misreads its own number. A single sentence anywhere taking the
floor-space position would flip it.

**Fourth: Two Point Hospital and The Sims are search-summary rows** in a table
whose other rows are code. Nothing here rests on them.

**Not re-verified for this record:** ONI's full-tree grep of 6,876 decompiled
files, inherited from the prior round (§4).

**Where this could be most wrong overall:** if Lockstate's design intent is that
recreation *should* be scarce and rationed — a resource players queue for — then
§4's "no capacity for an open area" argues against the game the owner wants. That
is a question about Lockstate, not about other games, and it is the owner's to
answer.

---

## OPTIONS FOR THE OWNER

**Option 1 — Count only the things that do the job. (What the evidence
supports.)**
A room's limit on people doing something becomes the size of the things that let
them do it, so four toilets in the canteen stop adding dinner seats and the
empty yard stops being the case anyone argues about.
*Costs:* the limit becomes a small lookup per activity instead of one stored
number, and two actions need the right word added to them in the content file.
*Forecloses:* the idea that a room has one single occupancy figure — a Rooms tab
can no longer show "capacity 14" without saying capacity for what.

**Option 2 — Leave the counting rule alone and write a number on the yard.**
Someone decides how many people an outdoor yard holds, and it holds that.
*Costs:* one line today; and the canteen still seats nineteen because of four
toilets, because that is a separate defect being left alone.
*Forecloses:* the claim that no capacity figure is authored anywhere — and it
leaves a delivery door in a yard adding three exercise places.

**Option 3 — Let the ground count: bigger yards hold more people.**
The yard's floor area becomes its limit.
*Costs:* somebody must choose how many tiles make one person, which is the exact
kind of number this architecture was set up to avoid, and at the sizes players
build the limit will never once be what stops anybody.
*Forecloses:* nothing technically, but it commits the game to the position that a
room's capacity is floor space rather than usable stations — the opposite of
Option 1, and the two cannot sit together.

**Option 4 — No limit outdoors; make crowding hurt instead.**
Nobody is turned away from the yard, but a packed yard is a worse yard, the way
a waiting room with no seats makes people miserable rather than turning them
back.
*Costs:* a new balance rule and its own decision record, and it needs Option 1
underneath it to have anything to attach to.
*Forecloses:* ever saying "the yard is full" as a hard fact; crowding becomes a
pressure the player manages rather than a wall the game enforces.

---

## Sources

Opened first-hand:

- https://raw.githubusercontent.com/originalfoo/Prison-Architect-API/master/main/data/language/base-language.txt
- https://raw.githubusercontent.com/originalfoo/Prison-Architect-API/master/main/data/materials.txt
- https://raw.githubusercontent.com/originalfoo/Prison-Architect-API/master/main/data/needs.txt
- https://raw.githubusercontent.com/Chillu1/RimWorldDecompiled/master/Verse/Room.cs
- https://raw.githubusercontent.com/Chillu1/RimWorldDecompiled/master/RimWorld/Need_Outdoors.cs
- https://raw.githubusercontent.com/Chillu1/RimWorldDecompiled/master/RimWorld/RoomStatWorker_Space.cs
- https://raw.githubusercontent.com/Chillu1/RimWorldDecompiled/master/RimWorld/RoomRequirement_Area.cs
- https://raw.githubusercontent.com/Kupie/ONI_Decomp/master/Assembly-CSharp/RoomConstraints.cs
- https://raw.githubusercontent.com/Kupie/ONI_Decomp/master/Assembly-CSharp/Database/RoomTypes.cs
- https://raw.githubusercontent.com/Kupie/ONI_Decomp/master/Assembly-CSharp/RoomType.cs
- https://github.com/CorsixTH/CorsixTH — `CorsixTH/Lua/room.lua`, `rooms/ward.lua`, `rooms/toilets.lua`, `queue.lua`, `entities/humanoids/patient.lua`

Search-summary only, never opened: the Paradox and Fandom wiki pages for Prison
Architect's Yard and Dormitory, `sims.fandom.com/wiki/Bed`, and two Two Point
Hospital guide and discussion pages on attractiveness and seating.

Repository, at `origin/main` = `74446fb` (v0.0.66):
[`src/simulation/objects/room-capacity.ts`](../../src/simulation/objects/room-capacity.ts),
`src/simulation/prisoners/room-instance-registry.ts`,
`src/simulation/prisoners/actions.ts`,
`src/simulation/prisoners/intake-system.ts`,
`src/simulation/rooms/zoning.ts`, `src/content/room-catalog.ts`,
`src/content/object-catalog.ts`, `src/simulation/construction/definition.ts`,
`tests/unit/objects-room-capacity.test.ts`,
[`docs/adr/0028-object-placement-and-derived-room-capacity.md`](../adr/0028-object-placement-and-derived-room-capacity.md),
and the earlier record
[2026-08-25 room occupancy](./2026-08-25-room-occupancy.md), whose two central
findings — four of six games have no room-capacity concept, and Prison
Architect uses a different rule per designation — were re-verified here
independently and both hold.
