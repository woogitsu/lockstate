import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository, type SaveResult } from '../../src/persistence/local/repository';
import { decodePrisonSlotMetadata } from '../../src/persistence/local/slot-metadata-schema';
import { InProcessSessionHost, type SessionRuntimeHost } from '../../src/persistence/session/runtime-host';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import type { SaveEnvelope } from '../../src/persistence/save-schema';
import { SessionController } from '../../src/persistence/session/session-controller';
import { packCommand } from '../../src/simulation/protocol/commands';

function buildController(options: { readonly autosaveIntervalMs?: number; readonly store?: MemoryLocalSaveStore } = {}) {
  const store = options.store ?? new MemoryLocalSaveStore();
  const repository = new PrisonSaveRepository(store);
  const saveResults: { prisonId: string; ok: boolean }[] = [];
  const host = new InProcessSessionHost();
  const controller = new SessionController(repository, host, {
    gameVersion: 'test-version',
    ...(options.autosaveIntervalMs === undefined ? {} : { autosaveIntervalMs: options.autosaveIntervalMs }),
    onSaveResult: (prisonId: string, result: { ok: boolean }) => saveResults.push({ prisonId, ok: result.ok }),
  });
  return { store, repository, controller, saveResults, host };
}

describe('SessionController: create/save/load a prison entirely offline', () => {
  it('creates a prison, makes it active and writes generation 1 immediately', async () => {
    const { controller, repository } = buildController();

    const result = await controller.createPrison('prison-1', 'Alcatraz');
    expect(result.ok).toBe(true);

    const session = controller.getActiveSession();
    expect(session?.prisonId).toBe('prison-1');
    expect(session?.revision).toBe(1);

    // Durable before the player does anything -- a crash right after "New prison"
    // must not leave a slot with no readable generation.
    const loaded = await repository.loadCurrent('prison-1');
    expect(loaded.ok).toBe(true);
  });

  it('lists created prisons through the repository', async () => {
    const { controller } = buildController();
    await controller.createPrison('prison-a', 'A');
    await controller.createPrison('prison-b', 'B');

    const prisons = await controller.listPrisons();
    expect(prisons.map((prison) => prison.prisonId).sort()).toEqual(['prison-a', 'prison-b']);
  });

  it('round-trips simulation state: a tick advanced before saving is present after loading', async () => {
    const { controller, host } = buildController();
    await controller.createPrison('prison-1');

    const runtime = host.getRuntime()!;
    for (let i = 0; i < 25; i += 1) runtime.kernel.step();
    const tickBeforeSave = runtime.kernel.tick;
    expect(tickBeforeSave).toBe(25);

    expect((await controller.saveNow()).ok).toBe(true);

    controller.closeSession();
    expect(controller.getActiveSession()).toBeUndefined();

    const outcome = await controller.loadPrison('prison-1');
    expect(outcome.ok).toBe(true);
    expect(host.getRuntime()!.kernel.tick).toBe(tickBeforeSave);
  });

  it('round-trips construction orders placed through the real command path', async () => {
    const { controller, host } = buildController();
    await controller.createPrison('prison-1');

    const runtime = host.getRuntime()!;
    runtime.kernel.submitCommand('build-1', 0, 0, packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-1', definitionId: 'wall-brick', x: 1, y: 1 }));
    runtime.kernel.step();
    expect(runtime.construction.getOrder('wall-1')).toBeDefined();

    await controller.saveNow();
    controller.closeSession();
    await controller.loadPrison('prison-1');

    expect(host.getRuntime()!.construction.getOrder('wall-1')).toBeDefined();
  });

  it('reports what a save does and does not carry, rather than implying a full restore', async () => {
    const { controller } = buildController();
    await controller.createPrison('prison-1');
    await controller.saveNow();
    controller.closeSession();

    const outcome = await controller.loadPrison('prison-1');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // Message keys since #226; the text they resolve to is pinned in
    // `tests/unit/restored-scope.test.ts` against the bundled catalog.
    const restored = outcome.scope.restored.map((entry) => entry.labelKey);
    const notCarried = outcome.scope.notCarriedByThisSaveVersion.map((entry) => entry.labelKey);
    expect(restored).toContain('save.scope.world');
    expect(restored).toContain('save.scope.incidents');
    // Still a non-empty list, and still shown: what a save leaves behind is
    // now derived/in-flight state rather than whole subsystems, but the UI
    // must keep saying so rather than implying a perfect restore.
    expect(notCarried.length).toBeGreaterThan(0);
    expect(notCarried).toContain('save.scope.navigation-caches');
  });

  it('increments revision on each successful save', async () => {
    const { controller } = buildController();
    await controller.createPrison('prison-1');
    expect(controller.getActiveSession()!.revision).toBe(1);

    await controller.saveNow();
    expect(controller.getActiveSession()!.revision).toBe(2);
    await controller.saveNow();
    expect(controller.getActiveSession()!.revision).toBe(3);
  });

  it('records pending-sync bookkeeping separately from the prison payload, without needing any cloud client', async () => {
    const { controller, repository } = buildController();
    await controller.createPrison('prison-1');
    await controller.saveNow();

    const [metadata] = await repository.list();
    expect(metadata!.pendingSync?.dirtySinceRevision).toBe(controller.getActiveSession()!.revision);
    // The payload itself carries no sync state -- it lives on slot metadata.
    const loaded = await repository.loadCurrent('prison-1');
    expect(loaded.ok && Object.keys(loaded.envelope.payload)).not.toContain('pendingSync');
  });

  it('deletes a prison and closes it if it was active', async () => {
    const { controller } = buildController();
    await controller.createPrison('prison-1');
    expect(controller.getActiveSession()).toBeDefined();

    await controller.deletePrison('prison-1');
    expect(controller.getActiveSession()).toBeUndefined();
    expect(await controller.listPrisons()).toEqual([]);
  });
});

describe('SessionController: durable failure evidence', () => {
  it('saveNow with no active session fails rather than silently succeeding', async () => {
    const { controller } = buildController();
    const result = await controller.saveNow();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toMatch(/No active session/);
  });

  it('surfaces a classified quota failure and leaves the previous generation intact', async () => {
    const { controller, store, repository } = buildController();
    await controller.createPrison('prison-1');

    const quotaError = new Error('The quota has been exceeded.');
    quotaError.name = 'QuotaExceededError';
    store.failNextWrite = quotaError;

    const result = await controller.saveNow();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('quota-exceeded');
    expect(controller.getLastSaveResult()).toBe(result);

    // The pre-failure generation is still loadable -- a failed write never destroys it.
    expect((await repository.loadCurrent('prison-1')).ok).toBe(true);
  });

  it('reports a missing prison and a prison with no readable generation distinctly', async () => {
    const { controller, store } = buildController();
    expect(await controller.loadPrison('never-existed')).toEqual({ ok: false, reason: 'not-found' });

    await controller.createPrison('prison-1');
    // Corrupt every retained generation.
    await store.runTransaction('readwrite', async (tx) => {
      const metadata = decodePrisonSlotMetadata(await tx.getMetadata('prison-1'), 'prison-1');
      for (const generationId of metadata!.generationIds) {
        await tx.putGeneration('prison-1', generationId, { saveSchemaVersion: 1, garbage: true });
      }
    });

    expect(await controller.loadPrison('prison-1')).toEqual({ ok: false, reason: 'no-valid-generation' });
  });

  it('flags a load that fell back to an earlier generation as recovered', async () => {
    const { controller, store } = buildController();
    await controller.createPrison('prison-1');
    await controller.saveNow(); // a second, newer generation

    // Corrupt only the newest generation; the previous one stays good.
    await store.runTransaction('readwrite', async (tx) => {
      const metadata = decodePrisonSlotMetadata(await tx.getMetadata('prison-1'), 'prison-1');
      const newest = metadata!.generationIds[metadata!.generationIds.length - 1]!;
      await tx.putGeneration('prison-1', newest, { saveSchemaVersion: 1, garbage: true });
    });

    const outcome = await controller.loadPrison('prison-1');
    expect(outcome.ok && outcome.recovered).toBe(true);
  });
});

describe('SessionController: autosave coalescing and non-overlap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    return () => vi.useRealTimers();
  });

  it('coalesces many dirty markers into a single trailing-edge save', async () => {
    const { controller, saveResults } = buildController({ autosaveIntervalMs: 1_000 });
    await controller.createPrison('prison-1');
    saveResults.length = 0; // ignore the create-time save

    for (let i = 0; i < 20; i += 1) controller.markDirty();
    expect(controller.hasPendingAutosave()).toBe(true);
    expect(saveResults).toHaveLength(0); // nothing written yet

    await vi.advanceTimersByTimeAsync(1_000);
    expect(saveResults).toHaveLength(1);
    expect(saveResults[0]).toEqual({ prisonId: 'prison-1', ok: true });
  });

  it('does not autosave when nothing was marked dirty', async () => {
    const { controller, saveResults } = buildController({ autosaveIntervalMs: 1_000 });
    await controller.createPrison('prison-1');
    saveResults.length = 0;

    await vi.advanceTimersByTimeAsync(5_000);
    expect(saveResults).toHaveLength(0);
  });

  it('advances the session revision on a successful autosave', async () => {
    const { controller } = buildController({ autosaveIntervalMs: 1_000 });
    await controller.createPrison('prison-1');
    const revisionAfterCreate = controller.getActiveSession()!.revision;

    controller.markDirty();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(controller.getActiveSession()!.revision).toBe(revisionAfterCreate + 1);
  });

  it('stops autosaving for a session that was closed before the timer fired', async () => {
    const { controller, saveResults } = buildController({ autosaveIntervalMs: 1_000 });
    await controller.createPrison('prison-1');
    saveResults.length = 0;

    controller.markDirty();
    controller.closeSession();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(saveResults).toHaveLength(0);
  });

  it('markDirty with no active session is a no-op rather than an error', () => {
    const { controller } = buildController({ autosaveIntervalMs: 1_000 });
    expect(() => controller.markDirty()).not.toThrow();
    expect(controller.hasPendingAutosave()).toBe(false);
  });

  /**
   * The scheduler's own guard proved against the wiring that actually
   * produces the failure.
   *
   * `buildEnvelope` here is the controller's real one, so the rejection comes
   * from `host.capture()` -- a worker that faulted, hung or went away, which
   * is the *ordinary* mid-session failure rather than an exotic one. Before
   * `performSave` had a `try/finally`, that single rejection left the prison
   * parked in `'saving'`: no follow-up was ever scheduled, every later
   * `markDirty` was silently dropped, and autosave was over for the session
   * with an unhandled rejection as the only evidence.
   */
  it('reports a capture failure and keeps autosaving afterwards', async () => {
    const repository = new PrisonSaveRepository(new MemoryLocalSaveStore());
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
    const results: SaveResult[] = [];
    const controller = new SessionController(repository, host, {
      gameVersion: 'test-version',
      autosaveIntervalMs: 1_000,
      onSaveResult: (_prisonId, result) => results.push(result),
    });

    await controller.createPrison('prison-1');
    results.length = 0; // ignore the create-time save

    failNextCapture = true;
    controller.markDirty();
    await vi.advanceTimersByTimeAsync(1_000);

    // Reported, with the cause, to the surface the save panel reads.
    expect(results).toHaveLength(1);
    const failure = results[0]!;
    expect(failure.ok).toBe(false);
    expect(!failure.ok && failure.error.message).toContain('The simulation worker did not reply');
    expect(controller.getLastSaveResult()).toBe(failure);
    expect(controller.hasPendingAutosave()).toBe(false);

    controller.markDirty();
    await vi.advanceTimersByTimeAsync(1_000);

    // A real write, identified by the revision it carries: the create-time
    // save was revision 1, the failed autosave advanced nothing, so this is
    // revision 2.
    expect(results.at(-1)).toMatchObject({ ok: true });
    const loaded = await repository.loadCurrent('prison-1');
    expect(loaded.ok && loaded.envelope.revision).toBe(2);
  });
});

