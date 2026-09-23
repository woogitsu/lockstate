import { element, screenReaderText } from './dom';
import { type IconId, type IconSize, createIcon } from './icon';

/**
 * A real `<button>` whose visible content is a single glyph.
 *
 * The label is always present in the DOM as screen-reader text, so the
 * meaning never depends on a tooltip: touch has no hover, and a hover-only
 * label is an unreachable label. `title` is set as well, but only as a bonus
 * for pointer users.
 *
 * The button is sized to `--tap-target` regardless of the glyph size.
 */
export interface IconButtonOptions {
  readonly icon: IconId;
  readonly label: string;
  readonly onActivate: () => void;
  readonly size?: IconSize;
  /** Renders as a toggle: sets `aria-pressed` and the selected styling. */
  readonly pressed?: boolean;
  readonly variant?: 'quiet' | 'bordered';
}

export interface IconButton {
  readonly element: HTMLButtonElement;
  setPressed(pressed: boolean): void;
  setLabel(text: string): void;
  /**
   * Marks the control unavailable **without taking the press away**
   * (`aria-disabled`, not `disabled`), or withdraws any opinion (#1370).
   *
   * The icon-button form of `ActionButton.setUnavailable`, and for both of
   * that method's reasons: `createBusyGroup` writes `disabled` on every member
   * on every busy transition, so a state kept there is cleared the next time
   * any command in the HUD settles; and `disabled` would make a stale verdict
   * *swallow* a press, where this lets it through to whatever answers it.
   *
   * `undefined` removes the attribute rather than writing `'false'`. That is
   * the distinction `ActionButton.setUnavailable`'s own comment draws --
   * `'false'` is a control known to be pressable, absence is one that has
   * never had an opinion -- and here the third state has a real caller: a
   * strip that no prison has reported to yet knows neither.
   */
  setUnavailable(unavailable: boolean | undefined): void;
}

export function createIconButton(options: IconButtonOptions): IconButton {
  const label = screenReaderText(options.label);
  const button = element('button', {
    className: `ui-icon-button ui-icon-button--${options.variant ?? 'quiet'}`,
    attributes: { type: 'button', title: options.label },
    children: [createIcon(options.icon, options.size ?? 'md'), label],
  });
  /*
   * A closure that calls `onActivate` rather than `onActivate` itself, and the
   * difference is not only style (#1356).
   *
   * Passed bare, the listener hands `onActivate` the `MouseEvent` as an
   * argument its type says it never receives. And it is invisible to
   * `tests/helpers/control-reachability.ts`, which follows a callback option to
   * the place it is *called* -- `options.onActivate(` -- and found none here,
   * so every command whose only control was an icon button read to that gate
   * as a callback nothing wires. `action-button.ts` has always been written
   * this way, for the same first reason.
   */
  button.addEventListener('click', () => {
    options.onActivate();
  });

  const setPressed = (pressed: boolean): void => {
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  };
  if (options.pressed !== undefined) setPressed(options.pressed);

  return {
    element: button,
    setPressed,
    setLabel(text: string): void {
      label.textContent = text;
      button.setAttribute('title', text);
    },
    setUnavailable(unavailable: boolean | undefined): void {
      if (unavailable === undefined) button.removeAttribute('aria-disabled');
      else button.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    },
  };
}
