import { expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { ROOM_TEMPLATE_IDS, type RoomTemplateId } from '../../../src/content/room-template-catalog';
import { defaultRoomContentRegistry } from '../../../src/content/room-catalog';
import { createNewSimulationRuntime } from '../../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../../src/simulation/runtime/restore-session';
import { packCommand } from '../../../src/simulation/protocol/commands';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../../src/persistence/save-schema';
import { roomPerimeterEnclosure } from '../../../src/simulation/rooms/enclosure';

// Independent literal authoring census, read from the public catalogue source.
// Neither expected dimensions, counts nor room ids are provided by a production
// plan/geometry factory. This is a reproducible audit, outside the CI test glob.
const census = [
  ['cell-basic',4,7,18,2,'room.cell',1], ['cell-large',6,7,22,3,'room.cell',1],
  ['shower-room',5,5,16,2,'room.shower-room',1], ['cell-row-four',7,16,58,8,'room.cell',4],
  ['canteen-basic',8,8,28,6,'room.canteen',1], ['kitchen-basic',6,6,20,3,'room.kitchen',1],
  ['holding-cell-basic',6,6,20,2,'room.holding-cell',1], ['solitary-cell-basic',4,6,16,2,'room.solitary-cell',1],
  ['reception-basic',6,6,20,3,'room.reception',1], ['laundry-basic',6,6,20,2,'room.laundry',1],
  ['yard-basic',8,8,0,0,'room.yard',1], ['common-room-basic',7,7,24,2,'room.common-room',1],
  ['classroom-basic',7,7,24,5,'room.classroom',1], ['infirmary-basic',6,6,20,2,'room.infirmary',1],
  ['security-office-basic',5,5,16,1,'room.security-office',1], ['staff-room-basic',6,6,20,3,'room.staff-room',1],
  ['storage-room-basic',5,5,16,2,'room.storage-room',1], ['delivery-bay-basic',6,6,20,1,'room.delivery-bay',1],
  ['garbage-room-basic',4,4,12,2,'room.garbage-room',1], ['utility-room-basic',4,4,12,1,'room.utility-room',1],
] as const satisfies readonly (readonly [RoomTemplateId,number,number,number,number,string,number])[];

it('independent public20-plan census covers every released room type', () => {
  expect(ROOM_TEMPLATE_IDS).toEqual(census.map(row=>row[0]));
  expect([...new Set(census.map(row=>row[5]))].sort()).toEqual(defaultRoomContentRegistry.all().map(room=>room.id).sort());
});

for (const [templateId,width,height,shellCount,objectCount,roomId,roomCount] of census) for (const mirrorX of [false,true]) {
  it(`${templateId}: clockwise90 mirrored=${mirrorX} actually completes, validates minimum and V8-reloads`, () => {
    const runtime=createNewSimulationRuntime(73), origin={x:5,y:5};
    runtime.kernel.submitCommand('catalogue-audit',0,runtime.kernel.tick,packCommand({ type:'PlaceRoomTemplate',templateId,origin,mirrorX,quarterTurns:1 }));
    runtime.kernel.step();
    if (shellCount!==0) {
      expect(runtime.roomTemplates.snapshot().pending).toEqual([{templateId,origin,mirrorX,quarterTurns:1,sequence:0}]);
      expect(runtime.construction.allOrders()).toHaveLength(shellCount);
    }
    let elapsed=1;
    for (;elapsed<25_000;elapsed++) {
      const state=runtime.roomTemplates.snapshot();
      if (state.pending.length===0 && runtime.construction.allOrders().length===shellCount+objectCount
        && runtime.construction.allOrders().every(order=>order.state==='completed')) break;
      runtime.kernel.step();
    }
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
    expect(runtime.roomTemplates.snapshot().completed).toEqual([{templateId,origin,mirrorX,quarterTurns:1,sequence:0}]);
    expect(runtime.construction.allOrders()).toHaveLength(shellCount+objectCount);
    expect(runtime.construction.allOrders().every(order=>order.state==='completed')).toBe(true);
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(objectCount);
    for (const object of runtime.placedObjects.getSnapshot()) {
      expect(object.orientation).toBe(1);
      expect(object.anchorTile.x).toBeGreaterThanOrEqual(origin.x);
      expect(object.anchorTile.x).toBeLessThan(origin.x+height);
      expect(object.anchorTile.y).toBeGreaterThanOrEqual(origin.y);
      expect(object.anchorTile.y).toBeLessThan(origin.y+width);
      expect(runtime.construction.getOrder(object.sourceOrderId!)).toMatchObject({state:'completed',objectOrientation:1,location:object.anchorTile});
    }
    const bundle=captureSessionSnapshot(runtime);
    const rooms=bundle.simulation!.prisoners.roomInstanceDefinitions;
    expect(rooms).toHaveLength(roomCount);
    for (const room of rooms) {
      expect(room.roomCatalogId).toBe(roomId);
      const w=room.width!,h=room.height!;
      if(roomCount===1) expect([w,h]).toEqual(roomId==='room.yard'?[8,8]:[height-2,width-2]);
      else expect([w,h]).toEqual([5,2]);
      const minimum=defaultRoomContentRegistry.getById(roomId)!.requirements.find(requirement=>requirement.type==='minimum-size');
      expect(minimum?.type).toBe('minimum-size');
      if(minimum?.type==='minimum-size') {
        expect((w>=minimum.minWidth&&h>=minimum.minHeight)||(w>=minimum.minHeight&&h>=minimum.minWidth)).toBe(true);
        expect(w*h).toBeGreaterThanOrEqual(minimum.minTiles);
      }
      expect(roomPerimeterEnclosure(runtime.world,{x:room.anchorTile.x,y:room.anchorTile.y,width:w,height:h}).enclosure).toBe(roomId==='room.yard'?'open':'sealed');
    }
    const envelope=createSaveEnvelope({gameVersion:'lockstate-0.0.0',prisonId:'catalogue-audit',revision:1,
      createdAt:1_700_000_000_000,updatedAt:1_700_000_000_001,...bundle});
    expect(envelope.schemaVersion).toBe(8);
    const decoded=decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ok:true,migrated:false});
    if(!decoded.ok) throw Error('Actual scheduled catalogue save did not decode');
    const restored=restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
    expect(restored.world.snapshot()).toEqual(runtime.world.snapshot());
    expect(restored.placedObjects.getSnapshot()).toEqual(runtime.placedObjects.getSnapshot());
    expect(restored.construction.snapshot()).toEqual(runtime.construction.snapshot());
    expect(restored.roomTemplates.snapshot()).toEqual(runtime.roomTemplates.snapshot());
    expect(captureSessionSnapshot(restored).simulation?.prisoners.roomInstanceDefinitions).toEqual(rooms);
    if(process.env['LOCKSTATE_CATALOGUE_AUDIT_RECEIPT']!==undefined) appendFileSync(process.env['LOCKSTATE_CATALOGUE_AUDIT_RECEIPT'],JSON.stringify({templateId,mirrorX,quarterTurns:1,
      expectedDimensions:[height,width],shellCount,objectCount,elapsed,rooms,completed:runtime.roomTemplates.snapshot().completed,
      objects:runtime.placedObjects.getSnapshot(),orderCount:runtime.construction.allOrders().length,saveSchemaVersion:envelope.schemaVersion,
      restoreWorldObjectsOrdersOwnersAndRoomsEqual:true})+'\n');
  });
}
