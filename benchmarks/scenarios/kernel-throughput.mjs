// MODELLED, NOT PRODUCTION.
//
// This file schedules mock systems over a tick loop it implements itself. It
// imports nothing from `src/` -- in particular not `Kernel`
// (src/simulation/kernel/kernel.ts), the exported production class whose name
// this scenario's id and description used to claim outright. That is #410's
// defect verbatim: a scenario named after a subsystem it does not import.
// Corrected here per `docs/BENCHMARKING.md`'s scenario rule 9; the numbers
// hold for any fixed-step scheduler and gate nothing about the real one.
//
// Backlog behaviour under a tick the scheduler cannot keep up with is still
// unmeasured, by this file and by everything else.

const KERNEL_THROUGHPUT_SEED = 0xabcdef12;

function rotateLeft(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function xoshiro128(s0, s1, s2, s3) {
  let a = s0 >>> 0;
  let b = s1 >>> 0;
  let c = s2 >>> 0;
  let d = s3 >>> 0;

  return function next() {
    const result = (rotateLeft(Math.imul(b, 5) >>> 0, 7) * 9) >>> 0;
    const t = (b << 9) >>> 0;

    c = (c ^ a) >>> 0;
    d = (d ^ b) >>> 0;
    b = (b ^ c) >>> 0;
    a = (a ^ d) >>> 0;

    c = (c ^ t) >>> 0;
    d = rotateLeft(d, 11);

    return result;
  };
}

function runKernelThroughputScenario(seed, operationsPerIteration) {
  // operationsPerIteration maps to the number of mock systems/commands we will process per tick
  const nextRng = xoshiro128(seed, seed ^ 0x6c8e9cf5, seed ^ 0xb2ac1087, seed ^ 0x91e10da5);
  const entitiesCount = operationsPerIteration;
  
  // Minimal standalone implementation of Kernel logic for benchmark (since we can't easily import TS directly here)
  let _tick = 0;
  let _expectedSequence = 0;
  let _commands = [];
  const _systems = [];

  // Register synthetic systems
  for (let i = 0; i < entitiesCount; i++) {
    const isRare = (nextRng() % 10) === 0;
    _systems.push({
      id: `sys_${i}`,
      order: 1,
      schedule: {
        intervalTicks: isRare ? 10 : 1,
        phaseTicks: nextRng() % (isRare ? 10 : 1),
      },
      updateCount: 0,
    });
  }

  // Pre-sort systems (as kernel would)
  _systems.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let stateHash = seed >>> 0;
  const TICKS = 100;

  for (let t = 0; t < TICKS; t++) {
    // 1. Submit commands for this tick
    const commandCount = 5;
    for (let c = 0; c < commandCount; c++) {
      _commands.push({
        sequence: _expectedSequence++,
        executeAtTick: _tick,
        payload: nextRng(),
      });
    }

    // 2. Kernel step logic
    // Execute commands
    let handled = 0;
    while (_commands.length > 0 && _commands[0].executeAtTick === _tick) {
      const command = _commands.shift();
      handled = (handled + command.payload) >>> 0;
    }

    // Execute systems
    for (let i = 0; i < _systems.length; i++) {
      const sys = _systems[i];
      if (_tick % sys.schedule.intervalTicks === sys.schedule.phaseTicks) {
        sys.updateCount++;
        // Simulate some minor deterministic work
        stateHash = (stateHash ^ (sys.updateCount * (i + 1))) >>> 0;
      }
    }
    
    stateHash = Math.imul(stateHash ^ handled, 0x517cc1b7) >>> 0;
    _tick++;
  }

  return `0x${stateHash.toString(16).padStart(8, '0')}`;
}

export const kernelThroughputScenario = Object.freeze({
  id: 'kernel.throughput.benchmark',
  version: 1,
  description:
    'MODELLED, not production: a hand-rolled fixed-step tick loop over mock systems, with its own command queue and multi-rate scheduling, measured for throughput. Imports nothing from src/ -- in particular not the production Kernel (src/simulation/kernel/kernel.ts), whose throughput this scenario does not measure.',
  seed: KERNEL_THROUGHPUT_SEED,
  profiles: Object.freeze({
    smoke: Object.freeze({
      warmupIterations: 2,
      measuredIterations: 10,
      operationsPerIteration: 250, // 250 synthetic systems
    }),
    full: Object.freeze({
      warmupIterations: 5,
      measuredIterations: 25,
      operationsPerIteration: 5000, // 5000 synthetic systems
    }),
  }),
  run({ seed, operationsPerIteration }) {
    return runKernelThroughputScenario(seed, operationsPerIteration);
  },
});
