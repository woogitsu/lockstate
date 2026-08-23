import { expect, test } from '@playwright/test';
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
      expect(probe.tileX).toBe('18');
      expect(probe.tileY).toBe('15');
      expect(probe.edge).toBe('west');

      await page.evaluate(() => window.lockstateUiHarness.clickPlaceOrder());
      const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());

      expect(intents.filter((intent) => intent.includes('place-build-order'))).toEqual([
        JSON.stringify({ kind: 'place-build-order', definitionId: 'wall-brick', x: 18, y: 15, edge: 'west' }),
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
