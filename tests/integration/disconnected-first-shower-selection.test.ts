import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { routeWaypoints } from '../../src/simulation/navigation/route';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
function send(runtime: SimulationRuntime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`disconnected-room-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: SimulationRuntime, predicate: () => boolean) {
  for (let count = 0; count < 30_000 && !predicate(); count++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function finish(runtime: SimulationRuntime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed'));
}
function reload(runtime: SimulationRuntime) {
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    ...captureSessionSnapshot(runtime), gameVersion: 'test', prisonId: 'disconnected-first-shower',
    revision: 1, createdAt: 0, updatedAt: 1,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed prison must decode');
  expect(decoded.value.saveSchemaVersion).toBe(10);
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

it.each([false, true].flatMap(load => [false, true].map(blocked => ({ load, blocked }))))(
  'uses a reachable later Shower instead of retrying a disconnected first room: blocked=$blocked V8=$load', ({ load, blocked }) => {
    let runtime = createNewSimulationRuntime(73);
    for (const [templateId, x, y, quarterTurns] of [
      ['storage-room-basic', 2, 2, 0], ['delivery-bay-basic', 20, 2, 0],
      ['shower-room', 20, 14, 1], ['shower-room', 5, 14, 1], ['cell-basic', 5, 24, 1],
    ] as const) send(runtime, { type: 'PlaceRoomTemplate', templateId, origin: { x, y }, quarterTurns });
    finish(runtime);
    const showers = runtime.prisoners.roomInstances.allByRoomCatalogId('room.shower-room');
    expect(showers.map(room => ({ id: room.instanceId, anchor: room.anchorTile }))).toEqual([
      { id: 'room.shower-room:21:15', anchor: tile(21, 15) },
      { id: 'room.shower-room:6:15', anchor: tile(6, 15) },
    ]);
    for (const room of showers) expect(runtime.prisoners.roomInstances.concurrentUseCapacityFor(room, 'hygiene')).toBe(2);
    // Literal clockwise 5x5 reference: heads at(1,1)/(3,1) become(3,1)/(3,3).
    expect(runtime.placedObjects.getSnapshot().filter(row => row.objectId === 'object.shower-head')
      .map(row => ({ anchor: row.anchorTile, orientation: row.orientation, owner: row.sourceOrderId }))).toEqual([
        { anchor: tile(8, 15), orientation: 1, owner: 'room-template-000000000003-2-object-000' },
        { anchor: tile(23, 15), orientation: 1, owner: 'room-template-000000000002-2-object-000' },
        { anchor: tile(8, 17), orientation: 1, owner: 'room-template-000000000003-2-object-001' },
        { anchor: tile(23, 17), orientation: 1, owner: 'room-template-000000000002-2-object-001' },
      ]);
    expect(runtime.placedObjects.isTileOccupied(tile(21, 15))).toBe(false);
    const ring: { x: number; y: number }[] = [];
    // Independent outer 9x9 perimeter, one full tile away from the paid doorway.
    for (let y = 12; y <= 20; y++) for (let x = 18; x <= 26; x++) {
      if (x !== 18 && x !== 26 && y !== 12 && y !== 20) continue;
      if (!blocked && x === 18 && y === 16) continue; // genuine one-tile legal gap
      ring.push({ x, y });
      send(runtime, { type: 'PlaceBuildOrder', orderId: `ring-${x}-${y}`, definitionId: 'wall-brick',
        x, y, footprint: 'square', transactionId: 'independent-ring' });
    }
    finish(runtime);
    expect(runtime.construction.allOrders().filter(order => order.id.startsWith('ring-'))
      .map(order => ({ x: order.location.x, y: order.location.y, state: order.state })))
      .toEqual(ring.map(location => ({ ...location, state: 'completed' })));
    send(runtime, { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 });
    send(runtime, { type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, x: 16, y: 16 });
    until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 1);
    const entityId = runtime.prisoners.entityStore.getIdByIndex(0);
    const schedule = runtime.prisoners.regimes.all().find(row => row.classificationGroupId === 'general-population')!;
    for (const block of schedule.blocks) send(runtime, { type: 'EditRegimeBlock',
      classificationGroupId: 'general-population', startTickOfDay: block.startTickOfDay, allowedCategories: ['hygiene'] });
    if (load) runtime = reload(runtime);
    const actualPosition = tile(runtime.prisoners.position.tileX[0]!, runtime.prisoners.position.tileY[0]!);
    const graph = runtime.navigation.getGraph();
    expect(graph.tileToRegion.has('21,15')).toBe(true);
    expect(graph.tileToRegion.has('6,15')).toBe(true);
    runtime.navigation.requestRoute('independent-first-room', actualPosition, tile(21, 15),
      { role: 'prisoner', securityClearance: 0 }, 0, runtime.kernel.tick);
    runtime.navigation.requestRoute('independent-later-room', actualPosition, tile(6, 15),
      { role: 'prisoner', securityClearance: 0 }, 0, runtime.kernel.tick);
    until(runtime, () => runtime.navigation.getResult('independent-later-room') !== undefined &&
      runtime.navigation.getResult('independent-first-room') !== undefined);
    const first = runtime.navigation.getResult('independent-first-room')!.result;
    expect(first).toMatchObject(blocked ? { ok: false, failure: { reason: 'unreachable' } } : { ok: true });
    runtime.navigation.clearResult('independent-first-room');
    const path = runtime.navigation.getResult('independent-later-room')!.result;
    expect(path).toMatchObject({ ok: true });
    if (!path.ok) throw new Error('The later Shower must be genuinely reachable');
    expect(routeWaypoints(path.route)).toContainEqual(tile(5, 16));
    expect(path.route.segments.some(segment => segment.enteredViaDoorId !== undefined)).toBe(true);
    runtime.navigation.clearResult('independent-later-room');
    const physical = runtime.placedObjects.getSnapshot();
    const targets = new Set<string | undefined>();
    let showerTicks = 0;
    for (let ticks = 0; ticks < 9_000; ticks++) {
      runtime.kernel.step();
      if (runtime.prisoners.currentAction.phase[0] === 2 &&
          DEFAULT_ACTIONS[runtime.prisoners.currentAction.actionIndex[0]!]!.id === 'action.shower') {
        showerTicks++;
        targets.add(runtime.prisoners.coldState.getActionTarget(entityId));
      }
    }
    console.log(JSON.stringify({ blocked, load, entityId, showerTicks, targets: [...targets],
      hygiene: runtime.prisoners.needs.getScaled(0, 'hygiene'), metrics: runtime.prisoners.actionSystem.getMetrics() }));
    expect(showerTicks).toBeGreaterThan(0);
    expect([...targets]).toEqual([blocked ? 'room.shower-room:6:15' : 'room.shower-room:21:15']);
    expect(runtime.prisoners.needs.getScaled(0, 'hygiene')).toBeGreaterThan(40_000);
    expect(runtime.placedObjects.getSnapshot()).toEqual(physical);
    expect(runtime.prisoners.entityStore.getIdByIndex(0)).toBe(entityId);
  },
);
