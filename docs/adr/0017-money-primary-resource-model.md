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

  That is decisions 1, 2 and 7. Decision 8's degradation ladder is **not**
  built, and decision 4's physical route is not either — a delivery is
  deposited at no tile, which `docs/OPERATIONS.md` now records as the second
  deliberate exception to its no-teleport rule, along with what is still
  missing.

- **Decision 3's income line, as of #29.** `StateIncomeSystem`
  (`src/simulation/economy/income.ts`) credits the treasury once per in-game
  day, on the day's last tick, per occupied place — decision 6's basis,
  unchanged. The rate is #29's and not this ADR's, per decision 5, and it is
  recorded on that issue rather than here.

  **It paid nothing in a session for as long as rooms had no capacity, and it
  pays now.** The paragraph here used to end with the first half of that
  sentence, and the reason it is worth keeping both halves is that nothing in
  this ADR's subject changed: the block that follows was true when written and
  was falsified by a change in a different document's subject entirely.

  What it said: admission was wired (#261 step 4), so a prison could hold a
  population, but `RoomZoningService` registered a zoned room with
  `capacity: 0`, so no prisoner held a unit of any declared capacity — there was
  no occupied place and 300 × 0 was 0 for as long as that held. Measured on the
  tree that wired admission (a zoned `room.cell`, one admitted prisoner, 2,500
  ticks) the balance was still 25,000 and the accrual still 0. Giving a room a
  capacity was named as ADR 0028's subject rather than this one's.

  **ADR 0028 is Accepted and its phase 1 shipped**, so capacity is derived from
  the objects standing in a room (`src/simulation/objects/room-capacity.ts`) and
  a cell holds as many prisoners as it has beds. Re-measured through the real
  commands and the real kernel: one plank bought, a `bed-wooden` placed in a
  zoned `room.cell`, one prisoner admitted — the instance reads
  `residentCapacity: 1`, the arrival reaches `completed` and occupies it, and the
  balance rises by exactly 300 on the day's last tick, closing at
  `25_000 - 65 + 300`. `tests/integration/object-placement-loop.test.ts` asserts
  every one of those figures as a literal.

  So decision 3 is built and its consequence — "income scales with population,
  and so does trouble" — is observable for the first time. The *population* half
  of that scaling is real; the *trouble* half still is not, and #79/#80/#81 stay
  owed. What this correction cost is worth recording: the change that made the
  line pay was measured and asserted in the test suite the same day it landed,
  and this paragraph, `docs/HUD_PROJECTIONS.md`, `docs/PRISONER_OPERATIONS.md`
  and [ADR 0027](./0027-cell-sharing-assessment.md) all went on saying the
  opposite, because no test reads English and the tripwire written to announce
  it could not fire (`tests/unit/prisoners-intake-system.test.ts` records why).

  One consequence of the daily cadence, stated here because it is a design
  property rather than an implementation detail: occupancy is read at the day
  boundary, not integrated across the day, so a place occupied at the boundary
  is paid as a whole day and one vacated before it as nothing. That is what
  keeps the system stateless and out of the save. The research record for #29
  (`docs/research/2026-08-25-economy-rate.md`) recommended integrating instead,
  with a carried remainder; the owner's chosen cadence
  (`intervalTicks: 2,400`, `phaseTicks: 2,399` — one scheduled call a day)
  cannot integrate, and the divergence is recorded rather than quietly
  resolved.

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
- **Answer 1 was what #29's income line waited on, and it has now been
  built on it.** The accrual is specified and implemented (see the
  Consequences bullet above) — and it inherits answer 1's stated consequence:
  income scales with population, so overcrowding must be punished elsewhere
  (#79, #80, #81) or the optimum is to pack the prison. That debt is now
  *incurred* rather than merely anticipated, even though no population exists
  to collect it yet.
- **Answer 3 is not reachable yet.** `Treasury.spend` refuses rather than
  overdrawing, so there is no negative balance for a degradation ladder to
  respond to. It becomes reachable when a recurring charge exists that the
  player cannot decline — which is decision 3's other half.

None of that is licensed to be decided in implementation code. What this
acceptance changes is that the *answers* are no longer open; the schedules,
prices and degradation steps that follow from them are #29's, and remain out of
scope here per decision 5.

## Amendment, 2026-08-27: the purchase surface this ADR twice calls missing has shipped, #89 is closed, and decision 4's "read by no code" is now true of two of its three ids

*This amends **the Context paragraph, the "#89 is still open" consequence and
decision 4's parenthetical count**. No decision moves: 1 through 8 are unchanged,
and decision 4's instruction — **do not delete them as dead content** — is
reinforced rather than weakened by what follows, because one of the three ids it
protects is now load-bearing. What has gone false is a set of statements about
the tree. The form is ADR 0029's amendment and ADR 0034 §9's: the old wording is
quoted rather than overwritten.*

*Status is untouched: this ADR remains **Accepted**. Read at `792bf94`
(v0.0.121); every `file:line` below was opened on that tree and every count below
was produced by re-running the enumeration rather than copied from an earlier
one.*

### 1. `src/` mints `PurchaseMaterials`, and has since `c2b5a28`

The Context says:

> #89's symptom survives for a different reason: nothing in `src/` mints a
> `PurchaseMaterials` command, so a player still cannot buy anything.

and the Consequences repeat it as a heading:

> **#89 is still open, and its cause has changed.** No longer "nothing can supply
> materials" — the store link is closed and verified by mutation — but "nothing
> can ask for materials to be supplied". No code in `src/` produces a
> `PurchaseMaterials` command, so a build order placed in a real session still
> waits forever. The owner has decided the surface: a quantity stepper on the
> Build panel.

**All four sentences are false.** `src/main.ts:1863` is
`sender.submit({ type: 'PurchaseMaterials', orderId: …, itemId: intent.itemId,
quantity: intent.quantity })`, reached from the `'purchase-materials'` HUD intent
at `:1795`. The stepper the last sentence describes as *decided* is **built**:
`src/ui/hud/build-panel.ts:125` is *"Buy the selected buildable's material, in
the quantity the stepper shows (#89)"* and `:896` constructs the number field.
The producer landed in `c2b5a28`, *"Give the player a way to spend the treasury
(#282)"*, on 2026-08-24 at v0.0.33, and **#89 was closed as completed the same
day**, by that pull request.

This is not a subtle contradiction that needed an audit to surface. The
repository holds a foundation gate that *asserts* the producer exists:
`tests/foundation/unconsumed-command-contract.test.ts:285` is
`expect(producersOf('PurchaseMaterials')).toEqual(['src/main.ts'])` and `:319`
requires that file to contain the literal `type: 'PurchaseMaterials'`. So a green
suite and this ADR have been saying opposite things for roughly eighty-eight
releases, and this document was edited three times in that window — `1db8c16`
and `4f711d5` on 2026-08-25, `c228e3e` on 2026-08-26 — without either sentence
being touched. **DOC-ROTTED**, and it is the reading of the ADR that is
dangerous: the Context still opens *"Nothing in a Lockstate prison can be
built"*, so a fresh agent takes the core loop to be broken and may set out to
build a surface that exists.

**What the two passages should say:** the purchase surface shipped in #282 and
#89 is closed; what decision 4 still lacks is the *physical* route, which the
Consequences already record correctly a few lines above (*"decision 4's physical
route is not [built] either — a delivery is deposited at no tile"*).

### 2. Decision 4's count: 11 of 18 rooms is still exact; 18 of 20 objects is now 1 of 20

Decision 4 says:

> **`room.delivery-bay`, `object.loading-dock-door` and `room.storage-room` are
> the intended physical route.** All three already exist in the content catalogs
> and are read by no code (#124 records that 11 of 18 room ids and 18 of 20
> object ids are declared and unread).

Re-enumerated at `792bf94` — every id in `src/content/room-catalog.ts` and
`src/content/object-catalog.ts`, searched across `src/` with comment text
stripped, excluding the two catalogues themselves and `default-locale-en.ts`:

| | then | now |
| --- | --- | --- |
| room ids declared / unread | 18 / 11 | **18 / 11 — unchanged and still exact** |
| object ids declared / unread | 20 / 18 | **20 / 1** |

The one object id still unread is `object.sink`. The other nineteen are read by
`src/simulation/construction/definition.ts`, which acquired seventeen buildable
rows in `b097e70` (ADR 0028 phase 4, #384) on 2026-08-26 at v0.0.98.

**That includes one of decision 4's own three ids.**
`src/simulation/construction/definition.ts:614-621` is a `BUILDABLE_REGISTRY`
row, `loading-dock-door-wooden`, carrying `placesObjectId:
'object.loading-dock-door'`. A player can build a loading dock door today. So
*"All three … are read by no code"* is **false for `object.loading-dock-door`**
and remains true for `room.delivery-bay` and `room.storage-room`, which occur in
`src/` only in the catalogues, the locale map and comments.

**A bare tally beside a table that can be recomputed is the shape
`docs/AGENT_WORKFLOW.md` §4 names as rotting first**, and this is the instance:
adding nineteen readers never touched the sentence saying there were none. The
durable form is the one the enumeration produces — name the ids, or name the
file that reads them — and decision 4's instruction survives either way, because
"do not delete this as dead content" was right and the content stopped being
dead.

### What was checked and found intact

Decisions 1, 2, 3 and 5 through 8 are unchanged and unchallenged.
`Treasury.spend` still refuses rather than overdrawing
(`src/simulation/economy/treasury.ts:94-98`), so the Consequences' statement that
answer 3's degradation ladder is unreachable still holds for the reason given.
`StateIncomeSystem`'s cadence is as recorded. The `room.storage-room` and
`room.delivery-bay` half of decision 4 is exactly as described. And the
"Consequences" bullet correcting the income line — the one that says the
paragraph *"went on saying the opposite, because no test reads English"* — is the
same defect class this amendment records twice more, in the same document.
