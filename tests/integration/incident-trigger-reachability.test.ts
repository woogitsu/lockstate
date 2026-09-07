import { describe, expect, it } from 'vitest';
import type { IncidentRecord, IncidentType } from '../../src/simulation/incidents/incident';
import { PLACEHOLDER_ACTOR_NAME_POOL } from '../../src/simulation/identity/name-pool';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Can a prison a player built have an incident, and can the player stop it?**
 * ([ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md), taking
 * [ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * decision 2.)
 *
 * ## Why this file is not the one beside it
 *
 * `tests/integration/security-default-sector.test.ts` proves one riot happens
 * in one fixture. That is the wrong shape for a producer: a trigger that fires
 * in every prison is as broken as one that fires in none, and a single positive
 * case cannot tell the two apart. This file is the **ladder** — four prisons a
 * player could plausibly build, and the assertion is as much about the ones
 * that stay quiet as about the ones that do not.
 *
 * Every prison here is built with nothing but the commands a player can send:
 * `PurchaseMaterials`, `ZoneRoom`, `PlaceObject`, `HireStaff`, `AdmitPrisoner`.
 * The one shortcut is `wallRoomPerimeter`, which writes the wall edges a
 * completed `wall-brick` order would write, for the reason that helper states
 * about itself.
 *
 * ## The figures
 *
 * Every tick count and every riot count below was read off a run and written
 * out, never computed from the code under test. They are properties of
 * `DEFAULT_SECTOR_RISK_POLICY`, `NEED_DECAY_PER_TICK`,
 * `DEFAULT_SECTOR_PRISONERS_PER_GUARD` and the room/object catalogues together;
 * if any of those moves, these lines have to move and a reviewer has to see
 * them.
 */

const SEED = 0x0cc0;
const DAY = 2_400;
/** Twelve and a half in-game days: past the last measured first-riot tick (15,800) with room to spare. */
const RUN_TICKS = 30_000;

const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
const CANTEEN = { x: 19, y: 6, width: 6, height: 6 } as const;
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;
/**
 * Long enough that nobody's sentence can interact with a run this length.
 *
 * That was already the intent and it is now the only thing holding it up: this
 * comment used to add that "`sentenceEndTick` has no reader that compares it to
 * the tick anyway (ADR 0042 §#441)", and #441 gave it one --
 * `PrisonerDischargeSystem`. 400,000 against `RUN_TICKS` of 30,000 keeps the
 * margin; it also sits above `LONG_SENTENCE_THRESHOLD_TICKS`, so it is a
 * classification input this file has always been making and is unchanged.
 */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

interface PrisonPlan {
  /** Zoned `room.cell`s, each 2x3 with a bed and optionally a toilet. */
  readonly cells: number;
  readonly toilets: boolean;
  /** A shower room, a canteen and a yard: the three rooms `action.shower`, `action.eat-meal` and `action.yard-recreation` need. */
  readonly amenities: boolean;
  readonly prisoners: number;
  readonly guards: number;
  /**
   * `AdmitPrisoner.priorIncidents`, defaulting to the 0 every case in this file
   * used before ADR 0061.
   *
   * It is here because it is the one figure on the admission command that
   * decides a `RiskTier`, and the escape-attempt producer is gated on the tier
   * (`ESCAPE_ATTEMPT_MINIMUM_RISK_TIER`). A prison is not only what the player
   * builds; it is also who they agree to take.
   */
  readonly priorIncidents?: number;
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Cells in a row along the top of the one chunk a prison owns, three tiles apart so no two share a wall. */
function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}

function buildPrison(plan: PrisonPlan): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: plan.cells }, (_unused, index) => cellRect(index));

  // One plank per bed; one brick per toilet; the canteen's two 3x2 tables and
  // four 2x1 benches at three and two planks each; one brick per shower head.
  const planks = plan.cells + (plan.amenities ? 6 + 8 : 0);
  const bricks = (plan.toilets ? plan.cells : 0) + (plan.amenities ? 2 : 0);
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: planks }));
  if (bricks > 0) submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: bricks }));

  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  if (plan.amenities) for (const rect of [SHOWER, CANTEEN, YARD]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });

  cells.forEach((rect, index) => submit(runtime, `zone-c${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  if (plan.amenities) {
    submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
    submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));
    submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...YARD }));
  }

  cells.forEach((rect, index) => {
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    if (plan.toilets) {
      submit(runtime, `wc${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `wc${String(index)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
    }
  });
  if (plan.amenities) {
    submit(runtime, 'sh1', packCommand({ type: 'PlaceObject', orderId: 'sh1', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
    submit(runtime, 'sh2', packCommand({ type: 'PlaceObject', orderId: 'sh2', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
    submit(runtime, 'dt1', packCommand({ type: 'PlaceObject', orderId: 'dt1', definitionId: 'dining-table-wooden', x: CANTEEN.x, y: CANTEEN.y }));
    submit(runtime, 'dt2', packCommand({ type: 'PlaceObject', orderId: 'dt2', definitionId: 'dining-table-wooden', x: CANTEEN.x + 3, y: CANTEEN.y }));
    for (let index = 0; index < 4; index += 1) {
      submit(runtime, `bench${String(index)}`, packCommand({
        type: 'PlaceObject',
        orderId: `bench${String(index)}`,
        definitionId: 'bench-wooden',
        x: CANTEEN.x + (index % 2) * 2,
        y: CANTEEN.y + 2 + Math.floor(index / 2),
      }));
    }
  }

  // Delivery delay plus build progress; every order is standing well before this.
  stepTo(runtime, 1_000);
  for (let index = 0; index < plan.guards; index += 1) {
    submit(runtime, `hire${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  }
  for (let index = 0; index < plan.prisoners; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, priorIncidents: plan.priorIncidents ?? ADMISSION.priorIncidents, ...ARRIVAL }));
  }

  // A refused purchase, zoning or placement would make every figure below a
  // measurement of a different prison, so it is checked rather than assumed.
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

