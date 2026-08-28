import { describe, expect, it, vi } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { SessionController } from '../../src/persistence/session/session-controller';
import { WorkerSessionHost } from '../../src/persistence/session/worker-session-host';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, SAVE_SCHEMA_VERSION, type SaveEnvelope } from '../../src/persistence/save-schema';
import type { SimulationClient } from '../../src/simulation/worker/client';
import { LoopbackWorker } from '../helpers/loopback-worker';
import { createNewSimulationRuntime, DEFAULT_PRISONER_CAPACITY } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import { decodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from '../../src/simulation/entity/entity-codec';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import v1InProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

/**
 * Issue #103, proven where the two halves meet: a real
 * `SimulationWorkerStateMachine` behind a real `WorkerSessionHost`, driving a
 * real `SessionController` over a real `PrisonSaveRepository`.
 *
 * Both defects were only visible together. The worker's fault carried no
 * `replyTo`, so `WorkerSessionHost` discarded it and the pending
 * `simulation/initialize` sat until its 15 s timeout, reporting "the
 * simulation worker did not reply" for a save that was simply bad. And
 * nothing demoted that generation, so the prison stayed unloadable for ever.
 *
 * The messages cross both real protocol decoders on the way, so a fault that
 * carried a `replyTo` the schema does not permit would fail here rather than
 * being silently dropped.
 */

const PRISON_ID = 'prison-1';

function goodPayload(seed: number): SaveEnvelope['payload'] {
  const bundle = captureSessionSnapshot(createNewSimulationRuntime(seed));
  return createSaveEnvelope({
    gameVersion: 'test-version',
    prisonId: PRISON_ID,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  }).payload;
}

/**
 * A save that decodes and cannot be restored: the terrain RLE covers a
 * handful of tiles of a 32x32 chunk. The save schema validates the RLE as
 * pairs of integers and deliberately leaves the size cross-check to
 * `SparseWorld.fromSnapshot`, which is exactly the class of failure the
 * repository's decode-only rollback could not see.
 *
 * The run *length* is derived from `revision` so that two generations built
 * here differ in their payload and not only in an envelope counter: a test
 * that has to say *which* generation survived needs the surviving bytes to
 * identify themselves. Every length here is short of the chunk's 1,024
 * tiles, so the cause of the refusal is identical in each -- which is the
 * point, because a deterministic cause is what walks the whole window.
 */
function unrestorableEnvelope(revision: number): unknown {
  const payload = {
    ...goodPayload(1),
    world: {
      version: 1,
      chunkSize: 32,
      ownedChunks: [],
      chunks: [
        { x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false, terrain: [[1, 4 + revision]] },
      ],
    },
  };
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: 'test-version',
    prisonId: PRISON_ID,
    revision,
    createdAt: 1,
    updatedAt: revision,
    checksum: computeSaveChecksum(payload as never),
    payload,
  };
}

/**
 * A save that decodes **and restores**, carrying a terrain plane that names
 * which generation it is.
 *
 * The same trick `unrestorableEnvelope` uses, pointed the other way: the runs
 * cover the chunk's full 1,024 tiles, so `SparseWorld.fromSnapshot` accepts
 * them, and the *split* between the two runs is derived from `revision`, so
 * two generations differ in their payload rather than only in an envelope
 * counter. A test that has to say which of the player's own saves survived an
 * import needs the surviving bytes to identify themselves.
 */
function restorableEnvelope(revision: number): SaveEnvelope {
  const payload = {
    ...goodPayload(1),
    world: {
      version: 1,
      chunkSize: 32,
      ownedChunks: [],
      chunks: [
        {
          x: 0,
          y: 0,
          lifecycle: 'loaded',
          geometryRevision: 0,
          contentRevision: 0,
          dirty: false,
          terrain: [[1, 1_024 - revision], [1, revision]],
        },
      ],
    },
  };
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: 'test-version',
    prisonId: PRISON_ID,
    revision,
    createdAt: 1,
    updatedAt: revision,
    checksum: computeSaveChecksum(payload as never),
    payload,
  } as unknown as SaveEnvelope;
}

