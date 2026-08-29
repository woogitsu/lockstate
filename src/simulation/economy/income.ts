import type { EntityId } from '../entity/entity-store';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { NEED_IDS, NEED_MAX, type NeedsComponent } from '../prisoners/needs';
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
 * to the issue rather than to a successor ADR, and a further ADR in
 * `docs/adr/` for one integer would put a balance figure into the
 * architecture record that ADR 0017 deliberately kept out of it.
 *
 * ## It pays, and this is the measurement that used to say it could not
 *
 * This section read: "What is still missing is a *place* -- a room a player can
 * actually zone is registered with `capacity: 0`... So in a real session today
 * `occupiedPlaces` is `0`, this system credits nothing, and the readout beside
 * the balance stays at zero", measured as a balance still at 25,000 after 2,500
 * ticks with `roomCapacity` and `roomOccupants` both 0. It named ADR 0028 as
 * whose subject giving a room a capacity was.
 *
 * That ADR's phase 1 has landed and the figures are re-measured on the same
 * shape of session -- one zoned `room.cell`, one admitted prisoner -- with one
 * command added, the `PlaceObject` that puts a bed in the cell:
 *
 * | tick | balance | accrued today | roomCapacity | roomOccupants |
 * | --- | --- | --- | --- | --- |
 * | 0 (fresh session) | 25,000 | 0 | 0 | 0 |
 * | 1 (one plank bought) | 24,935 | 0 | 0 | 0 |
 * | 150 (bed built) | 24,935 | 0 | **1** | 0 |
 * | 200 (prisoner housed) | 24,935 | 25 | 1 | **1** |
 * | 2,399 (day about to end) | 24,935 | 300 | 1 | 1 |
 * | **2,400 (day paid)** | **25,235** | 0 | 1 | 1 |
 * | 4,800 (second day paid) | 25,535 | 0 | 1 | 1 |
 *
 * So the balance moves **upward** for the first time from something other than
 * a refund: 300 minor units a day, per occupied place, exactly as decision 6
 * specifies. `tests/integration/object-placement-loop.test.ts` drives that
 * whole path through the real kernel and the real command router.
 *
 * The mechanism here is unchanged by any of it -- this system holds no state,
 * reads `RoomInstanceRegistry.totalOccupancy` and knew nothing about why the
 * number was zero. What changed is the number.
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
 * refuses past `residentCapacity` -- the summed footprint width of the sleep
 * surfaces standing in the room since ADR 0028 phase 1 -- so the count can
 * never exceed the capacity the prison has actually *furnished*, which is a
 * stronger statement than it used to be: before object placement the ceiling
 * was a field somebody could have authored, and it is now a fact about what is
 * in the room. It counts neither of the two things the ADR rules out:
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
 * **The stated assumption has been discharged rather than restated**, and it is
 * worth recording that it did its job. It read: "today a slot is always an
 * *accommodation* slot, because `IntakeSystem` is the only caller of `assign`
 * anywhere in `src/`. If a future system registers occupancy that is not
 * somewhere a prisoner is housed -- a canteen tracking diners, a workshop
 * tracking workers -- this definition would pay twice for one prisoner-day and
 * has to be narrowed to accommodation before that lands."
 *
 * **A canteen tracking diners is exactly what ADR 0028 phase 6 landed**, and
 * [ADR 0029](../../../docs/adr/0029-concurrent-room-use-claims.md) is the
 * narrowing this paragraph asked for: a concurrent-use claim is held in its own
 * collection in `RoomInstanceRegistry`, counted by `totalUseClaims`, and
 * `totalOccupancy` still counts residency and nothing else. So `ActionSystem`
 * now assigns and releases a place for the duration of an action and **this
 * system did not change and pays no differently**: a prisoner eating lunch
 * still earns one prisoner-day, in the cell they live in. Nothing here needs to
 * know that concurrent use exists, which is the property the narrowing was for.
 */
export interface OccupiedPlaceSource {
  readonly totalOccupancy: number;
  /**
   * Who holds those places, ascending by entity id -- `length` is
   * `totalOccupancy`.
   *
   * Needed because the rate is no longer flat: what one place pays depends on
   * the conditions its occupant is held in, so the count alone cannot answer
   * what a day is worth. See `stateIncomeForPrisonerDay`.
   */
  residentIds(): readonly EntityId[];
}

/**
 * Everything a day's payment reads: the places, and the occupants' conditions.
 *
 * One source rather than three arguments, and structurally satisfied by
 * `PrisonerOperationsRuntime` -- the same object `projectStatusStrip` is
 * already handed for both its prisoner and its room source
 * (`src/simulation/worker/status-counts.ts`). It stays narrow in the sense
 * `PayrollStaffSource` is narrow: three members, none of them a system.
 */
