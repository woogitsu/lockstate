import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { isNeedUnmetForStateIncome, STATE_INCOME_UNMET_NEED_LEVEL, unmetNeedCount } from '../../src/simulation/economy/income';
import { projectPrisonerDetail, projectPrisonerRoster } from '../../src/simulation/presentation';
import { toBoundedValue } from '../../src/simulation/presentation/view-model';
import { NEED_IDS, NEED_MAX } from '../../src/simulation/prisoners/needs';
import {
  NEED_BAR_MAX_PERMILLE,
  describePrisonerNeed,
  formatNeedValueText,
} from '../../src/ui/hud';
import type { HudPrisonerRowViewModel } from '../../src/ui/hud';
import { filledSegments } from '../../src/ui/primitives/segmented-bar';
import { buildDeterminismScenario, SCENARIO_SEED } from '../helpers/determinism-scenario';

/**
 * The Regime roster's worst-need bar (issue #535, decision 6).
 *
 * ## Why this file is a `node` test and what it can therefore reach
 *
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so
 * `createRegimePanel` -- which touches `document` on its first line -- is
 * unreachable from `pnpm test` *at all*. A rule written inside its
 * `paintRoster` would not merely be untested: a mutation to it would survive
 * because nothing in this suite could observe it. That is the reason
 * `describePrisonerNeed` and `formatNeedValueText` are exported pure functions
 * rather than four lines in the DOM builder, and it is the same reason
 * `describeStaffCoverage` and `describePrisonerRow` are.
 *
 * So the split of the change across the two suites is:
 *
 * - **Here**: which tone the flag produces, how the value speaks, that the bar
 *   the panel drives lights the same segments the projection counted, and that
 *   the projected flag is the *money's* threshold rather than a second copy of
 *   it. All four are decisions, and all four are reachable without a DOM.
 * - **`tests/browser/ui-shell.spec.ts`**: that the panel puts those on screen
 *   and into `data-` attributes, and that four rows still fit. Only a browser
 *   can answer either, and CI's `browser` job is the arbiter for both.
 */

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

/**
 * A HUD row carrying one need, with everything the tone rule does not read left
 * at a fixed value.
 *
 * Built as a literal against the real interface rather than cast, so a field
 * added to `HudPrisonerNeedViewModel` fails the compiler here instead of
 * arriving as a runtime `undefined` -- which is exactly how the roster
 * fixture in `tests/unit/ui-simulation-prisoner-roster.test.ts` let this
 * change through silently until its own `toEqual` caught it.
 */
function rowWithNeed(permille: number, unmetForStateIncome: boolean): HudPrisonerRowViewModel {
  return {
    entityId: 1,
    activityLabelKey: 'action-phase.idle.name',
    travelling: false,
    standingLabelKey: 'risk-tier.1.name',
    lowestNeed: { needId: 'hunger', labelKey: 'need.hunger.name', permille, unmetForStateIncome },
  };
}

describe('the bar is toned by the state grant line and by nothing else', () => {
  /**
   * The whole tone rule, both directions, at the same fullness.
   *
   * `permille` is held identical across the pair on purpose: it is the only
   * other field on the need, so a rule that had accidentally been written
   * against the *level* rather than the flag would pass one of these and fail
   * the other only by luck. Holding it constant makes the flag the sole
   * difference between the two cases.
   */
  it('warns exactly when the state is withholding for this need', () => {
    expect(describePrisonerNeed(rowWithNeed(200, true)).tone).toBe('warning');
    expect(describePrisonerNeed(rowWithNeed(200, false)).tone).toBe('neutral');
  });

  /**
   * `warning`, never `danger`, at any depth -- including a need that has hit
   * the floor.
   *
   * This is the assertion that holds the line `docs/HUD_PROJECTIONS.md` gap 7
   * draws and `AGENTS.md`'s fourth exclusion protects. `danger` would be the
   * panel claiming the simulation calls this critical, and nothing in the
   * simulation does: `STATE_INCOME_UNMET_NEED_LEVEL`'s own comment says it is
   * "a floor and not a warning line" and that the player-facing threshold "is
   * the owner's". A future edit that reaches for a second, deeper band would
   * be inventing that threshold, and this fails on it.
   */
  it('never escalates past warning, however empty the need is', () => {
    for (const permille of [0, 1, 100, 200]) {
      expect(describePrisonerNeed(rowWithNeed(permille, true)).tone).toBe('warning');
    }
  });

  /** The word and the figure are carried, not recomputed: the panel renders what it was told. */
  it('carries the need word and its per-mille through unchanged', () => {
    const readout = describePrisonerNeed(rowWithNeed(437, false));
    expect(readout.labelKey).toBe('need.hunger.name');
    expect(readout.permille).toBe(437);
    expect(localizer.format(readout.labelKey)).toBe('Hunger');
  });
});

