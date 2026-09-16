import { element, eyebrowText, nextUiId } from './dom';

/**
 * A small set of options that are **independently** on or off, all visible at
 * once.
 *
 * ## Why this is not `createChoiceGroup`
 *
 * That primitive is a `role="radiogroup"`: exactly one option is chosen and
 * choosing another unchooses the first. This one answers a different question
 * -- which of these may happen -- where several are on together and the number
 * on is part of the state. Rendering that as radios would be a lie to a screen
 * reader before it was a lie on screen, so the members are `aria-pressed`
 * buttons inside a `role="group"` instead. The two share `.ui-choice__option`'s
 * visual language (a background step **and** a colour change, so the state
 * survives a display that renders the accent hue poorly) and nothing else.
 *
 * ## Wrapping, which is the other half of the difference
 *
 * `.ui-choice__options` is one non-wrapping row of `flex: 1` cells, which is
 * right for two or three options and wrong for seven: at 375px the cells would
 * be four characters wide. `.ui-toggles__options` wraps, and each member is
 * sized by its own label rather than by an equal share.
 *
 * ## Controlled, exactly as every primitive here is
 *
 * A press reports which member was asked for and changes nothing. The owner
 * applies it with `setPressed`, so a press the simulation refuses -- or a
 * change that arrives from somewhere else entirely, which for a regime block
 * is every publication -- cannot leave the DOM disagreeing with the state it
 * is supposed to be showing. `createChoiceGroup` and
 * `createCollapsibleSection` both say the same thing about themselves and for
 * the same reason.
 *
 * ## A member may be locked, and the lock has to say why
 *
 * `disabled` on its own is the failure the owner's standing directive names:
 * a control that does nothing and does not say why is indistinguishable from
 * a broken one. So a locked member takes a sentence with it, put on the
 * button's `title` and its `aria-describedby` target, and the caller supplies
 * that sentence rather than this file inventing one -- a primitive that
 * authored player-facing text would be deciding a promise from inside the
 * vocabulary layer.
 */
export interface ToggleOption {
  readonly id: string;
  readonly label: string;
}

export interface ToggleGroupOptions {
  /** Small-caps label above the row. Names what the members are options of. */
  readonly legend: string;
  readonly options: readonly ToggleOption[];
  /** Which members are on. Anything not named here is off. */
  readonly pressedIds: readonly string[];
  readonly onToggle: (id: string, pressed: boolean) => void;
}

export interface ToggleGroup {
  readonly element: HTMLElement;
  readonly controls: readonly HTMLButtonElement[];
  /** Repaint from the state the owner now holds. */
  setPressed(pressedIds: readonly string[]): void;
  /**
   * Lock the members named, with the one sentence saying why they are locked.
   * An empty list unlocks every member and takes the sentence off.
   */
  setLocked(lockedIds: readonly string[], reason: string): void;
}

export function createToggleGroup(options: ToggleGroupOptions): ToggleGroup {
  const legendId = nextUiId('ui-toggles-legend');
  const reasonId = nextUiId('ui-toggles-reason');
  const legend = eyebrowText(options.legend, 'ui-toggles__legend');
  legend.id = legendId;

  /*
   * The sentence a locked member points at, and it is one element rather than
   * one per member: every member of a group is locked for the same reason at
   * the same moment (the group is down to its last pressed member), so a copy
   * per button would be the same words repeated up to seven times in the
   * accessibility tree.
   */
  const reason = eyebrowText('', 'ui-toggles__reason');
  reason.id = reasonId;
  reason.hidden = true;

  let pressed = new Set(options.pressedIds);
  let locked = new Set<string>();

  const buttons = options.options.map((option) => {
    const button = element('button', {
      className: 'ui-toggles__option',
      attributes: { type: 'button' },
      dataset: { toggle: option.id },
      text: option.label,
    });
    button.addEventListener('click', () => {
      // A locked member is `disabled`, so this cannot fire for one -- and the
      // guard is here anyway because `disabled` is a property a test or an
      // extension can clear, and the caller's invariant must not depend on the
      // DOM having been left alone.
      if (locked.has(option.id)) return;
      options.onToggle(option.id, !pressed.has(option.id));
    });
    return button;
  });

  const apply = (): void => {
    for (const button of buttons) {
      const id = button.dataset['toggle'] ?? '';
      const on = pressed.has(id);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.dataset['active'] = on ? 'true' : 'false';
      const isLocked = locked.has(id);
      button.disabled = isLocked;
      if (isLocked) button.setAttribute('aria-describedby', reasonId);
      else button.removeAttribute('aria-describedby');
    }
  };
  apply();

  const root = element('div', {
    className: 'ui-toggles',
    children: [
      legend,
      element('div', {
        className: 'ui-toggles__options',
        attributes: { role: 'group', 'aria-labelledby': legendId },
        children: buttons,
      }),
      reason,
    ],
  });

  return {
    element: root,
    controls: buttons,
    setPressed(next: readonly string[]): void {
      pressed = new Set(next);
      apply();
    },
    setLocked(next: readonly string[], text: string): void {
      locked = new Set(next);
      reason.textContent = locked.size === 0 ? '' : text;
      reason.hidden = locked.size === 0;
      apply();
    },
  };
}
