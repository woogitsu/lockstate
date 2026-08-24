import Phaser from 'phaser';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import { EMPTY_RENDER_FRAME, type RenderFeed } from '../../src/rendering/feed/render-feed';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import type { BuildToolPort, EdgeTarget } from '../../src/rendering/build/edge-picking';
import type { CameraScroll, HarnessEdge, HarnessPoint, LockstateWorldSceneHarness } from './world-scene-harness-api';

/**
 * The real `WorldScene`, in a real browser, for the claims no headless test can
 * make: that the keyboard listeners the scene registers on `window` behave when
 * focus moves, that the context set it supplies is read from the document
 * rather than baked in, that -- since #200 -- pressing a key bound to a
 * `discrete` action actually does the thing, and that a **second finger**
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
 * No atlases are loaded and the feed is empty. Nothing here draws anything worth
 * looking at, and it does not need to: the assertions are about where the camera
 * is pointing, how far it is zoomed, which world point it puts under a given
 * pixel, and what the build tool was asked to place -- none of which depends on
 * there being art or a world. An empty world moves exactly as far per frame as a
 * full one.
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

const emptyFeed: RenderFeed = {
  readFrame: () => EMPTY_RENDER_FRAME,
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

const toHarnessEdge = (edge: EdgeTarget): HarnessEdge => ({ tileX: edge.tileX, tileY: edge.tileY, edge: edge.edge });

const scene = new WorldScene({
  feed: emptyFeed,
  keyValueStore: memoryStore(),
  buildTool,
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
  armBuildTool: (armed) => {
    buildArmed = armed;
  },
  placedRuns: () => placed.map((run) => run.map(toHarnessEdge)),
  targetedRun: () => targeted?.map(toHarnessEdge),
};

window.lockstateWorldSceneHarness = harness;
