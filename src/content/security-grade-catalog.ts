import { z } from 'zod';
import { identifierSchema } from '../simulation/protocol/types';
import { buildContentRegistry, type ContentRegistry, type ContentRegistryError } from './registry';

export const SECURITY_GRADE_CATALOG_SCHEMA_VERSION = 1 as const;

/**
 * A security grade is the *classification policy* a sector applies to its
 * governed doors -- issue #26's "sectors... with stable IDs and grades/
 * classification policy." Reuses the exact 0-10 `RouteContext.securityClearance`
 * scale `src/content/staff-role-catalog.ts`'s `baseSecurityClearance` already
 * uses, and the same free-form permission-string vocabulary
 * `RouteContext.permissions`/`DoorDefinition.requiredPermission` use -- a
 * grade is not a parallel, incompatible access model.
 */
export const securityGradeDefinitionSchema = z
  .object({
    schemaVersion: z.literal(SECURITY_GRADE_CATALOG_SCHEMA_VERSION),
    id: identifierSchema,
    numericId: z.number().int().min(1).max(255),
    nameKey: identifierSchema,
    /** Minimum `RouteContext.securityClearance` required to cross a door this grade governs, absent a matching named permission. */
    minSecurityClearance: z.number().int().min(0).max(10),
    /** If set, holding this permission substitutes for `minSecurityClearance` -- e.g. a nurse below the wing's clearance floor still enters via `'medical-wing'`, matching #21's `checkDoorAccess` semantics for a single door applied at sector scope. */
    requiredPermission: identifierSchema.optional(),
  })
  .strict();

export type SecurityGradeDefinition = z.infer<typeof securityGradeDefinitionSchema>;

const rawSecurityGradeDefinitions: readonly SecurityGradeDefinition[] = [
  { schemaVersion: 1, id: 'grade.general', numericId: 1, nameKey: 'grade.general.name', minSecurityClearance: 0 },
  { schemaVersion: 1, id: 'grade.medical', numericId: 2, nameKey: 'grade.medical.name', minSecurityClearance: 4, requiredPermission: 'medical-wing' },
  { schemaVersion: 1, id: 'grade.high-security', numericId: 3, nameKey: 'grade.high-security.name', minSecurityClearance: 5, requiredPermission: 'security-wing' },
  { schemaVersion: 1, id: 'grade.staff-only', numericId: 4, nameKey: 'grade.staff-only.name', minSecurityClearance: 3 },
  { schemaVersion: 1, id: 'grade.administrative', numericId: 5, nameKey: 'grade.administrative.name', minSecurityClearance: 6, requiredPermission: 'records' },
];

export function loadSecurityGradeCatalog(
  entries: readonly unknown[] = rawSecurityGradeDefinitions,
): { readonly registry: ContentRegistry<SecurityGradeDefinition>; readonly errors: readonly (ContentRegistryError | { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] })[] } {
  const parsed: SecurityGradeDefinition[] = [];
  const schemaErrors: { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] }[] = [];

  entries.forEach((raw, index) => {
    const result = securityGradeDefinitionSchema.safeParse(raw);
    if (result.success) parsed.push(result.data);
    else schemaErrors.push({ kind: 'schema', index, issues: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`) });
  });

  const { registry, errors: registryErrors } = buildContentRegistry(parsed);
  return { registry, errors: [...schemaErrors, ...registryErrors] };
}

export const defaultSecurityGradeCatalog = loadSecurityGradeCatalog();

if (defaultSecurityGradeCatalog.errors.length > 0) {
  throw new Error(`Default security grade catalog failed validation: ${JSON.stringify(defaultSecurityGradeCatalog.errors)}`);
}

export const defaultSecurityGradeRegistry = defaultSecurityGradeCatalog.registry;
