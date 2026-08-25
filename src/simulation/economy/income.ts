import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { DAY_LENGTH_TICKS } from '../prisoners/regime';
import type { Treasury } from './treasury';

/**
 * What the state pays for operating the facility (ADR 0017 decision 3 and
 * decision 6, issue #29).
 *
 * ## What is decided here, and by whom
 *
 * ADR 0017 decision 6 is Accepted and settles the **model**: the state pays
 * *per prisoner-day, accrued per occupied place*. Decision 5 of the same ADR
 * is equally explicit that it decides **no prices and no balance values**,
 * reserving them to #29 -- so the model is not this module's to revisit, and
 * the rate is not the ADR's to hold. This module implements the model and
 * declares the rate, and both halves of that split are deliberate.
 *
 * The rate below is **the owner's decision**, recorded with its derivation at
 * the declaration and on issue #29, which is where this repository keeps
 * pricing (`src/content/procurement-catalog.ts` holds the material prices the
 * same way, and `TREASURY_STARTING_BALANCE_MINOR_UNITS` holds the opening
 * balance). It is not recorded as an ADR: ADR 0017 decision 5 reserved values
 * to the issue rather than to a successor ADR, and a ninth `Proposed` document
 * in `docs/adr/` for one integer would put a balance figure into the
 * architecture record that ADR 0017 deliberately kept out of it.
 *
 * ## What is *not* built, and why the income line is still invisible
 *
 * Admission *is* built: `AdmitPrisoner`, its handler branch and the Intake
 * panel reach `PrisonerOperationsRuntime.requestAdmission` (#261 step 4), so a
 * player can put a prisoner in the prison. What is still missing is a *place*
 * -- a room a player can actually zone is registered with `capacity: 0`
 * (`src/simulation/rooms/zoning.ts`, ADR 0023 open, ADR 0028 proposed), and an
 * occupied place is one unit of a declared capacity that somebody holds.
 * `RoomInstanceRegistry.assign` refuses at `occupants >= capacity`, which for
 * `capacity: 0` is every assignment, so the arrival waits at
 * `accommodation-assignment` and occupies nothing.
 *
 * So in a real session today `occupiedPlaces` is `0`, this system credits
 * nothing, and the readout beside the balance stays at zero. Measured rather
 * than asserted: a zoned `room.cell`, one admitted prisoner and 2,500 ticks --
 * past a whole 2,400-tick day boundary -- leave the balance at 25,000 and the
 * accrual at 0, with `roomCapacity` and `roomOccupants` both 0. That is the
 * honest state of it: the mechanism is real, tested against prisoners injected
 * at the simulation level, and joined to a population an interface can now
 * create into rooms that hold nobody. Giving a room a capacity is not this
 * change's -- it is ADR 0028's subject -- and faking an occupancy to make the
 * readout move would be inventing the very capacity this comment says does not
 * exist.
 */

/**
 * What the state pays per prisoner-day, per occupied place, in the treasury's
 * minor units.
 *
 * **The owner's figure. The derivation it was chosen against is
 * `docs/research/2026-08-25-economy-rate.md`**, which recommended 200 and is
 * the evidence for this decision. Its anchor re-checked against the two
 * catalogs here rather than restated: a `wall-brick` placement consumes 2
 * `item.brick` at 40 each (80 a segment) and a `door-wooden` one
 * `item.wood-plank` at 65 (`src/simulation/construction/definition.ts:20-31`,
 * `src/content/procurement-catalog.ts:71-72`). The smallest cell the room
 * catalog permits has a 2x3 interior, so its enclosing ring is 4x5 - 2x3 = 14
 * tiles, one of which is the door: 13 x 80 + 65 = **1,105**. That is the
 * record's figure and it is right. At 200 it pays back in 5.5 in-game days,
 * which is the payback period the recommendation was built to hit.
 *
 * **300 was chosen over that 200, and the record predicted the number.** It
 * closes its own recommendation by naming the condition under which 200
 * fails: "200 is calibrated against a world with **no operating costs
 * whatever**. When wages, food and utilities land [...] Expect the gross rate
 * to need to rise to roughly **300** at that point to preserve a five-day
 * payback. That is a planned revision, not a regression." So this is not 200
 * overruled; it is the record's own revised figure, adopted early.
 *
 * The owner's reason for adopting it early rather than shipping 200 and
 * revising: `src/content/staff-role-catalog.ts:59` already authors the guard
 * `wageBand` at 80-140 per day, so at 200 a single guard would eat most of one
 * prisoner-day the moment payroll exists. The stated preference was to start
 * looser and tighten later rather than discover the game is unplayable. The
 * cost of that choice, stated so it is not later mistaken for an oversight: at
 * 300 with no operating costs at all, a standalone cell pays back in 3.7
 * in-game days rather than 5.5, so expansion is cheaper than the record
 * intended for exactly as long as nothing charges the prison anything.
 *
 * An integer, and not a formatting preference: it multiplies into a balance a
 * save carries and a determinism fingerprint hashes, and `docs/DETERMINISM.md`
 * makes no exception for money. `300 x N` is exact for every whole `N`, so the
 * day-boundary payment needs no rounding and carries no remainder -- see
 * `stateIncomeAccruedByTick` for the one place a division appears and why it
 * is exact at the boundary too.
 */
