import { decodeSaveEnvelope, decodeSaveEnvelopeUnlessTrusted, type SaveDecodeError, type SaveEnvelope } from '../save-schema';
import { applyGenerationRetention } from './generation-policy';
import { classifyStoreError, type SaveWriteError } from './errors';
import { decodePrisonSlotMetadata, encodePrisonSlotMetadata, requirePrisonSlotMetadata } from './slot-metadata-schema';
import type { LocalSaveStore, LocalSaveTransaction, PendingSyncState, PrisonSlotMetadata } from './store';

export type SaveResult =
  | { readonly ok: true; readonly generationId: string }
  | { readonly ok: false; readonly error: SaveWriteError };

/**
 * The outcome of an import, which has two things to report that a save does
 * not (#287).
 *
 * `SaveResult` carries a `SaveWriteError`, and a `SaveWriteError` can only
 * say `quota-exceeded`, `transaction-aborted` or `unknown-error` -- the three
 * ways *storage* fails. An import can also be refused before storage is
 * reached at all, and `decodeSaveEnvelope` already distinguishes those
 * reasons: a file that never declared a save schema version, a save from a
 * newer schema version than this build understands, a structurally invalid
 * one and a checksum mismatch are four different facts about the file the
 * player chose. Collapsing them into `unknown-error` -- which is what this
 * method did while nothing called it -- leaves the UI with one sentence for
 * all four, so the decode error travels beside the write error rather than
 * being flattened into its message. `rejected` is absent exactly when the
 * envelope decoded and the *write* is what failed, so a caller can still hand
 * that arm to the existing `describeSaveResult` mapping unchanged.
 *
 * `migrated` on the success arm is the other half: a save written by an older
 * build is migrated on the way in (`decodeSaveEnvelope` walks the chain), and
 * whether that happened is a fact about the file worth telling the player and
 * worth being able to assert in a test.
 */
export type SaveImportResult =
  | { readonly ok: true; readonly generationId: string; readonly migrated: boolean }
  | { readonly ok: false; readonly error: SaveWriteError; readonly rejected?: SaveDecodeError };

/**
 * What `demoteGeneration` did, and when it did nothing, why.
 *
 * It used to return `void`, and the reason it no longer can is a data-loss
 * defect this repository could not report its way out of.
 *
 * Demotion **deletes** a generation, and the only thing that justifies
 * deleting a save is that a better one remains. The caller that drives it
 * (`SessionController.loadPrison`) walks the retained window newest-first, and
 * the *usual* reason a host refuses a generation is deterministic — a payload
 * shape this build cannot restore, or a bug in this build's own restore code,
 * which `SimulationWorkerStateMachine.handleInitialize` labels
 * `snapshot-incompatible` identically to a genuinely bad blob because it
 * catches every exception from `restoreSimulationRuntime`. A deterministic
 * cause fails on *every* generation, so a walk that demoted each refusal as it
 * happened deleted the whole window: measured on v0.0.112, three good
 * generations became zero in a single load, and the prison stayed unloadable
 * afterwards even once the failure was removed, because there was nothing left
 * to load. One generation is enough for it: the same walk deleted a legitimate
 * V1 save that had migrated and checksummed cleanly on the way in.
 *
 * **`loadPrison` now calls this only once a *different* generation has
 * actually restored** (#403 (d)). That is what "a better one remains" means
 * literally rather than by assumption: another generation went through the
 * same restore code on the same build moments earlier and came back a running
 * simulation, so what is wrong is this save. A deterministic cause reaches
 * this method not at all, and costs nothing.
 * `tests/integration/session-restore-failure.test.ts` pins both halves --
 * "a deterministic refusal costs no generation at all" for the walk that
 * retires nothing, and "demotes the unrestorable generation, restores the
 * previous one" for the retirement a success earns.
 *
 * `'last-generation-retained'` is the floor underneath that, and it is now a
 * second belt rather than the thing holding the window up: the last retained
 * generation is never deleted, however confidently it has been refused.
 * `loadPrison` can no longer reach it -- the generation that restored is
 * always retained, so a demotion driven by it always leaves at least that one
 * behind -- but the floor is what any *other* caller runs into, and what
 * catches a future walk that forgets the rule above. It costs the player
 * nothing but a refused load: a prison whose only generation cannot be
 * restored and a prison with an empty window both answer `no-valid-generation`
 * from `SessionController.loadPrison` (`loadCurrent` still returns the
 * retained envelope, which is the point), both keep their row in the prison
 * list, and `delete()` still clears either one -- and it is the difference
 * between a save that a fixed build can still open and a save that no longer
 * exists.
 *
 * `'not-retained'` is the pre-existing no-op: an unknown prison, or a
 * generation already outside the retained window. It is reported rather than
 * swallowed so a caller looping over generations cannot mistake "nothing
 * happened" for progress and spin.
 *
 * Both rules came from the *decode* path, which has always had them.
 * `loadCurrent` drops confirmed-corrupt generations through
 * `recoverToGeneration`, which runs **only after** a generation has validated
 * -- when nothing in the window validates it deletes nothing at all. Demotion
 * was the one path in this file that would empty a window; it no longer is.
 */
