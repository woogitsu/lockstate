import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const folder = 'docs/research/2026-10-03-laundry-retained-cycles-production/';
const read = (path: string): Buffer => readFileSync(new URL(path, root));
const sha = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
const sourceSha = (body: Buffer): string => /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1] ?? sha(body);
const json = (path: string): unknown => JSON.parse(read(path).toString('utf8')) as unknown;
const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-furniture-laundry-linen-rack.v1.json'));

it('promotes the inspected genuine saved scene with retained original source and explicit bounded shader profile', () => {
  const provenance = json('assets/source/blender/furniture.laundry.linen-rack.soft-light.provenance.json') as {
    assetId: string; source: string; sourceSha256: string; retainedSource: string; retainedSourceSha256: string;
    meshCount: number; materialGraphCount: number; contactCount: number; footprintTiles: number[];
    savedCanonicalMinCornerTranslation: number[]; materialGraphsChanged: boolean;
    profile: Record<string, unknown>; nativeAcceptance: boolean;
  };
  expect(provenance.assetId).toBe('furniture.laundry.linen-rack');
  expect(catalog.source).toBe('assets/source/blender/furniture.laundry.linen-rack.soft-light.blend');
  expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe('2916717c4dd17d7be39a5725858b2356e53181cb735f2faeb28963d0adafa299');
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(sourceSha(read(catalog.source))).toBe(catalog.sourceSha256);
  expect(provenance.retainedSourceSha256).toBe('779d11f79c28b8049ccd3371d840c75b52cd153439f3882e28c593d05dd964ec');
  expect(sourceSha(read(provenance.retainedSource))).toBe(provenance.retainedSourceSha256);
  expect([provenance.meshCount, provenance.materialGraphCount, provenance.contactCount]).toEqual([111, 12, 8]);
  expect(provenance.footprintTiles).toEqual([1, 1]); expect(provenance.savedCanonicalMinCornerTranslation).toEqual([.5, .5, 0]);
  expect(provenance.materialGraphsChanged).toBe(false); expect(provenance.nativeAcceptance).toBe(false);
  expect(provenance.profile).toEqual({ engine: 'CYCLES', device: 'CPU', threads: 1, samples: 64, seed: 0,
    adaptiveSampling: false, denoising: false, viewTransform: 'AgX', groundPlaneAdded: false });
});

it('retains each historical Workbench body while consuming all genuinely produced modern poses and inspected sample bytes', () => {
  const history = parseObliqueModuleCatalog(json('assets/source/blender/furniture.laundry.linen-rack.workbench-descriptor.v1.json'));
  expect(history.sourceSha256).toBe('779d11f79c28b8049ccd3371d840c75b52cd153439f3882e28c593d05dd964ec');
  expect(history.frames).toHaveLength(72); expect(catalog.frames).toHaveLength(72);
  expect([catalog.resolutionPx, catalog.nominalPixelsPerTile, catalog.pivotPx, catalog.cameraTargetTiles]).toEqual(
    [[256, 256], 64, [128, 128], [.5, .5, .7039999961853027]]);
  for (const old of history.frames) {
    expect(sha(read('public' + old.image))).toBe(old.sha256);
    const current = catalog.frames.find(frame => frame.yawDegrees === old.yawDegrees && frame.elevationDegrees === old.elevationDegrees)!;
    expect(sha(read('public' + current.image))).toBe(current.sha256);
    expect(current.sha256).not.toBe(old.sha256);
  }
  for (const yaw of [60, 300]) {
    const selected = catalog.frames.find(frame => frame.yawDegrees === yaw && frame.elevationDegrees === 40)!;
    expect(read('public' + selected.image)).toEqual(read(`docs/research/2026-10-03-modern-retained-material-lighting/after-soft-original-materials-yaw${yaw}-elev40.png`));
  }
  const matrix = json(folder + 'actual-matrix.json') as { realRenderCount: number; frames: unknown[]; threads: number; genuineBlenderVersion: number[]; nativeAcceptance: boolean };
  expect(matrix.realRenderCount).toBe(72); expect(matrix.frames).toEqual(catalog.frames);
  expect(matrix.threads).toBe(1); expect(matrix.genuineBlenderVersion).toEqual([5, 2, 1]); expect(matrix.nativeAcceptance).toBe(false);
});

it('requires actual source/dispatch/valid-PNG/consumer omission REDs and exact restores plus four body-exact independent repeats', () => {
  const proof = json(folder + 'actual-production-controls.json') as {
    actualSavedMutantSourceSha256: string; hashValidBadPNG: { matchingDescriptorAndFilenameSHA: boolean; actualDecodedRGBA: number[]; borderPixel: number[] };
    controls: { label: string; exitCode: number; expectedFailure: string | null }[];
    protectedBefore: Record<string, string>; protectedAfter: Record<string, string>; exactRestoredFiles: number; nativeRun: boolean;
  };
  expect(proof.actualSavedMutantSourceSha256).not.toBe(catalog.sourceSha256);
  expect(proof.controls.filter(row => row.expectedFailure !== null).map(row => row.label)).toEqual([
    'actual-source-contact-RED', 'actual-producer-dispatch-RED', 'actual-hash-valid-PNG-RED',
    'actual-old-Workbench-consumer-RED', 'actual-registry-omission-RED', 'actual-context-omission-RED',
  ]);
  for (const row of proof.controls) expect(row.exitCode, row.label).toBe(row.expectedFailure === null ? 0 : 1);
  expect(proof.hashValidBadPNG).toMatchObject({ matchingDescriptorAndFilenameSHA: true, actualDecodedRGBA: [256, 256], borderPixel: [120, 90, 60, 255] });
  expect(proof.protectedAfter).toEqual(proof.protectedBefore); expect(proof.exactRestoredFiles).toBe(232); expect(proof.nativeRun).toBe(false);
  const repeats = json(folder + 'actual-four-repeats.json') as { yawDegrees: number; elevationDegrees: number; sha256: string; byteExact: boolean }[];
  expect(repeats.map(row => row.yawDegrees)).toEqual([30, 120, 210, 300]);
  for (const row of repeats) {
    expect(row.byteExact).toBe(true); expect(row.elevationDegrees).toBe(40);
    const canonical = catalog.frames.find(frame => frame.yawDegrees === row.yawDegrees && frame.elevationDegrees === row.elevationDegrees)!;
    expect(row.sha256).toBe(canonical.sha256);
    expect(read(folder + `repeat-yaw${row.yawDegrees}-elev40.png`)).toEqual(read('public' + canonical.image));
  }
});
