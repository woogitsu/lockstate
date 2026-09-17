import type { HudAlertViewModel, HudViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **`DismissAlert` can be pressed at 375x812** (issue
 * [#1201](https://github.com/woogitsu/lockstate/issues/1201)).
 *
 * ## The defect this file is the gate over
 *
 * The alerts log is the only surface that issues `DismissAlert`, and it was
 * mounted inside `.hud__corner`, which `hud.css`'s `@media (max-width: 720px)`
 * block sets to `display: none`. So on a phone the log had **no box at all**:
 * measured on `57cffa10` before the fix, the dismiss control on a row that
 * carries a run of occurrences reported `getClientRects().length === 0`. A
 * control the game offers and the player cannot press is what constitution
 * article 5 and `docs/IDENTITY_V5_ROLLOUT.md`'s stage 5 closing criterion --
 * *"Każda obecna akcja ma osiągalną drogę"* -- are about, and
 * `tests/browser/unplaced-surfaces.spec.ts` recorded the state rather than
 * endorsing it, on purpose, so that it would be visible in a diff the day it
 * moved.
 *
 * The owner ruled on 2026-09-16 that it moves: *"Zamontuj fold w szynie poniżej
 * 720 px (zalecane)"* -- mount the fold in the rail, below 720 px. The
 * provenance is the weaker of the two kinds this repository distinguishes (a
 * clickable option's label, not a typed sentence), and
 * `docs/IDENTITY_V5_ROLLOUT.md` §"Stage 5" is the durable record.
 *
 * ## What is asserted, and what deliberately is not
 *
 * Three things, at the one viewport the ruling is about:
 *
 * 1. the dismiss control has a box;
 * 2. `document.elementFromPoint` at that box's centre resolves to the control
 *    or to something inside it -- a control under another layer is a control a
 *    player does not have, which is the distinction
 *    `app-shell.spec.ts`'s `#88` sweep draws;
 * 3. a real `click` on it produces `{ kind: 'dismiss-alert' }`.
 *
 * The third is what makes the first two more than geometry. Nothing here
 * asserts *where* in the rail the fold sits: the mount is the ruling, the
 * arrangement inside it is not, and a spec that pinned the ordering would fail
 * on a later layout pass without anything having broken.
 *
 * Above the breakpoint the same three questions are asked at 1440x900, so this
 * file fails if the fix reached a phone by taking the log off a desktop.
 *
 * A third spec asks the same question of a **full** log, because the arrival
 * state is the easy case: the fold the cap allows is taller than the phone
 * sheet's ceiling, so what that one is really about is whether the excess lands
 * in a box a finger can scroll. Its own block carries the measurement.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

const ROW_ID = 'event-7';

/**
 * A row that carries a run of occurrences, which is exactly and only what
 * `alertRowDismissal` gives a dismiss control to (ADR 0084 decision 2, and
 * `ui-alert-dismiss.spec.ts` is the gate over that rule itself).
 */
function alert(): HudAlertViewModel {
  return {
    id: ROW_ID,
    labelKey: 'hud.alerts.title',
    severity: 'warning',
    occurrences: { count: 3, firstSequence: 7, lastSequence: 9, statement: 'fight:cell-block-a' },
  };
}

/**
 * A full log: `MAX_EVENT_ALERT_ROWS` rows of the longest sentence
 * `src/content/default-locale-en.ts` ships on this channel
 * (`hud.alert.event.economy.construction-refused`, 77 characters), every one of
 * them dismissable.
 *
 * The worst case the cap allows, and it is what the second test needs: measured
 * at 375x812 this is a **667.00 px** fold in a rail sheet whose ceiling is
 * **536 px**, so the Overview panel is over its box by design and the question
 * is whether the excess lands somewhere a finger can reach.
 */
function fullLog(): HudAlertViewModel[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `event-${String(index)}`,
    labelKey: 'hud.alert.event.economy.construction-refused',
    severity: 'warning' as const,
    occurrences: { count: 3, firstSequence: index, lastSequence: index + 2, statement: `s-${String(index)}` },
  }));
}

function viewModel(): HudViewModel {
  return {
    counts: {
      prisoners: 42,
      prisonerCapacity: 48,
      occupiedPlaces: 42,
      staff: 11,
      staffUnassigned: 0,
      rooms: 23,
      prisonersCovered: 42,
      prisonersUnderstaffed: 0,
      prisonersUnguarded: 0,
      prisonersHighRisk: 6,
      activeIncidents: 0,
      contrabandFound: 3,
      treasuryMinorUnits: 24_920,
      stateIncomeAccruedTodayMinorUnits: 10_667,
    },
    clock: { day: 3, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [alert()],
    overview: {
      treasuryMinorUnits: 24_920,
      stateIncomeAccruedTodayMinorUnits: 10_667,
      dailyWageBillMinorUnits: 4_800,
    },
  };
}

interface DismissReading {
  /** In the DOM at all, so a miss is not read as an unreachable control. */
  readonly present: boolean;
  /** `getClientRects().length > 0` -- the measurement the defect failed. */
  readonly laidOut: boolean;
  /** `elementFromPoint` at the control's centre answers it or something inside it. */
  readonly ownsItsCentre: boolean;
  /** What answered instead, so a failure names the layer that is over it. */
  readonly coveredBy: string;
}

async function readDismissControl(page: Page): Promise<DismissReading> {
  return page.evaluate((rowId: string) => {
    const control = document.querySelector<HTMLButtonElement>(
      `.hud-alerts__list [data-alert="${rowId}"] .ui-icon-button`,
    );
    if (control === null) return { present: false, laidOut: false, ownsItsCentre: false, coveredBy: 'absent' };
    if (control.getClientRects().length === 0) {
      return { present: true, laidOut: false, ownsItsCentre: false, coveredBy: 'no box' };
    }
    const box = control.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      present: true,
      laidOut: true,
      ownsItsCentre: hit !== null && (control === hit || control.contains(hit)),
      coveredBy: hit === null ? 'nothing' : ((hit as HTMLElement).closest('[class]')?.className ?? hit.nodeName),
    };
  }, ROW_ID);
}

async function open(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  // The layout shell resolves the tier once at mount; the attribute it stamps
  // is what says the pass has run, exactly as `unplaced-surfaces.spec.ts` and
  // `hud-layout-shell.spec.ts` wait for it rather than for a duration.
  await expect(page.locator('.hud[data-layout-tier]')).toHaveCount(1);
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), viewModel());
}

