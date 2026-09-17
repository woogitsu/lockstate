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
  'Delete Ironmoor? Every saved copy of this prison goes from your list. You can bring it back from this panel for one day, and after that it is gone for good. Its saves last changed 3 h ago.';
const CONFIRM_LABEL = 'Delete permanently';
const CANCEL_LABEL = 'Keep';
const KEPT_STATUS = 'Nothing was deleted.';
const DELETED_STATUS = 'Prison deleted. You can bring it back from the list below for one day.';

/** The undo window's own strings (ADR 0114), typed out for `CONFIRMATION`'s reason. */
const DELETED_ROW = 'Ironmoor — deleted. You can still bring it back.';
const RESTORE_LABEL = 'Bring it back';
const FORGET_LABEL = 'Free its space now';
const RESTORED_STATUS = 'Ironmoor is back, exactly as it was.';
const WINDOW_CLOSED_STATUS = 'Too late — that prison can no longer be brought back.';
const FORGOTTEN_STATUS = 'Gone for good. Nothing of that prison is kept now.';

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

  test('the guard refuses a deletion no confirmation ever armed', async ({ page }) => {
    await mountTwoPrisons(page);

    const reading = await page.evaluate(() => ({
      // Nothing armed at all.
      nothingArmed: window.lockstateUiHarness.confirmDeleteDirect('prison-1142'),
      deletedAfterFirst: window.lockstateUiHarness.deletedPrisons(),
    }));
    expect(reading.nothingArmed).toBe('refused-unconfirmed');
    expect(reading.deletedAfterFirst).toEqual([]);

    // And armed, but for a different prison.
    await rowDelete(page, 'prison-1142').click();
    const crossed = await page.evaluate(() => ({
      outcome: window.lockstateUiHarness.confirmDeleteDirect('prison-keep'),
      deleted: window.lockstateUiHarness.deletedPrisons(),
    }));
    expect(crossed.outcome).toBe('refused-unconfirmed');
    expect(crossed.deleted).toEqual([]);

    // The control is not inert: the same call for the armed prison is taken.
    const armed = await page.evaluate(() => window.lockstateUiHarness.confirmDeleteDirect('prison-1142'));
    expect(armed).toBe('started');
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });
    expect(await page.evaluate(() => window.lockstateUiHarness.deletedPrisons())).toEqual(['prison-1142']);
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

/**
 * **The undo window** (ADR 0114, accepted by the owner 2026-09-14).
 *
 * The confirmation above stopped one press from destroying a prison. This is
 * the half that makes the confirmation's own sentence true: the deletion is a
 * move into a `tombstones` object store in the same transaction, and the prison
 * can be brought back for a day.
 *
 * ## What only a browser can answer here
 *
 * `tests/unit/persistence-local-repository.test.ts` proves the window -- what
 * is kept, when it is swept, that a late press is refused by the repository's
 * own clock reading and destroys the copy as it refuses -- and
 * `tests/unit/ui-save-panel-delete.test.ts` proves every sentence against the
 * shipped catalogue. What neither can reach is `SavePanel.refresh`, which
 * writes to a real `document`: that a deleted prison gets a **row**, that the
 * row carries **two** controls, that pressing one puts the prison back on the
 * list and pressing the other does not.
 *
 * ## Why the second control is asserted as hard as the first
 *
 * It is the owner's ruling, and it is what pays for the window existing at
 * all. `save.status.quota-exceeded` tells a player that deleting a prison is
 * how storage is freed; an undo window that held the bytes for a day with no
 * way out would make that advice a day slower to follow, for exactly the player
 * who needs it most. A "Free its space now" button that rendered but did not
 * reach the controller would leave the screen looking identical --
 * `heldCopyCount()` is the reading that separates them.
 */
