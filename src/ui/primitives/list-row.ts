import { element } from './dom';
import { type IconId, createIcon } from './icon';
import { type BadgeTone, type StatusBadge, createStatusBadge } from './status-badge';

/**
 * Icon + label + trailing badge, on one hairline-separated row.
 *
 * The default is a non-interactive readout. Passing `onActivate` makes the
 * whole row a real `<button>` -- the entire row, not a small chevron at its
 * end, because a row is the tap target on a touch screen.
 *
 * The label is one clipped line unless `wrap` says otherwise; see that
 * option.
 */
export interface ListRowOptions {
  readonly icon: IconId;
  readonly label: string;
  readonly badge?: { readonly tone: BadgeTone; readonly text: string };
  readonly onActivate?: () => void;
  /**
   * Let the label run onto as many lines as it needs, instead of being cut
   * with an ellipsis at the end of the first one.
   *
   * The default is the ellipsis, and it is right for what this primitive was
   * built for: a buildable, a room type, a staff role -- a *name*, where the
   * first words identify the row and the rest is detail. It is wrong for a
   * *sentence*, where the end of the line is not the end of the meaning.
   * Issue #720 is what that costs: the HUD's alerts log renders whole
   * sentences through this row inside a fixed 224px rail, and a player read
   * about ten characters of each one.
   *
   * Opt-in rather than the default because wrapping buys readability with row
   * height, and only the caller knows whether its box can afford it.
   * `primitives.css`'s `.ui-row--wrap` note carries the measurements for the
   * one caller that does.
   */
  readonly wrap?: boolean;
}

export interface ListRow {
  readonly element: HTMLElement;
  setLabel(text: string): void;
  setBadge(badge: { readonly tone: BadgeTone; readonly text: string } | undefined): void;
}

export function createListRow(options: ListRowOptions): ListRow {
  const label = element('span', { className: 'ui-row__label', text: options.label });
  const children: Node[] = [createIcon(options.icon, 'sm'), label];

  let badge: StatusBadge | undefined;
  if (options.badge !== undefined) {
    badge = createStatusBadge(options.badge);
    children.push(badge.element);
  }

  const wrapClass = options.wrap === true ? ' ui-row--wrap' : '';

  let root: HTMLElement;
  if (options.onActivate === undefined) {
    root = element('div', { className: `ui-row${wrapClass}`, children });
  } else {
    const activate = options.onActivate;
    const button = element('button', {
      className: `ui-row ui-row--interactive${wrapClass}`,
      attributes: { type: 'button' },
      children,
    });
    button.addEventListener('click', activate);
    root = button;
  }

  return {
    element: root,
    setLabel(text: string): void {
      label.textContent = text;
    },
    setBadge(next): void {
      if (next === undefined) {
        badge?.element.remove();
        badge = undefined;
        return;
      }
      if (badge === undefined) {
        badge = createStatusBadge(next);
        root.append(badge.element);
        return;
      }
      badge.update(next);
    },
  };
}
