import { restoredScopeFor, type RestoredScope, type SessionSnapshotBundle } from '../../simulation/runtime/restore-session';
import { AutosaveScheduler } from '../local/autosave';
import type { PrisonSaveRepository, SaveImportResult, SaveResult } from '../local/repository';
import type { PrisonSlotMetadata } from '../local/store';
import { createSaveEnvelope, type SaveEnvelope, type TrustedSaveEnvelope } from '../save-schema';
import { SnapshotRestoreRejectedError, type SessionRuntimeHost } from './runtime-host';

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
  private retirementFailure: unknown;

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

  /**
   * The error from the last load that restored a prison and then could not
   * delete the generations it had refused, if there was one.
   *
   * Reported rather than swallowed: `loadPrison` deliberately does not fail a
   * successful load over housekeeping (see there), and an error nothing can
   * observe is indistinguishable from a bug that stopped retiring anything.
   * Cleared by the next load that gets that far.
   */
  public getLastRetirementFailure(): unknown {
    return this.retirementFailure;
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

    let adopted = false;
    let result: SaveResult;
    try {
      await this.host.startNew(this.masterSeed);
      this.adoptSession(prisonId);
      adopted = true;
      result = await this.saveNow();
    } catch (error) {
      await this.discardFailedCreation(prisonId, adopted);
      throw error;
    }

    // `saveNow` reports failure as a *value*, deliberately (see its comment:
    // a faulted worker must never throw into a click handler). So the catch
    // above cannot see it, and without this branch a failed save would leave
    // exactly the slot this method promises not to leave.
    if (!result.ok) await this.discardFailedCreation(prisonId, adopted);
    return result;
  }

  /**
   * Undoes a `createPrison` that got as far as writing the slot but never
   * produced generation 1.
   *
   * Such a slot is worse than no slot: `loadCurrent` reports it as
   * `no-valid-generation`, so it survives in the prison list as a row the
   * player can see, select and never load. Issue #65 saw one appear from a
   * double-click, where the second creation wrote its row and then waited 15s
   * for a worker already busy with the first.
   *
   * Deletion failure is swallowed on purpose: the caller is already being told
   * that creation failed, and replacing that with a cleanup error would hide
   * the cause the player actually needs.
   */
  private async discardFailedCreation(prisonId: string, adopted: boolean): Promise<void> {
    // `adoptSession` disposes the previous session's autosave, so once it has
    // run there is no previous session to fall back to -- restoring it would
    // leave the player with a prison they believe is autosaving and is not.
    // Before adoption the previous session is untouched, so leave it alone.
    if (adopted) this.session = undefined;

    try {
      await this.repository.delete(prisonId);
    } catch {
      // Intentionally ignored -- see the doc comment above.
    }
  }

  /**
   * Loads a prison and makes it the active session. Reports whether recovery
   * fell back to a previous generation, and what the bundle it actually
   * loaded restores -- derived from that bundle by `restoredScopeFor`, not
   * from a constant. This method holds the payload, so it is the only place
   * that can answer the question honestly for a legacy save (#109).
   *
   * The generation walk covers restore failures, not only decode failures
   * (#103). `loadCurrent` can only judge a generation by schema, migration
   * and checksum; a save that passes all three and still cannot be restored
   * — `save-schema.ts` deliberately does not duplicate
   * `SparseWorld.fromSnapshot`'s semantic checks — used to be returned as
   * `current` and stay current for ever, leaving the prison permanently
   * unloadable by the very mechanism the repository's rollback exists to
   * provide. So a snapshot the host *rejects* is set aside and the
   * next-newest generation is tried, until one restores or there is nothing
   * left to try.
   *
   * **A refused generation is retired only once a different one has actually
   * restored** (#403 (d)). A rejected snapshot is not proof that the save is
   * bad: the worker labels a bug in this build's own restore code
   * `snapshot-incompatible` exactly as it labels a genuinely bad payload
   * (`SimulationWorkerStateMachine.handleInitialize` catches every exception
   * out of `restoreSimulationRuntime`), and such a cause is deterministic, so
   * it rejects every generation this loop offers it. Retiring each one as it
   * was refused deleted every save the player had -- three generations to
   * zero in one load, measured on v0.0.112, and all but one after
   * `demoteGeneration` gained its floor. Nothing is retired until a
   * *different* generation has restored, so a deterministic cause now costs
   * **no** generation at all: the prison is unloadable by this build, which
   * is what `no-valid-generation` already says, and every save is still there
   * for a build that can read it.
   *
   * That is not a new rule; it is the one the decode path has always
   * followed. `loadCurrent` walks past a generation that fails to decode and
   * retires it only through `recoverToGeneration`, which runs after a later
   * generation has decoded — so a window in which nothing decodes loses
   * nothing. This walk now says the same about restoring.
   *
   * A generation that *is* retired here has earned it in the strongest sense
   * available: another generation restored through the same code on the same
   * build moments later, so what is wrong is that save. `demoteGeneration`
   * still refuses to delete the last retained copy (see `DemotionResult`),
   * which is now a second belt — the restored generation is always retained,
   * so the window can no longer be walked empty in the first place.
   *
   * Only `SnapshotRestoreRejectedError` costs a generation anything. A host
   * that timed out, was never started or has gone away propagates unchanged:
   * the save may be perfectly good and deleting it would be the more
   * expensive mistake.
   */
  public async loadPrison(prisonId: string): Promise<SessionLoadOutcome> {
    // Insertion-ordered, so this is both the set `loadCurrent` skips and the
    // newest-first order the refused generations are retired in below.
    const refused = new Set<string>();

    for (;;) {
      const result = await this.repository.loadCurrent(prisonId, { skip: refused });
      if (!result.ok) return { ok: false, reason: result.reason };
      if (refused.has(result.generationId)) {
        // The skip set is what makes this walk terminate: it only ever grows,
        // so a repository that honours it runs out of candidates. One that
        // offers a skipped generation back would spin for ever inside a click
        // handler, so it is a contract violation and says so.
        throw new Error(`Save generation "${result.generationId}" was refused and offered again; the prison cannot be loaded.`);
      }

      // The envelope's payload is structurally the session snapshot bundle;
      // it has already passed schema, migration and checksum validation in
      // `loadCurrent`, so the host receives verified state at the current
      // save-schema version -- an older save was migrated on the way through.
      //
      // Read twice, deliberately: once to restore, and once to report which
      // sections actually arrived. A migrated V1/V2 save carries no
      // `simulation` or `identity`, and the scope has to say so (#109).
      const bundle = result.envelope.payload as unknown as SessionSnapshotBundle;

      try {
        await this.host.startFromSnapshot(bundle);
      } catch (error) {
        if (!(error instanceof SnapshotRestoreRejectedError)) throw error;
        // Set aside, not retired. Nothing on disk changes until something
        // restores, so a walk that reaches the end of the window leaves the
        // player with exactly what they had.
        refused.add(result.generationId);
        continue;
      }

      this.adoptSession(prisonId, result.envelope.revision, result.envelope.createdAt);

      // A different generation restored, which is what turns each refusal
      // above from "this build cannot restore anything" into "this build
      // cannot restore *that save*". Retire them newest-first, so the pointer
      // `demoteGeneration` heals lands on the generation that just restored.
      //
      // After adoption, and failure-tolerant, because this is housekeeping
      // and the load has already succeeded: the player's prison is restored
      // and running, and a storage error while deleting a save that is known
      // to be unrestorable must not be reported as a failed load. It costs
      // one refused restore on the next load, which retires it then --
      // the same self-healing the walk above is built on. (Before #403 (d)
      // this call sat *ahead* of the successful restore, so a throw here
      // could only fail a load that was failing anyway.)
      this.retirementFailure = undefined;
      try {
        for (const refusedGenerationId of refused) {
          await this.repository.demoteGeneration(prisonId, refusedGenerationId);
        }
      } catch (error) {
        this.retirementFailure = error;
      }

      return {
        ok: true,
        recovered: refused.size > 0 || result.outcome === 'recovered-previous',
        scope: restoredScopeFor(bundle),
      };
    }
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
   * The return type is deliberately the branded `TrustedSaveEnvelope`
   * (#49): it records in the type system that this envelope was composed and
   * validated in-process, so a future refactor that fed `saveNow` an envelope
   * of unknown provenance would fail to typecheck rather than silently take
   * the fast write path. Provenance is additionally enforced at runtime by
   * object identity, so a cast could not bypass validation either.
   */
  public async buildEnvelope(): Promise<TrustedSaveEnvelope | undefined> {
    const session = this.session;
    if (session === undefined) return undefined;

    const bundle = await this.host.capture();
    const timestamp = this.now();
    return createSaveEnvelope({
      // The captured bundle's seed, never `this.masterSeed` (#412): that option
      // is what a *new* prison is created with, and a session loaded from a
      // save was seeded by whoever created it. Spread rather than passed
      // straight through, so a host that reports no seed writes the same
      // payload it wrote before the field existed.
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      gameVersion: this.gameVersion,
      prisonId: session.prisonId,
      revision: session.revision + 1,
      createdAt: session.createdAt,
      updatedAt: timestamp,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
  }

  /** Manual save. Returns durable success/failure evidence (issue #19: "manual save returns durable success/failure evidence"). */
  public async saveNow(): Promise<SaveResult> {
    const session = this.session;
    if (session === undefined) {
      return { ok: false, error: { code: 'unknown-error', message: 'No active session to save.' } };
    }

    let envelope: TrustedSaveEnvelope | undefined;
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

  public async exportActive(): Promise<SaveEnvelope | undefined> {
    return this.session === undefined ? undefined : this.repository.exportSave(this.session.prisonId);
  }

  /**
   * Import routes through schema/migration/checksum validation before anything
   * reaches storage (`PrisonSaveRepository.importSave`).
   *
   * It writes a new generation of `prisonId` and nothing else: the imported
   * save does not become the live session here, because making it live is
   * `loadPrison`'s job and doing both in one call would hide a failed restore
   * behind a successful write. A caller that wants the file to become the
   * game -- the save panel's Import control (#287) -- imports and then loads,
   * and reports each half.
   *
   * `SaveImportResult` rather than `SaveResult` because a refused import has
   * more to say than a failed write; see the type.
   */
  public async importInto(prisonId: string, raw: unknown): Promise<SaveImportResult> {
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
