import type { ContentRegistry } from '../../content/registry';
import type { RoomCatalogDefinition } from '../../content/room-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import type { ClockControl } from '../clock/fixed-step-clock';
import type { EntityId } from '../entity/entity-store';
import type { IncidentType } from '../incidents/incident';
import {
  DEFAULT_ACCOMMODATION_POLICY,
  resolveAccommodationTargets,
  type AccommodationPolicy,
} from '../prisoners/intake-system';
import {
  DAY_LENGTH_TICKS,
  DEFAULT_REGIME_SCHEDULES,
  resolveActiveRegimeBlock,
  type ActionCategory,
  type RegimeSchedule,
} from '../prisoners/regime';
import { stateIncomeAccruedByTick, stateIncomeForOccupiedPlaces } from '../economy/income';
import { EMPTY_SAFETY_COVERAGE_CENSUS, type SafetyCoverageCensus } from '../prisoners/safety-coverage-system';
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
  openIncidents(): readonly { readonly id: string; readonly type: IncidentType; readonly severity: number }[];
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
  /**
   * What the prison pays its staff, and what it has failed to pay them
   * ([ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
   * step 3).
   *
   * Two figures rather than one because they answer two different questions and
   * only one of them is a warning. The bill is a fact about the roster that is
   * true every day and is the number a player weighs a hire against; the
   * arrears are the state the prison is in when the bill went unmet.
   *
   * Absent reports `0` for both, exactly as `treasury` does and for the same
   * reason: a runtime with no payroll genuinely owes nobody.
   */
  readonly payroll?: {
    dailyWageBillMinorUnits(): number;
    readonly unpaidWagesMinorUnits: number;
  };
  /**
   * Where the population is standing on the guard coverage ladder (issue
   * #588) -- `SafetyCoverageSystem.getCensus`, which produces it on the same
   * walk that provisions the `safety` need.
   *
   * Optional, and absent reports three zeroes, which is what a session with
   * no security tier genuinely has: nobody is covered, and nobody is
   * *un*covered either, because there is no sector to be in. It is not a
   * guess and it is not "unknown" -- an absent source has no prisoners in a
   * sector to report on.
   *
   * The census rather than the coverage report, and the difference is the
   * whole point of the field: `DeploymentSystem.getCoverageReport` counts
   * *guards* against a schedule, and what the strip has to attribute a
   * withheld 40 to is *prisoners*. Deriving one from the other here would
   * mean this projection resolving sector containment, which
   * `src/simulation/security/sector-occupancy.ts` owns.
   */
  readonly coverage?: { getCensus(): SafetyCoverageCensus };
  /** Defaults to the shipped schedules; a session running custom regimes passes its own. */
  readonly regimeSchedules?: readonly RegimeSchedule[];
  /**
   * The accommodation policy this session's `IntakeSystem` is running, which
   * is what `accommodationCapacity` below is scoped by.
   *
   * Optional and defaulted exactly the way `regimeSchedules` above is, and for
   * the same reason: the shipped policy is what every session in `src/` runs,
   * and a session running a custom one passes it so the readout and the
   * housing rule cannot disagree about what a bed is for.
   * `src/simulation/worker/status-counts.ts` passes
   * `PrisonerOperationsRuntime.accommodationPolicy`, which *is* the object
   * `IntakeSystem` holds rather than a second copy of the default.
   */
  readonly accommodationPolicy?: AccommodationPolicy;
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
    /**
     * How many prisoners this prison has somewhere to **live**: the summed
     * `residentCapacity` of the room instances `IntakeSystem` would house an
     * arrival in.
     *
     * The denominator the status strip's Prisoners chip divides by, and the
     * one number behind its over-capacity warning
     * (`occupancyTone`, `src/ui/hud/projection.ts`). Overcrowding is what
     * `IncidentTriggerSystem` now riots over (ADR 0048 decision 2), so this is
     * the difference between a riot arriving as a surprise and a player
     * watching it come.
     *
     * **Not `roomCapacity` above, and the difference is medical beds.**
     * `roomCapacity` sums every registered instance's `residentCapacity`, and
     * `deriveRoomCapacity` credits that for any object declaring
     * `'sleep-surface'` -- which `object.medical-bed` does as well as
     * `object.bed`. A furnished infirmary therefore "derives a residency it has
     * no intake route to use"
     * (`src/simulation/construction/definition.ts`, the `medical-bed-wooden`
     * row), because `IntakeSystem` asks the registry only for the room types
     * its `AccommodationPolicy` names. Publishing `roomCapacity` as the
     * prisoner denominator would overstate it by every medical bed the player
     * has built.
     *
     * A canteen, a yard and a shower room contribute **zero** to both numbers,
     * which is worth stating because the comment this field replaces in
     * `src/ui/simulation-counts.ts` said otherwise: a bench, a dining table
     * and a shower head declare no `'sleep-surface'`, so they raise
     * `concurrentUseCapacity` and nothing else.
     *
     * Scoped from the policy rather than from a room id written here
     * (`AGENTS.md` boundary 6) -- see `resolveAccommodationTargets`.
     */
    readonly accommodationCapacity: number;
    readonly roomOccupants: number;
    /**
     * How many residency places a prisoner is holding that **currently
     * exist** -- the count `StateIncomeSystem` pays for, and the sibling of
     * `roomOccupants` above rather than a correction to it. See
     * `statusCountsSchema` in `src/simulation/protocol/types.ts` for the full
     * argument for publishing both.
     */
    readonly occupiedPlaces: number;
    /**
     * Where the population is standing on the guard coverage ladder (issue
     * #588) -- see `statusCountsSchema` in `src/simulation/protocol/types.ts`
     * for the full argument for three counts rather than a ratio.
     *
     * They sum to the prisoners standing in a sector, not to `prisoners`
     * above, and the difference is a real one: a prisoner still in transit is
     * in neither. Nothing downstream should derive one of these by
     * subtraction.
     */
    readonly prisonersCovered: number;
    readonly prisonersUnderstaffed: number;
    readonly prisonersUnguarded: number;
    readonly activeIncidents: number;
    /**
     * The kind of the incident driving `activeIncidents` above, when the
     * strip can name one -- issue #506 finding 2.
     *
     * **Why a bare count could never say this.** `activeIncidents` is
     * `openIncidents().length`, and `IncidentTriggerSystem.tryOpen*` admits at
     * most one open incident per sector (`trigger-system.ts`, "One open
     * incident per sector at a time"). ADR 0061 decision 6 states the
     * consequence for the shipped topology outright: with the single derived
     * security sector `deriveDefaultSecuritySector` authors, the whole prison
     * can only ever have 0 or 1 incidents open, so a player watching the tile
     * go `0 -> 1 -> 0` had no way to tell an assault from a riot from an
     * escape attempt -- the count was the only signal and a count cannot
     * carry a kind.
     *
     * **What this field adds, and what it deliberately still cannot say.**
     * When every currently open incident shares one `IncidentType`, that type
     * is reported here -- true today for any session running the shipped
     * one-sector topology, and for a multi-sector one wherever its sectors
     * happen to agree. When two open incidents name *different* types --
     * unreachable with one sector, reachable with several -- this is
     * `undefined` rather than an arbitrary pick of one of them, because
     * naming one would claim a single kind for a tile that is not
     * describing one. The strip's badge falls back to its existing generic
     * "Active" wording in that case (`src/ui/hud/projection.ts`), which is a
     * sentence this codebase already ships and not new copy.
     *
     * **Not new copy at all, in the case this issue actually measured.**
     * `assault` / `escape-attempt` / `riot` / `gang-retaliation` already have
     * authored labels in `src/content/simulation-message-keys.ts`'s
     * `incident-type` namespace and are used nowhere on screen; this
     * publishes the stable id so the HUD-side translator
     * (`src/ui/simulation-counts.ts`, which the HUD may not reach past --
     * `AGENTS.md` boundary 1) can turn it into one of those existing keys.
     * The type crosses as a stable id and never as text, exactly as every
     * other enum ADR 0011 governs.
     *
     * **Absent, not present-and-`undefined`, when there is no kind to name**
     * -- the same convention `outcome`/`instigatorId` on `IncidentRecord`
     * itself already follow, and required here rather than merely stylistic:
     * this view model is also published, whole, over the *pulled*
     * `hud/status-strip` projection route (`projection-catalog.ts`), where it
     * is validated by the generic `jsonValueSchema` rather than by
     * `statusCountsSchema`'s per-field union -- and `isJsonValue`
     * (`src/shared/json.ts`) accepts `null` and omission but not an explicit
     * `undefined` *value*, so a required key holding `undefined` would make
     * every quiet tick's pull reply fail to decode. An optional key that is
     * only ever set, never assigned `undefined`, is what keeps both channels
     * honest about the same fact.
     */
    readonly activeIncidentType?: IncidentType;
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
    /**
     * What one in-game day of the current roster costs, in the same minor
     * units (ADR 0042 step 3).
     *
     * The counterweight to `stateIncomeAccruedTodayMinorUnits` beside it, and
     * the first standing *cost* the interface can show at all: until payroll
     * existed every debit in the prison was a purchase the player chose, so
     * there was no rate to display and `src/ui/hud/messages.ts` says so in its
     * own words.
     *
     * It is the **preventable** half of insolvency. A player deciding whether
     * to hire can read what the prison already pays per day against what it
     * earns; a player who has already over-hired reads it as the reason the
     * balance is falling. `DEFAULT_SECTOR_PRISONERS_PER_GUARD` means a prison
     * that hires to its requirement and no further will see this stay small
     * against the income; a prison that hires ahead of its population sees it
     * eat the opening balance with nothing coming in.
     *
     * A read over the roster and the staff-role catalogue, computed by the
     * simulation rather than the HUD for the reason
     * `stateIncomeAccruedTodayMinorUnits` gives: which end of the authored wage
     * band is money is a simulation fact, and a HUD that decided it again would
     * be a second definition of the charge.
     */
    readonly dailyWageBillMinorUnits: number;
    /**
     * Wages billed and not paid, in the same minor units (ADR 0042 step 3,
     * ADR 0017 decision 8).
     *
     * **`0` in a solvent prison, and the only number in this payload that says
     * the prison owes somebody something.** ADR 0017 decision 8 makes
     * insolvency *"a state, not a loss condition"*, and a state nothing renders
     * is the invisible stall that same decision warns its degradation ladder
     * must not become -- so this is what a panel needs to say it out loud.
     *
     * `countSchema`'s floor of `0` is `PayrollSystem`'s own invariant rather
     * than an assumption made here: the treasury pays what it holds and carries
     * the remainder, so the figure is a debt and a debt is never negative. The
     * balance beside it stays non-negative for the same reason, which is the
     * whole of why there are two fields here instead of one signed one.
     */
    readonly unpaidWagesMinorUnits: number;
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
 * The summed `residentCapacity` of every room instance an arrival could be
 * housed in.
 *
 * **`allByRoomCatalogId` per target, not the catalogue fan-out
 * `collectRoomInstances` walks**, and the reason is the one already written
 * beside `stateIncomeAccruedTodayMinorUnits` below: the fan-out cannot see an
 * instance registered under a room-catalog id the *content registry* does not
 * define (gap 15), while `IntakeSystem` reaches the registry directly and would
 * house somebody there regardless. This asks the registry the same question
 * `findAvailableResidence` asks, so the denominator cannot be smaller than the
 * set of beds intake will actually fill.
 *
 * **The capability is checked, not assumed.** For the shipped policy it is
 * redundant -- `residentCapacity` is nonzero only when a `'sleep-surface'`
 * object stands in the room, so the two conditions coincide -- but a policy
 * naming any other capability would make them come apart, and the gate
 * `findAvailableResidence` applies is the capability one.
 *
 * **Instances are counted once.** Two targets may name one room type, and a
 * room with four beds is four places however many ways a prisoner could be
 * sent to it.
 *
 * Deterministic: `allByRoomCatalogId` returns its cached ascending-instance-id
 * sort, the target list is authored, and the `Set` is membership-tested rather
 * than iterated. `O(accommodation instances)`, which is a subset of the
 * `O(roomInstances)` walk this function already pays for.
 */
