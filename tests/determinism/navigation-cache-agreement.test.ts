import { describe, expect, it } from 'vitest';
import { tileCoordinate, tileKey, type TilePosition } from '../../src/simulation/world/coordinates';
import { Kernel } from '../../src/simulation/kernel/kernel';
import type { DoorRegistry, DoorState } from '../../src/simulation/navigation/door';
import { computeRegionFlowField, FlowFieldCache } from '../../src/simulation/navigation/flow-field';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { PathRequestQueue } from '../../src/simulation/navigation/path-request-queue';
import { RouteCache } from '../../src/simulation/navigation/route-cache';
import type { RouteResult } from '../../src/simulation/navigation/route';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { findRoute } from '../../src/simulation/navigation/router';
import { buildCellBlockFixture, buildFixtureGraph, buildTwoRoomFixture } from '../helpers/navigation-fixture';

/**
 * A cache must not change any answer. Navigation's caches are deliberately not
 * carried in a save (`CURRENT_SAVE_RESTORED_SCOPE`'s
 * `save.scope.navigation-caches`), and `docs/DETERMINISM.md` allows that only
 * because a restored session's cold cache is supposed to agree with the warm one
 * it was saved from. It did not: both caches recorded only the doors a decision
 * *used*, never the ones that shaped it by being shut, so
 *
 * - a cached `permission-denied` outlived the lockdown that caused it, and a
 *   cached route outlived the opening of a cheaper crossing (#357);
 * - a cached `RegionFlowField` kept routing every actor in a group through the
 *   door it was forced to use when the field was computed (#358).
 *
 * Both are asserted here the way they are reached in production -- through the
 * real `NavigationSystem` on a real `Kernel` -- and behaviourally: the answer a
 * warmed cache serves must equal the answer a fresh computation gives in the
 * same door state. An eviction-counting test would pass for the wrong reason the
 * day a different mechanism started serving the wrong route.
 */

const LEFT_TILE: TilePosition = { x: tileCoordinate(1), y: tileCoordinate(1) };
const RIGHT_TILE: TilePosition = { x: tileCoordinate(6), y: tileCoordinate(1) };
/** Clearance 5 *and* `medical-wing`, so lock state is the only thing gating this actor. */
const WARDEN: RouteContext = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };
const LEFT_COLUMN: readonly TilePosition[] = [
  { x: tileCoordinate(0), y: tileCoordinate(1) },
  { x: tileCoordinate(1), y: tileCoordinate(1) },
  { x: tileCoordinate(2), y: tileCoordinate(1) },
  { x: tileCoordinate(3), y: tileCoordinate(1) },
  { x: tileCoordinate(0), y: tileCoordinate(2) },
  { x: tileCoordinate(1), y: tileCoordinate(2) },
  { x: tileCoordinate(2), y: tileCoordinate(2) },
];

function fingerprint(result: RouteResult): string {
  if (!result.ok) return `FAIL:${result.failure.reason}`;
  return `${result.route.totalCost}|${result.route.segments
    .map((segment) => `${segment.regionId}${segment.enteredViaDoorId === undefined ? '' : `(${segment.enteredViaDoorId})`}`)
    .join('>')}`;
}

interface Harness {
  readonly kernel: Kernel;
  readonly navigation: NavigationSystem;
  readonly doors: DoorRegistry;
  freshAnswer: (origin: TilePosition, destination: TilePosition) => RouteResult;
}

function buildHarness(initialStates: readonly (readonly [string, DoorState])[], flowFieldActivationThreshold = 6): Harness {
  const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
  for (const [doorId, state] of initialStates) doors.setState(doorId, state);

  const navigation = new NavigationSystem(
    world,
    { workBudgetPerTick: 100_000, agingIntervalTicks: 15, flowFieldActivationThreshold },
    doors,
  );
  navigation.setLoadedChunks([chunkA, chunkB]);
  const kernel = new Kernel();
  kernel.registerSystem(navigation);

  return {
    kernel,
    navigation,
    doors,
    // The oracle: a `findRoute` on a graph built from the same world and the
    // same registry, holding no cache of any kind.
    freshAnswer: (origin, destination) =>
      findRoute(world, doors, buildFixtureGraph(world, doors, [chunkA, chunkB]), origin, destination, WARDEN),
  };
}

