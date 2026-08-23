import { describe, expect, it } from 'vitest';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { canonicalJson } from '../../src/simulation/determinism/canonical';
import { NEED_IDS, NEED_MAX } from '../../src/simulation/prisoners/needs';
import {
  BOUNDED_VALUE_SEGMENTS,
  projectContraband,
  projectIncidentDetail,
  projectIncidents,
  projectPrisonerDetail,
  projectPrisonerPopulationCounts,
  projectPrisonerRoster,
  projectRoomDetail,
  projectRoomList,
  projectSecurity,
  projectStaff,
  projectStatusStrip,
  toBoundedValue,
} from '../../src/simulation/presentation';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { hashFullRuntime, toJsonValue } from '../helpers/determinism-state';

/**
 * Every projection is exercised against a *real* session -- the same rich
 * `buildDeterminismScenario` runtime the determinism suite uses, driven
 * through the real `Kernel` -- rather than a hand-written fixture of the
 * shape each view model is hoped to have. A projection asserted against a
 * fixture proves only that the fixture and the assertion agree.
 */

const TICKS = 260;

function runScenario(options: { readonly reverseIncidentalRegistrationOrder?: boolean } = {}): SimulationRuntime {
  const runtime = buildDeterminismScenario(SCENARIO_SEED, options);
  submitScenarioCommands(runtime);
  for (let tick = 0; tick < TICKS; tick += 1) runtime.kernel.step();
  return runtime;
}

/** Every projection in this directory, taken together, as one comparable value. */
function projectEverything(runtime: SimulationRuntime): unknown {
  const tick = runtime.kernel.tick;
  return {
    statusStrip: projectStatusStrip({
      tick,
      clockControl: { mode: 'running', speed: 2 },
      prisoners: runtime.prisoners,
      rooms: runtime.prisoners,
      staff: runtime.securityGuards,
      incidents: runtime.incidents,
      searchSystem: runtime.searchSystem,
    }),
    roster: projectPrisonerRoster(runtime.prisoners, { limit: 50 }),
    rooms: projectRoomList(runtime.prisoners, { limit: 50 }),
    staff: projectStaff(
      { staff: runtime.securityGuards, deployment: runtime.deploymentSystem, patrol: runtime.patrolSystem },
      tick,
    ),
    security: projectSecurity(
      {
        sectors: runtime.securitySectors,
        doors: runtime.navigation.doors,
        staff: runtime.securityGuards,
        deployment: runtime.deploymentSystem,
        patrol: runtime.patrolSystem,
        incidents: runtime.incidents,
      },
      tick,
    ),
    contraband: projectContraband({
      searchSystem: runtime.searchSystem,
      confiscations: runtime.confiscations,
      intelligence: runtime.intelligence,
      informants: runtime.informants,
      searchPolicies: runtime.searchPolicies,
    }),
    incidents: projectIncidents({ incidents: runtime.incidents, trigger: runtime.incidentTriggerSystem, response: runtime.incidentResponseSystem }, tick),
  };
}

describe('bounded value contract', () => {
  it('projects an empty value as an empty bar and a full value as a full bar', () => {
    expect(toBoundedValue(0, NEED_MAX)).toEqual({ permille: 0, filled: 0, segments: BOUNDED_VALUE_SEGMENTS });
    expect(toBoundedValue(NEED_MAX, NEED_MAX)).toEqual({ permille: 1_000, filled: BOUNDED_VALUE_SEGMENTS, segments: BOUNDED_VALUE_SEGMENTS });
  });

  it('never shows a full bar for a value below its maximum', () => {
    // 254/255 is 99.6 %. Rounding to segments would render a completely
    // full need bar for a prisoner who is not, in fact, sated -- the class
    // of lie a player acts on.
    const almostFull = toBoundedValue(NEED_MAX - 1, NEED_MAX);
    expect(almostFull.permille).toBe(996);
    expect(almostFull.filled).toBe(BOUNDED_VALUE_SEGMENTS - 1);
  });

  it('exposes no raw value or raw maximum, so no HUD can hard-code the storage width', () => {
    expect(Object.keys(toBoundedValue(128, NEED_MAX)).sort()).toEqual(['filled', 'permille', 'segments']);
  });

  it('clamps out-of-range input rather than throwing in front of a player', () => {
    expect(toBoundedValue(-5, 10).permille).toBe(0);
    expect(toBoundedValue(50, 10).permille).toBe(1_000);
  });

  it('rejects input that means the caller passed the wrong field', () => {
    expect(() => toBoundedValue(Number.NaN, 10)).toThrow(RangeError);
    expect(() => toBoundedValue(1, 0)).toThrow(RangeError);
  });
});

