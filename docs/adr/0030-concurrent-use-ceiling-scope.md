# ADR 0030: What a room's concurrent-use ceiling counts, and what an open room gets

## Status

**Proposed — pending human approval.** Not accepted.

It answers the question [ADR 0028](./0028-object-placement-and-derived-room-capacity.md)
named as the sharpest limitation of its design — open question 4, *"`room.yard`
has no object requirement at all"* — and it answers a wider one that had to be
uncovered first, because the yard turned out to be a symptom rather than the
subject. ADR 0028's amendment records the two external citations that no longer
hold and the two open questions that have gone stale; **it deliberately decides
nothing**, and this is where a change to its decision 2 would be decided.

Nothing here is implemented. This document, its row in
[`docs/adr/README.md`](./README.md), one entry in
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md), ADR 0028's amendment and one corrected
test comment are the whole of the change that carries it.

### The number

**0030**, which `docs/adr/README.md` states as next-free, and the check that
statement cannot make was made: the open pull requests were listed, and the one
still open — #329, a replay-verification gate — adds no ADR, so no unmerged
branch is holding 0030 the way 0024 through 0027 were being held when 0028 was
allocated out of band. The index's next-free moves to **0031** in this commit,
because `tests/foundation/adr-numbering-contract.test.ts` derives it from the
highest number on disk.

### What the evidence rests on

**Tier R — this repository.** Every figure below was read on disk at `74446fb`
(v0.0.66) or produced by running this tree: the measurements drive the real
`deriveRoomCapacity` → `register` → `findAvailableForUse` → `claimUse` path
under the repository's own vitest.

**Tier E — external, and it is doing less work than in ADR 0028.** The
comparable-game evidence lives in
[`docs/research/2026-08-25-concurrent-use-capacity.md`](../research/2026-08-25-concurrent-use-capacity.md),
which opened Prison Architect's shipped data, RimWorld's and Oxygen Not
Included's decompilations and CorsixTH's Lua first-hand and tiers each claim.
Two of its claims are load-bearing here and both are flagged again where they
are used: that Prison Architect's Yard has no occupancy limit, which is
**verified as an absence in one artifact** and could in principle be
contradicted by compiled code; and that no shipped implementation of
capacity = area ÷ N could be opened at all.

---

## Context

### The measurement

`deriveRoomCapacity` adds `catalogue(objectId).footprint.width` to
`concurrentUseCapacity` for **every** recognised object inside the room's
rectangle, and filters on a capability only for `residentCapacity`
(`src/simulation/objects/room-capacity.ts`). `findAvailableForUse` then checks
that the requested capability is present *somewhere* in the room and compares
the headcount against that all-objects total
(`src/simulation/prisoners/room-instance-registry.ts`).

Measured on this tree, driving the real path:

| Room and contents | `concurrentUseCapacity` | Users the gate admits |
|---|---|---|
| 8×8 yard, empty | 0 | 0 for `action.yard-recreation` |
| 8×8 yard, one toilet | 1 | 1 |
| 8×8 yard, one loading-dock door | 3 | **3** |
| 8×8 yard, four benches | 8 | 8 |
| canteen, 2 dining tables + 4 benches | 14 | 14 with `'dining'` required |
| the same canteen + 4 toilets + 1 storage rack | 19 | **19** with `'dining'` required |

Two readings of the same defect. **A delivery door in a yard grants three
prisoners outdoor exercise while 64 tiles of open ground grant none.** And
**nineteen prisoners eat in a fourteen-seat canteen because four toilets and a
shelf are in the room** — on ADR 0028's own worked example, which states that
canteen as seating 14.

Reachability, stated precisely: only four buildables exist today —
`wall-brick`, `door-wooden`, `bed-wooden`, `toilet-brick`
(`src/simulation/construction/definition.ts`). ADR 0028 phase 4, the rest of the
object catalogue, has not landed, so the rows involving a bench or a dock door
are properties of the rule rather than things a player can build this week. The
over-count is live now at one user per toilet and grows with every object
buildable phase 4 adds.

### Why one scalar cannot be right

