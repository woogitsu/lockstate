import { createConstructionCommandHandler } from '../construction';
import type { ProcurementSystem } from '../economy';
import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import {
  ADMIT_REFUSAL_REASONS,
  HIRE_REFUSAL_REASONS,
  PLACE_OBJECT_REFUSAL_REASONS,
  PURCHASE_REFUSAL_REASONS,
  UNZONE_REFUSAL_REASONS,
  ZONE_REFUSAL_REASONS,
  type RefusalLog,
} from '../refusals';
import type { ConstructionSystem } from '../construction/system';
import type { ObjectPlacementService } from '../objects';
import type { PrisonerOperationsRuntime } from '../prisoners/prisoner-operations-runtime';
import type { RoomZoningService } from '../rooms/zoning';
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
 * `refusals` is the session's `RefusalLog`, and all seven routes write to the
 * same one: a refused wall, a refused purchase, a refused zoning rectangle, a
 * refused removal, a refused hire, a refused admission and a refused object
 * placement are the same kind of fact about the session -- the kernel took the
 * command and a system then declined to carry it out -- and they reach the
 * player down one channel (#261).
 */
export function createSessionCommandHandler(
  construction: ConstructionSystem,
  procurement: ProcurementSystem,
  roomZoning: RoomZoningService,
  staffHiring: StaffHiringService,
  runtimePrisoners: PrisonerOperationsRuntime,
  objectPlacement: ObjectPlacementService,
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
      if (outcome.kind === 'refused') refusals.record(ZONE_REFUSAL_REASONS[outcome.reason], context.tick);
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
      // states what "covers" means -- each covered zoned tile is grown into
      // its connected same-type run before anything is cleared -- and both
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
      if (outcome.kind === 'refused') refusals.record(UNZONE_REFUSAL_REASONS[outcome.reason], context.tick);
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
      if (outcome.kind === 'refused') refusals.record(ADMIT_REFUSAL_REASONS[outcome.reason], context.tick);
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
      // **The clock has to run before this line is reached at all**, so the
      // one message a refused press produces is not always immediate.
      // `Kernel.step()` is what dispatches a command queued by `submitCommand`,
      // and `FixedStepClock.pump` returns zero executed ticks while its mode is
      // `paused`, so the worker steps nothing and a purchase submitted against
      // a paused clock is not refused yet -- it is not dispatched yet. Its
      // refusal, if it is refused, arrives when the clock next runs. That is
      // also why a paused run of presses is each measured by the main-thread
      // check against one unchanged balance: none of them has been dispatched,
      // so none of them has spent anything.
      //
      // The lookup is exhaustive over `PurchaseRefusalReason`, so a fifth
      // refusal reason added to `ProcurementSystem` fails to compile until it
      // is given a wire id and a message key.
      const outcome = procurement.purchase(simCommand.orderId, simCommand.itemId, simCommand.quantity, context.tick);
      if (!outcome.ok) refusals.record(PURCHASE_REFUSAL_REASONS[outcome.reason], context.tick);
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
      if (outcome.kind === 'refused') refusals.record(HIRE_REFUSAL_REASONS[outcome.reason], context.tick);
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
      if (outcome.kind === 'refused') refusals.record(PLACE_OBJECT_REFUSAL_REASONS[outcome.reason], context.tick);
      return;
    }

    constructionCommands(command, context);
  };
}