describe('the spoken value is a formatted number and not a new sentence', () => {
  /**
   * The three ends of the scale, as the locale writes a percent.
   *
   * `AGENTS.md`'s fourth exclusion forbids new player-facing copy, so this
   * readout authors none: it is `Intl.NumberFormat` in percent style, the same
   * call `status-strip.ts` makes for day progress. Asserting the exact strings
   * is what proves no wrapper sentence crept in around the number.
   */
  it('speaks fullness as a whole percent', () => {
    expect(formatNeedValueText(localizer, 0)).toBe('0%');
    expect(formatNeedValueText(localizer, 200)).toBe('20%');
    expect(formatNeedValueText(localizer, NEED_BAR_MAX_PERMILLE)).toBe('100%');
  });

  /** A bar of ten segments cannot draw a fraction of a percent, so the readout does not speak one. */
  it('rounds rather than offering a precision the bar does not have', () => {
    expect(formatNeedValueText(localizer, 437)).toBe('44%');
  });
});

/**
 * The hazard `toBoundedValue` documents, driven rather than argued.
 *
 * The panel drives the bar with `(permille, 1000)` because the projection
 * deliberately withholds the need's raw level and raw maximum -- exposing them
 * "would guarantee a HUD somewhere hard-codes `255`". But `toBoundedValue`'s
 * own header warns that deriving a fill from `permille` "quantizes twice", and
 * a bar that lit a different number of segments than the projection counted
 * would be that warning coming true.
 *
 * It does not, and this is why the substitution is allowed: every one of the
 * 256 levels a need can hold agrees. Driven over the whole domain rather than
 * over sampled points, which costs nothing here and is the only version of this
 * assertion that could not be defeated by picking the wrong samples -- the
 * shape `tests/unit/segment-fill-agreement.test.ts` uses on the sibling pair.
 */
describe('the bar the panel drives lights what the projection counted', () => {
  it('agrees on every level a need can hold', () => {
    const disagreements: { level: number; projected: number; drawn: number }[] = [];
    for (let level = 0; level <= NEED_MAX; level += 1) {
      const projected = toBoundedValue(level, NEED_MAX);
      const drawn = filledSegments(projected.permille, NEED_BAR_MAX_PERMILLE, projected.segments);
      if (drawn !== projected.filled) disagreements.push({ level, projected: projected.filled, drawn });
    }
    expect(disagreements).toEqual([]);
  });

  /** The scan above is only worth anything if it actually ran over the whole range. */
  it('cannot pass vacuously', () => {
    expect(NEED_MAX).toBe(255);
    expect(toBoundedValue(NEED_MAX, NEED_MAX).filled).toBe(10);
    expect(toBoundedValue(0, NEED_MAX).filled).toBe(0);
    expect(toBoundedValue(1, NEED_MAX).filled).toBe(1);
  });
});

/**
 * That the projected flag is the *money's* threshold and not a second copy.
 *
 * This is the load-bearing claim of the whole change: the bar's tone is allowed
 * to exist because it reports a rule the simulation already acts on. If the
 * projection's comparison and `unmetNeedCount`'s could drift apart, the panel
 * would be showing a threshold nothing charges for -- which is precisely the
 * invented band gap 7 refuses.
 *
 * Driven against a **real session** rather than a fixture, for the reason
 * `tests/unit/hud-projections.test.ts` states in its header: a projection
 * asserted against a fixture proves only that the fixture and the assertion
 * agree.
 */
describe('the projected flag is the same line the treasury is charged against', () => {
  it('marks the worst need unmet exactly when the prisoner has at least one unmet need', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    const rows = projectPrisonerRoster(runtime.prisoners).rows;
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const index = runtime.prisoners.entityStore.getIndex(row.entityId);
      // The equivalence the panel's `data-need-unmet` relies on: no need can be
      // lower than the lowest, so the worst need being unmet is exactly "this
      // prisoner is costing the prison grant income".
      expect(row.lowestNeed.unmetForStateIncome).toBe(unmetNeedCount(runtime.prisoners.needs, index) > 0);
    }
  });

  it('reports every need against the same predicate the count sums', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    const entityId = projectPrisonerRoster(runtime.prisoners).rows[0]!.entityId;
    const detail = projectPrisonerDetail(runtime.prisoners, entityId)!;
    const index = runtime.prisoners.entityStore.getIndex(entityId);

    expect(detail.needs.map((need) => need.needId)).toEqual([...NEED_IDS]);
    for (const need of detail.needs) {
      expect(need.unmetForStateIncome).toBe(isNeedUnmetForStateIncome(runtime.prisoners.needs.get(index, need.needId)));
    }
    expect(detail.needs.filter((need) => need.unmetForStateIncome).length).toBe(
      unmetNeedCount(runtime.prisoners.needs, index),
    );
  });

  /**
   * The boundary, stated as the inclusive comparison it is.
   *
   * `STATE_INCOME_UNMET_NEED_LEVEL` is the level at or **below** which the
   * state withholds, so the level itself is unmet and the next one up is not.
   * A mutation from `<=` to `<` moves the line by exactly one level and is
   * invisible to any test that only checks levels far from it; this is the pair
   * that sees it.
   */
  it('puts the threshold level on the unmet side of its own line', () => {
    expect(isNeedUnmetForStateIncome(STATE_INCOME_UNMET_NEED_LEVEL)).toBe(true);
    expect(isNeedUnmetForStateIncome(STATE_INCOME_UNMET_NEED_LEVEL + 1)).toBe(false);
    expect(isNeedUnmetForStateIncome(0)).toBe(true);
    expect(isNeedUnmetForStateIncome(NEED_MAX)).toBe(false);
  });
});