export const STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS = 300;

/**
 * Where "occupied place" comes from.
 *
 * **The exact definition, because ADR 0017 says *per occupied place* and not
 * *per prisoner in existence*:** an occupied place is one unit of a registered
 * room instance's declared capacity that a prisoner currently holds -- an
 * occupancy slot in `RoomInstanceRegistry`. `RoomInstanceRegistry.assign`
 * refuses past `capacity`, so the count can never exceed the capacity the
 * prison has actually built, and it counts neither of the two things the ADR
 * rules out:
 *
 * - **not empty capacity** -- an unoccupied cell contributes nothing, which is
 *   what makes "per occupied place" different from "per place";
 * - **not a prisoner in existence** -- an arrival still queued, in reception,
 *   in classification, waiting on a full cell (`accommodationBacklogTicks`) or
 *   `'failed'` for want of any instance of its room type holds no slot and is
 *   not paid for. Only `IntakeSystem`'s successful accommodation assignment
 *   creates one.
 *
 * **Not `DeploymentSystem.getCoverageReport`**, whose `required`/`assigned`/
 * `shortage` triple reads like the right shape and is about something else
 * entirely: it counts **guards** against a `DeploymentSchedule` per security
 * sector. Its `assigned` is a staffing level, not a housed prisoner, and its
 * `required` comes from a schedule the player sets rather than from anything
 * a prisoner occupies. Paying per unit of it would pay for hiring guards.
 * Named here because the resemblance is close enough to be worth ruling out
 * once, in writing.
 *
 * `totalOccupancy` rather than the status strip's `roomOccupants`: that count
 * is built by fanning out over catalog room ids
 * (`presentation/room-projection.ts`), so an instance registered under an id
 * the catalog does not define is invisible to it (`docs/HUD_PROJECTIONS.md`
 * gap 15). Income must be paid on what the registry holds, not on what a
 * projection can see. `RoomZoningService` only ever registers a catalog-defined
 * id, so the two agree in any session a player can produce.
 *
 * **The stated assumption**, per `AGENTS.md`: today a slot is always an
 * *accommodation* slot, because `IntakeSystem` is the only caller of
 * `assign` anywhere in `src/`. If a future system registers occupancy that is
 * not somewhere a prisoner is housed -- a canteen tracking diners, a workshop
 * tracking workers -- this definition would pay twice for one prisoner-day and
 * has to be narrowed to accommodation before that lands.
 */
export interface OccupiedPlaceSource {
  readonly totalOccupancy: number;
}

/** Integer division. `%` and `-` are exact on safe integers, so the quotient is exact rather than a rounded float. */
function floorDiv(numerator: number, denominator: number): number {
  return (numerator - (numerator % denominator)) / denominator;
}

/**
 * What one whole day of `occupiedPlaces` occupied places is worth.
 *
 * The amount `StateIncomeSystem` credits at a day boundary, and exact for
 * every whole `occupiedPlaces`: no rounding, no remainder to carry.
 */
