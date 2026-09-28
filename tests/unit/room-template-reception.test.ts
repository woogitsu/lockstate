import { expect, it } from 'vitest';
import { instantiateRoomTemplate, roomTemplateObjectSquares, type AuthoredRoomTemplateId } from '../../src/content/room-template-catalog';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

const templateId = 'reception-basic' as AuthoredRoomTemplateId;

it.each([false, true])('builds a ready Reception with desk, chairs and a doorway after save/load (mirror=%s)', (mirrorX) => {
  const origin = { x: 5, y: 5 };
  const plan = instantiateRoomTemplate(templateId, origin, { mirrorX });
  expect(plan).toMatchObject({ width: 6, height: 6,
    zone: { roomId: 'room.reception', x: 6, y: 6, width: 4, height: 4 } });
  expect(plan.doorSquares).toEqual([{ x: mirrorX ? 8 : 7, y: 10 }]);
  expect(plan.objects.map((object) => object.buildableId)).toEqual(['desk-wooden', 'chair-wooden', 'chair-wooden']);
  const furniture = new Set(roomTemplateObjectSquares(plan).map(({ x, y }) => `${x},${y}`));
  expect(furniture.size).toBe(4);
  expect(furniture.has(`${mirrorX ? 8 : 7},9`), 'the square inside the doorway must remain walkable').toBe(false);
  expect(plan.wallSquares.some(({ x, y }) => furniture.has(`${x},${y}`))).toBe(false);
  expect(projectRoomTemplateCost(templateId)).toEqual({ orderCount: 23, materials: [
    { itemId: 'item.brick', quantity: 38 },
    { itemId: 'item.wood-plank', quantity: 5 },
  ], catalogueCostMinorUnits: 1845 });
  const runtime = createNewSimulationRuntime(74);
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
  runtime.kernel.submitCommand('reception', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId, origin, mirrorX,
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  expect(runtime.roomTemplates.preflight(plan).ok).toBe(false);
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'test', prisonId: 'reception', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Reception save did not decode');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  for (let i = 0; i < 30_000; i += 1) {
    restored.kernel.step();
    if (restored.roomTemplates.snapshot().pending.length === 0 &&
        restored.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(restored.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
  expect(restored.placedObjects.getSnapshot()).toHaveLength(3);
  expect(restored.roomTemplates.preflight(plan)).toMatchObject({ ok: false, reason: 'structure-occupied' });
  expect(projectRoomDetail(restored.prisoners, 'room.reception:6:6', {
    placedObjects: restored.placedObjects,
    perimeter: { edges: restored.world, doors: restored.navigation.doors, regions: restored.navigation.getGraph() },
  })).toMatchObject({ access: 'doorway', requirementSummary: { missingCapability: 0 } });
}, 120_000);