const VIEWPORTS = [
  ['phone', 375, 812],
  ['desktop', 1440, 900],
] as const;

/**
 * `elementFromPoint` at the control's centre, after bringing it into view
 * **using only the scrolls a player has**.
 *
 * Lifted deliberately from `app-shell.spec.ts`'s `revealTheWayAPlayerCan`,
 * whose own comment carries why a bare `scrollIntoView` is the wrong gesture:
 * it scrolls `overflow: hidden` boxes too, which are scrollable by script and
 * by no finger, wheel or key -- so a row clipped out of one would be certified
 * pressable by a gesture the player cannot make. Only `auto` and `scroll` boxes
 * are moved here, which is exactly the claim this file wants to be able to make
 * about a full log on a phone.
 */
async function reachLastRow(page: Page): Promise<DismissReading> {
  return page.evaluate(() => {
    const controls = [
      ...document.querySelectorAll<HTMLButtonElement>('.hud-alerts__list [data-alert] .ui-icon-button'),
    ];
    const control = controls.at(-1) ?? null;
    if (control === null) return { present: false, laidOut: false, ownsItsCentre: false, coveredBy: 'absent' };

    const playerScrollable = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll';
    for (let ancestor = control.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (!playerScrollable(style.overflowY) || ancestor.scrollHeight <= ancestor.clientHeight) continue;
      const border = ancestor.getBoundingClientRect();
      const top = border.top + ancestor.clientTop;
      const bottom = top + ancestor.clientHeight;
      const rect = control.getBoundingClientRect();
      if (rect.bottom > bottom) ancestor.scrollTop += rect.bottom - bottom;
      else if (rect.top < top) ancestor.scrollTop += rect.top - top;
    }

    if (control.getClientRects().length === 0) {
      return { present: true, laidOut: false, ownsItsCentre: false, coveredBy: 'no box' };
    }
    const box = control.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      present: true,
      laidOut: true,
      ownsItsCentre: hit !== null && (control === hit || control.contains(hit)),
      coveredBy: hit === null ? 'nothing (outside the viewport)' : ((hit as HTMLElement).closest('[class]')?.className ?? hit.nodeName),
    };
  });
}

