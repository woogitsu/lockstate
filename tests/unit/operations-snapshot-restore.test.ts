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
 * Issue #25's "snapshot/restore preserves queues, reservations, inventories
 * and networks" acceptance criterion, proven together rather than only
 * per-class: a job is interrupted mid-`'travelling'` (a path request live
 * against the *old* `NavigationSystem` instance), a container holds an
 * active reservation, a second job sits queued behind a busy worker, and a
 * utility network has a failed node -- all snapshotted, then restored into
 * entirely fresh `Kernel`/`NavigationSystem`/`JobSystem` instances (the
 * only realistic restore scenario -- a loaded save never reuses the old
 * process's live objects).
 */
describe('operations snapshot/restore: jobs, reservations, inventories and utility networks together', () => {
  it('resumes an interrupted job, preserves worker busy state, container reservations and utility state after a full restore', () => {
    const cellBlock = buildCellBlockFixture(10);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const containers = new ContainerRegistry();
    const source = new Container('delivery-bay-0');
    const destination = new Container('storage-0');
    containers.register(source);
    containers.register(destination);
    source.deposit('item.brick', 20);

    const board = new JobBoard();
    const workers = new JobWorkerPool();
    const adapter = new MapWorkerAdapter();
    const jobSystem = new JobSystem(board, containers, workers, adapter, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(jobSystem);

    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[0]!);

    board.submitCarryItem(
      { id: 'carry-1', priority: 2, itemId: 'item.brick', quantity: 4, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.canteenTiles[1]! },
      0,
    );
    // A second worker-eligible job, still queued behind the only worker --
    // exercises "queues" surviving restore, not just the in-flight job.
    board.submitCarryItem(
      { id: 'carry-2', priority: 1, itemId: 'item.brick', quantity: 3, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.canteenTiles[1]! },
      0,
    );

    const electricity = new UtilityNetwork('electricity');
    electricity.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 10 });
    electricity.addNode({ id: 'load-0', kind: 'consumer', capacityOrDemand: 5 });
    electricity.connect('generator-0', 'load-0');
    electricity.setFailed('generator-0', true);
    expect(electricity.evaluate().states.get('load-0')).toBe('disabled-no-supply');

    // Advance until carry-1 is actually mid-flight (travelling), not yet
    // arrived -- proves the restore path, not merely a completed-job replay.
    let tick = 0;
    for (; tick < 200 && board.getById('carry-1')?.state !== 'travelling'; tick += 1) kernel.step();
    expect(board.getById('carry-1')?.state).toBe('travelling');
    expect(board.getById('carry-1')?.pathRequestId).toBeDefined();
    expect(source.reservedOf('item.brick')).toBe(4); // carry-1's pickup-leg reservation
    expect(workers.isBusy(workerId)).toBe(true);
    expect(board.getById('carry-2')?.state).toBe('available'); // still queued -- only one worker

    const jobsSnapshot = board.getSnapshot();
    const workersSnapshot = workers.getSnapshot();
    const containersSnapshot = containers.getSnapshot();
    const electricitySnapshot = electricity.getSnapshot();

    // A restore never reuses the interrupted process's live objects --
    // fresh Kernel/NavigationSystem/JobSystem, exactly like loading a save.
    const restoredNavigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
    restoredNavigation.setLoadedChunks(cellBlock.chunkPositions);

    const restoredContainers = new ContainerRegistry();
    restoredContainers.register(new Container('delivery-bay-0'));
    restoredContainers.register(new Container('storage-0'));
    restoredContainers.loadSnapshot(containersSnapshot);

    const restoredBoard = new JobBoard();
    restoredBoard.loadSnapshot(jobsSnapshot);
    const restoredWorkers = new JobWorkerPool();
    restoredWorkers.loadSnapshot(workersSnapshot);
    const restoredAdapter = new MapWorkerAdapter();
    restoredAdapter.set(workerId, adapter.getPositionTile(workerId)); // the worker's last-known tile is session/entity state, restored independently (here: #24's PrisonerOperationsRuntime.position)
    const restoredJobSystem = new JobSystem(restoredBoard, restoredContainers, restoredWorkers, restoredAdapter, restoredNavigation);

    const restoredElectricity = new UtilityNetwork('electricity');
    restoredElectricity.loadSnapshot(electricitySnapshot);

    // The stale in-flight travel request is dropped back to 'assigned' on
    // restore (job.ts's loadSnapshot) so it re-requests routing here rather
    // than waiting forever on a request id the fresh NavigationSystem never
    // received.
    expect(restoredBoard.getById('carry-1')?.state).toBe('assigned');
    expect(restoredBoard.getById('carry-1')?.pathRequestId).toBeUndefined();
    // Reservations, busy state and the still-queued job all round-tripped.
    expect(restoredContainers.require('delivery-bay-0').reservedOf('item.brick')).toBe(4);
    expect(restoredWorkers.isBusy(workerId)).toBe(true);
    expect(restoredBoard.getById('carry-2')?.state).toBe('available');
    expect(restoredElectricity.evaluate().states.get('generator-0')).toBe('disabled-failure');
    expect(restoredElectricity.evaluate().states.get('load-0')).toBe('disabled-no-supply');

    const restoredKernel = new Kernel();
    restoredKernel.registerSystem(restoredNavigation);
    restoredKernel.registerSystem(restoredJobSystem);

    // carry-2 cannot be picked up until the worker frees up by finishing
    // carry-1 -- two effectively sequential round trips on one worker, so
    // more headroom than a single-job test needs.
    for (let i = 0; i < 1_000; i += 1) restoredKernel.step();

    expect(restoredBoard.getById('carry-1')?.state).toBe('completed');
    expect(restoredBoard.getById('carry-2')?.state).toBe('completed');
    expect(restoredContainers.require('storage-0').quantityOf('item.brick')).toBe(7); // 4 + 3, no duplication or loss across the restore boundary
    expect(restoredContainers.require('delivery-bay-0').quantityOf('item.brick')).toBe(13);
    expect(restoredContainers.require('delivery-bay-0').reservedOf('item.brick')).toBe(0);
    expect(restoredWorkers.isBusy(workerId)).toBe(false);
  });
});