describe('projections read authoritative state without touching it', () => {
  it('leaves the runtime state hash unchanged', () => {
    const runtime = runScenario();
    const before = hashFullRuntime(runtime);
    projectEverything(runtime);
    expect(hashFullRuntime(runtime)).toBe(before);
  });

  it('does not hand out a reference into live simulation state', () => {
    const runtime = runScenario();
    const rooms = projectRoomList(runtime.prisoners);
    const row = rooms.rooms.rows[0];
    expect(row).toBeDefined();
    const instance = runtime.prisoners.roomInstances.getById(row!.instanceId)!;
    expect(row!.objectCapabilities).not.toBe(instance.objectCapabilities);
    expect(row!.anchorTile).not.toBe(instance.anchorTile);
  });
});

describe('projections are deterministic', () => {
  it('produces identical view models when every incidental registration order is reversed', () => {
    // Rooms, doors, sectors, schedules, containers, jobs, contraband and
    // gangs are all registered in reverse here. If any projection iterated a
    // `Map`/`Set` instead of a canonical key, these two would differ.
    const asBuilt = runScenario();
    const reversed = runScenario({ reverseIncidentalRegistrationOrder: true });
    expect(canonicalJson(toJsonValue(projectEverything(reversed)))).toBe(
      canonicalJson(toJsonValue(projectEverything(asBuilt))),
    );
  });

  it('produces identical view models for two identical runs', () => {
    expect(canonicalJson(toJsonValue(projectEverything(runScenario())))).toBe(
      canonicalJson(toJsonValue(projectEverything(runScenario()))),
    );
  });
});

describe('localization boundary (ADR 0011)', () => {
  it('carries message keys and stable ids, never a translated string', () => {
    const runtime = runScenario();
    const translations = new Set(defaultLocaleEnCatalog.values());
    const offenders: string[] = [];

    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        if (translations.has(value)) offenders.push(`${path} = ${JSON.stringify(value)}`);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        return;
      }
      if (value !== null && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
      }
    };

    walk(projectEverything(runtime), '$');
    expect(offenders).toEqual([]);
  });

  it('projects the content catalog nameKey for every entity that has one', () => {
    const runtime = runScenario();
    const rooms = projectRoomList(runtime.prisoners);
    expect(rooms.rooms.rows.map((row) => row.roomNameKey)).toContain('room.cell.name');

    const staff = projectStaff({ staff: runtime.securityGuards }, runtime.kernel.tick);
    expect(staff.roster.rows[0]?.staffRoleNameKey).toBe('staff-role.guard.name');

    const security = projectSecurity({ sectors: runtime.securitySectors }, runtime.kernel.tick);
    expect(security.sectors[0]?.gradeNameKey).toBe('grade.general.name');
  });
});

