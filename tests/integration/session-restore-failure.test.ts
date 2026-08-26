import { describe, expect, it, vi } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { SessionController } from '../../src/persistence/session/session-controller';
import { WorkerSessionHost } from '../../src/persistence/session/worker-session-host';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, SAVE_SCHEMA_VERSION, type SaveEnvelope } from '../../src/persistence/save-schema';
import type { SimulationClient } from '../../src/simulation/worker/client';
import { LoopbackWorker } from '../helpers/loopback-worker';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
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
   * The compound, and the reason none of this is a theoretical improvement.
   *
   * `tests/fixtures/persistence/save-v1-in-progress.json` is this
   * repository's own V1 in-progress save. It migrates V1 -> V5 through
   * `decodeSaveEnvelope` and its checksum verifies, so `importSave` accepts
   * it and `loadCurrent` returns it -- and then `restoreSimulationRuntime`
   * throws out of `EntityStore.loadSnapshot`, because the ledger it carries
   * has `capacity: 8` and this build's prisoner store has
   * `DEFAULT_PRISONER_CAPACITY` (5,000) slots. That is a gap in *this build's*
   * migration, not a fact about the player's file, and it was once paid for
   * by deleting the file.
   *
   * One generation, so this is also the case where the two rules are told
   * apart: nothing else restored, so nothing is retired, and the floor is
   * never reached. It is asserted directly on `demoteGeneration` in
   * `tests/unit/persistence-local-repository.test.ts`.
   */
  it('keeps a legitimate migrated V1 save that this build cannot restore', async () => {
    const { controller, repository } = await buildFixture();
    const imported = await repository.importSave(PRISON_ID, v1InProgressFixture);
    expect(imported).toEqual({ ok: true, generationId: 'gen-1', migrated: true });

    vi.useFakeTimers();
    try {
      expect(await controller.loadPrison(PRISON_ID)).toEqual({ ok: false, reason: 'no-valid-generation' });
    } finally {
      vi.useRealTimers();
    }

    const exported = await repository.exportSave(PRISON_ID);
    // The V1 file's own revision and its migrated entity ledger, so this is
    // the save the player imported rather than anything this test built.
    expect(exported?.revision).toBe(v1InProgressFixture.revision);
    expect(exported?.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(exported?.payload.entities?.capacity).toBe(v1InProgressFixture.payload.entities.capacity);
  });
});
