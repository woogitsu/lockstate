import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root=new URL('../../',import.meta.url);
const folder='docs/research/2026-10-03-cell-cot-retained-cycles/';
const read=(path:string):Buffer=>readFileSync(new URL(path,root));
const hash=(body:Buffer):string=>createHash('sha256').update(body).digest('hex');
const sourceHash=(body:Buffer):string=>/^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1]??hash(body);
const json=(path:string):unknown=>JSON.parse(read(path).toString('utf8')) as unknown;
const catalog=parseObliqueModuleCatalog(json('public/game-content/oblique-furniture.cell-cot.v1.json'));

it('preserves all25 authored parts/nine full graphs/six triangle contacts and the whole 1?2 cot using actual saved soft shaders',()=>{
  const soft=json('assets/source/blender/furniture.cell.cot.single.soft-light.provenance.json') as {
    assetId:string;source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string;footprintTiles:number[];
    materialGraphsChanged:boolean;nativeAcceptance:boolean;
    physicalAssembly:{meshCount:number;rawMeshes:unknown[];completeStoredMaterialGraphs:unknown[];actualInteriorContacts:unknown[];minCornerBounds:{min:number[];max:number[]}};
    lightingProfile:{[key:string]:unknown;lights:{name:string;energy:number;size:number}[]};
    originalMaterialAudit:{name:string;diffuseRGBA:number[];shaderBaseColor:number[];shaderRoughness:number;shaderMetallic:number}[];
    protectedBefore:unknown;protectedAfter:unknown;
  };
  expect(catalog.assetId).toBe('furniture.cell.cot.single');expect(catalog.source).toBe(soft.source);
  expect(catalog.source).toBe('assets/source/blender/furniture.cell.cot.single.soft-light.blend');
  expect(catalog.sourceSha256).toBe('1e3710b77601d6864f1de30d7b37a6220357320ae832354d3920b9fa95b17eba');
  expect(sourceHash(read(soft.source))).toBe(catalog.sourceSha256);expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(soft.retainedSourceSha256).toBe('ca8ed38a7250dd941b542a93b6e371ccdd692f6a0829d3646401d53d43a561ef');
  expect(sourceHash(read(soft.retainedSource))).toBe(soft.retainedSourceSha256);
  const old=json('assets/source/blender/furniture.cell.cot.single.angled-detail.provenance.json') as {allAuthoredRawMeshes:unknown[];retainedMaterialValues:unknown[];actualTriangleInteriorContacts:unknown[]};
  expect(soft.physicalAssembly.meshCount).toBe(25);expect(soft.physicalAssembly.rawMeshes).toEqual(old.allAuthoredRawMeshes);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toEqual(old.retainedMaterialValues);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(9);
  expect(soft.physicalAssembly.actualInteriorContacts).toEqual(old.actualTriangleInteriorContacts);expect(soft.physicalAssembly.actualInteriorContacts).toHaveLength(6);
  expect(soft.physicalAssembly.minCornerBounds).toEqual({min:[.125,.13500000536441803,0],max:[.875,1.8650000095367432,.6350000500679016]});
  expect(soft.footprintTiles).toEqual([1,2]);expect(soft.materialGraphsChanged).toBe(false);expect(soft.nativeAcceptance).toBe(false);
  for(const material of soft.originalMaterialAudit)expect(material.shaderBaseColor).toEqual(material.diffuseRGBA);
  const steel=soft.originalMaterialAudit.find(row=>row.name==='powder coated graphite steel')!;
  expect(steel.shaderRoughness).toBe(.5);expect(steel.shaderMetallic).toBe(.3799999952316284);
  expect(soft.originalMaterialAudit.find(row=>row.name==='pale laundered pillow')?.shaderRoughness).toBe(.6499999761581421);
  expect(soft.lightingProfile).toMatchObject({engine:'CYCLES',device:'CPU',threadsMode:'FIXED',threads:1,samples:64,seed:0,
    adaptiveSampling:false,denoising:false,viewTransform:'AgX',look:'None',exposure:0,gamma:1,filmTransparent:true,dither:0,worldStrength:.25});
  expect(soft.lightingProfile.lights.map(row=>[row.name,row.energy,row.size])).toEqual([
    ['Modern draft broad rear rim',300,3],['Modern draft soft neutral fill',180,5],['Modern draft soft warm key',450,4]]);
  expect(soft.protectedAfter).toEqual(soft.protectedBefore);
});

it('preserves every historical72 body, genuine two inspected samples and real72 production with four exact independent repeats',()=>{
  const history=parseObliqueModuleCatalog(json('assets/source/blender/furniture.cell.cot.single.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('ca8ed38a7250dd941b542a93b6e371ccdd692f6a0829d3646401d53d43a561ef');
  expect(history.frames).toHaveLength(72);expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx,catalog.nominalPixelsPerTile,catalog.pivotPx,catalog.cameraTargetTiles]).toEqual([[256,256],64,[128,128],[.5,1,.35]]);
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
    'actual-source-contact-RED','actual-producer-dispatch-RED','actual-hash-valid-PNG-RED','actual-old-Workbench-consumer-RED','actual-registry-omission-RED','actual-canonical-callback-RED']);
  for(const row of proof.controls)expect(row.exitCode,row.label).toBe(row.expectedFailure===null?0:1);
  expect(proof.hashValidBadPNG).toMatchObject({matchingDescriptorAndFilenameSHA:true,actualDecodedRGBA:[256,256]});
  expect(proof.protectedAfter).toEqual(proof.protectedBefore);expect(proof.exactRestoredFiles).toBe(Object.keys(proof.protectedBefore).length);
  expect(proof.exactRestoredFiles).toBeGreaterThanOrEqual(700);expect(proof.nativeRun).toBe(false);
});
