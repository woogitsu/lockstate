import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { element, eyebrowText, valueText } from '../primitives/dom';
import { createPanel } from '../primitives/panel';
import { createStatusBadge, type BadgeTone, type StatusBadge } from '../primitives/status-badge';
import { HUD_MESSAGE_KEY } from './messages';
import type {
  HudLocalizer,
  HudPrisonerRosterViewModel,
  HudPrisonerRowViewModel,
  HudRegimeBlockViewModel,
  HudRegimeViewModel,
} from './view-model';

/**
 * The Regime panel: what the prison's day allows right now, and who is in it
 * (issue #451).
 *
 * ### Why it is here, and why it is one panel and not two
 *
 * The `regime` tab has rendered nothing since ADR 0022 measured the tab bar
 * full at five and `hud-state.ts` gave the last slot to Rooms. It is the only
 * one of the five bound to no panel, and `tests/browser/ui-shell.spec.ts`
 * pinned that emptiness deliberately rather than as an oversight. A sixth tab
 * is foreclosed by the same measurement -- `.hud-tabs__inner` spans
 * 1.8 .. 373.2 at 375x812 -- so this tab is the only surface left, and the
 * roster and the timetable have to share it or one of them does not ship.
 *
 * Sharing it is not a compromise here, which is the reason it is one panel.
 * The two blocks are one subject read at two scales: the timetable says what
 * *general population* and *high risk* may do at this tick, and the roster
 * says who is in each and what they are actually doing. The join between them
 * is the thing #451 is about -- `ClassificationReviewSystem` rewrites a
 * prisoner's `classificationGroupIndex`, `ActionSystem` resolves the schedule
 * from that index on the next reconsideration, and the prisoner's day changes
 * shape. That reads as cause and effect only if both halves are on screen at
 * once.
 *
 * ### Boundaries
 *
 * A composer, exactly like the Staff and Intake panels. It holds no selection,
 * issues no intent, imports nothing from `src/simulation/**`, and every figure
 * and every word it renders arrives on the view model as a number or a message
 * key. In particular it does **not** count anything: the roster's `total` is
 * the projection's, and the window is whatever the host asked for -- a panel
 * that counted its own rows would report the window as the population.
 *
 * ### What it deliberately does not show
 *
 * **No need bars.** `PrisonerRosterRowViewModel` carries `lowestNeed`, the most
 * depleted of the six, and it is not rendered: `docs/HUD_PROJECTIONS.md` gap 7
 * records that the simulation defines no warning or critical threshold for any
 * need, so a bar here could show a level and could not say whether it was bad.
 * A column of unbanded bars in a four-row window of a prison that holds up to
 * `DEFAULT_PRISONER_CAPACITY` is not a way to find the starving prisoner; what
 * would make one is a projected threshold or a projected worst-off ordering,
 * and both are projection changes rather than panel ones.
 *
 * **No tile, and no cell.** The two spatial fields on the row are a tile and an
 * accommodation, and neither answers "where is this person". `ActionSystem`
 * writes the position component on *arrival* and never in between
 * (`docs/HUD_PROJECTIONS.md` gap 10), so a travelling prisoner's tile is the
 * place they left; and an accommodation resolves to the word "Cell" for every
 * prisoner in a prison whose only residential room type is `room.cell`, over an
 * instance id (`room.cell:12:9`) that is a machine name. Where a prisoner *is*,
 * as a player would say it, is gap 11 -- still unprojected.
 *
 * **No block bounds.** A regime block's `startTickOfDay`/`endTickOfDay` are
 * ticks, and `regime.ts` says outright that `DAY_LENGTH_TICKS` is a tick budget
 * rather than a mapping onto a clock face. The strip already had to withdraw an
 * `HH:MM` readout for exactly this reason. How far through the block the
 * simulation is, is a share of that block and renders honestly as a percent.
 */

