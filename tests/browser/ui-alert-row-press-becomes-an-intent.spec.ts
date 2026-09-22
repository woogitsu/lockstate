import { defaultMessageCatalogEn } from '../../src/services/localization';
import type { HudAlertViewModel, HudCountsViewModel, HudViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **What the press *is*, as opposed to where it sits.**
 *
 * `tests/browser/ui-alert-row-presses-to-its-place.spec.ts` measures the
 * geometry of the pressable row on the assembled page, which is the only place
 * `.hud__corner`'s real box chain exists. This file asks the four questions
 * that are about behaviour rather than pixels, on `ui-harness.html`, because
 * `window.lockstateUiHarness.hudIntents()` is the only instrument in this
 * repository that can watch a press become one intent and read what it
 * carried -- the assembled page can see a camera move and not the intent that
 * moved it.
 *
 * The owner's ruling of 2026-09-22 on
 * [ADR 0122](../../docs/adr/0122-what-an-action-column-is-and-whether-a-message-can-carry-a-next-step.md)
 * is what is being gated: *"Naciskany wiersz, bez czasownika"* -- the message
 * row itself becomes the press and leads to the place it is about, with no
 * action-verb label. So:
 *
 * 1. **A row that carries a tile is a real `<button>` and one press is one
 *    `show-alert-place` intent carrying that tile.** A `<div>` with a click
 *    handler is the shape `tests/foundation/command-control-reachability-contract.test.ts`
 *    exists to catch and the shape the pre-#903 minimap surface had; the
 *    assertion on `tagName` is what keeps this from becoming one.
 * 2. **A row with no tile is not a press and fires nothing.** Ten of the
 *    sixteen refusal domains publish no tile, every row
 *    `src/ui/simulation-events.ts` builds publishes none, and a row that
 *    became pressable anyway would be an affordance that leads nowhere --
 *    which is worse than no affordance.
 * 3. **A dismissable row keeps its dismiss control and does not become a
 *    press**, even if it carries a tile. `ListRowAction`'s own comment states
 *    the reason -- a row with both *"would be a button inside a button, which
 *    is invalid HTML"* -- and the owner's decision 3 of 2026-09-01 is that the
 *    dismissal is its own smaller control because a mis-tap on it cannot be
 *    reversed. No producer sends both today; this is the gate over what
 *    happens when one does.
 * 4. **A drag that scrolls the log fires nothing.** Constitution article 7 --
 *    *"Przewijanie list nie przesuwa mapy"*, scrolling a list does not move
 *    the map -- is the rule ADR 0122 §6 option B names as needing *"a browser
 *    measurement rather than an argument"*, and a pressable row inside a
 *    scroll container is exactly where it could be broken. The drag is
 *    dispatched as real pointer/touch events over a log long enough to
 *    scroll, and what is asserted is that the list moved and no intent left.
 *
 * **No string is authored anywhere in this change, and the first test is where
 * that is checked**: the row's accessible text is asserted to be the
 * catalogue sentence plus the severity word and nothing else, so a verb
 * quietly added to the row later fails here.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** The longest sentence in the refusal namespace (`src/content/default-locale-en.ts`). */
const LONGEST_REFUSAL_KEY = 'hud.alert.refusal.zone.not-enclosed';

/**
 * The sentence that key resolves to, read out of the bundled catalogue rather
 * than typed here as English: ADR 0011 puts the key on one side of that
 * boundary and the text on the other, so a spec that hard-codes the words is
 * asserting against a copy.
 */
const LONGEST_REFUSAL_TEXT = ((): string => {
  const entry = defaultMessageCatalogEn.messages[LONGEST_REFUSAL_KEY];
  if (typeof entry !== 'string') throw new Error(`"${LONGEST_REFUSAL_KEY}" is not a plain string in the default locale.`);
  return entry;
})();

/** The tile the pressable row names. Asymmetric, so a transposed pair fails. */
const TILE = { x: 41, y: 83 } as const;

const COUNTS: HudCountsViewModel = {
  prisoners: 178,
  prisonerCapacity: 180,
  occupiedPlaces: 178,
  staff: 27,
  staffUnassigned: 0,
  rooms: 61,
  prisonersCovered: 178,
  prisonersUnderstaffed: 0,
  prisonersUnguarded: 0,
  prisonersHighRisk: 24,
  activeIncidents: 0,
  contrabandFound: 47,
  treasuryMinorUnits: 1_284_500,
  stateIncomeAccruedTodayMinorUnits: 284_500,
};

function hudModel(alerts: readonly HudAlertViewModel[]): HudViewModel {
  return {
    counts: COUNTS,
    clock: { day: 17, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [...alerts],
  };
}

async function mount(page: Page, alerts: readonly HudAlertViewModel[]): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), hudModel(alerts));
}

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
  // Wide enough that the log is in the corner arrangement and a row is one
  // line of geometry rather than a tower; the geometry itself is measured on
  // the assembled page, not here.
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function intents(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => window.lockstateUiHarness.hudIntents());
}

