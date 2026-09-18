/**
 * The contract between the in-page world-scene harness
 * (`world-scene-harness.ts`) and `world-scene-input.spec.ts`.
 *
 * Every value crossing `page.evaluate` must be structured-clone-safe, so this
 * exposes plain numbers rather than Phaser cameras.
 */

/** Where the main camera is looking. */
export interface CameraScroll {
  readonly x: number;
  readonly y: number;
}

/**
 * A point in the camera's viewport, in the CSS pixels a Phaser pointer reports.
 *
 * The same coordinate space `CameraScroll` is not: this one is screen-space.
 */
export interface HarnessPoint {
  readonly x: number;
  readonly y: number;
}

/** One tile edge, flattened out of `EdgeTarget` so it crosses `page.evaluate`. */
export interface HarnessEdge {
  readonly tileX: number;
  readonly tileY: number;
  readonly edge: string;
}

/** One tile rectangle, flattened out of `TileRect` so it crosses `page.evaluate`. */
export interface HarnessRect {
  readonly tileX: number;
  readonly tileY: number;
  readonly width: number;
  readonly height: number;
}

/** One tile index, in the shape `ObjectToolPort.place` takes one. */
export interface HarnessTile {
  readonly tileX: number;
  readonly tileY: number;
}

/**
 * One chunk position, in the shape `SparseWorld.load` takes one -- plain
 * numbers, so it crosses `page.evaluate`.
 *
 * The spec names chunks rather than tile bounds on purpose. `loadedBounds` is
 * derived from materialised chunks by `WorldRenderView.fromSnapshot`, which is
 * production code; a harness that took the bounds directly would let a spec
 * hand the scene the very rectangle it then checks the mapping against, which
 * is `docs/AGENT_WORKFLOW.md` §3's "fixture that supplies both sides".
 */
export interface HarnessChunkPosition {
  readonly chunkX: number;
  readonly chunkY: number;
}

/**
 * What Phaser's input manager is holding, for the `addPointer(2)` comment
 * (issue #209).
 *
 * Every field is copied straight off `Phaser.Input.InputManager`; nothing here
 * derives what the count *should* be, because a probe that re-applied
 * `addPointer`'s arithmetic would agree with a scene that never called it. The
 * spec does the arithmetic instead, from these readings.
 */
export interface PointerCensus {
  /** `input.manager.pointers.length` -- every pointer object the manager owns. */
  readonly entries: number;
  /** `input.manager.pointersTotal` -- the number of *touch* objects it processes per update. */
  readonly pointersTotal: number;
  /** `pointer.id` of each entry, in `pointers` order. */
  readonly ids: readonly number[];
  /**
   * Where `input.manager.mousePointer` sits in `pointers`, or `-1` if the
   * manager has no mouse pointer at all.
   *
   * The reading the audit in #209 was missing: it measured four entries and
   * could not say which one was the mouse, so "three touch pointers" stayed
   * inferred. This is identity (`indexOf` on the manager's own reference), not
   * a guess from an index.
   */
  readonly mouseIndex: number;
  /**
   * `input.manager.config.inputActivePointers` -- how many touch pointers the
   * engine starts with.
   *
   * Neither `src/main.ts` nor this harness sets `input.activePointers`, so
   * this is Phaser's own default, and it is what the comment's "unless told
   * otherwise" is about.
   */
  readonly configuredActivePointers: number;
}

/**
 * `WorldScene.homeIndicatorMark`, flattened so it crosses `page.evaluate`
 * (issue #794).
 */
export interface HarnessHomeIndicator {
  readonly x: number;
  readonly y: number;
  readonly angleRadians: number;
}

