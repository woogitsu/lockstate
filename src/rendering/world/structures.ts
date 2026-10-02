import { defaultObjectRegistry } from '../../content/object-catalog';
import { BUILDABLE_REGISTRY, occupiesTileEdge } from '../../simulation/construction/definition';
import type { ConstructionSnapshot } from '../../simulation/construction/system';
import type { ObjectOrientation, PlacedObject } from '../../simulation/objects/placed-object';

/**
 * The renderer's view of things built or being built.
 *
 * Construction exposes walls, doors and pending objects. Completed placed
 * objects carry authoritative orientation and survive without order history.
 * This joins those worker snapshots, drops lifecycle detail (materials and
 * worker assignment), and keeps only what changes a pixel.
 */

/** What a build order looks like on screen, collapsed from its eight lifecycle states. */
export type StructurePhase = 'planned' | 'building' | 'built';

export interface RenderStructure {
  readonly id: string;
  readonly definitionId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly phase: StructurePhase;
  readonly footprint?: 'square';
  readonly orientation?: ObjectOrientation;
}

function phaseOf(state: string): StructurePhase | undefined {
  switch (state) {
    // Ordered, waiting for materials, or waiting for a worker: a ghost.
    case 'planned':
    case 'approved':
    case 'materials-pending':
    case 'assigned':
      return 'planned';
    case 'in-progress':
      return 'building';
    case 'completed':
      return 'built';
    // Cancelled and failed orders are history, not geometry.
    default:
      return undefined;
  }
}

/**
 * Whether a finished order is already drawn from the world's own edge layers.
 *
 * A completed wall or door writes its value into `topEdge` / `leftEdge`
 * (`edgeNumericIdFor`), and the renderer draws every non-zero edge. The order
 * that produced it stays in the construction snapshot as `completed`, so the
 * same wall reaches the painter twice -- once as an edge bar 0.22 tiles deep at
 * the tile's northern boundary, and once as a **full-tile** block, because
 * `structureAppearance` has no footprint for `wall-brick` and falls back to
 * 1x1. The block is painted second and wins, so a finished wall has been drawn
 * as a whole brown tile rather than as a wall.
 *
 * This is the predicate that lets the painter drop the duplicate, and it is a
 * predicate rather than a filter on the projection for two reasons: the
 * projection is what `simulation-snapshot-feed.ts` publishes and other readers
 * may want the whole order list, and the painter can check something this
 * cannot -- whether the world's edge layer really does carry that tile. A save
 * written before #74 has completed wall orders and no edge values, and dropping
 * those unconditionally would make its walls disappear.
 */
export function isDrawnAsWorldEdge(structure: RenderStructure): boolean {
  if (structure.phase !== 'built' || structure.footprint === 'square') return false;
  const definition = BUILDABLE_REGISTRY.get(structure.definitionId);
  return definition !== undefined && occupiesTileEdge(definition);
}

/**
 * Which catalogued object a build order's definition id stands for, or
 * `undefined` when it stands for none.
 *
 * Two ways a buildable id reaches an object definition, tried in this order:
 * the id *being* one, and the buildable **naming** one through
 * `placesObjectId` (ADR 0028 phase 1). `bed-wooden` is the second --
 * a build order carries `bed-wooden`, and `object.bed` is what the object
 * catalog, the tile index and `environment-art.ts` are all keyed by.
 *
 * **Extracted from `structureAppearance`, which had this resolution inline and
 * is now its first caller rather than its only one.** The painter needs the
 * same answer for a different question -- `appearance.ts` asks it for a
 * footprint, `tile-layer.ts` asks it for artwork -- and two copies of a
 * two-branch lookup is exactly how a bed ends up drawn at the right size with
 * the wrong picture, or at the wrong size with the right one.
 */
export function catalogueObjectId(definitionId: string): string | undefined {
  if (defaultObjectRegistry.getById(definitionId) !== undefined) return definitionId;
  return BUILDABLE_REGISTRY.get(definitionId)?.placesObjectId;
}

/**
 * Structures in a stable draw order: north to south, then west to east, then
 * by id. Ordering here is not cosmetic -- it decides which of two structures on
 * the same tile is drawn last, and a projection that depended on `Map`
 * insertion order would draw differently after a save/restore round trip.
 */
export function structuresFromConstruction(snapshot: ConstructionSnapshot, placedObjects?: readonly PlacedObject[]): readonly RenderStructure[] {
  const structures: RenderStructure[] = [];
  const ordersById = new Map(snapshot.orders.map(order => [order.id, order]));
  type Order = ConstructionSnapshot['orders'][number];
  const physicalKey = (objectId: string, x: number, y: number): string => `${objectId}:${x}:${y}`;
  const legacyDisplayOrders = new Map<string, Order | null>();
  for (const order of snapshot.orders) {
    const objectId = catalogueObjectId(order.definitionId);
    if (order.state !== 'completed' || objectId === undefined) continue;
    const key = physicalKey(objectId, order.location.x, order.location.y);
    legacyDisplayOrders.set(key, legacyDisplayOrders.has(key) ? null : order);
  }

  for (const order of snapshot.orders) {
    const phase = phaseOf(order.state);
    if (phase === undefined) continue;
    // A supplied registry, including an empty one, is the authority for
    // completed furniture. Removed/rebuilt objects leave completed history.
    // Saves without this section retain their order-only geometry fallback.
    if (phase === 'built' && placedObjects !== undefined && catalogueObjectId(order.definitionId) !== undefined) continue;
    const orientation = order.objectOrientation ?? 0;
    structures.push({
      id: order.id,
      definitionId: order.definitionId,
      tileX: order.location.x,
      tileY: order.location.y,
      phase,
      ...(order.footprint === undefined ? {} : { footprint: order.footprint }),
      ...(orientation === 0 ? {} : { orientation }),
    });
  }

  for (const object of placedObjects ?? []) {
    const matches = (order: Order): boolean =>
      order.state === 'completed' && catalogueObjectId(order.definitionId) === object.objectId &&
      order.location.x === object.anchorTile.x && order.location.y === object.anchorTile.y;
    const recorded = object.sourceOrderId === undefined ? undefined : ordersById.get(object.sourceOrderId);
    let displayOrder = recorded !== undefined && matches(recorded) ? recorded : undefined;
    if (object.sourceOrderId === undefined) {
      // Preserve the established display identity of a single legacy match.
      // Multiple historical matches supply no identity: draw the physical row
      // once under its own ID. This never assigns simulation ownership.
      displayOrder = legacyDisplayOrders.get(physicalKey(object.objectId, object.anchorTile.x, object.anchorTile.y)) ?? undefined;
    }
    structures.push({
      id: displayOrder?.id ?? object.placedObjectId,
      definitionId: displayOrder?.definitionId ?? object.objectId,
      tileX: object.anchorTile.x, tileY: object.anchorTile.y, phase: 'built',
      ...(object.orientation === 0 ? {} : { orientation: object.orientation }),
    });
  }

  structures.sort(
    (left, right) =>
      left.tileY - right.tileY ||
      left.tileX - right.tileX ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  return structures;
}

/** A saved occupied square remains drawable even without its construction history. */
export function squareWallStructure(tileX: number, tileY: number): RenderStructure {
  return { id: `square-wall:${tileX}:${tileY}`, definitionId: 'wall-brick', tileX, tileY, phase: 'built', footprint: 'square' };
}
