import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root=new URL('../../',import.meta.url);
const folder='docs/research/2026-10-03-cell-toilet-retained-cycles/';
const read=(path:string):Buffer=>readFileSync(new URL(path,root));
const hash=(body:Buffer):string=>createHash('sha256').update(body).digest('hex');
const sourceHash=(body:Buffer):string=>/^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1]??hash(body);
const json=(path:string):unknown=>JSON.parse(read(path).toString('utf8')) as unknown;
const catalog=parseObliqueModuleCatalog(json('public/game-content/oblique-cell-toilet.v1.json'));

it('preserves all45 authored parts/eight full graphs/two triangle contacts and the whole 1?1 toilet using actual saved soft shaders',()=>{
  const soft=json('assets/source/blender/fixture.cell.toilet_sink.soft-light.provenance.json') as {
    assetId:string;source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string;footprintTiles:number[];
    materialGraphsChanged:boolean;nativeAcceptance:boolean;canonicalMinCornerTranslation:number[];
    physicalAssembly:{meshCount:number;rawMeshes:unknown[];completeStoredMaterialGraphs:unknown[];actualInteriorContacts:unknown[];minCornerBounds:{min:number[];max:number[]}};
    lightingProfile:{[key:string]:unknown;lights:{name:string;energy:number;size:number}[]};
    originalMaterialAudit:{name:string;diffuseRGBA:number[];shaderBaseColorDefault:number[];actualBaseColorLinks:string[][];shaderRoughness:number;shaderMetallic:number}[];
    protectedBefore:unknown;protectedAfter:unknown;
  };
  expect(catalog.assetId).toBe('fixture.cell.toilet_sink');expect(catalog.source).toBe(soft.source);
  expect(catalog.source).toBe('assets/source/blender/fixture.cell.toilet_sink.soft-light.blend');
  expect(catalog.sourceSha256).toBe('1aa9169f65ea498fd1bfe6a2ee600f058c41f1a76685a0109a17da92db398ad5');
  expect(sourceHash(read(soft.source))).toBe(catalog.sourceSha256);expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(soft.retainedSourceSha256).toBe('ebc1570274663d22315eed0adfafe8886120bdbf9901dfa744edcde540428ff8');
  expect(sourceHash(read(soft.retainedSource))).toBe(soft.retainedSourceSha256);
  const old=json('assets/source/blender/fixture.cell.toilet_sink.angled-connection.provenance.json') as {allAuthoredRawMeshes:unknown[];retainedMaterialValues:unknown[];actualTriangleInteriorContacts:unknown[]};
  expect(soft.physicalAssembly.meshCount).toBe(45);expect(soft.physicalAssembly.rawMeshes).toEqual(old.allAuthoredRawMeshes);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toEqual(old.retainedMaterialValues);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(8);
  expect(soft.physicalAssembly.actualInteriorContacts).toHaveLength(2);
  expect(old.actualTriangleInteriorContacts).toHaveLength(2);
  expect(soft.canonicalMinCornerTranslation).toEqual([.5,.5,0]);
  expect(soft.physicalAssembly.minCornerBounds).toEqual({min:[.17599999904632568,.08799998462200165,.005000002682209015],max:[.916000247001648,.9621759653091431,1.102500081062317]});
  expect(soft.footprintTiles).toEqual([1,1]);expect(soft.materialGraphsChanged).toBe(false);expect(soft.nativeAcceptance).toBe(false);
  for(const material of soft.originalMaterialAudit)expect(material.shaderBaseColorDefault).toEqual(material.diffuseRGBA);
  const glaze=soft.originalMaterialAudit.find(row=>row.name==='Cell toilet warm glazed porcelain')!;
  expect(glaze.shaderRoughness).toBe(.28999999165534973);expect(glaze.shaderMetallic).toBe(0);
  expect(glaze.actualBaseColorLinks).toEqual([['Color Ramp','Color']]);
  expect(soft.originalMaterialAudit.find(row=>row.name==='Cell toilet dark still water')?.shaderRoughness).toBe(.20999999344348907);
  expect(soft.originalMaterialAudit.find(row=>row.name==='porcelain')?.shaderRoughness).toBe(.25);
  expect(soft.lightingProfile).toMatchObject({engine:'CYCLES',device:'CPU',threadsMode:'FIXED',threads:1,samples:64,seed:0,
    adaptiveSampling:false,denoising:false,viewTransform:'AgX',look:'None',exposure:0,gamma:1,filmTransparent:true,dither:0,worldStrength:.25});
  expect(soft.lightingProfile.lights.map(row=>[row.name,row.energy,row.size])).toEqual([
    ['Modern draft broad rear rim',300,3],['Modern draft soft neutral fill',180,5],['Modern draft soft warm key',450,4]]);
  expect(soft.protectedAfter).toEqual(soft.protectedBefore);
});

it('preserves every historical72 body, genuine two inspected samples and real72 production with four exact independent repeats',()=>{
  const history=parseObliqueModuleCatalog(json('assets/source/blender/fixture.cell.toilet_sink.eevee-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('ebc1570274663d22315eed0adfafe8886120bdbf9901dfa744edcde540428ff8');
  expect(history.frames).toHaveLength(72);expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx,catalog.nominalPixelsPerTile,catalog.pivotPx,catalog.cameraTargetTiles]).toEqual([[512,512],64,[256,256],[.5,.5,.5537500381469727]]);
  for(const frame of history.frames){
    expect(hash(read('public'+frame.image))).toBe(frame.sha256);
    const current=catalog.frames.find(row=>row.yawDegrees===frame.yawDegrees&&row.elevationDegrees===frame.elevationDegrees)!;
    expect(hash(read('public'+current.image))).toBe(current.sha256);expect(current.sha256).not.toBe(frame.sha256);
  }
  for(const yaw of [45,135]){
    const current=catalog.frames.find(row=>row.yawDegrees===yaw&&row.elevationDegrees===40)!;
    expect(read('public'+current.image)).toEqual(read(folder+`after-soft-original-materials-yaw${yaw}-elev40.png`));
  }
  const matrix=json(folder+'actual-matrix.json') as {realRenderCount:number;frames:unknown[];threads:number;genuineBlenderVersion:number[];nativeAcceptance:boolean};
  expect(matrix.realRenderCount).toBe(72);expect(matrix.frames).toEqual(catalog.frames);expect(matrix.threads).toBe(1);
  expect(matrix.genuineBlenderVersion).toEqual([5,2,1]);expect(matrix.nativeAcceptance).toBe(false);
  const repeats=json(folder+'actual-four-repeats.json') as {yawDegrees:number;elevationDegrees:number;sha256:string;byteExact:boolean}[];
  expect(repeats.map(row=>row.yawDegrees)).toEqual([-135,-45,45,135]);
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
    'actual-source-contact-RED','actual-producer-dispatch-RED','actual-hash-valid-PNG-RED','actual-old-EEVEE-consumer-RED','actual-registry-omission-RED','actual-canonical-callback-RED']);
  for(const row of proof.controls)expect(row.exitCode,row.label).toBe(row.expectedFailure===null?0:1);
  expect(proof.hashValidBadPNG).toMatchObject({matchingDescriptorAndFilenameSHA:true,actualDecodedRGBA:[512,512]});
  expect(proof.protectedAfter).toEqual(proof.protectedBefore);expect(proof.exactRestoredFiles).toBe(Object.keys(proof.protectedBefore).length);
  expect(proof.exactRestoredFiles).toBeGreaterThanOrEqual(700);expect(proof.nativeRun).toBe(false);
});
