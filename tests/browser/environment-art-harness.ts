import Phaser from 'phaser';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { DOOR_EDGE_NUMERIC_ID, WALL_EDGE_NUMERIC_ID } from '../../src/simulation/construction/definition';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import type { RenderFeed, RenderFrame } from '../../src/rendering/feed/render-feed';
import type { RenderStructure } from '../../src/rendering/world/structures';
import type { TileLayer } from '../../src/rendering/phaser/tile-layer';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import type {
  HarnessAtlas,
  HarnessPixel,
  HarnessTileSprite,
  HarnessWorldFixture,
  LockstateEnvironmentArtHarness,
} from './environment-art-harness-api';

/**
 * The real `WorldScene`, drawing a real prison, with the real published
 * artwork, in a real browser.
 *
 * Nothing below this layer can make the claim this exists for. The sheets under
 * `/game-content/source-art/` are Git LFS content, and a checkout that has not
 * pulled them serves ~132 bytes of pointer text as `200 image/png`
 * (`docs/ART_PIPELINE.md`); **decoding is the only step that can tell the
 * difference, and only a browser decodes.** On top of that, `vitest.config.ts`
 * runs in `environment: 'node'` with no jsdom, so a canvas, `createImageBitmap`
 * and a WebGL frame are all unreachable from the unit suite -- which is exactly
 * where the cutting, the packing and the drawing happen. Everything that can be
 * decided without pixels is decided in
 * `tests/unit/environment-art.test.ts` instead.
 *
 * The world is built by the simulation's own `SparseWorld` and snapshotted the
 * way the worker does, rather than hand-written as a projection: a fixture that
 * invented the projection could agree with a renderer that read it wrongly.
 *
 * No actor atlases are loaded. They are 16.9 MB that nothing here asserts, and
 * the scene's contract is that a failed art load leaves a playable world -- so
 * the harness rejects that batch deliberately and records what the scene did
 * with the rejection.
 */

const CANVAS_PARENT_ID = 'environment-art-harness-root';

const CHUNK_SIZE_TILES = 8;
const FIXTURE: HarnessWorldFixture = {
  chunkSizeTiles: CHUNK_SIZE_TILES,
  tileSizePx: TILE_SIZE_PX,
  // A four-by-three room, walled along its northern row, with a door in that
  // wall and one segment of west wall.
  zonedMinTileX: 2,
  zonedMinTileY: 2,
  zonedMaxTileX: 5,
  zonedMaxTileY: 4,
  wallRowTileY: 2,
  doorTileX: 4,
  doorRowTileY: 2,
  westWallTileX: 2,
  westWallTileY: 3,
  builtWallTileX: 2,
  builtWallTileY: 2,
  // 1x2 tiles of bare owned ground east of the room, clear of every wall.
  bedTileX: 6,
  bedTileY: 4,
  // One tile of bare owned ground, clear of the bed and of every wall.
  toiletTileX: 8,
  toiletTileY: 4,
  // 2x1 tiles of bare owned ground, clear of the bed, the toilet and every
  // wall. #1020's second rendered-art row.
  benchTileX: 10,
  benchTileY: 4,
  deskTileX: 13,
  deskTileY: 4,
  showerTileX: 16,
  showerTileY: 4,
  wasteBinTileX: 18,
  wasteBinTileY: 4,
  storageRackTileX: 20,
  storageRackTileY: 4,
  chairTileX: 22,
  chairTileY: 4,
  diningTableTileX: 24,
  diningTableTileY: 4,
  medicalBedTileX: 28,
  medicalBedTileY: 4,
  medicineCabinetTileX: 30,
  medicineCabinetTileY: 4,
  stoveTileX: 32,
  stoveTileY: 4,
  washingMachineTileX: 34,
  washingMachineTileY: 4,
  prepCounterTileX: 38,
  prepCounterTileY: 4,
  bookshelfTileX: 40,
  bookshelfTileY: 4,
};

function memoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

