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

## Amendment, 2026-09-01: decision 8's ladder gets three thresholds inside the overdraft, so its *order* can be true again

> **Accepted, 2026-09-01, by the repository owner.** Drafted the same day and
> put to them with the implementation beside it, so that what was being signed
> could be read as behaviour and not only as prose.
>
> **This clause read `Proposed amendment, not self-approved — awaiting the
> owner's signature` until that acceptance**, and carried the sentence *"the
> implementation that accompanies this amendment on the same branch must not
> merge before the signature."* Both are kept rather than deleted: nothing in
> this corpus is self-approved (`AGENTS.md`, `docs/AGENT_WORKFLOW.md` §3), and
> the record of a document having waited is part of how that rule is visible.
>
> *This amends **decision 8 alone**. Decisions 1 through 7 are untouched, and
> `Status` remains **Accepted**. The form is the "Amendment, 2026-08-27" above,
> ADR 0029's and ADR 0034 §9's: the old wording is quoted rather than
> overwritten.*

### 1. The ruling, in the owner's words

The owner was asked how the insolvency ladder should behave now that a standing
overdraft exists, and answered, on 2026-08-31 (**ruling 19**):

> **"Dać szczeblom własne progi wewnątrz debetu"**

— *give the rungs their own thresholds inside the overdraft* — with these three
numbers:

| rung | what stops | threshold |
| --- | --- | --- |
| 1 | deliveries refused | balance below **−1,250** |
| 2 | construction halted | balance below **−2,000** |
| 3 | wages unpaid | balance below **−2,500** (the floor) |

### 2. What of decision 8 is superseded, and what survives

Decision 8 reads, in full, at "The three answers, in full" §3:

> **Accepted: insolvency is a state, not a loss condition.** At a negative
> balance the state stops paying for discretionary things in a defined order and
> the prison degrades visibly — deliveries refused first, then construction
> halted, then staff unpaid with the morale and incident consequences that
> follow. No game-over, no silent stall.

**Everything in that paragraph survives.** Insolvency is still a state and not a
loss condition; there is still no game-over and no silent stall; the *order* is
still deliveries, then construction, then staff. The consequence decision 8
accepts — *"degradation has to be authored and surfaced"* — survives too, and
§5 below records what of it is still owed.

**What is superseded is nothing decision 8 said, and everything the code did
with it.** Decision 8 named an order and no magnitudes, and while
`Treasury.spend` refused at a balance of zero the order followed from the one
comparison for free: every discretionary spend was refused before the
undeclinable one, because the undeclinable one was bounded by the balance.
`src/simulation/economy/treasury.ts` argued exactly that, at length, and it was
right.

#703 ruling A of 2026-08-31 opened a **standing overdraft** on every treasury
([ADR 0083](./0083-what-opens-the-negative-balance-and-what-bounds-it.md) §2),
and inverted the ladder. `Treasury.canAfford` was one comparison,
`balance - amount >= floor`, so a single floor moved rungs 1 and 2 **together**
to −2,500, while `PayrollSystem`'s `Math.min(due, balance)` left rung 3 at a
balance of zero. A prison with its wages unpaid went on buying deliveries and
hiring staff for another 2,500: rung 3 fired *first*. ADR 0083 §2 recorded the
inversion and said in terms that it did not choose the remedy —

> Either the ladder's order is amended to say so, or decision 8 is narrowed to a
> prison that has spent its overdraft. **This document does not choose between
> those**; it records that one of them is now required and that the code cannot
> express the ladder faithfully until it is taken.

**Ruling 19 takes neither.** It keeps the order exactly as decision 8 states it
and keeps decision 8 applying to every prison, and instead gives the three rungs
three thresholds *inside* the overdraft so that the order is expressible at all.
That is why this is an amendment to decision 8's **implementation contract** and
not to its text: after it, decision 8's sentence is true again, for the first
time since ruling A.

**The three magnitudes are new, and they are the owner's.** Nothing in this
corpus derived them and nothing here defends them as arithmetic. ADR 0017
decision 5 puts balance values out of this ADR's scope and reserves them to #29;
ruling 19 satisfies that reservation by a ruling rather than bypassing it, in
the same way #703's rulings satisfied it for the opening balance and the
overdraft floor.

