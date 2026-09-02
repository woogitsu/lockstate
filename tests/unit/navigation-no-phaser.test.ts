import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const NAVIGATION_DIR = join(__dirname, '../../src/simulation/navigation');

/**
 * Recursive on purpose. A flat `readdirSync` never entered a subdirectory,
 * so a file placed one level down was invisible to this scan while a bare
 * `files.length > 0` floor (against 15 real files) stayed satisfied by the
 * ones left over -- measured,
 * `docs/research/2026-09-02-the-unit-gates-that-cannot-fail.md`: a
 * `browser/adapter.ts` importing Phaser and touching `document`/`window`
 * left this test green. `src/simulation/navigation/` has no subdirectories
 * today, so this only changes behaviour the day one is added -- which is
 * exactly the day the old version would have stopped protecting anything.
 */
function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

describe('navigation module boundaries', () => {
  it('imports no Phaser and touches no DOM/browser globals', () => {
    const files = collectTypeScriptFiles(NAVIGATION_DIR);
    // The measured corpus is 15 files; this floor tolerates ordinary growth
    // and shrinkage while still noticing the walk collapsing to near nothing.
    expect(files.length).toBeGreaterThan(10);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not import Phaser`).not.toMatch(/from ['"]phaser['"]/i);
      expect(source, `${file} must not touch the DOM`).not.toMatch(/\bdocument\.|window\./);
    }
  });
});
