import { element, eyebrowText, screenReaderText, valueText } from './dom';
import { type IconId, createIcon } from './icon';
import type { BadgeTone } from './status-badge';

/**
 * Icon + monospace number + small-caps label: the atom of the status strip.
 *
 * The number is always `--font-mono` with tabular figures, so a counter
 * ticking from 99 to 100 does not shove its neighbours sideways.
 */
export interface StatChipOptions {
  readonly icon: IconId;
  readonly label: string;
  readonly value: string;
  /** Optional element appended after the label -- a segmented bar, a badge. */
  readonly trailing?: HTMLElement;
}

export interface StatChip {
  readonly element: HTMLElement;
  setValue(text: string): void;
  setTone(tone: BadgeTone | undefined): void;
  setTrailing(node: HTMLElement | undefined): void;
  /**
   * A full sentence about what the chip's number means, or `undefined` for a
   * chip that has nothing extra to say.
   *
   * **Two channels, and the second one is why this is not just a `title`.**
   * `createIconButton` states the rule this follows: *"the meaning never
   * depends on a tooltip: touch has no hover, and a hover-only label is an
   * unreachable label. `title` is set as well, but only as a bonus for pointer
   * users."* So the sentence is written into the DOM as screen-reader text and
   * into `title`, and neither is the only copy.
   *
   * The screen-reader span costs the row **no width**: `.ui-sr-only` is
   * `position: absolute` at 1px, so it is out of flow and a chip whose badge
   * has to fit a scrollbar-suppressed row is exactly as wide with a
   * description as without one. That property is load-bearing here -- it is
   * the whole reason a sentence too long for the badge can be said on the same
   * chip -- and `tests/browser/ui-overdraft-badge.spec.ts` measures it rather
   * than trusting this paragraph.
   */
  setDescription(text: string | undefined): void;
}

export function createStatChip(options: StatChipOptions): StatChip {
  const value = valueText(options.value, 'ui-stat__value');
  const label = eyebrowText(options.label, 'ui-stat__label');
  const body = element('span', { className: 'ui-stat__body', children: [value, label] });
  /*
   * Last child, always, and empty until somebody sets a description.
   *
   * Reading order is the reason: a screen reader walks the chip and should
   * reach the number, the label and the badge -- the three things on screen --
   * before the sentence explaining them, exactly as a sighted player reads the
   * chip first and hovers second. `setTrailing` therefore inserts *before*
   * this node rather than appending after it.
   */
  const description = screenReaderText('');
  const root = element('div', {
    className: 'ui-stat',
    children: [createIcon(options.icon, 'sm'), body, description],
  });

  let trailing: HTMLElement | undefined;
  const setTrailing = (node: HTMLElement | undefined): void => {
    if (trailing === node) return;
    trailing?.remove();
    trailing = node;
    if (trailing !== undefined) root.insertBefore(trailing, description);
  };

  setTrailing(options.trailing);

  return {
    element: root,
    setValue(text: string): void {
      value.textContent = text;
    },
    setTone(tone: BadgeTone | undefined): void {
      if (tone === undefined) delete root.dataset['tone'];
      else root.dataset['tone'] = tone;
    },
    setTrailing,
    setDescription(text: string | undefined): void {
      // Removed rather than blanked: `title=""` is a tooltip that opens empty
      // on some browsers, which is worse than none at all.
      if (text === undefined) {
        root.removeAttribute('title');
        description.textContent = '';
        return;
      }
      root.setAttribute('title', text);
      description.textContent = text;
    },
  };
}
