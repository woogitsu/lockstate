import Phaser from 'phaser';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import { EMPTY_RENDER_FRAME, type RenderFeed, type RenderFrame } from '../../src/rendering/feed/render-feed';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import type {
  BuildToolPort,
  EdgeTarget,
  EditHistoryPort,
  ToolStandDownPort,
} from '../../src/rendering/build/edge-picking';
import type { ObjectToolPort, RoomToolPort, TileRect } from '../../src/rendering/build/area-picking';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import type {
  CameraScroll,
  HarnessChunkPosition,
  HarnessEdge,
  HarnessPoint,
  HarnessRect,
  LockstateWorldSceneHarness,
  PointerCensus,
} from './world-scene-harness-api';

/**
 * The real `WorldScene`, in a real browser, for the claims no headless test can
 * make: that the keyboard listeners the scene registers on `window` behave when
 * focus moves, that the context set it supplies is read from the document
 * rather than baked in, that -- since #200 and #261 -- pressing a key bound to
 * a `discrete` action actually does the thing, and that a **second finger**
 * reaches the scene at all, which is a property of `this.input.addPointer(2)`
 * and of a browser context created with `hasTouch` rather than of any code a
 * headless test could call (#209).
 *
 * **`WorldScene` had never been constructed by any test in this repository** --
 * `grep -rn WorldScene tests/` returned a single comment -- which is why
 * defects this visible were never seen by CI. #201 and #202 were reported with
 * numbers from a throwaway harness; this is that harness, kept. #200's dead
 * `Equal`, `Minus` and `Escape` are the same absence measured a third time: the
 * adapter was covered and its one call site was not.
 *
 * The game config is deliberately the same shape as `src/main.ts`
 * (`Scale.RESIZE`, `CENTER_BOTH`), because the behaviour under test involves
 * `window`-level listeners and a canvas that fills the viewport.
 *
 * No atlases are loaded, and the feed is empty until a spec asks otherwise.
 * Nothing here draws anything worth looking at, and it does not need to: the
 * assertions are about where the camera is pointing, how far it is zoomed,
 * which world point it puts under a given pixel, what the build tool was asked
 * to place and what the edit history was asked to reverse -- none of which
 * depends on there being art or a world. An empty world moves exactly as far
 * per frame as a full one.
 *
 * **`loadChunks` is the one exception, and it exists for issue #793.** The
 * minimap's mapping is the only behaviour on this scene that reads
 * `WorldRenderView.loadedBounds`, so it is the only one that cannot be
 * exercised against an empty feed at all -- `navigateToMinimapPoint` answers
 * `false` and moves nothing. Materialising chunks here is what lets
 * `world-scene-minimap.spec.ts` assert the mapping to the float against the
 * camera position `frameCameraOnFirstWorld` independently arrives at, which
 * the app-level gate cannot: it reads the camera back through an
 * integer-pixel bisection of the canvas.
 */

const CANVAS_PARENT_ID = 'world-scene-harness-root';

/** A store that never touches the DOM, which is the whole point of the seam. */
function memoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

/**
 * The frame the scene is served, and how many times it has actually asked for
 * one.
 *
 * Empty until a spec calls `loadChunks`, which is why every spec that predates
 * issue #793 sees exactly what it always saw: `EMPTY_RENDER_FRAME`, with no
 * `loadedBounds`, so `frameCameraOnFirstWorld` never fires and the camera
 * starts where Phaser put it.
 *
 * `reads` is the harness's own counter and not scene introspection. It is what
 * makes "the scene has consumed this frame" answerable without guessing at
 * Phaser's callback order: `lastLoadedBounds` is assigned and
 * `frameCameraOnFirstWorld` is called in the same `update()` that calls
 * `readFrame`, so one further read after a swap is the exact precondition a
 * minimap spec needs, and a busy machine cannot shorten it the way a fixed
 * count of animation frames can.
 */
let currentFrame: RenderFrame = EMPTY_RENDER_FRAME;
let reads = 0;

const feed: RenderFeed = {
  readFrame: () => {
    reads += 1;
    return currentFrame;
  },
};

/**
 * A build tool that records instead of building.
 *
 * The real port reaches the simulation through a command sender; nothing here
 * needs that, because what `Escape` must do is entirely on the renderer's side
 * of the boundary -- abandon the pending run so `place` is never called. So the
 * double this uses is the smallest thing that can tell "cancelled" from
 * "committed": a list of what `place` received, and the last thing `target`
 * was shown.
 */
let buildArmed = false;
const placed: EdgeTarget[][] = [];
let targeted: readonly EdgeTarget[] | undefined;

const buildTool: BuildToolPort = {
  isArmed: () => buildArmed,
  place: (segments) => {
    placed.push([...segments]);
  },
  target: (segments) => {
    targeted = segments === undefined ? undefined : [...segments];
  },
};

