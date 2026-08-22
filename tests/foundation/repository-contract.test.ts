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
