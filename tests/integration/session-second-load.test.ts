import { describe, expect, it } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { SessionController } from '../../src/persistence/session/session-controller';
import { WorkerPerSessionHost } from '../../src/persistence/session/worker-per-session-host';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, SAVE_SCHEMA_VERSION, type SaveEnvelope } from '../../src/persistence/save-schema';
import type { SimulationClient } from '../../src/simulation/worker/client';
import { SimulationWorkerChannel } from '../../src/simulation/worker/worker-channel';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import { LoopbackWorker } from '../helpers/loopback-worker';
import { expectOk } from '../helpers/expect-ok';

/**
 * Issue #149: a second load in the same tab, through the composition that
 * makes it happen -- a real `SimulationWorkerChannel` handing real
 * `SimulationWorkerStateMachine`s to a real `WorkerPerSessionHost`, driving a
 * real `SessionController` over a real `PrisonSaveRepository`.
 *
 * ## Why nothing caught this before
 *
 * Every existing test builds a fresh state machine or a fresh host per case,
 * which is correct unit hygiene and is exactly why the composition was
 * untested: nothing performed **two** loads against **one** host. So the
 * defect lived in no component. `SimulationWorkerStateMachine` was right to
 * refuse a second `simulation/initialize` (a worker holds one authoritative
 * simulation -- ADR 0006), `WorkerSessionHost` was right to drive one worker
 * through one session, and `src/main.ts` building one of them per page was the
 * whole bug: after the first `createPrison` or `loadPrison`, every later load
 * in that tab failed with `already-initialized` and the player's only way
 * forward was to reload the page.
 *
 * ## Why this is an integration test and not a unit one
 *
 * Because the claim is about composition, and because the obvious unit home
 * cannot state it. `InProcessSessionHost` -- the host the controller's own
 * unit tests use -- simply reassigns `this.runtime` on every `startNew`, so a
 * second load through it has always succeeded and always will. A test written
 * there would have passed on the broken code. The refusal only exists inside
 * the worker's state machine, so a test that proves it is gone has to have a
 * state machine in it.
 *
 * `tests/browser/app-shell.spec.ts` carries the other half: that the page a
 * player loads really constructs a second `Worker` and really repaints. Real
 * `Worker` construction is the one thing this layer stands in for.
 */

const PRISON_A = 'prison-a';
const PRISON_B = 'prison-b';

interface Fixture {
  readonly controller: SessionController;
  readonly repository: PrisonSaveRepository;
  /** Every worker the channel has constructed, oldest first. */
  readonly workers: readonly LoopbackWorker[];
  readonly workerUnavailableReports: readonly boolean[];
}

function buildFixture(options: { readonly failWorkerAfter?: number } = {}): Fixture {
  const workers: LoopbackWorker[] = [];
  const workerUnavailableReports: boolean[] = [];

  const channel = new SimulationWorkerChannel(() => {
    if (options.failWorkerAfter !== undefined && workers.length >= options.failWorkerAfter) {
      // What a real browser does when a `Worker` cannot be constructed -- a
      // strict CSP, an extension, an enterprise policy (issue #82's list).
      throw new DOMException('Worker construction is blocked.', 'SecurityError');
    }
    const worker = new LoopbackWorker();
    workers.push(worker);
    return worker as unknown as SimulationClient;
  });
  channel.open();

  const repository = new PrisonSaveRepository(new MemoryLocalSaveStore(), {
    generateGenerationId: (() => {
      let n = 0;
      return () => `gen-${(n += 1)}`;
    })(),
  });

  const host = new WorkerPerSessionHost(channel, {
    onWorkerAvailability: (available) => workerUnavailableReports.push(available),
  });
  const controller = new SessionController(repository, host, { gameVersion: 'test-version' });
  return { controller, repository, workers, workerUnavailableReports };
}

