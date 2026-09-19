import { describe, expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { FlowFieldCache } from '../../src/simulation/navigation/flow-field';
import { PathRequestQueue } from '../../src/simulation/navigation/path-request-queue';
import { findRoute } from '../../src/simulation/navigation/router';
import { RouteCache } from '../../src/simulation/navigation/route-cache';
import type { SearchStats } from '../../src/simulation/navigation/local-search';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { buildCellBlockFixture, buildFixtureGraph, buildSingleDoorFixture, buildTwoRoomFixture } from '../helpers/navigation-fixture';
import { expectOk } from '../helpers/expect-ok';

const LEFT_TILE = { x: tileCoordinate(1), y: tileCoordinate(1) };
const RIGHT_TILE = { x: tileCoordinate(6), y: tileCoordinate(1) };
const GUARD: RouteContext = { role: 'guard', securityClearance: 5 };
const PRISONER: RouteContext = { role: 'prisoner', securityClearance: 0 };

describe('findRoute: optional SearchStats work-unit counting', () => {
  it('counts a positive, deterministic number of expansions for a successful route', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const first: SearchStats = { expansions: 0 };
    const second: SearchStats = { expansions: 0 };
    findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, first);
    findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, second);

    expect(first.expansions).toBeGreaterThan(0);
    expect(first.expansions).toBe(second.expansions);
  });

  /*
   * ### What this test's title means, given that no object is supplied
   *
   * Until 2026-09-08 the title read *"does not mutate the caller-supplied
   * stats object when no stats are passed (opt-in, zero overhead)"* and the
   * body passed no stats and asserted only that the route succeeded. Nothing
   * in it could fail if the property in the title were violated: the whole
   * `vitest` suite -- 417 files, 4895 passed -- stayed green with `findRoute`
   * memoising the last caller-supplied `SearchStats` and counting into it on
   * every later call that passed none.
   *
   * The title survives, sharpened, because its property is real. It only
   * looks vacuous: on a call that passes no stats there is no object *this
   * call* was handed, so "the caller-supplied stats object" can only be one
   * handed to some **other** call, and the claim is that this call leaves it
   * alone. That is cross-call isolation, and it is what makes a
   * `SearchStats` safe to hold across ticks -- `PathRequestQueue.processTick`
   * allocates one per request and charges it against `workBudget`, so a
   * counter silently accumulating work that some *other*, uncounted caller
   * did would spend a budget on searches it never performed.
   *
   * The reading under which the title is vacuous -- "the function tolerates
   * the absent argument" -- is the one the old body checked, and it is
   * already covered several times over: the `RouteCache` and `FlowFieldCache`
   * describes below call `findRoute` with `undefined` in this position
   * throughout.
   *
   * ### And what it cannot mean
   *
   * `local-search.ts`'s docblock claims two things for the absent argument:
   * *"Passing no `SearchStats` costs nothing and changes no return value."*
   * The second half is asserted here, against the same route computed with a
   * counter attached. The first half -- "costs nothing", the *zero overhead*
   * the old title also claimed -- is **not** asserted and is not assertable
   * from here: an absent write to an object that was never supplied leaves
   * nothing to observe, and the only alternative is a wall-clock comparison,
   * which on this container would be a flake rather than a guard. It is
   * dropped from the title rather than left standing over a body that cannot
   * reach it.
   *
   * The route equality below compares two calls into the code under test, not
   * a fixture against a value that code computed. It is a claim about the
   * difference the parameter makes and deliberately says nothing about
   * whether the route itself is right; `navigation-flat-search-reference.test.ts`
   * owns that.
   */
  it('does not touch a caller-supplied stats object on a later call that passes none, and answers the same either way (opt-in)', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const counted: SearchStats = { expansions: 0 };
    const countedResult = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, counted);
    expectOk(countedResult, 'the guard route whose expansions are counted');
    const chargedByItsOwnCall = counted.expansions;
    expect(chargedByItsOwnCall).toBeGreaterThan(0);

    // Repeated, because a counter that leaks would leak once per uncounted
    // call: one route would prove only that the first leak is not fatal.
    for (let repeat = 0; repeat < 5; repeat += 1) {
      const uncounted = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
      expectOk(uncounted, 'the guard route asked for with no stats object');
      expect(uncounted).toEqual(countedResult);
      expect(counted.expansions).toBe(chargedByItsOwnCall);
    }
  });

  it('charges expansions for both the permission-aware and physical-fallback region passes on a permission-denied result', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const deniedStats: SearchStats = { expansions: 0 };
    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, PRISONER, deniedStats);

    expect(result.ok).toBe(false);
    // Two Dijkstra passes over a graph with real portals must expand at least one region each.
    expect(deniedStats.expansions).toBeGreaterThanOrEqual(2);
  });

  it('adds the local-search expansions on top of the region-graph expansions', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const stats: SearchStats = { expansions: 0 };
    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, stats);
    expectOk(result, 'the guard route whose expansions are counted');

    // Origin and destination are 5 tiles apart plus a door crossing -- local search alone
    // must expand more than the handful of regions in the tiny two-room fixture.
    expect(stats.expansions).toBeGreaterThan(5);
  });
});

