import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { defaultStaffRoleRegistry, POST_ELIGIBLE_STAFF_DEPARTMENTS } from '../../src/content/staff-role-catalog';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { packCommand } from '../../src/simulation/protocol/commands';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { isPostEligibleStaffRoleId } from '../../src/simulation/security/post-eligibility';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { projectStaff } from '../../src/simulation/presentation/staff-projection';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { hudAlertsFromWorkerMessage } from '../../src/ui/simulation-alerts';
import { hashFullRuntime } from '../helpers/determinism-state';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Who may stand a security post**
 * ([ADR 0053](../../docs/adr/0053-who-may-stand-a-security-post.md), closing
 * issue #456).
 *
 * ## What this file measures, and why it is an integration test
 *
 * The defect was not a wrong function. Every module involved was complete and
 * exercised: `StaffHiringService` refused three things and each refusal had a
 * test, `DeploymentSystem` posted guards and had a test, and
 * `IncidentResponseSystem` dispatched responders and had a test. What was
 * absent was a *relation between them* — the roster stores a `staffRoleId`
 * and nothing read it back to decide anything, so the four authored
 * `department` values decided nothing at all.
 *
 * Measured on `bb3a01e`, through the real command path, in the fixture below:
 * five `HireStaff` commands for `administrator`, `nurse`, `kitchen-staff`,
 * `doctor` and `warden` were accepted with **zero refusals**, entity 0 (the
 * administrator) was `on-post` in `security-sector.prison`, and the coverage
 * report published `required: 1, assigned: 1, shortage: 0`. Driven on to 30,000
 * ticks it had **4 riots, first at 11,100, all four resolved, 16 responders
 * dispatched, nobody injured**. Under the rule this file asserts the same
 * prison has **6 riots, first at 4,000, all six lapsed, nobody dispatched, 18
 * injuries**. `staffingShortfall` is `shortage / required`, so a body on the
 * post took the term to zero whoever the body was -- the wrong-role hire did
 * not merely stand there, it bought real containment.
 *
 * So the assertions start from `createNewSimulationRuntime` and use real
 * commands. A unit test cannot see this defect, because a unit test supplies
 * the roster it is measuring.
 *
 * ## What is deliberately not claimed
 *
 * That the six non-security roles now have something else to do. They do not,
 * and ADR 0053 decision 2 is a refusal rather than a job for exactly that
 * reason.
 */

/** Distinct from every other seed in the suite, so a shared fixture cannot make these figures true by accident. */
const SEED = 0x456;

/** `room.cell`'s authored minimum — the same rectangle `security-default-sector.test.ts` builds. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
/** `NEW_PRISON_ORIGIN_TILE`, written out: the derived sector's post tile, and where a hire first stands. */
const ORIGIN = { x: 16, y: 16 } as const;
const FAR_TILE = { x: 0, y: 0 } as const;
/** The same two tiles, branded, for the `GuardRoster.hire` calls that stand in for a save written before this rule. */
const POST_TILE = { x: tileCoordinate(ORIGIN.x), y: tileCoordinate(ORIGIN.y) };
const AWAY_TILE = { x: tileCoordinate(FAR_TILE.x), y: tileCoordinate(FAR_TILE.y) };
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;
const DEFAULT_SECTOR_ID = 'security-sector.prison';

const GUARD = 'staff-role.guard';
const ADMINISTRATOR = 'staff-role.administrator';
const NURSE = 'staff-role.nurse';
const KITCHEN = 'staff-role.kitchen-staff';

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function hire(runtime: SimulationRuntime, id: string, staffRoleId: string, tile: { readonly x: number; readonly y: number }): void {
  submit(runtime, id, packCommand({ type: 'HireStaff', staffRoleId, x: tile.x, y: tile.y }));
}

function phases(runtime: SimulationRuntime): readonly string[] {
  return runtime.securityGuards.allGuardIds().map((guardId) => runtime.securityGuards.getDeploymentPhase(guardId));
}

/** The `simulation/status-counts` publication the worker would send, assembled exactly as `staff-hiring-loop.test.ts` assembles it. */
function publication(runtime: SimulationRuntime): WorkerToMainMessage {
  const refusal = runtime.refusals.last;
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-under-test',
    kind: 'simulation/status-counts',
    payload: {
      tick: runtime.kernel.tick,
      schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
      counts: projectStatusCounts(runtime, runtime.kernel.tick),
      ...(refusal === undefined ? {} : { refusal }),
    },
  } as WorkerToMainMessage;
}

