import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { routeWaypoints } from '../../src/simulation/navigation/route';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const orientations = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`completed-furniture-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function reload(runtime: Runtime, legacy = false): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const simulation = legacy ? { ...bundle.simulation!, roomTemplates: { version: 1 as const, pending: [] } } : bundle.simulation;
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'completed-furniture-access', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(simulation === undefined ? {} : { simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Completed furniture access save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function until(runtime: Runtime, predicate: () => boolean) {
  for (let count = 0; count < 30_000 && !predicate(); count++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

function point(orientation: typeof orientations[number], x: number, y: number) {
  // Independent authored 7x16 row reference; mirror before clockwise rotation.
  const mx = orientation.mirrorX ? 6 - x : x;
  return [tile(10 + mx, 10 + y), tile(25 - y, 10 + mx), tile(16 - mx, 25 - y), tile(10 + y, 16 - mx)][orientation.quarterTurns]!;
}

function ready(orientation: typeof orientations[number], stage: string): Runtime {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 },
    mirrorX: orientation.mirrorX, quarterTurns: orientation.quarterTurns });
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  if (stage === 'saved partial continuation') {
    until(runtime, () => runtime.construction.allOrders().some(order => order.state === 'completed'));
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
    runtime = reload(runtime);
  }
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed'));
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(8);
  // Real PlaceObject requires its anchor in a room. Close both ends of the
  // existing 7x2 shared corridor with ordinary perpendicular edges, then
  // designate a legal Holding Cell. No geometry or completion is injected.
  for (const [index, [x, y]] of [[0, 7], [0, 8], [7, 7], [7, 8]].entries()) {
    const a = point(orientation, x! - 1, y!);
    const b = point(orientation, x!, y!);
    send(runtime, { type: 'PlaceBuildOrder', definitionId: 'wall-brick', orderId: `corridor-end-${index}`,
      x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), edge: a.x === b.x ? 'north' : 'west' });
  }
  // Each authored door edge is on the Cell side of its perimeter square.
  // Add a passable door on the corridor boundary as well so that this new
  // room satisfies the existing exact-boundary enclosure rule.
  for (const [index, [x, y]] of [[1, 7], [4, 7], [1, 9], [4, 9]].entries()) {
    const a = point(orientation, x!, y! - 1);
    const b = point(orientation, x!, y!);
    send(runtime, { type: 'PlaceBuildOrder', definitionId: 'door-wooden', orderId: `corridor-door-${index}`,
      x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), edge: a.x === b.x ? 'north' : 'west' });
  }
  until(runtime, () => runtime.construction.allOrders().every(order => order.state === 'completed'));
  const odd = orientation.quarterTurns % 2 !== 0;
  send(runtime, { type: 'ZoneRoom', roomId: 'room.holding-cell', x: odd ? 17 : 10, y: odd ? 10 : 17,
    width: odd ? 2 : 7, height: odd ? 7 : 2 });
  expect(runtime.world.getZoning(point(orientation, 1, 8)), JSON.stringify(runtime.roomZoning.recentRefusals())).not.toBe(0);
  return reload(runtime, stage === 'legacy completed save');
}

function access(runtime: Runtime, orientation: typeof orientations[number], phase: string) {
  for (const context of [{ role: 'prisoner', securityClearance: 0 }, { role: 'guard', securityClearance: 5 }]) {
    const id = `${phase}-${context.role}-${runtime.kernel.tick}`;
    runtime.navigation.requestRoute(id, point(orientation, 3, 8), point(orientation, 2, 12), context, 0, runtime.kernel.tick);
    until(runtime, () => runtime.navigation.getResult(id) !== undefined);
    const result = runtime.navigation.getResult(id)!.result;
    expect(result, `${phase}: ${context.role} route ${JSON.stringify(result)}`).toMatchObject({ ok: true });
    if (!result.ok) throw new Error('Completed lower Cell became inaccessible');
    expect(routeWaypoints(result.route)).toContainEqual(point(orientation, 1, 8));
    expect(result.route.segments.some(segment => segment.enteredViaDoorId !== undefined)).toBe(true);
    runtime.navigation.clearResult(id);
  }
}

const cases = orientations.flatMap(orientation =>
  ['saved completed', 'saved partial continuation', 'legacy completed save'].map(stage => ({ ...orientation, stage })));

it.each(cases)('preserves $stage Cell against a furniture second tile, mirror=$mirrorX turn=$quarterTurns', testCase => {
  let runtime = ready(testCase, testCase.stage);
  access(runtime, testCase, 'before object');
  const approach = point(testCase, 1, 8);
  // Ordinary PlaceObject has no orientation field. Use the two actually
  // offered footprints so the second tile lies along the shared corridor.
  const odd = testCase.quarterTurns % 2 !== 0;
  const definitionId = odd ? 'bed-wooden' : 'desk-wooden';
  const anchor = tile(approach.x - (odd ? 0 : 1), approach.y - (odd ? 1 : 0));
  const before = captureSessionSnapshot(runtime);
  const funds = runtime.treasury.snapshot();
  send(runtime, { type: 'PlaceObject', definitionId, orderId: 'later-footprint', ...anchor });
  const accepted = runtime.construction.getOrder('later-footprint');
  if (accepted !== undefined) {
    until(runtime, () => accepted.state === 'completed');
    expect(runtime.placedObjects.isTileOccupied(approach)).toBe(true);
    access(runtime, testCase, 'after accepted furniture');
  }
  expect(accepted).toBeUndefined();
  expect(runtime.objectPlacement.recentRefusals().at(-1)).toMatchObject({
    reason: 'tile-occupied', tile: approach, request: { orderId: 'later-footprint' },
  });
  const { kernel: _beforeKernel, ...beforeState } = before;
  const { kernel: _afterKernel, ...afterState } = captureSessionSnapshot(runtime);
  expect(afterState).toEqual(beforeState);
  expect(runtime.treasury.snapshot()).toEqual(funds);
  access(runtime, testCase, 'after refused furniture');
  runtime = reload(runtime, testCase.stage === 'legacy completed save');
  access(runtime, testCase, 'saved refusal');
});

it.each(orientations.filter(orientation => orientation.quarterTurns === 1))('checks the second tile of the authoritative 90-degree fixture path, mirror=$mirrorX', orientation => {
  const runtime = ready(orientation, 'saved partial continuation');
  access(runtime, orientation, 'before oriented fixture');
  const approach = point(orientation, 1, 8);
  const before = captureSessionSnapshot(runtime);
  // This is the live service called by authored fixture production. It has
  // orientation, unlike the unchanged standalone PlaceObject wire schema.
  const outcome = runtime.objectPlacement.place({ definitionId: 'desk-wooden', orderId: 'turned-fixture',
    x: approach.x, y: approach.y - 1, objectOrientation: 1 }, runtime.kernel.tick, runtime.kernel.expectedSequence);
  const accepted = runtime.construction.getOrder('turned-fixture');
  if (accepted !== undefined) {
    until(runtime, () => accepted.state === 'completed');
    expect(runtime.placedObjects.isTileOccupied(approach)).toBe(true);
    access(runtime, orientation, 'after accepted oriented fixture');
  }
  expect(outcome).toMatchObject({ kind: 'refused', reason: 'tile-occupied', tile: approach });
  expect(captureSessionSnapshot(runtime)).toEqual(before);
  access(reload(runtime), orientation, 'saved oriented refusal');
});

it.each(orientations)('allows completed neighbouring furniture without losing access, mirror=$mirrorX turn=$quarterTurns', orientation => {
  const runtime = ready(orientation, 'saved partial continuation');
  const a = point(orientation, 2, 7);
  const b = point(orientation, 3, 7);
  const odd = orientation.quarterTurns % 2 !== 0;
  send(runtime, { type: 'PlaceObject', definitionId: odd ? 'bed-wooden' : 'desk-wooden', orderId: 'legal-neighbour',
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) });
  until(runtime, () => runtime.construction.getOrder('legal-neighbour')?.state === 'completed');
  access(runtime, orientation, 'after legal neighbour');
  access(reload(runtime), orientation, 'saved legal neighbour');
});
