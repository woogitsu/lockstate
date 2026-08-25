import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL,
  IntelligenceLedger,
  IntelligenceSystem,
  MIN_INTELLIGENCE_CONFIDENCE,
} from '../../src/simulation/contraband/intelligence';
import { InformantRegistry, reportInformantTip } from '../../src/simulation/contraband/informants';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
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

/*
 * Decay on the path a session actually runs, which is a different claim from
 * the one `decayAll` tests above make.
 *
 * `IntelligenceLedger.decayAll` is driven directly by three tests. What nothing
 * drove was `IntelligenceSystem` -- the thing that calls it -- so the wiring
 * `createNewSimulationRuntime` performs was unasserted end to end: issue #264
 * S10 set `DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL` to `0` and the whole suite
 * stayed green (measured on this branch: 190 files, 2106 tests, zero delta),
 * which is a session where intelligence never decays and every tip is the
 * permanent truth flag the architecture notes forbid.
 *
 * The *magnitude* stays deliberately unpinned -- it is "a directional default,
 * not a committed balance figure", and docs/BENCHMARKING.md forbids a hard
 * threshold without repeated controlled baselines. So the assertions below are
 * about direction and cadence, expressed against the exported constant rather
 * than against `0.1`: rebalancing the default keeps them green, and setting it
 * to nothing does not.
 */
describe('IntelligenceSystem: the decay a running session actually performs', () => {
  const INITIAL_CONFIDENCE = 0.9;

  /** A record in the ledger the runtime built, decayed by the runtime's own system. */
  function sessionWithOneTip(): { readonly runtime: SimulationRuntime; readonly id: string } {
    const runtime = createNewSimulationRuntime(0);
    const id = runtime.intelligence.report('prisoner', '1', INITIAL_CONFIDENCE, 'observation', 0);
    return { runtime, id };
  }

  it('is a real decay, not a no-op default', () => {
    // The direction, and the whole of what S10 broke. A decay of zero satisfies
    // every "confidence equals initial minus the default" arithmetic below,
    // which is why that arithmetic cannot be the only assertion here.
    expect(DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL).toBeGreaterThan(0);
    expect(DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL).toBeLessThan(1);
  });

  it('decays a tip reported into a session, on the session cadence and not faster', () => {
    const { runtime, id } = sessionWithOneTip();
    // Read from the system rather than written as `50`, so this asserts the
    // *agreement* between the declared schedule and the observed behaviour and
    // stays green when the cadence is retuned -- the same reason the decay
    // magnitude is not pinned. What it does not do on its own is refuse a
    // cadence of every tick, which is a decay rate in disguise, so that floor
    // is stated separately. Verified by control: `intervalTicks: 50 -> 1` fails
    // here.
    const interval = new IntelligenceSystem(runtime.intelligence).schedule.intervalTicks;
    expect(interval, 'a per-tick cadence is a decay rate in disguise').toBeGreaterThan(1);

    // The system's phase is 0 and the kernel runs a system when
    // `tick % intervalTicks === phaseTicks`, so tick 0 is a decay tick.
    runtime.kernel.step();
    const afterFirst = runtime.intelligence.get(id)?.confidence;
    expect(afterFirst, 'nothing decayed the tip on the wired path').toBeLessThan(INITIAL_CONFIDENCE);
    expect(afterFirst).toBeCloseTo(INITIAL_CONFIDENCE - DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL, 10);

    // Ticks 1..interval-1 are not decay ticks: a system that ran every tick
    // would burn the tip away in a fraction of the intended time.
    for (let tick = 1; tick < interval; tick += 1) runtime.kernel.step();
    expect(runtime.intelligence.get(id)?.confidence, 'decay ran off its own cadence').toBeCloseTo(afterFirst!, 10);

    runtime.kernel.step();
    const afterSecond = runtime.intelligence.get(id)?.confidence;
    expect(afterSecond, 'the second interval did not decay').toBeLessThan(afterFirst!);
    expect(afterSecond).toBeCloseTo(INITIAL_CONFIDENCE - 2 * DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL, 10);
  });

  it('expires a session tip rather than leaving it as a permanent flag', () => {
    // The consequence the architecture notes actually state -- "intelligence
    // decays/expires and carries uncertainty; it is not a permanent truth
    // flag" -- asserted about a session rather than about the ledger in
    // isolation.
    const { runtime, id } = sessionWithOneTip();
    const interval = new IntelligenceSystem(runtime.intelligence).schedule.intervalTicks;

    // A literal budget, on purpose, and the reason is worth recording: the
    // first draft of this test derived it as
    // `ceil(INITIAL_CONFIDENCE / DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL)`,
    // and at the S10 mutation's decay of `0` that is `Infinity` -- the test
    // did not fail, it hung, and took the whole file with it. Sizing a loop
    // from the constant under test is the same self-reference this issue is
    // about, wearing a different hat. So the budget is stated, and the
    // assertion below is what makes it honest: it fails immediately, rather
    // than looping, if the configured decay cannot finish the job inside it.
    const TICK_BUDGET = 4_000;
    const decayedWithinBudget = DEFAULT_INTELLIGENCE_DECAY_PER_INTERVAL * Math.floor(TICK_BUDGET / interval);
    expect(decayedWithinBudget, 'the configured decay cannot expire a tip inside the budget').toBeGreaterThan(
      INITIAL_CONFIDENCE,
    );

    for (let tick = 0; tick < TICK_BUDGET; tick += 1) runtime.kernel.step();

    expect(runtime.intelligence.get(id)).toBeUndefined();
    expect(runtime.intelligence.forTarget('prisoner', '1')).toEqual([]);
  });
});
