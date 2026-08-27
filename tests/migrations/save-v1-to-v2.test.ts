import { describe, expect, it } from 'vitest';
import {
  SAVE_SCHEMA_VERSION,
  createSaveEnvelope,
  decodeSaveEnvelope,
} from '../../src/persistence/save-schema';
import { estimateSaveEnvelopeByteSize } from '../../src/persistence/size';
import {
  decodeEntityStoreSnapshot,
  encodeEntityStoreSnapshot,
  type EncodedEntityStoreSnapshot,
} from '../../src/persistence/entity-codec';
import { EntityStore, type EntityId } from '../../src/simulation/entity/entity-store';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import type { JsonValue } from '../../src/shared/json';
import freshPrisonFixture from '../fixtures/persistence/save-v1-fresh-prison.json';
import inProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

/**
 * Save-schema V1 -> V2 (#50): the entity-liveness ledger stops being written
 * at the store's allocated capacity and starts being written at its
 * population.
 *
 * The two V1 fixtures under `tests/fixtures/persistence/` are checked in
 * **unchanged** and are the evidence that an existing save still loads. If a
 * change to this codebase ever requires editing one of them, the migration
 * contract has been broken, not the fixture.
 */

const V1_FIXTURES = [
  { name: 'fresh prison (no entities section)', fixture: freshPrisonFixture },
  { name: 'in-progress prison (entities section present)', fixture: inProgressFixture },
];

function entitiesOf(envelope: { readonly payload: { readonly entities?: unknown } }): EncodedEntityStoreSnapshot {
  const entities = envelope.payload.entities;
  if (entities === undefined) throw new Error('Expected the envelope to carry an entities section.');
  return entities as EncodedEntityStoreSnapshot;
}

