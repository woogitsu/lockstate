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
 * phase and lets it through later. That is not a simulation of load, it is the
 * same *state*: Playwright's `click()` resolves when the input event has been
 * dispatched, not when the application has finished reacting, so a page under
 * contention and a page holding the event back deliberately are
 * indistinguishable from the harness's side. Holding it makes the window
 * certain rather than four-in-eighteen.
 *
 * Three modes, and which one a test uses is itself an argument -- see `HELD`,
 * `LOST` and `DELAY_MS` below. The short of it: a test that must observe the
 * race holds the click and releases it by hand, because a test for a race must
 * not contain one; a test of the fix, which *waits*, can use a clock.
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

/** Clicks pass straight through: the page behaves exactly as it ships. */
const PASSED = 0;

/**
 * The redraw is held back until the test releases it -- **and it is a hold
 * rather than a long `setTimeout` because a fixed delay made this file's own
 * first test flaky, measured.** With the replay scheduled 1,200 ms out, the
 * assertion is really "the press happened less than 1,200 ms after the click",
 * and on a loaded container two CDP round trips ate that budget: the run that
 * caught it read a stale `wall-brick` off the panel and then placed
 * `PlaceObject bed-wooden`, because the replay landed between the two. A test
 * for a race that is itself a race is not evidence.
 *
 * Holding removes the clock from the reproduction entirely. The click is still
 * a real click that really does reach the panel -- the tests that use this
 * release it afterwards and assert the selection then moves, which is what
 * separates "late" from "lost".
 */
const HELD = -2;

/** The click never reaches the panel at all: the limit case, for the loud-failure test. */
const LOST = -1;

/**
 * A finite, released-by-the-clock delay, used only where the helper under test
 * *waits*. Nothing there depends on how long the wait takes, so a slow machine
 * makes the test slower and never wrong.
 */
const DELAY_MS = 1_200;

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
  /*
   * `HELD` is passed in rather than closed over, and that is not style. The
   * function below is serialised and re-evaluated inside the page, where this
   * module's bindings do not exist -- an earlier draft referenced `HELD`
   * directly and threw `ReferenceError` *after* `stopImmediatePropagation`,
   * so every held click was silently lost instead of held and the test read
   * exactly the symptom it was written to reproduce. A fault injector that
   * fails in the shape of the fault is the worst thing in this file.
   */
  await page.addInitScript((heldMode: number) => {
    (window as unknown as { __catalogueDelayMs: number }).__catalogueDelayMs = 0;
    const held: HTMLElement[] = [];
    // Replaying a held click has to get past this listener, or nothing would
    // ever redraw and the "late" in "redraws late" would be a fiction.
    const replay = (row: HTMLElement): void => {
      row.dataset['delayedReplay'] = 'true';
      row.click();
    };
    (window as unknown as { __releaseCatalogueClicks: () => number }).__releaseCatalogueClicks = () => {
      const pending = held.splice(0);
      for (const row of pending) replay(row);
      return pending.length;
    };
    document.addEventListener(
      'click',
      (event) => {
        const delay = (window as unknown as { __catalogueDelayMs: number }).__catalogueDelayMs;
        if (delay === 0) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const row = target.closest('.hud-build__list [data-buildable]') as HTMLElement | null;
        if (row === null) return;
        if (row.dataset['delayedReplay'] === 'true') {
          delete row.dataset['delayedReplay'];
          return;
        }
        event.stopImmediatePropagation();
        event.preventDefault();
        if (delay === heldMode) held.push(row);
        else if (delay > 0) setTimeout(() => replay(row), delay);
      },
      true,
    );
  }, HELD);
}

const setDelay = (page: Page, ms: number): Promise<void> =>
  page.evaluate((value) => {
    (window as unknown as { __catalogueDelayMs: number }).__catalogueDelayMs = value;
  }, ms);

/** Lets every held catalogue click through at once, and answers how many there were. */
const releaseCatalogueClicks = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __releaseCatalogueClicks: () => number }).__releaseCatalogueClicks());

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
    await setDelay(page, PASSED);
    await armBuildable(page, 'wall-brick');
  });

  test('the helper this replaces armed the previous buildable, and said nothing', async () => {
    await setDelay(page, HELD);
    const labelItRead = await armBuildableAsItWas(page, 'bed-wooden');
    const selectedRow = await page
      .locator('.hud-build__list [data-buildable][data-selected="true"]')
      .getAttribute('data-buildable');
    const commands = await uncheckedPress(page, WORLD.x, WORLD.y);
    console.log(
      `[#1017] asked for "bed-wooden"; the label the old helper read was ${JSON.stringify(labelItRead)};` +
        ` the panel still had ${JSON.stringify(selectedRow)} selected; the press placed ${JSON.stringify(placed(commands))}`,
    );

    // The whole defect in three readings: it read a stale label, it returned
    // happily, and a wall went into the world where a bed was asked for.
    expect(labelItRead).toBe('stop placing');
    expect(selectedRow).toBe('wall-brick');
    expect(placed(commands)).toEqual(['PlaceBuildOrder wall-brick']);

    // And the click was real and merely late, which is the difference between
    // this reproduction and one that simply broke the page.
    expect(await releaseCatalogueClicks(page)).toBe(1);
    await expect(page.locator('.hud-build__list [data-buildable="bed-wooden"]')).toHaveAttribute('data-selected', 'true');
  });

  test('the helper waits for the panel to redraw, and arms what it asked for', async () => {
    await setDelay(page, DELAY_MS);
    await armBuildable(page, 'bed-wooden');

    const commands = await uncheckedPress(page, WORLD.x, WORLD.y);
    expect(placed(commands)).toEqual(['PlaceObject bed-wooden']);
  });

  test('the helper throws when the panel never redraws at all', async () => {
    await setDelay(page, LOST);
    const failure = await armBuildable(page, 'bed-wooden', 3_000).then(
      () => undefined,
      (error: Error) => error.message,
    );

    // Loud, and it names the buildable it could not reach: the whole cost of
    // this defect was that the same state used to return normally.
    expect(failure).toContain('never redrew with "bed-wooden" selected');
  });

  test('press refuses a placement that is not what the panel was last asked for', async () => {
    await setDelay(page, HELD);
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
    await releaseCatalogueClicks(page);
  });
});
