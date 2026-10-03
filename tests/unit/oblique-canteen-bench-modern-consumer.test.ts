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

it.each([[0,0],[0,1],[0,2],[0,3],[1,0],[1,1],[1,2],[1,3]] as const)('selects genuine saved modern Canteen wooden bench q%s owner%s over its whole unchanged template footprint', (turns,index) => {
  const { plan, orders } = createRoomTemplateBuildPlan('canteen-basic',{x:4,y:4},false,2,turns);
  expect([plan.width,plan.height]).toEqual([8,8]);
  expect(plan.zone).toEqual({roomId:'room.canteen',x:5,y:5,width:6,height:6});
  expect(plan.objects.map(row=>row.buildableId)).toEqual(['dining-table-wooden','dining-table-wooden','bench-wooden','bench-wooden','bench-wooden','bench-wooden']);
  const order=orders.filter(row=>row.definitionId==='bench-wooden')[index]!;
  expect(order.id).toBe(`room-template-000000000002-2-object-00${index+2}`);
  expect([order.location.x,order.location.y,order.objectOrientation??0]).toEqual([...(turns===0?[[5,7],[8,7],[5,9],[8,9]]:[[8,5],[8,8],[6,5],[6,8]])[index]!,turns]);
  const world=new SparseWorld(16);const chunk={x:chunkCoordinate(0),y:chunkCoordinate(0)};
  world.load(chunk);world.setOwned(chunk,true);
  const room={instanceId:'room.canteen:5:5',roomCatalogId:'room.canteen',anchorTileX:5,anchorTileY:5,width:6,height:6};
  const input:RenderFrame={revision:1,world:WorldRenderView.fromSnapshot(world.snapshot()),rooms:[room],actors:[],roomConditions:[],
    structures:[{id:order.id,definitionId:order.definitionId,tileX:order.location.x,tileY:order.location.y,phase:'built',orientation:turns}]};
  const camera:ObliqueCameraState={target:{x:7*64,y:7*64},viewport:{width:1920,height:1080},zoom:2,
    yawRadians:(turns===0?60:-30)*Math.PI/180,elevationRadians:40*Math.PI/180};
  const before=JSON.stringify({structures:input.structures,rooms:input.rooms});
  const solid=projectObliqueWorldFrame(input,camera).raised.find((row):row is ObliqueSolid=>row.kind!=='actor'&&row.id===order.id);
  expect(solid?.assetId).toBe('furniture.corridor.bench.variants');
  if(solid===undefined)throw new Error('Published Canteen wooden bench missing');
  expect(solid.orientation??0).toBe(turns);if(turns===1)expect(solid.authoredFootprintTiles).toEqual({width:2,height:1});
  expect(solid.footprint).toEqual(projectedRectPrism(order.location.x*64,order.location.y*64,
    (turns===0?2:1)*64,(turns===0?1:2)*64,1,camera).footprint);
  const registry=parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json',publicRoot),'utf8')));
  expect(registry.entries.filter(row=>row.assetId===solid.assetId)).toEqual([{assetId:'furniture.corridor.bench.variants',manifest:'/game-content/oblique-canteen-bench.v1.json'}]);
  const catalog=parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('game-content/oblique-canteen-bench.v1.json',publicRoot),'utf8')));
  expect(catalog.source).toBe('assets/source/blender/furniture.corridor.bench.soft-light.blend');
  expect(catalog.sourceSha256).toBe('b4e5ca9317c74e0f8182937658c0a3f7026f114fcb7e1661101628cbd75c4e94');
  const selected=selectObliqueModuleFrame(catalog,{yawRadians:solid.assetYawRadians??camera.yawRadians,elevationRadians:camera.elevationRadians});
  expect(selected).toEqual({yawDegrees:60,elevationDegrees:40,image:'/assets/environment/oblique/furniture.corridor.bench.variants-yaw+60-elev40.5ad7afdb520e.png',
    sha256:'5ad7afdb520ed6cb58c5dd87e652a5e7165d7095d593b48708f40746bc90ac8f'});
  expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1),publicRoot))).digest('hex')).toBe(selected.sha256);
  expect(JSON.stringify({structures:input.structures,rooms:input.rooms})).toBe(before);
});
