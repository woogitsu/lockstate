# ADR 0081: Whether a purchase may be partly filled, and at what granularity

> **0081 was recomputed off disk rather than taken from the index alone.** The
> maximum ADR number on disk is **0080**, and
> [`README.md`](./README.md) reads `Next free number: 0081`. Two answers agree.
> **The third leg of the practice `AGENTS.md` records was NOT performed**: the
> full sweep of every remote head. `git ls-remote --refs origin` returns 1,040
> refs and reading `docs/adr/` out of each was judged too slow to be worth the
> wall clock, so this number is **provisional** on the same terms 0080 recorded
> for itself: if it collides with an ADR landing from another branch, this file,
> its row in the index and every citation of it get renumbered together. The
> merge queue was empty apart from the owner's own draft at the time of writing,
> which is why the risk was accepted rather than paid down.

## Status

**Proposed, 2026-08-31. Not self-approved.**

**The owner has already ruled on the first question in this document and not on
the second**, and the distinction is the reason it exists. On 2026-08-31, in
[#703](https://github.com/matmaxalez/lockstate/issues/703) ruling 9, the owner
chose **partial fill** — *"kupować tyle, ile stać"* — over keeping all-or-nothing
and over writing an ADR first. That settles **whether**. It does not settle **at
what granularity**, and no ADR in this corpus ever has.

This document is offered so the owner can settle the second question with the
first, rather than have it decided in implementation code. `CLAUDE.md`'s rule is
*"If a necessary architectural decision is genuinely absent, create or propose an
ADR instead of silently deciding inside implementation code."*

## Context

### What the code does today, and it is not what any decision says

`ProcurementSystem.purchase` spends the whole figure or nothing
(`src/simulation/economy/procurement.ts:165-166`):

```ts
const paidMinorUnits = material.unitPriceMinorUnits * quantity;
if (!this.treasury.spend(paidMinorUnits)) return { ok: false, reason: 'insufficient-funds' };
```

`Treasury.spend` is strictly all-or-nothing against a floor of `0`
(`src/simulation/economy/treasury.ts`), and `setOverdraftFloor` has **zero
production callers**, so the floor is `0` in every session a player can start.

**And the granularity is coarser than an order.**
`ConstructionSystem.pendingMaterialDemand`
(`src/simulation/construction/system.ts:1026-1040`) sums every `approved` and
`materials-pending` order's requirements into **one figure per item id**, and
`JustInTimeMaterialsService.procureForPendingOrders` buys that whole per-item
deficit in a single call
(`src/simulation/economy/just-in-time-materials.ts:235-257`).

So thirteen pending wall orders become **one 26-brick purchase for 1,040**, and a
prison holding **1,039 buys nothing**. The service's own docblock says so at
`:139-142`, in its own words: *"a prison holding 300 against a deficit of eight
bricks at 40 buys nothing, not seven."*

### The measured cost, which is a control the interface offers making things worse

`tests/integration/economy-refund-survives-the-clock.test.ts:575-610` pins it:

| the player | holds | walls standing |
| --- | --- | --- |
| cancels the delivery | **300** | **0** |
| does not cancel | 60 | **3** |

**Cancelling a delivery leaves the prison richer in cash and strictly worse at
building**, because the money it got back can no longer be spent in one lump.
The test's own comment names the way out and what is wrong with it: *"And the way
back, which is one press and is nowhere stated."*

### What ADR 0017 decided, and why it is not this question

ADR 0017 decision 7, verbatim:

> **Materials are just-in-time by default; holding is permitted, never
> required.** #96's second open question, answered.

**The code keeps that promise.** Just-in-time is what
`JustInTimeMaterialsService` implements, holding is permitted, and the
`alreadyPaidForAndInFlight` term (`just-in-time-materials.ts:94-99`) exists
specifically so a pre-buying player is not bought over. Decision 7 answers *"is
holding required?"* — it says nothing about the atomicity of a purchase against a
partial budget, and nothing about the unit that atomicity applies to.

ADR 0017 decision 5 reserves **prices and balance values** to the owner.
Atomicity is neither, so this is not a decision that ADR already covers.

The nearest thing to a ruling is the code's own note at
`just-in-time-materials.ts:155-166`, which routes the question to ADR 0075 and
issue #29. **That is the wrong home and this document exists partly to say so: a
rule is not a magnitude.** ADR 0075 is about what a prison that cannot afford its
first bed is owed, and #29 is about numbers.

## Decision

**Recorded as the owner's ruling of 2026-08-31 rather than proposed here.**

### 1. A purchase may be partly filled

Buy what the treasury covers rather than refusing the whole per-item order.

**Measured basis**: it closes the asymmetry above — the service's own docblock
records that *"both branches then reach three walls"* under partial fill.

### 2. The unit of atomicity is the ORDER, not the item and not the queue

**This is the half the owner has not ruled on, and it is offered as a
recommendation.** Three candidates, and the argument is about what the player
can predict:

- **Per item across the whole queue** (today's granularity, with partial fill
  added). Cheapest to build and the worst to play: a partial buy is allocated by
  `orderedOrders()`, which sorts on the order **id** — and in a real session ids
  are `order-${crypto.randomUUID()}` (`src/main.ts:2208`, `:2439`), so the
  segment that gets the bricks is **random relative to placement order**. A
  player who drags a room's perimeter and can afford half of it gets a random
  half.
- **Per order.** An order is either fully funded and buildable or it is not, and
  the queue funds as many whole orders as the balance covers, in a stated order.
  A wall segment is a unit the player placed, so this is the granularity their
  intent was expressed at.
- **Per queue, all-or-nothing** (today, without partial fill). Rejected by the
  owner's ruling.

**Recommended: per order.** It is the only one of the three at which the answer
to *"why did that get built and not this?"* is a sentence the player could have
predicted before pressing.

### 3. The player is told what was bought, and that is a precondition rather than a nicety

`MaterialsProcurementReport` already carries `purchased` alongside `unfunded`
(`just-in-time-materials.ts:219-220`), and the projection reads **only**
`unfunded` (`src/simulation/presentation/construction-projection.ts:253`).

**A partial buy that silently spends the treasury and moves one segment forward
is worse than a refusal, because the money is gone.** Under the standing design
directive — the game must be easy and friendly, with no hidden mechanics — this
is not optional. **The sentence itself is the owner's** and is not drafted here;
`AGENTS.md`'s fourth exclusion reserves it.

## Consequences

**Partial fill accelerates the descent it is meant to soften.** In the measured
fixture it takes the balance from 300 to **60**, below the 65 that ADR 0075 uses
to define the locked position. It converts the player's last cash into wall
without asking.

**So it is only safe on top of ADR 0075 decision 2's negative balance**, which is
**Accepted and not enabled** — nothing calls `setOverdraftFloor`. Shipping
partial fill before that half is live would make the lock arrive sooner and for a
reason the player did not choose.

**And it does NOT fix the room-enclosure failure it looks like it should.** In
the measured locked position the pending set is `{wall-9, wall-314…wall-325}` and
allocation walks ascending order id, so a partial two-brick buy goes to
`wall-314` — not to the perimeter segment the room needs. **That is a separate
defect and it needs its own decision**: build orders execute in an order the
player cannot predict, and fixing it needs a persisted placement ordinal on
`BuildOrder`, which touches the save format. Measured: with the backlog cancelled
a loan principal of **65** escapes the lock; without it, nothing below **1,065**
does — a factor of sixteen, and every unit of it is this defect plus today's
granularity.

**This ADR supersedes the "recorded rather than fixed" paragraph** at
`just-in-time-materials.ts:155-166`, which is currently the only place the
decision lives, and it takes the question off ADR 0075 and issue #29.

## Open questions

1. **Which granularity** — §2 above. The owner's, and the only question this
   document is actually asking.
2. **What the player is told**, and whether a partial fill is a refusal-class
   sentence or an event-class one. Player-facing copy, so the owner's.
3. **Whether partial fill waits for the overdraft floor to be enabled.** The
   Consequences argue it should. Sequencing is a judgement about what a player
   meets first, so it is put up rather than taken.
4. **The build-order execution order** is deliberately NOT decided here. It is a
   different subject with a different blast radius — the save format — and
   folding it in would make one document that cannot be approved in halves.
