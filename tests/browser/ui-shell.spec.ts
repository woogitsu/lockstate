import { type Page, expect, test } from './network-changed-fixture';
import { expectNotClipped, probeClipping } from './clipping';
import type {
  HudPrisonerDetailViewModel,
  HudPrisonerRosterViewModel,
  HudRegimeViewModel,
  HudViewModel,
} from '../../src/ui/hud';
import { EVENT_BAND_DWELL_FLOOR_MS, EVENT_BAND_HOLD_CEILING_MS } from '../../src/ui/hud/event-band-dwell';
import { MAX_ROOM_SIDE_TILES } from '../../src/ui/hud/rooms-panel';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * Real-browser verification for `src/ui/`.
 *
 * Two things live here because nothing below this layer can prove them.
 *
 * **Issue #65** — that a second "New prison" tap while the first is still in
 * flight is *refused rather than issued*, and that the eventual failure
 * reaches the player instead of `window.onunhandledrejection`. The refusal
 * mechanism itself is proven headlessly in
 * `tests/unit/ui-async-action-gate.test.ts`; what needs a browser is that a
 * real click on a real disabled button really does nothing, and that a real
 * `unhandledrejection` event never fires. A fake DOM can assert neither.
 *
 * **The HUD's computed presentation** — "every number uses a monospace face
 * with tabular figures" and "the centre of the screen stays free for the
 * world" are facts about *computed* style and hit-testing. Only a browser
 * resolves a font stack or answers `elementFromPoint`.
 *
 * Everything provable without a browser stays in `tests/unit/`, per
 * docs/TESTING.md's "use the lowest layer that proves the behavior".
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

test('FullHD save panel starts compact, keeps status visible and opens by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
  await page.evaluate(() => window.lockstateUiHarness.mountSavePanel());

  const panel = page.locator('.save-panel');
  const disclosure = panel.locator('details');
  const summary = panel.locator('summary');
  await expect(disclosure).not.toHaveAttribute('open', '');
  await expect(summary).toBeVisible();
  await expect(panel.locator('.save-panel__status')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'New prison' })).toBeHidden();

  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(panel.getByRole('button', { name: 'New prison' })).toBeVisible();
  await expect(summary).toBeFocused();

  await page.evaluate(() => window.lockstateUiHarness.clickSaveButton('New prison'));
  await summary.click();
  await page.evaluate(() => window.lockstateUiHarness.releaseCreate('worker-timeout'));
  await page.evaluate(() => window.lockstateUiHarness.settleSavePanel());
  await expect(disclosure).not.toHaveAttribute('open', '');
  await expect(panel.locator('.save-panel__status')).toContainText('did not reply within 15000ms');
  await expect(panel.locator('.save-panel__status')).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(summary).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('button', { name: 'New prison' })).toBeVisible();
});

/**
 * Pairs a rendered-text assertion with the fact that the text is on screen.
 *
 * Every text assertion in this file reads the DOM -- through a probe's
 * `textContent`, or through a Playwright `toHaveText`/`toContainText` -- and
 * none of those imply visibility. A `display: none` on the element or on any
 * ancestor leaves every one of them green while the player sees nothing,
 * which is exactly how a live defect hid: `hud.css` drops `.hud__corner` at
 * 720px and below, so a rendered-text assertion on a region inside it passed
 * on a phone where the region is not laid out at all (#218 section 6.6).
 *
 * Two assertions in this file are deliberately *not* paired with this, and
 * say so at their own sites: the `refusalProbe` calls that require
 * `visible: false` (the refusal line starts `hidden` and its text is read in
 * that state on purpose), and `hudText()`, which reads `innerText` -- already
 * rendered text, so it answers the visibility question itself.
 */
async function expectLaidOut(page: Page, selector: string, what: string): Promise<void> {
  expect(
    await page.evaluate((s) => window.lockstateUiHarness.laidOut(s), selector),
    `${what} (${selector}) is not laid out, so the text asserted above is not on screen`,
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
});

test.describe('save panel concurrency (issue #65)', () => {
  test('a second create while one is in flight is refused, not issued', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountSavePanel());

    expect(await page.evaluate(() => window.lockstateUiHarness.clickSaveButton('New prison'))).toBe(true);

    // The controls are disabled for exactly as long as the request is out.
    const busyState = await page.evaluate(() => window.lockstateUiHarness.saveButtonState('New prison'));
    expect(busyState).toEqual({ found: true, disabled: true, ariaBusy: 'true' });

    // Every action is gated, not just the one that was clicked: they all end
    // up talking to the same session controller.
    expect(await page.evaluate(() => window.lockstateUiHarness.saveButtonState('Save now'))).toMatchObject({
      disabled: true,
    });

    // A real click on a real disabled button.
    await page.evaluate(() => window.lockstateUiHarness.clickSaveButton('New prison'));
    await page.evaluate(() => window.lockstateUiHarness.clickSaveButton('New prison'));

    // The second and third taps never reached the controller, so no second
    // slot row was written. That row is the `New Prison (0 gen)` orphan.
    expect(await page.evaluate(() => window.lockstateUiHarness.createCalls())).toBe(1);
    expect(await page.evaluate(() => window.lockstateUiHarness.prisonRowCount())).toBe(1);
  });

  test('a worker timeout reaches the player and never leaks an unhandled rejection', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountSavePanel());
    await page.evaluate(() => window.lockstateUiHarness.clickSaveButton('New prison'));

    // The exact failure issue #65 reported: `Uncaught (in promise) Error: The
    // simulation worker did not reply within 15000ms`.
    await page.evaluate(() => window.lockstateUiHarness.releaseCreate('worker-timeout'));
    await page.evaluate(() => window.lockstateUiHarness.settleSavePanel());

    expect(await page.evaluate(() => window.lockstateUiHarness.savePanelStatus())).toContain(
      'did not reply within 15000ms',
    );
    // "Reaches the player" is a claim about the screen, not about the DOM.
    await expectLaidOut(page, '.save-panel__status', 'the save panel status line');

    // A rejection reaching here is the defect, not a symptom of it.
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
  });

  test('the controls come back after a failure, so one error does not wedge the panel', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountSavePanel());
    await page.evaluate(() => window.lockstateUiHarness.clickSaveButton('New prison'));
    await page.evaluate(() => window.lockstateUiHarness.releaseCreate('worker-timeout'));
    await page.evaluate(() => window.lockstateUiHarness.settleSavePanel());

    expect(await page.evaluate(() => window.lockstateUiHarness.saveButtonState('New prison'))).toEqual({
      found: true,
      disabled: false,
      ariaBusy: 'false',
    });

    await page.evaluate(() => window.lockstateUiHarness.clickSaveButton('New prison'));
    expect(await page.evaluate(() => window.lockstateUiHarness.createCalls())).toBe(2);
  });
});

/**
 * Issue #287: the player can load a save file they exported.
 *
 * `SessionController.importInto` existed, was exported, was reachable, and
 * nothing called it -- so the application could write a save file it could not
 * read back. What needs a browser here is the half no headless layer has:
 * `tests/unit/ui-save-panel-status.test.ts` proves the mappings and
 * `tests/unit/persistence-local-repository.test.ts` proves the import path,
 * and both of them passed for as long as the control did not exist. A real
 * `<input type="file">`, a real file chooser and a real `File.text()` are what
 * this layer adds.
 *
 * The stub controller is what makes the four refusals drivable: each is a
 * `SaveImportResult` the real persistence layer can produce (see
 * `IMPORT_OUTCOMES` in `ui-harness.ts`), and reproducing a save from a *newer*
 * schema version against the real repository would mean writing one this build
 * cannot write. The round trip against the real thing -- export a session,
 * import the bytes back -- is in `tests/browser/app-shell.spec.ts`, where there
 * is a simulation worker and an IndexedDB to round-trip through.
 */
test.describe('importing a save file (issue #287)', () => {
  /**
   * Deliberately not a valid envelope. What the panel must do with the bytes
   * is hand them to the importer unexamined: whether they are a save is
   * `decodeSaveEnvelope`'s question, and a second opinion about the save
   * format in `src/ui/` would be the copy that rots.
   */
  const SAVE_TEXT = '{"saveSchemaVersion":4,"prisonId":"prison-1","payload":{"tick":7}}';

  /** Presses Import and answers the chooser with `text`, exactly as a player choosing a file does. */
  async function chooseFile(page: Page, text: string, name = 'prison-1.lockstate.json'): Promise<void> {
    const chooser = page.waitForEvent('filechooser');
    // A real click on the real button, not a harness shortcut: the file
    // chooser is opened by the control and that is half of what is under test.
    await page.locator('.save-panel__button', { hasText: 'Import' }).click();
    await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
  }

  const status = (page: Page) => page.locator('.save-panel__status');

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountSavePanel());
    await page.evaluate(() => window.lockstateUiHarness.refreshSavePanel());
    // A save file goes into a prison, and `importInto` needs one that exists.
    await page.evaluate(() => window.lockstateUiHarness.activateSession('prison-1'));
  });

  test('the control is on screen beside Export, and offers a file chooser', async ({ page }) => {
    await expect(page.locator('.save-panel__button', { hasText: 'Import' })).toBeVisible();
    await expectLaidOut(page, '.save-panel__actions', 'the save panel actions row');

    const chooser = page.waitForEvent('filechooser');
    await page.locator('.save-panel__button', { hasText: 'Import' }).click();
    expect((await chooser).isMultiple(), 'one save at a time').toBe(false);
  });

  test('the chosen file reaches the importer, and the import becomes the live session', async ({ page }) => {
    await chooseFile(page, SAVE_TEXT);

    await expect(status(page)).toHaveText('Imported the save file into this prison (generation imported-gen-1).');
    await expectLaidOut(page, '.save-panel__status', 'the save panel status line');

    // The assertion that fails if the control is inert. A button that opened a
    // chooser, read the file and dropped it would leave this empty while every
    // rendered-text assertion above still passed.
    expect(await page.evaluate(() => window.lockstateUiHarness.importedRaw())).toEqual([
      JSON.stringify(JSON.parse(SAVE_TEXT)),
    ]);
    // And a save that reached storage and was never loaded would leave the
    // player looking at their old game. Import means the file becomes the game.
    expect(await page.evaluate(() => window.lockstateUiHarness.loadedPrisons())).toEqual(['prison-1']);
    await expect(page.locator('.save-panel__detail')).toContainText('Restored:');

    // The input existed for the choice and does not outlive it. A permanently
    // hidden file input would be a control that is never laid out, which
    // `app-shell.spec.ts`'s reachability sweep accounts for and would fail on.
    expect(await page.locator('.save-panel input').count()).toBe(0);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
  });

  test('a save from an older version reports that it was brought up to date', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.setImportOutcome('ok-migrated'));
    await chooseFile(page, SAVE_TEXT);

    // The player-visible evidence that the migration chain ran on the way in.
    await expect(status(page)).toContainText('older version of Lockstate');
    await expect(status(page)).toContainText('imported-gen-2');
    expect(await page.evaluate(() => window.lockstateUiHarness.loadedPrisons())).toEqual(['prison-1']);
  });

  test('a file that is not JSON is refused here and never reaches persistence', async ({ page }) => {
    await chooseFile(page, '<html>a web page, not a save</html>', 'not-a-save.json');

    await expect(status(page)).toHaveText('That file is not a Lockstate save — choose a file exported from this game.');
    await expectLaidOut(page, '.save-panel__status', 'the save panel status line');
    expect(await page.evaluate(() => window.lockstateUiHarness.importedRaw())).toEqual([]);
    expect(await page.evaluate(() => window.lockstateUiHarness.loadedPrisons())).toEqual([]);
    expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
  });

  test('each refusal says something different, and none of them loads anything', async ({ page }) => {
    const sentences: string[] = [];
    for (const outcome of ['not-a-save', 'unsupported-version', 'invalid-shape', 'checksum-mismatch'] as const) {
      await page.evaluate((name) => window.lockstateUiHarness.setImportOutcome(name), outcome);
      await chooseFile(page, SAVE_TEXT);
      // Each one is a rejection, so the panel is never left saying "reading".
      await expect(status(page)).not.toHaveText('Reading the save file…');
      sentences.push(await status(page).innerText());
    }

    // Four refusals, four sentences. One "import failed" for all four would
    // pass every assertion above.
    expect(new Set(sentences).size, sentences.join(' | ')).toBe(4);
    expect(sentences[0]).toContain('not a Lockstate save');
    expect(sentences[1]).toContain('newer version of Lockstate');
    expect(sentences[2]).toContain('could not be read');
    expect(sentences[3]).toContain('checksum');
    // The file reached the importer every time -- these are the importer's own
    // refusals -- and nothing was ever made live.
    expect(await page.evaluate(() => window.lockstateUiHarness.importedRaw())).toHaveLength(4);
    expect(await page.evaluate(() => window.lockstateUiHarness.loadedPrisons())).toEqual([]);
  });

  test('with no prison to import into, it says so and imports nothing', async ({ page }) => {
    // A fresh panel: the stub has no active session again.
    await page.evaluate(() => window.lockstateUiHarness.mountSavePanel());
    await page.evaluate(() => window.lockstateUiHarness.refreshSavePanel());

    await chooseFile(page, SAVE_TEXT);

    await expect(status(page)).toHaveText('No active prison — create or load one first.');
    expect(await page.evaluate(() => window.lockstateUiHarness.importedRaw())).toEqual([]);
  });

  test('the import is gated like every other action, and the panel comes back after it', async ({ page }) => {
    await chooseFile(page, SAVE_TEXT);
    await expect(status(page)).toContainText('Imported');

    // The gate released: every control is live again, so one import does not
    // wedge the panel (issue #65's property, for the new action).
    for (const label of ['New prison', 'Save now', 'Export', 'Import']) {
      expect(
        await page.evaluate((name) => window.lockstateUiHarness.saveButtonState(name), label),
        label,
      ).toEqual({ found: true, disabled: false, ariaBusy: 'false' });
    }

    // And a second import works, which is what "comes back" means. Polled,
    // because `setFiles` resolves when the chooser is answered and the panel's
    // work starts on the `change` event after it.
    await chooseFile(page, SAVE_TEXT);
    await expect
      .poll(async () => (await page.evaluate(() => window.lockstateUiHarness.importedRaw())).length, {
        message: 'the second import never reached the importer',
      })
      .toBe(2);
  });
});

/**
 * Issue #208: every player-facing string in the save panel comes from the
 * catalog.
 *
 * ADR 0011 names the pseudo-locale as the tool for this exact question --
 * "it exposes hard-coded strings (they stay unaccented)" -- and this is the
 * first place it is pointed at a real UI. Until #208 the panel held about
 * thirty English literals and passed both localization gates: the HUD's
 * registry gate collects only `src/ui/hud/**` and `src/ui/primitives/**`,
 * and the repository-wide one asks whether the keys a file *declares*
 * resolve, which a file declaring none satisfies trivially.
 *
 * It needs a browser because the claim is about what the *panel renders*,
 * not about what its mapping functions return: `tests/unit/ui-save-panel-status.test.ts`
 * proves the keys resolve, and proved it while `heading.textContent =
 * 'Prisons'` sat three lines away.
 */
test.describe('save panel localization (issue #208)', () => {
  test('renders nothing that is not in the catalog, checked in the pseudo-locale', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountSavePanel({ pseudoLocale: true }));
    // The empty-list row is painted by `refresh`, not by the constructor,
    // and it is one of the strings that was hard-coded.
    await page.evaluate(() => window.lockstateUiHarness.refreshSavePanel());

    const rendered = await page.evaluate(() => window.lockstateUiHarness.savePanelText());

    // The panel's default state: its accessible name, its heading, three
    // buttons, the empty-list row and the status line. A shrinking list here
    // would make the assertion below vacuous.
    expect(rendered.length).toBeGreaterThanOrEqual(7);

    // `pseudoLocalizeText` brackets everything it resolves. A string the
    // module hard-codes never passes through the localizer, so it arrives
    // unbracketed -- which is what every one of these was before #208.
    const notLocalized = rendered.filter((text) => !text.startsWith('⟦') || !text.endsWith('⟧'));
    expect(notLocalized, 'these strings never went through the localizer').toEqual([]);

    // The strings above were read out of the DOM, which a hidden panel still
    // has. #208 is about what a player reads, so the panel has to be on
    // screen for the check above to be about anything.
    await expectLaidOut(page, '.save-panel', 'the save panel');
  });

  test('still renders the default locale word for word', async ({ page }) => {
    // The other direction: routing the strings through the catalog must not
    // have changed what an English player reads. These are the exact strings
    // the panel showed before it had any keys at all.
    await page.evaluate(() => window.lockstateUiHarness.mountSavePanel());
    await page.evaluate(() => window.lockstateUiHarness.refreshSavePanel());

    expect(await page.evaluate(() => window.lockstateUiHarness.savePanelText())).toEqual([
      'Prison saves',
      'Prisons',
      'New prison',
      'Save now',
      'Export',
      'Import',
      'No prisons yet.',
      'Local saves only — no network required.',
    ]);
    await expectLaidOut(page, '.save-panel', 'the save panel');
  });
});