### 3. What the amendment decides

**a. Each rung is a floor of its own, and the third rung is the treasury's
floor.** Rungs 1 and 2 are named constants; rung 3 is **not** a constant. The
overdraft floor already has one owner — `Treasury.setOverdraftFloor`, fed by
`createNewSimulationRuntime` from `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` — and
writing −2,500 a second time would be a second copy of a number that is defined
once, disagreeing with the first the moment anything passed a different floor.
Rung 3 is therefore *the floor, whatever the floor is*.

**b. The thresholds are absolute minor units, not fractions of the floor.** The
owner ruled three magnitudes and no ratios. 1,250 is a half of 2,500 and 2,000
is four fifths of it, and both of those are readings this document would be
inventing: a rule expressed as a fraction claims that the *shape* of the ladder
is what was decided, and what was decided is three numbers. Against that: a
fraction would move the rungs automatically if the floor were ever
reconfigured, and absolute numbers do not.

What is done about that instead is a **clamp and not a scaling**: every rung is
clamped up to the treasury's floor (`Treasury.floorFor`), so

- at a floor of `0` — a bare `new Treasury()`, which is every one in the unit
  tests — **there are no rungs at all** and every class behaves exactly as it
  did before ruling A, to the minor unit. This is what "inside the overdraft"
  has to mean, and it is asserted rather than described;
- no rung can ever be *deeper* than the floor, so a floor reconfigured
  shallower than −2,500 collapses the rungs onto it **in order** rather than
  leaving two of them unreachable below it.

The clamp is not a decision about what the rungs should be at a different floor.
It is the minimum that keeps the ladder from becoming incoherent. §4 marks the
real question as not decided.

**c. Which spend belongs to which rung, and this is a reading rather than the
ruling's own words.** Ruling 19 names three rungs; the code has four spending
sites, and two of them go through the same method. The reading taken:

| spend | rung | site |
| --- | --- | --- |
| the player's *Buy* press (`PurchaseMaterials`) | **deliveries**, −1,250 | `src/simulation/runtime/session-commands.ts` |
| materials for a queued build order | **construction**, −2,000 | `JustInTimeMaterialsService.procureForPendingOrders` |
| a payday | **wages**, the floor | `PayrollSystem.update` |
| taking on staff (`HireStaff`) | **deliveries' threshold**, −1,250 | `src/simulation/staff/hiring.ts` |

The first two both reach `ProcurementSystem.purchase`, so the rung cannot be a
property of that method and is a property of *who asked*. The split is decision
8's own words read literally: a *delivery* is a purchase the player asked for,
and *construction* is the prison buying what a standing order needs. It is also
the only split under which the two rungs are distinguishable at all — without
it, decision 8's first two rungs are one event again, which is the defect this
amendment exists to remove.

**Hiring is not one of the three rungs, and is deliberately not given a fourth.**
Authoring a fourth threshold would be authoring a rung the owner did not rule.
It takes the *shallowest* of the three, because the alternative — a prison that
refuses deliveries while still taking on staff whose wages it will then owe — is
decision 8's ordering broken in the other direction. §4 marks a rung of its own
as the owner's.

**d. The rung is a required argument, and that is a decision rather than an
implementation detail.** `Treasury.canAfford` and `Treasury.spend` take a
`SpendClass` that cannot be omitted. The property that forces it is the only one
a ladder must have: **a rung must be impossible to bypass by calling `spend`
without saying which rung you are.** A check at each caller is bypassed by
forgetting it, and nothing goes red. A defaulted parameter is bypassed by
omitting it and silently gets the deepest floor — the rung that refuses *last* —
which is the failure mode wearing a default's clothes. A required member of a
closed union cannot be omitted, and `tsc` is what asks.

**e. What a payday does between −2,500 and zero, and it reverses something ADR
0083 decided against.** Ruling 19 says wages are unpaid *below* −2,500, which
means **paid down to it**: `PayrollSystem` bounds the day by
`Math.min(due, balance - floorFor('wages'))` and therefore draws on the
overdraft. ADR 0083's "What was considered and not taken" rejected exactly this,
by name:

> **Making the payroll draw on the floor.** Rejected. `Math.min(due, balance)`
> is what keeps ADR 0017 decision 8's third rung reachable […] Changing it would
> delete the rung.

That was right under a single floor, where a payroll drawing on the overdraft
would have had no threshold of its own left. Under ruling 19 the third rung *is*
the floor, so the draw is what puts the rung where the owner put it rather than
what deletes it. Both directions are recorded here and at `treasury.ts`.

**f. What "unpaid" means for accrual is unchanged, and ruling 19 does not
answer it.** The ruling says *wages unpaid* and says nothing about whether the
wage is skipped or becomes a debt.
[ADR 0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md) decision 1
already answered it — what is not paid becomes **arrears**, carried beside the
balance and in the save — and the implementation takes that reading because it
is the one that changes least: a partial payday still pays what the rung leaves
and owes the rest, and `tests/integration/economy-money-conservation.test.ts`
stays green, which is the property that says no minor unit is created or
destroyed by a rung firing. **If the owner meant a skipped wage rather than a
deferred one, this is the sentence to correct**, and it is marked as theirs in
§4.

### 4. What this amendment does **not** decide

- **Whether `escalatedDiversionRateBasisPoints` or the loan interact with the
  rungs.** ADR 0083 §3 records 5,000 bp as ruled and not wired, and `LoanBook`
  is built only when `loanTerms` is supplied, which nothing in `src/` does. A
  drawdown credits the balance and touches no floor, so today a loan moves a
  prison *up* through the rungs and nothing more. Whether repayment diversion
  should be gated by a rung, or should itself be a rung, is untouched here.
- **Whether the rungs move if the floor is reconfigured.** §3b settles the
  representation — absolute minor units, clamped to the floor — and deliberately
  does not settle the policy. Nothing in `src/` calls `setOverdraftFloor` with
  anything but `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`, so the question is not
  live; the day a second floor exists, the choice between "the rungs are these
  three numbers" and "the rungs are these three fractions of whatever the floor
  is" is the owner's, and the clamp is what keeps the ladder coherent until it
  is made.
- **Whether hiring deserves a rung of its own.** §3c gives it the first rung's
  threshold because a fourth threshold is a fourth ruling.
- **Whether an unpaid wage is deferred or skipped.** §3f implements ADR 0049's
  answer and marks the question.
- **What the player is told at each rung.** §5.
- **Any price, any other balance value.** Decision 5 is unchanged.

### 5. What a player is told at each rung — owed to the owner, and four sentences are now wrong

Decision 8's stated cost is *"degradation has to be authored and surfaced, or
insolvency becomes the same invisible stall as #89"*. Ruling 19 makes three
rungs where there was one, and **the sentences that exist describe the one**.
All four say the charge would go past the *floor*, which is true at −2,500 and
false at −1,250:

| key | text, verbatim | rung it now answers |
| --- | --- | --- |
| `hud.alert.refusal.purchase.insufficient-funds` | *"Nothing was bought — that would go past what the state will carry."* | 1, deliveries (−1,250) |
| `hud.refusal.purchase-materials-past-floor` | *"Nothing was bought — that would go past what the state will carry."* | 1, deliveries (−1,250) |
| `hud.alert.refusal.hire.insufficient-funds` | *"Nobody was hired — that would go past what the state will carry."* | hiring (−1,250) |
| `hud.refusal.hire-staff-past-floor` | *"Nobody was hired — that would go past what the state will carry."* | hiring (−1,250) |

**None of them is changed, and none of them may be**: player-facing copy is
`AGENTS.md`'s fourth exclusion, these four are the owner's own words from ruling
18 of 2026-08-31, and there is no ruling behind a replacement. They are left
byte-for-byte with the defect recorded beside them in
`src/content/default-locale-en.ts`.

Two more things a player is owed and does not have:

- **Rung 2 has no sentence at all.** A halted construction queue reports
  `hud.alert.refusal.purchase.insufficient-funds` through
  `reportMaterialsFunding`, which is rung 1's sentence on rung 2's event.