/**
 * How many prisoners the roster shows at once.
 *
 * **Four, and the bound is inherited arithmetic rather than a new
 * measurement**, which is stated because the two precedents in this HUD were
 * measured and this is not: `HELD_GUARD_ROW_LIMIT` and
 * `PENDING_DELIVERY_ROW_LIMIT` are both three, and the held block was measured
 * at 219.0px for three rows at 900x600 -- the tightest viewport in the browser
 * suite -- with every Release button above the fold. A held-guard row is
 * floored by a 44px tap target because it carries a control; a roster row
 * carries none, so four of them fit inside that same 219.0px unless a row
 * exceeds 54.75px. `src/ui/simulation-prisoner-roster.ts` asks the worker for
 * exactly this many, so the constant bounds the *message* as well as the
 * layout, and it is one edit if the measurement says otherwise.
 *
 * It is a **window on the population, not a list of it.** A prison holds up to
 * `DEFAULT_PRISONER_CAPACITY` (5,000) and `MAX_PROJECTION_PAGE_LIMIT` is 500,
 * so no panel and no single reply could carry a full roster whatever height it
 * had. The count beside the header is what says so, and the total it divides
 * by is the projection's rather than this panel's.
 */
export const PRISONER_ROSTER_ROW_LIMIT = 4;

export interface RegimePanelOptions {
  readonly localizer: HudLocalizer;
}

/** The localizer call this panel makes, narrowed so the pure helpers below need no `HudLocalizer`. */
type Translate = (key: LocalizationKey, parameters?: MessageParameters) => string;

/**
 * What one prisoner's badge says and what colour it says it in.
 *
 * Pure and exported for the reason `describeStaffCoverage` is: the default
 * Vitest environment is `node` (`docs/TESTING.md`), so nothing headless can
 * call `createRegimePanel`, and *which of three things the panel says about a
 * prisoner's standing* is the decision this change adds. A rule that only ran
 * inside a DOM builder would be unreachable from `pnpm test` rather than merely
 * untested.
 *
 * ### The word and the colour are two different fields, on purpose
 *
 * The **word** is the risk tier once classification has run -- Minimal, Low,
 * Medium, High -- and the intake stage before it. The **tone** is the
 * classification *group*. They are the same fact at two grains
 * (`classificationGroupIdForTier` is `riskTier >= 3`), and splitting them is
 * what lets one badge carry both: a tier moving 1 -> 2 changes the word while a
 * prisoner is still on the general-population timetable, and the tone changes
 * on the move that actually changes their day.
 *
 * Deriving one from the other here would be the failure this layer exists to
 * avoid -- the group is projected, so the panel reads it rather than
 * recomputing the simulation's threshold on this thread. The row carries both
 * and this function picks, which is why a prisoner with a tier and no group is
 * impossible to render inconsistently: `projectPrisonerRoster` emits the pair
 * or neither.
 *
 * `warning` for high risk is not a claim that the prisoner is a problem. It is
 * that they are on the restricted timetable -- confined to sleep, meals and
 * hygiene for 2,200 of the day's 2,400 ticks (`HIGH_RISK_REGIME`) -- which is a
 * fact about the prison the player is running, and the badge carries the word
 * beside the colour so the colour never stands alone.
 */
export interface PrisonerRowReadout {
  readonly tone: BadgeTone;
  /** The badge's word: the tier for a classified prisoner, the intake stage for one still arriving. */
  readonly badgeKey: LocalizationKey;
}

export function describePrisonerRow(row: HudPrisonerRowViewModel): PrisonerRowReadout {
  // No group at all: the prisoner is still in intake, and neither tier nor
  // group has been written. `info` rather than `neutral`, so a prison whose
  // arrivals are stuck at cell assignment does not read as a settled one --
  // the Intake panel on the Overview tab is where that is diagnosed.
  if (row.classificationGroupId === undefined) {
    return { tone: 'info', badgeKey: row.standingLabelKey };
  }
  return {
    tone: row.classificationGroupId === 'high-risk' ? 'warning' : 'neutral',
    badgeKey: row.standingLabelKey,
  };
}

