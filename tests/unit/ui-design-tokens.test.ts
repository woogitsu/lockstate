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

/**
 * The two themes, by the attribute that selects them (#1157).
 *
 * `'light'` is also what a page with no attribute at all paints, because the
 * day palette is declared on the bare `:root` -- the owner's ruling of
 * 2026-09-13 (ADR 0112 decision 2). Reading it here under its explicit name
 * keeps the two halves of that arrangement checked by the same code.
 */
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

interface RuleBlock {
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

/**
 * Every `--name: value` in `tokens.css`, **per rule block**.
 *
 * It used to be one flat map over the whole file, and that is exactly the
 * shape that stops working the moment a second theme exists: `Map.set` keeps
 * the last declaration, so every assertion below silently measured whichever
 * block happened to be last in the file. Measured on the first run of the
 * two-theme token file against the un-migrated test: the four contrast
 * assertions **passed** while reading only the night palette, and only the
 * two that pin literals failed. A check that cannot say which theme it read
 * is a check that proves nothing about the other one.
 */
function parseBlocks(source: string): readonly RuleBlock[] {
  const blocks: RuleBlock[] = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>();
    for (const declaration of match[2]!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      declarations.set(declaration[1]!, declaration[2]!.trim());
    }
    blocks.push({ selector: match[1]!.trim().replace(/\s+/g, ' '), declarations });
  }
  return blocks;
}

const blocks = parseBlocks(tokensSource);

/** Blocks that apply to a theme: the theme-free `:root` ones, plus that theme's own. */
function blocksFor(theme: Theme): readonly RuleBlock[] {
  return blocks.filter((block) => {
    if (!block.selector.includes(':root')) return false;
    const other = theme === 'light' ? 'dark' : 'light';
    if (block.selector.includes(`data-theme='${other}'`)) return false;
    return true;
  });
}

/** The block a theme declares *alone* -- its alias layer, and nothing shared. */
function themeOnlyBlock(theme: Theme): RuleBlock {
  const found = blocks.find((block) => block.selector.includes(`data-theme='${theme}'`));
  if (found === undefined) throw new Error(`tokens.css declares no block for the ${theme} theme`);
  return found;
}

