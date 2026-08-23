import { element, eyebrowText, nextUiId } from './dom';

/**
 * A small set of mutually exclusive options, all visible at once.
 *
 * Not a `<select>`: the options here are two or three words each, and a
 * dropdown hides every choice but one behind a tap. Each option is a real
 * `<button>` inside a `role="radiogroup"`, so the selected one is announced
 * and every option is reachable by keyboard and by touch alike.
 *
 * **Controlled**, like `createCollapsibleSection`: a tap reports which option
 * was asked for and changes nothing. The owner applies it with `setSelected`,
 * so a rejected or externally-driven change cannot leave the DOM disagreeing
 * with the state it is supposed to be showing.
 */
export interface ChoiceOption {
  readonly id: string;
  readonly label: string;
}

export interface ChoiceGroupOptions {
  /** Small-caps label above the row. Names what is being chosen. */
  readonly legend: string;
  readonly options: readonly ChoiceOption[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

export interface ChoiceGroup {
  readonly element: HTMLElement;
  readonly controls: readonly HTMLButtonElement[];
  setSelected(id: string): void;
}

export function createChoiceGroup(options: ChoiceGroupOptions): ChoiceGroup {
  const legendId = nextUiId('ui-choice-legend');
  const legend = eyebrowText(options.legend, 'ui-choice__legend');
  legend.id = legendId;

  let selected = options.selectedId;
  const buttons = options.options.map((option) => {
    const button = element('button', {
      className: 'ui-choice__option',
      attributes: { type: 'button', role: 'radio' },
      dataset: { choice: option.id },
      text: option.label,
    });
    button.addEventListener('click', () => {
      options.onSelect(option.id);
    });
    return button;
  });

  const apply = (): void => {
    for (const button of buttons) {
      const active = button.dataset['choice'] === selected;
      button.setAttribute('aria-checked', active ? 'true' : 'false');
      button.dataset['active'] = active ? 'true' : 'false';
    }
  };
  apply();

  const root = element('div', {
    className: 'ui-choice',
    children: [
      legend,
      element('div', {
        className: 'ui-choice__options',
        attributes: { role: 'radiogroup', 'aria-labelledby': legendId },
        children: buttons,
      }),
    ],
  });

  return {
    element: root,
    controls: buttons,
    setSelected(id: string): void {
      if (id === selected) return;
      selected = id;
      apply();
    },
  };
}
