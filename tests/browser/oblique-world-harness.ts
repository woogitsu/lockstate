import Phaser from 'phaser';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { groundToScreen } from '../../src/rendering/camera/oblique-projection';
import { projectedWallPrism } from '../../src/rendering/camera/oblique-geometry';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import type { Point } from '../../src/rendering/camera/coordinates';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import type { SquareTarget } from '../../src/rendering/build/square-picking';

export interface MedicalObliqueInspection {
  readonly objectId: 'object.medical-bed' | 'object.medicine-cabinet';
  readonly assetId: string | undefined;
  readonly footprint: { readonly width: number; readonly height: number };
}

export interface ObliqueWorldHarness {
  ready(): Promise<void>;
  setPose(yawDegrees: number, elevationDegrees: number): Promise<void>;
  pointAtTile(tileX: number, tileY: number): Point;
  selected(): { readonly tileX: number; readonly tileY: number } | undefined;
  paintCounts(): { readonly ground: number; readonly raised: number };
  medicalObliqueInspection(): readonly MedicalObliqueInspection[];
  setCellInterior(enabled: boolean): Promise<void>;
  wallClip(tileX: number, tileY: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  armSquareBuild(armed: boolean): void;
  targetSquares(): readonly SquareTarget[] | undefined;
  placedSquares(): readonly (readonly SquareTarget[])[];
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
world.setSquareStructure(tile(3, 2), 1);
world.setSquareStructure(tile(3, 4), 1);
let frame: RenderFrame = {
  revision: 1,
  world: WorldRenderView.fromSnapshot(world.snapshot()),
  structures: [
    { id: 'bed-1', definitionId: 'bed-wooden', tileX: 2, tileY: 2, phase: 'built' },
    { id: 'toilet-1', definitionId: 'object.toilet', tileX: 4, tileY: 3, phase: 'built' },
  ],
  actors: [{ id: 7, assetId: 'actor.prisoner', tileX: 3, tileY: 3, deltaX: 0, deltaY: 0 }],
  rooms: [],
  roomConditions: [],
};

let resolveReady!: () => void;
const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
let buildArmed = false;
let buildTarget: readonly SquareTarget[] | undefined;
const buildPlacements: (readonly SquareTarget[])[] = [];
class HarnessScene extends ObliqueWorldScene {
  public override create(): void { super.create(); resolveReady(); }
}
const scene = new HarnessScene({
  feed: { readFrame: () => frame },
  keyValueStore: { getItem: () => null, setItem: () => {} },
  buildTool: {
    isArmed: () => buildArmed,
    usesSquareFootprint: () => true,
    place: () => { throw new Error('Square Build sent an edge gesture'); },
    placeSquares: (squares) => { buildPlacements.push([...squares]); },
    targetSquares: (squares) => { buildTarget = squares === undefined ? undefined : [...squares]; },
  },
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
  armSquareBuild(armed) { buildArmed = armed; },
  targetSquares: () => buildTarget,
  placedSquares: () => buildPlacements,
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
  async setCellInterior(enabled) {
    frame = { ...frame, revision: frame.revision + 1, rooms: enabled
      ? [{ instanceId: 'cell:3:3', roomCatalogId: 'room.cell', anchorTileX: 3, anchorTileY: 3, width: 1, height: 1 }]
      : [] };
    await new Promise<void>((resolve) => { game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()); });
  },
  wallClip(tileX, tileY) {
    const prism = projectedWallPrism(tileX, tileY, 1.2, scene.cameraPose);
    const points = [...prism.footprint, ...prism.top];
    const x = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x)) - 6));
    const y = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y)) - 6));
    const right = Math.min(window.innerWidth, Math.ceil(Math.max(...points.map((point) => point.x)) + 6));
    const bottom = Math.min(window.innerHeight, Math.ceil(Math.max(...points.map((point) => point.y)) + 6));
    return { x, y, width: right - x, height: bottom - y };
  },
};
