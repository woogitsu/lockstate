import type { SourceArtRect } from './source-art-catalog';

/**
 * A second catalog joined this file on 2026-09-06 (ADR 0100), and this
 * paragraph is the one place that says so in full rather than at each call
 * site below.
 *
 * `assetId`'s own docstring on `SourceArtSpriteDefinition` used to be this
 * whole interface's docstring: *"A `source-art.v1.json` asset id. The
 * catalog names the file; this never does."* That sentence is still true --
 * every `assetId` in this file still only ever resolves against
 * `source-art.v1.json`, and nothing below spells a filename for one. What
 * changed is that a sprite drawn from a Blender render (ADR 0100's second
 * publishing lane) cannot be described by that field at all: there is no
 * `sourceRectPx` to measure by eye, because the render *is* the object, at
 * its own declared size, not a crop out of a shared sheet. Rather than widen
 * `assetId` to mean two different things depending on context -- which would
 * make the sentence above false by omission -- a rendered sprite carries a
 * differently-named field, `renderedArtId`, that only ever resolves against
 * `rendered-art.v1.json` (`rendered-art-catalog.ts`). The two id spaces
 * happen to overlap in one case (`fixture.cell.toilet_sink` names both an
 * unused owner sheet and the render this file now draws), which is exactly
 * why they are not the same field.
 */
export type EnvironmentArtCatalogKind = 'source-art' | 'rendered-art';

/**
 * The reviewed extraction manifest for the environment sheets.
 *
 * `docs/ART_PIPELINE.md` ("Delivery and caching") says of the 23 owner-supplied
 * sheets: *"They remain a whole-sheet atlas until a later reviewed extraction
 * manifest selects individual variants."* This is that manifest. The generated
 * catalog (`public/game-content/source-art.v1.json`) describes each sheet as one
 * whole-sheet rectangle -- `tooling/build-source-art-catalog.mjs` writes
 * `sourceRectPx: {0, 0, 1448, 1086}` for every entry -- so which pixels of a
 * sheet are which piece of furniture is a judgement no generator made, and it
 * has to be recorded somewhere a reviewer can read. Here.
 *
 * ## How the rectangles were measured
 *
 * Not by eye. For each sheet the alpha channel was scanned for 8-connected
 * components of `alpha >= 16`, which isolates each rendered object on the
 * transparent sheet; the component's bounding box was then shrunk inwards while
 * any pixel on its outer row or column had `alpha < 240`. The threshold is 240
 * rather than 255 on purpose: these renders are not fully opaque, and their
 * interior alpha measures 252-253, so a "fully opaque" shrink collapses every
 * rectangle to nothing. Without the shrink the antialiased rim is included and
 * a tiled floor shows a one-pixel seam of whatever is behind it -- observed,
 * before the inset was applied.
 *
 * **The shrink is a rule for a frame that TILES, and the first frame that does
 * not tile does not follow it (`env.object.bed`, 2026-09-05).** The paragraph
 * above is kept rather than rewritten because it is still the whole method for
 * the four surface frames, and because the reason it stops is the interesting
 * part: an object is cut to be seen whole, so its outermost pixels are its own
 * silhouette -- a bed's head and foot rails -- and shrinking to `alpha >= 240`
 * removes them. An object frame is therefore the component's *bounding box*,
 * padded outwards with transparent sheet until the crop's aspect matches the
 * footprint it will be drawn into. Each such rectangle says so on itself.
 *
 * ## What is deliberately not here
 *
 * Only the sprites the renderer maps to something the simulation can produce
 * (`environment-art.ts`). A declared sprite costs its whole sheet's download,
 * because a sheet is delivered whole, so declaring art nothing draws would be
 * paid for in bytes on every first load. `environment-art.ts` records which
 * simulation identities are on the colour fallback and why.
 *
 * Nothing here touches Phaser or the DOM.
 */

/**
 * Every sprite this renderer can draw. A `Record` keyed by this union is how a
 * mapping row naming art that does not exist fails `tsc` rather than resolving
 * to a blank tile.
 */
