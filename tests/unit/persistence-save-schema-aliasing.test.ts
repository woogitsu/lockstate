import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, decodeSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import type { JsonValue } from '../../src/shared/json';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';

/**
 * These tests pin that a parsed payload's interior is detached from both the
 * caller's objects and the live simulation -- the property `markTrusted`'s
 * comment has always asserted, and which the code did not have until #106.
 *
 * The mechanism, because it is not obvious and will be met again: Zod rebuilds
 * every `z.object`/`z.array`/`z.tuple`/primitive node, but `jsonValueSchema` is
 * `z.custom`, which validates by *predicate* and returns its input **by
 * reference**. So a payload aliased its input at exactly its `jsonValue`
 * fields -- here `payload.kernel.commands[].payload`, and nowhere else.
 * `detachedJsonValueSchema` in `save-schema.ts` now clones that field.
 *
 * These tests were written the other way round first, pinning the aliasing as
 * the true-but-uncomfortable behaviour (#105/#164), precisely so that a later
 * change to detach would fail them and force this comment to be rewritten in
 * the same commit. That is what happened: the four assertions below are the
 * inverted versions of the four that failed.
 *
 * What is **not** asserted, because it is not true and never was: that an
 * envelope's interior is immutable to whoever holds the envelope. Detachment
 * is not a deep freeze -- #49 rejected that on cost -- so `checksum` remains a
 * statement about the payload at the moment this module vouched for it.
 * `tests/unit/persistence-save-schema.test.ts` pins that narrower promise, and
 * `tests/perf/persistence-decode-aliasing.perf.ts` carries the measurement
 * that made the narrow clone affordable and a wider one not.
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

describe('decodeSaveEnvelope: nothing in the result is reachable from the input', () => {
  it('returns a command-payload object of its own, not the caller’s', () => {
    const { envelope } = buildEnvelopeWithQueuedCommand({ note: 'original' });
    const input = JSON.parse(JSON.stringify(envelope)) as SaveEnvelope;

    const decoded = decodeSaveEnvelope(input);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    // Identity, not equality: equal contents were never the question.
    expect(queuedCommandPayload(decoded.value)).not.toBe(queuedCommandPayload(input));
    expect(queuedCommandPayload(decoded.value)).toEqual(queuedCommandPayload(input));

    // The nodes Zod rebuilt on its own, so this test fails if the clone is the
    // only thing keeping the payload detached and Zod's own copying regresses.
    expect(decoded.value).not.toBe(input);
    expect(decoded.value.payload).not.toBe(input.payload);
    expect(decoded.value.payload.world).not.toBe(input.payload.world);
    expect(decoded.value.payload.kernel).not.toBe(input.payload.kernel);
    expect(decoded.value.payload.kernel.commands[0]).not.toBe(input.payload.kernel.commands[0]);
  });

  it('keeps the decoded envelope’s checksum valid when the caller mutates what it passed in', () => {
    const { envelope } = buildEnvelopeWithQueuedCommand({ note: 'original' });
    const input = JSON.parse(JSON.stringify(envelope)) as SaveEnvelope;

    const decoded = decodeSaveEnvelope(input);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.checksum).toBe(computeSaveChecksum(decoded.value.payload as JsonValue));

    // #106's demonstration, inverted. This write used to reach inside a
    // *trusted* envelope and leave its frozen checksum describing a payload
    // that no longer existed; the envelope is shallow-frozen, so nothing
    // blocks the write itself -- what changed is that it lands nowhere.
    queuedCommandPayload(input).note = 'mutated after decode';

    expect(queuedCommandPayload(decoded.value).note).toBe('original');
    expect(decoded.value.checksum).toBe(computeSaveChecksum(decoded.value.payload as JsonValue));
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

describe('createSaveEnvelope: a composed envelope holds no reference to live runtime state', () => {
  it('does not share a queued command’s payload object with the live kernel', () => {
    const livePayload: Record<string, unknown> = { note: 'live' };
    const { envelope, kernel } = buildEnvelopeWithQueuedCommand(livePayload as JsonValue);

    // This is the alias `markTrusted`'s comment denied most directly.
    // `Kernel.snapshot()` shallow-copies each command (`{ ...c }`), so the
    // payload object inside the "snapshot" *is* the one the command queue still
    // holds -- the kernel is not the thing that detaches it, and the assertion
    // below confirms the queue still holds the original.
    expect(kernel.snapshot().commands[0]?.payload).toBe(livePayload);

    expect(queuedCommandPayload(envelope)).not.toBe(livePayload);
    expect(queuedCommandPayload(envelope)).toEqual(livePayload);
  });

  it('keeps a composed envelope’s checksum valid when the simulation runs on', () => {
    const livePayload: Record<string, unknown> = { note: 'live' };
    const { envelope } = buildEnvelopeWithQueuedCommand(livePayload as JsonValue);
    expect(envelope.checksum).toBe(computeSaveChecksum(envelope.payload as JsonValue));

    livePayload.note = 'mutated by the simulation after the save was composed';

    expect(envelope.checksum).toBe(computeSaveChecksum(envelope.payload as JsonValue));
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

/**
 * #106's *second* surviving mutation, and the one the tests above cannot
 * reach: "make any future payload section `jsonValueSchema` -- still green."
 *
 * The assertions above pin the one field that exists today. They say nothing
 * about a field added tomorrow, and a new `jsonValue`-typed payload section
 * would widen a closed one-field hole back into an aliased subtree with the
 * whole suite green -- which is exactly how the original defect survived. So
 * this is a rule about the schema module rather than about a value.
 *
 * Narrow on purpose: it reads one file, and only object-literal *field*
 * positions in it, so `detachedJsonValueSchema`'s own definition and the
 * import are not matches. Everywhere else in the repository is free to use the
 * pass-through schema -- `versionedPayloadSchema.data` and
 * `src/services/challenges/evidence.ts` both do, correctly, because neither is
 * covered by a checksum this module vouches for.
 */
describe('no payload field in save-schema.ts uses the pass-through jsonValueSchema', () => {
  const source = readFileSync(join(__dirname, '../../src/persistence/save-schema.ts'), 'utf8')
    // Comments removed, so the prose explaining this rule is not a violation
    // of it -- both `markTrusted` and `detachedJsonValueSchema` discuss the
    // schema by name at length.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('uses detachedJsonValueSchema for every jsonValue-typed field', () => {
    const passThroughFields = [...source.matchAll(/\b(\w+)\s*:\s*jsonValueSchema\b/g)].map((match) => match[1]);
    expect(
      passThroughFields,
      'a payload field typed `jsonValueSchema` aliases its input by reference (#106): use `detachedJsonValueSchema`',
    ).toEqual([]);
  });

  it('still has a field using detachedJsonValueSchema, so the rule above is not vacuous', () => {
    // Without this, deleting `queuedCommandSchema.payload` entirely -- or
    // renaming the detaching schema -- would satisfy the assertion above while
    // removing the thing it protects.
    expect([...source.matchAll(/\b\w+\s*:\s*detachedJsonValueSchema\b/g)].length).toBeGreaterThan(0);
  });
});
