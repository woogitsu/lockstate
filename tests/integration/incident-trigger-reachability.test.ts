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
  /**
   * How much dining and hygiene those rooms actually provide, defaulting to
   * what every case in this file built before the population ladder at the
   * end of it: two `dining-table-wooden` (a `'dining'` ceiling of six), four
   * `bench-wooden`, two `shower-head-brick` (a `'hygiene'` ceiling of two).
   *
   * They are parameters because `concurrentUseCapacityByCapability` is what a
   * population contends for (`src/simulation/objects/room-capacity.ts`), and a
   * ladder that varies the population without being able to vary the ceiling
   * cannot tell "more prisoners" from "the same rooms, more thinly spread".
   * Ignored entirely when `amenities` is false.
   *
   * The canteen is `room.canteen`'s authored 6x6 minimum and holds three rows
   * of two 3x2 tables, with the benches taking the first row the tables leave
   * -- so **`tables` and `benches` together must fit six rows**: 4 tables and 4
   * benches do, 6 and 4 do not and the placement is refused. `room.canteen`
   * authors `object.bench` `minQuantity: 4`, so a variant that drops them is a
   * canteen a player has not finished and is not built here. The shower room
   * is `room.shower-room`'s authored 3x3 minimum, which holds nine heads.
   *
   * Only `object.dining-table` carries `'dining'` and only
   * `object.shower-head` carries `'hygiene'`, each with `footprint.width` 3
   * and 1, so `tables` and `showerHeads` are those two ceilings divided by 3
   * and by 1. `object.bench` carries `'seating'` and `'recreation'`, which no
   * action performed in a canteen consumes.
   */
  readonly tables?: number;
  readonly benches?: number;
  readonly showerHeads?: number;
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

