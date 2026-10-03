import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const folder = 'docs/research/2026-10-03-modern-square-wall-material-study/';
const read = (path: string): Buffer => readFileSync(new URL(path, root));
const sha = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
const sourceSha = (body: Buffer): string => /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1] ?? sha(body);
interface Material { nodes: { type: string; inputs: { name: string; value: unknown }[] }[] }
interface Physical { meshCount: number; rawMeshes: unknown[]; completeStoredMaterialGraphs: Material[];
  geometricNormals: { inwardPolygons: number; minimumOutwardDistance: number }[]; bounds: { min: number[]; max: number[] } }
interface Frame { stage: string; yawDegrees: number; elevationDegrees: number; image: string; sha256: string; byteExactPublishedWorkbench?: boolean }
interface Receipt { source: string; sourceSha256: string; draftScene: string; draftSceneSha256: string;
  physicalAssembly: Physical; directionalProfile: { engine: string; device: string; threads: number; samples: number;
    lights: { type: string; energy: number; angleRadians: number }[] };
  cameraTargetTiles: number[]; orthoScaleTiles: number; nominalPixelsPerTile: number; frames: Frame[];
  protectedBefore: Record<string, string>; protectedAfter: Record<string, string>; originalMaterialGraphsMutated: boolean;
  full72Run: boolean; runtimeDispatchChanged: boolean; nativeAcceptance: boolean; floorArtProducerChanged: boolean }
const proof = JSON.parse(read(folder + 'actual-before-after.json').toString('utf8')) as Receipt;

function decodeCanonical(path: string): void {
  const bytes = read(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[24], bytes[25]]).toEqual([512, 512, 8, 6]);
  const data: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.subarray(offset + 4, offset + 8).toString('ascii') === 'IDAT') data.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(data)); expect(rows.length).toBe(512 * 2049);
  let occupied = 0;
  for (let y = 0; y < 512; y++) {
    expect(rows[y * 2049]).toBe(0);
    for (let x = 0; x < 512; x++) {
      const alpha = rows[y * 2049 + 1 + x * 4 + 3]!;
      if (x === 0 || x === 511 || y === 0 || y === 511) expect(alpha).toBe(0);
      if (alpha !== 0) occupied++;
    }
  }
  expect(occupied).toBeGreaterThan(0);
}

it('pins the genuine retained59part/9graph wall, original palette mismatch and whole tile camera', () => {
  expect(proof.sourceSha256).toBe('c73fcc00471682135b53049e0b74f1d71588909b245bfeac0cac6cd93d696ae1');
  expect(sourceSha(read(proof.source))).toBe(proof.sourceSha256);
  expect(proof.draftSceneSha256).toBe('1e49a5e3113f37e501ae25037db40f09d7b3634396e5bd7da406b48fd222506a');
  expect(sourceSha(read(proof.draftScene))).toBe(proof.draftSceneSha256);
  const audit = JSON.parse(read(folder + 'actual-retained-source-audit.json').toString('utf8')) as {
    rawMeshes: unknown[]; completeStoredMaterialGraphs: Material[]; usedMaterials: { diffuseRGBA: number[] }[];
  };
  expect(proof.physicalAssembly.meshCount).toBe(59); expect(proof.physicalAssembly.rawMeshes).toEqual(audit.rawMeshes);
  expect(proof.physicalAssembly.completeStoredMaterialGraphs).toEqual(audit.completeStoredMaterialGraphs);
  expect(audit.completeStoredMaterialGraphs).toHaveLength(9);
  expect(new Set(audit.usedMaterials.map(row => JSON.stringify(row.diffuseRGBA))).size).toBe(9);
  for (const material of audit.completeStoredMaterialGraphs) {
    const shader = material.nodes.find(node => node.type === 'ShaderNodeBsdfPrincipled')!;
    expect(shader.inputs.find(input => input.name === 'Base Color')!.value).toEqual([0.800000011920929, 0.800000011920929, 0.800000011920929, 1]);
    expect(shader.inputs.find(input => input.name === 'Roughness')!.value).toBe(.5);
  }
  for (const row of proof.physicalAssembly.geometricNormals) { expect(row.inwardPolygons).toBe(0); expect(row.minimumOutwardDistance).toBeGreaterThan(0); }
  proof.physicalAssembly.bounds.min.forEach(value => expect(value).toBeCloseTo(0, 6));
  proof.physicalAssembly.bounds.max.forEach((value, axis) => expect(value).toBeCloseTo([1, 1, .75][axis]!, 6));
  expect([proof.cameraTargetTiles, proof.orthoScaleTiles, proof.nominalPixelsPerTile]).toEqual([[.5, .5, 0], 8, 64]);
  expect(proof.directionalProfile).toMatchObject({ engine: 'CYCLES', device: 'CPU', threads: 1, samples: 64 });
  expect(proof.directionalProfile.lights).toHaveLength(1);
  expect(proof.directionalProfile.lights[0]).toMatchObject({ type: 'SUN', energy: 2 });
  expect(proof.directionalProfile.lights[0]!.angleRadians).toBeCloseTo(20 * Math.PI / 180, 6);
  expect(proof.protectedAfter).toEqual(proof.protectedBefore);
  expect([proof.originalMaterialGraphsMutated, proof.full72Run, proof.runtimeDispatchChanged,
    proof.nativeAcceptance, proof.floorArtProducerChanged]).toEqual([false, false, false, false, false]);
});

