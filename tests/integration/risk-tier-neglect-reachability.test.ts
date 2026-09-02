import { describe, expect, it } from 'vitest';
import { classifiedAtTickOf } from '../../src/simulation/prisoners/classification-review-system';
import { reviewClassification } from '../../src/simulation/prisoners/classification';
import { buildDisciplinaryIndex, CLEAN_DISCIPLINARY_RECORD, type DisciplinaryRecord } from '../../src/simulation/prisoners/disciplinary-record';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Are the risk tiers above `Low` unreachable, or merely slow?** ([#788](https://github.com/matmaxalez/lockstate/issues/788))
 *
 * `priorIncidents` — the one field `AdmitPrisoner` carries that
 * `classifyPrisoner` scores — is hard-coded to `0` at every call site under
 * `src/` (`src/main.ts:918`), and grepping every write to
 * `PrisonerRecordComponent.priorIncidentsAtIntake` under `src/` finds exactly
 * one: `IntakeSystem` at classification time, from that same constant
 * (`src/simulation/prisoners/intake-system.ts:274`). Nothing revises it after.
 * So the front door #788 measured is real and permanent, and settles that one
 * question without a run: `priorIncidents` never moves.
 *
 * What it does not settle is whether the *tier* is stuck, because
 * `classifyPrisoner`'s intake draw is not the only place a tier is written.
 * `ClassificationReviewSystem` (`src/simulation/prisoners/classification-review-system.ts`)
 * periodically recomputes it with `reviewClassification`, whose `findings`
 * term reads `DisciplinaryRecord.points` — folded from `IncidentLog` and
 * `ConfiscationLedger`, never from `priorIncidents` at all
 * (`src/simulation/prisoners/disciplinary-record.ts`). A prisoner who is party
 * to a terminal `'riot'`, `'assault'` or `'gang-retaliation'` gains 2 points,
 * +1 more if the incident lapsed unanswered
 * (`DISCIPLINARY_POINTS_BY_INCIDENT_TYPE`, `LAPSED_INCIDENT_SURCHARGE_POINTS`)
 * — and `MAX_FINDINGS_TERM = 3` alone clamps `reviewClassification`'s score to
 * tier 3 (High), regardless of `priorIncidentsAtIntake` or sentence length.
 *
 * This file runs the real kernel on two prisons a player could build, both
 * admitting with the exact ordinary request `src/main.ts` sends
 * (`priorIncidents: 0`) and a sentence held below
 * `LONG_SENTENCE_THRESHOLD_TICKS` (`classification.ts:41`), so neither of the
 * other two terms `reviewClassification` scores is in play — isolating
 * disciplinary findings as the only thing that could move anybody off `Low`.
 *
 * - **Neglected**: bed-only cells (no toilet, no shower, no yard), 0 guards —
 *   the same shape `tests/integration/incident-trigger-reachability.test.ts`
 *   has already shown riots at 0 guards and stays quiet at 1, so this file does
 *   not re-litigate whether neglect produces incidents.
 * - **Well-run**: fully furnished cells, a shower, a canteen, a yard, 1 guard —
 *   the control. If this run also produced a High-risk resident, the finding
 *   below would be about the review mechanism being broken rather than about
 *   neglect.
 */

const SEED = 0x0cc0;

/**
 * Below `LONG_SENTENCE_THRESHOLD_TICKS` (200,000) so the classification
 * `sentence` term is 0 for this whole run, and long enough that nobody is
 * discharged before their first review window closes: `classifiedAtTick` for
 * an admission this early is under 2,000, and the latest a first review can
 * fall is `classifiedAtTick + 47,999` (`CLASSIFICATION_REVIEW_INTERVAL_TICKS`
 * doubled, per `classification-review-system.ts`'s own derivation) —
 * comfortably inside 60,000.
 */
const SENTENCE_LENGTH_TICKS = 60_000;
const ADMISSION = { sentenceLengthTicks: SENTENCE_LENGTH_TICKS, priorIncidents: 0 } as const;

const RUN_TICKS = 50_000;
const CELL_COUNT = 8;
const ARRIVAL = { x: 16, y: 16 } as const;
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
const CANTEEN = { x: 19, y: 6, width: 6, height: 6 } as const;
const YARD = { x: 20, y: 20, width: 8, height: 8 } as const;

function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** A bed-only, unguarded prison built entirely from commands a player can send: no toilet, no shower, no yard, no staff. */
function buildNeglectedPrison(prisonerCount: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: CELL_COUNT }, (_unused, index) => cellRect(index));

  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: CELL_COUNT }));
  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  cells.forEach((rect, index) => submit(runtime, `zone-c${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  cells.forEach((rect, index) =>
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y })),
  );

  // Delivery delay plus build progress; every order is standing well before this.
  stepTo(runtime, 1_000);
  for (let index = 0; index < prisonerCount; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds, with zero staff and zero refusals').toBe(0);
  return runtime;
}

/** A fully furnished, single-guard prison — the control. Same shape as `incident-trigger-reachability.test.ts`'s `WELL_RUN`. */
function buildWellRunPrison(prisonerCount: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: CELL_COUNT }, (_unused, index) => cellRect(index));

  const planks = CELL_COUNT + 6 + 8;
  const bricks = CELL_COUNT + 2;
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: planks }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: bricks }));
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

  stepTo(runtime, 1_000);
  submit(runtime, 'hire0', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  for (let index = 0; index < prisonerCount; index += 1) {
    submit(runtime, `admit${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds, staffed and fully furnished, and zero refusals').toBe(0);
  return runtime;
}

/** Every living prisoner's index, ascending — the same walk `IntakeSystem`/`ActionSystem` use. */
function livingIndices(runtime: SimulationRuntime): readonly number[] {
  const store = runtime.prisoners.entityStore;
  const indices: number[] = [];
  for (let index = 0; index <= store.maxActiveIndex; index += 1) if (store.isIndexAlive(index)) indices.push(index);
  return indices;
}

/** What a review would find for every living prisoner at `runtime.kernel.tick`, via the exported pure functions rather than the private system. */
function assessAll(runtime: SimulationRuntime): ReadonlyMap<number, ReturnType<typeof reviewClassification> & { readonly disciplinary: DisciplinaryRecord }> {
  const disciplinaryIndex = buildDisciplinaryIndex({
    incidents: () => runtime.incidents.all(),
    confiscations: () => runtime.confiscations.all(),
  });
  const result = new Map<number, ReturnType<typeof reviewClassification> & { readonly disciplinary: DisciplinaryRecord }>();
  for (const index of livingIndices(runtime)) {
    const entityId = runtime.prisoners.entityStore.getIdByIndex(index);
    const disciplinary = disciplinaryIndex.get(entityId) ?? CLEAN_DISCIPLINARY_RECORD;
    const classifiedAtTick = classifiedAtTickOf(runtime.prisoners.records.sentenceEndTick[index]!, runtime.prisoners.records.sentenceLengthTicks[index]!);
    if (classifiedAtTick === undefined) continue;
    const assessment = reviewClassification({
      sentenceLengthTicks: runtime.prisoners.records.sentenceLengthTicks[index]!,
      priorIncidentsAtIntake: runtime.prisoners.records.priorIncidentsAtIntake[index]!,
      classifiedAtTick,
      tick: runtime.kernel.tick,
      disciplinary,
    });
    result.set(index, { ...assessment, disciplinary });
  }
  return result;
}

interface FirstReached {
  readonly tick: number;
  readonly entityIndex: number;
  readonly riskTier: number;
}

describe('the risk tiers above Low, in the real kernel (#788)', () => {
  it('a neglected, unguarded prison reaches High risk from disciplinary findings alone, with priorIncidents pinned at 0 throughout', () => {
    const runtime = buildNeglectedPrison(8);

    let firstMedium: FirstReached | undefined;
    let firstHigh: FirstReached | undefined;
    const incidentOpenedAtTicks: number[] = [];
    let previousIncidentCount = 0;

    while (runtime.kernel.tick < RUN_TICKS && firstHigh === undefined) {
      runtime.kernel.step();
      const tick = runtime.kernel.tick;

      const incidentCount = runtime.incidents.all().length;
      if (incidentCount !== previousIncidentCount) {
        for (let i = previousIncidentCount; i < incidentCount; i += 1) incidentOpenedAtTicks.push(tick);
        previousIncidentCount = incidentCount;
      }

      for (const index of livingIndices(runtime)) {
        const riskTier = runtime.prisoners.records.riskTier[index]!;
        if (firstMedium === undefined && riskTier >= 2) firstMedium = { tick, entityIndex: index, riskTier };
        if (firstHigh === undefined && riskTier >= 3) {
          firstHigh = { tick, entityIndex: index, riskTier };
          break;
        }
      }
    }

    // Every prisoner here was admitted with the exact request `src/main.ts`
    // sends (#788's front door): `priorIncidents: 0`, and a sentence below the
    // long-sentence threshold, so neither of the other two classification-score
    // terms besides `findings` can move a tier in this run. Confirmed directly
    // rather than only argued: `priorIncidentsAtIntake` never changes.
    for (const index of livingIndices(runtime)) {
      expect(runtime.prisoners.records.priorIncidentsAtIntake[index], 'priorIncidents never moves after intake').toBe(0);
    }

    const finalAssessments = assessAll(runtime);
    // eslint-disable-next-line no-console
    console.log(
      `[risk-tier-neglect] incidents opened at ticks ${JSON.stringify(incidentOpenedAtTicks)} (${String(incidentOpenedAtTicks.length)} total); ` +
        `first Medium (tier>=2): ${firstMedium === undefined ? 'never' : JSON.stringify(firstMedium)}; ` +
        `first High (tier>=3): ${firstHigh === undefined ? 'never' : JSON.stringify(firstHigh)}; ` +
        `run ended at tick ${String(runtime.kernel.tick)}; ` +
        `final per-prisoner assessment: ${JSON.stringify([...finalAssessments.entries()])}`,
    );

    expect(incidentOpenedAtTicks.length, 'the neglected prison must actually produce at least one incident for this run to test anything').toBeGreaterThan(0);
    expect(firstHigh, 'High (tier 3) must be reached from findings alone, priorIncidents pinned at 0 throughout').toBeDefined();
    // findings alone (riot: 2 base + 1 lapsed-unanswered surcharge = 3) already
    // saturates `MAX_FINDINGS_TERM`, so every observed transition here lands
    // directly on tier 3 without visibly pausing at tier 2 first -- reported
    // rather than asserted away, since it is itself part of the answer.
    for (const [, assessment] of finalAssessments) expect(assessment.factors.findings).toBe(3);
  });

  it('a well-run, staffed prison produces no incidents and settles every tier at Minimal, over the same window', () => {
    const runtime = buildWellRunPrison(8);
    stepTo(runtime, RUN_TICKS);

    expect(runtime.incidents.all(), 'a needs-met, guarded prison must not manufacture an incident on its own').toEqual([]);

    const finalAssessments = assessAll(runtime);
    // eslint-disable-next-line no-console
    console.log(`[risk-tier-well-run] run ended at tick ${String(runtime.kernel.tick)}; final per-prisoner assessment: ${JSON.stringify([...finalAssessments.entries()])}`);

    expect(finalAssessments.size, 'every admitted prisoner must have reached at least one review by the end of this window').toBe(8);
    for (const [, assessment] of finalAssessments) {
      expect(assessment.factors.findings, 'no findings without an incident').toBe(0);
      expect(assessment.riskTier, 'clean conduct alone settles a well-run prison at Minimal').toBe(0);
    }
  });
});
