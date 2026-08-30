import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';
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
 * The last `describe` measures what is still inert and says why. Patrol does not
 * come back with the sector, and pretending otherwise would be the failure mode
 * #396 itself corrects.
 *
 * **Contraband search was in that list and has left it** (issue #552,
 * [ADR 0073](../../docs/adr/0073-who-orders-a-contraband-search.md)). It never
 * was the sector's to bring back -- the case below said so at the time -- and
 * what it was actually missing, four policies and a producer, now exists. The
 * case that remains is about a prison with no guards, which is a different
 * claim; `tests/integration/contraband-search-duty.test.ts` is where the
 * counter is watched moving.
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

/**
 * What one press of the Intake panel's control asks for -- the tile and `priorIncidents: 0` from
 * `ADMISSION_REQUEST` in `src/main.ts`, and a sentence length that press no longer sends.
 * Since #535 decision 5 an omitted length is drawn inside the simulation from
 * `prisoners.sentence`; naming one here is still legal, is never redrawn, and is what keeps
 * this fixture's timings fixed.
 *
 * The length here is long enough to outlast the measurements below, which is why it is named
 * rather than drawn: a drawn one could be as short as two in-game days.
 */
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

/**
 * One admission, and nothing else.
 *
 * **Issue #533 is why this exists in six cases below that did not need it.**
 * `resolveOccupancyScaledGuardCount` answers `0` for a sector holding nobody,
 * so an empty prison asks for no guards and `DeploymentSystem` posts nobody --
 * which is the decision, not an accident. Every case that is *about* deployment
 * therefore has to put somebody in the prison first, and each one below says so
 * where it calls this.
 *
 * A zoned cell and no furniture. The zoning is not decoration: `AdmitPrisoner`
 * is refused `no-accommodation` unless a room instance exists that some
 * classification group's accommodation target names
 * (`PrisonerOperationsRuntime.requestAdmission`), so a fixture that admitted
 * into bare ground would be refused and would leave the sector empty --
 * measuring the very state it was written to leave behind. The bed is left out
 * because an *unhoused* arrival is still an occupant: they stand on the arrival
 * tile, which is owned land, and `resolveSectorOccupants` counts every living
 * prisoner on owned land (ADR 0048). One is enough to restore the derived floor
 * of one, and it stays one until the ninth.
 */
function admitOne(runtime: SimulationRuntime, id = 'admit-occupant'): void {
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, `${id}-zone`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, id, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN }));
  // Not `expect` on a projection: the refusal log is the session's own record,
  // and a silently refused admission here would leave the sector empty and make
  // every assertion below measure the wrong prison.
  if (runtime.refusals.count > 0) throw new Error('The admission this fixture depends on was refused.');
  /*
   * Land the session back on a tick `security.deployment` is scheduled for.
   *
   * `DeploymentSystem.schedule` is `{ intervalTicks: 10, phaseTicks: 0 }`, and
   * the cases below assert what a hire is *on the tick its command lands* --
   * which only holds when that step is one deployment also runs in. A fresh
   * runtime is on tick 0 and satisfies it for free, which is why those cases
   * never had to say so; the three commands above cost three ticks and break
   * it. Advancing to the next multiple of ten restores the precondition
   * instead of weakening the assertion to "eventually".
   */
  while (runtime.kernel.tick % 10 !== 0) runtime.kernel.step();
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
 * stage standing on the arrival tile, with nothing to restore any of their six
 * needs: no bed to sleep in, no cell to eat or use a toilet in, and no shower
 * room or yard anywhere in the prison.
 *
 * The third prisoner is housed, and since
 * [ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md) they are an
 * occupant too -- the sector is the prison, not the post tile -- so the sample
 * is the mean of three prisoners' mean deficits rather than the two homeless
 * ones' `safety` alone. The housed one is why `needsPressure` sits below 0.4
 * rather than near 1: a bed and a cell to eat in keep three of their six needs
 * met.
 *
 * **This fixture used to depend on the arrival tile and the derived post tile
 * being the same tile.** It no longer does, and that is the point of the
 * change: a housed prisoner in a cell across the prison is an occupant of the
 * sector they live in. ADR 0036 decision 2 still relies on that coincidence for
 * its other two reasons, which is why the case above still asserts it.
 *
 * No guards are hired here, so `staffingShortfall` is 1: the derived sector asks
 * for one guard and has none.
 */
