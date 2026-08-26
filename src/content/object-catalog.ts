import { z } from 'zod';
import { identifierSchema } from '../simulation/protocol/types';
import type { LocalizationKey } from './localization';
import { buildContentRegistry, type ContentRegistry, type ContentRegistryError } from './registry';

export const OBJECT_CATALOG_SCHEMA_VERSION = 1 as const;

export const objectCategorySchema = z.enum([
  'furniture',
  'sanitation',
  'food-service',
  'security',
  'storage',
  'utility',
  'medical',
]);
export type ObjectCategory = z.infer<typeof objectCategorySchema>;

/**
 * What each authored category is *called*, for a surface that groups by one
 * ([ADR 0035](../../docs/adr/0035-buildable-catalogue-category-filter.md)).
 *
 * These seven ids have been authored since the object catalogue shipped and
 * nothing has ever named one on screen: the category decided which appearance
 * a placed object gets and which rooms could require it, and no surface asked
 * a player to choose by it. The Build panel's catalogue filter is the first,
 * so this is where the seven get names -- in the content layer, beside the
 * schema that declares them, exactly as an object's own `nameKey` is content.
 *
 * **A `Record<ObjectCategory, …>` and not a lookup function**, and the type is
 * the whole enforcement: an eighth member added to `objectCategorySchema`
 * fails `pnpm typecheck` here rather than resolving to a key nobody authored
 * and rendering as raw dotted text (ADR 0011's unresolved-key behaviour is
 * visible, which is better than blank, but it is still not a name). A
 * convention like `object.category.${category}.name` computed at the call site
 * would type-check with any string and would have shipped exactly that.
 *
 * A buildable that places **no** object has no entry here and cannot have one
 * -- see `buildableObjectCategory` in
 * `src/simulation/construction/definition.ts` for the two rows that means, and
 * `buildableCategory` in `src/main.ts` for what names them instead.
 */
export const OBJECT_CATEGORY_NAME_KEYS: Readonly<Record<ObjectCategory, LocalizationKey>> = {
  furniture: 'object.category.furniture.name',
  sanitation: 'object.category.sanitation.name',
  'food-service': 'object.category.food-service.name',
  security: 'object.category.security.name',
  storage: 'object.category.storage.name',
  utility: 'object.category.utility.name',
  medical: 'object.category.medical.name',
};

export const objectFootprintSchema = z
  .object({
    width: z.number().int().min(1).max(16),
    height: z.number().int().min(1).max(16),
  })
  .strict();

export const objectDefinitionSchema = z
  .object({
    schemaVersion: z.literal(OBJECT_CATALOG_SCHEMA_VERSION),
    id: identifierSchema,
    numericId: z.number().int().min(1).max(65_535),
    nameKey: identifierSchema,
    category: objectCategorySchema,
    footprint: objectFootprintSchema,
    /** Capability tags rooms can require by object id today (see room-catalog.ts), and future jobs/needs systems can query by capability. */
    capabilities: z.array(identifierSchema).max(16),
  })
  .strict();

export type ObjectDefinition = z.infer<typeof objectDefinitionSchema>;

