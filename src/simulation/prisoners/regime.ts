import type { EntityId } from '../entity/entity-store';

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

/**
 * Throws unless the schedule's blocks tile `[0, DAY_LENGTH_TICKS)` exactly
 * once -- no gap, no overlap, no short or over-long day. Sorting first means
 * declaration order does not matter; requiring each block to start exactly
 * where the previous one ended is what rules out both a gap and an overlap in
 * one comparison.
 *
 * Exported because the two schedules below are not the only ones that reach
 * `resolveActiveRegimeBlock`. `buildRiotRegimeSchedule` constructs one at
 * runtime, and both `PrisonerOperationsRuntime`'s constructor options and
 * `projectStatusStrip`'s source accept a caller-supplied `regimeSchedules`
 * array -- none of which the module-load check below can see. The exported sibling
 * `assertGaplessDeploymentSchedule` has the same shape for the same reason.
 */
export function assertGaplessSchedule(schedule: RegimeSchedule): void {
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
 * enforces this at module load for *these two*, since an undefined
 * tick-of-day would leave `resolveActiveRegimeBlock` with no legal action
 * category at all. A schedule built anywhere else has to be checked by
 * whoever builds it; the check is exported for that.
 *
 * ## Gapless is not the same as non-empty, and four blocks used to be empty
 *
 * `assertGaplessSchedule` answers "does every tick fall in a block". The
 * question it cannot answer is "does every block leave a housed prisoner
 * something they can actually start", and until
 * [ADR 0054](../../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
 * four of these thirteen blocks did not. `beginNextAction` filters
 * `DEFAULT_ACTIONS` by the block's categories and walks the survivors until
 * one resolves a target; every action but `action.sleep`,
 * `action.eat-in-cell`, `action.use-toilet` and `action.free-association`
 * names a *zoned room*, so a block listing only room-gated categories is a
 * block the prisoner stands through in any prison that has not built the
 * room. Measured on the real kernel, one prisoner, ten in-game days, a prison
 * of cells and nothing else: **1,450 of 2,400 ticks a day idle, and 554 of
 * 1,200 reconsideration cycles finding nothing at all** -- the two
 * `work`/`education` blocks and the `recreation`-only block between them.
 *
 * **`'free-association'` is added to those three, and to `HIGH_RISK_REGIME`'s
 * supervised-yard block, as the terminal that makes the day finite.**
 * `action.free-association` targets `own-accommodation` and declares no need
 * effect, so `scoreAction` gives it exactly 0 -- the floor, since no authored
 * effect is negative -- and it can never displace a candidate addressing a
 * need that is even slightly unmet. Adding it to a block therefore changes
 * nothing at all in a prison that has the rooms, and in a prison that has not
 * it is the difference between a prisoner milling about on the wing and a
 * prisoner standing motionless. It is the same answer ADR 0042 decision 1
 * gave the riot regime, applied to the schedule a player actually watches.
 *
 * **It deliberately does not serve the need.** `hygiene` and `recreation`
 * stay reachable only through a zoned room, so the prison's neglect still
 * shows up in `needsPressure` and still ends in a riot (ADR 0048); what
 * changes is that the neglected prisoner has somewhere to put the time.
 * ADR 0041's amendment already drew that distinction for the candidate walk:
 * "Only B fixes the hygiene *need*; the fallback already fixes the wasted
 * cycle."
 *
 * `tests/unit/prisoners-action-catalog.test.ts` is the gate that fails if a
 * block is ever authored without such a terminal again; this paragraph is
 * only the reason.
 */
export const GENERAL_POPULATION_REGIME: RegimeSchedule = {
  classificationGroupId: 'general-population',
  blocks: [
    { startTickOfDay: 0, endTickOfDay: 400, allowedCategories: ['sleep'] },
    { startTickOfDay: 400, endTickOfDay: 500, allowedCategories: ['meal', 'hygiene'] },
    { startTickOfDay: 500, endTickOfDay: 1_000, allowedCategories: ['work', 'education', 'free-association'] },
    { startTickOfDay: 1_000, endTickOfDay: 1_200, allowedCategories: ['recreation', 'free-association'] },
    { startTickOfDay: 1_200, endTickOfDay: 1_300, allowedCategories: ['meal'] },
    { startTickOfDay: 1_300, endTickOfDay: 1_800, allowedCategories: ['work', 'education', 'free-association'] },
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
    // Brief supervised yard, and the wing when there is no yard to supervise.
    { startTickOfDay: 2_000, endTickOfDay: 2_200, allowedCategories: ['recreation', 'free-association'] },
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

/**
 * The schedule some *event* imposes on one prisoner in place of their
 * classification group's timetable, or `undefined` where the timetable stands
 * ([ADR 0057](../../../docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md)).
 *
 * Declared here rather than in either module that uses it, because both sides
 * already import this one and neither should have to import the other:
 * `ActionSystem` asks the question on the action-selection path and knows
 * nothing about incidents, and `incidents/riot-regime.ts` answers it and knows
 * nothing about action selection. It is the same injected-port shape
 * `SectorOccupantResolver`, `SectorRiskSampler` and `DisciplinaryEvidenceSource`
 * use for the same reason.
 *
 * **It returns a whole `RegimeSchedule`, not a category filter**, and that is
 * the decision rather than a convenience. Intersecting an override's categories
 * with the block the clock is running can produce the empty set — a `sleep`
 * block against a riot's `['free-association', 'recreation']` produces nothing
 * at all — and `beginNextAction` with no legal candidate counts an unmet demand
 * cycle every reconsideration, which is exactly the hole ADR 0042 decision 1
 * closed. An override replaces the day; it does not narrow it.
 *
 * An implementation must be a pure function of state the save already carries,
 * must draw nothing, and must not read the clock: it is consulted per idle
 * prisoner per reconsideration cycle, and a resolver that varied with anything
 * else would put a second, unsaved clock inside action selection.
 */
export type PrisonerRegimeOverrideResolver = (entityId: EntityId, classificationGroupId: string) => RegimeSchedule | undefined;

export function findRegimeSchedule(schedules: readonly RegimeSchedule[], classificationGroupId: string): RegimeSchedule {
  const schedule = schedules.find((candidate) => candidate.classificationGroupId === classificationGroupId);
  if (schedule === undefined) {
    throw new RangeError(`Unknown classification group "${classificationGroupId}".`);
  }
  return schedule;
}
