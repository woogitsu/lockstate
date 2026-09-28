import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowsRoot = path.join(repositoryRoot, '.github', 'workflows');

/**
 * GitHub-hosted workflows must use the same current Linux image.  Keeping the
 * runner choice in one contract prevents a newly added job from silently
 * reintroducing the retired image or a machine-specific runner.  Issue #1089
 * found that the workflow inventory and the runner pool had drifted apart;
 * this check makes the repository's declared side fail at the point of drift.
 */
describe('workflow runner contract', () => {
  it('uses ubuntu-latest for every declared job runner', async () => {
    const names = (await readdir(workflowsRoot)).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
    expect(names.length, 'no workflow files were found; the inventory check is broken').toBeGreaterThan(0);

    const runners: Array<{ file: string; value: string }> = [];
    for (const name of names) {
      const source = await readFile(path.join(workflowsRoot, name), 'utf8');
      for (const match of source.matchAll(/^\s+runs-on:\s*([^\s#]+)\s*(?:#.*)?$/gmu)) {
        const value = match[1];
        if (value !== undefined) runners.push({ file: name, value });
      }
    }

    expect(runners.length, 'workflow inventory contains no runs-on declarations').toBeGreaterThan(0);
    expect(runners.filter(({ value }) => value !== 'ubuntu-latest')).toEqual([]);
  });
});