function run(plan: PrisonPlan): SimulationRuntime {
  const runtime = buildPrison(plan);
  stepTo(runtime, RUN_TICKS);
  return runtime;
}

/**
 * Every incident of one type, in log order.
 *
 * The whole file used to read `runtime.incidents.all()` and mean "the riots",
 * because a riot was the only thing `src/` could produce. Since
 * [ADR 0061](../../docs/adr/0061-what-the-prison-produces-on-its-own.md) it can
 * produce three, so each claim now names the type it is about -- and the ones
 * that were about riots are unchanged in every number.
 */
function incidentsOfType(runtime: SimulationRuntime, type: IncidentType): readonly IncidentRecord[] {
  return runtime.incidents.all().filter((incident) => incident.type === type);
}

/** Every living prisoner's `riskTier`, read off the component the classification draw wrote. */
function riskTiers(runtime: SimulationRuntime): readonly number[] {
  const store = runtime.prisoners.entityStore;
  const tiers: number[] = [];
  for (let index = 0; index <= store.maxActiveIndex; index += 1) {
    if (store.isIndexAlive(index)) tiers.push(runtime.prisoners.records.riskTier[index]!);
  }
  return tiers;
}

function livingPrisoners(runtime: SimulationRuntime): number {
  return riskTiers(runtime).length;
}

/** How many prisoners hold a cell, summed over the instances -- the other half of "they are gone". */
function housedPrisoners(runtime: SimulationRuntime): number {
  return runtime.prisoners.roomInstances
    .allByRoomCatalogId('room.cell')
    .reduce((total, instance) => total + runtime.prisoners.roomInstances.occupantsOf(instance.instanceId).length, 0);
}

const WELL_RUN = { cells: 8, toilets: true, amenities: true, prisoners: 8, guards: 1 } as const;

