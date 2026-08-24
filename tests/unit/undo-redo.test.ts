import { describe, expect, it, test } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { createConstructionCommandHandler } from '../../src/simulation/construction/handler';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { tileCoordinate, chunkCoordinate } from '../../src/simulation/world/coordinates';

test('ConstructionSystem handles undo and redo of transactions', () => {
  const world = new SparseWorld(32);
  const chunkPos = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.ensureMetadata(chunkPos);
  world.load(chunkPos);
  // Owned, because `ConstructionSystem.submitOrder` refuses an order on land
  // the player does not own (#215) and this fixture is about the order
  // lifecycle rather than about ownership. `createNewSimulationRuntime` owns
  // the starting chunk (`new-session.ts:153`), so an owned chunk is what a
  // real session's first build gesture actually lands on -- this makes the
  // fixture match it instead of relying on a check that used to be absent.
  world.setOwned(chunkPos, true);
  
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel();
  kernel.registerSystem(construction);
  kernel.setCommandHandler(createConstructionCommandHandler(construction));

  // Place first order with transactionId 'tx1'
  kernel.submitCommand('cmd-1', 0, 0, packCommand({
    type: 'PlaceBuildOrder',
    orderId: 'order-1',
    definitionId: 'wall-brick',
    x: tileCoordinate(0),
    y: tileCoordinate(0),
    transactionId: 'tx1'
  }));

  // Place second order with transactionId 'tx1'
  kernel.submitCommand('cmd-2', 1, 0, packCommand({
    type: 'PlaceBuildOrder',
    orderId: 'order-2',
    definitionId: 'wall-brick',
    x: tileCoordinate(1),
    y: tileCoordinate(0),
    transactionId: 'tx1'
  }));

  kernel.step(); // Execute commands

  expect(construction.getOrder('order-1')?.state).toBe('materials-pending');
  expect(construction.getOrder('order-2')?.state).toBe('materials-pending');

  // Submit undo command
  kernel.submitCommand('cmd-undo', 2, 1, packCommand({
    type: 'Undo'
  }));

  kernel.step(); // tick 1

  // Both should be cancelled because they were in the same transaction
  expect(construction.getOrder('order-1')?.state).toBe('cancelled');
  expect(construction.getOrder('order-2')?.state).toBe('cancelled');

  // Submit redo command
  kernel.submitCommand('cmd-redo', 3, 2, packCommand({
    type: 'Redo'
  }));

  kernel.step(); // tick 2

  // Both should be restored to approved
  expect(construction.getOrder('order-1')?.state).toBe('approved');
  expect(construction.getOrder('order-2')?.state).toBe('approved');
});

/**
 * The undo/redo stacks crossing a save (#113).
 *
 * Everything above drives undo and redo inside a single session, so the whole
 * restore/transaction-boundary seam was unguarded: gutting `restore()`'s stack
 * rehydration, forcing `registerTransactionOrder`'s boundary check, or
 * dropping `redo()`'s inverse push all left the suite green. The tests here
 * are the missing half -- they build a real, non-empty history, take it
 * through `snapshot()`/`restore()`, and then ask the restored system to undo
 * and redo, which is what a player does after loading a save.
 *
 * They assert *behaviour* (which orders end up cancelled, and in which
 * order), never `snapshot().undoStack` against itself: a comparison of two
 * snapshots would pass just as happily if both sides had lost the same
 * gesture, which is precisely how #108 stayed invisible.
 */
