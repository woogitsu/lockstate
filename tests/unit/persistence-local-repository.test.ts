import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { createSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import v1InProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';
import { expectOk } from '../helpers/expect-ok';

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

/** Writes a record the typed API would never produce, the way a slot from an older build would arrive. */
async function seedRawSlotRecord(store: MemoryLocalSaveStore, record: unknown): Promise<void> {
  await store.runTransaction('readwrite', async (tx) => {
    await tx.putMetadata(record as Parameters<typeof tx.putMetadata>[0]);
  });
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
    expectOk(loaded, "prison-1's current generation after the v1 import");
    expect(loaded.envelope.saveSchemaVersion).toBe(buildEnvelope(1).saveSchemaVersion);
    // The migrated payload, not the V1 one: `revision` crosses unchanged and
    // the entity ledger is the current shape.
    expect(loaded.envelope.revision).toBe(v1InProgressFixture.revision);
    expect(Object.keys(loaded.envelope.payload.entities ?? {})).not.toContain('freeCount');
  });
});

/**
 * #438. The write path's half of "nothing is deleted on the strength of a
 * verdict this build cannot justify".
 *
 * `importSave` went through the ordinary save path, so
 * `applyGenerationRetention` evicted the oldest generation the moment the
 * imported bytes landed. Decoding, migrating and checksumming a file
 * establishes that it is a well-formed save; none of them establishes that
 * this build can *restore* it, and the repository ships a fixture that passes
 * all three and throws. So the player paid one of their own saves for a file
 * that had proved nothing yet.
 *
 * Each case below asserts on a named generation's stored tick, which is a
 * fact about the payload, rather than on the window's length -- "the player's
 * saves are still there" is exactly the claim a count cannot make.
 */
describe('PrisonSaveRepository: an import does not evict until it has restored', () => {
  async function prisonWithThreeSaves(): Promise<{
    readonly store: MemoryLocalSaveStore;
    readonly repo: PrisonSaveRepository;
  }> {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen') });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1, 11));
    await repo.save('prison-1', buildEnvelope(2, 22));
    await repo.save('prison-1', buildEnvelope(3, 33));
    return { store, repo };
  }

  /** What `importSave` is actually handed: a file, not an in-process envelope. */
  function asImportedFile(envelope: SaveEnvelope): unknown {
    return JSON.parse(JSON.stringify(envelope)) as unknown;
  }

  it('writes the imported generation into the window without deleting the oldest', async () => {
    const { store, repo } = await prisonWithThreeSaves();

    expect(await repo.importSave('prison-1', asImportedFile(buildEnvelope(9, 99)))).toEqual({
      ok: true,
      generationId: 'gen-4',
      migrated: false,
    });

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-4', generationIds: ['gen-1', 'gen-2', 'gen-3', 'gen-4'] });
    const oldest = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-1'));
    expect(oldest).toMatchObject({ revision: 1, payload: { kernel: { tick: 11 } } });
  });

  it('retires the oldest only once the imported generation is confirmed, and says which one it retired', async () => {
    const { store, repo } = await prisonWithThreeSaves();
    await repo.importSave('prison-1', asImportedFile(buildEnvelope(9, 99)));

    expect(await repo.confirmGeneration('prison-1', 'gen-4')).toEqual({ confirmed: true, retired: ['gen-1'] });

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-4', generationIds: ['gen-2', 'gen-3', 'gen-4'] });
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-1'))).toBeUndefined();
    const survivor = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-2'));
    expect(survivor).toMatchObject({ revision: 2, payload: { kernel: { tick: 22 } } });
  });

  /**
   * The bound. The spare slot is one slot, and the generation holding it is
   * the only thing a later import may take -- never another of the player's
   * own, however many files they try.
   */
  it('reuses the spare slot on a second import rather than taking another of the player\'s own', async () => {
    const { store, repo } = await prisonWithThreeSaves();
    await repo.importSave('prison-1', asImportedFile(buildEnvelope(9, 99)));
    await repo.importSave('prison-1', asImportedFile(buildEnvelope(10, 111)));
    await repo.importSave('prison-1', asImportedFile(buildEnvelope(11, 222)));

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-6', generationIds: ['gen-1', 'gen-2', 'gen-3', 'gen-6'] });

    // The player's oldest, untouched after three imports.
    const oldest = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-1'));
    expect(oldest).toMatchObject({ revision: 1, payload: { kernel: { tick: 11 } } });
    // The imports that gave up the slot are gone, which is what bounds the
    // window: a file the player still holds, against a save they do not.
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-4'))).toBeUndefined();
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-5'))).toBeUndefined();
    const kept = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-6'));
    expect(kept).toMatchObject({ revision: 11, payload: { kernel: { tick: 222 } } });
  });

  it('confirms a window already within budget without retiring or rewriting anything', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen'), now: () => 7 });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1, 11));

    expect(await repo.confirmGeneration('prison-1', 'gen-1')).toEqual({ confirmed: true, retired: [] });
    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
  });

  /**
   * Reported rather than silent, for `demoteGeneration`'s reason: a caller
   * must be able to tell "nothing needed doing" from "this did not apply".
   * The middle case is the rule -- the spare slot belongs to the newest
   * generation, so confirming an older one must not close the window at the
   * expense of an import still sitting on top of it.
   */
  it('refuses to close the window on anything but the newest generation, and says why', async () => {
    const { store, repo } = await prisonWithThreeSaves();
    await repo.importSave('prison-1', asImportedFile(buildEnvelope(9, 99)));

    expect(await repo.confirmGeneration('prison-1', 'gen-2')).toEqual({
      confirmed: false,
      reason: 'not-the-newest-generation',
    });
    expect(await repo.confirmGeneration('prison-2', 'gen-4')).toEqual({ confirmed: false, reason: 'not-retained' });
    expect(await repo.confirmGeneration('prison-1', 'gen-nonexistent')).toEqual({
      confirmed: false,
      reason: 'not-retained',
    });

    const [metadata] = await repo.list();
    expect(metadata?.generationIds).toEqual(['gen-1', 'gen-2', 'gen-3', 'gen-4']);
    const oldest = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-1'));
    expect(oldest).toMatchObject({ revision: 1, payload: { kernel: { tick: 11 } } });
  });
});

