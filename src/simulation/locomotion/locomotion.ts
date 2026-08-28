import type { TilePosition } from '../world/coordinates';

/**
 * How an actor gets from one tile to the next
 * ([ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)).
 *
 * Until this module existed, an actor's position changed **twice per errand**:
 * once when it was admitted and once when a resolved route was applied, which
 * `src/simulation/prisoners/action-system.ts` called an *abstracted arrival*
 * and wrote in one statement. Every consumer downstream therefore saw a
 * teleport, and no cadence on the render channel could turn that into walking
 * -- [ADR 0040](../../../docs/adr/0040-the-shape-of-the-render-delta-channel.md)
 * measured the channel, delivered it, and recorded locomotion as the open
 * question it deliberately did not answer.
 *
 * ### What a walk is
 *
 * A route's waypoints, and a position between two of them. `neighbors`
 * (`../navigation/region-graph.ts`) offers four neighbours, so **every leg of
 * every route this repository can produce is one tile along one axis** -- there
 * are no diagonals to normalise and no leg longer than a tile. That is why the
 * arithmetic below is integer addition rather than a vector library, and the
 * invariant is checked in `beginWalk` rather than assumed.
 *
 * ### Why sub-tile progress is integer, and not saved
 *
 * Integer, because ADR 0020 makes the kernel's state deterministic and
 * reproducible from a seed; a fixed-point offset in `1/256` of a tile is exact
 * under addition where a float accumulator is exact only in practice.
 *
 * Not saved, because a walk is already transient state that no save carries.
 * `PrisonerOperationsRuntime.loadSnapshot` drops every restored traveller to
 * `idle` and clears its path request, and `GuardRoster.loadSnapshot` documents
 * the same mid-leg reset, both because the path request named a queue entry in
 * a `NavigationSystem` a restored session rebuilds empty. A walk is the second
 * half of exactly that state, so it is dropped for exactly that reason, and
 * **no save-format field is added by this module** -- the actor resumes from
 * the tile it had reached, which is the tile the snapshot already carried.
 *
 * ### What it costs
 *
 * One `Map` iteration per tick over the actors that are *walking*, not over
 * the population: a prison of 5,000 with fifty prisoners in transit steps
 * fifty entries. Beginning a walk allocates one entry and retains the route's
 * waypoint array, which the router had already built and `ActionSystem` used to
 * discard immediately.
 */

/**
 * Sub-tile resolution: how many units of progress make up one tile.
 *
 * A power of two so that a tile boundary is a shift rather than a division,
 * and large enough that one tick of walking is several units -- at
 * `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` a tile takes eight ticks, so the
 * quantum is an eighth of a tile per tick and nothing rounds to nothing.
 */
export const LOCOMOTION_SUBTILE_UNITS = 256;

/**
 * Walking speed, in sub-tile units per kernel tick.
 *
 * `32 / 256` of a tile per tick at the kernel's 20 Hz is **2.5 tiles per
 * second**, or eight ticks to cross a tile.
 *
 * **A directional default, not a locked balance decision**, in the sense
 * `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` uses the phrase, and the
 * reasoning is written down so a balance pass has something to disagree with.
 * The two ends of the range it sits between are both real:
 *
 * - Faster reads as sliding rather than walking. A tile is 64 px
 *   (`src/rendering/tile-metrics.ts`), so this is 160 px/s on screen at 1x.
 * - Slower eats the day. An in-game day is 2,400 ticks
 *   (`../prisoners/regime.ts`), so an in-game hour is 100 ticks and this speed
 *   spends one of them on a twelve-and-a-half-tile walk. A starter prison is
 *   one 32x32 chunk (`createNewSimulationRuntime`), so an ordinary errand is a
 *   fraction of an hour and the longest possible walk inside it is about five.
 *
 * The needs it has to stay clear of are the ones a walk delays: `hunger`
 * decays `0.05` a tick (`../prisoners/needs.ts`), so a meal is due roughly
 * every 2,000 ticks and a 100-tick walk to the canteen is five per cent of
 * that budget.
 */
export const DEFAULT_WALK_SUBTILE_UNITS_PER_TICK = 128;

/** Sign of one axis of a heading: `-1`, `0` or `1`. Every leg is axis-aligned, so one of the two is always `0`. */
export type HeadingComponent = -1 | 0 | 1;

/**
 * Where an actor is and which way it is pointing, in sub-tile units.
 *
 * **Mutable and filled in place**, for the reason `ActorPose` is
 * (`src/rendering/actors/actor-pose.ts`): the render publication reads one of
 * these per live actor per publication, and returning a fresh object would be
 * garbage proportional to the population on a path whose whole argument is
 * that it allocates nothing per actor.
 */
