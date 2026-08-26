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

/**
 * The symmetric half of the reservation-release regression above, which only
 * ever covered the *pickup* leg. Past the pickup, `withdrawReserved` has
 * already taken the stock out of the source container and the carrier is
 * physically holding it: there is no reservation left to release, and doing
 * nothing destroys the goods outright. `docs/OPERATIONS.md` makes the
 * requirement explicit for the construction seam -- "against a finite stock a
 * cancelled order that had already allocated would destroy its materials
 * permanently" -- and the carry substrate owes the same guarantee.
 *
 * Every quantity these tests compare against is a literal written here, never
 * a value read back out of a container the production code just wrote, and
 * each one asserts the carrier is genuinely holding goods *before* the job is
 * ended -- a dropoff-leg test whose job never acquired stock proves nothing.
 */
describe('JobSystem: a job ended on the dropoff leg conserves the stock it is carrying', () => {
  const INITIAL_STOCK = 10;
  const CARRIED = 4;
  const STOCK_WHILE_CARRIED = 6; // INITIAL_STOCK - CARRIED, stated rather than computed by the system

  /**
   * Drives the kernel until the job has actually withdrawn its stock and moved
   * onto the dropoff leg, then asserts that it really is carrying goods. Returns
   * nothing the caller can mistake for an expected value.
   */
  function stepUntilCarryingOnDropoffLeg(
    fixture: ReturnType<typeof buildFixture>,
    jobId: string,
  ): void {
    const { board, kernel } = fixture;
    let carrying = false;
    for (let i = 0; i < 400 && !carrying; i += 1) {
      kernel.step();
      const job = board.getById(jobId)!;
      carrying = job.leg === 'dropoff' && job.state !== 'failed' && job.state !== 'cancelled' && job.state !== 'completed';
    }
    expect(carrying).toBe(true);
  }

  it('returns the carried stock to its source container when the dropoff leg\'s route fails', () => {
    const fixture = buildFixture(6);
    const { cellBlock, source, destination, board, workers, adapter, kernel } = fixture;
    source.deposit('item.brick', INITIAL_STOCK);

    // Lock the only door into cell 0. The pickup happens inside the canteen and
    // is unaffected; it is the *dropoff* route into the cell that cannot be built.
    cellBlock.doors.setState('cell-door-0', 'locked');

    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[2]!);

    board.submitCarryItem(
      { id: 'carry-5', priority: 1, itemId: 'item.brick', quantity: CARRIED, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.canteenTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.cellTiles[0]! },
      0,
    );

    stepUntilCarryingOnDropoffLeg(fixture, 'carry-5');
    // The carrier is genuinely holding goods: the stock has left the source and
    // has not arrived anywhere. Without this the failure below would be a
    // failure on a leg the job never reached.
    expect(source.quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    expect(source.reservedOf('item.brick')).toBe(0); // consumed by the withdrawal, so there is no reservation left to release
    expect(destination.quantityOf('item.brick')).toBe(0);

    for (let i = 0; i < 400; i += 1) kernel.step();

    const job = board.getById('carry-5');
    expect(job?.state).toBe('failed');
    expect(job?.leg).toBe('dropoff');
    expect(job?.failReason).toBeDefined();

    // Conservation: nothing was created and nothing was destroyed.
    expect(source.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(destination.quantityOf('item.brick')).toBe(0);
    expect(source.quantityOf('item.brick') + destination.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(source.reservedOf('item.brick')).toBe(0); // returned as stock, not as a phantom reservation
    expect(workers.isBusy(workerId)).toBe(false);
  });

  it('returns the carried stock to its source container when the job is cancelled on the dropoff leg', () => {
    const fixture = buildFixture(6);
    const { cellBlock, source, destination, board, workers, adapter, jobSystem } = fixture;
    source.deposit('item.brick', INITIAL_STOCK);

    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[2]!);

    // Every door on this route is passable, so the job would otherwise complete:
    // the cancellation is the only reason it does not.
    board.submitCarryItem(
      { id: 'carry-6', priority: 1, itemId: 'item.brick', quantity: CARRIED, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.canteenTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.cellTiles[0]! },
      0,
    );

    stepUntilCarryingOnDropoffLeg(fixture, 'carry-6');
    expect(source.quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    expect(source.reservedOf('item.brick')).toBe(0);
    expect(destination.quantityOf('item.brick')).toBe(0);

    expect(jobSystem.cancel('carry-6')).toBe(true);
    expect(board.getById('carry-6')?.state).toBe('cancelled');

    expect(source.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(destination.quantityOf('item.brick')).toBe(0);
    expect(source.quantityOf('item.brick') + destination.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(source.reservedOf('item.brick')).toBe(0);
    expect(workers.isBusy(workerId)).toBe(false);
  });

  it('returning carried stock does not disturb another job\'s live reservation for the same item', () => {
    // The mirror of the pickup-leg regression above: `Container` tracks
    // reservations per *item*, not per job, so compensating a dropoff-leg job by
    // releasing a reservation it no longer holds would steal a different job's.
    // The stock has to come back as stock.
    const fixture = buildFixture(6);
    const { cellBlock, source, destination, board, workers, adapter, jobSystem } = fixture;
    source.deposit('item.brick', INITIAL_STOCK);

    const FOREIGN_RESERVATION = 3;
    source.reserve('item.brick', FOREIGN_RESERVATION); // another job's legitimate, already-made claim on the same item

    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[2]!);

    board.submitCarryItem(
      { id: 'carry-7', priority: 1, itemId: 'item.brick', quantity: CARRIED, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.canteenTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.cellTiles[0]! },
      0,
    );

    stepUntilCarryingOnDropoffLeg(fixture, 'carry-7');
    expect(source.quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    expect(source.reservedOf('item.brick')).toBe(FOREIGN_RESERVATION); // only the other job's claim survives the withdrawal
    expect(destination.quantityOf('item.brick')).toBe(0);

    expect(jobSystem.cancel('carry-7')).toBe(true);

    expect(source.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(destination.quantityOf('item.brick')).toBe(0);
    expect(source.reservedOf('item.brick')).toBe(FOREIGN_RESERVATION); // untouched
    expect(source.availableOf('item.brick')).toBe(7); // INITIAL_STOCK - FOREIGN_RESERVATION, stated not computed
  });
});
