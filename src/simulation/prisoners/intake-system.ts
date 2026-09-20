import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityId, EntityStore } from '../entity/entity-store';
import { EntityQuery } from '../entity/query';
import { ACTOR_IDENTITY_RNG_STREAM, type ActorIdentityMinter } from '../identity/actor-identity';
import type { Xoshiro128StarStar } from '../rng/xoshiro128starstar';
import { rateCellSharing, type CellSharingView } from './cell-sharing';
import { classifyPrisoner, type AdmissionRequest } from './classification';
import { drawSentenceLengthTicks, PRISONER_SENTENCE_RNG_STREAM, SENTENCE_UNSET_TICKS } from './sentence';
import {
  CLASSIFICATION_GROUP_IDS,
  classificationGroupIdFromIndex,
  classificationGroupIndex,
  type PrisonerColdState,
  PrisonerRecordComponent,
  intakeStageFromIndex,
  intakeStageIndex,
} from './components';
import type { RoomInstanceRegistry } from './room-instance-registry';

/**
 * The one thing intake tells the contraband substrate: an arrival has just been
 * classified, and may be concealing something
 * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)).
 *
 * A narrow injected port, exactly like `ActorIdentityMinter` above it and for
 * the same two reasons. `ContrabandRegistry` is **session** state -- it outlives
 * the prisoner slice and is snapshotted beside it, not inside it -- so this
 * module may not own one; and a fixture that stands up prisoners alone has no
 * contraband registry to hand over, so the collaborator is optional and intake
 * draws nothing at all without it. `NamedRngStreams.get` throws for a stream a
 * session never registered, which is what makes "optional" load-bearing rather
 * than tidy.
 */
export interface IntakeContrabandIntroducer {
  /** Called once per arrival, at the tick their `riskTier` is written and from the stage that writes it. */
  introduce(entityId: EntityId, riskTier: number, tick: number, rng: Xoshiro128StarStar): void;
}

/**
 * Which gang an arrival joins, if any --
 * [ADR 0103](../../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
 * decision 6.
 *
 * Optional and port-shaped for exactly the reasons
 * `IntakeContrabandIntroducer` above is: `GangRegistry` is session state that
 * outlives the prisoner slice, and a fixture that stands up prisoners alone
 * has no registry to hand over. Absent, intake assigns nobody and behaves
 * exactly as it did before ADR 0103.
 *
 * **No `rng` parameter, and that is the difference from the port above.**
 * ADR 0103 decision 5 adds no RNG stream, so the rule behind this port is a
 * function of recorded input; a session that wires it registers no seventh
 * stream and no existing seed's classification draw moves.
 */
export interface IntakeGangAssigner {
  /** Called once per arrival, at the tick their `classificationGroupIndex` is written and from the stage that writes it. */
  assign(entityId: EntityId, classificationGroupId: string, tick: number): void;
}

/**
 * What the player is told when a queued arrival finally gets a bed
 * ([#966](https://github.com/woogitsu/lockstate/issues/966) site 3) --
 * `IntakeSystem`'s mirror of `ResidentRelocationNotice`
 * (`src/simulation/events/resident-relocation-notice.ts`), and optional and
 * port-shaped for the same two reasons `IntakeContrabandIntroducer` above is:
 * the identity registry and the room catalog are session state that outlives
 * the prisoner slice, and a fixture that stands up prisoners alone has neither
 * to hand over. Absent, intake houses people exactly as it did before this
 * port existed and simply says nothing about it.
 *
 * **A port rather than `SimulationEventLog` and `ActorIdentityMinter` taken
 * directly**, because naming this prisoner needs a *read* of an already-minted
 * name and `ActorIdentityMinter`'s own comment says it is narrow "so that
 * `IntakeSystem` cannot rename or release, only name a new arrival" -- read
 * access is a different capability than mint access, and this system is not
 * the place to widen it. `createIntakeHousedNotice`
 * (`src/simulation/events/intake-housed-notice.ts`) is where the identity
 * registry's read side, the room catalog and the event log meet, composed at
 * the session root exactly as `createResidentRelocationNotice` is.
 */
