# ADR 0075: What a prison that cannot afford its first bed is owed

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0075, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049 and 0074 each pre-committed.
>
> **The arithmetic, recomputed rather than accepted**, because the practice ADR
> 0071 and ADR 0074 both record is that the assigner performs the sweep and the
> drafting agent recomputes it off disk at commit time. The integrator performed
> the sweep and assigned 0075 and 0076; this recomputation was run separately on
> 2026-08-29 from `agent/econ-hardlock-and-recycling`, over **every** remote
> head and not only `main`:
>
> - `origin/main` and every `origin/agent/*` and `origin/wip/*` head max at
>   **0074** (the restored-room-rectangle ADR, #559).
> - **0072 is held and unwritten** for the events-persistence decision, which
>   the owner has ruled on. It is a hold, not a gap.
> - Nothing on any remote head is above 0074.
>
> So `max + 1` off disk is **0075**, the `Next free number` line says 0075, and
> the assignment says 0075. All three agree, which is the outcome ADR 0074
> reports and not the one ADR 0071 did — and the reason to write it out anyway
> is that whether they agree is a fact about branches a worktree cannot see.

## Status

**Proposed, 2026-08-29. Not self-approved.**

The three decisions below are **the owner's, ruled on 2026-08-29** with the
measurements in this document in front of them. The status stays `Proposed`
because the ADR itself has not been through the acceptance step, and this
document does not accept it.

It answers an economy audit finding raised against `4c18bc4` (v0.0.203) as
ECON-002 and reproduced by running it against `ec10451` (v0.0.206).

## Context

### This ADR proposes no new policy. It discharges an accepted one whose cost was written down and never paid

[ADR 0017](./0017-money-primary-resource-model.md)'s third open question,
*"What happens at insolvency?"* — accepted as decision 8 of that ADR's decision
list — reads in full:

> **Accepted: insolvency is a state, not a loss condition.** At a negative
> balance the state stops paying for discretionary things in a defined order and
> the prison degrades visibly — deliveries refused first, then construction
> halted, then staff unpaid with the morale and incident consequences that
> follow. **No game-over, no silent stall.**

and names its own price:

> The consequence to accept: **degradation has to be authored and surfaced**, or
> insolvency becomes the same invisible stall as #89. That is real work, and it
> is the cost of this answer.

**ECON-002 is that invisible stall.** Not an approximation of it — the exact
failure the sentence names, arrived at from the other side: not a negative
balance nobody authored a response to, but a balance pinned at a number the
player cannot spend, in a session that keeps running and can never change.

The same ADR also states the ladder's own precondition, in its own words:

> **Answer 3 is not reachable yet.** `Treasury.spend` refuses rather than
> overdrawing, so there is no negative balance for a degradation ladder to
> respond to. It becomes reachable when a recurring charge exists that the
> player cannot decline

That recurring charge now exists — `PayrollSystem` bills every employee's
`wageBand.minPerDay` at the end of every in-game day — so the precondition is
met and the ladder is reachable for the first time. Decision 2 below is what
makes it reachable in the other sense as well: `Treasury.spend`
(`src/simulation/economy/treasury.ts:111`) still refuses rather than overdrawing,
so there is still no negative balance for a ladder to respond to.

And ADR 0017 decision 3 already accepts the income line decision 1 below
implements: *"the state's remuneration for operating the facility is the primary
income line — not grants alone, and not prison labour alone. **Grants and labour
income remain, as secondary lines.**"* Nothing implements a grant.

### The class, stated before the remedies because the audit's framing hides it

**The class is: the treasury drains below the price of a plank. It is not: the
player spent it all at once.**

The finding as raised was a reckless purchase — 625 `item.brick` at 40, spending
exactly the opening 25,000 in one press — and that framing invites the answer
*"then do not let them press that"*. Two measurements move the boundary, and
they are why a starting grant of planks was put to the owner and left out:

- **624 bricks leaves 40.** A positive balance the status strip displays, and
  the identical trap, because what closes the session is being below **65** and
  not being at zero. A floor at zero fixes nothing.
- **A prison reaches the same state with no such press at all.** Buy 616 bricks
  — 24,640, which at two bricks a wall segment
  (`src/simulation/construction/definition.ts:89`) is 308 segments, an ordinary
  first build — hire one guard, and press nothing else ever again.

  | step | balance |
  | --- | --- |
  | fresh prison | 25,000 |
  | 616 `item.brick` at 40 | 360 |
  | `HireStaff` one guard, one day's wage up front (`src/simulation/staff/hiring.ts:198`) | 280 |
  | three in-game days of payroll at 80 (`src/content/staff-role-catalog.ts:150`) | **40** |
  | `PurchaseMaterials` 1 × `item.wood-plank` | `purchase.insufficient-funds`, 40 |
  | tick 12,000 | 0, with unpaid wages climbing |

  Nobody spent the treasury. A charge the player cannot decline walked it below
  the price of the one object that starts the income line. **Any remedy that
  only defends a press is incomplete by construction**, because this route
  presses nothing — which is why a starting grant of planks (spent by day two,
  and never reached by this route at all) and a spend-it-all confirmation (which
  never fires) were both put to the owner and neither was taken.

### Why it is terminal, which is three facts and no bug in any of them

1. **State income is paid per occupied place**, and an occupied place is one
   unit of a room instance's `residentCapacity` that a prisoner holds
   (`src/simulation/economy/income.ts`, `OccupiedPlaceSource`).
2. **`residentCapacity` comes from a standing `sleep-surface` object**
   (ADR 0028 decision 2's capacity rule). Both buildables in
   `BUILDABLE_REGISTRY` that place one — `bed-wooden`
   (`src/simulation/construction/definition.ts:180`) and `medical-bed-wooden`
   (`src/simulation/construction/definition.ts:570`) — require
   `item.wood-plank` and nothing else. No brick-priced definition places a
   sleep surface.
3. **A plank is 65** (`src/content/procurement-catalog.ts:101`) and money has
   exactly two sources: the opening balance, and `StateIncomeSystem`.

So *cash below 65, no plank in stock, and nothing plank-built to reverse* is a
closed state.

### The escapes, exhausted by running them rather than by reading

`tests/integration/economy-liquidity-hard-lock.test.ts` drives every one of
these through the real `Kernel`, the real `packCommand` decoder and the real
session command router. After the 625-brick delivery lands, on a balance of 0
with 625 bricks in the container:

| attempted escape | measured result |
| --- | --- |
| `CancelMaterialPurchase` on the landed order | `cancel-purchase.not-pending`; balance 0; bricks stay |
| `PurchaseMaterials` 1 × `item.wood-plank` | `purchase.insufficient-funds`; balance 0 |
| `PlaceObject bed-wooden`, then 5,000 ticks | order still `materials-pending`; no object; `residentCapacity` 0 |
| `AdmitPrisoner`, then 12,000 ticks | `totalOccupancy` 0; balance 0 |
| build a brick object and `Undo` it | 625 bricks back; balance 0 |

and the structural half, which is what makes *"there is no escape"* a claim
rather than a list: the test enumerates `simulationCommandSchema` itself. There
are **fourteen** commands, exactly one of which credits the treasury —
`CancelMaterialPurchase` — and the row above measures it refusing. There is no
sell command, no production, no gathering, no research and no grant. A
`SellMaterials` added by decision 3 below fails that assertion and sends its
author here, deliberately.

### The purchase is legal at every layer, including the interface

Nothing refuses it: `refusals.last` is `undefined` after the command. The Build
panel's material stepper opens its maximum on `MAX_PURCHASE_QUANTITY` — 100,000
— and not on what the prison can afford (`src/main.ts:665`), so the quantity is
composable with the controls as shipped.

## Decision

**Three decisions, not a choice between three options.** The owner ruled on
2026-08-29 that all three are to be built, in the order below, and the ordering
is the substance rather than a preference: **decision 1 is the only one that
closes the class on its own, and decisions 2 and 3 are what make insolvency
*interesting* rather than merely survivable.**

### 1. A recurring grant, as ADR 0017 decision 3's secondary income line

The state pays the prison an unconditional amount per in-game day, independent
of population, alongside the per-occupied-place remuneration that stays the
primary line.

**This is the decision that closes the class**, and it is the only one of the
three that does. It is the only remedy that defends the **payroll route**: a
grant arrives whether or not the player presses anything, so a balance walking
downward on a charge nobody chose is met by a credit nobody has to earn. Every
other remedy considered — a plank grant, a purchase warning, a liquidity floor —
defends a press, and the payroll route makes no press.

It is also the smallest possible discharge of ADR 0017 decision 3: grants are
already accepted as a secondary line, and this authors one.

**The rate is not decided here**, per ADR 0017 decision 5, which reserves prices
and balance values to [#29](https://github.com/matmaxalez/lockstate/issues/29).
What *is* decided is the shape: unconditional, per in-game day, an integer in
minor units, paid on the same day boundary the existing lines settle on. The
rate has one hard constraint and it should be stated where the rate is chosen: a
grant large enough to fund expansion by itself removes the pressure the whole
economy exists to create. The floor it must clear is much lower — enough that a
prison with no income can eventually buy one plank.

### 2. The degradation ladder, which requires the balance to go negative

Author and surface ADR 0017 decision 8's ladder: *"deliveries refused first,
then construction halted, then staff unpaid with the morale and incident
consequences that follow."*

**Its precondition is named in ADR 0017's own text and is not met today.**
`Treasury.spend` refuses rather than overdrawing
(`src/simulation/economy/treasury.ts:111`), so there is no negative balance for
a ladder to respond to. Building this decision therefore means changing that,
and the change is not cosmetic: `Treasury`'s own docblock currently argues at
length that the four non-negative validators are *"load-bearing for decision 8
rather than in its way"*, on the reasoning that a floored balance produces the
ladder by itself because discretionary spends are refused before the
undeclinable one. **That argument is now the thing being overturned**, and
whoever implements this owes that paragraph a correction rather than a deletion:
the ladder it describes is real but silent, and decision 8's requirement is that
degradation be *authored and surfaced*, which a refusal nobody explains is not.

**This is the decision that makes insolvency interesting.** It does not close
ECON-002 on its own — a prison that goes negative and degrades is still a prison
that cannot buy a plank — but it converts the failure from a stall into a state
with visible consequences the player can act against, which is what ADR 0017
promised and what #96 asked for.

**It is also the one with a player-facing surface**, and therefore the one whose
copy is the owner's under `AGENTS.md`: a degradation the player cannot see is
the *"invisible stall"* the ADR is trying to avoid, so this decision is not done
when the mechanics land.

### 3. Sell-back at a loss

A command that converts stock back into money at a fraction of the purchase
price.

**This is the general answer to "the money is in the wrong shape"**, which is
what ECON-002 is underneath: the 625-brick prison is not poor, it is illiquid.
It fixes every future variant rather than this instance, and it is what a
management sim normally offers.

**The loss is the point and not a tax.** A round-trip at full price makes
purchase decisions free and turns the treasury into a warehouse; a loss keeps
the decision to buy a real one. The ratio is a balance value and is #29's, per
ADR 0017 decision 5.

**What it costs to build**, stated so it is not discovered later: a command in
`simulationCommandSchema`, a refusal reason from an exhaustive `Record` over a
named union (`simulation-refusals.test.ts` fails a boolean), a HUD control, and
**a player-facing string** — which puts the wording in the owner's hands under
`AGENTS.md`.

### What was considered and not taken

- **A liquidity floor** — `Treasury.spend` refusing a spend that would leave
  less than one plank's price. **Rejected, and it is worth recording why rather
  than only that**: it is the cheapest patch and it is in direct conflict with
  decision 2, which requires the balance to go negative. It also couples the
  treasury to a content price and never touches the payroll route, since payroll
  is not a spend the player chose.
- **A starting grant of planks.** Not taken. It is spent by day two, and the
  payroll route reaches the trap without ever spending it.
- **A warning before a purchase that spends the last of the treasury.** Not
  taken. The payroll route presses nothing, so the dialog never fires.
- **An explicit "you are stuck, start again" state.** Not taken; it is the loss
  condition ADR 0017 decision 8 rejected, and taking it would mean amending that
  decision rather than discharging it.

## Consequences

- **No save format moves under any of the three.** A grant and a sell-back are
  balance arithmetic on state a save already carries. Decision 2's negative
  balance is a sign change on a persisted integer, not a new field —
  `PayrollSystem`'s docblock already notes that the alternative it rejected
  would have needed *"either a sign change on a persisted field or a new
  persisted arrears"*, so the field is sized for it. Whoever builds decision 2
  must confirm the save schema's balance validator admits a negative, and say so
  loudly if it does not, because that would be a format change.
- **A determinism fingerprint moves under decisions 1 and 3**, because both put
  new values into the balance a fingerprint hashes. Both must ship as integer
  minor units for the reason `Treasury` already gives: a fractional currency puts
  a float into hashed state and floating-point addition is not associative.
- **Decisions 2 and 3 each add a player-facing string** and are therefore partly
  the owner's under `AGENTS.md`. Decision 1 adds none if the grant is simply a
  credit; it adds one the moment the HUD names it, which it probably should.
- **The ordering consequence ADR 0017 already incurred applies to decision 1 and
  is inherited rather than created here.** That ADR records, of its own income
  answer, that *"income scales with population, so overcrowding must be punished
  elsewhere (#79, #80, #81) or the optimum is to pack the prison"*. A grant is
  the one income line that does **not** scale with population, so it slightly
  weakens that pressure rather than adding to it — but it does not discharge the
  debt, and #79/#80/#81 remain the place it is owed.
- **The reproduction is deliberately left green against the defect.**
  `tests/integration/economy-liquidity-hard-lock.test.ts` will need updating by
  each of the three changes — decision 1 breaks *"balance 0 five in-game days
  later"*, decision 3 breaks the fourteen-command enumeration — so a remedy
  cannot merge without somebody reading what the trap was.
- **No production code is in this branch.** Each decision is its own change
  after acceptance.

## What would change this

The weakest claim in the evidence is the word *never* in "can never earn another
minor unit". What is measured is that five specific escapes fail, that the
fourteen-member command union contains exactly one crediting command, and that
both sleep-surface buildables are plank-priced. That is an argument from
enumeration, not an exhaustion over every ordering of fourteen commands. Any
sequence that raises the balance above 0 from the state the test leaves refutes
it, and the enumeration assertion is written so that adding a crediting command
fails a named assertion rather than silently making the file a false story.

The weakest claim in the *decisions* is that decision 1 closes the class. It
closes it for every drain rate slower than the grant. A prison whose payroll
exceeds its grant still walks downward — into decision 2's ladder rather than
into a stall, which is the intended destination, but the word "closes" is doing
work that only holds once #29 sets the two numbers against each other. Whoever
sets them owns that comparison.
