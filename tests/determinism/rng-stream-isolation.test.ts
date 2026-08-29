import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import type { SimulationContext, SystemRegistration } from '../../src/simulation/kernel/system';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { hashFullRuntime } from '../helpers/determinism-state';

/**
 * [ADR 0020](../../docs/adr/0020-deterministic-kernel.md)'s reason for named
 * streams, tested rather than read: "Instead of a single global RNG which
 * couples unrelated systems (e.g. UI animations perturbing pathfinding),
 * subsystems claim named `Xoshiro128**` RNG streams."
 *
 * The property that matters is not "each stream produces numbers" but that
 * *adding or reordering draws in one subsystem leaves every other
 * subsystem's sequence untouched* -- otherwise any gameplay system landing
 * later (economy, progression, events) silently changes the outcome of
 * every existing challenge replay merely by drawing a number.
 */

const SEED = 4_242;
const NAMES = ['alpha.one', 'beta.two', 'gamma.three'] as const;

function streams(): NamedRngStreams {
  return new NamedRngStreams(NAMES.map((name) => ({ name, state: deriveXoshiroState(SEED, name) })));
}

/** A minimal system that draws a fixed number of times from one named stream and records what it got. */
class DrawingSystem implements SystemRegistration {
  public readonly schedule = { intervalTicks: 1, phaseTicks: 0 };
  public readonly draws: number[] = [];

  public constructor(
    public readonly id: string,
    public readonly order: number,
    private readonly streamName: string,
    private readonly drawsPerTick: number,
  ) {}

  public update(context: SimulationContext): void {
    const rng = context.rng.get(this.streamName);
    for (let index = 0; index < this.drawsPerTick; index += 1) this.draws.push(rng.nextFloat());
  }
}

function runKernel(systems: readonly SystemRegistration[], ticks: number): void {
  const kernel = new Kernel(0, 0, streams());
  for (const system of systems) kernel.registerSystem(system);
  for (let tick = 0; tick < ticks; tick += 1) kernel.step();
}

describe('named RNG stream isolation through the real kernel', () => {
  it('one subsystem drawing more often does not shift another subsystem\'s sequence', () => {
    const baselineAlpha = new DrawingSystem('alpha', 10, 'alpha.one', 2);
    runKernel([baselineAlpha], 20);

    const alpha = new DrawingSystem('alpha', 10, 'alpha.one', 2);
    const noisyBeta = new DrawingSystem('beta', 20, 'beta.two', 17);
    const noisyGamma = new DrawingSystem('gamma', 5, 'gamma.three', 9);
    runKernel([alpha, noisyBeta, noisyGamma], 20);

    expect(alpha.draws).toEqual(baselineAlpha.draws);
    expect(alpha.draws).toHaveLength(40);
  });

  it('reordering the systems that draw does not shift a stream that was not reordered', () => {
    const first = new DrawingSystem('alpha', 10, 'alpha.one', 3);
    const firstBeta = new DrawingSystem('beta', 20, 'beta.two', 3);
    runKernel([first, firstBeta], 15);

    // `beta` now runs *before* `alpha`. Their draws interleave in the
    // opposite order, but they are different streams, so neither changes.
    const second = new DrawingSystem('alpha', 30, 'alpha.one', 3);
    const secondBeta = new DrawingSystem('beta', 20, 'beta.two', 3);
    runKernel([second, secondBeta], 15);

    expect(second.draws).toEqual(first.draws);
    expect(secondBeta.draws).toEqual(firstBeta.draws);
  });

  it('two streams from the same master seed never produce the same sequence', () => {
    const shared = streams();
    const alpha = Array.from({ length: 8 }, () => shared.get('alpha.one').nextFloat());
    const beta = Array.from({ length: 8 }, () => shared.get('beta.two').nextFloat());
    const gamma = Array.from({ length: 8 }, () => shared.get('gamma.three').nextFloat());

    expect(alpha).not.toEqual(beta);
    expect(alpha).not.toEqual(gamma);
    expect(beta).not.toEqual(gamma);
  });

  it('`get` returns the same generator instance per name and never shares state across names', () => {
    const shared = streams();
    expect(shared.get('alpha.one')).toBe(shared.get('alpha.one'));
    expect(shared.get('alpha.one')).not.toBe(shared.get('beta.two'));

    const before = shared.get('beta.two').snapshot().words.slice();
    shared.get('alpha.one').nextFloat();
    expect(shared.get('beta.two').snapshot().words).toEqual(before);
  });

  it('an unclaimed stream name fails loudly instead of being created on demand', () => {
    // A lazily-created stream would be seeded from nothing, would not appear
    // in a snapshot, and would make a typo in a stream name a silent
    // determinism break rather than an error.
    expect(() => streams().get('delta.four')).toThrow(/Unknown RNG stream/);
    expect(() => new NamedRngStreams([{ name: 'a.b', state: deriveXoshiroState(1, 'a.b') }, { name: 'a.b', state: deriveXoshiroState(1, 'a.b') }])).toThrow(RangeError);
  });

  it('stream seeds are a pure function of master seed and stream name', () => {
    expect(deriveXoshiroState(99, 'alpha.one')).toEqual(deriveXoshiroState(99, 'alpha.one'));
    expect(deriveXoshiroState(99, 'alpha.one')).not.toEqual(deriveXoshiroState(99, 'beta.two'));
    expect(deriveXoshiroState(99, 'alpha.one')).not.toEqual(deriveXoshiroState(100, 'alpha.one'));
  });

  it('a snapshot orders streams canonically, so registration order cannot change a save', () => {
    const forwards = new NamedRngStreams(NAMES.map((name) => ({ name, state: deriveXoshiroState(SEED, name) })));
    const backwards = new NamedRngStreams([...NAMES].reverse().map((name) => ({ name, state: deriveXoshiroState(SEED, name) })));

    expect(backwards.snapshot()).toEqual(forwards.snapshot());
    expect(forwards.snapshot().map((entry) => entry.name)).toEqual(['alpha.one', 'beta.two', 'gamma.three']);
  });

  it('restoring kernel state rebinds every stream, so a system reads restored words and not stale ones', () => {
    const kernel = new Kernel(0, 0, streams());
    const system = new DrawingSystem('alpha', 10, 'alpha.one', 1);
    kernel.registerSystem(system);

    for (let tick = 0; tick < 5; tick += 1) kernel.step();
    const snapshot = kernel.snapshot();
    const afterSnapshot: number[] = [];
    for (let tick = 0; tick < 5; tick += 1) kernel.step();
    afterSnapshot.push(...system.draws.slice(5));

    const rewound = new Kernel(0, 0, streams());
    const rewoundSystem = new DrawingSystem('alpha', 10, 'alpha.one', 1);
    rewound.registerSystem(rewoundSystem);
    rewound.restoreState(snapshot);
    for (let tick = 0; tick < 5; tick += 1) rewound.step();

    expect(rewoundSystem.draws).toEqual(afterSnapshot);
    expect(rewoundSystem.draws).toHaveLength(5);
  });
});

