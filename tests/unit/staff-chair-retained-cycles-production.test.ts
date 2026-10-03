import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const folder = 'docs/research/2026-10-03-staff-chair-retained-cycles/';
const read = (path: string): Buffer => readFileSync(new URL(path, root));
const sha = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
const sourceSha = (body: Buffer): string => /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1] ?? sha(body);
const json = (path: string): unknown => JSON.parse(read(path).toString('utf8')) as unknown;
const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-furniture-staff-room-padded-chair.v1.json'));

it('retains all54 meshes/four full material graphs/three pad contacts with the exact inspected bounded lighting profile', () => {
  const provenance = json('assets/source/blender/furniture.staff-room.padded-chair.soft-light.provenance.json') as {
    assetId: string; source: string; sourceSha256: string; retainedSource: string; retainedSourceSha256: string;
    footprintTiles: number[]; canonicalMinCornerTranslation: number[]; sourceLightingChangesGeometryOrMaterials: boolean;
    physicalAssembly: { meshCount: number; rawMeshes: unknown[]; completeStoredMaterialGraphs: unknown[]; actualContacts: unknown[] };
    lightingProfile: { lights: { name: string; energy: number; size: number }[]; [key: string]: unknown };
    nativeAcceptance: boolean; groundPlaneAdded: boolean;
  };
  expect(catalog.assetId).toBe('furniture.staff-room.padded-chair'); expect(provenance.assetId).toBe(catalog.assetId);
  expect(catalog.source).toBe('assets/source/blender/furniture.staff-room.padded-chair.soft-light.blend');
  expect(catalog.source).toBe(provenance.source); expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.sourceSha256).toBe('2dde0a33689685fd067c124c82b7b88b31c606d6c950a0789903e1b0b4b0e934');
  expect(sourceSha(read(catalog.source))).toBe(catalog.sourceSha256);
  expect(provenance.retainedSourceSha256).toBe('47004797588d92173e4140bc307ac3db73ed322ac2e1d2472f99c10475956109');
  expect(sourceSha(read(provenance.retainedSource))).toBe(provenance.retainedSourceSha256);
  const old = json('assets/source/blender/furniture.staff-room.padded-chair.provenance.json') as { allAuthoredRawMeshes: unknown[]; retainedStoredMaterialGraphs: unknown[] };
  expect(provenance.physicalAssembly.meshCount).toBe(54); expect(provenance.physicalAssembly.rawMeshes).toEqual(old.allAuthoredRawMeshes);
  expect(provenance.physicalAssembly.completeStoredMaterialGraphs).toEqual(old.retainedStoredMaterialGraphs);
  expect(provenance.physicalAssembly.completeStoredMaterialGraphs).toHaveLength(4); expect(provenance.physicalAssembly.actualContacts).toHaveLength(3);
  expect(provenance.footprintTiles).toEqual([1, 1]); expect(provenance.canonicalMinCornerTranslation).toEqual([.5, .5, 0]);
  expect(provenance.sourceLightingChangesGeometryOrMaterials).toBe(false); expect(provenance.nativeAcceptance).toBe(false); expect(provenance.groundPlaneAdded).toBe(false);
  expect(provenance.lightingProfile).toMatchObject({ engine: 'CYCLES', device: 'CPU', threadsMode: 'FIXED', threads: 1,
    samples: 64, seed: 0, animatedSeed: false, adaptiveSampling: false, denoising: false, maxBounces: 8, diffuseBounces: 4,
    glossyBounces: 4, viewTransform: 'AgX', look: 'None', exposure: 0, gamma: 1, filmTransparent: true, dither: 0,
    imageSettings: ['PNG', 'RGBA', '8', 15], worldStrength: .25 });
  expect(provenance.lightingProfile.lights.map(row => [row.name, row.energy, row.size])).toEqual([
    ['Modern draft broad rear rim', 300, 3], ['Modern draft soft neutral fill', 180, 5], ['Modern draft soft warm key', 450, 4],
  ]);
});

