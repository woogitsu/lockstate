import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { ENVIRONMENT_SPRITES } from '../../src/rendering/assets/environment-sprites';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';

const observed = vi.hoisted(() => ({ queued: [] as Array<{key:string;url:string}>, batches: [] as Array<Array<{key:string;url:string}>>,
  loaded: new Set<string>(), complete: [] as Array<()=>void>, running:false, shutdown:undefined as undefined|(()=>void), floorRelease:undefined as undefined|((value:unknown)=>void) }));
vi.mock('phaser', () => ({default:{Scene:class {
  readonly cameras={main:{width:1920,height:1080,setBackgroundColor(){}}};
  readonly add={graphics:()=>({setScrollFactor(){return this;},setDepth(){return this;},clear(){return this;}})};
  readonly input={mouse:{disableContextMenu(){}},addPointer(){},on(){}};
  readonly game={canvas:new EventTarget()};
  readonly events={once:(_event:string,callback:()=>void)=>{observed.shutdown=callback;}};
  readonly textures={exists:(key:string)=>observed.loaded.has(key)};
  readonly load={image:(key:string,url:string)=>observed.queued.push({key,url}),once:(_event:string,callback:()=>void)=>observed.complete.push(callback),
    start:()=>{expect(observed.running,'one actual Phaser loader batch at a time').toBe(false); observed.running=true; observed.batches.push(observed.queued.splice(0));}};
},Scenes:{Events:{SHUTDOWN:'shutdown'}},Loader:{Events:{COMPLETE:'complete'}}}}));
vi.mock('../../src/rendering/assets/rendered-art-catalog',()=>({RenderedArtCatalog:{load:()=>new Promise(resolve=>{observed.floorRelease=resolve;})}}));
afterEach(()=>{observed.queued.length=0;observed.batches.length=0;observed.loaded.clear();observed.complete.length=0;observed.running=false;observed.shutdown=undefined;observed.floorRelease=undefined;vi.unstubAllGlobals();});
const wanted=new Set(['furniture.cell.cot.single','actor.guard.base','wall.square.brick.full','furniture.chair.wooden','furniture.classroom.school-chair']);
const registry=parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('../../public/game-content/oblique-module-registry.v1.json',import.meta.url),'utf8')));
const catalogs=registry.entries.filter(entry=>wanted.has(entry.assetId)).map(entry=>parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('../../public'+entry.manifest,import.meta.url),'utf8'))));
const floor=Object.entries(ENVIRONMENT_SPRITES).find(([id,value])=>id.startsWith('env.floor.')&&value.kind==='rendered-art')![1];
if(floor.kind!=='rendered-art')throw new Error('Authored floor missing');
const floorId=floor.renderedArtId;
const floorCatalog={has:(id:string)=>id===floorId,imageUrl:(id:string)=>`/game-content/source-art/${id}.png`};
async function microtasks(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}
function finish(success=true){const batch=observed.batches.at(-1)!;if(success)for(const row of batch)observed.loaded.add(row.key);observed.running=false;for(const callback of observed.complete.splice(0))callback();}
function create(){vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',{activeElement:null});
  const world=new SparseWorld(16);const chunk={x:chunkCoordinate(0),y:chunkCoordinate(0)};world.load(chunk);world.setOwned(chunk,true);
  const frame:RenderFrame={revision:1,world:WorldRenderView.fromSnapshot(world.snapshot()),structures:[],rooms:[],roomConditions:[],actors:[]};
  const scene=new ObliqueWorldScene({catalogs:new Map(catalogs.map(catalog=>[catalog.assetId,catalog])),feed:{readFrame:()=>frame},keyValueStore:{getItem:()=>null,setItem(){}}});scene.create();return {scene,frame};}
function demand(scene:ObliqueWorldScene,frame:RenderFrame){const pose=Reflect.get(scene,'pose');const projection=projectObliqueWorldFrame(frame,pose);Reflect.get(scene,'selectPoseTextures').call(scene,projection);return projection;}
async function floorReady(){await microtasks();observed.floorRelease!(floorCatalog);await microtasks();finish();await microtasks();}

it('empty boot requests only required floor pixels and resolves readiness after them',async()=>{const{scene,frame}=create();let ready=false;void scene.ready().then(()=>{ready=true;});await microtasks();
  expect(observed.batches).toHaveLength(0);demand(scene,frame);expect(observed.batches).toHaveLength(0);expect(ready).toBe(false);
  observed.floorRelease!(floorCatalog);await microtasks();expect(observed.batches).toHaveLength(1);expect(observed.batches[0]).toEqual([{key:`oblique-floor:${floorId}`,url:floorCatalog.imageUrl(floorId)}]);expect(ready).toBe(false);
  finish();await microtasks();expect(ready).toBe(true);});

