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

**Accepted, 2026-08-29, by the repository owner.**

**This clause read `Proposed, 2026-08-29. Not self-approved.` until the owner
accepted it later the same day**, and the sentence it replaced is worth keeping
because it named exactly what was missing: *"The three decisions below are the
owner's, ruled on 2026-08-29 with the measurements in this document in front of
them. The status stays `Proposed` because the ADR itself has not been through
the acceptance step, and this document does not accept it."* The rulings were
always the owner's; the acceptance step is what had not happened. It has.

**How the acceptance arrived, recorded because a reader checking this status
later deserves to know its weight.** It was given against a summary of this
ADR's subject and its stated cost, put to the owner as a decision alongside
seven others, not against the full text of this document. `AGENTS.md`'s rule is
*"never self-approve an ADR — the owner accepts"*, and the owner did; this
paragraph exists so nobody mistakes the acceptance for a reading.

**Acceptance does not close the class, and this ADR already said why.** Its own
weakest claim, below, is that the class is closed only if the first threshold
beats the wage bill and the loan terms make recovery possible from any reachable
position — **and neither number is in this document.** One of the two has since
been decided in shape though not in magnitude; see the loan ruling recorded
under decision 2.

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
  presses nothing — which is why a spend-it-all confirmation (which never fires)
  was put to the owner and not taken, and why decision 1 below says in its own
  terms that its first threshold, taken alone, does not close the class either.

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
is the substance rather than a preference: **decision 1 gets a prison its first
bed and pays for growth after that; decision 2 is what happens when the money
runs out anyway; and decision 3 is the way out of holding the wrong thing.**

### 1. Development grants at population thresholds — one-off per threshold, thresholds continuing indefinitely

**The owner's own shape, and it is not one of the four that were offered.** In
their words: *"dotacje na rozwój typu jak przekroczysz x więźniów to dostajesz
x €, i tak w nieskończoność by można było grać na duże więzienia"* — development
grants; cross X prisoners and receive X; thresholds continuing indefinitely so a
player can play toward large prisons. Asked how a threshold should behave, they
chose **one-off per threshold, with the first threshold very low**.

**Why this is better than the flat recurring grant it replaces**, and the reason
belongs in the record rather than in the choosing:

- **It pays for growth, not for existing**, so it does not fall under what
  ADR 0017 decision 1 rejected by name. That decision considered a *"scheduled
  block grant"* and refused it because *"a block grant pays for surviving to a
  date, which is the timer the audit warns about"*. A threshold grant is not a
  schedule: no amount of time crosses one. Waiting pays nothing.
- **It serves ADR 0017 decision 1's stated goal directly.** That decision chose
  per-occupied-place because it is *"the only one of the four that makes the two
  things the player builds — capacity and the ability to keep people in it
  safely — pay off through the same line, so expansion and competence are not
  separate currencies."* A grant that fires on population crossing a threshold
  is paid for exactly that, on the same axis, in a lump.
- **It cannot be milked.** One-off per threshold is what makes this true: a
  threshold crossed once does not renew, so there is no loop in which a player
  gains by cycling population across a boundary. This is the property to protect
  when the amounts are set — a *repeating* threshold grant would be a different
  and much worse decision.
- **It is unbounded upward on purpose**, which is the owner's stated reason for
  wanting it: thresholds keep arriving, so a large prison is something to play
  toward rather than a plateau.

**The very low first threshold is a starting grant in disguise, and this ADR
says so rather than letting it pass.** A starting grant of planks was measured
and left out precisely because the payroll route is *"spent by day two"*; a first
threshold low enough to fire almost immediately is the same money arriving by a
different door. That is a reasonable thing to want — it buys the first bed, which
is the thing ECON-002 makes impossible — and the trade is accepted knowingly.
**So: the first threshold alone does not close the class.** It gets the prison
started; the recurring pressure that the payroll route demonstrates is answered
by decision 2's ladder and its loan, not by this.

