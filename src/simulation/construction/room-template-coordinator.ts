import type { RoomTemplatePlan } from '../../content/room-template-catalog';
import type { SystemRegistration, SimulationContext } from '../kernel/system';
import type { PlacedObjectRegistry } from '../objects/placed-object-registry';
import type { ObjectPlacementService } from '../objects/object-placement-service';
import { objectFootprintTiles, tileKey } from '../objects/placed-object';
import type { RoomZoningService } from '../rooms/zoning';
import type { SparseWorld } from '../world/sparse-world';
import type { ConstructionSystem } from './system';
import { createRoomTemplateBuildPlan } from './room-template-build-plan';
import { BUILDABLE_REGISTRY } from './definition';
import { validateRoomTemplatePlacement, type RoomTemplatePlacement } from './room-template-placement';

export interface PendingRoomTemplate {
  readonly templateId: RoomTemplatePlan['id'];
  readonly origin: RoomTemplatePlan['origin'];
  readonly mirrorX: boolean;
  readonly sequence: number;
}

/** Optional in V7 saves: older sessions have no in-flight template gestures. */
export interface RoomTemplateCoordinatorSnapshot {
  readonly version: 1;
  readonly pending: readonly PendingRoomTemplate[];
}

/** Finishes zoning only after every authored shell order has actually built. */
export class RoomTemplateCoordinator implements SystemRegistration {
  public readonly id = 'room-templates';
  public readonly order = 101;
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };
  private pending: PendingRoomTemplate[] = [];

  public constructor(
    private readonly world: SparseWorld,
    private readonly construction: ConstructionSystem,
    private readonly roomZoning: RoomZoningService,
    private readonly placedObjects: PlacedObjectRegistry,
    private readonly objectPlacement: ObjectPlacementService,
  ) {}

  public preflight(plan: RoomTemplatePlan): RoomTemplatePlacement {
    const active = this.construction.allOrders().filter((order) =>
      order.state !== 'cancelled' && order.state !== 'failed' && order.state !== 'completed');
    const objectClaims = new Set<string>();
    const structureClaims = new Set<string>();
    for (const order of active) {
      const objectId = BUILDABLE_REGISTRY.get(order.definitionId)?.placesObjectId;
      if (objectId === undefined) {
        structureClaims.add(tileKey(order.location));
        continue;
      }
      const definition = this.placedObjects.definitionOf(objectId);
      if (definition === undefined) {
        objectClaims.add(tileKey(order.location));
        continue;
      }
      // ObjectPlacementService reserves every square of an in-flight object's
      // footprint, not just its anchor. The template preflight must agree.
      for (const tile of objectFootprintTiles(definition, order.location, 0)) {
        objectClaims.add(tileKey(tile));
      }
    }
    return validateRoomTemplatePlacement(
      this.world,
      plan,
      (tile) => this.placedObjects.isTileOccupied(tile) || objectClaims.has(tileKey(tile)),
      (tile) => structureClaims.has(tileKey(tile)),
    );
  }

  public place(request: PendingRoomTemplate): RoomTemplatePlacement {
    const built = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence);
    const verdict = this.preflight(built.plan);
    if (!verdict.ok) return verdict;
    // An all-footprint preflight precedes the first mutation. If a build rule
    // still rejects a shell order, cancel earlier orders before any tick runs.
    const accepted: string[] = [];
    for (const order of built.orders.slice(0, built.shellOrderIds.length)) {
      this.construction.submitOrder(order);
      if (order.state === 'failed') {
        for (const id of accepted) this.construction.cancelOrder(id);
        return { ok: false, reason: 'structure-occupied', tile: order.location };
      }
      accepted.push(order.id);
    }
    for (const id of accepted) this.construction.registerTransactionOrder(id, `room-template-${request.sequence}`);
    this.pending.push({ ...request, origin: { ...request.origin } });
    this.pending.sort((a, b) => a.sequence - b.sequence);
    return { ok: true };
  }

  public update(context: SimulationContext): void {
    const remaining: PendingRoomTemplate[] = [];
    for (const request of this.pending) {
      const built = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence);
      const states = built.shellOrderIds.map((id) => this.construction.getOrder(id)?.state);
      if (states.some((state) => state === undefined || state === 'cancelled' || state === 'failed')) {
        // A grouped room gesture must not keep building a partial shell after
        // one member is lost. This includes completed orders: cancelOrder
        // reverses their world geometry as it does for construction Undo.
        for (const id of built.shellOrderIds) {
          const order = this.construction.getOrder(id);
          if (order !== undefined && order.state !== 'cancelled' && order.state !== 'failed') {
            this.construction.cancelOrder(id);
          }
        }
        continue;
      }
      if (states.some((state) => state !== 'completed')) {
        remaining.push(request);
        continue;
      }
      const zoned: RoomTemplatePlan['zones'][number][] = [];
      let refused = false;
      for (const zone of built.plan.zones) {
        const outcome = this.roomZoning.zone({
          roomCatalogId: zone.roomId,
          x: zone.x, y: zone.y, width: zone.width, height: zone.height,
        }, context.tick);
        if (outcome.kind === 'refused') {
          // A row is one gesture: a later room refusing must not leave the
          // earlier members designated while its pending obligation vanishes.
          for (const previous of zoned.reverse()) this.roomZoning.unzone(previous, context.tick);
          for (const id of built.shellOrderIds) this.construction.cancelOrder(id);
          refused = true;
          break;
        }
        zoned.push(zone);
      }
      if (refused) continue;
      for (const order of built.orders.slice(built.shellOrderIds.length)) {
        this.objectPlacement.place({
          orderId: order.id,
          definitionId: order.definitionId,
          x: order.location.x,
          y: order.location.y,
        }, context.tick, request.sequence);
      }
    }
    this.pending = remaining;
  }

  public snapshot(): RoomTemplateCoordinatorSnapshot {
    return { version: 1, pending: this.pending.map((entry) => ({ ...entry, origin: { ...entry.origin } })) };
  }

  public loadSnapshot(snapshot: RoomTemplateCoordinatorSnapshot | undefined): void {
    this.pending = snapshot?.pending.map((entry) => ({ ...entry, origin: { ...entry.origin } })) ?? [];
    this.pending.sort((a, b) => a.sequence - b.sequence);
  }
}
