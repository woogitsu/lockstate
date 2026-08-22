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
    'Deterministic CPU smoke workload used only to verify benchmark harness timing, reporting and checksum integrity.',
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