describe('SessionController: export/import through schema validation', () => {
  it('exports the active save and re-imports it into a fresh prison', async () => {
    const { controller, host } = buildController();
    await controller.createPrison('source-prison');
    const runtime = host.getRuntime()!;
    for (let i = 0; i < 10; i += 1) runtime.kernel.step();
    await controller.saveNow();

    const exported = await controller.exportActive();
    expect(exported).toBeDefined();
    expect(exported!.prisonId).toBe('source-prison');

    // A round-trip through JSON, exactly like a real exported file.
    const throughFile: unknown = JSON.parse(JSON.stringify(exported));
    await controller.createPrison('target-prison');
    const imported = await controller.importInto('target-prison', throughFile);
    expect(imported.ok).toBe(true);
  });

  it('rejects a corrupt import before anything reaches storage', async () => {
    const { controller, repository } = buildController();
    await controller.createPrison('prison-1');
    const generationsBefore = (await repository.list())[0]!.generationIds.length;

    const result = await controller.importInto('prison-1', { saveSchemaVersion: 1, nonsense: true });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toMatch(/Import rejected/);

    expect((await repository.list())[0]!.generationIds).toHaveLength(generationsBefore);
  });

  it('rejects an import whose checksum does not match its payload', async () => {
    const { controller } = buildController();
    await controller.createPrison('prison-1');
    await controller.saveNow();
    const exported = await controller.exportActive();

    const tampered = { ...JSON.parse(JSON.stringify(exported)), checksum: '0000000000000000' };
    const result = await controller.importInto('prison-1', tampered);
    expect(result.ok).toBe(false);
  });

  it('exportActive returns undefined when there is no active session', async () => {
    const { controller } = buildController();
    expect(await controller.exportActive()).toBeUndefined();
  });
});