describe('a prison that meets its prisoners’ needs does not riot, however it is staffed', () => {
  it('stays clear for twelve in-game days with one guard, and again with none', () => {
    // The most important case in the file, and the one a producer is easiest to
    // get wrong: a trigger that fires here would make every prison riot and the
    // incident chip would be permanently red.
    for (const guards of [1, 0]) {
      const runtime = run({ ...WELL_RUN, guards });
      expect(incidentsOfType(runtime, 'riot'), `guards: ${String(guards)}`).toEqual([]);
      expect(runtime.incidentTriggerSystem.getMetrics().riotsTriggered).toBe(0);
    }
  });

  /**
   * **The same claim for the producer ADR 0061 added**, and it is here rather
   * than in a file of its own because it is the same question: a trigger that
   * fires in a prison that is doing everything right is as broken as one that
   * never fires.
   *
   * The staffed row is the strict one. The unguarded row is not a clean sweep
   * and is asserted as what it is: this prison is *well run* and still has no
   * security at all, and a prisoner who drew a weapon at intake scores
   * `0.10 + 0.36 + 0.30` against a 0.65 line. That is the mechanic working --
   * an armed prisoner and nobody watching -- and pretending otherwise would be
   * asserting a comfort rather than a measurement.
   */
  it('has no assaults either, once a single guard is on post', () => {
    const runtime = run({ ...WELL_RUN, guards: 1 });
    expect(incidentsOfType(runtime, 'assault')).toEqual([]);
    expect(incidentsOfType(runtime, 'escape-attempt')).toEqual([]);

    // Non-vacuous: contraband really did come in with these arrivals, so the
    // silence above is the score being low rather than the substrate being
    // empty. If this ever reads 0 the case above has stopped testing anything.
    expect(runtime.contraband.all().length).toBeGreaterThan(0);
  });
});

describe('a prison with beds and nothing else is one guard away from rioting', () => {
  /**
   * Eight housed prisoners with no toilet, no shower and no yard. Three of
   * their six needs have no action that can restore them, so `needsPressure`
   * settles around 0.44 — under `hotThreshold` on its own, and over it once the
   * `staffingShortfall` term is 1.
   */
  const BED_ONLY = { cells: 8, toilets: false, amenities: false, prisoners: 8 } as const;

  it('riots when nobody is guarding it', () => {
    const runtime = run({ ...BED_ONLY, guards: 0 });
    const riots = incidentsOfType(runtime, 'riot');
    expect(riots.length).toBeGreaterThan(0);
    expect(riots[0]!.causeFactors.find((factor) => factor.kind === 'staffing-shortfall')?.value).toBe(1);
  });

  it('does not riot, once a single guard is hired — which is the whole of the difference', () => {
    const runtime = run({ ...BED_ONLY, guards: 1 });
    expect(incidentsOfType(runtime, 'riot')).toEqual([]);
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 1, assigned: 1, shortage: 0 },
    ]);
  });

  /**
   * **What that guard does not buy, which is issue #477's whole subject.**
   *
   * #477 measured this prison's staffed row and found nothing: *"with one
   * guard, two needs at zero cannot reach the riot threshold — neglect costs a
   * staffed prison nothing"*. The riot row above still reads exactly that, and
   * deliberately: ADR 0061 changed no weight in `DEFAULT_SECTOR_RISK_POLICY`
   * and the sector score in #477's own fixture still peaks at 0.4824.
   *
   * What it costs the prison now is this. Eight prisoners with beds and nothing
   * else run a mean need deficit near 0.48, and a prisoner who is also
   * concealing something worth using clears the same 0.65 line the sector is
   * judged at -- so the prison that could not riot has fights instead, once a
   * fortnight of in-game days rather than never.
   *
   * Nothing here hands the prison contraband. It arrives with the arrivals, on
   * `AdmitPrisoner` commands this fixture was already sending before ADR 0061,
   * and the assertion below reads it back out of the registry rather than
   * putting it there -- which is the shape issue #375 catalogues four failures
   * of.
   */
  it('but it does have assaults, which is what neglect costs a staffed prison', () => {
    const runtime = run({ ...BED_ONLY, guards: 1 });

    const assaults = incidentsOfType(runtime, 'assault');
    expect(assaults.length).toBeGreaterThan(0);
    // Two prisoners, and both of them real: an assault names the pair the
    // prison has failed worst, and `IncidentResponseSystem` injures both when
    // nobody contains it.
    for (const assault of assaults) expect(assault.participantIds).toHaveLength(2);

    // The cause factors say which real inputs did it, so this cannot pass on an
    // assault that fired for some other reason. The staffing term is zero --
    // the guard *is* on post -- which is exactly what makes this #477's answer
    // rather than a restatement of the unguarded row.
    const factors = new Map(assaults[0]!.causeFactors.map((factor) => [factor.kind, factor.value]));
    expect([...factors.keys()]).toEqual(['assault-pressure', 'need-deficit', 'contraband-severity', 'staffing-shortfall']);
    expect(factors.get('staffing-shortfall')).toBe(0);
    // The deficit *at the tick the first assault opened*, which is lower than
    // the 0.4824 the same prison settles at over twenty days -- needs decay
    // towards their floor rather than starting there. A bound rather than a
    // pinned value, because the tick the first one lands on is a property of
    // the whole ladder and this case is about the terms, not the timing.
    expect(factors.get('need-deficit')).toBeGreaterThan(0.35);
    expect(factors.get('contraband-severity')).toBeGreaterThan(0);
    expect(factors.get('assault-pressure')).toBeGreaterThanOrEqual(0.65);

    // And the prison the assault happened in is the one the sector score still
    // reads as calm, which is the whole of the split this case exists to show.
    expect(runtime.sectorRisk.getScore('security-sector.prison')).toBeLessThan(0.65);
    expect(runtime.incidentTriggerSystem.getMetrics().riotsTriggered).toBe(0);
  });
});

