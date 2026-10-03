import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CollectedSpec {
  readonly file: string;
  readonly tests: readonly unknown[];
}
export interface CollectedReport {
  readonly specs?: readonly CollectedSpec[];
  readonly suites?: readonly CollectedReport[];
  readonly errors?: readonly unknown[];
}
export interface FileWeights { readonly weights: Readonly<Record<string, number>> }
export interface SourcePartition { readonly files: string[]; weight: number }

export function specs(report: CollectedReport): readonly CollectedSpec[] {
  return [...(report.specs ?? []), ...(report.suites ?? []).flatMap(specs)];
}

/** The owner-approved whole-file greedy balance; weights are not timeouts. */
export function partition(report: CollectedReport, evidence: FileWeights): readonly SourcePartition[] {
  if (report.errors?.length) throw new Error('Source collection has errors');
  const files = new Map<string, number>();
  for (const spec of specs(report)) files.set(spec.file, (files.get(spec.file) ?? 0) + spec.tests.length);
  if (!files.size) throw new Error('Empty source collection');
  const first: SourcePartition = { files: [], weight: 0 };
  const second: SourcePartition = { files: [], weight: 0 };
  const ranked = [...files].map(([file, count]) => ({ file,
    weight: evidence.weights[file] ?? count * 30,
  })).sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file, 'en'));
  for (const item of ranked) {
    const bin = first.weight <= second.weight ? first : second;
    bin.files.push(item.file); bin.weight += item.weight;
  }
  for (const bin of [first, second]) bin.files.sort();
  return [first, second];
}

export function fileFilter(file: string): string {
  return '(^|[/\\\\])' + file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, outputPrefix] = process.argv.slice(2);
  if (!input || !outputPrefix) throw new Error('Usage: partition-source-files.ts source-all.json output-prefix');
  const report = JSON.parse(readFileSync(input, 'utf8')) as CollectedReport;
  const evidence = JSON.parse(readFileSync(new URL('../../docs/design/2026-10-02-browser-ci-sharding/file-weight-evidence.json', import.meta.url), 'utf8')) as FileWeights;
  const bins = partition(report, evidence);
  bins.forEach((bin, index) => {
    writeFileSync(`${outputPrefix}-${index + 1}.txt`, bin.files.join('\n') + '\n');
    writeFileSync(`${outputPrefix}-filters-${index + 1}.txt`, bin.files.map(fileFilter).join('\n') + '\n');
  });
  writeFileSync(`${outputPrefix}-weights.json`, JSON.stringify(bins, null, 2));
}