export const ENVIRONMENT_SPRITE_IDS = [
  'env.floor.institutional',
  'env.wall.interior.face',
  'env.wall.interior.cap',
  'env.door.interior.face',
  'env.door.interior.cap',
  'env.object.bed',
  'env.object.medical-bed',
  'env.object.medicine-cabinet',
  'env.object.toilet',
  'env.object.bench',
  'env.object.desk',
  'env.object.shower-head',
  'env.object.waste-bin',
  'env.object.storage-rack',
  'env.object.chair',
  'env.object.dining-table',
  'env.object.stove',
  'env.object.washing-machine',
  'env.object.security-console',
  'env.object.utility-panel',
  'env.object.loading-dock-door',
] as const;

export type EnvironmentSpriteId = (typeof ENVIRONMENT_SPRITE_IDS)[number];

/**
 * A quarter-turn applied when the sprite is packed, not when it is drawn.
 *
 * A wall running north-south is seen in this projection almost entirely as its
 * cap, and no sheet holds a top-down wall cap: what the sheets hold is a front
 * elevation whose top band *is* that cap, running horizontally. Turning it in
 * the packer means the runtime draws an ordinary axis-aligned frame and the
 * rotation is a reviewable number in this file instead of a transform in the
 * painter.
 */
export type EnvironmentSpriteQuarterTurns = 0 | 1;

/** Fields every sprite definition carries, whichever catalog its art comes from. */
interface EnvironmentSpriteDefinitionBase {
  /**
   * The size the frame is resampled to when it is packed, *before* any turn.
   *
   * Chosen so that the frame is drawn at exactly half scale in world units:
   * one 128px axis becomes one 64px tile (`TILE_SIZE_PX`). That keeps the art
   * crisp to zoom 2 and repeats a tiling frame on exact tile boundaries, so a
   * floor's joints and a wall's panel lines land on the grid the player builds
   * on rather than drifting across it. The same convention -- twice the world
   * pixel size -- is used for a whole-object frame too (`env.object.toilet`),
   * for the same crispness reason, even though nothing there tiles.
   */
  readonly runtimeSizePx: { readonly width: number; readonly height: number };
  readonly quarterTurns: EnvironmentSpriteQuarterTurns;
  /** Why this rectangle and not another one. Read by nothing; the reason a reviewer can check it. */
  readonly note: string;
}

/** A crop out of an owner-supplied sheet, published in `source-art.v1.json`. Every sprite until 2026-09-06 was this. */
export interface SourceArtSpriteDefinition extends EnvironmentSpriteDefinitionBase {
  readonly kind: 'source-art';
  /** A `source-art.v1.json` asset id. The catalog names the file; this never does. */
  readonly assetId: string;
  /** The reviewed sub-rectangle of that sheet. */
  readonly sourceRectPx: SourceArtRect;
}

/**
 * A whole Blender-rendered object frame, published in `rendered-art.v1.json`
 * (ADR 0100). There is no `sourceRectPx` to review: the render already *is*
 * the object, at the size `environment-objects.render.json` declares for it,
 * with `frameAspectDriftFromFootprint: 0` by construction
 * (`docs/ART_PIPELINE.md` §"Environment objects") -- so the whole frame is
 * always taken, and `planEnvironmentAtlas` derives that rectangle from the
 * catalog's own `dimensionsPx` rather than one being written here.
 */
export interface RenderedArtSpriteDefinition extends EnvironmentSpriteDefinitionBase {
  readonly kind: 'rendered-art';
  /** A `rendered-art.v1.json` asset id. Deliberately not named `assetId`; see the module docblock above. */
  readonly renderedArtId: string;
}

export type EnvironmentSpriteDefinition = SourceArtSpriteDefinition | RenderedArtSpriteDefinition;

