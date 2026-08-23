import { describe, expect, it } from 'vitest';
import { IntelligenceLedger, MIN_INTELLIGENCE_CONFIDENCE } from '../../src/simulation/contraband/intelligence';
import { InformantRegistry, reportInformantTip } from '../../src/simulation/contraband/informants';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';

function rngFor(streamName: string): Xoshiro128StarStar {
  return new Xoshiro128StarStar(deriveXoshiroState(42, streamName).words);
}

describe('IntelligenceLedger: suspicion records with confidence, expiry and target scope', () => {
  it('reports a clamped-confidence record and finds it by target, indexed', () => {
    const ledger = new IntelligenceLedger();
    const id = ledger.report('cell', 'cell-1', 1.5, 'observation', 10, 'contraband.phone');

    const record = ledger.get(id);
    expect(record).toEqual({ id, targetKind: 'cell', targetId: 'cell-1', categoryHint: 'contraband.phone', confidence: 1, sourceType: 'observation', createdAtTick: 10 });
    expect(ledger.forTarget('cell', 'cell-1')).toEqual([record]);
    expect(ledger.forTarget('cell', 'cell-2')).toEqual([]);
    expect(ledger.forTarget('prisoner', 'cell-1')).toEqual([]); // target kind is part of the index key, not just the id
  });

  it('decays confidence and expires records at/below the minimum threshold', () => {
    const ledger = new IntelligenceLedger();
    const id = ledger.report('prisoner', '7', 0.3, 'observation', 0);

    ledger.decayAll(0.1);
    expect(ledger.get(id)?.confidence).toBeCloseTo(0.2, 10);

    ledger.decayAll(0.1);
    expect(ledger.get(id)?.confidence).toBeCloseTo(0.1, 10);

    ledger.decayAll(0.1); // 0.1 - 0.1 = ~0, at/below MIN_INTELLIGENCE_CONFIDENCE -> expires
    expect(ledger.get(id)).toBeUndefined();
    expect(ledger.forTarget('prisoner', '7')).toEqual([]);
    expect(MIN_INTELLIGENCE_CONFIDENCE).toBeGreaterThan(0);
  });

  it('snapshot/restore preserves records and continues decay/sequence correctly', () => {
    const ledger = new IntelligenceLedger();
    ledger.report('cell', 'cell-1', 0.6, 'observation', 5);
    const snapshot = ledger.getSnapshot();

    const restored = new IntelligenceLedger();
    restored.loadSnapshot(snapshot);
    expect(restored.all()).toEqual(ledger.all());

    // Sequence numbering continues past the highest restored id rather than colliding.
    const newId = restored.report('sector', 'sector-1', 0.4, 'observation', 6);
    expect(restored.get(newId)).toBeDefined();
    expect(newId).not.toBe(restored.all()[0]!.id);
  });
});

describe('InformantRegistry / reportInformantTip: reliability-derived, uncertain tips', () => {
  it('throws reporting a tip from a non-recruited informant', () => {
    const informants = new InformantRegistry();
    const ledger = new IntelligenceLedger();
    expect(() => reportInformantTip(informants, ledger, 'prisoner', '1', 'cell', 'cell-1', 0, rngFor('test.stream'))).toThrow(/not a recruited informant/);
  });

  it('a recruited informant produces a clamped, jittered-confidence record deterministically for a fixed seed', () => {
    const informants = new InformantRegistry();
    informants.recruit('prisoner', '1', 0.8);
    const ledger = new IntelligenceLedger();
    const rng = rngFor('contraband.intelligence');

    const id = reportInformantTip(informants, ledger, 'prisoner', '1', 'cell', 'cell-9', 100, rng, 'contraband.weapon');
    const record = ledger.get(id)!;
    expect(record.sourceType).toBe('informant');
    expect(record.targetKind).toBe('cell');
    expect(record.targetId).toBe('cell-9');
    expect(record.categoryHint).toBe('contraband.weapon');
    expect(record.confidence).toBeGreaterThanOrEqual(0);
    expect(record.confidence).toBeLessThanOrEqual(1);

    // Same seed, same draw sequence -> identical confidence (deterministic replay).
    const informants2 = new InformantRegistry();
    informants2.recruit('prisoner', '1', 0.8);
    const ledger2 = new IntelligenceLedger();
    const id2 = reportInformantTip(informants2, ledger2, 'prisoner', '1', 'cell', 'cell-9', 100, rngFor('contraband.intelligence'), 'contraband.weapon');
    expect(ledger2.get(id2)!.confidence).toBe(record.confidence);
  });

  it('snapshot/restore preserves recruited informants', () => {
    const informants = new InformantRegistry();
    informants.recruit('prisoner', '1', 0.7);
    informants.recruit('staff', '4', 0.4);

    const restored = new InformantRegistry();
    restored.loadSnapshot(informants.getSnapshot());

    expect(restored.all()).toEqual(informants.all());
    expect(restored.getReliability('prisoner', '1')).toBe(0.7);
    expect(restored.isInformant('staff', '4')).toBe(true);
    expect(restored.isInformant('prisoner', '99')).toBe(false);
  });
});
