/**
 * Types for the build-identity resolvers, so both Vite configs import the
 * *same* implementation rather than a second copy of the rules -- the same
 * arrangement, and the same reason, as `validate-runtime-atlas.d.mts`.
 *
 * The reading half is `src/shared/build-identity.ts`.
 */

/** The `version` field of `package.json`, or `''` if it cannot be read. */
export function packageVersion(): string;

/**
 * The seven-character commit the build was made from, or `''`.
 *
 * `LOCKSTATE_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA` and `GITHUB_SHA` are consulted
 * in that order before `git`, because a shallow or detached CI checkout still
 * carries the SHA in the environment while a hosted build image may have no
 * `.git` at all. The explicit override leads: the implementation's comment has
 * the run in which the ambient `GITHUB_SHA` named a commit that was never
 * built.
 */
export function shortCommit(): string;

/**
 * The `define` entries both Vite configs pass through, already JSON-quoted --
 * `define` substitutes text verbatim, so an unquoted value would be spliced in
 * as an expression.
 */
export function buildIdentityDefines(): Readonly<Record<string, string>>;
