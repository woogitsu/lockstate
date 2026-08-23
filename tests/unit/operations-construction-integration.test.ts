import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ConstructionSystem, createBuildOrder } from '../../src/simulation/construction';
import { Container, ContainerMaterialsProvider } from '../../src/simulation/operations/inventory';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';

function buildWorld() {
  const world = new SparseWorld(8);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);
  world.setOwned(chunk, true);
  return world;
}

describe('ConstructionSystem + ContainerMaterialsProvider: issue #25 integration with #16', () => {
  it('stays in materials-pending (not assigned) while the site container lacks the required materials', () => {
    const world = buildWorld();
    const site = new Container('site-0');
    const construction = new ConstructionSystem(world, new ContainerMaterialsProvider(site));
    const kernel = new Kernel();
    kernel.registerSystem(construction);

    construction.submitOrder(createBuildOrder('order-1', 'wall-brick', { x: tileCoordinate(1), y: tileCoordinate(1) }));

    for (let i = 0; i < 30; i += 1) kernel.step();

    const order = construction.getOrder('order-1');
    expect(order?.state).toBe('materials-pending');
    expect(order?.materialsAllocated).toEqual([]);
  });

  it('proceeds to assigned and consumes materials once delivered to the site container', () => {
    const world = buildWorld();
    const site = new Container('site-0');
    const construction = new ConstructionSystem(world, new ContainerMaterialsProvider(site));
    const kernel = new Kernel();
    kernel.registerSystem(construction);

    construction.submitOrder(createBuildOrder('order-1', 'wall-brick', { x: tileCoordinate(1), y: tileCoordinate(1) })); // requires 2x item.brick

    for (let i = 0; i < 20; i += 1) kernel.step();
    expect(construction.getOrder('order-1')?.state).toBe('materials-pending');

    site.deposit('brick', 2); // definition.ts's wall-brick requires itemId 'brick' (its own catalog, independent of src/content/item-catalog.ts's 'item.brick')

    for (let i = 0; i < 30; i += 1) kernel.step();

    const order = construction.getOrder('order-1');
    expect(order?.state).not.toBe('materials-pending');
    expect(order?.materialsAllocated).toEqual([{ itemId: 'brick', quantity: 2 }]);
    expect(site.quantityOf('brick')).toBe(0); // actually consumed, not just checked
  });

  it('never partially allocates when only some of a multi-item requirement is available (all-or-nothing)', () => {
    const site = new Container('site-0');
    // wall-brick only requires one item type in this repo's small representative BUILDABLE_REGISTRY,
    // so exercise ContainerMaterialsProvider's atomicity directly against a synthetic two-item requirement.
    const provider = new ContainerMaterialsProvider(site);
    site.deposit('item.brick', 2); // only one of the two required items is in stock

    const satisfied = provider.tryAllocate([
      { itemId: 'item.brick', quantity: 2 },
      { itemId: 'item.wood-plank', quantity: 1 },
    ]);

    expect(satisfied).toBe(false);
    expect(site.quantityOf('item.brick')).toBe(2); // untouched -- no partial withdrawal happened
  });

  it('the default (no provider given) ConstructionSystem still behaves exactly like #16 -- unlimited materials, unchanged', () => {
    const world = buildWorld();
    const construction = new ConstructionSystem(world); // no provider argument
    const kernel = new Kernel();
    kernel.registerSystem(construction);

    construction.submitOrder(createBuildOrder('order-1', 'wall-brick', { x: tileCoordinate(1), y: tileCoordinate(1) }));
    for (let i = 0; i < 30; i += 1) kernel.step();

    expect(construction.getOrder('order-1')?.state).not.toBe('materials-pending');
    expect(construction.getOrder('order-1')?.materialsAllocated.length).toBeGreaterThan(0);
  });
});