/**
 * An edit history that records instead of undoing (#261).
 *
 * The same shape as the build double above and for the same reason: what the
 * scene owes is a *report*, made in the `world` context and not while a text
 * field has focus, and the port is where that report can be observed. What
 * happens to a real undo afterwards is the simulation's, and
 * `tests/unit/undo-redo.test.ts` covers it.
 */
const historyRequests: string[] = [];

const editHistory: EditHistoryPort = {
  undo: () => {
    historyRequests.push('undo');
  },
  redo: () => {
    historyRequests.push('redo');
  },
};

const toHarnessEdge = (edge: EdgeTarget): HarnessEdge => ({ tileX: edge.tileX, tileY: edge.tileY, edge: edge.edge });
const toHarnessRect = (rect: TileRect): HarnessRect => ({
  tileX: rect.tileX,
  tileY: rect.tileY,
  width: rect.width,
  height: rect.height,
});

/**
 * A room tool that records instead of zoning.
 *
 * The same double the build tool above is, for the same reason (#516): what
 * `blur`/`releaseMissed` must do is entirely on the renderer's side of the
 * boundary, and a list of what `place` received plus the last thing `target`
 * was shown is the smallest thing that can tell "cancelled" from "committed".
 */
let roomArmed = false;
const placedAreas: TileRect[] = [];
let targetedArea: TileRect | undefined;

const roomTool: RoomToolPort = {
  isArmed: () => roomArmed,
  isRemoving: () => false,
  place: (rect) => {
    placedAreas.push(rect);
  },
  target: (rect) => {
    targetedArea = rect;
  },
};

/**
 * An object tool that records instead of placing. Its footprint can change
 * while armed, as the real Build catalogue does when the selected row changes.
 */
let objectArmed = false;
let objectFootprint = { width: 1, height: 1 };
const placedObjects: { tileX: number; tileY: number }[] = [];
let targetedObject: TileRect | undefined;

const objectTool: ObjectToolPort = {
  isArmed: () => objectArmed,
  isRemoving: () => false,
  footprint: () => (objectArmed ? objectFootprint : undefined),
  place: (tile) => {
    placedObjects.push({ tileX: tile.tileX, tileY: tile.tileY });
  },
  target: (rect) => {
    targetedObject = rect;
  },
};

/**
 * An arming owner that records the request **and acts on it** (#959).
 *
 * Both halves are deliberate, and the second is what the other doubles in
 * this file do not do. `standDownRequests` is the report the scene owes --
 * one press, one request, and nothing at all while a gesture was there to
 * abandon instead. Clearing the three flags is this double standing in for
 * `src/main.ts`, which turns the same request into two panels' arming
 * (`HudHandle.standToolsDown`); without it the spec could only assert that a
 * message was sent and never that the world stopped belonging to the tool,
 * which is the half issue #959 measured in funds.
 */
let standDownRequests = 0;

const toolStandDown: ToolStandDownPort = {
  standDown: () => {
    standDownRequests += 1;
    buildArmed = false;
    objectArmed = false;
    roomArmed = false;
  },
};

