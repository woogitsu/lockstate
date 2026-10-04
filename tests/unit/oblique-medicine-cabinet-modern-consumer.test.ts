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

it.each([0,1] as const)('selects genuine saved modern Infirmary cabinet q%s over its whole unchanged full footprint', turns => {
  const { plan, orders } = createRoomTemplateBuildPlan('infirmary-basic',{x:4,y:4},false,2,turns);
  expect([plan.width,plan.height]).toEqual([6,6]);
  expect(plan.zone).toEqual({roomId:'room.infirmary',x:5,y:5,width:4,height:4});
  expect(plan.objects.map(row=>row.buildableId)).toEqual(['medical-bed-wooden','medicine-cabinet-wooden']);
  const order=orders.find(row=>row.definitionId==='medicine-cabinet-wooden')!;
  expect(order.id).toBe('room-template-000000000002-2-object-001');
  expect([order.location.x,order.location.y,order.objectOrientation??0]).toEqual(turns===0?[7,5,0]:[8,7,1]);
  const world=new SparseWorld(16);const chunk={x:chunkCoordinate(0),y:chunkCoordinate(0)};
  world.load(chunk);world.setOwned(chunk,true);
  const room={instanceId:'room.infirmary:5:5',roomCatalogId:'room.infirmary',anchorTileX:5,anchorTileY:5,width:4,height:4};
  const input:RenderFrame={revision:1,world:WorldRenderView.fromSnapshot(world.snapshot()),rooms:[room],actors:[],roomConditions:[],
    structures:[{id:order.id,definitionId:order.definitionId,tileX:order.location.x,tileY:order.location.y,phase:'built',orientation:turns}]};
  const camera:ObliqueCameraState={target:{x:7*64,y:7*64},viewport:{width:1920,height:1080},zoom:2,
    yawRadians:(turns===0?60:-30)*Math.PI/180,elevationRadians:40*Math.PI/180};
  const before=JSON.stringify({structures:input.structures,rooms:input.rooms});
  const solid=projectObliqueWorldFrame(input,camera).raised.find((row):row is ObliqueSolid=>row.kind!=='actor'&&row.id===order.id);
  expect(solid?.assetId).toBe('fixture.medicine-cabinet.variants');
  if(solid===undefined)throw new Error('Published Infirmary cabinet missing');
  expect(solid.orientation??0).toBe(turns);if(turns===1)expect(solid.authoredFootprintTiles).toEqual({width:1,height:1});
  expect(solid.footprint).toEqual(projectedRectPrism(order.location.x*64,order.location.y*64,
    64,64,1,camera).footprint);
  const registry=parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json',publicRoot),'utf8')));
  expect(registry.entries.filter(row=>row.assetId===solid.assetId)).toEqual([{assetId:'fixture.medicine-cabinet.variants',manifest:'/game-content/oblique-fixture.medicine-cabinet.v1.json'}]);
  const catalog=parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('game-content/oblique-fixture.medicine-cabinet.v1.json',publicRoot),'utf8')));
  expect(catalog.source).toBe('assets/source/blender/fixture.medicine-cabinet.soft-light.blend');
  expect(catalog.sourceSha256).toBe('1bb3821056d58d39dc51de6788689ad780e3bed59c20a5f3625714f2480e9732');
  const selected=selectObliqueModuleFrame(catalog,{yawRadians:solid.assetYawRadians??camera.yawRadians,elevationRadians:camera.elevationRadians});
  expect(selected).toEqual({yawDegrees:60,elevationDegrees:40,image:'/assets/environment/oblique/fixture.medicine-cabinet.variants-yaw+60-elev40.bdd5f5183c55.png',
    sha256:'bdd5f5183c55984e20fe289701dadfb7ff9e350c06e4919e339c85bcb4d8a0bd'});
  expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1),publicRoot))).digest('hex')).toBe(selected.sha256);
  expect(JSON.stringify({structures:input.structures,rooms:input.rooms})).toBe(before);
});
