import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openLockstateDatabase, IndexedDbLocalSaveStore } from '../../src/persistence/local/indexeddb-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { createSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';

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

  it('creates the prisons and generations object stores on first open', () => {
    expect([...db.objectStoreNames].sort()).toEqual(['generations', 'prisons']);
  });

  it('round-trips prison metadata and generations through real transactions', async () => {
    const repo = new PrisonSaveRepository(new IndexedDbLocalSaveStore(db));

    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0', displayName: 'Cell Block A' });
    const saveResult = await repo.save('prison-1', buildEnvelope(1));
    expect(saveResult.ok).toBe(true);

    expect(await repo.list()).toMatchObject([{ prisonId: 'prison-1', displayName: 'Cell Block A' }]);

    const loaded = await repo.loadCurrent('prison-1');
    expect(loaded).toMatchObject({ ok: true, outcome: 'current' });
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
    expect(secondSave.ok).toBe(true);
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