**What is not decided here**, per ADR 0017 decision 5, which reserves prices and
balance values to [#29](https://github.com/matmaxalez/lockstate/issues/29): the
thresholds, the amounts, and the shape of the sequence. **Whoever sets them owns
whether the class is closed**, because that is a comparison between three numbers
this ADR does not hold — the first threshold's amount, the wage bill, and the
price of a plank. This is named here as an open number for the same reason the
loan terms are in decision 2.

### 2. The balance may go negative, the ladder runs on it, loans are the way out — and nothing ends the session

> **Owner ruling, 2026-08-29 — how the loan repays.** This ADR says below that
> *"whoever sets the loan terms owns whether the class is really closed"* and
> deliberately leaves them open. The shape is now settled: **a loan is repaid by
> diverting a fixed percentage of positive inflows — state payments, grants,
> contract rewards — until principal plus a fixed fee is cleared. There is no
> fixed daily instalment.**
>
> The reason is this ADR's own subject. A fixed instalment billed against a
> prison that is already insolvent drives it further under with nothing the
> player can do to stop it, which is a loss condition reached by arithmetic
> rather than by rule — and decision 8 of ADR 0017, which decision 2 above
> exists to defend, refused a loss condition. A repayment that takes a share of
> what arrives cannot bill a prison that is earning nothing.
>
> **The accepted cost, stated rather than discovered later:** revenue-share debt
> feels nearly free while income is low and can linger a long time. The named
> mitigations are a **fixed fee rather than compounding interest**, so the total
> is known at drawdown, and a **maximum duration after which the diversion rate
> rises**.
>
> **What the ruling does not settle: the magnitudes.** The percentage, the fee
> and the duration are still #29's, per ADR 0017 decision 5 — so this ADR's
> weakest claim stands, and recovery-from-any-reachable-position remains
> unproved until those numbers exist.
>
> Three constraints ride with it, each because this ADR has no floor and no
> terminal state. **An accrual cap**, because interest against a negative
> balance can otherwise escalate without limit, with a restructuring path that
> is painful but available. **A loan draw is reported separately from operating
> income** — a ledger where the operating net is negative while cash rises is a
> loan masking a deficit, and the player should be able to see the difference.
> And **no mechanism may capitalise future income**: nothing that converts the
> coming stream of threshold grants or per-place income into cash now, which is
> a loan secured against projected occupancy wearing a different name.
>
> Recorded at [issue #598](https://github.com/matmaxalez/lockstate/issues/598).

**Author and surface ADR 0017 decision 8's ladder:** *"deliveries refused first,
then construction halted, then staff unpaid with the morale and incident
consequences that follow."*

**Its precondition is named in ADR 0017's own text and is not met today.**
`Treasury.spend` refuses rather than overdrawing
(`src/simulation/economy/treasury.ts:111`), so there is no negative balance for a
ladder to respond to. Building this means changing that.

**The owner was asked whether bankruptcy should follow some number of days in
the red, and refused it.** Their words: *"Bez bankructwa, tylko minus i
pożyczki"* — no bankruptcy, only a negative balance and loans. **That refusal is
a decision not to overturn ADR 0017 decision 8**, which was put to them in those
terms, and which reads:

> **Accepted: insolvency is a state, not a loss condition.** … **No game-over,
> no silent stall.**

and gives its reason:

> a loss condition ends the session, and a session that ends removes the
> interesting part, which is digging out. It also fits the subject — a real
> prison that runs out of money does not close, it gets worse.

**ADR 0017 decision 8 therefore stays in force, and this ADR states that
explicitly because a reader will otherwise assume the opposite.** A negative
balance is the ordinary reading of "bankrupt" in most games. Here it is not: the
balance goes negative, the prison degrades visibly down the ladder, the player
borrows, and the session continues. There is no game-over state anywhere in this
decision.

**`Treasury`'s own docblock argues the reverse and is owed a correction, not a
deletion.** It currently reasons that the four non-negative validators are
*"load-bearing for decision 8 rather than in its way"*, because a floored balance
produces the ladder by itself — discretionary spends are refused before the
undeclinable one. That reasoning was sound and is now superseded rather than
wrong: **the validators were defending decision 8 by preventing the debt; under
this ruling decision 8 is defended by the loan instead.** Whoever implements this
rewrites that paragraph to say so, and does not simply remove it — the argument
it makes is the reason anybody would have hesitated, and the record of why it no
longer holds is the useful part.

**The loan is not a nice-to-have beside the ladder. It is what keeps decision 8
honest.** With no floor and no terminal state, a prison can reach a position from
which recovery is arithmetically impossible: wages exceed every income line, the
balance falls for ever, and the session runs on with nothing the player can do —
**a hard-lock again, only slower, and dressed as a mechanic.** That risk was put
to the owner and is accepted as a cost rather than dismissed, on the basis that
borrowing is the exit. So the loan is load-bearing: without it this decision
recreates ECON-002 in a form that takes longer to recognise.

**Whoever sets the loan terms owns whether the class is really closed.** Interest
rate, principal ceiling, and what borrowing costs when it cannot be repaid are
all #29's numbers, and they decide whether "you can always borrow your way back"
is true or merely available. That is the same shape as decision 1's open number
and it is named for the same reason.

**This is also the decision with a player-facing surface**, and therefore the one
whose copy is the owner's under `AGENTS.md`: a degradation the player cannot see
is the *"invisible stall"* ADR 0017 warns about, and a loan the player cannot
understand the price of is worse than no loan.

### 3. Sell-back at a loss

A command that converts stock back into money at a fraction of the purchase
price.

**This is the general answer to "the money is in the wrong shape"**, which is
what ECON-002 is underneath: the 625-brick prison is not poor, it is illiquid.
It fixes every future variant rather than this instance, and it is what a
management sim normally offers.

**The loss is the point and not a tax.** A round-trip at full price makes
purchase decisions free and turns the treasury into a warehouse; a loss keeps the
decision to buy a real one. The ratio is a balance value and is #29's, per
ADR 0017 decision 5.

**What it costs to build**, stated so it is not discovered later: a command in
`simulationCommandSchema`, a refusal reason from an exhaustive `Record` over a
named union (`simulation-refusals.test.ts` fails a boolean), a HUD control, and
**a player-facing string** — which puts the wording in the owner's hands under
`AGENTS.md`.

### What was considered and not taken

**Other shapes the income line could have had**, all four put up against
decision 1 and none taken:

- **Prison labour.** ADR 0017 decision 3 already names it as the *other*
  secondary line — *"grants and labour income remain, as secondary lines"* — and
  nothing implements it. Not taken **now**, and worth flagging as the natural
  next one rather than as a rejection: the work rooms exist in content, and
  [ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
  measured that `action.classroom-education` already performs 9,000 of a
  prisoner's 10,000 work-and-education ticks in a furnished prison, so the
  occupancy a labour line would price is already there. It is the one shape here
  that would make a prisoner's day pay for itself.
- **A flat daily subsidy.** Not taken. It is the *"scheduled block grant"*
  ADR 0017 decision 1 refused by name, and its objection applies unchanged:
  it pays for surviving to a date.
- **A threshold backstop keyed to the price of a plank** — a credit that fires
  whenever the balance falls below what a sleep surface costs. Not taken. It
  targets ECON-002 exactly and nothing else, which is its whole problem: it is a
  rule about one content price wired into the treasury, invisible until it
  fires, and it would have to be explained to the player as a mechanic or it
  reads as a bug.
- **A one-off starting stock** — planks in the opening container. Not taken as
  its own mechanic; decision 1's very low first threshold is this, arriving
  through a rule that keeps paying afterwards.

**And the remedies from the original option list that the rulings displaced:**

- **A liquidity floor** — `Treasury.spend` refusing a spend that would leave less
  than one plank's price. **Rejected, and now in direct conflict with decision 2**,
  which requires the balance to go negative. It also couples the treasury to a
  content price and never touches the payroll route, since payroll is not a spend
  the player chose.
- **A warning before a purchase that spends the last of the treasury.** Not
  taken. The payroll route presses nothing, so the dialog never fires.
- **An explicit "you are stuck, start again" state**, and **bankruptcy after N
  days in the red**. Both refused, and the second explicitly: *"Bez bankructwa"*.
  Either would mean amending ADR 0017 decision 8 rather than discharging it.

## Consequences

- **No save format moves under decisions 1 or 3.** Both are balance arithmetic on
  state a save already carries. **Decision 2 needs checking and may.** A negative
  balance is a sign change on a persisted integer, not a new field —
  `PayrollSystem`'s docblock already notes that the alternative it rejected would
  have needed *"either a sign change on a persisted field or a new persisted
  arrears"* — but the loan is a second thing to persist: outstanding principal
  has to survive a save or a player reloads out of their debt. **Whoever builds
  decision 2 must confirm the save schema's balance validator admits a negative
  and decide where the loan lives, and say loudly if either is a format change.**
  Decision 1 also needs the crossed-threshold set persisted, or a reload re-pays
  every grant already collected — which is the milking loop the one-off rule
  exists to prevent, reintroduced through the save.
- **A determinism fingerprint moves under decisions 1, 2 and 3**, because all
  three put new values into the balance a fingerprint hashes. All must ship as
  integer minor units for the reason `Treasury` already gives: a fractional
  currency puts a float into hashed state and floating-point addition is not
  associative.
- **Decisions 2 and 3 each add a player-facing string** and are therefore partly
  the owner's under `AGENTS.md`. Decision 1 adds one the moment a threshold grant
  is announced to the player, which it must be — an unexplained credit is as
  confusing as an unexplained refusal.
- **The ordering consequence ADR 0017 already incurred is inherited and slightly
  sharpened by decision 1.** That ADR records, of its own income answer, that
  *"income scales with population, so overcrowding must be punished elsewhere
  (#79, #80, #81) or the optimum is to pack the prison."* A threshold grant is
  paid **for** population crossing a line, so it pushes in the same direction as
  the per-place line rather than against it. It does not create the debt, and it
  does not discharge it; #79, #80 and #81 remain where it is owed, and it is
  worth more now than it was.
- **The reproduction is deliberately left green against the defect.**
  `tests/integration/economy-liquidity-hard-lock.test.ts` will need updating by
  each of the three changes — decision 1 breaks *"balance 0 five in-game days
  later"*, decision 2 breaks *"and it never rises again"* and the payroll case's
  final `toBe(0)`, decision 3 breaks the fourteen-command enumeration — so a
  remedy cannot merge without somebody reading what the trap was.
- **No production code is in this branch.** Each decision is its own change after
  acceptance.

## What would change this

The weakest claim in the evidence is the word *never* in "can never earn another
minor unit". What is measured is that five specific escapes fail, that the
fourteen-member command union contains exactly one crediting command, and that
both sleep-surface buildables are plank-priced. That is an argument from
enumeration, not an exhaustion over every ordering of fourteen commands. Any
sequence that raises the balance above 0 from the state the test leaves refutes
it, and the enumeration assertion is written so that adding a crediting command
fails a named assertion rather than silently making the file a false story.

**The weakest claim in the decisions is that the class is closed at all**, and it
now has two owners rather than one. Decision 1 closes it only if the first
threshold's amount beats the wage bill for long enough to reach the second;
decision 2 closes it only if the loan terms make recovery arithmetically possible
from any reachable position. Neither number is in this ADR. **If both are set
badly, this ruling produces a slower ECON-002 rather than none** — a prison
falling for ever down a ladder with a loan it cannot service — and the thing that
would change my mind in either direction is the arithmetic between the first
threshold, the loan's terms and `wageBand.minPerDay`, run once against a real
prison.
