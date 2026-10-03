import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const folder = 'docs/research/2026-10-03-modern-retained-material-lighting/';
const read = (path: string): Buffer => readFileSync(new URL(path, root));
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const sourceSha = (bytes: Buffer): string => /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(bytes.toString('utf8'))?.[1] ?? sha(bytes);
interface Frame { stage: string; yaw: number; elevation: number; image: string; sha256: string; byteExactPublishedWorkbench?: boolean }
interface Normal { minimumOutwardNormalDistance: number; [key: string]: unknown }
interface Physical {
  meshCount: number; rawMeshes: unknown[]; evaluatedPositions: Record<string, string>;
  completeStoredMaterialGraphs: unknown[]; evaluatedNormals: Normal[]; actualContacts: unknown[];
}
const proof = JSON.parse(read(folder + 'actual-before-after.json').toString('utf8')) as {
  draftScene: string; draftSceneSha256: string; retainedSource: string; retainedSourceSha256: string;
  frames: Frame[]; physicalAssembly: Physical; meshCount: number; materialGraphCount: number; contactCount: number;
  actualNominalPixelsPerTile: number; cameraTargetTiles: number[]; orthoScaleTiles: number;
  protectedBefore: Record<string, string>; protectedAfter: Record<string, string>;
  originalMaterialGraphsMutated: boolean; full72Run: boolean; productionDispatchChanged: boolean; nativeAcceptance: boolean;
};

function decodeCanonicalRGBA(path: string): Buffer {
  const bytes = read(path); expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[24], bytes[25]]).toEqual([256, 256, 8, 6]);
  const data: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), kind = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (kind === 'IDAT') data.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(data)); expect(rows.length).toBe(256 * 1025);
  const rgba = Buffer.alloc(256 * 1024); let occupied = 0;
  for (let y = 0; y < 256; y++) {
    expect(rows[y * 1025], 'existing canonical PNG normalizer writes unfiltered rows').toBe(0);
    const row = rows.subarray(y * 1025 + 1, (y + 1) * 1025); row.copy(rgba, y * 1024);
    for (let x = 0; x < 256; x++) {
      const alpha = row[x * 4 + 3]!;
      if (x === 0 || x === 255 || y === 0 || y === 255) expect(alpha).toBe(0);
      if (alpha > 0) occupied++;
    }
  }
  expect(occupied, 'retained existing source PNG visibility guard').toBeGreaterThan(500);
  return rgba;
}

it('pins genuine saved draft and every retained mesh/full graph/contact with unchanged canonical world scale', () => {
  expect(proof.retainedSourceSha256).toBe('779d11f79c28b8049ccd3371d840c75b52cd153439f3882e28c593d05dd964ec');
  expect(sourceSha(read(proof.retainedSource))).toBe(proof.retainedSourceSha256);
  expect(proof.draftSceneSha256).toBe('2916717c4dd17d7be39a5725858b2356e53181cb735f2faeb28963d0adafa299');
  expect(sourceSha(read(proof.draftScene))).toBe(proof.draftSceneSha256);
  const original = JSON.parse(read('assets/source/blender/furniture.laundry.linen-rack.provenance.json').toString('utf8')) as {
    allAuthoredRawMeshes: unknown[]; retainedStoredMaterialGraphs: unknown[]; authoredEvaluatedNormals: Normal[];
  };
  expect(proof.physicalAssembly.rawMeshes).toEqual(original.allAuthoredRawMeshes);
  expect(proof.physicalAssembly.completeStoredMaterialGraphs).toEqual(original.retainedStoredMaterialGraphs);
  // The existing shared export translates source vertices(+.5,+.5,0).
  // Direction/topology counts stay exact; floating signed distance can differ at1e-7 after that translation.
  const withoutDistance = ({ minimumOutwardNormalDistance: _distance, ...record }: Normal) => record;
  expect(proof.physicalAssembly.evaluatedNormals.map(withoutDistance)).toEqual(original.authoredEvaluatedNormals.map(withoutDistance));
  proof.physicalAssembly.evaluatedNormals.forEach((row, index) => {
    expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);
    expect(row.minimumOutwardNormalDistance).toBeCloseTo(original.authoredEvaluatedNormals[index]!.minimumOutwardNormalDistance, 6);
  });
  expect(proof.physicalAssembly.rawMeshes).toHaveLength(111);
  expect(proof.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(12);
  expect(proof.physicalAssembly.actualContacts).toHaveLength(8);
  expect([proof.meshCount, proof.materialGraphCount, proof.contactCount]).toEqual([111, 12, 8]);
  expect([proof.actualNominalPixelsPerTile, proof.orthoScaleTiles]).toEqual([64, 4]);
  expect(proof.cameraTargetTiles).toEqual([.5, .5, .7039999961853027]);
  expect(proof.protectedAfter).toEqual(proof.protectedBefore);
  expect([proof.originalMaterialGraphsMutated, proof.full72Run, proof.productionDispatchChanged, proof.nativeAcceptance]).toEqual([false, false, false, false]);
});

