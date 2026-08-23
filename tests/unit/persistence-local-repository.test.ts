import { describe, expect, it } from 'vitest';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { createSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';

function buildEnvelope(revision: number, tick = revision): SaveEnvelope {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel(tick, 0);
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

function idSequence(prefix: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

describe('PrisonSaveRepository: CRUD', () => {
  it('creates, lists and deletes prison slots', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { now: () => 1000 });
    const created = await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0', displayName: 'Cell Block A' });
    expect(created).toMatchObject({ prisonId: 'prison-1', currentGenerationId: undefined, generationIds: [] });

    expect(await repo.list()).toEqual([created]);

    await repo.delete('prison-1');
    expect(await repo.list()).toEqual([]);
  });

  it('refuses to create a prison that already exists', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await expect(repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' })).rejects.toThrow();
  });

  it('deleting an unknown prison is a no-op', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    await expect(repo.delete('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('PrisonSaveRepository: save() and generation retention', () => {
  it('writes a new generation and advances the current pointer', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    const result = await repo.save('prison-1', buildEnvelope(1));
    expect(result).toEqual({ ok: true, generationId: 'gen-1' });

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
  });

  it('retains at least two previous safe generations by default and prunes older ones', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    for (let revision = 1; revision <= 4; revision += 1) {
      // eslint-disable-next-line no-await-in-loop
      await repo.save('prison-1', buildEnvelope(revision));
    }

    const [metadata] = await repo.list();
    expect(metadata?.generationIds).toEqual(['gen-2', 'gen-3', 'gen-4']); // gen-1 pruned; current + 2 previous kept
    expect(metadata?.currentGenerationId).toBe('gen-4');

    // The pruned generation is actually gone, not just unreferenced.
    const pruned = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-1'));
    expect(pruned).toBeUndefined();
  });

  it('refuses to persist an envelope that fails schema/checksum validation', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    const tampered: SaveEnvelope = { ...buildEnvelope(1), checksum: '0000000000000000' };
    const result = await repo.save('prison-1', tampered);
    expect(result.ok).toBe(false);

    const [metadata] = await repo.list();
    expect(metadata?.currentGenerationId).toBeUndefined();
  });

  // #49: the write path validates by provenance, not by a caller-supplied
  // flag. An envelope this process built is written as-is; anything that
  // crossed a serialization boundary is re-decoded, which is observable
  // because a full decode necessarily produces a fresh parsed value.
  it('writes an in-process envelope as-is and re-validates one that crossed a serialization boundary', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    const trusted = buildEnvelope(1);
    expect(await repo.save('prison-1', trusted)).toEqual({ ok: true, generationId: 'gen-1' });
    const storedTrusted = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-1'));
    expect(storedTrusted).toBe(trusted);

    const untrusted = JSON.parse(JSON.stringify(buildEnvelope(2))) as SaveEnvelope;
    expect(await repo.save('prison-1', untrusted)).toEqual({ ok: true, generationId: 'gen-2' });
    const storedUntrusted = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-2'));
    expect(storedUntrusted).not.toBe(untrusted);
    expect(storedUntrusted).toEqual(untrusted);
  });

  it('refuses an envelope tampered with after it left this process', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    const tampered = JSON.parse(JSON.stringify(buildEnvelope(1))) as { payload: { kernel: { tick: number } } };
    tampered.payload.kernel.tick += 1; // checksum now covers a payload that no longer exists

    const result = await repo.save('prison-1', tampered as unknown as SaveEnvelope);
    expect(result.ok).toBe(false);

    const [metadata] = await repo.list();
    expect(metadata?.currentGenerationId).toBeUndefined();
  });

  it('reports a classified, durable failure without corrupting existing state when the store write fails', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));

    store.failNextWrite = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    const result = await repo.save('prison-1', buildEnvelope(2));
    expect(result).toMatchObject({ ok: false, error: { code: 'quota-exceeded' } });

    // The prior good generation must survive a failed write.
    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
  });
});