export const ENVIRONMENT_SPRITES: Readonly<Record<EnvironmentSpriteId, EnvironmentSpriteDefinition>> = {
  /**
   * The small clean swatch from the bottom-right of the linoleum sheet rather
   * than its large hero square top-left: the hero square carries a slightly
   * darker rim that reads as a grid line under every tile when it is repeated,
   * and this one tiles without a visible seam.
   */
  'env.floor.institutional': {
    kind: 'source-art',
    assetId: 'floor.linoleum.institutional',
    sourceRectPx: { x: 732, y: 711, width: 304, height: 304 },
    runtimeSizePx: { width: 128, height: 128 },
    quarterTurns: 0,
    note: 'Speckled institutional linoleum, square swatch, tiles seamlessly at one tile per repeat.',
  },
  /**
   * A centre slice of the frontal wall module, not the whole module. The module
   * is 488x273 -- 1.79 tiles wide for one tile of height -- so drawing it whole
   * on a one-tile wall squashes it; a 290-wide slice is one tile at the same
   * scale, and repeats with its own panel joint landing on each tile boundary.
   */
  'env.wall.interior.face': {
    kind: 'source-art',
    assetId: 'wall.interior.modules',
    sourceRectPx: { x: 150, y: 672, width: 290, height: 273 },
    runtimeSizePx: { width: 128, height: 124 },
    quarterTurns: 0,
    note: 'Frontal interior wall elevation: coping band, plaster, dark skirting. Drawn on east-west walls.',
  },
  /**
   * The coping band alone, turned a quarter. This is the only top-down wall
   * surface any sheet contains, and it is an approximation: the sheets hold
   * elevations and three-quarter views, never a cap seen from directly above.
   */
  'env.wall.interior.cap': {
    kind: 'source-art',
    assetId: 'wall.interior.modules',
    sourceRectPx: { x: 150, y: 672, width: 290, height: 30 },
    runtimeSizePx: { width: 128, height: 28 },
    quarterTurns: 1,
    note: 'Top coping of the same wall module, turned to run north-south. Drawn on north-south walls.',
  },
  'env.door.interior.face': {
    kind: 'source-art',
    assetId: 'door.interior.variants',
    sourceRectPx: { x: 48, y: 25, width: 255, height: 467 },
    runtimeSizePx: { width: 128, height: 124 },
    quarterTurns: 0,
    note: 'Closed interior door, frontal, with its frame. Drawn on east-west door edges.',
  },
  'env.door.interior.cap': {
    kind: 'source-art',
    assetId: 'door.interior.variants',
    sourceRectPx: { x: 48, y: 25, width: 255, height: 22 },
    runtimeSizePx: { width: 128, height: 28 },
    quarterTurns: 1,
    note: 'Head of the same door frame, turned to run north-south. Drawn on north-south door edges.',
  },
  /**
   * Original Blender modelled bed. The native 256x512 overhead render already
   * has the pillow north and a 1:2 aspect, so it needs no crop or rotation.
   * The earlier owner sheet crop remains catalogued as source art but is no
   * longer used for this object. See assets/source/concepts/cell-bed-v2.md.
   */
  'env.object.bed': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.cell.bed.single.variants',
    runtimeSizePx: { width: 128, height: 256 },
    quarterTurns: 0,
    note: 'Single steel-frame cell bed with grey mattress and folded orange blanket, pillow north. Drawn on object.bed.',
  },
  'env.object.medical-bed': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.medical.bed.single',
    runtimeSizePx: { width: 128, height: 256 },
    quarterTurns: 0,
    note: 'Adjustable medical bed with teal washable cover, white safety rails and a marked foot panel. Drawn on object.medical-bed.',
  },
  'env.object.medicine-cabinet': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.medical.cabinet',
    runtimeSizePx: { width: 128, height: 128 },
    quarterTurns: 0,
    note: 'Locking infirmary cabinet with pale enamel top and teal medical cross. Drawn on object.medicine-cabinet.',
  },
  'env.object.stove': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.kitchen.stove',
    runtimeSizePx: { width: 256, height: 128 },
    quarterTurns: 0,
    note: 'Commercial four-burner cooker with steel deck, rear splash guard and oven doors. Drawn on object.stove.',
  },
  'env.object.washing-machine': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.laundry.washing_machine.twin',
    runtimeSizePx: { width: 256, height: 128 },
    quarterTurns: 0,
    note: 'Twin-bay institutional washer with two visible drum hatches and paired controls. Drawn on object.washing-machine.',
  },
  'env.object.security-console': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.security.surveillance_console',
    runtimeSizePx: { width: 256, height: 128 },
    quarterTurns: 0,
    note: 'Blue-grey security console with three overhead-visible CCTV monitors, keyboard, joysticks and guarded control. Drawn on object.security-console.',
  },
  'env.object.utility-panel': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.utility.control_panel',
    runtimeSizePx: { width: 128, height: 128 },
    quarterTurns: 0,
    note: 'Blue-grey utility-control cabinet with six top-visible breakers, two status lenses and a guarded red switch. Drawn on object.utility-panel.',
  },
  'env.object.loading-dock-door': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.delivery.dock_gate.closed',
    runtimeSizePx: { width: 384, height: 128 },
    quarterTurns: 0,
    note: 'Closed three-tile timber delivery gate with steel tracks. Drawn on object.loading-dock-door; it is not a navigable door edge.',
  },
  /**
   * The second catalogued object drawn as artwork, and the first from ADR
   * 0100's second publishing lane rather than from an owner sheet.
   *
   * `object.toilet`'s only owner-supplied view is `fixture.cell.toilet_sink`,
   * a combined toilet+sink column at roughly 1:2.5 that no crop fits into the
   * 1x1 tile the catalogue declares (`docs/ART_PIPELINE.md` §"Environment
   * objects", ADR 0100 §Context) -- so unlike every entry above, there is no
   * rectangle to measure here. `renderedArtId` names the same real-world
   * object under the *render* catalog instead: a top-down, orthographic
   * Blender frame of the toilet alone, already cropped to its own 1x1
   * footprint by construction (`frameAspectDriftFromFootprint: 0`), needing
   * no `sourceRectPx` because the whole frame is the object.
   *
   * `quarterTurns: 0` because the render is already authored top-down and
   * north-up (`docs/ART_PIPELINE.md`'s "one vertical flip is owed" paragraph
   * describes how the renderer itself gets north to the top of the frame);
   * unlike the bed, nothing here was authored lying on its side needing a
   * turn to stand.
   *
   * `runtimeSizePx: 128x128` follows the same "twice the world pixel size"
   * convention `env.object.bed` set (`object.toilet`'s footprint is 1x1
   * tiles = 64x64 world px), resampled down from the render's native 256x256
   * by the same `createImageBitmap` resize `environment-textures.ts` already
   * does for every other frame.
   */
  'env.object.toilet': {
    kind: 'rendered-art',
    renderedArtId: 'fixture.cell.toilet_sink',
    runtimeSizePx: { width: 128, height: 128 },
    quarterTurns: 0,
    note: 'Toilet, rendered top-down and orthographic (ADR 0100), because the owner sheet only holds a combined toilet+sink column no crop fits a 1x1 tile. Drawn on object.toilet.',
  },
  /**
   * The fourth and fifth catalogued objects drawn as artwork, and the second
   * and third from ADR 0100's second publishing lane. Added 2026-09-06 when
   * the owner asked for the remaining 22 renders to be looked at rather than
   * left to ride along undeclared (issue #1020).
   *
   * `furniture.corridor.bench.variants` is a straight name match for
   * `object.bench` and its footprint (2x1) is exact -- no stretch in either
   * direction. Viewed at the actual on-screen size (128x64 world px at zoom
   * 1, half of `runtimeSizePx` below), the four wooden slats and steel
   * supports stay legible; this is the render this ADR's
   * "does it read as the thing it names" test was written for.
   *
   * `quarterTurns: 0` for the same reason `env.object.toilet` carries it:
   * the render is already authored top-down and north-up, and nothing here
   * was modelled lying on its side.
   */
  'env.object.bench': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.corridor.bench.variants',
    runtimeSizePx: { width: 256, height: 128 },
    quarterTurns: 0,
    note: 'Corridor bench with four worn wooden slats, steel frame and floor anchors, drawn on object.bench.',
  },
  /**
   * `furniture.office.desk.employee.variants` is a straight name match for
   * `object.desk` and its footprint (2x1) is exact. Viewed at 128x64: a
   * grey-oak laminate top, an olive paperwork tray and a projecting drawer
   * pedestal stay distinct enough
   * from a bare rectangle to read as furniture with something on it, which is
   * the property the bench above and the toilet already have and `object.chair`'s
   * rejected render does not (`environment-art.ts`'s `OBJECTS_ON_COLOUR_FALLBACK`
   * docblock).
   */
  'env.object.desk': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.office.desk.employee.variants',
    runtimeSizePx: { width: 256, height: 128 },
    quarterTurns: 0,
    note: 'Employee desk with grey-oak top, paperwork tray and steel drawer pedestal, drawn on object.desk.',
  },
  'env.object.shower-head': {
    kind: 'rendered-art',
    renderedArtId: 'fixture.shower.head',
    runtimeSizePx: { width: 128, height: 128 },
    quarterTurns: 0,
    note: 'Wall-mounted shower fixture with a perforated circular head, modelled for the 1×1 object.shower-head footprint.',
  },
  'env.object.waste-bin': {
    kind: 'rendered-art',
    renderedArtId: 'fixture.cell.waste_bin',
    runtimeSizePx: { width: 128, height: 128 },
    quarterTurns: 0,
    note: 'Open institutional waste bin with a pale rim and foot pedal, modelled for the 1×1 object.waste-bin footprint.',
  },
  'env.object.storage-rack': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.storage.rack.wooden',
    runtimeSizePx: { width: 128, height: 128 },
    quarterTurns: 0,
    note: 'Open wooden storage rack with three distinct shelves and visible stored goods, drawn on object.storage-rack.',
  },
  'env.object.chair': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.chair.wooden',
    runtimeSizePx: { width: 128, height: 128 },
    quarterTurns: 0,
    note: 'Wooden chair with three separated back slats, a framed seat and visible front feet, drawn on object.chair.',
  },
  'env.object.dining-table': {
    kind: 'rendered-art',
    renderedArtId: 'furniture.dining.table.wooden',
    runtimeSizePx: { width: 384, height: 256 },
    quarterTurns: 0,
    note: 'Wooden canteen table with three fixed stools and place settings, matching the three dining places on object.dining-table.',
  },
  /*
   * `env.object.storage-rack` stood here from 2026-09-06 to 2026-09-07,
   * mapping `object.storage-rack` to `furniture.cell.locker.variants` (a
   * double-doored cabinet, not open shelving -- `environment-art.ts`'s
   * `OBJECTS_ON_COLOUR_FALLBACK` docblock quotes the judgement-call reasoning
   * in full). It was removed on the finding a playtest made that this pass's
   * own docblock did not: at both zoom 1 and `ZOOM_BOUNDS.max`, the frame is a
   * flat grey-blue rectangle with one vertical seam and nothing else,
   * failing the exact bar `object.chair` was refused on in the same pass this
   * row was added by. The new row above uses a distinct open-rack model rather
   * than reusing that closed locker. This history explains why its asset id
   * deliberately differs from `furniture.cell.locker.variants`.
   */
};

