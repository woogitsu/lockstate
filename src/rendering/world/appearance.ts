import { defaultObjectRegistry } from '../../content/object-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import {
  BUILDABLE_REGISTRY,
  DOOR_EDGE_NUMERIC_ID,
  WALL_EDGE_NUMERIC_ID,
  type BuildableCategory,
} from '../../simulation/construction/definition';
import { DEFAULT_TERRAIN_DEFINITIONS } from '../../simulation/world/terrain';
import { catalogueObjectId } from './structures';

/**
 * How the world *looks*, kept as data keyed by the same stable identifiers the
 * simulation uses.
 *
 * `AGENTS.md` boundary 6 -- "content definitions belong in data modules, not
 * hard-coded condition chains" -- applies to presentation too: adding a terrain
 * or a buildable should mean adding a row here, never editing the painter. The
 * painter reads these tables and knows nothing about `dirt` or `wall-brick`.
 *
 * These are colours and heights, not gameplay: nothing here is persisted,
 * checksummed or read by the simulation.
 */

export interface TerrainAppearance {
  /** Base fill for the tile. */
  readonly fill: number;
  /** Subtle second tone used to break up large flat areas on alternating tiles. */
  readonly fillAlternate: number;
}

/**
 * What space the simulation has not materialised looks like.
 *
 * **One declaration, because a second one that drifted would be visible.**
 * This colour was written out three times -- here, `src/main.ts`'s Phaser
 * game config, and `WorldScene.create`'s `setBackgroundColor` -- and the three
 * are not interchangeable decorations: `TileLayer.updateChunks` gives an
 * unloaded chunk **no draw calls at all** and lets the camera background show
 * through, so "the void" is painted by the background and bounded by wherever
 * loaded chunks stop. If one of the three moved, the seam between materialised
 * land and empty space would become a visible band.
 *
 * `tests/unit/void-colour-agreement.test.ts` pins that they are one value.
 */
export const VOID_COLOR = 0x0b0e12;

/**
 * The same colour as a `TerrainAppearance`, for a painter that needs to fill
 * the void explicitly rather than leave it to the background.
 *
 * **No caller today** (#141), and that is not an oversight to fix by deleting
 * it: it is the value any such painter would have to use, and deriving it from
 * `VOID_COLOR` is what makes that true by construction rather than by someone
 * remembering. Both channels are the same colour deliberately -- the
 * alternating tone exists to break up large flat areas of *tiles*, and empty
 * space is not tiles.
 */
export const VOID_APPEARANCE: TerrainAppearance = { fill: VOID_COLOR, fillAlternate: VOID_COLOR };

/** Fallback for a terrain id this renderer has no row for: visibly wrong, never invisible. */
export const UNKNOWN_TERRAIN_APPEARANCE: TerrainAppearance = { fill: 0xb0308a, fillAlternate: 0xa02c7e };

const TERRAIN_APPEARANCE: Readonly<Record<string, TerrainAppearance>> = {
  dirt: { fill: 0x6a5744, fillAlternate: 0x66533f },
  grass: { fill: 0x47643a, fillAlternate: 0x435f36 },
  gravel: { fill: 0x726d64, fillAlternate: 0x6d685f },
  concrete: { fill: 0x8b9095, fillAlternate: 0x868b90 },
  rock: { fill: 0x4c5157, fillAlternate: 0x484d53 },
  water: { fill: 0x27506b, fillAlternate: 0x244b65 },
};

/** numericId -> terrain id, derived from the shared terrain definitions rather than duplicated here. */
const TERRAIN_ID_BY_NUMERIC_ID: ReadonlyMap<number, string> = new Map(
  DEFAULT_TERRAIN_DEFINITIONS.map((definition) => [definition.numericId, definition.id]),
);

