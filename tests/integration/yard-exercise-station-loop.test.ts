import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { placementCostMinorUnits } from '../../src/simulation/economy/placement-cost';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

it('builds a real two-square exercise station, refuses overlap and restores its occupied footprint', () => {
  const definition = getBuildableDefinition('exercise-station');
  const object = defaultObjectRegistry.getById('object.exercise-station')!;
  expect(object.footprint).toEqual({ width: 2, height: 1 });
  expect(definition.workRequired).toBe(30 * object.footprint.width);
  expect(definition.materialsRequired).toEqual([{ itemId: 'item.brick', quantity: object.footprint.width }]);
  expect(placementCostMinorUnits(definition.materialsRequired)).toBe(80);
  const assetId = obliqueAssetIdForObject(object.id);
  expect(assetId).toBe('furniture.yard.exercise-station');
  const registry = parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('../../public/game-content/oblique-module-registry.v1.json', import.meta.url), 'utf8')));
  expect(registry.entries.find(entry => entry.assetId === assetId)?.manifest).toBe('/game-content/oblique-furniture.yard-exercise-station.v1.json');
  const runtime = createNewSimulationRuntime(73);
  const submit = (id: string, command: Parameters<typeof packCommand>[0]) => {
    runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
    runtime.kernel.step();
  };
  submit('buy', { type: 'PurchaseMaterials', orderId: 'buy', itemId: 'item.brick', quantity: 2 });
  submit('zone-yard', { type: 'ZoneRoom', roomId: 'room.yard', x: 8, y: 8, width: 8, height: 8 });
  submit('place', { type: 'PlaceObject', orderId: 'station', definitionId: 'exercise-station', x: 8, y: 8 });
  while(runtime.kernel.tick < 250) runtime.kernel.step();
  expect(runtime.construction.getOrder('station')?.state).toBe('completed');
  const first = runtime.placedObjects.objectAt({ x: tileCoordinate(8), y: tileCoordinate(8) });
  expect(first?.objectId).toBe(object.id);
  expect(runtime.placedObjects.objectAt({ x: tileCoordinate(9), y: tileCoordinate(8) })?.placedObjectId).toBe(first?.placedObjectId);
  expect(runtime.placedObjects.objectAt({ x: tileCoordinate(10), y: tileCoordinate(8) })).toBeUndefined();
  const refusalCount = runtime.refusals.count;
  submit('overlap', { type: 'PlaceObject', orderId: 'overlap', definitionId: 'exercise-station', x: 9, y: 8 });
  expect(runtime.refusals.count).toBeGreaterThan(refusalCount);
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({ gameVersion: 'lockstate-0.0.0', prisonId: 'yard-station', revision: 1, createdAt: 1700000000000, updatedAt: 1700000000001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.masterSeed === undefined ? {} : {masterSeed: bundle.masterSeed}),
    ...(bundle.entities === undefined ? {} : {entities: bundle.entities}),
    ...(bundle.simulation === undefined ? {} : {simulation: bundle.simulation}),
    ...(bundle.identity === undefined ? {} : {identity: bundle.identity}),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if(!decoded.ok) throw new Error('Save must decode');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, 73).runtime;
  expect(restored.placedObjects.getSnapshot()).toEqual(runtime.placedObjects.getSnapshot());
  expect(restored.placedObjects.objectAt({x: tileCoordinate(9), y: tileCoordinate(8)})?.objectId).toBe(object.id);
});