/**
 * #432. `demoteGeneration` above deletes, and what licenses deleting is that a
 * *different* generation restored moments earlier. That evidence means two
 * different things under ADR 0063's two save-side verdicts: for
 * `damaged-payload` the content contradicts itself and no build restores it,
 * and for `unsupported-by-this-build` the bytes are coherent and the build
 * that reads them already exists. This is the primitive for the second.
 *
 * The marked ids are spelled out rather than produced by
 * `quarantinedGenerationId`, so nothing here takes the mark's shape from the
 * code it is checking.
 */
describe('PrisonSaveRepository: quarantineGeneration', () => {
  async function prisonWithThreeSaves(): Promise<{
    readonly store: MemoryLocalSaveStore;
    readonly repo: PrisonSaveRepository;
  }> {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen'), now: () => 5 });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1, 11));
    await repo.save('prison-1', buildEnvelope(2, 22));
    await repo.save('prison-1', buildEnvelope(3, 33));
    return { store, repo };
  }

  it('moves the record to the marked id and keeps its bytes, leaving every other generation alone', async () => {
    const { store, repo } = await prisonWithThreeSaves();

    expect(await repo.quarantineGeneration('prison-1', 'gen-3')).toEqual({
      quarantined: true,
      generationId: '!unreadable!gen-3',
      evicted: [],
    });

    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({
      currentGenerationId: '!unreadable!gen-3',
      generationIds: ['gen-1', 'gen-2', '!unreadable!gen-3'],
    });
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-3'))).toBeUndefined();
    const kept = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', '!unreadable!gen-3'));
    expect(kept).toMatchObject({ revision: 3, payload: { kernel: { tick: 33 } } });
    const untouched = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-1'));
    expect(untouched).toMatchObject({ revision: 1, payload: { kernel: { tick: 11 } } });
  });

  /**
   * The bound, stated as a number: **one quarantined generation per prison.**
   *
   * It is the newest candidate that holds it, because of two saves this build
   * cannot read the newer one is the more recent state of the prison. The
   * older one is deleted -- the one deletion quarantine performs, and the only
   * thing that keeps a repeatedly-refused restore from growing storage without
   * limit.
   */
  it('holds one quarantined generation, and a newer one displaces the older', async () => {
    const { store, repo } = await prisonWithThreeSaves();
    await repo.quarantineGeneration('prison-1', 'gen-2');

    expect(await repo.quarantineGeneration('prison-1', 'gen-3')).toEqual({
      quarantined: true,
      generationId: '!unreadable!gen-3',
      evicted: ['!unreadable!gen-2'],
    });

    const [metadata] = await repo.list();
    expect(metadata?.generationIds).toEqual(['gen-1', '!unreadable!gen-3']);
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', '!unreadable!gen-2'))).toBeUndefined();
    const kept = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', '!unreadable!gen-3'));
    expect(kept).toMatchObject({ revision: 3, payload: { kernel: { tick: 33 } } });
  });

  /**
   * The same bound from the other side, and it is where the sacrifice is
   * visible: the older of two unreadable saves does not get the slot, stays an
   * ordinary retained generation, and is evicted by the ordinary rules in due
   * course.
   */
  it('declines a generation older than the one already in the slot, and says why', async () => {
    const { store, repo } = await prisonWithThreeSaves();
    await repo.quarantineGeneration('prison-1', 'gen-3');

    expect(await repo.quarantineGeneration('prison-1', 'gen-2')).toEqual({
      quarantined: false,
      reason: 'newer-generation-quarantined',
    });

    const [metadata] = await repo.list();
    expect(metadata?.generationIds).toEqual(['gen-1', 'gen-2', '!unreadable!gen-3']);
    // Nothing was deleted by the refusal itself -- gen-2 is simply back under
    // the ordinary rules, and two further saves are what take it.
    await repo.save('prison-1', buildEnvelope(4, 44));
    await repo.save('prison-1', buildEnvelope(5, 55));
    expect((await repo.list())[0]?.generationIds).toEqual(['gen-2', '!unreadable!gen-3', 'gen-4', 'gen-5']);
    await repo.save('prison-1', buildEnvelope(6, 66));
    expect((await repo.list())[0]?.generationIds).toEqual(['!unreadable!gen-3', 'gen-4', 'gen-5', 'gen-6']);
    const stillKept = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', '!unreadable!gen-3'));
    expect(stillKept).toMatchObject({ revision: 3, payload: { kernel: { tick: 33 } } });
  });

  /**
   * `demoteGeneration`'s floor, restated for the caller that deletes nothing.
   * Setting a generation aside costs no bytes, but it does take it out of the
   * count this build offers the player, and a window every one of whose
   * generations was quarantined would report a prison holding saves as a
   * prison holding none.
   */
  it('refuses to set aside the last generation this build could still use', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: idSequence('gen'), now: () => 5 });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    await repo.save('prison-1', buildEnvelope(1, 11));

    expect(await repo.quarantineGeneration('prison-1', 'gen-1')).toEqual({
      quarantined: false,
      reason: 'last-readable-generation-retained',
    });
    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
    const untouched = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-1'));
    expect(untouched).toMatchObject({ revision: 1, payload: { kernel: { tick: 11 } } });
  });

  it('is idempotent, and reports the cases it does not apply to', async () => {
    const { repo } = await prisonWithThreeSaves();
    await repo.quarantineGeneration('prison-1', 'gen-3');

    // The same build refuses the same generation on every load, so the second
    // load asks for this again and must not move anything.
    expect(await repo.quarantineGeneration('prison-1', '!unreadable!gen-3')).toEqual({
      quarantined: true,
      generationId: '!unreadable!gen-3',
      evicted: [],
    });
    expect(await repo.quarantineGeneration('prison-2', 'gen-1')).toEqual({ quarantined: false, reason: 'not-retained' });
    expect(await repo.quarantineGeneration('prison-1', 'gen-nonexistent')).toEqual({
      quarantined: false,
      reason: 'not-retained',
    });
    expect((await repo.list())[0]?.generationIds).toEqual(['gen-1', 'gen-2', '!unreadable!gen-3']);
  });

  /**
   * The mark records a verdict -- *this build refused these bytes* -- and a
   * build that restores them falsifies it. Releasing hands the slot back and
   * returns the generation to the player's own count.
   */
  it('releases the mark, restoring the id the generation had, and reports the no-op cases', async () => {
    const { store, repo } = await prisonWithThreeSaves();
    await repo.quarantineGeneration('prison-1', 'gen-3');

    expect(await repo.releaseQuarantinedGeneration('prison-1', '!unreadable!gen-3')).toEqual({
      released: true,
      generationId: 'gen-3',
    });
    const [metadata] = await repo.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-3', generationIds: ['gen-1', 'gen-2', 'gen-3'] });
    const recovered = await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', 'gen-3'));
    expect(recovered).toMatchObject({ revision: 3, payload: { kernel: { tick: 33 } } });
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', '!unreadable!gen-3'))).toBeUndefined();

    expect(await repo.releaseQuarantinedGeneration('prison-1', 'gen-3')).toEqual({
      released: false,
      reason: 'not-quarantined',
    });
    expect(await repo.releaseQuarantinedGeneration('prison-1', '!unreadable!gen-9')).toEqual({
      released: false,
      reason: 'not-retained',
    });
  });

  /**
   * The mark is what makes a generation exempt from every retention rule, and
   * `generateGenerationId` is injectable. A generator that emitted a marked id
   * would mint saves that never expire and are never counted for the player,
   * so the write refuses it rather than leaving a window that grows for ever.
   */
  it('refuses to write a generation whose id carries the quarantine mark', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store, { generateGenerationId: () => '!unreadable!gen-1' });
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    const result = await repo.save('prison-1', buildEnvelope(1, 11));
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown-error' } });
    expect((await repo.list())[0]).toMatchObject({ currentGenerationId: undefined, generationIds: [] });
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration('prison-1', '!unreadable!gen-1'))).toBeUndefined();
  });

  /**
   * `loadCurrent` deliberately still offers a quarantined generation, and
   * #432's fourth acceptance criterion asked for the opposite. That criterion
   * is the one that gives, because the same issue requires the bytes to be
   * *"recoverable by a later build without the player doing anything
   * unusual"*, and staying in the walk is that recovery: the quarantined
   * generation is the newest, so a build that can read it restores it on the
   * next load with no new code path and no new control to explain.
   *
   * Termination is unaffected -- it rests on `LoadCurrentOptions.skip`, which
   * only grows -- and this pins both halves: the quarantined generation is
   * offered when nothing skips it, and the walk still ends when everything is
   * skipped.
   */
  it('still offers a quarantined generation to the recovery walk, and still terminates when it is skipped', async () => {
    const { repo } = await prisonWithThreeSaves();
    await repo.quarantineGeneration('prison-1', 'gen-3');

    const offered = await repo.loadCurrent('prison-1');
    expect(offered).toMatchObject({ ok: true, generationId: '!unreadable!gen-3', outcome: 'current' });
    expect(offered.ok && offered.envelope.payload.kernel.tick).toBe(33);

    const exhausted = await repo.loadCurrent('prison-1', {
      skip: new Set(['gen-1', 'gen-2', '!unreadable!gen-3']),
    });
    expect(exhausted).toEqual({ ok: false, reason: 'no-valid-generation' });
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

  /**
   * #1097's fix, at the choke point rather than through `SessionController`:
   * `currentRevision` is written by `writeGeneration`, which every save route
   * reaches -- including a caller (the interval autosave) that never calls
   * `markPendingSync` at all. These three `save()` calls model exactly that:
   * no `markPendingSync` call between them, the way
   * `SessionController`'s `AutosaveScheduler` drives `repository.save`
   * directly.
   */
  it('writes currentRevision on every save, with no markPendingSync call in sight (#1097)', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    await repo.save('prison-1', buildEnvelope(1));
    expect((await repo.list())[0]?.currentRevision).toBe(1);
    await repo.save('prison-1', buildEnvelope(2));
    expect((await repo.list())[0]?.currentRevision).toBe(2);
    await repo.save('prison-1', buildEnvelope(3));
    expect((await repo.list())[0]?.currentRevision).toBe(3);

    // Untouched by any of this -- `currentRevision` and `pendingSync` are two
    // separate facts now (#1097), and nothing here ever called
    // `markPendingSync`.
    expect((await repo.list())[0]?.pendingSync).toBeUndefined();
  });

  it('writes currentRevision on an import, the other route into writeGeneration', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    const imported = JSON.parse(JSON.stringify(buildEnvelope(7))) as unknown;
    expect((await repo.importSave('prison-1', imported)).ok).toBe(true);
    expect((await repo.list())[0]?.currentRevision).toBe(7);
  });

  /**
   * `pendingSync.dirtySinceRevision` is a lower bound -- the revision the
   * prison first went dirty at -- not "whatever the latest save wrote"
   * (#1097). So a second `markPendingSync` call while a marker already
   * stands must leave it exactly where it was; only `clearPendingSync` may
   * move it, by removing it so the next call sets a fresh one.
   */
  it('leaves an existing pendingSync marker untouched: markPendingSync only sets the first one', async () => {
    const repo = new PrisonSaveRepository(new MemoryLocalSaveStore());
    await repo.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });

    await repo.markPendingSync('prison-1', { dirtySinceRevision: 3, markedAt: 100 });
    await repo.markPendingSync('prison-1', { dirtySinceRevision: 9, markedAt: 900 });
    expect((await repo.list())[0]?.pendingSync).toEqual({ dirtySinceRevision: 3, markedAt: 100 });

    // Clearing it is what makes a *new* first-dirty revision recordable.
    await repo.clearPendingSync('prison-1');
    await repo.markPendingSync('prison-1', { dirtySinceRevision: 9, markedAt: 900 });
    expect((await repo.list())[0]?.pendingSync).toEqual({ dirtySinceRevision: 9, markedAt: 900 });
  });

  /**
   * `PrisonSlotMetadata.currentRevision` is optional precisely so a slot
   * written before #1097 -- no `currentRevision` key at all, exactly what
   * `seedRawSlotRecord` below writes -- still loads rather than being refused
   * as corrupt (`docs/PERSISTENCE.md`, "Adding an optional field without a
   * version bump"). Nothing repairs it retroactively: it reads back
   * `undefined` until its next durable save.
   */
  it('still loads a slot written before currentRevision existed, and backfills it on the next save (#1097)', async () => {
    const store = new MemoryLocalSaveStore();
    const repo = new PrisonSaveRepository(store);
    const legacyRecord = {
      prisonId: 'prison-1',
      gameVersion: 'lockstate-0.0.0',
      currentGenerationId: 'gen-1',
      generationIds: ['gen-1'],
      createdAt: 1_000,
      updatedAt: 1_000,
      pendingSync: { dirtySinceRevision: 1, markedAt: 1_000 },
      // Deliberately no `currentRevision` key: this is the shape a build
      // before #1097 wrote.
    };
    await seedRawSlotRecord(store, legacyRecord);

    const [metadataBefore] = await repo.list();
    expect(metadataBefore?.currentRevision).toBeUndefined();
    expect(metadataBefore?.prisonId).toBe('prison-1');

    await repo.save('prison-1', buildEnvelope(4));
    const [metadataAfter] = await repo.list();
    expect(metadataAfter?.currentRevision).toBe(4);
  });
});

