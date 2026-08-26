import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import { IncidentLog } from '../../src/simulation/incidents/incident';
import { DEFAULT_INCIDENT_RESPONSE_POLICY, IncidentResponseSystem, type IncidentResponsePolicy } from '../../src/simulation/incidents/response-system';

// Cell index avoiding buildCellBlockFixture's `i % 5 === 0` medical gating and `i % 7 === 0` closed doors.
const OPEN_CELL_INDEX = 1;

function buildHarness(policy: IncidentResponsePolicy = DEFAULT_INCIDENT_RESPONSE_POLICY) {
  const cellBlock = buildCellBlockFixture(8);
  const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const sectors = new SecuritySectorRegistry(cellBlock.doors);
  sectors.register({ id: 'block-a', gradeId: 'grade.general', doorIds: [`cell-door-${OPEN_CELL_INDEX}`], postTile: cellBlock.cellTiles[OPEN_CELL_INDEX]! });

  const guards = new GuardRoster(64);
  const incidents = new IncidentLog();
  const response = new IncidentResponseSystem(incidents, sectors, guards, navigation, policy);

  const kernel = new Kernel();
  kernel.registerSystem(navigation);
  kernel.registerSystem(response);

  return { cellBlock, navigation, sectors, guards, incidents, response, kernel };
}

