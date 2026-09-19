import { describe, expect, it } from 'vitest';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { DEFAULT_LOCALE, resolveLocalizationKey } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import type { MissingMessageReport } from '../../src/services/localization/localizer';
import {
  HUD_MESSAGE_KEY,
  describeDailyWageBill,
  describeHireCharge,
  type HudStaffRoleViewModel,
  type HudStaffRosterViewModel,
} from '../../src/ui/hud';

/**
 * **What the Staff panel says a guard costs** (issue
 * [#639](https://github.com/matmaxalez/lockstate/issues/639) ruling 2, on the
 * measurement in [#636](https://github.com/matmaxalez/lockstate/issues/636)).
 *
 * ## The defect these cases exist for
 *
 * `Hire Guard · 80` was offered with *"Taken from the treasury on hire"*, which
 * reads as a fee paid once. `PayrollSystem` charges the same 80 at **every**
 * in-game day boundary (`src/simulation/economy/payroll.ts`, `schedule` at
 * `DAY_LENGTH_TICKS`). Measured while playing: `25,000 -> 24,920 -> 24,840 ->
 * 24,760`, with `/wage/i`, `/per day/i` and `/daily/i` all false across the
 * whole HUD at every observation. That is `AGENTS.md`'s fourth owner-reserved
 * category -- a player-visible promise the code does not keep -- so the
 * sentence below is the owner's and is asserted verbatim.
 *
 * ## Why these are unit cases and what they cannot reach
 *
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so
 * `createStaffPanel` cannot be called here at all and nothing in this file
 * proves a single element was built. What it proves is the *decision*: which
 * figures the sentence quotes, where each comes from, and when the payroll
 * badge states nothing. That the DOM around them is really assembled, on
 * screen, and not clipped is `tests/browser/ui-staff-wage.spec.ts`.
 *
 * ## The fixture makes the two figures differ, and that is the whole guard
 *
 * The shipped guard is authored `wageBand: { minPerDay: 80 }` and *both*
 * `staffHireCostMinorUnits` and `staffDailyWageMinorUnits` read it, so on real
 * content the hire charge and the daily wage are the same 80. A fixture that
 * copied content would therefore pass against an implementation that rendered
 * `hireChargeMinorUnits` twice and never read the wage at all -- a fixture
 * supplying both sides of the comparison, which `docs/TESTING.md` forbids. So
 * the role below charges 80 to hire and bills 55 a day: numbers no catalogue
 * authors, chosen so that one standing in for the other is a visible failure.
 *
 * ## What was watched going red
 *
 * Three mutations, each restored by hand. Baseline: `10 passed`.
 *
 * | mutation | result |
 * | --- | --- |
 * | `describeHireCharge` returns `hireChargeMinorUnits` for both fields | 2 failed, 8 passed |
 * | `describeDailyWageBill` drops its `roster.hired === 0` branch | 1 failed, 9 passed |
 * | the catalog hard-codes `80` in place of `{wage}` | 2 failed, 8 passed |
 *
 * A fourth, in `src/ui/simulation-counts.ts` -- the passthrough deleted --
 * takes `tests/unit/ui-simulation-counts.test.ts` to `2 failed, 4 passed`.
 */

/** A role whose two figures cannot be mistaken for each other. */
const ROLE: HudStaffRoleViewModel = {
  staffRoleId: 'staff-role.guard',
  labelKey: 'staff-role.guard.name',
  hireChargeMinorUnits: 80,
  dailyWageMinorUnits: 55,
};

function roster(hired: number): HudStaffRosterViewModel {
  return { hired, staff: [] };
}

/** The production localizer over the shipped catalog, with every unfilled placeholder collected. */
function localizerWithReports(): { readonly localizer: Localizer; readonly reports: MissingMessageReport[] } {
  const reports: MissingMessageReport[] = [];
  const localizer = new Localizer({
    locale: DEFAULT_LOCALE,
    catalogs: [defaultMessageCatalogEn],
    onMissingKey: (report) => reports.push(report),
  });
  return { localizer, reports };
}