describe('status strip', () => {
  it('counts real population, staff, rooms, incidents and contraband finds', () => {
    const runtime = runScenario();
    const strip = projectStatusStrip({
      tick: runtime.kernel.tick,
      clockControl: { mode: 'running', speed: 4 },
      prisoners: runtime.prisoners,
      rooms: runtime.prisoners,
      staff: runtime.securityGuards,
      incidents: runtime.incidents,
      searchSystem: runtime.searchSystem,
    });

    expect(strip.counts.prisoners).toBe(4);
    expect(strip.counts.staff).toBe(5);
    // Four cells, one solitary-free yard and one canteen were registered.
    expect(strip.counts.rooms).toBe(6);
    expect(strip.counts.activeIncidents).toBe(runtime.incidents.openIncidents().length);
    expect(strip.counts.contrabandDiscovered).toBe(runtime.searchSystem.getMetrics().itemsDiscovered);
    expect(strip.counts.roomOccupants).toBeGreaterThan(0);
  });

  it('reports the clock as day number plus position within the in-game day', () => {
    const runtime = runScenario();
    const strip = projectStatusStrip({ tick: runtime.kernel.tick, clockControl: { mode: 'running', speed: 2 }, prisoners: runtime.prisoners });

    expect(strip.clock.tick).toBe(TICKS);
    expect(strip.clock.dayNumber).toBe(1);
    expect(strip.clock.tickOfDay).toBe(TICKS % DAY_LENGTH_TICKS);
    expect(strip.clock.dayLengthTicks).toBe(DAY_LENGTH_TICKS);
    expect(strip.clock.speed).toBe(2);
    expect(strip.clock.paused).toBe(false);
    expect(strip.clock.speedKnown).toBe(true);
  });

  it('reports paused, and reports an unknown speed rather than guessing one', () => {
    const runtime = runScenario();
    const paused = projectStatusStrip({ tick: runtime.kernel.tick, clockControl: { mode: 'paused' }, prisoners: runtime.prisoners });
    expect(paused.clock).toMatchObject({ paused: true, speed: 0, speedKnown: true });

    const unknown = projectStatusStrip({ tick: runtime.kernel.tick, prisoners: runtime.prisoners });
    expect(unknown.clock).toMatchObject({ paused: false, speed: 0, speedKnown: false });
  });

  it('reports the active regime block for both classification groups', () => {
    const runtime = runScenario();
    const strip = projectStatusStrip({ tick: runtime.kernel.tick, prisoners: runtime.prisoners });

    expect(strip.regime.map((entry) => entry.classificationGroupId)).toEqual(['general-population', 'high-risk']);
    // Tick 260 falls in general population's 0-400 sleep block.
    expect(strip.regime[0]).toMatchObject({ blockStartTickOfDay: 0, blockEndTickOfDay: 400, allowedCategories: ['sleep'] });
  });
});

