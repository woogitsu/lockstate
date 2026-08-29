import type { EntityId } from '../entity/entity-store';
import type {
  IncidentRecord,
  IncidentState,
  IncidentTimelineEntry,
  IncidentType,
} from '../incidents/incident';
import { INCIDENT_STATES } from '../incidents/incident';
import {
  compareEntityIds,
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  pageOf,
  toBoundedValue,
  type BoundedValue,
  type HudViewModelSchemaVersion,
  type PageRequest,
  type ViewModelPage,
} from './view-model';

/**
 * **What this projection deliberately does not carry.**
 *
 * `IncidentRecord.causeFactors` -- the raw sustained-risk score, needs
 * deficit and staffing shortfall that produced an incident -- is withheld:
 * issue #28's "alerts/logs reveal appropriate information without exposing
 * all hidden calculations." The `SectorRiskTracker`'s running score is
 * withheld for the same reason.
 *
 * **This used to name a second module applying the same rule -- an
 * `IncidentAlert` projection, in the file now called
 * `src/simulation/incidents/incident-summary.ts` -- and that projection no
 * longer exists.** It was deleted in issue #555 as superseded by this one,
 * which carries every field it did and is the only one a session serves; the
 * deletion's argument is kept in that file. So this is not merely the second
 * place the rule is applied any more, it is the only one, which is why the
 * rule is stated here outright rather than by reference.
 *
 * The dead module is deliberately not spelled as a rooted path:
 * `tests/foundation/documentation-links-contract.test.ts` requires every one
 * cited in a source comment to be on disk, and it caught this sentence's first
 * draft doing exactly that. The timeline is *not*
 * hidden: it is a record of what visibly happened and when.
 *
 * Severity and property damage keep their raw rank alongside a
 * `BoundedValue`, unlike needs: `incident.ts` documents both as published
 * `0-10` scales, so "severity 8" is a meaningful thing to render, whereas
 * a need's `0-255` storage width is not.
 */

export const INCIDENT_SEVERITY_MAX = 10;
export const INCIDENT_PROPERTY_DAMAGE_MAX = 10;

export interface IncidentLogSource {
  openIncidents(): readonly IncidentRecord[];
  all(): readonly IncidentRecord[];
  get(id: string): IncidentRecord | undefined;
}

export interface IncidentTriggerMetricsSource {
  getMetrics(): {
    readonly incidentsTriggered: number;
    readonly riotsTriggered: number;
    readonly retaliationsTriggered: number;
  };
}

export interface IncidentResponseMetricsSource {
  getMetrics(): {
    readonly incidentsResolved: number;
    readonly incidentsLapsed: number;
    readonly respondersDispatched: number;
    readonly routeFailures: number;
  };
  requiredResponderCount(severity: number): number;
}

export interface IncidentProjectionSource {
  readonly incidents: IncidentLogSource;
  readonly trigger?: IncidentTriggerMetricsSource;
  readonly response?: IncidentResponseMetricsSource;
}

export interface IncidentOutcomeViewModel {
  readonly injuredCount: number;
  readonly propertyDamage: number;
  readonly propertyDamageBar: BoundedValue;
  readonly escaped: boolean;
}

export interface IncidentRowViewModel {
  readonly incidentId: string;
  readonly type: IncidentType;
  readonly sectorId: string;
  readonly state: IncidentState;
  /** `true` for `'resolved'` and `'lapsed'`; the lifecycle is forward-only and both are terminal. */
  readonly terminal: boolean;
  readonly severity: number;
  readonly severityBar: BoundedValue;
  readonly participantCount: number;
  readonly startedAtTick: number;
  /** Ticks elapsed since it started, at the tick the projection was taken. */
  readonly ageTicks: number;
  /** Absent while still open. */
  readonly outcome?: IncidentOutcomeViewModel;
  /** Absent unless a response system was supplied. */
  readonly requiredResponders?: number;
}

export interface IncidentDetailViewModel extends IncidentRowViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  /** Ascending entity id. */
  readonly participantEntityIds: readonly EntityId[];
  /** Chronological -- the order the incident actually progressed. */
  readonly timeline: readonly { readonly state: IncidentState; readonly atTick: number }[];
  readonly injuredEntityIds: readonly EntityId[];
}

export interface IncidentsViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  /** Every still-open incident, ascending incident id (the log's indexed accessor). */
  readonly active: readonly IncidentRowViewModel[];
  /** Terminal incidents, ascending incident id, windowed. */
  readonly resolved: ViewModelPage<IncidentRowViewModel>;
  readonly summary: {
    readonly total: number;
    readonly stillOpen: number;
    readonly resolved: number;
    readonly lapsed: number;
    readonly totalInjured: number;
    readonly totalPropertyDamage: number;
    readonly escapes: number;
  };
  /** Fixed declared order, so a state row never appears and vanishes. */
  readonly countsByState: readonly { readonly state: IncidentState; readonly count: number }[];
  readonly countsByType: readonly { readonly type: IncidentType; readonly count: number }[];
  readonly triggerMetrics?: {
    readonly incidentsTriggered: number;
    readonly riotsTriggered: number;
    readonly retaliationsTriggered: number;
  };
  readonly responseMetrics?: {
    readonly incidentsResolved: number;
    readonly incidentsLapsed: number;
    readonly respondersDispatched: number;
    readonly routeFailures: number;
  };
}

