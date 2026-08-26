import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { hashFullRuntime } from '../helpers/determinism-state';

/**
 * **The security tier, reached through the front door**
 * ([ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md), closing
 * issue #396 and answering [ADR 0034](../../docs/adr/0034-releasing-a-claimed-guard.md)
 * decision 9).
 *
 * ## Why this file is not a unit test
 *
 * #396's finding was not that a function was wrong. Every module in the security
 * tier was complete, imported, constructed and stepped, and every one of them
 * was measured — in scenarios and in restored saves. What was absent was a
 * *value*: `securitySectors.register` had one caller in all of `src/`, the
 * restore path, so `DeploymentSystem`, `PatrolSystem`, `IncidentTriggerSystem`
 * and `IncidentResponseSystem` iterated empty collections in every session a
 * player could start. A unit test cannot see that, because a unit test registers
 * the sector itself. So the assertions below start from
 * `createNewSimulationRuntime` and use nothing but real commands through the
 * real command handler: `PurchaseMaterials`, `ZoneRoom`, `PlaceObject`,
 * `AdmitPrisoner`, `HireStaff` — the five a player can actually send today.
 *
 * ## Why it is red on `origin/main`
 *
 * Every import exists on `main`, so this file compiles there and fails
 * *behaviourally*. On `main` `runtime.securitySectors.all()` is empty at tick 0
 * and stays empty for ever, so: no guard is ever posted, no sector is ever
 * sampled for risk, no incident is ever opened, and nothing is ever responded
 * to. The red output is quoted in the pull request.
 *
 * ## What is deliberately *not* claimed
 *
 * The last `describe` measures what is still inert and says why. Patrol and
 * contraband search do not come back with the sector, and pretending otherwise
 * would be the failure mode #396 itself corrects.
 */

/** Distinct from every other seed in the suite, so a shared fixture cannot make these figures true by accident. */
const SEED = 0x396;

/** `room.cell`'s authored minimum, and the same rectangle the object-placement and consequence loops use. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;

/**
 * `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, written out.
 *
 * It is the tile the Build panel starts on, the tile a hire first stands on and
 * the tile an admission arrives at — and, since ADR 0036, the derived sector's
 * post tile as well, because both are "the middle of owned land". Copied rather
 * than imported: `src/main.ts` is the composition root and pulling it into a
 * simulation test would drag the whole page in, and the point of the assertions
 * below is that these two independently-derived tiles agree.
 */
const ORIGIN = { x: 16, y: 16 } as const;
/** A tile a guard has to walk from, so a deployment or a response is a real route request rather than an arrival by coincidence. */
const FAR_TILE = { x: 0, y: 0 } as const;

/** What one press of the Intake panel's control asks for, copied from `ADMISSION_REQUEST` in `src/main.ts`, with a sentence long enough to outlast the measurements below. */
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;

const DEFAULT_SECTOR_ID = 'security-sector.prison';
/** `DAY_LENGTH_TICKS`, written out: the derived schedule covers the whole day, and a test that imported the constant could not tell a full day from a changed one. */
const DAY_LENGTH = 2_400;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function hire(runtime: SimulationRuntime, id: string, tile: { readonly x: number; readonly y: number }): void {
  submit(runtime, id, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', x: tile.x, y: tile.y }));
}

function phases(runtime: SimulationRuntime): readonly string[] {
  return runtime.securityGuards.allGuardIds().map((guardId) => runtime.securityGuards.getDeploymentPhase(guardId));
}

/**
 * The smallest prison that can produce a riot without anything being arranged
 * by hand: one furnished cell, and **three** admissions for its one bed.
 *
 * The two arrivals it cannot house are the fixture, and they are honest rather
 * than contrived. `IntakeSystem` leaves them at the `accommodation-assignment`
 * stage standing on the arrival tile — measured: tile (16, 16), which is the
 * derived sector's post tile — and their `safety` need decays at
 * `NEED_DECAY_PER_TICK.safety` with nothing to restore it. That is what puts
 * `needsPressure` into `sampleSectorRisk`, through
 * `resolveSectorOccupants`, which counts prisoners standing exactly on the post
 * tile. The housed prisoner stays in its cell at (4, 6) and is not an occupant,
 * which is the placeholder ADR 0036 decision 5 records rather than fixes.
 *
 * No guards are hired here, so `staffingShortfall` is 1: the derived sector asks
 * for one guard and has none.
 */
function overcrowdedPrison(seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  // 100 ticks of delivery delay plus build progress; 200 is the margin the
  // furnished-cell and consequence loops both admit after.
  stepTo(runtime, 200);
  for (let index = 0; index < 3; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN }));
  }
  return runtime;
}

