import { element } from './dom';
import type { BadgeTone } from './status-badge';

/**
 * A bounded value drawn as discrete segments rather than a continuous fill.
 *
 * Segments are readable at a glance at HUD scale, quantize honestly (a bar
 * that is "nearly full" is visibly nearly full rather than a two-pixel
 * difference), and need no gradient -- which the design language forbids
 * anyway.
 */

export const DEFAULT_BAR_SEGMENTS = 10;

/**
 * How many segments are lit for `value` out of `max`.
 *
 * Deliberately `ceil`, not `round`: one prisoner in a 180-capacity prison
 * must light one segment. Rounding would show an empty bar and read as
 * "nothing here", which is a different fact. A non-positive or non-finite
 * `max` lights nothing -- an unbounded value has no meaningful fill, and
 * guessing one would be a lie rather than a fallback.
 *
 * `ceil` alone is not the whole rule, though, and the missing half is why
 * `Math.min` bounds at `segments - 1` rather than at `segments`: 254 of 255
 * is `ceil(9.96) = 10`, a completely full bar for a value that is not at
 * its maximum. The last segment is reserved for `value >= max`, which the
 * branch above answers, so a bar is full only when the thing it draws is.
 *
 * This is the same rule `toBoundedValue` applies in
 * `src/simulation/presentation/view-model.ts`, deliberately written twice:
 * `AGENTS.md` boundary 1 forbids `src/ui/primitives/**` importing
 * `src/simulation/**` at all, and `tests/unit/ui-hud-messages.test.ts`
 * enforces that. Two copies that must agree are a drift risk, which is what
 * `tests/unit/segment-fill-agreement.test.ts` exists to pin -- it drives
 * both over the same inputs, so a change to either alone fails.
 *
 * `Math.max(1, ...)` is the first rule stated where `ceil` cannot carry it:
 * `value / max` underflows to exactly `0` when the two are far enough apart
 * in magnitude, and `ceil(0)` is `0`, so a non-zero value would draw as an
 * empty bar. Asserted in the agreement test rather than left as an argument.
 *
 * At `segments: 1` the reserved segment leaves nothing to light below the
 * maximum, so any partial value reads as empty. No caller passes 1.
 */
export function filledSegments(value: number, max: number, segments = DEFAULT_BAR_SEGMENTS): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || segments <= 0) return 0;
  if (value <= 0) return 0;
  if (value >= max) return segments;
  return Math.min(segments - 1, Math.max(1, Math.ceil((value / max) * segments)));
}

/**
 * How many *overflow* segments are lit for `value` beyond `max` (issue #609).
 *
 * ## Why this is a second function and not a change to the one above
 *
 * `filledSegments` is duplicated on purpose -- `toBoundedValue` in
 * `src/simulation/presentation/view-model.ts` is the same rule, written twice
 * because `AGENTS.md` boundary 1 forbids `src/ui/primitives/**` importing
 * `src/simulation/**`, and `tests/unit/segment-fill-agreement.test.ts` drives
 * both over the same inputs so a change to either alone fails. **Touching its
 * return values to express overflow would have broken that agreement**, and
 * the simulation-side copy has no business knowing about over-capacity. So
 * this is additive: `filledSegments` keeps saying "all ten lit", which is
 * true, and this says how far past the end the value went.
 *
 * ## What it measures, and where it saturates
 *
 * The excess as a fraction of capacity, on the same `ceil` rule and with the
 * same reserved last segment, so one prisoner past capacity lights one
 * overflow segment rather than rounding to none. **It saturates at twice
 * capacity**: 6-of-3 and 12-of-3 both light all ten, because a ten-segment
 * vocabulary has ten buckets and the second lap uses all of them.
 *
 * That saturation is a deliberate limit rather than an oversight, and it is
 * only acceptable because it is not the only channel: the PRISONERS chip
 * carries the exact pair of numbers beside this bar, so "how far over" is
 * legible in digits and this bar's job is to make it *noticeable* at a
 * glance. A bar alone cannot carry an unbounded ratio, and pretending
 * otherwise -- a log scale, say -- would be a bar nobody can read back.
 *
 * Returns 0 for any value at or under capacity, which is what makes the whole
 * mechanism inert for a bounded metric. The Regime panel's need bars pass
 * `value: need.permille` against `max: NEED_BAR_MAX_PERMILLE`, a permille
 * against 1000, so they can reach the maximum and never pass it and this
 * function returns 0 for every input they can produce.
 */
