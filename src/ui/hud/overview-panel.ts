import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { element, eyebrowText, valueText } from '../primitives/dom';
import { createPanel } from '../primitives/panel';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudLocalizer, HudOverviewViewModel } from './view-model';

/**
 * The Overview section's readout: what the prison has, what it earned today,
 * and what it owes its staff for the day (issue #1183).
 *
 * ### Why it exists at all
 *
 * The owner ruled on 2026-09-14 that **Intake moves to Manage**, and intake
 * was the only thing the Overview tab had ever held. Ruling 4 of the same day
 * is what answers for the hole that leaves -- *"Nowy odczyt w Przeglądzie,
 * panel zapisu zostaje w szynie"*, a new readout in Overview and the save
 * panel stays in the rail -- and the two land together, because a navigation
 * entry that opens onto nothing is a screen that looks like state and is not.
 *
 * `src/ui/save-panel.ts` is deliberately **not** moved into this panel or into
 * the tab system. It stays mounted in the rail's aside slot
 * (`src/main.ts`, `HudHandle.asideSlot`), which is not tab-scoped: saving is
 * reachable from every section, and a save control that only existed on
 * Overview would be a regression dressed as a feature.
 *
 * ### The one thing it may not do
 *
 * **It states published figures and computes none.** The HUD may not import
 * `src/simulation/**` (`AGENTS.md` boundary 1) and the delivery's constitution
 * says the same from the other side (article 4): the interface reports what
 * the simulation decided. A finance panel is where that is most tempting --
 * "earned today minus wages" is one subtraction away and would be a second,
 * drifting authority on what the prison is making, disagreeing with the
 * treasury the moment either definition moved. So every figure here arrives on
 * `HudOverviewViewModel`, already decided, and this file does arithmetic on
 * none of them.
 *
 * ### Empty means one thing here, by construction
 *
 * The panel draws no figure at all until a `simulation/status-counts`
 * publication has arrived, and takes them all off when the session stops. Both
 * states render `hud.overview.none` -- *"No prison is reporting."* -- because
 * in both, none is.
 *
 * That is `UNKNOWN_HUD_CLOCK`'s treatment rather than the alerts list's, and
 * the choice is the whole reason this panel was specified before it was
 * written. `'hud.alerts.empty'` used to render from the same empty literal
 * that stands in before the first worker snapshot (#1184), so *"No active
 * alerts"* was what a page with no simulation behind it said about a prison it
 * had never heard of; **that issue is closed and the alerts list took this
 * panel's shape and this panel's sentence.** A balance is worse, and
 * `EMPTY_HUD_VIEW_MODEL.counts` used to carry a confident
 * `treasuryMinorUnits: 0`, so the status strip's own chip told a player their
 * prison was broke before the worker had spoken. **That is #1191, and it is
 * closed too** -- by the same shape a third time: the counts came off the empty
 * model entirely, `hudCountsFromWorkerMessage` answers `'none'` for a stop, and
 * the chips paint `--`. This panel never said it, which is the whole reason it
 * reads its own field; it is now one of three channels agreeing rather than the
 * only one that could tell the states apart.
 */

export interface OverviewPanelOptions {
  readonly localizer: HudLocalizer;
}

/** The localizer call this panel makes, narrowed so the pure helpers below need no `HudLocalizer`. */
type Translate = (key: LocalizationKey, parameters?: MessageParameters) => string;

/**
 * The three rows, in the order they are painted, as label key and reader.
 *
 * A table rather than three hand-built blocks so that the panel cannot grow a
 * row whose value comes from anywhere but `HudOverviewViewModel` -- which is
 * the property the module header spends its length on. Exported so a headless
 * test can assert the order and the wiring without a DOM: nothing under
 * `src/ui/hud/` can be constructed in a unit test, so the part worth proving
 * is pulled out of the constructor.
 *
 * `funds` and `earnedToday` reuse the status strip's own label keys on
 * purpose. The same published number under two different words on one screen
 * is a vocabulary split, and the strip is where a player has already learned
 * both words.
 */
export const OVERVIEW_ROWS: readonly {
  readonly id: string;
  readonly labelKey: LocalizationKey;
  readonly read: (readout: HudOverviewViewModel) => number;
}[] = [
  { id: 'funds', labelKey: HUD_MESSAGE_KEY.funds, read: (readout) => readout.treasuryMinorUnits },
  {
    id: 'earned-today',
    labelKey: HUD_MESSAGE_KEY.earnedToday,
    read: (readout) => readout.stateIncomeAccruedTodayMinorUnits,
  },
  { id: 'wages', labelKey: HUD_MESSAGE_KEY.overviewWages, read: (readout) => readout.dailyWageBillMinorUnits },
];

