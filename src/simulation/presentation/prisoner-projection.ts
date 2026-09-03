import type { ContentRegistry } from '../../content/registry';
import type { RoomCatalogDefinition } from '../../content/room-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import { isNeedUnmetForStateIncome } from '../economy/income';
import type { EntityId } from '../entity/entity-store';
import type { ActorIdentitySource } from '../identity/actor-identity';
import { DEFAULT_ACTIONS } from '../prisoners/actions';
import {
  ACTION_PHASES,
  CLASSIFICATION_GROUP_IDS,
  classificationGroupIdFromIndex,
  type ActionPhase,
  type CurrentActionComponent,
  type IntakeStage,
  intakeStageFromIndex,
  type PositionComponent,
  type PrisonerColdState,
  type PrisonerRecordComponent,
} from '../prisoners/components';
import {
  accommodationTargetKey,
  DEFAULT_ACCOMMODATION_POLICY,
  firstAvailableAccommodationTarget,
  resolveAccommodationTargets,
  type AccommodationPolicy,
} from '../prisoners/intake-system';
import { NEED_IDS, NEED_MAX, type NeedId, type NeedsComponent } from '../prisoners/needs';
import type { ActionCategory } from '../prisoners/regime';
import type { RoomInstanceRegistry } from '../prisoners/room-instance-registry';
import {
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  resolvePageRequest,
  toActorNameViewModel,
  toBoundedValue,
  toTileViewModel,
  type ActorNameViewModel,
  type BoundedValue,
  type HudViewModelSchemaVersion,
  type PageRequest,
  type TileViewModel,
  type ViewModelPage,
} from './view-model';

/**
 * The authoritative prisoner state these projections read.
 * `PrisonerOperationsRuntime` satisfies it structurally, so a caller passes
 * the real runtime; the narrow shape is here so a test can drive one
 * projection without standing up the entire session graph, and so the
 * read-only intent is visible in the type.
 */
export interface PrisonerProjectionSource {
  readonly entityStore: {
    readonly maxActiveIndex: number;
    isIndexAlive(index: number): boolean;
    isAlive(id: EntityId): boolean;
    getIdByIndex(index: number): EntityId;
    getIndex(id: EntityId): number;
  };
  readonly records: PrisonerRecordComponent;
  readonly needs: NeedsComponent;
  readonly currentAction: CurrentActionComponent;
  readonly position: PositionComponent;
  readonly coldState: PrisonerColdState;
  readonly roomInstances: RoomInstanceRegistry;
  /**
   * How many prisoners have ever been admitted this session, whatever
   * became of them since (`PrisonerOperationsRuntime.admittedCount`,
   * issue #506). Not the live population -- `entityStore` already answers
   * that -- but the one fact that lets `projectPrisonerRoster` tell "nobody
   * has ever been admitted" apart from "everybody who was admitted has
   * since left", which a live count of zero cannot distinguish on its own.
   */
  readonly admittedCount: number;
  /**
   * The accommodation policy this session's `IntakeSystem` is running, which is
   * what `waitingWithoutPlace` is scoped by.
   *
   * Optional and structural, exactly as `StatusStripSource.accommodationPolicy`
   * is: `PrisonerOperationsRuntime` declares one and therefore satisfies this
   * without being told, while a fixture that stands up prisoner components
   * alone is not obliged to invent one and gets
   * `DEFAULT_ACCOMMODATION_POLICY`. A projection may not name `room.cell` in a
   * condition of its own -- which room types house a resident is content
   * (`AGENTS.md` boundary 6), and the content lives in an
   * `AccommodationPolicy`.
   */
  readonly accommodationPolicy?: AccommodationPolicy;
}

/**
 * Reverse gang lookup. `GangRegistry` maintains one, so gang membership is
 * genuinely projectable; it is optional because a session may run without
 * any gangs registered at all.
 */
export interface PrisonerGangSource {
  getGangOf(entityId: EntityId): string | undefined;
  getReputation(gangId: string): number;
}