describe('save-schema V1 -> V2 migration', () => {
  for (const { name, fixture } of V1_FIXTURES) {
    it(`migrates the checked-in V1 "${name}" fixture to the current version`, () => {
      const result = decodeSaveEnvelope(fixture);
      expect(result).toMatchObject({ ok: true, migrated: true });
      if (!result.ok) return;
      expect(result.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
      // Everything outside the entity ledger crosses unchanged.
      expect(result.value.payload.kernel).toEqual(fixture.payload.kernel);
      expect(result.value.payload.construction).toEqual(fixture.payload.construction);
      expect(result.value.revision).toBe(fixture.revision);
      expect(result.value.createdAt).toBe(fixture.createdAt);
      expect(result.value.updatedAt).toBe(fixture.updatedAt);
      expect(result.value.gameVersion).toBe(fixture.gameVersion);
      expect(result.value.prisonId).toBe(fixture.prisonId);
    });

    it(`re-checksums the migrated "${name}" fixture so it decodes again as a current-version save`, () => {
      const migrated = decodeSaveEnvelope(fixture);
      if (!migrated.ok) throw new Error('fixture must migrate for this test to be meaningful');

      // A migrated envelope must be indistinguishable from a natively-written
      // one: same version, self-consistent checksum, and no further migration.
      const again = decodeSaveEnvelope(JSON.parse(JSON.stringify(migrated.value)) as unknown);
      expect(again).toMatchObject({ ok: true, migrated: false });
      if (!again.ok) return;
      expect(again.value).toStrictEqual(migrated.value);
      expect(migrated.value.checksum).toBe(computeSaveChecksum(migrated.value.payload as unknown as JsonValue));
    });
  }

  it('reproduces the V1 fixture’s entity liveness exactly, in the population-shaped encoding', () => {
    const v1Entities = inProgressFixture.payload.entities;
    const result = decodeSaveEnvelope(inProgressFixture);
    if (!result.ok) throw new Error('fixture must migrate for this test to be meaningful');

    const migrated = entitiesOf(result.value);
    expect(migrated.capacity).toBe(v1Entities.capacity);
    expect(migrated.nextAvailableIndex).toBe(v1Entities.nextAvailableIndex);
    expect(migrated.maxActiveIndex).toBe(v1Entities.maxActiveIndex);
    expect(migrated.freeIndices.length).toBe(v1Entities.freeCount);

    const decoded = decodeEntityStoreSnapshot(migrated);
    expect(Array.from(decoded.generations)).toEqual(v1Entities.generations);
    expect(Array.from(decoded.alive)).toEqual(v1Entities.alive);
    expect(decoded.freeCount).toBe(v1Entities.freeCount);

    // The restored store allocates the same number of slots the V1 save had.
    const store = new EntityStore(decoded.capacity);
    expect(() => store.loadSnapshot(decoded)).not.toThrow();
    expect(store.capacity).toBe(v1Entities.capacity);
  });

  it('still rejects a corrupt V1 save, because the checksum is verified at the version it was written', () => {
    // The migration recomputes the checksum (the payload changed), so this is
    // the test that proves corruption detection was not traded away for that:
    // the stored checksum is checked against the payload as written, before
    // any migration step runs.
    const tampered = JSON.parse(JSON.stringify(inProgressFixture)) as { payload: { kernel: { tick: number } } };
    tampered.payload.kernel.tick += 1;
    expect(decodeSaveEnvelope(tampered)).toMatchObject({
      ok: false,
      error: { code: 'checksum-mismatch', atVersion: 1 },
    });
  });

  it('rejects a V1 save whose entity section is tampered with, rather than migrating it', () => {
    const tampered = JSON.parse(JSON.stringify(inProgressFixture)) as {
      payload: { entities: { generations: number[] } };
    };
    tampered.payload.entities.generations[0] = 9;
    expect(decodeSaveEnvelope(tampered)).toMatchObject({ ok: false, error: { code: 'checksum-mismatch' } });
  });

  it('rejects a structurally invalid V1 entity section at its own version', () => {
    const broken = JSON.parse(JSON.stringify(inProgressFixture)) as {
      payload: { entities: { capacity: number } };
    };
    broken.payload.entities.capacity = -1;
    expect(decodeSaveEnvelope(broken)).toMatchObject({ ok: false, error: { code: 'invalid-shape', atVersion: 1 } });
  });

  /**
   * The other end of the same field, and the one that costs something.
   *
   * `capacity` sizes three typed arrays inside `upgradeEntityLiveness` -- 7
   * bytes per slot -- and V1 never required the three arrays to be `capacity`
   * long, so the array set below is *empty* and the allocation happens anyway.
   * Unbounded, a 1.5 KB envelope bought 70 MB of allocation before anything
   * refused it, and `0xffff_ffff` threw `RangeError: Array buffer allocation
   * failed` **out of** `decodeSaveEnvelope`.
   *
   * Both cases are asserted as a *verdict at V1*, which is the whole point:
   * refused before the allocation rather than after it, and refused with a
   * code rather than by throwing. `0xf_ffff` is asserted alongside so this
   * pins a boundary rather than "large numbers are bad" -- it is `INDEX_MASK`,
   * the ceiling `EntityStore`'s own constructor enforces, and V2 has always
   * refused anything above it one step later.
   */
  it('refuses a V1 entity capacity above the entity-index ceiling, before it sizes an allocation', () => {
    const withCapacity = (capacity: number): unknown => {
      const edited = JSON.parse(JSON.stringify(inProgressFixture)) as {
        payload: { entities: { capacity: number; generations: number[]; freeIndices: number[]; alive: number[] } };
      };
      edited.payload.entities.capacity = capacity;
      edited.payload.entities.generations = [];
      edited.payload.entities.freeIndices = [];
      edited.payload.entities.alive = [];
      return edited;
    };

    // Refused at V1 by the schema, so no step ever runs and nothing is sized.
    expect(decodeSaveEnvelope(withCapacity(0x10_0000))).toMatchObject({
      ok: false,
      error: { code: 'invalid-shape', atVersion: 1 },
    });
    expect(decodeSaveEnvelope(withCapacity(10_000_000))).toMatchObject({
      ok: false,
      error: { code: 'invalid-shape', atVersion: 1 },
    });
    expect(decodeSaveEnvelope(withCapacity(0xffff_ffff))).toMatchObject({
      ok: false,
      error: { code: 'invalid-shape', atVersion: 1 },
    });

    // The ceiling itself is not refused by *this* rule: it gets past the
    // capacity bound and is then refused by the checksum, because the arrays
    // were emptied. Anything else here would mean the bound was set wrong.
    expect(decodeSaveEnvelope(withCapacity(0xf_ffff))).toMatchObject({
      ok: false,
      error: { code: 'checksum-mismatch', atVersion: 1 },
    });
  });

  it('shrinks the entity section without losing anything, versus the V1 shape it replaces', () => {
    const v1Bytes = new TextEncoder().encode(JSON.stringify(inProgressFixture.payload.entities)).length;
    const result = decodeSaveEnvelope(inProgressFixture);
    if (!result.ok) throw new Error('fixture must migrate for this test to be meaningful');
    const v2Bytes = new TextEncoder().encode(JSON.stringify(entitiesOf(result.value))).length;

    // Deterministic structural property, not a performance threshold: the V1
    // fixture's store is 8 slots with 2 allocated, so even at this tiny scale
    // the population-shaped form is no larger.
    expect(v2Bytes).toBeLessThanOrEqual(v1Bytes);
    expect(estimateSaveEnvelopeByteSize(result.value)).toBeGreaterThan(0);
  });
});

describe('save/restore round trip preserves entity liveness end to end', () => {
  function buildEnvelope(entities: EncodedEntityStoreSnapshot) {
    const world = new SparseWorld(32);
    world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
    const construction = new ConstructionSystem(world);
    const kernel = new Kernel();
    kernel.registerSystem(construction);

    return createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'prison-liveness',
      revision: 3,
      createdAt: 10,
      updatedAt: 20,
      kernel: kernel.snapshot(),
      world: world.snapshot(),
      construction: construction.snapshot(),
      entities,
    });
  }

  it('keeps valid ids valid, destroyed ids destroyed, and generation counters intact through a real save', () => {
    const store = new EntityStore(5_000);
    const spawned: EntityId[] = [];
    for (let index = 0; index < 30; index += 1) spawned.push(store.spawn());
    const destroyed = [spawned[2]!, spawned[7]!, spawned[11]!];
    for (const id of destroyed) store.destroy(id);
    const recycled = store.spawn(); // reuses index 11 at generation 1

    const envelope = buildEnvelope(encodeEntityStoreSnapshot(store.getSnapshot()));

    // Through storage: serialize, then decode from unknown provenance.
    const decodedEnvelope = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decodedEnvelope).toMatchObject({ ok: true, migrated: false });
    if (!decodedEnvelope.ok) return;

    const snapshot = decodeEntityStoreSnapshot(entitiesOf(decodedEnvelope.value));
    const restored = new EntityStore(snapshot.capacity);
    restored.loadSnapshot(snapshot);

    expect(restored.capacity).toBe(5_000);
    for (const id of spawned) {
      expect(restored.isAlive(id)).toBe(destroyed.includes(id) ? false : true);
    }
    expect(restored.isAlive(recycled)).toBe(true);
    expect(restored.getGeneration(recycled)).toBe(1);

    // The free list survived: the next two spawns recycle the two remaining
    // freed indices, newest first, before extending the high-water mark.
    expect(restored.getIndex(restored.spawn())).toBe(7);
    expect(restored.getIndex(restored.spawn())).toBe(2);
    expect(restored.getIndex(restored.spawn())).toBe(30);
  });

  it('costs the same bytes for a 25-entity prison as the V1 encoding cost for 5,000 empty slots — minus the padding', () => {
    const store = new EntityStore(5_000);
    for (let index = 0; index < 25; index += 1) store.spawn();

    const encoded = encodeEntityStoreSnapshot(store.getSnapshot());
    const v1Shape = {
      capacity: store.capacity,
      nextAvailableIndex: 25,
      maxActiveIndex: 24,
      freeCount: 0,
      generations: Array.from(store.getSnapshot().generations),
      freeIndices: Array.from(store.getSnapshot().freeIndices),
      alive: Array.from(store.getSnapshot().alive),
    };

    const v2Bytes = JSON.stringify(encoded).length;
    const v1Bytes = JSON.stringify(v1Shape).length;
    // The point of #50, as a structural fact rather than a benchmark: the old
    // shape wrote 15,000 array entries for 25 prisoners.
    expect(v1Bytes).toBeGreaterThan(v2Bytes * 100);
  });
});