function resolveOne(harness: Harness, id: string, origin: TilePosition, destination: TilePosition): RouteResult {
  harness.navigation.requestRoute(id, origin, destination, WARDEN, 0, harness.kernel.tick);
  harness.kernel.step();
  const outcome = harness.navigation.getResult(id);
  if (outcome === undefined) throw new Error(`Request ${id} did not resolve in one tick at this budget.`);
  return outcome.result;
}

describe('RouteCache: an answer computed under a lockdown does not outlive it (#357)', () => {
  it('serves the same result to a warmed cache and a cold one, once the blocking door is unlocked', () => {
    // Both doors locked, one request cached, then `door-medical` unlocked. The
    // cached entry named `door-clearance` -- the door that blocked it -- and
    // `door-clearance` never changed, so nothing evicted it.
    const warm = buildHarness([
      ['door-clearance', 'locked'],
      ['door-medical', 'locked'],
    ]);
    const duringLockdown = resolveOne(warm, 'warmup', LEFT_TILE, RIGHT_TILE);
    expect(duringLockdown.ok).toBe(false); // non-vacuity: the cache really holds a refusal
    warm.doors.setState('door-medical', 'open');
    const afterUnlock = resolveOne(warm, 'probe', LEFT_TILE, RIGHT_TILE);

    const cold = buildHarness([
      ['door-clearance', 'locked'],
      ['door-medical', 'locked'],
    ]);
    cold.doors.setState('door-medical', 'open');
    const fromCold = resolveOne(cold, 'probe', LEFT_TILE, RIGHT_TILE);

    expect(fromCold.ok).toBe(true); // a route exists in this door state
    expect(fingerprint(afterUnlock)).toBe(fingerprint(fromCold));
    expect(fingerprint(afterUnlock)).toBe(fingerprint(warm.freshAnswer(LEFT_TILE, RIGHT_TILE)));
    // The entry was evicted rather than never stored: `size` counts what is
    // still there, `evictions` what a door change removed.
    expect(warm.navigation.getRouteCacheMetrics().evictions).toBeGreaterThanOrEqual(1);
  });

  it('serves the cheaper crossing once it opens, instead of the costlier one that was cached', () => {
    const harness = buildHarness([
      ['door-clearance', 'locked'],
      ['door-medical', 'closed'], // x1.5 traversal cost, so this route is strictly worse
    ]);
    const cachedWhileLocked = resolveOne(harness, 'warmup', LEFT_TILE, RIGHT_TILE);
    expect(cachedWhileLocked.ok && cachedWhileLocked.route.totalCost).toBe(7.5);

    harness.doors.setState('door-clearance', 'open');
    const afterUnlock = resolveOne(harness, 'probe', LEFT_TILE, RIGHT_TILE);

    expect(fingerprint(afterUnlock)).toBe(fingerprint(harness.freshAnswer(LEFT_TILE, RIGHT_TILE)));
    expect(afterUnlock.ok && afterUnlock.route.totalCost).toBe(5);
    expect(afterUnlock.ok && afterUnlock.route.segments.at(-1)?.enteredViaDoorId).toBe('door-clearance');
  });

  it('keeps an entry a door change could not have affected, so the invalidation stays targeted', () => {
    // `door-clearance` moves from `locked` to `closed`. This actor's clearance
    // is 5 and the door needs 5, so the move changes its traversal verdict and
    // the entry must go. A *prisoner*'s entry must not: clearance 0 against a
    // required 5 is refused either way, so no answer of theirs can change.
    const harness = buildHarness([
      ['door-clearance', 'locked'],
      ['door-medical', 'open'],
    ]);
    resolveOne(harness, 'warden-route', LEFT_TILE, RIGHT_TILE);
    const beforeEvictions = harness.navigation.getRouteCacheMetrics().evictions;

    harness.doors.setState('door-medical', 'closed');
    resolveOne(harness, 'warden-route-2', LEFT_TILE, RIGHT_TILE);
    expect(harness.navigation.getRouteCacheMetrics().evictions).toBeGreaterThan(beforeEvictions);

    const prisoner = buildHarness([
      ['door-clearance', 'locked'],
      ['door-medical', 'open'],
    ]);
    const prisonerContext: RouteContext = { role: 'prisoner', securityClearance: 0 };
    prisoner.navigation.requestRoute('prisoner-route', LEFT_TILE, RIGHT_TILE, prisonerContext, 0, prisoner.kernel.tick);
    prisoner.kernel.step();
    prisoner.doors.setState('door-clearance', 'closed'); // still refused: clearance 0 < 5
    prisoner.navigation.requestRoute('prisoner-route-2', LEFT_TILE, RIGHT_TILE, prisonerContext, 0, prisoner.kernel.tick);
    prisoner.kernel.step();

    expect(prisoner.navigation.getRouteCacheMetrics().evictions).toBe(0);
    expect(prisoner.navigation.getRouteCacheMetrics().hits).toBe(1);
  });
});

