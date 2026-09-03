# ADR 0083: What opens the negative balance, and what bounds it

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0083, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074, 0075 and 0076 each pre-committed.
>
> **The arithmetic, and this is one of the cases where the three answers do not
> agree.** The sweep was performed on 2026-08-31 from
> `agent/703-negative-balance-first`, cut from `origin/main` at `8218f23`
> (v0.0.288), over **every** remote head rather than `main` alone:
> `git ls-remote --refs --heads origin` returns **359** refs, the local
> `refs/remotes/origin` snapshot holds the same 359 after `git fetch --prune`,
> and `docs/adr/` was read out of each with `git ls-tree`.
>
> - `origin/main` maxes at **0081** (the purchase-atomicity ADR), as do
>   `agent/703-strip-overflow`, `claude/adr-0049-accept-and-supersede`,
>   `claude/adr-0081-purchase-atomicity`, `fix/adr-0081-corrections` and two
>   `worktree-agent-*` heads.
> - **`agent/build-order-execution-order` holds 0082**, unmerged and therefore
>   invisible from the index.
> - Nothing on any of the 359 heads is above 0082.
>
> So `max + 1` off **disk** is 0082 and the stated **Next free number** line is
> 0082 — and both are wrong, for the reason ADR 0075's and ADR 0073's entries
> record: disk sees only what has merged. `max + 1` over the **sweep** is
> **0083**, which is the number taken. **0072 is still held.**

## Status

**Proposed, 2026-08-31. Not self-approved.**

