/**
 * The traversal predicate for a fixture world that has no geometry in it.
 *
 * `LocomotionStore.advance` requires a caller to say whether an edge may be
 * crossed on the tick it is crossed --
 * the ADR *When a route stops being valid* -- and it is required rather than defaulted on purpose: a default of "always
 * allowed" is exactly the state the audited tree was in, and it would come back
 * silently for the next population given a walk.
 *
 * That leaves the fixtures whose subject is something else -- action selection,
 * room contention, the stepping arithmetic itself -- needing an answer for a
 * world where nothing is ever in the way. This is that answer, named rather
 * than written inline as `() => true` five times, so that a reader finds the
 * claim being made: **these fixtures build no walls and register no doors, so
 * every edge in them is open on every tick.** A fixture that starts building
 * geometry must stop using this and ask the world, the way
 * `tests/integration/wall-built-mid-walk.test.ts` does.
 */
export const OPEN_GROUND = (): boolean => true;
