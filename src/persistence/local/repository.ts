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
import { decodeTombstoneRecord, encodeTombstoneRecord, tombstoneKeyOf } from './tombstone-schema';
import type {
  LocalSaveStore,
  LocalSaveTransaction,
  PendingSyncState,
  PrisonSlotMetadata,
  TombstoneGeneration,
} from './store';

/**
 * What a compare-and-swap refusal found, so the caller can act on the fact
 * rather than on prose (ADR 0109 Decision 4).
 *
 * Mirrors the cloud client's `conflict` arm, which hands back `cloudCurrent`
 * for exactly the same reason (`src/persistence/cloud/memory-client.ts:90-92`):
 * "refuse and drop" is the failure ADR 0105 exists to prevent wearing a new
 * costume, and a caller cannot retry or report a refusal it cannot read.
 */
export interface StaleRevisionRefusal {
  /** `metadata.currentRevision` as the refusing transaction found it. */
  readonly durableRevision: number;
  /** What the caller said it had last seen, and which no longer matches. */
  readonly expectedRevision: number;
}

/**
 * `revision` on the success arm is ADR 0109 Decision 1, and it is the half
 * that stops a stale writer laundering its own divergence.
 *
 * The revision is now allocated **inside the transaction that compares it**,
 * so the caller cannot know what was written until the write returns. Before
 * this, `SessionController` allocated it from a counter it incremented on
 * every successful save, and issue #582's FINAL-004 measured what that cost:
 * a stale write's completion callback advanced a *different, newer* session's
 * counter, because the callback was guarded by `prisonId` and a same-slot
 * reload does not change one. The next ordinary save then built a perfectly
 * consecutive successor to a durable state that session had never seen.
 *
 * Reporting the number back makes `session.revision` a cache of what the last
 * write returned instead of an allocator, which is what closes that.
 */
export type SaveResult =
  | { readonly ok: true; readonly generationId: string; readonly revision: number }
  | { readonly ok: false; readonly error: SaveWriteError; readonly stale?: StaleRevisionRefusal };

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
  | { readonly ok: true; readonly generationId: string; readonly revision: number; readonly migrated: boolean }
  | { readonly ok: false; readonly error: SaveWriteError; readonly rejected?: SaveDecodeError; readonly stale?: StaleRevisionRefusal };

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

/**
 * How long a deleted prison can be brought back (ADR 0114).
 *
 * **One day, and the number is load-bearing on a sentence.**
 * `save.delete.confirm` tells the player, before they confirm, that they can
 * bring the prison back "for one day" -- so this constant and that string are
 * one claim written twice, and
 * `tests/unit/persistence-local-repository.test.ts` pins them to each other.
 * Changing it without changing the sentence ships a promise the code does not
 * keep, which is `AGENTS.md`'s fourth reservation.
 *
 * A default on `PrisonSaveRepositoryOptions` rather than a literal inside
 * `delete()`, for `keepGenerations`' reason: a policy number belongs where a
 * caller can see it and a test can move it.
 */
export const DEFAULT_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * One prison the player deleted and can still bring back.
 *
 * A summary rather than the `TombstoneRecord` itself, deliberately: the record
 * holds every save payload the prison had, and handing those to a panel that
 * wants a name and a deadline would put megabytes through the interface layer
 * on every repaint. `restoreFromTombstone` reads the payloads where they live.
 */
export interface DeletedPrison {
  readonly prisonId: string;
  readonly displayName?: string;
  readonly deletedAt: number;
  /** When the undo closes. Informational for a display; never the gate -- see `restoreFromTombstone`. */
  readonly expiresAt: number;
}

/**
 * What an undo press actually did.
 *
 * Three refusals rather than one `false`, on issue #19's argument that distinct
 * recoverable states must not collapse into one sentence: they call for
 * different things to be said. `'window-closed'` is the only one that also
 * destroys something, and it destroys the copy it just refused -- so the
 * sentence "this prison can no longer be brought back" is true the instant it
 * is said rather than true of a record still sitting on disk.
 */
export type RestoreRefusalReason = 'not-found' | 'window-closed' | 'slot-taken';

/**
 * The four things a press of "Bring it back" can have done, flattened.
 *
 * Named here rather than in the interface layer so that one definition
 * serves the repository, `SessionController` and the panel's sentence mapping:
 * a fifth outcome then fails `tsc` at the switch that chooses the sentence,
 * rather than falling through to whichever sentence happens to be last.
 */
