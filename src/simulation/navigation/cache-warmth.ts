import type { DoorRegistry } from './door';
import { captureDoorDependencies, type DoorDependencies } from './route-dependencies';
import type { RouteContext } from './route-context';

export interface SavedDoorDependencies {
  readonly perDoor: readonly (readonly [string, { readonly allowed: boolean; readonly traversalCost: number }])[];
}

export function saveDoorDependencies(value: DoorDependencies): SavedDoorDependencies {
  return { perDoor: [...value.perDoor].map(([id, verdict]) => [id, { allowed: verdict.allowed, traversalCost: verdict.traversalCost }]) };
}

/** Saved verdicts have no revision stamp; compare each with the restored world. */
export function loadDoorDependencies(value: SavedDoorDependencies, doors: DoorRegistry, context: RouteContext): DoorDependencies {
  const ids = value.perDoor.map(([id]) => id);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && id <= ids[index - 1]!)) {
    throw new RangeError('Cached door dependencies are duplicated or out of order.');
  }
  const fresh = captureDoorDependencies(ids, doors, context);
  for (const [id, stored] of value.perDoor) {
    const current = fresh.perDoor.get(id);
    if (current === undefined || current.allowed !== stored.allowed || current.traversalCost !== stored.traversalCost) {
      throw new RangeError(`Cached door verdict differs from saved world: ${id}`);
    }
  }
  return fresh;
}
