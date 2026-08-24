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

/** One tile edge, flattened out of `EdgeTarget` so it crosses `page.evaluate`. */
export interface HarnessEdge {
  readonly tileX: number;
  readonly tileY: number;
  readonly edge: string;
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
   * Arms the build tool, so a one-finger or left-button drag builds.
   *
   * The scene takes a `BuildToolPort` at construction and asks it every
   * gesture, so arming is a harness flag rather than a rebuild.
   */
  armBuildTool(armed: boolean): void;
  /** Runs the tool has been asked to place. `Escape` must leave this empty. */
  placedRuns(): readonly (readonly HarnessEdge[])[];
  /** What the panel readout would currently show: the run in progress, or `undefined`. */
  targetedRun(): readonly HarnessEdge[] | undefined;
}

declare global {
  interface Window {
    lockstateWorldSceneHarness?: LockstateWorldSceneHarness;
  }
}