/**
 * One furnished cell, one bed, three admissions — the same prison
 * `tests/integration/security-default-sector.test.ts` builds, and it riots at
 * tick 4,000 with nobody hired.
 *
 * It is reused rather than reinvented so that the only difference between that
 * file's measurements and this one's is **who was hired**.
 */
function overcrowdedPrison(seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  stepTo(runtime, 200);
  for (let index = 0; index < 3; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN }));
  }
  return runtime;
}

describe('the eight authored departments decide something', () => {
  it('answers for every declared role, and the answer is the department', () => {
    /*
     * The whole catalogue rather than a sample, and derived from the registry
     * rather than written out, so a ninth role authored tomorrow is answered
     * here on the day it is added instead of silently skipped.
     */
    const byRole = defaultStaffRoleRegistry.all().map((role) => [role.id, isPostEligibleStaffRoleId(role.id)] as const);
    // `ContentRegistry.all()` is ascending id, not declaration order.
    expect(byRole).toEqual([
      [ADMINISTRATOR, false],
      ['staff-role.doctor', false],
      [GUARD, true],
      [KITCHEN, false],
      ['staff-role.maintenance-worker', false],
      [NURSE, false],
      ['staff-role.security-chief', true],
      ['staff-role.warden', false],
    ]);

    // And the two that answer `true` are exactly the roles in the authored
    // list, so the truth table above cannot drift away from the rule it is
    // supposed to be a table of.
    expect(byRole.filter(([, eligible]) => eligible).map(([id]) => id)).toEqual(
      defaultStaffRoleRegistry
        .all()
        .filter((role) => POST_ELIGIBLE_STAFF_DEPARTMENTS.includes(role.department))
        .map((role) => role.id),
    );
  });

  it('is a fail-closed answer for a role nothing declares, rather than a throw', () => {
    // `resolveStaffRouteContext` throws for an unknown id because it has no
    // context to return. This has an answer and the safe one is `no`: a save
    // written against a catalogue that later dropped a role reads as an
    // uncovered sector, which is true.
    expect(isPostEligibleStaffRoleId('staff-role.dragon-tamer')).toBe(false);
  });
});

describe('a hire the prison has no duty for is refused, and the player is told why', () => {
  it('refuses a nurse through the real command path, spends nothing and hires nobody', () => {
    const runtime = createNewSimulationRuntime(SEED);
    const dispatchTick = runtime.kernel.tick;

    hire(runtime, 'cmd-hire-nurse', NURSE, ORIGIN);

    expect(runtime.securityGuards.allGuardIds()).toEqual([]);
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).staff).toBe(0);
    expect(runtime.refusals.count).toBe(1);
    expect(runtime.refusals.last).toEqual({ sequence: 1, tick: dispatchTick, reason: 'hire.no-duty-for-role' });
  });

  it('reaches the player as a resolved sentence and never as a raw dotted id', () => {
    const runtime = createNewSimulationRuntime(SEED);
    hire(runtime, 'cmd-hire-cook', KITCHEN, ORIGIN);

    const alerts = hudAlertsFromWorkerMessage(publication(runtime));
    expect(alerts).toEqual([{ id: 'refusal-1', labelKey: 'hud.alert.refusal.hire.no-duty-for-role', severity: 'warning' }]);

    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const sentence = localizer.format(alerts![0]!.labelKey);
    // The failure a `Record` value can ship as: a key with no authored text
    // resolves to its own dotted self, which is what a player would read.
    expect(sentence).not.toBe(alerts![0]!.labelKey);
    expect(sentence.trim().length).toBeGreaterThan(0);
    // Not the "no such role" sentence. The two are different facts about a
    // role id -- never heard of it, versus nothing for it to do -- and a
    // player told the wrong one would go looking for a spelling mistake.
    expect(sentence).not.toBe(localizer.format('hud.alert.refusal.hire.unknown-role'));
  });

  it('still hires a guard, so the gate is a department rule and not a broken command', () => {
    const runtime = createNewSimulationRuntime(SEED);
    hire(runtime, 'cmd-hire-guard', GUARD, ORIGIN);

    expect(runtime.securityGuards.allGuardIds()).toEqual([0]);
    expect(runtime.securityGuards.getStaffRoleId(0)).toBe(GUARD);
    expect(runtime.refusals.count).toBe(0);
    expect(phases(runtime)).toEqual(['on-post']);
  });
});

