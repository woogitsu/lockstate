import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openLockstateDatabase, IndexedDbLocalSaveStore } from '../../src/persistence/local/indexeddb-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { createSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { expectOk } from '../helpers/expect-ok';

/**
 * Exercises the real `IndexedDbLocalSaveStore` against `fake-indexeddb` — a
 * pure-JS, dependency-free IndexedDB implementation used only as a
 * devDependency here, not a jsdom/browser test environment. See
 * docs/PERSISTENCE.md ("Local persistence") for why this is scoped
 * narrowly to this one adapter rather than a general browser-test setup.
 *
 * Each test gets its own `IDBFactory` instance (never the shared/global
 * one) so databases never leak state between tests.
 */
function openFreshDatabase() {
  return openLockstateDatabase(new IDBFactory());
}

function buildEnvelope(revision: number): SaveEnvelope {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel(revision, 0);
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'prison-1',
    revision,
    createdAt: 0,
    updatedAt: revision,
    kernel: kernel.snapshot(),
    world: world.snapshot(),
    construction: construction.snapshot(),
  });
}

describe('IndexedDbLocalSaveStore (fake-indexeddb)', () => {
  let db: Awaited<ReturnType<typeof openFreshDatabase>>;

  beforeEach(async () => {
    db = await openFreshDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('creates the prisons, generations and tombstones object stores on first open', () => {
    // `tombstones` joined the two on `DATABASE_VERSION` 1 -> 2 (ADR 0114).
    // Asserted by exact equality rather than by `toContain`, so a store added
    // without a version bump fails here rather than shipping to a player whose
    // browser never runs `onupgradeneeded` for it.
    expect([...db.objectStoreNames].sort()).toEqual(['generations', 'prisons', 'tombstones']);
    expect(db.version).toBe(2);
  });

  it('round-trips prison metadata and generations through real transactions', async () => {
    const repo = new PrisonSaveRepository(new IndexedDbLocalSaveStore(db));

    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0', displayName: 'Cell Block A' });
    const saveResult = await repo.save('prison-1', buildEnvelope(1));
    expectOk(saveResult, 'the first save into real IndexedDB');

    expect(await repo.list()).toMatchObject([{ prisonId: 'prison-1', displayName: 'Cell Block A' }]);

    const loaded = await repo.loadCurrent('prison-1');
    expect(loaded).toMatchObject({ ok: true, outcome: 'current' });
  });

  it('lists slots in ascending prisonId, and the in-memory fake agrees', async () => {
    // `MemoryLocalSaveStore` is what every repository unit test runs against,
    // so an order it invents is an order those tests would pin. IndexedDB's
    // `getAll()` returns records in ascending key order and this store is
    // keyed on `prisonId`; the fake walked its staging `Map` instead, which is
    // put order (#177). This asserts the two agree rather than trusting the
    // comment that says so.
    const real = new PrisonSaveRepository(new IndexedDbLocalSaveStore(db));
    const fake = new PrisonSaveRepository(new MemoryLocalSaveStore());
    for (const prisonId of ['prison-c', 'prison-a', 'prison-b']) {
      await real.create({ prisonId, gameVersion: 'lockstate-0.0.0' });
      await fake.create({ prisonId, gameVersion: 'lockstate-0.0.0' });
    }

    const realOrder = (await real.list()).map((slot) => slot.prisonId);
    expect(realOrder).toEqual(['prison-a', 'prison-b', 'prison-c']);
    expect((await fake.list()).map((slot) => slot.prisonId)).toEqual(realOrder);
  });

  it('reads back a freshly created slot whose current-generation pointer is an explicit undefined', async () => {
    const repo = new PrisonSaveRepository(new IndexedDbLocalSaveStore(db));
    const created = await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    // The one path where the slot-metadata schema (#105 finding 14) meets a
    // real structured-clone round trip rather than the in-memory fake: until
    // the first save the pointer is a key whose value is `undefined`, and a
    // schema that required a string there -- or a clone that dropped the key
    // -- would make a brand-new prison unreadable.
    expect(created.currentGenerationId).toBeUndefined();
    expect(await repo.list()).toEqual([created]);
    expect(await repo.loadCurrent('prison-1')).toEqual({ ok: false, reason: 'no-valid-generation' });
  });

  it('preserves prior good generations atomically across the real transaction boundary', async () => {
    const repo = new PrisonSaveRepository(new IndexedDbLocalSaveStore(db));
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    for (let revision = 1; revision <= 4; revision += 1) {
      // eslint-disable-next-line no-await-in-loop
      await repo.save('prison-1', buildEnvelope(revision));
    }

    const [metadata] = await repo.list();
    expect(metadata?.generationIds).toHaveLength(3); // current + 2 previous, oldest pruned

    const store = new IndexedDbLocalSaveStore(db);
    const firstGenerationId = metadata?.generationIds[0];
    expect(firstGenerationId).toBeDefined();
    const survivingGeneration = await store.runTransaction('readonly', (tx) =>
      tx.getGeneration('prison-1', firstGenerationId as string),
    );
    expect(survivingGeneration).toBeDefined();
  });

  it('recovers from a generation corrupted directly at the storage layer, independent of the in-memory fake', async () => {
    const store = new IndexedDbLocalSaveStore(db);
    const repo = new PrisonSaveRepository(store);
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));
    const secondSave = await repo.save('prison-1', buildEnvelope(2));
    expectOk(secondSave, 'the second save into real IndexedDB');
    const corruptGenerationId = secondSave.ok ? secondSave.generationId : undefined;

    await store.runTransaction('readwrite', async (tx) => {
      await tx.putGeneration('prison-1', corruptGenerationId as string, { not: 'a valid envelope' });
    });

    const recovered = await repo.loadCurrent('prison-1');
    expect(recovered).toMatchObject({ ok: true, outcome: 'recovered-previous' });
  });

  it('persists across separate connections to the same underlying factory', async () => {
    const factory = new IDBFactory();
    const firstConnection = await openLockstateDatabase(factory);
    const repo = new PrisonSaveRepository(new IndexedDbLocalSaveStore(firstConnection));
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));
    firstConnection.close();

    const secondConnection = await openLockstateDatabase(factory);
    const reopenedRepo = new PrisonSaveRepository(new IndexedDbLocalSaveStore(secondConnection));
    const loaded = await reopenedRepo.loadCurrent('prison-1');
    expect(loaded).toMatchObject({ ok: true, outcome: 'current' });
    secondConnection.close();
  });
});