- **The `FUNDS` chip's `{remaining} left` badge** (`hud.status.funds-remaining`)
  renders `balance − overdraftFloor`, the room to −2,500. Between −1,250 and
  −2,500 it offers a player room no press can spend. The figure is not copy but
  its meaning is a promise, so re-basing it is the owner's too; the host's
  pre-flight (`judgeAffordability`) *is* re-based, so a press is refused at the
  rung the worker refuses it at.

### 5a. What the owner then ruled, 2026-09-01 — every debt §5 records is paid

> **Ruled by the repository owner, 2026-09-01.** §5 above is kept exactly as it
> stood, including its *"None of them is changed, and none of them may be"*,
> because it is the record of the sentences having waited for a ruling rather
> than been rewritten by whoever noticed they were wrong. This clause says what
> the ruling was and what shipped for it.

**a. The four sentences name what stops, not the threshold.** The shape ruled
out is *"the state will not pay past −1,250"* and the shape ruled in is
*"deliveries are refused until the state pays what it owes"*. The reason is
staleness rather than taste: a sentence spelling out −1,250 is a second copy of
`INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS` with no test tying prose to
constant, so a later ruling that moved a rung would leave the copy silently
false — the failure mode ruling 19 exists to correct, rebuilt one layer up.

| key | text, verbatim | rung it answers |
| --- | --- | --- |
| `hud.alert.refusal.purchase.insufficient-funds` | *"Nothing was bought — deliveries are refused until the state pays what it owes."* | 1, deliveries (−1,250) |
| `hud.refusal.purchase-materials-past-floor` | *"Nothing was bought — deliveries are refused until the state pays what it owes."* | 1, deliveries (−1,250) |
| `hud.alert.refusal.hire.insufficient-funds` | *"Nobody was hired — hiring is refused until the state pays what it owes."* | hiring (−1,250) |
| `hud.refusal.hire-staff-past-floor` | *"Nobody was hired — hiring is refused until the state pays what it owes."* | hiring (−1,250) |
| `hud.alert.refusal.construction.materials-unfunded` | *"The build queue is stalled — no more materials until the state pays what it owes."* | 2, construction (−2,000) |

Ruling 23's equality survives: the worker's sentence and the host's are the
same words, pinned as text in `tests/unit/ui-simulation-alerts.test.ts`. The
hire sentence says *"hiring"* and not *"deliveries"* deliberately — §3c gives
hiring the shallowest rung's threshold by construction and §4 leaves a rung of
its own to the owner, so a sentence naming the deliveries rung would name a
rung hiring is not on.

**b. Rung 2 gets a sentence, and the plumbing it needs.** The owner accepted
the cost §5's first bullet priced. `RefusalReason` gains
`construction.materials-unfunded` — the twelfth namespace, mirroring
`ConstructionFundingRefusalReason` in
`src/simulation/economy/just-in-time-materials.ts` — `REFUSAL_LABEL_KEYS` gains
its row, and `reportMaterialsFunding`
(`src/simulation/construction/handler.ts`) records it instead of
`purchase.insufficient-funds`. The just-in-time pass is the only producer and
it spends at `'construction'` and nowhere else, so the new reason *is* rung 2
by construction rather than by a branch that could be got wrong.

**c. The `FUNDS` chip is re-based, and its tone with it.** `overdraftRemaining`
and `overdraftTone` (`src/ui/hud/projection.ts`) read the whole overdraft floor
and now read the `'deliveries'` rung clamped to the published floor — the same
`rungFloorMinorUnits('deliveries', …)` the host's pre-flight uses. §5's second
bullet named only the number; the **tone** was computed against the same wrong
floor, so a prison at −1,300 that had already had a delivery and a hire refused
still painted amber. It now paints `danger` from the deliveries rung down,
which is where the cheapest press stops changing the outcome.

**d. The badge's words were measured and are *not* shipped, which is a result
rather than a gap.** The owner chose `{remaining} left before deliveries stop`
for the re-based figure, on the condition that the badge be measured first —
no measurement of it existed anywhere in this repository. It was measured, in
`tests/browser/ui-overdraft-badge.spec.ts`, on a populated prison at 1280x800
with the treasury floor at −2,500:

