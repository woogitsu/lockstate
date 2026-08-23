import { performance } from 'node:perf_hooks';
import os from 'node:os';
import process from 'node:process';

/**
 * Minimal timing/reporting helpers for the persistence measurement harness.
 *
 * Deliberately reporting-only: nothing here asserts an elapsed-time budget.
 * `docs/BENCHMARKING.md` forbids a timing threshold until repeated
 * controlled baselines exist, and `docs/TESTING.md` forbids proving
 * correctness by elapsed time, so this module produces numbers for a human
 * to read and leaves every assertion to correctness invariants.
 *
 * It uses `node:perf_hooks` for the same reason `scripts/run-benchmarks.mjs`
 * does — a stable high-resolution clock with no added dependency.
 */

export interface DurationStats {
  readonly samples: number;
  readonly min: number;
  readonly median: number;
  readonly mean: number;
  readonly p95: number;
  readonly max: number;
  /** Every raw sample, retained so an outlier can be explained rather than silently dropped. */
  readonly raw: readonly number[];
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? Number.NaN;
}

export function summarize(raw: readonly number[]): DurationStats {
  const sorted = [...raw].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length === 0
      ? Number.NaN
      : sorted.length % 2 === 1
        ? (sorted[middle] ?? Number.NaN)
        : ((sorted[middle - 1] ?? Number.NaN) + (sorted[middle] ?? Number.NaN)) / 2;

  return {
    samples: sorted.length,
    min: sorted[0] ?? Number.NaN,
    median,
    mean: sorted.length === 0 ? Number.NaN : total / sorted.length,
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? Number.NaN,
    raw: [...raw],
  };
}

/**
 * Runs `warmup` unmeasured iterations (JIT/allocation stabilization, never
 * mixed into the samples — `docs/BENCHMARKING.md`), then `iterations`
 * measured ones. `iteration` receives a 0-based index so a workload can vary
 * per-iteration state (e.g. a save revision) without varying its size.
 */
export async function measureAsync(
  warmup: number,
  iterations: number,
  iteration: (index: number) => Promise<void>,
): Promise<DurationStats> {
  for (let index = 0; index < warmup; index += 1) {
    await iteration(-1 - index);
  }

  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await iteration(index);
    samples.push(performance.now() - started);
  }

  return summarize(samples);
}

export function measureSync(warmup: number, iterations: number, iteration: (index: number) => void): DurationStats {
  for (let index = 0; index < warmup; index += 1) iteration(-1 - index);

  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    iteration(index);
    samples.push(performance.now() - started);
  }

  return summarize(samples);
}

export function jsonByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
}

export function formatMs(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'n/a';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

/** Renders a fixed-width table so results stay readable in CI logs and in a pasted report. */
export function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    cells.map((cell, column) => (cell ?? '').padEnd(widths[column] ?? 0)).join('  ');

  return [line(headers), widths.map((width) => '-'.repeat(width)).join('  '), ...rows.map(line)].join('\n');
}

export function environmentSummary(): string {
  const cpus = os.cpus();
  const model = cpus[0]?.model ?? 'unknown CPU';
  return [
    `node ${process.version} (v8 ${process.versions.v8})`,
    `${process.platform}/${process.arch}`,
    `${cpus.length}× ${model.trim()}`,
    `${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(1)} GiB RAM`,
  ].join(' | ');
}
