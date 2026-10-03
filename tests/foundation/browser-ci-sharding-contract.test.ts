import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileFilter, partition, specs, type CollectedReport, type FileWeights } from '../browser/partition-source-files';

interface Step {
  readonly name?: string; readonly id?: string; readonly run?: string;
  readonly if?: string; readonly uses?: string; readonly with?: Readonly<Record<string, unknown>>;
  readonly env?: Readonly<Record<string, string>>;
}
interface Job {
  readonly if: string; readonly needs?: string | readonly string[];
  readonly steps: readonly Step[]; readonly outputs?: Readonly<Record<string, string>>;
  readonly strategy?: unknown; readonly 'runs-on': string; readonly 'timeout-minutes': number;
}
interface Workflow {
  readonly on: unknown; readonly env: unknown; readonly concurrency: unknown; readonly permissions: unknown;
  readonly jobs: Readonly<Record<string, Job>>;
}
const directory = 'docs/design/2026-10-02-browser-ci-sharding';
const require = createRequire(import.meta.url);
const pwRequire = createRequire(createRequire(require.resolve('@playwright/test/package.json')).resolve('playwright/package.json'));
const { yaml } = pwRequire(path.join(path.dirname(pwRequire.resolve('playwright-core/package.json')), 'lib/utilsBundle.js')) as {
  yaml: { parse: (source: string) => Workflow };
};
const read = (file: string) => readFileSync(file, 'utf8');
const workflow = () => yaml.parse(read('.github/workflows/ci.yml'));
// This release starts from #1977, whose approved verify hydration predates the
// split. Keep the original main baseline intact and pin this subject separately.
const beforePath = `${directory}/activation/ci-before-object-admission-release-activation.yml`;
const before = yaml.parse(read(beforePath));
const job = (value: Workflow, name: string): Job => {
  const result = value.jobs[name]; if (!result) throw Error(`Missing job ${name}`); return result;
};
const step = (value: Job, name: string): Step => {
  const result = value.steps.find(entry => entry.name === name); if (!result) throw Error(`Missing step ${name}`); return result;
};
const report = (name: string) => JSON.parse(read(`${directory}/activation/object-admission-release/${name}.json`)) as CollectedReport;
const weights = JSON.parse(read(`${directory}/file-weight-evidence.json`)) as FileWeights;
const files = (value: CollectedReport) => [...new Set(specs(value).map(spec => spec.file))].sort();

