import Phaser from 'phaser';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';
import { DOOR_EDGE_NUMERIC_ID, WALL_EDGE_NUMERIC_ID } from '../../src/simulation/construction/definition';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import type { RenderFeed, RenderFrame } from '../../src/rendering/feed/render-feed';
import type { RenderStructure } from '../../src/rendering/world/structures';
import type { TileLayer } from '../../src/rendering/phaser/tile-layer';
import type { RoomLabelLayer } from '../../src/rendering/phaser/room-label-layer';
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
  grassTileX: 0,
  grassTileY: 1,
  concreteTileX: 0,
  concreteTileY: 0,
  gravelTileX: 0,
  gravelTileY: 2,
  rockTileX: 0,
  rockTileY: 3,
  // A four-by-three room, walled along its northern row, with a door in that
  // wall and one segment of west wall.
  zonedMinTileX: 2,
  zonedMinTileY: 2,
  zonedMaxTileX: 5,
  zonedMaxTileY: 4,
  kitchenMinTileX: 2,
  kitchenMinTileY: 6,
  kitchenMaxTileX: 5,
  kitchenMaxTileY: 8,
  canteenMinTileX: 7,
  canteenMinTileY: 6,
  canteenMaxTileX: 10,
  canteenMaxTileY: 8,
  yardMinTileX: 12,
  yardMinTileY: 12,
  yardMaxTileX: 19,
  yardMaxTileY: 19,
  showerFloorMinTileX: 12,
  showerFloorMinTileY: 12,
  showerFloorMaxTileX: 14,
  showerFloorMaxTileY: 14,
  laundryFloorMinTileX: 17,
  laundryFloorMinTileY: 12,
  laundryFloorMaxTileX: 19,
  laundryFloorMaxTileY: 14,
  infirmaryFloorMinTileX: 17,
  infirmaryFloorMinTileY: 17,
  infirmaryFloorMaxTileX: 20,
  infirmaryFloorMaxTileY: 20,
  commonRoomFloorMinTileX: 24,
  commonRoomFloorMinTileY: 17,
  commonRoomFloorMaxTileX: 28,
  commonRoomFloorMaxTileY: 21,
  classroomFloorMinTileX: 17,
  classroomFloorMinTileY: 24,
  classroomFloorMaxTileX: 21,
  classroomFloorMaxTileY: 28,
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
  fridgeTileX: 36,
  fridgeTileY: 4,
  securityConsoleTileX: 42,
  securityConsoleTileY: 4,
  utilityPanelTileX: 44,
  utilityPanelTileY: 4,
  loadingDockDoorTileX: 45,
  loadingDockDoorTileY: 4,
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
  const includeYard = new URLSearchParams(window.location.search).has('roomLabels');
  const includeShowerFloor = new URLSearchParams(window.location.search).has('showerFloor');
  const includeInfirmaryFloor = new URLSearchParams(window.location.search).has('infirmaryFloor');
  const includeCommonRoomFloor = new URLSearchParams(window.location.search).has('commonRoomFloor');
  const includeClassroomFloor = new URLSearchParams(window.location.search).has('classroomFloor');
  if (includeYard) {
    // The outdoor 8x8 Yard occupies four later chunks. It must be owned like
    // player-built land; otherwise the unowned shade hides its material.
    for (const chunkX of [1, 2]) {
      for (const chunkY of [1, 2]) {
        const yardChunk = { x: chunkCoordinate(chunkX), y: chunkCoordinate(chunkY) };
        world.load(yardChunk);
        world.setOwned(yardChunk, true);
      }
    }
  }
  if (includeShowerFloor || includeInfirmaryFloor) {
    // The two 3x3 wet rooms occupy separate owned chunks, leaving the default
    // fixture untouched for object/edge tests that inspect pooled sprites.
    for (const chunkX of [1, 2]) {
      const roomChunk = { x: chunkCoordinate(chunkX), y: chunkCoordinate(1) };
      world.load(roomChunk);
      world.setOwned(roomChunk, true);
    }
  }
  if (includeInfirmaryFloor || includeCommonRoomFloor || includeClassroomFloor) {
    const roomChunk = { x: chunkCoordinate(2), y: chunkCoordinate(2) };
    world.load(roomChunk);
    world.setOwned(roomChunk, true);
  }
  if (includeCommonRoomFloor || includeClassroomFloor) {
    const roomChunk = { x: chunkCoordinate(3), y: chunkCoordinate(2) };
    world.load(roomChunk);
    world.setOwned(roomChunk, true);
  }
  if (includeClassroomFloor) {
    const roomChunk = { x: chunkCoordinate(2), y: chunkCoordinate(3) };
    world.load(roomChunk);
    world.setOwned(roomChunk, true);
  }
  for (let x = FIXTURE.grassTileX; x < FIXTURE.grassTileX + 2; x += 1) {
    world.setTerrain({ x: tileCoordinate(x), y: tileCoordinate(FIXTURE.grassTileY) }, 'grass');
  }
  // The same SparseWorld snapshot path used by persisted maps carries this
  // concrete strip into WorldRenderView; no paint UI is part of this fixture.
  for (let x = FIXTURE.concreteTileX; x < FIXTURE.concreteTileX + 2; x += 1) {
    world.setTerrain({ x: tileCoordinate(x), y: tileCoordinate(FIXTURE.concreteTileY) }, 'concrete');
  }
  for (let x = FIXTURE.gravelTileX; x < FIXTURE.gravelTileX + 2; x += 1) {
    world.setTerrain({ x: tileCoordinate(x), y: tileCoordinate(FIXTURE.gravelTileY) }, 'gravel');
  }
  for (let x = FIXTURE.rockTileX; x < FIXTURE.rockTileX + 2; x += 1) {
    world.setTerrain({ x: tileCoordinate(x), y: tileCoordinate(FIXTURE.rockTileY) }, 'rock');
  }

  const room = defaultRoomContentRegistry.getById('room.cell');
  if (room === undefined) throw new Error('The cell room is missing from the catalog.');

  for (let tileY = FIXTURE.zonedMinTileY; tileY <= FIXTURE.zonedMaxTileY; tileY += 1) {
    for (let tileX = FIXTURE.zonedMinTileX; tileX <= FIXTURE.zonedMaxTileX; tileX += 1) {
      world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, room.numericId);
    }
  }
  const kitchen = defaultRoomContentRegistry.getById('room.kitchen');
  if (kitchen === undefined) throw new Error('The kitchen room is missing from the catalog.');
  for (let tileY = FIXTURE.kitchenMinTileY; tileY <= FIXTURE.kitchenMaxTileY; tileY += 1) {
    for (let tileX = FIXTURE.kitchenMinTileX; tileX <= FIXTURE.kitchenMaxTileX; tileX += 1) {
      world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, kitchen.numericId);
    }
  }
  const canteen = defaultRoomContentRegistry.getById('room.canteen');
  if (canteen === undefined) throw new Error('The canteen room is missing from the catalog.');
  for (let tileY = FIXTURE.canteenMinTileY; tileY <= FIXTURE.canteenMaxTileY; tileY += 1) {
    for (let tileX = FIXTURE.canteenMinTileX; tileX <= FIXTURE.canteenMaxTileX; tileX += 1) {
      world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, canteen.numericId);
    }
  }
  if (includeYard) {
    const yard = defaultRoomContentRegistry.getById('room.yard');
    if (yard === undefined) throw new Error('The yard room is missing from the catalog.');
    for (let tileY = FIXTURE.yardMinTileY; tileY <= FIXTURE.yardMaxTileY; tileY += 1) {
      for (let tileX = FIXTURE.yardMinTileX; tileX <= FIXTURE.yardMaxTileX; tileX += 1) {
        world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, yard.numericId);
      }
    }
  }
  if (includeShowerFloor || includeInfirmaryFloor) {
    for (const [roomId, minX, minY, maxX, maxY] of [
      ['room.shower-room', FIXTURE.showerFloorMinTileX, FIXTURE.showerFloorMinTileY,
        FIXTURE.showerFloorMaxTileX, FIXTURE.showerFloorMaxTileY],
      ['room.laundry', FIXTURE.laundryFloorMinTileX, FIXTURE.laundryFloorMinTileY,
        FIXTURE.laundryFloorMaxTileX, FIXTURE.laundryFloorMaxTileY],
    ] as const) {
      const room = defaultRoomContentRegistry.getById(roomId);
      if (room === undefined) throw new Error(`The ${roomId} room is missing from the catalog.`);
      for (let tileY = minY; tileY <= maxY; tileY += 1) {
        for (let tileX = minX; tileX <= maxX; tileX += 1) {
          world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, room.numericId);
        }
      }
    }
  }
  if (includeInfirmaryFloor || includeCommonRoomFloor || includeClassroomFloor) {
    const infirmary = defaultRoomContentRegistry.getById('room.infirmary');
    if (infirmary === undefined) throw new Error('The infirmary room is missing from the catalog.');
    for (let tileY = FIXTURE.infirmaryFloorMinTileY; tileY <= FIXTURE.infirmaryFloorMaxTileY; tileY += 1) {
      for (let tileX = FIXTURE.infirmaryFloorMinTileX; tileX <= FIXTURE.infirmaryFloorMaxTileX; tileX += 1) {
        world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, infirmary.numericId);
      }
    }
  }
  if (includeCommonRoomFloor || includeClassroomFloor) {
    const commonRoom = defaultRoomContentRegistry.getById('room.common-room');
    if (commonRoom === undefined) throw new Error('The common room is missing from the catalog.');
    for (let tileY = FIXTURE.commonRoomFloorMinTileY; tileY <= FIXTURE.commonRoomFloorMaxTileY; tileY += 1) {
      for (let tileX = FIXTURE.commonRoomFloorMinTileX; tileX <= FIXTURE.commonRoomFloorMaxTileX; tileX += 1) {
        world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, commonRoom.numericId);
      }
    }
  }
  if (includeClassroomFloor) {
    const classroom = defaultRoomContentRegistry.getById('room.classroom');
    if (classroom === undefined) throw new Error('The classroom is missing from the catalog.');
    for (let tileY = FIXTURE.classroomFloorMinTileY; tileY <= FIXTURE.classroomFloorMaxTileY; tileY += 1) {
      for (let tileX = FIXTURE.classroomFloorMinTileX; tileX <= FIXTURE.classroomFloorMaxTileX; tileX += 1) {
        world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, classroom.numericId);
      }
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
      id: 'finished-fridge',
      definitionId: 'fridge-brick',
      tileX: FIXTURE.fridgeTileX,
      tileY: FIXTURE.fridgeTileY,
      phase: 'built',
    },
    {
      id: 'finished-security-console',
      definitionId: 'security-console-brick',
      tileX: FIXTURE.securityConsoleTileX,
      tileY: FIXTURE.securityConsoleTileY,
      phase: 'built',
    },
    {
      id: 'finished-utility-panel',
      definitionId: 'utility-panel-brick',
      tileX: FIXTURE.utilityPanelTileX,
      tileY: FIXTURE.utilityPanelTileY,
      phase: 'built',
    },
    {
      id: 'finished-loading-dock-door',
      definitionId: 'loading-dock-door-wooden',
      tileX: FIXTURE.loadingDockDoorTileX,
      tileY: FIXTURE.loadingDockDoorTileY,
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
    ...(includeInfirmaryFloor ? [
      {
        id: 'infirmary-floor-medical-bed',
        definitionId: 'medical-bed-wooden',
        tileX: 17,
        tileY: 17,
        phase: 'built' as const,
      },
      {
        id: 'infirmary-floor-medicine-cabinet',
        definitionId: 'medicine-cabinet-wooden',
        tileX: 20,
        tileY: 18,
        phase: 'built' as const,
      },
    ] : []),
    ...(includeCommonRoomFloor ? [
      {
        id: 'common-room-floor-bench-west',
        definitionId: 'bench-wooden',
        tileX: 24,
        tileY: 17,
        phase: 'built' as const,
      },
      {
        id: 'common-room-floor-bench-east',
        definitionId: 'bench-wooden',
        tileX: 27,
        tileY: 17,
        phase: 'built' as const,
      },
    ] : []),
    ...(includeClassroomFloor ? [
      {
        id: 'classroom-floor-bookshelf',
        definitionId: 'bookshelf-wooden',
        tileX: 18,
        tileY: 24,
        phase: 'built' as const,
      },
      ...[[17, 25], [21, 25], [17, 28], [21, 28]].map(([tileX, tileY], index) => ({
        id: `classroom-floor-chair-${index}`,
        definitionId: 'chair-wooden',
        tileX: tileX!,
        tileY: tileY!,
        phase: 'built' as const,
      })),
    ] : []),
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
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

const scene = new WorldScene({
  feed,
  keyValueStore: memoryStore(),
  ...(new URLSearchParams(window.location.search).has('roomLabels')
    || new URLSearchParams(window.location.search).has('showerFloor')
    || new URLSearchParams(window.location.search).has('infirmaryFloor')
    || new URLSearchParams(window.location.search).has('commonRoomFloor')
    || new URLSearchParams(window.location.search).has('classroomFloor') ? {
    roomName: (zoningNumericId: number): string | undefined => {
      const room = defaultRoomContentRegistry.getByNumericId(zoningNumericId);
      return room === undefined ? undefined : localizer.format(room.nameKey);
    },
  } : {}),
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
  roomLabels: () => internals.roomLabels?.drawn ?? [],
  centreCameraOn: async (worldX, worldY, zoom = 1) => {
    scene.cameras.main.setZoom(zoom);
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
