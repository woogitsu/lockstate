import { describe, expect, it } from 'vitest';
import { deriveSimulationMessageKey } from '../../src/content/simulation-message-keys';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import {
  dayProgressPercent,
  displayDay,
  nextFastForwardSpeed,
  occupancyTone,
  projectStatusMetrics,
  refusalMessageKey,
  severityLabelKey,
  severityTone,
  transportPressedStates,
  type HudMetricDescriptor,
  type HudMetricId,
} from '../../src/ui/hud/projection';
import {
  EMPTY_HUD_VIEW_MODEL,
  UNKNOWN_HUD_CLOCK,
  type HudClockViewModel,
  type HudCountsViewModel,
  type HudSpeed,
} from '../../src/ui/hud/view-model';
import { DEFAULT_BAR_SEGMENTS, filledSegments } from '../../src/ui/primitives/segmented-bar';

/**
 * The view-model → display mapping that decides what the HUD says.
 *
 * `status-strip.ts` builds its DOM by walking `projectStatusMetrics` and
 * these formatters and does nothing else, so proving the mapping here pins
 * everything the strip is told to show -- headlessly, in the default `node`
 * environment, exactly as `ui-save-panel-status.test.ts` does for the save
 * panel. It does not prove the DOM it builds: there is no DOM in this
 * environment and nothing here imports `status-strip.ts`, so the rendered
 * output is asserted in `tests/browser/ui-shell.spec.ts` instead.
 */

function clock(overrides: Partial<HudClockViewModel> = {}): HudClockViewModel {
  return { day: 1, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1, ...overrides };
}

function counts(overrides: Partial<HudCountsViewModel> = {}): HudCountsViewModel {
  return {
    prisoners: 0,
    prisonerCapacity: 0,
    occupiedPlaces: 0,
    staff: 0,
    rooms: 0,
    roomCapacity: 0,
    prisonersCovered: 0,
    prisonersUnderstaffed: 0,
    prisonersUnguarded: 0,
    prisonersHighRisk: 0,
    activeIncidents: 0,
    contrabandFound: 0,
    treasuryMinorUnits: 0,
    stateIncomeAccruedTodayMinorUnits: 0,
    ...overrides,
  };
}

describe('status strip: which metrics exist, in what order', () => {
  it('projects exactly the nine declared metrics, in a fixed order', () => {
    // Order is part of the contract: a HUD whose metrics move between builds
    // is one a player has to re-read every time. It was five until the
    // treasury balance joined them (#96), and six until #29's "earned today"
    // joined it. Each new chip went on the **end**, so every metric a player
    // already knew kept its position -- which is why `funds` was still sixth
    // rather than being pushed along by the figure that belongs beside it.
    //
    // **Issue #588's `coverage` is the first that did not**, and the
    // descriptor itself argues why: it is a staffing readout whose only remedy
    // is the control `staff` counts, so reading "27 staff, 100 covered, 12
    // unguarded" left to right is the whole decision. The four chips after it
    // each moved one column right, once, in an interface no player has
    // learned yet. The convention is not withdrawn -- an *unrelated* new chip
    // still belongs on the end.
    //
    // **Issue #703's `high-risk` is the second, and it went in at position two
    // for `coverage`'s reason.** It is `prisoners` at a second grain -- the same
    // people, and the subset the prison has to staff and search for -- so the
    // two read as one sentence. Seven chips each moved one column right, once.
    //
    // The measured half of that decision is in `projection.ts`'s own descriptor
    // comment, including a third reason written there and then refuted by the
    // measurement (the row does *not* overflow at 1280x720 at a seven-figure
    // treasury: 1252.0px of content in 1256px). What survives is where a chip
    // goes to be invisible on a narrow viewport -- 768x1024 shows the first five
    // of the nine -- and the 4px that is all the desktop headroom left.
    expect(projectStatusMetrics(counts()).map((metric) => metric.id)).toEqual([
      'prisoners',
      'high-risk',
      'staff',
      'coverage',
      'rooms',
      'incidents',
      'contraband',
      'funds',
      'earned-today',
    ]);
  });

  it('carries message keys, never text', () => {
    // ADR 0011: the view layer holds keys; a translated string never becomes
    // an identifier and never travels back toward the simulation.
    //
    // **Eight of the nine are `hud.*` and one is not** (#703). The `high-risk`
    // chip's label is `classification-group.high-risk.name`, the key
    // `src/content/simulation-message-keys.ts` already authors for that group
    // and the Regime panel already resolves for its restricted-block heading:
    // reusing it is what stops the strip and the panel drifting to two
    // spellings of one group's name, and authoring a second `hud.status.*`
    // string for words the game already ships would be a new player-facing
    // string, which `AGENTS.md`'s fourth exclusion reserves to the owner.
    //
    // The pattern assertion below is therefore split rather than relaxed: the
    // eight keep the `hud.` shape exactly as before, and the ninth is required
    // to be the derived simulation key -- not merely "something else".
    // `tests/unit/ui-hud-messages.test.ts` is where both registries are
    // resolved against the bundled catalog.
    const labels = projectStatusMetrics(counts()).map((metric) => metric.labelKey);
    expect(labels).toEqual([
      HUD_MESSAGE_KEY.prisoners,
      deriveSimulationMessageKey('classification-group', 'high-risk'),
      HUD_MESSAGE_KEY.staff,
      HUD_MESSAGE_KEY.coverage,
      HUD_MESSAGE_KEY.rooms,
      HUD_MESSAGE_KEY.incidents,
      HUD_MESSAGE_KEY.contraband,
      HUD_MESSAGE_KEY.funds,
      HUD_MESSAGE_KEY.earnedToday,
    ]);
    for (const label of labels) {
      expect(label).toMatch(/^(?:hud|classification-group)\.[a-z.-]+$/);
    }
    expect(labels.filter((label) => label.startsWith('hud.'))).toHaveLength(8);
  });

  it('renders a balance and no budget, cost or income metric', () => {
    /*
     * This used to forbid every money word outright, because there was no
     * economy and a HUD slot is where a fake number starts. #96 built one, so
     * the rule narrows rather than being dropped: a **balance** the
     * simulation publishes may be shown; anything implying the half that does
     * not exist may not.
     *
     * **The sentence here used to be false and is kept in both directions.**
     * It read: *"Nothing credits or debits the treasury on a schedule -- no
     * income, no payroll, no running cost -- so a `budget`, a `cost` or a
     * `wage` on the strip would be a number no system produces."* The income
     * clause stopped being true at `4f711d5` (#311), which is the change that
     * added the `earned-today` metric this same file asserts on; the payroll
     * clause stopped being true with ADR 0042 step 3.
     *
     * What the assertion below still guards, and it is a real thing: the
     * simulation now publishes `dailyWageBillMinorUnits` and
     * `unpaidWagesMinorUnits` and **the strip renders neither**, so a money
     * word appearing here would be a metric with nothing behind it -- exactly
     * the failure the original rule was written for, arrived at from the
     * opposite side. `fund` is admitted only as the metric id and label key.
     */
    const metrics = projectStatusMetrics(counts({ prisoners: 12, treasuryMinorUnits: 24_920 }));
    const serialized = JSON.stringify(metrics);

    expect(serialized).not.toMatch(/money|budget|cash|currency|cost|price|income|wage|salary/i);

    const funds = metrics.find((metric) => metric.id === 'funds');
    expect(funds?.value, 'the balance is shown in the units the simulation holds it in').toBe(24_920);
    expect(funds?.capacity, 'a balance has no maximum to be a share of').toBeUndefined();
    expect(funds?.tone, 'a low-funds threshold would be a balance decision, and nothing pays in').toBeUndefined();
    expect(funds?.badge).toBeUndefined();
  });

  it('passes the counts through unchanged', () => {
    // Every figure distinct, and the accrual deliberately not a round
    // fraction of the balance: two chips carrying the same units are exactly
    // where a projection that read the wrong field would still look right.
    const metrics = projectStatusMetrics(
      counts({
        prisoners: 142,
        // Distinct from `prisoners` and not a factor of it, for the reason
        // stated above: the high-risk chip counts a *subset* of the population,
        // so a projection reading `prisoners` into it would look plausible
        // against any round figure (#703).
        prisonersHighRisk: 19,
        staff: 27,
        rooms: 61,
        contrabandFound: 8,
        treasuryMinorUnits: 24_920,
        stateIncomeAccruedTodayMinorUnits: 10_667,
      }),
    );
    expect(metrics.map((metric) => metric.value)).toEqual([142, 19, 27, 0, 61, 0, 8, 24_920, 10_667]);
  });
});

