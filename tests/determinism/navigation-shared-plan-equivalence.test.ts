import { describe, expect, it } from 'vitest';
import { tileCoordinate, tileKey, type TilePosition } from '../../src/simulation/world/coordinates';
import { computeRegionFlowField, FlowFieldCache, findRouteUsingFlowField } from '../../src/simulation/navigation/flow-field';
import { PathRequestQueue, type ResolvedPathRequest } from '../../src/simulation/navigation/path-request-queue';
import { RouteCache } from '../../src/simulation/navigation/route-cache';
import type { DoorState } from '../../src/simulation/navigation/door';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import type { RouteResult } from '../../src/simulation/navigation/route';
import { findRoute } from '../../src/simulation/navigation/router';
import { flatSearchCost } from '../helpers/navigation-flat-search';
import { buildFixtureGraph, buildRingFixture } from '../helpers/navigation-fixture';
import { expectOk } from '../helpers/expect-ok';

/**
 * ADR 0007 justifies flow-field sharing by asserting the shared plan is the
 * plan each actor would have got on its own -- "the same shortest-path tree
 * every individual `findRoute` call to that destination would eventually
 * discover". It was not, wherever two region-level routes tied on cost, and
 * `docs/DETERMINISM.md`'s standing rule is what that broke: which of the two an
 * actor received was decided by `flowFieldActivationThreshold` against the
 * number of *other* pending requests sharing its destination that tick, so the
 * answer depended on the company an actor kept rather than on the state of the
 * prison (#360).
 *
 * Two properties are pinned here, and the first is what makes the second
 * possible:
 *
 * 1. **Equivalence.** For every origin/destination pair, a route resolved
 *    through a shared field crosses the same doors at the same cost as
 *    `findRoute`. Asserted over the door *sequence*, not just the cost: the
 *    pre-existing `tests/unit/navigation-flow-field.test.ts` compares
 *    `totalCost` over `buildCellBlockFixture`, which is a tree and holds no
 *    tied routes, so it could see neither half of this.
 * 2. **Independence.** The same request answers the same whoever else is
 *    asking, and whatever was asked before it -- through the real
 *    `PathRequestQueue`, with sharing and both caches live.
 *
 * `buildRingFixture` is the smallest shape that can fail: four rooms, two ways
 * round, equal cost either way. Before the fix, 64 of its 256 pairs took a
 * different door and 20 cost strictly more -- up to double.
 */

const PLAIN: RouteContext = { role: 'guard', securityClearance: 0 };
const RING_BOUNDS = { minX: 0, maxX: 3, minY: 0, maxY: 3 };
const DOOR_STATES: readonly DoorState[] = ['open', 'closed', 'locked'];

function fingerprint(result: RouteResult): string {
  if (!result.ok) return `FAIL:${result.failure.reason}:${result.failure.blockedBy?.doorId ?? '-'}`;
  return `${result.route.totalCost}|${result.route.segments
    .map((segment) => `${segment.regionId}${segment.enteredViaDoorId === undefined ? '' : `(${segment.enteredViaDoorId})`}`)
    .join('>')}|${result.route.segments.flatMap((segment) => segment.waypoints).map((waypoint) => tileKey(waypoint)).join(',')}`;
}

interface SweepTotals {
  readonly compared: number;
  readonly differentFingerprint: number;
  readonly fieldStrictlyWorse: number;
  readonly coverageDisagreements: number;
  readonly examples: readonly string[];
}

/** Compares every origin/destination pair on the ring under the given door states. */
function sweepRing(states: Readonly<Record<string, DoorState>>): SweepTotals {
  const fixture = buildRingFixture();
  for (const [doorId, state] of Object.entries(states)) fixture.doors.setState(doorId, state);
  const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);

  let compared = 0;
  let differentFingerprint = 0;
  let fieldStrictlyWorse = 0;
  let coverageDisagreements = 0;
  const examples: string[] = [];

  for (const destination of fixture.tiles) {
    const destinationRegion = graph.tileToRegion.get(tileKey(destination));
    if (destinationRegion === undefined) throw new Error('Ring tiles must all have a region.');
    const field = computeRegionFlowField(graph, fixture.doors, destinationRegion, PLAIN);

    for (const origin of fixture.tiles) {
      const viaField = findRouteUsingFlowField(field, fixture.world, fixture.doors, graph, origin, destination, undefined);
      const viaFullSearch = findRoute(fixture.world, fixture.doors, graph, origin, destination, PLAIN);

      if (viaField === undefined) {
        // A field that cannot answer hands the request to `findRoute`, which
        // owns the diagnosis -- but it must not decline a request `findRoute`
        // can answer, since reachability under one context is symmetric.
        if (viaFullSearch.ok) coverageDisagreements += 1;
        continue;
      }

      compared += 1;
      if (fingerprint(viaField) !== fingerprint(viaFullSearch)) {
        differentFingerprint += 1;
        if (viaField.ok && viaFullSearch.ok && viaField.route.totalCost > viaFullSearch.route.totalCost) fieldStrictlyWorse += 1;
        if (examples.length < 3) {
          examples.push(
            `${origin.x},${origin.y}->${destination.x},${destination.y} field=${fingerprint(viaField)} route=${fingerprint(viaFullSearch)}`,
          );
        }
      }
    }
  }

  return { compared, differentFingerprint, fieldStrictlyWorse, coverageDisagreements, examples };
}

