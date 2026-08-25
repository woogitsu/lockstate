import {
  type ChallengeDefinition,
  challengeDefinitionHash,
  expectedCheckpointTicks,
} from './challenge';
import {
  type ChallengeEvidence,
  type ChallengeSubmission,
  type EvidenceCheckpoint,
  challengeEvidenceHash,
  challengeSubmissionSchema,
  measureEvidenceBytes,
} from './evidence';
import type { ChallengeRejectionCode } from './rejection-codes';

export interface ChallengeReplayOutcome {
  readonly finalTick: number;
  readonly finalStateHash: string;
  readonly checkpoints: readonly EvidenceCheckpoint[];
  readonly metrics: Readonly<Record<string, number>>;
}

export type ChallengeReplayResult =
  | { readonly ok: true; readonly outcome: ChallengeReplayOutcome }
  | { readonly ok: false; readonly reason: string };

/**
 * The trusted replay step (ADR 0009 step 6) as a port. The real
 * implementation re-executes the command stream on the real kernel inside
 * a trusted server runtime (zone Z2); it does not exist yet, and public
 * ranking is gated on it. Keeping it behind an interface lets every other
 * step -- which is where all the tamper/compatibility rejection lives --
 * be complete and tested now.
 */
export interface ChallengeReplayRunner {
  replay(request: {
    readonly definition: ChallengeDefinition;
    readonly evidence: ChallengeEvidence;
  }): Promise<ChallengeReplayResult> | ChallengeReplayResult;
}

export type ChallengeVerificationResult =
  | {
      readonly status: 'verified';
      readonly evidenceHash: string;
      /** The replay's own metrics, never the submitter's claim. */
      readonly metrics: Readonly<Record<string, number>>;
      readonly rankedScore: number;
      /**
       * The tick the *replay* ended at, which a verified result has also
       * agreed with the claim (`final-tick-mismatch`). It is still reported
       * from the replay rather than copied from the evidence, because the
       * trusted side is the one this result is allowed to state.
       */
      readonly replayedTick: number;
    }
  | {
      /** Structurally sound but not replayed: personal result only, never publicly ranked. */
      readonly status: 'unverified';
      readonly evidenceHash: string;
      readonly reason: 'replay-unavailable';
    }
  | { readonly status: 'rejected'; readonly code: ChallengeRejectionCode; readonly message: string };

export interface VerifyChallengeSubmissionInput {
  readonly submission: unknown;
  /** Must already be authenticated via `authenticateChallengeDefinition`. */
  readonly definition: ChallengeDefinition;
  /** The authenticated caller, from the JWT -- never from the submission body. */
  readonly accountId: string;
  readonly now: number;
  readonly replayRunner?: ChallengeReplayRunner;
  /**
   * The `evidence_hash` the submitter claimed, as stored in
   * `challenge_submissions.evidence_hash` -- never as the source of any
   * decision. Supplying it makes this pipeline *contradict* the claim
   * (ADR 0009: "the claimed score is present only so it can be
   * contradicted", which is equally true of the claimed hash); omitting it
   * leaves the claim unchecked, which is what a caller that has no claim to
   * check does.
   *
   * This comparison lives here, and only here, because this is the tier
   * that owns the algorithm. The database keys its unique constraint on a
   * digest it computes itself (`challenge_submissions.evidence_digest`,
   * issue #105 finding 1) precisely because it cannot recompute this hash:
   * `challengeEvidenceHash` is FNV-1a over `canonicalJson`, and reproducing
   * that in SQL would mean hand-writing a JSON canonicalizer including
   * JavaScript number formatting.
   */
  readonly claimedEvidenceHash?: string;
  readonly isDuplicateEvidence?: (evidenceHash: string) => boolean | Promise<boolean>;
}

function reject(code: ChallengeRejectionCode, message: string): ChallengeVerificationResult {
  return { status: 'rejected', code, message };
}

/** Ordering the kernel itself requires: ticks non-decreasing, sequences strictly increasing. */
function findOrderingViolation(evidence: ChallengeEvidence): string | undefined {
  let previousTick = -1;
  let previousSequence = -1;
  for (let index = 0; index < evidence.commands.length; index += 1) {
    const command = evidence.commands[index]!;
    if (command.tick < previousTick) return `Command ${index} moves backwards in time (tick ${command.tick}).`;
    if (command.sequence <= previousSequence) {
      return `Command ${index} does not advance the sequence (sequence ${command.sequence}).`;
    }
    previousTick = command.tick;
    previousSequence = command.sequence;
  }
  return undefined;
}

