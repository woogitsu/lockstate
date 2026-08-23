import { performance } from 'node:perf_hooks';

export const BENCHMARK_RESULT_SCHEMA_VERSION = 1;
export const BENCHMARK_HARNESS_VERSION = 1;

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer, received ${String(value)}.`);
  }
}

function assertFiniteSamples(samplesMs) {
  if (!Array.isArray(samplesMs) || samplesMs.length === 0) {
    throw new TypeError('Benchmark samples must be a non-empty array.');
  }

  for (const sample of samplesMs) {
    if (!Number.isFinite(sample) || sample < 0) {
      throw new TypeError(`Benchmark sample must be a finite non-negative number, received ${String(sample)}.`);
    }
  }
}

function round(value) {
  return Number(value.toFixed(6));
}

export function percentileNearestRank(sortedSamples, percentile) {
  assertFiniteSamples(sortedSamples);

  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 100) {
    throw new RangeError(`Percentile must be in (0, 100], received ${String(percentile)}.`);
  }

  const rank = Math.ceil((percentile / 100) * sortedSamples.length);
  return sortedSamples[Math.max(0, rank - 1)];
}

export function summarizeSamples(samplesMs, operationsPerIteration) {
  assertFiniteSamples(samplesMs);
  assertPositiveInteger(operationsPerIteration, 'operationsPerIteration');

  const sorted = [...samplesMs].sort((left, right) => left - right);
  const totalMs = sorted.reduce((sum, sample) => sum + sample, 0);
  const meanMs = totalMs / sorted.length;
  const midpoint = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0
      ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
      : sorted[midpoint];
  const variance =
    sorted.reduce((sum, sample) => sum + (sample - meanMs) ** 2, 0) / sorted.length;
  const totalOperations = operationsPerIteration * sorted.length;
  const operationsPerSecond = totalMs === 0 ? null : totalOperations / (totalMs / 1_000);

  return {
    sampleCount: sorted.length,
    totalOperations,
    minMs: round(sorted[0]),
    maxMs: round(sorted.at(-1)),
    meanMs: round(meanMs),
    medianMs: round(medianMs),
    p95Ms: round(percentileNearestRank(sorted, 95)),
    standardDeviationMs: round(Math.sqrt(variance)),
    operationsPerSecond: operationsPerSecond === null ? null : round(operationsPerSecond),
  };
}

function normalizeChecksum(value) {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  throw new TypeError('A benchmark scenario must return a non-empty string or finite number checksum.');
}

/**
 * A scenario's `run()` returns either the original bare string/number
 * checksum contract, or `{ checksum, metrics }` where `metrics` is an
 * arbitrary JSON-serializable object of scenario-specific structured
 * evidence (e.g. work units, cache hit rate, queue latency) alongside the
 * harness's own wall-clock timing -- additive, fully backward compatible
 * with every scenario written before this existed.
 */
export function normalizeRunResult(value) {
  if (value !== null && typeof value === 'object' && 'checksum' in value) {
    return { checksum: normalizeChecksum(value.checksum), metrics: value.metrics ?? null };
  }
  return { checksum: normalizeChecksum(value), metrics: null };
}

export async function runBenchmarkScenario(scenario, profileName) {
  const profile = scenario.profiles[profileName];

  if (profile === undefined) {
    throw new Error(`Scenario ${scenario.id} does not define profile ${profileName}.`);
  }

  assertPositiveInteger(profile.warmupIterations, 'warmupIterations');
  assertPositiveInteger(profile.measuredIterations, 'measuredIterations');
  assertPositiveInteger(profile.operationsPerIteration, 'operationsPerIteration');

  const context = Object.freeze({
    seed: scenario.seed,
    operationsPerIteration: profile.operationsPerIteration,
  });

  for (let index = 0; index < profile.warmupIterations; index += 1) {
    normalizeRunResult(await scenario.run(context));
  }

  const samplesMs = [];
  const checksums = [];
  let lastMetrics = null;

  for (let index = 0; index < profile.measuredIterations; index += 1) {
    const startedAt = performance.now();
    const { checksum, metrics } = normalizeRunResult(await scenario.run(context));
    const durationMs = performance.now() - startedAt;

    samplesMs.push(round(durationMs));
    checksums.push(checksum);
    lastMetrics = metrics;
  }

  const uniqueChecksums = new Set(checksums);

  if (uniqueChecksums.size !== 1) {
    throw new Error(
      `Scenario ${scenario.id} is nondeterministic: measured iterations produced ${uniqueChecksums.size} checksums.`,
    );
  }

  return {
    id: scenario.id,
    version: scenario.version,
    description: scenario.description,
    profile: profileName,
    seed: scenario.seed,
    warmupIterations: profile.warmupIterations,
    measuredIterations: profile.measuredIterations,
    operationsPerIteration: profile.operationsPerIteration,
    checksum: checksums[0],
    uniqueChecksumCount: uniqueChecksums.size,
    samplesMs,
    summary: summarizeSamples(samplesMs, profile.operationsPerIteration),
    ...(lastMetrics !== null ? { metrics: lastMetrics } : {}),
  };
}
