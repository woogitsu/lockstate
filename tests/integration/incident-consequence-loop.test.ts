import { describe, expect, it } from 'vitest';
import { projectPrisonerDetail, projectPrisonerPopulationCounts } from '../../src/simulation/presentation/prisoner-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * [ADR 0032](../../docs/adr/0032-incident-consequences-and-classification-review.md):
 * **an incident now costs the prisoner who was in it, and classification is a
 * tier that moves.**
 *
 * Issues #78 and #80 are one seam. #80 records that the incident system, the
 * contraband system, the search system and the confiscation ledger "all
 * terminate in a record nobody reads"; #78 records that `riskTier` "collapses
 * into a binary at the last step, and once assigned it never changes". This
 * file measures the join, on the real path: real commands, the real kernel, the
 * real intake pipeline, the real incident log.
 *
 * ## Why these assertions are red on `origin/main`
 *
 * Every import here exists on `main`, deliberately, so the file compiles there
 * and fails *behaviourally* rather than at the type check. On `main`
 * `PrisonerRecordComponent.riskTier` is written once, at the intake
 * `'classification'` stage, and never again -- so the tier a prisoner holds at
 * tick 96,000 is the tier the screening draw handed them at tick 15, whatever
 * they did in between. The red output is quoted in the pull request.
 *
 * ## What the fixture is, and why it has to be this one
 *
 * A prison with one zoned `room.cell` and one bed in it, which is the smallest
 * prison that can *house* anybody (ADR 0028 phase 1). Housing matters here and
 * is not incidental: a prisoner still waiting at `accommodation-assignment`
 * would be reviewed too, but `ActionSystem` gates on `'completed'`, so the
 * regime half of the consequence would be unobservable and the fixture would
 * be the empty-room trap issue #375 documents.
 */

const SEED = 0x0c0f5e9;
const CELL = 'room.cell';

/** `room.cell`'s authored minimum, and the same rectangle the object-placement loop measures. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
/** The tile `src/main.ts` admits at. */
const ARRIVAL = { x: 16, y: 16 };
/**
 * One press of the Intake panel's control (`ADMISSION_REQUEST` in
 * `src/main.ts`), **with a longer sentence**.
 *
 * The panel asked for 10,000 ticks and this file used to copy that figure. It
 * cannot any more: since #441 a sentence ends, and every case below runs to at
 * least `FIRST_REVIEW_TICK` (23,999) -- three of them to 96,000 -- so the
 * prisoner whose tier is under measurement left the prison long before the
 * review that was supposed to move it, and five cases read tier 0 for a
 * prisoner who no longer existed.
 *
 * 150,000 rather than a round 100,000 for a reason that has to be checked
 * rather than assumed: `classifyPrisoner` adds a point at
 * `LONG_SENTENCE_THRESHOLD_TICKS` (200,000), so any value below that leaves
 * every tier in this file exactly where it was, and 150,000 clears the longest
 * run here (96,000) with room for the review interval to move.
 *
 * That the panel's own figure emptied a cell in about four in-game days was a
 * **balance** question rather than a defect, recorded in ADR 0050's
 * consequences rather than answered by editing `src/main.ts` from a test file.
 * **The owner has since answered it** (#535 decision 5): the panel sends no
 * length at all, and one is drawn per prisoner from `prisoners.sentence` over
 * 2 to 16 in-game days. That does not change this file, whose whole point is
 * that it names its own sentence rather than inheriting one -- but it does
 * retire the question, and the longest drawn sentence (38,400) is still far
 * short of the 96,000 these cases run to, so naming one here is still
 * required.
 */
const ADMISSION = { sentenceLengthTicks: 150_000, priorIncidents: 0 };

/**
 * `CLASSIFICATION_REVIEW_INTERVAL_TICKS`, written out rather than imported.
 *
 * A fixture that read the constant out of the module under test would still
 * pass if the constant were changed to 1 or to a million, which is the class of
 * fixture issue #375 found three of. This number is the assertion; if the
 * simulation's interval moves, this line has to move with it and a reviewer has
 * to see both.
 */
