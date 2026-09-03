import { describe, expect, it } from 'vitest';
import { CarryJobExecutor } from '../../src/simulation/operations/carry-executor';
import { Container, ContainerRegistry } from '../../src/simulation/operations/inventory';
import { JobBoard } from '../../src/simulation/operations/job';
import { UtilityNetwork } from '../../src/simulation/operations/utility-network';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { CarryCrew } from '../helpers/carry-executor-harness';

const SOURCE_TILE = { x: tileCoordinate(2), y: tileCoordinate(6) };
const DESTINATION_TILE = { x: tileCoordinate(9), y: tileCoordinate(9) };

/**
 * Issue #25's "snapshot/restore preserves queues, reservations, inventories
 * and networks" acceptance criterion, proven together rather than only
 * per-class: a job is interrupted mid-`'travelling'` (a path request live
 * against the *old* `NavigationSystem` instance), a container holds an
 * active reservation, a second job sits queued behind a busy worker, and a
 * utility network has a failed node -- all snapshotted, then restored into
 * entirely fresh `JobBoard`/`ContainerRegistry`/`CarryJobExecutor` instances
 * (the only realistic restore scenario -- a loaded save never reuses the old
 * process's live objects).
 *
 * **The interruption is now mid-*leg* rather than mid-`'travelling'`**
 * ([ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md) decisions 4 and 5).
 * A job's `'travelling'` state belonged to `JobSystem`, which owned the route;
 * the walk is `prisoners.actions`' now and a job stays `'assigned'` for its
 * whole active life, with `leg` saying where the goods are. So what is
 * interrupted and restored here is a carrier holding withdrawn stock on its
 * drop-off leg, which is the state that can actually lose goods -- and the
 * **worker index is rebuilt from `assignedWorkerId`** rather than carried by
 * the save, which is the derived-not-persisted property decision 5 states.
 * The whole-session round trip through a real save envelope is
 * `tests/integration/session-save-round-trip.test.ts`.
 */
describe('operations snapshot/restore: jobs, reservations, inventories and utility networks together', () => {
  it('resumes an interrupted job, preserves carrier assignment, container reservations and utility state after a full restore', () => {
    const containers = new ContainerRegistry();
    const source = new Container('delivery-bay-0');
    const destination = new Container('storage-0');
    containers.register(source);
    containers.register(destination);
    source.deposit('item.brick', 20);

    const board = new JobBoard();
    const executor = new CarryJobExecutor(board, containers);
    const workerId = 1;
    const crew = new CarryCrew(executor, [workerId]);

    board.submitCarryItem(
      { id: 'carry-1', priority: 2, itemId: 'item.brick', quantity: 4, sourceContainerId: 'delivery-bay-0', sourceTile: SOURCE_TILE, destinationContainerId: 'storage-0', destinationTile: DESTINATION_TILE },
      0,
    );
    // A second carrier-eligible job, still queued behind the only carrier --
    // exercises "queues" surviving restore, not just the in-flight job.
    board.submitCarryItem(
      { id: 'carry-2', priority: 1, itemId: 'item.brick', quantity: 3, sourceContainerId: 'delivery-bay-0', sourceTile: SOURCE_TILE, destinationContainerId: 'storage-0', destinationTile: DESTINATION_TILE },
      0,
    );

    const electricity = new UtilityNetwork('electricity');
    electricity.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 10 });
    electricity.addNode({ id: 'load-0', kind: 'consumer', capacityOrDemand: 5 });
    electricity.connect('generator-0', 'load-0');
    electricity.setFailed('generator-0', true);
    expect(electricity.evaluate().states.get('load-0')).toBe('disabled-no-supply');

    // Advance one cycle only, so carry-1 is claimed and holding its pickup-leg
    // reservation with nothing withdrawn -- the state that proves the restore
    // path rather than a completed-job replay.
    crew.step();
    expect(board.getById('carry-1')?.state).toBe('assigned');
    expect(board.getById('carry-1')?.leg).toBe('pickup');
    expect(source.reservedOf('item.brick')).toBe(4); // carry-1's pickup-leg reservation
    expect(crew.isBusy(workerId)).toBe(true);
    expect(board.getById('carry-2')?.state).toBe('available'); // still queued -- only one carrier

    const jobsSnapshot = board.getSnapshot();
    const containersSnapshot = containers.getSnapshot();
    const electricitySnapshot = electricity.getSnapshot();

    // A restore never reuses the interrupted process's live objects -- a fresh
    // board, registry and executor, exactly like loading a save.
    const restoredContainers = new ContainerRegistry();
    restoredContainers.register(new Container('delivery-bay-0'));
    restoredContainers.register(new Container('storage-0'));
    restoredContainers.loadSnapshot(containersSnapshot);

    const restoredBoard = new JobBoard();
    restoredBoard.loadSnapshot(jobsSnapshot);
    const restoredExecutor = new CarryJobExecutor(restoredBoard, restoredContainers);
    const restoredCrew = new CarryCrew(restoredExecutor, [workerId]);
    // The carrier's last-known tile is session/entity state, restored
    // independently (`PrisonerOperationsRuntime.position`), and there is no
    // worker pool to restore: `operations.jobWorkers` is written empty and
    // ignored (ADR 0093 decision 5).

    const restoredElectricity = new UtilityNetwork('electricity');
    restoredElectricity.loadSnapshot(electricitySnapshot);

    expect(restoredBoard.getById('carry-1')?.state).toBe('assigned');
    expect(restoredBoard.getById('carry-1')?.leg).toBe('pickup');
    expect(restoredBoard.getById('carry-1')?.pathRequestId).toBeUndefined();
    // Reservations, the carrier assignment and the still-queued job all
    // round-tripped -- and the assignment came back **derived**, rebuilt from
    // `assignedWorkerId` by `JobBoard.loadSnapshot` rather than carried by the
    // save.
    expect(restoredContainers.require('delivery-bay-0').reservedOf('item.brick')).toBe(4);
    expect(restoredCrew.isBusy(workerId)).toBe(true);
    expect(restoredCrew.jobOf(workerId)?.id).toBe('carry-1');
    expect(restoredBoard.getById('carry-2')?.state).toBe('available');
    expect(restoredElectricity.evaluate().states.get('generator-0')).toBe('disabled-failure');
    expect(restoredElectricity.evaluate().states.get('load-0')).toBe('disabled-no-supply');

    // carry-2 cannot be picked up until the carrier frees up by finishing
    // carry-1 -- two effectively sequential round trips on one carrier, so
    // more headroom than a single-job test needs.
    restoredCrew.run(20);

    expect(restoredBoard.getById('carry-1')?.state).toBe('completed');
    expect(restoredBoard.getById('carry-2')?.state).toBe('completed');
    expect(restoredContainers.require('storage-0').quantityOf('item.brick')).toBe(7); // 4 + 3, no duplication or loss across the restore boundary
    expect(restoredContainers.require('delivery-bay-0').quantityOf('item.brick')).toBe(13);
    expect(restoredContainers.require('delivery-bay-0').reservedOf('item.brick')).toBe(0);
    expect(restoredCrew.isBusy(workerId)).toBe(false);
  });
});
