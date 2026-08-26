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
 * A save that decodes and cannot be restored: the terrain RLE covers 5 tiles
 * of a 32x32 chunk. The save schema validates the RLE as pairs of integers
 * and deliberately leaves the size cross-check to
 * `SparseWorld.fromSnapshot`, which is exactly the class of failure the
 * repository's decode-only rollback could not see.
 */
function unrestorableEnvelope(revision: number): unknown {
  const payload = {
    ...goodPayload(1),
    world: {
      version: 1,
      chunkSize: 32,
      ownedChunks: [],
      chunks: [
        { x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false, terrain: [[1, 5]] },
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
  readonly worker: LoopbackWorker;
}> {
  const repository = new PrisonSaveRepository(new MemoryLocalSaveStore(), {
    generateGenerationId: (() => {
      let n = 0;
      return () => `gen-${(n += 1)}`;
    })(),
  });
  await repository.create({ prisonId: PRISON_ID, gameVersion: 'test-version' });

  const worker = new LoopbackWorker();
  const host = new WorkerSessionHost(worker as unknown as SimulationClient);
  const controller = new SessionController(repository, host, { gameVersion: 'test-version' });
  return { controller, repository, worker };
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
 * The failure that costs the player everything, and the floor that stops it.
 *
 * `loadPrison` demotes each generation the host refuses and tries the next,
 * which is right when the *save* is what is wrong. But the worker cannot tell
 * that from a bug in this build's own restore code: `handleInitialize` wraps
 * `restoreSimulationRuntime` in a catch-all and reports every exception out of
 * it as `snapshot-incompatible`, which `WorkerSessionHost` turns into the
 * `SnapshotRestoreRejectedError` that demotes. Either way the cause is
 * deterministic, so it rejects every generation in the window and one load
 * deleted all of them.
 *
 * Both cases below drive the real state machine over the real protocol
 * decoders, and neither injects a failure: the payloads are refused by the
 * production restore path on their own merits.
 */
describe('never the last copy', () => {
  it('stops the walk at the oldest retained generation instead of emptying the window', async () => {
    const { controller, repository } = await buildFixture();
    // Three generations, all unrestorable and all distinguishable by
    // `revision`, which is what makes it possible to say *which* one is left.
    for (const revision of [1, 2, 3]) {
      expect((await repository.save(PRISON_ID, unrestorableEnvelope(revision) as SaveEnvelope)).ok).toBe(true);
    }

    vi.useFakeTimers();
    try {
      expect(await controller.loadPrison(PRISON_ID)).toEqual({ ok: false, reason: 'no-valid-generation' });
    } finally {
      vi.useRealTimers();
    }

    // The walk went newest-first, so the two it could fall back from are gone
    // and the oldest is the copy that survives.
    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });

    // Asserted through the player's own recovery route -- Export -- and on
    // the surviving envelope's contents, because "one generation remains" is
    // a claim a count would make about any bytes at all.
    const exported = await repository.exportSave(PRISON_ID);
    expect(exported?.revision).toBe(1);
    expect(exported?.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(exported?.payload.world).toEqual((unrestorableEnvelope(1) as SaveEnvelope).payload.world);
  });

  /**
   * The compound, and the reason the floor is not a theoretical improvement.
   *
   * `tests/fixtures/persistence/save-v1-in-progress.json` is this
   * repository's own V1 in-progress save. It migrates V1 -> V5 through
   * `decodeSaveEnvelope` and its checksum verifies, so `importSave` accepts
   * it and `loadCurrent` returns it -- and then `restoreSimulationRuntime`
   * throws out of `EntityStore.loadSnapshot`, because the ledger it carries
   * has `capacity: 8` and this build's prisoner store has
   * `DEFAULT_PRISONER_CAPACITY` (5,000) slots. That is a gap in *this build's*
   * migration, not a fact about the player's file, and before the floor it
   * was paid for by deleting the file.
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
