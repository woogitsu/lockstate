# ADR 0071: What bounds a room whose activity consumes no object

> **0071 was assigned centrally**, after this draft returned, which is the
> practice `AGENTS.md` records and the one ADRs 0038, 0065, 0066 and 0069 each
> followed. The draft came back **unnumbered** with the arithmetic written out
> rather than guessing, and this is the case that shows why that is a rule and
> not a courtesy — because the number it was first given was wrong **twice**,
> in opposite directions, and neither error was the drafting agent's.
>
> 1. The agent was told *"ADR 0070 landed today, recompute `max + 1`"*, which
>    would have made 0071 the honest answer. It declined to take any number,
>    because whether a higher number is in flight on an unmerged branch is a
>    fact about branches a worktree cannot see.
> 2. It was then assigned **0070**, on the stated grounds that
>    `docs/adr/` had been swept across `main` and every unmerged remote
>    `agent/*` branch with nothing found above 0069 — and that *"0070 landed
>    today"* had been this index's own next-free line relayed as a landed
>    number. The first half of that was true. **The sweep had not been run.**
> 3. Run properly, it says `agent/533-dismiss-staff` (PR #547) has held
>    **0070** since before any of this, in a commit titled *"Land ADR 0070:
>    dismissing a staff member, and what an empty sector asks for"*
>    (`7db68a5`), carrying `0070-dismissing-a-staff-member.md` on that
>    branch. Had the assignment been taken, two branches would have landed
>    0070 and the collision would have surfaced at merge, in the file whose
>    entire purpose is to prevent exactly that.
>
> So the failure this index has been tracking since 0004 recurred, and **this
> time it was the integrator's rather than a draft's** — which is the direction
> the paragraph in `README.md` had not previously recorded. The agent
> re-verified the sweep itself before committing rather than accepting the
> correction on trust: `origin/main` maxes at 0069, `agent/533-dismiss-staff`
> and `wip/533-dismiss-staff` at 0070, nothing on any remote head above 0070.
>
> **`max + 1` recomputed off disk at commit time gives 0070, and that
> disagreement is expected rather than a reason to stop.** Disk can only see
> what has merged; 0070 is on a branch this worktree cannot read, and central
> assignment exists precisely for what has not merged. This is the one case in
> this index's history where the recomputation is *not* the authority, and it
> is worth stating plainly so the next reader does not take the arithmetic as
> licence. Because 0071 is the new maximum it moves the `Next free number` line
> to **0072**.
>
> **Three numbers were handed out together**, so a later reader meets a
> sequence rather than inferring gaps: **0070** to the staff-dismissal ADR on
> `agent/533-dismiss-staff`, **0071** to this one, and **0072** to the
> events-persistence decision on `agent/507-event-channel`, which the owner has
> just ruled on. None can collide with another.

## Status

**Proposed, 2026-08-29. Not self-approved.**

It implements [issue #535](https://github.com/matmaxalez/lockstate/issues/535)
decision 3 and [issue #532](https://github.com/matmaxalez/lockstate/issues/532),
whose *mechanism* the owner decided in both halves: the kitchen gets an action
**and** the yard is weakened so the common room has a state in which it wins.
The owner explicitly rejected leaving the yard strong with the common room
given a niche, and rejected hiding both rooms until they have a use. What this
ADR records is how the second half was implemented, and why no other lever
could deliver it.

## Context

[ADR 0028](./0028-object-placement-and-derived-room-capacity.md) decision 2, as
amended 2026-08-26 by issue #326, derives a room's concurrent-use ceiling from
the objects standing in it: for a capability `c`, the summed `footprint.width`
of the objects declaring `c`. Nothing is authored per room; every figure comes
off a footprint the content already ships.

That amendment also decided what happens when an action names **no**
capability, and the answer was *nothing bounds it* — recorded in
`RoomInstanceRegistry.concurrentUseCapacityFor` case 1 as
`Number.POSITIVE_INFINITY`, with the reasoning that "a rule that sums object
footprints has no domain, and the honest reading of an undefined ceiling is
'this rule does not bound it' rather than 'it bounds it at zero'."

That reasoning is correct about the rule, and it was a real fix. Before it, an
objectless yard read as a ceiling of **zero** and admitted nobody to 64 tiles of
open ground, while the same yard holding one three-tile delivery door admitted
three.

`room.yard` is the only room type in `src/content/room-catalog.ts` requiring no
object, and `action.yard-recreation` is the only `room-catalog-id` entry in
`DEFAULT_ACTIONS` naming no capability. So exactly one room in the game had no
ceiling of any kind, and issue #532 measured what that turned into.

## What was measured

`scoreAction` is deficit × effect summed
(`src/simulation/prisoners/utility-ai.ts:16-24`); `rankActions` sorts
descending, ties by ascending action id. `action.yard-recreation` gives
`recreation: 3` and `safety: 0.1`; `action.common-room-recreation` gives
`recreation: 2`. Therefore

```
score(yard) − score(common) = d_recreation × 1 + d_safety × 0.1
```

and a deficit is `NEED_MAX − level`, which is never negative. **The yard scores
at least as high as the common room in every state a prisoner can be in**, with
equality only when both deficits are exactly zero — and at that tie the
ascending-id tie-break takes `action.common-room-recreation`. The common room
was reachable on merit in exactly one state: the one where winning is worth
nothing.

`beginNextAction` walks the ranked list until a candidate resolves a target
([ADR 0041](./0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
decision 1), so the only other route to the common room is the yard failing to
resolve. With no ceiling it never fails.

Measured on the real kernel in a worktree checked out at `feefbc4` (v0.0.189)
with nothing applied — six prisoners, six furnished cells, an 8×8 yard, a 5×5
common room with its two authored benches, five in-game days:

```
action.yard-recreation        6,952 performing ticks
action.common-room-recreation    96 performing ticks
most prisoners in the yard at once: 6 of 6      ceiling: Infinity
```

The 96 ticks are the exact-zero-deficit tie, not a near miss. An independent
audit reached the same conclusion from the scoring code alone and noted
correctly that at zero deficit both score zero — so "every possible state"
overstates it and "every state that actually occurs" does not.

## Options considered

1. **Change the scores.** Rejected, and *provably* insufficient rather than
   merely unattractive. The difference above is a linear form in two
   non-negative deficits, so it changes sign inside that quadrant only if the
   two coefficients have opposite signs — which means giving the common room a
   *safety* advantage over the yard. That is raising the common room, which an
   audit named specifically as recreating the same dominance in the other
   direction, and the state it would then win in (`d_safety > 10 ×
   d_recreation`) is a numerical corner rather than anything a player can see or
   cause. Keeping the yard ahead changes nothing at all; putting it behind
   leaves the *yard* with no state. Raising the common room from 2 to 4 is the
   specific form the audit named, and it is this option.
2. **Give `action.yard-recreation` a `requiredObjectCapability`.** Rejected:
   `room.yard` requires no object, so the ceiling would derive 0 and the yard
   would admit nobody — the exact regression #326 removed. Making it work needs
   an object requirement on `room.yard`, which is issue #529's surface and out
   of scope.
3. **An authored per-action ceiling** (`maxConcurrentPerformers?: number` on
   `ActionDefinition`). Rejected on playability: every yard would then admit the
   same number regardless of size, so a bigger yard would buy the player nothing
   and the ceiling would be a nerf rather than a build decision. It also
   *authors* a capacity, which nothing in `deriveRoomCapacity` does.
4. **Derive the ceiling from the room's own ground.** Taken.

## Decision

`RoomInstanceRegistry.concurrentUseCapacityFor`, case 1 — an action naming no
capability — answers

```
max(1, floor(width × height / TILES_PER_OPEN_GROUND_PLACE))
```

instead of `Number.POSITIVE_INFINITY`.

1. **Still derived, and still authored nowhere per room.** An 8×8 yard admits 4
   and a 16×16 yard 16, from the rectangle the player drew. "No *object*
   ceiling" is not the same statement as "no ceiling"; the resource such a room
   supplies is its floor.
2. **An instance recording no rectangle keeps the unbounded answer.** A V4 save
   carries no bounds, the rule has no domain without them, and inventing a
   rectangle would assert a room the player did not zone — `roomBoundsOf`'s
   reasoning in `src/simulation/objects/room-capacity.ts` applied to the one
   place a missing rectangle would otherwise start refusing prisoners a yard
   they had before the upgrade. No save format moves and
   `SAVE_SCHEMA_VERSION` is untouched: capacity has not been persisted since
   ADR 0028 phase 1, and a use claim is rebuilt at restore.
3. **Never zero for a room that has a rectangle.** `floor(6/16)` is 0, so a 2×3
   cell would admit nobody without the clamp, and "a room that exists and admits
   nobody" is precisely what #326 removed. No legal `room.yard` reaches the
   clamp — its authored minimum is 8×8 and 64 tiles, which `RoomZoningService.zone`
   enforces — but every smaller room type does, which is where a future action
   naming no capability would otherwise find a silent zero.
4. **It lives in `room-instance-registry.ts`**, not beside `deriveRoomCapacity`,
   because that module has **no runtime imports at all** and a ceiling needing
   the object catalogue to ask "how big is this room" is how it would acquire
   one. This rule reads only the instance.

## The figure

`TILES_PER_OPEN_GROUND_PLACE = 16`. Every other room's density at its authored
catalogue minimum, which is where it comes from:

```
room.laundry      3x3 =  9 tiles / 4 places ('laundry',          2 machines x 2)  =  2.25
room.kitchen      4x4 = 16 tiles / 4 places ('food-preparation', stove + counter) =  4.0
room.shower-room  3x3 =  9 tiles / 2 places ('hygiene',          2 heads x 1)     =  4.5
room.canteen      6x6 = 36 tiles / 6 places ('dining',           2 tables x 3)    =  6.0
room.common-room  5x5 = 25 tiles / 4 places ('recreation',       2 benches x 2)   =  6.25
room.classroom    5x5 = 25 tiles / 2 places ('education',        1 bookshelf x 2) = 12.5
```

16 is deliberately looser than all six: the yard is the one activity that is
people spread over open ground rather than people at furniture, and the one room
whose capacity is free to extend. A number inside that range would make the free
room the densest as well as the cheapest. At the catalogue minimums it puts an
8×8 yard at **4**, exactly what a 5×5 common room with its two authored benches
admits.

Measured at 8 instead of 16: a minimum yard admits 8, all six prisoners fit, and
the common room falls back to its pre-change 96 ticks. **8 does not deliver the
decision at this prison size**, which is the evidence the figure rests on rather
than an aesthetic preference.

**It remains open to re-measurement.** ADR 0017 decision 5 makes a balance
figure data rather than architecture, and this one carries the standing flag
`src/simulation/prisoners/sentence.ts`'s bounds,
`src/simulation/contraband/intelligence.ts`'s decay and
`src/simulation/world/tile-ownership.ts`'s rule carry. What is *not* open is the
mechanism above it: that an objectless room is bounded by its ground is the
owner's decision, and a different integer changes how much, never whether.

## Consequences

Measured on the prison above, five in-game days:

```
unmodified,  8x8 yard   yard 6,952   common room    96   ceiling Infinity   peak 6 of 6
bounded,     8x8 yard   yard 5,872   common room 1,248   ceiling 4          peak 4 of 4
bounded,    16x8 yard   yard 7,208   common room   336   ceiling 8          peak 6 of 6
unmodified, 16x8 yard   yard 7,208   common room   336   ceiling Infinity   peak 6 of 6
```

The yard is *weakened*, not replaced: it still scores higher, still takes the
larger share, and a prisoner goes indoors because the yard is full rather than
because the common room became better. A change that made the common room
dominant would be the same defect pointing the other way, and both halves are
asserted.

**The last two rows are identical to the tick**, and that is the strongest
available statement about blast radius: a yard with room for its population
behaves exactly as it did — the ceiling binds nothing and costs nothing — and
the whole of this change is what happens to a yard too small for the prison
around it. The residual 336 common-room ticks are the exact-zero-deficit tie in
both trees, which is why they too are unchanged.

The player's answer to a full yard is to zone more ground: `room.yard` authors
`outdoors` and no `object` requirement, so twice the yard costs no walls, no
objects, no materials and no money. That is what makes the ceiling a build
decision rather than a nerf.

One existing fixture stopped modelling its own name and was corrected rather
than re-baselined. `tests/integration/needs-state-grant-loop.test.ts`'s `SERVED`
prison has eight prisoners and had an 8×8 yard, which now admits 4, so three of
its ten days paid 2,360 instead of 2,400 and `served − neglected` fell from
3,200 to 3,080. Taking those as the new expectation would have quietly renamed
the suite — *"a prison that serves every need"* would have described one that
does not — so its yard is enlarged to 16×8 (128 tiles, 8 places, one per
prisoner) and the measured numbers are recorded in its comment.

## What would change our mind

**The weakest claim here is that the state the common room wins in is one a
player will actually meet.** Land is free, so "enlarge the yard" dominates
"build a common room" economically in any prison with spare ground: this ceiling
bounds the *current* yard, not the yard as a concept. What makes it a real
choice today is that a yard must be re-zoned as the population grows and a
common room need not be.

If play shows players zoning one enormous yard on day one and never building a
common room again, the ceiling has **moved** the defect rather than removed it —
and the next lever is a cost on ground, not a tighter value of
`TILES_PER_OPEN_GROUND_PLACE`. Tightening the figure would make small yards
useless without making large ones cost anything, which is the failure this
decision is already designed to avoid.

## Out of scope

The other nine catalogue rooms with no action targeting them; room
*requirements* (issue #529's surface); and the event channel on
`agent/507-event-channel`, whose own decision is 0072.

## Amendment, 2026-08-29: floor-area capacity applies only to a room type tagged as an open area (issue #585)

*The **ruling** is the owner's, recorded on
[issue #585](https://github.com/matmaxalez/lockstate/issues/585) on 2026-08-29
under the heading "OWNER RULING, 2026-08-29: floor-area capacity is restricted
to open-area rooms". Its words: **"Capacity derived from a room's own ground
applies only to room types explicitly tagged as open areas — `yard`,
`holding-cell`, `delivery-bay`."** Everything else in this section — the wording
of the clause, the tag's shape, where it lives, the two corrections in part 3
and every consequence drawn — is this editor's work under that ruling. A reader
who disagrees with a consequence should treat that consequence as open; the
ruling itself is not open.*

*This ADR's `Status` is **untouched** and still reads `Proposed, 2026-08-29. Not
self-approved.` The ruling scopes what this ADR decides; it does not accept the
document. That is one of the two reasons this amendment carries a row in
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 — see part 5.*

*Read on `agent/585-occupied-place` at `05640b6` (v0.0.210). Every `file:line`
below was opened there.*

### Part 1. The clause

> **Domain.** The rule in "Decision" binds an instance whose **room type is
> explicitly tagged an open area** in `src/content/room-catalog.ts`, and only
> those. Every other room type answers **0** for an action that consumes no
> object, whatever its rectangle and whether or not it has one.

Three tagged, and they are the owner's list: `room.yard`, `room.holding-cell`,
`room.delivery-bay`.

**Decision 1 is otherwise unchanged.** Within an open area the ceiling is still
`max(1, floor(width × height / TILES_PER_OPEN_GROUND_PLACE))`, still derived,
still authored nowhere per room. An 8×8 yard still admits 4 and a 16×16 yard 16.
Every measurement in "What was measured", "The figure" and "Consequences" was
taken on `room.yard`, which is tagged, so **not one number in this document
moves**.

**Decision 2 is unchanged in substance and re-ordered in effect.** An open-area
instance with no rectangle still keeps the unbounded answer. An **untagged**
instance with no rectangle now answers 0 rather than falling through to
`POSITIVE_INFINITY` — the domain test runs first, deliberately, because an
untagged room reaching the unbounded branch is this ruling defeated through a
back door.

**Decision 3's clamp is scoped, and the scoping made it real.** "Never zero for
a room that has a rectangle" now reads "never zero for an *open-area* room that
has a rectangle". Decision 3 was written with the note that no legal `room.yard`
reaches the clamp and "every smaller room type does" — a clamp with no legal
subject. Under this amendment its subject is `room.holding-cell`, whose authored
minimum is 2×2: `floor(4/16)` is 0, so the clamp binds on a room a player can
actually zone.

**Decision 4 is why the tag is on the instance rather than looked up.** That
decision put this rule in `room-instance-registry.ts` *because* that module has
no runtime imports at all and "reads only the instance". A catalogue import
would falsify the sentence the decision rests on, so `RoomInstance.openArea`
carries the answer and the two registration sites — `RoomZoningService.zone`
(`src/simulation/rooms/zoning.ts`) and `restoreSessionSystems`
(`src/simulation/runtime/session-systems.ts`), both of which already read
content — resolve it through `isOpenAreaRoom`. The registry still reads only the
instance.

**Not persisted, re-derived on every load.** `openArea` is a property of the
room *type*, so a saved copy could disagree with the build that reads it back —
which is ADR 0028 phase 1's reason for not persisting capacity, applied to a
tag. `PersistedRoomInstance` is built field by field against a `.strict()`
schema and carries no such field, so no save format moves and
`SAVE_SCHEMA_VERSION` is untouched.

### Part 2. The reason, in the owner's terms

The argument the owner accepted, quoted on #585 from the design corpus:

> "This is correct for `yard` and `holding-cell`, but it is the direct cause of
> the 1-plank-3-prisoners exploit in `cell`… Otherwise the player is rewarded
> for building bedless cells, which contradicts every other design signal."

And the general form of it, which is what survives part 3's correction: **a room
supplies capacity from its ground only where its ground is the resource.** A
yard is people spread over open ground; a cell is a bed. This ADR's own §*The
figure* already says exactly that about the yard — *"the yard is the one
activity that is people spread over open ground rather than people at
furniture"* — and stops one step short of drawing the boundary. The ruling draws
it.

### Part 3. Two corrections to the ruling's premise, with the evidence

Recorded rather than implemented silently, because a decision resting on a false
premise is worth re-reading even when the decision is right.

**1. The decision being amended is this one, not ADR 0017 decision 5.** #585 and
the brief both name "ADR 0017 decision 5". That decision reads, in full: *"This
ADR decides no prices and no balance values. #29 puts final pricing and balance
out of scope and nothing here changes that."* The sentence the ruling quotes is
this ADR's Decision. (The confusion is easy to make and this document contributes
to it: §*The figure* above cites ADR 0017 decision 5 correctly, for the adjacent
proposition that a balance figure is data rather than architecture.)

**2. A bedless `cell` has never had floor-area capacity in this tree, so this
was not the cause of the exploit.** Measured at `05640b6`:

- **Residency does not read floor area at all.** `residentCapacity` is
  `deriveRoomCapacity`'s sum of `footprint.width` over the objects declaring
  `'sleep-surface'` (`src/simulation/objects/room-capacity.ts:176-201`), which is
  ADR 0028 decision 2. A bedless cell already derived **0** and
  `findAvailableResidence` already refused it. The rule this amendment scopes is
  the **concurrent-use** ceiling — `concurrentUseCapacityFor` case 1 — and no
  path connects it to residency.
- **Only `room.yard` can reach case 1.** Its three production callers
  (`src/simulation/prisoners/action-system.ts:820`, `:1067`, `:1082`) all pass
  `action.requiredObjectCapability`, and all sit behind
  `target.kind === 'room-catalog-id'` — `claimUseIfNeeded` returns `true` for an
  `own-accommodation` target without claiming anything. Three actions in
  `DEFAULT_ACTIONS` name no capability: `action.eat-in-cell` and
  `action.free-association` target own-accommodation, and
  `action.yard-recreation` targets `room.yard`.

**So the exploit #585 measured was residency's, and it is fixed by the other
half of that issue** — an occupied place now means a prisoner backed by
residency capacity that currently exists (`stateIncomeForCompletedDay`,
`RoomInstanceRegistry.residentIdsWithExistingPlace`). Measured on the real
command router: three prisoners, one bed standing, **900 minor units a day
before and 300 after**, against a control's unchanged 300.

**The ruling still lands, and this is the argument for landing it rather than
reporting the premise and stopping.** It changes nothing a player can currently
reach — `room.yard` is tagged, so every ceiling in the game is what it was. What
it buys is that the door cannot open later: the next action that names no
capability, on any room type, cannot conjure a place out of a bedless cell's
floor, and it cannot do so by omission either, because an absent tag means "not
an open area". The ruling closes the door it was aimed at; it simply was not
open yet.

### Part 4. The accepted cost

Stated by the owner when the option was put:

> "This is a change to a decision, not to an implementation, and every reader of
> [the ADR] who learned decision 5 in its general form now has to learn the
> exception."

Three more, this editor's:

- **A per-room-type authoring obligation, paid forever.** Every room type added
  from now on is not an open area unless somebody says so. That is the right
  default and it is still a thing to remember, and the only guard is
  `tests/unit/content-catalogs.test.ts`, which pins the tagged set as a whole
  rather than as three memberships — so a *fourth* room quietly acquiring the
  tag fails.
- **A generality lost.** Decision 1's rule used to be a statement about rooms;
  it is now a statement about three of them. A future room whose activity really
  is people on open ground gets nothing until it is tagged, and it will look
  like the pre-#326 defect when it does — a room that exists and admits nobody.
  The tag is one word; knowing it is needed is the cost.
- **Six fixtures in four files had to say what they had been getting for free.**
  None of them was a test of this rule. That is the ordinary price of turning a
  default into a declaration, and it is recorded because it is also the evidence
  that the default was doing work nobody had written down.

### Part 5. Why this carries a queue row

[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 triggers on an **outstanding**
decision, and `docs/adr/README.md`'s *"An amendment to an accepted ADR"* section
requires an amendment to state its approval position in its own opening — which
this one does. Two things are outstanding here, and neither is the ruling:

1. **This ADR is still `Proposed`.** The ruling scopes a document nobody has
   accepted, so a reader meeting decision 1 has to be told both that it is
   proposed and that it is already narrower than it reads.
2. **The debt ADR 0074's own queue entry names is still open.** That entry
   records that *"ADR 0071's own text is a second, separate debt … its index row
   and its decision 2 still name 'a V4 save' as the unbounded case, and whether
   that gets a marked amendment is the owner's call."* This amendment does
   **not** discharge it: it touches decision 2 only for the untagged case, and
   the "a V4 save" example is still there and still wrong. It is named here so
   that the next editor of this document meets both debts at once.
