import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';

it.each(ROOM_TEMPLATE_IDS.flatMap((templateId) => [
  { templateId, mirrorX: false }, { templateId, mirrorX: true },
]))('completes $templateId with mirrorX=$mirrorX', ({ templateId, mirrorX }) => {
  const runtime = createNewSimulationRuntime(73);
  const plan = instantiateRoomTemplate(templateId, { x: 5, y: 5 }, { mirrorX });
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
  runtime.kernel.submitCommand('template', 0, runtime.kernel.tick, packCommand({ type: 'PlaceRoomTemplate', templateId, origin: { x: 5, y: 5 }, mirrorX }));
  for (let tick = 0; tick < 30000; tick += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.construction.allOrders().filter((order) => order.state !== 'completed')).toEqual([]);
  for (const zone of plan.zones) expect(runtime.prisoners.roomInstances.getById(`${zone.roomId}:${zone.x}:${zone.y}`)).toBeDefined();
  for (const object of plan.objects) expect(runtime.placedObjects.isTileOccupied({ x: tileCoordinate(object.x), y: tileCoordinate(object.y) })).toBe(true);
}, 120000);

it('reserves a pending template interior against an ordinary square wall', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('template', 0, runtime.kernel.tick, packCommand({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  runtime.kernel.submitCommand('intruding-wall', 1, runtime.kernel.tick, packCommand({ type: 'PlaceBuildOrder', orderId: 'intruding-wall', definitionId: 'wall-brick', x: 11, y: 11, footprint: 'square' }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('intruding-wall')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  const restored = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(1);
  restored.kernel.submitCommand('intruding-after-load', 2, restored.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'intruding-after-load', definitionId: 'wall-brick', x: 12, y: 14, footprint: 'square',
  }));
  restored.kernel.step();
  expect(restored.construction.getOrder('intruding-after-load')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  for (let tick = 0; tick < 30000; tick += 1) {
    restored.kernel.step();
    if (restored.roomTemplates.snapshot().pending.length === 0 && restored.construction.allOrders().every((order) => ['completed','failed','cancelled'].includes(order.state))) break;
  }
  expect(restored.placedObjects.isTileOccupied({ x: tileCoordinate(11), y: tileCoordinate(11) })).toBe(true);
  expect(restored.world.getSquareStructure({ x: tileCoordinate(11), y: tileCoordinate(11) })).toBe(0);
}, 120000);

it('refuses a square wall through a completed multi-tile furniture footprint (#1705)', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('template', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  for (let tick = 0; tick < 30000; tick += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0) break;
  }
  runtime.kernel.submitCommand('desk', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceObject', orderId: 'desk', definitionId: 'desk-wooden', x: 12, y: 12,
  }));
  runtime.kernel.step();
  for (let tick = 0; tick < 30000; tick += 1) {
    runtime.kernel.step();
    if (runtime.construction.getOrder('desk')?.state === 'completed') break;
  }
  expect(runtime.construction.getOrder('desk')).toMatchObject({ state: 'completed' });
  expect(runtime.placedObjects.isTileOccupied({ x: 13, y: 12 })).toBe(true);
  runtime.kernel.submitCommand('wall', 2, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'wall', definitionId: 'wall-brick', x: 13, y: 12, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('wall')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  expect(runtime.placedObjects.isTileOccupied({ x: 13, y: 12 })).toBe(true);
}, 120000);
