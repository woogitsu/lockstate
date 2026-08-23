import type { LocalizationKey } from '../../content/localization';
import type { IconId } from '../primitives/icon';
import type { BadgeTone } from '../primitives/status-badge';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudClockViewModel, HudCountsViewModel, HudSeverity, HudSpeed } from './view-model';

/**
 * Pure view-model → display-descriptor mapping.
 *
 * This is the layer that decides *what the HUD says*: which metrics exist,
 * in what order, with which icon, which message key and which tone. The DOM
 * builders in `status-strip.ts` and `hud.ts` do nothing but walk these
 * descriptors, so proving the mapping here proves what reaches the screen --
 * and it does so in the default `node` Vitest environment, with no DOM, as
 * `tests/unit/ui-save-panel-status.test.ts` already does for the save panel.
 */

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * The in-game clock as `HH:MM`, 24-hour, zero-padded.
 *
 * Deliberately *not* `Intl.DateTimeFormat`. This is a simulation clock, not
 * a wall clock: it has no date, no time zone and no AM/PM, and rendering it
 * through the host's locale would turn a fixed-width readout into a
 * variable-width one that reads `7:45 AM` for one player and `07:45` for
 * another. Localized formatting belongs to real timestamps.
 *
 * Out-of-range minutes wrap rather than throw, so a snapshot that runs one
 * tick past midnight before the day counter advances still renders.
 */
export function formatClockTime(minuteOfDay: number): string {
  if (!Number.isFinite(minuteOfDay)) return '--:--';
  const normalized = ((Math.trunc(minuteOfDay) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / MINUTES_PER_HOUR);
  const minutes = normalized % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Days are 1-based and never shown as zero or negative, whatever arrives. */
export function normalizeDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.max(1, Math.trunc(day));
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

export type HudMetricId = 'prisoners' | 'staff' | 'rooms' | 'incidents' | 'contraband';

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
      badge: hasIncidents
        ? { tone: 'danger', textKey: HUD_MESSAGE_KEY.incidentsActive }
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
