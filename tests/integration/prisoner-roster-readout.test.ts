import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { projectPrisonerRoster } from '../../src/simulation/presentation/prisoner-projection';
import { projectStatusStrip } from '../../src/simulation/presentation/status-strip-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  PRISONER_ROSTER_ROW_LIMIT,
  describePrisonerRow,
  formatPrisonerActivity,
  formatPrisonerName,
  formatRegimeAllowsText,
  type HudPrisonerRowViewModel,
} from '../../src/ui/hud';
import { prisonerRosterFromProjection } from '../../src/ui/simulation-prisoner-roster';
import { regimeFromProjection } from '../../src/ui/simulation-regime';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A prisoner, from the prison that produces them to the words a player
 * reads** (issue #451).
 *
 * ## Why this is not a unit test
 *
 * Issue #451's own weakest claim is the thing this file exists to settle:
 *
 * > That the prisoner projections are shaped for a player-facing panel rather
 * > than a debug reader. Their catalog entries were read; their payload shapes
 * > were not read in detail. If they turn out to be debug-shaped, this becomes
 * > a projection change too.
 *
 * That cannot be answered by a fixture, because a fixture is written by
 * whoever is answering it. So this file starts at `createNewSimulationRuntime`,
 * builds a prison through the same commands a player presses, and ends at the
 * sentences the Regime panel would put on screen -- resolved through the real
 * bundled `en` catalog. Everything between them is production code.
 *
 * ## What it establishes
 *
 * 1. **Every state the roster can render is reachable in a prison a player can
 *    build.** Measured over one in-game day of a two-cell prison with a yard:
 *    idle, and each of sleep, eat-in-cell, use-toilet and yard-recreation in
 *    both the travelling and the performing phase.
 * 2. **Two prisoners on two timetables read differently at the same tick.**
 *    That is #450's consequence chain arriving on screen: a classification
 *    decides a regime, a regime decides what `ActionSystem` may select, and the
 *    roster says both.
 * 3. **Nothing it renders is an id.** Every key the two mappings produce
 *    resolves to real text, with no placeholder left unfilled.
 *
 * ## What it deliberately does not assert
 *
 * That a *reclassification* happens. `ClassificationReviewSystem` reassesses on
 * a 24,000-tick interval from disciplinary evidence an incident writes, and
 * reproducing one here would be a 24,000-step run whose outcome depends on a
 * riot arriving -- which the staffing readout's own integration test measured
 * as seed-dependent and declined to pin for the same reason. The two prisoners
 * below are separated by their *intake* classification instead, which is the
 * same two slots on the same component (`classificationGroupIndex` and
 * `riskTier`) read by the same projection, reached by a command a player sends.
 * What a review changes is which value is in those slots; what this file
 * proves is that the panel says it when they change.
 */

/** Distinct from every other seed in the suite, so a shared fixture cannot make these figures true by accident. */
const SEED = 0x451;

/** `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, written out -- the tile an admission arrives at. */
const ORIGIN = { x: 16, y: 16 } as const;

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
const t = (key: string, parameters?: Readonly<Record<string, string | number | boolean>>): string =>
  parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function zoneCell(runtime: SimulationRuntime, index: number): void {
  const rect = { x: 4 + index * 3, y: 6, width: 2, height: 3 };
  wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  submit(runtime, `zone-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect }));
  submit(
    runtime,
    `bed-${String(index)}`,
    packCommand({ type: 'PlaceObject', orderId: `bed-${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }),
  );
}

/** Cells with beds, built and furnished through the real command path, so every arrival is housed. */
function cellBlock(cells: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 120 }));
  for (let index = 0; index < cells; index += 1) zoneCell(runtime, index);
  // 100 ticks of delivery delay plus build progress; 400 is the margin the
  // other integration fixtures in this suite admit after.
  stepTo(runtime, 400);
  return runtime;
}

/**
 * Two arrivals the intake screening puts in different classification groups.
 *
 * The separation is `priorIncidents`, which is a field of the `AdmitPrisoner`
 * command: `classifyPrisoner` scores a long sentence at 1 and prior incidents
 * at up to 2, then adds a screening variance of -1, 0 or +1 from the
 * `prisoners.classification` stream. So an arrival with no record cannot reach
 * tier 3 and one with a record of 5 and a long sentence can. Which of the two
 * outcomes the variance produces is seed-dependent, which is why the seed is
 * pinned and the resulting tiers are asserted rather than assumed.
 */