It answers a sequencing instruction the owner gave on
[#703](https://github.com/matmaxalez/lockstate/issues/703) that **cannot be
executed as stated**, and says what is missing rather than choosing it.

> **THE TWO THINGS IT SAID WERE MISSING HAVE SINCE BEEN RULED ON, and the
> sentence above is kept because it is what this document was written to do
> rather than a claim about where things stand.** On 2026-08-31 the owner
> answered both questions this document put:
>
> - **Decision §2: reading A** — a standing overdraft every prison has, chosen
>   over the floor being opened by a drawdown and over staying floored at zero.
> - **Decision §3: 5,000 bp (50%)** for `escalatedDiversionRateBasisPoints`,
>   chosen over 45%.
>
> Both sections below record the rulings in place of their recommendations,
> with the arguments they chose over kept intact. **The status line above is
> still `Proposed` and stays that way until the owner signs it**: a ruling on
> two sections is not a signature on the document, and nothing in this corpus
> is self-approved.
>
> **Two things the rulings create rather than settle**, both named at their own
> sites and neither taken here: an amendment is owed to ADR 0017 decision 8's
> ladder ordering, which reading A inverts; and the floor's magnitude, which
> reading A leaves open and for which §2 proposes a rule (one tenth of the
> opening grant) that is **unmeasured below −1,500** and must be swept before
> it ships.
>
> **The first of those two is now drafted, and this sentence is kept because it
> is what this document created rather than a claim about where things stand.**
> The owner's **ruling 19 of 2026-08-31** — *"Dać szczeblom własne progi
> wewnątrz debetu"*, give the rungs their own thresholds inside the overdraft,
> at −1,250 / −2,000 / −2,500 — answers the question §2 put, and it is drafted
> as [ADR 0017](./0017-money-primary-resource-model.md)'s
> **"Amendment, 2026-09-01"**. **The owner signed it on 2026-09-01**, so the
> amendment is drafted *and* accepted. This clause read *"It is Proposed and not
> self-approved, so the amendment is drafted and still owed a signature"* for as
> long as that was true, and the sentence above it — the one this document
> created — has not changed either way.
>
> Ruling 19 also takes **neither** of the two remedies §2 named. It does not
> amend the *order* and does not narrow decision 8 to a prison that has spent
> its overdraft; it keeps both, and makes the order expressible by giving the
> three rungs three thresholds. See ADR 0017's amendment §2. One thing this
> document decided is reversed by it, and is marked at that site: "What was
> considered and not taken" rejected *"making the payroll draw on the floor"*,
> which ruling 19 requires.

## Context

### The two rulings, and the gap between them and the code

**Ruling 14, 2026-08-31**, in the owner's words: *"najpierw włączyć ujemne
saldo"* — enable the negative balance first, before ADR 0081's partial fill
(ruling 9). **Ruling 10, the same day**, set the loan's terms at **25% diversion
/ 15% fee / 45 days**.

Both are sequencing-and-magnitude rulings against
[ADR 0075](./0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
decision 2, which is **Accepted**. What this ADR exists for is that acting on
them needs one fact nobody has established and one decision nobody has taken.

**What the code does today, each verified at the cited line rather than
remembered:**

1. `Treasury.setOverdraftFloor` (`src/simulation/economy/treasury.ts:167`) has
   **no caller in `src/`** — `grep -rn 'setOverdraftFloor' src/` returns the
   definition alone. The floor defaults to `0`
   (`src/simulation/economy/treasury.ts:143`), so no shipped session can go a
   minor unit under water.
2. **`LoanBook.draw` does not open the floor.** It calls
   `this.treasury.credit(principalMinorUnits)`
   (`src/simulation/economy/loans.ts:184`) — it hands the prison *money*. It
   never touches the floor, and neither does anything else in `loans.ts`.
3. `LoanBook` is built only when `options.loanTerms !== undefined`
   (`src/simulation/runtime/new-session.ts:794`), and nothing in `src/` passes
   `loanTerms`, so **no session has a `LoanBook` at all**.
4. `LoanTerms` has **four** members
   (`src/simulation/economy/loans.ts:74-100`):
   `diversionRateBasisPoints`, `feeRateBasisPoints`, `maximumDurationDays` and
   `escalatedDiversionRateBasisPoints`. Ruling 10 supplied three numbers. The
   fourth was never put to the owner.
5. `grep -rn 'loan' src/content/default-locale-en.ts` returns nothing: there is
   no player-facing copy for a loan anywhere.
6. [ADR 0017](./0017-money-primary-resource-model.md) decision 5 reserves the
   loan's magnitudes to [#29](https://github.com/matmaxalez/lockstate/issues/29),
   and `treasury.ts` repeats that about the floor in the words *"Not a chosen
   magnitude."*

### The finding: an accepted decision and the code disagree about what the floor is

`treasury.ts`'s own docblock says the floor **is** ADR 0075 decision 2's
*"accrual cap"*:

> The floor is ADR 0075 decision 2's *"accrual cap"*, expressed as the one
> number that decides how far under water a prison can go

**It is not.** Decision 2's sentence, quoted in full, is about a different
quantity:

> **An accrual cap**, because interest against a negative balance can otherwise
> escalate without limit, with a restructuring path that is painful but
> available.

An accrual cap bounds **what the debt grows to**. The overdraft floor bounds
**what a prison may spend**. They are different numbers with different units of
meaning, and the difference is not academic: **nothing in this codebase accrues
interest at all.** `LoanBook` applies the fee exactly once, in `draw`
(`src/simulation/economy/loans.ts:178`), and no branch anywhere moves
`outstanding` upward afterwards. So decision 2's accrual cap is **already
satisfied, structurally, by the fixed fee it chose in the same paragraph** — the
total is known at drawdown, which is the mitigation's stated purpose — and the
floor is answering a question decision 2 never asked.

**Which means neither of the two readings of the floor that were on the table is
what the accepted decisions say.** The two were: *the floor is opened by a loan*
(so the debt is the only route under zero), and *the floor is a standing
overdraft any prison has* (so it is a bigger opening balance with a different
name). Against the corpus:

- **"Opened by a loan" has no textual support.** Decision 2 gives the loan one
  job — *"the loan is not a nice-to-have beside the ladder. It is what keeps
  decision 8 honest"* — and that job is the way back **up**, out of a debt. It
  never says a loan is what lets a prison spend down. `LoanBook.draw` implements
  exactly what the ruling describes and nothing more.
- **"A standing overdraft" is what decision 2's plain text says** — *"The
  balance may go negative"*, with no gate named — but it puts the floor in
  direct conflict with the ladder it is supposed to serve.
  [ADR 0017](./0017-money-primary-resource-model.md) decision 8 reads: *"At a
  negative balance the state stops paying for discretionary things in a defined
  order"*. So in that ladder a negative balance is the **precondition** for
  refusing discretionary spends — and `Treasury.canAfford` is one comparison
  applied to every spend, so an open floor makes the ladder's first two rungs
  (*deliveries refused, construction halted*) unreachable until the room is
  exhausted. The ladder runs backwards.

### And a third document says the balance must not go negative at all

[ADR 0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md) decision 1, in
its own words:

> **The balance stays floored at zero.** The five validators above stand, and
> `Treasury` is not given a signed balance, an overdraft or a loan.

ADR 0049 is **Proposed** and ADR 0075 is **Accepted**, so the authority is not
in doubt — but **ADR 0075 decision 2 never mentions ADR 0049, arrears, or the
argument it would have to overturn.** `grep -n '0049\|arrears' ` over ADR 0075
returns its renumbering pre-commit and one line about persistence. The argument
it does not answer is structural:

> A treasury that could overdraw would pay the wages in full out of debt, so
> rung 3 would never be reached and the bottom of ADR 0017's own ladder would be
> unreachable in exactly the way it is unreachable today, for a new reason.

**That argument is false of the code as it stands, and the measurement is the
useful part of this ADR.** `PayrollSystem.update` bounds the day's payment by
`Math.min(due, this.treasury.balanceMinorUnits)`
(`src/simulation/economy/payroll.ts:230`) — by the **balance**, not by what
`Treasury.spend` would allow. So the payroll ignores the floor entirely, and
rung 3 survives an open floor untouched. Measured, with a thousand minor units
of room standing open
(`tests/integration/economy-negative-balance-readers.test.ts`):

| balance before payday | floor | outcome |
| --- | --- | --- |
| 30 | −1,000 | balance 0, arrears 50 — the room is not touched |
| −200 | −1,000 | balance −200, arrears 80 — nothing is paid and nothing deepens |

**So the conflict between ADR 0049 and ADR 0075 decision 2 is smaller than
either document thinks, and what survives of it is the important half:** with a
floor open, the payroll still cannot take a prison under water, so **the only
thing that can is a discretionary spend the player chose** — which is precisely
what ADR 0017 decision 8's ladder says should be refused first. `payroll.ts`'s
docblock also still claims that *"the four non-negative validators on `Treasury`
and the `nonnegative()` on the save schema are left standing rather than
relaxed"*, which stopped being true when ADR 0075 decision 2 landed; that
sentence is corrected on this branch in both directions.

## The measurements

### (b) The floor's magnitude is not determined by the ruled terms — it is determined by a content price

`scripts/report-loan-recovery-pricing.mjs` section 9 (added on this branch)
plays out of ADR 0075's locked position through the real command router with
**no loan of any kind** — only `setOverdraftFloor` open — and sweeps the room.
Every figure is a real kernel run at `DAY_LENGTH_TICKS` 2,400.

| queue cancelled first | overdraft room | capacity | housed on day | deepest balance | final balance |
| --- | --- | --- | --- | --- | --- |
| yes | 0 | 0 | — | 40 | 40 |
| yes | 65 | 0 | — | −25 | −25 |
| yes | **89** | 0 | — | −25 | −25 |
| yes | **90** | 1 | 1.63 | −90 | 21,835 |
| yes | 155 | 2 | 1.63 | −155 | 43,955 |
| yes | 220 | 3 | 1.64 | −220 | 30,975 |
| yes | **285** | 4 | 1.64 | −285 | 36,895 |
| yes | 400 … 1,500 | 4 | 1.64 | −285 | 36,895 |
| no | 0 … 400 | 0 | — | −25 | −25 |
| no | 1,040 | 0 | — | −1,000 | −1,000 |
| no | **1,129** | 0 | — | −1,065 | −1,065 |
| no | **1,130** | 1 | 1.63 | −1,130 | 20,990 |

**Every boundary in that table is `65n − 40`, and that is the finding.**
`door-wooden` and `bed-wooden` each require one `item.wood-plank`
(`src/simulation/construction/definition.ts:142`, `:180`) at **65**
(`src/content/procurement-catalog.ts:101`); the locked prison holds **40**. So a
door and one bed is `130 − 40 = 90`; four beds and a door is `325 − 40 = 285`,
which is where the room **saturates** — every value above it changes nothing at
all. With the thirteen unfunded wall orders left standing,
`ConstructionSystem.procureQueuedMaterials`
(`src/simulation/construction/system.ts:988`), called from its own scheduled
`update` (`src/simulation/construction/system.ts:868`), spends the standing
**1,040** first, so the boundary moves to `1,040 + 90 = 1,130`, and at exactly
1,040 the prison spends the whole room on wall nobody is watching and ends at
−1,000 with no capacity — the same trap the loan showed at a principal of 1,000
in `docs/research/2026-08-30-pricing-the-way-out.md` §4, reached with no loan.

**Ruling 10's three numbers do not constrain this in any direction.** 25%, 15%
and 45 days are properties of a debt's repayment; the floor is a property of
what a prison is allowed to buy. A floor derived the honest way — from the price
of a plank and from the standing build-queue shortfall — is **exactly the
coupling ADR 0075 rejected by name** in its own "considered and not taken":

> **A threshold backstop keyed to the price of a plank** … Not taken. It targets
> ECON-002 exactly and nothing else, which is its whole problem: it is a rule
> about one content price wired into the treasury.

So there is no derivation of the floor that is both correct and permitted by ADR
0075. That is the answer, and it is why this ADR proposes no floor magnitude.

### (c) What the escalated diversion rate has to be to be worth anything

The fourth member of `LoanTerms` was never put to the owner. Measured against
the real `LoanBook` and the real `StateIncomeSystem` over real ticks, at ruling
10's terms (25% / 15% / 45 days), sweeping the escalated rate. Income is 180 a
prisoner-day, not 300: `stateIncomeForPrisonerDay` withholds 40 per unmet need
(`src/simulation/economy/income.ts:411`) and a bare cell leaves three unmet
(`docs/research/2026-08-30-pricing-the-way-out.md` §2a).

**Corrected 2026-09-03, and the paragraph above is kept because it is the tree
the sweep below was measured on.** The withheld share is `0` while the owner
plays and judges difficulty — their ruling, in their words, is recorded in
[ADR 0064](./0064-what-an-unmet-need-costs-a-prison.md)'s dated amendment of
that date and in `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`'s own
docblock. So **the "Income is 180 a prisoner-day, not 300" premise reads 300
again**, and a bare cell's three unmet needs cost the prison nothing. Two
consequences for what follows, both stated rather than re-measured, because
re-running the sweep is a separate piece of work and this correction does not
pretend to have done it:

- **Every figure in this subsection is a lower bound on the inflow and
  therefore an upper bound on how long the escalated step takes to fire.** At
  300 a prisoner-day rather than 180 the debt clears faster, so the principals
  quoted below (`P > 1,761` at one occupied place, `P > 7,043` at a full cell)
  are the *hardest* case for the step, not the current one.
- **The `src/simulation/economy/income.ts:411` anchor is stale in the way
  `docs/AGENT_WORKFLOW.md` §4 warns about**, and the reason is the change that
  suspended the rate rather than anything about this ADR: the withheld term now
  lives in `stateIncomeForPrisonerDayAt`, which
  `stateIncomeForPrisonerDay` calls, and the line number moved with it. Cited
  by symbol here rather than re-numbered, for §4's reason — a second number
  rots on the next edit above it.

**The step does not fire at all below a principal the ruled 45 days make large.**
At 25% of a 180-a-day inflow the debt clears in `1.15P / 45` days, so day 45 is
reached only when `P > 1,761`; with a full cell at 720 a day it takes
`P > 7,043`. Measured: at one occupied place a principal of 1,500 never
escalates at **any** escalated rate, and 2,000 escalates on day 45.

**What the step is worth, at one occupied place:**

| escalated | P = 2,000 (owed 2,300) | P = 5,000 (owed 5,750) | P = 10,000 (owed 11,500) |
| --- | --- | --- | --- |
| 25% (no step) | clears day 52 | clears day 128 | clears day 256 |
| 26% | 51 (−1) | 126 (−2) | 251 (−5) |
| 30% | 51 (−1) | 114 (−14) | 221 (−35) |
| 35% | 50 (−2) | 105 (−23) | 196 (−60) |
| **45%** | 49 (−3) | **91 (−37)** | 162 (−94) |
| **50%** | 49 (−3) | **87 (−41)** | 151 (−105) |
| 100% | 47 (−5) | 66 (−62) | 98 (−158) |

**Below about 30% the step is decoration**: at 26% it removes 2 days of a
128-day tail, which is 1.6% and is not a mitigation of anything. Two values have
a stated rule behind them rather than a feel, and this ADR proposes the second
while recording the first:

- **45% (4,500 bp)** is `docs/research/2026-08-30-pricing-the-way-out.md`'s
  candidate C, already priced, and already the value two test files use as a
  probe. It cuts the 83 remaining days to 46 — a factor of **1.8**.
- **50% (5,000 bp)** is *"the diversion rate doubles"*, which is the simplest
  rule that can be stated to a player in one clause, and it is the value at
  which the step **exactly halves the remaining repayment time**: 83 days
  becomes 42. Measured, not derived on paper.

Two defensible values is not one, so **this ADR proposes and does not ship**.
ADR 0017 decision 5 reserves the magnitude to #29 in any case.

### (d) What breaks when the balance is negative

Every reader of the balance was swept and each one driven headless in
`tests/integration/economy-negative-balance-readers.test.ts`.

**One thing breaks, and it breaks completely.**
`statusCountsSchema.treasuryMinorUnits` is `countSchema`, which is
`z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)`
(`src/simulation/protocol/types.ts:561`, `:940`), inside a `.strict()` object.
So a prison **one minor unit** under water publishes a
`simulation/status-counts` message the main thread's decoder refuses with
`invalid-payload` at path `payload.counts.treasuryMinorUnits`. The counts block
carries fifteen other figures, so what a player would see is not a funds chip
showing a minus — **it is the whole status strip freezing**, which is the
*"invisible stall"* ADR 0017 decision 8 names as the failure to avoid. The
field's own comment states the premise that ADR 0075 decision 2 falsified
without the schema moving:

> `countSchema`'s floor of 0 is the treasury's own invariant, not an assumption
> made here — `Treasury.spend` refuses rather than overdrawing, so a negative
> balance is unreachable, and a schema that admitted one would be describing a
> state the simulation cannot be in.

**Everything else holds.**

| reader | with a negative balance |
| --- | --- |
| `status-strip-projection.ts:718` | publishes it verbatim; no clamp, no default |
| `projectStatusMetrics` `funds` chip | carries it through, no tone, no badge |
| `formatNumber('en', -4000)` | `-4,000` — **no new player-visible string is needed** |
| `PayrollSystem.update` | pays nothing, arrears the bill, does not deepen the balance |
| `ProcurementSystem.purchase`, `StaffHiringService.hire` | route through `Treasury.spend`, so both are floor-aware already |
| `JustInTimeMaterialsService` / `shortfallMinorUnits` | a sum of item costs; independent of the balance |
| save schema `treasury.balanceMinorUnits` | `z.number().int().safe()`; already signed, already proven both ways by `tests/migrations/save-v5-negative-balance.test.ts` |
| determinism fingerprint | reads no economy surface at all (`#697`); the save checksum is the surface that sees money |

**One divergence rather than a break, and it is the interface's:**
`src/main.ts:2428` and `:2607` pre-check `total > viewModel.counts.treasuryMinorUnits`
before submitting a purchase or a hire. Those comparisons are against a floor of
zero, so with a floor open the interface would refuse presses the simulation
would accept. It is not reachable from `pnpm test` — `vitest.config.ts` sets
`environment: 'node'` and `main.ts` touches `document` — so it is named here
rather than pinned, and the fix is a pure function the way `orderPrisonsForDisplay`
was.

### (e) No `SAVE_SCHEMA_VERSION` bump is required, in either reading

`docs/PERSISTENCE.md`'s three conditions under *"Adding an optional field
without a version bump"* are all met by either shape:

- **A standing floor derived from a constant needs no field at all.**
  `restoreSimulationRuntime` builds its runtime through
  `createNewSimulationRuntime` (`src/simulation/runtime/restore-session.ts:375`),
  so a floor applied where the `Treasury` is constructed
  (`src/simulation/runtime/new-session.ts:683`) is applied on the new-session and
  the restore path alike. Nothing to persist, nothing to migrate.
- **A loan-opened floor needs two optional fields and still no bump.** Absence
  is unambiguous *as a fact about the corpus* — no build that could write a V5
  save had a `LoanBook` at all, because nothing passes `loanTerms` — which is
  the same ground `masterSeed` and `simulation.economy.payroll` stand on. The
  cost is the one those two record: an *older* build reading a save that carries
  the key refuses it `invalid-shape` where a V6 would have said
  `unsupported-version`.

So the save format is **not** the reason to hesitate, and nothing here needs the
owner's persistence exclusion. `tests/determinism/loan-ledger-restore-boundary.test.ts`
already fails the moment a ledger starts surviving a reload, which is the gate
whoever adds the section comes through.

## Decision

**Four decisions, and the first is the one that unblocks ruling 14.**

### 1. The overdraft floor is a **credit limit on discretionary spending**, not ADR 0075 decision 2's accrual cap

`Treasury.overdraftFloorMinorUnits` decides how much a prison may spend that it
does not have. Decision 2's accrual cap is a bound on how far a *debt* may grow,
and `LoanBook`'s once-only fee already satisfies it: `outstanding` is set in
`draw` and never rises. The two are separate mechanisms answering separate
questions, and `treasury.ts` conflating them is corrected on this branch in both
directions rather than overwritten, because the conflation is the reason
`setOverdraftFloor` looks like it has an obvious caller and has none.

**Consequence, stated because it is the whole point:** ADR 0075 decision 2 does
**not** decide what the floor should be, and neither does ruling 10. There is no
approved decision anywhere in this corpus that says a prison may spend money it
does not have.

### 2. Ruling 14 needs one more ruling before it can be executed: **which mechanism takes the balance below zero**

The owner ruled the *order* of two pieces of work. The measurement above says
the earlier piece is not one piece but a choice between three, and they are three
different games:

- **A. A standing overdraft every prison has.** One constant, applied where the
  `Treasury` is built; no save field; the shortest path to ruling 14. **Cost:**
  it is an opening balance under a different name, and it inverts ADR 0017
  decision 8's ladder — a prison refuses no delivery and halts no construction
  until the room is gone, so the first two rungs fire *after* the third rather
  than before it. The magnitude has no derivation that ADR 0075 permits (see
  (b)).
- **B. The floor is opened by a drawdown, to the size of the loan.** Keeps the
  debt as the only route under zero, so decision 8's ladder is untouched for a
  prison that has not borrowed. **Cost:** it is a mechanism ADR 0075 decision 2
  does not describe, it doubles the loan's value (the principal in cash *and*
  the same amount of room), and it needs the persistence section (e) prices.
  It also needs a player-facing control, a refusal sentence and a readout, all
  of which are the owner's copy under `AGENTS.md`.
- **C. Neither: the balance stays floored and ADR 0049's arrears carry the
  debt.** This is what the code does today and what ADR 0049 decision 1 says.
  **Cost:** ADR 0075 decision 2 is Accepted and says the opposite, so this needs
  decision 2 narrowed rather than implemented — the honest form of which is that
  *"the balance may go negative"* was ruled without the ladder's ordering in
  front of the ruler.

**RULED: A — a standing overdraft every prison has** (#703, 2026-08-31, on this
document's own question). The paragraphs above are kept as written, including the
recommendation this section carried, because a ruling is only legible against
what it chose over and because the recommendation's cost is now the ruling's
cost.

**Recommended was B, with the floor equal to the outstanding balance of the loan
that opened it**, on the single ground that it is the only one of the three that
keeps ADR 0017 decision 8's ladder in the order that ADR says it runs in. A
prison that has borrowed nothing behaves exactly as it does today, to the minor
unit; a prison that has borrowed has bought the right to overspend and can be
told so. **That was a recommendation and not a decision**, because the mechanism
is not in decision 2's text and inventing it in implementation code is what
`CLAUDE.md` forbids.

**RULED AGAIN, on the amendment this section says is owed: ruling 19 of
2026-08-31.** *"Dać szczeblom własne progi wewnątrz debetu"* — the rungs get
their own thresholds inside the overdraft, at −1,250 (deliveries), −2,000
(construction) and −2,500 (wages, the floor). **It is neither of the two
remedies the paragraph below offers**, which are kept because a ruling is only
legible against what it chose over: the ladder's order is *not* amended and
decision 8 is *not* narrowed. Both stand, and three thresholds are what make the
order expressible where one comparison could not. Drafted as
[ADR 0017](./0017-money-primary-resource-model.md)'s "Amendment, 2026-09-01",
**accepted by the owner on 2026-09-01**. This line read *"Proposed and awaiting
the owner's signature"* until then.

**And the paragraph below said in advance what the ruling settles**, which is
why it is quoted rather than deleted: *"if the owner's `tylko minus i pożyczki`
means the minus is a facility the player has from the start rather than one
borrowing opens, A is right and **the ladder ordering in ADR 0017 decision 8 is
what needs amending**."* The ruling is that reading. **So the amendment is owed,
and it is the owner's to sign rather than this document's to take**: ADR 0017
decision 8 states that at a negative balance the state stops paying for
discretionary things — a sequence of three rungs — and `canAfford` is one
comparison over every spend, so with a standing floor open the first two rungs
cannot fire until the room is gone. Either the ladder's order is amended to say
so, or decision 8 is narrowed to a prison that has spent its overdraft. **This
document does not choose between those two**; it records that one of them is now
required and that the code cannot express the ladder faithfully until it is
taken.

**The magnitude, which reading A leaves open and (b) shows has no permitted
derivation.** (b) measures every boundary at `65n − 40` — a door and a bed are
one `item.wood-plank` each at 65, and the locked prison holds 40 — which is
exactly the *"threshold backstop keyed to the price of a plank"* ADR 0075
rejects by name. So a floor read off the measurement is a content price wearing
a decision's clothes. **Proposed instead as a rule rather than a lookup: the
floor is one tenth of the opening grant, `-2_500`**, derived from
`TREASURY_STARTING_BALANCE_MINOR_UNITS` rather than from any catalogue entry.
Three things recommend it and one warns against it:

- It clears the measured worst case with margin. (b) measures the deepest a
  locked prison goes to house anybody at **−1,130** with its material queue
  standing and **−90** with the queue cancelled, saturating at **−285**.
- It moves when the opening grant moves, so it cannot rot against a price
  change the way a plank-keyed number would.
- It is a sentence a player could be told: the state carries you up to a tenth
  of what it gave you.
- **It is not measured above −1,500.** (b)'s sweep records *"unchanged up to
  1,500"* and stops there, so what a prison does between −1,500 and −2,500 —
  in particular whether payroll, procurement and the construction queue stay
  bounded — is a claim nobody has checked. **The number is a hypothesis until
  that sweep is run**, and whoever implements this must run it and report if
  −2,500 is wrong rather than shipping it on this paragraph's authority.

### 3. `escalatedDiversionRateBasisPoints` is proposed at **5,000 bp (50%)**, and is not set here

Ruled terms 25% / 15% / 45 days leave the fourth member open. 50% is *"the
diversion doubles"* and halves the remaining repayment time exactly (83 days to
42, measured). 45% is the priced alternative already carried by candidate C and
by two test files. Anything at or below 30% is decoration: 2 days off a 128-day
tail at 26%.

**RULED: 5,000 bp (50%)** (#703, 2026-08-31). The owner chose *"the diversion
doubles"* over the priced 45% alternative. The sentence above is kept because
the argument between the two is what makes 50% a rule rather than a number: it
halves the remaining repayment time exactly, which is a thing that can be said
in one clause before a player borrows.

**The paragraph that stood here said it was not shipped as a constant**, on the
ground that ADR 0017 decision 5 reserves the magnitude to #29 and that two
values were defensible rather than one. The first half still holds and the
second no longer does: the owner has chosen, so the reservation is satisfied by
a ruling rather than bypassed. **The constant is still not set by this document**
— the loan remains disabled under ruling 10, so 50% is a recorded magnitude
waiting on the loan being enabled, not a wiring task.

### 4. Two preconditions, and neither is optional

- **`statusCountsSchema.treasuryMinorUnits` must admit a negative integer before
  any floor is opened in production.** Until it does, the first prison to go
  under water stops publishing its prisoner count, its coverage, its incidents
  and its arrears as well as its balance. This is a one-line widening in
  `src/simulation/protocol/types.ts` plus its comment, and it is left undone on
  this branch only because another agent holds that file this pass.
- **ADR 0049 decision 1 and ADR 0075 decision 2 must stop contradicting each
  other in the record.** Whichever of A/B/C is ruled, one of the two documents
  says the opposite and needs a superseded clause naming the other.

## Consequences

- **Ruling 14 is not blocked on work; it is blocked on a decision**, and the
  decision is smaller than it looks: one sentence saying whether the minus is a
  standing facility or something borrowing opens.
- **The measurement instrument now exists and is committed.**
  `scripts/report-loan-recovery-pricing.mjs` section 9 re-derives the floor
  boundaries in a single run, and
  `tests/integration/economy-negative-balance-readers.test.ts` characterises
  every reader — so the schema test goes red the moment somebody widens
  `countSchema`, which sends them here.
- **No player-visible string is needed for the balance itself.**
  `Intl.NumberFormat` renders the sign and the `funds` chip already carries the
  value untouched. A *loan* still needs the control, the refusal and the readout
  ADR 0075 decision 2 names, and those stay the owner's.
- **Nothing here touches the save format**, so the persistence exclusion in
  `AGENTS.md` is not engaged.

## What was considered and not taken

- **Deriving the floor from ruling 10's terms.** Attempted and abandoned: the
  three ruled numbers describe a repayment, and the floor's boundaries are
  `65n − 40` — a content price and a build-queue shortfall. Every derivation
  reaches the coupling ADR 0075 rejected by name.
- **Opening the floor to `−1,130` so the lock dissolves without the player
  knowing to cancel thirteen orders.** Measured to work, and not proposed: it
  sizes a treasury constant on the exact shape of one reproduction, and a
  different drag produces a different shortfall. If the standing shortfall is
  what should be covered, the honest form is ADR 0081's partial fill, which is
  ruling 9 and the piece ruling 14 sequences *after* this one.
- **Making the payroll draw on the floor.** Rejected. `Math.min(due, balance)`
  is what keeps ADR 0017 decision 8's third rung reachable, and the measurement
  above shows it survives an open floor unchanged. Changing it would delete the
  rung for the reason ADR 0049 predicted, and ADR 0049's argument is wrong only
  about what the code *does*, not about what that change would cost.

  **Overruled by the owner's ruling 19 of 2026-08-31, and the entry is kept
  because it was right under the premise it was written under.** Ruling 19 puts
  decision 8's third rung *at* the floor — wages unpaid below −2,500, which is
  wages paid down to it — so `PayrollSystem` now bounds the day by
  `Math.min(due, balance - floorFor('wages'))` and does draw on the overdraft.
  The rejection assumed the floor was a single number shared with every other
  spend, where a drawing payroll would have had no threshold left of its own;
  with three thresholds the draw is what puts the rung where the owner put it.
  See ADR 0017's "Amendment, 2026-09-01" §3e.
- **Widening `countSchema` itself** rather than the one field that needs it. Not
  taken: fourteen other members are counts whose floor of zero is a real
  invariant, and a shared schema loosened for one of them stops checking the
  rest.

## The weakest claim, and what would change my mind

**That decision 2's *"accrual cap"* is not the overdraft floor** rests on
reading one sentence of an accepted ADR against the code, and the owner wrote
neither. If *"accrual cap"* was meant loosely — "a bound on how far this can go"
rather than "a bound on accruing interest" — then `treasury.ts` is right, the
floor is decision 2's, and reading A of section (a) wins with a magnitude still
undecided. One sentence from the owner settles it, and no measurement in this
document can.

**Second weakest:** the escalation table is measured at one and four occupied
places with three unmet needs. A prison that keeps its needs met earns 300 a
prisoner-day and clears every principal sooner, which moves the escalation
threshold further out — so the step fires for an even narrower band of players
than the table shows, and 50% is if anything under-argued rather than over.
