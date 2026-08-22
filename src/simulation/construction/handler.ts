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
        const order = createBuildOrder(
          simCommand.orderId,
          simCommand.definitionId,
          {
            x: tileCoordinate(simCommand.x),
            y: tileCoordinate(simCommand.y),
          },
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

      case 'ZoneRoom':
        // Room zoning is owned by the room system and is not a construction order.
        break;
    }
  };
}
