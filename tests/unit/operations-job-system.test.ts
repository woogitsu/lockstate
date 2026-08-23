import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import type { TilePosition } from '../../src/simulation/world/coordinates';
import { Container, ContainerRegistry } from '../../src/simulation/operations/inventory';
import { JobBoard } from '../../src/simulation/operations/job';
import { JobSystem, JobWorkerPool, type JobWorkerAdapter } from '../../src/simulation/operations/job-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';

const GUARD: RouteContext = { role: 'staff', securityClearance: 5, permissions: ['medical-wing'] };

class MapWorkerAdapter implements JobWorkerAdapter {
  private readonly positions = new Map<number, TilePosition>();

  public set(entityId: number, tile: TilePosition): void {
    this.positions.set(entityId, tile);
  }

  public getPositionTile(entityId: number): TilePosition {
    const tile = this.positions.get(entityId);
    if (tile === undefined) throw new Error(`No position for worker ${entityId}`);
    return tile;
  }

  public setPositionTile(entityId: number, tile: TilePosition): void {
    this.positions.set(entityId, tile);
  }

  public getRouteContext(): RouteContext {
    return GUARD;
  }
}

function buildFixture(cellCount = 12) {
  const cellBlock = buildCellBlockFixture(cellCount);
  const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const containers = new ContainerRegistry();
  const source = new Container('delivery-bay-0');
  const destination = new Container('storage-0');
  containers.register(source);
  containers.register(destination);

  const board = new JobBoard();
  const workers = new JobWorkerPool();
  const adapter = new MapWorkerAdapter();
  const jobSystem = new JobSystem(board, containers, workers, adapter, navigation);

  const kernel = new Kernel();
  kernel.registerSystem(navigation);
  kernel.registerSystem(jobSystem);

  return { cellBlock, navigation, containers, source, destination, board, workers, adapter, jobSystem, kernel };
}

describe('JobSystem: carry-item lifecycle end to end through real navigation', () => {
  it('moves an item from source to destination via reserve -> travel -> pickup -> travel -> dropoff', () => {
    const { cellBlock, source, destination, board, workers, adapter, kernel } = buildFixture();
    source.deposit('item.brick', 10);

    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[0]!);

    const job = board.submitCarryItem(
      { id: 'carry-1', priority: 1, itemId: 'item.brick', quantity: 4, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.canteenTiles[1]! },
      0,
    );
    expect(job.state).toBe('available');

    for (let i = 0; i < 400; i += 1) kernel.step();

    expect(board.getById('carry-1')?.state).toBe('completed');
    expect(destination.quantityOf('item.brick')).toBe(4);
    expect(source.quantityOf('item.brick')).toBe(6);
    expect(source.reservedOf('item.brick')).toBe(0);
    expect(workers.isBusy(workerId)).toBe(false);
  });

  it('stays available (backpressure, not failure) while the source has insufficient stock, then completes once stock arrives', () => {
    const { cellBlock, source, destination, board, workers, adapter, kernel } = buildFixture();
    // No deposit yet -- job cannot reserve.
    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[0]!);

    board.submitCarryItem(
      { id: 'carry-2', priority: 1, itemId: 'item.brick', quantity: 4, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.canteenTiles[1]! },
      0,
    );

    for (let i = 0; i < 50; i += 1) kernel.step();
    expect(board.getById('carry-2')?.state).toBe('available');
    expect(workers.isBusy(workerId)).toBe(false); // never claimed a worker while blocked

    source.deposit('item.brick', 10);
    for (let i = 0; i < 400; i += 1) kernel.step();

    expect(board.getById('carry-2')?.state).toBe('completed');
    expect(destination.quantityOf('item.brick')).toBe(4);
  });

  it('fails the job and releases the reservation + worker when the route is permission-denied', () => {
    const { cellBlock, source, board, workers, adapter, kernel } = buildFixture(6);
    source.deposit('item.brick', 10);

    // Lock the only door into the cell block area the worker's low clearance can't cross.
    cellBlock.doors.setState('cell-door-0', 'locked');

    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[0]!);

    board.submitCarryItem(
      { id: 'carry-3', priority: 1, itemId: 'item.brick', quantity: 4, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.canteenTiles[1]! },
      0,
    );

    for (let i = 0; i < 200; i += 1) kernel.step();

    const job = board.getById('carry-3');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBeDefined();
    expect(source.reservedOf('item.brick')).toBe(0); // released, not stuck reserved forever
    expect(source.quantityOf('item.brick')).toBe(10); // never withdrawn
    expect(workers.isBusy(workerId)).toBe(false);
  });

  it('cancel() on a still-available job (no reservation yet) does not corrupt another job\'s real reservation for the same item', () => {
    const { cellBlock, source, board, workers, adapter, jobSystem } = buildFixture();
    source.deposit('item.brick', 5);

    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[0]!);

    // job A: real reservation via a *different* job system instance sharing the same container, to isolate the effect.
    source.reserve('item.brick', 5); // simulate another job's legitimate, already-made reservation

    const blockedJob = board.submitCarryItem(
      { id: 'carry-4', priority: 1, itemId: 'item.brick', quantity: 1, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.canteenTiles[1]! },
      0,
    );
    expect(blockedJob.state).toBe('available'); // cannot reserve -- all 5 already reserved by "job A"

    expect(jobSystem.cancel('carry-4')).toBe(true);
    expect(source.reservedOf('item.brick')).toBe(5); // untouched -- carry-4 never actually held a reservation
  });
});
