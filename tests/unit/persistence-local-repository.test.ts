import { describe, expect, it } from 'vitest';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { createSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import v1InProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

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

  /**
   * The seam #403 (d) needs, and the property that makes it a seam rather
   * than a second copy of the walk: a caller that has refused a generation
   * for a reason `loadCurrent` structurally cannot see -- a restore that
   * threw, which schema, migration and checksum all passed -- can ask for the
   * next candidate *without* the refused one being retired to get there.
   *
   * Before this, the walk advanced by deleting: `loadCurrent` re-derives its
   * candidate list from metadata on every call, so it kept returning the same
   * generation until one was removed, and removal is a delete.
   */
  it('passes over the generations a caller asks it to skip, and retires none of them', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1, 11));
    await repo.save('prison-1', buildEnvelope(2, 22));
    await repo.save('prison-1', buildEnvelope(3, 33));

    const second = await repo.loadCurrent('prison-1', { skip: new Set(['gen-3']) });
    expect(second).toMatchObject({ ok: true, generationId: 'gen-2', outcome: 'recovered-previous' });
    expect(second.ok && second.envelope.revision).toBe(2);
    expect(second.ok && second.envelope.payload.kernel.tick).toBe(22);

    const third = await repo.loadCurrent('prison-1', { skip: new Set(['gen-3', 'gen-2']) });
    expect(third.ok && third.envelope.revision).toBe(1);
    expect(third.ok && third.envelope.payload.kernel.tick).toBe(11);

    // Nothing was retired to get there: the skipped generation is still in the
    // window, still pointed at, and still holds the tick it was written with.
    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-3', generationIds: ['gen-1', 'gen-2', 'gen-3'] });
    const skipped = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-3'));
    expect(skipped).toMatchObject({ revision: 3, payload: { kernel: { tick: 33 } } });
  });

  it('reports no-valid-generation when every retained generation is skipped or corrupt', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1, 11));

    expect(await repo.loadCurrent('prison-1', { skip: new Set(['gen-1']) })).toEqual({ ok: false, reason: 'no-valid-generation' });
    // Reported, not deleted -- which is the whole of (d): the caller learns
    // there is nothing left to try and the save is still there.
    const survivor = await repo.loadCurrent('prison-1');
    expect(survivor.ok && survivor.envelope.payload.kernel.tick).toBe(11);
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
 *
 * It matches the decode path in the other direction too: `recoverToGeneration`
 * only ever deletes generations once a *later* one has validated, so nothing
 * on the decode side can empty a retained window. Demotion now has the same
 * floor -- see the last-generation case below.
 */
