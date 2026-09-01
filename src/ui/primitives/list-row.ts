import { element } from './dom';
import { type IconId, createIcon } from './icon';
import { createIconButton } from './icon-button';
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
  /**
   * One control at the end of the row, for a row that is a readout with a
   * single thing to *do* to it.
   *
   * **Not `onActivate` with extra steps, and the difference is the whole
   * reason this exists.** `onActivate` makes the row itself the button, on the
   * argument above that a row is the tap target on a touch screen. That is
   * right when pressing the row *selects* it -- a buildable, a room type -- and
   * wrong when pressing it does something irreversible: the alerts log's
   * dismissal writes a mark into the save and there is no undo (ADR 0084
   * decision 3), so the owner ruled on 2026-09-01 that the control is its own
   * element, with the cost of the alternative in front of them. A mis-tap that
   * cannot be reversed was judged worse than a smaller target.
   *
   * The two are mutually exclusive in practice and deliberately not enforced
   * in the type: a row with both would be a button inside a button, which is
   * invalid HTML that no caller here writes.
   *
   * `createIconButton` rather than a bare `<button>`, so the control is
   * `--tap-target` in both axes and its `label` is real screen-reader text
   * rather than a `title`. A glyph with no name is not a control.
   */
  readonly action?: {
    readonly icon: IconId;
    readonly label: string;
    readonly onActivate: () => void;
  };
}

export interface ListRow {
  readonly element: HTMLElement;
  setLabel(text: string): void;
  setBadge(badge: { readonly tone: BadgeTone; readonly text: string } | undefined): void;
  /**
   * Re-resolves the trailing control's name, for a caller that repaints.
   *
   * A no-op on a row with no action, so a caller that repaints every row the
   * same way does not have to ask which kind it is holding. `setBadge` above
   * takes the same shape of responsibility for the same reason.
   */
  setActionLabel(text: string): void;
}

export function createListRow(options: ListRowOptions): ListRow {
  const label = element('span', { className: 'ui-row__label', text: options.label });
  const children: Node[] = [createIcon(options.icon, 'sm'), label];

  let badge: StatusBadge | undefined;
  if (options.badge !== undefined) {
    badge = createStatusBadge(options.badge);
    children.push(badge.element);
  }

  const action =
    options.action === undefined
      ? undefined
      : createIconButton({
          icon: options.action.icon,
          label: options.action.label,
          onActivate: options.action.onActivate,
          // The glyph, not the button, is what shrinks: `sm` matches the row's
          // leading icon so the two read as one row rather than as a control
          // bolted to a readout, while `.ui-icon-button`'s own
          // `min-width`/`min-height` keep the *target* at `--tap-target`.
          size: 'sm',
        });
  if (action !== undefined) children.push(action.element);

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
        // Before the trailing control, so a row that gains a badge after it was
        // built does not put it past the thing a player presses. `append` was
        // enough while the row's last child was always the badge.
        if (action === undefined) root.append(badge.element);
        else root.insertBefore(badge.element, action.element);
        return;
      }
      badge.update(next);
    },
    setActionLabel(text: string): void {
      action?.setLabel(text);
    },
  };
}
