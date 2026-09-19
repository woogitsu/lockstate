import type { HudAlertViewModel, HudViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * The alerts log's dismiss control is a function of the row's CURRENT state,
 * not of when the row happened to be built (issue #764).
 *
 * ## The promise being kept
 *
 * [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)
 * decision 2 -- *"a player can dismiss a row, and a recurrence is a new row"*,
 * accepted by the owner on 2026-09-01 -- makes dismissal something the channel
 * owes the player, and names the boundary in the same breath: *"the refusal and
 * protocol-fault rows are not dismissable"*, because `docs/HUD_PROJECTIONS.md`
 * gap 34 stays shut. `HudAlertViewModel.occurrences` is what separates the two
 * families, so the promise reads, exactly: **a row carries the control if and
 * only if it carries a run of occurrences right now**.
 *
 * `hud.ts` built the control only on the branch that *creates* a row, so what
 * it actually implemented was "if and only if it carried a run of occurrences
 * **the first time it was painted**". Those two sentences agree on every row the
 * live producers make today and disagree on a row that is reused and then gains
 * a count -- which is the state this file drives the HUD into directly.
 *
 * ## Why this is a browser test and not a unit test
 *
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so `paintAlerts`
 * is unreachable from `pnpm test` at all -- not merely untested. The defect is
 * a *DOM mutation* that never happens on the reuse path, so there is no pure
 * decision to extract and assert headlessly the way `hudAlertRowLabel` was: the
 * sentence on the row is already a pure function, and the control beside it is
 * the half that has to be watched in a real document.
 *
 * ## Why the harness page rather than the assembled app
 *
 * Because the state is not reachable from the live producers, which is the
 * whole of #764. `src/ui/simulation-events.ts` mints every one of its rows
 * through `eventAlertRow`, which always writes `occurrences: { count: 1, ... }`,
 * and `src/ui/simulation-alerts.ts` never writes the field at all; the two
 * families are keyed apart by `event-`, `refusal-` and `fault-` id prefixes, so
 * no id can cross between them. `setHudViewModel` is the only lever that
 * reaches the state, and reaching it is the point: the coupling is what is being
 * removed, so the test has to be able to state it even while no producer can.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** Any key that resolves; the sentence is not what this file is about. */
const ALERT_LABEL_KEY = 'hud.alerts.title';

const ROW_ID = 'event-7';

/**
 * What the row looks like before and after, differing in one field.
 *
 * The `id` is deliberately identical across the two, because a row with a new
 * id is a new row and `hud.ts` would build it -- control and all -- through the
 * path that was never broken. Identity is what makes this a reuse.
 */
function alert(occurrences: boolean): HudAlertViewModel {
  return {
    id: ROW_ID,
    labelKey: ALERT_LABEL_KEY,
    severity: 'warning',
    ...(occurrences
      ? {
          occurrences: {
            count: 3,
            firstSequence: 7,
            lastSequence: 9,
            statement: 'fight:cell-block-a',
          },
        }
      : {}),
  };
}

function viewModel(occurrences: boolean): HudViewModel {
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
    alerts: [alert(occurrences)],
  };
}

interface RowReading {
  /** Whether the row is in the list at all, so a miss is not read as an absent control. */
  readonly present: boolean;
  /** `data-alert-dismissible`, which is what the browser suite reads families apart by. */
  readonly flag: string | null;
  /**
   * Whether the row carries a real control, read off the DOM rather than off
   * the flag beside it.
   *
   * Both are asserted because either can be right while the other is wrong: a
   * flag with no button is a row the suite believes is dismissable and a player
   * cannot press, and a button with no flag is the reverse.
   */
  readonly hasControl: boolean;
  /** The control's accessible name. A glyph with no name is not a control. */
  readonly controlName: string;
  /** `true` while the control's box is inside the list's own visible box (#629, #220). */
  readonly controlOnScreen: boolean;
}

async function read(page: Page): Promise<RowReading> {
  return page.evaluate((rowId) => {
    const row = document.querySelector<HTMLElement>(`.hud-alerts__list [data-alert="${rowId}"]`);
    const control = row?.querySelector<HTMLButtonElement>('.ui-icon-button') ?? null;
    const list = document.querySelector<HTMLElement>('.hud-alerts__list');
    const inside = (): boolean => {
      if (control === null || list === null) return false;
      const box = control.getBoundingClientRect();
      const within = list.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.left >= within.left - 1 &&
        box.right <= within.right + 1 &&
        box.top >= within.top - 1 &&
        box.bottom <= within.bottom + 1
      );
    };
    return {
      present: row !== null,
      flag: row?.dataset['alertDismissible'] ?? null,
      hasControl: control !== null,
      controlName: control?.getAttribute('title') ?? '',
      controlOnScreen: inside(),
    };
  }, ROW_ID);
}