export type RestoreOutcome = 'restored' | RestoreRefusalReason;

export type RestoreFromTombstoneResult =
  | { readonly ok: true; readonly metadata: PrisonSlotMetadata }
  | { readonly ok: false; readonly reason: RestoreRefusalReason };

/** What the saves panel shows: the prisons a player has, and the ones they can still get back. */
export interface SaveInventory {
  readonly prisons: readonly PrisonSlotMetadata[];
  readonly deleted: readonly DeletedPrison[];
}

export interface PrisonSaveRepositoryOptions {
  /** Current generation plus this many previous safe copies. Default 3 (current + 2 previous, matching the issue's minimum). */
  readonly keepGenerations?: number;
  readonly now?: () => number;
  readonly generateGenerationId?: () => string;
  /** How long a deleted prison stays restorable. Default `DEFAULT_UNDO_WINDOW_MS`. */
  readonly undoWindowMs?: number;
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
 * Reads every tombstone, deleting the ones that can no longer serve an undo.
 *
 * A free function rather than a method because two callers need it *inside a
 * transaction they already hold* -- `listTombstones` and `listSaves` -- and the
 * whole point of the second is that it costs one transaction rather than two.
 *
 * Two kinds are swept. A copy past its `expiresAt` is gone by definition. A
 * record this build cannot validate is swept for the three reasons
 * `tombstone-schema.ts` gives: it indexes nothing the player still has, it
 * expires by construction, and a copy that cannot be read is a copy that can
 * never be restored -- so holding it only costs the player bytes. A record
 * whose own key is unreadable is left alone rather than guessed at, because a
 * guessed key deletes some other prison's copy.
 */
async function sweepTombstones(tx: LocalSaveTransaction, now: number): Promise<readonly DeletedPrison[]> {
  const restorable: DeletedPrison[] = [];
  for (const record of await tx.listTombstones()) {
    const tombstone = decodeTombstoneRecord(record);
    if (tombstone === undefined) {
      const key = tombstoneKeyOf(record);
      if (key !== undefined) await tx.deleteTombstone(key);
      continue;
    }
    if (now >= tombstone.expiresAt) {
      await tx.deleteTombstone(tombstone.prisonId);
      continue;
    }
    restorable.push({
      prisonId: tombstone.prisonId,
      ...(tombstone.metadata.displayName === undefined ? {} : { displayName: tombstone.metadata.displayName }),
      deletedAt: tombstone.deletedAt,
      expiresAt: tombstone.expiresAt,
    });
  }
  return restorable;
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
  private readonly undoWindowMs: number;

  public constructor(
    private readonly store: LocalSaveStore,
    options: PrisonSaveRepositoryOptions = {},
  ) {
    this.keepGenerations = options.keepGenerations ?? 3;
    this.now = options.now ?? Date.now;
    this.generateGenerationId = options.generateGenerationId ?? defaultGenerationId;
    this.undoWindowMs = options.undoWindowMs ?? DEFAULT_UNDO_WINDOW_MS;
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

  /**
   * Deletes a prison, and keeps one restorable copy of it until the undo window
   * closes (ADR 0114).
   *
   * ## What changed, and what deliberately did not
   *
   * **This used to be a destruction and is now a move.** The body read, in
   * full:
   *
   * ```ts
   * const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
   * if (metadata === undefined) return;
   * for (const generationId of metadata.generationIds) {
   *   await tx.deleteGeneration(prisonId, generationId);
   * }
   * await tx.deleteMetadata(prisonId);
   * ```
   *
   * Everything it did, it still does: the slot and every generation it
   * references leave the `prisons` and `generations` stores, `list()` stops
   * returning the prison, and a deletion of a prison that is not there is still
   * a no-op that writes nothing. The signature, the return type and the
   * observable contract of `list()` are untouched, which is why
   * `tests/unit/persistence-local-repository.test.ts`'s two existing deletion
   * tests pass unmodified.
   *
   * ## Why it is the same transaction and not a second one
   *
   * This is the property the whole design rests on, and ADR 0114 rejected a
   * separate database on exactly it: a real IndexedDB transaction cannot span
   * two databases, so a copy held anywhere else would need a second transaction
   * with no way to commit both as one unit. A crash between them either leaves
   * the prison *and* a spurious copy, or -- the defect this feature exists to
   * prevent -- deletes the prison with the copy still unwritten. One
   * transaction has neither failure mode: the tombstone and the deletions
   * commit together or nothing happens at all.
   *
   * The **order inside it** is `writeGeneration`'s order for `writeGeneration`'s
   * reason: what is being kept is staged before anything is thrown away.
   *
   * ## What the copy holds
   *
   * The slot record verbatim and every generation `generationIds` actually
   * names, not merely `currentGenerationId`. The retention window may hold more
   * than `keepGenerations` -- one extra for an unproven import (#438) and one
   * again for a generation quarantined as unreadable by this build (#432) -- so
   * the copy reads the ids the slot really carries rather than a number assumed
   * in advance, and a restore gives the player back the same ladder they could
   * have recovered down before they deleted it.
   *
   * A generation id that `generationIds` names and storage does not hold is
   * skipped rather than stored as `undefined`. That is not a defect being
   * papered over: `loadCurrent`'s recovery walk already treats a missing
   * generation as one to step past, so a prison with a gap restores to exactly
   * the prison it was.
   */
  public async delete(prisonId: string): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
      if (metadata === undefined) return;

      const generations: TombstoneGeneration[] = [];
      for (const generationId of metadata.generationIds) {
        const value = await tx.getGeneration(prisonId, generationId);
        if (value !== undefined) generations.push({ generationId, value });
      }

      const deletedAt = this.now();
      // Staged before a single delete below, so a transaction that does not
      // commit leaves the prison exactly where it was.
      await tx.putTombstone(
        encodeTombstoneRecord({
          prisonId,
          metadata: encodePrisonSlotMetadata(metadata),
          generations,
          deletedAt,
          expiresAt: deletedAt + this.undoWindowMs,
        }),
      );

      for (const generationId of metadata.generationIds) {
        await tx.deleteGeneration(prisonId, generationId);
      }
      await tx.deleteMetadata(prisonId);
    });
  }

  /**
   * Every prison that can still be brought back, sweeping as it reads (ADR
   * 0114).
   *
   * ## Why the expiry is enforced here rather than by a timer
   *
   * **There is no scheduler in this application, and this is designed around
   * that rather than adding one.** No `setInterval` exists in `main.ts`,
   * `save-panel.ts`, `session-controller.ts` or this file that could drive an
   * expiry; the save panel's `refresh()` runs at mount and after every action,
   * and nothing runs on a clock. So the fact "is this copy still good" is
   * recomputed from a stored timestamp wherever it is read, exactly as
   * `docs/PERSISTENCE.md`'s `SafetyCoverageSystem` census is recomputed rather
   * than carried.
   *
   * A `setTimeout`-based window would be strictly worse, not merely different:
   * it dies with the tab, so a player who closes the game mid-window loses both
   * the undo *and* the sweep, leaving bytes nothing would ever free. The cost
   * of doing it this way, named rather than hidden, is that **a copy can
   * physically outlive its window by as long as the player goes between
   * sessions** -- it is swept at the first read past `expiresAt`, and if that
   * read is a month late, so is the sweep. It is never *offered* late, which is
   * the half that reaches the player.
   *
   * ## Why it is a `readwrite` transaction for what reads like a query
   *
   * Because sweeping is the enforcement. Returning expired copies and letting a
   * caller filter them would make every caller responsible for the window, and
   * the one that forgot would show a player an undo that `restoreFromTombstone`
   * then refuses.
   *
   * A record that fails validation is swept in the same pass and for a reason
   * `tombstone-schema.ts` gives at length: unlike a slot record, a tombstone
   * indexes nothing the player still has, expires by construction, and cannot
   * serve the one purpose it exists for if this build cannot read it.
   */
  public async listTombstones(): Promise<readonly DeletedPrison[]> {
    return this.store.runTransaction('readwrite', (tx) => sweepTombstones(tx, this.now()));
  }

  /**
   * Both halves of what the saves panel shows, from **one** transaction.
   *
   * ## Why this exists rather than the panel calling two methods
   *
   * It did call two, and that was measured as a cost rather than argued as
   * one. `SavePanel.refresh()` runs after every action in the panel, and the
   * browser reachability sweep (`app-shell.spec.ts`, #88) presses every control
   * on every tab at every viewport -- which is the one test in this repository
   * that multiplies a per-refresh cost by enough to see it. On `origin/main`
   * that test finished in **2.9 minutes against a 3.0-minute cap**; with a
   * second transaction added to every refresh it stopped finishing at all. One
   * transaction puts the cost back where it was.
   *
   * ## And it is the more correct shape anyway
   *
   * Two reads are two snapshots. Between them a prison can be deleted, and the
   * panel would then draw a list holding it in **neither** half -- present in
   * neither `prisons` (the delete committed after the first read) nor
   * `deleted` (the tombstone was written before the second). One transaction
   * cannot see that state, so the list the player reads is always a list that
   * actually existed.
   *
   * `readwrite`, because the sweep is what enforces the undo window and a
   * read-only list would leave every caller responsible for an expiry it
   * cannot enforce.
   */
  public async listSaves(): Promise<SaveInventory> {
    return this.store.runTransaction('readwrite', async (tx) => {
      const stored = await tx.listMetadata();
      // `list()`'s rule, unchanged and deliberately not softened here: one
      // unreadable record refuses the whole list rather than being skipped.
      const prisons = stored.map((record) => requirePrisonSlotMetadata(record));
      const deleted = await sweepTombstones(tx, this.now());
      return { prisons, deleted };
    });
  }

  /**
   * Brings a deleted prison back, whole (ADR 0114).
   *
   * ## The gate is this call's own clock reading, never a display
   *
   * `now() >= expiresAt` is evaluated here, inside the transaction that would
   * do the writing, against the `expiresAt` that is actually stored. Whatever a
   * panel last painted is a display convenience and is not consulted, which is
   * `pressDeleteConfirmation`'s discipline one layer up
   * (`src/ui/save-panel-delete.ts`) applied to a deadline instead of a subject:
   * a countdown a few seconds stale can therefore never let a late press
   * through, and never refuse an early one.
   *
   * A refusal for a closed window **deletes the copy as it refuses**. Without
   * that, "this prison can no longer be brought back" would be a sentence made
   * false by the record still sitting there.
   *
   * ## Why the restore bypasses `create()` and `importSave()`
   *
   * Because neither can give the prison back unchanged, which is the whole
   * claim the player is told. `create()` stamps `createdAt` from the clock, and
   * `importSave` writes one generation into a slot through `writeGeneration`,
   * which allocates a fresh revision and applies retention -- so rebuilding a
   * prison through them would hand back a prison with a new creation date and a
   * generation ladder rebuilt one eviction at a time. This writes the stored
   * slot record and every stored generation back exactly as they were:
   * same `createdAt`, same `updatedAt`, same `currentRevision`, same ladder.
   *
   * Nothing is re-encoded on the way back either. A generation re-enters the
   * system where every freshly-read generation does -- through
   * `decodeSaveEnvelope`, on `loadCurrent`'s recovery walk -- so a generation
   * that was unreadable before the deletion is exactly as unreadable after the
   * restore, and this method invents no integrity guarantee and removes none.
   *
   * `'slot-taken'` is the case where the player created a new prison under the
   * same id while the window was open. Refusing is the only honest answer:
   * writing the copy over it would destroy a live prison to undo a dead one,
   * and merging them is not a thing a restore can mean.
   */
  public async restoreFromTombstone(prisonId: string): Promise<RestoreFromTombstoneResult> {
    return this.store.runTransaction('readwrite', async (tx) => {
      const raw = await tx.getTombstone(prisonId);
      const tombstone = decodeTombstoneRecord(raw);
      if (tombstone === undefined) {
        // Absent, or present and unreadable. The second is swept here for the
        // same reason `listTombstones` sweeps it, and `raw === undefined`
        // makes the delete a no-op rather than a special case.
        if (raw !== undefined) await tx.deleteTombstone(prisonId);
        return { ok: false, reason: 'not-found' };
      }

      if (this.now() >= tombstone.expiresAt) {
        await tx.deleteTombstone(prisonId);
        return { ok: false, reason: 'window-closed' };
      }

      // Throws `CorruptSlotMetadataError` on an unreadable live slot, which is
      // the right answer: this cannot know whether that record is a prison the
      // player still wants, so it writes nothing over it.
      if (readSlot(await tx.getMetadata(prisonId), prisonId) !== undefined) {
        return { ok: false, reason: 'slot-taken' };
      }

      for (const generation of tombstone.generations) {
        await tx.putGeneration(prisonId, generation.generationId, generation.value);
      }
      // Last of the writes, for `writeGeneration`'s reason: the record that
      // makes the prison visible is staged after the payloads it points at.
      await writeSlot(tx, tombstone.metadata);
      await tx.deleteTombstone(prisonId);
      return { ok: true, metadata: tombstone.metadata };
    });
  }

  /**
   * Throws away a deleted prison's copy now, without waiting for the window
   * (ADR 0114, the owner's ruling of 2026-09-14).
   *
   * **This exists because an undo window holds bytes, and the product already
   * tells a player that deleting a prison is how you get bytes back.**
   * `save.status.quota-exceeded` says, verbatim on this tree, *"Storage is
   * full. Delete an old prison or export and remove saves to free space. Your
   * previous save is intact."* A player who follows that advice under the
   * design in ADR 0114 §§1-3 would not actually free the space until the window
   * closed -- the player who most needs the bytes served worst by the feature.
   * §6 named the trade-off and refused to settle it; the owner settled it by
   * adding this rather than by shortening the window or skipping the copy near
   * quota, so the undo promise stays whole and the player is given a deliberate
   * way out of it.
   *
   * Deleting a tombstone that is not there is a no-op, exactly as deleting a
   * prison that is not there is.
   */
  public async forgetTombstone(prisonId: string): Promise<void> {
    await this.store.runTransaction('readwrite', async (tx) => {
      await tx.deleteTombstone(prisonId);
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
   *
   * **`expectedRevision` is the caller's claim about what it last saw**, and
   * the write is refused with `'stale-revision'` when the slot disagrees (ADR
   * 0109 Decision 1). The envelope's own `revision` is ignored on the way in
   * and re-stamped on the way down; see `writeGeneration` for why that is
   * cheap and for what happens on a slot that has no `currentRevision` yet.
   *
   * It is optional because two callers legitimately have no claim to make: a
   * brand-new prison's first generation, whose slot has no durable revision at
   * all, and the browser harness's direct writes. Passing nothing is "write
   * whatever is next", which is what this method did unconditionally before
   * and is therefore the behaviour-preserving default -- **and it is not a
   * safe default for a session**, which is why `SessionController` always
   * passes one.
   */
  public async save(prisonId: string, envelope: SaveEnvelope, expectedRevision?: number): Promise<SaveResult> {
    return this.writeGeneration(prisonId, envelope, applyGenerationRetention, expectedRevision);
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
    expectedRevision: number | undefined,
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

    let refusal: StaleRevisionRefusal | undefined;
    let allocatedRevision = decoded.value.revision;
    try {
      await this.store.runTransaction('readwrite', async (tx) => {
        const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
        if (metadata === undefined) {
          throw new Error(`Prison "${prisonId}" does not exist. Call create() first.`);
        }

        const durableRevision = metadata.currentRevision;

        /*
         * THE COMPARISON (ADR 0109 Decision 1, ADR 0105 option 2).
         *
         * The slot is already read inside this transaction, so the comparison
         * costs no extra round trip -- that is the whole of why option 2 was
         * cheap. IndexedDB serialises the transaction, so the read and the
         * write below cannot be interleaved by another writer: atomicity was
         * never the missing property, the comparison was.
         *
         * `durableRevision === undefined` FAILS OPEN, exactly once per slot,
         * and that is deliberate rather than an oversight. `currentRevision`
         * is optional and "nothing repairs it retroactively; the slot's next
         * durable save populates it" (`slot-metadata-schema.ts`), so a slot
         * written before #1097 -- or the sliver between `create()` and its
         * first generation -- has nothing to compare against. Refusing there
         * would make every pre-#1097 prison unsaveable, which is a worse
         * failure than the one this guards. ADR 0109's open question 2 records
         * that this is a hole one tab can drive through on such a slot, and
         * that whether to backfill on read instead is not settled.
         *
         * `expectedRevision === undefined` is the caller declining to make a
         * claim -- see `importSave`, which is handed a file rather than a
         * session's own state and so has no "what did I last see" to offer.
         */
        if (expectedRevision !== undefined && durableRevision !== undefined && expectedRevision !== durableRevision) {
          refusal = { durableRevision, expectedRevision };
          return;
        }

        /*
         * THE ALLOCATION (ADR 0109 Decision 1).
         *
         * Stamped here rather than taken from the envelope, because the
         * caller's number was read before this transaction opened and is
         * therefore a guess about a slot it does not hold. `session.revision +
         * 1` computed in `SessionController.buildEnvelope` is what issue
         * #582's FINAL-005 measured going wrong: two overlapping saves both
         * built revision 2 from the same counter value, both reported success,
         * and the third landed on 4 because the counter had been advanced
         * twice while one revision-2 write survived. On-disk: 1, 2, 4.
         *
         * **This is affordable because `revision` sits outside the checksum.**
         * `createSaveEnvelope` hashes the payload only --
         * `checksum: computeSaveChecksum(payload as JsonValue)` at
         * `save-schema.ts:1792` -- and puts `revision` in the metadata beside
         * it. So re-stamping it invalidates no checksum, moves no schema
         * version, and leaves `decodeSaveEnvelope` unaffected. ADR 0105 left
         * the choice between "a lock, a queue, or allocating the revision at
         * write time" open because it did not have that fact; ADR 0109
         * Context 4 establishes it and this is what it buys.
         *
         * The spread rather than a mutation is not a style choice: a trusted
         * envelope is `Object.freeze`d by `markTrusted`, so assigning to it
         * would throw in strict mode and silently do nothing outside it.
         */
        /*
         * **A slot that cannot speak for itself keeps the caller's number**,
         * and this is not a shortcut -- allocating 1 there is a defect, found
         * by `tests/unit/persistence-local-repository.test.ts`'s #1097 backfill
         * case going red on `expected 1 to be 4`.
         *
         * `currentRevision` is absent on a slot written before #1097, and such
         * a slot can hold generations at revision 40. Allocating `0 + 1` would
         * make the *newest* generation revision 1 while an older retained one
         * is 40 -- an ordering inversion on disk -- and would drop the slot's
         * `currentRevision` from 40 to 1 under
         * `src/ui/account/save-list-projection.ts:156`, which classifies cloud
         * drift by exactly that number. So the first write to such a slot
         * carries the sequence forward instead, and every write after it is
         * allocated here, because by then the slot has a revision to speak
         * with. That is the same "fail open exactly once" this method's
         * comparison does, applied to the allocation.
         */
        allocatedRevision = durableRevision === undefined ? decoded.value.revision : durableRevision + 1;
        const record: SaveEnvelope = { ...decoded.value, revision: allocatedRevision };

        await tx.putGeneration(prisonId, generationId, record);

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
          //
          // It is now also written in the same transaction that *allocated*
          // it, so the pointer and the generation cannot disagree even in
          // principle: they are the same number, not two computations of it.
          currentRevision: allocatedRevision,
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

    if (refusal !== undefined) {
      const found: StaleRevisionRefusal = refusal;
      return {
        ok: false,
        error: {
          code: 'stale-revision',
          message: `Refusing to persist a stale generation of "${prisonId}": the caller last saw revision ${found.expectedRevision}, and the slot is at revision ${found.durableRevision}.`,
        },
        stale: found,
      };
    }

    return { ok: true, generationId, revision: allocatedRevision };
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
    /*
     * **No expected revision, which is ADR 0109's open question 1 answered
     * the way it guessed an implementer might.**
     *
     * That question is *"Does `importSave` take the same CAS? It writes a
     * generation the player was handed rather than one a session produced, so
     * 'what did the writer last see' has no obvious answer for it."* It has
     * none here either: the file's own `revision` describes the slot it was
     * exported from, which may be a different prison on a different machine,
     * and the player pressing Import is asking for this file to become the
     * newest generation rather than asserting anything about the slot. So
     * import is an explicit overwrite arm and passes no claim.
     *
     * It still takes the *allocation* half, and that is the part that matters:
     * `writeGeneration` stamps `currentRevision + 1` regardless, so an
     * imported file cannot land carrying a revision from another slot's
     * sequence and cannot leave a hole behind it. Before this, a file exported
     * at revision 40 imported into a slot at revision 3 wrote `currentRevision:
     * 40` and the next ordinary save built 4 -- a pointer that went backwards.
     */
    const result = await this.writeGeneration(prisonId, decoded.value, applyProvisionalRetention, undefined);
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