export type DemotionResult =
  | { readonly demoted: true }
  | { readonly demoted: false; readonly reason: 'last-generation-retained' | 'not-retained' };

export type LoadRecoveryOutcome = 'current' | 'recovered-previous';

export interface LoadCurrentOptions {
  /**
   * Generations the caller has already tried and cannot use, for a reason
   * this method structurally cannot see: a save that passed schema, migration
   * and checksum and then failed to *restore*. They are passed over as if they
   * were not retained -- neither returned, nor retired to get past them.
   *
   * That second half is the point (#403 (d)). The walk used to advance by
   * *deleting*: `loadCurrent` re-derives its candidate list from metadata on
   * every call, so it kept handing back the same generation until the caller
   * retired one, and retiring one deletes it. A restore failure whose cause is
   * this build's own code is deterministic, so it refuses every generation in
   * turn -- and each refusal cost a generation. Skipping costs none, and the
   * caller retires what it refused only once a *different* generation has
   * actually restored, which is the rule the decode path below has always
   * followed.
   */
  readonly skip?: ReadonlySet<string>;
}

export type LoadResult =
  | { readonly ok: true; readonly envelope: SaveEnvelope; readonly generationId: string; readonly outcome: LoadRecoveryOutcome }
  | { readonly ok: false; readonly reason: 'not-found' | 'no-valid-generation' };

export interface CreatePrisonInput {
  readonly prisonId: string;
  readonly gameVersion: string;
  readonly displayName?: string;
}

export interface PrisonSaveRepositoryOptions {
  /** Current generation plus this many previous safe copies. Default 3 (current + 2 previous, matching the issue's minimum). */
  readonly keepGenerations?: number;
  readonly now?: () => number;
  readonly generateGenerationId?: () => string;
}

/**
 * Every single-slot read goes through here, so validation cannot be
 * forgotten at one of its call sites (`list()` uses the list form,
 * `requirePrisonSlotMetadata`). `undefined` means "no such slot"; a record
 * that fails validation throws `CorruptSlotMetadataError` (see
 * `slot-metadata-schema.ts` for why it is refused rather than treated as
 * absent).
 */
function readSlot(record: unknown, prisonId?: string): PrisonSlotMetadata | undefined {
  return decodePrisonSlotMetadata(record, prisonId);
}

/** Every write of a slot record, validated on the way in for the same reason. */
async function writeSlot(tx: LocalSaveTransaction, metadata: PrisonSlotMetadata): Promise<void> {
  await tx.putMetadata(encodePrisonSlotMetadata(metadata));
}

