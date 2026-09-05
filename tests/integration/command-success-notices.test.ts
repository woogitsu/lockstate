import { describe, expect, it, vi } from 'vitest';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import type { SimulationEvent } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * **What a control says when it works** (issue
 * [#749](https://github.com/matmaxalez/lockstate/issues/749), the owner's
 * ruling of 2026-09-01).
 *
 * ## What was measured, and by whom
 *
 * `docs/research/2026-09-01-what-act-six-never-reached.md` D2 played the game
 * and found that **Cancel on a queued build order, Cancel on a delivery, Undo
 * and Redo all say nothing when they succeed.** The only feedback was a row
 * vanishing from a fold that starts collapsed. The money was exactly right;
 * the player had no way to know that without doing the arithmetic themselves.
 *
 * ## What this file gates, and what it deliberately does not
 *
 * It gates the *simulation* half: that a press which succeeds records the right
 * event, that a press which does nothing records none, and that a press which
 * causes a cascade records **one**. What a player reads is
 * `tests/unit/ui-simulation-events.test.ts`'s subject, because the sentence and
 * the severity live on the far side of the worker boundary and the two halves
 * are checked where each of them is.
 *
 * Driven through the real `Kernel`, the real `packCommand` decoder and the real
 * session command router -- `createNewSimulationRuntime` -- rather than by
 * calling the handler directly, because the whole defect was about a route
 * being absent rather than about a function being wrong.
 *
 * ## Why the figures are literals
 *
 * A brick is 40 and `wall-brick` needs two of them, so a wall segment is 80 and
 * three bricks are 120. Written out rather than read back off
 * `PROCURABLE_MATERIALS`, for the reason `docs/TESTING.md` gives: an expected
 * value computed from the code under test's own input holds for any
 * implementation, including one that refunds the wrong amount consistently.
 */

const WALL = 'wall-brick';
const BRICK = 'item.brick';
/** Three bricks at 40. */
const THREE_BRICKS = 120;

function createSession(seed = 0x749) {
  const runtime = createNewSimulationRuntime(seed);
  let sequence = 0;

  const send = (command: SimulationCommand): void => {
    runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
  };

  /**
   * Several commands at one tick, dispatched before any system runs -- the only
   * way to observe a cancellation of an `'approved'` order through the real
   * command boundary, because `update` promotes it to `'materials-pending'`
   * inside the very step that dispatched the placement. Lifted from
   * `tests/integration/economy-money-conservation.test.ts`, whose own comment
   * argues the point at length.
   */
  const sendAtOneTick = (commands: readonly SimulationCommand[]): void => {
    const tick = runtime.kernel.tick;
    for (const command of commands) {
      runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, tick, packCommand(command));
      sequence += 1;
    }
    runtime.kernel.step();
  };

  const run = (ticks: number): void => {
    for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
  };

  /** Steps until the order reaches `state`, failing on the tick budget rather than hanging. */
  const runUntilState = (orderId: string, state: string, limit = 600): void => {
    for (let step = 0; step < limit; step += 1) {
      if (runtime.construction.getOrder(orderId)?.state === state) return;
      runtime.kernel.step();
    }
    throw new Error(
      `${orderId} never reached ${state}; it is ${String(runtime.construction.getOrder(orderId)?.state)}`,
    );
  };

  return {
    runtime,
    send,
    sendAtOneTick,
    run,
    runUntilState,
    /** Every event this session has recorded. The log is append-only, so this is the whole history. */
    said: (): readonly SimulationEvent[] => runtime.events.since(0),
    types: (): readonly string[] => runtime.events.since(0).map((event) => event.type),
    stateOf: (orderId: string): string | undefined => runtime.construction.getOrder(orderId)?.state,
  };
}

/** A wall order placed and its delivery landed, on a tile no other case uses. */
function placeWall(session: ReturnType<typeof createSession>, orderId: string, x: number, transactionId?: string): void {
  session.send({
    type: 'PlaceBuildOrder',
    orderId,
    definitionId: WALL,
    x,
    y: 6,
    edge: 'north',
    ...(transactionId === undefined ? {} : { transactionId }),
  });
}

