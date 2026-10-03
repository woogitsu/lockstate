import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import { projectObliqueWorldFrame, type ObliqueSolid } from '../../src/rendering/camera/oblique-world-projection';
import { projectedRectPrism } from '../../src/rendering/camera/oblique-geometry';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
const publicRoot = new URL('../../public/', import.meta.url);

it.each([0,1] as const)('selects genuine modern toilet body in literal Basic Cell q%s over its whole paid occupied footprint', turns => {
  const { plan, orders } = createRoomTemplateBuildPlan('cell-basic',{x:4,y:4},false,2,turns);
  expect([plan.width,plan.height]).toEqual(turns===0?[4,7]:[7,4]);
  expect(plan.zone).toEqual({roomId:'room.cell',x:5,y:5,width:turns===0?2:5,height:turns===0?5:2});
  const order=orders.find(row=>row.definitionId==='toilet-brick')!;
  expect(order.id).toBe('room-template-000000000002-2-object-001');
  expect([order.location.x,order.location.y,order.objectOrientation??0]).toEqual(turns===0?[6,8,0]:[6,6,1]);
  expect(plan.objects.map(row=>row.buildableId)).toEqual(['bed-wooden','toilet-brick']);
  const world=new SparseWorld(16); const chunk={x:chunkCoordinate(0),y:chunkCoordinate(0)};
  world.load(chunk);world.setOwned(chunk,true);
  const room={instanceId:'room.cell:5:5',roomCatalogId:'room.cell',anchorTileX:5,anchorTileY:5,width:plan.zone.width,height:plan.zone.height};
  const input:RenderFrame={revision:1,world:WorldRenderView.fromSnapshot(world.snapshot()),rooms:[room],actors:[],roomConditions:[],
    structures:[{id:order.id,definitionId:order.definitionId,tileX:order.location.x,tileY:order.location.y,phase:'built',orientation:turns}]};
  const camera:ObliqueCameraState={target:{x:7*64,y:7*64},viewport:{width:1920,height:1080},zoom:2,
    yawRadians:(turns===0?45:-45)*Math.PI/180,elevationRadians:40*Math.PI/180};
  const before=JSON.stringify({structures:input.structures,rooms:input.rooms});
  const solid=projectObliqueWorldFrame(input,camera).raised.find((row):row is ObliqueSolid=>row.kind!=='actor'&&row.id===order.id);
  expect(solid?.assetId).toBe('fixture.cell.toilet_sink');
  if(solid===undefined)throw new Error('Published Basic Cell toilet missing');
  expect(solid.orientation??0).toBe(turns);if(turns===1)expect(solid.authoredFootprintTiles).toEqual({width:1,height:1});
  expect(solid.footprint).toEqual(projectedRectPrism(order.location.x*64,order.location.y*64,
    64,64,1,camera).footprint);
  const registry=parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json',publicRoot),'utf8')));
  expect(registry.entries.filter(row=>row.assetId===solid.assetId)).toEqual([{assetId:'fixture.cell.toilet_sink',manifest:'/game-content/oblique-cell-toilet.v1.json'}]);
  const catalog=parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('game-content/oblique-cell-toilet.v1.json',publicRoot),'utf8')));
  expect(catalog.source).toBe('assets/source/blender/fixture.cell.toilet_sink.soft-light.blend');
  expect(catalog.sourceSha256).toBe('1aa9169f65ea498fd1bfe6a2ee600f058c41f1a76685a0109a17da92db398ad5');
  const selected=selectObliqueModuleFrame(catalog,{yawRadians:solid.assetYawRadians??camera.yawRadians,elevationRadians:camera.elevationRadians});
  expect(selected).toEqual({yawDegrees:45,elevationDegrees:40,image:'/assets/environment/oblique/cell-toilet-yaw+45-elev40.12522e96db7e.png',
    sha256:'12522e96db7e5cd627928558800c25dda9a33f43643a999213443144a30df312'});
  expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1),publicRoot))).digest('hex')).toBe(selected.sha256);
  expect(JSON.stringify({structures:input.structures,rooms:input.rooms})).toBe(before);
});
