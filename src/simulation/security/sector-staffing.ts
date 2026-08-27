import { DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT } from './default-sector';

/**
 * **How many guards a sector asks for, once it has people in it**
 * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
 * decision 3, answering [ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * open question 2, "should `requiredGuardCount` scale with population?").
 *
 * ## What was wrong with a constant
 *
 * [ADR 0036](../../../docs/adr/0036-a-derived-default-security-sector.md) gave
 * the derived sector a constant requirement of one guard, all day, and argued
 * the number honestly: `DeploymentSystem` and `IncidentResponseSystem` draw
 * from the same `unassignedGuardIds()` pool, so a requirement of `n` means the
 * first `n` hires can never respond to anything, and one leaves every hire
 * after the first claimable.
 *
 * What that reasoning could not see is what a *constant* does to the risk
 * score. `staffingShortfall` is `shortage / required`, so at a requirement of
 * one it is `1` before the first hire and `0` for ever afterwards, whatever the
 * population — which is issue #442's headline, *"hiring one guard makes the
 * incident system unreachable"*. A requirement that never moves is not a
 * staffing decision; it is a one-time purchase that permanently switches a term
 * off.
 *
 * ## The rule, and the two things it refuses to do
 *
 * **A sector's requirement is the larger of what its schedule authors and one
 * guard per `DEFAULT_SECTOR_PRISONERS_PER_GUARD` occupants**, and:
 *
 * - **It only ever raises.** A `DeploymentSchedule` is authored data — a
 *   scenario, a save payload or `applyDefaultSecuritySector` put it there — and
 *   a rule that replaced it would make the authored number unreadable. Taking
 *   the maximum keeps the schedule a floor and the population a demand on top
 *   of it.
 * - **Zero stays zero.** A schedule asking for no guards is an *exemption*, not
 *   a small number: `applyDefaultSecuritySector`'s "anything already present
 *   wins" is what lets a save carry one, and
 *   `tests/helpers/default-security-sector.ts` is a fixture that relies on it
 *   for files whose subject is not the default sector. Scaling an exemption up
 *   would silently withdraw it, and it would do so only after a save round
 *   trip, which is the worst way for it to happen.
 *
 * ## Where it is applied, and why not in a system of its own
 *
 * In `DeploymentSystem.requiredGuardCountFor`, which is the one place the
 * requirement is read — by `assignUnassignedGuards`, by `getCoverageReport`,
 * and through that report by the risk sampler and by the staff and security
 * projections. The first draft of this was a small system that rewrote the
 * schedule in place every fifty ticks; it was wrong, and the test that caught
 * it is the one asserting a payload's zero survives a load. A system that
 * *writes* the requirement cannot also honour an authored one, because after
 * the first write the authored value is gone.
 *
 * ## Persistence and determinism
 *
 * **No save-format change and nothing new persisted.** The schedule in the
 * payload is the authored floor, unchanged; the scaling is derived at read time
 * from occupancy the save already carries. Deterministic: integer arithmetic
 * over a count, no RNG, no clock, no iteration order of its own.
 */

/**
 * How many occupants one posted guard is expected to cover.
 *
 * A **directional default, not a balance decision**, in the same sense as
 * `DEFAULT_SECTOR_RISK_POLICY` and `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT`;
 * the reasoning is written down so a later balance pass has something to
 * disagree with.
 *
 * Chosen off a measured ladder rather than picked (ADR 0048 records the runs).
 * At eight: a furnished prison of eight prisoners asks for one guard and has no
 * shortfall; the same prison holding twice its bed capacity asks for two, so
 * the shortfall term comes back exactly when the prison has outgrown its
 * staffing. Five was measured and made the shortfall term fire in prisons whose
 * only fault was that nobody had hired a second guard yet. At
 * `DEFAULT_PRISONER_CAPACITY` the rule would ask for 625, above
 * `DEFAULT_GUARD_CAPACITY`'s 500 — a bound worth knowing rather than a case any
 * prison reaches.
 */
export const DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8;

/** How many prisoners a sector currently holds — `src/simulation/security/sector-occupancy.ts` answers it for a session. */
export type SectorOccupantCountResolver = (sectorId: string) => number;

/**
 * The requirement a sector with `scheduledGuardCount` authored and
 * `occupantCount` prisoners in it actually has.
 *
 * `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` is not consulted here: the
 * floor of one already reaches this function through the schedule
 * `applyDefaultSecuritySector` derived from it, and reapplying it would impose
 * that floor on a sector that authored an exemption.
 */
export function resolveOccupancyScaledGuardCount(scheduledGuardCount: number, occupantCount: number): number {
  if (scheduledGuardCount <= 0) return scheduledGuardCount;
  return Math.max(scheduledGuardCount, Math.ceil(Math.max(0, occupantCount) / DEFAULT_SECTOR_PRISONERS_PER_GUARD));
}

/** Restated so the constant above cannot drift from ADR 0036's floor without a compile-time reader noticing. */
export const DEFAULT_SECTOR_STAFFING_FLOOR = DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT;
