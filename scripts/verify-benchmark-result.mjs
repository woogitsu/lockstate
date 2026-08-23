import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  BENCHMARK_HARNESS_VERSION,
  BENCHMARK_RESULT_SCHEMA_VERSION,
  normalizeRunResult,
  summarizeSamples,
} from '../benchmarks/harness.mjs';
import { findBenchmarkScenario } from '../benchmarks/registry.mjs';
import { parseBenchmarkArguments } from './run-benchmarks.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assertFiniteNumber(value, label) {
  assert.equal(typeof value, 'number', `${label} must be a number.`);
  assert.ok(Number.isFinite(value), `${label} must be finite.`);
}

function assertApproximatelyEqual(actual, expected, label) {
  assertFiniteNumber(actual, label);
  assert.ok(Math.abs(actual - expected) <= 0.000001, `${label} differs: ${actual} !== ${expected}.`);
}

function verifyHarnessMath() {
  const summary = summarizeSamples([1, 2, 3, 4], 10);

  assert.deepEqual(summary, {
    sampleCount: 4,
    totalOperations: 40,
    minMs: 1,
    maxMs: 4,
    meanMs: 2.5,
    medianMs: 2.5,
    p95Ms: 4,
    standardDeviationMs: 1.118034,
    operationsPerSecond: 4_000,
  });
  assert.deepEqual(parseBenchmarkArguments(['--profile', 'smoke', '--output', 'custom.json']), {
    profile: 'smoke',
    outputPath: 'custom.json',
  });
  assert.throws(() => parseBenchmarkArguments(['--profile', 'unknown']), /Unsupported benchmark profile/u);
  assert.throws(() => parseBenchmarkArguments(['--unexpected']), /Unknown benchmark argument/u);
}

async function verifyScenario(resultScenario, profile) {
  assert.equal(typeof resultScenario, 'object');
  assert.ok(resultScenario !== null);
  assert.equal(resultScenario.profile, profile);
  assert.equal(resultScenario.uniqueChecksumCount, 1);
  assert.equal(resultScenario.samplesMs.length, resultScenario.measuredIterations);

  const registeredScenario = findBenchmarkScenario(resultScenario.id);
  assert.ok(registeredScenario, `Unknown benchmark scenario ${String(resultScenario.id)}.`);
  assert.equal(resultScenario.version, registeredScenario.version);
  assert.equal(resultScenario.seed, registeredScenario.seed);

  const expected = normalizeRunResult(
    await registeredScenario.run({
      seed: resultScenario.seed,
      operationsPerIteration: resultScenario.operationsPerIteration,
    }),
  );
  assert.equal(resultScenario.checksum, expected.checksum);

  if (expected.metrics !== null) {
    assert.deepEqual(resultScenario.metrics, expected.metrics, `${resultScenario.id} metrics must be deterministic.`);
  } else {
    assert.equal(resultScenario.metrics, undefined);
  }

  for (const sample of resultScenario.samplesMs) {
    assertFiniteNumber(sample, `${resultScenario.id} sample`);
    assert.ok(sample >= 0, `${resultScenario.id} sample must be non-negative.`);
  }

  const expectedSummary = summarizeSamples(
    resultScenario.samplesMs,
    resultScenario.operationsPerIteration,
  );

  assert.equal(resultScenario.summary.sampleCount, expectedSummary.sampleCount);
  assert.equal(resultScenario.summary.totalOperations, expectedSummary.totalOperations);
  assertApproximatelyEqual(resultScenario.summary.minMs, expectedSummary.minMs, 'minMs');
  assertApproximatelyEqual(resultScenario.summary.maxMs, expectedSummary.maxMs, 'maxMs');
  assertApproximatelyEqual(resultScenario.summary.meanMs, expectedSummary.meanMs, 'meanMs');
  assertApproximatelyEqual(resultScenario.summary.medianMs, expectedSummary.medianMs, 'medianMs');
  assertApproximatelyEqual(resultScenario.summary.p95Ms, expectedSummary.p95Ms, 'p95Ms');
  assertApproximatelyEqual(
    resultScenario.summary.standardDeviationMs,
    expectedSummary.standardDeviationMs,
    'standardDeviationMs',
  );

  if (expectedSummary.operationsPerSecond === null) {
    assert.equal(resultScenario.summary.operationsPerSecond, null);
  } else {
    assertApproximatelyEqual(
      resultScenario.summary.operationsPerSecond,
      expectedSummary.operationsPerSecond,
      'operationsPerSecond',
    );
  }
}

async function main() {
  verifyHarnessMath();

  const resultPath = process.argv[2];

  if (resultPath === undefined) {
    throw new Error('Usage: node scripts/verify-benchmark-result.mjs <result.json>');
  }

  const absoluteResultPath = path.resolve(repositoryRoot, resultPath);
  const result = JSON.parse(await readFile(absoluteResultPath, 'utf8'));

  assert.equal(result.schemaVersion, BENCHMARK_RESULT_SCHEMA_VERSION);
  assert.equal(result.harnessVersion, BENCHMARK_HARNESS_VERSION);
  assert.ok(result.profile === 'smoke' || result.profile === 'full');
  assert.equal(result.runtime.node, process.version);
  assert.equal(typeof result.runtime.v8, 'string');
  assert.equal(typeof result.runtime.platform, 'string');
  assert.equal(typeof result.runtime.architecture, 'string');
  assert.equal(typeof result.runtime.cpuModel, 'string');
  assert.ok(Number.isInteger(result.runtime.logicalCpuCount));
  assert.ok(result.runtime.logicalCpuCount > 0);
  assert.ok(Array.isArray(result.scenarios));
  assert.ok(result.scenarios.length > 0);

  for (const scenario of result.scenarios) {
    await verifyScenario(scenario, result.profile);
  }

  console.log(
    `Verified benchmark schema v${result.schemaVersion}, harness v${result.harnessVersion}, ` +
      `${result.scenarios.length} deterministic scenario(s).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