describe('a prison outgrows its staffing, and the coverage report says so before the riot does', () => {
  /**
   * Sixteen prisoners for eight beds: half the population is left at
   * `accommodation-assignment` with nothing to restore any need.
   *
   * **`amenities` was `true` here until
   * [ADR 0102](../../docs/adr/0102-what-a-prisoner-without-a-bed-may-still-do.md),
   * and the reason it had to move is the strongest thing this file now says
   * about that decision.** An unhoused prisoner may eat, wash and take
   * recreation since 2026-09-07, so in a prison that has *built* those rooms
   * the eight people with no bed are no longer at a need deficit near 1 -- and
   * the three cases below, which are about what an over-admitted prison
   * produces, all went silent. Measured over this file's own 30,000 ticks,
   * with `amenities: true` and everything else as it stands:
   *
   * | | before ADR 0102 | after |
   * | --- | --- | --- |
   * | one guard | 3 assaults, 4 riots | 11 assaults, **0 riots** |
   * | two guards | 10 assaults | **nothing at all** |
   *
   * The sentence in the docblock above -- "nothing to restore any need" -- was
   * therefore describing a prison that had a canteen, a shower room and a yard
   * standing in it, and was true only because of the line ADR 0102 removed.
   * Dropping `amenities` makes the fixture what its own description says it
   * is, and keeps every claim below on a prison where it is still true. What
   * the amenity-rich prison does now is pinned in its own describe at the end
   * of this file rather than left to be rediscovered.
   */
  const OVERCROWDED = { cells: 8, toilets: true, amenities: false, prisoners: 16 } as const;

  it('asks for a second guard at sixteen prisoners, and riots while it has one', () => {
    const runtime = run({ ...OVERCROWDED, guards: 1 });
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 2, assigned: 1, shortage: 1 },
    ]);
    expect(incidentsOfType(runtime, 'riot').length).toBeGreaterThan(0);
  });

  it('stops rioting once the second guard is hired, without a single cell being built', () => {
    const runtime = run({ ...OVERCROWDED, guards: 2 });
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 2, assigned: 2, shortage: 0 },
    ]);
    expect(incidentsOfType(runtime, 'riot')).toEqual([]);
  });

  /**
   * **And the eight prisoners it never housed are still there.**
   *
   * The case above is the one #442 and ADR 0048 left the prison in: hire the
   * second guard and the readout goes quiet, with half the population standing
   * on the arrival tile with nowhere to sleep, eat or wash. Their six needs
   * decay unopposed to a deficit near 0.95, and the sector *mean* -- eight of
   * them against eight who are perfectly well housed -- comes to 0.5908, under
   * the line. That is the mean hiding the individual, and it is the reading
   * `flashpoint.ts` exists to add.
   *
   * This is the strongest single case in the file for ADR 0061, because it
   * needs no contraband at all: being unhoused is enough on its own.
   */
  it('and the prisoners it never housed produce assaults the sector score cannot see', () => {
    const runtime = run({ ...OVERCROWDED, guards: 2 });

    expect(incidentsOfType(runtime, 'assault').length).toBeGreaterThan(0);
    // The sector is calm by its own measure, throughout: `getScore` is the last
    // sample and the run ends on one.
    expect(runtime.sectorRisk.getScore('security-sector.prison')).toBeLessThan(0.65);

    // The state that produced it, read back rather than arranged: half the
    // population never left `accommodation-assignment`, because eight beds do
    // not house sixteen people.
    const housed = runtime.prisoners.roomInstances
      .allByRoomCatalogId('room.cell')
      .reduce((total, instance) => total + runtime.prisoners.roomInstances.occupantsOf(instance.instanceId).length, 0);
    expect(housed).toBe(8);

    const factors = new Map(incidentsOfType(runtime, 'assault')[0]!.causeFactors.map((factor) => [factor.kind, factor.value]));
    expect(factors.get('staffing-shortfall')).toBe(0);
    // Well above the sector mean of 0.5908 that the same prison reports, which
    // is the point: this is one unhoused prisoner's own figure, read at the
    // tick their assault opened rather than at the end of the run.
    expect(factors.get('need-deficit')).toBeGreaterThan(0.5);
  });
});

