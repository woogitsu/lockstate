import { describe, expect, it } from 'vitest';
import {
  type ChallengeDefinition,
  type ChallengeEvidence,
  type ChallengeReplayRunner,
  authenticateChallengeDefinition,
  canonicalChallengeDefinitionJson,
  challengeDefinitionBytes,
  challengeDefinitionHash,
  challengeEvidenceHash,
  isPubliclyRankable,
  measureEvidenceBytes,
  verifyChallengeSubmission,
} from '../../src/services/challenges';
import { identifierSchema } from '../../src/simulation/protocol/types';
import type { JsonValue } from '../../src/shared/json';
import { type FieldPerturbation, fieldPerturbations, perturbField } from '../helpers/field-sensitivity';

const NOW = 1_700_000_000_000;

const definition: ChallengeDefinition = {
  schemaVersion: 1,
  id: 'challenge.first-intake',
  version: 3,
  scenarioId: 'scenario.first-intake',
  titleKey: 'challenge.first-intake.title',
  descriptionKey: 'challenge.first-intake.description',
  seed: 4242,
  objective: { metricId: 'metric.prisoners-processed', direction: 'maximize' },
  limits: { maxTicks: 1_000, maxCommands: 100, maxEvidenceBytes: 200_000, checkpointIntervalTicks: 100 },
  allowedGameVersions: ['lockstate-0.1.0'],
  allowedContentVersions: ['content-1'],
  configHash: '0123456789abcdef',
  opensAt: NOW - 86_400_000,
  closesAt: NOW + 86_400_000,
};

function buildEvidence(overrides: Partial<ChallengeEvidence> = {}): ChallengeEvidence {
  const base: ChallengeEvidence = {
    schemaVersion: 1,
    challengeId: definition.id,
    challengeVersion: definition.version,
    definitionHash: challengeDefinitionHash(definition),
    gameVersion: 'lockstate-0.1.0',
    contentVersion: 'content-1',
    configHash: definition.configHash,
    seed: definition.seed,
    finalTick: 200,
    commands: [
      { tick: 10, sequence: 1, payload: { type: 'PlaceBuildOrder' } },
      { tick: 40, sequence: 2, payload: { type: 'CancelBuildOrder' } },
    ],
    checkpoints: [
      { tick: 100, stateHash: 'aaaaaaaaaaaaaaaa' },
      { tick: 200, stateHash: 'bbbbbbbbbbbbbbbb' },
    ],
    finalStateHash: 'cccccccccccccccc',
    claimedMetrics: { 'metric.prisoners-processed': 12 },
    startedAt: NOW - 3_600_000,
    completedAt: NOW - 3_000_000,
  };
  return { ...base, ...overrides };
}

function submissionFor(evidence: ChallengeEvidence): unknown {
  return { submissionId: 'submission-1', accountId: 'account-1', submittedAt: NOW, evidence };
}

/** Agrees with whatever evidence it is given: the "honest run" baseline. */
const agreeingRunner: ChallengeReplayRunner = {
  replay: ({ evidence }) => ({
    ok: true,
    outcome: {
      finalTick: evidence.finalTick,
      finalStateHash: evidence.finalStateHash,
      checkpoints: evidence.checkpoints,
      metrics: { ...evidence.claimedMetrics },
    },
  }),
};

async function verify(evidence: ChallengeEvidence, runner?: ChallengeReplayRunner) {
  return verifyChallengeSubmission({
    submission: submissionFor(evidence),
    definition,
    accountId: 'account-1',
    now: NOW,
    ...(runner === undefined ? {} : { replayRunner: runner }),
  });
}

/**
 * One perturbed copy of the fixture per leaf field, nested fields included:
 * `limits.maxTicks`, `objective.metricId`, `allowedGameVersions[0]`,
 * `commands[1].payload.type`. Enumerated rather than named so a field added to
 * either schema later is covered by the same assertions with no edit here --
 * which is the direction that matters when the risk is a definition that "can
 * lie about its own limits and allow-lists".
 */
const definitionPerturbations = fieldPerturbations(definition as unknown as JsonValue);

const labelsOf = (perturbations: readonly FieldPerturbation[]): readonly string[] =>
  perturbations.map((perturbation) => perturbation.label);

