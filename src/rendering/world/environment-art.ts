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
 * **THAT SENTENCE IS TRUE OF TWO OF THE THREE TABLES BELOW AND FALSE OF THE
 * THIRD, measured 2026-09-05 (#1020).** It is kept rather than rewritten
 * because it is the property this module was designed for and the one the
 * edges and the floors really have; what follows is where it stops.
 *
 * - `EDGE_ART_BY_NUMERIC_ID` -> `edgeArt` is read by the painter, inside
 *   `acquireEdgeSprite`.
 * - `zonedFloorSprite` is read by the painter, inside `paintChunk`.
 * - **`SPRITE_BY_OBJECT_ID` -> `objectSprite` is read by NOTHING that draws.**
 *   Its only caller in `src/` is `objectArtCoverage` immediately below it, and
 *   that function's only caller anywhere is `tests/unit/environment-art.test.ts`.
 *   The loop that draws objects is in `paintRow`, and it calls
 *   `structureAppearance` and `paintSlab` unconditionally -- it never asks this
 *   module a question at all.
 *
 * **So for an object, a row here is necessary and not sufficient, and the
 * coverage this module reports would be a claim about the screen that the
 * screen does not honour.** Adding one row to `SPRITE_BY_OBJECT_ID` and
 * striking the id from `OBJECTS_ON_COLOUR_FALLBACK` left the whole unit suite
 * green -- 229 files, 3344 tests -- with the object still drawn as a
 * slate-blue slab.
 *
 * **THAT WAS THE STATE FOR ONE DAY AND IS NO LONGER THE STATE, AS OF LATER ON
 * 2026-09-05 (#1020, the pass after the one above).** The three bullets are
 * kept exactly as they were measured, because the whole argument of this
 * docblock is that a claim about the painter is checkable and someone checked
 * it; what changed is the third bullet's answer, and marking the direction is
 * worth more than a clean paragraph. **`objectSprite` is now read by the
 * painter too, inside `acquireObjectSprite`, which `paintRow`'s structure loop
 * calls before it falls back to `paintSlab`.** The sentence at the top of this
 * docblock is therefore true of all three tables for the first time, and
 * adding art for a *second* object really is one row here plus its rectangle
 * in `environment-sprites.ts`.
 *
 * What the third table was missing was not a row: it was a painter path, and
 * writing one was a decision rather than content -- an object is drawn without
 * art as a two-faced slab (`paintSlab`, a top face plus a side face rising
 * `heightTiles`), a sprite is one flat frame, and which of those a bed is had
 * no answer in any ADR. **It is decided now, in the painter, where the
 * consequence is:** `acquireObjectSprite`'s docblock says an object sprite is
 * flat and covers exactly the footprint the simulation reserved, and says what
 * lifting it over the slab's `bounds` would have done to the tile north of it.
 * ADR-0052's "Open question left deliberately unresolved" is untouched by that
 * -- it is about which sheets are worth their download, which is still the
 * owner's, and is why one object is mapped here and not thirteen.
 *
 * **ADR-0052's own consequence *"Adding art for a new object is a row in a data
 * module"* was wrong in the same place as the sentence above, and is now true
 * -- but the ADR still is not this module's to edit** (`docs/AGENT_WORKFLOW.md`
 * §3: an implementing agent does not edit an ADR). It went to the integrator
 * with this change rather than being quietly corrected here.
 *
 * Two properties are enforced rather than intended:
 *
 * - **A row naming art that does not exist fails `tsc`,** because every value
 *   is an `EnvironmentSpriteId` and that is a union of the sprites
 *   `environment-sprites.ts` declares.
 * - **A simulation identity with no art resolves to a *declared* fallback,
 *   never to a blank tile.** The lists below say exactly which identities those
 *   are, and `tests/unit/environment-art.test.ts` fails if the lists and the
 *   registries disagree in either direction -- so cataloguing a new object
 *   without artwork is a red test naming it, not a hole nobody sees. The
 *   guard is `describe('declared fallback')` at `:242`, and the two
 *   directions are `:249` and `:257`.
 *
 *   This named `environment-art-coverage.test.ts` until 2026-08-28.
 *   That file has never existed -- `git log --diff-filter=A` finds no commit
 *   adding it, in the whole history -- so the citation was wrong from the day
 *   it was written rather than overtaken by a rename. The promise above was
 *   checked before the name was corrected, because a docblock pointing at a
 *   file that was never written is equally consistent with the guard being
 *   real and misnamed and with there being no guard at all; it is the first.
 *   The dead name is written bare rather than rooted at `tests/unit/` so that
 *   `tests/foundation/documentation-links-contract.test.ts` does not read this
 *   record as a live claim; its docblock says when to do that and when to
 *   allowlist instead.
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
 * The room's own identity is still carried by `zoningTint` (keyed by room id
 * since ADR 0098 option A, not by category), drawn over this at a reduced
 * alpha, so "which room is this" survives the floor being art.
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
 * Most terrain is on the colour fallback, and each for a reason worth stating
 * once rather than guessing at later:
 *
 * - `gravel`, `rock`, `water` -- no published Blender render covers
 *   them. The original 23 owner sheets are two interior floors, two wall module sets, two door sets,
 *   furniture, fixtures, perimeter structures and security devices.
 * - `concrete` -- `floor.concrete.variants` would fit it exactly, and it is
 *   *not* mapped because no code path can produce a concrete tile: see
 *   `zonedFloorSprite` above. Mapping it would add 2.3 MB to the first load to
 *   draw nothing. This is the row to add when terrain painting arrives.
 */
