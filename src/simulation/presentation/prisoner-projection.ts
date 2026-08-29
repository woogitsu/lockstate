import type { ContentRegistry } from '../../content/registry';
import type { RoomCatalogDefinition } from '../../content/room-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import { isNeedUnmetForStateIncome } from '../economy/income';
import type { EntityId } from '../entity/entity-store';
import type { ActorIdentitySource } from '../identity/actor-identity';
import { DEFAULT_ACTIONS } from '../prisoners/actions';
import {
  ACTION_PHASES,
  classificationGroupIdFromIndex,
  type ActionPhase,
  type CurrentActionComponent,
  type IntakeStage,
  intakeStageFromIndex,
  type PositionComponent,
  type PrisonerColdState,
  type PrisonerRecordComponent,
} from '../prisoners/components';
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
   * Whether the state withholds part of this prisoner's day of the operating
   * grant because of this need -- `isNeedUnmetForStateIncome`, the same
   * predicate `unmetNeedCount` sums to compute the money.
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
   * one whose entire population served its sentence and left inside the
   * same batch (`ADMISSION_REQUEST`'s fixed `sentenceLengthTicks` in
   * `src/main.ts`, ADR 0050 "What this does not decide") -- both read
   * `total: 0`, and only this field tells them apart.
   */
  readonly everAdmitted: boolean;
}

/**
 * One window of the prisoner roster, in ascending entity-index order --
 * the same canonical order `EntityQuery.execute()` walks (ADR 0005), so
 * paging is stable across ticks and identical on every client.
 *
 * **Cost.** The scan walks entity indices `0..maxActiveIndex` to find the
 * requested window and to count the population; each step is one
 * `Uint8Array` liveness read, the same walk ADR 0005 measured at ~0.6 ms
 * for 5,000 entities. Only the `limit` rows in the window allocate an
 * object, so a 25-row panel over a 5,000-prisoner population builds 25 row
 * objects, not 5,000 -- see `tests/unit/hud-projections-scale.test.ts` for
 * measured allocation counts at every actor tier.
 *
 * Rows are **not** sortable by an arbitrary column here. Sorting 5,000
 * prisoners by need or by cell would be `O(n log n)` plus a full
 * materialisation every time the sort key changed; the HUD should page,
 * or a future indexed accessor should be added to the prisoner runtime.
 */
export function projectPrisonerRoster(
  source: PrisonerProjectionSource,
  request: PageRequest = {},
  options: PrisonerProjectionOptions = {},
): PrisonerRosterPage {
  const rooms = options.rooms ?? defaultRoomContentRegistry;
  const { offset, limit } = resolvePageRequest(request);
  const rows: PrisonerRosterRowViewModel[] = [];
  let total = 0;

  for (let index = 0; index <= source.entityStore.maxActiveIndex; index += 1) {
    if (!source.entityStore.isIndexAlive(index)) continue;
    const positionInList = total;
    total += 1;
    if (positionInList < offset) continue;
    if (rows.length >= limit) continue;
    rows.push(projectRosterRow(source, rooms, options.gangs, options.identity, index));
  }

  return { total, offset, limit, rows, everAdmitted: source.admittedCount > 0 };
}

/**
 * Population counts without building a single row. Same index walk as the
 * roster, no per-prisoner allocation at all -- this is what a status strip
 * or a filter chip should read.
 */
export function projectPrisonerPopulationCounts(source: PrisonerProjectionSource): PrisonerPopulationCountsViewModel {
  const byStage = new Map<IntakeStage, number>();
  const byGroup = new Map<string, number>();
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