export interface PrisonerProjectionOptions {
  /** Room catalog used to resolve a room instance's `nameKey`. Defaults to the shipped catalog. */
  readonly rooms?: ContentRegistry<RoomCatalogDefinition>;
  readonly gangs?: PrisonerGangSource;
  /**
   * Actor names (`src/simulation/identity/`). Optional because identity is
   * a session-level registry rather than part of the prisoner runtime, so
   * a caller that has not been handed one projects rows without a name
   * rather than inventing a placeholder. `name` is then simply absent --
   * the same convention every other unavailable field here follows.
   */
  readonly identity?: ActorIdentitySource;
}

/**
 * A prisoner's classification is written at the intake pipeline's
 * `'classification'` stage. Before that, `classificationGroupIndex` and
 * `riskTier` are still their zero-initialised defaults -- which happen to
 * decode as `'general-population'`, tier 0. Projecting them anyway would
 * show every queued arrival as a classified general-population prisoner,
 * so the view model says `classified: false` and omits both instead.
 */
const CLASSIFIED_STAGES: readonly IntakeStage[] = ['accommodation-assignment', 'completed', 'failed'];

export interface PrisonerNeedViewModel {
  /** Stable simulation id. There is no message key for a need in any content catalog; see this module's projection notes. */
  readonly needId: NeedId;
  /** `permille: 0` is a fully unmet need; `1000` is fully satisfied. */
  readonly level: BoundedValue;
  /**
   * Whether the state counts this need as unmet when it settles this
   * prisoner's day of the operating grant -- `isNeedUnmetForStateIncome`, the
   * same predicate `unmetNeedCount` sums to compute the money.
   *
   * **This read "whether the state withholds part of this prisoner's day of
   * the operating grant because of this need", and it stopped being true on
   * 2026-09-03**, when the owner suspended
   * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` at `0` while they play
   * (their words are in that constant's docblock). The flag itself did not
   * move a bit: it is the same predicate over the same threshold, and it is
   * what the money is computed from at any rate. Only the withholding it
   * implied is suspended, so the old wording is kept beside the correction
   * rather than replaced (`docs/AGENT_WORKFLOW.md` §4).
   *
   * **A fact about what the state pays, not a claim about what a player should
   * be alarmed by**, and the two are deliberately separate:
   * `STATE_INCOME_UNMET_NEED_LEVEL`'s own comment says so, and
   * `docs/HUD_PROJECTIONS.md` gap 7 keeps the player-facing warning threshold
   * with the owner. A consumer may draw this; what it may not do is relabel it
   * "critical".
   *
   * Projected rather than left to the reader because the alternative is a HUD
   * module importing `src/simulation/economy/income.ts` to re-run the
   * comparison, which `AGENTS.md` boundary 1 forbids outright -- and because a
   * threshold the panel recomputed would be a second copy of a balance number
   * on the thread that owns none. `regime-panel.ts` predicted exactly this
   * shape: *"what would make one is a projected threshold ... and both are
   * projection changes rather than panel ones."*
   */
  readonly unmetForStateIncome: boolean;
}

export interface PrisonerActionViewModel {
  readonly actionId: string;
  readonly category: ActionCategory;
  readonly phase: ActionPhase;
  readonly phaseStartedAtTick: number;
  readonly needFulfilledLastTick: number;
  /** Room instance the action is being performed at or travelled to, when one is currently resolved. */
  readonly targetRoomInstanceId?: string;
}

export interface PrisonerRoomRefViewModel {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  /** Absent when the instance was registered with a room-catalog id the catalog does not define. */
  readonly roomNameKey?: string;
}

export interface PrisonerRosterRowViewModel {
  readonly entityId: EntityId;
  /** Absent when no identity source was supplied, or the prisoner has not reached the intake stage that mints one. */
  readonly name?: ActorNameViewModel;
  readonly intakeStage: IntakeStage;
  readonly classified: boolean;
  /** Only once classification has run: `'general-population'` or `'high-risk'`. */
  readonly classificationGroupId?: string;
  /** Only once classification has run: `0` (minimal) to `3` (high risk). */
  readonly riskTier?: number;
  readonly tile: TileViewModel;
  readonly actionPhase: ActionPhase;
  /** Absent while no action is selected (the store's `-1` sentinel). */
  readonly currentActionId?: string;
  readonly accommodation?: PrisonerRoomRefViewModel;
  /** Absent when no gang source was supplied, or the prisoner belongs to none. Gangs have stable ids only -- no `nameKey` and no content catalog. */
  readonly gangId?: string;
  /** The most depleted of the six needs, for an at-a-glance roster column. Ties break on `NEED_IDS` order. */
  readonly lowestNeed: PrisonerNeedViewModel;
}

