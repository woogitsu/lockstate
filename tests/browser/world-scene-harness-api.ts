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
}

declare global {
  interface Window {
    lockstateWorldSceneHarness?: LockstateWorldSceneHarness;
  }
}
