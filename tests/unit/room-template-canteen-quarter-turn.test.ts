import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectRoomTemplatePreflight } from '../../src/simulation/presentation/room-template-preflight';

function saveAndLoad(runtime: SimulationRuntime): SimulationRuntime {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    gameVersion: 'test', prisonId: 'rotated-canteen', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded).toMatchObject({ ok: true, migrated: false });
  if (!decoded.ok) throw new Error('save did not decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as typeof bundle).runtime;
}

it.each([false, true])('builds the complete Canteen after a quarter turn (restore pending=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('canteen-turn', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'canteen-basic', origin: { x: 10, y: 10 }, quarterTurns: 1,
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toMatchObject([{ quarterTurns: 1 }]);
  if (restore) runtime = saveAndLoad(runtime);
  for (let i = 0; i < 30_000; i += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.prisoners.roomInstances.getById('room.canteen:11:11')).toBeDefined();
  expect(runtime.navigation.doors.getByEdge({ x: tileCoordinate(11), y: tileCoordinate(13) }, 'left')).toBeDefined();
  const table = runtime.placedObjects.getById('object:15:11');
  expect(table).toMatchObject({ orientation: 1 });
  expect(runtime.placedObjects.isTileOccupied({ x: tileCoordinate(16), y: tileCoordinate(13) })).toBe(true);
  expect(runtime.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
  runtime.kernel.submitCommand('outside-wall', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'outside-west-door', definitionId: 'wall-brick',
    x: 9, y: 13, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('outside-west-door')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
}, 120_000);

it('refuses a turned Canteen before buying materials when its western approach is blocked', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('outside-wall', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'existing-west-wall', definitionId: 'wall-brick',
    x: 9, y: 13, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('existing-west-wall')?.state).not.toBe('failed');
  expect(projectRoomTemplatePreflight(runtime.roomTemplates, 'canteen-basic', { x: 10, y: 10 }, false, 1))
    .toMatchObject({ ok: false, reason: 'structure-occupied', tile: { x: 10, y: 13 } });
  const balance = runtime.treasury.balanceMinorUnits;
  runtime.kernel.submitCommand('canteen-turn', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'canteen-basic', origin: { x: 10, y: 10 }, quarterTurns: 1,
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.construction.allOrders()).toHaveLength(1);
  expect(runtime.treasury.balanceMinorUnits).toBe(balance);
});

it('restores an older pending Canteen request with no rotation field as zero turns', () => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('canteen', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'canteen-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending[0]).not.toHaveProperty('quarterTurns');
  runtime = saveAndLoad(runtime);
  expect(runtime.roomTemplates.snapshot().pending[0]).not.toHaveProperty('quarterTurns');
  expect(runtime.construction.allOrders().find((order) => order.definitionId === 'door-wooden'))
    .toMatchObject({ edge: 'north', location: { x: 13, y: 17 } });
});

it('rejects a quarter-turn Basic Cell before it can queue an undersized room', () => {
  expect(() => packCommand({ type: 'PlaceRoomTemplate', templateId: 'cell-basic',
    origin: { x: 10, y: 10 }, quarterTurns: 1 })).toThrow();
});
