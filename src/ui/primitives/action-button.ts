import { element } from './dom';
import { type IconId, createIcon } from './icon';

/**
 * A labelled button: the one control that *does something* rather than
 * navigating or folding.
 *
 * It carries a visible word, not a glyph and not a keyboard letter. Touch has
 * no hover, so a tooltip is not a label, and a shortcut letter printed on a
 * control is meaningless on a device with no keyboard -- `docs/INPUT.md`.
 *
 * Two tones only. `primary` is the one action a surface exists to perform;
 * everything else is `default`. A surface with two primaries has no primary.
 */
export type ActionButtonTone = 'default' | 'primary';

export interface ActionButtonOptions {
  readonly label: string;
  readonly onActivate: () => void;
  readonly icon?: IconId;
  readonly tone?: ActionButtonTone;
  readonly disabled?: boolean;
}

export interface ActionButton {
  readonly element: HTMLButtonElement;
  setLabel(text: string): void;
  setDisabled(disabled: boolean): void;
  /**
   * **Marks the control unavailable without taking the press away**
   * (`aria-disabled`, not `disabled`) -- issue #772, narrowed 2026-09-02.
   *
   * ## Why a second state, rather than `setDisabled`
   *
   * Two callers write "this control cannot act right now" and they mean
   * different things:
   *
   *   - `setDisabled` is *authority*. A press must not happen at all -- the
   *     numeric route with nothing selected (`build-panel.ts`'s `submit`), or
   *     `createBusyGroup` holding every command control while one is in
   *     flight (`src/ui/primitives/async-action.ts`). There is nothing for
   *     the host to say about a press that never occurs.
   *   - This is *advice*. The press may still happen, and when it does the
   *     host answers it with a sentence naming the reason -- the refusal band,
   *     the `data-action-failed` mark on the control, the `aria-describedby`
   *     link between them. The control saying "probably not" before the press
   *     and the host saying "not, and here is why" after it are two halves of
   *     one answer, and a hard `disabled` keeps only the first.
   *
   * **The Buy button is the case that forced the split.** PR #799 wired the
   * affordability verdict onto `disabled`, which removed the press -- and with
   * it the whole `purchase-materials` refusal route the owner's ruling 18 of
   * 2026-08-31 authored `hud.refusal.purchase-materials-past-floor` for.
   * `aria-disabled` keeps #772's pre-press signal (assistive technology
   * reports the control as unavailable, and `primitives.css` dims it beside
   * `:disabled`) while the press, the refusal and the reason all survive. See
   * `paintBuyTotal` in `src/ui/hud/build-panel.ts` for that argument at
   * length.
   *
   * ## And it is the only bit with one writer
   *
   * `createBusyGroup`'s `apply` assigns `control.disabled = busy` for every
   * member on every busy transition, unconditionally -- so a panel that also
   * writes `disabled` for a reason of its own has that reason cleared the next
   * time any command in the HUD settles. Nothing else writes `aria-disabled`,
   * so a state kept here cannot be stomped by the gate. That is a property of
   * this choice rather than the reason for it: the `disabled` collision is a
   * defect of its own, it predates #772 (`build-panel.ts`'s `submit`, disabled
   * while nothing is selected, is its first instance), and it is reported
   * rather than fixed here.
   */
  setUnavailable(unavailable: boolean): void;
}

export function createActionButton(options: ActionButtonOptions): ActionButton {
  const label = element('span', { className: 'ui-action__label', text: options.label });
  const children: Node[] = [];
  if (options.icon !== undefined) children.push(createIcon(options.icon, 'sm'));
  children.push(label);

  const button = element('button', {
    className: 'ui-action',
    attributes: { type: 'button' },
    dataset: { tone: options.tone ?? 'default' },
    children,
  });
  button.disabled = options.disabled ?? false;
  button.addEventListener('click', () => {
    options.onActivate();
  });

  return {
    element: button,
    setLabel(text: string): void {
      label.textContent = text;
    },
    setDisabled(disabled: boolean): void {
      button.disabled = disabled;
    },
    setUnavailable(unavailable: boolean): void {
      // Written both ways rather than removed for `false`, because
      // `aria-disabled="false"` is the state a control that *can* be pressed
      // reports and an absent attribute is the state one that has never had
      // an opinion reports. Only the first is true of a button whose
      // availability is recomputed on every repaint, and a test asserting
      // "this recovered" wants to read a value rather than an absence -- the
      // same reason `createBusyGroup` writes `aria-busy="false"`.
      button.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    },
  };
}