describe('challenge definition authentication', () => {
  const signature = { algorithm: 'ed25519', keyId: 'key.challenges.2026', value: 'c2lnbmF0dXJl' } as const;
  const signed = { definition, signature };

  /** Runs the real authentication path and reports the bytes the verifier was handed. */
  async function bytesHandedToVerifier(candidate: unknown): Promise<string | undefined> {
    const seen: Uint8Array[] = [];
    const result = await authenticateChallengeDefinition(candidate, {
      verify: ({ bytes }) => {
        seen.push(bytes);
        return true;
      },
    });
    return result.ok ? new TextDecoder().decode(seen[0]) : undefined;
  }

  it('accepts a definition whose signature verifies over its canonical bytes', async () => {
    const seen: Uint8Array[] = [];
    const result = await authenticateChallengeDefinition(signed, {
      verify: ({ bytes }) => {
        seen.push(bytes);
        return true;
      },
    });

    expect(result.ok).toBe(true);
    // Kept, and never as the proof. This compares the function's output to the
    // function's own output, so it holds for *any* function of the definition
    // -- including one that discards `limits`, both allow-lists, `configHash`
    // and `seed`, which is issue #264 S1 and survived the whole suite with
    // zero delta. What it is for is the **link**: it pins the bytes the
    // verifier is handed to the exported function whose field sensitivity the
    // next test proves exhaustively, so that proof transfers across this
    // boundary instead of stopping at the module edge.
    expect(seen[0]).toEqual(challengeDefinitionBytes(definition));
  });

  it('signs bytes that change when any field of the definition changes', () => {
    // The assertion #264 S1 needed. A signature is worth exactly the fields it
    // covers: a definition whose signed bytes omit `limits.maxEvidenceBytes`
    // is a definition an attacker can re-budget and still present as
    // authentic, and every downstream check in ADR 0009 steps 3-5 reads a
    // field from it.
    const baseline = canonicalChallengeDefinitionJson(definition);

    // Positive control: the walk really descends into nested objects and into
    // array elements, which is where the lie lives. Without this, an
    // enumerator that returned only top-level keys -- or nothing at all --
    // would pass every assertion below.
    expect(labelsOf(definitionPerturbations)).toEqual(expect.arrayContaining([
      'limits.maxTicks',
      'limits.maxEvidenceBytes',
      'objective.metricId',
      'allowedGameVersions.0',
      'allowedContentVersions.0',
    ]));
    expect(definitionPerturbations.length).toBeGreaterThanOrEqual(18);

    for (const { label, perturbed } of definitionPerturbations) {
      expect(
        canonicalChallengeDefinitionJson(perturbed as unknown as ChallengeDefinition),
        `${label} does not reach the bytes the signature covers`,
      ).not.toBe(baseline);
    }

    // And that no two fields collapse onto the same document, which is what
    // dropping two fields at once looks like.
    const signedDocuments = definitionPerturbations.map(({ perturbed }) =>
      canonicalChallengeDefinitionJson(perturbed as unknown as ChallengeDefinition),
    );
    expect(new Set([baseline, ...signedDocuments]).size).toBe(definitionPerturbations.length + 1);
  });

  it('hands the verifier different bytes for every field a valid definition can differ in', async () => {
    // The same property measured across the real boundary rather than on the
    // exported function, so the link assertion above is not the only thing
    // carrying it. Perturbations that no longer parse never reach a verifier
    // at all -- `schemaVersion` is a literal, `objective.direction` an enum
    // and `configHash` a 16-hex regex -- so they are partitioned out here and
    // covered by the exhaustive test above instead of being asserted about a
    // definition the pipeline would refuse.
    const baseline = await bytesHandedToVerifier(signed);
    expect(baseline).toBeDefined();

    const authenticated: { readonly label: string; readonly bytes: string }[] = [];
    for (const { label, perturbed } of definitionPerturbations) {
      const bytes = await bytesHandedToVerifier({ definition: perturbed, signature });
      if (bytes !== undefined) authenticated.push({ label, bytes });
    }

    // Positive control: the two fields the `authenticateChallengeDefinition`
    // docstring names as what an unauthenticated definition would lie about
    // are among the ones actually carried across the boundary here.
    expect(authenticated.map((entry) => entry.label)).toEqual(expect.arrayContaining([
      'limits.maxTicks',
      'allowedGameVersions.0',
    ]));
    expect(authenticated.length).toBeGreaterThanOrEqual(15);

    for (const { label, bytes } of authenticated) {
      expect(bytes, `${label} does not reach the verifier`).not.toBe(baseline);
    }
    expect(new Set([baseline!, ...authenticated.map((entry) => entry.bytes)]).size).toBe(authenticated.length + 1);
  });

  it('rejects a definition whose signature does not verify, rather than downgrading it', async () => {
    const result = await authenticateChallengeDefinition(signed, { verify: () => false });
    expect(result).toMatchObject({ ok: false, code: 'signature-invalid' });
  });

  it('binds the hash to the definition body, so an edited field changes it', () => {
    // One field, kept for the case it names -- and not the proof. `seed` is one
    // of the three fields #264 S2's mutation *retained*, so this assertion held
    // against a `challengeDefinitionHash` reduced to `{id, version, seed}`. The
    // next test is what makes the binding a real one.
    const tampered: ChallengeDefinition = { ...definition, seed: 4243 };
    expect(challengeDefinitionHash(tampered)).not.toBe(challengeDefinitionHash(definition));
  });

  it('gives a different hash for every field of the definition body', () => {
    // Evidence carries this hash, so it is what binds a submission to the
    // definition *text* rather than to an id/version pair that could have been
    // edited in place. A hash blind to `limits` binds nothing about the budget
    // the run was played under.
    const baseline = challengeDefinitionHash(definition);
    expect(definitionPerturbations.length).toBeGreaterThanOrEqual(18);

    for (const { label, perturbed } of definitionPerturbations) {
      expect(
        challengeDefinitionHash(perturbed as unknown as ChallengeDefinition),
        `${label} does not change the definition hash`,
      ).not.toBe(baseline);
    }

    const hashes = definitionPerturbations.map(({ perturbed }) =>
      challengeDefinitionHash(perturbed as unknown as ChallengeDefinition),
    );
    expect(new Set([baseline, ...hashes]).size).toBe(definitionPerturbations.length + 1);
  });
});

