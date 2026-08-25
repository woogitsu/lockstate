import type { BuildOrderFailReason } from '../construction/build-order';
import type { PurchaseRefusalReason } from '../economy/procurement';
import type { RefusalReason, SimulationRefusal } from '../protocol/types';
import type { ZoneRoomRefusalReason } from '../rooms/zoning';
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

/** `PurchaseOutcome`'s refusal reasons, mapped onto the wire's. Exhaustive for the same reason as above. */
export const PURCHASE_REFUSAL_REASONS: Readonly<Record<PurchaseRefusalReason, RefusalReason>> = {
  'duplicate-order': 'purchase.duplicate-order',
  'insufficient-funds': 'purchase.insufficient-funds',
  'invalid-quantity': 'purchase.invalid-quantity',
  'unknown-material': 'purchase.unknown-material',
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
  'duplicate-instance-id': 'zone.duplicate-instance-id',
  'invalid-area': 'zone.invalid-area',
  'out-of-bounds': 'zone.out-of-bounds',
  'overlaps-existing-room': 'zone.overlaps-existing-room',
  'unknown-room-type': 'zone.unknown-room-type',
  'unowned-land': 'zone.unowned-land',
};
