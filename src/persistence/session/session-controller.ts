import { V1_RESTORED_SCOPE, type RestoredScope, type SessionSnapshotBundle } from '../../simulation/runtime/restore-session';
import { AutosaveScheduler } from '../local/autosave';
import type { PrisonSaveRepository, SaveResult } from '../local/repository';
import type { PrisonSlotMetadata } from '../local/store';
import { createSaveEnvelope, type SaveEnvelopeV1, type TrustedSaveEnvelopeV1 } from '../save-schema';
import type { SessionRuntimeHost } from './runtime-host';

/** Directional default: the informal probe in `docs/PERSISTENCE.md` puts a representative save well under a second, so a 30s trailing-edge cadence costs little while bounding worst-case loss. Not a tuned figure -- see `docs/BENCHMARKING.md`. */
export const DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000;

export interface ActiveSession {
  readonly prisonId: string;
  /** Incremented on every successful save; persisted in the envelope so #20's sync can order revisions. */
  revision: number;
  readonly createdAt: number;
}

export type SessionLoadOutcome =
  | { readonly ok: true; readonly recovered: boolean; readonly scope: RestoredScope }
  | { readonly ok: false; readonly reason: 'not-found' | 'no-valid-generation' };

export interface SessionControllerOptions {
  readonly gameVersion: string;
  readonly autosaveIntervalMs?: number;
  readonly now?: () => number;
  readonly masterSeed?: number;
  /** Notified on every autosave and lifecycle-triggered save so a UI can surface durable success/failure without polling. */
  readonly onSaveResult?: (prisonId: string, result: SaveResult) => void;
}

/**
 * Bridges the authoritative simulation (behind a `SessionRuntimeHost`) to
 * the local-first `PrisonSaveRepository` -- the wiring issue #19 left open
 * after the repository, autosave and recovery policy landed but had no
 * session to drive them.
 *
 * It deliberately owns **no** `SimulationRuntime`. Authoritative state
 * lives in the simulation worker (`AGENTS.md`), and saving goes through
 * that worker's snapshot request/response rather than bypassing it (ADR
 * 0003) -- so this controller only ever asks its host for a snapshot
 * bundle and hands one back to restore. That is exactly issue #19's "save
 * creation consumes explicit Worker snapshots, not renderer internals".
 *
 * Everything network-dependent stays out: this controller never touches
 * Supabase, and a session created/saved/loaded through it works entirely
 * offline (issue #19's "offline operation requires no Supabase
 * availability"). Cloud sync (#20) consumes the repository's separate
 * `markPendingSync` bookkeeping, which this controller sets but never acts
 * on.
 */
export class SessionController {
  private readonly gameVersion: string;
  private readonly now: () => number;
  private readonly masterSeed: number;
  private readonly autosave: AutosaveScheduler;
  private session: ActiveSession | undefined;
  private lastSaveResult: SaveResult | undefined;

  public constructor(
    private readonly repository: PrisonSaveRepository,
    private readonly host: SessionRuntimeHost,
    options: SessionControllerOptions,
  ) {
    this.gameVersion = options.gameVersion;
    this.now = options.now ?? Date.now;
    this.masterSeed = options.masterSeed ?? 0;

    this.autosave = new AutosaveScheduler({
      intervalMs: options.autosaveIntervalMs ?? DEFAULT_AUTOSAVE_INTERVAL_MS,
      buildEnvelope: (prisonId) => (this.session?.prisonId === prisonId ? this.buildEnvelope() : undefined),
      save: (prisonId, envelope) => this.repository.save(prisonId, envelope),
      onResult: (prisonId, result) => {
        this.lastSaveResult = result;
        if (result.ok && this.session?.prisonId === prisonId) this.session.revision += 1;
        options.onSaveResult?.(prisonId, result);
      },
    });
  }

  public getActiveSession(): ActiveSession | undefined {
    return this.session;
  }

  public getLastSaveResult(): SaveResult | undefined {
    return this.lastSaveResult;
  }

  public hasPendingAutosave(): boolean {
    return this.session !== undefined && this.autosave.isPending(this.session.prisonId);
  }

  public async listPrisons(): Promise<readonly PrisonSlotMetadata[]> {
    return this.repository.list();
  }

  /**
   * Creates a slot and immediately writes generation 1, so a brand-new
   * prison is durable before the player does anything -- a crash right
   * after "New prison" must not leave an empty slot that
   * `loadCurrent` would report as `no-valid-generation`.
   */
  public async createPrison(prisonId: string, displayName?: string): Promise<SaveResult> {
    await this.repository.create({
      prisonId,
      gameVersion: this.gameVersion,
      ...(displayName === undefined ? {} : { displayName }),
    });

    await this.host.startNew(this.masterSeed);
    this.adoptSession(prisonId);
    return this.saveNow();
  }