describe('a session a player can start has a security sector', () => {
  it('registers one sector, one staffing requirement and one watched sector before any command is sent', () => {
    const runtime = createNewSimulationRuntime(SEED);

    // The three collections #396's `grep` stands for. On `main` all three are
    // empty here, and stay empty for the life of the session.
    expect(runtime.securitySectors.all()).toEqual([
      { id: DEFAULT_SECTOR_ID, gradeId: 'grade.general', doorIds: [], postTile: ORIGIN },
    ]);
    expect(runtime.securitySchedules).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH, requiredGuardCount: 1 }] },
    ]);
    expect(runtime.incidentSectorIds).toEqual([DEFAULT_SECTOR_ID]);
  });

  it('puts its post tile exactly where the composition root puts a hire and an arrival', () => {
    // Not a coincidence to be noted but the property three other things depend
    // on (ADR 0036 decision 2): a hire is posted without a route request, an
    // unhoused arrival is a sector occupant, and the tile is on owned walkable
    // ground.
    expect(createNewSimulationRuntime(SEED).securitySectors.requireDefinition(DEFAULT_SECTOR_ID).postTile).toEqual(ORIGIN);
  });

  it('reports the shortage it honestly has, rather than fabricating coverage', () => {
    const runtime = createNewSimulationRuntime(SEED);
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, required: 1, assigned: 0, shortage: 1 },
    ]);
  });
});

describe('deployment reaches a guard hired through the real command path', () => {
  it('posts the first hire, and leaves every hire after it in the pool the other claimants draw from', () => {
    const runtime = createNewSimulationRuntime(SEED);

    hire(runtime, 'hire-1', ORIGIN);
    // On the tick the command lands: the hire is standing on the post already,
    // so `beginDeployment` takes its `sameTile` branch and asks navigation for
    // nothing.
    expect(phases(runtime)).toEqual(['on-post']);
    expect(runtime.securityGuards.getSectorId(0)).toBe(DEFAULT_SECTOR_ID);
    expect(runtime.deploymentSystem.getMetrics()).toEqual({ deploymentFailures: 0 });

    hire(runtime, 'hire-2', ORIGIN);
    hire(runtime, 'hire-3', ORIGIN);
    stepTo(runtime, runtime.kernel.tick + 50);

    // One requirement, one guard: the rest stay claimable. This is the whole of
    // why the derived requirement is 1 rather than larger.
    expect(phases(runtime)).toEqual(['on-post', 'unassigned', 'unassigned']);
    expect(runtime.securityGuards.unassignedGuardIds()).toEqual([1, 2]);
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, required: 1, assigned: 1, shortage: 0 },
    ]);
  });

  it('walks a hire that starts somewhere else to the post through the real navigation system', () => {
    const runtime = createNewSimulationRuntime(SEED);
    hire(runtime, 'hire-far', FAR_TILE);

    // A real route request, not a teleport: the guard is `'travelling'` with a
    // navigation request id against the session's own `NavigationSystem`.
    expect(phases(runtime)).toEqual(['travelling']);
    expect(runtime.securityGuards.getPathRequestId(0)).toBe('security.deploy.0.1');
    expect(runtime.securityGuards.getTile(0)).toEqual(FAR_TILE);

    stepTo(runtime, runtime.kernel.tick + 50);

    expect(phases(runtime)).toEqual(['on-post']);
    expect(runtime.securityGuards.getTile(0)).toEqual(ORIGIN);
    // The route resolved rather than failing and being retried, which is the
    // difference between a reachable post tile and a merely registered one.
    expect(runtime.deploymentSystem.getMetrics()).toEqual({ deploymentFailures: 0 });
  });
});