export interface PrisonerDetailViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  readonly entityId: EntityId;
  /** Absent when no identity source was supplied, or the prisoner has not reached the intake stage that mints one. */
  readonly name?: ActorNameViewModel;
  readonly intakeStage: IntakeStage;
  readonly classified: boolean;
  readonly classificationGroupId?: string;
  readonly riskTier?: number;
  /** All six needs, always in `NEED_IDS` order. */
  readonly needs: readonly PrisonerNeedViewModel[];
  readonly currentAction?: PrisonerActionViewModel;
  readonly location: {
    readonly tile: TileViewModel;
    /**
     * The room instance the prisoner is *demonstrably* inside: the action
     * target while performing an action there. A room instance carries only
     * an anchor tile, not tile bounds, so membership cannot be derived from
     * position in general -- see this module's projection notes.
     */
    readonly roomInstance?: PrisonerRoomRefViewModel;
  };
  readonly accommodation?: PrisonerRoomRefViewModel;
  readonly gang?: { readonly gangId: string; readonly reputation: number };
  readonly sentence: {
    readonly lengthTicks: number;
    /** Meaningful only once classification has run; `0` before that. */
    readonly endTick: number;
    readonly priorIncidentsAtIntake: number;
  };
}

export interface PrisonerPopulationCountsViewModel {
  readonly total: number;
  readonly byIntakeStage: readonly { readonly intakeStage: IntakeStage; readonly count: number }[];
  readonly byClassificationGroupId: readonly { readonly classificationGroupId: string; readonly count: number }[];
  readonly unclassified: number;
  /**
   * How many arrivals are waiting for accommodation the prison has **no free
   * place for right now** -- issue #549.
   *
   * ### Why this is not the `accommodation-assignment` count
   *
   * `byIntakeStage` already answers "how many are at Cell Assignment", and that
   * is a different question. `IntakeSystem` runs every five ticks, so an
   * arrival reaching that stage sits in it for one scheduled interval **before
   * anybody looks for a bed for them** -- in a prison with a free cell they are
   * housed on the next intake tick and were never stuck. A readout keyed on the
   * stage would therefore blink a warning at a prison that is working, and a
   * player who learned to ignore that blink would ignore the real thing too.
   *
   * This subtracts the places the prison can actually offer. It is `0` for
   * every arrival that has somewhere to go and rises only once the beds run
   * out, which is the state issue #549 measured: a one-bed cell, twelve
   * admissions, one housed and eleven with nowhere to sleep.
   *
   * ### What it deliberately does not count
   *
   * - **Arrivals before `accommodation-assignment`.** `queued`, `reception` and
   *   `classification` arrivals have not been classified yet, and which room
   *   type they may be housed in is a `prisoners.classification` draw that has
   *   not been made. Counting them would mean predicting that draw, which is
   *   the thing `IntakeSystem.hasAccommodationTarget`'s own note refuses to do.
   * - **Arrivals whose classification group has no room type in this prison at
   *   all.** They reach the terminal `failed` stage on the next intake tick and
   *   `byIntakeStage` reports them there. They are a different sentence -- a
   *   place will not release them -- and counting them here as well would
   *   report one person twice.
   *
   * So this is exactly "somebody a bed would house, and there is no bed". It is
   * not a claim about the *future*: an arrival counted here is housed the
   * moment a place exists, and nothing here says one ever will.
   */
  readonly waitingWithoutPlace: number;
}

function roomRef(
  roomInstances: RoomInstanceRegistry,
  rooms: ContentRegistry<RoomCatalogDefinition>,
  instanceId: string | undefined,
): PrisonerRoomRefViewModel | undefined {
  if (instanceId === undefined) return undefined;
  const instance = roomInstances.getById(instanceId);
  if (instance === undefined) return undefined;
  const nameKey = rooms.getById(instance.roomCatalogId)?.nameKey;
  return {
    instanceId: instance.instanceId,
    roomCatalogId: instance.roomCatalogId,
    ...(nameKey !== undefined ? { roomNameKey: nameKey } : {}),
  };
}

