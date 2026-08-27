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

  /**
   * The other half of the guarantee `agingIntervalTicks` is documented to
   * give -- "guarantees eventual processing under sustained overload"
   * (`PathRequestQueueOptions`). Aging only ever lifts a waiting request
   * *into* a tie with the requests arriving around it; if the tie itself is
   * then won by whichever arrived most recently, the aged request is
   * overtaken by every new arrival and is starved for ever. So the tie-break
   * is a fairness guarantee in its own right, not a determinism detail, and
   * aging is switched off here (interval 1000 across a 5-tick window) exactly
   * so the tie is the whole subject.
   *
   * The two tests below are the only ones in this file that can see it. The
   * determinism case compares `runOnce()` against `runOnce()`, which holds for
   * any deterministic comparator including a reversed one, and enqueues all
   * sixteen of its requests at tick 0, so the `enqueuedAtTick` branch is never
   * even reached; the aging case asserts `toBeGreaterThanOrEqual(5)`, a lower
   * bound that resolving later still satisfies. Measured at 83d9616: reversing
   * the comparison to `b.enqueuedAtTick - a.enqueuedAtTick` left both files
   * green, 27/27.
   *
   * **The ids are load-bearing.** The older request is named `zulu` and the
   * newer `alpha`, so the id tie-break on the following line of `processTick`
   * prefers the *newer* one. The only comparison in the comparator that can
   * put `zulu` first is `enqueuedAtTick`, which makes these red when it is
   * reversed *and* when it is deleted outright -- a test built on ids that
   * sorted the same way as the enqueue order would survive the deletion.
   */
  it('serves the older of two equally-ranked requests first, so a waiting one is not overtaken by a new arrival', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    queue.enqueue({ id: 'zulu', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    queue.enqueue({ id: 'alpha', origin: cellTiles[1]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 5);

    // Both sit at effective priority 0 at tick 5 (0 + floor(5/1000) = 0), so
    // the first comparison cannot separate them and the budget admits exactly
    // one request.
    const resolved = queue.processTick({ tick: 5, workBudget: 1, world, doors, graph, routeCache, flowFieldCache });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.id).toBe('zulu');
    expect(queue.size()).toBe(1);
  });

  it('orders the whole tick oldest-first among equally-ranked requests, not merely its head', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    queue.enqueue({ id: 'zulu', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    queue.enqueue({ id: 'alpha', origin: cellTiles[1]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 5);

    // Same pair, a budget that admits both: the ordering claim is about the
    // sequence the tick emits, not only about which request wins a single slot.
    const resolved = queue.processTick({ tick: 5, workBudget: 100_000, world, doors, graph, routeCache, flowFieldCache });

    expect(resolved.map((outcome) => outcome.id)).toEqual(['zulu', 'alpha']);
    expect(queue.size()).toBe(0);
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

  /**
   * `flowFieldActivationThreshold` is documented as a **minimum** -- "minimum
   * currently-pending requests sharing a (destination region, context) before
   * a shared `RegionFlowField` is computed" -- so the configured number is the
   * first count that shares, not the last that does not. The two cases above
   * are measured at 10 and at 3 against a threshold of 5: above it and below
   * it, never *at* it, and the boundary is where an inclusive comparison and
   * an exclusive one differ. Measured at 83d9616, weakening
   * `>= this.options.flowFieldActivationThreshold` to `>` left this file, the
   * budget/cache file, `navigation-system.test.ts` and
   * `navigation-flow-field.test.ts` green -- 40/40. Mutated, a prison
   * configured for 5 shares only at 6, and the configured number silently
   * means one more than it says.
   *
   * The pair below pins it from both sides at adjacent counts: threshold - 1
   * must not share and threshold exactly must.
   */
  it('activates a shared flow field at exactly the configured threshold, and not one request below it', () => {
    const THRESHOLD = 5;

    const runWithPendingCount = (pendingCount: number) => {
      const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
      const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: THRESHOLD });
      for (let i = 0; i < pendingCount; i += 1) {
        queue.enqueue({ id: `meal-${i}`, origin: cellTiles[i]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
      }
      // A budget nothing can exhaust, so the group really is `pendingCount`
      // requests deep when the threshold is consulted.
      const resolved = queue.processTick({ tick: 0, workBudget: 100_000, world, doors, graph, routeCache, flowFieldCache });
      expect(resolved).toHaveLength(pendingCount);
      return { sharedAny: resolved.some((r) => r.usedFlowField), activations: queue.getMetrics().flowFieldActivations };
    };

    const justBelow = runWithPendingCount(THRESHOLD - 1);
    expect(justBelow.activations).toBe(0);
    expect(justBelow.sharedAny).toBe(false);

    const exactlyAt = runWithPendingCount(THRESHOLD);
    expect(exactlyAt.activations, 'a group exactly at the configured threshold must share a field').toBe(1);
    expect(exactlyAt.sharedAny).toBe(true);
  });
});

/**
 * ADR 0007's deferred-status contract, restated over the mechanism that
 * survived #177.
 *
 * The ADR as accepted named `getPending(id)`/`pendingIds()` as the answer to
 * the issue's "structured deferred status" requirement
 * (`docs/adr/0007-navigation-work-budgets-and-flow-fields.md`):
 *
 * > `getPending(id)`/`pendingIds()` expose enqueue tick (hence age) and
 * > queue depth directly; there is no separate "deferred" event stream; a
 * > request's status is simply "in the queue" or "resolved," matching the
 * > issue's "structured deferred status" requirement without inventing a
 * > third state machine.
 *
 * Both accessors are gone. That ADR's 2026-08-25 amendment records why: the
 * decision is (a) cancellation is a no-op on an unknown id and (b) two states
 * and no third, and both are satisfied by depth plus
 * `NavigationSystem.getResult(id) === undefined`, which is what all six
 * production callers of `requestRoute` actually read. The accessors were a
 * second, weaker way to ask the same question, with no caller at all.
 *
 * #251's six cases were written against those accessors, so they could not be
 * kept as they stood. What they were really pinning is restated below against
 * `size()`, `waitedTicks` and `getMetrics()`, because the underlying claims
 * did not go away with the accessors and were worth a test on their own
 * evidence: measured at the time, replacing `pendingIds()` with `return []`
 * and `getPending()` with `return undefined` left the whole suite green. The
 * mutations those cases existed to catch are the ones these have to catch in
 * their new form -- an `enqueue` that stamps a constant tick, a `cancel` that
 * clears the queue, a `size()` that loses track of deferred work.
 *
 * `tests/foundation/navigation-deferred-status-contract.test.ts` holds the
 * other half: that no caller in `src/` needs the deleted pair, and that
 * bringing either back is a change to the ADR.
 */
describe('PathRequestQueue: the two states ADR 0007 says a request can be in', () => {
  it('carries the enqueue tick into the resolved payload as an age, not the tick it resolved on', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 10, flowFieldActivationThreshold: 1000 });

    queue.enqueue({ id: 'aging', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 40);

    const resolved = queue.processTick({ tick: 97, workBudget: 100_000, world, doors, graph, routeCache, flowFieldCache });

    expect(resolved).toHaveLength(1);
    // "hence age": only true if the recorded tick is the *enqueue* tick and
    // not the current one, so the subtraction is the claim. An `enqueue` that
    // stamped `0`, or a `processTick` that computed `tick - tick`, fails here.
    expect(resolved[0]!.waitedTicks).toBe(57);
  });

  it('reports depth as the queued count and nothing else, so a deferred request is neither resolved nor lost', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    expect(queue.size()).toBe(0);
    for (let index = 0; index < 6; index += 1) {
      queue.enqueue({ id: `req-${index}`, origin: cellTiles[index]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 3);
    }
    expect(queue.size()).toBe(6);

    const resolved = queue.processTick({ tick: 3, workBudget: 1, world, doors, graph, routeCache, flowFieldCache });

    // The whole of "structured deferred status": every request is in exactly
    // one of the two states, and the two counts add back up to the six.
    expect(resolved.length).toBeLessThan(6);
    expect(queue.size()).toBe(6 - resolved.length);
    expect(queue.getMetrics().resolvedCount).toBe(resolved.length);
  });

  it('keeps every deferred request across ticks and eventually resolves each exactly once', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    const enqueued = ['zulu', 'mike', 'alpha', 'bravo', 'yankee', 'charlie'];
    for (const [index, id] of enqueued.entries()) {
      queue.enqueue({ id, origin: cellTiles[index]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    }

    const seen: string[] = [];
    for (let tick = 0; tick < 50 && queue.size() > 0; tick += 1) {
      for (const outcome of queue.processTick({ tick, workBudget: 1, world, doors, graph, routeCache, flowFieldCache })) {
        seen.push(outcome.id);
      }
    }

    expect(queue.size()).toBe(0);
    // Exactly once each: a request that was deferred rather than resolved is
    // still there on the next tick, and one that resolved does not come back.
    expect([...seen].sort()).toEqual([...enqueued].sort());
  });

  it('takes a cancelled request out of the queue without disturbing the rest, so cancellation is not a third state', () => {
    const { cellTiles, canteenTiles } = makeFixture();
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });

    queue.enqueue({ id: 'keep', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);
    queue.enqueue({ id: 'drop', origin: cellTiles[1]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 }, 0);

    expect(queue.cancel('drop')).toBe(true);

    // A `cancel` that also called `this.pending.clear()` would leave 0 here --
    // the mutation #251 added its last case for, kept in its new form.
    expect(queue.size()).toBe(1);
    expect(queue.getMetrics().cancelledCount).toBe(1);
    // And the survivor is still a live entry, not a hollowed-out one.
    expect(queue.cancel('keep')).toBe(true);
    expect(queue.size()).toBe(0);
    expect(queue.getMetrics().cancelledCount).toBe(2);
  });

  it('re-accepts an id once it has left the queue, because leaving is the only other state there is', () => {
    const { world, doors, graph, routeCache, flowFieldCache, cellTiles, canteenTiles } = makeFixture(20);
    const queue = new PathRequestQueue({ agingIntervalTicks: 1000, flowFieldActivationThreshold: 1000 });
    const request: PathRequestInput = { id: 'reused', origin: cellTiles[0]!, destination: canteenTiles[0]!, context: GUARD, priority: 0 };

    queue.enqueue(request, 0);
    expect(queue.processTick({ tick: 0, workBudget: 100_000, world, doors, graph, routeCache, flowFieldCache })).toHaveLength(1);

    // Resolved is not a retained state: nothing in the queue remembers the id,
    // which is what lets `JobSystem.beginLeg` and `PatrolSystem.requestLeg`
    // re-request after reading a result. A queue that held resolved entries as
    // a third state would throw the duplicate-id error here.
    expect(() => queue.enqueue(request, 5)).not.toThrow();
    expect(queue.size()).toBe(1);

    expect(queue.cancel('reused')).toBe(true);
    expect(() => queue.enqueue(request, 9)).not.toThrow();
    expect(queue.size()).toBe(1);
  });
});
