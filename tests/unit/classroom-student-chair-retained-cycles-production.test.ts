import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root=new URL('../../',import.meta.url);
const folder='docs/research/2026-10-04-classroom-student-chair-retained-cycles/';
const read=(path:string):Buffer=>readFileSync(new URL(path,root));
const hash=(body:Buffer):string=>createHash('sha256').update(body).digest('hex');
const sourceHash=(body:Buffer):string=>/^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1]??hash(body);
const json=(path:string):unknown=>JSON.parse(read(path).toString('utf8')) as unknown;
const catalog=parseObliqueModuleCatalog(json('public/game-content/oblique-furniture-classroom-student-chair.v1.json'));

it('preserves all33 raw parts and complete eight authored material graphs including the unused fake-user original',()=>{
  const soft=json('assets/source/blender/furniture.classroom.student-chair.soft-light.provenance.json') as {
    source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string;materialGraphsChanged:boolean;
    physicalAssembly:{rawMeshes:unknown[];completeStoredMaterialGraphs:unknown[];actualInteriorContacts:{actualTriangleInteriorWitness:number[]}[];
    minCornerBounds:{min:number[];max:number[]};evaluatedNormals:{inwardPolygons:number;degenerateIndices:number[]}[]};
  };
  const old=json('assets/source/blender/furniture.classroom.student-chair.provenance.json') as {
    allAuthoredRawMeshes:unknown[];retainedStoredMaterialGraphs:unknown[];authoredEvaluatedNormals:unknown[];
  };
  expect(soft.sourceSha256).toBe('cda6b031cbc079e66afc511f8fc864b9706c0ed601ef33d759fa2c201a916273');
  expect(sourceHash(read(soft.source))).toBe(soft.sourceSha256);expect(catalog.sourceSha256).toBe(soft.sourceSha256);
  expect(sourceHash(read(soft.retainedSource))).toBe('0c3d7dc54a594659c810f8e1d76bd4980bf1293f7a5b22c367805760de1a9b1b');
  expect(soft.retainedSourceSha256).toBe('0c3d7dc54a594659c810f8e1d76bd4980bf1293f7a5b22c367805760de1a9b1b');
  expect(soft.materialGraphsChanged).toBe(false);
  expect(soft.physicalAssembly.rawMeshes).toEqual(old.allAuthoredRawMeshes);expect(soft.physicalAssembly.rawMeshes).toHaveLength(33);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toEqual(old.retainedStoredMaterialGraphs);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(8);
  expect(soft.physicalAssembly.actualInteriorContacts).toHaveLength(13);
  for(const row of soft.physicalAssembly.actualInteriorContacts){expect(row.actualTriangleInteriorWitness).toHaveLength(3);expect(row.actualTriangleInteriorWitness.every(Number.isFinite)).toBe(true);}
  expect(soft.physicalAssembly.minCornerBounds).toEqual({"min": [0.15000000596046448, 0.14399999380111694, 0.0], "max": [0.8500000238418579, 0.8459999561309814, 1.0440210103988647]});
  expect(soft.physicalAssembly.evaluatedNormals).toHaveLength(33);
  expect(soft.physicalAssembly.evaluatedNormals).toEqual(old.authoredEvaluatedNormals);
});

it('retains every historical72 PNG while actual saved-source72 agrees with two opened samples and four real repeats',()=>{
  const history=parseObliqueModuleCatalog(json('assets/source/blender/furniture.classroom.student-chair.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('0c3d7dc54a594659c810f8e1d76bd4980bf1293f7a5b22c367805760de1a9b1b');
  expect(history.frames).toHaveLength(72);expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx,catalog.nominalPixelsPerTile,catalog.pivotPx,catalog.cameraTargetTiles]).toEqual([[256,256],64,[128,128],[.5,.5,.58]]);
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
