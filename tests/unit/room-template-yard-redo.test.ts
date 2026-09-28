import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

it('does not redo a cancelled wall into a newly designated Yard', () => {
  const runtime = createNewSimulationRuntime(73);
  let sequence = 0;
  const send = (command: SimulationCommand): void => {
    runtime.kernel.submitCommand(`yard-redo-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
  };
  send({ type: 'PlaceBuildOrder', orderId: 'old-yard-wall', definitionId: 'wall-brick',
    x: 12, y: 12, footprint: 'square' });
  expect(runtime.construction.getOrder('old-yard-wall')?.state).not.toBe('failed');
  send({ type: 'Undo' });
  expect(runtime.construction.getOrder('old-yard-wall')?.state).toBe('cancelled');
  send({ type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 10, y: 10 } });
  expect(runtime.prisoners.roomInstances.getById('room.yard:10:10')).toBeDefined();
  expect(runtime.construction.snapshot().redoStack).toEqual([]);
  const restored = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  expect(restored.construction.snapshot().redoStack).toEqual([]);
  send({ type: 'Redo' });
  expect(runtime.construction.getOrder('old-yard-wall')?.state).toBe('cancelled');
  expect(restored.construction.redo()).toBe(false);
  expect(restored.construction.getOrder('old-yard-wall')?.state).toBe('cancelled');
});

it('preserves Redo when a Yard placement is refused', () => {
  const runtime = createNewSimulationRuntime(74);
  let sequence = 0;
  const send = (command: SimulationCommand): void => {
    runtime.kernel.submitCommand(`yard-refused-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
  };
  send({ type: 'PlaceBuildOrder', orderId: 'redo-after-refusal', definitionId: 'wall-brick',
    x: 20, y: 20, footprint: 'square' });
  send({ type: 'Undo' });
  runtime.world.setSquareStructure({ x: tileCoordinate(11), y: tileCoordinate(11) }, 1);
  send({ type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 10, y: 10 } });
  expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable' });
  expect(runtime.construction.redoWouldReapplySomething).toBe(true);
  send({ type: 'Redo' });
  expect(runtime.construction.getOrder('redo-after-refusal')?.state).toBe('approved');
});
