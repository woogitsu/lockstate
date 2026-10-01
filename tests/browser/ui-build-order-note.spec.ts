import { expect, test, type Page } from './network-changed-fixture';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';

/**
 * The sentence a paused newcomer needs, and whether anything renders it
 * (issue #920, the owner's first ruling of 2026-08-30 in issue #639).
 *
 * ## What went wrong, and why a resolution gate could not see it
 *
 * `hud.build.note` -- *"An order is queued now and built while the clock
 * runs."* -- has been in the shipped locale and in `HUD_MESSAGE_KEY` since it
 * was written, and had **no renderer at all** from `67e366e` (2026-08-23) to
 * 2026-09-04. That commit moved the submit button into the folded "Enter
 * coordinates" section and deleted the `.hud-build__footer` the sentence shared
 * with it; the key stayed in the catalogue.
 *
 * `tests/unit/ui-hud-messages.test.ts` pins that every `HUD_MESSAGE_KEY`
 * *resolves*. Nothing pinned that anything renders one, which is the hole
 * issue #920 names: **a locale key with no implementation behind it is
 * `AGENTS.md`'s fourth reservation, and this one had had an implementation and
 * lost it, so no gate noticed.** `docs/research/2026-09-04-the-first-ten-minutes.md`
 * act 4 measured what that costs a player: 24 orders, 1,920 spent, tick `-1`
 * for 21 seconds, `24 waiting / 0 being built`, and `/clock/i` false against
 * the entire laid-out HUD.
 *
 * ## Why this is the assembled page and not `ui-harness.html`
 *
 * Every claim below is about the panel's height budget, and the harness leaves
 * `hud.asideSlot` empty -- `.hud__aside:empty { display: none }` then hands the
 * Build panel 128.7px more rail than the application ever gives it. `hud.css`'s
 * `.hud-build[data-queued]` block records that trap in its own words, and issue
 * #174 is the record of what a measurement taken on that surface is worth. So
 * this opens `/index.html`, presses `New prison`, and measures the panel with
 * the save panel above it.
 *
 * ## The two states, and which one carries which claim
 *
 * - **Arrival**, nothing queued: the sentence must have *no box*, and the panel
 *   must arrive with `scrollHeight === clientHeight`. That second assertion is
 *   the one that keeps this fix from re-breaking what `445f5465` protected --
 *   an unconditionally laid-out line costs 27px of overflow at 1280x720 and 9px
 *   at 900x600, measured on 2026-09-04 by injecting it from a test.
 * - **Queued**: the sentence must be laid out, unclipped, and **inside the
 *   panel's unscrolled fold**, at every viewport 701px tall or taller. Not
 *   merely "in the DOM": PR #647's own review found a variant that resolved to
 *   one element with a 0x0 box inside a shut fold, which is issue #627's defect
 *   exactly. And at 900x600 it must have **no box at all** -- the panel cannot
 *   pay for it there, and that gap fails this test the moment it closes rather
 *   than passing quietly either way.
 * - **Queued, and what the sentence is paid for with**: the arm hint is clamped
 *   to two of its lines while a queue exists, and the deliveries block below the
 *   sentence keeps #703 ruling 2's guarantee. That coupling is the assertion the
 *   first version of this fix did not have, and it is the one that caught it.
 *
 * Every subject is found by its **rendered text**, read out of the shipped
 * catalogue, rather than by the class this change adds. A test that looked for
 * `.hud-build__order-note` would pass on a build that rendered an empty span,
 * and would fail on a rename that lost nothing.
 */

const APP_URL = '/index.html';

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

/** The shipped sentence, from the catalogue the page itself renders. */
const NOTE_TEXT = localizer.format(HUD_MESSAGE_KEY.buildNote);
/** The word the status strip prints while the clock is stopped (#639 ruling 1). */
const PAUSED_TEXT = localizer.format(HUD_MESSAGE_KEY.clockPaused);

/**
 * The five sizes `HUD_LAYOUT_VIEWPORTS` in `app-shell.spec.ts` visits, and the
 * same order. Copied rather than imported because that constant is local to
 * that file; the list is asserted to be five entries long below so a drift
 * shows up as a failure rather than as silence.
 */