export interface PrisonerDayGrantSource {
  readonly roomInstances: OccupiedPlaceSource;
  readonly entityStore: { getIndex(entityId: EntityId): number };
  readonly needs: NeedsComponent;
}

/**
 * The level at or below which the state calls a need **unmet** when it settles
 * the day.
 *
 * `51`, which is `NEED_MAX / 5` exactly and is pinned against it by
 * `tests/unit/economy-state-income.test.ts` rather than left as a coincidence
 * of two literals.
 *
 * **It is a floor and not a warning line, and the difference is the whole
 * reason a fifth was chosen over a half.** A day's payment is settled from one
 * sample, at `DAY_LENGTH_TICKS - 1`, so the threshold has to be low enough
 * that a *served* need cannot trip it merely by being sampled at the bottom of
 * its own cycle. Measured on this tree, eight prisoners in eight furnished
 * cells with a shower room and a yard -- every need served -- over ten in-game
 * days, sampling all six needs of all eight prisoners on **every** tick: the
 * lowest level any need reached at any tick was `bladder` at **65.4**, and the
 * lowest at any day boundary was `hunger` at **124.5**. So no need a prison
 * actually serves comes within a fifth of `NEED_MAX`, even on its worst tick,
 * and the boundary sample has better than a factor of two in hand. A prison
 * that meets its needs cannot lose a minor unit to an unlucky sample.
 *
 * What trips it is a need with **no route at all**: `hygiene` with no shower
 * room and no laundry, `recreation` with no yard, common room or classroom
 * ([ADR 0054](../../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
 * decision 1 rules both room-gated), `bladder` with no toilet, and every need
 * of a prisoner nobody housed. Those fall to 0 and stay there.
 *
 * **This is not the player-facing "your prisoners are unhappy" line.** That
 * threshold is a statement to a player about what is bad and is the owner's
 * ([ADR 0064](../../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md),
 * "What the player must be told for this to be fair");
 * this one is a statement about what the state declines to pay for. Issue #477
 * is explicit that the first was unanswerable while neglect cost a staffed
 * prison nothing -- *"fix the cost first, then the threshold has something true
 * to say"* -- so this is the cost, and the readout stays open.
 */
export const STATE_INCOME_UNMET_NEED_LEVEL = 51;

/**
 * How much of one prisoner-day the state withholds for each of the six needs
 * the prison is leaving unmet, in the same minor units.
 *
 * **Directional, not a committed balance decision**, the standing convention
 * for a new rule's numbers here (`DEFAULT_SECTOR_RISK_POLICY` and
 * `DEFAULT_ASSAULT_POLICY` both carry it, and issue #28 puts final balance out
 * of scope). What is *not* directional is the shape, which is
 * [ADR 0064](../../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md)'s
 * decision: linear in the count, one term per need, no interaction.
 *
 * `40` against a rate of `300` makes the schedule
 * `300, 260, 220, 180, 140, 100, 60` for zero through six unmet needs, and the
 * three properties that were chosen rather than fallen into:
 *
 * - **A prison that serves every need earns exactly what it earns today.** The
 *   rate is untouched at zero unmet, so no existing measurement of a well-run
 *   prison moves and this change can only ever take money off a prison that is
 *   withholding something.
 * - **The floor is 60 and it is reached, not clamped.** `300 - 6 x 40` is
 *   exactly a fifth of the rate, so a prison that meets none of the six needs
 *   still earns something. The state does not stop paying for a prisoner it is
 *   still making the prison hold, and -- the practical half -- a neglected
 *   prison is not put beyond digging itself out.
 *   [ADR 0049](../../../docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md)
 *   made insolvency a state rather than a loss condition; an income line that
 *   could reach zero would make it one.
 * - **The cheapest repair pays for itself in days.** `room.yard` requires no
 *   object at all (`src/content/room-catalog.ts`), so zoning 8x8 of owned
 *   ground turns `recreation` from unmet to served and returns 40 a prisoner a
 *   day for nothing. That is the incentive the mechanic exists to create, and
 *   it is why the withheld share is per *need* rather than per prison: the
 *   player is paid for each thing they fix, on the day they fix it.
 *
 * An integer, for `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS`'s reason: it
 * multiplies into a balance a save carries and a determinism fingerprint
 * hashes, and `docs/DETERMINISM.md` makes no exception for money.
 */
export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40;

/** Integer division. `%` and `-` are exact on safe integers, so the quotient is exact rather than a rounded float. */
function floorDiv(numerator: number, denominator: number): number {
  return (numerator - (numerator % denominator)) / denominator;
}