it('actual projected placed cot, guard and pending cot request their frames; pending wall keeps its existing fallback',async()=>{const{scene,frame}=create();await floorReady();
  const projection=demand(scene,{...frame,structures:[{id:'cot',definitionId:'object.bed',tileX:1,tileY:1,phase:'built',orientation:1},{id:'pending-cot',definitionId:'object.bed',tileX:5,tileY:2,phase:'planned',orientation:3},{id:'pending',definitionId:'wall-brick',tileX:3,tileY:2,phase:'planned',footprint:'square'}],actors:[{id:9,assetId:'actor.guard',tileX:2,tileY:2,deltaX:0,deltaY:0,facing:'north'}]});
  expect(projection.raised.find(item=>item.id==='pending')?.assetId).toBeUndefined();
  const expected=projection.raised.filter(item=>item.assetId!==undefined).map(item=>{const catalog=catalogs.find(c=>c.assetId===item.assetId)!;const pose=Reflect.get(scene,'pose');const selected=selectObliqueModuleFrame(catalog,{...pose,yawRadians:item.assetYawRadians??pose.yawRadians});return{key:`oblique:${catalog.assetId}:${selected.yawDegrees}:${selected.elevationDegrees}`,url:selected.image};});
  expect(expected).toHaveLength(3);expect(observed.batches.at(-1)).toEqual(expected);expect((Reflect.get(scene,'assetTextureKeys')as Map<string,string>).size).toBe(0);
  finish();demand(scene,{...frame,structures:[{id:'cot',definitionId:'object.bed',tileX:1,tileY:1,phase:'built',orientation:1}]});expect((Reflect.get(scene,'assetTextureKeys')as Map<string,string>).has('structure:cot')).toBe(true);});

it('floor and model requests are serialized even when demand precedes descriptor reply',async()=>{const{scene,frame}=create();await microtasks();demand(scene,{...frame,structures:[{id:'cot',definitionId:'object.bed',tileX:1,tileY:1,phase:'built'}]});
  expect(observed.batches).toHaveLength(1);observed.floorRelease!(floorCatalog);await microtasks();expect(observed.batches).toHaveLength(1);finish();expect(observed.batches).toHaveLength(2);expect(observed.batches[1]![0]!.key).toBe(`oblique-floor:${floorId}`);finish();await scene.ready();});

it('orientation changes select a fresh physical cot pose without showing the old key',async()=>{const{scene,frame}=create();await floorReady();const cot={id:'cot',definitionId:'object.bed',tileX:1,tileY:1,phase:'built' as const};demand(scene,{...frame,structures:[cot]});finish();demand(scene,{...frame,structures:[cot]});const old=(Reflect.get(scene,'assetTextureKeys')as Map<string,string>).get('structure:cot');expect(old).toBeDefined();demand(scene,{...frame,structures:[{...cot,orientation:1}]});expect((Reflect.get(scene,'assetTextureKeys')as Map<string,string>).get('structure:cot')).toBeUndefined();expect(observed.batches.at(-1)![0]!.key).not.toBe(old);});

it('room-owned chair skin selects the actual classroom catalog after the generic chair loaded',async()=>{const{scene,frame}=create();await floorReady();const chair={id:'chair',definitionId:'object.chair',tileX:1,tileY:1,phase:'built' as const};demand(scene,{...frame,structures:[chair]});expect(observed.batches.at(-1)![0]!.key).toContain('furniture.chair.wooden');finish();demand(scene,{...frame,structures:[chair],rooms:[{instanceId:'room.classroom:0:0',roomCatalogId:'room.classroom',anchorTileX:0,anchorTileY:0,width:4,height:4}]});expect(observed.batches.at(-1)![0]!.key).toContain('furniture.classroom.school-chair');const selected=selectObliqueModuleFrame(catalogs.find(c=>c.assetId==='furniture.classroom.school-chair')!,Reflect.get(scene,'pose'));expect(observed.batches.at(-1)![0]!.url).toBe(selected.image);});

it('failed image stays fallback without an unbounded request loop',async()=>{const{scene,frame}=create();await floorReady();const content={...frame,structures:[{id:'cot',definitionId:'object.bed',tileX:1,tileY:1,phase:'built' as const}]};demand(scene,content);finish(false);const count=observed.batches.length;demand(scene,content);expect(observed.batches).toHaveLength(count);expect((Reflect.get(scene,'assetTextureKeys')as Map<string,string>).size).toBe(0);});

it('shutdown ignores outstanding model completion and never starts queued work',async()=>{const{scene,frame}=create();await floorReady();const repaint=vi.spyOn(scene as unknown as {repaint():void},'repaint');demand(scene,{...frame,structures:[{id:'cot',definitionId:'object.bed',tileX:1,tileY:1,phase:'built'}]});
  Reflect.set(scene,'queuedAssetTextures',new Map([['oblique:queued','/unused.png']]));const count=observed.batches.length;observed.shutdown!();const paints=repaint.mock.calls.length;finish();expect(repaint).toHaveBeenCalledTimes(paints);expect(observed.batches).toHaveLength(count);});

it('shutdown before floor descriptor completion prevents all image work and settles readiness',async()=>{const{scene}=create();await microtasks();observed.shutdown!();observed.floorRelease!(floorCatalog);await microtasks();expect(observed.batches).toHaveLength(0);await scene.ready();});
