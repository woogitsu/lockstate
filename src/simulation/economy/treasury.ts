/**
 * The prison's money.
 *
 * Issue #96's decision, which needs no approval and is the owner's own:
 * **money is the primary resource and materials are procured.** There is no
 * gathering and no production; a wall exists because somebody paid for the
 * bricks and they were delivered.
 *
 * ## What this deliberately does not decide
 *
 * ADR 0017 is Accepted, and its decision 8 answers something this class still
 * deliberately does not implement. The omission is the point, and it is an
 * omission against a settled answer rather than against an open question:
 *
 * - **The balance still cannot go negative, and that is now a decision rather
 *   than a gap.** This paragraph used to say: *"Decision 8 settles that a
 *   negative balance should degrade the prison in a defined order rather than
 *   end the run, and that ladder is unbuilt — and still unreachable, because
 *   `spend` refuses rather than overdrawing and nothing debits the balance on a
 *   schedule, so no negative balance can occur for it to respond to. […] What
 *   makes decision 8 reachable is a recurring *charge* the player cannot
 *   decline — wages are the obvious one, and `wageBand` exists in content with
 *   no payroll behind it."*
 *
 *   The charge exists: `src/simulation/economy/payroll.ts` bills every
 *   employee's authored `wageBand.minPerDay` at the end of every in-game day
 *   ([ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 *   step 3). What the old sentence got wrong is the *first* clause: decision 8
 *   settles the ladder, and the ladder is what a **floored** balance produces.
 *   Its three rungs — *"deliveries refused first, then construction halted, then
 *   staff unpaid"* — are what one balance running out already does, in that
 *   order, because every discretionary spend is refused before the undeclinable
 *   one is. A treasury that could overdraw would pay the wages in full out of
 *   debt and the third rung would never be reached, so the four non-negative
 *   validators here are load-bearing for decision 8 rather than in its way.
 *
 *   What a prison owes therefore lives beside the balance rather than inside
 *   it, as `PayrollSystem`'s arrears
 *   ([ADR 0049](../../../docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md),
 *   which records that choice, its alternatives and the 30-day measurement
 *   that sized it).
 *
 * ## The paragraph above is superseded, and it is kept because its argument is
 * the reason anybody would have hesitated
 *
 * [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 2 is Accepted, and it says in its own words what has to happen to
 * this file: *"`Treasury.spend` refuses rather than overdrawing … Building
 * this means changing that."* It also says what to do with the reasoning
 * above rather than deleting it — *"the validators were defending decision 8
 * by preventing the debt; under this ruling decision 8 is defended by the
 * loan instead"* — so both readings stand here, marked, and the second is the
 * one in force.
 *
 * **What actually changed, and what deliberately did not:**
 *
 * - **A balance may be negative.** The constructor, `restore` and the save
 *   schema's `treasury.balanceMinorUnits` all admitted only a non-negative
 *   integer, and each of the three was the same invariant written out three
 *   times. That invariant is gone: a negative balance is an ordinary state a
 *   prison can be in and a save can carry.
 * - **`spend` still refuses by default, and that is not a hedge.** It refuses
 *   what would take the balance below `overdraftFloorMinorUnits`, and that
 *   floor is `0` unless something sets it — so a session that has borrowed
 *   nothing behaves exactly as it did before, to the minor unit. **What the
 *   floor should be is not decided here**: ADR 0017 decision 5 reserves it to
 *   [#29](https://github.com/matmaxalez/lockstate/issues/29), with the rest
 *   of the loan's magnitudes.
 *
 *   **This bullet said the floor *is* ADR 0075 decision 2's *"accrual cap"*,
 *   "expressed as the one number that decides how far under water a prison can
 *   go", and that identification is wrong.** Both directions are kept because
 *   the mistake is the reason `setOverdraftFloor` reads as though it has an
 *   obvious caller and has none. Decision 2's sentence is about a different
 *   quantity: *"An accrual cap, because interest against a negative balance can
 *   otherwise escalate without limit"* — a bound on **what a debt grows to**,
 *   where this is a bound on **what a prison may spend**. And the accrual cap
 *   is already satisfied without this field: `LoanBook` applies its fee exactly
 *   once, in `draw`, and no branch there raises `outstanding` afterwards, which
 *   is the *"fixed fee rather than compounding interest"* decision 2 chose in
 *   the same paragraph. So no accepted decision in this corpus says how far
 *   under water a prison may spend, or that it may at all —
 *   [ADR 0083](../../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 *   is where that is put to the owner, with the measurement that the floor's
 *   boundaries come out as `65n - 40`: the price of a plank, not a property of
 *   the loan's terms.
 * - **The way back up is `LoanBook`** (`./loans.ts`), which is the instrument
 *   decision 2 makes load-bearing: *"the loan is not a nice-to-have beside
 *   the ladder. It is what keeps decision 8 honest."* **Up, and this word was
 *   "out" until 2026-08-31**, which read as though a drawdown were what opens
 *   the room below zero. It is not: `LoanBook.draw` calls `credit`, so a loan
 *   hands the prison *money* and touches no floor. Whether it *should* open one
 *   is ADR 0083's decision 2, and it is the owner's.
 *
 * ## Integer minor units, and why that is not a formatting choice
 *
 * The balance is authoritative simulation state and a save carries it. A
 * fractional currency would put a float there, and floating-point addition is
 * not associative — two runs that applied the same purchases in a different
 * order could disagree. `docs/DETERMINISM.md` states its rule for simulation
 * state without an exception for money.
 *
 * **This paragraph used to add *"and `docs/DETERMINISM.md`'s fingerprint
 * hashes it"*, and that half was false when it was written.** Measured
 * 2026-08-31: `tests/helpers/determinism-state.ts`'s `fullRuntimeState` reads
 * no economy surface at all — neither the word `treasury` nor `balance` occurs
 * in that file — so no runtime fingerprint has ever hashed the balance, and
 * `#697` pins that with two sessions differing only in balance hashing
 * identically as runtimes. **The conclusion is unaffected and is the half that
 * mattered**: the surface that *does* see money is the save checksum, which
 * `#697` pins in the other direction, and the rule about simulation state
 * holds on its own without a fingerprint to appeal to. The false clause is
 * marked rather than deleted because
 * [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)'s
 * Consequences carry the same premise — *"the balance a fingerprint hashes"* —
 * and a reader meeting that sentence needs to find this one.
 *
 * "Minor units" rather than a named currency because naming one is a product
 * decision this slice does not need. The HUD will have to choose a symbol and
 * a locale format eventually; nothing in the simulation cares.
 */