/**
 * Whether one need's **whole level** is at or below
 * `STATE_INCOME_UNMET_NEED_LEVEL` -- that is, whether the state withholds for
 * it when it settles the day.
 *
 * Extracted from `unmetNeedCount`'s loop rather than written beside it, and the
 * reason is drift: `src/simulation/presentation/prisoner-projection.ts` now
 * reports this same fact per need so a panel can draw it, and a second `<=`
 * against the same constant is two copies of one rule that must agree. This is
 * the one copy. `unmetNeedCount` below calls it, so the predicate a projection
 * shows and the predicate the money is computed from are the same function --
 * not merely the same number -- and a change to the comparison cannot reach the
 * treasury without reaching the readout.
 *
 * Takes a level rather than a `NeedsComponent`: the caller has already read it,
 * and a predicate that re-read it would invite the two reads to disagree.
 */
export function isNeedUnmetForStateIncome(level: number): boolean {
  return level <= STATE_INCOME_UNMET_NEED_LEVEL;
}

/**
 * How many of `NEED_IDS` this prisoner has at or below
 * `STATE_INCOME_UNMET_NEED_LEVEL`.
 *
 * `NeedsComponent.get`, which rounds to whole levels, rather than the stored
 * sub-level units: the threshold is authored in the 0-255 levels every
 * consumer outside the save codec works in, and a comparison against a level
 * has no business being decided by a two-hundredth of one.
 *
 * `NEED_IDS` in its declared order. Nothing here depends on the order -- the
 * result is a count -- but the iteration discipline is the one
 * `NeedsComponent` uses everywhere, and a need added to that list is counted
 * here with no second edit.
 */
export function unmetNeedCount(needs: NeedsComponent, index: number): number {
  let unmet = 0;
  for (const needId of NEED_IDS) {
    if (isNeedUnmetForStateIncome(needs.get(index, needId))) unmet += 1;
  }
  return unmet;
}

/**
 * What the state pays for one occupied place for one whole day, given how many
 * of its occupant's six needs are unmet.
 *
 * `Math.max(0, ...)` rather than the arithmetic alone: at the shipped rate and
 * withheld share the floor is 60 and the clamp never binds (pinned by test),
 * but a future rate below `6 x` the withheld share would otherwise bill the
 * prison for holding somebody, and `Treasury.credit` is not the place to
 * discover that.
 */
export function stateIncomeForPrisonerDay(unmetNeeds: number): number {
  if (!Number.isSafeInteger(unmetNeeds) || unmetNeeds < 0 || unmetNeeds > NEED_IDS.length) {
    throw new RangeError('Unmet need count must be a whole number of needs.');
  }
  return Math.max(0, STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS - STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS * unmetNeeds);
}

/**
 * What one whole day is worth: the sum over occupied places of what each one
 * pays.
 *
 * The amount `StateIncomeSystem` credits at a day boundary. Exact -- a sum of
 * authored integers over a canonically ordered walk, no rounding and no
 * remainder to carry -- and it is `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS x
 * places` exactly when the prison is meeting every need, which is the sentence
 * this function replaced.
 *
 * **`O(P log P)` in housed prisoners, once per in-game day.** The sort is
 * `residentIds`'s and the six-need scan is `unmetNeedCount`'s; at the
 * 200-prisoner reference tier that is one 200-element sort and 1,200 typed
 * array reads every 2,400 ticks.
 */
export function stateIncomeForCompletedDay(source: PrisonerDayGrantSource): number {
  let total = 0;
  for (const entityId of source.roomInstances.residentIds()) {
    total += stateIncomeForPrisonerDay(unmetNeedCount(source.needs, source.entityStore.getIndex(entityId)));
  }
  return total;
}

/**
 * What the current day has earned so far, at `tick`, for a day whose whole
 * value is `dailyGrantMinorUnits`.
 *
 * The "earned today" readout the owner asked for beside the balance: a day is
 * 2,400 ticks and two minutes of real time at 1x, which is too long to watch a
 * static number.
 *
 * **The grant is passed in rather than derived here, and that is the change
 * this signature records.** It used to take an occupied-place count, because a
 * day's value *was* the count times a fixed rate. It is now a walk over the
 * occupants (`stateIncomeForCompletedDay`), and a pure prorating function has
 * no business owning that walk -- the caller does it once and prorates it,
 * which also keeps this function exactly as testable as it was.
 *
 * **Derived, never accumulated.** It is a pure function of the tick and the
 * prison's current state, which is what makes the save question below have no
 * subtle answer -- there is no partial-day accumulator to lose, to restore or
 * to pay out twice. What it says is "what this day pays if the prison stays as
 * it is, prorated by how much of the day has been served", and at the payment
 * tick that is exactly what is credited:
 * `stateIncomeAccruedByTick(g, DAY_LENGTH_TICKS - 1) === g`, pinned by test.
 *
 * **Integer arithmetic, and the one division.** `300 / 2,400` is `1/8` of a
 * minor unit per tick per place, which is not an integer, so the accrual is
 * computed as one division of exact integers and floored -- `floorDiv`, not
 * float division. Nothing is lost by the truncation: at
 * `tickOfDay = DAY_LENGTH_TICKS - 1` the numerator is `grant x 2,400`,
 * divisible by 2,400 with remainder zero, so the discarded sub-unit part is
 * zero exactly when it would otherwise have to be carried. That holds for any
 * whole `grant`, which is why withholding a whole number of minor units per
 * unmet need was a condition on the schedule and not a preference. That is
 * also why this module needs no remainder accumulator of the kind `NEED_SCALE`
 * (`src/simulation/prisoners/needs.ts`) exists to provide.
 */
