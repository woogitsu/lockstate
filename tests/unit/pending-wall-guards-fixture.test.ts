import { expect, test } from 'vitest';
import { pendingWallGuardsSave } from '../browser/fixtures/pending-wall-guards';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { actorsFromSnapshot } from '../../src/rendering/feed/actors-from-snapshot';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { packCommand } from '../../src/simulation/protocol/commands';

test('native loading-wall setup restores real hired identities and finishes a legal whole-square wall beside them', () => {
  const save = pendingWallGuardsSave();
  const { runtime } = restoreSimulationRuntime(save.payload as SessionSnapshotBundle);
  expect(runtime.actorIdentity.getSnapshot()).toEqual(save.payload.identity);
  expect(save.payload.identity?.entries.filter(entry => entry.kind === 'staff')).toHaveLength(2);
  expect(runtime.securityGuards.allGuardIds().map(id => runtime.securityGuards.getTile(id)))
    .toEqual([{ x: 20, y: 19 }, { x: 20, y: 21 }]);
  expect(actorsFromSnapshot(captureSessionSnapshot(runtime).simulation, captureSessionSnapshot(runtime).entities).filter(actor => actor.assetId === 'actor.guard.base'))
    .toEqual([expect.objectContaining({ tileX: 20, tileY: 19 }), expect.objectContaining({ tileX: 20, tileY: 21 })]);
  expect(runtime.world.getSquareStructure({ x: tileCoordinate(20), y: tileCoordinate(20) })).toBe(0);
  runtime.kernel.submitCommand('native-depth-wall', 4, runtime.kernel.tick,
    packCommand({ type: 'PlaceBuildOrder', orderId: 'depth-wall', definitionId: 'wall-brick', x: 20, y: 20, footprint: 'square' }));
  for (let step = 0; step < 25000; step += 1) {
    runtime.kernel.step();
    if (runtime.construction.allOrders().some(order => order.id === 'depth-wall' && order.state === 'completed')) break;
  }
  expect(runtime.construction.allOrders().find(order => order.id === 'depth-wall'))
    .toMatchObject({ state: 'completed', footprint: 'square', location: { x: 20, y: 20 }, materialsAllocated: [{ itemId: 'item.brick', quantity: 2 }] });
  expect(runtime.world.getSquareStructure({ x: tileCoordinate(20), y: tileCoordinate(20) })).not.toBe(0);
  const final = captureSessionSnapshot(runtime);
  expect(final.identity).toEqual(save.payload.identity);
  expect(final.simulation?.security.guards.records.map(([id, record]) => [id, record.tileX, record.tileY]))
    .toEqual([[0, 20, 19], [1, 20, 21]]);
});