ADR 0028's §*Context* makes this argument one level up, and is right there:
`capacity` was two quantities, because "a canteen that seats fourteen houses
nobody, and a cell that holds one prisoner is not a statement about how many can
stand in it". **The same objection applies to the field it split off.**
Concurrent use is not one question either. It is asked per action, and different
actions in the same room consume different objects.
`findAvailableForUse(roomCatalogId, requiredObjectCapability?)` takes a
capability precisely because the caller's need is specific — and then compares
against a ceiling that is not.

### What the design's own precedent turned out not to say

Decision 2 justifies `footprint.width` by way of Prison Architect's `NumSlots`.
Of the 41 objects carrying that field in the shipped `main/data/materials.txt`,
**13 have a `NumSlots` that is not `max(width, height)` and 8 have one that
equals neither dimension** — `RiotVan` carries more slots than either. It is
authored, not derived. And it gates *the object*: that game's only room-level
occupancy machinery is fifteen `roomgrading_*` keys covering exactly `cell`,
`dormitory` and `sharedcell`, and nothing in its shipped data sums slots into a
room ceiling. ADR 0028's amendment records this in full.

So the rule this ADR contests was not argued from a precedent that exists. That
is a reason to look at it again; it is not by itself a reason to change it,
which is why §*The case for leaving it alone* below is written as seriously as
the decision.

### The signature of an unexamined consequence

`tests/unit/objects-room-capacity.test.ts` is the only test in the tree that
exercises an irrelevant object's contribution to concurrent use, and its comment
said the opposite of its own numbers:

```ts
    // Two sleep surfaces of width 1 each, and the toilet counts toward neither
    expect(derived.residentCapacity).toBe(2);
    expect(derived.concurrentUseCapacity).toBe(3);
```

The toilet is the entire difference between 2 and 3. The assertions are correct
descriptions of the behaviour and are untouched; **the comment is corrected in
the commit that carries this document**, because a true-looking sentence beside
a passing assertion is this repository's own documented defect class and leaving
it would leave the next reader believing the rule does what it does not.

---

## Decision, proposed

### 1. The concurrent-use ceiling is scoped to the capability being asked for

For a room instance `R` and a capability `c`:

```
concurrentUse(R, c) = Σ over objects(R) whose capabilities include c
                      of catalogue(objectId).footprint.width
```

which is exactly the shape `residentCapacity` already has, with
`'sleep-surface'` generalised to the capability the caller names. The canteen
seats 14 with any number of toilets in it, because a toilet carries
`'sanitation'` and not `'dining'`.

**It authors nothing.** Every property ADR 0028 defends survives: derived from
footprints this tree already ships, no number in a content file, orientation
ignored because capacity is a property of the object type, event-driven and
never per-tick.

### 2. An action that names no capability has no object-derived ceiling

This falls out of decision 1 rather than being added to it. If the ceiling is
"the summed footprint of the objects that serve this action", then an action
that names no object has no such sum — not a sum of zero. **The yard becomes
unbounded by derivation, not by exemption:** nothing about the yard is
special-cased, no room type is named anywhere, and no number is written down.

`undefined` already means "no constraint" in this design.
`requiredObjectCapability` absent already means any instance qualifies
(`src/simulation/prisoners/actions.ts`), and absent `width`/`height` already
means no rectangle was recorded
(`src/simulation/prisoners/room-instance-registry.ts`). This is that idiom, not
a new concept.

**What it forecloses, said plainly: for as long as it stands the yard cannot be
a scarce resource.** Every prisoner scheduled for recreation can be in one 8×8
yard. If Lockstate wants recreation rationed, the lever the reference
implementations use is the *timetable*, and Prison Architect additionally uses a
prison-wide "maximum safe capacity" measure — not a per-rectangle headcount
(tier E; the Yard half of that is the absence-in-one-artifact claim).

### 3. Three actions currently name no capability, and two of them are a content gap rather than a design one

Of the five `room-catalog-id` actions, three declare no
`requiredObjectCapability`: `action.yard-recreation`,
`action.common-room-recreation` and `action.classroom-education`. Under decision
2 all three would be unbounded, which is three rooms and not one.

