import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { projectRoomTemplatePreflight } from '../../src/simulation/presentation/room-template-preflight';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

it('refuses an overflowing preflight and command, then remains usable after save and load', () => {
  const runtime = createNewSimulationRuntime(73);
  const origin = { x: Number.MAX_SAFE_INTEGER, y: 10 };
  const refusal = { ok: false, reason: 'unowned-land', tile: { x: tileCoordinate(origin.x), y: tileCoordinate(origin.y) } };
  expect(projectRoomTemplatePreflight(runtime.roomTemplates, 'cell-basic', origin)).toEqual(refusal);
  const before = runtime.construction.allOrders();
  runtime.kernel.submitCommand('invalid-template', 0, runtime.kernel.tick, packCommand({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin }));
  runtime.kernel.step();
  expect(runtime.construction.allOrders()).toEqual(before);
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);

  const restored = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  expect(projectRoomTemplatePreflight(restored.roomTemplates, 'cell-basic', { x: 10, y: 10 })).toEqual({ ok: true });
  restored.kernel.submitCommand('valid-template', 1, restored.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  restored.kernel.step();
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(1);
});
