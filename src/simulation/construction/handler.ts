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
      case 'PlaceBuildOrder':
        constructionSystem.submitOrder(createBuildOrder(
          simCommand.orderId,
          simCommand.definitionId,
          { x: simCommand.x, y: simCommand.y, layer: 'terrain' }
        ));
        break;
        
      case 'CancelBuildOrder':
        try {
          constructionSystem.cancelOrder(simCommand.orderId);
        } catch (e) {
          // Log or handle gracefully in simulation
        }
        break;
    }
  };
}
