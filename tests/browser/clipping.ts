import { type Page, expect } from './network-changed-fixture';

/**
 * "This element is not clipped" -- the assertion issue #720 was filed for the
 * absence of.
 *
 * ## Why reading the text is not enough, and neither is `expectLaidOut`
 *
 * Every text assertion this repository has on a rendered surface reads the
 * DOM: `textContent`, `innerText`, `toHaveText`, `toContainText`. All four
 * return the **whole** string from an element that is showing ten characters
 * of it, because `overflow: hidden` is a painting decision and the text node
 * is untouched. `ui-shell.spec.ts`'s `expectLaidOut` pairs a text assertion
 * with `getClientRects().length > 0`, which answers a different question --
 * "is this element laid out at all" -- and a clipped element is laid out.
 *
 * So on 2026-08-31 the HUD's alerts log showed about ten characters of every
 * sentence in it, at every viewport, with the whole suite green: four
 * separate acts of DOM probing during a playtest reported the sentences
 * present and correct, and **only a screenshot found it** (#720).
 *
 * ## What is measured
 *
 * `scrollWidth`/`scrollHeight` against `clientWidth`/`clientHeight`: the
 * browser's own answer to "is there content outside the box". What makes an
 * overflow a finding is whether the reader can get to it, which is the
 * element's own computed `overflow` on the axis that overflows:
 *
 * - `hidden` or `clip` -- **`cut`**. The content is not painted at all. The
 *   alerts log was this: `scrollWidth 218` against `clientWidth 88`, and a
 *   player read `Contraban...`.
 * - `visible` -- **`spilled`**. The content *is* painted, outside the box it
 *   was given: over whatever sits beside it, and cut anyway by the first
 *   ancestor that clips. `.hud-rooms__note` is this at 1280x800 and
 *   1920x1080 -- `469 / 238`, the game's only instruction for drawing a room
 *   painted past the panel's right border.
 * - `auto` or `scroll` -- **not a finding**. There is overflow and a player
 *   can reach it, which is the whole point of the scrolling
 *   `.hud-alerts__list` (#703 ruling 1).
 *
 * **`spilled` is reported because a narrower check missed half the defect.**
 * The first version of this file counted only `cut`, and swept clean over
 * three of the four labels `docs/research/2026-08-31-playing-the-twelve.md`
 * §12 measured painting outside their boxes -- it reported the *panel* that
 * eventually clipped them and never the label, and where no ancestor clipped
 * it reported nothing at all. A check that only sees content that vanished
 * cannot see content that landed on its neighbour.
 *
 * That last case is also why an `auto` box is not automatically innocent.
 * `.save-panel` is `overflow-y: auto` and hides 130px of itself below its own
 * fold on the Build and Rooms tabs -- `Load` and `Delete` among them -- with
 * no scrollbar drawn to say so (§11). It is reachable, so this check is
 * silent about it, correctly: that is an affordance defect and not a clipping
 * one, and it needs its own assertion rather than a looser version of this.
 *
 * Three deliberate limits, stated so a green result is not read as more than
 * it is:
 *
 * - **`.ui-sr-only` is excluded.** The visually-hidden pattern is a 1x1 box
 *   with its content clipped away on purpose; every one of them would fire
 *   here, and fixing one would delete the screen-reader text.
 * - **A 1px overflow is ignored.** `scrollWidth` and `clientWidth` are
 *   integers rounded from fractional layout, so a box that fits exactly can
 *   report a pixel of overflow.
 * - **A `cut` element is not always the one carrying the text.** A sentence
 *   with `overflow: visible` inside a panel with `overflow: hidden` is
 *   reported twice: `spilled` on the sentence, `cut` on the panel. The panel
 *   row names the box that did the cutting; look inside it for the string.
 */

/** Whether the overflow is painted somewhere else or not painted at all. */
export type ClippingKind = 'cut' | 'spilled';

