import { element } from './dom';
import { type IconId, createIcon } from './icon';

/**
 * Icon above label, with three genuinely distinct states.
 *
 * "Distinct" means distinct without hover: rest, hover and active differ by
 * background step, hairline and text colour, and the active tab additionally
 * carries `aria-selected` plus a top rule. A touch device never produces a
 * hover state at all, so nothing may depend on one.
 */
/**
 * How selection is announced.
 *
 * `aria-selected` is only correct inside a real `role="tablist"` whose tabs
 * own `role="tabpanel"` content. The HUD's bar selects a *section of the
 * game* and has no panels to point at yet, so it uses `aria-current`, which
 * says "this is the one you are on" without promising a panel that does not
 * exist. When section panels land, the bar can move to `aria-selected` in
 * one place.
 */
export type TabSelectionAttribute = 'aria-selected' | 'aria-current';

export interface TabButtonOptions {
  readonly id: string;
  readonly icon: IconId;
  readonly label: string;
  readonly controls?: string;
  readonly selection?: TabSelectionAttribute;
  readonly onSelect: (id: string) => void;
}

export interface TabButton {
  readonly id: string;
  readonly element: HTMLButtonElement;
  setActive(active: boolean): void;
}

export function createTabButton(options: TabButtonOptions): TabButton {
  const selection = options.selection ?? 'aria-selected';
  const attributes: Record<string, string> = { type: 'button' };
  if (selection === 'aria-selected') attributes['role'] = 'tab';

  const button = element('button', {
    className: 'ui-tab',
    attributes,
    dataset: { tab: options.id },
    children: [
      createIcon(options.icon, 'lg'),
      element('span', { className: 'ui-tab__label', text: options.label }),
    ],
  });
  if (options.controls !== undefined) button.setAttribute('aria-controls', options.controls);
  button.addEventListener('click', () => {
    options.onSelect(options.id);
  });

  const setActive = (active: boolean): void => {
    if (selection === 'aria-current') {
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    } else {
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    // Roving tabindex belongs to the tablist pattern, where arrow keys move
    // between tabs. A navigation bar keeps every button in the tab order,
    // because there are no arrow-key semantics to replace it with.
    if (selection === 'aria-selected') button.tabIndex = active ? 0 : -1;
    button.dataset['active'] = active ? 'true' : 'false';
  };
  setActive(false);

  return { id: options.id, element: button, setActive };
}