function twoClassifications(runtime: SimulationRuntime): void {
  submit(runtime, 'admit-1', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ORIGIN }));
  submit(runtime, 'admit-2', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 250_000, priorIncidents: 5, ...ORIGIN }));
}

/** What the panel would be handed, through the two production modules that decide it. */
function roster(runtime: SimulationRuntime) {
  return prisonerRosterFromProjection(
    projectPrisonerRoster(runtime.prisoners, { limit: PRISONER_ROSTER_ROW_LIMIT }, { identity: runtime.actorIdentity }),
  );
}

/**
 * The two rows `twoClassifications` produces, **found by their classification
 * group rather than by their position in the window**.
 *
 * The three cases below destructured `const [ordinary, restricted] = rows`
 * until 2026-08-31, which read the roster in arrival order and was correct
 * while that was the order. Issue #703's fourth ruling made the order highest
 * risk tier first, so the restricted prisoner is now row 0 and all three cases
 * failed on a position none of them meant to assert -- the same failure
 * `ui-hud-projection.test.ts` records for `coverage` landing third, with the
 * same fix: address the thing by its id and pin the order in exactly one place.
 *
 * That one place is `hud-projections.test.ts`'s *"lists every live prisoner by
 * descending tier then ascending id"*, and the sort is exercised here too, by
 * the assertion below that the restricted row really does come first.
 */
function twoRows(runtime: SimulationRuntime): {
  readonly ordinary: HudPrisonerRowViewModel;
  readonly restricted: HudPrisonerRowViewModel;
} {
  const rows = roster(runtime).rows;
  expect(rows).toHaveLength(2);
  const ordinary = rows.find((row) => row.classificationGroupId === 'general-population');
  const restricted = rows.find((row) => row.classificationGroupId === 'high-risk');
  expect(ordinary, 'no general-population row in the window').toBeDefined();
  expect(restricted, 'no high-risk row in the window').toBeDefined();
  // And the ruling itself, on the two rows this fixture makes: the tier-3
  // prisoner is the one the four-row window shows first.
  expect(rows[0]?.classificationGroupId).toBe('high-risk');
  return { ordinary: ordinary!, restricted: restricted! };
}

function regime(runtime: SimulationRuntime) {
  return regimeFromProjection(
    projectStatusStrip({
      tick: runtime.kernel.tick,
      prisoners: runtime.prisoners,
      rooms: runtime.prisoners,
      staff: runtime.securityGuards,
      incidents: runtime.incidents,
      searchSystem: runtime.searchSystem,
      treasury: runtime.treasury,
    }),
  );
}