describe('prisoner roster and detail', () => {
  it('lists every live prisoner in ascending entity id, and pages without changing the order', () => {
    const runtime = runScenario();
    const all = projectPrisonerRoster(runtime.prisoners);
    expect(all.total).toBe(4);
    expect(all.rows).toHaveLength(4);

    const ids = all.rows.map((row) => row.entityId);
    expect([...ids].sort((left, right) => left - right)).toEqual(ids);

    const windowed = projectPrisonerRoster(runtime.prisoners, { offset: 2, limit: 1 });
    expect(windowed).toMatchObject({ total: 4, offset: 2, limit: 1 });
    expect(windowed.rows).toEqual([all.rows[2]]);

    const pastEnd = projectPrisonerRoster(runtime.prisoners, { offset: 99, limit: 10 });
    expect(pastEnd.total).toBe(4);
    expect(pastEnd.rows).toEqual([]);
  });

  it('projects only the classification values that exist, and only once classification has run', () => {
    const runtime = runScenario();
    for (const row of projectPrisonerRoster(runtime.prisoners).rows) {
      expect(row.classified).toBe(true);
      expect(['general-population', 'high-risk']).toContain(row.classificationGroupId);
      expect(row.riskTier).toBeGreaterThanOrEqual(0);
      expect(row.riskTier).toBeLessThanOrEqual(3);
    }

    // A prisoner admitted this instant has not been classified yet, so the
    // projection must not report a default-decoded 'general-population'.
    const fresh = buildDeterminismScenario(SCENARIO_SEED);
    const row = projectPrisonerRoster(fresh.prisoners).rows[0];
    expect(row).toMatchObject({ intakeStage: 'queued', classified: false });
    expect(row).not.toHaveProperty('classificationGroupId');
    expect(row).not.toHaveProperty('riskTier');
  });

  it('projects exactly the six needs that exist, in canonical order, as bounded values', () => {
    const runtime = runScenario();
    const entityId = projectPrisonerRoster(runtime.prisoners).rows[0]!.entityId;
    const detail = projectPrisonerDetail(runtime.prisoners, entityId)!;

    expect(detail.needs.map((need) => need.needId)).toEqual([...NEED_IDS]);
    for (const need of detail.needs) {
      expect(need.level.segments).toBe(BOUNDED_VALUE_SEGMENTS);
      expect(need.level.permille).toBeGreaterThanOrEqual(0);
      expect(need.level.permille).toBeLessThanOrEqual(1_000);
      expect(need.level.filled).toBeLessThanOrEqual(BOUNDED_VALUE_SEGMENTS);
    }
  });

  it('reports the lowest need with a deterministic tie-break', () => {
    const runtime = runScenario();
    const row = projectPrisonerRoster(runtime.prisoners).rows[0]!;
    const detail = projectPrisonerDetail(runtime.prisoners, row.entityId)!;
    const lowest = Math.min(...detail.needs.map((need) => need.level.permille));
    expect(row.lowestNeed.level.permille).toBe(lowest);
    // Ties resolve to the earlier NEED_IDS entry, never to iteration luck.
    const expected = detail.needs.find((need) => need.level.permille === lowest)!;
    expect(row.lowestNeed.needId).toBe(expected.needId);
  });

  it('projects action, location and accommodation from real state', () => {
    const runtime = runScenario();
    const entityId = projectPrisonerRoster(runtime.prisoners).rows[0]!.entityId;
    const detail = projectPrisonerDetail(runtime.prisoners, entityId)!;
    const index = runtime.prisoners.entityStore.getIndex(entityId);

    expect(detail.location.tile).toEqual({
      x: runtime.prisoners.position.tileX[index],
      y: runtime.prisoners.position.tileY[index],
    });
    expect(detail.accommodation?.instanceId).toBe(runtime.prisoners.coldState.getAccommodation(entityId));
    expect(detail.accommodation?.roomNameKey).toBe('room.cell.name');
    expect(['idle', 'travelling', 'performing']).toContain(detail.currentAction?.phase ?? 'idle');
  });

  it('projects gang membership only when a gang registry is supplied', () => {
    const runtime = runScenario();
    const entityId = projectPrisonerRoster(runtime.prisoners).rows[0]!.entityId;
    runtime.gangs.addMember('gang-a', entityId);
    runtime.gangs.adjustReputation('gang-a', 3);

    expect(projectPrisonerRoster(runtime.prisoners).rows[0]).not.toHaveProperty('gangId');
    expect(projectPrisonerRoster(runtime.prisoners, {}, { gangs: runtime.gangs }).rows[0]?.gangId).toBe('gang-a');
    expect(projectPrisonerDetail(runtime.prisoners, entityId, { gangs: runtime.gangs })?.gang).toEqual({
      gangId: 'gang-a',
      reputation: runtime.gangs.getReputation('gang-a'),
    });
  });

  it('returns undefined for an entity id that was never spawned', () => {
    const runtime = runScenario();
    expect(projectPrisonerDetail(runtime.prisoners, 999_999)).toBeUndefined();
  });

  it('counts the population without building a single row', () => {
    const runtime = runScenario();
    const counts = projectPrisonerPopulationCounts(runtime.prisoners);
    expect(counts.total).toBe(4);
    expect(counts.byIntakeStage.map((entry) => entry.intakeStage)).toEqual([
      'queued',
      'reception',
      'classification',
      'accommodation-assignment',
      'completed',
      'failed',
    ]);
    expect(counts.byClassificationGroupId.map((entry) => entry.classificationGroupId)).toEqual([
      'general-population',
      'high-risk',
    ]);
    expect(counts.byIntakeStage.reduce((sum, entry) => sum + entry.count, 0)).toBe(counts.total);
  });
});