describe('the hire hint quotes both halves of what a guard costs (#639)', () => {
  it('carries the charge and the wage as two figures, from two fields', () => {
    expect(describeHireCharge(ROLE)).toEqual({ hireChargeMinorUnits: 80, dailyWageMinorUnits: 55 });
  });

  it('quotes nothing when no role is selected, because there is no price to quote', () => {
    // The state the panel starts in when the host publishes no roles: the hire
    // control is disabled, and a sentence reading "Costs 0 now and 0 a day in
    // wages." would be a price this prison does not charge.
    expect(describeHireCharge(undefined)).toBeUndefined();
  });

  it('renders the owner-approved sentence with the role’s own numbers in it', () => {
    const { localizer, reports } = localizerWithReports();
    const charge = describeHireCharge(ROLE);
    expect(charge).toBeDefined();

    const sentence = localizer.format(HUD_MESSAGE_KEY.securityStaffHint, {
      total: localizer.formatNumber(charge?.hireChargeMinorUnits ?? -1),
      wage: localizer.formatNumber(charge?.dailyWageMinorUnits ?? -1),
    });

    // Verbatim, and the wording is not this file's to change: issue #639
    // records it as the owner's approved string. The two numbers are the
    // fixture's, so the assertion fails if either placeholder is filled from
    // the other field.
    /*
     * **Re-ruled by the owner on 2026-09-03, and the sentence it replaced is
     * quoted rather than overwritten** (`docs/AGENT_WORKFLOW.md` §4). It read
     * *"Costs 80 now and 55 a day in wages."* -- ruling #639's own words, and
     * **false on the first press of a new game**: hiring a guard costs two
     * days' wage for the day it happens (`src/simulation/staff/hiring.ts` says
     * so in its own docblock), so day one billed 160 for one guard against a
     * note that read as 80 today and 80 tomorrow (issue #868, measured
     * 25,000 -> 24,920 at the press and -> 24,840 at tick 2,408).
     *
     * Three shapes went to the owner: pro-rate the charge so the old sentence
     * becomes true, replace the sentence, or add the two words that make it
     * true. **They chose the third**, so the mechanic is untouched and this is
     * a wording change only.
     */
    expect(sentence).toBe('Costs 80 now and 55 a day in wages, including today.');
    // The word the payroll block is named for. Stated as its own case because
    // the hint and the `On the payroll` header are meant to name one category,
    // and a reworded hint that dropped it would break that pairing silently.
    expect(sentence).toMatch(/wages/);
    // ADR 0011's failure mode: an unfilled placeholder ships as `{wage}` on
    // screen. `onMissingKey` is the production report for it.
    expect(reports).toEqual([]);
  });

  it('fills the same charge into the button beside it, so the two lines cannot disagree', () => {
    const { localizer, reports } = localizerWithReports();
    const charge = describeHireCharge(ROLE);

    const label = localizer.format(HUD_MESSAGE_KEY.securityStaffHire, {
      role: localizer.format('staff-role.guard.name'),
      total: localizer.formatNumber(charge?.hireChargeMinorUnits ?? -1),
    });

    expect(label).toBe('Hire Guard · 80');
    expect(reports).toEqual([]);
  });

  it('leaves the price in one authority: the message carries placeholders, not a number', () => {
    // The reason `{total}` and `{wage}` exist at all. A hard-coded `80` in the
    // catalog would be a second authority on a price -- ADR 0017 decision 5
    // puts prices with #29 -- and a silent one, since moving
    // `wageBand.minPerDay` moves the button, the charge and the payroll and
    // would leave this sentence quoting the old figure.
    const template = resolveLocalizationKey(defaultLocaleEnCatalog, HUD_MESSAGE_KEY.securityStaffHint);
    // Same ruling as above; the placeholders are unchanged and only the tail
    // moved, which is what makes this a wording change rather than a new
    // authority over the price.
    expect(template).toBe('Costs {total} now and {wage} a day in wages, including today.');
    expect(template).not.toMatch(/\d/);
  });
});

describe('the collapsed payroll header states the standing daily bill (#639)', () => {
  it('states the figure the simulation published, not one the HUD summed', () => {
    // 4,800 is issue #636's own prison -- sixty guards at the catalogue's 80 --
    // and it is deliberately unrelated to the fixture roster's `hired`, so a
    // reader that multiplied a headcount by anything lands somewhere else.
    expect(describeDailyWageBill(roster(60), 4_800)).toBe(4_800);
  });

  it('states a published zero, because a payroll that bills nothing is a fact about the prison', () => {
    // Reachable from a save written against a catalogue that has since dropped
    // a role: `dailyWageBillMinorUnits` in `src/simulation/economy/payroll.ts`
    // contributes `0` for a role it cannot price rather than guessing. Somebody
    // is employed and they cost nothing, and that is worth saying.
    expect(describeDailyWageBill(roster(3), 0)).toBe(0);
  });

  it('states nothing when nobody is on the payroll', () => {
    // The section itself has no box in this state, so a badge would be a figure
    // about a block that is not there.
    expect(describeDailyWageBill(roster(0), 4_800)).toBeUndefined();
  });

  it('states nothing before a roster has been reported at all', () => {
    expect(describeDailyWageBill(undefined, 4_800)).toBeUndefined();
  });

  it('states nothing while the counts channel has said nothing, rather than guessing zero', () => {
    // The two absences are different facts and only this one is about the
    // *channel*: a prison with sixty guards whose bill has not been published
    // must not read as a prison whose payroll is free.
    expect(describeDailyWageBill(roster(60), undefined)).toBeUndefined();
  });
});