For the latter two that looks like an omission rather than an intent.
`room.common-room` requires `object.bench` ×2 and `room.classroom` requires
`object.bookshelf` ×1 and `object.chair` ×4 (`src/content/room-catalog.ts`), and
those objects already carry `'seating'`, `'education'` and `'seating'`
respectively (`src/content/object-catalog.ts`). The capabilities exist; the
actions simply do not name them. **Naming them is a content change — one field
on two rows in a data module — not an architecture change**, and it leaves
`room.yard` as the only genuinely unbounded room, which is a far smaller and
more defensible surface than either room-type-keyed rule ADR 0028 open question
4 floats.

It is called out here rather than decided here: it changes what a prisoner can
do in a common room, so it belongs to whoever owns the action set, and it should
land *with* decision 1 rather than after it.

### 4. Where the per-capability figure lives is an implementation choice, and this ADR does not fix it

Two shapes are viable and neither moves the save format, because
`concurrentUseCapacity` and `objectCapabilities` are **not persisted**: the V5
room-instance row is identity, anchor and the rectangle only
(`src/persistence/save-schema.ts`), and both are recomputed at restore by
`RoomCapacityResolver.resolveAll`.

- **A map per capability on the instance**, written by `updateDerived` beside
  the existing fields. Same event-driven derivation, same three moments, and
  `findAvailableForUse` becomes a lookup instead of a comparison.
- **Computed at the query**, from the placed objects in the rectangle. No new
  stored field at all, at the cost of doing footprint arithmetic inside a gate
  that runs on the reconsideration path.

The first is closer to what exists and is the one to cost first. The second is
recorded because it is the only shape with no derived state whatsoever, which is
the property ADR 0028 decision 2 cares most about. Either way the residency
half is untouched: `residentCapacity` stays the summed footprint width of the
sleep surfaces, and `findAvailableResidence` and `findBestAvailable` keep the
gate they have.

### 5. What is not changed

`residentCapacity` and its rule. `objectCapabilities` and its ordering.
Orientation-blindness. The three moments the resolver runs, and that it is never
called from a scheduled `update`. The claim model of
[ADR 0029](./0029-concurrent-room-use-claims.md) — a claim is still taken on
arrival, still ends when the action ends, still blocks un-zoning, still resolved
by ascending entity index with no queue. The save format. No content id is
added and no capacity number is authored anywhere.

---

## The case for leaving it alone, which is real

**A single total is coherent if a room is a floor-space allocation rather than a
set of usable stations.** Read that way, nineteen people in a canteen with
fourteen seats is not an over-count: it is fourteen eating and five standing
about in the space the toilets and the shelf occupy, and the gate is measuring
how full the room is rather than how many can eat. Under that reading decision 1
is wrong, the yard should count its *ground* too, and an area-derived capacity
becomes the consistent answer rather than an ad-hoc one.

The research record names this as its own falsifier and is honest that it is a
judgement: **that the "every object" sum is a defect rather than a deliberate
abstraction is inferred from an absent argument, a citation that does not hold,
and a test comment that misread its own number.** No sentence anywhere in the
ADR, the code or an issue takes the floor-space position. If the owner holds it,
this ADR should be refused and open question 4 answered by area instead — and
the record's §6 prices that: `MAX_ZONE_DIMENSION_TILES = 64` bounds one yard at
4,096 tiles, so at the sizes players build, every plausible divisor is
indistinguishable from no limit while still authoring the one number this
architecture exists not to author.

---

## The options that were rejected, and why

**Author a number on `room.yard`.** One line, today. It is the option ADR 0028
was chosen over, it writes the figure object placement must later overrule, and
it leaves the canteen seating nineteen — a separate defect left standing. The
precedent does not rescue it either: Theme Hospital authors
`maximum_patients = 1` as a *floor* for rooms where one patient at a time is the
truth, and its open area — the corridor — is not a room and has no capacity at
all (tier E, VERIFIED against CorsixTH).

