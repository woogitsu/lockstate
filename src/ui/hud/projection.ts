import type { LocalizationKey } from '../../content/localization';
import type { IconId } from '../primitives/icon';
import type { BadgeTone } from '../primitives/status-badge';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudAlertViewModel, HudClockViewModel, HudCountsViewModel, HudSeverity, HudSpeed } from './view-model';

/**
 * Pure view-model → display-descriptor mapping.
 *
 * This is the layer that decides *what the HUD says*: which metrics exist,
 * in what order, with which icon, which message key and which tone. The DOM
 * builders in `status-strip.ts` and `hud.ts` do nothing but walk these
 * descriptors, so proving the mapping here pins everything the strip is told
 * to show -- in the default `node` Vitest environment, with no DOM, as
 * `tests/unit/ui-save-panel-status.test.ts` already does for the save panel.
 * The builders themselves are never executed there, which is why what they
 * put in the DOM is asserted in `tests/browser/ui-shell.spec.ts`.
 */

/**
 * What the strip shows where it has no value to show.
 *
 * Not a message key, and not an ADR 0011 exception: it is punctuation, the
 * same in every locale, and it says *nothing is known* rather than naming a
 * condition. The condition is named by the alerts region.
 */
export const CLOCK_UNKNOWN_TEXT = '--';

/**
 * The 1-based in-game day, or `undefined` when no session has reported one.
 *
 * `undefined` is a real state and not a defensive default. Before a session
 * exists the simulation has no clock, and "day 1" would be a claim about a
 * prison that is not running.
 */
export function displayDay(day: number): number | undefined {
  if (!Number.isFinite(day)) return undefined;
  const whole = Math.trunc(day);
  return whole >= 1 ? whole : undefined;
}

/**
 * How far through the in-game day, as a whole percent, or `undefined` when
 * the day length is unknown.
 *
 * **Not** an hour-of-day. The simulation defines a day as a budget of ticks
 * and nothing maps that budget onto a 24-hour dial (`docs/HUD_PROJECTIONS.md`,
 * gap 5), so this reports the position the simulation actually publishes.
 * Rendering it as `07:45` instead would put a time on screen that no system
 * produces, which is the same class of lie as a money counter with no economy
 * behind it.
 *
 * Floored: 99.6% of the way through a day must not read as a whole day gone.
 * That is the same half of the rule `BoundedValue.filled` obeys by reserving
 * its last segment for the true maximum (`docs/HUD_PROJECTIONS.md` section
 * 4), and only that half -- a bar's *other* rule, that any value above zero
 * lights one segment, is deliberately not copied here. One tick into a
 * thousand-tick day is 0% and reporting `0` says so truthfully; a percent has
 * a zero and a bar has no empty-but-not-nothing state to draw.
 *
 * A tick position outside the day wraps rather than throwing, so a readout
 * that arrives one tick either side of the day boundary still renders.
 */
export function dayProgressPercent(tickOfDay: number, dayLengthTicks: number): number | undefined {
  if (!Number.isFinite(tickOfDay) || !Number.isFinite(dayLengthTicks)) return undefined;
  const length = Math.trunc(dayLengthTicks);
  if (length <= 0) return undefined;
  const position = ((Math.trunc(tickOfDay) % length) + length) % length;
  return Math.floor((position * 100) / length);
}

/**
 * Where a fast-forward tap goes.
 *
 * `1 -> 2 -> 4 -> 2`: repeated taps toggle between the two fast speeds
 * rather than dead-ending at ×4 or silently dropping back to real time.
 * Returning to ×1 is what the play button is for, so no tap is ever
 * ambiguous about what it will do.
 */
export function nextFastForwardSpeed(current: HudSpeed): HudSpeed {
  switch (current) {
    case 1:
      return 2;
    case 2:
      return 4;
    case 4:
      return 2;
  }
}

export interface TransportPressedStates {
  readonly pause: boolean;
  readonly play: boolean;
  readonly fastForward: boolean;
}

/**
 * Exactly one transport control is pressed at any time, so the three
 * buttons read as a state, not as three independent switches.
 */
export function transportPressedStates(clock: HudClockViewModel): TransportPressedStates {
  if (clock.mode === 'paused') return { pause: true, play: false, fastForward: false };
  const fast = clock.speed > 1;
  return { pause: false, play: !fast, fastForward: fast };
}

export type HudMetricId = 'prisoners' | 'staff' | 'rooms' | 'incidents' | 'contraband' | 'funds' | 'earned-today';

