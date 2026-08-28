/**
 * The contract between the in-page actor-motion harness
 * (`actor-motion-harness.ts`) and `actor-motion.spec.ts`.
 *
 * Every value crossing `page.evaluate` must be structured-clone-safe, so this
 * exposes plain numbers rather than Phaser display objects.
 */

/** Where one actor sprite is on the Phaser display list, in world pixels. */
export interface SpritePosition {
  readonly x: number;
  readonly y: number;
}

export interface LockstateActorMotionHarness {
  /** Resolves once the scene is running and its atlas batch has loaded. */
  readonly ready: Promise<void>;
  /**
   * Publishes one `simulation/delta` into the real
   * `SimulationSnapshotFeed`, exactly as the worker would.
   *
   * `tile` is where the actor is at the moment of publication and
   * `tilesPerSecond` is the velocity published with it; both cross the boundary
   * as tiles and are converted to the payload's sub-tile units in the page.
   */
  publishActor(tick: number, tile: { readonly x: number; readonly y: number }, tilesPerSecond: { readonly x: number; readonly y: number }): void;
  /** Tells the feed the clock is running or paused, as an unsolicited `simulation/clock-state` would. */
  publishClock(tick: number, mode: 'running' | 'paused'): void;
  /**
   * Starts a walk the page keeps publishing, one message every
   * `framesPerPublication` drawn frames, with the position each message carries
   * derived from the wall clock exactly as a running worker's would be.
   *
   * **Frame-driven rather than timer-driven, and that is the whole point.** It
   * fixes the ratio of publications to frames whatever the frame rate is, so a
   * spec can say "the sprite took more distinct positions than there were
   * messages" and mean it on a fast machine and on a loaded one alike. A
   * wall-clock cadence cannot: under load the frames thin out until every
   * frame carries its own message, and the assertion becomes untestable
   * exactly when the machine is busy.
   */
  startWalking(options: { readonly tilesPerSecond: number; readonly framesPerPublication: number }): void;
  /** Stops the frame-driven walk. */
  stopWalking(): void;
  /** How many messages `startWalking` has published since it was called. */
  publicationCount(): number;
  /** Every actor sprite currently on the display list, in the order Phaser holds them. */
  actorSprites(): readonly SpritePosition[];
  /**
   * Where the first actor sprite was on every frame drawn since `resetSamples`,
   * captured **in the page**.
   *
   * Sampling from the spec cannot answer #414's question: a `page.evaluate`
   * round trip costs longer than the extrapolation clamp, so two reads taken
   * that way both land after the advance has stopped and report the same
   * pixel -- which is exactly what happened when this file's first draft did
   * it, and it looked like the feature was broken. A per-frame sample taken
   * where the frames are has no such floor.
   */
  motionSamples(): readonly SpritePosition[];
  /** Empties the sample buffer, so a spec can measure one window at a time. */
  resetSamples(): void;
  /** How many frames the scene has drawn, so a spec can wait for one rather than for a duration. */
  framesDrawn(): number;
}

declare global {
  interface Window {
    lockstateActorMotionHarness?: LockstateActorMotionHarness;
  }
}