export interface IntakeHousedNotice {
  /** Called once per arrival, at the tick their `RoomInstanceRegistry.assign` succeeds and from the stage that calls it. */
  announce(entityId: EntityId, roomCatalogId: string, tick: number): void;
}

export interface IntakeMetrics {
  readonly completedCount: number;
  readonly failedCount: number;
  /** Cumulative ticks any prisoner has spent waiting in accommodation-assignment because every matching room instance was full -- observable unmet demand, not hidden success. */
  readonly accommodationBacklogTicks: number;
}

/** One room type an arrival of some classification group may be housed in, and the object capability that room must offer to hold them. */
export interface AccommodationTarget {
  readonly roomCatalogId: string;
  readonly requiredObjectCapability?: string;
}

export interface AccommodationPolicy {
  /**
   * The room types new arrivals of a classification group may be housed in,
   * **most preferred first**.
   *
   * An ordered list rather than the single target this returned before
   * (#306), because a single target makes the terminal `'failed'` stage
   * reachable from a prison the player built by hand and cannot un-build out
   * of. See `IntakeSystem.resolveExistingTarget` for what consumes the order
   * and, precisely, for the one condition under which a later entry is taken.
   *
   * Every entry is a real accommodation, not a consolation: an arrival housed
   * against a fallback entry is `'completed'`, holds a room instance and is
   * driven by `ActionSystem` exactly as one housed against the first entry is.
   */
  resolveTargets(classificationGroupId: string): readonly AccommodationTarget[];
}

const CELL: AccommodationTarget = { roomCatalogId: 'room.cell', requiredObjectCapability: 'sleep-surface' };
const SOLITARY_CELL: AccommodationTarget = { roomCatalogId: 'room.solitary-cell', requiredObjectCapability: 'sleep-surface' };

/**
 * Both housing types, for both groups, each group's own type first.
 *
 * The preference is unchanged from #306 -- high-risk to solitary, everyone
 * else to an ordinary cell -- and in a prison holding both types this policy
 * is **indistinguishable** from the one it replaces, because a later entry is
 * only ever consulted for a room type of which the prison holds no instance at
 * all (`IntakeSystem.resolveExistingTarget`).
 *
 * The second entry is what makes the guard at the command boundary honest.
 * `hasAccommodationTarget` cannot predict the classification draw -- it happens
 * two stages later, on the `prisoners.classification` stream -- so the only
 * guard it can offer that is true whatever that draw returns is "every group
 * has somewhere to go". With one target per group that guard would refuse
 * every admission into a prison holding a single housing type, including the
 * ordinary-cell prison the shipped game is built around
 * (`tests/integration/object-placement-loop.test.ts`). With both types listed
 * for both groups it refuses none of them, and no draw can strand anybody.
 *
 * It is deliberately not a *balance* statement about who ought to sleep where:
 * ADR 0028 decision 8 names the missing fallback as one of the two places this
 * defect could be fixed, and this is the one that neither changes the stage
 * machine nor takes accommodation away from a prison that already worked.
 */
export const DEFAULT_ACCOMMODATION_POLICY: AccommodationPolicy = {
  resolveTargets(classificationGroupId) {
    return classificationGroupId === 'high-risk' ? [SOLITARY_CELL, CELL] : [CELL, SOLITARY_CELL];
  },
};

