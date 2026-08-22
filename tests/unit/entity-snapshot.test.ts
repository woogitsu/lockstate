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