export interface HudMetricBadge {
  readonly tone: BadgeTone;
  readonly textKey: LocalizationKey;
}

export interface HudMetricDescriptor {
  readonly id: HudMetricId;
  readonly icon: IconId;
  readonly labelKey: LocalizationKey;
  readonly value: number;
  /** Present only for a bounded metric; drives the segmented bar. */
  readonly capacity: number | undefined;
  readonly tone: BadgeTone | undefined;
  readonly badge: HudMetricBadge | undefined;
}

/**
 * Occupancy tone.
 *
 * Over capacity is a real operational failure (prisoners with nowhere to
 * sleep), so it is `danger`; the 90% step is the early warning. Below that
 * the metric stays neutral -- a status strip where several things are always
 * amber teaches players to ignore amber.
 */
export function occupancyTone(prisoners: number, capacity: number): BadgeTone | undefined {
  if (capacity <= 0 || !Number.isFinite(capacity) || !Number.isFinite(prisoners)) return undefined;
  const ratio = prisoners / capacity;
  if (ratio > 1) return 'danger';
  if (ratio >= 0.9) return 'warning';
  return undefined;
}

/**
 * The top strip, left to right.
 *
 * Order is part of the contract: a HUD whose metrics move between builds is
 * one a player has to re-read every time.
 */
export function projectStatusMetrics(counts: HudCountsViewModel): readonly HudMetricDescriptor[] {
  const hasIncidents = counts.activeIncidents > 0;
  const capacity = counts.prisonerCapacity > 0 ? counts.prisonerCapacity : undefined;

  return [
    {
      id: 'prisoners',
      icon: 'prisoners',
      labelKey: HUD_MESSAGE_KEY.prisoners,
      value: counts.prisoners,
      capacity,
      tone: occupancyTone(counts.prisoners, counts.prisonerCapacity),
      badge: undefined,
    },
    {
      id: 'staff',
      icon: 'staff',
      labelKey: HUD_MESSAGE_KEY.staff,
      value: counts.staff,
      capacity: undefined,
      tone: undefined,
      badge: undefined,
    },
    {
      id: 'rooms',
      icon: 'rooms',
      labelKey: HUD_MESSAGE_KEY.rooms,
      value: counts.rooms,
      capacity: undefined,
      tone: undefined,
      badge: undefined,
    },
    {
      id: 'incidents',
      icon: 'incident',
      labelKey: HUD_MESSAGE_KEY.incidents,
      value: counts.activeIncidents,
      capacity: undefined,
      tone: hasIncidents ? 'danger' : undefined,
      // Colour is never the only signal: the badge states the condition in
      // words, so the strip still reads correctly in monochrome, to a
      // colour-blind player and to a screen reader.
      //
      // **The word itself now names the kind when one is nameable**
      // (issue #506 finding 2): `activeIncidentTypeLabelKey` is one of the
      // `incident-type.*.name` labels `src/content/simulation-message-keys.ts`
      // already authors -- "Assault", "Riot", "Escape Attempt", "Gang
      // Retaliation" -- reused as-is rather than new copy. It falls back to
      // the generic "Active" this strip has always shown whenever the worker
      // could not name exactly one kind: nothing is open, or (unreachable with
      // the shipped single-sector topology, ADR 0061 decision 6) more than one
      // distinct kind is open across several sectors at once. Either way the
      // fallback is a sentence this codebase already ships, never a guess at
      // one it does not.
      badge: hasIncidents
        ? { tone: 'danger', textKey: counts.activeIncidentTypeLabelKey ?? HUD_MESSAGE_KEY.incidentsActive }
        : { tone: 'success', textKey: HUD_MESSAGE_KEY.incidentsClear },
    },
    {
      id: 'contraband',
      icon: 'contraband',
      labelKey: HUD_MESSAGE_KEY.contraband,
      value: counts.contrabandFound,
      capacity: undefined,
      tone: counts.contrabandFound > 0 ? 'warning' : undefined,
      badge: undefined,
    },
    {
      id: 'funds',
      icon: 'build',
      labelKey: HUD_MESSAGE_KEY.funds,
      // The balance as the simulation holds it: a count of minor units,
      // formatted by the strip like every other count.
      //
      // **Not divided into a major unit, and not given a symbol.** #96
      // settled that money is the primary resource and named no currency, and
      // ADR 0017 is Accepted without naming one either -- so the unit and the
      // symbol are nobody's decision yet rather than a decision waiting on an
      // approval. Dividing by 100 and printing a symbol would take both by
      // implication, in a chip. A plain number under a label reading "Funds"
      // is the honest rendering of a quantity whose unit
      // nobody has chosen -- and every price in
      // `src/content/procurement-catalog.ts` is a whole number of these, so
      // the figure the player compares against is in the same units.
      //
      // That comparison is a real one since #89: the Build panel's buy
      // control renders `unit price × quantity` in these same units, so the
      // two numbers on screen can be read against each other without anybody
      // having chosen a currency to divide them by.
      value: counts.treasuryMinorUnits,
      capacity: undefined,
      // No tone. "Low on money" is a threshold, and a threshold is a balance
      // decision -- the same reason `BoundedValue` carries no severity band.
      // There is still nothing to be low *for* on a schedule, but the reason
      // inverted with #29 rather than going away: the state now pays in once a
      // day and nothing at all is charged, so a warning here would describe a
      // slope that runs the wrong way.
      //
      // Worth recording, because this comment used to say the opposite. Until
      // #29 it had to carry the qualifier "on a schedule" -- the unqualified
      // form was false from the day `ProcurementSystem.cancel` landed, and
      // `tests/foundation/documentation-claims-contract.test.ts` was written
      // for exactly that defect. A scheduled credit now exists, so the claim
      // this comment once made is simply untrue and is gone rather than
      // qualified. The phrase itself is deliberately not spelled out here: that
      // check reads comments, so quoting the thing it hunts for would trip it.
      tone: undefined,
      badge: undefined,
    },
    {
      id: 'earned-today',
      // The clock's own icon, because this figure is a statement about the
      // in-game day rather than about money: it resets when the day does.
      icon: 'clock',
      labelKey: HUD_MESSAGE_KEY.earnedToday,
      // What this day has earned so far, in the same minor units as the
      // balance above -- so the two chips sit beside each other and can be
      // read against each other without a conversion nobody has chosen.
      //
      // **Appended after `funds` deliberately.** The strip's descriptor list is
      // the single definition of which metrics exist and in what order
      // (`status-strip.ts` walks it to build the DOM), so a new chip at the end
      // adds a column without moving one.
      value: counts.stateIncomeAccruedTodayMinorUnits,
      capacity: undefined,
      // No tone and no badge, for the same reason `funds` has neither: "a good
      // day" is a threshold, and nobody has set one.

      tone: undefined,
      badge: undefined,
    },
  ];
}

