export const ACTION_CATEGORIES = ['sleep', 'meal', 'work', 'recreation', 'education', 'hygiene', 'free-association'] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

/**
 * In-game day length in kernel ticks (20 Hz, `docs/DETERMINISM.md`) --
 * deliberately much shorter than a literal 24h/86,400-tick real-time day
 * so a full regime cycle is fast to simulate and test. A candidate value,
 * not a locked balance decision (`docs/ISSUE_BACKLOG.md` governance).
 */
export const DAY_LENGTH_TICKS = 2_400;

export interface RegimeBlock {
  readonly startTickOfDay: number;
  /** Exclusive. */
  readonly endTickOfDay: number;
  readonly allowedCategories: readonly ActionCategory[];
}

export interface RegimeSchedule {
  readonly classificationGroupId: string;
  readonly blocks: readonly RegimeBlock[];
}

function assertGaplessSchedule(schedule: RegimeSchedule): void {
  const sorted = [...schedule.blocks].sort((a, b) => a.startTickOfDay - b.startTickOfDay);
  let cursor = 0;
  for (const block of sorted) {
    if (block.startTickOfDay !== cursor) {
      throw new RangeError(`Regime schedule "${schedule.classificationGroupId}" has a gap/overlap at tick ${cursor}.`);
    }
    cursor = block.endTickOfDay;
  }
  if (cursor !== DAY_LENGTH_TICKS) {
    throw new RangeError(`Regime schedule "${schedule.classificationGroupId}" does not cover the full day (ends at ${cursor}, expected ${DAY_LENGTH_TICKS}).`);
  }
}

/**
 * Two representative classification groups (issue #24's "regime schedule
 * blocks by prisoner/security group"): general population gets a full
 * daily rhythm; high-risk/solitary is confined almost all day. Every tick
 * of the day maps to exactly one block for both -- `assertGaplessSchedule`
 * enforces this at module load, since an undefined tick-of-day would leave
 * `resolveActiveRegimeBlock` with no legal action category at all.
 */
export const GENERAL_POPULATION_REGIME: RegimeSchedule = {
  classificationGroupId: 'general-population',
  blocks: [
    { startTickOfDay: 0, endTickOfDay: 400, allowedCategories: ['sleep'] },
    { startTickOfDay: 400, endTickOfDay: 500, allowedCategories: ['meal', 'hygiene'] },
    { startTickOfDay: 500, endTickOfDay: 1_000, allowedCategories: ['work', 'education'] },
    { startTickOfDay: 1_000, endTickOfDay: 1_200, allowedCategories: ['recreation'] },
    { startTickOfDay: 1_200, endTickOfDay: 1_300, allowedCategories: ['meal'] },
    { startTickOfDay: 1_300, endTickOfDay: 1_800, allowedCategories: ['work', 'education'] },
    { startTickOfDay: 1_800, endTickOfDay: 2_000, allowedCategories: ['recreation', 'hygiene', 'free-association'] },
    { startTickOfDay: 2_000, endTickOfDay: 2_100, allowedCategories: ['meal'] },
    { startTickOfDay: 2_100, endTickOfDay: 2_300, allowedCategories: ['recreation', 'free-association', 'hygiene'] },
    { startTickOfDay: 2_300, endTickOfDay: 2_400, allowedCategories: ['sleep'] },
  ],
};

export const HIGH_RISK_REGIME: RegimeSchedule = {
  classificationGroupId: 'high-risk',
  blocks: [
    { startTickOfDay: 0, endTickOfDay: 2_000, allowedCategories: ['sleep', 'meal', 'hygiene'] },
    { startTickOfDay: 2_000, endTickOfDay: 2_200, allowedCategories: ['recreation'] }, // brief supervised yard
    { startTickOfDay: 2_200, endTickOfDay: 2_400, allowedCategories: ['sleep', 'meal', 'hygiene'] },
  ],
};

export const DEFAULT_REGIME_SCHEDULES: readonly RegimeSchedule[] = [GENERAL_POPULATION_REGIME, HIGH_RISK_REGIME];
for (const schedule of DEFAULT_REGIME_SCHEDULES) assertGaplessSchedule(schedule);

export function resolveActiveRegimeBlock(schedule: RegimeSchedule, tick: number): RegimeBlock {
  const tickOfDay = ((tick % DAY_LENGTH_TICKS) + DAY_LENGTH_TICKS) % DAY_LENGTH_TICKS;
  const block = schedule.blocks.find((candidate) => tickOfDay >= candidate.startTickOfDay && tickOfDay < candidate.endTickOfDay);
  if (block === undefined) {
    throw new Error(`Invariant violated: regime schedule "${schedule.classificationGroupId}" has no block covering tick-of-day ${tickOfDay}.`);
  }
  return block;
}

export function findRegimeSchedule(schedules: readonly RegimeSchedule[], classificationGroupId: string): RegimeSchedule {
  const schedule = schedules.find((candidate) => candidate.classificationGroupId === classificationGroupId);
  if (schedule === undefined) {
    throw new RangeError(`Unknown classification group "${classificationGroupId}".`);
  }
  return schedule;
}