/**
 * The descriptor for one metric, **by id rather than by index**.
 *
 * The cases below are about what a chip says, not about where it sits, and
 * `coverage` landing third (issue #588) turned four of them red by moving an
 * index they never meant to assert. The order is pinned once, in its own case
 * above, which is where a change to it should be read.
 */
function metric(view: HudCountsViewModel, id: HudMetricId): HudMetricDescriptor {
  const found = projectStatusMetrics(view).find((descriptor) => descriptor.id === id);
  expect(found, `no ${id} metric in the strip`).toBeDefined();
  return found!;
}

describe('status strip: tone and badges', () => {
  it('states the incident condition in words, so colour is never the only signal', () => {
    const clear = metric(counts({ activeIncidents: 0 }), 'incidents');
    expect(clear?.badge).toEqual({ tone: 'success', textKey: HUD_MESSAGE_KEY.incidentsClear });
    expect(clear?.tone).toBeUndefined();

    const active = metric(counts({ activeIncidents: 3 }), 'incidents');
    expect(active?.badge).toEqual({ tone: 'danger', textKey: HUD_MESSAGE_KEY.incidentsActive });
    expect(active?.tone).toBe('danger');
  });

  it('names the open incident kind on the badge when the worker could name one (issue #506 finding 2)', () => {
    // The whole point of this fix: a player can now tell a riot from an
    // assault from the badge word itself, not only from the count going 0 to
    // 1. `'incident-type.riot.name'` is the exact shape
    // `deriveSimulationMessageKey('incident-type', 'riot')` produces
    // (`src/content/simulation-message-keys.ts`), reused here as a plain
    // string so this file stays in `environment: 'node'` with no simulation
    // import.
    const riot = metric(counts({ activeIncidents: 1, activeIncidentTypeLabelKey: 'incident-type.riot.name' }), 'incidents');
    expect(riot?.badge).toEqual({ tone: 'danger', textKey: 'incident-type.riot.name' });
    expect(riot?.tone).toBe('danger');

    // The count alone still cannot say more than one sector's worth of
    // incidents agree on a kind (ADR 0061 decision 6), and that case is
    // `activeIncidentTypeLabelKey` absent -- the strip falls back to the
    // generic wording the case above already covers, rather than guessing.
    const mixed = metric(counts({ activeIncidents: 2 }), 'incidents');
    expect(mixed?.badge).toEqual({ tone: 'danger', textKey: HUD_MESSAGE_KEY.incidentsActive });
  });

  it('names what contraband was found on the badge, and draws no badge when it cannot (#703 ruling 3)', () => {
    /*
     * The owner's ruling 3 on issue #703, 2026-08-31: *"The message names what
     * contraband was found."* Before this the chip could only say `1`, so a
     * found phone and a found weapon rendered as the same character -- and
     * after ADR 0080 a weapon is something a player's own neglect produces.
     *
     * `'contraband.weapon.name'` is written out as a plain string, the way the
     * incident case above writes its key out, so this file stays in
     * `environment: 'node'` with no content or simulation import. It is one of
     * the five keys `src/content/contraband-catalog.ts` has authored since #27
     * and nothing on screen read until this chip.
     */
    const weapon = metric(counts({ contrabandFound: 1, contrabandNameKey: 'contraband.weapon.name' }), 'contraband');
    expect(weapon?.badge).toEqual({ tone: 'warning', textKey: 'contraband.weapon.name' });
    expect(weapon?.value).toBe(1);
    // The chip's own tone, unchanged: the pill is a second channel for the
    // same fact, not a second severity. A weapon and a phone are both
    // `'warning'` here, deliberately -- `severity` is in the catalogue and
    // grading the badge by it would teach a ranking the game never states.
    expect(weapon?.tone).toBe('warning');
    const phone = metric(counts({ contrabandFound: 3, contrabandNameKey: 'contraband.phone.name' }), 'contraband');
    expect(phone?.badge).toEqual({ tone: 'warning', textKey: 'contraband.phone.name' });
    expect(phone?.tone).toBe('warning');

    /*
     * **No badge, rather than a generic word, when no one word is true of the
     * count.** This is where the contraband chip parts company with the
     * incidents chip above: that one falls back to "Active", and the generic
     * word here would be the chip's own label, so a pill reading "Contraband"
     * under a label reading "CONTRABAND" would be the same word twice rather
     * than a second channel.
     *
     * Both absences are covered, because they are different facts about the
     * prison and the same rendering: nothing found at all, and several
     * categories found (measured as roughly half of played prisons at sixteen
     * in-game days -- `tests/integration/contraband-search-duty.test.ts`),
     * which the projection reports by withholding the key.
     */
    expect(metric(counts(), 'contraband').badge).toBeUndefined();
    expect(metric(counts({ contrabandFound: 2 }), 'contraband').badge).toBeUndefined();
  });

  it('escalates the coverage chip one rung at a time, and says which rung in one word', () => {
    /*
     * **The owner's ruling 21 of 2026-08-31, and it is a narrowing of what this
     * test used to require.**
     *
     * Issue #588 put `Covered N / Understaffed N / Unguarded N` on the strip so
     * that the value carried the top rung and the badge carried the other two
     * *with their counts*, and the paragraph that stood here said all three
     * numbers were on the strip without one of them being stated twice. That
     * was true and it is now false: the badge states the worst rung in the one
     * authored word the Staff panel already uses, and the two counts are not on
     * the strip at all. The ruling's own reason is width -- at 1280 a strip
     * carrying every badge is 1,627px of content in a 1,256px row, and this
     * badge is the second-largest single contributor -- and the cost it accepts
     * is exactly the sentence #588 asked for.
     *
     * The ladder itself is untouched, and it is still `describeStaffCoverage`'s
     * for its reason: a prison with somebody unguarded is not a worse version of
     * an understaffed one, so `unguarded` is checked first and wins even when
     * both are non-zero. What changed is only how many words say so.
     */
    const covered = metric(counts({ prisonersCovered: 8 }), 'coverage');
    expect(covered.value).toBe(8);
    expect(covered.tone).toBeUndefined();
    // The word this repository already ships for the top rung, not a second
    // copy of it -- so the strip and the Staff panel cannot come to disagree.
    expect(covered.badge).toEqual({ tone: 'success', textKey: HUD_MESSAGE_KEY.securityCoverageMet });

    // And the other two rungs now reuse the Staff panel's words for the same
    // reason the top rung always has: `hud.security.coverage-short` and
    // `hud.security.coverage-unguarded` are already authored and already on
    // screen, so ruling 21 authors no string at all.
    const short = metric(counts({ prisonersCovered: 8, prisonersUnderstaffed: 3 }), 'coverage');
    expect(short.tone).toBe('warning');
    expect(short.badge).toEqual({ tone: 'warning', textKey: HUD_MESSAGE_KEY.securityCoverageShort });

    /*
     * **The worst rung, and only the worst rung.** This used to require both
     * counts, on the argument that a player who fixed the unguarded rung would
     * not otherwise know there was a second one underneath it. That argument is
     * not refuted, it is outweighed -- and what answers it is that the rung
     * underneath is still on screen the moment the one above is cleared, on this
     * same badge, because the ladder is re-evaluated on every publication.
     */
    const dark = metric(counts({ prisonersCovered: 8, prisonersUnderstaffed: 3, prisonersUnguarded: 1 }), 'coverage');
    expect(dark.tone).toBe('danger');
    expect(dark.badge).toEqual({ tone: 'danger', textKey: HUD_MESSAGE_KEY.securityCoverageUnguarded });

    // Unguarded with nobody understaffed still reads danger, so the two rungs
    // are independent rather than a two-step scale one has to climb.
    const unguardedOnly = metric(counts({ prisonersUnguarded: 2 }), 'coverage');
    expect(unguardedOnly.tone).toBe('danger');
    expect(unguardedOnly.badge).toEqual({ tone: 'danger', textKey: HUD_MESSAGE_KEY.securityCoverageUnguarded });

    /*
     * **No badge on this chip carries a parameter any more**, which is the
     * property that makes the saving real rather than a shorter default: a key
     * with a placeholder is a key whose rendered width follows the prison's
     * numbers, and the ruling is about a width.
     */
    for (const state of [covered, short, dark, unguardedOnly]) {
      expect(state.badge?.numberParameters, 'a coverage badge states a rung, never a count').toBeUndefined();
    }
  });

  it('reads the empty prison as covered, which is what a prison with nobody in a sector is', () => {
    // Three zeroes is a real state and not a missing reading -- every session
    // before its first admission is in it -- and it is the same answer
    // `describeStaffCoverage` gives a sector that asks for nobody.
    const empty = metric(counts(), 'coverage');
    expect(empty.value).toBe(0);
    expect(empty.badge).toEqual({ tone: 'success', textKey: HUD_MESSAGE_KEY.securityCoverageMet });
  });

  /**
   * **The owner's ruling 18 of 2026-08-31, re-based by the owner's ruling of
   * 2026-09-01, and the arithmetic in it is the one number here that can be
   * wrong in a way a player would believe.**
   *
   * `{remaining}` was *"how much of the facility is still spendable"*,
   * `balance - overdraftFloor`, and every figure in this test was written to
   * the -2,500 floor. **Ruling 19 made that number an offer of room no press
   * can spend**: a prison at -1,300 has already had a delivery and a hire
   * refused and the badge still read `1,200 left`. The 2026-09-01 ruling
   * re-bases it onto the `'deliveries'` rung, which is the same
   * `HOST_PRESS_FLOOR_MINOR_UNITS` `judgeAffordability` refuses a press
   * against -- so the badge reading `0 left` and the next Buy press being
   * refused are now the same fact, which is what makes the figure worth
   * trusting.
   *
   * A badge that were one unit generous would send a player to press a control
   * the simulation is going to refuse; one that were one unit mean would hide
   * a purchase they can afford, which is the failure #82 and #207 are about.
   * So the boundary is pinned from both sides, and the fixtures never compute
   * the expected figure from the code under test.
   */
  it('says how much is left before deliveries stop, and never a number below zero', () => {
    const FLOOR = -2_500;
    // `roomCapacity: 1` -- a furnished, mature prison -- and not `counts()`'s
    // own `0` default. This test is about the mature -1,250 rung throughout;
    // the fixture's default `roomCapacity: 0` happens to be the literal value
    // `overdraftRemaining` reads as "fresh, unfurnished" since the owner's
    // second ruling on #771 (2026-09-01), and every figure below was derived
    // against the mature rung, not the shallower starter one that default
    // would otherwise select.
    const badge = (treasuryMinorUnits: number, floor: number | undefined = FLOOR) =>
      metric(
        counts({
          treasuryMinorUnits,
          roomCapacity: 1,
          ...(floor === undefined ? {} : { treasuryOverdraftFloorMinorUnits: floor }),
        }),
        'funds',
      );

    /*
     * The remainder, spelled out rather than subtracted, so the fixture cannot
     * agree with a wrong implementation. -1,230 is `judgeAffordability`'s own
     * worked example -- 20 of room against a 65 plank -- and the badge has to
     * agree with it to the minor unit, because the two now answer the same
     * question on the same rung from opposite sides of `sender.submit`.
     *
     * **This probe was `badge(-2_480)` with `remaining: 20` before the
     * re-basing**, which was the same 20 measured against the floor.
     */
    expect(badge(-1_230).badge).toEqual({
      tone: 'warning',
      textKey: HUD_MESSAGE_KEY.fundsRemaining,
      numberParameters: { remaining: 20 },
    });
    expect(badge(-1).badge?.numberParameters, '1,249 and not 2,499').toEqual({ remaining: 1_249 });

    /*
     * **The position the ruling was argued from.** A prison at -1,300 has had a
     * delivery and a hire refused already, and the badge said `1,200 left` in
     * amber. It says nothing is left, in red, because nothing is.
     */
    expect(badge(-1_300).badge).toEqual({
      tone: 'danger',
      textKey: HUD_MESSAGE_KEY.fundsRemaining,
      numberParameters: { remaining: 0 },
    });

    /*
     * **Exactly at the rung reads `0 left`, not a negative.** This is the
     * boundary: the prison can buy nothing more, and a badge reading `-0` or
     * `0` are different sentences to a player only if one of them is wrong.
     */
    expect(badge(-1_250).badge).toEqual({
      tone: 'danger',
      textKey: HUD_MESSAGE_KEY.fundsRemaining,
      numberParameters: { remaining: 0 },
    });

    /*
     * And **below** the rung, which a press cannot produce but a payday and the
     * build queue both can: the remainder is clamped, for
     * `prisonersWithoutBed`'s reason -- a negative remainder is a nonsense
     * sentence on screen.
     */
    expect(badge(FLOOR).badge?.numberParameters).toEqual({ remaining: 0 });
    expect(badge(-3_000).badge?.numberParameters).toEqual({ remaining: 0 });
    expect(badge(-3_000).badge?.tone).toBe('danger');

    /*
     * **A floor shallower than the rung collapses the rung onto it**, which is
     * `rungFloorMinorUnits`'s clamp and the reason the badge goes through
     * `deliveriesRungFloorMinorUnits` rather than through a bare -1,250. At a
     * floor of -800 the deliveries rung *is* -800, so a prison at -700 has 100
     * left rather than a negative remainder against a rung deeper than its own
     * facility.
     */
    expect(badge(-700, -800).badge?.numberParameters, 'the rung is clamped up to the floor').toEqual({
      remaining: 100,
    });
  });

  /**
   * **What the badge cannot say, said on the chip itself** -- the owner's
   * ruling of 2026-09-01.
   *
   * The ruling reversed an earlier choice of the owner's. The badge was to read
   * `{remaining} left before deliveries stop`; `tests/browser/ui-overdraft-badge.spec.ts`
   * measured that wording at **+133px** of chip and watched the FUNDS chip --
   * eighth of nine on a row whose scrollbar `hud.css` suppresses -- leave the
   * visible edge at 1280x800 for the whole four-digit range of the remainder.
   * So the badge keeps the short words *because they fit*, and the name of the
   * threshold moves to two places with room for a sentence: this description,
   * and the refusal alert.
   *
   * What is pinned here is the pairing rather than the prose. A description
   * without a badge would be a sentence about a number nobody can see; a badge
   * without a description is the state the ruling exists to end. The words
   * themselves are `src/content/default-locale-en.ts`'s and are gated, against
   * the alert they have to agree with, in
   * `tests/unit/ui-hud-funds-threshold-named.test.ts`.
   */
  it('names the threshold on the chip, in a sentence the badge has no room for', () => {
    // `roomCapacity: 1`, for the reason the sibling test above gives: this is
    // the mature rung, not the starter one `counts()`'s own `0` default would
    // otherwise select.
    const chip = (treasuryMinorUnits: number) =>
      metric(counts({ treasuryMinorUnits, treasuryOverdraftFloorMinorUnits: -2_500, roomCapacity: 1 }), 'funds');

    /*
     * Above the rung: the warning, carrying the same remainder the badge
     * carries. Same number, same field, so the strip formats both through one
     * `Intl` call and the tooltip cannot group differently from the pill it
     * explains.
     */
    expect(chip(-1).description).toEqual({
      textKey: HUD_MESSAGE_KEY.fundsBeforeDeliveriesStop,
      numberParameters: { remaining: 1_249 },
    });
    expect(chip(-1).badge?.numberParameters, 'the badge and its sentence state one number').toEqual({
      remaining: 1_249,
    });

    /*
     * At and below the rung: a different sentence, because a different thing
     * is true. `{remaining} left before deliveries stop` with a `0` in it is a
     * warning about something that has already happened, and the chip goes red
     * at exactly this step -- so the words change where the colour changes.
     */
    for (const balance of [-1_250, -1_300, -2_500, -3_000]) {
      expect(chip(balance).description, `balance ${String(balance)}`).toEqual({
        textKey: HUD_MESSAGE_KEY.fundsDeliveriesStopped,
      });
      expect(chip(balance).badge?.tone, `balance ${String(balance)}`).toBe('danger');
    }

    /*
     * **And it is drawn exactly when the badge is drawn.** A tooltip that
     * outlived its badge would be a sentence about a remainder the chip is no
     * longer showing; one that arrived first would explain a number that is
     * not there. Solvent, and a payload with no facility in it, are the two
     * ways that could happen.
     */
    for (const balance of [0, 25_000]) {
      expect(chip(balance).description, `balance ${String(balance)}`).toBeUndefined();
    }
    expect(metric(counts({ treasuryMinorUnits: -2_480 }), 'funds').description).toBeUndefined();
    expect(
      metric(counts({ treasuryMinorUnits: -2_480, treasuryOverdraftFloorMinorUnits: 0 }), 'funds').description,
    ).toBeUndefined();
  });

  /**
   * **Only the FUNDS chip carries one**, and this is the assertion that keeps
   * it that way by accident rather than by policy: eight chips returning
   * `undefined` is what makes the ninth's sentence worth reading. A strip where
   * every chip has a tooltip is a strip whose tooltips nobody hovers, which is
   * `coverageTone`'s argument about tone applied to prose.
   */
  it('gives no other chip a description', () => {
    const populated = counts({ treasuryMinorUnits: -1, treasuryOverdraftFloorMinorUnits: -2_500 });
    const described = projectStatusMetrics(populated)
      .filter((entry) => entry.description !== undefined)
      .map((entry) => entry.id);
    expect(described).toEqual(['funds']);
  });

  it('leaves the funds chip exactly as it was while the prison is solvent', () => {
    // No badge and no tone at zero or above, which is the state a player
    // spends the game in. `coverageTone`'s rule applied to the busiest number
    // on the strip: a chip that always carries a pill is a pill nobody reads
    // in the one screenshot it matters in.
    for (const balance of [0, 1, 25_000, 1_284_500]) {
      const chip = metric(counts({ treasuryMinorUnits: balance, treasuryOverdraftFloorMinorUnits: -2_500 }), 'funds');
      expect(chip.badge, `balance ${String(balance)}`).toBeUndefined();
      expect(chip.tone, `balance ${String(balance)}`).toBeUndefined();
      expect(chip.value).toBe(balance);
    }
  });

  it('says nothing about a facility it was not told about', () => {
    /*
     * Absent and `0` are the same statement -- no room below zero is known --
     * and there is no remainder to state for either. A badge here would have to
     * invent the floor, which is exactly what publishing it exists to avoid.
     * Every payload written before ruling 18 is in this case.
     */
    expect(metric(counts({ treasuryMinorUnits: -2_480 }), 'funds').badge).toBeUndefined();
    expect(metric(counts({ treasuryMinorUnits: -2_480 }), 'funds').tone).toBeUndefined();
    expect(
      metric(counts({ treasuryMinorUnits: -2_480, treasuryOverdraftFloorMinorUnits: 0 }), 'funds').badge,
    ).toBeUndefined();
  });

  /**
   * **Two tones, not one, and the split is `coverageTone`'s argument applied to
   * money.**
   *
   * A prison at -100 and a prison at -1,300 are not the same state told louder:
   * the first can still buy the plank that finishes the cell, and the second
   * cannot buy anything at all until the state pays it. That is the same
   * distinction `coverageTone` draws between understaffed and unguarded -- the
   * rung where the cheapest available action stops changing the outcome.
   *
   * **This test read `reserves danger for the floor itself` and pinned -2,500
   * until the owner's ruling of 2026-09-01**, and the sentence above read *"a
   * prison at -100 and a prison at -2,500 ... `danger` is reserved for the
   * floor rather than spent on the first minus sign."* It was right about the
   * principle and wrong about the number from the moment ruling 19 gave the
   * ladder three thresholds: between -1,250 and -2,500 the cheapest available
   * action -- a press -- had already stopped changing the outcome, and the chip
   * still painted amber. The rung where a player's press dies is the deliveries
   * rung, so that is where `danger` starts.
   *
   * What `danger` therefore no longer means is *"nothing at all can be spent"*
   * -- the build queue can still spend down to -2,000 and a payday to -2,500.
   * That is a real narrowing and it is the right one: every one of those is a
   * spend the player cannot make happen by pressing anything.
   *
   * Colour is never the only signal in either: the badge states the remainder
   * in words, and at the rung those words are `0 left before deliveries stop`.
   */
  it('reserves danger for the deliveries rung, and paints the chip and its badge alike', () => {
    // `roomCapacity: 1`, for the reason the first test in this block gives:
    // the mature rung, not the starter one `counts()`'s own `0` default would
    // otherwise select.
    const at = (treasuryMinorUnits: number) =>
      metric(counts({ treasuryMinorUnits, treasuryOverdraftFloorMinorUnits: -2_500, roomCapacity: 1 }), 'funds');

    expect(at(-1).tone).toBe('warning');
    expect(at(-1_249).tone, 'one unit of room left is still room').toBe('warning');
    expect(at(-1_250).tone, 'and none at all is not').toBe('danger');
    expect(at(-1_300).tone, 'the position the ruling was argued from').toBe('danger');
    expect(at(-2_500).tone, 'and the floor is still danger, a rung further down').toBe('danger');

    // One decision, two channels: the chip and its badge cannot disagree about
    // how bad this is.
    for (const balance of [-1, -1_249, -1_250, -2_500, -4_000]) {
      const chip = at(balance);
      expect(chip.badge?.tone, `balance ${String(balance)}`).toBe(chip.tone);
    }
  });

  it('sets no capacity on the coverage chip, because the population is not its denominator', () => {
    // The three rungs sum to the prisoners standing in a sector, and an
    // arrival still in transit is in none of them -- so a bar reading "12 of
    // 16" would be false at exactly the moments intake is busy.
    const busy = metric(counts({ prisoners: 16, prisonersCovered: 12 }), 'coverage');
    expect(busy.capacity).toBeUndefined();
  });

  it('marks confiscated contraband as a warning only once there is some', () => {
    expect(metric(counts({ contrabandFound: 0 }), 'contraband').tone).toBeUndefined();
    expect(metric(counts({ contrabandFound: 1 }), 'contraband').tone).toBe('warning');
  });

  it('omits the occupancy bar when capacity is unknown rather than guessing one', () => {
    expect(projectStatusMetrics(counts({ prisoners: 10, prisonerCapacity: 0 }))[0]?.capacity).toBeUndefined();
    expect(projectStatusMetrics(counts({ prisoners: 10, prisonerCapacity: 40 }))[0]?.capacity).toBe(40);
  });
});