export function terrainAppearance(numericId: number): TerrainAppearance {
  const id = TERRAIN_ID_BY_NUMERIC_ID.get(numericId);
  if (id === undefined) return UNKNOWN_TERRAIN_APPEARANCE;
  return TERRAIN_APPEARANCE[id] ?? UNKNOWN_TERRAIN_APPEARANCE;
}

/**
 * Tint applied over a zoned tile, keyed by the room's own catalogue id
 * (ADR 0098, option A) -- one row per room *type*, not per category.
 *
 * Before this table, `zoningTint` resolved the room and then discarded it in
 * favour of `room.category`, so eighteen room types collapsed onto eleven
 * tints and seven pairs (Kitchen/Canteen among them) were pixel-identical on
 * the map. Keying by id removes that collision: every row below is distinct,
 * and `tests/unit/appearance-zoning-tint.test.ts` fails if two ever match
 * again.
 *
 * **This forecloses the category as a thing the map shows.** Eighteen
 * independent hues throw away the fact that, say, Kitchen and Canteen are
 * both `food` -- a player can no longer see that family relationship in the
 * tint the way the old (collapsed) table incidentally showed it. ADR 0098
 * names this cost and takes it anyway: closing the seven collisions is worth
 * more than the family grouping, and option B (hue-per-category,
 * value-per-member) is the option that would have kept both, at the same
 * price, if a later pass wants it.
 *
 * **The hues are respaced, not just re-keyed.** The eleven categories they
 * replace shared one discriminating dimension (hue) and spent it unevenly --
 * `operations` and `food` sat 14 degrees apart on a wheel whose mean gap is
 * 36 degrees, which is why Reception and Kitchen were the tightest pair on
 * screen (4.06 effective units) even before any collision. These eighteen
 * hues are spaced evenly at 20 degrees, holding the palette's own saturation
 * and value (`s = 0.62, v = 0.82`), which is the spacing ADR 0098 Context §2
 * and decision 3 recommend. That raises the worst pair from 4.06 to **6.02**
 * effective units (`room.classroom` vs `room.infirmary`, and `room.common-room`
 * vs `room.classroom`, tied) -- better, but still far under the 25.4-unit
 * pixel-to-pixel spread of the floor art it is painted on. This closes a
 * keying defect; it does not make room type legible on its own. The name
 * drawn on the map is what does that (see the room-labels renderer module).
 */
const ZONING_TINT_BY_ROOM_ID: Readonly<Record<string, number>> = {
  'room.cell': 0xd14f4f,
  'room.holding-cell': 0xd17b4f,
  'room.solitary-cell': 0xd1a64f,
  'room.reception': 0xd1d14f,
  'room.kitchen': 0xa6d14f,
  'room.canteen': 0x7bd14f,
  'room.shower-room': 0x4fd14f,
  'room.laundry': 0x4fd17b,
  'room.yard': 0x4fd1a6,
  'room.common-room': 0x4fd1d1,
  'room.classroom': 0x4fa6d1,
  'room.infirmary': 0x4f7bd1,
  'room.security-office': 0x4f4fd1,
  'room.staff-room': 0x7b4fd1,
  'room.storage-room': 0xa64fd1,
  'room.delivery-bay': 0xd14fd1,
  'room.garbage-room': 0xd14fa6,
  'room.utility-room': 0xd14f7b,
};

export const ZONING_TINT_ALPHA = 0.28;

/**
 * The same tint over a tile that has floor artwork under it.
 *
 * Weaker, because the two marks are now competing for the same pixels: at 0.28
 * the wash is strong enough that a photographed linoleum floor stops reading as
 * a floor and becomes a coloured rectangle again, which would have thrown away
 * the whole point of drawing it. It is not removed, because the tint is what
 * says *which* room this is -- `zoningTint` is keyed by the room's own catalogue
 * id -- and that is gameplay information, not decoration.
 */
export const ZONING_TINT_ALPHA_OVER_ART = 0.14;

