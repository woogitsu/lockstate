import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { createSaveEnvelope, SAVE_SCHEMA_VERSION, type SaveEnvelope } from '../../src/persistence/save-schema';
import { InProcessSessionHost, type SessionRuntimeHost } from '../../src/persistence/session/runtime-host';
import { SessionController } from '../../src/persistence/session/session-controller';
import { WorkerPerSessionHost } from '../../src/persistence/session/worker-per-session-host';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import type { SimulationClient } from '../../src/simulation/worker/client';
import { SimulationWorkerChannel } from '../../src/simulation/worker/worker-channel';
import { LoopbackWorker } from '../helpers/loopback-worker';
import { expectOk } from '../helpers/expect-ok';

/**
 * Issue #943: **asking for a second prison silently destroyed the first one's
 * unsaved play**, and nothing in the suite asserted otherwise.
 *
 * The measurement that opened it, on v0.0.451: prison A at kernel tick **211**
 * with **1,600** spent came back at tick **0** with **25,000**, with zero
 * dialogs of any kind -- DOM dialogs *and* native `confirm` were both counted.
 * The mechanism was two lines of `SessionController.createPrison`:
 * `await this.host.startNew(masterSeed)` replaced the simulation and
 * `this.adoptSession(prisonId)` then disposed the autosave that belonged to
 * the session it had just replaced, so nothing ever captured it.
 *
 * ## Why the loss was unbounded rather than capped at the autosave interval
 *
 * Because the autosave is **command-driven, not play-driven**: `src/main.ts`
 * wires `commandSender?.onCommandAccepted(() => controller.markDirty())`, so a
 * prison that has been *watched* rather than played has never been marked
 * dirty and has never been saved, however long it ran
 * (`docs/research/2026-09-04-does-a-prison-come-back.md`: 80 s of running
 * clock, nothing pressed, 1,626 ticks, zero saves). That is why every case
 * below reaches its tick by stepping the kernel and **never** calls
 * `markDirty`, and why one of them asserts that `hasPendingAutosave()` is
 * false at the moment of the press: a capture conditional on the session being
 * dirty would keep the whole defect for exactly the prison that loses the
 * most, while looking like a fix.
 *
 * ## Why `InProcessSessionHost` for the tick arithmetic
 *
 * Because it is the only host whose kernel a test can step to a chosen tick,
 * and because it goes through `capture()` / `startFromSnapshot()` exactly like
 * the worker host -- `src/persistence/session/runtime-host.ts` says so in
 * terms, and `docs/PERSISTENCE.md` rests a section on it. The last case here
 * covers what that host cannot: the real
 * `SimulationWorkerChannel` -> `WorkerPerSessionHost` composition, where the
 * outgoing worker is genuinely shut down and terminated, so the *ordering*
 * has to be right rather than merely present.
 */

const TICKS_BEFORE_THE_SECOND_PRISON = 211;

function buildInProcessFixture(host: SessionRuntimeHost = new InProcessSessionHost()) {
  const store = new MemoryLocalSaveStore();
  const repository = new PrisonSaveRepository(store);
  const controller = new SessionController(repository, host, { gameVersion: 'test-version' });
  return { store, repository, controller, host };
}

/** Steps the live in-process kernel, which is what "play" means to a save. */
function play(host: InProcessSessionHost, ticks: number): number {
  const runtime = host.getRuntime();
  if (runtime === undefined) throw new Error('no simulation is running; the fixture is wrong, not the code under test');
  for (let i = 0; i < ticks; i += 1) runtime.kernel.step();
  return runtime.kernel.tick;
}

/**
 * A save that decodes, migrates and checksums and that
 * `SparseWorld.fromSnapshot` refuses: the terrain RLE covers 5 tiles of a
 * 32x32 chunk. Written by a real session first, so nothing here hand-builds a
 * payload the worker never wrote -- the same fixture shape as
 * `tests/integration/session-second-load.test.ts`, for the reason that file
 * gives: two fakes of one format drift apart, and the one that drifts is the
 * one still passing.
 */