export const TERRAIN_ON_COLOUR_FALLBACK: readonly string[] = ['concrete', 'gravel', 'rock', 'water'];

/**
 * Every catalogued object **except `object.bed`** is on the colour fallback.
 *
 * The paragraph below was written when the list was all twenty and it is kept,
 * because everything it says about the other nineteen still holds and the
 * download argument is the reason there are nineteen rather than seven. What
 * changed on 2026-09-05 is only that the first sheet was worth paying for:
 * `furniture.cell.bed.single.variants` is 1,341,733 bytes, and a bed is the
 * object a cell is *for* -- `src/content/room-catalog.ts` makes `object.bed`
 * one of the two things a cell requires, so it is the object a player looks at
 * first and the one whose coloured block was least informative.
 *
 * Seven of the twenty have no sheet at all -- there is no stove, fridge,
 * bookshelf, washing machine, medical bed, medicine cabinet or security console
 * anywhere in the batch. Of the other thirteen, twelve are left on colour
 * deliberately: each additional sheet is a whole ~1.5 MB download, and
 * furniture is drawn from build orders through a different path from the tile
 * layers this change touches. Objects are the declared next slice, not an
 * oversight.
 *
 * **`object.toilet` left this list on 2026-09-06 (ADR 0100), and not by
 * gaining an owner-sheet row.** Its only shipped view,
 * `fixture.cell.toilet_sink`, is a combined toilet+sink column no crop fits
 * into the 1x1 tile the catalogue declares -- the paragraph above is kept
 * because it is still true of the other twelve, and because it is the reason
 * this one needed a second publishing lane rather than a thirteenth row of
 * the same kind `object.bed` got. `SPRITE_BY_OBJECT_ID` below maps it to
 * `env.object.toilet`, a Blender render rather than a sheet crop.
 *
 * **`object.bench` and `object.desk` left this list on 2026-09-06 (issue
 * #1020), the pass that looked at the other 22 renders the toilet's batch
 * shipped alongside it and asked, per object, whether the frame reads as the
 * thing it names at the size the game actually draws it.** Both are the
 * rendered-art lane, not an owner-sheet crop -- bytes are negligible either
 * way (176.1 KiB for all 23 renders together, ADR 0100), the question was
 * legibility, not download cost. Two more of the thirteen with a usable owner
 * sheet were looked at and left here on purpose, and the reason is recorded
 * once rather than at each row: `object.chair`'s only render
 * (`furniture.visitor.chair.variants`) is a top-down seat cushion with no
 * visible back or legs, and at 64px it reads as a rounded blue-grey blob
 * barely distinct from this very fallback slab -- drawing it would trade a
 * legible "there is an object here" block for a *less* legible one, not a
 * better one. No other of the twenty has any render at all whose subject
 * matches its footprint without stretching it (`docs/adr/0100-*.md` and this
 * module's own history record the ones that were considered and rejected:
 * a reception counter and a shipping container both happen to share a
 * footprint with `object.loading-dock-door` and `object.prep-counter`
 * respectively and neither looks anything like either object).
 *
 * **`object.storage-rack` left this list the same day #1020's own pass added
 * it, and returned the next (issue #1059), on the same "does it read as the
 * thing it names at 64px" bar that pass set for `object.chair`.** The pass
 * that wired it flagged its render as "the one judgement call in this batch"
 * (`environment-sprites.ts`'s docblock, before this revert): no render in the
 * batch is named or shaped like a literal rack, and the render used instead --
 * `furniture.cell.locker.variants`, a double-doored cabinet -- was chosen for
 * sharing the footprint and the general "storage furniture" category, not for
 * reading as a rack on screen. A playtest that built the object in a real
 * prison and looked at it (the first time anyone had, since #1059 only wired
 * it and never played it) found that judgement call did not survive contact
 * with the screen: at both zoom 1 (the zoom a player builds at) and zoom 3
 * (`ZOOM_BOUNDS.max`, `src/rendering/scene/world-scene.ts:71`), the frame is a
 * flat grey-blue rectangle with a single vertical seam line down the middle --
 * no doors, no handle, no hinge, no shading suggesting depth -- which is
 * exactly the "rounded blob barely distinct from this fallback slab" failure
 * mode `object.chair` was refused for, not a milder version of it: a chair's
 * rejected render at least kept a cushion's rounded silhouette, where the
 * rack's kept nothing the locker render's own hinge-and-latch description
 * promised. The native 256x256 render is itself just the grey panel and the
 * seam -- confirmed before reverting, so this is not an artefact of drawing it
 * at half size. Recorded here as the sixteenth reason rather than silently
 * removed, per this list's own convention: a return to the fallback is exactly
 * as worth recording as a departure from it.
 *
 * **2026-09-23:** A separate open wooden rack model now serves this object.
 * The rejected closed locker and the playtest finding above remain historical
 * evidence for why the new render needs distinct shelves and visible contents.
 * A new wooden chair likewise replaces the rejected cushion-only visitor
 * render: the back slats, seat frame and front feet are distinct in its frame.
 * The older chair finding above remains the reason this new model was needed.
 * The dining table also leaves the fallback: its new 3x2 render shows three
 * fixed stools, matching the simulation's three dining places, rather than
 * stretching the unrelated 2x1 cell table-and-stool render across six tiles.
 * The twin laundry washer has its own 2x1 model with two top-visible drum windows.
 * The 2x1 surveillance console now has its own three-screen model rather
 * than a generic desk or coloured slab; its low monitor hoods face the
 * game's overhead camera.
 * A purpose-built 1x1 utility panel now exposes its six large breakers and
 * guarded switch to the overhead view, so it no longer needs a coloured slab.
 */