/**
 * What a new prison starts with.
 *
 * **No longer a placeholder: 25,000 is the owner's decision, and the decision
 * was to leave it where it was.** It used to say here that this figure should
 * be replaced the moment a real income line existed. That line landed with
 * #29, the question was put, and the answer was to keep 25,000 — so this
 * constant is now a chosen opening balance rather than a number waiting to be
 * chosen. It is still not an income policy; a starting balance says what you
 * begin with, never what the state pays you for, and ADR 0017 decision 5
 * keeps both out of the architecture record and in #29.
 *
 * What it buys, in the game's own units, so the figure can be argued with
 * rather than merely trusted: at the shipped catalog prices it is a few
 * hundred bricks, or roughly 22 standalone 2×3 cells' worth of wall and door
 * at 1,105 each — and it is 83 prisoner-days of income at 300
 * (`STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS`). That second reading is the
 * one #29 added: the opening balance is now expressible as a number of days
 * of running the place, which is what makes "keep it" a judgement rather than
 * an omission.
 */
export const TREASURY_STARTING_BALANCE_MINOR_UNITS = 25_000;

/**
 * How far under water every prison may go, as a standing facility rather than
 * something it has to ask for.
 *
 * **#703 ruling A, 2026-08-31, in the owner's words *"tylko minus i pożyczki"*
 * read as a standing overdraft** — chosen over the floor being opened by a
 * drawdown and over the balance staying floored at zero.
 * [ADR 0083](../../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * §2 carries all three readings with what each costs; this is the one that was
 * taken.
 *
 * **One tenth of the opening grant, and the derivation is the point.** It is
 * `-TREASURY_STARTING_BALANCE_MINOR_UNITS / 10` and not a literal, so it moves
 * when the grant moves and cannot rot against a price change. It is
 * deliberately *not* read off any content price: every boundary the sweep
 * measures is `65n − 40` — a plank at 65, and the 40 a locked prison holds —
 * and ADR 0075's "considered and not taken" rejects *"a threshold backstop
 * keyed to the price of a plank"* by name.
 *
 * **What it clears, measured rather than argued.**
 * `scripts/report-loan-recovery-pricing.mjs` §9 and §10 play ADR 0075's locked
 * position through the real command router with no loan of any kind, only this
 * floor open. Every figure is a real kernel run at `DAY_LENGTH_TICKS` 2,400:
 *
 * - The deepest a locked prison goes to house anybody is **−1,130** with its
 *   thirteen unfunded wall orders standing, and **−90** with them cancelled,
 *   saturating at **−285**. So 2,500 clears the worst measured case by 2.2x.
 * - §10a carries the sweep from 1,500 — where §9 stopped, and where ADR 0083
 *   admitted the number was a hypothesis — to 25,000, the whole grant. The room
 *   a prison *uses* is identical at every one of those: 285 cancelled, 1,130
 *   standing. Offering more buys nothing.
 * - `floor breaches` is 0 in every run of both sections, which is
 *   `Treasury.canAfford` being the single comparison every spend passes.
 * - §10b is the only shape in that instrument where `PayrollSystem` meets an
 *   open floor. It never draws on it: `Math.min(due, balance)` bounds the day's
 *   payment by the *balance*, so arrears is the sink and the room stays unused.
 *
 * **What does scale with this number, and it is the reason not to raise it**
 * (§10c). `ConstructionSystem.procureQueuedMaterials` spends with no press, so
 * a *standing build queue* will draw on this facility: a twenty-order tail
 * costing 1,600 strands a prison at −1,625 with no capacity and no way back.
 * The band of queue sizes that can do that is bounded by this constant — wider
 * at 2,500 than at 1,500, empty at 0 — so the honest reading is that 2,500 is
 * margin over the measured need and not headroom to be spent.
 */