function overcrowdedPrison(seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
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

  it('asks for nobody while the prison holds nobody, and reports the shortage honestly once it does', () => {
    /*
     * **This assertion is the one issue #533 changed, and the old one is quoted
     * rather than deleted**: it read `required: 1, assigned: 0, shortage: 1` for
     * a session `createNewSimulationRuntime` had just built -- no prisoners, no
     * rooms -- and the Staff panel rendered that as `Guard coverage · 0 of 1 ·
     * Unguarded` with `Nobody is on duty. Hire 1 to cover this population.` The
     * population it named was zero, and obeying cost a day's wage on the click
     * and the same again at the next day boundary against no income.
     *
     * What the old case was *for* survives in the second half: a shortage must
     * be reported rather than papered over. It is now measured where a shortage
     * means something.
     */
    const empty = createNewSimulationRuntime(SEED);
    expect(empty.deploymentSystem.getCoverageReport(empty.kernel.tick)).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, required: 0, assigned: 0, shortage: 0 },
    ]);

    admitOne(empty);
    expect(empty.deploymentSystem.getCoverageReport(empty.kernel.tick)).toEqual([
      { sectorId: DEFAULT_SECTOR_ID, required: 1, assigned: 0, shortage: 1 },
    ]);
  });
});

describe('deployment reaches a guard hired through the real command path', () => {
  it('posts the first hire, and leaves every hire after it in the pool the other claimants draw from', () => {
    const runtime = createNewSimulationRuntime(SEED);
    // Somebody to guard (#533): an empty sector requires nobody, so without
    // this the requirement is 0 and every hire below stays in the pool.
    admitOne(runtime);

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
    admitOne(runtime); // #533: a sector with nobody in it posts nobody.
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

/**
 * The one riot in the log, whatever id the shared incident sequence gave it.
 *
 * **By type rather than by `'incident.riot.1'`.**
 * `IncidentTriggerSystem.nextIncidentId` mints from a single sequence shared by
 * every incident type, so since
 * [ADR 0061](../../docs/adr/0061-what-the-prison-produces-on-its-own.md) gave
 * `'assault'` a producer, an assault opening earlier in the same run takes `.1`
 * and this prison's riot is a later number. Everything this file asserts about
 * the riot -- its tick, its severity, its cause factors, its participants, its
 * response -- is unchanged; the id was the brittle part.
 */
function theRiot(runtime: SimulationRuntime) {
  const riots = runtime.incidents.all().filter((incident) => incident.type === 'riot');
  expect(riots, 'exactly one riot is what this prison produces').toHaveLength(1);
  return riots[0]!;
}

describe('an incident is triggered, responded to and closed, in a session started from nothing', () => {
  /**
   * The measured tick a riot opens at, for this seed and this fixture.
   *
   * Written out rather than searched for: it is a fact about `NEED_DECAY_PER_TICK`
   * (all six of them, not `safety`'s rate alone), `DEFAULT_SECTOR_RISK_POLICY`
   * (needs weighted 1, staffing 0.3, hot at 0.65, twelve consecutive samples) and
   * `IncidentTriggerSystem`'s 50-tick cadence. `needsPressure` crosses 0.35 --
   * the level that, with a shortfall of 1, first puts the score over the
   * threshold -- and twelve samples later the riot opens. If any of those move,
   * this line has to move and a reviewer has to see it.
   *
   * **It was 15,600 before ADR 0048**, when the sample was the two homeless
   * prisoners' `safety` deficit alone and had to reach 0.6 on a need that falls
   * at 0.01 a tick. Nearly four times sooner is the intended change rather than
   * a side effect: `bladder` falls at 0.08 a tick and `hunger` at 0.05, so a
   * prisoner with nowhere to go is in a bad way in a day and a half instead of
   * in six and a half.
   *
   * **4,000 until issue #588, and 3,450 since.** This prison hires nobody, so
   * its sector is `unguarded` and `SafetyCoverageSystem` provisions nothing --
   * and `safety` itself now falls at 0.05 rather than 0.01, five times faster.
   * So the sixth of `needsPressure` that need contributes rises five times
   * sooner and the twelfth consecutive hot sample lands 550 ticks earlier.
   * That is the mechanic doing exactly what the owner's ruling on issue #599
   * asked for, read from the other end: a prison nobody guards reaches the
   * threshold faster than it used to, and the same prison with a guard on post
   * never reaches it at all
   * (`tests/integration/room-gated-needs.test.ts`).
   */
  const RIOT_TICK = 3_450;

  it('opens a riot in the derived sector from real needs and real understaffing', () => {
    const runtime = overcrowdedPrison();

    stepTo(runtime, RIOT_TICK - 1);
    // No *riot* yet. This asserted an empty log until ADR 0061 gave `'assault'`
    // a producer; an unguarded prison holding two prisoners with nowhere to
    // live now also produces those in the stretches before the riot streak
    // completes, so the precondition is narrowed to its own subject.
    expect(runtime.incidents.all().filter((incident) => incident.type === 'riot')).toEqual([]);
    stepTo(runtime, RIOT_TICK + 1);

    const riots = runtime.incidents.all().filter((incident) => incident.type === 'riot');
    expect(riots).toHaveLength(1);
    expect(riots[0]).toMatchObject({
      type: 'riot',
      sectorId: DEFAULT_SECTOR_ID,
      severity: 7,
      startedAtTick: RIOT_TICK,
      state: 'active',
      // Everybody in the prison, the housed prisoner included: the sector is
      // the prison (ADR 0048), so a riot in it is not confined to whoever
      // happened to be standing on the post tile.
      participantIds: [0, 1, 2],
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
    /*
     * The measured value, not a bound. It is what three prisoners come to when
     * two of them have all six needs on the floor and the third has three of
     * six met by a bed and a cell to eat in. A `>= 0.35` bound would also pass
     * for a sample that had drifted to 0.9, which is a different prison.
     *
     * **0.3898, and it was 0.3889 -- exactly 7/18 -- before
     * [ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md).**
     * It is no longer a clean fraction because the housed prisoner's met needs
     * are a fraction of a level lower at this tick than they used to be: that
     * change ends the `[500, 1000)` block in a 60-tick association rather than
     * in nothing, which delays their next meal and next toilet by one 20-tick
     * reconsideration cadence. **Association fulfils no need** -- its
     * `needEffectsPerTick` is empty and `scoreAction` gives it exactly 0 -- so
     * the pressure went *up* by 0.0009 rather than down, which is the direction
     * that matters: filling an empty block with something to do does not
     * relieve the neglect that ADR 0048 made a riot out of. The riot still
     * fires at the same `RIOT_TICK`.
     *
     * **0.3898 since [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)**,
     * and the 0.0011 it moves is the housed prisoner spending part of this
     * window walking rather than standing, which moves when each need is
     * topped up by a few ticks; at the shipped walking speed the sample lands
     * back within a thousandth of where it was. The riot still fires at the same `RIOT_TICK`
     * with the same participants, which is what the bound around this number
     * is for.
     */
    /*
     * **0.4427 since issue #588**, and the 0.0529 it gained is `safety`
     * joining the needs this prison leaves unmet: nobody is on post, so the
     * sector is `unguarded`, nothing provisions the need and it falls at
     * 0.05 a tick along with `hunger`. The riot fires 550 ticks sooner for
     * exactly that reason -- see `RIOT_TICK` above.
     */
    expect(riots[0]!.causeFactors.find((factor) => factor.kind === 'needs-pressure')?.value).toBeCloseTo(0.4427, 4);
    expect(riots[0]!.causeFactors.find((factor) => factor.kind === 'contraband-pressure')?.value).toBe(0);
  });

  it('dispatches responders the player hires in reaction, walks them to the post tile and resolves the riot', () => {
    const runtime = overcrowdedPrison();
    stepTo(runtime, RIOT_TICK + 1);
    expect(theRiot(runtime).state).toBe('active');

    /*
     * Five hires, at a tile the guards have to walk from.
     *
     * A severity-7 riot needs four responders
     * (`respondersPerSeverityPoint` 0.5), and one hire is taken by the sector's
     * own requirement -- three prisoners against
     * `DEFAULT_SECTOR_PRISONERS_PER_GUARD`'s eight is still one guard -- so
     * five is exactly the minimum. It is also the
     * only order in which this is reachable: the shortfall that *causes* the
     * riot is exactly the state in which the pool is empty, so the responders
     * have to arrive after it — which is the play ADR 0036 decision 3 describes
     * and the bound it records.
     */
    for (let index = 0; index < 5; index += 1) hire(runtime, `hire-${String(index)}`, FAR_TILE);

    while (theRiot(runtime).state !== 'responding' && runtime.kernel.tick < RIOT_TICK + 600) {
      runtime.kernel.step();
    }

    // Contained inside the 600-tick deadline, with the lockdown a severity-7
    // riot calls for (`lockdownSeverityThreshold` is 6) actually applied.
    expect(theRiot(runtime).state).toBe('responding');
    expect(runtime.securitySectors.getControlState(DEFAULT_SECTOR_ID)).toBe('lockdown');
    expect(phases(runtime)).toEqual(['on-post', 'on-search', 'on-search', 'on-search', 'on-search']);
    expect(runtime.incidentResponseSystem.claimedGuardIds()).toEqual([1, 2, 3, 4]);
    // Every responder walked from (0, 0) and is standing on the post tile: the
    // destination `requireDefinition(incident.sectorId).postTile` resolves to,
    // which on `main` throws because nothing registered the sector.
    for (const guardId of [1, 2, 3, 4]) expect(runtime.securityGuards.getTile(guardId)).toEqual(ORIGIN);
    expect(runtime.incidentResponseSystem.getMetrics()).toMatchObject({ respondersDispatched: 4, routeFailures: 0 });

    while (runtime.incidents.openIncidents().length > 0 && runtime.kernel.tick < RIOT_TICK + 600) runtime.kernel.step();

    // Resolved rather than lapsed, with nobody hurt -- the containment outcome
    // ADR 0032's consequence tier reads, produced by a session started from
    // nothing.
    expect(theRiot(runtime)).toMatchObject({
      state: 'resolved',
      outcome: { injuredEntityIds: [], propertyDamage: 3, escaped: false },
    });
    // The lockdown lifted and the responders went back to the pool.
    expect(runtime.securitySectors.getControlState(DEFAULT_SECTOR_ID)).toBe('normal');
    expect(phases(runtime)).toEqual(['on-post', 'unassigned', 'unassigned', 'unassigned', 'unassigned']);
    /*
     * Both counters are session-wide and both moved with ADR 0061, which gave
     * `'assault'` a producer: this prison lapses one assault before the riot
     * opens, so `incidentsLapsed` is 1 rather than 0 and `incidentsTriggered`
     * is 2 rather than 1. `riotsTriggered` and `incidentsResolved` are the two
     * that carry this case's claim -- one riot, contained -- and neither has
     * moved. The assault's own reachability is `incident-trigger-reachability.test.ts`'s
     * subject, not this file's.
     */
    expect(runtime.incidentResponseSystem.getMetrics()).toMatchObject({ incidentsResolved: 1, incidentsLapsed: 1 });
    expect(runtime.incidentTriggerSystem.getMetrics()).toEqual({ incidentsTriggered: 2, riotsTriggered: 1, retaliationsTriggered: 0 });
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
    admitOne(live); // #533: so the hire below is actually posted and the sector id is worth asserting.
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
    // The admission is #533's: the derived requirement is a demand for covering
    // people, so the tier is reachable only once the prison holds one.
    admitOne(restored, 'admit-after-load');
    hire(restored, 'hire-after-load', ORIGIN);
    // Guard id 0, not 1: staff and prisoners are two separate `EntityStore`s
    // and both hand out 0 (`actor-identity.ts`, "Ids are not unique across
    // populations"), so the admission above does not shift the guard's id.
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
    admitOne(runtime); // #533: the guard below is only posted because somebody is here to guard.
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

  it('leaves contraband search inert in a prison with no guards, which since #552 is a staffing fact rather than a missing producer', () => {
    /*
     * **This case used to assert `expect(runtime.searchPolicies).toEqual([])`**
     * and read *"two separate absences, and neither is a sector:
     * `runtime.searchPolicies` is empty because nothing in `src/` authors one,
     * and `SearchSystem.submitOrder` has no caller in `src/` at all -- there is
     * no command for it."* Both halves were true when it was written and both
     * are now false ([ADR 0073](../../docs/adr/0073-who-orders-a-contraband-search.md),
     * issue #552): the session ships four policies and
     * `SectorSearchDutySystem` is the caller. It is rewritten rather than
     * deleted because what it was *for* survives -- this prison still finds
     * nothing, and the reason it finds nothing is the thing worth pinning.
     *
     * `overcrowdedPrison` hires nobody. A sweep needs a sector that is actually
     * staffed and a claimable guard to walk it, so an unguarded prison orders
     * none: an empty prison does not search itself. The counterpart -- the same
     * prison with guards, where the counter moves -- is
     * `tests/integration/contraband-search-duty.test.ts`.
     */
    const runtime = overcrowdedPrison();
    stepTo(runtime, 1_000);

    expect(runtime.securityGuards.allGuardIds()).toEqual([]);
    expect(runtime.searchPolicies.map((policy) => policy.scope)).toEqual(['cell', 'delivery', 'person', 'sector']);
    expect(runtime.searchSystem.getMetrics()).toMatchObject({ searchesQueued: 0, searchesCompleted: 0, searchesCancelled: 0 });
    expect(runtime.confiscations.all()).toEqual([]);
  });

  it('records a lockdown that seals nothing, because a perimeter is the one thing a derivation cannot know', () => {
    const runtime = overcrowdedPrison();
    // A door the player built, which the derived sector does not govern.
    submit(runtime, 'buy-door-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 4 }));
    submit(runtime, 'build-door', packCommand({ type: 'PlaceBuildOrder', orderId: 'door-1', definitionId: 'door-wooden', x: 5, y: 6 }));
    stepTo(runtime, 600);
    // Named rather than counted. This used to read
    // `expect(doorIds).toHaveLength(1)`, which was true when the prison's only
    // door was the one this case builds -- and stopped being true when the
    // fixture began walling its cell, because a walled cell needs a door to be
    // reachable at all (`tests/helpers/room-walls.ts`). The count was never the
    // claim; the claim is about *this* door, so it is looked up by the edge it
    // was built on instead, which is strictly more specific than the old
    // assertion and does not care how many other doors the prison has.
    const builtDoor = runtime.navigation.doors.getByEdge(
      { x: tileCoordinate(5), y: tileCoordinate(6) },
      'top',
    );
    expect(builtDoor, 'the ordered door must have been built for this case to mean anything').toBeDefined();
    const doorIds = [builtDoor!.id];

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
