import { expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

it.each([false, true])('rejects a second Cell wall sealing a pending Cell doorway (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('first', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  const second = instantiateRoomTemplate('cell-basic', { x: 10, y: 17 });
  expect(runtime.roomTemplates.preflight(second)).toEqual({
    ok: false, reason: 'structure-occupied', tile: tile(11, 17),
  });
  runtime.kernel.submitCommand('second', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 17 },
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: tile(11, 17) });
}, 120_000);

it('allows a neighbouring Cell whose perimeter leaves the first doorway open', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('first', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.preflight(instantiateRoomTemplate('cell-basic', { x: 14, y: 10 }))).toEqual({ ok: true });
});
