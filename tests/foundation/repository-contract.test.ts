import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface PackageContract {
  readonly packageManager: string;
  readonly engines: {
    readonly node: string;
    readonly pnpm: string;
  };
  readonly scripts: {
    readonly test: string;
  };
}

interface TypeScriptContract {
  readonly compilerOptions: {
    readonly strict: boolean;
    readonly noUncheckedIndexedAccess: boolean;
    readonly exactOptionalPropertyTypes: boolean;
    readonly types: readonly string[];
  };
  readonly include: readonly string[];
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

async function readRepositoryJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readRepositoryFile(relativePath)) as T;
}

describe('repository foundation contract', () => {
  it('keeps the runtime and package-manager pins consistent', async () => {
    const packageJson = await readRepositoryJson<PackageContract>('package.json');
    const nodeVersion = (await readRepositoryFile('.node-version')).trim();

    expect(nodeVersion).toBe('24.19.0');
    expect(process.version).toBe(`v${nodeVersion}`);
    expect(packageJson.packageManager).toBe('pnpm@11.22.0');
    expect(packageJson.engines).toEqual({
      node: `>=${nodeVersion} <25`,
      pnpm: '11.22.0',
    });
  });

  it('never repeats the Node pin as a literal outside .node-version and this test', async () => {
    // #124 counted three literal pins: `.node-version` (the source of truth CI
    // reads at three points), the assertion above (deliberate, so a bump fails
    // the suite and gets reviewed), and `.claude/hooks/session-start.sh` --
    // which was not deliberate. A fourth would go stale silently on the next
    // bump, and the hook is the one place whose disagreement nothing catches:
    // it provisions the container the tests then run in.
    const nodeVersion = (await readRepositoryFile('.node-version')).trim();
    const hook = await readRepositoryFile('.claude/hooks/session-start.sh');

    // Both assertions read the *executable* lines only. The hook's comment
    // names both `.node-version` and this test file, so a check over the whole
    // text would be satisfied by the prose explaining the rule while the code
    // broke it -- which is the shape this repository keeps finding.
    const executable = hook
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    // Anchored on the assignment, not on the substring. `.node-version`
    // appears in the hook's comment *and* in its own error message, so a
    // `toContain` over the file -- or even over its executable lines -- is
    // satisfied by text that proves nothing about where the value came from.
    // Found by running the mutation, which is the only way it shows.
    const assignment = /^\s*REQUIRED_NODE=(.*)$/mu.exec(executable);
    expect(assignment, '.claude/hooks/session-start.sh must assign REQUIRED_NODE').not.toBeNull();
    expect(
      assignment?.[1],
      '.claude/hooks/session-start.sh must read REQUIRED_NODE from .node-version rather than from anywhere else',
    ).toContain('.node-version');
    expect(
      executable.includes(nodeVersion),
      `.claude/hooks/session-start.sh must not hard-code ${nodeVersion}`,
    ).toBe(false);
  });

  it('strict-typechecks test sources and rejects an empty test suite', async () => {
    const packageJson = await readRepositoryJson<PackageContract>('package.json');
    const tsconfig = await readRepositoryJson<TypeScriptContract>('tsconfig.json');

    expect(packageJson.scripts.test).toBe('vitest run');
    expect(packageJson.scripts.test).not.toContain('passWithNoTests');
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
    expect(tsconfig.compilerOptions.exactOptionalPropertyTypes).toBe(true);
    expect(tsconfig.compilerOptions.types).toContain('node');
    expect(tsconfig.include).toContain('tests');
    expect(tsconfig.include).toContain('vitest.config.ts');
  });
});