describe('past a point, staffing buys containment rather than prevention', () => {
  it('riots at four times its bed capacity however many guards are on the payroll, and contains every one of them', () => {
    // Twelve of sixteen prisoners homeless: `needsPressure` alone is over
    // `hotThreshold`, so the `staffingShortfall` term is not what fires it and
    // no number of hires can hold it back. What the hires buy is the *outcome*:
    // `IncidentResponseSystem` claims four responders per riot out of the pool
    // the deployment requirement has not taken, and a contained riot injures
    // nobody where a lapsed one injures every participant.
    //
    // `amenities` was `true` here until ADR 0102, for the reason `OVERCROWDED`
    // above gives at length: with a canteen, a shower room and a yard built,
    // twelve homeless prisoners are no longer at a deficit that reaches the
    // threshold, and this prison produced nothing at all. The claim -- that
    // past a point staffing buys containment rather than prevention -- is kept
    // on the prison that still reaches it.
    const runtime = run({ cells: 4, toilets: true, amenities: false, prisoners: 16, guards: 6 });

    const riots = runtime.incidents.all();
    expect(riots.length).toBeGreaterThan(0);
    expect(riots.filter((incident) => incident.state === 'lapsed')).toEqual([]);
    expect(riots.every((incident) => incident.state === 'resolved')).toBe(true);
    expect(riots.every((incident) => incident.outcome?.injuredEntityIds.length === 0)).toBe(true);
    expect(runtime.incidentResponseSystem.getMetrics().incidentsLapsed).toBe(0);
  });
});