test.describe('HUD shell', () => {
  test('renders the status strip and leaves the centre of the screen to the world', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    const probe = await page.evaluate(() => window.lockstateUiHarness.hudProbe());

    expect(probe.metricIds).toEqual([
      'prisoners',
      // Issue #703's high-risk chip, second for the same kind of reason
      // `coverage` is third: it is `prisoners` at a second grain -- the subset of
      // the population on the restricted regime -- so the two read as one
      // sentence. `src/ui/hud/projection.ts` argues it, with the measurement
      // that decided the position against appending it.
      'high-risk',
      'staff',
      // Issue #588's guard-coverage chip, placed beside `staff` rather than
      // appended: it is a staffing readout whose only remedy is the control
      // the chip to its left counts. `src/ui/hud/projection.ts` argues it.
      'coverage',
      'rooms',
      'incidents',
      'contraband',
      'funds',
      'earned-today',
    ]);
    // `24,920` and not `249.20`: the balance is shown in the units the
    // simulation holds it in, because #96 named no currency and dividing by a
    // hundred would decide one in a chip (#96, ADR 0017). `10,667` is the same
    // units and the same treatment, and it is the accrual this fixture's own
    // clock and population imply rather than a round number (#29) -- so a chip
    // that reformatted or rescaled either figure is visible here.
    // `100` is `BASE_VIEW_MODEL.counts.prisonersCovered` -- the top rung of the
    // coverage chip, with the other two rungs in its badge rather than in a
    // value of their own (issue #588).
    // `0` in second place is the high-risk count (#703): `BASE_VIEW_MODEL.counts`
    // carries `prisonersHighRisk: 0`, and a chip reading anything else here
    // would mean it had been wired to another field of the same payload.
    expect(probe.metricValues).toEqual(['142', '0', '27', '100', '61', '0', '4', '24,920', '10,667']);
    expect(probe.activeTab).toBe('overview');
    // Paused on day 3, a quarter of the way through it: exactly one transport
    // control is pressed, and the clock reads the simulation's own units.
    expect(probe.pressedTransport).toEqual(['Pause']);
    expect(probe.clockDay).toBe('3');
    expect(probe.clockDayProgress).toBe('25%');

    // Every number above came out of `textContent`, which a `display: none`
    // subtree still answers. "Renders the status strip" is only true if the
    // browser laid the strip out.
    await expectLaidOut(page, '.ui-stat .ui-stat__value', 'the strip metric values');
    await expectLaidOut(page, '.hud-clock__day', 'the clock day');
    await expectLaidOut(page, '.hud-clock__day-progress', 'the clock day progress');

    // The HUD frames the world; it does not cover it.
    expect(probe.centreIsClickThrough).toBe(true);
  });

  test('every number is monospace with tabular figures', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    const probe = await page.evaluate(() => window.lockstateUiHarness.hudProbe());

    // A counter that changes width as it counts makes a dense strip twitch.
    // Only the browser can confirm the *computed* font stack and numeric
    // variant, which is why this assertion lives here and not in a unit test.
    expect(probe.valueCount).toBeGreaterThan(5);
    expect(probe.nonMonospaceValues).toEqual([]);
    /*
     * `getComputedStyle` answers for a `display: none` element too, so the
     * count above and the filter behind it would both survive a strip that was
     * never laid out. "Every number" means every number on screen.
     *
     * `:not(.hud-layout__body *)` excludes the Layout menu's drawer (#1159),
     * matching the selector `hudProbe` counts over -- the drawer hangs from the
     * strip and carries a clock readout, and it is `hidden` until a player
     * opens it, so it is not a number on screen until then. That claim is not
     * dropped: `tests/browser/hud-layout-shell.spec.ts` asserts the drawer's
     * own readouts are monospace with tabular figures, in the one state where
     * they are also laid out.
     */
    await expectLaidOut(page, '.hud-strip .ui-value:not(.hud-layout__body *)', 'the strip values');
  });

  test('tabs respond, moving both the selection and the reported intent', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).activeTab).toBe('build');
    expect(await page.locator('.ui-tab[data-tab="build"]').getAttribute('aria-current')).toBe('true');
    expect(await page.locator('.ui-tab[data-tab="overview"]').getAttribute('aria-current')).toBeNull();

    await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
    expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toEqual([
      JSON.stringify({ kind: 'select-tab', tab: 'build' }),
      JSON.stringify({ kind: 'select-tab', tab: 'manage' }),
    ]);
  });

  /**
   * **No section name wraps to a second line at the narrowest viewport**, and
   * this exists because one did, on the day the sections were renamed.
   *
   * ADR 0022's own measurement is about *width* -- a nine-character label puts
   * `.hud-tabs__inner` outside the 375px viewport -- and the section names
   * were chosen against it: the longest went from 8 characters (`Overview`,
   * `Security`) to 8 (`Overview`, `Day plan`), which passed every width
   * assertion in this file. It cost height instead, because `.ui-tab__label`
   * sets no `white-space` and a label with a **space in it** breaks at the
   * space when the tab is squeezed to its `min-width`.
   *
   * Measured at 375x812 on 2026-09-14, with `Day plan` and then with the
   * one-word `Schedule` that replaced it:
   *
   * | label | its label box | the tab bar |
   * |---|---|---|
   * | `Day plan` | 26.4px — two line boxes | 82.4px |
   * | `Schedule` | 13.2px — one, like every other tab | 69.2px |
   *
   * Those 13.2px come off the rail, and they were enough to put a delivery
   * row's Cancel outside the Build panel's visible box:
   * `build-deliveries-outside-the-fold.spec.ts` went red on this branch at
   * 375x812 and is green on `2e5cac4e`, which is how the wrap was found.
   * Every other tab's label box is 13.2px here, so the assertion is that no
   * label is taller than the shortest of them rather than a pinned pixel
   * count.
   *
   * **THE VIEWPORT MOVED FROM 375x812 TO 721x420 ON 2026-09-16, AND THE
   * PARAGRAPHS ABOVE ARE KEPT BECAUSE THEY ARE THE MEASUREMENT THE RULE WAS
   * BUILT ON.** The owner ruled that below 721px a tab shows its icon and not
   * its name (#1192), so at 375x812 there is no drawn label left to wrap and
   * this test would have been **vacuously green**: every label is a 1px
   * `.ui-sr-only` box there. A wrap is still a defect wherever the name *is*
   * drawn, which is every viewport above the break, so the test follows the
   * label rather than being deleted with it. 721x420 is the narrowest width
   * above the break, with a height short enough to keep the five sections in a
   * horizontal bar rather than the column `navigationPlacement` gives them
   * wherever one fits (it is a fit test on the height, not a breakpoint).
   *
   * **MEASURED 2026-09-16, AND IT IS A WEAKNESS THIS TEST NOW HAS TO DECLARE:
   * MUTATING `white-space: nowrap` IN `primitives.css` NO LONGER TURNS THIS
   * TEST RED.** With the label hidden below 721px, the only widths where the bar
   * squeezed a tab below its own `min-width` are widths where the name is not
   * drawn at all; above the break the bar is `fit-content` and settles at its
   * max-content 387.16px from 414px up, so no label is ever compressed there.
   * The declaration is kept because it is what makes the claim true, not because
   * anything reaches it -- and this test is kept because *a wrap is still a
   * defect wherever the name is drawn*, which is what it asserts. It is a
   * regression gate on the layout, not a mutation gate on that one declaration,
   * and saying so here is cheaper than the next reader re-deriving it.
   */
  test('no section name wraps to a second line at 721x420', async ({ page }) => {
    await page.setViewportSize({ width: 721, height: 420 });
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    const labels = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.ui-tab')].map((tab) => ({
        id: tab.dataset['tab'] ?? '',
        text: (tab.textContent ?? '').trim(),
        lineBoxes: (tab.querySelector('.ui-tab__label') as HTMLElement).getClientRects().length,
        height: Math.round((tab.querySelector('.ui-tab__label') as HTMLElement).getBoundingClientRect().height * 10) / 10,
      })),
    );

    // Not vacuous: six tabs, each with a label that was actually found. Six
    // since 2026-09-17 -- the fifth section of the 2026-09-13 delivery's
    // navigation, added for the four projections that had a route out of the
    // worker and no painter.
    expect(labels).toHaveLength(6);
    const shortest = Math.min(...labels.map((label) => label.height));
    expect(shortest, 'no tab label was laid out at all').toBeGreaterThan(0);
    expect(
      labels.filter((label) => label.height > shortest + 1),
      'these section names wrap, and every line they wrap to comes off the rail',
    ).toEqual([]);
    expect(labels.every((label) => label.lineBoxes === 1)).toBe(true);
  });

  /**
   * ICON-ONLY TABS BELOW THE BREAK -- the owner's ruling of 2026-09-16 on
   * #1192, recorded in `docs/VISUAL_IDENTITY.md` item 5.
   *
   * Three claims, and they fail in three different ways, which is why they are
   * three tests. The bar can fit and announce nothing; it can announce
   * everything and overflow; and either can be bought by taking the names off
   * the screen at widths the ruling did not reach.
   *
   * **The second is the one worth stating plainly**: the ruling's own record
   * says *"an icon-only control still needs the section's name to reach a
   * screen reader"*, and a tab a screen reader announces as nothing at all
   * would be a worse defect than the overflow being fixed. It is asserted off
   * the **accessibility tree** (`toHaveAccessibleName`), not off the
   * stylesheet, so it stays true however the hiding is spelled -- and goes red
   * on the one spelling that is wrong, `display: none`.
   */
  test.describe('icon-only tabs below the break (#1192)', () => {
    const SECTION_NAMES = [
      ['overview', 'Overview'],
      ['build', 'Build'],
      ['zones', 'Zones'],
      ['manage', 'Manage'],
      ['day-plan', 'Schedule'],
      // The sixth, ruled by the owner on 2026-09-19 (provenance the weaker
      // kind: the label of a clickable option, *"Tak, szósta sekcja wchodzi"*,
      // not a sentence they typed). It is in this list rather than counted
      // separately because #1192's whole argument is about what the *set* of
      // sections costs the bar, and a sixth is the first addition made since
      // the ruling that took the names off the screen paid for it.
      ['security', 'Security'],
    ] as const;

    test('the six tabs fit at 375x812', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

      const bar = await page.evaluate(() => {
        const round = (value: number): number => Math.round(value * 100) / 100;
        const inner = document.querySelector<HTMLElement>('.hud-tabs__inner')!.getBoundingClientRect();
        const tabs = [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab]')];
        const boxes = tabs.map((tab) => tab.getBoundingClientRect());
        return {
          count: tabs.length,
          rows: new Set(boxes.map((box) => round(box.top))).size,
          left: round(inner.left),
          right: round(inner.right),
          narrowestTab: round(Math.min(...boxes.map((box) => box.width))),
          // `.hud-tabs__inner` is `overflow: hidden` for its rounded corners,
          // so a tab that does not fit is clipped away in silence -- the
          // failure that element's own comment in `hud.css` describes. A tab
          // outside its box is the thing to count, not the bar's own width.
          outsideTheBar: boxes.filter((box) => box.left < inner.left - 0.5 || box.right > inner.right + 0.5).length,
        };
      });

      // Not vacuous: six tabs, laid out, on one row.
      expect(bar.count, 'the six sections were not found').toBe(SECTION_NAMES.length);
      expect(bar.rows, 'the bar wrapped into rows at the default interface scale').toBe(1);
      expect(bar.left, 'the tab bar starts off the left edge').toBeGreaterThanOrEqual(0);
      expect(bar.right, 'the tab bar runs past the right edge of a 375px viewport').toBeLessThanOrEqual(375);
      expect(bar.outsideTheBar, 'a tab is clipped by the bar it sits in, which happens silently').toBe(0);
      // Constitution article 16's floor, and `--tap-target`'s own value: a tab
      // narrower than this is a control a thumb cannot reliably hit.
      expect(bar.narrowestTab, 'a tab is narrower than the 44px tap target').toBeGreaterThanOrEqual(44);
    });

    test('every tab still has an accessible name at 375x812', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

      for (const [id, name] of SECTION_NAMES) {
        const tab = page.locator(`.hud__tabs .ui-tab[data-tab="${id}"]`);
        await expect(tab, `the ${id} tab is not on screen`).toBeVisible();
        await expect(tab, `the ${id} tab reaches a screen reader as nothing`).toHaveAccessibleName(name);
      }

      // And the name is genuinely off the screen, or this test would be
      // asserting the accessibility tree of a bar that never changed.
      const drawn = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud__tabs .ui-tab__label')].map(
          (label) => Math.round(label.getBoundingClientRect().width * 100) / 100,
        ),
      );
      expect(drawn, 'the section names are still being drawn below the break').toEqual([1, 1, 1, 1, 1, 1]);
    });

    test('the section names are still drawn above the break', async ({ page }) => {
      // 721px: the first width the ruling does not reach, so the labels are
      // back. The ruling is about a range and this is its edge.
      await page.setViewportSize({ width: 721, height: 812 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

      const labels = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud__tabs .ui-tab__label')].map((label) => ({
          text: (label.textContent ?? '').trim(),
          width: Math.round(label.getBoundingClientRect().width * 100) / 100,
          position: getComputedStyle(label).position,
        })),
      );

      expect(labels.map((label) => label.text)).toEqual(SECTION_NAMES.map(([, name]) => name));
      expect(
        labels.filter((label) => label.width < 20),
        'these section names are laid out at a screen-reader size above the break, where they should be drawn',
      ).toEqual([]);
      expect(labels.every((label) => label.position === 'static')).toBe(true);
    });
  });

  test('transport controls report a clock intent without changing the clock themselves', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    await page.evaluate(() => window.lockstateUiHarness.clickTransport('Fast forward'));
    expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toEqual([
      JSON.stringify({ kind: 'set-clock', mode: 'running', speed: 2 }),
    ]);

    // The HUD is a view over snapshots: it asked, and it is still showing
    // what the last view model said until a new one arrives.
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).pressedTransport).toEqual(['Pause']);

    await page.evaluate(() =>
      window.lockstateUiHarness.setHudViewModel({
        counts: {
          prisoners: 179,
          prisonerCapacity: 180,
          // Everybody housed: this case is about the transport controls and
          // the clock, and an unhoused population would add #609's badge to
          // the chip it reads `metricValues[0]` off.
          occupiedPlaces: 179,
          staff: 27,
          staffUnassigned: 0,
          rooms: 61,
          prisonersCovered: 140,
          prisonersUnderstaffed: 27,
          prisonersUnguarded: 12,
          prisonersHighRisk: 0,
          activeIncidents: 2,
          contrabandFound: 4,
          treasuryMinorUnits: 0,
          stateIncomeAccruedTodayMinorUnits: 0,
        },
        clock: { day: 3, tickOfDay: 1_800, dayLengthTicks: 2_400, mode: 'running', speed: 2 },
        alerts: [],
      }),
    );
    const updated = await page.evaluate(() => window.lockstateUiHarness.hudProbe());
    expect(updated.pressedTransport).toEqual(['Fast forward']);
    expect(updated.metricValues[0]).toBe('179');
    // The clock moved with the view model, not with wall time.
    expect(updated.clockDayProgress).toBe('75%');
    await expectLaidOut(page, '.ui-stat .ui-stat__value', 'the strip metric values');
    await expectLaidOut(page, '.hud-clock__day-progress', 'the clock day progress');
  });

  test('states no metric at all until a prison reports, and states a reported zero (issue #1191)', async ({
    page,
  }) => {
    /*
     * The other half of the strip the test below pins.
     *
     * `EMPTY_HUD_VIEW_MODEL` is what the real app paints before a session
     * exists, and what a browser that cannot start the worker keeps painting.
     * Until #1191 it carried a complete row of zeros, so this same paint said
     * *Prisoners 0, Rooms 0, Funds 0* -- confident figures about a prison it
     * had never heard of -- **beside the `--` clock the test below asserts, in
     * the same paint**. One strip, two answers to "is anything known".
     *
     * Asserted here rather than only in the unit test because the projection
     * saying "no value" and the chip painting `--` are two claims: the strip
     * formats the number itself, and a `localizer.formatNumber(undefined)`
     * reading `NaN` would satisfy the projection test and fail a player.
     */
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell({ empty: true }));
    const silent = await page.evaluate(() => window.lockstateUiHarness.hudProbe());

    // All nine, so nothing is fixed chip by chip: the row is the unit here.
    expect(silent.metricValues).toEqual(['--', '--', '--', '--', '--', '--', '--', '--', '--']);
    // The same `--` the clock two elements over has always painted, which is
    // the point of the fix rather than a coincidence of formatting.
    expect(silent.clockDay).toBe('--');
    // Visible, for the reason the clock's own test gives: an unknown a player
    // cannot see says nothing at all.
    await expectLaidOut(page, '.ui-stat .ui-stat__value', 'the strip metric values');

    /*
     * And the state this must not have cost: a prison that has reported.
     * `BASE_VIEW_MODEL` publishes `prisonersHighRisk: 0` and
     * `activeIncidents: 0`, and those two `0`s are facts about a prison rather
     * than the absence of one, so they stay numbers.
     */
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    const reported = await page.evaluate(() => window.lockstateUiHarness.hudProbe());

    expect(reported.metricValues).toEqual(['142', '0', '27', '100', '61', '0', '4', '24,920', '10,667']);
  });

  test('shows the clock as unknown until a session reports one', async ({ page }) => {
    // `EMPTY_HUD_VIEW_MODEL` is what the real app paints before a session
    // exists, and what a browser that cannot start the worker keeps painting.
    // A confident "Day 1, 0%" there would be a readout of a simulation that
    // is not running.
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell({ empty: true }));
    const probe = await page.evaluate(() => window.lockstateUiHarness.hudProbe());

    expect(probe.clockDay).toBe('--');
    expect(probe.clockDayProgress).toBe('--');
    expect(probe.pressedTransport).toEqual(['Pause']);
    // The `--` has to be visible to be an honest "unknown": a clock the
    // player cannot see says nothing at all, and this assertion would not
    // have noticed the difference.
    await expectLaidOut(page, '.hud-clock__day', 'the clock day');
    await expectLaidOut(page, '.hud-clock__day-progress', 'the clock day progress');
  });

  test('a slow host blocks a second clock command but never blocks the chrome', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.evaluate(() => window.lockstateUiHarness.holdClockIntents(true));

    await page.evaluate(() => window.lockstateUiHarness.clickTransport('Fast forward'));
    expect(await page.evaluate(() => window.lockstateUiHarness.transportDisabled())).toBe(true);

    // A command must not be issued twice to a host that has not answered the
    // first (issue #65).
    await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));
    expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toHaveLength(1);

    // Chrome is not a command. Switching tabs while the clock is wedged has
    // nothing to do with the host, and dropping that tap would be a worse
    // bug than the one the gate prevents.
    await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).activeTab).toBe('build');
    // The fold starts OPEN as of #703 ruling 1, so one toggle shuts it. What
    // this line is here to prove is unchanged and is not the direction: chrome
    // responds while the clock is wedged. Asserted as a *change* from the
    // state before the tap, so this keeps proving it whichever way the initial
    // state moves next.
    const foldBefore = (await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed;
    await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());
    const foldAfter = (await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed;
    expect(foldAfter).not.toBe(foldBefore);

    await page.evaluate(() => window.lockstateUiHarness.releaseClockIntent());
    await expect
      .poll(() => page.evaluate(() => window.lockstateUiHarness.transportDisabled()))
      .toBe(false);
    expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
  });

  /**
   * Issue #207: a refused command has to reach the player, not `console.warn`.
   *
   * Four comments in `src/` said the HUD "reports on the control that was
   * pressed" while the only consumer of a failure was a console message, and
   * the HUD was byte-identical before and after a refusal. These drive the
   * real `mountHud` with a host that refuses, and read the production DOM.
   *
   * The gate's own contract -- that it calls `onError` at all -- is proven
   * headlessly in `tests/unit/ui-async-action-gate.test.ts`, and it was
   * always green while this defect was live: the seam is exactly where the
   * old assertion stopped.
   */
  test.describe('a refused command reports to the player (issue #207)', () => {
    test('a refused clock change changes the HUD and marks the button that was pressed', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));

      // Deliberately *not* paired with a visibility assertion, in either
      // direction. `.hud__refusal` is a `hidden` live region that starts with
      // nothing to say, and requiring `visible: false` here is the assertion:
      // the region has to exist in the DOM for `aria-live` to announce into
      // it later, and it must not be showing an empty band before it does.
      // The same holds for the two other `visible: false` requirements below.
      // `hudText()` is not paired either -- it reads `innerText`, which is
      // rendered text and therefore already excludes a `display: none`
      // subtree, so a pairing assertion would restate what it measures.
      const before = await page.evaluate(() => window.lockstateUiHarness.hudText());
      expect(await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).toMatchObject({
        visible: false,
        action: null,
        failedControls: [],
      });

      expect(await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'))).toBe(true);

      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible), {
          message: 'the HUD never reported the refusal',
        })
        .toBe(true);
      const probe = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(probe.action).toBe('set-clock');

      // A sentence about the outcome, not the thrown `Error`: the throw is
      // English raised on the main thread and may not reach the screen.
      expect(probe.text).toContain('The clock did not change');
      expect(probe.text).not.toContain('ui-harness: the host refused');
      // A live region, or the report never reaches a screen reader at all.
      expect(probe.role).toBe('status');
      expect(probe.ariaLive).toBe('polite');

      // "On the control that was pressed", which is what the four comments
      // claimed: Pause and only Pause, even though all three transport
      // buttons are disabled together while a clock command is in flight.
      expect(probe.failedControls).toEqual(['Pause']);
      expect(probe.describedByRefusal).toBe(true);

      // The measurement issue #207 was filed on: the HUD's rendered text was
      // byte-identical before and after the press.
      expect(await page.evaluate(() => window.lockstateUiHarness.hudText())).not.toBe(before);

      // Reported to the player *and* never left for the browser to find.
      expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
    });

    test('a later success clears the refusal, so the line never outlives its truth', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
      await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible))
        .toBe(true);

      await page.evaluate(() => window.lockstateUiHarness.failIntents(false));
      await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));

      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe()), {
          message: 'the refusal outlived the successful retry',
        })
        .toMatchObject({ visible: false, action: null, failedControls: [] });
    });

    test('a refused tab change says nothing, because the tab really did change', async ({ page }) => {
      // Chrome is applied locally before the host is told, so "that did not
      // go through" would be a false statement on screen. The host still
      // hears about it.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));

      expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
      expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).activeTab).toBe('build');

      await page.waitForTimeout(100);
      expect(await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).toMatchObject({
        visible: false,
        failedControls: [],
      });
      expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
    });

    /**
     * The world-drag route, at the layer that dispatches it (issue #225).
     *
     * The Build panel's *Place order* button has been reporting refusals since
     * #207; the drag along a tile edge -- the primary way a wall is laid --
     * went from the composition root straight to the command sender, and its
     * only report was a `console.warn`. The two ways to lay one wall disagreed
     * about whether the player is told, and the silent one was the one people
     * use.
     *
     * The fix routes the gesture through this same `dispatchCommand`, so what
     * this proves is the half that lives in `mountHud`: the gesture becomes a
     * gated `place-build-order` intent, and refusing it paints the line. That
     * the *real* `BuildTool` and a *real* canvas drag reach here is
     * `app-shell.spec.ts`'s to prove; a harness cannot settle it and does not
     * pretend to.
     */
    test('a refused world drag says so on screen, with no control to blame', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));

      expect(await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).toMatchObject({
        visible: false,
        action: null,
        failedControls: [],
      });

      // The panel route first, refused, so that its *Place order* button is
      // marked and the map below is not vacuous: a drag asserted against a HUD
      // that had never marked anything would pass whether or not the mark is
      // moved off a control the second gesture had nothing to do with.
      await page.evaluate(() => window.lockstateUiHarness.expandBuildCoordinates());
      expect(await page.evaluate(() => window.lockstateUiHarness.clickPlaceOrder())).toBe(true);
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().failedControls), {
          message: 'the panel route stopped marking its own button, so this test proves nothing',
        })
        .toEqual(['Place order']);

      // A four-segment run, which is what a drag along a tile edge produces.
      const dragged = await page.evaluate(() =>
        window.lockstateUiHarness.dragWorldBuild('wall-brick', [
          { x: 4, y: 7, edge: 'north' },
          { x: 5, y: 7, edge: 'north' },
          { x: 6, y: 7, edge: 'north' },
          { x: 7, y: 7, edge: 'north' },
        ]),
      );
      // The gesture really was delivered. Without this the assertions below
      // would be equally green against a HUD that registered no sink at all.
      expect(dragged).toBe(true);

      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().failedControls), {
          message: 'a refused world drag left the mark on a button the player never pressed',
        })
        .toEqual([]);

      const probe = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      // Still on screen -- the line is about the drag now, not about the press.
      expect(probe.visible).toBe(true);
      expect(probe.action).toBe('place-build-order');
      expect(probe.text).toContain('The build order was not placed');
      expect(probe.text).not.toContain('ui-harness: the host refused');
      expect(probe.role).toBe('status');
      expect(probe.ariaLive).toBe('polite');

      // **No control is marked**, and that is the assertion rather than an
      // omission. The player pressed nothing -- the gesture was on the world
      // -- so marking the panel's *Place order* button would point
      // `aria-describedby` at a refusal about something that button had no
      // part in. The refusal line is the whole report, and #207 put it where
      // every viewport lays it out.
      expect(probe.failedControls).toEqual([]);

      expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
    });

    /**
     * One gesture is one transaction (`src/ui/build-tool.ts`), asserted at the
     * point routing it through the HUD could have broken it.
     *
     * A run of four edges is one thing the player drew, one thing to undo and
     * one thing to be told about. A per-segment dispatch would be the obvious
     * way to write this and would be wrong three times over: the gate is
     * single-slot, so segments two, three and four would be refused as busy;
     * `src/main.ts` mints one `transactionId` per intent, so four intents
     * would be four undo steps; and a refusal would paint the line about a
     * segment rather than about the wall.
     */
    test('a whole drag is one intent, not one per segment', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

      expect(
        await page.evaluate(() =>
          window.lockstateUiHarness.dragWorldBuild('wall-brick', [
            { x: 4, y: 7, edge: 'north' },
            { x: 5, y: 7, edge: 'north' },
            { x: 6, y: 7, edge: 'north' },
            { x: 7, y: 7, edge: 'north' },
          ]),
        ),
      ).toBe(true);

      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      expect(intents.filter((intent) => intent.includes('place-build-order'))).toEqual([
        JSON.stringify({
          kind: 'place-build-order',
          definitionId: 'wall-brick',
          edges: [
            { x: 4, y: 7, edge: 'north' },
            { x: 5, y: 7, edge: 'north' },
            { x: 6, y: 7, edge: 'north' },
            { x: 7, y: 7, edge: 'north' },
          ],
        }),
      ]);
    });

    /**
     * The undo key, at the layer that decides whether the player is told (#261).
     *
     * `ConstructionSystem` has maintained a transaction-grouped undo stack
     * since #108 and nothing in the application could produce an `Undo`
     * command. Routing the key through the HUD rather than from the renderer
     * straight to the command sender is what buys the sentence on screen: an
     * undo pressed before a session exists throws in `src/main.ts`, and this
     * is where that becomes a line the player can read rather than a failure
     * with no surface to report it -- the defect #225 removed from the build
     * drag, not re-created for the key.
     */
    test('a refused undo says so on screen, with no control to blame', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));

      // The key really reached the HUD. Without this the assertions below
      // would be equally green against a HUD that registered no sink at all.
      expect(await page.evaluate(() => window.lockstateUiHarness.pressWorldUndo('undo'))).toBe(true);

      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible), {
          message: 'a refused undo left nothing on screen, which is what the key routing through the HUD is for',
        })
        .toBe(true);

      const probe = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(probe.action).toBe('undo');
      expect(probe.text).toContain('Nothing was undone');
      // Not the build order's sentence: a refused undo and a refused order
      // leave the prison in different states, and one generic line would make
      // the player guess which.
      expect(probe.text).not.toContain('The build order was not placed');
      expect(probe.text).not.toContain('ui-harness: the host refused');
      // No control is marked, for the reason a refused world drag marks none:
      // the player pressed a key on the world, not a button in the HUD.
      expect(probe.failedControls).toEqual([]);
      expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
    });

    test('undo and redo are separate intents, each dispatched once per press', async ({ page }) => {
      // Two kinds and not one carrying a direction, because the gate and the
      // refusal sentence are both keyed on `intent.kind`. Asserted as the
      // exact intent list so a redo dispatched as an undo -- which would
      // reverse the player's work instead of restoring it -- cannot pass.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

      expect(await page.evaluate(() => window.lockstateUiHarness.pressWorldUndo('undo'))).toBe(true);
      expect(await page.evaluate(() => window.lockstateUiHarness.pressWorldUndo('redo'))).toBe(true);

      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      expect(intents.filter((intent) => intent.includes('undo') || intent.includes('redo'))).toEqual([
        JSON.stringify({ kind: 'undo' }),
        JSON.stringify({ kind: 'redo' }),
      ]);
    });

    test('the status strip\'s Undo and Redo dispatch the same two intents the keys do (#1356)', async ({ page }) => {
      // The pointer route beside the key. Exact intent list, for the reason the
      // test above gives: a Redo button that sent `undo` would reverse the
      // player's work instead of restoring it.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      const history = page.locator('.hud-strip__history');
      await expect(history).toHaveAttribute('role', 'group');
      await history.getByRole('button', { name: 'Undo the last placement' }).click();
      await history.getByRole('button', { name: 'Redo the last undone placement' }).click();

      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      expect(intents.filter((intent) => intent.includes('undo') || intent.includes('redo'))).toEqual([
        JSON.stringify({ kind: 'undo' }),
        JSON.stringify({ kind: 'redo' }),
      ]);
    });

    test('a refused strip Undo is marked on its button, and a key press takes the mark back (#1356)', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
      await page
        .locator('.hud-strip__history')
        .getByRole('button', { name: 'Undo the last placement' })
        .click();

      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible))
        .toBe(true);
      let probe = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(probe.action).toBe('undo');
      expect(probe.text).toContain('Nothing was undone');
      // The button that was pressed, and nothing else -- unlike the key, which
      // marks nothing because nothing on screen was pressed.
      expect(probe.failedControls).toEqual(['Undo the last placement']);
      expect(probe.describedByRefusal).toBe(true);

      // The same kind, now from the key: the refusal is about a press the
      // button did not make, so the button's mark must not outlive it.
      expect(await page.evaluate(() => window.lockstateUiHarness.pressWorldUndo('undo'))).toBe(true);
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().failedControls))
        .toEqual([]);
      probe = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(probe.visible).toBe(true);
      expect(probe.action).toBe('undo');
      expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
    });

    test('the strip\'s Undo and Redo are marked unavailable exactly when the worker says a press would do nothing (#1370)', async ({
      page,
    }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      const history = page.locator('.hud-strip__history');
      const undo = history.getByRole('button', { name: 'Undo the last placement' });
      const redo = history.getByRole('button', { name: 'Redo the last undone placement' });
      const cursorOf = (button: typeof undo): Promise<string> => button.evaluate((element) => getComputedStyle(element).cursor);

      // No prison has reported: no opinion, so neither is marked -- absent, not
      // `"false"`, because the strip does not know that a press would act.
      await expect(undo).not.toHaveAttribute('aria-disabled', /.*/);
      await expect(redo).not.toHaveAttribute('aria-disabled', /.*/);

      // Nothing to undo, something to redo: each button follows its own bit.
      await page.evaluate(() => window.lockstateUiHarness.reportEditHistory({ undo: false, redo: true }));
      await expect(undo).toHaveAttribute('aria-disabled', 'true');
      await expect(redo).toHaveAttribute('aria-disabled', 'false');
      // And it reads as unavailable, not only to assistive technology: the
      // glyph takes the `:disabled` look, cursor included.
      expect(await cursorOf(undo)).toBe('default');
      expect(await cursorOf(redo)).toBe('pointer');

      // Advice, not authority: the press still reaches the host, exactly as
      // `KeyZ`'s would, so a verdict one cadence stale cannot swallow a press
      // the worker would honour. `force`, because Playwright's actionability
      // check reads `aria-disabled` as not enabled -- the same reason
      // `pressBuyExpectingRefusal` in `app-shell.spec.ts` presses the Buy
      // button this way. `toBeDisabled` reads `aria-disabled` too, so the
      // `disabled` *property* is read directly: it is what would swallow a
      // press, and it must not have been written.
      const disabledProperty = (): Promise<boolean> => undo.evaluate((element) => (element as HTMLButtonElement).disabled);
      expect(await disabledProperty()).toBe(false);
      await undo.click({ force: true });
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      expect(intents.filter((intent) => intent.includes('undo') || intent.includes('redo'))).toEqual([
        JSON.stringify({ kind: 'undo' }),
      ]);
      // The busy group rewrote `disabled` on both buttons around that press;
      // the verdict is on a different attribute and survives it.
      await expect(undo).toHaveAttribute('aria-disabled', 'true');
      await expect.poll(disabledProperty).toBe(false);

      await page.evaluate(() => window.lockstateUiHarness.reportEditHistory({ undo: true, redo: false }));
      await expect(undo).toHaveAttribute('aria-disabled', 'false');
      await expect(redo).toHaveAttribute('aria-disabled', 'true');

      // A prison that stops reporting takes the opinion away again.
      await page.evaluate(() => window.lockstateUiHarness.reportEditHistory(undefined));
      await expect(undo).not.toHaveAttribute('aria-disabled', /.*/);
      await expect(redo).not.toHaveAttribute('aria-disabled', /.*/);
    });

    test('the refusal line is there at 375px, where the map corner is not', async ({ page }) => {
      // `hud.css` drops `.hud__corner` at 720px and below, so a refusal
      // reported into the alerts list would not exist on a phone at all.
      //
      // **THE SECOND HALF OF THAT SENTENCE STOPPED BEING TRUE ON 2026-09-16
      // AND THE TEST'S SUBJECT DID NOT** (#1201). The corner is still dropped
      // -- which is what the one assertion below measures, and is why this test
      // was renamed rather than retired -- but the alerts fold itself is now
      // mounted in the rail at this width, so "the alerts list would not exist
      // on a phone" is history. The band is still the right home for a refusal
      // for the reason the block above this one gives: it is on screen at every
      // viewport without anything being opened, and a log is not a notice.
      //
      // **An attempt to remove that breakpoint was made and withdrawn on
      // 2026-08-31 (#703, ruling 5), and the rule now carries the measurement
      // that sent it back**: below 720px `.hud__rail` stretches and shares the
      // corner's grid area, so with the corner laid out the Intake panel's
      // Admit button covered the Alerts fold header. See `hud.css`'s note on
      // that block. This assertion therefore stands unchanged, and the reason
      // it stands is now stronger than "the stylesheet says so".
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
      await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));

      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible), {
          message: 'the refusal line is not laid out at 375px',
        })
        .toBe(true);
      expect((await page.evaluate(() => window.lockstateUiHarness.layoutProbe())).minimap).toBeNull();
    });
  });

  /**
   * Issue #220, made structural: **a refusal the worker decided reaches a
   * surface that is on screen.**
   *
   * #220 measured the alerts list and found it invisible in two independent
   * ways -- `hud.css` drops `.hud__corner` at 720px and below, and the alerts
   * section starts folded (`INITIAL_HUD_SHELL_STATE`) so the row is
   * `offsetParent === null` with a 0x0 box even at 1280x800 -- and moved
   * exactly one sentence out of it. Every refusal the simulation decided after
   * accepting a command went on arriving there: a wall on unowned land, a
   * purchase the treasury cannot cover, a room over one already there, and
   * ADR 0028 phase 3's object removal, added after #220 and silent on a phone
   * from the day it shipped.
   *
   * These drive the real `mountHud` and read the production DOM, and they
   * assert the **geometry** rather than the text. That distinction is the
   * whole of #220's lesson: `toContainText` passes against a row inside a
   * folded section, which is how a green suite coexisted with an invisible
   * message. Both boxes are measured in every case -- the band's and the
   * list row's -- so "the band is laid out" and "the row it replaced is not"
   * are two readings rather than one inferred from the other.
   *
   * The fold is left exactly as it starts. Opening it would measure a state
   * the player never asked for.
   */
  test.describe('a refusal the simulation decided reaches a visible band (issue #220)', () => {
    const REFUSAL_TEXT = 'The build order failed';
    const REFUSAL_KEY = 'hud.alert.refusal.build.unowned-land';

    /** What `src/main.ts` publishes when the worker has refused something. */
    const withSimulationRefusal = (sequence: number): HudViewModel => ({
      counts: {
        prisoners: 0,
        prisonerCapacity: 0,
        occupiedPlaces: 0,
        staff: 0,
        staffUnassigned: 0,
        rooms: 0,
        prisonersCovered: 0,
        prisonersUnderstaffed: 0,
        prisonersUnguarded: 0,
        prisonersHighRisk: 0,
        activeIncidents: 0,
        contrabandFound: 0,
        treasuryMinorUnits: 0,
        stateIncomeAccruedTodayMinorUnits: 0,
      },
      clock: { day: 1, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
      // Both surfaces, exactly as the composition root fills them: the list
      // keeps the log row and the band carries the notice.
      alerts: [{ id: `refusal-${sequence}`, labelKey: REFUSAL_KEY, severity: 'warning' }],
      refusal: { sequence, labelKey: REFUSAL_KEY },
    });

    for (const [width, height] of [
      [1280, 800],
      [375, 812],
    ] as const) {
      test(`is laid out with a real box at ${width}x${height}, with the alerts fold left alone`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

        // The page actually rendered before any geometry is trusted: a HUD
        // that failed to mount reports plausible zeros, and `mountHudShell`
        // resolving is not the same as the browser having laid anything out.
        // The status strip is production DOM that is present at every
        // viewport and in every state, so a real box on it is the proof.
        const strip = (await page.evaluate(() => window.lockstateUiHarness.layoutProbe())).strip;
        expect(strip, 'the HUD never rendered, so nothing measured below means anything').not.toBeNull();
        expect(strip?.height).toBeGreaterThan(0);

        // The default state, asserted rather than assumed -- the whole
        // measurement is about what a player who has touched nothing sees.
        //
        // **`'false'` as of #703 ruling 1**, where this read `'true'`. The
        // titles of these two cases still say "with the alerts fold left
        // shut", and that is corrected in the `for` loop's label rather than
        // here; what matters to the measurement is that the fold is left
        // *untouched*, whatever state it starts in, because the band under
        // test must not depend on it.
        expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed).toBe('false');
        expect(await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).toMatchObject({
          visible: false,
          source: null,
        });

        await page.evaluate(
          (model) => window.lockstateUiHarness.setHudViewModel(model),
          withSimulationRefusal(1),
        );

        const probe = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
        expect(probe.visible).toBe(true);
        expect(probe.width).toBeGreaterThan(0);
        expect(probe.height).toBeGreaterThan(0);
        expect(probe.text).toContain(REFUSAL_TEXT);
        // The simulation's sentence, and named as such: a band that could not
        // say which producer it is carrying could not be asserted about.
        expect(probe.source).toBe('simulation');
        // No `data-action` and no marked control. The command was accepted --
        // it was refused ticks later, possibly for a drag with no button
        // behind it at all -- so there is nothing on screen it is about, and
        // `aria-describedby` must not point at a control that had no part in
        // it.
        expect(probe.action).toBeNull();
        expect(probe.failedControls).toEqual([]);
        // A live region, or a screen reader never hears it.
        expect(probe.role).toBe('status');
        expect(probe.ariaLive).toBe('polite');
        // The HUD's own rendered text, which is the measurement #220
        // established as honest: `innerText` excludes a subtree the layout
        // dropped, so this cannot pass from inside the folded section.
        expect(await page.evaluate(() => window.lockstateUiHarness.hudText())).toContain(REFUSAL_TEXT);

        /*
         * And the surface it replaced, at the same instant.
         *
         * **THIS IS THE ASSERTION #220 WAS ABOUT, AND IT NOW SPLITS BY
         * VIEWPORT.** It read `visible: false`, `width: 0`, `height: 0` at both
         * sizes, under the comment *"the row is in the DOM and occupies
         * nothing. This is the defect, measured -- not reasoned about from the
         * CSS."* #220's defect had two causes and the owner's rulings of
         * 2026-08-31 (#703) settled them differently:
         *
         * - **The fold is gone (ruling 1).** The alerts section starts open, and
         *   the list now scrolls rather than letting its `.ui-panel` ancestor
         *   clip the newest row. So above 720px the row has a real box.
         * - **The 720px breakpoint stays.** Ruling 5 asked for it to go; the
         *   attempt was withdrawn on measurement, because below 720px
         *   `.hud__rail` stretches into the corner's grid area and the Intake
         *   panel's Admit button covered the Alerts fold header. `hud.css` holds
         *   the numbers. So at 375x812 the row is still `offsetParent === null`
         *   with a 0x0 box.
         *
         * The split is asserted rather than smoothed over, because it is the
         * honest state of the fix: **#220's defect is closed on a desktop
         * browser and open on a phone**, and the owner's standing steer is that
         * the desktop browser comes first. A single assertion either way would
         * hide half of that.
         *
         * **The band is still asserted above and is not redundant at either
         * size.** Everything before this paragraph still runs. What changed is
         * that above 720px the list is now a second place the same sentence
         * reaches -- the split `simulation-alerts.ts` describes, *"the band is
         * the notice and the list is the log"* -- and #701 measured why both are
         * needed, the band having lost a message to another from the same tick.
         */
        /*
         * **THE SPLIT CLOSED ON 2026-09-16 AND THE PARAGRAPH ABOVE IS KEPT
         * RATHER THAN EDITED** (issue #1201), because it is the case for the
         * owner question that produced the ruling and is only legible beside
         * it.
         *
         * Its second bullet still holds exactly as written: the 720px
         * breakpoint stays, `.hud__corner` is still `display: none` below it,
         * and the Intake-panel collision it records is still why un-hiding the
         * corner is not the fix. What changed is not the breakpoint but the
         * fold's **mount**: below 720px `hud.ts` moves the alerts section into
         * the Overview panel's `foldSlot`, in the rail, on the owner's ruling
         * of 2026-09-16 (*"Zamontuj fold w szynie poniżej 720 px"*). So the row
         * has a real box at both sizes, by two different routes, and #220's
         * defect is closed on a phone as well as on a desktop.
         *
         * `tests/browser/ui-alert-dismiss-on-a-phone.spec.ts` is the gate over
         * the thing that actually matters about that -- that `DismissAlert` can
         * be *pressed* at 375x812 -- and this stays a geometry assertion.
         */
        const row = await page.evaluate(() => window.lockstateUiHarness.alertRowProbe());
        expect(row.present).toBe(true);
        expect(row.visible, `the alerts row is laid out at ${width}px (#703 ruling 1, #1201)`).toBe(true);
        expect(row.width).toBeGreaterThan(0);
        expect(row.height).toBeGreaterThan(0);
      });
    }

    test('a republished refusal does not steal the line from a command this thread refused since', async ({
      page,
    }) => {
      // The counts channel is a snapshot on a cadence: it republishes an
      // unchanged refusal beside every changed count, up to twice a second.
      // Without the ordinal the band would take the line back from the
      // host's own refusal within 500 ms, and the player would be told about
      // the wrong press.
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSimulationRefusal(1));
      expect((await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).source).toBe('simulation');

      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
      await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().source))
        .toBe('host');
      expect((await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).action).toBe('set-clock');
      // Taking the line unmarks nothing here -- there was no control behind
      // the simulation's refusal -- but the host's own control is marked now.
      expect((await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).failedControls).toEqual(['Pause']);

      // The same refusal, republished. Same ordinal, so nothing happened.
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSimulationRefusal(1));
      const after = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(after.source).toBe('host');
      expect(after.action).toBe('set-clock');
      expect(after.failedControls).toEqual(['Pause']);

      // A *new* refusal is a new decision and does take the line -- and takes
      // the mark off the control with it, because `aria-describedby` may not
      // point at a sentence about something else.
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSimulationRefusal(2));
      const replaced = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(replaced.source).toBe('simulation');
      expect(replaced.action).toBeNull();
      expect(replaced.failedControls).toEqual([]);
      expect(replaced.text).toContain(REFUSAL_TEXT);
    });

    test('a session that has refused nothing withdraws the sentence, and a host refusal survives it', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSimulationRefusal(3));
      expect((await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).visible).toBe(true);

      // What `src/main.ts` publishes for a stopped session, or one that has
      // refused nothing: the field is gone. A refusal by a simulation that no
      // longer exists is not something the player can act on.
      const { refusal: _withdrawn, ...withoutRefusal } = withSimulationRefusal(3);
      await page.evaluate(
        (model) => window.lockstateUiHarness.setHudViewModel(model as HudViewModel),
        withoutRefusal,
      );
      const cleared = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(cleared.visible).toBe(false);
      expect(cleared.source).toBeNull();
      expect(cleared.text).toBe('');

      // The other direction: a snapshot that says the session has refused
      // nothing must not withdraw a refusal *this thread* decided a moment
      // ago. They are different facts with different owners.
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
      await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().source))
        .toBe('host');
      await page.evaluate(
        (model) => window.lockstateUiHarness.setHudViewModel(model as HudViewModel),
        withoutRefusal,
      );
      const survived = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(survived.visible).toBe(true);
      expect(survived.source).toBe('host');
      expect(survived.action).toBe('set-clock');
    });

    test('a resolved host refusal does not permanently evict a still-standing simulation refusal, and the corner agrees with the alerts list (issue #777)', async ({
      page,
    }) => {
      // The reproduction #777 describes, driven deterministically through the
      // harness's two levers rather than through real affordability timing:
      // (1) a simulation refusal is standing -- both surfaces say so, from one
      // view model. (2) a host-side refusal then occurs -- an unaffordable
      // press, stood in for by `failIntents(true)` -- and takes the line, the
      // same way it always has. (3) that same press then succeeds -- an
      // affordable one -- and clears its own line, the same way it always
      // has. What #777 is about is what happens *next*.
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSimulationRefusal(1));
      expect((await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).source).toBe('simulation');

      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
      await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().source))
        .toBe('host');

      await page.evaluate(() => window.lockstateUiHarness.failIntents(false));
      await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().source))
        .toBeNull();

      // The next thing the counts channel publishes -- identical to the one
      // already shown, exactly as it republishes an unchanged refusal on its
      // own cadence rather than only on a change -- must bring the
      // still-standing simulation refusal back to the corner. Before the fix
      // this line stayed empty forever: nothing publishes a *new* ordinal for
      // a fact that has not changed, and the old guard read "already shown
      // once" as "nothing to do" even with the line now empty under it.
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSimulationRefusal(1));
      const restored = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(restored.source, 'the corner permanently lost the still-standing simulation refusal').toBe('simulation');
      expect(restored.visible).toBe(true);
      expect(restored.text).toContain(REFUSAL_TEXT);
      expect(restored.action).toBeNull();

      // The alerts list reads the identical fact from the identical source
      // (`next.alerts`, painted every `update()` regardless of the band's own
      // history) and must say the same thing the corner now does.
      const listRow = await page.evaluate(() => window.lockstateUiHarness.alertRowProbe());
      expect(listRow.present, 'the two surfaces must agree about the same standing refusal').toBe(true);
      expect(listRow.text).toContain(REFUSAL_TEXT);
    });
  });

  test('the alerts section folds and unfolds from a single tap on its header', async ({ page }) => {
    // **The starting state moved on 2026-08-31 (#703, ruling 1)**: this read
    // `'true'` first, because `INITIAL_HUD_SHELL_STATE` used to collapse
    // `alerts`. It starts open now, so the sequence is open -> shut -> open
    // rather than shut -> open -> shut. **The property is unchanged and is
    // still the whole subject: one tap moves it, and `aria-expanded` agrees
    // with the data attribute at every step.** Both directions are exercised,
    // as before, so a reducer that only ever collapsed would still fail here.
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed).toBe('false');
    // Scoped to the minimap frame the alerts live in: the Build panel uses
    // the same primitive, so a bare `.ui-section__header` now matches three.
    expect(await page.locator('.hud-minimap .ui-section__header').getAttribute('aria-expanded')).toBe('true');

    await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed).toBe('true');
    expect(await page.locator('.hud-minimap .ui-section__header').getAttribute('aria-expanded')).toBe('false');

    await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed).toBe('false');
    expect(await page.locator('.hud-minimap .ui-section__header').getAttribute('aria-expanded')).toBe('true');
  });

  /**
   * **The events band gives its grid row back once nothing has replaced its
   * sentence ([#985](https://github.com/matmaxalez/lockstate/issues/985)).**
   *
   * `.hud__event` is `grid-area: event` on `.hud`, whose rows are
   * `auto auto auto auto minmax(0, 1fr) auto` -- the fourth is this band's, the
   * fifth is the middle where the rail lives. `hud.css` gives the band
   * `display: none` while `[hidden]`, so the row is worth exactly zero until
   * something raises it and exactly 32px afterwards, and every one of those
   * pixels comes out of the middle row.
   *
   * Until 2026-09-05 nothing ever put them back: `event-band-dwell.ts` replaced
   * an incumbent and never released one, so a single event cost the rail 32px
   * for the rest of the session. This is the assertion that it now lets go, and
   * it is here rather than in a unit test because **`hud.ts` is unreachable from
   * `pnpm test`** -- `vitest.config.ts` is `environment: 'node'` with no jsdom,
   * and the timer, the paint and the grid are all DOM. Measured directly: a
   * mutation of `hud.ts`'s timer callback back to `releaseEventBandFloor`, which
   * is what it called before this change, passes all nineteen cases in
   * `tests/unit/event-band-dwell.test.ts` and fails here.
   *
   * **What this layer does not measure**, stated so nobody reads more into it:
   * what the 32px is worth to a *panel*. The harness leaves the rail's aside
   * slot empty and `.hud__aside:empty { display: none }` then hands the panel
   * the whole rail, which is the same reason the Build and Rooms panels' fold
   * measurements live in `app-shell.spec.ts`. The panel arithmetic -- 291px of
   * body back from 267, the Build panel back inside its own fold -- is asserted
   * there, on the assembled page, in *"a pending delivery is on the panel with
   * the fold shut..."*.
   *
   * 900x600 because that is the viewport #985 is measured at, and the one where
   * the 24px this row costs the rail's panel is more than the panel has.
   */
  test.describe('the events band lets go of its grid row (#985)', () => {
    /** Which of `.hud`'s six rows is which, so the assertions read as the grid does. */
    const EVENT_ROW = 3;
    const MIDDLE_ROW = 4;

    /** What `src/main.ts` publishes when the worker has recorded an event. */
    const withEvent = (sequence: number): HudViewModel => ({
      counts: {
        prisoners: 0,
        prisonerCapacity: 0,
        occupiedPlaces: 0,
        staff: 0,
        staffUnassigned: 0,
        rooms: 0,
        prisonersCovered: 0,
        prisonersUnderstaffed: 0,
        prisonersUnguarded: 0,
        prisonersHighRisk: 0,
        activeIncidents: 0,
        contrabandFound: 0,
        treasuryMinorUnits: 0,
        stateIncomeAccruedTodayMinorUnits: 0,
      },
      clock: { day: 1, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
      alerts: [],
      // The longest sentence the band can carry, which is the one
      // `EVENT_BAND_HOLD_CEILING_MS` is derived from.
      event: { sequence, labelKey: 'hud.alert.event.economy.construction-refused', severity: 'warning' },
    });

    /** `.hud`'s rows as numbers, in grid order. */
    const rows = async (page: Page): Promise<readonly number[]> =>
      page.evaluate(() => {
        const hud = document.querySelector('.hud');
        if (hud === null) throw new Error('the harness mounted no HUD');
        return getComputedStyle(hud)
          .gridTemplateRows.split(' ')
          .map((row) => Math.round(Number.parseFloat(row) * 10) / 10);
      });

    test('takes its height from the middle row while it speaks, and hands it back when it stops', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 600 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      const band = page.locator('.hud__event');

      // The page really laid out, before a single number below is trusted.
      const before = await rows(page);
      expect(before, '`.hud` is not the six-row grid this test is about').toHaveLength(6);
      expect(before[EVENT_ROW], 'the band already had a row before anything raised it').toBe(0);
      await expect(band).toBeHidden();

      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withEvent(1));

      await expect(band, 'the event never reached the band at all').toBeVisible();
      const raised = await rows(page);
      // The text metrics can differ by a pixel across hosts. The contract is
      // that the grid pays exactly the band height and returns it afterwards.
      const eventHeight = await band.evaluate(
        (element) => Math.round(element.getBoundingClientRect().height * 10) / 10,
      );
      expect(raised[EVENT_ROW], 'the band is on screen and costing the grid nothing, which cannot both be true').toBe(
        eventHeight,
      );
      expect(
        (raised[MIDDLE_ROW] ?? 0) + eventHeight,
        'the band height did not come out of the middle row, so it came from somewhere this test cannot see',
      ).toBe(before[MIDDLE_ROW]);

      // The floor first: the band owes this sentence its dwell, so a ceiling
      // that fired early would be the floor's defect wearing this fix's name.
      // `EVENT_BAND_DWELL_FLOOR_MS` is read from the module rather than
      // restated, so lowering the ceiling under the floor fails here as well as
      // in the unit suite.
      await page.waitForTimeout(EVENT_BAND_DWELL_FLOOR_MS);
      await expect(band, 'the band dropped the sentence inside its own dwell floor').toBeVisible();

      // And then it lets go. `toBeHidden` waits, so this is one-directional: a
      // band still up after twice its ceiling is the defect, and a slow machine
      // costs wall-clock time rather than a false red.
      await expect(band, 'the band never let go of its row').toBeHidden({ timeout: EVENT_BAND_HOLD_CEILING_MS * 2 });

      const after = await rows(page);
      expect(after[EVENT_ROW], 'the band went quiet and kept its row, which is #985 exactly').toBe(0);
      expect(after, 'the grid did not return to the shape it had before anything happened').toEqual(before);
    });

    test('does not raise the same sentence again when the view model republishes it', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 600 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      const band = page.locator('.hud__event');

      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withEvent(1));
      await expect(band).toBeVisible();
      await expect(band).toBeHidden({ timeout: EVENT_BAND_HOLD_CEILING_MS * 2 });

      // `HudViewModel.event` is sticky in `src/main.ts` -- the field stands on
      // every message after the one that carried the event -- and the counts
      // channel republishes up to twice a second. Four republications stand in
      // for that here; without `EventBandDwellState.retired` the first of them
      // puts the row straight back.
      for (const _ of [1, 2, 3, 4]) {
        await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withEvent(1));
      }
      await expect(band, 'a republication of the same event raised the band again').toBeHidden();
      expect((await rows(page))[EVENT_ROW]).toBe(0);

      // A *new* event still speaks, which is what makes the assertion above a
      // release rather than a band that has stopped working.
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withEvent(2));
      await expect(band, 'the band was retired rather than released: a newer event could not raise it').toBeVisible();
      const eventHeight = await band.evaluate(
        (element) => Math.round(element.getBoundingClientRect().height * 10) / 10,
      );
      expect((await rows(page))[EVENT_ROW]).toBe(eventHeight);
    });
  });

  /**
   * The alerts list draws `viewModel.alerts` in the order the view model gives
   * them (issue #209's residual-risk note).
   *
   * The note was recorded by reading and had a stated confirmation method:
   * "mount the HUD with alerts `[A, B]`, update to `[C, A, B]`, and read the
   * `[data-alert]` order". That is what the first test below does, and it is
   * where the answer came from -- `paintAlerts` updated an existing row in
   * place and *appended* a new one, so the list was in first-seen order and
   * the browser laid out `[a, b, c]` for a view model that said `[c, a, b]`.
   *
   * It was latent when it was found: after #220 the alerts list had no
   * producer at all (`main.ts` sent the "simulation unavailable" sentence to
   * `.hud__unavailable` instead), and the note said it would become visible
   * "the moment #104's channel gives the list a source that reports more than
   * one row". #261 gave it the source -- a refusal the simulation reported --
   * and stopped one step short of the condition: that producer emits at most
   * one row, because the counts channel carries the *last* refusal rather
   * than a queue of them (`RefusalLog`). So these four tests are still the
   * only thing in the repository that exercises the ordering, and they stay
   * exactly as they are until a second producer merges into the same list.
   * It is the defect `main.ts` argues against for the buildable catalogue --
   * an order nobody chose -- and it is unfixable from the outside, because a
   * caller cannot make its own output order survive a renderer that ignores
   * it.
   *
   * The alert ids here are opaque strings and the label key repeats down the
   * list on purpose: the message catalogue defines no per-alert key (only
   * `hud.alerts.title` and `hud.alerts.empty`), and inventing one here would
   * put a key with no translation on screen. What distinguishes the rows for
   * the reader is the severity badge, which is real catalogue text.
   */
  test.describe('alerts list order (issue #209)', () => {
    const ALERT_LABEL_KEY = 'hud.alerts.title';

    const withAlerts = (ids: readonly string[]): HudViewModel => ({
      counts: {
        prisoners: 142,
        prisonerCapacity: 180,
        occupiedPlaces: 142,
        staff: 27,
        staffUnassigned: 0,
        rooms: 61,
        prisonersCovered: 100,
        prisonersUnderstaffed: 30,
        prisonersUnguarded: 12,
        prisonersHighRisk: 0,
        activeIncidents: 0,
        contrabandFound: 4,
        treasuryMinorUnits: 24_920,
        stateIncomeAccruedTodayMinorUnits: 10_667,
      },
      clock: { day: 3, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
      alerts: ids.map((id, index) => ({
        id,
        labelKey: ALERT_LABEL_KEY,
        severity: index === 0 ? 'danger' : index === 1 ? 'warning' : 'info',
      })),
    });

    test('an alert inserted at the front is drawn at the front, not appended', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts(['a', 'b']));
      expect((await page.evaluate(() => window.lockstateUiHarness.alertProbe())).order).toEqual(['a', 'b']);

      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts(['c', 'a', 'b']));
      const probe = await page.evaluate(() => window.lockstateUiHarness.alertProbe());

      // The measurement issue #209 asked for. Before the fix this read
      // `['a', 'b', 'c']`.
      expect(probe.order).toEqual(['c', 'a', 'b']);
    });

    test('a reordered view model reorders the rows without rebuilding them', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts(['a', 'b', 'c']));
      await page.evaluate(() => window.lockstateUiHarness.markAlertRows());

      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts(['c', 'b', 'a']));
      const probe = await page.evaluate(() => window.lockstateUiHarness.alertProbe());

      expect(probe.order).toEqual(['c', 'b', 'a']);
      // Every row is the same DOM node it was before the reorder: the fix
      // moves rows, it does not empty the list and build three new ones. A
      // rebuild would satisfy the order assertion above and quietly discard
      // the identity `HudAlertViewModel.id` exists for.
      expect(probe.reused).toEqual(['c', 'b', 'a']);
      // The rows carry their own severity word with them rather than the one
      // that used to be at that position: `c` was `info` when it was drawn
      // third and is `danger` now that the view model puts it first.
      // `textContent` runs the row's label and its badge together with no
      // separator, which is what the concatenation below is.
      expect(probe.texts).toEqual(['AlertsCritical', 'AlertsWarning', 'AlertsInfo']);
    });

    test('a removed alert leaves the survivors in view-model order', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts(['a', 'b', 'c']));

      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts(['c', 'a']));
      expect((await page.evaluate(() => window.lockstateUiHarness.alertProbe())).order).toEqual(['c', 'a']);

      // And back to none: the empty-list row is not an alert row, so the
      // probe reports an empty list rather than a list of one.
      //
      // **The toggle is gone as of #703 ruling 1.** It was here to *open* the
      // section before the visibility assertion below could mean anything; the
      // section starts open now, so the press would shut it and the row would
      // be hidden -- which is exactly how this failed when the initial state
      // moved. The visibility assertion is the point and it is kept.
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts([]));
      expect((await page.evaluate(() => window.lockstateUiHarness.alertProbe())).order).toEqual([]);
      await expect(page.locator('.hud-alerts__list [data-alert="empty"]')).toBeVisible();
    });

    /**
     * **"No alerts" and "no data" are two states and now say two things**
     * (issue #1184, `konstytucja.md` article 5's third named anti-pattern).
     *
     * Until this landed the section painted *"No active alerts"* from the same
     * `alerts: []` the view model held before any worker snapshot had arrived,
     * so a page with no simulation behind it made a confident claim about a
     * prison it had never heard of -- while the sibling `clock` field in that
     * very object carried `UNKNOWN_HUD_CLOCK` precisely so it could not.
     *
     * Both halves are asserted against each other rather than one alone,
     * exactly as the Overview section's own sentinel test does, because the
     * cheap way to pass the first assertion is to stop saying "no active
     * alerts" at all -- and a prison genuinely reporting nothing wrong must
     * still say so. The sentences are quoted verbatim: a swap that left both
     * states rendering the same words would satisfy every structural
     * assertion.
     */
    test('says no prison is reporting before one has, and says the prison is clear once one does (#1184)', async ({
      page,
    }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell({ empty: true }));

      const sentinel = page.locator('.hud-alerts__none');
      const emptyRow = page.locator('.hud-alerts__list [data-alert="empty"]');
      // A box, not an attribute: a stylesheet whose guard has been lost paints
      // the sentence at full height with `hidden` still set, and a spec reading
      // the attribute would agree with it.
      await expect(sentinel).toBeVisible();
      await expect(sentinel).toHaveText('No prison is reporting.');
      // Not merely hidden -- the row is not built at all, because the list it
      // belongs to is not on screen.
      await expect(emptyRow).toHaveCount(0);
      await expect(page.locator('.hud-alerts__list')).toBeHidden();

      // A prison that has reported, and has nothing wrong to report. This is
      // the state `hud.alerts.empty` was always true of, and it keeps it.
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts([]));
      await expect(sentinel).toBeHidden();
      await expect(emptyRow).toBeVisible();
      await expect(emptyRow).toHaveText('No active alerts');

      // And a prison with something to say puts it in the list, with neither
      // sentence standing beside it.
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts(['a']));
      await expect(sentinel).toBeHidden();
      await expect(emptyRow).toHaveCount(0);
      expect((await page.evaluate(() => window.lockstateUiHarness.alertProbe())).order).toEqual(['a']);
    });

    test('the rows are on screen once the section is open, not merely in the DOM', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts(['c', 'a', 'b']));
      // **The section starts OPEN as of #703 ruling 1, so nothing is toggled
      // here any more.** It used to start folded -- which is how #82's alert
      // was asserted green while no player could see it (#220) -- and this test
      // opened it before reading the order, because an order assertion on rows
      // nobody can see repeats that mistake. The precaution is unchanged and is
      // now free: the rows are laid out without a press, and the assertion
      // below still reads a *laid out* list rather than the DOM.

      expect((await page.evaluate(() => window.lockstateUiHarness.alertProbe())).order).toEqual(['c', 'a', 'b']);
      await expectLaidOut(page, '.hud-alerts__list [data-alert]', 'the alert rows');
      await expect(page.locator('.hud-alerts__list [data-alert="c"]')).toBeVisible();
    });
  });

  /**
   * THE SENTENCES IN THE ALERTS LOG ARE WHOLE ON SCREEN, NOT ONLY IN THE DOM
   * (issue #720).
   *
   * ## Why this block exists beside the four tests above
   *
   * Every one of them reads the DOM. `alertProbe().texts` is `textContent`,
   * `toBeVisible` is a box and a `visibility`, and `expectLaidOut` is
   * `getClientRects().length > 0`. A clipped element satisfies all three: it
   * is laid out, it is visible, and its text node is the whole sentence. On
   * 2026-08-31 the log showed about **ten characters of every sentence in
   * it**, at 1280x800 and identically at 1920x1080, with this file green --
   * four separate acts of DOM probing during a playtest called it correct
   * and only a screenshot found it.
   *
   * `expectNotClipped` is the assertion that was missing, and
   * `tests/browser/clipping.ts` says what it measures. The rows here are the
   * case it was written for.
   *
   * ## Why the sentences are real catalogue sentences
   *
   * The block above deliberately repeats `hud.alerts.title` down the list,
   * because order is what it asserts and a key with no translation must not
   * reach the screen. This block asserts *width*, so the string has to be a
   * string the game really renders: `hud.alert.event.contraband.discovered`
   * is the sentence rulings 3 and 13 of #703 authored so that a found phone
   * stops rendering as the character `1`, and it is the one the screenshot
   * in #720 caught reading `Contraban...`. The longest refusal in the
   * catalogue is here too, because a fix that only fits the short one is not
   * a fix: eight rows of it measure a 1065px list inside a 342px box at
   * 1280x720, which the list's own `overflow-y: auto` (#703 ruling 1)
   * absorbs.
   */
  test.describe('the alerts log is readable, not merely rendered (issue #720)', () => {
    const CONTRABAND_KEY = 'hud.alert.event.contraband.discovered';
    const LONGEST_REFUSAL_KEY = 'hud.alert.refusal.zone.not-enclosed';
    const EIGHT_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    const withSentences = (count: number, labelKey: string): HudViewModel => ({
      counts: {
        prisoners: 142,
        prisonerCapacity: 180,
        occupiedPlaces: 142,
        staff: 27,
        staffUnassigned: 0,
        rooms: 61,
        prisonersCovered: 100,
        prisonersUnderstaffed: 30,
        prisonersUnguarded: 12,
        prisonersHighRisk: 0,
        activeIncidents: 0,
        contrabandFound: 4,
        treasuryMinorUnits: 24_920,
        stateIncomeAccruedTodayMinorUnits: 10_667,
      },
      clock: { day: 3, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
      alerts: EIGHT_IDS.slice(0, count).map((id, index) => ({
        id,
        labelKey,
        labelParameters: { item: 'Mobile phone' },
        severity: index === 0 ? 'danger' : index === 1 ? 'warning' : 'info',
      })),
    });

    for (const [width, height] of [
      [1280, 720],
      [1280, 800],
      [1920, 1080],
    ] as const) {
      test(`no row is cut off at ${String(width)}x${String(height)}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

        for (const labelKey of [CONTRABAND_KEY, LONGEST_REFUSAL_KEY]) {
          await page.evaluate(
            (model) => window.lockstateUiHarness.setHudViewModel(model),
            withSentences(8, labelKey),
          );

          // The three assertions in order, because each answers a question
          // the next one does not: the sentence is in the DOM, the row is on
          // the page, and the sentence is not being painted with its end cut
          // off. Before the `wrap` this list passes on the first two.
          await expect(page.locator('.hud-alerts__list [data-alert="a"]')).toContainText('.');
          await expectLaidOut(page, '.hud-alerts__list .ui-row__label', 'the alert row labels');
          await expectNotClipped(page, '.hud-alerts__list .ui-row__label', 'the alert row labels');
        }
      });
    }

    /**
     * The empty-list row wraps too, and this asserts the *class* because
     * nothing else here can.
     *
     * `hud.alerts.empty` is "No active alerts", which fits the row at every
     * viewport -- so `expectNotClipped` on it is green with the wrap and
     * green without it, and a test that cannot fail is worth nothing. What
     * is actually being pinned is that every row of this list is a wrapping
     * row, including the one the player sees most often; a translation of
     * that string longer than the English would otherwise be the single row
     * here that gets cut, and it would be cut in a locale nobody runs the
     * browser suite in.
     */
    test('the empty-list row wraps like every other row in this list', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withSentences(0, CONTRABAND_KEY));

      const emptyRow = page.locator('.hud-alerts__list [data-alert="empty"]');
      await expect(emptyRow).toBeVisible();
      await expect(emptyRow).toHaveClass(/\bui-row--wrap\b/);
      await expectNotClipped(page, '.hud-alerts__list [data-alert="empty"] .ui-row__label', 'the empty-list row');
    });

    /**
     * THE CHECK CAN FAIL, WHICH IS THE ONE THING THE BLOCK ABOVE CANNOT SHOW.
     *
     * Everything above is green after the fix, and would be equally green if
     * `expectNotClipped` compared nothing at all -- which is precisely the
     * failure #720 is about, a probe reporting a surface correct because it
     * was asking the wrong question. So the probe is pointed at an element
     * built here to be clipped, and the clipping it reports is asserted
     * against numbers this test states rather than reads back: a 40px box
     * around 400px of nowrap text under `overflow: hidden`.
     *
     * Deliberately not `expectNotClipped`, which would only tell us that
     * *something* was found. The figures are what say it found the right
     * thing.
     *
     * Both kinds are controlled, because the probe reports two and a version
     * that saw only one swept clean over three of the four labels
     * `docs/research/2026-08-31-playing-the-twelve.md` §12 measured:
     * `overflow: hidden` hides the overflow (`cut`), `overflow: visible`
     * paints it on the neighbours (`spilled`), and the third state --
     * `overflow: auto`, which a player can scroll -- must produce no finding
     * at all or every scrolling list in the HUD becomes one.
     */
    test('the clipping probe reports a deliberately clipped element', async ({ page }) => {
      // One box per state, same content: fifty monospace characters, which is
      // several hundred pixels of text in a 40px box.
      await page.evaluate(() => {
        for (const [name, overflow] of [
          ['cut', 'hidden'],
          ['spilled', 'visible'],
          ['scrollable', 'auto'],
        ] as const) {
          const control = document.createElement('div');
          control.className = `lockstate-clipping-control lockstate-clipping-${name}`;
          control.setAttribute(
            'style',
            `position:fixed;left:0;top:0;width:40px;height:20px;overflow:${overflow};white-space:nowrap;font:16px monospace`,
          );
          control.textContent = 'x'.repeat(50);
          document.body.append(control);
        }
      });

      const probe = await page.evaluate(probeClipping, '.lockstate-clipping-control');

      expect(probe.matched, 'the three control elements were not found, so nothing was measured').toBe(3);
      // The scrollable one is deliberately absent: its overflow is reachable.
      expect(probe.clipped.map((one) => one.kind)).toEqual(['cut', 'spilled']);

      for (const found of probe.clipped) {
        expect(found.clientWidth, 'the control box is the 40px this test set').toBe(40);
        expect(found.scrollWidth, 'fifty monospace characters are far wider than 40px').toBeGreaterThan(300);
        expect(found.hiddenX, 'the horizontal overflow is what the probe reports').toBeGreaterThan(260);
        expect(found.hiddenY, 'one line of 16px text fits in a 20px box, so nothing leaves it vertically').toBe(0);
      }
    });
  });

  /**
   * Layout regressions found by measuring, not by looking. Both of these
   * were live before the CSS that fixes them, and neither is visible at the
   * one viewport a developer happens to have open.
   */
  test.describe('responsive layout', () => {
    test('the strip never pushes the shell wider than the viewport', async ({ page }) => {
      // The HUD grid used an implicit `auto` column, so the dense strip's
      // min-content width sized the whole grid: at 375px the shell was
      // 1021px wide and the centred tab bar sat mostly off the right edge.
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      const layout = await page.evaluate(() => window.lockstateUiHarness.layoutProbe());

      expect(layout.strip?.width).toBeLessThanOrEqual(375);
      expect(layout.tabs?.x).toBeGreaterThanOrEqual(0);
      expect(layout.tabs?.right).toBeLessThanOrEqual(375);
      // The metrics row absorbs the overflow by scrolling, which is what
      // lets the strip stay inside the viewport without dropping a metric.
      expect(layout.metricsScrollWidth).toBeGreaterThan(layout.metricsClientWidth);
      // The minimap would eat a phone screen; the tab bar is how the game is
      // operated, so it is the one that stays.
      //
      // **And the reason it stays is not the one this comment gave**, which
      // #703 ruling 5's withdrawn attempt established by measurement: the
      // corner never overlapped the tab bar at any width, and what it does
      // overlap below 720px is the stretched rail. `hud.css`'s note on that
      // block carries the numbers.
      expect(layout.minimap).toBeNull();
    });

    test('the minimap frame never overlaps the tab bar', async ({ page }) => {
      // Both were bottom-anchored in the same grid row, so at 768px the
      // minimap's right edge landed 16px inside the centred tab bar.
      //
      // **375 and 600 cannot be in this list, and that is a fact about the
      // stylesheet rather than an omission**: `.hud__corner` is `display: none`
      // at 720px and below, so there is no box to measure. #703 ruling 5's
      // withdrawn attempt measured what happens with the rule removed -- still
      // no overlap with the tab bar at 375 or 600, and instead a collision with
      // the stretched rail, which is why the rule went back.
      for (const width of [768, 900, 1024, 1280, 1600]) {
        await page.setViewportSize({ width, height: 700 });
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        const layout = await page.evaluate(() => window.lockstateUiHarness.layoutProbe());
        expect(layout.minimap, `minimap missing at ${width}px`).not.toBeNull();
        expect(layout.minimapOverlapsTabs, `minimap overlaps the tab bar at ${width}px`).toBe(false);
        expect(layout.tabs?.right, `tab bar overflows at ${width}px`).toBeLessThanOrEqual(width);
      }
    });
  });

  /**
   * Issue #74's UI half: building has to be reachable from the running app.
   *
   * The panel is DOM, and Vitest runs in the `node` environment with no DOM
   * and no DOM library as a dependency, so a real browser is the lowest layer
   * that can prove any of this. What matters is that a real tap sequence --
   * pick a buildable, move a coordinate, choose an edge, press the one
   * primary action -- produces exactly one intent carrying exactly what was
   * on screen.
   */
  /**
   * Issue #261 step 4: **the surface that admits a prisoner.**
   *
   * The panel exists at all because the Build panel measurably cannot hold a
   * control -- ADR 0022 took the always-visible budget at 12.2px at 900x600
   * and 38.2px at 1280x720 against a 44px tap target, and measured a third
   * button in `.hud-build__actions` overflowing horizontally by 37.9px. What
   * was free was the Overview tab, which showed nothing at all. So these
   * tests are about two things a unit test cannot answer: that the browser
   * actually lays the panel out on the tab it belongs to, and that it and the
   * Build panel never occupy the shared rail slot at the same time.
   *
   * **The tab it belongs to changed on 2026-09-14 and the paragraph above is
   * kept rather than rewritten**, because it is the record of why this panel
   * was on Overview and the reason was pixels rather than subject. ADR 0112
   * decision 3 moved the navigation to the delivery's five sections and the
   * owner ruled that admissions belong under Zarządzaj, so the panel is on
   * **Manage** now, beside the Staff panel. Both claims above still hold:
   * the browser still has to lay it out on the tab it belongs to, and the rail
   * slot is still shared -- with the difference, pinned below, that Manage is
   * the one tab that lays out two panels rather than one.
   */
  test.describe('intake panel (issue #261 step 4)', () => {
    test('is laid out on the Manage tab, beside the staff it admits people into', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

      // Overview is the default tab (`hud-state.ts`) and is no longer this
      // panel's, so unlike every version of this test before 2026-09-14 the
      // click is the point rather than an omission.
      expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).activeTab).toBe('overview');
      expect(await page.evaluate(() => window.lockstateUiHarness.intakeProbe())).toMatchObject({ laidOut: false });
      await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
      const probe = await page.evaluate(() => window.lockstateUiHarness.intakeProbe());

      // Laid out, not merely present: a control inside a `hidden` panel is
      // reachable by a keyboard and invisible to a player.
      expect(probe.laidOut).toBe(true);
      expect(probe.admitLaidOut).toBe(true);
      expect(probe.admitLabel).toBe('Admit a prisoner');
      expect(probe.admitDisabled).toBe(false);
      // The sentence that says what an admission needs, on screen before the
      // player presses anything rather than only after. ADR 0011: an unresolved
      // key renders as itself, so a raw `hud.` prefix here is a missing catalog
      // entry.
      //
      // It used to read "A prisoner can only be admitted into a prison that has
      // a room to hold them", and this assertion used to require that phrase.
      // The sentence was false about the shipped game -- a one-bed cell took
      // twelve admissions (issue #549) -- so what is required now is that the
      // note states both halves of what the control really does, and that it no
      // longer denies the half that was measured.
      //
      // **#935 rewrote it again** to stop it contradicting the Regime tab's
      // first-cell instruction: it no longer denies that a bed is needed, it
      // says what the cell and the bed are each needed *for* -- admitting, and
      // housing -- and adds #937's income rule. What #549 required survives in
      // that shape: the admission clause names the cell alone, and the bed is
      // attached to housing, not to admitting.
      expect(probe.hint).toContain('Admitting needs a cell');
      expect(probe.hint).toContain('housing needs a bed');
      expect(probe.hint).toContain('only for prisoners with a place');
      expect(probe.hint).not.toMatch(/admit\w* needs a (free )?bed|bed (before it can|to) admit/i);
      // And it does not flatly deny the bed the Regime tab's first-cell
      // instruction asks for, which is the on-screen disagreement #935 names.
      expect(probe.hint).not.toMatch(/(does not|doesn't) need a (free )?bed/i);
      expect(probe.hint).not.toContain('can only be admitted');
      expect(probe.hint.startsWith('hud.')).toBe(false);
    });

    test('never shares the rail slot with the Overview, Build, Rooms, Regime or Prisoners panel', async ({ page }) => {
      // The whole reason this panel costs the measured budget nothing. If any
      // two were ever laid out together, one panel's height would have to pay
      // for the other's, which is the overflow ADR 0022 refused. All five
      // occupants of `.hud__side` are asserted on every tab -- the one that
      // owns them and the four that do not -- so a sixth panel added to the
      // rail cannot go unnoticed here.
      //
      // The list is exhaustive on purpose, and it has been wrong once: it
      // probed four panels while the branch that added the Regime panel was
      // merged, so the fifth occupant could have been laid out beside any of
      // the other four and every assertion here would still have passed
      // (issue #451).
      const rail = async (): Promise<Record<string, boolean>> => ({
        overview: (await page.evaluate(() => window.lockstateUiHarness.overviewProbe())).laidOut,
        intake: (await page.evaluate(() => window.lockstateUiHarness.intakeProbe())).laidOut,
        build: (await page.evaluate(() => window.lockstateUiHarness.buildProbe())).visible,
        rooms: (await page.evaluate(() => window.lockstateUiHarness.roomsProbe())).panelLaidOut,
        staff: (await page.evaluate(() => window.lockstateUiHarness.staffProbe())).visible,
        regime: (await page.evaluate(() => window.lockstateUiHarness.regimeProbe())).laidOut,
        // The sixth occupant, and the second of a pair (ADR 0115). The comment
        // above about the list having been wrong once is why it is here from
        // the commit that adds the panel rather than afterwards.
        roster: (await page.evaluate(() => window.lockstateUiHarness.regimeProbe())).rosterPanelLaidOut,
      });

      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      // Overview is the default tab, and since 2026-09-14 what it holds is the
      // readout rather than the Intake panel (issue #1183).
      expect(await rail()).toEqual({ overview: true, intake: false, build: false, rooms: false, staff: false, regime: false, roster: false });

      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      expect(await rail()).toEqual({ overview: false, intake: false, build: true, rooms: false, staff: false, regime: false, roster: false });

      await page.evaluate(() => window.lockstateUiHarness.clickTab('zones'));
      expect(await rail()).toEqual({ overview: false, intake: false, build: false, rooms: true, staff: false, regime: false, roster: false });

      /*
       * **Manage is the one tab that lays out two panels**, and that is the
       * assertion this test exists to carry now. Every tab held exactly one
       * until the owner's ruling of 2026-09-14 moved admissions in beside the
       * staff; the pair is what ADR 0022's budget argument has to be read
       * against from here, and a third panel arriving on this tab silently is
       * exactly what this line stops.
       */
      await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
      expect(await rail()).toEqual({ overview: false, intake: true, build: false, rooms: false, staff: true, regime: false, roster: false });

      // And the fifth tab is the Regime panel's -- and, since the owner's
      // ruling of 2026-09-16 on ADR 0115, the Prisoners panel's beside it.
      // This assertion used to read "And none is laid out on the one tab that
      // still owns no panel", and pinned that emptiness deliberately; issue
      // #451 spent it, and the ruling split what it bought into two panels
      // that must be laid out **together** -- the roster's placement is what
      // the ruling decided, so `roster: true` here is the ruling and
      // `roster: false` on the Manage lines is the option that was declined.
      await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'));
      expect(await rail()).toEqual({ overview: false, intake: false, build: false, rooms: false, staff: false, regime: true, roster: true });

      await page.evaluate(() => window.lockstateUiHarness.clickTab('overview'));
      expect(await rail()).toEqual({ overview: true, intake: false, build: false, rooms: false, staff: false, regime: false, roster: false });
    });

    /**
     * The Overview section's own readout (issue #1183), and the one property it
     * was specified before it was written for: **empty must not be able to mean
     * two things.**
     *
     * `'hud.alerts.empty'` was the live counter-example (#1184): it rendered
     * from the same empty literal that stood in before the first worker
     * snapshot, so *"No active alerts"* was what a page with no simulation
     * behind it said about a prison it had never heard of. That issue is
     * closed -- the alerts list took this panel's shape and this panel's
     * sentence, and the block above asserts it. A balance is worse, and
     * `EMPTY_HUD_VIEW_MODEL.counts` used to carry a confident
     * `treasuryMinorUnits: 0` -- a readout keyed on it told a player their
     * prison was broke before the worker had spoken, which is what the status
     * strip itself did until #1191 took the whole row off. So the two states
     * are asserted against each other here rather than one of them being
     * checked alone.
     */
    test('states published figures for a prison that has reported, and says so when none has', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

      const reported = await page.evaluate(() => window.lockstateUiHarness.overviewProbe());
      expect(reported.laidOut).toBe(true);
      expect(reported.figuresLaidOut).toBe(true);
      // A box, not an attribute: a stylesheet whose guard has been lost paints
      // the sentence at full height with `hidden` still set, and a spec reading
      // the attribute would agree with it.
      expect(reported.noneLaidOut).toBe(false);
      // The three figures the fixture published, each read off its own field --
      // no two are equal, so a row wired to the wrong one is visible here.
      expect(reported.figures).toEqual({ funds: '24920', 'earned-today': '10667', wages: '4800' });
      // The strip's own two words for the two figures the strip also shows,
      // plus the rate's own label. An unresolved key renders as itself
      // (ADR 0011), so a raw `hud.` prefix here is a missing catalog entry.
      expect(reported.rowTexts).toEqual(['Funds24,920', 'Earned today10,667', 'Wages a day4,800']);

      await page.evaluate(() => window.lockstateUiHarness.mountHudShell({ empty: true }));
      const silent = await page.evaluate(() => window.lockstateUiHarness.overviewProbe());
      expect(silent.laidOut).toBe(true);
      // Not a zero, and not a blank box either: a sentence, with the figures
      // taken off entirely.
      expect(silent.figuresLaidOut).toBe(false);
      expect(silent.noneLaidOut).toBe(true);
      expect(silent.noneText).toBe('No prison is reporting.');
      expect(silent.noneText.startsWith('hud.')).toBe(false);
      expect(silent.figures).toEqual({ funds: '', 'earned-today': '', wages: '' });
    });

    test('one press is one gated intent carrying nothing', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

      // On the tab that now owns the panel, so the press is one a player could
      // actually make: `clickAdmitPrisoner` reaches the button through the DOM
      // and would fire it inside a `hidden` panel, which is not a gesture.
      await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
      expect(await page.evaluate(() => window.lockstateUiHarness.clickAdmitPrisoner())).toBe(true);

      // Payload-free by design: the sentence length, the prior-incident count
      // and the arrival tile are the host's, and who arrives is the
      // simulation's seeded business.
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.hudIntents()))
        // Two intents, and the first is the tab press that reached the panel --
        // the section move of 2026-09-14 is why it is here. It carries no
        // command (`dispatchShell`, not `dispatchCommand`), which is exactly
        // why it can sit in front of the assertion without weakening it: what
        // is still pinned is that the *admission* carries nothing.
        .toEqual([JSON.stringify({ kind: 'select-tab', tab: 'manage' }), JSON.stringify({ kind: 'admit-prisoner' })]);
      expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
    });

    test('a refused admission is reported on the button that was pressed, exactly once', async ({ page }) => {
      // The behaviour the change is built around: an admission into a prison
      // with no accommodation room is refused, which is the state every prison
      // starts in. A control whose answer is a refusal has to say so loudly, or
      // it is the silent no-op #207 and #225 exist to remove. This mounts the
      // shell with intents forced to fail, so it measures the reporting route
      // rather than the prison -- see
      // `tests/integration/prisoner-admission-loop.test.ts` for which prison
      // states produce which answer.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));

      expect(await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).toMatchObject({
        visible: false,
        action: null,
        failedControls: [],
      });

      await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
      await page.evaluate(() => window.lockstateUiHarness.clickAdmitPrisoner());

      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible), {
          message: 'the HUD never reported the refused admission',
        })
        .toBe(true);
      const probe = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(probe.action).toBe('admit-prisoner');
      // A sentence about the outcome, not the thrown `Error` -- which is
      // English raised on the main thread and may not reach the screen.
      expect(probe.text).toContain('Nobody was admitted');
      expect(probe.text).not.toContain('ui-harness: the host refused');
      // One message and one marked control, not two: the refusal line is
      // single-slot and the marked control is the one that was pressed.
      expect(probe.failedControls).toEqual(['Admit a prisoner']);
      expect(probe.describedByRefusal).toBe(true);
      expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
    });

    /**
     * **The over-admission warning** (issue #549).
     *
     * The defect was that the panel's standing note denied a state the shipped
     * game reaches by ordinary play: twelve presses of Admit into a cell with
     * one bed in it were all accepted, eleven arrivals sat at Cell Assignment,
     * and the only sentence on screen that mentioned accommodation said that
     * could not happen. `tests/integration/over-admission-signal.test.ts` drives
     * the prison that produces the figure; this is the half only a browser can
     * settle -- whether the line has a **box**, what colour it computes to, and
     * whether the panel can afford it.
     *
     * ### Why the box and not the attribute
     *
     * `.hud-intake__no-place` carries an author `display`, and an author
     * `display` beats the `display: none` a user agent gives `[hidden]`. So a
     * stylesheet that lost its `:not([hidden])` guard paints the line at full
     * height with `hidden` still set, and a spec reading `.hidden` would agree
     * with it. `IntakeProbe.noPlaceBox` is `null` only for a node that is
     * genuinely not laid out.
     *
     * ### What the panel had to spend
     *
     * Measured on this tree, at the three viewports below, by growing the
     * readout one line at a time until a box in the chain went shorter than its
     * own content. The Intake panel is bottom-anchored and alone in
     * `.hud__side` on the Overview tab -- `paintState` shows exactly one of the
     * five rail panels -- so it grows *upward* into an otherwise empty rail
     * rather than competing with a catalogue for a fixed body:
     *
     * **THE PREMISE OF THAT PARAGRAPH ENDED ON 2026-09-14 AND THE TABLE BELOW
     * IS THE OLD ARRANGEMENT'S, KEPT BECAUSE IT IS WHAT THE NEW ONE WAS
     * MEASURED AGAINST.** The owner's ruling of that day moved this panel to
     * the Manage tab (ADR 0112 decision 3), where the Staff panel already was,
     * so it is not alone any more and the spare below is not its own. Measured
     * immediately after the move, with the same `FULLEST` readout: 1280x720 and
     * 375x812 were unaffected, and at **900x600 `.hud-intake` came out 42px
     * shorter than its own content** -- this assertion failing on exactly the
     * overflow ADR 0022 refused.
     *
     * `hud.css` carries what was done about it, and what was tried first and
     * did not work: `overflow-y: auto`, the remedy the four panels beside it
     * use, left the 42px exactly where it was, because what this test states is
     * that the panel never has to scroll at all. What fits is `flex: 0 0 auto`
     * on this panel -- its height is bounded by `INTAKE_STAGES` and cannot grow
     * with the prison, while the Staff panel's grows with the roster and is
     * already a scroll container with a two-row floor, so the one built to
     * absorb a squeeze absorbs it.
     *
     * | viewport | panel ceiling | fullest real readout | spare |
     * |---|---|---|---|
     * | 1280x720 | 579px | 275px | 304px |
     * | 900x600  | 467px | 275px | 192px |
     * | 375x812  | 623px | 260px | 363px |
     *
     * "Fullest real readout" is all four non-terminal stage lines, the terminal
     * line and this warning together, which is the most the panel can ever be
     * asked to draw: `INTAKE_STAGES` holds six and two of them are terminal.
     * The warning itself measured **13px**. So no catalogue floor is donated
     * here and none is needed -- the idiom `.hud-build[data-queued]` and
     * `.hud-rooms[data-needs]` use exists because those panels had 0px and
     * 12.2px at 900x600, and this one has 192px.
     */
    test.describe('the over-admission warning (issue #549)', () => {
      /** Twelve admissions into a one-bed cell, as the projection reports them. */
      const OVER_ADMITTED = {
        waiting: 11,
        failed: 0,
        total: 12,
        waitingWithoutPlace: 11,
        stages: [
          { stageId: 'accommodation-assignment', labelKey: 'intake-stage.accommodation-assignment.name', count: 11 },
        ],
      } as const;

      /** The same eleven at Cell Assignment, in a prison that has beds for them. */
      const WAITING_BUT_HOUSED = { ...OVER_ADMITTED, waitingWithoutPlace: 0 } as const;

      test('says nothing at all until the prison runs out of beds', async ({ page }) => {
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        // The tab that holds this panel since 2026-09-14 (ADR 0112 decision 3).
        await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));

        // Nothing has answered for this prison yet.
        expect((await page.evaluate(() => window.lockstateUiHarness.intakeProbe())).noPlaceBox).toBeNull();

        // Eleven at Cell Assignment and beds for all of them. The readout draws
        // -- there is something to report -- and the warning does not. This is
        // the assertion an implementation keyed on the stage count fails: every
        // arrival passes through that stage, including every one the prison
        // houses without trouble.
        await page.evaluate((p) => window.lockstateUiHarness.reportIntakePipeline(p), WAITING_BUT_HOUSED);
        const quiet = await page.evaluate(() => window.lockstateUiHarness.intakeProbe());
        expect(quiet.pipelineBox, 'the readout must be drawn, so this is not a panel that says nothing').not.toBeNull();
        expect(quiet.pipelineStages).toEqual([{ stage: 'accommodation-assignment', text: '11 at Cell Assignment' }]);
        expect(quiet.noPlaceBox, 'no warning while every arrival has somewhere to go').toBeNull();
        expect(quiet.noPlaceText).toBe('');
        expect(quiet.text).not.toContain('no place to sleep');
      });

      test('tells the player how many people have nowhere to sleep, beside the control that admitted them', async ({
        page,
      }) => {
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        // The tab that holds this panel since 2026-09-14 (ADR 0112 decision 3).
        await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
        await page.evaluate((p) => window.lockstateUiHarness.reportIntakePipeline(p), OVER_ADMITTED);

        const probe = await page.evaluate(() => window.lockstateUiHarness.intakeProbe());
        const admit = await page.locator('.hud-intake__admit').boundingBox();

        expect(probe.noPlaceBox, 'the warning must have a real box, not merely a text node').not.toBeNull();
        expect(probe.noPlaceText).toBe('11 waiting with no place to sleep');
        expect(probe.noPlaceCount).toBe('11');
        // ADR 0011: an unresolved key renders as itself.
        expect(probe.noPlaceText.startsWith('hud.')).toBe(false);

        // Beside the control, which is the whole placement decision: it sits
        // under the admit button and above the standing note, not at the bottom
        // of a readout a player who is pressing Admit is not reading.
        expect(admit).not.toBeNull();
        expect(probe.noPlaceBox!.y).toBeGreaterThan(admit!.y + admit!.height - 1);
        expect(probe.noPlaceBox!.y, 'the warning is above the pipeline readout').toBeLessThan(probe.pipelineBox!.y);

        // Toned, and computed rather than declared: this is the one line on the
        // panel that is a warning rather than a readout, and a rule that never
        // reached the element would leave it the body colour.
        const stageColor = await page.evaluate(
          () => window.getComputedStyle(document.querySelector('.hud-intake__pipeline-stage')!).color,
        );
        expect(probe.noPlaceColor).not.toBe(stageColor);
        expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
      });

      test('takes the warning away again when the prison finds beds, rather than leaving it standing', async ({
        page,
      }) => {
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        // The tab that holds this panel since 2026-09-14 (ADR 0112 decision 3).
        await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
        await page.evaluate((p) => window.lockstateUiHarness.reportIntakePipeline(p), OVER_ADMITTED);
        expect((await page.evaluate(() => window.lockstateUiHarness.intakeProbe())).noPlaceBox).not.toBeNull();

        await page.evaluate((p) => window.lockstateUiHarness.reportIntakePipeline(p), WAITING_BUT_HOUSED);
        const after = await page.evaluate(() => window.lockstateUiHarness.intakeProbe());
        expect(after.noPlaceBox).toBeNull();
        expect(after.noPlaceCount).toBeNull();

        // And a session that stops answering takes it away too, for the reason
        // the readout comes off: a sentence about people with nowhere to sleep,
        // with nothing still answering for them, is the class of lie this layer
        // exists to avoid.
        await page.evaluate((p) => window.lockstateUiHarness.reportIntakePipeline(p), OVER_ADMITTED);
        expect((await page.evaluate(() => window.lockstateUiHarness.intakeProbe())).noPlaceBox).not.toBeNull();
        await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
        await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
        expect((await page.evaluate(() => window.lockstateUiHarness.intakeProbe())).noPlaceBox).toBeNull();
      });

      test('is a line the panel can afford at every viewport, 900x600 included', async ({ page }) => {
        // The recurring defect class this change sits in: a HUD panel given
        // content it has no height for. The Rooms panel had 0px of spare body
        // at 900x600 and a four-line addition put it 54px outside its own box.
        // So the fullest readout this panel can ever be asked to draw is
        // measured here at all three viewports, with the warning on -- the box
        // chain, not a screenshot.
        const FULLEST = {
          waiting: 12,
          failed: 3,
          total: 20,
          waitingWithoutPlace: 11,
          stages: [
            { stageId: 'queued', labelKey: 'intake-stage.queued.name', count: 3 },
            { stageId: 'reception', labelKey: 'intake-stage.reception.name', count: 3 },
            { stageId: 'classification', labelKey: 'intake-stage.classification.name', count: 3 },
            { stageId: 'accommodation-assignment', labelKey: 'intake-stage.accommodation-assignment.name', count: 3 },
          ],
        } as const;

        for (const [width, height] of [
          [1280, 720],
          [900, 600],
          [375, 812],
        ] as const) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
          // The tab that holds this panel since 2026-09-14 (ADR 0112 decision 3).
          await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
          await page.evaluate((p) => window.lockstateUiHarness.reportIntakePipeline(p), FULLEST);

          const probe = await page.evaluate(() => window.lockstateUiHarness.intakeProbe());
          const chain = await page.evaluate(() =>
            ['.hud-intake', '.hud-intake .ui-panel__body', '.hud__side', '.hud__rail']
              .map((selector) => {
                const box = document.querySelector(selector);
                if (box === null) return `${selector} is not on the page`;
                const shortfall = box.scrollHeight - box.clientHeight;
                return shortfall === 0 ? null : `${selector} is ${String(shortfall)}px shorter than its own content`;
              })
              .filter((entry): entry is string => entry !== null),
          );

          expect(chain, `boxes in the Intake panel shorter than their own content at ${width}x${height}`).toEqual([]);
          expect(probe.panelOverflow).toBe(0);
          expect(probe.bodyOverflow).toBe(0);
          // Drawn, not merely unclipped: a warning scrolled out of a panel a
          // player never scrolls is a warning nobody reads.
          expect(probe.noPlaceBox, `the warning has no box at ${width}x${height}`).not.toBeNull();
          expect(
            probe.noPlaceBox!.bottom,
            `the warning is below the fold of its own panel at ${width}x${height}`,
          ).toBeLessThanOrEqual(probe.panelBox!.bottom);
          expect(probe.noPlaceBox!.y, `the warning is above the top of the viewport at ${width}x${height}`)
            .toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  test.describe('build panel (issue #74)', () => {
    test('is reachable from the Build tab and hidden from every other one', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).visible).toBe(false);

      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());

      expect(probe.visible).toBe(true);
      expect(probe.options).toEqual(['wall-brick', 'door-wooden']);
      expect(probe.selected).toBe('wall-brick');
      expect(probe.submitDisabled).toBe(false);
      // ADR 0011: an unresolved key renders as itself. Nothing on this panel
      // may be a raw `hud.*` identifier.
      expect(probe.texts.filter((text) => text.startsWith('hud.'))).toEqual([]);
      // Since issue #901 the row's own label carries its price -- this
      // fixture's `wall-brick` is a per-segment row (`placesObject: false`),
      // priced at 40 minor units × 2 bricks (`BUILD_MODEL` in
      // `tests/browser/ui-harness.ts`), so "Brick wall" alone is no longer
      // this row's whole text and would falsely pass if it still were.
      expect(probe.texts).toContain('Brick wall · 80 per segment');

      await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).visible).toBe(false);
    });

    test('leads with the map, and folds the numeric route away as the fallback', async ({ page }) => {
      // Pointing is the interaction. The numeric fields still exist, because a
      // pointer-only build tool locks out anyone on a keyboard -- but they are
      // not what the panel offers first, and they do not compete for the eye.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());

      // `armLabel` and `targetText` are `textContent` reads, and
      // `coordinatesCollapsed` is a `data-` attribute: all three answer the
      // same on a panel the Build tab never showed. The probe already
      // measures the panel's own layout, so the pairing is one field.
      expect(probe.visible).toBe(true);
      expect(probe.armLabel).toBe('Place on map');
      expect(probe.armIsPrimary).toBe(true);
      expect(probe.armed).toBe(false);
      expect(probe.coordinatesCollapsed).toBe(true);
      expect(probe.targetText).toBe('Point at the world');
    });

    test('arming the map is a toggle that reports itself, and is reversible', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

      await page.evaluate(() => window.lockstateUiHarness.clickArmBuild());
      const armedProbe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(armedProbe.armed).toBe(true);
      expect(armedProbe.armLabel).toBe('Stop placing');
      // A toggle "that reports itself" reports to the player, so the label
      // read above has to be on screen and not merely in the DOM.
      expect(armedProbe.visible).toBe(true);

      await page.evaluate(() => window.lockstateUiHarness.clickArmBuild());
      const disarmedProbe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(disarmedProbe.armed).toBe(false);

      // `removing: false` on both, because the intent describes one armed tool
      // and the mode travels with the arming (ADR 0028 phase 3): a host that
      // could see the two disagree would draw a removal ghost for a placing
      // gesture. Asserted rather than loosened, so a field that started
      // defaulting to `true` somewhere would fail here.
      expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toEqual([
        JSON.stringify({ kind: 'select-tab', tab: 'build' }),
        JSON.stringify({ kind: 'arm-build-tool', armed: true, definitionId: 'wall-brick', removing: false }),
        JSON.stringify({ kind: 'arm-build-tool', armed: false, definitionId: 'wall-brick', removing: false }),
      ]);
    });

    /**
     * ADR 0028 phase 3: **the removal mode, which is the only route a touch
     * player has to a misplaced object.**
     *
     * `Undo` is bound to `KeyZ` and nothing else, so before this control existed
     * a placed object was permanent for the session on a phone -- a tile a
     * standing object covers refuses every further placement, and the Build panel
     * offers no per-order control. `AGENTS.md` boundary 10 is not satisfied by
     * "it works with a keyboard".
     *
     * These are in a real browser because two of the three things worth
     * measuring only exist in one: whether the browser gave the third button in
     * `.hud-build__actions` a box, and whether it fits. ADR 0022 measured a third
     * button in that exact row **overflowing by 37.9px**, which is why it is
     * measured here rather than reasoned about.
     */
    test('offers a removal toggle beside the arm button, and reports the mode', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

      const arrival = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      // Laid out, not merely present: a control inside a box the browser gave no
      // area is reachable by a keyboard and invisible to a player.
      expect(arrival.removeLaidOut).toBe(true);
      expect(arrival.removeLabel).toBe('Remove');
      expect(arrival.removing).toBe(false);
      // ADR 0011: an unresolved key renders as itself, so a raw `hud.` prefix
      // anywhere on this panel is a missing catalogue entry.
      expect(arrival.texts.filter((text) => text.startsWith('hud.'))).toEqual([]);

      await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());
      const removing = await page.evaluate(() => window.lockstateUiHarness.buildProbe());

      expect(removing.removing).toBe(true);
      expect(removing.removeLabel).toBe('Stop removing');
      // Arming to remove *is* arming, so the world keeps the pointer -- but the
      // arm button is not the control that is on, and its label must not claim
      // to be. That split is `.hud-rooms__arm`'s against `.hud-rooms__remove`.
      expect(removing.armed).toBe(false);
      expect(removing.armLabel).toBe('Place on map');
      // The note says what the armed gesture does, and it changed.
      expect(removing.hint).toContain('take it away');
      // The buy disclosure goes: a removal buys nothing, and hiding it is also
      // what gives the row its width back while the mode is on.
      expect(removing.buyToggleVisible).toBe(false);
      // The numeric route -- removal's keyboard half -- follows the mode too.
      await page.evaluate(() => window.lockstateUiHarness.expandBuildCoordinates());
      expect(await page.evaluate(() => window.lockstateUiHarness.buildProbe())).toMatchObject({
        submitDisabled: false,
        // A removal has no edge, for the reason it has no buildable.
        edgeChooserVisible: false,
      });

      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      expect(intents).toContain(
        JSON.stringify({ kind: 'arm-build-tool', armed: true, definitionId: 'wall-brick', removing: true }),
      );
    });

    test('dispatches a removal from the numeric route, which is its keyboard half', async ({ page }) => {
      // The world press is the gesture this exists for and it needs a canvas;
      // `app-shell.spec.ts` drives that one. What this measures is the route a
      // player with no pointer at all takes: reach the toggle, press it, open
      // the coordinates, press the one submit button.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());
      await page.evaluate(() => window.lockstateUiHarness.expandBuildCoordinates());
      await page.evaluate(() => window.lockstateUiHarness.stepBuildCoordinate('x', 'up'));
      await page.evaluate(() => window.lockstateUiHarness.clickPlaceOrder());

      // Origin is (16, 16) and X was stepped once. A `remove-object` intent and
      // not a `place-object` one, and it carries no buildable id -- a removal
      // names no object type.
      expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toContain(
        JSON.stringify({ kind: 'remove-object', x: 17, y: 16 }),
      );
    });

    /**
     * **This test was called *"turning the removal mode off puts the pointer
     * back to placing"* until #689, and asserted exactly that.** The reasoning
     * it carried is kept here because every word of it was true of the code it
     * described: *"Still armed, now to place -- `armed = removing || armed` in
     * both this panel and the Rooms panel, and it is the precedent rather than
     * an accident. Turning the mode off is a statement about what the pointer
     * does, not about whether the player still has it: the world keeps the
     * pointer and the arm button says so. Which is why the label is asserted
     * right beside it. A pointer that silently changed from removing to placing
     * would be a real hazard -- one tap spends materials -- so what makes this
     * safe is that the control reads "Stop placing" and announces itself
     * pressed."*
     *
     * What that defence answers is the *hazard*, and it answers it: the label
     * really did change and the state was never hidden. What it does not answer
     * is why pressing a control labelled **"Stop removing"** should hand the
     * player a different tool at all. The old rule made the outcome of one
     * control depend on invisible history -- press it after arming into removal
     * and the tool that came back had never been asked for -- and there is no
     * recorded "previous mode" to justify it either: entering removal
     * overwrites `armed`, so the panel cannot tell the two histories apart.
     * `toggleRemovalMode` carries the full argument.
     *
     * The second half of the test is unchanged and is now the load-bearing
     * half: the one-press route from removing back to placing still exists, and
     * it is the **arm** control, which is the one that says "Place on map".
     */
    test('turning the removal mode off stands the tool down, and the arm control is the way back to placing (#689)', async ({
      page,
    }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());
      await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());

      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(probe.removing).toBe(false);
      // Nothing armed, and the panel says so where the player is looking.
      expect(probe.armed, 'the tool that says it stopped is still holding the pointer').toBe(false);
      expect(probe.armLabel).toBe('Place on map');
      expect(probe.removeLabel).toBe('Remove');
      expect(probe.buyToggleVisible).toBe(true);
      expect(probe.hint).toContain('Click a tile edge');

      /*
       * And the world tool is told, which the DOM above cannot show.
       * `arm-build-tool` is what reaches `BuildTool.setArmed` and
       * `ObjectTool.setArmed` in the assembled application, so a panel that
       * repainted its buttons and sent nothing would leave the pointer captured
       * by a tool the interface says is off -- the shape #684 pinned one press
       * over.
       */
      const armIntents = async (): Promise<readonly string[]> => {
        const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
        return intents.filter((intent) => intent.includes('"arm-build-tool"'));
      };
      expect(await armIntents(), 'the stand-down never reached the world tool').toEqual([
        JSON.stringify({ kind: 'arm-build-tool', armed: true, definitionId: 'wall-brick', removing: true }),
        JSON.stringify({ kind: 'arm-build-tool', armed: false, definitionId: 'wall-brick', removing: false }),
      ]);

      // And pressing the arm button while the mode is on is the other way out,
      // reaching a placing tool in one press rather than two. This is what
      // makes the stand-down above cost a player nothing they cannot reach: the
      // control that says "Place on map" is the one that places.
      await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());
      await page.evaluate(() => window.lockstateUiHarness.clickArmBuild());
      const armed = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(armed.removing).toBe(false);
      expect(armed.armed).toBe(true);
      expect(armed.armLabel).toBe('Stop placing');
    });

    /**
     * Arming *into* removal still costs one press, which is the invariant the
     * fix above had to leave standing.
     *
     * On a touch device this is the whole gesture -- press one control, then
     * press tiles -- and there is no keyboard chord behind it to fall back on.
     * A stand-down rule applied to *every* press of this toggle rather than
     * only to the way out would satisfy every assertion in the test above and
     * break this one, which is why it is a separate test rather than a line in
     * that one.
     */
    test('arming into removal still costs one press (#689)', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());

      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(probe.removing, 'one press did not turn removal on').toBe(true);
      expect(probe.removeLabel).toBe('Stop removing');
      expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toContain(
        JSON.stringify({ kind: 'arm-build-tool', armed: true, definitionId: 'wall-brick', removing: true }),
      );
    });

    /**
     * The tint, and why it is measured rather than taken from the stylesheet.
     *
     * `data-removing` was written by both panels' removal controls from the day
     * the mode shipped and read by no stylesheet in `src/`, so removal mode had
     * a label change and no colour -- the same gap #684 closed one attribute
     * earlier for `data-armed`. Only a browser can say whether a declaration
     * reached an element, which is the whole reason this assertion is here and
     * not in a unit test.
     *
     * Read as a *difference* against the same control before the press rather
     * than against a literal colour: the palette is tokens, a theme may move
     * them, and what this test is about is that the armed look reaches this
     * control at all.
     */
    test('the removal control carries the armed tint while the mode is on (#689)', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

      const paintOf = async (selector: string): Promise<{ background: string; border: string }> =>
        page.evaluate((target) => {
          const node = document.querySelector<HTMLElement>(target);
          if (node === null) return { background: '', border: '' };
          const style = getComputedStyle(node);
          return { background: style.backgroundColor, border: style.borderTopColor };
        }, selector);

      /*
       * Each control is compared against *its own* resting paint, never against
       * the other's: the arm button is `tone: 'primary'` and the removal button
       * is not, so the two do not start from the same colour and an assertion
       * that crossed them would be measuring the tone rather than the state.
       */
      const armIdle = await paintOf('.hud-build__arm');
      const removeIdle = await paintOf('.hud-build__remove');

      // The armed look is measured off the control that has always had it,
      // rather than a colour being written into this file -- which would pass
      // against a stylesheet that had lost the rule and gained a literal.
      await page.evaluate(() => window.lockstateUiHarness.clickArmBuild());
      const armedPaint = await paintOf('.hud-build__arm');
      expect(armedPaint.background, 'the arm control has no armed tint to reuse').not.toBe(armIdle.background);

      await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());
      const removing = await paintOf('.hud-build__remove');
      expect(removing.background, 'removal mode changed the label and nothing else').not.toBe(removeIdle.background);
      expect(removing.background, 'removal invented a second armed look').toBe(armedPaint.background);
      expect(removing.border).toBe(armedPaint.border);

      // Exactly one control in the row wears it: while removal is on the arm
      // control paints `data-armed="false"`, so the tint marks where the
      // pointer actually went instead of lighting the whole row.
      expect((await paintOf('.hud-build__arm')).background, 'two controls claim the pointer at once').toBe(
        armIdle.background,
      );

      // And it goes when the mode does.
      await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());
      expect((await paintOf('.hud-build__remove')).background).toBe(removeIdle.background);
    });

    test('leaving the Build tab turns the removal mode off with the arming', async ({ page }) => {
      // A latched removal mode behind a hidden panel is worse than a latched
      // placement one: coming back to the tab would hand the player a pointer
      // that deletes things they cannot see having armed.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).removing).toBe(true);

      await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
      expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toContain(
        JSON.stringify({ kind: 'arm-build-tool', armed: false, definitionId: 'wall-brick', removing: false }),
      );

      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).removing).toBe(false);
    });

    test('fits three buttons in the actions row at every viewport, including 375px', async ({ page }) => {
      /*
       * The measurement ADR 0022 took when it rejected a third control here,
       * taken again on the row that now has one.
       *
       * It rejected it on two grounds and only one of them was height: the row
       * is `--tap-target` tall whether it holds one button or three, which is
       * the argument #89's buy disclosure already made for joining it, so the
       * always-visible budget is untouched. What it also measured was a third
       * button **overflowing horizontally by 37.9px**, and what fixes that is
       * `min-width: 0` on the growable arm button plus a one-word label on this
       * one -- both properties only a browser can confirm.
       *
       * 375x812 is the one that matters and it is not the only one asserted: a
       * row that fit on a phone and overflowed at 900x600 would be a stranger
       * defect, not a smaller one.
       */
      for (const [width, height] of CATALOGUE_VIEWPORTS) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

        const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
        // The page rendered before anything here is trusted: a probe taken
        // against a panel with no box would report 0px of overflow and mean
        // nothing.
        expect(probe.visible, `the Build panel is not laid out at ${width}x${height}`).toBe(true);
        expect(probe.removeLaidOut, `the removal toggle has no box at ${width}x${height}`).toBe(true);
        expect(probe.armLabel, `the arm button lost its label at ${width}x${height}`).toBe('Place on map');
        expect(probe.actionsOverflowPx, `the actions row overflows at ${width}x${height}`).toBeLessThanOrEqual(0);
        expect(
          await page.evaluate(() => window.lockstateUiHarness.laidOut('.hud-build__arm')),
          `the arm button has no box at ${width}x${height}`,
        ).toBe(true);

        // And with the mode on, where the buy toggle leaves the row.
        await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());
        const removing = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
        expect(removing.removeLaidOut, `no box while removing at ${width}x${height}`).toBe(true);
        expect(
          removing.actionsOverflowPx,
          `the actions row overflows while removing at ${width}x${height}`,
        ).toBeLessThanOrEqual(0);
      }
    });

    test('leaving the Build tab hands the pointer back to the camera', async ({ page }) => {
      // A tool left armed behind a hidden panel would swallow every click on a
      // world the player thought they were only looking at.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickArmBuild());
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).armed).toBe(true);

      await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      // The disarm rides out with the tab change itself, so the host never
      // sees a window where the panel is hidden and the pointer is still ours.
      expect(intents).toContain(
        JSON.stringify({ kind: 'arm-build-tool', armed: false, definitionId: 'wall-brick', removing: false }),
      );
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).armed).toBe(false);
    });

    test('the numeric fallback still works, and is reachable by keyboard alone', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.expandBuildCoordinates());
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).coordinatesCollapsed).toBe(false);

      // Origin is (16, 16); two steps up on X and one down on Y.
      await page.evaluate(() => window.lockstateUiHarness.stepBuildCoordinate('x', 'up'));
      await page.evaluate(() => window.lockstateUiHarness.stepBuildCoordinate('x', 'up'));
      await page.evaluate(() => window.lockstateUiHarness.stepBuildCoordinate('y', 'down'));
      await page.evaluate(() => window.lockstateUiHarness.clickBuildEdge('west'));

      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      // `input.value` is the `toHaveValue` case: it reads back whatever the
      // steppers wrote whether or not the field was ever laid out, so the
      // "reachable by keyboard alone" claim needs the panel on screen too.
      expect(probe.visible).toBe(true);
      expect(probe.tileX).toBe('18');
      expect(probe.tileY).toBe('15');
      expect(probe.edge).toBe('west');

      await page.evaluate(() => window.lockstateUiHarness.clickPlaceOrder());
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());

      // A run of one: the numeric route names exactly one edge, and says so
      // in the same shape a drag does (issue #225).
      expect(intents.filter((intent) => intent.includes('place-build-order'))).toEqual([
        JSON.stringify({
          kind: 'place-build-order',
          definitionId: 'wall-brick',
          edges: [{ x: 18, y: 15, edge: 'west' }],
        }),
      ]);

      // Every control in the fallback is a real focusable element, so the
      // route it exists for actually works.
      const focusable = await page.evaluate(() =>
        [...document.querySelectorAll('.hud-build button, .hud-build input')].filter(
          (node) => (node as HTMLElement).tabIndex >= 0,
        ).length,
      );
      expect(focusable).toBeGreaterThanOrEqual(8);
    });

    /**
     * Issue #341: **the label a player reads, not the id underneath it.**
     *
     * #339 closed the mapping layer -- `buildEdgeChoiceOptions` and
     * `formatBuildTargetText` are now asserted headlessly against literal
     * text. What it could not reach from its two-file surface is the step
     * after: whether the panel puts the mapped label on screen next to the
     * right control.
     *
     * That step was completely unasserted, and measurably so. #339 applied
     *
     * ```ts
     * function edgeLabelKey(edge: HudBuildEdge): LocalizationKey {
     *   void deriveSimulationMessageKey('build-edge', edge);
     *   return 'build-edge.north.name';
     * }
     * ```
     *
     * to unmodified `main` and ran the whole repository suite: 204 files,
     * 2,321 tests, all green, with every edge on screen reading "North".
     * `buildProbe().edge` cannot see it -- it reads `data-choice`, and a
     * label defect leaves the id correct -- and `targetText` was asserted
     * only for the empty state, where no edge has been named yet.
     *
     * Vitest cannot close it either: `vitest.config.ts` runs `environment:
     * 'node'` with no DOM library anywhere in the dependency tree, so
     * `createBuildPanel` throws outside a browser. `docs/TESTING.md` puts
     * rendered-output claims about `src/ui/hud/**` here, and this is one.
     *
     * Two claims, and #220's lesson applies to both: `toContainText` does not
     * imply visibility, so every label read here is paired with the box the
     * browser gave it and with `offsetParent`. Geometry is only worth reading
     * once the page is known to have rendered -- a page that failed to load
     * reports plausible numbers that mean nothing -- so the viewport, the
     * active tab and the panel's own rectangle are checked first.
     */
    test('draws a distinct visible label per edge, and names the aimed edge in the readout', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      // The chooser lives in the folded fallback section, whose body carries
      // `hidden`. Opening it is what makes a visibility claim about the
      // options meaningful rather than vacuously false.
      await page.evaluate(() => window.lockstateUiHarness.expandBuildCoordinates());

      /*
       * **The page rendered.** Three independent facts, none of them the thing
       * under test: the harness answered at all (a failed load leaves
       * `window.lockstateUiHarness` undefined and `page.evaluate` throws), the
       * HUD is painting the tab that was clicked, and the browser gave the
       * Build panel a non-degenerate rectangle. Only after that is any box
       * below worth believing.
       */
      const layout = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());
      expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).activeTab).toBe('build');
      expect(layout.viewport[0]).toBeGreaterThan(0);
      expect(layout.viewport[1]).toBeGreaterThan(0);
      expect(layout.panel).not.toBeNull();
      expect(layout.panel?.width ?? 0).toBeGreaterThan(0);
      expect(layout.panel?.height ?? 0).toBeGreaterThan(0);

      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(probe.visible).toBe(true);
      expect(probe.edgeChooserVisible).toBe(true);

      // The ids, which is all the panel's `data-` attributes can say, and all
      // any existing assertion in this file reads.
      expect(probe.edgeLabels.map((option) => option.id)).toEqual(['north', 'west']);
      // The text, which is what a player receives. Literal, against
      // `src/content/simulation-message-keys.ts`' `build-edge` labels: a
      // spec that recomputed the expectation from the same helper the panel
      // calls would agree with any mapping, right or wrong.
      expect(probe.edgeLabels.map((option) => option.label)).toEqual(['North', 'West']);
      // The property the mutation violates, stated on its own so a third edge
      // added later is covered without being enumerated: two ids never share
      // one label.
      expect(new Set(probe.edgeLabels.map((option) => option.label)).size).toBe(probe.edgeLabels.length);
      // ADR 0011: an unresolved key renders as itself, so a raw namespace
      // prefix here is a missing catalog entry rather than a label.
      expect(probe.edgeLabels.filter((option) => option.label.startsWith('build-edge.'))).toEqual([]);
      expect(probe.edgeLabels.filter((option) => option.label.length === 0)).toEqual([]);

      // Visible, not merely present (#220). `offsetParent` is the browser's
      // own answer, and the box says the text was given room to be read.
      for (const option of probe.edgeLabels) {
        expect(option.laidOut).toBe(true);
        expect(option.widthPx).toBeGreaterThan(0);
        expect(option.heightPx).toBeGreaterThan(0);
      }

      /*
       * **The readout**, which is the second place an edge becomes a label and
       * the one where the wrong edge is invisible: the option row shows both
       * labels side by side, while the readout shows one string that looks
       * plausible whatever edge produced it.
       *
       * Aimed rather than merely chosen, because the two are separate routes.
       * Choosing west in the chooser decides what `clickPlaceOrder` will send
       * -- which the numeric fallback test above asserts -- while the readout
       * reports what the *world* is aimed at, which `main.ts` drives through
       * `HudHandle.setBuildTarget`. Both are driven here: `edge` below is what
       * the chooser did, `targetText` what the aim did.
       */
      await page.evaluate(() => window.lockstateUiHarness.clickBuildEdge('west'));
      const aim = await page.evaluate(() =>
        window.lockstateUiHarness.aimBuildTarget({ x: 18, y: 15, edge: 'west', segments: 1 }),
      );
      // `false` means no HUD was mounted, so an assertion below could only be
      // reading the panel's opening state.
      expect(aim).toBe(true);

      const aimed = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(aimed.edge).toBe('west');
      // The id side, so a readout that is right by accident while the aim was
      // wrong cannot pass: `hud.build.target-value` is `{x}, {y} · {edge}`.
      expect(aimed.targetReadout).toBe('18,15,west,1');
      expect(aimed.targetText).toBe('18, 15 · West');
      // And the west label specifically, sourced from the row rather than
      // written twice -- with the north label excluded, which is the exact
      // string the mutation substitutes.
      const label = (id: string): string => probe.edgeLabels.find((option) => option.id === id)?.label ?? '';
      expect(aimed.targetText).toContain(label('west'));
      expect(aimed.targetText).not.toContain(label('north'));
      // On screen, for the same reason the options are measured: `targetText`
      // is a `textContent` read and answers identically on a readout the
      // browser never painted.
      expect(aimed.targetLaidOut).toBe(true);
      expect(aimed.targetBox).not.toBeNull();
      expect(aimed.targetBox?.width ?? 0).toBeGreaterThan(0);
      expect(aimed.targetBox?.height ?? 0).toBeGreaterThan(0);

      // Clearing the aim is the state the panel opens in, and it names no edge
      // at all -- so the readout above was the aim's doing.
      expect(await page.evaluate(() => window.lockstateUiHarness.aimBuildTarget(null))).toBe(true);
      const cleared = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(cleared.targetReadout).toBeNull();
      expect(cleared.targetText).toBe('Point at the world');
    });

    /**
     * Issue #89: the panel is where the treasury is spent, and the control
     * that spends it costs the panel no height until it is opened.
     *
     * Three claims, and none of them is provable a layer down: `hidden` is a
     * DOM attribute an author `display` can defeat, so whether the row is
     * *laid out* needs a browser; the button's label is a formatted product of
     * two numbers the panel was handed; and the intent that leaves is what the
     * composition root turns into a `PurchaseMaterials` command.
     */
    test('offers a closed buy disclosure, and reveals a stepper priced from the view model', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

      const closed = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      // Offered, and closed. The first half is what makes the second half
      // meaningful: a row that is absent for the wrong reason also reads as
      // "not laid out".
      expect(closed.buyToggleVisible).toBe(true);
      expect(closed.buyOpen).toBe(false);
      expect(closed.buyRowVisible).toBe(false);
      // And the arm button is still the panel's only primary: two primaries
      // is no primary (`src/ui/primitives/action-button.ts`).
      expect(closed.armIsPrimary).toBe(true);

      expect(await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle())).toBe(true);
      const open = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(open.buyOpen).toBe(true);
      expect(open.buyRowVisible).toBe(true);
      // Two bricks per wall, at 40 each: the quantity starts at one
      // placement's worth and the button states what pressing it will spend.
      // Every one of those three numbers came in on the view model.
      expect(open.buyQuantity).toBe('2');
      expect(open.buyLabel).toBe('Buy 2 × Brick · 80');
      expect(open.texts.filter((text) => text.startsWith('hud.'))).toEqual([]);

      // The stepper is a stepper: the total follows it.
      expect(await page.evaluate(() => window.lockstateUiHarness.stepBuyQuantity('up'))).toBe(true);
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).buyLabel).toBe('Buy 3 × Brick · 120');
      expect(await page.evaluate(() => window.lockstateUiHarness.stepBuyQuantity('down'))).toBe(true);
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).buyLabel).toBe('Buy 2 × Brick · 80');
    });

    test('the buy control follows the selection, in material, price and quantity', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());

      await page.evaluate(() => window.lockstateUiHarness.stepBuyQuantity('up'));
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).buyLabel).toBe('Buy 3 × Brick · 120');

      // A door is made of planks at 65, one per placement. The quantity does
      // not carry over: 3 bricks becoming 3 planks would be a purchase the
      // player never asked for, at a price they never saw.
      await page.evaluate(() => window.lockstateUiHarness.clickBuildable('door-wooden'));
      const door = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(door.selected).toBe('door-wooden');
      expect(door.buyQuantity).toBe('1');
      expect(door.buyLabel).toBe('Buy 1 × Wood Plank · 65');
    });

    test('a typed quantity is clamped to what one purchase may ask for', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());

      // Zero and below are not purchases, and the ceiling is the simulation's
      // own `MAX_PURCHASE_QUANTITY` -- passed in on the view model, because a
      // panel that composed a command past the schema's bound would have it
      // rejected at the decoder with nothing to show the player.
      expect(await page.evaluate(() => window.lockstateUiHarness.typeBuyQuantity('0'))).toBe(true);
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).buyQuantity).toBe('1');

      expect(await page.evaluate(() => window.lockstateUiHarness.typeBuyQuantity('999999'))).toBe(true);
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).buyQuantity).toBe('100000');
    });

    test('buying dispatches one gated intent, and a refusal is reported on the button', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());
      expect(await page.evaluate(() => window.lockstateUiHarness.clickBuy())).toBe(true);

      // Ids and numbers only. The HUD does not know a `PurchaseMaterials`
      // command exists, and it does not mint the order id one needs -- that is
      // `src/main.ts`'s, and `app-shell.spec.ts` is where it is observed on
      // the wire.
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      expect(intents.filter((intent) => intent.includes('purchase-materials'))).toEqual([
        JSON.stringify({ kind: 'purchase-materials', itemId: 'item.brick', quantity: 2 }),
      ]);

      // A refused purchase reaches the player, on the line #207 built and on
      // the control that was pressed -- because buying is a command, and a
      // button that reports success and spends nothing is the failure #82 is
      // about.
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
      await page.evaluate(() => window.lockstateUiHarness.clickBuy());
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible), {
          message: 'a refused purchase said nothing on screen',
        })
        .toBe(true);
      const probe = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(probe.action).toBe('purchase-materials');
      expect(probe.text).toContain('Nothing was bought');
      // The thrown `Error` is diagnostic English and never reaches the screen
      // (ADR 0011).
      expect(probe.text).not.toContain('ui-harness: the host refused');
      expect(probe.failedControls).toEqual(['Buy 2 × Brick · 80']);

      expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
    });

    test('offers no purchase at all for a buildable nothing sells', async ({ page }) => {
      // The harness's invented `buildable-N` entries carry no material,
      // because no content module defines them and no price exists for them.
      // A disabled buy button would still claim the purchase exists; the
      // control is absent instead, which is the rule the edge chooser follows
      // in the test below.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell({ buildables: 4 }));
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).buyToggleVisible).toBe(true);

      await page.evaluate(() => window.lockstateUiHarness.clickBuildable('buildable-2'));
      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(probe.selected).toBe('buildable-2');
      expect(probe.buyToggleVisible).toBe(false);
      expect(probe.buyRowVisible).toBe(false);
    });

    test('an open buy row closes itself when the selection stops being purchasable', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell({ buildables: 4 }));
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).buyRowVisible).toBe(true);

      // Leaving the row open behind a hidden toggle would put a buy button on
      // screen with no material behind it -- and its label would still name
      // the last one, which is a price quoted for something else.
      await page.evaluate(() => window.lockstateUiHarness.clickBuildable('buildable-3'));
      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(probe.buyToggleVisible).toBe(false);
      expect(probe.buyRowVisible).toBe(false);
      expect(probe.buyOpen).toBe(false);
    });

    test('hides the edge chooser for a buildable that does not sit on an edge', async ({ page }) => {
      // Four rows, because the non-edge row this needs is a synthetic one now.
      // It used to be `door-wooden` out of the two-row fixture, with the note
      // *"a door is an object, not edge geometry"* -- which was a statement of
      // issue #531's defect rather than a fact about doors. A door is edge
      // geometry, `src/main.ts` says so since that issue, and the test below
      // asserts it. `buildModelWithCatalogueOf` alternates `occupiesEdge`, so
      // `buildable-3` is a row that genuinely sits on no edge.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell({ buildables: 4 }));
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      // The chooser lives in the numeric fallback: the map route reads the
      // edge off the gesture instead of asking for it twice.
      await page.evaluate(() => window.lockstateUiHarness.expandBuildCoordinates());
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).edgeChooserVisible).toBe(true);

      // A disabled chooser would still claim the setting exists; it is hidden
      // instead.
      await page.evaluate(() => window.lockstateUiHarness.clickBuildable('buildable-3'));
      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(probe.selected).toBe('buildable-3');
      expect(probe.edgeChooserVisible).toBe(false);
    });

    /**
     * Issue #531, in the surface the player actually touches.
     *
     * A door occupies a tile edge -- `occupiesTileEdge` in
     * `src/simulation/construction/definition.ts` -- and the coordinate form
     * used to hide the chooser for one while submitting its retained value
     * anyway, so a door typed into the two number fields landed on whichever
     * edge the last wall had used. `tests/foundation/composition-root-contract.test.ts`
     * pins the projection that decides this and `tests/unit/ui-hud-build-panel.test.ts`
     * pins the panel's two rules; neither can see a control's box, which is
     * what this measures.
     */
    test('shows the edge chooser for a door, which is edge geometry (#531)', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.expandBuildCoordinates());

      await page.evaluate(() => window.lockstateUiHarness.clickBuildable('door-wooden'));
      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(probe.selected).toBe('door-wooden');
      expect(probe.edgeChooserVisible).toBe(true);
    });

    /**
     * Issue #143: the catalogue is the region that scrolls, so the panel's
     * last section stays on screen however long the catalogue gets.
     *
     * The whole panel used to be the scroll container, which made its height
     * budget a function of how many things exist to build. Reproduced here at
     * 1280x720 with a twelve-entry catalogue: the panel had 579px of box for
     * 838px of content and the "Enter coordinates" header sat at y=845..889,
     * 207px below the panel's own fold at y=638.
     *
     * **Position, not style.** A `overflow-y: auto` assertion would have
     * passed before this fix as well -- the panel had it. The defect was where
     * the header *was*, so that is what is measured: its rectangle against the
     * panel's client box, with the panel unscrolled.
     *
     * Twelve entries, and the reason has changed since this was written.
     * `BUILDABLE_REGISTRY` used to hold four rows -- a wall, a door and ADR 0028
     * phases 1 and 2's two object rows -- and four cannot overflow the panel
     * here, so a synthetic list was the only way to reach the condition. Phase
     * 4's seventeen more rows take the real catalogue to twenty-one, which
     * overflows it comfortably. Twelve is kept because it is the *varied* row
     * count: the panel takes its catalogue as view-model data, so handing it a
     * chosen length measures the property at a length nobody has to keep true,
     * and twelve is well past the seven that first overflow the panel here.
     */
    const CATALOGUE_VIEWPORTS = [
      [1280, 720],
      [1440, 900],
      [1024, 768],
      [900, 600],
      [375, 812],
    ] as const;

    test('keeps the last section on screen however long the catalogue gets (#143)', async ({ page }) => {
      for (const [width, height] of CATALOGUE_VIEWPORTS) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell({ buildables: 12 }));
        await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

        const probe = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());
        expect(probe.rows, `catalogue rows at ${width}x${height}`).toBe(12);
        // Already paired: `lastSectionHeader` is `null` for a zero-area box,
        // so the `not.toBeNull()` two lines down is the visibility half of
        // this text assertion and no `laidOut` call is needed.
        expect(probe.lastSectionHeaderText, `the panel's last section at ${width}x${height}`).toBe(
          'Enter coordinates',
        );
        const header = probe.lastSectionHeader;
        expect(header, `the last section header has no box at ${width}x${height}`).not.toBeNull();
        if (header === null) continue;

        // Nothing has scrolled anything: this is the state the panel arrives in.
        expect(probe.panelScrollTop, `the Build panel is pre-scrolled at ${width}x${height}`).toBe(0);
        expect(
          header.bottom,
          `the "Enter coordinates" header is below the Build panel's fold at ${width}x${height}: it ends at y=${header.bottom} in a panel clipped at y=${probe.panelVisibleBottom}`,
        ).toBeLessThanOrEqual(probe.panelVisibleBottom);
        expect(header.bottom, `the last section header is off the bottom of the viewport at ${width}x${height}`)
          .toBeLessThanOrEqual(height);

        // And the excess went to the catalogue, which is the mechanism the
        // section header staying put depends on.
        expect(probe.listOverflow, `the catalogue list absorbed nothing at ${width}x${height}`).toBeGreaterThan(0);
        expect(probe.listOverflowY, `the catalogue list is not scrollable at ${width}x${height}`).toBe('auto');
      }
    });

    test('leaves the shipped two-entry catalogue exactly as it was (#143)', async ({ page }) => {
      // The fix must be invisible at today's catalogue size. Two rows fit
      // inside the list's own floor, so nothing scrolls anywhere.
      //
      // Every viewport, not just 1280x720. This test used to pin itself to
      // that one desktop size -- the one where the panel fits most easily --
      // which made `CATALOGUE_VIEWPORTS` above read as coverage of the shipped
      // catalogue that it did not provide, since the twelve-entry test next to
      // it can never be pointed at two entries (its `listOverflow > 0` cannot
      // hold there). Hardening rather than a substitute: the harness leaves
      // `hud.asideSlot` empty, so `.hud__aside:empty { display: none }` fires
      // and the Build panel gets the whole rail. Rail contention is a thing
      // only the assembled page has, and `app-shell.spec.ts` is where issue
      // #174 is measured.
      for (const [width, height] of CATALOGUE_VIEWPORTS) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

        const probe = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());
        expect(probe.rows, `catalogue rows at ${width}x${height}`).toBe(2);
        expect(probe.listOverflow, `the two-entry list scrolls at ${width}x${height}`).toBe(0);
        expect(probe.panelOverflow, `the Build panel scrolls at ${width}x${height}`).toBe(0);
        // `?? 0` used to stand here, which passed when the header had no box at
        // all -- the state a `display: none` panel is in. The box is required
        // first, so the comparison is about a header that exists on screen.
        const header = probe.lastSectionHeader;
        expect(header, `the last section header has no box at ${width}x${height}`).not.toBeNull();
        expect(
          header?.bottom ?? Number.POSITIVE_INFINITY,
          `the last section header is below the fold at ${width}x${height}`,
        ).toBeLessThanOrEqual(probe.panelVisibleBottom);
      }
    });

    test('folds to its header, which its own comment relies on at 375px', async ({ page }) => {
      // `build-panel.ts` says the panel is collapsible because "at 375px it
      // covers most of the world, and the whole interaction is now point at the
      // world -- so folding it to its header while placing is not a nicety".
      // That was not true: `createPanel` collapses by setting `hidden` on the
      // body, and `.hud-build > .ui-panel__body`'s own flex `display` outranks
      // the user agent's `[hidden] { display: none }`, so the control stamped
      // `data-collapsed`, announced `aria-expanded="false"` and left the body
      // exactly where it was. `.ui-panel > .ui-panel__body[hidden]` in
      // `primitives.css` is the fix, and this is the assertion that keeps it.
      //
      // The box, not the attribute: an assertion on `hidden` or on
      // `data-collapsed` agreed with the defect, because both were already
      // correct.
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

      const bodyHeight = async (): Promise<number> =>
        page.evaluate(() => {
          const body = document.querySelector<HTMLElement>('.hud-build > .ui-panel__body');
          if (body === null || body.getClientRects().length === 0) return 0;
          return Math.round(body.getBoundingClientRect().height * 10) / 10;
        });

      expect(await bodyHeight(), 'the Build panel arrives folded').toBeGreaterThan(100);
      const panel = page.locator('.hud-build');
      const toggle = page.locator('.hud-build > .ui-panel__header > .ui-panel__toggle');
      await toggle.click();
      await expect(panel).toHaveAttribute('data-collapsed', 'true');
      expect(await bodyHeight(), 'folding the Build panel left its body laid out').toBe(0);
      // And it is a fold rather than a one-way door.
      await toggle.click();
      await expect(panel).toHaveAttribute('data-collapsed', 'false');
      expect(await bodyHeight(), 'the Build panel did not come back').toBeGreaterThan(100);
    });
  });

  /**
   * The Staff panel on the Security tab
   * ([ADR 0025](../../docs/adr/0025-guard-hiring-surface.md)).
   *
   * Three of the four tabs rendered no panel at all before this: `mountHud`
   * built one panel for the rail slot and showed it on `build` alone, so
   * selecting Security hid the Build panel and put nothing in its place. That
   * is why hiring is here and not a third button on the Build panel's action
   * row, which ADR 0022 measured as overflowing that panel horizontally by
   * 37.9px.
   *
   * A real browser is the lowest layer that can settle any of this: Vitest
   * runs in the `node` environment with no DOM, so a real click on a real
   * button, an `offsetParent` that says what the browser decided rather than
   * what the `hidden` attribute claims, and a rendered label that is text
   * rather than an unresolved key are all only observable here.
   */
  test.describe('staff panel (ADR 0025)', () => {
    test('is reachable from the Security tab and hidden from every other one', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

      // The tab a player arrives on. The panel exists in the DOM from the
      // mount and must not be laid out here.
      expect((await page.evaluate(() => window.lockstateUiHarness.staffProbe())).visible).toBe(false);

      await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
      const probe = await page.evaluate(() => window.lockstateUiHarness.staffProbe());

      expect(probe.visible).toBe(true);
      expect(probe.options).toEqual(['staff-role.guard']);
      expect(probe.selected).toBe('staff-role.guard');
      expect(probe.hireDisabled).toBe(false);
      // The button states the role and what pressing it will spend, from the
      // view model -- the panel holds no wage table of its own.
      expect(probe.hireLabel).toBe('Hire Guard · 80');
      // ADR 0011: an unresolved key renders as itself. Nothing on this panel
      // may be a raw `hud.*` identifier.
      expect(probe.texts.filter((text) => text.startsWith('hud.'))).toEqual([]);
      expect(probe.texts).toContain('Guard');

      // And the two panels share one rail slot: showing this one hides the
      // other, in both directions.
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).visible).toBe(false);
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      expect((await page.evaluate(() => window.lockstateUiHarness.staffProbe())).visible).toBe(false);
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).visible).toBe(true);
    });

    test('hiring dispatches one gated intent, and a refusal is reported on the button', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
      expect(await page.evaluate(() => window.lockstateUiHarness.clickHireStaff())).toBe(true);

      // One stable id and nothing else. The HUD does not know a `HireStaff`
      // command exists, and it does not decide where the new hire stands --
      // that is `src/main.ts`'s, and `app-shell.spec.ts` is where the wire is
      // observed.
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      expect(intents.filter((intent) => intent.includes('hire-staff'))).toEqual([
        JSON.stringify({ kind: 'hire-staff', staffRoleId: 'staff-role.guard' }),
      ]);

      // A refused hire reaches the player, on the line #207 built and on the
      // control that was pressed -- because hiring is a command, and a button
      // that reports success and hires nobody is the failure #82 is about.
      await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
      await page.evaluate(() => window.lockstateUiHarness.clickHireStaff());
      await expect
        .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible), {
          message: 'a refused hire said nothing on screen',
        })
        .toBe(true);
      const probe = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
      expect(probe.action).toBe('hire-staff');
      expect(probe.text).toContain('Nobody was hired');
      // Its own sentence, not the purchase one: the two commands leave the
      // prison in different states, and a player acting on the message needs
      // to know which.
      expect(probe.text).not.toContain('Nothing was bought');
      // The thrown `Error` is diagnostic English and never reaches the screen
      // (ADR 0011).
      expect(probe.text).not.toContain('ui-harness: the host refused');
      expect(probe.failedControls).toEqual(['Hire Guard · 80']);

      expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
    });

    /**
     * The coverage block (ADR 0048 consequence 1), from the one layer that can
     * see it.
     *
     * These four cases exist because the agent that built the block could not
     * run a browser, said so, and added `reportStaffCoverage` and
     * `StaffCoverageProbe` for someone who could. **A harness affordance with
     * no spec behind it is the same defect as a locale key with no code behind
     * it** -- something declared, wired to nothing, and green.
     *
     * The first case is the one that matters most, and it closes a measured
     * survivor: deleting `staffPanel.setCoverage(next.staffCoverage)` from
     * `mountHud` leaves `tsc` clean and the whole vitest suite green, because
     * `vitest.config.ts` runs in `environment: 'node'` with no jsdom and
     * `mountHud` is therefore unreachable from `pnpm test` at all. Its
     * neighbour `setHeldGuards` is a survivor for the same reason -- this is a
     * class, not one slip.
     */
    test.describe('guard coverage (ADR 0048)', () => {
      const COVERAGE_VIEWPORTS = [
        [1440, 900],
        [1280, 720],
        [1024, 768],
        [900, 600],
        [375, 812],
      ] as const;

      test('paints what the host reports, which is the pass-through no headless test can reach', async ({ page }) => {
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));

        await page.evaluate(() =>
          window.lockstateUiHarness.reportStaffCoverage({ required: 2, assigned: 0, shortage: 2 }),
        );
        const unguarded = (await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage;

        // `data-tone` rather than the sentence, so the assertion survives
        // translation; the sentence itself is asserted below.
        expect(unguarded.tone).toBe('danger');
        expect(unguarded.blockLaidOut).toBe(true);

        // And it follows a second report rather than latching on the first,
        // which is what a player hiring a guard experiences.
        await page.evaluate(() =>
          window.lockstateUiHarness.reportStaffCoverage({ required: 2, assigned: 1, shortage: 1 }),
        );
        expect((await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage.tone).toBe('warning');

        await page.evaluate(() =>
          window.lockstateUiHarness.reportStaffCoverage({ required: 2, assigned: 2, shortage: 0 }),
        );
        expect((await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage.tone).toBe('success');
      });

      test('draws nothing at all before the first reply, rather than a green badge', async ({ page }) => {
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));

        // The distinction the probe was built for: "no answer yet" and "the
        // prison is covered" are different states, and a block that read
        // `Covered` before the worker had said anything would be a lie the
        // player cannot tell from the truth.
        const before = (await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage;
        expect(before.blockLaidOut).toBe(false);
        expect(before.tone).toBeNull();

        await page.evaluate(() => window.lockstateUiHarness.reportStaffCoverage(undefined));
        const withdrawn = (await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage;
        expect(withdrawn.blockLaidOut).toBe(false);
      });

      test('says the word beside the colour, so the state does not depend on seeing it', async ({ page }) => {
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
        await page.evaluate(() =>
          window.lockstateUiHarness.reportStaffCoverage({ required: 2, assigned: 0, shortage: 2 }),
        );

        const probe = (await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage;

        expect(probe.badgeText.length, 'the badge carries a colour and no word').toBeGreaterThan(0);
        expect(probe.badgeTone).toBe('danger');
        // The hint tells the player what to do, not what is about to happen:
        // ADR 0048 measured that a shortage does not always precede a riot
        // (twelve prisoners with one guard never riot), so promising one would
        // be false.
        expect(probe.hintText).toContain('2');
        expect(probe.hintText.toLowerCase()).not.toContain('riot');
        // No unresolved key reaches the screen.
        expect(probe.summaryText).not.toContain('hud.');
        expect(probe.badgeText).not.toContain('hud.');
        expect(probe.hintText).not.toContain('hud.');
      });

      test('says what an empty post costs, whole, and only where it costs that', async ({ page }) => {
        /*
         * The owner's chosen wording of 2026-09-03 -- *"No guard is posted
         * here, so nobody in this sector is kept safe."* -- and this is the
         * only layer that can see it: `vitest.config.ts` is
         * `environment: 'node'` with no jsdom, so
         * `tests/unit/ui-simulation-staff-coverage.test.ts` can prove
         * `describeStaffCoverage` returns the key and prove the key resolves,
         * and cannot prove a browser lays the sentence out.
         *
         * Three claims, and the third is the one that needed a browser.
         * That the sentence is on the unguarded rung; that it is on neither
         * other rung, because the two above it do provision safety and the
         * sentence would be false there; and that it is **not clipped** at the
         * viewport where `.hud-staff__note` is clamped to a single line. A
         * clipped state-and-consequence sentence is worse than an absent one:
         * the clause the clamp cuts is the whole of what it adds to the
         * `Unguarded` badge above it.
         */
        for (const [width, height] of COVERAGE_VIEWPORTS) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
          await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));

          await page.evaluate(() =>
            window.lockstateUiHarness.reportStaffCoverage({ required: 2, assigned: 0, shortage: 2 }),
          );
          const unguarded = (await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage;

          expect(unguarded.consequenceText, `no consequence sentence at ${width}x${height}`).toBe(
            'No guard is posted here, so nobody in this sector is kept safe.',
          );
          // `expectNotClipped` rather than a `scrollHeight` of our own (#720):
          // it catches `spilled` as well as `cut`, and this element is a flex
          // item of `.hud-staff__coverage` with `overflow: visible`, so a
          // sentence too tall for its box paints over the block below rather
          // than vanishing. At 900x600 -- the one viewport in this list inside
          // `@media (max-height: 700px)` -- it is also what fails if the
          // one-line clamp exemption is ever dropped.
          await expectNotClipped(
            page,
            '.hud-staff__coverage-consequence',
            `the coverage block's consequence sentence at ${width}x${height}`,
          );
          // It says nothing about an incident, which is the refusal PR #854
          // recorded and the reason this wording exists at all: guard presence
          // amplifies risk and gates nothing.
          expect(unguarded.consequenceText.toLowerCase()).not.toContain('riot');
          expect(unguarded.consequenceText.toLowerCase()).not.toContain('incident');
          expect(unguarded.consequenceText).not.toContain('hud.');

          // The hint is still there and still carries the press that fixes it.
          // The consequence sentence is an addition to the block, never a
          // replacement for the action it prescribes.
          expect(unguarded.hintText, `the hint lost its count at ${width}x${height}`).toContain('2');

          await page.evaluate(() =>
            window.lockstateUiHarness.reportStaffCoverage({ required: 2, assigned: 1, shortage: 1 }),
          );
          expect(
            (await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage.consequenceText,
            `an understaffed prison is told nobody is kept safe at ${width}x${height}`,
          ).toBe('');

          await page.evaluate(() =>
            window.lockstateUiHarness.reportStaffCoverage({ required: 2, assigned: 2, shortage: 0 }),
          );
          expect(
            (await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage.consequenceText,
            `a covered prison is told nobody is kept safe at ${width}x${height}`,
          ).toBe('');
        }
      });

      test('does not push the panel into a scroll at any shipped viewport', async ({ page }) => {
        // The block's author named this as their weakest claim: they argued
        // from another block's 219px at one viewport that a two-line block at
        // the top cannot push the hire control below the fold, and could
        // measure none of it. This is that measurement.
        for (const [width, height] of COVERAGE_VIEWPORTS) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
          await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'));
          await page.evaluate(() =>
            window.lockstateUiHarness.reportStaffCoverage({ required: 2, assigned: 0, shortage: 2 }),
          );

          const probe = await page.evaluate(() => window.lockstateUiHarness.staffProbe());

          expect(probe.coverage.blockLaidOut, `the coverage block has no box at ${width}x${height}`).toBe(true);
          expect(
            probe.coverage.blockBox?.bottom ?? Number.POSITIVE_INFINITY,
            `the coverage block is below the Staff panel's fold at ${width}x${height}`,
          ).toBeLessThanOrEqual(probe.panelVisibleBottom);
          // The hire control is the cure the block prescribes, so it staying
          // reachable is the whole point of putting the block above it.
          expect(probe.hireLabel.length, `the hire control is gone at ${width}x${height}`).toBeGreaterThan(0);
        }
      });
    });
  });


  /**
   * Issue #136: one repaint reuses its formatters instead of rebuilding them.
   *
   * The strip formats every metric, the day, the position in the day and the
   * speed on each repaint, and the worker publishes a clock at most every
   * 250 ms while the simulation runs (`docs/HUD_PROJECTIONS.md`, section 7),
   * so this is the HUD's hot path rather than an interaction.
   *
   * A count, not a duration: `docs/BENCHMARKING.md` keeps elapsed time out of
   * assertions, and how many `Intl.NumberFormat` instances a repaint builds is
   * the defect itself rather than a proxy for it. The number of *calls* is
   * reported for the same reason -- it is the multiplier on the saving, and
   * counting it here beats counting call sites by eye.
   */
  test('a repaint builds no number formatter, however many values it formats (#136)', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    const cost = await page.evaluate(() => window.lockstateUiHarness.measureRepaintFormatterCost());

    // Vacuous otherwise: a repaint that formatted nothing would construct
    // nothing either.
    expect(cost.formatNumberCalls, 'the repaint formatted no numbers at all').toBeGreaterThan(0);
    expect(
      cost.numberFormatConstructions,
      `one repaint formatted ${cost.formatNumberCalls} values and built ${cost.numberFormatConstructions} Intl.NumberFormat instances`,
    ).toBe(0);
  });

  test('the HUD leaks no unhandled rejection while being driven', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'));
    await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));
    await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
  });
});