describe('named RNG stream isolation in the real session runtime', () => {
  it('draining an unrelated stream between ticks does not change the session outcome', () => {
    const baseline = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(baseline);
    for (let tick = 0; tick < 300; tick += 1) baseline.kernel.step();

    const disturbed = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(disturbed);
    for (let tick = 0; tick < 300; tick += 1) {
      disturbed.kernel.step();
      // `contraband.intelligence` is claimed for informant-tip jitter and is
      // drawn from by no scheduled system in this scenario. Advancing it
      // hard stands in for a future subsystem that starts using it.
      for (let draw = 0; draw < 13; draw += 1) disturbed.kernel.rng.get('contraband.intelligence').nextFloat();
    }

    // Every stream except the disturbed one -- and therefore all simulation
    // state derived from them -- must be untouched.
    const withoutIntelligence = (runtime: typeof baseline) =>
      runtime.kernel.snapshot().rngStates.filter((entry) => entry.name !== 'contraband.intelligence');
    expect(withoutIntelligence(disturbed)).toEqual(withoutIntelligence(baseline));
    expect(disturbed.searchSystem.getMetrics()).toEqual(baseline.searchSystem.getMetrics());
    expect(disturbed.prisoners.getSnapshot().records).toEqual(baseline.prisoners.getSnapshot().records);

    // Non-vacuous: the scenario really did draw from the streams it claims.
    const fresh = buildDeterminismScenario(SCENARIO_SEED).kernel.snapshot().rngStates;
    for (const name of ['contraband.detection', 'prisoners.classification']) {
      const before = fresh.find((entry) => entry.name === name)!;
      const after = baseline.kernel.snapshot().rngStates.find((entry) => entry.name === name)!;
      expect(after.state.words, `${name} was never drawn from`).not.toEqual(before.state.words);
    }
  });

  it('every stream the session claims is named, seeded and snapshotted -- none is created implicitly', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    const names = runtime.kernel.snapshot().rngStates.map((entry) => entry.name);

    // `identity.actor-name` joined the list when #70 wired ADR 0015's
    // registry into `new-session.ts`. Adding a stream changes what a recorded
    // command stream reproduces, so this pin must move deliberately.
    expect(names).toEqual(['contraband.detection', 'contraband.intelligence', 'identity.actor-name', 'prisoners.classification']);

    // Seeding is checked against a session that has not been *used* yet.
    // `buildDeterminismScenario` hires five guards, and since #70 wired ADR
    // 0015's registry a hire mints a name -- so `identity.actor-name` has
    // legitimately advanced before the scenario returns. Reading the seeded
    // words off a fresh session keeps the property this asserts ("every
    // stream is derived from `(masterSeed, name)`, never created implicitly")
    // independent of whether setup happens to draw.
    const fresh = createNewSimulationRuntime(SCENARIO_SEED);
    expect(fresh.kernel.snapshot().rngStates.map((entry) => entry.name)).toEqual(names);
    for (const name of names) {
      expect(fresh.kernel.rng.get(name).snapshot().words).toEqual(deriveXoshiroState(SCENARIO_SEED, name).words);
    }

    // Two sessions on the same seed hash identically; on different seeds
    // they do not. That is the whole basis of "a seed plus a command stream
    // is the run" (ADR 0009).
    const other = buildDeterminismScenario(SCENARIO_SEED);
    expect(hashFullRuntime(other)).toBe(hashFullRuntime(runtime));
    expect(hashFullRuntime(buildDeterminismScenario(SCENARIO_SEED + 1))).not.toBe(hashFullRuntime(runtime));
  });
});