  /** Loads a prison and makes it the active session. Reports whether recovery fell back to a previous generation, and what a V1 save actually restores. */
  public async loadPrison(prisonId: string): Promise<SessionLoadOutcome> {
    const result = await this.repository.loadCurrent(prisonId);
    if (!result.ok) return { ok: false, reason: result.reason };

    // The envelope's payload is structurally the session snapshot bundle;
    // it has already passed schema, migration and checksum validation in
    // `loadCurrent`, so the host receives verified state.
    await this.host.startFromSnapshot(result.envelope.payload as unknown as SessionSnapshotBundle);
    this.adoptSession(prisonId, result.envelope.revision, result.envelope.createdAt);

    return { ok: true, recovered: result.outcome === 'recovered-previous', scope: V1_RESTORED_SCOPE };
  }

  private adoptSession(prisonId: string, revision = 0, createdAt = this.now()): void {
    this.autosave.dispose();
    this.session = { prisonId, revision, createdAt };
  }

  /** Marks the active session dirty; the scheduler coalesces this into one trailing-edge write and never overlaps writes for one prison. */
  public markDirty(): void {
    if (this.session === undefined) return;
    this.autosave.markDirty(this.session.prisonId);
  }

  /**
   * Builds a checksummed envelope from an explicit snapshot captured from
   * the authoritative simulation -- never from renderer state, and never
   * from a runtime this thread owns.
   *
   * The return type is deliberately the branded `TrustedSaveEnvelopeV1`
   * (#49): it records in the type system that this envelope was composed and
   * validated in-process, so a future refactor that fed `saveNow` an envelope
   * of unknown provenance would fail to typecheck rather than silently take
   * the fast write path. Provenance is additionally enforced at runtime by
   * object identity, so a cast could not bypass validation either.
   */
  public async buildEnvelope(): Promise<TrustedSaveEnvelopeV1 | undefined> {
    const session = this.session;
    if (session === undefined) return undefined;

    const bundle = await this.host.capture();
    const timestamp = this.now();
    return createSaveEnvelope({
      gameVersion: this.gameVersion,
      prisonId: session.prisonId,
      revision: session.revision + 1,
      createdAt: session.createdAt,
      updatedAt: timestamp,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities as never }),
    });
  }

  /** Manual save. Returns durable success/failure evidence (issue #19: "manual save returns durable success/failure evidence"). */
  public async saveNow(): Promise<SaveResult> {
    const session = this.session;
    if (session === undefined) {
      return { ok: false, error: { code: 'unknown-error', message: 'No active session to save.' } };
    }

    let envelope: TrustedSaveEnvelopeV1 | undefined;
    try {
      envelope = await this.buildEnvelope();
    } catch (error) {
      // A worker that faulted, timed out or was never started must surface
      // as a failed save with evidence, never as a thrown exception into a
      // click handler or a silently-skipped autosave.
      const result: SaveResult = { ok: false, error: { code: 'unknown-error', message: `Could not capture simulation state: ${error instanceof Error ? error.message : String(error)}` } };
      this.lastSaveResult = result;
      return result;
    }
    if (envelope === undefined) {
      return { ok: false, error: { code: 'unknown-error', message: 'Failed to build a save envelope for the active session.' } };
    }

    const result = await this.repository.save(session.prisonId, envelope);
    this.lastSaveResult = result;
    if (result.ok) {
      session.revision += 1;
      await this.repository.markPendingSync(session.prisonId, { dirtySinceRevision: session.revision, markedAt: this.now() });
    }
    return result;
  }

  public async deletePrison(prisonId: string): Promise<void> {
    if (this.session?.prisonId === prisonId) this.closeSession();
    await this.repository.delete(prisonId);
  }

  public async exportActive(): Promise<SaveEnvelopeV1 | undefined> {
    return this.session === undefined ? undefined : this.repository.exportSave(this.session.prisonId);
  }

  /** Import routes through schema/migration/checksum validation before anything reaches storage (`PrisonSaveRepository.importSave`). */
  public async importInto(prisonId: string, raw: unknown): Promise<SaveResult> {
    return this.repository.importSave(prisonId, raw);
  }

  public closeSession(): void {
    this.autosave.dispose();
    this.session = undefined;
  }

  public dispose(): void {
    this.closeSession();
  }
}
