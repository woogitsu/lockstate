import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root=new URL('../../',import.meta.url);
const folder='docs/research/2026-10-04-library-bookshelf-retained-cycles/';
const read=(path:string):Buffer=>readFileSync(new URL(path,root));
const hash=(body:Buffer):string=>createHash('sha256').update(body).digest('hex');
const sourceHash=(body:Buffer):string=>/^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1]??hash(body);
const json=(path:string):unknown=>JSON.parse(read(path).toString('utf8')) as unknown;
const catalog=parseObliqueModuleCatalog(json('public/game-content/oblique-furniture.library-bookshelf.v1.json'));

it('preserves all63 raw parts and complete nine authored material graphs including the unused fake-user original',()=>{
  const soft=json('assets/source/blender/furniture.library.bookshelf.soft-light.provenance.json') as {
    source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string;materialGraphsChanged:boolean;
    physicalAssembly:{rawMeshes:unknown[];completeStoredMaterialGraphs:unknown[];actualInteriorContacts:{actualInteriorWitness:number[];overlapDepths:number[]}[];
    minCornerBounds:{min:number[];max:number[]};evaluatedNormals:{inwardPolygons:number;degenerateFaceIndices:number[]}[]};
  };
  const old=json('assets/source/blender/furniture.library.bookshelf.angled-detail.provenance.json') as {
    allAuthoredRawMeshes:unknown[];retainedMaterialValues:unknown[];retainedUnusedMaterialFakeUserForPersistence:string[];
  };
  expect(soft.sourceSha256).toBe('aff857256da9b5895e3acd8a5fabe387e19b0f15dc36ab0327aa2e28cba0cf9f');
  expect(sourceHash(read(soft.source))).toBe(soft.sourceSha256);expect(catalog.sourceSha256).toBe(soft.sourceSha256);
  expect(sourceHash(read(soft.retainedSource))).toBe('ac0dd8e1a3345c3e791934b534d13c2043e9a5a04f85ed7cc9fe965e6716e9b7');
  expect(soft.retainedSourceSha256).toBe('ac0dd8e1a3345c3e791934b534d13c2043e9a5a04f85ed7cc9fe965e6716e9b7');
  expect(soft.materialGraphsChanged).toBe(false);
  expect(soft.physicalAssembly.rawMeshes).toEqual(old.allAuthoredRawMeshes);expect(soft.physicalAssembly.rawMeshes).toHaveLength(63);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toEqual(old.retainedMaterialValues);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(9);expect(old.retainedUnusedMaterialFakeUserForPersistence).toEqual(['Material']);
  expect(soft.physicalAssembly.actualInteriorContacts).toHaveLength(48);
  for(const row of soft.physicalAssembly.actualInteriorContacts){expect(row.actualInteriorWitness).toHaveLength(3);expect(Math.min(...row.overlapDepths)).toBeGreaterThan(1e-5);}
  expect(soft.physicalAssembly.minCornerBounds).toEqual({min:[.02499997615814209,.02399998903274536,0],max:[1.9750001430511475,.8485000133514404,2.0999999046325684]});
  expect(soft.physicalAssembly.evaluatedNormals).toHaveLength(63);
  for(const row of soft.physicalAssembly.evaluatedNormals){expect(row.inwardPolygons).toBe(0);expect(row.degenerateFaceIndices).toEqual([]);}
});

