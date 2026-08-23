import { z } from 'zod';
import { canonicalJson, deterministicStateHash } from '../../simulation/determinism/canonical';
import { type DeepReadonly, identifierSchema, tickSchema } from '../../simulation/protocol/types';
import type { JsonValue } from '../../shared/json';

/**
 * Challenge definitions are the *trusted* half of the challenge contract
 * (ADR 0008 zone Z2 publishes, ADR 0009 verifies): the server publishes a
 * signed definition, and every client -- including an offline one --
 * verifies that signature before playing or displaying it. Nothing here
 * trusts the client; the point is the reverse, letting the client detect a
 * tampered or substituted definition.
 */
export const CHALLENGE_DEFINITION_SCHEMA_VERSION = 1 as const;

/** Same shape as `computeSaveChecksum`/`deterministicStateHash` output (16 lowercase hex). */
export const contentHashSchema = z.string().regex(/^[0-9a-f]{16}$/);

/** Master seeds are uint32 (`deriveXoshiroState`, src/simulation/rng/seed.ts). */
export const masterSeedSchema = z.number().int().min(0).max(0xffff_ffff);

export const challengeObjectiveSchema = z
  .object({
    /** Stable metric id produced by the replay runner, never a translated label (ADR 0011). */
    metricId: identifierSchema,
    direction: z.enum(['maximize', 'minimize']),
  })
  .strict();
export type ChallengeObjective = DeepReadonly<z.infer<typeof challengeObjectiveSchema>>;

/**
 * Verification cost is bounded by the *definition*, not by what a
 * submitter happens to send (ADR 0009 step 4): these limits are known
 * before anyone plays, so the worst-case cost of accepting a submission is
 * known before anyone submits.
 *
 * The maxima below are conservative structural ceilings, not benchmarked
 * budgets -- issue #36 requires evidence sizes and replay times to be
 * measured against real scenarios (#33) before a real budget is set.
 */
export const challengeLimitsSchema = z
  .object({
    maxTicks: z.number().int().positive().max(2_000_000),
    maxCommands: z.number().int().positive().max(200_000),
    maxEvidenceBytes: z.number().int().positive().max(8_000_000),
    /** A canonical state hash must be present at every multiple of this tick count. */
    checkpointIntervalTicks: z.number().int().positive().max(100_000),
  })
  .strict();
export type ChallengeLimits = DeepReadonly<z.infer<typeof challengeLimitsSchema>>;

export const challengeDefinitionSchema = z
  .object({
    schemaVersion: z.literal(CHALLENGE_DEFINITION_SCHEMA_VERSION),
    id: identifierSchema,
    /**
     * Bumped whenever anything that can change a replay's outcome changes.
     * Evidence declares the version it played; a mismatch is a rejection,
     * never a best-effort adaptation.
     */
    version: z.number().int().min(1),
    scenarioId: identifierSchema,
    titleKey: identifierSchema,
    descriptionKey: identifierSchema,
    seed: masterSeedSchema,
    objective: challengeObjectiveSchema,
    limits: challengeLimitsSchema,
    /** Allow-lists, not ranges: a build is eligible only if it was explicitly admitted. */
    allowedGameVersions: z.array(identifierSchema).min(1).max(64),
    allowedContentVersions: z.array(identifierSchema).min(1).max(64),
    /** Hash of the simulation configuration the scenario runs under. */
    configHash: contentHashSchema,
    opensAt: z.number().int().min(0),
    /** Exclusive: a submission at exactly `closesAt` is late. */
    closesAt: z.number().int().min(0),
  })
  .strict()
  .superRefine((definition, ctx) => {
    if (definition.closesAt <= definition.opensAt) {
      ctx.addIssue({ code: 'custom', message: 'closesAt must be after opensAt.', path: ['closesAt'] });
    }
  });
export type ChallengeDefinition = DeepReadonly<z.infer<typeof challengeDefinitionSchema>>;

