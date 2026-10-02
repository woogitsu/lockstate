import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand } from '../../src/simulation/protocol/commands';
import type { RoomDetailViewModel, RoomListViewModel } from '../../src/simulation/presentation/room-projection';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

function saveAndLoad(runtime: ReturnType<typeof createNewSimulationRuntime>) {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'test', prisonId: 'delivery-bay-readiness', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Delivery Bay save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

// Existing whole-catalogue checks stop at zoning, enclosure and occupied anchors.
// The player's room readout must also receive real fixture counts and reachable
// doorway state from the worker producer after both pending and completed saves.
it.each([false, true])('restores a pending Delivery Bay and projects its completed requirements (mirror=%s)', (mirrorX) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('delivery-bay', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'delivery-bay-basic', origin: { x: 5, y: 5 }, mirrorX,
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toEqual([
    { templateId: 'delivery-bay-basic', origin: { x: 5, y: 5 }, mirrorX, sequence: 0 },
  ]);
  runtime = saveAndLoad(runtime);
  expect(runtime.roomTemplates.snapshot().pending).toEqual([
    { templateId: 'delivery-bay-basic', origin: { x: 5, y: 5 }, mirrorX, sequence: 0 },
  ]);
  for (let tick = 0; tick < 30_000; tick += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
  expect(runtime.construction.allOrders().length).toBeGreaterThan(0);
  expect(runtime.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
  runtime = saveAndLoad(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(1);
  expect(runtime.placedObjects.getSnapshot()[0]).toMatchObject({
    objectId: 'object.loading-dock-door', anchorTile: { x: mirrorX ? 7 : 6, y: 6 }, orientation: 0,
  });

  const list = PROJECTION_CATALOG['hud/room-list'].project(runtime, runtime.kernel.tick, {})
    .view as unknown as RoomListViewModel;
  const row = list.rooms.rows.find((candidate) => candidate.instanceId === 'room.delivery-bay:6:6');
  expect(row?.requirementSummary).toMatchObject({ objectRequirements: 1, satisfiedByCapability: 1, missingCapability: 0 });
  expect(row?.access).toBe('doorway');

  const detail = PROJECTION_CATALOG['hud/room-detail'].project(runtime, runtime.kernel.tick, {
    target: { kind: 'id', id: 'room.delivery-bay:6:6' },
  }).view as unknown as RoomDetailViewModel | undefined;
  expect(detail?.requirementSummary).toMatchObject({ objectRequirements: 1, satisfiedByCapability: 1, missingCapability: 0 });
  expect(detail?.requirements.find((requirement) => requirement.objectId === 'object.loading-dock-door')).toMatchObject({
    status: 'satisfied-by-capability', minQuantity: 1, satisfyingQuantity: 1,
  });
  // 'doorway' includes reachability; merely retaining a door would instead
  // report 'unreachable' if exterior navigation cannot reach this room.
  expect(detail?.access).toBe('doorway');
}, 120_000);