describe('challenge submission verification', () => {
  it('verifies an honest submission and ranks the replay metric, not the claim', async () => {
    const runner: ChallengeReplayRunner = {
      replay: ({ evidence }) => ({
        ok: true,
        outcome: {
          finalTick: evidence.finalTick,
          finalStateHash: evidence.finalStateHash,
          checkpoints: evidence.checkpoints,
          metrics: { 'metric.prisoners-processed': 12 },
        },
      }),
    };

    const result = await verify(buildEvidence(), runner);
    expect(result.status).toBe('verified');
    if (result.status !== 'verified') return;
    expect(result.rankedScore).toBe(12);
    expect(result.evidenceHash).toBe(challengeEvidenceHash(buildEvidence()));
    expect(isPubliclyRankable(result)).toBe(true);
  });

  it('never ranks a structurally valid submission that was not replayed', async () => {
    const result = await verify(buildEvidence());
    expect(result).toMatchObject({ status: 'unverified', reason: 'replay-unavailable' });
    expect(isPubliclyRankable(result)).toBe(false);
  });

  it.each([
    ['challenge-version-mismatch', buildEvidence({ challengeVersion: 2 })],
    ['definition-hash-mismatch', buildEvidence({ definitionHash: 'ffffffffffffffff' })],
    ['build-not-allowed', buildEvidence({ gameVersion: 'lockstate-0.0.9' })],
    ['content-version-not-allowed', buildEvidence({ contentVersion: 'content-2' })],
    ['config-hash-mismatch', buildEvidence({ configHash: 'fedcba9876543210' })],
    ['seed-mismatch', buildEvidence({ seed: 1 })],
    ['challenge-mismatch', buildEvidence({ challengeId: 'challenge.other' })],
  ])('rejects incompatible evidence with %s instead of adapting it', async (code, evidence) => {
    const result = await verify(evidence, agreeingRunner);
    expect(result).toMatchObject({ status: 'rejected', code });
  });

  it('rejects a command stream that does not advance monotonically', async () => {
    const evidence = buildEvidence({
      commands: [
        { tick: 40, sequence: 2, payload: {} },
        { tick: 10, sequence: 3, payload: {} },
      ],
    });
    const result = await verify(evidence, agreeingRunner);
    expect(result).toMatchObject({ status: 'rejected', code: 'command-stream-out-of-order' });
  });

  it('rejects a stream that reuses a sequence number', async () => {
    const evidence = buildEvidence({
      commands: [
        { tick: 10, sequence: 1, payload: {} },
        { tick: 20, sequence: 1, payload: {} },
      ],
    });
    const result = await verify(evidence, agreeingRunner);
    expect(result).toMatchObject({ status: 'rejected', code: 'command-stream-out-of-order' });
  });

  it('rejects evidence exceeding the tick budget declared by the definition', async () => {
    const evidence = buildEvidence({
      finalTick: 5_000,
      checkpoints: Array.from({ length: 50 }, (_unused, index) => ({
        tick: (index + 1) * 100,
        stateHash: 'aaaaaaaaaaaaaaaa',
      })),
    });
    const result = await verify(evidence, agreeingRunner);
    expect(result).toMatchObject({ status: 'rejected', code: 'tick-budget-exceeded' });
  });

  it('rejects evidence exceeding the command budget', async () => {
    const commands = Array.from({ length: 101 }, (_unused, index) => ({
      tick: index,
      sequence: index + 1,
      payload: {},
    }));
    const result = await verify(buildEvidence({ commands }), agreeingRunner);
    expect(result).toMatchObject({ status: 'rejected', code: 'command-budget-exceeded' });
  });

  it('rejects evidence past the byte budget even when the command budget is respected', async () => {
    // The third of the three budget bounds, and the one #264 S4 found no test
    // reached: `if (evidenceBytes > …)` could be mutated to `if (false)` with
    // the whole suite green. It is a separate bound because command *count*
    // does not bound verification cost -- this stream is exactly at
    // `maxCommands` and still past `maxEvidenceBytes`, because each command
    // carries a two-kilobyte payload. Bounding the cost of accepting a
    // submission before any execution is what ADR 0009 step 4 is for, and
    // count alone cannot do it.
    const commands = Array.from({ length: definition.limits.maxCommands }, (_unused, index) => ({
      tick: index,
      sequence: index + 1,
      payload: { type: 'PlaceBuildOrder', note: 'x'.repeat(2_200) },
    }));
    const evidence = buildEvidence({ commands });

    // The premises the code under test is being asked about, asserted rather
    // than assumed: over the byte limit, inside the command and tick limits.
    // Without these the test would still pass if the fixture drifted into
    // busting a different bound, and would then be proving the wrong branch.
    expect(measureEvidenceBytes(evidence)).toBeGreaterThan(definition.limits.maxEvidenceBytes);
    expect(evidence.commands.length).toBeLessThanOrEqual(definition.limits.maxCommands);
    expect(evidence.finalTick).toBeLessThanOrEqual(definition.limits.maxTicks);

    const result = await verify(evidence, agreeingRunner);
    expect(result).toMatchObject({ status: 'rejected', code: 'evidence-too-large' });
  });

  it('rejects a command that executes after the run is claimed to have ended', async () => {
    // #264 S5: `if (lastCommand !== undefined && lastCommand.tick > evidence.finalTick)`
    // could be mutated to `if (false)` with zero delta. The stream is ordered
    // and inside every budget -- what is wrong is that it does not stop where
    // the evidence says the run stopped, so the checkpoint cadence and the
    // replay's tick count would be computed for a run shorter than the stream.
    const evidence = buildEvidence({
      commands: [
        { tick: 10, sequence: 1, payload: { type: 'PlaceBuildOrder' } },
        { tick: 250, sequence: 2, payload: { type: 'CancelBuildOrder' } },
      ],
    });

    expect(evidence.commands.at(-1)!.tick).toBeGreaterThan(evidence.finalTick);
    expect(evidence.finalTick).toBeLessThanOrEqual(definition.limits.maxTicks);

    const result = await verify(evidence, agreeingRunner);
    expect(result).toMatchObject({ status: 'rejected', code: 'command-after-final-tick' });
  });

  it('rejects evidence that omits a required checkpoint', async () => {
    const evidence = buildEvidence({ checkpoints: [{ tick: 200, stateHash: 'bbbbbbbbbbbbbbbb' }] });
    const result = await verify(evidence, agreeingRunner);
    expect(result).toMatchObject({ status: 'rejected', code: 'checkpoint-cadence-invalid' });
  });

  it('rejects a submission whose account does not match the authenticated caller', async () => {
    const result = await verifyChallengeSubmission({
      submission: { submissionId: 's', accountId: 'account-2', submittedAt: NOW, evidence: buildEvidence() },
      definition,
      accountId: 'account-1',
      now: NOW,
      replayRunner: agreeingRunner,
    });
    expect(result).toMatchObject({ status: 'rejected', code: 'account-mismatch' });
  });

  it('rejects a submission outside the challenge window', async () => {
    const result = await verifyChallengeSubmission({
      submission: submissionFor(buildEvidence()),
      definition,
      accountId: 'account-1',
      now: definition.closesAt,
      replayRunner: agreeingRunner,
    });
    expect(result).toMatchObject({ status: 'rejected', code: 'submission-window-closed' });
  });

  it('rejects evidence already submitted, so a captured run cannot be replayed by someone else', async () => {
    const result = await verifyChallengeSubmission({
      submission: submissionFor(buildEvidence()),
      definition,
      accountId: 'account-1',
      now: NOW,
      replayRunner: agreeingRunner,
      isDuplicateEvidence: () => true,
    });
    expect(result).toMatchObject({ status: 'rejected', code: 'duplicate-evidence' });
  });

  it('contradicts a claimed evidence hash that does not describe the evidence', async () => {
    const evidence = buildEvidence();
    const result = await verifyChallengeSubmission({
      submission: submissionFor(evidence),
      definition,
      accountId: 'account-1',
      now: NOW,
      replayRunner: agreeingRunner,
      // What `challenge_submissions.evidence_hash` would hold if the client
      // simply made one up -- which is all it took to bypass the unique
      // constraint before issue #105 finding 1 moved the dedup key onto a
      // server-computed digest.
      claimedEvidenceHash: 'deadbeefdeadbeef',
    });

    expect(result).toMatchObject({ status: 'rejected', code: 'evidence-hash-mismatch' });
  });

  it('accepts the claim when it does describe the evidence, and still ranks the replay', async () => {
    const evidence = buildEvidence();
    const result = await verifyChallengeSubmission({
      submission: submissionFor(evidence),
      definition,
      accountId: 'account-1',
      now: NOW,
      replayRunner: agreeingRunner,
      claimedEvidenceHash: challengeEvidenceHash(evidence),
    });

    expect(result).toMatchObject({ status: 'verified', evidenceHash: challengeEvidenceHash(evidence) });
  });

  it('leaves the claim unchecked when no claim is supplied, rather than inventing one', async () => {
    const result = await verify(buildEvidence(), agreeingRunner);
    expect(result).toMatchObject({ status: 'verified' });
  });

  it('gives a different evidence hash for every field of the evidence body', () => {
    // The assertion #264 S3 needed. This is the value `verifyChallengeSubmission`
    // recomputes to contradict `challenge_submissions.evidence_hash` (the #105
    // finding-1 fix) and the value `isDuplicateEvidence` keys on, and ADR 0009
    // says the evidence *is* the command stream -- so a hash that ignores
    // `commands` binds nothing about the part a cheater edits. Measured: with
    // `challengeEvidenceHash` reduced to hashing evidence-with-no-commands, the
    // whole suite stayed green.
    const evidence = buildEvidence();
    const perturbations = fieldPerturbations(evidence as unknown as JsonValue);
    const baseline = challengeEvidenceHash(evidence);

    // Positive control: the walk reaches inside the command stream, both the
    // ordering fields and the opaque payload.
    expect(labelsOf(perturbations)).toEqual(expect.arrayContaining([
      'commands.0.tick',
      'commands.0.sequence',
      'commands.0.payload.type',
      'commands.1.payload.type',
      'checkpoints.0.stateHash',
      'claimedMetrics.metric.prisoners-processed',
    ]));
    expect(perturbations.length).toBeGreaterThanOrEqual(23);

    for (const { label, perturbed } of perturbations) {
      expect(
        challengeEvidenceHash(perturbed as unknown as ChallengeEvidence),
        `${label} does not change the evidence hash`,
      ).not.toBe(baseline);
    }

    const hashes = perturbations.map(({ perturbed }) =>
      challengeEvidenceHash(perturbed as unknown as ChallengeEvidence),
    );
    expect(new Set([baseline, ...hashes]).size).toBe(perturbations.length + 1);
  });

  it('contradicts a claim when only a command payload was edited', async () => {
    // The same property through the pipeline rather than the hash function:
    // rewriting one command and resubmitting the honest run's hash is the
    // cheapest tamper there is, and it must not survive.
    const evidence = buildEvidence();
    const claimedEvidenceHash = challengeEvidenceHash(evidence);
    const tampered = buildEvidence({
      commands: [
        { tick: 10, sequence: 1, payload: { type: 'PlaceBuildOrder' } },
        { tick: 40, sequence: 2, payload: { type: 'PlaceBuildOrder' } },
      ],
    });

    const result = await verifyChallengeSubmission({
      submission: submissionFor(tampered),
      definition,
      accountId: 'account-1',
      now: NOW,
      replayRunner: agreeingRunner,
      claimedEvidenceHash,
    });

    expect(result).toMatchObject({ status: 'rejected', code: 'evidence-hash-mismatch' });
  });

  it('binds the claim to the evidence body: an edited field changes the hash it must match', async () => {
    const evidence = buildEvidence();
    const claimedEvidenceHash = challengeEvidenceHash(evidence);
    // One field, kept for the case it names -- and not the proof.
    // `finalStateHash` is a field #264 S3's mutation *retained*, so this
    // assertion held against an evidence hash that ignored the entire command
    // stream. The two tests above are what make the binding a real one.
    const tampered = buildEvidence({ finalStateHash: 'dddddddddddddddd' });

    expect(challengeEvidenceHash(tampered)).not.toBe(claimedEvidenceHash);
    const result = await verifyChallengeSubmission({
      submission: submissionFor(tampered),
      definition,
      accountId: 'account-1',
      now: NOW,
      replayRunner: agreeingRunner,
      claimedEvidenceHash,
    });

    expect(result).toMatchObject({ status: 'rejected', code: 'evidence-hash-mismatch' });
  });

  it('rejects a tampered final state hash: the replay disagrees', async () => {
    const runner: ChallengeReplayRunner = {
      replay: ({ evidence }) => ({
        ok: true,
        outcome: {
          finalTick: evidence.finalTick,
          finalStateHash: 'dddddddddddddddd',
          checkpoints: evidence.checkpoints,
          metrics: { ...evidence.claimedMetrics },
        },
      }),
    };
    const result = await verify(buildEvidence(), runner);
    expect(result).toMatchObject({ status: 'rejected', code: 'final-state-hash-mismatch' });
  });

  it('rejects a tampered checkpoint hash', async () => {
    const runner: ChallengeReplayRunner = {
      replay: ({ evidence }) => ({
        ok: true,
        outcome: {
          finalTick: evidence.finalTick,
          finalStateHash: evidence.finalStateHash,
          checkpoints: [
            { tick: 100, stateHash: 'eeeeeeeeeeeeeeee' },
            { tick: 200, stateHash: 'bbbbbbbbbbbbbbbb' },
          ],
          metrics: { ...evidence.claimedMetrics },
        },
      }),
    };
    const result = await verify(buildEvidence(), runner);
    expect(result).toMatchObject({ status: 'rejected', code: 'checkpoint-hash-mismatch' });
  });

  it('rejects an inflated score even when every hash matches', async () => {
    const evidence = buildEvidence({ claimedMetrics: { 'metric.prisoners-processed': 9_999 } });
    const runner: ChallengeReplayRunner = {
      replay: () => ({
        ok: true,
        outcome: {
          finalTick: 200,
          finalStateHash: 'cccccccccccccccc',
          checkpoints: evidence.checkpoints,
          metrics: { 'metric.prisoners-processed': 12 },
        },
      }),
    };
    const result = await verify(evidence, runner);
    expect(result).toMatchObject({ status: 'rejected', code: 'metrics-mismatch' });
  });

  it('refuses to rank a run whose objective metric the replay never produced', async () => {
    // #264 S6, and the one whose mutation was `tsc`-clean: replacing
    // `outcome.metrics[…]` with `outcome.metrics[…] ?? 0` compiles, drops the
    // rejection, and returns `verified` with `rankedScore: 0` -- the one tier
    // ADR 0009 makes eligible for public ranking. Every other check
    // passes here on purpose -- the hashes agree and the claimed metrics agree
    // with the replay -- so the only thing standing between this submission
    // and a `verified` row is the objective lookup.
    const evidence = buildEvidence({ claimedMetrics: { 'metric.cells-built': 7 } });
    const runner: ChallengeReplayRunner = {
      replay: () => ({
        ok: true,
        outcome: {
          finalTick: evidence.finalTick,
          finalStateHash: evidence.finalStateHash,
          checkpoints: evidence.checkpoints,
          metrics: { 'metric.cells-built': 7 },
        },
      }),
    };

    expect(Object.keys(evidence.claimedMetrics)).not.toContain(definition.objective.metricId);

    const result = await verify(evidence, runner);
    expect(result).toMatchObject({ status: 'rejected', code: 'objective-metric-missing' });
    expect(isPubliclyRankable(result)).toBe(false);
  });

  it('reports a failed replay distinctly from a disagreement', async () => {
    const result = await verify(buildEvidence(), { replay: () => ({ ok: false, reason: 'unknown command type' }) });
    expect(result).toMatchObject({ status: 'rejected', code: 'replay-failed' });
  });

  it('rejects a malformed submission before any replay is attempted', async () => {
    let replayed = false;
    const result = await verifyChallengeSubmission({
      submission: { submissionId: 'submission-1', accountId: 'account-1', submittedAt: NOW },
      definition,
      accountId: 'account-1',
      now: NOW,
      replayRunner: {
        replay: () => {
          replayed = true;
          return { ok: false, reason: 'should not run' };
        },
      },
    });
    expect(result).toMatchObject({ status: 'rejected', code: 'invalid-shape' });
    expect(replayed).toBe(false);
  });
});

