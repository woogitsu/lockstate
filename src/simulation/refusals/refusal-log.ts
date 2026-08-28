import type { BuildOrderFailReason } from '../construction/build-order';
import type { PurchaseCancelRefusalReason, PurchaseRefusalReason } from '../economy/procurement';
import type { PlaceObjectRefusalReason, RemoveObjectRefusalReason } from '../objects/object-placement-service';
import type { AdmitPrisonerRefusalReason } from '../prisoners/prisoner-operations-runtime';
import type { RefusalReason, SimulationRefusal } from '../protocol/types';
import type { UnzoneRoomRefusalReason, ZoneRoomRefusalReason } from '../rooms/zoning';
import type { GuardReleaseRefusalReason } from '../security/guard-release';
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
 * - **`SimulationRefusal` -- what crosses the worker boundary -- holds no
 *   coordinates, order id or item id.** The alert says what was refused and
 *   why, not where. Carrying a tile on the wire would put a second copy of
 *   the order's position on the boundary and needs a decision about how the
 *   HUD renders it; recorded in `docs/HUD_PROJECTIONS.md` rather than guessed.
 *   **This class itself now holds one more thing that never reaches the
 *   wire**: `record`'s optional `key` (issue #492), compared only by
 *   `supersede` and read by nothing else, including nothing in
 *   `src/ui/`. It is what lets a later success withdraw the very refusal it
 *   answers without needing a tile on the public payload -- see `supersede`.
 * - **It orders nothing.** There is exactly one record, so there is no
 *   iteration here for `docs/DETERMINISM.md`'s canonical-order rule to
 *   govern -- the rule is satisfied by there being no list, not by a sort.
 *
 * Writing to it is deterministic: it is written only from the kernel's
 * command handler, at the tick the command executes, from values the command
 * itself decided. Two runs of the same commands record the same refusals in
 * the same order. `supersede` is called from the same handler at the same
 * point, so a withdrawal is exactly as deterministic as a record.
 */
export class RefusalLog {
  /**
   * The total number of refusals ever recorded. Monotonic -- `supersede`
   * withdraws `_current`, never this -- because it answers "how many times
   * has this session refused something", and a withdrawal does not undo the
   * fact that the refusal happened. See `count`.
   */
  private _sequence = 0;
  private _current: SimulationRefusal | undefined;
  /**
   * An opaque identity for whatever `_current` is standing about, or
   * `undefined` if the current refusal carries none. Compared by `supersede`
   * and never read otherwise -- in particular it is never put on
   * `SimulationRefusal` and never crosses the worker boundary, so it does not
   * reopen the "no coordinates on the wire" decision above: a key can encode
   * a tile, an id or nothing at all, and no caller outside this class and
   * `session-commands.ts`/`construction/handler.ts` ever inspects one.
   */
  private _currentKey: string | undefined;

  /**
   * Records a refusal at `tick`, replacing whatever was last recorded.
   *
   * Replacing rather than accumulating is the whole design: see the class
   * comment. The count is not lost by replacing -- it is `sequence`.
   *
   * @param key See `supersede`. Omitted by a caller with no supersession
   * story of its own; `supersede` can then never match this record, which is
   * the correct, inert default rather than a caller having to opt out.
   */
  public record(reason: RefusalReason, tick: number, key?: string): void {
    this._sequence += 1;
    this._current = { sequence: this._sequence, tick, reason };
    this._currentKey = key;
  }

  /**
   * Withdraws the standing refusal if it was the one recorded under `key`,
   * and does nothing otherwise.
   *
   * This is the mechanism issue #492 asked for: the simulation later
   * *accepting* a command it had refused is a fact the simulation itself now
   * knows, and it belongs here rather than inferred by the HUD from a rising
   * count elsewhere (a count is a proxy, and would clear the line on a
   * *different* room being zoned -- exactly the failure mode this method is
   * shaped to avoid). Called once per route, from the same call site that
   * would have called `record` had the command been refused instead, with
   * the same key either would have used -- so "the command that just
   * succeeded is the command that produced the standing refusal, argument
   * for argument" is exactly what a match means, and a refusal about a
   * different target is left alone. See each call site's own key for why
   * that comparison is the right width for its domain: some are per-target
   * (zone, unzone, build, place-object, remove-object, purchase,
   * cancel-purchase, hire, release-guard), one is domain-wide because its
   * reasons are session-global facts a differently-parameterised success
   * still disproves (admit).
   *
   * A miss -- no current refusal, or one recorded under a different key, or
   * with no key at all -- is silent and cheap: a string comparison against
   * `undefined` is not a match, so a caller may call this on every success
   * unconditionally rather than guarding it on "is anything currently
   * standing".
   */
  public supersede(key: string): void {
    if (this._currentKey === undefined || this._currentKey !== key) return;
    this._current = undefined;
    this._currentKey = undefined;
  }

  /** The most recent refusal, or `undefined` while the session has refused nothing or the last one was superseded. */
  public get last(): SimulationRefusal | undefined {
    return this._current;
  }

