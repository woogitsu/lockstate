import { restoredScopeFor, type RestoredScope, type SessionSnapshotBundle } from '../../simulation/runtime/restore-session';
import type { SnapshotRefusalReason } from '../../simulation/runtime/restore-refusal';
import { AutosaveScheduler } from '../local/autosave';
import { classifyStoreError } from '../local/errors';
import type {
  DeletedPrison,
  PrisonSaveRepository,
  RestoreOutcome,
  SaveImportResult,
  SaveInventory,
  SaveResult,
} from '../local/repository';
import type { PrisonSlotMetadata } from '../local/store';
import { createSaveEnvelope, type SaveEnvelope, type TrustedSaveEnvelope } from '../save-schema';
import { SnapshotRestoreFaultError, SnapshotRestoreRejectedError, type SessionRuntimeHost } from './runtime-host';

/** Directional default: the informal probe in `docs/PERSISTENCE.md` puts a representative save well under a second, so a 30s trailing-edge cadence costs little while bounding worst-case loss. Not a tuned figure -- see `docs/BENCHMARKING.md`. */
export const DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * The live session, and **the session epoch itself** (ADR 0109 Decisions 2
 * and 3).
 *
 * ### Why this object is the epoch
 *
 * ADR 0109 Decision 2 asks for "a counter minted per `adoptSession`" whose
 * job is to answer *"is the writer that submitted this write still the session
 * this process authorised?"*, and Decision 3 then says to express it as
 * **object identity rather than an id**, *"because that pattern is already in
 * this file"* -- `deletePrison` captures this object before its `await` and
 * compares it by identity after, under a docblock headed "Why the guard after
 * the `await` is an identity check". `adoptSession` already mints exactly one
 * fresh object per session, so a separate counter beside it would be a second
 * token saying the same thing, with the extra failure mode that the two could
 * disagree.
 *
 * ### Why it is not durable, and what was run to check
 *
 * It never reaches disk, which is what keeps this work outside `AGENTS.md`
 * reservation 2. Both parties to the question are live objects in one process
 * at the moment it is asked: the stale capture is an in-flight promise inside
 * this controller, and the session that replaced it is the one in
 * `this.session`. ADR 0109 names its own falsifier for that -- a capture that
 * survives its own *page*, flushed by `pagehide` during teardown, which would
 * leave nothing live to compare against and force a durable lease.
 *
 * It was run before this was built, against the real `WorkerPerSessionHost`
 * rather than the in-process host the ADR's own measurements used
 * (`tests/browser/lifecycle-save-epoch.spec.ts`). Both real lifecycle events
 * reached the handler and **no write was issued at all**: `saveNow` cannot
 * reach `repository.save` without awaiting `host.capture()`, a round trip to
 * the simulation worker, and the page dies long before the worker answers. A
 * capture cannot outlive its own page, because the capture is the part that
 * dies first.
 */
export interface ActiveSession {
  readonly prisonId: string;
  /**
   * The revision the last successful write actually allocated -- **a cache,
   * not an allocator** (ADR 0109 Decision 1).
   *
   * This used to be incremented on every successful save and read as
   * `revision + 1` to build the next envelope, and issue #582 measured both
   * halves of that going wrong. FINAL-005: two overlapping saves read the same
   * value and both built revision 2, the counter was advanced twice while one
   * of them survived, and the third save landed on 4 -- on disk, 1, 2, 4.
   * FINAL-004: a *stale* writer's completion callback advanced a **newer**
   * session's counter, because the callback was guarded by `prisonId` and a
   * same-slot reload does not change one, so the next ordinary save built a
   * perfectly consecutive successor to a durable state it had never seen.
   *
   * The number is now allocated inside the transaction that compares it and
   * reported back on `SaveResult`, so this field is assigned from that result
   * and never incremented. A writer that loses the comparison can no longer
   * move it at all.
   */
  revision: number;
  readonly createdAt: number;
}

export type SessionLoadOutcome =
  | { readonly ok: true; readonly recovered: boolean; readonly scope: RestoredScope }
  | { readonly ok: false; readonly reason: 'not-found' | 'no-valid-generation' };

/**
 * What the save taken on a session's way out did (#943).
 *
 * Reported rather than swallowed, for the same reason
 * `getLastRetirementFailure` is: this save is the only thing standing between
 * a player and the loss of everything they have not saved by hand, and a
 * failure nothing can observe is indistinguishable from a capture that stopped
 * running. See `SessionController.captureOutgoingSession` for why a failure
 * does not refuse the new session.
 */
export interface OutgoingSessionCapture {
  /** The prison whose live session was about to be replaced. */
  readonly prisonId: string;
  /** Durable success/failure evidence for the save taken on its behalf. */
  readonly result: SaveResult;
}

/**
 * One `deletePrison` call's hold on the autosave schedule, for as long as its
 * store transaction is in flight.
 *
 * A deletion that has not committed must not have a new generation written
 * into the prison it is deleting, and the schedule is the only thing that
 * would: it is a trailing-edge timer that can come due inside the `await`.
 * Declining the write is what costs the marker, so the marker is put back if
 * the deletion turns out not to have happened -- see `deletePrison`, which is
 * the only thing that creates one of these.
 *
 * The prison it belongs to is the key it is held under, so it is not repeated
 * here: a copy of it in the value could disagree with the key, and nothing
 * would read the copy.
 */
interface SuspendedAutosave {
  /** Set by the scheduler's `buildEnvelope` callback when it actually declined a save that had come due. */
  declined: boolean;
}

