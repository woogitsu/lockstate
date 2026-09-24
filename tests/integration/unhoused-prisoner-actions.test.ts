import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { intakeStageFromIndex, type IntakeStage } from '../../src/simulation/prisoners/components';
import { NEED_IDS, type NeedId } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * [ADR 0102](../../docs/adr/0102-what-a-prisoner-without-a-bed-may-still-do.md),
 * accepted by the owner on 2026-09-07: **a prisoner waiting for a bed may eat
 * and wash, and the boundary on what else they may do is structural.**
 *
 * ## What this file is written against
 *
 * Issue #1064, found by playing: three of four prisoners sat at 0% fullness
 * for about twenty-nine in-game days beside a finished, furnished kitchen and
 * canteen. The cause is one line -- the first statement of
 * `ActionSystem.update`'s per-entity loop, which admitted only intake stage
 * `completed` -- and `IntakeSystem` holds a prisoner at
 * `accommodation-assignment` with no timeout for as long as no bed is free. So
 * an unhoused prisoner had no action ranked at all: not sleep refused, not a
 * meal refused, *nothing offered*, for the whole of a sentence.
 *
 * ## The fixture, named by the ADR rather than chosen here
 *
 * **One bed, one canteen, two admissions, 20,000 ticks, seed `0x1064`.** ADR
 * 0102's "The measurement the implementation will owe" names it exactly so a
 * flattering fixture cannot be substituted for it. One bed and two arrivals is
 * the smallest prison in which one prisoner is housed and one is not, and both
 * stand in the same derived security sector, so every difference below is the
 * bed and nothing else. The canteen is built to its own authored requirements
 * (two dining tables, four benches) rather than to the one table that would
 * make `action.eat-meal` resolve, so the fixture is a canteen a player has
 * genuinely finished -- and, at a `'dining'` ceiling of six against two
 * prisoners, one where nobody is refused a seat. **That means this file
 * measures the mechanism and not contention**; ADR 0102's own weakest-claim
 * section is about a *contested* canteen, and this fixture does not contest
 * one.
 *
 * No guard is hired, which makes the sector `unguarded` -- ADR 0102's Cost
 * table's "canteen only, unguarded" row, the one whose deficit floor it prices
 * at 5/6 and still above `DEFAULT_ASSAULT_POLICY`'s 0.65 threshold on need
 * alone.
 *
 * ## Measured on this fixture, before and after
 *
 * Both columns are runs of this file's prison, 20,000 ticks, seed `0x1064`,
 * taken on 2026-09-07 from a tree cut at `558ece5f` (v0.0.540); "before" is
 * that tree unmodified, "after" is that tree with this change applied and
 * nothing else. The unhoused prisoner is the second admission.
 *
 * | | before | after |
 * | --- | --- | --- |
 * | unhoused: ticks performing any action | 0 | 1,688 |
 * | unhoused: `action.eat-meal` performing ticks | 0 | 1,688 |
 * | unhoused: final `hunger` (of 255) | 0 | 241 |
 * | unhoused: lowest `hunger` after tick 5,000 | 0 | 217 |
 * | unhoused: final `bladder` (of 255) | 0 | 0 |
 * | unhoused: final mean need deficit | 1.0000 | 0.8425 |
 * | sector `needsPressure` at tick 20,000 | 0.7935 | 0.7137 |
 * | incidents opened over the run | 4 | 4 |
 * | those incidents | assault sev 3 @4,200; riots sev 7 @5,650, 10 @10,450, 10 @15,250 | assault sev 3 @4,700; riots sev 7 @6,050, **9** @10,850, 10 @15,650 |
 * | unhoused: `solitarySanctionEndTick` written / served | 12,010 / never | 12,510 / never |
 *
 * **ADR 0102's Cost arithmetic is confirmed and its expectation about
 * incidents is not.** The Cost table prices this configuration -- canteen
 * only, unguarded -- at a best-case deficit floor of 5/6 ≈ 0.833, and the run
 * lands at 0.8425, just above the bound, exactly as that section says its
 * numbers should be read. But the document opens Cost with *"an unhoused
 * prisoner is ... today's single most reliable source of assault and riot
 * pressure, and this decision is expected to reduce that"*, and **over 20,000
 * ticks of its own named fixture the incident count does not move at all**:
 * four incidents both ways, the same assault with the same severity and the
 * same unhoused instigator, one riot a severity lower, and every onset pushed
 * 400-500 ticks later. The arithmetic says why -- 0.8425 alone still clears
 * `DEFAULT_ASSAULT_POLICY`'s 0.65 threshold, which the ADR itself predicts --
 * so this is the outcome its "What would change my mind" section names: the
 * direction the owner ruled on stands, and the document's claim about
 * incident pressure is not supported by the fixture it chose.
 *
 * **The second configuration, recommended by the ADR rather than owed.** The
 * same prison with a shower room and a yard added, run the same way: the
 * unhoused prisoner performs 3,924 ticks (`action.eat-meal` 656,
 * `action.shower` 520, `action.yard-recreation` 2,748) against 0 before, the
 * final mean deficit falls from 1.0000 to 0.5307 against the Cost table's 3/6
 * bound for that row, and the incident count is **again** unchanged at four --
 * though all three riots drop to severity 7 (from 7, 9, 9). So the amenity-rich
 * row moves severity where the canteen-only row moves only timing, and neither
 * moves the count. That second prison is not built here, because this file is
 * the regression test for the gate and a fixture that built every room would
 * stop being ADR 0102's named one.
 *
 * ## Whether that table is the fixture's story or its seed's
 *
 * Every figure above is one run of one seed, and the sibling file
 * `incident-trigger-reachability.test.ts` had to withdraw two claims in
 * exactly that shape -- an incident count that turned out to belong to its
 * seed rather than to the change. So the same question was put to this
 * fixture before it could be trusted, and the answer is the opposite one.
 *
 * Measured 2026-09-07 over **16 consecutive seeds from `0x1064`**, both
 * columns run the same way as the table above (`558ece5f` unmodified against
 * `558ece5f` plus this change alone, 20,000 ticks, this file's prison):
 *
 * | | before | after | seeds |
 * | --- | --- | --- | --- |
 * | riots opened | 3 | 3 | 16 of 16 |
 * | riot severities, in order | 7, 10, 10 | 7, **9**, 10 | 16 of 16 |
 * | unhoused: final mean need deficit | 1.0000 | 0.8425 | 16 of 16 |
 * | housed: final mean need deficit | 0.5869 | 0.5850 | 16 of 16 |
 * | sector `needsPressure` at tick 20,000 | 0.7935 | 0.7137 | 16 of 16 |
 * | total incidents | 4 | 4 | 12 of 16 |
 * | total incidents | 4 | **5** | `0x106c`, `0x1070` |
 * | total incidents | 5 | 5 | `0x1069`, `0x106f` |
 *
 * **Every number this file's argument rests on is seed-invariant, and the one
 * that is not is an assault.** The riot count, the severity that falls, both
 * deficits and the needs pressure are identical on all sixteen; what moves is
 * a single assault appearing on two seeds where it did not before -- the same
 * seed-dependence the sibling file found, and nowhere in the claims below. So
 * *the incident count does not move* is a property of this fixture rather than
 * of `0x1064`, and the finding it supports -- that ADR 0102's Cost expectation
 * about incident pressure is not borne out on the fixture the ADR named --
 * survives the check that broke the other file's.
 *
 * This sweep is **recorded rather than asserted**, for the reason the next
 * section gives about the table above it: sixteen extra 20,000-tick runs would
 * pin balance figures this file is not the regression test for. The seed sweep
 * that *is* asserted is in `incident-trigger-reachability.test.ts`, whose
 * subject is which prisons riot.
 *
 * ## What is asserted, and what is only recorded
 *
 * Every expectation below is a property of the mechanism -- a count that is
 * zero, a count that is not, a need that recovers, a need that cannot. The
 * table above is recorded rather than asserted, except where a figure is the
 * subject of a case; a fixture that pinned all of it would fail on any
 * balance change to a decay rate or a room ceiling and say nothing about
 * whether an unhoused prisoner can eat.
 */

const SEED = 0x1064;
const RUN_TICKS = 20_000;
/** The delivery delay plus every build; asserted rather than assumed by `built the prison it says it builds`. */
const BUILT_BY = 2_000;

/** `room.cell`'s authored 2x3 minimum, with the one bed this fixture is named for. */
const CELL = { x: 1, y: 1, width: 2, height: 3 } as const;
/** `room.canteen`'s authored 6x6 minimum, clear of the cell. */
const CANTEEN = { x: 8, y: 8, width: 6, height: 6 } as const;
/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Far longer than `RUN_TICKS`, so no sentence ends inside the window and `PrisonerDischargeSystem` never frees the bed. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

/** One plank for the bed, three for each of the two dining tables, two for each of the four benches. */
const PLANKS = 1 + 2 * 3 + 4 * 2;

/** `2` is `performing` in `ACTION_PHASES`; the phase names are not exported as a lookup. */
const PERFORMING_PHASE = 2;

/** The four `own-accommodation`-targeted actions ADR 0102 decision 2 leaves structurally unreachable without a cell. */
const OWN_ACCOMMODATION_ACTION_IDS = DEFAULT_ACTIONS.filter((action) => action.target.kind === 'own-accommodation').map(
  (action) => action.id,
);
/** The three `'work'` actions ADR 0102 decision 2 excludes explicitly, as a question it declines to answer. */
const WORK_ACTION_IDS = DEFAULT_ACTIONS.filter((action) => action.category === 'work').map((action) => action.id);

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * One cell with one bed, one finished canteen, no guards -- built with player
 * commands. `wallRoomPerimeter` writes completed wall edges. The second
 * in-prison arrival below models a saved pre-#590 intake stage; new requests
 * without a place wait outside and cannot recreate that state.
 */
function prison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: PLANKS }));

  wallRoomPerimeter(runtime.world, CELL, { doors: runtime.navigation.doors });
  wallRoomPerimeter(runtime.world, CANTEEN, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL }));
  submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));

  submit(runtime, 'bed', packCommand({ type: 'PlaceObject', orderId: 'o-bed', definitionId: 'bed-wooden', x: CELL.x, y: CELL.y }));
  submit(runtime, 'dt0', packCommand({ type: 'PlaceObject', orderId: 'o-dt0', definitionId: 'dining-table-wooden', x: CANTEEN.x, y: CANTEEN.y }));
  submit(runtime, 'dt1', packCommand({ type: 'PlaceObject', orderId: 'o-dt1', definitionId: 'dining-table-wooden', x: CANTEEN.x + 3, y: CANTEEN.y }));
  for (let index = 0; index < 4; index += 1) {
    submit(runtime, `bench${String(index)}`, packCommand({
      type: 'PlaceObject',
      orderId: `o-bench${String(index)}`,
      definitionId: 'bench-wooden',
      x: CANTEEN.x + (index % 2) * 2,
      y: CANTEEN.y + 2 + Math.floor(index / 2),
    }));
  }

  stepTo(runtime, BUILT_BY);
  return runtime;
}

