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

describe('IncidentLog: how long a sector has been quiet, without walking the log', () => {
  it('answers the most recent start per sector, and nothing for a sector with no history', () => {
    const log = new IncidentLog();
    log.open({ id: 'a-1', type: 'riot', sectorId: 'block-a', participantIds: [1, 2], severity: 5, causeFactors: [] }, 400);
    log.open({ id: 'b-1', type: 'riot', sectorId: 'block-b', participantIds: [3, 4], severity: 5, causeFactors: [] }, 900);
    log.transition('a-1', 'lapsed', 1_000, { injuredEntityIds: [], propertyDamage: 0, escaped: false });
    log.open({ id: 'a-2', type: 'riot', sectorId: 'block-a', participantIds: [1, 2], severity: 5, causeFactors: [] }, 6_000);

    expect(log.lastIncidentStartedAtTick('block-a')).toBe(6_000);
    expect(log.lastIncidentStartedAtTick('block-b')).toBe(900);
    // Not zero: a sector that has never had an incident is a different state
    // from one whose last incident was at tick 0, and the quiet-period gate in
    // `IncidentTriggerSystem` reads the difference.
    expect(log.lastIncidentStartedAtTick('block-c')).toBeUndefined();
  });

  it('rebuilds the index on restore, so a save does not hand a rioting prison a clean slate', () => {
    // The index is derived rather than persisted -- there is no save-schema
    // field for it -- so `loadSnapshot` is the only thing standing between a
    // restored session and a quiet period that silently expired.
    const log = new IncidentLog();
    log.open({ id: 'a-1', type: 'riot', sectorId: 'block-a', participantIds: [1, 2], severity: 5, causeFactors: [] }, 6_000);
    log.transition('a-1', 'lapsed', 6_050, { injuredEntityIds: [], propertyDamage: 0, escaped: false });

    const restored = new IncidentLog();
    restored.loadSnapshot(log.getSnapshot());

    expect(restored.lastIncidentStartedAtTick('block-a')).toBe(6_000);
  });

  it('takes the latest start rather than the last one replayed, because a snapshot replays in id order', () => {
    // `getSnapshot` sorts by id, and `incident.riot.10` sorts *before*
    // `incident.riot.2` in code-unit order. So a history where the later
    // incident is `.10` replays newest-first, and an index that assigned rather
    // than compared would come back holding the *earlier* tick -- a quiet period
    // that is shorter on the far side of a save than on the near side, for no
    // reason a player could see. The tick order and the id order are opposed
    // here on purpose.
    const log = new IncidentLog();
    log.open({ id: 'incident.riot.2', type: 'riot', sectorId: 'block-a', participantIds: [1, 2], severity: 5, causeFactors: [] }, 4_000);
    log.transition('incident.riot.2', 'lapsed', 4_050, { injuredEntityIds: [], propertyDamage: 0, escaped: false });
    log.open({ id: 'incident.riot.10', type: 'riot', sectorId: 'block-a', participantIds: [1, 2], severity: 5, causeFactors: [] }, 12_000);
    log.transition('incident.riot.10', 'lapsed', 12_050, { injuredEntityIds: [], propertyDamage: 0, escaped: false });

    expect(log.getSnapshot().map(([id]) => id)).toEqual(['incident.riot.10', 'incident.riot.2']);
    expect(log.lastIncidentStartedAtTick('block-a')).toBe(12_000);

    const restored = new IncidentLog();
    restored.loadSnapshot(log.getSnapshot());
    expect(restored.lastIncidentStartedAtTick('block-a')).toBe(12_000);
  });
});

describe('IncidentLog: how long a sector has been quiet *of one kind of incident*', () => {
  /**
   * The per-type index ADR 0061 adds, and the defect it exists to prevent.
   *
   * `IncidentTriggerSystem` now has three producers sharing one sector. Read
   * sector-wide, the quiet period would let whichever fired first silence the
   * other two for its whole window -- so a prison that assaulted every in-game
   * day would stop rioting, which is a behaviour change nobody asked for.
   */
  function twoKinds(): IncidentLog {
    const log = new IncidentLog();
    log.open({ id: 'r-1', type: 'riot', sectorId: 'block-a', participantIds: [1, 2], severity: 5, causeFactors: [] }, 1_000);
    log.open({ id: 'a-1', type: 'assault', sectorId: 'block-a', participantIds: [1, 2], severity: 3, causeFactors: [] }, 9_000);
    return log;
  }

  it('answers per type, and the sector-wide answer is unchanged', () => {
    const log = twoKinds();

    expect(log.lastIncidentStartedAtTick('block-a', 'riot')).toBe(1_000);
    expect(log.lastIncidentStartedAtTick('block-a', 'assault')).toBe(9_000);
    // A type this sector has never had is `undefined`, not the sector's own
    // latest -- the same distinction the sector-wide accessor draws for a
    // sector with no history at all.
    expect(log.lastIncidentStartedAtTick('block-a', 'escape-attempt')).toBeUndefined();
    // And omitting the type still answers what it always answered.
    expect(log.lastIncidentStartedAtTick('block-a')).toBe(9_000);
  });

  it('rebuilds per type on restore, so a save does not hand one producer a clean slate', () => {
    const restored = new IncidentLog();
    restored.loadSnapshot(twoKinds().getSnapshot());

    expect(restored.lastIncidentStartedAtTick('block-a', 'riot')).toBe(1_000);
    expect(restored.lastIncidentStartedAtTick('block-a', 'assault')).toBe(9_000);
    expect(restored.lastIncidentStartedAtTick('block-a', 'escape-attempt')).toBeUndefined();
  });

  it('keeps two sectors’ answers apart for the same type', () => {
    const log = twoKinds();
    log.open({ id: 'a-2', type: 'assault', sectorId: 'block-b', participantIds: [5, 6], severity: 3, causeFactors: [] }, 20_000);

    expect(log.lastIncidentStartedAtTick('block-a', 'assault')).toBe(9_000);
    expect(log.lastIncidentStartedAtTick('block-b', 'assault')).toBe(20_000);
    expect(log.lastIncidentStartedAtTick('block-b', 'riot')).toBeUndefined();
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