/** Every token a page in `theme` would have, later blocks winning as the cascade does. */
function tokensFor(theme: Theme): ReadonlyMap<string, string> {
  const merged = new Map<string, string>();
  for (const block of blocksFor(theme)) {
    for (const [name, value] of block.declarations) merged.set(name, value);
  }
  return merged;
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

const themeTokens: Readonly<Record<Theme, ReadonlyMap<string, string>>> = {
  light: tokensFor('light'),
  dark: tokensFor('dark'),
};

/** Every token declared anywhere, for the checks that are about declaration rather than value. */
const tokens: ReadonlyMap<string, string> = new Map([...themeTokens.light, ...themeTokens.dark]);

describe('token file structure', () => {
  it('collects every UI stylesheet, so the checks below cannot pass vacuously', () => {
    expect(componentStylesheets.length).toBeGreaterThanOrEqual(3);
    expect(allStylesheets).toContain(TOKENS_PATH);
  });

  it('parses both theme blocks, so the per-theme checks below cannot pass vacuously', () => {
    for (const theme of THEMES) {
      // `light` is the bare `:root` plus an explicit `[data-theme='light']`,
      // so both themes have a block of their own to find.
      expect(themeOnlyBlock(theme).declarations.size, `${theme} alias block`).toBeGreaterThanOrEqual(20);
      expect(themeTokens[theme].size, `${theme} token set`).toBeGreaterThanOrEqual(60);
    }
  });

  /**
   * **The failure mode this arrangement has and the one-theme file did not.**
   * The aliases are declared twice, once per theme, and a name present in one
   * block and missing from the other does not fail to render -- it renders
   * the *other theme's* colour, because the day block sits on a bare `:root`
   * and the night block only overrides what it names. That is a silent light
   * surface in a dark interface, and no contrast assertion below would catch
   * it: each theme's set would still be internally consistent.
   *
   * So the parity is the gate. Both blocks must declare the same alias names,
   * and the diff is reported by name rather than by count.
   */
  it('declares the same alias names in both themes', () => {
    const light = [...themeOnlyBlock('light').declarations.keys()].sort();
    const dark = [...themeOnlyBlock('dark').declarations.keys()].sort();
    expect(dark.filter((name) => !light.includes(name)), 'declared only in the dark theme').toEqual([]);
    expect(light.filter((name) => !dark.includes(name)), 'declared only in the light theme').toEqual([]);
  });

  it.each(THEMES)('%s declares the semantic alias layer components are allowed to use', (theme) => {
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
      expect(themeTokens[theme].has(alias), `${alias} must be declared in the ${theme} theme`).toBe(true);
    }
  });

  /**
   * The declared palette, per theme, asserted by value.
   *
   * The aliases are a published contract, not an implementation detail, and
   * a stray edit that shifts `--surface-base` off the application background
   * should fail a test rather than a screenshot. Both tables are the owner's
   * 2026-09-13 delivery as tabulated in `docs/VISUAL_IDENTITY.md`
   * §"The palettes", except where `tokens.css` records a derivation and its
   * reason beside the rung.
   */
  const EXPECTED_PALETTE: Readonly<Record<Theme, Readonly<Record<string, string>>>> = {
    light: {
      '--surface-sunken': '#e6edf1',
      '--surface-base': '#f2f6f8',
      '--surface-raised': '#ffffff',
      '--surface-overlay': '#eef2f6',
      '--surface-active': '#e0edf2',
      '--text-heading': '#122c3a',
      '--text-body': '#183442',
      '--text-subtle': '#244454',
      '--text-muted': '#5c717d',
      '--border-hairline': 'rgba(18, 44, 58, 0.07)',
      '--border': '#dce5e9',
      '--border-strong': 'rgba(18, 44, 58, 0.22)',
      // The day action teal, darkened from `#007e80` by the delivery's own
      // contrast correction. It must never go back; the delivery says so in
      // its own words and `docs/VISUAL_IDENTITY.md` quotes them.
      '--accent': '#007477',
      '--accent-deep': '#005c5f',
      '--accent-soft': '#dff5f0',
      '--status-success': '#14603c',
      // Light where the night rung is dark, for the reason the contrast gate
      // below computes rather than asserts: clearing 3:1 from both the day
      // subtle text and the day warning leaves no middle window at all.
      '--status-caution': '#e3c98d',
      '--status-warning': '#895300',
      '--status-danger': '#b63744',
      '--status-critical': '#8e1f2e',
      '--status-info': '#007477',
    },
    dark: {
      '--surface-sunken': '#0b1d27',
      '--surface-base': '#10232e',
      '--surface-raised': '#132a36',
      '--surface-overlay': '#193440',
      '--surface-active': '#224250',
      '--text-heading': '#eef2f6',
      '--text-body': '#e0edf2',
      '--text-subtle': '#adc2cd',
      '--text-muted': '#86a0ad',
      '--border-hairline': 'rgba(238, 242, 246, 0.07)',
      '--border': 'rgba(238, 242, 246, 0.13)',
      '--border-strong': 'rgba(238, 242, 246, 0.22)',
      '--accent': '#8cdec9',
      '--accent-deep': '#4fae96',
      '--accent-soft': '#22473f',
      '--status-success': '#86b596',
      // A rung below `--status-warning` rather than past it, for issue #788's
      // ruling of 2026-09-02 -- see `--straw-300` in `tokens.css`. Darkened by
      // the owner's second ruling on the same issue, same day: the contrast
      // gate below computes why this exact value, from this file, rather than
      // asserting it only here.
      '--status-caution': '#645435',
      '--status-warning': '#f0c77f',
      '--status-danger': '#ffb3b9',
      '--status-critical': '#ff7d8f',
      '--status-info': '#8cdec9',
    },
  };

  it.each(THEMES)('%s resolves the aliases to the declared palette', (theme) => {
    for (const [alias, value] of Object.entries(EXPECTED_PALETTE[theme])) {
      expect(resolveToken(alias, themeTokens[theme]), `${theme} ${alias}`).toBe(value);
    }
  });

  it.each(THEMES)('%s pairs every badge tone with both a background and a foreground', (theme) => {
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
      expect(themeTokens[theme].has(`--badge-${tone}-bg`), `${theme} --badge-${tone}-bg`).toBe(true);
      expect(themeTokens[theme].has(`--badge-${tone}-fg`), `${theme} --badge-${tone}-fg`).toBe(true);
      // And each resolves to something a browser would paint rather than to a
      // dangling `var()` -- `resolveToken` throws on an undeclared name.
      expect(resolveToken(`--badge-${tone}-bg`, themeTokens[theme]).length, `--badge-${tone}-bg`).toBeGreaterThan(0);
      expect(resolveToken(`--badge-${tone}-fg`, themeTokens[theme]).length, `--badge-${tone}-fg`).toBeGreaterThan(0);
    }
  });

  it.each(THEMES)('%s gives every badge tone a foreground no other tone shares', (theme) => {
    // A tone whose colour is another tone's colour is a tone in the type and
    // not on the screen, which is the whole of what issue #788's ruling of
    // 2026-09-02 was about: `Medium` and `Minimal` were two states with one
    // colour. This is that check for the vocabulary rather than for the one
    // caller -- `describePrisonerRow`'s own tests hold the caller.
    const byColour = new Map<string, string[]>();
    for (const tone of BADGE_TONES) {
      const colour = resolveToken(`--badge-${tone}-fg`, themeTokens[theme]);
      byColour.set(colour, [...(byColour.get(colour) ?? []), tone]);
    }
    // `info` and `accent` are the same hue on purpose (`--status-info` is
    // `var(--sky-300)`), and that is a *foreground* they share with a
    // non-badge role rather than with another badge tone -- so this stays a
    // check over `BADGE_TONES` alone.
    const shared = [...byColour.entries()].filter(([, tones]) => tones.length > 1);
    expect(shared, `two badge tones resolve to one colour: ${JSON.stringify(shared)}`).toEqual([]);
  });

  /**
   * **This assertion used to pin one literal, `#101317`, with the reason
   * "it was already the app background before tokens existed".** That reason
   * expired with the second theme: the application background is now a
   * property of the *theme*, and `#101317` is in neither palette -- the day
   * background is the delivery's `#f2f6f8` and the night one its `#10232e`.
   *
   * What survives the change is the property the old assertion was really
   * for: `--surface-base` is the page's own ground in both themes, and
   * `src/styles.css` paints `html, body` with it, so it must be the theme's
   * background value and not some panel tint that drifted into the alias.
   */
  it.each(THEMES)('%s keeps the application background on the token layer', (theme) => {
    const expected = theme === 'light' ? '#f2f6f8' : '#10232e';
    expect(resolveToken('--surface-base', themeTokens[theme])).toBe(expected);
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

describe.each(THEMES)("badge tone contrast in the %s theme (issue #788, the owner's ruling of 2026-09-02)", (theme) => {
  const paletteOf = (): ReadonlyMap<string, string> => themeTokens[theme];

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
   * paint **in this theme** -- so an edit to either alias, either theme block
   * or either raw ramp entry re-runs this exact check rather than needing a
   * second, hand-updated copy of it.
   *
   * **Run for both themes since #1157, and that is the whole point of the
   * `describe.each`.** The ruling was made against one palette and it is a
   * statement about what a badge has to do, not about a colour: a second
   * palette that broke it would be a second version of the same defect. The
   * day theme clears it from the other side -- its caution rung is lighter
   * than both neighbours where the night one is darker -- because the day
   * subtle text and the day warning are close enough in luminance that no
   * middle value clears 3:1 from both.
   */
  it('paints the caution badge at least 3:1 from the neutral badge (WCAG 1.4.11 floor)', () => {
    const tokens = paletteOf();
    const cautionFg = resolveToken('--badge-caution-fg', tokens);
    const neutralFg = resolveToken('--badge-neutral-fg', tokens);
    const ratio = contrastRatio(cautionFg, neutralFg);
    expect(ratio, `${theme}: caution (${cautionFg}) vs neutral (${neutralFg}) = ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(3);
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
    const tokens = paletteOf();
    const cautionFg = resolveToken('--badge-caution-fg', tokens);
    const successFg = resolveToken('--badge-success-fg', tokens);
    const ratio = contrastRatio(cautionFg, successFg);
    expect(ratio, `${theme}: caution (${cautionFg}) vs success (${successFg}) = ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(3);
  });

  it('keeps caution at least 3:1 from warning, its neighbour up the ladder', () => {
    const tokens = paletteOf();
    const cautionFg = resolveToken('--badge-caution-fg', tokens);
    const warningFg = resolveToken('--badge-warning-fg', tokens);
    const ratio = contrastRatio(cautionFg, warningFg);
    expect(ratio, `${theme}: caution (${cautionFg}) vs warning (${warningFg}) = ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(3);
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
   * `--badge-caution-bg` rather than a translucent one, so `paintedColour`
   * above resolves it to itself with no compositing needed -- and still takes
   * `--surface-raised` as its fallback surface, because the property this
   * test is actually pinning is "the chip is opaque enough not to need one",
   * and a translucent regression should fail on the real number the panel
   * would paint, not on a format `paintedColour` cannot parse.
   *
   * **In the day theme the same conflict resolves the other way up**, and
   * the symmetry is the evidence that this is a property of the ladder and
   * not of one palette: the day caution foreground is pushed *above* both its
   * neighbours, so its chip is the delivery's own frame ink and the badge is
   * light-on-dark where the night one is dark-on-light. In each theme,
   * caution is the one solid chip, for the same measured reason.
   */
  it("keeps caution's own text at least 4.5:1 on its own badge background (WCAG 1.4.3)", () => {
    const tokens = paletteOf();
    const cautionFg = resolveToken('--badge-caution-fg', tokens);
    const cautionBgToken = resolveToken('--badge-caution-bg', tokens);
    const surfaceRaised = resolveToken('--surface-raised', tokens);
    const paintedBg = paintedColour(cautionBgToken, surfaceRaised);
    const ratio = contrastRatio(cautionFg, paintedBg);
    expect(
      ratio,
      `${theme}: caution text (${cautionFg}) on caution's own background (${cautionBgToken} -> painted ${paintedBg} on --surface-raised ${surfaceRaised}) = ${ratio.toFixed(3)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * **Every other badge tone's own text, which the one-theme file never
   * checked and the second theme is the reason to.**
   *
   * The three rulings above are about `'caution'` because `'caution'` is
   * where the defect was found. The property they were defending -- a badge
   * whose text you can read on its own chip -- belongs to all seven tones,
   * and a palette swap is exactly the event that breaks it for a tone nobody
   * is looking at. Fixing the class rather than the instance.
   *
   * 4.5:1 is WCAG 1.4.3 for text, the same floor the caution assertion uses.
   * The chips composite against `--surface-raised` because that is the
   * surface a badge is painted on; an opaque chip composites to itself.
   */
  it.each([...BADGE_TONES])('keeps %s badge text at least 4.5:1 on its own chip', (tone) => {
    const tokens = paletteOf();
    const fg = resolveToken(`--badge-${tone}-fg`, tokens);
    const bgToken = resolveToken(`--badge-${tone}-bg`, tokens);
    const surfaceRaised = resolveToken('--surface-raised', tokens);
    const paintedBg = paintedColour(bgToken, surfaceRaised);
    const ratio = contrastRatio(fg, paintedBg);
    expect(
      ratio,
      `${theme}: ${tone} text (${fg}) on its chip (${bgToken} -> painted ${paintedBg}) = ${ratio.toFixed(3)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The text ladder, measured on the ground the page actually paints.
   *
   * `src/styles.css` sets `html, body` to `--surface-base` and `--text-body`,
   * so this is the pairing every sentence in the interface starts from.
   * Constitution article 8 makes contrast a measured requirement rather than
   * an assumed one, and article 19 makes the hierarchy mean the same thing in
   * both themes -- which is checked here as the ladder being *monotonic* as
   * well as legible: heading at least as strong as body, body than subtle,
   * subtle than muted.
   *
   * 4.5:1 for the four text roles: `--text-muted` is used for real sentences
   * (`hud.css` gives it to hints and empty-state prose), not only for
   * decoration, so the text floor is the honest one to hold it to.
   */
  it('keeps all four text roles at least 4.5:1 on the application background and in order', () => {
    const tokens = paletteOf();
    const base = resolveToken('--surface-base', tokens);
    const ratios = (['--text-heading', '--text-body', '--text-subtle', '--text-muted'] as const).map((role) => ({
      role,
      colour: resolveToken(role, tokens),
      ratio: contrastRatio(resolveToken(role, tokens), base),
    }));
    for (const { role, colour, ratio } of ratios) {
      expect(ratio, `${theme}: ${role} (${colour}) on --surface-base (${base}) = ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(4.5);
    }
    for (let index = 1; index < ratios.length; index += 1) {
      const stronger = ratios[index - 1]!;
      const weaker = ratios[index]!;
      expect(
        stronger.ratio,
        `${theme}: ${stronger.role} (${stronger.ratio.toFixed(3)}:1) must not read weaker than ${weaker.role} (${weaker.ratio.toFixed(3)}:1)`,
      ).toBeGreaterThan(weaker.ratio);
    }
  });

  /**
   * The filled primary button, both of its states.
   *
   * `.ui-action[data-tone='primary']` paints `--accent-contrast` on
   * `--accent-deep` and lifts to `--accent` on hover, and until #1157 the
   * resting state painted `--text-heading` instead -- which is legible only
   * on a dark theme, because a heading colour is by definition close to the
   * theme's text and a filled accent button is not the theme's background.
   * Measured on the day palette before the fix: `#122c3a` on `#005c5f` is
   * **1.81:1**. The rule now reads `--accent-contrast` in both states, and
   * this is what holds it there.
   */
  it('keeps the primary action readable in both of its states', () => {
    const tokens = paletteOf();
    const contrast = resolveToken('--accent-contrast', tokens);
    for (const fill of ['--accent-deep', '--accent'] as const) {
      const background = resolveToken(fill, tokens);
      const ratio = contrastRatio(contrast, background);
      expect(
        ratio,
        `${theme}: --accent-contrast (${contrast}) on ${fill} (${background}) = ${ratio.toFixed(3)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * The focus ring, which is the one affordance article 19 names in the same
   * breath as statuses and hierarchy.
   *
   * `primitives.css` draws every `:focus-visible` outline in `--accent`, and
   * an outline is a graphical object: WCAG 1.4.11's floor is 3:1. It has to
   * clear that against every surface a focusable control can sit on, or the
   * ring disappears on one panel and not another.
   */
  it('keeps the focus ring at least 3:1 against every surface', () => {
    const tokens = paletteOf();
    const accent = resolveToken('--accent', tokens);
    for (const surface of ['--surface-sunken', '--surface-base', '--surface-raised', '--surface-overlay', '--surface-active'] as const) {
      const background = resolveToken(surface, tokens);
      const ratio = contrastRatio(accent, background);
      expect(
        ratio,
        `${theme}: --accent (${accent}) on ${surface} (${background}) = ${ratio.toFixed(3)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
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
    expect(source).not.toMatch(/var\(--(?:ink|slate|paper|teal|moss|straw|amber|clay|crimson)-/);
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

  /**
   * The filled primary button reads its foreground from the alias whose job
   * that is, and not from the heading colour (#1157).
   *
   * The token-level check lives in the contrast suite above; this is the
   * other half, because a correct `--accent-contrast` proves nothing if the
   * rule that paints the button does not spend it. A heading colour on a
   * filled accent button measured 1.81:1 on the day palette.
   */
  it('paints the primary action in the accent-contrast colour, not the heading colour', () => {
    const primitives = stylesheetRules(join(UI_ROOT, 'primitives/primitives.css'));
    const rule = /\.ui-action\[data-tone='primary'\]\s*\{[^}]*\}/.exec(primitives);
    expect(rule, "the primary action's own rule").not.toBeNull();
    expect(rule![0]).toMatch(/color:\s*var\(--accent-contrast\)/);
    expect(rule![0], 'a heading colour is not readable on a filled accent button in a light theme').not.toMatch(/color:\s*var\(--text-heading\)/);
  });

  it('gives every interactive primitive a focus-visible ring in the accent colour', () => {
    const primitives = stylesheetRules(join(UI_ROOT, 'primitives/primitives.css'));
    expect(primitives).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s);
  });
});