describe('SessionController: a failed createPrison leaves no slot behind (#65)', () => {
  /**
   * Wraps a real host so one method can be made to fail. Using the real host
   * for everything else keeps these tests about the rollback rather than about
   * a stub's fidelity.
   */
  function hostThatFails(which: 'startNew' | 'capture'): SessionRuntimeHost {
    const inner = new InProcessSessionHost();
    return {
      startNew: async (seed: number) => {
        if (which === 'startNew') throw new Error('The simulation worker did not reply within 15000ms.');
        return inner.startNew(seed);
      },
      startFromSnapshot: (bundle) => inner.startFromSnapshot(bundle),
      capture: async () => {
        if (which === 'capture') throw new Error('The simulation worker did not reply within 15000ms.');
        return inner.capture();
      },
      stop: () => inner.stop(),
    };
  }

  function controllerWith(host: SessionRuntimeHost, store = new MemoryLocalSaveStore()) {
    const repository = new PrisonSaveRepository(store);
    const controller = new SessionController(repository, host, { gameVersion: 'test-version' });
    return { repository, controller };
  }

  it('deletes the slot when the worker never starts the session', async () => {
    const { repository, controller } = controllerWith(hostThatFails('startNew'));

    await expect(controller.createPrison('prison-1')).rejects.toThrow(/did not reply/);

    // The defect this pins: the slot was written before the worker was asked,
    // so without a rollback it survives with zero generations and shows up in
    // the prison list as a row that can never be loaded.
    expect(await repository.list()).toEqual([]);
  });

  it('deletes the slot when the session starts but generation 1 cannot be written', async () => {
    const { repository, controller } = controllerWith(hostThatFails('capture'));

    // `saveNow` reports failure as a value rather than throwing, so this path
    // is invisible to a try/catch and needs its own rollback.
    const result = await controller.createPrison('prison-1');
    expect(result.ok).toBe(false);

    expect(await repository.list()).toEqual([]);
    expect(controller.getActiveSession()).toBeUndefined();
  });

  it('leaves an existing session untouched when creation fails before adoption', async () => {
    const store = new MemoryLocalSaveStore();
    const { controller: first } = controllerWith(new InProcessSessionHost(), store);
    await first.createPrison('prison-keep', 'Keep me');

    // Same store, a controller whose host cannot start: the failure happens
    // before adoption, so nothing about the earlier prison may change.
    const { repository, controller } = controllerWith(hostThatFails('startNew'), store);
    await expect(controller.createPrison('prison-doomed')).rejects.toThrow(/did not reply/);

    expect((await repository.list()).map((prison) => prison.prisonId)).toEqual(['prison-keep']);
    expect((await repository.loadCurrent('prison-keep')).ok).toBe(true);
  });

  it('still creates normally when nothing fails', async () => {
    const { repository, controller } = controllerWith(new InProcessSessionHost());

    expect((await controller.createPrison('prison-1')).ok).toBe(true);
    expect((await repository.list()).map((prison) => prison.prisonId)).toEqual(['prison-1']);
    expect((await repository.list())[0]!.generationIds).toHaveLength(1);
  });
});

