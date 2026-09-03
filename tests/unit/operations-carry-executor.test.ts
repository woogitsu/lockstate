import { describe, expect, it } from 'vitest';
import { CarryJobExecutor } from '../../src/simulation/operations/carry-executor';
import { Container, ContainerRegistry } from '../../src/simulation/operations/inventory';
import { JobBoard } from '../../src/simulation/operations/job';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { CarryCrew } from '../helpers/carry-executor-harness';

/**
 * **What a carry does to stock**, which is the whole of what `operations/`
 * decides about one since
 * [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md).
 *
 * ## What moved, and what did not
 *
 * This file was `operations-job-system.test.ts` and it drove a `Kernel`, a
 * `NavigationSystem`, a `JobWorkerPool` and a fake worker adapter, because the
 * retired system did matching, both legs' routes, the dwell and the inventory
 * transfer inside one `update`. ADR 0093 decision 4 retired it: the walk is
 * `prisoners.actions`' on both legs, and the executor is what is left.
 *
 * **The conservation pins did not change and were not rewritten.** ADR 0093
 * says of this file that they *"move with the code rather than being
 * rewritten"*, and every literal below -- 10 initial, 4 carried, 6 while
 * carried, 3 foreign, 7 available -- is the literal the old file compared
 * against. What changed is who is asked: `executor.pickUp` / `executor.dropOff`
 * / `executor.failJob` / `executor.cancel` instead of several hundred
 * `kernel.step()`s.
 *
 * **What this file no longer covers, said plainly rather than implied.** There
 * is no route here, so nothing below says anything about arrival timing, about
 * a door locked under a carrier, or about geometry. Those are the walk's, and
 * they are covered where the walk is:
 * `tests/foundation/two-authorities-one-prisoner-contract.test.ts` and
 * `tests/foundation/job-production-contract.test.ts` build a real prison
 * through `Kernel.submitCommand` and let a real prisoner carry a real
 * delivery. A route failure reaches the executor as one call --
 * `failJob(job, reason)` -- and that call is what is exercised here.
 *
 * Every quantity compared against below is a literal written here, never a
 * value read back out of a container the production code just wrote
 * (`docs/TESTING.md`).
 */

const SOURCE_ID = 'delivery-bay-0';
const DESTINATION_ID = 'storage-0';
const WORKER = 1;

const SOURCE_TILE = { x: tileCoordinate(2), y: tileCoordinate(6) };
const DESTINATION_TILE = { x: tileCoordinate(9), y: tileCoordinate(9) };

/** A route failure, in the navigation vocabulary the executor records verbatim. */
const ROUTE_DENIED = 'permission-denied' as const;

/**
 * `registered` leaves a container out of the `ContainerRegistry` while the job
 * still names its id -- the state a save reaches when its container snapshot
 * does not carry every container its jobs reference, and the one #419 measured
 * the `RangeError` from. Both default to registered, so every fixture built
 * before this parameter existed is unchanged.
 */
function buildFixture(registered: { readonly source?: boolean; readonly destination?: boolean } = {}) {
  const containers = new ContainerRegistry();
  const source = new Container(SOURCE_ID);
  const destination = new Container(DESTINATION_ID);
  if (registered.source !== false) containers.register(source);
  if (registered.destination !== false) containers.register(destination);

  const board = new JobBoard();
  const executor = new CarryJobExecutor(board, containers);
  const crew = new CarryCrew(executor, [WORKER]);

  return { containers, source, destination, board, executor, crew };
}

function submit(board: JobBoard, id: string, quantity: number, priority = 1): void {
  board.submitCarryItem(
    {
      id,
      priority,
      itemId: 'item.brick',
      quantity,
      sourceContainerId: SOURCE_ID,
      sourceTile: SOURCE_TILE,
      destinationContainerId: DESTINATION_ID,
      destinationTile: DESTINATION_TILE,
    },
    0,
  );
}

