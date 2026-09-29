import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';

it('rolls back a room when furniture is refused after shell completion', () => {
  const runtime = createNewSimulationRuntime(123);
  runtime.kernel.submitCommand('room', 0, runtime.kernel.tick, packCommand({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } }));
  runtime.kernel.step();
  const placement = (runtime.roomTemplates as any).objectPlacement;
  placement.place = () => ({ kind: 'refused', reason: 'tile-occupied', tile: { x: 11, y: 11 } });
  for (let i = 0; i < 30_000 && runtime.roomTemplates.snapshot().pending.length > 0; i += 1) runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.construction.allOrders().every((order) => order.state === 'cancelled')).toBe(true);
  expect(runtime.prisoners.roomInstances.getById('room.cell:11:11')).toBeUndefined();
});
