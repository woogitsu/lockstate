import type { EntityId } from '../entity/entity-store';
import type { IncidentRecord, IncidentType } from '../incidents/incident';
import type { ConfiscationEvent } from '../contraband/confiscation';

/**
 * What one prisoner's conduct in custody adds up to, **derived and never
 * stored** (ADR 0032 decision 1).
 *
 * Both fields are integers. `points` is a count of authored, named weights
 * -- never a float sum, never a severity -- so folding a prisoner's findings
 * in any order gives the same total, and a save cannot change it by changing
 * the order the evidence is read back in.
 */
export interface DisciplinaryRecord {
  /** Authored disciplinary points from every finding that stands against this prisoner. */
  readonly points: number;
  /** How many findings those points come from. Not a term in any score -- it is what a panel would show beside the total. */
  readonly findingCount: number;
  /**
   * The tick of the most recent finding, or `undefined` for a prisoner with
   * none. This is the clock clean-conduct credit runs from; a prisoner with
   * no finding at all is credited from their classification tick instead,
   * which the caller supplies because this module cannot see it.
   */
  readonly lastFindingTick: number | undefined;
}

/** A prisoner with nothing against them. Returned rather than `undefined` so a caller never branches on absence. */
export const CLEAN_DISCIPLINARY_RECORD: DisciplinaryRecord = { points: 0, findingCount: 0, lastFindingTick: undefined };

/**
 * What a terminal incident of each type costs every prisoner recorded as a
 * participant.
 *
 * Authored data keyed by the type, not a condition chain and not a function
 * of `IncidentRecord.severity` (`AGENTS.md` boundary 6). **Severity is
 * deliberately not a term**: it is a `number` with no integer guarantee
 * anywhere in its production path, and a float term inside a score that
 * decides a persisted `Uint8Array` value is a determinism hazard bought for
 * no gameplay granularity -- the tier it feeds has four values.
 *
 * An escape attempt is worth more than an assault because it is the one
 * incident type whose whole content is "this person tried to leave", which is
 * exactly what a security classification is about.
 */
export const DISCIPLINARY_POINTS_BY_INCIDENT_TYPE: Readonly<Record<IncidentType, number>> = {
  assault: 2,
  riot: 2,
  'gang-retaliation': 2,
  'escape-attempt': 3,
};

/**
 * Extra points when an incident ended `'lapsed'` rather than `'resolved'` --
 * an incident that ran its course because nobody contained it is a worse
 * event on a record than one that was stopped.
 */
export const LAPSED_INCIDENT_SURCHARGE_POINTS = 1;

/** Extra points when an escape attempt actually got out (`IncidentOutcome.escaped`). */
export const SUCCESSFUL_ESCAPE_SURCHARGE_POINTS = 2;

/** What one contraband item found on a prisoner costs them. One find, one point: the categories carry a `baseConcealment`, which is about hiding an item and not about holding it. */
export const CONFISCATION_FINDING_POINTS = 1;

/**
 * The already-recorded evidence a disciplinary record is folded from.
 *
 * A port rather than the two registries themselves, for the reason
 * `PrisonerGangSource` is one in `prisoner-projection.ts`: `IncidentLog` and
 * `ConfiscationLedger` are session-level and are constructed *after*
 * `PrisonerOperationsRuntime` in `new-session.ts`, so a hard dependency
 * would invert that order. `IncidentLog.all()` and `ConfiscationLedger.all()`
 * satisfy it directly.
 *
 * **`all()`, never `drain()`.** `ConfiscationLedger.drain` exists for exactly
 * the consumer this is (`confiscation.ts` names "#28, not built yet"), and
 * taking it would be wrong here: a drained event is gone, so the record would
 * have to be *accumulated* into persisted per-prisoner state, which is the V6
 * bump ADR 0032 decision 1 declines. Reading non-destructively is what makes
 * the record a pure function of state that a restore reproduces exactly.
 */
export interface DisciplinaryEvidenceSource {
  /** Every incident ever recorded, terminal ones included. `IncidentLog.all()`. */
  incidents(): readonly IncidentRecord[];
  /** Every confiscation ever recorded. `ConfiscationLedger.all()`. */
  confiscations(): readonly ConfiscationEvent[];
}

/** An evidence source that has seen nothing. The default, so a session with no incident pipeline wired reviews against a clean record rather than throwing. */
export const NO_DISCIPLINARY_EVIDENCE: DisciplinaryEvidenceSource = {
  incidents: () => [],
  confiscations: () => [],
};

interface MutableRecord {
  points: number;
  findingCount: number;
  lastFindingTick: number | undefined;
}

function credit(index: Map<EntityId, MutableRecord>, entityId: EntityId, points: number, atTick: number): void {
  const existing = index.get(entityId);
  if (existing === undefined) {
    index.set(entityId, { points, findingCount: 1, lastFindingTick: atTick });
    return;
  }
  existing.points += points;
  existing.findingCount += 1;
  if (existing.lastFindingTick === undefined || atTick > existing.lastFindingTick) existing.lastFindingTick = atTick;
}

