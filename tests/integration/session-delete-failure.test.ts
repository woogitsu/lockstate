import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository, type SaveResult } from '../../src/persistence/local/repository';
import type { LocalSaveStore, LocalSaveTransaction } from '../../src/persistence/local/store';
import { InProcessSessionHost } from '../../src/persistence/session/runtime-host';
import { SessionController, type ActiveSession } from '../../src/persistence/session/session-controller';
import { expectOk } from '../helpers/expect-ok';

/**
 * A deletion that the store refuses must cost the player nothing.
 *
 * ## The defect
 *
 * `SessionController.deletePrison` closed the live session **first** and asked
 * the store to delete **second**:
 *
 * ```ts
 * if (this.session?.prisonId === prisonId) this.closeSession();
 * await this.repository.delete(prisonId);
 * ```
 *
 * `closeSession` disposes the autosave schedule and clears the session field,
 * and nothing put either back when the `await` rejected. So a refused deletion
 * reported failure -- `SavePanel.requestDelete` does not catch, so the gate's
 * `onError` surfaces it -- while the prison it failed to delete was still on
 * disk, still in the list, and no longer the session the player was playing:
 * the simulation kept running with nothing left that could save it, and the
 * write that was already queued for it was gone with the schedule.
 *
 * ## What these tests assert, and what they deliberately do not
 *
 * Controller and store behaviour only. There is no assertion anywhere here
 * about the *order of two statements* in the production source: a test that
 * greps for an ordering passes the identical defect the moment it is moved
 * into a helper, and would have passed on the tree that carried it.
 *
 * `MemoryLocalSaveStore.failNextWrite` is the refusal, and it is the strongest
 * form available for this claim rather than a convenience: it throws **before
 * the transaction stages anything**, so the store is provably untouched and
 * the test says nothing about whether IndexedDB rolls back. A refusal that
 * never reached the data is enough to demonstrate a controller that had
 * already thrown the session away.
 *
 * The sibling `tests/integration/session-restore-failure.test.ts` is the model
 * for the shape: the real `SessionController` over a real
 * `PrisonSaveRepository`, with the failure injected at the storage boundary
 * rather than by stubbing the controller's own collaborators.
 */

const PRISON_ID = 'prison-1';
const AUTOSAVE_INTERVAL_MS = 30_000;

interface Fixture {
  readonly controller: SessionController;
  readonly repository: PrisonSaveRepository;
  readonly host: InProcessSessionHost;
  /** Every result the autosave scheduler reported, in order. A manual `saveNow` never appears here. */
  readonly backgroundSaves: { readonly prisonId: string; readonly result: SaveResult }[];
}

function buildFixture(store: LocalSaveStore): Fixture {
  const repository = new PrisonSaveRepository(store);
  const host = new InProcessSessionHost();
  const backgroundSaves: { readonly prisonId: string; readonly result: SaveResult }[] = [];
  const controller = new SessionController(repository, host, {
    gameVersion: 'test-version',
    autosaveIntervalMs: AUTOSAVE_INTERVAL_MS,
    onSaveResult: (prisonId, result) => backgroundSaves.push({ prisonId, result }),
  });
  return { controller, repository, host, backgroundSaves };
}

/**
 * A store that can hold one `readwrite` transaction open at the door.
 *
 * It exists for the two tests that need a deletion to be genuinely *in
 * flight* while other controller calls run -- which is not something a
 * resolved promise can stand in for, because the whole question is what the
 * controller does to state that changed during the `await`.
 *
 * The hold is applied **before** the work reaches `MemoryLocalSaveStore`, so
 * a transaction released after a later write has committed still sees that
 * write. That ordering is the realistic one: a store serialises overlapping
 * `readwrite` transactions rather than interleaving them.
 */
class HoldableStore implements LocalSaveStore {
  private readonly inner = new MemoryLocalSaveStore();
  private hold: { readonly started: () => void; readonly released: Promise<void> } | undefined;

  /** Makes the next `readwrite` transaction throw before staging anything, exactly as the in-memory store does. */
  public refuseNextWrite(error: Error): void {
    this.inner.failNextWrite = error;
  }

  /** Holds the next `readwrite` transaction at the door. `started` resolves once it has arrived; `release` lets it through. */
  public holdNextWrite(): { readonly started: Promise<void>; readonly release: () => void } {
    let announceStart: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      announceStart = resolve;
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.hold = { started: announceStart, released };
    return { started, release };
  }

  public async runTransaction<T>(mode: 'readonly' | 'readwrite', work: (tx: LocalSaveTransaction) => Promise<T>): Promise<T> {
    const hold = this.hold;
    if (mode === 'readwrite' && hold !== undefined) {
      this.hold = undefined;
      hold.started();
      await hold.released;
    }
    return this.inner.runTransaction(mode, work);
  }
}

/** The session the controller adopted, asserted present so the tests can compare it by identity afterwards. */
function activeSessionOf(controller: SessionController): ActiveSession {
  const session = controller.getActiveSession();
  expect(session, 'the controller should have an active session at this point').toBeDefined();
  return session as ActiveSession;
}

