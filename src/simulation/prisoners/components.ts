import type { EntityId } from '../entity/entity-store';
import { DEFAULT_ACTIONS } from './actions';
import type { RiskTier } from './classification';

export const CLASSIFICATION_GROUP_IDS = ['general-population', 'high-risk'] as const;

export function classificationGroupIndex(groupId: string): number {
  const index = CLASSIFICATION_GROUP_IDS.indexOf(groupId as (typeof CLASSIFICATION_GROUP_IDS)[number]);
  if (index === -1) throw new RangeError(`Unknown classification group id "${groupId}".`);
  return index;
}

export function classificationGroupIdFromIndex(index: number): string {
  const groupId = CLASSIFICATION_GROUP_IDS[index];
  if (groupId === undefined) throw new RangeError(`Unknown classification group index ${index}.`);
  return groupId;
}

export const INTAKE_STAGES = ['queued', 'reception', 'classification', 'accommodation-assignment', 'completed', 'failed'] as const;
export type IntakeStage = (typeof INTAKE_STAGES)[number];

export function intakeStageIndex(stage: IntakeStage): number {
  return INTAKE_STAGES.indexOf(stage);
}

export function intakeStageFromIndex(index: number): IntakeStage {
  const stage = INTAKE_STAGES[index];
  if (stage === undefined) throw new RangeError(`Unknown intake stage index ${index}.`);
  return stage;
}

/**
 * Hot, frequently-queried per-prisoner fields as flat typed arrays (ADR
 * 0005: "separate hot typed-array component data from cold/rare
 * metadata"). Everything here is small, fixed-width and numeric.
 */
export class PrisonerRecordComponent {
  /** Set at intake submission; consumed at the 'classification' stage to compute `sentenceEndTick`. */
  public readonly sentenceLengthTicks: Uint32Array;
  public readonly priorIncidentsAtIntake: Uint8Array;
  public readonly sentenceEndTick: Uint32Array;
  public readonly riskTier: Uint8Array;
  public readonly classificationGroupIndex: Uint8Array;
  public readonly intakeStage: Uint8Array;

  public constructor(public readonly capacity: number) {
    this.sentenceLengthTicks = new Uint32Array(capacity);
    this.priorIncidentsAtIntake = new Uint8Array(capacity);
    this.sentenceEndTick = new Uint32Array(capacity);
    this.riskTier = new Uint8Array(capacity);
    this.classificationGroupIndex = new Uint8Array(capacity);
    this.intakeStage = new Uint8Array(capacity).fill(intakeStageIndex('queued'));
  }

  public getRiskTier(index: number): RiskTier {
    return this.riskTier[index] as RiskTier;
  }

  public getSnapshot() {
    return {
      sentenceLengthTicks: new Uint32Array(this.sentenceLengthTicks),
      priorIncidentsAtIntake: new Uint8Array(this.priorIncidentsAtIntake),
      sentenceEndTick: new Uint32Array(this.sentenceEndTick),
      riskTier: new Uint8Array(this.riskTier),
      classificationGroupIndex: new Uint8Array(this.classificationGroupIndex),
      intakeStage: new Uint8Array(this.intakeStage),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.sentenceLengthTicks.set(snapshot.sentenceLengthTicks);
    this.priorIncidentsAtIntake.set(snapshot.priorIncidentsAtIntake);
    this.sentenceEndTick.set(snapshot.sentenceEndTick);
    this.riskTier.set(snapshot.riskTier);
    this.classificationGroupIndex.set(snapshot.classificationGroupIndex);
    this.intakeStage.set(snapshot.intakeStage);
  }
}

/**
 * Tile-space position (integer, matching `TilePosition` -- not a
 * continuous render/world-space transform). Movement here is abstracted:
 * an entity's position updates only on arrival at a resolved route's
 * destination (see action-system.ts) -- literal tile-by-tile locomotion
 * and rendering are out of scope for #21/#22/#24 alike (docs/NAVIGATION.md).
 */
export class PositionComponent {
  public readonly tileX: Int32Array;
  public readonly tileY: Int32Array;

