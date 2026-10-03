import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`search-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean, max = 30_000) {
  for (let tick = 0; tick < max && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'search-departure', revision: 1, createdAt: 0, updatedAt: 1, ...bundle,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual standing sweep and in-flight route must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

const cases = [false, true].flatMap(saved =>
  ['live-target', 'departed', 'recycled'].map(surface => ({ saved, surface })));
it.each(cases)('standing sweep respects a genuine discharged target: saved=$saved surface=$surface', ({ saved, surface }) => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 }, mirrorX: true, quarterTurns: 1 });
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed'));
  for (let guard = 0; guard < 3; guard++) {
    send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
  }
  // The classified sentence ends at1809. Natural discharge runs at1820,
  // during the standing sweep's real first travel/dwell rather than after it.
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: surface === 'live-target' ? 10_000 : 1795 - runtime.kernel.tick,
    priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  const target = runtime.prisoners.entityStore.getIdByIndex(0);
  const index = runtime.prisoners.entityStore.getIndex(target);
  const end = runtime.prisoners.records.sentenceEndTick[index]!;
  if (surface !== 'live-target') expect(end).toBe(1809);
  while (runtime.kernel.tick < 1800) runtime.kernel.step();
  expect(runtime.searchSystem.getMetrics().searchesCompleted).toBe(0);
  until(runtime, () => runtime.searchSystem.orderIds().length > 0, 100);
  expect(runtime.kernel.tick).toBe(1801);
  const sweep = runtime.searchSystem.orderIds()[0]!;
  const progress = runtime.searchSystem.getInFlightSnapshot().jobs.find(job => job.id === sweep)!;
  expect(progress).toMatchObject({ state: 'travelling', travelInFlight: true });
  expect(progress.pathRequestIdsByGuard).toHaveLength(1);
  expect(runtime.searchSystem.getSnapshot().active[0]![1].targets).toEqual([{ holderKind: 'prisoner', holderId: String(target) }]);
  let replacement: number | undefined;
  const owners = runtime.placedObjects.getSnapshot();
  const construction = runtime.construction.snapshot();
  if (saved) runtime = reload(runtime);
  if (surface !== 'live-target') {
    while (runtime.kernel.tick < 1820) runtime.kernel.step();
    expect(runtime.prisoners.entityStore.isAlive(target)).toBe(true);
    expect(runtime.searchSystem.getJobState(sweep)).toBe('searching');
    runtime.kernel.step(); // real discharge before the scheduled search update
    expect(runtime.prisoners.entityStore.isAlive(target)).toBe(false);
    if (surface === 'recycled') {
      send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, x: 26, y: 26 });
      replacement = runtime.prisoners.entityStore.getIdByIndex(index);
      expect(replacement).not.toBe(target);
      expect(runtime.prisoners.entityStore.getIndex(replacement)).toBe(index);
      expect(runtime.prisoners.entityStore.isAlive(replacement)).toBe(true);
      expect(runtime.prisoners.entityStore.isAlive(target)).toBe(false);
    }
  }
  for (let tick = 0; tick < 500; tick++) runtime.kernel.step();
  const metrics = runtime.searchSystem.getMetrics();
  console.log(JSON.stringify({ saved, surface, tick: runtime.kernel.tick, end, target, sweep, metrics }));
  expect(runtime.refusals.count).toBe(0);
  expect(runtime.placedObjects.getSnapshot()).toEqual(owners);
  expect(runtime.construction.snapshot()).toEqual(construction);
  expect(metrics.searchesCompleted).toBe(surface === 'live-target' ? 1 : 0);
  expect(metrics.searchesCancelled).toBe(surface === 'live-target' ? 0 : 1);
  expect(runtime.searchSystem.orderIds()).not.toContain(sweep);
  expect(runtime.searchSystem.claimedGuardIds()).toHaveLength(0);
  if (replacement !== undefined) {
    while (runtime.kernel.tick < 2401) runtime.kernel.step();
    const next = runtime.searchSystem.getSnapshot().active[0]!;
    expect(next[1].targets).toEqual([{ holderKind: 'prisoner', holderId: String(replacement) }]);
    until(runtime, () => runtime.searchSystem.getMetrics().searchesCompleted === 1, 500);
    expect(runtime.searchSystem.getMetrics().searchesCancelled).toBe(1);
    expect(runtime.prisoners.entityStore.isAlive(replacement)).toBe(true);
  }
  for (const [, request] of progress.pathRequestIdsByGuard) {
    expect(runtime.navigation.getResult(request)).toBeUndefined();
  }
});