describe('a build order that is cancelled says so, and says which of two things happened', () => {
  /*
   * The owner's ruling 2: two sentences, not one. Before the crew started the
   * money comes back; after, ruling 20 of 2026-08-31 destroys the materials on
   * purpose. Their reasoning -- *"silence about a loss is the worst option"* --
   * is why the second exists rather than the first being stretched over both.
   *
   * The four pre-start states are asserted one by one rather than as a
   * representative sample, because the split is a `switch` over
   * `BuildOrderLifecycleState` and a `switch` is exactly the thing that can be
   * right for three members and wrong for the fourth.
   */

  it('says the money came back when the order was still only planned', () => {
    /*
     * `'planned'` is the state where the sentence is *vacuously* true: nothing
     * was ever spent, because `pendingOrderDemand` never counts a planned order,
     * so nothing is refunded. It is covered by the refund sentence rather than
     * given a third one, and this case is what pins that decision -- a change
     * that gave it its own event has to come here and say so.
     *
     * Reached by cancelling an order the construction system has not seen yet:
     * `submitOrder` writes `'planned'` and `update` promotes it, so a cancel in
     * the same tick as the placement finds it before the promotion only if the
     * placement itself has not been stepped. `sendAtOneTick` dispatches both
     * before any system runs, which is `'approved'`; a genuinely `'planned'`
     * cancellation is not reachable from the command boundary at all, so this
     * case drives `recordBuildOrderCancelled` directly with the state the
     * handler would have read.
     */
    const session = createSession();
    session.runtime.events.recordBuildOrderCancelled('planned', 100);
    expect(session.types()).toEqual(['construction.order-cancelled']);
  });

  it('says the money came back for an approved order cancelled in the tick it was placed', () => {
    const session = createSession();
    session.sendAtOneTick([
      { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 6, edge: 'north' },
      { type: 'CancelBuildOrder', orderId: 'order-a' },
    ]);

    expect(session.stateOf('order-a')).toBe('cancelled');
    expect(session.types()).toEqual(['construction.order-cancelled']);
  });

  it('says the money came back while the bricks are still on the road', () => {
    const session = createSession();
    placeWall(session, 'order-b', 5);
    expect(session.stateOf('order-b')).toBe('materials-pending');

    session.send({ type: 'CancelBuildOrder', orderId: 'order-b' });
    expect(session.types()).toEqual(['construction.order-cancelled']);
  });

  it('says the money came back for an order holding its materials but not yet started', () => {
    const session = createSession();
    placeWall(session, 'order-c', 6);
    session.runUntilState('order-c', 'assigned');

    session.send({ type: 'CancelBuildOrder', orderId: 'order-c' });
    expect(session.types()).toEqual(['construction.order-cancelled']);
  });

  it('says the materials are gone once the crew has started, which is the other sentence', () => {
    const session = createSession();
    placeWall(session, 'order-d', 7);
    session.runUntilState('order-d', 'in-progress');

    session.send({ type: 'CancelBuildOrder', orderId: 'order-d' });
    expect(session.stateOf('order-d')).toBe('cancelled');
    expect(session.types()).toEqual(['construction.order-cancelled-underway']);
  });

  it('says nothing at all about a finished order, because neither sentence is true of one', () => {
    /*
     * The gap this change ships knowingly, pinned so it cannot close by
     * accident. A completed order is cancellable and `cancelOrder` reverses the
     * geometry, but the money did not come back (`refundSurplusOf` runs for
     * `'approved'` and `'materials-pending'` only) and the materials are not
     * gone either -- ADR 0076 decision B puts them in the container. No control
     * can reach the press: `PENDING_BUILD_ORDER_STATES` excludes `'completed'`,
     * so no Build-panel row names one, and only an order finishing between a
     * projection and the press that answers it gets here.
     *
     * **The clause about the materials became false on 2026-09-01 and is kept
     * rather than overwritten, because it is why this case says nothing.** The
     * owner's ruling of that date -- *"Taking a finished object away returns
     * nothing. Not its materials, not its money."*, ADR 0076's amendment of
     * that date -- reverses decision B: `cancelOrder`'s `hadGeometry` arm now
     * drops the allocation unreleased, so a completed order's materials **are**
     * gone. What is unchanged is the conclusion and the reason for it: neither
     * of the two sentences this file has is true of a completed order -- the
     * money still does not come back -- so it still says nothing, and the
     * sentence it deserves is still the owner's. Found while measuring #717.
     *
     * The sentence it deserves is the owner's to write. A change that adds one
     * fails here, which is the point.
     */
    const session = createSession();
    placeWall(session, 'order-e', 8);
    session.runUntilState('order-e', 'completed');

    session.send({ type: 'CancelBuildOrder', orderId: 'order-e' });
    expect(session.stateOf('order-e')).toBe('cancelled');
    expect(session.types(), 'a finished order has no approved sentence yet').toEqual([]);
  });

  it('says nothing when the cancellation named an order that does not exist', () => {
    /*
     * `createConstructionCommandHandler` swallows the throw deliberately -- the
     * queue on screen is a snapshot on a cadence, so an order can finish between
     * the publication and the press -- and a success sentence for a cancellation
     * that cancelled nothing would be the promise the code does not keep that
     * `AGENTS.md`'s fourth exclusion reserves.
     */
    const session = createSession();
    session.send({ type: 'CancelBuildOrder', orderId: 'order-that-never-was' });
    expect(session.types()).toEqual([]);
  });
});