export function stateIncomeAccruedByTick(dailyGrantMinorUnits: number, tick: number): number {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('Tick must be a non-negative integer.');
  if (!Number.isSafeInteger(dailyGrantMinorUnits) || dailyGrantMinorUnits < 0) {
    throw new RangeError("A day's grant must be a non-negative safe integer.");
  }
  const tickOfDay = tick % DAY_LENGTH_TICKS;
  // `+ 1`: the payment at `tickOfDay === DAY_LENGTH_TICKS - 1` covers ticks
  // `0..DAY_LENGTH_TICKS - 1` inclusive, so the tick in progress is one of the
  // ticks served rather than one still to come.
  const ticksServed = tickOfDay + 1;
  return floorDiv(dailyGrantMinorUnits * ticksServed, DAY_LENGTH_TICKS);
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
 * ## What the day is worth, and the half of it that is new
 *
 * A day is no longer `rate x places`. Each occupied place is paid
 * `stateIncomeForPrisonerDay` of its own occupant's conditions, and the day is
 * the sum -- so the same eight cells earn 2,400 in a prison that meets its
 * prisoners' needs and 1,760 in one that has built no shower room and no yard.
 * The reasons are in `STATE_INCOME_UNMET_NEED_LEVEL` and
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`; what belongs here is
 * what it does to *this system*, which is almost nothing:
 *
 * - **Still no state.** The reduction is read from `NeedsComponent`, which the
 *   save already carries in full, at the tick the day is settled. There is no
 *   per-prisoner accumulator, no "days neglected" counter and no new field, so
 *   every word of "Nothing to save" below is still true and
 *   `SAVE_SCHEMA_VERSION` still does not move.
 * - **Still no RNG.** A sum of authored integers over a canonically ordered
 *   walk. No stream is taken, so `docs/DETERMINISM.md`'s named-stream contract
 *   is untouched.
 * - **Per occupant, never averaged.** Eight well-kept prisoners do not pay for
 *   a ninth nobody houses, and one neglected prisoner is not hidden by seven
 *   contented ones. That is the distinction
 *   [ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)
 *   draws between the assault trigger and the riot trigger, applied to money:
 *   a mean is the wrong instrument for something owed per person.
 * - **A prisoner nobody housed still earns nothing at all**, exactly as
 *   before. They hold no place, so no term of this sum is theirs. The
 *   consequence of leaving somebody unaccommodated is ADR 0061's, not this
 *   line's.
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
 * So the sampled reading is what the chosen cadence can express, and it is what
 * the readout shows all day. If integration is later wanted, this is the
 * comment that says what it costs and which decision has to be reopened
 * first.
 *
 * **What this used to say about when the difference is visible is now false.**
 * It read *"the difference between the two is invisible until something can
 * change occupancy inside a day -- which, with **no admission wired**, is
 * nothing."* Two things changed underneath it, and either alone is enough:
 *
 *  - **Admission is wired.** `src/main.ts` submits an `AdmitPrisoner` from the
 *    Intake panel's control, and a playtest pressed it twelve times in one
 *    session.
 *  - **Discharge is wired.** `PrisonerDischargeSystem` releases a prisoner at
 *    the end of their sentence (ADR 0050), which takes them out of the housed
 *    population mid-day just as surely.
 *
 * So occupancy *does* move inside a day, and the sampled-versus-integrated
 * difference is reachable rather than hypothetical. That does **not** reopen
 * the decision -- the cost paragraph above is unchanged and still the reason --
 * but a reader must not be told the case cannot arise. It can, and how much it
 * is worth has simply not been measured.
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
    private readonly prison: PrisonerDayGrantSource,
  ) {}

  /**
   * How much the day in progress has earned, for the readout beside the
   * balance. A read: it touches nothing.
   */
  public accruedThisDay(tick: number): number {
    return stateIncomeAccruedByTick(stateIncomeForCompletedDay(this.prison), tick);
  }

  public update(context: SimulationContext): void {
    const amount = stateIncomeForCompletedDay(this.prison);
    // An empty prison earns nothing, and says so by doing nothing rather than
    // by crediting zero: `Treasury.credit(0)` is legal and pointless, and a
    // future ledger (#29) should not have to filter out entries for no money.
    if (amount === 0) return;
    this.treasury.credit(amount);
  }
}
