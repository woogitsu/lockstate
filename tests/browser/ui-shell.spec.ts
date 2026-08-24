import { type Page, expect, test } from '@playwright/test';
import type { HudViewModel } from '../../src/ui/hud';
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

    expect(probe.metricIds).toEqual(['prisoners', 'staff', 'rooms', 'incidents', 'contraband']);
    expect(probe.metricValues).toEqual(['142', '27', '61', '0', '4']);
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
    // `getComputedStyle` answers for a `display: none` element too, so the
    // count above and the filter behind it would both survive a strip that
    // was never laid out. "Every number" means every number on screen.
    await expectLaidOut(page, '.hud-strip .ui-value', 'the strip values');
  });

  test('tabs respond, moving both the selection and the reported intent', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).activeTab).toBe('build');
    expect(await page.locator('.ui-tab[data-tab="build"]').getAttribute('aria-current')).toBe('true');
    expect(await page.locator('.ui-tab[data-tab="overview"]').getAttribute('aria-current')).toBeNull();

    await page.evaluate(() => window.lockstateUiHarness.clickTab('security'));
    expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toEqual([
      JSON.stringify({ kind: 'select-tab', tab: 'build' }),
      JSON.stringify({ kind: 'select-tab', tab: 'security' }),
    ]);
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
        counts: { prisoners: 179, prisonerCapacity: 180, staff: 27, rooms: 61, activeIncidents: 2, contrabandFound: 4 },
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
    await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed).toBe('false');

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

    test('the refusal line is there at 375px, where the alerts region is not', async ({ page }) => {
      // `hud.css` drops `.hud__corner` at 720px and below, so a refusal
      // reported into the alerts list would not exist on a phone at all.
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

  test('the alerts section folds and unfolds from a single tap on its header', async ({ page }) => {
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed).toBe('true');

    await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed).toBe('false');
    // Scoped to the minimap frame the alerts live in: the Build panel uses
    // the same primitive, so a bare `.ui-section__header` now matches three.
    expect(await page.locator('.hud-minimap .ui-section__header').getAttribute('aria-expanded')).toBe('true');

    await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());
    expect((await page.evaluate(() => window.lockstateUiHarness.hudProbe())).alertsCollapsed).toBe('true');
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
   * Nothing in the shipped app could see it: after #220 the alerts list has no
   * producer at all (`main.ts` sends the "simulation unavailable" sentence to
   * `.hud__unavailable` instead), so this is LATENT, and it becomes visible
   * the moment #104's channel gives the list a source that reports more than
   * one row. It is the defect `main.ts` argues against for the buildable
   * catalogue -- an order nobody chose -- and it is unfixable from the
   * outside, because a caller cannot make its own output order survive a
   * renderer that ignores it.
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
      counts: { prisoners: 142, prisonerCapacity: 180, staff: 27, rooms: 61, activeIncidents: 0, contrabandFound: 4 },
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
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts([]));
      expect((await page.evaluate(() => window.lockstateUiHarness.alertProbe())).order).toEqual([]);
      await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());
      await expect(page.locator('.hud-alerts__list [data-alert="empty"]')).toBeVisible();
    });

    test('the rows are on screen once the section is open, not merely in the DOM', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), withAlerts(['c', 'a', 'b']));
      // The section starts folded -- which is how #82's alert was asserted
      // green while no player could see it (#220). An order assertion on rows
      // nobody can see would repeat that mistake, so the order is read again
      // with the section open and the rows laid out.
      await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());

      expect((await page.evaluate(() => window.lockstateUiHarness.alertProbe())).order).toEqual(['c', 'a', 'b']);
      await expectLaidOut(page, '.hud-alerts__list [data-alert]', 'the alert rows');
      await expect(page.locator('.hud-alerts__list [data-alert="c"]')).toBeVisible();
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
      expect(layout.minimap).toBeNull();
    });

    test('the minimap frame never overlaps the tab bar', async ({ page }) => {
      // Both were bottom-anchored in the same grid row, so at 768px the
      // minimap's right edge landed 16px inside the centred tab bar.
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
      expect(probe.texts).toContain('Brick wall');

      await page.evaluate(() => window.lockstateUiHarness.clickTab('security'));
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

      expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toEqual([
        JSON.stringify({ kind: 'select-tab', tab: 'build' }),
        JSON.stringify({ kind: 'arm-build-tool', armed: true, definitionId: 'wall-brick' }),
        JSON.stringify({ kind: 'arm-build-tool', armed: false, definitionId: 'wall-brick' }),
      ]);
    });

    test('leaving the Build tab hands the pointer back to the camera', async ({ page }) => {
      // A tool left armed behind a hidden panel would swallow every click on a
      // world the player thought they were only looking at.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      await page.evaluate(() => window.lockstateUiHarness.clickArmBuild());
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).armed).toBe(true);

      await page.evaluate(() => window.lockstateUiHarness.clickTab('security'));
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
      // The disarm rides out with the tab change itself, so the host never
      // sees a window where the panel is hidden and the pointer is still ours.
      expect(intents).toContain(JSON.stringify({ kind: 'arm-build-tool', armed: false, definitionId: 'wall-brick' }));
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

    test('hides the edge chooser for a buildable that does not sit on an edge', async ({ page }) => {
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
      // The chooser lives in the numeric fallback: the map route reads the
      // edge off the gesture instead of asking for it twice.
      await page.evaluate(() => window.lockstateUiHarness.expandBuildCoordinates());
      expect((await page.evaluate(() => window.lockstateUiHarness.buildProbe())).edgeChooserVisible).toBe(true);

      // A door is an object, not edge geometry. A disabled chooser would still
      // claim the setting exists; it is hidden instead.
      await page.evaluate(() => window.lockstateUiHarness.clickBuildable('door-wooden'));
      const probe = await page.evaluate(() => window.lockstateUiHarness.buildProbe());
      expect(probe.selected).toBe('door-wooden');
      expect(probe.edgeChooserVisible).toBe(false);
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
     * Twelve entries because `BUILDABLE_REGISTRY` has two and the app cannot
     * yet show a third at all; the panel takes its catalogue as view-model
     * data, so the harness hands the real panel a longer list. Twelve is well
     * past the seven that first overflow the panel here, so the test states a
     * property rather than sitting on a boundary.
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
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

      const probe = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());
      expect(probe.rows).toBe(2);
      expect(probe.listOverflow).toBe(0);
      expect(probe.panelOverflow).toBe(0);
      // `?? 0` used to stand here, which passed when the header had no box at
      // all -- the state a `display: none` panel is in. The box is required
      // first, so the comparison is about a header that exists on screen.
      const header = probe.lastSectionHeader;
      expect(header, 'the last section header has no box').not.toBeNull();
      expect(header?.bottom).toBeLessThanOrEqual(probe.panelVisibleBottom);
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
    await page.evaluate(() => window.lockstateUiHarness.clickTab('regime'));
    await page.evaluate(() => window.lockstateUiHarness.clickTransport('Pause'));
    await page.evaluate(() => window.lockstateUiHarness.toggleAlerts());
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.lockstateUiHarness.takeUnhandledRejections())).toEqual([]);
  });
});