describe('every row the panel can draw is a row a real prison produces', () => {
  it('reaches idle, four actions and both phases inside one in-game day', () => {
    // A yard as well as cells, because a `room-catalog-id` action needs the
    // room zoned before `ActionSystem` can resolve a target at all -- and a
    // prisoner who never leaves their cell never travels, so a cells-only
    // prison could not show that half of the readout.
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 120 }));
    zoneCell(runtime, 0);
    zoneCell(runtime, 1);
    const yard = { x: 14, y: 6, width: 8, height: 8 };
    wallRoomPerimeter(runtime.world, yard, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...yard }));
    stepTo(runtime, 400);
    submit(runtime, 'admit-1', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ORIGIN }));

    const seen = new Set<string>();
    // `DAY_LENGTH_TICKS` is 2,400 and the admission lands after 400, so this is
    // one full day of that prisoner's life sampled every five ticks -- a
    // quarter of `ActionSystem`'s twenty-tick reconsideration interval, so no
    // selection can pass between two samples.
    for (let tick = runtime.kernel.tick; tick <= 2_800; tick += 5) {
      stepTo(runtime, tick);
      for (const row of roster(runtime).rows) seen.add(`${row.activityLabelKey}|${String(row.travelling)}`);
    }

    /*
     * Written out rather than collected into a set the test also builds: these
     * are the eleven states this build reaches, and a reviewer has to see the
     * list change if the action catalogue or the regime does. The one
     * performing-only entry is `action-phase.idle`, which is not a place a
     * prisoner walks to.
     *
     * **Nine since ADR 0059; eleven before it, and nine before
     * [ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md).**
     * The two new rows are `action.free-association`, which this prison now
     * reaches during the two `work`/`education` blocks -- 1,000 ticks a day
     * that used to read `action-phase.idle` because the block's own categories
     * are served only by actions naming a classroom or a laundry, and this
     * prison has a cell and a yard. `|true` appears for it because a prisoner
     * whose cell is not the tile they are standing on walks back to it, which
     * is a real journey the panel draws.
     */
    /*
     * **Nine since [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md),
     * eleven before it, and the two that left are the two that could.** They
     * were `action.free-association.name|true` and `action.sleep.name|true`.
     * Both actions target the prisoner's **own cell**, and both blocks that
     * allow them follow a block the prisoner has already walked home for -- so
     * once walking took time and the prisoner stopped being written onto room
     * anchors from wherever they stood, they are already standing on the cell
     * anchor when either block opens and the journey never happens. Checked
     * over three in-game days rather than one before this list was shortened:
     * the two rows never appear.
     *
     * The panel's ability to draw a journey is untouched and is still pinned by
     * the three `|true` rows that remain, one of which -- `eat-in-cell` -- is
     * an own-accommodation action too, which is what says the disappearance is
     * about *where the prisoner already is* rather than about own-accommodation
     * actions never being walked to.
     */
    expect([...seen].sort()).toEqual([
      'action-phase.idle.name|false',
      'action.eat-in-cell.name|false',
      'action.eat-in-cell.name|true',
      'action.free-association.name|false',
      'action.sleep.name|false',
      'action.use-toilet.name|false',
      'action.use-toilet.name|true',
      'action.yard-recreation.name|false',
      'action.yard-recreation.name|true',
    ]);

    // And every one of them is a word rather than an id.
    for (const entry of seen) {
      const key = entry.split('|')[0]!;
      const text = t(key);
      expect(text, key).not.toBe(key);
      expect(text).not.toContain('{');
    }
  });
});

describe('two prisoners on two timetables read differently at the same tick', () => {
  it('separates them by group, by standing word and by badge tone', () => {
    const runtime = cellBlock(4);
    twoClassifications(runtime);
    // Tick 1,100 is inside general population's 1,000..1,200 recreation block
    // and inside high risk's 0..2,000 confinement block, so the two schedules
    // permit disjoint things at this instant.
    stepTo(runtime, 1_100);

    const { ordinary, restricted } = twoRows(runtime);

    expect(ordinary.classificationGroupId).toBe('general-population');
    expect(ordinary.riskTier).toBe(1);
    expect(ordinary.standingLabelKey).toBe('risk-tier.1.name');
    expect(describePrisonerRow(ordinary).tone).toBe('neutral');

    expect(restricted.classificationGroupId).toBe('high-risk');
    expect(restricted.riskTier).toBe(3);
    expect(restricted.standingLabelKey).toBe('risk-tier.3.name');
    expect(describePrisonerRow(restricted).tone).toBe('warning');
  });

  it('separates them by what they are doing, which is the regime deciding it', () => {
    const runtime = cellBlock(4);
    twoClassifications(runtime);
    stepTo(runtime, 1_100);

    const { ordinary, restricted } = twoRows(runtime);
    // The invariant, first: `sleep` is not a category general population's
    // block allows at this tick, so no reconsideration can select a sleep
    // action for them -- while high risk's block allows nothing else all day.
    const blocks = regime(runtime);
    const allowed = (groupId: string): readonly string[] =>
      blocks.groups.find((group) => group.classificationGroupId === groupId)?.allowedCategoryLabelKeys ?? [];
    // Two labels, not one, since ADR 0054 added `'free-association'` to this
    // block: a `recreation`-only block resolves nothing in a prison with no
    // yard and no common room. The invariant this line is here for is
    // unchanged -- `sleep` is still not among them.
    expect(allowed('general-population')).toEqual([
      'action-category.recreation.name',
      'action-category.free-association.name',
    ]);
    expect(allowed('high-risk')).toEqual([
      'action-category.sleep.name',
      'action-category.meal.name',
      'action-category.hygiene.name',
    ]);

    // And then what the two prisoners are actually doing, measured on this
    // build rather than inferred from the block: the confined one is asleep,
    // and the other is not.
    expect(restricted.activityLabelKey).toBe('action.sleep.name');
    expect(ordinary.activityLabelKey).not.toBe(restricted.activityLabelKey);
  });

  it('renders both rows as sentences from the bundled catalog', () => {
    const runtime = cellBlock(4);
    twoClassifications(runtime);
    stepTo(runtime, 1_100);

    const { ordinary, restricted } = twoRows(runtime);
    for (const row of [ordinary, restricted]) {
      const name = formatPrisonerName(t, row);
      const activity = formatPrisonerActivity(t, row);
      const badge = t(describePrisonerRow(row).badgeKey);
      for (const text of [name, activity, badge]) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toContain('{');
        expect(text).not.toContain('.name');
      }
      // A name is state rather than a translation (ADR 0015), and the two
      // halves arrive separately -- so the rendered row must contain both, in
      // whatever order this locale puts them.
      expect(name).toContain(row.name!.givenName);
      expect(name).toContain(row.name!.familyName);
    }

    // The one place a tier word and a group word could disagree: the badge says
    // "High" and the block above says "High Risk", and both are the same
    // prisoner's classification at two grains.
    expect(t(describePrisonerRow(restricted).badgeKey)).toBe('High');
    // And the same key the status strip's `HIGH RISK` chip labels itself with
    // since #703 (`HIGH_RISK_LABEL_KEY` in `src/ui/hud/projection.ts`), which
    // is why that chip needed no new string authored for it.
    expect(t('classification-group.high-risk.name')).toBe('High Risk');
  });

  it('says what each group may do, as a sentence rather than a list of ids', () => {
    const runtime = cellBlock(4);
    twoClassifications(runtime);
    stepTo(runtime, 1_100);

    const blocks = regime(runtime);
    const restricted = blocks.groups.find((group) => group.classificationGroupId === 'high-risk');
    const sentence = formatRegimeAllowsText(t, restricted!);
    expect(sentence).toBe('Allows Sleep, Meal, Hygiene');
    // The share is the projection's own `permille`, rendered rather than
    // recomputed from the tick: 1,100 of high risk's 2,000-tick block.
    expect(restricted?.blockProgressPercent).toBe(55);
  });
});

