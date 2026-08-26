import type { BuildOrderFailReason } from '../construction/build-order';
import type { PurchaseCancelRefusalReason, PurchaseRefusalReason } from '../economy/procurement';
import type { PlaceObjectRefusalReason, RemoveObjectRefusalReason } from '../objects/object-placement-service';
import type { AdmitPrisonerRefusalReason } from '../prisoners/prisoner-operations-runtime';
import type { RefusalReason, SimulationRefusal } from '../protocol/types';
import type { UnzoneRoomRefusalReason, ZoneRoomRefusalReason } from '../rooms/zoning';
import type { StaffHireRefusalReason } from '../staff/hiring';

/**
 * What the simulation last refused, and how many times it has refused.
 *
 * ## The gap this closes
 *
 * A player command travels through two acceptances. The worker accepts the
 * *message* -- `WorkerStateMachine.handleSubmitCommand` answers
 * `status: 'queued'` the moment the kernel takes it -- and ADR 0003 decision
 * 9 is explicit that this "never reports a command as applied". The kernel
 * then dispatches it at its tick and a system decides what it means. Between
 * #225 and #261 the first acceptance was reported and the second decision was
 * not, so `ConstructionSystem.submitOrder` could set `state: 'failed'` with
 * `failReason: 'out-of-bounds'` and the player saw nothing at all: no ghost
 * (`phaseOf` in `src/rendering/world/structures.ts` draws a failed order as
 * nothing) and no refusal line (that line answers a *rejected command*, and
 * this command was queued). `ProcurementSystem.purchase` returned a
 * `PurchaseOutcome` that `session-commands.ts` discarded, and said so in its
 * own comment. `RoomZoningService.zone` returned a `ZoneRoomOutcome` that
 * reached a bounded in-worker window and stopped there, under a comment
 * saying the reporting route was "#261 step 2" -- this is that route.
 *
 * ## Why this shape and not a queue
 *
 * The route out is `simulation/status-counts`, which is a **snapshot on a
 * cadence**: published at most twice a second, and skipped entirely when
 * nothing it reports has changed. A refusal is an event, and the honest way
 * to put an event on a snapshot channel is to publish state that is a
 * function of the events so far rather than the events themselves. "The most
 * recent refusal is X" and "there have been N refusals" are both true
 * readings of the session at any tick; they survive a publication being late,
 * repeated, coalesced or dropped. A *queue* would not: the consumer could not
 * distinguish a queue that was drained from one that was never sent, and its
 * size would grow with the session, which `docs/HUD_PROJECTIONS.md` contract
 * 5 forbids on a cadence.
 *
 * One counter carries both facts: `sequence` is 1-based and increments once
 * per refusal, so the last refusal's `sequence` *is* the total. It doubles as
 * the row identity the HUD needs (`HudAlertViewModel.id`), so republishing
 * the same refusal beside a changed count updates a row instead of rebuilding
 * it.
 *
 * ## What it deliberately does not do
 *
 * - **It is not snapshotted.** `captureSessionSnapshot` does not carry it and
 *   a restored session starts with none. That is a decision, not an
 *   oversight, and not a difficulty either -- an optional field added to the
 *   bundle and to `save-schema.ts` needs no version bump, which is exactly
 *   how `simulation` and `identity` arrived. What it would buy is the
 *   problem: this holds a notice about an action the player took moments ago,
 *   not a condition of the prison, so restoring it means a loaded prison
 *   raising an alert about a wall somebody failed to place last week, with
 *   nothing on this channel able to dismiss it. It joins the counters
 *   `docs/HUD_PROJECTIONS.md` gap 33 already records as not surviving a
 *   restore, and it is recorded there and in `docs/PERSISTENCE.md` rather
 *   than left to be discovered.
 * - **It holds no coordinates, order id or item id.** The alert says what was
 *   refused and why, not where. Carrying a tile would put a second copy of
 *   the order's position on the boundary and needs a decision about how the
 *   HUD renders it; recorded in `docs/HUD_PROJECTIONS.md` rather than guessed.
 * - **It orders nothing.** There is exactly one record, so there is no
 *   iteration here for `docs/DETERMINISM.md`'s canonical-order rule to
 *   govern -- the rule is satisfied by there being no list, not by a sort.
 *
 * Writing to it is deterministic: it is written only from the kernel's
 * command handler, at the tick the command executes, from values the command
 * itself decided. Two runs of the same commands record the same refusals in
 * the same order.
 */
export class RefusalLog {
  private _last: SimulationRefusal | undefined;