describe('FlowFieldCache: a field computed under a lockdown does not outlive it (#358)', () => {
  it('routes a whole sharing group through the cheaper door once it opens', () => {
    const harness = buildHarness([
      ['door-clearance', 'locked'],
      ['door-medical', 'closed'],
    ]);

    // A group at the activation threshold, so the answers below come from the
    // shared field and not from a per-actor search.
    const firstBatch = LEFT_COLUMN.map((origin, index) => {
      harness.navigation.requestRoute(`rush-a-${index}`, origin, RIGHT_TILE, WARDEN, 0, harness.kernel.tick);
      return `rush-a-${index}`;
    });
    harness.kernel.step();
    expect(firstBatch.every((id) => harness.navigation.getResult(id)?.usedFlowField === true)).toBe(true);
    expect(harness.navigation.getQueueMetrics().flowFieldActivations).toBe(1);

    harness.doors.setState('door-clearance', 'open');

    const secondBatch = LEFT_COLUMN.map((origin, index) => {
      harness.navigation.requestRoute(`rush-b-${index}`, origin, RIGHT_TILE, WARDEN, 0, harness.kernel.tick);
      return `rush-b-${index}`;
    });
    harness.kernel.step();

    expect(secondBatch.every((id) => harness.navigation.getResult(id)?.usedFlowField === true)).toBe(true);
    LEFT_COLUMN.forEach((origin, index) => {
      const outcome = harness.navigation.getResult(`rush-b-${index}`);
      if (outcome === undefined) throw new Error('Second batch must resolve within its tick.');
      expect(fingerprint(outcome.result)).toBe(fingerprint(harness.freshAnswer(origin, RIGHT_TILE)));
      expect(outcome.result.ok && outcome.result.route.segments.at(-1)?.enteredViaDoorId).toBe('door-clearance');
    });
    expect(harness.navigation.getFlowFieldCacheMetrics().evictions).toBe(1);
  });

  it('evicts a cached field when a door it refused at compute time opens', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    doors.setState('door-clearance', 'locked');
    doors.setState('door-medical', 'closed');
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const destinationRegion = graph.tileToRegion.get(tileKey(RIGHT_TILE));
    if (destinationRegion === undefined) throw new Error('Fixture destination must have a region.');

    const cache = new FlowFieldCache();
    const field = computeRegionFlowField(graph, doors, destinationRegion, WARDEN);
    cache.set(field);

    // The door that decided the field's shape by being shut is recorded, which
    // is what "every door any step depends on" has to mean.
    expect([...field.doorDependencies.perDoor.keys()]).toEqual(['door-clearance', 'door-medical']);

    doors.setState('door-clearance', 'open');
    expect(cache.get(destinationRegion, WARDEN, graph, doors)).toBeUndefined();
    expect(cache.getMetrics().evictions).toBe(1);
  });
});

/**
 * The same property as a sweep rather than as three cases: after **any** single
 * door state change, a warmed cache answers every leg exactly as a fresh search
 * does. This is what says the dependency set is *sufficient*, which three
 * hand-picked doors cannot.
 *
 * It also holds the other half of the bargain. A route's dependency set is the
 * doors within reach of its own origin, and on the shape a prison actually has
 * -- one corridor touching every cell door -- that is nearly every door in the
 * block, so a single cell door opening would evict every cached route in it. The
 * doors a route provably *cannot* cross are excluded for that reason
 * (`portalCannotBeCrossedBetween`), and the two assertions below are the pair
 * that keeps the exclusion honest: it must not cost an eviction that matters,
 * and it must not skip one that does.
 */