export const TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS = -Math.trunc(TREASURY_STARTING_BALANCE_MINOR_UNITS / 10);

export interface TreasurySnapshot {
  readonly balanceMinorUnits: number;
}

export class Treasury {
  private balance: number;

  /**
   * How far below zero a spend may take the balance, as a non-positive
   * integer. `0` is "not at all", and it makes this class behave exactly as it
   * did before ADR 0075 decision 2.
   *
   * **The default stays `0` and the shipped floor is applied by the composition
   * root, not here.** `createNewSimulationRuntime` calls
   * `setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS)` on the treasury
   * it builds (`src/simulation/runtime/new-session.ts`), so a session has the
   * facility and a bare `new Treasury()` in a test does not — which is what
   * keeps the boundary cases in `tests/unit/economy-treasury.test.ts` about
   * this class rather than about a magnitude somebody may move.
   *
   * **This comment said *"`0` … is what every session has until something opens
   * a facility"*, and said the magnitude and the mechanism were both unchosen.
   * Both halves are kept because they were true for the whole life of this
   * field and because ADR 0083 was written under them, and both expired on
   * 2026-08-31:** #703 ruled the mechanism (a standing overdraft every prison
   * has, reading A) and the magnitude follows from the grant. What survives
   * unchanged is the other correction this comment carries: the floor is **not**
   * ADR 0075 decision 2's *"accrual cap"* — that cap bounds what a debt grows
   * to and `LoanBook`'s once-only fee already satisfies it, while this bounds
   * what a prison may spend. See the class docblock above.
   */
  private floor = 0;

  public constructor(startingBalanceMinorUnits: number = TREASURY_STARTING_BALANCE_MINOR_UNITS) {
    if (!Number.isSafeInteger(startingBalanceMinorUnits)) {
      throw new RangeError('Treasury balance must be a safe integer of minor units.');
    }
    this.balance = startingBalanceMinorUnits;
  }

  public get balanceMinorUnits(): number {
    return this.balance;
  }

