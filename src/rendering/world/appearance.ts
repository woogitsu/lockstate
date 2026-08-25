import { defaultObjectRegistry } from '../../content/object-catalog';
import { defaultRoomContentRegistry, type RoomCategory } from '../../content/room-catalog';
import { BUILDABLE_REGISTRY, type BuildableCategory } from '../../simulation/construction/definition';
import { DEFAULT_TERRAIN_DEFINITIONS } from '../../simulation/world/terrain';

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

/** Tint applied over a zoned tile, keyed by the room's own category. */
const ZONING_TINT_BY_CATEGORY: Readonly<Record<RoomCategory, number>> = {
  housing: 0x4f7fd0,
  security: 0xd05a4f,
  operations: 0xd0a24f,
  food: 0xd0854f,
  hygiene: 0x4fc0d0,
  recreation: 0x76d04f,
  education: 0x9a4fd0,
  medical: 0xd04f9a,
  administration: 0x8f97a3,
  logistics: 0xc9d04f,
  utility: 0x4fd0a2,
};

export const ZONING_TINT_ALPHA = 0.28;

/** Undefined when the tile is unzoned or the zoning id is not a known room. */
export function zoningTint(zoningNumericId: number): number | undefined {
  if (zoningNumericId === 0) return undefined;
  const room = defaultRoomContentRegistry.getByNumericId(zoningNumericId);
  if (room === undefined) return undefined;
  return ZONING_TINT_BY_CATEGORY[room.category];
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

const STRUCTURE_APPEARANCE: Readonly<Record<string, StructureAppearance>> = {
  'wall-brick': {
    kind: 'wall',
    footprintTiles: { width: 1, height: 1 },
    heightTiles: WALL_HEIGHT_TILES,
    topFill: 0x9a6a52,
    sideFill: 0x6d4a39,
    outline: 0x3a251c,
  },
  'door-wooden': {
    kind: 'object',
    footprintTiles: { width: 1, height: 1 },
    heightTiles: 0.55,
    topFill: 0xb08a4f,
    sideFill: 0x7c6037,
    outline: 0x3b2d1a,
  },
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
  // Two ways a buildable id reaches an object definition, tried in this order.
  // The first is the id *being* one, which is what this function was written
  // for. The second is the buildable **naming** one through `placesObjectId`
  // (ADR 0028 phase 1), which is how a real placement works: `bed-wooden`
  // places `object.bed`, and without this line a finished bed would draw 1x1
  // where the simulation reserved 1x2 -- the renderer disagreeing with the tile
  // index about the same object.
  const catalogued =
    defaultObjectRegistry.getById(definitionId) ??
    (buildable?.placesObjectId === undefined ? undefined : defaultObjectRegistry.getById(buildable.placesObjectId));
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
