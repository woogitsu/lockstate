import { createConstructionCommandHandler } from '../construction';
import type { ProcurementSystem } from '../economy';
import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import { PURCHASE_REFUSAL_REASONS, ZONE_REFUSAL_REASONS, type RefusalLog } from '../refusals';
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
 *
 * `refusals` is the session's `RefusalLog`, and all three routes write to the
 * same one: a refused wall, a refused purchase and a refused zoning
 * rectangle are the same kind of fact about the session -- the kernel took
 * the command and a system then declined to carry it out -- and they reach
 * the player down one channel (#261).
 */
export function createSessionCommandHandler(
  construction: ConstructionSystem,
  procurement: ProcurementSystem,
  roomZoning: RoomZoningService,
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

    if (simCommand !== null && simCommand.type === 'PurchaseMaterials') {
      // The outcome used to be dropped here, and the comment that stood in
      // this place said so: "a refusal -- `insufficient-funds`,
      // `unknown-material` -- has nowhere to go", because the kernel's
      // command handler returns `void` and the worker's reply to a command
      // acknowledges *receipt*, not effect. It has somewhere to go now, and
      // it is the route that comment predicted would be needed: the same one
      // #225 built for a refused wall, reaching the HUD as an alert rather
      // than as a command result (#261).
      //
      // The lookup is exhaustive over `PurchaseRefusalReason`, so a fifth
      // refusal reason added to `ProcurementSystem` fails to compile until it
      // is given a wire id and a message key.
      const outcome = procurement.purchase(simCommand.orderId, simCommand.itemId, simCommand.quantity, context.tick);
      if (!outcome.ok) refusals.record(PURCHASE_REFUSAL_REASONS[outcome.reason], context.tick);
      return;
    }
    constructionCommands(command, context);
  };
}
