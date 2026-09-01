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
 *   than a gap.** **Both this heading and the ADR 0075 correction under it were
 *   overtaken on 2026-08-31: the balance can now go negative in any session,
 *   and the ladder this bullet defends runs backwards. See the last bullet of
 *   the next section for what replaced it.** The paragraph used to say:
 *   *"Decision 8 settles that a
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
 *   **Both halves of that bullet expired on 2026-08-31 and it is kept because
 *   the whole of this file's reasoning was written under them.** #703 ruled
 *   reading A -- a standing overdraft *every* prison has, not one a drawdown
 *   opens -- so `createNewSimulationRuntime` calls `setOverdraftFloor` on the
 *   treasury it builds and there is no longer a session behaving as it did
 *   before. And the floor *is* decided: it is
 *   `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`, one tenth of the opening grant,
 *   which satisfies decision 5's reservation by a ruling rather than bypassing
 *   it. The sentence *"a session that has borrowed nothing behaves exactly as it
 *   did before"* is now true only of a `Treasury` built by hand, which is every
 *   `new Treasury()` in `tests/unit/economy-treasury.test.ts` and nothing in
 *   `src/`.
 *
 *   **This bullet said the floor *is* ADR 0075 decision 2's *"accrual cap"*,
 *   "expressed as the one number that decides how far under water a prison can
 *   go", and that identification is wrong.** Both directions are kept because
 *   the mistake is the reason `setOverdraftFloor` read, for its whole life
 *   before 2026-08-31, as though it had an obvious caller and had none. **It has
 *   one now** -- `createNewSimulationRuntime` -- and the sentence is marked
 *   rather than rewritten because the conflation it explains is what made the
 *   absence look deliberate for as long as it lasted. Decision 2's sentence is about a different
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
 *   was ADR 0083's decision 2, and the owner ruled that it should not: the room
 *   is standing and the loan opens nothing. `LoanBook` is still built only when
 *   `loanTerms` is supplied and nothing in `src/` supplies it, so the way back
 *   up is at present the income line and nothing else.
 * - **And ADR 0017 decision 8's ladder is now inverted, which is owed an
 *   amendment nobody has written.** Decision 8 orders the refusals *"deliveries
 *   refused first, then construction halted, then staff unpaid"*, and the
 *   bullet at the top of this docblock argues at length that a floored balance
 *   produces exactly that order. `canAfford` is **one comparison** over every
 *   spend, so a standing floor moves the first two rungs to the floor while
 *   `PayrollSystem`'s `Math.min(due, balance)` keeps the third at zero: a prison
 *   with wages unpaid still buys deliveries and hires staff for another 2,500.
 *   ADR 0083 §2 records that either the order is amended or decision 8 is
 *   narrowed to a prison that has spent its overdraft, and that choosing between
 *   those is the owner's.
 *   `tests/integration/economy-payroll-loop.test.ts` pins the inversion at both
 *   ends of the facility so the amendment is written against a measurement.
 *
 *   **The amendment is drafted, and this bullet is kept because it is the
 *   record of what was measured before it.** The owner's ruling 19 of
 *   2026-08-31 — *"Dać szczeblom własne progi wewnątrz debetu"* — chose neither
 *   of the two options ADR 0083 §2 named: rather than amending the *order* or
 *   narrowing decision 8 to a prison that has spent its overdraft, it gives the
 *   three rungs their own thresholds **inside** the overdraft, at −1,250,
 *   −2,000 and −2,500. `docs/adr/0017-money-primary-resource-model.md`
 *   ("Amendment, 2026-09-01") drafts it, and it is **Proposed and not
 *   self-approved**: nothing that depends on it may merge before the owner
 *   signs it.
 *
 *   What that costs this file, stated because it reverses something ADR 0083
 *   decided against: `canAfford` is no longer *"one comparison over every
 *   spend"* against a single floor — it takes a `SpendClass` and compares
 *   against that rung's floor — and `PayrollSystem` now draws on the overdraft
 *   down to the floor, which ADR 0083's "considered and not taken" rejected by
 *   name as *"making the payroll draw on the floor"*. That rejection was right
 *   under a single floor, where the draw would have deleted the third rung;
 *   under ruling 19 the third rung *is* the floor, so the draw is what puts the
 *   rung where the owner put it.
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
 *
 * **The conclusion of that paragraph stands and its middle clause does not, so
 * both are kept.** *"Spends with no press"* is what
 * `procureQueuedMaterials` looks like from its scheduled caller, and it is not
 * where the money goes. Measured on `c6cd3e3` by tagging every call to it with
 * whether it came from `ConstructionSystem.update` or from the `PlaceBuildOrder`
 * command handler, across §10c's whole sweep: **the scheduled pass spent 0 in
 * every run** and the presses spent **27,440** over 343 purchases. A press buys
 * the *increment* its own order adds, so a dragged run of forty walls draws on
 * this facility forty times, once per press — which is the same 2,440 §10c
 * reports and is the reason not to raise this number. It is not a queue
 * spending unwatched; it is a gesture that spends more than the player can see
 * it spending, which is a different problem with the same magnitude.
 *
 * **#703 ruling 9 did not move any figure in that table.** Partial fill per
 * order (ADR 0081 Decision 1 and 2) was measured against the same sweep after
 * it landed: every column identical, `floor breaches` still 0, the scheduled
 * pass still spending 0. It cannot spend the residual those runs leave, because
 * 60 of room is short of the 80 a wall costs and an order is funded whole or not
 * at all.
 *
 * **BOTH ZEROES ABOVE ARE PROPERTIES OF §10c'S FIXTURE AND NOT OF THE CODE, AND
 * THEY ARE KEPT BECAUSE THE TABLE THEY DESCRIBE IS REAL.** §10c never gives a
 * prison money *after* its queue is standing, so the press is the only moment
 * money exists in it. Give a prison with a standing queue some income and the
 * scheduled pass does spend it, with no press between the two -- measured, ten
 * wall orders at 80 against a treasury drained to this floor, credited with no
 * command at all:
 *
 * ```
 * credited   0    79    80   240   400   799   800   5,000
 * spent      0     0    80   240   400   720   800     800
 * ```
 *
 * (`tests/integration/construction-just-in-time-materials.test.ts`, *"spends
 * income that arrives after placement, with nothing pressed in between"*.)
 *
 * **What that means for this constant is the sharper version of the paragraph
 * above rather than a new claim.** The queue can only ever take what its own
 * orders cost, so this number does not bound a runaway -- it bounds how much
 * wall a player can place *before* the money exists, and every unit of it will
 * be taken out of income later, with nothing on screen relating the two. That
 * is the "hidden cost" reading of the same 2,500, and it is still a reason not
 * to raise it. What the player is told about it is ADR 0081 open question 2 and
 * is the owner's.
 */
export const TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS = -Math.trunc(TREASURY_STARTING_BALANCE_MINOR_UNITS / 10);

/**
 * **Which rung of ADR 0017 decision 8's insolvency ladder a spend belongs to.**
 *
 * The owner's ruling 19 of 2026-08-31 -- *"Dać szczeblom własne progi wewnątrz
 * debetu"*, give the rungs their own thresholds inside the overdraft -- is
 * drafted as an amendment to
 * [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
 * ("Amendment, 2026-09-01"), **Proposed and awaiting the owner's signature**.
 * This type is what makes the ladder expressible at all.
 *
 * **It is a required argument on `canAfford` and `spend`, and that is the whole
 * design.** The alternative shapes were a per-caller check and a floor set on
 * the `Treasury` per class; both were rejected for the same reason, which is
 * the one property a ladder has to have: *a rung must be impossible to bypass
 * by calling `spend` without saying which rung you are.* A caller-side check is
 * bypassed by forgetting it and nothing goes red; a defaulted parameter is
 * bypassed by omitting it and silently gets the deepest floor, which is the
 * rung that refuses last. A required parameter of a closed union cannot be
 * omitted, and `tsc` is the thing that asks.
 *
 * `'hiring'` is **not** one of the ruling's three rungs. `GuardRoster.hire`
 * spends (`src/simulation/staff/hiring.ts`) and the ruling does not name it, so
 * it is given the *shallowest* threshold rather than a fourth one of its own:
 * see `INSOLVENCY_RUNG_FLOORS_MINOR_UNITS`. Whether hiring deserves a rung of
 * its own is marked in the amendment as the owner's and is not taken here.
 */
export type SpendClass = 'deliveries' | 'construction' | 'wages' | 'hiring';

/**
 * The first rung: **deliveries refused below −1,250.**
 *
 * The owner's ruling 19 of 2026-08-31, quoted at
 * [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)'s
 * "Amendment, 2026-09-01", which is the citation this number has and the only
 * one. It is deliberately a named constant rather than a literal at a
 * comparison, because a magnitude the owner ruled has to be findable from the
 * ruling.
 *
 * **Absolute minor units, not a fraction of the floor**, and the amendment
 * defends the choice: the owner ruled three magnitudes, not three ratios, and
 * `1_250 / 2_500` is a ratio nobody stated. What keeps the ladder coherent if
 * the floor is ever reconfigured is the clamp in `Treasury.floorFor`, not a
 * derivation here.
 */
export const INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS = -1_250;

/**
 * The second rung: **construction halted below −2,000.** Ruling 19, as above.
 *
 * "Construction" here is the material spend a *queued build order* causes --
 * `JustInTimeMaterialsService.procureForPendingOrders`, which is the only
 * caller that reaches `ProcurementSystem.purchase` without a player pressing
 * Buy. The press itself is `'deliveries'`. That split is what makes the first
 * two rungs distinguishable at all, because both spends go through one method;
 * the amendment argues it rather than assuming it.
 */
export const INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS = -2_000;

/**
 * The three rungs and the one spend the ruling does not name, as the floors
 * they are refused at.
 *
 * **`'wages'` is `-Infinity` and that is not a threshold: it is the sentinel for
 * "no rung of its own above the treasury's floor".** Ruling 19 puts the third
 * rung *at* the floor (−2,500 today), and the floor already has an owner --
 * `Treasury.setOverdraftFloor`, fed by `createNewSimulationRuntime` from
 * `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`. Writing −2,500 here would be a second
 * copy of a number that is already defined once, and the two copies would
 * disagree the first time anybody passed a different floor. Every rung is
 * clamped *up* to the treasury's floor by `rungFloorMinorUnits`, so the sentinel
 * has to be the identity of `Math.max`: `-Infinity` clamps to exactly the floor,
 * whatever the floor is, and the third rung is the floor by construction rather
 * than by coincidence. `0` was the first draft and is wrong -- the floor is
 * non-positive, so `Math.max(0, floor)` is `0` for every floor and would have
 * pinned wages at a balance of zero, which is the pre-ruling behaviour this
 * change exists to move.
 *
 * `'hiring'` shares the first rung. Not a fourth threshold, because ruling 19
 * authored three and a fourth is the owner's; and not a deeper one, because a
 * prison that is refusing deliveries and still taking on staff is decision 8's
 * ordering broken in the other direction.
 */
export const INSOLVENCY_RUNG_FLOORS_MINOR_UNITS: Readonly<Record<SpendClass, number>> = {
  deliveries: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  construction: INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS,
  wages: Number.NEGATIVE_INFINITY,
  hiring: INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
};

/**
 * The rung's threshold clamped to an overdraft floor — the whole of the ladder's
 * arithmetic, as one pure function.
 *
 * A function rather than a method on `Treasury` because there is a second
 * reader: `judgeAffordability` (`src/ui/affordability.ts`) is the host's
 * pre-flight on the two intents that cost money, and it sits on the other side
 * of `sender.submit` from any `Treasury`. That module exists precisely because
 * *"the comparison it makes was wrong for a whole ruling and nothing could see
 * it"*, and a second `Math.max` written out over there would be the same defect
 * one ruling later. `Treasury.floorFor` and the host now call the same
 * definition.
 *
 * See `Treasury.floorFor` for what the clamp buys and what it deliberately
 * does not decide.
 */
export function rungFloorMinorUnits(spendClass: SpendClass, overdraftFloorMinorUnits: number): number {
  return Math.max(INSOLVENCY_RUNG_FLOORS_MINOR_UNITS[spendClass], overdraftFloorMinorUnits);
}

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
   * **How far below zero this class of spend may take the balance.**
   *
   * The rung's own threshold, clamped to the treasury's floor: no spend of any
   * class may pass `this.floor`, which is the one bound the whole economy was
   * written against and the one `scripts/report-loan-recovery-pricing.mjs`
   * measures `floor breaches` of.
   *
   * **The clamp is what makes the ladder a ladder rather than four numbers.**
   * Two properties follow from it and both are asserted in
   * `tests/unit/economy-treasury.test.ts`:
   *
   * - **A prison with no facility open behaves exactly as it did before ruling
   *   19, to the minor unit, for every class.** With `this.floor` at `0` the
   *   clamp returns `0` for all four, so a bare `new Treasury()` — which is
   *   every one in the unit tests — has no rungs at all. The ladder exists
   *   *inside* the overdraft, which is what the ruling's own words say.
   * - **No rung can be deeper than the floor**, so a floor reconfigured
   *   shallower than −2,500 collapses the rungs onto it in order instead of
   *   leaving two of them unreachable below it.
   *
   * What the clamp deliberately does *not* do is **scale** the rungs with the
   * floor. That is the amendment's open question, marked there as the owner's:
   * ruling 19 gave three magnitudes and no ratios.
   */
  public floorFor(spendClass: SpendClass): number {
    return rungFloorMinorUnits(spendClass, this.floor);
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
   *
   * **`this.floor` became `this.floorFor(spendClass)` under the owner's ruling
   * 19 of 2026-08-31, and the sentence above is kept because it describes the
   * comparison this still is.** It was *"one comparison over every spend"* —
   * `treasury.ts`'s own docblock, `tests/integration/economy-payroll-loop.test.ts`
   * and ADR 0083 §2 all say so in those words — and that is exactly why ADR 0017
   * decision 8's ladder ran backwards: one comparison cannot express three
   * rungs. It is still one comparison, against a floor that now depends on
   * which rung is asking.
   *
   * `spendClass` is required rather than defaulted. See `SpendClass`.
   */
  public canAfford(amountMinorUnits: number, spendClass: SpendClass): boolean {
    if (!Number.isSafeInteger(amountMinorUnits) || amountMinorUnits < 0) return false;
    return this.balance - amountMinorUnits >= this.floorFor(spendClass);
  }

  /**
   * Spends, or refuses and changes nothing.
   *
   * Returns whether it spent, rather than throwing. A purchase the player
   * cannot afford is an ordinary refusal the interface reports, not an
   * exceptional condition — the same reading `ConstructionSystem.submitOrder`
   * takes of an order on unowned land (#215).
   *
   * **Which rung is refusing is the caller's to say and cannot be omitted**
   * (ruling 19; see `SpendClass` for why the parameter is required rather than
   * defaulted).
   */
  public spend(amountMinorUnits: number, spendClass: SpendClass): boolean {
    if (!this.canAfford(amountMinorUnits, spendClass)) return false;
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