describe('room list and detail', () => {
  it('lists registered instances in ascending instance id with real occupancy', () => {
    const runtime = runScenario();
    const list = projectRoomList(runtime.prisoners);
    expect(list.rooms.rows.map((row) => row.instanceId)).toEqual([
      'canteen-1',
      'cell-1',
      'cell-2',
      'cell-3',
      'cell-4',
      'yard-1',
    ]);

    const cell = list.rooms.rows.find((row) => row.instanceId === 'cell-1')!;
    expect(cell.occupancy.current).toBe(runtime.prisoners.roomInstances.occupancyOf('cell-1'));
    expect(cell.occupancy.capacity).toBe(1);
    expect(cell.occupancy.free).toBe(1 - cell.occupancy.current);
    expect(cell.occupancy.utilization?.segments).toBe(BOUNDED_VALUE_SEGMENTS);
  });

  it('reports object requirements as capability-checked and everything else as not evaluated', () => {
    const runtime = runScenario();
    const detail = projectRoomDetail(runtime.prisoners, 'cell-1')!;

    // room.cell requires a bed ('sleep-surface') and a toilet ('sanitation');
    // the fixture registers both capabilities on the instance.
    const objectRequirements = detail.requirements.filter((requirement) => requirement.type === 'object');
    expect(objectRequirements.map((requirement) => requirement.objectId)).toEqual(['object.bed', 'object.toilet']);
    expect(objectRequirements.every((requirement) => requirement.status === 'satisfied-by-capability')).toBe(true);
    expect(objectRequirements[0]?.objectNameKey).toBe('object.bed.name');

    // Enclosure and size are not derivable: a RoomInstance carries an anchor
    // tile and nothing else, and RoomSystem's own size check is mocked.
    for (const requirement of detail.requirements) {
      if (requirement.type === 'object') continue;
      expect(requirement.status).toBe('not-evaluated');
    }
    expect(detail.requirementSummary).toMatchObject({ objectRequirements: 2, satisfiedByCapability: 2, missingCapability: 0 });
  });

  it('flags a missing required-object capability', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    runtime.prisoners.roomInstances.register({
      instanceId: 'cell-bare',
      roomCatalogId: 'room.cell',
      anchorTile: { x: 12, y: 12 } as never,
      capacity: 1,
      objectCapabilities: ['sleep-surface'],
    });
    const detail = projectRoomDetail(runtime.prisoners, 'cell-bare')!;
    const toilet = detail.requirements.find((requirement) => requirement.objectId === 'object.toilet')!;
    expect(toilet.status).toBe('missing-capability');
    expect(detail.requirementSummary).toMatchObject({ satisfiedByCapability: 1, missingCapability: 1 });
  });

  it('sorts occupants by entity id rather than by Set insertion order', () => {
    const runtime = runScenario();
    const detail = projectRoomDetail(runtime.prisoners, 'cell-1')!;
    expect([...detail.occupantEntityIds].sort((left, right) => left - right)).toEqual(detail.occupantEntityIds);
  });

  it('attaches a security grade only when the caller supplies a room-to-sector mapping', () => {
    const runtime = runScenario();
    expect(projectRoomDetail(runtime.prisoners, 'cell-1')!.security).toBeUndefined();

    const withSector = projectRoomDetail(runtime.prisoners, 'cell-1', {
      sectors: runtime.securitySectors,
      sectorIdByRoomInstanceId: new Map([['cell-1', 'sector-a']]),
    })!;
    expect(withSector.security).toMatchObject({
      sectorId: 'sector-a',
      gradeId: 'grade.general',
      gradeNameKey: 'grade.general.name',
      minSecurityClearance: 0,
    });
  });

  it('returns undefined for an unregistered instance id', () => {
    const runtime = runScenario();
    expect(projectRoomDetail(runtime.prisoners, 'no-such-room')).toBeUndefined();
  });
});

