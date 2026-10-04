import { defaultRoomContentRegistry } from '../../content/room-catalog';
import { ROOM_TEMPLATE_IDS, roomTemplateOriginFitsSafeCoordinates, type RoomTemplatePlan } from '../../content/room-template-catalog';
import type { QuarterTurns } from '../../content/room-template-rotation';
import type { SystemRegistration, SimulationContext } from '../kernel/system';
import type { PlacedObjectRegistry } from '../objects/placed-object-registry';
import type { ObjectPlacementService } from '../objects/object-placement-service';
import { objectFootprintTiles, tileKey } from '../objects/placed-object';
import type { RoomZoningService, UnzoneRoomRefusal } from '../rooms/zoning';
import type { SparseWorld } from '../world/sparse-world';
import { tileCoordinate, type TilePosition } from '../world/coordinates';
import type { ConstructionSystem } from './system';
import { createRoomTemplateBuildPlan, instantiateRoomTemplateForConstruction } from './room-template-build-plan';
import { BUILDABLE_REGISTRY, DOOR_EDGE_NUMERIC_ID, WALL_EDGE_NUMERIC_ID } from './definition';
import { resolveBuildEdge, type BuildOrder } from './build-order';
import { validateRoomTemplatePlacement, type RoomTemplatePlacement } from './room-template-placement';

export type RoomTemplateReversalRefusal = UnzoneRoomRefusal | {
  readonly kind: 'refused'; readonly reason: 'object-ownership-unknown';
};

export interface PendingRoomTemplate {
  readonly templateId: RoomTemplatePlan['id'];
  readonly origin: RoomTemplatePlan['origin'];
  readonly mirrorX: boolean;
  readonly quarterTurns?: QuarterTurns;
  readonly sequence: number;
}

/** Optional in V7 saves: older sessions have no in-flight template gestures. */
export interface RoomTemplateCoordinatorSnapshot {
  readonly version: 1;
  readonly pending: readonly PendingRoomTemplate[];
  /** Additive V7 field: older saves without undone gestures restore an empty list. */
  readonly undone?: readonly PendingRoomTemplate[];
  /** Older saves without completed gesture metadata restore an empty list. */
  readonly completed?: readonly PendingRoomTemplate[];
}

function doorwayApproaches(plan: RoomTemplatePlan & { readonly quarterTurns?: QuarterTurns }) {
  const turns = plan.quarterTurns ?? 0;
  return plan.doorSquares.map((door) => {
    // Authored south entrances face +y; the northern bank of a cell row
    // carries orderTile on the room side and faces -y. Rotate that outward
    // vector with the plan, including entrances onto its shared corridor.
    const outward = door.orderTile === undefined ? 1 : -1;
    const dx = turns === 1 ? -outward : turns === 3 ? outward : 0;
    const dy = turns === 0 ? outward : turns === 2 ? -outward : 0;
    return { door, outside: { x: door.x + dx, y: door.y + dy } };
  });
}