export interface WalkReading {
  /** Absolute position in sub-tile units: `tile * LOCOMOTION_SUBTILE_UNITS + offset`. */
  subX: number;
  subY: number;
  /** Velocity in sub-tile units per tick. Zero on both axes when the actor is standing. */
  velocitySubX: number;
  velocitySubY: number;
  /** The last direction walked, kept after arrival so a standing actor faces the way it came. */
  headingX: HeadingComponent;
  headingY: HeadingComponent;
}

export function createWalkReading(): WalkReading {
  return { subX: 0, subY: 0, velocitySubX: 0, velocitySubY: 0, headingX: 0, headingY: 0 };
}

interface WalkState {
  readonly waypoints: readonly TilePosition[];
  /**
   * Index of the waypoint being walked *toward*. `waypoints.length` once the
   * walk has finished, which is the only definition of "arrived" this module
   * has.
   */
  next: number;
  /** Progress from `waypoints[next - 1]` toward `waypoints[next]`, in `[0, LOCOMOTION_SUBTILE_UNITS)`. */
  progress: number;
  headingX: HeadingComponent;
  headingY: HeadingComponent;
}

function headingComponent(delta: number): HeadingComponent {
  return delta === 0 ? 0 : delta > 0 ? 1 : -1;
}

/**
 * The walks in progress for one population, and the heading every actor in it
 * last walked.
 *
 * One store per population rather than one shared store keyed by a composite
 * id, because the two populations key their positions differently -- prisoners
 * by the component index ADR 0005's SoA arrays are addressed with, guards by
 * the `EntityId` a `Map` on `GuardRoster` is addressed with -- and a shared
 * store would have to invent a third key that neither side holds. The stepping
 * rule is shared by being *this class*, which is the part that must not
 * diverge.
 */
export class LocomotionStore {
  private readonly walks = new Map<number, WalkState>();
  private readonly headings = new Map<number, { x: HeadingComponent; y: HeadingComponent }>();
  /**
   * Keys that finished this call, collected during the walk loop and handed
   * over after it.
   *
   * Handed over as a **set** rather than one at a time, because who arrived
   * together is the question the owner has to answer: two prisoners who reach
   * the last free seat of a room on one tick are served in the order the owner
   * chooses, and since [ADR 0062](../../../docs/adr/0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
   * that order is need urgency, which this module knows nothing about. It is
   * sorted **ascending by key** on the way out anyway -- ADR 0005's canonical
   * entity order -- so an owner that adds no order of its own still gets a
   * total one rather than "whoever set off first".
   *
   * Collected rather than dispatched inside the loop for a second reason: a
   * handler cannot then mutate the map that is being iterated, which is what a
   * handler that starts the next journey would otherwise do.
   *
   * Reused rather than allocated: this runs every tick.
   */
  private readonly arrived: number[] = [];

  public constructor(private readonly unitsPerTick: number = DEFAULT_WALK_SUBTILE_UNITS_PER_TICK) {
    if (!Number.isInteger(unitsPerTick) || unitsPerTick <= 0) {
      throw new RangeError(`Walking speed must be a positive integer number of sub-tile units per tick, got ${String(unitsPerTick)}.`);
    }
  }

  /** How many actors are walking. The per-tick cost is a function of this and not of the population. */
  public get walkingCount(): number {
    return this.walks.size;
  }

  /**
   * Starts a walk along `waypoints`, which must run origin-first and step one
   * tile along one axis at a time.
   *
   * Refuses a malformed route rather than walking a straight line through
   * whatever is between two distant waypoints: a route that skips a tile is a
   * router defect, and a locomotion model that quietly interpolated across it
   * would put actors through walls and report nothing.
   *
   * A one-waypoint route -- the actor is already there -- arrives immediately,
   * so a caller never has to special-case "no distance to cover".
   */
  public beginWalk(key: number, waypoints: readonly TilePosition[]): boolean {
    if (waypoints.length === 0) throw new RangeError('A walk needs at least the tile it starts on.');
    for (let index = 1; index < waypoints.length; index += 1) {
      const from = waypoints[index - 1]!;
      const to = waypoints[index]!;
      const stepped = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
      if (stepped !== 1) {
        throw new RangeError(
          `A walk's waypoints must step one tile along one axis; leg ${String(index)} moves from (${String(from.x)}, ${String(from.y)}) to (${String(to.x)}, ${String(to.y)}).`,
        );
      }
    }

    if (waypoints.length === 1) {
      // Already standing on the destination. No walk is stored, so the caller
      // gets its arrival back immediately rather than waiting a tick for a
      // journey with no distance in it.
      this.walks.delete(key);
      return true;
    }

    // The heading is the *first leg's*, not the last one this actor walked.
    // Taken here rather than in `advance` because a walk is read before it is
    // advanced: the system that starts one runs after the one that steps them
    // (order 250 against 200), so a walk begun on tick `n` is published with
    // whatever heading it holds on tick `n`, and inheriting the previous
    // errand's -- or `0, 0` for an actor that has never walked -- would draw
    // the first tick of every journey facing the wrong way or standing still.
    const from = waypoints[0]!;
    const to = waypoints[1]!;
    const headingX = headingComponent(to.x - from.x);
    const headingY = headingComponent(to.y - from.y);
    this.headings.set(key, { x: headingX, y: headingY });
    this.walks.set(key, { waypoints, next: 1, progress: 0, headingX, headingY });
    return false;
  }