/**
 * The checked-in V1 fixture with one thing changed: a liveness ledger that
 * says the writing build had allocated `writtenPrefix` slots.
 *
 * The fixture itself stays untouched on disk -- `tests/migrations/` treats
 * editing it as breaking the migration contract -- so the widening happens
 * here, at V1, and the V1 checksum is recomputed over the V1 payload. The
 * chain then migrates it exactly as it migrates the original, which is the
 * point: every gate before the restore has to keep passing for this to be a
 * test about the restore.
 *
 * The three arrays are left at their original eight entries on purpose. V1's
 * schema never required them to be `capacity` long and
 * `upgradeEntityLiveness` normalises them, which `docs/PERSISTENCE.md`
 * records; so this is a V1 save of a shape the migration already handles,
 * carrying a wider allocation.
 */
function v1WithWrittenPrefix(writtenPrefix: number): unknown {
  const payload = {
    ...v1InProgressFixture.payload,
    entities: {
      ...v1InProgressFixture.payload.entities,
      capacity: writtenPrefix + 999,
      nextAvailableIndex: writtenPrefix,
      maxActiveIndex: writtenPrefix - 1,
    },
  };
  return {
    ...v1InProgressFixture,
    checksum: computeSaveChecksum(payload as never),
    payload,
  };
}

function envelopeWithSeed(seed: number, revision: number): SaveEnvelope {
  const payload = goodPayload(seed);
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: 'test-version',
    prisonId: PRISON_ID,
    revision,
    createdAt: 1,
    updatedAt: revision,
    checksum: computeSaveChecksum(payload as never),
    payload,
  } as SaveEnvelope;
}

async function buildFixture(): Promise<{
  readonly controller: SessionController;
  readonly repository: PrisonSaveRepository;
  readonly store: MemoryLocalSaveStore;
  readonly worker: LoopbackWorker;
}> {
  const store = new MemoryLocalSaveStore();
  const repository = new PrisonSaveRepository(store, {
    generateGenerationId: (() => {
      let n = 0;
      return () => `gen-${(n += 1)}`;
    })(),
  });
  await repository.create({ prisonId: PRISON_ID, gameVersion: 'test-version' });

  const worker = new LoopbackWorker();
  const host = new WorkerSessionHost(worker as unknown as SimulationClient);
  const controller = new SessionController(repository, host, { gameVersion: 'test-version' });
  return { controller, repository, store, worker };
}