/**
 * Every accommodation an arrival could be housed in, whatever the
 * classification draw returns: the union of every group's targets, deduplicated
 * on the pair the registry is asked for.
 *
 * The read-only counterpart of `IntakeSystem.resolveExistingTarget`, and it
 * exists so that a *reader* of the prison -- the status strip's accommodation
 * capacity (`src/simulation/presentation/status-strip-projection.ts`) -- asks
 * the same authored question the stage asks, rather than naming `room.cell` in
 * a condition of its own. `AGENTS.md` boundary 6: which room types house a
 * resident is content, and the content lives in an `AccommodationPolicy`.
 *
 * **The union, and not one group's list**, for the reason
 * `hasAccommodationTarget` gives: the draw picks the group two stages after
 * admission, so the only true statement about a room instance ahead of the draw
 * is "some arrival could be housed here". Under
 * `DEFAULT_ACCOMMODATION_POLICY` that is `room.cell` and `room.solitary-cell`,
 * both requiring `'sleep-surface'` -- both groups list both, in opposite
 * orders, and this collapses the two orders into one set.
 *
 * **Deduplicated on `(roomCatalogId, requiredObjectCapability)` rather than on
 * the room id alone.** Two groups may name one room type under different
 * capability requirements, and those are two different questions to ask of an
 * instance; collapsing them onto the room id would silently drop one. Nothing
 * in the shipped policy does this -- it is what keeps a custom policy that does
 * from reading wrong.
 *
 * Deterministic and draws nothing: `CLASSIFICATION_GROUP_IDS` order, then the
 * policy's own declared order within each group. The `Set` is membership-tested
 * and never iterated (`docs/DETERMINISM.md`).
 */
/**
 * The first room type in a classification group's preference order of which
 * `roomInstances` holds **any** instance, or `undefined` when it holds none of
 * them.
 *
 * Extracted from `IntakeSystem.resolveExistingTarget` (issue #80) so
 * `SanctionSystem` can ask the identical question when a solitary term ends
 * and a sanctioned prisoner is returned to ordinary housing -- the same
 * "which room does this classification group belong in" question intake asks
 * on admission, asked again on release, from one definition rather than two
 * that could disagree about what a group's targets are. See
 * `IntakeSystem.resolveExistingTarget`'s own doc comment for why "any
 * instance" and not "an available instance" is the right question, and for
 * the guarantee `hasAccommodationTarget` rests on it.
 *
 * Draws nothing and iterates an authored array, so no named stream moves and
 * no scenario fingerprint depends on it.
 */
export function firstAvailableAccommodationTarget(
  policy: AccommodationPolicy,
  roomInstances: RoomInstanceRegistry,
  classificationGroupId: string,
): AccommodationTarget | undefined {
  for (const target of policy.resolveTargets(classificationGroupId)) {
    if (roomInstances.allByRoomCatalogId(target.roomCatalogId).length > 0) return target;
  }
  return undefined;
}

/**
 * The identity of an accommodation target, as a string a `Map` or a `Set` can
 * key on: the room type **and** the capability it must offer, never the room
 * type alone.
 *
 * Extracted from `resolveAccommodationTargets` so that a second caller asking
 * "how many free places does this target have" keys its budget by exactly what
 * that function deduplicated by. Two spellings of this pair is how a reader
 * would come to credit one target with another's places.
 *
 * `identifierSchema` (`src/simulation/protocol/types.ts`) admits no `\u0000`,
 * and both halves of the pair are catalogue ids it validates, so the joined
 * key cannot collide with a different pair.
 */
export function accommodationTargetKey(target: AccommodationTarget): string {
  return `${target.roomCatalogId}\u0000${target.requiredObjectCapability ?? ''}`;
}

export function resolveAccommodationTargets(
  policy: AccommodationPolicy = DEFAULT_ACCOMMODATION_POLICY,
): readonly AccommodationTarget[] {
  const targets: AccommodationTarget[] = [];
  const seen = new Set<string>();

  for (const classificationGroupId of CLASSIFICATION_GROUP_IDS) {
    for (const target of policy.resolveTargets(classificationGroupId)) {
      const key = accommodationTargetKey(target);
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(target);
    }
  }

  return targets;
}

/**
 * Deterministic intake pipeline (issue #24): each entity advances at most
 * one stage per scheduled tick, in ascending entity-id order (via
 * `EntityQuery`, never Map/Set iteration order). `accommodation-assignment`
 * is retry-able, not a hard failure, while any room instance of the
 * required type could still free up -- it only becomes `'failed'` when no
 * instance of that room type exists in the registry at all, a structural
 * gap retrying can never fix.
 */
export class IntakeSystem implements SystemRegistration {
  public readonly id = 'prisoners.intake';
  public readonly order = 50;
  public readonly schedule = { intervalTicks: 5, phaseTicks: 0 };

