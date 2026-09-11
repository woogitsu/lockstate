import { describe, expect, it } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository, type SaveResult } from '../../src/persistence/local/repository';
import { InProcessSessionHost, type SessionRuntimeHost } from '../../src/persistence/session/runtime-host';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { SessionController } from '../../src/persistence/session/session-controller';
import { describeSaveResult } from '../../src/ui/save-panel';
import { SAVE_PANEL_MESSAGE_KEY } from '../../src/ui/save-panel-messages';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { expectOk } from '../helpers/expect-ok';

/**
 * ADR 0109, against the three defects issue #582 measured and that ADR 0109
 * re-measured for itself.
 *
 * Every case below is one of those measurements pointed the other way: the
 * ADR ran each and quoted what went wrong, and these run the same shape and
 * assert what now happens instead. The numbers in each docblock are the ADR's
 * own, so a reader can line them up.
 *
 * `docs/PERSISTENCE.md` and `save-schema.ts` both said this repository "does
 * not yet enforce optimistic concurrency"; both were rewritten in the commit
 * that added this file, and this file is what makes the new sentences
 * falsifiable.
 */

/** Opens a gate a test can hold shut, so two writes can genuinely overlap rather than be assumed to. */
function barrier(): { readonly wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/**
 * A host whose `capture()` can be held open, which is what makes the
 * FINAL-004 shape reproducible rather than a race a reader has to believe in.
 *
 * Everything else is the real `InProcessSessionHost`. `docs/PERSISTENCE.md`
 * rests a section on that host proving the contract the worker host satisfies,
 * because both go through the same `capture()`/`startFromSnapshot()` boundary.
 */
class HoldableCaptureHost implements SessionRuntimeHost {
  public readonly inner = new InProcessSessionHost();
  /** Set by a test to hold the next capture; the capture awaits it before reading state. */
  public hold: Promise<void> | undefined;

  public async startNew(masterSeed: number): Promise<void> {
    await this.inner.startNew(masterSeed);
  }

  public async startFromSnapshot(bundle: SessionSnapshotBundle): Promise<void> {
    await this.inner.startFromSnapshot(bundle);
  }

  public async capture(): Promise<SessionSnapshotBundle> {
    const held = this.hold;
    if (held !== undefined) {
      this.hold = undefined;
      // Captured first, then held: this is the FINAL-004 shape exactly -- the
      // state is read, and the world moves on underneath it before the write.
      const captured = await this.inner.capture();
      await held;
      return captured;
    }
    return this.inner.capture();
  }

  public async stop(): Promise<void> {
    await this.inner.stop();
  }
}

/** A repository whose `save` can be held mid-flight, so two writes overlap for real. */
function repositoryWithHoldableSave(store: MemoryLocalSaveStore): {
  readonly repository: PrisonSaveRepository;
  holdNextSave(): { readonly reached: Promise<void>; release: () => void };
} {
  const repository = new PrisonSaveRepository(store);
  const realSave = repository.save.bind(repository);
  let pending: { readonly gate: Promise<void>; readonly announce: () => void } | undefined;

  repository.save = async (prisonId, envelope, expectedRevision) => {
    const held = pending;
    if (held === undefined) return realSave(prisonId, envelope, expectedRevision);
    pending = undefined;
    held.announce();
    await held.gate;
    return realSave(prisonId, envelope, expectedRevision);
  };

  return {
    repository,
    holdNextSave() {
      const gate = barrier();
      const arrival = barrier();
      pending = { gate: gate.wait, announce: arrival.open };
      return { reached: arrival.wait, release: gate.open };
    },
  };
}

function controllerOver(repository: PrisonSaveRepository, host: SessionRuntimeHost, reported: SaveResult[]) {
  return new SessionController(repository, host, {
    gameVersion: 'test-version',
    autosaveIntervalMs: 1,
    onSaveResult: (_prisonId, result) => reported.push(result),
  });
}

describe('ADR 0109: a stale local save is refused rather than silently applied', () => {
  /**
   * #582 FINAL-004, the shape ADR 0109 measured:
   *
   *     live tick before the autosave fires: 10
   *     autosave reached the write with envelope revision 2 tick 10
   *     load ok: true
   *     live tick after the reload: 0
   *     durable current revision: 2 tick: 10
   *
   * The stale capture became the durable current generation. It no longer can:
   * the capture is compared by identity against the session in the field, and
   * the session that replaced it is a different `ActiveSession` object.
   */
  it('drops an autosave captured by a session that has since been replaced, and writes nothing', async () => {
    const store = new MemoryLocalSaveStore();
    const { repository } = repositoryWithHoldableSave(store);
    const host = new HoldableCaptureHost();
    const reported: SaveResult[] = [];
    const controller = controllerOver(repository, host, reported);
    /*
     * Every expectation the controller submits, recorded in order.
     *
     * This is what makes the case non-vacuous, and it was added after the
     * first version of this test stayed green under a mutation that should
     * have flipped it: asserting only on the durable pointer cannot tell "the
     * write was refused" from "no write was attempted", and ADR 0109 Decision
     * 4 rules that an epoch-stale writer is dropped **before** it is issued.
     */
    const savesIssued: (number | undefined)[] = [];
    const beforeInstrumentation = repository.save.bind(repository);
    repository.save = (prisonId, envelope, expectedRevision) => {
      savesIssued.push(expectedRevision);
      return beforeInstrumentation(prisonId, envelope, expectedRevision);
    };

    expectOk(await controller.createPrison('prison-1'), 'the creation of prison-1');
    const runtime = host.inner.getRuntime()!;
    for (let i = 0; i < 10; i += 1) runtime.kernel.step();
    expect(runtime.kernel.tick).toBe(10);

    const durableBefore = (await repository.list())[0]?.currentRevision;
    expect(durableBefore).toBe(1);

    // Hold the capture open, let the autosave come due, and reload the prison
    // underneath it. The reload is what mints a new `ActiveSession`.
    //
    // The reload is awaited to completion **before** the capture is released,
    // and that ordering is the test rather than an incidental detail: it is
    // what puts the new session in the field while the old session's capture
    // is still in flight. Releasing first made this test pass vacuously --
    // the capture resolved before `adoptSession` ran, so there was nothing
    // stale about the writer and the write landed.
    const capture = barrier();
    host.hold = capture.wait;
    controller.markDirty();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expectOk(await controller.loadPrison('prison-1'), 'the reload of prison-1 while an autosave was capturing');
    capture.open();

    // Let the dropped write settle.
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Not a write was merely *refused* -- not a write was **issued**. The
    // epoch check sits in front of `repository.save`, so a stale capture never
    // reaches storage to be compared at all.
    expect(savesIssued).toEqual([0]);

    // Nothing was written: the durable pointer is still where the reload left
    // it, not at the stale capture's tick 10.
    const slot = (await repository.list())[0];
    expect(slot?.currentRevision).toBe(1);

    // And nothing was reported. ADR 0109 Decision 4: an epoch-stale writer
    // "is dropped without a retry and without a report, because it belongs to
    // a session that no longer exists and has nobody to tell".
    expect(reported).toEqual([]);
  });

  /**
   * FINAL-004's third line, which ADR 0109 says is *not* in #582 and is worse
   * than what is: the stale write's completion callback advanced the **new**
   * session's revision counter, because the callback was guarded by `prisonId`
   * and a same-slot reload does not change one. The next ordinary save then
   * built a perfectly consecutive successor to a durable state that session
   * had never seen -- "the divergence is laundered into a legitimate-looking
   * sequence".
   */
  it('does not let a superseded writer advance the revision of the session that replaced it', async () => {
    const store = new MemoryLocalSaveStore();
    const { repository } = repositoryWithHoldableSave(store);
    const host = new HoldableCaptureHost();
    const reported: SaveResult[] = [];
    const controller = controllerOver(repository, host, reported);

    expectOk(await controller.createPrison('prison-1'), 'the creation of prison-1');
    for (let i = 0; i < 10; i += 1) host.inner.getRuntime()!.kernel.step();

    const capture = barrier();
    host.hold = capture.wait;
    controller.markDirty();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expectOk(await controller.loadPrison('prison-1'), 'the reload');
    capture.open();
    await new Promise((resolve) => setTimeout(resolve, 5));

    // The fresh session is at the revision it loaded, untouched by the writer
    // it replaced.
    expect(controller.getActiveSession()?.revision).toBe(1);

    // So its own next save is generation 2 -- a successor to what is actually
    // on disk, which is the property the laundering destroyed.
    const next = await controller.saveNow();
    expectOk(next, "the fresh session's own save");
    expect(next.revision).toBe(2);
    expect((await repository.list())[0]?.currentRevision).toBe(2);
  });

  /**
   * #582 FINAL-005, re-measured by ADR 0109 at v0.0.579:
   *
   *     envelope revisions offered: 2, 2 | both ok: true true
   *     in-memory session revision: 3
   *     third save ok: true | envelope revisions offered so far: 2, 2, 4
   *
   * Both overlapping saves built revision 2 from the same counter value, and
   * the third landed on 4 -- on disk, 1, 2, 4, with revision 3 never existing.
   * Allocation now happens inside the transaction, so the counter cannot be
   * read twice for one number.
   */
  it('gives two overlapping manual saves two different revisions, and leaves no hole', async () => {
    const store = new MemoryLocalSaveStore();
    const { repository, holdNextSave } = repositoryWithHoldableSave(store);
    const host = new InProcessSessionHost();
    const reported: SaveResult[] = [];
    const controller = controllerOver(repository, host, reported);

    expectOk(await controller.createPrison('prison-1'), 'the creation of prison-1');

    /*
     * The two saves are held apart **at the transaction boundary**, and that
     * is a fidelity requirement rather than convenience.
     *
     * `MemoryLocalSaveStore` does not serialise overlapping `readwrite`
     * transactions -- it snapshots the stores on entry and publishes on exit,
     * so two transactions that interleave at their internal awaits both read
     * the pre-write state and the later one wins. **Measured while writing
     * this test**: without the hold below, both saves read `currentRevision:
     * 1`, both allocated 2, and the assertion came back `[2, 2]`. Real
     * IndexedDB does not behave that way -- `readwrite` transactions with
     * overlapping scope are serialised, which is exactly the property
     * `writeGeneration`'s comparison relies on.
     *
     * So the hold models what the browser guarantees: the second save is
     * allowed to commit in full before the first's transaction opens, and the
     * first then meets a slot that has moved. Testing "what if the store let
     * them interleave" would be testing the double rather than the code.
     */
    const held = holdNextSave();
    const first = controller.saveNow();
    await held.reached;

    // Starts and commits while the first is still short of its transaction --
    // the shape of an autosave firing while a manual save is in flight.
    const secondResult = await controller.saveNow();
    held.release();
    const firstResult = await first;

    expectOk(firstResult, 'the first save, which met a slot that had moved');
    expectOk(secondResult, 'the second save');

    // Two saves, two revisions, consecutive. Not `2, 2`.
    expect([firstResult.revision, secondResult.revision].sort((a, b) => a - b)).toEqual([2, 3]);

    const third = await controller.saveNow();
    expectOk(third, 'the third save');
    // And no hole: `4` here would be the old sequence's 1, 2, 4.
    expect(third.revision).toBe(4);
    expect((await repository.list())[0]?.currentRevision).toBe(4);
  });

  /**
   * #582 FINAL-006, first reproduced by ADR 0109:
   *
   *     tab A saved (100 ticks of progress): true
   *     tab B saved (3 ticks, never saw A): true
   *     durable current after both: revision 2 tick 3
   *
   * "Tab A's hundred ticks were current and are not. Both saves reported
   * success to their player." Two `SessionController`s over one store is what
   * two tabs are -- `bootPersistence` constructs one per page.
   */
  it('refuses the second of two tabs that never saw the first, instead of telling both they succeeded', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    const hostA = new InProcessSessionHost();
    const hostB = new InProcessSessionHost();
    const tabA = controllerOver(repository, hostA, []);
    const tabB = controllerOver(repository, hostB, []);

    expectOk(await tabA.createPrison('prison-1'), 'the creation of prison-1 in tab A');
    // Tab B opens the same prison, seeing revision 1 exactly as tab A does.
    expectOk(await tabB.loadPrison('prison-1'), 'tab B loading prison-1');
    expect(tabA.getActiveSession()?.revision).toBe(1);
    expect(tabB.getActiveSession()?.revision).toBe(1);

    for (let i = 0; i < 100; i += 1) hostA.getRuntime()!.kernel.step();
    expectOk(await tabA.saveNow(), "tab A's save");

    for (let i = 0; i < 3; i += 1) hostB.getRuntime()!.kernel.step();
    const tabBResult = await tabB.saveNow();

    // Tab B is told no, and told what was found, rather than being told yes
    // while overwriting a hundred ticks it never saw.
    expect(tabBResult.ok).toBe(false);
    if (tabBResult.ok) throw new Error('unreachable');
    expect(tabBResult.error.code).toBe('stale-revision');
    expect(tabBResult.stale).toEqual({ durableRevision: 2, expectedRevision: 1 });

    // Tab A's work is still what is current.
    expect((await repository.list())[0]?.currentRevision).toBe(2);
  });

  /**
   * **THE RETRY IS NARROWER THAN ADR 0109 DECISION 4'S WORDING, AND THIS TEST
   * IS THE REASON.**
   *
   * Decision 4 says an "epoch-current writer that lost a revision race
   * re-captures and retries once (it is live, and its state is the newest
   * there is)". Implemented from that sentence alone, the two-tab case above
   * went: tab B refused at expectation 1 against durable 2, retry, **succeed
   * at 3** -- tab A's hundred ticks overwritten anyway, by a slower route. The
   * retry re-opened FINAL-006, which the same document's Decision 2 table says
   * the revision CAS closes.
   *
   * The epoch cannot separate the two cases, because it is per-process and
   * both tabs are epoch-current in their own. What separates them is
   * Decision 4's own justification: "its state is the newest there is" holds
   * when the writer lost to *itself* and fails when it lost to another tab.
   * So the retry fires only when the slot moved to exactly where this
   * session's own bookkeeping stands -- proof that the write that beat it was
   * its own.
   *
   * This case is the self-race: the same session's other save path won, so the
   * retry is correct and re-captures rather than re-submitting the envelope
   * that was refused.
   */
  it('retries once when the write that beat it was its own, and the retry carries newly captured state', async () => {
    const store = new MemoryLocalSaveStore();
    const { repository, holdNextSave } = repositoryWithHoldableSave(store);
    const host = new InProcessSessionHost();
    const controller = controllerOver(repository, host, []);

    expectOk(await controller.createPrison('prison-1'), 'the creation of prison-1');

    const held = holdNextSave();
    const first = controller.saveNow();
    await held.reached;

    // The session's own second save commits first, moving the slot to 2 and
    // this session's bookkeeping with it.
    expectOk(await controller.saveNow(), "the session's own competing save");
    expect(controller.getActiveSession()?.revision).toBe(2);

    // More state arrives before the held save gets its transaction, so the
    // re-capture the retry performs is observable in what lands.
    for (let i = 0; i < 7; i += 1) host.getRuntime()!.kernel.step();

    held.release();
    const result = await first;

    // Refused at expectation 1 against durable 2, then resubmitted against 2.
    expectOk(result, 'the save that lost the race to its own session and retried');
    expect(result.revision).toBe(3);
    expect(controller.getActiveSession()?.revision).toBe(3);

    // Newly captured, not the envelope that was refused: that one was built
    // before the seven ticks above.
    const loaded = await repository.loadCurrent('prison-1');
    expectOk(loaded, 'the generation the retry wrote');
    expect(loaded.envelope.payload.kernel.tick).toBe(7);
  });

  /**
   * ADR 0109 Decision 5, the half that is `AGENTS.md` reservation 4.
   *
   * The sentence is the owner's ruling of 2026-09-11 and is asserted here
   * verbatim against the shipped catalogue, so a later edit to the wording
   * fails rather than quietly replacing a sentence the owner chose.
   */
  it('tells the player what happened, in the words the owner ruled', () => {
    const refused: SaveResult = {
      ok: false,
      error: { code: 'stale-revision', message: 'diagnostic prose a player never sees' },
      stale: { durableRevision: 2, expectedRevision: 1 },
    };

    const status = describeSaveResult(refused);
    expect(status.kind).toBe('changed-elsewhere');
    expect(status.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusChangedElsewhere);
    // No `{detail}`: the two revision numbers are diagnostic English for a log
    // and say nothing to a player.
    expect(status.messageParameters).toBeUndefined();

    expect(defaultLocaleEnCatalog.get(status.messageKey)).toBe('Could not save: this prison was changed elsewhere.');
  });

  /**
   * The other half of Decision 5, and the one a test has to guard because it
   * is an absence: "An autosave that is refused must not [say so]. It fires on
   * a timer the player did not press ... and a periodic warning about a
   * condition they cannot influence is noise."
   */
  it('says nothing to the player when a refused autosave belonged to a session that is gone', async () => {
    const store = new MemoryLocalSaveStore();
    const { repository } = repositoryWithHoldableSave(store);
    const host = new HoldableCaptureHost();
    const reported: SaveResult[] = [];
    const controller = controllerOver(repository, host, reported);

    expectOk(await controller.createPrison('prison-1'), 'the creation of prison-1');
    reported.length = 0;

    const capture = barrier();
    host.hold = capture.wait;
    controller.markDirty();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expectOk(await controller.loadPrison('prison-1'), 'the reload');
    const recordBeforeTheDrop = controller.getLastSaveResult();
    capture.open();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(reported).toEqual([]);
    // And the controller's own record is untouched too, so the drop does not
    // surface on the next session either through `getLastSaveResult`.
    expect(controller.getLastSaveResult()).toBe(recordBeforeTheDrop);
  });
});
