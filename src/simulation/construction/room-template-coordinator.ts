import { roomTemplateOriginFitsSafeCoordinates, type RoomTemplatePlan } from '../../content/room-template-catalog';
import type { TemplateQuarterTurns } from '../../content/room-template-rotation-geometry';
import type { SystemRegistration, SimulationContext } from '../kernel/system';
import type { PlacedObjectRegistry } from '../objects/placed-object-registry';
import type { ObjectPlacementService } from '../objects/object-placement-service';
import type { DoorRegistry } from '../navigation/door';
import { objectFootprintTiles, tileKey } from '../objects/placed-object';
import type { RoomZoningService } from '../rooms/zoning';
import type { SparseWorld } from '../world/sparse-world';
import { tileCoordinate, type TilePosition } from '../world/coordinates';
import { tileAcrossEdge, type ConstructionSystem } from './system';
import { createRoomTemplateBuildPlan } from './room-template-build-plan';
import { BUILDABLE_REGISTRY, occupiesTileEdge } from './definition';
import { resolveBuildEdge } from './build-order';
import type { BuildOrder } from './build-order';
import { validateRoomTemplatePlacement, type RoomTemplatePlacement } from './room-template-placement';

export interface PendingRoomTemplate {
  readonly templateId: RoomTemplatePlan['id'];
  readonly origin: RoomTemplatePlan['origin'];
  readonly mirrorX: boolean;
  /** Absent in older pending saves; those gestures remain unrotated. */
  readonly quarterTurns?: TemplateQuarterTurns;
  readonly sequence: number;
}

/** Optional in V7 saves: older sessions have no in-flight template gestures. */
export interface RoomTemplateCoordinatorSnapshot {
  readonly version: 1;
  readonly pending: readonly PendingRoomTemplate[];
  /** Additive V7 field: older saves without undone gestures restore an empty list. */
  readonly undone?: readonly PendingRoomTemplate[];
  readonly completed?: readonly PendingRoomTemplate[];
}

