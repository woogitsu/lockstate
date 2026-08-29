import { describe, expect, it } from 'vitest';
import { SimulationEventLog } from '../../src/simulation/events';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { GangRegistry } from '../../src/simulation/incidents/gangs';
import { IncidentLog } from '../../src/simulation/incidents/incident';
import { DEFAULT_SECTOR_RISK_POLICY, SectorRiskTracker, type SectorRiskSample } from '../../src/simulation/incidents/sector-risk';
import {
  DEFAULT_MINIMUM_RIOT_PARTICIPANTS,
  DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT,
  IncidentTriggerSystem,
  type PrisonerFlashpointSampler,
} from '../../src/simulation/incidents/trigger-system';
import type { PrisonerFlashpoint } from '../../src/simulation/incidents/flashpoint';

const CALM: SectorRiskSample = { needsPressure: 0, staffingShortfall: 0, contrabandPressure: 0 };
const HOT: SectorRiskSample = { needsPressure: 1, staffingShortfall: 1, contrabandPressure: 1 };

/**
 * Two prisoners, because a riot needs `DEFAULT_MINIMUM_RIOT_PARTICIPANTS` of
 * them and most files below are about the *window* rather than about who is in
 * the sector.
 *
 * It used to be nobody, which was invisible while occupancy fed only the
 * participant list; since ADR 0048 it is also the gate on whether a riot can
 * open at all, and a harness that supplied an empty sector would have made
 * every sustained-window assertion below pass for the wrong reason. Two ids,
 * not one, and deliberately out of ascending order so a fixture that stopped
 * sorting would be visible.
 */
const TWO_OCCUPANTS = (): readonly number[] => [6, 2];

function buildHarness(options: {
  readonly sectorIds: readonly string[];
  readonly sampleFor: (sectorId: string, tick: number) => SectorRiskSample;
  readonly occupants?: (sectorId: string) => readonly number[];
  readonly gangs?: GangRegistry;
  /** Defaults to the production value; a file measuring the streak alone passes 0 to take the quiet period out of the way. */
  readonly quietTicksAfterIncident?: number;
  /** ADR 0061's per-occupant sampler. Omitted, the system opens riots and gang retaliations exactly as it did before. */
  readonly sampleFlashpoints?: PrisonerFlashpointSampler;
}) {
  const incidents = new IncidentLog();
  const events = new SimulationEventLog();
  const risk = new SectorRiskTracker(DEFAULT_SECTOR_RISK_POLICY);
  const gangs = options.gangs ?? new GangRegistry();
  const trigger = new IncidentTriggerSystem(
    incidents,
    risk,
    gangs,
    options.sectorIds,
    options.sampleFor,
    options.occupants ?? TWO_OCCUPANTS,
    events,
    undefined,
    options.quietTicksAfterIncident,
    undefined,
    options.sampleFlashpoints,
  );
  const kernel = new Kernel();
  kernel.registerSystem(trigger);
  return { incidents, events, risk, gangs, trigger, kernel };
}

/** The trigger system samples every 50 ticks, so one "sampling point" is 50 kernel ticks. */
const SAMPLE_INTERVAL = 50;
function stepSamples(kernel: Kernel, count: number): void {
  for (let i = 0; i < count * SAMPLE_INTERVAL; i += 1) kernel.step();
}