  /**
   * Records a refusal at `tick`, replacing whatever was last recorded.
   *
   * Replacing rather than accumulating is the whole design: see the class
   * comment. The count is not lost by replacing -- it is `sequence`.
   */
  public record(reason: RefusalReason, tick: number): void {
    this._last = { sequence: (this._last?.sequence ?? 0) + 1, tick, reason };
  }

  /** The most recent refusal, or `undefined` while the session has refused nothing. */
  public get last(): SimulationRefusal | undefined {
    return this._last;
  }

  /** How many refusals this session has recorded. `0` before the first. */
  public get count(): number {
    return this._last?.sequence ?? 0;
  }
}

/**
 * A build order's own failure vocabulary, mapped onto the wire's.
 *
 * A `Record` over the closed `BuildOrderFailReason` union rather than a
 * template-literal expression, so this is **exhaustive at compile time**: a
 * sixth fail reason added to `BUILD_ORDER_FAIL_REASONS` fails to compile here
 * until somebody decides what the player is told about it. That is the
 * property a `` `build.${reason}` `` concatenation would not have -- it would
 * silently mint a `RefusalReason` the protocol enum rejects and the message
 * catalog has no key for, and the refusal would vanish at the decoder exactly
 * as it used to vanish in the simulation.
 */
export const BUILD_REFUSAL_REASONS: Readonly<Record<BuildOrderFailReason, RefusalReason>> = {
  'out-of-bounds': 'build.out-of-bounds',
  unbuildable: 'build.unbuildable',
  'unbuildable-terrain': 'build.unbuildable-terrain',
  'unowned-land': 'build.unowned-land',
  'water-blocked': 'build.water-blocked',
};

/**
 * `AdmitPrisonerRefusalReason`, mapped onto the wire's. Exhaustive for the
 * same reason as above.
 *
 * Both members are reachable, and from different sides: `no-accommodation` is
 * what an admission into a prison with no accommodation room meets, and
 * `population-full` is `EntityStore`'s ceiling. Neither is a prediction about
 * what intake will decide -- see
 * `PrisonerOperationsRuntime.requestAdmission`.
 */
export const ADMIT_REFUSAL_REASONS: Readonly<Record<AdmitPrisonerRefusalReason, RefusalReason>> = {
  'no-accommodation': 'admit.no-accommodation',
  'population-full': 'admit.population-full',
};

/**
 * `StaffHireRefusalReason`, mapped onto the wire's. Exhaustive for the same
 * reason as above.
 *
 * `insufficient-funds` is spelled exactly like one of `PURCHASE_REFUSAL_REASONS`'s,
 * which is the second demonstration of why the wire ids are namespaced rather
 * than flat: the treasury refuses a purchase and a hire for the same reason and
 * the player is doing two different things, and somebody who pressed Hire must
 * not read that the materials were not ordered.
 */
export const HIRE_REFUSAL_REASONS: Readonly<Record<StaffHireRefusalReason, RefusalReason>> = {
  'insufficient-funds': 'hire.insufficient-funds',
  'roster-full': 'hire.roster-full',
  'unknown-role': 'hire.unknown-role',
};

/**
 * `PlaceObjectRefusalReason`, mapped onto the wire's. Exhaustive for the same
 * reason as above.
 *
 * Three of these -- `out-of-bounds`, `unowned-land` and `duplicate-order` --
 * are spelled exactly like members of the build and purchase tables, which is
 * the third demonstration of why the wire ids are namespaced rather than flat:
 * the same condition refusing a wall, a delivery and a bed is three different
 * sentences, and a player who pressed the bed row must not read that the
 * materials were not ordered.
 *
 * All seven are reachable from the Build panel or the world gesture, and unlike
 * every other table here **none of them is pre-empted by a main-thread check**:
 * `src/main.ts` holds no copy of the zoning plane, the placed objects or the
 * order list, so there is nothing it could honestly refuse before submitting.
 * This is the only route a refused placement reaches the player by.
 */
export const PLACE_OBJECT_REFUSAL_REASONS: Readonly<Record<PlaceObjectRefusalReason, RefusalReason>> = {
  'duplicate-order': 'place-object.duplicate-order',
  'not-a-placeable-object': 'place-object.not-a-placeable-object',
  'out-of-bounds': 'place-object.out-of-bounds',
  'outside-room': 'place-object.outside-room',
  'tile-occupied': 'place-object.tile-occupied',
  'unknown-buildable': 'place-object.unknown-buildable',
  'unowned-land': 'place-object.unowned-land',
};

