import type { IncidentRecord, IncidentState, IncidentType } from './incident';

/**
 * What a player actually sees about an incident -- issue #28's "alerts/
 * logs reveal appropriate information without exposing all hidden
 * calculations." Deliberately a *projection*, not the record: the
 * incident's `causeFactors` (the raw risk/grudge scores that produced it)
 * are withheld, exactly like #27's contraband ground truth stays behind
 * its intelligence projection.
 */
export interface IncidentAlert {
  readonly incidentId: string;
  readonly type: IncidentType;
  readonly sectorId: string;
  readonly state: IncidentState;
  readonly severity: number;
  readonly participantCount: number;
  readonly startedAtTick: number;
}

export function toIncidentAlert(incident: IncidentRecord): IncidentAlert {
  return {
    incidentId: incident.id,
    type: incident.type,
    sectorId: incident.sectorId,
    state: incident.state,
    severity: incident.severity,
    participantCount: incident.participantIds.length,
    startedAtTick: incident.startedAtTick,
  };
}

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