| wording | balance | badge | FUNDS chip | row client / scroll | FUNDS chip visible |
| --- | --- | --- | --- | --- | --- |
| `{remaining} left` | −1,300 | 46.95px | 125.77px | 1256 / 1262 | yes |
| `{remaining} left` | −1 | 73.20px | 150.97px | 1256 / 1287 | yes |
| `{remaining} left before deliveries stop` | −1,300 | 179.94px | 258.75px | 1256 / 1395 | yes |
| `{remaining} left before deliveries stop` | −1 | 206.19px | 283.95px | 1256 / 1420 | **no** |

The sentence never wraps and is never clipped — legibility is not the
objection. It costs **+133px** of chip width, and at 1280x800 that pushes the
`FUNDS` chip itself past the right edge of `.hud-strip__metrics` for the whole
four-digit range of the remainder, on a container whose scrollbar `hud.css`
suppresses. At 1440x800 it survives except in the every-badge state; at
1920x800 it fits everywhere.

So `hud.status.funds-remaining` keeps `{remaining} left` byte-for-byte, with
the measurement recorded beside it in `src/content/default-locale-en.ts` — the
same treatment §5 gave the four refusal keys while they waited for a ruling.
The words go back to the owner with the figures. What is **not** waiting is the
number and the tone under them: §5a(c) shipped, so the badge is true today
whatever it ends up saying.

**e. The owner ruled on (d), reversing their own earlier choice of
`{remaining} left before deliveries stop`, still 2026-09-01.** Kept rather than
overwritten, for the same reason §5a's own opening clause gives: (d) is the
record of the measurement having been taken and returned rather than acted on
unilaterally. The ruling itself: *"the chip keeps the short wording, because it
fits; the name of the threshold — that it is deliveries that will stop — is
said elsewhere, where there is room for a full sentence: in the hover tooltip
on the chip, and in the alert. Nothing is to disappear from the screen."*

Only the badge's wording was reversed. `hud.status.funds-remaining` stays
`{remaining} left`, exactly as (d) left it; §5a(c)'s re-based number and tone
are untouched, because they were never what the owner reversed. What shipped
instead is the sentence living somewhere the badge had no room for: two new
keys, `hud.status.funds-before-deliveries-stop` and
`hud.status.funds-deliveries-stopped`, chosen on the same amber/red boundary
`overdraftTone` chooses on, said through `StatChip.setDescription` into both
the chip's `title` (pointer hover) and its screen-reader text (everyone else,
`.ui-sr-only`, out of flow — costs the row no width, measured rather than
assumed in `tests/browser/ui-overdraft-badge.spec.ts`). The refusal alert,
`hud.alert.refusal.purchase.insufficient-funds`, says the same thing again for
the player who never hovers at all — the owner's standing directive against
hidden functionality applies to a tooltip exactly as it applies to anything
else, and `tests/unit/ui-hud-funds-threshold-named.test.ts` gates both channels
so neither can go quiet on its own.



### 6. Where this is implemented

`src/simulation/economy/treasury.ts` (`SpendClass`,
`INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`,
`INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS`,
`INSOLVENCY_RUNG_FLOORS_MINOR_UNITS`, `rungFloorMinorUnits`,
`Treasury.floorFor`), `src/simulation/economy/procurement.ts`,
`src/simulation/economy/just-in-time-materials.ts`,
`src/simulation/economy/payroll.ts`, `src/simulation/staff/hiring.ts`,
`src/simulation/runtime/session-commands.ts` and `src/ui/affordability.ts`.

The ladder's order is asserted as an order — not as three separate boundaries —
in `tests/integration/economy-insolvency-ladder.test.ts` and
`tests/integration/economy-payroll-loop.test.ts`.

## Amendment, 2026-09-01: the deliveries and construction rungs are equalised, and decision 8's ladder loses a step

