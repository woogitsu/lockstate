import { expect, test } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { constantDeploymentSchedule, createGradedDoor } from '../../src/simulation/security';
import { DEFAULT_SECURITY_SECTOR_ID } from '../../src/simulation/security/default-sector';
import { useSearchPolicy } from '../helpers/search-policy';
import {
  chunkCoordinate,
  tileCoordinate,
} from '../../src/simulation/world/coordinates';


test('new-session runtime owns an initial loaded chunk and applies build commands', () => {
  const runtime = createNewSimulationRuntime();
  const initialChunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

  expect(runtime.world.getChunk(initialChunk)?.lifecycle).toBe('loaded');
  expect(runtime.world.isOwned(initialChunk)).toBe(true);

  runtime.kernel.submitCommand(
    'build-1',
    0,
    0,
    packCommand({
      type: 'PlaceBuildOrder',
      orderId: 'wall-1',
      definitionId: 'wall-brick',
      x: 1,
      y: 1,
    }),
  );
  runtime.kernel.step();

  expect(runtime.construction.getOrder('wall-1')?.state).toBe('materials-pending');
  expect(runtime.world.getLeftEdge({
    x: tileCoordinate(1),
    y: tileCoordinate(1),
  })).toBe(0);
});

test('new-session runtime wires security sectors, guard deployment and patrol', () => {
  const runtime = createNewSimulationRuntime();

  const doorPosition = { x: tileCoordinate(2), y: tileCoordinate(1) };
  runtime.navigation.doors.register(createGradedDoor('door-1', doorPosition, 'left', 'open', 'grade.general'));

  const postTile = { x: tileCoordinate(3), y: tileCoordinate(1) };
  runtime.securitySectors.register({ id: 'sector-1', gradeId: 'grade.general', doorIds: ['door-1'], postTile });
  runtime.securitySchedules.push(constantDeploymentSchedule('sector-1', 1));

  const guardId = runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });

  for (let i = 0; i < 200 && runtime.securityGuards.getDeploymentPhase(guardId) !== 'on-post'; i += 1) {
    runtime.kernel.step();
  }

  expect(runtime.securityGuards.getDeploymentPhase(guardId)).toBe('on-post');
  // Two sectors: this test's own, and the derived default every session now
  // carries (ADR 0036). Sorted by id, `'sector-1'` before
  // `'security-sector.prison'`, which is also the order `assignUnassignedGuards`
  // fills them in -- so the single guard hired here goes to this test's sector
  // and the default one reports the shortage it honestly has.
  //
  // **The derived sector's row moved with issue #533 and `'sector-1'`'s did
  // not**, which is the whole of that change's scope in one assertion. This
  // prison holds no prisoners, so the derived sector -- whose occupants are
  // every prisoner on owned land -- is empty and asks for nobody. `'sector-1'`
  // is a registered sector whose occupant count is only of its post tile, an
  // undercount ADR 0048 accepts because a registered sector records no extent,
  // so its authored schedule stands and it still asks for the one guard this
  // fixture pushed.
  expect(runtime.deploymentSystem.getCoverageReport(0)).toEqual([
    { sectorId: 'sector-1', required: 1, assigned: 1, shortage: 0 },
    { sectorId: 'security-sector.prison', required: 0, assigned: 0, shortage: 0 },
  ]);
});

