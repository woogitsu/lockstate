# ADR 0017: Money Is the Primary Resource; Materials Are Procured

## Status
Accepted

Accepted in full: both the **hierarchy** in "Decision", which was never in
doubt because it is the owner's own decision recorded in issue #96, and this
ADR's answers to the three questions #96 left open. Those answers were
previously recommendations under a heading asking a human to accept them; the
owner has accepted them, and they are now decisions 6, 7 and 8 below with the
reasoning kept in place.

While this ADR was `Proposed` it said in terms that *"nothing here licenses
shipping an economy"* — and an economy shipped anyway, in #249 and #250. That
was a disclosed trade rather than a decision made in code: the shipped values
are documented at their declarations as deciding none of the three questions,
and #249's slice deliberately implements only what answer 2's "just-in-time"
direction permits. This acceptance closes the gap between the two, and the
"Consequences" section below now describes what is built rather than what is
proposed.

## Context

Nothing in a Lockstate prison can be built. Issue #89: a build order reaches
`materials-pending` and stays there forever, because
`createNewSimulationRuntime` registers one empty `Container` under
`CONSTRUCTION_MATERIALS_CONTAINER_ID` and **nothing in the shipped codebase
deposited into it**. `ConstructionSystem.update` called
`materialsProvider.tryAllocate` on every scheduled tick and got `false`,
forever. The core loop could not complete.

That was the state when this ADR was written. #249 added
`ProcurementSystem`, which deposits into exactly that container — see the
Status note above for what is implemented and what is not. #89's symptom
survives for a different reason: nothing in `src/` mints a
`PurchaseMaterials` command, so a player still cannot buy anything.

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

### The competing proposal, and how it resolved

PR #91 proposed a scenario `startingStock` (600 `item.brick`, 120
`item.wood-plank`) under a draft ADR 0018, and was explicit that it introduced
no money: *"A token/credit resource so deliveries could be constrained. That is
money with the word filed off, and it pre-empts #29 inside an implementation
change."* That reasoning was correct at the time and this ADR does not
invalidate it. It also anticipated its own replacement: *"`startingStock`
becomes the opening balance of that system when #29 lands."*

#249 landed that system, and the opening balance is denominated in money
(`TREASURY_STARTING_BALANCE_MINOR_UNITS`), which is decision 1 below. A second
opening balance denominated in bricks would be the same decision taken twice in
two currencies, so **PR #91 was closed as superseded** and the 0018 number
released — see `docs/adr/README.md`. Both of the supporting fixes #91
identified are on `main` via #97, including `release` becoming a required
member of `ConstructionMaterialsProvider`.

### The dead end this closes

#91 recorded plainly that a finite starting stock is finite, that nothing
replenishes it, and that nothing surfaces the shortage — so exhausting it looks
exactly like the bug #91 set out to fix. Under this decision the answer to that
dead end is **not** a material faucet. It is **purchase**. That closes it
rather than papering over it, and it is the main practical consequence of
writing the hierarchy down.

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

6. **The state pays per prisoner-day, accrued per occupied place.** #96's first
   open question, answered. Reasoning under "The three answers, in full".

7. **Materials are just-in-time by default; holding is permitted, never
   required.** #96's second open question, answered.

8. **Insolvency is a state, not a loss condition.** #96's third open question,
   answered.

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
- **What is implemented, as of #249 and #250.** `Treasury` holds an integer
  balance in minor units and refuses a purchase it cannot cover rather than
  overdrawing; `ProcurementSystem` prices `item.brick` and `item.wood-plank`,
  takes the money immediately and delivers after a fixed delay into the same
  `Container` `ConstructionSystem` draws from; both are in the save; and the
  balance is on the HUD status strip. An integration test drives a real kernel
  from purchase through delivery to a wall in the world.

  That is decisions 1, 2 and 7. Decision 3's income line and decision 8's
  degradation ladder are **not** built, and decision 4's physical route is not
  either — a delivery is deposited at no tile, which `docs/OPERATIONS.md` now
  records as the second deliberate exception to its no-teleport rule, along with
  what is still missing.

- **#89 is still open, and its cause has changed.** No longer "nothing can
  supply materials" — the store link is closed and verified by mutation — but
  "nothing can ask for materials to be supplied". No code in `src/` produces a
  `PurchaseMaterials` command, so a build order placed in a real session still
  waits forever. The owner has decided the surface: a quantity stepper on the
  Build panel.

## The three answers, in full

These are #96's explicitly open questions. Each carried a recommendation while
this ADR was `Proposed`; the owner has accepted all three, so what follows is
the reasoning behind decisions 6, 7 and 8 rather than a proposal. Each also
names the consequence that comes with it, because each has one and none of them
is free.

### 1. On what basis does the state pay?

#96: *"Is the state's remuneration per occupied place, per prisoner-day, per
facility, or a scheduled block grant? This changes what the player optimises."*

**Accepted: per prisoner-day, accrued per occupied place.** It is the only
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

**Accepted: just-in-time by default, with holding permitted but never
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

**Accepted: insolvency is a state, not a loss condition.** At a negative
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

### What #29 still needs, now that all three are answered

The order the questions gate work in, unchanged by their being answered:

- **Answer 2 was all that purchase and delivery needed**, and that half is
  built.
- **Answer 1 is what #29's income line waits on.** With it settled, a
  per-prisoner-day accrual can be specified — and it inherits answer 1's stated
  consequence: income scales with population, so overcrowding must be punished
  elsewhere (#79, #80, #81) or the optimum is to pack the prison.
- **Answer 3 is not reachable yet.** `Treasury.spend` refuses rather than
  overdrawing, so there is no negative balance for a degradation ladder to
  respond to. It becomes reachable when a recurring charge exists that the
  player cannot decline — which is decision 3's other half.

None of that is licensed to be decided in implementation code. What this
acceptance changes is that the *answers* are no longer open; the schedules,
prices and degradation steps that follow from them are #29's, and remain out of
scope here per decision 5.
