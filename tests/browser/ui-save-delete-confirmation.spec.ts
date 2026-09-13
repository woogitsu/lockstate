import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **A prison is not destroyed by one press** (issue
 * [#1142](https://github.com/matmaxalez/lockstate/issues/1142), and the
 * owner's ruling of 2026-09-13).
 *
 * ## What it was, measured before this file existed
 *
 * `SavePanel.requestDelete` called `controller.deletePrison(prisonId)` on the
 * click and then wrote `save.status.deleted`. One layer down,
 * `PrisonSaveRepository.delete` (`src/persistence/local/repository.ts:467`)
 * walks every generation the slot references, deletes each, then deletes the
 * slot -- in one `readwrite` transaction, with no flag, no dry run and nothing
 * that could refuse. So the entire distance between a player's finger and the
 * permanent loss of a prison was a function call, and the only evidence of
 * intent was that a button had been pressed.
 *
 * The data layer is deliberately **unchanged** by this fix. A confirmation is
 * a fact about intent, intent is formed in the interface, and a repository
 * that asks its caller whether they are sure would be the wrong place for it.
 *
 * ## Why a browser, and what `pnpm test` proves instead
 *
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so every line of
 * `SavePanel` that builds an element or moves focus is **unreachable** from
 * the unit suite -- a mutation there survives because nothing can observe it.
 * The decisions are extracted into `src/ui/save-panel-delete.ts` and proven in
 * `tests/unit/ui-save-panel-delete.test.ts`; what only a real document can
 * answer is the four things this file asserts:
 *
 * - the question appears, and names the prison and the age of its saves;
 * - backing out deletes nothing -- read off the controller, not off the rows;
 * - confirming deletes exactly one prison, the armed one;
 * - the keyboard lands on a control that exists after either answer, which is
 *   constitution article 16 (*"Zamknięcie ma drogę powrotną ... Zamknięcie
 *   okna oddaje fokus dostępnemu wyzwalaczowi"*).
 *
 * ## Why the harness page rather than the assembled application
 *
 * The age sentence is a function of a timestamp, and a prison created through
 * the real controller is always seconds old -- `createPrison` stamps
 * `Date.now()`. Three of the four age forms would be unreachable, and the one
 * reachable form would be asserted against a clock that moves while the test
 * runs. The harness mounts the **real** `SavePanel` over a stub controller, so
 * a prison can be seeded at a known age against a frozen clock, and the panel
 * under test is the shipped one.
 *
 * ## What was watched going red
 *
 * Recorded in the pull request body with both outputs, per
 * `docs/AGENT_WORKFLOW.md` §3.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * The strings, typed out rather than resolved from the catalogue.
 *
 * `docs/TESTING.md` forbids a fixture that supplies both sides of a
 * comparison: reading the expected text out of `defaultMessageCatalogEn` would
 * hold for any wording, and the wording is exactly what
 * `AGENTS.md`'s fourth reservation makes this file responsible for.
 */
const CONFIRMATION =
  'Delete Ironmoor? Every saved copy of this prison goes, and this cannot be undone. Its saves last changed 3 h ago.';
const CONFIRM_LABEL = 'Delete permanently';
const CANCEL_LABEL = 'Keep';
const KEPT_STATUS = 'Nothing was deleted.';
const DELETED_STATUS = 'Prison deleted.';

/** A fixed clock and a prison three hours older than it. */
const NOW_MS = 1_757_000_000_000;
const THREE_HOURS_MS = 3 * 60 * 60 * 1_000;

/**
 * Two prisons, so "deletes exactly one" is an assertion rather than a
 * tautology, and so a confirmation can be aimed at the one that is not first
 * in the list.
 */
async function mountTwoPrisons(page: Page): Promise<void> {
  await page.goto(HARNESS_URL);
  await page.evaluate(
    ({ nowMs, olderBy }) => {
      window.lockstateUiHarness.mountSavePanel({ nowMs });
      // `updatedAt` descending is the order the panel renders
      // (`orderPrisonsForDisplay`), so Ironmoor is the second row.
      window.lockstateUiHarness.seedPrison('prison-keep', 'Westhollow', nowMs - 60_000);
      window.lockstateUiHarness.seedPrison('prison-1142', 'Ironmoor', nowMs - olderBy);
    },
    { nowMs: NOW_MS, olderBy: THREE_HOURS_MS },
  );
  await page.evaluate(async () => {
    await window.lockstateUiHarness.refreshSavePanel();
  });
}

/** The Delete control of the row for `prisonId`. Never a text lookup: two rows carry one each. */
function rowDelete(page: Page, prisonId: string) {
  return page.locator(`[data-prison="${prisonId}"] .save-panel__button`).last();
}

test.describe('a prison is not destroyed by one press (#1142)', () => {
  test('pressing Delete asks first, and asks about the prison the row named', async ({ page }) => {
    await mountTwoPrisons(page);

    // Before: no question on the page, and nothing deleted.
    expect(await page.evaluate(() => window.lockstateUiHarness.deleteConfirmationText())).toBe('');

    await rowDelete(page, 'prison-1142').click();

    const reading = await page.evaluate(() => ({
      question: window.lockstateUiHarness.deleteConfirmationText(),
      deleted: window.lockstateUiHarness.deletedPrisons(),
      rows: window.lockstateUiHarness.prisonRowCount(),
      // The one assertion a text read cannot make: the sentence is on the
      // page, laid out, rather than merely in the DOM (#218 section 6.6).
      laidOut: window.lockstateUiHarness.laidOut('[data-delete-confirm]'),
    }));

    expect(reading.question).toBe(CONFIRMATION);
    expect(reading.laidOut).toBe(true);
    // The whole of the issue: the press issued no intent.
    expect(reading.deleted).toEqual([]);
    expect(reading.rows).toBe(2);

    // And the confirmation is drawn against the row it belongs to, not at the
    // end of the list -- a question about the wrong row is worse than none.
    const confirmation = page.locator('[data-delete-confirm="prison-1142"]');
    await expect(confirmation).toHaveCount(1);
    await expect(confirmation.locator('.save-panel__button')).toHaveText([CONFIRM_LABEL, CANCEL_LABEL]);
  });

  test('the keyboard lands on the control that changes nothing', async ({ page }) => {
    await mountTwoPrisons(page);
    await rowDelete(page, 'prison-1142').click();

    // Not merely "somewhere reachable": on the non-destructive half of the
    // pair, so a stray Enter after the question appears keeps the prison.
    expect(await page.evaluate(() => window.lockstateUiHarness.focusedControlLabel())).toBe(CANCEL_LABEL);
  });

  test('backing out deletes nothing and hands the keyboard back to the row', async ({ page }) => {
    await mountTwoPrisons(page);
    await rowDelete(page, 'prison-1142').click();
    await page.getByRole('button', { name: CANCEL_LABEL }).click();

    const reading = await page.evaluate(() => ({
      question: window.lockstateUiHarness.deleteConfirmationText(),
      deleted: window.lockstateUiHarness.deletedPrisons(),
      rows: window.lockstateUiHarness.prisonRowCount(),
      status: window.lockstateUiHarness.savePanelStatus(),
      focused: window.lockstateUiHarness.focusedControlLabel(),
    }));

    expect(reading.deleted).toEqual([]);
    expect(reading.rows).toBe(2);
    expect(reading.question).toBe('');
    expect(reading.status).toBe(KEPT_STATUS);
    // Article 16: back to the trigger that opened it, which is still on the
    // page. `''` here would be `<body>` -- the keyboard dropped on the floor.
    expect(reading.focused).toBe('Delete');
    // And it is the *armed row's* Delete, not the other prison's.
    const focusedPrison = await page.evaluate(
      () => document.activeElement?.closest('[data-prison]')?.getAttribute('data-prison') ?? '',
    );
    expect(focusedPrison).toBe('prison-1142');
  });

  test('confirming deletes exactly one prison, and the keyboard lands somewhere reachable', async ({ page }) => {
    await mountTwoPrisons(page);
    await rowDelete(page, 'prison-1142').click();
    await page.getByRole('button', { name: CONFIRM_LABEL }).click();
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });

    const reading = await page.evaluate(() => ({
      deleted: window.lockstateUiHarness.deletedPrisons(),
      rows: window.lockstateUiHarness.prisonRowCount(),
      status: window.lockstateUiHarness.savePanelStatus(),
      question: window.lockstateUiHarness.deleteConfirmationText(),
      focused: window.lockstateUiHarness.focusedControlLabel(),
    }));

    expect(reading.deleted).toEqual(['prison-1142']);
    expect(reading.rows).toBe(1);
    expect(reading.status).toBe(DELETED_STATUS);
    expect(reading.question).toBe('');
    // The row and both confirmation controls are gone, so the keyboard cannot
    // go back to any of them. It goes to the panel's first standing control
    // rather than to `<body>`.
    expect(reading.focused).toBe('New prison');
    // The prison that was never armed is untouched and still listed.
    await expect(page.locator('[data-prison="prison-keep"]')).toHaveCount(1);
  });

  test('a confirmation aimed at one prison cannot be spent on another', async ({ page }) => {
    await mountTwoPrisons(page);
    // Arm the older prison, then press the *other* row's Delete. That is a
    // re-aim, so it must arm the new row and delete neither.
    await rowDelete(page, 'prison-1142').click();
    await rowDelete(page, 'prison-keep').click();

    const reading = await page.evaluate(() => ({
      deleted: window.lockstateUiHarness.deletedPrisons(),
      confirmations: document.querySelectorAll('[data-delete-confirm]').length,
      armed: document.querySelector('[data-delete-confirm]')?.getAttribute('data-delete-confirm') ?? '',
    }));

    expect(reading.deleted).toEqual([]);
    // One question at a time: two standing confirmations would be two ways to
    // destroy something with the same press.
    expect(reading.confirmations).toBe(1);
    expect(reading.armed).toBe('prison-keep');
  });
});
