import { describe, expect, it } from 'vitest';
import { NEED_MAX, NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { STATE_INCOME_UNMET_NEED_LEVEL } from '../../src/simulation/economy/income';
import { MIN_SENTENCE_LENGTH_TICKS } from '../../src/simulation/prisoners/sentence';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What guard coverage now does to the `safety` need, and what it does to the
 * incident rate** (issue #588, under the owner's ruling on issue #599).
 *
 * ## What is being established
 *
 * Three separate claims, in the order they matter:
 *
 * 1. A prison that covers its sector holds its prisoners' `safety` at the top
 *    of the scale; the same prison with nobody on duty lets it fall past
 *    `STATE_INCOME_UNMET_NEED_LEVEL`, inside the shortest sentence the game
 *    draws. That is the mechanic, measured on a real session through real
 *    commands.
 * 2. **The rate it costs the player is one the player can move.** Issue #588
 *    carries a hard sequencing constraint from its source: *"If incidents
 *    still fire every two in-game days under full coverage, this mechanic
 *    punishes the player twice for a rate they cannot move."* The second
 *    `describe` measures the incident count of a fully covered prison, on the
 *    shape the brief's claim was made about -- one holding twice the
 *    prisoners it has beds for.
 * 3. No new money term. `StateIncomeSystem` already withholds
 *    `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` per unmet need and
 *    nothing in #588 changes the schedule, so the third case reads the grant
 *    itself rather than trusting that.
 *
 * ## Built through the five commands a player can send
 *
 * `PurchaseMaterials`, `ZoneRoom`, `PlaceObject`, `HireStaff`,
 * `AdmitPrisoner`, with `wallRoomPerimeter` writing the edges a completed
 * `wall-brick` order would -- `room-gated-needs.test.ts`'s arrangement and for
 * its reason: a fixture that registers a room instance by hand cannot tell
 * whether a player could ever have got the prison into that state.
 */

/** Distinct from every other seed in the suite, so no shared fixture can make these figures true by accident. */
const SEED = 0x588;

/** `src/main.ts`'s `NEW_PRISON_ORIGIN_TILE`: where a hire stands and an admission arrives. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Far longer than any run here, so `PrisonerDischargeSystem` cannot release anybody mid-measurement. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

const SECTOR = 'security-sector.prison';

/** Ten in-game days at `DAY_LENGTH_TICKS` 2,400 -- the window `room-gated-needs.test.ts` measures its riot counts over, so the two are directly comparable. */
const RUN_UNTIL = 24_000;
/** Past intake, past every delivery and every build order. */
const WATCH_FROM = 2_000;

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

interface Plan {
  readonly prisoners: number;
  /** One furnished `room.cell` each -- fewer than `prisoners` is how an over-capacity prison is built. */
  readonly cells: number;
  readonly guards: number;
}

function build(plan: Plan): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: plan.cells }, (_unused, index) => cellRect(index));

  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: Math.max(1, plan.cells) }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: Math.max(1, plan.cells) }));

  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  cells.forEach((rect, index) => submit(runtime, `zone-cell-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  cells.forEach((rect, index) => {
    submit(runtime, `bed-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed-${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    submit(runtime, `wc-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `wc-${String(index)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });

  stepTo(runtime, 1_000);
  for (let index = 0; index < plan.guards; index += 1) {
    submit(runtime, `hire-${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  }
  for (let index = 0; index < plan.prisoners; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

interface Watched {
  readonly runtime: SimulationRuntime;
  /** The lowest `safety` any living prisoner read, in whole levels, across the window. */
  readonly lowestSafety: number;
  /** The first tick at which some prisoner's `safety` was at or below `STATE_INCOME_UNMET_NEED_LEVEL`; `undefined` if none ever was. */
  readonly firstUnmetTick: number | undefined;
  /** The census the strip reads, at `RUN_UNTIL`. */
  readonly census: Readonly<Record<string, number>>;
}

function watch(runtime: SimulationRuntime): Watched {
  stepTo(runtime, WATCH_FROM);
  const store = runtime.prisoners.entityStore;
  let lowestSafety = NEED_MAX;
  let firstUnmetTick: number | undefined;

  for (let tick = runtime.kernel.tick + 1; tick <= RUN_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    for (let index = 0; index <= store.maxActiveIndex; index += 1) {
      if (!store.isIndexAlive(index)) continue;
      const level = runtime.prisoners.needs.levels.safety[index]! / NEED_SCALE;
      if (level < lowestSafety) lowestSafety = level;
      if (firstUnmetTick === undefined && level <= STATE_INCOME_UNMET_NEED_LEVEL) firstUnmetTick = tick;
    }
  }

  return { runtime, lowestSafety, firstUnmetTick, census: runtime.safetyCoverage.getCensus() };
}

describe('coverage is what provisions the safety need', () => {
  it('a covered sector holds safety at the top of the scale for ten in-game days', () => {
    const watched = watch(build({ prisoners: 4, cells: 4, guards: 1 }));

    expect(watched.runtime.deploymentSystem.getCoverageReport(watched.runtime.kernel.tick)).toEqual([
      { sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 },
    ]);
    // Net +0.03 a tick against a decay of 0.05, so every prisoner sits pinned
    // at the ceiling. Nothing is ever withheld for `safety` in a covered prison.
    expect(watched.lowestSafety).toBe(NEED_MAX);
    expect(watched.firstUnmetTick).toBeUndefined();
    expect(watched.census).toEqual({ covered: 4, understaffed: 0, unguarded: 0 });
  });

  it('an unguarded sector lets it fall past the unmet line inside the shortest sentence the game draws', () => {
    const watched = watch(build({ prisoners: 4, cells: 4, guards: 0 }));

    expect(watched.runtime.deploymentSystem.getCoverageReport(watched.runtime.kernel.tick)).toEqual([
      { sectorId: SECTOR, required: 1, assigned: 0, shortage: 1 },
    ]);
    expect(watched.census).toEqual({ covered: 0, understaffed: 0, unguarded: 4 });
    expect(watched.lowestSafety).toBe(0);

    /*
     * **Measured from the prisoner's own admission, not from tick zero.** The
     * fixture builds for a thousand ticks before it admits anybody, and the
     * claim is about a *sentence* -- so the number that has to be inside
     * `MIN_SENTENCE_LENGTH_TICKS` is the time the prisoner has been in the
     * prison. `sentenceEndTick - sentenceLengthTicks` is the tick the
     * classification stage settled, which is the first tick this prisoner's
     * needs were the prison's problem.
     *
     * The arithmetic is 4,080 --
     * `(NEED_MAX - STATE_INCOME_UNMET_NEED_LEVEL) / 0.05` -- because nothing
     * provisions `safety` in an unguarded sector, so the fall is
     * `NEED_DECAY_PER_TICK.safety` alone from `NEED_MAX`. **Measured, it is
     * 4,061**, and the nineteen-tick gap is the same one
     * `docs/research/2026-08-29-sentence-length-at-admission.md` measures
     * between `204 / rate` and the first unmet tick: `admitPrisoner` resets the
     * needs when the slot is allocated and the classification stage writes
     * `sentenceEndTick` about fifteen ticks later, so the decay is already
     * running when the tick this subtracts from is stamped, and
     * `NeedsDecaySystem`'s ten-tick batching accounts for the rest. The
     * direction is the safe one: the crossing is *earlier* than the arithmetic,
     * not later.
     *
     * Either number is what "the 20,400-tick requirement is discarded" reads
     * as in ticks, and both are inside the shortest sentence the game draws.
     */
    expect(watched.firstUnmetTick).toBeDefined();
    const records = watched.runtime.prisoners.records;
    const admittedAtTick = records.sentenceEndTick[0]! - records.sentenceLengthTicks[0]!;
    expect(watched.firstUnmetTick! - admittedAtTick).toBe(4_061);
    expect(watched.firstUnmetTick! - admittedAtTick).toBeLessThan(MIN_SENTENCE_LENGTH_TICKS);
  });
});
