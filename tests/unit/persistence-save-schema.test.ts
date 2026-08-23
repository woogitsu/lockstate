import { describe, expect, it } from 'vitest';
import {
  SAVE_SCHEMA_VERSION,
  createSaveEnvelope,
  decodeSaveEnvelope,
  decodeSaveEnvelopeUnlessTrusted,
  isTrustedSaveEnvelope,
  type SaveEnvelope,
  type SaveEnvelopeV1,
  type TrustedSaveEnvelope,
} from '../../src/persistence/save-schema';
import { estimateSaveEnvelopeByteSize } from '../../src/persistence/size';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import freshPrisonFixture from '../fixtures/persistence/save-v1-fresh-prison.json';
import inProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

const FIXTURES = [
  { name: 'fresh prison', fixture: freshPrisonFixture },
  { name: 'in-progress prison', fixture: inProgressFixture },
];

describe('save envelope: checked-in V1 fixtures', () => {
  for (const { name, fixture } of FIXTURES) {
    it(`decodes the checked-in "${name}" fixture, migrating it forward`, () => {
      const result = decodeSaveEnvelope(fixture);
      expect(result).toMatchObject({ ok: true, migrated: true });
      if (result.ok) {
        expect(result.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
      }
    });

    it(`decodes the "${name}" fixture identically before and after a JSON round trip`, () => {
      const direct = decodeSaveEnvelope(fixture);
      const roundTripped = decodeSaveEnvelope(JSON.parse(JSON.stringify(fixture)) as unknown);
      expect(direct.ok).toBe(true);
      expect(roundTripped.ok).toBe(true);
      if (!direct.ok || !roundTripped.ok) return;
      expect(roundTripped.value).toStrictEqual(direct.value);
    });

    it(`leaves the checked-in "${name}" fixture object untouched while decoding it`, () => {
      // The fixture files are the migration contract's evidence; decoding one
      // must never rewrite it in place, or a later test would be asserting
      // against a fixture this test had already upgraded.
      const before = JSON.stringify(fixture);
      expect(decodeSaveEnvelope(fixture).ok).toBe(true);
      expect(JSON.stringify(fixture)).toBe(before);
      expect(fixture.saveSchemaVersion).toBe(1);
    });

    it(`reports a representative byte size for the "${name}" fixture`, () => {
      const result = decodeSaveEnvelope(fixture);
      if (!result.ok) throw new Error('fixture must decode for this test to be meaningful');
      const size = estimateSaveEnvelopeByteSize(result.value);
      expect(size).toBeGreaterThan(0);
      expect(size).toBe(new TextEncoder().encode(JSON.stringify(result.value)).length);
    });
  }
});

describe('save envelope V1: checksum', () => {
  it('is stable across equivalent key insertion order', () => {
    const a = { b: 2, a: 1, world: { z: 1, a: 2 } };
    const b = { a: 1, world: { a: 2, z: 1 }, b: 2 };
    const kernel = new Kernel();
    const world = new SparseWorld(32);
    world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
    const construction = new ConstructionSystem(world);

    const envelopeA = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'prison-a',
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
      kernel: { ...kernel.snapshot(), commands: [{ id: 'cmd', sequence: 0, executeAtTick: 0, payload: a }] },
      world: world.snapshot(),
      construction: construction.snapshot(),
    });
    const envelopeB = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'prison-a',
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
      kernel: { ...kernel.snapshot(), commands: [{ id: 'cmd', sequence: 0, executeAtTick: 0, payload: b }] },
      world: world.snapshot(),
      construction: construction.snapshot(),
    });

    expect(envelopeA.checksum).toBe(envelopeB.checksum);
  });

  it('detects a checksum mismatch as corruption, distinct from a shape error', () => {
    const tampered: SaveEnvelopeV1 = {
      ...(freshPrisonFixture as unknown as SaveEnvelopeV1),
      checksum: '0000000000000000',
    };
    const result = decodeSaveEnvelope(tampered);
    expect(result).toMatchObject({ ok: false, error: { code: 'checksum-mismatch' } });
  });

  it('detects a payload edited without recomputing the checksum', () => {
    const tampered = JSON.parse(JSON.stringify(inProgressFixture)) as { payload: { kernel: { tick: number } } };
    tampered.payload.kernel.tick += 1;
    const result = decodeSaveEnvelope(tampered);
    expect(result).toMatchObject({ ok: false, error: { code: 'checksum-mismatch' } });
  });
});

