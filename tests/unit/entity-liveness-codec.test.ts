import { describe, expect, it } from 'vitest';
import {
  decodeEntityStoreSnapshot,
  encodeEntityStoreSnapshot,
  encodeRunLengths,
  type EncodedEntityStoreSnapshot,
} from '../../src/simulation/entity/entity-codec';
import { EntityStore, type EntityId } from '../../src/simulation/entity/entity-store';

/**
 * The entity-liveness codec (#50): a JSON-safe, population-shaped encoding of
 * `EntityStore`'s ID ledger. The store's in-memory SoA layout is untouched
 * (ADR 0005); only the serialized form changed, so these tests are about
 * fidelity of that form and about it no longer costing one entry per
 * allocated slot.
 */

interface ChurnedStore {
  readonly store: EntityStore;
  readonly live: readonly EntityId[];
  readonly destroyed: readonly EntityId[];
}

/**
 * A store with real churn: spawns, destroys (so generations advance and the
 * free list fills), and respawns (so recycled indices carry a non-zero
 * generation). A store that had only ever spawned would encode to one run and
 * prove far less.
 */
function buildChurnedStore(capacity: number, spawnCount: number): ChurnedStore {
  const store = new EntityStore(capacity);
  const spawned: EntityId[] = [];
  for (let index = 0; index < spawnCount; index += 1) spawned.push(store.spawn());

  const destroyed: EntityId[] = [];
  for (let index = 0; index < spawned.length; index += 3) {
    const id = spawned[index]!;
    store.destroy(id);
    destroyed.push(id);
  }

  const live = spawned.filter((id) => !destroyed.includes(id));
  // Recycle half of the freed indices, so some slots are alive again at a
  // higher generation than the ids that used to occupy them.
  const respawned: EntityId[] = [];
  for (let index = 0; index < Math.floor(destroyed.length / 2); index += 1) respawned.push(store.spawn());

  return { store, live: [...live, ...respawned], destroyed };
}

function restore(encoded: EncodedEntityStoreSnapshot): EntityStore {
  const decoded = decodeEntityStoreSnapshot(encoded);
  const restored = new EntityStore(decoded.capacity);
  restored.loadSnapshot(decoded);
  return restored;
}

describe('run-length encoding', () => {
  it('collapses uniform data and preserves alternating data exactly', () => {
    expect(encodeRunLengths([])).toEqual([]);
    expect(encodeRunLengths([0, 0, 0, 0])).toEqual([[0, 4]]);
    expect(encodeRunLengths([1, 1, 0, 0, 0, 2])).toEqual([
      [1, 2],
      [0, 3],
      [2, 1],
    ]);
    expect(encodeRunLengths([1, 0, 1, 0])).toEqual([
      [1, 1],
      [0, 1],
      [1, 1],
      [0, 1],
    ]);
  });
});

