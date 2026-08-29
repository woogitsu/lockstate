import type { IncidentRecord } from './incident';

/**
 * Aggregate outcomes over the incident log.
 *
 * **This file was `alerts.ts` and exported an `IncidentAlert` projection with
 * a `toIncidentAlert` builder. Both were deleted in issue #555, and the file
 * renamed with them.** They are recorded here rather than simply removed,
 * because the deletion is a claim and a reader is entitled to check it.
 *
 * `toIncidentAlert` had no caller outside its own test for as long as it had
 * existed, and #555 arrived reading like the wiring somebody forgot: a riot
 * was running and the HUD's alerts list said "No active alerts", with a
 * function called `toIncidentAlert` sitting unused one directory over. It was
 * neither the fix nor a missed wiring, on two counts.
 *
 * - **It was superseded.** `IncidentRowViewModel`
 *   (`src/simulation/presentation/incident-projection.ts`) carries every one
 *   of `IncidentAlert`'s seven fields -- `incidentId`, `type`, `sectorId`,
 *   `state`, `severity`, `participantCount`, `startedAtTick` -- plus a
 *   severity bar, an age, the outcome and the required responder count, makes
 *   the same decision to withhold `causeFactors` and cites this file for it,
 *   and unlike this one it is reachable: `projection-catalog.ts` serves it on
 *   the `hud/incidents` route. Keeping both would have been two answers to one
 *   question, and the unreachable one would have rotted.
 * - **It could not have been adapted into the fix.** The events channel
 *   *"carries no identity"* (`SimulationEventLog`) -- no entity id, no
 *   incident id, no sector -- and identity is what every field `IncidentAlert`
 *   adds beyond the incident's kind consists of. What #555 needed from a
 *   record was one number, `participantIds.length`, and
 *   `IncidentTriggerSystem.openIncident` reads it off the input it just built.
 *
 * What the withholding rule loses by the deletion is nothing:
 * `tests/unit/hud-projections.test.ts`, *"never exposes the hidden cause
 * factors that produced an incident"*, asserts it over the projection that a
 * player can actually reach.
 */

/** Post-incident metrics for a future economy/story consumer (#29/#31) -- aggregate outcomes, still no hidden calculations. */
export interface IncidentSummaryMetrics {
  readonly total: number;
  readonly resolved: number;
  readonly lapsed: number;
  readonly stillOpen: number;
  readonly totalInjured: number;
  readonly totalPropertyDamage: number;
  readonly escapes: number;
}

export function summarizeIncidents(incidents: readonly IncidentRecord[]): IncidentSummaryMetrics {
  let resolved = 0;
  let lapsed = 0;
  let stillOpen = 0;
  let totalInjured = 0;
  let totalPropertyDamage = 0;
  let escapes = 0;

  for (const incident of incidents) {
    if (incident.state === 'resolved') resolved += 1;
    else if (incident.state === 'lapsed') lapsed += 1;
    else stillOpen += 1;

    const outcome = incident.outcome;
    if (outcome === undefined) continue;
    totalInjured += outcome.injuredEntityIds.length;
    totalPropertyDamage += outcome.propertyDamage;
    if (outcome.escaped) escapes += 1;
  }

  return { total: incidents.length, resolved, lapsed, stillOpen, totalInjured, totalPropertyDamage, escapes };
}
