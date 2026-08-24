import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_TABS } from '../../src/ui/hud/hud';
import { HUD_MESSAGE_KEY, HUD_MESSAGE_KEYS } from '../../src/ui/hud/messages';
import { projectStatusMetrics } from '../../src/ui/hud/projection';

/**
 * ADR 0011, applied to the HUD.
 *
 * Three namespaces stay separate forever: a stable content id, a message key
 * and translated text. The HUD holds keys and resolves them at the last
 * moment; it contains no literal user-facing string, and no translated text
 * ever travels back toward the simulation. The ADR's own consequence --
 * "every player-visible string added from now on needs a message key and a
 * default-locale entry; a test asserts that ... an unlocalized catalog entry
 * fails CI rather than shipping" -- is what this file is.
 *
 * It also carries the architectural boundary in the same spirit as
 * `tests/unit/navigation-no-phaser.test.ts`: the HUD is a view over
 * snapshots (`AGENTS.md` boundary 1), so it may not import the simulation.
 */

const HUD_ROOT = join(__dirname, '../../src/ui/hud');
const PRIMITIVES_ROOT = join(__dirname, '../../src/ui/primitives');

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

const hudFiles = collectTypeScriptFiles(HUD_ROOT);
const primitiveFiles = collectTypeScriptFiles(PRIMITIVES_ROOT);

/**
 * Source with comments removed, so prose about a rule cannot trip the rule.
 *
 * The shared stripper from `tests/helpers/canonical-iteration.ts` rather than a
 * local copy (#193, #198). The local copy this replaced removed only
 * *whole-line* `//` comments, so a **trailing** comment survived it -- and a
 * trailing comment is exactly where a disabled import or a commented-out
 * reference ends up. That is the #188 defect: a sentence saying a thing is
 * *not* wired reads as wiring it.
 *
 * The other difference matters for the failure messages below rather than for
 * the rules: the shared stripper replaces a block comment with its own
 * newlines, while the local copy deleted it outright and shifted every line
 * number after it.
 */
function code(path: string): string {
  return stripComments(readFileSync(path, 'utf8'));
}

describe('every HUD message key resolves in the bundled default locale', () => {
  it('collects a non-trivial number of keys, so this cannot pass vacuously', () => {
    expect(HUD_MESSAGE_KEYS.length).toBeGreaterThan(20);
    expect(new Set(HUD_MESSAGE_KEYS).size).toBe(HUD_MESSAGE_KEYS.length);
  });

  it('resolves every key to real text rather than to the key itself', () => {
    const missingKeys: string[] = [];
    const localizer = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      onMissingKey: (report) => {
        // Only unresolved *keys* matter here: this pass deliberately calls
        // every message without parameters, so the parameterized ones report
        // an unfilled placeholder. Those are exercised with their arguments
        // in the next test.
        if (report.kind === 'missing-key') missingKeys.push(report.key);
      },
    });

    for (const key of HUD_MESSAGE_KEYS) {
      const text = localizer.format(key);
      // An unresolved key renders as itself (ADR 0011). That is the right
      // runtime behaviour and the wrong shipping state.
      expect(text, `${key} has no default-locale entry`).not.toBe(key);
      expect(text.trim().length).toBeGreaterThan(0);
    }
    expect(missingKeys).toEqual([]);
  });

  it('fills every placeholder the parameterized messages declare', () => {
    const missing: string[] = [];
    const localizer = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      onMissingKey: (report) => missing.push(`${report.kind}:${report.key}`),
    });

    expect(localizer.format(HUD_MESSAGE_KEY.occupancyValue, { value: '142', capacity: '180' })).toBe('142 of 180');
    expect(localizer.format(HUD_MESSAGE_KEY.clockSpeed, { speed: 2 })).toContain('2');
    expect(missing).toEqual([]);
  });

  it('uses stable ASCII identifiers, never source text as a key', () => {
    // `t("Cell")` is the failure ADR 0011 rejects outright: fixing a typo
    // would silently break every locale.
    for (const key of HUD_MESSAGE_KEYS) expect(key).toMatch(/^hud\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
  });

  it('declares no money, funds, budget or currency string', () => {
    // There is no economy system yet. A string is where a fake number gets
    // its first place to sit.
    for (const key of HUD_MESSAGE_KEYS) {
      expect(key).not.toMatch(/money|fund|budget|cash|balance|currency|cost|price/i);
    }
  });
});