describe('RouteCache: hit/miss/eviction/invalidation metrics', () => {
  it('counts a miss then a hit for the same request', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();

    expect(cache.get(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors)).toBeUndefined();
    const dependencies = new Set<string>();
    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, undefined, dependencies);
    cache.set(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors, result, dependencies);
    expect(cache.get(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors)).toEqual(result);

    const metrics = cache.getMetrics();
    expect(metrics.misses).toBe(1);
    expect(metrics.hits).toBe(1);
    expect(metrics.size).toBe(1);
  });

  it('counts a targeted eviction when the specific crossed door changes state, not a geometry invalidation', () => {
    const { world, doors, chunkA, chunkB } = buildSingleDoorFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();

    const dependencies = new Set<string>();
    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD, undefined, dependencies);
    cache.set(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors, result, dependencies);

    doors.setState('door-clearance', 'locked');
    expect(cache.get(LEFT_TILE, RIGHT_TILE, GUARD, graph, doors)).toBeUndefined();

    const metrics = cache.getMetrics();
    expect(metrics.evictions).toBe(1);
    expect(metrics.geometryInvalidations).toBe(0);
    expect(metrics.size).toBe(0);
  });

  it('counts a geometry invalidation, not a targeted eviction, when the graph itself is rebuilt', () => {
    const { world, doors, chunkA, chunkB } = buildSingleDoorFixture();
    const graphBefore = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const cache = new RouteCache();

    const dependencies = new Set<string>();
    const result = findRoute(world, doors, graphBefore, LEFT_TILE, RIGHT_TILE, GUARD, undefined, dependencies);
    cache.set(LEFT_TILE, RIGHT_TILE, GUARD, graphBefore, doors, result, dependencies);

    world.markGeometryChanged(chunkA);
    const graphAfter = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    expect(cache.get(LEFT_TILE, RIGHT_TILE, GUARD, graphAfter, doors)).toBeUndefined();

    const metrics = cache.getMetrics();
    expect(metrics.geometryInvalidations).toBe(1);
    expect(metrics.evictions).toBe(0);
  });
});

/**
 * Flow-field sharing used to be checked *before* the route cache and to write
 * nothing back into it, so the busiest destination in the prison -- the one that
 * trips `flowFieldActivationThreshold`, i.e. exactly the one whose legs repeat
 * most -- was the one destination for which no cross-tick reuse ever happened.
 * The per-tick cost never decayed: each tick re-paid a full per-actor local A*
 * for legs the cache already held (#359).
 *
 * The cross-tick shape is the load-bearing one. A single-tick assertion is
 * satisfied by `fieldsThisTick`, which already deduped the *field* computation
 * within one tick and hid the problem.
 */
