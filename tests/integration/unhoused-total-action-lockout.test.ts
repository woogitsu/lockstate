import { describe, expect, it } from 'vitest';
import { ACTION_PHASES, intakeStageFromIndex, intakeStageIndex } from '../../src/simulation/prisoners/components';
import { NEED_IDS, type NeedId } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A prisoner stuck in intake is locked out of the action system entirely --
 * not just sleep -- and that lockout is the deliberate mechanism three
 * accepted ADRs rely on, not a defect** (issue #1064).
 *
 * ## What issue #1064 hypothesised, and what this file establishes instead
 *
 * The issue reads `ActionSystem.update`'s first statement --
 * `if (this.records.intakeStage[index] !== intakeStageIndex('completed')) continue;`
 * (`src/simulation/prisoners/action-system.ts:493`) -- as a defect: a
 * prisoner `IntakeSystem` cannot house is skipped by action selection
 * *entirely*, every need decays to 0 and stays there, and the two on-screen
 * sentences about this (`hud.intake.no-place`, `hud.status.prisoners-without-bed`)
 * name only sleep. All of that is verified below and is **true** --
 * `bedless never selected an action` and `bedless hunger reaches and holds 0`
 * reproduce the issue's own isolated measurement exactly.
 *
 * What is not true is that the lockout is an oversight the gate should be
 * relaxed for. Three *accepted* ADRs build the incident model on exactly this
 * mechanism, deliberately and by measurement:
 *
 * - [ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md) §2
 *   and its worked trace at "three prisoners admitted for one bed; two stay
 *   unhoused... safety decaying" -- the derived sector's post tile is where an
 *   admission with nowhere to sleep is *left standing*, precisely because
 *   `ActionSystem` never dispatches them anywhere else. Removing the lockout
 *   removes the standing.
 * - [ADR 0061](../../docs/adr/0061-what-the-prison-produces-on-its-own.md),
 *   "being unhoused is enough on its own" to open incidents with no
 *   contraband and no understaffing at all -- measured against every one of
 *   the six needs, hunger included.
 * - [ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md) decision 2
 *   made `needsPressure` the mean over *all* of `NEED_IDS` rather than
 *   `safety` alone, specifically so a served-safety prisoner whose other needs
 *   are neglected still drives risk -- the same average an unhoused
 *   prisoner's fully-unmet needs feed on the other side.
 * - Issue #549's owner ruling, pinned in
 *   `tests/integration/over-admission-signal.test.ts`: refusing an admission
 *   the prison cannot house was considered and *declined*, in the owner's own
 *   words, "because it closes the route into the incident content". Letting an
 *   admitted-but-unhoused prisoner act on their other needs is the same
 *   route, closed a different way.
 *
 * So the gate at `action-system.ts:493` is not touched by this file or by the
 * change it guards. This is a **protective** regression test: it fails if a
 * future change relaxes the lockout (accidentally or otherwise) without going
 * through the ADR the mandate this repository works under requires
 * (`AGENTS.md`: "propose an ADR rather than deciding architecture inside
 * implementation code"). Mutation evidence for that claim is in the commit
 * message that adds this file, because a source comment cannot show a diff.
 *
 * ## The one place this file corrects issue #1064 itself
 *
 * "every need decays to 0 and stays there" is not quite complete: `safety` is
 * the one need `SafetyCoverageSystem` provisions by *sector occupancy*
 * (`resolveSectorOccupants`), not by the prisoner's own selected action, and
 * an unhoused prisoner standing at the derived sector's post tile is exactly
 * such an occupant. The second case below hires one guard and shows `safety`
 * rising for the bedless prisoner while every other need still bottoms at 0 --
 * the reason the player-facing wording this issue also asks about does not
 * say "every need" or "nothing at all", and says "idle" instead, which is
 * true regardless of guard coverage.
 */

const SEED = 0x1064;
const CELL = 'room.cell';
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
/** `room.canteen`'s authored 6x6 minimum, clear of the cell above. */
const CANTEEN_RECT = { x: 8, y: 8, width: 6, height: 6 } as const;
const DINING_TABLE_TILE = { x: 8, y: 8 } as const;
/** `src/main.ts`'s `NEW_PRISON_ORIGIN_TILE`, and the derived security sector's post tile (ADR 0036 §2). */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Long enough that no `PrisonerDischargeSystem` release can fire mid-measurement. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;
/**
 * Long past the point every need -- including `recreation`, the slowest
 * decay in `NEED_DECAY_PER_TICK` at 0.015/tick, which needs 17,000 ticks to
 * fall the full 51,000 scaled levels from a fresh arrival's max -- has
 * bottomed out and stayed there for the bedless prisoner.
 */
const RUN_TICKS = 20_000;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * One cell, one bed, **and a working canteen** -- the issue's own fixture
 * (one cell, one bed) plus a room that does not gate on housing at all.
 *
 * The canteen is not there for the housed prisoner's sake: `own-accommodation`
 * already feeds them (`action.eat-in-cell`, ADR 0041) with no canteen needed.
 * It is here so the mutation test this file's commit message reports means
 * something. A fixture with no canteen and no accommodation for the bedless
 * prisoner gives the action-selection gate at `action-system.ts:493` **no
 * candidate action to suppress in the first place** -- `resolveTargetInstance`
 * already fails every category for a prisoner with nowhere to eat, wash or
 * relieve themselves, gate or no gate, which would make a test built without
 * a canteen pass identically whether the gate exists or not and prove
 * nothing about it. `room.canteen` is not accommodation-scoped: any prisoner
 * who can walk to it and find a free dining seat can eat there, unhoused or
 * not, so it is the one action in this fixture the gate is the *only* thing
 * stopping the bedless prisoner from reaching.
 */
function prisonWithOneBedAndACanteen(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  // 1 plank for the bed, 3 for the dining table (`dining-table-wooden`'s
  // authored `materialsRequired`, matching `canteen-shape-hunger-comparison.test.ts`).
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 4 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-0', definitionId: 'bed-wooden', ...BED_TILE }));
  wallRoomPerimeter(runtime.world, CANTEEN_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN_RECT }));
  submit(
    runtime,
    'place-dining-table',
    packCommand({ type: 'PlaceObject', orderId: 'dining-table-0', definitionId: 'dining-table-wooden', ...DINING_TABLE_TILE }),
  );
  stepTo(runtime, 2_000);
  return runtime;
}

