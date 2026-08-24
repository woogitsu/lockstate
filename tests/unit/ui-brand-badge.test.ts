import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { BUILD_IDENTITY, UNKNOWN_BUILD_FIELD, type BuildIdentity } from '../../src/shared/build-identity';
import { identifierSchema } from '../../src/simulation/protocol/types';
import { BRAND_MESSAGE_KEY, BRAND_MESSAGE_KEYS } from '../../src/ui/brand-messages';

/**
 * The badge that says which build is on screen.
 *
 * Two things are proven here and a third deliberately is not.
 *
 * **The build identity is a valid identifier wherever it is used.** It is
 * written into `SaveEnvelope.gameVersion` and reported as the worker
 * handshake's `workerBuildId`, both validated by `identifierSchema`. A build
 * whose commit contained a character that schema rejects would produce a page
 * that boots, renders a correct-looking badge, and then fails to save -- the
 * failure appearing nowhere near its cause. So the schema is asserted against
 * the real constant and against the shapes an unusual build can produce.
 *
 * **Every key the badge renders resolves.** `BRAND_MESSAGE_KEY`'s fields are
 * named `region`, `wordmark`, `stage`, `build`, `description` -- none of them
 * ends in `Key`, so `tests/foundation/localization-key-completeness.test.ts`,
 * which scans for `<name>Key: '<literal>'` declarations, does not see one of
 * them. That is the same hole `SAVE_PANEL_MESSAGE_KEY` fell into (#208) and the
 * reason a registry check is written per registry rather than assumed.
 *
 * **The DOM is not asserted here.** This file runs in the default `node`
 * environment with no `document`, so `createBrandBadge` cannot be called at
 * all. What it renders -- the wordmark, the chip, the mono build line, their
 * position in the top-left corner and the fact that they are laid out rather
 * than merely present -- is a rendered-output claim, and `docs/TESTING.md` puts
 * those in the browser layer. `tests/browser/ui-shell.spec.ts` and
 * `tests/browser/app-shell.spec.ts` carry them.
 */

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

describe('the build identity', () => {
  it('is a valid protocol identifier, which is what a save and a handshake require', () => {
    // Against the real constant first: this is the value that actually ships.
    expect(identifierSchema.safeParse(BUILD_IDENTITY.id).success).toBe(true);
    expect(BUILD_IDENTITY.id.length).toBeLessThanOrEqual(128);
  });

  it('falls back to a named unknown rather than to a plausible version', () => {
    // In this environment there is no Vite `define`, so both fields take the
    // fallback branch -- which makes this run the *default* case rather than a
    // constructed one, and pins the two properties that matter about it: the
    // module loads at all (an undeclared identifier reached with anything but
    // `typeof` would have thrown at import), and the absence is visible.
    expect(BUILD_IDENTITY.version).toBe(UNKNOWN_BUILD_FIELD);
    expect(BUILD_IDENTITY.commit).toBe(UNKNOWN_BUILD_FIELD);
    expect(BUILD_IDENTITY.id).toBe('lockstate-unknown-unknown');
  });

  it('stays a valid identifier for the shapes a real build produces', () => {
    // The constant above is only ever the fallback in this environment, so the
    // shapes a shipped build actually has are checked as data. A prerelease
    // semver is included because it is the first thing a real versioning policy
    // would introduce, and `+` build metadata is the one form `identifierSchema`
    // rejects -- which is why `build-identity.ts` joins with `-`.
    for (const [version, commit] of [
      ['0.0.0', '1695340'],
      ['1.2.3', 'abcdef0'],
      ['0.1.0-rc.1', '0000000'],
      [UNKNOWN_BUILD_FIELD, '1695340'],
      ['0.0.0', UNKNOWN_BUILD_FIELD],
    ] as const) {
      const id = `lockstate-${version}-${commit}`;
      expect(identifierSchema.safeParse(id).success, id).toBe(true);
    }

    // And the counter-case, so the assertion above is not merely a schema that
    // accepts everything: semver build metadata would be rejected, which is the
    // reason for the separator choice rather than a claim about it.
    expect(identifierSchema.safeParse('lockstate-0.0.0+1695340').success).toBe(false);
  });
});

describe('the brand badge message registry', () => {
  it('resolves every key against the bundled default locale', () => {
    // A key that resolves to itself is what an unregistered key renders as
    // (ADR 0011): correct runtime behaviour and the wrong thing to ship.
    expect(BRAND_MESSAGE_KEYS.length).toBe(5);
    for (const key of BRAND_MESSAGE_KEYS) {
      expect(localizer.format(key), `${key} has no default-locale entry`).not.toBe(key);
    }
  });

  it('fills every placeholder it declares, and declares one for each fragment', () => {
    const build = localizer.format(BRAND_MESSAGE_KEY.build, { version: '1.2.3', commit: 'abcdef0' });
    expect(build).toContain('1.2.3');
    expect(build).toContain('abcdef0');
    expect(build, 'an unfilled placeholder is a defect that renders as braces').not.toMatch(/[{}]/u);

    const description = localizer.format(BRAND_MESSAGE_KEY.description, {
      stage: 'PRE-ALPHA',
      version: '1.2.3',
      commit: 'abcdef0',
    });
    // The screen-reader sentence must name all three, because the visible
    // fragments are `aria-hidden` and it is the only thing read out.
    for (const fragment of ['PRE-ALPHA', '1.2.3', 'abcdef0']) {
      expect(description, `the description drops ${fragment}`).toContain(fragment);
    }
    expect(description).not.toMatch(/[{}]/u);
  });

  it('spells every key in the brand namespace', () => {
    // The namespace is the claim that this badge is page chrome and not a HUD
    // projection. A `hud.` key appearing here would put a constant into the
    // vocabulary of the thing that repaints on every snapshot.
    for (const key of BRAND_MESSAGE_KEYS) expect(key).toMatch(/^brand\./u);
  });

  it('renders the build line from an identity rather than from a hard-coded version', () => {
    // The property the badge's whole purpose rests on: two different builds
    // must produce two different lines. A `brand.build` entry that had lost its
    // placeholders would resolve, pass every assertion above, and show every
    // build the same string.
    const render = (identity: BuildIdentity): string =>
      localizer.format(BRAND_MESSAGE_KEY.build, { version: identity.version, commit: identity.commit });
    const first = render({ version: '0.0.0', commit: '1695340', id: 'lockstate-0.0.0-1695340' });
    const second = render({ version: '0.0.0', commit: 'cf45f2d', id: 'lockstate-0.0.0-cf45f2d' });
    expect(first).not.toBe(second);
  });
});
