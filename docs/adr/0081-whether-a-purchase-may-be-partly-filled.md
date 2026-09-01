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
first, rather than have it decided in implementation code.

> **THE SECOND QUESTION WAS RULED ON LATER THE SAME DAY, and the paragraph above
> is kept because it is what this document was written to do rather than a claim
> about where things stand.** In #703 ruling 12 the owner chose **per order** —
> *"na zlecenie"* — over per item across the whole queue and over per queue.
> Decision §2 below records that ruling in place of its recommendation. The
> status line above is still **Proposed** and stays that way until the owner
> signs it: a ruling on one section is not a signature on the document, and
> nothing in this corpus is self-approved. `CLAUDE.md`'s rule is
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

> **Both halves of that sentence stopped being true on 2026-08-31, and it is
> kept because this document's measurements were taken under it.** #703 ruling A
> made the negative balance a standing overdraft every prison has, and
> `createNewSimulationRuntime` now calls
> `setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS)` — `-2_500`, one tenth
> of the opening grant — on the treasury it builds
> ([ADR 0083](./0083-what-opens-the-negative-balance-and-what-bounds-it.md) §2).
> **`Treasury.spend` is still strictly all-or-nothing**, which is the half this
> section's argument actually rests on; what moved is the number it is
> all-or-nothing *against*. The figures below that were measured against a floor
> of `0` are each marked where they stand. This correction is written by the
> agent that opened the floor and **changes no decision in this document**; the
> recommendation, the open question and the Status line are untouched.

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
bricks at 40 buys nothing, not seven."* (That sentence is a `drainedPrison`
comment and the helper's arithmetic moved with #703 ruling A; the relationship it
describes — 265 of spending power against a 320 deficit — did not.)

### The measured cost, which is a control the interface offers making things worse

`tests/integration/economy-refund-survives-the-clock.test.ts`, the case *"stalls
a whole queue the prison can no longer fund in one lump, and one press undoes
that"*, pins it:

| the player | can still spend | walls standing |
| --- | --- | --- |
| cancels the delivery | **265** | **0** |
| does not cancel | 25 | **3** |

