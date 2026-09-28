import { expect, it } from 'vitest';
import { CONSTRUCTION_MATERIALS_CONTAINER_ID, createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

it.each([
  { edge: 'north' as const, wall: tile(10, 10) },
  { edge: 'north' as const, wall: tile(10, 9) },
  { edge: 'west' as const, wall: tile(10, 10) },
  { edge: 'west' as const, wall: tile(9, 10) },
])('refuses a door through a pending or built whole-square wall at $edge / $wall', ({ edge, wall }) => {
  for (const completed of [false, true]) {
    for (const restore of [false, true]) {
      let runtime = createNewSimulationRuntime(87);
      runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.brick', 10);
      runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.wood-plank', 10);
      runtime.kernel.submitCommand('wall-command', 0, runtime.kernel.tick, packCommand({
        type: 'PlaceBuildOrder', orderId: 'whole-wall', definitionId: 'wall-brick',
        x: wall.x, y: wall.y, footprint: 'square',
      }));
      runtime.kernel.step();
      expect(runtime.construction.getOrder('whole-wall')?.state).not.toBe('failed');
      if (completed) {
        for (let i = 0; i < 500; i += 1) {
          runtime.kernel.step();
          if (runtime.construction.getOrder('whole-wall')?.state === 'completed') break;
        }
        expect(runtime.construction.getOrder('whole-wall')?.state).toBe('completed');
      }
      if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
      runtime.kernel.submitCommand('door-command', 1, runtime.kernel.tick, packCommand({
        type: 'PlaceBuildOrder', orderId: 'blocked-door', definitionId: 'door-wooden',
        x: 10, y: 10, edge,
      }));
      runtime.kernel.step();
      expect(runtime.construction.getOrder('blocked-door'), `completed=${completed} restore=${restore}`)
        .toMatchObject({ state: 'failed', failReason: 'unbuildable' });
      expect(runtime.navigation.doors.all()).toHaveLength(0);
    }
  }
});

it('allows a door when a square wall is nearby but off its crossing', () => {
  const runtime = createNewSimulationRuntime(87);
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.wood-plank', 10);
  runtime.kernel.submitCommand('near-wall-command', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'near-wall', definitionId: 'wall-brick',
    x: 11, y: 10, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('near-wall')?.state).not.toBe('failed');
  runtime.kernel.submitCommand('door-command', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'clear-door', definitionId: 'door-wooden',
    x: 10, y: 10, edge: 'north',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('clear-door')?.state).not.toBe('failed');
});
