import { describe, expect, it } from 'vitest';
import { Container, ContainerRegistry } from '../../src/simulation/operations/inventory';

describe('Container: transactional reserve/withdraw/deposit', () => {
  it('deposit adds stock; quantityOf/availableOf reflect it', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 10);
    expect(container.quantityOf('item.brick')).toBe(10);
    expect(container.availableOf('item.brick')).toBe(10);
    expect(container.reservedOf('item.brick')).toBe(0);
  });

  it('reserve claims available stock without removing it', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 10);
    const result = container.reserve('item.brick', 4);
    expect(result.ok).toBe(true);
    expect(container.quantityOf('item.brick')).toBe(10); // still on hand
    expect(container.reservedOf('item.brick')).toBe(4);
    expect(container.availableOf('item.brick')).toBe(6);
  });

  it('reserve fails with a structured error when available stock is insufficient', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 3);
    const result = container.reserve('item.brick', 5);
    expect(result).toEqual({ ok: false, error: { kind: 'insufficient-stock', itemId: 'item.brick', available: 3, requested: 5 } });
  });

  it('two reservations cannot both claim the same over-subscribed stock', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 5);
    expect(container.reserve('item.brick', 5).ok).toBe(true);
    expect(container.reserve('item.brick', 1).ok).toBe(false);
  });

  it('withdrawReserved commits: stock actually leaves, reservation clears', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 10);
    container.reserve('item.brick', 4);
    const result = container.withdrawReserved('item.brick', 4);
    expect(result.ok).toBe(true);
    expect(container.quantityOf('item.brick')).toBe(6);
    expect(container.reservedOf('item.brick')).toBe(0);
  });

  it('withdrawReserved fails if the requested quantity exceeds what was actually reserved', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 10);
    container.reserve('item.brick', 2);
    const result = container.withdrawReserved('item.brick', 4);
    expect(result).toEqual({ ok: false, error: { kind: 'insufficient-reserved', itemId: 'item.brick', reserved: 2, requested: 4 } });
    expect(container.quantityOf('item.brick')).toBe(10); // untouched -- no partial withdrawal
  });

  it('releaseReservation frees a claim without withdrawing stock (a cancelled transfer)', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 10);
    container.reserve('item.brick', 4);
    container.releaseReservation('item.brick', 4);
    expect(container.quantityOf('item.brick')).toBe(10);
    expect(container.reservedOf('item.brick')).toBe(0);
    expect(container.availableOf('item.brick')).toBe(10);
  });

  it('releaseReservation clamps at zero rather than going negative', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 10);
    container.reserve('item.brick', 2);
    container.releaseReservation('item.brick', 100);
    expect(container.reservedOf('item.brick')).toBe(0);
  });

  /**
   * **A snapshot is a fixed point of itself**, which is the property
   * `tests/determinism/snapshot-restore-fidelity.test.ts` requires of every
   * subsystem and which this class did not have.
   *
   * `withdrawReserved` writes `stock.set(itemId, 0)` rather than deleting the
   * key, so an emptied item used to keep emitting `[itemId, 0, 0]` -- while
   * `loadSnapshot` writes back only rows with a positive quantity or
   * reservation. `getSnapshot() -> loadSnapshot() -> getSnapshot()` therefore
   * lost the row, silently.
   *
   * **It was latent for as long as the class has existed and was found from
   * the other end**: the determinism scenario's containers only *end* a run
   * empty of an item since
   * [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md) made a carry take
   * a work block to happen, and the fidelity gate then failed on
   * `[["item.brick",0,0]]` against `[]`. That gate is a whole-runtime
   * comparison, so it can only fail while some scenario happens to reach the
   * state; this asserts the property directly, on the two lines that decide
   * it.
   */
  it('is a fixed point of its own snapshot, including for an item emptied to zero', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 4);
    container.reserve('item.brick', 4);
    expect(container.withdrawReserved('item.brick', 4).ok).toBe(true);
    // The state that used to break the round trip: the key is still in `stock`,
    // holding 0. Asserted through the public reading, so this does not depend
    // on the private map.
    expect(container.quantityOf('item.brick')).toBe(0);
    expect(container.reservedOf('item.brick')).toBe(0);

    const once = container.getSnapshot();
    const restored = new Container('c1');
    restored.loadSnapshot(once);
    expect(restored.getSnapshot(), 'the snapshot did not survive its own round trip').toEqual(once);
    // And the row is omitted rather than carried as zeroes, which is the half
    // that makes the two sides agree.
    expect(once).toEqual([]);
  });

  it('snapshot/restore round-trips stock and reservations', () => {
    const container = new Container('c1');
    container.deposit('item.brick', 10);
    container.deposit('item.wood-plank', 5);
    container.reserve('item.brick', 3);

    const snapshot = container.getSnapshot();
    const restored = new Container('c1');
    restored.loadSnapshot(snapshot);

    expect(restored.quantityOf('item.brick')).toBe(10);
    expect(restored.reservedOf('item.brick')).toBe(3);
    expect(restored.quantityOf('item.wood-plank')).toBe(5);
  });
});

describe('ContainerRegistry', () => {
  it('registers, looks up and rejects a duplicate id', () => {
    const registry = new ContainerRegistry();
    registry.register(new Container('storage-0'));
    expect(registry.getById('storage-0')).toBeDefined();
    expect(registry.getById('missing')).toBeUndefined();
    expect(() => registry.register(new Container('storage-0'))).toThrow(/Duplicate container id/);
  });

  it('require throws a clear error for an unknown container', () => {
    const registry = new ContainerRegistry();
    expect(() => registry.require('nope')).toThrow(/Unknown container id/);
  });

  it('all() is sorted by id, independent of registration order', () => {
    const registry = new ContainerRegistry();
    registry.register(new Container('zebra'));
    registry.register(new Container('apple'));
    expect(registry.all().map((c) => c.id)).toEqual(['apple', 'zebra']);
  });

  it('snapshot/restore round-trips every container', () => {
    const registry = new ContainerRegistry();
    const a = new Container('a');
    a.deposit('item.brick', 7);
    registry.register(a);
    registry.register(new Container('b'));

    const snapshot = registry.getSnapshot();
    const restored = new ContainerRegistry();
    restored.register(new Container('a'));
    restored.register(new Container('b'));
    restored.loadSnapshot(snapshot);

    expect(restored.require('a').quantityOf('item.brick')).toBe(7);
  });
});