describe('owner-approved browser CI sharding contract (#1983)', () => {
  it('preserves exact #1977 verification/assets/provisioning, fork and event/concurrency gates', () => {
    // Check the immutable LF Git blob on both Unix and autocrlf Windows checkouts.
    expect(createHash('sha256').update(read(beforePath).replaceAll('\r\n', '\n')).digest('hex')).toBe('749bfab9c2467b8442f89f238e796fd8aae9dd9aee4e8976cd622ca9e8241833');
    const active = workflow();
    for (const key of ['on', 'env', 'concurrency', 'permissions'] as const) expect(active[key]).toEqual(before[key]);
    expect(Object.keys(active.jobs).sort()).toEqual(['assets', 'browser', 'browser-artifact', 'browser-source', 'verify']);
    for (const name of ['verify', 'assets']) expect(job(active, name)).toEqual(job(before, name));
    const original = job(before, 'browser');
    const common = original.steps.slice(0, original.steps.findIndex(entry => entry.name === 'Run the real-browser suite'));
    expect(common.length).toBeGreaterThan(5);
    for (const name of ['browser-source', 'browser-artifact']) {
      const value = job(active, name);
      expect(value.if).toBe(original.if); expect(value.needs).toBe('assets');
      expect(value['runs-on']).toBe('ubuntu-latest'); expect(value['timeout-minutes']).toBe(90);
      expect(value.steps.slice(0, common.length)).toEqual(common);
      expect(value.outputs).toEqual({ tested_sha: '${{ steps.subject.outputs.sha }}' });
      const subject = value.steps.find(entry => entry.id === 'subject');
      expect(subject?.run).toBe('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"\nprintf "sha=%s\\n" "$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"\n');
    }
    expect(job(active, 'browser').if).toBe(`always() && (${original.if})`);
  });

  it('uses exactly two serial whole-file source jobs and unchanged real-wrapper output guards', () => {
    const source = job(workflow(), 'browser-source');
    expect(source.strategy).toEqual({ 'fail-fast': false, matrix: { shard: [1, 2] } });
    const collect = step(source, 'Collect and partition whole source files without launching a browser').run;
    expect(collect).toBe('node --experimental-transform-types --disable-warning=ExperimentalWarning tests/browser/run-suite.ts --suite browser --list --reporter=json --workers=1 > source-all.json\nnode --experimental-transform-types --disable-warning=ExperimentalWarning tests/browser/partition-source-files.ts source-all.json source-files\n');
    const run = step(source, 'Run the real-browser suite').run ?? '';
    expect(run).toContain('mapfile -t source_filters < source-files-filters-${{ matrix.shard }}.txt');
    expect(run).toContain('test "${#source_filters[@]}" -gt 0');
    expect(run.replace('\nmapfile -t source_filters < source-files-filters-${{ matrix.shard }}.txt\ntest "${#source_filters[@]}" -gt 0', '').replace(' --workers=1 "${source_filters[@]}"', '')).toBe(step(job(before, 'browser'), 'Run the real-browser suite').run);
    expect(source.steps.filter(entry => entry.name === 'Build the production client')).toHaveLength(0);
  });

  it('builds and runs artifact acceptance once independently, preserving all original output guards', () => {
    const artifact = job(workflow(), 'browser-artifact'); expect(artifact.strategy).toBeUndefined();
    expect(artifact.steps.filter(entry => entry.name === 'Build the production client')).toEqual([step(job(before, 'browser'), 'Build the production client')]);
    const run = step(artifact, 'Run the built client in a browser').run ?? '';
    expect(run.replace(' --workers=1', '').replace('\nprintf \'%s\\n\' "$output" > browser-suite.log', '')).toBe(step(job(before, 'browser'), 'Run the built client in a browser').run);
    expect(artifact.steps.filter(entry => entry.name === 'Run the built client in a browser')).toHaveLength(1);
    const aggregate = job(workflow(), 'browser');
    expect(aggregate.needs).toEqual(['browser-source', 'browser-artifact']); expect(aggregate.steps).toHaveLength(1);
  });

  it('uploads separate source/artifact evidence after execution under always with unchanged retention', () => {
    const active = workflow(); const old = job(before, 'browser').steps.at(-1)!;
    for (const name of ['browser-source', 'browser-artifact']) {
      const value = job(active, name); const upload = value.steps.at(-1)!;
      expect(upload.if).toBe('always()'); expect(upload.uses).toBe(old.uses);
      expect({ ...upload.with, name: old.with?.['name'] }).toEqual(old.with);
      expect(upload.with?.['name']).toBe(name === 'browser-source' ? 'browser-source-${{ matrix.shard }}-${{ github.run_id }}-${{ github.run_attempt }}' : 'browser-artifact-${{ github.run_id }}-${{ github.run_attempt }}');
    }
  });

  it('actual aggregate shell accepts same-subject success and refuses every missing/failed/cancelled boundary', () => {
    const aggregate = job(workflow(), 'browser').steps[0]!;
    expect(aggregate.env).toEqual({ SOURCE_RESULT: '${{ needs.browser-source.result }}', ARTIFACT_RESULT: '${{ needs.browser-artifact.result }}', SOURCE_SHA: '${{ needs.browser-source.outputs.tested_sha }}', ARTIFACT_SHA: '${{ needs.browser-artifact.outputs.tested_sha }}' });
    const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
    const good = { SOURCE_RESULT: 'success', ARTIFACT_RESULT: 'success', SOURCE_SHA: 'a'.repeat(40), ARTIFACT_SHA: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40) };
    const run = (changes: Readonly<Record<string, string>>) => {
      const value = spawnSync(bash, ['-c', aggregate.run ?? 'exit 99'], { env: { ...process.env, ...good, ...changes }, encoding: 'utf8' });
      if (value.error) throw value.error; return value.status;
    };
    expect(run({})).toBe(0);
    for (const key of ['SOURCE_RESULT', 'ARTIFACT_RESULT']) for (const value of ['failure', 'cancelled', 'skipped', '']) expect(run({ [key]: value }), `${key}=${value}`).not.toBe(0);
    for (const key of ['SOURCE_SHA', 'ARTIFACT_SHA']) for (const value of ['b'.repeat(40), '']) expect(run({ [key]: value }), `${key}=${value}`).not.toBe(0);
  });

  it('actual promoted producer exactly matches both previously collected whole-file partitions', () => {
    const all = report('source-all'); const bins = partition(all, weights);
    expect(bins).toHaveLength(2);
    bins.forEach((bin, index) => expect(bin.files).toEqual(files(report(`source-balanced-${index + 1}`))));
    expect(bins.flatMap(bin => bin.files).sort()).toEqual(files(all));
    expect(new Set(bins.flatMap(bin => bin.files)).size).toBe(files(all).length);
    const artifact = report('artifact-all');
    expect(files(artifact).filter(file => files(all).includes(file))).toEqual([]);
  });

  it('new collected files get exactly one owner; failed/empty collection refuses instead of silently skipping', () => {
    const all = structuredClone(report('source-all'));
    const future = { ...all, specs: [{ file: 'new-unmeasured.spec.ts', tests: [{}, {}] }] };
    expect(partition(future, weights).flatMap(bin => bin.files).filter(file => file === 'new-unmeasured.spec.ts')).toEqual(['new-unmeasured.spec.ts']);
    expect(() => partition({}, weights)).toThrow('Empty source collection');
    expect(() => partition({ errors: ['actual collector failure'] }, weights)).toThrow('Source collection has errors');
    for (const file of files(all)) {
      const filter = new RegExp(fileFilter(file));
      expect(filter.test('/work/tests/browser/' + file)).toBe(true);
      expect(filter.test('C:\\work\\tests\\browser\\' + file)).toBe(true);
      expect(filter.test('/work/tests/browser/prefix-' + file)).toBe(false);
    }
  });
});
