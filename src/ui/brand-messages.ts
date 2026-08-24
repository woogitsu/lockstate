import type { LocalizationKey } from '../content/localization';

/**
 * Every string the brand badge renders.
 *
 * Shaped like `src/ui/hud/messages.ts` and `src/ui/save-panel-messages.ts`, and
 * for the same reason those exist: one frozen object is what lets a test assert
 * that the bundled default catalog resolves *every* key. ADR 0011.
 *
 * The `brand.` namespace rather than `hud.`: the badge is page chrome, not a
 * projection of prison state. It says nothing about the simulation and never
 * changes while the game runs, which is exactly why it is not in the HUD's view
 * model.
 */
export const BRAND_MESSAGE_KEY = {
  /** The accessible name of the badge region. */
  region: 'brand.region',
  /**
   * The wordmark.
   *
   * A brand name in the catalog rather than a literal in the DOM builder, which
   * is a deliberate call and not box-ticking. It is the same rule every other
   * on-screen string obeys, so the pseudo-locale check and the registry gate
   * cover it for free; and a wordmark is not always left untranslated -- a
   * locale in a non-Latin script may need a transliteration beside it. Keeping
   * it addressable costs one entry and decides nothing now.
   */
  wordmark: 'brand.wordmark',
  /**
   * The development stage, e.g. `PRE-ALPHA`.
   *
   * **Authored, not derived, and that is the point of writing it here.** No
   * value in the repository states what stage the project is at:
   * `docs/TESTING.md` says "during the pre-alpha foundation" and
   * `docs/ROADMAP.md` counts phases 0 to 11 without naming a release stage at
   * all. So this is a claim someone makes, which means it can go stale --
   * unlike the version and the commit beside it, which a build cannot get
   * wrong. It is a catalog entry so that changing it is one edit in the place
   * all other authored text lives, and `docs/DEPLOYMENT.md`'s "Build identity"
   * section records that it must be changed by hand when the stage changes.
   */
  stage: 'brand.stage',
  /**
   * The version and the build, e.g. `v0.0.7 · 1695340`.
   *
   * Both, because they answer different questions and only together answer the
   * one that was asked. The semantic version says what the build claims to be;
   * the commit says which build it actually is.
   *
   * The version half used to say almost nothing: `package.json` sat at `0.0.0`
   * and the repository carried no tags, so every build of every day shared the
   * number and only the commit identified anything. There is a policy now --
   * `.github/workflows/version.yml` bumps the patch on every merge to `main`
   * and tags the commit that introduces it -- so a merge is a version and a
   * bug report can quote `v0.0.7` without a hash.
   *
   * The commit stays, and stays the exact answer. The tag marks the commit
   * where a version *begins*, so a version names the range of commits that
   * shipped under it and the hash names one of them. See docs/DEPLOYMENT.md,
   * "Build identity".
   */
  build: 'brand.build',
  /**
   * The whole badge as one sentence, for assistive technology.
   *
   * The visible badge is three fragments laid out in a row: a stage chip, a `v`
   * prefix and a bare seven-character hex string. Read out in sequence that is
   * close to meaningless, so the row carries a full sentence and the fragments
   * are hidden from the accessibility tree. This is an *addition* to a visible
   * affordance, never a substitute -- every fragment is on screen.
   */
  description: 'brand.description',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export const BRAND_MESSAGE_KEYS: readonly LocalizationKey[] = Object.values(BRAND_MESSAGE_KEY);
