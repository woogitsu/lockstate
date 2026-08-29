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

  public setPositionTile(entityId: EntityId, tile: TilePosition): void {
    const index = this.prisoners.entityStore.getIndex(entityId);
    this.prisoners.position.tileX[index] = tile.x;
    this.prisoners.position.tileY[index] = tile.y;
  }

  public getRouteContext(entityId: EntityId): RouteContext {
    const index = this.prisoners.entityStore.getIndex(entityId);
    const classificationGroupId = classificationGroupIdFromIndex(this.prisoners.records.classificationGroupIndex[index]!);
    return this.routeContextResolver(classificationGroupId, this.prisoners.records.riskTier[index]!);
  }
}