describe('IncidentTriggerSystem: sustained conditions, never a one-sample spike', () => {
  it('a single hot sampling point does not open a riot', () => {
    let hot = true;
    const { incidents, kernel } = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => {
        const sample = hot ? HOT : CALM;
        hot = false; // hot exactly once
        return sample;
      },
    });

    stepSamples(kernel, 5);
    expect(incidents.all()).toEqual([]);
  });

  it('an oscillating sector never riots, however long it runs', () => {
    let sampleIndex = 0;
    const { incidents, kernel } = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => (sampleIndex++ % 2 === 0 ? HOT : CALM),
    });

    stepSamples(kernel, 40);
    expect(incidents.all()).toEqual([]);
  });

  it('a sustained-hot sector opens exactly one riot with auditable cause factors', () => {
    const { incidents, trigger, kernel } = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => HOT,
      occupants: () => [7, 3, 5],
    });

    stepSamples(kernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired);

    const all = incidents.all();
    expect(all).toHaveLength(1);
    const riot = all[0]!;
    expect(riot.type).toBe('riot');
    expect(riot.sectorId).toBe('block-a');
    expect(riot.participantIds).toEqual([3, 5, 7]); // sorted, never Map order
    expect(riot.severity).toBe(10); // fully hot
    expect(riot.causeFactors.map((factor) => factor.kind)).toEqual(['sustained-sector-risk', 'needs-pressure', 'staffing-shortfall', 'contraband-pressure']);
    expect(trigger.getMetrics()).toEqual({ incidentsTriggered: 1, riotsTriggered: 1, retaliationsTriggered: 0 });
  });

  /**
   * **The riot the prison announces is the riot it opened** (issue #555).
   *
   * `participantCount` is the one figure the incident events carry onto the
   * wire, and it is the whole of what the sentence says beyond the kind -- so
   * a producer that sent a constant, or the wrong list's length, would read
   * plausibly and be wrong. Three occupants here rather than the harness's
   * default two, because two is `DEFAULT_MINIMUM_RIOT_PARTICIPANTS` and a
   * fixture sitting on the floor cannot tell a count from the floor itself:
   * measured, a constant `2` passes every assertion in
   * `tests/integration/incident-events-loop.test.ts`, whose neglected prison
   * holds exactly two prisoners.
   *
   * Read against `riot.participantIds`, which the case above independently
   * pins to `[3, 5, 7]`, rather than against the literal the harness was given
   * -- the claim is that the two logs agree, not that either matches a number
   * written here twice.
   */
  it('tells the player how many prisoners are in the riot it just opened (#555)', () => {
    const { incidents, events, kernel } = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => HOT,
      occupants: () => [7, 3, 5],
    });

    // Nothing is said while the sector is merely heating up. One sample short
    // of the sustained window, so a producer keyed on the sample rather than
    // on the opening fails here.
    stepSamples(kernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired - 1);
    expect(events.since(0), 'a sector that is hot but has not rioted has nothing to announce').toEqual([]);

    stepSamples(kernel, 1);
    const riot = incidents.all()[0]!;
    expect(events.since(0)).toEqual([
      { sequence: 1, tick: riot.startedAtTick, type: 'incidents.riot-opened', participantCount: riot.participantIds.length },
    ]);
  });

  it('does not open a second incident in a sector that already has one open', () => {
    const { incidents, trigger, kernel } = buildHarness({ sectorIds: ['block-a'], sampleFor: () => HOT });

    stepSamples(kernel, 30); // far past the sustained window, still permanently hot
    expect(incidents.openIncidentsInSector('block-a')).toHaveLength(1);
    expect(trigger.getMetrics().riotsTriggered).toBe(1);
  });

  it('after the open riot is resolved, a fresh sustained window is required before another fires', () => {
    // `quietTicksAfterIncident: 0` so this measures the streak and nothing
    // else. With the production quiet period in the way the second riot is
    // withheld for 4,800 ticks whatever the streak does, and this assertion
    // would be true for a reason it is not about; the quiet period has its own
    // test below.
    const { incidents, trigger, kernel } = buildHarness({ sectorIds: ['block-a'], sampleFor: () => HOT, quietTicksAfterIncident: 0 });

    stepSamples(kernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired);
    const first = incidents.openIncidents()[0]!;
    incidents.transition(first.id, 'notified', 1_000);
    incidents.transition(first.id, 'responding', 1_010);
    incidents.transition(first.id, 'resolved', 1_100, { injuredEntityIds: [], propertyDamage: 0, escaped: false });

    // The streak was reset when the first riot fired, so one sample is not enough.
    stepSamples(kernel, 1);
    expect(trigger.getMetrics().riotsTriggered).toBe(1);

    stepSamples(kernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired);
    expect(trigger.getMetrics().riotsTriggered).toBe(2);
  });

  it('holds a permanently hot sector to one riot per quiet period, rather than one per window', () => {
    // The defect this is here for was measured rather than reasoned about: with
    // the streak reset as the only spacing, an overcrowded unguarded starter
    // prison opened 49 riots in 20 in-game days.
    const { incidents, trigger, kernel } = buildHarness({ sectorIds: ['block-a'], sampleFor: () => HOT });

    function closeWhateverIsOpen(tick: number): void {
      for (const open of incidents.openIncidents()) {
        incidents.transition(open.id, 'lapsed', tick, { injuredEntityIds: [], propertyDamage: 0, escaped: false });
      }
    }

    // Earn the window, then close the riot immediately so that only the quiet
    // period -- not `openIncidentsInSector` -- can be what withholds the next.
    stepSamples(kernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired);
    expect(trigger.getMetrics().riotsTriggered).toBe(1);
    const firstRiotTick = incidents.all()[0]!.startedAtTick;
    // The twelfth sampling point, at the 50-tick cadence with `phaseTicks: 0`:
    // the system's samples land on 0, 50, ... 550, so the window closes on 550
    // rather than on 600. Written out because it is the anchor every figure
    // below is measured from.
    expect(firstRiotTick).toBe(550);
    closeWhateverIsOpen(kernel.tick);

    // 4,800 ticks is 96 sampling points; 90 of them, every one hot, is seven
    // and a half sustained windows and still inside the quiet period.
    stepSamples(kernel, 90);
    closeWhateverIsOpen(kernel.tick);
    expect(kernel.tick - firstRiotTick).toBeLessThan(DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT);
    expect(trigger.getMetrics().riotsTriggered).toBe(1);

    // Past it, and the sector -- which never improved -- riots again.
    stepSamples(kernel, 10);
    expect(kernel.tick - firstRiotTick).toBeGreaterThan(DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT);
    expect(trigger.getMetrics().riotsTriggered).toBe(2);
  });

  it('will not call one prisoner a riot, and opens one the moment there are two', () => {
    let occupants: readonly number[] = [4];
    const { incidents, trigger, kernel } = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => HOT,
      occupants: () => occupants,
    });

    // Permanently hot, far past the window, with one prisoner in the sector.
    stepSamples(kernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired + 20);
    expect(incidents.all()).toEqual([]);
    // The risk was recorded rather than suppressed: the streak is still running.
    expect(trigger.getMetrics().riotsTriggered).toBe(0);

    occupants = [4, 11];
    stepSamples(kernel, 1);
    expect(incidents.all()).toHaveLength(1);
    expect(incidents.all()[0]!.participantIds).toEqual([4, 11]);
    expect(DEFAULT_MINIMUM_RIOT_PARTICIPANTS).toBe(2);
  });

  it('handles many sectors independently and in deterministic sorted order', () => {
    const { incidents, kernel } = buildHarness({
      sectorIds: ['block-c', 'block-a', 'block-b'], // deliberately unsorted input
      sampleFor: (sectorId) => (sectorId === 'block-b' ? CALM : HOT),
    });

    stepSamples(kernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired);

    expect(incidents.all().map((incident) => incident.sectorId).sort()).toEqual(['block-a', 'block-c']);
    expect(incidents.openIncidentsInSector('block-b')).toEqual([]);
  });
});

