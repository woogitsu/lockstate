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
 * The subset of the typed-array surface these components need: write one
 * slot, or fill every slot. Every `Uint8Array`/`Uint32Array`/`Int32Array`/
 * `Int16Array` below satisfies it structurally.
 */
interface SlotArray {
  fill(value: number): unknown;
  [index: number]: number;
}

/** One component array paired with the value a slot holds while it is unoccupied. */
type SlotDefault = readonly [target: SlotArray, initial: number];

/**
 * A component states each of its defaults exactly once, in a `SlotDefault`
 * list, and drives *both* its initial allocation and its per-slot `reset`
 * from that one list. The alternative -- a `.fill()` in the constructor and
 * a separate hand-written `reset` body -- is what produced #111: an array
 * initialised in one place and forgotten in the other is silently correct
 * until an index is recycled. `tests/unit/prisoner-slot-recycling.test.ts`
 * fails if an array is added to a component and not to its list.
 */
function fillEverySlot(defaults: readonly SlotDefault[]): void {
  for (const [target, initial] of defaults) target.fill(initial);
}

function resetOneSlot(defaults: readonly SlotDefault[], index: number): void {
  for (const [target, initial] of defaults) target[index] = initial;
}

/**
 * The widest values `PrisonerRecordComponent`'s two intake-input slots can
 * hold, exported so the boundary that accepts an admission can refuse an
 * out-of-range figure instead of letting a typed array wrap or a clamp
 * silently rewrite it (#261 step 4).
 *
 * Neither is a balance number and neither was chosen: they are
 * `Uint32Array`'s and `Uint8Array`'s ceilings, which is what the two slots
 * below are. `submitIntake` already clamps `priorIncidents` to the second
 * with `Math.min`; `admitPrisonerSchema` refusing the same value at the wire
 * means the clamp is a belt to a brace rather than the only guard.
 */
