import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { STATE_INCOME_UNMET_NEED_LEVEL, stateIncomeForCompletedDay } from '../../src/simulation/economy/income';
import { packCommand } from '../../src/simulation/protocol/commands';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud';
import { projectStatusMetrics } from '../../src/ui/hud/projection';
import { reportedCounts } from '../helpers/hud-counts';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Crowding makes the existing withhold bite** -- issue #586, under the
 * owner's ruling recorded on that issue on 2026-08-29: *"Do not add a new
 * overcrowding tax. The 40-withhold IS the tax. Give it something to read."*
 *
 * ## The prison, and what it measured before the term existed
 *
 * Twelve single cells, each with a bed and a toilet; a shower room with two
 * heads, a canteen and a yard; guards staffed to requirement
 * (`DEFAULT_SECTOR_PRISONERS_PER_GUARD` is 8, so two guards up to sixteen
 * prisoners and three up to twenty-four). The only thing varied is how many
 * prisoners are admitted into it. Measured on the tree before #586 over ten
 * in-game days, state income earned in total:
 *
 * | admitted | occupancy | before #586 | after |
 * | --- | --- | --- | --- |
 * | 12 | 100% | 35,960 | 35,960 |
 * | 14 | 117% | 35,840 | 35,920 |
 * | 15 | 125% | 35,760 | **32,960** |
 * | 18 | 150% | 35,560 | **31,240** |
 *
 * Before, a prison holding half as many again as it had beds earned 99% of
 * what the full one earned -- the extra prisoners are paid nothing (the income
 * line walks occupied places), and they cost nothing either. That is the
 * *"nothing punishes overcrowding"* the brief behind #586 recorded. After,
 * 125% and 150% pay the `safety` 40 on every housed prisoner from the day
 * their `safety` crosses the line, and 117% still costs nothing: full
 * coverage keeps pace with the extra decay up to 115%
 * (`CROWDING_EXTRA_DECAY_SCALED_PER_TICK_AT_CAP`'s docblock has the table).
 * The 117% row moving *up* by 80 is two fewer 40s withheld across the ten
 * days, and this file neither asserts it nor claims to know which need or
 * which prisoner they were: only the totals were measured.
 *
 * ## Watched failing (`docs/AGENT_WORKFLOW.md` §3)
 *
 * Two mutations of `src/simulation/prisoners/crowding.ts`, run by hand with
 * this file untouched:
 *
 * 1. `CROWDING_EXTRA_DECAY_SCALED_PER_TICK_AT_CAP` set to `{}` -- the term
 *    switched off. `5 failed | 1 passed`: only the control survives; the 125%
 *    and 150% cases fail on their income (`3600, 3600, 3520, 3520, ...` --
 *    the tree before #586, to the day), and the three that read the strip
 *    fail on the missing condition.
 * 2. `isCrowdingAcceleratingDecay` made to answer `false` -- the rate kept,
 *    the readout lost. `4 failed | 2 passed`: every case that reads
 *    `'prisoners.overcrowded'` fails, and the two that only read income pass,
 *    which is the split that shows the strip is asserted separately from the
 *    arithmetic behind it.
 */

const SEED = 0x586;
const DAY = 2_400;
const START = 1_000;
const CELL_COUNT = 12;
const ARRIVAL = { x: 16, y: 16 } as const;
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
const CANTEEN = { x: 19, y: 6, width: 6, height: 6 } as const;
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

function cellRect(index: number) {
  return index < 6 ? { x: 1 + index * 3, y: 1, width: 2, height: 3 } : { x: 1 + (index - 6) * 3, y: 14, width: 2, height: 3 };
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** The last tick of in-game day `day` (1-based, counted from the day admissions land in). */
function endOfDay(day: number): number {
  return (Math.floor(START / DAY) + day) * DAY - 1;
}

function prison(prisoners: number, guards: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: CELL_COUNT }, (_unused, index) => cellRect(index));
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: CELL_COUNT + 14 }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: CELL_COUNT + 2 }));
  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  for (const rect of [SHOWER, CANTEEN, YARD]) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  cells.forEach((rect, index) => submit(runtime, `zone-c${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
  submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));
  submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...YARD }));
  cells.forEach((rect, index) => {
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    submit(runtime, `wc${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `wc${String(index)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });
  submit(runtime, 'sh0', packCommand({ type: 'PlaceObject', orderId: 'sh0', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
  submit(runtime, 'sh1', packCommand({ type: 'PlaceObject', orderId: 'sh1', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
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
  stepTo(runtime, START);
  for (let guard = 0; guard < guards; guard += 1) {
    submit(runtime, `hire${String(guard)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  }
  for (let index = 0; index < prisoners; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }
  if (runtime.refusals.count !== 0) throw new Error(`the fixture refused ${String(runtime.refusals.count)} commands`);
  return runtime;
}

/** State income for each of `days` in-game days, read at each day's last tick. */
function dailyIncome(runtime: SimulationRuntime, days: number): number[] {
  const income: number[] = [];
  for (let day = 1; day <= days; day += 1) {
    stepTo(runtime, endOfDay(day));
    income.push(stateIncomeForCompletedDay(runtime.prisoners));
  }
  return income;
}

/** How many prisoners holding a place have `need` at or below the unmet line. */
function housedUnmet(runtime: SimulationRuntime, need: 'safety' | 'hygiene'): number {
  let unmet = 0;
  for (const entityId of runtime.prisoners.roomInstances.residentIdsWithExistingPlace()) {
    const index = runtime.prisoners.entityStore.getIndex(entityId);
    if (runtime.prisoners.needs.get(index, need) <= STATE_INCOME_UNMET_NEED_LEVEL) unmet += 1;
  }
  return unmet;
}

function publication(runtime: SimulationRuntime): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-under-test',
    kind: 'simulation/status-counts',
    payload: {
      tick: runtime.kernel.tick,
      schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
      counts: projectStatusCounts(runtime, runtime.kernel.tick),
    },
  } as WorkerToMainMessage;
}