test('new-session runtime wires contraband, intelligence and search through the real prisoner room-instance registry', () => {
  const runtime = createNewSimulationRuntime();

  runtime.prisoners.roomInstances.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: { x: tileCoordinate(5), y: tileCoordinate(5) }, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
  runtime.contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: 'cell-1' }, { sourceType: 'room-object', sourceId: 'workshop', introducedAtTick: 0 });
  useSearchPolicy(runtime, { scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 1, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 });
  // Two guards for a one-guard search, because the derived default sector takes
  // the first (ADR 0036): `DeploymentSystem` runs at order 270 and
  // `SearchSystem` at 295, both drawing from `unassignedGuardIds()`, so a single
  // hire would be standing on a post rather than available to search.
  runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });
  runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });
  runtime.searchSystem.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: 'cell-1' }] });

  for (let i = 0; i < 500 && runtime.searchSystem.getMetrics().searchesCompleted < 1; i += 1) runtime.kernel.step();

  expect(runtime.searchSystem.getMetrics()).toEqual({ itemsDiscovered: 1, itemsMissed: 0, searchesCompleted: 1, searchesCancelled: 0, searchesQueued: 0 });
  expect(runtime.contraband.get('item-1')?.state).toBe('confiscated');
  expect(runtime.confiscations.all()).toHaveLength(1);
});

test('new-session runtime wires the incident pipeline through real sectors, guards and navigation', () => {
  const runtime = createNewSimulationRuntime();

  const doorPosition = { x: tileCoordinate(2), y: tileCoordinate(1) };
  runtime.navigation.doors.register(createGradedDoor('door-1', doorPosition, 'left', 'open', 'grade.general'));
  const postTile = { x: tileCoordinate(3), y: tileCoordinate(1) };
  runtime.securitySectors.register({ id: 'sector-1', gradeId: 'grade.general', doorIds: ['door-1'], postTile });
  runtime.incidentSectorIds.push('sector-1');

  // Two guards for a one-responder incident, for the reason the search case
  // above hires two: the derived default sector's requirement claims the first
  // (ADR 0036), and `claimableResponders` draws from the unassigned pool.
  runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });
  runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });

  // An incident opened directly on the runtime's own log is driven to resolution by the wired response system.
  runtime.incidents.open({ id: 'incident-1', type: 'assault', sectorId: 'sector-1', participantIds: [1], severity: 2, causeFactors: [] }, 0);

  for (let i = 0; i < 1_000 && runtime.incidentResponseSystem.getMetrics().incidentsResolved < 1; i += 1) runtime.kernel.step();

  expect(runtime.incidents.get('incident-1')!.state).toBe('resolved');
  expect(runtime.incidentResponseSystem.getMetrics().incidentsResolved).toBe(1);
  expect(runtime.securitySectors.getControlState('sector-1')).toBe('normal');
});

test('new-session runtime starts with no fabricated incident or contraband content', () => {
  const runtime = createNewSimulationRuntime();

  expect(runtime.incidents.all()).toEqual([]);
  expect(runtime.tunnels.all()).toEqual([]);
  expect(runtime.contraband.all()).toEqual([]);
  expect(runtime.intelligence.all()).toEqual([]);
});

/**
 * The third exception to the rule above, beside the derived sector and the
 * four search policies below
 * ([ADR 0103](../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
 * decision 1, issue #979).
 *
 * **The test above used to read `expect(runtime.gangs.all()).toEqual([])` and
 * was named "...incident, gang or contraband content"**, and the assertion is
 * moved here rather than deleted for the reason the `searchPolicies` note
 * below gives about its own: an empty gang registry was never "no fabricated
 * content", it was `'gang-retaliation'` -- one of the four `IncidentType`s,
 * with a persisted enum member, a protocol event, a census label, two
 * projections and the sentence *"Two gangs are settling a score."* already
 * written -- having no producer in any prison a player could start. Issue
 * #979 is that finding and ADR 0103 is the decision that closes it.
 *
 * Two, both claiming the one watched sector, and **no member and no grudge**:
 * a gang that claims nothing is structurally inert (ADR 0103 Context 2) and
 * membership is intake's, not session creation's (decision 6). So a fresh
 * runtime still fabricates no *state* -- what it now has is the two subjects
 * the mechanism needs in order to have any.
 */
