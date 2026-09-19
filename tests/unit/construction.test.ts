import { describe, test, expect, it } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { createConstructionCommandHandler } from '../../src/simulation/construction/handler';
import { packCommand } from '../../src/simulation/protocol/commands';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { RefusalLog } from '../../src/simulation/refusals';
import { SimulationEventLog } from '../../src/simulation/events/event-log';

test('ConstructionSystem processes build order through lifecycle deterministically', () => {
  const world = new SparseWorld(32);
  
  // Create chunk metadata and load it so the chunk is recognized and modifiable
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  // Owned, because `ConstructionSystem.submitOrder` refuses an order on land
  // the player does not own (#215) and this fixture is about the order
  // lifecycle rather than about ownership. `createNewSimulationRuntime`
  // (`src/simulation/runtime/new-session.ts`) owns the starting chunk, so an
  // owned chunk is what a real session's first build gesture actually lands on
  // -- this makes the fixture match it instead of relying on a check that used
  // to be absent.
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel();
  kernel.registerSystem(construction);
  kernel.setCommandHandler(createConstructionCommandHandler(construction, new RefusalLog(), new SimulationEventLog()));
  
  // Submit build order via command
  kernel.submitCommand('cmd-1', 0, 0, packCommand({
    type: 'PlaceBuildOrder',
    orderId: 'order-1',
    definitionId: 'wall-brick',
    x: 0,
    y: 0,
  }));
  
  // Tick 0: Command handled, system runs (since phase 0 of 10)
  kernel.step();
  
  const order = construction.getOrder('order-1');
  expect(order).toBeDefined();
  
  // First update auto-approves and bumps to materials-pending
  expect(order?.state).toBe('materials-pending');
  
  // Tick 1-9: Construction system doesn't run
  for (let i = 0; i < 9; i++) {
    kernel.step();
  }
  expect(order?.state).toBe('materials-pending');
  
  // Tick 10: Construction runs, progresses to 'assigned'
  kernel.step();
  expect(order?.state).toBe('assigned');
  expect(order?.materialsAllocated.length).toBeGreaterThan(0);
  
  // Tick 20: Construction runs, progresses to 'in-progress'
  for (let i = 0; i < 10; i++) kernel.step();
  expect(order?.state).toBe('in-progress');
  
  // Brick wall takes 50 work. Each update adds 10 work. Needs 5 updates.
  for (let i = 0; i < 50; i++) {
    kernel.step(); // Steps 11 through 60 (updates at 20, 30, 40, 50, 60)
  }
  
  expect(order?.state).toBe('completed');
  expect(order?.progress).toBe(50);
});

test('ConstructionSystem snapshot restores orders correctly', () => {
  const world = new SparseWorld(32);
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const construction = new ConstructionSystem(world);
  
  const order = createBuildOrder('order-snap', 'wall-brick', { x: tileCoordinate(0), y: tileCoordinate(0) });
  
  construction.submitOrder(order);
  
  // Override state after submitOrder (which sets it to 'approved') for snapshot test
  order.state = 'in-progress';
  order.progress = 20;
  order.materialsAllocated.push({ itemId: 'item.brick', quantity: 2 });
  
  const snapshot = construction.snapshot();
  
  const restoredConstruction = new ConstructionSystem(new SparseWorld(32));
  restoredConstruction.restore(snapshot);
  
  const restoredOrder = restoredConstruction.getOrder('order-snap');
  expect(restoredOrder).toBeDefined();
  expect(restoredOrder?.state).toBe('in-progress');
  expect(restoredOrder?.progress).toBe(20);
  expect(restoredOrder?.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);
});

test('CancelBuildOrder command stops construction', () => {
  const world = new SparseWorld(32);
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  // Owned, for the reason the lifecycle fixture above is (#215).
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel();
  kernel.registerSystem(construction);
  kernel.setCommandHandler(createConstructionCommandHandler(construction, new RefusalLog(), new SimulationEventLog()));
  
  kernel.submitCommand('cmd-start', 0, 0, packCommand({
    type: 'PlaceBuildOrder',
    orderId: 'order-cancel',
    definitionId: 'door-wooden',
    x: tileCoordinate(0),
    y: tileCoordinate(0),
  }));
  
  kernel.step(); // state: materials-pending
  
  kernel.submitCommand('cmd-cancel', 1, 1, packCommand({
    type: 'CancelBuildOrder',
    orderId: 'order-cancel',
    // ADR 0107: the order's true current revision, read fresh off the
    // system this test already holds a reference to.
    expectedRevision: construction.revisionOf('order-cancel'),
  }));
  
  kernel.step(); // tick 1
  
  const order = construction.getOrder('order-cancel');
  expect(order?.state).toBe('cancelled');
});

test('restore copies the snapshot it is given, so a restored session cannot write back into a stored save', () => {
  // A snapshot is not scratch space: the same object is what
  // `createSaveEnvelope` checksums and what a pending cloud sync still holds
  // after the restore. A restored order that shared its `materialsAllocated`
  // array with the snapshot would let the live session edit a save that has
  // already been checksummed, so the payload written to storage would no
  // longer match the hash taken over it.
  const world = new SparseWorld(32);
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const construction = new ConstructionSystem(world);

  const order = createBuildOrder('order-alias', 'wall-brick', { x: tileCoordinate(0), y: tileCoordinate(0) });
  construction.submitOrder(order);
  order.materialsAllocated.push({ itemId: 'item.brick', quantity: 2 });

  const snapshot = construction.snapshot();

  const restored = new ConstructionSystem(new SparseWorld(32));
  restored.restore(snapshot);

  const restoredOrder = restored.getOrder('order-alias');
  expect(restoredOrder?.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);

  // The live session now consumes more material against that order.
  restoredOrder?.materialsAllocated.push({ itemId: 'item.steel', quantity: 1 });

  expect(snapshot.orders[0]?.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);
});