/**
 * One need, from the whole level `NeedsComponent.get` reports.
 *
 * The level is read **once** and both fields are derived from that one read:
 * `toBoundedValue` for how full it is and `isNeedUnmetForStateIncome` for
 * whether the state withholds for it. A second `needs.get` would let a bar and
 * its own threshold flag describe two different ticks.
 */
function toNeedViewModel(needId: NeedId, level: number): PrisonerNeedViewModel {
  return { needId, level: toBoundedValue(level, NEED_MAX), unmetForStateIncome: isNeedUnmetForStateIncome(level) };
}

function needViewModel(needs: NeedsComponent, index: number, needId: NeedId): PrisonerNeedViewModel {
  return toNeedViewModel(needId, needs.get(index, needId));
}

/** Scans the six needs in declared order, so a tie resolves to the earlier `NEED_IDS` entry rather than to iteration luck. */
function lowestNeed(needs: NeedsComponent, index: number): PrisonerNeedViewModel {
  let lowestId: NeedId = NEED_IDS[0];
  let lowestLevel = needs.get(index, lowestId);
  for (const needId of NEED_IDS) {
    const level = needs.get(index, needId);
    if (level < lowestLevel) {
      lowestLevel = level;
      lowestId = needId;
    }
  }
  return toNeedViewModel(lowestId, lowestLevel);
}

function isClassified(stage: IntakeStage): boolean {
  return CLASSIFIED_STAGES.includes(stage);
}

/** Rebuilt as a plain object rather than handed through, so no view model shares a reference with registry state (contract 1). */
function actorName(identity: ActorIdentitySource | undefined, entityId: EntityId): ActorNameViewModel | undefined {
  const name = identity?.getName('prisoner', entityId);
  return name === undefined ? undefined : toActorNameViewModel(name);
}

function projectRosterRow(
  source: PrisonerProjectionSource,
  rooms: ContentRegistry<RoomCatalogDefinition>,
  gangs: PrisonerGangSource | undefined,
  identity: ActorIdentitySource | undefined,
  index: number,
): PrisonerRosterRowViewModel {
  const entityId = source.entityStore.getIdByIndex(index);
  const name = actorName(identity, entityId);
  const stage = intakeStageFromIndex(source.records.intakeStage[index]!);
  const classified = isClassified(stage);
  const actionIndex = source.currentAction.actionIndex[index]!;
  const action = actionIndex >= 0 ? DEFAULT_ACTIONS[actionIndex] : undefined;
  const accommodation = roomRef(source.roomInstances, rooms, source.coldState.getAccommodation(entityId));
  const gangId = gangs?.getGangOf(entityId);

  return {
    entityId,
    ...(name !== undefined ? { name } : {}),
    intakeStage: stage,
    classified,
    ...(classified
      ? {
          classificationGroupId: classificationGroupIdFromIndex(source.records.classificationGroupIndex[index]!),
          riskTier: source.records.riskTier[index]!,
        }
      : {}),
    tile: toTileViewModel({ x: source.position.tileX[index]!, y: source.position.tileY[index]! }),
    actionPhase: ACTION_PHASES[source.currentAction.phase[index]!]!,
    ...(action !== undefined ? { currentActionId: action.id } : {}),
    ...(accommodation !== undefined ? { accommodation } : {}),
    ...(gangId !== undefined ? { gangId } : {}),
    lowestNeed: lowestNeed(source.needs, index),
  };
}

/**
 * `projectPrisonerRoster`'s reply: the paged window plus one fact the page
 * envelope alone cannot state -- issue #506.
 */
export interface PrisonerRosterPage extends ViewModelPage<PrisonerRosterRowViewModel> {
  /**
   * True once `admittedCount` is nonzero: at least one prisoner has been
   * admitted this session, even if the live population (`total`) has since
   * fallen back to zero. `false` only means "nobody has ever been admitted"
   * -- it is not a claim about who is here *now*, which `total` already
   * answers.
   *
   * This is what lets a reader distinguish a prison nobody has used yet from
   * one whose entire population served its sentence and left -- both read
   * `total: 0`, and only this field tells them apart.
   *
   * **That used to be a claim about a *batch* leaving together**, because
   * `ADMISSION_REQUEST` in `src/main.ts` gave every admission the same fixed
   * `sentenceLengthTicks` (ADR 0050, "What this does not decide"). Since #535
   * decision 5 it does not: a sentence is drawn per prisoner from
   * `prisoners.sentence`, so a batch admitted together now leaves over a
   * spread of up to fourteen in-game days. The sentence above is narrowed
   * rather than deleted, because the state it describes is unchanged and
   * merely arrived at differently -- and it is *more* reachable now, not less:
   * one prisoner leaving at a time means `total` passes through zero on the
   * way down whenever the last of them goes.
   */
  readonly everAdmitted: boolean;
}