/** One element whose content does not stay inside the box it was given. */
export interface ClippedElement {
  /** Tag, id and classes, enough to find it in the stylesheet. */
  readonly selector: string;
  /**
   * `cut` when the overflowing axis is `overflow: hidden` or `clip`, so the
   * content is not painted; `spilled` when it is `visible`, so the content is
   * painted outside this element's own box.
   */
  readonly kind: ClippingKind;
  /** `scrollWidth - clientWidth`, or 0 when the horizontal axis stays inside. */
  readonly hiddenX: number;
  /** `scrollHeight - clientHeight`, or 0 when the vertical axis stays inside. */
  readonly hiddenY: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  /** The first 80 characters of the text, so a failure names the sentence. */
  readonly text: string;
}

/** What `probeClipping` answers about one selector. */
export interface ClippingProbe {
  /** How many elements the selector matched, so an empty match cannot pass. */
  readonly matched: number;
  /** Those of them the browser is cutting content off. */
  readonly clipped: readonly ClippedElement[];
}

/**
 * Runs **in the page**: how many elements `selector` matched, and which of
 * them are clipped.
 *
 * Self-contained on purpose -- Playwright ships this to the browser as its
 * own source text, so it may close over nothing from this module.
 */
export function probeClipping(selector: string): ClippingProbe {
  const describe = (el: Element): string => {
    let out = el.tagName.toLowerCase();
    if (el.id !== '') out += `#${el.id}`;
    for (const className of el.classList) out += `.${className}`;
    return out;
  };

  /** `undefined` when the reader can scroll to the overflow on this axis. */
  const kindOf = (overflow: string): ClippingKind | undefined => {
    if (overflow === 'hidden' || overflow === 'clip') return 'cut';
    if (overflow === 'visible') return 'spilled';
    return undefined;
  };

  const matches = [...document.querySelectorAll(selector)];
  const clipped: ClippedElement[] = [];
  for (const el of matches) {
    if (el.classList.contains('ui-sr-only')) continue;
    if (el.getClientRects().length === 0) continue;
    const style = getComputedStyle(el);
    const kindX = kindOf(style.overflowX);
    const kindY = kindOf(style.overflowY);
    const overX = el.scrollWidth - el.clientWidth;
    const overY = el.scrollHeight - el.clientHeight;
    const outX = kindX !== undefined && overX > 1;
    const outY = kindY !== undefined && overY > 1;
    if (!outX && !outY) continue;
    clipped.push({
      selector: describe(el),
      // `cut` wins when both axes are out: it is the worse of the two, and a
      // box that hides content on one axis is not made better by spilling on
      // the other.
      kind: (outX ? kindX : kindY) === 'cut' || (outY ? kindY : kindX) === 'cut' ? 'cut' : 'spilled',
      hiddenX: outX ? overX : 0,
      hiddenY: outY ? overY : 0,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      text: (el.textContent ?? '').trim().slice(0, 80),
    });
  }
  return { matched: matches.length, clipped };
}

/**
 * Asserts that nothing matching `selector` puts content outside its own box --
 * neither `cut` nor `spilled`.
 *
 * Pair this with a text assertion the way `expectLaidOut` is paired with one:
 * the text assertion says the string is in the DOM, `expectLaidOut` says the
 * element is on the page, and this says the string is where the element is.
 * All three are needed and none implies another.
 *
 * An empty match is a failure, for the reason `laidOut` gives for the same
 * choice: an assertion that outlived the element it was written for would
 * otherwise go quietly green by matching nothing.
 */
export async function expectNotClipped(page: Page, selector: string, what: string): Promise<void> {
  const probe = await page.evaluate(probeClipping, selector);

  expect(probe.matched, `${what} (${selector}) matched no element, so this assertion proves nothing`).toBeGreaterThan(
    0,
  );
  expect(
    probe.clipped,
    `${what} (${selector}) does not keep its content inside its own box: 'cut' is content the browser never painted, 'spilled' is content it painted outside this element`,
  ).toEqual([]);
}
