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

    await controller.loadPrison(PRISON_ID);

    expect((await repository.list()).map((prison) => prison.prisonId)).toEqual([PRISON_ID]);
    expect(await repository.loadCurrent(PRISON_ID)).toEqual({ ok: false, reason: 'no-valid-generation' });
  });
});