describe('an incident is triggered, responded to and closed, in a session started from nothing', () => {
  /**
   * The measured tick a riot opens at, for this seed and this fixture.
   *
   * Written out rather than searched for: it is a fact about
   * `NEED_DECAY_PER_TICK.safety` (0.01 a tick from a full 255),
   * `DEFAULT_SECTOR_RISK_POLICY` (needs weighted 0.5, staffing 0.3, hot at 0.6,
   * three consecutive samples) and `IncidentTriggerSystem`'s 50-tick cadence.
   * `needsPressure` crosses 0.6 — the level that, with a shortfall of 1, first
   * puts the score over the threshold — and three samples later the riot opens.
   * If any of those move, this line has to move and a reviewer has to see it.
   */
  const RIOT_TICK = 15_600;

  it('opens a riot in the derived sector from real needs and real understaffing', () => {
    const runtime = overcrowdedPrison();

    stepTo(runtime, RIOT_TICK - 1);
    expect(runtime.incidents.all()).toEqual([]);
    stepTo(runtime, RIOT_TICK + 1);

    const riots = runtime.incidents.all();
    expect(riots).toHaveLength(1);
    expect(riots[0]).toMatchObject({
      id: 'incident.riot.1',
      type: 'riot',
      sectorId: DEFAULT_SECTOR_ID,
      severity: 6,
      startedAtTick: RIOT_TICK,
      state: 'active',
      // The two arrivals with nowhere to sleep, and not the housed one.
      participantIds: [1, 2],
    });
    // The cause factors say which real inputs did it, so this cannot pass on a
    // riot that fired for some other reason.
    expect(riots[0]!.causeFactors.map((factor) => factor.kind)).toEqual([
      'sustained-sector-risk',
      'needs-pressure',
      'staffing-shortfall',
      'contraband-pressure',
    ]);
    expect(riots[0]!.causeFactors.find((factor) => factor.kind === 'staffing-shortfall')?.value).toBe(1);
    expect(riots[0]!.causeFactors.find((factor) => factor.kind === 'needs-pressure')?.value).toBeGreaterThanOrEqual(0.6);
    expect(riots[0]!.causeFactors.find((factor) => factor.kind === 'contraband-pressure')?.value).toBe(0);
  });

  it('dispatches responders the player hires in reaction, walks them to the post tile and resolves the riot', () => {
    const runtime = overcrowdedPrison();
    stepTo(runtime, RIOT_TICK + 1);
    expect(runtime.incidents.get('incident.riot.1')?.state).toBe('active');

    /*
     * Five hires, at a tile the guards have to walk from.
     *
     * A severity-6 riot needs three responders
     * (`respondersPerSeverityPoint` 0.5), and one hire is taken by the sector's
     * own requirement, so five is two more than the minimum. It is also the
     * only order in which this is reachable: the shortfall that *causes* the
     * riot is exactly the state in which the pool is empty, so the responders
     * have to arrive after it — which is the play ADR 0036 decision 3 describes
     * and the bound it records.
     */
    for (let index = 0; index < 5; index += 1) hire(runtime, `hire-${String(index)}`, FAR_TILE);

    while (runtime.incidents.get('incident.riot.1')!.state !== 'responding' && runtime.kernel.tick < RIOT_TICK + 600) {
      runtime.kernel.step();
    }

    // Contained inside the 600-tick deadline, with the lockdown a severity-6
    // riot calls for (`lockdownSeverityThreshold` is 6) actually applied.
    expect(runtime.incidents.get('incident.riot.1')!.state).toBe('responding');
    expect(runtime.securitySectors.getControlState(DEFAULT_SECTOR_ID)).toBe('lockdown');
    expect(phases(runtime)).toEqual(['on-post', 'on-search', 'on-search', 'on-search', 'unassigned']);
    expect(runtime.incidentResponseSystem.claimedGuardIds()).toEqual([1, 2, 3]);
    // Every responder walked from (0, 0) and is standing on the post tile: the
    // destination `requireDefinition(incident.sectorId).postTile` resolves to,
    // which on `main` throws because nothing registered the sector.
    for (const guardId of [1, 2, 3]) expect(runtime.securityGuards.getTile(guardId)).toEqual(ORIGIN);
    expect(runtime.incidentResponseSystem.getMetrics()).toMatchObject({ respondersDispatched: 3, routeFailures: 0 });

    while (runtime.incidents.openIncidents().length > 0 && runtime.kernel.tick < RIOT_TICK + 600) runtime.kernel.step();

    // Resolved rather than lapsed, with nobody hurt -- the containment outcome
    // ADR 0032's consequence tier reads, produced by a session started from
    // nothing.
    expect(runtime.incidents.get('incident.riot.1')).toMatchObject({
      state: 'resolved',
      outcome: { injuredEntityIds: [], propertyDamage: 3, escaped: false },
    });
    // The lockdown lifted and the responders went back to the pool.
    expect(runtime.securitySectors.getControlState(DEFAULT_SECTOR_ID)).toBe('normal');
    expect(phases(runtime)).toEqual(['on-post', 'unassigned', 'unassigned', 'unassigned', 'unassigned']);
    expect(runtime.incidentResponseSystem.getMetrics()).toMatchObject({ incidentsResolved: 1, incidentsLapsed: 0 });
    expect(runtime.incidentTriggerSystem.getMetrics()).toEqual({ incidentsTriggered: 1, riotsTriggered: 1, retaliationsTriggered: 0 });
  });

  it('is deterministic: the same seed and the same commands produce the same riot, twice', () => {
    const first = overcrowdedPrison();
    const second = overcrowdedPrison();
    stepTo(first, RIOT_TICK + 100);
    stepTo(second, RIOT_TICK + 100);

    // The whole runtime, not just the incident: a derived sector that read
    // `Set` order, a clock or an RNG stream would show up here.
    expect(hashFullRuntime(second)).toBe(hashFullRuntime(first));
  });
});

