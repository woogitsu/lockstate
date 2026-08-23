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
