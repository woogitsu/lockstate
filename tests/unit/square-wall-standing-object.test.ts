import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

it.each([false, true])('refuses a full-square wall through a standing desk footprint (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  expect(runtime.roomZoning.zone({ roomCatalogId: 'room.yard', x: 10, y: 10, width: 8, height: 8 }, runtime.kernel.tick).kind).toBe('zoned');
  expect(runtime.objectPlacement.place({ definitionId: 'desk-wooden', orderId: 'desk', x: 11, y: 11 }, runtime.kernel.tick).kind).toBe('ordered');
  for (let i = 0; i < 30_000 && !runtime.placedObjects.isTileOccupied(tile(12, 11)); i += 1) runtime.kernel.step();
  expect(runtime.placedObjects.isTileOccupied(tile(12, 11))).toBe(true);
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  runtime.kernel.submitCommand('wall', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'furniture-wall', definitionId: 'wall-brick',
    x: 12, y: 11, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('furniture-wall')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  expect(runtime.placedObjects.isTileOccupied(tile(12, 11))).toBe(true);
}, 120_000);

it.each([false, true])('refuses a full-square wall on a desk still in the build queue (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  expect(runtime.roomZoning.zone({ roomCatalogId: 'room.yard', x: 10, y: 10, width: 8, height: 8 }, runtime.kernel.tick).kind).toBe('zoned');
  expect(runtime.objectPlacement.place({ definitionId: 'desk-wooden', orderId: 'pending-desk', x: 11, y: 11 }, runtime.kernel.tick).kind).toBe('ordered');
  expect(runtime.placedObjects.isTileOccupied(tile(12, 11))).toBe(false);
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  runtime.kernel.submitCommand('wall', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'pending-furniture-wall', definitionId: 'wall-brick',
    x: 12, y: 11, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('pending-furniture-wall')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  expect(runtime.construction.getOrder('pending-desk')).toBeDefined();
  runtime.kernel.submitCommand('clear-wall', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'clear-wall', definitionId: 'wall-brick',
    x: 15, y: 15, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('clear-wall')?.state).toBe('approved');
}, 120_000);
