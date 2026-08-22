import type { CommandHandler, SimulationContext } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import type { ConstructionSystem } from './system';
import { createBuildOrder } from './build-order';

export function createConstructionCommandHandler(
  constructionSystem: ConstructionSystem
): CommandHandler {
  return (command, context) => {
    const simCommand = unpackCommand(command.payload as any);
    if (!simCommand) return;

    switch (simCommand.type) {
      case 'PlaceBuildOrder': {
        const order = createBuildOrder(
          simCommand.orderId,
          simCommand.definitionId,
          { x: simCommand.x, y: simCommand.y, layer: 'terrain' }
        );
        constructionSystem.submitOrder(order);
        constructionSystem.registerTransactionOrder(order.id, simCommand.transactionId);
        break;
      }
        
      case 'CancelBuildOrder':
        try {
          constructionSystem.cancelOrder(simCommand.orderId);
        } catch (e) {
          // Log or handle gracefully in simulation
        }
        break;
      case 'Undo':
        constructionSystem.undo();
        break;
        
      case 'Redo':
        constructionSystem.redo();
        break;
    }
  };
}
