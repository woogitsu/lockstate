import Phaser from 'phaser';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { groundToScreen } from '../../src/rendering/camera/oblique-projection';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import type { Point } from '../../src/rendering/camera/coordinates';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { resolveObliqueCatalogs } from '../../src/rendering/scene/oblique-composition-adapter';

export interface MedicalObliqueInspection {
  readonly objectId: 'object.medical-bed' | 'object.medicine-cabinet';
  readonly assetId: string | undefined;
  readonly footprint: { readonly width: number; readonly height: number };
}

export interface ObliqueWorldHarness {
  ready(): Promise<void>;
  registryStatus(): 'loaded' | 'missing';
  registryError(): string | undefined;
  furnitureSpriteFrame(id: string): string | undefined;
  setPose(yawDegrees: number, elevationDegrees: number): Promise<void>;
  pointAtTile(tileX: number, tileY: number): Point;
  selected(): { readonly tileX: number; readonly tileY: number } | undefined;
  paintCounts(): { readonly ground: number; readonly raised: number };
  medicalObliqueInspection(): readonly MedicalObliqueInspection[];
}

declare global {
  interface Window { lockstateObliqueWorldHarness: ObliqueWorldHarness; }
}

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const world = new SparseWorld(8);
const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
world.load(origin);
world.setOwned(origin, true);
for (let y = 0; y < 8; y += 1) {
  for (let x = 0; x < 8; x += 1) world.setTerrain(tile(x, y), 'concrete');
}
for (let x = 1; x <= 4; x += 1) {
  world.setTopEdge(tile(x, 1), 1);
  world.setTopEdge(tile(x, 5), x === 3 ? 2 : 1);
}
for (let y = 1; y <= 4; y += 1) {
  world.setLeftEdge(tile(1, y), 1);
  world.setLeftEdge(tile(5, y), 1);
}
const frame: RenderFrame = {
  revision: 1,
  world: WorldRenderView.fromSnapshot(world.snapshot()),
  structures: [{ id: 'medical-bed-1', definitionId: 'medical-bed-wooden', objectId: 'object.medical-bed', tileX: 2, tileY: 2, phase: 'built' }],
  actors: [{ id: 7, assetId: 'actor.prisoner', tileX: 3, tileY: 3, deltaX: 0, deltaY: 0 }],
  rooms: [],
  roomConditions: [],
};

let resolveReady!: () => void;
const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
class HarnessScene extends ObliqueWorldScene {
  public override create(): void { super.create(); resolveReady(); }
}
let scene!: HarnessScene;
let game!: Phaser.Game;
let registryState: 'loaded' | 'missing' = 'missing';
let registryFailure: string | undefined;
let sceneReadyFailure: string | undefined;
let resolveBootstrap!: () => void;
const bootstrapReady = new Promise<void>((resolve) => { resolveBootstrap = resolve; });
void (async () => {
  let catalogs: ReadonlyMap<string, import('../../src/rendering/assets/oblique-module-catalog').ObliqueModuleCatalog> = new Map();
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('oblique registry timeout after 10000ms')), 10_000));
    catalogs = (await Promise.race([resolveObliqueCatalogs(true), timeout])) ?? new Map();
    registryState = 'loaded';
  } catch (error) {
    registryFailure = error instanceof Error ? error.message : String(error);
  }
  scene = new HarnessScene({ feed: { readFrame: () => frame }, obliqueCatalogs: catalogs });
  game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'oblique-world-root',
  width: window.innerWidth,
  height: window.innerHeight,
  scene: [scene],
  backgroundColor: '#0b0e12',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false, pixelArt: false },
  });
  try { await scene.ready(); } catch (error) { sceneReadyFailure = error instanceof Error ? error.message : String(error); registryFailure ??= sceneReadyFailure; }
  resolveBootstrap();
})();

window.lockstateObliqueWorldHarness = {
  ready: async () => { await bootstrapReady; await ready; if (registryFailure !== undefined) throw new Error(`Oblique harness bootstrap failed: ${registryFailure}`); await scene.ready(); },
  registryStatus: () => registryState,
  registryError: () => registryFailure,
  furnitureSpriteFrame: (id) => scene.furnitureSpriteFrame(id),
  async setPose(yawDegrees, elevationDegrees) {
    scene.setPoseRadians(yawDegrees * Math.PI / 180, elevationDegrees * Math.PI / 180);
    await new Promise<void>((resolve) => { game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()); });
  },
  pointAtTile(tileX, tileY) {
    return groundToScreen({ x: (tileX + 0.5) * TILE_SIZE_PX, y: (tileY + 0.5) * TILE_SIZE_PX }, scene.cameraPose);
  },
  selected: () => scene.selectedTile,
  paintCounts: () => scene.paintCounts,
  medicalObliqueInspection: () => (['object.medical-bed', 'object.medicine-cabinet'] as const).map((objectId) => {
    const definition = defaultObjectRegistry.getById(objectId);
    if (definition === undefined) throw new Error(`Missing medical object ${objectId}`);
    return { objectId, assetId: obliqueAssetIdForObject(objectId), footprint: definition.footprint };
  }),
};

