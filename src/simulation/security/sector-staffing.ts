import { DEFAULT_SECURITY_SECTOR_ID, DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT } from './default-sector';

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
 * - **An empty sector requires nobody — where the occupant count is a complete
 *   measure of who is in it.**
 *   [ADR 0070](../../../docs/adr/0070-dismissing-a-staff-member.md) decision 1,
 *   issue #533; the owner's decision on issue #535 decision 4. This is the one direction in which occupancy *lowers* the
 *   answer, and the bullet below said it never did — see "What changed, and
 *   what the old sentence got right" further down, which is the correction
 *   rather than an overwrite. The qualification is load-bearing and
 *   `sectorOccupantCountIsComplete` below is where it is decided.
 * - **Otherwise it only ever raises.** A `DeploymentSchedule` is authored data
 *   — a scenario, a save payload or `applyDefaultSecuritySector` put it there —
 *   and a rule that replaced it would make the authored number unreadable.
 *   Taking the maximum keeps the schedule a floor and the population a demand
 *   on top of it.
 * - **Zero stays zero.** A schedule asking for no guards is an *exemption*, not
 *   a small number: `applyDefaultSecuritySector`'s "anything already present
 *   wins" is what lets a save carry one, and
 *   `tests/helpers/default-security-sector.ts` is a fixture that relies on it
 *   for files whose subject is not the default sector. Scaling an exemption up
 *   would silently withdraw it, and it would do so only after a save round
 *   trip, which is the worst way for it to happen.
 *
 * ## What changed, and what the old sentence got right
 *
 * This function used to answer `1` for a sector holding nobody, because the
 * schedule floor of one applied unconditionally. Measured on an empty prison —
 * no prisoners, no rooms — the Staff panel therefore read *"Guard coverage · 0
 * of 1 · Unguarded"* and *"Nobody is on duty. Hire 1 to cover this
 * population."*, and a player who obeyed paid one day's wage at the click plus
 * the same figure again at the day boundary (`src/simulation/economy/payroll.ts`)
 * against no income and no population to guard. That is the demand half of
 * issue #533; the other half is that nothing could undo it, which
 * `src/simulation/staff/dismissal.ts` closes.
 *
 * **The floor's own argument survives intact and is worth reading before
 * assuming this weakened it.** `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT`
 * argues the floor from two facts, and both are facts about a prison with
 * people in it: that a requirement of zero leaves `DeploymentSystem` inert, so
 * no hire is ever visibly posted; and that `IncidentResponseSystem` and
 * `DeploymentSystem` draw from one pool, so a floor above one starves the
 * responder pool. A sector with no occupants has nothing to post a guard
 * *against* and produces no incident for a responder to answer —
 * `sampleSectorRisk` in `src/simulation/runtime/new-session.ts` already reads
 * `staffingShortfall` as `0` whenever `required` is `0`, so this makes the
 * risk term unreachable rather than undefined. The floor is restored by the
 * first admission, at which point both of its arguments start applying again.
 *
 * ## Why the exemption is the derived sector's alone
 *
 * `resolveSectorOccupants` (`src/simulation/security/sector-occupancy.ts`)
 * answers two different questions under one name, and ADR 0048 decision 1
 * argues the asymmetry at length: **the derived default sector is the prison**,
 * so its occupants are every living prisoner on owned land, while *any other*
 * sector keeps the post-tile rule — the prisoners standing on the single tile a
 * guard is posted to. That narrow rule was safe while occupancy could only
 * *raise* a requirement: undercounting a scenario sector's population meant the
 * authored schedule stood, which is what the schedule is for.
 *
 * It is not safe in the lowering direction, and the first cut of this change
 * got it wrong. Zeroing on the post-tile count would have taken an authored
 * `constantDeploymentSchedule('sector-a', 1)` down to nothing unless a prisoner
 * happened to be standing on exactly one tile — silently withdrawing a
 * requirement its author wrote, on the strength of a measure ADR 0048 itself
 * describes as what a sector without a drawn extent has to settle for. Three
 * scenario fixtures caught it, which is the only reason this paragraph exists
 * rather than a defect.
 *
 * So the exemption is gated on the occupant count being a *complete* measure,
 * and today exactly one sector's is. That is the same shape as
 * `sector-occupancy.ts`'s own rule and it moves with it: the day a player can
 * draw a sector with an extent, that sector's count becomes complete too and
 * this predicate is where it is said so.
 *
 * **What the player is told needs no new sentence**, which is the check that
 * this is a change to a demand rather than to a promise:
 * `describeStaffCoverage` in `src/ui/hud/staff-panel.ts` already maps
 * `required: 0` onto its `success` branch, authored for the exemption case, so
 * an empty prison now reads *Covered* with the existing
 * `securityCoverageMetHint` string and no key is added.
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
export function resolveOccupancyScaledGuardCount(
  scheduledGuardCount: number,
  occupantCount: number,
  /**
   * Whether `occupantCount` is a *complete* count of who is in this sector, or
   * only of who is standing on its post tile
   * (`resolveSectorOccupants`). Defaults to `false`, which is the
   * conservative answer: a caller that does not know keeps the authored
   * schedule, and only a caller that can say "this count is the whole
   * population" unlocks the empty-sector exemption. Every unit fixture that
   * passes two arguments therefore behaves exactly as it did before #533.
   *
   * `sectorOccupantCountIsComplete` is the one place that decides it for a
   * sector id -- see the section above for why this is a precondition rather
   * than a flag.
   */
  occupantCountIsComplete = false,
): number {
  if (scheduledGuardCount <= 0) return scheduledGuardCount;
  /*
   * Issue #533. Checked *before* the floor rather than folded into the
   * `Math.max` below, because the two are different rules and collapsing them
   * would hide that: the `Math.max` says "the population may raise what the
   * schedule authored", and this says "there is nobody here, so the schedule
   * has nobody to author a guard for". Written as `<= 0` for the same reason
   * the `Math.max(0, occupantCount)` below exists -- a negative count is a
   * caller's bug and must not read as a demand.
   */
  if (occupantCountIsComplete && occupantCount <= 0) return 0;
  return Math.max(scheduledGuardCount, Math.ceil(Math.max(0, occupantCount) / DEFAULT_SECTOR_PRISONERS_PER_GUARD));
}

/**
 * Whether a sector's occupant count is the whole of its population, and
 * therefore whether `0` means "empty" rather than "nobody on the post tile"
 * (issue #533).
 *
 * **One sector, and it is the one whose extent is known without being drawn.**
 * ADR 0036 derives `security-sector.prison` from owned land and calls it the
 * prison; ADR 0048 decision 1 makes its occupants every prisoner on that land.
 * A sector somebody registered has an area only they know, so
 * `resolveSectorOccupants` falls back to counting the post tile for it -- an
 * undercount that is harmless while occupancy only raises a requirement and
 * silently destructive if it could lower one.
 *
 * A function of the id rather than a field on `SecuritySectorDefinition`,
 * because a save carries those definitions: a new field would be a schema
 * change (ADR 0038) for a fact that is derivable from the id, and the id of the
 * derived sector is a constant for exactly the reason `default-sector.ts` gives
 * -- it is written into incident records, guard records and gang claims, so it
 * cannot move.
 */
export function sectorOccupantCountIsComplete(sectorId: string): boolean {
  return sectorId === DEFAULT_SECURITY_SECTOR_ID;
}

/** Restated so the constant above cannot drift from ADR 0036's floor without a compile-time reader noticing. */
export const DEFAULT_SECTOR_STAFFING_FLOOR = DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT;
