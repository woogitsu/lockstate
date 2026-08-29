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
    root.dataset['tone'] = state.tone ?? options.tone ?? 'neutral';
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', String(Math.max(0, state.max)));
    root.setAttribute('aria-valuenow', String(Math.max(0, state.value)));
    root.setAttribute('aria-valuetext', state.valueText);
    if (state.label !== undefined) root.setAttribute('aria-label', state.label);
  };

  return { element: root, update };
}
