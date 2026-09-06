/**
 * The contract between the in-page room-label harness
 * (`room-label-harness.ts`) and the spec that will drive it.
 *
 * **There is no spec yet, and that is a stated debt rather than an oversight.**
 * The pass that built this harness had its budget cut before it could write
 * one; what it did instead is drive this same harness by hand in Chromium at
 * 1280x720 and record the numbers in its commit message, which is evidence and
 * not a gate. The next pass writes `tests/browser/room-label.spec.ts` against
 * this interface, unchanged.
 *
 * Every value crossing `page.evaluate` must be structured-clone-safe, so this
 * exposes plain numbers and strings rather than Phaser objects.
 */

/** One name the layer has actually put on the map, read off the drawn object. */
export interface HarnessRoomLabel {
  /** The words a player can read. */
  readonly text: string;
  /** Where it is centred, in world units. */
  readonly worldX: number;
  readonly worldY: number;
  /** Its box in **screen** pixels, which is the measurement the zoom rule is made of. */
  readonly screenWidthPx: number;
  readonly screenHeightPx: number;
  /**
   * Whether its centre is inside the camera's world view.
   *
   * A drawn name whose room has scrolled off the side of the screen is still a
   * live object for a frame or two -- culling is by room rectangle, which is
   * deliberately generous -- so "drawn" and "a player can read it" are two
   * different claims and a spec that conflated them would over-count.
   */
  readonly onScreen: boolean;
}

/** The rooms the fixture zones, so a spec asserts against the world it asked for. */
export interface HarnessRoomFixture {
  readonly chunkSizeTiles: number;
  readonly tileSizePx: number;
  readonly rooms: readonly HarnessFixtureRoom[];
}

export interface HarnessFixtureRoom {
  /** Why this room is in the fixture. */
  readonly note: string;
  /** The room catalogue id zoned here. */
  readonly roomId: string;
  /** The name a player should read over it, resolved from the catalogue and the locale. */
  readonly expectedName: string;
  /** Inclusive tile rectangle. */
  readonly minTileX: number;
  readonly minTileY: number;
  readonly maxTileX: number;
  readonly maxTileY: number;
}

export interface LockstateRoomLabelHarness {
  readonly ready: Promise<void>;
  readonly fixture: HarnessRoomFixture;
  /** Sets the camera zoom, centres on the middle of the fixture, settles two frames. */
  setZoom(zoom: number): Promise<void>;
  /** The same, centred on a tile of the caller's choosing. */
  setCamera(zoom: number, tileX: number, tileY: number): Promise<void>;
  zoom(): number;
  /** Every name currently drawn, north to south. */
  labels(): readonly HarnessRoomLabel[];
  /** Live plus pooled `Text` objects, for the budget claim. */
  pooledLabelCount(): number;
  /**
   * Depths read off the live display list rather than off the constants.
   *
   * `label` is a drawn name's. `floor` is the deepest thing on the list, which
   * is the tile layer's ground buffer. `previewMax` is the shallowest, which is
   * `AreaOverlay`'s fixed preview depth -- the one thing that must still draw
   * over a name, because it is what the player is currently dragging.
   */
  depths(): {
    readonly label: number | undefined;
    readonly floor: number | undefined;
    readonly previewMax: number | undefined;
  };
  /** Replaces the world with one that zones nothing, on a new revision. */
  clearZoning(): Promise<void>;
}

declare global {
  interface Window {
    lockstateRoomLabelHarness?: LockstateRoomLabelHarness;
  }
}
