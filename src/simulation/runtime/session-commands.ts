import { createConstructionCommandHandler } from '../construction';
import type { ProcurementSystem } from '../economy';
import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import type { ConstructionSystem } from '../construction/system';

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
 * shape a reader has to already know about to find. This file is where the
 * next non-construction command goes too.
 *
 * **The delegation is total, not a fallback.** Every command this does not
 * handle is passed through unchanged, including ones neither layer handles --
 * `unpackCommand` returning `null` is the decoder's business and is left to
 * the handler that owns it.
 */
export function createSessionCommandHandler(
  construction: ConstructionSystem,
  procurement: ProcurementSystem,
): CommandHandler {
  const constructionCommands = createConstructionCommandHandler(construction);

  return (command, context) => {
    const simCommand = unpackCommand(command.payload as never);
    if (simCommand !== null && simCommand.type === 'PurchaseMaterials') {
      // The outcome is deliberately dropped here, and that is a gap this
      // slice leaves open rather than an oversight. A refusal --
      // `insufficient-funds`, `unknown-material` -- has nowhere to go: the
      // kernel's command handler returns `void`, and the worker's reply to a
      // command is an acknowledgement of *receipt*, not of effect. Telling
      // the player a purchase was refused is the same problem #225 solved for
      // a refused wall, and it needs the same route: an intent the HUD
      // dispatched and can report on. Recorded on #96.
      procurement.purchase(simCommand.orderId, simCommand.itemId, simCommand.quantity, context.tick);
      return;
    }
    constructionCommands(command, context);
  };
}
