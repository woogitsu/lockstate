import { describe, expect, it } from 'vitest';
import {
  PENDING_BUILD_ORDER_STATES,
  projectBuildQueue,
  type BuildQueueViewModel,
} from '../../src/simulation/presentation';
import { PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { BUILD_ORDER_FAIL_REASONS, type BuildOrder } from '../../src/simulation/construction/build-order';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/** A `TilePosition` for the stub source below, which builds `BuildOrder`s by hand. */
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/**
 * The read model behind the Build panel's queue, and the command it makes
 * aimable.
 *
 * ## What this file is really about
 *
 * `CancelBuildOrder` was the repository's **only command with no production
 * producer** -- handled at `construction/handler.ts`, reachable from
 * `ConstructionSystem.cancelOrder`, and constructible by nothing in `src/`
 * (`tests/foundation/unconsumed-command-contract.test.ts` accounted for it).
 * The reason it stayed that way was sound while it held: nothing carried an
 * order *id* to the main thread, so a control could not name one, and a
 * "cancel" that named nothing would have been a worse `Undo`.
 *
 * So the load-bearing claim of this whole change is not "an order can be
 * cancelled" -- it always could. It is **"an arbitrary one can, by id, while
 * the others are left alone"**, and that is what the tests below measure.
 * A test that cancelled the only pending order would prove nothing about
 * aiming: `Undo` already does that.
 *
 * ## Why the ticks are literals
 *
 * Same reason `construction-crew-capacity.test.ts` gives, and it is the test
 * this one is a sibling of: `wall-brick` needs `workRequired: 50`,
 * `in-progress` advances `+10`, and the system's schedule is every 10 ticks.
 * So a lone wall ordered at tick 0 is approved at 0, draws materials at 10,
 * takes the crew at 20 and finishes at 70. Reading those numbers back out of
 * the thing under test would assert nothing.
 */

const SEED = 11;

/** A real session with more brick than any fixture here can consume. */
function session(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.brick', 500);
  return runtime;
}

function orderWall(runtime: SimulationRuntime, orderId: string, x: number, y: number, edge?: 'north' | 'west'): void {
  runtime.kernel.submitCommand(
    `cmd-${orderId}`,
    runtime.kernel.expectedSequence,
    0,
    packCommand({
      type: 'PlaceBuildOrder',
      orderId,
      definitionId: 'wall-brick',
      x,
      y,
      ...(edge === undefined ? {} : { edge }),
      transactionId: `txn-${orderId}`,
    }),
  );
}

/** The one command this whole change exists to give a producer. */
function cancel(runtime: SimulationRuntime, orderId: string): void {
  runtime.kernel.submitCommand(
    `cmd-cancel-${orderId}`,
    runtime.kernel.expectedSequence,
    runtime.kernel.tick,
    packCommand({ type: 'CancelBuildOrder', orderId }),
  );
}

function undo(runtime: SimulationRuntime, label: string): void {
  runtime.kernel.submitCommand(
    `cmd-undo-${label}`,
    runtime.kernel.expectedSequence,
    runtime.kernel.tick,
    packCommand({ type: 'Undo' }),
  );
}

function runTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

const queue = (runtime: SimulationRuntime, request = {}): BuildQueueViewModel =>
  projectBuildQueue(runtime.construction, request, runtime.justInTimeMaterials);

const idsOf = (view: BuildQueueViewModel): readonly string[] => view.orders.rows.map((row) => row.orderId);

describe('the pending build queue, as a read model', () => {
  it('is empty in a prison nobody has built in, and says so as an empty page rather than as nothing', () => {
    // The state the Build panel arrives in, and the one it must be able to tell
    // apart from "nobody asked": a real answer with no rows.
    const view = queue(session());
    expect(view.orders.total).toBe(0);
    expect(view.orders.rows).toEqual([]);
    expect(view.started).toBe(0);
  });

  it('names every pending order with the id the cancel command takes, and the tile and edge a player aims by', () => {
    const runtime = session();
    orderWall(runtime, 'order-a', 3, 3, 'north');
    orderWall(runtime, 'order-b', 4, 9, 'west');
    runTo(runtime, 1);

    expect(queue(runtime).orders.rows).toEqual([
      // `materials-pending`, not `approved`, and written out rather than read
      // back: the construction system's schedule is `intervalTicks: 10,
      // phaseTicks: 0`, so it runs *at tick 0* -- after the command that
      // submitted these -- and its first act on an `approved` order is to move
      // it on. One step is therefore enough to see the state a queued order
      // spends most of its wait in.
      { orderId: 'order-a', definitionId: 'wall-brick', tile: { x: 3, y: 3 }, edge: 'north', state: 'materials-pending' },
      { orderId: 'order-b', definitionId: 'wall-brick', tile: { x: 4, y: 9 }, edge: 'west', state: 'materials-pending' },
    ]);
  });

  it('resolves an order that carries no edge to the default rather than passing the absence out', () => {
    // `BuildOrder.edge` is optional so a save written before it existed still
    // loads. A row that carried the absence would make every reader repeat the
    // resolution, and a reader that forgot would label the wall's side wrongly.
    const runtime = session();
    orderWall(runtime, 'order-a', 3, 3);
    runTo(runtime, 1);

    expect(queue(runtime).orders.rows[0]?.edge).toBe('north');
  });

  it('lists the queue in the order the crew will reach it, which is placement order and not ascending id (#722)', () => {
    /*
     * **The name of this test used to end "which is ascending id and not
     * submission order", and that sentence is the thing ADR 0082 changes.** It
     * was an accurate description of the code: `ConstructionSystem.update`
     * walked `orderedOrders()` in ascending id and the first *eligible* id took
     * the crew, so with `order-${crypto.randomUUID()}` ids a player's own drag
     * came back to them shuffled (#722). Decisions 1 and 2 make the walk
     * `(placementSequence ?? -1, id)`, so the ids below -- deliberately chosen
     * to sort against the order they are submitted in -- no longer decide
     * anything while a session is stamping ordinals.
     *
     * Still not cosmetic, and for the same reason as before: the list *is* the
     * build schedule and not an enumeration of it, which is why the second half
     * of this test asks the system what it actually started.
     *
     * **The ids disagreeing with placement order is now what makes the test
     * bite**, where before it was what made it weak. It used to be red-proofed
     * by the observation that `allOrders()` already handed out ascending id, so
     * a projection that passed its source straight through would pass -- the
     * stub-source tests below are still the half that guards the projection's
     * own sort.
     */
    const runtime = session();
    orderWall(runtime, 'order-c', 3, 5);
    orderWall(runtime, 'order-a', 3, 3);
    orderWall(runtime, 'order-b', 3, 4);
    runTo(runtime, 1);

    expect(idsOf(queue(runtime))).toEqual(['order-c', 'order-a', 'order-b']);

    // And the schedule agrees: the one drawn first is the one that starts,
    // however late its id sorts.
    runTo(runtime, 30);
    expect(runtime.construction.getOrder('order-c')?.state).toBe('in-progress');
    expect(runtime.construction.getOrder('order-a')?.state).toBe('assigned');
  });

  it('sorts an order book carrying no placement ordinals by ascending id, exactly as it always did', () => {
    /*
     * **Two claims in one test, and the second is new.** It was called *"sorts
     * what it is handed, so a source that stopped ordering cannot silently
     * reorder the panel"* and it still makes that claim; since ADR 0082 it also
     * pins what an order book with no `placementSequence` does, which is every
     * save written before the field and every fixture that builds orders
     * directly. They tie at the `-1` sentinel and the id decides -- so the
     * expectation below is unchanged from before the ADR, and that is the
     * point of it.
     *
     * The half the real-session test above cannot make, and the reason
     * `projectBuildQueue` takes a narrow source shape at all rather than a
     * `ConstructionSystem`: handed orders out of order, it must still sort.
     *
     * `docs/DETERMINISM.md`'s canonical-iteration rule is the argument. The
     * source *does* sort today -- `orderedOrders()` -- so this sort is
     * belt-and-braces against that changing, and the cost of it changing is not
     * abstract: these rows are controls, and a player about to press the row for
     * the wall at (3,4) would press whatever the source's iteration order put
     * there instead.
     */
    const scrambled: readonly BuildOrder[] = [
      { id: 'order-c', definitionId: 'wall-brick', location: tile(3, 5), state: 'assigned', progress: 0, materialsAllocated: [] },
      { id: 'order-a', definitionId: 'wall-brick', location: tile(3, 3), state: 'in-progress', progress: 10, materialsAllocated: [] },
      { id: 'order-b', definitionId: 'wall-brick', location: tile(3, 4), state: 'assigned', progress: 0, materialsAllocated: [] },
    ];

    const view = projectBuildQueue({ allOrders: () => scrambled });
    expect(view.orders.rows.map((row) => row.orderId)).toEqual(['order-a', 'order-b', 'order-c']);
    // The rows travelled with their own tiles rather than only being reordered:
    // a sort that shuffled the ids and left the tiles behind would pass the line
    // above and aim every control at the wrong wall.
    expect(view.orders.rows.map((row) => `${row.orderId}@${row.tile.x},${row.tile.y}`)).toEqual([
      'order-a@3,3',
      'order-b@3,4',
      'order-c@3,5',
    ]);
    expect(view.started).toBe(1);
  });

  it('sorts a scrambled source by its placement ordinals, not by its ids (#722)', () => {
    /*
     * The projection's own sort, on the key ADR 0082 gave it. The test above
     * cannot show this: its rows carry no ordinals, so ids decide there and a
     * projection still sorting on id alone would pass it.
     *
     * Ids and ordinals are deliberately opposed -- `order-a` is the *last*
     * gesture -- and the rows are handed over in a third order again, so
     * neither "trusted the source" nor "sorted by id" can produce the expected
     * answer.
     */
    const scrambled: readonly BuildOrder[] = [
      { id: 'order-b', definitionId: 'wall-brick', location: tile(3, 4), placementSequence: 11, state: 'assigned', progress: 0, materialsAllocated: [] },
      { id: 'order-a', definitionId: 'wall-brick', location: tile(3, 3), placementSequence: 12, state: 'assigned', progress: 0, materialsAllocated: [] },
      { id: 'order-c', definitionId: 'wall-brick', location: tile(3, 5), placementSequence: 10, state: 'assigned', progress: 0, materialsAllocated: [] },
    ];

    const view = projectBuildQueue({ allOrders: () => scrambled });
    expect(view.orders.rows.map((row) => `${row.orderId}@${row.tile.x},${row.tile.y}`)).toEqual([
      'order-c@3,5',
      'order-b@3,4',
      'order-a@3,3',
    ]);
  });

  it('puts an order that predates the placement ordinal ahead of every stamped one', () => {
    /*
     * The mixed order book a player reaches by loading a save written before
     * ADR 0082 and then drawing another wall. Absence means "this order
     * predates the field", which `docs/PERSISTENCE.md` requires to mean what
     * the older build did -- the old work is already in the queue, so it is
     * reached first, in the ascending id it would have been reached in.
     */
    const mixed: readonly BuildOrder[] = [
      { id: 'order-new', definitionId: 'wall-brick', location: tile(3, 5), placementSequence: 0, state: 'assigned', progress: 0, materialsAllocated: [] },
      { id: 'order-old-z', definitionId: 'wall-brick', location: tile(3, 4), state: 'assigned', progress: 0, materialsAllocated: [] },
      { id: 'order-old-a', definitionId: 'wall-brick', location: tile(3, 3), state: 'assigned', progress: 0, materialsAllocated: [] },
    ];

    const view = projectBuildQueue({ allOrders: () => mixed });
    expect(view.orders.rows.map((row) => row.orderId)).toEqual(['order-old-a', 'order-old-z', 'order-new']);
  });

  it('counts exactly one order as started, which is the whole of what #348 made visible', () => {
    const runtime = session();
    for (let index = 0; index < 4; index += 1) orderWall(runtime, `order-${index}`, 3, 3 + index);

    // Before the crew takes anything: four queued, none started.
    runTo(runtime, 11);
    expect(queue(runtime)).toMatchObject({ started: 0, orders: { total: 4 } });

    // After: still four queued, and one of them is being built. This is the
    // fact a player had no way to learn -- twelve walls used to finish
    // together, and since #348 eleven of them are waiting.
    runTo(runtime, 30);
    expect(queue(runtime)).toMatchObject({ started: 1, orders: { total: 4 } });
    expect(queue(runtime).orders.rows.filter((row) => row.state === 'in-progress')).toHaveLength(1);
  });

  it('drops an order once it is built, and an order the world refused, so the queue is only what is still coming', () => {
    const runtime = session();
    orderWall(runtime, 'order-a', 3, 3);
    // A new prison owns exactly chunk (0,0) of a 32-tile world, so this tile has
    // no chunk at all: `submitOrder` fails it `out-of-bounds` on arrival.
    orderWall(runtime, 'order-z', 900, 900);
    runTo(runtime, 1);

    // The refused order is never in the queue, because it is never coming.
    expect(idsOf(queue(runtime))).toEqual(['order-a']);
    expect(runtime.construction.getOrder('order-z')?.failReason).toBe('out-of-bounds');
    expect(BUILD_ORDER_FAIL_REASONS).toContain('out-of-bounds');

    // And the built one leaves once it is standing. A queue that listed
    // finished walls would be a demolition list wearing a queue's label.
    runTo(runtime, 71);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('completed');
    expect(queue(runtime).orders.total).toBe(0);
  });

  it('windows a long queue and still reports the whole count, so a panel can bound its own height', () => {
    const runtime = session();
    // The gesture the whole surface is sized for: one drag along twelve edges.
    for (let index = 0; index < 12; index += 1) orderWall(runtime, `order-${String(index).padStart(2, '0')}`, 3, 3 + index);
    runTo(runtime, 1);

    const first = queue(runtime, { limit: 3 });
    expect(first.orders).toMatchObject({ total: 12, offset: 0, limit: 3 });
    expect(idsOf(first)).toEqual(['order-00', 'order-01', 'order-02']);

    const stepped = queue(runtime, { offset: 9, limit: 3 });
    expect(idsOf(stepped)).toEqual(['order-09', 'order-10', 'order-11']);
    expect(stepped.orders.total).toBe(12);

    // Past the end is an empty window and not an error: the count is still the
    // truth about the prison, so a stepper that overshot can recover from it.
    expect(queue(runtime, { offset: 12, limit: 3 }).orders.rows).toEqual([]);
    expect(queue(runtime, { offset: 12, limit: 3 }).orders.total).toBe(12);
  });

  it('declares every non-terminal state and no terminal one, so a new lifecycle state cannot go missing quietly', () => {
    // The tuple is the judgement, so it is asserted rather than trusted:
    // `completed` is deliberately *not* pending even though `cancelOrder`
    // accepts it, and `cancelled`/`failed` have nothing coming.
    expect([...PENDING_BUILD_ORDER_STATES]).toEqual([
      'planned',
      'approved',
      'materials-pending',
      'assigned',
      'in-progress',
    ]);
    for (const terminal of ['completed', 'cancelled', 'failed']) {
      expect(PENDING_BUILD_ORDER_STATES as readonly string[]).not.toContain(terminal);
    }
  });
});

describe('cancelling one order by id, which is the command this read model exists to aim', () => {
  it('takes the named order out of the queue and leaves every other one exactly where it was', () => {
    /*
     * The load-bearing test. Three orders, the *middle* one cancelled by id,
     * and the assertion is about the two that were not named: a surface that
     * cancelled "the current one" or "the last one" would pass a test with one
     * order in it and fail this.
     */
    const runtime = session();
    orderWall(runtime, 'order-a', 3, 3);
    orderWall(runtime, 'order-b', 3, 4);
    orderWall(runtime, 'order-c', 3, 5);
    runTo(runtime, 1);
    expect(idsOf(queue(runtime))).toEqual(['order-a', 'order-b', 'order-c']);

    cancel(runtime, 'order-b');
    runTo(runtime, runtime.kernel.tick + 1);

    expect(idsOf(queue(runtime))).toEqual(['order-a', 'order-c']);
    expect(runtime.construction.getOrder('order-b')?.state).toBe('cancelled');
    // The survivors, named rather than merely counted: still pending, still
    // ordered, still on their own tiles.
    expect(runtime.construction.getOrder('order-a')?.state).toBe('materials-pending');
    expect(runtime.construction.getOrder('order-c')?.state).toBe('materials-pending');

    // And they still get built. A cancellation that quietly stalled the crew
    // would leave the queue non-empty forever and pass every assertion above.
    runTo(runtime, 200);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('completed');
    expect(runtime.construction.getOrder('order-c')?.state).toBe('completed');
    expect(queue(runtime).orders.total).toBe(0);
  });

  it('is not a second undo button: it reaches an order Undo cannot, and Undo reaches a different one', () => {
    /*
     * The distinction the foundation gate's own entry insists on. `Undo` pops
     * the *last transaction*; this names an order. So the discriminating case
     * is cancelling something that is **not** the most recent thing the player
     * did -- and then showing that `Undo` would have taken something else.
     *
     * Three separate gestures, so three transactions: `order-a`, then
     * `order-b`, then `order-c`. `order-a` is the oldest.
     */
    const runtime = session();
    orderWall(runtime, 'order-a', 3, 3);
    orderWall(runtime, 'order-b', 3, 4);
    orderWall(runtime, 'order-c', 3, 5);
    runTo(runtime, 1);

    cancel(runtime, 'order-a');
    runTo(runtime, runtime.kernel.tick + 1);

    expect(runtime.construction.getOrder('order-a')?.state).toBe('cancelled');
    expect(idsOf(queue(runtime))).toEqual(['order-b', 'order-c']);

    // Now the other control, on the same prison. It takes the *newest* gesture,
    // which is `order-c` -- so the two controls demonstrably do different
    // things, and the one this change adds reached the order the other could
    // only have got to by reversing everything after it.
    undo(runtime, 'first');
    runTo(runtime, runtime.kernel.tick + 1);

    expect(runtime.construction.getOrder('order-c')?.state).toBe('cancelled');
    expect(idsOf(queue(runtime))).toEqual(['order-b']);
  });

  it('leaves the queue alone when the id names nothing, so a stale row cannot break the prison', () => {
    /*
     * A real race rather than a defensive case: the read model is a snapshot on
     * a cadence, so a row can name an order that finished between the
     * publication and the press. `createConstructionCommandHandler` swallows
     * the throw for exactly that reason, and this pins the consequence -- the
     * other orders are untouched and the session keeps running.
     */
    const runtime = session();
    orderWall(runtime, 'order-a', 3, 3);
    orderWall(runtime, 'order-b', 3, 4);
    runTo(runtime, 1);

    cancel(runtime, 'order-gone');
    runTo(runtime, runtime.kernel.tick + 1);

    expect(idsOf(queue(runtime))).toEqual(['order-a', 'order-b']);
  });

  it('says nothing about funding for a queue that is paid for, and says it as a shape rather than an absence', () => {
    /*
     * The default reading of the block #627 added. Every case above runs
     * against `session()`, which deposits 500 bricks, so nothing here is ever
     * short -- and the projection has to *say* that rather than omit the key,
     * because a consumer that had to treat "absent" as "fine" would treat a
     * build with no funding source the same way as a prison that is broke.
     */
    const runtime = session();
    orderWall(runtime, 'order-a', 3, 3);
    runTo(runtime, 30);

    expect(queue(runtime).materialsFunding).toEqual({ unfunded: false, shortfallMinorUnits: 0, items: [] });
  });

  it('reads `unfunded` for a queue the prison cannot pay for, which `state` alone cannot say', () => {
    /*
     * The distinction issue #629 exists to force. Both of these orders read
     * `'materials-pending'`; one is waiting for a lorry and the other is
     * waiting for money that is not coming, and a surface reading the rows
     * alone could not tell them apart. That is the shape of #627 itself:
     * *"Awaiting Materials"* was present the whole time and said nothing
     * actionable.
     *
     * The prison here is spent down to seventy minor units of *spending power*
     * on planks -- which no wall can use -- so a wall's 2 bricks at 40 is 80
     * against 70.
     *
     * **This bought 384 planks and left 40 in the bank**, which was the whole of
     * what it could spend while `Treasury`'s floor was zero. #703 ruling A opens
     * a standing overdraft of 2,500 in every session
     * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
     * §2), so 40 in the bank funds thirty-one walls and this case measured
     * nothing. 422 planks at 65 is 27,430 of the 27,500 a new prison can spend,
     * leaving 70 -- the same relationship to a wall's 80, expressed against the
     * floor the prison has.
     */
    const runtime = createNewSimulationRuntime(SEED);
    // Both at tick 0 and neither stepped in between, because `orderWall`
    // schedules at tick 0 and the kernel refuses a command dated in the past.
    // The kernel dispatches them in sequence order, so the money is gone before
    // the wall is placed.
    runtime.kernel.submitCommand(
      'cmd-buy',
      runtime.kernel.expectedSequence,
      0,
      packCommand({ type: 'PurchaseMaterials', orderId: 'order-buy', itemId: 'item.wood-plank', quantity: 422 }),
    );
    orderWall(runtime, 'order-a', 3, 3);
    runTo(runtime, 30);
    expect(runtime.treasury.balanceMinorUnits, '25,000 - 422 x 65, and the wall bought nothing').toBe(-2_430);

    const view = queue(runtime);
    expect(view.orders.rows.map((row) => row.state)).toEqual(['materials-pending']);
    expect(view.materialsFunding).toEqual({
      unfunded: true,
      shortfallMinorUnits: 80,
      items: [{ itemId: 'item.brick', quantity: 2, costMinorUnits: 80 }],
    });
  });

  it('reports nothing unfunded when no funding source is supplied at all', () => {
    /*
     * The two-argument call every caller made before #627, kept working. A
     * runtime with no economy is describing a prison that cannot be short of
     * money, so `false` is the honest answer and not a default standing in for
     * "unknown" -- which is argued at the field's own declaration.
     */
    const runtime = session();
    orderWall(runtime, 'order-a', 3, 3);
    runTo(runtime, 30);

    expect(projectBuildQueue(runtime.construction).materialsFunding).toEqual({
      unfunded: false,
      shortfallMinorUnits: 0,
      items: [],
    });
  });

  it('gives the money back, so cancelling the third of a run is not a way to lose value', () => {
    /*
     * **This case read "gives the materials back" until 2026-08-31 and asserted
     * the bricks landing in the container.** The owner's ruling 20 of that date
     * -- *"Anulowanie zwraca pieniądze zamiast cegieł"*, recorded in ADR 0076's
     * amendment -- makes the refund money instead, for an order the crew has
     * not started. The point of the case is unchanged and is the reason it is
     * rewritten rather than deleted: aiming the panel's *Cancel* at one row of a
     * run must not be a way to lose what that row was holding.
     *
     * Both halves are asserted, because paying for the bricks *and* putting
     * them back is the one-press value creation the amendment names.
     * `tests/integration/economy-money-conservation.test.ts` is where the whole
     * sum is checked; this checks the two counters this panel's own command
     * moves.
     */
    const runtime = session();
    const container = runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID);
    orderWall(runtime, 'order-a', 3, 3);
    orderWall(runtime, 'order-b', 3, 4);

    // Far enough in that both have drawn their bricks: the first is being
    // built, the second is `assigned` and holding its allocation.
    runTo(runtime, 30);
    const held = container.quantityOf('item.brick');
    const balance = runtime.treasury.balanceMinorUnits;
    const allocated = runtime.construction.getOrder('order-b')?.materialsAllocated ?? [];
    expect(allocated.length).toBeGreaterThan(0);
    const price = PROCURABLE_MATERIALS.find((material) => material.itemId === allocated[0]?.itemId)?.unitPriceMinorUnits;
    expect(price, 'the fixture needs a catalogue price to be measuring anything').toBeGreaterThan(0);

    cancel(runtime, 'order-b');
    runTo(runtime, runtime.kernel.tick + 1);

    expect(
      runtime.treasury.balanceMinorUnits - balance,
      'the catalogue value of what the cancelled row was holding',
    ).toBe(price! * (allocated[0]?.quantity ?? 0));
    expect(container.quantityOf('item.brick'), 'money instead of bricks, never both').toBe(held);
    expect(runtime.construction.getOrder('order-b')?.materialsAllocated).toEqual([]);
  });
});