test('new-session runtime derives the two gangs the retaliation producer needs, and nothing else about them', () => {
  const runtime = createNewSimulationRuntime();

  expect(runtime.gangs.all()).toEqual([
    { id: 'gang.alpha', territorySectorIds: [DEFAULT_SECURITY_SECTOR_ID] },
    { id: 'gang.beta', territorySectorIds: [DEFAULT_SECURITY_SECTOR_ID] },
  ]);
  expect(runtime.gangs.membersOf('gang.alpha')).toEqual([]);
  expect(runtime.gangs.membersOf('gang.beta')).toEqual([]);
  expect(runtime.gangs.allGrudges()).toEqual([]);
});

/**
 * The second exception to the rule above, beside the derived sector below
 * ([ADR 0073](../../docs/adr/0073-who-orders-a-contraband-search.md) Part 1,
 * issue #552).
 *
 * **This assertion used to read `expect(runtime.searchPolicies).toEqual([])`**,
 * and it is replaced rather than deleted because the sentence it stood for was
 * wrong in a way worth recording: an empty policy list is not "no fabricated
 * content", it is `SearchSystem.findPolicy` throwing
 * `No search policy defined for scope "..."` on the first search anything
 * ordered. A policy is tuning for a mechanism that exists, not authored content
 * with a `nameKey`, which is why ADR 0073 records shipping the four as not
 * optional under any of its options.
 *
 * The values are asserted as a floor and a shape rather than pinned, because
 * they are explicitly directional: pinning `dwellTicksPerTarget: 40` here would
 * make a balance pass a test edit. What must not regress is that they are
 * *usable* -- four scopes, one policy each, and no zero that would make a
 * search either free or impossible.
 */
test('new-session runtime ships one usable search policy per scope, because an empty list would throw', () => {
  const runtime = createNewSimulationRuntime();

  expect(runtime.searchPolicies.map((policy) => policy.scope)).toEqual(['cell', 'delivery', 'person', 'sector']);
  for (const policy of runtime.searchPolicies) {
    expect(policy.requiredGuardCount, `${policy.scope} must be staffable`).toBeGreaterThanOrEqual(1);
    expect(policy.dwellTicksPerTarget, `${policy.scope} must cost time`).toBeGreaterThan(0);
    expect(policy.baseDetectionProbability, `${policy.scope} must be able to find something`).toBeGreaterThan(0);
    expect(policy.baseDetectionProbability, `${policy.scope} must not be certain`).toBeLessThanOrEqual(1);
    expect(policy.concealmentPenaltyPerPoint, `${policy.scope} must let concealment matter`).toBeGreaterThan(0);
  }
});

/**
 * The exception to the rule above, and it is the one issue #396 is about
 * ([ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md)).
 *
 * `incidentSectorIds` and `securitySchedules` were both asserted empty by the
 * test above, alongside the registries that genuinely hold authored content.
 * That was the bug rather than the invariant: with all three of them empty,
 * `DeploymentSystem`, `PatrolSystem`, `IncidentTriggerSystem` and
 * `IncidentResponseSystem` were no-ops in every session a player could start.
 *
 * A derived sector is not fabricated content: it carries no authored geometry,
 * no name, no grade nobody chose, and it is a pure function of the world -- so
 * it is re-derived on load rather than persisted, and `SAVE_SCHEMA_VERSION`
 * stays 5. The three values below are written out rather than imported from the
 * module that produces them, so a change to the derivation has to change this
 * test too.
 */
test('new-session runtime derives exactly one security sector, its staffing requirement and its watch entry', () => {
  const runtime = createNewSimulationRuntime();

  expect(runtime.securitySectors.all()).toEqual([
    { id: 'security-sector.prison', gradeId: 'grade.general', doorIds: [], postTile: { x: 16, y: 16 } },
  ]);
  expect(runtime.securitySectors.getControlState('security-sector.prison')).toBe('normal');
  expect(runtime.securitySchedules).toEqual([
    { sectorId: 'security-sector.prison', blocks: [{ startTickOfDay: 0, endTickOfDay: 2_400, requiredGuardCount: 1 }] },
  ]);
  expect(runtime.incidentSectorIds).toEqual(['security-sector.prison']);
});
