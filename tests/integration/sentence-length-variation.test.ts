import { describe, expect, it } from 'vitest';
import { stateIncomeForCompletedDay, STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS, unmetNeedCount } from '../../src/simulation/economy/income';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * Issue #535 decision 5, end to end: **a sentence is drawn at admission, and
 * the grant-withholding schedule that could never fire now fires.**
 *
 * Everything below goes through the real kernel, the real `ZoneRoom` and
 * `AdmitPrisoner` commands and the real `StateIncomeSystem` arithmetic, in the
 * shape `sentence-end-release.test.ts` established -- because the claim is
 * about a prison a player can build. `tests/unit/prisoners-sentence.test.ts`
 * covers the draw in isolation; `tests/determinism/` covers what the new stream
 * does to a save.
 *
 * ### The measurement this file exists to make
 *
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` has been in the tree since
 * ADR 0064 and, from the Intake panel, had **no reachable case at all**. Two of
 * the six needs are room-gated (ADR 0054 decision 1): a prison with no shower
 * room and no laundry cannot serve `hygiene`, and one with no yard, common room
 * or classroom cannot serve `recreation`. Stepping the real `NeedsComponent`
 * through the real `decayNeed` at `NeedsDecaySystem`'s ten-tick cadence, those
 * two first read at or below `STATE_INCOME_UNMET_NEED_LEVEL` at ticks **10,180**
 * and **13,570** -- and `StateIncomeSystem` only samples at
 * `tick % DAY_LENGTH_TICKS === DAY_LENGTH_TICKS - 1`, so the first boundary that
 * can charge for them is 11,999 and 14,399. The old fixed sentence was 10,000
 * ticks. The prisoner was always gone first.
 *
 * Both halves are asserted here, on the same prison and the same seed: the case
 * that used to be the only case, and the one that now exists.
 */

const SEED = 535;
const ARRIVAL = { x: 16, y: 16 };
const CELL = { x: 4, y: 6, width: 2, height: 3 } as const;

/** What every admission from the HUD asked for before #535 decision 5. */
const OLD_FIXED_SENTENCE_TICKS = 10_000;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * A prison of `cells` furnished one-bed cells and **nothing else** -- no shower
 * room, no laundry, no yard, no common room, no classroom.
 *
 * That absence is the fixture, not an omission: it is the prison in which
 * `hygiene` and `recreation` have no route, which is the only prison in which
 * the withholding schedule has anything to say. `updateDerived` rather than a
 * `PlaceObject` order for the reason `sentence-end-release.test.ts` gives --
 * ADR 0028's derived capacity is another file's subject.
 */
function neglectfulPrison(cells = 1, seed: number = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  for (let index = 0; index < cells; index += 1) {
    const rectangle = { x: CELL.x + index * 4, y: CELL.y, width: CELL.width, height: CELL.height };
    wallRoomPerimeter(runtime.world, rectangle, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${index}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rectangle }));
  }
  const instances = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell');
  expect(instances.length, 'every cell must have been zoned for this fixture to mean anything').toBe(cells);
  for (const instance of instances) {
    runtime.prisoners.roomInstances.updateDerived(instance.instanceId, {
      residentCapacity: 1,
      concurrentUseCapacity: 1,
      concurrentUseCapacityByCapability: [['sleep-surface', 1]],
      objectCapabilities: ['sleep-surface'],
    });
  }
  return runtime;
}

/** Admits, leaving the sentence to the simulation unless one is named. Answers the new prisoner's entity id. */
function admit(runtime: SimulationRuntime, id: string, sentenceLengthTicks?: number): number {
  submit(
    runtime,
    id,
    packCommand({
      type: 'AdmitPrisoner',
      ...(sentenceLengthTicks === undefined ? {} : { sentenceLengthTicks }),
      priorIncidents: 0,
      ...ARRIVAL,
    }),
  );
  const entityId = runtime.prisoners.entityStore.getIdByIndex(runtime.prisoners.entityStore.maxActiveIndex);
  expect(runtime.prisoners.entityStore.isAlive(entityId)).toBe(true);
  return entityId;
}

function sentenceOf(runtime: SimulationRuntime, entityId: number): number {
  return runtime.prisoners.records.sentenceLengthTicks[runtime.prisoners.entityStore.getIndex(entityId)]!;
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

describe('a sentence drawn at admission (#535 decision 5)', () => {
  it('lands on a whole number of in-game days inside the proposed range', () => {
    const runtime = neglectfulPrison();
    const entityId = admit(runtime, 'admit');
    // The draw happens at the `classification` stage, which is two scheduled
    // intake ticks after the command lands -- so the slot reads
    // `SENTENCE_UNSET_TICKS` until then, exactly as it did between admission
    // and classification for `sentenceEndTick` before this change.
    expect(sentenceOf(runtime, entityId)).toBe(0);
    stepTo(runtime, 40);

    const sentence = sentenceOf(runtime, entityId);
    expect(sentence % 2_400).toBe(0);
    expect(sentence).toBeGreaterThanOrEqual(4_800);
    expect(sentence).toBeLessThanOrEqual(38_400);
    // `sentenceEndTick` is the sum of the drawn length and the tick it was
    // drawn at, which is what `PrisonerDischargeSystem` compares -- so the
    // drawn number really is the one that decides when this prisoner leaves.
    const index = runtime.prisoners.entityStore.getIndex(entityId);
    expect(runtime.prisoners.records.sentenceEndTick[index]!).toBe(sentence + 15);
  });

  it('gives prisoners in one prison different sentences, and repeats them exactly for the same seed', () => {
    const drawnAt = (seed: number): readonly number[] => {
      const runtime = neglectfulPrison(6, seed);
      const ids = Array.from({ length: 6 }, (_unused, index) => admit(runtime, `admit-${index}`));
      stepTo(runtime, 120);
      return ids.map((entityId) => sentenceOf(runtime, entityId));
    };

    const first = drawnAt(SEED);
    // Six admissions into one prison are not six copies of one number. This is
    // the whole of what the owner asked for and the assertion that fails if the
    // draw is replaced by any constant.
    expect(new Set(first).size).toBeGreaterThan(1);
    expect(first.every((sentence) => sentence % 2_400 === 0 && sentence >= 4_800 && sentence <= 38_400)).toBe(true);

    // Same seed, same sentences -- the draw is inside the worker and reads no
    // clock, so this is `docs/DETERMINISM.md`'s guarantee and not luck.
    expect(drawnAt(SEED)).toEqual(first);
    // A different seed does not merely reorder them.
    expect(drawnAt(SEED + 1)).not.toEqual(first);
  });

  it('uses a sentence the admission named, and never redraws it', () => {
    // Every fixture in `tests/` and every queued `AdmitPrisoner` in a save
    // written before the field became optional carries its own length. They
    // must keep their exact behaviour, or this change is a silent rewrite of
    // what those commands asked for.
    const runtime = neglectfulPrison();
    const entityId = admit(runtime, 'admit', OLD_FIXED_SENTENCE_TICKS);
    expect(sentenceOf(runtime, entityId)).toBe(OLD_FIXED_SENTENCE_TICKS);
    stepTo(runtime, 400);
    expect(sentenceOf(runtime, entityId)).toBe(OLD_FIXED_SENTENCE_TICKS);
    expect(runtime.prisoners.records.sentenceEndTick[runtime.prisoners.entityStore.getIndex(entityId)]!).toBe(OLD_FIXED_SENTENCE_TICKS + 15);
  });

  it('draws from `prisoners.sentence` and leaves `prisoners.classification` exactly where it was', () => {
    // The stream choice, pinned as behaviour rather than as a spelling. A draw
    // made on `prisoners.classification` instead would produce sentences in
    // range, day-quantised, deterministic and varied -- every other case in
    // this file would still pass -- and would silently shift every risk tier
    // every seed has ever produced, one admission onward. Nothing else in the
    // repository can see that: `tests/determinism/`'s scenario names its own
    // sentences, so it never makes the draw at all.
    const wordsOf = (runtime: SimulationRuntime, name: string): readonly number[] =>
      runtime.kernel.snapshot().rngStates.find((entry) => entry.name === name)!.state.words;

    const runtime = neglectfulPrison();
    const classificationBefore = wordsOf(runtime, 'prisoners.classification');
    const sentenceBefore = wordsOf(runtime, 'prisoners.sentence');

    const entityId = admit(runtime, 'admit');
    stepTo(runtime, 40);
    expect(sentenceOf(runtime, entityId)).toBeGreaterThan(0);

    // The sentence stream moved, so the draw really came from it.
    expect(wordsOf(runtime, 'prisoners.sentence')).not.toEqual(sentenceBefore);
    // The classification stream moved by exactly the one draw
    // `classifyPrisoner` has always made -- which is what a second prison that
    // names its sentence explicitly proves, because that one makes no sentence
    // draw at all and must land on the same classification state.
    const named = neglectfulPrison();
    admit(named, 'admit', OLD_FIXED_SENTENCE_TICKS);
    stepTo(named, 40);
    expect(wordsOf(named, 'prisoners.classification')).toEqual(wordsOf(runtime, 'prisoners.classification'));
    expect(wordsOf(named, 'prisoners.classification')).not.toEqual(classificationBefore);
    // And that second prison never touched the sentence stream.
    expect(wordsOf(named, 'prisoners.sentence')).toEqual(sentenceBefore);
  });

  it('is what makes the state withhold a grant for a neglected prisoner, which the old fixed sentence never could', () => {
    // The boundaries the two room-gated needs cross, derived in this file's
    // header and written out rather than computed here.
    const HYGIENE_BOUNDARY = 11_999;
    const RECREATION_BOUNDARY = 14_399;

    const runtime = neglectfulPrison();
    const entityId = admit(runtime, 'admit');
    stepTo(runtime, 40);
    const sentence = sentenceOf(runtime, entityId);
    expect(sentence, 'this case needs a sentence that outlasts both boundaries; seed 535 draws 19,200').toBeGreaterThan(RECREATION_BOUNDARY);

    const grantAt = (tick: number): number => {
      stepTo(runtime, tick);
      return stateIncomeForCompletedDay(runtime.prisoners);
    };

    // Days 1 to 4: one occupied place, every need still served, full rate.
    expect(grantAt(2_399)).toBe(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);
    expect(grantAt(9_599)).toBe(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);

    // Day 5: `hygiene` has fallen through the threshold and one term of the
    // schedule is withheld. Written as literals -- 300 less 40 -- and not as
    // `RATE - WITHHELD`, which would hold for any pair of numbers.
    expect(grantAt(HYGIENE_BOUNDARY)).toBe(260);
    expect(unmetNeedCount(runtime.prisoners.needs, runtime.prisoners.entityStore.getIndex(entityId))).toBe(1);

    // Day 6: `recreation` follows, and two terms are withheld.
    expect(grantAt(RECREATION_BOUNDARY)).toBe(220);
    expect(unmetNeedCount(runtime.prisoners.needs, runtime.prisoners.entityStore.getIndex(entityId))).toBe(2);
    expect(runtime.prisoners.entityStore.isAlive(entityId), 'the prisoner must still be holding the place they are being underpaid for').toBe(true);

    // And the counterfactual, on the same prison and the same seed: the
    // sentence every HUD admission used to get ends before the first boundary
    // that could have charged for anything, so the prison is paid the full
    // rate every day this prisoner is in it and then paid nothing at all.
    const before = neglectfulPrison();
    const shortId = admit(before, 'admit', OLD_FIXED_SENTENCE_TICKS);
    expect(stateIncomeForCompletedDay(before.prisoners)).toBe(0);
    for (const boundary of [2_399, 4_799, 7_199, 9_599]) {
      stepTo(before, boundary);
      expect(stateIncomeForCompletedDay(before.prisoners)).toBe(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);
    }
    stepTo(before, HYGIENE_BOUNDARY);
    expect(before.prisoners.entityStore.isAlive(shortId), 'the old fixed sentence ended at ~10,015, before this boundary').toBe(false);
    expect(stateIncomeForCompletedDay(before.prisoners)).toBe(0);
  });
});