export const OBJECTS_ON_COLOUR_FALLBACK: readonly string[] = [
  'object.sink',
];

/**
 * Terrain id -> floor art. The compacted-dirt render is the first exterior
 * surface drawn here. Other terrain keeps its colour fallback. A row for
 * `concrete` can follow when terrain painting produces concrete tiles.
 */
const FLOOR_SPRITE_BY_TERRAIN_ID: Readonly<Record<string, EnvironmentSpriteId>> = {
  dirt: 'env.terrain.dirt',
  grass: 'env.terrain.grass',
};

const TERRAIN_ID_BY_NUMERIC_ID: ReadonlyMap<number, string> = new Map(
  DEFAULT_TERRAIN_DEFINITIONS.map((definition) => [definition.numericId, definition.id]),
);

/** Undefined for a terrain this renderer has no art for: the painter fills it with a colour. */
export function terrainFloorSprite(terrainId: string): EnvironmentSpriteId | undefined {
  return FLOOR_SPRITE_BY_TERRAIN_ID[terrainId];
}

/** Numeric terrain identity from the render feed, resolved through the shared catalogue. */
export function terrainFloorSpriteByNumericId(numericId: number): EnvironmentSpriteId | undefined {
  const terrainId = TERRAIN_ID_BY_NUMERIC_ID.get(numericId);
  return terrainId === undefined ? undefined : terrainFloorSprite(terrainId);
}