describe('a cancelled delivery says so, and names what came back', () => {
  it('names the amount `ProcurementSystem.cancel` actually returned', () => {
    /*
     * The owner's ruling 3, and the one success sentence in the repository that
     * can name a figure: `cancel` already answers `refundedMinorUnits` -- the
     * delivery's *recorded* `paidMinorUnits`, never a recomputation from today's
     * catalogue price -- so the number was sitting at the call site unused.
     *
     * **Bound to the method's own return value rather than to a number written
     * here**, which is the assertion that would catch a handler passing the
     * wrong variable: the spy captures what `cancel` answered, and the event has
     * to carry that. The literal 120 is asserted beside it so the pair cannot
     * both be wrong in the same direction -- a `cancel` that refunded nothing
     * would satisfy the first assertion on its own.
     */
    const session = createSession();
    const cancelSpy = vi.spyOn(session.runtime.procurement, 'cancel');

    session.send({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: BRICK, quantity: 3 });
    expect(session.runtime.procurement.pendingDeliveries).toHaveLength(1);

    // The tick the command is dispatched on, which is the tick the event
    // carries -- not `kernel.tick` after the step, which has already moved on.
    // The same distinction `simulationEventEnvelopeFields` draws between an
    // event's own tick and the envelope the publication rides out on.
    const dispatchTick = session.runtime.kernel.tick;
    session.send({ type: 'CancelMaterialPurchase', orderId: 'buy-1' });

    const outcome = cancelSpy.mock.results[0]?.value as { ok: boolean; refundedMinorUnits?: number };
    expect(outcome.ok, 'the cancellation has to have succeeded for this case to mean anything').toBe(true);
    expect(outcome.refundedMinorUnits, 'three bricks at 40').toBe(THREE_BRICKS);

    expect(session.said()).toEqual([
      {
        sequence: 1,
        tick: dispatchTick,
        type: 'economy.delivery-cancelled',
        refundedMinorUnits: outcome.refundedMinorUnits,
      },
    ]);
  });

  it('says nothing when the delivery had already landed', () => {
    /*
     * The refusal path, which `cancel-purchase.not-pending` already covers and
     * which must not also produce a confirmation. Both halves reaching the
     * player at once would be the control saying it worked and did not work.
     */
    const session = createSession();
    session.send({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: BRICK, quantity: 3 });
    session.run(400);
    expect(session.runtime.procurement.pendingDeliveries, 'it landed').toHaveLength(0);

    const before = session.types().length;
    session.send({ type: 'CancelMaterialPurchase', orderId: 'buy-2' });
    expect(session.types().slice(before)).toEqual([]);
  });

  it('says it once when cancelling a delivery withdraws a queue of orders behind it (#687)', () => {
    /*
     * **The case that decides where the recording lives**, and the reason it is
     * in the command handler rather than in `ConstructionSystem.cancelOrder`.
     *
     * `cancelOrder` has three callers: the handler, `undo()`, and
     * `withdrawOrdersAwaitingMaterial`, which #687 added so that cancelling a
     * just-in-time delivery also withdraws the orders that were waiting on it --
     * otherwise the next scheduled pass buys the same bricks again. Recording
     * inside the system would announce one cancellation per withdrawn order:
     * one press, a dozen sentences, and the one the player pressed for buried
     * among them.
     *
     * Ten walls, so the withdrawal has plenty to walk.
     */
    const session = createSession();
    for (let index = 0; index < 10; index += 1) placeWall(session, `order-w${index}`, 10 + index);

    const jitDeliveries = session.runtime.procurement.pendingDeliveries.map((delivery) => delivery.orderId);
    expect(jitDeliveries.length, 'the queue bought its own bricks').toBeGreaterThan(0);

    const before = session.types().length;
    session.send({ type: 'CancelMaterialPurchase', orderId: jitDeliveries[0]! });

    const withdrawn = session.runtime.construction.allOrders().filter((order) => order.state === 'cancelled');
    expect(withdrawn.length, 'the withdrawal really did walk the queue').toBeGreaterThan(0);
    expect(session.types().slice(before), 'one press, one sentence').toEqual(['economy.delivery-cancelled']);
  });
});

