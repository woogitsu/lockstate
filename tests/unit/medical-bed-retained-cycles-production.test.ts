import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root = new URL('../../', import.meta.url);
const folder = 'docs/research/2026-10-04-medical-bed-retained-cycles/';
const read = (path: string): Buffer => readFileSync(new URL(path, root));
const hash = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
const sourceHash = (body: Buffer): string => /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1] ?? hash(body);
const json = (path: string): unknown => JSON.parse(read(path).toString('utf8')) as unknown;
const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-furniture.medical-bed.v1.json'));

it('retains immutable76-part bed, adds only thirteen measured fixings, and repairs only four authored BaseRGBA/Roughness inputs', () => {
  const soft = json('assets/source/blender/furniture.medical-bed.soft-light.provenance.json') as {
    source: string; sourceSha256: string; retainedSource: string; retainedSourceSha256: string; footprintTiles: number[];
    physicalAssembly: { meshCount: number; rawMeshes: {name: string}[]; completeStoredMaterialGraphs: unknown[];
      actualTriangleInteriorContacts: {actualInteriorWitness: number[]; overlappingDepth: number}[];
      meshBoundConnectivity: {groups: string[][]}; minCornerBounds: {min: number[]; max: number[]} };
    legacyPhysicalAssembly: { meshCount: number; rawMeshes: {name: string}[]; completeStoredMaterialGraphs: unknown[] };
    exactAuthoredShaderInputRepair: {material: string; oldBaseRGBA: number[]; newBaseRGBA: number[];
      oldShaderRoughness: number; newShaderRoughness: number; preservedShaderMetallic: number}[];
    otherGraphInputsChanged: boolean; nativeAcceptance: boolean; protectedBefore: unknown; protectedAfter: unknown;
    lightingProfile: { [key: string]: unknown }; afterRenderedFromActualSavedSource: boolean;
  };
  const legacy = json('assets/source/blender/furniture.medical-bed.angled-detail.provenance.json') as {retainedMaterialGraphs: unknown[]};
  expect(catalog.assetId).toBe('furniture.medical-bed.variants');
  expect(catalog.source).toBe('assets/source/blender/furniture.medical-bed.soft-light.blend');
  expect(catalog.sourceSha256).toBe('786abf1ae0e37b99ddb507618918f04472560a68f78bcd22a7f3b5097c822c2c');
  expect(soft.source).toBe(catalog.source); expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(sourceHash(read(soft.source))).toBe(soft.sourceSha256);
  expect(soft.retainedSourceSha256).toBe('d18a702e585d6e69f15602d9e9f294bc0c539da3f78bf4f48fe1330da286c4fe');
  expect(sourceHash(read(soft.retainedSource))).toBe(soft.retainedSourceSha256);
  expect(soft.legacyPhysicalAssembly.meshCount).toBe(76); expect(soft.physicalAssembly.meshCount).toBe(89);
  expect(soft.physicalAssembly.rawMeshes.filter(row => soft.legacyPhysicalAssembly.rawMeshes.some(old => old.name === row.name)))
    .toEqual(soft.legacyPhysicalAssembly.rawMeshes);
  expect(soft.physicalAssembly.rawMeshes.filter(row => !soft.legacyPhysicalAssembly.rawMeshes.some(old => old.name === row.name)).map(row => row.name)).toEqual(["angled-medical-bed.foot lift cross shaft bearing", "angled-medical-bed.head lift cross shaft bearing", "angled-medical-bed.left foot caster continuous axle", "angled-medical-bed.left foot rail coupling socket", "angled-medical-bed.left head caster continuous axle", "angled-medical-bed.left head rail coupling socket", "angled-medical-bed.left lower bearing attachment", "angled-medical-bed.mattress deck support", "angled-medical-bed.right foot caster continuous axle", "angled-medical-bed.right foot rail coupling socket", "angled-medical-bed.right head caster continuous axle", "angled-medical-bed.right head rail coupling socket", "angled-medical-bed.right lower bearing attachment"]);
  expect(soft.legacyPhysicalAssembly.completeStoredMaterialGraphs).toEqual(legacy.retainedMaterialGraphs);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(4);
  expect(soft.exactAuthoredShaderInputRepair.map(row => [row.material, row.newBaseRGBA, row.newShaderRoughness, row.preservedShaderMetallic])).toEqual([["mattress edge", [0.25, 0.41999998688697815, 0.47999998927116394, 1.0], 0.550000011920929, 0.0], ["medical linen", [0.7799999713897705, 0.8199999928474426, 0.7799999713897705, 1.0], 0.699999988079071, 0.0], ["rail accent", [0.75, 0.550000011920929, 0.2800000011920929, 1.0], 0.4000000059604645, 0.0], ["warm painted steel", [0.41999998688697815, 0.47999998927116394, 0.5, 1.0], 0.3199999928474426, 0.0]]);
  for (const row of soft.exactAuthoredShaderInputRepair) { expect(row.oldBaseRGBA).toEqual([.800000011920929,.800000011920929,.800000011920929,1]); expect(row.oldShaderRoughness).toBe(.5); }
  expect(soft.otherGraphInputsChanged).toBe(false);
  expect(soft.physicalAssembly.actualTriangleInteriorContacts).toHaveLength(26);
  for (const row of soft.physicalAssembly.actualTriangleInteriorContacts) { expect(row.actualInteriorWitness).toHaveLength(3); expect(row.overlappingDepth).toBeGreaterThan(0); }
  expect(soft.physicalAssembly.meshBoundConnectivity.groups).toHaveLength(1);
  expect(soft.physicalAssembly.meshBoundConnectivity.groups[0]).toHaveLength(89);
  expect(soft.physicalAssembly.minCornerBounds).toEqual({"min": [0.010999991558492184, 0.0899999737739563, 0.0], "max": [0.9890000224113464, 1.9100000858306885, 1.350000023841858]});
  expect(soft.footprintTiles).toEqual([1,2]); expect(soft.afterRenderedFromActualSavedSource).toBe(true);
  expect(soft.nativeAcceptance).toBe(false); expect(soft.protectedAfter).toEqual(soft.protectedBefore);
  expect(soft.lightingProfile).toMatchObject({engine:'CYCLES',device:'CPU',threadsMode:'FIXED',threads:1,samples:128,seed:0,
    adaptiveSampling:false,denoising:true,viewTransform:'AgX',look:'None',filmTransparent:true,dither:0,denoiser:'OPENIMAGEDENOISE',denoisingUseGpu:false});
});