function checkpointsAgree(left: readonly EvidenceCheckpoint[], right: readonly EvidenceCheckpoint[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((checkpoint, index) => {
    const other = right[index]!;
    return checkpoint.tick === other.tick && checkpoint.stateHash === other.stateHash;
  });
}

function metricsAgree(claimed: Readonly<Record<string, number>>, replayed: Readonly<Record<string, number>>): boolean {
  const claimedKeys = Object.keys(claimed).sort();
  const replayedKeys = Object.keys(replayed).sort();
  if (claimedKeys.length !== replayedKeys.length) return false;
  return claimedKeys.every((key, index) => replayedKeys[index] === key && Object.is(claimed[key], replayed[key]));
}

/**
 * The full verification pipeline of ADR 0009, in cost order: schema, then
 * pure compatibility/budget/structure checks, then the expensive replay,
 * then agreement. Every step fails closed, and no step "repairs" a
 * submission -- adapting incompatible evidence would be inventing a run
 * nobody played.
 */
export async function verifyChallengeSubmission(
  input: VerifyChallengeSubmissionInput,
): Promise<ChallengeVerificationResult> {
  const parsed = challengeSubmissionSchema.safeParse(input.submission);
  if (!parsed.success) {
    return reject(
      'invalid-shape',
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; '),
    );
  }

  const submission = parsed.data as ChallengeSubmission;
  const evidence = submission.evidence;
  const { definition } = input;

  if (submission.accountId !== input.accountId) {
    return reject('account-mismatch', 'Submission account does not match the authenticated caller.');
  }

  // --- Identity of what was played -------------------------------------
  if (evidence.challengeId !== definition.id) {
    return reject('challenge-mismatch', `Evidence targets challenge "${evidence.challengeId}".`);
  }
  if (evidence.challengeVersion !== definition.version) {
    return reject(
      'challenge-version-mismatch',
      `Evidence was produced against challenge version ${evidence.challengeVersion}, current is ${definition.version}.`,
    );
  }
  if (evidence.definitionHash !== challengeDefinitionHash(definition)) {
    return reject('definition-hash-mismatch', 'Evidence was produced against a different definition body.');
  }

  // --- Compatibility ----------------------------------------------------
  if (!definition.allowedGameVersions.includes(evidence.gameVersion)) {
    return reject('build-not-allowed', `Build "${evidence.gameVersion}" is not admitted to this challenge.`);
  }
  if (!definition.allowedContentVersions.includes(evidence.contentVersion)) {
    return reject('content-version-not-allowed', `Content version "${evidence.contentVersion}" is not admitted.`);
  }
  if (evidence.configHash !== definition.configHash) {
    return reject('config-hash-mismatch', 'Evidence was produced under a different simulation configuration.');
  }
  if (evidence.seed !== definition.seed) {
    return reject('seed-mismatch', 'Evidence was produced with a different seed than the challenge defines.');
  }
  if (input.now < definition.opensAt || input.now >= definition.closesAt) {
    return reject('submission-window-closed', 'The challenge submission window is not open.');
  }

  // --- Budget (bounds verification cost before any execution) -----------
  const evidenceBytes = measureEvidenceBytes(evidence);
  if (evidenceBytes > definition.limits.maxEvidenceBytes) {
    return reject('evidence-too-large', `Evidence is ${evidenceBytes} bytes, limit is ${definition.limits.maxEvidenceBytes}.`);
  }
  if (evidence.commands.length > definition.limits.maxCommands) {
    return reject('command-budget-exceeded', `Evidence has ${evidence.commands.length} commands.`);
  }
  if (evidence.finalTick > definition.limits.maxTicks) {
    return reject('tick-budget-exceeded', `Evidence ends at tick ${evidence.finalTick}, limit is ${definition.limits.maxTicks}.`);
  }

  // --- Structure --------------------------------------------------------
  const orderingViolation = findOrderingViolation(evidence);
  if (orderingViolation !== undefined) return reject('command-stream-out-of-order', orderingViolation);

  const lastCommand = evidence.commands.at(-1);
  if (lastCommand !== undefined && lastCommand.tick > evidence.finalTick) {
    return reject('command-after-final-tick', 'A command executes after the run is claimed to have ended.');
  }

  const requiredCheckpointTicks = expectedCheckpointTicks(definition.limits, evidence.finalTick);
  const cadenceMatches =
    evidence.checkpoints.length === requiredCheckpointTicks.length &&
    evidence.checkpoints.every((checkpoint, index) => checkpoint.tick === requiredCheckpointTicks[index]);
  if (!cadenceMatches) {
    return reject(
      'checkpoint-cadence-invalid',
      `Evidence must carry a checkpoint at every ${definition.limits.checkpointIntervalTicks} ticks.`,
    );
  }

  const evidenceHash = challengeEvidenceHash(evidence);

  // The hash was recomputed above and, until issue #105 finding 1, was never
  // compared to the one the submitter sent -- so a submission could carry any
  // 16 hex characters and nothing at either tier disagreed. It is checked
  // here rather than earlier because there is nothing to check until the
  // evidence has parsed, and later would mean replaying a submission whose
  // own self-description is wrong.
  //
  // A mismatch is a rejection rather than a repair. It means the stored claim
  // does not describe the stored evidence, which is either a broken client or
  // a tampered row, and both are things a leaderboard must surface instead of
  // quietly ranking.
  if (input.claimedEvidenceHash !== undefined && input.claimedEvidenceHash !== evidenceHash) {
    return reject(
      'evidence-hash-mismatch',
      `Submitted evidence hashes to ${evidenceHash}, but the submission claims ${input.claimedEvidenceHash}.`,
    );
  }

  if (input.isDuplicateEvidence !== undefined && (await input.isDuplicateEvidence(evidenceHash))) {
    return reject('duplicate-evidence', 'This exact evidence has already been submitted.');
  }

  // --- Replay and agreement --------------------------------------------
  if (input.replayRunner === undefined) {
    return { status: 'unverified', evidenceHash, reason: 'replay-unavailable' };
  }

  const replayResult = await input.replayRunner.replay({ definition, evidence });
  if (!replayResult.ok) return reject('replay-failed', replayResult.reason);

  const { outcome } = replayResult;

  /*
   * How long the run was, compared first -- and it is a comparison, not a
   * report, for the reason the whole layer exists: the replay is the
   * authority and the claim is untrusted (ADR 0009). Two sides that disagree
   * about the final tick disagree about the *run*, which is the same shape of
   * disagreement `checkpointsAgree` and the final-hash comparison below
   * already refuse.
   *
   * It sits ahead of them on both of the criteria ADR 0009 orders the
   * pipeline by. It is the cheapest of the four agreement checks -- one
   * integer, against a checkpoint walk and a metric-key walk -- and it is the
   * most informative, because if the two runs are of different lengths then
   * every per-field disagreement underneath is a *consequence* of that, and
   * would otherwise be reported as though a hash or a metric were the finding.
   *
   * Its own code rather than a fold into `final-state-hash-mismatch`, for the
   * same reason this vocabulary has twenty-four members and not one: the
   * diagnostic value is in knowing which field disagreed
   * (`rejection-codes.ts`), and a tick disagreement points at the run's
   * length, where a hash disagreement points at its content.
   *
   * What it adds beyond the checks below, stated exactly, because the honest
   * answer is narrower than "nothing else notices":
   *
   * - Nothing else in this pipeline reads `outcome.finalTick`. Every use of a
   *   final tick above -- the `maxTicks` budget, `command-after-final-tick`,
   *   the checkpoint cadence -- is computed from `evidence.finalTick`, the
   *   claim. Before this check, the one number the budget is enforced against
   *   was never contradicted by anything.
   * - `checkpointsAgree` constrains a tick disagreement only to within one
   *   `checkpointIntervalTicks`, and only *if* the runner emits checkpoints at
   *   the definition's cadence up to its own final tick. `ChallengeReplayRunner`
   *   neither states that nor can enforce it; it declares `finalTick` as an
   *   output precisely because the replay is what decides when the run ended.
   * - A final state hash taken over a kernel snapshot carries the tick
   *   (`kernelSnapshotSchema`, src/persistence/save-schema.ts), so for such a
   *   runner a differing tick usually also differs the hash. "Usually" is as
   *   far as that goes: ADR 0009 says only "canonical state hash", the trusted
   *   runner does not exist yet, and a verifier cannot see what went into
   *   sixteen hex characters.
   */
  if (outcome.finalTick !== evidence.finalTick) {
    return reject(
      'final-tick-mismatch',
      `The trusted replay ended at tick ${outcome.finalTick}; the submission claims tick ${evidence.finalTick}.`,
    );
  }
  if (!checkpointsAgree(evidence.checkpoints, outcome.checkpoints)) {
    return reject('checkpoint-hash-mismatch', 'A checkpoint hash disagrees with the trusted replay.');
  }
  if (outcome.finalStateHash !== evidence.finalStateHash) {
    return reject('final-state-hash-mismatch', 'The final state hash disagrees with the trusted replay.');
  }
  if (!metricsAgree(evidence.claimedMetrics, outcome.metrics)) {
    return reject('metrics-mismatch', 'Claimed metrics disagree with the trusted replay.');
  }

  const rankedScore = outcome.metrics[definition.objective.metricId];
  if (rankedScore === undefined) {
    return reject('objective-metric-missing', `Replay produced no "${definition.objective.metricId}" metric.`);
  }

  return {
    status: 'verified',
    evidenceHash,
    metrics: outcome.metrics,
    rankedScore,
    replayedTick: outcome.finalTick,
  };
}

/** Only verified results may be ranked publicly (ADR 0009 ranking tiers). */
export function isPubliclyRankable(result: ChallengeVerificationResult): boolean {
  return result.status === 'verified';
}