describe('IncidentTriggerSystem: gang retaliation feeds the same pipeline', () => {
  it('opens a retaliation incident once a grudge on contested territory crosses the threshold', () => {
    const gangs = new GangRegistry();
    gangs.register({ id: 'gang-north', territorySectorIds: ['block-a'] });
    gangs.register({ id: 'gang-south', territorySectorIds: ['block-a'] });
    gangs.addMember('gang-north', 4);
    gangs.addMember('gang-south', 9);
    gangs.addGrudge('gang-north', 'gang-south', 0.8); // contested -> 0.8 * 1.5, clamped to 1

    const { incidents, trigger, kernel } = buildHarness({ sectorIds: ['block-a'], sampleFor: () => CALM, gangs });

    stepSamples(kernel, 1);

    const all = incidents.all();
    expect(all).toHaveLength(1);
    expect(all[0]!.type).toBe('gang-retaliation');
    expect(all[0]!.participantIds).toEqual([4, 9]); // both gangs' members, sorted
    expect(all[0]!.causeFactors.map((factor) => factor.kind)).toEqual(['gang-grudge', 'retaliation-risk']);
    expect(trigger.getMetrics().retaliationsTriggered).toBe(1);
  });

  it('a grudge below the threshold never fires, and an acted-on grudge is cleared rather than repeating', () => {
    const gangs = new GangRegistry();
    gangs.register({ id: 'gang-north', territorySectorIds: ['block-a'] });
    gangs.register({ id: 'gang-south', territorySectorIds: ['block-b'] }); // uncontested -> dampened
    gangs.addGrudge('gang-north', 'gang-south', 0.5); // 0.5 * 0.5 = 0.25, below the 0.6 threshold

    const { incidents, kernel } = buildHarness({ sectorIds: ['block-a'], sampleFor: () => CALM, gangs });
    stepSamples(kernel, 5);
    expect(incidents.all()).toEqual([]);

    // Raise it onto contested ground and it fires exactly once.
    gangs.register({ id: 'gang-east', territorySectorIds: ['block-a'] });
    gangs.addGrudge('gang-north', 'gang-east', 0.9);
    stepSamples(kernel, 1);
    expect(incidents.all()).toHaveLength(1);
    expect(gangs.getGrudge('gang-north', 'gang-east')).toBe(0); // cleared -- not a permanent standing grievance

    // Resolve it so the sector is free again; no new incident without a new grudge.
    const incident = incidents.openIncidents()[0]!;
    incidents.transition(incident.id, 'lapsed', 5_000, { injuredEntityIds: [], propertyDamage: 0, escaped: false });
    stepSamples(kernel, 5);
    expect(incidents.all()).toHaveLength(1);
  });

  it('is deterministic: an identical scenario replays to identical incident records', () => {
    function run() {
      const gangs = new GangRegistry();
      gangs.register({ id: 'gang-north', territorySectorIds: ['block-a'] });
      gangs.register({ id: 'gang-south', territorySectorIds: ['block-a'] });
      gangs.addMember('gang-north', 2);
      gangs.addGrudge('gang-north', 'gang-south', 0.9);
      const harness = buildHarness({ sectorIds: ['block-a', 'block-b'], sampleFor: () => HOT, occupants: () => [1, 2], gangs });
      stepSamples(harness.kernel, 6);
      return { incidents: harness.incidents.all(), metrics: harness.trigger.getMetrics() };
    }

    expect(run()).toEqual(run());
  });

  it('snapshot/restore preserves metrics and id sequence so restored ids never collide', () => {
    const { incidents, trigger, kernel } = buildHarness({ sectorIds: ['block-a'], sampleFor: () => HOT });
    stepSamples(kernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired);
    const firstId = incidents.all()[0]!.id;

    const restoredIncidents = new IncidentLog();
    restoredIncidents.loadSnapshot(incidents.getSnapshot());
    const restoredRisk = new SectorRiskTracker(DEFAULT_SECTOR_RISK_POLICY);
    // Occupants and a zero quiet period for the same reasons `buildHarness`
    // supplies them: this file is about the id sequence, not about either gate.
    const restoredTrigger = new IncidentTriggerSystem(restoredIncidents, restoredRisk, new GangRegistry(), ['block-a'], () => HOT, TWO_OCCUPANTS, new SimulationEventLog(), undefined, 0);
    restoredTrigger.loadSnapshot(trigger.getSnapshot());

    expect(restoredTrigger.getMetrics()).toEqual(trigger.getMetrics());

    // Resolve the restored open riot, then earn a fresh window -- the new id must not collide with the restored one.
    restoredIncidents.transition(firstId, 'lapsed', 9_000, { injuredEntityIds: [], propertyDamage: 0, escaped: false });
    const restoredKernel = new Kernel();
    restoredKernel.registerSystem(restoredTrigger);
    stepSamples(restoredKernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired);

    const ids = restoredIncidents.all().map((incident) => incident.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(firstId);
  });
});

describe('a riot is what a prison does; an assault is what happens in a prison that is not having one', () => {
  /**
   * **The structural separation between ADR 0061's assault producer and the
   * riot**, and it is here rather than in an integration fixture because it is
   * the one claim an integration fixture proved badly.
   *
   * Measured: deleting the gate from `tryOpenAssault` left every test in
   * `riot-regime-loop.test.ts` and `security-default-sector.test.ts` green and
   * turned exactly one test in the whole suite red -- one in
   * `room-gated-needs.test.ts`, which is about room gating. A structural rule
   * with one accidental witness in a file about something else is not guarded,
   * so this asserts it directly.
   *
   * The risk samples are supplied, and that is what makes this a unit test:
   * `SectorRiskSampler` and `PrisonerFlashpointSampler` are the system's two
   * declared seams. What is *measured* is which incident type opens, which is
   * this system's own decision and nothing to do with the inputs. That a real
   * prison reaches both conditions is
   * `tests/integration/incident-trigger-reachability.test.ts`'s subject.
   */
  const READY_TO_FIGHT: readonly PrisonerFlashpoint[] = [
    // Two prisoners well past the assault line on need alone -- nothing housed,
    // nothing served. Neither can attempt an escape: tier 0, carrying nothing.
    { entityId: 2, needDeficit: 1, contrabandSeverity: 0, sentenceRemaining: 1, riskTier: 0 },
    { entityId: 6, needDeficit: 1, contrabandSeverity: 0, sentenceRemaining: 1, riskTier: 0 },
  ];

  it('opens an assault while the sector is cool', () => {
    const harness = buildHarness({
      sectorIds: ['block-a'],
      // Cool: `needsPressure` 0.1 scores 0.1 against a 0.65 line, so the sector
      // never becomes hot however long this runs.
      sampleFor: () => ({ needsPressure: 0.1, staffingShortfall: 0, contrabandPressure: 0 }),
      sampleFlashpoints: () => READY_TO_FIGHT,
    });

    stepSamples(harness.kernel, 20);

    const opened = harness.incidents.all();
    expect(opened.length).toBeGreaterThan(0);
    expect(opened.every((incident) => incident.type === 'assault')).toBe(true);
    expect(opened[0]!.participantIds).toEqual([2, 6]);
  });

  /**
   * The case the gate exists for. The same two prisoners, the same scores --
   * only the *sector* is different, and now the twelve-sample riot window is
   * running. Without the gate the assault fires on the first sampling point,
   * takes the sector's one open incident slot, and the riot the window was
   * building towards never opens.
   */
  it('opens nothing but the riot once the sector has started running hot', () => {
    const harness = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => HOT,
      sampleFlashpoints: () => READY_TO_FIGHT,
    });

    // One hot sample in: the streak is running and the riot cannot fire yet.
    stepSamples(harness.kernel, 1);
    expect(harness.risk.getConsecutiveHotSamples('block-a')).toBe(1);
    expect(harness.incidents.all(), 'nothing may take the slot while the riot window is running').toEqual([]);

    // And when something does open, it is the riot the window was for.
    stepSamples(harness.kernel, DEFAULT_SECTOR_RISK_POLICY.sustainedSamplesRequired);
    const opened = harness.incidents.all();
    expect(opened.length).toBeGreaterThan(0);
    expect(opened.every((incident) => incident.type === 'riot')).toBe(true);
  });

  it('needs two occupants for an assault, for the reason a riot needs two', () => {
    const harness = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => ({ needsPressure: 0.1, staffingShortfall: 0, contrabandPressure: 0 }),
      sampleFlashpoints: () => [READY_TO_FIGHT[0]!],
    });

    stepSamples(harness.kernel, 20);
    expect(harness.incidents.all()).toEqual([]);
  });

  it('opens nothing at all for a session that supplies no flashpoint sampler', () => {
    const harness = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => ({ needsPressure: 0.1, staffingShortfall: 0, contrabandPressure: 0 }),
    });

    stepSamples(harness.kernel, 20);
    expect(harness.incidents.all()).toEqual([]);
  });
});