function accommodationCapacityOf(source: RoomProjectionSource, policy: AccommodationPolicy): number {
  let capacity = 0;
  const counted = new Set<string>();

  for (const target of resolveAccommodationTargets(policy)) {
    for (const instance of source.roomInstances.allByRoomCatalogId(target.roomCatalogId)) {
      if (counted.has(instance.instanceId)) continue;
      if (
        target.requiredObjectCapability !== undefined &&
        !instance.objectCapabilities.includes(target.requiredObjectCapability)
      ) {
        continue;
      }
      counted.add(instance.instanceId);
      capacity += instance.residentCapacity;
    }
  }

  return capacity;
}

/**
 * The always-visible header strip.
 *
 * **Cost.** One `Uint8Array` walk of entity indices for the prisoner
 * counts (no per-prisoner allocation), `O(staff)` for the roster,
 * `O(roomInstances)` for the room totals, a second `O(accommodation
 * instances)` pass for `accommodationCapacity`, `O(openIncidents)` for the
 * incident count, and -- since
 * [ADR 0064](../../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md)
 * -- `O(P log P)` in *housed* prisoners for
 * `stateIncomeAccruedTodayMinorUnits`, which walks the occupied places and
 * reads six need levels for each.
 *
 * **That last one is the exception to the sentence this note used to end
 * with**, and it is marked rather than quietly dropped. It read: "Nothing here
 * builds a per-actor object, so it is safe to re-project every frame at the
 * 5,000-actor tier." No per-actor *object* is built and that half stands, but
 * the accessor the accrual walks allocates and sorts one array of entity ids
 * per call, which does scale with the population. It is a 200-element sort
 * at the reference tier and a 5,000-element one at the top tier; the
 * alternative -- deriving the chip from `totalOccupancy` and the flat rate --
 * is not available any more, because the rate is no longer flat and a chip
 * derived that way would promise money the day boundary declines to pay.
 *
 * **That accessor is `residentIdsWithExistingPlace` and this paragraph named
 * `residentIds` until now**, which was true when it was written and stopped
 * being true when issue #585 split the two (`income.ts:405-411`). The cost
 * class is identical -- `O(P log P)` in housed prisoners, one array -- so
 * nothing this note claims about performance moves; what was wrong was the
 * name, and a reader chasing it would have landed on an accessor the income
 * line no longer reads.
 */
