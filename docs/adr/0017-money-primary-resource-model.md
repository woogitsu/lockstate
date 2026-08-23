# ADR 0017: Money Is the Primary Resource; Materials Are Procured

## Status
Proposed — pending human approval. Not accepted.

The **hierarchy** in "Decision" is not itself in doubt: it is the owner's
decision, recorded in issue #96, and this ADR exists because that decision was
not written down anywhere in the repository while code that depends on it was
being written. What needs approval is this ADR's answers to the three questions
#96 left open, gathered under **What this asks a human to accept**. Until those
are approved, nothing here licenses shipping an economy.

## Context

Nothing in a Lockstate prison can be built. Issue #89: a build order reaches
`materials-pending` and stays there forever, because
`createNewSimulationRuntime` registers one empty `Container` under
`CONSTRUCTION_MATERIALS_CONTAINER_ID` and **nothing in the shipped codebase
ever deposits into it**. `ConstructionSystem.update` calls
`materialsProvider.tryAllocate` on every scheduled tick and gets `false`,
forever. The core loop cannot complete.

So something must supply materials, and the shape of that something is a
resource-model decision, not an implementation detail. Two readings were
available and the repository did not choose between them:

- **Materials as the managed resource.** The player holds a stockpile, and the
  stockpile is what is scarce. Replenishment is then a *faucet* — production,
  gathering, a scheduled delivery — and the interesting decisions are about
  material flow.
- **Money as the managed resource.** Materials are bought. A stockpile is an
  intermediate that a purchase produces, not the economy. The interesting
  decisions are about what to spend on.

Issue #29 specifies the *mechanics* of money well — integer minor units, an
append-only typed ledger, a derived balance, recurring charges, construction
purchase and refund, workshop income. What it does not state is the
**hierarchy**, and without that its acceptance criteria can be satisfied by a
design in which money is one resource among several with materials as a
parallel constraint. #96 records that this is not what is wanted, and that a
fresh agent reading #29 alone would most likely build exactly that.

The commissioned feature audit arrived at the same place from the gameplay
side, ranking #29 P0: *"Without a constrained resource, building is an editor,
not a management decision."* It also named the failure mode to avoid — **an
economy that merely delays a click is a timer, not a strategy** — and warned
that #30 (progression) must not precede #29, because an unlock tree over a
decision that costs nothing is cosmetic.

### Why this is not a re-litigation of ADR 0018

PR #91 introduces a scenario `startingStock` (600 `item.brick`, 120
`item.wood-plank`), and its ADR 0018 is explicit that it introduces no money:
*"A token/credit resource so deliveries could be constrained. That is money
with the word filed off, and it pre-empts #29 inside an implementation
change."* That reasoning was correct and this ADR does not invalidate it.
ADR 0018 already anticipates the relationship: *"`startingStock` becomes the
opening balance of that system when #29 lands."*

This ADR states the hierarchy that ADR 0018 assumed but could not say, because
nothing above it had said it. **#91 remains held by the owner's decision**, and
that is unchanged here.

### The dead end this closes

#91 records plainly that its stock is finite, that nothing replenishes it, and
that nothing surfaces the shortage — so exhausting it looks exactly like the
bug #91 fixes. Under this decision the answer to that dead end is **not** a
material faucet. It is **purchase**. That closes it rather than papering over
it, and it is the main practical consequence of writing the hierarchy down.

## Decision

1. **Money is the primary currency.** It is the resource the player manages and
   the thing that is scarce. Every meaningful decision costs money.

2. **Materials are procured with money.** They are never gathered, produced, or
   granted as a renewable faucet. A material stockpile is an intermediate that
   a purchase produces; it is not the economy. Concretely: any future supply
   route into `CONSTRUCTION_MATERIALS_CONTAINER_ID` is a **delivery that a
   purchase caused**, and a purchase that cannot be afforded must be refusable.

3. **The state's remuneration for operating the facility is the primary income
   line** — not grants alone, and not prison labour alone. Grants and labour
   income remain, as secondary lines.

4. **`room.delivery-bay`, `object.loading-dock-door` and `room.storage-room`
   are the intended physical route.** All three already exist in the content
   catalogs and are read by no code (#124 records that 11 of 18 room ids and 18
   of 20 object ids are declared and unread). Connecting declared content is
   the intended path here; **do not delete them as dead content.**

