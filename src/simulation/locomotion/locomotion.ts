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
 * ### Why sub-tile progress is integer, and why it is now saved
 *
 * Integer, because ADR 0020 makes the kernel's state deterministic and
 * reproducible from a seed; a fixed-point offset in `1/256` of a tile is exact
 * under addition where a float accumulator is exact only in practice.
 *
 * **Saved since issue #1373** (the owner's ruling of 2026-09-23 on ADR 0059
 * open question 3, option 5): `getSnapshot` carries every walk and heading,
 * and a save written by this build restores its walkers mid-stride. Measured
 * before the change, on the fixture
 * `tests/determinism/restore-mid-walk-exactness.test.ts` uses (issue #1373):
 * 41 of 41 saves taken with somebody walking restored to a prison that had
 * not reconverged with the one that was saved by day 6. The paragraph that
 * follows is what this header said until then, and it is kept because
 * `clear()` is still exactly what a restore of an *older* save does:
 *
 * > Not saved, because a walk is already transient state that no save carries.
 * > `PrisonerOperationsRuntime.loadSnapshot` drops every restored traveller to
 * > `idle` and clears its path request, and `GuardRoster.loadSnapshot` documents
 * > the same mid-leg reset, both because the path request named a queue entry in
 * > a `NavigationSystem` a restored session rebuilds empty. A walk is the second
 * > half of exactly that state, so it is dropped for exactly that reason, and
 * > **no save-format field is added by this module** -- the actor resumes from
 * > the tile it had reached, which is the tile the snapshot already carried.
 *
 * Its premise is what changed: the navigation queue is carried too now
 * (`NavigationSystem.getInFlightSnapshot`), so a restored session is no longer
 * rebuilt empty and the path request is no longer dead.
 *
 * ### What it costs
 *
 * One `Map` iteration per tick over the actors that are *walking*, not over
 * the population: a prison of 5,000 with fifty prisoners in transit steps
 * fifty entries. Beginning a walk allocates one entry and retains the route's
 * waypoint array, which the router had already built and `ActionSystem` used to
 * discard immediately.
 *
 * Since the ADR *When a route stops being valid* each of those entries also
 * asks its owner whether the edge it is about to cross is still crossable --
 * once per tile crossed, not once per tick, so at
 * `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` it is one predicate call every second
 * tick per walker and none for the standing population. It triggers no
 * replanning of its own: a walker that is stopped simply stops, and its owner
 * reconsiders on its own cadence, which is what keeps this off AGENTS.md
 * boundary 9's budgeted pathfinding path.
 *
 * **Still no save-format field *for the re-validation*.** It is asked at the
 * moment of crossing rather than carried as a validity token on the route, so
 * a walk gains no state a snapshot would have to version on its account --
 * which is also why a restored walk needs nothing beyond its waypoints and
 * progress to be re-validated exactly as the saved one would have been. (This
 * paragraph said *"the paragraph above stays true"*; the paragraph above is
 * now a kept quotation, see "why it is now saved".)
 */

/**
 * Sub-tile resolution: how many units of progress make up one tile.
 *
 * A power of two so that a tile boundary is a shift rather than a division,
 * and large enough that a tick of walking is a whole number of units at every
 * speed anybody is likely to try: at `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` a
 * tile takes two ticks, and it would still be exact at eight times slower.
 *
 * It is also the scale the render payload carries -- `render-actors-payload.ts`
 * re-exports this rather than declaring one of its own, so an actor's position
 * between two tiles reaches the renderer unconverted.
 */
export const LOCOMOTION_SUBTILE_UNITS = 256;

/**
 * Walking speed, in sub-tile units per kernel tick.
 *
 * `128 / 256` of a tile per tick at the kernel's 20 Hz is **ten tiles per
 * second**, or two ticks to cross a tile.
 *
 * **A directional default, not a locked balance decision**, in the sense
 * `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` uses the phrase.
 * [ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)
 * argues it at length and carries the table; the short version is that it is
 * bounded on both sides and the lower bound was hit **twice**, by measurement
 * rather than by taste:
 *
 * - **Slower starves prisoners.** The general-population timetable's meal
 *   blocks are 100 ticks (`../prisoners/regime.ts`) and a walled starter prison
 *   is fifty tiles of path across, so a journey that outlasts the block that
 *   sent the prisoner on it costs them the next block too. At 2.5 tiles a
 *   second a prison with a cell and a yard starved its prisoner to hunger `0`;
 *   at 5, a prison with a cell, a shower room *and* a yard did the same.
 * - **Faster reads as sliding rather than walking.** A tile is 64 px
 *   (`src/rendering/tile-metrics.ts`), so this is 640 px/s on screen at 1x --
 *   hurried, and the honest cost of a 2,400-tick day. ADR 0059 open question 1
 *   is where the day length is handed back.
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

/** One walk as a save carries it: `WalkState` plus the key it belongs to. */
export interface WalkSnapshot {
  readonly key: number;
  readonly waypoints: readonly TilePosition[];
  readonly next: number;
  readonly progress: number;
  readonly headingX: HeadingComponent;
  readonly headingY: HeadingComponent;
}

/** What `LocomotionStore.getSnapshot` carries: see that method. */
export interface LocomotionSnapshot {
  readonly walks: readonly WalkSnapshot[];
  /** `[key, headingX, headingY]`, for every actor that has walked -- a standing actor's heading is the way it faces. */
  readonly headings: readonly (readonly [number, HeadingComponent, HeadingComponent])[];
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
  /**
   * Keys whose next edge was closed under them this call, collected for the
   * same reason `arrived` is: the walk they name is deleted after the loop,
   * not inside it.
   *
   * Separate from `arrived` because the two mean opposite things to an owner
   * -- one reached what it set out for, one did not -- and a walker that was
   * stopped by a wall must never be reported as having arrived at a
   * destination it is nowhere near. See `advance`.
   */
  private readonly blocked: number[] = [];

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

  /**
   * Drops every walk and every heading. For a restore of a save that carries
   * no walks -- one written before issue #1373 -- which is the reset every
   * restore used to apply.
   */
  public clear(): void {
    this.walks.clear();
    this.headings.clear();
  }

  /**
   * Every walk in progress and every heading, **ascending by key** (issue
   * #1373, ADR 0059 option 5).
   *
   * The whole of what `advance` and `read` consult, so a store loaded from
   * this answers every future call exactly as the one that wrote it would:
   * the waypoints, which leg is being walked, how far into it, and the way
   * the actor faces. `arrived` and `blocked` are empty between calls and are
   * not state.
   *
   * Ascending by key rather than in `Map` insertion order: `advance`
   * enumerates the map, but every walk moves by the same amount and writes
   * only its own actor, and the one order-dependent step -- who arrived --
   * is sorted before it is handed over (the argument
   * `tests/determinism/canonical-iteration-contract.test.ts` carries). So
   * insertion order is history, and a save must not carry history into its
   * checksum.
   */
  public getSnapshot(): LocomotionSnapshot {
    const walks: WalkSnapshot[] = [];
    for (const key of [...this.walks.keys()].sort((a, b) => a - b)) {
      const walk = this.walks.get(key)!;
      // Only the legs still to walk, from the waypoint the actor last
      // crossed: `advance` and `read` never look behind `next - 1`, so the
      // tiles already walked are history, and a long walk nearly finished
      // would otherwise carry its whole route. Re-based so `next` is 1.
      walks.push({
        key,
        waypoints: walk.waypoints.slice(walk.next - 1).map((waypoint) => ({ x: waypoint.x, y: waypoint.y })),
        next: 1,
        progress: walk.progress,
        headingX: walk.headingX,
        headingY: walk.headingY,
      });
    }
    const headings: (readonly [number, HeadingComponent, HeadingComponent])[] = [];
    for (const key of [...this.headings.keys()].sort((a, b) => a - b)) {
      const heading = this.headings.get(key)!;
      headings.push([key, heading.x, heading.y]);
    }
    return { walks, headings };
  }

  /**
   * Replaces every walk and heading with a snapshot's.
   *
   * Validates what `beginWalk` validates -- one tile along one axis per leg --
   * and what `advance` relies on: a walk between its first and last waypoint,
   * with progress inside one tile. A save that breaks any of them is refused
   * with a `RangeError` rather than walked through a wall.
   */
  public loadSnapshot(snapshot: LocomotionSnapshot): void {
    this.walks.clear();
    this.headings.clear();
    for (const walk of snapshot.walks) {
      if (this.walks.has(walk.key)) throw new RangeError(`Locomotion snapshot carries two walks for key ${String(walk.key)}.`);
      if (walk.waypoints.length < 2) throw new RangeError(`Walk ${String(walk.key)} has fewer than two waypoints.`);
      for (let index = 1; index < walk.waypoints.length; index += 1) {
        const from = walk.waypoints[index - 1]!;
        const to = walk.waypoints[index]!;
        if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) !== 1) {
          throw new RangeError(`Walk ${String(walk.key)} leg ${String(index)} does not step one tile along one axis.`);
        }
      }
      if (!Number.isInteger(walk.next) || walk.next < 1 || walk.next >= walk.waypoints.length) {
        throw new RangeError(`Walk ${String(walk.key)} is not between its first and last waypoint.`);
      }
      if (!Number.isInteger(walk.progress) || walk.progress < 0 || walk.progress >= LOCOMOTION_SUBTILE_UNITS) {
        throw new RangeError(`Walk ${String(walk.key)} has progress outside one tile.`);
      }
      this.walks.set(walk.key, {
        waypoints: walk.waypoints.map((waypoint) => ({ x: waypoint.x, y: waypoint.y })),
        next: walk.next,
        progress: walk.progress,
        headingX: walk.headingX,
        headingY: walk.headingY,
      });
    }
    for (const [key, x, y] of snapshot.headings) this.headings.set(key, { x, y });
  }

  /** Every key with a walk in progress, ascending. For a restore that has to reconcile walks against the population it restored. */
  public walkingKeys(): readonly number[] {
    return [...this.walks.keys()].sort((a, b) => a - b);
  }

  /**
   * Advances every walk by `ticks` ticks, calling `writeTile` each time an
   * actor's whole-tile position changes and `canCross` before each one.
   *
   * `writeTile` is how the owning population's position store stays the
   * authority on which tile an actor occupies: this class holds *where within*
   * the tile, and nothing else in the simulation has to know that it exists.
   *
   * ### Why `canCross` is asked here, and why it is not optional
   *
   * A route is a plan made against the world of the tick it was calculated on,
   * and until the ADR *When a route stops being valid*
   * nothing re-asked. `beginWalk` validates the *shape* of a waypoint list and
   * retains no geometry version, no door version and no route-dependency token,
   * so a wall a player finished halfway through a journey was crossed as if it
   * were not there -- measured on `main` at v0.0.206, and the walk is deleted
   * by no save, so it looked to a player exactly like a ghosting bug that goes
   * away on reload. `tests/integration/wall-built-mid-walk.test.ts` carries the
   * tick numbers.
   *
   * Navigation's own invalidation is correct and cannot reach this: by the time
   * the waypoints are here the route has left the navigation subsystem and
   * become locomotion state. So the question is asked **at the moment of
   * crossing**, which is the only moment that is about the tick that matters,
   * and it is asked once per crossing rather than once per tick -- at
   * `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` that is one predicate call every two
   * ticks per walker, and none at all for the standing population.
   *
   * **A required parameter, not an optional one.** A default of "always
   * allowed" would restore the defect silently for the next population given a
   * walk -- guards are the named candidate (ADR 0059 open question 4) -- and
   * the whole finding is that nobody noticed the question was never asked.
   *
   * ### What a refusal does
   *
   * The actor stops on the tile it legitimately occupies, with its progress
   * into the refused leg discarded, and its walk is dropped. It does **not**
   * arrive: `onArrived` is the owner's signal that a destination was reached,
   * and an actor stopped by a wall is nowhere near one. The owner sees
   * `isWalking` answer `false` at its next reconsideration and replans, which
   * for a prisoner is `ActionSystem.continueTravelling`'s existing "not
   * walking, no outstanding request" exit -- so a stopped walker costs one
   * reconsideration cycle and no new plumbing.
   *
   * Discarding the partial progress can move the actor back by up to one leg's
   * worth of sub-tile units on the tick the edge closes -- half a tile at the
   * default speed. That is a correction, and the alternative to it is the
   * defect; the ADR *When a route stops being valid* records the cost rather than hiding it.
   */
  public advance(
    ticks: number,
    canCross: (key: number, from: TilePosition, to: TilePosition) => boolean,
    writeTile: (key: number, tile: TilePosition) => void,
    onArrived: (keys: readonly number[]) => void = () => {},
  ): void {
    if (!Number.isInteger(ticks) || ticks <= 0) throw new RangeError('Locomotion advances by a positive whole number of ticks.');
    const step = this.unitsPerTick * ticks;

    for (const [key, walk] of this.walks) {
      walk.progress += step;
      let stopped = false;
      while (walk.progress >= LOCOMOTION_SUBTILE_UNITS && walk.next < walk.waypoints.length) {
        const reached = walk.waypoints[walk.next]!;
        const from = walk.waypoints[walk.next - 1]!;
        if (!canCross(key, from, reached)) {
          // Asked *before* the progress is spent and before `writeTile`, so an
          // actor refused an edge has never been on the far side of it: no
          // consumer of the position store, and no render publication, ever
          // sees it there.
          walk.progress = 0;
          stopped = true;
          break;
        }
        walk.progress -= LOCOMOTION_SUBTILE_UNITS;
        walk.headingX = headingComponent(reached.x - from.x);
        walk.headingY = headingComponent(reached.y - from.y);
        this.headings.set(key, { x: walk.headingX, y: walk.headingY });
        walk.next += 1;
        writeTile(key, reached);
      }

      if (stopped) {
        this.blocked.push(key);
        continue;
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

    // Dropped before `onArrived` runs, for the reason the arrivals are: a
    // handler that starts the next journey must not have the walk it just
    // started deleted by this loop. No handler is called for them -- see the
    // class comment on `blocked`.
    if (this.blocked.length > 0) {
      for (const key of this.blocked) this.walks.delete(key);
      this.blocked.length = 0;
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