it('retains every historical72 frame and reproduces inspected genuine source60/300 sample bytes in the new72 matrix', () => {
  const history = parseObliqueModuleCatalog(json('assets/source/blender/furniture.staff-room.padded-chair.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('47004797588d92173e4140bc307ac3db73ed322ac2e1d2472f99c10475956109');
  expect(history.frames).toHaveLength(72); expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx, catalog.nominalPixelsPerTile, catalog.pivotPx, catalog.cameraTargetTiles]).toEqual(
    [[256, 256], 64, [128, 128], [.5, .5, .6600000262260437]]);
  for (const old of history.frames) {
    expect(sha(read('public' + old.image))).toBe(old.sha256);
    const current = catalog.frames.find(frame => frame.yawDegrees === old.yawDegrees && frame.elevationDegrees === old.elevationDegrees)!;
    expect(sha(read('public' + current.image))).toBe(current.sha256); expect(current.sha256).not.toBe(old.sha256);
  }
  for (const yaw of [60, 300]) {
    const selected = catalog.frames.find(frame => frame.yawDegrees === yaw && frame.elevationDegrees === 40)!;
    expect(read('public' + selected.image)).toEqual(read(folder + `after-soft-materials-yaw${yaw}-elev40.png`));
  }
  const proof = json(folder + 'actual-before-after.json') as { physicalBeforeExactlyEqualsAfter: boolean; protectedBefore: unknown; protectedAfter: unknown };
  expect(proof.physicalBeforeExactlyEqualsAfter).toBe(true); expect(proof.protectedAfter).toEqual(proof.protectedBefore);
  const matrix = json(folder + 'actual-matrix.json') as { realRenderCount: number; frames: unknown[]; threads: number; genuineBlenderVersion: number[]; nativeAcceptance: boolean };
  expect(matrix.realRenderCount).toBe(72); expect(matrix.frames).toEqual(catalog.frames); expect(matrix.threads).toBe(1);
  expect(matrix.genuineBlenderVersion).toEqual([5, 2, 1]); expect(matrix.nativeAcceptance).toBe(false);
});

it('requires actual saved-source/dispatch/validPNG/context/registry REDs and exact restore plus four independent exact repeats', () => {
  const proof = json(folder + 'actual-production-controls.json') as {
    actualSavedMutantSourceSha256: string; hashValidBadPNG: { matchingDescriptorAndFilenameSHA: boolean; actualDecodedRGBA: number[] };
    controls: { label: string; exitCode: number; expectedFailure: string | null }[];
    protectedBefore: Record<string, string>; protectedAfter: Record<string, string>; exactRestoredFiles: number; nativeRun: boolean;
  };
  expect(proof.actualSavedMutantSourceSha256).not.toBe(catalog.sourceSha256);
  expect(proof.controls.filter(row => row.expectedFailure !== null).map(row => row.label)).toEqual([
    'actual-source-contact-RED', 'actual-producer-dispatch-RED', 'actual-hash-valid-PNG-RED',
    'actual-old-Workbench-consumer-RED', 'actual-registry-omission-RED', 'actual-context-omission-RED',
  ]);
  for (const row of proof.controls) expect(row.exitCode, row.label).toBe(row.expectedFailure === null ? 0 : 1);
  expect(proof.hashValidBadPNG).toMatchObject({ matchingDescriptorAndFilenameSHA: true, actualDecodedRGBA: [256, 256] });
  expect(proof.protectedAfter).toEqual(proof.protectedBefore); expect(proof.exactRestoredFiles).toBe(Object.keys(proof.protectedBefore).length);
  expect(proof.exactRestoredFiles).toBeGreaterThanOrEqual(230); expect(proof.nativeRun).toBe(false);
  const repeats = json(folder + 'actual-four-repeats.json') as { yawDegrees: number; elevationDegrees: number; sha256: string; byteExact: boolean }[];
  expect(repeats.map(row => row.yawDegrees)).toEqual([30, 120, 210, 300]);
  for (const row of repeats) {
    expect(row.byteExact).toBe(true); expect(row.elevationDegrees).toBe(40);
    const canonical = catalog.frames.find(frame => frame.yawDegrees === row.yawDegrees && frame.elevationDegrees === row.elevationDegrees)!;
    expect(row.sha256).toBe(canonical.sha256);
    expect(read(folder + `repeat-yaw${row.yawDegrees}-elev40.png`)).toEqual(read('public' + canonical.image));
  }
});