> **This table read 300 and 60, in the *balance*, and the two figures moved on
> 2026-08-31 without the finding moving at all.** #703 ruling A opened a standing
> overdraft, so spending power and the balance stopped being the same number; the
> fixture now reaches the same 265-against-320 relationship at a balance of
> `-2,235`, and the row that used to say 60 is a balance of `-2,475`. The
> citation was also `:575-610`, which the same change moved — quoting the case's
> title instead, because a line number into a file under edit is the least
> durable citation this repository has (`docs/AGENT_WORKFLOW.md` §4).
>
> **AND BOTH REPLACEMENT BALANCES HAVE THEMSELVES ROTTED, which is recorded here
> rather than edited into the paragraph above**
> ([#760](https://github.com/matmaxalez/lockstate/issues/760), 2026-09-01). The
> owner's ruling 19 of 2026-08-31 gave ADR 0017 decision 8's rungs their own
> thresholds inside the overdraft, and `wages` is the only class whose threshold
> is the floor itself (`INSOLVENCY_RUNG_FLOORS_MINOR_UNITS`,
> `src/simulation/economy/treasury.ts`), so `drainedPrison` now takes the last
> stretch of its drain at a payday rather than at a press — which is also how a
> real session arrives here. The fixture holds `DRAINED_BALANCE = -1_735` and
> `DRAINED_AFTER_SIX_BRICKS = -1_975`, not `-2,235` and `-2,475`. **The window is
> unchanged and the window is the finding**: 265 of construction spending power
> against a 320 deficit, and 25 once the six bricks are back in flight. Twice now
> a balance in this section has moved without the relationship moving, which is
> the case for stating the spending power here and leaving the balance to the
> fixture that computes it.

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

**This was the half the owner had not ruled on when this file was written, and
it was offered as a recommendation. It has since been ruled on and the ruling is
what §2 now says**, in #703 ruling 12 of 2026-08-31: **per order**, in the
owner's words *"na zlecenie"*. The three candidates and the argument between them
are kept below because the ruling is only legible against what it chose over:

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

**Ruled: per order** (#703 ruling 12, 2026-08-31). It is the only one of the
three at which the answer to *"why did that get built and not this?"* is a
sentence the player could have predicted before pressing — and that was the
recommendation this section carried before the ruling, so the ruling and the
argument agree.

**What per order does NOT settle, and the arithmetic says so.** Per order fixes
which *unit* is funded whole; it does not fix **which** unit is reached first,
because that is `orderedOrders()`'s ascending-id walk either way. Measured over
the thirteen pending orders of the locked position below, at 80 each, with the
perimeter segment at rank *r* in the walk:

| granularity and order | credit the perimeter needs |
|---|---|
| per queue, all-or-nothing, id order (today) | **1,000** flat |
| **per order**, id order (this ruling) | `80r − 40`, so **40 to 1,000**, expected 520 |
| per order, placement order | **0** — never in the unfunded tail |

So this ruling halves the *expected* requirement and **leaves the worst case
exactly where it is**, on a draw the player cannot see. §2's own wording is *"the
queue funds as many whole orders as the balance covers, **in a stated order**"* —
and there is no stated order to fund them in until the execution-order question
in open question 4 is settled.

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

> **The precondition in that paragraph is now met, and the *reason* for it has
> come back sharper rather than gone away.** #703 ruling A enabled the negative
> balance on 2026-08-31 (see the correction in the Context above), so
> "not enabled" is false and the two figures moved: the fixture the 300-to-60
> measurement came from is now `-2,235` to `-2,475` in
> `tests/integration/economy-refund-survives-the-clock.test.ts`, which is the
> same 265-against-320 relationship expressed against the floor the prison has.
>
> **What the agent who implements partial fill needs from that same sweep**, and
> it is measured rather than argued —
> `scripts/report-loan-recovery-pricing.mjs` §10c, on this branch: today
> `procureForPendingOrders` issues one purchase per item id for the whole
> aggregated deficit, so a standing queue costing **more** than the facility buys
> **nothing at all** and the prison sits at `-25`. That all-or-nothing refusal is
> currently the only thing bounding how much of the overdraft an unfunded queue
> can eat. Remove it, and a queue whose cost exceeds 2,500 walks the prison to
> the floor with no press — where a 20-order tail costing 1,600 already strands
> it at `-1,625` with no capacity and no income. **So partial fill is not merely
> "safe now"; it widens the band of queue sizes that can silently strand a
> prison from `(1,040, 2,500)` to everything above 1,040.** Whether that needs a
> bound of its own is a question for this document and is not answered here.
>
> **THAT PARAGRAPH'S PREMISE WAS MEASURED WHEN PARTIAL FILL WAS IMPLEMENTED AND
> IT DOES NOT HOLD. It is kept because it is what the implementing agent was
> briefed against, and because a decision record's wrong turns are worth more
> visible than tidied away.** Re-measured 2026-08-31 on `c6cd3e3` by tagging
> every `ConstructionSystem.procureQueuedMaterials` call with whether it came
> from `ConstructionSystem.update` or from the `PlaceBuildOrder` command
> handler, over §10c's whole sweep (tails of 13, 20, 31, 40 and 60 orders):
>
> | | spent | purchases |
> |---|---|---|
> | the scheduled pass — the one with no press | **0** | **0** |
> | the `PlaceBuildOrder` presses | **27,440** | **343** |
>
> in every one of the five runs. **The all-or-nothing refusal was not bounding
> an unpressed drain, because there was no unpressed drain to bound.** A press
> buys the *increment* its own order adds and an increment is one wall, so the
> walk to −2,440 that §10c reports was already per order and already pressed
> for. The sentence *"a forty-order tail costing 3,200 strands nothing at all"*
> is also not what that section prints: it prints a final balance of −2,440 with
> ten orders still standing, and the `-25` above appears in no run of it.
>
> **And the sweep was re-run after partial fill landed: every figure in §10c is
> identical.** Same `room used`, same `floor breaches` of 0, same `min balance`,
> same `orders standing`, same `final balance`; the scheduled pass still spends
> 0. It cannot spend what those runs leave, because 60 of room is short of the
> 80 a wall costs and ruling 12 funds an order whole or not at all.
>
> **What partial fill does move is the residual, and no bound was invented for
> it.** All-or-nothing left a prison whose queue it could not fund in one lump
> with the *whole* balance unspent; per-order fill leaves it with less than the
> cheapest unfunded order costs. That residual is the liquidity ADR 0075's
> locked position needs, so the question this paragraph asks is real — but
> **naming how much of it a prison is owed is a balance value**, which ADR 0017
> decision 5 reserves to the owner with the rest of
> [#29](https://github.com/matmaxalez/lockstate/issues/29). So it is left open
> rather than answered in implementation code, and the two things that do bound
> the queue are named instead: its own finite cost, which partial fill does not
> change, and `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`, which every spend passes
> through one comparison in `Treasury.canAfford`.
>
> **AND THE CORRECTION ABOVE OVERREACHED IN ITS TURN, WHICH IS RECORDED HERE
> RATHER THAN EDITED INTO IT.** *"The scheduled pass spent 0"* is true of §10c
> and does not generalise, and the reason is a property of that instrument:
> **no run in it earns money with a queue standing.** A prison there places its
> orders out of the opening grant and then has no capacity and no income, so the
> press is the only moment money exists — which means the sweep agrees with
> all-or-nothing and with partial fill equally, the shape `docs/TESTING.md`
> names as a fixture that supplies both sides.
>
> Measured on the shape §10c cannot produce — ten `wall-brick` orders placed
> against a treasury drained to the floor, then credited **with no command at
> all**, then the clock run with nothing pressed:
>
> | credited | 0 | 79 | 80 | 240 | 400 | 799 | 800 | 5,000 |
> |---|---|---|---|---|---|---|---|---|
> | spent, unpressed | 0 | 0 | **80** | **240** | **400** | **720** | **800** | **800** |
>
> **This is not a defect and must not be read as one.** Every one of those
> orders was placed by the player, and funding it later is ADR 0017 decision 7
> doing what the owner asked for in [#627](https://github.com/matmaxalez/lockstate/issues/627)
> — *"it should buy itself when I place a wall"*. What it is, is a **cost the
> player is not shown**, reachable only since ruling A opened the overdraft: a
> player who drags a perimeter while broke and forgets can be carried from
> `+2,500` to the floor over the following days with nothing pressed and nothing
> on screen relating the two. That is the same "hidden mechanic" class Decision 3
> and open question 2 are about, and it is the strongest argument yet that
> question 2 is a precondition rather than a nicety.
>
> **What ruling 9 changed about it, measured on both trees with one probe** —
> ten orders at 80, 300 credited per in-game day, nothing pressed:
>
> | day | all-or-nothing: room left / walls | per order: room left / walls |
> |---|---|---|
> | 1 | 300 / 0 | **60 / 3** |
> | 2 | 600 / 0 | **40 / 7** |
> | 3 | 100 / 10 | 100 / 10 |
> | 4–6 | identical | identical |
>
> **The total and the endpoint are identical to the minor unit** — 800, the
> queue's own cost — and the floor is reached under neither. What moves is the
> threshold at which the queue starts taking income, from the whole queue's cost
> to the cheapest single order: **800 to 80**. So the walk is not deeper and not
> faster to the floor; it is *earlier*, and the prison holds 60 and 40 where it
> used to hold 300 and 600. **Both are below the 65 a plank costs**, which is
> ADR 0075's whole subject — so per-order fill buys the player their walls two
> days sooner at the price of two days without the liquidity to buy their way
> out. That is the trade this ruling makes, stated so it can be argued with.
>
> Pinned as a characterisation test at
> `tests/integration/construction-just-in-time-materials.test.ts`, *"spends
> income that arrives after placement, with nothing pressed in between"*.
>
> This correction changes no decision in this document, and the Status line
> above is untouched: this ADR is still unsigned.

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

> **BOTH FIGURES IN THAT PARAGRAPH ARE WRONG AND ARE CORRECTED HERE RATHER THAN
> OVERWRITTEN**, because the half that mattered is right — a perimeter segment
> is the one that starves — and because a decision record's errors are worth
> more visible than tidied away. Re-measured 2026-08-31 through the real
> `createSaveEnvelope` and the real command router.
>
> **The pending set is wrong about twelve of its thirteen members.** The walk is
> ascending **code-unit** order, and `"wall-9" > "wall-100"`, so the thirteen
> unfunded orders are the thirteen highest ids in that order:
> `{wall-88, wall-89, wall-9, wall-90…wall-99}`. There is no `wall-314` in the
> pending set at all — it is funded and built. `wall-9`, the ninth segment the
> player drew, is the **315th of 325** the crew reaches.
>
> **"A factor of sixteen" compares two thresholds defined differently** — 65
> with the backlog cancelled against 1,065 with it standing, and 65 frees the
> wall but leaves 25, which does not buy the 65 plank. Like for like:
>
> | | backlog standing | twelve non-perimeter orders cancelled first |
> |---|---|---|
> | perimeter freed | **1,000** (999 does not) | **40** (39 does not) |
> | perimeter freed *and* a 65 plank affordable | **1,065** | **105** |
>
> So the factor is **25** (1,000 against 40) or **10.1** (1,065 against 105).
> Both halves of the original sentence are individually true; their ratio was
> not a measurement.
>
> **And the lock is not certain in a real session.** It starves a perimeter
> segment every time with `wall-N` fixture ids; with the `order-${crypto.randomUUID()}`
> ids a player actually gets it is **18 of 60 pooled trials, 30%** (closed form
> `1 − (312/325)⁹ = 31%`). With placement-ordered ids it was unreachable — 0 of
> 15 — because the perimeter is placed first and so is never in the unfunded
> tail. `docs/research/2026-08-30-pricing-the-way-out.md` §1 presents its locked
> position as *the* locked position; it is a certainty of that fixture's ids and
> a ~30% event with real ones. That record is dated evidence and is left as
> written.

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