/**
 * The empty places list a session with no rooms reports, allocated once.
 *
 * A module constant rather than a `[]` in the expression, because the branch
 * it serves runs on every projection of every roomless session and the two
 * readings it feeds -- a `length` and a fold -- both treat it as read-only.
 */
const EMPTY_OCCUPIED_PLACES: readonly EntityId[] = [];

export function projectStatusStrip(source: StatusStripSource, options: StatusStripOptions = {}): StatusStripViewModel {
  const rooms = options.rooms ?? defaultRoomContentRegistry;
  const population = projectPrisonerPopulationCounts(source.prisoners);

  const prisonersInIntake = population.byIntakeStage
    .filter((entry) => entry.intakeStage !== 'completed' && entry.intakeStage !== 'failed')
    .reduce((sum, entry) => sum + entry.count, 0);
  const prisonersHighRisk =
    population.byClassificationGroupId.find((entry) => entry.classificationGroupId === 'high-risk')?.count ?? 0;

  const accommodationCapacity =
    source.rooms === undefined
      ? 0
      : accommodationCapacityOf(source.rooms, source.accommodationPolicy ?? DEFAULT_ACCOMMODATION_POLICY);

  let roomCount = 0;
  let roomCapacity = 0;
  let roomOccupants = 0;
  if (source.rooms !== undefined) {
    for (const instance of collectRoomInstances(source.rooms, rooms)) {
      roomCount += 1;
      // The resident capacity, because this counter sits beside the prisoner
      // population: the strip's `Rooms` block reads "N rooms, M of C occupied",
      // and C has to be the number M can grow to. Before ADR 0028 phase 1 this
      // could only ever be zero in a real session, because `zone` registered
      // every room with `capacity: 0`; a cell with a bed in it now makes it
      // move for the first time.
      roomCapacity += instance.residentCapacity;
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

  // One walk, read here and folded into the accrual chip below through
  // `stateIncomeForOccupiedPlaces`. Going through `stateIncomeForCompletedDay`
  // for the money and asking the registry again for the count would be two
  // arrays and two `O(P log P)` sorts per projection, which the **Cost** note
  // above names as the one allocation here that scales with the population.
  //
  // Guarded on `source.rooms` and not on `source.prisoners.roomInstances`,
  // matching the accrual chip: `source.rooms === undefined` is the *session's*
  // statement that it has no rooms, and a session that says so reports 0 for
  // the same reason the absent treasury does. The two are the same registry in
  // every real runtime (`src/simulation/worker/status-counts.ts` hands
  // `runtime.prisoners` to both), so this cannot report places for a session
  // that reports no rooms.
  const occupiedPlaceIds =
    source.rooms === undefined ? EMPTY_OCCUPIED_PLACES : source.prisoners.roomInstances.residentIdsWithExistingPlace();

  const schedules = source.regimeSchedules ?? DEFAULT_REGIME_SCHEDULES;

  // One call, reused for both the count and the kind below -- `openIncidents`
  // allocates a sorted array and a fresh record per open incident
  // (`IncidentLog.openIncidents`'s own comment), so a second call would pay
  // that cost twice for the same tick's answer.
  const coverageCensus = source.coverage?.getCensus() ?? EMPTY_SAFETY_COVERAGE_CENSUS;

  const openIncidents = source.incidents?.openIncidents() ?? [];
  const distinctOpenIncidentTypes = new Set(openIncidents.map((incident) => incident.type));
  // Exactly one shared kind names it; zero or several leave it `undefined` --
  // see the field's own doc comment for why "several" is not an arbitrary pick.
  const activeIncidentType = distinctOpenIncidentTypes.size === 1 ? openIncidents[0]!.type : undefined;

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
      accommodationCapacity,
      roomOccupants,
      occupiedPlaces: occupiedPlaceIds.length,
      prisonersCovered: coverageCensus.covered,
      prisonersUnderstaffed: coverageCensus.understaffed,
      prisonersUnguarded: coverageCensus.unguarded,
      activeIncidents: openIncidents.length,
      ...(activeIncidentType !== undefined ? { activeIncidentType } : {}),
      contrabandDiscovered: source.searchSystem?.getMetrics().itemsDiscovered ?? 0,
      treasuryMinorUnits: source.treasury?.balanceMinorUnits ?? 0,
      // The registry's own total, not `roomOccupants` above: that count is
      // built from the catalog fan-out and cannot see an instance registered
      // under an unknown room-catalog id (gap 15), while the income line is
      // paid on every slot the registry holds. `RoomInstanceRegistry.totalOccupancy`
      // documents the difference.
      // Since ADR 0064 the accrual is not `rate x totalOccupancy`: each occupied
      // place pays at a rate set by how many of its occupant's needs the
      // prison is leaving unmet, so the readout has to be derived from the
      // same walk `StateIncomeSystem` credits from. Deriving it from the count
      // instead would be a chip that promises money the day boundary then does
      // not pay.
      //
      // `source.prisoners` is the grant source: it carries `needs`,
      // `entityStore` and `roomInstances`, which is the whole of
      // `PrisonerDayGrantSource`. The `source.rooms === undefined` guard is
      // kept because it is the *session's* statement that it has no rooms, and
      // it reports 0 for the same reason the treasury's absent case does.
      stateIncomeAccruedTodayMinorUnits: stateIncomeAccruedByTick(
        stateIncomeForOccupiedPlaces(source.prisoners, occupiedPlaceIds),
        source.tick,
      ),
      dailyWageBillMinorUnits: source.payroll?.dailyWageBillMinorUnits() ?? 0,
      unpaidWagesMinorUnits: source.payroll?.unpaidWagesMinorUnits ?? 0,
    },
  };
}