  public constructor(public readonly capacity: number) {
    this.tileX = new Int32Array(capacity);
    this.tileY = new Int32Array(capacity);
  }

  public getSnapshot() {
    return { tileX: new Int32Array(this.tileX), tileY: new Int32Array(this.tileY) };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.tileX.set(snapshot.tileX);
    this.tileY.set(snapshot.tileY);
  }
}

export const ACTION_PHASES = ['idle', 'travelling', 'performing'] as const;
export type ActionPhase = (typeof ACTION_PHASES)[number];

export function actionIndexOf(actionId: string): number {
  return DEFAULT_ACTIONS.findIndex((action) => action.id === actionId);
}

/** Hot per-prisoner action-execution state. `actionIndex === -1` means no action is currently selected. */
export class CurrentActionComponent {
  public readonly actionIndex: Int16Array;
  public readonly phase: Uint8Array;
  public readonly phaseStartedAtTick: Uint32Array;
  public readonly needFulfilledLastTick: Uint32Array;

  public constructor(public readonly capacity: number) {
    this.actionIndex = new Int16Array(capacity).fill(-1);
    this.phase = new Uint8Array(capacity);
    this.phaseStartedAtTick = new Uint32Array(capacity);
    this.needFulfilledLastTick = new Uint32Array(capacity);
  }

  public getSnapshot() {
    return {
      actionIndex: new Int16Array(this.actionIndex),
      phase: new Uint8Array(this.phase),
      phaseStartedAtTick: new Uint32Array(this.phaseStartedAtTick),
      needFulfilledLastTick: new Uint32Array(this.needFulfilledLastTick),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.actionIndex.set(snapshot.actionIndex);
    this.phase.set(snapshot.phase);
    this.phaseStartedAtTick.set(snapshot.phaseStartedAtTick);
    this.needFulfilledLastTick.set(snapshot.needFulfilledLastTick);
  }
}

/**
 * Cold, rarely-mutated per-prisoner metadata that doesn't fit a flat
 * numeric array well (string ids) -- accommodation assignment and the
 * current action's travel target, each read every reconsideration tick
 * but written only when they change (ADR 0005's "cold/rare metadata"
 * counterpart to the hot components above).
 */
export class PrisonerColdState {
  private readonly accommodationInstanceId = new Map<EntityId, string>();
  private readonly currentActionTargetInstanceId = new Map<EntityId, string>();
  private readonly currentActionPathRequestId = new Map<EntityId, string>();

  public getAccommodation(entityId: EntityId): string | undefined {
    return this.accommodationInstanceId.get(entityId);
  }

  public setAccommodation(entityId: EntityId, instanceId: string): void {
    this.accommodationInstanceId.set(entityId, instanceId);
  }

  public getActionTarget(entityId: EntityId): string | undefined {
    return this.currentActionTargetInstanceId.get(entityId);
  }

  public setActionTarget(entityId: EntityId, instanceId: string | undefined): void {
    if (instanceId === undefined) this.currentActionTargetInstanceId.delete(entityId);
    else this.currentActionTargetInstanceId.set(entityId, instanceId);
  }

  public getPathRequestId(entityId: EntityId): string | undefined {
    return this.currentActionPathRequestId.get(entityId);
  }

  public setPathRequestId(entityId: EntityId, requestId: string | undefined): void {
    if (requestId === undefined) this.currentActionPathRequestId.delete(entityId);
    else this.currentActionPathRequestId.set(entityId, requestId);
  }

  public getSnapshot() {
    return {
      accommodationInstanceId: [...this.accommodationInstanceId.entries()].sort(([a], [b]) => a - b),
      currentActionTargetInstanceId: [...this.currentActionTargetInstanceId.entries()].sort(([a], [b]) => a - b),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.accommodationInstanceId.clear();
    for (const [entityId, instanceId] of snapshot.accommodationInstanceId) this.accommodationInstanceId.set(entityId, instanceId);
    this.currentActionTargetInstanceId.clear();
    for (const [entityId, instanceId] of snapshot.currentActionTargetInstanceId) this.currentActionTargetInstanceId.set(entityId, instanceId);
    this.currentActionPathRequestId.clear();
  }
}