const SEVERITY_TONES: Readonly<Record<HudSeverity, BadgeTone>> = {
  info: 'info',
  warning: 'warning',
  danger: 'danger',
};

const SEVERITY_LABEL_KEYS: Readonly<Record<HudSeverity, LocalizationKey>> = {
  info: HUD_MESSAGE_KEY.severityInfo,
  warning: HUD_MESSAGE_KEY.severityWarning,
  danger: HUD_MESSAGE_KEY.severityDanger,
};

export function severityTone(severity: HudSeverity): BadgeTone {
  return SEVERITY_TONES[severity];
}

/** The word that accompanies a severity colour, so the colour never stands alone. */
export function severityLabelKey(severity: HudSeverity): LocalizationKey {
  return SEVERITY_LABEL_KEYS[severity];
}

/**
 * How severe each severity is, for picking one out of a list.
 *
 * A `Record` over the closed union rather than an array, so a fourth member of
 * `HudSeverity` fails to compile here until somebody says where it ranks --
 * the property `SEVERITY_TONES` above is written for and the reason neither is
 * a lookup with a fallback.
 */
const SEVERITY_RANK: Readonly<Record<HudSeverity, number>> = {
  info: 0,
  warning: 1,
  danger: 2,
};

/**
 * What a *folded* alerts section has to say for itself (issue #569).
 *
 * ## Why anything is owed here at all
 *
 * The alerts list is where every refusal the simulation reports is written --
 * forty reasons, `REFUSAL_LABEL_KEYS` in `src/ui/simulation-alerts.ts` -- and
 * `INITIAL_HUD_SHELL_STATE` folds that section on arrival, deliberately and
 * for a good reason: "a list that is empty most of the time should not hold
 * open a rectangle over the prison to say so".
 *
 * Both of those are right, and together they were a dead end. Measured on the
 * assembled page: a designation refused `zone.not-enclosed` put its sentence
 * in the DOM at `boxWidth: 0, boxHeight: 0`, under a header reading `ALERTS`
 * and nothing else, and the press looked to the player exactly like a press
 * that had done nothing. Two other decisions had leaned on that channel
 * without anyone noticing it was folded: `src/simulation/rooms/zoning.ts`
 * deleted the Rooms panel's own post-confirm warning because "the sentence it
 * carried is now `hud.alert.refusal.zone.not-enclosed`, said at the moment the
 * player can still act on it", and `src/ui/hud/rooms-panel.ts` leaves the
 * Designate control live over an open rectangle because "the real simulation
 * still decides".
 *
 * So the fold stays and the header stops being silent, which is the idiom the
 * Build panel's queue already uses one module over (`build-panel.ts`, the
 * `trailing: queueCount` on a section that is *also* collapsed when it
 * appears).
 *
 * ## Why a count and a tone rather than a dot
 *
 * `createStatusBadge` states the rule this obeys: "The tone is an *addition*
 * to the text, never a replacement for it: a badge always carries a word, so a
 * red-green colour-blind player, a monochrome display and a screen reader all
 * get the same information." A coloured dot on the header would have been
 * cheaper and is not available.
 *
 * `undefined` for an empty list, and that is the half that keeps the original
 * decision intact: a prison with nothing to report shows no badge at all, so
 * the corner is exactly as quiet as it was before this existed.
 *
 * The severity is the **highest** present rather than the newest. A list
 * holding one `danger` and four `info` rows is a list a player should open,
 * and a badge that took the last row's tone would say `Info` for it.
 */
