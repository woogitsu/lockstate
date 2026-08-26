import type { ContentRegistry } from '../../content/registry';
import { defaultSecurityGradeRegistry, type SecurityGradeDefinition } from '../../content/security-grade-catalog';
import { constructedDoorIdFor, type DoorRegistry, type DoorSide } from '../navigation/door';
import { createGradedDoor } from '../security/sector';
import type { TilePosition } from '../world/coordinates';
import type { BuildEdge } from './build-order';
import { getBuildableDefinition } from './definition';
import type { DoorPlacementSink } from './system';

/**
 * What a completed `door-wooden` order actually puts in the world, and what a
 * cancelled one takes back out.
 *
 * ## The defect this closes
 *
 * `door-wooden` has been a Build-panel row since #16 that consumes a plank,
 * finishes, and changes nothing in the simulation. `docs/NAVIGATION.md` said
 * why, and it was two reasons rather than one: `edgeNumericIdFor` answered `0`
 * for it, *and* `ConstructionSystem` "is constructed with a `SparseWorld` and a
 * materials provider and holds no `DoorRegistry` at all, so a completed order
 * registers nothing whatever the category says". This class is the second half;
 * `definition.ts`'s `DOOR_EDGE_NUMERIC_ID` is the first.
 *
 * ## Why it is a service rather than a call inside `ConstructionSystem`
 *
 * For the reason `ObjectPlacementSink` is a port and not an import: so the
 * dependency arrow points one way. `ConstructionSystem` knows only that
 * something may want to be told a door order finished, in its own vocabulary
 * (`BuildEdge`, a `TilePosition`, a buildable id). Nothing about navigation,
 * security grades or door identity reaches it. That also keeps the awkward
 * half of the translation -- `BuildEdge` is `'north' | 'west'` and `DoorSide`
 * is `'top' | 'left'`, two names for the same two slots -- in exactly one
 * place.
 *
 * ## What it does not do
 *
 * It does not touch the world's edge layers: `finalizeConstruction` writes and
 * reverts those itself, on the same path a wall takes, so a door and a wall
 * cannot disagree about who owns an edge value. It does not decide *whether* a
 * door may be built there either -- `ConstructionSystem.submitOrder` already
 * ran the ownership and bounds checks a wall gets, and a door on an edge that
 * already holds one is answered below rather than refused, because by the time
 * this runs the plank is spent and the order is `completed`.
 */
export class DoorConstructionService implements DoorPlacementSink {
  public constructor(
    private readonly doors: DoorRegistry,
    private readonly grades: ContentRegistry<SecurityGradeDefinition> = defaultSecurityGradeRegistry,
  ) {}

  /**
   * A door order finished: the door goes into the registry.
   *
   * Called from `ConstructionSystem.finalizeConstruction`, which is inside a
   * scheduled update -- so **this must not throw**, and every way it could is
   * answered with `false` instead:
   *
   *  - **An edge that already holds a door.** `DoorRegistry.register` throws on
   *    one, and the state is reachable: two `door-wooden` orders on the same
   *    edge are both accepted (nothing refuses the second -- the same thing is
   *    true of two walls on one edge), and a `redo` can re-complete an order
   *    whose door is already back. The first door there wins and the second
   *    order is a plank spent for nothing, which is exactly what a second wall
   *    on an occupied edge already costs.
   *  - **An unknown security grade.** `createGradedDoor` throws a `RangeError`
   *    for one. `validateBuildableDoorReferences` makes that unreachable at
   *    import time; this is the belt to that brace, because the throw would
   *    fault the worker rather than fail a build.
   *
   * The return value is the same "the world had moved on" boolean
   * `ObjectPlacementSink` uses, and nothing in `src/` reads it -- it is what
   * makes the two unreachable paths *checkable* from a test rather than
   * silent.
   */
  public onDoorOrderCompleted(definitionId: string, location: TilePosition, edge: BuildEdge): boolean {
    const placement = getBuildableDefinition(definitionId).placesDoor;
    if (placement === undefined) return false;

    const side = doorSideForBuildEdge(edge);
    if (this.doors.getByEdge(location, side) !== undefined) return false;
    if (!this.grades.has(placement.securityGradeId)) return false;

    this.doors.register(
      createGradedDoor(
        constructedDoorIdFor(location, side),
        { ...location },
        side,
        placement.initialState,
        placement.securityGradeId,
        { costMultiplier: placement.costMultiplier },
        this.grades,
      ),
    );
    return true;
  }

  /**
   * A completed door order was cancelled or undone: the door leaves the
   * registry.
   *
   * The counterpart of `onDoorOrderCompleted`, and it exists for the reason
   * `ConstructionSystem.revertConstruction` reverses a wall's edge value:
   * `'completed'` is a cancellable state *because* completing changes the
   * world, and a door that could not be taken back would make the first
   * misplaced door permanent while a misplaced wall is not.
   *
   * **The registry keeps no record afterwards** -- no tombstone, no retained
   * access version -- which is what stops a rebuilt door on the same edge from
   * inheriting a dead one's state. It is safe to mint the same id again
   * precisely because nothing of the old one survives; see
   * `constructedDoorIdFor`.
   *
   * Identified by the edge rather than by an id carried on the order, because
   * the id *is* a function of that edge, and guarded on the id as well so an
   * order reverted after its edge was taken by a door somebody else built
   * cannot delete that one.
   */
  public onDoorOrderReverted(definitionId: string, location: TilePosition, edge: BuildEdge): boolean {
    if (getBuildableDefinition(definitionId).placesDoor === undefined) return false;

    const side = doorSideForBuildEdge(edge);
    const standing = this.doors.getByEdge(location, side);
    const id = constructedDoorIdFor(location, side);
    if (standing === undefined || standing.id !== id) return false;
    return this.doors.unregister(id);
  }
}

/**
 * The `DoorSide` a `BuildEdge` names.
 *
 * Two vocabularies for the same two storage slots, and the mapping is total
 * because both are closed two-member unions over the same fact:
 * `SparseWorld` keeps a `topEdge` and a `leftEdge` per tile, construction calls
 * them `'north'` and `'west'`, and navigation calls them `'top'` and `'left'`.
 * Neither name is renamed to match the other here, because both are load-bearing
 * where they live -- `BUILD_EDGES` is what a `PlaceBuildOrder` carries and what
 * the pointer tool produces, and `DoorSide` is what `doorEdgeKey` and every
 * navigation fixture speak.
 */
export function doorSideForBuildEdge(edge: BuildEdge): DoorSide {
  return edge === 'north' ? 'top' : 'left';
}
