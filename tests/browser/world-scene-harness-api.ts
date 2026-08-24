/**
 * The contract between the in-page world-scene harness
 * (`world-scene-harness.ts`) and `world-scene-input.spec.ts`.
 *
 * Every value crossing `page.evaluate` must be structured-clone-safe, so this
 * exposes plain numbers rather than Phaser cameras.
 */

/** Where the main camera is looking, which is the only thing these specs assert. */
export interface CameraScroll {
  readonly x: number;
  readonly y: number;
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
}

declare global {
  interface Window {
    lockstateWorldSceneHarness?: LockstateWorldSceneHarness;
  }
}
