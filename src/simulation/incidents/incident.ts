import type { EntityId } from '../entity/entity-store';

export const INCIDENT_RECORD_SCHEMA_VERSION = 1 as const;

/** The representative incident types issue #28 names. */
export type IncidentType = 'assault' | 'escape-attempt' | 'riot' | 'gang-retaliation';

/**
 * The one validated lifecycle every incident progresses through -- issue
 * #28's "detection/notification/escalation/response/resolution/aftermath."
 * `'active'` folds detection+escalation's *observable* result (the
 * incident exists and is running); `'notified'` means responders have been
 * dispatched; `'responding'` means at least one responder has physically
 * arrived. Terminal states are `'resolved'` (responders contained it) and
 * `'lapsed'` (it ran its course with no adequate response -- issue #28's
 * "failed/late response produces consistent outcomes rather than hidden
 * success").
 */
export const INCIDENT_STATES = ['active', 'notified', 'responding', 'resolved', 'lapsed'] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

/** Legal forward-only transitions. An incident never moves backwards; `'lapsed'`/`'resolved'` are terminal. */
const LEGAL_TRANSITIONS: Readonly<Record<IncidentState, readonly IncidentState[]>> = {
  active: ['notified', 'lapsed'],
  notified: ['responding', 'lapsed'],
  responding: ['resolved', 'lapsed'],
  resolved: [],
  lapsed: [],
};

export function isLegalIncidentTransition(from: IncidentState, to: IncidentState): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/**
 * Why an incident fired, kept as explicit named factors rather than a
 * bare severity number -- issue #28's "auditable causes/outcomes" and
 * "incidents are simulation entities/records and domain events, not
 * transient UI popups." Every trigger records exactly what state pushed
 * it over the line, so a debug/aftermath surface can explain a riot
 * without re-deriving it.
 */
export interface IncidentCauseFactor {
  readonly kind: string;
  /** The measured value at trigger time (e.g. a sustained-risk score, a needs deficit). */
  readonly value: number;
}

export interface IncidentTimelineEntry {
  readonly state: IncidentState;
  readonly atTick: number;
}

export interface IncidentOutcome {
  /** Participants left injured. Non-lethal by design -- issue #28 excludes graphic content and tactical combat. */
  readonly injuredEntityIds: readonly EntityId[];
  /** Abstract 0-10 property damage, consumed by a future repair-job/economy system rather than modelled per object here. */
  readonly propertyDamage: number;
  /** True only when an escape-attempt actually got out -- the one outcome later economy/story systems (#29/#31) care about most. */
  readonly escaped: boolean;
}

export interface IncidentRecord {
  readonly schemaVersion: typeof INCIDENT_RECORD_SCHEMA_VERSION;
  readonly id: string;
  readonly type: IncidentType;
  readonly sectorId: string;
  readonly participantIds: readonly EntityId[];
  /** 0-10. Set at trigger time from the same cause factors recorded below; drives required responder count. */
  readonly severity: number;
  readonly causeFactors: readonly IncidentCauseFactor[];
  readonly state: IncidentState;
  readonly timeline: readonly IncidentTimelineEntry[];
  readonly startedAtTick: number;
  readonly outcome?: IncidentOutcome;
}

interface IncidentMutableRecord {
  type: IncidentType;
  sectorId: string;
  participantIds: readonly EntityId[];
  severity: number;
  causeFactors: readonly IncidentCauseFactor[];
  state: IncidentState;
  timeline: IncidentTimelineEntry[];
  startedAtTick: number;
  outcome: IncidentOutcome | undefined;
}

function toRecord(id: string, record: IncidentMutableRecord): IncidentRecord {
  return {
    schemaVersion: INCIDENT_RECORD_SCHEMA_VERSION,
    id,
    type: record.type,
    sectorId: record.sectorId,
    participantIds: record.participantIds,
    severity: record.severity,
    causeFactors: record.causeFactors,
    state: record.state,
    timeline: [...record.timeline],
    startedAtTick: record.startedAtTick,
    ...(record.outcome !== undefined ? { outcome: record.outcome } : {}),
  };
}

export interface OpenIncidentInput {
  readonly id: string;
  readonly type: IncidentType;
  readonly sectorId: string;
  readonly participantIds: readonly EntityId[];
  readonly severity: number;
  readonly causeFactors: readonly IncidentCauseFactor[];
}