/**
 * The value the autosave path hands back when it declined to write because
 * the writer was no longer the authorised session (ADR 0109 Decision 4).
 *
 * `AutosaveScheduler.save` must return a `SaveResult` -- it has no third
 * outcome -- but a drop is emphatically not a failure to report: the session
 * it belonged to no longer exists, so there is nobody to tell and a status
 * line about it would be a message to whoever is playing *now* about a save
 * they never asked for. Compared by **identity** in `onResult` rather than by
 * its code, so an ordinary `'stale-revision'` refusal that genuinely needs
 * reporting can never be mistaken for one of these.
 */
const DROPPED_STALE_WRITE: SaveResult = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: 'stale-revision',
    message: 'Declined: the session that captured this save is no longer the active one.',
  }),
} as const);

export interface SessionControllerOptions {
  readonly gameVersion: string;
  readonly autosaveIntervalMs?: number;
  readonly now?: () => number;
  /**
   * Pins every `createPrison` in this controller's lifetime to one literal
   * seed. Exists for tests and for anything that genuinely wants a fixed
   * world (`tests/integration/session-save-master-seed.test.ts` is the only
   * production-shaped caller today) -- **not** what a player's "New prison"
   * should pass, because a controller outlives more than one such click
   * (issue #479): the save panel can create several prisons in one page
   * session (`src/ui/save-panel.ts`'s `requestCreate`), and a controller-wide
   * constant would hand every one of them the same streams. Use
   * `generateMasterSeed` for that; the two are mutually exclusive in intent
   * even though both can technically be supplied.
   */
  readonly masterSeed?: number;
  /**
   * Drawn once per `createPrison` call when `masterSeed` above is not given
   * -- the seed varies *between prisons*, not only between page loads
   * (issue #479). Defaults to a constant `0`, matching every build before
   * this option existed (`docs/adr/0038-what-makes-a-save-compatible.md`
   * §4), so a test or a caller that specifies neither option keeps exactly
   * today's pinned behaviour. Production wiring lives in `src/main.ts`,
   * which is outside the simulation's import graph
   * (`tests/determinism/ambient-nondeterminism-contract.test.ts` walks
   * outward *from* `src/simulation/`, and nothing there imports this file)
   * and is free to use real entropy: the value crosses into
   * `createNewSimulationRuntime` as a plain `number`, the same way any
   * `masterSeed` does, so nothing about *how* it was chosen reaches a
   * system, a command payload or a snapshot.
   */
  readonly generateMasterSeed?: () => number;
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
  private readonly masterSeed: number | undefined;
  private readonly generateMasterSeed: () => number;
  private readonly autosave: AutosaveScheduler;
  private session: ActiveSession | undefined;
  private lastSaveResult: SaveResult | undefined;
  private retirementFailure: unknown;
  private outgoingCapture: OutgoingSessionCapture | undefined;
  /**
   * The deletions whose store transaction is in flight, by prison.
   *
   * A map rather than a single field so that deleting prison A never lifts
   * prison B's hold: the two are independent, and the UI's one-action-at-a-time
   * gate (`SavePanel`'s `AsyncActionGate`) is a property of one panel rather
   * than of this class.
   */
  private readonly deletionsInFlight = new Map<string, SuspendedAutosave>();

  /**
   * The `ActiveSession` each in-flight autosave capture was taken against, by
   * prison (ADR 0109 Decision 3).
   *
   * A map for the same reason `deletionsInFlight` is one, and safe as a
   * single entry per prison because `AutosaveScheduler` guarantees at most one
   * in-flight write per prison -- a dirty marker arriving during a capture
   * coalesces into one follow-up rather than starting a second, overlapping
   * save. It exists at all because the scheduler splits capture and write into
   * two callbacks, so the identity the write has to check cannot simply be a
   * local variable spanning both.
   */
  private readonly capturesInFlight = new Map<string, ActiveSession>();