/**
 * The `DATABASE_VERSION` 1 -> 2 upgrade (ADR 0114), against a database that
 * really was created at version 1.
 *
 * `openLockstateDatabase` opens at 2, so a v1 database cannot be produced by
 * calling it -- this builds one the way the shipped build of 2026-09-13 did,
 * with the two stores that existed then and nothing else, writes a prison into
 * it, closes it, and then opens it through the real function. That is the only
 * shape in which the migration's two load-bearing properties can be observed at
 * all:
 *
 * - **forward-only** -- the upgrade adds a store and reads, rewrites and
 *   deletes nothing, so the v1 content is byte-identical afterwards;
 * - **pure** -- the new store starts empty, because nothing could have written
 *   a tombstone under a schema that had nowhere to put one.
 *
 * A test that opened a fresh database at v2 would pass with a migration that
 * wiped every prison on the way through, which is exactly the defect
 * `AGENTS.md` boundary 7 exists to prevent.
 */
describe('DATABASE_VERSION 1 -> 2 (ADR 0114)', () => {
  /** The database exactly as the pre-tombstone build created it. */
  function openVersionOne(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open('lockstate-saves', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('prisons', { keyPath: 'prisonId' });
        database.createObjectStore('generations');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('could not open the v1 database'));
    });
  }

  /** A raw v1 write, because `IndexedDbLocalSaveStore` now opens all three stores. */
  function writeVersionOneRecords(database: IDBDatabase, envelope: SaveEnvelope): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['prisons', 'generations'], 'readwrite');
      tx.objectStore('prisons').put({
        prisonId: 'prison-1',
        gameVersion: 'lockstate-0.0.0',
        displayName: 'Cell Block A',
        currentGenerationId: 'gen-1',
        generationIds: ['gen-1'],
        createdAt: 5,
        updatedAt: 7,
        currentRevision: 1,
      });
      tx.objectStore('generations').put(envelope, 'prison-1:gen-1');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('the v1 seed failed'));
    });
  }

  it('adds the tombstones store and leaves every v1 record untouched', async () => {
    const factory = new IDBFactory();
    const v1 = await openVersionOne(factory);
    expect(v1.version).toBe(1);
    expect([...v1.objectStoreNames].sort()).toEqual(['generations', 'prisons']);
    const envelope = buildEnvelope(1);
    await writeVersionOneRecords(v1, envelope);
    v1.close();

    const upgraded = await openLockstateDatabase(factory);
    expect(upgraded.version).toBe(2);
    expect([...upgraded.objectStoreNames].sort()).toEqual(['generations', 'prisons', 'tombstones']);

    const repo = new PrisonSaveRepository(new IndexedDbLocalSaveStore(upgraded));
    // Forward-only: the slot record is the record v1 wrote, field for field,
    // including the timestamps a rewriting migration would have restamped.
    expect(await repo.list()).toEqual([
      {
        prisonId: 'prison-1',
        gameVersion: 'lockstate-0.0.0',
        displayName: 'Cell Block A',
        currentGenerationId: 'gen-1',
        generationIds: ['gen-1'],
        createdAt: 5,
        updatedAt: 7,
        currentRevision: 1,
      },
    ]);
    // And the generation the slot points at still decodes to the same envelope.
    expect(await repo.loadCurrent('prison-1')).toEqual({
      ok: true,
      envelope,
      generationId: 'gen-1',
      outcome: 'current',
    });
    // Pure: the new store exists and holds nothing, because a v1 build had
    // nowhere to write a tombstone.
    expect(await repo.listTombstones()).toEqual([]);
    upgraded.close();
  });

  it('is idempotent across a second open, so a repeated upgrade is not a failure', async () => {
    const factory = new IDBFactory();
    const first = await openLockstateDatabase(factory);
    first.close();
    const second = await openLockstateDatabase(factory);
    expect(second.version).toBe(2);
    expect([...second.objectStoreNames].sort()).toEqual(['generations', 'prisons', 'tombstones']);
    second.close();
  });

  it('moves a deleted prison into the tombstone store and restores it whole, through real transactions', async () => {
    const factory = new IDBFactory();
    const database = await openLockstateDatabase(factory);
    const repo = new PrisonSaveRepository(new IndexedDbLocalSaveStore(database), { now: () => 10_000 });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0', displayName: 'Cell Block A' });
    await repo.save('prison-1', buildEnvelope(1));
    const [before] = await repo.list();
    const loadedBefore = await repo.loadCurrent('prison-1');

    await repo.delete('prison-1');
    expect(await repo.list()).toEqual([]);
    expect(await repo.listTombstones()).toEqual([
      { prisonId: 'prison-1', displayName: 'Cell Block A', deletedAt: 10_000, expiresAt: 10_000 + 24 * 60 * 60 * 1000 },
    ]);

    expect(await repo.restoreFromTombstone('prison-1')).toEqual({ ok: true, metadata: before });
    expect(await repo.list()).toEqual([before]);
    expect(await repo.loadCurrent('prison-1')).toEqual(loadedBefore);
    expect(await repo.listTombstones()).toEqual([]);
    database.close();
  });
});
