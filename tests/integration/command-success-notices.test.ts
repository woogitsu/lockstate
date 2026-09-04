import { describe, expect, it, vi } from 'vitest';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import type { SimulationEvent } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

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

/**
 * `room.cell`'s authored minimum, clear of every `placeWall` tile above (all of
 * which sit on `y: 6` at `x >= 8`).
 */
const CELL_RECT = { x: 2, y: 12, width: 2, height: 3 } as const;
/** Inside `CELL_RECT`, so a bed's `1x2` footprint lies wholly in the cell. */
const BED_TILE = { x: 2, y: 12 } as const;
/** Inside `CELL_RECT`, on neither of the bed's two tiles. */
const EMPTY_TILE = { x: 3, y: 14 } as const;
/**
 * What one bed costs, and it is the figure #945 measured: one `item.wood-plank`
 * at 65. A literal for the reason the brick figures above are literals -- a
 * value read back off the catalogue holds for an implementation that charges
 * the wrong price consistently.
 */
const ONE_PLANK = 65;

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

  it('says the spend is gone for a finished order too, which is the same sentence (#927)', () => {
    /*
     * **This case asserted `[]` for two rulings, and the reason it did was
     * false by the time it was read.** It was written as a knowingly-shipped
     * gap, pinned so it could not close by accident, on two premises:
     *
     * > the money did not come back (`refundSurplusOf` runs for `'approved'`
     * > and `'materials-pending'` only) and the materials are not gone either
     * > -- ADR 0076 decision B puts them in the container. No control can reach
     * > the press: `PENDING_BUILD_ORDER_STATES` excludes `'completed'`, so no
     * > Build-panel row names one
     *
     * The first premise died on 2026-09-01 -- the owner's *"Taking a finished
     * object away returns nothing. Not its materials, not its money."*, ADR
     * 0076's amendment of that date -- and this comment already recorded that
     * and kept the `[]` anyway, on the remaining argument that neither *shipped
     * sentence* was true of a completed order. That is the half
     * [#927](https://github.com/matmaxalez/lockstate/issues/927) refuted: with
     * the materials destroyed and the money not refunded, *"anything already
     * spent past the point of no return stays spent"* is true of a finished
     * order and is the closest thing to a *tautology* on this channel. The
     * second premise is false of `Z` (`ConstructionSystem.undo` cancels
     * `'completed'` orders by design) and true only of the Build-panel row.
     *
     * The old expectation is quoted rather than deleted because it is the
     * shape of the mistake: a tripwire whose comment recorded its own premise
     * dying and stayed green regardless.
     */
    const session = createSession();
    placeWall(session, 'order-e', 8);
    session.runUntilState('order-e', 'completed');

    session.send({ type: 'CancelBuildOrder', orderId: 'order-e' });
    expect(session.stateOf('order-e')).toBe('cancelled');
    expect(session.types(), 'the larger loss gets the loss sentence').toEqual([
      'construction.order-cancelled-underway',
    ]);
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

  it('says what a Z on a finished wall destroyed, and does not say only that it was undone (#927)', () => {
    /*
     * **The reproduction of [#927](https://github.com/matmaxalez/lockstate/issues/927),
     * as a test.** Build a wall, let the crew finish it, press `Z`: the wall
     * comes down, the money does not come back, the materials are destroyed --
     * and the only thing the game said was *"The last change to the build queue
     * was undone."*
     *
     * Each half is asserted against the state rather than against the event
     * alone, because the event is only worth having if the loss is real:
     * `'completed'` is what puts the order past the point of no return, and
     * `cancelOrder` neither releases the allocation nor calls `refundSurplusOf`
     * for it (`ConstructionSystem.destroysSpendOnCancel`).
     *
     * The negative assertion is the one that fails against the old code:
     * `construction.undone` on its own is what shipped, and it is *not wrong*
     * -- which is why a test asserting only "some event was recorded" would have
     * passed throughout the defect.
     */
    const session = createSession();
    placeWall(session, 'order-z1', 23, 'tx-z');
    session.runUntilState('order-z1', 'completed');

    const before = session.types().length;
    session.send({ type: 'Undo' });

    expect(session.stateOf('order-z1'), 'the finished order really was reversed').toBe('cancelled');
    const said = session.said().slice(before);
    expect(said.map((event) => event.type)).toEqual(['construction.undone-spend-destroyed']);
    expect(said.map((event) => event.type), 'the silent sentence is not what a destructive undo says').not.toContain(
      'construction.undone',
    );
    expect(Object.keys(said[0]!).sort(), 'no count and no figure, which is both rulings').toEqual([
      'sequence',
      'tick',
      'type',
    ]);
  });

  it('says the same thing for a run that mixes finished orders with queued ones (#927)', () => {
    /*
     * The transaction is the unit, so the answer is an **or** across it: a drag
     * that mixes a finished wall with queued ones destroys what the finished one
     * cost and refunds what the others did, and *"anything already spent past
     * the point of no return stays spent"* is true of exactly that mixture --
     * the hedge is what makes it true rather than a lie in either direction.
     *
     * **One event, not one per order**, which is ruling 4 read through this
     * case: a per-order answer would be the count the ruling declined, arrived
     * at from the other side.
     *
     * The two later walls are placed after the first has finished, in the same
     * transaction id, so `registerTransactionOrder` groups all three and the
     * states genuinely differ at the press.
     */
    const session = createSession();
    placeWall(session, 'order-z2', 24, 'tx-mix');
    session.runUntilState('order-z2', 'completed');
    placeWall(session, 'order-z3', 26, 'tx-mix');
    placeWall(session, 'order-z4', 27, 'tx-mix');

    expect(
      ['order-z2', 'order-z3', 'order-z4'].map((id) => session.stateOf(id)),
      'the run really is mixed at the press',
      // The two later walls sit at `'approved'` rather than
      // `'materials-pending'` because `placeWall` steps the kernel once and
      // promotion happens on a construction tick (`schedule.intervalTicks: 10`).
      // Either way they are short of the point of no return, which is the only
      // property this case needs of them -- and the literals are pinned rather
      // than a set membership asserted, so a change that let a placement reach
      // the crew in one step fails here instead of quietly making the mixture
      // uniform.
    ).toEqual(['completed', 'approved', 'approved']);

    const before = session.types().length;
    session.send({ type: 'Undo' });

    expect(session.types().slice(before), 'one press, one sentence, and it names the loss').toEqual([
      'construction.undone-spend-destroyed',
    ]);
    expect(
      ['order-z2', 'order-z3', 'order-z4'].map((id) => session.stateOf(id)),
      'and all three were reversed by the one press',
    ).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  it('still says only that the change was undone when nothing was past the point of no return (#927)', () => {
    /*
     * The other half of the split, and the assertion that stops the fix being
     * "say the loud sentence always". An undo of orders that are still awaiting
     * their materials refunds the money -- `refundSurplusOf` runs for
     * `'materials-pending'` -- so a sentence about spend that stays spent would
     * be false of it, and false in the direction that scares a player off a
     * control that costs them nothing.
     *
     * The same three-order transaction the ruling-4 case above uses, so the
     * only difference between the two answers is the state.
     */
    const session = createSession();
    placeWall(session, 'order-z5', 28, 'tx-safe');
    placeWall(session, 'order-z6', 29, 'tx-safe');

    expect(
      ['order-z5', 'order-z6'].map((id) => session.stateOf(id)),
      'nothing has reached the crew',
      // Both are refundable states -- `refundSurplusOf` runs for exactly these
      // two -- and they differ only because the first has had one more
      // construction tick to be promoted in.
    ).toEqual(['materials-pending', 'approved']);

    const before = session.types().length;
    session.send({ type: 'Undo' });
    expect(session.types().slice(before)).toEqual(['construction.undone']);
  });

  it('says the loss for an undo of an order the crew had started but not finished (#927)', () => {
    /*
     * `'in-progress'` has been a loss since ruling 20 of 2026-08-31 and the
     * Cancel channel has said so since #749; the Undo channel said nothing
     * about it either, and this is the case that shows #927 was never only
     * about finished orders. `destroysSpendOnCancel` holds both states, which
     * is why one predicate answers both.
     */
    const session = createSession();
    placeWall(session, 'order-z7', 31, 'tx-wip');
    session.runUntilState('order-z7', 'in-progress');

    const before = session.types().length;
    session.send({ type: 'Undo' });
    expect(session.stateOf('order-z7')).toBe('cancelled');
    expect(session.types().slice(before)).toEqual(['construction.undone-spend-destroyed']);
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

/**
 * **A removal that destroys a purchase says so, and the two that do not stay
 * quiet** ([#945](https://github.com/matmaxalez/lockstate/issues/945)).
 *
 * `RemoveObject` was one of the six routes #749's ruling did not reach, and it
 * is the one where money is *destroyed*: #945 measured a standing bed costing
 * 65 to place (`25,000 -> 24,935`) and the removal moving the treasury not at
 * all (`24,935 -> 24,935`), with the sentence band `hidden`. It survived #932 --
 * which made `Undo` and `CancelBuildOrder` state-aware about exactly this loss
 * -- because `ObjectPlacementService.remove`'s standing-object arm reaches
 * `PlacedObjectRegistry.remove` and never `ConstructionSystem.cancelOrder`, so
 * there is no order state for either of those channels to switch on.
 *
 * **The three cases below are separated so that no single mutation can pass all
 * three**, which is what #932's pair was separated for. Deleting the recording
 * fails the first only; moving it out of the `kind === 'removed'` guard fails
 * the third only; wiring it to the branch rather than to the success fails the
 * second only.
 */
describe('a removal that destroys what an object cost says so (#945)', () => {
  /** A zoned cell with one bed standing in it, built and paid for by the press that placed it. */
  function prisonWithStandingBed(session: ReturnType<typeof createSession>): void {
    // Walled and zoned first, because `PlaceObject` refuses `outside-room`.
    // Written on the world directly, exactly as `object-removal-loop.test.ts`
    // does it: what is under test is the removal, not the wall crew.
    wallRoomPerimeter(session.runtime.world, CELL_RECT, { doors: session.runtime.navigation.doors });
    session.send({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
    session.send({ type: 'PlaceObject', orderId: 'bed-945', definitionId: 'bed-wooden', ...BED_TILE });
  }

  it('says the money is gone when a standing object is taken away, and the money really is gone', () => {
    /*
     * **The reproduction of #945 as a test.** The treasury is asserted on both
     * sides of the press rather than only the event, because the event is worth
     * having only if the loss is real -- and the issue's own note is that the
     * *placement* assertion keeps passing throughout the defect, so a test that
     * only checked "the money moved" would have been green all along.
     */
    const session = createSession();
    const openingBalance = session.runtime.treasury.balanceMinorUnits;
    prisonWithStandingBed(session);

    // The plank is bought by the placement itself (ADR 0017 decision 7, #627),
    // so this is the 65 the issue measured leaving the treasury.
    expect(
      session.runtime.treasury.balanceMinorUnits,
      'the placement really did cost the player money',
    ).toBe(openingBalance - ONE_PLANK);

    session.runUntilState('bed-945', 'completed');
    expect(session.runtime.placedObjects.size, 'the bed is standing, not in flight').toBe(1);

    const treasuryBefore = session.runtime.treasury.balanceMinorUnits;
    const before = session.types().length;
    session.send({ type: 'RemoveObject', ...BED_TILE });

    expect(session.runtime.placedObjects.size, 'the bed really came out of the world').toBe(0);
    expect(
      session.runtime.treasury.balanceMinorUnits,
      'and nothing came back, which is what the sentence claims',
    ).toBe(treasuryBefore);
    expect(session.stateOf('bed-945'), 'no order changed state, so no order sentence is true here').toBe('completed');

    const said = session.said().slice(before);
    expect(said.map((event) => event.type)).toEqual(['objects.removed-spend-destroyed']);
    expect(Object.keys(said[0]!).sort(), 'no figure and no count').toEqual(['sequence', 'tick', 'type']);
  });

  it('says nothing when the press found no object and nothing being built there', () => {
    /*
     * The absence half. A refused removal is `nothing-to-remove` on the
     * `RefusalLog`, and it must not also produce a success sentence -- a
     * producer wired to the branch rather than to the outcome would say the
     * player's money was destroyed by a press that removed nothing.
     */
    const session = createSession();
    prisonWithStandingBed(session);
    session.runUntilState('bed-945', 'completed');

    const before = session.types().length;
    session.send({ type: 'RemoveObject', ...EMPTY_TILE });

    expect(session.runtime.refusals.last?.reason, 'the press really was refused').toBe(
      'remove-object.nothing-to-remove',
    );
    expect(session.runtime.placedObjects.size, 'and the standing bed was left alone').toBe(1);
    expect(session.types().slice(before), 'a removal that removed nothing destroyed nothing').toEqual([]);
  });

  it('says nothing about destroyed money when the press cancelled a placement still in flight', () => {
    /*
     * **The other success `remove` answers, and the assertion that stops the
     * fix being "say the loud sentence always".** A press on a tile whose object
     * is still being built reaches `ConstructionSystem.cancelOrder`, which
     * *refunds* for every state before the crew starts -- so a sentence about
     * money that does not come back would be false of it, and false in the
     * direction that scares a player off a control that costs them nothing.
     *
     * **This case also pins a silence, and the reason is recorded so it cannot
     * close by accident and cannot be mistaken for a considered answer.** The
     * refund here says nothing either, and #945's brief and its §1 both describe
     * this path as *"the channel #932 fixed"*. **It is not.** `remove` calls
     * `ObjectOrderSink.cancelOrder` -- `ConstructionSystem.cancelOrder` --
     * directly, and no event is recorded anywhere in `ConstructionSystem`: the
     * state-aware `events.recordBuildOrderCancelled` #932 made state-aware sits
     * in `createConstructionCommandHandler`'s `CancelBuildOrder` branch, which
     * this route does not go through. So a `RemoveObject` on a bed the crew has
     * *started* destroys its spend and is still silent, exactly as a standing
     * one was.
     *
     * That is a second finding rather than this issue, which is scoped to the
     * standing object, and #945 §4 leaves *"whether the other silent commands
     * should speak"* to an ADR. A change that gives this path a sentence comes
     * here and says which one and why.
     */
    const session = createSession();
    wallRoomPerimeter(session.runtime.world, CELL_RECT, { doors: session.runtime.navigation.doors });
    session.send({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
    session.send({ type: 'PlaceObject', orderId: 'bed-flight', definitionId: 'bed-wooden', ...BED_TILE });

    // Inside the window between the press and the object existing: the order is
    // waiting on its own delivery and nothing stands on the tile.
    session.run(20);
    expect(session.stateOf('bed-flight')).toBe('materials-pending');
    expect(session.runtime.placedObjects.size).toBe(0);

    const before = session.types().length;
    session.send({ type: 'RemoveObject', ...BED_TILE });

    expect(session.stateOf('bed-flight'), 'the press really did cancel the order').toBe('cancelled');
    expect(session.types().slice(before), 'a refund is not the loss sentence').toEqual([]);
  });
});

describe('nothing else on the channel changed', () => {
  it('leaves a session that pressed nothing with nothing to say', () => {
    /*
     * The absence that makes every case above mean something. A new prison run
     * for four hundred ticks with no press records no event of these kinds
     * -- so a producer wired to a tick rather than to a command would fail here
     * rather than pass every case above by accident.
     *
     * `objects.` joined the filter with #945, whose event is on the same
     * footing: it is a statement about a press and nothing else can produce it.
     */
    const session = createSession();
    session.run(400);
    const said = session
      .types()
      .filter(
        (type) => type.startsWith('construction.') || type.startsWith('objects.') || type === 'economy.delivery-cancelled',
      );
    expect(said).toEqual([]);
  });
});