const scene = new WorldScene({
  feed,
  keyValueStore: memoryStore(),
  buildTool,
  editHistory,
  toolStandDown,
  roomTool,
  objectTool,
  // No atlas library: the harness asserts nothing about art, and loading one
  // would make every spec here depend on the git-LFS baseline.
  loadAtlasLibrary: () => Promise.reject(new Error('the input harness loads no atlases')),
  // Swallowed on purpose. The rejected atlas load above arrives here, and the
  // scene's own contract is that art failing leaves a playable world -- so a
  // console warning would be noise in every spec rather than a signal.
  onError: () => {},
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: CANVAS_PARENT_ID,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0b0e12',
  scene: [scene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

/**
 * Resolves once the scene is running, which is when `create` has registered the
 * `keydown`/`keyup`/`blur` listeners under test.
 *
 * Polled rather than driven by `scene.events.once(Events.CREATE, ...)`, and the
 * reason is worth recording because the obvious version silently does not work:
 * `scene.events` does not exist until the SceneManager installs the scene, so
 * subscribing before `new Phaser.Game` throws
 * `Cannot read properties of undefined (reading 'once')`, and subscribing after
 * it races the boot -- on a fast machine `CREATE` has already fired and the
 * listener never runs. A poll is correct in both directions.
 *
 * A spec that dispatched a key before this resolved would measure a camera with
 * no listeners attached and pass while asserting nothing.
 */
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
 * The scene keeps its keyboard adapter private, which is correct -- so the
 * harness reaches it through the same cast the spec would otherwise have to
 * write inline. Confined to this file so the assertions stay readable.
 */
interface SceneInternals {
  readonly keyboard: {
    isActive(action: string): boolean;
  };
}

const internals = scene as unknown as SceneInternals;

const harness: LockstateWorldSceneHarness = {
  ready,
  scroll: (): CameraScroll => ({
    x: scene.cameras.main.scrollX,
    y: scene.cameras.main.scrollY,
  }),
  isActive: (action) => internals.keyboard.isActive(action),
  zoom: () => scene.cameras.main.zoom,
  worldPointAt: (screen: HarnessPoint): HarnessPoint => {
    const point = scene.cameras.main.getWorldPoint(screen.x, screen.y);
    return { x: point.x, y: point.y };
  },
  pointerCensus: (): PointerCensus => {
    // `scene.input.manager` is the game-wide `InputManager`, and every field
    // below is copied off it unchanged. No cast: unlike the keyboard adapter
    // above this is public engine state, and unlike the context set it is not
    // a rule this repository implements, so reading it cannot turn into a
    // second implementation of the thing under test.
    const manager = scene.input.manager;
    const mouse = manager.mousePointer;
    return {
      entries: manager.pointers.length,
      pointersTotal: manager.pointersTotal,
      ids: manager.pointers.map((pointer) => pointer.id),
      mouseIndex: mouse === null ? -1 : manager.pointers.indexOf(mouse),
      configuredActivePointers: manager.config.inputActivePointers,
    };
  },
  armBuildTool: (armed) => {
    buildArmed = armed;
  },
  standDownRequests: () => standDownRequests,
  isAnyToolArmed: () => buildArmed || objectArmed || roomArmed,
  placedRuns: () => placed.map((run) => run.map(toHarnessEdge)),
  historyRequests: () => [...historyRequests],
  clearHistoryRequests: () => {
    historyRequests.length = 0;
  },
  targetedRun: () => targeted?.map(toHarnessEdge),
  armRoomTool: (armed) => {
    roomArmed = armed;
  },
  placedAreas: () => placedAreas.map(toHarnessRect),
  targetedArea: () => (targetedArea === undefined ? undefined : toHarnessRect(targetedArea)),
  armObjectTool: (armed) => {
    objectArmed = armed;
  },
  setObjectFootprint: (footprint) => {
    objectFootprint = footprint;
  },
  placedObjects: () => [...placedObjects],
  targetedObject: () => (targetedObject === undefined ? undefined : toHarnessRect(targetedObject)),
  loadChunks: (chunkSize: number, chunks: readonly HarnessChunkPosition[]): Promise<void> => {
    // A real `SparseWorld`, snapshotted exactly as the simulation worker
    // snapshots its own, and projected by the production
    // `WorldRenderView.fromSnapshot`. So `loadedBounds` -- the one thing the
    // mapping under test reads -- is computed here by the same code that
    // computes it in a running session, from a chunk layout the spec chose.
    // A harness that assembled the rectangle itself would be handing the scene
    // the answer and then checking the scene against it.
    const world = new SparseWorld(chunkSize);
    for (const chunk of chunks) {
      world.load({ x: chunkCoordinate(chunk.chunkX), y: chunkCoordinate(chunk.chunkY) });
    }
    currentFrame = {
      revision: currentFrame.revision + 1,
      world: WorldRenderView.fromSnapshot(world.snapshot()),
      structures: [],
      actors: [],
      rooms: [],
      roomConditions: [],
    };

    const readsBefore = reads;
    return new Promise<void>((resolve) => {
      const poll = (): void => {
        if (reads > readsBefore) {
          resolve();
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  },
  navigateToMinimapPoint: (fx, fy) => scene.navigateToMinimapPoint(fx, fy),
  navigateToTile: (tileX, tileY) => scene.navigateToTile(tileX, tileY),
  displaceCamera: (scrollX, scrollY) => {
    scene.cameras.main.setScroll(scrollX, scrollY);
  },
  framesRead: () => reads,
  publishRooms: (rooms, conditions): Promise<void> => {
    // `revision` deliberately does **not** move for the conditions: they ride
    // the delta in the game and the tile painter must not repaint for them
    // (ADR 0097 decision 2). It moves here only because the rectangles ride
    // the geometry pull, which is the channel `revision` counts.
    currentFrame = {
      revision: currentFrame.revision + 1,
      world: currentFrame.world,
      structures: currentFrame.structures,
      actors: currentFrame.actors,
      rooms: rooms.map((room) => ({ ...room, roomCatalogId: 'room.cell' })),
      roomConditions: [...conditions],
    };

    const readsBefore = reads;
    return new Promise<void>((resolve) => {
      const poll = (): void => {
        if (reads > readsBefore) {
          resolve();
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  },
  roomConditionMarks: () => scene.roomConditionMarks,
  homeIndicator: () => {
    const mark = scene.homeIndicatorMark;
    return mark === undefined ? undefined : { x: mark.position.x, y: mark.position.y, angleRadians: mark.angleRadians };
  },
};

window.lockstateWorldSceneHarness = harness;
