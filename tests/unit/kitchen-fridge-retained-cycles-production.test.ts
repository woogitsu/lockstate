import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root=new URL('../../',import.meta.url);
const folder='docs/research/2026-10-04-kitchen-fridge-retained-cycles/';
const read=(path:string):Buffer=>readFileSync(new URL(path,root));
const hash=(body:Buffer):string=>createHash('sha256').update(body).digest('hex');
const sourceHash=(body:Buffer):string=>/^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1]??hash(body);
const json=(path:string):unknown=>JSON.parse(read(path).toString('utf8')) as unknown;
const catalog=parseObliqueModuleCatalog(json('public/game-content/oblique-furniture.kitchen-fridge.v1.json'));

it('preserves all97 authored parts/six full graphs/24 original mesh-bound mount guards and the whole 1x1 fridge using actual saved soft shaders',()=>{
  const soft=json('assets/source/blender/furniture.kitchen.fridge.soft-light.provenance.json') as {
    assetId:string;source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string;footprintTiles:number[];
    materialGraphsChanged:boolean;nativeAcceptance:boolean;
    physicalAssembly:{meshCount:number;rawMeshes:unknown[];completeStoredMaterialGraphs:unknown[];contactMethod:string;actualMountContacts:Record<string,string>;minCornerBounds:{min:number[];max:number[]}};
    lightingProfile:{[key:string]:unknown;lights:{name:string;energy:number;size:number}[]};
    canonicalMinCornerTranslation:number[];
    originalMaterialAudit:{name:string;diffuseRGBA:number[];shaderBaseColor:number[];actualBaseColorLinks:string[][];shaderRoughness:number;shaderMetallic:number}[];
    protectedBefore:unknown;protectedAfter:unknown;
  };
  expect(catalog.assetId).toBe('furniture.kitchen.fridge.variants');expect(catalog.source).toBe(soft.source);
  expect(catalog.source).toBe('assets/source/blender/furniture.kitchen.fridge.soft-light.blend');
  expect(catalog.sourceSha256).toBe('1bad1e58abc9cd6c7a5773742df6b365ceb85db0a1e20d3c20a46c2e2508ce7d');
  expect(sourceHash(read(soft.source))).toBe(catalog.sourceSha256);expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(soft.retainedSourceSha256).toBe('0cb6861e636324cf4d1e6ad35c1739cbac6068f32eb702244f5ddb196715f3d5');
  expect(sourceHash(read(soft.retainedSource))).toBe(soft.retainedSourceSha256);
  const old=json('assets/source/blender/furniture.kitchen.fridge.angled-detail.provenance.json') as {allAuthoredRawMeshes:unknown[];retainedMaterialValues:unknown[];actualContactTargets:Record<string,string>};
  expect(soft.physicalAssembly.meshCount).toBe(97);expect(soft.physicalAssembly.rawMeshes).toEqual(old.allAuthoredRawMeshes);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toEqual(old.retainedMaterialValues);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(6);
  expect(soft.physicalAssembly.contactMethod).toBe('existing evaluated mesh-bound overlaps');
  expect(Object.keys(soft.physicalAssembly.actualMountContacts)).toHaveLength(24);
  expect(soft.physicalAssembly.actualMountContacts).toEqual(old.actualContactTargets);
  expect(soft.physicalAssembly.minCornerBounds).toEqual({min:[.07499998807907104,.015499979257583618,0],max:[.925000011920929,.8995000123977661,2.3999998569488525]});
  expect(soft.canonicalMinCornerTranslation).toEqual([.5,.5,0]);
  expect(soft.footprintTiles).toEqual([1,1]);expect(soft.materialGraphsChanged).toBe(false);expect(soft.nativeAcceptance).toBe(false);
  for(const material of soft.originalMaterialAudit)expect(material.shaderBaseColor).toEqual(material.diffuseRGBA);
  expect(soft.originalMaterialAudit.map(row=>[row.name,row.shaderRoughness,row.shaderMetallic])).toEqual([
    ['enamel',.30000001192092896,.11999999731779099],['freezer glass',.1599999964237213,.20000000298023224],
    ['handle',.20000000298023224,.699999988079071],['rubber',.30000001192092896,.15000000596046448],
    ['status green',.2800000011920929,.05000000074505806],['steel',.2199999988079071,.75]]);
  expect(soft.lightingProfile).toMatchObject({engine:'CYCLES',device:'CPU',threadsMode:'FIXED',threads:1,samples:128,seed:0,
    adaptiveSampling:false,denoising:true,viewTransform:'AgX',look:'None',exposure:0,gamma:1,filmTransparent:true,dither:0,worldStrength:.25,denoiser:'OPENIMAGEDENOISE',denoisingUseGpu:false});
  expect(soft.lightingProfile.lights.map(row=>[row.name,row.energy,row.size])).toEqual([
    ['Modern draft broad rear rim',300,3],['Modern draft soft neutral fill',180,5],['Modern draft soft warm key',450,4]]);
  expect(soft.protectedAfter).toEqual(soft.protectedBefore);
});

