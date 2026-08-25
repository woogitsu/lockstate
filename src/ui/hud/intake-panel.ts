import type { LocalizationKey } from '../../content/localization';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { element, eyebrowText } from '../primitives/dom';
import { createPanel } from '../primitives/panel';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudLocalizer } from './view-model';

/**
 * The Intake panel: one control, which admits one prisoner (#261 step 4).
 *
 * ### Why it is a panel on the Overview tab and not a row in Build
 *
 * The Build panel is measurably full, and the measurement is this
 * repository's own rather than a judgement made here.
 * [ADR 0022](../../../docs/adr/0022-room-zoning-surface.md) took the
 * always-visible pixel budget on the assembled page at the five viewports the
 * browser suite visits and found **12.2px at 900x600 and 38.2px at
 * 1280x720**, against a `--tap-target` of 44px (`src/ui/tokens.css`). It also
 * measured the two shapes a control could take there: a collapsed section of
 * its own is 45px, and a *third* button in `.hud-build__actions` keeps its
 * height and overflows the panel **horizontally by 37.9px**, clipped with no
 * scrollbar because `.ui-panel` is `overflow: hidden` on the x axis. So
 * neither fits, at the roomiest viewport or the tightest.
 *
 * A tab of its own is not available at all, and for a recorded reason rather
 * than a pixel one: ADR 0022 measured `.hud-tabs__inner` spanning 1.8 ... 373.2
 * at 375x812 with a fifth tab injected -- 1.8px of margin per side -- so a
 * **sixth tab is foreclosed**, and it named the one remaining slot as belonging
 * to the Rooms surface. The Rooms tab (#312) has since taken it, so
 * `HUD_TAB_IDS` holds five and there is no slot left to spend on a single
 * button.
 *
 * What is left costs nothing at all: **the Overview tab shows nothing.**
 * `hud.ts` binds one panel to `build`, one to `rooms` and, since ADR 0025, one
 * to `security`, so `overview` and `regime` are the two tabs bound to no panel
 * and on either of them `.hud__side` is an empty box. This panel takes that box
 * on `overview` and is `hidden` everywhere else, so it is never laid out at the
 * same time as any of the other three -- `paintState` keys all four on the
 * active tab and the tab is one value -- and the budget ADR 0022 measured is
 * untouched at every viewport. The tab is also the default (`hud-state.ts`), so
 * the control is the first thing a player sees rather than something to go
 * looking for.
 *
 * ### Boundaries
 *
 * Like `build-panel.ts`, it is a composer: it holds nothing, inspects no
 * snapshot, and imports nothing from `src/simulation/**`, so it does not know
 * that an `AdmitPrisoner` command exists -- only that it asked the host to
 * admit somebody. The sentence naming the condition an admission needs is a
 * message key like every other (ADR 0011); the panel renders no text of its
 * own.
 *
 * ### What it does not offer, and why
 *
 * No sentence-length field, no prior-incidents field and no arrival tile. The
 * command carries all three and the composition root fills them, because
 * every one of them is a number a player has no basis to choose and no
 * surface to be told the meaning of: a sentence length is quoted in ticks, a
 * prior-incident count feeds a classification the interface never shows, and
 * the arrival tile is the middle of the one chunk a new prison owns. Offering
 * three steppers for figures with no readout would be three controls the
 * player cannot use, in the panel that exists because there was no room for
 * one.
 */

export interface IntakePanelOptions {
  readonly localizer: HudLocalizer;
  /** Admit one prisoner. Carries nothing: the host decides the arrival's figures. */
  readonly onAdmit: () => void;
}

export interface IntakePanel {
  readonly element: HTMLElement;
  /** The controls to disable while a command is in flight -- the one button that issues one. */
  readonly controls: readonly HTMLButtonElement[];
  /** The admit button, so a refused admission is reported *on the control that was pressed* (issue #207). */
  readonly submitControl: HTMLButtonElement;
  setVisible(visible: boolean): void;
}

export function createIntakePanel(options: IntakePanelOptions): IntakePanel {
  const { localizer } = options;
  const t = (key: LocalizationKey): string => localizer.format(key);

  const admit: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.intakeAdmit),
    tone: 'primary',
    icon: 'prisoners',
    onActivate: () => options.onAdmit(),
  });
  admit.element.classList.add('hud-intake__admit');

  let collapsed = false;
  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.intakeTitle),
    icon: 'prisoners',
    className: 'hud-intake',
    collapse: {
      collapseLabel: t(HUD_MESSAGE_KEY.panelCollapse),
      expandLabel: t(HUD_MESSAGE_KEY.panelExpand),
      collapsed: false,
      onToggle: () => {
        collapsed = !collapsed;
        panel.setCollapsed(collapsed);
      },
    },
  });
  panel.body.append(
    element('div', {
      className: 'hud-intake__actions',
      children: [admit.element],
    }),
    eyebrowText(t(HUD_MESSAGE_KEY.intakeHint), 'hud-intake__note'),
  );

  return {
    element: panel.element,
    controls: [admit.element],
    submitControl: admit.element,
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
    },
  };
}
