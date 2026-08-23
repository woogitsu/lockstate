import { describe, expect, it } from 'vitest';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import {
  MINUTES_PER_DAY,
  formatClockTime,
  nextFastForwardSpeed,
  normalizeDay,
  occupancyTone,
  projectStatusMetrics,
  severityLabelKey,
  severityTone,
  transportPressedStates,
} from '../../src/ui/hud/projection';
import type { HudCountsViewModel, HudSpeed } from '../../src/ui/hud/view-model';
import { DEFAULT_BAR_SEGMENTS, filledSegments } from '../../src/ui/primitives/segmented-bar';

/**
 * The view-model → display mapping that decides what the HUD says.
 *
 * `status-strip.ts` builds its DOM by walking `projectStatusMetrics` and
 * these formatters and does nothing else, so proving the mapping here proves
 * what reaches the screen -- headlessly, in the default `node` environment,
 * exactly as `ui-save-panel-status.test.ts` does for the save panel.
 */

function counts(overrides: Partial<HudCountsViewModel> = {}): HudCountsViewModel {
  return {
    prisoners: 0,
    prisonerCapacity: 0,
    staff: 0,
    rooms: 0,
    activeIncidents: 0,
    contrabandFound: 0,
    ...overrides,
  };
}

describe('status strip: which metrics exist, in what order', () => {
  it('projects exactly the five declared metrics, in a fixed order', () => {
    // Order is part of the contract: a HUD whose metrics move between builds
    // is one a player has to re-read every time.
    expect(projectStatusMetrics(counts()).map((metric) => metric.id)).toEqual([
      'prisoners',
      'staff',
      'rooms',
      'incidents',
      'contraband',
    ]);
  });

  it('carries message keys, never text', () => {
    // ADR 0011: the view layer holds keys; a translated string never becomes
    // an identifier and never travels back toward the simulation.
    const labels = projectStatusMetrics(counts()).map((metric) => metric.labelKey);
    expect(labels).toEqual([
      HUD_MESSAGE_KEY.prisoners,
      HUD_MESSAGE_KEY.staff,
      HUD_MESSAGE_KEY.rooms,
      HUD_MESSAGE_KEY.incidents,
      HUD_MESSAGE_KEY.contraband,
    ]);
    for (const label of labels) expect(label).toMatch(/^hud\.[a-z.-]+$/);
  });

  it('renders no money, funds, budget or currency metric', () => {
    // There is no economy system yet, and a HUD slot is where a fake number
    // starts. This fails the moment one is added without an economy.
    const serialized = JSON.stringify(projectStatusMetrics(counts({ prisoners: 12 })));
    expect(serialized).not.toMatch(/money|fund|budget|cash|balance|currency|cost/i);
  });

  it('passes the counts through unchanged', () => {
    const metrics = projectStatusMetrics(counts({ prisoners: 142, staff: 27, rooms: 61, contrabandFound: 8 }));
    expect(metrics.map((metric) => metric.value)).toEqual([142, 27, 61, 0, 8]);
  });
});

describe('status strip: tone and badges', () => {
  it('states the incident condition in words, so colour is never the only signal', () => {
    const clear = projectStatusMetrics(counts({ activeIncidents: 0 }))[3];
    expect(clear?.badge).toEqual({ tone: 'success', textKey: HUD_MESSAGE_KEY.incidentsClear });
    expect(clear?.tone).toBeUndefined();

    const active = projectStatusMetrics(counts({ activeIncidents: 3 }))[3];
    expect(active?.badge).toEqual({ tone: 'danger', textKey: HUD_MESSAGE_KEY.incidentsActive });
    expect(active?.tone).toBe('danger');
  });

  it('marks confiscated contraband as a warning only once there is some', () => {
    expect(projectStatusMetrics(counts({ contrabandFound: 0 }))[4]?.tone).toBeUndefined();
    expect(projectStatusMetrics(counts({ contrabandFound: 1 }))[4]?.tone).toBe('warning');
  });

  it('omits the occupancy bar when capacity is unknown rather than guessing one', () => {
    expect(projectStatusMetrics(counts({ prisoners: 10, prisonerCapacity: 0 }))[0]?.capacity).toBeUndefined();
    expect(projectStatusMetrics(counts({ prisoners: 10, prisonerCapacity: 40 }))[0]?.capacity).toBe(40);
  });
});

describe('occupancyTone', () => {
  it.each([
    [0, 100, undefined],
    [89, 100, undefined],
    [90, 100, 'warning'],
    [100, 100, 'warning'],
    [101, 100, 'danger'],
  ])('%i of %i reads as %s', (prisoners, capacity, expected) => {
    expect(occupancyTone(prisoners, capacity)).toBe(expected);
  });

  it('has no opinion without a capacity', () => {
    // A status strip where several things are permanently amber teaches
    // players to ignore amber.
    expect(occupancyTone(50, 0)).toBeUndefined();
    expect(occupancyTone(50, Number.NaN)).toBeUndefined();
  });
});

