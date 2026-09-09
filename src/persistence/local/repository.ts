import {
  decodeSaveEnvelope,
  decodeSaveEnvelopeUnlessTrusted,
  type SaveDecodeError,
  type SaveDecodeErrorCode,
  type SaveEnvelope,
} from '../save-schema';
import {
  applyConfirmedRetention,
  applyGenerationRetention,
  applyProvisionalRetention,
  isQuarantinedGenerationId,
  quarantinedGenerationId,
  readableGenerationIds,
  releasedGenerationId,
  type GenerationRetentionResult,
} from './generation-policy';
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
 * which `SimulationWorkerStateMachine.handleInitialize` used to label
 * `snapshot-incompatible` identically to a genuinely bad blob because it
 * caught every exception from `restoreSimulationRuntime`. **That second half
 * is history since #431**: an exception no check on the restore path declared
 * now arrives as `SnapshotRestoreFaultError`, which is not the class
 * `loadPrison` demotes on, so a defect of ours can no longer reach this method
 * at all. The first half stands unchanged, and so does everything below: a
 * genuinely bad payload is still deterministic, so it still fails on *every*
 * generation. A walk that demoted each refusal as it
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
 * **Which of ADR 0063's two save-side verdicts a refusal declared decides
 * whether this method is the one called at all (#432).** `damaged-payload`
 * comes here. `unsupported-by-this-build` goes to `quarantineGeneration`
 * instead, because the bytes are coherent and the build that reads them
 * already exists — deleting them would be the one deletion this repository
 * makes against a verdict it has just reached.
 *
 * `'last-generation-retained'` is the floor underneath that, and it is now a
 * second belt rather than the thing holding the window up: the last retained
 * generation is never deleted, however confidently it has been refused. It is
 * counted over the generations this build has *not* set aside as unreadable,
 * because a quarantined generation is a copy for a later build rather than a
 * fallback for this one.
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

/**
 * What `confirmGeneration` did with the window's spare slot.
 *
 * `'not-retained'` matches `DemotionResult`'s arm of the same name: an
 * unknown prison, or a generation outside the retained window.
 *
 * `'not-the-newest-generation'` is the one that carries a rule. The spare
 * slot belongs to the newest generation and to no other -- that is the whole
 * of `applyProvisionalRetention`'s invariant -- so confirming an *older*
 * generation must not close the window, because the generation that would
 * pay for it is the unproven import still sitting on top. It is reported
 * rather than treated as success so a caller cannot read "nothing was
 * retired" as "the window is within budget".
 */
export type GenerationConfirmation =
  | { readonly confirmed: true; readonly retired: readonly string[] }
  | { readonly confirmed: false; readonly reason: 'not-retained' | 'not-the-newest-generation' };

/**
 * What `quarantineGeneration` did with the window's one quarantine slot
 * (#432).
 *
 * `'not-retained'` matches the arm of the same name above: an unknown prison,
 * or a generation outside the retained window. `'nothing-stored'` is the
 * neighbouring case the other two methods never have to name -- the id is
 * retained but no record answers to it -- and it is separate because
 * quarantine exists to keep *bytes*, so "there are none" is a different
 * outcome from "there is no such generation".
 *
 * `'last-readable-generation-retained'` is `DemotionResult`'s floor, restated
 * for the one caller that does not delete anything. Setting a generation aside
 * costs no bytes, but it does take it out of the count this build offers the
 * player, and a window every one of whose generations is quarantined would
 * report a prison with saves as a prison with none.
 *
 * `'newer-generation-quarantined'` is the bound. The slot holds **one**
 * generation, and it holds the newest candidate for it, so quarantining an
 * older one is declined rather than allowed to evict a newer save that is
 * worth at least as much. The declined generation stays an ordinary retained
 * generation and is evicted by the ordinary rules in due course -- which is
 * exactly what is sacrificed when the bound binds: of two saves this build
 * cannot read, the older one goes.
 *
 * `evicted` on the success arm names the quarantined generations this call
 * deleted to take the slot. It is empty on every call but the one that
 * displaces a previous occupant.
 */
export type QuarantineResult =
  | { readonly quarantined: true; readonly generationId: string; readonly evicted: readonly string[] }
  | {
      readonly quarantined: false;
      readonly reason: 'not-retained' | 'nothing-stored' | 'last-readable-generation-retained' | 'newer-generation-quarantined';
    };

/**
 * What `releaseQuarantinedGeneration` did (#432).
 *
 * The mark says *this build refused these bytes*. A build that has just
 * restored them has falsified that, so the mark comes off and the generation
 * goes back to being an ordinary member of the retained window -- including
 * being evictable again, which is the slot being handed back.
 *
 * `'not-quarantined'` is the no-op every ordinary load takes, reported rather
 * than swallowed for `DemotionResult`'s reason: a caller must be able to tell
 * "nothing needed doing" from "this did not apply".
 */
export type QuarantineRelease =
  | { readonly released: true; readonly generationId: string }
  | { readonly released: false; readonly reason: 'not-retained' | 'nothing-stored' | 'not-quarantined' };

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

/**
 * A generation id no other realm can mint (#582 FINAL-022).
 *
 * **This read `gen-<Date.now() base36>-<module counter base36>` until
 * 2026-09-09, and the counter was the defect.** Module state is per JavaScript
 * realm, so every tab and every worker starts it at zero: two of them saving in
 * the same millisecond minted the *same* id for different bytes. A generation
 * id is the key the payload is stored under **and** the entry in
 * `generationIds`, so a collision is one generation quietly overwriting
 * another's bytes while both stay listed -- a corrupted save that reads as a
 * healthy one.
 *
 * `crypto.randomUUID()` is this repository's stated convention for ids minted
 * on the main thread (`src/ui/save-panel.ts`), and it needs no coordination
 * between realms, which is the whole property a counter cannot have.
 *
 * **The one property `generation-policy.ts` reasons about is preserved and is
 * pinned by a test**: a UUID emits only hex and `-`, so `!` remains a character
 * this function cannot produce, and quarantine therefore still means "was
 * quarantined" rather than "happened to be named that way".
 */
function defaultGenerationId(): string {
  return `gen-${crypto.randomUUID()}`;
}

/**
 * What a *decode* refusal licenses `loadCurrent` to do with the generation
 * that produced it.
 *
 * ## The defect this replaces
 *
 * The walk had one bucket. Every generation it passed over on the way to one
 * that decoded was named `confirmedInvalid` and handed to
 * `recoverToGeneration`, which deletes -- and `decodeSaveEnvelope` returns six
 * distinct codes, of which exactly one means *"the bytes are fine and this
 * build is the wrong reader"*. So a generation written by a **newer** build
 * was destroyed the moment an older readable one was found, on the strength of
 * a refusal whose own meaning is that a reader exists. `migration.ts` had
 * written the mechanism down without anybody reading it as a defect: it says
 * of its own error union that `PrisonSaveRepository.loadCurrent` *"treats any
 * `ok !== true` alike"*.
 *
 * That is the deletion [ADR 0065](../../../docs/adr/0065-what-happens-to-a-save-this-build-cannot-read.md)
 * exists to prevent, one boundary below the one it decided. Its argument is
 * about evidence rather than certainty and it transfers verbatim: for
 * `unsupported-by-this-build`, *"a build that reads the bytes is known to
 * exist -- it wrote them"*, and a save declaring a `saveSchemaVersion` this
 * build has never heard of makes that claim more directly than a refused
 * restore can. `SessionController.loadPrison` has honoured the distinction at
 * the restore layer since #432; this is the same rule at the decode layer.
 *
 * ## The four outcomes, and why the reason has to travel with the id
 *
 * - `'record-absent'` -- the id is retained and no record answers to it. There
 *   are no bytes to keep and none to destroy, so dropping the id from the
 *   window is pure healing and is what this walk has always done.
 * - `'undecodable-content'` -- this build read the bytes and reached a verdict
 *   **about them**. Deleted, once a later generation has decoded, exactly as
 *   before.
 * - `'unsupported-version'` -- quarantined through `quarantineGeneration`,
 *   which already carries ADR 0065's bound of one per prison and its exemption
 *   from the retention budget. Nothing new is stored and no second store is
 *   invented; the decode layer simply becomes a second caller of the mechanism
 *   the restore layer already uses.
 * - `'no-verdict'` -- our own migration chain failed, so no verdict about the
 *   save has been reached at all. Nothing is deleted, nothing is marked and
 *   nothing is repointed. This is #431's rule (`SnapshotRestoreFaultError`
 *   costs the generation nothing) applied to the code fault that happens
 *   earlier: `docs/PERSISTENCE.md`'s taxonomy calls
 *   `migration-produced-invalid-output` *"a bug in the migration, not the
 *   input"*, and a build must not delete a player's save on the strength of
 *   its own bug.
 *
 * ## `invalid-shape` is deliberately NOT decided here
 *
 * It stays in `'undecodable-content'`, which is exactly what it did before
 * this change, and that is a decision **declined** rather than taken.
 * `docs/PERSISTENCE.md` records that an optional field added without a format
 * bump is refused by an older `.strict()` schema as `invalid-shape` where a
 * version bump would have produced `unsupported-version` -- *"Both builds
 * refuse it; only the diagnosis differs."* So the code is ambiguous: sometimes
 * a real future-build mismatch whose bytes a newer build reads, sometimes
 * genuine corruption. Routing it either way is an amendment to ADR 0065's
 * taxonomy, and `AGENTS.md` and `CLAUDE.md` both put an absent architectural
 * decision in an ADR rather than in implementation code.
 * `docs/adr/drafts/decode-refusals-and-the-ambiguity-of-invalid-shape.md` is
 * that proposal. Until it is ruled on, this arm behaves as it always has.
 *
 * `no-migration-path` is grouped with the migrator faults rather than with the
 * version mismatch for the same care: `docs/PERSISTENCE.md` describes it as
 * *"A declared or intermediate version has no registered schema/migration"*,
 * which is a gap in this build's chain and not a reading of the bytes. It
 * therefore gets the outcome that asserts least -- nothing -- rather than the
 * prison's one quarantine slot, which ADR 0065 decision 1 allocated to the
 * verdict with a demonstrated reader behind it.
 */
type DecodeRefusalVerdict = 'record-absent' | 'undecodable-content' | 'unsupported-version' | 'no-verdict';

/**
 * The mapping above, as code. Exhaustive over `SaveDecodeErrorCode` on
 * purpose: a seventh decode code has to decide keep-or-delete here rather than
 * inheriting whichever branch happened to be the fallback, and `never` makes
 * adding one a typecheck failure at this line -- the same guard
 * `SessionController.loadPrison` puts on the restore taxonomy.
 */
function verdictForDecodeRefusal(code: SaveDecodeErrorCode): DecodeRefusalVerdict {
  switch (code) {
    case 'unsupported-version':
      return 'unsupported-version';
    case 'no-migration-path':
    case 'migration-produced-invalid-output':
    case 'migration-step-threw':
      return 'no-verdict';
    case 'invalid-shape':
    case 'checksum-mismatch':
      return 'undecodable-content';
    default: {
      const unhandled: never = code;
      throw new Error(`Unhandled save decode error code "${String(unhandled)}"; a refused generation has no retention verdict.`);
    }
  }
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
        // Omitted rather than set to `undefined`: unlike `currentGenerationId`
        // (typed `string | undefined`, always present), `currentRevision` is
        // genuinely optional -- see its doc comment in `store.ts` -- and
        // `exactOptionalPropertyTypes` distinguishes the two.
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
    return this.writeGeneration(prisonId, envelope, applyGenerationRetention);
  }

  /**
   * The write both `save` and `importSave` perform, differing only in **which
   * generation gives way** when the window is full (#438).
   *
   * `save` writes a generation the session it came from was running a moment
   * ago, so it restores by construction and evicting the oldest to make room
   * is a fair trade. `importSave` writes a file the player was handed, which
   * has decoded, migrated and checksummed and still has not been shown to
   * restore -- so it takes the window's spare slot instead, and
   * `confirmGeneration` closes the window back down once it has. See
   * `applyProvisionalRetention`.
   *
   * Everything else is identical, and deliberately in one place: the order
   * inside the transaction is what makes a failed write survivable. The new
   * generation and the advanced pointer are staged before anything is
   * deleted, so a prior good generation can never be lost to a write that
   * does not commit.
   */
  private async writeGeneration(
    prisonId: string,
    envelope: SaveEnvelope,
    retentionFor: (existing: readonly string[], newGenerationId: string, keep: number) => GenerationRetentionResult,
  ): Promise<SaveResult> {
    const decoded = decodeSaveEnvelopeUnlessTrusted(envelope);
    if (!decoded.ok) {
      return { ok: false, error: { code: 'unknown-error', message: `Refusing to persist an invalid envelope: ${decoded.error.message}` } };
    }

    const generationId = this.generateGenerationId();
    // The quarantine mark is what makes a generation exempt from every
    // retention rule in `generation-policy.ts` (#432), and `generateGenerationId`
    // is injectable. A generator that emitted a marked id would mint saves
    // that never expire and are never offered to the player's own count, so
    // it is refused here rather than discovered as a window that grew for ever.
    if (isQuarantinedGenerationId(generationId)) {
      return { ok: false, error: { code: 'unknown-error', message: `Refusing to write generation "${generationId}": that id is reserved for a quarantined generation.` } };
    }

    try {
      await this.store.runTransaction('readwrite', async (tx) => {
        const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
        if (metadata === undefined) {
          throw new Error(`Prison "${prisonId}" does not exist. Call create() first.`);
        }

        await tx.putGeneration(prisonId, generationId, decoded.value);

        const retention = retentionFor(metadata.generationIds, generationId, this.keepGenerations);
        await writeSlot(tx, {
          ...metadata,
          currentGenerationId: generationId,
          // Every route that lands a generation goes through this one write,
          // the interval autosave included (`SessionController`'s
          // `AutosaveScheduler` calls `save()` directly, never `saveNow`) --
          // which is exactly the choke point #1097 needed: a revision number
          // that cannot drift behind the durable generation it describes,
          // because it is written in the same transaction as that generation
          // rather than by a separate, easily-missed call.
          currentRevision: decoded.value.revision,
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
   * updating the pointer so a generation this build has judged is not retried
   * on every boot. Returns `no-valid-generation` only when nothing in the
   * retained window validates -- and, exactly as before, having deleted
   * nothing in that case.
   *
   * **A refusal is not consent to delete, and which refusal it was decides
   * what happens.** The walk carries each refusal's decode code with the
   * generation id that produced it and splits the outcomes four ways; see
   * `DecodeRefusalVerdict` for the whole mapping and for the one arm this
   * change deliberately leaves as it found it. Only `'record-absent'` and
   * `'undecodable-content'` reach `recoverToGeneration`, and only once a
   * *later* generation has decoded.
   *
   * A generation the caller asked to `skip` is not judged by this method at
   * all, so it is neither returned nor retired; see `LoadCurrentOptions.skip`.
   */
  public async loadCurrent(prisonId: string, options: LoadCurrentOptions = {}): Promise<LoadResult> {
    const metadata = readSlot(await this.store.runTransaction('readonly', (tx) => tx.getMetadata(prisonId)), prisonId);
    if (metadata === undefined) return { ok: false, reason: 'not-found' };

    const candidates = [...metadata.generationIds].reverse().filter((id) => options.skip?.has(id) !== true); // newest first
    // Newest-first, like the walk, which is what lets `quarantineGeneration`
    // below apply ADR 0065 decision 3's bound without this method restating
    // it: the newest claimant is offered the slot first and an older one is
    // then declined by that method rather than by a rule written twice.
    const refused: { readonly generationId: string; readonly verdict: DecodeRefusalVerdict }[] = [];
    for (const generationId of candidates) {
      const raw = await this.store.runTransaction('readonly', (tx) => tx.getGeneration(prisonId, generationId));
      const decoded = raw === undefined ? undefined : decodeSaveEnvelope(raw);
      if (decoded === undefined) {
        refused.push({ generationId, verdict: 'record-absent' });
        continue;
      }
      if (!decoded.ok) {
        refused.push({ generationId, verdict: verdictForDecodeRefusal(decoded.error.code) });
        continue;
      }

      // Everything below is housekeeping earned by *this* decode: a generation
      // went through the same schema, migration and checksum on the same build
      // moments ago and came back a save. That is what turns each refusal above
      // from "this build can read nothing" into "this build cannot read that
      // one". Skipped generations are not in `candidates`, so they can never
      // end up here.
      const confirmedInvalid = refused
        .filter((entry) => entry.verdict === 'record-absent' || entry.verdict === 'undecodable-content')
        .map((entry) => entry.generationId);

      // Before the deletions rather than after, so that a storage failure
      // here leaves the disk exactly as it was: quarantine is the arm that
      // *keeps* bytes, and a partial run of this housekeeping must not be one
      // that destroyed the readable generations and failed to keep the
      // unreadable one. The next load reaches the same verdicts and finishes
      // the job -- the same self-healing the walk itself is built on.
      for (const { generationId: unsupportedGenerationId } of refused.filter(
        (entry) => entry.verdict === 'unsupported-version',
      )) {
        await this.quarantineGeneration(prisonId, unsupportedGenerationId);
      }

      // The other reason the generation that decoded is not the current one
      // is a pointer that has fallen outside the retained window, which this
      // read heals. A pointer that is retained and simply older than the
      // generation returned is left alone -- moving it would be a write on a
      // read that retired nothing. A pointer left naming a *newer* generation
      // this walk refused is left alone for the same reason, and costs
      // nothing: the walk is newest-first regardless of what the pointer says,
      // and `quarantineGeneration` moves it itself when it marks the record.
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
   * `SnapshotRestoreRejectedError`, never on a host that failed to answer,
   * never on a `SnapshotRestoreFaultError` — an exception out of our own
   * restore code, which reaches no verdict about the save (#431) — and only
   * once a different generation has restored (#403 (d)).
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
      //
      // Counted over the generations this build has *not* already set aside as
      // unreadable (#432). A quarantined generation is a copy for a later
      // build, not a fallback for this one, so a window of [quarantined, X]
      // holds exactly one save this build could use and X is it.
      if (readableGenerationIds(metadata.generationIds).length <= 1) return { demoted: false, reason: 'last-generation-retained' };

      const generationIds = metadata.generationIds.filter((id) => id !== generationId);
      // `generationIds` is ordered oldest-first, so the newest survivor is
      // last -- preferring the newest *readable* one, because the pointer is
      // read as "the generation to try first" and a quarantined generation is
      // one this build has already refused. It falls back to the newest of any
      // kind rather than to `undefined`, which would orphan the window.
      const readable = readableGenerationIds(generationIds);
      const nextCurrent = metadata.currentGenerationId === generationId
        ? readable[readable.length - 1] ?? generationIds[generationIds.length - 1]
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
   * Keeps a generation this build refused as `unsupported-by-this-build`
   * instead of deleting it (#432, #403 mitigation (c); ADR 0065 carries the
   * argument, `docs/PERSISTENCE.md` the rule).
   *
   * ## What it is for
   *
   * `demoteGeneration` above deletes, and the evidence that licenses deleting
   * is that a *different* generation restored through the same code moments
   * earlier -- so what is wrong is this save. That evidence is exactly as
   * strong for both of ADR 0063's save-side verdicts and it means different
   * things under each. `damaged-payload` says the content contradicts itself
   * and no build restores it. `unsupported-by-this-build` says the opposite:
   * the bytes are coherent and a build that reads them **already exists** --
   * it is the build that wrote them. Deleting those bytes because today's
   * build cannot read them is the one deletion this repository makes against
   * its own stated verdict, and it is what this method replaces.
   *
   * ## What it actually does
   *
   * It renames the stored record and the id in the window to the quarantined
   * form (see `isQuarantinedGenerationId` for why the mark lives in the id and
   * not in a field of its own), inside one transaction, so the key the bytes
   * are under and the id the window holds never disagree. Nothing is copied
   * elsewhere and nothing is re-encoded: the value read out of the store is
   * the value written back.
   *
   * Everything that follows from the mark is in `generation-policy.ts`: a
   * quarantined generation is not counted against `keep`, is never evicted by
   * a save, an import or a confirmation, and is not one of the generations
   * this build reports to the player as available.
   *
   * ## What it deliberately does *not* do
   *
   * It does not take the generation out of `loadCurrent`'s walk, and #432's
   * fourth acceptance criterion asked for exactly that. Two of that issue's
   * criteria pull against each other, and this is the one that gives: a
   * quarantined generation must be *"recoverable by a later build without the
   * player doing anything unusual"*, and leaving it in the walk **is** that
   * recovery -- it is the newest generation, so a build that can read it
   * restores it on the very next load with no new code path, no new control
   * and no new promise to the player. Hiding it from the walk would need a
   * second, explicit recovery route, and a route the player has to be told
   * about is a player-visible promise, which `AGENTS.md` reserves to the
   * owner.
   *
   * What that costs is one refused restore per load, and only while the
   * quarantined generation is still the newest thing in the window: the first
   * save after the fallback restore puts an ordinary generation above it, and
   * from then on the walk never reaches it. That is the same price
   * `docs/PERSISTENCE.md` already records for the deterministic-refusal case,
   * on the same once-per-load path.
   *
   * The walk still terminates for the same reason it did before: `loadPrison`
   * accumulates every generation it has tried into `LoadCurrentOptions.skip`,
   * which only grows.
   */
  public async quarantineGeneration(prisonId: string, generationId: string): Promise<QuarantineResult> {
    return this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) return { quarantined: false, reason: 'not-retained' };
      if (!metadata.generationIds.includes(generationId)) return { quarantined: false, reason: 'not-retained' };
      // Idempotent, and it has to be: the same build refuses the same
      // generation on every load, so the second load asks for this again.
      if (isQuarantinedGenerationId(generationId)) return { quarantined: true, generationId, evicted: [] };
      if (readableGenerationIds(metadata.generationIds).length <= 1) {
        return { quarantined: false, reason: 'last-readable-generation-retained' };
      }

      // The bound: one quarantined generation per prison, and it is the
      // newest candidate. `generationIds` is oldest-first, so an occupant at a
      // higher index is a newer save, and a newer save this build cannot read
      // is worth at least as much as this one -- so this call is declined
      // rather than allowed to evict it.
      const occupants = metadata.generationIds.filter(isQuarantinedGenerationId);
      const position = metadata.generationIds.indexOf(generationId);
      if (occupants.some((id) => metadata.generationIds.indexOf(id) > position)) {
        return { quarantined: false, reason: 'newer-generation-quarantined' };
      }

      const stored = await tx.getGeneration(prisonId, generationId);
      if (stored === undefined) return { quarantined: false, reason: 'nothing-stored' };

      const quarantinedId = quarantinedGenerationId(generationId);
      await tx.putGeneration(prisonId, quarantinedId, stored);
      await tx.deleteGeneration(prisonId, generationId);
      for (const evictedId of occupants) {
        await tx.deleteGeneration(prisonId, evictedId);
      }

      const generationIds = metadata.generationIds
        .filter((id) => !occupants.includes(id))
        .map((id) => (id === generationId ? quarantinedId : id));
      // The pointer follows the bytes: it named this generation because it is
      // the newest save, and quarantine changes its id, not that fact. It is
      // only recomputed when it named an occupant this call just evicted.
      const currentGenerationId =
        metadata.currentGenerationId === generationId
          ? quarantinedId
          : metadata.currentGenerationId !== undefined && occupants.includes(metadata.currentGenerationId)
            ? generationIds[generationIds.length - 1]
            : metadata.currentGenerationId;
      await writeSlot(tx, { ...metadata, currentGenerationId, generationIds, updatedAt: this.now() });
      return { quarantined: true, generationId: quarantinedId, evicted: occupants };
    });
  }

  /**
   * Takes the quarantine mark off a generation a build has just restored
   * (#432).
   *
   * The mark is a recorded verdict -- *this build refused these bytes* -- and
   * a restore falsifies it. Leaving it on would keep a generation the player
   * is actively playing out of their own retained count for ever, and would
   * hold the prison's one quarantine slot against the next save that needs
   * it. So the mark comes off, the generation rejoins the ordinary window, and
   * the slot is handed back.
   *
   * It is the same evidence `demoteGeneration` and `confirmGeneration` both
   * require, spent a third way: only a restore that actually happened moves
   * anything here.
   *
   * `SessionController.loadPrison` calls this **before** the demotion loop, so
   * the generation it just restored is out of the quarantine slot before that
   * loop can evict an occupant of it.
   */
  public async releaseQuarantinedGeneration(prisonId: string, generationId: string): Promise<QuarantineRelease> {
    if (!isQuarantinedGenerationId(generationId)) return { released: false, reason: 'not-quarantined' };
    return this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) return { released: false, reason: 'not-retained' };
      if (!metadata.generationIds.includes(generationId)) return { released: false, reason: 'not-retained' };

      const releasedId = releasedGenerationId(generationId);
      if (metadata.generationIds.includes(releasedId)) {
        // Impossible unless a `generateGenerationId` handed back an id the
        // window already held, which is a contract violation rather than a
        // state to recover from -- and continuing would overwrite the bytes of
        // whichever generation got there first.
        throw new Error(`Cannot release save generation "${generationId}": the prison already retains "${releasedId}".`);
      }

      const stored = await tx.getGeneration(prisonId, generationId);
      if (stored === undefined) return { released: false, reason: 'nothing-stored' };

      await tx.putGeneration(prisonId, releasedId, stored);
      await tx.deleteGeneration(prisonId, generationId);
      await writeSlot(tx, {
        ...metadata,
        currentGenerationId: metadata.currentGenerationId === generationId ? releasedId : metadata.currentGenerationId,
        generationIds: metadata.generationIds.map((id) => (id === generationId ? releasedId : id)),
        updatedAt: this.now(),
      });
      return { released: true, generationId: releasedId };
    });
  }

  /**
   * Closes the window's spare slot once the generation holding it has
   * actually restored (#438).
   *
   * An import is written without evicting anything
   * (`applyProvisionalRetention`), so between the write and the first
   * successful restore the window may hold `keep + 1` generations. This is
   * the other end of that: the caller has seen the imported generation come
   * back as a running simulation, so it has earned the slot, and the oldest
   * generation gives way exactly as it would have on the write.
   *
   * **The same evidence `demoteGeneration` requires, pointed the other way.**
   * Demotion deletes a save because a *different* generation restored;
   * confirmation deletes one because *this* generation restored. Neither acts
   * on a decode, a checksum or an intention -- only on a restore that
   * happened, which is the one thing that distinguishes a save this build
   * cannot read from a build that cannot read saves.
   *
   * Idempotent, and a no-op on every ordinary load: a window already within
   * budget has no spare slot to close, which is the case for every prison the
   * player has not imported into. `SessionController.loadPrison` therefore
   * calls it after every successful restore without checking first, in the
   * same failure-tolerant housekeeping block as the demotions -- a storage
   * error while trimming a window must not fail a load that has already
   * succeeded, and the next load trims it instead.
   */
  public async confirmGeneration(prisonId: string, generationId: string): Promise<GenerationConfirmation> {
    return this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) return { confirmed: false, reason: 'not-retained' };
      if (!metadata.generationIds.includes(generationId)) return { confirmed: false, reason: 'not-retained' };
      // "Newest" over the generations that compete for the spare slot: the
      // readable ones, plus this one whether or not it is readable (#432). A
      // quarantined generation is outside the retention arithmetic, so leaving
      // it in this comparison would let one sitting on top of the window block
      // an import below it from ever being confirmed. Including `generationId`
      // itself is what lets a *later* build confirm the quarantined generation
      // it has just restored.
      const competing = metadata.generationIds.filter((id) => id === generationId || !isQuarantinedGenerationId(id));
      if (competing[competing.length - 1] !== generationId) {
        return { confirmed: false, reason: 'not-the-newest-generation' };
      }

      const retention = applyConfirmedRetention(metadata.generationIds, this.keepGenerations);
      // Nothing to close, which is the common case. Returning before the
      // first write keeps a successful load from bumping `updatedAt` on every
      // prison the player opens.
      if (retention.toDelete.length === 0) return { confirmed: true, retired: [] };

      await writeSlot(tx, {
        ...metadata,
        generationIds: retention.generationIds,
        updatedAt: this.now(),
      });
      for (const retiredGenerationId of retention.toDelete) {
        await tx.deleteGeneration(prisonId, retiredGenerationId);
      }
      return { confirmed: true, retired: retention.toDelete };
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
   *
   * **It costs the player no generation of their own until it has restored**
   * (#438). Decoding, migrating and checksumming a file establishes that it
   * is a well-formed save; none of them establishes that this build can
   * restore it, and this repository ships a fixture that passes all three and
   * throws. So the write takes the retained window's spare slot rather than
   * evicting the oldest generation -- see `applyProvisionalRetention` for the
   * measurement, and `confirmGeneration` for where the eviction happens
   * instead.
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
    const result = await this.writeGeneration(prisonId, decoded.value, applyProvisionalRetention);
    return result.ok ? { ...result, migrated: decoded.migrated } : result;
  }

  /**
   * Records that the prison has unpushed local work, at the revision it first
   * went dirty -- a lower bound, not the latest revision `saveNow` happens to
   * have just written (#1097). So this is a no-op once a marker already
   * exists: only `clearPendingSync` may move it, by removing it so the next
   * call can set a fresh one. Every caller (`SessionController.saveNow`)
   * still calls this after every successful save, exactly as before; it is
   * this method, not the call site, that now makes repeated calls between one
   * clear and the next collapse into the first.
   */
  public async markPendingSync(prisonId: string, pendingSync: PendingSyncState): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) throw new Error(`Prison "${prisonId}" does not exist.`);
      if (metadata.pendingSync !== undefined) return;
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
