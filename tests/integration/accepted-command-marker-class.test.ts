import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const surfaces = ['none', 'zone-refused', 'admit-refused', 'buy-refused', 'sell-refused', 'hire-refused',
  'release-refused', 'dismiss-refused', 'regime-refused', 'regime-unchanged', 'dismiss-absent-acknowledgement'] as const;
const reasons = {
  'zone-refused': 'zone.duplicate-instance-id', 'admit-refused': 'admit.no-accommodation',
  'buy-refused': 'purchase.insufficient-funds', 'sell-refused': 'sell.insufficient-stock',
  'hire-refused': 'hire.no-duty-for-role', 'release-refused': 'release-guard.unknown-guard',
  'dismiss-refused': 'dismiss.unknown-staff', 'regime-refused': 'edit-regime-block.unknown-block',
} as const;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`accepted-marker-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function reload(runtime: Runtime): Runtime {
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'accepted-command-marker', revision: 1, createdAt: 0, updatedAt: 1,
    ...captureSessionSnapshot(runtime),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed Yard and earlier player lifecycle must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

it.each([false, true].flatMap(saved => surfaces.map(surface => ({ saved, surface }))))(
  'actual non-changing command after completed template: saved=$saved surface=$surface', ({ saved, surface }) => {
    let runtime = createNewSimulationRuntime(73);
    let departedGuard = 0;
    if (surface === 'release-refused' || surface === 'dismiss-refused') {
      send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
      departedGuard = runtime.securityGuards.allGuardIds()[0]!;
      send(runtime, { type: 'DismissStaff', staffId: departedGuard });
      expect(runtime.securityGuards.allGuardIds()).toHaveLength(0);
      expect(runtime.refusals.count).toBe(0);
    }
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 5, y: 5 }, mirrorX: true, quarterTurns: 1 });
    for (let tick = 0; tick < 100 && runtime.roomTemplates.snapshot().pending.length > 0; tick++) runtime.kernel.step();
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
    expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard')).toHaveLength(1);
    if (saved) runtime = reload(runtime);
    const schedule = runtime.prisoners.regimes.all()[0]!;
    const block = schedule.blocks[0]!;
    const commands: Partial<Record<(typeof surfaces)[number], SimulationCommand>> = {
      'zone-refused': { type: 'ZoneRoom', roomId: 'room.yard', x: 5, y: 5, width: 8, height: 8 },
      'admit-refused': { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 },
      'buy-refused': { type: 'PurchaseMaterials', orderId: 'cannot-afford', itemId: 'item.brick', quantity: 1000 },
      'sell-refused': { type: 'SellMaterials', itemId: 'item.wood-plank', quantity: 1 },
      'hire-refused': { type: 'HireStaff', staffRoleId: 'staff-role.doctor', x: 16, y: 16 },
      'release-refused': { type: 'ReleaseGuardAssignment', guardId: departedGuard },
      'dismiss-refused': { type: 'DismissStaff', staffId: departedGuard },
      'regime-refused': { type: 'EditRegimeBlock', classificationGroupId: schedule.classificationGroupId, startTickOfDay: 1, allowedCategories: [...block.allowedCategories] },
      'regime-unchanged': { type: 'EditRegimeBlock', classificationGroupId: schedule.classificationGroupId, startTickOfDay: block.startTickOfDay, allowedCategories: [...block.allowedCategories].reverse() },
      // Existing explicit housekeeping policy treats an absent alert as an
      // accepted acknowledgement. It remains a legal later-action control.
      'dismiss-absent-acknowledgement': { type: 'DismissAlert', fromSequence: 999, throughSequence: 999 },
    };
    const funds = runtime.treasury.balanceMinorUnits;
    const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
    const candidate = commands[surface];
    if (candidate !== undefined) send(runtime, candidate);
    const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
    expect(after).toEqual(before);
    if (surface in reasons) {
      expect(runtime.refusals.count).toBe(1);
      expect(runtime.refusals.last).toMatchObject({ reason: reasons[surface as keyof typeof reasons] });
    }
    else expect(runtime.refusals.count).toBe(0);
    send(runtime, { type: 'Undo' });
    expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard')).toHaveLength(
      surface === 'dismiss-absent-acknowledgement' ? 1 : 0,
    );
    expect(runtime.placedObjects.getSnapshot()).toEqual(before.simulation!.objects!.placedObjects);
    expect(runtime.treasury.balanceMinorUnits).toBe(funds);
  },
);
