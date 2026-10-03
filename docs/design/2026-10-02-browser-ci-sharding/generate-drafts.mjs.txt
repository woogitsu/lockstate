// Produces review YAML only. It never writes .github/workflows.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(path.resolve('package.json'));
const pwRequire = createRequire(createRequire(require.resolve('@playwright/test/package.json')).resolve('playwright/package.json'));
const { yaml } = pwRequire(path.join(path.dirname(pwRequire.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const original = yaml.parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
const browser = original.jobs.browser;
const byName = name => browser.steps.find(step => step.name === name);
const sourceIndex = browser.steps.findIndex(step => step.name === 'Run the real-browser suite');
const common = browser.steps.slice(0, sourceIndex);
const guard = browser.if;
const subject = { name: 'Record exact checked-out subject', id: 'subject', run: 'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"\nprintf "sha=%s\\n" "$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"\n' };
const upload = structuredClone(browser.steps.at(-1));
const prefix = 'docs/design/2026-10-02-browser-ci-sharding';
for (const variant of ['balanced', 'native']) {
  const workflow = structuredClone(original);
  const run = structuredClone(byName('Run the real-browser suite'));
  run.run = run.run.replace('pnpm test:browser 2>&1', variant === 'native'
    ? 'pnpm test:browser --workers=1 --shard=${{ matrix.shard }}/2 2>&1'
    : 'pnpm test:browser --workers=1 "${source_filters[@]}" 2>&1');
  if (variant === 'balanced') run.run = run.run.replace('set -euo pipefail', 'set -euo pipefail\nmapfile -t source_filters < source-files-filters-${{ matrix.shard }}.txt\ntest "${#source_filters[@]}" -gt 0');
  const sourceUpload = structuredClone(upload);
  sourceUpload.with.name = 'browser-source-${{ matrix.shard }}-${{ github.run_id }}-${{ github.run_attempt }}';
  const collection = { name: 'Collect and partition whole source files without launching a browser', run:
    `node --experimental-transform-types --disable-warning=ExperimentalWarning tests/browser/run-suite.ts --suite browser --list --reporter=json --workers=1 > source-all.json\nnode ${prefix}/partition-source-files.mjs source-all.json source-files\n` };
  workflow.jobs['browser-source'] = { if: guard, needs: 'assets', 'runs-on': 'ubuntu-latest',
    'timeout-minutes': 90, strategy: { 'fail-fast': false, matrix: { shard: [1, 2] } },
    outputs: { tested_sha: '${{ steps.subject.outputs.sha }}' },
    steps: [...structuredClone(common), subject, ...(variant === 'balanced' ? [collection] : []), run, sourceUpload] };
  const artifactRun = structuredClone(byName('Run the built client in a browser'));
  artifactRun.run = artifactRun.run.replace('pnpm test:artifact 2>&1', 'pnpm test:artifact --workers=1 2>&1');
  // Preserve the original captured-output guards and also retain that output
  // in this independent job's existing evidence file.
  artifactRun.run = artifactRun.run.replace('printf \'%s\\n\' "$output"', 'printf \'%s\\n\' "$output"\nprintf \'%s\\n\' "$output" > browser-suite.log');
  const artifactUpload = structuredClone(upload);
  artifactUpload.with.name = 'browser-artifact-${{ github.run_id }}-${{ github.run_attempt }}';
  workflow.jobs['browser-artifact'] = { if: guard, needs: 'assets', 'runs-on': 'ubuntu-latest',
    'timeout-minutes': 90, outputs: { tested_sha: '${{ steps.subject.outputs.sha }}' },
    steps: [...structuredClone(common), subject, structuredClone(byName('Build the production client')), artifactRun, artifactUpload] };
  workflow.jobs.browser = { name: 'browser', if: `always() && (${guard})`,
    needs: ['browser-source', 'browser-artifact'], 'runs-on': 'ubuntu-latest', 'timeout-minutes': 90,
    steps: [{ name: 'Require both source shards and artifact success on the exact workflow subject', env: {
      SOURCE_RESULT: '${{ needs.browser-source.result }}', ARTIFACT_RESULT: '${{ needs.browser-artifact.result }}',
      SOURCE_SHA: '${{ needs.browser-source.outputs.tested_sha }}', ARTIFACT_SHA: '${{ needs.browser-artifact.outputs.tested_sha }}',
    }, run: 'set -euo pipefail\ntest "$SOURCE_RESULT" = success\ntest "$ARTIFACT_RESULT" = success\ntest "$SOURCE_SHA" = "$GITHUB_SHA"\ntest "$ARTIFACT_SHA" = "$GITHUB_SHA"\n' }] };
  writeFileSync(`${prefix}/ci-${variant}.draft.yml`, '# OWNER REVIEW DRAFT: not activated; no workflow or protection change.\n' + yaml.stringify(workflow, { lineWidth: 0 }));
}
