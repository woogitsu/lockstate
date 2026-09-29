import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

it.each([false, true])('refuses furniture placed on a pending Cell doorway approach (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  const yard = runtime.roomZoning.zone({ roomCatalogId: 'room.yard', x: 10, y: 17, width: 8, height: 8 }, runtime.kernel.tick);
  expect(yard.kind).toBe('zoned');
  const result = runtime.objectPlacement.place({
    definitionId: 'desk-wooden', orderId: 'doorway-desk', x: 11, y: 17,
  }, runtime.kernel.tick);
  expect(result).toMatchObject({ kind: 'refused', reason: 'tile-occupied', tile: tile(11, 17) });
  expect(runtime.construction.getOrder('doorway-desk')).toBeUndefined();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
}, 120_000);

it('checks the whole furniture footprint and leaves other Yard tiles usable', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  expect(runtime.roomZoning.zone({ roomCatalogId: 'room.yard', x: 10, y: 17, width: 8, height: 8 }, runtime.kernel.tick).kind).toBe('zoned');
  expect(runtime.objectPlacement.place({ definitionId: 'desk-wooden', orderId: 'crossing-desk', x: 10, y: 17 }, runtime.kernel.tick))
    .toMatchObject({ kind: 'refused', reason: 'tile-occupied', tile: tile(11, 17) });
  expect(runtime.objectPlacement.place({ definitionId: 'desk-wooden', orderId: 'clear-desk', x: 14, y: 17 }, runtime.kernel.tick))
    .toMatchObject({ kind: 'ordered', orderId: 'clear-desk' });
});
