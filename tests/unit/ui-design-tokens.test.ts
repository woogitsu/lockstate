import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The design-token contract, made executable.
 *
 * `src/ui/tokens.css` has two layers: raw ramps (the only place a literal
 * colour appears) and semantic aliases (the only names a component may use).
 * That split is what makes a re-skin a one-file change -- and it is worth
 * exactly nothing if a component quietly hard-codes `#86b2cf` or reaches
 * past the alias to `var(--sky-300)`. So both are checked here rather than
 * left to review, in the same spirit as
 * `tests/unit/navigation-no-phaser.test.ts`.
 *
 * The declared palette is asserted by value as well: the aliases are a
 * published contract, not an implementation detail, and a stray edit that
 * shifts `--surface-base` off the application background should fail a test
 * rather than a screenshot.
 */

const UI_ROOT = join(__dirname, '../../src/ui');
const TOKENS_PATH = join(UI_ROOT, 'tokens.css');
const APP_STYLESHEET = join(__dirname, '../../src/styles.css');

function collectStylesheets(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectStylesheets(path));
      continue;
    }
    if (entry.endsWith('.css')) files.push(path);
  }
  return files;
}

/**
 * Comments are prose about the rules, not CSS. Stripping them keeps a
 * sentence like "no gradients, no glows" from failing the very check it
 * describes, and stops an issue reference like `#65` from reading as a
 * colour.
 */
function stylesheetRules(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

const allStylesheets = [...collectStylesheets(UI_ROOT), APP_STYLESHEET];
const componentStylesheets = allStylesheets.filter((path) => path !== TOKENS_PATH);
const tokensSource = stylesheetRules(TOKENS_PATH);

/** Every `--name: value` declared in tokens.css, in source order. */
function declaredTokens(): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>();
  for (const match of tokensSource.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1]!, match[2]!.trim());
  }
  return tokens;
}

/** Follows `var(--x)` indirection down to the literal a browser would paint. */
function resolveToken(name: string, tokens: ReadonlyMap<string, string>, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`Token cycle through ${name}`);
  seen.add(name);
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Token ${name} is not declared in tokens.css`);
  const indirection = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  return indirection === null ? value : resolveToken(indirection[1]!, tokens, seen);
}

const tokens = declaredTokens();

describe('token file structure', () => {
  it('collects every UI stylesheet, so the checks below cannot pass vacuously', () => {
    expect(componentStylesheets.length).toBeGreaterThanOrEqual(3);
    expect(allStylesheets).toContain(TOKENS_PATH);
  });

  it('declares the semantic alias layer components are allowed to use', () => {
    for (const alias of [
      '--surface-sunken',
      '--surface-base',
      '--surface-raised',
      '--surface-overlay',
      '--surface-active',
      '--text-heading',
      '--text-body',
      '--text-subtle',
      '--text-muted',
      '--border-hairline',
      '--border',
      '--border-strong',
      '--accent',
      '--accent-deep',
      '--accent-soft',
      '--status-success',
      '--status-warning',
      '--status-danger',
      '--status-info',
    ]) {
      expect(tokens.has(alias), `${alias} must be declared`).toBe(true);
    }
  });

  it('resolves the aliases to the declared palette', () => {
    const expected: Readonly<Record<string, string>> = {
      '--surface-sunken': '#0b0e12',
      '--surface-base': '#101317',
      '--surface-raised': '#171c23',
      '--surface-overlay': '#1f2630',
      '--surface-active': '#2a323e',
      '--text-heading': '#eef2f6',
      '--text-body': '#dbe2e9',
      '--text-subtle': '#a8b1bc',
      '--text-muted': '#7d8894',
      '--border-hairline': 'rgba(238, 242, 246, 0.07)',
      '--border': 'rgba(238, 242, 246, 0.13)',
      '--border-strong': 'rgba(238, 242, 246, 0.22)',
      '--accent': '#86b2cf',
      '--accent-deep': '#4a7fa5',
      '--accent-soft': 'rgba(134, 178, 207, 0.14)',
      '--status-success': '#86b596',
      '--status-warning': '#e8b463',
      '--status-danger': '#d4785c',
      '--status-info': '#86b2cf',
    };
    for (const [alias, value] of Object.entries(expected)) {
      expect(resolveToken(alias, tokens), alias).toBe(value);
    }
  });

  it('pairs every badge tone with both a background and a foreground', () => {
    // Pairing them in the token layer is what stops a call site from
    // assembling a mismatched combination.
    for (const tone of ['neutral', 'success', 'warning', 'danger', 'info']) {
      expect(tokens.has(`--badge-${tone}-bg`), `--badge-${tone}-bg`).toBe(true);
      expect(tokens.has(`--badge-${tone}-fg`), `--badge-${tone}-fg`).toBe(true);
    }
  });

  it('keeps the application background on the token layer', () => {
    // `#101317` was already the app background before tokens existed; the
    // alias must not have quietly changed it.
    expect(resolveToken('--surface-base', tokens)).toBe('#101317');
  });
});

describe('components reference only the semantic layer', () => {
  const ALLOWED_COLOR_KEYWORDS = new Set(['transparent', 'currentColor', 'inherit', 'initial', 'unset', 'none']);

  it.each(componentStylesheets)('%s contains no literal colour', (path) => {
    const source = stylesheetRules(path);
    expect(source, 'no hex colours outside tokens.css').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source, 'no rgb()/rgba() outside tokens.css').not.toMatch(/\brgba?\(/);
    expect(source, 'no hsl()/hsla() outside tokens.css').not.toMatch(/\bhsla?\(/);
    // A bare colour keyword is only allowed when it means "no colour".
    for (const match of source.matchAll(/(?:^|[;{])\s*(?:background|color|border-color|fill|stroke)\s*:\s*([a-zA-Z]+)\s*[;}]/gm)) {
      expect(ALLOWED_COLOR_KEYWORDS.has(match[1]!), `${match[1]} is a literal colour keyword`).toBe(true);
    }
  });

  it.each(componentStylesheets)('%s does not reach past an alias to a raw ramp', (path) => {
    const source = stylesheetRules(path);
    // Reaching a raw ramp directly is what would survive a re-skin and break
    // it: the alias would be repointed and this one rule would not follow.
    expect(source).not.toMatch(/var\(--(?:ink|paper|sky|moss|amber|clay)-/);
  });

  it.each(componentStylesheets)('%s uses only tokens that exist', (path) => {
    const source = stylesheetRules(path);
    for (const match of source.matchAll(/var\((--[a-z0-9-]+)/g)) {
      expect(tokens.has(match[1]!), `${match[1]} is used in ${path} but not declared in tokens.css`).toBe(true);
    }
  });
});

describe('the minimal design language is not decorated around', () => {
  it.each(allStylesheets)('%s has no gradient, glow, shadow or blur', (path) => {
    const source = stylesheetRules(path);
    // Separation comes from a 1px hairline and a background step, and from
    // nothing else. These are the effects that quietly reintroduce depth.
    expect(source, 'no gradients').not.toMatch(/gradient\(/);
    expect(source, 'no box shadows').not.toMatch(/box-shadow\s*:/);
    expect(source, 'no text shadows').not.toMatch(/text-shadow\s*:/);
    expect(source, 'no backdrop blur / glassmorphism').not.toMatch(/backdrop-filter\s*:/);
    expect(source, 'no filters').not.toMatch(/(?:^|[;{\s])filter\s*:/m);
  });

  it('gives every interactive primitive a focus-visible ring in the accent colour', () => {
    const primitives = stylesheetRules(join(UI_ROOT, 'primitives/primitives.css'));
    expect(primitives).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s);
  });
});