describe('an escape attempt takes the sector’s slot ahead of an assault, and only for somebody who could try', () => {
  const ARMED_HIGH_RISK: PrisonerFlashpoint = { entityId: 4, needDeficit: 1, contrabandSeverity: 0.9, sentenceRemaining: 1, riskTier: 3 };
  const DESPERATE_BUT_ORDINARY: PrisonerFlashpoint = { entityId: 9, needDeficit: 1, contrabandSeverity: 0.9, sentenceRemaining: 1, riskTier: 2 };

  it('opens the escape attempt rather than the assault, naming one prisoner', () => {
    const harness = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => ({ needsPressure: 0.1, staffingShortfall: 1, contrabandPressure: 0 }),
      sampleFlashpoints: () => [ARMED_HIGH_RISK, DESPERATE_BUT_ORDINARY],
    });

    stepSamples(harness.kernel, 1);
    const opened = harness.incidents.all();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ type: 'escape-attempt', participantIds: [4] });
  });

  it('opens an assault instead when nobody in the sector is high risk, however desperate they are', () => {
    const harness = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => ({ needsPressure: 0.1, staffingShortfall: 1, contrabandPressure: 0 }),
      sampleFlashpoints: () => [DESPERATE_BUT_ORDINARY, { ...DESPERATE_BUT_ORDINARY, entityId: 10 }],
    });

    stepSamples(harness.kernel, 1);
    const opened = harness.incidents.all();
    expect(opened).toHaveLength(1);
    expect(opened[0]!.type).toBe('assault');
  });

  it('opens neither for a high-risk prisoner carrying nothing, because the means is a condition', () => {
    const harness = buildHarness({
      sectorIds: ['block-a'],
      sampleFor: () => ({ needsPressure: 0.1, staffingShortfall: 1, contrabandPressure: 0 }),
      sampleFlashpoints: () => [
        { ...ARMED_HIGH_RISK, contrabandSeverity: 0, needDeficit: 0 },
        { ...ARMED_HIGH_RISK, entityId: 11, contrabandSeverity: 0, needDeficit: 0 },
      ],
    });

    stepSamples(harness.kernel, 20);
    expect(harness.incidents.all()).toEqual([]);
  });
});
