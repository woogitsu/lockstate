import Phaser from 'phaser';
import type { KeyValueStore } from '../../shared/key-value-store';
import {
  KeyboardInputAdapter,
  type SemanticActionEvent,
  TouchGestureTracker,
  isTextEntryFocused,
  loadInputSettings,
} from '../../input';
import { AtlasFrameIndex } from '../assets/atlas-frame-index';
import { AtlasLibrary } from '../assets/atlas-library';
import { planEnvironmentAtlas } from '../assets/environment-atlas-plan';
import { RenderedArtCatalog } from '../assets/rendered-art-catalog';
import { SourceArtCatalog } from '../assets/source-art-catalog';
import { type CameraState, screenToWorld, visibleWorldBounds, zoomAtScreenPoint } from '../camera';
import {
  type BuildToolPort,
  type EdgeTarget,
  type EditHistoryPort,
  type ToolStandDownPort,
  type WorldPoint,
  edgeRunFromDrag,
  edgeTargetsEqual,
  pickEdgeAtWorld,
} from '../build/edge-picking';
import type { RenderFeed } from '../feed/render-feed';
import { ActorLayer } from '../phaser/actor-layer';
import { registerAtlasTextures } from '../phaser/atlas-textures';
import { loadEnvironmentAtlas } from '../phaser/environment-textures';
import { BuildOverlay } from '../phaser/build-overlay';
import { AreaOverlay } from '../phaser/area-overlay';
import {
  footprintRectAt,
  pickTileAtWorld,
  tileRectFromDrag,
  tileRectsEqual,
  type ObjectToolPort,
  type RoomToolPort,
  type TileRect,
} from '../build/area-picking';
import { RoomLabelLayer } from '../phaser/room-label-layer';
import { TileLayer } from '../phaser/tile-layer';
import { TILE_SIZE_PX, tileToWorld, visibleTileRange, type TileBounds, type TileRange } from '../tile-metrics';
import { VOID_COLOR } from '../world/appearance';

/**
 * The world view: camera, input, tiles and actors.
 *
 * It owns no game state. Every frame it asks a `RenderFeed` for the current
 * projection of the simulation and draws that -- `AGENTS.md` boundary 1, with
 * the arrow only ever pointing one way. Panning, zooming and animation happen
 * here because they are presentation; nothing the player does with the camera
 * reaches the simulation.
 *
 * Camera input arrives two ways, and the split is the design rather than an
 * accident. Panning is **polled** -- `update()` asks `KeyboardInputAdapter`
 * which of the four `continuous` camera actions are held, because a held key
 * should move the camera in proportion to the frame it was held for. Discrete
 * actions -- keyboard zoom, cancelling a build run, undo and redo -- arrive as
 * `SemanticActionEvent`s from `keyDown`/`keyUp` and are handled in
 * `handleActionEvents`. Middle-drag, wheel zoom and the touch pan/pinch are
 * Phaser pointer handlers and consult no action id at all.
 */

/**
 * Zoom range in screen pixels per world unit. With a 64px tile that is a tile
 * drawn between 13 and 192 pixels: far enough out to plan a wing, close
 * enough in to see which way a prisoner is facing at nearly the resolution
 * the art was authored at.
 */
const ZOOM_BOUNDS = { min: 0.2, max: 3 } as const;

/** About nine tiles a second at zoom 1, and proportionally faster zoomed out. */
const PAN_SPEED_WORLD_UNITS_PER_MS = 0.6;

/**
 * One press of a zoom key, as a multiplier.
 *
 * Applied as `zoom * STEP` and `zoom / STEP` rather than the wheel's `1.1` and
 * `0.9`, so a press in and a press out return to exactly where they started.
 * The wheel's pair does not (`1.1 * 0.9 = 0.99`), and that is tolerable for a
 * gesture nobody counts; a keypress is countable, and a player who presses `+`
 * then `-` and lands somewhere new has been told the keys do not work.
 *
 * `1.25` rather than `1.1`, because a key is one discrete event where a wheel
 * delivers a stream: at `1.1` a press would move a 64px tile by six pixels and
 * read as nothing happening. Eight presses cross the whole `0.2`-`3` range.
 */
const KEYBOARD_ZOOM_STEP = 1.25;

export interface WorldSceneOptions {
  readonly feed: RenderFeed;
  /** Injectable so a test or a preview can supply a batch without the network. */
  readonly loadAtlasLibrary?: () => Promise<AtlasLibrary>;
  /**
   * The generated source-art catalog the environment sprites are cut from.
   *
   * Injectable for the same reason `loadAtlasLibrary` is, and separate from it
   * because the two batches are independent: the actors come from
   * `/assets/actors` and are 8-direction animation clips, the environment comes
   * from `/game-content/source-art` and is whole sheets an extraction manifest
   * carves up. Either can fail without the other, and either failing leaves a
   * playable world.
   */
  readonly loadSourceArtCatalog?: () => Promise<SourceArtCatalog>;
  /**
   * The generated rendered-art catalog (ADR 0100), a second and independent
   * batch from the one above: `/game-content/rendered-art.v1.json` names
   * Blender-rendered object frames rather than owner-sheet crops. Injectable
   * for the same reason, and failing independently for the same reason --
   * `loadEnvironmentArt` awaits both before publishing either, so a failure in
   * either leaves the coloured-block world this scene already draws before
   * any art arrives.
   */
  readonly loadRenderedArtCatalog?: () => Promise<RenderedArtCatalog>;
  readonly onError?: (error: Error) => void;
  /**
   * Where a build gesture goes. Absent, the world is view-only and every
   * pointer gesture keeps its old camera meaning exactly.
   *
   * The scene reports *edges*, never commands: `src/rendering/**` may not
   * submit one (pinned by `tests/unit/rendering-module-boundaries.test.ts`),
   * and the renderer must not become the thing that decides a build happened.
   */
  readonly buildTool?: BuildToolPort;

  /**
   * Where an undo or redo request goes (#261).
   *
   * The scene recognises the key and reports what was asked for; it does not
   * know that an `Undo` command exists, for the same reason it does not know
   * what a build order is. Absent, the two keys do nothing at all -- which is
   * the state of a page with no simulation worker, where `src/main.ts` builds
   * no build tool either.
   */
  readonly editHistory?: EditHistoryPort;

  /**
   * Where "put the tool down" goes (issue #959).
   *
   * The scene recognises the key and reports what was asked for; it does not
   * know which panel armed which tool, for the same reason it does not know
   * what a build order is. Absent, `Escape` cancels a gesture in progress and
   * changes no arming -- the behaviour every release before #959 had.
   */
  readonly toolStandDown?: ToolStandDownPort;

  /**
   * Where a room-designation gesture goes (ADR 0022).
   *
   * A second port beside `buildTool` rather than a mode on it, for the reason
   * `area-picking.ts` states: `BuildToolPort.place` is edge-typed and its
   * `isArmed()` carries no shape, so a scene holding only that port cannot
   * tell an edge tool from an area tool. Absent, every pointer gesture keeps
   * exactly the meaning it had, the same as an absent `buildTool`.
   *
   * The scene reports a *rectangle in tiles*, never a command: this file may
   * not construct one (`tests/unit/rendering-module-boundaries.test.ts`).
   */
  readonly roomTool?: RoomToolPort;

  /**
   * Where an object-placement gesture goes (ADR 0028 phase 1).
   *
   * A third port beside `buildTool` and `roomTool`, for the reason
   * `area-picking.ts` states: the three carry different shapes -- a run of
   * edges, one dragged rectangle, one pressed tile with a footprint. Absent,
   * every pointer gesture keeps exactly the meaning it had, the same as an
   * absent `buildTool`.
   *
   * The scene reports a *tile*, never a command: this file may not construct
   * one (`tests/unit/rendering-module-boundaries.test.ts`).
   */
  readonly objectTool?: ObjectToolPort;

  /**
   * The tint to preview a pending object in.
   *
   * A function for the reason `roomTint` is one: the player can change the
   * selected catalogue row without disarming, and the scene reads it on every
   * paint. It is a *colour*, not a buildable id -- which object is selected
   * lives in the HUD.
   */
  readonly objectTint?: () => number | undefined;

