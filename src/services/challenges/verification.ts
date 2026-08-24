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