describe('the PRISONERS chip says how many have no bed (issue #609)', () => {
  /*
   * The number that was computed, put on the wire and thrown away at the HUD
   * boundary. A player who admits twelve prisoners into a three-bed prison
   * saw `12` and nothing else, while the state paid for three -- and the
   * session that found this measured four prisons and eight day boundaries
   * to work out why a twelve-prisoner prison paid like a three-prisoner one.
   *
   * The chip keeps its raw value. The badge is the part of that value the
   * prison earns nothing for.
   */

  it('states the shortfall on the badge and leaves the chip reading the roster', () => {
    // Issue #609's own prison, and the figures are deliberately not multiples
    // of one another: a badge that read the wrong field would still print a
    // plausible small number.
    const chip = metric(counts({ prisoners: 12, occupiedPlaces: 3, prisonerCapacity: 3 }), 'prisoners');

    expect(chip.value, 'the chip must still answer "how many prisoners are there"').toBe(12);
    expect(chip.badge).toEqual({
      tone: 'warning',
      textKey: HUD_MESSAGE_KEY.prisonersWithoutBed,
      numberParameters: { count: 9 },
    });
    // The same 9 the Intake panel already says out loud in this prison --
    // "9 waiting with no bed to sleep in" -- which is why the strip uses the
    // owner's matching wording rather than a second phrasing for one fact.
  });

  it('counts places and not capacity, in the prison where those differ', () => {
    /*
     * Issue #609's second correction, as a case rather than as prose: **two
     * cells of two beds, four prisoners, all four assigned into cell A.**
     *
     * Capacity is 4, so `prisoners - accommodationCapacity` -- the derivation
     * the protocol's own comment once suggested, and the one
     * `prisonersWithoutBed` argues at length that it must not be -- says
     * **0 unhoused**. Cell A holds `min(4, 2) = 2` places and cell B holds
     * none, so two prisoners have nowhere to sleep. The subtraction breaks
     * because capacity is not fungible across instances;
     * `occupiedPlaces` is a count of prisoners and does not care.
     */
    expect(metric(counts({ prisoners: 4, occupiedPlaces: 2, prisonerCapacity: 4 }), 'prisoners').badge).toEqual({
      tone: 'warning',
      textKey: HUD_MESSAGE_KEY.prisonersWithoutBed,
      numberParameters: { count: 2 },
    });
  });

  it('draws no badge at all when everybody has a bed, rather than a permanent "0 with no bed"', () => {
    // `coverageTone`'s rule, applied to a chip that had no badge until now:
    // a status strip where several things are always on teaches players to
    // ignore the one that matters, and that note already extends it past
    // amber. A reassuring line in every screenshot is the same failure.
    expect(metric(counts({ prisoners: 8, occupiedPlaces: 8, prisonerCapacity: 12 }), 'prisoners').badge).toBeUndefined();

    // The empty prison, which is every session before its first admission.
    expect(metric(counts(), 'prisoners').badge).toBeUndefined();

    // And a prison with one prisoner and no bed is the smallest state that
    // must show it, so "absent below the threshold" cannot be off by one.
    expect(metric(counts({ prisoners: 1, occupiedPlaces: 0 }), 'prisoners').badge).toEqual({
      tone: 'warning',
      textKey: HUD_MESSAGE_KEY.prisonersWithoutBed,
      numberParameters: { count: 1 },
    });
  });

  it('is still right after a bed is taken out from under a resident, which is the case it exists for', () => {
    /*
     * **The case that chose `occupiedPlaces` over `roomOccupants`.**
     *
     * `tests/integration/economy-occupied-place-exists.test.ts` measures the
     * prison through real commands: a 3x3 `room.cell`, two beds, two
     * prisoners housed, one bed then taken out with `RemoveObject`. The
     * projection publishes `roomOccupants` **2** -- ADR 0028 decision 2,
     * *"Nobody is evicted"*, keeps both assignments alive -- against
     * `roomCapacity` 1 and `occupiedPlaces` **1**, and the day is worth 300
     * rather than 600.
     *
     * So residency says everybody is housed and the treasury says one of
     * them is not. The badge has to follow the treasury, because that is the
     * fact the player cannot otherwise see.
     */
    const afterRemoval = metric(counts({ prisoners: 2, occupiedPlaces: 1, prisonerCapacity: 1 }), 'prisoners');

    expect(afterRemoval.badge).toEqual({
      tone: 'warning',
      textKey: HUD_MESSAGE_KEY.prisonersWithoutBed,
      numberParameters: { count: 1 },
    });

    // What the rejected field would have produced from the same prison:
    // `roomOccupants` is 2 there, so a badge fed from it reads "nobody" for a
    // prison the state has already stopped paying half of. This is the
    // silence the badge exists to break, asserted rather than described.
    expect(
      metric(counts({ prisoners: 2, occupiedPlaces: 2, prisonerCapacity: 1 }), 'prisoners').badge,
      'a residency count says everybody is housed in the one prison where that is false',
    ).toBeUndefined();
  });

  it('leaves the chip tone and the occupancy bar to occupancyTone, and does not double up on either', () => {
    // The badge is a *count*; the chip's tone is the escalation. Two red
    // things on one chip for one fact would leave nothing louder for the
    // state that is genuinely worse.
    const overCapacity = metric(counts({ prisoners: 12, occupiedPlaces: 3, prisonerCapacity: 3 }), 'prisoners');
    expect(overCapacity.tone, 'past capacity is where the chip itself goes red').toBe('danger');
    expect(overCapacity.badge?.tone, 'the badge states the number; the chip states the severity').toBe('warning');
    expect(overCapacity.capacity, 'the bar still measures the population against the beds').toBe(3);

    // The badge does not need a capacity to exist, which is the half of this
    // an occupancy bar cannot cover: a prison with beds to spare somewhere
    // else still has a prisoner whose own bed was removed.
    const spareBeds = metric(counts({ prisoners: 4, occupiedPlaces: 2, prisonerCapacity: 8 }), 'prisoners');
    expect(spareBeds.tone, 'four prisoners in a prison with eight beds is nowhere near capacity').toBeUndefined();
    expect(spareBeds.badge?.numberParameters, 'and two of them still have nowhere to sleep').toEqual({ count: 2 });
  });

  it('never prints a negative shortfall, however the two counts arrive', () => {
    // `assign` does not release a prisoner from a previous instance and
    // `residentIdsWithExistingPlace` does not de-duplicate, so this layer
    // cannot prove `occupiedPlaces <= prisoners` from the far side of a
    // message channel. "-2 with no bed" is a sentence no player should ever
    // read; a badge that does not appear is the right worst case.
    expect(metric(counts({ prisoners: 3, occupiedPlaces: 5 }), 'prisoners').badge).toBeUndefined();
  });
});