it('compares two genuine canonical poses while keeping all released wall descriptors and72 bodies intact', () => {
  const catalog = parseObliqueModuleCatalog(JSON.parse(read('public/game-content/oblique-square-brick-full-wall.v1.json').toString('utf8')) as unknown);
  expect(catalog.sourceSha256).toBe(proof.sourceSha256); expect(catalog.frames).toHaveLength(72);
  expect(proof.frames).toHaveLength(4);
  for (const frame of proof.frames) { expect(sha(read(frame.image))).toBe(frame.sha256); decodeCanonical(frame.image); }
  for (const yaw of [-45, 135]) {
    const before = proof.frames.find(row => row.stage === 'before-workbench' && row.yawDegrees === yaw)!;
    const after = proof.frames.find(row => row.stage === 'after-cycles-literal-graphs' && row.yawDegrees === yaw)!;
    const published = catalog.frames.find(row => row.yawDegrees === yaw && row.elevationDegrees === 45)!;
    expect(before.byteExactPublishedWorkbench).toBe(true); expect(before.sha256).toBe(published.sha256);
    expect(read(before.image)).toEqual(read('public' + published.image)); expect(after.sha256).not.toBe(before.sha256);
  }
});

it('requires actual saved-source geometry/light/camera REDs, exact restores and one genuine saved-scene repeat', () => {
  const controls = JSON.parse(read(folder + 'actual-saved-draft-controls.json').toString('utf8')) as {
    controls: { name: string; actualSavedMutantSha256: string; red: { exitCode: number }; green: { exitCode: number }; restoredSourceSha256: string }[];
    protectedBefore: Record<string, string>; protectedAfter: Record<string, string>; protectedCount: number;
    repeatPNGByteExact: boolean; exactBytesRestored: boolean;
  };
  expect(controls.controls.map(row => row.name)).toEqual(['saved-cap-displaced', 'saved-directional-key-omitted', 'saved-camera-span-halved']);
  for (const control of controls.controls) {
    expect(control.actualSavedMutantSha256).not.toBe(proof.draftSceneSha256);
    expect(control.red.exitCode).toBe(1); expect(control.green.exitCode).toBe(0);
    expect(control.restoredSourceSha256).toBe(proof.draftSceneSha256);
  }
  expect(controls.protectedAfter).toEqual(controls.protectedBefore); expect(controls.protectedCount).toBe(2641);
  expect(controls.exactBytesRestored).toBe(true); expect(controls.repeatPNGByteExact).toBe(true);
  const repeat = JSON.parse(read(folder + 'actual-saved-repeat.json').toString('utf8')) as Frame;
  const original = proof.frames.find(row => row.stage === 'after-cycles-literal-graphs' && row.yawDegrees === -45)!;
  expect(repeat.sha256).toBe(original.sha256); expect(read(repeat.image)).toEqual(read(original.image));
});
