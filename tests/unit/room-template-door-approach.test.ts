import { expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

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