async function show(page: Page, occurrences: boolean): Promise<void> {
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), viewModel(occurrences));
}

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
});

test.describe('the alerts log dismiss control (ADR 0084 decision 2, issue #764)', () => {
  test('a reused row that gains occurrences grows the dismiss control', async ({ page }) => {
    await show(page, false);
    const before = await read(page);
    expect(before.present, 'the row the rest of this test is about was never drawn').toBe(true);
    // The starting state, asserted rather than assumed: a row with no run
    // carries no control, which is gap 34 staying shut.
    expect(before.hasControl).toBe(false);
    expect(before.flag).toBeNull();

    // Node identity, so the re-render below is provably a *reuse*. A rebuilt
    // row would satisfy every assertion after this one through the create path
    // that was never broken, and would prove nothing about #764.
    await page.evaluate(() => window.lockstateUiHarness.markAlertRows());

    await show(page, true);
    const after = await read(page);

    expect(
      (await page.evaluate(() => window.lockstateUiHarness.alertProbe())).reused,
      'the HUD rebuilt the row instead of reusing it, so this test is not measuring what it claims',
    ).toEqual([ROW_ID]);

    // The measurement #764 asked for. Before the fix this read `false`, `null`
    // and `''`: the row showed a repeat count with no way to clear it.
    expect(after.hasControl).toBe(true);
    expect(after.flag).toBe('true');
    expect(after.controlName).not.toBe('');
    expect(after.controlOnScreen, 'the control is in the DOM and not on screen, which does not count').toBe(true);
  });

  test('the control a reused row grew really dismisses that row', async ({ page }) => {
    await show(page, false);
    await show(page, true);

    await page.locator(`.hud-alerts__list [data-alert="${ROW_ID}"] .ui-icon-button`).click();

    // Not merely "a control exists": the one this fix adds is wired to the same
    // intent the create path's is, so what a player presses does what ADR 0084
    // decision 2 promises rather than nothing.
    expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toEqual([
      JSON.stringify({ kind: 'dismiss-alert', rowId: ROW_ID }),
    ]);
  });

  test('a reused row that loses its occurrences loses the control', async ({ page }) => {
    await show(page, true);
    expect((await read(page)).hasControl).toBe(true);

    await page.evaluate(() => window.lockstateUiHarness.markAlertRows());
    await show(page, false);
    const after = await read(page);

    expect(
      (await page.evaluate(() => window.lockstateUiHarness.alertProbe())).reused,
      'the HUD rebuilt the row instead of reusing it, so this test is not measuring what it claims',
    ).toEqual([ROW_ID]);

    // The other direction, and it is not symmetry for its own sake. A row that
    // kept a control it no longer qualifies for is a control that does nothing:
    // `src/main.ts`'s `dismiss-alert` case reads the run off the row through
    // `alertRowDismissal`, gets `undefined`, and returns without sending or
    // removing anything. That is a promise on screen the code does not keep,
    // which is the class `AGENTS.md`'s fourth exclusion is about.
    expect(after.hasControl).toBe(false);
    expect(after.flag).toBeNull();
  });
});