  private completedCount = 0;
  private failedCount = 0;
  private accommodationBacklogTicks = 0;

  public constructor(
    private readonly store: EntityStore,
    private readonly query: EntityQuery,
    private readonly records: PrisonerRecordComponent,
    private readonly coldState: PrisonerColdState,
    private readonly roomInstances: RoomInstanceRegistry,
    private readonly accommodationPolicy: AccommodationPolicy = DEFAULT_ACCOMMODATION_POLICY,
    private readonly rngStreamName = 'prisoners.classification',
    /**
     * Optional actor-identity minting (`src/simulation/identity/`). Left
     * out entirely, intake behaves exactly as before and draws nothing --
     * which matters, because `NamedRngStreams.get` throws for a stream the
     * session never registered, and a session that does not want names
     * should not have to register one.
     */
    private readonly identity?: ActorIdentityMinter,
    private readonly identityRngStreamName: string = ACTOR_IDENTITY_RNG_STREAM,
    /**
     * Optional contraband introduction (`src/simulation/contraband/introduction.ts`).
     * Left out entirely, intake behaves exactly as it did before ADR 0061 and
     * draws nothing on the contraband stream -- so a session that never
     * registers `contraband.introduction` is not obliged to.
     */
    private readonly contrabandIntroducer?: IntakeContrabandIntroducer,
    private readonly contrabandRngStreamName: string = 'contraband.introduction',
    /**
     * The stream a sentence length is drawn from when the admission did not
     * name one (#535 decision 5, `src/simulation/prisoners/sentence.ts`).
     *
     * A name and not an optional port, unlike `identity` and
     * `contrabandIntroducer` above, because there is no collaborator to leave
     * out -- the draw needs the stream and nothing else. **A session that has
     * not registered this stream is still never asked for it**, for the same
     * reason those two ports keep their sessions honest: the draw is made only
     * for an admission that omitted a length, and `admitPrisonerSchema`
     * requires `.positive()` of the length it carries, so every admission that
     * names one reaches `NamedRngStreams.get` exactly as often as it did
     * before this parameter existed: never.
     */
    private readonly sentenceRngStreamName: string = PRISONER_SENTENCE_RNG_STREAM,
    /**
     * Gang membership for this arrival
     * ([ADR 0103](../../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
     * decision 6). Absent, intake assigns nobody to a gang -- which is what it
     * did before ADR 0103 and what every fixture predating it expects.
     *
     * Last in the list, after the four optional collaborators above, so no
     * existing call site's positional arguments move.
     */
    private readonly gangAssigner?: IntakeGangAssigner,
    /**
     * What the player is told once this arrival gets a bed
     * ([#966](https://github.com/woogitsu/lockstate/issues/966) site 3).
     * Absent, intake houses people exactly as it always has and says nothing.
     *
     * Last in the list, after the five optional collaborators above, so no
     * existing call site's positional arguments move.
     */
    private readonly housedNotice?: IntakeHousedNotice,
  ) {}

  /**
   * Records what the admission asked for, and what it left to the simulation.
   *
   * `AdmissionRequest` rather than `ClassificationInput`: since #535 decision 5
   * the length is optional at the boundary, and an omitted one is stored as
   * `SENTENCE_UNSET_TICKS` for the `classification` stage to draw. That is a
   * write of the value the slot already holds -- `records.reset` runs one line
   * earlier in `admitPrisoner` -- and it is made explicitly rather than skipped
   * so that this method still writes every field it is responsible for, which
   * is what `tests/unit/prisoners-intake-system.test.ts`'s "already-admitted
   * prisoner" cases read it as doing.
   */
  public submitIntake(entityId: EntityId, input: AdmissionRequest): void {
    const index = this.store.getIndex(entityId);
    this.records.sentenceLengthTicks[index] = input.sentenceLengthTicks ?? SENTENCE_UNSET_TICKS;
    this.records.priorIncidentsAtIntake[index] = Math.min(255, input.priorIncidents);
    this.records.intakeStage[index] = intakeStageIndex('queued');
  }

