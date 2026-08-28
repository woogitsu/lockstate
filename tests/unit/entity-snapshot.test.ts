import { test, expect } from 'vitest';
import { EntityStore, ComponentBitset, TransformComponent } from '../../src/simulation/entity';

test('snapshots and restores entity store and components', () => {
  const store = new EntityStore(10);
  const bitset = new ComponentBitset(10);
  const transform = new TransformComponent(10);

  const e1 = store.spawn();
  const e2 = store.spawn();

  store.destroy(e1);
  const e3 = store.spawn(); // e3 reuses index 0

  bitset.add(store.getIndex(e3), 1);
  transform.x[store.getIndex(e3)] = 100;
  transform.y[store.getIndex(e3)] = 200;

  bitset.add(store.getIndex(e2), 1);
  transform.x[store.getIndex(e2)] = 50;
  transform.y[store.getIndex(e2)] = 50;

  const storeSnapshot = store.getSnapshot();
  const bitsetSnapshot = bitset.getSnapshot();
  const transformSnapshot = transform.getSnapshot();

  const store2 = new EntityStore(10);
  const bitset2 = new ComponentBitset(10);
  const transform2 = new TransformComponent(10);

  store2.loadSnapshot(storeSnapshot);
  bitset2.loadSnapshot(bitsetSnapshot);
  transform2.loadSnapshot(transformSnapshot);

  expect(store2.isAlive(e1)).toBe(false);
  expect(store2.isAlive(e2)).toBe(true);
  expect(store2.isAlive(e3)).toBe(true);

  expect(bitset2.has(store2.getIndex(e3), 1)).toBe(true);
  expect(transform2.x[store2.getIndex(e3)]).toBe(100);
  expect(transform2.y[store2.getIndex(e3)]).toBe(200);

  expect(store2.maxActiveIndex).toBe(store.maxActiveIndex);
});

/**
 * #433: the snapshot's `capacity` is a fact about the build that wrote the
 * save -- the length of the array the slots were written into -- and stopped
 * being a precondition for loading it. What has to fit is the **written
 * prefix**.
 *
 * Every case below asserts on the entity ids themselves rather than on a
 * population count, because the id is the thing a different capacity could
 * plausibly move: `packEntityId` folds the slot index into it, so an index
 * re-homed by one would renumber every entity the save carries, and ADR 0005
 * and ADR 0026 both hang on it not doing that.
 */
test('loads a ledger written at a smaller capacity, keeping every entity id', () => {
  const written = new EntityStore(8);
  const first = written.spawn();
  const second = written.spawn();
  written.destroy(first);
  const recycled = written.spawn(); // index 0 again, generation 1

  // The ids the writing build issued, named here rather than read back from
  // the store the assertions run against.
  expect([second, recycled]).toEqual([1, 0x0010_0000]);

  const restored = new EntityStore(5_000);
  restored.loadSnapshot(written.getSnapshot());

  expect(restored.isAlive(second)).toBe(true);
  expect(restored.isAlive(recycled)).toBe(true);
  expect(restored.getIdByIndex(0)).toBe(0x0010_0000);
  expect(restored.getIdByIndex(1)).toBe(1);
  expect(restored.maxActiveIndex).toBe(1);
  // And the store is still usable: the next spawn continues the writing
  // build's allocation rather than colliding with it.
  expect(restored.spawn()).toBe(2);
});

test('loads a ledger written at a larger capacity when its written prefix fits', () => {
  const written = new EntityStore(5_000);
  const first = written.spawn();
  const second = written.spawn();
  expect([first, second]).toEqual([0, 1]);

  const restored = new EntityStore(8);
  restored.loadSnapshot(written.getSnapshot());

  expect(restored.isAlive(first)).toBe(true);
  expect(restored.isAlive(second)).toBe(true);
  expect(restored.getIdByIndex(1)).toBe(1);
  expect(restored.spawn()).toBe(2);
});

test('refuses a ledger whose written prefix does not fit, naming both numbers', () => {
  const written = new EntityStore(64);
  for (let i = 0; i < 12; i += 1) written.spawn();

  const tooSmall = new EntityStore(8);
  expect(() => tooSmall.loadSnapshot(written.getSnapshot())).toThrow(
    'Cannot load an entity snapshot: it has 12 written slots and this store has capacity for 8.',
  );
});

test('clears the slots above a shorter ledger rather than leaving the previous one behind', () => {
  const store = new EntityStore(16);
  const stale = new EntityStore(16);
  for (let i = 0; i < 10; i += 1) stale.spawn();
  store.loadSnapshot(stale.getSnapshot());
  expect(store.isIndexAlive(9)).toBe(true);

  const written = new EntityStore(3);
  const only = written.spawn();
  store.loadSnapshot(written.getSnapshot());

  expect(store.isAlive(only)).toBe(true);
  expect(store.isIndexAlive(9)).toBe(false);
  expect(store.getIdByIndex(1)).toBe(1); // generation 0, not the stale ledger's
});
