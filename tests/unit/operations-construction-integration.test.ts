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

    site.deposit('item.brick', 2); // the item-catalog id wall-brick requires, checked at import by validateBuildableItemReferences

    for (let i = 0; i < 30; i += 1) kernel.step();

    const order = construction.getOrder('order-1');
    expect(order?.state).not.toBe('materials-pending');
    expect(order?.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);
    expect(site.quantityOf('item.brick')).toBe(0); // actually consumed, not just checked
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

  it('does not accept repeated requirements whose combined quantity exceeds stock', () => {
    const site = new Container('site-0');
    const provider = new ContainerMaterialsProvider(site);
    site.deposit('item.brick', 3);

    expect(provider.tryAllocate([
      { itemId: 'item.brick', quantity: 2 },
      { itemId: 'item.brick', quantity: 2 },
    ])).toBe(false);
    expect(site.quantityOf('item.brick')).toBe(3);
    expect(site.reservedOf('item.brick')).toBe(0);

    site.deposit('item.brick', 1);
    expect(provider.tryAllocate([
      { itemId: 'item.brick', quantity: 2 },
      { itemId: 'item.brick', quantity: 2 },
    ])).toBe(true);
    expect(site.quantityOf('item.brick')).toBe(0);
    expect(site.reservedOf('item.brick')).toBe(0);
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

/**
 * A cancelled order gives its materials back.
 *
 * This only became observable when materials became finite. While
 * `UNLIMITED_MATERIALS_PROVIDER` was the default, `cancelOrder`'s
 * `// TODO: release materials` cost nothing. Against a real container, an
 * undo -- which `undo()` performs by calling `cancelOrder` -- destroyed
 * stock permanently, so ordinary play walked a prison toward an unbuildable
 * state with no feedback of any kind.
 *
 * **The heading is narrower than it reads since the owner's ruling 20 of
 * 2026-08-31, and it is kept because every fixture below is a
 * `ConstructionSystem` with no economy behind it -- which is exactly the case
 * the ruling leaves alone.** ADR 0076's amendment of that date has a
 * cancellation give back **money** for an order in `'assigned'` and **nothing**
 * for one in `'in-progress'`; a bare `ConstructionSystem` has no treasury to
 * pay anybody from, so the first of those falls back to the release this file
 * measures. The second does not fall back, because it is not about money: the
 * materials are consumed by the works whoever is keeping accounts, and the
 * `'in-progress'` case below is rewritten rather than kept.
 */
describe('cancelling a build order returns the materials it consumed', () => {
  function siteWithOrder(bricks: number) {
    const world = buildWorld();
    const site = new Container('site-0');
    site.deposit('item.brick', bricks);
    const construction = new ConstructionSystem(world, new ContainerMaterialsProvider(site));
    const kernel = new Kernel();
    kernel.registerSystem(construction);
    return { construction, kernel, site, world };
  }

  it('refunds an order cancelled after it allocated and before the crew started', () => {
    /*
     * **This case cancelled an `'in-progress'` order until 2026-08-31 and now
     * cancels an `'assigned'` one, and the change is the owner's ruling 20
     * rather than a fixture preference.** *"Pieniądze dopóki ekipa nie
     * zaczęła"* -- until the crew has started -- draws the line between those
     * two states, and the sibling case below is where the other side of it is
     * measured. What this one still measures is unchanged: a cancellation
     * before the crew starts puts the materials back where a bare
     * `ConstructionSystem` can spend them again.
     *
     * It waits for the state rather than counting ticks, because the state is
     * the thing the ruling is about and a literal tick count would encode the
     * construction schedule twice.
     */
    const { construction, kernel, site } = siteWithOrder(2);
    construction.submitOrder(createBuildOrder('order-1', 'wall-brick', { x: tileCoordinate(1), y: tileCoordinate(1) }));

    for (let i = 0; i < 200 && construction.getOrder('order-1')?.state !== 'assigned'; i += 1) kernel.step();
    expect(construction.getOrder('order-1')?.state, 'the crew must not have started yet').toBe('assigned');
    expect(site.quantityOf('item.brick')).toBe(0); // the order really took them

    construction.cancelOrder('order-1');

    expect(site.quantityOf('item.brick')).toBe(2);
    expect(construction.getOrder('order-1')?.materialsAllocated).toEqual([]);
    // The refund is spendable, not just a number: a second order can be built from it.
    construction.submitOrder(createBuildOrder('order-2', 'wall-brick', { x: tileCoordinate(2), y: tileCoordinate(2) }));
    for (let i = 0; i < 200; i += 1) kernel.step();
    expect(construction.getOrder('order-2')?.state).toBe('completed');
  });

  it('gives nothing back for an order the crew had already started, whatever the substrate', () => {
    /*
     * The other side of ruling 20's line, and the one branch of `cancelOrder`
     * that is **not** conditional on an economy being wired: an
     * `'in-progress'` order's materials went into the works, so they are
     * dropped unreleased and unpaid whether or not anybody is keeping
     * accounts. Before the ruling this returned the two bricks, and the case
     * above is where that assertion moved to.
     *
     * The second order is what makes it a measurement rather than a reading of
     * one counter: with the bricks gone there is nothing to build it from, and
     * it parks in `'materials-pending'` for ever.
     */
    const { construction, kernel, site } = siteWithOrder(2);
    construction.submitOrder(createBuildOrder('order-1', 'wall-brick', { x: tileCoordinate(1), y: tileCoordinate(1) }));

    for (let i = 0; i < 200 && construction.getOrder('order-1')?.state !== 'in-progress'; i += 1) kernel.step();
    expect(construction.getOrder('order-1')?.state).toBe('in-progress');

    construction.cancelOrder('order-1');

    expect(site.quantityOf('item.brick'), 'the crew had started, so the bricks are gone').toBe(0);
    expect(construction.getOrder('order-1')?.materialsAllocated).toEqual([]);

    construction.submitOrder(createBuildOrder('order-2', 'wall-brick', { x: tileCoordinate(2), y: tileCoordinate(2) }));
    for (let i = 0; i < 200; i += 1) kernel.step();
    expect(construction.getOrder('order-2')?.state, 'and there is nothing left to build with').toBe('materials-pending');
  });

  it('gives nothing back for an order cancelled after it completed, and nothing for one that never allocated', () => {
    /*
     * **This case was called `refunds an order cancelled after it completed,
     * and does not refund one that never allocated` and it asserted two bricks
     * back on the shelf.** The owner's ruling of 2026-09-01 -- *"Taking a
     * finished object away returns nothing. Not its materials, not its
     * money."*, ADR 0076's amendment of that date -- reverses ADR 0076
     * decision B's sentence, and this is one of the sentences that promised the
     * old behaviour.
     *
     * **It is the branch that is not conditional on an economy**, exactly as
     * the `'in-progress'` case above is not: this site has a container and no
     * procurement sink, so before the ruling it took the `hadGeometry` arm of
     * `cancelOrder` and released. Now the two consumed states share one arm and
     * neither asks whether anybody is keeping accounts -- the materials went
     * into works that are being un-built either way.
     *
     * The second half of the case is untouched: an order that never allocated
     * still has nothing to give back, and cancelling it must not manufacture
     * any. Both halves now read zero, which is why the first half also asserts
     * the wall came down -- without it, "nothing came back" would be satisfied
     * by a cancellation that did nothing at all.
     */
    const { construction, kernel, site, world } = siteWithOrder(2);
    construction.submitOrder(createBuildOrder('order-1', 'wall-brick', { x: tileCoordinate(1), y: tileCoordinate(1) }));
    for (let i = 0; i < 200; i += 1) kernel.step();
    expect(construction.getOrder('order-1')?.state).toBe('completed');
    expect(world.getTopEdge({ x: tileCoordinate(1), y: tileCoordinate(1) }), 'the wall must really exist').toBeGreaterThan(0);

    construction.cancelOrder('order-1');
    expect(site.quantityOf('item.brick'), 'the wall took its bricks with it').toBe(0);
    expect(construction.getOrder('order-1')?.materialsAllocated).toEqual([]);
    expect(world.getTopEdge({ x: tileCoordinate(1), y: tileCoordinate(1) }), 'and the wall still came down').toBe(0);

    // An order that is still waiting for materials holds none, so cancelling
    // it must not manufacture any. **The parenthetical here used to read
    // "order-2 took the only two bricks" and it is now the shelf being empty
    // that parks order-3**: the first wall consumed them, so neither of these
    // two can allocate at all. The property under test is the same one -- a
    // cancellation with nothing allocated behind it puts nothing back -- and it
    // is reached one state earlier.
    construction.submitOrder(createBuildOrder('order-2', 'wall-brick', { x: tileCoordinate(3), y: tileCoordinate(3) }));
    construction.submitOrder(createBuildOrder('order-3', 'wall-brick', { x: tileCoordinate(4), y: tileCoordinate(4) }));
    for (let i = 0; i < 30; i += 1) kernel.step();
    expect(construction.getOrder('order-3')?.state).toBe('materials-pending');
    expect(construction.getOrder('order-3')?.materialsAllocated, 'it is holding nothing').toEqual([]);
    construction.cancelOrder('order-3');
    expect(site.quantityOf('item.brick')).toBe(0);
  });

  it('undo refunds nothing, and a redone order cannot build at all without more materials', () => {
    /*
     * **This case was called `undo refunds, and a redone order pays again
     * rather than building for free`, and its middle assertion read
     * `expect(site.quantityOf('item.brick')).toBe(2)` after the undo.** The
     * owner's ruling of 2026-09-01 withdraws that: undoing a finished wall
     * returns nothing, so there is nothing for the redo to spend.
     *
     * **What the old name was reaching for is still measured and is now
     * sharper.** *"Pays again rather than building for free"* was the guard
     * against `redo` finding a stale allocation and building twice off one
     * purchase. `redo` still does not restore an allocation, and with the
     * shelf now empty the redone order cannot even reach `'assigned'`: it
     * parks in `'materials-pending'`, which is a stronger statement than
     * "it paid again" and needs no second purchase to make it.
     *
     * A bare `ConstructionSystem` over a container has no treasury, so
     * "paying" is not a thing this fixture can observe at all --
     * `tests/integration/economy-money-conservation.test.ts`'s
     * `makes an undo and a redo of a finished wall cost two walls` is where the
     * money half of the same sequence is measured, through a real session.
     */
    const { construction, kernel, site } = siteWithOrder(2);
    construction.submitOrder(createBuildOrder('order-1', 'wall-brick', { x: tileCoordinate(1), y: tileCoordinate(1) }));
    construction.registerTransactionOrder('order-1', 'txn-1');
    for (let i = 0; i < 200; i += 1) kernel.step();
    expect(construction.getOrder('order-1')?.state).toBe('completed');
    expect(site.quantityOf('item.brick')).toBe(0);

    construction.undo();
    expect(construction.getOrder('order-1')?.state).toBe('cancelled');
    expect(site.quantityOf('item.brick'), 'undo returns nothing').toBe(0);
    expect(construction.getOrder('order-1')?.materialsAllocated).toEqual([]);

    construction.redo();
    for (let i = 0; i < 200; i += 1) kernel.step();
    expect(
      construction.getOrder('order-1')?.state,
      'the redone order has nothing to build with, and redo restored no allocation for it to find',
    ).toBe('materials-pending');
    expect(site.quantityOf('item.brick')).toBe(0);

    // The redo is not broken, only unfunded: put two bricks back on the shelf
    // by hand and the same order finishes, which is what says the parking above
    // is about materials and not about `redo` having lost the order.
    site.deposit('item.brick', 2);
    for (let i = 0; i < 200; i += 1) kernel.step();
    expect(construction.getOrder('order-1')?.state).toBe('completed');
    expect(site.quantityOf('item.brick')).toBe(0);
  });

  it('the unlimited provider still refunds nothing anywhere', () => {
    const world = buildWorld();
    const construction = new ConstructionSystem(world); // UNLIMITED_MATERIALS_PROVIDER
    const kernel = new Kernel();
    kernel.registerSystem(construction);

    construction.submitOrder(createBuildOrder('order-1', 'wall-brick', { x: tileCoordinate(1), y: tileCoordinate(1) }));
    for (let i = 0; i < 200; i += 1) kernel.step();
    expect(() => construction.cancelOrder('order-1')).not.toThrow();
    expect(construction.getOrder('order-1')?.materialsAllocated).toEqual([]);
  });
});