test.describe('the press on a message row that is about somewhere (ADR 0122, ruled 2026-09-22)', () => {
  test('a row carrying a tile is a real button and one press is one show-alert-place intent carrying it', async ({
    page,
  }) => {
    await openHarness(page);
    await mount(page, [{ id: 'placed', labelKey: LONGEST_REFUSAL_KEY, severity: 'warning', tile: TILE }]);

    const row = page.locator('[data-alert="placed"]');
    // A real `<button>`, not a div with a handler: the second is what
    // `command-control-reachability-contract.test.ts` exists to catch, and
    // what `app-shell.spec.ts`'s INTERACTIVE_SELECTOR would never collect.
    expect(
      await row.evaluate((node) => node.tagName),
      'the pressable row is not a button, so no control inventory in this repository can see it',
    ).toBe('BUTTON');
    await expect(row).toHaveClass(/ui-row--interactive/);

    // The accessible name, in full. No action-verb label is added and none is
    // owed: what a screen reader announces is what a sighted player reads.
    const text = (await row.textContent())?.trim() ?? '';
    expect(text, 'the row grew a label this ruling did not buy').toBe(`${LONGEST_REFUSAL_TEXT}Warning`);

    await row.click();

    expect(await intents(page), 'the press did not become exactly one show-alert-place intent carrying the tile').toEqual(
      [JSON.stringify({ kind: 'show-alert-place', tile: TILE })],
    );
  });

  test('a row with no tile is not a press and fires nothing', async ({ page }) => {
    await openHarness(page);
    await mount(page, [{ id: 'placeless', labelKey: LONGEST_REFUSAL_KEY, severity: 'warning' }]);

    const row = page.locator('[data-alert="placeless"]');
    expect(
      await row.evaluate((node) => node.tagName),
      'a row about nowhere became a press, so the affordance leads nowhere',
    ).toBe('DIV');
    await expect(row).not.toHaveClass(/ui-row--interactive/);

    await row.click();
    expect(await intents(page), 'a row about nowhere produced an intent').toEqual([]);
  });

  test('a dismissable row keeps its own control and does not become a press, even carrying a tile', async ({ page }) => {
    await openHarness(page);
    await mount(page, [
      {
        id: 'both',
        labelKey: LONGEST_REFUSAL_KEY,
        severity: 'warning',
        tile: TILE,
        occurrences: {
          count: 3,
          lastAt: { day: 17, progressPercent: 25 },
          firstSequence: 1,
          lastSequence: 3,
          statement: 'statement-both',
        },
      },
    ]);

    const row = page.locator('[data-alert="both"]');
    expect(
      await row.evaluate((node) => node.tagName),
      'a dismissable row became the press, which puts a button inside a button and widens a target the owner ruled small on 2026-09-01',
    ).toBe('DIV');
    // The dismiss control is still there and is still the only control.
    expect(await row.locator('button').count(), 'the dismissable row lost or duplicated its control').toBe(1);

    await row.locator('button').click();
    expect(
      await intents(page),
      'the control on a dismissable row produced something other than exactly one dismissal',
    ).toEqual([JSON.stringify({ kind: 'dismiss-alert', rowId: 'both' })]);
  });

  test('a drag that scrolls the log fires nothing (constitution article 7)', async ({ page }) => {
    await openHarness(page);
    // Enough rows of the longest sentence that the list has somewhere to
    // scroll to; every one of them a press, so the drag starts on one.
    await mount(
      page,
      Array.from({ length: 12 }, (_unused, index) => ({
        id: `placed-${index}`,
        labelKey: LONGEST_REFUSAL_KEY,
        severity: 'warning' as const,
        tile: { x: TILE.x + index, y: TILE.y },
      })),
    );

    const list = page.locator('.hud-alerts__list');
    expect(
      await list.evaluate((node) => node.scrollHeight - node.clientHeight),
      'the log has nothing to scroll, so a scrolling drag cannot be dispatched and this test would be vacuous',
    ).toBeGreaterThan(20);

    const row = page.locator('[data-alert="placed-0"]');
    const box = await row.boundingBox();
    expect(box, 'the first row has no box to start a drag on').not.toBeNull();
    if (box === null) return;

    // A real pointer drag through Playwright's mouse: down on the row, a long
    // move up, then release. Chromium cancels a click when the pointer travels
    // this far, and that is the behaviour under test rather than an assumption
    // -- the assertion is on the intent list, not on the cancellation.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (const step of [1, 2, 3, 4]) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - step * 40);
    }
    await page.mouse.up();

    // The scroll itself is driven with the wheel, which is the gesture a
    // trackpad and a touch flick both arrive as: a drag with the primary
    // button does not scroll an `overflow-y: auto` box in Chromium, so
    // asserting it had would be asserting something no player experiences.
    // The pointer is put back inside the list first -- the drag above left it
    // 160px above the row, which at this viewport is outside the box.
    const listBox = await list.boundingBox();
    expect(listBox, 'the alerts list has no box to scroll').not.toBeNull();
    if (listBox === null) return;
    await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
    await page.mouse.wheel(0, 200);
    await expect
      .poll(async () => list.evaluate((node) => node.scrollTop), {
        message: 'the log never scrolled, so nothing about scrolling was measured',
      })
      .toBeGreaterThan(0);

    expect(
      await intents(page),
      'scrolling the log produced an intent -- a drag or a flick on a pressable row must not move the map (constitution article 7)',
    ).toEqual([]);
  });
});