describe('RouteCache: sufficient after any single door change, and no wider than that', () => {
  const WARDEN: RouteContext = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };

  it('answers every leg as a fresh search would, after each of the 39 single-door state changes', () => {
    const doorStates: readonly DoorState[] = ['open', 'closed', 'locked'];
    let comparisons = 0;
    let changes = 0;

    for (const doorId of buildCellBlockFixture(12).doors.all().map((door) => door.id)) {
      for (const state of doorStates) {
        const fixture = buildCellBlockFixture(12);
        const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
        const destination = fixture.canteenTiles[0];
        if (destination === undefined) throw new Error('Fixture must have a canteen.');
        const routeCache = new RouteCache();
        const flowFieldCache = new FlowFieldCache();
        // Threshold 4 so the warming tick resolves through a shared field, and
        // the entries under test are the ones a field wrote.
        const queue = new PathRequestQueue({ agingIntervalTicks: 15, flowFieldActivationThreshold: 4 });

        // Keyed by request id, never by position in the resolved array: the
        // queue resolves in its own deterministic order (effective priority,
        // then enqueue tick, then request id as a *string*), so `t1-10` comes
        // back before `t1-2`.
        const warm = (tick: number): ReadonlyMap<string, string> => {
          fixture.cellTiles.forEach((origin, index) => {
            queue.enqueue({ id: `t${tick}-${index}`, origin, destination, context: WARDEN, priority: 0 }, tick);
          });
          return new Map(
            queue
              .processTick({ tick, workBudget: 100_000, world: fixture.world, doors: fixture.doors, graph, routeCache, flowFieldCache })
              .map((outcome) => [outcome.id, fingerprint(outcome.result)]),
          );
        };

        warm(0);
        fixture.doors.setState(doorId, state);
        changes += 1;
        const afterChange = warm(1);

        fixture.cellTiles.forEach((origin, index) => {
          const served = afterChange.get(`t1-${index}`);
          if (served === undefined) throw new Error('Every leg must resolve within its tick.');
          expect(served, `${doorId} -> ${state}, leg ${index}`).toBe(
            fingerprint(findRoute(fixture.world, fixture.doors, graph, origin, destination, WARDEN)),
          );
          comparisons += 1;
        });
      }
    }

    expect(changes).toBe(39); // 13 doors x 3 states
    expect(comparisons).toBe(468);
  });

  it('does not evict a route over a door no route between those two tiles could cross', () => {
    const fixture = buildCellBlockFixture(12);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const destination = fixture.canteenTiles[0];
    const origin = fixture.cellTiles[0];
    const otherCellDoor = 'cell-door-11';
    if (destination === undefined || origin === undefined) throw new Error('Fixture must have a canteen and cells.');

    const routeCache = new RouteCache();
    const queue = new PathRequestQueue({ agingIntervalTicks: 15, flowFieldActivationThreshold: 99 });
    const resolve = (tick: number): void => {
      queue.enqueue({ id: `leg-${tick}`, origin, destination, context: WARDEN, priority: 0 }, tick);
      queue.processTick({
        tick,
        workBudget: 100_000,
        world: fixture.world,
        doors: fixture.doors,
        graph,
        routeCache,
        flowFieldCache: new FlowFieldCache(),
      });
    };

    resolve(0);
    // A cell is a leaf region: its one door leads nowhere else, so a route from
    // cell 0 to the canteen could only cross this one by entering cell 11 and
    // coming straight back out, which is strictly more expensive than not.
    fixture.doors.setState(otherCellDoor, 'locked');
    resolve(1);
    expect(routeCache.getMetrics().evictions).toBe(0);
    expect(routeCache.getMetrics().hits).toBe(1);

    // The origin's own cell door is a door the route does cross, and the same
    // rule must not exclude it.
    fixture.doors.setState('cell-door-0', 'locked');
    resolve(2);
    expect(routeCache.getMetrics().evictions).toBe(1);
  });
});
