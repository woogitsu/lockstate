import type { SimulationEventLog } from '../events';
import type { CommandHandler } from '../kernel/kernel';
import { unpackCommand } from '../protocol/commands';
import {
  BUILD_REFUSAL_REASONS,
  PURCHASE_REFUSAL_REASONS,
  buildSupersessionKey,
  materialsFundingSupersessionKey,
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
 *
 * @param events Where a cancellation, an undo or a redo that **succeeded** is
 * recorded so the player is told it worked (the owner's ruling of 2026-09-01 on
 * [#749](https://github.com/matmaxalez/lockstate/issues/749)).
 *
 * **Required for `refusals`' reason, and the defect it answers is that reason's
 * mirror.** Until #749 these three controls said nothing at all when they
 * succeeded: `docs/research/2026-09-01-what-act-six-never-reached.md` D2
 * measured it by playing, and found the only feedback was a row vanishing from
 * a fold that starts collapsed. A refusal sink with no success sink meant this
 * handler could report every way a command could fail and no way it could work.
 *
 * **Why the success is recorded here and not inside `ConstructionSystem`.**
 * `cancelOrder` is reached from four places -- this handler, `undo()`,
 * `withdrawOrdersAwaitingMaterial`, and `ObjectPlacementService`'s removal of
 * an object whose order has not finished -- and only the first is the press
 * #749 is about. Recording inside the system would announce a cancellation per
 * order every time #687's withdrawal walked the queue after a cancelled
 * delivery, which is fifteen sentences for one press. The command boundary is
 * where "the player asked for *this*" is known.
 *
 * **The fourth of those is a finding rather than a footnote**, and it is left
 * for the owner rather than decided here: `RemoveObject` on a tile whose object
 * is still being built cancels that build order and says nothing, which is D2's
 * defect one control over. It is outside the four #749 names, and giving it a
 * sentence means choosing between the two this file already has -- or writing a
 * third -- which is copy, and copy is the owner's.
 */
export function createConstructionCommandHandler(
  constructionSystem: ConstructionSystem,
  refusals: RefusalLog,
  events: SimulationEventLog,
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
        //
        // `command.sequence` is the placement ordinal (ADR 0082 decision 2,
        // #722), and this is the line that stamps it. It is the kernel's own
        // counter, not a number this layer invents: the kernel refuses a
        // command whose sequence is not exactly the one it expects, so the
        // value is strictly increasing across the whole session with no gaps
        // and no duplicates, and it is persisted as
        // `KernelSnapshot.expectedSequence` so a session that reloads carries
        // on above every ordinal in the save. Taking it here rather than
        // inside `ConstructionSystem` is what keeps the construction system a
        // function of the order book -- it never reads the clock or the
        // command queue, and an order built by a fixture simply has no
        // ordinal.
        const order = createBuildOrder(
          simCommand.orderId,
          simCommand.definitionId,
          {
            x: tileCoordinate(simCommand.x),
            y: tileCoordinate(simCommand.y),
          },
          simCommand.edge,
          command.sequence,
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

      case 'CancelBuildOrder': {
        /*
         * The state is read **before** the cancellation and used after it, and
         * the ordering is the whole of what makes two sentences possible: every
         * cancelled order reads `'cancelled'` afterwards, so the distinction
         * the owner's ruling of 2026-09-01 (#749) splits the sentence on --
         * money back, or the crew had started and what it used is gone -- is
         * gone the moment `cancelOrder` returns. Read from `getOrder` rather
         * than through a new return value on `cancelOrder`, because the ruling
         * declines that plumbing: the *amount* stays unreachable here and
         * neither sentence names one.
         *
         * **The research this implements said the handler already read the
         * state, and it did not** -- the 2026-09-01 copy-variants research
         * (branch `docs/copy-variants-for-the-owner`) section 5a, *"read by the
         * handler before `cancelOrder` is called"*.
         * `cancelOrder` reads it privately; this line is what makes the claim
         * true. The correction does not change the ruling -- the state was
         * reachable, one level down -- and it is recorded rather than quietly
         * fixed.
         */
        const stateAtCancellation = constructionSystem.getOrder(simCommand.orderId)?.state;
        try {
          constructionSystem.cancelOrder(simCommand.orderId);
        } catch {
          // Cancellation is intentionally idempotent at the command boundary.
          break;
        }
        // Reached only when `cancelOrder` returned, which is the one moment the
        // cancellation is a fact. `stateAtCancellation` is defined here by
        // construction -- `cancelOrder` throws for an id it cannot find -- and
        // the guard states that to the compiler rather than doubting it.
        if (stateAtCancellation !== undefined) events.recordBuildOrderCancelled(stateAtCancellation, context.tick);
        break;
      }

      /*
       * Undo and Redo say so when they worked, and say nothing when they did
       * not (#749).
       *
       * The `boolean` is the whole reason those methods now answer one: a press
       * against an empty history reverses nothing, and confirming a reversal
       * that did not happen is the promise the code does not keep that
       * `AGENTS.md`'s fourth exclusion reserves. Neither sentence names a count
       * -- the owner's ruling, because an undo reverses a whole transaction and
       * naming one order would be a small lie whenever a run of several was
       * taken back. The transaction size is known inside `ConstructionSystem`
       * and is deliberately left there.
       */
      case 'Undo':
        if (constructionSystem.undo()) events.recordConstructionUndone(context.tick);
        break;

      case 'Redo':
        if (constructionSystem.redo()) events.recordConstructionRedone(context.tick);
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
 * **That sentence is not the shipped one any more.** The owner's ruling 23 of
 * 2026-08-31 replaced it with *"Nothing was bought — that would go past what
 * the state will carry."*, the host's own words for the same refusal. The
 * argument above is unaffected and is quoted as it stood: the point was that
 * this route reuses whatever `purchase.insufficient-funds` says rather than
 * authoring a string of its own, and it still does.
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
 * **AND SINCE #703 RULING 9 THE SHIPPED SENTENCE IS PARTLY FALSE, WHICH IS
 * WHAT IS NOW OWED RATHER THAN WHAT WOULD MERELY SAY MORE.** The English text
 * behind `purchase.insufficient-funds` was *"The materials were not ordered —
 * there are not enough funds."* (`src/content/default-locale-en.ts`), and it
 * was true word for word while a pass bought the whole per-item lump or none of
 * it. A pass now funds as many whole build orders as the balance covers, so the
 * common case this line reports is *some materials were ordered and some were
 * not* -- and the first clause of that sentence denies the half that happened.
 * The money left the treasury, which is precisely why ADR 0081 Decision 3 calls
 * telling the player *"a precondition rather than a nicety"*.
 *
 * **Ruling 23 changed the sentence and did not close this**, which is worth
 * saying explicitly rather than leaving to be re-discovered. It now reads
 * *"Nothing was bought — that would go past what the state will carry."*, so
 * the *reason* clause became true of this route as well -- `unfunded` is
 * populated behind `Treasury.canAfford` and nowhere else, and every non-money
 * refusal goes to `unprocurable` instead -- while the *outcome* clause is
 * denying the same half it denied before, in the same way and for the same
 * reason. The three ways out below are unchanged and so is the open question
 * they end at.
 *
 * **Left as it is, deliberately, and named here rather than patched around.**
 * The three ways out are all worse or not this change's:
 *
 * - Suppressing the refusal when `report.purchased` is non-empty would leave a
 *   prison whose queue is stalled on money with nothing on the alert band at
 *   all, which is the whole of #629 reintroduced.
 * - Picking a different existing key would be reusing a sentence written about
 *   something else, which the namespace argument in
 *   `src/simulation/protocol/types.ts` exists to forbid.
 * - A sentence that says what *was* bought and what was not is new copy.
 *   `AGENTS.md`'s fourth exclusion reserves it, and ADR 0081's open question 2
 *   -- *"what the player is told, and whether a partial fill is a
 *   refusal-class sentence or an event-class one"* -- is exactly this question,
 *   put to the owner and not answered.
 *
 * So: this is the place, it is empty, and the figure the owner would need is
 * already carried -- `MaterialsProcurementReport.purchased`, summed per item id
 * over every order the pass funded, beside the `unfunded` this function reads.
 *
 * ## The supersession key
 *
 * `materialsFundingSupersessionKey()`, which is domain-wide -- see its own
 * comment for why `purchaseSupersessionKey(itemId, quantity)` is the wrong
 * width here, and for the measurement that says so.
 *
 * A pass that funded everything withdraws a standing shortfall
 * unconditionally, rather than only when it bought something: "the queue is
 * paid for" is equally true of a pass that had nothing to buy, and a player
 * who fixed the shortfall by pressing *Buy* themselves would otherwise be left
 * reading a notice about it.
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
 *
 * Exported because `PlaceObject` reaches the same construction queue by a
 * different door (`runtime/session-commands.ts`, ADR 0028 decision 4) and a
 * player who is told why a wall could not be paid for must not be left
 * guessing why a bed could not.
 */
export function reportMaterialsFunding(
  report: MaterialsProcurementReport | undefined,
  refusals: RefusalLog,
  tick: number,
): void {
  if (report === undefined) return;
  const unfunded = report.unfunded[0];
  if (unfunded === undefined) {
    refusals.supersede(materialsFundingSupersessionKey());
    return;
  }
  refusals.record(PURCHASE_REFUSAL_REASONS['insufficient-funds'], tick, materialsFundingSupersessionKey());
}
