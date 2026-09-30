import type { ComponentBitset } from '../entity/component';
import type { EntityId, EntityStore } from '../entity/entity-store';
import type { PrisonerColdState } from './components';
import type { RoomInstanceRegistry } from './room-instance-registry';

/**
 * Cancelling the route a departing prisoner was walking. `NavigationSystem`
 * satisfies it structurally; a narrow port keeps `prisoners/` from depending on
 * the navigation module for one call it makes at most once per departure.
 */
export interface PrisonerRouteCancelPort {
  cancelRequest(id: string): boolean;
  clearResult(id: string): void;
}

/**
 * Dropping a departing prisoner's name. `ActorIdentityRegistry` satisfies it,
 * and its own `release` doc already states the contract this call keeps:
 * *"**Required** when the actor is destroyed: `EntityStore` recycles the index,
 * so a retained entry would eventually hand the slot's next occupant the
 * previous occupant's name."* Until now nothing called it.
 */
export interface PrisonerNameReleasePort {
  release(kind: 'prisoner', entityId: EntityId): boolean;
}

/** Dropping a departing prisoner's gang membership. `GangRegistry` satisfies it. */
export interface PrisonerGangReleasePort {
  removeMember(entityId: EntityId): void;
}

/**
 * Ending a departing prisoner's errand. `ActionSystem` satisfies it through
 * `endCarryOnDeparture`.
 *
 * **This replaced `PrisonerWorkerReleasePort`, whose one implementation was
 * `JobWorkerPool.unregister`, when
 * [ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) decision 4
 * retired the pool.** The change is not cosmetic and the direction matters: a
 * departing carrier used to be *dropped from a set*, which left the job they
 * held `'assigned'` to an id that named nobody and a stock reservation nothing
 * would release. It is now *the job that ends*, with a
 * `CARRY_JOB_FAIL_REASONS` member of its own -- `'carrier-departed'` -- and the
 * goods compensated under ADR 0037.
 *
 * Total, like every port on this list: a prisoner on no errand is a keyed miss.
 */
export interface PrisonerCarryReleasePort {
  endCarryOnDeparture(entityId: EntityId): void;
}

/**
 * Taking a departing prisoner's contraband out of the prison with them.
 * `ContrabandRegistry` satisfies it through `departHolder`.
 *
 * Required from the moment contraband can be held by a prisoner at all
 * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)),
 * and it is the one store on this list that a *string* keys rather than an
 * `EntityId`: `ContrabandHolder.id` is the stringified id, so
 * `tests/unit/prisoner-release-completeness.test.ts` -- which walks the session
 * graph for the numeric id -- cannot see a leak here. That is the reason this
 * port is documented at length rather than added quietly: the executable gate
 * that makes the rest of this list complete does not cover it, and the next
 * store keyed by a stringified id will have the same hole.
 */
export interface PrisonerContrabandReleasePort {
  departHolder(kind: 'prisoner', id: string, atTick: number): readonly string[];
}

/**
 * Every store a departing prisoner has to be dropped from, named in one place.
 *
 * ## Why this type exists at all
 *
 * [ADR 0026](../../../docs/adr/0026-entity-id-lifetime.md) question 2 does not
 * ask whether release should drop these -- *"obviously it should"* -- it asks
 * **what mechanism keeps the list complete**, because a hand-written list is
 * the failure mode issue #111 already produced once (thirteen component arrays
 * initialised in one place and forgotten in the other). This type is half of
 * the answer and it is the weaker half: it makes the list *visible* and makes
 * every entry *required*, so a store cannot be dropped from the release path
 * by editing one line, but nothing about it notices a store that is never
 * added.
 *
 * The other half, and the one that does the work, is executable:
 * `tests/unit/prisoner-release-completeness.test.ts` walks the real session's
 * object graph by reflection, finds every `Map` and `Set` in it that mentions a
 * living prisoner's `EntityId`, and requires that none of them still mentions
 * it after the prisoner has left. A nineteenth store fails there whether or not
 * anybody remembered this file.
 *
 * ## The four optional entries, and why they are optional rather than required
 *
 * `identity`, `gangs`, `carry` and `navigation` are session-level: they
 * span prisoners and staff, or prisoners and haulage, and none of them is owned
 * by `PrisonerOperationsRuntime`. A fixture that stands up the prisoner slice
 * alone genuinely has none of them, exactly as `IntakeSystem`'s existing
 * optional `identity` collaborator does -- and an absent store holds no entry
 * to leak. `exactOptionalPropertyTypes` is on, so an omitted key and an
 * explicit `undefined` are different things and neither can be a silently
 * skipped required store.
 *
 * **The third of those four used to be `jobWorkers`** and was the labour pool
 * ADR 0093 decision 4 retired; `carry` is the errand port that replaced it, and
 * it is optional for the identical reason.
 */