const REVIEW_INTERVAL = 24_000;
/**
 * The tick the first review that can *reach* this prisoner runs on.
 *
 * The system fires on the last tick of every review period
 * (`phaseTicks: interval - 1`), and a prisoner is only due once they have
 * served a full period since their classification. This arrival is classified
 * around tick 15, so the fire at 23,999 finds them 24,000-15 ticks short and
 * skips them; the fire at 47,999 is the first one they are due at. That is the
 * end of the first review period they served in its entirety, which is the rule
 * rather than an off-by-one.
 */
const FIRST_REVIEW_TICK = 2 * REVIEW_INTERVAL - 1;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** A prison with one furnished cell and one prisoner housed in it. */
function housedPrisoner(seed = SEED): { readonly runtime: SimulationRuntime; readonly entityId: number } {
  const runtime = createNewSimulationRuntime(seed);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  // The bed is standing by tick 150 (100 ticks of delivery delay plus three
  // progress ticks on a ten-tick schedule); 200 is the same margin
  // `furnished-cell-loop.test.ts` admits after.
  stepTo(runtime, 200);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  stepTo(runtime, 300);
  const entityId = runtime.prisoners.entityStore.getIdByIndex(0);
  return { runtime, entityId };
}

function tierOf(runtime: SimulationRuntime, entityId: number): number {
  return runtime.prisoners.records.riskTier[runtime.prisoners.entityStore.getIndex(entityId)]!;
}

/**
 * A riot that ran its course, with this prisoner recorded as a participant.
 *
 * Opened and lapsed through `IncidentLog`'s own API rather than by provoking
 * `IncidentTriggerSystem`: a trigger needs a watched sector, a risk sample over
 * its threshold and prisoners standing on the sector's post tile, none of which
 * is what this file is measuring. What reaches the classification review is the
 * *record*, and this is the record the response system writes when nobody
 * contains an incident in time (`IncidentResponseSystem.lapse`).
 */
function lapsedRiot(runtime: SimulationRuntime, entityId: number, id: string, startedAtTick: number): void {
  runtime.incidents.open(
    { id, type: 'riot', sectorId: 'sector.wing-a', participantIds: [entityId], severity: 6, causeFactors: [{ kind: 'needs-pressure', value: 0.8 }] },
    startedAtTick,
  );
  runtime.incidents.transition(id, 'lapsed', startedAtTick + 50, {
    injuredEntityIds: [entityId],
    propertyDamage: 6,
    escaped: false,
  });
}

