import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (position: { readonly x: number; readonly y: number }) => ({ x: tileCoordinate(position.x), y: tileCoordinate(position.y) });
const shapes = [
  { definitionId: 'bed-wooden', axis: 'north', conflict: { x: 11, y: 9 }, legal: { x: 11, y: 8 }, far: { x: 11, y: 10 } },
  { definitionId: 'desk-wooden', axis: 'west', conflict: { x: 9, y: 11 }, legal: { x: 8, y: 11 }, far: { x: 10, y: 11 } },
] as const;
// Ordinary PlaceBuildOrder has no rotation field. These are its two actual
// canonical footprint axes; rotation/mirroring belongs to the paid room plan.
const poses = [
  { quarterTurns: 0, mirrorX: false }, { quarterTurns: 1, mirrorX: true },
  { quarterTurns: 2, mirrorX: false }, { quarterTurns: 3, mirrorX: true },
] as const;

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`pending-far-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'pending-far', revision: 1, createdAt: 0, updatedAt: 1, ...bundle,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual pending-template V8 save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function finish(runtime: Runtime) {
  const done = () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => ['completed', 'cancelled', 'failed'].includes(order.state));
  for (let tick = 0; tick < 30_000 && !done(); tick++) runtime.kernel.step();
  expect(done()).toBe(true);
}

function gameplay(runtime: Runtime, omitFailedId?: string) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return {
    ...snapshot,
    construction: {
      ...snapshot.construction,
      orders: snapshot.construction.orders.filter(order => order.id !== omitFailedId),
    },
  };
}

const cases = shapes.flatMap(shape => poses.flatMap(pose => [false, true].flatMap(load =>
  [false, true].map(conflict => ({ ...shape, ...pose, load, conflicts: conflict })))));

it.each(cases)('pending plan protects incoming $axis far square: q=$quarterTurns mirror=$mirrorX load=$load conflict=$conflicts',
  ({ definitionId, conflict, legal, far, quarterTurns, mirrorX, load, conflicts }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns, mirrorX });
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
    if (load) runtime = reload(runtime);
    const anchor = conflicts ? conflict : legal;
    const sequence = runtime.kernel.expectedSequence;
    expect(runtime.roomTemplates.claimsPendingFootprint(tile(anchor), sequence)).toBe(false);
    expect(runtime.roomTemplates.claimsPendingFootprint(tile(far), sequence)).toBe(true);
    const before = gameplay(runtime);
    const revisions = runtime.construction.allOrders().map(order => [order.id, runtime.construction.revisionOf(order.id)]);
    const funds = runtime.treasury.balanceMinorUnits;
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'independent-fixture', definitionId, ...anchor });
    if (conflicts) {
      expect(runtime.construction.getOrder('independent-fixture')).toMatchObject({ state: 'failed', failReason: 'unbuildable', materialsAllocated: [] });
      // Existing policy retains one diagnostic failed row. Nothing else in the
      // session, paid plan, materials, history or geometry may change.
      expect(gameplay(runtime, 'independent-fixture')).toEqual(before);
      expect(runtime.treasury.balanceMinorUnits).toBe(funds);
      expect(runtime.construction.allOrders().map(order => [order.id, runtime.construction.revisionOf(order.id)]).filter(([id]) => id !== 'independent-fixture')).toEqual(revisions);
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
      expect(runtime.placedObjects.getSnapshot().some(object => object.sourceOrderId === 'independent-fixture')).toBe(false);
    } else {
      expect(runtime.construction.getOrder('independent-fixture')?.state).toBe('approved');
      finish(runtime);
      runtime = reload(runtime);
      const physical = runtime.placedObjects.getSnapshot().find(object => object.sourceOrderId === 'independent-fixture');
      expect(physical).toMatchObject({ anchorTile: anchor, orientation: 0 });
      const independent = runtime.construction.getOrder('independent-fixture');
      expect(independent).toMatchObject({ state: 'completed', placementSequence: sequence });
      const door = runtime.construction.allOrders().find(order => order.definitionId === 'door-wooden')!;
      const paidBalance = runtime.treasury.balanceMinorUnits;
      send(runtime, { type: 'CancelBuildOrder', orderId: door.id, expectedRevision: runtime.construction.revisionOf(door.id)! });
      expect(runtime.placedObjects.getSnapshot()).toEqual([physical]);
      expect(runtime.construction.getOrder('independent-fixture')).toEqual(independent);
      expect(runtime.treasury.balanceMinorUnits).toBe(paidBalance);
    }
  });

it.each(shapes.flatMap(shape => [false, true].map(load => ({ ...shape, load }))))
  ('pending cancellation releases the whole incoming $axis footprint after load=$load', ({ definitionId, conflict, far, load }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
    if (load) runtime = reload(runtime);
    const door = runtime.construction.allOrders().find(order => order.definitionId === 'door-wooden')!;
    send(runtime, { type: 'CancelBuildOrder', orderId: door.id, expectedRevision: runtime.construction.revisionOf(door.id)! });
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
    runtime = reload(runtime);
    expect(runtime.roomTemplates.claimsPendingFootprint(tile(far), runtime.kernel.expectedSequence)).toBe(false);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'released-fixture', definitionId, ...conflict });
    expect(runtime.construction.getOrder('released-fixture')?.state).toBe('approved');
    finish(runtime);
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(1);
    expect(runtime.placedObjects.getSnapshot()[0]).toMatchObject({ sourceOrderId: 'released-fixture', anchorTile: conflict, orientation: 0 });
  });
