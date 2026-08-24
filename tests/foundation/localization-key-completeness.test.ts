import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';

/**
 * Every localization key declared as a literal anywhere in `src/` must
 * resolve in the bundled default locale.
 *
 * `tests/unit/ui-hud-messages.test.ts` already does this for `HUD_MESSAGE_KEYS`
 * -- a hand-maintained registry, which is what makes that gate exhaustive
 * over the HUD and blind to everything else. Issue #139 asked for the wider
 * version, and named the reason: a key field is typed `identifierSchema`,
 * i.e. "a well-formed identifier", never "a key that exists". So
 * `nameKey: 'product.save-slots.plus-5.nmae'` type-checks, passes schema
 * validation, and renders as the literal string
 * `product.save-slots.plus-5.nmae` to whoever is reading the screen --
 * because `resolveLocalizationKey` falls back to the key itself, which is
 * the right runtime behaviour (ADR 0011) and the wrong shipping state.
 *
 * Scanned rather than imported, deliberately: importing every catalog module
 * would mean maintaining a list of catalog modules, and the next content
 * module added would be outside the gate exactly as `products.ts` was.
 */

const SRC_ROOT = join(__dirname, '../../src');

/**
 * Field names whose string literal is a localization key. Every one is
 * checked against the catalog.
 */
const LOCALIZATION_KEY_FIELDS = ['nameKey', 'descriptionKey', 'labelKey', 'textKey', 'titleKey', 'messageKey'] as const;

/**
 * Field names that end in `Key` and are *not* localization keys. Listed with
 * the reason, so the assertion below can insist that every `*Key` field in
 * `src/` is in one list or the other -- a new key-shaped field cannot quietly
 * land in neither and be neither checked nor exempted.
 */
const NON_LOCALIZATION_KEY_FIELDS: Readonly<Record<string, string>> = {
  // (empty today; add with a reason, e.g. storageKey -> an IndexedDB record key)
};

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

/** Source with comments removed, so prose naming a key cannot be mistaken for a declaration. */
function code(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

interface Declaration {
  readonly field: string;
  readonly key: string;
  readonly where: string;
}

function scanDeclarations(): readonly Declaration[] {
  const declarations: Declaration[] = [];
  for (const path of collectTypeScriptFiles(SRC_ROOT)) {
    // The catalogs themselves author keys as record *keys*, not as `xKey:`
    // fields, so they are not skipped -- they simply produce no matches.
    for (const match of code(path).matchAll(/\b([A-Za-z][A-Za-z0-9]*Key)\s*:\s*'([^']+)'/g)) {
      declarations.push({ field: match[1]!, key: match[2]!, where: relative(SRC_ROOT, path) });
    }
  }
  return declarations;
}

const declarations = scanDeclarations();

describe('every localization key declared in src/ resolves in the bundled default locale', () => {
  it('finds a non-trivial number of declarations, so this cannot pass vacuously', () => {
    // The scan is a regex over source text. If a refactor changed how content
    // declares keys, this gate would silently start covering nothing -- which
    // is the failure mode it exists to prevent elsewhere.
    expect(declarations.length).toBeGreaterThan(50);
    expect(new Set(declarations.map((declaration) => declaration.field)).size).toBeGreaterThan(1);
  });

  it('classifies every `*Key` field as a localization key or an explicitly exempt one', () => {
    const unclassified = [
      ...new Set(
        declarations
          .filter(
            (declaration) =>
              !(LOCALIZATION_KEY_FIELDS as readonly string[]).includes(declaration.field) &&
              NON_LOCALIZATION_KEY_FIELDS[declaration.field] === undefined,
          )
          .map((declaration) => `${declaration.field} (${declaration.where})`),
      ),
    ];
    expect(
      unclassified,
      'add each to LOCALIZATION_KEY_FIELDS, or to NON_LOCALIZATION_KEY_FIELDS with the reason it is not translatable',
    ).toEqual([]);
  });

  it('resolves every declared key to real text rather than to the key itself', () => {
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const unresolved: string[] = [];

    for (const declaration of declarations) {
      if (!(LOCALIZATION_KEY_FIELDS as readonly string[]).includes(declaration.field)) continue;
      const text = localizer.format(declaration.key);
      // ADR 0011: an unresolved key renders as itself.
      if (text === declaration.key || text.trim().length === 0) {
        unresolved.push(`${declaration.key} (${declaration.field} in ${declaration.where})`);
      }
    }

    expect(unresolved, 'these keys would render as raw identifiers to a player').toEqual([]);
  });
});