export function stateIncomeForCompletedDay(occupiedPlaces: number): number {
  if (!Number.isSafeInteger(occupiedPlaces) || occupiedPlaces < 0) {
    throw new RangeError('Occupied places must be a non-negative safe integer.');
  }
  return STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS * occupiedPlaces;
}

/**
 * What the current day has earned so far, at `tick`.
 *
 * The "earned today" readout the owner asked for beside the balance: a day is
 * 2,400 ticks and two minutes of real time at 1x, which is too long to watch a
 * static number.
 *
 * **Derived, never accumulated.** It is a pure function of the tick and the
 * current occupancy, which is what makes the save question below have no
 * subtle answer -- there is no partial-day accumulator to lose, to restore or
 * to pay out twice. What it says is "what this day pays if occupancy stays as
 * it is, prorated by how much of the day has been served", and at the payment
 * tick that is exactly what is credited:
 * `stateIncomeAccruedByTick(n, DAY_LENGTH_TICKS - 1) === stateIncomeForCompletedDay(n)`,
 * pinned by test.
 *
 * **Integer arithmetic, and the one division.** `300 / 2,400` is `1/8` of a
 * minor unit per tick per place, which is not an integer, so the accrual is
 * computed as one division of exact integers and floored -- `floorDiv`, not
 * float division. Nothing is lost by the truncation: at
 * `tickOfDay = DAY_LENGTH_TICKS - 1` the numerator is `300 x places x 2,400`,
 * divisible by 2,400 with remainder zero, so the discarded sub-unit part is
 * zero exactly when it would otherwise have to be carried. That is why this
 * module needs no remainder accumulator of the kind `NEED_SCALE`
 * (`src/simulation/prisoners/needs.ts`) exists to provide: the rate and the
 * day length were chosen so the boundary divides.
 */
export function stateIncomeAccruedByTick(occupiedPlaces: number, tick: number): number {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('Tick must be a non-negative integer.');
  if (!Number.isSafeInteger(occupiedPlaces) || occupiedPlaces < 0) {
    throw new RangeError('Occupied places must be a non-negative safe integer.');
  }
  const tickOfDay = tick % DAY_LENGTH_TICKS;
  // `+ 1`: the payment at `tickOfDay === DAY_LENGTH_TICKS - 1` covers ticks
  // `0..DAY_LENGTH_TICKS - 1` inclusive, so the tick in progress is one of the
  // ticks served rather than one still to come.
  const ticksServed = tickOfDay + 1;
  return floorDiv(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS * occupiedPlaces * ticksServed, DAY_LENGTH_TICKS);
}