describe('an undo history survives a snapshot and still points at the right gesture', () => {
  function loadedWorld(): SparseWorld {
    const world = new SparseWorld(32);
    const chunkPos = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
    world.ensureMetadata(chunkPos);
    world.load(chunkPos);
    // Owned, for the reason the top-level fixtures are (#215).
    world.setOwned(chunkPos, true);
    return world;
  }

  /**
   * One build gesture, exactly as `BuildTool` submits one: every order in it
   * shares a transaction id, and the handler calls `submitOrder` then
   * `registerTransactionOrder` per order.
   */
  function placeGesture(
    construction: ConstructionSystem,
    transactionId: string | undefined,
    orderIds: readonly string[],
    firstX: number,
  ): void {
    orderIds.forEach((orderId, offset) => {
      construction.submitOrder(
        createBuildOrder(orderId, 'wall-brick', { x: tileCoordinate(firstX + offset), y: tileCoordinate(0) }),
      );
      construction.registerTransactionOrder(orderId, transactionId);
    });
  }

  function states(construction: ConstructionSystem, orderIds: readonly string[]): readonly string[] {
    return orderIds.map((orderId) => construction.getOrder(orderId)?.state ?? 'missing');
  }

  function restoredCopy(construction: ConstructionSystem): ConstructionSystem {
    const restored = new ConstructionSystem(loadedWorld());
    restored.restore(construction.snapshot());
    return restored;
  }

  it('undoes the newest gesture first, then the one before it, and redoes them in the same order', () => {
    const construction = new ConstructionSystem(loadedWorld());
    // A single-order gesture on purpose: a flush guard that only committed
    // gestures of two or more orders would drop this one silently.
    placeGesture(construction, 'gesture-a', ['a1'], 0);
    placeGesture(construction, 'gesture-b', ['b1', 'b2'], 1);

    const restored = restoredCopy(construction);

    // The newest gesture is still the top of the history after a restore --
    // this is #108. Before it, `snapshot()` omitted the open gesture, so this
    // first undo reached past B and cancelled A instead.
    restored.undo();
    expect(states(restored, ['a1', 'b1', 'b2'])).toEqual(['approved', 'cancelled', 'cancelled']);

    // ...and the gesture before it is still reachable, rather than having
    // been consumed by the first undo or dropped on the way into the save.
    restored.undo();
    expect(states(restored, ['a1', 'b1', 'b2'])).toEqual(['cancelled', 'cancelled', 'cancelled']);

    // Redo walks back out in the reverse order, which needs `redo()` to have
    // pushed each transaction back onto the undo stack.
    restored.redo();
    expect(states(restored, ['a1', 'b1', 'b2'])).toEqual(['approved', 'cancelled', 'cancelled']);
    restored.redo();
    expect(states(restored, ['a1', 'b1', 'b2'])).toEqual(['approved', 'approved', 'approved']);
    restored.undo();
    expect(states(restored, ['a1', 'b1', 'b2'])).toEqual(['approved', 'cancelled', 'cancelled']);
  });

  it('carries a pending redo across the snapshot, so a load does not lose what an undo took back', () => {
    const construction = new ConstructionSystem(loadedWorld());
    placeGesture(construction, 'gesture-a', ['a1'], 0);
    placeGesture(construction, 'gesture-b', ['b1'], 1);
    construction.undo(); // B is cancelled and sits on the redo stack
    expect(states(construction, ['a1', 'b1'])).toEqual(['approved', 'cancelled']);

    const restored = restoredCopy(construction);

    restored.redo();
    expect(states(restored, ['a1', 'b1'])).toEqual(['approved', 'approved']);
    // And the redone gesture is undoable again, so the history is a stack
    // rather than a one-way trip.
    restored.undo();
    expect(states(restored, ['a1', 'b1'])).toEqual(['approved', 'cancelled']);
  });

  it('carries a redo history that a later gesture had already discarded', () => {
    const construction = new ConstructionSystem(loadedWorld());
    placeGesture(construction, 'gesture-a', ['a1'], 0);
    placeGesture(construction, 'gesture-b', ['b1'], 1);
    construction.undo();
    // Building something new after an undo abandons the branch that was
    // undone; B must not come back later just because the session was saved.
    placeGesture(construction, 'gesture-c', ['c1'], 2);

    const restored = restoredCopy(construction);

    restored.redo();
    expect(states(restored, ['a1', 'b1', 'c1'])).toEqual(['approved', 'cancelled', 'approved']);
    // The undo history is C then A, with B's branch gone.
    restored.undo();
    expect(states(restored, ['a1', 'b1', 'c1'])).toEqual(['approved', 'cancelled', 'cancelled']);
    restored.undo();
    expect(states(restored, ['a1', 'b1', 'c1'])).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  it('replaces the restoring system entirely, rather than merging a save into whatever it was already holding', () => {
    const source = new ConstructionSystem(loadedWorld());
    placeGesture(source, 'gesture-a', ['a1'], 0);
    placeGesture(source, 'gesture-b', ['b1'], 1);
    const snapshot = source.snapshot();

    // A system that is already mid-session: its own orders, and its own open
    // gesture. Loading a save into a running session must leave none of it.
    const target = new ConstructionSystem(loadedWorld());
    placeGesture(target, 'gesture-x', ['x1', 'x2'], 5);
    target.restore(snapshot);

    expect(target.getOrder('x1')).toBeUndefined();
    expect(target.getOrder('x2')).toBeUndefined();

    // The open gesture is the *save's*, not the target's leftover: the first
    // undo takes back B.
    target.undo();
    expect(states(target, ['a1', 'b1'])).toEqual(['approved', 'cancelled']);
  });

  it('clears an open gesture that the save does not have, so a load cannot leave one behind', () => {
    // The mirror of the test above: this snapshot's gesture was already
    // flushed by an undo, so it carries no open gesture at all -- and neither
    // may the system that loads it.
    const source = new ConstructionSystem(loadedWorld());
    placeGesture(source, 'gesture-a', ['a1'], 0);
    placeGesture(source, 'gesture-b', ['b1'], 1);
    source.undo();
    source.redo(); // B is approved again and back on the undo stack; nothing is open
    const snapshot = source.snapshot();
    expect(snapshot.currentTransaction).toBeUndefined();

    const target = new ConstructionSystem(loadedWorld());
    placeGesture(target, 'gesture-x', ['x1'], 5);
    target.restore(snapshot);

    // With a leftover open gesture the first undo would flush and pop it --
    // an entry naming an order this system no longer has -- and cancel
    // nothing at all.
    target.undo();
    expect(states(target, ['a1', 'b1'])).toEqual(['approved', 'cancelled']);
  });
});