  /**
   * How many refusals this session has recorded. `0` before the first.
   *
   * Not affected by `supersede`: this is a historical tally of how many times
   * `record` has run, and a later withdrawal of the standing refusal does not
   * make it not have happened. `tests/unit/simulation-refusals.test.ts`
   * "frees the tiles" case is the one that would catch this coupling coming
   * back -- its final `count` assertion is 1 across a sequence whose last
   * command supersedes that very refusal.
   */
  public get count(): number {
    return this._sequence;
  }
}

/**
 * A build order's own failure vocabulary, mapped onto the wire's.
 *
 * A `Record` over the closed `BuildOrderFailReason` union rather than a
 * template-literal expression, so this is **exhaustive at compile time**: a
 * seventh fail reason added to `BUILD_ORDER_FAIL_REASONS` fails to compile here
 * until somebody decides what the player is told about it. That is the
 * property a `` `build.${reason}` `` concatenation would not have -- it would
 * silently mint a `RefusalReason` the protocol enum rejects and the message
 * catalog has no key for, and the refusal would vanish at the decoder exactly
 * as it used to vanish in the simulation.
 *
 * `unknown-buildable` arrived sixth and it is the table's own demonstration of
 * why the exhaustiveness is worth the ceremony: the reason it was missing was
 * that nothing refused the condition at all -- `submitOrder` approved an order
 * for a buildable nobody declared, and `update` threw on it out of a scheduled
 * system update from then on. Adding the check without adding the sentence
 * would not compile.
 */
