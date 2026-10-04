import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root = new URL('../../', import.meta.url);
const folder = 'docs/research/2026-10-04-medicine-cabinet-retained-cycles/';
const read = (path: string): Buffer => readFileSync(new URL(path, root));
const hash = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
const sourceHash = (body: Buffer): string => /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1] ?? hash(body);
const json = (path: string): unknown => JSON.parse(read(path).toString('utf8')) as unknown;
const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-fixture.medicine-cabinet.v1.json'));

it('retains immutable66-part cabinet, adds only five measured fixings, and repairs only three authored BaseRGBA/Roughness inputs', () => {
  const soft = json('assets/source/blender/fixture.medicine-cabinet.soft-light.provenance.json') as {
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
  const legacy = json('assets/source/blender/fixture.medicine-cabinet.angled-detail.provenance.json') as {retainedMaterialGraphs: unknown[]};
  expect(catalog.assetId).toBe('fixture.medicine-cabinet.variants');
  expect(catalog.source).toBe('assets/source/blender/fixture.medicine-cabinet.soft-light.blend');
  expect(catalog.sourceSha256).toBe('1bb3821056d58d39dc51de6788689ad780e3bed59c20a5f3625714f2480e9732');
  expect(soft.source).toBe(catalog.source); expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(sourceHash(read(soft.source))).toBe(soft.sourceSha256);
  expect(soft.retainedSourceSha256).toBe('f03b6fc2d33d83c069b181073616ae95031839e130d890b9f5374cfd947be5ea');
  expect(sourceHash(read(soft.retainedSource))).toBe(soft.retainedSourceSha256);
  expect(soft.legacyPhysicalAssembly.meshCount).toBe(66); expect(soft.physicalAssembly.meshCount).toBe(71);
  expect(soft.physicalAssembly.rawMeshes.filter(row => soft.legacyPhysicalAssembly.rawMeshes.some(old => old.name === row.name)))
    .toEqual(soft.legacyPhysicalAssembly.rawMeshes);
  expect(soft.physicalAssembly.rawMeshes.filter(row => !soft.legacyPhysicalAssembly.rawMeshes.some(old => old.name === row.name)).map(row => row.name)).toEqual([
    'angled-medicine-cabinet.left lower hinge continuous fixing shaft', 'angled-medicine-cabinet.left upper hinge continuous fixing shaft',
    'angled-medicine-cabinet.lower toe service backing support', 'angled-medicine-cabinet.right lower hinge continuous fixing shaft',
    'angled-medicine-cabinet.right upper hinge continuous fixing shaft']);
  expect(soft.legacyPhysicalAssembly.completeStoredMaterialGraphs).toEqual(legacy.retainedMaterialGraphs);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(3);
  expect(soft.exactAuthoredShaderInputRepair.map(row => [row.material, row.newBaseRGBA, row.newShaderRoughness, row.preservedShaderMetallic])).toEqual([
    ['brass handle', [.7200000286102295,.47999998927116394,.20000000298023224,1],.25,0],
    ['cabinet inset', [.18000000715255737,.25,.25,1],.3499999940395355,0],
    ['cabinet warm white', [.699999988079071,.7200000286102295,.6600000262260437,1],.44999998807907104,0]]);
  for (const row of soft.exactAuthoredShaderInputRepair) { expect(row.oldBaseRGBA).toEqual([.800000011920929,.800000011920929,.800000011920929,1]); expect(row.oldShaderRoughness).toBe(.5); }
  expect(soft.otherGraphInputsChanged).toBe(false);
  expect(soft.physicalAssembly.actualTriangleInteriorContacts).toHaveLength(18);
  for (const row of soft.physicalAssembly.actualTriangleInteriorContacts) { expect(row.actualInteriorWitness).toHaveLength(3); expect(row.overlappingDepth).toBeGreaterThan(0); }
  expect(soft.physicalAssembly.meshBoundConnectivity.groups).toHaveLength(1);
  expect(soft.physicalAssembly.meshBoundConnectivity.groups[0]).toHaveLength(71);
  expect(soft.physicalAssembly.minCornerBounds).toEqual({min:[.09000000357627869,.11499999463558197,0],max:[.9099999666213989,.9324999451637268,1.1799999475479126]});
  expect(soft.footprintTiles).toEqual([1,1]); expect(soft.afterRenderedFromActualSavedSource).toBe(true);
  expect(soft.nativeAcceptance).toBe(false); expect(soft.protectedAfter).toEqual(soft.protectedBefore);
  expect(soft.lightingProfile).toMatchObject({engine:'CYCLES',device:'CPU',threadsMode:'FIXED',threads:1,samples:128,seed:0,
    adaptiveSampling:false,denoising:true,viewTransform:'AgX',look:'None',filmTransparent:true,dither:0,denoiser:'OPENIMAGEDENOISE',denoisingUseGpu:false});
});

it('preserves historical72 and exports genuine72 current poses with saved-source samples and four byte-exact repeats', () => {
  const history = parseObliqueModuleCatalog(json('assets/source/blender/fixture.medicine-cabinet.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('f03b6fc2d33d83c069b181073616ae95031839e130d890b9f5374cfd947be5ea');
  expect(history.frames).toHaveLength(72); expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx,catalog.nominalPixelsPerTile,catalog.pivotPx,catalog.cameraTargetTiles]).toEqual([[256,256],64,[128,128],[.5,.5,.5899999737739563]]);
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