export const challengeSignatureSchema = z
  .object({
    algorithm: z.literal('ed25519'),
    keyId: identifierSchema,
    /** Base64; validated by the verifier, not re-implemented here. */
    value: z.string().min(1).max(512),
  })
  .strict();
export type ChallengeSignature = DeepReadonly<z.infer<typeof challengeSignatureSchema>>;

export const signedChallengeDefinitionSchema = z
  .object({ definition: challengeDefinitionSchema, signature: challengeSignatureSchema })
  .strict();
export type SignedChallengeDefinition = DeepReadonly<z.infer<typeof signedChallengeDefinitionSchema>>;

/**
 * Exactly the bytes that are signed and hashed. Canonical JSON (stable key
 * order, `canonicalJson`) rather than `JSON.stringify`, so a definition
 * that round-trips through any JSON layer still verifies.
 */
export function canonicalChallengeDefinitionJson(definition: ChallengeDefinition): string {
  return canonicalJson(definition as unknown as JsonValue);
}

export function challengeDefinitionBytes(definition: ChallengeDefinition): Uint8Array {
  return new TextEncoder().encode(canonicalChallengeDefinitionJson(definition));
}

/**
 * Identifies a definition's exact content. Evidence carries this hash, so
 * a submission is bound to the definition text it was played against --
 * not merely to an id/version pair that could have been edited in place.
 */
export function challengeDefinitionHash(definition: ChallengeDefinition): string {
  return deterministicStateHash(definition as unknown as JsonValue);
}

/**
 * Signature verification is a port, not an implementation: real
 * verification is `crypto.subtle.verify` with a published public key on
 * the client and the platform's crypto on the server. Writing an Ed25519
 * implementation here would be both a correctness risk and a dependency
 * we do not need (AGENTS.md).
 */
export interface ChallengeDefinitionSignatureVerifier {
  verify(input: {
    readonly bytes: Uint8Array;
    readonly algorithm: ChallengeSignature['algorithm'];
    readonly keyId: string;
    readonly signature: string;
  }): Promise<boolean> | boolean;
}

export type ChallengeDefinitionAuthenticationResult =
  | { readonly ok: true; readonly definition: ChallengeDefinition; readonly definitionHash: string }
  | { readonly ok: false; readonly code: 'invalid-shape' | 'signature-invalid'; readonly message: string };

/**
 * Decodes and authenticates a published definition. Fails closed: a
 * definition whose signature cannot be verified is unusable, never
 * "usable but unranked" -- an unauthenticated definition can lie about its
 * own limits and allow-lists, which is exactly what the checks downstream
 * depend on.
 */
export async function authenticateChallengeDefinition(
  input: unknown,
  verifier: ChallengeDefinitionSignatureVerifier,
): Promise<ChallengeDefinitionAuthenticationResult> {
  const parsed = signedChallengeDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid-shape',
      message: parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; '),
    };
  }

  const definition = parsed.data.definition as ChallengeDefinition;
  const verified = await verifier.verify({
    bytes: challengeDefinitionBytes(definition),
    algorithm: parsed.data.signature.algorithm,
    keyId: parsed.data.signature.keyId,
    signature: parsed.data.signature.value,
  });
  if (!verified) {
    return { ok: false, code: 'signature-invalid', message: 'Challenge definition signature did not verify.' };
  }

  return { ok: true, definition, definitionHash: challengeDefinitionHash(definition) };
}

/** Ticks at which evidence must carry a checkpoint hash, derived from the definition alone. */
export function expectedCheckpointTicks(limits: ChallengeLimits, finalTick: number): readonly number[] {
  const parsedFinalTick = tickSchema.parse(finalTick);
  const ticks: number[] = [];
  for (let tick = limits.checkpointIntervalTicks; tick <= parsedFinalTick; tick += limits.checkpointIntervalTicks) {
    ticks.push(tick);
  }
  return ticks;
}
