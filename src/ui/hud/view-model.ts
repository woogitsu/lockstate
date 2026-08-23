import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';

/**
 * What the HUD needs in order to draw itself -- and nothing else.
 *
 * `AGENTS.md` boundary 1: "Rendering is not simulation." The HUD is a view
 * over snapshots and may never become a source of truth, so this module
 * imports nothing from `src/simulation/**` and the HUD is handed plain,
 * already-projected data by whoever owns the simulation connection. A
 * `HudViewModel` is a value: constructing one in a test needs no worker, no
 * kernel and no renderer.
 *
 * Text never crosses this boundary in either direction. The view model
 * carries **message keys**, not translated strings (ADR 0011): a key is a
 * stable identifier that the simulation may hold and persist, whereas a
 * translated string may not be persisted, hashed, compared or branched on.
 * The HUD resolves keys to text at the last possible moment and nothing it
 * resolves ever travels back out.
 */

export type HudClockMode = 'paused' | 'running';

/** Matches the simulation protocol's clock speeds (`src/simulation/protocol/types.ts`). */
export const HUD_SPEEDS = [1, 2, 4] as const;
export type HudSpeed = (typeof HUD_SPEEDS)[number];

export function isHudSpeed(value: number): value is HudSpeed {
  return (HUD_SPEEDS as readonly number[]).includes(value);
}

export interface HudClockViewModel {
  /** 1-based in-game day. */
  readonly day: number;
  /** 0..1439. Values outside the range are normalized on the way to the screen. */
  readonly minuteOfDay: number;
  readonly mode: HudClockMode;
  readonly speed: HudSpeed;
}

/**
 * The dense top-strip counts.
 *
 * Deliberately no money, funds, budget or cost of any kind: there is no
 * economy system yet, and a HUD that displays a number no system produces is
 * a lie with a place to sit.
 */
export interface HudCountsViewModel {
  readonly prisoners: number;
  /** Total cell capacity. `0` means "unknown/none", and the occupancy bar is then omitted rather than guessed. */
  readonly prisonerCapacity: number;
  readonly staff: number;
  readonly rooms: number;
  readonly activeIncidents: number;
  readonly contrabandFound: number;
}

export type HudSeverity = 'info' | 'warning' | 'danger';

export interface HudAlertViewModel {
  /** Stable identity for the row, so a list update is not a full rebuild. */
  readonly id: string;
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
  readonly labelParameters?: MessageParameters;
  readonly severity: HudSeverity;
}

export interface HudViewModel {
  readonly counts: HudCountsViewModel;
  readonly clock: HudClockViewModel;
  readonly alerts: readonly HudAlertViewModel[];
}

/**
 * The localization surface the HUD actually uses.
 *
 * A structural port rather than the concrete `Localizer` class: the HUD
 * needs two methods, and depending on only those keeps it drivable from a
 * test stub. `Localizer` (src/services/localization/localizer.ts) satisfies
 * this as written.
 */
export interface HudLocalizer {
  format(key: LocalizationKey, parameters?: MessageParameters): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
}

/** An empty prison, for a first paint before any snapshot has arrived. */
export const EMPTY_HUD_VIEW_MODEL: HudViewModel = {
  counts: {
    prisoners: 0,
    prisonerCapacity: 0,
    staff: 0,
    rooms: 0,
    activeIncidents: 0,
    contrabandFound: 0,
  },
  clock: { day: 1, minuteOfDay: 0, mode: 'paused', speed: 1 },
  alerts: [],
};