/**
 * Issue #582 FINAL-022. `defaultGenerationId` minted
 * `gen-<Date.now() base36>-<counter base36>` from a **module-local** counter,
 * so every JavaScript realm starts that counter at zero: two tabs, or a tab and
 * a worker, saving in the same millisecond mint the *same* id for different
 * bytes. `generationId` is the key the bytes are stored under and the entry in
 * `generationIds`, so a collision is one generation silently overwriting
 * another's payload while both remain listed.
 *
 * ## Why the test resets modules rather than opening two tabs
 *
 * The counter is module state and there is no way to reach it from outside, so
 * the only honest way to reproduce a second realm is to *be* one:
 * `vi.resetModules()` plus a fresh dynamic import gives a second copy of the
 * module with its counter back at zero, which is exactly what a second tab has.
 * With the clock frozen so both realms agree on `Date.now()`, the old
 * implementation makes the two sequences identical -- the collision, reproduced
 * rather than argued.
 */
describe('PrisonSaveRepository: generation ids across realms (#582 FINAL-022)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  async function mintInFreshRealm(count: number): Promise<readonly string[]> {
    vi.resetModules();
    const { PrisonSaveRepository: FreshRepository } = await import('../../src/persistence/local/repository');
    const { MemoryLocalSaveStore: FreshStore } = await import('../../src/persistence/local/memory-store');
    // No `generateGenerationId` injected: this test is about the DEFAULT, which
    // is the only thing a shipped tab uses.
    const repository = new FreshRepository(new FreshStore());
    await repository.create({ prisonId: 'prison-1', gameVersion: 'lockstate-0.0.0' });
    const minted: string[] = [];
    for (let revision = 1; revision <= count; revision += 1) {
      expectOk(await repository.save('prison-1', buildEnvelope(revision)), `save ${String(revision)}`);
      const slot = (await repository.list()).find((prison) => prison.prisonId === 'prison-1');
      minted.push(slot!.currentGenerationId!);
    }
    return minted;
  }

  it('mints ids no second realm can duplicate, even with the clock frozen on the same millisecond', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));

    const firstRealm = await mintInFreshRealm(3);
    const secondRealm = await mintInFreshRealm(3);

    expect(new Set(firstRealm).size, 'ids within one realm must already be distinct').toBe(3);
    expect(
      firstRealm.filter((id) => secondRealm.includes(id)),
      'a second tab starting its own module counter at zero must not be able to mint an id this one already used -- these are storage keys, so a collision overwrites one generation with another',
    ).toEqual([]);
  });

  it('keeps the one property `generation-policy.ts` reasons about: no minted id carries the quarantine mark', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));

    // `generation-policy.ts` states that `!` is not a character
    // `defaultGenerationId` can emit, and `writeGeneration` refuses an injected
    // id that carries the mark -- so quarantine means "was quarantined" and
    // nothing else. Changing the id format must not quietly cost that.
    for (const id of await mintInFreshRealm(3)) expect(id.includes('!')).toBe(false);
  });
});