describe('IncidentResponseSystem: real guards, real routes, real lockdown', () => {
  it('dispatches guards, walks them through navigation, and resolves the incident', () => {
    const { cellBlock, guards, incidents, response, kernel } = buildHarness();
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    incidents.open({ id: 'incident-1', type: 'assault', sectorId: 'block-a', participantIds: [1, 2], severity: 2, causeFactors: [] }, 0);

    for (let tick = 0; tick < 1_000 && response.getMetrics().incidentsResolved < 1; tick += 1) kernel.step();

    const incident = incidents.get('incident-1')!;
    expect(incident.state).toBe('resolved');
    expect(incident.timeline.map((entry) => entry.state)).toEqual(['active', 'notified', 'responding', 'resolved']);
    expect(incident.outcome).toEqual({ injuredEntityIds: [], propertyDamage: 1, escaped: false });
    expect(response.getMetrics().incidentsResolved).toBe(1);
    expect(guards.getDeploymentPhase(guards.allGuardIds()[0]!)).toBe('unassigned'); // released after resolution
  });

  it('scales required responders with severity and stays in active while understaffed', () => {
    const { cellBlock, guards, incidents, response, kernel } = buildHarness();
    expect(response.requiredResponderCount(2)).toBe(1);
    expect(response.requiredResponderCount(8)).toBe(4);

    incidents.open({ id: 'incident-big', type: 'riot', sectorId: 'block-a', participantIds: [1], severity: 8, causeFactors: [] }, 0);
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!); // only 1 of the 4 required

    for (let i = 0; i < 20; i += 1) kernel.step();

    expect(incidents.get('incident-big')!.state).toBe('active'); // observable understaffing, not a silent resolve
    expect(response.getMetrics().respondersDispatched).toBe(0);
    expect(guards.getDeploymentPhase(guards.allGuardIds()[0]!)).toBe('unassigned'); // never claimed
  });

  it('a severe incident drives the sector into real lockdown and back to normal on resolution', () => {
    const { cellBlock, sectors, guards, incidents, response, kernel } = buildHarness();
    for (let i = 0; i < 4; i += 1) guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    expect(sectors.getControlState('block-a')).toBe('normal');

    incidents.open({ id: 'incident-riot', type: 'riot', sectorId: 'block-a', participantIds: [1, 2, 3], severity: 8, causeFactors: [] }, 0);

    // Step until dispatch has happened, then assert the lockdown is live.
    for (let i = 0; i < 50 && incidents.get('incident-riot')!.state === 'active'; i += 1) kernel.step();
    expect(sectors.getControlState('block-a')).toBe('lockdown');
    expect(cellBlock.doors.getById(`cell-door-${OPEN_CELL_INDEX}`)!.state).toBe('locked');

    for (let tick = 0; tick < 2_000 && response.getMetrics().incidentsResolved < 1; tick += 1) kernel.step();

    expect(incidents.get('incident-riot')!.state).toBe('resolved');
    expect(sectors.getControlState('block-a')).toBe('normal'); // lifted on resolution
  });

  /**
   * Regression: the lockdown a severe incident applies locks the very doors
   * responders must cross to reach it. Without `emergencyOverride` on the
   * responder route context, every severe incident sealed its own responders
   * out and lapsed. `emergencyOverride` bypasses `'locked'` only -- clearance
   * and permission requirements still apply.
   */
  it('responders cross the doors their own lockdown just locked', () => {
    const { cellBlock, sectors, guards, incidents, response, kernel } = buildHarness();
    // Guards start on the far side of the sector's own (about to be locked) door.
    for (let i = 0; i < 4; i += 1) guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    incidents.open({ id: 'incident-riot', type: 'riot', sectorId: 'block-a', participantIds: [1], severity: 8, causeFactors: [] }, 0);

    for (let i = 0; i < 50 && incidents.get('incident-riot')!.state === 'active'; i += 1) kernel.step();
    expect(cellBlock.doors.getById(`cell-door-${OPEN_CELL_INDEX}`)!.state).toBe('locked');

    for (let tick = 0; tick < 2_000 && response.getMetrics().incidentsResolved < 1; tick += 1) kernel.step();

    expect(response.getMetrics().routeFailures).toBe(0);
    expect(incidents.get('incident-riot')!.state).toBe('resolved');
    expect(sectors.getControlState('block-a')).toBe('normal');
  });

  it('a low-severity incident never triggers a lockdown', () => {
    const { cellBlock, sectors, guards, incidents, kernel } = buildHarness();
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    incidents.open({ id: 'incident-small', type: 'assault', sectorId: 'block-a', participantIds: [1], severity: 2, causeFactors: [] }, 0);

    for (let i = 0; i < 50 && incidents.get('incident-small')!.state === 'active'; i += 1) kernel.step();
    expect(sectors.getControlState('block-a')).toBe('normal');
  });

  /** Issue #28: "failed/late response produces consistent outcomes rather than hidden success." */
  it('lapses with injuries and damage when no guards exist to respond before the deadline', () => {
    const { incidents, response, kernel } = buildHarness({ ...DEFAULT_INCIDENT_RESPONSE_POLICY, responseDeadlineTicks: 100 });
    incidents.open({ id: 'incident-ignored', type: 'assault', sectorId: 'block-a', participantIds: [4, 2], severity: 6, causeFactors: [] }, 0);

    for (let tick = 0; tick < 300 && response.getMetrics().incidentsLapsed < 1; tick += 1) kernel.step();

    const incident = incidents.get('incident-ignored')!;
    expect(incident.state).toBe('lapsed');
    expect(incident.outcome).toEqual({ injuredEntityIds: [2, 4], propertyDamage: 6, escaped: false }); // sorted participants, damage = severity
    expect(response.getMetrics().incidentsLapsed).toBe(1);
    expect(response.getMetrics().incidentsResolved).toBe(0);
  });

  it('an un-responded escape attempt lapses with escaped: true', () => {
    const { incidents, response, kernel } = buildHarness({ ...DEFAULT_INCIDENT_RESPONSE_POLICY, responseDeadlineTicks: 100 });
    incidents.open({ id: 'incident-escape', type: 'escape-attempt', sectorId: 'block-a', participantIds: [9], severity: 7, causeFactors: [] }, 0);

    for (let tick = 0; tick < 300 && response.getMetrics().incidentsLapsed < 1; tick += 1) kernel.step();

    expect(incidents.get('incident-escape')!.outcome).toEqual({ injuredEntityIds: [9], propertyDamage: 7, escaped: true });
  });

  it('a contained incident produces a materially better outcome than a lapsed one of identical severity', () => {
    const severity = 6;

    const contained = buildHarness();
    contained.guards.hire('staff-role.guard', contained.cellBlock.canteenTiles[0]!);
    contained.guards.hire('staff-role.guard', contained.cellBlock.canteenTiles[0]!);
    contained.guards.hire('staff-role.guard', contained.cellBlock.canteenTiles[0]!);
    contained.incidents.open({ id: 'incident-x', type: 'assault', sectorId: 'block-a', participantIds: [1, 2], severity, causeFactors: [] }, 0);
    for (let tick = 0; tick < 2_000 && contained.response.getMetrics().incidentsResolved < 1; tick += 1) contained.kernel.step();

    const lapsed = buildHarness({ ...DEFAULT_INCIDENT_RESPONSE_POLICY, responseDeadlineTicks: 100 });
    lapsed.incidents.open({ id: 'incident-x', type: 'assault', sectorId: 'block-a', participantIds: [1, 2], severity, causeFactors: [] }, 0);
    for (let tick = 0; tick < 300 && lapsed.response.getMetrics().incidentsLapsed < 1; tick += 1) lapsed.kernel.step();

    const containedOutcome = contained.incidents.get('incident-x')!.outcome!;
    const lapsedOutcome = lapsed.incidents.get('incident-x')!.outcome!;

    expect(containedOutcome.injuredEntityIds).toHaveLength(0);
    expect(lapsedOutcome.injuredEntityIds).toHaveLength(2);
    expect(containedOutcome.propertyDamage).toBeLessThan(lapsedOutcome.propertyDamage);
  });

  it('is deterministic: an identical scenario replays to an identical incident record', () => {
    function run() {
      const harness = buildHarness();
      harness.guards.hire('staff-role.guard', harness.cellBlock.canteenTiles[0]!);
      harness.incidents.open({ id: 'incident-1', type: 'assault', sectorId: 'block-a', participantIds: [1, 2], severity: 2, causeFactors: [] }, 0);
      for (let tick = 0; tick < 1_000 && harness.response.getMetrics().incidentsResolved < 1; tick += 1) harness.kernel.step();
      return { incident: harness.incidents.get('incident-1'), metrics: harness.response.getMetrics() };
    }

    expect(run()).toEqual(run());
  });

  /**
   * Since save-schema V6 (#352) the response record survives a restore, so a
   * restored mid-travel response resumes: it re-issues the path requests the
   * *previous* `NavigationSystem` instance owned, arrives, contains the
   * incident and -- the part that was the defect -- releases the guard it
   * claimed.
   *
   * Before V6 this test asserted the incident lapsed, which was true and was
   * not the whole story: the guard stayed `'on-search'` forever and the sector
   * stayed locked down, because `releaseResponse` had no record left to read.
   * The two assertions that mattered are kept below -- no hidden success, and
   * `incidentsResolved` is honest -- and the case where they still apply is
   * pinned by the test after this one.
   */
  it('a restored mid-response incident resumes and releases the guard it claimed', () => {
    const policy: IncidentResponsePolicy = { ...DEFAULT_INCIDENT_RESPONSE_POLICY, responseDeadlineTicks: 200 };
    const original = buildHarness(policy);
    original.guards.hire('staff-role.guard', original.cellBlock.canteenTiles[0]!);
    original.incidents.open({ id: 'incident-1', type: 'assault', sectorId: 'block-a', participantIds: [1], severity: 2, causeFactors: [] }, 0);
    original.kernel.step(); // dispatch happens; guard is mid-route
    expect(original.incidents.get('incident-1')!.state).toBe('notified');
    expect(original.guards.getDeploymentPhase(0)).toBe('on-search');

    // The three snapshots a real restore applies, in `restoreSessionSystems`'
    // order: the roster the response points at, then the log, then the response.
    const restored = buildHarness(policy);
    restored.guards.loadSnapshot(original.guards.getSnapshot());
    restored.incidents.loadSnapshot(original.incidents.getSnapshot());
    restored.response.loadSnapshot(original.response.getSnapshot());

    for (let tick = 0; tick < 500 && restored.incidents.get('incident-1')!.state !== 'resolved'; tick += 1) restored.kernel.step();

    expect(restored.incidents.get('incident-1')!.state).toBe('resolved');
    expect(restored.response.getMetrics().incidentsResolved).toBe(1);
    // The whole of #352: the responder goes back into the pool.
    expect(restored.guards.getDeploymentPhase(0)).toBe('unassigned');
    expect(restored.guards.unassignedGuardIds()).toEqual([0]);
  });

  /**
   * The residual no-record path, which V6 narrows rather than removes: a
   * payload can still name an open incident and no response for it (the
   * V5 -> V6 migration emits that when it cannot attribute responders). Such an
   * incident must lapse at its deadline rather than silently resolving -- issue
   * #28's consistent-failure outcome -- and, since no record means nothing was
   * claimed, nothing is left stranded by it either.
   */
  it('an open incident restored with no response record lapses rather than hidden-succeeding', () => {
    const policy: IncidentResponsePolicy = { ...DEFAULT_INCIDENT_RESPONSE_POLICY, responseDeadlineTicks: 200 };
    const original = buildHarness(policy);
    original.guards.hire('staff-role.guard', original.cellBlock.canteenTiles[0]!);
    original.incidents.open({ id: 'incident-1', type: 'assault', sectorId: 'block-a', participantIds: [1], severity: 2, causeFactors: [] }, 0);
    original.kernel.step();
    expect(original.incidents.get('incident-1')!.state).toBe('notified');

    const restored = buildHarness(policy);
    restored.guards.loadSnapshot(original.guards.getSnapshot());
    restored.incidents.loadSnapshot(original.incidents.getSnapshot());
    restored.response.loadSnapshot({ ...original.response.getSnapshot(), responses: [] });

    for (let tick = 0; tick < 500 && restored.incidents.get('incident-1')!.state === 'notified'; tick += 1) restored.kernel.step();

    expect(restored.incidents.get('incident-1')!.state).toBe('lapsed');
    expect(restored.response.getMetrics().incidentsResolved).toBe(0);
  });
});
