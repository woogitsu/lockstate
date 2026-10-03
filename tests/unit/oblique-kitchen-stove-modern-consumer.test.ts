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

it.each([0,1] as const)('selects genuine saved modern Kitchen stove q%s over its whole unchanged paid footprint', turns => {
  const { plan, orders } = createRoomTemplateBuildPlan('kitchen-basic',{x:4,y:4},false,2,turns);
  expect([plan.width,plan.height]).toEqual([6,6]);
  expect(plan.zone).toEqual({roomId:'room.kitchen',x:5,y:5,width:4,height:4});
  expect(plan.objects.map(row=>row.buildableId)).toEqual(['stove-brick','prep-counter-brick','fridge-brick']);
  const order=orders.find(row=>row.definitionId==='stove-brick')!;
  expect(order.id).toBe('room-template-000000000002-2-object-000');
  expect([order.location.x,order.location.y,order.objectOrientation??0]).toEqual(turns===0?[5,5,0]:[8,5,1]);
  const world=new SparseWorld(16);const chunk={x:chunkCoordinate(0),y:chunkCoordinate(0)};
  world.load(chunk);world.setOwned(chunk,true);
  const room={instanceId:'room.kitchen:5:5',roomCatalogId:'room.kitchen',anchorTileX:5,anchorTileY:5,width:4,height:4};
  const input:RenderFrame={revision:1,world:WorldRenderView.fromSnapshot(world.snapshot()),rooms:[room],actors:[],roomConditions:[],
    structures:[{id:order.id,definitionId:order.definitionId,tileX:order.location.x,tileY:order.location.y,phase:'built',orientation:turns}]};
  const camera:ObliqueCameraState={target:{x:7*64,y:7*64},viewport:{width:1920,height:1080},zoom:2,
    yawRadians:(turns===0?60:-30)*Math.PI/180,elevationRadians:40*Math.PI/180};
  const before=JSON.stringify({structures:input.structures,rooms:input.rooms});
  const solid=projectObliqueWorldFrame(input,camera).raised.find((row):row is ObliqueSolid=>row.kind!=='actor'&&row.id===order.id);
  expect(solid?.assetId).toBe('furniture.kitchen.stove.variants');
  if(solid===undefined)throw new Error('Published Kitchen stove missing');
  expect(solid.orientation??0).toBe(turns);if(turns===1)expect(solid.authoredFootprintTiles).toEqual({width:2,height:1});
  expect(solid.footprint).toEqual(projectedRectPrism(order.location.x*64,order.location.y*64,
    turns===0?128:64,turns===0?64:128,1,camera).footprint);
  const registry=parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json',publicRoot),'utf8')));
  expect(registry.entries.filter(row=>row.assetId===solid.assetId)).toEqual([{assetId:'furniture.kitchen.stove.variants',manifest:'/game-content/oblique-furniture.kitchen-stove.v1.json'}]);
  const catalog=parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('game-content/oblique-furniture.kitchen-stove.v1.json',publicRoot),'utf8')));
  expect(catalog.source).toBe('assets/source/blender/furniture.kitchen.stove.soft-light.blend');
  expect(catalog.sourceSha256).toBe('7ac1027aca308b946acf902ebf611547621227535dc70b29db1c06d3db2d03bb');
  const selected=selectObliqueModuleFrame(catalog,{yawRadians:solid.assetYawRadians??camera.yawRadians,elevationRadians:camera.elevationRadians});
  expect(selected).toEqual({yawDegrees:60,elevationDegrees:40,image:'/assets/environment/oblique/furniture.kitchen.stove.variants-yaw+60-elev40.2c45a7fe1656.png',
    sha256:'2c45a7fe165699ebdf209ba6a092956d9e8097d3095bc5f09dd35b9344749d65'});
  expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1),publicRoot))).digest('hex')).toBe(selected.sha256);
  expect(JSON.stringify({structures:input.structures,rooms:input.rooms})).toBe(before);
});