  /** The arrival's own placement-relevant record. `index` is the caller's, so the hot path does not re-derive it. */
  private sharingViewOf(entityId: EntityId, index: number): CellSharingView {
    return { entityId, riskTier: this.records.riskTier[index]! };
  }

  /**
   * Placement-relevant records for a cell's current occupants, **skipping
   * any id that is no longer alive**.
   *
   * The liveness filter is required rather than defensive, **and the reason it
   * is required has been replaced by a better one.** It used to be that
   * `release` was never called for a destroyed prisoner (#31), so `occupants`
   * could hold the id of an entity that no longer existed. Since #441 it is
   * called -- `releasePrisoner` drops a departing prisoner from every instance
   * -- so the ordinary case is now that a dead id is *not* in this list. The
   * filter stays because it is the guard that makes that a fact rather than a
   * hope: `EntityStore.getIndex` masks without checking, so a single missed
   * removal anywhere would silently rate this cell against whoever currently
   * occupies the recycled slot. The caller's ascending-entity-id order is
   * preserved: this appends in input order and only ever drops.
   */
  private sharingViewsOf(occupants: readonly EntityId[]): readonly CellSharingView[] {
    const views: CellSharingView[] = [];
    for (const occupant of occupants) {
      if (!this.store.isAlive(occupant)) continue;
      views.push({ entityId: occupant, riskTier: this.records.riskTier[this.store.getIndex(occupant)]! });
    }
    return views;
  }

  public getMetrics(): IntakeMetrics {
    return { completedCount: this.completedCount, failedCount: this.failedCount, accommodationBacklogTicks: this.accommodationBacklogTicks };
  }