/** The frame's size once its quarter-turn has been applied: what the atlas actually holds. */
export function environmentFrameSize(definition: EnvironmentSpriteDefinition): {
  readonly width: number;
  readonly height: number;
} {
  const { width, height } = definition.runtimeSizePx;
  return definition.quarterTurns === 0 ? { width, height } : { width: height, height: width };
}

/** Distinct owner sheets the declared sprites need, sorted. One download each. */
export function environmentSourceAssetIds(
  sprites: Readonly<Record<EnvironmentSpriteId, EnvironmentSpriteDefinition>> = ENVIRONMENT_SPRITES,
): readonly string[] {
  const ids = new Set<string>();
  for (const id of ENVIRONMENT_SPRITE_IDS) {
    const definition = sprites[id];
    if (definition.kind === 'source-art') ids.add(definition.assetId);
  }
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Distinct rendered images the declared sprites need, sorted. One download
 * each. `tooling/build-rendered-art-catalog.mjs`'s `PUBLISHED_ASSET_IDS` is
 * kept in sync with this list by
 * `tests/foundation/rendered-art-catalog-generator-contract.test.ts`, the
 * same discipline `environmentSourceAssetIds` above already gets from the
 * owner-sheet generator's intake manifest.
 */
export function environmentRenderedArtIds(
  sprites: Readonly<Record<EnvironmentSpriteId, EnvironmentSpriteDefinition>> = ENVIRONMENT_SPRITES,
): readonly string[] {
  const ids = new Set<string>();
  for (const id of ENVIRONMENT_SPRITE_IDS) {
    const definition = sprites[id];
    if (definition.kind === 'rendered-art') ids.add(definition.renderedArtId);
  }
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