describe('undo and redo say so, once, and say nothing when there was nothing to move', () => {
  it('says the last change was undone, once, however many orders that change covered', () => {
    /*
     * The owner's ruling 4: neither sentence names a count. An undo reverses a
     * whole transaction -- `registerTransactionOrder` groups every order sharing
     * a `transactionId`, which is how a twelve-segment wall drag undoes as one
     * wall -- so a sentence naming one order would be a small lie whenever a run
     * of several was taken back.
     *
     * Three orders in one transaction, one press, **one** event carrying **no
     * figure at all**. The payload assertion is what pins "names no count": the
     * event is exactly its envelope and its discriminant, so a change that
     * surfaced `redoTransaction.length` fails here rather than passing a test
     * that only counted events.
     */
    const session = createSession();
    placeWall(session, 'order-t1', 20, 'tx-1');
    placeWall(session, 'order-t2', 21, 'tx-1');
    placeWall(session, 'order-t3', 22, 'tx-1');

    const before = session.types().length;
    session.send({ type: 'Undo' });

    const said = session.said().slice(before);
    expect(said).toHaveLength(1);
    expect(Object.keys(said[0]!).sort(), 'the sentence names no count and nothing else either').toEqual([
      'sequence',
      'tick',
      'type',
    ]);
    expect(said[0]!.type).toBe('construction.undone');
    expect(
      ['order-t1', 'order-t2', 'order-t3'].map((id) => session.stateOf(id)),
      'and all three really were reversed by the one press',
    ).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  it('says nothing when Undo is pressed against no history at all', () => {
    const session = createSession();
    session.send({ type: 'Undo' });
    expect(session.types(), 'nothing moved, so nothing may be confirmed').toEqual([]);
  });

  it('says nothing when Undo is pressed twice and the second press finds an empty stack', () => {
    const session = createSession();
    placeWall(session, 'order-u1', 25, 'tx-u');

    session.send({ type: 'Undo' });
    const after = session.types().length;
    session.send({ type: 'Undo' });
    expect(session.types().slice(after)).toEqual([]);
  });

  it('says the last change was redone, and says nothing when there is nothing to redo', () => {
    const session = createSession();
    placeWall(session, 'order-r1', 30, 'tx-r');

    session.send({ type: 'Redo' });
    expect(session.types(), 'nothing has been undone yet').toEqual([]);

    session.send({ type: 'Undo' });
    const after = session.types().length;

    session.send({ type: 'Redo' });
    const said = session.said().slice(after);
    expect(said).toHaveLength(1);
    expect(said[0]!.type).toBe('construction.redone');
    expect(Object.keys(said[0]!).sort()).toEqual(['sequence', 'tick', 'type']);
    expect(session.stateOf('order-r1'), 'the order really came back').toBe('approved');

    const afterRedo = session.types().length;
    session.send({ type: 'Redo' });
    expect(session.types().slice(afterRedo), 'the redo stack is empty again').toEqual([]);
  });
});

describe('nothing else on the channel changed', () => {
  it('leaves a session that pressed nothing with nothing to say', () => {
    /*
     * The absence that makes every case above mean something. A new prison run
     * for four hundred ticks with no press records no event of these five kinds
     * -- so a producer wired to a tick rather than to a command would fail here
     * rather than pass every case above by accident.
     */
    const session = createSession();
    session.run(400);
    const said = session.types().filter((type) => type.startsWith('construction.') || type === 'economy.delivery-cancelled');
    expect(said).toEqual([]);
  });
});