describe('a shared RegionFlowField is the plan findRoute computes, not merely one of equal cost', () => {
  it('gives the identical route for all 256 origin/destination pairs on a ring with two tied ways round', () => {
    const totals = sweepRing({});

    expect(totals.compared).toBe(256); // every pair is comparable with all four doors open
    expect(totals.examples).toEqual([]);
    expect(totals.differentFingerprint).toBe(0);
    expect(totals.fieldStrictlyWorse).toBe(0);
    expect(totals.coverageDisagreements).toBe(0);
  });

  it('the ring genuinely offers two distinct region routes at identical cost, so the case above is not vacuous', () => {
    const viaB = buildRingFixture();
    viaB.doors.setState('d3-a-c', 'locked'); // only A->B->D remains
    const graphViaB = buildFixtureGraph(viaB.world, viaB.doors, viaB.chunkPositions);

    const viaC = buildRingFixture();
    viaC.doors.setState('d1-a-b', 'locked'); // only A->C->D remains
    const graphViaC = buildFixtureGraph(viaC.world, viaC.doors, viaC.chunkPositions);

    const origin: TilePosition = { x: tileCoordinate(0), y: tileCoordinate(0) };
    const destination: TilePosition = { x: tileCoordinate(3), y: tileCoordinate(3) };

    const throughB = findRoute(viaB.world, viaB.doors, graphViaB, origin, destination, PLAIN);
    const throughC = findRoute(viaC.world, viaC.doors, graphViaC, origin, destination, PLAIN);
    expectOk(throughB, 'the route the ring leaves open through B');
    expectOk(throughC, 'the route the ring leaves open through C');

    // Independently: a flat full-map Dijkstra that knows nothing of regions or
    // portals agrees on both costs, so neither number comes from the code under
    // test alone.
    expect(throughB.route.totalCost).toBe(flatSearchCost(viaB.world, viaB.doors, origin, destination, PLAIN, RING_BOUNDS));
    expect(throughC.route.totalCost).toBe(flatSearchCost(viaC.world, viaC.doors, origin, destination, PLAIN, RING_BOUNDS));
    expect(throughB.route.totalCost).toBe(throughC.route.totalCost);
    expect(throughB.route.segments.map((segment) => segment.enteredViaDoorId)).not.toEqual(
      throughC.route.segments.map((segment) => segment.enteredViaDoorId),
    );
  });

  it('gives the identical route across every one of the 81 combinations of the four doors’ states', () => {
    let combinations = 0;
    let compared = 0;
    let differentFingerprint = 0;
    let coverageDisagreements = 0;

    for (const d1 of DOOR_STATES) {
      for (const d2 of DOOR_STATES) {
        for (const d3 of DOOR_STATES) {
          for (const d4 of DOOR_STATES) {
            const totals = sweepRing({ 'd1-a-b': d1, 'd2-b-d': d2, 'd3-a-c': d3, 'd4-c-d': d4 });
            combinations += 1;
            compared += totals.compared;
            differentFingerprint += totals.differentFingerprint;
            coverageDisagreements += totals.coverageDisagreements;
          }
        }
      }
    }

    expect(combinations).toBe(81);
    expect(compared).toBeGreaterThan(10_000); // the sweep is a real case set, not a happy path
    expect(differentFingerprint).toBe(0);
    expect(coverageDisagreements).toBe(0);
  });

  it('records the same door dependency set whichever of the two computed the answer', () => {
    const fixture = buildRingFixture();
    fixture.doors.setState('d2-b-d', 'locked');
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);

    let comparedSets = 0;
    for (const destination of fixture.tiles) {
      const destinationRegion = graph.tileToRegion.get(tileKey(destination));
      if (destinationRegion === undefined) throw new Error('Ring tiles must all have a region.');
      const field = computeRegionFlowField(graph, fixture.doors, destinationRegion, PLAIN);

      for (const origin of fixture.tiles) {
        const fieldDependencies = new Set<string>();
        const viaField = findRouteUsingFlowField(
          field,
          fixture.world,
          fixture.doors,
          graph,
          origin,
          destination,
          undefined,
          fieldDependencies,
        );
        if (viaField === undefined) continue;

        const searchDependencies = new Set<string>();
        findRoute(fixture.world, fixture.doors, graph, origin, destination, PLAIN, undefined, searchDependencies);

        // Not a detail: a cached entry has to mean the same thing whichever
        // mechanism produced it, which is what lets #359's fix write a
        // field-resolved route into `RouteCache` with no new invalidation rule.
        expect([...fieldDependencies].sort()).toEqual([...searchDependencies].sort());
        comparedSets += 1;
      }
    }

    expect(comparedSets).toBeGreaterThan(200);
  });
});