interface WatchedPrisoner {
  readonly entityId: number;
  /** Performing ticks per action id, summed over the run. */
  readonly performing: Readonly<Record<string, number>>;
  /** Every distinct intake stage this prisoner was seen at, in first-seen order. */
  readonly stages: readonly IntakeStage[];
  readonly finalNeeds: Readonly<Record<NeedId, number>>;
  /** The lowest each need reached after `SETTLED_BY`, which is past the first day's decay ramp. */
  readonly lowestNeedsWhenSettled: Readonly<Record<NeedId, number>>;
  readonly finalIntakeStage: IntakeStage;
  readonly solitarySanctionEndTick: number;
}

/** Past the first in-game day and the first meal blocks, so a "lowest since" reading is about the steady state rather than the ramp. */
const SETTLED_BY = 5_000;

interface WatchedRun {
  readonly runtime: SimulationRuntime;
  /** Ascending entity index, which is admission order: `[housed, unhoused]` for this fixture. */
  readonly prisoners: readonly WatchedPrisoner[];
}

function watched(): WatchedRun {
  const runtime = prison();
  submit(runtime, 'admit-0', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  // A pre-#590 save can already contain a second in-prison intake awaiting a
  // bed. Keep that legacy stage under test without using the new guarded
  // player command, which now queues this request outside instead.
  runtime.prisoners.admitPrisoner(ADMISSION, ARRIVAL);
  // A refused purchase, zoning, placement or admission would make every figure
  // below a measurement of a different prison.
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);

  const store = runtime.prisoners.entityStore;
  const entityIds = [store.getIdByIndex(0), store.getIdByIndex(1)];
  const performing: Record<string, number>[] = [{}, {}];
  const stages: IntakeStage[][] = [[], []];
  const lowest: Record<NeedId, number>[] = entityIds.map(() =>
    Object.fromEntries(NEED_IDS.map((needId) => [needId, Number.POSITIVE_INFINITY])) as Record<NeedId, number>,
  );

  // Every tick rather than every twentieth, for the reason
  // `furnished-prison-loop.test.ts` records: a performed action is short and a
  // coarse sample can miss one entirely.
  for (let tick = runtime.kernel.tick + 1; tick <= RUN_TICKS; tick += 1) {
    stepTo(runtime, tick);
    for (const [ordinal, entityId] of entityIds.entries()) {
      const index = store.getIndex(entityId);
      const stage = intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!);
      if (!stages[ordinal]!.includes(stage)) stages[ordinal]!.push(stage);

      const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
      if (runtime.prisoners.currentAction.phase[index] === PERFORMING_PHASE && actionIndex >= 0) {
        const id = DEFAULT_ACTIONS[actionIndex]!.id;
        performing[ordinal]![id] = (performing[ordinal]![id] ?? 0) + 1;
      }

      if (tick >= SETTLED_BY) {
        for (const needId of NEED_IDS) {
          const level = runtime.prisoners.needs.get(index, needId);
          if (level < lowest[ordinal]![needId]) lowest[ordinal]![needId] = level;
        }
      }
    }
  }

  return {
    runtime,
    prisoners: entityIds.map((entityId, ordinal) => {
      const index = store.getIndex(entityId);
      return {
        entityId,
        performing: performing[ordinal]!,
        stages: stages[ordinal]!,
        finalNeeds: Object.fromEntries(NEED_IDS.map((needId) => [needId, runtime.prisoners.needs.get(index, needId)])) as Record<
          NeedId,
          number
        >,
        lowestNeedsWhenSettled: lowest[ordinal]!,
        finalIntakeStage: intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!),
        solitarySanctionEndTick: runtime.prisoners.records.solitarySanctionEndTick[index]!,
      };
    }),
  };
}