/**
 * When the finding was made: the tick the incident reached its terminal
 * state, not the tick it started.
 *
 * `LEGAL_TRANSITIONS` in `incident.ts` gives `'resolved'` and `'lapsed'` no
 * outgoing edges, so a terminal incident's last timeline entry *is* its
 * terminal entry and there is nothing to search for. The fallback to
 * `startedAtTick` covers a record restored with an empty timeline, which the
 * save schema permits (`timeline: z.array(...)` has no minimum) and which
 * would otherwise read as `undefined`.
 */
function findingTickOf(incident: IncidentRecord): number {
  return incident.timeline[incident.timeline.length - 1]?.atTick ?? incident.startedAtTick;
}

function pointsFor(incident: IncidentRecord): number {
  let points = DISCIPLINARY_POINTS_BY_INCIDENT_TYPE[incident.type];
  if (incident.state === 'lapsed') points += LAPSED_INCIDENT_SURCHARGE_POINTS;
  if (incident.outcome?.escaped === true) points += SUCCESSFUL_ESCAPE_SURCHARGE_POINTS;
  return points;
}

/**
 * One prisoner's disciplinary record per prisoner who has one, folded out of
 * the incident log and the confiscation ledger.
 *
 * ## What counts as a finding, and what does not
 *
 * - **A terminal incident**, `'resolved'` or `'lapsed'`. An open incident is
 *   an event in progress, not a finding: charging a prisoner while guards are
 *   still walking towards it would make the consequence arrive before the
 *   thing that caused it has an outcome.
 * - **Every participant of that incident**, and that is a real fidelity
 *   limit rather than a modelling choice. `IncidentRecord` names
 *   `participantIds` and there is no culprit field anywhere in `src/`:
 *   `IncidentTriggerSystem` fills the list from the sector's occupants, so it
 *   is "who was there", not "who did it". The list of injured cannot narrow
 *   it either, and it is worth saying why rather than leaving it to be tried:
 *   `IncidentResponseSystem.lapse` injures **every** participant and its
 *   resolved path injures **nobody**, so `injuredEntityIds` is a function of
 *   the response and carries no information about culpability at all.
 *   Identifying a culprit is adjudication, which issue #80 asks to be a
 *   decision and ADR 0032 leaves open because it needs a command type.
 * - **Every confiscation found on a prisoner.** `foundAtHolder.kind ===
 *   'prisoner'` and the id is the stringified `EntityId`, which is the same
 *   round trip `new-session.ts`'s `locateSearchTarget` already makes
 *   (`Number(target.holderId)`). A find in a cell is deliberately *not*
 *   charged to that cell's occupants: a cell stash has no owner in the model,
 *   and splitting it across occupants would invent one.
 *
 * ## Determinism
 *
 * Pure, integer, and order-independent twice over. Every accumulation is an
 * integer add or a `max`, so the fold's result does not depend on the order
 * the evidence arrives in -- and the evidence arrives canonically anyway
 * (`IncidentLog.all()` sorts by id; the ledger's array is persisted and
 * restored verbatim). No RNG, no clock, and the returned `Map` is only ever
 * `get`-ed by its consumer, never enumerated, so no `Map` iteration order
 * reaches a simulation outcome.
 */
export function buildDisciplinaryIndex(evidence: DisciplinaryEvidenceSource): ReadonlyMap<EntityId, DisciplinaryRecord> {
  const index = new Map<EntityId, MutableRecord>();

  for (const incident of evidence.incidents()) {
    if (incident.state !== 'resolved' && incident.state !== 'lapsed') continue;
    const points = pointsFor(incident);
    const atTick = findingTickOf(incident);
    for (const participantId of incident.participantIds) credit(index, participantId, points, atTick);
  }

  for (const event of evidence.confiscations()) {
    if (event.foundAtHolder.kind !== 'prisoner') continue;
    // A holder id that is not the decimal spelling of a non-negative integer
    // cannot be resolved back to an entity, and guessing one would charge the
    // finding to whoever holds index 0 -- in a real session, the first prisoner
    // ever admitted.
    //
    // The pattern, not `Number.isInteger(Number(id))`, and it is worth saying
    // why because the obvious form is wrong in two directions that a
    // `ContrabandHolder.id` genuinely permits: `Number('')` is `0`, so an empty
    // id charges entity 0, and `Number.parseInt('1.5')` is `1`, so a
    // fractional id charges its floor. `tests/unit/prisoners-disciplinary-record.test.ts`
    // pins both, and found the first of them.
    if (!/^\d+$/.test(event.foundAtHolder.id)) continue;
    credit(index, Number(event.foundAtHolder.id), CONFISCATION_FINDING_POINTS, event.tick);
  }

  return index;
}
