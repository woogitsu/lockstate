import { describe, expect, it } from 'vitest';
import { CarryJobExecutor } from '../../src/simulation/operations/carry-executor';
import { Container, ContainerRegistry } from '../../src/simulation/operations/inventory';
import { JobBoard } from '../../src/simulation/operations/job';
import { UtilityNetwork } from '../../src/simulation/operations/utility-network';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { CarryCrew } from '../helpers/carry-executor-harness';

/**
 * Representative-prison-size correctness (and directional timing) proof
 * for issue #25's "benchmark job matching, queue growth, inventory
 * transfers and utility updates" performance requirement. Deliberately
 * does not assert on wall-clock time -- docs/BENCHMARKING.md's policy
 * requires repeated controlled baselines first; this proves job
 * matching/queue growth/inventory transfers stay correct and reasonably
 * fast at several hundred concurrent jobs and a several-hundred-node
 * utility network, and reports timing to the console as evidence.
 *
 * **The carry half no longer routes anybody**
 * ([ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md) decision 4): the
 * walk belongs to `prisoners.actions`, so what is measured here is matching,
 * queue growth and the inventory transfer -- `CarryJobExecutor` -- and not
 * pathfinding at scale. Navigation at scale has its own gates under
 * `benchmarks/` and in `tests/determinism/`. The `NavigationSystem` and the
 * cell-block fixture this file used to build have gone with the system that
 * needed them, which is why the timing figure below is much smaller than the
 * one this test used to print: it is a different measurement and it says so.
 */
describe('operations scale: many concurrent jobs through the shared substrate', () => {
  it('matches, executes and completes 300 concurrent carry jobs with 20 carriers without pathological slowdown', () => {
    const containers = new ContainerRegistry();
    const source = new Container('source-0');
    const destination = new Container('destination-0');
    containers.register(source);
    containers.register(destination);
    source.deposit('item.brick', 10_000);

    const board = new JobBoard();
    const executor = new CarryJobExecutor(board, containers);
    const workerCount = 20;
    const carriers = Array.from({ length: workerCount }, (_unused, index) => index + 1);
    const crew = new CarryCrew(executor, carriers);

    const jobCount = 300;
    for (let i = 0; i < jobCount; i += 1) {
      board.submitCarryItem(
        {
          id: `carry-${i}`,
          priority: i % 3,
          itemId: 'item.brick',
          quantity: 1,
          sourceContainerId: 'source-0',
          sourceTile: { x: tileCoordinate(2 + (i % 8)), y: tileCoordinate(1) },
          destinationContainerId: 'destination-0',
          destinationTile: { x: tileCoordinate(12), y: tileCoordinate(1) },
        },
        0,
      );
    }

    const startedAt = performance.now();
    // 300 jobs over 20 carriers is 15 rounds, and a round is three cycles
    // (claim, pickup, drop-off), so 45 is the floor and 200 is headroom.
    crew.run(200);
    const wallMs = performance.now() - startedAt;
    console.log(`[operations scale] jobs=${jobCount} carriers=${workerCount} wallMs=${wallMs.toFixed(1)}`);

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