it('retains every historical72 PNG while actual saved-source72 agrees with two opened samples and four real repeats',()=>{
  const history=parseObliqueModuleCatalog(json('assets/source/blender/furniture.library.bookshelf.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('ac0dd8e1a3345c3e791934b534d13c2043e9a5a04f85ed7cc9fe965e6716e9b7');
  expect(history.frames).toHaveLength(72);expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx,catalog.nominalPixelsPerTile,catalog.pivotPx,catalog.cameraTargetTiles]).toEqual([[256,256],64,[128,128],[1,.5,1.05]]);
  for(const frame of history.frames){
    expect(hash(read('public'+frame.image))).toBe(frame.sha256);
    const current=catalog.frames.find(row=>row.yawDegrees===frame.yawDegrees&&row.elevationDegrees===frame.elevationDegrees)!;
    expect(hash(read('public'+current.image))).toBe(current.sha256);expect(current.sha256).not.toBe(frame.sha256);
  }
  for(const yaw of [60,300]){
    const current=catalog.frames.find(row=>row.yawDegrees===yaw&&row.elevationDegrees===40)!;
    expect(read('public'+current.image)).toEqual(read(folder+`after-soft-original-materials-yaw${yaw}-elev40.png`));
  }
  const matrix=json(folder+'actual-matrix.json') as {realRenderCount:number;frames:unknown[];threads:number;samples:number;denoising:boolean;genuineBlenderVersion:number[];nativeAcceptance:boolean};
  expect(matrix.realRenderCount).toBe(72);expect(matrix.frames).toEqual(catalog.frames);expect(matrix.threads).toBe(1);expect(matrix.samples).toBe(128);expect(matrix.denoising).toBe(true);
  expect(matrix.genuineBlenderVersion).toEqual([5,2,1]);expect(matrix.nativeAcceptance).toBe(false);
  const repeats=json(folder+'actual-four-repeats.json') as {yawDegrees:number;elevationDegrees:number;sha256:string;byteExact:boolean}[];
  expect(repeats.map(row=>row.yawDegrees)).toEqual([30,120,210,300]);
  for(const row of repeats){
    expect(row.byteExact).toBe(true);expect(row.elevationDegrees).toBe(40);
    const current=catalog.frames.find(frame=>frame.yawDegrees===row.yawDegrees&&frame.elevationDegrees===row.elevationDegrees)!;
    expect(row.sha256).toBe(current.sha256);expect(read(folder+`repeat-yaw${row.yawDegrees}-elev40.png`)).toEqual(read('public'+current.image));
  }
});

it('requires real saved-source/material/light/dispatch/decoded-PNG/current-consumer/callback RED and exact restore',()=>{
  const proof=json(folder+'actual-production-controls.json') as {actualSavedMutantSourceSha256:string;actualSavedAuthoredInputMutantSourceSha256:string;actualSavedLightMutantSourceSha256:string;
    controls:{label:string;exitCode:number;expectedFailure:string|null}[];nativeRun:boolean;exactRestoredFiles:number;
    protectedBefore:Record<string,string>;protectedAfter:Record<string,string>;
    hashValidBadPNG:{matchingDescriptorAndFilenameSHA:boolean;actualDecodedRGBA:number[]}};
  for(const value of [proof.actualSavedMutantSourceSha256,proof.actualSavedAuthoredInputMutantSourceSha256,proof.actualSavedLightMutantSourceSha256])expect(value).not.toBe(catalog.sourceSha256);
  expect(proof.controls.filter(row=>row.expectedFailure!==null).map(row=>row.label)).toEqual([
    'actual-source-contact-RED','actual-source-authored-input-RED','actual-source-light-RED','actual-producer-dispatch-RED',
    'actual-hash-valid-PNG-RED','actual-old-Workbench-consumer-RED','actual-registry-omission-RED','actual-canonical-callback-RED']);
  for(const row of proof.controls)expect(row.exitCode,row.label).toBe(row.expectedFailure===null?0:1);
  expect(proof.hashValidBadPNG).toMatchObject({matchingDescriptorAndFilenameSHA:true,actualDecodedRGBA:[256,256]});
  expect(proof.protectedAfter).toEqual(proof.protectedBefore);expect(proof.exactRestoredFiles).toBe(Object.keys(proof.protectedBefore).length);
  expect(proof.exactRestoredFiles).toBeGreaterThan(11000);expect(proof.nativeRun).toBe(false);
});