it('preserves every historical72 body, genuine two inspected samples and real72 production with four exact independent repeats',()=>{
  const history=parseObliqueModuleCatalog(json('assets/source/blender/furniture.kitchen.fridge.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('0cb6861e636324cf4d1e6ad35c1739cbac6068f32eb702244f5ddb196715f3d5');
  expect(history.frames).toHaveLength(72);expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx,catalog.nominalPixelsPerTile,catalog.pivotPx,catalog.cameraTargetTiles]).toEqual([[256,256],64,[128,128],[.5,.5,1.1999999284744263]]);
  for(const frame of history.frames){
    expect(hash(read('public'+frame.image))).toBe(frame.sha256);
    const current=catalog.frames.find(row=>row.yawDegrees===frame.yawDegrees&&row.elevationDegrees===frame.elevationDegrees)!;
    expect(hash(read('public'+current.image))).toBe(current.sha256);expect(current.sha256).not.toBe(frame.sha256);
  }
  for(const yaw of [60,300]){
    const current=catalog.frames.find(row=>row.yawDegrees===yaw&&row.elevationDegrees===40)!;
    expect(read('public'+current.image)).toEqual(read(folder+`after-soft-original-materials-yaw${yaw}-elev40.png`));
  }
  const matrix=json(folder+'actual-matrix.json') as {realRenderCount:number;frames:unknown[];threads:number;genuineBlenderVersion:number[];nativeAcceptance:boolean};
  expect(matrix.realRenderCount).toBe(72);expect(matrix.frames).toEqual(catalog.frames);expect(matrix.threads).toBe(1);
  expect(matrix.genuineBlenderVersion).toEqual([5,2,1]);expect(matrix.nativeAcceptance).toBe(false);
  const repeats=json(folder+'actual-four-repeats.json') as {yawDegrees:number;elevationDegrees:number;sha256:string;byteExact:boolean}[];
  expect(repeats.map(row=>row.yawDegrees)).toEqual([30,120,210,300]);
  for(const row of repeats){
    expect(row.byteExact).toBe(true);expect(row.elevationDegrees).toBe(40);
    const current=catalog.frames.find(frame=>frame.yawDegrees===row.yawDegrees&&frame.elevationDegrees===row.elevationDegrees)!;
    expect(row.sha256).toBe(current.sha256);expect(read(folder+`repeat-yaw${row.yawDegrees}-elev40.png`)).toEqual(read('public'+current.image));
  }
});

it('requires genuine production source/dispatch/hash-valid border/old consumer/registry REDs and exact restoration',()=>{
  const proof=json(folder+'actual-production-controls.json') as {actualSavedMutantSourceSha256:string;
    controls:{label:string;exitCode:number;expectedFailure:string|null}[];nativeRun:boolean;exactRestoredFiles:number;
    protectedBefore:Record<string,string>;protectedAfter:Record<string,string>;
    hashValidBadPNG:{matchingDescriptorAndFilenameSHA:boolean;actualDecodedRGBA:number[]}};
  expect(proof.actualSavedMutantSourceSha256).not.toBe(catalog.sourceSha256);
  expect(proof.controls.filter(row=>row.expectedFailure!==null).map(row=>row.label)).toEqual([
    'actual-source-contact-RED','actual-producer-dispatch-RED','actual-hash-valid-PNG-RED','actual-old-Workbench-consumer-RED','actual-registry-omission-RED','actual-canonical-callback-RED','actual-shared-Kitchen-callback-RED']);
  for(const row of proof.controls)expect(row.exitCode,row.label).toBe(row.expectedFailure===null?0:1);
  expect(proof.hashValidBadPNG).toMatchObject({matchingDescriptorAndFilenameSHA:true,actualDecodedRGBA:[256,256]});
  expect(proof.protectedAfter).toEqual(proof.protectedBefore);expect(proof.exactRestoredFiles).toBe(Object.keys(proof.protectedBefore).length);
  expect(proof.exactRestoredFiles).toBeGreaterThanOrEqual(640);expect(proof.nativeRun).toBe(false);
});
