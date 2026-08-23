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