describe('filledSegments', () => {
  it('lights one segment for any non-zero value, and never rounds it away', () => {
    // 1/180 rounds to zero segments. An empty bar would say "nothing here",
    // which is a different fact from "one".
    expect(filledSegments(1, 180)).toBe(1);
    expect(filledSegments(0, 180)).toBe(0);
  });

  it('fills completely at and above the maximum', () => {
    expect(filledSegments(180, 180)).toBe(DEFAULT_BAR_SEGMENTS);
    expect(filledSegments(500, 180)).toBe(DEFAULT_BAR_SEGMENTS);
  });

  it('scales in between', () => {
    expect(filledSegments(50, 100)).toBe(5);
    expect(filledSegments(51, 100)).toBe(6);
  });

  it('lights nothing for an unbounded or nonsensical maximum', () => {
    expect(filledSegments(5, 0)).toBe(0);
    expect(filledSegments(5, -1)).toBe(0);
    expect(filledSegments(Number.NaN, 100)).toBe(0);
    expect(filledSegments(5, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('respects a custom segment count', () => {
    expect(filledSegments(1, 4, 4)).toBe(1);
    expect(filledSegments(4, 4, 4)).toBe(4);
  });
});

describe('clock readout', () => {
  it.each([
    [0, '00:00'],
    [59, '00:59'],
    [60, '01:00'],
    [7 * 60 + 45, '07:45'],
    [MINUTES_PER_DAY - 1, '23:59'],
  ])('minute %i renders as %s', (minute, expected) => {
    expect(formatClockTime(minute)).toBe(expected);
  });

  it('is fixed-width 24-hour, never the host locale', () => {
    // A simulation clock has no date, no time zone and no AM/PM. Rendering
    // it through Intl would give one player `7:45 AM` and another `07:45`,
    // and docs/TESTING.md forbids depending on the developer's locale.
    for (let minute = 0; minute < MINUTES_PER_DAY; minute += 37) {
      expect(formatClockTime(minute)).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('wraps rather than throwing on an out-of-range minute', () => {
    expect(formatClockTime(MINUTES_PER_DAY)).toBe('00:00');
    expect(formatClockTime(MINUTES_PER_DAY + 90)).toBe('01:30');
    expect(formatClockTime(-1)).toBe('23:59');
  });

  it('degrades visibly rather than printing NaN', () => {
    expect(formatClockTime(Number.NaN)).toBe('--:--');
  });

  it('keeps days 1-based whatever arrives', () => {
    expect(normalizeDay(1)).toBe(1);
    expect(normalizeDay(0)).toBe(1);
    expect(normalizeDay(-4)).toBe(1);
    expect(normalizeDay(12.7)).toBe(12);
    expect(normalizeDay(Number.NaN)).toBe(1);
  });
});

describe('transport controls', () => {
  it('shows exactly one control pressed, so the three read as a state', () => {
    const cases: readonly { mode: 'paused' | 'running'; speed: HudSpeed }[] = [
      { mode: 'paused', speed: 1 },
      { mode: 'paused', speed: 4 },
      { mode: 'running', speed: 1 },
      { mode: 'running', speed: 2 },
      { mode: 'running', speed: 4 },
    ];
    for (const { mode, speed } of cases) {
      const pressed = transportPressedStates({ day: 1, minuteOfDay: 0, mode, speed });
      expect(Object.values(pressed).filter(Boolean)).toHaveLength(1);
    }
  });

  it('pauses regardless of speed, and distinguishes normal speed from fast', () => {
    expect(transportPressedStates({ day: 1, minuteOfDay: 0, mode: 'paused', speed: 4 }).pause).toBe(true);
    expect(transportPressedStates({ day: 1, minuteOfDay: 0, mode: 'running', speed: 1 }).play).toBe(true);
    expect(transportPressedStates({ day: 1, minuteOfDay: 0, mode: 'running', speed: 2 }).fastForward).toBe(true);
  });

  it('cycles fast-forward between the two fast speeds instead of dead-ending', () => {
    // Returning to x1 is what the play button is for, so no tap is ambiguous.
    expect(nextFastForwardSpeed(1)).toBe(2);
    expect(nextFastForwardSpeed(2)).toBe(4);
    expect(nextFastForwardSpeed(4)).toBe(2);
  });
});

describe('severity', () => {
  it('pairs every severity with both a tone and a word', () => {
    for (const severity of ['info', 'warning', 'danger'] as const) {
      expect(severityTone(severity)).toBeTruthy();
      expect(severityLabelKey(severity)).toMatch(/^hud\.severity\./);
    }
  });
});
