import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { spawnStubActorPopulation, type StubActor } from '../helpers/navigation-actor-stub';

const CELL_COUNT = 64;
const MAX_TICKS = 500;

function driveToCompletion(kernel: Kernel, navigation: NavigationSystem, maxTicks = MAX_TICKS): number {
  let ticks = 0;
  while (navigation.pendingCount() > 0 && ticks < maxTicks) {
    kernel.step();
    ticks += 1;
  }
  return ticks;
}

interface ScenarioSummary {
  readonly resolvedIds: readonly string[];
  readonly resultFingerprints: readonly string[];
  readonly ticksTaken: number;
  readonly flowFieldActivations: number;
}

function runScenario(actorCount: number, seed: number, mode: 'meal-rush' | 'lockdown-return' | 'mixed'): ScenarioSummary {
  const fixture = buildCellBlockFixture(CELL_COUNT);
  const navigation = new NavigationSystem(
    fixture.world,
    { workBudgetPerTick: 400, agingIntervalTicks: 15, flowFieldActivationThreshold: 6 },
    fixture.doors,
  );
  navigation.setLoadedChunks(fixture.chunkPositions);

  const kernel = new Kernel();
  kernel.registerSystem(navigation);

  const store = new EntityStore(actorCount + 10);
  let actors: readonly StubActor[];

  if (mode === 'meal-rush') {
    // Many actors, one shared destination region: the flow-field sharing case.
    actors = spawnStubActorPopulation(store, {
      count: actorCount,
      seed,
      originTiles: fixture.cellTiles,
      destinationTiles: fixture.canteenTiles,
      sharedDestination: fixture.canteenTiles[0]!,
    });
  } else if (mode === 'lockdown-return') {
    // Many actors, each returning to a DIFFERENT assigned cell: no shared destination to exploit.
    actors = spawnStubActorPopulation(store, {
      count: actorCount,
      seed,
      originTiles: fixture.canteenTiles,
      destinationTiles: fixture.cellTiles,
    });
  } else {
    actors = spawnStubActorPopulation(store, {
      count: actorCount,
      seed,
      originTiles: [...fixture.cellTiles, ...fixture.canteenTiles],
      destinationTiles: [...fixture.cellTiles, ...fixture.canteenTiles],
    });
  }

  for (const actor of actors) {
    navigation.requestRoute(actor.requestId, actor.origin, actor.destination, actor.context, actor.priority, kernel.tick);
  }

  const ticksTaken = driveToCompletion(kernel, navigation);

  const resolvedIds: string[] = [];
  const resultFingerprints: string[] = [];
  for (const actor of actors) {
    const outcome = navigation.getResult(actor.requestId);
    expect(outcome).toBeDefined();
    if (outcome === undefined) continue;
    resolvedIds.push(actor.requestId);
    const summary = outcome.result.ok
      ? `ok:${outcome.result.route.totalCost}:${outcome.result.route.segments.length}`
      : `fail:${outcome.result.failure.reason}`;
    resultFingerprints.push(`${actor.requestId}=${summary}`);
  }

  return {
    resolvedIds,
    resultFingerprints,
    ticksTaken,
    flowFieldActivations: navigation.getQueueMetrics().flowFieldActivations,
  };
}

describe('NavigationSystem: wired into SimulationRuntime', () => {
  it('createNewSimulationRuntime registers a real, kernel-scheduled navigation system', () => {
    const runtime = createNewSimulationRuntime();
    expect(runtime.navigation).toBeInstanceOf(NavigationSystem);
    expect(runtime.navigation.pendingCount()).toBe(0);
    // Registering a second system with the same id would throw -- proves `navigation` really is on this kernel.
    expect(() => runtime.kernel.registerSystem(runtime.navigation)).toThrow();
  });
});

/**
 * The configured budget is the one the tick actually spends (#416).
 *
 * `AGENTS.md` boundary 9 forbids unrestricted pathfinding, and the whole of
 * this system's compliance with it is one line: `update` passes
 * `workBudget: this.options.workBudgetPerTick` into `processTick`. The queue's
 * own tests pass a budget in directly, so none of them can see that line at
 * all -- replacing it with `workBudget: Number.MAX_SAFE_INTEGER`, which is
 * literally "run every pending A* this tick, however many there are", left
 * **238 files / 2,696 tests green** when measured at v0.0.121. The scenarios
 * below drive 250 actors to completion and assert what came back, never how
 * many ticks of work it was allowed to cost, so an unbounded queue satisfies
 * them faster.
 *
 * A single tick is the whole subject here, because "per tick" is what the
 * budget bounds; `driveToCompletion` deliberately is not used.
 */
