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
  // The classified sentence ends at 1809. Natural discharge runs at 1820,
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


// These are the existing domain search-order API, not a player search command.
// Container location registration is an explicit scenario port; it is not
// persisted by the current player save and is therefore tested live only.
it.each(['room', 'staff', 'container'].flatMap(kind => [false, true].map(missing => ({ kind, missing }))))(
  'keeps supported domain target scopes exact: kind=$kind missing=$missing', ({ kind, missing }) => {
    const runtime = createNewSimulationRuntime(73);
    let target: { holderKind: 'cell' | 'staff' | 'container'; holderId: string };
    let scope: 'cell' | 'person' | 'delivery';
    if (kind === 'room') {
      send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 }, quarterTurns: 1 });
      until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every(order => order.state === 'completed'));
      const room = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')[0]!;
      target = { holderKind: 'cell', holderId: room.instanceId };
      scope = 'cell';
      runtime.searchSystem.submitOrder({ id: 'domain-target', scope, targets: [target] });
      if (missing) send(runtime, { type: 'UnzoneRoom', ...room.anchorTile, width: room.width!, height: room.height! });
    } else if (kind === 'staff') {
      send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
      const staff = runtime.securityGuards.allGuardIds()[0]!;
      target = { holderKind: 'staff', holderId: String(staff) };
      scope = 'person';
      runtime.searchSystem.submitOrder({ id: 'domain-target', scope, targets: [target] });
      if (missing) send(runtime, { type: 'DismissStaff', staffId: staff });
    } else {
      target = { holderKind: 'container', holderId: missing ? 'absent-domain-container' : 'construction-materials' };
      scope = 'delivery';
      runtime.searchContainerLocations.set(target.holderId, { x: 23, y: 23 });
      runtime.searchSystem.submitOrder({ id: 'domain-target', scope, targets: [target] });
    }
    const before = runtime.searchSystem.getMetrics();
    expect(before.searchesCompleted).toBe(0);
    for (let tick = 0; tick < 30; tick++) runtime.kernel.step();
    if (missing) {
      expect(runtime.searchSystem.isQueued('domain-target')).toBe(false);
      expect(runtime.searchSystem.getMetrics().searchesCancelled).toBe(1);
      expect(runtime.searchSystem.claimedGuardIds()).toHaveLength(0);
    } else expect(runtime.searchSystem.isQueued('domain-target')).toBe(true);
    for (let guard = 0; guard < 3; guard++) {
      send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
    }
    for (let tick = 0; tick < 500; tick++) runtime.kernel.step();
    expect(runtime.refusals.count).toBe(0);
    expect(runtime.searchSystem.getMetrics()).toMatchObject({
      searchesCompleted: missing ? 0 : 1, searchesCancelled: missing ? 1 : 0, searchesQueued: 0,
    });
    expect(runtime.searchSystem.claimedGuardIds()).toHaveLength(0);
  });

it.each([false, true])('domain queued order validates the full recycled ID, saved=%s', saved => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 }, quarterTurns: 1 });
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed'));
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 100, priorIncidents: 0, x: 16, y: 16 });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
  const old = runtime.prisoners.entityStore.getIdByIndex(0);
  const index = runtime.prisoners.entityStore.getIndex(old);
  until(runtime, () => !runtime.prisoners.entityStore.isAlive(old));
  send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, x: 26, y: 26 });
  const current = runtime.prisoners.entityStore.getIdByIndex(index);
  expect(current).not.toBe(old);
  expect(runtime.prisoners.entityStore.getIndex(current)).toBe(index);
  expect(runtime.prisoners.entityStore.isAlive(current)).toBe(true);
  // Existing domain API; both actual IDs are saved before any queued staffing.
  runtime.searchSystem.submitOrder({ id: 'stale-owner', scope: 'person', targets: [{ holderKind: 'prisoner', holderId: String(old) }] });
  runtime.searchSystem.submitOrder({ id: 'new-owner', scope: 'person', targets: [{ holderKind: 'prisoner', holderId: String(current) }] });
  if (saved) runtime = reload(runtime);
  for (let tick = 0; tick < 30; tick++) runtime.kernel.step();
  expect(runtime.searchSystem.isQueued('stale-owner')).toBe(false);
  expect(runtime.searchSystem.isQueued('new-owner')).toBe(true);
  expect(runtime.searchSystem.getMetrics().searchesCancelled).toBe(1);
  for (let guard = 0; guard < 3; guard++) send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
  until(runtime, () => runtime.searchSystem.getMetrics().searchesCompleted === 1, 500);
  expect(runtime.refusals.count).toBe(0);
  expect(runtime.searchSystem.getMetrics().searchesCancelled).toBe(1);
  expect(runtime.searchSystem.orderIds()).toHaveLength(0);
  expect(runtime.searchSystem.claimedGuardIds()).toHaveLength(0);
  expect(runtime.prisoners.entityStore.isAlive(old)).toBe(false);
  expect(runtime.prisoners.entityStore.isAlive(current)).toBe(true);
});
