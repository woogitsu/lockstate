import { it, expect } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

it('refuses an object whose non-anchor tile enters a completed full-square wall', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell', 0, runtime.kernel.tick, packCommand({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } }));
  for (let t = 0; t < 25000; t += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 && runtime.placedObjects.isTileOccupied({ x: tileCoordinate(11), y: tileCoordinate(11) })) break;
  }
  const outcome = runtime.objectPlacement.place({ orderId: 'second-bed', definitionId: 'bed-wooden', x: 12, y: 15 }, runtime.kernel.tick, 1);
  expect(runtime.world.getSquareStructure({ x: tileCoordinate(12), y: tileCoordinate(16) })).toBe(1);
  expect(outcome).toMatchObject({ kind: 'refused', reason: 'tile-occupied', tile: { x: 12, y: 16 } });
  expect(runtime.construction.getOrder('second-bed')).toBeUndefined();
});