/*
 * The Rooms panel (ADR 0022, amended).
 *
 * Everything here needs a browser and says why. The panel's *decisions* are
 * headless and live in `tests/unit/ui-room-tool.test.ts` and
 * `tests/unit/rooms-zoning.test.ts`; what only a browser can answer is whether
 * the controls are laid out, whether the confirm pair really replaces the arm
 * pair rather than joining it, and whether the last block in the panel is inside
 * the panel's fold at 900x600 -- which is the measurement the owner's choice of
 * a tab over a Build-panel block rests on.
 */
test.describe('the Rooms panel', () => {
  /**
   * The five viewports the browser suite visits, in the shape the Build panel's
   * catalogue tests use them. Declared here rather than shared, because that
   * list is scoped inside another describe and hoisting it would widen a
   * constant two unrelated suites would then both own.
   */
  const ROOMS_VIEWPORTS = [
    [1280, 720],
    [1440, 900],
    [1024, 768],
    [900, 600],
    [375, 812],
  ] as const;

  // The file's own `beforeEach` has already navigated and waited for the
  // harness; this only mounts and opens the tab.
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.evaluate(() => window.lockstateUiHarness.clickTab('zones'));
  });

  /**
   * Only the intents that ask the simulation for something.
   *
   * `select-tab` and `arm-room-tool` are *chrome* -- the first is recorded by
   * this suite's own `beforeEach`, the second by arming -- and neither is a
   * command. Filtering them out is what lets an assertion say "the release
   * dispatched nothing" about the thing that would actually change the prison,
   * rather than about the bookkeeping of getting to the tab.
   */
  async function roomCommands(page: Page): Promise<readonly string[]> {
    const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
    return intents.filter((intent) => intent.includes('"zone-room"') || intent.includes('"unzone-room"'));
  }

  test('offers the room catalogue, with the first row selected and its authored rule on screen', async ({ page }) => {
    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());

    expect(probe.panelLaidOut, 'the Rooms panel is not laid out on its own tab').toBe(true);
    expect(probe.rows).toEqual(['room.cell', 'room.canteen', 'room.yard']);
    expect(probe.selected, 'the first row is the default selection').toBe('room.cell');
    // The rule is readable *before* the drag, which is the whole reason the
    // catalogue comes first: a player choosing a canteen should not learn its
    // 6x6 floor from the refusal after dragging 2x2.
    /*
     * **The objects joined that rule in #529.** The block stated how big a cell
     * must be and whether it must be enclosed, and named not one of the things a
     * cell needs standing in it -- so a player choosing between a canteen and a
     * kitchen could not learn what either would cost them. One block, one voice,
     * one series, which is why they share `.hud-rooms__rule` and this probe.
     *
     * These figures are this suite's own `ROOMS_MODEL` fixture, so what they
     * assert is the *panel*. That `roomCatalogue()` in `src/main.ts` really
     * derives them from the shipped catalogue is a different claim, asserted
     * against the real registry in `app-shell.spec.ts`; see `ROOMS_MODEL`'s
     * comment in `ui-harness.ts` for why one cannot stand in for the other.
     */
    expect(probe.ruleText).toEqual([
      'Needs at least 2 × 3 tiles',
      'Needs walls or doors all round',
      'Needs 1 × Bed',
      'Needs 1 × Toilet',
    ]);
    expect(probe.areaText, 'nothing is selected yet').toBe('Nothing selected');
    expect(probe.enclosureText, 'nothing has been designated yet').toBe('Not evaluated yet');
    await expectLaidOut(page, '.hud-rooms__list [data-room]', "the panel's room rows");
  });

  /**
   * The swatch (#1021). Two prior passes (ADR 0098/#1032, #1038's playtest)
   * had found `HudRoomViewModel.tint` computed and read by nothing at all --
   * the catalogue row and the tile `WorldScene` paints could disagree and no
   * assertion anywhere would notice, because there was no reader to be wrong.
   *
   * `ROOMS_MODEL` in `ui-harness.ts` carries three distinct tints copied from
   * the real category table (`0x4f7fd0`, `0xd0854f`, `0x76d04f`), converted
   * here to the `rgb()` string form `getComputedStyle` reports, so a swatch
   * painted from the wrong field or a stale copy would show as the wrong
   * triple rather than passing by coincidence.
   *
   * The second half is #1038's own constraint: colour may only ever be the
   * *extra* channel on a row that already names itself. `aria-hidden` is
   * asserted directly rather than inferred, and the row's own text is checked
   * unchanged -- a swatch that had, say, swallowed the label into itself
   * would fail here even though the colours above would still be right.
   */
  test('paints each catalogue row with its own tint, decoration beside the name rather than instead of it (#1021)', async ({
    page,
  }) => {
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-rooms__rows [data-room]')].map((row) => {
        const swatch = row.querySelector<HTMLElement>('.hud-rooms__row-swatch');
        const label = row.querySelector<HTMLElement>('.ui-row__label');
        return {
          room: row.dataset['room'] ?? null,
          swatchColor: swatch === null ? null : getComputedStyle(swatch).backgroundColor,
          swatchAriaHidden: swatch?.getAttribute('aria-hidden') ?? null,
          // The label specifically, not the row's whole `textContent`: the
          // default-selected row also carries a "Selected" badge (a second,
          // later child), and this assertion is about the *name*, not about
          // which row happens to be chosen when the tab opens.
          labelText: label?.textContent ?? null,
        };
      }),
    );

    expect(rows).toEqual([
      { room: 'room.cell', swatchColor: 'rgb(79, 127, 208)', swatchAriaHidden: 'true', labelText: 'Cell' },
      { room: 'room.canteen', swatchColor: 'rgb(208, 133, 79)', swatchAriaHidden: 'true', labelText: 'Canteen' },
      { room: 'room.yard', swatchColor: 'rgb(118, 208, 79)', swatchAriaHidden: 'true', labelText: 'Yard' },
    ]);

    // Every row's swatch is laid out -- not `display: none`, not a 0x0 box --
    // the same guarantee `expectLaidOut` gives the row itself two lines above.
    await expectLaidOut(page, '.hud-rooms__row-swatch', 'the catalogue swatch');
  });

  test('follows the selection, so the rule shown is the rule of the room picked', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.clickRoomType('room.yard'));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.selected).toBe('room.yard');
    /*
     * The one room in the shipped catalogue that is not `enclosed`. A panel
     * rendering a constant would pass every other assertion in this file.
     *
     * It is also the one room that authors **no object requirement at all**, and
     * the third line is why `roomsRequiresNone` exists rather than the block
     * simply falling silent: once every other room type lists its objects, a
     * yard that said nothing would read as a panel that had failed. The same
     * reason `Needs at least ...` has a `No minimum size` counterpart.
     */
    expect(probe.ruleText).toEqual(['Needs at least 8 × 8 tiles', 'Must be outdoors', 'No objects needed']);
  });

  test('shows the removal control beside the arm control, without folding it away', async ({ page }) => {
    // It is the recovery from every mistake this panel can make, and a recovery
    // folded behind a disclosure is one a player in trouble has to find. Before
    // `UnzoneRoom` existed a designation was permanent for the session, with no
    // recovery at all on touch.
    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.armLaidOut).toBe(true);
    expect(probe.removeLaidOut).toBe(true);
    expect(probe.confirmLaidOut, 'the confirm control shows before anything is pending').toBe(false);
    expect(probe.cancelLaidOut).toBe(false);
    await expectLaidOut(page, '.hud-rooms__remove', 'the removal control');
  });

  test('a finished drag designates nothing until the confirm is pressed', async ({ page }) => {
    // The confirm step, which is the reason a release is not a command. A
    // designation can cover 4,096 tiles; removal now makes that recoverable, and
    // "recoverable" is not "costless".
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    const dragged = await page.evaluate(() =>
      window.lockstateUiHarness.dragWorldRoom({ x: 4, y: 6, width: 2, height: 3 }),
    );
    expect(dragged, 'the HUD registered no room-gesture sink').toBe(true);

    const pending = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(pending.area, 'the rectangle is held, not sent').toBe('4,6,2,3');
    expect(pending.areaText).toBe('2 × 3 tiles at 4, 6');
    // The confirm pair *replaces* the arm pair rather than joining it, which is
    // what makes the confirm step cost the panel no height -- and it is why the
    // two hidden controls must have no box at all.
    expect(pending.armLaidOut).toBe(false);
    expect(pending.removeLaidOut).toBe(false);
    expect(pending.confirmLaidOut).toBe(true);
    expect(pending.cancelLaidOut).toBe(true);
    // The control names the action and the size, so it says what pressing it
    // will do to how many tiles.
    expect(pending.confirmText).toContain('Designate 2 × 3');

    // And nothing has been dispatched. This is the assertion the confirm step
    // exists for: a release is not a command.
    expect(await roomCommands(page), 'a release dispatched a command').toEqual([]);

    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));

    // One command, and only now.
    expect(await roomCommands(page)).toEqual([
      JSON.stringify({ kind: 'zone-room', roomId: 'room.cell', area: { x: 4, y: 6, width: 2, height: 3 } }),
    ]);
    const after = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    /*
     * The confirm pair is gone, so the row is back to holding the arm pair.
     *
     * **The three lines under that used to assert the opposite of what they
     * assert now**, and the reasoning they carried is kept because it was the
     * design until #684: *"the panel is back to being folded, because the tool
     * is still armed and there is nothing left to confirm. That is the loop:
     * draw, confirm, draw again, with the panel out of the way for the parts
     * that happen on the world. The arm control is inside the folded body and
     * so is not laid out, which is why this reads the pair rather than the
     * button."* Every sentence of that was true of the code it described.
     *
     * What it did not account for is that the loop it names is invisible: the
     * only control that reports the tool's state is the one the fold takes off
     * the screen, on the same press. A player coming back for a second room
     * opened the panel and pressed the control that starts drawing -- which at
     * that moment reads "Stop drawing", measured, so the surface was telling
     * the truth to anyone who stopped to read it -- and that press disarmed.
     * So the confirm now stands the tool down, the drawing
     * pass ends with it, and the panel comes back saying "Draw on map" --
     * `rooms-panel.ts`'s `standDownAfterConfirm` carries the full reasoning and
     * the option that was rejected. The test below owns the new rule; these
     * three lines are the same three, pointed the other way.
     */
    expect(after.confirmLaidOut, 'the panel returns to its arm state').toBe(false);
    expect(after.cancelLaidOut).toBe(false);
    expect(after.folded, 'confirming did not end the drawing pass').toBe('false');
    expect(after.armLaidOut, 'the arm control did not come back with the panel').toBe(true);
  });

  /**
   * Issue #684: the second room, and the press that used to undo the first.
   *
   * The reproduction is four ordinary steps -- arm, drag, designate, arm again
   * -- and it cost a playtest agent a whole run on `main`, which is the honest
   * measure of how discoverable the old state was. Three things are asserted
   * here rather than one, because they are three different promises and only
   * the first of them is about this panel's own paint:
   *
   *  1. **The world tool is told.** `arm-room-tool` is what reaches
   *     `RoomTool.setArmed` in the assembled application, so a panel that
   *     repainted its button and never sent it would leave the pointer captured
   *     by a tool the interface says is off. That is the intent stream, not the
   *     DOM.
   *  2. **The panel says so where the player is looking.** The label,
   *     `aria-pressed`, and -- the half the old behaviour lost -- the control
   *     having a box at all.
   *  3. **The next press arms.** This is the whole of the defect: the same
   *     gesture that used to disarm now does what its label says.
   *
   * `armText` and `armPressed` are read together deliberately. The label has
   * always been honest -- "Stop drawing" while armed -- so this test would pass
   * on the old code if it only read the label after a *press*; what it pins is
   * the state at the moment the confirm lands.
   */
  test('a designation stands the tool down, so the next press of the arm control arms it (#684)', async ({
    page,
  }) => {
    const probe = async () => page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    /**
     * Every `arm-room-tool` intent, in order, as the host received it.
     *
     * The counterpart of `roomCommands` above, which filters these *out*: there
     * they are chrome and here they are the subject.
     */
    const armIntents = async (): Promise<readonly string[]> => {
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      return intents.filter((intent) => intent.includes('"arm-room-tool"'));
    };
    const armedIntent = (armed: boolean): string =>
      JSON.stringify({ kind: 'arm-room-tool', armed, roomId: 'room.cell', removing: false });

    // ---- step 1: the player arms, and the panel gets out of the way ----
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    expect(await armIntents(), 'the arm press never reached the world tool').toEqual([armedIntent(true)]);
    const drawing = await probe();
    expect(drawing.armPressed, 'the armed control does not report itself pressed').toBe('true');
    expect(drawing.armText).toBe('Stop drawing');
    expect(drawing.folded, 'arming did not fold the panel').toBe('true');

    // ---- steps 2 and 3: the drag, and the designation ----
    expect(
      await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 4, y: 6, width: 2, height: 3 })),
      'the HUD registered no room-gesture sink',
    ).toBe(true);
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));
    expect(await roomCommands(page), 'the confirm designated nothing').toEqual([
      JSON.stringify({ kind: 'zone-room', roomId: 'room.cell', area: { x: 4, y: 6, width: 2, height: 3 } }),
    ]);

    // 1. The world tool is stood down, and by the same press that designated.
    expect(await armIntents(), 'the designation left the world tool armed').toEqual([
      armedIntent(true),
      armedIntent(false),
    ]);

    // 2. And the panel says so, on screen, where the next press is aimed.
    const after = await probe();
    expect(after.armPressed, 'the control still reports itself pressed').toBe('false');
    expect(after.armText, 'the control still offers to stop something').toBe('Draw on map');
    expect(after.armLaidOut, 'the control that says so has no box to say it in').toBe(true);
    expect(after.folded, 'the panel folded over the control that reports the state').toBe('false');

    // ---- step 4: the press that used to be the defect ----
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    expect(await armIntents(), 'pressing the arm control disarmed the tool instead').toEqual([
      armedIntent(true),
      armedIntent(false),
      armedIntent(true),
    ]);
    const second = await probe();
    expect(second.armPressed, 'the second room never armed the tool').toBe('true');
    expect(second.armText).toBe('Stop drawing');
    expect(second.folded, 'the second drawing pass did not fold the panel').toBe('true');
  });

  /**
   * The fold, which is this panel's answer to a measurement made one layer up.
   *
   * On the assembled page at 375x812 the two rail panels leave a largest square
   * of bare world of 16px, so the drag this whole surface is built around had
   * nowhere to happen and the two controls a finished rectangle reveals could not
   * be reached at all -- the state ADR 0022's amendment recorded and left open.
   * `app-shell.spec.ts` owns that geometry, because this harness leaves the
   * rail's aside slot empty and the class of defect cannot be reproduced here.
   *
   * What belongs *here* is the state machine, which is the panel's own decision
   * and is about no viewport at all: when the panel folds itself, when it comes
   * back, and what happens when the player disagrees. The last of those is the
   * one most worth a test -- a surface that folds itself is a surface that can
   * fight its owner, and the rule is that the player's press wins until they arm
   * again.
   */
  test('folds itself while the player draws, comes back to be confirmed, and yields to the player', async ({
    page,
  }) => {
    const probe = async () => page.evaluate(() => window.lockstateUiHarness.roomsProbe());

    // It arrives open: the catalogue is the first thing the player needs.
    const arrival = await probe();
    expect(arrival.folded, 'the panel arrives folded').toBe('false');
    expect(arrival.bodyLaidOut).toBe(true);

    // Arming is the moment the panel is in the way of the thing it operates on.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    const drawing = await probe();
    expect(drawing.folded, 'arming did not fold the panel').toBe('true');
    // Folded means *no box*, not `hidden` set on a body that lays out anyway --
    // which is exactly what this was. See `.ui-panel__body[hidden]`.
    expect(drawing.bodyLaidOut, 'the folded body is still laid out').toBe(false);

    // A finished rectangle brings it back, because the panel is the only place
    // the rectangle can be confirmed.
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 4, y: 6, width: 2, height: 3 }));
    const pending = await probe();
    expect(pending.folded, 'a pending rectangle left the panel folded').toBe('false');
    expect(pending.confirmLaidOut).toBe(true);
    expect(pending.cancelLaidOut).toBe(true);

    // Discarding resumes the drawing pass, so the panel goes back out of the way.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('cancel'));
    expect((await probe()).folded, 'discarding did not resume the drawing pass').toBe('true');

    // And the player wins. Pulling the panel open mid-pass -- to re-read an
    // authored minimum, say -- keeps it open for the rest of that pass rather
    // than being undone by the next repaint. Picking a room type is a repaint
    // that goes through the same paint path the fold does, which is why it is
    // what this presses.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('fold'));
    expect((await probe()).folded, "the player's own press did not open the panel").toBe('false');
    await page.evaluate(() => window.lockstateUiHarness.clickRoomType('room.yard'));
    const repainted = await probe();
    expect(repainted.selected, 'the repaint did not happen').toBe('room.yard');
    expect(repainted.folded, 'a repaint closed a panel the player had opened').toBe('false');

    // Until they arm again, which is a fresh statement of intent. Disarming
    // first, because the arm control is a toggle and the panel is open, so both
    // presses are ones a player can actually make.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    const disarmed = await probe();
    expect(disarmed.armPressed, 'the tool did not disarm').toBe('false');
    expect(disarmed.folded, 'disarming left the panel folded').toBe('false');
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    expect((await probe()).folded, 'a fresh arm press did not fold the panel').toBe('true');
  });

  test('discarding a pending rectangle asks the host for nothing', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 0, y: 0, width: 4, height: 4 }));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('cancel'));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.area, 'the rectangle is gone').toBe('');
    expect(probe.armLaidOut).toBe(true);
    expect(await roomCommands(page), 'discarding asked the host for something').toEqual([]);
  });

  test('refuses to confirm a rectangle under the authored minimum, and says why exactly once', async ({ page }) => {
    // A 2x3 rectangle is a legal cell and an illegal canteen. The panel holds it
    // either way -- the player drew it -- and the control that would designate
    // it is disabled with the reason beside it, so there is no state in which a
    // pending rectangle has no visible reason for having no way forward.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomType('room.canteen'));
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 0, y: 0, width: 2, height: 3 }));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.confirmDisabled, 'a too-small rectangle can be confirmed').toBe(true);
    expect(probe.noteTone).toBe('warning');
    expect(probe.noteText).toBe('Too small — this room needs at least 6 × 6 tiles.');
    await expectLaidOut(page, '.hud-rooms__note', 'the too-small warning');

    // Laid out is not the same as reachable. A keyboard-only playtest found a
    // player arriving at a disabled Confirm and being told "disabled" and
    // nothing else: the sentence saying *why* was on screen beside the
    // control and tied to nothing. `aria-describedby` is what ties them, and
    // it is asserted here rather than in the note's own test because the
    // relationship belongs to the control.
    expect(probe.confirmDescribedBy, 'the disabled confirm is not described by its own note').toEqual([
      'note',
    ]);

    // Exactly one message: the note. A press that does not dispatch is not a
    // refusal, so the refusal line must stay down and no second sentence may
    // appear anywhere.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));
    expect(await roomCommands(page), 'a disabled confirm dispatched a command').toEqual([]);
    const refusal = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
    expect(refusal.visible, 'a disabled control painted a refusal line as well as the note').toBe(false);

    // And the rule follows the selection back: the same rectangle is a legal
    // cell, so the warning goes and the control comes back.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomType('room.cell'));
    const legal = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(legal.confirmDisabled).toBe(false);
    expect(legal.noteTone).toBe('');
  });

  test('a refusal joins the note on the confirm control rather than replacing it', async ({ page }) => {
    /*
     * `aria-describedby` is a list, and two writers share it: this panel
     * describes Confirm with the note beside it, and the HUD's refusal band
     * marks whichever control was pressed (`hud.ts`, `markControl`). While
     * both called `setAttribute`, the second writer erased the first -- and
     * the erasure is invisible to sighted testing, because the note stays
     * exactly where it was on screen and only stops being reachable.
     *
     * The comment above `commandControls` in `hud.ts` predicted this the day
     * the mark was written: "the controls registered here carry no
     * `aria-describedby` of their own; one that gained one would need this to
     * merge rather than replace." Confirm is now one that gained one.
     */
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 0, y: 0, width: 4, height: 4 }));

    const armed = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(armed.confirmDescribedBy, 'the note does not describe the control it explains').toEqual(['note']);

    await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));

    await expect
      .poll(() => page.evaluate(() => window.lockstateUiHarness.refusalProbe().visible), {
        message: 'the refusal never reached the player',
      })
      .toBe(true);

    // Both, in the order a screen reader reads them: the standing explanation
    // of the control first, then what just happened to it.
    const refused = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(refused.confirmDescribedBy, 'the refusal replaced the note instead of joining it').toEqual([
      'note',
      'refusal',
    ]);
    // And the refusal band's own contract still holds -- every marked control
    // points at the line. Asserted together, because "the note survived" and
    // "the refusal landed" are two claims and a merge that dropped either
    // would satisfy exactly one of them.
    expect(
      (await page.evaluate(() => window.lockstateUiHarness.refusalProbe())).describedByRefusal,
      'the merge dropped the refusal id it was merging in',
    ).toBe(true);

    // Clearing takes back only what the band put there. A `removeAttribute`
    // here would leave the control with no description at all, which is the
    // same defect one press later.
    await page.evaluate(() => window.lockstateUiHarness.failIntents(false));
    // A fresh rectangle, because the refused press consumed the pending one:
    // the control is only laid out while there is something to confirm, and a
    // press with nothing pending dispatches nothing and so clears nothing.
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 0, y: 0, width: 4, height: 4 }));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));

    await expect
      .poll(() => page.evaluate(() => window.lockstateUiHarness.roomsProbe().confirmDescribedBy), {
        message: 'clearing the refusal took the panel\'s own note with it',
      })
      .toEqual(['note']);
  });

  /**
   * Issue #493 -- the gap between "the panel states the rule" and "the press
   * is refused" for a room type that requires enclosure.
   *
   * **The control is warned, never disabled, for this reason (#498).** An
   * earlier version of this change disabled it, and CI on a dedicated runner
   * caught what a harness with no real `WorldRenderView` cannot: staleness in
   * the render-snapshot feed can report `'open'` for a rectangle the
   * simulation has already sealed, for as long as the session stays paused,
   * and disabling on that verdict locks a player out of a designation the
   * simulation would accept -- worse than the missing warning this panel
   * exists to add. `classifyArea` cannot tell a stale `'open'` from a real
   * one, so nothing here may treat `'open'` as certain; only the warning is
   * shown, and the control is left for the real simulation to decide.
   * `rooms-panel.ts`'s `paintActions` comment beside `confirmButton
   * .setDisabled` and ADR 0068 carry the full reasoning.
   */
  test('an open rectangle for a room type that must be enclosed warns but is still sendable (issue #493, #498)', async ({
    page,
  }) => {
    // `room.cell` is `enclosed` and is already selected by default.
    await page.evaluate(() => window.lockstateUiHarness.setWorldRoomEnclosure('open'));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 4, y: 6, width: 4, height: 3 }));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.confirmText).toContain('Designate 4 × 3');
    expect(probe.confirmDisabled, 'a possibly-stale open verdict disabled the control').toBe(false);
    expect(probe.noteTone).toBe('warning');
    // The same sentence the post-designation readout already uses for an open
    // room -- reused rather than drafted new; see the ADR for why a sentence
    // naming *which* side is open is not shipped here.
    expect(probe.noteText).toBe('Open on at least one side');
    await expectLaidOut(page, '.hud-rooms__note', 'the enclosure warning');

    // And the live control really does dispatch: the warning is advisory, and
    // the real simulation is still the one that decides.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));
    expect(await roomCommands(page)).toEqual([
      JSON.stringify({ kind: 'zone-room', roomId: 'room.cell', area: { x: 4, y: 6, width: 4, height: 3 } }),
    ]);
  });

  test('a sealed rectangle for a room type that must be enclosed is unchanged (issue #493)', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.setWorldRoomEnclosure('sealed'));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 4, y: 6, width: 4, height: 3 }));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.confirmDisabled).toBe(false);
    expect(probe.noteTone).toBe('');

    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));
    expect(await roomCommands(page)).toEqual([
      JSON.stringify({ kind: 'zone-room', roomId: 'room.cell', area: { x: 4, y: 6, width: 4, height: 3 } }),
    ]);
  });

  test('an open rectangle for a room type with no enclosure rule is unaffected (issue #493)', async ({ page }) => {
    // `room.yard` requires `outdoors`, not `enclosed` -- the perimeter question
    // this warning answers does not apply to it at all.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomType('room.yard'));
    await page.evaluate(() => window.lockstateUiHarness.setWorldRoomEnclosure('open'));
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 0, y: 0, width: 8, height: 8 }));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.confirmDisabled, 'a room type with no enclosure rule was gated on one anyway').toBe(false);
    expect(probe.noteTone).toBe('');
  });

  /**
   * Too-small still disables, and still wins the note over the enclosure
   * warning: it is arithmetic on numbers the panel already holds (the pending
   * rectangle's own size against the selected room's authored minimum), with
   * no world state and so no staleness to be wrong about -- unlike enclosure,
   * which is why the two are no longer treated alike.
   */
  test('a too-small rectangle keeps its own warning, and stays disabled, even when it is also open (issue #493)', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.setWorldRoomEnclosure('open'));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 0, y: 0, width: 2, height: 2 }));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.confirmDisabled).toBe(true);
    expect(probe.noteText).toBe('Too small — this room needs at least 2 × 3 tiles.');
  });

  /**
   * The typed-coordinates route reaches the identical warning (#411's parity
   * guarantee), which is the reason `classifyArea` is a question the panel
   * asks rather than an answer only a drag can carry: this producer never
   * drags anything and has no frame of its own to be told on.
   */
  test('a typed rectangle reaches the same enclosure warning a drag does, and stays sendable (#411, #493, #498)', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.setWorldRoomEnclosure('open'));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates'));
    await page.evaluate(() => window.lockstateUiHarness.typeRoomCoordinates({ x: 4, y: 6, width: 4, height: 3 }));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates-submit'));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.area).toBe('4,6,4,3');
    expect(probe.confirmDisabled, 'the typed route reached a different verdict from the drag').toBe(false);
    expect(probe.noteText).toBe('Open on at least one side');

    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));
    expect(await roomCommands(page), 'the typed route did not reach the worker').toEqual([
      JSON.stringify({ kind: 'zone-room', roomId: 'room.cell', area: { x: 4, y: 6, width: 4, height: 3 } }),
    ]);
  });

  test('a removal drag confirms as a removal, and says what it will really take', async ({ page }) => {
    // On touch this whole sequence is drag, read, tap -- which is the point:
    // undo is a keyboard chord, so before this there was no recovery of any kind
    // on a touch device.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('remove'));

    const armed = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(armed.removePressed).toBe('true');
    // The hint says what a removal drag actually does, because it is not "clear
    // the tiles you dragged over": each covered tile is grown into its whole
    // connected same-type run.
    expect(armed.noteText).toBe('Drag across any part of a room to remove all of it.');

    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 7, y: 7, width: 1, height: 1 }, true));

    const pending = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    // Not "Designate", which would name the opposite of what pressing it does.
    expect(pending.confirmText).toContain('Remove 1 × 1');

    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));

    expect(await roomCommands(page), 'a removal carries no room id').toEqual([
      JSON.stringify({ kind: 'unzone-room', area: { x: 7, y: 7, width: 1, height: 1 } }),
    ]);

    // And the confirm stands the removal down too (#684), for the reason it
    // stands a designation down: the press said "remove this room", not "keep
    // removing". The mode goes with the arming rather than outliving it,
    // because a control reading "Stop removing" with nothing being removed is
    // the same hidden state one row over.
    const after = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(after.removePressed, 'the removal mode outlived the removal').toBe('false');
    expect(after.armPressed, 'the tool stayed armed after the removal').toBe('false');
    expect(after.folded, 'the panel stayed folded after the removal').toBe('false');
  });

  /**
   * Issue #689, on this panel: a control that says *stop* stops.
   *
   * The Build panel has the same pair and the same defect and is covered in its
   * own suite; this is the Rooms half, and it is not a duplicate because the
   * two panels reach the press through different geometry. Arming here **folds
   * the panel**, so "Stop removing" is behind the header control the moment it
   * becomes the thing to press -- which is the same shape #684 measured one
   * button over, and the reason the unfold below is part of the walk rather
   * than setup.
   *
   * Three promises, as in the #684 test above: the world tool is told, the
   * panel says so where the player is looking, and the fold ends because there
   * is no longer a drawing pass to hide behind.
   */
  test('pressing "Stop removing" stands the Rooms tool down (#689)', async ({ page }) => {
    const probe = async () => page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    const armIntents = async (): Promise<readonly string[]> => {
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      return intents.filter((intent) => intent.includes('"arm-room-tool"'));
    };
    const removalIntent = (armed: boolean, removing: boolean): string =>
      JSON.stringify({ kind: 'arm-room-tool', armed, roomId: 'room.cell', removing });

    // ---- one press arms into removal, which is the invariant to keep ----
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('remove'));
    const removing = await probe();
    expect(removing.removePressed, 'one press did not turn removal on').toBe('true');
    expect(removing.armPressed, 'the arm control claimed the mode that is not its').toBe('false');
    expect(await armIntents(), 'arming to remove never reached the world tool').toEqual([removalIntent(true, true)]);
    // Arming to remove starts a drawing pass on the same terms as the button
    // beside it, so the panel gets out of the way of the world.
    expect(removing.folded, 'arming to remove did not fold the panel').toBe('true');

    // ---- the player opens the panel back up to reach the control ----
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('fold'));
    const open = await probe();
    expect(open.removeLaidOut, '"Stop removing" has no box for the player to press').toBe(true);
    expect(open.removePressed).toBe('true');

    // ---- and pressing it leaves nothing armed ----
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('remove'));
    expect(await armIntents(), 'the stand-down never reached the world tool').toEqual([
      removalIntent(true, true),
      removalIntent(false, false),
    ]);
    const stopped = await probe();
    expect(stopped.removePressed, 'the mode outlived the press that said stop').toBe('false');
    expect(stopped.armPressed, '"Stop removing" handed back a designating tool').toBe('false');
    // The label is the half a player reads without reading, and it must not be
    // offering to stop something else instead.
    expect(stopped.armText).toBe('Draw on map');
    expect(stopped.armLaidOut, 'the control that reports the state has no box').toBe(true);
    // `drawing()` is false with nothing armed, so the drawing fold ends on its
    // own -- the panel comes back rather than staying shut over a tool that is
    // no longer there.
    expect(stopped.folded, 'the panel stayed folded with nothing armed').toBe('false');
    // And no room was designated or removed on the way through.
    expect(await roomCommands(page), 'a mode toggle asked the simulation for something').toEqual([]);
  });

  /**
   * Issue #735: the other half of #689's family, on the control beside it.
   *
   * "Draw on map" used to run `removing = false; armed = !armed;`. Coming
   * *out* of removal `armed` is already `true` -- removal arms the tool -- so
   * that expression computed `false`: a player who pressed "Draw on map" to
   * say which of the two they wanted got the tool standing down instead. This
   * is the walk that manifests it: arm to remove, reopen the panel to reach
   * the control, then press "Draw on map".
   *
   * The fold assertion is part of the same fix, not a separate concern
   * (`pressArm`'s doc in `tool-arming.ts`): the panel was folded over "Stop
   * removing" during the removal pass, the player reopened it to reach that
   * control, and the press has to fold it again over the world for the fresh
   * drawing pass it just started -- even though `armed` does not change value
   * across the press.
   */
  test('pressing "Draw on map" while removing arms the tool to draw, not stand it down (#735)', async ({
    page,
  }) => {
    const probe = async () => page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    const armIntents = async (): Promise<readonly string[]> => {
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      return intents.filter((intent) => intent.includes('"arm-room-tool"'));
    };
    const roomIntent = (armed: boolean, removing: boolean): string =>
      JSON.stringify({ kind: 'arm-room-tool', armed, roomId: 'room.cell', removing });

    // ---- arm to remove, then reopen the panel to reach the control ----
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('remove'));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('fold'));
    const removing = await probe();
    expect(removing.removePressed, 'one press did not turn removal on').toBe('true');
    expect(removing.armLaidOut, '"Draw on map" has no box for the player to press').toBe(true);

    // ---- pressing "Draw on map" while removing ----
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    expect(await armIntents(), 'the switch from removing to drawing never reached the world tool').toEqual([
      roomIntent(true, true),
      roomIntent(true, false),
    ]);
    const drawing = await probe();
    // The defect: negating an `armed` that was already `true` from removal
    // computed `false` here, standing the tool down instead of arming it.
    expect(drawing.armPressed, 'the press that asked to draw got no tool').toBe('true');
    expect(drawing.removePressed, 'removal outlived the press that said "Draw on map"').toBe('false');
    expect(drawing.armText).toBe('Stop drawing');
    // A fresh press of "Draw on map" is a fresh statement of intent, so the
    // panel folds again even though it was reopened a moment ago to reach the
    // control, and `armed` did not change value across the press.
    expect(drawing.folded, 'the panel stayed open over a fresh drawing pass').toBe('true');
    // And no room was designated or removed on the way through.
    expect(await roomCommands(page), 'a mode switch asked the simulation for something').toEqual([]);

    // **The flags saying "armed" is not the same as the tool drawing**, and
    // this is the half that tells them apart: a drag on the world after the
    // press has to produce a pending designation rectangle. Ported from a
    // red-first branch opened against this same issue, which measured exactly
    // this and nothing else -- kept because it is the assertion that would
    // survive a future refactor moving the flags somewhere the gesture does
    // not follow.
    expect(
      await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 4, y: 6, width: 2, height: 3 })),
      'the HUD registered no room-gesture sink',
    ).toBe(true);
    const pending = await probe();
    expect(pending.area, 'the drawing pass produced no pending designation rectangle').toBe('4,6,2,3');
    expect(pending.confirmText).toContain('Designate 2 × 3');
  });

  /**
   * The tint, on the panel whose `data-armed` #684 connected and whose
   * `data-removing` nothing read until #689.
   *
   * Measured in a browser because only a browser can say whether a declaration
   * reached an element, and read as a difference against each control's own
   * resting paint because the palette is tokens.
   */
  test('the Rooms removal control carries the armed tint while the mode is on (#689)', async ({ page }) => {
    const paintOf = async (selector: string): Promise<string> =>
      page.evaluate((target) => {
        const node = document.querySelector<HTMLElement>(target);
        return node === null ? '' : getComputedStyle(node).backgroundColor;
      }, selector);

    const armIdle = await paintOf('.hud-rooms__arm');
    const removeIdle = await paintOf('.hud-rooms__remove');

    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    // Arming folds the panel, so the paint is read with it open again -- a
    // control with no box has no computed background worth comparing.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('fold'));
    const armedPaint = await paintOf('.hud-rooms__arm');
    expect(armedPaint, 'the arm control has no armed tint to reuse').not.toBe(armIdle);

    /*
     * Straight from drawing into removal, which is one press on this panel --
     * and no second unfold, deliberately: `drawingFolded` only moves on the
     * press that *starts* a pass (`armed && !wasArmed`), so a pass that was
     * already running stays open where the player left it.
     */
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('remove'));
    expect(await paintOf('.hud-rooms__remove'), 'removal mode changed the label and nothing else').not.toBe(
      removeIdle,
    );
    expect(await paintOf('.hud-rooms__remove'), 'removal invented a second armed look').toBe(armedPaint);
    expect(await paintOf('.hud-rooms__arm'), 'two controls claim the pointer at once').toBe(armIdle);

    // And it goes when the tool stands down.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('remove'));
    expect(await paintOf('.hud-rooms__remove')).toBe(removeIdle);
  });

  /**
   * The typed route and the drag are one route (#411).
   *
   * This is the assertion behind #411's "the keyboard route issues the same
   * command as the drag and is subject to the same refusals". It is not a claim
   * about two code paths that happen to agree: the panel has one assignment
   * that makes a rectangle pending, and the point of comparing the two
   * producers is that a second path -- a typed route that composed its own
   * intent, or skipped the confirm step -- would show up here as a difference
   * even if both halves worked.
   *
   * The comparison is not the whole test, deliberately. Two routes that broke
   * *identically* would agree with each other, so the command is also pinned
   * against a literal written out here. The four numbers are the test's input;
   * neither side of the equality is the test's own answer.
   */
  test('a typed rectangle and a dragged one produce the same command (#411)', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    expect(
      await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 4, y: 6, width: 2, height: 3 })),
      'the HUD registered no room-gesture sink',
    ).toBe(true);
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));

    // Disarming ends the drawing pass, which is what a player does when they
    // give up on the map and reach for the numbers instead.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates'));
    const opened = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(opened.coordinatesFolded, 'the coordinate form did not open').toBe('false');
    // The dragged rectangle came into the fields, so the two routes hold one
    // rectangle between them rather than two.
    expect(opened.coordinates, 'the drag did not reach the coordinate fields').toEqual(['4', '6', '2', '3']);

    // A different rectangle first, so the numbers below cannot pass by being
    // whatever the drag left behind.
    expect(
      await page.evaluate(() => window.lockstateUiHarness.typeRoomCoordinates({ x: 9, y: 9, width: 5, height: 5 })),
      'a coordinate field is missing',
    ).toBe(true);
    const typing = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(typing.area, 'typing alone made a rectangle pending').toBe('');
    expect(typing.confirmLaidOut, 'typing alone revealed the confirm control').toBe(false);

    await page.evaluate(() => window.lockstateUiHarness.typeRoomCoordinates({ x: 4, y: 6, width: 2, height: 3 }));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates-submit'));

    const pending = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(pending.area, 'the typed rectangle is not the pending one').toBe('4,6,2,3');
    expect(pending.confirmText, 'the confirm control does not describe the typed rectangle').toContain(
      'Designate 2 × 3',
    );
    expect(await roomCommands(page), 'the typed route dispatched without a confirm').toHaveLength(1);

    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));

    const commands = await roomCommands(page);
    expect(commands, 'one command per confirm, whichever route produced the rectangle').toHaveLength(2);
    expect(commands[1], 'the typed route composes a different command from the drag').toBe(commands[0]);
    expect(commands[0]).toBe(
      JSON.stringify({ kind: 'zone-room', roomId: 'room.cell', area: { x: 4, y: 6, width: 2, height: 3 } }),
    );
  });

  /**
   * What the typed route clamps, and what it deliberately does not (#411).
   *
   * The two sides are bounded because a rectangle wider than
   * `MAX_ROOM_SIDE_TILES` is refused `invalid-area` by the simulation whatever
   * produced it, and the drag already caps itself at the same number -- so a
   * typed rectangle that could not be dragged would be a route with a different
   * reach rather than a second way to say the same thing.
   *
   * Tile X and tile Y are **not** bounded, and that is the interesting half.
   * The panel does not know where the owned world is; clamping a coordinate to
   * a number the panel guessed would move a designation somewhere the player
   * did not ask for and call it success. Out of bounds has a refusal, and the
   * refusal is the honest answer.
   */
  test('the typed route bounds the sides and leaves the tile alone (#411)', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates'));
    await page.evaluate(() =>
      window.lockstateUiHarness.typeRoomCoordinates({ x: -40, y: 4096, width: 9999, height: 0 }),
    );

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.coordinates, 'the fields did not clamp the sides, or clamped the tile').toEqual([
      '-40',
      '4096',
      String(MAX_ROOM_SIDE_TILES),
      '1',
    ]);

    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates-submit'));
    // And the clamp is the rectangle's, not just the field's: what the panel
    // holds is what it would send.
    expect(await page.evaluate(() => window.lockstateUiHarness.roomsProbe())).toMatchObject({
      area: `-40,4096,${MAX_ROOM_SIDE_TILES},1`,
    });
  });

  /*
   * ...and it takes that clamp without rewriting a number still being typed
   * (#548).
   *
   * The test above drives the fields the way the harness always has: it sets
   * `input.value` and dispatches `change`, which is what a browser does when a
   * *finished* entry loses focus. That is one keystroke's worth of the story.
   * Since #548 the field also reports on `input`, which fires on every
   * keystroke -- and a keystroke is where clamping and typing can fight.
   *
   * `MAX_ROOM_SIDE_TILES` is 64, so `152` is over the ceiling; but it is also
   * what the box says on the way to `15` becoming something else, and on the
   * way *through* `152` to anything longer. The owner is told 64 immediately,
   * because that is the value a control pressed right now would act on -- and
   * the box is left saying `152`, because an owner that answered a keystroke by
   * writing its clamped value back would move the caret to the end of the field
   * and delete what the player was halfway through. The two reconcile on the
   * way out, which is the third assertion.
   *
   * Real keystrokes and not `fill`: `fill` sets a value and dispatches its own
   * events without a focus to lose, so it cannot tell a field that reports
   * while focused from one that reports on blur.
   */
  test('a bounded field takes its clamp without rewriting what is still being typed (#548)', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates'));

    const width = page.locator('.hud-rooms__coord-width .ui-number__input');
    await width.click({ clickCount: 3 });
    await page.keyboard.type('152');

    // Nothing has left the field, so no `change` has fired and none can have.
    await expect(width, 'the field lost focus, so what follows is not a claim about typing').toBeFocused();
    await expect(width, 'the clamp overwrote a number the player was still typing').toHaveValue('152');

    // Out of the field, and now the owner's value is the one on screen.
    await page.keyboard.press('Tab');
    await expect(width, 'leaving the field did not reconcile the box with the value the panel holds').toHaveValue(
      String(MAX_ROOM_SIDE_TILES),
    );

    // And the clamp is the rectangle's rather than only the box's.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates-submit'));
    expect(await page.evaluate(() => window.lockstateUiHarness.roomsProbe())).toMatchObject({
      area: `0,0,${MAX_ROOM_SIDE_TILES},1`,
    });
  });

  /**
   * A typed rectangle under the room's authored minimum is held and not sent
   * (#411).
   *
   * The existing behaviour, now reached from the keyboard: the rectangle is
   * real and the player asked for it, so the confirm control stays where it is
   * and goes *disabled*, with the note beside it saying what is wrong. The
   * assertion that matters is the last one -- pressing it dispatches nothing --
   * because a disabled-looking control that still fired would be the same
   * defect wearing a grey coat.
   */
  test('a typed rectangle below the authored minimum leaves the confirm disabled (#411)', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates'));
    await page.evaluate(() =>
      window.lockstateUiHarness.typeRoomCoordinates({ x: 3, y: 3, width: 2, height: 2 }),
    );
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates-submit'));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    // `room.cell` is authored 2x3, so 2x2 is short in one axis only -- a
    // rectangle a rule that only compared areas would accept.
    expect(probe.area, 'the too-small rectangle was not held').toBe('3,3,2,2');
    expect(probe.confirmLaidOut, 'the control that cannot be pressed was taken away').toBe(true);
    expect(probe.confirmDisabled, 'a rectangle under the authored minimum can be confirmed').toBe(true);
    expect(probe.noteText).toBe('Too small — this room needs at least 2 × 3 tiles.');
    expect(probe.noteTone, 'the warning does not read as a warning').toBe('warning');

    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));
    expect(await roomCommands(page), 'the disabled confirm dispatched anyway').toEqual([]);

    // And it is the rule rather than the rectangle: one more tile of height and
    // the same route goes through.
    await page.evaluate(() => window.lockstateUiHarness.typeRoomCoordinates({ height: 3 }));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('coordinates-submit'));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));
    expect(await roomCommands(page)).toEqual([
      JSON.stringify({ kind: 'zone-room', roomId: 'room.cell', area: { x: 3, y: 3, width: 2, height: 3 } }),
    ]);
  });

  /**
   * The catalogue is one choice, so it costs one tab stop (#411).
   *
   * ### Why only a browser can answer this
   *
   * Every claim below is a fact about a live focus ring: which element
   * `document.activeElement` is after a real key press, what `tabIndex` the
   * browser resolved for each row, and whether a key the group did not consume
   * still reached the page. `vitest.config.ts` runs in
   * `environment: 'node'` with no jsdom, so there is no `activeElement` and no
   * focus model there at all -- and jsdom would not help, because jsdom does
   * not implement sequential focus navigation, which is the entire subject.
   * The arithmetic underneath *is* reachable from node and is pinned in
   * `tests/unit/ui-roving-focus.test.ts`; this is the wiring.
   *
   * ### What was wrong
   *
   * ADR 0039 gave zoning a keyboard route and `app-shell.spec.ts` proved the
   * whole chain with it, so the route was *possible*. It was not short.
   * The catalogue is eighteen rows, each a `<button>` and therefore each its
   * own tab stop, and the coordinate form is the last child of the same
   * scroller -- so a player crossed the remainder of the list to reach it on
   * every room they ever zoned. Measured on the assembled page in
   * `app-shell.spec.ts`, with `room.cell` drawn fifth: fourteen `Tab` presses
   * from the chosen room to the disclosure, where there is now one. Eighteen
   * tab stops for one choice is the case the WAI-ARIA composite-widget rule
   * exists for.
   *
   * ### The half that keeps this from being a regression
   *
   * A roving `tabindex` alone would make seventeen rows unreachable for a
   * sighted keyboard-only player, who has no browse mode and no cue to try an
   * arrow. So the group is announced: `role="radiogroup"` on the box that holds
   * only the rows, `role="radio"` and `aria-checked` on each. That is asserted
   * here as part of the behaviour rather than as decoration, because without it
   * the tab-stop count below is a defect and not a fix.
   */
  test('the room catalogue is one tab stop, and the arrows move inside it (#411)', async ({ page }) => {
    const rowState = async (): Promise<{ tabStops: string[]; checked: string[]; focused: string }> =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('.hud-rooms__rows [data-room]')];
        return {
          tabStops: rows.filter((row) => row.tabIndex === 0).map((row) => row.dataset['room'] ?? ''),
          checked: rows
            .filter((row) => row.getAttribute('aria-checked') === 'true')
            .map((row) => row.dataset['room'] ?? ''),
          focused: (document.activeElement as HTMLElement | null)?.dataset?.['room'] ?? '',
        };
      });

    // The group is announced as one, and it holds only the rows -- the
    // coordinate form ADR 0039 measured into the same scroller is deliberately
    // outside it, or four number fields would be members of the choice.
    expect(
      await page.evaluate(
        () => document.querySelector('.hud-rooms__rows')?.getAttribute('role') ?? '',
      ),
      'the row box is not announced as a single choice',
    ).toBe('radiogroup');
    expect(
      await page.evaluate(() => document.querySelectorAll('.hud-rooms__rows .hud-rooms__coordinates').length),
      'the coordinate form was swallowed into the radiogroup',
    ).toBe(0);
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-rooms__rows [data-room]')].every(
          (row) => row.getAttribute('role') === 'radio',
        ),
      ),
      'a catalogue row is not announced as a member of the choice',
    ).toBe(true);

    /*
     * One tab stop, however many rows there are -- read off the browser's own
     * resolved `tabIndex`.
     *
     * The harness feeds this panel three room types where the shipped
     * catalogue has eighteen (`src/content/room-catalog.ts`), so the *count*
     * that motivated the change is asserted on the real application in
     * `app-shell.spec.ts` and what is asserted here is the property that does
     * not depend on it: the group costs one stop whatever its length. Three is
     * still enough to tell a ring from an off-by-one, which is what the arrows
     * below need.
     */
    const rows = (await page.evaluate(() => window.lockstateUiHarness.roomsProbe())).rows;
    expect(rows.length, 'too few rows to tell a wrap from an off-by-one').toBeGreaterThanOrEqual(3);
    const last = rows.length - 1;
    const arrival = await rowState();
    expect(arrival.tabStops, 'the catalogue does not cost exactly one tab stop').toHaveLength(1);

    // Reaching it: one `Tab` from the catalogue's own disclosure header, not
    // eighteen. Focus is put on the section header first so the count below is
    // the catalogue's and not a lap of the page.
    await page.locator('.hud-rooms__catalogue > .ui-section__header').focus();
    await page.keyboard.press('Tab');
    expect(
      (await rowState()).focused,
      'one Tab from the catalogue header did not land inside the row group',
    ).toBe(arrival.tabStops[0]);

    // And leaving it: one more `Tab` clears every row and reaches the typed
    // route. Before the roving tab stop this press was the second of as many
    // presses as the catalogue had rows.
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement && active.closest('.hud-rooms__coordinates') !== null;
      }),
      'one Tab out of the row group did not reach the coordinate form',
    ).toBe(true);

    // ---- the arrows, which are what the one tab stop buys back ----------
    await page.locator('.hud-rooms__rows [data-room="room.cell"]').focus();
    await page.keyboard.press('ArrowDown');
    expect((await rowState()).focused, 'ArrowDown did not step to the next room type').toBe(
      rows[1],
    );
    // The tab stop follows focus, so tabbing back in returns to where the
    // player arrowed to rather than to the top of a list they have moved through.
    expect((await rowState()).tabStops, 'the group kept two tab stops after an arrow').toEqual([rows[1]]);

    await page.keyboard.press('ArrowUp');
    expect((await rowState()).focused, 'ArrowUp did not step back').toBe(rows[0]);
    await page.keyboard.press('ArrowUp');
    expect((await rowState()).focused, 'the ring did not wrap backwards off the first row').toBe(
      rows[last],
    );
    await page.keyboard.press('Home');
    expect((await rowState()).focused, 'Home did not reach the first room type').toBe(rows[0]);
    await page.keyboard.press('End');
    expect((await rowState()).focused, 'End did not reach the last room type').toBe(rows[last]);

    /*
     * Focus moves; selection does not. The radiogroup convention is
     * selection-follows-focus, and it is refused here because choosing a room
     * type while the world tool is armed re-arms it -- so arrowing the length
     * of the catalogue would fire that seventeen times. Explicit activation is
     * also what a pointer press does, which keeps the two producers of a
     * selection one gesture.
     */
    expect(
      (await rowState()).checked,
      'arrowing across the catalogue changed the selection without the player choosing',
    ).toEqual(['room.cell']);

    // `Enter` on the focused row is what chooses it, through the same
    // `onActivate` a pointer press reaches -- and `aria-checked` is what says
    // so to a screen reader, in place of the badge that only says it in ink.
    await page.keyboard.press('Enter');
    const chosen = await rowState();
    expect(chosen.checked, 'Enter on a focused row did not choose it').toEqual([rows[last]]);
    expect(chosen.tabStops, 'the tab stop did not follow the new selection').toEqual([rows[last]]);
    expect(
      (await page.evaluate(() => window.lockstateUiHarness.roomsProbe())).selected,
      'the panel and the accessibility tree disagree about what is selected',
    ).toBe(rows[last]);
  });

  test('switching to removal discards a pending designation rather than reinterpreting it', async ({ page }) => {
    // The same four numbers mean "designate this" or "remove whatever is here",
    // and silently changing which would be the panel deciding something the
    // player did not say.
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 2, y: 2, width: 2, height: 3 }));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('remove'));

    const probe = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(probe.area).toBe('');
    expect(probe.confirmLaidOut).toBe(false);
  });

  test('a refused designation is reported on the control that was pressed', async ({ page }) => {
    // The confirm step's other benefit, and the one a build drag cannot have: a
    // room designation always has a control to be marked on, because the player
    // pressed one.
    await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 0, y: 0, width: 2, height: 3 }));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));

    const refusal = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
    expect(refusal.visible).toBe(true);
    expect(refusal.action).toBe('zone-room');
    expect(refusal.text).toBe('The room was not designated — the request was refused.');
    // One message, not two: the marked control and the line are one report
    // about one press, and the line's own id is what describes the control.
    expect(refusal.failedControls).toHaveLength(1);
    expect(refusal.describedByRefusal).toBe(true);
  });

  test('a refused removal says something different from a refused designation', async ({ page }) => {
    // The two leave the prison in different states -- no new room, against a
    // room still exactly where it was -- so they must not share a sentence.
    await page.evaluate(() => window.lockstateUiHarness.failIntents(true));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('remove'));
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 0, y: 0, width: 1, height: 1 }, true));
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('confirm'));

    const refusal = await page.evaluate(() => window.lockstateUiHarness.refusalProbe());
    expect(refusal.visible).toBe(true);
    expect(refusal.action).toBe('unzone-room');
    expect(refusal.text).toBe('Nothing was removed — the request was refused.');
  });

  test('reads out what the simulation found about the room, and no longer warns about it', async ({ page }) => {
    /*
     * **This case used to be called '... and warns only when it disagrees'**,
     * and its first block asserted `noteTone: 'warning'` with the sentence
     * *"This room should be enclosed, and the area you drew is open on at least
     * one side."* under a comment reading *"A readout, never a refusal.
     * `RoomZoningService` accepts a room drawn in open ground either way ... so
     * refusing would block a legitimate designation. The panel's job is to *say
     * so*."*
     *
     * It was right then and is wrong now, and the change is a ruling rather
     * than a bug: `zone` refuses an `enclosed` room whose perimeter is open
     * (the ADR "Must a zoned room be enclosed"), so no *accepted* zoning can
     * report that pair and the panel's warning branch, its message key
     * `hud.rooms.enclosure-open-required` and its English text are all deleted.
     * The sentence now reaches the player as
     * `hud.alert.refusal.zone.not-enclosed`, in the alerts list, at the moment
     * they can still act on it.
     *
     * The `open` + `enclosed` pair is kept here as an input on purpose. The
     * harness reports a notice directly, so it can still construct a pair the
     * simulation no longer produces -- and asserting that the panel stays calm
     * about it is what proves the branch is gone rather than merely unreached.
     */
    await page.evaluate(() =>
      window.lockstateUiHarness.reportZoning({ sequence: 1, enclosure: 'open', requirement: 'enclosed' }),
    );

    const warned = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(warned.enclosureText).toBe('Open on at least one side');
    expect(warned.noteTone, 'the pair is refused upstream now, so the panel has nothing to flag').toBe('');
    await expectLaidOut(page, '.hud-rooms__enclosure', 'the enclosure readout');

    // The yard is authored `outdoors` and is *correct* when it is open. This
    // is the pair an accepted zoning can still carry, and it was never warned
    // about.
    await page.evaluate(() =>
      window.lockstateUiHarness.reportZoning({ sequence: 2, enclosure: 'open', requirement: 'outdoors' }),
    );
    const fine = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(fine.enclosureText).toBe('Open on at least one side');
    expect(fine.noteTone).toBe('');

    await page.evaluate(() =>
      window.lockstateUiHarness.reportZoning({ sequence: 3, enclosure: 'sealed', requirement: 'enclosed' }),
    );
    const sealed = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    /*
     * **This read `'Walled in on every side'` until #1006 finding 2.** Those
     * words are the pass half of a pass/fail pair sitting two lines under
     * `MUST BE ENCLOSED`, and a play-test read the three together as "this room
     * is finished" while the block above them said *"a door — nobody can get
     * in"*. `roomPerimeterEnclosure` never reads the door registry -- that is
     * why `roomPerimeterAccess` exists beside it -- so the readout now states
     * its own scope instead of leaving a player to infer it.
     */
    expect(sealed.enclosureText).toBe('Walled in — not a door check');
    expect(sealed.noteTone).toBe('');
  });

  test('the enclosure readout is drawn whole rather than clipped (#1006 finding 4)', async ({ page }) => {
    /*
     * Measured on the assembled page at 900x600 before the fix: `scrollWidth`
     * **268** against `clientWidth` **238**, with `overflow-x: visible` and
     * `text-overflow: clip` -- 30px of the sentence outside the panel, cut off
     * mid-word. The fix is `flex-wrap: wrap` on the block, so a value that does
     * not fit beside its label takes its own line instead of hanging off the
     * edge; see `.hud-rooms__enclosure` in `hud.css` for why that rather than
     * an ellipsis or a shorter sentence.
     *
     * Asserted as a measurement rather than against a pixel figure, because the
     * claim is "nothing overflows", not "the block is 238px wide" -- a figure
     * would go stale the day a gutter moved and would say nothing about any
     * other locale's wording.
     */
    await page.setViewportSize({ width: 900, height: 600 });
    await page.evaluate(() =>
      window.lockstateUiHarness.reportZoning({ sequence: 1, enclosure: 'sealed', requirement: 'enclosed' }),
    );

    const measured = await page.evaluate(() => {
      const block = document.querySelector<HTMLElement>('.hud-rooms__enclosure');
      const value = document.querySelector<HTMLElement>('.hud-rooms__enclosure-value');
      if (block === null || value === null) return null;
      return {
        laidOut: block.getClientRects().length > 0,
        scrollWidth: block.scrollWidth,
        clientWidth: block.clientWidth,
        // The value's own box against the text inside it: a block that no
        // longer overflows because the *value* was truncated would still be
        // the defect, one element down.
        valueScrollWidth: value.scrollWidth,
        valueClientWidth: value.clientWidth,
        text: value.textContent?.trim() ?? '',
      };
    });

    expect(measured).not.toBeNull();
    expect(measured!.laidOut, 'the readout has no box to measure').toBe(true);
    expect(measured!.text).toBe('Walled in — not a door check');
    expect(
      measured!.scrollWidth,
      `the enclosure block overflows its panel by ${measured!.scrollWidth - measured!.clientWidth}px`,
    ).toBeLessThanOrEqual(measured!.clientWidth);
    expect(measured!.valueScrollWidth, 'the sentence itself is clipped inside its own box').toBeLessThanOrEqual(
      measured!.valueClientWidth,
    );
  });

  test('says what a designated room is missing, and says nothing when nothing is (#331)', async ({ page }) => {
    // The verdict is `projectRoomList`/`projectRoomDetail`'s, pulled over the
    // projection channel; what is proven here is the panel's half -- which
    // sentence a given verdict deserves, and that a clean prison earns no block
    // at all. The real round trip runs in `tests/browser/app-shell.spec.ts`.
    const probe = async () => page.evaluate(() => window.lockstateUiHarness.roomsProbe());

    // 1. Nothing asked. The panel has been handed no readout at all, which is
    // the state it mounts in.
    const unasked = await probe();
    expect(unasked.needsLaidOut, 'a panel that has been told nothing draws a readout').toBe(false);
    expect(unasked.needsLineText).toBe('');
    expect(unasked.needsUnfinished).toBe('');

    // 2. Asked, and the answer is that every room is finished. A different fact
    // from the one above and the same drawing, which is the whole point of the
    // block being absent rather than saying so.
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 0,
        totalRooms: 4,
        totalNeeds: 0,
        atCapacity: [],
        needs: [],
      }),
    );
    const clean = await probe();
    expect(clean.needsLaidOut, 'a prison with nothing missing draws a readout').toBe(false);
    expect(clean.needsLineText).toBe('');
    // And nothing of it is on screen, which is the assertion `toContainText`
    // cannot make (#220): the panel's rendered text must not mention it.
    expect(await page.locator('.hud-rooms').innerText()).not.toContain('Not ready');

    // 3. One room, one thing missing: the room named, then what it is short.
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 1,
        totalRooms: 4,
        totalNeeds: 1,
        atCapacity: [],
        needs: [
          {
            kind: 'object',
            instanceId: 'room.cell:12:4',
            roomLabelKey: 'room.cell.name',
            tile: { x: 12, y: 4 },
            objectLabelKey: 'object.bed.name',
            missingQuantity: 1,
          },
        ],
      }),
    );
    const one = await probe();
    expect(one.needsLaidOut).toBe(true);
    expect(one.needsUnfinished).toBe('1');
    expect(one.needsTotal).toBe('1');
    expect(one.needsCountText).toBe('1 of 4');
    expect(one.needsLineText).toBe('Cell at 12, 4 is missing');
    expect(one.needsItemText).toEqual(['1 × Bed']);
    await expectLaidOut(page, '.hud-rooms__needs', 'the room readout');

    /*
     * 4. **Every object the room is short, each with how many** -- the case
     *    #529 exists for, and the deepest one the shipped catalogue can
     *    produce.
     *
     * `room.kitchen` authors three object requirements, which is the most of
     * any of the eighteen; the quantities here are deliberately *not* all one,
     * because a panel that rendered the object and dropped the numeral would
     * pass an all-ones assertion. This is what the old readout could only say
     * as "Kitchen at 11, 10 needs Stove, and 2 more", with the other two
     * enumerated on no surface in the application.
     *
     * `totalNeeds` is 5 against three lines drawn: the header's figure is over
     * the whole prison and the lines are one room's, which is the separation
     * the old "and {count} more" collapsed -- it subtracted a prison-wide
     * remainder inside a sentence about a single room.
     */
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 2,
        totalRooms: 4,
        totalNeeds: 5,
        atCapacity: [],
        needs: [
          {
            kind: 'object',
            instanceId: 'room.kitchen:11:10',
            roomLabelKey: 'room.kitchen.name',
            tile: { x: 11, y: 10 },
            objectLabelKey: 'object.stove.name',
            missingQuantity: 1,
          },
          {
            kind: 'object',
            instanceId: 'room.kitchen:11:10',
            roomLabelKey: 'room.kitchen.name',
            tile: { x: 11, y: 10 },
            objectLabelKey: 'object.prep-counter.name',
            missingQuantity: 2,
          },
          {
            kind: 'object',
            instanceId: 'room.kitchen:11:10',
            roomLabelKey: 'room.kitchen.name',
            tile: { x: 11, y: 10 },
            objectLabelKey: 'object.fridge.name',
            missingQuantity: 3,
          },
        ],
      }),
    );
    const many = await probe();
    expect(many.needsCountText).toBe('2 of 4');
    expect(many.needsTotal).toBe('5');
    expect(many.needsLineText).toBe('Kitchen at 11, 10 is missing');
    expect(many.needsItemText).toEqual(['1 × Stove', '2 × Prep Counter', '3 × Fridge']);
    /*
     * The block at its deepest draws all four of its lines rather than clipping
     * them: **measured at 100px** for the header, the room line and three object
     * lines. The floor asserted is well under that on purpose -- what this
     * guards is a block that has collapsed to nothing, not the exact figure,
     * which legitimately moves with any restyle of the lines inside it.
     *
     * Whether 100px *fits the rail* is a different question and is not this
     * suite's to answer: the harness leaves the rail's aside slot empty, so
     * `.hud__aside:empty { display: none }` hands the panel the whole rail and a
     * fold measured here would be measured against a rail no player has.
     * `app-shell.spec.ts` answers that one, on the real page.
     */
    expect(many.needsHeight, 'the readout is too short to hold its four lines').toBeGreaterThan(60);
    /*
     * And the three chips are **one row**, which is the compression
     * `.hud-rooms__needs-items` exists for and is 13px of what pays for this
     * block. Asserted beside the height because the height alone cannot tell a
     * compressed row from a restyled one, and because the doorway case below
     * asserts the opposite of it (#938).
     */
    expect(many.needsItemRows, 'the object chips no longer share a row').toBe(1);

    /*
     * 5. **A shortfall the simulation could not count.** `missingQuantity` is
     *    absent whenever the projection was handed no placed objects to count,
     *    and the line must then carry no numeral at all rather than a plausible
     *    "1 ×". A number here would dress an uncounted answer as a counted one,
     *    on the same line, in the same words, with nothing to tell them apart.
     */
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 1,
        totalRooms: 1,
        totalNeeds: 1,
        atCapacity: [],
        needs: [
          {
            kind: 'object',
            instanceId: 'room.cell:0:0',
            roomLabelKey: 'room.cell.name',
            tile: { x: 0, y: 0 },
            objectLabelKey: 'object.bed.name',
          },
        ],
      }),
    );
    const uncounted = await probe();
    expect(uncounted.needsLineText).toBe('Cell at 0, 0 is missing');
    expect(uncounted.needsItemText).toEqual(['Bed']);

    // 6. A requirement whose object the catalogue does not define -- which is
    // *why* the projection can never call it satisfied. The line still says
    // something rather than trailing off into a blank.
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 1,
        totalRooms: 1,
        totalNeeds: 1,
        atCapacity: [],
        needs: [
          { kind: 'object', instanceId: 'room.cell:0:0', roomLabelKey: 'room.cell.name', tile: { x: 0, y: 0 }, missingQuantity: 1 },
        ],
      }),
    );
    expect((await probe()).needsItemText).toEqual(['1 × something this build cannot name']);

    /*
     * 7. **A room nobody can get into** -- issue #938, and the one line in this
     *    block that is not about an object.
     *
     *    The state it renders was invisible to every readout a player had: the
     *    room's object requirements were satisfied, so this block drew nothing,
     *    and the enclosure readout above said "Walled in on every side" for a
     *    working room and a dead one alike. The integration measurement is
     *    `tests/integration/dead-room-no-doorway.test.ts` -- hygiene 0 against
     *    the ceiling, on the same seed with one edge different.
     *
     *    Asserted three ways because each could be wrong on its own: the
     *    sentence, so the wording is pinned where the harmonising pass can find
     *    it; `data-kind`, so the branch is proven rather than the text; and the
     *    header's own figures, so a doorway counts as one thing the room is
     *    short exactly as an object does.
     */
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 1,
        totalRooms: 3,
        totalNeeds: 1,
        atCapacity: [],
        needs: [
          {
            kind: 'doorway',
            instanceId: 'room.shower-room:26:1',
            roomLabelKey: 'room.shower-room.name',
            tile: { x: 26, y: 1 },
          },
        ],
      }),
    );
    const doorway = await probe();
    expect(doorway.needsLaidOut, 'a room nobody can enter must earn the block').toBe(true);
    expect(doorway.needsLineText).toBe('Shower Room at 26, 1 is missing');
    expect(doorway.needsItemText).toEqual(['a door — nobody can get in']);
    expect(doorway.needsItemKinds).toEqual(['doorway']);
    expect(doorway.needsUnfinished).toBe('1');
    expect(doorway.needsTotal).toBe('1');
    expect(doorway.needsCountText).toBe('1 of 3');
    await expectLaidOut(page, '.hud-rooms__needs', 'the readout for a room with no way in');

    /*
     * 8. **The doorway line and the object lines in one room**, which is the
     *    ordering `roomNeedsFromProjections` chooses and the reason it does:
     *    `ROOM_NEEDS_NAMED_LIMIT` is 4, and the door is the line that makes the
     *    others pointless, because nothing can be carried into a room nobody
     *    can enter.
     */
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 1,
        totalRooms: 3,
        totalNeeds: 2,
        atCapacity: [],
        needs: [
          { kind: 'doorway', instanceId: 'room.cell:12:4', roomLabelKey: 'room.cell.name', tile: { x: 12, y: 4 } },
          {
            kind: 'object',
            instanceId: 'room.cell:12:4',
            roomLabelKey: 'room.cell.name',
            tile: { x: 12, y: 4 },
            objectLabelKey: 'object.bed.name',
            missingQuantity: 1,
          },
        ],
      }),
    );
    const both = await probe();
    expect(both.needsItemText).toEqual(['a door — nobody can get in', '1 × Bed']);
    expect(both.needsItemKinds).toEqual(['doorway', 'object']);
    expect(both.needsTotal).toBe('2');
    /*
     * **Two rows, and the sentence has the first to itself.** Both of these
     * lines fit one row at this panel's width -- 152.5px and 44.5px in a 238px
     * box -- so nothing about the text forces the break;
     * `.hud-rooms__needs-item[data-kind='doorway']`'s `flex-basis: 100%` does,
     * and that is the point. Without it the readout drew
     * "a door — nobody can get in   1 × Bed" as one line and pushed the *last*
     * chip onto a row of its own, which is a list broken in the middle rather
     * than a sentence over a list. Measured on the assembled page in the #331
     * fixture: both items reported the same top of 413.4 and `1 × Toilet` sat
     * alone at 426.6.
     *
     * It is also what bounds the block: with the sentence on its own row the
     * chips compress under it, so every shape the shipped catalogue can
     * produce is exactly two rows -- which is the figure `hud.css`'s catalogue
     * donation is sized against.
     */
    expect(both.needsItemRows, 'the doorway sentence shares a row with an object chip').toBe(2);

    // 9. And it goes away again when the answer changes back, rather than
    // leaving the last sentence standing over a prison it no longer describes.
    // The item lines go with it: they are rebuilt from the model on every paint,
    // so a stale one left behind would be a readout describing a finished room.
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({ unfinishedRooms: 0, totalRooms: 1, totalNeeds: 0, needs: [], atCapacity: [] }),
    );
    const cleared = await probe();
    expect(cleared.needsLaidOut).toBe(false);
    expect(cleared.needsLineText).toBe('');
    expect(cleared.needsItemText).toEqual([]);
    expect(cleared.needsUnfinished).toBe('');
  });

  test('says when a finished room is full, and says it in the same block (ADR 0028 phase 5)', async ({ page }) => {
    // The other thing a room can be wrong about, and the one no readout could
    // say before: it holds every object its definition asks for and it is
    // refusing arrivals, because the concurrent-use ceiling ADR 0028 derives
    // from those objects has been reached. Issue #1003 measured it on a shower
    // room -- two heads is a ceiling of two, whatever the floor area.
    //
    // The verdict is `projectRoomList`'s, carried by
    // `HudRoomNeedsViewModel.atCapacity`; what is proven here is the panel's
    // half, which is which subject the one block draws and what it then says.
    const probe = async () => page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    const FULL_SHOWER = {
      instanceId: 'room.shower-room:4:6',
      roomLabelKey: 'room.shower-room.name',
      tile: { x: 4, y: 6 },
      places: 2,
      inUse: 2,
    } as const;

    // 1. Every room finished, one of them full. The block that would otherwise
    // be absent draws its second subject.
    await page.evaluate(
      (full) =>
        window.lockstateUiHarness.reportRoomNeeds({
          unfinishedRooms: 0,
          totalRooms: 3,
          totalNeeds: 0,
          needs: [],
          atCapacity: [full],
        }),
      FULL_SHOWER,
    );
    const full = await probe();
    expect(full.needsLaidOut, 'a room turning prisoners away must earn the block').toBe(true);
    expect(full.needsLabelText).toBe('At capacity');
    expect(full.needsCountText).toBe('1 of 3');
    expect(full.needsLineText).toBe('Shower Room at 4, 6 is full');
    expect(full.needsItemText).toEqual(['places in use: 2 of 2']);
    // Read as data as well as as text, so telling this line from `1 × Bed`
    // does not depend on the English locale.
    expect(full.needsItemKinds).toEqual(['at-capacity']);
    expect(full.needsFull).toBe('1');
    // The unfinished subject's own figures must be absent rather than zero: a
    // finished room may not be counted as unfinished anywhere.
    expect(full.needsUnfinished).toBe('');
    expect(full.needsTotal).toBe('');
    // And the catalogue's floor is donated on this subject too, which is what
    // keeps the block inside the panel's fold.
    expect(full.panelFull).toBe('1');
    expect(full.panelNeeds).toBe('');

    // 2. One room unfinished as well. The block goes back to the unfinished
    // subject, which is the priority `roomNeedsSubjectOf` documents and the
    // cost it names: the shower room says nothing until the cell is finished.
    await page.evaluate(
      (full) =>
        window.lockstateUiHarness.reportRoomNeeds({
          unfinishedRooms: 1,
          totalRooms: 3,
          totalNeeds: 1,
          needs: [
            {
              kind: 'object',
              instanceId: 'room.cell:2:2',
              roomLabelKey: 'room.cell.name',
              tile: { x: 2, y: 2 },
              objectLabelKey: 'object.bed.name',
              missingQuantity: 1,
            },
          ],
          atCapacity: [full],
        }),
      FULL_SHOWER,
    );
    const both = await probe();
    expect(both.needsLabelText).toBe('Not ready');
    expect(both.needsLineText).toBe('Cell at 2, 2 is missing');
    expect(both.needsItemKinds).toEqual(['object']);
    expect(both.needsFull, 'the two subjects must not be drawn together').toBe('');
    expect(both.panelFull).toBe('');
    expect(both.panelNeeds).toBe('1');

    /*
     * The layout claim, measured rather than argued: the at-capacity shape is a
     * header, a room line and **one** item line, so it can never cost the panel
     * more than the unfinished shape, which reaches three item lines. That is
     * the whole of why `hud.css`'s donation rule could take a second attribute
     * without the fold moving, and `roomNeedsSubjectOf` is what keeps the two
     * from being added together.
     */
    expect(full.needsHeight).toBeLessThanOrEqual(both.needsHeight);
    expect(full.needsHeight, 'the block drew nothing at all, so this comparison is empty').toBeGreaterThan(0);

    // 3. Nothing unfinished and nothing full: the block goes away entirely,
    // and takes the header it was last drawing with it.
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 0,
        totalRooms: 3,
        totalNeeds: 0,
        needs: [],
        atCapacity: [],
      }),
    );
    const calm = await probe();
    expect(calm.needsLaidOut).toBe(false);
    expect(calm.needsItemText).toEqual([]);
    expect(calm.needsFull).toBe('');
    expect(calm.panelFull).toBe('');
    expect(await page.locator('.hud-rooms').innerText()).not.toContain('At capacity');
  });

  test('says on the status strip that a room is not ready, on the tab the game opens on (#1006 finding 1)', async ({
    page,
  }) => {
    /*
     * The defect, measured by play-test on 2026-09-05: `hud.rooms.needs-doorway`
     * is true, fires at the earliest possible moment and survives a reload --
     * and it has exactly one render site, `.hud-rooms`, which is not laid out at
     * all while any other tab is showing. Eight game days sat on OVERVIEW
     * produced two messages, neither about the door, while the strip read
     * `1 ROOMS` with no qualifier and the panel behind the tab read
     * `NOT READY 1 of 1`.
     *
     * This is asserted in a browser and not only in `ui-hud-projection.test.ts`
     * because the projection is only half of the claim. The other half is that
     * the element is *laid out* on a tab where `.hud-rooms` is not -- which is
     * the whole finding, and which no `node`-environment test can see.
     */
    const badge = page.locator('.ui-stat[data-metric="rooms"] .ui-badge');
    const roomsPanel = page.locator('.hud-rooms');

    // 1. Nothing has been asked: no badge. A chip reading `0 not ready` would be
    //    a claim about a prison nothing is answering for.
    await page.evaluate(() => window.lockstateUiHarness.reportRoomNeeds(undefined));
    await expect(badge).toHaveCount(0);

    // 2. Every room is ready: still no badge, and a different fact from the one
    //    above -- `prisonersWithoutBedBadge`'s rule, that a strip which is
    //    always amber teaches players to ignore amber.
    await page.evaluate(() =>
      // `totalRooms` matches the strip's own room count in this fixture (61),
      // so the two readouts describe one prison rather than two.
      window.lockstateUiHarness.reportRoomNeeds({ unfinishedRooms: 0, totalRooms: 61, totalNeeds: 0, needs: [], atCapacity: [] }),
    );
    await expect(badge).toHaveCount(0);

    /*
     * 3. A room with no way into it. The needs entry is the doorway one on
     *    purpose: it is the state the play-test was in, and the state every
     *    other readout a player has is silent about.
     */
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 1,
        totalRooms: 61,
        totalNeeds: 1,
        needs: [
          { kind: 'doorway', instanceId: 'room.cell:12:4', roomLabelKey: 'room.cell.name', tile: { x: 12, y: 4 } },
        ],
        atCapacity: [],
      }),
    );
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveAttribute('data-tone', 'warning');
    await expect(badge.locator('.ui-badge__text')).toHaveText('1 not ready');

    /*
     * 4. **And now the finding.** Leave the Rooms tab for the one the game
     *    opens on. The panel loses its box entirely -- which is the defect --
     *    and the badge keeps its own, on the strip, where it is laid out at
     *    every tab and every viewport.
     */
    await page.evaluate(() => window.lockstateUiHarness.clickTab('overview'));
    // Measured rather than read off `hidden`: `.hud-rooms` carries the
    // attribute, and what the play-test recorded is that the panel has no box
    // -- so nothing inside it can reach a player, whatever the DOM holds.
    expect(
      await roomsPanel.evaluate((node) => node.getClientRects().length),
      'the Rooms panel still has a box on OVERVIEW, so this test is not measuring the defect',
    ).toBe(0);
    await expect(badge).toHaveCount(1);
    await expect(badge.locator('.ui-badge__text')).toHaveText('1 not ready');
    expect(
      await badge.evaluate((node) => node.getClientRects().length > 0),
      'the badge is in the DOM on OVERVIEW and has no box, which is the defect one element over',
    ).toBe(true);

    // 5. The chip itself is untouched: it still counts rooms, and it is not
    //    toned as well, so one fact reaches the player through one channel.
    await expect(page.locator('.ui-stat[data-metric="rooms"] .ui-stat__value')).toHaveText('61');
    expect(await page.locator('.ui-stat[data-metric="rooms"]').getAttribute('data-tone')).toBeNull();
  });

  test('hands the pointer back when the player leaves the tab', async ({ page }) => {
    // A tool that stayed armed behind a hidden panel would swallow every click
    // on a world the player thought they were only looking at.
    await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
    await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

    const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
    expect(intents).toContain(
      JSON.stringify({ kind: 'arm-room-tool', armed: false, roomId: 'room.cell', removing: false }),
    );
  });

  test('shows the live area as the pointer moves, without holding it pending', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.hoverWorldRoom({ x: 1, y: 2, width: 6, height: 6 }));

    const hovering = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(hovering.areaText).toBe('6 × 6 tiles at 1, 2');
    expect(hovering.areaLaidOut, 'the area readout has no box while it has a rectangle to report').toBe(true);
    expect(hovering.confirmLaidOut, 'a hover is not a finished gesture').toBe(false);

    await page.evaluate(() => window.lockstateUiHarness.hoverWorldRoom(undefined));
    const idle = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
    expect(idle.areaText).toBe('Nothing selected');
    // And it folds, which is the half the sentence above cannot state.
    expect(idle.areaLaidOut, 'the area readout keeps a box with nothing to report').toBe(false);
  });

  /**
   * The two readouts that have nothing to say fold, and the panel says so on
   * itself when the needs readout has a box (#529, the layout half).
   *
   * ### What was wrong
   *
   * `Area / Nothing selected` and `Enclosure / Not evaluated yet` are 20px and
   * 14.3px of placeholder, and they were drawn in every state including the one
   * where the panel has something real to say. Measured on the assembled
   * application at 900x600, Rooms tab, two unfinished cells: the panel body was
   * **54px past its own box** and `app-shell.spec.ts`'s #331 test failed on it
   * in CI. `rooms-panel.ts` had already recorded what that panel had to spend --
   * *"the panel body affords 32px at 1280x720 and 0px at 900x600"* -- so nothing
   * could be added to it at all until something was given back.
   *
   * ### Why it is asserted here and measured there
   *
   * The pixels are a property of the assembled page: this harness hands the
   * panel 128.7px more rail than the application ever does, so a fold assertion
   * written here would pass over a panel that was 54px over in the real thing.
   * `app-shell.spec.ts` owns the measurement -- it is the test that caught this
   * -- and what this file owns is the *behaviour* the measurement depends on:
   * which of the two blocks has a box in which state, and that the panel
   * publishes `data-needs` for the stylesheet to spend the catalogue's floor on.
   *
   * A `laidOut` probe rather than the attribute, deliberately: `hud.css` gives
   * both blocks an author `display: flex` behind a `:not([hidden])` guard, and
   * an author declaration beats the `display: none` a user agent gives
   * `[hidden]`. A test that read `.hidden` would agree with a stylesheet whose
   * guard had been dropped and which was painting the placeholder anyway --
   * which is exactly what the first attempt at this change did, and what
   * measuring the box instead of the attribute caught.
   */
  test('the readouts with nothing to report fold, and the panel says when the needs block has a box', async ({
    page,
  }) => {
    const probe = async () => page.evaluate(() => window.lockstateUiHarness.roomsProbe());

    // 1. On arrival: no rectangle drawn and no room evaluated, so neither
    //    readout has a box -- and both still carry their honest sentence, so
    //    the block reads correctly the instant it comes back.
    const fresh = await probe();
    expect(fresh.areaLaidOut, 'the area readout has a box before anything is drawn').toBe(false);
    expect(fresh.areaText).toBe('Nothing selected');
    expect(fresh.enclosureLaidOut, 'the enclosure readout has a box before anything is evaluated').toBe(false);
    expect(fresh.enclosureText).toBe('Not evaluated yet');
    expect(fresh.panelNeeds, 'the panel claims a needs readout before one arrived').toBe('');

    // 2. A rectangle brings the area readout back and leaves the enclosure one
    //    folded: drawing a rectangle is not the simulation evaluating it.
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 3, y: 4, width: 5, height: 5 }));
    const drawn = await probe();
    expect(drawn.areaLaidOut).toBe(true);
    expect(drawn.areaText).toBe('5 × 5 tiles at 3, 4');
    expect(drawn.enclosureLaidOut, 'a drawn rectangle is not an evaluated room').toBe(false);

    // 3. And a verdict brings the enclosure readout back.
    await page.evaluate(() =>
      window.lockstateUiHarness.reportZoning({ sequence: 1, enclosure: 'sealed', requirement: 'enclosed' }),
    );
    const evaluated = await probe();
    expect(evaluated.enclosureLaidOut).toBe(true);
    // The wording changed in #1006 finding 2; what this case is about is that
    // a verdict brings the block back, which is unaffected.
    expect(evaluated.enclosureText).toBe('Walled in — not a door check');

    // 4. `data-needs` follows the readout and carries the figure, so the
    //    stylesheet spends the catalogue's floor on a block that is really
    //    there rather than on one that was there a paint ago.
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({
        unfinishedRooms: 2,
        totalRooms: 2,
        totalNeeds: 4,
        atCapacity: [],
        needs: [
          {
            kind: 'object',
            instanceId: 'room.cell:12:4',
            roomLabelKey: 'room.cell.name',
            tile: { x: 12, y: 4 },
            objectLabelKey: 'object.bed.name',
            missingQuantity: 1,
          },
        ],
      }),
    );
    expect((await probe()).panelNeeds, 'the panel does not carry the needs total the readout was given').toBe(
      '4',
    );

    // A prison with nothing missing draws no readout, so it must donate
    // nothing either -- the catalogue's row comes back with the last cell.
    await page.evaluate(() =>
      window.lockstateUiHarness.reportRoomNeeds({ unfinishedRooms: 0, totalRooms: 2, totalNeeds: 0, needs: [], atCapacity: [] }),
    );
    expect((await probe()).panelNeeds, 'a finished prison still spends the catalogue floor').toBe('');
  });

  test('renders no unresolved message key anywhere in the panel', async ({ page }) => {
    // ADR 0011's own failure mode: an unresolved key renders as itself, which is
    // visible and obviously wrong -- and only if something looks.
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 0, y: 0, width: 2, height: 3 }));
    await page.evaluate(() =>
      window.lockstateUiHarness.reportZoning({ sequence: 1, enclosure: 'open', requirement: 'enclosed' }),
    );

    const text = await page.locator('.hud-rooms').innerText();
    expect(text.length, 'the panel rendered nothing at all').toBeGreaterThan(20);
    expect(text, `an unresolved message key is on screen: ${text}`).not.toMatch(/\bhud\.[a-z0-9.-]+/);
    expect(text).not.toMatch(/\broom\.[a-z0-9.-]+\.name\b/);
  });

  test('keeps the last control inside the panel at every viewport, 900x600 included', async ({ page }) => {
    // **The measurement the owner's decision rests on.** The Build panel's
    // always-visible budget at 900x600 is 7.81px -- the corrected figure; it read
    // 11.82px before #174's second half, of which 4px was overlap rather than
    // space -- and this surface needs a confirm row, a removal control, a
    // too-small warning and an enclosure readout. On the aside it gets a 291.2px
    // body instead, and this is the assertion that the panel actually fits in it.
    //
    // The number that decides it is the *last block's* bottom edge against the
    // panel's fold. A floor that is too small pushes the status block past the
    // fold rather than clipping it visibly, so a screenshot would not show it and
    // a page that failed to load would report plausible, meaningless geometry --
    // which is why the panel's own layout is asserted first.
    for (const [width, height] of ROOMS_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('zones'));

      const probe = await page.evaluate(() => window.lockstateUiHarness.roomsLayoutProbe());
      const panel = probe.panel;
      expect(panel, `the Rooms panel has no box at ${width}x${height}`).not.toBeNull();
      if (panel === null) continue;
      expect(panel.height, `the Rooms panel is not laid out at ${width}x${height}`).toBeGreaterThan(100);
      expect(probe.status, `the panel's last block has no box at ${width}x${height}`).not.toBeNull();

      // Nothing has scrolled anything: this is the state the panel arrives in.
      expect(probe.panelScrollTop, `the Rooms panel is pre-scrolled at ${width}x${height}`).toBe(0);
      expect(
        probe.lastControlBottom,
        `the enclosure readout is below the Rooms panel's fold at ${width}x${height}: it ends at y=${probe.lastControlBottom} in a panel clipped at y=${probe.panelVisibleBottom}`,
      ).toBeLessThanOrEqual(probe.panelVisibleBottom);
      expect(
        probe.lastControlBottom,
        `the last control is off the bottom of the viewport at ${width}x${height}`,
      ).toBeLessThanOrEqual(height);
      // The body may never be shorter than its own content: that is the failure
      // #174 measured on the Build panel, where a floor missing one term let a
      // block paint outside its own box.
      expect(probe.bodyOverflow, `the Rooms panel body is shorter than its content at ${width}x${height}`)
        .toBeLessThanOrEqual(0);
      // And the excess went to the catalogue, which is the mechanism the last
      // block staying put depends on. Eighteen rooms -- three in the harness --
      // against a one-row floor, so the list is the thing that scrolls.
      expect(probe.listOverflow, `the room list absorbed nothing at ${width}x${height}`).toBeGreaterThanOrEqual(0);
    }
  });
});

