import { defaultObjectRegistry } from '../../content/object-catalog';
import { BUILDABLE_REGISTRY, occupiesTileEdge } from '../../simulation/construction/definition';
import type { ConstructionSnapshot } from '../../simulation/construction/system';

/**
 * The renderer's view of things built or being built.
 *
 * Construction is the only source of walls, doors and objects the simulation
 * currently exposes across the worker boundary, so this is a projection of
 * `ConstructionSnapshot` -- not a second copy of it. It drops the order
 * lifecycle detail the renderer must not act on (materials, worker
 * assignment) and keeps only what changes a pixel.
 */

/** What a build order looks like on screen, collapsed from its eight lifecycle states. */
export type StructurePhase = 'planned' | 'building' | 'built';

export interface RenderStructure {
  readonly id: string;
  readonly definitionId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly phase: StructurePhase;
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
  if (structure.phase !== 'built') return false;
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
export function structuresFromConstruction(snapshot: ConstructionSnapshot): readonly RenderStructure[] {
  const structures: RenderStructure[] = [];

  for (const order of snapshot.orders) {
    const phase = phaseOf(order.state);
    if (phase === undefined) continue;
    structures.push({
      id: order.id,
      definitionId: order.definitionId,
      tileX: order.location.x,
      tileY: order.location.y,
      phase,
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
