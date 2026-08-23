import { z } from 'zod';
import { identifierSchema } from '../simulation/protocol/types';
import { buildContentRegistry, type ContentRegistry, type ContentRegistryError } from './registry';

export const ITEM_CATALOG_SCHEMA_VERSION = 1 as const;

export const itemCategorySchema = z.enum(['construction-material', 'food', 'linen', 'waste']);
export type ItemCategory = z.infer<typeof itemCategorySchema>;

export const itemDefinitionSchema = z
  .object({
    schemaVersion: z.literal(ITEM_CATALOG_SCHEMA_VERSION),
    id: identifierSchema,
    numericId: z.number().int().min(1).max(65_535),
    nameKey: identifierSchema,
    category: itemCategorySchema,
    /** Units that fit in one inventory stack slot -- a data hook for future carry-capacity balance, not itself enforced by inventory.ts today. */
    stackSize: z.number().int().min(1).max(9_999),
  })
  .strict();

export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;

const rawItemDefinitions: readonly ItemDefinition[] = [
  { schemaVersion: 1, id: 'item.brick', numericId: 1, nameKey: 'item.brick.name', category: 'construction-material', stackSize: 50 },
  { schemaVersion: 1, id: 'item.wood-plank', numericId: 2, nameKey: 'item.wood-plank.name', category: 'construction-material', stackSize: 50 },
  { schemaVersion: 1, id: 'item.food-ration', numericId: 3, nameKey: 'item.food-ration.name', category: 'food', stackSize: 20 },
  { schemaVersion: 1, id: 'item.dirty-linen', numericId: 4, nameKey: 'item.dirty-linen.name', category: 'linen', stackSize: 20 },
  { schemaVersion: 1, id: 'item.clean-linen', numericId: 5, nameKey: 'item.clean-linen.name', category: 'linen', stackSize: 20 },
  { schemaVersion: 1, id: 'item.waste', numericId: 6, nameKey: 'item.waste.name', category: 'waste', stackSize: 30 },
];

export function loadItemCatalog(
  entries: readonly unknown[] = rawItemDefinitions,
): { readonly registry: ContentRegistry<ItemDefinition>; readonly errors: readonly (ContentRegistryError | { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] })[] } {
  const parsed: ItemDefinition[] = [];
  const schemaErrors: { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] }[] = [];

  entries.forEach((raw, index) => {
    const result = itemDefinitionSchema.safeParse(raw);
    if (result.success) parsed.push(result.data);
    else schemaErrors.push({ kind: 'schema', index, issues: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`) });
  });

  const { registry, errors: registryErrors } = buildContentRegistry(parsed);
  return { registry, errors: [...schemaErrors, ...registryErrors] };
}

export const defaultItemCatalog = loadItemCatalog();

if (defaultItemCatalog.errors.length > 0) {
  throw new Error(`Default item catalog failed validation: ${JSON.stringify(defaultItemCatalog.errors)}`);
}

export const defaultItemRegistry = defaultItemCatalog.registry;
