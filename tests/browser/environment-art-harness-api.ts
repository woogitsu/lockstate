/**
 * The contract between the in-page environment-art harness
 * (`environment-art-harness.ts`) and `environment-art.spec.ts`.
 *
 * Every value crossing `page.evaluate` must be structured-clone-safe, so this
 * exposes plain numbers and strings rather than Phaser objects.
 */

/** One tiling sprite the tile layer put on the display list, read off the object itself. */
export interface HarnessTileSprite {
  /** Frame name inside the environment atlas -- i.e. which sprite this is. */
  readonly frameName: string;
  /** World-space rectangle it covers. Origin is its north-west corner. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly tileScaleX: number;
  readonly tileScaleY: number;
  readonly depth: number;
}

/** What the packed atlas turned out to be. */
export interface HarnessAtlas {
  readonly textureKey: string;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Frame names carved out of it, sorted. `__BASE` is Phaser's own whole-image frame. */
  readonly frameNames: readonly string[];
}

/** RGBA, 0-255. */
export type HarnessPixel = readonly [number, number, number, number];

/** The fixture's own geometry, so a spec asserts against the world it asked for. */
export interface HarnessWorldFixture {
  readonly chunkSizeTiles: number;
  readonly tileSizePx: number;
  readonly zonedMinTileX: number;
  readonly zonedMinTileY: number;
  readonly zonedMaxTileX: number;
  readonly zonedMaxTileY: number;
  readonly wallRowTileY: number;
  readonly doorTileX: number;
  readonly doorRowTileY: number;
  readonly westWallTileX: number;
  readonly westWallTileY: number;
  /** A tile carrying both a finished `wall-brick` build order and the wall it wrote. */
  readonly builtWallTileX: number;
  readonly builtWallTileY: number;
  /**
   * North-west tile of a finished `bed-wooden` order, standing on bare owned
   * ground outside the zoned room.
   *
   * Outside the room on purpose: a bed drawn over floor art would be two art
   * frames stacked, and the spec's comparison is between the bed and what the
   * painter draws in its place, so the only thing that may change under the
   * probe is the bed itself.
   */
  readonly bedTileX: number;
  readonly bedTileY: number;
  /**
   * North-west (and only) tile of a finished `toilet-brick` order, standing on
   * bare owned ground outside the zoned room, on the same footing as
   * `bedTileX`/`bedTileY` and for the same reason: art drawn over floor art
   * would be two frames stacked, and this is the first object from ADR 0100's
   * second publishing lane, not the owner-sheet lane the bed uses.
   */
  readonly toiletTileX: number;
  readonly toiletTileY: number;
  /**
   * North-west tile of a finished `bench-wooden` order, standing on bare
   * owned ground outside the zoned room, on the same footing as
   * `bedTileX`/`bedTileY`. The second object wired from ADR 0100's second
   * publishing lane (#1020) sits beside it: `deskTileX`/`Y`, far enough apart
   * that the two footprints do not touch.
   *
   * `storageRackTileX`/`Y` stood here briefly in 2026-09-06, then left when
   * the closed-locker render proved illegible as a rack (#1059). The current
   * pair tests a purpose-built open wooden rack.
   */
  readonly benchTileX: number;
  readonly benchTileY: number;
  readonly deskTileX: number;
  readonly deskTileY: number;
  readonly showerTileX: number;
  readonly showerTileY: number;
  readonly wasteBinTileX: number;
  readonly wasteBinTileY: number;
  readonly storageRackTileX: number;
  readonly storageRackTileY: number;
  readonly chairTileX: number;
  readonly chairTileY: number;
  readonly diningTableTileX: number;
  readonly diningTableTileY: number;
  readonly medicalBedTileX: number;
  readonly medicalBedTileY: number;
  readonly medicineCabinetTileX: number;
  readonly medicineCabinetTileY: number;
  readonly prepCounterTileX: number;
  readonly prepCounterTileY: number;
}

export interface LockstateEnvironmentArtHarness {
  /** Resolves once `WorldScene.create` has run. */
  readonly ready: Promise<void>;
  /** Resolves once the environment sheets have been fetched, cut and published, or rejects with why not. */
  readonly artLoaded: Promise<void>;
  readonly fixture: HarnessWorldFixture;
  atlas(): HarnessAtlas | undefined;
  /** Where one frame sits inside the packed atlas, read back from the texture manager. */
  atlasFrame(name: string): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined;
  /** A pixel of the packed atlas, straight off the canvas the frames were drawn into. */
  atlasPixel(x: number, y: number): HarnessPixel | undefined;
  /** Every tiling sprite currently on the display list, sorted by position. */
  tileSprites(): readonly HarnessTileSprite[];
  /** Points the camera at a world position at zoom 1 and waits for the frame drawn with it. */
  centreCameraOn(worldX: number, worldY: number): Promise<void>;
  /**
   * The colour at the exact centre of the drawing buffer, through the
   * renderer's own snapshot path.
   *
   * Aiming is done by moving the camera rather than by converting a world
   * position into a buffer pixel: the centre of the buffer is the centre
   * whatever the device pixel ratio is and whichever way up the snapshot
   * comes, so there is no transform here to get wrong.
   */
  centrePixel(): Promise<HarnessPixel>;
  /** Everything the scene reported to `onError`, in order. */
  errors(): readonly string[];
  /** Drops the artwork and repaints, so a spec can measure the same prison without it. */
  removeArt(): void;
}

declare global {
  interface Window {
    lockstateEnvironmentArtHarness?: LockstateEnvironmentArtHarness;
  }
}