function buildFrame(): RenderFrame {
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  const world = new SparseWorld(CHUNK_SIZE_TILES);
  world.load(chunk);
  world.setOwned(chunk, true);

  const room = defaultRoomContentRegistry.all()[0];
  if (room === undefined) throw new Error('The room catalog is empty, so nothing can be zoned.');

  for (let tileY = FIXTURE.zonedMinTileY; tileY <= FIXTURE.zonedMaxTileY; tileY += 1) {
    for (let tileX = FIXTURE.zonedMinTileX; tileX <= FIXTURE.zonedMaxTileX; tileX += 1) {
      world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, room.numericId);
    }
  }
  for (let tileX = FIXTURE.zonedMinTileX; tileX <= FIXTURE.zonedMaxTileX; tileX += 1) {
    world.setTopEdge(
      { x: tileCoordinate(tileX), y: tileCoordinate(FIXTURE.wallRowTileY) },
      tileX === FIXTURE.doorTileX ? DOOR_EDGE_NUMERIC_ID : WALL_EDGE_NUMERIC_ID,
    );
  }
  world.setLeftEdge(
    { x: tileCoordinate(FIXTURE.westWallTileX), y: tileCoordinate(FIXTURE.westWallTileY) },
    WALL_EDGE_NUMERIC_ID,
  );

  /*
   * One finished wall order, on a tile whose north edge the world already
   * carries. That pair is the real shipped state -- `finalizeConstruction`
   * writes the edge and leaves the order in the construction snapshot as
   * `completed` -- and it is what made a finished wall reach the painter twice,
   * once as an edge bar a fifth of a tile deep and once as a full-tile block.
   */
  const structures: readonly RenderStructure[] = [
    {
      id: 'finished-wall',
      definitionId: 'wall-brick',
      tileX: FIXTURE.builtWallTileX,
      tileY: FIXTURE.builtWallTileY,
      phase: 'built',
    },
    /*
     * One finished bed, as a build order and nothing else, because that is the
     * only way an object reaches the renderer: `structuresFromConstruction`
     * projects the construction snapshot and the world's tile layers carry no
     * furniture at all. `bed-wooden` rather than `object.bed` for the same
     * reason -- an order carries the *buildable* id, and `catalogueObjectId`
     * is the step that turns it into the catalogued object the artwork is
     * keyed by. A fixture that named `object.bed` here would test a path no
     * player can produce.
     */
    {
      id: 'finished-bed',
      definitionId: 'bed-wooden',
      tileX: FIXTURE.bedTileX,
      tileY: FIXTURE.bedTileY,
      phase: 'built',
    },
    /*
     * One finished toilet, the first object drawn from ADR 0100's second
     * publishing lane rather than from an owner sheet -- `toilet-brick` is
     * the buildable a build order carries, `object.toilet` is what the
     * catalog and `SPRITE_BY_OBJECT_ID` are keyed by, and `catalogueObjectId`
     * is the same step that turns one into the other for the bed above.
     */
    {
      id: 'finished-toilet',
      definitionId: 'toilet-brick',
      tileX: FIXTURE.toiletTileX,
      tileY: FIXTURE.toiletTileY,
      phase: 'built',
    },
    /*
     * The second and third objects wired from ADR 0100's second publishing
     * lane (#1020): a bench and a desk, each 2x1, both rendered rather than
     * cut from an owner sheet.
     */
    {
      id: 'finished-bench',
      definitionId: 'bench-wooden',
      tileX: FIXTURE.benchTileX,
      tileY: FIXTURE.benchTileY,
      phase: 'built',
    },
    {
      id: 'finished-desk',
      definitionId: 'desk-wooden',
      tileX: FIXTURE.deskTileX,
      tileY: FIXTURE.deskTileY,
      phase: 'built',
    },
    {
      id: 'finished-shower-head',
      definitionId: 'shower-head-brick',
      tileX: FIXTURE.showerTileX,
      tileY: FIXTURE.showerTileY,
      phase: 'built',
    },
    {
      id: 'finished-waste-bin',
      definitionId: 'waste-bin-brick',
      tileX: FIXTURE.wasteBinTileX,
      tileY: FIXTURE.wasteBinTileY,
      phase: 'built',
    },
    {
      id: 'finished-storage-rack',
      definitionId: 'storage-rack-wooden',
      tileX: FIXTURE.storageRackTileX,
      tileY: FIXTURE.storageRackTileY,
      phase: 'built',
    },
    {
      id: 'finished-chair',
      definitionId: 'chair-wooden',
      tileX: FIXTURE.chairTileX,
      tileY: FIXTURE.chairTileY,
      phase: 'built',
    },
    {
      id: 'finished-dining-table',
      definitionId: 'dining-table-wooden',
      tileX: FIXTURE.diningTableTileX,
      tileY: FIXTURE.diningTableTileY,
      phase: 'built',
    },
    {
      id: 'finished-medical-bed',
      definitionId: 'medical-bed-wooden',
      tileX: FIXTURE.medicalBedTileX,
      tileY: FIXTURE.medicalBedTileY,
      phase: 'built',
    },
    {
      id: 'finished-medicine-cabinet',
      definitionId: 'medicine-cabinet-wooden',
      tileX: FIXTURE.medicineCabinetTileX,
      tileY: FIXTURE.medicineCabinetTileY,
      phase: 'built',
    },
    {
      id: 'finished-stove',
      definitionId: 'stove-brick',
      tileX: FIXTURE.stoveTileX,
      tileY: FIXTURE.stoveTileY,
      phase: 'built',
    },
    {
      id: 'finished-washing-machine',
      definitionId: 'washing-machine-brick',
      tileX: FIXTURE.washingMachineTileX,
      tileY: FIXTURE.washingMachineTileY,
      phase: 'built',
    },
    {
      id: 'finished-prep-counter',
      definitionId: 'prep-counter-brick',
      tileX: FIXTURE.prepCounterTileX,
      tileY: FIXTURE.prepCounterTileY,
      phase: 'built',
    },
    {
      id: 'finished-bookshelf',
      definitionId: 'bookshelf-wooden',
      tileX: FIXTURE.bookshelfTileX,
      tileY: FIXTURE.bookshelfTileY,
      phase: 'built',
    },
  ];

  return {
    revision: 1,
    world: WorldRenderView.fromSnapshot(world.snapshot()),
    structures,
    actors: [],
    rooms: [],
    roomConditions: [],
  };
}