interface Leg {
  readonly id: string;
  readonly origin: TilePosition;
  readonly destination: TilePosition;
}

function ringLegs(tiles: readonly TilePosition[], count: number, offset: number): readonly Leg[] {
  const legs: Leg[] = [];
  for (let index = 0; index < count; index += 1) {
    const origin = tiles[index % tiles.length];
    const destination = tiles[(index * 7 + offset) % tiles.length];
    if (origin === undefined || destination === undefined) throw new Error('Ring must have tiles.');
    legs.push({ id: `leg-${offset}-${index}`, origin, destination });
  }
  return legs;
}

describe('the answer does not depend on who else is asking, or on what was asked before', () => {
  it('one actor gets the same route alone and in a crowd big enough to trip flow-field sharing', () => {
    const origin: TilePosition = { x: tileCoordinate(0), y: tileCoordinate(0) };
    const destination: TilePosition = { x: tileCoordinate(3), y: tileCoordinate(3) };
    const answers = new Map<number, ResolvedPathRequest>();

    for (const companions of [0, 6]) {
      const fixture = buildRingFixture();
      const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
      const queue = new PathRequestQueue({ agingIntervalTicks: 15, flowFieldActivationThreshold: 6 });
      queue.enqueue({ id: 'actor-0', origin, destination, context: PLAIN, priority: 0 }, 0);
      for (let index = 1; index <= companions; index += 1) {
        queue.enqueue({ id: `actor-${index}`, origin, destination, context: PLAIN, priority: 0 }, 0);
      }

      const resolved = queue.processTick({
        tick: 0,
        workBudget: 100_000,
        world: fixture.world,
        doors: fixture.doors,
        graph,
        routeCache: new RouteCache(),
        flowFieldCache: new FlowFieldCache(),
      });
      const mine = resolved.find((outcome) => outcome.id === 'actor-0');
      if (mine === undefined) throw new Error('actor-0 must resolve within its tick at this budget.');
      answers.set(companions, mine);
    }

    const alone = answers.get(0);
    const inACrowd = answers.get(6);
    if (alone === undefined || inACrowd === undefined) throw new Error('Both scenarios must produce an answer.');

    // Non-vacuity in both directions: the crowd really did trip sharing and the
    // lone actor really did not, so this compares the two code paths and not one
    // path against itself.
    expect(alone.usedFlowField).toBe(false);
    expect(inACrowd.usedFlowField).toBe(true);
    expect(fingerprint(inACrowd.result)).toBe(fingerprint(alone.result));
  });

  it('resolves every request identically with the caches disabled and with them warm across a lockdown', () => {
    const doorScript: ReadonlyMap<number, readonly [string, DoorState][]> = new Map([
      [2, [['d1-a-b', 'locked']]],
      [4, [['d4-c-d', 'closed']]],
      // Both of room A's doors are now locked, so it is a sealed room and every
      // leg into or out of it is a genuine `permission-denied` -- the answer a
      // stale cache is most damaging about (#357).
      [6, [['d3-a-c', 'locked']]],
      [8, [['d1-a-b', 'open'], ['d2-b-d', 'locked']]],
    ]);

    function run(cachesLive: boolean): readonly string[] {
      const fixture = buildRingFixture();
      const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
      const queue = new PathRequestQueue({ agingIntervalTicks: 15, flowFieldActivationThreshold: 4 });
      let routeCache = new RouteCache();
      let flowFieldCache = new FlowFieldCache();
      const transcript: string[] = [];

      for (let tick = 0; tick < 10; tick += 1) {
        for (const [doorId, state] of doorScript.get(tick) ?? []) fixture.doors.setState(doorId, state);
        for (const leg of ringLegs(fixture.tiles, 8, tick)) {
          queue.enqueue({ id: `t${tick}-${leg.id}`, origin: leg.origin, destination: leg.destination, context: PLAIN, priority: 0 }, tick);
        }
        if (!cachesLive) {
          // "Cache disabled": every tick computes from scratch. Anything the
          // cached run answers differently is an answer that came from history
          // rather than from state.
          routeCache = new RouteCache();
          flowFieldCache = new FlowFieldCache();
        }
        for (const outcome of queue.processTick({
          tick,
          workBudget: 100_000,
          world: fixture.world,
          doors: fixture.doors,
          graph,
          routeCache,
          flowFieldCache,
        })) {
          transcript.push(`${tick} ${outcome.id} ${fingerprint(outcome.result)}`);
        }
      }

      return transcript;
    }

    const withCaches = run(true);
    const withoutCaches = run(false);

    expect(withCaches.length).toBe(80);
    expect(withCaches).toEqual(withoutCaches);
    // The transcript has to contain both kinds of answer, or "identical" would
    // be a statement about a run in which nothing interesting happened.
    expect(withCaches.some((line) => line.includes('FAIL:permission-denied'))).toBe(true);
    expect(withCaches.some((line) => !line.includes('FAIL'))).toBe(true);
  });
});
