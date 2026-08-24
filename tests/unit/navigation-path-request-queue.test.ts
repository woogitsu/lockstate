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

/**
 * ADR 0007's deferred-status contract, which had no behavioural test at all.
 *
 * The ADR does not describe `getPending`/`pendingIds` as conveniences. It
 * makes them the *answer* to the issue's "structured deferred status"
 * requirement, and says so in those terms
 * (`docs/adr/0007-navigation-work-budgets-and-flow-fields.md`):
 *
 * > `getPending(id)`/`pendingIds()` expose enqueue tick (hence age) and
 * > queue depth directly; there is no separate "deferred" event stream; a
 * > request's status is simply "in the queue" or "resolved," matching the
 * > issue's "structured deferred status" requirement without inventing a
 * > third state machine.
 *
 * Neither accessor has a caller in `src/` — by design, since the ADR names
 * the callers as "future regime/security systems" — and #177 item 2 recorded
 * that as a choice between wiring `pendingIds()` and amending the ADR to
 * delete it. Both of those need a decision. What did not need one is this:
 * measured, replacing `pendingIds()` with `return []` and `getPending()` with
 * `return undefined` left all 162 test files and 1,667 tests green. An
 * accessor an accepted ADR relies on to satisfy a requirement was free to
 * return nothing, and would have stayed that way until its first caller
 * arrived and read the emptiness as an empty queue.
 *
 * So this pins the ADR's two sentences and nothing beyond them: what the
 * accessors report, and that "in the queue" and "resolved" are the only two
 * states either of them can show. It deliberately does not invent a
 * production consumer, which is the half that still needs the owner.
 *
 * The *ordering* half of `pendingIds` is not re-asserted here — dropping its
 * `.sort()` is already a demonstrated break in
 * `tests/determinism/canonical-iteration-contract.test.ts`. The one case
 * below that does depend on order is there because a sort over ids whose
 * enqueue order differs from their code-unit order is the only way to show
 * that the listing is not simply the insertion sequence.
 */
describe('PathRequestQueue: the deferred status ADR 0007 says these accessors are', () => {
  it('reports the enqueue tick, so a caller can derive the age of a request without a separate event stream', () => {
    const { cellTiles, canteenTiles } = makeFixture();
    const queue = new PathRequestQueue({ agingIntervalTicks: 10, flowFieldActivationThreshold: 1000 });
    const request: PathRequestInput = { id: 'aging', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 };

    queue.enqueue(request, 40);

    const pending = queue.getPending('aging');
    expect(pending).toBeDefined();
    expect(pending?.enqueuedAtTick).toBe(40);
    // "hence age": the ADR's parenthetical is only true if the tick is the
    // enqueue tick and not the current one, so the subtraction is the claim.
    expect(97 - pending!.enqueuedAtTick).toBe(57);
    // The request itself comes back, not a copy of its id -- `priority` is
    // what a caller deciding whether to re-prioritise would need next.
    expect(pending?.request.priority).toBe(0);
    expect(pending?.request.id).toBe('aging');
  });

  it('says nothing about an id it never held, rather than inventing an entry for it', () => {
    const queue = new PathRequestQueue({ agingIntervalTicks: 10, flowFieldActivationThreshold: 1000 });

    expect(queue.getPending('never-enqueued')).toBeUndefined();
    expect(queue.pendingIds()).toEqual([]);
  });

  it('lists exactly the queued ids, and lists them in id order rather than enqueue order', () => {
    const { cellTiles, canteenTiles } = makeFixture();
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    // Enqueued deliberately against their sorted order.
    for (const [index, id] of ['zulu', 'mike', 'alpha'].entries()) {
      queue.enqueue({ id, origin: cellTiles[index]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    }

    expect(queue.pendingIds()).toEqual(['alpha', 'mike', 'zulu']);
    // "queue depth directly": the listing and the count are the same queue,
    // so a caller reading one cannot disagree with a caller reading the other.
    expect(queue.pendingIds()).toHaveLength(queue.size());
  });

  it('drops a resolved request from both accessors, because resolved is the other of the two states', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    queue.enqueue({ id: 'resolve-me', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    expect(queue.pendingIds()).toEqual(['resolve-me']);

    const resolved = queue.processTick({ tick: 0, workBudget: 100_000, world, doors, graph, routeCache, flowFieldCache });

    expect(resolved.map((entry) => entry.id)).toEqual(['resolve-me']);
    expect(queue.getPending('resolve-me')).toBeUndefined();
    expect(queue.pendingIds()).toEqual([]);
  });

  it('drops a cancelled request from both accessors, so cancellation is not a third state', () => {
    const { cellTiles, canteenTiles } = makeFixture();
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    queue.enqueue({ id: 'keep', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    queue.enqueue({ id: 'drop', origin: cellTiles[1]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);

    expect(queue.cancel('drop')).toBe(true);

    expect(queue.getPending('drop')).toBeUndefined();
    expect(queue.pendingIds()).toEqual(['keep']);
    // Still reported as pending, so cancelling one entry did not quietly
    // clear the queue -- the failure mode a `pending.clear()` would produce.
    expect(queue.getPending('keep')?.request.id).toBe('keep');
  });

  it('keeps a deferred request visible in both accessors while it waits for budget', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    for (let index = 0; index < 6; index += 1) {
      queue.enqueue({ id: `req-${index}`, origin: cellTiles[index]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 3);
    }

    const resolved = queue.processTick({ tick: 3, workBudget: 1, world, doors, graph, routeCache, flowFieldCache });
    expect(resolved.length).toBeLessThan(6);

    // This is the whole point of the accessors: a request that was deferred
    // rather than resolved is still findable, and still carries the tick it
    // arrived at, so a caller can tell "waiting" from "gone".
    const survivors = queue.pendingIds();
    expect(survivors).toHaveLength(6 - resolved.length);
    for (const id of survivors) {
      expect(queue.getPending(id)?.enqueuedAtTick).toBe(3);
    }
    for (const entry of resolved) {
      expect(survivors).not.toContain(entry.id);
    }
  });
});
