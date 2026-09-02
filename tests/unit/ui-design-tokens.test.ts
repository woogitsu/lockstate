import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BADGE_TONES } from '../../src/ui/primitives/status-badge';

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
      '--status-caution',
      '--status-warning',
      '--status-danger',
      '--status-critical',
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
      // A rung below `--status-warning` rather than past it, for issue #788's
      // ruling of 2026-09-02 -- see `--straw-300` in `tokens.css`. Darkened by
      // the owner's second ruling on the same issue, same day: the contrast
      // gate below computes why this exact value, from this file, rather than
      // asserting it only here.
      '--status-caution': '#645435',
      '--status-warning': '#e8b463',
      '--status-danger': '#d4785c',
      '--status-critical': '#b8455a',
      '--status-info': '#86b2cf',
    };
    for (const [alias, value] of Object.entries(expected)) {
      expect(resolveToken(alias, tokens), alias).toBe(value);
    }
  });

  it('pairs every badge tone with both a background and a foreground', () => {
    // Pairing them in the token layer is what stops a call site from
    // assembling a mismatched combination.
    //
    // **The list used to be five literals here -- `neutral`, `success`,
    // `warning`, `danger`, `info` -- and it had already rotted**: `'critical'`
    // was added to `BadgeTone` by issue #768's ruling of 2026-09-01 and never
    // added here, so its pair went unchecked for a day. Reading `BADGE_TONES`
    // instead means the next tone cannot be added to the type without this
    // check finding it, which is the class rather than the instance. The
    // vacuity guard below is what stops an emptied `BADGE_TONES` from passing.
    expect(BADGE_TONES.length, 'BADGE_TONES is empty, so the loop below would prove nothing').toBeGreaterThanOrEqual(6);
    for (const tone of BADGE_TONES) {
      expect(tokens.has(`--badge-${tone}-bg`), `--badge-${tone}-bg`).toBe(true);
      expect(tokens.has(`--badge-${tone}-fg`), `--badge-${tone}-fg`).toBe(true);
      // And each resolves to something a browser would paint rather than to a
      // dangling `var()` -- `resolveToken` throws on an undeclared name.
      expect(resolveToken(`--badge-${tone}-bg`, tokens).length, `--badge-${tone}-bg`).toBeGreaterThan(0);
      expect(resolveToken(`--badge-${tone}-fg`, tokens).length, `--badge-${tone}-fg`).toBeGreaterThan(0);
    }
  });

  it('gives every badge tone a foreground no other tone shares', () => {
    // A tone whose colour is another tone's colour is a tone in the type and
    // not on the screen, which is the whole of what issue #788's ruling of
    // 2026-09-02 was about: `Medium` and `Minimal` were two states with one
    // colour. This is that check for the vocabulary rather than for the one
    // caller -- `describePrisonerRow`'s own tests hold the caller.
    const byColour = new Map<string, string[]>();
    for (const tone of BADGE_TONES) {
      const colour = resolveToken(`--badge-${tone}-fg`, tokens);
      byColour.set(colour, [...(byColour.get(colour) ?? []), tone]);
    }
    // `info` and `accent` are the same hue on purpose (`--status-info` is
    // `var(--sky-300)`), and that is a *foreground* they share with a
    // non-badge role rather than with another badge tone -- so this stays a
    // check over `BADGE_TONES` alone.
    const shared = [...byColour.entries()].filter(([, tones]) => tones.length > 1);
    expect(shared, `two badge tones resolve to one colour: ${JSON.stringify(shared)}`).toEqual([]);
  });

  it('keeps the application background on the token layer', () => {
    // `#101317` was already the app background before tokens existed; the
    // alias must not have quietly changed it.
    expect(resolveToken('--surface-base', tokens)).toBe('#101317');
  });
});

