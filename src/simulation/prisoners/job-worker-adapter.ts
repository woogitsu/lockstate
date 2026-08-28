import type { EntityId } from '../entity/entity-store';
import type { JobWorkerAdapter } from '../operations/job-system';
import type { RouteContext } from '../navigation/route-context';
import { tileCoordinate, type TilePosition } from '../world/coordinates';
import { classificationGroupIdFromIndex } from './components';
import { DEFAULT_PRISONER_ROUTE_CONTEXT_RESOLVER, type PrisonerRouteContextResolver } from './action-system';
import type { PrisonerOperationsRuntime } from './prisoner-operations-runtime';

/**
 * Bridges #24's `PrisonerOperationsRuntime` (entity positions,
 * classification) to #25's generic `JobWorkerAdapter` -- so a session can
 * opt specific prisoners into job labor (`JobWorkerPool.register`) without
 * `operations/` depending on any specific entity/gameplay model. No
 * prisoner is registered as a worker by default; that is a session/
 * scenario/future-regime decision, not implicit behavior.
 */
export class PrisonerJobWorkerAdapter implements JobWorkerAdapter {
  public constructor(
    private readonly prisoners: PrisonerOperationsRuntime,
    private readonly routeContextResolver: PrisonerRouteContextResolver = DEFAULT_PRISONER_ROUTE_CONTEXT_RESOLVER,
  ) {}

  public getPositionTile(entityId: EntityId): TilePosition {
    const index = this.prisoners.entityStore.getIndex(entityId);
    return { x: tileCoordinate(this.prisoners.position.tileX[index]!), y: tileCoordinate(this.prisoners.position.tileY[index]!) };
  }

  /**
   * Moves a worker, and **ends whatever walk they were on**
   * ([ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)).
   *
   * The cancellation is the whole reason this is not two assignments. A walk
   * writes the tile once per tile crossed, so a job placement that only wrote
   * the destination would be dragged back onto the route the prisoner was
   * walking before it, one tile at a time, and the prisoner would arrive at a
   * canteen they were pulled off the way to. The rule the store expects is
   * therefore "an external write to a walker's tile ends the walk", and this is
   * the one place outside `prisoners/` that makes such a write.
   */
  public setPositionTile(entityId: EntityId, tile: TilePosition): void {
    const index = this.prisoners.entityStore.getIndex(entityId);
    this.prisoners.locomotion.cancelWalk(index);
    this.prisoners.position.tileX[index] = tile.x;
    this.prisoners.position.tileY[index] = tile.y;
  }

  public getRouteContext(entityId: EntityId): RouteContext {
    const index = this.prisoners.entityStore.getIndex(entityId);
    const classificationGroupId = classificationGroupIdFromIndex(this.prisoners.records.classificationGroupIndex[index]!);
    return this.routeContextResolver(classificationGroupId, this.prisoners.records.riskTier[index]!);
  }
}
