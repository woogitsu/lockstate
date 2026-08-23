import { defaultItemRegistry } from '../../content/item-catalog';

export type BuildableCategory = 'wall' | 'object' | 'utility';

export interface MaterialRequirement {
  readonly itemId: string;
  readonly quantity: number;
}

export interface BuildableDefinition {
  readonly id: string;
  readonly category: BuildableCategory;
  readonly name: string;
  readonly workRequired: number; // Simulated ticks or work units
  readonly materialsRequired: readonly MaterialRequirement[];
}

export const BUILDABLE_REGISTRY = new Map<string, BuildableDefinition>([
  ['wall-brick', {
    id: 'wall-brick',
    category: 'wall',
    name: 'Brick Wall',
    workRequired: 50,
    materialsRequired: [{ itemId: 'item.brick', quantity: 2 }],
  }],
  ['door-wooden', {
    id: 'door-wooden',
    category: 'object',
    name: 'Wooden Door',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
  }],
]);

export type BuildableItemReferenceError = {
  readonly kind: 'missing-item-reference';
  readonly buildableId: string;
  readonly itemId: string;
};

/**
 * Every material a buildable requires must be a real item definition
 * (ADR 0018 §3).
 *
 * Until a supply route existed, `BUILDABLE_REGISTRY` and
 * `src/content/item-catalog.ts` were two unrelated vocabularies -- the
 * former said `'brick'`, the latter `'item.brick'`, and nothing ever put
 * one into the other's hands. Now that a scenario stocks a container from
 * the item catalog and `ConstructionSystem` spends from that same
 * container, a mismatch is no longer cosmetic: it is a build order that
 * waits in `'materials-pending'` forever with no error anywhere. So the
 * two vocabularies are checked against each other, at import time, in both
 * directions (`validateScenarioItemReferences` is the other half).
 */
export function validateBuildableItemReferences(): readonly BuildableItemReferenceError[] {
  const errors: BuildableItemReferenceError[] = [];

  for (const id of [...BUILDABLE_REGISTRY.keys()].sort()) {
    for (const requirement of BUILDABLE_REGISTRY.get(id)!.materialsRequired) {
      if (!defaultItemRegistry.has(requirement.itemId)) {
        errors.push({ kind: 'missing-item-reference', buildableId: id, itemId: requirement.itemId });
      }
    }
  }

  return errors;
}

const buildableItemReferenceErrors = validateBuildableItemReferences();

if (buildableItemReferenceErrors.length > 0) {
  throw new Error(`Buildable definitions reference unknown items: ${JSON.stringify(buildableItemReferenceErrors)}`);
}

/**
 * What a completed wall writes into the world's `topEdge` / `leftEdge` layer.
 *
 * The layers are `Uint8Array`s whose only published meaning today is
 * "zero means nothing is here": `TopologyManager` flood-fills across any
 * zero edge and stops at any non-zero one, and the renderer draws an edge
 * wall wherever the value is non-zero. `1` is therefore "a wall segment", not
 * a material id -- when different wall materials need to look different, the
 * value becomes a per-definition id and this constant becomes its default.
 */
export const WALL_EDGE_NUMERIC_ID = 1;

/**
 * The edge-layer value a completed order for this buildable writes, or `0`
 * for a buildable that is not edge geometry at all.
 *
 * Only `'wall'` occupies a tile edge. A door is `'object'` here and is
 * deliberately *not* written as an edge: an edge is opaque to
 * `TopologyManager`, so recording a door as one would seal the room it is
 * supposed to open. Doors are modelled by `navigation/door.ts`'s
 * `DoorRegistry`, and connecting a completed door order to it is a separate
 * piece of work (see `docs/NAVIGATION.md`).
 */
export function edgeNumericIdFor(definition: BuildableDefinition): number {
  return definition.category === 'wall' ? WALL_EDGE_NUMERIC_ID : 0;
}

export function getBuildableDefinition(id: string): BuildableDefinition {
  const def = BUILDABLE_REGISTRY.get(id);
  if (!def) throw new Error(`Unknown buildable definition: ${id}`);
  return def;
}