/**
 * `RemoveObjectRefusalReason`, mapped onto the wire's. Exhaustive for the same
 * reason as above (ADR 0028 phase 3).
 *
 * **One entry, and the table exists anyway.** A single-member union could have
 * been recorded with a literal at the call site, and the reason it is not is
 * that this table is what makes a *second* reason a compile error rather than a
 * silent `undefined` on the wire: whoever decides that a removal can also be
 * refused for some new condition is made to give it a sentence in the same
 * change. Every other command's refusals arrived that way and this one should
 * not be the exception because it started small.
 *
 * `nothing-to-remove` is spelled exactly like `UNZONE_REFUSAL_REASONS`'s member
 * of the same name -- the fourth demonstration of why the wire ids are
 * namespaced rather than flat. A player who pressed a tile with no object on it
 * must not be told there was no room there.
 */
export const REMOVE_OBJECT_REFUSAL_REASONS: Readonly<Record<RemoveObjectRefusalReason, RefusalReason>> = {
  'nothing-to-remove': 'remove-object.nothing-to-remove',
};

/** `PurchaseOutcome`'s refusal reasons, mapped onto the wire's. Exhaustive for the same reason as above. */
export const PURCHASE_REFUSAL_REASONS: Readonly<Record<PurchaseRefusalReason, RefusalReason>> = {
  'duplicate-order': 'purchase.duplicate-order',
  'insufficient-funds': 'purchase.insufficient-funds',
  'invalid-quantity': 'purchase.invalid-quantity',
  'unknown-material': 'purchase.unknown-material',
};

/**
 * `PurchaseCancelRefusalReason`, mapped onto the wire's. Exhaustive for the same
 * reason as above (#285).
 *
 * **One entry, and the table exists anyway**, for exactly the argument
 * `REMOVE_OBJECT_REFUSAL_REASONS` records: the table is what makes a second
 * reason a compile error instead of a silent `undefined` on the wire, and
 * `ProcurementSystem.cancel` gained its named union rather than keeping a
 * boolean so that this mapping has something to be exhaustive over.
 *
 * `not-pending` is the one thing a cancellation can be refused for and it is a
 * refusal the player must be told about, which is why the credit path stopped
 * answering `false`. The delivery has landed (or was never here), so the
 * treasury did not move -- and a control that reported nothing would be a Cancel
 * that appeared to refund money and did not. That is the same failure #82 and
 * #207 are about, on the one control in the interface whose whole subject is
 * money coming back.
 *
 * Namespaced `cancel-purchase.*` rather than as a fifth member of `purchase.*`,
 * which is the fifth demonstration of why these ids are namespaced: buying and
 * un-buying are opposite gestures on the same treasury, and somebody who
 * pressed Cancel must not read that the materials were not ordered.
 */
export const PURCHASE_CANCEL_REFUSAL_REASONS: Readonly<Record<PurchaseCancelRefusalReason, RefusalReason>> = {
  'not-pending': 'cancel-purchase.not-pending',
};

/**
 * `ZoneRoomRefusalReason`, mapped onto the wire's. Exhaustive for the same
 * reason as above.
 *
 * Two of these -- `out-of-bounds` and `unowned-land` -- are spelled exactly
 * like two of `BUILD_REFUSAL_REASONS`'s, which is why the wire ids are
 * namespaced rather than flat: they are the same *condition* and a different
 * *sentence*, because the player asked for a room and not a wall.
 */
export const ZONE_REFUSAL_REASONS: Readonly<Record<ZoneRoomRefusalReason, RefusalReason>> = {
  'below-minimum-size': 'zone.below-minimum-size',
  'duplicate-instance-id': 'zone.duplicate-instance-id',
  'invalid-area': 'zone.invalid-area',
  'out-of-bounds': 'zone.out-of-bounds',
  'overlaps-existing-room': 'zone.overlaps-existing-room',
  'unknown-room-type': 'zone.unknown-room-type',
  'unowned-land': 'zone.unowned-land',
};

/**
 * `UnzoneRoomRefusalReason`, mapped onto the wire's. Exhaustive for the same
 * reason as the tables above.
 *
 * `invalid-area` is spelled exactly like the zoning table's, and gets its own
 * namespaced id for the reason `out-of-bounds` and `unowned-land` do: it is the
 * same condition and a different sentence, because the player asked to remove a
 * room rather than to create one, and a message that named the wrong command
 * would send them to the wrong control.
 */
export const UNZONE_REFUSAL_REASONS: Readonly<Record<UnzoneRoomRefusalReason, RefusalReason>> = {
  'invalid-area': 'unzone.invalid-area',
  'nothing-to-remove': 'unzone.nothing-to-remove',
  'room-occupied': 'unzone.room-occupied',
};
