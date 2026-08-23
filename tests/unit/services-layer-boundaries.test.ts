import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The trusted-services layer is separate on purpose (issue #36, ADR 0008):
 * the same modules must run in a browser tab, a worker and a trusted
 * server function, and the simulation must never depend on any of them.
 * These are the boundary rules stated in `src/services/index.ts`, made
 * executable -- the same treatment `navigation-no-phaser.test.ts` gives
 * the navigation boundary.
 */
const SOURCE_ROOT = join(__dirname, '../../src');

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

function read(path: string): { readonly relative: string; readonly source: string } {
  return { relative: path.slice(SOURCE_ROOT.length + 1), source: readFileSync(path, 'utf8') };
}

const serviceFiles = collectTypeScriptFiles(join(SOURCE_ROOT, 'services')).map(read);
const simulationFiles = collectTypeScriptFiles(join(SOURCE_ROOT, 'simulation')).map(read);
const persistenceFiles = collectTypeScriptFiles(join(SOURCE_ROOT, 'persistence')).map(read);

describe('trusted services layer boundaries', () => {
  it('covers a non-trivial number of files', () => {
    expect(serviceFiles.length).toBeGreaterThan(10);
    expect(simulationFiles.length).toBeGreaterThan(10);
  });

  it('imports no Phaser and touches no DOM or browser globals', () => {
    for (const { relative, source } of serviceFiles) {
      expect(source, `${relative} must not import Phaser`).not.toMatch(/from ['"]phaser['"]/i);
      // Requires a member access, so the word "window." ending an English
      // sentence in a comment or message is not a false positive.
      expect(source, `${relative} must not touch the DOM`).not.toMatch(/\b(?:document|window)\.[A-Za-z_$]/);
      // A mention in prose is fine; an actual access is not -- storage
      // reaches this layer only through the injected `KeyValueStore`.
      expect(source, `${relative} must not read localStorage directly`).not.toMatch(/\blocalStorage\s*[.[]/);
    }
  });

  it('is never imported by the simulation or persistence layers', () => {
    for (const { relative, source } of [...simulationFiles, ...persistenceFiles]) {
      expect(source, `${relative} must not depend on the services layer`).not.toMatch(
        /from ['"][^'"]*\/services\//,
      );
    }
  });

  it('does not reach into the renderer', () => {
    for (const { relative, source } of serviceFiles) {
      expect(source, `${relative} must not import the renderer`).not.toMatch(/from ['"][^'"]*\/rendering\//);
    }
  });

  it('keeps the simulation free of localization runtime dependencies', () => {
    // Simulation may branch on stable content ids; it may never read a
    // translated string (ADR 0011).
    for (const { relative, source } of simulationFiles) {
      expect(source, `${relative} must not import the localization runtime`).not.toMatch(
        /from ['"][^'"]*localization['"]/,
      );
    }
  });

  it('reaches Supabase only through a declared adapter, and only as a type', () => {
    for (const { relative, source } of serviceFiles) {
      if (!source.includes('@supabase/supabase-js')) continue;
      expect(relative, 'only the entitlements read adapter may reference Supabase').toBe(
        join('services', 'entitlements', 'client.ts'),
      );
      expect(source, `${relative} must import Supabase types only`).toMatch(
        /import type \{[^}]*\} from '@supabase\/supabase-js'/,
      );
    }
  });

  it('never mentions a service-role credential', () => {
    for (const { relative, source } of serviceFiles) {
      expect(source.toLowerCase(), `${relative} must not reference a service-role key`).not.toMatch(
        /service_role_key|service-role-key|servicerolekey/,
      );
    }
  });
});
