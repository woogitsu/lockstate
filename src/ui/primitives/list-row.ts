import { element } from './dom';
import { type IconId, createIcon } from './icon';
import { type IconButton, createIconButton } from './icon-button';
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

/**
 * The shape `setAction` takes, and what `ListRowOptions` used to carry as a
 * construction-time-only `action` field (issue #764).
 *
 * **Not `onActivate` with extra steps, and the difference is the whole reason
 * this exists.** `onActivate` makes the row itself the button, on the
 * argument above that a row is the tap target on a touch screen. That is
 * right when pressing the row *selects* it -- a buildable, a room type -- and
 * wrong when pressing it does something irreversible: the alerts log's
 * dismissal writes a mark into the save and there is no undo (ADR 0084
 * decision 3), so the owner ruled on 2026-09-01 that the control is its own
 * element, with the cost of the alternative in front of them. A mis-tap that
 * cannot be reversed was judged worse than a smaller target.
 *
 * The two are mutually exclusive in practice and deliberately not enforced in
 * the type: a row with both would be a button inside a button, which is
 * invalid HTML that no caller here writes.
 *
 * `createIconButton` rather than a bare `<button>`, so the control is
 * `--tap-target` in both axes and its `label` is real screen-reader text
 * rather than a `title`. A glyph with no name is not a control.
 */
export interface ListRowAction {
  readonly icon: IconId;
  readonly label: string;
  readonly onActivate: () => void;
}

export interface ListRow {
  readonly element: HTMLElement;
  setLabel(text: string): void;
  setBadge(badge: { readonly tone: BadgeTone; readonly text: string } | undefined): void;
  /**
   * Adds, updates or removes the trailing control -- as a function of the
   * row's *current* state, called on every repaint, rather than of whatever
   * the row's state was the one time it was built.
   *
   * `undefined` removes the control if the row has one; a defined action
   * creates it if the row does not yet have one, or re-resolves its label if
   * it does. `setBadge` above takes the same add-update-remove shape for the
   * same reason: a caller that repaints every row identically should not have
   * to ask which kind of row it is holding first.
   *
   * There used to be a construction-time-only `ListRowOptions.action` and a
   * `setActionLabel` that could only update an action already there -- so a
   * row built without one could never grow one, which was #764: the alerts
   * log's dismiss control appeared only on the path that *created* a row, and
   * a row that was reused and then gained the state that should carry a
   * control never got one. This method is that fix, at the primitive: there
   * is now exactly one way to state what a row's trailing control should be,
   * and it works whether the row is new or being reused.
   *
   * The icon and the intent an action fires are assumed not to change across
   * calls that both pass a defined action -- this primitive's one caller
   * always names the same icon and the same kind of intent for a given kind
   * of row -- so an update only re-resolves the label. A caller that needs
   * the icon or the intent itself to change should remove and re-add.
   */
  setAction(action: ListRowAction | undefined): void;
}

export function createListRow(options: ListRowOptions): ListRow {
  const label = element('span', { className: 'ui-row__label', text: options.label });
  const children: Node[] = [createIcon(options.icon, 'sm'), label];

  let badge: StatusBadge | undefined;
  if (options.badge !== undefined) {
    badge = createStatusBadge(options.badge);
    children.push(badge.element);
  }

  // Mutable, and never seeded from `options`: `setAction` below is the only
  // way this gets a value, on the create call exactly like on every later
  // repaint, so there is no separate construction-time path for #764 to hide
  // a bug in ever again.
  let action: IconButton | undefined;

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
    setAction(next): void {
      if (next === undefined) {
        action?.element.remove();
        action = undefined;
        return;
      }
      if (action === undefined) {
        action = createIconButton({
          icon: next.icon,
          label: next.label,
          onActivate: next.onActivate,
          // The glyph, not the button, is what shrinks: `sm` matches the row's
          // leading icon so the two read as one row rather than as a control
          // bolted to a readout, while `.ui-icon-button`'s own
          // `min-width`/`min-height` keep the *target* at `--tap-target`.
          size: 'sm',
        });
        // Always last: the badge above inserts itself before an existing
        // action, so an action created after a badge already in the DOM
        // still belongs at the end of the row.
        root.append(action.element);
        return;
      }
      action.setLabel(next.label);
    },
  };
}