test.describe('a deleted prison can be brought back, or let go of now (ADR 0114)', () => {
  test('a deleted prison leaves the list and gets a row of its own', async ({ page }) => {
    await mountTwoPrisons(page);
    await rowDelete(page, 'prison-1142').click();
    await page.getByRole('button', { name: CONFIRM_LABEL }).click();
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });

    const reading = await page.evaluate(() => ({
      status: window.lockstateUiHarness.savePanelStatus(),
      liveRows: window.lockstateUiHarness.prisonRowCount(),
      deletedRows: window.lockstateUiHarness.deletedPrisonRowCount(),
      held: window.lockstateUiHarness.heldCopyCount(),
      laidOut: window.lockstateUiHarness.laidOut('[data-deleted-prison]'),
    }));

    // Gone from the prisons the player can load...
    expect(reading.liveRows).toBe(1);
    // ...and standing where they can reach it, laid out rather than merely in
    // the DOM (#218 section 6.6).
    expect(reading.deletedRows).toBe(1);
    expect(reading.held).toBe(1);
    expect(reading.laidOut).toBe(true);
    expect(reading.status).toBe(DELETED_STATUS);

    const row = page.locator('[data-deleted-prison="prison-1142"]');
    await expect(row.locator('.save-panel__item-label')).toHaveText(DELETED_ROW);
    await expect(row.locator('.save-panel__button')).toHaveText([RESTORE_LABEL, FORGET_LABEL]);
  });

  test('bringing it back puts the prison on the list again', async ({ page }) => {
    await mountTwoPrisons(page);
    await rowDelete(page, 'prison-1142').click();
    await page.getByRole('button', { name: CONFIRM_LABEL }).click();
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });

    expect(
      await page.evaluate(() => window.lockstateUiHarness.clickDeletedPrisonButton('prison-1142', 'Bring it back')),
    ).toBe(true);
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });

    const reading = await page.evaluate(() => ({
      status: window.lockstateUiHarness.savePanelStatus(),
      liveRows: window.lockstateUiHarness.prisonRowCount(),
      deletedRows: window.lockstateUiHarness.deletedPrisonRowCount(),
      held: window.lockstateUiHarness.heldCopyCount(),
      // The prison is back under its own name, which is the claim the sentence
      // makes: this reads the live row rather than the status line.
      liveLabels: [...document.querySelectorAll('[data-prison] .save-panel__item-label')].map(
        (node) => node.textContent ?? '',
      ),
    }));

    expect(reading.status).toBe(RESTORED_STATUS);
    expect(reading.liveRows).toBe(2);
    // The copy is spent rather than left behind to be restored a second time.
    expect(reading.deletedRows).toBe(0);
    expect(reading.held).toBe(0);
    expect(reading.liveLabels).toContain('Ironmoor (1 gen)');
  });

  test('a press after the window has closed is refused, and says so', async ({ page }) => {
    await mountTwoPrisons(page);
    await rowDelete(page, 'prison-1142').click();
    await page.getByRole('button', { name: CONFIRM_LABEL }).click();
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });

    // The row is still on screen -- nothing repaints on a clock, which is ADR
    // 0114 §3's whole point. The refusal comes from the layer below the panel,
    // so this is the state a player who left the tab open all day actually has.
    await page.evaluate(() => {
      window.lockstateUiHarness.setRestoreOutcome('window-closed');
    });
    expect(
      await page.evaluate(() => window.lockstateUiHarness.clickDeletedPrisonButton('prison-1142', 'Bring it back')),
    ).toBe(true);
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });

    const reading = await page.evaluate(() => ({
      status: window.lockstateUiHarness.savePanelStatus(),
      liveRows: window.lockstateUiHarness.prisonRowCount(),
      deletedRows: window.lockstateUiHarness.deletedPrisonRowCount(),
      held: window.lockstateUiHarness.heldCopyCount(),
    }));

    expect(reading.status).toBe(WINDOW_CLOSED_STATUS);
    // The prison did not come back, and the row that offered it is gone --
    // "can no longer be brought back" is true of the page as well as of disk.
    expect(reading.liveRows).toBe(1);
    expect(reading.deletedRows).toBe(0);
    expect(reading.held).toBe(0);
  });

  test('freeing the space now takes the copy without bringing the prison back', async ({ page }) => {
    await mountTwoPrisons(page);
    await rowDelete(page, 'prison-1142').click();
    await page.getByRole('button', { name: CONFIRM_LABEL }).click();
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });
    expect(await page.evaluate(() => window.lockstateUiHarness.heldCopyCount())).toBe(1);

    expect(
      await page.evaluate(() => window.lockstateUiHarness.clickDeletedPrisonButton('prison-1142', 'Free its space now')),
    ).toBe(true);
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });

    const reading = await page.evaluate(() => ({
      status: window.lockstateUiHarness.savePanelStatus(),
      forgotten: window.lockstateUiHarness.forgottenPrisons(),
      liveRows: window.lockstateUiHarness.prisonRowCount(),
      deletedRows: window.lockstateUiHarness.deletedPrisonRowCount(),
      held: window.lockstateUiHarness.heldCopyCount(),
    }));

    expect(reading.status).toBe(FORGOTTEN_STATUS);
    // The reading a rendered-only button cannot produce: the controller was
    // actually asked, and the copy is actually gone.
    expect(reading.forgotten).toEqual(['prison-1142']);
    expect(reading.held).toBe(0);
    expect(reading.deletedRows).toBe(0);
    // And the prison did not come back by the wrong door.
    expect(reading.liveRows).toBe(1);
  });

  test('the panel does not say there are no prisons while a deleted one can still come back', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate((nowMs) => {
      window.lockstateUiHarness.mountSavePanel({ nowMs });
      window.lockstateUiHarness.seedPrison('prison-1142', 'Ironmoor', nowMs - 60_000);
    }, NOW_MS);
    await page.evaluate(async () => {
      await window.lockstateUiHarness.refreshSavePanel();
    });
    await rowDelete(page, 'prison-1142').click();
    await page.getByRole('button', { name: CONFIRM_LABEL }).click();
    await page.evaluate(async () => {
      await window.lockstateUiHarness.settleSavePanel();
    });

    // `save.list.empty` is 'No prisons yet.', which would be false with a
    // restorable prison standing in the same list.
    await expect(page.locator('.save-panel__empty')).toHaveCount(0);
    await expect(page.locator('[data-deleted-prison="prison-1142"]')).toHaveCount(1);
  });
});
