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
 */
export function filledSegments(value: number, max: number, segments = DEFAULT_BAR_SEGMENTS): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || segments <= 0) return 0;
  if (value <= 0) return 0;
  if (value >= max) return segments;
  return Math.min(segments, Math.ceil((value / max) * segments));
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
  };

  return { element: root, update };
}
