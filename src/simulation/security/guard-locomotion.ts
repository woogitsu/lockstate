import { LocomotionSystem } from '../locomotion';
import type { EntityId } from '../entity/entity-store';
import type { TilePosition } from '../world/coordinates';
import { resolveStaffRouteContext } from './access-policy';
import type { RouteContext } from '../navigation/route-context';
import type { GuardRoster } from './guard-roster';

/** The one question a guard's walk asks navigation, at the moment it crosses an edge (the ADR *When a route stops being valid*, ADR 0077). */
export interface GuardLocomotionNavigationSurface {
  canTraverseEdge(from: TilePosition, to: TilePosition, context: RouteContext): boolean;
}

/** The half of `DeploymentSystem` a finished walk reports to. */
export interface DeploymentArrivalSink {
  onArrivedAtPost(guardId: EntityId): void;
}

/** The half of `PatrolSystem` a finished walk reports to. */
export interface PatrolArrivalSink {
  onArrivedAtLegTarget(guardId: EntityId, tick: number): void;
}

/**
 * Wires `GuardRoster.locomotion` into the kernel as one `LocomotionSystem`,
 * exactly the shape `PrisonerOperationsRuntime` wires its own
 * ([ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md),
 * this decision's ADR 0088 for guards).
 *
 * ### Why arrival is dispatched here, and not inside either system
 *
 * A single walk can belong to `DeploymentSystem` (travelling to a post) or to
 * `PatrolSystem` (travelling a leg) -- the two already draw that line in
 * `DeploymentSystem.update`'s own "owned by PatrolSystem" guard, on exactly
 * the fact this reads: whether `getPatrolWaypointIndex` is set. Putting the
 * dispatch in a third, small module rather than in either system keeps
 * neither one holding a reference to the other, which matches how `new-session.ts`
 * already constructs them side by side with no dependency between them.
 *
 * ### Why this is a function returning a `LocomotionSystem`, not a class
 *
 * `LocomotionSystem` is already population-agnostic (`PrisonerOperationsRuntime`
 * is its only other caller) and takes exactly the closure this builds. A
 * second class here would duplicate `order`/`schedule`/`update` for no reason
 * -- the only thing specific to guards is what the closure does, not the
 * system shape.
 */
export function createGuardLocomotionSystem(
  guards: GuardRoster,
  navigation: GuardLocomotionNavigationSurface,
  deployment: DeploymentArrivalSink,
  patrol: PatrolArrivalSink,
  routeContextResolver: (staffRoleId: string) => RouteContext = (staffRoleId) => resolveStaffRouteContext(staffRoleId),
): LocomotionSystem {
  return new LocomotionSystem('security.locomotion', (ticks, tick) =>
    guards.locomotion.advance(
      ticks,
      /*
       * Re-validated at the edge, not trusted from when the route was
       * planned -- the same rule and the same reason `PrisonerOperationsRuntime`
       * wires for prisoners. The context is the guard's own staff role,
       * matching what `DeploymentSystem`/`PatrolSystem` planned the route
       * against (neither overrides the default resolver in production).
       */
      (guardId, from, to) => navigation.canTraverseEdge(from, to, routeContextResolver(guards.getStaffRoleId(guardId))),
      (guardId, tile) => guards.setTile(guardId, tile),
      (guardIds) => {
        for (const guardId of guardIds) {
          // A patrol leg names itself on the roster; a deployment walk to
          // (or back to) a post does not -- the same test
          // `DeploymentSystem.update` already makes to decide whose guard
          // this tick's arrival belongs to.
          if (guards.getPatrolWaypointIndex(guardId) !== undefined) patrol.onArrivedAtLegTarget(guardId, tick);
          else deployment.onArrivedAtPost(guardId);
        }
      },
    ),
    // 201, not the prisoner instance's default 200: `LocomotionSystem`'s own
    // header explains why a second population's instance may not share it.
    201,
  );
}
