/**
 * The gate over `armBuildable`, and the reproduction of the race it was
 * shipped with. Issue #1017.
 *
 * ## Why a harness helper has a gate at all
 *
 * Because the defect it exists for is *silent*, and silence is not something a
 * playtest can notice. `armBuildable` clicked a catalogue row and read
 * `.hud-build__arm`'s label in the next statement, with nothing in between;
 * under load the label was still the previous buildable's, so the helper armed
 * the wrong object and **returned normally**. The playtest that found it
 * measured four of eighteen presses in one act placing something it had not
 * asked for, and another act placing a bed where it asked for a toilet -- and
 * every one of those runs had passed. That undermines evidence backwards:
 * every finding this repository has taken from a play-test since the helper
 * landed rests on the helper having armed what it said.
 *
 * A helper nothing tests is a helper whose next silent regression is found the
 * same way, by inference, months later. So the contract is asserted here, in
 * the suite `playwright.config.ts` collects, and it costs one page load.
 *
 * ## How the race is reproduced, given that it only appears under load
 *
 * `installCatalogueDelay` swallows the click on a catalogue row in the capture
 * phase and replays it a fixed number of milliseconds later. That is not a
 * simulation of load, it is the same *state*: Playwright's `click()` resolves
 * when the input event has been dispatched, not when the application has
 * finished reacting, so a page under contention and a page holding the event
 * back deliberately are indistinguishable from the harness's side. The delay
 * makes the window wide enough to observe every time instead of four times in
 * eighteen.
 *
 * `-1` never replays at all, which is the other end of the same axis: a click
 * whose handler never runs. That is what the loud-failure test uses.
 *
 * **What this file cannot show, said rather than implied:** it does not
 * establish the frequency in the field. The issue's four-of-eighteen is
 * inferred from counting the objects that ended up placed, and nothing here
 * recovers it. What it establishes is the mechanism, end to end, and that the
 * fix closes it under a delay far larger than any this suite would meet by
 * accident.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { armBuildable, installTee, openApp, press, sentCommands, tab } from './playtest-harness';

/**
 * The deliberately contended Build panel.
 *
 * Registered **after** `installTee`, and that ordering is load-bearing: the
 * harness's own intent recorder listens on `window`, one step earlier in the
 * capture path than this listener on `document`, so it still observes the
 * click that this one swallows. That is what lets the last test below show
 * `press` catching a wrong placement rather than joining in the confusion.
 */
async function installCatalogueDelay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __catalogueDelayMs: number }).__catalogueDelayMs = 0;
    document.addEventListener(
      'click',
      (event) => {
        const delay = (window as unknown as { __catalogueDelayMs: number }).__catalogueDelayMs;
        if (delay === 0) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const row = target.closest('.hud-build__list [data-buildable]') as HTMLElement | null;
        if (row === null) return;
        // The replayed click has to get through, or nothing would ever redraw.
        if (row.dataset['delayedReplay'] === 'true') {
          delete row.dataset['delayedReplay'];
          return;
        }
        event.stopImmediatePropagation();
        event.preventDefault();
        if (delay < 0) return;
        setTimeout(() => {
          row.dataset['delayedReplay'] = 'true';
          row.click();
        }, delay);
      },
      true,
    );
  });
}

const setDelay = (page: Page, ms: number): Promise<void> =>
  page.evaluate((value) => {
    (window as unknown as { __catalogueDelayMs: number }).__catalogueDelayMs = value;
  }, ms);

/**
 * `armBuildable` exactly as it stood before this change, kept so the failure
 * can be *shown* rather than described -- and returning the label it read, which
 * is the reading the issue asked for and could not produce.
 */
async function armBuildableAsItWas(page: Page, id: string): Promise<string> {
  await page.locator(`.hud-build__list [data-buildable="${id}"]`).click();
  const label = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
  if (label.startsWith('place') || label.startsWith('draw')) await page.locator('.hud-build__arm').click();
  return label;
}

/** A press with no placement check on it, so a wrong placement can be observed instead of thrown. */
async function uncheckedPress(page: Page, x: number, y: number): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(150);
  return (await sentCommands(page)).slice(before);
}

const placed = (commands: readonly Record<string, unknown>[]): readonly string[] =>
  commands
    .filter((command) => command['type'] === 'PlaceObject' || command['type'] === 'PlaceBuildOrder')
    .map((command) => `${String(command['type'])} ${String(command['definitionId'])}`);

/** How far the redraw is held back. Comfortably above any accidental contention, well under the ten-second wait. */
const DELAY_MS = 1_200;

/** A point on canvas at 1440x900, for the reason `calibrate`'s docblock gives about its own probe. */
const WORLD = { x: 700, y: 300 };

/*
 * Serial, on one page, because the expensive part of every one of these is the
 * page load and the new prison -- measured at roughly seven of each test's
 * fifteen seconds when they had one each. Each test re-arms `wall-brick` with
 * the delay off first, so it states the state it starts from instead of
 * inheriting one.
 */
test.describe.configure({ mode: 'serial' });

test.describe('armBuildable under a Build panel that redraws late (#1017)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await installTee(page);
    await installCatalogueDelay(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await setDelay(page, 0);
    await armBuildable(page, 'wall-brick');
  });

  test('the helper this replaces armed the previous buildable, and said nothing', async () => {
    await setDelay(page, DELAY_MS);
    const labelItRead = await armBuildableAsItWas(page, 'bed-wooden');
    const selectedRow = await page
      .locator('.hud-build__list [data-buildable][data-selected="true"]')
      .getAttribute('data-buildable');
    const commands = await uncheckedPress(page, WORLD.x, WORLD.y);
    console.log(
      `[#1017] asked for "bed-wooden"; the label the old helper read was ${JSON.stringify(labelItRead)};` +
        ` the panel still had ${JSON.stringify(selectedRow)} selected; the press placed ${JSON.stringify(placed(commands))}`,
    );

    // The whole defect in three assertions: it read a stale label, it returned
    // happily, and a wall went into the world where a bed was asked for.
    expect(labelItRead).toBe('stop placing');
    expect(selectedRow).toBe('wall-brick');
    expect(placed(commands)).toEqual(['PlaceBuildOrder wall-brick']);
  });

  test('the helper waits for the panel to redraw, and arms what it asked for', async () => {
    await setDelay(page, DELAY_MS);
    await armBuildable(page, 'bed-wooden');

    const commands = await uncheckedPress(page, WORLD.x, WORLD.y);
    expect(placed(commands)).toEqual(['PlaceObject bed-wooden']);
  });

  test('the helper throws when the panel never redraws at all', async () => {
    await setDelay(page, -1);
    const failure = await armBuildable(page, 'bed-wooden', 3_000).then(
      () => undefined,
      (error: Error) => error.message,
    );

    // Loud, and it names the buildable it could not reach: the whole cost of
    // this defect was that the same state used to return normally.
    expect(failure).toContain('never redrew with "bed-wooden" selected');
  });

  test('press refuses a placement that is not what the panel was last asked for', async () => {
    await setDelay(page, DELAY_MS);
    await armBuildableAsItWas(page, 'bed-wooden');

    const failure = await press(page, WORLD.x, WORLD.y).then(
      () => undefined,
      (error: Error) => error.message,
    );

    // The durable half. This is the check that does not care how the tool was
    // armed, or by whom: it compares the click the browser dispatched against
    // the `definitionId` on the command the world tool produced.
    expect(failure).toContain('placed ["PlaceBuildOrder wall-brick"]');
    expect(failure).toContain('but the Build panel was last asked for "bed-wooden"');
  });
});
