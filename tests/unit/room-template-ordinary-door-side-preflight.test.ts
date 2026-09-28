import { expect, it } from 'vitest';
import { CONSTRUCTION_MATERIALS_CONTAINER_ID, createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

it.each([
  { edge: 'west' as const, x: 14, y: 12, blocked: { x: 13, y: 12 } },
  { edge: 'north' as const, x: 10, y: 17, blocked: { x: 10, y: 16 } },
])('preflight blocks a Cell perimeter square crossing an ordinary $edge door', ({ edge, x, y, blocked }) => {
  for (const [completed, restore] of [[false, false], [false, true], [true, false], [true, true]]) {
    let runtime = createNewSimulationRuntime(93);
    runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.wood-plank', 10);
    runtime.kernel.submitCommand('outside-door', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceBuildOrder', orderId: 'outside-door', definitionId: 'door-wooden',
      x, y, edge,
    }));
    runtime.kernel.step();
    expect(runtime.construction.getOrder('outside-door')?.state).not.toBe('failed');
    if (completed) {
      for (let i = 0; i < 500; i += 1) {
        runtime.kernel.step();
        if (runtime.construction.getOrder('outside-door')?.state === 'completed') break;
      }
      expect(runtime.construction.getOrder('outside-door')?.state).toBe('completed');
    }
    if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
    const plan = createRoomTemplateBuildPlan('cell-basic', { x: 10, y: 10 }, false, 1).plan;
    expect(runtime.roomTemplates.preflight(plan), `completed=${completed} restore=${restore}`)
      .toEqual({ ok: false, reason: 'structure-occupied', tile: { x: tileCoordinate(blocked.x), y: tileCoordinate(blocked.y) } });
    runtime.kernel.submitCommand('cell', 1, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
    }));
    runtime.kernel.step();
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
    expect(runtime.construction.allOrders().filter((order) => order.id.startsWith('room-template-'))).toHaveLength(0);
  }
});

it('does not block a Cell for an ordinary door one square farther away', () => {
  const runtime = createNewSimulationRuntime(93);
  runtime.kernel.submitCommand('far-door', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'far-door', definitionId: 'door-wooden',
    x: 15, y: 12, edge: 'west',
  }));
  runtime.kernel.step();
  const plan = createRoomTemplateBuildPlan('cell-basic', { x: 10, y: 10 }, false, 1).plan;
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
});

it.each([false, true])('keeps a wall-free Yard beside an ordinary door (completed=%s)', (completed) => {
  const runtime = createNewSimulationRuntime(93);
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.wood-plank', 10);
  runtime.kernel.submitCommand('yard-neighbor-door', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'yard-neighbor-door', definitionId: 'door-wooden',
    x: 18, y: 12, edge: 'west',
  }));
  runtime.kernel.step();
  if (completed) {
    for (let i = 0; i < 500; i += 1) {
      runtime.kernel.step();
      if (runtime.construction.getOrder('yard-neighbor-door')?.state === 'completed') break;
    }
    expect(runtime.construction.getOrder('yard-neighbor-door')?.state).toBe('completed');
  }
  const yard = createRoomTemplateBuildPlan('yard-basic', { x: 10, y: 10 }, false, 1).plan;
  expect(yard.wallSquares).toHaveLength(0);
  expect(runtime.roomTemplates.preflight(yard)).toEqual({ ok: true });
});