describe('message keys live in one registry', () => {
  it('no HUD module hard-codes a hud.* key outside messages.ts', () => {
    // One registry is what lets the test above prove *every* key resolves.
    // A key spelled inline somewhere else would never be checked.
    for (const path of hudFiles) {
      if (path.endsWith('messages.ts')) continue;
      const literals = [...code(path).matchAll(/['"](hud\.[A-Za-z0-9._-]+)['"]/g)].map((match) => match[1]);
      expect(literals, `${path} must reference HUD_MESSAGE_KEY instead of a literal key`).toEqual([]);
    }
  });

  it('the strip and tab bar draw their labels from the registry', () => {
    const registry = new Set<string>(HUD_MESSAGE_KEYS);
    for (const metric of projectStatusMetrics({
      prisoners: 1,
      prisonerCapacity: 2,
      staff: 1,
      rooms: 1,
      activeIncidents: 1,
      contrabandFound: 1,
    })) {
      expect(registry.has(metric.labelKey), metric.labelKey).toBe(true);
      if (metric.badge !== undefined) expect(registry.has(metric.badge.textKey), metric.badge.textKey).toBe(true);
    }
    expect(HUD_TABS.map((tab) => tab.id)).toEqual(['overview', 'build', 'security', 'regime']);
    for (const tab of HUD_TABS) expect(registry.has(tab.labelKey), tab.labelKey).toBe(true);
  });
});

describe('HUD architectural boundaries', () => {
  it('covers a non-trivial number of files', () => {
    expect(hudFiles.length).toBeGreaterThan(4);
    expect(primitiveFiles.length).toBeGreaterThan(8);
  });

  it('imports nothing from the simulation', () => {
    // `AGENTS.md` boundary 1: rendering is not simulation, and the HUD must
    // never become a source of truth. It is handed plain view-model data.
    for (const path of [...hudFiles, ...primitiveFiles]) {
      expect(code(path), `${path} must not import the simulation`).not.toMatch(/from ['"][^'"]*\/simulation\//);
    }
  });

  it('imports no Phaser and no renderer internals', () => {
    for (const path of [...hudFiles, ...primitiveFiles]) {
      expect(code(path), `${path} must not import Phaser`).not.toMatch(/from ['"]phaser['"]/i);
      expect(code(path), `${path} must not import the renderer`).not.toMatch(/from ['"][^'"]*\/rendering\//);
    }
  });

  it('keeps the primitives free of localization, so they stay reusable', () => {
    // Primitives take already-resolved text. Resolving a key is the
    // composing layer's job, which is what keeps translated text out of
    // anything that could become a source of truth.
    for (const path of primitiveFiles) {
      expect(code(path), `${path} must not resolve message keys itself`).not.toMatch(/localization/);
    }
  });

  it('attaches click handling only in modules that build a real <button>', () => {
    // Touch-first and keyboard-first: a `<div onclick>` is not focusable,
    // is not activated by Enter or Space, and is invisible to assistive
    // technology. Every clickable primitive must therefore be a `button`.
    let clickable = 0;
    for (const path of primitiveFiles) {
      const source = code(path);
      if (!source.includes("addEventListener('click'")) continue;
      clickable += 1;
      expect(source, `${path} handles clicks but never creates a <button>`).toMatch(/element\('button'/);
    }
    expect(clickable).toBeGreaterThan(2);
  });
});
