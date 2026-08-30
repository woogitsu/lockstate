import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import {
  BUILD_REFUSAL_REASONS,
  PURCHASE_REFUSAL_REASONS,
  buildSupersessionKey,
  purchaseSupersessionKey,
  type RefusalLog,
} from '../refusals';
import { tileCoordinate } from '../world/coordinates';
import { createBuildOrder, resolveBuildEdge } from './build-order';
import type { MaterialsProcurementReport } from './materials-procurement';
import type { ConstructionSystem } from './system';

/**
 * @param refusals Where an order the construction system fails is recorded so
 * the player can be told (#261), and where a later order the system accepts
 * withdraws that record if it was about the same tile, buildable and edge
 * (#492) -- see `buildSupersessionKey`.
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
        const buildKey = buildSupersessionKey(
          order.definitionId,
          order.location.x,
          order.location.y,
          resolveBuildEdge(order),
        );
        if (order.state === 'failed' && order.failReason !== undefined) {
          refusals.record(BUILD_REFUSAL_REASONS[order.failReason], context.tick, buildKey);
        } else {
          // Issue #492: the same tile, buildable and edge, accepted this
          // time. A wall placed elsewhere must not silence a standing
          // refusal about this one.
          refusals.supersede(buildKey);
          reportMaterialsFunding(constructionSystem.procureQueuedMaterials(context.tick), refusals, context.tick);
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

/**
 * Tells the player what the order they just placed could not buy for itself
 * (issues #627 and #629).
 *
 * ## Why this exists at all
 *
 * ADR 0017 decision 7 is what `ConstructionSystem.procureQueuedMaterials`
 * implements -- materials are just-in-time, holding is never required -- and
 * **decision 2 of the same ADR rides with it**: *"a purchase that cannot be
 * afforded must be refusable."* A purchase nobody pressed a button for still
 * has to be refusable, and a refusal nobody can observe is not one. This is
 * where it becomes observable, on the press that caused it.
 *
 * Issue #629 is why it is not enough to leave it on a projection. The whole of
 * #627 is a fact that *was* representable -- the build queue's *"Awaiting
 * Materials"* row -- and lived inside a fold that starts shut, so it reached
 * nobody. The owner's directive is that a mechanic the player must discover in
 * order to proceed is a defect. The alert band is the channel that does not
 * have to be opened.
 *
 * ## Why `purchase.insufficient-funds` and not a new refusal id
 *
 * **Because it is exactly that refusal, produced by exactly that code.**
 * `ProcurementSystem.purchase` returned `{ ok: false, reason:
 * 'insufficient-funds' }` and `Treasury.spend` refused, the same two calls a
 * `PurchaseMaterials` command reaches; the only difference is who asked. The
 * shipped sentence -- *"The materials were not ordered — there are not enough
 * funds."* -- is true word for word of what happened, and reusing it means
 * this change authors **no player-facing string**, which `AGENTS.md` reserves
 * to the owner.
 *
 * The namespace argument in `src/simulation/protocol/types.ts` is what makes
 * that sound rather than convenient: the namespaces exist so that "somebody who
 * pressed Cancel on a delivery must not read that the materials were not
 * ordered". Here the materials genuinely were not ordered, and for genuinely
 * that reason.
 *
 * **What is owed, and it is the owner's:** a `build.*`-namespaced sentence
 * would say more, because it could name the wall as well as the money -- and
 * it would need a new `RefusalReason` member, a new
 * `hud.alert.refusal.build.*` key and its English text. That is new copy and
 * it is not this change's to write. Reported on #627 rather than guessed at
 * here.
 *
 * ## The supersession key
 *
 * `purchaseSupersessionKey(itemId, quantity)` -- the same key
 * `session-commands.ts` uses for the same reason on the `PurchaseMaterials`
 * route, so the two routes cannot disagree about what withdraws what. A
 * just-in-time purchase that *succeeds* withdraws a standing refusal about the
 * identical item and quantity, which is what happens when the state pays and
 * the queue that was unaffordable a moment ago is funded.
 *
 * Only the **first** unfunded item is recorded, because `RefusalLog` holds one
 * refusal: it replaces rather than accumulates, so recording several would
 * report only the last while counting all of them. Ascending item id makes
 * *which* one a property of the catalogue rather than of iteration order, and
 * in every session this repository can produce there is exactly one, because
 * no buildable requires two materials.
 *
 * `undefined` means no sink was wired -- a bare `ConstructionSystem` rather
 * than a session -- and is deliberately not read as "everything is funded".
 */
function reportMaterialsFunding(
  report: MaterialsProcurementReport | undefined,
  refusals: RefusalLog,
  tick: number,
): void {
  if (report === undefined) return;
  for (const bought of report.purchased) {
    refusals.supersede(purchaseSupersessionKey(bought.itemId, bought.quantity));
  }
  const unfunded = report.unfunded[0];
  if (unfunded === undefined) return;
  refusals.record(
    PURCHASE_REFUSAL_REASONS['insufficient-funds'],
    tick,
    purchaseSupersessionKey(unfunded.itemId, unfunded.quantity),
  );
}