describe('PrisonSaveRepository: demoteGeneration', () => {
  it('drops the demoted generation, deletes it and repoints the current pointer at the newest survivor', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));
    await repo.save('prison-1', buildEnvelope(2));

    expect(await repo.demoteGeneration('prison-1', 'gen-2')).toEqual({ demoted: true });

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

  /**
   * The floor. This case used to assert the opposite -- that demoting the
   * only generation left the slot with an empty window -- and that behaviour
   * is what made one restore-time throw cost a player every save they had:
   * `SessionController.loadPrison` walks the window demoting whatever the
   * host refuses, and a refusal is usually deterministic, so it refuses all
   * of them. Measured on v0.0.112: three generations to zero in one load.
   *
   * Asserted on the surviving save's own contents rather than on a length,
   * because "nothing was lost" is exactly the claim a count cannot make: an
   * empty window and a window holding the wrong bytes both have a length.
   */
  it('refuses to demote the last retained generation, and the save it keeps is unchanged', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(4, 19));

    const demotion = await repo.demoteGeneration('prison-1', 'gen-1');

    // The save first and the return value second, deliberately: this case has
    // to fail because the player's only save was deleted, not merely because
    // a method that used to return `void` now reports what it did.
    //
    // Still in the store, still pointed at, and still saying what it said
    // when it was written -- so a build that can restore it still can.
    const survivor = await repo.loadCurrent('prison-1');
    expect(survivor.ok && survivor.generationId).toBe('gen-1');
    expect(survivor.ok && survivor.outcome).toBe('current');
    expect(survivor.ok && survivor.envelope.revision).toBe(4);
    expect(survivor.ok && survivor.envelope.payload.kernel.tick).toBe(19);

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
    expect(demotion).toEqual({ demoted: false, reason: 'last-generation-retained' });
  });

  it('is a no-op for an unknown prison or an unknown generation', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1));
    await repo.save('prison-1', buildEnvelope(2));

    // Reported rather than silent: a caller walking generations has to be
    // able to tell "nothing happened" from progress, or it loops for ever.
    expect(await repo.demoteGeneration('prison-2', 'gen-1')).toEqual({ demoted: false, reason: 'not-retained' });
    expect(await repo.demoteGeneration('prison-1', 'gen-nonexistent')).toEqual({ demoted: false, reason: 'not-retained' });

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-2', generationIds: ['gen-1', 'gen-2'] });
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
    expect(importResult).toEqual({ ok: true, generationId: 'imported-1', migrated: false });

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

  /**
   * Issue #287: the import path is what a player reaches through the save
   * panel's Import control, and the four ways a chosen file can be refused are
   * four different things to tell them. `SaveWriteError` can express none of
   * them -- it has three storage codes -- so the decode error travels beside it
   * on `rejected`, and this is the test that says so.
   *
   * Written as one table rather than four cases because the property is the
   * *distinction*: a change that collapsed any two of these into one code would
   * leave the panel with one sentence for both, which is exactly what issue #19
   * refused for quota and abort.
   */
  it('reports why an import was refused, distinguishably, and writes nothing in any of the four cases', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    const valid = buildEnvelope(1);
    const cases = [
      // Not a Lockstate save at all: nothing in it declares a version. No
      // `atVersion`, because no version was ever read -- which is the fact the
      // panel uses to tell this from the case below.
      { name: 'no declared version', raw: { garbage: true }, code: 'invalid-shape', atVersion: undefined },
      // A save from a build that is newer than this one. The save is fine.
      { name: 'a newer schema version', raw: { ...valid, saveSchemaVersion: 99 }, code: 'unsupported-version', atVersion: 99 },
      // Declares a version this build knows, and its payload does not hold up.
      {
        name: 'structurally invalid at a known version',
        raw: { ...valid, payload: { ...valid.payload, kernel: undefined } },
        code: 'invalid-shape',
        atVersion: valid.saveSchemaVersion,
      },
      // Intact shape, wrong checksum: edited or damaged after export.
      { name: 'a checksum that does not match', raw: { ...valid, checksum: '0000000000000000' }, code: 'checksum-mismatch', atVersion: valid.saveSchemaVersion },
    ] as const;

    for (const { name, raw, code, atVersion } of cases) {
      const result = await repo.importSave('prison-1', JSON.parse(JSON.stringify(raw)));
      expect(result.ok, name).toBe(false);
      if (result.ok) continue;
      expect(result.rejected?.code, name).toBe(code);
      expect(result.rejected?.atVersion, name).toBe(atVersion);
      // The write error stays a write error's shape, so a caller that only
      // knows `SaveResult` still gets something honest.
      expect(result.error.code, name).toBe('unknown-error');
    }

    // Four distinct codes rather than four spellings of one.
    expect(new Set(cases.map((entry) => `${entry.code}:${String(entry.atVersion)}`)).size).toBe(4);
    // And nothing reached storage in any of them.
    expect(await repo.loadCurrent('prison-1')).toEqual({ ok: false, reason: 'no-valid-generation' });
  });

  /**
   * The requirement that makes the import path worth having at all: a save
   * exported by an older build still loads.
   *
   * The V1 fixture is the checked-in one `tests/migrations/` uses, unedited, so
   * this cannot pass by migrating something it invented. `migrated: true` is
   * the observable half -- the panel reports it to the player -- and the stored
   * generation coming back at the current version is the durable half.
   */
  it('migrates an older save on the way in and says that it did', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore(), { generateGenerationId: idSequence('imported') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    const result = await repo.importSave('prison-1', v1InProgressFixture);
    expect(result).toEqual({ ok: true, generationId: 'imported-1', migrated: true });

    const loaded = await repo.loadCurrent('prison-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.envelope.saveSchemaVersion).toBe(buildEnvelope(1).saveSchemaVersion);
    // The migrated payload, not the V1 one: `revision` crosses unchanged and
    // the entity ledger is the current shape.
    expect(loaded.envelope.revision).toBe(v1InProgressFixture.revision);
    expect(Object.keys(loaded.envelope.payload.entities ?? {})).not.toContain('freeCount');
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
