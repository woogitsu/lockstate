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

/**
 * `registered` leaves a container out of the `ContainerRegistry` while the job
 * still names its id -- the state a save reaches when its container snapshot
 * does not carry every container its jobs reference, and the one #419 measured
 * the `RangeError` from. Both default to registered, so every fixture built
 * before this parameter existed is unchanged.
 */
function buildFixture(cellCount = 12, registered: { readonly source?: boolean; readonly destination?: boolean } = {}) {
  const cellBlock = buildCellBlockFixture(cellCount);
  const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const containers = new ContainerRegistry();
  const source = new Container('delivery-bay-0');
  const destination = new Container('storage-0');
  if (registered.source !== false) containers.register(source);
  if (registered.destination !== false) containers.register(destination);

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

/**
 * A container id the registry does not hold, on either leg and by either
 * route (#419).
 *
 * `ContainerRegistry.require` throws `RangeError`, and `continuePerforming`
 * called it on both legs. The dropoff call is the one that matters most,
 * because it runs *after* `withdrawReserved` has committed: the throw escaped
 * `Kernel.step()` with the source container already debited, the goods in the
 * carrier's hands and the worker still marked busy, so one unregistered id
 * ended the session and took the stock with it. The source leg had a graceful
 * check in `assignAvailableJobs` and the destination leg had none.
 *
 * Two routes reach it and each is covered on its own, because one test cannot
 * stand for both: a **live** job is refused at the assignment boundary before
 * it reserves anything, and a **restored** job never passes through
 * `assignAvailableJobs` at all -- `JobBoard.loadSnapshot` puts it back at the
 * state it was saved in -- so the boundary check cannot see it and the tick has
 * to resolve leniently.
 *
 * Every quantity compared against below is a literal written here, never a
 * value read back out of a container the production code just wrote.
 */
describe('JobSystem: a container id the registry does not hold fails the job instead of throwing out of the tick', () => {
  const INITIAL_STOCK = 10;
  const CARRIED = 4;
  const STOCK_WHILE_CARRIED = 6; // INITIAL_STOCK - CARRIED, stated rather than computed by the system

  /** Steps until the job satisfies `reached`, and asserts that it did. */
  function stepUntil(
    fixture: ReturnType<typeof buildFixture>,
    jobId: string,
    reached: (job: NonNullable<ReturnType<JobBoard['getById']>>) => boolean,
  ): void {
    const { board, kernel } = fixture;
    let arrived = false;
    for (let i = 0; i < 400 && !arrived; i += 1) {
      kernel.step();
      arrived = reached(board.getById(jobId)!);
    }
    expect(arrived).toBe(true);
  }

  /**
   * Moves a live session's board, workers and containers onto a freshly wired
   * one, minus the container `dropContainerId` names -- which is exactly the
   * save `restoreSessionSystems` produces when its container snapshot does not
   * carry a container its jobs reference: that function registers a container
   * per *container-snapshot* entry, and a job's ids are never consulted.
   */
  function restoreOnto(
    target: ReturnType<typeof buildFixture>,
    saved: ReturnType<typeof buildFixture>,
    dropContainerId: string,
  ): void {
    target.containers.loadSnapshot(saved.containers.getSnapshot().filter(([id]) => id !== dropContainerId));
    target.board.loadSnapshot(saved.board.getSnapshot());
    target.workers.loadSnapshot(saved.workers.getSnapshot());
  }

  it('refuses a live job for an unknown destination at the assignment boundary, before it reserves stock or claims a worker', () => {
    const fixture = buildFixture(12, { destination: false });
    const { cellBlock, source, containers, board, workers, adapter, kernel } = fixture;
    source.deposit('item.brick', INITIAL_STOCK);

    // The source is registered and holds enough stock, so the refusal below is
    // about the destination and nothing else. Without this the test would pass
    // just as well against a job that could never have been assigned anyway.
    expect(containers.getById('delivery-bay-0')).toBeDefined();
    expect(source.availableOf('item.brick')).toBe(INITIAL_STOCK);
    expect(containers.getById('storage-0')).toBeUndefined();

    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[0]!);

    board.submitCarryItem(
      { id: 'carry-8', priority: 1, itemId: 'item.brick', quantity: CARRIED, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.canteenTiles[1]! },
      0,
    );

    // One scheduled tick, which is the point: the refusal happens on the pass
    // that would otherwise have assigned the job, not eventually.
    kernel.step();

    const job = board.getById('carry-8');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBe('unknown-destination-container');
    // Refused at the boundary and not at the dropoff: the job never left the
    // pickup leg and never had a worker, which is what separates this from the
    // same reason recorded four legs later.
    expect(job?.leg).toBe('pickup');
    expect(job?.assignedWorkerId).toBeUndefined();
    expect(source.quantityOf('item.brick')).toBe(INITIAL_STOCK); // nothing withdrawn
    expect(source.reservedOf('item.brick')).toBe(0); // nothing claimed
    expect(workers.isBusy(workerId)).toBe(false);
  });

  it('refuses a live job for an unknown source at the same boundary, so neither half of the pair can be removed unnoticed', () => {
    const fixture = buildFixture(12, { source: false });
    const { cellBlock, containers, destination, board, workers, adapter, kernel } = fixture;

    expect(containers.getById('delivery-bay-0')).toBeUndefined();
    expect(containers.getById('storage-0')).toBeDefined();

    const workerId = 1;
    workers.register(workerId);
    adapter.set(workerId, cellBlock.canteenTiles[0]!);

    board.submitCarryItem(
      { id: 'carry-9', priority: 1, itemId: 'item.brick', quantity: CARRIED, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.canteenTiles[1]! },
      0,
    );

    kernel.step();

    const job = board.getById('carry-9');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBe('unknown-source-container');
    expect(job?.assignedWorkerId).toBeUndefined();
    expect(destination.quantityOf('item.brick')).toBe(0); // nothing was created at the far end
    expect(workers.isBusy(workerId)).toBe(false);
  });

  it('fails a restored job whose destination container is gone, returning the stock it had already withdrawn', () => {
    const saved = buildFixture(6);
    saved.source.deposit('item.brick', INITIAL_STOCK);

    const workerId = 1;
    saved.workers.register(workerId);
    saved.adapter.set(workerId, saved.cellBlock.canteenTiles[2]!);

    saved.board.submitCarryItem(
      { id: 'carry-10', priority: 1, itemId: 'item.brick', quantity: CARRIED, sourceContainerId: 'delivery-bay-0', sourceTile: saved.cellBlock.canteenTiles[0]!, destinationContainerId: 'storage-0', destinationTile: saved.cellBlock.cellTiles[0]! },
      0,
    );

    stepUntil(saved, 'carry-10', (job) => job.leg === 'dropoff' && job.state === 'performing');

    // The withdrawal has genuinely committed: the stock has left the source and
    // has arrived nowhere, and the reservation that paid for it is gone. A
    // dropoff-leg test whose job never acquired stock proves nothing.
    expect(saved.source.quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    expect(saved.source.reservedOf('item.brick')).toBe(0);
    expect(saved.destination.quantityOf('item.brick')).toBe(0);
    expect(saved.workers.isBusy(workerId)).toBe(true);

    const restored = buildFixture(6, { destination: false });
    restoreOnto(restored, saved, 'storage-0');
    restored.adapter.set(workerId, restored.cellBlock.cellTiles[0]!);

    // The restored session is in the state the throw was measured from: a job
    // mid-dropoff, holding stock, naming a container this registry does not
    // hold.
    const beforeStep = restored.board.getById('carry-10');
    expect(beforeStep?.state).toBe('performing');
    expect(beforeStep?.leg).toBe('dropoff');
    expect(restored.containers.getById('storage-0')).toBeUndefined();
    expect(restored.containers.require('delivery-bay-0').quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    expect(restored.workers.isBusy(workerId)).toBe(true);

    // No `RangeError` escapes `Kernel.step()`; before #419 this line threw.
    for (let i = 0; i < 50; i += 1) restored.kernel.step();

    const job = restored.board.getById('carry-10');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBe('unknown-destination-container');
    expect(job?.leg).toBe('dropoff');

    // Conservation, against literals: the 4 in the carrier's hands went back to
    // the container they were withdrawn from, so the restored prison holds the
    // 10 it started with and no phantom reservation.
    const restoredSource = restored.containers.require('delivery-bay-0');
    expect(restoredSource.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(restoredSource.reservedOf('item.brick')).toBe(0);
    expect(restoredSource.availableOf('item.brick')).toBe(INITIAL_STOCK);
    // The worker is free again rather than busy forever on a job that ended.
    expect(restored.workers.isBusy(workerId)).toBe(false);
  });

  it('fails a restored job whose source container is gone, on the leg that has not withdrawn anything yet', () => {
    const saved = buildFixture(6);
    saved.source.deposit('item.brick', INITIAL_STOCK);

    const workerId = 1;
    saved.workers.register(workerId);
    saved.adapter.set(workerId, saved.cellBlock.canteenTiles[2]!);

    saved.board.submitCarryItem(
      { id: 'carry-11', priority: 1, itemId: 'item.brick', quantity: CARRIED, sourceContainerId: 'delivery-bay-0', sourceTile: saved.cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: saved.cellBlock.canteenTiles[0]! },
      0,
    );

    stepUntil(saved, 'carry-11', (job) => job.leg === 'pickup' && job.state === 'performing');

    // Mid-pickup: the reservation is held and the stock has not moved. This is
    // the other side of the dropoff case above, and it has nothing to give back
    // but the claim.
    expect(saved.source.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(saved.source.reservedOf('item.brick')).toBe(CARRIED);
    expect(saved.workers.isBusy(workerId)).toBe(true);

    const restored = buildFixture(6, { source: false });
    restoreOnto(restored, saved, 'delivery-bay-0');
    restored.adapter.set(workerId, restored.cellBlock.cellTiles[0]!);

    const beforeStep = restored.board.getById('carry-11');
    expect(beforeStep?.state).toBe('performing');
    expect(beforeStep?.leg).toBe('pickup');
    expect(restored.containers.getById('delivery-bay-0')).toBeUndefined();
    expect(restored.workers.isBusy(workerId)).toBe(true);

    // No `RangeError` escapes `Kernel.step()`; before #419 this threw too, and
    // a restored job is the only way to reach it now that the boundary refuses
    // a live one.
    for (let i = 0; i < 50; i += 1) restored.kernel.step();

    const job = restored.board.getById('carry-11');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBe('unknown-source-container');
    expect(job?.leg).toBe('pickup');
    // Nothing was invented at the far end to stand in for the stock that never
    // left a container this session does not have.
    expect(restored.containers.require('storage-0').quantityOf('item.brick')).toBe(0);
    expect(restored.workers.isBusy(workerId)).toBe(false);
  });
});
