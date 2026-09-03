import { describe, expect, it } from 'vitest';
import {
  STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS,
  stateIncomeForCompletedDay,
  stateIncomeForPrisonerDayAt,
  unmetNeedCount,
} from '../../src/simulation/economy/income';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * Issue #535 decision 5, end to end: **a sentence is drawn at admission, and
 * the grant-withholding schedule that could never fire now fires.**
 *
 * **Suspended, 2026-09-03.** The owner set
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` to `0` for now -- the
 * ruling and their words are in that constant's docblock -- so the schedule
 * fires and withholds nothing. The sentence above is left as it stands because
 * it is the reachability finding this file was built for and reachability is
 * what it still measures: the prisoner is in the prison when the boundaries
 * arrive, and the counts the schedule reads are asserted at both the shipped
 * rate and at ADR 0064's `40` (`docs/AGENT_WORKFLOW.md` §4: mark both
 * directions).
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
 * ADR 0064 and, from the Intake panel, had **no reachable case at all**.
 *
 * **Since the owner's 2026-08-30 ruling on
 * [#593](https://github.com/matmaxalez/lockstate/issues/593) the reachable case
 * is the only case.** The range is 14 to 90 in-game days, so the shortest
 * drawable sentence (33,600 ticks) outlasts both boundaries below by more than
 * eight in-game days and the withholding schedule fires for every neglected
 * prisoner rather than for a lucky draw. The paragraph below is kept as
 * written, because it is what the fixture was built to demonstrate and because
 * the boundaries themselves have not moved. Two of
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
  /*
   * **One guard, hired for what this prison is *not* neglectful about**
   * (issue #588). The subject of this file is the two room-gated needs and the
   * boundaries a sentence has to outlast to be charged for them; since
   * coverage became the provisioner of `safety`, an unstaffed prison also
   * crosses that need's line -- 4,080 ticks after admission, well before
   * hygiene's 10,180 -- and the day-4 row below would then read 260 for a
   * reason this file is not about.
   *
   * Hiring is the honest fix rather than raising the expectation: the prison
   * is meant to be neglectful about *rooms*, and a guard changes nothing else.
   * It is submitted before the admission so the sector is covered from the
   * first tick the prisoner is in it.
   */
  submit(runtime, 'hire-guard', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));

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
  it('lands on a whole number of in-game days inside the range the owner ruled', () => {
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
    // 14 to 90 in-game days since the owner's 2026-08-30 ruling on #593; this
    // file read 4,800 and 38,400 until then. Literals rather than the exported
    // bounds, for the reason `tests/unit/prisoners-sentence.test.ts` gives.
    expect(sentence).toBeGreaterThanOrEqual(33_600);
    expect(sentence).toBeLessThanOrEqual(216_000);
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
    expect(first.every((sentence) => sentence % 2_400 === 0 && sentence >= 33_600 && sentence <= 216_000)).toBe(true);

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

  it('lets a drawn sentence decide a risk tier, which no drawn sentence could before (#593)', () => {
    // The mechanic the owner's 2026-08-30 ruling bought, proved by holding
    // everything except the sentence still.
    //
    // Two prisons on seed 558. The first leaves the length to the simulation
    // and draws 208,800 ticks -- 87 in-game days, over the 200,000-tick
    // `LONG_SENTENCE_THRESHOLD_TICKS`. The second names a length below it. `prisoners.sentence` and `prisoners.classification` are
    // separate streams, so the screening draw is the *same value* in both
    // prisons; the only difference between the two recorded tiers is
    // `classifyPrisoner`'s sentence term.
    //
    // This case could not have been written before the ruling at all: no
    // drawable length reached the threshold, so the two prisons would have been
    // identical whatever they drew.
    //
    // The seed is chosen so the screening draw is `+1` rather than `-1`. That
    // is not tuning the result: `clampTier` floors at 0, so at a screening draw
    // of `-1` a score of 1 and a score of 0 both clamp to tier 0 and the
    // sentence term is invisible *by design*. A seed that hid the term would
    // have made this case pass for the wrong reason.
    const LONG_SENTENCE_THRESHOLD_TICKS = 200_000;
    const BELOW_THRESHOLD = 100_000;

    const drawnRuntime = neglectfulPrison(1, 558);
    const drawnId = admit(drawnRuntime, 'admit');
    stepTo(drawnRuntime, 40);
    const drawnSentence = sentenceOf(drawnRuntime, drawnId);
    expect(drawnSentence, 'seed 558 draws 208,800 ticks -- 87 in-game days').toBe(208_800);
    expect(drawnSentence).toBeGreaterThan(LONG_SENTENCE_THRESHOLD_TICKS);

    const namedRuntime = neglectfulPrison(1, 558);
    const namedId = admit(namedRuntime, 'admit', BELOW_THRESHOLD);
    stepTo(namedRuntime, 40);
    expect(sentenceOf(namedRuntime, namedId)).toBe(BELOW_THRESHOLD);

    const tierOf = (runtime: SimulationRuntime, entityId: number): number =>
      runtime.prisoners.records.riskTier[runtime.prisoners.entityStore.getIndex(entityId)]!;
    // One tier apart, and the literals are written out so that a change to
    // either the threshold or the screening draw fails here rather than
    // cancelling out inside a subtraction.
    expect(tierOf(drawnRuntime, drawnId)).toBe(2);
    expect(tierOf(namedRuntime, namedId)).toBe(1);

    // And the review reads the same term, so the tier a panel would explain is
    // built from a named factor rather than from the intake draw alone.
    const assessment = drawnRuntime.prisoners.classificationReviewSystem.assess(drawnId, drawnRuntime.kernel.tick);
    expect(assessment?.factors.sentence).toBe(1);
    expect(namedRuntime.prisoners.classificationReviewSystem.assess(namedId, namedRuntime.kernel.tick)?.factors.sentence).toBe(0);
  });

  it('is what keeps a neglected prisoner in the prison long enough for the state to see them at all, which the old fixed sentence never could', () => {
    // The boundaries the two room-gated needs cross, derived in this file's
    // header and written out rather than computed here.
    const HYGIENE_BOUNDARY = 11_999;
    const RECREATION_BOUNDARY = 14_399;

    const runtime = neglectfulPrison();
    const entityId = admit(runtime, 'admit');
    stepTo(runtime, 40);
    const sentence = sentenceOf(runtime, entityId);
    // Seed 535 drew 19,200 under the old 2-16 day range and draws 163,200 under
    // the 14-90 range the owner ruled on #593. The assertion is the same one
    // either way, and it is now guaranteed by the range rather than by the seed:
    // `MIN_SENTENCE_LENGTH_TICKS` is 33,600, which is past both boundaries.
    expect(sentence, 'this case needs a sentence that outlasts both boundaries; seed 535 draws 163,200').toBeGreaterThan(RECREATION_BOUNDARY);

    const grantAt = (tick: number): number => {
      stepTo(runtime, tick);
      return stateIncomeForCompletedDay(runtime.prisoners);
    };

    // Days 1 to 4: one occupied place, every need still served, full rate.
    expect(grantAt(2_399)).toBe(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);
    expect(grantAt(9_599)).toBe(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);

    // Day 5: `hygiene` has fallen through the threshold, and day 6:
    // `recreation` follows.
    //
    // **These two assertions read 260 and 220 until the owner's ruling of
    // 2026-09-03** -- *"usuń na razie kary, zobaczymy jak pogram i ocenię
    // łatwość"* -- which set
    // `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` to `0`. What this
    // file measures is that the *prisoner is still there* when those boundaries
    // arrive, which is decision 5's whole point and is unchanged; the unmet
    // counts below are that measurement and they still read 1 and 2. So each
    // boundary now asserts both figures: the flat rate the state pays today,
    // and what the same measured count costs at ADR 0064's own rate, written
    // as literals -- 300 less 40, then less 80 -- and not as
    // `RATE - WITHHELD`, which would hold for any pair of numbers.
    const unmetAt = (): number => unmetNeedCount(runtime.prisoners.needs, runtime.prisoners.entityStore.getIndex(entityId));

    expect(grantAt(HYGIENE_BOUNDARY)).toBe(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);
    expect(unmetAt()).toBe(1);
    expect(stateIncomeForPrisonerDayAt(40, unmetAt())).toBe(260);

    expect(grantAt(RECREATION_BOUNDARY)).toBe(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);
    expect(unmetAt()).toBe(2);
    expect(stateIncomeForPrisonerDayAt(40, unmetAt())).toBe(220);
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
