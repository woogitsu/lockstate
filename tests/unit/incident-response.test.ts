import { describe, expect, it } from 'vitest';
import { SimulationEventLog } from '../../src/simulation/events';
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
  const events = new SimulationEventLog();
  const response = new IncidentResponseSystem(incidents, sectors, guards, navigation, events, policy);

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

  /**
   * The staffing rule, at the only inputs that can see it (#416).
   *
   * `requiredResponderCount` is `Math.max(1, Math.ceil(severity * 0.5))` and
   * its policy comment says "rounded up". The suite sampled severity 2 and
   * severity 8 -- both even, and half of an even number is an integer, so
   * `Math.ceil` and `Math.floor` returned the same number for every input
   * anything ever passed it. Measured at `54418b6` (v0.0.121):
   * `Math.ceil` -> `Math.floor` left **238 files / 2,696 tests green**. What it ships is a severity-9 riot
   * answered by four guards instead of five, everywhere in the game, silently.
   *
   * The expected counts are worked out from the documented rule and written
   * down, never computed by calling the policy through the same expression the
   * production code uses. Two places did that and have been changed with this
   * one: `tests/unit/hud-projections.test.ts` asserted the projected figure
   * against `requiredResponderCount(8)` -- the very method the projection
   * calls, so both sides were one side and it caught nothing at all
   * (measured); and `tests/integration/incident-response-restore.test.ts`
   * re-derived the requirement from the policy, which follows a changed rule
   * instead of failing on it.
   */
  it('rounds the responder requirement up, which only an odd severity can show', () => {
    const { response } = buildHarness();

    // ceil(1.5)=2, ceil(2.5)=3, ceil(3.5)=4, ceil(4.5)=5. Rounding down would
    // answer 1, 2, 3, 4 -- one guard short at every odd severity there is.
    expect(response.requiredResponderCount(3)).toBe(2);
    expect(response.requiredResponderCount(5)).toBe(3);
    expect(response.requiredResponderCount(7)).toBe(4);
    expect(response.requiredResponderCount(9)).toBe(5);

    // The floor of the same expression, and it is deliberately a different
    // list: a fixture that could not distinguish the two is the defect this
    // case exists for.
    expect([3, 5, 7, 9].map((severity) => response.requiredResponderCount(severity))).not.toEqual([1, 2, 3, 4]);

    // Even severities still round to the same figures they always did, so
    // this is a floor pinned at the ceiling and not a change of rule.
    expect(response.requiredResponderCount(2)).toBe(1);
    expect(response.requiredResponderCount(8)).toBe(4);
    // And the `max(1, ...)`: severity 1 halves to 0.5, which no prison answers
    // with nobody.
    expect(response.requiredResponderCount(1)).toBe(1);
  });

  it('refuses to dispatch an odd-severity incident on the rounded-down number of guards', () => {
    // The same rule where a player would meet it. Severity 3 needs two guards;
    // one is what rounding down would call enough. Below the lockdown
    // threshold (6), so nothing here depends on doors.
    const { cellBlock, guards, incidents, response, kernel } = buildHarness();
    incidents.open({ id: 'incident-odd', type: 'assault', sectorId: 'block-a', participantIds: [1], severity: 3, causeFactors: [] }, 0);
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);

    for (let i = 0; i < 20; i += 1) kernel.step();

    expect(incidents.get('incident-odd')!.state, 'one guard is not enough for a severity-3 incident').toBe('active');
    expect(response.getMetrics().respondersDispatched).toBe(0);
    expect(guards.getDeploymentPhase(guards.allGuardIds()[0]!)).toBe('unassigned'); // never claimed

    // And the second guard is what unblocks it, so this is a boundary rather
    // than an incident that could never have been answered at all: the
    // response is mounted with exactly two, and it resolves.
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    for (let tick = 0; tick < 2_000 && response.getMetrics().incidentsResolved < 1; tick += 1) kernel.step();

    expect(incidents.get('incident-odd')!.state).toBe('resolved');
    expect(response.getMetrics().respondersDispatched).toBe(2);
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
   * **The reason this lapses is the empty roster, and it is asserted rather
   * than left implicit.**
   *
   * This case used to carry the comment *"live response bookkeeping references
   * the previous NavigationSystem's request queue, so a restored open incident
   * has no active response -- it must lapse at its deadline rather than
   * silently resolving"*, and that stopped being the restore outcome when
   * ADR 0033's amendment (its open question 1, built) made
   * `redispatchInterruptedResponses` mount a *fresh* response to a still-open
   * incident no record claims. A restored mid-response incident in a staffed
   * prison now resolves -- the sibling case below runs exactly that, and
   * `tests/integration/incident-response-restore.test.ts` prices it through the
   * real save path.
   *
   * What is left here is the first of that pass's refusals: `buildHarness`
   * builds its own empty `GuardRoster`, so the restored session has nobody to
   * claim and `claimableResponders` returns `undefined`. The lapse is then
   * ADR 0033 decision 1's outcome, which is still issue #28's consistent
   * failure rather than a hidden success. The premise is asserted below so that
   * a harness which one day carries guards over fails here instead of quietly
   * turning this case into the sibling one.
   *
   * **This case is why the rotted sentence survived.** `docs/INCIDENTS.md`'s
   * "Snapshot/restore" section carried the same claim, cited this file as
   * proving it directly, and its correction names exactly this: *"The cited
   * test still passes, which is why nothing caught it: its `restored` harness
   * hires no guard, so there is nobody to re-dispatch — a special case that was
   * being read as the general rule."* Correcting the document left the special
   * case still reading as the general rule here and in
   * `IncidentResponseSystem.loadSnapshot`'s docstring; this commit closes both,
   * which is the class rather than the instance.
   */
  it('a restored mid-response incident whose pool cannot refill lapses rather than hidden-succeeding', () => {
    const policy: IncidentResponsePolicy = { ...DEFAULT_INCIDENT_RESPONSE_POLICY, responseDeadlineTicks: 200 };
    const original = buildHarness(policy);
    original.guards.hire('staff-role.guard', original.cellBlock.canteenTiles[0]!);
    original.incidents.open({ id: 'incident-1', type: 'assault', sectorId: 'block-a', participantIds: [1], severity: 2, causeFactors: [] }, 0);
    original.kernel.step(); // dispatch happens; guard is mid-route
    expect(original.incidents.get('incident-1')!.state).toBe('notified');

    const restored = buildHarness(policy);
    restored.incidents.loadSnapshot(original.incidents.getSnapshot());
    restored.response.loadSnapshot(original.response.getSnapshot());
    // The refusal this case is about, named: no responder is claimable, so the
    // re-dispatch cannot run and the incident falls through to the deadline.
    expect(restored.guards.unassignedGuardIds()).toEqual([]);

    for (let tick = 0; tick < 500 && restored.incidents.get('incident-1')!.state === 'notified'; tick += 1) restored.kernel.step();

    expect(restored.incidents.get('incident-1')!.state).toBe('lapsed');
    // Narrower than the call above it: `incidentsResolved` is 0 on a system that
    // was never given a snapshot at all, so this pins the lapse and not the
    // restore. The case below is the one that reads what `loadSnapshot` carried.
    expect(restored.response.getMetrics().incidentsResolved).toBe(0);
  });

  /**
   * The other side of the same refusal, and the claim the `loadSnapshot`
   * docstring now makes: a restored mid-response incident whose pool *can*
   * refill is re-dispatched to and **resolves**, at unit level, on the first
   * scheduled update after the load.
   *
   * The two cases differ by one line -- whether the restored harness has a
   * guard -- so what they isolate is the re-dispatch itself rather than any
   * property of the save path.
   */
  it('a restored mid-response incident whose pool can refill is re-dispatched to and resolves', () => {
    const policy: IncidentResponsePolicy = { ...DEFAULT_INCIDENT_RESPONSE_POLICY, responseDeadlineTicks: 200 };
    const original = buildHarness(policy);
    original.guards.hire('staff-role.guard', original.cellBlock.canteenTiles[0]!);
    original.incidents.open({ id: 'incident-1', type: 'assault', sectorId: 'block-a', participantIds: [1], severity: 2, causeFactors: [] }, 0);
    original.kernel.step(); // dispatch happens; guard is mid-route
    expect(original.incidents.get('incident-1')!.state).toBe('notified');

    const restored = buildHarness(policy);
    // The responder the save stranded, as a restored session actually carries
    // it: still on `'on-search'`, claimed by a record that no longer exists.
    restored.guards.hire('staff-role.guard', restored.cellBlock.canteenTiles[0]!);
    const strandedGuardId = restored.guards.allGuardIds()[0]!;
    restored.guards.setDeploymentPhase(strandedGuardId, 'on-search');
    restored.incidents.loadSnapshot(original.incidents.getSnapshot());
    restored.response.loadSnapshot(original.response.getSnapshot());
    expect(restored.guards.unassignedGuardIds()).toEqual([]); // held by the claim, before the sweep

    for (let tick = 0; tick < 500 && restored.incidents.get('incident-1')!.state !== 'resolved'; tick += 1) restored.kernel.step();

    // Released, re-claimed and released again -- and the outcome is the
    // contained one, not the lapse ADR 0033 decision 1 alone would have left.
    expect(restored.incidents.get('incident-1')!.state).toBe('resolved');
    expect(restored.incidents.get('incident-1')!.outcome).toEqual({ injuredEntityIds: [], propertyDamage: 1, escaped: false });
    expect(restored.guards.getDeploymentPhase(strandedGuardId)).toBe('unassigned');
    // The counter the snapshot carried, plus the second dispatch that really
    // happened -- read off the original rather than written as a literal.
    expect(restored.response.getMetrics().respondersDispatched).toBe(
      original.response.getMetrics().respondersDispatched + 1,
    );
  });

  /**
   * The counters `IncidentResponseSystem.loadSnapshot`'s own comment calls the
   * only thing that survives a restore -- "Only metrics survive a restore" --
   * driven so that dropping them fails here (#375).
   *
   * Measured at v0.0.98: replacing the four assignments in that method with
   * `return;` left this file 10/10 green, and the whole suite at 216/217 files
   * -- one failure, and not here. The mutation was killed, but only by
   * `tests/determinism/snapshot-restore-fidelity.test.ts`, which is not the file
   * that names the mechanism -- the shape `tests/unit/camera-coordinates.test.ts`
   * records as having let #115 ship.
   *
   * Four distinct non-zero counters, written out rather than read back, so a
   * `loadSnapshot` that drops one or assigns one twice fails. Each is a state
   * this system reaches: the cases above drive a resolution, a lapse, a
   * dispatch and (via `security-patrol.test.ts`'s sibling path) a route
   * failure.
   */
  it('carries every response counter it is handed, and clears the live bookkeeping with them', () => {
    const harness = buildHarness();
    expect(harness.response.getMetrics()).toEqual({ incidentsResolved: 0, incidentsLapsed: 0, respondersDispatched: 0, routeFailures: 0 });

    harness.response.loadSnapshot({ metrics: { incidentsResolved: 4, incidentsLapsed: 3, respondersDispatched: 2, routeFailures: 1 } });

    expect(harness.response.getMetrics()).toEqual({
      incidentsResolved: 4,
      incidentsLapsed: 3,
      respondersDispatched: 2,
      routeFailures: 1,
    });
  });
});
