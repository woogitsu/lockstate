import { expect, it } from 'vitest';
import { instantiateRoomTemplate, type AuthoredRoomTemplateId } from '../../src/content/room-template-catalog';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

const templateId = 'yard-basic' as AuthoredRoomTemplateId;

it('designates the whole 8×8 Yard without buying or building a shell, including after save/load', () => {
  const origin = { x: 10, y: 10 };
  const plan = instantiateRoomTemplate(templateId, origin);
  expect(plan).toMatchObject({ width: 8, height: 8,
    zone: { roomId: 'room.yard', x: 10, y: 10, width: 8, height: 8 } });
  expect(plan.wallSquares).toEqual([]);
  expect(plan.doorSquares).toEqual([]);
  expect(plan.objects).toEqual([]);
  expect(createRoomTemplateBuildPlan(templateId, origin, false, 0)).toMatchObject({ orders: [], shellOrderIds: [] });
  expect(projectRoomTemplateCost(templateId)).toEqual({ orderCount: 0, materials: [], catalogueCostMinorUnits: 0 });

  const runtime = createNewSimulationRuntime(74);
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
  runtime.kernel.submitCommand('yard', 0, runtime.kernel.tick, packCommand({ type: 'PlaceRoomTemplate', templateId, origin }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.roomTemplates.preflight(plan).ok).toBe(false);

  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'test', prisonId: 'yard', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Yard save did not decode');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(restored.construction.allOrders()).toEqual([]);
  expect(projectRoomDetail(restored.prisoners, 'room.yard:10:10', {
    placedObjects: restored.placedObjects,
    perimeter: { edges: restored.world, doors: restored.navigation.doors, regions: restored.navigation.getGraph() },
  })).toMatchObject({ access: 'gap', requirementSummary: { missingCapability: 0 } });
  expect(restored.roomTemplates.preflight(plan)).toMatchObject({ ok: false, reason: 'structure-occupied' });
});
