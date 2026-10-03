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

function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
const successfulTypes: Record<SimulationCommand['type'], true> = {
  PlaceBuildOrder: true, PlaceObject: true, PlaceRoomTemplate: true, Undo: true, Redo: true,
  CancelBuildOrder: true, CancelMaterialPurchase: true, RemoveObject: true, RemoveWall: true,
  ZoneRoom: true, UnzoneRoom: true, AdmitPrisoner: true, PurchaseMaterials: true, SellMaterials: true,
  HireStaff: true, ReleaseGuardAssignment: true, DismissStaff: true, DismissAlert: true, EditRegimeBlock: true,
};
it.each([false, true].flatMap(saved => (Object.keys(successfulTypes) as SimulationCommand['type'][])
  .map(type => ({ saved, type }))))('real accepted command preserves its own history meaning: saved=$saved type=$type', ({ saved, type }) => {
  let runtime = createNewSimulationRuntime(73);
  let guardId = 0;
  if (type === 'UnzoneRoom' || type === 'DismissAlert') send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 18, y: 18, width: 8, height: 8 });
  if (type === 'Undo') {
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 18, y: 18 } });
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0);
  }
  if (['AdmitPrisoner', 'PlaceObject', 'RemoveObject', 'ReleaseGuardAssignment'].includes(type)) {
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 18, y: 18 } });
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed'));
  }
  if (type === 'SellMaterials') {
    send(runtime, { type: 'PurchaseMaterials', orderId: 'earlier-stock', itemId: 'item.wood-plank', quantity: 4 });
    until(runtime, () => runtime.procurement.pendingDeliveries.length === 0);
  }
  if (type === 'ReleaseGuardAssignment' || type === 'DismissStaff') {
    send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
    guardId = runtime.securityGuards.allGuardIds()[0]!;
    if (type === 'ReleaseGuardAssignment') {
      // An empty default sector does not hold a guard. Real accommodation,
      // staffing and admission produce a genuine deployment/search claimant.
      for (let guard = 0; guard < 2; guard++) send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
      send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, x: 16, y: 16 });
      until(runtime, () => runtime.securityGuards.allGuardIds().some(id => runtime.guardRelease.claimOf(id) !== undefined));
      guardId = runtime.securityGuards.allGuardIds().find(id => runtime.guardRelease.claimOf(id) !== undefined)!;
    }
  }
  if (type === 'CancelBuildOrder' || type === 'RemoveWall') {
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'older-wall', definitionId: 'wall-brick', x: 2, y: 2, footprint: 'square' });
    until(runtime, () => runtime.construction.getOrder('older-wall')?.state === 'completed');
  }
  if (type === 'RemoveObject') {
    // The genuine earlier Cell's authored bed is at19,19. A bed outside a
    // room is refused by PlaceObject; standing removal requires no new bed.
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  }
  if (type === 'CancelMaterialPurchase') {
    send(runtime, { type: 'PurchaseMaterials', orderId: 'older-delivery', itemId: 'item.brick', quantity: 1 });
  }
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 5, y: 5 }, mirrorX: true, quarterTurns: 1 });
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0);
  expect(runtime.roomTemplates.snapshot().completed?.some(plan => plan.origin.x === 5 && plan.origin.y === 5)).toBe(true);
  if (saved) runtime = reload(runtime);
  const regime = runtime.prisoners.regimes.all()[0]!;
  const block = regime.blocks[0]!;
  let action: SimulationCommand;
  switch (type) {
    case 'ZoneRoom': action = { type, roomId: 'room.yard', x: 18, y: 18, width: 8, height: 8 }; break;
    case 'UnzoneRoom': action = { type, x: 18, y: 18, width: 8, height: 8 }; break;
    case 'AdmitPrisoner': action = { type, sentenceLengthTicks: 1_000_000, priorIncidents: 0, x: 16, y: 16 }; break;
    case 'PurchaseMaterials': action = { type, orderId: 'accepted-buy', itemId: 'item.brick', quantity: 1 }; break;
    case 'SellMaterials': action = { type, itemId: 'item.wood-plank', quantity: 1 }; break;
    case 'HireStaff': action = { type, staffRoleId: 'staff-role.guard', x: 16, y: 16 }; break;
    case 'ReleaseGuardAssignment': action = { type, guardId }; break;
    case 'DismissStaff': action = { type, staffId: guardId }; break;
    case 'DismissAlert': {
      const event = runtime.events.getSnapshot().records.at(-1)!;
      expect(event).toBeDefined();
      action = { type, fromSequence: event.sequence, throughSequence: event.sequence }; break;
    }
    case 'EditRegimeBlock': action = { type, classificationGroupId: regime.classificationGroupId, startTickOfDay: block.startTickOfDay, allowedCategories: ['work'] }; break;
    case 'CancelBuildOrder': action = { type, orderId: 'older-wall', expectedRevision: runtime.construction.revisionOf('older-wall') }; break;
    case 'CancelMaterialPurchase':
      expect(runtime.procurement.pendingDeliveries.some(delivery => delivery.orderId === 'older-delivery')).toBe(true);
      action = { type, orderId: 'older-delivery' }; break;
    case 'RemoveObject': action = { type, x: 19, y: 19 }; break;
    case 'RemoveWall': action = { type, x: 2, y: 2, edge: 'north' }; break;
    case 'PlaceBuildOrder': action = { type, orderId: 'new-wall', definitionId: 'wall-brick', x: 2, y: 2, footprint: 'square' }; break;
    case 'PlaceObject': action = { type, orderId: 'new-bed', definitionId: 'bed-wooden', x: 20, y: 19 }; break;
    case 'PlaceRoomTemplate': action = { type, templateId: 'yard-basic', origin: { x: 18, y: 18 } }; break;
    case 'Undo': action = { type }; break;
    case 'Redo':
      send(runtime, { type: 'Undo' });
      expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard')).toHaveLength(0);
      action = { type }; break;
    default: { const missing: never = type; throw new Error(`Missing actual accepted control ${String(missing)}`); }
  }
  const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
  send(runtime, action);
  expect(runtime.refusals.count).toBe(0);
  if (type === 'ReleaseGuardAssignment') expect(runtime.guardRelease.claimOf(guardId)).toBeUndefined();
  if (type === 'DismissStaff') expect(runtime.securityGuards.allGuardIds()).not.toContain(guardId);
  if (type === 'RemoveObject') expect(runtime.placedObjects.getSnapshot()).toHaveLength(1);
  if (action.type === 'DismissAlert') expect(runtime.events.getSnapshot().dismissed).toContain(action.fromSequence);
  const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
  expect(after).not.toEqual(before);
  const historyOwned = ['PlaceBuildOrder', 'PlaceObject', 'PlaceRoomTemplate', 'Undo', 'Redo'].includes(type);
  if (type === 'Redo') until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0);
  if (!historyOwned) {
    // Neither another genuine refusal nor a canonical no-op can erase an
    // already accepted later action. These are actual packed calls, not flags.
    const current = runtime.prisoners.regimes.all()[0]!.blocks[0]!;
    send(runtime, { type: 'EditRegimeBlock', classificationGroupId: regime.classificationGroupId, startTickOfDay: current.startTickOfDay, allowedCategories: [...current.allowedCategories].reverse() });
    send(runtime, { type: 'PurchaseMaterials', orderId: 'later-refused-buy', itemId: 'item.brick', quantity: 1000 });
    expect(runtime.refusals.last).toMatchObject({ reason: 'purchase.insufficient-funds' });
    const accepted = captureSessionSnapshot(runtime);
    send(runtime, { type: 'Undo' });
    const afterUndo = captureSessionSnapshot(runtime);
    expect(afterUndo.world).toEqual(accepted.world);
    expect(afterUndo.construction).toEqual(accepted.construction);
    expect(runtime.placedObjects.getSnapshot()).toEqual(accepted.simulation!.objects!.placedObjects);
    expect(runtime.roomTemplates.snapshot().completed?.some(plan => plan.origin.x === 5 && plan.origin.y === 5)).toBe(true);
    return;
  }
  send(runtime, { type: 'Undo' });
  if (type === 'PlaceBuildOrder') expect(runtime.construction.getOrder('new-wall')?.state).toBe('cancelled');
  if (type === 'PlaceObject') expect(runtime.construction.getOrder('new-bed')?.state).toBe('cancelled');
  if (type === 'PlaceRoomTemplate') expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard')).toHaveLength(type === 'Undo' || type === 'Redo' ? 0 : 1);
});
