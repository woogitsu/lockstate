import { completedWallLogisticsSave } from './completed-wall-logistics';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../../src/simulation/runtime/restore-session';
import { createSaveEnvelope } from '../../../src/persistence/save-schema';
import { packCommand } from '../../../src/simulation/protocol/commands';

/** Legal hires; no injected actor, stock, wall or roster record. */
export function pendingWallGuardsSave() {
  const logistics = completedWallLogisticsSave();
  const { runtime } = restoreSimulationRuntime(logistics.payload as SessionSnapshotBundle);
  for (const [sequence, y] of [19, 21].entries()) {
    runtime.kernel.submitCommand(`depth-guard-${sequence}`, sequence + 2, runtime.kernel.tick,
      packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 20, y }));
  }
  for (let step = 0; step < 10; step += 1) runtime.kernel.step();
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'native-pending-wall-depth', revision: 1,
    createdAt: 1700000000000, updatedAt: 1700000000001,
    ...captureSessionSnapshot(runtime),
  });
}