/** Undefined when the tile is unzoned or the zoning id is not a known room. */
export function zoningTint(zoningNumericId: number): number | undefined {
  if (zoningNumericId === 0) return undefined;
  const room = defaultRoomContentRegistry.getByNumericId(zoningNumericId);
  if (room === undefined) return undefined;
  return ZONING_TINT_BY_ROOM_ID[room.id];
}

/** How a built thing is drawn: a top face raised above a side face, giving height in a top-down view. */
export interface StructureAppearance {
  readonly kind: BuildableCategory;
  /** Tiles occupied, from the object catalog where the id names a catalogued object. */
  readonly footprintTiles: { readonly width: number; readonly height: number };
  /** Apparent height, in tiles, of the raised top face. */
  readonly heightTiles: number;
  readonly topFill: number;
  readonly sideFill: number;
  readonly outline: number;
}

const WALL_HEIGHT_TILES = 0.75;

/**
 * Named rather than written inline in the table below, because the edge lookup
 * needs the same colours at the wall's height: a door standing in a wall line
 * is as tall as the wall it is standing in.
 */
const DOOR_WOODEN_APPEARANCE: StructureAppearance = {
  kind: 'object',
  footprintTiles: { width: 1, height: 1 },
  heightTiles: 0.55,
  topFill: 0xb08a4f,
  sideFill: 0x7c6037,
  outline: 0x3b2d1a,
};

const STRUCTURE_APPEARANCE: Readonly<Record<string, StructureAppearance>> = {
  'wall-brick': {
    kind: 'wall',
    footprintTiles: { width: 1, height: 1 },
    heightTiles: WALL_HEIGHT_TILES,
    topFill: 0x9a6a52,
    sideFill: 0x6d4a39,
    outline: 0x3a251c,
  },
  'door-wooden': DOOR_WOODEN_APPEARANCE,
};

const CATEGORY_FALLBACK: Readonly<Record<BuildableCategory, StructureAppearance>> = {
  wall: {
    kind: 'wall',
    footprintTiles: { width: 1, height: 1 },
    heightTiles: WALL_HEIGHT_TILES,
    topFill: 0x8f8f8f,
    sideFill: 0x606060,
    outline: 0x2c2c2c,
  },
  object: {
    kind: 'object',
    footprintTiles: { width: 1, height: 1 },
    heightTiles: 0.4,
    topFill: 0x7f8ba0,
    sideFill: 0x55607a,
    outline: 0x262d3a,
  },
  utility: {
    kind: 'utility',
    footprintTiles: { width: 1, height: 1 },
    heightTiles: 0.25,
    topFill: 0x4fd0a2,
    sideFill: 0x2f8a6b,
    outline: 0x14382c,
  },
};

/**
 * Appearance for a buildable id.
 *
 * Resolution order is deliberate: an explicit row wins; otherwise the
 * buildable's own category supplies the look and the object catalog supplies
 * the footprint, so a newly catalogued object renders at the right size
 * without a renderer change. An id in neither registry still draws, as a
 * generic object, rather than vanishing.
 */
export function structureAppearance(definitionId: string): StructureAppearance {
  const explicit = STRUCTURE_APPEARANCE[definitionId];
  const buildable = BUILDABLE_REGISTRY.get(definitionId);
  // The two ways a buildable id reaches an object definition are
  // `catalogueObjectId`'s subject, and the reason they were lifted out of here
  // is written there: without the `placesObjectId` branch a finished bed would
  // draw 1x1 where the simulation reserved 1x2 -- the renderer disagreeing
  // with the tile index about the same object -- and `tile-layer.ts` now has
  // to reach the same object id to look its artwork up.
  const objectId = catalogueObjectId(definitionId);
  const catalogued = objectId === undefined ? undefined : defaultObjectRegistry.getById(objectId);
  const base = explicit ?? CATEGORY_FALLBACK[buildable?.category ?? 'object'];

  if (catalogued === undefined) return base;
  return { ...base, footprintTiles: { width: catalogued.footprint.width, height: catalogued.footprint.height } };
}

