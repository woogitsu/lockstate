import Phaser from 'phaser';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { groundToScreen, screenToGround } from '../../src/rendering/camera/oblique-projection';
import { TILE_SIZE_PX, worldToTile } from '../../src/rendering/tile-metrics';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import type { Point } from '../../src/rendering/camera/coordinates';
import { fetchObliqueModuleSet } from '../../src/rendering/assets/oblique-module-registry';

export interface ObliqueWorldHarness {
  ready(): Promise<void>;
  setPose(yawDegrees: number, elevationDegrees: number): Promise<void>;
  pointAtTile(tileX: number, tileY: number): Point;
  selected(): { readonly tileX: number; readonly tileY: number } | undefined;
  paintCounts(): { readonly ground: number; readonly raised: number };
  artTextureKeys(): readonly string[];
  loadedArtTextureCount(): number;
  artCatalogCount(): number;
  cutawayWallIds(): readonly string[];
  actorArtPosition(): Point | undefined;
  moveActorToTile(tileX: number): Promise<void>;
  cameraAngles(): { readonly yawRadians: number; readonly elevationRadians: number };
  poseChangeCount(): number;
  setRotationEnabled(enabled: boolean): void;
  hovered(): { readonly tileX: number; readonly tileY: number } | undefined;
  tileAtScreen(point: Point): { readonly tileX: number; readonly tileY: number };
  cameraTargetAndZoom(): { readonly x: number; readonly y: number; readonly zoom: number };
  stepCameraZoom(direction: 'in' | 'out'): void;
  navigateToMinimapPoint(fx: number, fy: number): boolean;
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
world.setTerrain(tile(0, 0), 'dirt');
for (let y = 2; y <= 4; y += 1) {
  for (let x = 2; x <= 4; x += 1) world.setZoning(tile(x, y), 1);
}
world.setZoning(tile(6, 2), 7);
world.setTopEdge(tile(6, 3), 2);
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
  structures: [
    { id: 'bed-1', definitionId: 'bed-wooden', tileX: 2, tileY: 2, phase: 'built' },
    { id: 'shower-1', definitionId: 'shower-head-brick', tileX: 6, tileY: 2, phase: 'built' },
  ],
  actors: [{ id: 7, assetId: 'actor.prisoner.base', tileX: 3, tileY: 3, deltaX: 0, deltaY: 0 }],
  rooms: [],
  roomConditions: [],
};
let actorTileX = 3;
let rotationEnabled = true;
let poseChangeCount = 0;
let hovered: { tileX: number; tileY: number } | undefined;

let resolveReady!: () => void;
const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
class HarnessScene extends ObliqueWorldScene {
  public override create(): void { super.create(); resolveReady(); }
}
const artCatalogs = await fetchObliqueModuleSet();
const scene = new HarnessScene({
  feed: { readFrame: () => ({ ...frame, actors: [{ ...frame.actors[0]!, tileX: actorTileX }] }) },
  artCatalogs,
  canRotate: () => rotationEnabled,
  onPoseChanged: () => { poseChangeCount += 1; },
  onGroundHover: (tile) => { hovered = tile; },
});
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'oblique-world-root',
  width: window.innerWidth,
  height: window.innerHeight,
  scene: [scene],
  backgroundColor: '#0b0e12',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false, pixelArt: false },
});

window.lockstateObliqueWorldHarness = {
  ready: () => ready,
  async setPose(yawDegrees, elevationDegrees) {
    scene.setPoseRadians(yawDegrees * Math.PI / 180, elevationDegrees * Math.PI / 180);
    await scene.ensureArtForCurrentPose();
    await new Promise<void>((resolve) => { game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()); });
  },
  pointAtTile(tileX, tileY) {
    return groundToScreen({ x: (tileX + 0.5) * TILE_SIZE_PX, y: (tileY + 0.5) * TILE_SIZE_PX }, scene.cameraPose);
  },
  selected: () => scene.selectedTile,
  paintCounts: () => scene.paintCounts,
  artTextureKeys: () => scene.artTextureKeys,
  loadedArtTextureCount: () => scene.loadedArtTextureCount,
  artCatalogCount: () => artCatalogs.size,
  cutawayWallIds: () => scene.cutawayWallIds,
  actorArtPosition: () => scene.actorArtPosition,
  cameraAngles: () => ({ yawRadians: scene.cameraPose.yawRadians, elevationRadians: scene.cameraPose.elevationRadians }),
  poseChangeCount: () => poseChangeCount,
  setRotationEnabled(enabled) { rotationEnabled = enabled; },
  hovered: () => hovered,
  tileAtScreen(point) {
    const ground = screenToGround(point, scene.cameraPose);
    return { tileX: worldToTile(ground.x), tileY: worldToTile(ground.y) };
  },
  cameraTargetAndZoom: () => ({ ...scene.cameraPose.target, zoom: scene.cameraPose.zoom }),
  stepCameraZoom: (direction) => scene.stepCameraZoom(direction),
  navigateToMinimapPoint: (fx, fy) => scene.navigateToMinimapPoint(fx, fy),
  async moveActorToTile(tileX) {
    actorTileX = tileX;
    await new Promise<void>((resolve) => { game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()); });
  },
};