  /**
   * Whether *any* classification group's accommodation target has at least
   * one registered room instance -- the precondition that decides whether an
   * arrival can end up waiting or is certain to fail (#261 step 4).
   *
   * It is the same predicate `update` applies at `accommodation-assignment`,
   * asked one stage earlier and about every group rather than about the one
   * this arrival was classified into. The difference between the two answers
   * is the whole reason this exists, and it is a difference in *kind*:
   *
   * - `allByRoomCatalogId(...).length === 0` is `'failed'`, and `'failed'` is
   *   **terminal within the stage machine**. No branch of `update` matches it,
   *   so a prisoner who reaches it stays there -- measured: registering a
   *   matching room instance four hundred ticks later leaves the stage at
   *   `'failed'`. `ActionSystem` gates on `'completed'`
   *   (`action-system.ts`), so that record is inert.
   *   **It is no longer undeletable, and this sentence used to say it was**,
   *   on the grounds that nothing in `src/` released a prisoner (#31). Since
   *   #441 `PrisonerDischargeSystem` treats `'failed'` as a sentence-bearing
   *   stage, so the record ends when the sentence would have -- which changes
   *   how long the bad answer lasts and not that it is one, so the guard
   *   below is unchanged.
   * - An instance that exists but is full or lacks the capability is a
   *   *wait*: the stage is kept and retried, `accommodationBacklogTicks`
   *   counts it, and the arrival completes the moment a place frees up. That
   *   is still the state a zoned-but-*empty* cell produces, because a room with
   *   no bed derives `residentCapacity: 0` and no `'sleep-surface'` -- and it is
   *   now a state the player can leave: **placing a bed makes this find succeed
   *   on the next scheduled intake tick, with no change to the stage machine at
   *   all** (`docs/adr/0028-object-placement-and-derived-room-capacity.md`
   *   decision 8).
   *
   * So this is the line between "the prison cannot take this person yet" and
   * "the prison can never take this person", and the command boundary refuses
   * on the second rather than manufacturing an unrecoverable record. It does
   * not, and must not, predict *which* group the arrival will be classified
   * into -- that is a `prisoners.classification` draw made two stages later,
   * and asking for it here would either move the draw or duplicate it.
   *
   * **The hole this used to leave open, and why it is closed rather than
   * narrowed.** This asked whether *some* group had a target, which is not the
   * question the boundary needs answered: the draw picks the group, so a guard
   * that passes on one group's behalf promises nothing about the group the
   * draw actually returns. Both directions were reachable and both were
   * measured on this tree:
   *
   * - A prison holding a zoned `room.solitary-cell` and no `room.cell` passed
   *   the old check, and **every** arrival the Intake panel produces was then
   *   classified `general-population`, resolved `room.cell`, found no instance
   *   and landed in the terminal `'failed'` stage. Measured: 2,000 of 2,000
   *   seeds, zero refusals recorded, `failedCount: 1`. Nothing about it was
   *   improbable -- the panel's request scores 0 and the screening variance
   *   clamps it to tier 0 or 1, so `general-population` is not merely likely
   *   but certain, and the trap was certain with it. The Rooms tab (#312)
   *   offers all 18 catalogued room types, `room.solitary-cell` among them,
   *   so zoning one first is an ordinary thing for a player to do.
   * - The mirror case, a `room.cell` prison and a `high-risk` arrival, is the
   *   one ADR 0028 recorded. It is **not** reachable from the panel, and that
   *   is provable rather than sampled: `classifyPrisoner` draws exactly one
   *   `nextInt(3)`, so the panel's figures admit three outcomes in total and
   *   all three clamp to tier 0 or 1. It is reachable from any wider
   *   `AdmitPrisoner`, whose schema permits `priorIncidents` up to 255 -- and
   *   a queued command is persisted in the save envelope as an unvalidated
   *   `jsonValue` and re-dispatched verbatim on restore, so that shape is a
   *   carrier that exists today rather than a future producer. Measured:
   *   `priorIncidents: 5`, a 300,000-tick sentence, 191 of 300 seeds terminal.
   *
   * Both close the same way, and it is one line rather than a special case:
   * **the guard and the stage now ask the same private question**
   * (`resolveExistingTarget`), so they cannot disagree about a prison. The
   * guard asks it for *every* group instead of some group, which is the only
   * form that is true whatever the draw returns, and the policy lists a
   * fallback per group so that "every group" is satisfied by any prison
   * holding either housing type. The property that buys: **if this returns
   * true, no classification outcome can reach `'failed'`** -- an arrival can
   * only be housed or wait. `tests/unit/prisoners-intake-system.test.ts`
   * asserts it over every combination of housing types and every group,
   * exhaustively, so it fails if either side of the pair drifts.
   *
   * Cheap by construction: `CLASSIFICATION_GROUP_IDS` has two members, each
   * resolves two targets and `allByRoomCatalogId` is the registry's cached,
   * per-type lookup, so this is at most four map reads. It is called once per
   * `AdmitPrisoner` command, never per tick.
   */
  public hasAccommodationTarget(): boolean {
    for (const classificationGroupId of CLASSIFICATION_GROUP_IDS) {
      if (this.resolveExistingTarget(classificationGroupId) === undefined) return false;
    }
    return true;
  }

  /**
   * The first room type in a group's preference order of which this prison
   * holds **any** instance, or `undefined` when it holds none of them.
   *
   * The single question behind both the boundary guard and the
   * `accommodation-assignment` stage, which is the whole of the fix: two
   * separate readings of "can this prison house this person" is what let the
   * boundary admit somebody the stage then stranded.
   *
   * **"Any instance", never "an available instance", and the difference is
   * load-bearing.** This is the structural test #306 drew the line on: a room
   * type the prison holds no instance of can never accommodate anybody, and no
   * amount of retrying changes that, so it is the one condition worth falling
   * back from. A preferred room that *exists* but is full, or that lacks
   * `'sleep-surface'` because no bed stands in it yet, is **not** fallen back
   * from -- the caller keeps that target and waits on it, `findBestAvailable`
   * returns nothing, `accommodationBacklogTicks` counts, and the arrival is
   * housed the moment the player frees a place or places a bed. Falling back
   * on a full room would quietly move a high-risk prisoner into general
   * population for one tick's congestion, which is a balance decision this
   * method is not entitled to make, and would erase the retryable/terminal
   * distinction #306 exists to preserve.
   *
   * Draws nothing and iterates an authored array, so no named stream moves and
   * no scenario fingerprint depends on it.
   */
  private resolveExistingTarget(classificationGroupId: string): AccommodationTarget | undefined {
    return firstAvailableAccommodationTarget(this.accommodationPolicy, this.roomInstances, classificationGroupId);
  }