/**
 * The auditable incident log -- issue #28's "versioned incident records"
 * and "incident evidence is logged, serializable and available to later
 * economy/story systems." Indexed by sector and by open-vs-terminal state
 * so `IncidentResponseSystem` never scans every incident ever recorded to
 * find the handful still running ("do not scan all actors against all
 * actors each tick").
 */
export class IncidentLog {
  private readonly records = new Map<string, IncidentMutableRecord>();
  private readonly openIds = new Set<string>();
  private readonly openIdsBySectorId = new Map<string, Set<string>>();

  private require(id: string): IncidentMutableRecord {
    const record = this.records.get(id);
    if (record === undefined) throw new RangeError(`Unknown incident id "${id}".`);
    return record;
  }

  public open(input: OpenIncidentInput, tick: number): void {
    if (this.records.has(input.id)) throw new RangeError(`Duplicate incident id "${input.id}".`);
    this.records.set(input.id, {
      type: input.type,
      sectorId: input.sectorId,
      participantIds: [...input.participantIds],
      severity: input.severity,
      causeFactors: [...input.causeFactors],
      state: 'active',
      timeline: [{ state: 'active', atTick: tick }],
      startedAtTick: tick,
      outcome: undefined,
    });
    this.openIds.add(input.id);
    let bucket = this.openIdsBySectorId.get(input.sectorId);
    if (bucket === undefined) {
      bucket = new Set();
      this.openIdsBySectorId.set(input.sectorId, bucket);
    }
    bucket.add(input.id);
  }

  /** Rejects any transition not in `LEGAL_TRANSITIONS` -- "incidents progress through one validated lifecycle." */
  public transition(id: string, to: IncidentState, tick: number, outcome?: IncidentOutcome): void {
    const record = this.require(id);
    if (!isLegalIncidentTransition(record.state, to)) {
      throw new RangeError(`Illegal incident transition for "${id}": "${record.state}" -> "${to}".`);
    }
    record.state = to;
    record.timeline.push({ state: to, atTick: tick });
    if (outcome !== undefined) record.outcome = outcome;
    if (to === 'resolved' || to === 'lapsed') {
      this.openIds.delete(id);
      this.openIdsBySectorId.get(record.sectorId)?.delete(id);
    }
  }

  public get(id: string): IncidentRecord | undefined {
    const record = this.records.get(id);
    return record === undefined ? undefined : toRecord(id, record);
  }

  /** Deterministic: sorted by id. Indexed -- never a scan of terminal incidents. */
  public openIncidents(): readonly IncidentRecord[] {
    return [...this.openIds].sort().map((id) => toRecord(id, this.require(id)));
  }

  /** Indexed by sector, deterministic: sorted by id. */
  public openIncidentsInSector(sectorId: string): readonly IncidentRecord[] {
    const ids = this.openIdsBySectorId.get(sectorId);
    if (ids === undefined || ids.size === 0) return [];
    return [...ids].sort().map((id) => toRecord(id, this.require(id)));
  }

  /** Deterministic: sorted by id. The full auditable log, including terminal incidents. */
  public all(): readonly IncidentRecord[] {
    return [...this.records.keys()].sort().map((id) => toRecord(id, this.require(id)));
  }

  public getSnapshot(): readonly (readonly [string, IncidentMutableRecord])[] {
    return [...this.records.keys()].sort().map((id) => {
      const record = this.require(id);
      return [id, { ...record, participantIds: [...record.participantIds], causeFactors: record.causeFactors.map((factor) => ({ ...factor })), timeline: record.timeline.map((entry) => ({ ...entry })), outcome: record.outcome === undefined ? undefined : { ...record.outcome, injuredEntityIds: [...record.outcome.injuredEntityIds] } }] as const;
    });
  }

  public loadSnapshot(snapshot: ReturnType<IncidentLog['getSnapshot']>): void {
    this.records.clear();
    this.openIds.clear();
    this.openIdsBySectorId.clear();
    for (const [id, record] of snapshot) {
      this.records.set(id, { ...record, participantIds: [...record.participantIds], causeFactors: record.causeFactors.map((factor) => ({ ...factor })), timeline: record.timeline.map((entry) => ({ ...entry })) });
      if (record.state !== 'resolved' && record.state !== 'lapsed') {
        this.openIds.add(id);
        let bucket = this.openIdsBySectorId.get(record.sectorId);
        if (bucket === undefined) {
          bucket = new Set();
          this.openIdsBySectorId.set(record.sectorId, bucket);
        }
        bucket.add(id);
      }
    }
  }
}