const frame = buildFrame();
const feed: RenderFeed = { readFrame: () => frame };

const errors: string[] = [];

const scene = new WorldScene({
  feed,
  keyValueStore: memoryStore(),
  loadAtlasLibrary: () => Promise.reject(new Error('the environment-art harness loads no actor atlases')),
  onError: (error) => {
    errors.push(error.message);
  },
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: CANVAS_PARENT_ID,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0b0e12',
  scene: [scene],
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
});

/** The scene keeps its layers private, which is correct; the cast is confined here. */
interface SceneInternals {
  readonly tiles: TileLayer | undefined;
}
const internals = scene as unknown as SceneInternals;

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

const ready = new Promise<void>((resolve) => {
  const poll = (): void => {
    if (scene.sys?.isActive() === true) {
      resolve();
      return;
    }
    requestAnimationFrame(poll);
  };
  poll();
});

/**
 * Polled rather than hooked, for the reason `world-scene-harness.ts` gives
 * about `CREATE`: there is no event to subscribe to that is not already a race
 * with the boot. The scene starts its art load from `create` and swallows a
 * failure into `onError`, so this watches both outcomes.
 */
const artLoaded = ready.then(
  () =>
    new Promise<void>((resolve, reject) => {
      const poll = (): void => {
        if (internals.tiles?.environmentArt !== undefined) {
          resolve();
          return;
        }
        const failure = errors.find((message) => !message.includes('actor atlases'));
        if (failure !== undefined) {
          reject(new Error(failure));
          return;
        }
        requestAnimationFrame(poll);
      };
      poll();
    }),
);

