import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand } from '../../src/simulation/protocol/commands';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What a prisoner brings with them, drawn by the worker and played through
 * the real kernel**
 * ([ADR 0124](../../docs/adr/0124-what-a-prisoner-brings-with-them.md),
 * [#540](https://github.com/woogitsu/lockstate/issues/540)).
 *
 * Two halves.
 *
 * - **The mechanism.** An admission that omits `priorIncidents` is drawn for,
 *   once, from `prisoners.priors`. An explicit count is never redrawn. The
 *   "not drawn yet" sentinel survives a save taken inside the pending window.
 *   `src/main.ts` sends no count.
 * - **The balance.** The three prisons ADR 0124 §6 measured, over the same
 *   twelve seeds. The admissions are made here exactly as the interface makes
 *   them, with no sentence and no count. That settles the ADR's own weakest
 *   claim, *"that §6's numbers are what an implementation of §4 would
 *   produce"*. §6 was measured by a probe that drew both values itself and
 *   sent them explicitly. Every figure below was read off a run of the real
 *   draw, and **every one equals §6's Option A row**.
 *
 * **The weights 60/30/10 are written out below as literals, never read from
 * `PRIOR_INCIDENT_WEIGHTS_PERCENT`**, so a change to the table has to come
 * past this file. That is the discipline `save-rng-stream-compatibility.test.ts`
 * uses for stream words.
 */

const DAY = 2_400;
const ARRIVAL = { x: 16, y: 16 } as const;
const PRIORS_STREAM = 'prisoners.priors';

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function wordsOf(runtime: SimulationRuntime, name: string): readonly number[] {
  const entry = runtime.kernel.rng.snapshot().find((stream) => stream.name === name);
  if (entry === undefined) throw new Error(`no stream ${name}`);
  return entry.state.words;
}

/** One-bed cells, nothing else: the cheapest prison that admits, for the mechanism cases. */
function cellPrison(seed: number, cells: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  const rects = Array.from({ length: cells }, (_unused, index) => ({ x: 1 + index * 3, y: 1, width: 2, height: 3 }));
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: cells }));
  for (const rect of rects) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  rects.forEach((rect, index) => submit(runtime, `zone-c${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  rects.forEach((rect, index) =>
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y })),
  );
  stepTo(runtime, 1_000);
  return runtime;
}

describe('the prior-incident draw (ADR 0124 §4)', () => {
  it('draws once per omitted count, from its own stream, with exactly one nextInt(100) each', () => {
    const seed = 0x0540;
    const runtime = cellPrison(seed, 8);
    for (let index = 0; index < 8; index += 1) submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ARRIVAL }));

    // Before any intake stage has run, every slot holds the sentinel, and the
    // stream is exactly where session creation put it.
    const records = runtime.prisoners.records;
    expect(Array.from(records.priorIncidentsAtIntake.slice(0, 8))).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
    expect(wordsOf(runtime, PRIORS_STREAM)).toEqual(deriveXoshiroState(seed, PRIORS_STREAM).words);

    stepTo(runtime, 1_200);

    // An independent replay of the stream: the same derived state, one
    // nextInt(100) per arrival in ascending entity id, and the ruled weights
    // written out as literals. The worker must agree on every value and end
    // on the same stream state.
    const replay = new Xoshiro128StarStar(deriveXoshiroState(seed, PRIORS_STREAM).words);
    const expected = Array.from({ length: 8 }, () => {
      const roll = replay.nextInt(100);
      return roll < 60 ? 0 : roll < 90 ? 1 : 2;
    });
    expect(Array.from(records.priorIncidentsAtIntake.slice(0, 8))).toEqual(expected);
    expect(wordsOf(runtime, PRIORS_STREAM)).toEqual(replay.snapshot().words);
  });

  it('uses an explicit count exactly as given and never draws for it', () => {
    const seed = 0x0541;
    const runtime = cellPrison(seed, 4);
    for (const priorIncidents of [0, 1, 2, 255]) {
      submit(runtime, `admit-${String(priorIncidents)}`, packCommand({ type: 'AdmitPrisoner', priorIncidents, ...ARRIVAL }));
    }
    stepTo(runtime, 1_200);

    // 255 is stored as 254 so the sentinel means only "not drawn yet"
    // (§4.4). Both readers saturate at 2, so the tier it scores is the tier
    // 255 always scored.
    expect(Array.from(runtime.prisoners.records.priorIncidentsAtIntake.slice(0, 4))).toEqual([0, 1, 2, 254]);
    expect(wordsOf(runtime, PRIORS_STREAM), 'an explicit count must not advance prisoners.priors').toEqual(
      deriveXoshiroState(seed, PRIORS_STREAM).words,
    );
  });

  it('restores a save taken inside the pending window to the same draw and the same tier', () => {
    const seed = 0x0542;
    const live = cellPrison(seed, 8);
    for (let index = 0; index < 8; index += 1) submit(live, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ARRIVAL }));
    // Still before the classification stage for every arrival: the sentinel
    // is what the save carries.
    expect(Array.from(live.prisoners.records.priorIncidentsAtIntake.slice(0, 8)).every((value) => value === 255)).toBe(true);

    const bundle = captureSessionSnapshot(live);
    const envelope = createSaveEnvelope({
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'prior-incidents-pending-window',
      revision: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, seed).runtime;

    stepTo(live, 1_200);
    stepTo(restored, 1_200);
    const read = (runtime: SimulationRuntime) => ({
      priors: Array.from(runtime.prisoners.records.priorIncidentsAtIntake.slice(0, 8)),
      tiers: Array.from(runtime.prisoners.records.riskTier.slice(0, 8)),
      stream: wordsOf(runtime, PRIORS_STREAM),
    });
    expect(read(restored)).toEqual(read(live));
    expect(read(live).priors.every((value) => value <= 2)).toBe(true);
  });

  it('is not sent by the main thread: src/main.ts builds AdmitPrisoner with no count', () => {
    // The composition root cannot draw reproducibly (the seed lives in the
    // worker), so the only correct thing for it to send is nothing. Read off
    // the source rather than trusted, because a `priorIncidents: 0` put back
    // there would turn every draw below off and leave this file's other cases
    // green.
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).not.toMatch(/^\s*priorIncidents\s*:/m);
    expect(main).not.toMatch(/const ADMISSION_REQUEST\b/);
  });
});

// ---- The balance, ADR 0124 §6, with the real draw -------------------------

const CELL_COUNT = 8;
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
const CANTEEN = { x: 19, y: 6, width: 6, height: 6 } as const;
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;
const SEEDS = Array.from({ length: 12 }, (_unused, index) => 0x0cc0 + index);

/**
 * ADR 0124 §6's prisons, built from player commands only. W and C are
 * `scripts/report-well-tended-prison-gang-reachability.ts`'s furnished prison.
 * N is `gang-retaliation-from-the-admission-surface.test.ts`'s bed-only prison.
 * Each admission is the interface's own: no sentence, no count.
 */
function balancePrison(seed: number, shape: 'W' | 'C' | 'N'): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  const cells = Array.from({ length: CELL_COUNT }, (_unused, index) => ({ x: 1 + index * 3, y: 1, width: 2, height: 3 }));
  if (shape === 'N') {
    submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: CELL_COUNT }));
    for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    cells.forEach((rect, i) => submit(runtime, `zone-c${String(i)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
    cells.forEach((rect, i) => submit(runtime, `bed${String(i)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(i)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y })));
  } else {
    submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: CELL_COUNT + 6 + 8 }));
    submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: CELL_COUNT + 2 }));
    for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    for (const rect of [SHOWER, CANTEEN, YARD]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    cells.forEach((rect, i) => submit(runtime, `zone-c${String(i)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
    submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
    submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));
    submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...YARD }));
    cells.forEach((rect, i) => {
      submit(runtime, `bed${String(i)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(i)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
      submit(runtime, `wc${String(i)}`, packCommand({ type: 'PlaceObject', orderId: `wc${String(i)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
    });
    submit(runtime, 'sh1', packCommand({ type: 'PlaceObject', orderId: 'sh1', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
    submit(runtime, 'sh2', packCommand({ type: 'PlaceObject', orderId: 'sh2', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
    submit(runtime, 'dt1', packCommand({ type: 'PlaceObject', orderId: 'dt1', definitionId: 'dining-table-wooden', x: CANTEEN.x, y: CANTEEN.y }));
    submit(runtime, 'dt2', packCommand({ type: 'PlaceObject', orderId: 'dt2', definitionId: 'dining-table-wooden', x: CANTEEN.x + 3, y: CANTEEN.y }));
    for (let i = 0; i < 4; i += 1) {
      submit(runtime, `bench${String(i)}`, packCommand({ type: 'PlaceObject', orderId: `bench${String(i)}`, definitionId: 'bench-wooden', x: CANTEEN.x + (i % 2) * 2, y: CANTEEN.y + 2 + Math.floor(i / 2) }));
    }
  }
  stepTo(runtime, 1_000);
  submit(runtime, 'hire0', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  const prisoners = shape === 'C' ? 16 : 8;
  for (let i = 0; i < prisoners; i += 1) submit(runtime, `admit${String(i)}`, packCommand({ type: 'AdmitPrisoner', ...ARRIVAL }));
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

interface Totals {
  priors: number[];
  intakeTiers: number[];
  dayOneTiers: number[];
  membersAtIntake: number;
  /** riots / assaults / escape attempts / gang retaliations, summed over the seeds. */
  incidents: Record<number, number[]>;
  membersAt: Record<number, number>;
  retaliatingSeeds: Record<number, number>;
  earlyWarnings: Record<number, number>;
}

function alive(runtime: SimulationRuntime): number[] {
  const store = runtime.prisoners.entityStore;
  const out: number[] = [];
  for (let index = 0; index <= store.maxActiveIndex; index += 1) if (store.isIndexAlive(index)) out.push(index);
  return out;
}

function members(runtime: SimulationRuntime): number {
  return runtime.gangs.all().reduce((sum, gang) => sum + runtime.gangs.membersOf(gang.id).length, 0);
}

function measure(shape: 'W' | 'C' | 'N', days: readonly number[]): Totals {
  const totals: Totals = { priors: [0, 0, 0], intakeTiers: [0, 0, 0, 0], dayOneTiers: [0, 0, 0, 0], membersAtIntake: 0, incidents: {}, membersAt: {}, retaliatingSeeds: {}, earlyWarnings: {} };
  for (const day of days) {
    totals.incidents[day] = [0, 0, 0, 0];
    totals.membersAt[day] = 0;
    totals.retaliatingSeeds[day] = 0;
    totals.earlyWarnings[day] = 0;
  }
  for (const seed of SEEDS) {
    const runtime = balancePrison(seed, shape);
    const records = runtime.prisoners.records;
    stepTo(runtime, 1_200);
    for (const index of alive(runtime)) {
      totals.priors[records.priorIncidentsAtIntake[index]!]! += 1;
      totals.intakeTiers[records.riskTier[index]!]! += 1;
    }
    totals.membersAtIntake += members(runtime);
    stepTo(runtime, 2_401);
    for (const index of alive(runtime)) totals.dayOneTiers[records.riskTier[index]!]! += 1;
    for (const day of days) {
      stepTo(runtime, 1_000 + day * DAY);
      const incidents = runtime.incidents.all();
      const count = (type: string) => incidents.filter((incident) => incident.type === type).length;
      const row = [count('riot'), count('assault'), count('escape-attempt'), count('gang-retaliation')];
      row.forEach((value, index) => (totals.incidents[day]![index]! += value));
      totals.membersAt[day]! += members(runtime);
      if (row[3]! > 0) totals.retaliatingSeeds[day]! += 1;
      totals.earlyWarnings[day]! += runtime.prisoners.classificationEarlyWarningSystem.getMetrics().warningsIssued;
    }
  }
  return totals;
}

describe('the balance ADR 0124 §6 priced, reproduced with the real draw', () => {
  /*
   * **Long, and the budget says so.** Twelve prisons for thirty in-game days
   * each is about 7 s on an idle container. CI's self-hosted runners have been
   * measured at roughly four times that under load, which is why these carry
   * minutes rather than the 5 s default, as the neighbouring season-length
   * files do.
   */
  it('the well-run prison: tier 3 at the gate, gang members at intake, and no incident in thirty days', () => {
    const totals = measure('W', [10, 30]);
    expect(totals.priors).toEqual([53, 32, 11]);
    expect(totals.intakeTiers).toEqual([37, 38, 16, 5]); // today: 59/32/5/0
    // §4.6's day-one early warning: 16 at Medium become 22, and nobody earned
    // it in this prison. Ruled acceptable on 2026-09-23 ("Tak, od pierwszego
    // dnia").
    expect(totals.dayOneTiers).toEqual([31, 38, 22, 5]); // today: 57/34/5/0
    expect(totals.membersAtIntake).toBe(5); // today: 0
    expect(totals.incidents[10]).toEqual([0, 0, 0, 0]);
    expect(totals.incidents[30]).toEqual([0, 0, 0, 0]);
    expect(totals.membersAt[30]).toBe(5);
    expect(totals.earlyWarnings[30]).toBe(12); // today: 2
  }, 300_000);

  it('the crowded prison: fewer riots, more assaults, and escape attempts inside the review floor', () => {
    const totals = measure('C', [10]);
    expect(totals.priors).toEqual([110, 62, 20]);
    expect(totals.intakeTiers).toEqual([85, 65, 31, 11]); // today: 118/63/11/0
    expect(totals.membersAtIntake).toBe(11);
    // Riots 48 -> 41 and assaults 72 -> 79 over ten days. The mechanism is
    // ADR 0124 §8's second-weakest claim and is not established here.
    expect(totals.incidents[10]).toEqual([41, 79, 3, 0]); // today: 48/72/0/0
  }, 300_000);

  it('the neglected prison: assaults nearly triple and three seeds in twelve retaliate within thirty days', () => {
    const totals = measure('N', [10, 30]);
    expect(totals.intakeTiers).toEqual([37, 38, 16, 5]);
    expect(totals.incidents[10]).toEqual([0, 21, 0, 0]); // today: 0/10/0/0
    expect(totals.incidents[30]).toEqual([0, 89, 0, 3]); // today: 0/30/0/0
    expect(totals.retaliatingSeeds[30]).toBe(3); // today: 0
    expect(totals.membersAt[30]).toBe(12); // today: 4
  }, 300_000);
});