export const MAX_SENTENCE_LENGTH_TICKS = 0xffff_ffff;
export const MAX_PRIOR_INCIDENTS = 255;

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
  /**
   * The tick a live solitary sanction ends, or `0` for a prisoner not
   * currently sanctioned (issue #80, ADR 00XX -- number not yet assigned;
   * see the branch's report). `0` is never a legal end tick for a real
   * sanction: `SanctionSystem.update` only ever writes `max(existing, tick)
   * + policy.solitaryTermTicks`, which is strictly positive from tick 0
   * onward, so a slot reading `0` and a slot never sanctioned are the same
   * fact, exactly as `sentenceEndTick` above already relies on for the same
   * reason.
   *
   * Deliberately the *only* new persisted field this consequence needs.
   * Whether a sanctioned prisoner is *physically* in `room.solitary-cell`
   * yet is not stored here -- `SanctionSystem` re-derives it every scheduled
   * tick from `PrisonerColdState.getAccommodation` and
   * `RoomInstanceRegistry.getById`, which the save already carries. Storing
   * a second flag for "currently relocated" would be a fact that can
   * disagree with the room registry it is about.
   */
  public readonly solitarySanctionEndTick: Uint32Array;
  /**
   * `1` for a prisoner hurt in an incident and not yet treated, `0` otherwise
   * (issue #589, the owner's ruling of 2026-09-17).
   *
   * **A boolean and nothing else.** The ruling authorised *"sam boolean, bez
   * medyka i bez potrzeby zdrowia"* -- the flag, no medic role, no health
   * need, no death and no second flag -- so there is no severity, no health
   * level and no treatment-progress counter here. How far a treatment has got
   * is `CurrentActionComponent.phaseStartedAtTick`, which the save already
   * carries, exactly as it is for every other action; this array holds only
   * whether the prisoner still needs one.
   *
   * `Uint8Array` rather than a bitset for the same reason every other array in
   * this component is a typed array: the payload codec slices it, the save
   * schema validates it against `activeLength`, and a packed representation
   * would be a second encoding to keep in step for 5,000 bytes at
   * `DEFAULT_PRISONER_CAPACITY`.
   *
   * `0` is what a never-occupied slot already reads as and it means exactly
   * what every build before this one meant -- "nobody in this session has been
   * hurt" -- which is the property `docs/PERSISTENCE.md`'s
   * "Adding an optional field without a version bump" requires, and the reason
   * `SAVE_SCHEMA_VERSION` does not move for it. Written by
   * `PrisonerOperationsRuntime.markInjured` (from `IncidentResponseSystem`'s
   * `onPrisonerInjured` port) and cleared by `ActionSystem` when a course of
   * `action.infirmary-treatment` completes.
   */
  public readonly injured: Uint8Array;

  private readonly slotDefaults: readonly SlotDefault[];

  public constructor(public readonly capacity: number) {
    this.sentenceLengthTicks = new Uint32Array(capacity);
    this.priorIncidentsAtIntake = new Uint8Array(capacity);
    this.sentenceEndTick = new Uint32Array(capacity);
    this.riskTier = new Uint8Array(capacity);
    this.classificationGroupIndex = new Uint8Array(capacity);
    this.intakeStage = new Uint8Array(capacity);
    this.solitarySanctionEndTick = new Uint32Array(capacity);
    this.injured = new Uint8Array(capacity);
    this.slotDefaults = [
      // Overwritten by `submitIntake` from the admission input.
      [this.sentenceLengthTicks, 0],
      [this.priorIncidentsAtIntake, 0],
      // Computed at the 'classification' stage, ~15 ticks after admission.
      // Until then the HUD projection emits this end tick unconditionally, so
      // 0 ("no sentence end computed yet") is what a fresh slot has always
      // shown and a recycled one now shows too.
      [this.sentenceEndTick, 0],
      // `RiskTier` 0 is 'minimal' -- the least-alarming tier, and the one a
      // never-occupied slot already reads as. Also recomputed at
      // classification, and gated behind `classified` in the projection.
      [this.riskTier, 0],
      // CLASSIFICATION_GROUP_IDS[0] === 'general-population'. Recomputed at
      // classification and likewise projection-gated.
      [this.classificationGroupIndex, 0],
      // The stage every admission starts at; `submitIntake` writes it too.
      [this.intakeStage, intakeStageIndex('queued')],
      // `0` -- "not sanctioned". A recycled index must not inherit its
      // previous occupant's sanction, and a never-sanctioned prisoner is
      // exactly what a fresh slot already reads as.
      [this.solitarySanctionEndTick, 0],
      // `0` -- "not injured". A recycled index must not inherit its previous
      // occupant's injury, and a never-injured prisoner is exactly what a
      // fresh slot already reads as.
      [this.injured, 0],
    ];
    fillEverySlot(this.slotDefaults);
  }

  /** Restores one slot to the values a never-occupied slot holds. Called when an index is allocated, so a recycled index cannot inherit its previous occupant's record. */
  public reset(index: number): void {
    resetOneSlot(this.slotDefaults, index);
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
      solitarySanctionEndTick: new Uint32Array(this.solitarySanctionEndTick),
      injured: new Uint8Array(this.injured),
    };
  }


  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.sentenceLengthTicks.set(snapshot.sentenceLengthTicks);
    this.priorIncidentsAtIntake.set(snapshot.priorIncidentsAtIntake);
    this.sentenceEndTick.set(snapshot.sentenceEndTick);
    this.riskTier.set(snapshot.riskTier);
    this.classificationGroupIndex.set(snapshot.classificationGroupIndex);
    this.intakeStage.set(snapshot.intakeStage);
    this.solitarySanctionEndTick.set(snapshot.solitarySanctionEndTick);
    this.injured.set(snapshot.injured);
  }
}

/**
 * The tile an entity occupies, as an integer -- not a continuous
 * render/world-space transform, and **not the whole of where the entity is**.
 *
 * Since [ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)
 * a prisoner walks a resolved route rather than being written onto its
 * destination, so this changes once per tile crossed. Where the prisoner is
 * *within* that tile lives in `LocomotionStore` (`../locomotion/`), which is
 * transient and which no save carries; every reader here -- projections, a
 * route's origin, sector occupancy -- asks the same question it always did and
 * gets the same kind of answer.
 *
 * > **This comment read:** *"Movement here is abstracted: an entity's position
 * > updates only on arrival at a resolved route's destination (see
 * > action-system.ts) -- literal tile-by-tile locomotion and rendering are out
 * > of scope for #21/#22/#24 alike (docs/NAVIGATION.md)."* That was true of
 * > prisoners until ADR 0059 and **is still true of guards**, whose tiles
 * > `GuardRoster` holds and whose arrival `patrol-system.ts`,
 * > `deployment-system.ts`, `response-system.ts` and `search-system.ts` still
 * > apply in one statement.
 */
