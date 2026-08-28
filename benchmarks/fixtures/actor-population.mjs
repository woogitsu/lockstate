/**
 * A live prisoner population for the actor-publication benchmark (#410),
 * built out of the **real** `EntityStore`, `PositionComponent` and
 * `LocomotionStore` rather than a model of them.
 *
 * Same rule as `navigation-layouts.mjs`: a fixture supplies *inputs only* --
 * how many actors there are, which slots are free, where each one stands and
 * which tiles a walker will cross. It computes no cost, no byte count and no
 * call count of its own, so nothing a scenario reports can have been produced
 * by the fixture and compared against itself.
 *
 * ## The counters are measurements, not a model
 *
 * `encodeRenderActorsKeyframe` takes a `RenderActorSource` -- a structural
 * interface *it* declares (`src/simulation/worker/render-actors-keyframe.ts:50`)
 * -- so the only way to learn how many times production walks a population is
 * to hand it a source that counts. The wrappers below delegate every call to
 * the real `EntityStore` and the real `LocomotionStore`; they add a `+= 1` and
 * nothing else. That is the difference between measuring production and
 * re-implementing it, and it is why these counts are the primary metric rather
 * than elapsed time.
 *
 * ## Why there are dead slots
 *
 * `render-actors-keyframe.ts`'s "Two passes, deliberately" section exists
 * because `PositionComponent`'s arrays are keyed over the entity store's
 * *allocated prefix* and not over the live population, so a freed slot inside
 * that prefix still holds its previous occupant's tile. A fixture that spawned
 * `N` and destroyed nothing would make `isIndexAlive` return `true` every time
 * and leave the whole liveness argument unexercised. So one slot in eleven is
 * freed: `allocatedSlots` is `population * 11 / 10` and `liveActorCount` is
 * exactly `population`, which keeps the payload the size ADR 0059's table
 * states (10,016 bytes at 500, 100,016 at 5,000) while the ledger does real
 * work.
 *
 * ## What the geometry is and is not
 *
 * ## Why this takes `modules` rather than loading them
 *
 * The scenario loads `src/` and hands the classes in. That keeps the
 * production import on the file that claims to drive production code, where
 * `tests/foundation/benchmark-scenario-kind-contract.test.ts` reads it, and it
 * keeps this file to what a fixture is for: given the production classes, here
 * is a population to point them at.
 *
 * because `LocomotionStore.beginWalk` refuses a leg that is not one tile along
 * one axis. Two actors may occupy a tile: `LocomotionStore` has no collision
 * model and this fixture invents none. The grid is not a prison and is not
 * claimed to be one -- the subject here is cost per actor, which does not
 * depend on where the actors are.
 */

/** Actors per row of the standing grid. Arbitrary; the cost measured here does not depend on it. */
const GRID_WIDTH = 64;

/**
 * One slot in eleven is freed, so `allocatedSlots / liveActorCount` is
 * `11 / 10` exactly at both tiers and the live count stays round.
 */
const SLOTS_PER_FREED_SLOT = 11;

/** One actor in three walks -- the fraction ADR 0059's table is measured at (167 of 500, 1,667 of 5,000). */
const WALKING_DENOMINATOR = 3;

/**
 * One walker in eight is given a route it finishes inside a publication
 * interval, so the arrival path (`LocomotionStore`'s `arrived` collection, its
 * ascending-key sort and the `onArrived` handover) is exercised rather than
 * merely present. The rest are given routes far longer than the interval, for
 * the reason ADR 0059 records about its own timing run: *"the routes are made
 * long enough that the store stays populated for the length of a timing run,
 * because a first draft of this measurement timed an empty store and reported
 * 0.0002 ms."*
 */
const ARRIVING_WALKER_DENOMINATOR = 8;

/**
 * Legs of a route a walker finishes within one publication interval, and of
 * one it does not.
 *
 * Two is the shortest route that outlives a publication (two ticks at
 * `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` is one tile), and shortest is what is
 * wanted: the scenario re-begins every walk each iteration to restore state,
 * and `beginWalk` validates every leg of the route it is handed, so a longer
 * route buys nothing and charges the measured section for validation a real
 * publication never pays. See the scenario's note on what its `samplesMs`
 * over-counts.
 */
