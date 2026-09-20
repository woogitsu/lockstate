import Phaser from 'phaser';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';
import type { RenderFeed, RenderFrame } from '../../src/rendering/feed/render-feed';
import type { RoomLabelLayer } from '../../src/rendering/phaser/room-label-layer';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import type { RenderStructure } from '../../src/rendering/world/structures';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import type {
  HarnessFixtureRoom,
  HarnessRoomFixture,
  HarnessRoomLabel,
  LockstateRoomLabelHarness,
} from './room-label-harness-api';

/**
 * The real `WorldScene` writing real room names over a real prison, in a real
 * browser.
 *
 * ## Why a browser is the only place this can be settled
 *
 * Everything about *where* a name goes is arithmetic and lives in
 * `tests/unit/rendering-room-labels.test.ts`. Two things are not:
 *
 * 1. **How wide a name is.** It is a font laying out a string in a canvas, and
 *    `vitest.config.ts` runs in `environment: 'node'` with no jsdom, so there
 *    is no `measureText` below this layer at all. The whole zoom rule --
 *    `roomLabelFits` -- is a comparison against that width, so a suite that
 *    could not measure it could only test the rule against a number it made up.
 * 2. **That the name survives the camera.** The name is held at a constant
 *    *screen* size by scaling it by the reciprocal of the camera zoom, and the
 *    claim that this actually produces one size across `ZOOM_BOUNDS` is a claim
 *    about a live Phaser camera matrix. That is the same reason
 *    `camera-harness.ts` exists (#115).
 *
 * ## The fixture, and why each room is in it
 *
 * The world is a real `SparseWorld`, zoned through the simulation's own
 * `setZoning` and snapshotted the way the worker snapshots it, then projected by
 * the production `WorldRenderView.fromSnapshot` -- for the reason
 * `environment-art-harness.ts` states: a fixture that invented the projection
 * could agree with a renderer that read it wrongly.
 *
 * No atlases are loaded, actor or environment. The names have to be legible
 * over the coloured blocks the layer falls back to as well as over artwork, and
 * loading the sheets would make every assertion here depend on the Git LFS
 * state of the checkout.
 */

const CANVAS_PARENT_ID = 'room-label-harness-root';
const CHUNK_SIZE_TILES = 8;

/** Four chunks, so the fixture can put a room across both boundaries. */
const CHUNKS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/*
 * The page's own localizer, built exactly as `src/main.ts` builds it -- same
 * locale, same merged catalogue. Not `defaultLocaleEnCatalog` on its own: that
 * is content's half, and `src/main.ts` records why the application needs the
 * merged one. A harness formatting through a different catalogue than the game
 * could pass on a key the game would paint raw.
 */
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

function nameOf(roomId: string): string {
  const definition = defaultRoomContentRegistry.getById(roomId);
  if (definition === undefined) throw new Error(`The room catalogue has no ${roomId}.`);
  return localizer.format(definition.nameKey);
}

function numericIdOf(roomId: string): number {
  const definition = defaultRoomContentRegistry.getById(roomId);
  if (definition === undefined) throw new Error(`The room catalogue has no ${roomId}.`);
  return definition.numericId;
}

const ROOMS: readonly HarnessFixtureRoom[] = [
  {
    note: 'One half of the pair the play-test measured at 0.23 sigma apart -- the reason this feature exists.',
    roomId: 'room.reception',
    expectedName: nameOf('room.reception'),
    minTileX: 1,
    minTileY: 1,
    maxTileX: 6,
    maxTileY: 4,
  },
  {
    note: 'The other half of that pair, beside it, so one screenshot holds both.',
    roomId: 'room.kitchen',
    expectedName: nameOf('room.kitchen'),
    minTileX: 9,
    minTileY: 1,
    maxTileX: 14,
    maxTileY: 4,
  },
  {
    note: 'Straddles BOTH chunk boundaries (x=8 and y=8), so it is the artefact ADR 0098 option C priced.',
    roomId: 'room.canteen',
    expectedName: nameOf('room.canteen'),
    minTileX: 5,
    minTileY: 6,
    maxTileX: 10,
    maxTileY: 9,
  },
  {
    note: 'Adjacent to the next room and of the same type, so the two are one region and share one name.',
    roomId: 'room.cell',
    expectedName: nameOf('room.cell'),
    minTileX: 1,
    minTileY: 11,
    maxTileX: 3,
    maxTileY: 13,
  },
  {
    note: 'The second of that pair. A player reads one Cell across both, which is true of every tile it covers.',
    roomId: 'room.cell',
    expectedName: nameOf('room.cell'),
    minTileX: 4,
    minTileY: 11,
    maxTileX: 6,
    maxTileY: 13,
  },
  {
    note: 'The longest name the catalogue carries in English, so the worst-case width is measured and not guessed.',
    roomId: 'room.security-office',
    expectedName: nameOf('room.security-office'),
    minTileX: 9,
    minTileY: 11,
    maxTileX: 14,
    maxTileY: 14,
  },
];

const FIXTURE: HarnessRoomFixture = {
  chunkSizeTiles: CHUNK_SIZE_TILES,
  tileSizePx: TILE_SIZE_PX,
  rooms: ROOMS,
};

/** The middle of the zoned area, in world units: where every zoom is taken from. */
const CAMERA_FOCUS_WORLD_X = 8 * TILE_SIZE_PX;
const CAMERA_FOCUS_WORLD_Y = 8 * TILE_SIZE_PX;

function memoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