describe('CarryJobExecutor: the carry-item lifecycle end to end', () => {
  it('moves an item from source to destination via reserve -> pickup -> dropoff', () => {
    const { source, destination, board, crew } = buildFixture();
    source.deposit('item.brick', 10);
    submit(board, 'carry-1', 4);
    expect(board.getById('carry-1')?.state).toBe('available');

    crew.run(3);

    expect(board.getById('carry-1')?.state).toBe('completed');
    expect(destination.quantityOf('item.brick')).toBe(4);
    expect(source.quantityOf('item.brick')).toBe(6);
    expect(source.reservedOf('item.brick')).toBe(0);
    // The board is the authority on busyness now, and it has forgotten this
    // carrier: `JobWorkerPool.isBusy` was the old reading of the same fact, on a
    // class ADR 0093 deleted and which no longer exists.
    expect(crew.isBusy(WORKER)).toBe(false);
  });

  it('stays available (backpressure, not failure) while the source has insufficient stock, then completes once stock arrives', () => {
    const { source, destination, board, crew } = buildFixture();
    // No deposit yet -- job cannot reserve.
    submit(board, 'carry-2', 4);

    crew.run(5);
    expect(board.getById('carry-2')?.state).toBe('available');
    expect(crew.isBusy(WORKER)).toBe(false); // never claimed a carrier while blocked

    source.deposit('item.brick', 10);
    crew.run(3);

    expect(board.getById('carry-2')?.state).toBe('completed');
    expect(destination.quantityOf('item.brick')).toBe(4);
  });

  it('claims the higher-priority job first, and only one carrier per job', () => {
    const { source, board, executor } = buildFixture();
    source.deposit('item.brick', 10);
    submit(board, 'carry-low', 1, 1);
    submit(board, 'carry-high', 1, 9);

    // `availableJobsSorted` is priority descending then id ascending, so the
    // higher priority wins however the two were submitted.
    expect(executor.claimAvailableJobFor(1)?.id).toBe('carry-high');
    expect(executor.claimAvailableJobFor(2)?.id).toBe('carry-low');
    // A third carrier finds nothing: both jobs are assigned, and an assigned
    // job is not `available`.
    expect(executor.claimAvailableJobFor(3)).toBeUndefined();
    expect(board.activeJobFor(1)?.id).toBe('carry-high');
    expect(board.activeJobFor(2)?.id).toBe('carry-low');
  });

  it('fails the job and releases the reservation when the route is refused on the pickup leg', () => {
    const { source, board, executor, crew } = buildFixture();
    source.deposit('item.brick', 10);
    submit(board, 'carry-3', 4);

    // Claimed, so the reservation is genuinely held -- without this the release
    // below would be a release of nothing.
    crew.step();
    expect(source.reservedOf('item.brick')).toBe(4);
    const job = board.getById('carry-3')!;
    expect(job.leg).toBe('pickup');

    executor.failJob(job, ROUTE_DENIED);

    expect(board.getById('carry-3')?.state).toBe('failed');
    expect(board.getById('carry-3')?.failReason).toBe(ROUTE_DENIED);
    expect(source.reservedOf('item.brick')).toBe(0); // released, not stuck reserved forever
    expect(source.quantityOf('item.brick')).toBe(10); // never withdrawn
    expect(crew.isBusy(WORKER)).toBe(false);
  });

  it('cancel() on a still-available job (no reservation yet) does not corrupt another job\'s real reservation for the same item', () => {
    const { source, board, executor } = buildFixture();
    source.deposit('item.brick', 5);

    // A real reservation belonging to something else, on the same item.
    source.reserve('item.brick', 5);

    submit(board, 'carry-4', 1);
    // Cannot reserve -- all 5 are already reserved by the other claim.
    expect(executor.claimAvailableJobFor(WORKER)).toBeUndefined();
    expect(board.getById('carry-4')?.state).toBe('available');

    expect(executor.cancel('carry-4')).toBe(true);
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
describe('CarryJobExecutor: a job ended on the dropoff leg conserves the stock it is carrying', () => {
  const INITIAL_STOCK = 10;
  const CARRIED = 4;
  const STOCK_WHILE_CARRIED = 6; // INITIAL_STOCK - CARRIED, stated rather than computed by the code under test

  /** Claims and picks up, then asserts the carrier really is holding goods. */
  function carryingOnDropoffLeg(fixture: ReturnType<typeof buildFixture>, jobId: string) {
    const { crew, board } = fixture;
    expect(crew.runUntil(() => board.getById(jobId)?.leg === 'dropoff')).toBe(true);
    const job = board.getById(jobId)!;
    expect(job.state).toBe('assigned');
    return job;
  }

  it('returns the carried stock to its source container when the dropoff leg\'s route fails', () => {
    const fixture = buildFixture();
    const { source, destination, board, executor, crew } = fixture;
    source.deposit('item.brick', INITIAL_STOCK);
    submit(board, 'carry-5', CARRIED);

    const job = carryingOnDropoffLeg(fixture, 'carry-5');
    // The carrier is genuinely holding goods: the stock has left the source and
    // has not arrived anywhere.
    expect(source.quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    expect(source.reservedOf('item.brick')).toBe(0); // consumed by the withdrawal, so there is no reservation left to release
    expect(destination.quantityOf('item.brick')).toBe(0);

    executor.failJob(job, ROUTE_DENIED);

    expect(board.getById('carry-5')?.state).toBe('failed');
    expect(board.getById('carry-5')?.leg).toBe('dropoff');
    expect(board.getById('carry-5')?.failReason).toBe(ROUTE_DENIED);

    // Conservation: nothing was created and nothing was destroyed.
    expect(source.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(destination.quantityOf('item.brick')).toBe(0);
    expect(source.quantityOf('item.brick') + destination.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(source.reservedOf('item.brick')).toBe(0); // returned as stock, not as a phantom reservation
    expect(crew.isBusy(WORKER)).toBe(false);
  });

  it('returns the carried stock to its source container when the job is cancelled on the dropoff leg', () => {
    const fixture = buildFixture();
    const { source, destination, board, executor, crew } = fixture;
    source.deposit('item.brick', INITIAL_STOCK);
    submit(board, 'carry-6', CARRIED);

    carryingOnDropoffLeg(fixture, 'carry-6');
    expect(source.quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    expect(source.reservedOf('item.brick')).toBe(0);
    expect(destination.quantityOf('item.brick')).toBe(0);

    expect(executor.cancel('carry-6')).toBe(true);
    expect(board.getById('carry-6')?.state).toBe('cancelled');

    expect(source.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(destination.quantityOf('item.brick')).toBe(0);
    expect(source.quantityOf('item.brick') + destination.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(source.reservedOf('item.brick')).toBe(0);
    expect(crew.isBusy(WORKER)).toBe(false);
  });

  it('returning carried stock does not disturb another job\'s live reservation for the same item', () => {
    // `Container` tracks reservations per *item*, not per job, so compensating
    // a dropoff-leg job by releasing a reservation it no longer holds would
    // steal a different job's. The stock has to come back as stock.
    const fixture = buildFixture();
    const { source, destination, board, executor } = fixture;
    source.deposit('item.brick', INITIAL_STOCK);

    const FOREIGN_RESERVATION = 3;
    source.reserve('item.brick', FOREIGN_RESERVATION); // another job's legitimate, already-made claim on the same item
    submit(board, 'carry-7', CARRIED);

    carryingOnDropoffLeg(fixture, 'carry-7');
    expect(source.quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    expect(source.reservedOf('item.brick')).toBe(FOREIGN_RESERVATION); // only the other job's claim survives the withdrawal
    expect(destination.quantityOf('item.brick')).toBe(0);

    expect(executor.cancel('carry-7')).toBe(true);

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
 * `ContainerRegistry.require` throws `RangeError`, and the old dwell handler
 * called it on both legs. The dropoff call is the one that matters most,
 * because it runs *after* `withdrawReserved` has committed: the throw escaped
 * `Kernel.step()` with the source container already debited and the goods in
 * the carrier's hands, so one unregistered id ended the session and took the
 * stock with it.
 *
 * Two routes reach it and each is covered on its own, because one test cannot
 * stand for both: a **live** job is refused at the claim boundary before it
 * reserves anything, and a **restored** job never passes through that boundary
 * at all -- `JobBoard.loadSnapshot` puts it back at the state it was saved in
 * -- so the boundary check cannot see it and the leg has to resolve leniently.
 *
 * Every quantity compared against below is a literal written here, never a
 * value read back out of a container the production code just wrote.
 */
describe('CarryJobExecutor: a container id the registry does not hold fails the job instead of throwing', () => {
  const INITIAL_STOCK = 10;
  const CARRIED = 4;
  const STOCK_WHILE_CARRIED = 6; // INITIAL_STOCK - CARRIED, stated rather than computed by the code under test

  it('refuses a live job for an unknown destination at the claim boundary, before it reserves stock or claims a carrier', () => {
    const { containers, source, board, executor, crew } = buildFixture({ destination: false });
    source.deposit('item.brick', INITIAL_STOCK);

    // The source is registered and holds enough stock, so the refusal below is
    // about the destination and nothing else.
    expect(containers.getById(SOURCE_ID)).toBeDefined();
    expect(source.availableOf('item.brick')).toBe(INITIAL_STOCK);
    expect(containers.getById(DESTINATION_ID)).toBeUndefined();

    submit(board, 'carry-8', CARRIED);
    // One claim attempt, which is the point: the refusal happens on the pass
    // that would otherwise have assigned the job, not eventually.
    expect(executor.claimAvailableJobFor(WORKER)).toBeUndefined();

    const job = board.getById('carry-8');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBe('unknown-destination-container');
    // Refused at the boundary and not at the dropoff: the job never left the
    // pickup leg and never had a carrier, which is what separates this from the
    // same reason recorded two legs later.
    expect(job?.leg).toBe('pickup');
    expect(job?.assignedWorkerId).toBeUndefined();
    expect(source.quantityOf('item.brick')).toBe(INITIAL_STOCK); // nothing withdrawn
    expect(source.reservedOf('item.brick')).toBe(0); // nothing claimed
    expect(crew.isBusy(WORKER)).toBe(false);
  });

  it('refuses a live job for an unknown source at the same boundary, so neither half of the pair can be removed unnoticed', () => {
    const { containers, destination, board, executor, crew } = buildFixture({ source: false });

    expect(containers.getById(SOURCE_ID)).toBeUndefined();
    expect(containers.getById(DESTINATION_ID)).toBeDefined();

    submit(board, 'carry-9', CARRIED);
    expect(executor.claimAvailableJobFor(WORKER)).toBeUndefined();

    const job = board.getById('carry-9');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBe('unknown-source-container');
    expect(job?.assignedWorkerId).toBeUndefined();
    expect(destination.quantityOf('item.brick')).toBe(0); // nothing was created at the far end
    expect(crew.isBusy(WORKER)).toBe(false);
  });

  it('fails a restored job whose destination container is gone, returning the stock it had already withdrawn', () => {
    const saved = buildFixture();
    saved.source.deposit('item.brick', INITIAL_STOCK);
    submit(saved.board, 'carry-10', CARRIED);
    expect(saved.crew.runUntil(() => saved.board.getById('carry-10')?.leg === 'dropoff')).toBe(true);

    // The withdrawal has genuinely committed: the stock has left the source and
    // has arrived nowhere, and the reservation that paid for it is gone.
    expect(saved.source.quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    expect(saved.source.reservedOf('item.brick')).toBe(0);
    expect(saved.destination.quantityOf('item.brick')).toBe(0);
    expect(saved.crew.isBusy(WORKER)).toBe(true);

    // A save whose container snapshot does not carry a container its jobs
    // reference: `restoreSessionSystems` registers a container per
    // container-snapshot entry and a job's ids are never consulted.
    const restored = buildFixture({ destination: false });
    restored.containers.loadSnapshot(saved.containers.getSnapshot().filter(([id]) => id !== DESTINATION_ID));
    restored.board.loadSnapshot(saved.board.getSnapshot());

    const beforeStep = restored.board.getById('carry-10');
    expect(beforeStep?.leg).toBe('dropoff');
    expect(restored.containers.getById(DESTINATION_ID)).toBeUndefined();
    expect(restored.containers.require(SOURCE_ID).quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
    // The worker index round-tripped: the board rebuilt it from
    // `assignedWorkerId` rather than the save carrying it (ADR 0093 decision 5).
    expect(restored.crew.isBusy(WORKER)).toBe(true);

    // No `RangeError`; before #419 this threw out of the tick.
    restored.crew.step();

    const job = restored.board.getById('carry-10');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBe('unknown-destination-container');
    expect(job?.leg).toBe('dropoff');

    // Conservation, against literals: the 4 in the carrier's hands went back to
    // the container they were withdrawn from, so the restored prison holds the
    // 10 it started with and no phantom reservation.
    const restoredSource = restored.containers.require(SOURCE_ID);
    expect(restoredSource.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(restoredSource.reservedOf('item.brick')).toBe(0);
    expect(restoredSource.availableOf('item.brick')).toBe(INITIAL_STOCK);
    // The carrier is free again rather than busy forever on a job that ended.
    expect(restored.crew.isBusy(WORKER)).toBe(false);
  });

  it('fails a restored job whose source container is gone, on the leg that has not withdrawn anything yet', () => {
    const saved = buildFixture();
    saved.source.deposit('item.brick', INITIAL_STOCK);
    submit(saved.board, 'carry-11', CARRIED);
    // Claimed only: mid-pickup, the reservation is held and the stock has not
    // moved. This is the other side of the dropoff case above, and it has
    // nothing to give back but the claim.
    saved.crew.step();
    expect(saved.source.quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(saved.source.reservedOf('item.brick')).toBe(CARRIED);
    expect(saved.crew.isBusy(WORKER)).toBe(true);

    const restored = buildFixture({ source: false });
    restored.containers.loadSnapshot(saved.containers.getSnapshot().filter(([id]) => id !== SOURCE_ID));
    restored.board.loadSnapshot(saved.board.getSnapshot());

    const beforeStep = restored.board.getById('carry-11');
    expect(beforeStep?.leg).toBe('pickup');
    expect(restored.containers.getById(SOURCE_ID)).toBeUndefined();
    expect(restored.crew.isBusy(WORKER)).toBe(true);

    restored.crew.step();

    const job = restored.board.getById('carry-11');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBe('unknown-source-container');
    expect(job?.leg).toBe('pickup');
    // Nothing was invented at the far end to stand in for the stock that never
    // left a container this session does not have.
    expect(restored.containers.require(DESTINATION_ID).quantityOf('item.brick')).toBe(0);
    expect(restored.crew.isBusy(WORKER)).toBe(false);
  });

  it('fails a restored job whose carrier is not in this session, and gives the goods back', () => {
    // ADR 0093 decision 5's other direction: a job assigned to an id that no
    // longer names a living prisoner would sit `'assigned'` for the rest of the
    // session holding a reservation nothing would release.
    const saved = buildFixture();
    saved.source.deposit('item.brick', INITIAL_STOCK);
    submit(saved.board, 'carry-12', CARRIED);
    expect(saved.crew.runUntil(() => saved.board.getById('carry-12')?.leg === 'dropoff')).toBe(true);
    expect(saved.source.quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);

    const restored = buildFixture();
    restored.containers.loadSnapshot(saved.containers.getSnapshot());
    restored.board.loadSnapshot(saved.board.getSnapshot());

    // Nobody in this session is that carrier.
    expect(restored.executor.reconcileRestoredJobs(() => false)).toBe(1);

    const job = restored.board.getById('carry-12');
    expect(job?.state).toBe('failed');
    expect(job?.failReason).toBe('carrier-departed');
    expect(restored.containers.require(SOURCE_ID).quantityOf('item.brick')).toBe(INITIAL_STOCK);
    expect(restored.containers.require(SOURCE_ID).reservedOf('item.brick')).toBe(0);
    expect(restored.containers.require(DESTINATION_ID).quantityOf('item.brick')).toBe(0);
    expect(restored.crew.isBusy(WORKER)).toBe(false);
  });

  it('leaves a restored job alone when its carrier is still in this session', () => {
    // The control for the test above: without it, a `reconcileRestoredJobs`
    // that failed every job would pass it.
    const saved = buildFixture();
    saved.source.deposit('item.brick', INITIAL_STOCK);
    submit(saved.board, 'carry-13', CARRIED);
    expect(saved.crew.runUntil(() => saved.board.getById('carry-13')?.leg === 'dropoff')).toBe(true);

    const restored = buildFixture();
    restored.containers.loadSnapshot(saved.containers.getSnapshot());
    restored.board.loadSnapshot(saved.board.getSnapshot());

    expect(restored.executor.reconcileRestoredJobs(() => true)).toBe(0);
    expect(restored.board.getById('carry-13')?.state).toBe('assigned');
    expect(restored.crew.isBusy(WORKER)).toBe(true);

    // And it finishes: the goods complete the journey they were on when the
    // save was taken, which is what the restore rule is for.
    restored.crew.step();
    expect(restored.board.getById('carry-13')?.state).toBe('completed');
    expect(restored.containers.require(DESTINATION_ID).quantityOf('item.brick')).toBe(CARRIED);
    expect(restored.containers.require(SOURCE_ID).quantityOf('item.brick')).toBe(STOCK_WHILE_CARRIED);
  });
});
