import { DAY_LENGTH_TICKS } from './regime';

/**
 * Injury: the one boolean issue [#589](https://github.com/woogitsu/lockstate/issues/589)
 * asks for, and the two constants that decide what clearing it costs.
 *
 * ## What the ruling authorised, and what it did not
 *
 * The owner ruled on 2026-09-17, choosing the option labelled *"Zatwierdź: sam
 * boolean, bez medyka i bez potrzeby zdrowia (zalecane)"* ("Approve: the
 * boolean alone, no medic and no health need (recommended)"). That is the
 * weaker provenance kind -- the label of a clickable option this repository
 * wrote, not a sentence the owner typed -- and it is recorded as such.
 *
 * What it covers: a prisoner is `injured` or not; an incident sets it; time in
 * an `room.infirmary` clears it; the save carries the flag. What it does not
 * cover, and what is therefore deliberately absent from this module and from
 * every file that reads it: **no medic staff role, no `health` entry in
 * `NEED_IDS`, no death, no second flag, no severity band.** Each of those is a
 * fresh ruling rather than an extension of this one.
 *
 * ## What being injured costs, and why no penalty is authored
 *
 * Nothing here docks income, halves a walking speed or withholds a need.
 * `ActionSystem` promotes `action.infirmary-treatment` to rank 0 for an
 * injured prisoner whose prison provides treatment, so the cost of an injury
 * is the **time**: a prisoner on a medical bed is not eating, showering,
 * working, at class or in the yard, and their needs decay throughout at
 * `NEED_DECAY_PER_TICK` exactly as they do during any other action that serves
 * no need. That price is derived from `TREATMENT_TICKS` alone and needs no
 * second balance number, which is what keeps this change inside a ruling that
 * authorised a model rather than a balance.
 */

/** The action a prisoner performs to be treated. Positional index into `DEFAULT_ACTIONS` is never used for this -- the id is. */
export const INFIRMARY_TREATMENT_ACTION_ID = 'action.infirmary-treatment';

/**
 * The capability `object.medicine-cabinet` declares, and the only thing in
 * this repository that reads it.
 *
 * It is **not** an `ActionDefinition.requiredObjectCapability`: one action
 * consumes one capability (issue #326), and `action.infirmary-treatment`
 * consumes `'medical-treatment'` -- the beds are what bound how many prisoners
 * may be treated at once, and a cabinet is not a place to lie down. What a
 * cabinet does is make the course shorter, which is the same shape
 * `DELIVERY_BAY_CAPABILITY` and `STORAGE_ROOM_CAPABILITY` have in
 * `../operations/delivery-route.ts`: a capability read by a rule rather than
 * gated on by an action.
 */
export const MEDICAL_SUPPLY_CAPABILITY = 'medical-supply';

/**
 * How long a course of treatment takes on a bare medical bed: **2,400 ticks,
 * which is exactly one in-game day** (`DAY_LENGTH_TICKS`).
 *
 * **Where the number comes from, because a balance figure pulled from nowhere
 * is the thing this repository distrusts most.** It is the corpus's own
 * figure, and it is the only figure any source in the corpus states for the
 * boolean version of this mechanic. Issue #589's body: *"The flag is cleared
 * by time on a `medical-bed` in an `infirmary` -- one source gives 2,400
 * ticks, halved by a `medicine-cabinet` present."* Its sources agree:
 * `docs/research/design-search-2026-08-29/batch-b-extract.md` B14 quotes
 * `grok economy propo.md` for *"clearing the flag takes 2,400 ticks on a
 * `medical-bed` in an `infirmary` ... a `medicine-cabinet` present makes
 * treatment ticks count double"*, and `batch-d-extract.md` D40 records
 * PROPOSALS' *"one state per 4,000 ticks, halved by a `medicine-cabinet`"* --
 * the same factor over a larger model this ruling excludes.
 *
 * **Checked against this tree rather than inherited.** `DAY_LENGTH_TICKS` is
 * 2,400 (`./regime.ts`), so the corpus figure is one day to the tick; an
 * injury costs a prisoner a day, or half a day in an infirmary stocked to its
 * own authored requirements. That is a sentence a player can hold, and the
 * coincidence is the sanity check rather than the derivation -- the constant is
 * written as a multiple of `DAY_LENGTH_TICKS` so the meaning survives if the
 * day ever changes length.
 *
 * **What it is not.** It is not a per-tick recovery rate, because there is no
 * quantity to recover -- the ruling bought a boolean. A course either
 * completes and clears the flag or it does not, and an interrupted course
 * restarts, exactly as an interrupted shower does: `ActionSystem` measures
 * elapsed time from `CurrentActionComponent.phaseStartedAtTick`, which is the
 * one and only treatment clock and which the save already carries.
 */
export const TREATMENT_TICKS = DAY_LENGTH_TICKS;

/** The factor a `medical-supply` object in the room applies to a course. Two, per every source in the corpus that mentions the cabinet at all. */
export const MEDICAL_SUPPLY_SPEEDUP = 2;

/**
 * How long a course of treatment takes in a room offering `capabilities`.
 *
 * `TREATMENT_TICKS` on a room whose only medical object is a bed;
 * `TREATMENT_TICKS / MEDICAL_SUPPLY_SPEEDUP` where a `medical-supply` object
 * also stands in it. `room.infirmary` requires both
 * (`src/content/room-catalog.ts`), so the halved figure is what a player who
 * furnished the room the Rooms panel told them to furnish actually gets -- and
 * the slower branch is reachable, because `findAvailableForUse` gates on the
 * capability and the ceiling and never on whether a room's authored
 * requirements are satisfied. An infirmary with a bed and no cabinet treats,
 * and treats slowly.
 *
 * `baseTicks` is the catalogue entry's own `minDurationTicks` rather than
 * `TREATMENT_TICKS` read a second time, so the action definition stays the one
 * place the base is authored and this function cannot disagree with it.
 *
 * Integer by construction and asserted as such by
 * `tests/unit/prisoners-injury.test.ts`: `DAY_LENGTH_TICKS` is even, so no
 * rounding rule is needed and none is written. A rounding rule would be a
 * second decision about a number nobody has taken.
 */
export function treatmentTicksFor(baseTicks: number, capabilities: readonly string[]): number {
  return capabilities.includes(MEDICAL_SUPPLY_CAPABILITY) ? baseTicks / MEDICAL_SUPPLY_SPEEDUP : baseTicks;
}
