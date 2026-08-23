import { element } from './dom';
import { type IconId, createIcon } from './icon';
import { type BadgeTone, type StatusBadge, createStatusBadge } from './status-badge';

/**
 * Icon + label + trailing badge, on one hairline-separated row.
 *
 * The default is a non-interactive readout. Passing `onActivate` makes the
 * whole row a real `<button>` -- the entire row, not a small chevron at its
 * end, because a row is the tap target on a touch screen.
 */
export interface ListRowOptions {
  readonly icon: IconId;
  readonly label: string;
  readonly badge?: { readonly tone: BadgeTone; readonly text: string };
  readonly onActivate?: () => void;
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

  let root: HTMLElement;
  if (options.onActivate === undefined) {
    root = element('div', { className: 'ui-row', children });
  } else {
    const activate = options.onActivate;
    const button = element('button', {
      className: 'ui-row ui-row--interactive',
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
