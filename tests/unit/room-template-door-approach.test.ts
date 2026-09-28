import { expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { packCommand } from '../../src/simulation/protocol/commands';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

it('rejects the command before ordering any shell when the doorway opens beyond owned land', () => {
  const runtime = createNewSimulationRuntime(73);
  const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 25 });
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: false, reason: 'unowned-land', tile: tile(11, 32) });
  runtime.kernel.submitCommand('unowned-approach', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 25 },
  }));
  runtime.kernel.step();
  expect(runtime.refusals.last).toMatchObject({ reason: 'build.unowned-land', tile: tile(11, 32) });
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
  expect(runtime.construction.allOrders()).toEqual([]);
});

it.each([false, true])('preflight refuses a queued edge wall across the future Basic Cell doorway (mirrorX=%s)', (mirrorX) => {
  const runtime = createNewSimulationRuntime(73);
  const doorX = mirrorX ? 12 : 11;
  const wall = createBuildOrder('door-approach-wall', 'wall-brick', tile(doorX, 17), 'north', 0);
  runtime.construction.submitOrder(wall);
  expect(wall.state).toBe('approved');
  const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 10 }, { mirrorX });
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: false, reason: 'structure-occupied', tile: tile(doorX, 16) });
});

it.each([false, true])('preflight refuses a completed edge wall across the future Basic Cell doorway (mirrorX=%s)', (mirrorX) => {
  const runtime = createNewSimulationRuntime(73);
  const doorX = mirrorX ? 12 : 11;
  runtime.world.setTopEdge(tile(doorX, 17), 1);
  const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 10 }, { mirrorX });
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: false, reason: 'structure-occupied', tile: tile(doorX, 16) });
});

it.each([false, true])('preflight refuses a queued full-square wall directly outside the Basic Cell doorway (mirrorX=%s)', (mirrorX) => {
  const runtime = createNewSimulationRuntime(73);
  const doorX = mirrorX ? 12 : 11;
  const wall = createBuildOrder('square-approach-wall', 'wall-brick', tile(doorX, 17), undefined, 0, 'square');
  runtime.construction.submitOrder(wall);
  expect(wall.state).toBe('approved');
  const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 10 }, { mirrorX });
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: false, reason: 'structure-occupied', tile: tile(doorX, 16) });
});

it.each([false, true])('preflight refuses a completed full-square wall directly outside the Basic Cell doorway (mirrorX=%s)', (mirrorX) => {
  const runtime = createNewSimulationRuntime(73);
  const doorX = mirrorX ? 12 : 11;
  runtime.world.setSquareStructure(tile(doorX, 17), 1);
  const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 10 }, { mirrorX });
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: false, reason: 'structure-occupied', tile: tile(doorX, 16) });
});

it('rejects the final room command without adding shell orders when a queued square wall seals the doorway', () => {
  const runtime = createNewSimulationRuntime(73);
  const wall = createBuildOrder('square-approach-wall', 'wall-brick', tile(11, 17), undefined, 0, 'square');
  runtime.construction.submitOrder(wall);
  runtime.kernel.submitCommand('blocked-room', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: tile(11, 16) });
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
  expect(runtime.construction.allOrders()).toEqual([wall]);
});

it.each([false, true])('preflight refuses a pending object footprint directly outside the Basic Cell doorway (mirrorX=%s)', (mirrorX) => {
  const runtime = createNewSimulationRuntime(73);
  const doorX = mirrorX ? 12 : 11;
  const desk = createBuildOrder('approach-desk', 'desk-wooden', tile(doorX, 17), undefined, 0);
  runtime.construction.submitOrder(desk);
  expect(desk.state).toBe('approved');
  const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 10 }, { mirrorX });
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: false, reason: 'object-occupied', tile: tile(doorX, 16) });
});

it('keeps a side-boundary neighbour legal in both queued and completed states', () => {
  const runtime = createNewSimulationRuntime(73);
  const wall = createBuildOrder('side-neighbour', 'wall-brick', tile(14, 12), 'west', 0);
  runtime.construction.submitOrder(wall);
  expect(wall.state).toBe('approved');
  const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 10 });
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
  runtime.construction.cancelOrder(wall.id);
  runtime.world.setLeftEdge(tile(14, 12), 1);
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
});
