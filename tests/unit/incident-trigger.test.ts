import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { GangRegistry } from '../../src/simulation/incidents/gangs';
import { IncidentLog } from '../../src/simulation/incidents/incident';
import { DEFAULT_SECTOR_RISK_POLICY, SectorRiskTracker, type SectorRiskSample } from '../../src/simulation/incidents/sector-risk';
import { IncidentTriggerSystem } from '../../src/simulation/incidents/trigger-system';

const CALM: SectorRiskSample = { needsPressure: 0, staffingShortfall: 0, contrabandPressure: 0 };
const HOT: SectorRiskSample = { needsPressure: 1, staffingShortfall: 1, contrabandPressure: 1 };

function buildHarness(options: {
  readonly sectorIds: readonly string[];
  readonly sampleFor: (sectorId: string, tick: number) => SectorRiskSample;
  readonly occupants?: (sectorId: string) => readonly number[];
  readonly gangs?: GangRegistry;
}) {
  const incidents = new IncidentLog();
  const risk = new SectorRiskTracker(DEFAULT_SECTOR_RISK_POLICY);
  const gangs = options.gangs ?? new GangRegistry();
  const trigger = new IncidentTriggerSystem(
    incidents,
    risk,
    gangs,
    options.sectorIds,
    options.sampleFor,
    options.occupants ?? (() => []),
  );
  const kernel = new Kernel();
  kernel.registerSystem(trigger);
  return { incidents, risk, gangs, trigger, kernel };
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

  it('does not open a second incident in a sector that already has one open', () => {
    const { incidents, trigger, kernel } = buildHarness({ sectorIds: ['block-a'], sampleFor: () => HOT });

    stepSamples(kernel, 30); // far past the sustained window, still permanently hot
    expect(incidents.openIncidentsInSector('block-a')).toHaveLength(1);
    expect(trigger.getMetrics().riotsTriggered).toBe(1);
  });

  it('after the open riot is resolved, a fresh sustained window is required before another fires', () => {
    const { incidents, trigger, kernel } = buildHarness({ sectorIds: ['block-a'], sampleFor: () => HOT });

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
    const restoredTrigger = new IncidentTriggerSystem(restoredIncidents, restoredRisk, new GangRegistry(), ['block-a'], () => HOT, () => []);
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
