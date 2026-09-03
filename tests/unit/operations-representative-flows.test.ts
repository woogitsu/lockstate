import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ConstructionSystem, createBuildOrder } from '../../src/simulation/construction';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import type { TilePosition } from '../../src/simulation/world/coordinates';
import { Container, ContainerMaterialsProvider, ContainerRegistry } from '../../src/simulation/operations/inventory';
import { JobBoard } from '../../src/simulation/operations/job';
import { CarryJobExecutor } from '../../src/simulation/operations/carry-executor';
import { CarryCrew } from '../helpers/carry-executor-harness';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';

/**
 * Issue #25's "representative flows prove extensibility; definitions
 * remain data-driven" and Definition of Done's "construction and daily
 * operations share the same substrate" -- both proven in one scenario:
 * a two-hop food supply chain (delivery bay -> storage -> kitchen) and a
 * construction order's material delivery run concurrently through the
 * identical `JobBoard`/`ContainerRegistry`/`CarryJobExecutor` substrate,
 * not two parallel implementations.
 */
describe('representative operations flow: delivery -> storage -> kitchen, sharing the substrate with construction', () => {
  it('moves food through two hops and completes a construction order via the same job/inventory substrate', () => {
    const cellBlock = buildCellBlockFixture(10);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const containers = new ContainerRegistry();
    const deliveryBay = new Container('delivery-bay-0');
    const storage = new Container('storage-0');
    const kitchen = new Container('kitchen-0');
    const constructionSite = new Container('construction-site-0');
    containers.register(deliveryBay);
    containers.register(storage);
    containers.register(kitchen);
    containers.register(constructionSite);

    const board = new JobBoard();
    const executor = new CarryJobExecutor(board, containers);
    // Three carriers: one per concurrent hop/order, deterministic and simple to
    // reason about. `CarryCrew` plays the caller `prisoners.actions` is in a
    // real session -- see its header for what that does and does not cover.
    const crew = new CarryCrew(executor, [1, 2, 3]);

    const construction = new ConstructionSystem(cellBlock.world, new ContainerMaterialsProvider(constructionSite));

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(construction);

    deliveryBay.deposit('item.food-ration', 20);

    board.submitCarryItem(
      { id: 'delivery-to-storage', priority: 2, itemId: 'item.food-ration', quantity: 20, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'storage-0', destinationTile: cellBlock.cellTiles[1]! },
      0,
    );
    board.submitCarryItem(
      { id: 'storage-to-kitchen', priority: 1, itemId: 'item.food-ration', quantity: 20, sourceContainerId: 'storage-0', sourceTile: cellBlock.cellTiles[1]!, destinationContainerId: 'kitchen-0', destinationTile: cellBlock.cellTiles[2]! },
      0,
    );
    board.submitCarryItem(
      { id: 'deliver-bricks', priority: 3, itemId: 'item.brick', quantity: 2, sourceContainerId: 'delivery-bay-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'construction-site-0', destinationTile: cellBlock.cellTiles[3]! },
      0,
    );
    deliveryBay.deposit('item.brick', 2);

    // Must land within the fixture's loaded chunk area (a narrow 3-row band, y=0..2 -- see
    // buildCellBlockFixture) or ConstructionSystem.submitOrder fails the order immediately as out-of-bounds.
    construction.submitOrder(createBuildOrder('wall-1', 'wall-brick', cellBlock.corridorTiles[5]!));

    // storage-to-kitchen cannot start until delivery-to-storage actually deposits (it
    // has no stock at tick 0); it must genuinely wait, not race ahead on faith.
    expect(board.getById('storage-to-kitchen')?.state).toBe('available');

    crew.run(20);
    for (let i = 0; i < 100; i += 1) kernel.step();

    expect(board.getById('delivery-to-storage')?.state).toBe('completed');
    expect(board.getById('storage-to-kitchen')?.state).toBe('completed');
    expect(board.getById('deliver-bricks')?.state).toBe('completed');

    expect(kitchen.quantityOf('item.food-ration')).toBe(20);
    expect(storage.quantityOf('item.food-ration')).toBe(0); // passed through, not accumulated
    expect(deliveryBay.quantityOf('item.food-ration')).toBe(0);

    expect(constructionSite.quantityOf('item.brick')).toBe(0); // consumed by the construction order
    expect(construction.getOrder('wall-1')?.state).not.toBe('materials-pending');
    expect(construction.getOrder('wall-1')?.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);
  });
});

/**
 * Issue #25 acceptance criteria explicitly names laundry and waste as
 * representative flows, not just delivery/storage/kitchen. Nothing in
 * `operations/` is specific to food -- `JobBoard`/`Container`/`CarryJobExecutor`
 * are generic over `itemId`, so proving these two flows is a matter of
 * exercising the *same* substrate with `item.dirty-linen`/`item.clean-linen`
 * and `item.waste` (from `src/content/item-catalog.ts`), not new production
 * code. That genericity is the point: it is what "representative flows
 * prove extensibility; definitions remain data-driven" (architecture notes)
 * means in practice.
 */
describe('representative operations flow: laundry (cell -> laundry -> clean storage)', () => {
  it('carries dirty linen to the laundry then clean linen onward to storage, through the same substrate', () => {
    const cellBlock = buildCellBlockFixture(10);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const containers = new ContainerRegistry();
    const cellHamper = new Container('cell-hamper-0');
    const laundry = new Container('laundry-0');
    const cleanStorage = new Container('clean-linen-storage-0');
    containers.register(cellHamper);
    containers.register(laundry);
    containers.register(cleanStorage);

    const board = new JobBoard();
    const executor = new CarryJobExecutor(board, containers);
    const crew = new CarryCrew(executor, [1]);

    cellHamper.deposit('item.dirty-linen', 8);
    // The laundry itself turns dirty stock into clean stock -- a session/
    // regime concern outside this substrate's scope, so the test performs
    // that conversion directly once the dirty leg lands, exactly like a
    // kitchen "cooking" step would sit outside a food-delivery carry job.
    board.submitCarryItem(
      { id: 'cell-to-laundry', priority: 1, itemId: 'item.dirty-linen', quantity: 8, sourceContainerId: 'cell-hamper-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'laundry-0', destinationTile: cellBlock.cellTiles[1]! },
      0,
    );

    expect(crew.runUntil(() => board.getById('cell-to-laundry')?.state === 'completed')).toBe(true);
    expect(board.getById('cell-to-laundry')?.state).toBe('completed');
    expect(laundry.quantityOf('item.dirty-linen')).toBe(8);

    // Washing (dirty stock -> clean stock) is a session/regime concern
    // outside this substrate's scope -- the test performs that conversion
    // directly via the same reserve -> withdraw transactional pair
    // `Container` requires for any stock removal (its only removal path,
    // by design -- "auditable to prevent duplication/loss"), exactly like
    // a kitchen "cooking" step sits outside a food-delivery carry job.
    expect(laundry.reserve('item.dirty-linen', 8).ok).toBe(true);
    expect(laundry.withdrawReserved('item.dirty-linen', 8).ok).toBe(true);
    expect(laundry.quantityOf('item.dirty-linen')).toBe(0);
    laundry.deposit('item.clean-linen', 8);
    board.submitCarryItem(
      { id: 'laundry-to-storage', priority: 1, itemId: 'item.clean-linen', quantity: 8, sourceContainerId: 'laundry-0', sourceTile: cellBlock.cellTiles[1]!, destinationContainerId: 'clean-linen-storage-0', destinationTile: cellBlock.cellTiles[2]! },
      1,
    );
    crew.run(5);

    expect(board.getById('laundry-to-storage')?.state).toBe('completed');
    expect(cellHamper.quantityOf('item.dirty-linen')).toBe(0);
    expect(laundry.quantityOf('item.dirty-linen')).toBe(0);
    expect(cleanStorage.quantityOf('item.clean-linen')).toBe(8);
  });
});

describe('representative operations flow: waste (cell -> collection -> disposal)', () => {
  it('carries waste from a cell to a collection point through the same substrate, released consistently on cancellation', () => {
    const cellBlock = buildCellBlockFixture(10);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const containers = new ContainerRegistry();
    const cellBin = new Container('cell-bin-0');
    const disposal = new Container('waste-disposal-0');
    containers.register(cellBin);
    containers.register(disposal);

    const board = new JobBoard();
    const executor = new CarryJobExecutor(board, containers);
    const crew = new CarryCrew(executor, [1]);

    cellBin.deposit('item.waste', 5);

    board.submitCarryItem(
      { id: 'cancelled-collection', priority: 1, itemId: 'item.waste', quantity: 5, sourceContainerId: 'cell-bin-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'waste-disposal-0', destinationTile: cellBlock.cellTiles[1]! },
      0,
    );
    // One cycle is enough to reserve and assign (`claimAvailableJobFor` does
    // both) -- cancelling immediately after proves reservations release even
    // when a job never leaves the pickup leg, consistent with issue #25's
    // "cancellation/failure releases reservations consistently" criterion.
    crew.step();
    expect(cellBin.reservedOf('item.waste')).toBe(5);
    expect(executor.cancel('cancelled-collection')).toBe(true);
    expect(cellBin.reservedOf('item.waste')).toBe(0);
    expect(cellBin.quantityOf('item.waste')).toBe(5); // never withdrawn

    board.submitCarryItem(
      { id: 'real-collection', priority: 1, itemId: 'item.waste', quantity: 5, sourceContainerId: 'cell-bin-0', sourceTile: cellBlock.cellTiles[0]!, destinationContainerId: 'waste-disposal-0', destinationTile: cellBlock.cellTiles[1]! },
      1,
    );
    crew.run(5);

    expect(board.getById('real-collection')?.state).toBe('completed');
    expect(disposal.quantityOf('item.waste')).toBe(5);
    expect(cellBin.quantityOf('item.waste')).toBe(0);
  });
});