export function overflowSegments(value: number, max: number, segments = DEFAULT_BAR_SEGMENTS): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || segments <= 0) return 0;
  /*
   * No `if (value <= max) return 0` here, and its absence is deliberate and
   * was measured. That guard was written first, and a mutation that deleted
   * it **survived every test in `segment-overflow.test.ts`** -- because the
   * excess is non-positive for any value at or under capacity, and
   * `filledSegments`'s own second line returns 0 for exactly that. The guard
   * could not fail, which makes it a line that rots rather than a line that
   * protects. The behaviour it stated is pinned by test instead, where a
   * change to `filledSegments`'s zero handling would be caught.
   */
  return filledSegments(value - max, max, segments);
}

export interface SegmentedBarOptions {
  /** Accessible name. The bar is a readout, so it must be named. */
  readonly label: string;
  readonly segments?: number;
  readonly tone?: BadgeTone;
}

export interface SegmentedBarState {
  readonly value: number;
  readonly max: number;
  /** Spoken form, e.g. "142 of 180". Colour and length never carry this alone. */
  readonly valueText: string;
  readonly tone?: BadgeTone;
  /**
   * Renames the bar, for a pooled bar whose *subject* changes between repaints
   * rather than only its value.
   *
   * The Regime panel's roster rows are pooled and each draws that prisoner's
   * **worst** need, so one bar is "Hunger" on one tick and "Bladder" on the
   * next. `options.label` is fixed at construction and cannot say that; a bar
   * left with the stale name would announce the wrong need with the right
   * number, which is worse than announcing nothing.
   *
   * Omitted leaves the name alone, so the status strip's occupancy bar -- whose
   * subject never changes -- passes nothing and is unaffected.
   */
  readonly label?: string;
}

export interface SegmentedBar {
  readonly element: HTMLElement;
  update(state: SegmentedBarState): void;
}

export function createSegmentedBar(options: SegmentedBarOptions): SegmentedBar {
  const count = options.segments ?? DEFAULT_BAR_SEGMENTS;
  const cells: HTMLElement[] = [];
  for (let index = 0; index < count; index += 1) {
    cells.push(element('span', { className: 'ui-bar__segment' }));
  }

  const root = element('span', {
    className: 'ui-bar',
    attributes: { role: 'meter', 'aria-label': options.label },
    children: cells,
  });
  root.dataset['tone'] = options.tone ?? 'neutral';

  const update = (state: SegmentedBarState): void => {
    const filled = filledSegments(state.value, state.max, count);
    for (const [index, cell] of cells.entries()) {
      cell.dataset['filled'] = index < filled ? 'true' : 'false';
    }

    /*
     * OVERFLOW IS DRAWN INSIDE THE SAME TEN CELLS, NOT APPENDED BESIDE THEM.
     *
     * The obvious shape -- extra segments past the end, so the bar visibly
     * runs off its own scale -- was rejected on width. This bar sits in a
     * status-strip chip on a strip of eight competing for one glance, and the
     * binding viewport this project measures is 900x600; a bar that doubles
     * its width exactly when the prison is in trouble is a layout change
     * fired by a game state, which is the kind of thing that reads fine at
     * 1440 and pushes a chip off the strip at 900.
     *
     * So the second lap is drawn *over* the first: cells carry
     * `data-overflow` for the portion of the second lap they represent, and
     * the stylesheet gives that a hatch rather than a second colour. Colour
     * is already spoken for -- `data-tone` is `danger` for any over-capacity
     * value -- and this repository's own rule is that a state is never
     * carried by colour alone. A hatch is a second channel, and it composes
     * with the red rather than competing with it.
     *
     * `overflow` is 0 for every value at or under capacity, so a bounded
     * metric writes `data-overflow="false"` on all ten cells forever and
     * looks exactly as it did.
     */
    const overflow = overflowSegments(state.value, state.max, count);
    for (const [index, cell] of cells.entries()) {
      cell.dataset['overflow'] = index < overflow ? 'true' : 'false';
    }
    root.dataset['overCapacity'] = overflow > 0 ? 'true' : 'false';

    root.dataset['tone'] = state.tone ?? options.tone ?? 'neutral';
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', String(Math.max(0, state.max)));
    root.setAttribute('aria-valuenow', String(Math.max(0, state.value)));
    root.setAttribute('aria-valuetext', state.valueText);
    if (state.label !== undefined) root.setAttribute('aria-label', state.label);
  };

  return { element: root, update };
}