export interface OverviewPanel {
  readonly element: HTMLElement;
  /**
   * The host's box at the foot of this panel, for a surface the rail carries
   * only at some viewports (issue #1201).
   *
   * The same arrangement `HudHandle.asideSlot` and `HudLayoutShell.preferencesSlot`
   * are, and for the same reason: *what* goes here is a decision about the whole
   * HUD, and this file has no business knowing that an alerts log exists. What it
   * owns is the box, and the box is the last thing in the panel's body so that
   * nothing this panel paints can be pushed under a fold by it.
   *
   * Empty it has no box at all (`.hud-overview__fold:empty` in `hud.css`), so a
   * viewport that mounts nothing here renders exactly as it did before.
   */
  readonly foldSlot: HTMLElement;
  /**
   * What the prison last reported, or `undefined` because none has.
   *
   * `undefined` is the state the sentinel sentence exists for, and it arrives
   * by two routes that say the same thing: no publication yet, and a stopped
   * session. It must take the figures away rather than leave the last ones
   * standing, for the reason the Rooms panel's readout comes off -- a number
   * with nothing still answering for it is the class of lie this layer exists
   * to avoid.
   */
  setReadout(readout: HudOverviewViewModel | undefined): void;
  setVisible(visible: boolean): void;
}

export function createOverviewPanel(options: OverviewPanelOptions): OverviewPanel {
  const { localizer } = options;
  const t: Translate = (key, parameters) =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let readout: HudOverviewViewModel | undefined;

  const values = new Map<string, HTMLSpanElement>();
  const rows = OVERVIEW_ROWS.map((row) => {
    const value = valueText('', 'hud-overview__value');
    values.set(row.id, value);
    return element('div', {
      className: 'hud-overview__row',
      dataset: { figure: row.id },
      children: [eyebrowText(t(row.labelKey), 'hud-overview__label'), value],
    });
  });

  const figures = element('div', { className: 'hud-overview__figures', children: rows });
  /*
   * The sentinel, and it is a sibling of the figures rather than a state of
   * them: the two are never both on screen, and building it as a fourth row
   * would make "no prison is reporting" look like a fourth figure.
   */
  const none = eyebrowText(t(HUD_MESSAGE_KEY.overviewNone), 'hud-overview__none');

  /**
   * Draws the figures or the sentence, and never both.
   *
   * One entry point, so there is no route by which the panel could repaint the
   * figures and leave the sentence beside them -- the rule `paintPipeline`
   * states one panel over.
   */
  function paint(): void {
    const shown = readout;
    figures.hidden = shown === undefined;
    none.hidden = shown !== undefined;
    for (const row of OVERVIEW_ROWS) {
      const value = values.get(row.id);
      if (value === undefined) continue;
      // Formatted by the localizer exactly as the status strip formats the
      // same two figures: grouped, in the minor units the simulation holds
      // money in, with no symbol and no division into a major unit. #96 named
      // no currency and ADR 0017 is Accepted without naming one, so a symbol
      // here would decide one in a readout.
      value.textContent = shown === undefined ? '' : localizer.formatNumber(row.read(shown));
      // The figure as data as well as as text, so a browser assertion reads
      // what the panel was told rather than parsing a localized number.
      if (shown === undefined) delete value.dataset['value'];
      else value.dataset['value'] = String(row.read(shown));
    }
  }

  let collapsed = false;
  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.overviewTitle),
    icon: 'overview',
    className: 'hud-overview',
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
  /*
   * The host's slot (see `OverviewPanel.foldSlot`). After both of the two
   * states `paint` chooses between, because a section mounted between them
   * would sit above the sentence in one state and above the figures in the
   * other.
   */
  const foldSlot = element('div', { className: 'hud-overview__fold' });
  panel.body.append(figures, none, foldSlot);
  /*
   * The single authority on which of the two has a box, run once here rather
   * than by an initial `hidden` on either element: a second assignment would be
   * a line no test could fail on.
   */
  paint();

  return {
    element: panel.element,
    foldSlot,
    setReadout(next: HudOverviewViewModel | undefined): void {
      readout = next;
      paint();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
      /*
       * Nothing is cleared on leaving, and that is the difference between this
       * panel and the four beside it. Their readouts are *pulled* only while
       * their own tab is showing, so a stale one would be a figure nothing is
       * refreshing; this one rides `simulation/status-counts`, which the host
       * applies on every publication whatever tab is open. Clearing here would
       * blank the panel for up to half a second every time a player came back
       * to it, and would say "no prison is reporting" about a prison that is.
       */
    },
  };
}