describe('a save that decodes and cannot be restored, end to end', () => {
  it('surfaces the real cause immediately rather than as a reply timeout', async () => {
    const { controller, repository } = await buildFixture();
    // The only generation is unrestorable, so there is nothing to recover to
    // and the load must report that -- immediately.
    expect((await repository.save(PRISON_ID, unrestorableEnvelope(1) as SaveEnvelope)).ok).toBe(true);

    vi.useFakeTimers();
    try {
      // No timer is advanced anywhere in this test. The host's 15 s reply
      // timeout therefore cannot fire: if the fault reached the main thread
      // uncorrelated, this promise would never settle at all.
      const outcome = await controller.loadPrison(PRISON_ID);
      expect(outcome).toEqual({ ok: false, reason: 'no-valid-generation' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('demotes the unrestorable generation, restores the previous one on the same worker, and reports the fallback', async () => {
    const { controller, repository, worker } = await buildFixture();
    expect((await repository.save(PRISON_ID, envelopeWithSeed(4242, 1))).ok).toBe(true);
    expect((await repository.save(PRISON_ID, unrestorableEnvelope(2) as SaveEnvelope)).ok).toBe(true);

    vi.useFakeTimers();
    let outcome;
    try {
      outcome = await controller.loadPrison(PRISON_ID);
    } finally {
      vi.useRealTimers();
    }

    expect(outcome).toMatchObject({ ok: true, recovered: true });
    // The retry went to the *same* worker: refusing a snapshot leaves it
    // usable, so recovery does not need a fresh one.
    expect(worker.machine.state).toBe('paused');
    expect(worker.undecodableWorkerMessages).toEqual([]);

    // The demoted generation is gone, so the next load is an ordinary one.
    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
  });

  /**
   * Retirement is housekeeping, and #403 (d) moved it to *after* the restore
   * that earns it -- so a storage error while deleting a save known to be
   * unrestorable now lands on a load that has already succeeded. It must not
   * turn that into a failed load: the prison is restored and running, and the
   * refused generation costs one more refused restore on the next load, which
   * retires it then. Before (d) this call sat ahead of the successful restore,
   * where a throw could only fail a load that was failing anyway.
   */
  it('loads the prison even when retiring the generation it refused fails, and says that it failed', async () => {
    const { controller, repository, store } = await buildFixture();
    expect((await repository.save(PRISON_ID, envelopeWithSeed(4242, 1))).ok).toBe(true);
    expect((await repository.save(PRISON_ID, unrestorableEnvelope(2) as SaveEnvelope)).ok).toBe(true);

    // The walk itself only reads; the first write it attempts is the
    // retirement, once gen-1 has restored.
    store.failNextWrite = new Error('The quota was exceeded while retiring a generation.');

    vi.useFakeTimers();
    let outcome;
    try {
      outcome = await controller.loadPrison(PRISON_ID);
    } finally {
      vi.useRealTimers();
    }

    expect(outcome).toMatchObject({ ok: true, recovered: true });
    expect(controller.getActiveSession()).toMatchObject({ prisonId: PRISON_ID, revision: 1 });
    expect(controller.getLastRetirementFailure()).toBeInstanceOf(Error);

    // The refused generation is still there, unchanged -- which is the whole
    // reason this is survivable rather than swallowed.
    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-2', generationIds: ['gen-1', 'gen-2'] });
    const stillThere = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-2'));
    expect(stillThere).toMatchObject({ revision: 2, payload: { world: { chunks: [{ terrain: [[1, 6]] }] } } });
  });

  it('keeps the prison itself, so the player is told their saves are unreadable rather than finding it gone', async () => {
    const { controller, repository } = await buildFixture();
    expect((await repository.save(PRISON_ID, unrestorableEnvelope(1) as SaveEnvelope)).ok).toBe(true);

    expect(await controller.loadPrison(PRISON_ID)).toEqual({ ok: false, reason: 'no-valid-generation' });

    expect((await repository.list()).map((prison) => prison.prisonId)).toEqual([PRISON_ID]);
    // And it keeps the save, not merely the row. This assertion used to read
    // `no-valid-generation` here too: the one generation was demoted, deleted,
    // and the player's prison became a row with nothing behind it. It decodes
    // and checksums fine -- only *restoring* it fails -- so the bytes are
    // still worth exactly as much as the build that can read them.
    const retained = await repository.loadCurrent(PRISON_ID);
    expect(retained.ok && retained.envelope.revision).toBe(1);
  });
});

/**
 * The failure that costs the player everything, and what it costs now.
 *
 * `loadPrison` walks the retained window newest-first, and the worker cannot
 * tell a bad save from a bug in this build's own restore code:
 * `handleInitialize` wraps `restoreSimulationRuntime` in a catch-all and
 * reports every exception out of it as `snapshot-incompatible`, which
 * `WorkerSessionHost` turns into the `SnapshotRestoreRejectedError` the walk
 * acts on. Either way the cause is deterministic, so it refuses *every*
 * generation in the window.
 *
 * It used to retire each one as it was refused, which meant one load deleted
 * every generation but the last (three to zero before the floor landed, three
 * to one after it). A generation is now retired only once a **different**
 * generation has actually restored -- the rule the decode path has always
 * followed, where `recoverToGeneration` runs only after one has validated and
 * a window in which nothing validates loses nothing at all (#403 (d)).
 *
 * Both cases below drive the real state machine over the real protocol
 * decoders, and neither injects a failure: the payloads are refused by the
 * production restore path on their own merits.
 */
describe('a deterministic refusal costs no generation at all', () => {
  it('leaves all three refused generations on disk, each still holding what it was written with', async () => {
    const { controller, repository, store } = await buildFixture();
    // Three generations, all unrestorable, and each carrying a terrain run of
    // its own so a surviving record identifies itself rather than being
    // vouched for by a counter.
    for (const revision of [1, 2, 3]) {
      expect((await repository.save(PRISON_ID, unrestorableEnvelope(revision) as SaveEnvelope)).ok).toBe(true);
    }

    vi.useFakeTimers();
    try {
      expect(await controller.loadPrison(PRISON_ID)).toEqual({ ok: false, reason: 'no-valid-generation' });
    } finally {
      vi.useRealTimers();
    }

    // What each generation must still contain, written out here rather than
    // rebuilt from the helper that wrote them: the claim is about specific
    // bytes on disk, and a comparison whose two sides come from one generator
    // makes no claim at all (docs/TESTING.md, #375).
    const expected = [
      { generationId: 'gen-1', revision: 1, terrain: [[1, 5]] },
      { generationId: 'gen-2', revision: 2, terrain: [[1, 6]] },
      { generationId: 'gen-3', revision: 3, terrain: [[1, 7]] },
    ] as const;

    for (const { generationId, revision, terrain } of expected) {
      const stored = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, generationId));
      expect(stored, generationId).toMatchObject({
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        revision,
        payload: { world: { chunkSize: 32, chunks: [{ x: 0, y: 0, terrain }] } },
      });
    }

    // And they are all still *retained*, not merely still on disk: a record
    // outside `generationIds` is unreachable by every read path.
    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-3', generationIds: ['gen-1', 'gen-2', 'gen-3'] });

    // The newest is still what the player's own recovery route -- Export --
    // hands back, so the refused load did not quietly demote them either.
    const exported = await repository.exportSave(PRISON_ID);
    expect(exported?.revision).toBe(3);
    expect(exported?.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(exported?.payload.world.chunks[0]?.terrain).toEqual([[1, 7]]);
  });

  /**
   * The compound this describe block was written for, **re-pointed rather
   * than deleted** (#433 acceptance criterion 4).
   *
   * It used to run on `tests/fixtures/persistence/save-v1-in-progress.json`
   * unaltered, because that file migrated V1 -> V5, checksummed, imported,
   * loaded -- and then threw out of `EntityStore.loadSnapshot`, whose first
   * line refused any ledger whose `capacity` was not this build's. #433
   * removed that refusal: `capacity` is the length of the array the writing
   * build allocated, not a fact about the save, and the fixture now restores
   * (the test above). So the retention rule needs a payload that is still
   * unrestorable, and for a reason the code *states*.
   *
   * This is that payload, and it is the same V1 file with one field group
   * changed: a ledger whose **written prefix** is 5,001 slots, one more than
   * this build's `DEFAULT_PRISONER_CAPACITY` can address. Every earlier gate
   * still passes -- V1 schema, the migration chain, the checksum, `importSave`
   * and `loadCurrent` -- and the restore refuses it naming both numbers. That
   * is the shape the retention rule exists for: a save this build genuinely
   * cannot read, which a build with a wider store could.
   *
   * One generation, so this is also the case where the two rules are told
   * apart: nothing else restored, so nothing is retired, and the floor is
   * never reached. It is asserted directly on `demoteGeneration` in
   * `tests/unit/persistence-local-repository.test.ts`.
   */
  it('keeps a legitimate migrated V1 save whose ledger is wider than this build can address', async () => {
    const { controller, repository } = await buildFixture();
    const imported = await repository.importSave(PRISON_ID, v1WithWrittenPrefix(5_001));
    expect(imported).toEqual({ ok: true, generationId: 'gen-1', migrated: true });

    vi.useFakeTimers();
    try {
      expect(await controller.loadPrison(PRISON_ID)).toEqual({ ok: false, reason: 'no-valid-generation' });
    } finally {
      vi.useRealTimers();
    }

    const exported = await repository.exportSave(PRISON_ID);
    // The V1 file's own revision and the ledger width that made it
    // unrestorable, so this is the save the player imported rather than
    // anything this test rebuilt.
    expect(exported?.revision).toBe(v1InProgressFixture.revision);
    expect(exported?.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(exported?.payload.entities?.nextAvailableIndex).toBe(5_001);
  });

  /**
   * The other half of #433, and the reason the case above had to be
   * re-pointed: the checked-in V1 fixture is not an unreadable save and never
   * was. It carries two live prisoner slots inside an eight-slot array, and
   * the only thing that refused it was the array's length.
   *
   * Asserted on the two entity **ids**, read back out of the running
   * session's own captured ledger rather than out of the file: `packEntityId`
   * folds the slot index into the id, so an index re-homed by a restore at a
   * different capacity would renumber both of them, and ADR 0005 and ADR 0026
   * both depend on it not doing that. The literals are what the V1 file's
   * `generations: [1, 0, ...]` and `alive: [1, 1, ...]` mean: index 0 on its
   * second generation, index 1 on its first.
   */
  it("restores the repository's own V1 in-progress save, both entities keeping the ids the file gave them", async () => {
    const { controller, repository } = await buildFixture();
    expect(await repository.importSave(PRISON_ID, v1InProgressFixture)).toEqual({
      ok: true,
      generationId: 'gen-1',
      migrated: true,
    });

    vi.useFakeTimers();
    let outcome;
    try {
      outcome = await controller.loadPrison(PRISON_ID);
    } finally {
      vi.useRealTimers();
    }
    expect(outcome).toMatchObject({ ok: true, recovered: false });

    // Captured back out of the worker, so this is the ledger the restored
    // session is actually running on and not the one the file carried.
    const captured = await controller.buildEnvelope();
    const ledger = captured?.payload.entities;
    if (ledger === undefined) throw new Error('The restored session captured no entity ledger.');

    // The same widening `SessionController.loadPrison` makes on the way in:
    // the save schema types a run as `readonly number[]`, the codec as a
    // two-element tuple, and the envelope has already been validated.
    const store = new EntityStore(ledger.capacity);
    store.loadSnapshot(decodeEntityStoreSnapshot(ledger as unknown as EncodedEntityStoreSnapshot));
    expect(store.isAlive(0x0010_0000)).toBe(true); // index 0, generation 1
    expect(store.isAlive(0x0000_0001)).toBe(true); // index 1, generation 0
    expect(store.maxActiveIndex).toBe(1);
    // And the session is running at this build's allocation, not the eight
    // slots the V1 file recorded: the ledger it writes back out is its own.
    expect(ledger.capacity).toBe(DEFAULT_PRISONER_CAPACITY);
  });
});

/**
 * #438: the other deletion path, and the one #403's fix does not reach.
 *
 * `loadPrison` no longer costs a generation for a restore it refuses. The
 * *write* did, and in a different file: `importSave` went through the
 * ordinary save path, which applies `applyGenerationRetention`
 * unconditionally, so the oldest generation was deleted at the moment the
 * imported bytes landed -- before anything had asked whether they restore.
 * Measured on `main` @ `6f671d5` (v0.0.136), with a prison holding three of
 * the player's own generations and the repository's own V1 fixture as the
 * import: one
 * import took `[gen-1, gen-2, gen-3]` to `[gen-2, gen-3, gen-4]`, and three
 * imports with no load between them left `[gen-4, gen-5, gen-6]` -- every save
 * the player had, gone, and the next load answering `no-valid-generation`.
 * That fixture is not the payload used below, and cannot be: #433 makes it
 * restore, so importing it is now a *working* import that legitimately costs
 * a generation. `unrestorableEnvelope` is any file that decodes and then does
 * not restore, which is the shape the measurement was about.
 *
 * An import now takes the window's spare slot
 * (`applyProvisionalRetention`) and pays for it only once it has restored
 * (`PrisonSaveRepository.confirmGeneration`, called by `loadPrison`). Both
 * halves are below, because keeping the player's saves would be worth nothing
 * if a working import stopped retiring anything.
 */
describe('an import costs the player no generation of their own until it has restored', () => {
  it('leaves all three of the player\'s generations on disk after three imports that cannot be restored', async () => {
    const { controller, repository, store } = await buildFixture();
    // Three of the player's own saves, each carrying a terrain split of its
    // own so a surviving record identifies itself rather than being vouched
    // for by a counter.
    for (const revision of [1, 2, 3]) {
      expect((await repository.save(PRISON_ID, restorableEnvelope(revision))).ok).toBe(true);
    }

    for (const revision of [4, 5, 6]) {
      expect(await repository.importSave(PRISON_ID, unrestorableEnvelope(revision))).toMatchObject({ ok: true });
    }

    // What each of the player's generations must still contain, written out
    // here rather than rebuilt from the helper that wrote them: the claim is
    // about specific bytes on disk, and a comparison whose two sides come from
    // one generator makes no claim at all (docs/TESTING.md, #375).
    const expected = [
      { generationId: 'gen-1', revision: 1, terrain: [[1, 1023], [1, 1]] },
      { generationId: 'gen-2', revision: 2, terrain: [[1, 1022], [1, 2]] },
      { generationId: 'gen-3', revision: 3, terrain: [[1, 1021], [1, 3]] },
    ] as const;
    for (const { generationId, revision, terrain } of expected) {
      const stored = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, generationId));
      expect(stored, generationId).toMatchObject({
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        revision,
        payload: { world: { chunkSize: 32, chunks: [{ x: 0, y: 0, terrain }] } },
      });
    }

    // Still retained, not merely still on disk: a record outside
    // `generationIds` is unreachable by every read path.
    const [metadata] = await repository.list();
    expect(metadata?.generationIds).toEqual(['gen-1', 'gen-2', 'gen-3', 'gen-6']);

    // And the prison still loads, which is the whole of what the player
    // notices: the last import is refused, retired because a different
    // generation restored, and the newest of their own saves comes back.
    vi.useFakeTimers();
    let outcome;
    try {
      outcome = await controller.loadPrison(PRISON_ID);
    } finally {
      vi.useRealTimers();
    }
    expect(outcome).toMatchObject({ ok: true, recovered: true });
    const exported = await repository.exportSave(PRISON_ID);
    expect(exported?.revision).toBe(3);
    expect(exported?.payload.world.chunks[0]?.terrain).toEqual([[1, 1021], [1, 3]]);
  });

  it('still retires the oldest generation once an imported save has actually restored', async () => {
    const { controller, repository, store } = await buildFixture();
    for (const revision of [1, 2, 3]) {
      expect((await repository.save(PRISON_ID, restorableEnvelope(revision))).ok).toBe(true);
    }
    expect(await repository.importSave(PRISON_ID, restorableEnvelope(7))).toMatchObject({ ok: true, generationId: 'gen-4' });

    // The write itself takes nothing: the spare slot is what an unproven
    // generation gets.
    expect((await repository.list())[0]?.generationIds).toEqual(['gen-1', 'gen-2', 'gen-3', 'gen-4']);

    vi.useFakeTimers();
    try {
      expect(await controller.loadPrison(PRISON_ID)).toMatchObject({ ok: true, recovered: false });
    } finally {
      vi.useRealTimers();
    }

    // Now it has restored, so it has earned the slot and the window closes
    // back to its budget -- the same generation the unconditional eviction
    // would have taken, taken now that the file has proved it was worth it.
    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-4', generationIds: ['gen-2', 'gen-3', 'gen-4'] });
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-1'))).toBeUndefined();
    const survivor = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-2'));
    expect(survivor).toMatchObject({ revision: 2, payload: { world: { chunks: [{ terrain: [[1, 1022], [1, 2]] }] } } });
  });
});
