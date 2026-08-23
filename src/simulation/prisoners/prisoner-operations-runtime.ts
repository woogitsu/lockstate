import { EntityStore, type EntityId } from '../entity/entity-store';
import { ComponentBitset } from '../entity/component';
import { EntityQuery } from '../entity/query';
import type { ActorIdentityMinter } from '../identity/actor-identity';
import type { Kernel } from '../kernel/kernel';
import type { NavigationSystem } from '../navigation/navigation-system';
import { ActionSystem, type PrisonerRouteContextResolver } from './action-system';
import type { ClassificationInput } from './classification';
import { ACTION_PHASES, CurrentActionComponent, PositionComponent, PrisonerColdState, PrisonerRecordComponent } from './components';
import { type AccommodationPolicy, IntakeSystem } from './intake-system';
import { NeedsComponent } from './needs';
import { NeedsDecaySystem } from './needs-system';
import { DEFAULT_REGIME_SCHEDULES, type RegimeSchedule } from './regime';
import { RoomInstanceRegistry } from './room-instance-registry';

const PRISONER_COMPONENT_ID = 0;

export interface PrisonerOperationsRuntimeOptions {
  readonly capacity: number;
  readonly navigation: NavigationSystem;
  readonly regimeSchedules?: readonly RegimeSchedule[];
  readonly accommodationPolicy?: AccommodationPolicy;
  readonly routeContextResolver?: PrisonerRouteContextResolver;
  /**
   * Actor-identity minting (`src/simulation/identity/`). The registry is
   * *not* owned here: it spans prisoners and staff, which live in two
   * separate `EntityStore`s, so it belongs to the session. Passing it in
   * only tells `IntakeSystem` to name an arrival at reception. Omitted, no
   * prisoner is named and no draw is made.
   */
  readonly identity?: ActorIdentityMinter;
  /** Overrides the stream identity draws from. Defaults to `ACTOR_IDENTITY_RNG_STREAM`; a session must have registered whichever name is used. */
  readonly identityRngStreamName?: string;
}

/**
 * Composes issue #24's prisoner lifecycle slice (needs, intake, regime-
 * driven utility-AI action selection) the same way `NavigationSystem`
 * composes issue #22's navigation scheduling: one object owning the
 * `EntityStore`-backed state and the `Kernel`-registrable systems that
 * operate on it. `registerOn(kernel)` wires all three systems; nothing
 * here spawns a prisoner or a room instance on its own -- that is real
 * session/scenario setup, not implicit default content.
 */
export class PrisonerOperationsRuntime {
  public readonly entityStore: EntityStore;
  public readonly roomInstances = new RoomInstanceRegistry();
  public readonly records: PrisonerRecordComponent;
  public readonly needs: NeedsComponent;
  public readonly currentAction: CurrentActionComponent;
  public readonly position: PositionComponent;
  public readonly coldState = new PrisonerColdState();

  public readonly intakeSystem: IntakeSystem;
  public readonly needsDecaySystem: NeedsDecaySystem;
  public readonly actionSystem: ActionSystem;

  private readonly bitset: ComponentBitset;
  private readonly query: EntityQuery;

  public constructor(options: PrisonerOperationsRuntimeOptions) {
    this.entityStore = new EntityStore(options.capacity);
    this.bitset = new ComponentBitset(options.capacity);
    this.query = new EntityQuery(this.entityStore, this.bitset);
    this.query.mask.require(PRISONER_COMPONENT_ID);

    this.records = new PrisonerRecordComponent(options.capacity);
    this.needs = new NeedsComponent(options.capacity);
    this.currentAction = new CurrentActionComponent(options.capacity);
    this.position = new PositionComponent(options.capacity);

    this.intakeSystem = new IntakeSystem(
      this.entityStore,
      this.query,
      this.records,
      this.coldState,
      this.roomInstances,
      options.accommodationPolicy,
      undefined,
      options.identity,
      options.identityRngStreamName,
    );
    this.needsDecaySystem = new NeedsDecaySystem(this.entityStore, this.query, this.needs);
    this.actionSystem = new ActionSystem(
      this.entityStore,
      this.query,
      this.records,
      this.needs,
      this.currentAction,
      this.position,
      this.coldState,
      this.roomInstances,
      options.navigation,
      options.regimeSchedules ?? DEFAULT_REGIME_SCHEDULES,
      options.routeContextResolver,
    );
  }