describe('PathRequestQueue: flow-field sharing composes with the route cache rather than bypassing it', () => {
  const WARDEN: RouteContext = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };

  interface ShareRun {
    readonly perTickExpansions: readonly number[];
    readonly total: number;
    readonly routeCacheHits: number;
    readonly routeCacheSize: number;
    readonly flowFieldActivations: number;
    readonly ticksToDrain: number;
    readonly fingerprints: readonly string[];
  }

  function runRepeatedLegs(options: {
    readonly flowFieldActivationThreshold: number;
    readonly legCount: number;
    readonly ticks: number;
    readonly distinctOrigins: boolean;
    readonly workBudget: number;
  }): ShareRun {
    const fixture = buildCellBlockFixture(24);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const routeCache = new RouteCache();
    const flowFieldCache = new FlowFieldCache();
    const queue = new PathRequestQueue({ agingIntervalTicks: 15, flowFieldActivationThreshold: options.flowFieldActivationThreshold });
    const destination = fixture.canteenTiles[0];
    if (destination === undefined) throw new Error('Fixture must have a canteen.');

    const perTickExpansions: number[] = [];
    const fingerprints: string[] = [];
    let previousTotal = 0;
    let ticksToDrain = 0;

    for (let tick = 0; tick < options.ticks; tick += 1) {
      for (let index = 0; index < options.legCount; index += 1) {
        const origin = options.distinctOrigins ? fixture.cellTiles[index % fixture.cellTiles.length] : fixture.cellTiles[0];
        if (origin === undefined) throw new Error('Fixture must have cells.');
        queue.enqueue({ id: `t${tick}-${index}`, origin, destination, context: WARDEN, priority: 0 }, tick);
      }
      do {
        for (const outcome of queue.processTick({
          tick,
          workBudget: options.workBudget,
          world: fixture.world,
          doors: fixture.doors,
          graph,
          routeCache,
          flowFieldCache,
        })) {
          fingerprints.push(`${outcome.id}=${outcome.result.ok ? outcome.result.route.totalCost : outcome.result.failure.reason}`);
        }
        ticksToDrain += 1;
      } while (queue.size() > 0);
      const total = queue.getMetrics().totalExpansions;
      perTickExpansions.push(total - previousTotal);
      previousTotal = total;
    }

    const metrics = routeCache.getMetrics();
    return {
      perTickExpansions,
      total: previousTotal,
      routeCacheHits: metrics.hits,
      routeCacheSize: metrics.size,
      flowFieldActivations: queue.getMetrics().flowFieldActivations,
      ticksToDrain,
      fingerprints,
    };
  }

  it('spends strictly less work on the second tick of the same legs, with sharing active', () => {
    const run = runRepeatedLegs({ flowFieldActivationThreshold: 6, legCount: 8, ticks: 2, distinctOrigins: true, workBudget: 10_000 });

    expect(run.flowFieldActivations).toBeGreaterThan(0); // non-vacuity: sharing really is active
    const [first, second] = run.perTickExpansions;
    if (first === undefined || second === undefined) throw new Error('Two ticks must be recorded.');
    expect(second).toBeLessThan(first);
    expect(second).toBe(0); // every leg is served from the cache
    expect(run.routeCacheHits).toBe(8);
    expect(run.routeCacheSize).toBe(8);
  });

  it('lets the per-tick cost decay to nothing over ten ticks, and costs no more in total than sharing turned off', () => {
    const sharing = runRepeatedLegs({ flowFieldActivationThreshold: 6, legCount: 8, ticks: 10, distinctOrigins: true, workBudget: 10_000 });
    const noSharing = runRepeatedLegs({ flowFieldActivationThreshold: 99, legCount: 8, ticks: 10, distinctOrigins: true, workBudget: 10_000 });

    expect(sharing.perTickExpansions.slice(1)).toEqual(Array.from({ length: 9 }, () => 0));
    expect(sharing.total).toBeLessThanOrEqual(noSharing.total);
    // The field is computed for the first tick's miss and never again, because
    // later ticks are answered before a field is needed at all.
    expect(sharing.flowFieldActivations).toBe(1);
    // Same answers either way; sharing is a cost decision, never a routing one.
    expect(sharing.fingerprints).toEqual(noSharing.fingerprints);
  });

  it('still pays off on the case sharing exists for: many distinct origins converging on one destination', () => {
    const sharing = runRepeatedLegs({ flowFieldActivationThreshold: 6, legCount: 24, ticks: 1, distinctOrigins: true, workBudget: 400 });
    const noSharing = runRepeatedLegs({ flowFieldActivationThreshold: 99, legCount: 24, ticks: 1, distinctOrigins: true, workBudget: 400 });

    expect(sharing.total).toBeLessThan(noSharing.total);
    expect(sharing.ticksToDrain).toBeLessThanOrEqual(noSharing.ticksToDrain);
    expect(sharing.fingerprints).toEqual(noSharing.fingerprints);
  });

  it('does not compute a field for a batch the cache can already answer', () => {
    const run = runRepeatedLegs({ flowFieldActivationThreshold: 6, legCount: 24, ticks: 3, distinctOrigins: false, workBudget: 10_000 });

    expect(run.flowFieldActivations).toBe(1);
    expect(run.perTickExpansions.slice(1)).toEqual([0, 0]);
    expect(run.routeCacheSize).toBe(1); // 72 requests, one distinct leg
  });
});

