import { expect, test } from '@playwright/test';
import {
  buildAndPopulate,
  countsSeries,
  currentClock,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  reportBoundary,
  centreOf,
  runUntilTick,
  sentCommands,
  tab,
  TILE,
  type CountsSample,
} from './playtest-harness';

/**
 * A *playtest*, not a regression suite. Its helpers now live in
 * `./playtest-harness.ts`, extracted verbatim when a second playtest needed
 * them; the paragraphs that used to stand here about why this file is
 * `.playtest.ts` rather than `.spec.ts` are still true and are kept there.
 *
 * **It is collected now.** This file used to close by saying *"To run it,
 * point a config's `testMatch` at `.playtest.ts`; none does today."*
 * `tests/browser/playwright.playtest.config.ts` is that config, and nothing in
 * CI runs it.
 *
 * It answers issue #601 by playing. The findings live in
 * `docs/research/2026-08-29-what-a-day-actually-pays.md`.
 */

test.describe('playtest: what a day actually pays (#601)', () => {
  test('twelve on the roster, twelve beds', async ({ page }) => {
    test.setTimeout(900_000);
    const consoleLines: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      const text = m.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${m.type()}] ${text}`);
    });
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);

    await buildAndPopulate(page, { beds: 12, admits: 12, guards: 0, label: 'A/12-beds' });

    // The boundaries that come *after* the prison was populated, computed from
    // where the clock actually is rather than assumed to be day 1's.
    const populatedAt = await currentTick(page);
    console.log(`[A/12-beds] populated at tick ${populatedAt}`);
    for (let day = Math.floor(populatedAt / 2400) + 1; day <= Math.floor(populatedAt / 2400) + 2; day += 1) {
      const boundary = day * 2400 - 1;
      await runUntilTick(page, boundary + 60);
      reportBoundary('A/12-beds', await countsSeries(page), boundary);
    }

    const series = await countsSeries(page);
    console.log('[A/12-beds] === FULL SERIES (tick, roster, residents, capacity, accrued, treasury) ===');
    for (const s of series) {
      console.log(
        `[A/12-beds] t=${s.tick} roster=${s.prisoners} inIntake=${s.prisonersInIntake} highRisk=${s.prisonersHighRisk} residents=${s.roomOccupants} cap=${s.accommodationCapacity} accrued=${s.stateIncomeAccruedTodayMinorUnits} funds=${s.treasuryMinorUnits}`,
      );
    }
    console.log(`[A/12-beds] console: ${consoleLines.slice(0, 40).join('\n') || '(nothing)'}`);
  });

  test('twelve on the roster, three beds -- the brief’s prison', async ({ page }) => {
    test.setTimeout(900_000);
    const consoleLines: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      const text = m.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${m.type()}] ${text}`);
    });
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);

    await buildAndPopulate(page, { beds: 3, admits: 12, guards: 0, label: 'B/3-beds' });

    // The boundaries that come *after* the prison was populated, computed from
    // where the clock actually is rather than assumed to be day 1's.
    const populatedAt = await currentTick(page);
    console.log(`[B/3-beds] populated at tick ${populatedAt}`);
    for (let day = Math.floor(populatedAt / 2400) + 1; day <= Math.floor(populatedAt / 2400) + 2; day += 1) {
      const boundary = day * 2400 - 1;
      await runUntilTick(page, boundary + 60);
      reportBoundary('B/3-beds', await countsSeries(page), boundary);
    }

    const series = await countsSeries(page);
    console.log('[B/3-beds] === FULL SERIES ===');
    for (const s of series) {
      console.log(
        `[B/3-beds] t=${s.tick} roster=${s.prisoners} inIntake=${s.prisonersInIntake} highRisk=${s.prisonersHighRisk} residents=${s.roomOccupants} cap=${s.accommodationCapacity} accrued=${s.stateIncomeAccruedTodayMinorUnits} funds=${s.treasuryMinorUnits}`,
      );
    }
    console.log(`[B/3-beds] console: ${consoleLines.slice(0, 40).join('\n') || '(nothing)'}`);
  });

  test('three housed, three guards -- the other half of the loop', async ({ page }) => {
    test.setTimeout(900_000);
    const consoleLines: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      const text = m.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${m.type()}] ${text}`);
    });
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);

    await buildAndPopulate(page, { beds: 3, admits: 3, guards: 3, label: 'C/guards' });

    // The boundaries that come *after* the prison was populated, computed from
    // where the clock actually is rather than assumed to be day 1's.
    const populatedAt = await currentTick(page);
    console.log(`[C/guards] populated at tick ${populatedAt}`);
    for (let day = Math.floor(populatedAt / 2400) + 1; day <= Math.floor(populatedAt / 2400) + 2; day += 1) {
      const boundary = day * 2400 - 1;
      await runUntilTick(page, boundary + 60);
      reportBoundary('C/guards', await countsSeries(page), boundary);
    }

    const series = await countsSeries(page);
    console.log('[C/guards] === FULL SERIES ===');
    for (const s of series) {
      console.log(
        `[C/guards] t=${s.tick} roster=${s.prisoners} inIntake=${s.prisonersInIntake} highRisk=${s.prisonersHighRisk} residents=${s.roomOccupants} cap=${s.accommodationCapacity} accrued=${s.stateIncomeAccruedTodayMinorUnits} funds=${s.treasuryMinorUnits}`,
      );
    }
    console.log(`[C/guards] console: ${consoleLines.slice(0, 40).join('\n') || '(nothing)'}`);
  });
});

/**
 * Why a press takes two seconds: the in-flight gate, or click stability?
 *
 * The Intake panel's Admit control measured ~2.1 s per press across twelve
 * consecutive presses. Two candidates fit and they have opposite consequences
 * for a player, so this separates them on a control that needs no prison: the
 * Build panel's Buy submit goes through exactly the same `busy` set
 * (`src/ui/hud/hud.ts`), and a fresh session can press it immediately.
 *
 * It samples the button's `disabled` property and its `getBoundingClientRect`
 * every 25 ms from inside the page, so the answer is what the DOM did rather
 * than what the driver decided.
 */
test.describe('probe: what holds a command control between presses', () => {
  test('disabled, or unstable', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('1');

    await page.evaluate(() => {
      const samples: { t: number; disabled: boolean; x: number; y: number }[] = [];
      (window as unknown as { lockstateProbe: typeof samples }).lockstateProbe = samples;
      const start = performance.now();
      const tick = (): void => {
        const node = document.querySelector<HTMLButtonElement>('.hud-build__buy-submit');
        if (node !== null) {
          const box = node.getBoundingClientRect();
          samples.push({ t: Math.round(performance.now() - start), disabled: node.disabled, x: Math.round(box.x), y: Math.round(box.y) });
        }
        if (performance.now() - start < 60_000) setTimeout(tick, 25);
      };
      tick();
    });

    const durations: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const started = Date.now();
      await page.locator('.hud-build__buy-submit').click();
      durations.push(Date.now() - started);
      await page.waitForTimeout(120);
    }
    console.log(`[probe] buy press durations (ms): ${JSON.stringify(durations)}`);

    const summary = await page.evaluate(() => {
      const samples = (window as unknown as { lockstateProbe: { t: number; disabled: boolean; x: number; y: number }[] }).lockstateProbe;
      const runs: { from: number; to: number }[] = [];
      let open: number | undefined;
      for (const sample of samples) {
        if (sample.disabled && open === undefined) open = sample.t;
        if (!sample.disabled && open !== undefined) {
          runs.push({ from: open, to: sample.t });
          open = undefined;
        }
      }
      if (open !== undefined) runs.push({ from: open, to: samples[samples.length - 1]!.t });
      const positions = [...new Set(samples.map((s) => `${s.x},${s.y}`))];
      return { sampleCount: samples.length, disabledRuns: runs, distinctPositions: positions };
    });
    console.log(`[probe] samples=${summary.sampleCount}`);
    console.log(`[probe] intervals the control was disabled (ms): ${JSON.stringify(summary.disabledRuns)}`);
    console.log(`[probe] distinct button positions seen: ${JSON.stringify(summary.distinctPositions)}`);
  });
});

/**
 * The recovery path a mis-drag needs, with the mouse.
 *
 * `docs/research/README.md` records that a stray room drag was once
 * unrecoverable for the whole session and that #312 fixed it with `UnzoneRoom`.
 * No playtest has exercised the fix by dragging. This one does, and then takes
 * a placed object back out with the Build panel's Remove.
 */
test.describe('playtest: taking it back', () => {
  test('remove a room and remove an object, by dragging', async ({ page }) => {
    test.setTimeout(600_000);
    const consoleLines: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      const text = m.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${m.type()}] ${text}`);
    });
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);

    const origin = await buildAndPopulate(page, { beds: 1, admits: 0, guards: 0, label: 'D/remove' });
    const log = (line: string) => console.log(`[D/remove] ${line}`);
    log(`before removal: ${JSON.stringify(await latestCounts(page))}`);

    // ---- take the room back out, by dragging across it -----------------
    await tab(page, 'zones').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    log(`remove control label: ${JSON.stringify((await page.locator('.hud-rooms__remove').innerText()).trim())}`);
    await page.locator('.hud-rooms__remove').click();
    log(`panel in remove mode: ${JSON.stringify((await panelText(page, '.hud-rooms')).split('\n').slice(0, 8))}`);
    await drag(page, centreOf(origin, 13, 13), centreOf(origin, 15, 15));
    const pending = await panelText(page, '.hud-rooms');
    log(`panel with a removal pending: ${JSON.stringify(pending.split('\n').slice(0, 10))}`);
    const confirm = page.locator('.hud-rooms__confirm');
    log(`confirm reads: ${JSON.stringify((await confirm.innerText()).trim())} enabled=${await confirm.isEnabled()}`);
    await confirm.click();
    await page.waitForTimeout(1500);
    log(`after removal: ${JSON.stringify(await latestCounts(page))}`);
    log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

    // ---- put it back ----------------------------------------------------
    const again = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (again === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    /*
     * Leave removal, if the confirm above did not.
     *
     * **This branch has been unreachable since #684**: the confirm stands the
     * removal down with the tool, so the label read here is "Remove rooms" and
     * the click is skipped. It is kept as the guard it is -- an attempt that
     * threw before the confirm would still land here with the mode on.
     *
     * Whether *#689* reached it was open when that issue was filed, and it did:
     * the pair it fixes is exactly this two-press sequence. Under the old
     * `armed = removing || armed` this branch made things worse when it did
     * fire -- "Stop removing" left the tool armed to designate, so the
     * `.hud-rooms__arm` click below then *disarmed* it and the drag drew
     * nothing. Both presses now say what they do, so the guard is correct
     * whichever way it goes.
     */
    const removeLabel = (await page.locator('.hud-rooms__remove').innerText()).trim().toLowerCase();
    if (removeLabel.startsWith('stop')) await page.locator('.hud-rooms__remove').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1500);
    log(`after re-zoning: ${JSON.stringify(await latestCounts(page))}`);

    // ---- take the bed back out ------------------------------------------
    await tab(page, 'build').click();
    await page.locator('.hud-build__remove').click();
    log(`build remove hint: ${JSON.stringify(await panelText(page, '.hud-build'))}`);
    const bed = centreOf(origin, 12, 12);
    log(`remove press at the bed tile: ${JSON.stringify(await press(page, bed.x, bed.y))}`);
    await page.waitForTimeout(1500);
    log(`after removing the bed: ${JSON.stringify(await latestCounts(page))}`);
    log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    console.log(`[D/remove] console: ${consoleLines.slice(0, 40).join('\n') || '(nothing)'}`);
  });
});