/**
 * The ordering rank of a prisoner classification has not run on yet.
 *
 * **Below tier 0 and not equal to it**, which is the same distinction
 * `PrisonerRosterRowViewModel.classified` exists to carry: `records.riskTier`
 * is a zero-initialised `Uint8Array`, so a queued arrival reads `0` and would
 * otherwise sort among the assessed minimal-risk prisoners. "Not assessed yet"
 * is not "assessed as harmless", and the Intake panel is where an arrival still
 * in the pipeline is read.
 */
const UNCLASSIFIED_ROSTER_RANK = -1;

/**
 * The key the roster is ordered by, for one live entity index.
 *
 * The `riskTier` a classified prisoner carries, and
 * `UNCLASSIFIED_ROSTER_RANK` before classification has run. Read off the same
 * two component arrays `projectRosterRow` reads, so the ordering key and the
 * badge the panel paints from `riskTier` cannot disagree.
 */
function rosterOrderRank(source: PrisonerProjectionSource, index: number): number {
  const stage = intakeStageFromIndex(source.records.intakeStage[index]!);
  if (!isClassified(stage)) return UNCLASSIFIED_ROSTER_RANK;
  return source.records.riskTier[index]!;
}

/**
 * One window of the prisoner roster, **highest risk tier first**, ties broken
 * by ascending entity index -- the same canonical order `EntityQuery.execute()`
 * walks (ADR 0005), so paging is stable across ticks and identical on every
 * client.
 *
 * **This used to read "in ascending entity-index order", full stop, and that
 * half is what changed** (issue #703, the owner's fourth ruling of
 * 2026-08-31): *"the Regime roster sorts by tier instead of by arrival
 * order."* The old sentence is kept here rather than overwritten because the
 * *reason* it gave is still in force and still shapes this function -- an order
 * derived from state, never from insertion or arrival time
 * (`docs/HUD_PROJECTIONS.md` section 2). Entity index is now the tie-break
 * instead of the whole key, so paging is stable for exactly the reason it
 * always was.
 *
 * Why the ruling: after ADR 0080 the tier is the gate on both a weapon and an
 * escape, so it stopped being a label and became the roster's subject. A
 * four-row window (`PRISONER_ROSTER_ROW_LIMIT`) in arrival order over a prison
 * of up to `DEFAULT_PRISONER_CAPACITY` showed the four oldest prisoners, which
 * answers a question nobody asks; the same four rows in tier order are the four
 * the player has to act on.
 *
 * **Cost, and why this is not the arbitrary-column sort refused below.** Two
 * walks of entity indices `0..maxActiveIndex` instead of one -- each step one
 * `Uint8Array` liveness read, the same walk ADR 0005 measured at ~0.6 ms for
 * 5,000 entities -- and no comparison function anywhere. The key has a handful
 * of values (`RiskTier` is `0 | 1 | 2 | 3`, plus the unclassified rank), so the
 * first walk counts a bucket per rank and the second hands each prisoner its
 * position from that bucket's running cursor: a counting sort, `O(n)`, with two
 * arrays of at most five numbers. Only the rows *in the window* allocate an
 * object, exactly as before, so a 25-row panel over a 5,000-prisoner
 * population still builds 25 row objects and not 5,000 -- see
 * `tests/unit/hud-projections-scale.test.ts` for measured allocation counts at
 * every actor tier.
 *
 * Rows are still **not** sortable by an arbitrary column here, and the
 * paragraph that refused it stands: sorting 5,000 prisoners by need or by cell
 * would be `O(n log n)` plus a full materialisation every time the sort key
 * changed; the HUD should page, or a future indexed accessor should be added to
 * the prisoner runtime. **The refusal is narrower than it reads, and this
 * change is what shows where its edge is** -- what it prices is a *comparison*
 * sort over a key with as many values as there are prisoners. A single fixed
 * key with five possible values is a bucket count, and it costs one extra
 * liveness walk.
 */
