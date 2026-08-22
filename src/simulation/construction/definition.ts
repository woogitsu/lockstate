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
    materialsRequired: [{ itemId: 'brick', quantity: 2 }],
  }],
  ['door-wooden', {
    id: 'door-wooden',
    category: 'object',
    name: 'Wooden Door',
    workRequired: 30,
    materialsRequired: [{ itemId: 'wood-plank', quantity: 1 }],
  }],
]);

export function getBuildableDefinition(id: string): BuildableDefinition {
  const def = BUILDABLE_REGISTRY.get(id);
  if (!def) throw new Error(`Unknown buildable definition: ${id}`);
  return def;
}