export interface PrisonerReleaseSurfaces {
  readonly entityStore: EntityStore;
  readonly bitset: ComponentBitset;
  readonly coldState: PrisonerColdState;
  readonly roomInstances: RoomInstanceRegistry;
  readonly navigation?: PrisonerRouteCancelPort;
  readonly identity?: PrisonerNameReleasePort;
  readonly gangs?: PrisonerGangReleasePort;
  readonly carry?: PrisonerCarryReleasePort;
  /**
   * The walk store, keyed by component *index* rather than by entity id
   * ([ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)).
   *
   * Optional for the same reason the four ports above are: a caller that has
   * no locomotion has nothing to forget. Where one exists it must be told,
   * because the index it keys by returns to the free list two statements
   * later, and a walk left behind would step the next prisoner allocated into
   * that slot along a route the prisoner before them was walking.
   */
  readonly locomotion?: { forget(key: number): void };
  readonly contraband?: PrisonerContrabandReleasePort;
  readonly cellSharingAssessments?: { forget(entityId: EntityId): void };
}

/**
 * Removes one prisoner from the prison completely: every claim they hold is
 * given back, every store keyed by their id forgets them, and the entity is
 * destroyed so its index returns to the free list.
 *
 * Answers `false` -- and touches nothing -- for an id that does not name a
 * living entity, so a double release and a stale handle are both no-ops rather
 * than a partial teardown of whoever occupies that slot now.
 *
 * ## The order is load-bearing, step by step
 *
 * 1. **Liveness first.** Everything below reads the id, and
 *    `EntityStore.getIndex` masks without checking; a dead id would name
 *    whoever holds that slot.
 * 2. **The route, before the cold state that names it.** The request id lives
 *    in `PrisonerColdState`, so cancelling has to happen while it is still
 *    readable. Both halves are called: `cancelRequest` drops a request still
 *    queued, `clearResult` drops one already resolved and waiting to be
 *    collected -- a departing traveller can be in either state, and the one
 *    left behind is a `Map` entry nothing would ever remove.
 * 3. **Both room ledgers, through the registry's own scan.** See
 *    `RoomInstanceRegistry.releaseEntity` for why the cold state's two instance
 *    pointers are not a complete answer to where a prisoner is recorded.
 * 4. **The cold state itself**, once nothing else needs to read it.
 * 5. **Name, gang, errand, contraband** -- the four session-level stores.
 *    The errand step **ends the job rather than dropping the worker** (ADR
 *    0093 decision 4), which is why it is `endCarryOnDeparture` and not an
 *    `unregister`: see `PrisonerCarryReleasePort`.
 *    The contraband step needs the tick, which is why this function takes one;
 *    `departHolder` writes a movement-log entry, and an entry stamped with a
 *    tick the departure did not happen on would make the audit trail wrong
 *    rather than absent.
 * 6. **The component bit**, so `EntityQuery` stops matching the index even if
 *    something re-marks it alive.
 * 7. **The entity last.** `destroy` bumps the generation, after which the id
 *    names nobody and every step above would have become a lookup against the
 *    wrong key.
 *
 * ## What it deliberately does not do
 *
 * **It does not reset the index-keyed component arrays.** Those are reset when
 * an index is *allocated* (`PrisonerOperationsRuntime.admitPrisoner`, the fix
 * for #111), and stating the same defaults in a second place is how the two
 * copies come to disagree. The consequence is that a freed slot keeps its
 * previous occupant's record until it is reused, which is exactly what a
 * never-released prison already did with slots above the high-water mark, and
 * every reader in `src/` walks `0..maxActiveIndex` behind an `isIndexAlive`
 * guard.
 *
 * **It writes no history.** Whether a departed prisoner leaves a record behind
 * is ADR 0026 question 2's open half and a Phase 9 product question; nothing
 * here invents one.
 *
 * ## Determinism
 *
 * Draws nothing, reads no clock, and every step is a keyed delete whose result
 * does not depend on the order the map happens to hold. The caller's iteration
 * order therefore decides nothing about the outcome -- but it is canonical
 * anyway (`PrisonerDischargeSystem` walks `EntityQuery.execute`), because two
 * prisoners released on one tick free places that a later intake tick fills in
 * a fixed order.
 */
export function releasePrisoner(surfaces: PrisonerReleaseSurfaces, entityId: EntityId, atTick = 0): boolean {
  const { entityStore, bitset, coldState, roomInstances } = surfaces;
  if (!entityStore.isAlive(entityId)) return false;

  const index = entityStore.getIndex(entityId);

  const pathRequestId = coldState.getPathRequestId(entityId);
  if (pathRequestId !== undefined && surfaces.navigation !== undefined) {
    surfaces.navigation.cancelRequest(pathRequestId);
    surfaces.navigation.clearResult(pathRequestId);
  }

  // Before `destroy` recycles the index this store is keyed by.
  surfaces.locomotion?.forget(index);

  roomInstances.releaseEntity(entityId);
  surfaces.cellSharingAssessments?.forget(entityId);
  coldState.release(entityId);

  surfaces.identity?.release('prisoner', entityId);
  surfaces.gangs?.removeMember(entityId);
  surfaces.carry?.endCarryOnDeparture(entityId);
  surfaces.contraband?.departHolder('prisoner', String(entityId), atTick);

  bitset.clear(index);
  entityStore.destroy(entityId);
  return true;
}