function performingTicks(prisoner: WatchedPrisoner, actionIds: readonly string[]): number {
  return actionIds.reduce((total, id) => total + (prisoner.performing[id] ?? 0), 0);
}

function totalPerformingTicks(prisoner: WatchedPrisoner): number {
  return Object.values(prisoner.performing).reduce((total, ticks) => total + ticks, 0);
}

/** One prisoner's mean unmet-need deficit over `NEED_IDS`, the term `sampleSectorRisk` and `sampleFlashpoints` both read (ADR 0048 decision 2). Recomputed here rather than read off the sampler, which `new-session.ts` keeps private. */
function meanNeedDeficit(prisoner: WatchedPrisoner): number {
  const NEED_MAX_LEVEL = 255;
  let deficit = 0;
  for (const needId of NEED_IDS) deficit += (NEED_MAX_LEVEL - prisoner.finalNeeds[needId]) / NEED_MAX_LEVEL;
  return deficit / NEED_IDS.length;
}

describe('a prisoner waiting for a bed (ADR 0102, issue #1064)', () => {
  const run = watched();
  const [housed, unhoused] = run.prisoners;

  it('is genuinely still waiting for a bed at the end of the run, which is what makes every case below non-vacuous', () => {
    expect(housed!.finalIntakeStage).toBe('completed');
    expect(unhoused!.finalIntakeStage).toBe('accommodation-assignment');
    // Never reached `completed`, so nothing below is a housed prisoner's day
    // measured under another name.
    expect(unhoused!.stages).not.toContain('completed');
  });

  it('eats: `action.eat-meal` is performed, and hunger recovers instead of flatlining at 0', () => {
    expect(unhoused!.performing['action.eat-meal'] ?? 0).toBeGreaterThan(0);
    // The defect's own signature in issue #1064 is hunger reaching 0 at about
    // tick 4,900 and staying there. Both halves are refused: it is off the
    // floor at the end, and it never returned to the floor after the run
    // settled.
    expect(unhoused!.finalNeeds.hunger).toBeGreaterThan(0);
    expect(unhoused!.lowestNeedsWhenSettled.hunger).toBeGreaterThan(0);
  });

  it('cannot sleep, eat in a cell, use a toilet or freely associate -- the structural boundary, with no list of permitted actions anywhere', () => {
    // ADR 0102 decision 2: `prisonProvides`'s existing `own-accommodation`
    // branch answers `false` for a prisoner `getAccommodation` has nothing
    // for, so these four stay unreachable with no further code. Asserted as a
    // set read off the catalogue rather than as four literals, so an action
    // appended with an `own-accommodation` target joins this case by itself.
    expect(OWN_ACCOMMODATION_ACTION_IDS.length).toBeGreaterThan(0);
    expect(performingTicks(unhoused!, OWN_ACCOMMODATION_ACTION_IDS)).toBe(0);
    // Non-vacuous: the housed prisoner in the same prison performs them.
    expect(performingTicks(housed!, OWN_ACCOMMODATION_ACTION_IDS)).toBeGreaterThan(0);
  });

  it('bladder stays on the floor, because no action in the catalogue restores it without a cell (ADR 0102 open question 1)', () => {
    // Recorded as a measured consequence rather than left to be rediscovered:
    // `action.use-toilet` is the only entry whose `needEffectsPerTick` names
    // `bladder`, and its target is `own-accommodation`.
    expect(unhoused!.finalNeeds.bladder).toBe(0);
    expect(unhoused!.lowestNeedsWhenSettled.bladder).toBe(0);
  });

  it('does no work, which ADR 0102 excludes as a separate question rather than answering', () => {
    expect(WORK_ACTION_IDS.length).toBeGreaterThan(0);
    expect(performingTicks(unhoused!, WORK_ACTION_IDS)).toBe(0);
  });

  it('is still named in a solitary sanction that is never served, because ADR 0102 decision 3 leaves `SanctionSystem`’s own gate alone', () => {
    // ADR 0102's measurement item 2, and the case that fails if a later pass
    // widens that gate as a side effect of this one. The assault this fixture
    // opens at tick 4,700 names the unhoused prisoner as instigator, so an end
    // tick is written for them -- and `SanctionSystem` refuses every prisoner
    // outside `'completed'`, so nothing ever moves them into a solitary cell
    // or lifts it afterwards. Both halves are measured here rather than
    // reasoned about.
    expect(unhoused!.solitarySanctionEndTick).toBeGreaterThan(0);
    expect(run.runtime.prisoners.sanctionSystem.getMetrics().relocatedIntoSolitaryCount).toBe(0);
    expect(run.runtime.prisoners.sanctionSystem.getMetrics().releasedFromSolitaryCount).toBe(0);
  });

  it('leaves the housed prisoner’s own day alone', () => {
    expect(totalPerformingTicks(housed!)).toBeGreaterThan(0);
    expect(housed!.performing['action.eat-meal'] ?? 0).toBeGreaterThan(0);
    expect(housed!.performing['action.sleep'] ?? 0).toBeGreaterThan(0);
  });

  it('still carries a need deficit high enough to drive the incident content this prison already produces', () => {
    // ADR 0102's Cost section prices this fixture's floor at 5/6 ≈ 0.833 in an
    // unguarded sector with a canteen and nothing else, and the assault
    // threshold at 0.65 on need alone. The point of this case is that the
    // change does **not** buy quiet in a prison like this one: the deficit
    // falls, and stays well above the line.
    const deficit = meanNeedDeficit(unhoused!);
    expect(deficit).toBeLessThan(1);
    expect(deficit).toBeGreaterThan(0.65);
  });
});