describe('entity liveness codec: round-trip fidelity', () => {
  it('reproduces capacity, generations, the free list and the high-water mark', () => {
    const { store } = buildChurnedStore(64, 20);
    const original = store.getSnapshot();
    const decoded = decodeEntityStoreSnapshot(encodeEntityStoreSnapshot(original));

    expect(decoded.capacity).toBe(original.capacity);
    expect(decoded.nextAvailableIndex).toBe(original.nextAvailableIndex);
    expect(decoded.maxActiveIndex).toBe(original.maxActiveIndex);
    expect(decoded.freeCount).toBe(original.freeCount);
    expect(Array.from(decoded.generations)).toEqual(Array.from(original.generations));
    expect(Array.from(decoded.alive)).toEqual(Array.from(original.alive));
    // The free list is compared over its live prefix: entries above
    // `freeCount` are stack residue that `EntityStore.spawn` can never read,
    // and V2 deliberately does not carry them.
    expect(Array.from(decoded.freeIndices.subarray(0, decoded.freeCount))).toEqual(
      Array.from(original.freeIndices.subarray(0, original.freeCount)),
    );
  });

  it('keeps every id that was valid before the save valid after it, and every destroyed id destroyed', () => {
    const { store, live, destroyed } = buildChurnedStore(64, 20);
    const restored = restore(encodeEntityStoreSnapshot(store.getSnapshot()));

    expect(live.length).toBeGreaterThan(0);
    expect(destroyed.length).toBeGreaterThan(0);
    for (const id of live) expect(restored.isAlive(id)).toBe(true);
    for (const id of destroyed) expect(restored.isAlive(id)).toBe(false);
  });

  it('preserves generation counters, so stale-reference detection still works after a restore', () => {
    const store = new EntityStore(8);
    const first = store.spawn();
    store.destroy(first);
    const second = store.spawn(); // same index, generation 1
    store.destroy(second);
    const third = store.spawn(); // same index, generation 2

    const restored = restore(encodeEntityStoreSnapshot(store.getSnapshot()));

    expect(restored.getIndex(first)).toBe(restored.getIndex(third));
    expect(restored.getGeneration(third)).toBe(2);
    expect(restored.isAlive(third)).toBe(true);
    expect(restored.isAlive(first)).toBe(false);
    expect(restored.isAlive(second)).toBe(false);

    // A stale id must not be able to destroy the live entity occupying its
    // index -- the guarantee generation counters exist for. If the counters
    // had been lost (restored as 0), this call would free index 0.
    restored.destroy(first);
    expect(restored.isAlive(third)).toBe(true);
  });

  it('keeps the free list ordered, so recycling order survives a restore', () => {
    const store = new EntityStore(8);
    const ids = [store.spawn(), store.spawn(), store.spawn(), store.spawn()];
    store.destroy(ids[1]!);
    store.destroy(ids[3]!);
    store.destroy(ids[0]!);

    const restored = restore(encodeEntityStoreSnapshot(store.getSnapshot()));
    // The free list is a stack: last destroyed is recycled first.
    expect(restored.getIndex(restored.spawn())).toBe(0);
    expect(restored.getIndex(restored.spawn())).toBe(3);
    expect(restored.getIndex(restored.spawn())).toBe(1);
    // Then allocation continues from the high-water mark, not from zero.
    expect(restored.getIndex(restored.spawn())).toBe(4);
  });

  it('survives the JSON round trip the worker protocol and a save both perform', () => {
    const { store, live, destroyed } = buildChurnedStore(5_000, 40);
    const encoded = encodeEntityStoreSnapshot(store.getSnapshot());

    const wire = JSON.parse(JSON.stringify(encoded)) as EncodedEntityStoreSnapshot;
    expect(wire).toEqual(encoded);

    const restored = restore(wire);
    for (const id of live) expect(restored.isAlive(id)).toBe(true);
    for (const id of destroyed) expect(restored.isAlive(id)).toBe(false);
  });

  it('round-trips an empty store, including its capacity', () => {
    const store = new EntityStore(5_000);
    const decoded = decodeEntityStoreSnapshot(encodeEntityStoreSnapshot(store.getSnapshot()));
    expect(decoded.capacity).toBe(5_000);
    expect(decoded.maxActiveIndex).toBe(-1);
    expect(decoded.nextAvailableIndex).toBe(0);
    expect(() => new EntityStore(decoded.capacity).loadSnapshot(decoded)).not.toThrow();
  });
});

describe('entity liveness codec: cost follows population, not capacity', () => {
  const encodedSize = (store: EntityStore): number =>
    JSON.stringify(encodeEntityStoreSnapshot(store.getSnapshot())).length;

  it('encodes the same population to the same size regardless of how many slots are allocated', () => {
    // The defect #50 fixed: the old encoding wrote one array entry per
    // allocated slot, so these two differed by ~10x. This is a deterministic
    // structural property of the encoding, not a performance threshold.
    const small = buildChurnedStore(5_000, 25).store;
    const large = buildChurnedStore(50_000, 25).store;

    expect(encodeEntityStoreSnapshot(large.getSnapshot()).generations.length).toBe(
      encodeEntityStoreSnapshot(small.getSnapshot()).generations.length,
    );
    // Only the literal `capacity` digits and one trailing run length differ.
    expect(Math.abs(encodedSize(large) - encodedSize(small))).toBeLessThan(16);
  });

  it('grows with the number of live entities', () => {
    expect(encodedSize(buildChurnedStore(5_000, 400).store)).toBeGreaterThan(
      encodedSize(buildChurnedStore(5_000, 25).store),
    );
  });
});

describe('entity liveness codec: malformed input fails loudly', () => {
  const valid = (): EncodedEntityStoreSnapshot => encodeEntityStoreSnapshot(new EntityStore(8).getSnapshot());

  it('rejects runs that do not cover exactly `capacity` slots', () => {
    expect(() => decodeEntityStoreSnapshot({ ...valid(), generations: [[0, 7]] })).toThrow(RangeError);
    expect(() => decodeEntityStoreSnapshot({ ...valid(), alive: [[0, 9]] })).toThrow(RangeError);
  });

  it('rejects a non-positive run length rather than looping or silently skipping', () => {
    expect(() =>
      decodeEntityStoreSnapshot({ ...valid(), alive: [[0, 0], [0, 8]] }),
    ).toThrow(RangeError);
  });

  it('rejects a free list longer than capacity', () => {
    expect(() =>
      decodeEntityStoreSnapshot({ ...valid(), freeIndices: Array.from({ length: 9 }, (_, index) => index) }),
    ).toThrow(RangeError);
  });
});
