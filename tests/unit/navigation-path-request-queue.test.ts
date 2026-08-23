import { describe, expect, it } from 'vitest';
import { FlowFieldCache } from '../../src/simulation/navigation/flow-field';
import { PathRequestQueue, type PathRequestInput } from '../../src/simulation/navigation/path-request-queue';
import { RouteCache } from '../../src/simulation/navigation/route-cache';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { buildCellBlockFixture, buildFixtureGraph } from '../helpers/navigation-fixture';

const GUARD: RouteContext = { role: 'guard', securityClearance: 5 };

function makeFixture(cellCount = 12) {
  const fixture = buildCellBlockFixture(cellCount);
  const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
  return { ...fixture, graph, routeCache: new RouteCache(), flowFieldCache: new FlowFieldCache() };
}

describe('PathRequestQueue: priority, aging fairness, budget and cancellation', () => {
  it('processes at least one request per tick even when its cost alone exceeds the budget', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 10, flowFieldActivationThreshold: 100 });
    queue.enqueue({ id: 'a', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);

    const resolved = queue.processTick({ tick: 0, workBudget: 0, world, doors, graph, routeCache, flowFieldCache });
    expect(resolved).toHaveLength(1);
    expect(queue.size()).toBe(0);
  });

  it('defers requests once the tick budget is spent, keeping them pending for the next tick', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    for (let i = 0; i < 10; i += 1) {
      queue.enqueue({ id: `req-${i}`, origin: cellTiles[i]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    }

    const resolved = queue.processTick({ tick: 0, workBudget: 1, world, doors, graph, routeCache, flowFieldCache });
    expect(resolved.length).toBeGreaterThanOrEqual(1);
    expect(resolved.length).toBeLessThan(10);
    expect(queue.size()).toBe(10 - resolved.length);
  });

  it('processes strictly higher-priority requests first within the same tick', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    queue.enqueue({ id: 'low', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    queue.enqueue({ id: 'high', origin: cellTiles[2]!, destination: canteenTiles[0]!, context: GUARD, priority: 5 }, 0);

    const resolved = queue.processTick({ tick: 0, workBudget: 1, world, doors, graph, routeCache, flowFieldCache });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.id).toBe('high');
  });

  it('ages a low-priority request until it eventually outranks a stream of newly-arriving higher-priority ones', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 5, flowFieldActivationThreshold: 1000 });

    queue.enqueue({ id: 'stuck', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);

    let resolvedStuckAtTick: number | undefined;
    for (let tick = 0; tick < 200; tick += 1) {
      // A fresh priority-1 request arrives every tick, always outranking the aging request until it ages enough.
      // A distinct context.role per tick busts the route cache, so each one genuinely costs budget instead of
      // resolving for free on a repeat lookup (which would let `stuck` slip through for the wrong reason).
      const freshContext: RouteContext = { role: `guard-${tick}`, securityClearance: 5 };
      queue.enqueue({ id: `fresh-${tick}`, origin: cellTiles[1]!, destination: canteenTiles[0]!, context: freshContext, priority: 1 }, tick);
      const resolved = queue.processTick({ tick, workBudget: 1, world, doors, graph, routeCache, flowFieldCache });
      if (resolved.some((r) => r.id === 'stuck')) {
        resolvedStuckAtTick = tick;
        break;
      }
    }

    expect(resolvedStuckAtTick).toBeDefined();
    // Aging by 1 every 5 ticks needs at least 5 ticks to reach effective priority 1 and start competing.
    expect(resolvedStuckAtTick!).toBeGreaterThanOrEqual(5);
  });

  it('cancel removes a still-pending request and is a no-op (returns false) for an unknown id', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(12);
    const queue = new PathRequestQueue({ agingIntervalTicks: 10, flowFieldActivationThreshold: 100 });
    queue.enqueue({ id: 'x', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);

    expect(queue.cancel('x')).toBe(true);
    expect(queue.size()).toBe(0);
    expect(queue.cancel('x')).toBe(false);
    expect(queue.cancel('never-existed')).toBe(false);

    const resolved = queue.processTick({ tick: 0, workBudget: 1000, world, doors, graph, routeCache, flowFieldCache });
    expect(resolved).toHaveLength(0);
  });

  it('throws on enqueuing a duplicate id while one is still pending', () => {
    const { cellTiles, canteenTiles } = makeFixture(6);
    const queue = new PathRequestQueue({ agingIntervalTicks: 10, flowFieldActivationThreshold: 100 });
    const request: PathRequestInput = { id: 'dup', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 };
    queue.enqueue(request, 0);
    expect(() => queue.enqueue(request, 1)).toThrow();
  });

  it('is deterministic: identical enqueue order and identical ticks produce identical resolution order and results', () => {
    const runOnce = () => {
      const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(16);
      const queue = new PathRequestQueue({ agingIntervalTicks: 7, flowFieldActivationThreshold: 4 });
      for (let i = 0; i < 16; i += 1) {
        queue.enqueue(
          { id: `r${i}`, origin: cellTiles[i]!, destination: canteenTiles[i % canteenTiles.length]!, context: GUARD, priority: i % 3 },
          0,
        );
      }
      const outcomes = [];
      for (let tick = 0; tick < 30 && queue.size() > 0; tick += 1) {
        outcomes.push(...queue.processTick({ tick, workBudget: 5, world, doors, graph, routeCache, flowFieldCache }));
      }
      return outcomes.map((o) => ({ id: o.id, ok: o.result.ok, usedFlowField: o.usedFlowField }));
    };

    expect(runOnce()).toEqual(runOnce());
  });

  it('activates a shared flow field once enough currently-pending requests target the same destination region and context', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 5 });

    for (let i = 0; i < 10; i += 1) {
      queue.enqueue({ id: `meal-${i}`, origin: cellTiles[i]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    }

    const resolved = queue.processTick({ tick: 0, workBudget: 100_000, world, doors, graph, routeCache, flowFieldCache });
    expect(resolved.length).toBe(10);
    expect(resolved.some((r) => r.usedFlowField)).toBe(true);
    expect(queue.getMetrics().flowFieldActivations).toBe(1); // one shared field computed for the whole group
    expect(flowFieldCache.getMetrics().size).toBe(1);
  });

  it('does not activate a shared flow field below the configured threshold', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 5 });

    for (let i = 0; i < 3; i += 1) {
      queue.enqueue({ id: `meal-${i}`, origin: cellTiles[i]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    }

    const resolved = queue.processTick({ tick: 0, workBudget: 100_000, world, doors, graph, routeCache, flowFieldCache });
    expect(resolved.every((r) => !r.usedFlowField)).toBe(true);
    expect(queue.getMetrics().flowFieldActivations).toBe(0);
  });
});
