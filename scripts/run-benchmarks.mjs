import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  BENCHMARK_HARNESS_VERSION,
  BENCHMARK_RESULT_SCHEMA_VERSION,
  runBenchmarkScenario,
} from '../benchmarks/harness.mjs';
import { benchmarkScenarios } from '../benchmarks/registry.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validProfiles = new Set(['smoke', 'full']);

export function parseBenchmarkArguments(arguments_) {
  let profile = 'full';
  let outputPath;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--profile') {
      const value = arguments_[index + 1];

      if (value === undefined) {
        throw new Error('--profile requires a value.');
      }

      profile = value;
      index += 1;
      continue;
    }

    if (argument === '--output') {
      const value = arguments_[index + 1];

      if (value === undefined) {
        throw new Error('--output requires a value.');
      }

      outputPath = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown benchmark argument: ${argument}`);
  }

  if (!validProfiles.has(profile)) {
    throw new Error(`Unsupported benchmark profile ${profile}; expected smoke or full.`);
  }

  return {
    profile,
    outputPath: outputPath ?? path.join('benchmark-results', `${profile}.json`),
  };
}

function readGitCommit() {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA;
  }

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function runtimeMetadata() {
  const cpus = os.cpus();

  return {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    cpuModel: cpus[0]?.model ?? 'unknown',
    logicalCpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
  };
}

async function main() {
  const { profile, outputPath } = parseBenchmarkArguments(process.argv.slice(2));
  const scenarios = [];

  for (const scenario of benchmarkScenarios) {
    scenarios.push(await runBenchmarkScenario(scenario, profile));
  }

  const result = {
    schemaVersion: BENCHMARK_RESULT_SCHEMA_VERSION,
    harnessVersion: BENCHMARK_HARNESS_VERSION,
    generatedAt: new Date().toISOString(),
    repository: {
      commit: readGitCommit(),
    },
    runtime: runtimeMetadata(),
    profile,
    scenarios,
  };

  const absoluteOutputPath = path.resolve(repositoryRoot, outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  for (const scenario of scenarios) {
    console.log(
      `${scenario.id}@${scenario.version} (${profile}): ${scenario.summary.meanMs.toFixed(3)} ms mean, ` +
        `${scenario.summary.p95Ms.toFixed(3)} ms p95, ${scenario.summary.operationsPerSecond?.toFixed(0) ?? 'n/a'} ops/s, ` +
        `checksum ${scenario.checksum}`,
    );
  }

  console.log(`Benchmark result written to ${path.relative(repositoryRoot, absoluteOutputPath)}.`);
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
