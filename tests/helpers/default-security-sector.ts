import { expect } from 'vitest';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  DEFAULT_SECURITY_SECTOR_ID,
  DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT,
  constantDeploymentSchedule,
} from '../../src/simulation/security';

/**
 * Sets the derived default sector's deployment requirement to zero, for a
 * fixture whose subject is not the default sector
 * ([ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md)).
 *
 * ## Why any fixture needs this
 *
 * Every session now carries one sector that asks for one guard all day, and
 * `DeploymentSystem` fills it out of `GuardRoster.unassignedGuardIds()` — the
 * same finite pool `IncidentResponseSystem` and `SearchSystem` claim from. So
 * the *first* guard a fixture hires is posted, and every guard id in that
 * fixture's assertions shifts by one. For a file about the default sector that
 * is the point; for #352's reproduction, or for `ReleaseGuardAssignment`'s
 * eighteen assertions about which guard is held by what, it is noise that
 * obscures the thing under test.
 *
 * ## Zero, rather than deleting the schedule
 *
 * Deleting the entry would not survive a save: `restoreSessionSystems` re-applies
 * `applyDefaultSecuritySector` after the payload, so a schedule list that is
 * *silent* about this sector gets the derived one-guard requirement back, and a
 * fixture that saved and loaded would behave differently on the two sides of the
 * round trip. A schedule that asks for **zero** is an entry, so the payload
 * carries it, and `applyDefaultSecuritySector` leaves anything already present
 * alone. It therefore says the same thing before and after a load, which is what
 * a save-path fixture needs it to do.
 *
 * The sector itself is left registered. It has to be: `sectors.all()` is what
 * `getCoverageReport` and every projection enumerate, and a fixture that hid the
 * sector would be measuring a session shape that no longer exists.
 */
export function withoutDefaultSectorDeploymentDemand(runtime: SimulationRuntime): void {
  const index = runtime.securitySchedules.findIndex((schedule) => schedule.sectorId === DEFAULT_SECURITY_SECTOR_ID);
  // Asserted rather than tolerated: if the derivation ever stops supplying a
  // schedule, a helper that silently did nothing would leave every caller
  // believing it had opted out of a demand that had moved somewhere else.
  expect(index, `every session must carry a deployment schedule for ${DEFAULT_SECURITY_SECTOR_ID}`).toBeGreaterThanOrEqual(0);
  expect(DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT).toBeGreaterThan(0);
  runtime.securitySchedules.splice(index, 1, constantDeploymentSchedule(DEFAULT_SECURITY_SECTOR_ID, 0));
}