/**
 * The field-sensitivity walk is the pattern every assertion above depends on,
 * and a pattern that quietly stops matching leaves a green suite and no guard.
 * So it is exercised against fixtures in both directions here, the same split
 * `canonical-iteration-contract.test.ts` uses with its own scanner: an
 * enumerator that returned `[]`, or one that stopped descending into arrays,
 * would satisfy every `not.toBe(baseline)` loop above by having nothing to
 * loop over. The positive controls in those tests are the other half of this.
 */
describe('the field-sensitivity walk enumerates what it claims to', () => {
  const nested: JsonValue = {
    limits: { maxTicks: 1_000, maxCommands: 100 },
    allowed: ['a', 'b'],
    commands: [{ tick: 1, payload: { type: 'X' } }],
    flag: true,
    absent: null,
  };

  it('reaches leaves inside objects and inside array elements, not the containers', () => {
    expect(labelsOf(fieldPerturbations(nested))).toEqual([
      'absent',
      'allowed.0',
      'allowed.1',
      'commands.0.payload.type',
      'commands.0.tick',
      'flag',
      'limits.maxCommands',
      'limits.maxTicks',
    ]);
  });

  it('treats an empty container as a leaf, so an empty field is not silently uncovered', () => {
    const empties: JsonValue = { commands: [], meta: {} };
    expect(labelsOf(fieldPerturbations(empties))).toEqual(['commands', 'meta']);
    expect(fieldPerturbations(empties).map(({ perturbed }) => perturbed)).toEqual([
      { commands: [0], meta: {} },
      { commands: [], meta: { perturbed: 0 } },
    ]);
  });

  it('changes exactly one leaf per perturbation, keeping its JSON kind', () => {
    const byLabel = new Map(fieldPerturbations(nested).map((entry) => [entry.label, entry.perturbed]));

    expect(byLabel.get('limits.maxTicks')).toEqual({ ...nested, limits: { maxTicks: 1_001, maxCommands: 100 } });
    expect(byLabel.get('allowed.1')).toEqual({ ...nested, allowed: ['a', 'b-x'] });
    expect(byLabel.get('commands.0.payload.type')).toEqual({
      ...nested,
      commands: [{ tick: 1, payload: { type: 'X-x' } }],
    });
    expect(byLabel.get('flag')).toEqual({ ...nested, flag: false });
    expect(byLabel.get('absent')).toEqual({ ...nested, absent: 0 });
  });

  it('perturbs a string into one an identifier field still accepts', () => {
    // The claim the boundary test above rests on: a perturbed
    // `identifierSchema` field must still parse, or it would drop out of the
    // authenticated partition and quietly stop being covered there.
    expect(identifierSchema.safeParse('challenge.first-intake-x').success).toBe(true);
    expect(identifierSchema.safeParse('lockstate-0.1.0-x').success).toBe(true);
  });

  it('refuses a path that addresses nothing, rather than inventing a field', () => {
    expect(() => perturbField(nested, ['limits', 'nope'])).toThrow(/does not address a key/);
    expect(() => perturbField(nested, ['allowed', 9])).toThrow(/does not address an element/);
    expect(() => perturbField(nested, ['flag', 'deeper'])).toThrow(/has no fields/);
  });
});
