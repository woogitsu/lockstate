import { describe, expect, it, vi } from 'vitest';
import { SnapshotRestoreFaultError, type SessionRuntimeHost } from '../../src/persistence/session/runtime-host';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { SessionController, type SessionLoadOutcome } from '../../src/persistence/session/session-controller';
import { WorkerSessionHost } from '../../src/persistence/session/worker-session-host';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, SAVE_SCHEMA_VERSION, type SaveEnvelope } from '../../src/persistence/save-schema';
import type { SimulationClient } from '../../src/simulation/worker/client';
import { LoopbackWorker } from '../helpers/loopback-worker';
import { createNewSimulationRuntime, DEFAULT_PRISONER_CAPACITY } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { decodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from '../../src/simulation/entity/entity-codec';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import v1InProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';
import { expectOk } from '../helpers/expect-ok';

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

/**
 * A save that decodes, checksums and **is not refused by anything** -- the
 * restore path throws where no declared check is watching (#431).
 *
 * Its `kernel.rngStates` names one stream twice. That passes the save schema
 * (`rngStates: z.array(...)` has no name set and no uniqueness rule -- ADR
 * 0038 records that a save carrying three streams, or zero, decodes `ok:true`)
 * and is then refused by `NamedRngStreams`' constructor with a bare
 * `RangeError`. That constructor is shared with a live session, so
 * `src/simulation/runtime/restore-refusal.ts` deliberately leaves it
 * undeclared: relabelling it would tell a developer who mistyped a stream name
 * in code that a save was bad. So this payload is exactly the shape the
 * taxonomy blames on *us*, produced by the production path rather than by an
 * injected failure -- no stub host, no thrown-in error.
 *
 * The terrain runs cover the chunk's full 1,024 tiles and split at `revision`,
 * so the world restores cleanly (the RNG is the only thing wrong) and a
 * surviving record still identifies itself by its own bytes.
 */
function codeFaultEnvelope(revision: number): SaveEnvelope {
  const base = goodPayload(1);
  const first = base.kernel.rngStates[0];
  if (first === undefined) throw new Error('A fresh capture carries four RNG streams; this fixture is wrong.');
  const payload = {
    ...base,
    kernel: { ...base.kernel, rngStates: [first, first] },
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

/**
 * A build whose restore path accepts what this one refuses.
 *
 * Used by exactly one test, for the one thing a single process cannot supply:
 * a *second build*. It fakes no verdict and injects no failure -- it stands in
 * for the build that wrote the save, whose entity store is wide enough for its
 * ledger, and it records the bundle it was handed so the test can assert which
 * generation the repository offered rather than that a load returned `ok`.
 *
 * Deliberately not an `InProcessSessionHost` subclass: that host runs *this*
 * build's `restoreSimulationRuntime`, so it refuses the same payload for the
 * same reason and could stand in for nothing.
 */
class AcceptingHost implements SessionRuntimeHost {
  public received: SessionSnapshotBundle | undefined;

  public async startNew(): Promise<void> {
    throw new Error('This host exists to restore a snapshot, not to start a new prison.');
  }

  public async startFromSnapshot(bundle: SessionSnapshotBundle): Promise<void> {
    this.received = bundle;
  }

  public async capture(): Promise<SessionSnapshotBundle> {
    throw new Error('This host holds no simulation to capture.');
  }

  public async stop(): Promise<void> {
    this.received = undefined;
  }
}

describe('a save that decodes and cannot be restored, end to end', () => {
  it('surfaces the real cause immediately rather than as a reply timeout', async () => {
    const { controller, repository } = await buildFixture();
    // The only generation is unrestorable, so there is nothing to recover to
    // and the load must report that -- immediately.
    expectOk(await repository.save(PRISON_ID, unrestorableEnvelope(1) as SaveEnvelope), 'the unrestorable generation 1');

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
    expectOk(await repository.save(PRISON_ID, envelopeWithSeed(4242, 1)), 'the seeded generation 1');
    expectOk(await repository.save(PRISON_ID, unrestorableEnvelope(2) as SaveEnvelope), 'the unrestorable generation 2');

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
    expectOk(await repository.save(PRISON_ID, envelopeWithSeed(4242, 1)), 'the seeded generation 1');
    expectOk(await repository.save(PRISON_ID, unrestorableEnvelope(2) as SaveEnvelope), 'the unrestorable generation 2');

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
    expectOk(await repository.save(PRISON_ID, unrestorableEnvelope(1) as SaveEnvelope), 'the unrestorable generation 1');

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
 * `loadPrison` walks the retained window newest-first, and until #431 the
 * worker could not tell a bad save from a bug in this build's own restore
 * code: `handleInitialize` wrapped `restoreSimulationRuntime` in a catch-all
 * and reported every exception out of it as `snapshot-incompatible`, which
 * `WorkerSessionHost` turned into the `SnapshotRestoreRejectedError` the walk
 * acts on. **It can now**, and the sentence above is kept in the past tense
 * rather than deleted because the bound below is what stood in for the
 * diagnosis and is still the reason a *refusal* costs nothing: every payload
 * in this block is refused by a declared check, so it is a bad save under both
 * regimes. The cases where the fault is ours are the block after this one.
 * Either way the cause is deterministic, so it refuses *every* generation in
 * the window.
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
      expectOk(await repository.save(PRISON_ID, unrestorableEnvelope(revision) as SaveEnvelope), `the unrestorable generation ${String(revision)}`);
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
 * #431: our own defect, told apart from the player's save at the point the
 * deletion decision is made.
 *
 * The block above proves what a *refusal* costs. This one is the other half,
 * and the one the retirement bound was standing in for. Until this issue, an
 * exception out of our own restore code reached `SessionController` as the
 * same `SnapshotRestoreRejectedError` a genuinely bad payload does, so the
 * only thing keeping it from deleting saves was #403 (d)'s rule that nothing
 * is retired until something restores -- a bound, not a diagnosis. Every case
 * below runs on `codeFaultEnvelope`, which the production path refuses with an
 * error no check declared; nothing is stubbed and no failure is injected.
 *
 * What is asserted is not that the walk survives -- it did before -- but that
 * the *reason* is now the one the code arrived at, and that a save the walk
 * cannot judge is left alone even when a different generation restores and
 * unlocks retirement for everything the walk set aside.
 */
describe('a fault in our own restore code costs no generation, and is not called a refusal', () => {
  /**
   * The case the bound cannot cover and the class distinction can.
   *
   * A generation restores here, so retirement runs -- and the older
   * generation the walk could not judge must still be untouched afterwards.
   * Contrast the block above's *"demotes the unrestorable generation, restores
   * the previous one on the same worker"*: same shape, same successful
   * recovery, opposite outcome for the generation that failed, decided
   * entirely by which class the restore path raised.
   */
  it('leaves the generation it could not judge on disk even after a different one restores and retirement runs', async () => {
    const { controller, repository, store } = await buildFixture();
    expectOk(await repository.save(PRISON_ID, restorableEnvelope(1)), 'the restorable generation 1');
    expectOk(await repository.save(PRISON_ID, codeFaultEnvelope(2)), 'the code-fault generation 2');

    vi.useFakeTimers();
    let outcome;
    try {
      outcome = await controller.loadPrison(PRISON_ID);
    } finally {
      vi.useRealTimers();
    }

    // The walk did not stop at our defect: the player has their prison back.
    expect(outcome).toMatchObject({ ok: true, recovered: true });
    expect(controller.getActiveSession()).toMatchObject({ prisonId: PRISON_ID, revision: 1 });
    expect(controller.getLastRetirementFailure()).toBeUndefined();

    // And gen-2 is still there, with its own bytes: the terrain split written
    // for revision 2 and nothing else's, spelled out here rather than read
    // back from the helper that wrote it.
    const stored = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-2'));
    expect(stored).toMatchObject({
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      revision: 2,
      payload: { world: { chunkSize: 32, chunks: [{ x: 0, y: 0, terrain: [[1, 1_022], [1, 2]] }] } },
    });
    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({ generationIds: ['gen-1', 'gen-2'] });
  });

  /**
   * And the answer the player is given when nothing restores.
   *
   * `no-valid-generation` is not a neutral code: the save panel renders it as
   * *"No readable save generation remains for this prison. Every retained copy
   * failed validation."* Nothing validated anything here, so that sentence
   * would be a claim about the player's data that our own defect does not
   * license. The load throws instead, which the panel reports through
   * `save.failure.load` -- "Loading failed: {detail}" -- carrying what
   * actually went wrong. Both keys already exist; neither is new text.
   */
  it('says the load failed rather than that every copy failed validation, and keeps all three saves', async () => {
    const { controller, repository, store } = await buildFixture();
    for (const revision of [1, 2, 3]) {
      expectOk(await repository.save(PRISON_ID, codeFaultEnvelope(revision)), `the code-fault generation ${String(revision)}`);
    }

    vi.useFakeTimers();
    try {
      await expect(controller.loadPrison(PRISON_ID)).rejects.toThrow(SnapshotRestoreFaultError);
    } finally {
      vi.useRealTimers();
    }

    // Every generation still holds the bytes it was written with.
    const expected = [
      { generationId: 'gen-1', revision: 1, terrain: [[1, 1_023], [1, 1]] },
      { generationId: 'gen-2', revision: 2, terrain: [[1, 1_022], [1, 2]] },
      { generationId: 'gen-3', revision: 3, terrain: [[1, 1_021], [1, 3]] },
    ] as const;
    for (const { generationId, revision, terrain } of expected) {
      const stored = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, generationId));
      expect(stored, generationId).toMatchObject({
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        revision,
        payload: { world: { chunkSize: 32, chunks: [{ x: 0, y: 0, terrain }] } },
      });
    }
    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-3', generationIds: ['gen-1', 'gen-2', 'gen-3'] });
  });

  /**
   * The worker's own answer, read off the protocol rather than inferred from
   * what the controller did with it.
   *
   * `internal-error` and not `snapshot-incompatible`, because the HUD's alert
   * list renders one sentence per fault code and the `snapshot-incompatible`
   * one reads *"The save could not be loaded -- this build does not understand
   * its format."* -- a statement about the player's file. Both keys already
   * exist (`src/content/default-locale-en.ts`); what changes is which of them
   * a defect of ours reaches.
   *
   * **Recoverable**, and that pairing is the one place this work reads ADR
   * 0024 §1 more narrowly than its prose: recoverability there is decided by
   * whether the failure reached simulation state, and
   * `restoreSimulationRuntime` is a factory that cannot -- nothing is
   * installed on the worker until it returns. The assertion is worth making
   * because the alternative is not merely pedantic: a `faulted` worker answers
   * the walk's next attempt `already-initialized`, so a non-recoverable pairing
   * would silently cost the player the recovery the test above proves.
   */
  it('reports our defect to the main thread as internal-error carrying the declared reason', async () => {
    const { controller, repository, worker } = await buildFixture();
    expectOk(await repository.save(PRISON_ID, codeFaultEnvelope(1)), 'the code-fault generation 1');

    vi.useFakeTimers();
    try {
      await expect(controller.loadPrison(PRISON_ID)).rejects.toThrow(SnapshotRestoreFaultError);
    } finally {
      vi.useRealTimers();
    }

    // Crossed both real protocol decoders, so `details` is a shape the
    // envelope schema permits rather than one this test invented.
    expect(worker.undecodableWorkerMessages).toEqual([]);
    const faults = worker.posted.filter((message) => message.kind === 'protocol/error');
    expect(faults).toHaveLength(1);
    expect(faults[0]?.payload).toMatchObject({
      code: 'internal-error',
      recoverable: true,
      details: { snapshotRestore: 'restore-code-fault' },
    });
  });

  /**
   * The contrast on the same channel, so "internal-error" above is not simply
   * what this worker now says about every failed restore. `unrestorableEnvelope`
   * is refused by `SparseWorld.fromSnapshot`, a declared check.
   */
  it('still reports a declared refusal as a recoverable snapshot-incompatible with its own reason', async () => {
    const { controller, repository, worker } = await buildFixture();
    expectOk(await repository.save(PRISON_ID, unrestorableEnvelope(1) as SaveEnvelope), 'the unrestorable generation 1');

    vi.useFakeTimers();
    try {
      expect(await controller.loadPrison(PRISON_ID)).toEqual({ ok: false, reason: 'no-valid-generation' });
    } finally {
      vi.useRealTimers();
    }

    const faults = worker.posted.filter((message) => message.kind === 'protocol/error');
    expect(faults).toHaveLength(1);
    expect(faults[0]?.payload).toMatchObject({
      code: 'snapshot-incompatible',
      recoverable: true,
      details: { snapshotRestore: 'damaged-payload' },
    });
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
      expectOk(await repository.save(PRISON_ID, restorableEnvelope(revision)), `the restorable generation ${String(revision)}`);
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
      expectOk(await repository.save(PRISON_ID, restorableEnvelope(revision)), `the restorable generation ${String(revision)}`);
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

/**
 * #432, and it is the row ADR 0063 declared readable and then deleted anyway.
 *
 * The block above proves what a *refusal* costs while nothing else restores:
 * nothing. This one is the case those rules never covered -- a save this build
 * cannot read **and** another generation that restores fine. Today's rules
 * retire the first one correctly and destroy it, and
 * `unsupported-by-this-build` means *the bytes are coherent and another build
 * reads them*, so that deletion contradicts the verdict the code just reached.
 *
 * Everything below runs on `v1WithWrittenPrefix`, ADR 0063's canonical
 * specimen for that reason: the repository's own checked-in V1 file carrying a
 * ledger whose written prefix is one slot wider than
 * `DEFAULT_PRISONER_CAPACITY`. It clears V1 schema, the migration chain, the
 * checksum, `importSave` and `loadCurrent`, and is refused by
 * `EntityStore.loadSnapshot` naming both numbers. Nothing is stubbed and no
 * failure is injected: the reason comes off the production throw site.
 */
describe('a save only another build can read is kept, not deleted', () => {
  /** The id `PrisonSaveRepository.quarantineGeneration` gives `gen-2`. */
  const QUARANTINED_GEN_2 = '!unreadable!gen-2';

  /**
   * A prison holding one of the player's own saves and, above it, a V1 file
   * whose ledger this build cannot address -- and the load that finds out.
   *
   * Returns the bytes as they were on disk *before* the load, so the caller
   * can make the byte-identity claim against what was actually stored rather
   * than against anything this test rebuilt.
   */
  async function loadPastAWiderLedger(): Promise<{
    readonly repository: PrisonSaveRepository;
    readonly store: MemoryLocalSaveStore;
    readonly outcome: SessionLoadOutcome;
    readonly bytesBefore: string;
  }> {
    const { controller, repository, store } = await buildFixture();
    expectOk(await repository.save(PRISON_ID, restorableEnvelope(1)), 'the restorable generation 1');
    expect(await repository.importSave(PRISON_ID, v1WithWrittenPrefix(5_001))).toEqual({
      ok: true,
      generationId: 'gen-2',
      migrated: true,
    });
    const stored = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-2'));
    const bytesBefore = JSON.stringify(stored);

    vi.useFakeTimers();
    let outcome: SessionLoadOutcome;
    try {
      outcome = await controller.loadPrison(PRISON_ID);
    } finally {
      vi.useRealTimers();
    }
    return { repository, store, outcome, bytesBefore };
  }

  it('keeps the wider-ledger save on disk, byte for byte, after a different generation restores', async () => {
    const { repository, store, outcome, bytesBefore } = await loadPastAWiderLedger();

    // The player has their prison back, from their own save below it.
    expect(outcome).toMatchObject({ ok: true, recovered: true });

    // The refused generation is still retained -- under the id quarantine
    // gives it, which is where the "kept" verdict is recorded (there is no
    // slot-record field for it, deliberately: see `isQuarantinedGenerationId`).
    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({
      currentGenerationId: QUARANTINED_GEN_2,
      generationIds: ['gen-1', QUARANTINED_GEN_2],
    });
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-2'))).toBeUndefined();

    // Its own contents, against the V1 file's literals rather than against
    // anything this test could have rebuilt: the fixture's revision, and the
    // written prefix that made it unreadable here.
    const kept = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, QUARANTINED_GEN_2));
    expect(kept).toMatchObject({
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      revision: 7,
      payload: { entities: { nextAvailableIndex: 5_001, maxActiveIndex: 5_000 } },
    });
    // And byte for byte what was stored before the load, which is the claim
    // "quarantined" has to make and "retained" alone does not: the record was
    // moved to a new key, not re-encoded on the way.
    expect(JSON.stringify(kept)).toBe(bytesBefore);
  });

  /**
   * The property the whole design turns on, and the one a quarantine that
   * merely declines to delete does not have.
   *
   * The player goes on playing on the build that cannot read this save. Every
   * autosave calls `applyGenerationRetention`, which evicts from the oldest
   * end -- so a kept-but-unprotected generation would be gone after `keep`
   * further saves: 90 seconds at the 30-second autosave cadence, against a fix
   * that ships in weeks. A quarantined generation is outside `keep` entirely,
   * so what rotates out is the player's own oldest save, exactly as it would
   * have without the quarantine.
   */
  it('survives the saves that follow it, while the player\'s own oldest generation rotates out as usual', async () => {
    const { repository, store } = await loadPastAWiderLedger();

    for (const revision of [3, 4, 5]) {
      expectOk(await repository.save(PRISON_ID, restorableEnvelope(revision)), `the restorable generation ${String(revision)}`);
    }

    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({
      currentGenerationId: 'gen-5',
      generationIds: [QUARANTINED_GEN_2, 'gen-3', 'gen-4', 'gen-5'],
    });
    // The player kept their full three readable saves: the quarantined
    // generation cost them none of them, and gen-1 gave way on the same save
    // it would have given way on anyway.
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-1'))).toBeUndefined();
    const kept = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, QUARANTINED_GEN_2));
    expect(kept).toMatchObject({ revision: 7, payload: { entities: { nextAvailableIndex: 5_001 } } });
    // And a save of the player's own from after the quarantine, so this is a
    // window that went on being written rather than one that stood still.
    const newest = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-5'));
    expect(newest).toMatchObject({ revision: 5, payload: { world: { chunks: [{ terrain: [[1, 1_019], [1, 5]] }] } } });
  });

  /**
   * Recovery, which is the point of keeping it: **a build that can read the
   * save loads it with the player doing nothing.**
   *
   * The one thing a single process cannot supply is a second build, so the
   * *build* is what is stood in for here and nothing else. The store, the
   * repository, the window, the quarantine and the bytes are the real ones
   * left behind by the load above; only the host is replaced, by one that
   * accepts a bundle this build's `EntityStore` will not -- which is exactly
   * what "a build whose entity store is wider" means at this boundary
   * (`SessionRuntimeHost`'s two production implementations differ in no other
   * way that matters here).
   *
   * What that stand-in cannot fake is *which bytes it is handed*, and that is
   * what the assertion is on: the ledger it receives carries the V1 file's
   * 5,001 written slots, so `loadCurrent` offered it the quarantined
   * generation, first, with no new control and no player action.
   */
  it('hands the quarantined save straight to a build that can read it, and drops the mark once it has', async () => {
    const { repository, store } = await loadPastAWiderLedger();

    const widerBuild = new AcceptingHost();
    const laterBuild = new SessionController(repository, widerBuild, { gameVersion: 'test-version' });
    const outcome = await laterBuild.loadPrison(PRISON_ID);

    // No walk and no fallback: the quarantined generation is the newest thing
    // in the window, so it is the first one offered.
    expect(outcome).toMatchObject({ ok: true, recovered: false });
    expect(widerBuild.received?.entities).toMatchObject({ nextAvailableIndex: 5_001, maxActiveIndex: 5_000 });

    // And the mark comes off, because a build has restored these bytes and
    // the mark records that one could not. The generation is an ordinary
    // member of the window again -- countable for the player, evictable by
    // retention, and the quarantine slot is free for the next save that needs
    // it.
    const [metadata] = await repository.list();
    expect(metadata).toMatchObject({ currentGenerationId: 'gen-2', generationIds: ['gen-1', 'gen-2'] });
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, QUARANTINED_GEN_2))).toBeUndefined();
    const recovered = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-2'));
    expect(recovered).toMatchObject({ revision: 7, payload: { entities: { nextAvailableIndex: 5_001 } } });
  });

  /**
   * The other verdict, unchanged, in the same load -- because the decision
   * this issue makes is *which* verdict earns the slot, and a test that only
   * shows one arm shows a branch rather than a choice.
   *
   * `damaged-payload` says a declared check found the content inconsistent
   * with itself, so no build restores it; keeping it would spend the prison's
   * one quarantine slot on bytes whose recovery nobody can demonstrate, at the
   * cost of the case where the build that reads them already exists.
   */
  it('still deletes a damaged generation while keeping an unreadable one from the same walk', async () => {
    const { controller, repository, store } = await buildFixture();
    expectOk(await repository.save(PRISON_ID, restorableEnvelope(1)), 'the restorable generation 1');
    expect(await repository.importSave(PRISON_ID, v1WithWrittenPrefix(5_001))).toMatchObject({ generationId: 'gen-2' });
    expectOk(await repository.save(PRISON_ID, unrestorableEnvelope(3) as SaveEnvelope), 'the unrestorable generation 3');

    vi.useFakeTimers();
    try {
      expect(await controller.loadPrison(PRISON_ID)).toMatchObject({ ok: true, recovered: true });
    } finally {
      vi.useRealTimers();
    }

    const [metadata] = await repository.list();
    expect(metadata?.generationIds).toEqual(['gen-1', QUARANTINED_GEN_2]);
    // The terrain run that overruns its chunk is gone; the wider ledger is not.
    expect(await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, 'gen-3'))).toBeUndefined();
    const kept = await store.runTransaction('readonly', (tx) => tx.getGeneration(PRISON_ID, QUARANTINED_GEN_2));
    expect(kept).toMatchObject({ revision: 7, payload: { entities: { nextAvailableIndex: 5_001 } } });
  });
});
