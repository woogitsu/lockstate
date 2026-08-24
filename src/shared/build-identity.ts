/**
 * Which build this is.
 *
 * One value, injected once at build time, for the three places that were each
 * answering the question with a different hard-coded placeholder:
 *
 * - `src/main.ts` stamped `gameVersion: 'lockstate-dev'` into **every save
 *   envelope**, so a save could not name the build that wrote it;
 * - `src/simulation/worker/worker.ts` reported `workerBuildId: 'dev-build'` in
 *   the protocol handshake, under a comment that said "To be injected by Vite
 *   or build process in the future";
 * - nothing at all was on screen, so a player could not say which build they
 *   were playing and neither could a bug report.
 *
 * Three placeholders and no seam is the shape this repository keeps finding, so
 * the fix is one seam rather than a fourth constant. Everything that needs a
 * build identity reads it from here.
 *
 * ## How the value arrives
 *
 * Two identifiers are replaced at compile time -- the semantic version from
 * `package.json` and the short commit -- because a bundle has no filesystem and
 * no `git`. The resolvers live in `tooling/build-identity.mjs` and are passed
 * as Vite `define` entries by **both** configs: `vite.config.ts`, which builds
 * the game, and `tests/browser/vite.config.ts`, which serves the pages the
 * Playwright suite drives. One module rather than a copy in each, because the
 * browser suite is the only layer that can prove the injection happened at all
 * and a copy there would prove the copy.
 *
 * The read is guarded with `typeof`, which is the one form that does not throw
 * for an identifier that was never declared: in the default Vitest environment
 * there is no `define`, so the guard takes the fallback branch and the module
 * still loads. That fallback is a *named unknown*, never a plausible-looking
 * version, because a fake version number is worse than an honest absence -- it
 * would send someone chasing a build that never existed. It is also why
 * `tests/browser/app-shell.spec.ts` asserts the injected value is **not**
 * `unknown`: a build that shipped `lockstate-unknown-unknown` to every player
 * would leave the entire headless suite green.
 *
 * ## What is deliberately not here
 *
 * No build timestamp. The commit already identifies the build, and a timestamp
 * would make two builds of the same source produce different bundles for no
 * added answer.
 *
 * No release channel and no "alpha"/"beta" stage. The stage a project is at is
 * an authored claim about the product, not a fact about the build, so it lives
 * in the localization catalog (`brand.stage`) where it can be read, translated
 * and changed deliberately -- see `src/ui/brand-messages.ts`.
 */

/**
 * Compile-time replacements. Declared as possibly `undefined` because in every
 * environment without the `define` -- the default Vitest environment above all
 * -- the identifier is not merely undefined, it is *undeclared*, and only
 * `typeof` may touch it.
 */
declare const __LOCKSTATE_VERSION__: string | undefined;
declare const __LOCKSTATE_COMMIT__: string | undefined;

/**
 * What a build cannot tell you about itself.
 *
 * A single spelling, exported so a test can assert the fallback rather than
 * re-typing the literal, and so a consumer that wants to render "unknown"
 * differently can compare instead of matching a string.
 */
export const UNKNOWN_BUILD_FIELD = 'unknown';

export interface BuildIdentity {
  /** The `version` field of `package.json`, e.g. `0.0.0`, or `unknown`. */
  readonly version: string;
  /** The short commit the build was made from, e.g. `1695340`, or `unknown`. */
  readonly commit: string;
  /**
   * The two joined into one identifier, for the fields that accept a single
   * string: `lockstate-<version>-<commit>`.
   *
   * The separator is `-` and not `+` on purpose. This value is written into
   * `SaveEnvelope.gameVersion` and into the worker handshake's
   * `workerBuildId`, both of which are validated by `identifierSchema`
   * (`src/simulation/protocol/types.ts`) as
   * `/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/` with a 128-character ceiling. A semver
   * build-metadata `+` would be rejected there, so the semver punctuation is
   * not used -- this is an identifier, not a version to be parsed back.
   */
  readonly id: string;
}

function injected(value: string | undefined): string {
  // Both halves matter. `undefined` is the no-`define` case; an empty string is
  // what a `git rev-parse` that failed in the build script produces, and a
  // build identity of `lockstate--` would satisfy `identifierSchema` while
  // saying nothing.
  return value === undefined || value.trim() === '' ? UNKNOWN_BUILD_FIELD : value.trim();
}

const version = injected(typeof __LOCKSTATE_VERSION__ === 'string' ? __LOCKSTATE_VERSION__ : undefined);
const commit = injected(typeof __LOCKSTATE_COMMIT__ === 'string' ? __LOCKSTATE_COMMIT__ : undefined);

export const BUILD_IDENTITY: BuildIdentity = {
  version,
  commit,
  id: `lockstate-${version}-${commit}`,
};