/**
 * Issue #103, defect 1: generation rollback only ever covered *decode*
 * failures. A save that passes schema, migration and checksum and then fails
 * semantic restore was returned as `{ ok: true, outcome: 'current' }`, so it
 * stayed current for ever and every later load in that tab retried it —
 * exactly the situation `PrisonSaveRepository`'s rollback exists to recover
 * from.
 *
 * Such saves are not hypothetical: `save-schema.ts` deliberately does not
 * duplicate `SparseWorld.fromSnapshot`'s semantic checks, so every one of
 * those checks describes a save that decodes and cannot be restored.
 */
describe('SessionController: a save that decodes but cannot be restored is demoted (#103)', () => {
  /**
   * Structurally valid, semantically impossible: the terrain RLE covers 5
   * tiles of a 32x32 chunk. The save schema accepts it (it validates the RLE
   * as pairs of integers, not against the chunk's size), and
   * `SparseWorld.fromSnapshot` rejects it with a `WorldSnapshotError`.
   */
  const UNRESTORABLE_WORLD = {
    version: 1,
    chunkSize: 32,
    ownedChunks: [],
    chunks: [
      { x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false, terrain: [[1, 5]] },
    ],
  };

  /** Writes a newest generation whose envelope is valid and whose payload cannot be restored. */
  async function saveUnrestorableGeneration(repository: PrisonSaveRepository, prisonId: string): Promise<void> {
    const current = await repository.loadCurrent(prisonId);
    if (!current.ok) throw new Error('this fixture needs one good generation first');

    const broken = JSON.parse(JSON.stringify(current.envelope)) as {
      revision: number;
      updatedAt: number;
      checksum: string;
      payload: { world: unknown };
    };
    broken.payload.world = UNRESTORABLE_WORLD;
    broken.revision += 1;
    broken.updatedAt += 1;
    broken.checksum = computeSaveChecksum(broken.payload as never);

    // Through the ordinary write path, so the save is stored only if it is
    // genuinely schema- and checksum-valid.
    const written = await repository.save(prisonId, broken as unknown as SaveEnvelope);
    expect(written.ok).toBe(true);
  }

  it('demotes the unrestorable generation, loads the previous one and reports the load as recovered', async () => {
    const { controller, repository, host } = buildController();
    await controller.createPrison('prison-1');
    const runtime = host.getRuntime()!;
    for (let i = 0; i < 7; i += 1) runtime.kernel.step();
    await controller.saveNow(); // a good generation carrying tick 7
    await saveUnrestorableGeneration(repository, 'prison-1');

    const outcome = await controller.loadPrison('prison-1');

    expect(outcome).toMatchObject({ ok: true, recovered: true });
    expect(host.getRuntime()!.kernel.tick).toBe(7);
  });

  it('leaves nothing behind for the next load to pick', async () => {
    const { controller, repository } = buildController();
    await controller.createPrison('prison-1');
    await controller.saveNow();
    await saveUnrestorableGeneration(repository, 'prison-1');

    await controller.loadPrison('prison-1');

    // The demoted generation is gone from the window and from storage, so the
    // next load is an ordinary `current` load rather than a repeat of the
    // failure.
    const reloaded = await controller.loadPrison('prison-1');
    expect(reloaded).toMatchObject({ ok: true, recovered: false });

    // Three generations were written (create, save, the unrestorable one) and
    // the third is gone from the window, with the pointer on its predecessor.
    const [metadata] = await repository.list();
    expect(metadata!.generationIds).toHaveLength(2);
    expect(metadata!.currentGenerationId).toBe(metadata!.generationIds[1]);

    const loaded = await repository.loadCurrent('prison-1');
    expect(loaded.ok && loaded.outcome).toBe('current');
    expect(loaded.ok && JSON.stringify(loaded.envelope.payload.world)).not.toBe(JSON.stringify(UNRESTORABLE_WORLD));
  });

  it('reports no-valid-generation when every generation fails to restore', async () => {
    const { controller, repository } = buildController();
    await controller.createPrison('prison-1');
    await saveUnrestorableGeneration(repository, 'prison-1');
    // Demote the good generation too, leaving only unrestorable ones.
    const metadataBefore = (await repository.list())[0]!;
    await repository.demoteGeneration('prison-1', metadataBefore.generationIds[0]!);

    expect(await controller.loadPrison('prison-1')).toEqual({ ok: false, reason: 'no-valid-generation' });
    // The slot survives: the player still sees the prison, and is told its
    // saves are unreadable rather than finding it silently deleted.
    expect(await repository.list()).toHaveLength(1);
  });

  it('demotes nothing when the host itself failed rather than the save', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    const inner = new InProcessSessionHost();
    let failNextRestore = false;
    const host: SessionRuntimeHost = {
      startNew: (seed) => inner.startNew(seed),
      startFromSnapshot: async (bundle) => {
        if (failNextRestore) throw new Error('The simulation worker did not reply within 15000ms.');
        return inner.startFromSnapshot(bundle);
      },
      capture: () => inner.capture(),
      stop: () => inner.stop(),
    };
    const controller = new SessionController(repository, host, { gameVersion: 'test-version' });

    await controller.createPrison('prison-1');
    await controller.saveNow();
    const before = (await repository.list())[0]!;

    failNextRestore = true;
    // A timeout is not evidence about the save. It propagates, and the
    // generation window is untouched -- deleting the newest good save because
    // the worker was busy would be the more expensive mistake.
    await expect(controller.loadPrison('prison-1')).rejects.toThrow(/did not reply/);

    const after = (await repository.list())[0]!;
    expect(after.generationIds).toEqual(before.generationIds);
    expect(after.currentGenerationId).toBe(before.currentGenerationId);
  });
});
