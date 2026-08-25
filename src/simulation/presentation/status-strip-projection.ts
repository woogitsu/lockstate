import type { ContentRegistry } from '../../content/registry';
import type { RoomCatalogDefinition } from '../../content/room-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import type { ClockControl } from '../clock/fixed-step-clock';
import {
  DAY_LENGTH_TICKS,
  DEFAULT_REGIME_SCHEDULES,
  resolveActiveRegimeBlock,
  type ActionCategory,
  type RegimeSchedule,
} from '../prisoners/regime';
import { stateIncomeAccruedByTick } from '../economy/income';
import { projectClockPosition } from './clock-projection';
import type { ContrabandSearchSource } from './contraband-projection';
import { projectPrisonerPopulationCounts, type PrisonerProjectionSource } from './prisoner-projection';
import { collectRoomInstances, type RoomProjectionSource } from './room-projection';
import type { StaffRosterSource } from './staff-projection';
import {
  compareStableIds,
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  toBoundedValue,
  type BoundedValue,
  type HudViewModelSchemaVersion,
} from './view-model';

export interface StatusStripIncidentSource {
  openIncidents(): readonly { readonly id: string; readonly severity: number }[];
}

export interface StatusStripSource {
  /** The kernel's current tick. Passed in, not read from a clock -- simulation code owns no ambient time. */
  readonly tick: number;
  /**
   * The clock's current control.
   *
   * Passed in rather than read from a `FixedStepClock` because this layer is
   * pure: a projection takes state and returns a value, and reaching for the
   * live clock that drives the kernel would make it a reader of the
   * scheduler. The worker shell that owns the clock supplies
   * `FixedStepClock.control` here. Absent means "speed unknown", which the
   * view model reports as `speed: 0, paused: false` rather than guessing a
   * speed.
   */
  readonly clockControl?: ClockControl;
  readonly prisoners: PrisonerProjectionSource;
  readonly rooms?: RoomProjectionSource;
  readonly staff?: StaffRosterSource;
  readonly incidents?: StatusStripIncidentSource;
  readonly searchSystem?: ContrabandSearchSource;
  /**
   * The prison's money (#96). Absent reports `0`, which is what a session
   * without an economy had -- not a guess, and not a hidden default: a
   * runtime that has no treasury genuinely has no money.
   */
  readonly treasury?: { readonly balanceMinorUnits: number };
  /** Defaults to the shipped schedules; a session running custom regimes passes its own. */
  readonly regimeSchedules?: readonly RegimeSchedule[];
}

export interface StatusStripOptions {
  readonly rooms?: ContentRegistry<RoomCatalogDefinition>;
}

export interface ClockViewModel {
  readonly tick: number;
  /** 1-based, so the first simulated day is "day 1" rather than "day 0". */
  readonly dayNumber: number;
  readonly tickOfDay: number;
  readonly dayLengthTicks: number;
  /** How far through the current in-game day. */
  readonly dayProgress: BoundedValue;
  readonly paused: boolean;
  /** A `SimulationSpeed` while running; `0` while paused or when no clock control was supplied. */
  readonly speed: number;
  /** `false` when no clock control was supplied -- the HUD should not render a speed selector it cannot trust. */
  readonly speedKnown: boolean;
}

/**
 * The active regime block per classification group: what this simulation
 * actually means by "time of day". There is no hour-of-day or clock face
 * anywhere in the simulation -- `DAY_LENGTH_TICKS` is a tick budget, and
 * `regime.ts` says outright it is a candidate value rather than a balance
 * decision -- so the projection reports the tick position and the regime
 * block instead of inventing a wall clock.
 */
export interface RegimeBlockViewModel {
  readonly classificationGroupId: string;
  readonly allowedCategories: readonly ActionCategory[];
  readonly blockStartTickOfDay: number;
  readonly blockEndTickOfDay: number;
  readonly blockProgress: BoundedValue;
}

export interface StatusStripViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  readonly clock: ClockViewModel;
  readonly regime: readonly RegimeBlockViewModel[];
  readonly counts: {
    /** Live prisoner entities, whatever intake stage they are at. */
    readonly prisoners: number;
    /** Admitted but not yet through intake -- the visible arrivals backlog. */
    readonly prisonersInIntake: number;
    readonly prisonersHighRisk: number;
    /** Hired staff entities. `0` when no roster was supplied. */
    readonly staff: number;
    readonly staffUnassigned: number;
    /** Registered room instances, not zoned tiles. */
    readonly rooms: number;
    readonly roomCapacity: number;
    readonly roomOccupants: number;
    readonly activeIncidents: number;
    /** Cumulative items found by searches this session. Read from the search system's own counter, not from the drainable confiscation ledger. */
    readonly contrabandDiscovered: number;
    /** The treasury balance in minor units (#96). `0` when no treasury was supplied. */
    readonly treasuryMinorUnits: number;
    /**
     * What the in-game day in progress has earned the prison so far, in the
     * same minor units, at `tick` (#29, ADR 0017 decision 3).
     *
     * The rising readout beside the balance: the state pays per prisoner-day at
     * the **end** of each day, and a day is 2,400 ticks -- two minutes of real
     * time at 1x -- which is too long for the only visible sign of an income
     * line to be a number that jumps once and then sits still.
     *
     * **Derived, not accumulated, and derived here rather than on the main
     * thread.** `stateIncomeAccruedByTick` is a pure function of the tick and
     * the occupied-place count, so nothing is stored, nothing can drift out of
     * step with the balance, and at the payment tick it equals exactly what
     * `StateIncomeSystem` credits (pinned by
     * `tests/unit/economy-state-income.test.ts`). The HUD may not compute a
     * simulation figure, so this is the projection's to produce.
     *
     * `0` when no room source was supplied: no registry, no occupied places,
     * nothing earned -- the same reading as the treasury's own absent case
     * rather than a guess.
     */
    readonly stateIncomeAccruedTodayMinorUnits: number;
  };
}

