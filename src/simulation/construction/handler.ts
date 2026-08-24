import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import { tileCoordinate } from '../world/coordinates';
import { createBuildOrder } from './build-order';
import type { ConstructionSystem } from './system';

export function createConstructionCommandHandler(
  constructionSystem: ConstructionSystem,
): CommandHandler {
  return (command) => {
    const simCommand = unpackCommand(command.payload as never);
    if (simCommand === null) return;

    switch (simCommand.type) {
      case 'PlaceBuildOrder': {
        // `edge` is passed straight through, including when it is absent: an
        // order that carries no edge resolves to `DEFAULT_BUILD_EDGE` at the
        // point of use, so the command, the order and the world all agree
        // without this layer inventing a value.
        const order = createBuildOrder(
          simCommand.orderId,
          simCommand.definitionId,
          {
            x: tileCoordinate(simCommand.x),
            y: tileCoordinate(simCommand.y),
          },
          simCommand.edge,
        );
        constructionSystem.submitOrder(order);
        constructionSystem.registerTransactionOrder(order.id, simCommand.transactionId);
        break;
      }

      case 'CancelBuildOrder':
        try {
          constructionSystem.cancelOrder(simCommand.orderId);
        } catch {
          // Cancellation is intentionally idempotent at the command boundary.
        }
        break;

      case 'Undo':
        constructionSystem.undo();
        break;

      case 'Redo':
        constructionSystem.redo();
        break;

      // `ZoneRoom` is deliberately absent. It used to have a branch here that
      // did nothing, under a comment saying zoning is not a construction
      // order -- true, and the reason it now reaches `RoomZoningService`
      // through `runtime/session-commands.ts` instead (#261). The switch is
      // over the whole command union and no longer covers all of it, which is
      // the accurate shape: this handler consumes construction commands only.
    }
  };
}