  /** See `floor`. A prison with no facility open reports `0`. */
  public get overdraftFloorMinorUnits(): number {
    return this.floor;
  }

  /**
   * Opens (or closes, at `0`) the room this treasury has to go negative in.
   *
   * Non-positive, because a floor above zero would be a *minimum* balance and
   * that is a different mechanic nothing here asks for.
   */
  public setOverdraftFloor(floorMinorUnits: number): void {
    if (!Number.isSafeInteger(floorMinorUnits) || floorMinorUnits > 0) {
      throw new RangeError('An overdraft floor must be a non-positive safe integer of minor units.');
    }
    this.floor = floorMinorUnits;
  }

  /**
   * Whether a spend is affordable.
   *
   * `this.balance - amountMinorUnits >= this.floor` rather than
   * `amountMinorUnits <= this.balance`: with the default floor of `0` the two
   * are the same comparison and the exact-balance boundary
   * (`tests/unit/economy-treasury.test.ts`, #416) is untouched, and with a
   * floor below zero this is the one that lets a prison spend into the room a
   * loan opened.
   */
  public canAfford(amountMinorUnits: number): boolean {
    if (!Number.isSafeInteger(amountMinorUnits) || amountMinorUnits < 0) return false;
    return this.balance - amountMinorUnits >= this.floor;
  }

  /**
   * Spends, or refuses and changes nothing.
   *
   * Returns whether it spent, rather than throwing. A purchase the player
   * cannot afford is an ordinary refusal the interface reports, not an
   * exceptional condition — the same reading `ConstructionSystem.submitOrder`
   * takes of an order on unowned land (#215).
   */
  public spend(amountMinorUnits: number): boolean {
    if (!this.canAfford(amountMinorUnits)) return false;
    this.balance -= amountMinorUnits;
    return true;
  }

  /**
   * Puts money in.
   *
   * Two callers, and only one of them is an income line — the distinction is
   * worth keeping at the method, because this is where a future third caller
   * arrives:
   *
   * - `ProcurementSystem.cancel`, a **refund** of a purchase whose delivery
   *   was cancelled. Not income; it returns money that was already the
   *   prison's.
   * - `StateIncomeSystem.update`, which **is** the income line: ADR 0017
   *   decision 3 on decision 6's basis, once per in-game day, per occupied
   *   place (#29).
   *
   * - `LoanBook.draw`, a **loan drawdown**. Not income either, and ADR 0075
   *   decision 2 requires it to stay distinguishable from income at the
   *   readout: *"a ledger where the operating net is negative while cash
   *   rises is a loan masking a deficit, and the player should be able to see
   *   the difference."*
   *
   * `tests/foundation/documentation-claims-contract.test.ts` enumerates all
   * three against the source, so a fourth caller cannot arrive without this
   * list and `docs/HUD_PROJECTIONS.md` gap 21 being brought with it.
   */
  public credit(amountMinorUnits: number): void {
    if (!Number.isSafeInteger(amountMinorUnits) || amountMinorUnits < 0) {
      throw new RangeError('A credit must be a non-negative safe integer of minor units.');
    }
    if (!Number.isSafeInteger(this.balance + amountMinorUnits)) {
      throw new RangeError('A credit would take the balance past the safe integer range.');
    }
    this.balance += amountMinorUnits;
  }

  public snapshot(): TreasurySnapshot {
    return { balanceMinorUnits: this.balance };
  }

  /**
   * **A restored balance may be negative** since ADR 0075 decision 2, and the
   * loosening is deliberate rather than incidental: a prison that saved while
   * under water must load under water, or a reload is a way out of the debt.
   * The save schema's own validator was widened in the same change, because a
   * disagreement between the two boundaries is a window rather than a
   * stricter check (`src/simulation/protocol/commands.ts` records that
   * reading of a mismatched pair).
   */
  public restore(snapshot: TreasurySnapshot): void {
    if (!Number.isSafeInteger(snapshot.balanceMinorUnits)) {
      throw new RangeError('A restored treasury balance must be a safe integer.');
    }
    this.balance = snapshot.balanceMinorUnits;
  }
}
