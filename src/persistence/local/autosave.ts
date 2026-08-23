import type { SaveEnvelope } from '../save-schema';
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

  private async performSave(prisonId: string): Promise<void> {
    const envelope = await this.deps.buildEnvelope(prisonId);
    if (envelope === undefined) {
      this.settle(prisonId);
      return;
    }

    const result = await this.deps.save(prisonId, envelope);
    this.deps.onResult?.(prisonId, result);
    this.settle(prisonId);
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