/**
 * **The Regime panel on the fifth tab (issue #451).**
 *
 * What is *not* here is the shape of it. Which word goes in which slot is
 * decided by four pure functions -- `describePrisonerRow`,
 * `formatPrisonerName`, `formatPrisonerActivity` and `formatRegimeAllowsText`
 * -- and every one of them is exported from `roster-panel.ts` precisely so
 * `pnpm test` can own that decision at the lowest layer, which
 * `docs/TESTING.md` requires. Restating their answers here would buy nothing
 * and would go stale twice.
 *
 * Four questions are left over, and a real browser is the only thing that can
 * answer any of them:
 *
 * 1. **Which of the rail panels has a box.** `.hud__side` holds six panels in
 *    one slot and `setVisible` swaps them with `hidden`; if two were ever laid
 *    out together one panel's height would pay for the other's, which is the
 *    overflow ADR 0022 refused. **Since 2026-09-14 exactly one pair is laid
 *    out together on purpose** -- the Intake and Staff panels, on the Manage
 *    tab -- and that pair cost the 42px `hud.css`'s `.ui-panel.hud-intake`
 *    rule records, which is what the sentence before it predicted would
 *    happen and did. That claim is asserted on every tab in
 *    "never shares the rail slot ..." above, where the list of occupants lives.
 *    Here it is only the arrival condition each test below needs.
 * 2. **Whether a line the panel hid is on screen anyway.** Under
 *    `@media (max-height: 700px)` `hud.css` gives `.hud-regime__note` an author
 *    `display: -webkit-box` to clamp it to one line, and an author `display`
 *    beats the user agent's `[hidden] { display: none }` -- the trap
 *    `.hud-build__deliveries-more` carries its extra class for. 900x600 is the
 *    one viewport this suite visits that is short enough for that clamp, so
 *    "the empty-prison sentence goes away once somebody is admitted" is a claim
 *    that holds for free at four of the five and has to be measured at the
 *    fifth. Before `.hud-regime__note[hidden]` landed it failed there, with the
 *    sentence on screen under four prisoners.
 * 3. **What text actually reached the screen.** The roster's rows are pooled:
 *    `PRISONER_ROSTER_ROW_LIMIT` of them exist from the first paint and a
 *    shorter reply hides the tail rather than removing it, so `textContent`
 *    keeps every prisoner who has ever been in the window. Only `innerText` --
 *    a rendered read -- can say who is on the roster now, and it is the same
 *    read that catches an unresolved message key, which ADR 0011 renders as
 *    itself.
 * 4. **Where the bottom of it ends up.** This is the only panel in the rail
 *    whose height grows with the *population*, and it is `overflow-y: auto`, so
 *    a roster that does not fit is pushed below the fold rather than clipped
 *    visibly. A screenshot would not show it. The Rooms panel's own fold test
 *    above is this measurement on the panel that has one block of fixed height;
 *    this is it on the panel that has a list.
 */