describe('a roster a save carries cannot cover a post with a role that has no duty', () => {
  /**
   * What a pre-ADR-0053 session leaves in a save.
   *
   * `GuardRoster.hire` is called directly here and that is the point rather
   * than a shortcut: this is exactly the state `HireStaff` produced on
   * `bb3a01e`, and no refusal added today can reach backwards into a file
   * written yesterday. The refusal above stops it happening again; this is
   * what stops the ones already written from covering a post.
   */
  function prisonStaffedByASave(): SimulationRuntime {
    const runtime = overcrowdedPrison();
    for (const roleId of [ADMINISTRATOR, NURSE, KITCHEN]) runtime.securityGuards.hire(roleId, POST_TILE);
    return runtime;
  }

  it('leaves them unassigned and reports the shortage the prison honestly has', () => {
    const runtime = prisonStaffedByASave();
    stepTo(runtime, runtime.kernel.tick + 50);

    expect(runtime.securityGuards.allGuardIds().map((id) => runtime.securityGuards.getStaffRoleId(id))).toEqual([
      ADMINISTRATOR,
      NURSE,
      KITCHEN,
    ]);
    // Nobody travelled and nobody arrived: three staff, no sector, no post.
    expect(phases(runtime)).toEqual(['unassigned', 'unassigned', 'unassigned']);
    expect(runtime.securityGuards.allGuardIds().map((id) => runtime.securityGuards.getSectorId(id))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);

    // The readout ADR 0048 built agrees with the rule instead of counting
    // bodies: three on the payroll and the sector is still unguarded.
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, required: 1, assigned: 0, shortage: 1 },
    ]);
    // And the two figures the Staff panel renders say the same thing from the
    // projection the HUD actually reads, with `hired` unchanged -- the three
    // are staff, they are simply not guards.
    const staff = projectStaff({ staff: runtime.securityGuards, deployment: runtime.deploymentSystem }, runtime.kernel.tick, { limit: 0 });
    expect(staff.totals).toEqual({ hired: 3, unassigned: 3, required: 1, assigned: 0, shortage: 0 + 1 });
  });

  it('survives a save round trip: a restored session does not post them either', () => {
    const live = prisonStaffedByASave();
    stepTo(live, live.kernel.tick + 50);

    const restored = restoreSimulationRuntime(captureSessionSnapshot(live), SEED).runtime;
    stepTo(restored, restored.kernel.tick + 50);

    expect(restored.securityGuards.allGuardIds().map((id) => restored.securityGuards.getStaffRoleId(id))).toEqual([
      ADMINISTRATOR,
      NURSE,
      KITCHEN,
    ]);
    expect(restored.securityGuards.allGuardIds().map((id) => restored.securityGuards.getDeploymentPhase(id))).toEqual([
      'unassigned',
      'unassigned',
      'unassigned',
    ]);
    expect(restored.deploymentSystem.getCoverageReport(restored.kernel.tick)).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, required: 1, assigned: 0, shortage: 1 },
    ]);
  });
});

