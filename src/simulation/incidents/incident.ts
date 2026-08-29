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
  /**
   * The tick the most recent incident in each sector *started*, so a caller can
   * ask how long a sector has been quiet without walking the log.
   *
   * A third derived index rather than a fourth persisted field, and derived is
   * the whole point: `IncidentTriggerSystem`'s quiet period is read from it
   * every sampling point, `all()` grows for the life of a prison and is never
   * pruned ("Nothing is ever deleted"), and a per-sample scan of the full
   * auditable history is exactly what `openIdsBySectorId` exists to avoid. It
   * is rebuilt from the records in `loadSnapshot`, so the save format does not
   * move and a restored session answers what a live one answers.
   */
  private readonly lastStartedAtTickBySectorId = new Map<string, number>();

  /**
   * How many *open* riots name each prisoner as a participant, so a caller can
   * ask "is this prisoner rioting right now" in one map lookup rather than by
   * walking `openIncidents()`.
   *
   * A fourth derived index of exactly the shape the three above have, and it
   * exists for the reason `lastStartedAtTickBySectorId` does: its reader runs
   * often. `ActionSystem.beginNextAction` asks once per idle prisoner per
   * reconsideration cycle, and `openIncidents()` allocates a sorted array and a
   * fresh `IncidentRecord` per open incident every time it is called — a cost
   * per prisoner per cycle for a question whose answer changes twice in an
   * incident's life. Rebuilt in `loadSnapshot`, so the save format does not
   * move and a restored session answers what a live one answers.
   *
   * **A count, not a set**, because two sectors can riot at once and
   * `resolveSectorOccupants` can legitimately name one prisoner in both: the
   * derived default sector is the whole prison
   * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)) and
   * any other registered sector keeps the post-tile rule, so a prisoner
   * standing on another sector's post tile is an occupant of two. With a set,
   * closing the first riot would end the second one's override; with a count it
   * cannot.
   *
   * Only `'riot'` is indexed. The categories a rioting prisoner is restricted
   * to are authored for a riot (`riot-regime.ts`), and reading them onto
   * `'gang-retaliation'` — the only other type anything in `src/` opens — would
   * be a content decision with no measurement behind it. See ADR 0057's open
   * questions.
   */
  private readonly openRiotCountByParticipant = new Map<EntityId, number>();

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
    this.noteStart(input.sectorId, tick);
    this.noteRiotParticipants(input.type, input.participantIds, 1);
  }

  /**
   * Moves each participant's open-riot count by `delta`, for a record that has
   * just opened (`+1`) or just reached a terminal state (`-1`).
   *
   * Deliberately keyed off the record's own `participantIds` on both sides, so
   * the decrement can only ever undo the increment the same record made — a
   * participant list is `readonly` from the moment `open` copies it, and
   * nothing in this class rewrites one.
   */
  private noteRiotParticipants(type: IncidentType, participantIds: readonly EntityId[], delta: 1 | -1): void {
    if (type !== 'riot') return;
    for (const entityId of participantIds) {
      const next = (this.openRiotCountByParticipant.get(entityId) ?? 0) + delta;
      if (next > 0) this.openRiotCountByParticipant.set(entityId, next);
      else this.openRiotCountByParticipant.delete(entityId);
    }
  }

  /**
   * Whether this prisoner is named as a participant in a riot that is still
   * open — the question `riot-regime.ts`'s override resolver asks on the
   * action-selection path (ADR 0057).
   *
   * "Still open" is `'active' | 'notified' | 'responding'`, the three
   * non-terminal states, and that is the whole of the override's lifetime:
   * there is no separate lift step to forget, because `transition` to
   * `'resolved'` or `'lapsed'` is the same call that closes the incident for
   * every other reader.
   */
  public isOpenRiotParticipant(entityId: EntityId): boolean {
    return this.openRiotCountByParticipant.has(entityId);
  }

  /**
   * `Math.max` rather than an assignment: `open` is called with the kernel's
   * current tick and nothing orders two sectors' incidents against each other,
   * but `loadSnapshot` replays a whole history in id order, which is not tick
   * order -- `incident.riot.10` sorts before `incident.riot.2`. Taking the
   * larger makes the index a function of the set of records rather than of the
   * order they arrive in, which is what lets the live and restored answers
   * agree.
   */
  private noteStart(sectorId: string, tick: number): void {
    const previous = this.lastStartedAtTickBySectorId.get(sectorId);
    if (previous === undefined || tick > previous) this.lastStartedAtTickBySectorId.set(sectorId, tick);
  }

  /** When the most recent incident in this sector opened, or `undefined` where none ever has. */
  public lastIncidentStartedAtTick(sectorId: string): number | undefined {
    return this.lastStartedAtTickBySectorId.get(sectorId);
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
      this.noteRiotParticipants(record.type, record.participantIds, -1);
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
    this.lastStartedAtTickBySectorId.clear();
    this.openRiotCountByParticipant.clear();
    for (const [id, record] of snapshot) {
      this.records.set(id, { ...record, participantIds: [...record.participantIds], causeFactors: record.causeFactors.map((factor) => ({ ...factor })), timeline: record.timeline.map((entry) => ({ ...entry })) });
      this.noteStart(record.sectorId, record.startedAtTick);
      if (record.state !== 'resolved' && record.state !== 'lapsed') {
        this.noteRiotParticipants(record.type, record.participantIds, 1);
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
