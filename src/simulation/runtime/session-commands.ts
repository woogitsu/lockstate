import { createConstructionCommandHandler } from '../construction';
import type { ProcurementSystem } from '../economy';
import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import {
  ADMIT_REFUSAL_REASONS,
  HIRE_REFUSAL_REASONS,
  PLACE_OBJECT_REFUSAL_REASONS,
  PURCHASE_CANCEL_REFUSAL_REASONS,
  PURCHASE_REFUSAL_REASONS,
  RELEASE_GUARD_REFUSAL_REASONS,
  REMOVE_OBJECT_REFUSAL_REASONS,
  UNZONE_REFUSAL_REASONS,
  ZONE_REFUSAL_REASONS,
  admitSupersessionKey,
  hireSupersessionKey,
  placeObjectSupersessionKey,
  purchaseCancelSupersessionKey,
  purchaseSupersessionKey,
  releaseGuardSupersessionKey,
  removeObjectSupersessionKey,
  unzoneSupersessionKey,
  zoneSupersessionKey,
  type RefusalLog,
} from '../refusals';
import type { ConstructionSystem } from '../construction/system';
import type { ObjectPlacementService } from '../objects';
import type { PrisonerOperationsRuntime } from '../prisoners/prisoner-operations-runtime';
import type { RoomZoningService } from '../rooms/zoning';
import type { GuardReleaseService } from '../security/guard-release';
import type { StaffHiringService } from '../staff/hiring';
import { tileCoordinate } from '../world/coordinates';

/**
 * The session's one command handler.
 *
 * The kernel takes exactly one (`Kernel.setCommandHandler`), and until the
 * economy arrived every command a session accepted was a construction order,
 * so `createConstructionCommandHandler` *was* that handler. `PurchaseMaterials`
 * is the first command that is not a construction order, so this routes.
 *
 * Routing here rather than adding a procurement case to the construction
 * handler: a module named for construction that also spends money is the
 * shape a reader has to already know about to find. `ZoneRoom` is the second
 * such command and took the same route (#261): it used to reach a no-op
 * branch in `construction/handler.ts` under a comment correctly saying that
 * zoning is not a construction order, and it now reaches `RoomZoningService`
 * from here instead. `UnzoneRoom` is the third, and it is routed beside
 * `ZoneRoom` because it is the same service's other half. `HireStaff` is the
 * fourth, and it is a construction order even less than the other three.
 * `AdmitPrisoner` is the fifth (#261 step 4), and it reaches
 * `PrisonerOperationsRuntime` for the same reason: an admission is not a
 * construction order either.
 *
 * **The delegation is total, not a fallback.** Every command this does not
 * handle is passed through unchanged, including ones neither layer handles --
 * `unpackCommand` returning `null` is the decoder's business and is left to
 * the handler that owns it.
 *
 * `PlaceObject` is the sixth, and it is the one command here that *turns into*
 * a construction order rather than avoiding being one: `ObjectPlacementService`
 * decides whether the footprint is legal and then submits a `BuildOrder`
 * through `construction`, which is ADR 0028 decision 4's whole mechanism.
 *
 * `RemoveObject` is the seventh, and it is the same service's other half: a
 * placement and a removal are one gesture with a mode, exactly as a designation
 * and an un-designation are, so they are routed side by side (ADR 0028 phase 3).
 *
 * `CancelMaterialPurchase` is the eighth, and it is the one command here that
 * *un-does* another one of them: it names a purchase by the id
 * `PurchaseMaterials` minted and reaches `ProcurementSystem.cancel`, which was a
 * complete credit path with no caller in `src/` at all (#285). It is routed
 * beside the purchase for the reason `UnzoneRoom` is routed beside `ZoneRoom` --
 * one service's two halves belong side by side.
 *
 * `ReleaseGuardAssignment` is the ninth, and it is the one command here that
 * *un-does a claim rather than a purchase* (ADR 0034, answering ADR 0033's open
 * question 3). It is routed here rather than beside `HireStaff` -- the other
 * roster command -- because it is not the roster's other half: hiring adds a
 * guard and releasing frees one that is already hired, and the service it
 * reaches knows about search jobs and incident responses as well as about
 * deployment. Beside the hire would have implied it was the opposite of one.
 *
 * `refusals` is the session's `RefusalLog`, and all ten routes write to the
 * same one: a refused wall, a refused purchase, a refused zoning rectangle, a
 * refused un-zoning, a refused hire, a refused admission, a refused object
 * placement, a refused object removal, a cancellation with nothing left to
 * refund and a release of a guard nothing was holding are the same kind of fact
 * about the session -- the kernel took the command and a system then declined to
 * carry it out -- and they reach the player down one channel (#261).
 *
 * Every branch below also calls `refusals.supersede` on its success path
 * (issue #492): a refusal outlives the thing it refused otherwise, because
 * nothing told the log the simulation had gone on to accept the very command
 * it once declined. Each call passes the same key its own `record` call would
 * have used had the command been refused instead, built by that route's own
 * `*SupersessionKey` function in `../refusals`; see those functions for why
 * nine of the ten compare a target (a rectangle, a tile, an order id, a
 * guard id) and one -- `admit` -- compares nothing but the domain, and for
 * why a role, an item or a tile that does not match the standing refusal's
 * own leaves that refusal exactly as it was.
 */
