import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { InProcessSessionHost, type SessionRuntimeHost } from '../../src/persistence/session/runtime-host';
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

  it('reports what a V1 save does and does not carry, rather than implying a full restore', async () => {
    const { controller } = buildController();
    await controller.createPrison('prison-1');
    await controller.saveNow();
    controller.closeSession();

    const outcome = await controller.loadPrison('prison-1');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.scope.restored).toContain('world terrain and ownership');
    expect(outcome.scope.notCarriedByThisSaveVersion.length).toBeGreaterThan(0);
    expect(outcome.scope.notCarriedByThisSaveVersion).toContain('incidents and gangs');
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
      const metadata = await tx.getMetadata('prison-1');
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
      const metadata = await tx.getMetadata('prison-1');
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
