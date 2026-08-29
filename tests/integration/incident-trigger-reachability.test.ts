import { describe, expect, it } from 'vitest';
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
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
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

const WELL_RUN = { cells: 8, toilets: true, amenities: true, prisoners: 8, guards: 1 } as const;

describe('a prison that meets its prisoners’ needs does not riot, however it is staffed', () => {
  it('stays clear for twelve in-game days with one guard, and again with none', () => {
    // The most important case in the file, and the one a producer is easiest to
    // get wrong: a trigger that fires here would make every prison riot and the
    // incident chip would be permanently red.
    for (const guards of [1, 0]) {
      const runtime = run({ ...WELL_RUN, guards });
      expect(runtime.incidents.all(), `guards: ${String(guards)}`).toEqual([]);
      expect(runtime.incidentTriggerSystem.getMetrics().riotsTriggered).toBe(0);
    }
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
    const riots = runtime.incidents.all();
    expect(riots.length).toBeGreaterThan(0);
    expect(riots[0]!.type).toBe('riot');
    expect(riots[0]!.causeFactors.find((factor) => factor.kind === 'staffing-shortfall')?.value).toBe(1);
  });

  it('does not, once a single guard is hired — which is the whole of the difference', () => {
    const runtime = run({ ...BED_ONLY, guards: 1 });
    expect(runtime.incidents.all()).toEqual([]);
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 1, assigned: 1, shortage: 0 },
    ]);
  });
});

describe('a prison outgrows its staffing, and the coverage report says so before the riot does', () => {
  /** Sixteen prisoners for eight beds: half the population is left at `accommodation-assignment` with nothing to restore any need. */
  const OVERCROWDED = { cells: 8, toilets: true, amenities: true, prisoners: 16 } as const;

  it('asks for a second guard at sixteen prisoners, and riots while it has one', () => {
    const runtime = run({ ...OVERCROWDED, guards: 1 });

    // The requirement moved because the population did: sixteen against
    // `DEFAULT_SECTOR_PRISONERS_PER_GUARD`'s eight. Before ADR 0048 this read
    // `required: 1, shortage: 0` at any population.
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 2, assigned: 1, shortage: 1 },
    ]);
    expect(runtime.incidents.all().length).toBeGreaterThan(0);
  });

  it('stays clear once the second guard is hired, without a single cell being built', () => {
    const runtime = run({ ...OVERCROWDED, guards: 2 });
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 2, assigned: 2, shortage: 0 },
    ]);
    expect(runtime.incidents.all()).toEqual([]);
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
    const runtime = run({ cells: 4, toilets: true, amenities: true, prisoners: 16, guards: 6 });

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

    const startTicks = runtime.incidents.all().map((incident) => incident.startedAtTick);
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