/**
 * The work budget is a ceiling on **expansions**, not on requests (#416).
 *
 * `AGENTS.md` boundary 9 -- "pathfinding must be budgeted and hierarchical,
 * never unrestricted full-map A* per agent per frame" -- is enforced in
 * exactly one place: `PathRequestQueue.processTick` adds each resolved
 * request's `stats.expansions` to `usedBudget` and stops once that reaches
 * `params.workBudget`. Every test above passes a budget in and none of them
 * asks what was spent, so the unit the budget is *denominated in* was
 * unasserted: replacing `usedBudget += stats.expansions;` with
 * `usedBudget += 1;` -- which turns the tick budget into a request count and
 * lets one tick expand many times its budget -- left 238 files and 2,696
 * tests green when measured at `54418b6` (v0.0.121).
 *
 * The neighbouring cases cannot see it. "Defers requests once the tick budget
 * is spent" runs at `workBudget: 1`, where a per-request counter and a
 * per-expansion counter both stop after one request; the difference only
 * appears at a budget large enough to admit several requests, and only if
 * something adds the expansions up.
 *
 * Nothing here is compared against a number the budget arithmetic produced:
 * the budget is a literal chosen so it admits some of the batch and not all of
 * it, and the per-request costs come back on the resolved payload from
 * `findRoute`'s own `SearchStats`, which `usedBudget` never writes to.
 */
