import { type Page, expect, test } from './network-changed-fixture';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import type { HudClockMode, HudSpeed, HudViewModel } from '../../src/ui/hud';
import './ui-harness-api';

/**
 * The clock readout says the game is stopped (#639, ruling 1).
 *
 * ## The defect
 *
 * `speed.textContent` was written from `viewModel.clock.speed` alone, so `×1`
 * printed identically whether the clock was running or not. The whole readout
 * -- `Day 1 / 0% / ×1` -- was byte-identical in both states, and the only
 * paused cue was an accent tint on a 44px icon. The owner played a session
 * against that: 40 build orders placed, 2,400 spent on bricks, 25,000 still in
 * the bank, nothing built, and every channel agreeing with them (#627, #636).
 *
 * The owner's ruling is `PAUSED` in place of `×1` **plus greying the readout**
 * -- a word and a second visual channel, so the state does not rest on reading
 * one word.
 *
 * ## Why a browser, and why `pnpm test` cannot do this
 *
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so `status-strip.ts`
 * is not merely untested there, it is unreachable -- and the greying is a CSS
 * rule keyed off `data-clock-mode`, which only a browser resolves at all. A
 * headless test could assert the string and would be blind to whether the
 * second channel exists, which is the half the ruling insists on.
 *
 * ## What is asserted, and what each assertion is for
 *
 * - The **word**, both ways round: paused renders `PAUSED`, running renders the
 *   multiplier. Asserting only the paused branch would pass against a readout
 *   that says `PAUSED` for ever.
 * - The **box**, because #629 is a standing directive that information which
 *   reaches nobody does not count. A readout scrolled out of the strip is in
 *   the DOM and on nobody's screen.
 * - The **colour**, resolved by the browser and compared against the token
 *   layer rather than against a literal `rgb(...)` -- so a re-skin moves the
 *   assertion with the palette, which is what `src/ui/tokens.css` exists for.
 *
 * 900x600 is the binding viewport this repository argues every layout decision
 * against, and it is the width where the strip is already tight enough for a
 * wider readout to cost something.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

/**
 * The shipped sentence, read through the same catalogue the application ships,
 * rather than typed out here. A test carrying its own copy of the copy passes
 * when the locale entry is deleted.
 */
const PAUSED_TEXT = localizer.format(HUD_MESSAGE_KEY.clockPaused);

interface ClockReading {
  readonly speedText: string;
  readonly clockMode: string | null;
  /** The strip's own `innerText`, with every `.ui-sr-only` span dropped. */
  readonly sightedText: string;
  readonly speedBox: { readonly width: number; readonly height: number };
  /** Whether the readout's box lies inside the strip's own visible box. */
  readonly speedOnScreen: boolean;
  readonly speedColor: string;
  readonly dayColor: string;
  readonly dayProgressColor: string;
  /** `--text-muted` etc., resolved by the browser into the same `rgb()` form. */
  readonly tokens: Readonly<Record<string, string>>;
  /** How far the metrics row overflows, so the cost of a wider readout is measured. */
  readonly metricsOverflow: number;
}

function viewModelWithClock(mode: HudClockMode, speed: HudSpeed): HudViewModel {
  return {
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
      activeIncidents: 2,
      contrabandFound: 4,
      treasuryMinorUnits: 24_920,
      stateIncomeAccruedTodayMinorUnits: 10_667,
    },
    clock: { day: 3, tickOfDay: 600, dayLengthTicks: 2_400, mode, speed },
    alerts: [],
  };
}

async function setClock(page: Page, mode: HudClockMode, speed: HudSpeed): Promise<void> {
  await page.evaluate(
    (viewModel) => window.lockstateUiHarness.setHudViewModel(viewModel as HudViewModel),
    viewModelWithClock(mode, speed) as unknown,
  );
}

