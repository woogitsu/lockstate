import { element, eyebrowText, valueText } from './dom';
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
}

export function createStatChip(options: StatChipOptions): StatChip {
  const value = valueText(options.value, 'ui-stat__value');
  const label = eyebrowText(options.label, 'ui-stat__label');
  const body = element('span', { className: 'ui-stat__body', children: [value, label] });
  const root = element('div', {
    className: 'ui-stat',
    children: [createIcon(options.icon, 'sm'), body],
  });

  let trailing: HTMLElement | undefined;
  const setTrailing = (node: HTMLElement | undefined): void => {
    if (trailing === node) return;
    trailing?.remove();
    trailing = node;
    if (trailing !== undefined) root.append(trailing);
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
  };
}