function buildPrison(plan: PrisonPlan, seed: number = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  const cells = Array.from({ length: plan.cells }, (_unused, index) => cellRect(index));

  const tables = plan.amenities ? (plan.tables ?? 2) : 0;
  const benches = plan.amenities ? (plan.benches ?? 4) : 0;
  const showerHeads = plan.amenities ? (plan.showerHeads ?? 2) : 0;

  // One plank per bed; one brick per toilet; the canteen's 3x2 tables and 2x1
  // benches at three and two planks each; one brick per shower head.
  const planks = plan.cells + tables * 3 + benches * 2;
  const bricks = (plan.toilets ? plan.cells : 0) + showerHeads;
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
  // The ids stay 1-based so that the two-table, two-head default submits
  // `sh1`, `sh2`, `dt1` and `dt2` exactly as it did before these counts were
  // parameters, and every figure measured under the old spelling still refers
  // to the same run.
  for (let index = 0; index < showerHeads; index += 1) {
    submit(runtime, `sh${String(index + 1)}`, packCommand({
      type: 'PlaceObject',
      orderId: `sh${String(index + 1)}`,
      definitionId: 'shower-head-brick',
      x: SHOWER.x + (index % 3),
      y: SHOWER.y + Math.floor(index / 3),
    }));
  }
  for (let index = 0; index < tables; index += 1) {
    submit(runtime, `dt${String(index + 1)}`, packCommand({
      type: 'PlaceObject',
      orderId: `dt${String(index + 1)}`,
      definitionId: 'dining-table-wooden',
      x: CANTEEN.x + (index % 2) * 3,
      y: CANTEEN.y + Math.floor(index / 2) * 2,
    }));
  }
  for (let index = 0; index < benches; index += 1) {
    submit(runtime, `bench${String(index)}`, packCommand({
      type: 'PlaceObject',
      orderId: `bench${String(index)}`,
      definitionId: 'bench-wooden',
      x: CANTEEN.x + (index % 2) * 2,
      // The first row the tables leave free. At the default two tables that is
      // `CANTEEN.y + 2`, which is where every bench in this file has always
      // stood.
      y: CANTEEN.y + Math.ceil(tables / 2) * 2 + Math.floor(index / 2),
    }));
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
 * **`run`, memoised on the plan, for the plans two cases ask for identically.**
 *
 * Three plans in this file are each built twice by two different cases, from
 * the same `PrisonPlan` and this file's own seed, and the second build cannot
 * observe anything the first did not: `run` returns a runtime already carried
 * to `RUN_TICKS`, and every case that takes one only *reads* incidents,
 * coverage, scores and occupancy off it. Nothing steps a runtime `run`
 * returned, so there is no order in which a shared one differs from a fresh
 * one.
 *
 * Measured on this tree, this file alone on an idle four-core container, three
 * runs each way: **17.41s / 17.97s / 17.64s of test time before, 17.22s /
 * 17.08s / 16.16s after** -- three 30,000-tick simulations, worth about 0.6s
 * of a 17.6s file. The three cases that now take the cached runtime report
 * **1ms, 3ms and 1ms**, against 209ms, 173ms and 173ms before.
 *
 * **Said plainly, because it is the useful part: this is a small saving and it
 * does not touch either case CI timed out on.** `stays clear for twelve
 * in-game days` and `stops rioting on every seed tried` both build plans
 * nothing else in the file builds, and both are still the full cost they
 * were. What is removed here is duplication, not their cost, and their cost
 * is inherent.
 *
 * **Deliberately not applied to the two cases that are about repetition
 * itself.** `is deterministic: the same seed and the same commands produce the
 * same riots twice` builds its two runtimes with `run` on both halves, and the
 * three seed sweeps below call `runOnSeed`; handing any of those a cached
 * runtime would make the assertion compare an object with itself, which is the
 * one way a saved simulation here would buy a false green. The memo is keyed
 * on the plan alone and `runOnSeed` never touches it.
 */
const CACHED_RUNS = new Map<string, SimulationRuntime>();

function cachedRun(plan: PrisonPlan): SimulationRuntime {
  const key = JSON.stringify(Object.entries(plan).sort(([a], [b]) => (a < b ? -1 : 1)));
  const cached = CACHED_RUNS.get(key);
  if (cached !== undefined) return cached;
  const runtime = run(plan);
  CACHED_RUNS.set(key, runtime);
  return runtime;
}

/**
 * The same run on a seed other than this file's own.
 *
 * Added for ADR 0102, and for one claim only: **that the riots stopping is a
 * property of the change and not of `0x0cc0`.** Every other figure in this
 * file is single-seed and stays that way -- a seed sweep over tick counts and
 * severities would pin nothing and cost thirty runs -- but "this prison no
 * longer riots" is exactly the shape of claim a single seed cannot carry, and
 * the assault counts beside it turned out to be seed-dependent when somebody
 * looked.
 */
function runOnSeed(plan: PrisonPlan, seed: number): SimulationRuntime {
  const runtime = buildPrison(plan, seed);
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
      const runtime = cachedRun({ ...WELL_RUN, guards });
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
    const runtime = cachedRun({ ...WELL_RUN, guards: 1 });
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
    const runtime = cachedRun({ ...BED_ONLY, guards: 1 });
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
    const runtime = cachedRun({ ...BED_ONLY, guards: 1 });

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
   * the eight people with no bed are no longer at a need deficit near 1, and
   * the **riots** the cases below are about stop. Measured over this file's own
   * 30,000 ticks with `amenities: true` and everything else as it stands, on
   * seed `0x0cc0` and on the 39 consecutive seeds after it:
   *
   * | | before ADR 0102 | after |
   * | --- | --- | --- |
   * | one guard | 4 riots (7,8,8,8) | **0 riots on 40 of 40 seeds** |
   * | two guards | 0 riots | 0 riots |
   *
   * **The assault half of those runs is a different kind of number and is
   * deliberately not in that table.** Assault counts are seed-dependent here in
   * a way riot counts are not: over the same 40 seeds the two-guard prison
   * opens assaults on 19 of them and none on the other 21, up to 10 in a run.
   * Seed `0x0cc0` -- this file's own -- is one of the quiet 21, which is why
   * the case at the end of this file can pin an empty incident log for it and
   * why that pin says nothing about prisons in general.
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
    const runtime = cachedRun({ ...OVERCROWDED, guards: 2 });
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
   * on the arrival tile with nowhere to sleep, eat or wash. Their needs decay
   * towards the floor, and the sector *mean* -- eight of them against eight who
   * hold a bed and a toilet -- stays under the line. That is the mean hiding
   * the individual, and it is the reading `flashpoint.ts` exists to add.
   *
   * This is the strongest single case in the file for ADR 0061, because it
   * needs no contraband at all: being unhoused is enough on its own.
   *
   * **The sector mean this paragraph used to name was never this prison's
   * number, and the correction that replaced it was wrong in the other
   * direction.** Both are recorded rather than overwritten, because the
   * sequence is the point.
   *
   * The figure was written by #484 at `5b99b869`, the commit that introduced
   * this case, and was never re-measured. Run at that commit, with the same
   * fixture, the same seed and the same `RUN_TICKS`, this prison reports
   * **0.5609** -- so the number did not describe it on the day it was
   * written. It then moved to **0.4895** at `19482be6` (#612), the commit that
   * made coverage provision `safety`, and stood there until `amenities` was
   * dropped from `OVERCROWDED` above; it reads **0.6456** now. All three are
   * under the 0.65 line, which is the only thing this case asserts about it.
   *
   * **A first pass at this correction asserted that the old figure was "the
   * number while `OVERCROWDED` still had amenities". That is also false** --
   * the contemporary number for that prison was 0.4895, measured at the merge
   * base -- and it is left standing here as what it was, because the failure
   * it illustrates is the one this file keeps having: a figure in prose that
   * no run ever produced, corrected by another figure from a run nobody
   * repeated.
   *
   * And "their six needs decay unopposed" was never quite true with two guards
   * on post: `SafetyCoverageSystem` provisions `safety` for every occupant a
   * sector's coverage covers and asks nothing about housing, so `safety` was
   * recovering for these eight all along -- which is the same mechanism
   * `19482be6` above landed, and the reason the mean fell then.
   */
  it('and the prisoners it never housed produce assaults the sector score cannot see', () => {
    const runtime = cachedRun({ ...OVERCROWDED, guards: 2 });

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
    // Well above the sector mean the same prison reports at the end of the
    // run, which is the point: this is one unhoused prisoner's own figure,
    // read at the tick their assault opened. The mean itself is asserted a few
    // lines up rather than restated here -- the figure that used to sit in
    // this comment was the one the docblock above records as never having
    // described this prison.
    expect(factors.get('need-deficit')).toBeGreaterThan(0.5);
  });
});

/**
 * **This describe was titled "past a point, staffing buys containment rather
 * than prevention", full stop, and that title is now narrowed rather than
 * kept.** It read as a law of the game and it has stopped being one: since
 * [ADR 0102](../../docs/adr/0102-what-a-prisoner-without-a-bed-may-still-do.md)
 * six guards DO buy prevention in an over-admitted prison that has built the
 * rooms. Measured over this file's own 30,000 ticks with `amenities: true`:
 * four times bed capacity opens **0** riots where it opened 3, eight times
 * opens 0 where it opened 4, and sixteen times opens 0 where it opened 5 --
 * on every seed tried (4, 8 and 8 seeds respectively).
 *
 * So the claim survives, on the condition its fixture already carried and its
 * title did not: **a prison that built nothing for the people it could not
 * house**. The alternative -- keeping the general title and letting the
 * fixture carry the condition silently -- is the shape of overclaim this file
 * exists to catch, and it would have been the second one in it.
 */
describe('past a point, staffing buys containment rather than prevention -- in a prison that built nothing', () => {
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
 * did to an over-admitted prison that had already built the rooms: the riots
 * stop wherever a guard is on post, and nowhere else.**
 *
 * This describe exists because the cases above had to change their fixtures to
 * survive that decision, and a fixture changed without the new behaviour being
 * written down anywhere is how a balance change disappears.
 *
 * ## The claim, in the narrowest form the runs support
 *
 * Build a canteen, a shower room and a yard, put **at least one guard on
 * post**, and an over-admitted prison stops rioting. Measured over this file's
 * own 30,000 ticks, `amenities: true` throughout, before ADR 0102 -> after:
 *
 * | prison | guards | riots before | riots after | seeds |
 * | --- | --- | --- | --- | --- |
 * | 8 cells, 16 prisoners | 1 (short 1) | 4 | **0** | 40 of 40 |
 * | 8 cells, 16 prisoners | 2 (covered) | 0 | 0 | 40 of 40 |
 * | 4 cells, 16 prisoners | 6 | 3 | **0** | 4 of 4 |
 * | 2 cells, 16 prisoners | 6 | 4 | **0** | 8 of 8 |
 * | 1 cell, 16 prisoners | 6 | 5 | **0** | 8 of 8 |
 * | 8 cells, 16 prisoners | **0** | 6 | **6** | 8 of 8 |
 *
 * The last row is the whole of the condition. A built prison with nobody
 * guarding it riots exactly as often as it did: its sector score falls from
 * 0.9759 to 0.7651 and stays above the 0.65 line, because a fully unguarded
 * sector contributes `staffingShortfallWeight` 0.3 on top of a need term that
 * ADR 0102 can push down to about 0.47 and no further. Its riots get *milder*
 * -- severities 9 become 7 and 8 -- and there are still six of them.
 *
 * ## What is NOT claimed, and was, and had to be withdrawn
 *
 * **An earlier version of this describe said this prison "produces nothing
 * whatsoever", and that it "contradicts, measurably" the clause about a built
 * prison and rioting in ADR 0102's Status -- the second bullet under the
 * acceptance, the one whose subject is that the cost is conditional. Both were
 * wrong, and they are recorded here rather than quietly deleted because they
 * are the same error twice.**
 *
 * - **"Produces nothing" is a property of seed `0x0cc0`.** Assault counts here
 *   are seed-dependent where riot counts are not: over 40 consecutive seeds
 *   the two-guard prison opens assaults on 19 of them, up to 10 in a run, and
 *   this file's own seed is one of the 21 quiet ones. The empty incident logs
 *   pinned below are therefore facts about `0x0cc0`, exactly like every other
 *   figure in this file, and the case titles now say so.
 * - **The contradiction was read off the wrong row of the ADR's own table.**
 *   That bullet distinguishes a *covered* sector from an *unguarded* one and
 *   prices them separately; the clause about rioting sits at the end of it,
 *   after the unguarded case. The unguarded case is the last row above, and it
 *   still riots six times -- so the document is right as written, and the
 *   earlier claim generalised over the very variable its sentence conditions
 *   on. The ADR's Cost table predicted this outcome to within a tenth.
 *
 * ## A THIRD WITHDRAWAL, IN THE SENTENCE THAT WAS ABOUT TO GO TO THE OWNER
 *
 * The paragraph that closed this docblock read, in full:
 *
 * > What is left is still worth the owner's attention and is still not a
 * > defect: an over-admitted prison that has built the rooms and hired **one**
 * > guard no longer riots, at any over-admission ratio tried up to sixteen
 * > times its bed capacity, and that is a route into the incident content
 * > narrowing.
 *
 * Its first clause is true, is unchanged, and is pinned by the two cases
 * above. Its last clause -- *"a route into the incident content narrowing"* --
 * is withdrawn. It was the balance question this branch was going to put to
 * the owner, and it does not survive the run nobody had made.
 *
 * **Forty seeds and eight seeds were forty and eight runs of one curve.** Every
 * sweep behind the finding varied the seed. On this fixture the seed does not
 * reach the score: measured over eight consecutive seeds from `0x0cc0`, the
 * sector score at tick 30,000 is **identical to four decimal places** on all
 * eight -- 0.6195 for 16 prisoners on one guard, 0.6722 for 17, 0.7208 for 24,
 * 0.6435 for 96 staffed to requirement -- and the riot count is identical with
 * it. Only the assault count moves (9 to 11 at 17 prisoners). A seed sweep was
 * therefore the one sweep that could not bound this claim.
 *
 * **Vary the population instead, and the riots come back one prisoner later.**
 * Same rooms, same one guard, same 30,000 ticks, seed `0x0cc0`; "before" is
 * this tree with `src/simulation/prisoners/action-system.ts` alone reverted to
 * `558ece5f`, which is ADR 0102's whole production change:
 *
 * | prisoners | guards | required | riots before | riots after | score after |
 * | --- | --- | --- | --- | --- | --- |
 * | 16 | 1 | 2 | 4 | **0** | 0.6195 |
 * | **17** | 1 | **3** | 5 | **1** | 0.6722 |
 * | 18 | 1 | 3 | 5 | 2 | 0.6972 |
 * | 20 | 1 | 3 | 5 | 3 | 0.7437 |
 * | 24 | 1 | 3 | 5 | 3 | 0.7208 |
 * | 32 | 1 | 4 | 5 | **5** | 0.8290 |
 * | 64 | 1 | 8 | 6 | **6** | 0.9852 |
 *
 * The 16-prisoner row sat 0.0305 under `hotThreshold`, and the seventeenth
 * prisoner costs 0.0527 of that -- 0.05 of it arithmetic rather than
 * behaviour, because `DEFAULT_SECTOR_PRISONERS_PER_GUARD` is 8 and a
 * seventeenth occupant takes `required` from 2 to 3, so one guard's
 * `staffingShortfall` goes 1/2 to 2/3 and its weighted contribution 0.15 to
 * 0.20. By 32 prisoners the riot count is the same before and after: at that
 * size ADR 0102 removes no incident at all.
 *
 * **Staffing to requirement moves the boundary rather than removing it.** With
 * `shortage: 0` throughout, so the score *is* `needsPressure`:
 *
 * | prisoners | guards | riots before | riots after | score after |
 * | --- | --- | --- | --- | --- |
 * | 16 | 2 | 0 | 0 | 0.2838 |
 * | 24 | 3 | 0 | 0 | 0.3630 |
 * | 32 | 4 | **3** | **0** | 0.4068 |
 * | 64 | 8 | 4 | 0 | 0.5816 |
 * | 80 | 10 | -- | 0 | 0.6363 |
 * | **96** | 12 | 5 | **3** | 0.6435 |
 * | 128 | 16 | 5 | 4 | 0.6596 |
 *
 * (Those scores are the sample standing at tick 30,000, not the run's peak, so
 * the 96-prisoner row reading under the line while it riots is the streak
 * having been reset by `resetStreak` rather than a contradiction. The riot
 * counts are what the rows are about.)
 *
 * **What is doing this is the ceiling on the rooms, and that is an
 * intervention rather than an inference.** Hold the population at 96 and the
 * staffing at requirement, change only the canteen and the shower room --
 * four `dining-table-wooden` in place of two and six `shower-head-brick` in
 * place of two, taking `'dining'` from 6 to 12 and `'hygiene'` from 2 to 6,
 * with `room.canteen`'s four authored benches still in it -- and the score
 * falls 0.6435 to **0.5158** and the riots go 3 to **0**. At 128 prisoners the
 * same rooms read 0.5801 and riot **0** where the small ones riot 4. What an
 * over-admitted prison contends for after ADR 0102 is
 * `concurrentUseCapacityByCapability` (`src/simulation/objects/room-capacity.ts`),
 * and a player who builds two more tables buys the headroom back.
 *
 * So the finding that stands is not that the incident content narrows. It is
 * that **ADR 0102 moves the population at which a built prison starts
 * rioting** -- by one prisoner where the prison is short a guard (16 to 17),
 * and by a factor of three where it is not (32 to 96) -- and that past that
 * population the riots are the same riots in the same numbers. The describe
 * below pins both ends of it.
 */
describe('an over-admitted prison that built the rooms stops rioting, if a guard is on post', () => {
  /** The `OVERCROWDED` prison above, with the canteen, shower room and yard it used to have. */
  const OVERCROWDED_WITH_AMENITIES = { cells: 8, toilets: true, amenities: true, prisoners: 16 } as const;
  /** Eight consecutive seeds starting at this file's own, so a claim that needs more than one seed can have them without a sweep. */
  const SEEDS = Array.from({ length: 8 }, (_unused, index) => SEED + index);

  it('has no riots at all on one guard, where it had four -- the pressure comes out as fights instead', () => {
    const runtime = run({ ...OVERCROWDED_WITH_AMENITIES, guards: 1 });

    // The prison is still over-admitted and still short a guard: neither the
    // coverage report nor the housing changed, only what the unhoused half of
    // the population can do about its needs.
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 2, assigned: 1, shortage: 1 },
    ]);
    expect(housedPrisoners(runtime)).toBe(8);

    // 4 riots (severities 7, 8, 8, 8) before ADR 0102 and none after, on all
    // 40 seeds measured. The assault half is the seed-dependent one and is
    // asserted only as "not none": this row opens assaults on every one of
    // those 40 seeds, 11 of them here, which is what the staffing shortfall
    // still buys an individual score over the line.
    expect(incidentsOfType(runtime, 'riot')).toEqual([]);
    expect(incidentsOfType(runtime, 'assault').length).toBeGreaterThan(0);
    expect(runtime.sectorRisk.getScore('security-sector.prison')).toBeLessThan(0.65);
  });

  it('opens nothing at all on this file’s own seed once it is staffed to requirement -- and that emptiness is the seed’s', () => {
    const runtime = run({ ...OVERCROWDED_WITH_AMENITIES, guards: 2 });

    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 2, assigned: 2, shortage: 0 },
    ]);
    // Non-vacuous: eight of the sixteen are still standing on the arrival tile
    // with no bed, exactly as they were when this prison produced ten
    // assaults on this same seed.
    expect(housedPrisoners(runtime)).toBe(8);
    expect(livingPrisoners(runtime)).toBe(16);

    // Pinned as the seed-level fact it is. On 19 of the 40 seeds measured this
    // log is *not* empty -- see the docblock -- so this line says "0x0cc0 is
    // quiet", never "this prison is quiet". The riot half of it is the general
    // claim, and it has its own case below.
    expect(runtime.incidents.all()).toEqual([]);
    // 0.4895 before ADR 0102, against a `hotThreshold` the sector never
    // reaches now.
    expect(runtime.sectorRisk.getScore('security-sector.prison')).toBeLessThan(0.35);
  });

  it('opens nothing on this file’s own seed at four times its bed capacity either, where it had three riots and ten assaults', () => {
    const runtime = run({ cells: 4, toilets: true, amenities: true, prisoners: 16, guards: 6 });

    expect(housedPrisoners(runtime)).toBe(4);
    expect(livingPrisoners(runtime)).toBe(16);
    expect(runtime.incidents.all()).toEqual([]);
    // 0.6513 before ADR 0102 -- over `hotThreshold` on the needs term alone,
    // which is what the describe above this one says no number of hires could
    // hold back. Twelve homeless prisoners with somewhere to eat, wash and
    // exercise now read 0.3462.
    expect(runtime.sectorRisk.getScore('security-sector.prison')).toBeLessThan(0.4);
  });

  /**
   * **The riot half, on eight seeds instead of one**, which is the only claim
   * in this file that a single seed could not carry: an empty riot list on
   * `0x0cc0` alone would not distinguish "the change stopped them" from "this
   * seed was quiet", and the assault counts beside it prove that distinction
   * is real here.
   *
   * Three over-admission ratios, because the describe above this one is about
   * a ratio past which staffing stops preventing anything: four, eight and
   * sixteen times bed capacity, all with six guards, all rioting before ADR
   * 0102 (3, 4 and 5 riots) and none of them rioting after.
   */
  it('stops rioting on every seed tried, at four, eight and sixteen times its bed capacity', () => {
    for (const cells of [4, 2, 1]) {
      for (const seed of SEEDS) {
        const runtime = runOnSeed({ cells, toilets: true, amenities: true, prisoners: 16, guards: 6 }, seed);
        expect(incidentsOfType(runtime, 'riot'), `cells ${String(cells)}, seed ${String(seed)}`).toEqual([]);
        // Non-vacuous on every iteration: the prison really is over-admitted,
        // and really is holding everybody it took.
        expect(housedPrisoners(runtime)).toBe(cells);
        expect(livingPrisoners(runtime)).toBe(16);
      }
    }
  }, 60_000);

  /**
   * **And the row that stops the claim being general**, which is also the row
   * that makes ADR 0102's own Status bullet true as written: take the guard
   * away and the built prison riots exactly as often as it did.
   *
   * `staffingShortfallWeight` is 0.3 and a sector with no guard at all carries
   * the whole of it, so the need term ADR 0102 pushes down to about 0.47 here
   * still scores 0.7651 against a 0.65 line. What the decision buys this
   * prison is milder riots -- severities 9 become 7 and 8 -- and nothing else.
   */
  it('still riots six times with no guard at all, exactly as often as before', () => {
    for (const seed of SEEDS) {
      const runtime = runOnSeed({ ...OVERCROWDED_WITH_AMENITIES, guards: 0 }, seed);
      const riots = incidentsOfType(runtime, 'riot');
      expect(riots.length, `seed ${String(seed)}`).toBe(6);
      expect(runtime.sectorRisk.getScore('security-sector.prison')).toBeGreaterThan(0.65);
      // The change is visible in the severities rather than the count: every
      // one of these was 9 before ADR 0102 except the first, and none of them
      // reaches 9 now.
      expect(riots.every((incident) => incident.severity <= 8)).toBe(true);
    }
  }, 60_000);
});