async function readClock(page: Page): Promise<ClockReading> {
  return page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('.hud-strip');
    if (strip === null) throw new Error('no status strip in the mounted HUD');
    const speed = strip.querySelector<HTMLElement>('.hud-clock__speed');
    if (speed === null) throw new Error('no speed readout in the mounted HUD');
    const day = strip.querySelector<HTMLElement>('.hud-clock__day');
    const dayProgress = strip.querySelector<HTMLElement>('.hud-clock__day-progress');
    if (day === null || dayProgress === null) throw new Error('no day readout in the mounted HUD');
    const metrics = strip.querySelector<HTMLElement>('.hud-strip__metrics');

    // A `#rrggbb` token and a computed `color` are the same colour in two
    // notations, so the token is pushed through the browser's own parser
    // rather than converted by hand here.
    const probe = document.createElement('span');
    strip.append(probe);
    const resolved = (token: string): string => {
      probe.style.color = `var(${token})`;
      return window.getComputedStyle(probe).color;
    };
    const tokens = {
      '--text-muted': resolved('--text-muted'),
      '--text-subtle': resolved('--text-subtle'),
      '--text-heading': resolved('--text-heading'),
    };
    probe.remove();

    const stripBox = strip.getBoundingClientRect();
    const speedBox = speed.getBoundingClientRect();

    // `innerText` reflects layout, so a span that is `.ui-sr-only` is dropped
    // by cloning the strip and removing them: the survey #636 had to correct
    // itself over is that "Pause" and "Speed 1×" are in `innerText` and on
    // nobody's screen.
    const clone = strip.cloneNode(true) as HTMLElement;
    for (const hidden of clone.querySelectorAll('.ui-sr-only')) hidden.remove();
    clone.style.position = 'absolute';
    clone.style.left = '-10000px';
    document.body.append(clone);
    const sightedText = clone.innerText.replace(/\s+/g, ' ').trim();
    clone.remove();

    return {
      speedText: (speed.textContent ?? '').trim(),
      clockMode: strip.getAttribute('data-clock-mode'),
      sightedText,
      speedBox: { width: Math.round(speedBox.width * 100) / 100, height: Math.round(speedBox.height * 100) / 100 },
      speedOnScreen: speedBox.left >= stripBox.left - 0.5 && speedBox.right <= stripBox.right + 0.5,
      speedColor: window.getComputedStyle(speed).color,
      dayColor: window.getComputedStyle(day).color,
      dayProgressColor: window.getComputedStyle(dayProgress).color,
      tokens,
      metricsOverflow: metrics === null ? -1 : metrics.scrollWidth - metrics.clientWidth,
    };
  });
}

test.describe('the clock readout says the game is stopped (#639)', () => {
  test.use({ viewport: { width: 900, height: 600 } });

  test('renders PAUSED and greys the readout while paused, and neither while running', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    // ---- stopped -------------------------------------------------------
    await setClock(page, 'paused', 1);
    const paused = await readClock(page);
    console.log(`[paused] ${JSON.stringify(paused)}`);

    expect(paused.clockMode, 'the strip must stamp the mode it is rendering').toBe('paused');
    expect(paused.speedText, 'a stopped clock still printed the running readout').toBe(PAUSED_TEXT);
    expect(PAUSED_TEXT, 'the approved string is PAUSED and nothing else').toBe('PAUSED');

    // In the DOM is not on screen. Both are asserted because the strip is a
    // flex row that shrinks its metrics before anything else, and `PAUSED` is
    // three times as wide as the `×1` it replaces.
    expect(paused.speedBox.width, 'the readout measured zero width, so it is in the DOM and not on screen').toBeGreaterThan(0);
    expect(paused.speedBox.height, 'the readout measured zero height').toBeGreaterThan(0);
    expect(paused.speedOnScreen, 'the readout sits outside the strip, so it reaches nobody -- #629').toBe(true);
    expect(paused.sightedText, 'the word must be readable by a sighted player, not only by a screen reader').toContain(PAUSED_TEXT);

    // The second channel. Three readouts, because while the clock is stopped
    // the day and the position within it are frozen too.
    expect(paused.speedColor, 'the paused speed readout is not greyed').toBe(paused.tokens['--text-muted']);
    expect(paused.dayColor, 'the paused day number is not greyed').toBe(paused.tokens['--text-muted']);
    expect(paused.dayProgressColor, 'the paused day-progress readout is not greyed').toBe(paused.tokens['--text-muted']);

    // ---- running -------------------------------------------------------
    await setClock(page, 'running', 2);
    const running = await readClock(page);
    console.log(`[running] ${JSON.stringify(running)}`);

    expect(running.clockMode).toBe('running');
    expect(running.speedText, 'a running clock must print its multiplier, not the paused word').toBe('×2');
    expect(running.sightedText, 'the paused word survived the clock starting').not.toContain(PAUSED_TEXT);

    // And the greying is a *difference*, not a colour that happens to be
    // muted in both states -- which is the only way the second channel says
    // anything at all.
    expect(running.speedColor, 'the speed readout is the same colour running as stopped').not.toBe(paused.speedColor);
    expect(running.dayColor, 'the day number is the same colour running as stopped').not.toBe(paused.dayColor);
    expect(running.dayProgressColor, 'the day progress is the same colour running as stopped').not.toBe(
      paused.dayProgressColor,
    );
    expect(running.speedColor).toBe(running.tokens['--text-subtle']);
    expect(running.dayColor).toBe(running.tokens['--text-heading']);

    // ---- back to stopped, so this is a state and not a first paint ------
    await setClock(page, 'paused', 2);
    const repaused = await readClock(page);
    console.log(`[re-paused] ${JSON.stringify(repaused)}`);
    expect(repaused.speedText, 'a clock paused at ×2 must still say it is stopped').toBe(PAUSED_TEXT);
    expect(repaused.dayColor).toBe(repaused.tokens['--text-muted']);
  });
});
