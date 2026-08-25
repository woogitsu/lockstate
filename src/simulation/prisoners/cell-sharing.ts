import type { EntityId } from '../entity/entity-store';

/**
 * One prisoner's placement-relevant record, read straight out of
 * `PrisonerRecordComponent` at the moment allocation runs.
 *
 * Deliberately a view rather than the component: this module is pure, and a
 * pure function of two plain values is the only shape that can be reasoned
 * about without knowing which tick it ran on.
 */
export interface CellSharingView {
  readonly entityId: EntityId;
  /** `PrisonerRecordComponent.riskTier` -- `RiskTier`, 0 (minimal) to 3 (high risk). */
  readonly riskTier: number;
}

/**
 * How badly an arrival and the people already in a cell go together.
 * **Lower is better; 0 is "no concern" and is the floor.**
 *
 * The floor is part of `findBestAvailable`'s contract, not a property of
 * this function alone: that scan stops at the first candidate rated 0, which
 * is what keeps occupant-aware allocation the same cost as the blind
 * `findAvailable` on the common path where a free empty room exists.
 *
 * ## Why a number and not a verdict
 *
 * Issue #79 asks for "a rating, not a boolean -- some pairings are unwise
 * rather than forbidden, and the interesting decisions live in the middle".
 * A number is that rating. What it deliberately is *not* is a named band
 * ("safe"/"unwise"/"forbidden"): naming bands is a product decision, it
 * needs message keys under `src/content/simulation-message-keys.ts`'s
 * completeness gate, and it is one of the questions ADR 0024 leaves open.
 *
 * ## Why classification distance, and only classification distance
 *
 * #79 names four inputs -- gang affiliation, classification distance,
 * shared incident history, vulnerability. Exactly one of them is both
 * populated and reachable from `IntakeSystem` today:
 *
 * - **Classification distance.** `PrisonerRecordComponent.riskTier` is a
 *   four-value scale, written at the `classification` stage one stage
 *   before allocation, and indexed by the same slot index the allocation
 *   branch already has in hand. Used.
 * - **Gang affiliation.** `GangRegistry` is constructed empty by
 *   `new-session.ts` and is not among `IntakeSystem`'s constructor
 *   dependencies. Reaching it is a wiring change with nothing to read.
 * - **Shared incident history.** `IncidentLog` has no per-participant
 *   index; a participant query is a full scan of every incident ever
 *   recorded, on a per-tick allocation path.
 * - **Vulnerability.** No field, no flag, nowhere in `src/`. It does not
 *   exist to be read.
 *
 * So the metric is the **worst classification distance** across the current
 * occupants: `max |arrival.riskTier - occupant.riskTier|`. The direction is
 * the one real cell-sharing risk assessment takes and is not a judgement
 * call -- a wide gap is a high-tier prisoner sharing with someone much
 * lower, which is the pairing #79's own summary names ("a maximum-security
 * prisoner and a vulnerable one"). An empty cell rates 0, so an arrival
 * always prefers an empty cell to any occupied one.
 *
 * ## Determinism
 *
 * Pure. No RNG (`classifyPrisoner` is documented as the only RNG draw in
 * the prisoner slice, and adding one here would shift every later
 * arrival's classification), no clock, no `Map`/`Set` iteration. `max` over
 * integers is order-independent, but the caller passes occupants in
 * ascending entity-id order anyway so that a future term which is *not*
 * order-independent -- a float sum, a short-circuit -- cannot silently
 * introduce a live-versus-restored divergence.
 */
export function rateCellSharing(arrival: CellSharingView, occupants: readonly CellSharingView[]): number {
  let worst = 0;
  for (const occupant of occupants) {
    if (occupant.entityId === arrival.entityId) continue; // Re-rating a cell the arrival is already in.
    const distance = Math.abs(arrival.riskTier - occupant.riskTier);
    if (distance > worst) worst = distance;
  }
  return worst;
}
