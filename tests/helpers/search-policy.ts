import { expect } from 'vitest';
import type { SearchPolicyDefinition } from '../../src/simulation/contraband/search-policy';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * Puts a fixture's own search policy in force, in place of the session default
 * for that scope ([ADR 0073](../../docs/adr/0073-who-orders-a-contraband-search.md)
 * Part 1, issue #552).
 *
 * ## Why a fixture needs this, and why pushing is no longer enough
 *
 * Every session now ships four policies, one per `SearchScope`. Six fixtures in
 * this suite author their own -- a certain-detect policy, a two-guard policy, a
 * scenario's 0.5/0.2 cell policy -- and each of them did it with
 * `runtime.searchPolicies.push(...)`, which appended a **second** entry for a
 * scope that now already has one. `SearchSystem.findPolicy` takes the *first*
 * match, so the pushed policy would silently never be the one in force, while
 * `projectContraband` (a `Map` keyed by scope, so the last match) would report
 * it as though it were.
 *
 * Only one of those six went red on its own: `security-guard-release.test.ts`'s
 * two-guard case, because a guard count is visible in an assertion. The other
 * five stayed green while no longer exercising the policy they name -- a fixture
 * that cannot reach the mechanism it is about, which is the shape
 * `docs/TESTING.md` warns of. This helper is why they still can.
 *
 * ## Replacing, not clearing
 *
 * The other three scopes are left alone deliberately. A fixture that emptied the
 * list would restore the exact condition #552 reports -- `findPolicy` throwing
 * on the first search of any other scope -- inside a test, and a session that
 * saved and reloaded would get the defaults back anyway
 * (`applyDefaultSearchPolicies` runs after the payload), so a cleared list says
 * something different on the two sides of a round trip.
 *
 * The index is asserted rather than tolerated, for the reason
 * `withoutDefaultSectorDeploymentDemand` asserts its own: a helper that quietly
 * pushed instead would leave every caller believing it had replaced a default
 * that had moved somewhere else.
 */
export function useSearchPolicy(runtime: SimulationRuntime, policy: SearchPolicyDefinition): void {
  const index = runtime.searchPolicies.findIndex((existing) => existing.scope === policy.scope);
  expect(index, `every session must ship a default search policy for scope "${policy.scope}"`).toBeGreaterThanOrEqual(0);
  runtime.searchPolicies.splice(index, 1, { ...policy });
  // Exactly one entry per scope is what keeps `findPolicy`'s first match and
  // `projectContraband`'s last match the same policy.
  expect(runtime.searchPolicies.filter((existing) => existing.scope === policy.scope)).toHaveLength(1);
}