  public constructor(
    private readonly repository: PrisonSaveRepository,
    private readonly host: SessionRuntimeHost,
    options: SessionControllerOptions,
  ) {
    this.gameVersion = options.gameVersion;
    this.now = options.now ?? Date.now;
    this.masterSeed = options.masterSeed;
    this.generateMasterSeed = options.generateMasterSeed ?? (() => 0);

    this.autosave = new AutosaveScheduler({
      intervalMs: options.autosaveIntervalMs ?? DEFAULT_AUTOSAVE_INTERVAL_MS,
      buildEnvelope: async (prisonId) => {
        // A deletion of this prison is mid-transaction, so decline: writing a
        // generation into a slot that is being removed either wastes the work
        // or, if it lands after the delete commits, fails with "does not
        // exist" and reports that to the player as a failed save of a prison
        // they have just deleted. `deletePrison` puts the marker back if the
        // deletion does not commit.
        const suspended = this.deletionsInFlight.get(prisonId);
        if (suspended !== undefined) {
          suspended.declined = true;
          return undefined;
        }
        const session = this.session;
        if (session === undefined || session.prisonId !== prisonId) return undefined;

        const envelope = await this.buildEnvelope();

        /*
         * THE EPOCH CHECK (ADR 0109 Decisions 2, 3 and 4), and it is here
         * rather than beside the write for a reason that is easy to get
         * backwards.
         *
         * The capture above crosses an `await` -- it is a round trip to the
         * simulation worker -- and `adoptSession` can put a **new**
         * `ActiveSession` in the field during it. Comparing at *write* time
         * against whatever is in the field then would compare the new session
         * with itself and pass. What has to be compared is the session the
         * capture **began** against, held in a local across the await, exactly
         * as `deletePrison` holds one across its own.
         *
         * That is issue #582's FINAL-004, measured for ADR 0109: an autosave
         * captured at tick 10, the prison was reloaded to tick 0 underneath
         * it, and the stale capture's write landed as the durable current
         * generation -- *and* advanced the fresh session's revision counter,
         * because the completion callback was guarded by `prisonId`, which a
         * same-slot reload does not change.
         *
         * Returning `undefined` is the drop. ADR 0109 Decision 4: an
         * epoch-stale writer is dropped "without a retry and without a report,
         * because it belongs to a session that no longer exists and has nobody
         * to tell", and this callback's `undefined` is already the scheduler's
         * "no write was attempted, nothing to report" channel
         * (`AutosaveScheduler.performSave`). So the one case where silence is
         * right reuses the one channel that is already silent.
         */
        if (this.session !== session) return undefined;
        if (envelope !== undefined) this.capturesInFlight.set(prisonId, session);
        return envelope;
      },
      save: async (prisonId, envelope) => {
        const captured = this.capturesInFlight.get(prisonId);
        this.capturesInFlight.delete(prisonId);
        const result = await this.submitSave(captured, envelope);
        // `undefined` means the writer went stale between the capture and
        // here -- another await boundary, so it is re-checked rather than
        // assumed. Nothing is written and nothing is reported; the scheduler
        // needs a value, so it gets the same refusal the repository would
        // have produced, which `onResult` below then declines to forward.
        return result ?? DROPPED_STALE_WRITE;
      },
      onResult: (prisonId, result) => {
        if (result === DROPPED_STALE_WRITE) return;
        this.lastSaveResult = result;
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
   * finish its housekeeping -- deleting the generations it had refused, or
   * closing the retained window on the generation that restored (#438) -- if
   * there was one.
   *
   * Reported rather than swallowed: `loadPrison` deliberately does not fail a
   * successful load over housekeeping (see there), and an error nothing can
   * observe is indistinguishable from a bug that stopped retiring anything.
   * Cleared by the next load that gets that far.
   */
  public getLastRetirementFailure(): unknown {
    return this.retirementFailure;
  }

  /**
   * What happened to the session that the most recent `createPrison` or
   * `loadPrison` replaced (#943), or `undefined` if that call replaced
   * nothing.
   *
   * Reset by every such call, so it always describes the latest replacement
   * rather than the latest failure. Nothing in `src/ui/` reads it yet: the
   * save panel's status line is occupied by the create/load the player
   * actually pressed, and a sentence about the *other* prison needs a place
   * of its own on that panel to be worth writing.
   */
  public getLastOutgoingCapture(): OutgoingSessionCapture | undefined {
    return this.outgoingCapture;
  }

  public hasPendingAutosave(): boolean {
    return this.session !== undefined && this.autosave.isPending(this.session.prisonId);
  }

  public async listPrisons(): Promise<readonly PrisonSlotMetadata[]> {
    return this.repository.list();
  }

  /**
   * Every prison the player deleted and can still bring back, and the sweep
   * that closes the ones they cannot (ADR 0114).
   *
   * **Reading this list is what enforces the undo window**, because there is no
   * scheduler anywhere in this application to enforce it on a clock: the
   * repository deletes every copy past its `expiresAt` in the same transaction
   * that reads them. So `SavePanel.refresh()`, which runs at mount and after
   * every action, is the sweep -- and that is a property of the call rather
   * than of the caller, which is why it survives a panel that is rewritten or
   * replaced.
   *
   * **ADR 0114 §3 also proposed a second sweep at this class's construction,
   * and it is deliberately not here.** Its stated reason was that a copy should
   * not linger an entire extra session "merely because the player never opened
   * the save panel" -- and on this tree the player cannot fail to. `src/main.ts`
   * mounts `SavePanel` unconditionally and awaits `panel.refresh()` at startup
   * (the call after the panel's construction), so the sweep already runs once
   * per session before anything is pressed. A constructor sweep would be a
   * second transaction firing microseconds from the first, with no state
   * between them that could differ. It goes in the day the panel becomes
   * optional, and not before.
   */
  public async listDeletedPrisons(): Promise<readonly DeletedPrison[]> {
    return this.repository.listTombstones();
  }

  /**
   * Both halves of the saves list in one transaction, which is what the panel
   * actually calls.
   *
   * `listPrisons` and `listDeletedPrisons` remain for callers that want one
   * half -- the browser harness and this class's own tests -- but a repaint
   * asks once. `PrisonSaveRepository.listSaves` carries both reasons: the
   * measured per-refresh cost, and the fact that two reads are two snapshots a
   * deletion can fall between.
   */
  public async listSaves(): Promise<SaveInventory> {
    return this.repository.listSaves();
  }

  /**
   * Brings a deleted prison back, and says which of the four things happened.
   *
   * **No session is started and none is closed.** A restore puts the prison's
   * records back where they were; making it the live session is `loadPrison`'s
   * job, and doing both here would hide a failed restore behind a successful
   * load exactly as `importInto` refuses to (see its own comment). The prison
   * reappears in the list and the player loads it if they want it.
   *
   * The result is flattened from `RestoreFromTombstoneResult` to its four
   * outcome names because that is all a caller can act on: the success arm's
   * `metadata` is already on the next `listPrisons()`, and handing a slot
   * record to the interface layer would give it a second copy of a record the
   * list is the source of truth for.
   */
  public async restoreDeletedPrison(prisonId: string): Promise<RestoreOutcome> {
    const result = await this.repository.restoreFromTombstone(prisonId);
    return result.ok ? 'restored' : result.reason;
  }

  /**
   * Throws a held copy away now (ADR 0114, the owner's ruling of 2026-09-14).
   *
   * Unlike `deletePrison`, this takes no hold against a concurrent autosave and
   * closes no session, because there is nothing to contend with: the prison it
   * names has no slot record, no generations and no session -- only the copy
   * being freed.
   */
  public async forgetDeletedPrison(prisonId: string): Promise<void> {
    await this.repository.forgetTombstone(prisonId);
  }

  /**
   * Creates a slot and immediately writes generation 1, so a brand-new
   * prison is durable before the player does anything -- a crash right
   * after "New prison" must not leave an empty slot that
   * `loadCurrent` would report as `no-valid-generation`.
   *
   * **And it saves the prison it is about to replace first (#943).** Until
   * that call existed this method's two lines
   * `await this.host.startNew(masterSeed); this.adoptSession(prisonId);`
   * threw the outgoing session away twice over: `startNew` replaced the
   * simulation, and `adoptSession` then disposed the autosave that belonged
   * to it. Measured on v0.0.451: prison A at kernel tick **211** with
   * **1,600** spent came back at tick **0** with **25,000**, with zero
   * dialogs of any kind. See `captureOutgoingSession` for why the save is
   * unconditional and why its failure does not refuse the new prison.
   */
  public async createPrison(prisonId: string, displayName?: string): Promise<SaveResult> {
    await this.repository.create({
      prisonId,
      gameVersion: this.gameVersion,
      ...(displayName === undefined ? {} : { displayName }),
    });

    // Drawn per call, not once for the controller's whole lifetime: a
    // player can press "New Prison" more than once without reloading the
    // page (`src/ui/save-panel.ts`'s `requestCreate`), and issue #479 is
    // precisely that every such prison got the identical streams because
    // nothing drew a fresh value here.
    const masterSeed = this.masterSeed ?? this.generateMasterSeed();

    let adopted = false;
    let result: SaveResult;
    try {
      // Immediately before the line that replaces the outgoing simulation,
      // not at the top of the method: a `repository.create` that fails leaves
      // the player exactly where they were, and a prison that is still being
      // played should not spend a generation of its retained window on a
      // creation that never happened.
      await this.captureOutgoingSession();
      await this.host.startNew(masterSeed);
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
   * Saves whatever session is live right now, because the caller is about to
   * replace it (#943).
   *
   * ### Why it cannot be conditional on the session being dirty
   *
   * Because the never-dirtied session is the one that loses everything. The
   * autosave is **command-driven, not play-driven**: `src/main.ts` wires
   * `commandSender?.onCommandAccepted(() => controller.markDirty())`, whose
   * callback fires only on an accepted command, so a prison that has been
   * *watched* rather than played has never been marked dirty and has never
   * been saved, however long it ran --
   * `docs/research/2026-09-04-does-a-prison-come-back.md` measured 80 s of
   * running clock, nothing pressed, 1,626 ticks and zero saves. A dirty check
   * here would therefore keep the whole defect for exactly that case while
   * looking like a fix, which is why there is no such check and this comment
   * exists instead of one.
   *
   * ### Why a failure does not refuse the new session
   *
   * The plausible causes are a worker that has faulted, hung or gone away
   * (`capture()` rejects, or `WorkerSessionHost` times out after 15 s) and
   * storage that will not take a write. In the first, refusing would leave
   * the player wedged in a session that cannot be saved *and* unable to start
   * one that can -- the opposite of ADR 0096's *"zawsze musi istnieć droga
   * powrotu"*. In the second, the create or load being attempted is about to
   * fail on its own and report itself. So the outgoing save is attempted,
   * recorded on `getLastOutgoingCapture()`, and never allowed to become the
   * caller's verdict.
   *
   * `saveNow` reports failure as a value (see there: a faulted worker must
   * never throw into a click handler), and the residual throw a store can
   * still raise past it is classified exactly as `AutosaveScheduler` does --
   * one vocabulary for a failed background write, not a second blunter one.
   *
   * Not routed through `onSaveResult`, deliberately. That callback reaches
   * `SavePanel.reportBackgroundSave`, which writes the panel's single status
   * line -- the line the create or load the player actually pressed is about
   * to overwrite. Surfacing this properly needs somewhere on that panel to say
   * it, which is a change to `src/ui/save-panel.ts` and a sentence for the
   * player, so the controller records the evidence and leaves the wording to
   * whoever adds the place for it.
   */
  private async captureOutgoingSession(): Promise<void> {
    this.outgoingCapture = undefined;
    const outgoing = this.session;
    if (outgoing === undefined) return;

    let result: SaveResult;
    try {
      result = await this.saveNow();
    } catch (error) {
      const classified = classifyStoreError(error);
      result = { ok: false, error: { code: classified.code, message: `Saving the outgoing prison failed: ${classified.message}` } };
      this.lastSaveResult = result;
    }
    this.outgoingCapture = { prisonId: outgoing.prisonId, result };
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
   * build moments later, so what is wrong is that save.
   *
   * **And "retired" now means one of two things, decided by the reason the
   * refusal declared (#432).** That evidence is equally strong for both of ADR
   * 0063's save-side verdicts and it means opposite things under each.
   * `damaged-payload` says a declared check found the content inconsistent
   * with itself, so no build restores it: deleted, exactly as before.
   * `unsupported-by-this-build` says the bytes are coherent and this build
   * cannot interpret them -- so a build that reads them **already exists**,
   * and deleting them is the one deletion this repository would make against
   * its own stated verdict. Those are quarantined instead: kept on disk under
   * a marked id, outside the retention budget, and still offered to the
   * recovery walk so a build that can read them restores them with the player
   * doing nothing. See `PrisonSaveRepository.quarantineGeneration`. `demoteGeneration`
   * still refuses to delete the last retained copy (see `DemotionResult`),
   * which is now a second belt — the restored generation is always retained,
   * so the window can no longer be walked empty in the first place.
   *
   * Only `SnapshotRestoreRejectedError` costs a generation anything. A host
   * that timed out, was never started or has gone away propagates unchanged:
   * the save may be perfectly good and deleting it would be the more
   * expensive mistake.
   *
   * **And only a *declared* refusal is one (#431).** The paragraph above
   * describes a bound that was standing in for a diagnosis: the worker
   * labelled a bug in this build's own restore code `snapshot-incompatible`
   * exactly as it labelled a bad payload, and what kept that from deleting
   * saves was that nothing is retired until something restores. The diagnosis
   * exists now. An exception that no check on the restore path declared
   * arrives as `SnapshotRestoreFaultError`, which is a different class, so it
   * cannot reach `demoteGeneration` however this method is later edited --
   * that is the point of two classes rather than a field on one.
   *
   * A code fault still **continues the walk**. Our defect may be specific to
   * what one generation happens to contain, and abandoning the load would cost
   * the player a recovery they can have; the two sets below are what keeps
   * "try the next one" separate from "this one has earned retirement".
   * `attempted` is what makes the walk terminate -- it is the skip set, and
   * every generation the loop touches joins it. `refused` is the subset a
   * declared verdict was reached about, and it is the only thing the
   * retirement loop reads.
   *
   * If the walk runs out having hit at least one code fault, the first of them
   * is thrown rather than `no-valid-generation` being returned. The two say
   * different things to the player and only one of them would be true:
   * `save.status.no-readable-generation` asserts that *"every retained copy
   * failed validation"*, which is a claim about their data that a defect of
   * ours does not license. A throw reaches the save panel's
   * `save.failure.load` instead -- "Loading failed: {detail}" -- carrying the
   * message the restore actually produced.
   *
   * **A load into a *different* prison saves the one it replaces first
   * (#943).** Loading the prison that is already live does not, and the block
   * inside the walk says why -- it is the difference between replacing a
   * player's session with somebody else's and reverting their own.
   */
  public async loadPrison(prisonId: string): Promise<SessionLoadOutcome> {
    // Every generation this walk has tried. It is what `loadCurrent` skips and
    // what makes the walk terminate, and it grows for a code fault as well as
    // for a refusal -- a generation we cannot judge still must not be offered
    // back, or the loop spins inside a click handler.
    const attempted = new Set<string>();
    // The subset a declared verdict was reached about, each against the reason
    // the check that refused it declared (#431). Insertion-ordered, so this is
    // also the newest-first order they are retired in below. A code fault
    // never joins it, which is how "must not enter the demotion path at all"
    // is enforced rather than promised -- and the reason is what decides,
    // below, whether retirement means deletion or quarantine (#432).
    const refused = new Map<string, SnapshotRefusalReason>();
    // The first fault our own code produced, if any: reported only if nothing
    // restores, because a later generation restoring means the player has
    // their prison and our defect cost them nothing.
    let firstCodeFault: SnapshotRestoreFaultError | undefined;
    // Whether the decision about the outgoing session has been taken. It is
    // taken once, inside the loop -- see the block that reads it for both
    // halves of why.
    let outgoingSettled = false;

    for (;;) {
      const result = await this.repository.loadCurrent(prisonId, { skip: attempted });
      if (!result.ok) {
        if (firstCodeFault !== undefined) throw firstCodeFault;
        return { ok: false, reason: result.reason };
      }
      if (attempted.has(result.generationId)) {
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

      if (!outgoingSettled) {
        outgoingSettled = true;
        // **Here, not at the top of the method**, for two reasons that both
        // reduce to "capture at the moment of replacement". `loadCurrent` has
        // now produced something to restore, so a load that finds nothing
        // (`not-found`, an empty slot) costs the prison the player is playing
        // no generation at all -- and in production the outgoing session stops
        // existing inside the very next line, because
        // `WorkerPerSessionHost.beginSession` shuts the outgoing worker down
        // before it claims the next one. **Once only**, for the same reason:
        // after the first attempt there is no outgoing world left to capture,
        // so a second pass would either read the replacement's state or reject.
        //
        // **Loading the prison that is already live is left alone**, and that
        // is an identity check, never a dirty check -- a never-pressed prison
        // B is still saved when prison A is loaded over it, which is the case
        // #943 and `docs/research/2026-09-04-does-a-prison-come-back.md` are
        // about.
        //
        // The reason is the walk this block sits inside. A save of the live
        // session writes a **new generation of the prison being loaded**, into
        // the very retained window the walk above is iterating -- so the next
        // `loadCurrent(prisonId, { skip: attempted })` offers it back as the
        // newest readable generation. A prison whose own saves all refuse to
        // restore would then be "recovered" to the state the player was
        // already in: `no-valid-generation` becomes unreachable, the panel's
        // Import (which imports a generation and then loads *the same prison*
        // -- `src/ui/save-panel.ts`'s `requestImport`) would report success
        // having restored the pre-import session, and a real refusal would be
        // hidden behind a fake recovery. It also spends one of the three
        // retained slots -- the recovery window, not a save-slot feature
        // (`docs/PERSISTENCE.md`) -- on state the player is deliberately
        // reverting away from.
        //
        // What it would *not* do is break the happy path, and an earlier
        // version of this comment claimed it would. `loadCurrent` has already
        // read `bundle` by the time this block runs, so a capture here cannot
        // become what *this* load restores; a mutation that removed the check
        // left both the Import round trip and the revert intact and was caught
        // only by the walk. Corrected rather than deleted, because the
        // plausible-and-false reading is the one a later editor will have too.
        //
        // So Load on the active row keeps the defect the research measured --
        // 2,461 ticks discarded, zero dialogs -- and a save is the wrong
        // instrument for it. What it needs is the asking: a confirmation on
        // the panel before the revert, which is a sentence for the player and
        // a change to `src/ui/save-panel.ts`.
        if (this.session?.prisonId === prisonId) this.outgoingCapture = undefined;
        else await this.captureOutgoingSession();
      }

      try {
        await this.host.startFromSnapshot(bundle);
      } catch (error) {
        if (error instanceof SnapshotRestoreFaultError) {
          // Our defect, so no verdict has been reached about this save at all.
          // It is skipped so the walk can go on, and it is *not* added to
          // `refused`, so nothing below can retire it.
          firstCodeFault ??= error;
          attempted.add(result.generationId);
          continue;
        }
        if (!(error instanceof SnapshotRestoreRejectedError)) throw error;
        // Set aside, not retired. Nothing on disk changes until something
        // restores, so a walk that reaches the end of the window leaves the
        // player with exactly what they had.
        attempted.add(result.generationId);
        refused.set(result.generationId, error.reason);
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
      let restoredGenerationId = result.generationId;
      try {
        // First, because the generation that restored may itself be one a
        // previous load quarantined, and a build that has restored it has
        // falsified the verdict that put it there (#432). Releasing it before
        // the loop below also keeps it out of the quarantine slot the loop may
        // be about to claim.
        const release = await this.repository.releaseQuarantinedGeneration(prisonId, restoredGenerationId);
        if (release.released) restoredGenerationId = release.generationId;

        for (const [refusedGenerationId, reason] of refused) {
          switch (reason) {
            // The bytes are coherent and a build that reads them already
            // exists -- it is the one that wrote them. Kept, not deleted
            // (#432); see `PrisonSaveRepository.quarantineGeneration`.
            case 'unsupported-by-this-build':
              await this.repository.quarantineGeneration(prisonId, refusedGenerationId);
              break;
            // A declared check found the content inconsistent with itself, so
            // no build restores it. Retired exactly as before.
            case 'damaged-payload':
              await this.repository.demoteGeneration(prisonId, refusedGenerationId);
              break;
            default: {
              // A third refusal reason must decide keep-or-delete here rather
              // than inheriting whichever branch happened to be the fallback.
              // `never` makes adding one a typecheck failure at this line.
              const unhandled: never = reason;
              throw new Error(`Unhandled snapshot refusal reason "${String(unhandled)}"; a refused generation was neither retired nor quarantined.`);
            }
          }
        }
        // And the same evidence pointed the other way (#438). An imported
        // generation is written into the retained window's spare slot rather
        // than over one of the player's own, because a file that decodes,
        // migrates and checksums has still not been shown to *restore*. It
        // just has, so the window's ordinary budget applies to it again --
        // and the generation it displaces is displaced now, having been kept
        // for exactly as long as it took to find out. A no-op on every load
        // into a prison nobody imported into, which is why it is unguarded.
        await this.repository.confirmGeneration(prisonId, restoredGenerationId);
      } catch (error) {
        this.retirementFailure = error;
      }

      return {
        ok: true,
        recovered: attempted.size > 0 || result.outcome === 'recovered-previous',
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

  /**
   * The write half of both save paths: refuse a writer that is no longer the
   * authorised session, compare-and-swap on the revision, and retry exactly
   * once for a live writer that lost a race (ADR 0109 Decision 4).
   *
   * ### The three outcomes, and why one of them is `undefined`
   *
   * ADR 0109 Decision 4 rules **refuse and surface, plus retry for exactly one
   * case**, and it is able to tell the two callers apart only because Decision
   * 2 gives it a second token:
   *
   * - **Epoch-stale** -- the session that captured this state is not the one
   *   in the field any more. Dropped: no write, no retry, no report. Returned
   *   as `undefined`, because there is no result to give anybody. "A refusal
   *   that reaches neither the player nor a retry is then only possible for a
   *   writer that is already gone, which is the one case where silence is the
   *   right answer."
   * - **Epoch-current but revision-stale** -- this session is live and lost a
   *   race for the revision number. Re-captured and re-submitted **once**,
   *   against the revision the refusal just reported, because its state is the
   *   newest there is.
   * - **Anything else** -- returned as-is for the caller to surface.
   *
   * ### Why the retry is bounded at one, and what that leaves open
   *
   * ADR 0109's own second-weakest claim is that one retry converges: *"Under
   * sustained two-tab contention it may not, and the failure mode of a retry
   * that always loses is an autosave that never writes while reporting nothing
   * -- silence again, by a different route."* A second refusal is therefore
   * **returned rather than retried again**, so it reaches
   * `describeSaveResult` on the manual path and `getLastSaveResult` on the
   * autosave one. The unbounded version would convert a visible refusal into
   * an invisible livelock, which is the failure ADR 0105 exists to prevent.
   *
   * ### Why `session.revision` is assigned and never incremented
   *
   * The number comes back from the transaction that allocated it
   * (`SaveResult.revision`), so this field can only ever hold a value some
   * write actually wrote. Incrementing is what let a *stale* writer advance a
   * *newer* session's counter in issue #582's FINAL-004 measurement; an
   * assignment guarded by the epoch cannot.
   */
  private async submitSave(session: ActiveSession | undefined, envelope: SaveEnvelope): Promise<SaveResult | undefined> {
    if (session === undefined || this.session !== session) return undefined;

    const first = await this.repository.save(session.prisonId, envelope, session.revision);
    if (first.ok) {
      if (this.session === session) session.revision = first.revision;
      return first;
    }
    if (first.error.code !== 'stale-revision' || first.stale === undefined) return first;

    /*
     * **THE RETRY IS NARROWER THAN ADR 0109 DECISION 4'S WORDING, AND THIS IS
     * WHY.** Taken literally -- "an epoch-current writer that lost a revision
     * race re-captures and retries once" -- the retry re-opens FINAL-006, the
     * two-tab defect the same document says the revision CAS closes. It was
     * measured doing exactly that while this was being built:
     * `tests/unit/persistence-stale-save-refusal.test.ts`'s two-tab case had
     * tab B refused at expectation 1 against durable 2, then retry, then
     * succeed at 3 -- tab A's hundred ticks overwritten anyway, by a slower
     * route.
     *
     * The epoch cannot tell those cases apart on its own, because it is
     * per-process: **both tabs are epoch-current in their own process.** What
     * separates them is the ADR's own justification for the retry -- "it is
     * live, and its state is the newest there is". That is true when the
     * writer lost the race to *itself* (its own other save path, which is
     * FINAL-005) and false when it lost to another tab, whose state it has
     * never seen.
     *
     * So the test is whether the slot moved to exactly where this session's
     * own bookkeeping already stands. `session.revision` is only ever assigned
     * from a write *this session* completed, and revisions are allocated as
     * `durable + 1` inside a serialised transaction, so two writers cannot
     * both land on one number. `durableRevision === session.revision`
     * therefore means "the write that beat me was mine", and anything else
     * means another writer holds the slot and must be surfaced rather than
     * overwritten. That is the rule this project already committed to on the
     * cloud side on 2026-08-22, and the local store is now held to it too:
     * `supabase/migrations/20260822190300_create_save_version_rpc.sql:6-8`
     * requires `p_new_revision` to be exactly `current_revision + 1`,
     * "anything else is a conflict the caller must resolve (never a silent
     * overwrite, never a silent 'latest wins')".
     *
     * Re-checked rather than assumed: the write above crossed an await, and a
     * session that went stale during it has lost its claim to a retry.
     */
    if (this.session !== session) return undefined;
    if (first.stale.durableRevision !== session.revision) return first;

    const recaptured = await this.buildEnvelope();
    if (recaptured === undefined || this.session !== session) return undefined;

    // Against the revision the refusal reported, not against `session.revision`
    // -- that is what "re-submit against the revision just found" means, and
    // resubmitting the same expectation would guarantee the same refusal.
    const second = await this.repository.save(session.prisonId, recaptured, first.stale.durableRevision);
    if (second.ok && this.session === session) session.revision = second.revision;
    return second;
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

    /*
     * Through the shared write path, so a manual save gets the same epoch
     * check and the same compare-and-swap as an autosave (ADR 0109
     * Decision 4). `session` was read before `buildEnvelope`'s await, so it is
     * the session this press began against and not merely whatever is in the
     * field now.
     *
     * `undefined` is the epoch-stale drop, and on this path it is reachable
     * only when the player started or loaded another prison while their own
     * Save was still capturing. They pressed a button, so unlike the autosave
     * they do get an answer -- but the answer is about the save they asked
     * for, which did not happen, rather than a claim that it did.
     */
    const submitted = await this.submitSave(session, envelope);
    const result: SaveResult = submitted ?? {
      ok: false,
      error: { code: 'stale-revision', message: 'The session this save was captured from is no longer the active one.' },
    };
    this.lastSaveResult = result;
    if (result.ok) {
      await this.repository.markPendingSync(session.prisonId, { dirtySinceRevision: session.revision, markedAt: this.now() });
    }
    return result;
  }

  /**
   * Deletes a prison, and closes the live session **only once the store has
   * actually committed the deletion**.
   *
   * ### The defect this closes
   *
   * These two lines used to be the other way round:
   *
   * ```ts
   * if (this.session?.prisonId === prisonId) this.closeSession();
   * await this.repository.delete(prisonId);
   * ```
   *
   * `closeSession` disposes the autosave schedule and clears `this.session`,
   * and nothing put either back when the `await` rejected. So a deletion the
   * store refused reported failure -- `SavePanel.requestDelete` does not catch,
   * so `AsyncActionGate`'s `onError` surfaces it -- and left the player with a
   * prison that was still on disk, still in the list, still being simulated by
   * a host this controller never stopped, and no longer the active session:
   * `markDirty` returns at its first line, `saveNow` answers *"No active
   * session to save."*, and the write that was already queued went with the
   * schedule. A refusal *before the first mutation* is enough to reach that
   * state, so it does not depend on how a store rolls back.
   *
   * ### Why the guard after the `await` is an identity check
   *
   * Because `prisonId` is not enough to prove that the session in the field is
   * the one this call was going to close. A deletion that takes a while --
   * every one of them crosses a real IndexedDB transaction -- can finish after
   * the player has already started or loaded another prison, and
   * `adoptSession` puts a **new** `ActiveSession` object in the field. An id
   * check would then be satisfied by a session this call never saw -- the row
   * is still on the panel while the deletion is uncommitted, so pressing Load
   * on it is the plainest route there -- and close a live one. Comparing the
   * object identity cannot be satisfied that way: the only session it closes
   * is the very one that was live when the deletion began.
   *
   * ### Why the schedule is suspended, and what makes the suspension safe
   *
   * With the store call now happening *before* anything is torn down, the
   * autosave timer is still armed for the duration of it, and it can come due
   * inside the `await`. Left alone it would write a generation into the prison
   * being deleted -- wasted if the deletion commits, and reported to the
   * player as a failed save if it lands after the slot is gone. So the
   * scheduler's `buildEnvelope` callback declines while the deletion is in
   * flight (see the constructor), which costs the pending marker, and this
   * method puts the marker back when the deletion does **not** commit.
   *
   * `AutosaveScheduler.markDirty` is the right instrument for that because it
   * composes with the scheduler's own state machine under either ordering: if
   * the declined save has not settled yet its entry is still `'saving'`, so
   * `markDirty` turns it into `'saving-with-pending-dirty'` and `settle`
   * reschedules; if it has already settled the entry is gone and `markDirty`
   * arms a fresh timer. There is no window in which a late `settle` deletes a
   * marker this method restored, because `settle` only ever runs on an entry
   * that this restoration has already turned into the rescheduling state.
   *
   * ### What this deliberately does not do
   *
   * Swallow the rejection and report success; build a replacement session to
   * stand in for the one that was closed; or close by id after the `await`.
   * The first two lie to the player about what is on disk, and the third is
   * the bug one step further along. It also does not stop the runtime host on
   * a successful deletion -- issue #582's other half, which is a change to
   * what `closeSession` means and is left to it rather than smuggled in here.
   *
   * **THAT LAST SENTENCE IS NOW HISTORY AND IS KEPT BECAUSE IT NAMES THE
   * DEFECT.** `closeSession` stops the host as of #582 RED-001, so a deletion
   * that reaches it tears the simulation down too. The paragraph above was
   * right that this is a change to what `closeSession` means; what it did not
   * say is what the gap cost in the meantime -- a worker went on ticking
   * against a prison with no rows on disk until the next New or Load happened
   * to stop it, and the test that was supposed to cover deletion asserted
   * `getActiveSession()`, which is the controller's own bookkeeping and not
   * the thing that was still running.
   */
  public async deletePrison(prisonId: string): Promise<void> {
    // Captured before the store call and compared by identity after it. `?.`
    // and the id test together mean this is `undefined` whenever the deletion
    // is of some other prison, which is exactly when nothing should be closed.
    const session = this.session?.prisonId === prisonId ? this.session : undefined;

    const suspended: SuspendedAutosave = { declined: false };
    this.deletionsInFlight.set(prisonId, suspended);

    let committed = false;
    try {
      await this.repository.delete(prisonId);
      committed = true;
    } finally {
      // Identity-guarded, so a second deletion of the same prison that started
      // while this one was in flight keeps its own hold rather than having it
      // lifted by this one's return.
      if (this.deletionsInFlight.get(prisonId) === suspended) this.deletionsInFlight.delete(prisonId);
      // Only what was actually taken away is given back. Marking dirty
      // unconditionally would schedule a write for a session that had none,
      // which is a different behaviour rather than a restoration of this one.
      if (!committed && suspended.declined) this.autosave.markDirty(prisonId);
    }

    if (session !== undefined && this.session === session) await this.closeSession();
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

  /**
   * Ends the active session: stops autosaving it, stops the simulation running
   * it, and forgets it.
   *
   * **The host stop is issue #582's RED-001 and it is why this returns a
   * promise.** Before it, this method cleared the controller's own record and
   * left `SessionRuntimeHost` running, so the simulation outlived the save --
   * on a delete, a worker kept ticking against a prison with no rows on disk
   * until the next `beginSession` happened to stop it. Clearing bookkeeping is
   * not stopping what is running, and the deletion test that passed throughout
   * asserted only the bookkeeping.
   *
   * **Ordering is deliberate**: autosave first, so no timer can schedule a
   * capture against a host that is being torn down; then the host; then the
   * record. `SessionRuntimeHost.stop()` documents itself "safe to call when
   * nothing is running", so this needs no guard for the idle case and stays
   * safe to call twice.
   *
   * **What this deliberately does not do is wait for an in-flight save.**
   * `AutosaveScheduler.dispose()` cancels pending timers and does not await a
   * capture already past its `state = 'saving'` line -- issue #582's FINAL-004,
   * which is not fixed here because awaiting it would not fix it: the stale
   * capture has already read pre-teardown state, so what that needs is a token
   * checked at write time rather than a longer wait here.
   */
  public async closeSession(): Promise<void> {
    this.autosave.dispose();
    await this.host.stop();
    this.session = undefined;
  }

  public async dispose(): Promise<void> {
    await this.closeSession();
  }
}