describe('an incident has a consequence for the prisoner who was in it', () => {
  it('raises a housed prisoner to the top tier and onto the high-risk regime at the next review', () => {
    const { runtime, entityId } = housedPrisoner();

    // The tier the screening draw handed them. On `main` this is also the tier
    // they hold for the rest of the session, whatever happens.
    const tierAtIntake = tierOf(runtime, entityId);
    expect(runtime.prisoners.records.intakeStage[runtime.prisoners.entityStore.getIndex(entityId)]).toBe(4); // 'completed'

    // A riot, lapsed, at tick 30,000: worth `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE.riot`
    // (2) plus `LAPSED_INCIDENT_SURCHARGE_POINTS` (1) = 3 points, which is the
    // findings term's cap.
    stepTo(runtime, 30_000);
    lapsedRiot(runtime, entityId, 'incident-riot-1', 30_000);

    // Not yet: the record exists, and nothing consults it until a review.
    expect(tierOf(runtime, entityId)).toBe(tierAtIntake);

    stepTo(runtime, FIRST_REVIEW_TICK + 1);

    // 0 (sentence below `LONG_SENTENCE_THRESHOLD_TICKS`) + 0 (no priors)
    // + 3 (findings, capped) - 0 (the
    // finding is 17,949 ticks old, less than one credit period) = 3.
    expect(tierOf(runtime, entityId)).toBe(3);
    const detail = projectPrisonerDetail(runtime.prisoners, entityId);
    expect(detail?.riskTier).toBe(3);
    expect(detail?.classificationGroupId).toBe('high-risk');

    // The figure `projectStatusStrip` publishes on the status-counts channel
    // every frame. Before this change it could only ever move on an admission.
    expect(projectPrisonerPopulationCounts(runtime.prisoners).byClassificationGroupId).toEqual([
      { classificationGroupId: 'general-population', count: 0 },
      { classificationGroupId: 'high-risk', count: 1 },
    ]);
  });

  it('puts that prisoner on a different timetable, and their day measurably changes shape', () => {
    // The regime is the reachable half of the consequence, and it is the half a
    // player watches. `ActionSystem` reads `classificationGroupIndex` on every
    // reconsideration and resolves a `RegimeSchedule` from it, so a tier that
    // moves moves the prisoner's whole day: general-population's timetable runs
    // sleep, meals, work/education, recreation and free association in ten
    // blocks, and high-risk's confines them to sleep/meal/hygiene for 2,200 of
    // the day's 2,400 ticks.
    //
    // Measured on need levels rather than on which action is selected at one
    // instant, because that is where the difference actually shows up. Two
    // identical prisons, identical seed, identical commands; the only difference
    // is one riot record, and it is a record neither prison reads until the
    // review at 47,999.
    const withIncident = housedPrisoner();
    const clean = housedPrisoner();
    lapsedRiot(withIncident.runtime, withIncident.entityId, 'incident-riot-1', 30_000);

    const needs = (run: { readonly runtime: SimulationRuntime; readonly entityId: number }): readonly number[] =>
      (projectPrisonerDetail(run.runtime.prisoners, run.entityId)?.needs ?? []).map((need) => need.level.permille);

    // The control. Before the review the two sessions are the same session, and
    // this is what makes the divergence below attributable to the
    // reclassification and to nothing else in the fixture.
    stepTo(withIncident.runtime, 40_000);
    stepTo(clean.runtime, 40_000);
    expect(needs(withIncident)).toEqual(needs(clean));

    stepTo(withIncident.runtime, 70_000);
    stepTo(clean.runtime, 70_000);

    expect(projectPrisonerDetail(withIncident.runtime.prisoners, withIncident.entityId)?.classificationGroupId).toBe('high-risk');
    expect(projectPrisonerDetail(clean.runtime.prisoners, clean.entityId)?.classificationGroupId).toBe('general-population');

    /*
     * `NEED_IDS` order: hunger, sleep, hygiene, bladder, safety, recreation.
     * Measured at tick 70,000: the reclassified prisoner reads
     * **[973, 1000, 0, 965, 0, 0]** and the clean one
     * **[867, 1000, 0, 847, 0, 0]**.
     *
     * **The fifth entry was 1,000 for both until issue #588**, and it is now 0
     * for both. `safety` is provisioned by guard coverage since the owner's
     * ruling on issue #599; this fixture hires nobody, so an `unguarded` sector
     * provisions nothing and the need falls to the floor in both arms. It is
     * pinned below beside `hygiene` and `recreation` for exactly that reason --
     * a need neither timetable can serve must not be where the divergence
     * comes from.
     *
     * **This block used to read [0, 0, 0, 369, 141, 0] against
     * [0, 1000, 0, 86, 1000, 0], and asserted `hardSleep === 0` as the
     * mechanic: "a prisoner on the restricted timetable stops resting and stops
     * feeling safe". That was not the timetable. It was
     * [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)'s
     * defect, read as a consequence.** The high-risk regime allows `meal` for
     * 2,200 of the day's 2,400 ticks, and `action.eat-meal` outscores every
     * other legal candidate at a large hunger deficit -- so with no canteen in
     * this prison the reclassified prisoner selected it on essentially every
     * reconsideration, failed to resolve it, and did **nothing at all** for
     * 2,200 ticks a day. Sleep at zero was not a prisoner kept awake; it was a
     * prisoner who never started a single action. The clean prisoner scored
     * better only because the general-population day has two blocks in which
     * `sleep` is the *only* legal category, where no meal could crowd it out.
     *
     * With the fallback the direction reverses, and the honest reading is that
     * on this prison the restricted timetable is not a punishment on any need
     * this prison can serve: it is 2,200 ticks a day of categories a bed and a
     * cell can answer, against a general-population day that spends about 1,000
     * ticks in `work`/`education` and `recreation` blocks where nothing in
     * `DEFAULT_ACTIONS` resolves at all. That is a statement about the content
     * catalogue rather than about this mechanism, and it is asserted rather
     * than argued -- ADR 0032's consequence is the *tier* and the *timetable*,
     * both of which are pinned above, and neither of which depends on which
     * way the need levels fall.
     */
    const [hardHunger, hardSleep, hardHygiene, hardBladder, hardSafety, hardRecreation] = needs(withIncident);
    const [cleanHunger, cleanSleep, , cleanBladder] = needs(clean);

    // The two days really did diverge, which is the claim the tier exists to
    // make. Two independently built sessions, so nothing here compares a
    // fixture with itself.
    expect(needs(withIncident)).not.toEqual(needs(clean));

    // The restricted timetable spends more of the day in categories this prison
    // can answer, so the two needs a cell serves end higher, not lower.
    expect(hardHunger!).toBeGreaterThan(cleanHunger!);
    expect(hardBladder!).toBeGreaterThan(cleanBladder!);
    // And both rest fully: the fixture's cell has a bed, and `action.sleep`
    // resolves through `own-accommodation` on either timetable.
    expect(hardSleep).toBe(1_000);
    expect(cleanSleep).toBe(1_000);
    // Neither prisoner can reach hygiene or recreation at all: this prison
    // zones no shower room, no yard and no common room, and no action targeting
    // those has an `own-accommodation` sibling to fall back to (ADR 0041
    // alternative A says so, and this is that sentence measured). Pinned so the
    // divergence above cannot be credited to a need neither prisoner can serve.
    expect(hardHygiene).toBe(0);
    expect(hardRecreation).toBe(0);
    /*
     * **`safety` joined those two with issue #588, and it used to sit with
     * `sleep` above at 1,000.** It was full because `action.sleep` carried
     * `safety: 0.2` -- a bed kept a prisoner safe. Under the owner's ruling on
     * issue #599 the provisioner is guard coverage, this fixture hires nobody,
     * and an `unguarded` sector provisions nothing -- so the need falls at 0.05
     * a tick with nothing opposing it and reaches the floor inside the window.
     *
     * It is pinned here for the same reason hygiene and recreation are: a need
     * neither timetable can serve must not be where the divergence above comes
     * from. Hiring a guard would put it back at 1,000 and would change nothing
     * else this file asserts; it is left unhired because an unguarded prison is
     * what a fixture about incidents should be.
     */
    expect(hardSafety).toBe(0);
  });

  it('brings them back down as clean time accrues, so the loop does not only ratchet one way', () => {
    const { runtime, entityId } = housedPrisoner();
    stepTo(runtime, 30_000);
    lapsedRiot(runtime, entityId, 'incident-riot-1', 30_000);

    stepTo(runtime, FIRST_REVIEW_TICK + 1);
    expect(tierOf(runtime, entityId)).toBe(3);

    // One credit period (24,000 ticks) after the finding: 3 - 1 = 2.
    stepTo(runtime, FIRST_REVIEW_TICK + REVIEW_INTERVAL + 1);
    expect(tierOf(runtime, entityId)).toBe(2);
    expect(projectPrisonerDetail(runtime.prisoners, entityId)?.classificationGroupId).toBe('general-population');

    // Two credit periods, which is `MAX_CLEAN_CONDUCT_CREDIT`: 3 - 2 = 1.
    stepTo(runtime, FIRST_REVIEW_TICK + 2 * REVIEW_INTERVAL + 1);
    expect(tierOf(runtime, entityId)).toBe(1);

    // And no further: the credit is capped, so a single riot leaves a
    // permanent floor of one tier above a prisoner who never had one.
    stepTo(runtime, FIRST_REVIEW_TICK + 3 * REVIEW_INTERVAL + 1);
    expect(tierOf(runtime, entityId)).toBe(1);
  });

  it('reaches the same tier through a contraband find as through an incident, at three finds', () => {
    const { runtime, entityId } = housedPrisoner();
    stepTo(runtime, 30_000);

    // `ConfiscationLedger` already names the holder; nothing read it. Three
    // items on one prisoner is `CONFISCATION_FINDING_POINTS` (1) three times,
    // which is the findings cap -- so a prisoner who keeps being caught
    // holding gets where a rioter gets, more slowly.
    for (let item = 0; item < 3; item += 1) {
      runtime.confiscations.record({
        itemId: `contraband-${item}`,
        categoryId: 'contraband.weapon-improvised',
        provenance: { sourceType: 'delivery', sourceId: 'delivery-1', introducedAtTick: 1_000 },
        foundAtHolder: { kind: 'prisoner', id: String(entityId) },
        searchOrderId: 'search-1',
        foundByGuardId: 0,
        tick: 30_000,
      });
    }

    stepTo(runtime, FIRST_REVIEW_TICK + 1);
    expect(tierOf(runtime, entityId)).toBe(3);
  });

  /**
   * A negative-space assertion, and one that has to be built carefully to be
   * worth anything.
   *
   * A cell stash has no owner in the model and splitting it across the
   * occupants would invent one, so it is deliberately not a finding. The
   * obvious fixture -- a realistic cell holder id like `room.cell:4:6` -- pins
   * nothing, because such an id is kept out twice over: by the holder-kind
   * check *and* by `Number('room.cell:4:6')` being `NaN`. Deleting the kind
   * check would leave it green. So both fixtures run: the realistic id, and a
   * numerically-parseable cell id that only the kind check can stop. That
   * second one is the tripwire; the first is the shape a real session produces.
   */
  it.each([
    ['a realistic cell instance id', `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`],
    ['a cell id that would parse as an entity id', null],
  ])('leaves a stash found in a cell charged to nobody (%s)', (_label, cellId) => {
    const { runtime, entityId } = housedPrisoner();
    stepTo(runtime, 30_000);

    for (let item = 0; item < 3; item += 1) {
      runtime.confiscations.record({
        itemId: `contraband-${item}`,
        categoryId: 'contraband.weapon-improvised',
        provenance: { sourceType: 'delivery', sourceId: 'delivery-1', introducedAtTick: 1_000 },
        foundAtHolder: { kind: 'cell', id: cellId ?? String(entityId) },
        searchOrderId: 'search-1',
        foundByGuardId: 0,
        tick: 30_000,
      });
    }

    stepTo(runtime, FIRST_REVIEW_TICK + 1);
    // Clean: 0 + 0 + 0 - 2 = -2, clamped to the floor.
    expect(tierOf(runtime, entityId)).toBe(0);
  });
});

