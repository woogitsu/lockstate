/**
 * Where an actor plants its feet when other actors are standing on the very
 * same spot.
 *
 * ## The defect this exists for, and the exact bound of what it fixes
 *
 * Issue [#944](https://github.com/woogitsu/lockstate/issues/944): a prison
 * with 22 prisoners and 6 guards alive drew **two figures**, because the worker
 * had put 6 prisoners on one tile and 16 prisoners plus all 6 guards on
 * another, and two actors on one tile were drawn at one point. Depth could not
 * help: `depthForAnchor` is a function of the anchor row, so co-located actors
 * got the *identical* number, Phaser's sort is stable, and the survivor was
 * decided by which block of the feed's array an actor sat in -- prisoners
 * first, guards second, so on a shared tile the guard always won and the
 * prisoners were always the hidden ones. Reordering that only swaps which
 * population disappears. **One figure where two stood is a placement problem,
 * not an ordering problem**, which is why the answer is here and not in
 * `src/rendering/depth.ts`.
 *
 * ## What it does not fix, said in the same breath
 *
 * #944 section 3 asked *why* they stack, and the measurement record that
 * answered it -- the note under `docs/research/` dated 2026-09-04 and titled
 * *"Why does the simulation stack twenty-two prisoners on one tile?"* -- found
 * the simulation. A prisoner's position is written on admission, per tile
 * crossed, and on arrival to **the room instance's `anchorTile`** -- one tile
 * per room in use, plus the arrival tile for everyone the prison cannot house.
 * Giving every prisoner a bed put six of them on **one** tile instead of two.
 * So the stack is by construction and nothing in this file removes it.
 *
 * (Cited by title rather than by path on purpose: that record is a separate
 * branch's work at the time of writing, and
 * `tests/foundation/documentation-links-contract.test.ts` rightly fails a
 * comment citing a path this tree does not have.)
 *
 * A tile is one tile wide, and this spread stays inside it deliberately (see
 * below), so it separates as many figures as fit across one tile and no more:
 * **two or three actors on a tile read as two or three figures; twenty-two
 * read as a crowd standing on one tile rather than as one person.** It reports
 * the crowd. It does not count it, and it does not unstack it. The count
 * affordance issue #944 §4.3 prices is a separate decision, and so is the
 * simulation-side fix that record's §4 costs.
 *
 * ## The shape, and why every part of it is that way
 *
 * Rank `i` of `count` co-located actors is drawn `i / (count - 1)` of the way
 * along a fixed south-east cascade from the tile centre. Four properties are
 * load-bearing:
 *
 * - **Rank 0 does not move at all.** A lone actor is drawn exactly where it
 *   was before this file existed, and so is the first actor of any group, so
 *   no prison that is not stacking looks any different. It also means an actor
 *   joining a tile never shoves the actor already standing there off the spot
 *   it holds.
 * - **The offset is monotone in rank on both axes**, so two ranks are never
 *   the same point and never the same world Y. `ActorLayer` takes the depth
 *   anchor from the *drawn* foot, so distinct Y means distinct depth: the
 *   overlap order of a crowd is decided by the geometry on screen rather than
 *   by the order the feed happened to build its array in. That is the coupling
 *   #944 §2 found, removed rather than re-pointed.
 * - **Southward and eastward, never north or west.** North is the one
 *   direction that would cost something: an actor anchored north of its own
 *   tile's southern edge sorts *behind* a structure standing on that tile, and
 *   `LAYER_BIAS`'s `actor` entry exists precisely so "someone standing in a
 *   doorway reads as being in front of it". Moving only south keeps that.
 * - **Bounded inside the tile.** The furthest foot lands
 *   `CROWD_SPREAD_SPAN_TILES_X`/`_Y` from the centre, both under half a tile,
 *   so a drawn position never claims a tile the simulation did not name. A
 *   wider fan would read better and would be a lie: the renderer does not know
 *   where the room's walls are, and #944 section 3's measurement record says
 *   of a fan-out that leaves the tile that it is "better to look at, and no
 *   more true".
 *
 * ## Determinism
 *
 * Pure and total: the same rank and count always give the same offset, so two
 * clients drawing the same published frame draw the same picture. The rank
 * itself comes from `ActorLayer`'s walk over the feed's array, and that array
 * has a documented deterministic order (`actors-from-snapshot.ts`,
 * `render-actors-keyframe.ts`: prisoners by ascending entity index, then
 * guards by ascending entity id). Nothing here reads a clock, a random source
 * or an actor id.
 */

