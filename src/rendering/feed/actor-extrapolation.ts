import type { MutableRenderActor } from './render-feed';

/**
 * Where a published actor is drawn *between* two publications.
 *
 * ### The problem this solves, and the one it does not
 *
 * The worker publishes actor state on a 100 ms ceiling (ADR 0040) and the
 * scene draws at the display's refresh rate. Drawing the last published
 * position on every frame therefore moves a walking actor in ten steps a
 * second however smooth the simulation is -- which is the same stutter #414
 * describes, an order of magnitude smaller. Advancing the published position
 * by the published velocity closes it.
 *
 * ### Why this is not the renderer-side movement model `AGENTS.md` forbids
 *
 * Boundary 1 is about **who decides where an actor goes**, and nothing here
 * decides anything:
 *
 * - The velocity is *published simulation state* since
 *   [ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md),
 *   not a difference between two frames. `actors-from-snapshot.ts` refuses to
 *   difference two snapshots and that refusal is untouched; this reads a field.
 * - It is **bounded**. `MAX_ACTOR_EXTRAPOLATION_SECONDS` is longer than one
 *   publication interval and far shorter than a journey, so a worker that goes
 *   quiet leaves actors standing rather than sliding away, and the error is
 *   bounded by the walk speed times that constant however long the silence is.
 * - It is **corrected by every publication**, and it feeds nothing: the result
 *   is written into the sprite's position and read by no simulation, no
 *   projection and no command.
 *
 * ### Filled in place
 *
 * The feed owns the actor objects and refills their coordinates each frame,
 * for the reason `ActorPose` gives: this runs once per actor per frame, and a
 * fresh object per actor per frame is garbage proportional to the population
 * on the one path whose whole argument is that it allocates nothing.
 */

/**
 * How far past the last publication an actor may be advanced, in seconds.
 *
 * A quarter of a second is two and a half publication intervals at ADR 0040's
 * 100 ms ceiling -- enough slack that an ordinary late message does not make
 * an actor stop and start, and short enough that a worker which has genuinely
 * stopped publishing leaves the prison standing still within a frame or two
 * rather than drifting. At the shipped walking speed -- ten tiles a second,
 * `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` -- the worst-case error a clamp of this
 * size can hold is two and a half tiles.
 */
export const MAX_ACTOR_EXTRAPOLATION_SECONDS = 0.25;

/** The position an actor was published at, which every frame's advance is measured from rather than from the previous frame. */
export interface PublishedActorPosition {
  readonly tileX: number;
  readonly tileY: number;
}

/**
 * Advances each actor from the position it was published at by its published
 * velocity, and clamps how far that may go.
 *
 * Measured from the publication rather than accumulated frame by frame, so a
 * dropped frame or a long one cannot make an actor overshoot and a late
 * publication cannot leave a rounding residue behind.
 */
export function extrapolateActors(
  actors: readonly MutableRenderActor[],
  published: readonly PublishedActorPosition[],
  elapsedSeconds: number,
): void {
  const advanced = Math.min(Math.max(Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0, 0), MAX_ACTOR_EXTRAPOLATION_SECONDS);
  const count = Math.min(actors.length, published.length);
  for (let index = 0; index < count; index += 1) {
    const actor = actors[index]!;
    const from = published[index]!;
    actor.tileX = from.tileX + actor.deltaX * advanced;
    actor.tileY = from.tileY + actor.deltaY * advanced;
  }
}
