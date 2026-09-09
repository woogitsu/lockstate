import { expect, test, type Page } from './network-changed-fixture';
import { expectNotClipped } from './clipping';
import type { HudViewModel } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * **The sentence the covered coverage rung says, on screen and whole**
 * (issues [#941](https://github.com/matmaxalez/lockstate/issues/941) and
 * [#989](https://github.com/matmaxalez/lockstate/issues/989)).
 *
 * ## What was measured, and why a browser is the only layer that can gate it
 *
 * The Security tab read `GUARD COVERAGE / 3 of 3 / Covered / This prison has
 * the guards it asks for.` beside `ON DUTY / 3 held * 1 free` in a prison that
 * produced 7 fights over in-game days 10-15 and lapsed **7 of 7** (the
 * five-tester round of 2026-09-04). Every word of that sentence was true:
 * `required` is `DeploymentSystem.requiredGuardCountFor`, the *posts* a sector
 * asks to have filled, and `IncidentResponseSystem` claims responders only
 * from guards it has **not** posted. The requirement is not the whole bill, and
 * nothing on the tab said so.
 *
 * `hud.security.coverage-met-hint` now reads *"Incidents and searches need free
 * guards."* Which key the rung picks and what that key resolves to are both
 * proven headlessly -- `tests/unit/ui-simulation-staff-coverage.test.ts` pins
 * the sentence verbatim and
 * `tests/integration/staff-coverage-readout.test.ts` carries the measurement
 * that justifies it. `vitest.config.ts` is `environment: 'node'` with no jsdom,
 * so `createStaffPanel` is **unreachable** from `pnpm test`: a sentence
 * composed perfectly and never appended, or appended into a box that cuts it,
 * passes every test in that suite.
 *
 * ## What #941 wrote here, and why #989 widened it
 *
 * **This file was authored on 2026-09-04 around *"Only free guards answer
 * incidents."*, which was true.** It named one consumer of the free pool and
 * there are two: `SearchSystem` staffs a contraband sweep from the same
 * `claimableGuardIds`, and `SectorSearchDutySystem` will not order a sweep at
 * all while that pool is empty -- so the prison this file paints, at `3 of 3 ·
 * Covered`, could no more search than respond. Measured at 1, 2 and 3 guards
 * over ~9 in-game days on one seed: 0 discoveries, 0 discoveries, finds. The
 * old sentence is quoted rather than deleted for `docs/AGENT_WORKFLOW.md` §4's
 * reason, and both are what the geometry section below is about.
 *
 * ## The clamp, which is the whole reason this file exists
 *
 * `hud.css` gives `.hud-staff__note` `display: -webkit-box` with
 * `-webkit-line-clamp: 1` at any viewport 700px tall or shorter, and the
 * coverage hint carries that class with no exemption. Measured on this harness
 * at 900x600 -- the one shipped viewport inside that band -- the hint's box is
 * **238px wide and 13.19px tall, one line** (the box follows the 13.2px
 * line-height; the font resolves to 11px, and the `13px` this paragraph used to
 * give for both was the line box rather than the type). A second line would be
 * cut with nothing on screen to say so.
 *
 * **That is a budget of 238px and it is what chose the words**, measured on
 * this harness rather than estimated: *"Only free guards answer incidents."*
 * renders at 191.7px, *"Incidents and searches need free guards."* at 227.7px,
 * and the obvious widening of the first -- *"Only free guards search or answer
 * incidents."* -- at **246.5px**, which the clamp would cut. The other four
 * shipped viewports resolve `line-clamp: none`, so 900x600 is the only one that
 * constrains anything, and `expectNotClipped` below is what fails if a later
 * sentence is authored without re-measuring.
 *
 * The consequence line below it (`.hud-staff__coverage-consequence`, the
 * owner's unguarded-rung wording of 2026-09-03) is the exempted element and is
 * deliberately **not** used here -- it stays on the unguarded rung alone, which
 * `tests/browser/ui-shell.spec.ts` holds.
 *
 * ## What was watched going red
 *
 * Recorded in the commit that lands this file, with both outputs, and written
 * so that no single mutation can hide a second hole: the key wiring, the
 * authored words and the geometry each fail a different assertion here.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * The five shipped viewports `ui-shell.spec.ts`'s own coverage block visits,
 * restated rather than imported: 900x600 is the only one inside `hud.css`'s
 * single-line clamp band, and 375x812 is the only one where the panel is
 * full-width, so a list that lost either would stop testing the thing this file
 * is about.
 */
const COVERAGE_VIEWPORTS = [
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

/**
 * The hint element, addressed by what it is *not*.
 *
 * `coverageHint` and `coverageConsequence` both carry `.hud-staff__note` and
 * only the second carries a class of its own (`staff-panel.ts`), so this is the
 * one selector that names the hint alone. Asserted to match exactly one element
 * below, because a selector that silently matched none would make every
 * geometry assertion in this file vacuous.
 */
const HINT = '.hud-staff__coverage > .hud-staff__note:not(.hud-staff__coverage-consequence)';

/** The prison #941 measured: the requirement met exactly, with one guard left over. */
const COVERED = { required: 3, assigned: 3, shortage: 0 } as const;

/**
 * Both readouts on one view model, because the harness cannot publish them one
 * after the other.
 *
 * **This is the trap that cost this file its first three runs, and it is worth
 * stating rather than working around silently.** `reportStaffCoverage` and
 * `reportHeldGuards` each call `hud.update({ ...BASE_VIEW_MODEL, <their own
 * field> })` (`tests/browser/ui-harness.ts`), so the second call **withdraws**
 * whatever the first published: the block goes `hidden`, its text nodes stay
 * behind, and `textContent` keeps reading the old sentence while
 * `getBoundingClientRect()` is 0x0 and `innerText` is `''`. A spec that read
 * `textContent` would report the figures it expected from a block the browser
 * never drew -- which is what the first version of the `On duty` assertion
 * below did, and why every reading here is paired with a `drawn` check taken
 * from `getClientRects()`.
 *
 * `setHudViewModel` is the harness method that takes a whole `HudViewModel`, so
 * one `update` paints both blocks. The counts and the clock are furniture: this
 * file asserts nothing about them, and they are here because `HudViewModel`
 * requires them.
 */
function coveredPrison(coverage: HudViewModel['staffCoverage']): HudViewModel {
  return {
    counts: {
      prisoners: 17,
      prisonerCapacity: 24,
      occupiedPlaces: 17,
      staff: 4,
      staffUnassigned: 0,
      rooms: 12,
      prisonersCovered: 17,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 0,
      prisonersHighRisk: 0,
      activeIncidents: 0,
      contrabandFound: 0,
      treasuryMinorUnits: 24_000,
      stateIncomeAccruedTodayMinorUnits: 1_200,
    },
    clock: { day: 13, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [],
    heldGuards: {
      held: 3,
      unassigned: 1,
      guards: [1, 2, 3].map((entityId) => ({
        entityId,
        claimLabelKey: 'guard-claim.deployment.name' as const,
        roleLabelKey: 'staff-role.guard.name' as const,
      })),
    },
    ...(coverage === undefined ? {} : { staffCoverage: coverage }),
  };
}

/**
 * `held` and `unassigned` are the figures the same tab printed -- `3 held * 1
 * free` -- so the sentence is asserted beside the readout a player reads it
 * with, rather than in a panel with no roster at all.
 */
async function paintCoveredPrison(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('security'))).toBe(true);
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), coveredPrison(COVERED));
}

interface HintReading {
  /** How many elements the hint selector matched: the vacuity witness. */
  readonly matched: number;
  readonly text: string | null;
  /** Whether the browser gave the hint a box at all -- 0x0 is a hidden block, not a rendered sentence. */
  readonly drawn: boolean;
  readonly width: number;
  readonly height: number;
  /** The clamp as the browser resolved it, so a run at 900x600 proves it was inside the band. */
  readonly lineClamp: string | null;
  /** The block's `data-tone`, so the sentence is never asserted on a rung the panel did not pick. */
  readonly tone: string | null;
  /** The header pair and the badge word beside the sentence. */
  readonly summary: string | null;
  readonly badge: string | null;
  /** The `On duty` header's own figures, which is where "free" points. */
  readonly heldSummary: string | null;
  /** Whether the browser gave the `On duty` block a box -- 0x0 with text in it is a withdrawn readout, not a rendered one. */
  readonly heldDrawn: boolean;
}

async function readHint(page: Page): Promise<HintReading> {
  return page.evaluate((selector) => {
    const panel = document.querySelector<HTMLElement>('.hud-staff');
    if (panel === null) throw new Error('no Staff panel in the mounted HUD');
    const block = panel.querySelector<HTMLElement>('.hud-staff__coverage');
    const hint = panel.querySelector<HTMLElement>(selector);
    const box = hint?.getBoundingClientRect();
    const text = (node: Element | null | undefined): string | null => node?.textContent?.trim() ?? null;
    return {
      matched: panel.querySelectorAll(selector).length,
      text: text(hint),
      drawn: hint !== null && hint.getClientRects().length > 0,
      width: box === undefined ? 0 : Math.round(box.width * 100) / 100,
      height: box === undefined ? 0 : Math.round(box.height * 100) / 100,
      lineClamp: hint === null ? null : getComputedStyle(hint).webkitLineClamp,
      tone: block?.dataset['tone'] ?? null,
      summary: text(panel.querySelector('.hud-staff__coverage-summary')),
      badge: text(block?.querySelector('.ui-badge')),
      heldSummary: text(panel.querySelector('.hud-staff__held-summary')),
      heldDrawn: (panel.querySelector('.hud-staff__held')?.getClientRects().length ?? 0) > 0,
    };
  }, HINT);
}

test.describe('the covered rung says what a free guard is for (#941, #989)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
  });

  test('renders the sentence whole at every shipped viewport, clamp included', async ({ page }) => {
    for (const [width, height] of COVERAGE_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await paintCoveredPrison(page);
      const reading = await readHint(page);
      const where = `${String(width)}x${String(height)}`;

      // Vacuity first: one element, drawn, on the rung this test is about.
      expect(reading.matched, `the hint selector matched ${String(reading.matched)} elements at ${where}`).toBe(1);
      expect(reading.drawn, `the coverage hint has no box at ${where}`).toBe(true);
      expect(reading.tone, `the panel did not pick the covered rung at ${where}`).toBe('success');

      expect(reading.text, `the covered sentence is wrong at ${where}`).toBe('Incidents and searches need free guards.');
      // The assertion the sentence #941 replaced would fail: it read "This
      // prison has the guards it asks for."
      expect(reading.text, `the panel is asserting a met requirement is enough at ${where}`).not.toContain('asks for');
      // And the one #941's own sentence would fail: it named incidents alone,
      // which is the half #989 found (`SearchSystem` claims from the same pool).
      expect(reading.text, `the sentence names only one of the two duties at ${where}`).toContain('searches');
      expect(reading.text, `an unresolved key reached the screen at ${where}`).not.toContain('hud.');

      /*
       * `expectNotClipped` rather than a `scrollHeight` of our own (#720): it
       * catches `spilled` as well as `cut`, and at 900x600 it is what fails if
       * a longer sentence is ever authored into this key without the clamp
       * being reckoned with.
       */
      await expectNotClipped(page, HINT, `the coverage block's sentence at ${where}`);
    }
  });

  test('leaves the figures beside it saying what they always said', async ({ page }) => {
    /*
     * The badge and the pair are what carry "the requirement is met" now that
     * the sentence does not, so a fix that quietly took either away would have
     * removed a true readout instead of a false one. `Covered` in particular is
     * **shared** with the status strip's COVERAGE chip
     * (`projection.ts`, `coverageBadge`), whose subject is prisoners on the
     * safety ladder rather than posts -- so it is deliberately untouched and
     * pinned here.
     */
    await page.setViewportSize({ width: 900, height: 600 });
    await paintCoveredPrison(page);
    const reading = await readHint(page);

    expect(reading.summary, 'the header pair stopped stating assigned against required').toBe('3 of 3');
    /*
     * **`3 of 3` cannot tell the two fields apart, and a mutation proved it.**
     * Rendering `required` from `coverage.assigned` in `paintCoverage` left
     * every assertion in this file green, because #941's own prison has
     * `assigned === required`. So the pair is read a second time in a covered
     * prison where they differ: a population that *fell* leaves more guards
     * posted than the sector now asks for, and `assignUnassignedGuards` never
     * un-posts anyone -- `shortage` is a summed per-sector figure and is not
     * `required - assigned` at this call site, which is what
     * `HudStaffCoverageViewModel` says in its own docblock.
     */
    await page.evaluate(
      (model) => window.lockstateUiHarness.setHudViewModel(model),
      coveredPrison({ required: 2, assigned: 3, shortage: 0 }),
    );
    const surplus = await readHint(page);
    expect(surplus.tone, 'a prison past its requirement is not on the covered rung').toBe('success');
    expect(surplus.summary, 'the header pair is not reading its two fields separately').toBe('3 of 2');
    expect(surplus.text, 'the sentence changed with the figures').toBe('Incidents and searches need free guards.');
    expect(reading.badge, 'the badge word moved').toBe('Covered');
    // Where "free" points: the block below, printing the reserve the sentence
    // is about. `1 free` is the prison #941 measured, and it lapsed 7 of 7.
    expect(reading.heldDrawn, 'the On duty block has no box, so its text proves nothing').toBe(true);
    expect(reading.heldSummary, 'the On duty figures are not beside the sentence').toBe('3 held · 1 free');
  });

  test('does not push the Staff panel into a scroll at any shipped viewport', async ({ page }) => {
    /*
     * The sentence is 40 characters against #941's 34 and the 39 of the one
     * before that, adds no element, and was measured at 227.7px in a 238px box
     * -- so this should be inert, which is exactly why it is measured rather
     * than asserted in prose. The coverage block is first in the panel body and
     * the hire control it prescribes is two blocks down, so a block that grew a
     * line would push a control below the fold.
     */
    for (const [width, height] of COVERAGE_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await paintCoveredPrison(page);
      const probe = await page.evaluate(() => window.lockstateUiHarness.staffProbe());
      const where = `${String(width)}x${String(height)}`;

      expect(probe.coverage.blockLaidOut, `the coverage block has no box at ${where}`).toBe(true);
      expect(
        probe.coverage.blockBox?.bottom ?? Number.POSITIVE_INFINITY,
        `the coverage block is below the Staff panel's fold at ${where}`,
      ).toBeLessThanOrEqual(probe.panelVisibleBottom);
      expect(probe.hireLabel.length, `the hire control is gone at ${where}`).toBeGreaterThan(0);
    }
  });
});