describe('the derived sector survives a save without a schema bump', () => {
  function reload(bundle: SessionSnapshotBundle): SimulationRuntime {
    return restoreSimulationRuntime(bundle, SEED).runtime;
  }

  it('re-derives the same sector a live session had, and registers it exactly once', () => {
    const live = createNewSimulationRuntime(SEED);
    hire(live, 'hire-1', ORIGIN);
    stepTo(live, 100);

    const restored = reload(captureSessionSnapshot(live));

    // Once, not twice: `createNewSimulationRuntime` derives it and the payload
    // carries it, and `register` throws on a duplicate id.
    expect(restored.securitySectors.all()).toEqual(live.securitySectors.all());
    expect(restored.securitySchedules).toEqual(live.securitySchedules);
    expect([...restored.incidentSectorIds]).toEqual([...live.incidentSectorIds]);
    // And the guard is still on its post, in the sector that was re-derived
    // rather than restored.
    expect(restored.securityGuards.getSectorId(0)).toBe(DEFAULT_SECTOR_ID);
    expect(restored.securityGuards.getTile(0)).toEqual(ORIGIN);
  });

  it('carries a copy in the payload that is identical to the derived one, which is what makes skipping it safe', () => {
    // `restoreSessionSystems` skips a sector id the runtime already holds, so
    // the payload's row for this sector is never read. That is only sound while
    // the two are the same definition, and this is the assertion that keeps it
    // true: change the derivation without thinking about a save and this fails.
    const bundle = captureSessionSnapshot(createNewSimulationRuntime(SEED));
    expect(bundle.simulation?.security.sectorDefinitions).toEqual([
      { id: DEFAULT_SECTOR_ID, gradeId: 'grade.general', doorIds: [], postTile: ORIGIN },
    ]);
    expect(bundle.simulation?.security.sectorDefinitions).toEqual(reload(bundle).securitySectors.all());
  });

  it('gives the tier to a save written before it existed, with no migration and no version bump', () => {
    /*
     * A V5 payload from before ADR 0036: the section shapes are unchanged, and
     * all three of the collections the tier reads are empty -- which is exactly
     * what every save this repository has ever written before this change looks
     * like. It is built by blanking a real capture rather than by hand, so it
     * stays a valid V5 payload in every other respect.
     */
    const live = captureSessionSnapshot(createNewSimulationRuntime(SEED));
    const beforeThisAdr: SessionSnapshotBundle = {
      ...live,
      simulation: {
        ...live.simulation!,
        security: { ...live.simulation!.security, sectorDefinitions: [], sectorControlStates: [], schedules: [] },
        incidents: { ...live.simulation!.incidents, watchedSectorIds: [] },
      },
    };
    expect(beforeThisAdr.simulation?.security.sectorDefinitions).toEqual([]);

    const restored = reload(beforeThisAdr);

    expect(restored.securitySectors.all()).toEqual([
      { id: DEFAULT_SECTOR_ID, gradeId: 'grade.general', doorIds: [], postTile: ORIGIN },
    ]);
    expect(restored.securitySchedules).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH, requiredGuardCount: 1 }] },
    ]);
    expect([...restored.incidentSectorIds]).toEqual([DEFAULT_SECTOR_ID]);

    // Behavioural, not structural: a guard hired into the reloaded old save is
    // posted, which it could not have been in the session that wrote the file.
    hire(restored, 'hire-after-load', ORIGIN);
    expect(restored.securityGuards.getDeploymentPhase(0)).toBe('on-post');
  });

  it('keeps a zero-guard requirement the payload carries, rather than re-imposing the derived one', () => {
    // The derivation is authoritative only where the payload is silent. Without
    // this, a session could not hold any requirement for this sector other than
    // the derived one -- and the fixtures that opt out of the demand would
    // behave differently either side of a save.
    const live = createNewSimulationRuntime(SEED);
    live.securitySchedules.splice(0, 1, { sectorId: DEFAULT_SECTOR_ID, blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH, requiredGuardCount: 0 }] });

    const restored = reload(captureSessionSnapshot(live));

    expect(restored.securitySchedules).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH, requiredGuardCount: 0 }] },
    ]);
    hire(restored, 'hire-1', ORIGIN);
    expect(restored.securityGuards.getDeploymentPhase(0)).toBe('unassigned');
  });
});