describe('the rate is a game rather than a nuisance', () => {
  it('opens riots days apart in a prison that never improves, not one every window', () => {
    // Before the quiet period existed this same shape opened 49 riots in 20
    // in-game days -- roughly one every ten hours, each with its own
    // disciplinary points. The gate is `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT`
    // and this is the assertion that keeps it.
    const runtime = run({ cells: 8, toilets: false, amenities: false, prisoners: 8, guards: 0 });

    /*
     * Sorted by tick, and it has to be. `IncidentLog.all()` sorts by *id*
     * lexicographically, and since ADR 0061 a shared incident sequence reaches
     * double figures in a run this long -- so `incident.riot.11` sorts before
     * `incident.riot.2` and the gaps below came out negative. That was a latent
     * fragility in this assertion rather than a new one: it held only while a
     * prison produced fewer than ten incidents in twelve in-game days.
     */
    const startTicks = incidentsOfType(runtime, 'riot')
      .map((incident) => incident.startedAtTick)
      .sort((left, right) => left - right);
    expect(startTicks.length).toBeGreaterThan(1);
    for (let index = 1; index < startTicks.length; index += 1) {
      expect(startTicks[index]! - startTicks[index - 1]!).toBeGreaterThanOrEqual(2 * DAY);
    }
    // Twelve and a half days of a prison nobody fixed, and it is single figures.
    expect(startTicks.length).toBeLessThanOrEqual(RUN_TICKS / (2 * DAY));
  });

  it('is deterministic: the same seed and the same commands produce the same riots twice', () => {
    const first = run({ cells: 8, toilets: false, amenities: false, prisoners: 8, guards: 0 });
    const second = run({ cells: 8, toilets: false, amenities: false, prisoners: 8, guards: 0 });
    expect(second.incidents.all()).toEqual(first.incidents.all());
  });
});

