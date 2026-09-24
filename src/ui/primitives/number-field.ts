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
 *
 * **Typing reports on every keystroke, not on blur (#548).** This field used to
 * listen on `change` alone, which browsers fire when a field is *left*. Pressing
 * a button beside the field is what leaves it, so the report and the press
 * landed in the same event turn: the Build panel's Buy control read `Buy 2 x
 * Brick - 80`, took 1,320, and only then repainted itself to say so. The label
 * was correct about every purchase except the one it was on screen for.
 *
 * `input` therefore reports too. What that costs is that `input` fires on
 * half-typed text -- `""` on the way from `2` to `33`, and `""` again for the
 * lone `-` of a negative coordinate, because `type="number"` reports any raw
 * text that is not yet a number as the empty string. `readNumberFieldEntry`
 * below is the whole of the decision about which of those to report, and
 * `setValue` leaves the box alone while the player is still in it: an owner
 * that answers a keystroke by writing a clamped value back would move the caret
 * to the end and replace what is being typed. The two reconcile on `change`,
 * on the way out.
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

/**
 * Which event asked, which is the only thing that separates the two answers to
 * unparseable text.
 *
 * `typing` is an `input` event: the player is still in the box and the text is
 * on its way somewhere. `settled` is a `change` event: they have left it, or
 * pressed Enter, and the text is as finished as it is going to get.
 */
export type NumberFieldPhase = 'typing' | 'settled';

/** What the field should do about the text in the box right now. */
export interface NumberFieldEntry {
  /** The value to report to the owner, or `undefined` to report nothing. */
  readonly report: number | undefined;
  /** Whether to put the owner's value back in the box, over what is there. */
  readonly restore: boolean;
}

/**
 * The whole of the decision about a keystroke, as a pure function.
 *
 * It is a function and not four lines inside the listener because
 * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so anything that
 * touches `document` is unreachable from the unit suite -- not merely untested.
 * A mutation to a listener body survives because nothing can observe it. This
 * is the same move that produced `orderPrisonsForDisplay`.
 *
 * The two rules, and what each is paid for:
 *
 *   - **Unparseable text is only snapped back once the entry has settled.** A
 *     player who selects the box and presses Delete has typed `""`; so has one
 *     who has typed the `-` of `-4` into a field with no floor, because
 *     `type="number"` reports any raw text that is not yet a number as `""`.
 *     Refilling the box on that keystroke would make the field impossible to
 *     clear and a negative coordinate impossible to type. On `change` the same
 *     text really is an empty entry, and snapping back to the value the owner
 *     still holds -- rather than letting it silently become zero -- is the
 *     behaviour this field has always had.
 *   - **A parseable value is reported clamped, and the box is never rewritten
 *     from here.** Clamping is what the owner would be told anyway; rewriting
 *     mid-word is what turns `152` into `64` under a caret that has not
 *     finished moving. The box catches up on `change`, when the owner's answer
 *     lands in `setValue` with nobody typing into it.
 */
export function readNumberFieldEntry(
  raw: string,
  phase: NumberFieldPhase,
  min: number | undefined,
  max: number | undefined,
): NumberFieldEntry {
  // Native number inputs accept exponent notation. `parseInt('1e2')` reads 1,
  // leaving a visible 100 in the field while the Buy button prices one item.
  const parsed = raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(parsed)) return { report: undefined, restore: phase === 'settled' };
  return { report: clamp(parsed, min, max), restore: false };
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

  /*
   * True only while an `input` event is being reported to the owner.
   *
   * The owner answers by calling `setValue`, which is the field's one way to
   * change what the box says -- and during typing that write lands in the
   * middle of the player's own edit. So `setValue` still takes the owner's
   * value as authoritative (`current` moves either way, which is what the step
   * buttons count from) and only defers the *text*, which the `change` at the
   * end of the entry then reconciles.
   */
  let typing = false;

  const commit = (phase: NumberFieldPhase): void => {
    const entry = readNumberFieldEntry(input.value, phase, options.min, options.max);
    if (entry.restore) input.value = String(current);
    if (entry.report === undefined) return;
    typing = phase === 'typing';
    try {
      options.onChange(entry.report);
    } finally {
      typing = false;
    }
  };

  // Both, and not one or the other. `input` is what makes the owner's state
  // true *before* the button beside the field is pressed (#548); `change` is
  // what puts the owner's answer back in the box once the player has gone,
  // which is the only thing that reconciles a typed 1000 with a ceiling of 999.
  // A programmatic `input.value = ...` fires neither event, so the step buttons
  // -- which call `request` directly and reach the box through `setValue` --
  // still report exactly once per press.
  input.addEventListener('input', () => {
    commit('typing');
  });
  input.addEventListener('change', () => {
    commit('settled');
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
      if (!typing) input.value = String(current);
    },
  };
}
