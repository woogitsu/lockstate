import { z } from 'zod';
import { canonicalJson, deterministicStateHash } from '../../simulation/determinism/canonical';
import {
  type DeepReadonly,
  identifierSchema,
  jsonValueSchema,
  sequenceSchema,
  tickSchema,
} from '../../simulation/protocol/types';
import type { JsonValue } from '../../shared/json';
import { contentHashSchema, masterSeedSchema } from './challenge';

/**
 * Evidence is the *command stream*, not the outcome (ADR 0009). The
 * claimed metrics travel with it only so the verifier can contradict them;
 * ranking uses what the replay produces.
 */
export const CHALLENGE_EVIDENCE_SCHEMA_VERSION = 1 as const;

/**
 * Deliberately generic (`jsonValueSchema`), not
 * `simulationCommandSchema`: the trusted boundary validates *shape,
 * ordering and budget*, while the meaning of a payload is decoded by the
 * replay runner using the same protocol decoder the worker uses
 * (src/simulation/protocol/decode.ts). Pinning the command union here
 * would break every stored submission each time a command type is added,
 * without adding any security -- an attacker controls the payload either
 * way, and the replay is what rejects a nonsensical one.
 */
export const evidenceCommandSchema = z
  .object({ tick: tickSchema, sequence: sequenceSchema, payload: jsonValueSchema })
  .strict();
export type EvidenceCommand = DeepReadonly<z.infer<typeof evidenceCommandSchema>>;

export const evidenceCheckpointSchema = z.object({ tick: tickSchema, stateHash: contentHashSchema }).strict();
export type EvidenceCheckpoint = DeepReadonly<z.infer<typeof evidenceCheckpointSchema>>;

/**
 * Structural ceilings that bound parse cost before the definition's own
 * (usually much smaller) limits are applied. A submission larger than this
 * is rejected without allocating the whole object graph's worth of checks.
 */
const MAX_EVIDENCE_COMMANDS = 200_000;
const MAX_EVIDENCE_CHECKPOINTS = 10_000;
const MAX_EVIDENCE_METRICS = 64;

export const challengeEvidenceSchema = z
  .object({
    schemaVersion: z.literal(CHALLENGE_EVIDENCE_SCHEMA_VERSION),
    challengeId: identifierSchema,
    challengeVersion: z.number().int().min(1),
    /** Binds the run to the exact definition text, not just its id/version. */
    definitionHash: contentHashSchema,
    gameVersion: identifierSchema,
    contentVersion: identifierSchema,
    configHash: contentHashSchema,
    seed: masterSeedSchema,
    finalTick: tickSchema,
    commands: z.array(evidenceCommandSchema).max(MAX_EVIDENCE_COMMANDS),
    checkpoints: z.array(evidenceCheckpointSchema).max(MAX_EVIDENCE_CHECKPOINTS),
    finalStateHash: contentHashSchema,
    /** What the client thinks it scored. Never ranked; only compared. */
    claimedMetrics: z.record(identifierSchema, z.number().finite()),
    startedAt: z.number().int().min(0),
    completedAt: z.number().int().min(0),
  })
  .strict()
  .superRefine((evidence, ctx) => {
    if (evidence.completedAt < evidence.startedAt) {
      ctx.addIssue({ code: 'custom', message: 'completedAt must not precede startedAt.', path: ['completedAt'] });
    }
    if (Object.keys(evidence.claimedMetrics).length > MAX_EVIDENCE_METRICS) {
      ctx.addIssue({ code: 'custom', message: 'Too many claimed metrics.', path: ['claimedMetrics'] });
    }
  });
export type ChallengeEvidence = DeepReadonly<z.infer<typeof challengeEvidenceSchema>>;

export const challengeSubmissionSchema = z
  .object({
    submissionId: identifierSchema,
    /** Server-side truth is the authenticated caller; this must match it (ADR 0008 step 2). */
    accountId: identifierSchema,
    submittedAt: z.number().int().min(0),
    evidence: challengeEvidenceSchema,
  })
  .strict();
export type ChallengeSubmission = DeepReadonly<z.infer<typeof challengeSubmissionSchema>>;

/**
 * Stable identity of one run's evidence: identical evidence hashes to the
 * same value regardless of key order or resubmission.
 *
 * It is NOT the database's dedup key, and was never able to be one. The
 * value a submission carries in `challenge_submissions.evidence_hash` is
 * caller-asserted, and the unique constraint that implements ADR 0008
 * threat T3 was keyed on it until issue #105 finding 1 -- which meant
 * lying about the hash created a second ranked row for the same run. The
 * key is now `challenge_submissions.evidence_digest`, a stored generated
 * column the server computes over the payload
 * (`supabase/migrations/20260824100000_bind_challenge_evidence_to_payload.sql`).
 *
 * What this function is for is the other half of that fix: recomputing the
 * claim so `verifyChallengeSubmission` can contradict it
 * (`claimedEvidenceHash`), and answering the verifier's own
 * `isDuplicateEvidence` port. The two hashes deliberately do not agree --
 * canonical JSON here, `jsonb` there -- and the SQL side says why.
 */
export function challengeEvidenceHash(evidence: ChallengeEvidence): string {
  return deterministicStateHash(evidence as unknown as JsonValue);
}

/** Serialized size in bytes, measured the same way the transport will measure it. */
export function measureEvidenceBytes(evidence: ChallengeEvidence): number {
  return new TextEncoder().encode(canonicalJson(evidence as unknown as JsonValue)).length;
}