describe('staff', () => {
  it('projects real roles, assignments and coverage', () => {
    const runtime = runScenario();
    const staff = projectStaff(
      { staff: runtime.securityGuards, deployment: runtime.deploymentSystem, patrol: runtime.patrolSystem },
      runtime.kernel.tick,
    );

    expect(staff.roster.total).toBe(5);
    expect(staff.roster.rows.every((row) => row.staffRoleId === 'staff-role.guard')).toBe(true);
    expect(staff.roster.rows[0]).toMatchObject({ department: 'security', baseSecurityClearance: 5 });
    expect(staff.roster.rows[0]?.permissions).toEqual(['security-wing']);

    // Every catalog role appears, so a HUD row never appears and vanishes.
    expect(staff.countsByRoleId).toHaveLength(8);
    expect(staff.countsByRoleId.find((entry) => entry.staffRoleId === 'staff-role.guard')?.count).toBe(5);
    expect(staff.countsByRoleId.find((entry) => entry.staffRoleId === 'staff-role.nurse')?.count).toBe(0);

    expect(staff.countsByDeploymentPhase.map((entry) => entry.deploymentPhase)).toEqual([
      'unassigned',
      'travelling',
      'on-post',
      'on-search',
    ]);
    expect(staff.countsByDeploymentPhase.reduce((sum, entry) => sum + entry.count, 0)).toBe(5);

    expect(staff.coverage.map((entry) => entry.sectorId)).toEqual(['sector-a', 'sector-b']);
    for (const entry of staff.coverage) {
      expect(entry.required).toBe(1);
      expect(entry.shortage).toBe(Math.max(0, entry.required - entry.assigned));
    }
    expect(staff.patrolMetrics).toEqual(runtime.patrolSystem.getMetrics());
    expect(staff.deploymentMetrics).toEqual(runtime.deploymentSystem.getMetrics());
  });

  it('works with no deployment or patrol system wired', () => {
    const runtime = runScenario();
    const staff = projectStaff({ staff: runtime.securityGuards }, runtime.kernel.tick);
    expect(staff.coverage).toEqual([]);
    expect(staff.patrolMetrics).toBeUndefined();
    expect(staff.totals.hired).toBe(5);
  });
});

describe('security', () => {
  it('projects sectors, their doors, patrol routes and staffing', () => {
    const runtime = runScenario();
    const security = projectSecurity(
      {
        sectors: runtime.securitySectors,
        doors: runtime.navigation.doors,
        staff: runtime.securityGuards,
        deployment: runtime.deploymentSystem,
        patrol: runtime.patrolSystem,
        incidents: runtime.incidents,
      },
      runtime.kernel.tick,
    );

    expect(security.sectors.map((sector) => sector.sectorId)).toEqual(['sector-a', 'sector-b']);
    const sectorA = security.sectors[0]!;
    expect(sectorA.controlState).toBe(runtime.securitySectors.getControlState('sector-a'));
    expect(sectorA.doors.map((door) => door.doorId)).toEqual(['door-1']);
    expect(sectorA.doors[0]).toMatchObject({ state: 'open', requiredSecurityClearance: 0 });
    expect(sectorA.patrol).toMatchObject({ hasRoute: true, waypointCount: 2, expectedLoopTicks: 40 });
    expect(security.sectors[1]?.patrol.hasRoute).toBe(false);

    expect(sectorA.staffing.assigned).toBe(
      staffAssignedTo(runtime, 'sector-a'),
    );
    expect([...sectorA.staffing.guardEntityIds].sort((left, right) => left - right)).toEqual(sectorA.staffing.guardEntityIds);
  });

  it('projects the real access policy vocabulary and no invented grades', () => {
    const runtime = runScenario();
    const security = projectSecurity({ sectors: runtime.securitySectors }, runtime.kernel.tick);

    expect(security.accessPolicy.prisonerClassifications.map((entry) => entry.classificationGroupId)).toEqual([
      'general-population',
      'high-risk',
    ]);
    expect(security.accessPolicy.grades.map((grade) => grade.gradeId)).toEqual([
      'grade.administrative',
      'grade.general',
      'grade.high-security',
      'grade.medical',
      'grade.staff-only',
    ]);
    expect(security.accessPolicy.staffRoles).toHaveLength(8);
  });

  it('reflects a real lockdown cascade rather than a parallel flag', () => {
    const runtime = runScenario();
    runtime.securitySectors.setControlState('sector-a', 'lockdown');
    const security = projectSecurity(
      { sectors: runtime.securitySectors, doors: runtime.navigation.doors },
      runtime.kernel.tick,
    );
    expect(security.sectors[0]?.controlState).toBe('lockdown');
    expect(security.sectors[0]?.doors[0]?.state).toBe('locked');
    expect(security.totals.sectorsUnderLockdown).toBe(1);
  });
});

