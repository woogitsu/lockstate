import { expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';

it('authors four separate cells with north and south doors around a two-tile corridor', () => {
  const plan = instantiateRoomTemplate('cell-row-four', { x: 10, y: 10 });
  expect({ width: plan.width, height: plan.height }).toEqual({ width: 7, height: 16 });
  expect(plan.zones).toEqual([
    { roomId: 'room.cell', x: 11, y: 11, width: 2, height: 5 },
    { roomId: 'room.cell', x: 14, y: 11, width: 2, height: 5 },
    { roomId: 'room.cell', x: 11, y: 20, width: 2, height: 5 },
    { roomId: 'room.cell', x: 14, y: 20, width: 2, height: 5 },
  ]);
  expect(plan.doorSquares.map(({ x, y }) => ({ x, y }))).toEqual([
    { x: 11, y: 16 }, { x: 14, y: 16 },
    { x: 11, y: 19 }, { x: 14, y: 19 },
  ]);
  expect(new Set(plan.wallSquares.map(({ x, y }) => `${x}:${y}`)).size).toBe(plan.wallSquares.length);
  expect(plan.objects).toHaveLength(8);
  expect(plan.wallSquares.every((square) => square.y !== 17 && square.y !== 18)).toBe(true);
  const mirrored = instantiateRoomTemplate('cell-row-four', { x: 10, y: 10 }, { mirrorX: true });
  expect(mirrored.doorSquares.map(({ x, y }) => ({ x, y }))).toEqual(plan.doorSquares.map(({ x, y }) => ({ x: 26 - x, y })));
});

it('builds four individually zoned and furnished cells from one command', () => {
  const runtime = createNewSimulationRuntime(73);
  expect(runtime.roomTemplates.preflight(instantiateRoomTemplate('cell-row-four', { x: 5, y: 5 }))).toEqual({ ok: true });
  runtime.kernel.submitCommand('row-0', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 5, y: 5 },
  }));
  for (let tick = 0; tick < 30000; tick += 1) {
    runtime.kernel.step();
    const objectOrders = runtime.construction.allOrders().filter((order) => order.id.includes('-2-object-'));
    if (runtime.roomTemplates.snapshot().pending.length === 0 && objectOrders.length === 8 &&
        objectOrders.every((order) => order.state === 'completed')) break;
  }
  const plan = instantiateRoomTemplate('cell-row-four', { x: 5, y: 5 });
  for (const zone of plan.zones) {
    expect(runtime.prisoners.roomInstances.getById(`room.cell:${zone.x}:${zone.y}`)).toBeDefined();
  }
  expect(runtime.construction.allOrders()).toHaveLength(createRoomTemplateBuildPlan('cell-row-four', { x: 5, y: 5 }, false, 0).orders.length);
  expect(runtime.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
});