  public update(context: SimulationContext): void {
    for (const entityId of this.query.execute()) {
      const index = this.store.getIndex(entityId);
      const stage = intakeStageFromIndex(this.records.intakeStage[index]!);

      if (stage === 'queued') {
        this.records.intakeStage[index] = intakeStageIndex('reception');
        continue;
      }

      if (stage === 'reception') {
        // Reception is where a real intake records who someone is, and it
        // is inside `EntityQuery.execute()`'s canonical ascending-entity-id
        // walk -- so the order names are minted in is a function of state,
        // not of the order prisoners happened to be admitted in a session.
        // `assign` is idempotent and draws nothing for an entity that
        // already has a name, so a replayed tick cannot shift the stream.
        if (this.identity !== undefined) {
          this.identity.assign('prisoner', entityId, context.rng.get(this.identityRngStreamName));
        }
        this.records.intakeStage[index] = intakeStageIndex('classification');
        continue;
      }

      if (stage === 'classification') {
        // The sentence, for an admission that did not name one (#535 decision
        // 5). Here rather than in the command handler, and here rather than at
        // `'reception'`, for three reasons that all point at the same line:
        //
        //   - It is inside `EntityQuery.execute()`'s canonical
        //     ascending-entity-id walk, exactly as the name minting above and
        //     the contraband introduction below are. So the order sentences are
        //     drawn in is a function of *state*, not of the order a player
        //     happened to press Admit or of how many commands shared a tick --
        //     which is the property the two draws either side of it are
        //     commented to defend, and the one a draw in `session-commands.ts`
        //     could not have offered.
        //   - Both readers of the value are the next two statements:
        //     `classifyPrisoner` reads it against
        //     `LONG_SENTENCE_THRESHOLD_TICKS`, and `sentenceEndTick` is the
        //     sum of it and the clock. Drawing it anywhere earlier would mean
        //     carrying a decided number through two stages for nobody.
        //   - `prisoners.sentence`, never `prisoners.classification`. An extra
        //     draw on the classification stream would shift every risk tier
        //     every seed has ever produced, one admission onward, for a reason
        //     that has nothing to do with screening variance. Isolated streams
        //     are what `docs/DETERMINISM.md` asks for and this is the case they
        //     are for.
        //
        //     This bullet used to end: *"with the drawn range entirely below
        //     `LONG_SENTENCE_THRESHOLD_TICKS`, the tier this stage assigns is
        //     bit-identical to the one it assigned before this line existed."*
        //     **That stopped being true when the owner ruled on #593** and
        //     `MIN_SENTENCE_DAYS`/`MAX_SENTENCE_DAYS` became 14 and 90 (ADR
        //     0079): 90 days is 216,000 ticks and the threshold is 200,000, so
        //     the seven drawable lengths from 84 days up now score the
        //     long-sentence point and the tier this stage assigns is *not*
        //     bit-identical to the pre-#541 one. The property was spent on
        //     purpose, and it is marked rather than deleted because it is the
        //     reason the stream is separate -- **what the separate stream still
        //     buys is unchanged and is the half that mattered**: the sentence
        //     draw does not move `prisoners.classification`'s position, so the
        //     screening variance of every seed is where it always was.
        if (this.records.sentenceLengthTicks[index] === SENTENCE_UNSET_TICKS) {
          this.records.sentenceLengthTicks[index] = drawSentenceLengthTicks(context.rng.get(this.sentenceRngStreamName));
        }
        const rng = context.rng.get(this.rngStreamName);
        const result = classifyPrisoner(
          { sentenceLengthTicks: this.records.sentenceLengthTicks[index]!, priorIncidents: this.records.priorIncidentsAtIntake[index]! },
          rng,
        );
        this.records.riskTier[index] = result.riskTier;
        this.records.classificationGroupIndex[index] = classificationGroupIndex(result.classificationGroupId);
        this.records.sentenceEndTick[index] = context.tick + this.records.sentenceLengthTicks[index]!;

        // Here rather than at `'reception'`, because the tier is what decides
        // both halves of the introduction and it does not exist one line
        // earlier. Inside `EntityQuery.execute()`'s ascending-entity-id walk
        // like the name minting above, so the order draws are made in is a
        // function of state; and after the record writes, so a reader of the
        // registry sees an arrival whose classification is already complete.
        if (this.contrabandIntroducer !== undefined) {
          this.contrabandIntroducer.introduce(entityId, result.riskTier, context.tick, context.rng.get(this.contrabandRngStreamName));
        }

        // Beside the introduction above and for the same reason it is here
        // rather than at `'reception'`: the classification is what decides it
        // and it does not exist one line earlier
        // ([ADR 0103](../../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
        // decision 6). Inside the same ascending-entity-id walk, and after the
        // record writes, so the registry and the record agree the moment
        // either is read. `result.classificationGroupId` rather than a second
        // derivation from the index just written -- one of the two spellings
        // would eventually be the stale one.
        //
        // **Draws nothing.** Unlike the introduction above it is handed no
        // stream, so wiring it moves no existing seed's screening variance
        // (ADR 0103 decision 5).
        this.gangAssigner?.assign(entityId, result.classificationGroupId, context.tick);

        this.records.intakeStage[index] = intakeStageIndex('accommodation-assignment');
        continue;
      }

      if (stage === 'accommodation-assignment') {
        // `classificationGroupIdFromIndex` rather than a second copy of
        // `CLASSIFICATION_GROUP_IDS` written out as a literal here: the index
        // is what the record stores and one of the two spellings would
        // eventually be the stale one.
        const groupId = classificationGroupIdFromIndex(this.records.classificationGroupIndex[index]!);

        // The same question `hasAccommodationTarget` asked at the command
        // boundary, asked here about this arrival's own group now that the
        // draw has happened. `undefined` means the prison holds no instance of
        // any room type this group may be housed in -- the structural gap
        // retrying can never close -- and it is the only route into `'failed'`,
        // which stays terminal (ADR 0028 decision 8): no branch below matches
        // it and none is added.
        //
        // Reaching it requires the boundary guard to have been bypassed or the
        // prison to have lost every housing room since the admission, because
        // the guard demands a target for *every* group and this needs one for
        // one group. That is the intended relationship between the two, and
        // `resolveExistingTarget`'s single definition is what keeps it true.
        const target = this.resolveExistingTarget(groupId);

        if (target === undefined) {
          this.records.intakeStage[index] = intakeStageIndex('failed');
          this.failedCount += 1;
          continue;
        }

        // Not `findAvailable`: that asks room type, an occupancy *count* and
        // an object capability, and never asks who is already in the cell
        // (#79). `findBestAvailable` hands the current occupants to a rating
        // and takes the best-rated free instance, ties going to the lowest
        // instance id -- so in a prison of single-occupancy cells, where
        // every free instance holds nobody, the choice is identical to
        // `findAvailable`'s.
        const arrival = this.sharingViewOf(entityId, index);
        const instance = this.roomInstances.findBestAvailable(
          target.roomCatalogId,
          (occupants) => rateCellSharing(arrival, this.sharingViewsOf(occupants)),
          target.requiredObjectCapability,
        );
        if (instance === undefined) {
          this.accommodationBacklogTicks += 1;
          continue; // stay in accommodation-assignment; retried next scheduled tick
        }

        this.roomInstances.assign(instance.instanceId, entityId);
        this.coldState.setAccommodation(entityId, instance.instanceId);
        this.records.intakeStage[index] = intakeStageIndex('completed');
        this.completedCount += 1;
        // Issue #966 site 3: the tick a queued arrival stops waiting is the
        // tick a bed exists to say so about -- `target.roomCatalogId` is the
        // type `findBestAvailable` just matched `instance` against, so this
        // names the room the assignment above actually claimed rather than
        // re-deriving it from the instance afterwards.
        this.housedNotice?.announce(entityId, target.roomCatalogId, context.tick);
      }
    }
  }
}
