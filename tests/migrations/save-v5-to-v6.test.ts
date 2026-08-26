import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import {
  migrateSaveEnvelopeV1ToV2,
  migrateSaveEnvelopeV2ToV3,
  migrateSaveEnvelopeV3ToV4,
  migrateSaveEnvelopeV4ToV5,
  migrateSaveEnvelopeV5ToV6,
} from '../../src/persistence/save-migrations';
import {
  SAVE_SCHEMA_VERSION,
  decodeSaveEnvelope,
  type SaveEnvelopeV1,
  type SaveEnvelopeV5,
} from '../../src/persistence/save-schema';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { createGradedDoor } from '../../src/simulation/security/sector';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import type { JsonValue } from '../../src/shared/json';
import freshPrisonFixture from '../fixtures/persistence/save-v1-fresh-prison.json';
import inProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

/**
 * Save-schema V5 -> V6 (issue #352): `simulation.incidents.response` starts
 * carrying the **in-flight response records**, so a restore can release what a
 * response claimed -- its responders and its sector lockdown.
 *
 * ## What this step has to do that no earlier step does
 *
 * It rewrites two sections the version did not change,
 * `security.guards.records` and `security.sectorControlStates`, because a V5
 * save can be in one of two states and only one of them is repairable by adding
 * a field:
 *
 * - **The response is still open.** The responders and the lockdown are in the
 *   payload but *unattributed*, so the step attributes them and the runtime
 *   releases them the normal way when the incident closes.
 * - **The response has already been stranded** by an earlier restore: the
 *   incident is terminal, and its guards and its lockdown are still held. No
 *   record can be reconstructed for a closed incident, and nothing in `src/`
 *   can release them -- so the step releases them directly, in the payload.
 *
 * ## The two facts it rests on, measured here rather than cited
 *
 * 1. **Only `IncidentResponseSystem` and `SearchSystem` ever set
 *    `'on-search'`**, and a search job's guards are in the payload -- so an
 *    `'on-search'` guard no job names is a responder. The "leaves a search
 *    job's guards alone" test below builds a session holding *both* kinds at
 *    once and shows the step separating them, which is the assertion that would
 *    fail if a third producer of the phase ever appeared.
 * 2. **Only `IncidentResponseSystem` ever writes `'lockdown'`**, and it holds
 *    one only while an incident in that sector is open -- so `'lockdown'` with
 *    no open incident is residue. The "does not lift a lockdown an open
 *    incident still justifies" test is the other side of that, and pins that
 *    the step is not simply clearing every lockdown it sees.
 *
 * ## Where the V5 saves under test come from
 *
 * Two provenances, for the reason `save-v3-to-v4.test.ts` and
 * `save-v4-to-v5.test.ts` each use two:
 *
 * - **The checked-in V1 fixtures, walked forward by the four frozen steps.**
 *   They carry no `simulation` section, which is the case this step must leave
 *   completely alone, and using them keeps `git diff -- tests/fixtures/` empty.
 * - **A real captured session with `responses` stripped back off it.** A V5
 *   payload and a V6 payload differ in nothing else, so a current capture minus
 *   that one field is exactly the byte shape a V5 build wrote.
 *
 * **Every expectation below is a literal chosen here, or a value read off the
 * V5 input.** Nothing is compared against the output of the step under test,
 * which is the trap that left the V1 -> V2 `world` handling unguarded for five
 * versions (#353): a migration assertion must name a value the migration did
 * not produce. The checksum cannot substitute for that, because every step in
 * this chain recomputes it over whatever it chose to emit.
 */

/** A structured clone through JSON -- how a save actually reaches `decodeSaveEnvelope` from storage. */
function throughStorage<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function v5EnvelopeFromV1(fixture: unknown): SaveEnvelopeV5 {
  return migrateSaveEnvelopeV4ToV5(
    migrateSaveEnvelopeV3ToV4(migrateSaveEnvelopeV2ToV3(migrateSaveEnvelopeV1ToV2(fixture as SaveEnvelopeV1))),
  );
}

const SECTOR_ID = 'sector-1';
const QUIET_SECTOR_ID = 'sector-2';
const DOOR_ID = 'door-1';
const QUIET_DOOR_ID = 'door-2';
const INCIDENT_ID = 'incident-riot';

/**
 * #352's reproduction: six guards, two sectors each with one graded door, and a
 * severity-8 riot in the first. Stepped until the incident leaves `'active'`,
 * which is the tick the response claims four guards and locks its sector down.
 *
 * The second sector exists so the tests can tell "lifted the right lockdown"
 * from "cleared every control state it found".
 */
function buildRespondingPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(0xbeef);
  runtime.navigation.doors.register(
    createGradedDoor(DOOR_ID, { x: tileCoordinate(2), y: tileCoordinate(1) }, 'left', 'open', 'grade.general'),
  );
  runtime.navigation.doors.register(
    createGradedDoor(QUIET_DOOR_ID, { x: tileCoordinate(8), y: tileCoordinate(1) }, 'left', 'open', 'grade.general'),
  );
  runtime.securitySectors.register({
    id: SECTOR_ID,
    gradeId: 'grade.general',
    doorIds: [DOOR_ID],
    postTile: { x: tileCoordinate(3), y: tileCoordinate(1) },
  });
  runtime.securitySectors.register({
    id: QUIET_SECTOR_ID,
    gradeId: 'grade.general',
    doorIds: [QUIET_DOOR_ID],
    postTile: { x: tileCoordinate(9), y: tileCoordinate(1) },
  });
  runtime.incidentSectorIds.push(SECTOR_ID);
  for (let index = 0; index < 6; index += 1) {
    runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });
  }
  runtime.incidents.open(
    { id: INCIDENT_ID, type: 'riot', sectorId: SECTOR_ID, participantIds: [1, 2, 3], severity: 8, causeFactors: [] },
    0,
  );
  while (runtime.incidents.get(INCIDENT_ID)!.state === 'active') runtime.kernel.step();
  return runtime;
}

type MutableSimulation = Record<string, unknown>;

/**
 * A genuine V5 envelope, built by capturing a real session and taking
 * `incidents.response.responses` back off it -- the one field a V5 build could
 * not write, because before V6 the system snapshotted metrics only.
 *
 * `mutate` is where a test expresses the *other* V5 state: a save written after
 * an earlier restore had already stranded the response. That has to be
 * hand-edited rather than played out, because the code that produced it no
 * longer exists -- which is exactly why the migration has to handle it.
 */
function v5EnvelopeFrom(runtime: SimulationRuntime, mutate: (simulation: MutableSimulation) => void = () => {}): SaveEnvelopeV5 {
  const bundle = captureSessionSnapshot(runtime);
  if (bundle.simulation === undefined) throw new Error('a captured session must carry a simulation section');

  const simulation = JSON.parse(JSON.stringify(bundle.simulation)) as MutableSimulation & {
    incidents: { response: { responses?: unknown } };
  };
  delete simulation.incidents.response.responses;
  mutate(simulation);

  const payload = {
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    simulation,
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  };

  return {
    saveSchemaVersion: 5,
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'v5-prison',
    revision: 6,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    checksum: computeSaveChecksum(payload as unknown as JsonValue),
    payload,
  } as unknown as SaveEnvelopeV5;
}

/** The rows a test reads back, with the tuple positions `DeepReadonly` erases. */
type ResponseRow = readonly [string, { readonly guardIds: readonly number[]; readonly arrivedGuardIds: readonly number[]; readonly lockdownApplied: boolean; readonly containmentStartedAtTick?: number }];
type GuardRow = readonly [number, { readonly deploymentPhase: string; readonly staffRoleId: string; readonly tileX: number; readonly tileY: number }];
type ControlRow = readonly [string, string];

function responseRows(envelope: { payload: { simulation?: unknown } }): readonly ResponseRow[] {
  return (envelope.payload.simulation as { incidents: { response: { responses: readonly ResponseRow[] } } }).incidents.response.responses;
}

function guardRows(envelope: { payload: { simulation?: unknown } }): readonly GuardRow[] {
  return (envelope.payload.simulation as { security: { guards: { records: readonly GuardRow[] } } }).security.guards.records;
}

function controlRows(envelope: { payload: { simulation?: unknown } }): readonly ControlRow[] {
  return (envelope.payload.simulation as { security: { sectorControlStates: readonly ControlRow[] } }).security.sectorControlStates;
}

function phaseOf(envelope: { payload: { simulation?: unknown } }, guardId: number): string {
  const row = guardRows(envelope).find(([id]) => id === guardId);
  if (row === undefined) throw new Error(`no guard row for ${guardId}`);
  return row[1].deploymentPhase;
}

function controlStateOf(envelope: { payload: { simulation?: unknown } }, sectorId: string): string {
  const row = controlRows(envelope).find(([id]) => id === sectorId);
  if (row === undefined) throw new Error(`no control-state row for ${sectorId}`);
  return row[1];
}

