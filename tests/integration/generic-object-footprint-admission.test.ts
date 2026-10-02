import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`object-build-collision-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'object-build-collision', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Object collision save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function finish(runtime: Runtime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed' || order.state === 'cancelled' || order.state === 'failed'));
}
it.each((['unloaded', 'loaded unowned'] as const).flatMap(stage => (['PlaceObject', 'PlaceBuildOrder'] as const).map(type => ({ stage, type }))))
 ('saved $stage far square must refuse an incoming generic object: $type', ({ stage, type }) => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 24, y: 24, width: 8, height: 8 });
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.yard')).toHaveLength(1);
  const farChunk = { x: chunkCoordinate(1), y: chunkCoordinate(0) };
  if (stage === 'loaded unowned') runtime.world.load(farChunk);
  runtime = reload(runtime);
  const anchor = { x: tileCoordinate(31), y: tileCoordinate(31) };
  const far = { x: tileCoordinate(32), y: tileCoordinate(31) };
  expect(runtime.world.isTileOwned(anchor)).toBe(true);
  expect(runtime.world.isTileOwned(far)).toBe(false);
  expect(runtime.world.getChunk(farChunk) === undefined).toBe(stage === 'unloaded');
  expect(runtime.roomTemplates.preflight(createRoomTemplateBuildPlan('utility-room-basic', { x: 31, y: 10 }, false, 0).plan)).toMatchObject({ ok: false, reason: 'unowned-land' });
  const balance = runtime.treasury.balanceMinorUnits;
  const world = runtime.world.snapshot();
  const history = runtime.construction.snapshot();
  send(runtime, { type, orderId: 'frontier-desk', definitionId: 'desk-wooden', x: 31, y: 31 });
  expect(runtime.construction.getOrder('frontier-desk')?.state).not.toBe('approved');
  expect(runtime.treasury.balanceMinorUnits).toBe(balance);
  expect(runtime.world.snapshot()).toEqual(world);
  expect(runtime.construction.snapshot().undoStack).toEqual(history.undoStack);
  expect(runtime.construction.snapshot().currentTransaction).toEqual(history.currentTransaction);
 });
it.each((['rock', 'water'] as const).flatMap(terrain => (['PlaceObject', 'PlaceBuildOrder'] as const).map(type => ({ terrain, type }))))
 ('saved owned $terrain far square retains deliberate terrain permission: $type', ({ terrain, type }) => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 2, y: 2, width: 8, height: 8 });
  runtime.world.setTerrain({ x: tileCoordinate(6), y: tileCoordinate(5) }, terrain);
  runtime = reload(runtime);
  send(runtime, { type, orderId: 'terrain-desk', definitionId: 'desk-wooden', x: 5, y: 5 });
  expect(runtime.construction.getOrder('terrain-desk')?.state).toBe('approved');
  finish(runtime);
  expect(runtime.placedObjects.isTileOccupied({ x: tileCoordinate(6), y: tileCoordinate(5) })).toBe(true);
 });