/**
 * The colour a pending object placement is previewed in.
 *
 * The `'object'` category's own top fill rather than a colour chosen here, so
 * the ghost under the pointer and the thing that appears when the order
 * finishes are the same colour at two alphas -- the rule `BuildOverlay` follows
 * for a wall. It is deliberately **not** the room's `zoningTint`: the
 * designation and the furniture standing in it are two different marks, and
 * tinting the preview with the room's colour would read as re-zoning the tile.
 */
export const PLANNED_OBJECT_TINT = CATEGORY_FALLBACK.object.topFill;

/** Walls stored as tile edges in the world's own `topEdge`/`leftEdge` layers. */
export const EDGE_WALL_APPEARANCE: StructureAppearance = CATEGORY_FALLBACK.wall;

/**
 * How each value the edge layers can carry is drawn when there is no artwork.
 *
 * **This is the per-value lookup `DOOR_EDGE_NUMERIC_ID`'s own comment says is
 * missing.** `definition.ts` writes `1` for a wall and `2` for a door into the
 * same `topEdge` / `leftEdge` layers, and `tile-layer.ts` painted every
 * non-zero value with `EDGE_WALL_APPEARANCE` -- so the door a player watched
 * being built in `door-wooden`'s own colours turned into a brick wall the
 * moment it finished. The value that tells the two apart was already in the
 * layer the renderer reads.
 *
 * The door is given the *wall's* height rather than its own, because here it is
 * a segment of a wall line rather than a free-standing object: at 0.55 tiles it
 * would put a notch in the top of every wall it sat in.
 */
const EDGE_APPEARANCE_BY_NUMERIC_ID: ReadonlyMap<number, StructureAppearance> = new Map<number, StructureAppearance>([
  [WALL_EDGE_NUMERIC_ID, CATEGORY_FALLBACK.wall],
  [DOOR_EDGE_NUMERIC_ID, { ...DOOR_WOODEN_APPEARANCE, heightTiles: WALL_HEIGHT_TILES }],
]);

/**
 * Appearance for an edge value. An unrecognised non-zero value still draws, as
 * a wall, rather than vanishing -- the layer's only published meaning is
 * "non-zero means something is here", and something is better drawn wrongly
 * than not at all.
 */
export function edgeAppearance(edgeNumericId: number): StructureAppearance {
  return EDGE_APPEARANCE_BY_NUMERIC_ID.get(edgeNumericId) ?? EDGE_WALL_APPEARANCE;
}

/** Thickness of an edge wall as a fraction of a tile. */
export const EDGE_WALL_THICKNESS_TILES = 0.22;

export const FLOOR_GRID_COLOR = 0x2a333d;
export const OWNED_OUTLINE_COLOR = 0x6ea8fe;
/**
 * Drawn inset by half this width so the whole stroke lies inside the owned
 * tile. A stroke centred on the boundary would have its outer half painted
 * over by the neighbouring chunk's own graphics, leaving a one-pixel hint of a
 * line instead of a boundary.
 */
export const OWNED_OUTLINE_WIDTH = 3;
/** Painted over land the player does not own, so owned ground reads as the playfield. */
export const UNOWNED_SHADE_COLOR = 0x05070a;
export const UNOWNED_SHADE_ALPHA = 0.45;
/** Build orders that exist but are not finished yet. */
export const PLANNED_ALPHA = 0.35;
export const BUILDING_ALPHA = 0.65;

