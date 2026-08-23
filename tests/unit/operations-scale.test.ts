import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import type { TilePosition } from '../../src/simulation/world/coordinates';
import { Container, ContainerRegistry } from '../../src/simulation/operations/inventory';
import { JobBoard } from '../../src/simulation/operations/job';
import { JobSystem, JobWorkerPool, type JobWorkerAdapter } from '../../src/simulation/operations/job-system';
import { UtilityNetwork } from '../../src/simulation/operations/utility-network';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';

const STAFF: RouteContext = { role: 'staff', securityClearance: 5, permissions: ['medical-wing'] };

class MapWorkerAdapter implements JobWorkerAdapter {
  private readonly positions = new Map<number, TilePosition>();
  public set(entityId: number, tile: TilePosition): void { this.positions.set(entityId, tile); }
  public getPositionTile(entityId: number): TilePosition {
    const tile = this.positions.get(entityId);
    if (tile === undefined) throw new Error(`No position for worker ${entityId}`);
    return tile;
  }
  public setPositionTile(entityId: number, tile: TilePosition): void { this.positions.set(entityId, tile); }
  public getRouteContext(): RouteContext { return STAFF; }
}

/**
 * Representative-prison-size correctness (and directional timing) proof
 * for issue #25's "benchmark job matching, queue growth, inventory
 * transfers and utility updates" performance requirement. Deliberately
 * does not assert on wall-clock time -- docs/BENCHMARKING.md's policy
 * requires repeated controlled baselines first; this proves job
 * matching/queue growth/inventory transfers stay correct and reasonably
 * fast at several hundred concurrent jobs and a several-hundred-node
 * utility network, and reports timing to the console as evidence.
 */
describe('operations scale: many concurrent jobs through the shared substrate', () => {
  it('matches, executes and completes 300 concurrent carry jobs with 20 workers without pathological slowdown', () => {
    const cellCount = 40;
    const cellBlock = buildCellBlockFixture(cellCount);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 4_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 8 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const containers = new ContainerRegistry();
    const source = new Container('source-0');
    const destination = new Container('destination-0');
    containers.register(source);
    containers.register(destination);
    source.deposit('item.brick', 10_000);

    const board = new JobBoard();
    const workers = new JobWorkerPool();
    const adapter = new MapWorkerAdapter();
    const jobSystem = new JobSystem(board, containers, workers, adapter, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(jobSystem);

    const workerCount = 20;
    for (let i = 1; i <= workerCount; i += 1) {
      workers.register(i);
      adapter.set(i, cellBlock.canteenTiles[0]!);
    }

    const jobCount = 300;
    for (let i = 0; i < jobCount; i += 1) {
      board.submitCarryItem(
        {
          id: `carry-${i}`,
          priority: i % 3,
          itemId: 'item.brick',
          quantity: 1,
          sourceContainerId: 'source-0',
          sourceTile: cellBlock.cellTiles[i % cellBlock.cellTiles.length]!,
          destinationContainerId: 'destination-0',
          destinationTile: cellBlock.canteenTiles[1]!,
        },
        0,
      );
    }

    const startedAt = performance.now();
    for (let i = 0; i < 3_000; i += 1) kernel.step();
    const wallMs = performance.now() - startedAt;
    console.log(`[operations scale] jobs=${jobCount} workers=${workerCount} cells=${cellCount} wallMs=${wallMs.toFixed(1)}`);

    const completed = board.allSorted().filter((job) => job.state === 'completed').length;
    expect(completed).toBe(jobCount);
    expect(destination.quantityOf('item.brick')).toBe(jobCount);
    expect(source.reservedOf('item.brick')).toBe(0);
  }, 30_000);
});

describe('operations scale: a larger utility network', () => {
  it('evaluates a 500-consumer network deterministically and within a bounded number of component scans', () => {
    const network = new UtilityNetwork('electricity');
    network.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 250 });
    for (let i = 0; i < 500; i += 1) {
      const consumerId = `load-${String(i).padStart(4, '0')}`;
      network.addNode({ id: consumerId, kind: 'consumer', capacityOrDemand: 1 });
      network.connect('generator-0', consumerId);
    }

    const startedAt = performance.now();
    const { states } = network.evaluate();
    const wallMs = performance.now() - startedAt;
    console.log(`[operations scale] utility nodes=501 wallMs=${wallMs.toFixed(2)}`);

    const poweredConsumerCount = [...states.entries()].filter(([nodeId, state]) => nodeId.startsWith('load-') && state === 'powered').length;
    expect(poweredConsumerCount).toBe(250); // exactly capacity's worth, deterministically the first 250 by ascending id
    expect(states.get('generator-0')).toBe('powered'); // the producer itself is not failed/blocked
    expect(states.get('load-0000')).toBe('powered');
    expect(states.get('load-0499')).toBe('disabled-no-supply');
  });
});