it('compares actual canonical before bodies with published output and genuine shader-light after bodies', () => {
  expect(proof.frames).toHaveLength(4);
  const descriptor = JSON.parse(read('assets/source/blender/furniture.laundry.linen-rack.workbench-descriptor.v1.json').toString('utf8')) as {
    frames: { yawDegrees: number; elevationDegrees: number; image: string; sha256: string }[];
  };
  for (const frame of proof.frames) { expect(sha(read(frame.image))).toBe(frame.sha256); decodeCanonicalRGBA(frame.image); }
  for (const yaw of [60, 300]) {
    const before = proof.frames.find(frame => frame.stage === 'before-workbench' && frame.yaw === yaw)!;
    const after = proof.frames.find(frame => frame.stage === 'after-soft-original-materials' && frame.yaw === yaw)!;
    const published = descriptor.frames.find(frame => frame.yawDegrees === yaw && frame.elevationDegrees === 40)!;
    expect(before.byteExactPublishedWorkbench).toBe(true);
    expect(before.sha256).toBe(published.sha256); expect(read(before.image)).toEqual(read('public' + published.image));
    expect(decodeCanonicalRGBA(after.image).equals(decodeCanonicalRGBA(before.image))).toBe(false);
  }
});

it('requires genuine saved-source semantic RED controls, exact byte restoration and one repeat sample', () => {
  const controls = JSON.parse(read(folder + 'actual-saved-draft-controls.json').toString('utf8')) as {
    controls: { name: string; actualSavedMutantSha256: string; red: {exitCode:number}; green: {exitCode:number}; draftSourceRestoredSha256:string }[];
    protectedBefore: Record<string, string>; protectedAfter: Record<string, string>; protectedCount: number;
    repeatPNGByteExact: boolean; exactBytesRestored: boolean;
  };
  expect(controls.controls.map(row => row.name)).toEqual(['saved-linen-disconnected', 'saved-key-light-omitted', 'saved-camera-span-halved']);
  for (const control of controls.controls) {
    expect(control.actualSavedMutantSha256).not.toBe(proof.draftSceneSha256);
    expect(control.red.exitCode).toBe(1); expect(control.green.exitCode).toBe(0);
    expect(control.draftSourceRestoredSha256).toBe(proof.draftSceneSha256);
  }
  expect(controls.protectedAfter).toEqual(controls.protectedBefore);
  expect(controls.protectedCount).toBe(86); expect(controls.exactBytesRestored).toBe(true);
  const repeat = JSON.parse(read(folder + 'actual-repeat60.json').toString('utf8')) as {frames: Frame[]};
  expect(repeat.frames).toHaveLength(1); expect(controls.repeatPNGByteExact).toBe(true);
  const first = proof.frames.find(frame => frame.stage === 'after-soft-original-materials' && frame.yaw === 60)!;
  expect(repeat.frames[0]!.sha256).toBe(first.sha256); expect(read(repeat.frames[0]!.image)).toEqual(read(first.image));
});
