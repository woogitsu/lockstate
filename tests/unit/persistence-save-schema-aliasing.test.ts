import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, decodeSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import type { JsonValue } from '../../src/shared/json';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';

/**
 * These tests pin the **actual** aliasing behaviour of the save schema, true
 * or comfortable or not, because the defect #105 found here was a comment
 * that described behaviour the code does not have: `markTrusted` claimed "the
 * payload's interior is already detached from live runtime state (Zod's parse
 * returns a fresh value)", which is false for `jsonValueSchema` fields.
 *
 * `jsonValueSchema` is `z.custom`, so it validates by predicate and returns
 * its input **by reference**. A test that asserts what the code really does
 * is the only thing that stops the comment and the code drifting apart again:
 * if a later change makes the schema copy, these tests fail and whoever makes
 * that change must update the comment in the same commit.
 *
 * Nothing here endorses the aliasing. It is hardening, not a live defect --
 * no caller today decodes a value it retains -- and the reasoning, including
 * what a copy would cost, is in `markTrusted`'s header, docs/PERSISTENCE.md
 * and tests/perf/persistence-decode-aliasing.perf.ts.
 */

const COMMAND_ID = 'test/aliasing';

function buildEnvelopeWithQueuedCommand(commandPayload: JsonValue): {
  readonly envelope: SaveEnvelope;
  readonly kernel: Kernel;
} {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel();
  kernel.registerSystem(construction);
  kernel.submitCommand(COMMAND_ID, 0, 5, commandPayload);

  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'prison-aliasing',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    kernel: kernel.snapshot(),
    world: world.snapshot(),
    construction: construction.snapshot(),
  });

  return { envelope, kernel };
}

function queuedCommandPayload(envelope: SaveEnvelope): Record<string, unknown> {
  const command = envelope.payload.kernel.commands.find((entry) => entry.id === COMMAND_ID);
  expect(command).toBeDefined();
  return command?.payload as Record<string, unknown>;
}

describe('decodeSaveEnvelope: jsonValue fields alias the caller’s objects', () => {
  it('returns the caller’s own command-payload object, by reference', () => {
    const { envelope } = buildEnvelopeWithQueuedCommand({ note: 'original' });
    const input = JSON.parse(JSON.stringify(envelope)) as SaveEnvelope;

    const decoded = decodeSaveEnvelope(input);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    // The aliasing claim, stated as identity rather than equality.
    expect(queuedCommandPayload(decoded.value)).toBe(queuedCommandPayload(input));

    // Everything Zod rebuilds is *not* shared, which is what makes the
    // jsonValue fields the exception rather than the rule.
    expect(decoded.value).not.toBe(input);
    expect(decoded.value.payload).not.toBe(input.payload);
    expect(decoded.value.payload.world).not.toBe(input.payload.world);
    expect(decoded.value.payload.kernel).not.toBe(input.payload.kernel);
    expect(decoded.value.payload.kernel.commands[0]).not.toBe(input.payload.kernel.commands[0]);
  });

  it('lets a caller that retains its input invalidate the decoded envelope’s checksum', () => {
    const { envelope } = buildEnvelopeWithQueuedCommand({ note: 'original' });
    const input = JSON.parse(JSON.stringify(envelope)) as SaveEnvelope;

    const decoded = decodeSaveEnvelope(input);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.checksum).toBe(computeSaveChecksum(decoded.value.payload as JsonValue));

    // #105's demonstration: mutate the input after decoding, and the trusted
    // envelope's frozen checksum no longer describes its own payload. The
    // envelope is shallow-frozen, so this write is not blocked.
    queuedCommandPayload(input).note = 'mutated after decode';

    expect(queuedCommandPayload(decoded.value).note).toBe('mutated after decode');
    expect(decoded.value.checksum).not.toBe(computeSaveChecksum(decoded.value.payload as JsonValue));
  });

  it('rebuilds the rest of the payload, so mutating a non-jsonValue field afterwards changes nothing', () => {
    const { envelope } = buildEnvelopeWithQueuedCommand({ note: 'original' });
    const input = JSON.parse(JSON.stringify(envelope)) as SaveEnvelope;

    const decoded = decodeSaveEnvelope(input);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    (input.payload.world as { chunkSize: number }).chunkSize = 8;
    expect(decoded.value.payload.world.chunkSize).toBe(32);
    expect(decoded.value.checksum).toBe(computeSaveChecksum(decoded.value.payload as JsonValue));
  });
});

describe('createSaveEnvelope: a composed envelope aliases live runtime state', () => {
  it('shares a queued command’s payload object with the live kernel', () => {
    const livePayload: Record<string, unknown> = { note: 'live' };
    const { envelope, kernel } = buildEnvelopeWithQueuedCommand(livePayload as JsonValue);

    // `Kernel.snapshot()` shallow-copies each command (`{ ...c }`), so the
    // payload object inside the "snapshot" is the one the command queue still
    // holds, and `jsonValueSchema` passes it through untouched.
    expect(queuedCommandPayload(envelope)).toBe(livePayload);
    expect(queuedCommandPayload(envelope)).toBe(kernel.snapshot().commands[0]?.payload);
  });

  it('lets the live simulation invalidate a composed envelope’s checksum', () => {
    const livePayload: Record<string, unknown> = { note: 'live' };
    const { envelope } = buildEnvelopeWithQueuedCommand(livePayload as JsonValue);
    expect(envelope.checksum).toBe(computeSaveChecksum(envelope.payload as JsonValue));

    livePayload.note = 'mutated by the simulation after the save was composed';

    expect(envelope.checksum).not.toBe(computeSaveChecksum(envelope.payload as JsonValue));
  });

  it('detaches everything else: the envelope survives further live world edits', () => {
    const world = new SparseWorld(32);
    world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
    const construction = new ConstructionSystem(world);
    const kernel = new Kernel();
    kernel.registerSystem(construction);

    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'prison-aliasing',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      kernel: kernel.snapshot(),
      world: world.snapshot(),
      construction: construction.snapshot(),
    });
    const ownedChunksAtSave = envelope.payload.world.ownedChunks.length;

    world.setOwned({ x: chunkCoordinate(1), y: chunkCoordinate(0) }, true);

    expect(envelope.payload.world.ownedChunks.length).toBe(ownedChunksAtSave);
    expect(envelope.checksum).toBe(computeSaveChecksum(envelope.payload as JsonValue));
  });
});
