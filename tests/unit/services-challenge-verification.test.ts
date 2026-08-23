import { describe, expect, it } from 'vitest';
import {
  type ChallengeDefinition,
  type ChallengeEvidence,
  type ChallengeReplayRunner,
  authenticateChallengeDefinition,
  challengeDefinitionBytes,
  challengeDefinitionHash,
  challengeEvidenceHash,
  isPubliclyRankable,
  verifyChallengeSubmission,
} from '../../src/services/challenges';

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

describe('challenge definition authentication', () => {
  const signed = {
    definition,
    signature: { algorithm: 'ed25519', keyId: 'key.challenges.2026', value: 'c2lnbmF0dXJl' },
  };

  it('accepts a definition whose signature verifies over its canonical bytes', async () => {
    const seen: Uint8Array[] = [];
    const result = await authenticateChallengeDefinition(signed, {
      verify: ({ bytes }) => {
        seen.push(bytes);
        return true;
      },
    });

    expect(result.ok).toBe(true);
    expect(seen[0]).toEqual(challengeDefinitionBytes(definition));
  });

  it('rejects a definition whose signature does not verify, rather than downgrading it', async () => {
    const result = await authenticateChallengeDefinition(signed, { verify: () => false });
    expect(result).toMatchObject({ ok: false, code: 'signature-invalid' });
  });

  it('binds the hash to the definition body, so an edited field changes it', () => {
    const tampered: ChallengeDefinition = { ...definition, seed: 4243 };
    expect(challengeDefinitionHash(tampered)).not.toBe(challengeDefinitionHash(definition));
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