describe('a prison deletion the store refuses', () => {
  beforeEach(() => {
    // The autosave schedule is the second thing at stake here, so its timer
    // has to be drivable rather than merely absent. Fake timers also keep a
    // 30s handle from outliving the test.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the active session and pending save when storage deletion rejects', async () => {
    const store = new MemoryLocalSaveStore();
    const { controller, repository } = buildFixture(store);

    expectOk(await controller.createPrison(PRISON_ID, 'Alcatraz'), 'the creation of the prison about to be deleted');
    const session = activeSessionOf(controller);
    controller.markDirty();
    expect(controller.hasPendingAutosave()).toBe(true);

    // Refused at the door: `failNextWrite` throws before the transaction
    // stages a single record, so nothing about IndexedDB rollback is being
    // relied on -- the deletion provably never started.
    const refusal = new Error('The store refused this transaction.');
    store.failNextWrite = refusal;

    await expect(controller.deletePrison(PRISON_ID)).rejects.toThrow('The store refused this transaction.');

    // The identical object, not merely a session naming the same prison: a
    // replacement carrying the same id would have lost the revision counter
    // and the `createdAt` every later envelope is stamped with.
    expect(controller.getActiveSession()).toBe(session);
    expect(controller.hasPendingAutosave()).toBe(true);

    // The prison the deletion failed to remove is still there, so the session
    // still points at something that exists.
    expect((await repository.list()).map((slot) => slot.prisonId)).toEqual([PRISON_ID]);

    // And the session is still usable, which is the claim that matters to a
    // player: a manual save writes a durable generation of the prison they
    // were told could not be deleted.
    const revisionBefore = session.revision;
    expectOk(await controller.saveNow(), 'the manual save taken after the refused deletion');
    expect(controller.getActiveSession()?.revision).toBe(revisionBefore + 1);
    expectOk(await repository.loadCurrent(PRISON_ID), 'the generation that save wrote');
  });

  it('flushes the pending autosave that was held back, once the refusal is known', async () => {
    const store = new HoldableStore();
    const { controller, backgroundSaves } = buildFixture(store);

    expectOk(await controller.createPrison(PRISON_ID, 'Alcatraz'), 'the creation of the prison about to be deleted');
    const session = activeSessionOf(controller);
    controller.markDirty();

    const hold = store.holdNextWrite();
    const deletion = controller.deletePrison(PRISON_ID);
    await hold.started;

    // Nothing has been given up yet, and this is the precondition that makes
    // the rest of the test mean anything: the store has not committed, so the
    // session and its schedule are still the player's.
    expect(controller.getActiveSession()).toBe(session);
    expect(controller.hasPendingAutosave()).toBe(true);

    // The autosave comes due while the deletion is committing. It must not
    // write a new generation into a prison that is being deleted, so it is
    // declined -- and declining it is what costs the marker.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS);
    expect(backgroundSaves).toEqual([]);
    expect(controller.hasPendingAutosave()).toBe(false);

    // Now the deletion is refused, so the prison the declined save belonged to
    // is still there -- and so is the play it was going to write.
    store.refuseNextWrite(new Error('The store refused this transaction.'));
    hold.release();
    await expect(deletion).rejects.toThrow('The store refused this transaction.');

    expect(controller.getActiveSession()).toBe(session);
    expect(controller.hasPendingAutosave()).toBe(true);

    // Restored rather than merely re-armed: the schedule that comes back
    // actually writes.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS);
    expect(backgroundSaves.map((entry) => ({ prisonId: entry.prisonId, ok: entry.result.ok }))).toEqual([
      { prisonId: PRISON_ID, ok: true },
    ]);
  });
});

describe('a prison deletion the store accepts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes the session it deleted, and takes its autosave schedule with it', async () => {
    const store = new MemoryLocalSaveStore();
    const { controller, repository, backgroundSaves } = buildFixture(store);

    expectOk(await controller.createPrison(PRISON_ID, 'Alcatraz'), 'the creation of the prison about to be deleted');
    activeSessionOf(controller);
    controller.markDirty();
    expect(controller.hasPendingAutosave()).toBe(true);

    await controller.deletePrison(PRISON_ID);

    expect(controller.getActiveSession()).toBeUndefined();
    expect(await repository.list()).toEqual([]);

    // The schedule went with it. Asserted by running the clock rather than by
    // reading `hasPendingAutosave`, which answers `false` for a controller
    // with no session whatever its scheduler holds: a surviving timer would
    // fire here and report a failed write against a prison that is gone.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS * 2);
    expect(backgroundSaves).toEqual([]);
  });

  /**
   * The newer session here names the **same prison** as the deletion, which is
   * the only shape in which the distinction between "the same id" and "the
   * same session" is visible at all -- and therefore the only shape worth
   * spending a test on. A newer session for some *other* prison is not
   * closed by an id check either, so a test built on one would pass on every
   * implementation of this method that has ever existed here.
   */
  it('does not close a newer session for the same prison when a slow deletion finishes late', async () => {
    const store = new HoldableStore();
    const { controller } = buildFixture(store);

    expectOk(await controller.createPrison(PRISON_ID, 'Alcatraz'), 'the creation of the prison about to be deleted');
    const stale = activeSessionOf(controller);

    const hold = store.holdNextWrite();
    const deletion = controller.deletePrison(PRISON_ID);
    await hold.started;

    // Still the player's session while the store has not committed, which is
    // what gives the identity check below something to be wrong about.
    expect(controller.getActiveSession()).toBe(stale);

    // The deletion has not committed, so the row is still on the panel and
    // still carries a Load. Pressing it restores the prison into a **new**
    // `ActiveSession` object that names the same id: a fresh revision counter
    // and a `createdAt` taken from the envelope that was actually restored.
    expectOk(await controller.loadPrison(PRISON_ID), 'the reload taken while the deletion was still committing');
    const fresh = activeSessionOf(controller);
    expect(fresh).not.toBe(stale);
    expect(fresh.prisonId).toBe(PRISON_ID);

    hold.release();
    await deletion;

    // An id check would close this one -- it names exactly the prison the
    // deletion named. Only the object itself distinguishes the session this
    // call was going to close from the one the player has since started.
    expect(controller.getActiveSession()).toBe(fresh);
  });
});
