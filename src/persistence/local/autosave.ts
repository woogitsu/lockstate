import type { SaveEnvelope } from '../save-schema';
import { classifyStoreError } from './errors';
import type { SaveResult } from './repository';

export interface AutosaveDependencies {
  readonly intervalMs: number;
  /**
   * Builds the envelope to persist right now, or `undefined` if there is
   * nothing worth saving.
   *
   * May be async: capturing authoritative state means a round trip to the
   * simulation worker (see `SessionRuntimeHost`). A synchronous
   * implementation remains valid and is what the unit tests use.
   */
  readonly buildEnvelope: (prisonId: string) => Promise<SaveEnvelope | undefined> | SaveEnvelope | undefined;
  readonly save: (prisonId: string, envelope: SaveEnvelope) => Promise<SaveResult>;
  readonly onResult?: (prisonId: string, result: SaveResult) => void;
}

type PerPrisonState = 'timer-pending' | 'saving' | 'saving-with-pending-dirty';

interface PerPrisonEntry {
  state: PerPrisonState;
  timeoutHandle: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Coalesces dirty markers per prison into one trailing-edge save after
 * `intervalMs` of the caller marking it dirty, and guarantees at most one
 * in-flight write per prison: a dirty marker that arrives while a save is
 * already running schedules exactly one more save afterward instead of
 * overlapping it.
 */
export class AutosaveScheduler {
  private readonly perPrison = new Map<string, PerPrisonEntry>();

  public constructor(private readonly deps: AutosaveDependencies) {}

  public markDirty(prisonId: string): void {
    const entry = this.perPrison.get(prisonId);
    if (entry === undefined) {
      const timeoutHandle = setTimeout(() => this.runSave(prisonId), this.deps.intervalMs);
      this.perPrison.set(prisonId, { state: 'timer-pending', timeoutHandle });
      return;
    }
    if (entry.state === 'saving') {
      entry.state = 'saving-with-pending-dirty';
    }
    // 'timer-pending' or already 'saving-with-pending-dirty': already coalesced.
  }

  public isPending(prisonId: string): boolean {
    return this.perPrison.has(prisonId);
  }

  private runSave(prisonId: string): void {
    const entry = this.perPrison.get(prisonId);
    if (entry === undefined) return;

    // Claim the slot *before* any await. `buildEnvelope` may now be async
    // (a worker round trip), and a dirty marker arriving during capture
    // must coalesce into the follow-up rather than starting a second,
    // overlapping save.
    entry.state = 'saving';
    entry.timeoutHandle = undefined;

    void this.performSave(prisonId);
  }

  /**
   * Runs one save and **always settles the prison afterwards**, whatever
   * happened.
   *
   * The `finally` is the whole point and it is guarding a measured defect,
   * not a hypothetical one. `runSave` claims the slot by setting the state to
   * `'saving'` and then calls this method through `void`, so before the
   * `try/finally` a single rejection -- most plausibly `buildEnvelope`, which
   * captures authoritative state over the worker boundary and therefore
   * rejects whenever the worker has faulted, hung or gone away -- left the
   * entry parked in `'saving'` for ever. `settle` never ran, so no follow-up
   * timer was ever scheduled and `markDirty` could only ever set
   * `'saving-with-pending-dirty'` on a save that had already finished:
   * autosave stopped for the rest of the session, after one failure, and the
   * only trace was an unhandled rejection in the console.
   *
   * Failure is also *reported* rather than merely survived, through the same
   * `onResult` a successful write goes to. A save that fails where nothing
   * player-visible learns of it is the shape this repository treats as a real
   * bug, not a cosmetic one (ADR 0024 decision 2 makes the same argument for
   * a worker fault: recovering is defensible only while the failure is
   * visible), and `SessionController` already forwards `onResult` to the save
   * panel's status line.
   */
  private async performSave(prisonId: string): Promise<void> {
    try {
      const result = await this.attemptSave(prisonId);
      // `undefined` means `buildEnvelope` had nothing worth saving, which is
      // not an outcome to report -- no write was attempted.
      if (result !== undefined) this.deps.onResult?.(prisonId, result);
    } finally {
      this.settle(prisonId);
    }
  }

  /**
   * The save itself, which **never rejects**: a thrown failure becomes the
   * same `SaveResult` a refused write already produces, so one code path
   * reports both.
   *
   * `classifyStoreError` rather than a hand-written `unknown-error`, because
   * the throw can come from storage as easily as from capture -- `save()`
   * classifies the failures it catches itself, and a `QuotaExceededError`
   * that escapes by any other route deserves the same answer rather than a
   * second, blunter vocabulary for it.
   */
  private async attemptSave(prisonId: string): Promise<SaveResult | undefined> {
    try {
      const envelope = await this.deps.buildEnvelope(prisonId);
      if (envelope === undefined) return undefined;
      return await this.deps.save(prisonId, envelope);
    } catch (error) {
      const classified = classifyStoreError(error);
      return { ok: false, error: { code: classified.code, message: `Autosave failed: ${classified.message}` } };
    }
  }

  /** Schedules exactly one follow-up if the prison was dirtied while this save ran, otherwise goes idle. */
  private settle(prisonId: string): void {
    const current = this.perPrison.get(prisonId);
    if (current === undefined) return; // disposed mid-flight
    if (current.state === 'saving-with-pending-dirty') {
      const timeoutHandle = setTimeout(() => this.runSave(prisonId), this.deps.intervalMs);
      this.perPrison.set(prisonId, { state: 'timer-pending', timeoutHandle });
    } else {
      this.perPrison.delete(prisonId);
    }
  }

  /** Cancels every pending timer without waiting for in-flight saves. Call on session teardown. */
  public dispose(): void {
    for (const entry of this.perPrison.values()) {
      if (entry.timeoutHandle !== undefined) clearTimeout(entry.timeoutHandle);
    }
    this.perPrison.clear();
  }
}
