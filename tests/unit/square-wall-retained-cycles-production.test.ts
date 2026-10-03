import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { projectObliqueWorldFrame, type ObliqueSolid } from '../../src/rendering/camera/oblique-world-projection';
import { projectedTileQuad } from '../../src/rendering/camera/oblique-geometry';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';

const root = new URL('../../', import.meta.url);
const read = (path: string): Buffer => readFileSync(new URL(path, root));
const sha = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
const sourceSha = (body: Buffer): string => /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(body.toString('utf8'))?.[1] ?? sha(body);
const json = (path: string): unknown => JSON.parse(read(path).toString('utf8')) as unknown;
const folder = 'docs/research/2026-10-03-modern-square-wall-material-study/';

it('existing full square wall consumers require the approved-material source at both real canonical yaws and whole footprint', () => {
  const world = new SparseWorld(8);
  world.setSquareStructure({ x: tileCoordinate(3), y: tileCoordinate(3) }, 1);
  const frame: RenderFrame = { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()), structures: [], actors: [], rooms: [], roomConditions: [] };
  const registry = parseObliqueModuleRegistry(json('public/game-content/oblique-module-registry.v1.json'));
  for (const yaw of [-45, 135]) {
    const camera = { target: { x: 3 * 64, y: 3 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 1,
      yawRadians: yaw * Math.PI / 180, elevationRadians: Math.PI / 4 };
    const wall = projectObliqueWorldFrame(frame, camera).raised.find((row): row is ObliqueSolid => row.kind === 'structure' && row.id === 'square-wall:3:3')!;
    expect(wall.assetId).toBe('wall.square.brick.full');
    expect(wall.kind).toBe('structure');
    expect(wall.footprint).toEqual(projectedTileQuad(3, 3, camera));
    const entry = registry.entries.find(row => row.assetId === wall.assetId)!;
    expect(entry).toBeDefined();
    const catalog = parseObliqueModuleCatalog(json('public' + entry.manifest));
    expect(catalog.sourceSha256, 'current world selected the old flat material presentation').toBe('53c35a0013a93ed662983a2888031c8377ba1965981e3ef98757e20547bd9cd8');
    expect(catalog.source).toBe('wall.square.brick.full.soft-light.blend');
    expect(sourceSha(read('assets/source/blender/' + catalog.source))).toBe(catalog.sourceSha256);
    const selected = selectObliqueModuleFrame(catalog, camera);
    expect([selected.yawDegrees, selected.elevationDegrees]).toEqual([yaw, 45]);
    expect(sha(read('public' + selected.image))).toBe(selected.sha256);
    expect(read('public' + selected.image)).toEqual(read(folder + `after-cycles-approved-materials-yaw${yaw >= 0 ? '+' : ''}${yaw}-elev45.png`));
  }
});

it('retains original full source and all historical72 frames while publishing the actual new72 and four exact repeats', () => {
  const history = parseObliqueModuleCatalog(json('assets/source/blender/wall.square.brick.full.workbench-descriptor.v1.json'));
  const current = parseObliqueModuleCatalog(json('public/game-content/oblique-square-brick-full-wall.v1.json'));
  expect(history.sourceSha256).toBe('c73fcc00471682135b53049e0b74f1d71588909b245bfeac0cac6cd93d696ae1');
  expect(sourceSha(read('assets/source/blender/' + history.source))).toBe(history.sourceSha256);
  expect(history.frames).toHaveLength(72); expect(current.frames).toHaveLength(72);
  expect(current.sourceDependencies).toEqual([{ source: history.source, sha256: history.sourceSha256 }]);
  for (const frame of history.frames) expect(sha(read('public' + frame.image))).toBe(frame.sha256);
  for (const frame of current.frames) expect(sha(read('public' + frame.image))).toBe(frame.sha256);
  const matrix = json(folder + 'actual-production-matrix.json') as {
    realRenderCount: number; frames: unknown[]; genuineBlenderVersion: number[]; threads: number; nativeAcceptance: boolean;
  };
  expect(matrix.realRenderCount).toBe(72); expect(matrix.frames).toEqual(current.frames);
  expect(matrix.genuineBlenderVersion).toEqual([5, 2, 1]); expect(matrix.threads).toBe(1); expect(matrix.nativeAcceptance).toBe(false);
  const repeat = json(folder + 'actual-production-four-repeats.json') as {
    frames: { yawDegrees: number; elevationDegrees: number; image: string; sha256: string; byteExact: boolean }[];
  };
  expect(repeat.frames.map(row => row.yawDegrees)).toEqual([-135, -45, 45, 135]);
  for (const frame of repeat.frames) {
    const canonical = current.frames.find(row => row.yawDegrees === frame.yawDegrees && row.elevationDegrees === frame.elevationDegrees)!;
    expect(frame.byteExact).toBe(true); expect(frame.sha256).toBe(canonical.sha256);
    expect(read(frame.image)).toEqual(read('public' + canonical.image));
  }
});

it('requires genuine semantic/dispatch/hash-valid-PNG/world consumer negatives and exact restoration', () => {
  const proof = json(folder + 'actual-production-controls.json') as {
    controls: { name: string; exitCode: number }[]; actualSavedMutantSourceSha256: string;
    hashValidBadPNG: { matchingDescriptorAndFilenameSHA: boolean; actualDecodedRGBA: number[]; borderPixel: number[] };
    protectedBefore: Record<string, string>; protectedAfter: Record<string, string>; protectedCount: number; exactBytesRestored: boolean; nativeRun: boolean;
  };
  expect(proof.controls.filter(row => row.name.endsWith('RED')).map(row => row.name)).toEqual([
    'production-source-semantic-RED', 'production-dispatch-RED', 'production-hash-valid-PNG-RED',
    'production-old-Workbench-consumer-RED', 'production-registry-omission-RED', 'production-built-square-selector-RED',
  ]);
  for (const row of proof.controls) expect(row.exitCode, row.name).toBe(row.name.endsWith('RED') ? 1 : 0);
  expect(proof.actualSavedMutantSourceSha256).not.toBe('53c35a0013a93ed662983a2888031c8377ba1965981e3ef98757e20547bd9cd8');
  expect(proof.hashValidBadPNG).toMatchObject({ matchingDescriptorAndFilenameSHA: true, actualDecodedRGBA: [512, 512], borderPixel: [120, 90, 60, 255] });
  expect(proof.protectedAfter).toEqual(proof.protectedBefore); expect(proof.protectedCount).toBe(2713);
  expect(proof.exactBytesRestored).toBe(true); expect(proof.nativeRun).toBe(false);
  for (const path of ['src/rendering/assets/oblique-object-mapping.ts', 'src/rendering/world/appearance.ts',
    'src/rendering/camera/oblique-world-projection.ts', 'src/content/room-catalog.ts',
    'public/game-content/oblique-module-registry.v1.json', 'assets/source/blender/wall.square.brick.low.blend']) {
    expect(sha(read(path))).toBe(proof.protectedBefore[path]);
  }
});
