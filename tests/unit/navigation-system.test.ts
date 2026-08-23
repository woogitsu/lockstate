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