describe('a riot is answered by guards, and only by guards', () => {
  /** The measured tick the fixture's riot opens at, unchanged from `security-default-sector.test.ts`. */
  const RIOT_TICK = 4_000;

  it('still riots with a prison full of non-security staff, because they are not coverage', () => {
    const runtime = overcrowdedPrison();
    for (const roleId of [ADMINISTRATOR, NURSE, KITCHEN]) runtime.securityGuards.hire(roleId, POST_TILE);

    stepTo(runtime, RIOT_TICK - 1);
    expect(runtime.incidents.all()).toEqual([]);
    stepTo(runtime, RIOT_TICK + 1);

    const riots = runtime.incidents.all();
    expect(riots).toHaveLength(1);
    // The staffing term is 1, not 0: three bodies in the prison and no guard.
    // This is the whole of what the defect suppressed -- with the
    // administrator counted as coverage the term was 0, the score was
    // `needsPressure` alone (0.389) against a `hotThreshold` of 0.65, and this
    // prison never rioted at all.
    expect(riots[0]!.causeFactors.find((factor) => factor.kind === 'staffing-shortfall')?.value).toBe(1);
    expect(riots[0]).toMatchObject({ id: 'incident.riot.1', type: 'riot', severity: 7, startedAtTick: RIOT_TICK });
  });

  it('dispatches nobody from a pool of nurses, and lets the riot lapse', () => {
    const runtime = overcrowdedPrison();
    stepTo(runtime, RIOT_TICK + 1);
    expect(runtime.incidents.get('incident.riot.1')?.state).toBe('active');

    // Five, which is exactly what five guards would need to be to contain a
    // severity-7 riot in this sector -- one for the post and four responders.
    for (let index = 0; index < 5; index += 1) runtime.securityGuards.hire(NURSE, AWAY_TILE);

    while (runtime.incidents.openIncidents().length > 0 && runtime.kernel.tick < RIOT_TICK + 700) runtime.kernel.step();

    // Nobody was claimed, nothing was locked down, and the riot ran out its
    // deadline. Before ADR 0053 the same five nurses produced
    // `respondersDispatched: 4` and a resolved incident, which is issue #457's
    // "true and meaningless".
    expect(runtime.incidentResponseSystem.getMetrics()).toMatchObject({
      respondersDispatched: 0,
      incidentsResolved: 0,
      incidentsLapsed: 1,
    });
    expect(runtime.incidents.get('incident.riot.1')!.state).toBe('lapsed');
    expect(runtime.securitySectors.getControlState(DEFAULT_SECTOR_ID)).toBe('normal');
    expect(phases(runtime)).toEqual(['unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned']);
  });

  it('dispatches and resolves when the same five hires are guards', () => {
    // The control for the case above, and the reason it is here rather than
    // taken on trust from `security-default-sector.test.ts`: without it, a
    // filter that claimed *nobody* would pass that test too.
    const runtime = overcrowdedPrison();
    stepTo(runtime, RIOT_TICK + 1);
    for (let index = 0; index < 5; index += 1) hire(runtime, `hire-${String(index)}`, GUARD, FAR_TILE);

    while (runtime.incidents.openIncidents().length > 0 && runtime.kernel.tick < RIOT_TICK + 700) runtime.kernel.step();

    expect(runtime.incidents.get('incident.riot.1')).toMatchObject({ state: 'resolved', outcome: { injuredEntityIds: [] } });
    expect(runtime.incidentResponseSystem.getMetrics()).toMatchObject({ respondersDispatched: 4, incidentsResolved: 1, incidentsLapsed: 0 });
  });

  it('is deterministic: the same seed and the same roster produce the same run, twice', () => {
    function run(): SimulationRuntime {
      const runtime = overcrowdedPrison();
      for (const roleId of [ADMINISTRATOR, NURSE, KITCHEN]) runtime.securityGuards.hire(roleId, POST_TILE);
      stepTo(runtime, RIOT_TICK + 200);
      return runtime;
    }
    // The whole runtime, not the incident alone: an eligibility filter that
    // read `Set` order or a registry iteration order would show up here.
    expect(hashFullRuntime(run())).toBe(hashFullRuntime(run()));
  });
});