/**
 * Catalogued object id -> art.
 *
 * **This was empty, and its comment said empty was load-bearing: no painter
 * read `objectSprite`, so a row here bought nothing on screen and cost the
 * truth of `objectArtCoverage()`.** That is why the row order mattered, and it
 * is no longer the state -- the painter path landed first, exactly as that
 * comment demanded, and this is the row it was waiting for. The old wording is
 * summarised rather than kept in full because the module docblock above holds
 * the measurement it was made of.
 *
 * One row, not thirteen. Each additional owner sheet is a whole ~1.3 MiB
 * download (`OBJECTS_ON_COLOUR_FALLBACK`), and how many of those a first load
 * should carry is ADR-0052's open question and the owner's to answer. What
 * this row settles is the *mechanism*, which was the thing in doubt: a second
 * object is now this line plus a rectangle in `environment-sprites.ts`, and it
 * changes no painter.
 *
 * **`object.toilet` is the third row and the first from ADR 0100's second
 * publishing lane** -- 11.27 KiB, a Blender render rather than a crop of an
 * owner sheet, because the owner sheet has no crop this footprint fits
 * (`OBJECTS_ON_COLOUR_FALLBACK`'s comment says why). The mechanism this row
 * exercises is still exactly the one above: this line plus a sprite
 * definition, and `acquireObjectSprite` in `tile-layer.ts` is unchanged.
 *
 * **`object.bench` and `object.desk` are the fourth and fifth rows, both
 * rendered-art, added 2026-09-06 (#1020).** Bytes are still not the reason
 * there are two rather than nineteen -- the mechanism is unchanged and the
 * two renders together are a few more KiB. The reason is
 * `OBJECTS_ON_COLOUR_FALLBACK`'s own comment: every other object either has
 * no render at all, or the render that shares its footprint does not read as
 * the thing the object catalogue names.
 *
 * **`object.storage-rack` was briefly a sixth row, added alongside bench and
 * desk in the same #1020 pass and removed the next day (#1059) once a
 * playtest actually looked at it in a built prison.** `OBJECTS_ON_COLOUR_FALLBACK`'s
 * comment carries the reading in full. The new row below uses a purpose-built
 * open wooden rack, not the old closed locker render.
 */
const SPRITE_BY_OBJECT_ID: Readonly<Record<string, EnvironmentSpriteId>> = {
  'object.bed': 'env.object.bed',
  'object.medical-bed': 'env.object.medical-bed',
  'object.medicine-cabinet': 'env.object.medicine-cabinet',
  'object.stove': 'env.object.stove',
  'object.fridge': 'env.object.fridge',
  'object.washing-machine': 'env.object.washing-machine',
  'object.security-console': 'env.object.security-console',
  'object.utility-panel': 'env.object.utility-panel',
  'object.loading-dock-door': 'env.object.loading-dock-door',
  'object.prep-counter': 'env.object.prep-counter',
  'object.bookshelf': 'env.object.bookshelf',
  'object.toilet': 'env.object.toilet',
  'object.bench': 'env.object.bench',
  'object.desk': 'env.object.desk',
  'object.shower-head': 'env.object.shower-head',
  'object.waste-bin': 'env.object.waste-bin',
  'object.storage-rack': 'env.object.storage-rack',
  'object.chair': 'env.object.chair',
  'object.dining-table': 'env.object.dining-table',
};

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
