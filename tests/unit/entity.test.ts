import { test, expect, describe } from 'vitest';
import { EntityStore, ComponentBitset, QueryMask, EntityQuery } from '../../src/simulation/entity';

describe('EntityStore', () => {
  test('spawns and recycles entities with generation tracking', () => {
    const store = new EntityStore(100);
    const id1 = store.spawn();
    
    expect(store.isAlive(id1)).toBe(true);
    expect(store.getIndex(id1)).toBe(0);
    expect(store.getGeneration(id1)).toBe(0);

    store.destroy(id1);
    expect(store.isAlive(id1)).toBe(false);

    const id2 = store.spawn();
    // Should recycle index 0, generation 1
    expect(store.getIndex(id2)).toBe(0);
    expect(store.getGeneration(id2)).toBe(1);
    expect(store.isAlive(id2)).toBe(true);

    // id1 is definitely dead
    expect(store.isAlive(id1)).toBe(false);
  });

  test('prevents double destroy', () => {
    const store = new EntityStore(100);
    const id1 = store.spawn();
    store.destroy(id1);
    store.destroy(id1); // Should not crash or increment free list twice

    const id2 = store.spawn();
    const id3 = store.spawn();
    
    expect(store.getIndex(id2)).toBe(0);
    expect(store.getIndex(id3)).toBe(1);
  });
});

describe('EntityQuery', () => {
  test('iterates entities deterministically regardless of spawn order', () => {
    const store = new EntityStore(10);
    const bitset = new ComponentBitset(10);

    const e1 = store.spawn();
    const e2 = store.spawn();
    const e3 = store.spawn();

    bitset.add(store.getIndex(e1), 1);
    bitset.add(store.getIndex(e2), 1);
    bitset.add(store.getIndex(e3), 1);

    store.destroy(e2); // destroys index 1
    // We must clear the component mask for index 1, usually done by the destroy system
    bitset.clear(store.getIndex(e2));

    const e4 = store.spawn(); // recycles index 1
    bitset.add(store.getIndex(e4), 1);

    // Active indices are 0, 1, 2. The order should be 0, 1, 2 (e1, e4, e3)
    const query = new EntityQuery(store, bitset);
    query.mask.require(1);

    const results = query.execute();
    expect(results).toEqual([e1, e4, e3]);
  });
  
  test('requires all components in the mask', () => {
    const store = new EntityStore(10);
    const bitset = new ComponentBitset(10);

    const e1 = store.spawn();
    bitset.add(store.getIndex(e1), 0);
    bitset.add(store.getIndex(e1), 1);

    const e2 = store.spawn();
    bitset.add(store.getIndex(e2), 0);

    const query = new EntityQuery(store, bitset);
    query.mask.require(0).require(1);

    const results = query.execute();
    expect(results).toEqual([e1]);
  });
});
