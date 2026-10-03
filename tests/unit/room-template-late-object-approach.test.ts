import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const cases = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));

it.each(cases)('keeps a pending Cell entrance clear of later furniture, mirror=$mirrorX turn=$quarterTurns', ({ mirrorX, quarterTurns }) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, mirrorX, quarterTurns,
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  // Literal cardinal expectations are independent of production rotation.
  const doorX = mirrorX ? 2 : 1;
  const approach = [tile(10 + doorX, 17), tile(9, 10 + doorX), tile(13 - doorX, 9), tile(17, 13 - doorX)][quarterTurns]!;
  const yardOrigin = [tile(10, 17), tile(2, 10), tile(10, 2), tile(17, 10)][quarterTurns]!;
  expect(runtime.roomZoning.zone({ roomCatalogId: 'room.yard', ...yardOrigin, width: 8, height: 8 }, runtime.kernel.tick).kind).toBe('zoned');
  for (const restored of [false, true]) {
    if (restored) runtime = restoreSimulationRuntime(JSON.parse(JSON.stringify(captureSessionSnapshot(runtime)))).runtime;
    const before = runtime.construction.allOrders();
    const orderId = `later-chair-${restored}`;
    runtime.kernel.submitCommand(orderId, restored ? 2 : 1, runtime.kernel.tick, packCommand({
      type: 'PlaceObject', definitionId: 'chair-wooden', orderId, ...approach,
    }));
    runtime.kernel.step();
    expect(runtime.objectPlacement.recentRefusals().at(-1)).toMatchObject({
      kind: 'refused', reason: 'tile-occupied', tile: approach, request: { orderId },
    });
    expect(runtime.construction.getOrder(orderId)).toBeUndefined();
    expect(runtime.construction.allOrders().map(order => order.id)).toEqual(before.map(order => order.id));
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  }
});

it('rejects a desk whose second tile covers the approach while a neighbouring Yard tile stays usable', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  expect(runtime.roomZoning.zone({ roomCatalogId: 'room.yard', x: 10, y: 17, width: 8, height: 8 }, runtime.kernel.tick).kind).toBe('zoned');
  expect(runtime.objectPlacement.place({ definitionId: 'desk-wooden', orderId: 'crossing-desk', x: 10, y: 17 }, runtime.kernel.tick))
    .toMatchObject({ kind: 'refused', reason: 'tile-occupied', tile: tile(11, 17) });
  expect(runtime.construction.getOrder('crossing-desk')).toBeUndefined();
  expect(runtime.objectPlacement.place({ definitionId: 'desk-wooden', orderId: 'clear-desk', x: 14, y: 17 }, runtime.kernel.tick))
    .toMatchObject({ kind: 'ordered', orderId: 'clear-desk' });
});
