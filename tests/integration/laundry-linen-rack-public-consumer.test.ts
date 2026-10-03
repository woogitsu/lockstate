import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import type { RenderStructure } from '../../src/rendering/world/structures';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

it.each([0, 1] as const)('buys a separate orientation0 rack inside actual public Laundry q%s, retains both washers and whole V9', turns => {
  const runtime = createNewSimulationRuntime(73);
  const submit = (command: Parameters<typeof packCommand>[0]): void => {
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`laundry-linen-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  };
  const finish = (): number => {
    const complete = () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed');
    let ticks = 0;
    for (; ticks < 15000 && !complete(); ticks++) runtime.kernel.step();
    expect(complete()).toBe(true); return ticks;
  };
  const stages = [];
  for (const [templateId, x] of [['storage-room-basic', 5], ['delivery-bay-basic', 12], ['laundry-basic', 20]] as const) {
    const quote = projectRoomTemplateCost(templateId), before = runtime.treasury.balanceMinorUnits;
    if (quote.catalogueCostMinorUnits === undefined) throw new Error('Existing public plan has no literal procurement quote');
    submit({ type: 'PlaceRoomTemplate', templateId, origin: { x, y: 5 }, ...(templateId === 'laundry-basic' && turns === 1 ? { quarterTurns: turns } : {}) });
    const ticks = finish();
    expect(runtime.treasury.balanceMinorUnits).toBe(before - quote.catalogueCostMinorUnits);
    stages.push({ templateId, ticks, cost: quote.catalogueCostMinorUnits, balance: runtime.treasury.balanceMinorUnits });
  }
  const beforeRack = captureSessionSnapshot(runtime);
  expect(stages.map(stage => [stage.cost, stage.balance, stage.ticks])).toEqual([[1395, 23605, 1251], [1780, 21825, 1520], [1745, 20080, 1560]]);
  const beforeObjects = beforeRack.simulation?.objects;
  if (beforeObjects === undefined) throw new Error('Actual complete Laundry object snapshot missing');
  const washers = beforeObjects.placedObjects.filter(object => object.objectId === 'object.washing-machine');
  expect(washers.map(object => [object.anchorTile.x, object.anchorTile.y, object.orientation])).toEqual(turns === 0 ? [[21, 6, 0], [23, 6, 0]] : [[24, 6, 1], [24, 8, 1]]);
  expect(washers.map(object => object.sourceOrderId)).toEqual(['room-template-000000000002-2-object-000', 'room-template-000000000002-2-object-001']);
  // Independent free 1x1 squares; current public individual purchase is orientation0.
  const slot = turns === 0 ? { x: 21, y: 8 } : { x: 22, y: 6 };
  const balance = runtime.treasury.balanceMinorUnits;
  submit({ type: 'PurchaseMaterials', orderId: 'laundry-linen-rack-materials', itemId: 'item.wood-plank', quantity: 1 });
  expect(runtime.treasury.balanceMinorUnits).toBe(balance - 65);
  submit({ type: 'PlaceObject', orderId: 'laundry-individual-linen-rack', definitionId: 'storage-rack-wooden', ...slot });
  const ticks = finish();
  expect(ticks).toBe(150); expect(runtime.treasury.balanceMinorUnits).toBe(20015);
  const whole = captureSessionSnapshot(runtime);
  const objects = whole.simulation?.objects;
  if (objects === undefined) throw new Error('Actual paid-rack object snapshot missing');
  expect(objects.placedObjects.filter(object => object.objectId === 'object.washing-machine')).toEqual(washers);
  const rack = objects.placedObjects.find(object => object.sourceOrderId === 'laundry-individual-linen-rack');
  expect(rack).toEqual({ placedObjectId: `object:${slot.x}:${slot.y}`, objectId: 'object.storage-rack', anchorTile: slot, orientation: 0, sourceOrderId: 'laundry-individual-linen-rack' });
  const order = whole.construction.orders.find(order => order.id === rack!.sourceOrderId)!;
  expect(order).toMatchObject({ definitionId: 'storage-rack-wooden', state: 'completed', location: slot, materialsAllocated: [{ itemId: 'item.wood-plank', quantity: 1 }] });
  const actualRooms = runtime.prisoners.roomInstances.allByRoomCatalogId('room.laundry');
  expect(actualRooms).toHaveLength(1);
  const actualRoom = actualRooms[0]!;
  expect(actualRoom).toMatchObject({ instanceId: 'room.laundry:21:6', roomCatalogId: 'room.laundry', anchorTile: { x: 21, y: 6 }, width: 4, height: 4 });
  const room: RenderRoom = { instanceId: actualRoom.instanceId, roomCatalogId: actualRoom.roomCatalogId,
    anchorTileX: actualRoom.anchorTile.x, anchorTileY: actualRoom.anchorTile.y, width: actualRoom.width!, height: actualRoom.height! };
  const structure: RenderStructure = { id: order.id, definitionId: order.definitionId, tileX: slot.x, tileY: slot.y, orientation: rack!.orientation, phase: 'built' };
  const frame: RenderFrame = { revision: 1, world: WorldRenderView.fromSnapshot(runtime.world.snapshot()), structures: [structure], rooms: [room], actors: [], roomConditions: [] };
  const camera = { target: { x: 23 * 64, y: 8 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 2, yawRadians: Math.PI / 3, elevationRadians: 40 * Math.PI / 180 };
  const solid = projectObliqueWorldFrame(frame, camera).raised.find(solid => solid.id === order.id);
  expect(solid?.assetId).toBe('furniture.laundry.linen-rack');
  for (const phase of ['planned', 'building'] as const) {
    const pendingFrame = { ...frame, structures: [{ ...structure, phase }] };
    expect(projectObliqueWorldFrame(pendingFrame, camera).raised.find(solid => solid.id === order.id)?.assetId).toBe('furniture.storage.rack.wooden');
  }
  const publicRoot = new URL('../../public/', import.meta.url);
  const registry = parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json', publicRoot), 'utf8')));
  const entries = registry.entries.filter(entry => entry.assetId === solid!.assetId);
  expect(entries).toEqual([{ assetId: 'furniture.laundry.linen-rack', manifest: '/game-content/oblique-furniture-laundry-linen-rack.v1.json' }]);
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(entries[0]!.manifest.slice(1), publicRoot), 'utf8')));
  expect(catalog.sourceSha256).toBe('779d11f79c28b8049ccd3371d840c75b52cd153439f3882e28c593d05dd964ec');
  const selected = selectObliqueModuleFrame(catalog, { yawRadians: solid!.assetYawRadians ?? camera.yawRadians, elevationRadians: camera.elevationRadians });
  expect(selected).toEqual({ yawDegrees: 60, elevationDegrees: 40, image: '/assets/environment/oblique/furniture.laundry.linen-rack-yaw+60-elev40.e2f44421aff0.png', sha256: 'e2f44421aff04ef5dbe7ea36f9c1102bffaa10b88ab498ad02e7a6b74b78dda1' });
  expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1), publicRoot))).digest('hex')).toBe(selected.sha256);
  const envelope = createSaveEnvelope({ gameVersion: 'laundry-linen-source-proof', prisonId: `laundry-q${turns}`, revision: 1, createdAt: 0, updatedAt: 1, ...whole });
  expect(envelope.saveSchemaVersion).toBe(9);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope))); expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual separately purchased Laundry linen rack V9 refused');
  const restored = captureSessionSnapshot(restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime);
  expect(restored).toEqual(whole);
  mkdirSync('assets/intermediate/laundry-linen-rack-public-proof', { recursive: true });
  writeFileSync(`assets/intermediate/laundry-linen-rack-public-proof/q${turns}.json`, JSON.stringify({ stages, slot, ordinaryObjectOrientation: 0, paidRackMaterialsMinorUnits: 65, ticks, washers, wholeBefore: whole, wholeAfter: restored, wholeV9Exact: true, nativeRun: false }, null, 2));
});
