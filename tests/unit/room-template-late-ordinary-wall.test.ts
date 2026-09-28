import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

it.each([false, true])('refuses a late ordinary square wall across a pending Cell doorway (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  runtime.kernel.submitCommand('wall', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'doorway-wall', definitionId: 'wall-brick',
    x: 11, y: 17, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('doorway-wall')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  expect(runtime.world.getSquareStructure(tile(11, 17))).toBe(0);
}, 120_000);