describe('save envelope V1: error taxonomy', () => {
  it('rejects a non-object input as an invalid shape', () => {
    expect(decodeSaveEnvelope(null)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
    expect(decodeSaveEnvelope('not a save')).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
    expect(decodeSaveEnvelope(undefined)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });

  it('rejects a save with no saveSchemaVersion field as an invalid shape', () => {
    const { saveSchemaVersion: _omitted, ...rest } = freshPrisonFixture;
    expect(decodeSaveEnvelope(rest)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });

  it('rejects a truncated save (missing required payload fields) as an invalid shape', () => {
    const truncated = JSON.parse(JSON.stringify(freshPrisonFixture)) as { payload: Record<string, unknown> };
    delete truncated.payload.construction;
    expect(decodeSaveEnvelope(truncated)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });

  it('rejects a future/unknown saveSchemaVersion as unsupported, not a generic shape error', () => {
    const future = { ...freshPrisonFixture, saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 };
    expect(decodeSaveEnvelope(future)).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version', atVersion: SAVE_SCHEMA_VERSION + 1 },
    });
  });

  it('rejects saveSchemaVersion 0 (no historical schema registered) with a distinct error', () => {
    const zero = { ...freshPrisonFixture, saveSchemaVersion: 0 };
    expect(decodeSaveEnvelope(zero)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });

  it('rejects updatedAt earlier than createdAt', () => {
    const invalidTimestamps = { ...freshPrisonFixture, createdAt: 100, updatedAt: 50, checksum: freshPrisonFixture.checksum };
    expect(decodeSaveEnvelope(invalidTimestamps)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });
});

function buildTestEnvelope(overrides: Partial<Parameters<typeof createSaveEnvelope>[0]> = {}): TrustedSaveEnvelope {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel();
  kernel.registerSystem(construction);

  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'prison-xyz',
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    kernel: kernel.snapshot(),
    world: world.snapshot(),
    construction: construction.snapshot(),
    ...overrides,
  });
}

describe('createSaveEnvelope', () => {
  it('produces an envelope that decodes cleanly and excludes entities when none are provided', () => {
    const envelope = buildTestEnvelope();

    expect(envelope.payload.entities).toBeUndefined();
    const decoded = decodeSaveEnvelope(envelope);
    expect(decoded).toMatchObject({ ok: true, value: envelope });
  });

  // The envelope schema no longer re-walks the payload it was just handed
  // (#49), so the envelope's own fields need their own proof of validation.
  it('still rejects envelope metadata the payload schema does not cover', () => {
    expect(() => buildTestEnvelope({ createdAt: 100, updatedAt: 50 })).toThrow();
    expect(() => buildTestEnvelope({ revision: -1 })).toThrow();
    expect(() => buildTestEnvelope({ prisonId: '' })).toThrow();
    expect(() => buildTestEnvelope({ gameVersion: 'not a valid identifier!' })).toThrow();
  });

  it('still rejects a structurally invalid payload', () => {
    expect(() =>
      buildTestEnvelope({ kernel: { tick: -1, expectedSequence: 0, rngStates: [], commands: [] } as never }),
    ).toThrow();
  });
});

describe('trusted save envelopes', () => {
  it('trusts an envelope this process composed', () => {
    const envelope = buildTestEnvelope();
    expect(isTrustedSaveEnvelope(envelope)).toBe(true);
    expect(decodeSaveEnvelopeUnlessTrusted(envelope)).toMatchObject({ ok: true, value: envelope });
  });

  it('trusts the output of decodeSaveEnvelope, which is a fresh value rather than the caller’s object', () => {
    const input = JSON.parse(JSON.stringify(freshPrisonFixture)) as SaveEnvelopeV1;
    const decoded = decodeSaveEnvelope(input);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value).not.toBe(input);
    expect(isTrustedSaveEnvelope(decoded.value)).toBe(true);
    expect(isTrustedSaveEnvelope(input as unknown as SaveEnvelope)).toBe(false);
  });

  it('trusts no copy of a trusted envelope, however it was copied', () => {
    const envelope = buildTestEnvelope();
    // Every ordinary way a value leaves and re-enters this process.
    expect(isTrustedSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as SaveEnvelope)).toBe(false);
    expect(isTrustedSaveEnvelope(structuredClone(envelope) as SaveEnvelope)).toBe(false);
    expect(isTrustedSaveEnvelope({ ...envelope })).toBe(false);
    expect(isTrustedSaveEnvelope({ ...envelope, revision: 9 })).toBe(false);
  });

  it('trusts nothing merely cast to the trusted type, and validates it in full instead', () => {
    const forged = { ...buildTestEnvelope(), checksum: '0'.repeat(16) } as TrustedSaveEnvelope;
    expect(isTrustedSaveEnvelope(forged)).toBe(false);
    expect(decodeSaveEnvelopeUnlessTrusted(forged)).toMatchObject({
      ok: false,
      error: { code: 'checksum-mismatch' },
    });

    const garbage = { saveSchemaVersion: 1, nonsense: true } as unknown as TrustedSaveEnvelope;
    expect(isTrustedSaveEnvelope(garbage)).toBe(false);
    expect(decodeSaveEnvelopeUnlessTrusted(garbage)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });

  it('freezes a trusted envelope so its checksum cannot be swapped after this module vouched for it', () => {
    const envelope = buildTestEnvelope();
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(() => {
      (envelope as unknown as { checksum: string }).checksum = '0'.repeat(16);
    }).toThrow(TypeError);
    expect(decodeSaveEnvelope(envelope).ok).toBe(true);
  });
});