describe('what a sector does not bring back, measured rather than assumed', () => {
  it('leaves patrol inert, because the derived sector has no route and a derived route would be invented', () => {
    const runtime = createNewSimulationRuntime(SEED);
    hire(runtime, 'hire-1', ORIGIN);
    stepTo(runtime, 5_000);

    // The guard is on post for thousands of ticks and never walks a leg:
    // `PatrolSystem` acts only on a sector with a `patrolRoute`, and ADR 0036
    // declines to derive one. This is the part of #396's list that a sector
    // alone does not fix.
    expect(runtime.securityGuards.getDeploymentPhase(0)).toBe('on-post');
    expect(runtime.securitySectors.requireDefinition(DEFAULT_SECTOR_ID).patrolRoute).toBeUndefined();
    expect(runtime.patrolSystem.getMetrics()).toEqual({ loopsCompletedOnTime: 0, loopsCompletedLate: 0, loopsMissed: 0 });
  });

  it('leaves contraband search inert, for a reason that is not the sector at all', () => {
    const runtime = overcrowdedPrison();
    stepTo(runtime, 1_000);

    // Two separate absences, and neither is a sector: `runtime.searchPolicies`
    // is empty because nothing in `src/` authors one, and
    // `SearchSystem.submitOrder` has no caller in `src/` at all -- there is no
    // command for it. A sector was never what search was missing.
    expect(runtime.searchPolicies).toEqual([]);
    expect(runtime.searchSystem.getMetrics()).toMatchObject({ searchesQueued: 0, searchesCompleted: 0, searchesCancelled: 0 });
    expect(runtime.confiscations.all()).toEqual([]);
  });

  it('records a lockdown that seals nothing, because a perimeter is the one thing a derivation cannot know', () => {
    const runtime = overcrowdedPrison();
    // A door the player built, which the derived sector does not govern.
    submit(runtime, 'buy-door-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 4 }));
    submit(runtime, 'build-door', packCommand({ type: 'PlaceBuildOrder', orderId: 'door-1', definitionId: 'door-wooden', x: 5, y: 6 }));
    stepTo(runtime, 600);
    const doorIds = runtime.navigation.doors.all().map((door) => door.id);
    expect(doorIds).toHaveLength(1);

    runtime.securitySectors.setControlState(DEFAULT_SECTOR_ID, 'lockdown');

    // The control state is real -- it is in the payload and in the security
    // projection -- and it cascades onto nothing, because `doorIds` is empty.
    // ADR 0036 decision 3 states this as the cost of a sector nobody drew, and
    // it is the strongest argument for the player-facing gesture #396's option 2
    // describes.
    expect(runtime.securitySectors.getControlState(DEFAULT_SECTOR_ID)).toBe('lockdown');
    expect(runtime.securitySectors.requireDefinition(DEFAULT_SECTOR_ID).doorIds).toEqual([]);
    expect(runtime.navigation.doors.getById(doorIds[0]!)?.state).not.toBe('locked');
  });
});