const VIEWPORTS = [
  [1280, 720],
  [1440, 900],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

interface NoteReading {
  /** How many laid-out elements carry the sentence as their whole text. */
  readonly matches: number;
  /** How many carry it at all, laid out or not -- so "in the DOM with no box" is visible. */
  readonly inDocument: number;
  readonly box: { readonly width: number; readonly height: number } | null;
  /** Ancestors that would hide the sentence: a shut fold, or `hidden`. */
  readonly foldedAncestors: readonly string[];
  /** `scrollHeight > clientHeight` on the sentence's own box -- a clipped line. */
  readonly clipped: boolean;
  /** The sentence's bottom edge against the Build panel's unscrolled fold. */
  readonly bottom: number | null;
  readonly fold: number;
  /** `scrollHeight - clientHeight` on `.hud-build`, unscrolled. */
  readonly panelOverflow: number;
  readonly panelHeight: number;
  /** Whether the queue block is laid out, so the state is not in doubt. */
  readonly queueLaidOut: boolean;
  /** Whether the strip's sighted text carries the paused word at this instant. */
  readonly pausedOnScreen: boolean;
  /** What `/clock/i` finds in the whole laid-out HUD -- the playtest's own probe. */
  readonly hudMentionsTheClock: boolean;
  /** The sentences that match it, so a `true` can be read rather than trusted. */
  readonly clockMentions: readonly string[];
  /**
   * #703 ruling 2's guarantee, re-asserted here because this change is what
   * puts pressure on it: the money the game spent and the control that gives it
   * back are on screen with nothing opened and nothing scrolled. The sentence
   * is laid out immediately above that block, so a note that is not paid for
   * pushes the refund out of the panel -- measured doing exactly that before
   * `hud.css` paid for it out of the arm hint's fourth line.
   */
  readonly deliveriesPending: string | null;
  readonly spendInFold: boolean | null;
  readonly firstRefundInFold: boolean | null;
  readonly firstRefundBottom: number | null;
  /** The arm hint: how much of it is shown, and whether its text is intact. */
  readonly armHintLinesShown: number | null;
  readonly armHintLinesTotal: number | null;
  readonly armHintTextIntact: boolean | null;
}

async function readNote(page: Page, sentence: string, pausedWord: string): Promise<NoteReading> {
  return page.evaluate(
    ({ sentence: text, pausedWord: paused }) => {
      const panel = document.querySelector('.hud-build');
      if (panel === null) throw new Error('the Build panel is not mounted');
      // Unscrolled, because every question below is about the fold rather than
      // about where the player happens to have scrolled to.
      panel.scrollTop = 0;
      const panelRect = panel.getBoundingClientRect();
      const fold = panelRect.top + panel.clientTop + panel.clientHeight;

      const carriers = [...document.querySelectorAll<HTMLElement>('.hud *')].filter(
        (node) => node.textContent?.trim() === text && node.children.length === 0,
      );
      const laidOut = carriers.filter((node) => node.getClientRects().length > 0);
      const subject = laidOut[0] ?? carriers[0] ?? null;

      const foldedAncestors: string[] = [];
      for (let node = subject; node !== null; node = node.parentElement) {
        const classes = typeof node.className === 'string' ? node.className.trim() : '';
        if (node.hasAttribute('hidden')) foldedAncestors.push(`${classes}:hidden`);
        if (node.getAttribute('data-collapsed') === 'true') foldedAncestors.push(`${classes}:collapsed`);
      }

      const rect = subject === null || subject.getClientRects().length === 0 ? null : subject.getBoundingClientRect();
      const strip = document.querySelector<HTMLElement>('.hud-strip');
      /*
       * `innerText` of an in-document clone with the screen-reader spans
       * removed, which is `ui-clock-paused-readout.spec.ts`'s own technique and
       * is load-bearing in **both** directions here.
       *
       * `textContent` was the first attempt and it is wrong in the way that
       * matters most for this test: it reads the text of `display: none`
       * elements, so it finds this very sentence while it is `hidden` and the
       * arrival assertion below passes for the wrong reason. It read `true`
       * with nothing queued on the first run, which is exactly the state issue
       * #920 is about. `innerText` reflects layout, so a hidden element
       * contributes nothing -- and the clone has to be *in* the document,
       * because an off-document node has no layout and reports `innerText` as
       * `textContent` all over again.
       *
       * Dropping `.ui-sr-only` is the other half, and #636 is the record of why:
       * "Pause" and "Speed 1x" are in `innerText` and on nobody's screen.
       */
      const sighted = (element: HTMLElement | null): string => {
        if (element === null) return '';
        const copy = element.cloneNode(true) as HTMLElement;
        for (const hidden of copy.querySelectorAll('.ui-sr-only')) hidden.remove();
        copy.style.position = 'absolute';
        copy.style.left = '-10000px';
        copy.style.top = '0';
        document.body.append(copy);
        const text = copy.innerText.replace(/\s+/g, ' ').trim();
        copy.remove();
        return text;
      };
      const hud = document.querySelector<HTMLElement>('.hud');
      const hudText = sighted(hud);

      const deliveries = document.querySelector('.hud-build__deliveries');
      const spend = document.querySelector('.hud-build__deliveries-count');
      const spendRect = spend === null || spend.getClientRects().length === 0 ? null : spend.getBoundingClientRect();
      const refund = document.querySelector('.hud-build__delivery-row .ui-action');
      const refundRect = refund === null || refund.getClientRects().length === 0 ? null : refund.getBoundingClientRect();
      const armHint = document.querySelector<HTMLElement>('.hud-build__arm-hint');
      const armLine = armHint === null ? 0 : Number.parseFloat(getComputedStyle(armHint).lineHeight);

      return {
        deliveriesPending: deliveries?.getAttribute('data-pending') ?? null,
        spendInFold:
          spendRect === null ? null : spendRect.top >= panelRect.top - 0.5 && spendRect.bottom <= fold + 0.5,
        firstRefundInFold:
          refundRect === null ? null : refundRect.top >= panelRect.top - 0.5 && refundRect.bottom <= fold + 0.5,
        firstRefundBottom: refundRect === null ? null : Math.round(refundRect.bottom * 10) / 10,
        armHintLinesShown:
          armHint === null || armLine === 0 ? null : Math.round((armHint.clientHeight / armLine) * 10) / 10,
        armHintLinesTotal:
          armHint === null || armLine === 0 ? null : Math.round((armHint.scrollHeight / armLine) * 10) / 10,
        armHintTextIntact: armHint === null ? null : (armHint.textContent ?? '').length > 100,
        matches: laidOut.length,
        inDocument: carriers.length,
        box: rect === null ? null : { width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 },
        foldedAncestors,
        clipped: subject === null ? false : subject.scrollHeight > subject.clientHeight + 0.5,
        bottom: rect === null ? null : Math.round(rect.bottom * 10) / 10,
        fold: Math.round(fold * 10) / 10,
        panelOverflow: panel.scrollHeight - panel.clientHeight,
        panelHeight: Math.round(panelRect.height * 10) / 10,
        queueLaidOut: (document.querySelector('.hud-build__queue')?.getClientRects().length ?? 0) > 0,
        pausedOnScreen: sighted(strip).includes(paused),
        hudMentionsTheClock: /clock/i.test(hudText),
        clockMentions: (hudText.match(/[^.]*clock[^.]*\./gi) ?? []).map((sentence) => sentence.trim()),
      };
    },
    { sentence, pausedWord },
  );
}

/** Six orders through the panel's own numeric route, with the clock left stopped. */
async function queueSixOrders(page: Page): Promise<void> {
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  const submit = page.locator('.hud-build__coordinates .ui-action');
  // Six rather than one because construction builds one order at a time
  // (#348), and the clock is never started: ADR 0051's paused drain executes
  // and publishes a command submitted against a stopped clock, which is what
  // makes the whole state under test reachable without a tick.
  for (const tileY of [5, 6, 7, 8, 9, 10]) {
    await page.getByRole('spinbutton', { name: 'Tile X' }).fill('5');
    await page.getByRole('spinbutton', { name: 'Tile Y' }).fill(String(tileY));
    await submit.click();
  }
  if ((await coordinates.getAttribute('aria-expanded')) === 'true') await coordinates.click();
  await expect
    .poll(async () => page.locator('.hud-build').getAttribute('data-queued'), {
      message: 'no order reached the queue projection',
      timeout: 20_000,
    })
    .not.toBeNull();
}

test.describe('the Build panel says what a queued order is waiting for', () => {
  test('the sentence has no box until something is queued, and the arrival panel keeps its budget (#920)', async ({
    page,
  }) => {
    test.slow();
    expect(VIEWPORTS.length, 'the viewport list drifted from app-shell.spec.ts').toBe(5);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(APP_URL);
    await page.waitForSelector('#game-root canvas');
    await page.waitForSelector('.save-panel');
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
    await page.locator('.ui-tab[data-tab="build"]').click();
    await expect(page.locator('.hud-build')).toBeVisible();

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => (await page.locator('.hud-build').boundingBox())?.width, {
          message: `the Build panel did not settle at ${width}x${height}`,
        })
        .toBeGreaterThan(0);

      const arrival = await readNote(page, NOTE_TEXT, PAUSED_TEXT);
      console.log(`[920] arrival ${width}x${height} ${JSON.stringify(arrival)}`);

      // Vacuity guard, the shape `app-shell.spec.ts`'s #174 test carries: a
      // panel that failed to lay out reports plausible numbers and every
      // comparison below holds.
      expect(arrival.panelHeight, `the Build panel is not laid out at ${width}x${height}`).toBeGreaterThan(150);
      expect(arrival.queueLaidOut, `something is queued at ${width}x${height}`).toBe(false);
      expect(
        arrival.matches,
        `"${NOTE_TEXT}" is laid out with nothing queued at ${width}x${height}`,
      ).toBe(0);
      // The sentence's element exists in the DOM the whole time -- that is what
      // makes the arrival state free, and asserting it is what tells a later
      // reader that `matches: 0` above is a hidden element rather than an
      // absent renderer.
      expect(
        arrival.inDocument,
        `the sentence's element is not in the DOM at all at ${width}x${height}, so nothing renders it`,
      ).toBe(1);
      // The claim `445f5465` dropped the renderer to protect. An
      // unconditionally laid-out line put this at 27 and 9 at two of these five.
      expect(
        arrival.panelOverflow,
        `the Build panel arrives with more content than box at ${width}x${height}`,
      ).toBe(0);
      // The playtest's own probe, in the state it was taken in. It is asserted
      // here as the *baseline* -- act 4 of
      // `docs/research/2026-09-04-the-first-ten-minutes.md` measured
      // `/clock/i` false against the whole laid-out HUD, and it is still false
      // on arrival. What #920 changes is the queued state, which is the state
      // the money has left the treasury in, and the second test asserts the
      // same probe is true there.
      expect(
        arrival.clockMentions,
        `something on the arriving HUD mentions the clock at ${width}x${height}`,
      ).toEqual([]);
      // `hud.css` pays for the sentence out of the arm hint's fourth line, and
      // that clamp is scoped to `.hud-build[data-queued]`. With nothing queued
      // the hint must be exactly as long as it was: whatever the viewport's own
      // rules leave it, no line taken by this change.
      expect(
        arrival.armHintLinesShown,
        `the arm hint lost a line with nothing queued at ${width}x${height}`,
      ).toBe(height > 700 ? arrival.armHintLinesTotal : 1);
    }
  });

  test('with orders queued the sentence is on screen, unfolded and unclipped, at every viewport (#920)', async ({
    page,
  }) => {
    test.slow();

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(APP_URL);
    await page.waitForSelector('#game-root canvas');
    await page.waitForSelector('.save-panel');
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
    await page.locator('.ui-tab[data-tab="build"]').click();
    await expect(page.locator('.hud-build')).toBeVisible();
    await queueSixOrders(page);

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => (await page.locator('.hud-build').boundingBox())?.width, {
          message: `the Build panel did not settle at ${width}x${height}`,
        })
        .toBeGreaterThan(0);

      const queued = await readNote(page, NOTE_TEXT, PAUSED_TEXT);
      console.log(`[920] queued ${width}x${height} ${JSON.stringify(queued)}`);

      expect(queued.panelHeight, `the Build panel is not laid out at ${width}x${height}`).toBeGreaterThan(150);
      // The state is the one this test claims to be about.
      expect(queued.queueLaidOut, `nothing is queued at ${width}x${height}`).toBe(true);

      /*
       * The one viewport where this fix does not reach the player, asserted
       * rather than left to be discovered.
       *
       * Below 701px tall `hud.css` does not render the sentence at all, because
       * the arm hint it is paid for out of is already on that block's one-line
       * clamp and there is nothing to take -- and because one clipped line of
       * this sentence reads as a confirmation that the order is being built.
       * The reasoning is beside `.hud-build__order-note { display: none }` in
       * that block.
       *
       * This is a **failing-closed** assertion, not an exemption: a change that
       * makes the sentence fit here fails this test and has to come and say so,
       * which is the opposite of the silence that let `hud.build.note` go
       * unrendered for twelve days.
       */
      if (height <= 700) {
        expect(
          queued.matches,
          `the sentence is laid out at ${width}x${height}, which is below the 701px boundary hud.css suppresses it under`,
        ).toBe(0);
        expect(
          queued.spendInFold,
          `the spend line left the panel's fold at ${width}x${height} with no sentence on the panel at all`,
        ).toBe(true);
        expect(
          queued.firstRefundInFold,
          `the first refund's Cancel left the panel's fold at ${width}x${height} with no sentence on the panel at all`,
        ).toBe(true);
        continue;
      }

      expect(queued.matches, `laid-out carriers of "${NOTE_TEXT}" at ${width}x${height}`).toBe(1);
      expect(
        queued.box?.height ?? 0,
        `the sentence has no height at ${width}x${height}: ${JSON.stringify(queued.box)}`,
      ).toBeGreaterThan(10);
      // #627's defect: present, keyed, resolved, and behind a shut fold.
      expect(queued.foldedAncestors, `the sentence is inside something shut at ${width}x${height}`).toEqual([]);
      // Half of this sentence reads as a confirmation that the order is being
      // built, which is the opposite of what it is for. `hud.css`'s
      // `max-height: 700px` clamp is what would do it, at 900x600.
      expect(queued.clipped, `the sentence is clipped mid-word at ${width}x${height}`).toBe(false);
      // The property the other candidate placement could not deliver at any
      // viewport: readable with nothing scrolled.
      expect(
        queued.bottom ?? Number.POSITIVE_INFINITY,
        `the sentence is below the unscrolled Build panel's fold at ${width}x${height}: it ends at y=${queued.bottom} in a panel clipped at y=${queued.fold}`,
      ).toBeLessThanOrEqual(queued.fold + 0.5);

      // The pair that actually closes the dead end, asserted together because
      // either alone leaves it open: the sentence names the clock, and the
      // strip says the clock is stopped. Act 4 of the 2026-09-04 playtest had
      // the second without the first.
      expect(queued.pausedOnScreen, `the strip does not say the clock is stopped at ${width}x${height}`).toBe(true);
      expect(
        queued.hudMentionsTheClock,
        `/clock/i still matches nothing in the laid-out HUD at ${width}x${height}, which is the playtest's own probe`,
      ).toBe(true);

      /*
       * #703 ruling 2, under this change's pressure -- and this is the
       * assertion that caught the first attempt at it.
       *
       * A queued order buys its own materials (#640), so the state above always
       * carries pending deliveries too, and their block is the last thing in
       * `.hud-build__map` -- immediately below the sentence. With the sentence
       * added and nothing given back, the first refund's Cancel left the
       * panel's unscrolled box at 1280x720 and 900x600. The vacuity guard is
       * first: without a pending delivery there is nothing to displace and the
       * two assertions under it would pass on any layout at all.
       */
      expect(
        queued.deliveriesPending,
        `nothing is on its way at ${width}x${height}, so the displacement this asserts about cannot happen`,
      ).not.toBeNull();
      expect(queued.spendInFold, `the spend line left the panel's fold at ${width}x${height}`).toBe(true);
      expect(
        queued.firstRefundInFold,
        `the first refund's Cancel left the panel's fold at ${width}x${height}: it ends at y=${queued.firstRefundBottom} in a panel clipped at y=${queued.fold}`,
      ).toBe(true);

      // And what was taken to pay for it: the arm hint is clamped to two lines
      // while a queue exists, which is exactly the 26.4px the sentence costs at
      // the rail's width and the 13.2px it costs at 375px. Asserted as "two,
      // and not fewer" -- the number is the price, so a clamp that drifted
      // tighter would be taking more from the hint than the sentence needs.
      expect(queued.armHintLinesShown, `the arm hint is not clamped to two lines at ${width}x${height}`).toBe(
        Math.min(2, queued.armHintLinesTotal ?? 2),
      );
      // The text itself is never replaced -- the clamp cuts the box, and a
      // screen reader still gets the whole sentence.
      expect(queued.armHintTextIntact, `the arm hint's text was truncated rather than clipped at ${width}x${height}`).toBe(
        true,
      );
    }
  });

  test('queued construction points a paused Full HD player to Play (#936)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(APP_URL);
    await page.waitForSelector('#game-root canvas');
    await page.waitForSelector('.save-panel');
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.locator('.ui-tab[data-tab="build"]').click();
    await queueSixOrders(page);

    const note = page.locator('.hud-build__order-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Play');
    await expect(page.getByTitle('Play at normal speed')).toBeVisible();
    const queued = await readNote(page, NOTE_TEXT, PAUSED_TEXT);
    expect(queued.matches).toBe(1);
    expect(queued.clipped).toBe(false);
    expect(queued.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(queued.fold + 0.5);
  });
});