const DOORWAY_INWARD_DIRECTIONS = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

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
  ) {}

  public preflight(plan: RoomTemplatePlan): RoomTemplatePlacement {
    const active = this.construction.allOrders().filter((order) =>
      order.state !== 'cancelled' && order.state !== 'failed' && order.state !== 'completed');
    const objectClaims = new Set<string>();
    const structureClaims = new Set<string>();
    const wallEdgeClaims = new Set<string>();
    const wallSquareClaims = new Set<string>();
    // Shell orders claim only perimeter tiles. Until zoning completes, the
    // interior is still empty world, but it belongs to the same atomic plan.
    const pendingPlans = this.pending.map((request) =>
      instantiateRoomTemplateForConstruction(request.templateId, request.origin, request.mirrorX, request.quarterTurns ?? 0));
    for (const order of active) {
      const definition = BUILDABLE_REGISTRY.get(order.definitionId);
      const objectId = definition?.placesObjectId;
      if (objectId === undefined) {
        structureClaims.add(tileKey(order.location));
        if (definition?.category === 'wall' && order.footprint !== 'square') {
          wallEdgeClaims.add(`${tileKey(order.location)}:${resolveBuildEdge(order)}`);
        }
        if (definition?.category === 'wall' && order.footprint === 'square') {
          wallSquareClaims.add(tileKey(order.location));
        }
        continue;
      }
      const objectDefinition = this.placedObjects.definitionOf(objectId);
      if (objectDefinition === undefined) {
        objectClaims.add(tileKey(order.location));
        continue;
      }
      // ObjectPlacementService reserves every square of an in-flight object's
      // footprint, not just its anchor. The template preflight must agree.
      for (const tile of objectFootprintTiles(objectDefinition, order.location, order.objectOrientation ?? 0)) {
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
    // #1692/#1703: disjoint rectangles can still share an entrance approach.
    // Use the same pending/completed template ownership as ordinary wall and
    // furniture placement, including legacy saves without completed metadata.
    // Refuse the whole plan before any defensive wall refusal adds orders.
    for (const square of plan.wallSquares) {
      const tile = { x: tileCoordinate(square.x), y: tileCoordinate(square.y) };
      if (this.claimsRoomDoorApproachTile(tile)) {
        return { ok: false, reason: 'structure-occupied', tile };
      }
    }
    // #1672: an object can be outside the rectangle and still seal its only
    // entrance. Use the same geometry as the pending reverse-order claim.
    for (const { door, outside } of doorwayApproaches(plan)) {
      const doorTile = { x: tileCoordinate(door.x), y: tileCoordinate(door.y) };
      if (!Number.isSafeInteger(outside.x) || !Number.isSafeInteger(outside.y)) {
        return { ok: false, reason: 'unowned-land', tile: doorTile };
      }
      const approach = { x: tileCoordinate(outside.x), y: tileCoordinate(outside.y) };
      if (this.placedObjects.isTileOccupied(approach) || objectClaims.has(tileKey(approach))) {
        return { ok: false, reason: 'object-occupied', tile: doorTile };
      }
      // A whole wall square occupies the approach itself in every direction,
      // even when its anchor is outside the plan's rectangular footprint.
      if (this.world.getSquareStructure(approach) !== 0 || wallSquareClaims.has(tileKey(approach))) {
        return { ok: false, reason: 'structure-occupied', tile: doorTile };
      }
      // #1661: south/east boundary edges are stored on the outside tile,
      // beyond the rectangle scanned above. Check the separating edge itself;
      // an adjacent exterior edge or a passable door does not seal this route.
      const edge = outside.x === door.x ? 'north' : 'west';
      const edgeTile = { x: tileCoordinate(Math.max(door.x, outside.x)), y: tileCoordinate(Math.max(door.y, outside.y)) };
      const standing = edge === 'north' ? this.world.getTopEdge(edgeTile) : this.world.getLeftEdge(edgeTile);
      if (standing === WALL_EDGE_NUMERIC_ID || wallEdgeClaims.has(`${tileKey(edgeTile)}:${edge}`)) {
        return { ok: false, reason: 'structure-occupied', tile: doorTile };
      }
    }
    return verdict;
  }

  /** The pending gesture reserves every square, even before its shell is visible. */
  public claimsPendingFootprint(tile: TilePosition, orderSequence: number | undefined): boolean {
    return this.pending.some((request) => {
      if (orderSequence === request.sequence) return false;
      const plan = instantiateRoomTemplateForConstruction(request.templateId, request.origin, request.mirrorX, request.quarterTurns ?? 0);
      return tile.x >= plan.origin.x && tile.x < plan.origin.x + plan.width &&
        tile.y >= plan.origin.y && tile.y < plan.origin.y + plan.height;
    });
  }

  /** Keep the passage outside each authored doorway clear until its room exists (#1700). */
  public claimsPendingDoorApproachTile(tile: TilePosition): boolean {
    return this.pending.some((request) => {
      const turns = request.quarterTurns ?? 0;
      const plan = instantiateRoomTemplateForConstruction(request.templateId, request.origin, request.mirrorX, turns);
      return doorwayApproaches(plan).some(({ outside }) => tile.x === outside.x && tile.y === outside.y);
    });
  }

  /** An ordinary opaque wall cannot supersede a pending plan's entrance (#1696). */
  public claimsPendingDoorApproach(order: BuildOrder): boolean {
    if (BUILDABLE_REGISTRY.get(order.definitionId)?.category !== 'wall') return false;
    return this.pending.some((request) => {
      if (request.sequence === order.placementSequence) return false;
      const plan = instantiateRoomTemplateForConstruction(request.templateId, request.origin, request.mirrorX, request.quarterTurns ?? 0);
      return doorwayApproaches(plan).some(({ door, outside }) => {
        if (order.footprint === 'square') return order.location.x === outside.x && order.location.y === outside.y;
        const edge = outside.x === door.x ? 'north' : 'west';
        return resolveBuildEdge(order) === edge &&
          order.location.x === Math.max(door.x, outside.x) && order.location.y === Math.max(door.y, outside.y);
      });
    });
  }

  /** A completed room keeps its doorway passable, including older saves (#1710). */
  public claimsRoomDoorApproach(order: BuildOrder): boolean {
    if (this.claimsPendingDoorApproach(order)) return true;
    if (BUILDABLE_REGISTRY.get(order.definitionId)?.category !== 'wall') return false;
    // From the approach, look through the perimeter door square into the zoned
    // interior. Read standing geometry rather than completed gesture metadata:
    // older saves omit that optional list, and removing a door releases it.
    for (const [dx, dy] of DOORWAY_INWARD_DIRECTIONS) {
      const edge = dx === 0 ? 'north' : 'west';
      if (order.footprint !== 'square' && resolveBuildEdge(order) !== edge) continue;
      // An edge order stores the greater coordinate of its adjacent tiles.
      // Only the edge separating approach and door is protected; an edge
      // perpendicular to the entrance is still legal.
      const x = order.location.x - (order.footprint === 'square' ? 0 : Math.max(dx, 0));
      const y = order.location.y - (order.footprint === 'square' ? 0 : Math.max(dy, 0));
      if (this.hasCompletedDoorApproach(x, y, dx, dy)) return true;
      // A whole square also occupies the door between approach and interior.
      // Reuse the same completed template ownership; ordinary edges stay legal.
      if (order.footprint === 'square' && this.hasCompletedDoorApproach(x - dx, y - dy, dx, dy)) return true;
    }
    return false;
  }

  /** Furniture checks every footprint tile, including non-anchor squares. */
  public claimsRoomDoorApproachTile(tile: TilePosition): boolean {
    return this.claimsPendingDoorApproachTile(tile) || DOORWAY_INWARD_DIRECTIONS.some(([dx, dy]) =>
      this.hasCompletedDoorApproach(tile.x, tile.y, dx, dy) ||
      this.hasCompletedDoorApproach(tile.x - dx, tile.y - dy, dx, dy));
  }

  private hasCompletedDoorApproach(x: number, y: number, dx: number, dy: number): boolean {
    const interiorX = x + 2 * dx;
    const interiorY = y + 2 * dy;
    if (![x, y, interiorX, interiorY].every(Number.isSafeInteger)) return false;
    const interior = { x: tileCoordinate(interiorX), y: tileCoordinate(interiorY) };
    if (this.world.getZoning(interior) === 0) return false;
    const storedDoor = {
      x: tileCoordinate(Math.max(x + dx, interiorX)),
      y: tileCoordinate(Math.max(y + dy, interiorY)),
    };
    const doorValue = dx === 0 ? this.world.getTopEdge(storedDoor) : this.world.getLeftEdge(storedDoor);
    if (doorValue !== DOOR_EDGE_NUMERIC_ID) return false;
    // Standing doors and zoning alone also describe ordinary player-built
    // rooms. Only the completed template door order owns this reservation.
    // Construction orders survive legacy saves without the optional completed
    // gesture ledger, so infer ownership from that authoritative producer.
    const edge = dx === 0 ? 'north' : 'west';
    return this.construction.allOrders().some((order) =>
      order.state === 'completed' && /^room-template-\d+-1-door-\d+$/.test(order.id) &&
      BUILDABLE_REGISTRY.get(order.definitionId)?.placesDoor !== undefined &&
      order.location.x === storedDoor.x && order.location.y === storedDoor.y &&
      resolveBuildEdge(order) === edge);
  }

  public place(request: PendingRoomTemplate): RoomTemplatePlacement {
    if (!roomTemplateOriginFitsSafeCoordinates(request.templateId, request.origin, request.quarterTurns ?? 0)) {
      return { ok: false, reason: 'unowned-land', tile: {
        x: tileCoordinate(request.origin.x), y: tileCoordinate(request.origin.y),
      } };
    }
    const built = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0);
    const verdict = this.preflight(built.plan);
    if (!verdict.ok) return verdict;
    // Every generated ID belongs to this transaction, including furniture
    // submitted after the shell completes. An existing order retains its ID
    // even when terminal; never overwrite it or start a partly admitted plan.
    const claimedOrder = built.orders.find((order) => this.construction.getOrder(order.id) !== undefined);
    if (claimedOrder !== undefined) return { ok: false, reason: 'structure-occupied', tile: claimedOrder.location };
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
    if (built.shellOrderIds.length === 0) {
      this.attachZoningTransaction(request);
      this.construction.beginReversibleWorldTransaction(this.zoningTransactionId(request));
    }
    this.pending.push({ ...request, origin: { ...request.origin } });
    this.pending.sort((a, b) => a.sequence - b.sequence);
    return { ok: true };
  }

  public update(context: SimulationContext): void {
    this.reconcileCancelledShells();
    this.undone = this.undone.filter((request) =>
      this.construction.canRedoOrdersTogether(this.historyEntryIds(request)));
    const remaining: PendingRoomTemplate[] = [];
    for (const request of this.pending) {
      const built = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0);
      const states = built.shellOrderIds.map((id) => this.construction.getOrder(id)?.state);
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
      const placedObjectOrderIds: string[] = [];
      for (const order of built.orders.slice(built.shellOrderIds.length)) {
        const existing = this.construction.getOrder(order.id);
        if (existing !== undefined && existing.state !== 'cancelled' && existing.state !== 'failed') continue;
        const outcome = this.objectPlacement.place({
          orderId: order.id,
          definitionId: order.definitionId,
          x: order.location.x,
          y: order.location.y,
          transactionId: `room-template-${request.sequence}`,
          historyContinuationOrderIds: built.shellOrderIds,
          ...(order.objectOrientation === undefined ? {} : { objectOrientation: order.objectOrientation }),
        }, context.tick, request.sequence);
        if (outcome.kind === 'refused') {
          for (const previous of zoned.reverse()) this.roomZoning.unzone(previous, context.tick);
          for (const id of placedObjectOrderIds) this.construction.cancelOrder(id);
          for (const id of built.shellOrderIds) this.construction.cancelOrder(id);
          refused = true;
          break;
        }
        placedObjectOrderIds.push(outcome.orderId);
      }
      if (!refused) this.completed.push({ ...request, origin: { ...request.origin } });
    }
    this.pending = remaining;
  }

  /** A queue cancellation removes the same coupled gesture as Undo (#1657/#1608). */
  public prepareCancellation(orderId: string, tick: number): RoomTemplateReversalRefusal | undefined {
    const ids = this.cancellationGestureIds(orderId);
    return ids === undefined ? undefined : this.prepareUndo(ids, tick);
  }

  /** One supply cancellation can reverse several exact gestures; validate/unzone their union before any refund. */
  public prepareMaterialWithdrawal(orderIds: readonly string[], tick: number): RoomTemplateReversalRefusal | undefined {
    const requests: PendingRoomTemplate[] = [];
    for (const orderId of orderIds) {
      const ids = this.cancellationGestureIds(orderId);
      if (ids === undefined) continue;
      const transaction = new Set(ids);
      const request = this.completed.find(entry => this.shellOrderIds(entry).some(id => transaction.has(id)))
        ?? this.recoverCompletedGesture(ids);
      if (request !== undefined && !requests.some(entry => entry.sequence === request.sequence)) requests.push(request);
    }
    if (requests.length === 0) return undefined;
    const built = requests.map(request => createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX,
      request.sequence, request.quarterTurns ?? 0));
    if (built.some(gesture => this.hasUnknownReversalOwnership(gesture.orders.map(order => order.id)))) {
      return { kind: 'refused', reason: 'object-ownership-unknown' };
    }
    const outcome = this.roomZoning.unzoneTogether(built.flatMap(gesture => gesture.plan.zones), tick);
    if (outcome.kind === 'refused' && outcome.reason !== 'nothing-to-remove') return outcome;
    for (const request of requests) {
      if (!this.completed.some(entry => entry.sequence === request.sequence)) this.completed.push(request);
    }
    return undefined;
  }

  /** undefined means an ordinary order; [] means the actual coupled press refuses. */
  public previewCancellationOrderIds(orderId: string): readonly string[] | undefined {
    const pending = this.pending.find(request => this.shellOrderIds(request).includes(orderId));
    if (pending !== undefined) return [orderId, ...this.shellOrderIds(pending).filter(id => id !== orderId)];
    const ids = this.cancellationGestureIds(orderId);
    if (ids === undefined) return undefined;
    const transaction = new Set(ids);
    const request = this.completed.find(entry => this.shellOrderIds(entry).some(id => transaction.has(id)))
      ?? this.recoverCompletedGesture(ids);
    if (request === undefined) return undefined;
    const built = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0);
    if (this.hasUnknownReversalOwnership(built.orders.map(order => order.id))) return [];
    const refusal = this.roomZoning.previewUnzoneTogether(built.plan.zones, 0);
    if (refusal !== undefined && refusal.reason !== 'nothing-to-remove') return [];
    return [orderId, ...built.orders.map(order => order.id).filter(id => id !== orderId)];
  }

  private cancellationGestureIds(orderId: string): readonly string[] | undefined {
    for (const request of this.completed) {
      const ids = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0)
        .orders.map((order) => order.id);
      if (ids.includes(orderId)) return ids;
    }
    // Legacy recovery still requires the real gesture's history. A numeric
    // template producer prefix is only a prefilter, never an association.
    if (!/^room-template-\d+-[012]-(?:wall|door|object)-\d+$/.test(orderId)) return undefined;
    const history = this.construction.snapshot();
    const transaction = [...history.undoStack, history.currentTransaction ?? []]
      .find((ids) => ids.includes(orderId));
    // Actual history membership permits the existing exact legacy recovery;
    // an ordinary order does not acquire template ownership by its location.
    return transaction;
  }

  /** Clear or refuse the completed gesture's zones before its shell is touched. */
  public prepareUndo(orderIds: readonly string[], tick: number): RoomTemplateReversalRefusal | undefined {
    const transaction = new Set(orderIds);
    const recorded = this.completed.find((entry) => this.shellOrderIds(entry).some((id) => transaction.has(id)));
    const request = recorded ?? this.recoverCompletedGesture(orderIds);
    if (request === undefined) return undefined;
    const built = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0);
    if (this.hasUnknownReversalOwnership(built.orders.map(order => order.id))) {
      return { kind: 'refused', reason: 'object-ownership-unknown' };
    }
    const plan = instantiateRoomTemplateForConstruction(request.templateId, request.origin, request.mirrorX, request.quarterTurns ?? 0);
    // One all-or-nothing unzone happens while the original beds and all other
    // rooms still stand. A row's residents cannot move into another row member
    // which this same Undo will also remove. Pending plans and shell-free Yard
    // transactions retain their existing paths.
    const outcome = this.roomZoning.unzoneTogether(plan.zones, tick);
    if (outcome.kind === 'refused' && outcome.reason !== 'nothing-to-remove') return outcome;
    // A refused legacy Undo must leave even optional gesture metadata alone.
    // Retain successful recovery for the existing cancellation/Redo path only.
    if (recorded === undefined) this.completed.push(request);
    return undefined;
  }

  /** A template cannot infer physical ownership from matching location or order history. */
  private hasUnknownReversalOwnership(orderIds: readonly string[]): boolean {
    return orderIds.some(id => {
      const order = this.construction.getOrder(id);
      if (order?.state !== 'completed') return false;
      const objectId = BUILDABLE_REGISTRY.get(order.definitionId)?.placesObjectId;
      if (objectId === undefined) return false;
      const object = this.placedObjects.objectAt(order.location);
      if (object === undefined || object.objectId !== objectId ||
          object.anchorTile.x !== order.location.x || object.anchorTile.y !== order.location.y) return false;
      const owner = object.sourceOrderId === undefined ? undefined : this.construction.getOrder(object.sourceOrderId);
      return owner?.state !== 'completed' ||
        BUILDABLE_REGISTRY.get(owner.definitionId)?.placesObjectId !== object.objectId ||
        owner.location.x !== object.anchorTile.x || owner.location.y !== object.anchorTile.y ||
        (owner.objectOrientation ?? 0) !== object.orientation;
    });
  }

  /** Command dispatch also runs while paused, so release invalidated plans then. */
  public reconcileCancelledShells(): void {
    this.completed = this.completed.filter((request) => {
      const built = createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0);
      if (!built.orders.some((order) => this.construction.getOrder(order.id)?.state === 'cancelled')) return true;
      for (const zone of built.plan.zones) this.roomZoning.unzone(zone, 0);
      for (const order of built.orders) {
        const existing = this.construction.getOrder(order.id);
        if (existing !== undefined && existing.state !== 'cancelled' && existing.state !== 'failed') this.construction.cancelOrder(order.id);
      }
      if (this.construction.canRedoOrdersTogether(built.orders.map((order) => order.id))) this.undone.push(request);
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

  /** Admit the exact top Redo gesture before history, orders or procurement change. */
  public preflightRedo(): RoomTemplatePlacement {
    const transaction = this.construction.snapshot().redoStack.at(-1);
    if (transaction === undefined) return { ok: true };
    const ids = new Set(transaction);
    for (const request of this.undone) {
      if (!this.historyEntryIds(request).every(id => ids.has(id))) continue;
      const plan = instantiateRoomTemplateForConstruction(
        request.templateId, request.origin, request.mirrorX, request.quarterTurns ?? 0,
      );
      const verdict = this.preflight(plan);
      if (!verdict.ok) return verdict;
    }
    return { ok: true };
  }

  /** Reconnect Redo's reapproved shell transaction to its saved room/furniture obligation. */
  public reconcileRedoneShells(): void {
    this.undone = this.undone.filter((request) => {
      const ids = this.shellOrderIds(request);
      if (ids.length === 0) return this.construction.canRedoOrdersTogether(this.historyEntryIds(request));
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

  private zoningTransactionId(request: PendingRoomTemplate): string { return `room-zoning-${request.sequence}`; }

  private historyEntryIds(request: PendingRoomTemplate): readonly string[] {
    const orders = this.shellOrderIds(request);
    return orders.length === 0 ? [this.zoningTransactionId(request)] : orders;
  }

  /** Yard owns an actual zoning obligation and writes no shell orders or materials. */
  private attachZoningTransaction(request: PendingRoomTemplate): void {
    this.construction.attachReversibleWorldTransaction(this.zoningTransactionId(request), {
      canUndo: () => [...this.pending, ...this.completed].some(entry => entry.sequence === request.sequence),
      canRedo: () => this.undone.some(entry => entry.sequence === request.sequence) &&
        this.preflight(instantiateRoomTemplateForConstruction(request.templateId, request.origin, request.mirrorX, request.quarterTurns ?? 0)).ok,
      undo: () => {
        const pending = this.pending.some(entry => entry.sequence === request.sequence);
        const completed = this.completed.some(entry => entry.sequence === request.sequence);
        if (!pending && !completed) return false;
        if (completed) {
          const plan = instantiateRoomTemplateForConstruction(request.templateId, request.origin, request.mirrorX, request.quarterTurns ?? 0);
          for (const zone of plan.zones) {
            if (this.roomZoning.unzone(zone, 0).kind === 'refused') return false;
          }
        }
        this.pending = this.pending.filter(entry => entry.sequence !== request.sequence);
        this.completed = this.completed.filter(entry => entry.sequence !== request.sequence);
        this.undone.push({ ...request, origin: { ...request.origin } });
        return true;
      },
      redo: () => {
        if (!this.undone.some(entry => entry.sequence === request.sequence)) return false;
        const plan = instantiateRoomTemplateForConstruction(request.templateId, request.origin, request.mirrorX, request.quarterTurns ?? 0);
        if (!this.preflight(plan).ok) return false;
        this.undone = this.undone.filter(entry => entry.sequence !== request.sequence);
        this.pending.push({ ...request, origin: { ...request.origin } });
        this.pending.sort((a, b) => a.sequence - b.sequence);
        return true;
      },
    });
  }

  private shellOrderIds(request: PendingRoomTemplate): readonly string[] {
    return createRoomTemplateBuildPlan(request.templateId, request.origin, request.mirrorX, request.sequence, request.quarterTurns ?? 0).shellOrderIds;
  }

  public snapshot(): RoomTemplateCoordinatorSnapshot {
    const undone = this.undone.filter((request) => this.construction.canRedoOrdersTogether(this.historyEntryIds(request)));
    const copy = (entry: PendingRoomTemplate) => ({ ...entry, origin: { ...entry.origin } });
    return { version: 1, pending: this.pending.map(copy), ...(undone.length === 0 ? {} : { undone: undone.map(copy) }), ...(this.completed.length === 0 ? {} : { completed: this.completed.map(copy) }) };
  }

  public loadSnapshot(snapshot: RoomTemplateCoordinatorSnapshot | undefined): void {
    this.completed = snapshot?.completed?.map((entry) => ({ ...entry, origin: { ...entry.origin } })) ?? [];
    this.pending = snapshot?.pending.map((entry) => ({ ...entry, origin: { ...entry.origin } })) ?? [];
    this.pending.sort((a, b) => a.sequence - b.sequence);
    this.undone = snapshot?.undone?.filter((request) =>
      this.construction.canRedoOrdersTogether(this.historyEntryIds(request)))
      .map((entry) => ({ ...entry, origin: { ...entry.origin } })) ?? [];
    for (const request of [...this.pending, ...this.completed, ...this.undone]) {
      if (this.shellOrderIds(request).length === 0) this.attachZoningTransaction(request);
    }
  }

  /** Reconstruct only an exact authored gesture carried by real Undo history. */
  private recoverCompletedGesture(orderIds: readonly string[]): PendingRoomTemplate | undefined {
    const first = orderIds[0];
    const matched = first === undefined ? undefined : /^room-template-(\d+)-[012]-(?:wall|door|object)-\d+$/.exec(first);
    if (matched === undefined || matched === null) return undefined;
    const sequence = Number(matched[1]);
    if (!Number.isSafeInteger(sequence) || sequence < 0) return undefined;
    const prefix = `room-template-${sequence.toString().padStart(12, '0')}-`;
    const ids = new Set(orderIds);
    if (ids.size !== orderIds.length || orderIds.some(id => !id.startsWith(prefix))) return undefined;
    const actual = new Map<string, BuildOrder>();
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    for (const id of orderIds) {
      const order = this.construction.getOrder(id);
      if (order === undefined) return undefined;
      actual.set(id, order);
      minX = Math.min(minX, order.location.x);
      minY = Math.min(minY, order.location.y);
    }
    const origin = { x: minX, y: minY };
    for (const templateId of ROOM_TEMPLATE_IDS) {
      for (const mirrorX of [false, true]) for (const quarterTurns of [0, 1, 2, 3] as const) {
        if (!roomTemplateOriginFitsSafeCoordinates(templateId, origin, quarterTurns)) continue;
        const built = createRoomTemplateBuildPlan(templateId, origin, mirrorX, sequence, quarterTurns);
        if (built.orders.length !== actual.size || built.shellOrderIds.length === 0) continue;
        if (!built.orders.every(expected => {
          const order = actual.get(expected.id);
          return order !== undefined && order.definitionId === expected.definitionId &&
            order.location.x === expected.location.x && order.location.y === expected.location.y &&
            order.footprint === expected.footprint && resolveBuildEdge(order) === resolveBuildEdge(expected) &&
            (order.objectOrientation ?? 0) === (expected.objectOrientation ?? 0);
        })) continue;
        if (!built.shellOrderIds.every(id => actual.get(id)?.state === 'completed')) continue;
        // Zoning distinguishes catalogue entries even when their shell and
        // furniture happen to agree. Orders alone cannot name a room purpose.
        if (!built.plan.zones.every(zone => {
          const numericId = defaultRoomContentRegistry.getById(zone.roomId)?.numericId;
          if (numericId === undefined) return false;
          for (let y = zone.y; y < zone.y + zone.height; y++) for (let x = zone.x; x < zone.x + zone.width; x++) {
            if (this.world.getZoning({ x: tileCoordinate(x), y: tileCoordinate(y) }) !== numericId) return false;
          }
          return true;
        })) continue;
        return { templateId, origin, mirrorX, sequence, ...(quarterTurns === 0 ? {} : { quarterTurns }) };
      }
    }
    return undefined;
  }
}