describe('save-schema V5 -> V6 migration', () => {
  it('rests on a measured premise: a V5 save records the responders and the lockdown but attributes neither', () => {
    // The state the whole step exists to read. Asserted off the V5 input rather
    // than described, so if a future capture stopped writing `'on-search'` or
    // stopped writing the lockdown, this file's argument is known to have
    // expired instead of quietly migrating a value it had assumed.
    const v5 = v5EnvelopeFrom(buildRespondingPrison());

    expect(guardRows(v5).map(([, record]) => record.deploymentPhase)).toEqual([
      'on-search',
      'on-search',
      'on-search',
      'on-search',
      'unassigned',
      'unassigned',
    ]);
    expect(controlStateOf(v5, SECTOR_ID)).toBe('lockdown');
    expect(controlStateOf(v5, QUIET_SECTOR_ID)).toBe('normal');
    expect((v5.payload.simulation as { incidents: { response: Record<string, unknown> } }).incidents.response).toEqual({
      metrics: { incidentsResolved: 0, incidentsLapsed: 0, respondersDispatched: 4, routeFailures: 0 },
    });
  });

  it('attributes the responders and the lockdown to the open incident that is holding them', () => {
    const v6 = migrateSaveEnvelopeV5ToV6(v5EnvelopeFrom(buildRespondingPrison()));

    expect(v6.saveSchemaVersion).toBe(6);
    // Literal values chosen here: the four lowest guard ids, no arrivals
    // recorded (a V5 save records none), and the lockdown this incident applied.
    expect(responseRows(v6)).toEqual([
      [INCIDENT_ID, { guardIds: [0, 1, 2, 3], arrivedGuardIds: [], lockdownApplied: true }],
    ]);
    // The claims themselves are left exactly as written: the runtime releases
    // them when the incident closes, and this step must not pre-empt that.
    expect(guardRows(v6).map(([, record]) => record.deploymentPhase)).toEqual([
      'on-search',
      'on-search',
      'on-search',
      'on-search',
      'unassigned',
      'unassigned',
    ]);
    expect(controlStateOf(v6, SECTOR_ID)).toBe('lockdown');
  });

  it('lets a migrated open response finish and hand back everything it claimed', () => {
    // The behavioural consequence, through the real decode path: a V5 save with
    // an open response loads and then *completes*, releasing the guards and
    // lifting the lockdown -- which is what no V5 save could do before.
    const decoded = decodeSaveEnvelope(throughStorage(v5EnvelopeFrom(buildRespondingPrison())));
    expect(decoded).toMatchObject({ ok: true, migrated: true });
    if (!decoded.ok) throw new Error('the V5 save must migrate for this test to be meaningful');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, 0xbeef).runtime;
    expect(restored.securityGuards.unassignedGuardIds()).toEqual([4, 5]);
    expect(restored.securitySectors.getControlState(SECTOR_ID)).toBe('lockdown');

    for (let tick = 0; tick < 2_000 && restored.securityGuards.unassignedGuardIds().length < 6; tick += 1) {
      restored.kernel.step();
    }

    expect(restored.securityGuards.unassignedGuardIds()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(restored.securitySectors.getControlState(SECTOR_ID)).toBe('normal');
    expect(restored.navigation.doors.getById(DOOR_ID)!.state).toBe('open');
    expect(restored.incidents.get(INCIDENT_ID)!.state).toBe('resolved');
  });

  it('releases a response a V5 save had already stranded, because nothing else ever will', () => {
    // A save written *after* an earlier restore: the incident is terminal and
    // its guards and its lockdown are still held. Hand-edited rather than
    // played out, because the code that produced this state is what V6 removes.
    const v5 = v5EnvelopeFrom(buildRespondingPrison(), (simulation) => {
      const incidents = simulation.incidents as { log: [string, { state: string; timeline: { state: string; atTick: number }[] }][] };
      const row = incidents.log.find(([id]) => id === INCIDENT_ID)!;
      row[1].state = 'lapsed';
      row[1].timeline.push({ state: 'lapsed', atTick: 601 });
    });

    // The input really is the stranded state, and the step is what changes it.
    expect(phaseOf(v5, 0)).toBe('on-search');
    expect(controlStateOf(v5, SECTOR_ID)).toBe('lockdown');

    const v6 = migrateSaveEnvelopeV5ToV6(v5);

    expect(responseRows(v6)).toEqual([]); // nothing to attribute -- the incident is closed
    expect(guardRows(v6).map(([, record]) => record.deploymentPhase)).toEqual([
      'unassigned',
      'unassigned',
      'unassigned',
      'unassigned',
      'unassigned',
      'unassigned',
    ]);
    expect(controlStateOf(v6, SECTOR_ID)).toBe('normal');
    // Exactly `GuardRoster.unassign`: the phase, and nothing else about the
    // guard, changes. A responder is claimed out of the unassigned pool, so it
    // holds no sector, no path request and no patrol bookkeeping to clear.
    expect(guardRows(v6).find(([id]) => id === 0)![1]).toEqual({
      staffRoleId: 'staff-role.guard',
      tileX: 0,
      tileY: 0,
      deploymentPhase: 'unassigned',
    });
  });

  it('unlocks the stranded sector’s doors on load, by writing the control state rather than the doors', () => {
    // `navigation.doors` records each governed door at its *baseline* state and
    // `SecuritySectorRegistry.loadSnapshot` re-cascades the control state onto
    // it, so the one edit above is what actually reopens the door. Asserted
    // through the real decode path, not by reasoning about the cascade.
    const stranded = v5EnvelopeFrom(buildRespondingPrison(), (simulation) => {
      const incidents = simulation.incidents as { log: [string, { state: string; timeline: { state: string; atTick: number }[] }][] };
      const row = incidents.log.find(([id]) => id === INCIDENT_ID)!;
      row[1].state = 'lapsed';
      row[1].timeline.push({ state: 'lapsed', atTick: 601 });
    });

    const decoded = decodeSaveEnvelope(throughStorage(stranded));
    expect(decoded).toMatchObject({ ok: true, migrated: true });
    if (!decoded.ok) throw new Error('the V5 save must migrate for this test to be meaningful');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, 0xbeef).runtime;

    expect(restored.securityGuards.unassignedGuardIds()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(restored.securitySectors.getControlState(SECTOR_ID)).toBe('normal');
    expect(restored.navigation.doors.getById(DOOR_ID)!.state).toBe('open');
    // The incident stays as it ended. The step repairs the resources, it does
    // not rewrite what happened to the prison.
    expect(restored.incidents.get(INCIDENT_ID)!.state).toBe('lapsed');
  });

  it('leaves a search job’s guards alone, which is the fact the attribution rests on', () => {
    // The control from #352: `SearchSystem` sets the same `'on-search'` phase,
    // and its jobs *are* in the payload. A session holding both kinds of
    // on-search guard at once is what separates "a responder" from "any guard
    // in that phase" -- and if a third producer of the phase ever appeared,
    // this is the assertion that would fail.
    const runtime = buildRespondingPrison();
    runtime.searchPolicies.push({ scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 0.5, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 });
    runtime.searchContainerLocations.set('container-1', { x: tileCoordinate(5), y: tileCoordinate(1) });
    runtime.searchSystem.submitOrder({
      id: 'search-1',
      scope: 'cell',
      targets: [{ holderKind: 'container', holderId: 'container-1' }],
    });
    while (runtime.searchSystem.isQueued('search-1')) runtime.kernel.step();

    const v5 = v5EnvelopeFrom(runtime);
    const searchJobRows = (v5.payload.simulation as unknown as {
      contraband: { search: { active: readonly (readonly [string, { guardIds: readonly number[] }])[] } };
    }).contraband.search.active;
    const searchGuardIds = searchJobRows.flatMap(([, job]) => [...job.guardIds]);
    expect(searchGuardIds.length).toBeGreaterThan(0);

    const attributed = responseRows(migrateSaveEnvelopeV5ToV6(v5)).flatMap(([, response]) => [...response.guardIds]);

    expect(attributed).toEqual([0, 1, 2, 3]);
    for (const guardId of searchGuardIds) expect(attributed).not.toContain(guardId);
  });

  it('does not lift a lockdown an open incident still justifies, and never touches ‘restricted’', () => {
    // The other side of the lockdown fact: `releaseResponse` refuses to lift a
    // lockdown while any incident in the sector is still open, so a sector in
    // lockdown with an open incident is a live state and not residue. The
    // second sector is set to `'restricted'`, which this step must never write.
    const v5 = v5EnvelopeFrom(buildRespondingPrison(), (simulation) => {
      const security = simulation.security as { sectorControlStates: [string, string][] };
      const quiet = security.sectorControlStates.find(([id]) => id === QUIET_SECTOR_ID)!;
      quiet[1] = 'restricted';
    });

    const v6 = migrateSaveEnvelopeV5ToV6(v5);

    expect(controlStateOf(v6, SECTOR_ID)).toBe('lockdown');
    expect(controlStateOf(v6, QUIET_SECTOR_ID)).toBe('restricted');
  });

  it('carries every other section across untouched, field by field', () => {
    // Named fields rather than a digest, because the checksum cannot catch a
    // dropped one: this step recomputes it over whatever it emits (#353).
    const v5 = v5EnvelopeFrom(buildRespondingPrison());
    const v6 = migrateSaveEnvelopeV5ToV6(v5);

    expect(v6.payload.kernel).toEqual(v5.payload.kernel);
    expect(v6.payload.world).toEqual(v5.payload.world);
    expect(v6.payload.construction).toEqual(v5.payload.construction);
    expect(v6.payload.entities).toEqual(v5.payload.entities);
    expect(v6.payload.identity).toEqual(v5.payload.identity);
    expect(Object.keys(v6.payload).sort()).toEqual(Object.keys(v5.payload).sort());

    const before = v5.payload.simulation!;
    const after = v6.payload.simulation!;
    expect(after.prisoners).toEqual(before.prisoners);
    expect(after.operations).toEqual(before.operations);
    expect(after.navigation).toEqual(before.navigation);
    expect(after.contraband).toEqual(before.contraband);
    expect(after.economy).toEqual(before.economy);
    expect(after.objects).toEqual(before.objects);
    // Inside `incidents`, only `response` moves.
    expect(after.incidents.log).toEqual(before.incidents.log);
    expect(after.incidents.sectorRisk).toEqual(before.incidents.sectorRisk);
    expect(after.incidents.gangs).toEqual(before.incidents.gangs);
    expect(after.incidents.tunnels).toEqual(before.incidents.tunnels);
    expect(after.incidents.watchedSectorIds).toEqual(before.incidents.watchedSectorIds);
    expect(after.incidents.trigger).toEqual(before.incidents.trigger);
    expect(after.incidents.response.metrics).toEqual(before.incidents.response.metrics);
    // Inside `security`, only the two the step repairs may move, and here they
    // do not: an open response is attributed, not released.
    expect(after.security.sectorDefinitions).toEqual(before.security.sectorDefinitions);
    expect(after.security.schedules).toEqual(before.security.schedules);
    expect(after.security.deployment).toEqual(before.security.deployment);
    expect(after.security.patrol).toEqual(before.security.patrol);
    expect(after.security.guards.entityStore).toEqual(before.security.guards.entityStore);
    expect(after.security.guards.records).toEqual(before.security.guards.records);
    expect(after.security.sectorControlStates).toEqual(before.security.sectorControlStates);
  });

  it('carries a V5 save with no simulation section across untouched', () => {
    for (const fixture of [freshPrisonFixture, inProgressFixture]) {
      const v5 = v5EnvelopeFromV1(fixture);
      expect(v5.payload.simulation, 'the frozen V1 fixtures carry no simulation section').toBeUndefined();

      const migrated = migrateSaveEnvelopeV5ToV6(v5);

      expect(migrated.payload.simulation).toBeUndefined();
      // Byte-identical outside the version and the checksum, which is what
      // "nothing to reshape" has to mean for a save this step cannot touch.
      expect(migrated.payload).toEqual(v5.payload);
      expect(migrated.checksum).toBe(computeSaveChecksum(migrated.payload as unknown as JsonValue));
    }
  });

  it('never mutates its input', () => {
    const v5 = v5EnvelopeFrom(buildRespondingPrison());
    const before = JSON.stringify(v5);
    migrateSaveEnvelopeV5ToV6(v5);
    expect(JSON.stringify(v5)).toBe(before);
  });

  it('re-checksums the migrated save so it decodes again as a current-version one', () => {
    const migrated = migrateSaveEnvelopeV5ToV6(v5EnvelopeFrom(buildRespondingPrison()));
    expect(migrated.checksum).toBe(computeSaveChecksum(migrated.payload as unknown as JsonValue));

    const again = decodeSaveEnvelope(throughStorage(migrated));
    expect(again).toMatchObject({ ok: true, migrated: false });
  });

  it('rejects a corrupt V5 save at the version it was written, before the attribution runs', () => {
    const corrupt = { ...v5EnvelopeFrom(buildRespondingPrison()), checksum: 'ffffffffffffffff' };
    expect(decodeSaveEnvelope(throughStorage(corrupt))).toMatchObject({
      ok: false,
      error: { code: 'checksum-mismatch', atVersion: 5 },
    });
  });

  it('walks a V1 fixture the whole way to the current version through the chain', () => {
    for (const fixture of [freshPrisonFixture, inProgressFixture]) {
      const result = decodeSaveEnvelope(throughStorage(fixture));
      expect(result).toMatchObject({ ok: true, migrated: true });
      if (!result.ok) return;
      expect(result.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(SAVE_SCHEMA_VERSION).toBe(6);
      // A save from the first release has no responses to carry, and says so
      // rather than being given an incidents section it never had.
      expect(result.value.payload.simulation).toBeUndefined();
    }
  });
});
