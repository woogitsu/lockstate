import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { migrateSaveEnvelopeV6ToV7 } from '../../src/persistence/save-migrations';
import { decodeSaveEnvelope, type SaveEnvelopeV6 } from '../../src/persistence/save-schema';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import type { JsonValue } from '../../src/shared/json';

function v6SessionSave(): SaveEnvelopeV6 {
  const bundle = captureSessionSnapshot(createNewSimulationRuntime(7));
  if (bundle.simulation === undefined) throw new Error('session missing');
  const {
    roomFilth: _newField,
    labourCredit: _labourCredit, workOutput: _workOutput,
    delayedIntake: _delayedIntake,
    pendingCandidateProfiles: _pendingCandidateProfiles,
    intakeCandidates: _intakeCandidates,
    holdingStays: _holdingStays,
    ...simulation
  } = bundle.simulation;
  const payload = {
    masterSeed: bundle.masterSeed,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    entities: bundle.entities,
    simulation,
    identity: bundle.identity,
  };
  return JSON.parse(JSON.stringify({
    saveSchemaVersion: 6, gameVersion: 'lockstate-0.0.0', prisonId: 'v6-filth-migration',
    revision: 1, createdAt: 1, updatedAt: 1,
    checksum: computeSaveChecksum(JSON.parse(JSON.stringify(payload)) as JsonValue), payload,
  })) as SaveEnvelopeV6;
}

describe('V6 to V7 room filth migration', () => {
  it('adds exactly an empty ledger to a real V6 session and validates the complete chain', () => {
    const old = v6SessionSave();
    const before = JSON.stringify(old);
    const migrated = migrateSaveEnvelopeV6ToV7(old);
    expect(migrated.payload.simulation?.roomFilth).toEqual({ rooms: [], exposures: [] });
    expect(JSON.stringify(old)).toBe(before);
    expect(migrated.checksum).toBe(computeSaveChecksum(migrated.payload as JsonValue));
    expect(decodeSaveEnvelope(old)).toMatchObject({ ok: true, migrated: true });
  });

  it('still accepts a legacy V6 session written before in-flight work was saved', () => {
    const old = v6SessionSave();
    if (old.payload.simulation === undefined) throw new Error('session missing');
    const { inFlight: _inFlight, ...simulation } = old.payload.simulation;
    const payload = { ...old.payload, simulation };
    const legacy = { ...old, payload, checksum: computeSaveChecksum(payload as JsonValue) };
    const decoded = decodeSaveEnvelope(legacy);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.migrated).toBe(true);
    expect(decoded.value.payload.simulation?.inFlight).toBeUndefined();
    expect(decoded.value.payload.simulation?.roomFilth).toEqual({ rooms: [], exposures: [] });
  });
});