describe('NavigationSystem: the configured work budget bounds a single tick', () => {
  const WORK_BUDGET = 200;
  const REQUEST_COUNT = 16;

  function oneTick(workBudgetPerTick: number) {
    const fixture = buildCellBlockFixture(20);
    const navigation = new NavigationSystem(
      fixture.world,
      // Sharing off and aging irrelevant over one tick, so the budget is the
      // only thing that can stop the queue.
      { workBudgetPerTick, agingIntervalTicks: 1_000, flowFieldActivationThreshold: 1_000 },
      fixture.doors,
    );
    navigation.setLoadedChunks(fixture.chunkPositions);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);

    const destination = fixture.canteenTiles[0]!;
    const ids: string[] = [];
    for (let index = 0; index < REQUEST_COUNT; index += 1) {
      const id = `req-${String(index).padStart(2, '0')}`;
      ids.push(id);
      navigation.requestRoute(id, fixture.cellTiles[index % fixture.cellTiles.length]!, destination, { role: 'guard', securityClearance: 5 }, 0, kernel.tick);
    }

    kernel.step(); // exactly one tick

    const expansions = ids
      .map((id) => navigation.getResult(id))
      .filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== undefined)
      .map((outcome) => outcome.expansions);
    return { navigation, expansions };
  }

  it('spends its configured budget, not the whole queue, on one tick', () => {
    const { navigation, expansions } = oneTick(WORK_BUDGET);

    // Forward progress, and a bound on it. `pendingCount() > 0` is the
    // assertion `workBudget: Number.MAX_SAFE_INTEGER` cannot satisfy: an
    // unbounded tick leaves nothing waiting.
    expect(expansions.length).toBeGreaterThan(0);
    expect(navigation.pendingCount(), 'one tick drained a queue its budget could not pay for').toBeGreaterThan(0);
    expect(expansions.length + navigation.pendingCount()).toBe(REQUEST_COUNT);

    const spent = expansions.reduce((sum, count) => sum + count, 0);
    expect(navigation.getQueueMetrics().totalExpansions).toBe(spent);
    // The ceiling, stated so it holds whichever request was taken last: the
    // queue always finishes the request it started, so at most one request's
    // work may stand above the budget.
    expect(spent - Math.max(...expansions), 'a tick expanded more nodes than the system budgeted').toBeLessThan(
      WORK_BUDGET,
    );
    expect(spent).toBeGreaterThanOrEqual(WORK_BUDGET); // the budget was reached, so the bound above is not vacuous
  });

  it('carries a different configured budget through to a different amount of work', () => {
    // The option is read rather than ignored: the only difference between
    // these two systems is the number in their options.
    const lean = oneTick(50);
    const generous = oneTick(1_000);

    expect(lean.expansions.length).toBeLessThan(generous.expansions.length);
    expect(lean.navigation.getQueueMetrics().totalExpansions).toBeLessThan(
      generous.navigation.getQueueMetrics().totalExpansions,
    );
    expect(lean.navigation.pendingCount()).toBeGreaterThan(generous.navigation.pendingCount());
  });
});

describe('NavigationSystem: seeded actor-tier scenarios (stub actors via EntityStore)', () => {
  it('resolves every request within the tick budget for a 250-actor meal-rush scenario, sharing flow-field work', () => {
    const summary = runScenario(250, 0xc0ffee, 'meal-rush');
    expect(summary.resolvedIds).toHaveLength(250);
    expect(summary.ticksTaken).toBeLessThan(MAX_TICKS);
    expect(summary.flowFieldActivations).toBeGreaterThan(0);
  });

  it('resolves every request for a 250-actor lockdown-return-to-cell scenario with distinct destinations', () => {
    const summary = runScenario(250, 0xdecaf, 'lockdown-return');
    expect(summary.resolvedIds).toHaveLength(250);
    expect(summary.ticksTaken).toBeLessThan(MAX_TICKS);
  });

  it('resolves every request for a 250-actor mixed-destination scenario', () => {
    const summary = runScenario(250, 0xfeed, 'mixed');
    expect(summary.resolvedIds).toHaveLength(250);
    expect(summary.ticksTaken).toBeLessThan(MAX_TICKS);
  });

  it('is deterministic: an identical seed and scenario produce identical resolution order, costs and failure reasons', () => {
    const first = runScenario(250, 0x1234, 'mixed');
    const second = runScenario(250, 0x1234, 'mixed');
    expect(second.resultFingerprints).toEqual(first.resultFingerprints);
    expect(second.ticksTaken).toBe(first.ticksTaken);
  });
});
