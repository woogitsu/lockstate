import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { element, eyebrowText, valueText } from '../primitives/dom';
import { createPanel } from '../primitives/panel';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudLocalizer, HudRegimeBlockViewModel, HudRegimeViewModel } from './view-model';

/**
 * The Regime panel: what the prison's day allows right now (issue #451).
 *
 * ### Why it is here, and why the roster is no longer in it
 *
 * The `regime` tab rendered nothing from ADR 0022 -- which measured the tab bar
 * full at five and gave the last slot to Rooms -- until #451 put the timetable
 * and the prisoner roster on it together, in one panel. This file's header
 * argued for that arrangement in these words, which are quoted rather than
 * deleted because they are still true of the *tab* and were only ever wrong
 * about the *panel*:
 *
 * > Sharing it is not a compromise here, which is the reason it is one panel.
 * > The two blocks are one subject read at two scales: the timetable says what
 * > *general population* and *high risk* may do at this tick, and the roster
 * > says who is in each and what they are actually doing. [...] That reads as
 * > cause and effect only if both halves are on screen at once.
 *
 * **Both halves are still on screen at once**, and that is the whole of what
 * the owner ruled on ADR 0115 on 2026-09-16: split the panel in code, keep both
 * halves on Plan dnia. `roster-panel.ts` is the other half; `hud.ts` mounts the
 * two in `.hud__side` and shows them on the same tab, the way the Intake and
 * Staff panels have shared the Manage tab since 2026-09-14. The option that put
 * the roster on the Manage rail was put to the owner and **declined**, on the
 * measured 51.56px the Staff panel drops to at phone width; nothing here is
 * groundwork for making that move anyway.
 *
 * What one panel cost, and what two buy, is set out in `roster-panel.ts`'s own
 * header. The half of it that belongs here: this panel's height is bounded by
 * the classification-group catalogue rather than by the population, so it is
 * the one that keeps its natural height while the roster absorbs a short rail
 * -- `.ui-panel.hud-regime` in `hud.css` states that division of labour and
 * carries the measurement behind it.
 *
 * ### Boundaries
 *
 * A composer, exactly like the Staff and Intake panels. It imports nothing from
 * `src/simulation/**`, and every figure and every word it renders arrives on
 * the view model as a number or a message key. It holds no selection, issues no
 * intent and counts nothing.
 *
 * ### What it deliberately does not show
 *
 * **No block bounds.** A regime block's `startTickOfDay`/`endTickOfDay` are
 * ticks, and `regime.ts` says outright that `DAY_LENGTH_TICKS` is a tick budget
 * rather than a mapping onto a clock face. The strip already had to withdraw an
 * `HH:MM` readout for exactly this reason. How far through the block the
 * simulation is, is a share of that block and renders honestly as a percent.
 */

export interface RegimePanelOptions {
  readonly localizer: HudLocalizer;
}

/** The localizer call this panel makes, narrowed so the pure helpers below need no `HudLocalizer`. */
type Translate = (key: LocalizationKey, parameters?: MessageParameters) => string;

/**
 * What one classification group may do in the block that is running.
 *
 * The categories are joined with a message key rather than a literal, because
 * a list separator is locale vocabulary. The order is the schedule's own -- the
 * projection copies `RegimeBlock.allowedCategories` as declared -- so two
 * clients reading the same tick print the same sentence.
 */
export function formatRegimeAllowsText(t: Translate, group: HudRegimeBlockViewModel): string {
  const separator = t(HUD_MESSAGE_KEY.regimeCategorySeparator);
  return t(HUD_MESSAGE_KEY.regimeBlockAllows, {
    categories: group.allowedCategoryLabelKeys.map((key) => t(key)).join(separator),
  });
}

export interface RegimePanel {
  readonly element: HTMLElement;
  /**
   * Repaint the timetable from a fresh `hud/status-strip` reply.
   *
   * `undefined` hides the block, and it is a different state from a group list
   * that happens to be empty: "nothing has asked yet" must not render as "this
   * prison runs no regime", which is the distinction every pulled readout in
   * this HUD draws.
   */
  setRegime(regime: HudRegimeViewModel | undefined): void;
  setVisible(visible: boolean): void;
}
export function createRegimePanel(options: RegimePanelOptions): RegimePanel {
  const { localizer } = options;
  const t: Translate = (key, parameters) => (parameters === undefined ? localizer.format(key) : localizer.format(key, parameters));

  // ---- what the day allows ------------------------------------------
  /*
   * Rebuilt rather than pooled, which is the opposite choice from the roster
   * below and rests on the same rule the Intake panel's stage lines state:
   * there is one row per classification group, the vocabulary is a closed
   * catalogue rather than the population, and nothing in the block is
   * focusable -- so replacing it cannot take focus away from a player.
   */
  const blockList = element('div', { className: 'hud-regime__block-list' });
  const blocksBlock = element('div', {
    className: 'hud-regime__blocks',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.regimeBlocks), 'hud-regime__blocks-header'), blockList],
  });

  let regime: HudRegimeViewModel | undefined;

  function paintRegime(): void {
    blocksBlock.hidden = regime === undefined;
    if (regime === undefined) {
      blockList.replaceChildren();
      return;
    }

    blockList.replaceChildren(
      ...regime.groups.map((group) => {
        const row = element('div', {
          className: 'hud-regime__block-row',
          children: [
            element('div', {
              className: 'hud-regime__block-header',
              children: [
                valueText(t(group.labelKey), 'hud-regime__block-name'),
                eyebrowText(
                  t(HUD_MESSAGE_KEY.regimeBlockProgress, {
                    percent: localizer.formatNumber(group.blockProgressPercent),
                  }),
                  'hud-regime__block-progress',
                ),
              ],
            }),
            eyebrowText(formatRegimeAllowsText(t, group), 'hud-regime__block-allows'),
          ],
        });
        // The group's own id, so a browser assertion can find the line about
        // one group rather than counting rows -- the handle
        // `.hud-intake__pipeline-stage` carries for the same reason.
        row.dataset['group'] = group.classificationGroupId;
        return row;
      }),
    );
  }
  let collapsed = false;
  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.regimeTitle),
    icon: 'regime',
    className: 'hud-regime',
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
  panel.body.append(blocksBlock);

  /*
   * The single authority on whether the block has a box, run once here rather
   * than by an initial `hidden` on the element: a second assignment would be a
   * line no test could fail on, which is the rule `paintNeeds` and
   * `paintCoverage` both state.
   */
  paintRegime();

  return {
    element: panel.element,
    setRegime(next: HudRegimeViewModel | undefined): void {
      regime = next;
      paintRegime();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
      // The readout is *pulled* while this tab is the one showing, so leaving
      // it stops the refresh -- and a readout nothing is refreshing goes stale
      // in silence. Cleared rather than frozen, exactly as the Rooms and Intake
      // panels clear their own: what is on screen must be something a system is
      // still answering for.
      if (!visible) {
        regime = undefined;
        paintRegime();
      }
    },
  };
}