export function projectPrisonerRoster(
  source: PrisonerProjectionSource,
  request: PageRequest = {},
  options: PrisonerProjectionOptions = {},
): PrisonerRosterPage {
  const rooms = options.rooms ?? defaultRoomContentRegistry;
  const { offset, limit } = resolvePageRequest(request);

  /*
   * First walk: the population, and how much of it sits at each rank.
   *
   * Indexed by `rank - UNCLASSIFIED_ROSTER_RANK` so the unclassified rank has
   * a bucket at 0 and no index is negative. The array is grown by what the
   * walk actually finds rather than sized from a tier-count constant this
   * module would have to keep in step with `RiskTier` -- there is no such
   * constant, and this is why one is not introduced: a fifth tier added to the
   * simulation sorts above tier 3 here with no edit, which is the property
   * `simulation-message-keys.ts` gets from deriving its keys rather than
   * listing them.
   */
  const countByRank: number[] = [];
  let total = 0;
  let highestRank = UNCLASSIFIED_ROSTER_RANK;

  for (let index = 0; index <= source.entityStore.maxActiveIndex; index += 1) {
    if (!source.entityStore.isIndexAlive(index)) continue;
    total += 1;
    const rank = rosterOrderRank(source, index);
    const bucket = rank - UNCLASSIFIED_ROSTER_RANK;
    countByRank[bucket] = (countByRank[bucket] ?? 0) + 1;
    if (rank > highestRank) highestRank = rank;
  }

  // Where each rank's run of rows begins in the sorted list, highest rank
  // first. Walked downward, so the accumulator *is* the start of the next run.
  const nextPositionByRank: number[] = [];
  let runStart = 0;
  for (let rank = highestRank; rank >= UNCLASSIFIED_ROSTER_RANK; rank -= 1) {
    const bucket = rank - UNCLASSIFIED_ROSTER_RANK;
    nextPositionByRank[bucket] = runStart;
    runStart += countByRank[bucket] ?? 0;
  }

  /*
   * Second walk: give every prisoner its sorted position and materialise only
   * the ones the window asked for.
   *
   * Ascending index, so two prisoners at the same rank take their positions in
   * ascending entity index -- the tie-break, and the reason a row the player is
   * reading does not move under them between publications (issue #209). Nothing
   * here depends on iteration order beyond that: the position is arithmetic
   * over counts taken from state.
   */
  const windowEnd = Math.min(total, offset + limit);
  const rows: PrisonerRosterRowViewModel[] = new Array<PrisonerRosterRowViewModel>(Math.max(0, windowEnd - offset));
  let filled = 0;

  for (let index = 0; index <= source.entityStore.maxActiveIndex && filled < rows.length; index += 1) {
    if (!source.entityStore.isIndexAlive(index)) continue;
    const bucket = rosterOrderRank(source, index) - UNCLASSIFIED_ROSTER_RANK;
    const sortedPosition = nextPositionByRank[bucket]!;
    nextPositionByRank[bucket] = sortedPosition + 1;
    if (sortedPosition < offset || sortedPosition >= windowEnd) continue;
    rows[sortedPosition - offset] = projectRosterRow(source, rooms, options.gangs, options.identity, index);
    filled += 1;
  }

  return { total, offset, limit, rows, everAdmitted: source.admittedCount > 0 };
}

/**
 * Free resident places per accommodation target, from the registry the intake
 * stage itself asks.
 *
 * The same walk `accommodationCapacityOf` makes in
 * `status-strip-projection.ts` -- targets in `resolveAccommodationTargets`
 * order, each instance credited to at most one target -- with two differences,
 * and both are the point:
 *
 * - it subtracts the current occupancy, because a full cell is capacity and not
 *   a place; and
 * - it keeps the totals **per target** rather than summing them, because a
 *   high-risk arrival held for a solitary cell is not housed by a free place in
 *   an ordinary one. A single prison-wide total would report nobody waiting in
 *   exactly the configuration that strands somebody.
 *
 * `Math.max(0, ...)` on each instance rather than on the total: an instance
 * whose `residentCapacity` fell below its occupancy -- a bed removed from a
 * cell somebody sleeps in -- has no places to offer, and must not cancel out
 * the places another cell does have.
 *
 * Deterministic and allocation-bounded by the number of accommodation
 * instances: `allByRoomCatalogId` returns its cached ascending-instance-id
 * sort, the target list is authored, and both collections are keyed rather
 * than iterated.
 */