/** How far east the last member of a full spread stands, in tiles. */
export const CROWD_SPREAD_SPAN_TILES_X = 0.44;
/**
 * How far south the last member of a full spread stands, in tiles.
 *
 * Smaller than the eastward span because a character frame is taller than it
 * is wide (`assets/contracts/character-8-direction.contract.json` authors
 * 256x384 for a 1x1 footprint), so a given number of pixels of horizontal
 * separation exposes more of the figure behind than the same number vertically.
 */
export const CROWD_SPREAD_SPAN_TILES_Y = 0.3;

/**
 * Sub-tile resolution the co-location test quantises to before comparing two
 * positions.
 *
 * It matches the render delta channel's own `RENDER_ACTORS_SUBTILE_UNITS`, so
 * a position the worker published is compared at exactly the resolution it was
 * published at and two actors the simulation put on one tile always land in
 * one group. It is written here rather than imported so that this module stays
 * free of the simulation protocol; the coupling is a number both sides state,
 * and `tests/unit/rendering-crowd-spread.test.ts` pins them equal.
 */
export const CROWD_POSITION_QUANTUM = 256;

/**
 * How far a tile coordinate may be from the origin and still get a group key.
 *
 * The key packs two quantised coordinates into one double, which is injective
 * only while both fit their field: x within ±2^26 quantised units and y within
 * ±2^25, which is ±262,144 and ±131,072 tiles. An actor outside that is given
 * no group and drawn on its tile centre, exactly as every actor was before
 * this file existed -- the failure mode is "not separated", never a wrong
 * position and never a collision with a distant actor's group.
 */
const QUANTISED_X_LIMIT = 2 ** 26;
const QUANTISED_Y_LIMIT = 2 ** 25;
const KEY_X_STRIDE = 2 ** 27;

/** Sentinel for a position that has no group key. Never a valid key, which is always non-negative. */
export const NO_CROWD_KEY = -1;

/**
 * A `CrowdOffset` its owner refills in place.
 *
 * `ActorLayer` computes one per visible actor per frame, and per-frame garbage
 * proportional to the drawn population is a cost that module's docblock
 * already accounts for by hand. Callers treat it as a value.
 */
export interface CrowdOffset {
  /** Tiles east of the actor's own position. Never negative. */
  x: number;
  /** Tiles south of the actor's own position. Never negative. */
  y: number;
}

export function createCrowdOffset(): CrowdOffset {
  return { x: 0, y: 0 };
}

/**
 * The group key for a drawn position, or `NO_CROWD_KEY`.
 *
 * Two actors share a key when their positions agree to within one
 * `CROWD_POSITION_QUANTUM`th of a tile -- a quarter of a screen pixel at
 * `TILE_SIZE_PX` 64, which is to say when they are drawn at the same point.
 */
export function crowdKeyForPosition(tileX: number, tileY: number): number {
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return NO_CROWD_KEY;
  const quantisedX = Math.round(tileX * CROWD_POSITION_QUANTUM);
  const quantisedY = Math.round(tileY * CROWD_POSITION_QUANTUM);
  if (quantisedX < -QUANTISED_X_LIMIT || quantisedX >= QUANTISED_X_LIMIT) return NO_CROWD_KEY;
  if (quantisedY < -QUANTISED_Y_LIMIT || quantisedY >= QUANTISED_Y_LIMIT) return NO_CROWD_KEY;
  return (quantisedY + QUANTISED_Y_LIMIT) * KEY_X_STRIDE + (quantisedX + QUANTISED_X_LIMIT);
}

/**
 * Where rank `rank` of `count` actors sharing one point stands, in tiles.
 *
 * `count` of 1 or less, or a rank outside the group, yields no offset at all:
 * an actor nothing is standing on top of keeps its published position exactly.
 */
export function crowdSpreadOffset(rank: number, count: number, out: CrowdOffset = createCrowdOffset()): CrowdOffset {
  if (!Number.isInteger(rank) || !Number.isInteger(count)) {
    throw new RangeError('Crowd rank and count must be integers.');
  }
  if (rank < 0 || count < 1 || rank >= count) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const progress = count === 1 ? 0 : rank / (count - 1);
  out.x = progress * CROWD_SPREAD_SPAN_TILES_X;
  out.y = progress * CROWD_SPREAD_SPAN_TILES_Y;
  return out;
}
