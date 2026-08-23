import { z } from 'zod';
import { identifierSchema } from '../simulation/protocol/types';
import { buildContentRegistry, type ContentRegistry, type ContentRegistryError } from './registry';

export const CONTRABAND_CATALOG_SCHEMA_VERSION = 1 as const;

/**
 * Legal context is content, not a hard-coded condition chain (issue #27's
 * "contraband categories, legal context... attributes"): `'illicit'` is
 * always contraband regardless of holder (a weapon); `'restricted'` is
 * contraband only outside an authorized context (a phone in a cell, not in
 * the staff room -- authorization scoping itself is a future policy layer,
 * out of scope here); `'controlled'` is contraband only in excess of an
 * authorized quantity (a tool that's also legitimate equipment). This
 * issue does not enforce the context/quantity distinction automatically --
 * every item a session/scenario introduces via `ContrabandRegistry` is
 * already a confirmed contraband instance; `legalContext` is descriptive
 * data for future policy/incident work, not a runtime gate.
 */
export const contrabandLegalContextSchema = z.enum(['illicit', 'restricted', 'controlled']);
export type ContrabandLegalContext = z.infer<typeof contrabandLegalContextSchema>;

export const contrabandCategoryDefinitionSchema = z
  .object({
    schemaVersion: z.literal(CONTRABAND_CATALOG_SCHEMA_VERSION),
    id: identifierSchema,
    numericId: z.number().int().min(1).max(255),
    nameKey: identifierSchema,
    legalContext: contrabandLegalContextSchema,
    /** 0 = trivially spotted, 10 = extremely hard to detect. Feeds `resolveDetectionProbability` as a penalty, never a hard pass/fail. */
    baseConcealment: z.number().int().min(0).max(10),
    /** 0 = negligible, 10 = severe. Not consumed by this issue -- reserved for #28's incident/disciplinary weighting so that system doesn't need a parallel severity model. */
    severity: z.number().int().min(0).max(10),
  })
  .strict();

export type ContrabandCategoryDefinition = z.infer<typeof contrabandCategoryDefinitionSchema>;

const rawContrabandCategoryDefinitions: readonly ContrabandCategoryDefinition[] = [
  { schemaVersion: 1, id: 'contraband.weapon', numericId: 1, nameKey: 'contraband.weapon.name', legalContext: 'illicit', baseConcealment: 6, severity: 9 },
  { schemaVersion: 1, id: 'contraband.drug', numericId: 2, nameKey: 'contraband.drug.name', legalContext: 'illicit', baseConcealment: 5, severity: 7 },
  { schemaVersion: 1, id: 'contraband.phone', numericId: 3, nameKey: 'contraband.phone.name', legalContext: 'restricted', baseConcealment: 4, severity: 4 },
  { schemaVersion: 1, id: 'contraband.currency', numericId: 4, nameKey: 'contraband.currency.name', legalContext: 'restricted', baseConcealment: 3, severity: 2 },
  { schemaVersion: 1, id: 'contraband.tool', numericId: 5, nameKey: 'contraband.tool.name', legalContext: 'controlled', baseConcealment: 7, severity: 6 },
];

export function loadContrabandCatalog(
  entries: readonly unknown[] = rawContrabandCategoryDefinitions,
): { readonly registry: ContentRegistry<ContrabandCategoryDefinition>; readonly errors: readonly (ContentRegistryError | { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] })[] } {
  const parsed: ContrabandCategoryDefinition[] = [];
  const schemaErrors: { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] }[] = [];

  entries.forEach((raw, index) => {
    const result = contrabandCategoryDefinitionSchema.safeParse(raw);
    if (result.success) parsed.push(result.data);
    else schemaErrors.push({ kind: 'schema', index, issues: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`) });
  });

  const { registry, errors: registryErrors } = buildContentRegistry(parsed);
  return { registry, errors: [...schemaErrors, ...registryErrors] };
}

export const defaultContrabandCatalog = loadContrabandCatalog();

if (defaultContrabandCatalog.errors.length > 0) {
  throw new Error(`Default contraband catalog failed validation: ${JSON.stringify(defaultContrabandCatalog.errors)}`);
}

export const defaultContrabandRegistry = defaultContrabandCatalog.registry;
