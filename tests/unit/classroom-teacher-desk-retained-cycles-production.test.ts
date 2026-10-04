import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root = new URL('../../', import.meta.url);
const folder = 'docs/research/2026-10-04-classroom-teacher-desk-retained-cycles/';
const read = (path: string): Buffer => readFileSync(new URL(path, root));
const hash = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
const sourceHash = (body: Buffer): string => /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1] ?? hash(body);
const json = (path: string): unknown => JSON.parse(read(path).toString('utf8')) as unknown;
const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-furniture-classroom-teacher-desk.v1.json'));
type Graph = {name:string;diffuse:number[];roughness:number;canonicalMaterialSha256?:string;nodes:{type:string;inputs:{name:string;value:unknown}[]}[]};
type Receipt = {
  source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string;literalGraphSource:string;literalGraphSourceSha256:string;
  physicalAssembly:{meshCount:number;rawMeshes:unknown[];completeStoredMaterialGraphs:Graph[];
    actualInteriorContacts:{partA:string;partB:string;actualTriangleInteriorWitness:number[]}[];minCornerBounds:{min:number[];max:number[]}};
  literalStoredGraphs:Graph[];exactRepairSockets:string[];materialGraphsChanged:boolean;
  originalMaterialAudit:{name:string;shaderBaseColor:number[];shaderRoughness:number;shaderMetallic:number}[];
  repairedMaterialAudit:{name:string;diffuseRGBA:number[];shaderBaseColor:number[];viewportRoughnessProperty:number;shaderRoughness:number;shaderMetallic:number}[];
  footprintTiles:number[];canonicalMinCornerTranslation:number[];lightingProfile:Record<string,unknown>;protectedBefore:unknown;protectedAfter:unknown;
};
it('retains all133 parts/55 real contacts and permits only the twelve explicitly authored BaseRGBA/Roughness socket repairs', () => {
  const soft = json('assets/source/blender/furniture.classroom.teacher-desk.soft-light.provenance.json') as Receipt;
  const old = json('assets/source/blender/furniture.classroom.teacher-desk.provenance.json') as {allAuthoredRawMeshes:unknown[];retainedStoredMaterialGraphs:Graph[];actualContactPairs:string[][];actualTriangleInteriorContacts:{partA:string;partB:string;actualTriangleInteriorWitness:number[]}[]};
  expect(catalog.source).toBe('assets/source/blender/furniture.classroom.teacher-desk.soft-light.blend');
  expect(catalog.sourceSha256).toBe('a879bba0f04a4f8b08a66fb9e607d1d815a7a6c2a8f7cb84c1d20c7c0d26d376');
  expect(sourceHash(read(soft.source))).toBe(catalog.sourceSha256);expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(soft.retainedSourceSha256).toBe('c1dd80d253667f8e1bca5b17371b183ec18b5a292bebdf9fd2062e85b01d55ff');expect(sourceHash(read(soft.retainedSource))).toBe(soft.retainedSourceSha256);
  expect(sourceHash(read(soft.literalGraphSource))).toBe(soft.literalGraphSourceSha256);
  expect(soft.physicalAssembly.meshCount).toBe(133);expect(soft.physicalAssembly.rawMeshes).toEqual(old.allAuthoredRawMeshes);
  expect(soft.literalStoredGraphs).toEqual(old.retainedStoredMaterialGraphs);expect(soft.literalStoredGraphs).toHaveLength(6);
  const expectedGraphs = structuredClone(soft.literalStoredGraphs);
  for (const graph of expectedGraphs) {delete graph.canonicalMaterialSha256;for (const node of graph.nodes) if (node.type === 'ShaderNodeBsdfPrincipled') for (const socket of node.inputs) {
    if (socket.name === 'Base Color') socket.value = graph.diffuse;
    if (socket.name === 'Roughness') socket.value = graph.roughness;
  }}
  const actualGraphs = structuredClone(soft.physicalAssembly.completeStoredMaterialGraphs);for (const graph of actualGraphs) delete graph.canonicalMaterialSha256;
  expect(actualGraphs).toEqual(expectedGraphs);expect(soft.exactRepairSockets).toEqual(['Base Color','Roughness']);expect(soft.materialGraphsChanged).toBe(true);
  expect(soft.physicalAssembly.actualInteriorContacts).toHaveLength(55);
  expect(soft.physicalAssembly.actualInteriorContacts.map(row => [row.partA,row.partB])).toEqual(old.actualContactPairs);
  for (const [index,row] of soft.physicalAssembly.actualInteriorContacts.entries()) {
    const retained = old.actualTriangleInteriorContacts[index]!;
    expect(row.actualTriangleInteriorWitness[0]).toBeCloseTo(retained.actualTriangleInteriorWitness[0]!+1,6);
    expect(row.actualTriangleInteriorWitness[1]).toBeCloseTo(retained.actualTriangleInteriorWitness[1]!+.5,6);
    expect(row.actualTriangleInteriorWitness[2]).toBeCloseTo(retained.actualTriangleInteriorWitness[2]!,6);
  }
  expect(soft.physicalAssembly.minCornerBounds).toEqual({min:[.0899999737739563,.08000001311302185,0],max:[1.9100000858306885,.92249995470047,1.2699999809265137]});
  expect(soft.footprintTiles).toEqual([2,1]);expect(soft.canonicalMinCornerTranslation).toEqual([1,.5,0]);
  for (const row of soft.originalMaterialAudit) {expect(row.shaderBaseColor).toEqual([.800000011920929,.800000011920929,.800000011920929,1]);expect(row.shaderRoughness).toBe(.5);expect(row.shaderMetallic).toBe(0);}
  for (const row of soft.repairedMaterialAudit) {expect(row.shaderBaseColor).toEqual(row.diffuseRGBA);expect(row.shaderRoughness).toBe(row.viewportRoughnessProperty);expect(row.shaderMetallic).toBe(0);}
  expect(soft.repairedMaterialAudit.map(row => [row.name,row.shaderRoughness])).toEqual([['monitor display',.25],['paper',.7799999713897705],['powder coated steel',.47999998927116394],['teal drawer label',.5699999928474426],['warm oak laminate',.5699999928474426],['worktop edging',.5699999928474426]]);
  expect(soft.lightingProfile).toMatchObject({engine:'CYCLES',device:'CPU',threadsMode:'FIXED',threads:1,samples:64,seed:0,adaptiveSampling:false,denoising:false,viewTransform:'AgX',filmTransparent:true});
  expect(soft.protectedAfter).toEqual(soft.protectedBefore);
});
it('preserves old72 and requires genuine saved repaired72 plus four exact independent renders', () => {
  const history = parseObliqueModuleCatalog(json('assets/source/blender/furniture.classroom.teacher-desk.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('c1dd80d253667f8e1bca5b17371b183ec18b5a292bebdf9fd2062e85b01d55ff');expect(history.frames).toHaveLength(72);expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx,catalog.nominalPixelsPerTile,catalog.pivotPx,catalog.cameraTargetTiles]).toEqual([[256,256],64,[128,128],[1,.5,.6349999904632568]]);
  for (const frame of history.frames) {
    expect(hash(read('public'+frame.image))).toBe(frame.sha256);const current = catalog.frames.find(row => row.yawDegrees === frame.yawDegrees && row.elevationDegrees === frame.elevationDegrees)!;
    expect(hash(read('public'+current.image))).toBe(current.sha256);expect(current.sha256).not.toBe(frame.sha256);
  }
  for (const yaw of [60,300]) {const current = catalog.frames.find(row => row.yawDegrees === yaw && row.elevationDegrees === 40)!;expect(read('public'+current.image)).toEqual(read(folder+`after-soft-original-materials-yaw${yaw}-elev40.png`));}
  const matrix = json(folder+'actual-matrix.json') as {realRenderCount:number;frames:unknown[];threads:number;genuineBlenderVersion:number[];nativeAcceptance:boolean};
  expect(matrix.realRenderCount).toBe(72);expect(matrix.frames).toEqual(catalog.frames);expect(matrix.threads).toBe(1);expect(matrix.genuineBlenderVersion).toEqual([5,2,1]);expect(matrix.nativeAcceptance).toBe(false);
  const repeats = json(folder+'actual-four-repeats.json') as {yawDegrees:number;elevationDegrees:number;sha256:string;byteExact:boolean}[];
  expect(repeats.map(row => row.yawDegrees)).toEqual([30,120,210,300]);
  for (const row of repeats) {expect(row.byteExact).toBe(true);const current = catalog.frames.find(frame => frame.yawDegrees === row.yawDegrees && frame.elevationDegrees === row.elevationDegrees)!;expect(row.sha256).toBe(current.sha256);expect(read(folder+`repeat-yaw${row.yawDegrees}-elev40.png`)).toEqual(read('public'+current.image));}
});
it('requires real saved contact/authored-shader/light/dispatch/image/consumer/registry/callback REDs and exact restore', () => {
  const proof = json(folder+'actual-production-controls.json') as {actualSavedMutantSourceSha256:string;actualSavedAuthoredInputMutantSourceSha256:string;actualSavedLightMutantSourceSha256:string;controls:{label:string;exitCode:number;expectedFailure:string|null}[];protectedBefore:Record<string,string>;protectedAfter:Record<string,string>;exactRestoredFiles:number;nativeRun:boolean;hashValidBadPNG:unknown};
  for (const sha of [proof.actualSavedMutantSourceSha256,proof.actualSavedAuthoredInputMutantSourceSha256,proof.actualSavedLightMutantSourceSha256]) expect(sha).not.toBe(catalog.sourceSha256);
  expect(proof.controls.filter(row => row.expectedFailure !== null).map(row => row.label)).toEqual(['actual-source-contact-RED','actual-source-authored-input-RED','actual-source-light-RED','actual-producer-dispatch-RED','actual-hash-valid-PNG-RED','actual-old-Workbench-consumer-RED','actual-registry-omission-RED','actual-canonical-callback-RED']);
  for (const row of proof.controls) expect(row.exitCode,row.label).toBe(row.expectedFailure === null ? 0 : 1);
  expect(proof.protectedAfter).toEqual(proof.protectedBefore);expect(proof.exactRestoredFiles).toBe(Object.keys(proof.protectedBefore).length);expect(proof.exactRestoredFiles).toBeGreaterThan(640);expect(proof.nativeRun).toBe(false);
  expect(proof.hashValidBadPNG).toMatchObject({matchingDescriptorAndFilenameSHA:true,actualDecodedRGBA:[256,256]});
});
