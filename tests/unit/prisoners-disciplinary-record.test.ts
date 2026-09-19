import { describe, expect, it } from 'vitest';
import type { ConfiscationEvent } from '../../src/simulation/contraband/confiscation';
import { IncidentLog, type IncidentRecord } from '../../src/simulation/incidents/incident';
import {
  buildDisciplinaryIndex,
  CONFISCATION_FINDING_POINTS,
  DISCIPLINARY_POINTS_BY_INCIDENT_TYPE,
  LAPSED_INCIDENT_SURCHARGE_POINTS,
  NO_DISCIPLINARY_EVIDENCE,
  SUCCESSFUL_ESCAPE_SURCHARGE_POINTS,
  type DisciplinaryEvidenceSource,
} from '../../src/simulation/prisoners/disciplinary-record';

/**
 * The fold that turns two logs nobody read into a per-prisoner record
 * (issue #80, [ADR 0032](../../docs/adr/0032-incident-consequences-and-classification-review.md)
 * decision 1).
 *
 * Every expectation below is written out as a literal rather than computed from
 * `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE`, except where the *identity* of a
 * constant is the thing being asserted (the two surcharge cases, which compare
 * two folds against each other). A fixture that added the table up would agree
 * with any table, which is the class of fixture issue #375 found three of.
 */

const PRISONER = 7;
const OTHER = 11;

function evidence(incidents: readonly IncidentRecord[], confiscations: readonly ConfiscationEvent[] = []): DisciplinaryEvidenceSource {
  return { incidents: () => incidents, confiscations: () => confiscations };
}

/** Built through the real `IncidentLog`, so the timeline and the terminal state are the ones the simulation writes rather than a hand-shaped object. */
function loggedIncident(options: {
  readonly id?: string;
  readonly type: IncidentRecord['type'];
  readonly participantIds: readonly number[];
  readonly startedAtTick: number;
  readonly endedAtTick?: number;
  readonly terminal?: 'resolved' | 'lapsed';
  readonly escaped?: boolean;
}): IncidentRecord {
  const log = new IncidentLog();
  const id = options.id ?? 'incident-1';
  log.open({ id, type: options.type, sectorId: 'sector.wing-a', participantIds: options.participantIds, severity: 5, causeFactors: [] }, options.startedAtTick);
  if (options.terminal !== undefined) {
    // `active -> resolved` is not a legal transition, so a resolved incident
    // has to travel the real lifecycle to get there.
    const at = options.endedAtTick ?? options.startedAtTick + 100;
    if (options.terminal === 'resolved') {
      log.transition(id, 'notified', options.startedAtTick + 1);
      log.transition(id, 'responding', options.startedAtTick + 2);
    }
    log.transition(id, options.terminal, at, {
      injuredEntityIds: options.terminal === 'lapsed' ? [...options.participantIds] : [],
      propertyDamage: 3,
      escaped: options.escaped ?? false,
    });
  }
  return log.get(id)!;
}

function confiscation(holderId: string, tick: number, itemId = 'contraband-1'): ConfiscationEvent {
  return {
    itemId,
    categoryId: 'contraband.weapon-improvised',
    provenance: { sourceType: 'delivery', sourceId: 'delivery-1', introducedAtTick: 10 },
    foundAtHolder: { kind: 'prisoner', id: holderId },
    searchOrderId: 'search-1',
    foundByGuardId: 0,
    tick,
  };
}