function staffAssignedTo(runtime: SimulationRuntime, sectorId: string): number {
  let count = 0;
  for (const guardId of runtime.securityGuards.allGuardIds()) {
    if (runtime.securityGuards.getSectorId(guardId) === sectorId && runtime.securityGuards.getDeploymentPhase(guardId) !== 'unassigned') count += 1;
  }
  return count;
}

describe('contraband', () => {
  it('projects search orders, policy and metrics from the real search system', () => {
    const runtime = runScenario();
    const contraband = projectContraband({
      searchSystem: runtime.searchSystem,
      confiscations: runtime.confiscations,
      intelligence: runtime.intelligence,
      informants: runtime.informants,
      searchPolicies: runtime.searchPolicies,
    });

    expect(contraband.policies.map((policy) => policy.scope)).toEqual(['cell']);
    expect(contraband.policies[0]?.baseDetectionProbability.permille).toBe(500);
    expect(contraband.metrics).toMatchObject(runtime.searchSystem.getMetrics());
    for (const order of contraband.searchOrders) {
      expect(['queued', 'travelling', 'searching']).toContain(order.state);
      expect(order.targetCount).toBeGreaterThan(0);
    }
  });

  it('projects discovered evidence and suspicion, never the concealed ground truth', () => {
    const runtime = runScenario();
    const contraband = projectContraband({
      searchSystem: runtime.searchSystem,
      confiscations: runtime.confiscations,
      intelligence: runtime.intelligence,
      searchPolicies: runtime.searchPolicies,
    });

    expect(contraband.discovered.total).toBe(runtime.confiscations.all().length);
    for (const found of contraband.discovered.rows) {
      expect(runtime.contraband.get(found.itemId)?.state).toBe('confiscated');
      expect(found.categoryNameKey).toMatch(/^contraband\./);
    }

    // Every still-concealed item must be absent from the projection.
    const projectedIds = new Set(contraband.discovered.rows.map((row) => row.itemId));
    for (const item of runtime.contraband.all()) {
      if (item.state === 'concealed') expect(projectedIds.has(item.id)).toBe(false);
    }

    expect(contraband.intelligence.map((record) => record.recordId)).toEqual(
      runtime.intelligence.all().map((record) => record.id),
    );
    for (const record of contraband.intelligence) {
      expect(record.confidence.permille).toBeGreaterThan(0);
      expect(record.confidence.permille).toBeLessThanOrEqual(1_000);
    }

    expect(contraband.discoveredByCategoryId).toHaveLength(5);
    expect(contraband.discoveredByCategoryId.reduce((sum, entry) => sum + entry.count, 0)).toBe(contraband.discovered.total);
  });
});