/** Finishes zoning only after every authored shell order has actually built. */
export class RoomTemplateCoordinator implements SystemRegistration {
  public readonly id = 'room-templates';
  public readonly order = 101;
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };
  private pending: PendingRoomTemplate[] = [];
  private undone: PendingRoomTemplate[] = [];
  private completed: PendingRoomTemplate[] = [];

  public constructor(
    private readonly world: SparseWorld,
    private readonly construction: ConstructionSystem,
    private readonly roomZoning: RoomZoningService,
    private readonly placedObjects: PlacedObjectRegistry,
    private readonly objectPlacement: ObjectPlacementService,
    private readonly doors: DoorRegistry,
  ) {}

  public preflight(plan: RoomTemplatePlan): RoomTemplatePlacement {
    const active = this.construction.allOrders().filter((order) =>
      order.state !== 'cancelled' && order.state !== 'failed' && order.state !== 'completed');
    const objectClaims = new Set<string>();
    const structureClaims = new Set<string>();
    const edgeApproachClaims = new Set<string>();
    // Shell orders claim only perimeter tiles. Until zoning completes, the
    // interior is still empty world, but it belongs to the same atomic plan.
    const pendingPlans = this.pending.map((request) => this.planFor(request));
    for (const order of active) {
      const objectId = BUILDABLE_REGISTRY.get(order.definitionId)?.placesObjectId;
      if (objectId === undefined) {
        structureClaims.add(tileKey(order.location));
        const definition = BUILDABLE_REGISTRY.get(order.definitionId);
        if (definition !== undefined && order.footprint !== 'square' && occupiesTileEdge(definition)) {
          const across = tileAcrossEdge(order.location, resolveBuildEdge(order));
          if (across !== undefined) edgeApproachClaims.add(tileKey(across));
        }
        continue;
      }
      const definition = this.placedObjects.definitionOf(objectId);
      if (definition === undefined) {
        objectClaims.add(tileKey(order.location));
        continue;
      }
      // ObjectPlacementService reserves every square of an in-flight object's
      // footprint, not just its anchor. The template preflight must agree.
      for (const tile of objectFootprintTiles(definition, order.location, order.objectOrientation ?? 0)) {
        objectClaims.add(tileKey(tile));
      }
    }
    const verdict = validateRoomTemplatePlacement(
      this.world,
      plan,
      (tile) => this.placedObjects.isTileOccupied(tile) || objectClaims.has(tileKey(tile)),
      (tile) => structureClaims.has(tileKey(tile)) || pendingPlans.some((pending) =>
        tile.x >= pending.origin.x && tile.x < pending.origin.x + pending.width &&
        tile.y >= pending.origin.y && tile.y < pending.origin.y + pending.height),
    );
    if (!verdict.ok) return verdict;
    // A later plan must not build its perimeter on the outside approach of an
    // earlier pending or completed doorway. Rectangle overlap misses both.
    for (const wall of plan.wallSquares) {
      const tile = { x: tileCoordinate(wall.x), y: tileCoordinate(wall.y) };
      if (!this.claimsRoomDoorApproachTile(tile)) continue;
      return { ok: false, reason: 'structure-occupied', tile: {
        x: tileCoordinate(wall.x), y: tileCoordinate(wall.y),
      } };
    }
    for (const door of plan.doorSquares) {
      if (door.y !== plan.origin.y + plan.height - 1) continue;
      const tile = { x: tileCoordinate(door.x), y: tileCoordinate(door.y) };
      if (edgeApproachClaims.has(tileKey(tile))) return { ok: false, reason: 'structure-occupied', tile };
    }
    return verdict;
  }

  /** The pending gesture reserves every square, even before its shell is visible. */
  public claimsPendingFootprint(tile: TilePosition, orderSequence: number | undefined): boolean {
    return this.pending.some((request) => {
      if (orderSequence === request.sequence) return false;
      const plan = this.planFor(request);
      return tile.x >= plan.origin.x && tile.x < plan.origin.x + plan.width &&
        tile.y >= plan.origin.y && tile.y < plan.origin.y + plan.height;
    });
  }

  public place(request: PendingRoomTemplate, tick: number): RoomTemplatePlacement {
    if (!roomTemplateOriginFitsSafeCoordinates(request.templateId, request.origin, request.quarterTurns ?? 0)) {
      return { ok: false, reason: 'unowned-land', tile: {
        x: tileCoordinate(request.origin.x), y: tileCoordinate(request.origin.y),
      } };
    }
    const built = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0);
    const verdict = this.preflight(built.plan);
    if (!verdict.ok) return verdict;
    // A plan with no shell orders has no construction tick to wait for. In
    // particular, the zero-cost Yard must be designated by its placement
    // press even while the clock is paused.
    if (built.shellOrderIds.length === 0) {
      const finished = this.finishPlan(request, built, tick);
      // A shell-free plan writes no construction transaction, but it is still
      // a new build gesture: older Undo and Redo entries cannot cross it.
      if (finished) this.construction.noteAcceptedBuildGestureWithoutOrders();
      return finished ? { ok: true } : {
        ok: false, reason: 'structure-occupied', tile: {
          x: tileCoordinate(request.origin.x), y: tileCoordinate(request.origin.y),
        },
      };
    }
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
    this.reconcileCancelledShells();
    this.undone = this.undone.filter((request) =>
      this.construction.canRedoOrdersTogether(this.shellOrderIds(request)));
    const remaining: PendingRoomTemplate[] = [];
    for (const request of this.pending) {
      const built = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0);
      const states = built.shellOrderIds.map((id) => this.construction.getOrder(id)?.state);
      if (states.some((state) => state !== 'completed')) {
        remaining.push(request);
        continue;
      }
      this.finishPlan(request, built, context.tick);
    }
    this.pending = remaining;
  }

  private finishPlan(request: PendingRoomTemplate, built: ReturnType<typeof createRoomTemplateBuildPlan>, tick: number): boolean {
    const zoned: RoomTemplatePlan['zones'][number][] = [];
    for (const zone of built.plan.zones) {
      const outcome = this.roomZoning.zone({
        roomCatalogId: zone.roomId,
        x: zone.x, y: zone.y, width: zone.width, height: zone.height,
      }, tick, request.sequence);
      if (outcome.kind === 'refused') {
        // A row is one gesture: a later room refusing must not leave the
        // earlier members designated while its pending obligation vanishes.
        for (const previous of zoned.reverse()) this.roomZoning.unzone(previous, tick);
        for (const id of built.shellOrderIds) this.construction.cancelOrder(id);
        return false;
      }
      zoned.push(zone);
    }
    const placedObjectOrderIds: string[] = [];
    for (const order of built.orders.slice(built.shellOrderIds.length)) {
      const outcome = this.objectPlacement.place({
        orderId: order.id,
        definitionId: order.definitionId,
        x: order.location.x,
        y: order.location.y,
        transactionId: `room-template-${request.sequence}`,
        ...(order.objectOrientation === undefined ? {} : { orientation: order.objectOrientation }),
      }, tick, request.sequence);
      if (outcome.kind === 'refused') {
        // The world may have changed after preflight and while the shell was
        // being built. Keep the template atomic: undo zoning and every order
        // already accepted for this gesture, including furniture, so a late
        // footprint collision cannot leave a paid room without its contents.
        for (const previous of zoned.reverse()) this.roomZoning.unzone(previous, tick);
        for (const id of placedObjectOrderIds) this.construction.cancelOrder(id);
        for (const id of built.shellOrderIds) this.construction.cancelOrder(id);
        return false;
      }
      placedObjectOrderIds.push(outcome.orderId);
    }
    this.completed.push({ ...request, origin: { ...request.origin } });
    return true;
  }

  /** Reserve either side's outside approach after a room plan is queued or completed. */
  public claimsRoomDoorApproach(order: BuildOrder): boolean {
    if (BUILDABLE_REGISTRY.get(order.definitionId)?.category !== 'wall') return false;
    if (order.footprint !== 'square' && resolveBuildEdge(order) !== 'north') return false;
    return this.claimsRoomDoorApproachTile(order.location, order.placementSequence);
  }

  public claimsRoomDoorApproachTile(tile: TilePosition, orderSequence?: number): boolean {
    const pendingClaims = this.pending.some((request) => {
      if (request.sequence === orderSequence) return false;
      const plan = this.planFor(request);
      return plan.doorSquares.some((door) =>
        (door.x === tile.x && (
          (door.y === plan.origin.y + plan.height - 1 && door.y + 1 === tile.y) ||
          (door.y === plan.origin.y && door.y - 1 === tile.y))) ||
        (door.y === tile.y && (
          (door.x === plan.origin.x && door.x - 1 === tile.x) ||
          (door.x === plan.origin.x + plan.width - 1 && door.x + 1 === tile.x))));
    });
    if (pendingClaims) return true;
    // A completed plan no longer has a pending request. Its registered door
    // and zoned interior are the durable evidence of the approach to protect.
    // Protect both the outside approach and the perimeter square occupied by
    // the door. A full-square wall on that door square otherwise overlays the
    // completed entrance even though the approach remains empty.
    const doorAt = (doorY: number, roomY: number): boolean => {
      if (!Number.isSafeInteger(doorY) || !Number.isSafeInteger(roomY)) return false;
      const doorTile = { x: tile.x, y: tileCoordinate(doorY) };
      const roomTile = { x: tile.x, y: tileCoordinate(roomY) };
      return this.doors.getByEdge(doorTile, 'top') !== undefined && this.world.getZoning(roomTile) !== 0;
    };
    const sideDoorAt = (doorX: number, roomX: number): boolean => {
      if (!Number.isSafeInteger(doorX) || !Number.isSafeInteger(roomX)) return false;
      const doorTile = { x: tileCoordinate(doorX), y: tile.y };
      const roomTile = { x: tileCoordinate(roomX), y: tile.y };
      return this.doors.getByEdge(doorTile, 'left') !== undefined && this.world.getZoning(roomTile) !== 0;
    };
    return doorAt(tile.y - 1, tile.y - 2) || doorAt(tile.y, tile.y - 1) ||
      doorAt(tile.y + 1, tile.y + 1) || doorAt(tile.y + 2, tile.y + 2) ||
      sideDoorAt(tile.x - 1, tile.x - 2) || sideDoorAt(tile.x, tile.x - 1) ||
      sideDoorAt(tile.x + 1, tile.x + 1) || sideDoorAt(tile.x + 2, tile.x + 2);
  }

  /** Command dispatch also runs while paused, so release invalidated plans then. */
  public reconcileCancelledShells(): void {
    this.completed = this.completed.filter((request) => {
      const ids = this.shellOrderIds(request);
      if (!ids.some((id) => this.construction.getOrder(id)?.state === 'cancelled')) return true;
      for (const zone of this.planFor(request).zones) this.roomZoning.unzone(zone, 0);
      if (this.construction.canRedoOrdersTogether(ids)) this.undone.push(request);
      return false;
    });
    this.pending = this.pending.filter((request) => {
      const shellOrderIds = this.shellOrderIds(request);
      if (!shellOrderIds.some((id) => {
        const state = this.construction.getOrder(id)?.state;
        return state === undefined || state === 'cancelled' || state === 'failed';
      })) return true;
      // A grouped room gesture must not keep a partial shell. This includes
      // completed orders, whose geometry cancelOrder reverses.
      for (const id of shellOrderIds) {
        const order = this.construction.getOrder(id);
        if (order !== undefined && order.state !== 'cancelled' && order.state !== 'failed') {
          this.construction.cancelOrder(id);
        }
      }
      if (this.construction.canRedoOrdersTogether(shellOrderIds)) this.undone.push(request);
      return false;
    });
  }

  /** Reconnect Redo's reapproved shell transaction to its saved room/furniture obligation. */
  public reconcileRedoneShells(): void {
    this.undone = this.undone.filter((request) => {
      const ids = this.shellOrderIds(request);
      const states = ids.map((id) => this.construction.getOrder(id)?.state);
      if (states.every((state) => state !== undefined && state !== 'cancelled' && state !== 'failed')) {
        this.pending.push(request);
        return false;
      }
      if (this.construction.canRedoOrdersTogether(ids)) return true;
      // A partial Redo must not leave a paid shell with no room obligation.
      for (const id of ids) {
        const order = this.construction.getOrder(id);
        if (order !== undefined && order.state !== 'cancelled' && order.state !== 'failed') this.construction.cancelOrder(id);
      }
      return false;
    });
    this.pending.sort((a, b) => a.sequence - b.sequence);
  }

  private shellOrderIds(request: PendingRoomTemplate): readonly string[] {
    return createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0).shellOrderIds;
  }

  private planFor(request: PendingRoomTemplate): RoomTemplatePlan {
    return createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0).plan;
  }

  public snapshot(): RoomTemplateCoordinatorSnapshot {
    const undone = this.undone.filter((request) => this.construction.canRedoOrdersTogether(this.shellOrderIds(request)));
    const copy = (entry: PendingRoomTemplate) => ({ ...entry, origin: { ...entry.origin } });
    const completed = this.completed;
    return { version: 1, pending: this.pending.map(copy), ...(undone.length === 0 ? {} : { undone: undone.map(copy) }), ...(completed.length === 0 ? {} : { completed: completed.map(copy) }) };
  }

  public loadSnapshot(snapshot: RoomTemplateCoordinatorSnapshot | undefined): void {
    this.pending = snapshot?.pending.map((entry) => ({ ...entry, origin: { ...entry.origin } })) ?? [];
    this.pending.sort((a, b) => a.sequence - b.sequence);
    this.undone = snapshot?.undone?.filter((request) =>
      this.construction.canRedoOrdersTogether(this.shellOrderIds(request)))
      .map((entry) => ({ ...entry, origin: { ...entry.origin } })) ?? [];
    this.completed = snapshot?.completed?.map((entry) => ({ ...entry, origin: { ...entry.origin } })) ?? [];
  }
}