const INCIDENT_TYPES: readonly IncidentType[] = ['assault', 'escape-attempt', 'gang-retaliation', 'riot'];

function isTerminal(state: IncidentState): boolean {
  return state === 'resolved' || state === 'lapsed';
}

function projectOutcome(record: IncidentRecord): IncidentOutcomeViewModel | undefined {
  const outcome = record.outcome;
  if (outcome === undefined) return undefined;
  return {
    injuredCount: outcome.injuredEntityIds.length,
    propertyDamage: outcome.propertyDamage,
    propertyDamageBar: toBoundedValue(outcome.propertyDamage, INCIDENT_PROPERTY_DAMAGE_MAX),
    escaped: outcome.escaped,
  };
}

function projectRow(
  record: IncidentRecord,
  tick: number,
  response: IncidentResponseMetricsSource | undefined,
): IncidentRowViewModel {
  const outcome = projectOutcome(record);
  return {
    incidentId: record.id,
    type: record.type,
    sectorId: record.sectorId,
    state: record.state,
    terminal: isTerminal(record.state),
    severity: record.severity,
    severityBar: toBoundedValue(record.severity, INCIDENT_SEVERITY_MAX),
    participantCount: record.participantIds.length,
    startedAtTick: record.startedAtTick,
    ageTicks: Math.max(0, tick - record.startedAtTick),
    ...(outcome !== undefined ? { outcome } : {}),
    ...(response !== undefined ? { requiredResponders: response.requiredResponderCount(record.severity) } : {}),
  };
}

/**
 * The incidents panel: what is happening now, what has finished, and the
 * aggregate outcome.
 *
 * `tick` is required to report an incident's age; simulation code may not
 * read an ambient clock (`docs/DETERMINISM.md`).
 *
 * **Cost.** `IncidentLog` indexes open incidents, so `active` is
 * `O(openIncidents)`. Terminal incidents are **not** indexed -- the only
 * accessor is `all()`, which materialises every incident ever recorded --
 * so `resolved.total` costs `O(allIncidentsEverRecorded)` regardless of
 * the requested window. That grows across a long session; it is reported
 * as a gap rather than worked around here.
 */
export function projectIncidents(
  source: IncidentProjectionSource,
  tick: number,
  request: PageRequest = {},
): IncidentsViewModel {
  const all = source.incidents.all();

  const countsByState = new Map<IncidentState, number>();
  const countsByType = new Map<IncidentType, number>();
  const terminalRows: IncidentRowViewModel[] = [];
  let stillOpen = 0;
  let resolved = 0;
  let lapsed = 0;
  let totalInjured = 0;
  let totalPropertyDamage = 0;
  let escapes = 0;

  for (const record of all) {
    countsByState.set(record.state, (countsByState.get(record.state) ?? 0) + 1);
    countsByType.set(record.type, (countsByType.get(record.type) ?? 0) + 1);

    if (record.state === 'resolved') resolved += 1;
    else if (record.state === 'lapsed') lapsed += 1;
    else stillOpen += 1;

    if (isTerminal(record.state)) terminalRows.push(projectRow(record, tick, source.response));

    const outcome = record.outcome;
    if (outcome === undefined) continue;
    totalInjured += outcome.injuredEntityIds.length;
    totalPropertyDamage += outcome.propertyDamage;
    if (outcome.escaped) escapes += 1;
  }

  const triggerMetrics = source.trigger?.getMetrics();
  const responseMetrics = source.response?.getMetrics();

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    active: source.incidents.openIncidents().map((record) => projectRow(record, tick, source.response)),
    resolved: pageOf(terminalRows, request),
    summary: { total: all.length, stillOpen, resolved, lapsed, totalInjured, totalPropertyDamage, escapes },
    countsByState: INCIDENT_STATES.map((state) => ({ state, count: countsByState.get(state) ?? 0 })),
    countsByType: INCIDENT_TYPES.map((type) => ({ type, count: countsByType.get(type) ?? 0 })),
    ...(triggerMetrics !== undefined ? { triggerMetrics } : {}),
    ...(responseMetrics !== undefined ? { responseMetrics } : {}),
  };
}

/** `undefined` for an unknown incident id. */
export function projectIncidentDetail(
  source: IncidentProjectionSource,
  incidentId: string,
  tick: number,
): IncidentDetailViewModel | undefined {
  const record = source.incidents.get(incidentId);
  if (record === undefined) return undefined;

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    ...projectRow(record, tick, source.response),
    participantEntityIds: [...record.participantIds].sort(compareEntityIds),
    timeline: record.timeline.map((entry: IncidentTimelineEntry) => ({ state: entry.state, atTick: entry.atTick })),
    injuredEntityIds: [...(record.outcome?.injuredEntityIds ?? [])].sort(compareEntityIds),
  };
}