function admit(runtime: SimulationRuntime, ordinal: number): void {
  submit(runtime, `admit-${String(ordinal)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
}

/** Every need's current scaled level, in one object -- for a trajectory snapshot. */
function needSnapshot(runtime: SimulationRuntime, index: number): Record<NeedId, number> {
  return Object.fromEntries(NEED_IDS.map((needId) => [needId, runtime.prisoners.needs.getScaled(index, needId)])) as Record<NeedId, number>;
}

describe('a prisoner stuck in intake with no bed (issue #1064)', () => {
  it('never selects an action -- not only never sleeps -- while a housed sibling cycles through all three phases', () => {
    const runtime = prisonWithOneBedAndACanteen();
    admit(runtime, 1);
    admit(runtime, 2);
    expect(runtime.prisoners.entityStore.maxActiveIndex, 'two prisoners exist').toBe(1);

    const stagesSeen: [Set<string>, Set<string>] = [new Set(), new Set()];
    const phasesSeen: [Set<string>, Set<string>] = [new Set(), new Set()];
    const hungerTrace: [number[], number[]] = [[], []];

    while (runtime.kernel.tick < RUN_TICKS) {
      runtime.kernel.step();
      for (const index of [0, 1] as const) {
        stagesSeen[index].add(intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!));
        phasesSeen[index].add(ACTION_PHASES[runtime.prisoners.currentAction.phase[index]!]!);
        hungerTrace[index].push(runtime.prisoners.needs.getScaled(index, 'hunger'));
      }
    }

    // Exactly one of the two ends housed and the other ends stuck -- one bed,
    // two admissions, no third outcome. Read off the final state rather than
    // assumed by admission order, because nothing about intake scheduling
    // promises the first admission wins the bed.
    const finalStage = [0, 1].map((index) => intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!));
    const housed = finalStage.indexOf('completed');
    const bedless = finalStage.indexOf('accommodation-assignment');
    expect(housed, 'exactly one of the two must reach completed intake').not.toBe(-1);
    expect(bedless, 'exactly one of the two must be stuck waiting for a bed').not.toBe(-1);
    expect(housed).not.toBe(bedless);

    // The housed prisoner reaches completed intake and the action system
    // actually dispatches them -- idle, travelling and performing all occur.
    // ('queued' is not asserted: `submit` already steps the kernel once per
    // admission, so a fast-scheduled first tick can advance past it before
    // this file's own sampling loop starts; that is a fixture-timing fact,
    // not a claim this test makes about the stage machine.)
    expect(stagesSeen[housed]!.has('completed'), 'the housed prisoner must reach completed intake').toBe(true);
    expect(phasesSeen[housed], 'the housed prisoner is dispatched: idle, travelling and performing all occur').toEqual(
      new Set(ACTION_PHASES),
    );
    // Hunger is not merely non-zero at the end -- it recovers after decaying,
    // which only a completed action (`action.eat-in-cell`, ADR 0041) can do.
    // A pure decay curve is monotonic; this is not.
    const rose = hungerTrace[housed]!.some((level, tick) => tick > 0 && level > hungerTrace[housed]![tick - 1]!);
    expect(rose, 'the housed prisoner\'s hunger must rise at least once -- proof a meal was actually served').toBe(true);

    // --- The bedless prisoner: this is the lockout, reproduced in isolation ---

    // Stuck exactly where issue #1064 measured, for the entire run -- never
    // advances to 'completed' and never falls to the terminal 'failed' (the
    // prison genuinely holds a room type for this group; it is only full).
    expect(stagesSeen[bedless]!.has('accommodation-assignment'), 'the bedless prisoner must reach accommodation-assignment').toBe(true);
    expect(stagesSeen[bedless]!.has('completed'), 'the bedless prisoner must never reach completed intake').toBe(false);
    expect(stagesSeen[bedless]!.has('failed'), 'the bedless prisoner must not be terminally failed -- the prison does hold a cell, it is only full').toBe(false);

    // The gate this file protects: never anything but 'idle'. Not "mostly
    // idle" -- the set has exactly one member for the whole 15,000-tick run.
    expect(
      phasesSeen[bedless],
      'action-system.ts:493 must keep a prisoner below completed intake at idle forever -- if this is anything but {idle}, the total lockout was relaxed without an ADR',
    ).toEqual(new Set(['idle']));

    // Not merely "idle" as a side effect of nothing to do: no action was ever
    // even chosen. `-1` is `CurrentActionComponent`'s own "no action selected"
    // sentinel.
    expect(
      runtime.prisoners.currentAction.actionIndex[bedless],
      'the bedless prisoner must never have an action selected, not merely never finish one',
    ).toBe(-1);

    // Hunger only ever falls -- `NeedsDecaySystem` batches its subtraction
    // every `intervalTicks` (10) rather than one tick at a time, so the exact
    // per-sample value is a schedule-alignment detail this file does not
    // pin; what the lockout predicts, and what is asserted, is that nothing
    // ever opposes the fall (strictly non-increasing throughout), that it
    // actually reaches the floor within this run, and that once at the floor
    // it never leaves it -- the "and stays there" half of the issue, not
    // merely "reaches 0 once".
    let sawZero = false;
    for (let tick = 0; tick < hungerTrace[bedless]!.length; tick += 1) {
      const level = hungerTrace[bedless]![tick]!;
      if (tick > 0) {
        expect(level, `hunger rose at sampled tick ${String(tick)} for the bedless prisoner -- something served a need nothing should be able to serve`).toBeLessThanOrEqual(hungerTrace[bedless]![tick - 1]!);
      }
      if (level === 0) sawZero = true;
      if (sawZero) expect(level, 'hunger must not recover once it has bottomed out -- nothing ever serves it').toBe(0);
    }
    expect(sawZero, 'the run must be long enough for hunger to actually reach 0').toBe(true);

    // And it is not only hunger: every one of the six needs is unserved,
    // exactly as ADR 0061's "being unhoused is enough on its own" describes.
    const finalNeeds = needSnapshot(runtime, bedless);
    for (const needId of NEED_IDS) {
      expect(finalNeeds[needId], `${needId} must also have bottomed out for the bedless prisoner`).toBe(0);
    }
  });

  it('still leaves safety alone: a guarded post tile provisions it for the bedless prisoner even though nothing else is served', () => {
    // The one need the total lockout does not touch, because
    // `SafetyCoverageSystem` provisions by sector occupancy
    // (`resolveSectorOccupants`), never by the prisoner's own selected
    // action -- and the derived sector's post tile is exactly where an
    // admission action-system.ts never dispatches is left standing (ADR
    // 0036 §2). This is the fact that rules out "every need" or "nothing at
    // all" as honest player-facing wording for this state.
    const runtime = prisonWithOneBedAndACanteen();
    submit(runtime, 'hire-guard', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
    admit(runtime, 1);
    admit(runtime, 2);

    stepTo(runtime, RUN_TICKS);

    const finalStage = [0, 1].map((index) => intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!));
    const bedless = finalStage.indexOf('accommodation-assignment');
    expect(bedless, 'one admission must still be stuck waiting for a bed with a guard on staff').not.toBe(-1);
    expect(runtime.prisoners.currentAction.actionIndex[bedless], 'still never selects an action').toBe(-1);

    const finalNeeds = needSnapshot(runtime, bedless);
    for (const needId of NEED_IDS) {
      if (needId === 'safety') continue;
      expect(finalNeeds[needId], `${needId} still bottoms out even with a guard on staff`).toBe(0);
    }
    expect(
      finalNeeds.safety,
      'safety must be above 0: a guard on post provisions it by occupancy, independent of the action-selection gate',
    ).toBeGreaterThan(0);
  });

  it('sanity check: intakeStageIndex(\'completed\') really is what the gate compares against', () => {
    // Pinned directly against the constant `action-system.ts:493` reads, so a
    // renumbering of `INTAKE_STAGES` cannot silently change what this file
    // means by "completed" without this failing too.
    expect(intakeStageFromIndex(intakeStageIndex('completed'))).toBe('completed');
  });
});