/**
 * **The population boundary of the describe above**, which is the assertion
 * that would have caught its withdrawn last clause and which no sweep in this
 * file could previously express: every over-admission ratio it tried was
 * reached by *removing cells*, so all of them held sixteen prisoners, and
 * sixteen is the last population at which that prison is quiet.
 *
 * Both cases are red on the tree ADR 0102 was cut from -- 5 riots rather than
 * 1 at seventeen prisoners, 5 rather than 3 at ninety-six -- so neither can
 * pass by being vacuous about a prison that never rioted.
 */
describe('and it starts rioting again one prisoner later, which is what bounds the finding above', () => {
  /** The same eight consecutive seeds the describe above uses, for the same reason and with the opposite result. */
  const SEEDS = Array.from({ length: 8 }, (_unused, index) => SEED + index);

  it('is quiet at sixteen prisoners and riots at seventeen, on every one of those seeds', () => {
    for (const seed of SEEDS) {
      const quiet = runOnSeed({ cells: 8, toilets: true, amenities: true, prisoners: 16, guards: 1 }, seed);
      expect(incidentsOfType(quiet, 'riot'), `16 prisoners, seed ${String(seed)}`).toEqual([]);
      // `DEFAULT_SECTOR_PRISONERS_PER_GUARD` is 8, so sixteen occupants ask for
      // two guards and this prison is short exactly one of them.
      expect(quiet.deploymentSystem.getCoverageReport(quiet.kernel.tick)).toEqual([
        { sectorId: 'security-sector.prison', required: 2, assigned: 1, shortage: 1 },
      ]);

      const loud = runOnSeed({ cells: 8, toilets: true, amenities: true, prisoners: 17, guards: 1 }, seed);
      // One more prisoner, one more required guard, and one riot where the
      // unmodified tree opens five. Not "some riots": the count is a property
      // of the change, and a sweep that found it seed-dependent would refute
      // the whole of the docblock above.
      expect(incidentsOfType(loud, 'riot').length, `17 prisoners, seed ${String(seed)}`).toBe(1);
      expect(loud.deploymentSystem.getCoverageReport(loud.kernel.tick)).toEqual([
        { sectorId: 'security-sector.prison', required: 3, assigned: 1, shortage: 2 },
      ]);
      // Non-vacuous both ways: the same eight beds, and everybody who was
      // admitted is still alive to want one.
      expect(housedPrisoners(quiet)).toBe(8);
      expect(livingPrisoners(quiet)).toBe(16);
      expect(housedPrisoners(loud)).toBe(8);
      expect(livingPrisoners(loud)).toBe(17);
    }
  }, 60_000);

  it('riots at ninety-six prisoners with a guard for every eight of them, and stops again when the canteen and the shower room are built for that many', () => {
    const STAFFED_96 = { cells: 8, toilets: true, amenities: true, prisoners: 96, guards: 12 } as const;

    const crowded = run(STAFFED_96);
    expect(crowded.deploymentSystem.getCoverageReport(crowded.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 12, assigned: 12, shortage: 0 },
    ]);
    // Fully staffed, so `staffingShortfall` contributes nothing and this is the
    // needs term alone reaching `hotThreshold`: ninety-six prisoners against a
    // `'dining'` ceiling of six and a `'hygiene'` ceiling of two.
    expect(incidentsOfType(crowded, 'riot').length).toBe(3);

    // The same prison, the same population, the same twelve guards, and still
    // a canteen built to `room.canteen`'s authored requirements: four tables
    // and four benches instead of two and four, six shower heads instead of
    // two. `'dining'` goes 6 to 12 and `'hygiene'` 2 to 6, and nothing else
    // about this prison moves.
    const provisioned = run({ ...STAFFED_96, tables: 4, benches: 4, showerHeads: 6 });
    expect(incidentsOfType(provisioned, 'riot')).toEqual([]);
    expect(provisioned.sectorRisk.getScore('security-sector.prison')).toBeLessThan(0.55);

    // Non-vacuous: both prisons are the same eight beds and the same
    // ninety-six people, and the second is not quiet because it lost anybody.
    expect(housedPrisoners(crowded)).toBe(8);
    expect(livingPrisoners(crowded)).toBe(96);
    expect(housedPrisoners(provisioned)).toBe(8);
    expect(livingPrisoners(provisioned)).toBe(96);
  }, 60_000);
});