let generationSequence = 0;
function defaultGenerationId(): string {
  generationSequence += 1;
  return `gen-${Date.now().toString(36)}-${generationSequence.toString(36)}`;
}

/**
 * Local-first save repository. All policy — generation retention, startup
 * recovery, export/import validation — lives here against the storage-
 * agnostic `LocalSaveStore`, so it is fully testable with the in-memory
 * fake (see memory-store.ts) independent of any real or polyfilled
 * IndexedDB. Settings/accessibility preferences (src/input/storage.ts) and
 * Supabase sync execution (#20) are deliberately separate concerns.
 */
export class PrisonSaveRepository {
  private readonly keepGenerations: number;
  private readonly now: () => number;
  private readonly generateGenerationId: () => string;

  public constructor(
    private readonly store: LocalSaveStore,
    options: PrisonSaveRepositoryOptions = {},
  ) {
    this.keepGenerations = options.keepGenerations ?? 3;
    this.now = options.now ?? Date.now;
    this.generateGenerationId = options.generateGenerationId ?? defaultGenerationId;
  }

  public async list(): Promise<readonly PrisonSlotMetadata[]> {
    const stored = await this.store.runTransaction('readonly', (tx) => tx.listMetadata());
    // One unreadable record refuses the whole list rather than being skipped:
    // see `decodePrisonSlotMetadata`'s header for why absent is not a safe
    // synonym for corrupt here, and docs/PERSISTENCE.md for the availability
    // trade-off that choice makes.
    return stored.map((record) => requirePrisonSlotMetadata(record));
  }

  public async create(input: CreatePrisonInput): Promise<PrisonSlotMetadata> {
    return this.store.runTransaction('readwrite', async (tx) => {
      const existing = readSlot(await tx.getMetadata(input.prisonId), input.prisonId);
      if (existing !== undefined) {
        throw new Error(`Prison "${input.prisonId}" already exists.`);
      }
      const timestamp = this.now();
      const metadata: PrisonSlotMetadata = {
        prisonId: input.prisonId,
        gameVersion: input.gameVersion,
        currentGenerationId: undefined,
        generationIds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      };
      await writeSlot(tx, metadata);
      return metadata;
    });
  }