  public registerOn(kernel: Kernel): void {
    kernel.registerSystem(this.intakeSystem);
    kernel.registerSystem(this.needsDecaySystem);
    kernel.registerSystem(this.actionSystem);
  }

  /**
   * Snapshots the dynamic prisoner state this issue owns: entity
   * allocation, records, needs, current-action state, position, cold
   * accommodation/target metadata and room-instance occupancy. Does not
   * include `NavigationSystem`'s own pending path-request queue or
   * caches -- an in-flight route request is re-issued on the next
   * reconsideration cycle after a restore rather than being carried
   * across it, a deliberate, bounded scope decision (see
   * docs/adr/0007-navigation-work-budgets-and-flow-fields.md's caching
   * layer, which is likewise not part of any save today).
   */
  public getSnapshot() {
    return {
      entityStore: this.entityStore.getSnapshot(),
      records: this.records.getSnapshot(),
      needs: this.needs.getSnapshot(),
      currentAction: this.currentAction.getSnapshot(),
      position: this.position.getSnapshot(),
      coldState: this.coldState.getSnapshot(),
      roomInstanceOccupancy: this.roomInstances.getSnapshot(),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.entityStore.loadSnapshot(snapshot.entityStore);
    this.records.loadSnapshot(snapshot.records);
    this.needs.loadSnapshot(snapshot.needs);
    this.currentAction.loadSnapshot(snapshot.currentAction);
    this.position.loadSnapshot(snapshot.position);
    this.coldState.loadSnapshot(snapshot.coldState);
    this.roomInstances.loadSnapshot(snapshot.roomInstanceOccupancy);

    // Re-derive the query bitset from restored entity liveness -- the bitset
    // itself isn't part of the snapshot (it's a pure function of "is this
    // index alive," which EntityStore's own snapshot already captures).
    for (let index = 0; index <= this.entityStore.maxActiveIndex; index += 1) {
      if (this.entityStore.isIndexAlive(index)) this.bitset.add(index, PRISONER_COMPONENT_ID);
      else this.bitset.remove(index, PRISONER_COMPONENT_ID);
    }

    // Any entity mid-`'travelling'` referenced a path request in the
    // *previous* NavigationSystem instance's queue -- a fresh one (per this
    // method's own snapshot-scope doc) never received it and would never
    // resolve it, leaving that entity stuck forever. Drop back to 'idle' so
    // the next reconsideration cycle re-selects and re-requests instead.
    const travellingPhase = ACTION_PHASES.indexOf('travelling');
    const idlePhase = ACTION_PHASES.indexOf('idle');
    for (let index = 0; index <= this.entityStore.maxActiveIndex; index += 1) {
      if (!this.entityStore.isIndexAlive(index)) continue;
      if (this.currentAction.phase[index] !== travellingPhase) continue;
      this.currentAction.phase[index] = idlePhase;
      const entityId = this.entityStore.getIdByIndex(index);
      this.coldState.setActionTarget(entityId, undefined);
      this.coldState.setPathRequestId(entityId, undefined);
    }
  }

  /** Allocates a new prisoner entity and submits it to intake. Accommodation, classification and action selection happen over subsequent scheduled ticks -- there is no synchronous "spawn fully processed" shortcut. */
  public admitPrisoner(input: ClassificationInput, originTile: { readonly x: number; readonly y: number }): EntityId {
    const entityId = this.entityStore.spawn();
    const index = this.entityStore.getIndex(entityId);
    // `EntityStore.spawn` recycles freed indices, and nothing clears a
    // component array when an entity is destroyed, so an index can arrive
    // here still holding the previous occupant's needs, classification and
    // action plan (#111). Every index-keyed component is reset to the values
    // a never-occupied slot holds, so an admission into a recycled index is
    // indistinguishable from one into a fresh index.
    //
    // Only the index-keyed SoA components need this. `coldState` and the
    // actor-identity registry key off `EntityId`, whose generation `destroy`
    // bumps, so the new occupant's lookups miss rather than inherit -- and
    // this is emphatically not the release path: dropping a destroyed
    // prisoner's cold state, room occupancy, gang membership and component
    // bit is still unimplemented (#31).
    this.records.reset(index);
    this.needs.reset(index);
    this.currentAction.reset(index);
    this.position.reset(index);
    this.bitset.add(index, PRISONER_COMPONENT_ID);
    this.position.tileX[index] = originTile.x;
    this.position.tileY[index] = originTile.y;
    this.intakeSystem.submitIntake(entityId, input);
    return entityId;
  }
}