function freeAccommodationPlacesByTarget(
  roomInstances: RoomInstanceRegistry,
  policy: AccommodationPolicy,
): Map<string, number> {
  const free = new Map<string, number>();
  const counted = new Set<string>();

  for (const target of resolveAccommodationTargets(policy)) {
    let places = 0;
    for (const instance of roomInstances.allByRoomCatalogId(target.roomCatalogId)) {
      if (counted.has(instance.instanceId)) continue;
      if (
        target.requiredObjectCapability !== undefined &&
        !instance.objectCapabilities.includes(target.requiredObjectCapability)
      ) {
        continue;
      }
      counted.add(instance.instanceId);
      places += Math.max(0, instance.residentCapacity - roomInstances.occupancyOf(instance.instanceId));
    }
    free.set(accommodationTargetKey(target), places);
  }

  return free;
}

/**
 * How many of the arrivals waiting at `accommodation-assignment` the prison
 * currently has nowhere to put -- see `waitingWithoutPlace`.
 *
 * It resolves each group's target the way `IntakeSystem` does, through the one
 * shared `firstAvailableAccommodationTarget`, and then spends that target's
 * free places on the arrivals holding it. What it does **not** do is re-run the
 * placement: which instance an arrival lands in is a cell-sharing rating
 * (`rateCellSharing`) and it cannot change whether a place exists, so counting
 * needs the budget and not the choice.
 *
 * The answer does not depend on the order groups are visited in, because a
 * target's shortfall is `max(0, arrivals holding it - its places)` however the
 * arrivals holding it are split between groups. `CLASSIFICATION_GROUP_IDS`
 * order is used anyway, so nothing here reads a `Map`'s insertion order
 * (`docs/DETERMINISM.md`).
 *
 * A group whose target is `undefined` is skipped rather than counted: the
 * prison holds no instance of any room type that group may be housed in, so
 * those arrivals become `failed` on the next intake tick and `byIntakeStage`
 * reports them there. Counting them here as well would put one person in two
 * sentences that mean opposite things -- "a bed would fix this" and "nothing
 * will".
 */
function waitingWithoutPlaceCount(
  source: PrisonerProjectionSource,
  policy: AccommodationPolicy,
  waitingByGroup: ReadonlyMap<string, number>,
): number {
  if (waitingByGroup.size === 0) return 0;

  const free = freeAccommodationPlacesByTarget(source.roomInstances, policy);
  let withoutPlace = 0;

  for (const groupId of CLASSIFICATION_GROUP_IDS) {
    const waiting = waitingByGroup.get(groupId) ?? 0;
    if (waiting <= 0) continue;
    const target = firstAvailableAccommodationTarget(policy, source.roomInstances, groupId);
    if (target === undefined) continue;
    const key = accommodationTargetKey(target);
    const places = free.get(key) ?? 0;
    const housed = Math.min(waiting, places);
    free.set(key, places - housed);
    withoutPlace += waiting - housed;
  }

  return withoutPlace;
}

/**
 * Population counts without building a single row. Same index walk as the
 * roster, no per-prisoner allocation at all -- this is what a status strip
 * or a filter chip should read.
 */