describe('who the prison agreed to take is a decision too, and an unguarded prison loses them', () => {
  /**
   * **The escape-attempt producer**
   * ([ADR 0061](../../docs/adr/0061-what-the-prison-produces-on-its-own.md)
   * decisions 4 and 5), and the pair is the whole of the case: the *same*
   * prison, the same eight people, the same twelve and a half in-game days, one
   * `HireStaff` command apart.
   *
   * Nothing about this prison is neglected. It is `WELL_RUN` -- eight furnished
   * cells with toilets, a shower room, a canteen and a yard -- so `needsPressure`
   * peaks at 0.1869 and neither the riot nor the assault producer can reach it.
   * What is different is **who it agreed to take**: `priorIncidents: 2` against
   * a sentence over `LONG_SENTENCE_THRESHOLD_TICKS` puts almost every arrival in
   * the `high-risk` classification group, and two of them concealed something at
   * intake.
   *
   * Neither of those is arranged here. The tier is a `classifyPrisoner` draw off
   * the `prisoners.classification` stream from figures the `AdmitPrisoner`
   * command carries; the contraband is an `introduceContrabandOnIntake` draw off
   * `contraband.introduction` at the classification stage. Both are read back
   * out of the real registries below rather than written into them -- the shape
   * issue #375 catalogues four failures of.
   */
  const HIGH_RISK_INTAKE = { ...WELL_RUN, priorIncidents: 2 } as const;

  it('lets two of them out when nobody is on post, and they are gone from the prison', () => {
    const runtime = run({ ...HIGH_RISK_INTAKE, guards: 0 });

    const attempts = incidentsOfType(runtime, 'escape-attempt');
    expect(attempts.length).toBeGreaterThan(0);
    // One participant: an escape attempt is one person leaving, and a list
    // would make it several people gone at once on a single roll.
    for (const attempt of attempts) expect(attempt.participantIds).toHaveLength(1);

    // Nobody was hired, so nothing answered them: `IncidentResponseSystem`
    // lapses at `responseDeadlineTicks` and `escaped` is what a lapsed escape
    // attempt means. That flag has been in `lapse` since #28 and had never once
    // been true in a running prison.
    expect(attempts.every((attempt) => attempt.state === 'lapsed')).toBe(true);
    expect(attempts.every((attempt) => attempt.outcome?.escaped === true)).toBe(true);

    /*
     * **And the flag is not a claim the code fails to keep.** The prisoners the
     * log names are not in the prison any more: the population is down by
     * exactly the number of escapes, the entity ids are dead, and the cells
     * they held are free again. Without this half, the incidents panel would
     * read "escaped: yes" beside a prisoner still asleep in their bed, which is
     * the class of defect `AGENTS.md` reserves to the owner.
     */
    const escaped = attempts.flatMap((attempt) => attempt.participantIds);
    for (const entityId of escaped) expect(runtime.prisoners.entityStore.isAlive(entityId)).toBe(false);
    expect(livingPrisoners(runtime)).toBe(WELL_RUN.prisoners - escaped.length);
    expect(housedPrisoners(runtime)).toBe(WELL_RUN.prisoners - escaped.length);

    // They took what they were concealing with them, rather than leaving it in
    // a registry keyed by an entity that no longer exists.
    const departed = runtime.contraband.all().filter((item) => item.state === 'departed');
    expect(departed.length).toBe(escaped.length);
    for (const item of departed) expect(escaped.map(String)).toContain(item.holder.id);

    /*
     * **And the prison says so, naming them
     * ([#683](https://github.com/matmaxalez/lockstate/issues/683)).** One
     * `incidents.escape-succeeded` per person, carrying the id and the name the
     * sentence `hud.alert.event.incidents.escape-succeeded` renders. Which
     * sentence, in which band, is measured against the shipped catalogue in
     * `tests/integration/escape-outcome-visibility.test.ts`; what is measured
     * *here*, and can only be measured here, is that a **real session** fills
     * it -- that file injects its own departure port, and this one runs the one
     * `createNewSimulationRuntime` wires.
     *
     * **The `name` assertion is the whole reason this block exists, and it is
     * an ordering test wearing a data test's clothes.** The port reads the name
     * and *then* releases, because `releasePrisoner` calls
     * `identity.release('prisoner', entityId)`: swap those two lines and
     * `getName` answers `undefined`, the payload loses its name, and the band
     * silently degrades from "Ada Bell broke out" to "Prisoner 7 broke out" --
     * a defect no type and no other test in this repository catches. Measured:
     * with the two statements transposed, all 61 integration files still
     * passed.
     *
     * Non-vacuous because the halves are checked against the pool they can only
     * have come from. Asserting merely that `name !== undefined` would pass for
     * a port that invented one, and asserting a literal "Ada Bell" would be the
     * fixture supplying both sides of its own comparison.
     */
    const announced = runtime.events.since(0).filter((event) => event.type === 'incidents.escape-succeeded');
    expect(announced.map((event) => (event as { entityId: number }).entityId).sort((a, b) => a - b)).toEqual(
      [...escaped].sort((a, b) => a - b),
    );
    for (const event of announced) {
      const { name } = event as { name?: { givenName: string; familyName: string } };
      expect(name, 'the name is read before the departure releases it').toBeDefined();
      expect(PLACEHOLDER_ACTOR_NAME_POOL.givenNames).toContain(name?.givenName);
      expect(PLACEHOLDER_ACTOR_NAME_POOL.familyNames).toContain(name?.familyName);
    }
  });

  it('and loses none of them for one hire, which is the whole of the difference', () => {
    const runtime = run({ ...HIGH_RISK_INTAKE, guards: 1 });

    expect(incidentsOfType(runtime, 'escape-attempt')).toEqual([]);
    expect(livingPrisoners(runtime)).toBe(WELL_RUN.prisoners);

    /*
     * Non-vacuous three times over, because every one of these is a premise the
     * case above rests on and a silent change to any of them would make this
     * test pass for the wrong reason: the prison really did take high-risk
     * prisoners, contraband really did come in with them, and it is still
     * concealed rather than having left with somebody.
     */
    expect(riskTiers(runtime).filter((tier) => tier >= 3).length).toBeGreaterThan(0);
    expect(runtime.contraband.all().length).toBeGreaterThan(0);
    expect(runtime.contraband.all().every((item) => item.state === 'concealed')).toBe(true);
  });
});