export interface LockstateWorldSceneHarness {
  /** Resolves once `WorldScene.create` has run and its listeners are registered. */
  readonly ready: Promise<void>;
  scroll(): CameraScroll;
  /**
   * Whether the adapter still considers the action held.
   *
   * Deliberately the only introspection offered besides the camera. An earlier
   * draft also exposed the scene's active-context set -- which meant
   * reimplementing the document check here, i.e. a second implementation of the
   * rule under test, which would have passed while the real one was wrong. The
   * specs assert the camera instead: that is the behaviour a player experiences,
   * and it cannot be satisfied by a duplicate.
   */
  isActive(action: string): boolean;
  /**
   * The camera's zoom, for the keys that change it.
   *
   * Separate from `scroll()` because a zoom about the viewport centre moves
   * the scroll too, so a spec that watched scroll alone could not tell a zoom
   * from a pan.
   */
  zoom(): number;
  /**
   * The world point the camera currently puts under a viewport point.
   *
   * Answered by Phaser's own `Camera#getWorldPoint`, which inverts the camera
   * matrix the frame was drawn with -- deliberately **not** by
   * `src/rendering/camera/`'s `screenToWorld`. The property a pinch spec has to
   * assert is that the world under the fingers does not slide, and calling the
   * project's own transform to check the project's own transform would be the
   * same self-agreement the header above rejects for the context set: it would
   * hold while both the transform and the gesture were wrong together.
   *
   * Read after a rendered frame. `getWorldPoint` uses `matrixCombined`, which
   * `Camera#preRender` rebuilds once per frame, so a read taken between a
   * `setZoom` and the next frame answers with the previous frame's matrix.
   */
  worldPointAt(screen: HarnessPoint): HarnessPoint;
  /**
   * The input manager's pointer inventory, read live.
   *
   * Not introspection into the scene: `input.manager` is public engine state,
   * and the claim under test (`world-scene.ts`'s `addPointer(2)` comment) is a
   * claim about the engine rather than about `WorldScene`'s own logic. It is
   * the one thing #209 tried to measure through the harness and could not,
   * because there was no handle to reach it through.
   */
  pointerCensus(): PointerCensus;
  /**
   * Arms the build tool, so a one-finger or left-button drag builds.
   *
   * The scene takes a `BuildToolPort` at construction and asks it every
   * gesture, so arming is a harness flag rather than a rebuild.
   */
  armBuildTool(armed: boolean): void;
  /**
   * How many times the scene has asked the arming owner to put the tool down
   * (issue #959).
   *
   * A count rather than a boolean, because the two failures this spec has to
   * tell apart are "never asked" and "asked when a gesture was there to
   * abandon instead" -- the ordering `Escape` now has, where the first press
   * takes the half-drawn run and only a press with nothing in progress
   * reaches the arming.
   */
  standDownRequests(): number;
  /**
   * Whether any of the three tool doubles is still armed.
   *
   * The doubles' own flags, read back: the harness's `standDown` clears them
   * exactly as `src/main.ts` clears the panels', so this is the harness
   * standing in for the arm control's `data-armed`, which no page without a
   * HUD has.
   */
  isAnyToolArmed(): boolean;
  /** Runs the tool has been asked to place. `Escape` must leave this empty. */
  placedRuns(): readonly (readonly HarnessEdge[])[];
  /**
   * What the scene has reported to `EditHistoryPort`, in order (#261).
   *
   * Strings rather than a richer record because that is the whole payload: an
   * `Undo` command carries nothing, so "which direction, how many times, in
   * what order" is everything the scene can get wrong on its side of the
   * boundary.
   */
  historyRequests(): readonly string[];
  /** Empties the log, so one spec can measure a press against a known start. */
  clearHistoryRequests(): void;
  /** What the panel readout would currently show: the run in progress, or `undefined`. */
  targetedRun(): readonly HarnessEdge[] | undefined;

  /**
   * Arms the room tool, so a left-button drag designates a rectangle instead
   * of panning (#516: the area gesture is one of the three this issue's
   * `blur`/`releaseMissed` recovery covers, verified rather than assumed by
   * exercising it here the same way the build gesture already was).
   */
  armRoomTool(armed: boolean): void;
  /** Rectangles the room tool has been asked to designate. `Escape`, `blur` and a missed release must all leave this empty. */
  placedAreas(): readonly HarnessRect[];
  /** What the panel readout would currently show for the area gesture, or `undefined`. */
  targetedArea(): HarnessRect | undefined;

