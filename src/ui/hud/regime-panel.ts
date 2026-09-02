import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { element, eyebrowText, valueText } from '../primitives/dom';
import { createPanel } from '../primitives/panel';
import { createSegmentedBar, type SegmentedBar } from '../primitives/segmented-bar';
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
 * ### The need bar, and the decision it reverses
 *
 * Each row now draws that prisoner's **worst** need as a bar (issue #535,
 * decision 6). This block used to be headed "What it deliberately does not
 * show" and its first entry refused exactly that, in these words:
 *
 * > **No need bars.** `PrisonerRosterRowViewModel` carries `lowestNeed`, the
 * > most depleted of the six, and it is not rendered: `docs/HUD_PROJECTIONS.md`
 * > gap 7 records that the simulation defines no warning or critical threshold
 * > for any need, so a bar here could show a level and could not say whether it
 * > was bad. A column of unbanded bars in a four-row window of a prison that
 * > holds up to `DEFAULT_PRISONER_CAPACITY` is not a way to find the starving
 * > prisoner; what would make one is a projected threshold or a projected
 * > worst-off ordering, and both are projection changes rather than panel ones.
 *
 * It is quoted rather than deleted because it was right, and because what
 * changed is a *fact it depended on* rather than the owner's mind
 * (`docs/AGENT_WORKFLOW.md` §4: mark both directions).
 *
 * **The premise expired.** "The simulation defines no warning or critical
 * threshold for any need" was true when it was written and stopped being true
 * at `d1b6b5c` (#488), which added `STATE_INCOME_UNMET_NEED_LEVEL` -- the level
 * at or below which the state withholds part of that prisoner's day of the
 * operating grant. `docs/HUD_PROJECTIONS.md` gap 7 records the same correction
 * against itself: *"Narrowed, not closed, by #443 ... it is the fact this gap
 * was waiting for."*
 *
 * **Its remedy is what shipped.** The old text named two things that would make
 * a bar worth drawing -- "a projected threshold or a projected worst-off
 * ordering" -- and said both were projection changes. Both halves are now true
 * of this panel: `lowestNeed` was already the worst-off *per row*, and
 * `PrisonerNeedViewModel.unmetForStateIncome` is the projected threshold, added
 * for this. The panel compares nothing; it reads a flag. So this is the
 * refusal's own condition being met, not the refusal being overridden.
 *
 * **What stayed refused.** Gap 7's remaining half -- the player-facing "your
 * prisoners are unhappy" line -- is the owner's, and nothing here invents one.
 * The bar's `warning` tone means *the state is withholding for this need*,
 * which is a promise the code keeps (`stateIncomeForPrisonerDay` really does
 * pay less), and it is the shipped constant rather than a number chosen here.
 * If the owner wants a different line, `STATE_INCOME_UNMET_NEED_LEVEL` is the
 * single edit and `describePrisonerNeed` is the single reader of the flag.
 *
 * ### What it still deliberately does not show
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
 * **The measurement exists now, and it says four still fits.** Taken on
 * 2026-08-29 when the worst-need bar was added (#535 decision 6), which is the
 * change that could have spent the headroom this paragraph was estimating.
 * Four rows of the browser suite's own `ROSTER` fixture, row border-box
 * heights, at all five viewports that suite visits:
 *
 * | viewport | row heights | the activity line wrapped |
 * | --- | --- | --- |
 * | 1280x720 | 44.7, 27.5, 27.5, 44.7 | rows 1 and 4 |
 * | 1440x900 | 44.7, 27.5, 27.5, 44.7 | rows 1 and 4 |
 * | 1024x768 | 44.7, 27.5, 27.5, 44.7 | rows 1 and 4 |
 * | 900x600 | 44.7, 27.5, 27.5, 44.7 | rows 1 and 4 |
 * | 375x812 | 27.5, 27.5, 27.5, 27.5 | none |
 *
 * **44.7px against the 54.75px the arithmetic allows**, so the inherited bound
 * holds rather than merely being assumed to. The two tall rows are the ones
 * carrying the longest activity words -- "Heading to Showering" and "Free
 * Association" -- whose line wraps to put the need pair underneath; they wrap
 * on the *desktop* viewports and not at 375x812 because the side rail is
 * narrower than the mobile panel, which is the degradation
 * `.hud-regime__roster-line`'s `flex-wrap` exists for. The assertion that
 * actually guards this is `tests/browser/ui-shell.spec.ts`'s *"keeps the last
 * line of the roster inside the panel's fold at every viewport"*; the table is
 * here so the next change to a roster row knows what it is spending.
 *
 * It is a **window on the population, not a list of it.** A prison holds up to
 * `DEFAULT_PRISONER_CAPACITY` (5,000) and `MAX_PROJECTION_PAGE_LIMIT` is 500,
 * so no panel and no single reply could carry a full roster whatever height it
 * had. The count beside the header is what says so, and the total it divides
 * by is the projection's rather than this panel's.
 *
 * **Four is still four after issue #703, and the owner ruled it explicitly**
 * (fourth ruling of 2026-08-31): the alternative on the table was showing more
 * rows, and what shipped instead is that the four rows are now the four
 * *highest-tier* prisoners rather than the four oldest arrivals
 * (`projectPrisonerRoster`). So none of the arithmetic above is spent -- the
 * row heights, the 219.0px budget and the 54.75px ceiling are untouched,
 * because the change is to which four prisoners fill the same four boxes.
 *
 * That reordering is bound by the rule issue #209 left standing --
 * *"the position of a row the player is already reading must not change under
 * them"* (`src/ui/simulation-alerts.ts`, `replaceOrAppend`) -- and the
 * projection keeps it the only way a repainted list can: the order is a total
 * order over state, `(descending riskTier, ascending entity index)`, so a row
 * moves only when that prisoner's tier changes or somebody above them leaves.
 * Two prisoners at the same tier can never swap between publications, which is
 * the failure a "stable sort" would only avoid by accident. Nothing in the
 * block is focusable, so a move cannot take focus with it either.
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
 * classification *group*, with one exception the owner ruled on and which the
 * next section is about. They are largely the same fact at two grains
 * (`classificationGroupIdForTier` is `riskTier >= 3`), and splitting them is
 * what lets one badge carry both: a tier moving 0 -> 1 changes the word while a
 * prisoner is still on the general-population timetable, and the group's tone
 * changes on the move that actually changes their day.
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
 *
 * ### Tier 2 is the one tone that comes from the tier, and that is a ruling
 *
 * **The paragraph above said "the tone is the classification group", full
 * stop, and that was true until the owner's ruling of 2026-09-02 on issue
 * #788.** It is narrowed rather than deleted, because the reason it gave is
 * intact for every other row and is exactly what made this case hard.
 *
 * Two sound decisions composed into a warning the warning layer could not
 * show. This function tied the tone to the group *deliberately* -- the group is
 * what changes a prisoner's day -- and ADR 0090's
 * `ClassificationEarlyWarningSystem` is capped at `Medium` *precisely so it can
 * never move a group*, because crossing into `high-risk` carries the restricted
 * regime and ADR 0080's contraband draw with it. So the tier that ADR 0090
 * exists to make visible was the one tier that could arrive with no change of
 * colour at all: a playtest of 2026-09-02 measured eleven prisoners reaching
 * tier 2 at tick 26,514 and the badge still reading `neutral` -- the tone
 * `Minimal` carries -- for 3,098 further ticks.
 *
 * Neither decision is changed here. What changed is that **tier 2's tone comes
 * from the tier**, and it is `caution`: its own tone, distinct from
 * `Minimal`/`Low`'s `neutral` and from high risk's `warning`, and a rung below
 * `warning` rather than above it (`BadgeTone`, which says why no existing tone
 * would do). Tier 3 still takes its tone from the group, and the group is still
 * the only thing that can say a prisoner's day has changed.
 *
 * The group is tested **first**, so a row whose group is `high-risk` reads
 * `warning` whatever tier it carries. That ordering is not reachable from
 * `projectPrisonerRoster` -- `classificationGroupIdForTier` writes the pair --
 * and it is chosen rather than left to fall out, because the group is the
 * stronger statement of the two and a disagreement should not be able to
 * *demote* a restricted prisoner's badge.
 *
 * **What this does not do, and it is still owed.** The badge carries no `title`
 * and no screen-reader text (ADR 0090 names the same gap under "What this does
 * not decide"), so `Medium` now has a colour and still has no explanation. A
 * colour with no name is not reachable by a screen reader at all, and the
 * sentence that would name it is player-facing copy -- `AGENTS.md`'s fourth
 * exclusion, the owner's.
 */
export interface PrisonerRowReadout {
  readonly tone: BadgeTone;
  /** The badge's word: the tier for a classified prisoner, the intake stage for one still arriving. */
  readonly badgeKey: LocalizationKey;
}

/**
 * The tier the owner's ruling of 2026-09-02 gives a tone of its own.
 *
 * `2`, spelled here for the reason the `'high-risk'` group id is spelled in
 * this file and in `projection.ts`: `RiskTier` and
 * `EARLY_WARNING_TIER_CEILING` live under `src/simulation/prisoners/`, and the
 * HUD may not import the simulation (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`). The same number is
 * `EARLY_WARNING_TIER_CEILING` on the other side of the boundary -- ADR 0090's
 * cap -- and that is not a coincidence: this is the tier that system exists to
 * make reachable, and the tier a prisoner can now sit at for roughly eighteen
 * in-game days.
 *
 * A wrong number here would tone the wrong tier, which is why
 * `tests/unit/ui-simulation-prisoner-roster.test.ts` drives all four tiers
 * rather than only this one.
 */
const MEDIUM_RISK_TIER = 2;

/** The classification group whose timetable is the restricted one. Spelled for `MEDIUM_RISK_TIER`'s reason. */
const HIGH_RISK_GROUP_ID = 'high-risk';

export function describePrisonerRow(row: HudPrisonerRowViewModel): PrisonerRowReadout {
  // No group at all: the prisoner is still in intake, and neither tier nor
  // group has been written. `info` rather than `neutral`, so a prison whose
  // arrivals are stuck at cell assignment does not read as a settled one --
  // the Intake panel on the Overview tab is where that is diagnosed.
  if (row.classificationGroupId === undefined) {
    return { tone: 'info', badgeKey: row.standingLabelKey };
  }
  // The group first, and only then the tier -- see the header. The group is
  // the statement about the prisoner's day; the tier is the statement about
  // where their record is heading.
  if (row.classificationGroupId === HIGH_RISK_GROUP_ID) {
    return { tone: 'warning', badgeKey: row.standingLabelKey };
  }
  return {
    tone: row.riskTier === MEDIUM_RISK_TIER ? 'caution' : 'neutral',
    badgeKey: row.standingLabelKey,
  };
}

/**
 * The maximum a need's `permille` can reach, and the `max` the bar is driven
 * against.
 *
 * `1000` is `BoundedValue`'s own scale, not a number chosen here. The bar is
 * given `(permille, 1000)` rather than the need's raw level and raw maximum
 * because the projection deliberately withholds both -- `BoundedValue`'s header
 * says exposing them "would guarantee a HUD somewhere hard-codes `255`" -- and
 * per-mille is the figure it publishes instead.
 *
 * That substitution has a documented hazard and it is pinned rather than
 * argued. `toBoundedValue` warns that deriving a fill from `permille` "quantizes
 * twice", so `filledSegments(permille, 1000)` could in principle light a
 * different number of segments than the projection's own `filled` did from
 * `(level, NEED_MAX)`. It does not, for any of the 256 levels a need can hold,
 * and `tests/unit/regime-need-bar.test.ts` drives all 256 through both to say
 * so -- the same guard `tests/unit/segment-fill-agreement.test.ts` puts on the
 * two fill implementations.
 */
export const NEED_BAR_MAX_PERMILLE = 1000;

/**
 * What one prisoner's worst-need bar says and what colour it says it in.
 *
 * Pure and exported for `describePrisonerRow`'s reason, which is the whole
 * reason this function exists rather than four lines inside `paintRoster`:
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so nothing
 * headless can call `createRegimePanel`, and a tone rule written inside the DOM
 * builder would be unreachable from `pnpm test` rather than merely untested --
 * a mutation there survives because nothing can observe it.
 *
 * ### The tone is the state's line, and it is the only line drawn
 *
 * `warning` when the state is withholding part of this prisoner's day of the
 * operating grant over this need, `neutral` otherwise. Three things about that
 * choice are deliberate:
 *
 * - **The threshold is not decided here and is not a number here.** The panel
 *   receives `unmetForStateIncome`, a flag the projection computed from
 *   `STATE_INCOME_UNMET_NEED_LEVEL` via the same predicate `unmetNeedCount`
 *   sums to compute the money. There is no comparison and no constant on this
 *   thread to drift.
 * - **`warning` and not `danger`.** Nothing in the simulation calls an unmet
 *   need critical, and `docs/HUD_PROJECTIONS.md` gap 7 keeps the player-facing
 *   "this is bad" threshold with the owner. `warning` says the prison is losing
 *   money over this, which is true and is the strongest claim the code can keep.
 * - **The colour never stands alone.** The row renders the need's *word* beside
 *   the bar and the bar carries `aria-valuetext`, so a colour-blind player and a
 *   screen reader both get the fact without the hue -- the rule
 *   `describePrisonerRow` states for the badge, applied to the bar.
 */
export interface PrisonerNeedReadout {
  readonly tone: BadgeTone;
  /** The need's word: `need.hunger.name` and its five siblings, authored in `simulation-message-keys.ts`. */
  readonly labelKey: LocalizationKey;
  /** How full, on `BoundedValue`'s per-mille scale. */
  readonly permille: number;
}

export function describePrisonerNeed(row: HudPrisonerRowViewModel): PrisonerNeedReadout {
  const need = row.lowestNeed;
  return {
    tone: need.unmetForStateIncome ? 'warning' : 'neutral',
    labelKey: need.labelKey,
    permille: need.permille,
  };
}

/**
 * The bar's spoken value: the need's fullness as a percentage.
 *
 * A formatted *number* and not a sentence, which is the whole reason it is
 * allowed to exist without an owner decision -- `AGENTS.md`'s fourth exclusion
 * covers new player-facing copy, and this authors none. The form is the one
 * `status-strip.ts` already uses for the day-progress readout:
 * `formatNumber(fraction, { style: 'percent' })`, so the percent sign, its
 * spacing and the digits are the locale's rather than this panel's.
 *
 * `maximumFractionDigits: 0` because a bar of ten segments cannot show a
 * fraction of a percent, and a spoken value more precise than the thing it
 * describes invites a player to trust a digit the readout did not draw.
 */
export function formatNeedValueText(localizer: HudLocalizer, permille: number): string {
  return localizer.formatNumber(permille / NEED_BAR_MAX_PERMILLE, { style: 'percent', maximumFractionDigits: 0 });
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
   * `undefined` hides the block. `total: 0` draws the empty sentence only
   * when `everAdmitted` is also false -- see `paintRoster`'s own comment
   * (issue #506) for why a roster that emptied by discharge draws no
   * sentence at all rather than this one, which would be false of it.
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
    readonly needName: HTMLSpanElement;
    readonly needBar: SegmentedBar;
    readonly badge: StatusBadge;
  }

  /**
   * Everything a row asserts about *a particular prisoner*, removed together.
   *
   * One helper and not two copies, because the two callers below -- a roster
   * that went away entirely, and a pooled row the current reply is too short to
   * fill -- have to clear exactly the same set, and the previous shape (the
   * same three `delete`s written twice) is the shape that silently keeps a
   * fourth attribute in one place and not the other. A hidden row carrying a
   * stale `data-need` would answer a probe with the last prisoner who occupied
   * that slot.
   */
  function clearRowData(row: HTMLElement): void {
    delete row.dataset['prisoner'];
    delete row.dataset['classificationGroup'];
    delete row.dataset['riskTier'];
    delete row.dataset['need'];
    delete row.dataset['needPermille'];
    delete row.dataset['needUnmet'];
  }

  const rosterList = element('div', { className: 'hud-regime__roster-list' });

  const rosterRows: readonly RosterRow[] = Array.from({ length: PRISONER_ROSTER_ROW_LIMIT }, (): RosterRow => {
    const name = valueText('', 'hud-regime__roster-name');
    const activity = eyebrowText('', 'hud-regime__roster-activity');
    const needName = eyebrowText('', 'hud-regime__roster-need-name');
    // Named empty and renamed on every paint. A pooled row's worst need
    // changes between ticks, so the name that matters is the one `update`
    // sets -- see `SegmentedBarState.label`.
    const needBar = createSegmentedBar({ label: '' });
    // The need's word and its bar share one line, and the line sits *beside*
    // the activity rather than under it. Under it would make the row three
    // lines deep, and `PRISONER_ROSTER_ROW_LIMIT`'s own derivation above puts
    // the whole four-row budget inside 219.0px on the tightest viewport the
    // browser suite visits -- a third line spends headroom that arithmetic
    // does not have to give. Beside it the pair wraps only when the row is
    // genuinely too narrow, which `hud.css` lets it do.
    const need = element('div', {
      className: 'hud-regime__roster-need',
      children: [needName, needBar.element],
    });
    const badge = createStatusBadge({ tone: 'neutral', text: '' });
    const row = element('div', {
      className: 'hud-regime__roster-row',
      children: [
        element('div', {
          className: 'hud-regime__roster-text',
          children: [name, element('div', { className: 'hud-regime__roster-line', children: [activity, need] })],
        }),
        badge.element,
      ],
    });
    row.hidden = true;
    rosterList.append(row);
    return { element: row, name, activity, needName, needBar, badge };
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
      delete rosterBlock.dataset['everAdmitted'];
      for (const row of rosterRows) {
        row.element.hidden = true;
        clearRowData(row.element);
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
    rosterBlock.dataset['everAdmitted'] = String(roster.everAdmitted);

    const shown = roster.rows.slice(0, PRISONER_ROSTER_ROW_LIMIT);
    rosterCount.textContent = t(HUD_MESSAGE_KEY.regimeRosterCount, {
      shown: localizer.formatNumber(shown.length),
      total: localizer.formatNumber(roster.total),
    });

    rosterRows.forEach((row, index) => {
      const prisoner = shown[index];
      if (prisoner === undefined) {
        row.element.hidden = true;
        clearRowData(row.element);
        return;
      }
      const readout = describePrisonerRow(prisoner);
      const need = describePrisonerNeed(prisoner);
      const needWord = t(need.labelKey);
      row.name.textContent = formatPrisonerName(t, prisoner);
      row.activity.textContent = formatPrisonerActivity(t, prisoner);
      row.badge.update({ tone: readout.tone, text: t(readout.badgeKey) });
      row.needName.textContent = needWord;
      // `label` on every update, not just the first: the row is pooled and the
      // *subject* of this bar changes with the prisoner and with which of their
      // six needs is now lowest.
      row.needBar.update({
        value: need.permille,
        max: NEED_BAR_MAX_PERMILLE,
        valueText: formatNeedValueText(localizer, need.permille),
        tone: need.tone,
        label: needWord,
      });
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
      // The need as data, and this is the half of the change that makes it a
      // measurement surface rather than a nicety.
      //
      // A bar's value lives in a CSS width and a count of lit `<span>`s, and
      // neither is a number a script can read without re-deriving the panel's
      // own quantization. These three are read directly:
      //
      // - `data-need` -- *which* need, as the stable simulation id, so a probe
      //   does not have to recognise a translated word.
      // - `data-need-permille` -- how full, `0`..`1000`, unrounded and
      //   unquantized. This is the field that finally tells "the need was
      //   served" from "the need decayed but not far enough": before it, both
      //   read as a prisoner on the roster with no number attached.
      // - `data-need-unmet` -- whether the state is withholding grant over it.
      //   The worst need being unmet is exactly `unmetNeedCount >= 1`, because
      //   no other need can be lower, so this attribute answers "is this
      //   prisoner costing the prison income at all" -- the question
      //   `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` has been
      //   unconfirmable in ordinary play for want of any readout at all.
      //
      // On the row rather than on the bar for `data-prisoner`'s reason: the
      // rows are pooled, so a probe keys everything about one prisoner off the
      // one element that names them.
      row.element.dataset['need'] = prisoner.lowestNeed.needId;
      row.element.dataset['needPermille'] = String(need.permille);
      row.element.dataset['needUnmet'] = String(prisoner.lowestNeed.unmetForStateIncome);
    });

    rosterList.hidden = shown.length === 0;
    // "Nobody has been admitted yet" is true of exactly one state: nobody
    // ever has been (issue #506). A prison that admitted a batch and has
    // since discharged all of it also reads `shown.length === 0`, and that
    // sentence would be false of it -- five people were admitted, served
    // their sentence and left, which is the opposite of "nobody". There is
    // no shipped sentence that says the true thing (searched
    // `default-locale-en.ts`: every other "nobody"/"empty" string names a
    // different subject -- guards, alerts, rooms, saves -- and reusing one
    // would only be a different false claim), and authoring one is the
    // owner's call (`AGENTS.md`'s fourth exclusion covers any new
    // player-facing sentence). So this state draws neither sentence: no box
    // asserting non-admission that isn't true, and no invented substitute.
    // The header above it still reads "0 of 0", which is not a claim about
    // history.
    rosterEmpty.hidden = shown.length > 0 || roster.everAdmitted;
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
