import { createConstructionCommandHandler } from '../construction';
import type { ProcurementSystem } from '../economy';
import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import {
  HIRE_REFUSAL_REASONS,
  PURCHASE_REFUSAL_REASONS,
  UNZONE_REFUSAL_REASONS,
  ZONE_REFUSAL_REASONS,
  type RefusalLog,
} from '../refusals';
import type { ConstructionSystem } from '../construction/system';
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
 *
 * **The delegation is total, not a fallback.** Every command this does not
 * handle is passed through unchanged, including ones neither layer handles --
 * `unpackCommand` returning `null` is the decoder's business and is left to
 * the handler that owns it.
 *
 * `refusals` is the session's `RefusalLog`, and all five routes write to the
 * same one: a refused wall, a refused purchase, a refused zoning rectangle, a
 * refused removal and a refused hire are the same kind of fact about the
 * session -- the kernel took the command and a system then declined to carry
 * it out -- and they reach the player down one channel (#261).
 */
export function createSessionCommandHandler(
  construction: ConstructionSystem,
  procurement: ProcurementSystem,
  roomZoning: RoomZoningService,
  staffHiring: StaffHiringService,
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

    constructionCommands(command, context);
  };
}