describe('occupancyTone', () => {
  it.each([
    [0, 100, undefined],
    [89, 100, undefined],
    [90, 100, 'warning'],
    [100, 100, 'warning'],
    [101, 100, 'danger'],
  ])('%i of %i reads as %s', (prisoners, capacity, expected) => {
    expect(occupancyTone(prisoners, capacity)).toBe(expected);
  });

  it('has no opinion without a capacity', () => {
    // A status strip where several things are permanently amber teaches
    // players to ignore amber.
    expect(occupancyTone(50, 0)).toBeUndefined();
    expect(occupancyTone(50, Number.NaN)).toBeUndefined();
  });
});

describe('filledSegments', () => {
  it('lights one segment for any non-zero value, and never rounds it away', () => {
    // 1/180 rounds to zero segments. An empty bar would say "nothing here",
    // which is a different fact from "one".
    expect(filledSegments(1, 180)).toBe(1);
    expect(filledSegments(0, 180)).toBe(0);
  });

  it('fills completely at and above the maximum', () => {
    expect(filledSegments(180, 180)).toBe(DEFAULT_BAR_SEGMENTS);
    expect(filledSegments(500, 180)).toBe(DEFAULT_BAR_SEGMENTS);
  });

  it('scales in between', () => {
    expect(filledSegments(50, 100)).toBe(5);
    expect(filledSegments(51, 100)).toBe(6);
  });

  it('lights nothing for an unbounded or nonsensical maximum', () => {
    expect(filledSegments(5, 0)).toBe(0);
    expect(filledSegments(5, -1)).toBe(0);
    expect(filledSegments(Number.NaN, 100)).toBe(0);
    expect(filledSegments(5, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('respects a custom segment count', () => {
    expect(filledSegments(1, 4, 4)).toBe(1);
    expect(filledSegments(4, 4, 4)).toBe(4);
  });
});

describe('clock readout', () => {
  // `DAY_LENGTH_TICKS` at the time of writing. Spelled out rather than
  // imported: the HUD may not import the simulation, and the point of the
  // view model carrying `dayLengthTicks` is that this number is *not* baked
  // into the display layer. The cases below therefore use several lengths.
  const DAY = 2_400;

  it.each([
    [0, DAY, 0],
    [1, DAY, 0],
    [DAY / 4, DAY, 25],
    [DAY / 2, DAY, 50],
    [DAY - 1, DAY, 99],
    [50, 100, 50],
    [3, 8, 37],
  ])('tick %i of a %i-tick day is %i%% through it', (tickOfDay, dayLengthTicks, expected) => {
    expect(dayProgressPercent(tickOfDay, dayLengthTicks)).toBe(expected);
  });

  it('floors, so a day is never reported as over before it is', () => {
    // The same rule `BoundedValue.filled` follows: rounding would report
    // 99.6% of the way through day 3 as day 3 being finished, which is a
    // thing a player would act on.
    expect(dayProgressPercent(999, 1_000)).toBe(99);
    expect(dayProgressPercent(996, 1_000)).toBe(99);
  });

  it('reports the position as unknown when the day length is', () => {
    // `0` is what `UNKNOWN_HUD_CLOCK` carries: no session has reported a
    // clock, so there is no day to be part of the way through.
    expect(dayProgressPercent(0, 0)).toBeUndefined();
    expect(dayProgressPercent(120, 0)).toBeUndefined();
    expect(dayProgressPercent(120, -5)).toBeUndefined();
    expect(dayProgressPercent(Number.NaN, DAY)).toBeUndefined();
    expect(dayProgressPercent(0, Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('wraps rather than throwing on a position outside the day', () => {
    // A readout that lands one tick either side of the day boundary must
    // still render something.
    expect(dayProgressPercent(DAY, DAY)).toBe(0);
    expect(dayProgressPercent(DAY + DAY / 2, DAY)).toBe(50);
    expect(dayProgressPercent(-1, DAY)).toBe(99);
  });

  it('never claims a day number the simulation has not reported', () => {
    expect(displayDay(1)).toBe(1);
    expect(displayDay(12.7)).toBe(12);
    // `0` is the "no session" value, and it must not become "day 1": a
    // confident day counter for a prison that is not running is exactly the
    // kind of state-shaped decoration the HUD may not show.
    expect(displayDay(0)).toBeUndefined();
    expect(displayDay(-4)).toBeUndefined();
    expect(displayDay(Number.NaN)).toBeUndefined();
  });

  it('maps the no-session clock itself to nothing, day and position both', () => {
    // Deliberately fed from `UNKNOWN_HUD_CLOCK` rather than from literal
    // zeroes. The assertions above pin what the formatters do with `0`; this
    // one pins that the sentinel the HUD actually paints before any session
    // exists *is* one of those values. Asserting the sentinel against itself
    // would be tautological, and a sentinel changed to `day: 1` would then
    // reach the screen as "Day 1" for a prison that is not running, with the
    // browser suite as the only guard.
    expect(displayDay(UNKNOWN_HUD_CLOCK.day)).toBeUndefined();
    expect(dayProgressPercent(UNKNOWN_HUD_CLOCK.tickOfDay, UNKNOWN_HUD_CLOCK.dayLengthTicks)).toBeUndefined();

    // And the same for the view model a first paint uses, which is what
    // `src/main.ts` hands the HUD before the worker has answered.
    const empty = EMPTY_HUD_VIEW_MODEL.clock;
    expect(displayDay(empty.day)).toBeUndefined();
    expect(dayProgressPercent(empty.tickOfDay, empty.dayLengthTicks)).toBeUndefined();
    // And it reads as paused, so the transport does not show a simulation
    // that is running when none exists.
    expect(transportPressedStates(empty).pause).toBe(true);
  });
});

describe('transport controls', () => {
  it('shows exactly one control pressed, so the three read as a state', () => {
    const cases: readonly { mode: 'paused' | 'running'; speed: HudSpeed }[] = [
      { mode: 'paused', speed: 1 },
      { mode: 'paused', speed: 4 },
      { mode: 'running', speed: 1 },
      { mode: 'running', speed: 2 },
      { mode: 'running', speed: 4 },
    ];
    for (const { mode, speed } of cases) {
      const pressed = transportPressedStates(clock({ mode, speed }));
      expect(Object.values(pressed).filter(Boolean)).toHaveLength(1);
    }
  });

  it('pauses regardless of speed, and distinguishes normal speed from fast', () => {
    expect(transportPressedStates(clock({ mode: 'paused', speed: 4 })).pause).toBe(true);
    expect(transportPressedStates(clock({ mode: 'running', speed: 1 })).play).toBe(true);
    expect(transportPressedStates(clock({ mode: 'running', speed: 2 })).fastForward).toBe(true);
  });

  it('cycles fast-forward between the two fast speeds instead of dead-ending', () => {
    // Returning to x1 is what the play button is for, so no tap is ambiguous.
    expect(nextFastForwardSpeed(1)).toBe(2);
    expect(nextFastForwardSpeed(2)).toBe(4);
    expect(nextFastForwardSpeed(4)).toBe(2);
  });
});

describe('severity', () => {
  it('pairs every severity with both a tone and a word', () => {
    for (const severity of ['info', 'warning', 'danger'] as const) {
      expect(severityTone(severity)).toBeTruthy();
      expect(severityLabelKey(severity)).toMatch(/^hud\.severity\./);
    }
  });
});

/**
 * Issue #207: which refusals the player is told about, and which ones would
 * be a false statement on screen.
 *
 * The mapping is the whole decision. Every intent the HUD can dispatch is
 * enumerated here -- all eight `HudIntent` kinds, the five commands that
 * produce a message and the three chrome intents that must not -- rather than
 * only the ones that produce a message, so an intent added later fails this
 * test instead of silently landing in whichever half of the rule its
 * `default` case happens to be.
 */
describe('refusalMessageKey: what a refused control says', () => {
  it('names an outcome for each command, and five different ones', () => {
    // A command changes nothing locally, so a refusal means the prison is
    // exactly as it was and nothing on screen says so unless this does.
    const keys = [
      refusalMessageKey('set-clock'),
      refusalMessageKey('place-build-order'),
      refusalMessageKey('purchase-materials'),
      refusalMessageKey('undo'),
      refusalMessageKey('redo'),
    ];
    expect(keys).toEqual([
      HUD_MESSAGE_KEY.refusalSetClock,
      HUD_MESSAGE_KEY.refusalPlaceBuildOrder,
      HUD_MESSAGE_KEY.refusalPurchaseMaterials,
      HUD_MESSAGE_KEY.refusalUndo,
      HUD_MESSAGE_KEY.refusalRedo,
    ]);
    // Not one generic sentence: each of the five leaves the prison in a
    // different state, and two of them are not a button at all -- the undo
    // pair is the case where the player pressed a key (#261), so the line is
    // the whole report -- while a refused purchase is the one that is about
    // money (#89). "That was refused" without saying what would leave them
    // guessing whether their wall is still queued and whether they paid.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('says nothing about a chrome intent, which has already been applied', () => {
    // Selecting a tab, folding a panel and arming the build tool all happen
    // locally before the host is told. "That did not go through" about a tab
    // that visibly did is a false statement, and the host still gets the
    // failure through `onError`.
    for (const actionId of ['select-tab', 'toggle-panel', 'arm-build-tool']) {
      expect(refusalMessageKey(actionId), actionId).toBeUndefined();
    }
  });

  it('says nothing about an action it has never heard of', () => {
    expect(refusalMessageKey('teleport-prisoner')).toBeUndefined();
  });

  /**
   * **The owner's ruling 18 of 2026-08-31.** A charge the standing overdraft
   * cannot carry is a *limit* being reached, and until this branch existed the
   * player was told only that the purchase "was refused and no money was
   * spent" -- true, and silent about the one fact that would change what they
   * do next.
   */
  it('names the floor when the floor is what refused, on both intents that cost money', () => {
    expect(refusalMessageKey('purchase-materials', 'past-the-overdraft-floor')).toBe(
      HUD_MESSAGE_KEY.refusalPurchaseMaterialsPastFloor,
    );
    expect(refusalMessageKey('hire-staff', 'past-the-overdraft-floor')).toBe(
      HUD_MESSAGE_KEY.refusalHireStaffPastFloor,
    );

    // And the two are distinct sentences, for the reason every member of this
    // family is: one prison has no materials on the way and the other has no
    // new staff member, and reading the wrong one sends the player to the
    // wrong panel.
    expect(refusalMessageKey('purchase-materials', 'past-the-overdraft-floor')).not.toBe(
      refusalMessageKey('hire-staff', 'past-the-overdraft-floor'),
    );

    // The generic sentence is what a refusal with no reason still reads, which
    // is every refusal the interface had before the ruling.
    expect(refusalMessageKey('purchase-materials')).toBe(HUD_MESSAGE_KEY.refusalPurchaseMaterials);
    expect(refusalMessageKey('hire-staff')).toBe(HUD_MESSAGE_KEY.refusalHireStaff);
    expect(refusalMessageKey('purchase-materials', undefined)).toBe(HUD_MESSAGE_KEY.refusalPurchaseMaterials);
  });

  it('does not let the reason invent a sentence for a control that has none', () => {
    /*
     * A reason is attached by the composition root to two intents and could be
     * attached to a third by mistake. Falling through to the control's own
     * sentence is the answer that cannot put a claim about money on a control
     * that never spends any -- and a chrome intent still says nothing at all.
     */
    expect(refusalMessageKey('set-clock', 'past-the-overdraft-floor')).toBe(HUD_MESSAGE_KEY.refusalSetClock);
    expect(refusalMessageKey('undo', 'past-the-overdraft-floor')).toBe(HUD_MESSAGE_KEY.refusalUndo);
    expect(refusalMessageKey('select-tab', 'past-the-overdraft-floor')).toBeUndefined();
  });
});
