import type { SaveEnvelopeV1 } from '../save-schema';
import type { SaveResult } from './repository';

export interface AutosaveDependencies {
  readonly intervalMs: number;
  /** Builds the envelope to persist right now, or `undefined` if there is nothing worth saving. */
  readonly buildEnvelope: (prisonId: string) => SaveEnvelopeV1 | undefined;
  readonly save: (prisonId: string, envelope: SaveEnvelopeV1) => Promise<SaveResult>;
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

    const envelope = this.deps.buildEnvelope(prisonId);
    if (envelope === undefined) {
      this.perPrison.delete(prisonId);
      return;
    }

    entry.state = 'saving';
    entry.timeoutHandle = undefined;

    void this.deps.save(prisonId, envelope).then((result) => {
      this.deps.onResult?.(prisonId, result);
      const current = this.perPrison.get(prisonId);
      if (current?.state === 'saving-with-pending-dirty') {
        const timeoutHandle = setTimeout(() => this.runSave(prisonId), this.deps.intervalMs);
        this.perPrison.set(prisonId, { state: 'timer-pending', timeoutHandle });
      } else {
        this.perPrison.delete(prisonId);
      }
    });
  }

  /** Cancels every pending timer without waiting for in-flight saves. Call on session teardown. */
  public dispose(): void {
    for (const entry of this.perPrison.values()) {
      if (entry.timeoutHandle !== undefined) clearTimeout(entry.timeoutHandle);
    }
    this.perPrison.clear();
  }
}
