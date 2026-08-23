import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTOR_RISK_POLICY, SectorRiskTracker, scoreSectorRisk, type SectorRiskPolicy, type SectorRiskSample } from '../../src/simulation/incidents/sector-risk';

const CALM: SectorRiskSample = { needsPressure: 0, staffingShortfall: 0, contrabandPressure: 0 };
const HOT: SectorRiskSample = { needsPressure: 1, staffingShortfall: 1, contrabandPressure: 1 };

const POLICY: SectorRiskPolicy = { ...DEFAULT_SECTOR_RISK_POLICY, hotThreshold: 0.6, sustainedSamplesRequired: 3 };

describe('scoreSectorRisk: explicit weighted factors, clamped', () => {
  it('is a weighted sum of the three inputs', () => {
    expect(scoreSectorRisk({ needsPressure: 1, staffingShortfall: 0, contrabandPressure: 0 }, POLICY)).toBeCloseTo(POLICY.needsPressureWeight, 10);
    expect(scoreSectorRisk({ needsPressure: 0, staffingShortfall: 1, contrabandPressure: 0 }, POLICY)).toBeCloseTo(POLICY.staffingShortfallWeight, 10);
    expect(scoreSectorRisk({ needsPressure: 0, staffingShortfall: 0, contrabandPressure: 1 }, POLICY)).toBeCloseTo(POLICY.contrabandPressureWeight, 10);
  });

  it('clamps to [0, 1]', () => {
    expect(scoreSectorRisk(CALM, POLICY)).toBe(0);
    expect(scoreSectorRisk(HOT, POLICY)).toBe(1);
    expect(scoreSectorRisk({ needsPressure: 5, staffingShortfall: 5, contrabandPressure: 5 }, POLICY)).toBe(1);
  });
});

/**
 * Issue #28's "riot trigger based on sustained sector unhappiness/risk
 * inputs rather than a one-tick threshold" and the architecture note that
 * triggers must "prevent single-tick oscillation."
 */
describe('SectorRiskTracker: sustained window, not a one-sample spike', () => {
  it('a single hot sample never counts as sustained', () => {
    const tracker = new SectorRiskTracker(POLICY);
    tracker.sample('block-a', HOT);

    expect(tracker.getConsecutiveHotSamples('block-a')).toBe(1);
    expect(tracker.isSustainedHot('block-a')).toBe(false);
  });

  it('becomes sustained only on the policy-required consecutive hot sample', () => {
    const tracker = new SectorRiskTracker(POLICY);
    tracker.sample('block-a', HOT);
    tracker.sample('block-a', HOT);
    expect(tracker.isSustainedHot('block-a')).toBe(false);

    tracker.sample('block-a', HOT);
    expect(tracker.getConsecutiveHotSamples('block-a')).toBe(3);
    expect(tracker.isSustainedHot('block-a')).toBe(true);
  });

  it('one calm sample resets the streak entirely -- an oscillating sector never accumulates toward a riot', () => {
    const tracker = new SectorRiskTracker(POLICY);
    for (let i = 0; i < 10; i += 1) {
      tracker.sample('block-a', HOT);
      tracker.sample('block-a', CALM); // alternating hot/calm, forever
      expect(tracker.isSustainedHot('block-a')).toBe(false);
    }
    expect(tracker.getConsecutiveHotSamples('block-a')).toBe(0);
  });

  it('tracks each sector independently', () => {
    const tracker = new SectorRiskTracker(POLICY);
    for (let i = 0; i < 3; i += 1) {
      tracker.sample('block-a', HOT);
      tracker.sample('block-b', CALM);
    }
    expect(tracker.isSustainedHot('block-a')).toBe(true);
    expect(tracker.isSustainedHot('block-b')).toBe(false);
  });

  it('resetStreak clears the window so one sustained period yields one trigger, not one per later sample', () => {
    const tracker = new SectorRiskTracker(POLICY);
    for (let i = 0; i < 3; i += 1) tracker.sample('block-a', HOT);
    expect(tracker.isSustainedHot('block-a')).toBe(true);

    tracker.resetStreak('block-a');
    expect(tracker.isSustainedHot('block-a')).toBe(false);

    tracker.sample('block-a', HOT);
    tracker.sample('block-a', HOT);
    expect(tracker.isSustainedHot('block-a')).toBe(false); // must earn the full window again
    tracker.sample('block-a', HOT);
    expect(tracker.isSustainedHot('block-a')).toBe(true);
  });

  it('an unknown sector reports zero rather than throwing', () => {
    const tracker = new SectorRiskTracker(POLICY);
    expect(tracker.getScore('never-sampled')).toBe(0);
    expect(tracker.getConsecutiveHotSamples('never-sampled')).toBe(0);
    expect(tracker.isSustainedHot('never-sampled')).toBe(false);
  });

  it('snapshot/restore preserves mid-window streaks exactly', () => {
    const tracker = new SectorRiskTracker(POLICY);
    tracker.sample('block-a', HOT);
    tracker.sample('block-a', HOT); // 2 of 3 -- mid-window

    const restored = new SectorRiskTracker(POLICY);
    restored.loadSnapshot(tracker.getSnapshot());

    expect(restored.getConsecutiveHotSamples('block-a')).toBe(2);
    expect(restored.isSustainedHot('block-a')).toBe(false);
    restored.sample('block-a', HOT);
    expect(restored.isSustainedHot('block-a')).toBe(true); // continues the window, doesn't restart it
  });
});