export function createSessionCommandHandler(
  construction: ConstructionSystem,
  procurement: ProcurementSystem,
  roomZoning: RoomZoningService,
  staffHiring: StaffHiringService,
  runtimePrisoners: PrisonerOperationsRuntime,
  objectPlacement: ObjectPlacementService,
  guardRelease: GuardReleaseService,
  refusals: RefusalLog,
): CommandHandler {
  const constructionCommands = createConstructionCommandHandler(construction, refusals);

  return (command, context) => {
    const simCommand = unpackCommand(command.payload as never);
    if (simCommand !== null && simCommand.type === 'ZoneRoom') {
      // The outcome is not dropped and it now reaches the player. It used to
      // reach only `RoomZoningService.recentRefusals`, a bounded window kept
      // "so the route, when it is built, reads a reason instead of guessing
      // one" -- this is that route (#261 step 2). The window stays: it holds
      // the last thirty-two refusals with their requests and tiles, which is
      // diagnosis, while what crosses the boundary is the most recent
      // refusal's reason and nothing else.
      //
      // `simCommand.roomId` is the room *catalog* id (`room.cell`), not an
      // instance id: the command schema named the field before instances
      // existed, and renaming a field that a queued command in an existing
      // save may already carry is a save-compatibility change rather than a
      // rename.
      const outcome = roomZoning.zone(
        {
          roomCatalogId: simCommand.roomId,
          x: simCommand.x,
          y: simCommand.y,
          width: simCommand.width,
          height: simCommand.height,
        },
        context.tick,
      );
      const zoneKey = zoneSupersessionKey(
        simCommand.roomId,
        simCommand.x,
        simCommand.y,
        simCommand.width,
        simCommand.height,
      );
      if (outcome.kind === 'refused') {
        refusals.record(ZONE_REFUSAL_REASONS[outcome.reason], context.tick, zoneKey);
      } else {
        // Issue #492: this exact rectangle, for this exact room type, is what
        // the standing refusal (if any) was about, and it has just been
        // accepted -- so whatever it said is no longer true. Withdrawing it
        // here rather than leaving the HUD to infer one from `rooms` rising
        // is the whole point: a room zoned *elsewhere* leaves a standing
        // refusal about *this* rectangle alone, because its key would not
        // match.
        refusals.supersede(zoneKey);
      }
      return;
    }

    if (simCommand !== null && simCommand.type === 'UnzoneRoom') {
      // The other half of designating a room, and the reason it is a command
      // rather than a use of `Undo`: zoning writes no construction order, so
      // `ConstructionSystem` has no transaction to reverse and `Undo` cannot
      // reach a zone at all. Before this branch a room, once designated, was
      // permanent for the life of the session -- `zone` refuses
      // `overlaps-existing-room` for any tile already painted -- so one stray
      // drag could put up to 4,096 tiles beyond use with no recovery of any
      // kind, and none whatsoever on touch, where undo is a keyboard chord.
      //
      // It carries no room id, because removal names no room type: what comes
      // out is whatever the rectangle covers. `RoomZoningService.unzone`
      // states what "covers" means -- each covered zoned tile is resolved to
      // the room *instance* containing it and that instance's whole rectangle
      // is cleared (issue #337; it used to be the connected same-type run,
      // which took a neighbour the drag never touched) -- and both
      // consequences of that choice.
      //
      // The refusal takes the same route a refused zoning does and lands in
      // the same `RefusalLog`, under its own `unzone.*` ids: the same
      // condition refusing a removal and a designation is a different
      // sentence, because a player told "the room overlaps another" after
      // asking to *remove* one would go and look at the wrong control. The
      // lookup is exhaustive over `UnzoneRoomRefusalReason`, so a fourth
      // reason fails to compile until it has a wire id and a message key.
      const outcome = roomZoning.unzone(
        {
          x: simCommand.x,
          y: simCommand.y,
          width: simCommand.width,
          height: simCommand.height,
        },
        context.tick,
      );
      const unzoneKey = unzoneSupersessionKey(simCommand.x, simCommand.y, simCommand.width, simCommand.height);
      if (outcome.kind === 'refused') {
        refusals.record(UNZONE_REFUSAL_REASONS[outcome.reason], context.tick, unzoneKey);
      } else {
        // Issue #492, the same mechanism as `ZoneRoom`'s: this rectangle just
        // cleared, so a standing refusal about it -- `nothing-to-remove` on a
        // retry once something was zoned there, `room-occupied` once the
        // occupants have gone -- is withdrawn rather than left to answer a
        // request that has since succeeded.
        refusals.supersede(unzoneKey);
      }
      return;
    }

    if (simCommand !== null && simCommand.type === 'AdmitPrisoner') {
      // The fourth command that is not a construction order, routed here for
      // the reason `ZoneRoom`, `UnzoneRoom` and `PurchaseMaterials` are
      // (#261 step 4).
      //
      // `requestAdmission` rather than `admitPrisoner`, and the difference is
      // the whole of what this branch decides. The unguarded call throws when
      // the entity store is exhausted -- out of `Kernel.step()`, which no
      // command handler may do -- and it allocates a prisoner even when
      // `IntakeSystem` is certain to mark the arrival terminally `'failed'`,
      // which happens whenever no room instance of any accommodation target
      // exists. That is every prison in which the player has zoned nothing,
      // which is where every prison starts: `RoomZoningService` is still the
      // only thing in `src/` that registers an instance, and since the Rooms
      // tab (#312) `ZoneRoom` has a producer, so this is the state before the
      // first designation rather than a permanent one. Admitting anyway would
      // put a permanent, undeletable, inert record in the save and count it on
      // the status strip as a prisoner; refusing says so instead. See
      // `PrisonerOperationsRuntime.requestAdmission`.
      //
      // Nothing here draws. Identity comes from `identity.actor-name` at the
      // reception stage and the risk tier from `prisoners.classification` at
      // the classification stage, both inside `IntakeSystem` -- so the same
      // command at the same tick of the same seed produces the same prisoner,
      // and this branch could not perturb either stream if it tried.
      //
      // **`src/main.ts` refuses one of these two cases before it submits**,
      // exactly as it does for a purchase: it compares the room count the
      // worker last published against zero and throws instead of submitting,
      // so the player is answered on the control they pressed rather than
      // whenever the clock next runs. The `throw` there and this line sit on
      // opposite sides of `sender.submit`, so one press produces exactly one
      // player-visible message -- from one side or the other, never both and
      // never neither. What reaches this line from the panel is the case that
      // check cannot see: a prison holding rooms of some other type, or a
      // balance of rooms that changed since the last publication. Both
      // reasons stay reachable from an `AdmitPrisoner` composed anywhere else
      // -- a queued command in a restored save, a future producer -- which is
      // why this maps the whole union rather than the one reason a panel can
      // provoke.
      const outcome = runtimePrisoners.requestAdmission(
        { sentenceLengthTicks: simCommand.sentenceLengthTicks, priorIncidents: simCommand.priorIncidents },
        { x: simCommand.x, y: simCommand.y },
      );
      if (outcome.kind === 'refused') {
        refusals.record(ADMIT_REFUSAL_REASONS[outcome.reason], context.tick, admitSupersessionKey());
      } else {
        // Issue #492, keyed domain-wide rather than per-request -- see
        // `admitSupersessionKey`. `no-accommodation` and `population-full`
        // are both re-checked identically for every admission regardless of
        // this one's own `sentenceLengthTicks`/`priorIncidents`/tile, so a
        // *different* admission succeeding is the same fact turning out
        // false, not a proxy for it.
        refusals.supersede(admitSupersessionKey());
      }
      return;
    }

    if (simCommand !== null && simCommand.type === 'PurchaseMaterials') {
      // The outcome reaches the player, and this is where it is put on the
      // route out. It used to be dropped here, under a comment saying that a
      // refusal -- `insufficient-funds`, `unknown-material` -- had "nowhere to
      // go", because the kernel's command handler returns `void` and the
      // worker's reply to a command acknowledges *receipt*, not effect.
      // `refusals` is that somewhere: the same route #225 built for a refused
      // wall, reaching the HUD as an alert on `simulation/status-counts`
      // rather than as a command result (#261).
      //
      // **It is not the only route a refused purchase travels, and the two
      // cannot both fire for one press.** `src/main.ts` checks the item
      // against the procurement catalog and the price against the balance the
      // worker last published *before* it submits, and throws instead of
      // submitting -- so a purchase this line refuses is one that check let
      // through, and a purchase that check stopped never became a command at
      // all. One gesture produces exactly one player-visible message, from
      // one side of that dispatch or the other, never both and never neither.
      //
      // Of the four reasons, only `insufficient-funds` currently arrives here
      // from the Build panel, and only in the two cases the main-thread check
      // cannot see: several purchases pressed inside one tick, each measured
      // against a balance none of them has been deducted from yet, and a
      // balance that moved since the last publication. `unknown-material` is
      // pre-empted by that same check, `invalid-quantity` by the stepper
      // clamping to `[1, MAX_PURCHASE_QUANTITY]`, and `duplicate-order` by a
      // fresh `crypto.randomUUID()` per press. All four stay reachable from a
      // `PurchaseMaterials` composed anywhere else -- a queued command in a
      // restored save, a future producer -- which is why this maps the whole
      // union rather than the one reason a panel can provoke.
      //
      // **The clock used to have to run before this line was reached at all,
      // and no longer does.** `Kernel.step()` was the only thing that
      // dispatched a command queued by `submitCommand`, and `FixedStepClock.pump`
      // returns zero executed ticks while its mode is `paused`, so a purchase
      // submitted against a paused clock was not refused yet -- it was not
      // dispatched yet -- and its refusal waited for the player to press play.
      // Since ADR 0051 the worker dispatches a due command on submission while the
      // clock is stopped, so a paused purchase is refused here, now, and the
      // one message it produces is immediate.
      //
      // The consequence that went with the old behaviour goes with it: a run of
      // presses during one pause is no longer measured by the main-thread check
      // against one unchanged balance, because each dispatch spends before the
      // next press is composed. The two-case list below is what that narrows --
      // "several purchases pressed inside one tick" now means several pressed
      // faster than a `simulation/status-counts` can carry the new balance back,
      // rather than several pressed during any pause at all.
      //
      // The lookup is exhaustive over `PurchaseRefusalReason`, so a fifth
      // refusal reason added to `ProcurementSystem` fails to compile until it
      // is given a wire id and a message key.
      const outcome = procurement.purchase(simCommand.orderId, simCommand.itemId, simCommand.quantity, context.tick);
      const purchaseKey = purchaseSupersessionKey(simCommand.itemId, simCommand.quantity);
      if (!outcome.ok) {
        refusals.record(PURCHASE_REFUSAL_REASONS[outcome.reason], context.tick, purchaseKey);
      } else {
        // Issue #492: the item and quantity, not the order id -- see the key
        // module's section comment for why a fresh id on the same item and
        // quantity still counts as the same request landing.
        refusals.supersede(purchaseKey);
      }
      return;
    }

    if (simCommand !== null && simCommand.type === 'CancelMaterialPurchase') {
      /*
       * The other half of a purchase, and the producer `ProcurementSystem.cancel`
       * never had (#285).
       *
       * Before this branch, money spent on a delivery still in flight was
       * unrecoverable by any means a player could reach: `cancel` refunded the
       * recorded `paidMinorUnits` exactly, was idempotent, was snapshotted and
       * restored -- and `grep -rn "procurement\.cancel" src/` found nothing, so
       * the only caller in the repository was a test. Undoing the build order the
       * materials were bought for does not help and must not be made to: the two
       * ids are independent because the two *actions* are, and a refund wired to
       * undo would credit the money while `cancelOrder` also released the
       * materials, which creates value out of a keystroke (#285's mutation M2).
       *
       * **The refusal reaches the player, and it is the interesting half.** A
       * cancellation is refused for exactly one reason -- the delivery is not in
       * flight any more, because it landed or was never here -- and it is a
       * refusal a player can provoke without doing anything wrong: the list on
       * screen is a projection on a cadence, so a delivery can arrive between the
       * publication and the press. `CancelBuildOrder` deliberately says nothing
       * in the same race (`createConstructionCommandHandler` swallows an id that
       * names nothing) and the difference is what the two controls promise. A
       * cancelled order that had already finished leaves the world visibly
       * changed a moment later either way; a cancellation that refunded nothing
       * leaves a balance that did not move, and silence there is a control that
       * appeared to give money back.
       *
       * **No pre-check on the main thread**, for `CancelBuildOrder`'s reason:
       * whether a delivery is still in flight is not something this thread's
       * stale copy may decide.
       */
      const outcome = procurement.cancel(simCommand.orderId);
      const cancelKey = purchaseCancelSupersessionKey(simCommand.orderId);
      if (!outcome.ok) {
        refusals.record(PURCHASE_CANCEL_REFUSAL_REASONS[outcome.reason], context.tick, cancelKey);
      } else {
        // Issue #492: the one id `CancelMaterialPurchase` carries. A refund
        // of a different order must not silence a standing `not-pending`
        // about this one.
        refusals.supersede(cancelKey);
      }
      return;
    }

    if (simCommand !== null && simCommand.type === 'HireStaff') {
      // The `GuardRoster.hire` producer (ADR 0025). Until this branch
      // existed, `hire` had zero callers anywhere in `src/` and every call in
      // the repository was in a test -- so `DeploymentSystem`, `PatrolSystem`,
      // `IncidentResponseSystem` and `SearchSystem` all iterated an empty
      // roster in every session a player could start.
      //
      // The tile is reconstructed with `tileCoordinate` rather than passed
      // through as a pair of numbers, exactly as `PlaceBuildOrder`'s is in
      // `construction/handler.ts`: the schema proves the values are integers
      // and this proves they are *tile* coordinates, which is the branded type
      // `GuardRoster.hire` takes.
      //
      // A refused hire travels the same route as a refused purchase, and the
      // same two-sided dispatch applies: `src/main.ts` checks the wage against
      // the balance the worker last published and throws instead of
      // submitting, so one press produces exactly one player-visible message
      // -- from the pre-flight or from this line, never both and never
      // neither. Of the three reasons, only `insufficient-funds` currently
      // arrives here from the Staff panel, and only in the two cases that
      // check cannot see: several hires inside one tick measured against a
      // balance none of them has been deducted from yet, and a balance that
      // moved since the last publication. `unknown-role` is pre-empted by the
      // panel offering catalogue rows only, and `roster-full` needs 500 hires.
      // All three stay reachable from a `HireStaff` composed anywhere else --
      // a queued command in a restored save, a future producer -- which is why
      // this maps the whole union rather than the one reason a panel can
      // provoke.
      const outcome = staffHiring.hire({
        staffRoleId: simCommand.staffRoleId,
        originTile: { x: tileCoordinate(simCommand.x), y: tileCoordinate(simCommand.y) },
      });
      const hireKey = hireSupersessionKey(simCommand.staffRoleId);
      if (outcome.kind === 'refused') {
        refusals.record(HIRE_REFUSAL_REASONS[outcome.reason], context.tick, hireKey);
      } else {
        // Issue #492, keyed per role -- see the key module's section comment
        // for the trade-off this makes against `roster-full`.
        refusals.supersede(hireKey);
      }
      return;
    }

    if (simCommand !== null && simCommand.type === 'PlaceObject') {
      /*
       * The sixth command that is not a construction order -- and the one that
       * *becomes* one (ADR 0028 decision 4).
       *
       * It is routed here rather than into `construction/handler.ts` for the
       * reason `ZoneRoom` is: the decision this command needs is about rooms and
       * objects, not about walls. `ObjectPlacementService.place` validates the
       * whole footprint against the world, the objects already standing and the
       * footprints of orders still in flight, and only then submits a
       * `BuildOrder` through the construction system -- so from that point on a
       * bed waits for materials and advances on the same schedule a wall does.
       *
       * `definitionId` is a `BUILDABLE_REGISTRY` id (`bed-wooden`), not an
       * object-catalog id: the buildable is what carries the material
       * requirement and the work, and it names the object it places. The
       * distinction matters at exactly one refusal --
       * `not-a-placeable-object` -- which is what a producer gets for sending
       * this command for `wall-brick`.
       *
       * **`src/main.ts` refuses nothing before submitting**, unlike a purchase,
       * a hire or an admission. There is no pre-flight check to make: every one
       * of the seven reasons is about the world at the tick the command
       * executes, and the main thread holds no copy of the zoning plane, the
       * placed objects or the order list. So this line is the *only* route a
       * refused placement reaches the player by, which is why the whole union
       * is mapped rather than the subset a panel can provoke.
       *
       * The lookup is exhaustive over `PlaceObjectRefusalReason`, so an eighth
       * reason fails to compile until it has a wire id and a message key.
       */
      const outcome = objectPlacement.place(
        {
          definitionId: simCommand.definitionId,
          orderId: simCommand.orderId,
          x: simCommand.x,
          y: simCommand.y,
        },
        context.tick,
      );
      const placeKey = placeObjectSupersessionKey(simCommand.definitionId, simCommand.x, simCommand.y);
      if (outcome.kind === 'refused') {
        refusals.record(PLACE_OBJECT_REFUSAL_REASONS[outcome.reason], context.tick, placeKey);
      } else {
        // Issue #492: the buildable and the tile, not the order id -- see the
        // key module's section comment.
        refusals.supersede(placeKey);
      }
      return;
    }

    if (simCommand !== null && simCommand.type === 'RemoveObject') {
      /*
       * The seventh command routed here, and the other half of the gesture the
       * sixth one is (ADR 0028 phase 3).
       *
       * It reaches the same service as `PlaceObject` and takes the same route
       * out: one call, one outcome, and a refusal recorded on the session's
       * `RefusalLog` through an exhaustive lookup, so a second removal refusal
       * reason fails to compile until it has a wire id and a message key. That
       * sameness is the point -- a player who is told why a bed could not be
       * placed and left guessing why one could not be removed would be reading
       * two different interfaces.
       *
       * **`src/main.ts` refuses nothing before submitting**, for the reason it
       * refuses nothing before a placement: the only condition a removal can be
       * refused for is about the placed objects and the order list, and the main
       * thread holds neither. So this line is the only route a refused removal
       * reaches the player by.
       *
       * The command carries no order id and mints none. What it can do is
       * *cancel* one -- a placement still in flight, whose tile would otherwise
       * stay claimed with nothing standing on it -- and the order it cancels is
       * found from the tile rather than named on the wire.
       */
      const outcome = objectPlacement.remove({ x: simCommand.x, y: simCommand.y }, context.tick);
      const removeKey = removeObjectSupersessionKey(simCommand.x, simCommand.y);
      if (outcome.kind === 'refused') {
        refusals.record(REMOVE_OBJECT_REFUSAL_REASONS[outcome.reason], context.tick, removeKey);
      } else {
        // Issue #492: the tile. A removal elsewhere must not silence a
        // standing `nothing-to-remove` about this one.
        refusals.supersede(removeKey);
      }
      return;
    }

    if (simCommand !== null && simCommand.type === 'ReleaseGuardAssignment') {
      /*
       * The producer `GuardRoster.unassign` never had for a claimed guard (ADR
       * 0034, answering ADR 0033 open question 3).
       *
       * ADR 0033 measured why this matters and put it in one sentence: *"the
       * absence of one is what made this defect terminal rather than merely
       * slow, and it will make the next resource-claiming system's equivalent
       * bug terminal too."* Before this branch, every caller of
       * `GuardRoster.unassign` in `src/` was inside the system that had made the
       * claim, and each of those callers only ever fires when that system
       * decides the claim is over -- so a claim whose owner had lost track of it
       * was permanent, and #352 is the shape of that happening.
       *
       * **`GuardReleaseService.release`, not `GuardRoster.unassign`.** The
       * difference is the whole of ADR 0034: the claim lives in the claimant's
       * bookkeeping, not on the roster, so unassigning without telling the
       * claimant swaps a stuck guard for a corrupt one -- a search job still
       * routing somebody `DeploymentSystem` has since sent to a post, a response
       * still counting somebody toward `arrivedGuardIds`. The service asks the
       * claimant to drop the guard and then performs the one roster write.
       *
       * **No pre-check on the main thread**, for `CancelBuildOrder`'s and
       * `CancelMaterialPurchase`'s reason: whether a guard is still held, and by
       * what, is not something this thread's cadence-stale copy of the roster may
       * decide. So this line is the only route a refused release reaches the
       * player by, and the whole union is mapped rather than the one reason the
       * panel can provoke.
       *
       * The lookup is exhaustive over `GuardReleaseRefusalReason`, so a third
       * reason fails to compile until it has a wire id and a message key.
       */
      const outcome = guardRelease.release(simCommand.guardId);
      const releaseKey = releaseGuardSupersessionKey(simCommand.guardId);
      if (outcome.kind === 'refused') {
        refusals.record(RELEASE_GUARD_REFUSAL_REASONS[outcome.reason], context.tick, releaseKey);
      } else {
        // Issue #492: the guard id. Releasing a different guard must not
        // silence a standing refusal about this one.
        refusals.supersede(releaseKey);
      }
      return;
    }

    constructionCommands(command, context);
  };
}
