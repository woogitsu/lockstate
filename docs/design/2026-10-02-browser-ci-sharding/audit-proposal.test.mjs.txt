import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileFilter, partition, specs } from './partition-source-files.mjs';
const directory = fileURLToPath(new URL('.', import.meta.url));
const read = name => JSON.parse(readFileSync(directory + 'evidence/' + name + '.json', 'utf8'));
const source = read('source-all'); const artifact = read('artifact-all');
const require = createRequire(path.resolve('package.json'));
const pwRequire = createRequire(createRequire(require.resolve('@playwright/test/package.json')).resolve('playwright/package.json'));
const { yaml } = pwRequire(path.join(path.dirname(pwRequire.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const original = yaml.parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
const draft = name => yaml.parse(readFileSync(directory + `ci-${name}.draft.yml`, 'utf8'));
const records = report => specs(report).flatMap(spec => spec.tests.map(value => ({
  id: spec.id + ':' + value.projectId, file: spec.file, title: spec.title,
  line: spec.line, column: spec.column, tags: spec.tags,
  timeout: value.timeout, annotations: value.annotations, expectedStatus: value.expectedStatus,
}))).sort((a, b) => a.id.localeCompare(b.id));
const files = report => [...new Set(specs(report).map(spec => spec.file))].sort();
function exactPartition(full, parts) {
  const expected = records(full); const actual = parts.flatMap(records).sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(new Set(actual.map(record => record.id)).size, actual.length, 'Duplicate test IDs');
  assert.deepEqual(actual, expected, 'Missing/extra/modified test records');
  const actualFiles = parts.flatMap(files);
  assert.equal(new Set(actualFiles).size, actualFiles.length, 'A source file split or repeated');
}
test('real balanced whole-file collections exactly cover source and once-only artifact', () => {
  const parts = [read('source-balanced-1'), read('source-balanced-2')];
  exactPartition(source, parts);
  assert.equal(records(source).length, 887); assert.equal(files(source).length, 169);
  assert.equal(records(artifact).length, 83); assert.equal(files(artifact).length, 32);
  const sourceIds = new Set(records(source).map(record => record.id));
  assert.equal(records(artifact).filter(record => sourceIds.has(record.id)).length, 0);
  assert.deepEqual([...files(source), ...files(artifact)].sort(), readdirSync('tests/browser').filter(file => file.endsWith('.spec.ts')).sort());
  exactPartition(artifact, [artifact]);
});
test('simpler real native shard collections have the same exact coverage', () => {
  exactPartition(source, [read('source-shard-1'), read('source-shard-2')]);
});
test('committed producer and snapshot file sets agree with real collection; future files remain included', () => {
  const evidence = JSON.parse(readFileSync(directory + 'file-weight-evidence.json', 'utf8'));
  const bins = partition(source, evidence);
  bins.forEach((bin, i) => {
    assert.deepEqual(bin.files, files(read(`source-balanced-${i + 1}`)));
    assert.deepEqual(bin.files, readFileSync(directory + `source-files-${i + 1}.txt`, 'utf8').trim().split(/\r?\n/));
    for (const file of bin.files) {
      const filter = new RegExp(fileFilter(file));
      assert.ok(filter.test('/work/tests/browser/' + file));
      assert.ok(filter.test('C:\\work\\tests\\browser\\' + file));
      assert.ok(!filter.test('/work/tests/browser/prefix-' + file));
    }
  });
  const future = structuredClone(source);
  future.specs = [{ file: 'unmeasured-future.spec.ts', tests: [{}] }];
  assert.equal(partition(future, evidence).flatMap(bin => bin.files).filter(file => file === 'unmeasured-future.spec.ts').length, 1);
});
test('coverage guard refuses missing file, duplicate source, and omitted artifact test', () => {
  const a = read('source-balanced-1'); const b = read('source-balanced-2');
  assert.throws(() => exactPartition(source, [a]), /Missing/);
  assert.throws(() => exactPartition(source, [a, b, b]), /Duplicate/);
  const omitted = structuredClone(artifact); omitted.suites = omitted.suites.slice(1);
  assert.throws(() => exactPartition(artifact, [omitted]), /Missing/);
});
test('all collection configurations retain serial workers and existing case/retry metadata', () => {
  for (const report of [source, artifact, read('source-balanced-1'), read('source-balanced-2'), read('source-shard-1'), read('source-shard-2')]) {
    assert.deepEqual(report.errors, []);
    assert.equal(report.config.fullyParallel, false); assert.equal(report.config.workers, 1);
    assert.equal(report.config.forbidOnly, true);
    for (const project of report.config.projects) {
      assert.equal(project.retries, 0); assert.equal(project.timeout, 60_000); assert.equal(project.repeatEach, 1);
    }
  }
});
for (const variant of ['balanced', 'native']) {
  test(`${variant} draft preserves gates/provisioning and selects all artifact files once`, () => {
    const proposed = draft(variant); const initial = original.jobs.browser;
    assert.deepEqual(proposed.on, original.on); assert.deepEqual(proposed.env, original.env);
    assert.deepEqual(proposed.concurrency, original.concurrency);
    assert.deepEqual(proposed.jobs.verify, original.jobs.verify); assert.deepEqual(proposed.jobs.assets, original.jobs.assets);
    assert.deepEqual(Object.keys(proposed.jobs).sort(), ['assets', 'browser', 'browser-artifact', 'browser-source', 'verify']);
    const common = initial.steps.slice(0, initial.steps.findIndex(step => step.name === 'Run the real-browser suite'));
    for (const name of ['browser-source', 'browser-artifact']) {
      const job = proposed.jobs[name];
      assert.equal(job.if, initial.if); assert.equal(job.needs, initial.needs);
      assert.equal(job['runs-on'], 'ubuntu-latest'); assert.equal(job['timeout-minutes'], initial['timeout-minutes']);
      assert.deepEqual(job.steps.slice(0, common.length), common);
      assert.match(job.steps.find(step => step.id === 'subject').run, /git rev-parse HEAD.*GITHUB_SHA/);
      const upload = job.steps.at(-1); const oldUpload = initial.steps.at(-1);
      assert.equal(upload.if, 'always()'); assert.equal(upload.uses, oldUpload.uses);
      assert.deepEqual({ ...upload.with, name: oldUpload.with.name }, oldUpload.with);
    }
    const sourceJob = proposed.jobs['browser-source'];
    assert.deepEqual(sourceJob.strategy, { 'fail-fast': false, matrix: { shard: [1, 2] } });
    const originalSource = initial.steps.find(step => step.name === 'Run the real-browser suite').run;
    let proposedSource = sourceJob.steps.find(step => step.name === 'Run the real-browser suite').run;
    proposedSource = variant === 'native'
      ? proposedSource.replace(' --workers=1 --shard=${{ matrix.shard }}/2', '')
      : proposedSource.replace('\nmapfile -t source_filters < source-files-filters-${{ matrix.shard }}.txt\ntest "${#source_filters[@]}" -gt 0', '').replace(' --workers=1 "${source_filters[@]}"', '');
    assert.equal(proposedSource, originalSource);
    const artifactJob = proposed.jobs['browser-artifact'];
    assert.ok(!artifactJob.strategy);
    assert.deepEqual(artifactJob.steps.find(step => step.name === 'Build the production client'), initial.steps.find(step => step.name === 'Build the production client'));
    const artifactRun = artifactJob.steps.find(step => step.name === 'Run the built client in a browser').run;
    assert.equal(artifactRun.replace(' --workers=1', '').replace('\nprintf \'%s\\n\' "$output" > browser-suite.log', ''), initial.steps.find(step => step.name === 'Run the built client in a browser').run);
    assert.deepEqual(proposed.jobs.browser.needs, ['browser-source', 'browser-artifact']);
    assert.equal(proposed.jobs.browser.if, `always() && (${initial.if})`);
  });
  test(`${variant} actual aggregate shell rejects failure/cancellation/skips and mismatched/missing exact subjects`, () => {
    const script = draft(variant).jobs.browser.steps[0].run;
    const good = { SOURCE_RESULT: 'success', ARTIFACT_RESULT: 'success', SOURCE_SHA: 'a'.repeat(40), ARTIFACT_SHA: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40) };
    const bash = process.env.LOCKSTATE_BASH ?? (process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash');
    function run(changes) {
      const result = spawnSync(bash, ['-c', script], { env: { ...process.env, ...good, ...changes }, encoding: 'utf8' });
      assert.ok(!result.error, result.error?.message); return result.status;
    }
    assert.equal(run({}), 0);
    for (const key of ['SOURCE_RESULT', 'ARTIFACT_RESULT']) for (const value of ['failure', 'cancelled', 'skipped', '']) assert.notEqual(run({ [key]: value }), 0);
    for (const key of ['SOURCE_SHA', 'ARTIFACT_SHA']) for (const value of ['b'.repeat(40), '']) assert.notEqual(run({ [key]: value }), 0);
  });
}
