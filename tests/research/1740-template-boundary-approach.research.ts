import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const chunks = [{ x: chunkCoordinate(0), y: chunkCoordinate(0) }, { x: chunkCoordinate(0), y: chunkCoordinate(1) }];

function until(runtime: Runtime, predicate: () => boolean) {
  for (let count = 0; count < 30_000 && !predicate(); count++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

function reload(runtime: Runtime) {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'research', prisonId: 'template-boundary-approach', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Boundary approach research save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

const scenarios = [
  { name: 'owned inward control', y: 24, exterior: 'absent' },
  { name: 'default unloaded frontier', y: 25, exterior: 'absent' },
  { name: 'explicit loaded unowned counterexample', y: 25, exterior: 'unowned' },
  { name: 'explicit loaded owned control', y: 25, exterior: 'owned' },
];

// An instrument, not a policy gate: assert the real fixture and print actual
// route/projection answers. Do not pin the known frontier mismatch as correct.
it('measures ownership and loaded-area effects before and after actual encoded SaveLoad', () => {
  const lines = ['scenario | stage | approach owned | role | preflight | route | room access'];
  for (const scenario of scenarios) {
    const world = new SparseWorld(32);
    world.load(chunks[0]!); world.setOwned(chunks[0]!, true);
    if (scenario.exterior !== 'absent') world.load(chunks[1]!);
    if (scenario.exterior === 'owned') world.setOwned(chunks[1]!, true);
    let runtime = createNewSimulationRuntime(73, { world,
      ...(scenario.exterior === 'absent' ? {} : { loadedChunks: chunks }) });
    const target = { kind: 'room-template' as const, templateId: 'cell-basic' as const, origin: { x: 10, y: scenario.y } };
    const verdict = PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, 0, { target }).view;
    runtime.kernel.submitCommand('boundary', 0, 0, packCommand({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: target.origin }));
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
      runtime.construction.allOrders().length === 20 && runtime.construction.allOrders().every(order => order.state === 'completed'));
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
    expect(runtime.prisoners.roomInstances.getById(`room.cell:11:${scenario.y + 1}`)).toBeDefined();
    for (const stage of ['completed', 'encoded reload']) {
      if (stage === 'encoded reload') runtime = reload(runtime);
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
      for (const context of [{ role: 'prisoner', securityClearance: 0 }, { role: 'guard', securityClearance: 5 }]) {
        const id = `boundary-${stage}-${context.role}`;
        runtime.navigation.requestRoute(id, tile(16, 16), tile(12, scenario.y + 3), context, 0, runtime.kernel.tick);
        until(runtime, () => runtime.navigation.getResult(id) !== undefined);
        const result = runtime.navigation.getResult(id)!.result;
        const detail = PROJECTION_CATALOG['hud/room-detail'].project(runtime, runtime.kernel.tick,
          { target: { kind: 'id', id: `room.cell:11:${scenario.y + 1}` } }).view as { access?: string };
        lines.push([scenario.name, stage, runtime.world.isTileOwned(tile(11, scenario.y + 7)), context.role,
          JSON.stringify(verdict), result.ok ? 'reachable' : JSON.stringify(result.failure), detail?.access].join(' | '));
        runtime.navigation.clearResult(id);
      }
    }
  }
  console.log(lines.join('\n'));
});