/**
 * The other direction of the same seam (#113).
 *
 * The test above pins that `restore()` copies the orders it is handed. What
 * nothing pinned is `snapshot()`, or the undo/redo stacks in either
 * direction: five separate mutations that alias a live array into the
 * snapshot -- both stacks and the open gesture in `snapshot()`, the orders in
 * `snapshot()`, and both stacks in `restore()` -- left the whole suite green.
 *
 * Aliasing is not a style question here, it is the checksum. `capture()` is
 * `async` and `SessionController.buildEnvelope` awaits it before
 * `createSaveEnvelope` hashes the payload, and the envelope keeps the
 * snapshot's own arrays until `repository.save` has written them. With any of
 * those five mutations applied, a session that keeps playing across those
 * awaits -- one more wall segment, one undo -- edits the payload behind the
 * hash that was taken over it, and the save fails its own checksum when it is
 * loaded again. So a snapshot must be a detached value: play that happens
 * after it cannot reach into it, and a session restored from it cannot write
 * back into it.
 */
describe('a construction snapshot is a detached value, not a live view', () => {
  function loadedWorld(): SparseWorld {
    const world = new SparseWorld(32);
    world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    // Owned, for the reason the top-level fixtures are (#215).
    world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
    return world;
  }

  /** One build gesture, exactly as `BuildTool` submits one: every order in it shares a transaction id. */
  function placeGesture(construction: ConstructionSystem, transactionId: string, orderIds: readonly string[], firstX: number): void {
    orderIds.forEach((orderId, offset) => {
      construction.submitOrder(createBuildOrder(orderId, 'wall-brick', { x: tileCoordinate(firstX + offset), y: tileCoordinate(0) }));
      construction.registerTransactionOrder(orderId, transactionId);
    });
  }

  const states = (construction: ConstructionSystem, orderIds: readonly string[]): readonly string[] =>
    orderIds.map((orderId) => construction.getOrder(orderId)?.state ?? 'missing');

  it('is not edited by the play that continues after it was taken', () => {
    const construction = new ConstructionSystem(loadedWorld());
    placeGesture(construction, 'gesture-a', ['a1'], 0);
    placeGesture(construction, 'gesture-b', ['b1'], 1);
    construction.undo(); // B is cancelled and sits on the redo stack
    placeGesture(construction, 'gesture-c', ['c1'], 2);
    construction.getOrder('c1')!.materialsAllocated.push({ itemId: 'item.brick', quantity: 2 });

    const snapshot = construction.snapshot();

    // Stated positively first, so what follows is a claim about detachment
    // and not merely about two values being equal to each other.
    expect(snapshot.undoStack).toEqual([['a1']]);
    expect(snapshot.redoStack).toEqual([]);
    expect(snapshot.currentTransaction).toEqual(['c1']);
    const written = JSON.parse(JSON.stringify(snapshot)) as unknown;

    // The player carries on. Every step here changes a different part of the
    // live system, and each one is an in-place mutation rather than a
    // reassignment -- an aliased snapshot follows those and nothing else, so
    // the sequence is ordered to leave every structure genuinely different
    // from how the snapshot found it.
    placeGesture(construction, 'gesture-c', ['c2'], 3); // pushes onto the open gesture
    construction.getOrder('c1')!.materialsAllocated.push({ itemId: 'item.steel', quantity: 1 });
    construction.getOrder('a1')!.progress = 40;
    construction.undo(); // pushes onto the redo stack
    placeGesture(construction, 'gesture-e', ['e1'], 4);
    placeGesture(construction, 'gesture-f', ['f1'], 5); // commits E: pushes onto the undo stack

    expect(states(construction, ['a1', 'b1', 'c1', 'c2', 'e1', 'f1'])).toEqual([
      'approved',
      'cancelled',
      'cancelled',
      'cancelled',
      'approved',
      'approved',
    ]);
    // ...and none of it reached the snapshot, which still describes the
    // moment it was taken.
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(written);
  });

  it('can be restored twice into two sessions that then diverge independently', () => {
    // `docs/DETERMINISM.md` requires a restore to be repeatable: "restoring
    // an already-restored snapshot must produce the same result, or a save
    // written by a restored session would drift further every time it was
    // loaded." A stack shared between the snapshot and the system restored
    // from it makes the *second* load see a history the *first* session
    // already spent.
    const source = new ConstructionSystem(loadedWorld());
    placeGesture(source, 'gesture-a', ['a1'], 0);
    placeGesture(source, 'gesture-b', ['b1'], 1);
    const snapshot = source.snapshot();

    const first = new ConstructionSystem(loadedWorld());
    first.restore(snapshot);
    const second = new ConstructionSystem(loadedWorld());
    second.restore(snapshot);

    // The first session undoes its way back to the beginning.
    first.undo();
    first.undo();
    expect(states(first, ['a1', 'b1'])).toEqual(['cancelled', 'cancelled']);

    // The second still has the entire history, because it was handed a copy.
    second.undo();
    expect(states(second, ['a1', 'b1'])).toEqual(['approved', 'cancelled']);
    second.undo();
    expect(states(second, ['a1', 'b1'])).toEqual(['cancelled', 'cancelled']);
    // The source session is untouched by either of them.
    expect(states(source, ['a1', 'b1'])).toEqual(['approved', 'approved']);
  });
});
