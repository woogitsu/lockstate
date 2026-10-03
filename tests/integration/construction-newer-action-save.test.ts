import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`hire-load-undo-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

it.each([false, true].flatMap(hire => [false, true].map(load => ({ hire, load }))))(
  'Undo consistency after accepted hire=$hire, encodedLoad=$load',
  ({ hire, load }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'owned-square', definitionId: 'wall-brick', x: 12, y: 12, footprint: 'square' });
    for (let tick = 0; tick < 4000 && runtime.construction.getOrder('owned-square')?.state !== 'completed'; tick++) runtime.kernel.step();
    expect(runtime.construction.getOrder('owned-square')?.state).toBe('completed');
    if (hire) send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 4, y: 4 });
    expect(runtime.securityGuards.allGuardIds()).toHaveLength(hire ? 1 : 0);
    expect(runtime.treasury.balanceMinorUnits).toBe(hire ? 24840 : 24920);
    const original = captureSessionSnapshot(runtime);
    if (load) {
      const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
        gameVersion: 'test', prisonId: 'hire-load-undo', revision: 1, createdAt: 0, updatedAt: 1, ...original,
      }))));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error('Actual save must decode');
      runtime = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
    }
    const before = captureSessionSnapshot(runtime), eventsBefore = runtime.events.since(0).length;
    send(runtime, { type: 'Undo' });
    const after = captureSessionSnapshot(runtime);
    expect(runtime.securityGuards.allGuardIds()).toHaveLength(hire ? 1 : 0);
    expect(runtime.treasury.balanceMinorUnits).toBe(hire ? 24840 : 24920);
    expect(runtime.construction.getOrder('owned-square')?.state).toBe(hire ? 'completed' : 'cancelled');
    expect(runtime.world.getSquareStructure({ x: 12, y: 12 })).toBe(hire ? 1 : 0);
    expect(runtime.events.since(0).slice(eventsBefore).map(event => event.type)).toEqual([
      hire ? 'construction.undo-refused-newer-action' : 'construction.undone-spend-destroyed',
    ]);
    if (hire) {
      expect(after.construction).toEqual(before.construction);
      expect(after.world).toEqual(before.world);
      const { alerts: _beforeEvents, ...beforeSystems } = before.simulation!;
      const { alerts: _afterEvents, ...afterSystems } = after.simulation!;
      expect(afterSystems).toEqual(beforeSystems);
      expect(after.identity).toEqual(before.identity);
      expect(after.entities).toEqual(before.entities);
    }
  },
);