describe('PrisonSaveRepository: loadCurrent recovery', () => {
  it('reports not-found for an unknown prison', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    expect(await repo.loadCurrent('nope')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('loads the current generation on the happy path', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));

    const result = await repo.loadCurrent('prison-1');
    expect(result).toMatchObject({ ok: true, generationId: 'gen-1', outcome: 'current' });
  });

  it('recovers to the newest valid previous generation when the current one is corrupt, and heals the pointer', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1)); // gen-1: good
    await repo.save('prison-1', buildEnvelope(2)); // gen-2: will corrupt

    // Simulate corruption directly at the storage layer (below repository validation).
    await store.runTransaction('readwrite', async (tx) => {
      await tx.putGeneration('prison-1', 'gen-2', { not: 'a valid envelope' });
    });

    const result = await repo.loadCurrent('prison-1');
    expect(result).toMatchObject({ ok: true, generationId: 'gen-1', outcome: 'recovered-previous' });

    // The pointer is healed so a second load does not re-scan.
    const second = await repo.loadCurrent('prison-1');
    expect(second).toMatchObject({ ok: true, generationId: 'gen-1', outcome: 'current' });

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
  });

  it('reports no-valid-generation when every retained generation is corrupt', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));

    await store.runTransaction('readwrite', async (tx) => {
      await tx.putGeneration('prison-1', 'gen-1', { not: 'a valid envelope' });
    });

    expect(await repo.loadCurrent('prison-1')).toEqual({ ok: false, reason: 'no-valid-generation' });
  });
});

/**
 * Issue #103: `loadCurrent` can only judge a generation by schema, migration
 * and checksum, so a save that decodes and then fails *semantic* restore
 * stayed current for ever. `demoteGeneration` is the primitive that lets the
 * session layer retire such a generation, matching what the decode path
 * already does for one it proves corrupt.
 */
describe('PrisonSaveRepository: demoteGeneration', () => {
  it('drops the demoted generation, deletes it and repoints the current pointer at the newest survivor', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));
    await repo.save('prison-1', buildEnvelope(2));

    await repo.demoteGeneration('prison-1', 'gen-2');

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
    // Deleted, not merely un-pointed: a generation outside `generationIds` is
    // unreachable by every read path and would never be cleaned up.
    const orphan = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-2'));
    expect(orphan).toBeUndefined();

    const result = await repo.loadCurrent('prison-1');
    expect(result).toMatchObject({ ok: true, generationId: 'gen-1', outcome: 'current' });
  });

  it('leaves the pointer alone when the demoted generation was not the current one', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));
    await repo.save('prison-1', buildEnvelope(2));

    await repo.demoteGeneration('prison-1', 'gen-1');

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-2', generationIds: ['gen-2'] });
  });

  it('reports no-valid-generation once every generation has been demoted, rather than losing the slot', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));

    await repo.demoteGeneration('prison-1', 'gen-1');

    expect(await repo.loadCurrent('prison-1')).toEqual({ ok: false, reason: 'no-valid-generation' });
    expect(await repo.list()).toHaveLength(1);
  });

  it('is a no-op for an unknown prison or an unknown generation', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));

    await repo.demoteGeneration('prison-2', 'gen-1');
    await repo.demoteGeneration('prison-1', 'gen-nonexistent');

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
  });
});

describe('PrisonSaveRepository: export/import', () => {
  it('exports the current envelope and imports it back through full validation as a new generation', async () => {
    const sourceRepo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('gen') });
    await sourceRepo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await sourceRepo.save('prison-1', buildEnvelope(1));
    const exported = await sourceRepo.exportSave('prison-1');
    expect(exported).toBeDefined();

    const destinationRepo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('imported') });
    await destinationRepo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    const importResult = await destinationRepo.importSave('prison-1', exported);
    expect(importResult).toEqual({ ok: true, generationId: 'imported-1' });

    const loaded = await destinationRepo.loadCurrent('prison-1');
    expect(loaded).toMatchObject({ ok: true, envelope: exported });
  });

  it('rejects an import that fails validation without writing anything', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    const result = await repo.importSave('prison-1', { garbage: true });
    expect(result.ok).toBe(false);
    expect(await repo.loadCurrent('prison-1')).toEqual({ ok: false, reason: 'no-valid-generation' });
  });
});

describe('PrisonSaveRepository: pending sync metadata', () => {
  it('marks and clears pending-sync state independently of the prison payload', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { now: () => 42 });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    await repo.markPendingSync('prison-1', { dirtySinceRevision: 3, markedAt: 42 });
    let [metadata] = await repo.list();
    expect(metadata?.pendingSync).toEqual({ dirtySinceRevision: 3, markedAt: 42 });

    await repo.clearPendingSync('prison-1');
    [metadata] = await repo.list();
    expect(metadata?.pendingSync).toBeUndefined();
  });
});