export interface HudAlertsSummary {
  readonly count: number;
  readonly severity: HudSeverity;
  readonly tone: BadgeTone;
}

export function summariseAlerts(alerts: readonly HudAlertViewModel[]): HudAlertsSummary | undefined {
  let worst: HudSeverity | undefined;
  for (const alert of alerts) {
    if (worst === undefined || SEVERITY_RANK[alert.severity] > SEVERITY_RANK[worst]) worst = alert.severity;
  }
  if (worst === undefined) return undefined;
  return { count: alerts.length, severity: worst, tone: severityTone(worst) };
}

/**
 * What to tell the player when the host refused the action a control asked
 * for (issue #207).
 *
 * A *command* -- a clock change, a build order, a purchase, an undo -- asks
 * the simulation to change and changes nothing locally, so a refusal means the
 * prison is exactly as it was and the player has to be told, or the control
 * they pressed is a control that silently did nothing (issue #82's point). "The
 * control they pressed" is a key for the undo pair and there is no button to
 * mark, which changes where the report lands and not whether one is owed.
 *
 * A *chrome* intent returns `undefined`, and that is the whole reason this
 * is a mapping rather than one generic sentence: selecting a tab, folding a
 * panel or arming the build tool has **already been applied locally** before
 * the host is told, so a failure to notify the host is not something the
 * player did not get. Saying "that did not go through" about a tab that
 * visibly did would be a false statement on screen -- the failure still
 * reaches the host through `MountHudOptions.onError`.
 */
export function refusalMessageKey(actionId: string): LocalizationKey | undefined {
  switch (actionId) {
    case 'set-clock':
      return HUD_MESSAGE_KEY.refusalSetClock;
    case 'place-build-order':
      return HUD_MESSAGE_KEY.refusalPlaceBuildOrder;
    case 'purchase-materials':
      return HUD_MESSAGE_KEY.refusalPurchaseMaterials;
    case 'hire-staff':
      return HUD_MESSAGE_KEY.refusalHireStaff;
    case 'undo':
      return HUD_MESSAGE_KEY.refusalUndo;
    case 'redo':
      return HUD_MESSAGE_KEY.refusalRedo;
    case 'zone-room':
      return HUD_MESSAGE_KEY.refusalZoneRoom;
    case 'unzone-room':
      return HUD_MESSAGE_KEY.refusalUnzoneRoom;
    case 'admit-prisoner':
      return HUD_MESSAGE_KEY.refusalAdmitPrisoner;
    case 'cancel-build-order':
      return HUD_MESSAGE_KEY.refusalCancelBuildOrder;
    case 'cancel-material-purchase':
      return HUD_MESSAGE_KEY.refusalCancelMaterialPurchase;
    case 'release-guard':
      return HUD_MESSAGE_KEY.refusalReleaseGuard;
    default:
      return undefined;
  }
}
