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
  pointAtGround(tileX: number, tileY: number): Point;
  selected(): { readonly tileX: number; readonly tileY: number } | undefined;
  paintCounts(): { readonly ground: number; readonly raised: number };
  groundArtPaintCount(): number;
  groundArtImageCount(): number;
  projectedGroundTileCount(): number;
  paintedGroundTileCount(): number;
  visibleUncachedGroundObjectCount(): number;
  raisedArtImageCount(): number;
  projectedRaisedObjectCount(): number;
  visibleUncachedRaisedObjectCount(): number;
  visibleViewportCompositeCount(): number;
  canvasAntialiasEnabled(): boolean;
  estimatedTextureBytes(): number;
  artTextureKeys(): readonly string[];
  loadedArtTextureCount(): number;
  artCatalogCount(): number;
  artErrors(): readonly string[];
  cutawayWallIds(): readonly string[];
  actorArtPosition(): Point | undefined;
  moveActorToTile(tileX: number): Promise<void>;
  cameraAngles(): { readonly yawRadians: number; readonly elevationRadians: number };
  poseChangeCount(): number;
  setRotationEnabled(enabled: boolean): void;
  setBuildGrid(active: boolean): void;
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
const largeStress = new URL(window.location.href).searchParams.has('large-stress');
const world = new SparseWorld(largeStress ? 32 : 8);
const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
world.load(origin);
world.setOwned(origin, true);
for (let y = 0; y < 8; y += 1) {
  for (let x = 0; x < 8; x += 1) world.setTerrain(tile(x, y), 'concrete');
}
world.setTerrain(tile(0, 0), 'dirt');
world.setTerrain(tile(1, 0), 'dirt');
world.setTerrain(tile(6, 6), 'dirt');
world.setTerrain(tile(7, 6), 'dirt');
world.setTerrain(tile(0, 1), 'grass');
if (new URL(window.location.href).searchParams.has('ground-stress')) {
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) world.setTerrain(tile(x, y), 'dirt');
}
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
// The existing top edge at (4,5) meets the west wall on both sides at (5,5).
// The edge at (2,5) meets only the northern west segment at (3,4).
world.setLeftEdge(tile(5, 5), 1);
world.setLeftEdge(tile(3, 4), 1);
const largeBeds: RenderFrame['structures'][number][] = [];
if (largeStress) {
  for (let chunkY = 0; chunkY < 2; chunkY += 1) for (let chunkX = 0; chunkX < 2; chunkX += 1) {
    if (chunkX === 0 && chunkY === 0) continue;
    const position = { x: chunkCoordinate(chunkX), y: chunkCoordinate(chunkY) };
    world.load(position);
    world.setOwned(position, true);
  }
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) world.setTerrain(tile(x, y), 'dirt');
  for (let y = 8; y <= 50; y += 6) for (let x = 8; x <= 50; x += 6) {
    for (let offset = 0; offset < 5; offset += 1) {
      world.setTopEdge(tile(x + offset, y), 1);
      world.setTopEdge(tile(x + offset, y + 4), 1);
      world.setLeftEdge(tile(x, y + offset), 1);
      world.setLeftEdge(tile(x + 4, y + offset), 1);
    }
    for (let dy = 1; dy < 4; dy += 1) for (let dx = 1; dx < 4; dx += 1) {
      world.setZoning(tile(x + dx, y + dy), 1);
    }
    largeBeds.push({ id: `stress-bed-${x}-${y}`, definitionId: 'bed-wooden', tileX: x + 2, tileY: y + 2, phase: 'built' });
  }
}
const frame: RenderFrame = {
  revision: 1,
  world: WorldRenderView.fromSnapshot(world.snapshot()),
  structures: [
    { id: 'bed-1', definitionId: 'bed-wooden', tileX: 2, tileY: 2, phase: 'built' },
    { id: 'sink-1', definitionId: 'object.sink', tileX: 3, tileY: 2, phase: 'built' },
    { id: 'waste-bin-1', definitionId: 'object.waste-bin', tileX: 4, tileY: 2, phase: 'built' },
    { id: 'dining-table-1', definitionId: 'dining-table-wooden', tileX: 1, tileY: 6, phase: 'built' },
    { id: 'bench-1', definitionId: 'bench-wooden', tileX: 5, tileY: 6, phase: 'built' },
    { id: 'prep-counter-1', definitionId: 'prep-counter-brick', tileX: 5, tileY: 7, phase: 'built' },
    { id: 'stove-1', definitionId: 'stove-brick', tileX: 5, tileY: 8, phase: 'built' },
    { id: 'fridge-1', definitionId: 'fridge-brick', tileX: 7, tileY: 8, phase: 'built' },
    { id: 'shower-1', definitionId: 'shower-head-brick', tileX: 6, tileY: 2, phase: 'built' },
    ...largeBeds,
  ],
  actors: [{ id: 7, assetId: 'actor.prisoner.base', tileX: largeStress ? 33 : 3, tileY: largeStress ? 33 : 3, deltaX: 0, deltaY: 0 }],
  rooms: [],
  roomConditions: [],
};
let actorTileX = largeStress ? 33 : 3;
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
  render: { antialias: true, antialiasGL: false, roundPixels: false, pixelArt: false },
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
  pointAtGround(tileX, tileY) {
    return groundToScreen({ x: tileX * TILE_SIZE_PX, y: tileY * TILE_SIZE_PX }, scene.cameraPose);
  },
  selected: () => scene.selectedTile,
  paintCounts: () => scene.paintCounts,
  groundArtPaintCount: () => scene.groundArtPaintCount,
  groundArtImageCount: () => scene.groundArtImageCount,
  projectedGroundTileCount: () => scene.projectedGroundTileCount,
  paintedGroundTileCount: () => scene.paintedGroundTileCount,
  visibleUncachedGroundObjectCount: () => scene.visibleUncachedGroundObjectCount,
  raisedArtImageCount: () => scene.raisedArtImageCount,
  projectedRaisedObjectCount: () => scene.projectedRaisedObjectCount,
  visibleUncachedRaisedObjectCount: () => scene.visibleUncachedRaisedObjectCount,
  visibleViewportCompositeCount: () => scene.visibleViewportCompositeCount,
  canvasAntialiasEnabled: () => (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl.getContextAttributes()?.antialias ?? false,
  estimatedTextureBytes: () => {
    const loaded = new Set<string>();
    let bytes = scene.cameraPose.viewport.width * scene.cameraPose.viewport.height * 4 * 3;
    for (const catalog of artCatalogs.values()) for (const artFrame of catalog.frames) {
      if (loaded.has(artFrame.image) || !scene.textures.exists(artFrame.image)) continue;
      loaded.add(artFrame.image);
      bytes += catalog.resolutionPx[0] * catalog.resolutionPx[1] * 4;
    }
    return bytes;
  },
  artTextureKeys: () => scene.artTextureKeys,
  loadedArtTextureCount: () => scene.loadedArtTextureCount,
  artCatalogCount: () => artCatalogs.size,
  artErrors: () => scene.artErrors,
  cutawayWallIds: () => scene.cutawayWallIds,
  actorArtPosition: () => scene.actorArtPosition,
  cameraAngles: () => ({ yawRadians: scene.cameraPose.yawRadians, elevationRadians: scene.cameraPose.elevationRadians }),
  poseChangeCount: () => poseChangeCount,
  setRotationEnabled(enabled) { rotationEnabled = enabled; },
  setBuildGrid(active) { scene.setGroundGridEmphasis(active); },
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