**Derive the yard's capacity from its floor area.** Rejected on three counts,
all in the research record: no shipped implementation of capacity = area ÷ N
could be opened; the divisor is an authored number, so the property is relocated
rather than preserved; and the number never binds, because a yard is 64…4,096
tiles against a prison of tens of prisoners, and nothing stops four adjacent
yards. Where area *does* earn its place in shipped games is as a gate — Oxygen
Not Included refuses a designation above `MAXIMUM_SIZE_n`, RimWorld caps the
*reward* for area at `Mathf.Min(num, 350f)` and stops assigning a room a role
past 60 regions. Those are zoning and comfort mechanisms, not capacities, and
either would sit beside this decision rather than instead of it.

**Make the existing scalar `undefined` for a room whose definition declares no
`object` requirement.** This was the earlier recommendation and it is superseded
by decision 1. It is keyed on the *room's content* rather than on the *action's
need*, so it fixes the yard and leaves the canteen over-counting; and the set it
selects — today exactly `{room.yard}` — is content, so the rule's meaning
changes silently the day a nineteenth room ships without furniture.

**Scope the ceiling per action id rather than per capability.** More precise and
strictly worse: it puts action ids into a room-capacity rule, so a new action in
an existing room becomes a capacity change. The capability is already the
vocabulary both sides share.

---

## Consequences

- **A room stops having one occupancy number, and a readout has to say
  "capacity for what".** `RoomListRowViewModel` projects `residentCapacity`
  today (`src/simulation/presentation/room-projection.ts`) and is unaffected;
  ADR 0028 phase 5's Rooms-tab verdict is the surface that inherits the
  question, and it should be designed knowing the answer is per capability.
- **No save-format change and no migration.** Both derived fields were removed
  from the persisted row in V5, so this changes a computation and not a format.
- **Determinism.** The sums are integer additions over objects enumerated in the
  existing canonical order, so nothing new is ordered and no named RNG stream
  moves. Behaviour *does* move where a room holds objects a capability does not
  cover, so a scenario fingerprint that exercises a mixed room can move — which
  makes this the same class of change as ADR 0029 phase 6 and it owes the same
  evidence when it lands.
- **The yard becomes usable without any content addition**, which is what
  ADR 0028 open question 4 was blocking. `action.yard-recreation`'s
  `{ recreation: 3, safety: 0.1 }` — the strongest recreation effect in the set
  — becomes reachable in an empty zoned yard.
- **Phase 4 stops making the over-count worse as it lands.** Every object
  buildable added today widens the gap between a room's ceiling and its usable
  stations; under decision 1 an object only raises the ceiling for the thing it
  can actually be used for.
- **ADR 0028's decision 2 is amended rather than replaced if this is accepted.**
  Its residency rule, its orientation rule, its event-driven resolver and its
  "nothing authored" property all stand; one summation grows an argument.

---

## What this decision does not settle

1. **Whether crowding should hurt.** Every reference implementation that could
   be opened expresses "this space is worse when packed" as a continuous
   per-occupant effect and never as a refusal — RimWorld's `Need_Outdoors`
   recovering per pawn under open sky with no slot to occupy, Theme Hospital's
   ±0.00002 happiness for sitting versus standing, Oxygen Not Included's Park
   paying a morale `effect` per triggerer with no counter, Prison Architect's
   `Privacy` need with `MisbehaviorType Spoiling` (tier E, all VERIFIED). A
   modifier on `needEffectsPerTick` derived from occupants per tile is the shape
   that follows, it needs the rectangle decision 6 of ADR 0028 now carries, and
   it is a balance rule that touches determinism. **Its own ADR, not this one.**
2. **Whether zoning should refuse an absurdly large room.** Oxygen Not
   Included's `MAXIMUM_SIZE_n` is the shipped mechanism for that worry and it
   would live beside the `minimum-size` check that already exists in
   `src/simulation/rooms/zoning.ts`. Independent of capacity in both directions.
3. **Whether `action.common-room-recreation` and `action.classroom-education`
   should name their capabilities.** Recommended in decision 3, not decided:
   it changes what a prisoner can do in an existing room.
4. **Whether a room should be able to report *why* it is full.** "No free
   station of the kind you need" and "the room is at capacity" become different
   sentences under decision 1, and nothing surfaces either today.
5. **Whether recreation should be scarce at all.** If it should, decision 2 is
   arguing against the intended game and the answer is the timetable rather
   than a per-room count. That is a product question and it is the owner's.