export class PositionComponent {
  public readonly tileX: Int32Array;
  public readonly tileY: Int32Array;

  private readonly slotDefaults: readonly SlotDefault[];

  public constructor(public readonly capacity: number) {
    this.tileX = new Int32Array(capacity);
    this.tileY = new Int32Array(capacity);
    // Tile 0,0 is a valid tile, not a sentinel; it is simply what a
    // never-occupied slot reads as, and every caller of `reset` writes a real
    // origin immediately afterwards.
    this.slotDefaults = [
      [this.tileX, 0],
      [this.tileY, 0],
    ];
    fillEverySlot(this.slotDefaults);
  }

  /**
   * Restores one slot to the values a never-occupied slot holds.
   *
   * Not independently observable today: `admitPrisoner` overwrites both of
   * this component's arrays with the origin tile straight after calling
   * this, so removing the call would change nothing. It is here so that a
   * third field added to this component is reset by construction rather than
   * by remembering to extend the admission path -- which is the failure that
   * left thirteen arrays uninitialised in the first place.
   */
  public reset(index: number): void {
    resetOneSlot(this.slotDefaults, index);
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

  private readonly slotDefaults: readonly SlotDefault[];

  public constructor(public readonly capacity: number) {
    this.actionIndex = new Int16Array(capacity);
    this.phase = new Uint8Array(capacity);
    this.phaseStartedAtTick = new Uint32Array(capacity);
    this.needFulfilledLastTick = new Uint32Array(capacity);
    this.slotDefaults = [
      // -1 is this component's documented "no action selected" sentinel; a
      // non-negative value indexes DEFAULT_ACTIONS.
      [this.actionIndex, -1],
      // ACTION_PHASES[0] === 'idle', the phase that pairs with "no action
      // selected": 'travelling' and 'performing' both describe progress
      // through an action this slot does not have.
      [this.phase, 0],
      // Both tick stamps are 0 in a never-occupied slot. `phaseStartedAtTick`
      // is the one that is read rather than only projected -- `ActionSystem`
      // compares `tick - phaseStartedAtTick` against the current action's
      // minimum duration -- so a value left by a previous occupant would
      // change behaviour and not only display.
      [this.phaseStartedAtTick, 0],
      // Written and projected to the HUD, never compared: 0 reads as "no
      // need fulfilled yet", which is true of a new arrival.
      [this.needFulfilledLastTick, 0],
    ];
    fillEverySlot(this.slotDefaults);
  }

  /** Restores one slot to the values a never-occupied slot holds. Called when an index is allocated, so a recycled index cannot inherit its previous occupant's action plan. */
  public reset(index: number): void {
    resetOneSlot(this.slotDefaults, index);
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

  public getPathRequestSnapshot(): readonly (readonly [EntityId, string])[] {
    return [...this.currentActionPathRequestId].sort(([a], [b]) => a - b);
  }

  public loadPathRequestSnapshot(rows: readonly (readonly [EntityId, string])[]): void {
    this.currentActionPathRequestId.clear();
    for (const [entityId, requestId] of rows) this.currentActionPathRequestId.set(entityId, requestId);
  }

  /**
   * Drops every entry this cold state holds for one entity, because that
   * entity has ceased to exist (ADR 0050 decision 2; ADR 0026 question 2).
   *
   * The three maps are keyed by `EntityId` and until now the only thing that
   * emptied them was `loadSnapshot`'s whole-registry `clear()`. That was safe
   * only while nothing was ever destroyed: `EntityStore` bumps a slot's
   * generation on destroy, so the next occupant's id misses rather than
   * inheriting -- until the generation wraps at 4,096 recycles of that index
   * and the miss becomes a hit (ADR 0026's subject). A per-entity drop is
   * correct with or without that wrap, which is why it is this and not a
   * longer fuse.
   *
   * Total in every direction a release can be wrong: an entity that holds no
   * accommodation, no target and no path request is three no-op deletes, and
   * releasing twice is three more. `Map.delete` reports rather than throws, and
   * this keeps no counters that a double delete could drive negative.
   */
  public release(entityId: EntityId): void {
    this.accommodationInstanceId.delete(entityId);
    this.currentActionTargetInstanceId.delete(entityId);
    this.currentActionPathRequestId.delete(entityId);
  }

  public getSnapshot() {
    return {
      accommodationInstanceId: [...this.accommodationInstanceId.entries()].sort(([a], [b]) => a - b),
      currentActionTargetInstanceId: [...this.currentActionTargetInstanceId.entries()].sort(([a], [b]) => a - b),
    };
  }

  /**
   * Every prisoner's outstanding path-request id, ascending by entity id.
   *
   * **Not part of `getSnapshot` above, and that is deliberate rather than an
   * omission** (issue #1373). An id is only meaningful beside the
   * `NavigationSystem` queue entry it names, so it travels in the save's
   * `inFlight` section with that queue, and a save that predates the section
   * carries neither -- which `getSnapshot`'s own two lists cannot express,
   * because every save that exists carries them.
   */
  public getPathRequestSnapshot(): readonly (readonly [EntityId, string])[] {
    return [...this.currentActionPathRequestId.entries()].sort(([a], [b]) => a - b);
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.accommodationInstanceId.clear();
    for (const [entityId, instanceId] of snapshot.accommodationInstanceId) this.accommodationInstanceId.set(entityId, instanceId);
    this.currentActionTargetInstanceId.clear();
    for (const [entityId, instanceId] of snapshot.currentActionTargetInstanceId) this.currentActionTargetInstanceId.set(entityId, instanceId);
    this.currentActionPathRequestId.clear();
  }
}

/**
 * The saturation point of both arrays below, and the value they stop at rather
 * than wrapping to zero.
 *
 * `Uint32Array`'s ceiling. A prisoner reaches it after 4,294,967,295
 * reconsideration cycles of being served worse than they asked for, which at
 * `ActionSystem.schedule.intervalTicks` is 8.6e10 ticks and is not a session
 * anyone will play -- but a counter that silently reads *zero* after counting
 * for that long is the one failure mode a diagnostic must not have, and the
 * branch costs a comparison on a path that only runs when a substitution
 * actually happened.
 */
const SUBSTITUTION_COUNT_MAX = 0xffff_ffff;

/**
 * How often each prisoner was **served worse than they asked for** -- issue
 * #435, [ADR 0041](../../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
 * open question 2.
 *
 * ## What it counts, and why per prisoner
 *
 * Since ADR 0041 decision 1 a prisoner whose best action cannot resolve a
 * target takes the next-best one that can, so the interesting event stopped
 * being *nobody was served* and started being *this prisoner was served worse*.
 * `ActionMetrics.unmetDemandCycles` still counts the first and is unchanged;
 * nothing counted the second, which is what
 * [ADR 0062](../../../docs/adr/0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
 * open question 3 reports as the thing that blinded it: *"in a housed prison it
 * is 0 whether twelve prisoners are being quietly downgraded from the canteen
 * to their cell at every meal or nobody is"*.
 *
 * **Per prisoner rather than a population total, because the population total
 * cannot answer the question that matters.** ADR 0062's canteen residue is that
 * the *same* twelve prisoners lose the room every day; an aggregate would show
 * twelve downgrades a day either way and could not tell a rotation from a
 * caste. A named prisoner's own count can, which is the same standard
 * `tests/integration/contended-shower-fairness.test.ts` holds the fairness fix
 * to.
 *
 * ## The two numbers, and why the split is the cause rather than the degree
 *
 * - `substitutionCycles` -- every cycle in which this prisoner began an action
 *   ranked below their first choice.
 * - `contendedSubstitutionCycles` -- the subset in which the prison **had
 *   somewhere** to perform the first choice and this prisoner did not get it.
 *   The complement is a want the prison provides nowhere: no canteen has been
 *   built, no shower room stands.
 *
 * That boundary is `RoomInstanceRegistry.hasPlaceForUse`, which ADR 0062
 * decision 3 already forbids from reading a use claim, so it costs no extra
 * question -- `ActionSystem.planIdleSelection` has already asked it to order
 * the scan. It is the split a reader needs because the two have opposite
 * remedies: one says *build the room*, the other says *the room you built is
 * too small, or is always the same people's*.
 *
 * **What is deliberately not recorded is the degree** -- neither the score gap
 * between the wanted action and the taken one nor a wanted/taken pair matrix.
 * The gap is a difference of utilities at the instant of choosing, in
 * `deficit x effect` units that are not comparable across needs, and for the
 * canteen it reduces to the hunger deficit itself, so it measures *when in the
 * meal block* the prisoner was refused rather than what the refusal cost them.
 * What the refusal costs is a rate -- `action.eat-in-cell` restores 3 a tick
 * against `action.eat-meal`'s 4 -- and the need level, which the save already
 * carries and the projection already publishes, is where that lands. A pair
 * matrix is `DEFAULT_ACTIONS.length` squared per prisoner, and the pair is
 * already recoverable from the regime block and the need levels of the cycle
 * that recorded it.
 *
 * ## Not persisted, and cleared by a restore
 *
 * Issue #435 puts a save-schema change out of scope, and the counters are
 * diagnostics rather than state any system reads back: nothing here is an input
 * to a decision, so a restored session behaves identically whatever these hold.
 * They are **cleared** on a restore rather than carried, because a save's
 * component arrays are re-indexed into this runtime's store and a count left
 * standing would be attributed to whoever now occupies that slot -- the #111
 * shape, one component further out. `ActionMetrics.substitutionsCountedSinceTick`
 * is what makes the reset legible to a reader instead of silent.
 */
export class SubstitutionRecordComponent {
  /** Cycles in which this prisoner began an action ranked below their first choice, whatever the reason. */
  public readonly substitutionCycles: Uint32Array;
  /** The subset of those in which the prison provided the first choice somewhere and somebody else was in it. */
  public readonly contendedSubstitutionCycles: Uint32Array;

  private readonly slotDefaults: readonly SlotDefault[];

  public constructor(public readonly capacity: number) {
    this.substitutionCycles = new Uint32Array(capacity);
    this.contendedSubstitutionCycles = new Uint32Array(capacity);
    // A slot nobody has occupied has been served worse zero times, and so has a
    // prisoner admitted into a recycled one: the count is a fact about a
    // sentence, and the previous occupant's sentence is over.
    this.slotDefaults = [
      [this.substitutionCycles, 0],
      [this.contendedSubstitutionCycles, 0],
    ];
    fillEverySlot(this.slotDefaults);
  }

  /** Restores one slot to the values a never-occupied slot holds. Called when an index is allocated, so a recycled index cannot inherit its previous occupant's history. */
  public reset(index: number): void {
    resetOneSlot(this.slotDefaults, index);
  }

  /**
   * Empties every slot, which is what a restore does to this component.
   *
   * Distinct from `reset` on purpose: `reset` is per index and is the
   * recycling contract every other component here implements, while this is the
   * whole-component window boundary `ActionSystem` opens when a snapshot is
   * loaded. Written as `fill(0)` over the same `SlotDefault` list so a third
   * array cannot be cleared by one and forgotten by the other.
   */
  public clear(): void {
    fillEverySlot(this.slotDefaults);
  }

  /**
   * Records one cycle in which the prisoner at `index` began something worse
   * than their first choice.
   *
   * Both arrays are written here rather than by two callers, which is what
   * makes `contendedSubstitutionCycles <= substitutionCycles` true by
   * construction instead of by discipline.
   */
  public record(index: number, contended: boolean): void {
    const total = this.substitutionCycles[index]!;
    if (total < SUBSTITUTION_COUNT_MAX) this.substitutionCycles[index] = total + 1;
    if (!contended) return;
    const contendedTotal = this.contendedSubstitutionCycles[index]!;
    if (contendedTotal < SUBSTITUTION_COUNT_MAX) this.contendedSubstitutionCycles[index] = contendedTotal + 1;
  }
}