function clockViewModel(tick: number, control: ClockControl | undefined): ClockViewModel {
  const position = projectClockPosition(tick);
  return {
    ...position,
    dayProgress: toBoundedValue(position.tickOfDay, position.dayLengthTicks),
    paused: control?.mode === 'paused',
    speed: control !== undefined && control.mode === 'running' ? control.speed : 0,
    speedKnown: control !== undefined,
  };
}

/**
 * The always-visible header strip.
 *
 * **Cost.** One `Uint8Array` walk of entity indices for the prisoner
 * counts (no per-prisoner allocation), `O(staff)` for the roster,
 * `O(roomInstances)` for the room totals, `O(openIncidents)` for the
 * incident count. Nothing here builds a per-actor object, so it is safe to
 * re-project every frame at the 5,000-actor tier.
 */
export function projectStatusStrip(source: StatusStripSource, options: StatusStripOptions = {}): StatusStripViewModel {
  const rooms = options.rooms ?? defaultRoomContentRegistry;
  const population = projectPrisonerPopulationCounts(source.prisoners);

  const prisonersInIntake = population.byIntakeStage
    .filter((entry) => entry.intakeStage !== 'completed' && entry.intakeStage !== 'failed')
    .reduce((sum, entry) => sum + entry.count, 0);
  const prisonersHighRisk =
    population.byClassificationGroupId.find((entry) => entry.classificationGroupId === 'high-risk')?.count ?? 0;

  let roomCount = 0;
  let roomCapacity = 0;
  let roomOccupants = 0;
  if (source.rooms !== undefined) {
    for (const instance of collectRoomInstances(source.rooms, rooms)) {
      roomCount += 1;
      roomCapacity += instance.capacity;
      roomOccupants += source.rooms.roomInstances.occupancyOf(instance.instanceId);
    }
  }

  let staff = 0;
  let staffUnassigned = 0;
  if (source.staff !== undefined) {
    for (const entityId of source.staff.allGuardIds()) {
      staff += 1;
      if (source.staff.getDeploymentPhase(entityId) === 'unassigned') staffUnassigned += 1;
    }
  }

  const schedules = source.regimeSchedules ?? DEFAULT_REGIME_SCHEDULES;

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    clock: clockViewModel(source.tick, source.clockControl),
    regime: [...schedules]
      .sort((left, right) => compareStableIds(left.classificationGroupId, right.classificationGroupId))
      .map((schedule): RegimeBlockViewModel => {
        const block = resolveActiveRegimeBlock(schedule, source.tick);
        const tickOfDay = ((source.tick % DAY_LENGTH_TICKS) + DAY_LENGTH_TICKS) % DAY_LENGTH_TICKS;
        const span = Math.max(1, block.endTickOfDay - block.startTickOfDay);
        return {
          classificationGroupId: schedule.classificationGroupId,
          allowedCategories: [...block.allowedCategories],
          blockStartTickOfDay: block.startTickOfDay,
          blockEndTickOfDay: block.endTickOfDay,
          blockProgress: toBoundedValue(tickOfDay - block.startTickOfDay, span),
        };
      }),
    counts: {
      prisoners: population.total,
      prisonersInIntake,
      prisonersHighRisk,
      staff,
      staffUnassigned,
      rooms: roomCount,
      roomCapacity,
      roomOccupants,
      activeIncidents: source.incidents?.openIncidents().length ?? 0,
      contrabandDiscovered: source.searchSystem?.getMetrics().itemsDiscovered ?? 0,
      treasuryMinorUnits: source.treasury?.balanceMinorUnits ?? 0,
      // The registry's own total, not `roomOccupants` above: that count is
      // built from the catalog fan-out and cannot see an instance registered
      // under an unknown room-catalog id (gap 15), while the income line is
      // paid on every slot the registry holds. `RoomInstanceRegistry.totalOccupancy`
      // documents the difference.
      stateIncomeAccruedTodayMinorUnits:
        source.rooms === undefined ? 0 : stateIncomeAccruedByTick(source.rooms.roomInstances.totalOccupancy, source.tick),
    },
  };
}