/**
 * How a room's name is written on its floor.
 *
 * The owner's ruling of 2026-09-06 was *"Nazwa tekstem na mapie"* -- the name,
 * as text on the map -- and these are the numbers that make it readable. They
 * are here rather than in the drawing layer for the reason every other constant
 * in this file is: `src/rendering/phaser/` is the tier the Node test
 * environment cannot reach, so a value a test needs to agree with has to live
 * below it (`tests/unit/rendering-module-boundaries.test.ts` keeps Phaser out of
 * this tier).
 *
 * ### Why a *screen* size and not a world size
 *
 * `ROOM_LABEL_FONT_SIZE_PX` is a size in **screen** pixels, held constant across
 * the whole of `ZOOM_BOUNDS` (0.2 to 3.0) by scaling the drawn object by the
 * reciprocal of the camera zoom. A name sized in world units would be 2.8 px
 * tall at zoom 0.2 and 42 px tall at zoom 3.0 -- illegible at one end and
 * shouting at the other -- and the only size that is legible at every zoom is
 * one that does not change with zoom. What changes with zoom instead is
 * *whether the name fits inside the room*, which `roomLabelFits` answers and
 * `RoomLabelLayer` acts on.
 *
 * 13 px is the smallest size measured legible in Chromium for this stack at a
 * device pixel ratio of 1, and the pairing with the outline below is what keeps
 * it legible over both the pale institutional floor and the dark unowned shade.
 */
export const ROOM_LABEL_FONT_SIZE_PX = 13;

/**
 * The font a room's name is written in.
 *
 * A system stack and no web font, deliberately: the label is drawn into a
 * canvas texture the first frame a room is on screen, and a web font that has
 * not arrived yet would rasterise the name in the fallback and keep that
 * texture. `docs/RENDERING.md`'s rule that art failing to load still leaves a
 * legible world applies to text as much as to floors.
 */
export const ROOM_LABEL_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Near-white, for contrast against every floor and tint in this file. */
export const ROOM_LABEL_COLOR = '#f2f5f8';

/**
 * A dark outline around every glyph, and it is not decoration.
 *
 * The floor a name is written on is not one colour: it is terrain, or
 * institutional floor art, under a category tint at 0.14 or 0.28 alpha, and
 * possibly under the unowned shade as well. A light glyph with no outline
 * disappears against the pale end of that range. Two pixels of dark stroke
 * makes the name independent of what is beneath it, which is what lets the
 * tint keep carrying category (ADR 0098 decision 2) without competing.
 */
export const ROOM_LABEL_OUTLINE_COLOR = '#0b0e12';
export const ROOM_LABEL_OUTLINE_WIDTH_PX = 2;

/**
 * Clear space required on each side of the name, in screen pixels.
 *
 * Without it a name that fits its room to the pixel reads as touching the
 * walls, and at low zoom two neighbouring rooms' names end up a hair apart.
 */
export const ROOM_LABEL_MARGIN_PX = 4;

/**
 * Whether a name may be written at all: does it fit the space the room gives
 * it, at this zoom?
 *
 * **This is the decision that makes the whole feature honest at 0.2 zoom.** The
 * name is a constant number of screen pixels wide; the room is
 * `spanTiles * TILE_SIZE_PX * zoom` screen pixels wide, which at zoom 0.2 is
 * 12.8 px per tile. So a name is drawn where the room can hold it and is
 * omitted where it cannot, rather than being shrunk into illegibility or spilled
 * across its neighbours. ADR 0098 decision 4 states the requirement this
 * satisfies: the map owes a legible room type *"at the zoom they are building
 * at"*, and explicitly does not owe *"a distinct look at every zoom"*.
 *
 * Pure arithmetic over three measured numbers, so the threshold is a unit test
 * rather than a screenshot.
 */
export function roomLabelFits(textWidthPx: number, spanTiles: number, tileSizePx: number, zoom: number): boolean {
  if (!Number.isFinite(textWidthPx) || !Number.isFinite(spanTiles) || !Number.isFinite(zoom)) return false;
  if (textWidthPx <= 0 || spanTiles <= 0 || zoom <= 0) return false;
  return textWidthPx + 2 * ROOM_LABEL_MARGIN_PX <= spanTiles * tileSizePx * zoom;
}