/** A save written by a real session, so nothing here hand-builds a payload the worker never wrote. */
function payloadFor(prisonId: string, seed: number): SaveEnvelope['payload'] {
  const bundle = captureSessionSnapshot(createNewSimulationRuntime(seed));
  return createSaveEnvelope({
    gameVersion: 'test-version',
    prisonId,
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

/** A good save at a chosen revision, checksummed the way the repository will verify it. */
function goodEnvelope(prisonId: string, revision: number, seed: number): SaveEnvelope {
  const payload = payloadFor(prisonId, seed);
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: 'test-version',
    prisonId,
    revision,
    createdAt: 1,
    updatedAt: revision,
    checksum: computeSaveChecksum(payload as never),
    payload,
  } as SaveEnvelope;
}

/**
 * A save that decodes and cannot be restored: the terrain RLE covers 5 tiles
 * of a 32x32 chunk, which `save-schema.ts` deliberately leaves for
 * `SparseWorld.fromSnapshot` to catch. The same fixture shape as
 * `session-restore-failure.test.ts`, for the same reason.
 */
function unrestorableEnvelope(prisonId: string, revision: number): SaveEnvelope {
  const payload = {
    ...payloadFor(prisonId, 1),
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
    prisonId,
    revision,
    createdAt: 1,
    updatedAt: revision,
    checksum: computeSaveChecksum(payload as never),
    payload,
  } as SaveEnvelope;
}

describe('a second session in the same tab (#149)', () => {
  /**
   * The case issue #149 asked for, in the words it asked for them: "creates a
   * prison, loads a second one through the same host, and asserts the second
   * load succeeds. It fails today."
   */
  it('loads a second prison through the host that already created one', async () => {
    const { controller, repository, workers } = buildFixture();

    expectOk(await controller.createPrison(PRISON_A, 'A'), 'the creation of PRISON_A');
    expectOk(await controller.createPrison(PRISON_B, 'B'), 'the creation of PRISON_B');

    const outcome = await controller.loadPrison(PRISON_A);

    // Before the fix this was `{ ok: false }` -- no, worse: the load *threw*
    // `Simulation worker fault (already-initialized): Kernel is already
    // initialized.` out of `loadPrison`, which the save panel painted as
    // "Loading failed" with no way forward but a page reload.
    expect(outcome).toMatchObject({ ok: true, recovered: false });
    expect(controller.getActiveSession()?.prisonId).toBe(PRISON_A);
    // The prison really is loadable again afterwards, which is what "a player
    // with two prisons" actually does.
    expect(await controller.loadPrison(PRISON_B)).toMatchObject({ ok: true });
    expect(controller.getActiveSession()?.prisonId).toBe(PRISON_B);

    // And the save the second load restored is intact: no generation was
    // demoted on the way, so the prison is no worse off for having been
    // loaded. `gen-1` being first is that claim, and it is the one this case
    // has always made.
    //
    // The two behind it are #943's, and this assertion read `['gen-1']` until
    // it landed: prison A is *saved on its way out* now, once by the
    // `createPrison(PRISON_B)` above and once by the `loadPrison(PRISON_B)`,
    // because until that change asking for a second prison threw the first
    // one's unsaved play away silently (measured: kernel tick 211 back as 0,
    // zero dialogs). Written out rather than loosened to a length or a
    // `toContain`, so a capture that stopped happening still fails here.
    const [a] = (await repository.list()).filter((slot) => slot.prisonId === PRISON_A);
    expect(a?.generationIds).toEqual(['gen-1', 'gen-2', 'gen-5']);

    // Four sessions, four workers, and every one of them was sent exactly one
    // `simulation/initialize`: that is the rule that makes the defect
    // impossible rather than merely absent.
    expect(workers).toHaveLength(4);
    expect(workers.map((worker) => worker.undecodableWorkerMessages)).toEqual([[], [], [], []]);
  });

  it('runs each session in a worker of its own and disposes of the one before it', async () => {
    const { controller, workers } = buildFixture();

    await controller.createPrison(PRISON_A, 'A');
    const [first] = workers;
    expect(workers).toHaveLength(1); // the boot worker hosted the first session; nothing was wasted
    expect(first?.machine.state).toBe('paused');

    await controller.createPrison(PRISON_B, 'B');

    expect(workers).toHaveLength(2);
    // Shut down through the protocol and *then* terminated, in that order:
    // `simulation/stopped` is what tells the renderer's feed and the command
    // sender that the session ended, and `terminate()` is what makes the
    // thread stop existing.
    expect(first?.machine.state).toBe('shutting-down');
    expect(first?.terminated).toBe(true);
    expect(workers[1]?.terminated).toBe(false);
    expect(workers[1]?.machine.state).toBe('paused');
  });

  it('still demotes and recovers across the fresh workers', async () => {
    const { controller, repository, workers } = buildFixture();
    await repository.create({ prisonId: PRISON_A, gameVersion: 'test-version' });
    expectOk(await repository.save(PRISON_A, goodEnvelope(PRISON_A, 1, 4242)), 'the good generation 1');
    expectOk(await repository.save(PRISON_A, unrestorableEnvelope(PRISON_A, 2)), 'the unrestorable generation 2');

    const outcome = await controller.loadPrison(PRISON_A);

    // The demote-and-retry walk #147 built still works, and now works on a
    // page's *later* loads too -- which is exactly what #149 said it could not
    // do. The retry runs in a worker of its own: a worker that refused a
    // snapshot is still usable, but the main thread cannot tell it apart from
    // one that faulted while restoring, so it takes a fresh one either way.
    expect(outcome).toMatchObject({ ok: true, recovered: true });
    expect(workers).toHaveLength(2);
    expect(workers[0]?.machine.state).toBe('uninitialized'); // refused the snapshot; installed nothing
    expect(workers[1]?.machine.state).toBe('paused');

    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });
  });

  it('reports a worker that cannot be started without blaming the save for it', async () => {
    // The boot worker is constructed and serves the first session; the second
    // session's worker is refused, which is issue #82's failure path arriving
    // long after boot.
    const { controller, repository, workerUnavailableReports } = buildFixture({ failWorkerAfter: 1 });
    await repository.create({ prisonId: PRISON_A, gameVersion: 'test-version' });
    expectOk(await repository.save(PRISON_A, goodEnvelope(PRISON_A, 1, 1)), 'the good generation 1');
    expectOk(await controller.createPrison(PRISON_B, 'B'), 'the creation of PRISON_B');

    await expect(controller.loadPrison(PRISON_A)).rejects.toThrow(
      /The simulation worker for this session could not be started: Worker construction is blocked\./,
    );

    // Not a `SnapshotRestoreRejectedError`, so the generation survives: the
    // save may be perfectly good, and deleting it because the *browser* could
    // not start a thread would be the more expensive mistake.
    const [metadata] = (await repository.list()).filter((slot) => slot.prisonId === PRISON_A);
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-1', generationIds: ['gen-1'] });

    // And the page is told, so the HUD can say so rather than the player
    // staring at a world that is no longer backed by anything (#82, re-entered).
    expect(workerUnavailableReports).toEqual([true, false]);
  });
});