describe('a reviewed classification is deterministic', () => {
  it('reaches the same tier twice from one seed', () => {
    const runs = [0, 1].map(() => {
      const { runtime, entityId } = housedPrisoner();
      stepTo(runtime, 30_000);
      lapsedRiot(runtime, entityId, 'incident-riot-1', 30_000);
      stepTo(runtime, FIRST_REVIEW_TICK + 1);
      return { tier: tierOf(runtime, entityId), group: projectPrisonerDetail(runtime.prisoners, entityId)?.classificationGroupId };
    });
    expect(runs[1]).toEqual(runs[0]);
  });

  it('reaches the same tier across a save taken before the review as one taken after it', () => {
    // The property that makes ADR 0032 decision 1 sound. A disciplinary record
    // is *derived* from the incident log and the confiscation ledger, both of
    // which the save already carries -- so a restore reproduces the record
    // rather than remembering it, and a review that runs after the restore
    // reaches the answer the uninterrupted session reaches. If the record were
    // accumulated into per-prisoner state instead, this is the assertion that
    // would need a schema version to hold.
    const uninterrupted = housedPrisoner();
    stepTo(uninterrupted.runtime, 30_000);
    lapsedRiot(uninterrupted.runtime, uninterrupted.entityId, 'incident-riot-1', 30_000);
    stepTo(uninterrupted.runtime, FIRST_REVIEW_TICK + 1);

    const saved = housedPrisoner();
    stepTo(saved.runtime, 30_000);
    lapsedRiot(saved.runtime, saved.entityId, 'incident-riot-1', 30_000);
    // Saved at 40,000: after the finding, before the review that reads it.
    stepTo(saved.runtime, 40_000);
    const bundle: SessionSnapshotBundle = captureSessionSnapshot(saved.runtime);
    const restored = restoreSimulationRuntime(bundle, SEED).runtime;
    stepTo(restored, FIRST_REVIEW_TICK + 1);

    const restoredEntityId = restored.prisoners.entityStore.getIdByIndex(0);
    expect(tierOf(restored, restoredEntityId)).toBe(tierOf(uninterrupted.runtime, uninterrupted.entityId));
    expect(tierOf(restored, restoredEntityId)).toBe(3);
  });
});