export const BUILD_REFUSAL_REASONS: Readonly<Record<BuildOrderFailReason, RefusalReason>> = {
  'out-of-bounds': 'build.out-of-bounds',
  unbuildable: 'build.unbuildable',
  'unbuildable-terrain': 'build.unbuildable-terrain',
  'unknown-buildable': 'build.unknown-buildable',
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
  'no-duty-for-role': 'hire.no-duty-for-role',
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
 * `GuardReleaseRefusalReason`, mapped onto the wire's. Exhaustive for the same
 * reason as above (ADR 0034).
 *
 * `GuardReleaseService.release` answers a `GuardReleaseOutcome` rather than a
 * boolean **so that this table has something to be exhaustive over**, and that
 * is not a stylistic preference: `tests/unit/simulation-refusals.test.ts`
 * requires each wire reason to come from a `Record` over a named union, so a
 * boolean return could not have reached a player-visible surface at all. This is
 * the second time that has decided an API -- `ProcurementSystem.cancel` gained
 * `PurchaseCancelRefusalReason` for the same reason in #285 -- and it is worth
 * naming as a pattern rather than as a coincidence, because "a release either
 * worked or it did not" is exactly the shape a boolean looks adequate for.
 *
 * `not-held` is the reachable one and the one a player can provoke without doing
 * anything wrong: `hud/held-guards` is published on a cadence, so a response can
 * close or a search can finish between the publication and the press.
 * `unknown-guard` is reachable only from a command composed elsewhere, and is
 * mapped for the reason every other table maps its whole union.
 *
 * Namespaced `release-guard.*` rather than folded into `hire.*`: hiring and
 * releasing are opposite gestures on the same roster, and somebody who pressed
 * Release must not read that a wage could not be paid.
 */
export const RELEASE_GUARD_REFUSAL_REASONS: Readonly<Record<GuardReleaseRefusalReason, RefusalReason>> = {
  'not-held': 'release-guard.not-held',
  'unknown-guard': 'release-guard.unknown-guard',
};

/**
 * `ZoneRoomRefusalReason`, mapped onto the wire's. Exhaustive for the same
 * reason as above.
 *
 * Two of these -- `out-of-bounds` and `unowned-land` -- are spelled exactly
 * like two of `BUILD_REFUSAL_REASONS`'s, which is why the wire ids are
 * namespaced rather than flat: they are the same *condition* and a different
 * *sentence*, because the player asked for a room and not a wall.
 *
 * `not-enclosed` is the eighth and the one that carries an owner's ruling
 * rather than a mechanism: `roomPerimeterEnclosure` used to refuse nothing and
 * the Rooms panel warned about the answer after the fact. It now refuses, so
 * the sentence the panel used to show as a warning
 * (`hud.rooms.enclosure-open-required`, deleted with this change) is this
 * table's entry instead. See the ADR "Must a zoned room be enclosed".
 */
export const ZONE_REFUSAL_REASONS: Readonly<Record<ZoneRoomRefusalReason, RefusalReason>> = {
  'below-minimum-size': 'zone.below-minimum-size',
  'duplicate-instance-id': 'zone.duplicate-instance-id',
  'invalid-area': 'zone.invalid-area',
  'not-enclosed': 'zone.not-enclosed',
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

/**
 * Supersession keys (issue #492): one per route, built from the same
 * arguments at the point a refusal would be recorded and at the point a
 * later success is dispatched, so `RefusalLog.supersede` can tell "the
 * command that just succeeded is the command the standing refusal was about"
 * from "some other command in the same domain succeeded". `session-commands.ts`
 * and `construction/handler.ts` call the matching pair on both branches of
 * every route.
 *
 * **Two shapes, not one, and the difference is the answer to "does this
 * generalise past zoning".** Nine of the ten are per-target: their refusal
 * reasons are facts about the specific rectangle, tile, order or guard the
 * command named, so the key names that target and nothing wider -- a
 * successful zoning of room B must not silence a still-true refusal about
 * room A, which is exactly the failure mode a *count* would have produced and
 * the reason this is per-target rather than per-namespace. `admit` is the
 * exception and is keyed domain-wide on purpose: both of its reasons
 * (`no-accommodation`, `population-full`) are session-global facts
 * re-evaluated identically for every admission regardless of the prisoner's
 * own parameters (`PrisonerOperationsRuntime.requestAdmission`), so a
 * *different* admission succeeding is not a proxy for the standing refusal
 * being false -- it is the same check, run again, coming back the other way.
 * A per-target key for `admit` would key on fields (`sentenceLengthTicks`,
 * `priorIncidents`, the reception tile) that a retried admission has no
 * reason to repeat, which would leave the bug this issue reports unfixed for
 * intake rather than merely narrow.
 *
 * `hire`'s four reasons split unevenly across that boundary --
 * `roster-full` is global like `admit`'s pair, while `insufficient-funds` and
 * `no-duty-for-role` are per-role facts a different role's successful hire
 * does not disprove -- and there is no one key that is exactly right for
 * both without carrying a role for the global member and none for the
 * per-role ones. Keyed per role uniformly: it undersells `roster-full` (a
 * hire of a *different* role after the roster freed up will not clear a
 * stale `roster-full` line about the first role until that same role is
 * tried again) rather than oversells the per-role pair, which is the
 * direction #492 asks this to err in -- "does not withdraw a refusal that is
 * still true" is the requirement; being slower than it could be about one
 * reason is not a violation of it. `purchase` and `place-object` key on the
 * catalogue/definition and the target and deliberately omit the order id
 * they also carry: an order id is minted fresh per attempt
 * (`crypto.randomUUID()` at the call site) and is a `duplicate-order`
 * refusal's whole subject, but a second attempt at the *same* item/tile that
 * succeeds under a fresh id is, to the player, the same request landing --
 * the sentence "an order like this already exists" is no longer the sentence
 * this session needs on screen, exactly as a repeated build at the same tile
 * clears `build.*`.
 */

/** `admit.*`'s key: both reasons are the same global check, so any successful admission answers either. */
export function admitSupersessionKey(): string {
  return 'admit';
}

/** `build.*`'s key: the tile, the buildable and the edge, normalised the way `resolveBuildEdge` does at the point of use. */
export function buildSupersessionKey(definitionId: string, x: number, y: number, edge: string): string {
  return `build:${definitionId}:${x}:${y}:${edge}`;
}

/** `zone.*`'s key: the room type and the exact rectangle -- see the class comment for why the type is part of it (`below-minimum-size` is a per-type fact). */
export function zoneSupersessionKey(roomCatalogId: string, x: number, y: number, width: number, height: number): string {
  return `zone:${roomCatalogId}:${x}:${y}:${width}:${height}`;
}

/** `unzone.*`'s key: the exact rectangle. `UnzoneRoom` names no room type, so none is part of it. */
export function unzoneSupersessionKey(x: number, y: number, width: number, height: number): string {
  return `unzone:${x}:${y}:${width}:${height}`;
}

/** `purchase.*`'s key: the item and the quantity, not the order id -- see the section comment. */
export function purchaseSupersessionKey(itemId: string, quantity: number): string {
  return `purchase:${itemId}:${quantity}`;
}

/** `cancel-purchase.*`'s key: the order id, which is the one thing `CancelMaterialPurchase` names. */
export function purchaseCancelSupersessionKey(orderId: string): string {
  return `cancel-purchase:${orderId}`;
}

/** `hire.*`'s key: the role -- see the section comment for the trade-off against `roster-full`. */
export function hireSupersessionKey(staffRoleId: string): string {
  return `hire:${staffRoleId}`;
}

/** `place-object.*`'s key: the buildable and the tile, not the order id -- see the section comment. */
export function placeObjectSupersessionKey(definitionId: string, x: number, y: number): string {
  return `place-object:${definitionId}:${x}:${y}`;
}

/** `remove-object.*`'s key: the tile. `RemoveObject` names no order id at all. */
export function removeObjectSupersessionKey(x: number, y: number): string {
  return `remove-object:${x}:${y}`;
}

/** `release-guard.*`'s key: the guard id, which is the one thing `ReleaseGuardAssignment` names. */
export function releaseGuardSupersessionKey(guardId: number): string {
  return `release-guard:${guardId}`;
}