> **Accepted, 2026-09-01, by the repository owner.** This is a record of a
> decision already made and communicated, not a proposal awaiting one —
> `AGENTS.md` and `docs/AGENT_WORKFLOW.md` §3 forbid an implementing agent
> self-approving an ADR, and nothing below is offered as this agent's
> recommendation. The owner was shown the reproduction and the cost this
> amendment prices, in the same sitting, and ruled anyway. Amends the
> "Amendment, 2026-09-01: decision 8's ladder gets three thresholds inside the
> overdraft" section immediately above — quoted rather than overwritten, per
> that section's own form and ADR 0076's.

### 1. The reproduction

Issue [#771](https://github.com/matmaxalez/lockstate/issues/771), filed
2026-09-01 against the ladder that section shipped: buying a 40-minor-unit
brick from the shop (`'deliveries'`, refused below −1,250) is refused at a
balance where drawing a wall segment that needs the *same two bricks*
(`'construction'`, refused below −2,000) is still funded. Measured in the
issue: **ten wall segments, 800 spent, all went through silently** at a
balance in the 750-wide band between the two rungs, at the same time the shop
refused a 40 purchase. §3c above calls this split "the whole of what makes the
first two rungs distinguishable at all" and defends it as a deliberate
reading of decision 8's words — the finding is not that the split is wrong,
it is that **nothing on screen said it was there**: the same material, the
same money, one refused and one accepted, with no stated reason, at exactly
the point #771 itself identifies as where a player is already in trouble and
most needs the rules to be legible — the owner's standing directive against
hidden functionality, applied to the ladder rather than to a tooltip this
time. PR #763 / ADR 0087 (is a refusal an event or a standing condition) and
#767 (a crossed rung produces no event) are the neighbouring open questions
#771 names; neither is decided here, and §5 below names the one live
interaction with the branch working #767.

### 2. The ruling, in the owner's words

Put to the owner as a choice with its cost stated plainly rather than
buried: the option was described to them, before they took it, as one that
*"kills the deliberately designed ladder — the prison loses the ability to
finish what it has already started building."* The owner's ruling:

> **"Equalise the rungs: buying and building stop at the same place."**

Chosen with the cost in view. That is the owner's decision and it is not
re-litigated here; this amendment carries it out and writes down what it
costs where the corpus can find it.

### 3. Which place — the evidence, because the ruling names an operation and not a number

Ruling 19 (the section above) gave three magnitudes. This ruling gives an
operation — *equalise* — over two of them, and leaves which value they
equalise *to* for this amendment to answer with evidence, per the brief this
amendment was drafted under. Two candidates were live: **−1,250** (the
deliveries rung rises to meet nothing — construction's threshold moves up to
meet it) or **−2,000** (the deliveries rung sinks to meet construction's).
**−1,250 is taken**, on three grounds:

1. **It is the only reading under which the warned cost is the cost that was
   actually accepted.** The sentence the owner was warned with — *"the prison
   loses the ability to finish what it has already started building"* — is
   true of a queue that used to be funded to −2,000 and now stops at −1,250:
   a build already queued, materials already short, that would previously
   have been bought for down to −2,000 now stalls 750 minor units earlier.
   It is **not** true of the −2,000 reading, which would *widen* what a
   press can do rather than narrow what a queue can finish — deliveries
   would newly be funded 750 units deeper than they are today, and nothing
   the owner was told described the ruling as *more* generous to buying.
   Only −1,250 matches the sentence the owner ruled against having read.
2. **−1,250 is the number the game has already made a visible promise
   about, and −2,000 is not.** §5a above shipped `hud.status.funds-before-deliveries-stop`
   and `hud.status.funds-deliveries-stopped` on the deliveries rung's own
   value, in the chip's tooltip and screen-reader text, measured in
   `tests/browser/ui-overdraft-badge.spec.ts`. Taking −1,250 leaves every one
   of those already-shipped, already-measured player-facing figures true
   without touching them a second time. Taking −2,000 would move a number
   the owner signed off once already (§5a(e)) without a second ruling asking
   for that.
3. **It is the smaller change to the reachable game**, which this document's
   own convention (§3b above: *"the clamp is the minimum that keeps the
   ladder coherent"*) treats as the tie-breaker where the ruling itself does
   not choose between two readings that both satisfy its words. −1,250
   changes one rung's depth (construction, by 750 units, shallower). −2,000
   would change two directions on one rung (deliveries, by 750 units,
   deeper) while also being the reading the first two grounds rule out.

So: **both rungs a player's presses reach are −1,250.** The wages rung is
untouched, exactly as the brief for this work requires — it is
`Number.NEGATIVE_INFINITY`, the identity of `Math.max`, and clamps to
whatever `Treasury.floorFor` is asked for; nothing above changes what it
clamps to.

### 4. What of §3c is superseded, and what survives

**Superseded: the magnitude.** §3c's table read deliveries at −1,250 and
construction at −2,000. It is now:

| spend | rung | site | floor |
| --- | --- | --- | --- |
| the player's *Buy* press (`PurchaseMaterials`) | deliveries | `src/simulation/runtime/session-commands.ts` | **−1,250** |
| materials for a queued build order | construction | `JustInTimeMaterialsService.procureForPendingOrders` | **−1,250** |
| a payday | wages | `PayrollSystem.update` | the floor |
| taking on staff (`HireStaff`) | deliveries' threshold | `src/simulation/staff/hiring.ts` | **−1,250** |

**Superseded: decision 8's promise of a three-step order, read as three
distinct depths.** Decision 8 reads *"deliveries refused first, then
construction halted, then staff unpaid."* Under §3c that was three
strictly-ordered depths. Under this amendment it is **two**: deliveries and
construction now fire *together*, at the same balance, and staff go unpaid
last, at the floor. **This is the step the ladder loses, named rather than
hidden**: a prison sinking through the overdraft no longer passes through a
window in which it can buy nothing new but can still finish what it already
queued. §2 above records that the owner was told this in those terms and
ruled anyway.

**Survives: which spend is asked at which rung.** §3c's reading — that the
rung is a property of *who asked*, `'deliveries'` for a press and
`'construction'` for the just-in-time pass — is not withdrawn. The two
`SpendClass` values still exist, `Treasury.canAfford` and `Treasury.spend`
still take one as a required argument, and the split is still what lets
`reportMaterialsFunding` (§5a(b) above) tell a stalled queue apart from a
refused press *as events*, even though the two events now share a threshold.
Removing the split would also remove that distinction, which nothing in the
ruling asks for — the ruling equalises *where* the rungs are, not *whether*
a queue and a press are different things.

**Survives: the sentences.** §5a(a)'s five refusal sentences name what
stops, not the threshold, exactly so that a ruling that moves a threshold
does not falsify prose written against it. None of the five is touched by
this amendment, and none needed to be — the argument that shipped them
holds without change.

**Survives: rung 3, the sentinel, and everything §3a, §3d, §3e and §3f
decided.** Untouched. This amendment is scoped to §3c's magnitude and to
decision 8's reading as a three-*depth* order; nothing else in the previous
amendment is reached.

### 5. What this amendment costs, stated rather than argued away

- **Construction that used to be funded to −2,000 is now refused 750 minor
  units earlier.** A prison with a standing build queue and a balance
  between −1,250 and −2,000 could previously keep drawing on materials
  already short by a purchase; it cannot any longer. This is the cost the
  owner was warned of in those words and accepted — see §2.
- **Decision 8's ladder is now two steps where it was three.** "Deliveries
  refused first, then construction halted" collapses to one line, and the
  order decision 8 promises survives as *discretionary spends, then wages*
  rather than as three strictly nested depths. Decision 8's own sentence is
  not rewritten — it still names three things in order, and a prison at
  −1,250 still has all three true of it (deliveries refused, construction
  halted, wages so far paid) — but two of the three now become true in the
  same instant rather than in sequence, which is the sense in which the
  three-step reading of it is retired.
- **The 750-wide band #771 measured is closed**, by construction: a
  `Treasury` at any balance now agrees with itself about whether the two
  bricks a wall segment needs are affordable, whichever caller asks.
- **`tests/integration/economy-insolvency-ladder.test.ts`'s whole premise
  changes.** Its docblock and its central test walk the ladder specifically
  to exhibit the band this amendment closes — *"the prison cannot buy a 40
  brick and can still finish the wall it has already queued … the whole of
  what 'deliveries refused first, then construction halted' means as two
  separate events"* is, after this amendment, no longer true, and the file
  is rewritten rather than patched. §7 below is the gate.
- **No player-facing string changes.** §5a(a)'s five sentences all name what
  stops rather than a number, and none of them becomes false. The **FUNDS**
  chip's number and tone are untouched by value — both are already computed
  from the deliveries rung (§5a(c)), which does not move — but what that
  number now *means* changes: "left before deliveries stop" is, after this
  amendment, also "left before construction stops," and the chip is not
  told to say so. Per this work's own brief the chip's wording and tone are
  owned by other branches (PR #769, and a separate agent's third colour) and
  are not touched here; this is named for whoever next edits that copy.
- **No save format moves, and a determinism fingerprint moves only for a
  prison whose balance ever sat between −1,250 and −2,000 with a standing
  construction queue** — exactly the band this amendment removes. A prison
  that never entered that band produces the same fingerprint before and
  after.
- **ADR 0081 (queue funding, one whole order at a time) does not reason from
  the split and needs no change.** Checked: neither its granularity decision
  nor its Consequences cite either rung's magnitude or the fact that they
  differed; its subject is atomicity per order, orthogonal to which floor an
  order's spend is measured against. Nothing here invalidates it.
- **The `PrisonCondition` work on `feat/767-a-crossed-rung-is-a-condition-and-an-event`
  is a real interaction, named rather than resolved here.** If that branch
  models "deliveries refused" and "construction halted" as two conditions
  that cross at different balances, this amendment makes them cross at the
  *same* balance for every prison, always — the two conditions become one
  event in wall-clock terms even if they remain two named conditions in the
  model. Whether that collapses to one condition, stays two conditions that
  are simply always concurrent, or is unaffected because that branch
  already treats them as independent facts about the treasury rather than
  about timing, is that branch's call; this amendment does not touch it or
  coordinate with it directly, per this work's brief.

### 6. What this amendment does not decide

- **Whether decision 8's prose should itself be reworded** to say two steps
  instead of three. Decision 8 is Accepted text from #96 and this amendment
  narrows its *implementation contract* exactly as the previous amendment
  did, not its words; a rewording is a documentation question for whoever
  next touches decision 8's own paragraph, not an implementation decision.
- **Whether the wages rung should ever be drawn toward the other two.** Out
  of scope by the brief this amendment was written under, and untouched:
  `INSOLVENCY_RUNG_FLOORS_MINOR_UNITS.wages` stays
  `Number.NEGATIVE_INFINITY`.
- **What, if anything, replaces the FUNDS chip's derivation once its tone or
  wording next changes.** §5 above names that the number now means two
  things at once; choosing new copy for that is reserved exactly as
  `AGENTS.md`'s fourth exclusion reserves it, and is explicitly out of
  scope for the branch that carries this amendment.
- **The `PrisonCondition` interaction named in §5.** Flagged, not settled.

### 7. The gate

`tests/integration/economy-insolvency-ladder.test.ts` is rewritten to walk
the now-two-step ladder and to carry the #771 case directly: the same two
bricks, bought and drawn, at a balance that used to sit inside the 750-wide
band and no longer produces different answers. `tests/unit/economy-treasury.test.ts`,
`tests/integration/economy-money-conservation.test.ts`,
`tests/integration/economy-liquidity-hard-lock.test.ts` and
`tests/unit/ui-affordability.test.ts` are updated wherever they asserted the
old construction magnitude or the gap between the two rungs by name.
`tests/determinism/` and `tests/contract/` are run in full and reported
green, unchanged in count, per this work's own instruction.

### 8. Where this is implemented

`src/simulation/economy/treasury.ts`
(`INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS`, now defined as
`INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS` rather than a second literal,
so the two cannot silently diverge again — the same "impossible to bypass by
construction" property §3d above already applies to the required
`SpendClass` argument, extended here to the magnitude itself) and its
docblocks; `src/ui/affordability.ts` is unchanged in code because
`HOST_PRESS_FLOOR_MINOR_UNITS` was already computed through
`rungFloorMinorUnits('deliveries', …)`, which does not move.