function coverageChip(runtime: SimulationRuntime) {
  const chip = projectStatusMetrics(reportedCounts(publication(runtime))).find((descriptor) => descriptor.id === 'coverage');
  if (chip === undefined) throw new Error('no coverage chip on the strip');
  return chip;
}

describe('a prison over its beds pays for it through the withhold it already has (#586)', () => {
  // Titled "... and reads Covered" until ADR 0095 decision 1 (2026-09-23):
  // staffed to the requirement means nobody is free, which is the reserve
  // rung now. The control's subject is unchanged -- no crowding word -- and
  // it is asserted as the staffing rung this prison is on.
  it('control: a full prison, staffed to requirement, pays the whole grant on every day and reads its staffing rung, not crowding', () => {
    const runtime = prison(12, 2);
    const income = dailyIncome(runtime, 10);
    expect(housedUnmet(runtime, 'safety')).toBe(0);
    expect(income.every((day) => day >= 3_560), `income ${income.join(', ')}`).toBe(true);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).conditions).not.toContain('prisoners.overcrowded');
    expect(coverageChip(runtime).badge?.textKey).toBe(HUD_MESSAGE_KEY.securityCoverageReserveShort);
  });

  it('carries 117% of its beds at no cost to safety, because full coverage keeps pace with the extra decay', () => {
    const runtime = prison(14, 2);
    dailyIncome(runtime, 10);
    expect(housedUnmet(runtime, 'safety')).toBe(0);
    // The term *is* running -- 16.6% over is 6 extra stored units a tick,
    // exactly what a covered sector's provision out-runs the base decay by --
    // so the strip says so even though no level is moving. See the hint's
    // docblock: the sentence is about the rate, not the level.
    expect(projectStatusCounts(runtime, runtime.kernel.tick).conditions).toContain('prisoners.overcrowded');
  });

  it('at 125% of its beds, fully staffed, pays the safety 40 on every housed prisoner from the fifth day', () => {
    const runtime = prison(15, 2);
    const income = dailyIncome(runtime, 10);

    // Staffed to requirement throughout: nobody is on a lower rung, so the
    // ladder is not what is costing this prison anything.
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    expect(counts.prisonersUnderstaffed + counts.prisonersUnguarded).toBe(0);

    // Days one to four whole or nearly, and from day five every one of the
    // twelve paid places short of the `safety` 40: 12 x (300 - 40) = 3,120.
    // 10,200 ticks from full at 125% (`crowding.ts`'s table), and admission
    // lands at tick 1,000 -- so the line is crossed in day five.
    expect(income.slice(0, 4).every((day) => day >= 3_560), `income ${income.join(', ')}`).toBe(true);
    expect(income.slice(4).every((day) => day <= 3_120), `income ${income.join(', ')}`).toBe(true);
    expect(housedUnmet(runtime, 'safety')).toBe(12);
    expect(income.reduce((sum, day) => sum + day, 0)).toBe(32_960);
  });

  it('at 150% pays it from the second day, and the strip names crowding where it would have said Covered', () => {
    const runtime = prison(18, 3);
    const income = dailyIncome(runtime, 10);

    expect(income[0]).toBe(3_600);
    expect(income.slice(1).every((day) => day <= 3_120), `income ${income.join(', ')}`).toBe(true);
    expect(housedUnmet(runtime, 'safety')).toBe(12);

    // **The attribution the ruling requires.** Every prisoner is on the top
    // rung -- the ladder alone would say "Covered" -- and the chip says
    // "Overcrowded" instead, with the sentence that says why.
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    expect(counts.prisonersCovered).toBe(18);
    expect(counts.conditions).toContain('prisoners.overcrowded');
    const chip = coverageChip(runtime);
    expect(chip.badge).toEqual({ tone: 'warning', textKey: HUD_MESSAGE_KEY.securityCoverageOvercrowded });
    expect(chip.description).toEqual({ textKey: HUD_MESSAGE_KEY.securityCoverageOvercrowdedHint });
  });

  it('keeps the staffing word on a lower rung, and says crowding there only through the prisoners chip', () => {
    // 150% on one guard: understaffed and crowded at once. The rung that a
    // hire answers keeps its word; the description stays silent rather than
    // saying the crowding half only in a tooltip (`HudMetricDescriptor.description`).
    const runtime = prison(18, 1);
    stepTo(runtime, endOfDay(1));
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    expect(counts.conditions).toContain('prisoners.overcrowded');
    const chip = coverageChip(runtime);
    expect(chip.badge?.textKey).toBe(HUD_MESSAGE_KEY.securityCoverageShort);
    expect(chip.description).toBeUndefined();
    const prisonersChip = projectStatusMetrics(reportedCounts(publication(runtime))).find((descriptor) => descriptor.id === 'prisoners');
    expect(prisonersChip?.tone, 'the chip whose bar is past capacity is the one that is red').toBe('danger');
  });
});

