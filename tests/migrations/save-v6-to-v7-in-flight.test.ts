import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { migrateSaveEnvelopeV6ToV7 } from '../../src/persistence/save-migrations';
import { decodeSaveEnvelope, type SaveEnvelopeV6 } from '../../src/persistence/save-schema';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import type { JsonValue } from '../../src/shared/json';

function envelopeFrom(payload: SaveEnvelopeV6['payload']): SaveEnvelopeV6 {
  return {
    saveSchemaVersion: 6,
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'v6-travel',
    revision: 1,
    createdAt: 1,
    updatedAt: 2,
    checksum: computeSaveChecksum(payload as unknown as JsonValue),
    payload,
  };
}

function capturedV6(): SaveEnvelopeV6 {
  const bundle = captureSessionSnapshot(createNewSimulationRuntime(0x1376));
  return envelopeFrom(bundle as SaveEnvelopeV6['payload']);
}

describe('V6 to V7 in-flight migration', () => {
  it('preserves a live V6 in-flight section and leaves its source untouched', () => {
    const v6 = capturedV6();
    const before = JSON.stringify(v6);
    const migrated = migrateSaveEnvelopeV6ToV7(v6);

    expect(JSON.stringify(v6)).toBe(before);
    expect(migrated.saveSchemaVersion).toBe(7);
    expect(migrated.payload.simulation?.inFlight).toEqual(v6.payload.simulation?.inFlight);
    expect(migrated.checksum).toBe(computeSaveChecksum(migrated.payload as unknown as JsonValue));
    expect(decodeSaveEnvelope(JSON.parse(JSON.stringify(v6)))).toMatchObject({ ok: true, migrated: true });
  });

  it('moves populated V6 legacy path counters and headings into inFlight', () => {
    const base = capturedV6();
    const systems = base.payload.simulation;
    if (systems === undefined) throw new Error('captured session must have systems');
    const { inFlight: _inFlight, ...settled } = systems;
    const payload = {
      ...base.payload,
      simulation: {
        ...settled,
        navigation: { ...systems.navigation, work: { queue: { pending: [] }, results: [] } },
        prisoners: {
          ...systems.prisoners,
          locomotion: { walks: [], headings: [[3, { x: 1, y: 0 }]] },
          pathRequestSequence: 17,
          coldState: { ...systems.prisoners.coldState, currentActionPathRequestId: [[3, 'prisoner.3.17']] },
        },
        security: {
          ...systems.security,
          guards: { ...systems.security.guards, locomotion: { walks: [], headings: [[5, { x: 0, y: -1 }]] } },
          deployment: { ...systems.security.deployment, pathRequestSequence: 23 },
          patrol: { ...systems.security.patrol, pathRequestSequence: 29 },
        },
        contraband: {
          ...systems.contraband,
          search: {
            ...systems.contraband.search,
            requestSequence: 31,
            active: [['search.1', {
              scope: 'person', targets: [{ holderKind: 'prisoner', holderId: '3' }],
              guardIds: [5], currentTargetIndex: 0,
              state: 'travelling', travelInFlight: true,
              pathRequestIdsByGuard: [[5, 'contraband.search.search.1.5.31']],
              dwellStartedAtTick: 19,
            }]],
          },
        },
      },
    } as unknown as SaveEnvelopeV6['payload'];
    const v6 = envelopeFrom(payload);
    const migrated = migrateSaveEnvelopeV6ToV7(v6);

    expect(migrated.payload.simulation?.inFlight).toMatchObject({
      navigation: { pending: [], results: [] },
      prisoners: { locomotion: { walks: [], headings: [[3, 1, 0]] }, pathRequestIds: [[3, 'prisoner.3.17']], requestSequence: 17 },
      guards: { locomotion: { walks: [], headings: [[5, 0, -1]] }, deploymentRequestSequence: 23, patrolRequestSequence: 29 },
      search: { requestSequence: 31, jobs: [{
        id: 'search.1', state: 'travelling', travelInFlight: true,
        pathRequestIdsByGuard: [[5, 'contraband.search.search.1.5.31']], dwellStartedAtTick: 19,
      }] },
    });
    expect(migrated.payload.simulation?.prisoners).not.toHaveProperty('locomotion');
    expect(migrated.payload.simulation?.navigation).not.toHaveProperty('work');
    expect(migrated.payload.simulation?.contraband.search).not.toHaveProperty('requestSequence');
    expect(decodeSaveEnvelope(JSON.parse(JSON.stringify(v6)))).toMatchObject({ ok: true, migrated: true });
  });

  it('keeps the atomic inFlight copy when a V6 save also has contradictory optional legacy fields', () => {
    const base = capturedV6();
    const systems = base.payload.simulation;
    if (systems?.inFlight === undefined) throw new Error('captured session must carry inFlight');
    const authoritative = systems.inFlight;
    const v6 = envelopeFrom({
      ...base.payload,
      simulation: {
        ...systems,
        prisoners: { ...systems.prisoners, pathRequestSequence: 991 },
        security: { ...systems.security, deployment: { ...systems.security.deployment, pathRequestSequence: 992 } },
        contraband: { ...systems.contraband, search: { ...systems.contraband.search, requestSequence: 993 } },
      },
    } as unknown as SaveEnvelopeV6['payload']);

    const migrated = migrateSaveEnvelopeV6ToV7(v6);
    expect(migrated.payload.simulation?.inFlight).toEqual(authoritative);
    expect(migrated.payload.simulation?.prisoners).not.toHaveProperty('pathRequestSequence');
    expect(decodeSaveEnvelope(JSON.parse(JSON.stringify(v6)))).toMatchObject({ ok: true, migrated: true });
  });
});