function unrestorableEnvelope(prisonId: string, revision: number): SaveEnvelope {
  const bundle = captureSessionSnapshot(createNewSimulationRuntime(1));
  const good = createSaveEnvelope({
    gameVersion: 'test-version',
    prisonId,
    revision,
    createdAt: 1,
    updatedAt: revision,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  }).payload;
  const payload = {
    ...good,
    world: {
      version: 1,
      chunkSize: 32,
      ownedChunks: [],
      chunks: [{ x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false, terrain: [[1, 5]] }],
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

function liveTick(host: InProcessSessionHost): number {
  const runtime = host.getRuntime();
  if (runtime === undefined) throw new Error('no simulation is running; the fixture is wrong, not the code under test');
  return runtime.kernel.tick;
}

describe('a second prison keeps the first one (#943)', () => {
  it('creating a second prison preserves the tick the first one had reached, with nothing ever marked dirty', async () => {
    const host = new InProcessSessionHost();
    const { controller } = buildInProcessFixture(host);

    await controller.createPrison('prison-a', 'A');
    const tickBefore = play(host, TICKS_BEFORE_THE_SECOND_PRISON);
    expect(tickBefore).toBe(TICKS_BEFORE_THE_SECOND_PRISON);

    // The case the autosave cannot cover: watched, never played, so no command
    // was ever accepted and nothing ever called `markDirty`. Asserted rather
    // than assumed, because it is the whole reason the capture must not be
    // conditional on it.
    expect(controller.hasPendingAutosave()).toBe(false);

    await controller.createPrison('prison-b', 'B');
    expect(controller.getActiveSession()?.prisonId).toBe('prison-b');

    const outcome = await controller.loadPrison('prison-a');
    expect(outcome).toMatchObject({ ok: true });
    // Before the fix: 0. The prison came back as if it had never been played.
    expect(liveTick(host)).toBe(TICKS_BEFORE_THE_SECOND_PRISON);
  });

  it('reports the save it took on the outgoing prison, naming that prison and not the new one', async () => {
    const host = new InProcessSessionHost();
    const { controller } = buildInProcessFixture(host);

    await controller.createPrison('prison-a', 'A');
    expect(controller.getLastOutgoingCapture()).toBeUndefined(); // nothing was replaced

    play(host, 40);
    await controller.createPrison('prison-b', 'B');

    expect(controller.getLastOutgoingCapture()).toMatchObject({ prisonId: 'prison-a', result: { ok: true } });
  });

  it('spends no generation on the very first prison, which replaces nothing', async () => {
    const { controller, repository } = buildInProcessFixture();

    await controller.createPrison('prison-a', 'A');

    // The unconditional capture must not turn "one generation, written
    // immediately" (`createPrison`'s own promise) into two.
    expect((await repository.list())[0]?.generationIds).toHaveLength(1);
  });

  it('loading another prison preserves the tick the live one had reached', async () => {
    const host = new InProcessSessionHost();
    const { controller } = buildInProcessFixture(host);

    await controller.createPrison('prison-a', 'A');
    await controller.createPrison('prison-b', 'B');
    const tickBefore = play(host, 137);

    expect(controller.hasPendingAutosave()).toBe(false);
    expectOk(await controller.loadPrison('prison-a'), 'the load of prison-a');

    // `docs/research/2026-09-04-does-a-prison-come-back.md` measured 2,461
    // ticks discarded by one Load press with zero dialogs. This is the half of
    // that a save can answer: the prison the player was in is on disk.
    expectOk(await controller.loadPrison('prison-b'), 'the load of prison-b');
    expect(liveTick(host)).toBe(tickBefore);
  });

  it('a failed capture of the outgoing prison is recorded, and does not refuse the new prison', async () => {
    const inner = new InProcessSessionHost();
    let failNextCapture = false;
    const host: SessionRuntimeHost = {
      startNew: (seed) => inner.startNew(seed),
      startFromSnapshot: (bundle) => inner.startFromSnapshot(bundle),
      capture: async () => {
        if (failNextCapture) {
          failNextCapture = false;
          throw new Error('The simulation worker did not reply within 15000ms.');
        }
        return inner.capture();
      },
      stop: () => inner.stop(),
    };
    const { controller, repository } = buildInProcessFixture(host);

    await controller.createPrison('prison-a', 'A');
    failNextCapture = true;

    // A wedged worker must not leave the player unable to start a session that
    // works -- ADR 0096's "zawsze musi istnieć droga powrotu".
    const created = await controller.createPrison('prison-b', 'B');
    expectOk(created, 'the creation of prison-b while prison-a was live');
    expect(controller.getActiveSession()?.prisonId).toBe('prison-b');

    expect(controller.getLastOutgoingCapture()).toMatchObject({
      prisonId: 'prison-a',
      result: { ok: false, error: { message: expect.stringMatching(/did not reply/) } },
    });
    // The prison that could not be captured still has the generation it had.
    expectOk(await repository.loadCurrent('prison-a'), "prison-a's current generation");
  });
});

/**
 * The other half of #943, and the half the issue was wrong about.
 *
 * The issue asked for Load to be fixed "the same" way, on the grounds that it
 * has "the identical property". Loading a *different* prison does, and the
 * cases above cover it. Loading the prison that is **already live** does not,
 * and the reason is the recovery walk rather than anything a player sees: a
 * save taken there writes a new generation of *the prison being loaded*, into
 * the retained window `loadPrison` is in the middle of walking.
 *
 * **Two readings of that were checked by mutation and only one survived.** The
 * plausible one -- that the load would hand the fresh generation straight back,
 * making Import a no-op and Load on the active row an inert control -- is
 * **false**: `loadCurrent` has already read the bundle by the time the capture
 * would run, so the happy path is untouched either way, and a build with the
 * identity check removed passed both the revert and the Import round trip. What
 * it did not pass is the walk: three existing cases in
 * `tests/unit/persistence-session-controller.test.ts` and
 * `tests/integration/session-restore-failure.test.ts` went red, because a
 * prison whose retained saves refuse to restore was "recovered" to the state
 * the player was already in. The second case below is that, stated directly.
 */
describe('loading the prison that is already live does not save it first (#943)', () => {
  it('spends no generation of the retained window on the state being reverted away from', async () => {
    const host = new InProcessSessionHost();
    const { controller, repository } = buildInProcessFixture(host);

    await controller.createPrison('prison-a', 'A');
    play(host, 50);
    expectOk(await controller.saveNow(), 'the save');
    const windowBefore = (await repository.list())[0]?.generationIds ?? [];
    play(host, 70);
    expect(liveTick(host)).toBe(120);

    expectOk(await controller.loadPrison('prison-a'), 'the load of prison-a');

    // The panel offers exactly one Load per prison and it gives the newest
    // generation (`docs/research/2026-09-04-does-a-prison-come-back.md` §3.1),
    // so Load on the active row is the revert gesture, and the window it
    // reverts through is a recovery mechanism rather than a set of save slots
    // (`docs/PERSISTENCE.md`).
    expect(liveTick(host)).toBe(50);
    expect((await repository.list())[0]?.generationIds).toEqual(windowBefore);
    expect(controller.getLastOutgoingCapture()).toBeUndefined();
  });

  it('does not put a fresh generation in front of the recovery walk, so a prison with no restorable save still says so', async () => {
    const host = new InProcessSessionHost();
    const { controller, repository } = buildInProcessFixture(host);

    // Generation 1 is the good save, taken at tick 0 by `createPrison`.
    await controller.createPrison('prison-a', 'A');
    // Generation 2 decodes, migrates and checksums, and `SparseWorld.fromSnapshot`
    // refuses it -- the shape `session-restore-failure.test.ts` and
    // `session-second-load.test.ts` both use, for the same reason: those
    // semantic checks are exactly the saves `save-schema.ts` cannot judge.
    expectOk(await repository.save('prison-a', unrestorableEnvelope('prison-a', 2)), 'the unrestorable generation 2');
    play(host, 200);

    const outcome = await controller.loadPrison('prison-a');
    expect(outcome).toMatchObject({ ok: true, recovered: true });

    // Tick 0 -- the player's own generation 1. A capture taken before the walk
    // would have written tick 200 as a *newer* generation of this prison, and
    // the retry that follows the refusal would have restored that instead: the
    // load would report a recovery having restored the session the player was
    // already in, and the refused generation would be retired against evidence
    // that never existed.
    expect(liveTick(host)).toBe(0);
    expect(controller.getLastOutgoingCapture()).toBeUndefined();
  });

  it('still lets Import replace the live session', async () => {
    const host = new InProcessSessionHost();
    const { controller } = buildInProcessFixture(host);

    await controller.createPrison('prison-a', 'A');
    play(host, 40);
    expectOk(await controller.saveNow(), 'the save');
    const exported = await controller.exportActive();
    expect(exported).toBeDefined();
    const throughFile: unknown = JSON.parse(JSON.stringify(exported));

    // Play on past the file, then import it and load, which is exactly what
    // the save panel's Import control does: `requestImport` calls
    // `importInto(session.prisonId, ...)` and then
    // `loadPrison(session.prisonId)` -- the same prison. Nothing else in the
    // suite imports into the *active* prison, which is the only shape that
    // control has.
    play(host, 300);
    expect(liveTick(host)).toBe(340);
    expectOk(await controller.importInto('prison-a', throughFile), 'the import into prison-a');
    expectOk(await controller.loadPrison('prison-a'), 'the load of prison-a');

    expect(liveTick(host)).toBe(40);
    expect(controller.getLastOutgoingCapture()).toBeUndefined();
  });
});

/**
 * The composition `src/main.ts` actually builds, where the outgoing session
 * does not merely get overwritten in a field: `WorkerPerSessionHost.beginSession`
 * shuts the outgoing worker down and the channel terminates it before the next
 * session claims one. So the capture has to happen *before* that, and a capture
 * placed one line late would not fail loudly -- it would write the **new**
 * prison's world under the **old** prison's id, which is worse than writing
 * nothing.
 */
describe('a second prison keeps the first one through the real worker composition (#943, #149)', () => {
  const SEED_A = 111;
  const SEED_B = 222;

  it('writes the outgoing prison a generation of its own world while its worker is still alive', async () => {
    const workers: LoopbackWorker[] = [];
    const channel = new SimulationWorkerChannel(() => {
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
    const seeds = [SEED_A, SEED_B];
    const controller = new SessionController(repository, new WorkerPerSessionHost(channel), {
      gameVersion: 'test-version',
      generateMasterSeed: () => seeds.shift() ?? -1,
    });

    expectOk(await controller.createPrison('prison-a', 'A'), 'the creation of prison-a');
    expectOk(await controller.createPrison('prison-b', 'B'), 'the creation of prison-b');

    const [slotA] = (await repository.list()).filter((slot) => slot.prisonId === 'prison-a');
    expect(slotA?.generationIds).toEqual(['gen-1', 'gen-2']);

    // The assertion that pins the *ordering* rather than the existence of a
    // second write: the generation taken on prison A's way out has to carry
    // prison A's seed. A capture after `startNew` would have captured the
    // replacement's world and filed it under prison A -- a save that loads,
    // reports success, and is the wrong prison.
    const loaded = await repository.loadCurrent('prison-a');
    expectOk(loaded, "prison-a's current generation");
    if (!loaded.ok) return;
    expect(loaded.generationId).toBe('gen-2');
    expect((loaded.envelope.payload as unknown as { readonly masterSeed?: number }).masterSeed).toBe(SEED_A);

    // Two sessions, two workers, and the first was shut down and terminated on
    // its way out -- which is what makes the ordering above load-bearing.
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminated).toBe(true);
    expect(workers.map((worker) => worker.undecodableWorkerMessages)).toEqual([[], []]);
  });
});