  /** Whether this actor is between waypoints. A walk exists only while it is unfinished, so this is the whole of the question. */
  public isWalking(key: number): boolean {
    return this.walks.has(key);
  }

  /** Abandons a walk in progress, leaving the actor on the tile it had reached. Total: an unknown key is a no-op. */
  public cancelWalk(key: number): void {
    this.walks.delete(key);
  }

  /** Abandons the walk *and* forgets the heading. For an actor that has left the prison, so a recycled key inherits nothing. */
  public forget(key: number): void {
    this.walks.delete(key);
    this.headings.delete(key);
  }

  /** Drops every walk and every heading. For a restore, which rebuilds the navigation queue empty. */
  public clear(): void {
    this.walks.clear();
    this.headings.clear();
  }

  /**
   * Advances every walk by `ticks` ticks, calling `writeTile` each time an
   * actor's whole-tile position changes.
   *
   * `writeTile` is how the owning population's position store stays the
   * authority on which tile an actor occupies: this class holds *where within*
   * the tile, and nothing else in the simulation has to know that it exists.
   */
  public advance(
    ticks: number,
    writeTile: (key: number, tile: TilePosition) => void,
    onArrived: (keys: readonly number[]) => void = () => {},
  ): void {
    if (!Number.isInteger(ticks) || ticks <= 0) throw new RangeError('Locomotion advances by a positive whole number of ticks.');
    const step = this.unitsPerTick * ticks;

    for (const [key, walk] of this.walks) {
      walk.progress += step;
      while (walk.progress >= LOCOMOTION_SUBTILE_UNITS && walk.next < walk.waypoints.length) {
        walk.progress -= LOCOMOTION_SUBTILE_UNITS;
        const reached = walk.waypoints[walk.next]!;
        const from = walk.waypoints[walk.next - 1]!;
        walk.headingX = headingComponent(reached.x - from.x);
        walk.headingY = headingComponent(reached.y - from.y);
        this.headings.set(key, { x: walk.headingX, y: walk.headingY });
        walk.next += 1;
        writeTile(key, reached);
      }

      if (walk.next >= walk.waypoints.length) {
        // Standing exactly on the last waypoint: a walk cannot overshoot the
        // tile it was going to, however much of the tick is left over.
        this.arrived.push(key);
        continue;
      }

      // Heading is taken from the leg being walked, not from the last one
      // completed, so the first tick of a turn already faces the new way.
      const from = walk.waypoints[walk.next - 1]!;
      const to = walk.waypoints[walk.next]!;
      walk.headingX = headingComponent(to.x - from.x);
      walk.headingY = headingComponent(to.y - from.y);
      this.headings.set(key, { x: walk.headingX, y: walk.headingY });
    }

    if (this.arrived.length === 0) return;
    this.arrived.sort((a, b) => a - b);
    // Every finished walk is forgotten *before* the handler runs, so a handler
    // that starts the next journey cannot have the walk it just started deleted
    // by the rest of this loop.
    for (const key of this.arrived) this.walks.delete(key);
    onArrived(this.arrived);
    this.arrived.length = 0;
  }

  /**
   * Fills `out` with where this actor is, how fast and which way it faces,
   * given the tile its population's position store holds for it.
   *
   * The tile is passed in rather than read back out of the walk because the
   * position store is the authority: an actor with no walk is exactly on its
   * tile, and an actor mid-leg is that tile plus an offset this class owns.
   */
  public read(key: number, tileX: number, tileY: number, out: WalkReading): WalkReading {
    const heading = this.headings.get(key);
    out.headingX = heading?.x ?? 0;
    out.headingY = heading?.y ?? 0;

    const walk = this.walks.get(key);
    if (walk === undefined || walk.next >= walk.waypoints.length) {
      out.subX = tileX * LOCOMOTION_SUBTILE_UNITS;
      out.subY = tileY * LOCOMOTION_SUBTILE_UNITS;
      out.velocitySubX = 0;
      out.velocitySubY = 0;
      return out;
    }

    out.subX = tileX * LOCOMOTION_SUBTILE_UNITS + walk.headingX * walk.progress;
    out.subY = tileY * LOCOMOTION_SUBTILE_UNITS + walk.headingY * walk.progress;
    out.velocitySubX = walk.headingX * this.unitsPerTick;
    out.velocitySubY = walk.headingY * this.unitsPerTick;
    return out;
  }
}