const rawObjectDefinitions: readonly ObjectDefinition[] = [
  { schemaVersion: 1, id: 'object.bed', numericId: 1, nameKey: 'object.bed.name', category: 'furniture', footprint: { width: 1, height: 2 }, capabilities: ['sleep-surface'] },
  { schemaVersion: 1, id: 'object.medical-bed', numericId: 2, nameKey: 'object.medical-bed.name', category: 'medical', footprint: { width: 1, height: 2 }, capabilities: ['sleep-surface', 'medical-treatment'] },
  { schemaVersion: 1, id: 'object.toilet', numericId: 3, nameKey: 'object.toilet.name', category: 'sanitation', footprint: { width: 1, height: 1 }, capabilities: ['sanitation'] },
  { schemaVersion: 1, id: 'object.sink', numericId: 4, nameKey: 'object.sink.name', category: 'sanitation', footprint: { width: 1, height: 1 }, capabilities: ['hygiene'] },
  { schemaVersion: 1, id: 'object.shower-head', numericId: 5, nameKey: 'object.shower-head.name', category: 'sanitation', footprint: { width: 1, height: 1 }, capabilities: ['hygiene', 'shower'] },
  { schemaVersion: 1, id: 'object.washing-machine', numericId: 6, nameKey: 'object.washing-machine.name', category: 'utility', footprint: { width: 2, height: 1 }, capabilities: ['laundry'] },
  { schemaVersion: 1, id: 'object.desk', numericId: 7, nameKey: 'object.desk.name', category: 'furniture', footprint: { width: 2, height: 1 }, capabilities: ['workstation'] },
  { schemaVersion: 1, id: 'object.chair', numericId: 8, nameKey: 'object.chair.name', category: 'furniture', footprint: { width: 1, height: 1 }, capabilities: ['seating'] },
  { schemaVersion: 1, id: 'object.stove', numericId: 9, nameKey: 'object.stove.name', category: 'food-service', footprint: { width: 2, height: 1 }, capabilities: ['food-preparation'] },
  { schemaVersion: 1, id: 'object.prep-counter', numericId: 10, nameKey: 'object.prep-counter.name', category: 'food-service', footprint: { width: 2, height: 1 }, capabilities: ['food-preparation'] },
  { schemaVersion: 1, id: 'object.fridge', numericId: 11, nameKey: 'object.fridge.name', category: 'food-service', footprint: { width: 1, height: 1 }, capabilities: ['food-storage'] },
  { schemaVersion: 1, id: 'object.dining-table', numericId: 12, nameKey: 'object.dining-table.name', category: 'furniture', footprint: { width: 3, height: 2 }, capabilities: ['dining'] },
  { schemaVersion: 1, id: 'object.bench', numericId: 13, nameKey: 'object.bench.name', category: 'furniture', footprint: { width: 2, height: 1 }, capabilities: ['seating', 'recreation'] },
  { schemaVersion: 1, id: 'object.bookshelf', numericId: 14, nameKey: 'object.bookshelf.name', category: 'furniture', footprint: { width: 2, height: 1 }, capabilities: ['education'] },
  { schemaVersion: 1, id: 'object.medicine-cabinet', numericId: 15, nameKey: 'object.medicine-cabinet.name', category: 'medical', footprint: { width: 1, height: 1 }, capabilities: ['medical-supply'] },
  { schemaVersion: 1, id: 'object.security-console', numericId: 16, nameKey: 'object.security-console.name', category: 'security', footprint: { width: 2, height: 1 }, capabilities: ['surveillance', 'workstation'] },
  { schemaVersion: 1, id: 'object.storage-rack', numericId: 17, nameKey: 'object.storage-rack.name', category: 'storage', footprint: { width: 1, height: 1 }, capabilities: ['item-storage'] },
  { schemaVersion: 1, id: 'object.loading-dock-door', numericId: 18, nameKey: 'object.loading-dock-door.name', category: 'utility', footprint: { width: 3, height: 1 }, capabilities: ['delivery-access'] },
  { schemaVersion: 1, id: 'object.waste-bin', numericId: 19, nameKey: 'object.waste-bin.name', category: 'utility', footprint: { width: 1, height: 1 }, capabilities: ['waste-disposal'] },
  { schemaVersion: 1, id: 'object.utility-panel', numericId: 20, nameKey: 'object.utility-panel.name', category: 'utility', footprint: { width: 1, height: 1 }, capabilities: ['utility-control'] },
];

/**
 * Validates every raw definition against `objectDefinitionSchema` and
 * collects every duplicate id/numericId rather than stopping at the first
 * one, so a startup failure is a complete, actionable report.
 */
export function loadObjectCatalog(
  entries: readonly unknown[] = rawObjectDefinitions,
): { readonly registry: ContentRegistry<ObjectDefinition>; readonly errors: readonly (ContentRegistryError | { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] })[] } {
  const parsed: ObjectDefinition[] = [];
  const schemaErrors: { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] }[] = [];

  entries.forEach((raw, index) => {
    const result = objectDefinitionSchema.safeParse(raw);
    if (result.success) {
      parsed.push(result.data);
    } else {
      schemaErrors.push({ kind: 'schema', index, issues: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`) });
    }
  });

  const { registry, errors: registryErrors } = buildContentRegistry(parsed);
  return { registry, errors: [...schemaErrors, ...registryErrors] };
}

export const defaultObjectCatalog = loadObjectCatalog();

if (defaultObjectCatalog.errors.length > 0) {
  throw new Error(`Default object catalog failed validation: ${JSON.stringify(defaultObjectCatalog.errors)}`);
}

export const defaultObjectRegistry = defaultObjectCatalog.registry;
