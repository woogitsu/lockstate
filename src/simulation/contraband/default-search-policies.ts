import type { SearchPolicyDefinition, SearchScope } from './search-policy';

/**
 * The four search policies every session has
 * ([ADR 0073](../../../docs/adr/0073-who-orders-a-contraband-search.md) Part 1,
 * answering issue #552).
 *
 * ## What was missing, measured
 *
 * `new-session.ts` opened with `const searchPolicies: SearchPolicyDefinition[] = []`
 * and nothing in `src/` ever pushed to it, so `SearchSystem.findPolicy` --
 * *"No search policy defined for scope ..."* -- would have thrown on the first
 * search any session ordered. That is why ADR 0073 records this part as **not
 * optional under any of its options**: an empty list makes a documented public
 * method throw, which is a latent crash rather than a balance question.
 *
 * Measured on `6c309fc` before this module existed, through the real command
 * path (twelve admissions, three guards, 38,400 ticks = sixteen in-game days):
 * two contraband items introduced, both still `'concealed'`, `searchesQueued`,
 * `searchesCompleted` and `itemsDiscovered` all `0`, and the status strip's
 * **Contraband** figure -- which reads `searchSystem.getMetrics().itemsDiscovered`
 * (`src/simulation/presentation/status-strip-projection.ts`) -- structurally
 * pinned at 0.
 *
 * ## Data, not a condition chain
 *
 * `AGENTS.md` boundary 6 puts content definitions in data modules, and
 * `SearchPolicyDefinition`'s own docblock places these specifically: *"Session/
 * scenario-provided data, not a Zod content catalog"* -- the same class as
 * `DeploymentSchedule` and `DEFAULT_SECTOR_RISK_POLICY`, which is why they are
 * plain frozen records here rather than catalogue entries with a schema and a
 * `nameKey`.
 *
 * ## The numbers are directional, not a balance decision
 *
 * The same standing this repository gives `DEFAULT_CONTRABAND_INTRODUCTION_POLICY`,
 * `DEFAULT_SECTOR_RISK_POLICY` and `DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL`:
 * issue #27 puts *"final balance of detection probabilities"* out of scope
 * explicitly, and ADR 0073's recommendation is to ship a standing duty **first**
 * precisely because nobody has ever watched these six numbers per scope run in
 * a real game. The shape they express is one sentence: **the narrower the
 * scope, the longer the search and the better it finds things** -- a frisk of
 * one person is thorough, a sweep across a sector is a spot check.
 *
 * Against the shipped `baseConcealment` values
 * (`src/content/contraband-catalog.ts`: currency 3, phone 4, drug 5, weapon 6,
 * tool 7) the sector sweep below detects a phone at `0.50 - 4 x 0.05 = 0.30`
 * per visit and a tool at `0.15`, against a cell search's `0.50` and `0.35`.
 * Nothing is ever certain and nothing is ever impossible, which is what
 * `resolveDetectionProbability`'s clamp is for.
 *
 * `intelligenceConfidenceBonus` is the one field these numbers cannot yet be
 * judged on: `IntelligenceLedger.report`'s only caller in `src/` is
 * `reportInformantTip`, which has no caller at all, so the term is `0` in every
 * session a player can start. It is authored non-zero anyway because the ADR's
 * argument against a blanket duty rests on it, and a zero here would read as a
 * decision that a tip should not help.
 */
const DEFAULT_SEARCH_POLICY_BY_SCOPE: Record<SearchScope, SearchPolicyDefinition> = {
  /** A frisk: one guard, quick, and the most likely of the four to find what it is looking for -- the whole search is one person. */
  person: { scope: 'person', requiredGuardCount: 1, dwellTicksPerTarget: 20, baseDetectionProbability: 0.75, concealmentPenaltyPerPoint: 0.06, intelligenceConfidenceBonus: 0.2 },
  /** Tossing a cell: the longest dwell of the four, because a room has places to look that a person does not. */
  cell: { scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 40, baseDetectionProbability: 0.7, concealmentPenaltyPerPoint: 0.05, intelligenceConfidenceBonus: 0.2 },
  /** A sweep: many targets, a short dwell at each, and the weakest per-target odds. Breadth is what it buys, and `SectorSearchDutySystem` is its producer. */
  sector: { scope: 'sector', requiredGuardCount: 1, dwellTicksPerTarget: 15, baseDetectionProbability: 0.5, concealmentPenaltyPerPoint: 0.05, intelligenceConfidenceBonus: 0.25 },
  /** Checking a delivery. Unreachable today -- `searchContainerLocations` is empty because #141's delivery bay does not exist to register one -- and authored so the scope is not the one that throws when it does. */
  delivery: { scope: 'delivery', requiredGuardCount: 1, dwellTicksPerTarget: 25, baseDetectionProbability: 0.6, concealmentPenaltyPerPoint: 0.05, intelligenceConfidenceBonus: 0.15 },
};

/**
 * The four, in ascending scope order.
 *
 * A `Record<SearchScope, ...>` above rather than a bare array, so `tsc` fails
 * the day a fifth scope joins the union instead of `findPolicy` throwing at
 * runtime for the one nobody authored -- the exhaustive-`Record`-over-a-named-
 * union shape `simulation-refusals.test.ts` holds refusal reasons to. The array
 * is written out rather than derived from `Object.keys`, because a canonical
 * order is a property this module owes its callers and object key order is a
 * property of how it was typed.
 */
export const DEFAULT_SEARCH_POLICIES: readonly SearchPolicyDefinition[] = [
  DEFAULT_SEARCH_POLICY_BY_SCOPE.cell,
  DEFAULT_SEARCH_POLICY_BY_SCOPE.delivery,
  DEFAULT_SEARCH_POLICY_BY_SCOPE.person,
  DEFAULT_SEARCH_POLICY_BY_SCOPE.sector,
];

/**
 * Fills in every scope `policies` does not already carry, and leaves the rest
 * alone.
 *
 * **Idempotent and payload-wins**, deliberately and for the same reason
 * `applyDefaultSecuritySector` is: it runs in `createNewSimulationRuntime`
 * *and* at the end of `restoreSessionSystems`, after the payload has cleared
 * and refilled the array. So
 *
 * - a save written **before** this module existed carries `searchPolicies: []`
 *   and gains all four on load, which is what stops a restored prison being the
 *   one place `findPolicy` still throws;
 * - a save written **after** carries its own four and keeps them, so a later
 *   re-tuning reaches new prisons rather than rewriting the balance of a game
 *   somebody is already playing;
 * - a scenario that authored its own policy for one scope keeps it and gains
 *   the other three.
 *
 * That is also what keeps **exactly one policy per scope** in the list, which
 * matters more than it looks: `SearchSystem.findPolicy` takes the *first* match
 * and `projectContraband` builds a `Map` keyed by scope, which takes the
 * *last*. Duplicates would make those two disagree about which policy is in
 * force -- the enforced-versus-reported split ADR 0048 decision 3 names. A
 * caller that wants to *replace* a default therefore assigns over the existing
 * entry rather than pushing a second one.
 *
 * No save-schema bump and no migration: `save-schema.ts` already carries a
 * `searchPolicies` array, this adds no field to it, and absence is honoured
 * with a value rather than with a throw (ADR 0038 §1).
 */
export function applyDefaultSearchPolicies(policies: SearchPolicyDefinition[]): void {
  for (const policy of DEFAULT_SEARCH_POLICIES) {
    if (policies.some((existing) => existing.scope === policy.scope)) continue;
    policies.push({ ...policy });
  }
}
