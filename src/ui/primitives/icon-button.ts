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
  };
}