describe('crowding is derived, so a save carries nothing new and a restore decays identically (#586)', () => {
  it('lands a restored crowded prison on the same safety levels as the one that never stopped, and says it is crowded before a tick runs', () => {
    const continuous = prison(18, 3);
    const saved = prison(18, 3);
    const saveAt = endOfDay(2) - 7;
    stepTo(saved, saveAt);

    const bundle = captureSessionSnapshot(saved);
    const envelope = createSaveEnvelope({
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'crowding-prison',
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
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;

    // Published before a tick runs, exactly as a paused restored session does.
    expect(projectStatusCounts(restored, restored.kernel.tick).conditions).toContain('prisoners.overcrowded');

    const until = endOfDay(3);
    stepTo(continuous, until);
    stepTo(restored, until);
    // `safety` is the need this term moves most and the one no action
    // restores, so it is the clean read of the crowding term across a save:
    // decay, crowding and coverage provision only.
    expect(Array.from(restored.prisoners.needs.levels.safety)).toEqual(Array.from(continuous.prisoners.needs.levels.safety));
    /*
     * **`hygiene` is not compared, and the reason is a finding about `main`
     * rather than about this term.** The same round trip on the tree before
     * #586 -- this fixture with twelve prisoners, no crowding at all -- lands
     * the restored prison's `hygiene` on different levels from the continuous
     * one's by the end of the next day, measured 2026-09-23 on `ceb6865e`: the
     * shower cycle does not resume identically across this save point. That is
     * outside what this file may assert about crowding, so it is reported
     * rather than pinned here, and `safety` above carries the claim.
     */
  });
});