test.describe('the Regime panel (issue #451)', () => {
  /**
   * The five viewports the browser suite visits, copied from `ROOMS_VIEWPORTS`
   * above rather than shared with it, for the reason that constant gives for not
   * sharing the Build panel's: it is scoped inside another describe, and
   * hoisting it would widen a constant three unrelated suites would then own.
   *
   * One of the five -- 900x600 -- is 700px tall or shorter, which is what makes
   * the `.hud-regime__note` clamp reachable at all, and it is the tightest of
   * the five in every other respect too.
   */
  const REGIME_VIEWPORTS = [
    [1280, 720],
    [1440, 900],
    [1024, 768],
    [900, 600],
    [375, 812],
  ] as const;

  /**
   * One tick of `projectStatusStrip`'s `regime` entry, as
   * `src/ui/simulation-regime.ts` hands it over.
   *
   * The two groups the simulation declares, with the shapes that differ: the
   * general population's block allows three categories and the high-risk one
   * allows a single category, so the joined sentence is exercised with and
   * without a separator in it.
   */
  const TIMETABLE: HudRegimeViewModel = {
    groups: [
      {
        classificationGroupId: 'general-population',
        labelKey: 'classification-group.general-population.name',
        allowedCategoryLabelKeys: [
          'action-category.recreation.name',
          'action-category.hygiene.name',
          'action-category.free-association.name',
        ],
        blockProgressPercent: 42,
        startTickOfDay: 1_200,
        allowedCategoryIds: ['recreation', 'hygiene', 'free-association'],
      },
      {
        classificationGroupId: 'high-risk',
        labelKey: 'classification-group.high-risk.name',
        allowedCategoryLabelKeys: ['action-category.hygiene.name'],
        blockProgressPercent: 42,
        startTickOfDay: 1_200,
        allowedCategoryIds: ['hygiene'],
      },
    ],
  };

  /**
   * A full window on a prison of nine, as `prisonerRosterFromProjection` builds
   * one.
   *
   * `PRISONER_ROSTER_ROW_LIMIT` is four, so four rows against a total of nine is
   * the state where every block of the panel is drawn at once: rows, the "N of
   * M" figure and the "and N more" line, with the empty sentence hidden. Each
   * row is a different branch of the panel's rules -- a classified prisoner
   * walking to a named action, a high-risk one performing one, one still in
   * intake with neither a name nor a group, and one classified at the bottom
   * tier -- and the third is the one the raw-key check below needs: it is the
   * only row whose badge word comes out of `intake-stage` and whose name comes
   * out of `hud.regime.roster-unnamed`.
   *
   * ### The four `lowestNeed` values are four branches of the bar, not filler
   *
   * `permille: 200` is the level the state's line sits on exactly
   * (`STATE_INCOME_UNMET_NEED_LEVEL` is 51 of `NEED_MAX` 255, and 51/255 is
   * a fifth to the digit), and rows 1 and 3 straddle it: 200 with
   * `unmetForStateIncome: true` and 204 -- the very next level, 52 -- with
   * `false`. A panel that drew the tone off the wrong side of the comparison
   * would repaint one of the two and be caught. Row 2 is the floor a need with
   * no route at all falls to, and row 4 is a fully served one.
   *
   * **These flags are supplied, not derived, and that is the limit of what this
   * file can prove.** `HudPrisonerRosterViewModel` is what the panel is *told*;
   * whether the flag agrees with the money is a question about
   * `prisonerRosterFromProjection` and `projectPrisonerRoster`, and it is asked
   * where those can be run -- `tests/unit/regime-need-bar.test.ts` and
   * `tests/integration/prisoner-roster-readout.test.ts`. What this file proves
   * is that the panel renders the flag it was given, which is the half that
   * needs a browser.
   */
  const ROSTER: HudPrisonerRosterViewModel = {
    total: 9,
    everAdmitted: true,
    rows: [
      {
        entityId: 3,
        name: { givenName: 'Mara', familyName: 'Ostrowska' },
        activityLabelKey: 'action.shower.name',
        travelling: true,
        standingLabelKey: 'risk-tier.1.name',
        classificationGroupId: 'general-population',
        riskTier: 1,
        lowestNeed: { needId: 'hunger', labelKey: 'need.hunger.name', permille: 200, unmetForStateIncome: true },
      },
      {
        entityId: 5,
        name: { givenName: 'Delphine', familyName: 'Vanderweghe' },
        activityLabelKey: 'action.yard-recreation.name',
        travelling: false,
        standingLabelKey: 'risk-tier.3.name',
        classificationGroupId: 'high-risk',
        riskTier: 3,
        lowestNeed: { needId: 'hygiene', labelKey: 'need.hygiene.name', permille: 0, unmetForStateIncome: true },
      },
      {
        entityId: 8,
        activityLabelKey: 'action-phase.idle.name',
        travelling: false,
        standingLabelKey: 'intake-stage.classification.name',
        lowestNeed: { needId: 'bladder', labelKey: 'need.bladder.name', permille: 204, unmetForStateIncome: false },
      },
      {
        entityId: 11,
        name: { givenName: 'Tomasz', familyName: 'Wiśniewski' },
        activityLabelKey: 'action.free-association.name',
        travelling: false,
        standingLabelKey: 'risk-tier.0.name',
        classificationGroupId: 'general-population',
        riskTier: 0,
        lowestNeed: { needId: 'recreation', labelKey: 'need.recreation.name', permille: 1000, unmetForStateIncome: false },
      },
    ],
  };

  /** The prison a new game starts in: asked, and holding nobody, and nobody ever has been. */
  const EMPTY_ROSTER: HudPrisonerRosterViewModel = { total: 0, everAdmitted: false, rows: [] };

  /**
   * Issue #506: the same shape `EMPTY_ROSTER` has -- `total: 0` -- but a
   * different history. `projectPrisonerRoster` sets `everAdmitted` from
   * `admittedCount`, which every real admission increments and nothing ever
   * decrements (`prisoner-projection.ts`), so this is the state a live
   * session reaches once every prisoner it has held has been discharged --
   * not a state this file invents for the panel to react to.
   *
   * It used to say "admitted together and later discharged together
   * (`ADMISSION_REQUEST`'s fixed `sentenceLengthTicks`, ADR 0050 'What this
   * does not decide')". Since #535 decision 5 the length is drawn per
   * prisoner, so they leave over a spread instead of at once; the reachable
   * state this view model stands for is unchanged, and only the story of how a
   * session gets there is.
   */
  const DISCHARGED_ROSTER: HudPrisonerRosterViewModel = { total: 0, everAdmitted: true, rows: [] };

  /**
   * The same prison after eight of the nine have gone: one row, and three
   * pooled rows that must stop showing the people who were in them.
   */
  const SOLO_ROSTER: HudPrisonerRosterViewModel = { total: 1, everAdmitted: true, rows: ROSTER.rows.slice(0, 1) };

  /**
   * One prisoner at each of the four risk tiers -- the fixture the owner's
   * ruling of 2026-09-02 on issue #788 needs and `ROSTER` above does not
   * contain.
   *
   * `ROSTER` holds tiers 1, 3, an intake row and tier 0, which is four
   * branches of the *panel* and only three of the *ladder*: it has no tier-2
   * row at all, so no assertion over it could have caught `Medium` reading in
   * `Minimal`'s colour. This is the same four rows re-tiered, which is what
   * `PRISONER_ROSTER_ROW_LIMIT` (four) leaves room for exactly.
   *
   * The groups are the ones `classificationGroupIdForTier` would actually
   * write -- `'general-population'` for 0, 1 and 2, `'high-risk'` for 3 -- and
   * that is the half of the pairing that matters here: the tier-2 row's group
   * is the *ordinary* one, so a tone visible on it is a tone that did not
   * require ADR 0090's early warning to move a group it is capped precisely to
   * never move.
   *
   * Rows are in descending-tier order, which is the order
   * `projectPrisonerRoster` publishes (#703 ruling 4), so the probe's row
   * indices read High, Medium, Low, Minimal.
   */
  const TIER_LADDER_ROSTER: HudPrisonerRosterViewModel = {
    total: 4,
    everAdmitted: true,
    rows: ([3, 2, 1, 0] as const).map((riskTier) => ({
      entityId: 20 + riskTier,
      name: { givenName: 'Ada', familyName: `Tier${String(riskTier)}` },
      activityLabelKey: 'action.free-association.name',
      travelling: false,
      standingLabelKey: `risk-tier.${String(riskTier)}.name` as const,
      classificationGroupId: riskTier >= 3 ? 'high-risk' : 'general-population',
      riskTier,
      lowestNeed: { needId: 'recreation', labelKey: 'need.recreation.name', permille: 1000, unmetForStateIncome: false },
    })),
  };

  /**
   * The window that does **not** hold the prisoner `ROSTER`'s first row names
   * (issue #895).
   *
   * The same prison of nine, three rows of it, and prisoner 3 is not among
   * them -- which is the state a selected prisoner reaches without being
   * released: somebody riskier arrives, and the four-row window is the four
   * *highest tier* prisoners since #703. The projection will still answer about
   * them, so the inspector must not go away with the row.
   */
  const WITHOUT_FIRST_ROSTER: HudPrisonerRosterViewModel = {
    total: 9,
    everAdmitted: true,
    rows: ROSTER.rows.slice(1),
  };

  /**
   * All six needs of one prisoner, as `prisonerDetailFromProjection` builds
   * them (issue #895).
   *
   * `NEED_IDS` order, which is the projection's own and is not re-sorted by the
   * reader -- and the six values are six branches of the bar rather than
   * filler, on the same reasoning `ROSTER`'s four are: `permille: 200` is the
   * level the state's line sits on exactly
   * (`STATE_INCOME_UNMET_NEED_LEVEL` is 51 of `NEED_MAX` 255, and 51/255 is a
   * fifth to the digit) with `unmetForStateIncome: true`, and 204 -- the very
   * next level -- is `false`. A panel that drew a tone off the wrong side of
   * the comparison would repaint one of the pair and be caught.
   *
   * **Four of the six are unmet, which is the whole point of the block.** The
   * roster row for this prisoner shows `hunger` alone; the state withholds per
   * unmet need, so the row cannot distinguish this prisoner from one costing
   * the prison a single need's worth and these six lines can.
   *
   * Supplied rather than derived, and that is the limit of what this file can
   * prove: whether the flags agree with the money is a question about
   * `projectPrisonerDetail`, asked where it can be run
   * (`tests/unit/ui-simulation-prisoner-detail.test.ts`, against the real
   * projection over a real runtime). What this file proves is that the panel
   * renders the six it was given.
   */
  const DETAIL_FIRST: HudPrisonerDetailViewModel = {
    entityId: 3,
    remainingSentenceTicks: 3600,
    name: { givenName: 'Mara', familyName: 'Ostrowska' },
    standingLabelKey: 'risk-tier.1.name',
    classificationGroupId: 'general-population',
    riskTier: 1,
    needs: [
      { needId: 'hunger', labelKey: 'need.hunger.name', permille: 200, unmetForStateIncome: true },
      { needId: 'sleep', labelKey: 'need.sleep.name', permille: 204, unmetForStateIncome: false },
      { needId: 'hygiene', labelKey: 'need.hygiene.name', permille: 0, unmetForStateIncome: true },
      { needId: 'bladder', labelKey: 'need.bladder.name', permille: 120, unmetForStateIncome: true },
      { needId: 'safety', labelKey: 'need.safety.name', permille: 1000, unmetForStateIncome: false },
      { needId: 'recreation', labelKey: 'need.recreation.name', permille: 40, unmetForStateIncome: true },
    ],
  };

  /**
   * The same shape about a **different** prisoner, for the race the panel is
   * required to refuse: a reply that was in flight while the player moved to
   * another row.
   */
  const DETAIL_SECOND: HudPrisonerDetailViewModel = {
    ...DETAIL_FIRST,
    entityId: 5,
    remainingSentenceTicks: 7200,
    name: { givenName: 'Delphine', familyName: 'Vanderweghe' },
    standingLabelKey: 'risk-tier.3.name',
    classificationGroupId: 'high-risk',
    riskTier: 3,
  };

  /**
   * Every message namespace the panel can paint a raw key out of.
   *
   * ADR 0011 resolves an unknown key to the key itself, so a missing catalog
   * entry is on screen as `risk-tier.2.name` rather than as a blank. Seven
   * namespaces reach this panel: `hud` for its own vocabulary, and the seven the
   * projection derives an id into (`action`, `action-category`, `action-phase`,
   * `classification-group`, `intake-stage`, `need`, `risk-tier`) -- the panel
   * renders every one of them and authors none of them, which is exactly the
   * seam a label can go missing at.
   *
   * **`need` was missing from this pattern and the count read "seven
   * namespaces" while it listed six** (issue #895). The gap predates the
   * inspector: the roster row has drawn its worst need's word since #535
   * decision 6, so an unresolved `need.hunger.name` has been renderable and
   * unmatched here since then. Adding it extends the pattern rather than
   * weakening it, and it is the namespace the inspector draws six of.
   *
   * Case-insensitive, and that is not caution. Half this panel's slots are
   * eyebrows, which `.ui-eyebrow` in `primitives.css` renders
   * `text-transform: uppercase`, and
   * `innerText` reports the *transformed* text -- so an unresolved key in the
   * roster header arrives as `HUD.REGIME.ROSTER` and a case-sensitive pattern
   * would walk straight past it.
   */
  const RAW_KEY =
    /\b(?:hud|action|action-category|action-phase|classification-group|intake-stage|need|risk-tier)\.[a-z0-9.-]+/i;

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'));
  });

  test('arrives with a box and two empty blocks, because nothing has asked yet', async ({ page }) => {
    const probe = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());

    // The tab answers a tap with a panel, which it did not before #451.
    expect(probe.laidOut).toBe(true);
    expect(probe.panelBox?.height, 'the Regime panel has no height').toBeGreaterThan(0);
    // And the panel is the *chrome* only: nothing has been asked, so neither
    // block may claim a box. Both carry an author `display: flex` in `hud.css`,
    // which beats the user agent's `[hidden] { display: none }` -- so the
    // `[hidden]` guards beside them are the only thing making this true, and the
    // attribute cannot say whether they are working.
    expect(probe.blocksLaidOut, 'the timetable drew a box before anything asked for one').toBe(false);
    expect(probe.rosterLaidOut, 'the roster drew a box before anything asked for one').toBe(false);
    expect(probe.blocks).toEqual([]);
    expect(probe.rows).toEqual([]);
    expect(probe.total).toBeNull();
    // Not "0 prisoners" and not the empty-prison sentence: a session that has
    // said nothing must not have a claim about the prison made on its behalf.
    expect(probe.emptyLaidOut).toBe(false);
    expect(probe.text).not.toContain('No prisoners yet.');
    // Matched without regard to case: the panel header is an eyebrow, and
    // `innerText` carries the `text-transform: uppercase` the browser applied,
    // so what is on screen is "REGIME".
    expect(probe.text, 'the panel rendered no title').toMatch(/\bregime\b/i);
    expect(probe.text, `an unresolved message key is on screen: ${probe.text}`).not.toMatch(RAW_KEY);
  });

  test('an empty prison gets the sentence, which is the first thing a player reads here', async ({ page }) => {
    // A new game starts with nobody admitted, so this is the arrival state of
    // the tab for every player, and it is a *different fact* from the one above:
    // the roster block is drawn and says the prison is empty, rather than not
    // being drawn because nothing answered.
    await page.evaluate(
      ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
      [TIMETABLE, EMPTY_ROSTER] as const,
    );
    const probe = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());

    expect(probe.rosterLaidOut).toBe(true);
    expect(probe.total).toBe('0');
    expect(probe.rows).toEqual([]);
    expect(probe.emptyLaidOut, 'the empty prison drew a blank box instead of the sentence').toBe(true);
    // The ruled sentence, byte for byte: the owner's of 2026-09-03, corrected
    // in place on their ruling of 2026-09-19 so that it names all four of
    // `room.cell`'s requirements rather than only the bed (#933). It read
    // "Nobody has been admitted yet." before 2026-09-03; the state under test
    // is unchanged by either move.
    expect(probe.emptyText).toBe('No prisoners yet. Build a cell — big enough, walled all round, with a bed and a toilet in it — to take somebody in.');
    expect(probe.text).toContain('No prisoners yet. Build a cell — big enough, walled all round, with a bed and a toilet in it — to take somebody in.');
    // Nothing is being withheld: "and N more" is about a population bigger than
    // the window, and there is no population.
    expect(probe.moreLaidOut).toBe(false);
    // The timetable is still the prison's, whoever is in it -- the schedule is a
    // fact about the regime and not about the roster.
    expect(probe.blocksLaidOut).toBe(true);
    expect(probe.blocks.map((block) => block.group)).toEqual(['general-population', 'high-risk']);
    expect(probe.text, `an unresolved message key is on screen: ${probe.text}`).not.toMatch(RAW_KEY);
    expect(probe.everAdmitted, 'this is the true "nobody yet" state').toBe('false');
  });

  /**
   * **The owner's ruling of 2026-09-02 on issue #788, measured on the real
   * page.**
   *
   * `describePrisonerRow`'s own tests own the decision -- that is what
   * `roster-panel.ts` exports it for -- so what is left for a browser is the
   * half those cannot reach: **whether the tone is a colour**. A tone added to
   * `BadgeTone` with no `.ui-badge[data-tone=...]` rule beside it type-checks,
   * passes every node test, and paints `--badge-neutral-bg` on screen -- which
   * is this ruling's own defect reintroduced one layer down, and no assertion
   * over `data-tone` can see it, because the attribute is set either way.
   *
   * So the colours are read out of `getComputedStyle` rather than inferred
   * from the attribute. The distinctness assertions are over the *painted*
   * values; the attributes are asserted too, so a failure says which of the
   * two layers moved.
   */
  test('gives Medium a colour of its own on screen, distinct from Minimal’s and High’s (#788)', async ({ page }) => {
    await page.evaluate(
      ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
      [TIMETABLE, TIER_LADDER_ROSTER] as const,
    );
    const probe = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());

    // Four rows, and every one of them laid out -- `regimeProbe` filters to
    // rows with client rects, so a hidden pooled row cannot supply a tone.
    expect(probe.rows.map((row) => row.riskTier)).toEqual(['3', '2', '1', '0']);
    for (const row of probe.rows) expect(row.box?.height, `row ${row.riskTier} has no box`).toBeGreaterThan(0);

    const [high, medium, low, minimal] = probe.rows.map((row) => row.badgeTone);
    expect(medium, 'Medium reads in Minimal’s colour, which is the defect #788 names').not.toBe(minimal);
    expect(medium, 'Medium reads in High’s colour').not.toBe(high);
    expect(minimal, 'Minimal and Low are one tone, and that is unchanged').toBe(low);
    expect(probe.rows.map((row) => row.badgeTone)).toEqual(['warning', 'caution', 'neutral', 'neutral']);

    // **What the browser actually painted**, in the same row order. A tone with
    // no rule in `primitives.css` inherits `.ui-badge`'s own neutral pair, so
    // this is the assertion the attributes above cannot make.
    const painted = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row')]
        .filter((row) => row.getClientRects().length > 0)
        .map((row) => {
          const badge = row.querySelector<HTMLElement>('.ui-badge');
          if (badge === null) return null;
          const style = getComputedStyle(badge);
          return { color: style.color, background: style.backgroundColor };
        }),
    );

    expect(painted).toHaveLength(4);
    const [paintedHigh, paintedMedium, paintedLow, paintedMinimal] = painted;
    expect(paintedMedium?.color, 'Medium is painted in Minimal’s colour').not.toBe(paintedMinimal?.color);
    expect(paintedMedium?.background, 'Medium is painted on Minimal’s background').not.toBe(paintedMinimal?.background);
    expect(paintedMedium?.color, 'Medium is painted in High’s colour').not.toBe(paintedHigh?.color);
    expect(paintedMedium?.background, 'Medium is painted on High’s background').not.toBe(paintedHigh?.background);
    // Minimal and Low are one tone, so they must be one paint -- which is what
    // makes the three inequalities above a statement about the tones rather
    // than about four arbitrary badges.
    expect(paintedLow).toEqual(paintedMinimal);
    // And none of the four is transparent or unset, which is what a badge with
    // no rule at all would report.
    for (const paint of painted) {
      expect(paint?.color, 'a badge has no colour at all').toMatch(/^rgba?\(/);
      expect(paint?.background, 'a badge has no background at all').toMatch(/^rgba?\(/);
    }

    // The word is still beside the colour, so nothing here made the colour the
    // whole signal for a player who cannot see it. What is *still* missing is
    // the sentence: the badge has no `title` and no screen-reader text, which
    // is the copy half of #788 and the owner's under `AGENTS.md`'s fourth
    // exclusion.
    expect(probe.rows.map((row) => row.badgeText)).toEqual(['High', 'Medium', 'Low', 'Minimal']);

    // The pairing that proves ADR 0090's cap was not spent to get the colour:
    // the tier-2 row is on the ordinary timetable, and only the tier-3 row is
    // in the restricted group.
    expect(probe.rows.map((row) => row.classificationGroup)).toEqual([
      'high-risk',
      'general-population',
      'general-population',
      'general-population',
    ]);
    expect(probe.text, `an unresolved message key is on screen: ${probe.text}`).not.toMatch(RAW_KEY);
  });

  test('a prison everybody has left says so in its own sentence, not the new-prison one (issue #506)', async ({ page }) => {
    // Same `total: 0` as the test above, and the opposite history: five
    // prisoners were admitted, served their sentences -- one fixed sentence
    // each until #535 decision 5, a length drawn per prisoner since -- and
    // were all discharged (ADR 0050, "What this does not decide"), so the
    // population is back to
    // zero, and the empty-roster sentence would be false of it. There is
    // no shipped sentence that says the true thing instead (searched
    // `default-locale-en.ts`; see `roster-panel.ts`'s `paintRoster` comment),
    // so the panel is required to draw *neither* box rather than the wrong
    // one.
    //
    // **The sentence this refuses to draw is the owner's ruling of 2026-09-03,
    // corrected in place on 2026-09-19 to
    // "No prisoners yet. Build a cell — big enough, walled all round, with a bed and a toilet in it — to take somebody in.", and
    // was "Nobody has been admitted yet." when this test was written.** The
    // ruling makes this test's subject sharper rather than moving it: the new
    // sentence is false of this prison twice over -- it has held prisoners,
    // and the cell it tells the player to build is already standing.
    //
    // **REWRITTEN 2026-09-03, and the paragraph above is kept rather than
    // deleted because it is the argument this test now discharges.** The owner
    // ruled the missing sentence later the same day -- *"This prison is empty.
    // Take somebody in to start again."* -- so what this state draws is no
    // longer nothing. The subject is unchanged and the assertions get
    // *stronger*: this prison must not read the new-prison sentence, which is
    // still what a defect here would produce, and it must now read its own.
    // A test that only demanded silence would pass on a panel that had lost
    // the ability to say anything at all, which is exactly the state this
    // ruling ended.
    //
    // Both literals are typed out rather than read from
    // `defaultMessageCatalogEn`, per `docs/TESTING.md`: a fixture that supplies
    // both sides of the comparison asserts nothing about the wording, and one
    // specific ruled sentence is the whole subject.
    await page.evaluate(
      ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
      [TIMETABLE, DISCHARGED_ROSTER] as const,
    );
    const probe = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());

    expect(probe.rosterLaidOut).toBe(true);
    expect(probe.total).toBe('0');
    expect(probe.everAdmitted).toBe('true');
    expect(probe.rows).toEqual([]);
    // The one assertion this whole test exists for, in both directions now:
    // no sentence asserting non-admission over a prison that was, in fact,
    // fully used -- and the sentence that is true of it, present.
    expect(probe.text, 'drew the false "No prisoners yet" sentence').not.toContain('No prisoners yet.');
    expect(probe.emptyLaidOut, 'drew no sentence at all, which is the state the 2026-09-03 ruling ended').toBe(true);
    expect(probe.text).toContain('This prison is empty. Take somebody in to start again.');
    // Not being withheld either: a `total: 0` roster has nothing to page past.
    expect(probe.moreLaidOut).toBe(false);
    // The header still reads "0 of 0" -- a true statement about the present,
    // not a claim about history, and not what this test is about.
    expect(probe.countText).toBe('0 of 0');
    expect(probe.text, `an unresolved message key is on screen: ${probe.text}`).not.toMatch(RAW_KEY);
  });

  test('paints every row of a full window, and no raw message key anywhere in it', async ({ page }) => {
    await page.evaluate(
      ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
      [TIMETABLE, ROSTER] as const,
    );
    const probe = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());

    // Four rows drawn, in the projection's own order, and identified by the one
    // thing a label defect cannot get wrong.
    expect(probe.rows.map((row) => row.prisoner)).toEqual(['3', '5', '8', '11']);
    expect(probe.rosterLaidOut).toBe(true);
    expect(probe.total).toBe('9');
    expect(probe.countText).toBe('4 of 9');
    // Five of the nine are not in the window, and the panel says so rather than
    // letting a four-row list read as the whole prison.
    expect(probe.moreLaidOut).toBe(true);
    expect(probe.moreText).toBe('and 5 more');
    // And the empty sentence is gone, at this viewport and every other -- see
    // the fold test below, which is where that is measured at all five.
    expect(probe.emptyLaidOut).toBe(false);

    // The two strings the raw-key sweep below cannot judge, because both are
    // *assembled* rather than looked up: a name is two halves put together in a
    // locale's own order, and a prisoner with no name yet is still somebody.
    expect(probe.rows[0]?.nameText).toBe('Mara Ostrowska');
    expect(probe.rows[2]?.nameText).toBe('Prisoner 8');
    // The only activity that carries a wrapper, beside one that does not.
    expect(probe.rows[0]?.activityText).toBe('Heading to Showering');
    expect(probe.rows[1]?.activityText).toBe('Yard Time');
    // The badge's word, which is what makes its colour readable without colour.
    expect(probe.rows.map((row) => row.badgeText)).toEqual(['Low', 'High', 'Classification', 'Minimal']);
    // And the colour beside it, as the attribute rather than as a paint. The
    // probe has read `badgeTone` since it was written and nothing asserted it
    // here, which is why the tier-2 defect issue #788 names -- `Medium` wearing
    // `Minimal`'s colour -- was invisible to this suite. This fixture holds no
    // tier-2 row; the test below is the one that does.
    expect(probe.rows.map((row) => row.badgeTone)).toEqual(['neutral', 'warning', 'info', 'neutral']);

    // ---- the worst-need bar (issue #535 decision 6) --------------------
    //
    // **The machine-readable half, asserted as attributes rather than as a
    // drawing.** This is the point of the readout: before it, "the need was
    // served" and "the need decayed but not far enough" were indistinguishable
    // from outside the simulation, and a bar whose value lived only in a CSS
    // width would not have changed that. These three attributes are what a
    // Playwright script measuring the grant-withholding schedule actually
    // reads.
    expect(probe.rows.map((row) => row.need)).toEqual(['hunger', 'hygiene', 'bladder', 'recreation']);
    expect(probe.rows.map((row) => row.needPermille)).toEqual(['200', '0', '204', '1000']);
    expect(probe.rows.map((row) => row.needUnmet)).toEqual(['true', 'true', 'false', 'false']);

    // **The tone follows the flag, and rows 0 and 2 are what prove it is not
    // following the level.** Their per-milles are `200` and `204` -- adjacent
    // need levels, 51 and 52, indistinguishable to the eye and to a
    // ten-segment bar, which lights two for both. They tone differently because
    // they fall on opposite sides of `STATE_INCOME_UNMET_NEED_LEVEL`. Any panel
    // that had invented its own band would have to have invented exactly this
    // one to pass, and a band on anything rounder -- a quarter, a fifth of the
    // *bar* rather than of `NEED_MAX` -- puts them both on the same side.
    expect(probe.rows.map((row) => row.needTone)).toEqual(['warning', 'warning', 'neutral', 'neutral']);

    // The word beside the bar, so the colour never stands alone -- the rule the
    // badge follows, applied to the bar. Six authored labels, none new.
    expect(probe.rows.map((row) => row.needText)).toEqual(['Hunger', 'Hygiene', 'Bladder', 'Recreation']);

    // The accessible value, which is a formatted number and not a sentence.
    expect(probe.rows.map((row) => row.needValueText)).toEqual(['20%', '0%', '20%', '100%']);

    // **The sweep.** ADR 0011 renders an unresolved key as itself, so a missing
    // catalog entry is a raw identifier on screen. `probe.text` is `innerText`,
    // so this is what the browser painted -- the pooled rows the panel hid are
    // not in it, and neither is anything inside a `display: none` ancestor.
    expect(probe.text.length, 'the panel rendered nothing at all').toBeGreaterThan(20);
    expect(probe.text, `an unresolved message key is on screen: ${probe.text}`).not.toMatch(RAW_KEY);
    // Every word the projection's ids became, from all five derived namespaces,
    // proven to be on screen rather than merely absent from the sweep -- a panel
    // that painted nothing would satisfy the line above.
    //
    // Compared without regard to case, for the reason `RAW_KEY` is
    // case-insensitive: `innerText` carries the `text-transform: uppercase` the
    // browser applied to every eyebrow, so the progress readout is on screen as
    // "42% THROUGH".
    const painted = probe.text.toLowerCase();
    for (const word of [
      'General Population',
      'High Risk',
      'Allows Recreation, Hygiene, Free Association',
      'Allows Hygiene',
      '42% through',
      'Association',
      'Idle',
      'Classification',
    ]) {
      expect(painted, `"${word}" never reached the screen`).toContain(word.toLowerCase());
    }
  });

  test('a shorter reply leaves nobody on screen who is no longer on the roster', async ({ page }) => {
    // The rows are **pooled**: `PRISONER_ROSTER_ROW_LIMIT` of them are built once
    // and a shorter reply hides the tail rather than removing it, so all four
    // keep their last prisoner's words in the DOM forever. Every `textContent`
    // assertion in this file would stay green while a released prisoner was
    // still on screen; only a rendered read can tell the difference, and only a
    // browser performs one.
    await page.evaluate(
      ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
      [TIMETABLE, ROSTER] as const,
    );
    await page.evaluate(
      ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
      [TIMETABLE, SOLO_ROSTER] as const,
    );

    const probe = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());
    expect(probe.rows.map((row) => row.prisoner)).toEqual(['3']);
    expect(probe.countText).toBe('1 of 1');
    expect(probe.moreLaidOut, 'a prison of one is withholding nobody').toBe(false);
    for (const gone of ['Delphine', 'Vanderweghe', 'Prisoner 8', 'Tomasz']) {
      expect(probe.text, `"${gone}" is still on screen after leaving the roster`).not.toContain(gone);
    }
    // And the rows really are pooled rather than rebuilt, which is what makes
    // the assertion above a measurement rather than a coincidence: all four
    // nodes are still in the document, three of them without a box.
    expect(await page.locator('.hud-regime__roster-row').count()).toBe(4);

    // **The need attributes are cleared with the row, not left behind.** A
    // pooled row that kept its `data-need-permille` would answer a probe with
    // the last prisoner who occupied that slot -- and unlike a stale *word*,
    // which the rendered-text sweep above catches, a stale attribute survives
    // `getClientRects()` filtering entirely and would be read by exactly the
    // measurement this readout exists to enable.
    const staleNeeds = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row')]
        .filter((row) => row.getClientRects().length === 0)
        .map((row) => [row.dataset['need'] ?? null, row.dataset['needPermille'] ?? null, row.dataset['needUnmet'] ?? null]),
    );
    expect(staleNeeds).toEqual([
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
  });

  test("keeps the last line of the roster inside the panel's fold at every viewport", async ({ page }) => {
    // **The measurement a list in this rail needs and a fixed block does not.**
    // Most of what `.hud__side` holds is a catalogue or a fixed set of
    // controls; this block's height tracks the *prisoner population*, bounded
    // by `PRISONER_ROSTER_ROW_LIMIT`. The Staff panel's held-guard list is the
    // one precedent, and `roster-panel.ts` says outright that this bound was
    // taken as arithmetic off `HELD_GUARD_ROW_LIMIT`'s 219.0px rather than
    // measured -- three rows carrying a 44px control against four carrying
    // none. This is the measurement that was owed.
    //
    // `.ui-panel.hud-regime` is `overflow-y: auto`, so the failure is not a
    // clipped panel a screenshot would show. It is the "and N more" line sitting
    // below the fold of a panel that quietly became scrollable, with every
    // rendered-text assertion above still green.
    //
    // One more thing is only refutable at one of these viewports, and is
    // therefore asserted at all five rather than there. 900x600 is the only one
    // 700px tall or shorter, which is where `hud.css` gives
    // `.hud-regime__note` an author `display: -webkit-box`; an author `display`
    // beats the user agent's `[hidden] { display: none }`, so the empty-prison
    // sentence being *gone* in a prison of nine is free at the other four and a
    // real measurement there. Before `.hud-regime__note[hidden]` landed it was
    // on screen under four prisoners at exactly that viewport.
    for (const [width, height] of REGIME_VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'));
      await page.evaluate(
        ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
        [TIMETABLE, ROSTER] as const,
      );

      const probe = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());
      const panel = probe.panelBox;
      expect(panel, `the Regime panel has no box at ${width}x${height}`).not.toBeNull();
      if (panel === null) continue;
      expect(panel.height, `the Regime panel is not laid out at ${width}x${height}`).toBeGreaterThan(100);
      expect(probe.rows.length, `the roster drew ${probe.rows.length} rows at ${width}x${height}`).toBe(4);
      expect(probe.moreLaidOut, `the withheld-count line has no box at ${width}x${height}`).toBe(true);

      // Nothing has scrolled anything: this is the state the panel arrives in.
      expect(probe.panelScrollTop, `the Regime panel is pre-scrolled at ${width}x${height}`).toBe(0);
      expect(
        probe.lastLineBottom,
        `the roster's last line is below the Regime panel's fold at ${width}x${height}: it ends at y=${probe.lastLineBottom} in a panel clipped at y=${probe.panelVisibleBottom}`,
      ).toBeLessThanOrEqual(probe.panelVisibleBottom);
      expect(
        probe.lastLineBottom,
        `the roster's last line is off the bottom of the viewport at ${width}x${height}`,
      ).toBeLessThanOrEqual(height);
      // The panel may never be shorter than its own content. It is allowed to
      // scroll -- `hud.css` says so and gives the reason -- but a scroll that is
      // needed on arrival is the fold defect, not the affordance.
      expect(probe.panelOverflow, `the Regime panel is shorter than its content at ${width}x${height}`)
        .toBeLessThanOrEqual(0);

      // The line the panel hid is not on screen. Free at 1440x900 whatever the
      // stylesheet says, and true at 900x600 only because `.hud-regime__note`
      // has an `[hidden]` guard to beat its own clamp.
      expect(
        probe.emptyLaidOut,
        `the empty-prison sentence is on screen beside nine prisoners at ${width}x${height}`,
      ).toBe(false);

      // A "the badge never leaves the panel" assertion belongs here by analogy
      // with `ui-held-guards.spec.ts`, and it is deliberately absent: it was
      // written, and measured **vacuous**. With `min-width: 0` deleted from
      // `.hud-regime__roster-text`, a 38-character unbroken given name still
      // left every badge inside the panel at all five viewports, and a
      // 26-character badge word pushed the *row* taller rather than pushing the
      // badge sideways -- so the fold assertion above is the one that catches it
      // and this one could not fail. `overflow-wrap: anywhere` on
      // `.hud-regime__roster-name` is why. `hud.css` has been corrected to say
      // the declaration is defensive here rather than load-bearing.
    }
  });
  /**
   * **A prisoner can be looked at** (issue #895).
   *
   * `hud/prisoner-detail` was answered by the worker and read by nobody, so
   * these are the assertions about the surface that closed it. Which words the
   * inspector uses is decided headlessly and asserted where it can be --
   * `describePrisonerRow`, `formatPrisonerName` and `describeNeed` are pure and
   * exported, and `tests/unit/ui-simulation-prisoner-detail.test.ts` drives
   * them against the real projection over a real runtime.
   *
   * Four things are left over and a real browser is the only thing that can
   * answer any of them:
   *
   * 1. **Whether a row is a control, and whether a vacated one stops being
   *    one.** `role`, `tabindex` and `aria-checked` are written by
   *    `paintRoster` and removed by `clearRowData`, and the removal is what
   *    keeps `app-shell.spec.ts`'s #88 control sweep honest -- it asserts that
   *    the controls it can never lay out are exactly its written exemption
   *    list, and four pooled rows that stayed focusable while empty would fail
   *    it in a prison holding nobody, which is the state that sweep runs in.
   * 2. **Whether the keyboard can actually reach the selection.** A roving
   *    `tabindex` is arithmetic (`rovingTabStop`, unit-tested) until something
   *    presses a key: what is asserted here is `document.activeElement` after a
   *    real `ArrowDown` and a real `Enter`, which is the same split
   *    `app-shell.spec.ts` makes for the Build catalogue's own ring.
   * 3. **Whether a block the panel hid is on screen anyway.** `.hud-regime__detail`
   *    carries an author `display: flex`, which beats the user agent's
   *    `[hidden] { display: none }` -- the trap `.hud-build__deliveries-more`
   *    is named for. Nobody selected is the arrival state of this tab for every
   *    player, so the attribute has to win, and only a layout can say it does.
   * 4. **Where the bottom of it ends up.** The inspector is a block that only
   *    exists after a press, on the one panel in this rail that is
   *    `overflow-y: auto` -- so it is pushed below the fold rather than clipped
   *    visibly, and a screenshot would not show it.
   */
  test.describe('the inspector under the roster (issue #895)', () => {
    /** Every row the browser drew, keyed by prisoner, so an assertion names a person rather than a position. */
    const rowsByPrisoner = async (page: Page) => {
      const probe = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());
      return { probe, rows: new Map(probe.rows.map((row) => [row.prisoner, row])) };
    };

    const focusedPrisoner = async (page: Page): Promise<string | null> =>
      page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement ? (active.dataset['prisoner'] ?? null) : null;
      });

    test('arrives with no selection and no block, because nobody has pressed anything', async ({ page }) => {
      await page.evaluate(
        ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
        [TIMETABLE, ROSTER] as const,
      );
      const { probe, rows } = await rowsByPrisoner(page);

      // The block has an author `display: flex`, so this is the assertion that
      // its `[hidden]` guard is what a player actually gets.
      expect(probe.detail.laidOut, 'the inspector drew a box before anything was selected').toBe(false);
      expect(probe.detail.prisoner).toBeNull();
      expect(probe.detail.needs).toEqual([]);

      // Every drawn row is a control and none of them is chosen. `aria-checked`
      // present and `"false"` is the state a radio group announces as "not
      // checked, 1 of 4"; absent would mean the row is not a member at all.
      expect([...rows.keys()]).toEqual(['3', '5', '8', '11']);
      for (const row of rows.values()) {
        expect(row.role, `row ${row.prisoner} is not a member of the choice`).toBe('radio');
        expect(row.ariaChecked, `row ${row.prisoner} is checked before anything was pressed`).toBe('false');
        expect(row.selected).toBe('false');
      }
      // One tab stop for the whole group, which is what makes four rows one
      // `Tab` rather than four (`rovingTabStop`, and the WAI-ARIA
      // composite-widget rule the two catalogue panels already follow).
      expect(probe.rows.filter((row) => row.tabIndex === 0)).toHaveLength(1);
      expect(probe.rows[0]?.tabIndex, 'the tab stop is not on the first row of an unchosen group').toBe(0);
      expect(probe.text, `an unresolved message key is on screen: ${probe.text}`).not.toMatch(RAW_KEY);
    });

    test('a pointer press chooses a prisoner, and the worker\'s answer is the block', async ({ page }) => {
      await page.evaluate(
        ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
        [TIMETABLE, ROSTER] as const,
      );
      await page.locator('.hud-regime__roster-row[data-prisoner="3"]').click();

      // The press is applied locally and at once -- it does not wait for a
      // round trip, which in the real app is up to roughly 300ms in a browser.
      const chosen = await rowsByPrisoner(page);
      expect(chosen.rows.get('3')?.ariaChecked).toBe('true');
      expect(chosen.rows.get('3')?.selected).toBe('true');
      expect(chosen.rows.get('5')?.ariaChecked).toBe('false');
      // The tab stop follows the choice, so tabbing back in lands on the
      // player's own row rather than at the top of a list they have answered.
      expect(chosen.probe.rows.find((row) => row.tabIndex === 0)?.prisoner).toBe('3');
      // And nothing is drawn yet: the panel holds the question, not an answer.
      expect(chosen.probe.detail.laidOut, 'the inspector drew a block before the worker answered').toBe(false);

      // The host is told, because the host is the only thing that can ask
      // `hud/prisoner-detail` about them.
      expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toContain(
        JSON.stringify({ kind: 'select-prisoner', prisonerId: 3 }),
      );

      // The answer arrives on the view model, exactly as the roster's does.
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL_FIRST] as const,
      );
      const { probe } = await rowsByPrisoner(page);

      expect(probe.detail.laidOut).toBe(true);
      expect(probe.detail.prisoner).toBe('3');
      // The heading is the prisoner's name, which is why this block needs no
      // authored heading of its own (ADR 0015: a name is state, not copy).
      expect(probe.detail.nameText).toBe('Mara Ostrowska');
      // The same word the row's badge carries, through the same decision.
      expect(probe.detail.badgeText).toBe(chosen.rows.get('3')?.badgeText);
      expect(probe.detail.badgeTone).toBe('neutral');

      // **All six needs, in the projection's order** -- the whole of what this
      // block adds over the row above it, which shows one.
      expect(probe.detail.needs.map((need) => need.need)).toEqual([
        'hunger',
        'sleep',
        'hygiene',
        'bladder',
        'safety',
        'recreation',
      ]);
      expect(probe.detail.needs.map((need) => need.permille)).toEqual(['200', '204', '0', '120', '1000', '40']);
      // The composition of `unmetNeedCount`, which is the figure
      // `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` multiplies. The
      // roster row for this prisoner can only say that it is at least one.
      expect(probe.detail.needs.map((need) => need.unmet)).toEqual([
        'true',
        'false',
        'true',
        'true',
        'false',
        'true',
      ]);
      // The tone is the state's line and the pair straddling it is the
      // assertion: 200 is at `STATE_INCOME_UNMET_NEED_LEVEL` and 204 is the
      // very next level above it.
      expect(probe.detail.needs.map((need) => need.tone)).toEqual([
        'warning',
        'neutral',
        'warning',
        'warning',
        'neutral',
        'warning',
      ]);
      // The colour never stands alone: every line carries the need's word and
      // the bar carries the figure as an accessible value.
      expect(probe.detail.needs.map((need) => need.nameText)).toEqual([
        'Hunger',
        'Sleep',
        'Hygiene',
        'Bladder',
        'Safety',
        'Recreation',
      ]);
      expect(probe.detail.needs[0]?.valueText).toBe('20%');
      expect(probe.detail.needs[4]?.valueText).toBe('100%');
      expect(probe.text, `an unresolved message key is on screen: ${probe.text}`).not.toMatch(RAW_KEY);
    });

    test('the choice is reachable by keyboard alone, arrows and Enter', async ({ page }) => {
      await page.evaluate(
        ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
        [TIMETABLE, ROSTER] as const,
      );

      // Into the group at its one tab stop, the way `Tab` would arrive.
      await page.locator('.hud-regime__roster-row[data-prisoner="3"]').focus();
      expect(await focusedPrisoner(page)).toBe('3');

      // Arrows move focus and do **not** select: choosing a row is an explicit
      // act with a pointer, so it is an explicit act with a key too, which is
      // the ruling both catalogue panels made for their own rings.
      await page.keyboard.press('ArrowDown');
      expect(await focusedPrisoner(page)).toBe('5');
      const moved = await rowsByPrisoner(page);
      expect(moved.rows.get('5')?.ariaChecked, 'arrowing onto a row selected it').toBe('false');
      // No *selection* intent, rather than no intent at all: `beforeEach`
      // clicked the tab, so `select-tab` is legitimately in the list and an
      // `toEqual([])` here asserted the harness had done nothing.
      expect(
        (await page.evaluate(() => window.lockstateUiHarness.hudIntents())).filter((intent) =>
          intent.includes('select-prisoner'),
        ),
        'arrowing onto a row told the host to fetch it',
      ).toEqual([]);
      // The `0` moves with the focus, or tabbing out and back would return the
      // player to the row they arrowed away from.
      expect(moved.probe.rows.find((row) => row.tabIndex === 0)?.prisoner).toBe('5');

      // `End` and `Home`, because a ring is a ring.
      await page.keyboard.press('End');
      expect(await focusedPrisoner(page)).toBe('11');
      await page.keyboard.press('Home');
      expect(await focusedPrisoner(page)).toBe('3');

      // And `Enter` chooses, on the row focus is on.
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      const chosen = await rowsByPrisoner(page);
      expect(chosen.rows.get('5')?.ariaChecked).toBe('true');
      expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toContain(
        JSON.stringify({ kind: 'select-prisoner', prisonerId: 5 }),
      );

      // `Space` is the radio's other activation key, and pressing it on the row
      // already chosen is the way back out -- the toggle that exists instead of
      // a Close control, which would need a word the owner has not written.
      await page.keyboard.press(' ');
      const cleared = await rowsByPrisoner(page);
      expect(cleared.rows.get('5')?.ariaChecked).toBe('false');
      expect(cleared.probe.detail.laidOut).toBe(false);
      expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toContain(
        JSON.stringify({ kind: 'select-prisoner', prisonerId: undefined }),
      );
    });

    test('a reply about somebody else is not painted under the chosen prisoner\'s name', async ({ page }) => {
      await page.evaluate(
        ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
        [TIMETABLE, ROSTER] as const,
      );
      await page.locator('.hud-regime__roster-row[data-prisoner="3"]').click();

      // The race: a request for prisoner 5 was in flight when the player moved
      // to prisoner 3. The channel correlates by `messageId` (ADR 0003 decision
      // 2) and the *player* is not correlated at all, so this is the guard.
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL_SECOND] as const,
      );
      const stale = await rowsByPrisoner(page);
      expect(stale.probe.detail.laidOut, "a reply about prisoner 5 was painted under prisoner 3's name").toBe(false);
      // Read off the block and not off the panel's text: prisoner 5 is on the
      // roster in their own right, four rows up, so `probe.text` names them
      // whatever the block does. The first version of this assertion looked for
      // their surname in the whole panel and failed on the row.
      expect(stale.probe.detail.prisoner).toBeNull();
      expect(stale.probe.detail.nameText).toBe('');
      expect(stale.probe.detail.needs).toEqual([]);
      const sentence = page.locator('[data-sentence-remaining]');
      await expect(sentence).toBeHidden();
      await expect(sentence).toHaveText('');
      expect(await sentence.getAttribute('data-remaining-days')).toBeNull();

      // And the right answer still lands.
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL_FIRST] as const,
      );
      const settled = await rowsByPrisoner(page);
      expect(settled.probe.detail.laidOut).toBe(true);
      expect(settled.probe.detail.prisoner).toBe('3');
      await expect(sentence).toHaveText('Sentence remaining (in-game days): 1.5');
      // A later detail observation carries less time; repeating it while
      // paused must not invent wall-time progress between replies.
      for (let refresh = 0; refresh < 2; refresh += 1) {
        await page.evaluate(
          ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
          [TIMETABLE, ROSTER, { ...DETAIL_FIRST, remainingSentenceTicks: 1200 }] as const,
        );
        await expect(sentence).toHaveText('Sentence remaining (in-game days): 0.5');
      }
      // A subsequent choice must replace this prisoner's duration too.
      await page.locator('.hud-regime__roster-row[data-prisoner="5"]').click();
      await expect(sentence).toBeHidden();
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL_SECOND] as const,
      );
      await expect(sentence).toHaveText('Sentence remaining (in-game days): 3');
    });

    test('a prisoner who drops out of the four-row window is still the prisoner on screen', async ({ page }) => {
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL_FIRST] as const,
      );
      await page.locator('.hud-regime__roster-row[data-prisoner="3"]').click();
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL_FIRST] as const,
      );
      expect((await rowsByPrisoner(page)).probe.detail.prisoner).toBe('3');

      /*
       * The window moves off them without them leaving the prison. Since #703
       * the four rows are the four highest-tier prisoners, so somebody being
       * reclassified upward pushes the row a player is reading out of the
       * window -- and the projection will still answer about them by id.
       *
       * The block staying is what makes the inspector reach further than four
       * people at a time: the roster is where a prisoner can be *chosen*, and
       * the answer outlives their row.
       */
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, WITHOUT_FIRST_ROSTER, DETAIL_FIRST] as const,
      );
      const { probe, rows } = await rowsByPrisoner(page);

      expect([...rows.keys()], 'the window still holds the prisoner it was supposed to drop').toEqual(['5', '8', '11']);
      expect(probe.detail.laidOut, 'the inspector left with the row rather than with the prisoner').toBe(true);
      expect(probe.detail.prisoner).toBe('3');
      expect(probe.detail.nameText).toBe('Mara Ostrowska');
      // No row is checked, because no row is theirs -- and the group still has
      // exactly one way in, which falls back to the top of the list.
      for (const row of rows.values()) expect(row.ariaChecked).toBe('false');
      expect(probe.rows.filter((row) => row.tabIndex === 0)).toHaveLength(1);
      expect(probe.rows[0]?.tabIndex).toBe(0);
    });

    test('a released prisoner takes the block and the selection with them', async ({ page }) => {
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL_FIRST] as const,
      );
      await page.locator('.hud-regime__roster-row[data-prisoner="3"]').click();
      await page.evaluate(
        ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
        [TIMETABLE, ROSTER, DETAIL_FIRST] as const,
      );
      expect((await rowsByPrisoner(page)).probe.detail.laidOut).toBe(true);

      /*
       * What the host does when `PrisonerDetailReader.read` answers
       * `'released'` -- `projectPrisonerDetail` returning nothing, which
       * happens for exactly one reason, `!entityStore.isAlive(entityId)`.
       *
       * **It draws no sentence, and that is deliberate rather than
       * unfinished.** The words that would go there -- "this prisoner has been
       * released" -- are a new player-facing sentence, which is `AGENTS.md`'s
       * fourth exclusion and the owner's. A placeholder would be a promise the
       * code does not keep; this asserts the honest gap so that the day the
       * owner rules a sentence, the test that has to change is this one.
       */
      await page.evaluate(() => window.lockstateUiHarness.clearPrisonerSelection());
      const { probe, rows } = await rowsByPrisoner(page);

      const sentence = page.locator('[data-sentence-remaining]');
      await expect(sentence).toBeHidden();
      await expect(sentence).toHaveText('');
      expect(await sentence.getAttribute('data-remaining-days')).toBeNull();

      expect(probe.detail.laidOut).toBe(false);
      expect(probe.detail.prisoner).toBeNull();
      expect(probe.detail.needs).toEqual([]);
      for (const row of rows.values()) expect(row.ariaChecked).toBe('false');
      // The tab stop is back at the top of the list, not on a prisoner who is
      // not in the prison.
      expect(probe.rows[0]?.tabIndex).toBe(0);
      // Nothing was authored to fill the gap: no new sentence reached the
      // screen, and the two the panel does own are about an *empty* roster,
      // which this prison is not.
      //
      // Measured on the *block* rather than on the panel's text, for the reason
      // the stale-reply case above gives: this prisoner is still on the roster
      // in a real session -- what the host discovered is that the worker will
      // not answer about them -- so the panel's text still names them from the
      // row. The first version of this assertion looked for the name anywhere
      // in the panel and failed on the row above.
      expect(probe.detail.nameText).toBe('');
      expect(probe.text).not.toContain('released');
      expect(probe.text, `an unresolved message key is on screen: ${probe.text}`).not.toMatch(RAW_KEY);
    });

    test('a vacated pooled row is not a control at all', async ({ page }) => {
      /*
       * The half of this change that keeps a *different* test honest.
       * `app-shell.spec.ts`'s #88 sweep enumerates the page with
       * `button, [role="button"], a[href], input, select, textarea,
       * [tabindex]:not([tabindex="-1"])` and asserts that the controls it could
       * never lay out are **exactly** its written exemption list -- whose own
       * comment calls each entry a tripwire. The sweep admits nobody, so a
       * pooled roster row that stayed focusable while empty would be a control
       * it can never hit-test, and it would fail and name all four.
       *
       * That is why the row is a `div` carrying `role="radio"` rather than the
       * real `<button>` the two catalogue panels use: a `<button>` matches that
       * selector whatever its attributes say.
       */
      await page.evaluate(
        ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
        [TIMETABLE, SOLO_ROSTER] as const,
      );

      const vacated = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row')]
          .filter((row) => row.getClientRects().length === 0)
          .map((row) => [row.getAttribute('role'), row.getAttribute('tabindex'), row.getAttribute('aria-checked')]),
      );
      // Three of the four, and every attribute gone rather than set to a
      // falsy-looking value.
      expect(vacated).toEqual([
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ]);

      // And the surviving row is still a control, so the assertion above is
      // about vacancy rather than about the roster having stopped working.
      const { rows } = await rowsByPrisoner(page);
      expect(rows.get('3')?.role).toBe('radio');
      expect(rows.get('3')?.tabIndex).toBe(0);

      // A prison holding nobody is the state the #88 sweep runs in: no row is
      // drawn, so the group is not announced as a choice either -- a
      // `radiogroup` whose only member is a sentence would say "one of one" for
      // something there is no way to select.
      await page.evaluate(
        ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
        [TIMETABLE, EMPTY_ROSTER] as const,
      );
      const empty = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('.hud-regime__roster-list');
        return {
          role: list?.getAttribute('role') ?? null,
          focusable: document.querySelectorAll('.hud-regime__roster-row[tabindex]:not([tabindex="-1"])').length,
        };
      });
      expect(empty.role).toBeNull();
      expect(empty.focusable, 'an empty roster left a focusable row for the #88 sweep to find').toBe(0);
    });

    test('the chosen prisoner is reachable inside the panel at every viewport', async ({ page }) => {
      /*
       * **The measurement ADR 0022's layout budget requires of any new block.**
       *
       * The inspector is not in `RegimeProbe.lastLineBottom` on purpose -- that
       * figure is the roster's own reachability number, asserted in the state
       * where nobody is selected and this block has no box at all. This is the
       * same question asked of the block a press creates.
       *
       * What is asserted is the block's **top** rather than its bottom, and the
       * difference is the honest claim: `.ui-panel.hud-regime` is
       * `overflow-y: auto` by design ("whatever the rail cannot give it is its
       * own to scroll"), and six need lines plus a heading do not fit under the
       * timetable and four roster rows at 900x600. `revealDetail` scrolls the
       * panel so the block starts inside the fold, which puts the name, the
       * badge and the first needs on screen and the last of them one short
       * scroll away. Asserting the bottom instead would be asserting that this
       * panel never scrolls, which it is documented to do and which the roster's
       * own fold test already pins for the *arrival* state.
       *
       * The numbers are printed as well as asserted, because what a later pass
       * will want is the figure and not the verdict.
       */
      const measured: string[] = [];
      for (const [width, height] of REGIME_VIEWPORTS) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
        await page.evaluate(() => window.lockstateUiHarness.clickTab('day-plan'));
        await page.evaluate(
          ([regime, roster]) => window.lockstateUiHarness.reportRegime(regime, roster),
          [TIMETABLE, ROSTER] as const,
        );
        await page.locator('.hud-regime__roster-row[data-prisoner="3"]').click();
        await page.evaluate(
          ([regime, roster, detail]) => window.lockstateUiHarness.reportRegime(regime, roster, detail),
          [TIMETABLE, ROSTER, DETAIL_FIRST] as const,
        );

        const probe = await page.evaluate(() => window.lockstateUiHarness.regimeProbe());
        const box = probe.detail.box;
        expect(box, `the inspector has no box at ${width}x${height}`).not.toBeNull();
        if (box === null) continue;
        expect(probe.detail.needs, `the inspector drew no need lines at ${width}x${height}`).toHaveLength(6);
        measured.push(
          `${width}x${height}: block ${box.height.toFixed(1)}px at y=${box.y.toFixed(1)}..${(box.y + box.height).toFixed(1)}, ` +
            `panel fold y=${probe.panelVisibleBottom.toFixed(1)}, overflow ${probe.panelOverflow.toFixed(1)}px, ` +
            `scrollTop ${probe.panelScrollTop.toFixed(1)}`,
        );

        // The block starts inside the panel's own fold, which is what
        // `revealDetail` is for: a block a press created and the panel never
        // scrolled to would be a readout below its own fold, which is #174's
        // defect wearing a different hat.
        expect(
          box.y,
          `the inspector starts below the Regime panel's fold at ${width}x${height}: y=${box.y} in a panel clipped at y=${probe.panelVisibleBottom}`,
        ).toBeLessThan(probe.panelVisibleBottom);
        // And its heading is on screen rather than off the bottom of the
        // window.
        expect(box.y, `the inspector starts off the bottom of the viewport at ${width}x${height}`).toBeLessThan(height);
        // The roster it sits under is untouched: four rows, and the "and N
        // more" line still inside the fold. A block that pushed the roster past
        // the fold would have spent a budget that was measured for the roster.
        expect(probe.rows, `the roster lost a row at ${width}x${height}`).toHaveLength(4);
        expect(
          probe.lastLineBottom,
          `the roster's last line is below the fold at ${width}x${height} once a prisoner is chosen`,
        ).toBeLessThanOrEqual(probe.panelVisibleBottom);

        // #958: measure the text itself, not just its wrapping container.
        const sentence = page.locator('[data-sentence-remaining]');
        await expect(sentence).toHaveText('Sentence remaining (in-game days): 1.5');
        await sentence.scrollIntoViewIfNeeded();
        await expect(sentence).toBeVisible();
        const readout = await sentence.evaluate((node) => {
          // `.ui-panel` rather than `.hud-regime`: ADR 0115 split the roster
          // and its inspector into `.ui-panel.hud-roster`, so the panel this
          // sentence has to fit inside is the one it is *in* rather than one
          // named here. The generic class is also the more durable subject --
          // the claim is "inside its panel's box", not "inside that panel".
          const panel = node.closest('.ui-panel')!;
          const panelBox = panel.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(node);
          return {
            left: panelBox.left, right: panelBox.right,
            top: panelBox.top, bottom: panelBox.bottom,
            text: [...range.getClientRects()].map((rect) => ({
              left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            })),
          };
        });
        expect(readout.text.length).toBeGreaterThan(0);
        for (const line of readout.text) {
          expect(line.left).toBeGreaterThanOrEqual(readout.left);
          expect(line.right).toBeLessThanOrEqual(readout.right);
          expect(line.top).toBeGreaterThanOrEqual(readout.top);
          expect(line.bottom).toBeLessThanOrEqual(readout.bottom);
        }
      }
      // Printed for the next change to this panel: the figures, not the verdict.
      console.log(`[#895 inspector] ${JSON.stringify(measured)}`);
      expect(measured, 'no viewport measured the inspector').toHaveLength(REGIME_VIEWPORTS.length);
    });
  });
});