it('preserves historical72 and exports genuine72 current poses with saved-source samples and four byte-exact repeats', () => {
  const history = parseObliqueModuleCatalog(json('assets/source/blender/furniture.medical-bed.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('d18a702e585d6e69f15602d9e9f294bc0c539da3f78bf4f48fe1330da286c4fe');
  expect(history.frames).toHaveLength(72); expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx,catalog.nominalPixelsPerTile,catalog.pivotPx,catalog.cameraTargetTiles]).toEqual([[256,256],64,[128,128],[.5,1,.675000011920929]]);
  for (const frame of history.frames) { expect(hash(read('public' + frame.image))).toBe(frame.sha256); }
  for (const frame of catalog.frames) { expect(hash(read('public' + frame.image))).toBe(frame.sha256); expect(frame.image).toContain('.' + frame.sha256.slice(0,12) + '.png'); }
  for (const yaw of [60,300]) { const current = catalog.frames.find(row => row.yawDegrees === yaw && row.elevationDegrees === 40)!;
    expect(read('public' + current.image)).toEqual(read(folder + `after-soft-authored-materials-yaw${yaw}-elev40.png`)); }
  const matrix = json(folder + 'actual-matrix.json') as {realRenderCount: number; frames: unknown[]; genuineBlenderVersion: number[]; nativeAcceptance: boolean};
  expect(matrix.realRenderCount).toBe(72); expect(matrix.frames).toEqual(catalog.frames); expect(matrix.genuineBlenderVersion).toEqual([5,2,1]); expect(matrix.nativeAcceptance).toBe(false);
  const repeats = json(folder + 'actual-four-repeats.json') as {yawDegrees: number; elevationDegrees: number; sha256: string; byteExact: boolean}[];
  expect(repeats.map(row => row.yawDegrees)).toEqual([30,120,210,300]);
  for (const row of repeats) { expect(row.byteExact).toBe(true); const frame = catalog.frames.find(f => f.yawDegrees === row.yawDegrees && f.elevationDegrees === row.elevationDegrees)!;
    expect(row.sha256).toBe(frame.sha256); expect(read(folder + `repeat-yaw${row.yawDegrees}-elev40.png`)).toEqual(read('public' + frame.image)); }
});
it('requires actual saved-source and selected-producer omissions plus real current-consumer negatives and exact restoration', () => {
  const proof = json(folder + 'actual-production-controls.json') as {
    actualSavedMutantSourceSha256: string; controls: {label: string; exitCode: number; expectedFailure: string | null}[];
    protectedBefore: Record<string,string>; protectedAfter: Record<string,string>; exactRestoredFiles: number; nativeRun: boolean;
  };
  expect(proof.actualSavedMutantSourceSha256).not.toBe(catalog.sourceSha256);
  expect(proof.controls.filter(row => row.expectedFailure !== null).map(row => row.label)).toEqual([
    'actual-source-fixing-RED', 'actual-selected-producer-omission-RED', 'actual-old-Workbench-consumer-RED', 'actual-registry-omission-RED']);
  for (const row of proof.controls) expect(row.exitCode, row.label).toBe(row.expectedFailure === null ? 0 : 1);
  expect(proof.protectedAfter).toEqual(proof.protectedBefore);
  expect(proof.exactRestoredFiles).toBe(Object.keys(proof.protectedBefore).length);
  expect(proof.exactRestoredFiles).toBeGreaterThan(1000); expect(proof.nativeRun).toBe(false);
});