/**
 * Who the row is about.
 *
 * A name is the one player-facing string that is not a message key (ADR 0015),
 * and its two halves are put together *here* because their order is a locale
 * decision. A prisoner who has not reached the intake stage that mints one is
 * named by their entity id instead of being left blank -- the rule
 * `formatHeldGuardText` follows one panel over, and for the same reason: the
 * row is still about somebody.
 */
export function formatPrisonerName(t: Translate, row: HudPrisonerRowViewModel): string {
  const { name } = row;
  return name === undefined
    ? t(HUD_MESSAGE_KEY.regimeRosterUnnamed, { id: row.entityId })
    : t(HUD_MESSAGE_KEY.regimeRosterName, { given: name.givenName, family: name.familyName });
}

/**
 * What the row says they are doing.
 *
 * Two forms and not three. A prisoner performing an action is described by the
 * action's own word -- "Showering", "Yard Time" -- and a prisoner with no
 * action selected by the phase's, which is "Idle". Only the walk gets a
 * wrapper, because only the walk is about a place the prisoner is not yet.
 */
export function formatPrisonerActivity(t: Translate, row: HudPrisonerRowViewModel): string {
  const activity = t(row.activityLabelKey);
  return row.travelling ? t(HUD_MESSAGE_KEY.regimeRosterHeading, { activity }) : activity;
}

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
  /**
   * Repaint the roster from a fresh `hud/prisoner-roster` reply.
   *
   * `undefined` hides the block; `total: 0` draws the empty sentence. The two
   * are different facts and the second is the one that is about the prison.
   */
  setRoster(roster: HudPrisonerRosterViewModel | undefined): void;
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

  // ---- who is in the prison -----------------------------------------
  /**
   * One pooled roster row: who, what they are doing, and how they stand.
   *
   * Pooled where the timetable above is rebuilt, and the difference is the
   * badge: `createStatusBadge` builds an element per row and this block
   * repaints on the counts cadence, so rebuilding would discard and rebuild
   * `PRISONER_ROSTER_ROW_LIMIT` badges twice a second for a list whose length
   * never changes. It also gives the row a stable box for a layout
   * measurement, which is what `HELD_GUARD_ROW_LIMIT` was fixed against.
   */
  interface RosterRow {
    readonly element: HTMLElement;
    readonly name: HTMLSpanElement;
    readonly activity: HTMLSpanElement;
    readonly badge: StatusBadge;
  }

  const rosterList = element('div', { className: 'hud-regime__roster-list' });

  const rosterRows: readonly RosterRow[] = Array.from({ length: PRISONER_ROSTER_ROW_LIMIT }, (): RosterRow => {
    const name = valueText('', 'hud-regime__roster-name');
    const activity = eyebrowText('', 'hud-regime__roster-activity');
    const badge = createStatusBadge({ tone: 'neutral', text: '' });
    const row = element('div', {
      className: 'hud-regime__roster-row',
      children: [
        element('div', { className: 'hud-regime__roster-text', children: [name, activity] }),
        badge.element,
      ],
    });
    row.hidden = true;
    rosterList.append(row);
    return { element: row, name, activity, badge };
  });

  const rosterCount = valueText('', 'hud-regime__roster-count');
  const rosterEmpty = eyebrowText(t(HUD_MESSAGE_KEY.regimeRosterEmpty), 'hud-regime__note');
  const rosterMore = eyebrowText('', 'hud-regime__note hud-regime__roster-more');

  const rosterBlock = element('div', {
    className: 'hud-regime__roster',
    children: [
      element('div', {
        className: 'hud-regime__roster-header',
        children: [eyebrowText(t(HUD_MESSAGE_KEY.regimeRoster)), rosterCount],
      }),
      rosterList,
      rosterEmpty,
      rosterMore,
    ],
  });

  let roster: HudPrisonerRosterViewModel | undefined;

  function paintRoster(): void {
    rosterBlock.hidden = roster === undefined;
    if (roster === undefined) {
      rosterCount.textContent = '';
      delete rosterBlock.dataset['total'];
      for (const row of rosterRows) {
        row.element.hidden = true;
        delete row.element.dataset['prisoner'];
        delete row.element.dataset['classificationGroup'];
        delete row.element.dataset['riskTier'];
      }
      rosterList.hidden = true;
      rosterEmpty.hidden = true;
      rosterMore.hidden = true;
      return;
    }

    // The population as data as well as as text, so a test reads it without
    // parsing a localized sentence -- the job `data-waiting` does on the
    // Intake panel's readout.
    rosterBlock.dataset['total'] = String(roster.total);

    const shown = roster.rows.slice(0, PRISONER_ROSTER_ROW_LIMIT);
    rosterCount.textContent = t(HUD_MESSAGE_KEY.regimeRosterCount, {
      shown: localizer.formatNumber(shown.length),
      total: localizer.formatNumber(roster.total),
    });

    rosterRows.forEach((row, index) => {
      const prisoner = shown[index];
      if (prisoner === undefined) {
        row.element.hidden = true;
        delete row.element.dataset['prisoner'];
        delete row.element.dataset['classificationGroup'];
        delete row.element.dataset['riskTier'];
        return;
      }
      const readout = describePrisonerRow(prisoner);
      row.name.textContent = formatPrisonerName(t, prisoner);
      row.activity.textContent = formatPrisonerActivity(t, prisoner);
      row.badge.update({ tone: readout.tone, text: t(readout.badgeKey) });
      row.element.hidden = false;
      // The row's identity for a browser probe, and the two fields the badge
      // renders as a word and a colour. The rows are pooled, so "the second
      // row" is not a stable name for a prisoner -- the same reason
      // `data-guard` exists on the held list.
      row.element.dataset['prisoner'] = String(prisoner.entityId);
      if (prisoner.classificationGroupId === undefined) delete row.element.dataset['classificationGroup'];
      else row.element.dataset['classificationGroup'] = prisoner.classificationGroupId;
      if (prisoner.riskTier === undefined) delete row.element.dataset['riskTier'];
      else row.element.dataset['riskTier'] = String(prisoner.riskTier);
    });

    rosterList.hidden = shown.length === 0;
    rosterEmpty.hidden = shown.length > 0;
    // Counted against `roster.total` and not against the rows that arrived: the
    // reader asks for one row budget's worth, so the window is what came back
    // and the total is what the prison holds.
    const remaining = roster.total - shown.length;
    rosterMore.hidden = remaining <= 0;
    if (remaining > 0) {
      rosterMore.textContent = t(HUD_MESSAGE_KEY.regimeRosterMore, { count: localizer.formatNumber(remaining) });
    }
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
  panel.body.append(blocksBlock, rosterBlock);

  /*
   * The single authority on whether either block has a box, run once here
   * rather than by an initial `hidden` on the elements: a second assignment
   * would be a line no test could fail on, which is the rule `paintNeeds` and
   * `paintCoverage` both state.
   */
  paintRegime();
  paintRoster();

  return {
    element: panel.element,
    setRegime(next: HudRegimeViewModel | undefined): void {
      regime = next;
      paintRegime();
    },
    setRoster(next: HudPrisonerRosterViewModel | undefined): void {
      roster = next;
      paintRoster();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
      // Both readouts are *pulled* while this tab is the one showing, so
      // leaving it stops the refresh -- and a readout nothing is refreshing
      // goes stale in silence. Cleared rather than frozen, exactly as the
      // Rooms and Intake panels clear their own: what is on screen must be
      // something a system is still answering for.
      if (!visible) {
        regime = undefined;
        roster = undefined;
        paintRegime();
        paintRoster();
      }
    },
  };
}