export function projectPrisonerPopulationCounts(source: PrisonerProjectionSource): PrisonerPopulationCountsViewModel {
  const byStage = new Map<IntakeStage, number>();
  const byGroup = new Map<string, number>();
  /** Arrivals at `accommodation-assignment` only, by the group whose targets decide where they may go. */
  const waitingByGroup = new Map<string, number>();
  let total = 0;
  let unclassified = 0;

  for (let index = 0; index <= source.entityStore.maxActiveIndex; index += 1) {
    if (!source.entityStore.isIndexAlive(index)) continue;
    total += 1;
    const stage = intakeStageFromIndex(source.records.intakeStage[index]!);
    byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
    if (!isClassified(stage)) {
      unclassified += 1;
      continue;
    }
    const groupId = classificationGroupIdFromIndex(source.records.classificationGroupIndex[index]!);
    byGroup.set(groupId, (byGroup.get(groupId) ?? 0) + 1);
    if (stage === 'accommodation-assignment') waitingByGroup.set(groupId, (waitingByGroup.get(groupId) ?? 0) + 1);
  }

  return {
    total,
    // Declared catalog order, not Map order: a stage with no prisoners
    // still appears, so a HUD row does not appear and vanish.
    byIntakeStage: (['queued', 'reception', 'classification', 'accommodation-assignment', 'completed', 'failed'] as const).map((stage) => ({
      intakeStage: stage,
      count: byStage.get(stage) ?? 0,
    })),
    byClassificationGroupId: (['general-population', 'high-risk'] as const).map((groupId) => ({
      classificationGroupId: groupId,
      count: byGroup.get(groupId) ?? 0,
    })),
    unclassified,
    waitingWithoutPlace: waitingWithoutPlaceCount(
      source,
      source.accommodationPolicy ?? DEFAULT_ACCOMMODATION_POLICY,
      waitingByGroup,
    ),
  };
}

/** `undefined` for an id that was never spawned or has since been destroyed (the generation check, not merely index liveness). */
export function projectPrisonerDetail(
  source: PrisonerProjectionSource,
  entityId: EntityId,
  options: PrisonerProjectionOptions = {},
): PrisonerDetailViewModel | undefined {
  if (!source.entityStore.isAlive(entityId)) return undefined;

  const rooms = options.rooms ?? defaultRoomContentRegistry;
  const index = source.entityStore.getIndex(entityId);
  const stage = intakeStageFromIndex(source.records.intakeStage[index]!);
  const classified = isClassified(stage);
  const phase = ACTION_PHASES[source.currentAction.phase[index]!]!;
  const actionIndex = source.currentAction.actionIndex[index]!;
  const definition = actionIndex >= 0 ? DEFAULT_ACTIONS[actionIndex] : undefined;
  const targetInstanceId = source.coldState.getActionTarget(entityId);
  const accommodation = roomRef(source.roomInstances, rooms, source.coldState.getAccommodation(entityId));
  // Only a 'performing' action places the prisoner at its target: while
  // 'travelling' the position component still holds the origin tile
  // (`action-system.ts` updates it on arrival, never in between).
  const occupiedRoom = phase === 'performing' ? roomRef(source.roomInstances, rooms, targetInstanceId) : undefined;
  const gangId = options.gangs?.getGangOf(entityId);

  const currentAction: PrisonerActionViewModel | undefined =
    definition === undefined
      ? undefined
      : {
          actionId: definition.id,
          category: definition.category,
          phase,
          phaseStartedAtTick: source.currentAction.phaseStartedAtTick[index]!,
          needFulfilledLastTick: source.currentAction.needFulfilledLastTick[index]!,
          ...(targetInstanceId !== undefined ? { targetRoomInstanceId: targetInstanceId } : {}),
        };

  const name = actorName(options.identity, entityId);

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    entityId,
    ...(name !== undefined ? { name } : {}),
    intakeStage: stage,
    classified,
    ...(classified
      ? {
          classificationGroupId: classificationGroupIdFromIndex(source.records.classificationGroupIndex[index]!),
          riskTier: source.records.riskTier[index]!,
        }
      : {}),
    needs: NEED_IDS.map((needId) => needViewModel(source.needs, index, needId)),
    ...(currentAction !== undefined ? { currentAction } : {}),
    location: {
      tile: toTileViewModel({ x: source.position.tileX[index]!, y: source.position.tileY[index]! }),
      ...(occupiedRoom !== undefined ? { roomInstance: occupiedRoom } : {}),
    },
    ...(accommodation !== undefined ? { accommodation } : {}),
    ...(gangId !== undefined && options.gangs !== undefined
      ? { gang: { gangId, reputation: options.gangs.getReputation(gangId) } }
      : {}),
    sentence: {
      lengthTicks: source.records.sentenceLengthTicks[index]!,
      endTick: source.records.sentenceEndTick[index]!,
      priorIncidentsAtIntake: source.records.priorIncidentsAtIntake[index]!,
    },
  };
}