  /**
   * The tint to preview a pending room in, or `undefined` while the armed
   * gesture removes rather than creates.
   *
   * Read on every paint rather than taken once, because the player can change
   * the selected room type without disarming. It is a *colour*, not a room id:
   * which room is selected lives in the HUD, and the scene is handed the answer
   * it needs to draw rather than the state it would have to interpret.
   */
  readonly roomTint?: () => number | undefined;

  /**
   * The room type's own name, in the player's language, for a zoning numeric id
   * -- or `undefined` for an id this build's catalogue does not name.
   *
   * A function, and text rather than a message key, for the two reasons
   * `roomTint` above is a function returning a colour. The renderer is handed
   * *the answer it needs to draw*: which words a room type is called is a
   * content-plus-localization decision, and both live at the composition root
   * (`src/main.ts`), so a scene that resolved a key would be a second place
   * that knows how this game is translated. And it is read on every paint
   * rather than taken once, so a future locale change reaches the map without
   * the scene holding a stale copy.
   *
   * Absent, no room is named and every gesture keeps exactly the meaning it
   * had -- the same shape an absent `buildTool` has. That is the state of
   * `tests/browser/world-scene-harness.ts`, which asserts about input and
   * nothing about words.
   */
  readonly roomName?: (zoningNumericId: number) => string | undefined;

  /**
   * Where input settings are read from.
   *
   * The renderer used to reach for `window.localStorage` itself, in a class
   * field initializer -- so a browser that blocks site data threw inside this
   * constructor, at module top level, outside any `try`, and took the whole
   * boot with it (issue #199). `docs/INPUT.md` had described the arrangement
   * this option restores: the entry point supplies the store, and the seam
   * exists so tests stay headless.
   *
   * **Required, not optional with a default**, and the reason is a correction to
   * this comment's first draft. It said a default was kept "because a harness
   * page that only wants a canvas should not have to name a storage strategy" --
   * which invented a consumer: the only production `new WorldScene(...)` is
   * `src/main.ts`'s, and when this was written no harness constructed one at
   * all -- `tests/browser/world-scene-harness.ts` (#200, #209) does now, and it
   * supplies a memory store rather than naming a storage strategy, which is
   * the shape this paragraph predicted. With the option
   * optional, deleting `main.ts`'s `keyValueStore:` argument passed every test
   * (measured), so `docs/INPUT.md`'s claim that the entry point supplies the
   * store had nothing enforcing it. Making it required moves that guard into
   * `tsc`, which is stronger than any assertion about source text -- and costs
   * nothing, because there is one caller. Use
   * `resolveBrowserKeyValueStore()` for a browser and an in-memory store in a
   * test.
   */
  readonly keyValueStore: KeyValueStore;
}

export class WorldScene extends Phaser.Scene {
  private feed: RenderFeed;
  private readonly loadAtlasLibrary: () => Promise<AtlasLibrary>;
  private readonly loadSourceArtCatalog: () => Promise<SourceArtCatalog>;
  private readonly loadRenderedArtCatalog: () => Promise<RenderedArtCatalog>;
  private readonly onError: (error: Error) => void;

  /**
   * Assigned in the constructor, not in a field initializer.
   *
   * A field initializer cannot see the constructor's `options`, so building
   * this here is what forced the old `window.localStorage` read -- and a field
   * initializer runs *inside* the constructor, which is why the throw escaped
   * to module scope rather than to a caller that could handle it (#199).
   */
  private readonly keyboard: KeyboardInputAdapter;
  private readonly touchGestures = new TouchGestureTracker();
  private panPointerId: number | undefined;
  private lastPanScreenPoint: { readonly x: number; readonly y: number } | undefined;

  private readonly buildTool: BuildToolPort | undefined;
  private readonly editHistory: EditHistoryPort | undefined;
  private readonly toolStandDown: ToolStandDownPort | undefined;
  private readonly roomTool: RoomToolPort | undefined;
  private readonly roomTint: (() => number | undefined) | undefined;
  private readonly roomName: ((zoningNumericId: number) => string | undefined) | undefined;
  private readonly objectTool: ObjectToolPort | undefined;
  private readonly objectTint: (() => number | undefined) | undefined;
  /** The pointer currently drawing a wall run, and the world point it pressed. */
  private buildPointerId: number | undefined;
  private buildPress: WorldPoint | undefined;
  private buildSegments: readonly EdgeTarget[] = [];
  private hoveredEdge: EdgeTarget | undefined;

  private tiles: TileLayer | undefined;
  /**
   * Undefined when no `roomName` was supplied, rather than a layer that draws
   * nothing: a layer with no source of words would still walk the world for
   * regions once per revision to write no text.
   */
  private roomLabels: RoomLabelLayer | undefined;
  private actors: ActorLayer | undefined;
  private buildOverlay: BuildOverlay | undefined;

  /*
   * The area gesture's state, mirroring the three fields above it rather than
   * sharing them. A shared pointer id would let a build release commit a room,
   * and the two previews have to be able to be cleared independently: leaving a
   * tab disarms one tool while the other may still be armed.
   */
  private areaPointerId: number | undefined;
  private areaPress: WorldPoint | undefined;
  private areaRect: TileRect | undefined;
  private hoveredTile: TileRect | undefined;
  private areaOverlay: AreaOverlay | undefined;

  /*
   * The object gesture's state, mirroring the area gesture's fields for the
   * same reason those do not share the build tool's: a build or area release
   * must not place an object, and the previews have to be clearable
   * independently. It gets its own `AreaOverlay` too -- one more `Graphics`
   * object, against the alternative of two tools writing to one buffer and
   * clearing each other's marks.
   */
  private objectPointerId: number | undefined;
  private objectRect: TileRect | undefined;
  private hoveredObjectTile: TileRect | undefined;
  private objectOverlay: AreaOverlay | undefined;
  private framedOnWorld = false;
  /**
   * The most recent frame's `frame.world.loadedBounds` (issue #793).
   *
   * Refreshed every `update()`, from the exact same read `frameCameraOnFirstWorld`
   * already takes -- no new subscription to the feed. `navigateToMinimapPoint`
   * is the only reader: a minimap click can arrive between two `update()`s (an
   * input event, not a render tick), and there is otherwise nowhere on this
   * scene to ask "how big is the world right now" outside the render loop.
   */
  private lastLoadedBounds: TileBounds | undefined;

  public constructor(options: WorldSceneOptions) {
    super('WorldScene');
    this.feed = options.feed;
    this.buildTool = options.buildTool;
    this.editHistory = options.editHistory;
    this.toolStandDown = options.toolStandDown;
    this.roomTool = options.roomTool;
    this.roomTint = options.roomTint;
    this.roomName = options.roomName;
    this.objectTool = options.objectTool;
    this.objectTint = options.objectTint;
    this.keyboard = new KeyboardInputAdapter(
      loadInputSettings(options.keyValueStore).keyboardBindings,
      // Answered from the document rather than by a literal. This was
      // `() => ['world']`, which made `'text-entry'`, `'modal'` and
      // `'construction'` decorative: `docs/INPUT.md` credited a guard against
      // game controls firing while a text field owns input, the mechanism for it
      // worked and was unit-tested, and the one thing that would make it fire
      // never happened (issue #201). `isActive` re-reads this on every call, so
      // focus moving into a field mid-hold stops the camera too.
      () => (isTextEntryFocused() ? ['text-entry'] : ['world']),
    );
    this.loadAtlasLibrary = options.loadAtlasLibrary ?? (() => AtlasLibrary.load());
    this.loadSourceArtCatalog = options.loadSourceArtCatalog ?? (() => SourceArtCatalog.load());
    this.loadRenderedArtCatalog = options.loadRenderedArtCatalog ?? (() => RenderedArtCatalog.load());
    this.onError =
      options.onError ??
      ((error) => {
        console.warn('World renderer:', error);
      });
  }

