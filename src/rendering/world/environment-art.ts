import { defaultObjectRegistry } from '../../content/object-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import { DOOR_EDGE_NUMERIC_ID, WALL_EDGE_NUMERIC_ID } from '../../simulation/construction/definition';
import { DEFAULT_TERRAIN_DEFINITIONS } from '../../simulation/world/terrain';
import type { EnvironmentSpriteId } from '../assets/environment-sprites';

/**
 * Which artwork a piece of simulation identity is drawn with -- as data, keyed
 * by the same stable identifiers the simulation uses.
 *
 * This is `appearance.ts`'s rule applied to sprites: `AGENTS.md` boundary 6
 * says content definitions belong in data modules, not hard-coded condition
 * chains, so adding art means adding a row here and never editing the painter.
 * The painter asks this module a question and draws what comes back, or draws
 * the coloured block `appearance.ts` describes when the answer is `undefined`.
 *
 * Two properties are enforced rather than intended:
 *
 * - **A row naming art that does not exist fails `tsc`,** because every value
 *   is an `EnvironmentSpriteId` and that is a union of the sprites
 *   `environment-sprites.ts` declares.
 * - **A simulation identity with no art resolves to a *declared* fallback,
 *   never to a blank tile.** The lists below say exactly which identities those
 *   are, and `tests/unit/environment-art-coverage.test.ts` fails if the lists
 *   and the registries disagree in either direction -- so cataloguing a new
 *   object without artwork is a red test naming it, not a hole nobody sees.
 *
 * No Phaser and no DOM.
 */

/**
 * How one kind of tile edge is drawn.
 *
 * Two sprites, because the two orientations of an edge are two different
 * views. An east-west wall is seen face-on and gets an elevation; a north-south
 * wall is seen almost entirely from above and gets a cap. `tile-layer.ts` picks
 * between them from which of the world's `topEdge` / `leftEdge` layers the
 * segment came out of, which is the same thing it already does to choose
 * between a horizontal and a vertical block.
 */
export interface EdgeArt {
  /** Drawn along a tile's north edge, where the wall faces the camera. */
  readonly face: EnvironmentSpriteId;
  /** Drawn along a tile's west edge, where only the wall's top is visible. */
  readonly cap: EnvironmentSpriteId;
}

/**
 * Keyed by the numeric value the world's edge layers actually carry.
 *
 * `definition.ts` writes `WALL_EDGE_NUMERIC_ID` for a wall and
 * `DOOR_EDGE_NUMERIC_ID` for a door into the same `topEdge` / `leftEdge`
 * layers, and until this table existed `tile-layer.ts` painted *every* non-zero
 * value with `EDGE_WALL_APPEARANCE` -- so a finished door turned into a brick
 * wall, which `docs/RENDERING.md` recorded under "What is not rendered yet".
 * The value that tells them apart was already in the layer the renderer reads;
 * this is the per-value lookup it was missing.
 */
const EDGE_ART_BY_NUMERIC_ID: ReadonlyMap<number, EdgeArt> = new Map<number, EdgeArt>([
  [WALL_EDGE_NUMERIC_ID, { face: 'env.wall.interior.face', cap: 'env.wall.interior.cap' }],
  [DOOR_EDGE_NUMERIC_ID, { face: 'env.door.interior.face', cap: 'env.door.interior.cap' }],
]);

/** Undefined for an edge value with no artwork: the painter falls back to a coloured block. */
export function edgeArt(edgeNumericId: number): EdgeArt | undefined {
  if (edgeNumericId === 0) return undefined;
  return EDGE_ART_BY_NUMERIC_ID.get(edgeNumericId);
}

/**
 * The floor a zoned tile is drawn with.
 *
 * **Keyed by zoning rather than by terrain, and that is a measured choice, not
 * a convenience.** The two floor sheets are interiors -- institutional linoleum
 * and cast concrete slabs -- and the world has no interior terrain to hang them
 * on: `SparseWorld.setTerrain` has no caller anywhere outside `SparseWorld`
 * itself, so every tile in every session is terrain `dirt`, forever, and a
 * mapping keyed by terrain id would download a sheet to draw nothing. What the
 * simulation *does* produce is zoning: designating a room is the act that makes
 * a patch of ground an interior, and drawing that patch as an interior floor is
 * a view of a fact the simulation already holds.
 *
 * The room's own category is still carried by `zoningTint`, drawn over this at
 * a reduced alpha, so "which room is this" survives the floor being art.
 *
 * One floor for every category today. This returns per zoning id rather than
 * per category so a later split -- concrete for utility and logistics, linoleum
 * for the rest -- is a change in this function and nowhere else.
 */
export function zonedFloorSprite(zoningNumericId: number): EnvironmentSpriteId | undefined {
  if (zoningNumericId === 0) return undefined;
  const room = defaultRoomContentRegistry.getByNumericId(zoningNumericId);
  if (room === undefined) return undefined;
  return 'env.floor.institutional';
}