const SHORT_ROUTE_LEGS = 1;
const LONG_ROUTE_LEGS = 2;

const populationCache = new Map();

/**
 * A population of `population` live prisoners, one third of them walking,
 * wired into the exact `RenderActorSource` shape the production encoder reads.
 */
export function buildActorPopulation(modules, population) {
  const cached = populationCache.get(population);
  if (cached !== undefined) return cached;

  const allocatedSlots = Math.round((population * SLOTS_PER_FREED_SLOT) / (SLOTS_PER_FREED_SLOT - 1));

  const entityStore = new modules.EntityStore(allocatedSlots);
  const position = new modules.PositionComponent(allocatedSlots);
  const locomotion = new modules.LocomotionStore();

  const spawned = [];
  for (let index = 0; index < allocatedSlots; index += 1) spawned.push(entityStore.spawn());
  for (let index = 0; index < allocatedSlots; index += 1) {
    if (index % SLOTS_PER_FREED_SLOT === SLOTS_PER_FREED_SLOT - 1) entityStore.destroy(spawned[index]);
  }

  const liveIndices = [];
  for (let index = 0; index <= entityStore.maxActiveIndex; index += 1) {
    if (!entityStore.isIndexAlive(index)) continue;
    const ordinal = liveIndices.length;
    liveIndices.push(index);
    position.tileX[index] = ordinal % GRID_WIDTH;
    position.tileY[index] = Math.floor(ordinal / GRID_WIDTH);
  }

  if (liveIndices.length !== population) {
    throw new Error(`Actor population fixture wanted ${String(population)} live slots, built ${String(liveIndices.length)}.`);
  }

  const walkerKeys = [];
  const walkerRoutes = [];
  for (let ordinal = 0; ordinal < liveIndices.length; ordinal += WALKING_DENOMINATOR) {
    const key = liveIndices[ordinal];
    const legs = walkerKeys.length % ARRIVING_WALKER_DENOMINATOR === 0 ? SHORT_ROUTE_LEGS : LONG_ROUTE_LEGS;
    const startX = position.tileX[key];
    const startY = position.tileY[key];
    const waypoints = [];
    for (let leg = 0; leg <= legs; leg += 1) waypoints.push({ x: startX + leg, y: startY });
    walkerKeys.push(key);
    walkerRoutes.push(Object.freeze(waypoints));
  }

  const counters = { isIndexAlive: 0, getIdByIndex: 0, locomotionRead: 0 };

  /** Every method delegates; the `+= 1` is the whole of the difference. */
  const countingSource = Object.freeze({
    entityStore: {
      get maxActiveIndex() {
        return entityStore.maxActiveIndex;
      },
      isIndexAlive(index) {
        counters.isIndexAlive += 1;
        return entityStore.isIndexAlive(index);
      },
      getIdByIndex(index) {
        counters.getIdByIndex += 1;
        return entityStore.getIdByIndex(index);
      },
    },
    position,
    locomotion: {
      read(key, tileX, tileY, out) {
        counters.locomotionRead += 1;
        return locomotion.read(key, tileX, tileY, out);
      },
    },
  });

  const fixture = Object.freeze({
    /** The `RenderActorSource` handed to `encodeRenderActorsKeyframe`, counting on the way through. */
    source: countingSource,
    /** The real store, driven directly by the scenario the way `LocomotionSystem` drives it. */
    locomotion,
    position,
    templateTileX: new Int32Array(position.tileX),
    templateTileY: new Int32Array(position.tileY),
    walkerKeys: Object.freeze(walkerKeys),
    walkerRoutes: Object.freeze(walkerRoutes),
    allocatedSlots,
    liveActorCount: liveIndices.length,
    walkingCount: walkerKeys.length,
    counters,
    resetCounters() {
      counters.isIndexAlive = 0;
      counters.getIdByIndex = 0;
      counters.locomotionRead = 0;
    },
  });

  populationCache.set(population, fixture);
  return fixture;
}
