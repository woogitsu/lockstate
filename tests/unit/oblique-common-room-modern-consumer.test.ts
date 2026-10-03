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

it.each([0,1] as const)('selects genuine modern upholstered benches in literal Common Room q%s over both whole paid occupied footprints', turns => {
  const { plan, orders } = createRoomTemplateBuildPlan('common-room-basic',{x:4,y:4},false,2,turns);
  expect([plan.width,plan.height]).toEqual([7,7]);
  expect(plan.zone).toEqual({roomId:'room.common-room',x:5,y:5,width:5,height:5});
  const benches=orders.filter(row=>row.definitionId==='bench-wooden');
  expect(benches).toHaveLength(2);
  expect(plan.objects.map(row=>row.buildableId)).toEqual(['bench-wooden','bench-wooden']);
  const world=new SparseWorld(16);const chunk={x:chunkCoordinate(0),y:chunkCoordinate(0)};
  world.load(chunk);world.setOwned(chunk,true);
  const room={instanceId:'room.common-room:5:5',roomCatalogId:'room.common-room',anchorTileX:5,anchorTileY:5,width:5,height:5};
  const input:RenderFrame={revision:1,world:WorldRenderView.fromSnapshot(world.snapshot()),rooms:[room],actors:[],roomConditions:[],
    structures:benches.map(order=>({id:order.id,definitionId:order.definitionId,tileX:order.location.x,tileY:order.location.y,phase:'built',orientation:turns}))};
  const camera:ObliqueCameraState={target:{x:7*64,y:7*64},viewport:{width:1920,height:1080},zoom:2,
    yawRadians:(turns===0?60:-30)*Math.PI/180,elevationRadians:40*Math.PI/180};
  const before=JSON.stringify({structures:input.structures,rooms:input.rooms});
  for(const [index,order] of benches.entries()){
    expect(order.id).toBe(`room-template-000000000002-2-object-00${index}`);
    expect([order.location.x,order.location.y,order.objectOrientation??0]).toEqual(turns===0?(index===0?[5,5,0]:[7,7,0]):(index===0?[9,5,1]:[7,7,1]));
    const solid=projectObliqueWorldFrame(input,camera).raised.find((row):row is ObliqueSolid=>row.kind!=='actor'&&row.id===order.id);
    expect(solid?.assetId).toBe('furniture.common-room.upholstered-bench');
    if(solid===undefined)throw new Error('Published Common Room upholstered bench missing');
    expect(solid.orientation??0).toBe(turns);if(turns===1)expect(solid.authoredFootprintTiles).toEqual({width:2,height:1});
    expect(solid.footprint).toEqual(projectedRectPrism(order.location.x*64,order.location.y*64,
      turns===0?128:64,turns===0?64:128,1,camera).footprint);
    const registry=parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json',publicRoot),'utf8')));
    expect(registry.entries.filter(row=>row.assetId===solid.assetId)).toEqual([{assetId:'furniture.common-room.upholstered-bench',manifest:'/game-content/oblique-furniture.common-room-bench.v1.json'}]);
    const catalog=parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('game-content/oblique-furniture.common-room-bench.v1.json',publicRoot),'utf8')));
    expect(catalog.source).toBe('assets/source/blender/furniture.common-room.upholstered-bench.soft-light.blend');
    expect(catalog.sourceSha256).toBe('70be43170198172589904862ed627e0c3360be9da4788fb93098feb7b4ecb4c7');
    const selected=selectObliqueModuleFrame(catalog,{yawRadians:solid.assetYawRadians??camera.yawRadians,elevationRadians:camera.elevationRadians});
    expect(selected).toEqual({yawDegrees:60,elevationDegrees:40,image:'/assets/environment/oblique/furniture.common-room.upholstered-bench-yaw+60-elev40.a75487c09dc1.png',
      sha256:'a75487c09dc18f99526dc77265c93764fad2927b2a2beb762057ad36f99e1ab0'});
    expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1),publicRoot))).digest('hex')).toBe(selected.sha256);
  }
  expect(JSON.stringify({structures:input.structures,rooms:input.rooms})).toBe(before);
});