5. **This ADR decides no prices and no balance values.** #29 puts final pricing
   and balance out of scope and nothing here changes that.

## Consequences

- **A shortage becomes legible.** Under a faucet model, "no bricks" is a state
  the player waits out. Under procurement it is either "you have not bought
  any" or "you cannot afford any", and both are actionable. This is the
  difference between the audit's timer and its strategy.
- **Construction gets a real price.** `ConstructionSystem` already allocates and
  (since #97) releases materials. Purchase sits *before* that, so cancellation
  refunding materials — #97's fix — remains correct and does not become a money
  refund by accident. Whether cancelling should also refund the *money* is a
  question for #29, not this ADR; note that #99's dismantle-to-salvage decision
  means a built object's value returns as **carried salvage**, not as cash.
- **#30 is gated behind #29**, per the audit's ordering caveat, and this ADR is
  the reason to hold that line.
- **`docs/OPERATIONS.md`'s no-teleport rule applies to deliveries.** A purchase
  may not materialise items inside a storeroom; the delivery has to arrive
  somewhere and be moved, which is why decision 4 names the bay and the dock
  door rather than only the storeroom.
- **Nothing here is implemented.** This ADR licenses no code. #89 stays open
  and a build order still cannot complete until #29 lands a purchase and a
  delivery.

## What this asks a human to accept

The hierarchy above is the owner's own decision (#96) and is recorded here
rather than proposed. These three are #96's explicitly open questions, with a
recommendation each. **They are product decisions, and this ADR does not decide
them by implication.** Approving this ADR means approving these answers, or
replacing them.

### 1. On what basis does the state pay?

#96: *"Is the state's remuneration per occupied place, per prisoner-day, per
facility, or a scheduled block grant? This changes what the player optimises."*

**Recommended: per prisoner-day, accrued per occupied place.** It is the only
one of the four that makes the two things the player builds — capacity and the
ability to keep people in it safely — pay off through the same line, so
expansion and competence are not separate currencies. Per-facility pays for
existing; a block grant pays for surviving to a date, which is the timer the
audit warns about; per occupied *place* alone would pay for empty capacity.

The consequence to accept: **income scales with population, and so does
trouble.** That is the intended tension, and it means overcrowding must be
punished elsewhere (#79, #80, #81) or the optimum is to pack the prison.

### 2. Are materials ever a strategic buffer, or just-in-time?

#96: *"Does the player ever hold materials as a strategic buffer (bulk purchase
against future price or delay), or are materials effectively just-in-time once
procurement exists? #91's finite stock is currently the former by accident."*

**Recommended: just-in-time by default, with holding permitted but never
required.** A buffer is only interesting if something makes *when* you buy
matter — a price that moves, a delivery that takes time, a storeroom that can
be full. None of those exist. Introducing a buffer before its reason exists
gives the player an inventory-management chore with no decision in it.

Holding stays *permitted* because the physical route in decision 4 implies
storage anyway, and because #99's salvage has to go somewhere. What is
recommended against is making bulk purchase *advantageous* until delivery time
or price variation exists to make it a real choice.

### 3. What happens at insolvency?

#96: *"#29 lists 'shortage/insolvency policy hooks' without deciding the policy,
and a management sim needs that answer to be interesting rather than
terminal."*

**Recommended: insolvency is a state, not a loss condition.** At a negative
balance the state stops paying for discretionary things in a defined order and
the prison degrades visibly — deliveries refused first, then construction
halted, then staff unpaid with the morale and incident consequences that
follow. No game-over, no silent stall.

The reason to prefer this: a loss condition ends the session, and a session
that ends removes the interesting part, which is digging out. It also fits the
subject — a real prison that runs out of money does not close, it gets worse.

The consequence to accept: **degradation has to be authored and surfaced**, or
insolvency becomes the same invisible stall as #89. That is real work, and it is
the cost of this answer.

### One thing to note about approving this ADR

The hierarchy needs no approval; #96 settled it. **If only the hierarchy is
approved and the three answers are not, that is a usable outcome** — it licenses
`docs/` to state the hierarchy as settled, and it keeps #29 from being built as
a materials-parallel-to-money design. The three answers can then be taken
separately, in whichever order the owner prefers, and #29's implementation waits
on the ones it actually needs: it needs answer 1 to have an income line at all,
and it can begin with purchase and delivery under answer 2 without answer 3.
