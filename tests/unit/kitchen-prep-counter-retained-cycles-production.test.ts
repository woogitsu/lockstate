import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root = new URL('../../', import.meta.url);
const folder = 'docs/research/2026-10-04-kitchen-prep-counter-retained-cycles/';
const read = (path: string): Buffer => readFileSync(new URL(path, root));
const hash = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
const sourceHash = (body: Buffer): string => /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1] ?? hash(body);
const json = (path: string): unknown => JSON.parse(read(path).toString('utf8')) as unknown;
const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-furniture.kitchen-prep-counter.v1.json'));
type Receipt = {
  source: string; sourceSha256: string; retainedSource: string; retainedSourceSha256: string;
  physicalAssembly: {meshCount: number; rawMeshes: unknown[]; completeStoredMaterialGraphs: unknown[];
    actualInteriorContacts: {part: string; retainedTarget: string; actualInteriorWitness: number[]; overlapDepths: number[]}[];
    minCornerBounds: {min: number[]; max: number[]}};
  footprintTiles: number[]; canonicalMinCornerTranslation: number[]; materialGraphsChanged: boolean;
  originalMaterialAudit: {name: string; diffuseRGBA: number[]; shaderBaseColor: number[]; shaderRoughness: number; shaderMetallic: number}[];
  lightingProfile: Record<string, unknown>; protectedBefore: unknown; protectedAfter: unknown;
};
it('preserves all78 retained parts/six complete graphs and30 genuine core contacts without mislabeling legacy trim separations', () => {
  const soft = json('assets/source/blender/furniture.kitchen.prep-counter.soft-light.provenance.json') as Receipt;
  const draft = json('assets/source/blender/furniture.kitchen.prep-counter.soft64-draft.provenance.json') as Receipt;
  expect(catalog.source).toBe('assets/source/blender/furniture.kitchen.prep-counter.soft-light.blend');
  expect(catalog.sourceSha256).toBe('91a5aa7e9027221e36b115a43f23f342596d927eda4523bc68964d5e0a308d1d');
  expect(sourceHash(read(soft.source))).toBe(catalog.sourceSha256); expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(soft.retainedSourceSha256).toBe('b20bffb79d6ffe66a6c741fc420bd163651faa4813ca4d77740eb3dd55914a8a');
  expect(sourceHash(read(soft.retainedSource))).toBe(soft.retainedSourceSha256);
  expect(soft.physicalAssembly).toEqual(draft.physicalAssembly);
  expect(soft.physicalAssembly.meshCount).toBe(78); expect(soft.physicalAssembly.rawMeshes).toHaveLength(78);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(6);
  expect(soft.physicalAssembly.actualInteriorContacts).toHaveLength(30);
  for (const row of soft.physicalAssembly.actualInteriorContacts) {
    expect(row.actualInteriorWitness).toHaveLength(3); expect(row.overlapDepths.every(value => value > 1e-5)).toBe(true);
  }
  expect(soft.physicalAssembly.minCornerBounds).toEqual({min:[.07300007343292236,.01850000210106373,0], max:[1.9269999265670776,.9229999780654907,1.6200001239776611]});
  expect(soft.footprintTiles).toEqual([2,1]); expect(soft.canonicalMinCornerTranslation).toEqual([1,.5,0]); expect(soft.materialGraphsChanged).toBe(false);
  for (const row of soft.originalMaterialAudit) expect(row.shaderBaseColor).toEqual(row.diffuseRGBA);
  expect(soft.originalMaterialAudit.find(row => row.name === 'brushed stainless')).toMatchObject({shaderRoughness:.23000000417232513,shaderMetallic:.7200000286102295});
  expect(soft.originalMaterialAudit.find(row => row.name === 'butcher block')?.shaderRoughness).toBe(.47999998927116394);
  expect(soft.lightingProfile).toMatchObject({engine:'CYCLES',device:'CPU',threadsMode:'FIXED',threads:1,samples:128,seed:0,adaptiveSampling:false,denoising:true,denoiser:'OPENIMAGEDENOISE',denoisingUseGpu:false,viewTransform:'AgX',filmTransparent:true});
  expect(soft.protectedAfter).toEqual(soft.protectedBefore);
  const rims = json(folder+'actual-rim-surfaces.json') as {actualTriangleSurfaceIntersections:number;vertexDistancePixelsAt64:number;vertexDistanceIsUpperBoundOnly:boolean}[];
  expect(rims).toHaveLength(12);
  for (const row of rims) { expect(row.actualTriangleSurfaceIntersections).toBe(0); expect(row.vertexDistancePixelsAt64).toBeLessThan(.16); expect(row.vertexDistanceIsUpperBoundOnly).toBe(true); }
});
it('retains original72 bodies and requires genuine current72 plus four exact independent renders', () => {
  const history = parseObliqueModuleCatalog(json('assets/source/blender/furniture.kitchen.prep-counter.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('b20bffb79d6ffe66a6c741fc420bd163651faa4813ca4d77740eb3dd55914a8a');
  expect(history.frames).toHaveLength(72); expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx,catalog.nominalPixelsPerTile,catalog.pivotPx,catalog.cameraTargetTiles]).toEqual([[256,256],64,[128,128],[1,.5,.8100000619888306]]);
  for (const frame of history.frames) {
    expect(hash(read('public'+frame.image))).toBe(frame.sha256);
    const current = catalog.frames.find(row => row.yawDegrees === frame.yawDegrees && row.elevationDegrees === frame.elevationDegrees)!;
    expect(hash(read('public'+current.image))).toBe(current.sha256); expect(current.sha256).not.toBe(frame.sha256);
  }
  for (const yaw of [60,300]) { const current = catalog.frames.find(row => row.yawDegrees === yaw && row.elevationDegrees === 40)!; expect(read('public'+current.image)).toEqual(read(folder+`after-soft-original-materials-yaw${yaw}-elev40.png`)); }
  const matrix = json(folder+'actual-matrix.json') as {realRenderCount:number;frames:unknown[];threads:number;genuineBlenderVersion:number[];nativeAcceptance:boolean};
  expect(matrix.realRenderCount).toBe(72); expect(matrix.frames).toEqual(catalog.frames); expect(matrix.threads).toBe(1); expect(matrix.genuineBlenderVersion).toEqual([5,2,1]); expect(matrix.nativeAcceptance).toBe(false);
  const repeats = json(folder+'actual-four-repeats.json') as {yawDegrees:number;elevationDegrees:number;sha256:string;byteExact:boolean}[];
  expect(repeats.map(row => row.yawDegrees)).toEqual([30,120,210,300]);
  for (const row of repeats) { expect(row.byteExact).toBe(true); const current = catalog.frames.find(frame => frame.yawDegrees === row.yawDegrees && frame.elevationDegrees === row.elevationDegrees)!; expect(row.sha256).toBe(current.sha256); expect(read(folder+`repeat-yaw${row.yawDegrees}-elev40.png`)).toEqual(read('public'+current.image)); }
});
it('requires real saved-source/contact/light/dispatch/image/current-consumer/callback omissions with exact restoration', () => {
  const proof = json(folder+'actual-production-controls.json') as {actualSavedMutantSourceSha256:string;actualSavedLightMutantSourceSha256:string;controls:{label:string;exitCode:number;expectedFailure:string|null}[];protectedBefore:Record<string,string>;protectedAfter:Record<string,string>;exactRestoredFiles:number;nativeRun:boolean;hashValidBadPNG:unknown};
  expect(proof.actualSavedMutantSourceSha256).not.toBe(catalog.sourceSha256); expect(proof.actualSavedLightMutantSourceSha256).not.toBe(catalog.sourceSha256);
  expect(proof.controls.filter(row => row.expectedFailure !== null).map(row => row.label)).toEqual(['actual-source-contact-RED','actual-source-light-RED','actual-producer-dispatch-RED','actual-hash-valid-PNG-RED','actual-old-Workbench-consumer-RED','actual-registry-omission-RED','actual-canonical-callback-RED','actual-shared-Kitchen-callback-RED']);
  for (const row of proof.controls) expect(row.exitCode,row.label).toBe(row.expectedFailure === null ? 0 : 1);
  expect(proof.protectedAfter).toEqual(proof.protectedBefore); expect(proof.exactRestoredFiles).toBe(Object.keys(proof.protectedBefore).length); expect(proof.exactRestoredFiles).toBeGreaterThan(640); expect(proof.nativeRun).toBe(false);
  expect(proof.hashValidBadPNG).toMatchObject({matchingDescriptorAndFilenameSHA:true,actualDecodedRGBA:[256,256]});
});
