// Offline real-wrapper collection only. No test execution or web server.
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fileFilter, partition } from './partition-source-files.mjs';
const directory = fileURLToPath(new URL('.', import.meta.url));
const read = name => JSON.parse(readFileSync(directory + name, 'utf8'));
function collect(suite, name, extra = []) {
  const output = openSync(directory + 'evidence/' + name + '.json', 'w');
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-transform-types', '--disable-warning=ExperimentalWarning',
      'tests/browser/run-suite.ts', '--suite', suite,
      '--list', '--reporter=json', '--workers=1', ...extra,
    ], { env: { ...process.env, CI: 'true' }, stdio: ['ignore', output, 'inherit'] });
    if (result.error || result.status !== 0) throw result.error ?? new Error(`${name}: exit ${result.status}`);
  } finally { closeSync(output); }
  const target = directory + 'evidence/' + name + '.json';
  writeFileSync(target, JSON.stringify(JSON.parse(readFileSync(target, 'utf8'))) + '\n');
}
collect('browser', 'source-all');
const bins = partition(read('evidence/source-all.json'), read('file-weight-evidence.json'));
for (const [index, bin] of bins.entries()) {
  writeFileSync(directory + `source-files-${index + 1}.txt`, bin.files.join('\n') + '\n');
  collect('browser', `source-balanced-${index + 1}`, bin.files.map(fileFilter));
  collect('browser', `source-shard-${index + 1}`, [`--shard=${index + 1}/2`]);
}
collect('artifact', 'artifact-all');
console.log('Six real-wrapper offline collections completed. No browser launched.');