/**
 * **What [ADR 0102](../../docs/adr/0102-what-a-prisoner-without-a-bed-may-still-do.md)
 * did to an over-admitted prison that had already built the rooms.**
 *
 * This describe exists because the three cases above had to change their
 * fixtures to survive that decision, and a fixture changed without the new
 * behaviour being written down anywhere is how a balance change disappears.
 * Each prison here is the `amenities: true` version of a prison that riots or
 * assaults elsewhere in this file, and the claim is the one a player would
 * make: **build a canteen, a shower room and a yard, staff to requirement, and
 * over-admission stops producing incidents at all.**
 *
 * That is ADR 0102's own Cost table read back off a run. It prices a covered
 * sector with those three rooms at a best-case need-deficit floor of 2/6
 * (0.333) against `DEFAULT_ASSAULT_POLICY`'s 0.65 threshold, and the sector
 * scores below land at 0.2838 and 0.3462 -- under the line by the margin that
 * table predicts, where the same prisons scored 0.4895 and 0.6513 before.
 *
 * **It also contradicts, measurably, the sentence that document's acceptance
 * was given against.** ADR 0102's Status records that the owner accepted it
 * knowing "even a built one does not stop rioting outright". A built one does:
 * these prisons produce nothing whatsoever. That is recorded here, in the file
 * that measures reachability, rather than argued in a document -- and it is a
 * balance question for the owner rather than a defect, which is why nothing
 * here is written as a bug.
 */
describe('an over-admitted prison that built the rooms is quiet since ADR 0102', () => {
  /** The `OVERCROWDED` prison above, with the canteen, shower room and yard it used to have. */
  const OVERCROWDED_WITH_AMENITIES = { cells: 8, toilets: true, amenities: true, prisoners: 16 } as const;

  it('has no riots at all on one guard, where it had four -- the pressure comes out as fights instead', () => {
    const runtime = run({ ...OVERCROWDED_WITH_AMENITIES, guards: 1 });

    // The prison is still over-admitted and still short a guard: neither the
    // coverage report nor the housing changed, only what the unhoused half of
    // the population can do about its needs.
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 2, assigned: 1, shortage: 1 },
    ]);
    expect(housedPrisoners(runtime)).toBe(8);

    // 4 riots (severities 7, 8, 8, 8) before ADR 0102 and none after; 3
    // assaults before and 11 after. The staffing shortfall is what still puts
    // an individual over the assault line, which is why this row is not
    // silent the way the staffed rows below are.
    expect(incidentsOfType(runtime, 'riot')).toEqual([]);
    expect(incidentsOfType(runtime, 'assault').length).toBeGreaterThan(0);
    expect(runtime.sectorRisk.getScore('security-sector.prison')).toBeLessThan(0.65);
  });

  it('produces nothing at all once it is staffed to requirement, where it produced ten assaults', () => {
    const runtime = run({ ...OVERCROWDED_WITH_AMENITIES, guards: 2 });

    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 2, assigned: 2, shortage: 0 },
    ]);
    // Non-vacuous: eight of the sixteen are still standing on the arrival tile
    // with no bed, exactly as they were when this prison produced ten
    // assaults.
    expect(housedPrisoners(runtime)).toBe(8);
    expect(livingPrisoners(runtime)).toBe(16);

    expect(runtime.incidents.all()).toEqual([]);
    // 0.4895 before ADR 0102, against a `hotThreshold` the sector never
    // reaches now.
    expect(runtime.sectorRisk.getScore('security-sector.prison')).toBeLessThan(0.35);
  });

  it('is quiet at four times its bed capacity too, where it had three riots and ten assaults', () => {
    const runtime = run({ cells: 4, toilets: true, amenities: true, prisoners: 16, guards: 6 });

    expect(housedPrisoners(runtime)).toBe(4);
    expect(livingPrisoners(runtime)).toBe(16);
    expect(runtime.incidents.all()).toEqual([]);
    // 0.6513 before ADR 0102 -- over `hotThreshold` on the needs term alone,
    // which is what the case above this describe says no number of hires could
    // hold back. Twelve homeless prisoners with somewhere to eat, wash and
    // exercise now read 0.3462.
    expect(runtime.sectorRisk.getScore('security-sector.prison')).toBeLessThan(0.4);
  });
});
