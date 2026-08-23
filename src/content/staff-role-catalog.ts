import { z } from 'zod';
import { identifierSchema } from '../simulation/protocol/types';
import { buildContentRegistry, type ContentRegistry, type ContentRegistryError } from './registry';

export const STAFF_ROLE_CATALOG_SCHEMA_VERSION = 1 as const;

export const staffDepartmentSchema = z.enum(['administration', 'security', 'medical', 'operations']);
export type StaffDepartment = z.infer<typeof staffDepartmentSchema>;

export const wageBandSchema = z
  .object({
    minPerDay: z.number().nonnegative(),
    maxPerDay: z.number().nonnegative(),
  })
  .strict()
  .refine((band) => band.maxPerDay >= band.minPerDay, { message: 'maxPerDay must be >= minPerDay' });

export const skillRequirementSchema = z
  .object({
    skillId: identifierSchema,
    minLevel: z.number().int().min(0).max(10),
  })
  .strict();
export type SkillRequirement = z.infer<typeof skillRequirementSchema>;

export const staffRoleDefinitionSchema = z
  .object({
    schemaVersion: z.literal(STAFF_ROLE_CATALOG_SCHEMA_VERSION),
    id: identifierSchema,
    numericId: z.number().int().min(1).max(255),
    nameKey: identifierSchema,
    department: staffDepartmentSchema,
    /** Same 0-10 clearance scale `src/simulation/navigation/route-context.ts`'s `RouteContext.securityClearance` already uses -- a staff role's clearance is meaningful input to a future `RouteContext`, not a parallel, incompatible number. */
    baseSecurityClearance: z.number().int().min(0).max(10),
    /** Compatible with `RouteContext.permissions` -- plain named permission strings, not a role-specific enum. */
    permissions: z.array(identifierSchema).max(16),
    /** A wage/skill hook, not a real economy -- issue #29 owns pricing/payroll. */
    wageBand: wageBandSchema,
    skills: z.array(skillRequirementSchema).max(16),
  })
  .strict();

export type StaffRoleDefinition = z.infer<typeof staffRoleDefinitionSchema>;

const rawStaffRoleDefinitions: readonly StaffRoleDefinition[] = [
  {
    schemaVersion: 1, id: 'staff-role.warden', numericId: 1, nameKey: 'staff-role.warden.name', department: 'administration',
    baseSecurityClearance: 10, permissions: ['facility-override', 'medical-wing', 'security-wing', 'records'],
    wageBand: { minPerDay: 300, maxPerDay: 500 }, skills: [{ skillId: 'skill.management', minLevel: 5 }],
  },
  {
    schemaVersion: 1, id: 'staff-role.administrator', numericId: 2, nameKey: 'staff-role.administrator.name', department: 'administration',
    baseSecurityClearance: 6, permissions: ['records'],
    wageBand: { minPerDay: 150, maxPerDay: 250 }, skills: [{ skillId: 'skill.administration', minLevel: 3 }],
  },
  {
    schemaVersion: 1, id: 'staff-role.guard', numericId: 3, nameKey: 'staff-role.guard.name', department: 'security',
    baseSecurityClearance: 5, permissions: ['security-wing'],
    wageBand: { minPerDay: 80, maxPerDay: 140 }, skills: [{ skillId: 'skill.combat', minLevel: 2 }, { skillId: 'skill.observation', minLevel: 2 }],
  },
  {
    schemaVersion: 1, id: 'staff-role.security-chief', numericId: 4, nameKey: 'staff-role.security-chief.name', department: 'security',
    baseSecurityClearance: 8, permissions: ['security-wing', 'armory'],
    wageBand: { minPerDay: 200, maxPerDay: 320 }, skills: [{ skillId: 'skill.combat', minLevel: 5 }, { skillId: 'skill.management', minLevel: 3 }],
  },
  {
    schemaVersion: 1, id: 'staff-role.nurse', numericId: 5, nameKey: 'staff-role.nurse.name', department: 'medical',
    baseSecurityClearance: 4, permissions: ['medical-wing'],
    wageBand: { minPerDay: 120, maxPerDay: 200 }, skills: [{ skillId: 'skill.medicine', minLevel: 3 }],
  },
  {
    schemaVersion: 1, id: 'staff-role.doctor', numericId: 6, nameKey: 'staff-role.doctor.name', department: 'medical',
    baseSecurityClearance: 6, permissions: ['medical-wing', 'pharmacy'],
    wageBand: { minPerDay: 250, maxPerDay: 400 }, skills: [{ skillId: 'skill.medicine', minLevel: 6 }],
  },
  {
    schemaVersion: 1, id: 'staff-role.maintenance-worker', numericId: 7, nameKey: 'staff-role.maintenance-worker.name', department: 'operations',
    baseSecurityClearance: 3, permissions: ['utility-access'],
    wageBand: { minPerDay: 70, maxPerDay: 120 }, skills: [{ skillId: 'skill.engineering', minLevel: 2 }],
  },
  {
    schemaVersion: 1, id: 'staff-role.kitchen-staff', numericId: 8, nameKey: 'staff-role.kitchen-staff.name', department: 'operations',
    baseSecurityClearance: 2, permissions: ['kitchen-access'],
    wageBand: { minPerDay: 60, maxPerDay: 100 }, skills: [{ skillId: 'skill.cooking', minLevel: 2 }],
  },
];

export function loadStaffRoleCatalog(
  entries: readonly unknown[] = rawStaffRoleDefinitions,
): { readonly registry: ContentRegistry<StaffRoleDefinition>; readonly errors: readonly (ContentRegistryError | { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] })[] } {
  const parsed: StaffRoleDefinition[] = [];
  const schemaErrors: { readonly kind: 'schema'; readonly index: number; readonly issues: readonly string[] }[] = [];

  entries.forEach((raw, index) => {
    const result = staffRoleDefinitionSchema.safeParse(raw);
    if (result.success) {
      parsed.push(result.data);
    } else {
      schemaErrors.push({ kind: 'schema', index, issues: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`) });
    }
  });

  const { registry, errors: registryErrors } = buildContentRegistry(parsed);
  return { registry, errors: [...schemaErrors, ...registryErrors] };
}

export const defaultStaffRoleCatalog = loadStaffRoleCatalog();

if (defaultStaffRoleCatalog.errors.length > 0) {
  throw new Error(`Default staff role catalog failed validation: ${JSON.stringify(defaultStaffRoleCatalog.errors)}`);
}

export const defaultStaffRoleRegistry = defaultStaffRoleCatalog.registry;