describe('the roster reports the prison rather than the window', () => {
  it('keeps the true total when there are more prisoners than rows', () => {
    const runtime = cellBlock(4);
    // One more arrival than the panel can draw, so `total` and `rows.length`
    // are different numbers and a mapping that returned the window's length
    // would be visible.
    for (let ordinal = 1; ordinal <= PRISONER_ROSTER_ROW_LIMIT + 1; ordinal += 1) {
      submit(
        runtime,
        `admit-${String(ordinal)}`,
        packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ORIGIN }),
      );
    }
    stepTo(runtime, runtime.kernel.tick + 200);

    const model = roster(runtime);
    expect(model.total).toBe(PRISONER_ROSTER_ROW_LIMIT + 1);
    expect(model.rows).toHaveLength(PRISONER_ROSTER_ROW_LIMIT);
    // Which is the figure the panel prints beside the header, and the sentence
    // it puts under the rows.
    expect(t('hud.regime.roster-count', { shown: model.rows.length, total: model.total })).toBe('4 of 5');
    expect(t('hud.regime.roster-more', { count: model.total - model.rows.length })).toBe('and 1 more');
  });

  it('names an arrival that has no name yet by their id rather than leaving the row blank', () => {
    const runtime = cellBlock(1);
    submit(runtime, 'admit-1', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ORIGIN }));
    // No `stepTo`: a name is minted at the intake pipeline's `reception` stage
    // (ADR 0015), so the tick the admission lands is the one window in which a
    // real prisoner has none. The record already reads `reception` at that
    // tick -- `IntakeSystem` advances the stage on the update the admission
    // lands in and mints the name on the next -- which is measured here rather
    // than assumed, and is why the badge says a stage rather than a tier.
    const [arrival] = roster(runtime).rows;
    expect(arrival?.name).toBeUndefined();
    expect(arrival?.standingLabelKey).toBe('intake-stage.reception.name');
    expect(describePrisonerRow(arrival!).tone).toBe('info');
    expect(formatPrisonerName(t, arrival!)).toBe('Prisoner 0');
  });
});
