import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`sanction-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'same-room-release', revision: 1, createdAt: 0, updatedAt: 1, ...bundle,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('The completed template and active sanction must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

const cases = [false, true].flatMap(saved =>
  ['high-risk', 'general-population', 'removed-bed'].map(surface => ({ saved, surface })));
it.each(cases)('releases a valid current home after completed template sanction: saved=$saved surface=$surface', ({ saved, surface }) => {
  let runtime = createNewSimulationRuntime(73);
  for (const [templateId, x, y] of [['solitary-cell-basic', 5, 5], ['cell-basic', 15, 15]] as const) {
    send(runtime, { type: 'PlaceRoomTemplate', templateId, origin: { x, y }, mirrorX: true, quarterTurns: 1 });
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
      runtime.construction.allOrders().every(order => order.state === 'completed'));
  }
  // The real high-risk escape producer otherwise removes the resident before
  // the term ends. Real hires keep this a release test about a living resident.
  for (let guard = 0; guard < 3; guard++) {
    send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
  }
  expect(runtime.refusals.count).toBe(0);
  const highRisk = surface !== 'general-population';
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: highRisk ? 255 : 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  const resident = runtime.prisoners.entityStore.getIdByIndex(0);
  const index = runtime.prisoners.entityStore.getIndex(resident);
  const home = runtime.prisoners.coldState.getAccommodation(resident)!;
  expect(runtime.prisoners.roomInstances.getById(home)?.roomCatalogId).toBe(highRisk ? 'room.solitary-cell' : 'room.cell');

  // Existing incident follow-through API; no synthetic sanction record write.
  // This does not claim a player UI producer for high prior incidents/sanctions.
  runtime.prisoners.imposeSolitarySanction(resident, runtime.kernel.tick);
  const end = runtime.prisoners.records.solitarySanctionEndTick[index]!;
  until(runtime, () => runtime.prisoners.isServingSolitarySanction(resident));
  if (surface === 'removed-bed') {
    const bed = runtime.placedObjects.getSnapshot().find(object => object.objectId === 'object.bed' && object.anchorTile.x < 15)!;
    send(runtime, { type: 'RemoveObject', ...bed.anchorTile });
    expect(runtime.prisoners.roomInstances.getById(home)?.objectCapabilities).not.toContain('sleep-surface');
  }
  const owners = runtime.placedObjects.getSnapshot();
  const history = runtime.construction.snapshot();
  if (saved) runtime = reload(runtime);
  while (runtime.kernel.tick < end + 10) runtime.kernel.step();
  expect(runtime.prisoners.entityStore.isAlive(resident), 'the resident must survive the real term').toBe(true);
  expect(runtime.placedObjects.getSnapshot()).toEqual(owners);
  expect(runtime.construction.snapshot()).toEqual(history);
  expect(runtime.prisoners.coldState.getAccommodation(resident)).toBe(home);
  expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
  console.log(JSON.stringify({ saved, surface, tick: runtime.kernel.tick, end,
    actualEnd: runtime.prisoners.records.solitarySanctionEndTick[index], home,
    metrics: runtime.prisoners.sanctionSystem.getMetrics() }));
  if (surface === 'removed-bed') {
    expect(runtime.prisoners.records.solitarySanctionEndTick[index]).toBe(end);
    expect(runtime.prisoners.sanctionSystem.getMetrics().releaseBacklogTicks).toBeGreaterThan(0);
  } else {
    expect(runtime.prisoners.records.solitarySanctionEndTick[index]).toBe(0);
    expect(runtime.prisoners.sanctionSystem.getMetrics().releasedFromSolitaryCount).toBe(1);
    expect(runtime.prisoners.sanctionSystem.getMetrics().releaseBacklogTicks).toBe(0);
  }
});