/**
 * Credits the treasury for the day the prison has just served (ADR 0017
 * decision 3: "the state's remuneration for operating the facility is the
 * primary income line").
 *
 * ## The cadence, and why the phase is 2,399 rather than 0
 *
 * `intervalTicks: DAY_LENGTH_TICKS`, `phaseTicks: DAY_LENGTH_TICKS - 1`: the
 * owner's decision is that the day is paid at its **end**.
 *
 * Phase 0 was rejected on measured grounds rather than aesthetic ones. The
 * kernel's schedule predicate is `tick % intervalTicks === phaseTicks` and it
 * is evaluated *before* the tick is advanced (`kernel.ts`, steps 2 and 3), so
 * phase 0 fires on tick 0 -- paying for a day not yet served, and letting a
 * player take the money and close the tab. Phase `DAY_LENGTH_TICKS - 1` fires
 * first on tick 2,399, after 2,400 ticks have been served, and once per day
 * thereafter.
 *
 * ## Nothing to save, and that is the point
 *
 * This system holds **no state**: no accumulator, no last-paid tick, no
 * counter. So the save question -- a player saves mid-day and reloads; do they
 * lose the partial day, get paid twice, or neither -- resolves by construction
 * rather than by care:
 *
 * - The accrual is *derived* (`stateIncomeAccruedByTick`), so a partial day is
 *   never stored and cannot be lost. A restored session's readout is recomputed
 *   from the restored tick and the restored occupancy and continues rising.
 * - Whether a day boundary has been paid is a fact about the kernel tick, and
 *   the kernel tick is in the save already. A snapshot is taken between steps,
 *   so tick 2,399 is either still pending (the payment has not run, and runs
 *   after the restore) or already stepped past (the tick is 2,400, and the next
 *   payment is 4,799). There is no third state, so no double payment.
 * - **No save-version bump.** `SAVE_SCHEMA_VERSION` stays at 4: this feature
 *   adds no field to the payload, changes no field's units and changes no
 *   field's meaning, which are the three things V2, V3 and V4 were each bumped
 *   for. A bump with nothing behind it would invalidate the migration chain's
 *   own story.
 *
 * ## Sampled at the boundary, not integrated -- and the record disagrees
 *
 * The one behavioural consequence to state plainly: because occupancy is read
 * at the boundary rather than integrated over the day, a place occupied for
 * part of a day is paid as a whole day if it is still occupied at the boundary
 * and as nothing if it is not.
 *
 * **The research record for #29 recommended the other thing**, and the
 * divergence is recorded rather than quietly resolved.
 * `docs/research/2026-08-25-economy-rate.md` says: "Sampling occupancy once at
 * the boundary is not the same as accruing per occupied place: a prisoner
 * admitted one tick before payday would earn a full day. Keep one integer
 * counter of occupied-place-ticks, add to it on each scheduled tick, and at
 * phase 2,399 pay `floor(counter x rate / 2,400)` and carry the remainder."
 * That is a correct description of a real difference and the criticism lands.
 *
 * It is not implemented, for a reason that is not a preference:
 * **integrating requires a per-tick system, and the cadence is the owner's
 * decision.** `intervalTicks: DAY_LENGTH_TICKS` means `update` is called
 * exactly once a day; a counter that must be incremented on every tick cannot
 * live behind that schedule, so integrating would mean either a second
 * every-tick system or changing the declared interval to 1 -- and the owner
 * decided `intervalTicks: 2,400`, `phaseTicks: 2,399`. It would also add the
 * counter and its remainder to the save and to the determinism fingerprint,
 * which is the cost the record itself names when it rejects a per-tick credit
 * two paragraphs earlier.
 *
 * So the sampled reading is what the chosen cadence can express, it is what
 * the readout shows all day, and the difference between the two is invisible
 * until something can change occupancy inside a day -- which, with no
 * admission wired, is nothing. If integration is later wanted, this is the
 * comment that says what it costs and which decision has to be reopened
 * first.
 */
export class StateIncomeSystem implements SystemRegistration {
  public readonly id = 'economy.state-income';
  /**
   * Between `procurement` (110) and `navigation` (150), in the block the
   * economy already occupies. Nothing in a tick's ordering depends on it: it
   * reads occupancy that `prisoners.intake` (50) settled earlier in the tick
   * and writes a balance only `procurement` (110) and `construction` (100)
   * read, both of which have already run. Declared order is part of ADR 0020's
   * determinism contract and ADR 0009's replay guarantee, so
   * `tests/determinism/kernel-system-order.test.ts` pins it and this addition
   * had to be a reviewed edit there.
   */
  public readonly order = 120;
  /** Once per in-game day, on its last tick. See the class comment for why not phase 0. */
  public readonly schedule = { intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 };

  public constructor(
    private readonly treasury: Treasury,
    private readonly places: OccupiedPlaceSource,
  ) {}

  /**
   * How much the day in progress has earned, for the readout beside the
   * balance. A read: it touches nothing.
   */
  public accruedThisDay(tick: number): number {
    return stateIncomeAccruedByTick(this.places.totalOccupancy, tick);
  }

  public update(context: SimulationContext): void {
    const amount = stateIncomeForCompletedDay(this.places.totalOccupancy);
    // An empty prison earns nothing, and says so by doing nothing rather than
    // by crediting zero: `Treasury.credit(0)` is legal and pointless, and a
    // future ledger (#29) should not have to filter out entries for no money.
    if (amount === 0) return;
    this.treasury.credit(amount);
  }
}
