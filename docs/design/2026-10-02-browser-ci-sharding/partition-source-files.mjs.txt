// Review prototype: collects no browser and edits no production configuration.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function specs(report) {
  return [...(report.specs ?? []), ...(report.suites ?? []).flatMap(specs)];
}
export function partition(report, evidence) {
  if (report.errors?.length) throw new Error('Source collection has errors');
  const files = new Map();
  for (const spec of specs(report)) files.set(spec.file, (files.get(spec.file) ?? 0) + spec.tests.length);
  if (!files.size) throw new Error('Empty source collection');
  const bins = [{ files: [], weight: 0 }, { files: [], weight: 0 }];
  const ranked = [...files].map(([file, count]) => ({ file,
    weight: evidence.weights[file] ?? count * 30 })).sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file, 'en'));
  for (const item of ranked) {
    const bin = bins[0].weight <= bins[1].weight ? bins[0] : bins[1];
    bin.files.push(item.file); bin.weight += item.weight;
  }
  for (const bin of bins) bin.files.sort();
  return bins;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, outputPrefix] = process.argv.slice(2);
  if (!input || !outputPrefix) throw new Error('Usage: partition-source-files.mjs source-all.json output-prefix');
  const report = JSON.parse(readFileSync(input, 'utf8'));
  const evidence = JSON.parse(readFileSync(new URL('file-weight-evidence.json', import.meta.url), 'utf8'));
  const bins = partition(report, evidence);
  bins.forEach((bin, i) => {
    writeFileSync(`${outputPrefix}-${i + 1}.txt`, bin.files.join('\n') + '\n');
    writeFileSync(`${outputPrefix}-filters-${i + 1}.txt`, bin.files.map(fileFilter).join('\n') + '\n');
  });
  writeFileSync(`${outputPrefix}-weights.json`, JSON.stringify(bins, null, 2));
}
export function fileFilter(file) {
  return '(^|[/\\\\])' + file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
}
