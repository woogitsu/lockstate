import { createNewSimulationRuntime } from '../../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../../src/simulation/runtime/restore-session';
import { packCommand } from '../../../src/simulation/protocol/commands';
import { createSaveEnvelope } from '../../../src/persistence/save-schema';

/** Real scheduled logistics, no injected stock or completed wall. */
export function completedWallLogisticsSave(cutaway = false) {
  const runtime = createNewSimulationRuntime(73);
  for (const [index, templateId] of (['storage-room-basic', 'delivery-bay-basic'] as const).entries()) {
    runtime.kernel.submitCommand(`logistics-${index}`, index, runtime.kernel.tick,
      packCommand({ type: 'PlaceRoomTemplate', templateId, origin: { x: 5 + index * 7, y: 5 } }));
  }
  if (cutaway) {
    // Genuine empty Yard directly behind the future wall at both ±45° yaws.
    // No fixtures can trigger the separate complete-wall hiding rule.
    runtime.kernel.submitCommand('wall-yard', 2, runtime.kernel.tick,
      packCommand({ type: 'ZoneRoom', roomId: 'room.yard', x: 16, y: 12, width: 8, height: 8 }));
  }
  for (let step = 0; step < 25000; step += 1) {
    runtime.kernel.step();
    if (step > 0 && runtime.roomTemplates.snapshot().pending.length === 0 &&
      runtime.construction.allOrders().every(order => order.state === 'completed')) break;
  }
  if (runtime.roomTemplates.snapshot().pending.length !== 0 || runtime.construction.allOrders().length === 0 ||
    runtime.construction.allOrders().some(order => order.state !== 'completed')) {
    throw new Error('Real logistics fixture did not finish its scheduled construction');
  }
  const saved = captureSessionSnapshot(runtime);
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'native-square-wall-footprint', revision: 1,
    createdAt: 1700000000000, updatedAt: 1700000000001,
    ...saved,
  });
}