describe('PathRequestQueue: the tick budget bounds expanded nodes, not requests', () => {
  const WORK_BUDGET = 200;
  const REQUEST_COUNT = 16;

  function drainOneTick(workBudget: number): { queue: PathRequestQueue; resolved: readonly { expansions: number }[] } {
    const fixture = buildCellBlockFixture(20);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    // Sharing off (threshold far above the batch) and a cold cache, so every
    // request pays a real search and the budget is the only thing that can
    // stop the loop.
    const queue = new PathRequestQueue({ agingIntervalTicks: 1_000, flowFieldActivationThreshold: 1_000 });
    const destination = fixture.canteenTiles[0];
    if (destination === undefined) throw new Error('Fixture must have a canteen.');

    for (let index = 0; index < REQUEST_COUNT; index += 1) {
      const origin = fixture.cellTiles[index % fixture.cellTiles.length];
      if (origin === undefined) throw new Error('Fixture must have cells.');
      queue.enqueue(
        { id: `req-${String(index).padStart(2, '0')}`, origin, destination, context: GUARD, priority: 0 },
        0,
      );
    }

    const resolved = queue.processTick({
      tick: 0,
      workBudget,
      world: fixture.world,
      doors: fixture.doors,
      graph,
      routeCache: new RouteCache(),
      flowFieldCache: new FlowFieldCache(),
    });
    return { queue, resolved };
  }

  it('stops the tick within one request of the budget, counting expanded nodes', () => {
    const { queue, resolved } = drainOneTick(WORK_BUDGET);

    // Non-vacuity, in both directions: the budget really bit (some of the
    // batch is still waiting) and it really was reached (the tick did not
    // simply run out of work).
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved.length).toBeLessThan(REQUEST_COUNT);
    expect(queue.size()).toBe(REQUEST_COUNT - resolved.length);

    const perRequest = resolved.map((outcome) => outcome.expansions);
    const spent = perRequest.reduce((sum, expansions) => sum + expansions, 0);
    expect(spent).toBeGreaterThanOrEqual(WORK_BUDGET);

    // The ceiling itself. The loop admits a request while `usedBudget` is
    // still under budget, so everything *before* the last one it took must
    // have cost less than the budget in total -- that sum is `usedBudget` as
    // it stood when the last request was let in.
    const beforeTheLast = perRequest.slice(0, -1).reduce((sum, expansions) => sum + expansions, 0);
    expect(beforeTheLast, 'a tick expanded more nodes than its budget allowed').toBeLessThan(WORK_BUDGET);

    // And the unit: every leg in this fixture costs many expansions, so a
    // budget spent one-per-request would be counting the wrong thing.
    expect(Math.min(...perRequest)).toBeGreaterThan(1);
  });

  /**
   * Where the ceiling actually sits. #416 hardened what the budget is
   * *denominated in*; the comparison that stops the loop is still an
   * inclusive one, and nothing has ever been handed the one budget that
   * separates `>=` from `>`. The case above asserts
   * `beforeTheLast < WORK_BUDGET`, which a `>` only violates when the running
   * total lands on 200 exactly -- it does not -- so measured at 83d9616,
   * weakening `usedBudget >= params.workBudget` to `>` left this file,
   * `navigation-path-request-queue.test.ts` and `navigation-system.test.ts`
   * green, 34/34. What that mutation ships is one further request's whole
   * expansion, every tick, above the declared ceiling.
   *
   * The budget here is **measured rather than written out** because a literal
   * cannot land on the boundary: what a leg costs is the router's business and
   * changes with it. That measurement is an *input*, not an expected value --
   * every assertion below is a literal count of requests -- so this is not a
   * fixture supplying both sides of its own comparison. The reference run is
   * the same fixture with the same enqueue order and its own cold caches, and
   * `processTick` sorts once before spending anything, so the request it
   * serves first and what that costs are identical in all three runs; the
   * assertion that the boundary run's one outcome cost exactly `firstCost`
   * fails loudly if that ever stops being true.
   */
  it('stops the tick at the budget rather than one request past it', () => {
    const reference = drainOneTick(100_000);
    expect(reference.resolved).toHaveLength(REQUEST_COUNT); // the reference really did see the whole batch
    const firstCost = reference.resolved[0]?.expansions;
    const secondCost = reference.resolved[1]?.expansions;
    if (firstCost === undefined || secondCost === undefined) throw new Error('The reference run must resolve at least two requests.');
    // Non-degeneracy: a leg that cost one expansion, or a second leg that cost
    // none, would make `>=` and `>` agree here and the boundary untestable.
    expect(firstCost).toBeGreaterThan(1);
    expect(secondCost).toBeGreaterThan(0);

    // Budget == what the first request spends. `usedBudget` reaches the budget
    // exactly, and the tick must stop there.
    const atBudget = drainOneTick(firstCost);
    expect(atBudget.resolved, 'a tick whose budget is exactly spent must stop').toHaveLength(1);
    expect(atBudget.resolved[0]?.expansions).toBe(firstCost);
    expect(atBudget.queue.size()).toBe(REQUEST_COUNT - 1);

    // One unit of budget above it, and the second request is admitted -- so
    // the cut above is the budget biting at its boundary and not the batch
    // running out or some other stop condition.
    const justOver = drainOneTick(firstCost + 1);
    expect(justOver.resolved).toHaveLength(2);
  });

  it('admits more requests when the budget is raised and fewer when it is lowered', () => {
    // The budget is the *cause* of the cut rather than a coincidence of the
    // batch: the same sixteen requests, three budgets, monotonically more work
    // done.
    const small = drainOneTick(50);
    const medium = drainOneTick(WORK_BUDGET);
    const large = drainOneTick(100_000);

    expect(small.resolved.length).toBeLessThan(medium.resolved.length);
    expect(medium.resolved.length).toBeLessThan(large.resolved.length);
    expect(large.resolved).toHaveLength(REQUEST_COUNT); // a budget nothing can exhaust drains the batch
    expect(large.queue.size()).toBe(0);
  });
});