  /**
   * Replaces the source of render frames.
   *
   * The scene starts drawing before anything asynchronous has resolved, so a
   * feed that needs the asset registry (or, later, a richer simulation
   * channel) can be swapped in once it is ready without stalling the boot.
   * It changes where frames come from, never what the renderer may do with
   * them.
   */
  public setFeed(feed: RenderFeed): void {
    this.feed = feed;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(VOID_COLOR);
    this.tiles = new TileLayer(this);
    const roomName = this.roomName;
    if (roomName !== undefined) this.roomLabels = new RoomLabelLayer(this, roomName);
    this.buildOverlay = new BuildOverlay(this);
    this.areaOverlay = new AreaOverlay(this);
    this.objectOverlay = new AreaOverlay(this);

    // Phaser tracks exactly one touch pointer unless told otherwise, so a
    // second finger was never delivered and `TouchGestureTracker` could not
    // see a pinch at all: two-finger zoom has been dead since the scene was
    // written, silently, because nothing exercised it in a real browser.
    // Three is one spare beyond the two the gestures use.
    //
    // Every count above is now read from the engine rather than from its
    // source. `tests/browser/world-scene-input.spec.ts` asks the live
    // `input.manager` after this line has run and gets four pointer entries,
    // `pointersTotal` 3 and `mousePointer` at index 0 -- one mouse, three
    // touch pointers -- with `inputActivePointers` still at its default of 1,
    // which is the "unless told otherwise" above. Deleting this line takes the
    // scene to one touch pointer and `addPointer(1)` to two, both measured by
    // applying them; that is the same spec, and it is what makes the count a
    // guarded number rather than a remembered one. #209 recorded this comment
    // as INFERRED twice, once because the audit could not tell which entry was
    // the mouse and once because the harness had no handle on the manager at
    // all; it is VERIFIED now, and that spec is what keeps it so.
    this.input.addPointer(2);

    /*
     * ---- a gesture in progress belongs to the world, not to the HUD --------
     *
     * The HUD frames the world and never covers it, but the islands in it that
     * take clicks have to take clicks: `.hud` is `pointer-events: none` and
     * `hud.css`'s "Every interactive island opts back in" rule restores `auto`
     * on `.hud-strip`, `.hud__aside > *`, `.hud__side > *` and
     * `.hud-tabs__inner` (whole panels), plus, inside `.hud__corner`, the
     * handful of actual controls named beneath that rule (issue #1054 --
     * `.hud__corner`'s own panels are not scroll containers, so opting the
     * whole panel in bought nothing and cost a press on their blank chrome).
     * Phaser listens for `mousemove` on **this canvas**
     * and nowhere else (`node_modules/phaser/src/input/mouse/MouseManager.js`,
     * `startListeners`; `boot` falls back to `manager.game.canvas` because
     * `src/main.ts`'s game config sets no `input.mouseEventTarget`), so a
     * left-drag that crossed one of those islands simply stopped being
     * delivered: the last move the canvas heard was the last move `extendBuild`
     * saw, `commitBuild` placed the run as it stood there, and a player who
     * dragged seven tiles got five walls and was told nothing at all -- no
     * refusal, no alert, no console line (issue #878).
     *
     * **Measured, at 1440x900, by
     * `tests/browser/playtest-878-what-a-drag-under-the-hud-reaches.playtest.ts`
     * across `a9219cfc` and `7bafc3a9` -- this branch's gate commit and the
     * commit that added this listener to it, so the listener is the only
     * difference between the two trees.** Seventy drags, each one
     * started on reachable canvas and pulled to the far edge of the visible
     * world: **1082 tiles drawn, 901 walls placed -- 83.3%, and 43 of the 70
     * drags built less than they drew**, the worst of them one wall for
     * fourteen tiles. With the listener the same run reports 1082 of 1082 --
     * 100%, and not one of the seventy drags short.
     *
     * **Reachability is a different measurement, it does not move, and it is a
     * curve rather than a number.** How much of the world takes a pointer at
     * all is `hud.css` against the window size -- the HUD is a frame of roughly
     * fixed pixel width around a playfield that shrinks -- so a single headline
     * figure for it is a figure about one window.
     * `tests/browser/playtest-878-viewports.playtest.ts` reports it across the
     * five viewports `ui-shell.spec.ts` already covers, and every row of it is
     * **identical before and after this change**, which is the point of
     * including it: nothing a renderer does can move where the HUD is, so a fix
     * that appeared to would be measuring something else.
     *
     *   viewport   canvas share   press-reachable tiles   largest free rect
     *   1440x900   64.1%          198 of 308 (64.3%)      144 of 308
     *   1280x720   56.1%          136 of 240 (56.7%)      100 of 240
     *   1024x768   49.6%           92 of 192 (47.9%)       60 of 192
     *    900x600   36.7%           40 of 126 (31.7%)       21 of 126
     *    375x812    8.2%          no 64x64 square of reachable canvas exists
     *
     * The first column is a fixed 16px sample grid with no calibrated origin in
     * it, and it is there because the tile counts are phase-sensitive: the same
     * method on the same tree read 198 and 202 free tile centres at 1440x900
     * from two different bisection squares, and a separate measurement read
     * 194. All three are the same ~64%.
     *
     * What the drag fidelity above measures is therefore **not** reachability.
     * 286 of 308 tiles could be reached by *some* drag even unfixed, because
     * the run is re-derived from the press on every move the canvas does hear,
     * so a drag whose *last* move happens to land back on canvas recovers its
     * whole run. Reachability was never the injury. Fidelity was.
     *
     * `setPointerCapture` makes this canvas the target of every subsequent
     * event for that pointer, so the rest of the drag arrives here whatever it
     * passes over, and the release arrives here too. The reachable band stops
     * mattering **while a gesture is in progress**, which is when it mattered.
     *
     * **Why this works at all, and it is not obvious.** Phaser never listens
     * for `pointermove` -- only `mousemove` and `touchmove` -- so a capture
     * that redirected *pointer* events alone would change nothing here. It
     * redirects the compatibility mouse events too: a pointer captured to an
     * element retargets the `mousemove`/`mouseup` derived from it to that same
     * element. That is the load-bearing fact of this fix and it was measured
     * rather than assumed -- the instrument above logs, for every move the
     * canvas hears, both the event target and what
     * `document.elementFromPoint` says was on top at that instant, and on this
     * tree it reports three moves with `target=CANVAS` while
     * `elementFromPoint` names `save-panel__button`, `save-panel__button`,
     * `save-panel__actions`. Without the capture the same drag produces six
     * moves, none of them over an island, and stops.
     *
     * **Why capture rather than reconstructing the missing part of the run.**
     * Interpolating between the last and first points the canvas heard would
     * put back the *commands* and not the gesture: the ghost would still freeze
     * at the island's edge, so the player would still be shown one thing and
     * given another, and every other pointer gesture -- the area rectangle, the
     * object footprint, the middle-drag pan -- would need its own copy of the
     * same repair. This is one line at the mechanism, and it fixes the class.
     *
     * **What it does not change, and this is the constraint that ruled the
     * alternatives out.** An island still takes a press that *lands* on it:
     * capture is claimed from a `pointerdown` **on the canvas**, so a press
     * that starts on the Build panel is never captured and the panel keeps it.
     * A drag that starts on the canvas and ends over a control does not click
     * that control -- which was already true, because a `click` needs its press
     * and its release on one element. Both halves are asserted at every
     * viewport by `tests/browser/world-scene-drag-under-the-hud.spec.ts`,
     * which is the gate for this change: a fix that took the pointer away from
     * the HUD would be a worse defect than the one it closed.
     *
     * **Unconditional, and not narrowed to an armed tool.** The middle-drag
     * pan loses its moves to an island in exactly the same way, so narrowing
     * this to a build gesture would leave that half broken. A `pointerType`
     * branch would be inert rather than wrong: touch never had this defect,
     * because a touch drag reaches the scene through `touchmove`, which Phaser
     * registers on this same canvas
     * (`node_modules/phaser/src/input/touch/TouchManager.js`,
     * `startListeners`, with the same `game.canvas` fallback), and the Touch
     * Events specification captures every `touchmove` and `touchend` of a
     * sequence to the element its `touchstart` hit. So there is nothing for a
     * branch to protect and nothing for the capture to spoil.
     *
     * It is not removed on `pointerup`: capture is released implicitly by the
     * browser when the pointer goes up or is cancelled, so releasing it by hand
     * would be a second mechanism for something the platform already does.
     *
     * It is not guarded, either, and the reason is that both of
     * `setPointerCapture`'s failure modes are excluded by where it is called
     * from. It throws `NotFoundError` for a `pointerId` that is not an active
     * pointer -- and this id came off a `pointerdown` that is being dispatched
     * -- and `InvalidStateError` for an element not connected to a document,
     * which cannot be true of the element that just received the event. A
     * `try`/`catch` here would swallow a fault that means something else.
     */
    const canvas = this.game.canvas;
    const capturePointer = (event: PointerEvent): void => {
      canvas.setPointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerdown', capturePointer);

    const keyDown = (event: KeyboardEvent): void => {
      this.handleActionEvents(this.keyboard.keyDown(event));
    };
    const keyUp = (event: KeyboardEvent): void => {
      this.handleActionEvents(this.keyboard.keyUp(event));
    };
    // A `keyup` goes to whichever window has focus, so holding a camera key and
    // alt-tabbing sends the release elsewhere and the key stays down forever --
    // measured at 1,419 world units of panning over three seconds, continuing
    // through refocus and through a click (issue #202). `window`'s `blur` is the
    // right event rather than `document.visibilitychange`: an
    // unfocused-but-visible window is exactly the case that produces this, and
    // `visibilitychange` does not fire for it. Phaser's own
    // `Core.Events.BLUR` would work too; `window` keeps this symmetric with the
    // two listeners above, so the pair is added and removed together.
    //
    // `cancelAllGestures()` closes the same gap for the mouse (issue #516):
    // a button released while the page has no focus can lose its `mouseup`
    // the same way a `keyup` does, and `buildPointerId`/`areaPointerId`/
    // `objectPointerId` have no timeout and no other listener that would ever
    // notice. Left alone, the ghost for whichever gesture was open keeps
    // following the cursor on plain hover -- `extendBuild` and its two
    // siblings match on a pointer id, not on whether a button is actually
    // down -- until `Escape` clears it by hand. Cancelling rather than
    // committing matches `keyboard.releaseAll()`'s own choice: a release that
    // never arrived is not evidence the player meant to finish the gesture,
    // it is evidence nothing is listening for them any more.
    const blur = (): void => {
      this.keyboard.releaseAll();
      this.cancelAllGestures();
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);

    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        const camera = this.cameras.main;
        const next = zoomAtScreenPoint(
          this.cameraState(),
          { x: pointer.x, y: pointer.y },
          camera.zoom * (deltaY > 0 ? 0.9 : 1.1),
          ZOOM_BOUNDS,
        );
        camera.setZoom(next.zoom);
        camera.setScroll(next.scroll.x, next.scroll.y);
      },
    );

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        this.touchGestures.begin({ id: pointer.id, x: pointer.x, y: pointer.y });
        // One finger builds only while a tool is armed *and* it is the only
        // finger down; a second finger arriving hands the gesture back to the
        // camera (see `pointermove`).
        if (this.activeTouchCount() === 1) {
          if (this.isBuildArmed()) this.beginBuild(pointer);
          else if (this.isObjectArmed()) this.beginObject(pointer);
          else if (this.isRoomArmed()) this.beginArea(pointer);
        }
        return;
      }
      if (pointer.button === 0 && this.isBuildArmed()) {
        this.beginBuild(pointer);
        return;
      }
      if (pointer.button === 0 && this.isObjectArmed()) {
        this.beginObject(pointer);
        return;
      }
      if (pointer.button === 0 && this.isRoomArmed()) {
        this.beginArea(pointer);
        return;
      }
      if (pointer.button !== 1) return;
      this.panPointerId = pointer.id;
      this.lastPanScreenPoint = { x: pointer.x, y: pointer.y };
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        const gesture = this.touchGestures.move({ id: pointer.id, x: pointer.x, y: pointer.y });
        if (gesture?.kind === 'pan') {
          // A one-finger drag builds while armed, and pans otherwise. Both
          // cannot be true at once, which is the whole reason arming is
          // explicit rather than inferred from a drag threshold.
          if (this.extendBuild(pointer)) return;
          if (this.extendObject(pointer)) return;
          if (this.extendArea(pointer)) return;
          const camera = this.cameras.main;
          camera.scrollX -= gesture.deltaX / camera.zoom;
          camera.scrollY -= gesture.deltaY / camera.zoom;
        } else if (gesture?.kind === 'pinch') {
          // Two fingers are always the camera, armed or not -- so a touch
          // player never loses the ability to move around while building.
          // A second finger abandons any run in progress rather than
          // committing a wall the player was actually trying to scroll past.
          this.cancelAllGestures();
          const camera = this.cameras.main;
          const panned = this.cameraState();
          const next = zoomAtScreenPoint(
            {
              ...panned,
              scroll: {
                x: panned.scroll.x - gesture.deltaX / camera.zoom,
                y: panned.scroll.y - gesture.deltaY / camera.zoom,
              },
            },
            { x: gesture.centerX, y: gesture.centerY },
            camera.zoom * gesture.scale,
            ZOOM_BOUNDS,
          );
          camera.setZoom(next.zoom);
          camera.setScroll(next.scroll.x, next.scroll.y);
        }
        return;
      }
      if (this.extendBuild(pointer)) return;
      if (this.extendObject(pointer)) return;
      if (this.extendArea(pointer)) return;
      // Nothing is being built and no button is down: keep the ghost under
      // the cursor so the edge rule is legible before the first click. Touch
      // never reaches here, which is why the drag preview exists as well.
      if (this.panPointerId === undefined && this.isBuildArmed()) this.previewHover(pointer);
      // The same, one tool over, and here the preview says something the other
      // two cannot: a bed is 1x2, so the footprint rectangle is how the player
      // learns which *two* tiles a press will claim before they press.
      else if (this.panPointerId === undefined && this.isObjectArmed()) this.previewObjectHover(pointer);
      // The same, one tool over: a single-tile mark under the cursor, so the
      // armed area tool is visibly armed before the first press. It says less
      // than the wall ghost does -- there is no rule to teach -- but an armed
      // tool that shows nothing reads as a tab that did nothing.
      else if (this.panPointerId === undefined && this.isRoomArmed()) this.previewAreaHover(pointer);
      if (this.panPointerId !== pointer.id || this.lastPanScreenPoint === undefined) return;
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.lastPanScreenPoint.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.lastPanScreenPoint.y) / camera.zoom;
      this.lastPanScreenPoint = { x: pointer.x, y: pointer.y };
    });
    const finishPointer = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.wasTouch) this.touchGestures.end(pointer.id);
      if (this.commitBuild(pointer)) return;
      if (this.commitObject(pointer)) return;
      if (this.commitArea(pointer)) return;
      if (pointer.wasTouch) return;
      if (this.panPointerId !== pointer.id) return;
      this.panPointerId = undefined;
      this.lastPanScreenPoint = undefined;
    };
    this.input.on('pointerup', finishPointer);
    this.input.on('pointerupoutside', finishPointer);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', capturePointer);
      this.tiles?.destroy();
      this.roomLabels?.destroy();
      this.actors?.destroy();
      this.buildOverlay?.destroy();
      this.areaOverlay?.destroy();
      this.objectOverlay?.destroy();
      this.tiles = undefined;
      this.roomLabels = undefined;
      this.actors = undefined;
      this.buildOverlay = undefined;
      this.areaOverlay = undefined;
      this.objectOverlay = undefined;
    });

    // Art is not correctness: a batch that fails to load must leave a playable,
    // legible tile world rather than a blank screen.
    void this.loadActorAtlases();
    void this.loadEnvironmentArt();
  }

  public override update(time: number, delta: number): void {
    const camera = this.cameras.main;
    const speed = (PAN_SPEED_WORLD_UNITS_PER_MS * delta) / camera.zoom;
    const horizontal = Number(this.keyboard.isActive('camera.right')) - Number(this.keyboard.isActive('camera.left'));
    const vertical = Number(this.keyboard.isActive('camera.down')) - Number(this.keyboard.isActive('camera.up'));
    if (horizontal !== 0 || vertical !== 0) {
      camera.scrollX += horizontal * speed;
      camera.scrollY += vertical * speed;
    }

    // Disarming while a run is in progress, or while a ghost is showing,
    // must take the ghost away -- otherwise the panel says the tool is off
    // and the world still shows a wall about to appear.
    if (!this.isBuildArmed() && (this.buildPointerId !== undefined || this.buildSegments.length > 0)) {
      this.cancelBuild();
      this.buildSegments = [];
      this.hoveredEdge = undefined;
      this.buildOverlay?.clear();
    }
    if (!this.isRoomArmed() && (this.areaPointerId !== undefined || this.areaRect !== undefined)) {
      this.cancelArea();
      this.areaRect = undefined;
      this.hoveredTile = undefined;
      this.areaOverlay?.clear();
    }
    if (!this.isObjectArmed() && (this.objectPointerId !== undefined || this.objectRect !== undefined)) {
      this.cancelObject();
      this.objectRect = undefined;
      this.hoveredObjectTile = undefined;
      this.objectOverlay?.clear();
    }

    const nowSeconds = time / 1000;
    const frame = this.feed.readFrame(nowSeconds);
    const range = this.visibleTiles();

    this.lastLoadedBounds = frame.world.loadedBounds;
    this.frameCameraOnFirstWorld(frame.world.loadedBounds);
    this.tiles?.update(frame, range);
    // After the tiles and with the same frame, because the two must not be able
    // to disagree: a name is only ever true of the floor it is written on, and
    // that floor is painted from this exact `frame.world` (`room-label-layer.ts`
    // records what the 30-second geometry window does and does not do to that).
    this.roomLabels?.update(frame, range, this.cameras.main.zoom);
    this.actors?.update(frame.actors, range, nowSeconds);
    // Handed over every frame rather than read once: `frame.world` is replaced
    // wholesale on every snapshot (`WorldRenderView.fromSnapshot`), and this is
    // the one point in the scene that already holds the newest one. The room
    // tool's own copy of it is then never more than one rendered frame behind
    // whatever the walls on screen actually are (issue #493) -- no additional
    // request to the worker, because this reference was already being read for
    // the repaint above.
    this.roomTool?.setWorld?.(frame.world);
  }


  // ---- semantic actions ---------------------------------------------

  /**
   * What the game does when a key that means something is pressed.
   *
   * The other half of the input tier, and until now the missing one. Camera
   * panning is a **poll**: `update()` asks `isActive` four times a frame,
   * because a held key should move the camera by an amount proportional to the
   * frame it was held for. That works for `continuous` actions and cannot work
   * for a `discrete` one -- "zoom in" is not a thing you do for 16 ms -- so
   * `Equal`, `Minus` and `Escape` were bound to actions nothing could serve.
   * Measured in a browser: five presses of `Equal` left the zoom at 1, and
   * `Escape` pressed mid-drag neither cleared the pending wall run nor stopped
   * it committing (#200).
   *
   * `KeyboardInputAdapter.keyDown`/`keyUp` have always returned the events;
   * both return values were discarded at the two call sites above, which is why
   * `docs/INPUT.md`'s opening claim that "consumers receive semantic action
   * IDs" described nothing. They receive them here.
   *
   * **`'started'` only, and that is a rule rather than a filter that looks like
   * one.** A press produces `'started'` and the release produces `'ended'`, so
   * acting on both would zoom twice per press and cancel twice per `Escape`.
   * It is written in the consumer rather than pushed back into `eventsFor`,
   * where an unconditionally-true version of exactly this predicate used to sit
   * (#200 item 4): what an action *means* on release is the reader's business,
   * and a future consumer that wants a key-up -- a held modifier, a
   * press-and-hold -- must not have to undo a rule the adapter imposed.
   *
   * Continuous actions reach this loop and fall through the switch. There is no
   * `behavior` check guarding that, deliberately: with only discrete cases
   * listed, one could never change an outcome, and an inert check that reads as
   * a rule is the defect this file's history is made of. The invariant is
   * asserted where it can fail loudly instead --
   * `tests/foundation/unconsumed-action-contract.test.ts` pins that every
   * polled action is `continuous` and every action switched on here is
   * `discrete`.
   */
  private handleActionEvents(events: readonly SemanticActionEvent[]): void {
    for (const event of events) {
      if (event.phase !== 'started') continue;
      switch (event.action) {
        case 'camera.zoom.in':
          this.stepZoom(KEYBOARD_ZOOM_STEP);
          break;
        case 'camera.zoom.out':
          this.stepZoom(1 / KEYBOARD_ZOOM_STEP);
          break;
        case 'build.cancel': {
          /*
           * One key, two states, in an order the player can predict (#959).
           *
           * **The gesture first.** All three of them: at most one has
           * anything in progress -- the tools are armed from panels on
           * different tabs and leaving a tab disarms its tool -- and each is
           * a no-op with nothing to abandon, so `Escape` cannot cancel the
           * wrong one.
           *
           * **Then the tool, on a press that found no gesture.** Until #959
           * this case stopped at the line above, so `Escape` cleared a
           * half-drawn run and never touched the arming: the tool stayed
           * live, the press said nothing, and the next drag on what the
           * player believed was a disarmed world laid walls. Measured by
           * playing -- two accepted `PlaceBuildOrder`s and 160 off the funds
           * chip, with the clock paused.
           *
           * The ordering is the whole decision, and it is why this is not one
           * more call beside the three above. A half-drawn run and an armed
           * tool are two different states; a key that cleared both at once
           * would take the tool away from a player who only wanted their
           * crooked run back, on a control they cannot get back without
           * finding the panel. So the first press costs the gesture and
           * leaves the tool in their hand, and a second press -- or a first
           * one with nothing drawn -- puts it down.
           *
           * Read *before* the cancel, because the cancel is what makes it
           * false.
           */
          const abandoned = this.gestureInProgress();
          this.cancelAllGestures();
          if (!abandoned) this.toolStandDown?.standDown();
          break;
        }
        /*
         * Reported, not performed. Undo reverses a *simulation* transaction --
         * the orders a gesture placed -- and `src/rendering/` may not submit a
         * command (`tests/unit/rendering-module-boundaries.test.ts`). What
         * belongs here is the half nothing else can do: recognising the key in
         * the `world` context and not in `text-entry` (#261).
         */
        case 'edit.undo':
          this.editHistory?.undo();
          break;
        case 'edit.redo':
          this.editHistory?.redo();
          break;
        default:
          break;
      }
    }
  }

  /**
   * Zooms about the middle of the viewport.
   *
   * The wheel and the pinch zoom about the point the player indicated, because
   * they have one. A key does not, and the centre is the only choice that does
   * not invent an intention: zooming about the last cursor position would move
   * the world under a pointer the player was not using, and zooming about the
   * camera origin would drift whatever they were looking at off screen.
   *
   * Routed through `zoomAtScreenPoint` rather than `camera.setZoom` alone so
   * the clamp to `ZOOM_BOUNDS` and the scroll correction are the same code the
   * other two zoom paths use. `setZoom` on its own would let a key walk the
   * zoom past the bounds the wheel respects.
   */
  private stepZoom(factor: number): void {
    const camera = this.cameras.main;
    const state = this.cameraState();
    const next = zoomAtScreenPoint(
      state,
      { x: state.viewport.width / 2, y: state.viewport.height / 2 },
      camera.zoom * factor,
      ZOOM_BOUNDS,
    );
    camera.setZoom(next.zoom);
    camera.setScroll(next.scroll.x, next.scroll.y);
  }

  /**
   * One zoom step for a control that is not a key (issue #1023).
   *
   * The range `ZOOM_BOUNDS` declares has been reachable on the wheel, on a
   * pinch and on `+`/`-` since this scene was written, and nothing on screen
   * said so -- no zoom control existed in the HUD at all, which is issue
   * #1023's whole subject. This is the seam the HUD's pair of buttons presses
   * through, and it is public for the same reason `navigateToMinimapPoint`
   * above is: the HUD may not import `src/rendering/**` (`AGENTS.md` boundary
   * 1), so the composition root joins the two.
   *
   * **Deliberately the keyboard's step and the keyboard's code path, not a
   * second zoom.** `KEYBOARD_ZOOM_STEP` one way and its reciprocal the other,
   * through `stepZoom`, so a button press and a key press are the same
   * movement about the same point and eight presses cross the whole range --
   * the property that constant's own comment was chosen for. A separate
   * factor here would give the game two zooms that disagree about how far one
   * press goes, and a `camera.setZoom` of its own would walk past the bounds
   * the wheel respects, which is the mistake `stepZoom` documents.
   *
   * Presentational only, per `AGENTS.md` boundary 1: writes
   * `this.cameras.main` and nothing else, exactly as every other camera
   * gesture on this scene does. No simulation command is built or sent.
   */
  public stepCameraZoom(direction: 'in' | 'out'): void {
    this.stepZoom(direction === 'in' ? KEYBOARD_ZOOM_STEP : 1 / KEYBOARD_ZOOM_STEP);
  }

  // ---- build tool ---------------------------------------------------
  //
  // The interaction is **modal**, and deliberately so. The alternative --
  // discriminating a build from a pan by how far the pointer travelled --
  // fails on the gesture that matters most here: laying a wall run *is* a
  // drag, so a threshold cannot tell the two apart without guessing, and a
  // guess that goes wrong either scrolls the world when you meant to build or
  // builds a wall when you meant to look around. Arming is one visible,
  // reversible toggle in the Build panel, and while it is off every gesture
  // keeps exactly the meaning it had before.
  //
  // Nothing that used to pan stops panning: the middle-drag, the keyboard and
  // the wheel are untouched at all times, and on touch the two-finger drag
  // pans and pinches whether or not a tool is armed. Only the one-finger
  // touch drag and the desktop left-drag change meaning, and only while
  // armed.

  private isBuildArmed(): boolean {
    return this.buildTool?.isArmed() === true;
  }

  /**
   * Whether the world pointer designates an area.
   *
   * Asked *after* `isBuildArmed()` at every call site, which is what makes the
   * arbitration total: both tools being armed at once cannot happen -- they are
   * armed from panels on different tabs, and `setVisible(false)` disarms the
   * panel's tool as it leaves -- but if it ever did, the build tool wins and
   * one gesture happens rather than two interleaved ones.
   */
  private isRoomArmed(): boolean {
    return (
      this.buildTool?.isArmed() !== true &&
      this.objectTool?.isArmed() !== true &&
      this.roomTool?.isArmed() === true
    );
  }

  /**
   * Whether the world pointer places an object.
   *
   * Asked *after* `isBuildArmed()` and *before* `isRoomArmed()` at every call
   * site, which is what keeps the three-way arbitration total. The build and
   * object tools are both armed from the Build panel and the panel arms exactly
   * one of them -- whichever the selected row needs -- so both being true at
   * once cannot happen; if it ever did, the build tool wins and one gesture
   * happens rather than two interleaved ones.
   *
   * A tool armed with nothing selected is not armed: `footprint()` answering
   * `undefined` would leave the preview with no size to draw, and an armed tool
   * that shows nothing reads as a broken world.
   */
  private isObjectArmed(): boolean {
    return (
      this.buildTool?.isArmed() !== true &&
      this.objectTool?.isArmed() === true &&
      this.objectTool.footprint() !== undefined
    );
  }

  private activeTouchCount(): number {
    return this.input.manager.pointers.filter((pointer) => pointer.isDown && pointer.wasTouch).length;
  }

  /**
   * The live camera, in the shape `src/rendering/camera/` transforms.
   *
   * One reader for all four call sites (wheel zoom, pinch zoom, pointer-to-
   * world and culling) so none of them can be left behind holding a stale
   * shape -- `viewport` became mandatory in #115 precisely because a
   * conversion that does not know the viewport size is wrong at every zoom
   * except 1.
   */
  private cameraState(): CameraState {
    const camera = this.cameras.main;
    return {
      scroll: { x: camera.scrollX, y: camera.scrollY },
      zoom: camera.zoom,
      viewport: { width: camera.width, height: camera.height },
    };
  }

  /**
   * The world point under a pointer.
   *
   * `pointer.x`/`pointer.y` are logical CSS pixels in canvas space, and the
   * main camera's viewport is the whole canvas, so they need no adjustment
   * before the transform. `tests/browser/camera-coordinates.spec.ts` drives a
   * real mouse at a real camera to check both halves of that sentence.
   */
  private worldPointOf(pointer: Phaser.Input.Pointer): { readonly x: number; readonly y: number } {
    return screenToWorld({ x: pointer.x, y: pointer.y }, this.cameraState());
  }

  private beginBuild(pointer: Phaser.Input.Pointer): void {
    // The *press point* is kept, not the edge it resolved to: a drag can still
    // change which axis the run lies on, and re-deriving from the original
    // point is what lets it do that without moving the tile the player aimed
    // at. See `edgeRunFromDrag`.
    this.buildPointerId = pointer.id;
    this.buildPress = this.worldPointOf(pointer);
    this.buildSegments = [pickEdgeAtWorld(this.buildPress)];
    this.paintBuildPreview();
  }

  /** True when the move belonged to a run in progress and the camera must not act on it. */
  private extendBuild(pointer: Phaser.Input.Pointer): boolean {
    if (this.buildPointerId !== pointer.id || this.buildPress === undefined) return false;
    // #516: this pointer's release may have happened with nothing left to
    // hear it. Detected here rather than only at `blur`, because focus never
    // has to leave the page for a `pointerup` to go missing -- see
    // `releaseMissed`. Returning `false` after cancelling lets this same move
    // fall through to the ordinary armed-hover path below, so the ghost is
    // repainted at the current position on this move rather than one move
    // later.
    if (this.releaseMissed(pointer)) {
      this.cancelBuild();
      this.hoveredEdge = undefined;
      return false;
    }
    this.buildSegments = edgeRunFromDrag(this.buildPress, this.worldPointOf(pointer));
    this.paintBuildPreview();
    return true;
  }

  /** True when the release completed a run. */
  private commitBuild(pointer: Phaser.Input.Pointer): boolean {
    if (this.buildPointerId !== pointer.id) return false;
    const segments = this.buildSegments;
    this.buildPointerId = undefined;
    this.buildPress = undefined;
    this.buildSegments = [];
    this.hoveredEdge = undefined;
    this.buildOverlay?.clear();
    this.buildTool?.target?.(undefined);
    if (segments.length > 0) this.buildTool?.place(segments);
    return true;
  }

  /**
   * Abandons a run without placing anything.
   *
   * Five ways in: a second finger arriving during a pinch, the tool being
   * disarmed mid-gesture, `Escape` (`build.cancel`, #200 item 2), the window
   * losing focus (`blur`, #516 -- the same recovery #202 added for a held key),
   * and a hover move that proves this pointer's release never reached
   * `pointerup`/`pointerupoutside` at all (`extendBuild`'s `releaseMissed`
   * check, #516). The early return means `Escape` with nothing in progress
   * does nothing, which is the truthful behaviour -- there is no run to
   * abandon, and clearing the hover ghost as well would take away the preview
   * the armed tool is supposed to be showing.
   *
   * It leaves the pointer down. A player who presses `Escape` mid-drag and
   * keeps dragging gets the ordinary armed-hover preview back, and the release
   * places nothing, because `commitBuild` matches on a `buildPointerId` this
   * has cleared.
   */
  private cancelBuild(): void {
    if (this.buildPointerId === undefined) return;
    this.buildPointerId = undefined;
    this.buildPress = undefined;
    this.buildSegments = [];
    this.buildOverlay?.clear();
    this.buildTool?.target?.(undefined);
  }

  /**
   * The press corner is kept, exactly as `beginBuild` keeps its press point,
   * and for a related reason: a drag can still change which corner the
   * rectangle grows from, and re-deriving from the original point is what lets
   * a drag reverse direction without moving the tile the player aimed at.
   */
  private beginArea(pointer: Phaser.Input.Pointer): void {
    this.areaPointerId = pointer.id;
    this.areaPress = this.worldPointOf(pointer);
    this.areaRect = pickTileAtWorld(this.areaPress);
    this.paintAreaPreview();
  }

  /** True when the move belonged to an area gesture and the camera must not act on it. */
  private extendArea(pointer: Phaser.Input.Pointer): boolean {
    if (this.areaPointerId !== pointer.id || this.areaPress === undefined) return false;
    // #516: the same recovery `extendBuild` performs, for the same reason --
    // see `releaseMissed`.
    if (this.releaseMissed(pointer)) {
      this.cancelArea();
      this.hoveredTile = undefined;
      return false;
    }
    this.areaRect = tileRectFromDrag(this.areaPress, this.worldPointOf(pointer));
    this.paintAreaPreview();
    return true;
  }

  /** True when the release completed an area gesture. */
  private commitArea(pointer: Phaser.Input.Pointer): boolean {
    if (this.areaPointerId !== pointer.id) return false;
    const rect = this.areaRect;
    this.areaPointerId = undefined;
    this.areaPress = undefined;
    this.areaRect = undefined;
    this.hoveredTile = undefined;
    this.areaOverlay?.clear();
    this.roomTool?.target?.(undefined);
    if (rect !== undefined) this.roomTool?.place(rect);
    return true;
  }

  /**
   * Abandons an area gesture without designating anything.
   *
   * The same five ways in as `cancelBuild`, the same early return for the
   * same reason -- `Escape` with nothing in progress does nothing, which is the
   * truthful behaviour -- and it leaves the pointer down, so a player who
   * presses `Escape` mid-drag and keeps dragging designates nothing on release,
   * because `commitArea` matches on an `areaPointerId` this has cleared.
   */
  private cancelArea(): void {
    if (this.areaPointerId === undefined) return;
    this.areaPointerId = undefined;
    this.areaPress = undefined;
    this.areaRect = undefined;
    this.areaOverlay?.clear();
    this.roomTool?.target?.(undefined);
  }

  /**
   * The press that will place an object.
   *
   * Unlike `beginArea` this keeps no press *point*: the gesture is one press on
   * one tile (ADR 0028 decision 5), so there is no second corner for a drag to
   * move and nothing to re-derive from. What a drag does instead is carry the
   * ghost with the pointer -- `extendObject` -- so a player who presses one tile
   * short can slide onto the right one before releasing, which is the forgiving
   * behaviour and the one a touch player needs.
   */
  private beginObject(pointer: Phaser.Input.Pointer): void {
    this.objectPointerId = pointer.id;
    this.objectRect = this.footprintUnder(pointer);
    this.paintObjectPreview();
  }

  /** True when the move belonged to an object gesture and the camera must not act on it. */
  private extendObject(pointer: Phaser.Input.Pointer): boolean {
    if (this.objectPointerId !== pointer.id) return false;
    // #516: the same recovery `extendBuild` performs, for the same reason --
    // see `releaseMissed`.
    if (this.releaseMissed(pointer)) {
      this.cancelObject();
      this.hoveredObjectTile = undefined;
      return false;
    }
    this.objectRect = this.footprintUnder(pointer);
    this.paintObjectPreview();
    return true;
  }

  /** True when the release completed an object gesture. */
  private commitObject(pointer: Phaser.Input.Pointer): boolean {
    if (this.objectPointerId !== pointer.id) return false;
    const rect = this.objectRect;
    this.objectPointerId = undefined;
    this.objectRect = undefined;
    this.hoveredObjectTile = undefined;
    this.objectOverlay?.clear();
    this.objectTool?.target?.(undefined);
    // The *anchor*, not the rectangle: the tool and the command both take one
    // tile, and the rectangle only ever existed so the player could see what a
    // press would claim.
    //
    // `edge` (ADR 0106) is computed unconditionally, from the release pointer
    // -- the same point the tile above is already tracking, so the two agree
    // about where the gesture ended even after a drag corrects it. It is
    // computed here rather than only while removing because deciding which
    // arm reads it is `ObjectTool.place`'s job, not this scene's: the scene
    // reports the geometry a press resolved to and the tool decides what a
    // press means, exactly as `isRemoving()` is read for the preview colour
    // alone and never for what a press *does*.
    if (rect !== undefined) {
      this.objectTool?.place({
        tileX: rect.tileX,
        tileY: rect.tileY,
        edge: pickEdgeAtWorld(this.worldPointOf(pointer)).edge,
      });
    }
    return true;
  }

  /**
   * Abandons an object gesture without placing anything.
   *
   * The same five ways in as `cancelBuild` and `cancelArea`, the same early
   * return for the same reason, and it leaves the pointer down -- so a player
   * who presses `Escape` mid-drag and keeps dragging places nothing on release,
   * because `commitObject` matches on an `objectPointerId` this has cleared.
   */
  private cancelObject(): void {
    if (this.objectPointerId === undefined) return;
    this.objectPointerId = undefined;
    this.objectRect = undefined;
    this.objectOverlay?.clear();
    this.objectTool?.target?.(undefined);
  }

  /**
   * Abandons whichever of the three pointer gestures is in progress, without
   * placing anything.
   *
   * Exists so the three call sites that need "all three, unconditionally" --
   * a second finger arriving mid-pinch, `Escape` (`build.cancel`), and now
   * `blur` (#516) -- say so once rather than repeating the same three calls
   * each time a fourth needed them. Each `cancel*` already returns immediately
   * when its own pointer id is `undefined` (see `cancelBuild`), so calling all
   * three here is exactly as safe as it was at each call site before this
   * existed: at most one of the three ever has anything to abandon, because
   * the tools are armed from panels on different tabs and `isRoomArmed`/
   * `isObjectArmed` already arbitrate the rest.
   */
  private cancelAllGestures(): void {
    this.cancelBuild();
    this.cancelObject();
    this.cancelArea();
  }

  /**
   * Whether a pointer currently owns one of the three gestures (#959).
   *
   * The same condition each `cancel*` early-returns on, asked once and from
   * the outside -- so `build.cancel` can tell "this press took a half-drawn
   * run" from "this press found nothing to take" without any of the three
   * having to report back. Making the three return a boolean was the
   * alternative and was rejected: `blur` and the pinch branch call them for
   * their effect and would then be discarding a value, and a `cancel` that
   * answers a question is a second contract on a function whose whole job is
   * to leave no trace.
   *
   * A *hover ghost* is deliberately not a gesture here. `buildSegments` holds
   * one edge while an armed tool merely previews under the cursor, with no
   * pointer id, and treating that as something to abandon would put the
   * player's first `Escape` into a state they cannot see: the preview would
   * go and the panel would still say the tool is on, which is exactly the
   * disagreement #200 wrote its hover assertion to prevent.
   */
  private gestureInProgress(): boolean {
    return this.buildPointerId !== undefined || this.objectPointerId !== undefined || this.areaPointerId !== undefined;
  }

  /**
   * True when a plain move proves this pointer's release never reached the
   * page as an explicit `pointerup`/`pointerupoutside` (issue #516).
   *
   * `commitBuild`/`commitArea`/`commitObject` only ever run from those two
   * Phaser events, and nothing else watches for a release going missing --
   * `blur` (above) covers the window losing focus, but a `pointerup` can go
   * missing without focus ever leaving the page (a driver dropping the event,
   * a release the browser delivers to a different element under pointer
   * capture in a way this app never sees). When that happens the gesture's
   * pointer id survives untouched, and the next plain hover move recomputes
   * the pending run/rectangle against the *original* press point as though the
   * button were still down -- reproduced twice in #516's evidence, including
   * `Escape` being the only thing that ever cleared it.
   *
   * `pointer.buttons` is Phaser's own bitmask, current as of this call: `0`
   * means the engine believes no button is held.
   *
   * `!pointer.wasTouch` is not a hedge, it is load-bearing, and it is checked
   * first: a touch pointer's `buttons` is set to `1` once, by `touchstart`,
   * and a plain `touchmove` never revisits it -- only `touchend` sets it back
   * to `0` (`node_modules/phaser/src/input/Pointer.js`, `touchstart`/
   * `touchmove`/`touchend`). So a touch drag's `pointermove` events never
   * legitimately read `buttons === 0` while the finger is still down, and the
   * one touch event that does carry `0` (`touchend`) already fires
   * `pointerup`/`pointerupoutside` first, through the ordinary commit path,
   * before any further move could observe it. Without this guard a second
   * finger arriving mid-drag -- which the `pinch` branch above already
   * cancels on purpose, through `cancelAllGestures()` -- would risk this
   * running too on a gesture that is not actually abandoned; with it, this
   * function only ever answers `true` for the mouse.
   */
  private releaseMissed(pointer: Phaser.Input.Pointer): boolean {
    return !pointer.wasTouch && pointer.buttons === 0;
  }

  private previewObjectHover(pointer: Phaser.Input.Pointer): void {
    const rect = this.footprintUnder(pointer);
    if (tileRectsEqual(rect, this.hoveredObjectTile)) return;
    this.hoveredObjectTile = rect;
    this.objectRect = rect;
    this.paintObjectPreview();
  }

  /**
   * The footprint rectangle under a pointer, or `undefined` when the tool has
   * no size to draw.
   *
   * `undefined` is unreachable from every call site, because `isObjectArmed()`
   * already requires a footprint -- and it is answered rather than asserted
   * because the alternative is a non-null assertion inside a pointer handler.
   */
  private footprintUnder(pointer: Phaser.Input.Pointer): TileRect | undefined {
    const footprint = this.objectTool?.footprint();
    if (footprint === undefined) return undefined;
    return footprintRectAt(pickTileAtWorld(this.worldPointOf(pointer)), footprint);
  }

  private paintObjectPreview(): void {
    // No tint while the gesture removes, exactly as the area preview passes none
    // for a removal drag: `AreaOverlay.update` reads an absent colour as "this
    // gesture takes something away" and draws its own removal fill and outline.
    // So the removal look costs nothing new here, and the scene still learns
    // only which preview to draw -- never which command the press becomes.
    this.objectOverlay?.update(this.objectRect, this.objectTool?.isRemoving() === true ? undefined : this.objectTint?.());
    this.objectTool?.target?.(this.objectRect);
  }

  private previewAreaHover(pointer: Phaser.Input.Pointer): void {
    const rect = pickTileAtWorld(this.worldPointOf(pointer));
    if (tileRectsEqual(rect, this.hoveredTile)) return;
    this.hoveredTile = rect;
    this.areaRect = rect;
    this.paintAreaPreview();
  }

  /**
   * The tint is read here rather than cached, so changing the selected room
   * type repaints the preview under a stationary pointer on the next move
   * without the panel having to tell the scene anything.
   */
  private paintAreaPreview(): void {
    this.areaOverlay?.update(this.areaRect, this.roomTool?.isRemoving() === true ? undefined : this.roomTint?.());
    this.roomTool?.target?.(this.areaRect);
  }

  private previewHover(pointer: Phaser.Input.Pointer): void {
    const edge = pickEdgeAtWorld(this.worldPointOf(pointer));
    if (edgeTargetsEqual(edge, this.hoveredEdge)) return;
    this.hoveredEdge = edge;
    this.buildSegments = [edge];
    this.paintBuildPreview();
  }

  private paintBuildPreview(): void {
    this.buildOverlay?.update(this.buildSegments);
    this.buildTool?.target?.(this.buildSegments);
  }

  /** Sprite and layer counts, for a diagnostics overlay or a manual budget check. */
  public get rendererStats(): {
    readonly actors: number;
    readonly pooledSprites: number;
    readonly tileObjects: number;
    /** Actors this frame whose logical asset id has no loaded clip -- `ActorLayer.stats.unresolved`. Zero is the healthy number. */
    readonly unresolvedActors: number;
  } {
    const stats = this.actors?.stats;
    return {
      actors: stats?.visible ?? 0,
      pooledSprites: stats?.pooled ?? 0,
      tileObjects: this.tiles?.pooledObjectCount ?? 0,
      unresolvedActors: stats?.unresolved ?? 0,
    };
  }

  private visibleTiles(): TileRange {
    return visibleTileRange(visibleWorldBounds(this.cameraState()), 1);
  }

  /** Points the camera at the prison the first time one exists, then never again. */
  private frameCameraOnFirstWorld(
    bounds: { readonly minTileX: number; readonly minTileY: number; readonly maxTileX: number; readonly maxTileY: number } | undefined,
  ): void {
    if (this.framedOnWorld || bounds === undefined) return;
    this.framedOnWorld = true;
    this.cameras.main.centerOn(
      ((bounds.minTileX + bounds.maxTileX + 1) / 2) * TILE_SIZE_PX,
      ((bounds.minTileY + bounds.maxTileY + 1) / 2) * TILE_SIZE_PX,
    );
  }

  /**
   * Moves the camera to the world position a point on `.hud-minimap__surface`
   * represents (issue #793): the minimap accepted clicks and did nothing with
   * them, and the owner's ruling is that it should navigate.
   *
   * **The mapping, established from the code rather than guessed.** The
   * surface has no rendered content of its own (`hud.ts`'s comment on it:
   * *"Minimap rendering belongs to the renderer, not to the HUD; this is the
   * frame it will draw into"*) -- so before this change it represented no
   * region of the world at all, which is itself the finding the issue asked
   * for. The one existing definition of "how big is the world" in this
   * codebase is `WorldRenderView.loadedBounds` -- everything the simulation
   * has materialised, the same bounds `frameCameraOnFirstWorld` above uses to
   * frame a session's first paint, and the same bounds `world-view.ts`'s own
   * comment glosses as answering that exact question. `fx`/`fy` -- normalized
   * to the surface's own box, `0,0` top-left and `1,1` bottom-right -- are
   * read linearly across that rectangle in tile space, and the result is
   * centred on the camera at this scene's own `TILE_SIZE_PX`. Two
   * alternatives were considered and rejected: the *owned* chunks alone would
   * leave every unowned-but-loaded tile the frontier can reach (#792 §4)
   * outside the map, silently narrowing "the world" to less than the scene
   * already draws; a *fixed* world size does not exist anywhere in this
   * codebase to read (the world is sparse and grows by construction, exactly
   * what boundary 8 asks for) and inventing one here would be a second,
   * disagreeing definition of a fact `WorldRenderView` already owns.
   *
   * **Every point in the surface maps to a tile** as long as any world is
   * loaded: the mapping is a plain linear reparameterisation of the whole
   * `[0,1]x[0,1]` box onto the whole loaded rectangle, with no sub-region
   * excluded. The one input that cannot be mapped is `lastLoadedBounds`
   * itself being `undefined` -- no session has ever published a world to this
   * feed, which is the state of the page before a prison exists (or of a
   * `Worker`-less page, `NO_SIMULATION_FEED`) -- and that is reported to the
   * caller as `false` rather than silently doing nothing, so the HUD can tell
   * the player their click found nothing instead of repeating the exact
   * silence issue #793 is about.
   *
   * Presentational only, per `AGENTS.md` boundary 1: reads `lastLoadedBounds`
   * (a cached copy of a value already read for rendering) and writes only
   * `this.cameras.main`. No simulation command is built or sent, matching
   * every other camera gesture (drag, wheel, keyboard) on this scene.
   */
  public navigateToMinimapPoint(fx: number, fy: number): boolean {
    const bounds = this.lastLoadedBounds;
    if (bounds === undefined) return false;
    const clampedX = Math.min(1, Math.max(0, fx));
    const clampedY = Math.min(1, Math.max(0, fy));
    const tileX = bounds.minTileX + clampedX * (bounds.maxTileX - bounds.minTileX + 1);
    const tileY = bounds.minTileY + clampedY * (bounds.maxTileY - bounds.minTileY + 1);
    this.cameras.main.centerOn(tileToWorld(tileX), tileToWorld(tileY));
    return true;
  }

  /**
   * Fetches the environment sheets, cuts the reviewed sprites out of them and
   * hands the result to the tile layer.
   *
   * Started from `create` and never awaited, so the first frames of a session
   * are drawn as coloured blocks and repainted once when the sheets arrive.
   * That ordering is the contract, not a compromise: `docs/RENDERING.md` says
   * art failing to load leaves a playable, legible tile world, and a boot that
   * waited on several megabytes of PNG would break it in the other direction.
   */
  private async loadEnvironmentArt(): Promise<void> {
    try {
      // Both catalogs in parallel: two independent downloads
      // (`loadRenderedArtCatalog`'s own docstring says why), and both are
      // awaited before either is used -- one `catch` covers both fetches and
      // the plan/pack that follows, so a rendered-art failure leaves the
      // coloured-block world exactly as a source-art failure already did,
      // rather than publishing a partial atlas.
      const [sourceArt, renderedArt] = await Promise.all([this.loadSourceArtCatalog(), this.loadRenderedArtCatalog()]);
      const art = await loadEnvironmentAtlas(this, planEnvironmentAtlas(sourceArt, undefined, renderedArt));
      // The scene may have shut down while the batch was in flight.
      if (this.tiles === undefined) return;
      this.tiles.setEnvironmentArt(art);
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async loadActorAtlases(): Promise<void> {
    try {
      const library = await this.loadAtlasLibrary();
      const index = AtlasFrameIndex.fromLibrary(library);
      await registerAtlasTextures(this, index);
      // The scene may have shut down while the batch was in flight.
      if (this.tiles === undefined) return;
      this.actors = new ActorLayer(this, index);
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