describe('incidents', () => {
  function withIncidents(runtime: SimulationRuntime): SimulationRuntime {
    // Opened and transitioned through the real IncidentLog lifecycle, not
    // hand-assembled records: an illegal transition would throw here.
    runtime.incidents.open(
      {
        id: 'incident.riot.probe',
        type: 'riot',
        sectorId: 'sector-a',
        participantIds: [7, 3, 11],
        severity: 8,
        causeFactors: [{ kind: 'sustained-sector-risk', value: 0.82 }],
      },
      runtime.kernel.tick,
    );
    runtime.incidents.open(
      {
        id: 'incident.assault.probe',
        type: 'assault',
        sectorId: 'sector-b',
        participantIds: [2],
        severity: 3,
        causeFactors: [{ kind: 'needs-pressure', value: 0.4 }],
      },
      runtime.kernel.tick,
    );
    runtime.incidents.transition('incident.assault.probe', 'notified', runtime.kernel.tick + 1);
    runtime.incidents.transition('incident.assault.probe', 'responding', runtime.kernel.tick + 2);
    runtime.incidents.transition('incident.assault.probe', 'resolved', runtime.kernel.tick + 3, {
      injuredEntityIds: [2],
      propertyDamage: 1,
      escaped: false,
    });
    return runtime;
  }

  it('projects an incident the simulation triggered on its own', () => {
    // The scenario's gang grudge fires a real `gang-retaliation` through
    // `IncidentTriggerSystem` within this tick budget -- so the panel is
    // proven against an incident the simulation produced, not only against
    // ones a test opened.
    const runtime = runScenario();
    const incidents = projectIncidents({ incidents: runtime.incidents }, runtime.kernel.tick);
    const triggered = incidents.active.find((incident) => incident.type === 'gang-retaliation');
    expect(triggered).toBeDefined();
    expect(triggered!.incidentId).toBe('incident.gang-retaliation.1');
    expect(triggered!.sectorId).toBe('sector-a');
    expect(triggered!.severity).toBeGreaterThan(0);
    expect(runtime.incidentTriggerSystem.getMetrics().retaliationsTriggered).toBeGreaterThan(0);
  });

  it('separates active from terminal incidents and summarises outcomes', () => {
    const runtime = withIncidents(runScenario());
    const incidents = projectIncidents({ incidents: runtime.incidents, response: runtime.incidentResponseSystem }, runtime.kernel.tick + 10);

    expect(incidents.active.map((incident) => incident.incidentId)).toEqual([
      'incident.gang-retaliation.1',
      'incident.riot.probe',
    ]);
    expect(incidents.resolved.rows.map((incident) => incident.incidentId)).toEqual(['incident.assault.probe']);
    expect(incidents.summary).toMatchObject({ total: 3, stillOpen: 2, resolved: 1, lapsed: 0, totalInjured: 1, escapes: 0 });
    expect(incidents.countsByState.map((entry) => entry.state)).toEqual(['active', 'notified', 'responding', 'resolved', 'lapsed']);
    expect(incidents.countsByType.reduce((sum, entry) => sum + entry.count, 0)).toBe(3);

    const riot = incidents.active.find((incident) => incident.incidentId === 'incident.riot.probe')!;
    expect(riot).toMatchObject({ type: 'riot', sectorId: 'sector-a', severity: 8, participantCount: 3, terminal: false });
    expect(riot.severityBar).toEqual(toBoundedValue(8, 10));
    expect(riot.ageTicks).toBe(10);
    expect(riot.requiredResponders).toBe(runtime.incidentResponseSystem.requiredResponderCount(8));
  });

  it('never exposes the hidden cause factors that produced an incident', () => {
    const runtime = withIncidents(runScenario());
    const projected = JSON.stringify({
      list: projectIncidents({ incidents: runtime.incidents }, runtime.kernel.tick),
      detail: projectIncidentDetail({ incidents: runtime.incidents }, 'incident.riot.probe', runtime.kernel.tick),
    });
    expect(projected).not.toContain('causeFactors');
    expect(projected).not.toContain('sustained-sector-risk');
    expect(projected).not.toContain('0.82');
  });

  it('projects the detail view with a sorted participant list and a chronological timeline', () => {
    const runtime = withIncidents(runScenario());
    const detail = projectIncidentDetail({ incidents: runtime.incidents }, 'incident.assault.probe', runtime.kernel.tick + 5)!;

    expect(detail.participantEntityIds).toEqual([2]);
    expect(detail.timeline.map((entry) => entry.state)).toEqual(['active', 'notified', 'responding', 'resolved']);
    expect(detail.timeline.map((entry) => entry.atTick)).toEqual([TICKS, TICKS + 1, TICKS + 2, TICKS + 3]);
    expect(detail.outcome).toMatchObject({ injuredCount: 1, propertyDamage: 1, escaped: false });
    expect(detail.injuredEntityIds).toEqual([2]);
  });

  it('returns undefined for an unknown incident id', () => {
    const runtime = runScenario();
    expect(projectIncidentDetail({ incidents: runtime.incidents }, 'incident.nope', runtime.kernel.tick)).toBeUndefined();
  });
});