describe('buildDisciplinaryIndex', () => {
  it('has nothing to say about a prison where nothing has happened', () => {
    expect(buildDisciplinaryIndex(NO_DISCIPLINARY_EVIDENCE).size).toBe(0);
  });

  it('ignores an incident that is still running, however bad it is', () => {
    // The consequence must not arrive before the thing that caused it has an
    // outcome: guards may still be walking towards this.
    for (const state of ['active', 'notified', 'responding'] as const) {
      const log = new IncidentLog();
      log.open({ id: 'i', type: 'riot', sectorId: 's', participantIds: [PRISONER], severity: 9, causeFactors: [] }, 100);
      if (state !== 'active') log.transition('i', 'notified', 101);
      if (state === 'responding') log.transition('i', 'responding', 102);
      expect(buildDisciplinaryIndex(evidence(log.all())).get(PRISONER), state).toBeUndefined();
    }
  });

  it('charges every participant of a resolved incident, at the type it was', () => {
    const record = loggedIncident({ type: 'assault', participantIds: [PRISONER, OTHER], startedAtTick: 100, endedAtTick: 400, terminal: 'resolved' });
    const index = buildDisciplinaryIndex(evidence([record]));
    expect(index.get(PRISONER)).toEqual({ points: 2, findingCount: 1, lastFindingTick: 400 });
    expect(index.get(OTHER)).toEqual({ points: 2, findingCount: 1, lastFindingTick: 400 });
  });

  it('dates the finding to when the incident ended, not to when it began', () => {
    // Clean-conduct credit runs off this tick, so the difference is a whole
    // review period's worth of credit in a long incident.
    const record = loggedIncident({ type: 'riot', participantIds: [PRISONER], startedAtTick: 1_000, endedAtTick: 9_000, terminal: 'lapsed' });
    expect(buildDisciplinaryIndex(evidence([record])).get(PRISONER)?.lastFindingTick).toBe(9_000);
  });

  it('costs more when the incident lapsed than when it was contained', () => {
    const contained = loggedIncident({ id: 'a', type: 'riot', participantIds: [PRISONER], startedAtTick: 100, terminal: 'resolved' });
    const lapsed = loggedIncident({ id: 'b', type: 'riot', participantIds: [PRISONER], startedAtTick: 100, terminal: 'lapsed' });
    const containedPoints = buildDisciplinaryIndex(evidence([contained])).get(PRISONER)!.points;
    const lapsedPoints = buildDisciplinaryIndex(evidence([lapsed])).get(PRISONER)!.points;
    expect(lapsedPoints - containedPoints).toBe(LAPSED_INCIDENT_SURCHARGE_POINTS);
    expect(containedPoints).toBe(DISCIPLINARY_POINTS_BY_INCIDENT_TYPE.riot);
  });

  it('costs more when an escape attempt actually got out', () => {
    const attempt = loggedIncident({ id: 'a', type: 'escape-attempt', participantIds: [PRISONER], startedAtTick: 100, terminal: 'resolved' });
    const escape = loggedIncident({ id: 'b', type: 'escape-attempt', participantIds: [PRISONER], startedAtTick: 100, terminal: 'resolved', escaped: true });
    const attemptPoints = buildDisciplinaryIndex(evidence([attempt])).get(PRISONER)!.points;
    const escapePoints = buildDisciplinaryIndex(evidence([escape])).get(PRISONER)!.points;
    expect(escapePoints - attemptPoints).toBe(SUCCESSFUL_ESCAPE_SURCHARGE_POINTS);
  });

  it('accumulates across incidents and confiscations, keeping the latest finding tick', () => {
    const first = loggedIncident({ id: 'a', type: 'assault', participantIds: [PRISONER], startedAtTick: 100, endedAtTick: 500, terminal: 'resolved' });
    const second = loggedIncident({ id: 'b', type: 'assault', participantIds: [PRISONER], startedAtTick: 600, endedAtTick: 900, terminal: 'resolved' });
    const index = buildDisciplinaryIndex(evidence([first, second], [confiscation(String(PRISONER), 700)]));
    expect(index.get(PRISONER)).toEqual({ points: 5, findingCount: 3, lastFindingTick: 900 });
  });

  it('charges a confiscation to the prisoner it was found on, and to nobody else', () => {
    const index = buildDisciplinaryIndex(evidence([], [confiscation(String(PRISONER), 800)]));
    expect(index.get(PRISONER)).toEqual({ points: CONFISCATION_FINDING_POINTS, findingCount: 1, lastFindingTick: 800 });
    expect(index.get(OTHER)).toBeUndefined();
  });

  it('skips a holder id that cannot be a prisoner entity rather than charging index 0', () => {
    // `ContrabandHolder.id` is a string for every holder kind, so a
    // `'prisoner'` holder carrying a non-numeric id is a shape the type
    // permits. Charging it would land on whoever holds entity index 0 --
    // in a real session, the first prisoner ever admitted.
    for (const id of ['', 'prisoner-a', 'NaN', '-1', '1.5']) {
      const index = buildDisciplinaryIndex(evidence([], [confiscation(id, 800)]));
      expect(index.size, id).toBe(0);
    }
  });

  it('reaches the same totals whatever order the evidence arrives in', () => {
    // The determinism property in the form that would actually break: a
    // restored ledger and a live one hand these back in different orders only
    // if something upstream changes, and this asserts the fold cannot care.
    const first = loggedIncident({ id: 'a', type: 'riot', participantIds: [PRISONER], startedAtTick: 100, endedAtTick: 500, terminal: 'lapsed' });
    const second = loggedIncident({ id: 'b', type: 'escape-attempt', participantIds: [PRISONER], startedAtTick: 600, endedAtTick: 900, terminal: 'resolved' });
    const confiscations = [confiscation(String(PRISONER), 300, 'x'), confiscation(String(PRISONER), 1_100, 'y')];

    const forwards = buildDisciplinaryIndex(evidence([first, second], confiscations)).get(PRISONER);
    const backwards = buildDisciplinaryIndex(evidence([second, first], [...confiscations].reverse())).get(PRISONER);
    expect(backwards).toEqual(forwards);
    expect(forwards?.lastFindingTick).toBe(1_100);
  });
});
