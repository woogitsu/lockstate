import type { ContentRegistry } from '../../content/registry';
import type { StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry } from '../../content/staff-role-catalog';

/**
 * What one day of one staff role costs, in the treasury's minor units.
 *
 * ## One definition, two readers
 *
 * `wageBand.minPerDay` is authored **per day**
 * (`src/content/staff-role-catalog.ts`), and until payroll existed exactly one
 * thing read it: `staffHireCostMinorUnits`, which charged one day of it as an
 * engagement fee ([ADR 0025](../../../docs/adr/0025-guard-hiring-surface.md)
 * decision 2). A second reader arriving is the moment the field's meaning has
 * to live in one place rather than two, so it lives here and both read it:
 * `staffHireCostMinorUnits` delegates, and `PayrollSystem` charges it again at
 * every in-game day boundary the role is on the roster for.
 *
 * **No number is chosen here.** Which figure the band holds stays issue #29's
 * and the catalogue's, exactly as ADR 0025 decision 2 records; moving one moves
 * both the hire charge and the daily wage with no code change, which is the
 * property having one reader-of-record buys.
 *
 * `undefined` for a role the registry does not declare -- the same answer
 * `staffHireCostMinorUnits` has always given, and the answer a *priced* wage
 * cannot honestly be for a role that is not in the catalogue.
 */
export function staffDailyWageMinorUnits(
  staffRoleId: string,
  staffRoles: ContentRegistry<StaffRoleDefinition> = defaultStaffRoleRegistry,
): number | undefined {
  const role = staffRoles.getById(staffRoleId);
  return role === undefined ? undefined : staffDailyWageForRole(role);
}

/**
 * The same figure for a role already in hand.
 *
 * The **one** expression in `src/` that says which end of the authored band is
 * money owed. `staffHireCostMinorUnits` and `dailyWageBillMinorUnits` both
 * reach it, so "the hire charge is one day of the wage the payroll bills" is
 * true by construction instead of by two files agreeing.
 */
export function staffDailyWageForRole(role: StaffRoleDefinition): number {
  return role.wageBand.minPerDay;
}
