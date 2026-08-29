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
