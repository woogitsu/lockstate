// MODELLED, NOT PRODUCTION.
//
// This is the one scenario that models nothing at all: an integer mixing loop
// that exists to exercise the harness, the result schema and the checksum
// validation, and that is named after no subsystem. It imports nothing from
// `src/`, and `docs/BENCHMARKING.md` is explicit that its throughput must
// never be presented as Lockstate simulation capacity.
//
// It still carries the marker rather than being exempted from rule 9. A rule
// with an exception for the file that happens to be honest is a rule nothing
// can check, and the contract in
// `tests/foundation/benchmark-scenario-kind-contract.test.ts` reads this line.

const FOUNDATION_SMOKE_SEED = 0x6d2b79f5;

function rotateLeft(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function runIntegerMix(seed, operationsPerIteration) {
  let value = seed >>> 0;

  for (let index = 0; index < operationsPerIteration; index += 1) {
    value = Math.imul(value ^ ((index + 0x9e3779b9) >>> 0), 0x85ebca6b) >>> 0;
    value = rotateLeft(value, 13);
    value = Math.imul(value ^ (value >>> 16), 0xc2b2ae35) >>> 0;
  }

  return `0x${value.toString(16).padStart(8, '0')}`;
}

export const foundationSmokeScenario = Object.freeze({
  id: 'foundation.integer-mix',
  version: 1,
  description:
    'MODELLED, not production: a deterministic CPU integer-mixing workload that models no subsystem at all, used only to verify benchmark harness timing, reporting and checksum integrity. Imports nothing from src/; its throughput is never Lockstate simulation capacity.',
  seed: FOUNDATION_SMOKE_SEED,
  profiles: Object.freeze({
    smoke: Object.freeze({
      warmupIterations: 3,
      measuredIterations: 12,
      operationsPerIteration: 1_000_000,
    }),
    full: Object.freeze({
      warmupIterations: 8,
      measuredIterations: 30,
      operationsPerIteration: 5_000_000,
    }),
  }),
  run({ seed, operationsPerIteration }) {
    return runIntegerMix(seed, operationsPerIteration);
  },
});