function atlas(): HarnessAtlas | undefined {
  const key = internals.tiles?.environmentArt?.textureKey;
  if (key === undefined || !scene.textures.exists(key)) return undefined;
  const texture = scene.textures.get(key);
  const source = texture.source[0];
  return {
    textureKey: key,
    widthPx: source?.width ?? 0,
    heightPx: source?.height ?? 0,
    frameNames: [...texture.getFrameNames(true)].sort(),
  };
}

function atlasPixel(x: number, y: number): HarnessPixel | undefined {
  const key = internals.tiles?.environmentArt?.textureKey;
  if (key === undefined) return undefined;
  const texture = scene.textures.get(key);
  if (!(texture instanceof Phaser.Textures.CanvasTexture)) return undefined;
  // `getPixel` reads a cached `ImageData` that is captured when the texture is
  // created and refreshed only by `update()`. The packer draws into the context
  // afterwards and calls `refresh()`, which uploads to the GPU and leaves that
  // cache alone -- so without this every reading would be the transparent
  // canvas the texture started as, and the assertion would be measuring
  // nothing. Expensive, and this is a harness.
  texture.update();
  const colour = texture.getPixel(x, y);
  return colour === null ? undefined : [colour.red, colour.green, colour.blue, colour.alpha];
}

function tileSprites(): readonly HarnessTileSprite[] {
  const found: HarnessTileSprite[] = [];
  for (const child of scene.children.list) {
    if (!(child instanceof Phaser.GameObjects.TileSprite)) continue;
    if (!child.visible) continue;
    found.push({
      frameName: String(child.frame.name),
      x: child.x,
      y: child.y,
      width: child.width,
      height: child.height,
      tileScaleX: child.tileScaleX,
      tileScaleY: child.tileScaleY,
      depth: child.depth,
    });
  }
  found.sort((a, b) => a.y - b.y || a.x - b.x || (a.frameName < b.frameName ? -1 : 1));
  return found;
}

const harness: LockstateEnvironmentArtHarness = {
  ready,
  artLoaded,
  fixture: FIXTURE,
  atlas,
  atlasFrame: (name) => {
    const key = internals.tiles?.environmentArt?.textureKey;
    if (key === undefined || !scene.textures.exists(key)) return undefined;
    const texture = scene.textures.get(key);
    if (!texture.has(name)) return undefined;
    const frame = texture.get(name);
    return { x: frame.cutX, y: frame.cutY, width: frame.cutWidth, height: frame.cutHeight };
  },
  atlasPixel,
  tileSprites,
  centreCameraOn: async (worldX, worldY) => {
    scene.cameras.main.setZoom(1);
    scene.cameras.main.centerOn(worldX, worldY);
    // Two frames: one for the camera matrix `preRender` rebuilds, one for the
    // frame drawn with it.
    await nextFrame();
    await nextFrame();
  },
  /**
   * The colour of the exact centre of the drawing buffer.
   *
   * The centre and not an arbitrary point on purpose. Converting a world
   * position into a drawing-buffer pixel means getting the camera transform,
   * the device pixel ratio and the renderer's Y direction all right, and each
   * of those is a chance to measure the wrong pixel and report it confidently.
   * The centre of the buffer is the centre whatever the ratio and whichever way
   * up the snapshot is, so pointing the camera is the whole of the aiming.
   */
  centrePixel: () =>
    new Promise((resolve) => {
      game.renderer.snapshotPixel(game.canvas.width / 2, game.canvas.height / 2, (colour) => {
        const value = colour as Phaser.Display.Color;
        resolve([value.red, value.green, value.blue, value.alpha]);
      });
    }),
  errors: () => [...errors],
  removeArt: () => {
    internals.tiles?.setEnvironmentArt(undefined);
  },
};

window.lockstateEnvironmentArtHarness = harness;
