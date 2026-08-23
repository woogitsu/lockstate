import { element } from './dom';
import { type IconId, createIcon } from './icon';

/**
 * A labelled button: the one control that *does something* rather than
 * navigating or folding.
 *
 * It carries a visible word, not a glyph and not a keyboard letter. Touch has
 * no hover, so a tooltip is not a label, and a shortcut letter printed on a
 * control is meaningless on a device with no keyboard -- `docs/INPUT.md`.
 *
 * Two tones only. `primary` is the one action a surface exists to perform;
 * everything else is `default`. A surface with two primaries has no primary.
 */
export type ActionButtonTone = 'default' | 'primary';

export interface ActionButtonOptions {
  readonly label: string;
  readonly onActivate: () => void;
  readonly icon?: IconId;
  readonly tone?: ActionButtonTone;
  readonly disabled?: boolean;
}

export interface ActionButton {
  readonly element: HTMLButtonElement;
  setLabel(text: string): void;
  setDisabled(disabled: boolean): void;
}

export function createActionButton(options: ActionButtonOptions): ActionButton {
  const label = element('span', { className: 'ui-action__label', text: options.label });
  const children: Node[] = [];
  if (options.icon !== undefined) children.push(createIcon(options.icon, 'sm'));
  children.push(label);

  const button = element('button', {
    className: 'ui-action',
    attributes: { type: 'button' },
    dataset: { tone: options.tone ?? 'default' },
    children,
  });
  button.disabled = options.disabled ?? false;
  button.addEventListener('click', () => {
    options.onActivate();
  });

  return {
    element: button,
    setLabel(text: string): void {
      label.textContent = text;
    },
    setDisabled(disabled: boolean): void {
      button.disabled = disabled;
    },
  };
}
