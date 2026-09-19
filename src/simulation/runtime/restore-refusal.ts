/**
 * Why a snapshot restore ended without a session, said by whoever decided it
 * rather than guessed by whoever caught it (#431).
 *
 * ## What the boundary could and could not say before
 *
 * `SimulationWorkerStateMachine.handleInitialize` wrapped the whole of
 * `restoreSimulationRuntime` in one `catch` and reported everything it caught
 * as `snapshot-incompatible`, and `WorkerSessionHost` turned that into a
 * `SnapshotRestoreRejectedError` carrying a message string and nothing else.
 * So a save this build genuinely cannot read and *a defect in this build's own
 * restore code* arrived at the persistence layer as the same class with
 * different prose. The player was told their file was unreadable when the
 * fault was ours, and a support report could not be told from a bug report.
 *
 * ## The three answers, and why three
 *
 * A restore attempt that produced no session ended for exactly one of these
 * reasons. Two are verdicts about the save; the third is a verdict about us.
 *
 * - **`unsupported-by-this-build`** — the payload is coherent and this build
 *   cannot interpret it: a snapshot `schemaVersion` it does not implement, an
 *   entity ledger whose written prefix is wider than it allocates
 *   (`EntityStore.loadSnapshot`), an actor-identity snapshot version it does
 *   not know. **Nothing is wrong with the bytes** and another build reads
 *   them, which is the whole reason it is not the row below: it is the case
 *   #432's quarantine exists for, and the case where "update the game" is
 *   advice that would work.
 * - **`damaged-payload`** — a declared check found the content inconsistent
 *   with itself: a terrain run that overruns its chunk, an RNG stream that is
 *   not four words, a `simulation` section with no `entities` beside it, an
 *   identity snapshot naming one entity twice. No build restores this.
 * - **`restore-code-fault`** — no declared check refused anything and an
 *   exception escaped. This build is the fault. It is deliberately **not** a
 *   member of `SnapshotRefusalReason`, because it is not a refusal: nothing
 *   judged the save, so nothing may be concluded about it, and
 *   `SessionController.loadPrison` must not retire a generation for it.
 *
 * Not four, and the fourth candidate is worth naming so the next reader does
 * not re-propose it: *shape* and *checksum* failures never reach here.
 * `decodeSaveEnvelope` refuses those first, under its own five-code taxonomy
 * (`docs/PERSISTENCE.md`, "Error taxonomy"), and everything that arrives at a
 * restore has already passed schema, migration and checksum validation. A
 * reason arm for them would be permanently unreachable.
 *
 * Not two either. Collapsing the first two into "the save is bad" is what
 * makes a save a *newer* build wrote indistinguishable from a corrupt one,
 * and those two want opposite handling: one should be kept for the build that
 * can read it, the other is only worth keeping as evidence.
 *
 * ## Where a reason is decided
 *
 * At the throw site, by the module that owns the meaning of the value it just
 * refused, and never by reading a message. `restoreFailureReasonOf` is the
 * entire classifier and it is one `instanceof`; there is no string matching on
 * the restore path in either direction. A refusal whose message is rewritten
 * classifies identically, and an error carrying a refusal's exact words but
 * not its class is a code fault -- which
 * `tests/unit/restore-refusal-reasons.test.ts` pins in both directions.
 *
 * ## What is *not* declared, deliberately
 *
 * Only a check whose input can come from nowhere but a save declares a reason.
 * Validators shared with a live session -- `NamedRngStreams`'s name-shape and
 * uniqueness rule, `SecuritySectorRegistry.register`'s duplicate-id refusal,
 * the content-definition lookups inside `restoreSessionSystems`' subsystem
 * graph -- keep throwing what they throw, because relabelling them would tell
 * a developer who mistyped a stream name in code that a save was bad, which is
 * this issue's own defect pointed the other way.
 *
 * The cost of that is bounded and is a cost in one direction only: such a
 * refusal is classified `restore-code-fault`, so the walk in
 * `SessionController.loadPrison` still tries the next generation, retires
 * nothing, and reports the failure as this build's. A save is never destroyed
 * for a reason nothing declared; at worst a genuinely bad generation is not
 * retired as promptly as it could be, and the next load retries it.
 */

/**
 * The reasons that are verdicts about the *save*.
 *
 * `as const` for the same reason `PROTOCOL_FAULT_CODES` is: the type stays
 * these two strings instead of widening to `string`, and the array is what
 * the wire-side validator checks a received value against.
 */
export const SNAPSHOT_REFUSAL_REASONS = ['unsupported-by-this-build', 'damaged-payload'] as const;

export type SnapshotRefusalReason = (typeof SNAPSHOT_REFUSAL_REASONS)[number];

/** The verdict when nothing declared a refusal: an exception escaped our own restore code. */
export const RESTORE_CODE_FAULT = 'restore-code-fault';

export const RESTORE_FAILURE_REASONS = [...SNAPSHOT_REFUSAL_REASONS, RESTORE_CODE_FAULT] as const;

export type RestoreFailureReason = (typeof RESTORE_FAILURE_REASONS)[number];

/**
 * A deliberate refusal of a snapshot's contents, carrying the reason the site
 * that raised it decided.
 *
 * ### Why it extends `RangeError`
 *
 * Because nearly every site this replaces already threw one, and the two that
 * did not (`WorldSnapshotError`, `EntityStore.loadSnapshot`'s plain `Error`)
 * are refusals of a value outside the domain this build accepts, which is what
 * a `RangeError` is for. Subclassing rather than substituting means every
 * `toThrow(RangeError)` assertion already in the suite keeps holding and gains
 * a declared reason underneath it, instead of a dozen assertions being
 * rewritten in the same commit that changes the behaviour they guard --
 * `tests/unit/run-length-codec-unification.test.ts`'s *"keeps each plane its
 * own error type rather than a shared generic one"* is the one that would have
 * had to be weakened, and it is not.
 *
 * Classification never reads `RangeError`, only this class, so a `RangeError`
 * thrown by a genuine defect elsewhere is still a code fault.
 */
export class SnapshotRefusedError extends RangeError {
  public constructor(
    public readonly reason: SnapshotRefusalReason,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SnapshotRefusedError';
  }
}

/**
 * The whole classifier.
 *
 * One `instanceof`, no message inspection, and no table of error classes to
 * keep in step with the throw sites -- a reason exists because a site declared
 * it, and its absence is itself the answer. That is the property #431 asks
 * for: *"a category inferred later from a message string is the defect this
 * issue is about, wearing a hat."*
 */
export function restoreFailureReasonOf(error: unknown): RestoreFailureReason {
  return error instanceof SnapshotRefusedError ? error.reason : RESTORE_CODE_FAULT;
}

/**
 * Reads a reason back off a `protocol/error`'s `details`, refusing anything
 * that is not one of the declared values.
 *
 * The worker and the main thread are the same build, so this is not version
 * negotiation -- it is the boundary declining to trust a decoded `jsonValue`
 * enough to widen `RestoreFailureReason` by a cast. `undefined` means the
 * fault declared no reason at all, which its caller treats as our defect
 * rather than guessing one.
 */
export function declaredRestoreFailureReason(details: unknown): RestoreFailureReason | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  const value = (details as { readonly snapshotRestore?: unknown }).snapshotRestore;
  return RESTORE_FAILURE_REASONS.find((candidate) => candidate === value);
}

/** The `details` a `protocol/error` about a restore carries. Built here so the key is spelled once. */
export function restoreFailureDetails(reason: RestoreFailureReason): { readonly snapshotRestore: RestoreFailureReason } {
  return { snapshotRestore: reason };
}