function buildWorld(zoned: boolean): WorldRenderView {
  const world = new SparseWorld(CHUNK_SIZE_TILES);
  for (const [chunkX, chunkY] of CHUNKS) {
    const chunk = { x: chunkCoordinate(chunkX), y: chunkCoordinate(chunkY) };
    world.load(chunk);
    world.setOwned(chunk, true);
  }
  if (zoned) {
    for (const room of ROOMS) {
      const numericId = numericIdOf(room.roomId);
      for (let tileY = room.minTileY; tileY <= room.maxTileY; tileY += 1) {
        for (let tileX = room.minTileX; tileX <= room.maxTileX; tileX += 1) {
          world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, numericId);
        }
      }
    }
  }
  return WorldRenderView.fromSnapshot(world.snapshot());
}

/*
 * One finished bed, standing inside the Canteen.
 *
 * It is here for one assertion and it is the assertion ADR 0098 option C's
 * ordering rests on: a name is drawn over the floor and *under* the objects, so
 * something a player has placed is never hidden by a word. A bed inside a named
 * room is the only way to measure that against live depths rather than against
 * the constants the code was written from.
 */
const STRUCTURES: readonly RenderStructure[] = [
  { id: 'canteen-bed', definitionId: 'bed-wooden', tileX: 7, tileY: 8, phase: 'built' },
];

let currentFrame: RenderFrame = {
  revision: 1,
  world: buildWorld(true),
  structures: STRUCTURES,
  actors: [],
  rooms: [],
  roomConditions: [],
};

const feed: RenderFeed = { readFrame: () => currentFrame };

const scene = new WorldScene({
  feed,
  keyValueStore: memoryStore(),
  loadAtlasLibrary: () => Promise.reject(new Error('the room-label harness loads no atlases')),
  loadSourceArtCatalog: () => Promise.reject(new Error('the room-label harness loads no source art')),
  // Swallowed: the two rejections above arrive here, and the scene's contract is
  // that art failing to load leaves a playable, legible world -- which is the
  // state this harness deliberately measures the names in.
  onError: () => {},
  /*
   * The same composition `src/main.ts` performs, and deliberately not a shortcut
   * past it: the catalogue says which room type a zoning id is and the locale
   * catalogue says what that type is called. A harness that returned literal
   * strings here would pass while `nameKey` pointed at nothing.
   */
  roomName: (zoningNumericId: number): string | undefined => {
    const definition = defaultRoomContentRegistry.getByNumericId(zoningNumericId);
    if (definition === undefined) return undefined;
    return localizer.format(definition.nameKey);
  },
});

new Phaser.Game({
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
  readonly roomLabels: RoomLabelLayer | undefined;
}
const internals = scene as unknown as SceneInternals;

function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

/**
 * Polled rather than hooked, for the reason `world-scene-harness.ts` gives
 * about `CREATE`: there is no event to subscribe to that is not already a race
 * with the boot.
 */
const ready = new Promise<void>((resolve) => {
  const poll = (): void => {
    if (scene.sys?.isActive() === true && (internals.roomLabels?.drawn.length ?? 0) > 0) {
      resolve();
      return;
    }
    requestAnimationFrame(poll);
  };
  poll();
});

function labels(): readonly HarnessRoomLabel[] {
  const zoom = scene.cameras.main.zoom;
  const found: HarnessRoomLabel[] = [];
  for (const child of scene.children.list) {
    if (!(child instanceof Phaser.GameObjects.Text)) continue;
    if (!child.visible) continue;
    found.push({
      text: child.text,
      worldX: child.x,
      worldY: child.y,
      // `displayWidth` is the object's world extent, so multiplying by the
      // camera zoom is the whole conversion to screen pixels. Read off the live
      // object rather than recomputed from the font size, because the claim
      // under test is that the two agree.
      screenWidthPx: child.displayWidth * zoom,
      screenHeightPx: child.displayHeight * zoom,
      onScreen: scene.cameras.main.worldView.contains(child.x, child.y),
    });
  }
  found.sort((a, b) => a.worldY - b.worldY || a.worldX - b.worldX);
  return found;
}

async function settleCamera(zoom: number, worldX: number, worldY: number): Promise<void> {
  scene.cameras.main.setZoom(zoom);
  scene.cameras.main.centerOn(worldX, worldY);
  // Two frames: one for the camera matrix `preRender` rebuilds, one for the
  // frame drawn with it. The same pair `environment-art-harness.ts` waits.
  await nextFrame();
  await nextFrame();
}

const harness: LockstateRoomLabelHarness = {
  ready,
  fixture: FIXTURE,
  setZoom: async (zoom) => {
    await settleCamera(zoom, CAMERA_FOCUS_WORLD_X, CAMERA_FOCUS_WORLD_Y);
  },
  setCamera: async (zoom, tileX, tileY) => {
    await settleCamera(zoom, (tileX + 0.5) * TILE_SIZE_PX, (tileY + 0.5) * TILE_SIZE_PX);
  },
  zoom: () => scene.cameras.main.zoom,
  labels,
  pooledLabelCount: () => internals.roomLabels?.pooledObjectCount ?? 0,
  depths: () => {
    let floor: number | undefined;
    let previewMax: number | undefined;
    let label: number | undefined;
    for (const child of scene.children.list) {
      const depth = (child as Phaser.GameObjects.Sprite).depth;
      if (child instanceof Phaser.GameObjects.Text) {
        label = depth;
        continue;
      }
      floor = floor === undefined ? depth : Math.min(floor, depth);
      previewMax = previewMax === undefined ? depth : Math.max(previewMax, depth);
    }
    return { label, floor, previewMax };
  },
  clearZoning: async () => {
    currentFrame = {
      revision: currentFrame.revision + 1,
      world: buildWorld(false),
      structures: STRUCTURES,
      actors: [],
      rooms: [],
      roomConditions: [],
    };
    await nextFrame();
    await nextFrame();
  },
};

window.lockstateRoomLabelHarness = harness;