/**
 * WCAG 2.x contrast, computed from a resolved `#rrggbb` token value rather
 * than pasted -- the shape the owner's ruling of 2026-09-02 on issue #788
 * asked for. A pasted expected ratio would hold for any implementation,
 * including a broken one; this recomputes both colours' relative luminance
 * from `tokens.css` on every run, so a future edit to either raw ramp entry
 * is what the assertions below actually re-check.
 */
function hexChannels(hex: string): readonly [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (match === null) {
    throw new Error(`expected a resolved #rrggbb colour, got ${JSON.stringify(hex)} -- extend this helper before trusting its output`);
  }
  const value = match[1]!;
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

/** WCAG 2.x relative luminance of an sRGB channel, 0-255 in, 0-1 out. */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexChannels(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colours, always >= 1. */
function contrastRatio(hexA: string, hexB: string): number {
  const [lumA, lumB] = [relativeLuminance(hexA), relativeLuminance(hexB)];
  const [lighter, darker] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * A token layer that composites badge chip against a surface, resolved to
 * the `#rrggbb` a browser would actually paint -- what `getComputedStyle`
 * reads is one blended colour, whichever of `rgba(r, g, b, a)` (a translucent
 * tint, still this file's formula for six of the seven badge tones) or
 * `#rrggbb` (opaque, `'caution'`'s own background since the owner's third
 * ruling of 2026-09-02) the resolved token turns out to be. An opaque colour
 * composites to itself; only a translucent one needs the surface at all, so
 * this is also what makes the assertion below correct *and* a real gate
 * against a future edit that makes the chip translucent again -- it would
 * recompute the blend rather than throw on an unexpected format.
 */
function paintedColour(resolved: string, surfaceHex: string): string {
  const opaque = /^#([0-9a-fA-F]{6})$/.exec(resolved);
  if (opaque !== null) return resolved;
  const translucent = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(resolved);
  if (translucent === null) {
    throw new Error(`expected a resolved #rrggbb or rgba(...) colour, got ${JSON.stringify(resolved)} -- extend this helper before trusting its output`);
  }
  const [, rStr, gStr, bStr, aStr] = translucent;
  const [r, g, b, a] = [Number(rStr), Number(gStr), Number(bStr), Number(aStr)];
  const [sr, sg, sb] = hexChannels(surfaceHex);
  const blend = (c: number, s: number): number => Math.round(c * a + s * (1 - a));
  return `#${[blend(r, sr), blend(g, sg), blend(b, sb)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

describe('badge tone contrast (issue #788, the owner\'s ruling of 2026-09-02)', () => {
  /**
   * **The measured defect.** A playtest read `getComputedStyle` on a
   * `'caution'` badge (risk tier `Medium`) and a `'neutral'` one (tier `Low`)
   * side by side and found their foregrounds -- `--badge-caution-fg` and
   * `--badge-neutral-fg` -- painting at **1.07:1**, on top of an archived
   * screenshot showing both as one muted tan-grey chip. `'caution'` exists
   * *only* to make `Medium` distinguishable from `Low` at a glance
   * (`status-badge.ts`'s own doc comment on `BadgeTone`), so a 1.07:1 pair is
   * that tone failing the one thing it was added for. WCAG 2.x's floor for
   * non-text (graphical object) contrast is 3:1 (SC 1.4.11); the assertion
   * below is that floor, not a number this file invented.
   *
   * Both colours are resolved through `resolveToken`, which follows every
   * `var()` indirection down to the raw ramp hex `tokens.css` would actually
   * paint -- `--badge-caution-fg` -> `--status-caution` -> `--straw-300`, and
   * `--badge-neutral-fg` -> `--text-subtle` -> `--paper-400` -- so an edit to
   * either alias or either raw ramp entry re-runs this exact check rather
   * than needing a second, hand-updated copy of it.
   */
  it('paints the caution badge at least 3:1 from the neutral badge (WCAG 1.4.11 floor)', () => {
    const cautionFg = resolveToken('--badge-caution-fg', tokens);
    const neutralFg = resolveToken('--badge-neutral-fg', tokens);
    const ratio = contrastRatio(cautionFg, neutralFg);
    expect(ratio, `caution (${cautionFg}) vs neutral (${neutralFg}) = ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(3);
  });

  /**
   * The ladder this sits on, named in `status-badge.ts`'s doc comment on
   * `'caution'`: "ordered here between `'success'` and `'warning'` because
   * that is where it sits on the ladder." Strengthening caution against
   * neutral must not do it by sliding caution into either neighbour's own
   * colour, and neither neighbour was actually safe before this ruling:
   * measured against the *old* `--straw-300` (`#bba881`), caution sat at
   * 1.23:1 from warning and 1.00:1 from success -- both closer collisions
   * than the 1.07:1 the ruling was written to fix, just never named. Fixing
   * the named pair moved both as a side effect, which is what these two
   * checks confirm rather than assume: they are computed the same way as the
   * primary assertion above, not merely `not.toBe`, so a future edit that
   * keeps the tones distinct but thins either margin back toward 1:1 fails
   * here too.
   */
  it('keeps caution at least 3:1 from success, its neighbour down the ladder', () => {
    const cautionFg = resolveToken('--badge-caution-fg', tokens);
    const successFg = resolveToken('--badge-success-fg', tokens);
    const ratio = contrastRatio(cautionFg, successFg);
    expect(ratio, `caution (${cautionFg}) vs success (${successFg}) = ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(3);
  });

  it('keeps caution at least 3:1 from warning, its neighbour up the ladder', () => {
    const cautionFg = resolveToken('--badge-caution-fg', tokens);
    const warningFg = resolveToken('--badge-warning-fg', tokens);
    const ratio = contrastRatio(cautionFg, warningFg);
    expect(ratio, `caution (${cautionFg}) vs warning (${warningFg}) = ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(3);
  });

  /**
   * **The badge's own text, half of what the owner's second ruling of
   * 2026-09-02 reported as an unresolved conflict and the third ruling,
   * same day, resolved.** Darkening `--badge-caution-fg` to clear 3:1 against
   * neutral (the test above) forced its relative luminance down to ~0.093 --
   * too dark for WCAG's 4.5:1 *text* contrast (SC 1.4.3) against the
   * translucent 14 %-tint chip every other badge tone paints, on
   * `--surface-raised` (the only surface `.hud-regime` -- the panel that
   * paints every `'caution'` badge -- ever gives it): that pairing measured
   * 5.73:1 before the darkening and 2.13:1 after, both recorded in
   * `tokens.css`'s comment on `--straw-300`. The fix was an opaque
   * `--badge-caution-bg` (`--straw-100` in `tokens.css`, same hue and
   * saturation as the darkened foreground, only lighter) rather than a
   * translucent one, so `paintedColour` above resolves it to itself with no
   * compositing needed -- and still takes `--surface-raised` as its fallback
   * surface, because the property this test is actually pinning is "the
   * chip is opaque enough not to need one", and a translucent regression
   * should fail on the real number the panel would paint, not on a format
   * `paintedColour` cannot parse.
   */
  it("keeps caution's own text at least 4.5:1 on its own badge background (WCAG 1.4.3)", () => {
    const cautionFg = resolveToken('--badge-caution-fg', tokens);
    const cautionBgToken = resolveToken('--badge-caution-bg', tokens);
    const surfaceRaised = resolveToken('--surface-raised', tokens);
    const paintedBg = paintedColour(cautionBgToken, surfaceRaised);
    const ratio = contrastRatio(cautionFg, paintedBg);
    expect(
      ratio,
      `caution text (${cautionFg}) on caution's own background (${cautionBgToken} -> painted ${paintedBg} on --surface-raised ${surfaceRaised}) = ${ratio.toFixed(3)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
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
    // Extended twice since it was written, both times by a new raw hue: the
    // list is the ramps that exist, so it grows when one does.
    expect(source).not.toMatch(/var\(--(?:ink|paper|sky|moss|straw|amber|clay|crimson)-/);
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
