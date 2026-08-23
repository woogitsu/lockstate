import { DAY_LENGTH_TICKS } from '../prisoners/regime';

/**
 * Required guard headcount for one sector, varying by time of day/regime --
 * issue #26's "guard deployment counts/assignments by sector/time/regime."
 * Reuses `DAY_LENGTH_TICKS` (the same in-game day length #24's
 * `RegimeSchedule` uses) so a security deployment schedule and a prisoner
 * regime schedule stay on one consistent clock, without coupling to #24's
 * prisoner-specific `ActionCategory`/`classificationGroupId` typing --
 * deployment requirements are a staffing concern, not a prisoner-schedule
 * concern, so this is a deliberately separate, smaller schema.
 */
export interface DeploymentBlock {
  readonly startTickOfDay: number;
  /** Exclusive. */
  readonly endTickOfDay: number;
  readonly requiredGuardCount: number;
}

export interface DeploymentSchedule {
  readonly sectorId: string;
  readonly blocks: readonly DeploymentBlock[];
}

export function assertGaplessDeploymentSchedule(schedule: DeploymentSchedule): void {
  const sorted = [...schedule.blocks].sort((a, b) => a.startTickOfDay - b.startTickOfDay);
  let cursor = 0;
  for (const block of sorted) {
    if (block.startTickOfDay !== cursor) {
      throw new RangeError(`Deployment schedule for sector "${schedule.sectorId}" has a gap/overlap at tick ${cursor}.`);
    }
    cursor = block.endTickOfDay;
  }
  if (cursor !== DAY_LENGTH_TICKS) {
    throw new RangeError(`Deployment schedule for sector "${schedule.sectorId}" does not cover the full day (ends at ${cursor}, expected ${DAY_LENGTH_TICKS}).`);
  }
}

export function resolveRequiredGuardCount(schedule: DeploymentSchedule, tick: number): number {
  const tickOfDay = ((tick % DAY_LENGTH_TICKS) + DAY_LENGTH_TICKS) % DAY_LENGTH_TICKS;
  const block = schedule.blocks.find((candidate) => tickOfDay >= candidate.startTickOfDay && tickOfDay < candidate.endTickOfDay);
  if (block === undefined) {
    throw new Error(`Invariant violated: deployment schedule for sector "${schedule.sectorId}" has no block covering tick-of-day ${tickOfDay}.`);
  }
  return block.requiredGuardCount;
}

/** A sector with no explicit schedule keeps a constant requirement across the whole day -- the common case for a small/representative sector set. */
export function constantDeploymentSchedule(sectorId: string, requiredGuardCount: number): DeploymentSchedule {
  return { sectorId, blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH_TICKS, requiredGuardCount }] };
}