/** What a coverage question answers with: the ids drawn as art, and the ids left on colour. */
export interface ArtCoverage {
  readonly drawn: readonly string[];
  readonly onFallback: readonly string[];
}

/**
 * Every terrain is on the colour fallback, and each for a reason worth stating
 * once rather than guessing at later:
 *
 * - `dirt`, `grass`, `gravel`, `rock`, `water` -- no sheet is ground. The 23
 *   sheets are two interior floors, two wall module sets, two door sets,
 *   furniture, fixtures, perimeter structures and security devices.
 * - `concrete` -- `floor.concrete.variants` would fit it exactly, and it is
 *   *not* mapped because no code path can produce a concrete tile: see
 *   `zonedFloorSprite` above. Mapping it would add 2.3 MB to the first load to
 *   draw nothing. This is the row to add when terrain painting arrives.
 */
export const TERRAIN_ON_COLOUR_FALLBACK: readonly string[] = ['concrete', 'dirt', 'grass', 'gravel', 'rock', 'water'];

/**
 * Every catalogued object is on the colour fallback in this slice.
 *
 * Seven of the twenty have no sheet at all -- there is no stove, fridge,
 * bookshelf, washing machine, medical bed, medicine cabinet or security console
 * anywhere in the batch. The other thirteen do have plausible sheets
 * (`furniture.cell.bed.single.variants`, `fixture.cell.toilet_sink`,
 * `furniture.cell.locker.variants`, `furniture.cell.table_stool`,
 * `furniture.corridor.bench.variants`, `furniture.office.desk.employee.variants`,
 * `furniture.visitor.chair.variants`, `storage.container.variants` and the
 * rest) and are left on colour deliberately: each additional sheet is a whole
 * ~1.5 MB download, and furniture is drawn from build orders through a
 * different path from the tile layers this change touches. Objects are the
 * declared next slice, not an oversight.
 */
export const OBJECTS_ON_COLOUR_FALLBACK: readonly string[] = [
  'object.bed',
  'object.bench',
  'object.bookshelf',
  'object.chair',
  'object.desk',
  'object.dining-table',
  'object.fridge',
  'object.loading-dock-door',
  'object.medical-bed',
  'object.medicine-cabinet',
  'object.prep-counter',
  'object.security-console',
  'object.shower-head',
  'object.sink',
  'object.storage-rack',
  'object.stove',
  'object.toilet',
  'object.utility-panel',
  'object.washing-machine',
  'object.waste-bin',
];

/**
 * Terrain id -> floor art. **Empty in this slice, and empty is the row set, not
 * a stub:** the comment on `TERRAIN_ON_COLOUR_FALLBACK` says why each of the six
 * terrains is not in it. Mapping `concrete` when terrain painting arrives is one
 * line here and no change to the painter.
 */
const FLOOR_SPRITE_BY_TERRAIN_ID: Readonly<Record<string, EnvironmentSpriteId>> = {};

/** Undefined for a terrain this renderer has no art for: the painter fills it with a colour. */
export function terrainFloorSprite(terrainId: string): EnvironmentSpriteId | undefined {
  return FLOOR_SPRITE_BY_TERRAIN_ID[terrainId];
}

/**
 * Catalogued object id -> art. Empty in this slice, for the reason
 * `OBJECTS_ON_COLOUR_FALLBACK` gives.
 */
const SPRITE_BY_OBJECT_ID: Readonly<Record<string, EnvironmentSpriteId>> = {};

/** Undefined for an object this renderer has no art for: the painter draws a coloured block. */
export function objectSprite(objectId: string): EnvironmentSpriteId | undefined {
  return SPRITE_BY_OBJECT_ID[objectId];
}

/** Terrain ids, split by whether this renderer has art for them. Computed from the shared definitions. */
export function terrainArtCoverage(): ArtCoverage {
  const drawn: string[] = [];
  const onFallback: string[] = [];
  for (const definition of [...DEFAULT_TERRAIN_DEFINITIONS].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    (terrainFloorSprite(definition.id) === undefined ? onFallback : drawn).push(definition.id);
  }
  return { drawn, onFallback };
}

/** Catalogued object ids, split the same way. */
export function objectArtCoverage(): ArtCoverage {
  const drawn: string[] = [];
  const onFallback: string[] = [];
  for (const definition of defaultObjectRegistry.all()) {
    (objectSprite(definition.id) === undefined ? onFallback : drawn).push(definition.id);
  }
  return { drawn, onFallback };
}

/** The edge values the world's edge layers can carry, split the same way. */
export function edgeArtCoverage(): ArtCoverage {
  const drawn: string[] = [];
  const onFallback: string[] = [];
  for (const [label, numericId] of [
    ['wall', WALL_EDGE_NUMERIC_ID],
    ['door', DOOR_EDGE_NUMERIC_ID],
  ] as const) {
    (edgeArt(numericId) === undefined ? onFallback : drawn).push(label);
  }
  return { drawn, onFallback };
}
