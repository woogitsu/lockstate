import { element, nextUiId } from './dom';

/**
 * A labelled integer field with a step control on either side.
 *
 * The steppers are not decoration. A bare `<input type="number">` puts the
 * only way to nudge a value inside a pair of spinner arrows that are a few
 * pixels tall and appear on hover on some engines and never on others -- so on
 * a touch screen the field can only be changed by summoning a keyboard. The
 * two buttons are full tap targets and work identically everywhere.
 *
 * Values are integers, clamped to `[min, max]` when either is given. The field
 * is **controlled**: typing or stepping reports the value that was asked for
 * and changes nothing until the owner calls `setValue`, which keeps the DOM
 * from becoming a second source of truth beside the owner's state.
 */
export interface NumberFieldOptions {
  readonly label: string;
  readonly value: number;
  /** Full sentences for the step buttons, whose visible content is a symbol. */
  readonly decrementLabel: string;
  readonly incrementLabel: string;
  readonly min?: number;
  readonly max?: number;
  readonly onChange: (value: number) => void;
}

export interface NumberField {
  readonly element: HTMLElement;
  /** The buttons and the input, for an owner that disables the surface while busy. */
  readonly controls: readonly (HTMLButtonElement | HTMLInputElement)[];
  setValue(value: number): void;
}

function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let next = Math.trunc(value);
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}

export function createNumberField(options: NumberFieldOptions): NumberField {
  const inputId = nextUiId('ui-number');
  let current = clamp(options.value, options.min, options.max);

  const input = element('input', {
    className: 'ui-number__input',
    attributes: {
      id: inputId,
      type: 'number',
      // A numeric soft keyboard rather than a full one. `step="1"` also makes
      // a non-integer entry invalid rather than silently truncated.
      inputmode: 'numeric',
      step: '1',
      ...(options.min === undefined ? {} : { min: String(options.min) }),
      ...(options.max === undefined ? {} : { max: String(options.max) }),
    },
  });
  input.value = String(current);

  const request = (value: number): void => {
    options.onChange(clamp(value, options.min, options.max));
  };

  const step = (delta: number, label: string, symbol: string): HTMLButtonElement => {
    const button = element('button', {
      className: 'ui-number__step',
      attributes: { type: 'button', 'aria-label': label },
      text: symbol,
    });
    button.addEventListener('click', () => {
      request(current + delta);
    });
    return button;
  };

  // U+2212 MINUS SIGN and U+002B: symbols, not the letters of a shortcut.
  const decrement = step(-1, options.decrementLabel, '−');
  const increment = step(1, options.incrementLabel, '+');

  input.addEventListener('change', () => {
    const parsed = Number.parseInt(input.value, 10);
    // An unparseable entry snaps back to the value the owner still holds,
    // rather than silently becoming zero.
    if (Number.isNaN(parsed)) input.value = String(current);
    else request(parsed);
  });

  const root = element('div', {
    className: 'ui-number',
    children: [
      element('label', { className: 'ui-number__label ui-eyebrow', attributes: { for: inputId }, text: options.label }),
      element('div', { className: 'ui-number__controls', children: [decrement, input, increment] }),
    ],
  });

  return {
    element: root,
    controls: [decrement, input, increment],
    setValue(value: number): void {
      current = clamp(value, options.min, options.max);
      input.value = String(current);
    },
  };
}
