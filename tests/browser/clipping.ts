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
 * browser's own answer to "is there content outside the box". An element
 * counts as clipped only when the axis that overflows is also the axis whose
 * computed `overflow` is `hidden` or `clip` -- an `auto` or `scroll` box has
 * overflow too, and a player can reach it, which is the whole point of the
 * scrolling `.hud-alerts__list` (#703 ruling 1). Anything the reader can get
 * to is not this check's business.
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
 * - **The element reported is the one whose own box clips**, which is not
 *   always the element carrying the text. A sentence with `overflow:
 *   visible` in a panel with `overflow: hidden` is cut by the panel, and it
 *   is the panel this reports; look inside it for the string. Measured:
 *   `.hud-rooms` reports `scrollWidth 481` against `clientWidth 262` at
 *   every viewport, and the 469px inside it is `.hud-rooms__note`.
 */

/** One element the browser is cutting content off, and by how much. */
export interface ClippedElement {
  /** Tag, id and classes, enough to find it in the stylesheet. */
  readonly selector: string;
  /** `scrollWidth - clientWidth`, or 0 when the horizontal axis is not clipped. */
  readonly hiddenX: number;
  /** `scrollHeight - clientHeight`, or 0 when the vertical axis is not clipped. */
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

  const matches = [...document.querySelectorAll(selector)];
  const clipped: ClippedElement[] = [];
  for (const el of matches) {
    if (el.classList.contains('ui-sr-only')) continue;
    if (el.getClientRects().length === 0) continue;
    const style = getComputedStyle(el);
    const cutX = style.overflowX === 'hidden' || style.overflowX === 'clip';
    const cutY = style.overflowY === 'hidden' || style.overflowY === 'clip';
    const overX = el.scrollWidth - el.clientWidth;
    const overY = el.scrollHeight - el.clientHeight;
    if (!(cutX && overX > 1) && !(cutY && overY > 1)) continue;
    clipped.push({
      selector: describe(el),
      hiddenX: cutX ? overX : 0,
      hiddenY: cutY ? overY : 0,
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
 * Asserts that nothing matching `selector` is cutting its own content off.
 *
 * Pair this with a text assertion the way `expectLaidOut` is paired with one:
 * the text assertion says the string is in the DOM, `expectLaidOut` says the
 * element is on the page, and this says the string is not being painted with
 * its end chopped off. All three are needed and none implies another.
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
    `${what} (${selector}) is clipped: the browser is painting less of this text than it was given`,
  ).toEqual([]);
}
