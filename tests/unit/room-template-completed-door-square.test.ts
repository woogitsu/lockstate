import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';

it.each([false, true])('refuses a full-square wall directly on a completed Cell doorway square (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  for (let i = 0; i < 30_000; i += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  const doorway = { x: tileCoordinate(11), y: tileCoordinate(16) };
  expect(runtime.navigation.doors.getByEdge(doorway, 'top')).toBeDefined();
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  runtime.kernel.submitCommand('wall-on-door', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'wall-on-door', definitionId: 'wall-brick',
    x: 11, y: 16, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('wall-on-door')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  runtime.kernel.submitCommand('wall-near-door', 2, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'wall-near-door', definitionId: 'wall-brick',
    x: 12, y: 17, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('wall-near-door')?.state).not.toBe('failed');
});

it.each([0, 1, 2, 3] as const)('protects a turned Canteen door square (%s turns, both mirrors)', (quarterTurns) => {
  for (const mirrorX of [false, true]) {
    const runtime = createNewSimulationRuntime(74);
    const origin = { x: 10, y: 10 };
    const plan = createRoomTemplateBuildPlan('canteen-basic', origin, mirrorX, 0, quarterTurns).plan;
    runtime.kernel.submitCommand('canteen', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'canteen-basic', origin, mirrorX, quarterTurns,
    }));
    for (let i = 0; i < 30_000; i += 1) {
      runtime.kernel.step();
      if (runtime.roomTemplates.snapshot().pending.length === 0 &&
          runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
    }
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
    const [door] = plan.doorSquares;
    if (door === undefined) throw new Error('Canteen has no door');
    runtime.kernel.submitCommand('wall-on-door', 1, runtime.kernel.tick, packCommand({
      type: 'PlaceBuildOrder', orderId: 'wall-on-door', definitionId: 'wall-brick',
      x: door.x, y: door.y, footprint: 'square',
    }));
    runtime.kernel.step();
    expect(runtime.construction.getOrder('wall-on-door'), `turn=${quarterTurns} mirror=${mirrorX}`)
      .toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  }
});