  public async delete(prisonId: string): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) return;
      for (const generationId of metadata.generationIds) {
        await tx.deleteGeneration(prisonId, generationId);
      }
      await tx.deleteMetadata(prisonId);
    });
  }

  /**
   * Writes a new generation and atomically advances the current-generation
   * pointer. A prior good generation is only deleted after the new one and
   * the updated pointer are staged in the same transaction, so a failed
   * write can never destroy the last known-good generation.
   *
   * Validation is provenance-based, not caller-declared (#49): an envelope
   * this process itself built (`createSaveEnvelope`) or already decoded
   * (`decodeSaveEnvelope`, i.e. the import/load paths) is written as-is,
   * because re-walking a payload this process validated moments ago was
   * measured as roughly a third of an autosave. Every other envelope — an
   * import, a value read back from storage, anything that crossed a process
   * or serialization boundary, and anything merely *cast* to the trusted type
   * — is still fully validated here before it can reach storage.
   */
  public async save(prisonId: string, envelope: SaveEnvelope): Promise<SaveResult> {
    const decoded = decodeSaveEnvelopeUnlessTrusted(envelope);
    if (!decoded.ok) {
      return { ok: false, error: { code: 'unknown-error', message: `Refusing to persist an invalid envelope: ${decoded.error.message}` } };
    }

    const generationId = this.generateGenerationId();

    try {
      await this.store.runTransaction('readwrite', async (tx) => {
        const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
        if (metadata === undefined) {
          throw new Error(`Prison "${prisonId}" does not exist. Call create() first.`);
        }

        await tx.putGeneration(prisonId, generationId, decoded.value);

        const retention = applyGenerationRetention(metadata.generationIds, generationId, this.keepGenerations);
        await writeSlot(tx, {
          ...metadata,
          currentGenerationId: generationId,
          generationIds: retention.generationIds,
          updatedAt: this.now(),
        });

        for (const staleGenerationId of retention.toDelete) {
          await tx.deleteGeneration(prisonId, staleGenerationId);
        }
      });
    } catch (error) {
      return { ok: false, error: classifyStoreError(error) };
    }

    return { ok: true, generationId };
  }

  /**
   * Startup recovery policy: try the current generation first; if it is
   * missing or fails schema/checksum validation, walk the remaining
   * generations newest-first and adopt the first one that validates,
   * updating the pointer so the corrupt generation is not retried on every
   * boot. Returns `no-valid-generation` only when nothing in the retained
   * window validates -- and, exactly as before, having deleted nothing in
   * that case.
   *
   * **Nothing is deleted here except generations this call proved
   * undecodable, and only once a *later* one has decoded.** A generation the
   * caller asked to `skip` is not judged by this method at all, so it is
   * neither returned nor retired; see `LoadCurrentOptions.skip`.
   */
  public async loadCurrent(prisonId: string, options: LoadCurrentOptions = {}): Promise<LoadResult> {
    const metadata = readSlot(await this.store.runTransaction('readonly', (tx) => tx.getMetadata(prisonId)), prisonId);
    if (metadata === undefined) return { ok: false, reason: 'not-found' };

    const candidates = [...metadata.generationIds].reverse().filter((id) => options.skip?.has(id) !== true); // newest first
    for (const [index, generationId] of candidates.entries()) {
      const raw = await this.store.runTransaction('readonly', (tx) => tx.getGeneration(prisonId, generationId));
      const decoded = raw === undefined ? undefined : decodeSaveEnvelope(raw);
      if (decoded?.ok !== true) continue;

      // Everything this walk passed over is confirmed-invalid: it was read
      // and it did not decode. Skipped generations are not in `candidates`,
      // so they can never end up here.
      const confirmedInvalid = candidates.slice(0, index);
      // The other reason the generation that decoded is not the current one
      // is a pointer that has fallen outside the retained window, which this
      // read heals. A pointer that is retained and simply older than the
      // generation returned is left alone -- moving it would be a write on a
      // read that retired nothing.
      const pointerIsRetained =
        metadata.currentGenerationId !== undefined && metadata.generationIds.includes(metadata.currentGenerationId);
      if (confirmedInvalid.length > 0 || !pointerIsRetained) {
        await this.recoverToGeneration(prisonId, generationId, confirmedInvalid);
      }

      return {
        ok: true,
        envelope: decoded.value,
        generationId,
        outcome: generationId === metadata.currentGenerationId ? 'current' : 'recovered-previous',
      };
    }

    return { ok: false, reason: 'no-valid-generation' };
  }

  /**
   * Demotes one generation: drops it from the retained window, deletes the
   * record, and — if it was the current one — repoints
   * `currentGenerationId` at the newest generation that remains.
   *
   * This is the same demotion `loadCurrent` performs for a generation that
   * fails schema/checksum validation, exposed for the failures `loadCurrent`
   * structurally cannot see. A save can pass `decodeSaveEnvelope` and still
   * be impossible to restore — `save-schema.ts` deliberately does not
   * duplicate `SparseWorld.fromSnapshot`'s semantic checks — and until #103
   * such a generation stayed current for ever, so every later load in that
   * tab retried the same unloadable save.
   *
   * Deleting rather than merely un-pointing, for the reason the decode path
   * already deletes: a generation left out of `generationIds` is unreachable
   * by every read path and would never be deleted by `delete()` either, so
   * un-pointing alone would leak it. The caller decides what counts as
   * confirmed-unrestorable; `SessionController.loadPrison` demotes only on a
   * `SnapshotRestoreRejectedError`, never on a host that failed to answer, and
   * only once a different generation has restored (#403 (d)).
   *
   * **The last retained generation is never demoted**, and that floor is the
   * reason this method reports what it did instead of returning `void`. See
   * `DemotionResult` and "Never the last copy" in docs/PERSISTENCE.md for the
   * measurement behind it.
   */
  public async demoteGeneration(prisonId: string, generationId: string): Promise<DemotionResult> {
    return this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) return { demoted: false, reason: 'not-retained' };
      if (!metadata.generationIds.includes(generationId)) return { demoted: false, reason: 'not-retained' };
      // The floor. One generation left means this is the player's only
      // remaining copy of this prison, and there is nothing to fall back to
      // once it is gone, so demoting it can only turn a prison this build
      // cannot load into a prison no build can ever load.
      if (metadata.generationIds.length <= 1) return { demoted: false, reason: 'last-generation-retained' };

      const generationIds = metadata.generationIds.filter((id) => id !== generationId);
      // `generationIds` is ordered oldest-first, so the newest survivor is last.
      const nextCurrent = metadata.currentGenerationId === generationId
        ? generationIds[generationIds.length - 1]
        : metadata.currentGenerationId;
      await writeSlot(tx, {
        ...metadata,
        currentGenerationId: nextCurrent,
        generationIds,
        updatedAt: this.now(),
      });
      await tx.deleteGeneration(prisonId, generationId);
      return { demoted: true };
    });
  }

  /**
   * Points the slot at `recoveredGenerationId` and deletes the generations
   * the caller proved invalid on the way to it. It runs **only after** a
   * generation has decoded, which is why the decode path has never been able
   * to empty a window: when nothing decodes, this is never called.
   */
  private async recoverToGeneration(
    prisonId: string,
    recoveredGenerationId: string,
    confirmedInvalid: readonly string[],
  ): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) return;
      await writeSlot(tx, {
        ...metadata,
        currentGenerationId: recoveredGenerationId,
        generationIds: metadata.generationIds.filter((id) => !confirmedInvalid.includes(id)),
      });
      for (const invalidId of confirmedInvalid) {
        await tx.deleteGeneration(prisonId, invalidId);
      }
    });
  }

  public async exportSave(prisonId: string): Promise<SaveEnvelope | undefined> {
    const result = await this.loadCurrent(prisonId);
    return result.ok ? result.envelope : undefined;
  }

  /**
   * Validates `raw` through schema/migration/checksum (#18) before it ever
   * reaches storage.
   *
   * `decodeSaveEnvelope` is the whole of the migration story here: an older
   * save is walked V1 -> V2 -> V3 -> V4 by `saveMigrationChain` and its
   * checksum is verified against the payload as it was *written*, so what
   * reaches `save()` is always a current-version envelope. Nothing above this
   * method has to know a migration happened -- only that one did, which is
   * what `migrated` reports.
   *
   * The decode error is returned rather than folded into the message, so the
   * caller can tell the four ways a file is refused apart. See
   * `SaveImportResult`.
   */
  public async importSave(prisonId: string, raw: unknown): Promise<SaveImportResult> {
    const decoded = decodeSaveEnvelope(raw);
    if (!decoded.ok) {
      return {
        ok: false,
        error: { code: 'unknown-error', message: `Import rejected: ${decoded.error.message}` },
        rejected: decoded.error,
      };
    }
    const result = await this.save(prisonId, decoded.value);
    return result.ok ? { ...result, migrated: decoded.migrated } : result;
  }

  public async markPendingSync(prisonId: string, pendingSync: PendingSyncState): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) throw new Error(`Prison "${prisonId}" does not exist.`);
      await writeSlot(tx, { ...metadata, pendingSync });
    });
  }

  public async clearPendingSync(prisonId: string): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) throw new Error(`Prison "${prisonId}" does not exist.`);
      const { pendingSync: _omit, ...rest } = metadata;
      await writeSlot(tx, rest);
    });
  }
}