  /**
   * Arms the object tool with a 1x1 footprint, so a left-button press places
   * one tile instead of panning (#516, the third of the three gestures).
   */
  armObjectTool(armed: boolean): void;
  /** Tiles the object tool has been asked to place. */
  placedObjects(): readonly HarnessTile[];
  /** What the panel readout would currently show for the object gesture, or `undefined`. */
  targetedObject(): HarnessRect | undefined;

  /**
   * Materialises chunks in the feed this harness serves, and resolves once
   * `WorldScene.update` has actually read the frame carrying them (issue #793).
   *
   * A real `SparseWorld` is loaded, snapshotted exactly as the worker does and
   * projected through `WorldRenderView.fromSnapshot`, so the `loadedBounds`
   * the scene then caches are computed by the same production code a running
   * session's are -- the spec chooses a chunk *layout*, never a rectangle.
   *
   * The wait is on the harness feed's own `readFrame` call count, not on a
   * fixed number of animation frames: `frameCameraOnFirstWorld` and the
   * `lastLoadedBounds` cache both happen inside the `update()` that consumes
   * the frame, so "the scene has read it" is the only honest precondition, and
   * counting rAFs instead would be a guess about the engine's callback order
   * that a loaded machine can break.
   */
  loadChunks(chunkSize: number, chunks: readonly HarnessChunkPosition[]): Promise<void>;
  /**
   * `WorldScene.navigateToMinimapPoint`, called directly -- the mapping the
   * minimap's click drives, with no HUD, no app shell and no pixel rounding
   * between the spec and the camera (issue #793).
   *
   * The app-level gate (`tests/browser/hud-minimap-navigates.spec.ts`) can only
   * read the camera back through an integer-pixel bisection, which cannot
   * express a float equality; this can.
   */
  navigateToMinimapPoint(fx: number, fy: number): boolean;
  /**
   * Moves the camera by writing Phaser's own `scrollX`/`scrollY`.
   *
   * Deliberately not a pan gesture and not a minimap click: a spec that
   * displaced the camera with the mechanism under test would be proving that
   * mechanism against itself. `Camera#setScroll` is the engine's, so it can
   * carry no bug this file's subject has.
   */
  displaceCamera(scrollX: number, scrollY: number): void;
  /**
   * How many frames the scene has consumed from this harness's feed.
   *
   * The same counter `loadChunks` waits on, exposed so that a spec which moves
   * the camera can wait on the same honest precondition: `WorldScene.update`
   * calls `readFrame` and then, at the end of that *same synchronous call*,
   * recomputes the home marker from `cameraState()`. So one increment observed
   * from outside the engine's loop is exactly "an `update()` has run to
   * completion since I looked", and nothing read afterwards can still answer
   * for the camera the previous frame was drawn with.
   *
   * **Waiting on the marker's own presence is not a substitute, and issue
   * #1285 is what that costs.** A displacement that moves the camera from one
   * off-screen bearing to another leaves the marker present throughout, so a
   * poll on presence is satisfied by the frame *before* the move and the read
   * that follows returns the previous bearing. Measured on this harness, a
   * frame failed to land between the `setScroll` and the read in 18 of 40
   * attempts, and the run that ended CI's `browser` job on `46a8237f` read a
   * mark of exactly `PI/2` after a displacement due west.
   *
   * Deliberately a count and not a boolean "is settled": a boolean would have
   * to decide what settled means, which is the harness re-implementing the
   * scene's own frame contract.
   */
  framesRead(): number;
  /**
   * The edge marker as the scene last drew it, or `undefined` when it drew
   * none (issue #794).
   *
   * Read off the scene rather than recomputed here, for the reason
   * `WorldScene.homeIndicatorMark`'s own docblock gives: a harness that called
   * `offscreenHomeIndicator` itself would agree with a scene that handed it
   * the wrong rectangle, which is the half of this feature the pure unit test
   * cannot reach.
   */
  homeIndicator(): HarnessHomeIndicator | undefined;
}

declare global {
  interface Window {
    lockstateWorldSceneHarness?: LockstateWorldSceneHarness;
  }
}
