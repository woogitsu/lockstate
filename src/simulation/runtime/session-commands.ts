import { createConstructionCommandHandler } from '../construction';
import type { ProcurementSystem } from '../economy';
import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import type { ConstructionSystem } from '../construction/system';
import type { RoomZoningService } from '../rooms/zoning';

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
 * from here instead.
 *
 * **The delegation is total, not a fallback.** Every command this does not
 * handle is passed through unchanged, including ones neither layer handles --
 * `unpackCommand` returning `null` is the decoder's business and is left to
 * the handler that owns it.
 */
export function createSessionCommandHandler(
  construction: ConstructionSystem,
  procurement: ProcurementSystem,
  roomZoning: RoomZoningService,
): CommandHandler {
  const constructionCommands = createConstructionCommandHandler(construction);

  return (command, context) => {
    const simCommand = unpackCommand(command.payload as never);
    if (simCommand !== null && simCommand.type === 'ZoneRoom') {
      // The outcome is not dropped, and it does not reach the player either.
      // `RoomZoningService.zone` keeps a refusal in its own bounded window
      // because a command handler returns `void` and a worker's reply to a
      // command acknowledges receipt rather than effect -- the same missing
      // route the purchase below records, tracked as step 2 of #261. The
      // point of keeping it is that the route, when it exists, reads a
      // reason instead of guessing one.
      //
      // `simCommand.roomId` is the room *catalog* id (`room.cell`), not an
      // instance id: the command schema named the field before instances
      // existed, and renaming a field that a queued command in an existing
      // save may already carry is a save-compatibility change rather than a
      // rename.
      roomZoning.zone(
        {
          roomCatalogId: simCommand.roomId,
          x: simCommand.x,
          y: simCommand.y,
          width: simCommand.width,
          height: simCommand.height,
        },
        context.tick,
      );
      return;
    }

    if (simCommand !== null && simCommand.type === 'PurchaseMaterials') {
      // The outcome is deliberately dropped here, and that is a gap this
      // slice leaves open rather than an oversight. A refusal --
      // `insufficient-funds`, `unknown-material` -- has nowhere to go: the
      // kernel's command handler returns `void`, and the worker's reply to a
      // command is an acknowledgement of *receipt*, not of effect.
      //
      // #89 built the route a report would travel on -- the HUD dispatches a
      // `purchase-materials` intent and paints its own refusal line when the
      // host rejects it (issue #207) -- and reaching it from *here* still
      // needs something this handler does not have: a worker-to-main message
      // carrying the outcome. What the composition root does instead is
      // refuse before sending, against the balance the worker last published
      // (`src/main.ts`), which covers the refusal a player can actually
      // provoke and covers nothing this line drops. Recorded on #96.
      procurement.purchase(simCommand.orderId, simCommand.itemId, simCommand.quantity, context.tick);
      return;
    }
    constructionCommands(command, context);
  };
}