test.describe('DismissAlert is reachable at every viewport (#1201)', () => {
  for (const [tier, width, height] of VIEWPORTS) {
    test(`a dismissable alert row can be pressed at ${tier} (${String(width)}x${String(height)})`, async ({ page }) => {
      await open(page, width, height);
      const where = `${tier} ${String(width)}x${String(height)}`;

      const reading = await readDismissControl(page);
      expect(reading.present, `the dismissable row was never drawn at ${where}`).toBe(true);
      expect(reading.laidOut, `the dismiss control has no box at ${where} -- ${reading.coveredBy}`).toBe(true);
      expect(reading.ownsItsCentre, `the dismiss control is covered by ${reading.coveredBy} at ${where}`).toBe(true);

      // The half geometry cannot answer: the press has to reach the intent the
      // command is sent from, or the box is decoration.
      await page.locator(`.hud-alerts__list [data-alert="${ROW_ID}"] .ui-icon-button`).click();
      expect(
        await page.evaluate(() => window.lockstateUiHarness.hudIntents()),
        `pressing the dismiss control issued no dismissal at ${where}`,
      ).toEqual([JSON.stringify({ kind: 'dismiss-alert', rowId: ROW_ID })]);
    });
  }

  /**
   * **The full log, at the one viewport where the fold does not fit.**
   *
   * The arrival state above proves the mount; this proves the mount is not a
   * promise the rail cannot keep. Below 720 px `.hud__side` is capped at
   * `--hud-inspector-height` (536 px at 375x812) and `.hud__rail` is
   * `overflow: hidden`, so a panel that could not shrink would have its last
   * rows clipped by the rail with **no gesture that brings them back** -- which
   * is the same class of defect as the one the mount is fixing, moved down one
   * level. `.ui-panel.hud-overview`'s `flex: 0 1 auto; min-height: 0` inside
   * `hud.css`'s `@media (max-width: 720px)` block is what makes the panel's own
   * `overflow-y: auto` the thing that catches it instead.
   *
   * Measured at 375x812 with these eight rows: the fold is **667.00 px** of
   * content, the panel is **504.00 px** of box with **778 px** of scroll
   * height, and `.hud__side` sits exactly on its 536 px ceiling.
   */
  test('the last row of a full log can still be pressed at 375x812', async ({ page }) => {
    await open(page, 375, 812);
    await page.evaluate(
      (model) => window.lockstateUiHarness.setHudViewModel(model),
      { ...viewModel(), alerts: fullLog() },
    );

    const reading = await reachLastRow(page);
    expect(reading.present, 'a full log drew no dismissable rows at all').toBe(true);
    expect(reading.laidOut, `the last row's dismiss control has no box -- ${reading.coveredBy}`).toBe(true);
    expect(
      reading.ownsItsCentre,
      `the last row's dismiss control is covered by ${reading.coveredBy} at 375x812, after scrolling every box a player can scroll`,
    ).toBe(true);
  });
});
