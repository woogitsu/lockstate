import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import { BUILD_REFUSAL_REASONS, type RefusalLog } from '../refusals';
import { tileCoordinate } from '../world/coordinates';
import { createBuildOrder } from './build-order';
import type { ConstructionSystem } from './system';

/**
 * @param refusals Where an order the construction system fails is recorded so
 * the player can be told (#261).
 *
 * **Required, not optional.** An optional sink is exactly how this wiring
 * would be lost again: `tests/foundation/composition-root-contract.test.ts`
 * records that making a seam optional let its one production caller be
 * deleted with the whole suite green (#199), and a refusal nobody records is
 * the defect #261 exists to remove. A caller with no interest in refusals
 * constructs a `RefusalLog` and ignores it, which costs one object and states
 * the choice.
 */
export function createConstructionCommandHandler(
  constructionSystem: ConstructionSystem,
  refusals: RefusalLog,
): CommandHandler {
  return (command, context) => {
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
        // Read straight off the order the system just decided on, rather than
        // through a second return value: `submitOrder` writes `state` and
        // `failReason` onto the order it was handed and that is the one
        // authority on what happened to it. A parallel outcome type could
        // disagree with the order's own state, and the order is what the
        // renderer and the save both read.
        //
        // `failReason` is a closed union since #261, so the lookup is total:
        // there is no `?? 'unknown'` here, and there cannot be one.
        if (order.state === 'failed' && order.failReason !== undefined) {
          refusals.record(BUILD_REFUSAL_REASONS[order.failReason], context.tick);
        }
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
