import { describe, expect, it } from 'vitest';
import { IncidentLog, INCIDENT_RECORD_SCHEMA_VERSION, isLegalIncidentTransition, type IncidentState } from '../../src/simulation/incidents/incident';
import { summarizeIncidents, toIncidentAlert } from '../../src/simulation/incidents/alerts';

function openOne(log: IncidentLog, id = 'incident-1'): void {
  log.open({ id, type: 'assault', sectorId: 'block-a', participantIds: [3, 1], severity: 4, causeFactors: [{ kind: 'gang-grudge', value: 0.7 }] }, 10);
}

describe('IncidentLog: one validated, forward-only lifecycle', () => {
  it('opens an incident in the active state with a versioned, auditable record', () => {
    const log = new IncidentLog();
    openOne(log);

    expect(log.get('incident-1')).toEqual({
      schemaVersion: INCIDENT_RECORD_SCHEMA_VERSION,
      id: 'incident-1',
      type: 'assault',
      sectorId: 'block-a',
      participantIds: [3, 1],
      severity: 4,
      causeFactors: [{ kind: 'gang-grudge', value: 0.7 }],
      state: 'active',
      timeline: [{ state: 'active', atTick: 10 }],
      startedAtTick: 10,
    });
  });

  it('rejects a duplicate incident id', () => {
    const log = new IncidentLog();
    openOne(log);
    expect(() => openOne(log)).toThrow(/Duplicate incident id/);
  });

  it('records each legal transition on the timeline in order', () => {
    const log = new IncidentLog();
    openOne(log);
    log.transition('incident-1', 'notified', 20);
    log.transition('incident-1', 'responding', 30);
    log.transition('incident-1', 'resolved', 90, { injuredEntityIds: [], propertyDamage: 2, escaped: false });

    const incident = log.get('incident-1')!;
    expect(incident.timeline).toEqual([
      { state: 'active', atTick: 10 },
      { state: 'notified', atTick: 20 },
      { state: 'responding', atTick: 30 },
      { state: 'resolved', atTick: 90 },
    ]);
    expect(incident.outcome).toEqual({ injuredEntityIds: [], propertyDamage: 2, escaped: false });
  });

  it('rejects illegal transitions, including backwards moves and any move out of a terminal state', () => {
    const log = new IncidentLog();
    openOne(log);
    expect(() => log.transition('incident-1', 'responding', 20)).toThrow(/Illegal incident transition/); // skips 'notified'
    expect(() => log.transition('incident-1', 'resolved', 20)).toThrow(/Illegal incident transition/);

    log.transition('incident-1', 'notified', 20);
    expect(() => log.transition('incident-1', 'active', 21)).toThrow(/Illegal incident transition/); // backwards

    log.transition('incident-1', 'lapsed', 30);
    expect(() => log.transition('incident-1', 'resolved', 40)).toThrow(/Illegal incident transition/); // terminal
  });

  it('exposes the transition table directly and agrees with the log', () => {
    expect(isLegalIncidentTransition('active', 'notified')).toBe(true);
    expect(isLegalIncidentTransition('active', 'lapsed')).toBe(true);
    expect(isLegalIncidentTransition('active', 'responding')).toBe(false);
    for (const terminal of ['resolved', 'lapsed'] as IncidentState[]) {
      expect(isLegalIncidentTransition(terminal, 'active')).toBe(false);
    }
  });

  it('indexes open incidents by sector and drops them from that index once terminal', () => {
    const log = new IncidentLog();
    openOne(log, 'incident-a');
    log.open({ id: 'incident-b', type: 'riot', sectorId: 'block-b', participantIds: [], severity: 7, causeFactors: [] }, 12);

    expect(log.openIncidents().map((incident) => incident.id)).toEqual(['incident-a', 'incident-b']);
    expect(log.openIncidentsInSector('block-a').map((incident) => incident.id)).toEqual(['incident-a']);

    log.transition('incident-a', 'lapsed', 40);
    expect(log.openIncidentsInSector('block-a')).toEqual([]);
    expect(log.openIncidents().map((incident) => incident.id)).toEqual(['incident-b']);
    expect(log.all()).toHaveLength(2); // still in the full auditable log
  });

  it('snapshot/restore preserves records, timelines and the open-incident indices', () => {
    const log = new IncidentLog();
    openOne(log, 'incident-a');
    log.transition('incident-a', 'notified', 20);
    log.open({ id: 'incident-b', type: 'riot', sectorId: 'block-b', participantIds: [5], severity: 8, causeFactors: [] }, 12);
    log.transition('incident-b', 'lapsed', 50, { injuredEntityIds: [5], propertyDamage: 8, escaped: false });

    const restored = new IncidentLog();
    restored.loadSnapshot(log.getSnapshot());

    expect(restored.all()).toEqual(log.all());
    expect(restored.openIncidents().map((incident) => incident.id)).toEqual(['incident-a']);
    expect(restored.openIncidentsInSector('block-b')).toEqual([]);
    // The restored log still enforces the lifecycle from the restored state.
    expect(() => restored.transition('incident-a', 'active', 60)).toThrow(/Illegal incident transition/);
    restored.transition('incident-a', 'responding', 60);
    expect(restored.get('incident-a')!.state).toBe('responding');
  });
});

describe('incident alerts and summary: player-visible projections only', () => {
  it('an alert withholds the raw cause factors that produced the incident', () => {
    const log = new IncidentLog();
    openOne(log);
    const alert = toIncidentAlert(log.get('incident-1')!);

    expect(alert).toEqual({ incidentId: 'incident-1', type: 'assault', sectorId: 'block-a', state: 'active', severity: 4, participantCount: 2, startedAtTick: 10 });
    expect(Object.keys(alert)).not.toContain('causeFactors');
  });

  it('summarizes resolved/lapsed/open incidents with aggregate outcomes', () => {
    const log = new IncidentLog();
    openOne(log, 'incident-a');
    log.transition('incident-a', 'notified', 20);
    log.transition('incident-a', 'responding', 30);
    log.transition('incident-a', 'resolved', 90, { injuredEntityIds: [], propertyDamage: 2, escaped: false });

    log.open({ id: 'incident-b', type: 'escape-attempt', sectorId: 'block-b', participantIds: [7], severity: 9, causeFactors: [] }, 100);
    log.transition('incident-b', 'lapsed', 800, { injuredEntityIds: [7], propertyDamage: 9, escaped: true });

    log.open({ id: 'incident-c', type: 'riot', sectorId: 'block-c', participantIds: [1, 2], severity: 6, causeFactors: [] }, 900);

    expect(summarizeIncidents(log.all())).toEqual({
      total: 3, resolved: 1, lapsed: 1, stillOpen: 1,
      totalInjured: 1, totalPropertyDamage: 11, escapes: 1,
    });
  });
});
