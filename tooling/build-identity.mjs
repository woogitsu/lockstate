import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The build's own identity, for Vite's `define`.
 *
 * `src/shared/build-identity.ts` is the other half: it reads what this
 * produces, and its header explains why one seam replaced three hard-coded
 * placeholders. This is the half with a filesystem and a `git` to ask; the
 * module that reads it, running in a browser, has neither.
 *
 * ## Why this is a module and not two copies of the same code
 *
 * There are two Vite configs. `vite.config.ts` builds the game;
 * `tests/browser/vite.config.ts` serves the pages the Playwright suite drives,
 * deliberately separate so nothing test-only can reach the production bundle.
 * The browser suite is the *only* layer that can prove the injection works at
 * all -- the default Vitest environment has no `define`, so every headless test
 * necessarily exercises the `unknown` fallback -- and a second copy of the
 * resolver in the test config would mean the suite proved the copy. One module,
 * imported by both, is what makes that assertion about production.
 *
 * ## Nothing here throws
 *
 * A build must not fail because a deploy ran from a tarball with no `.git`, or
 * because a checkout was shallow. Every resolver returns an empty string on
 * failure and the reading module turns that into a visible `unknown`, which is
 * the honest answer and a far better outcome than a broken build. There is also
 * nothing secret in either value: both are baked into a public bundle, and a
 * commit that is already published in a public repository is not a credential.
 */

const repositoryRoot = new URL('../', import.meta.url);

/** The `version` field of `package.json`, or `''` if it cannot be read. */
export function packageVersion() {
  try {
    const parsed = JSON.parse(readFileSync(new URL('package.json', repositoryRoot), 'utf8'));
    return typeof parsed?.version === 'string' ? parsed.version : '';
  } catch {
    return '';
  }
}

/** The seven-character commit the build was made from, or `''`. */
export function shortCommit() {
  // The environment variables first, because on a CI runner they are the *more*
  // reliable source: a shallow or detached checkout still carries the SHA in the
  // environment, and a hosted build image may have no `.git` at all.
  for (const name of ['CF_PAGES_COMMIT_SHA', 'GITHUB_SHA', 'LOCKSTATE_COMMIT_SHA']) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 7);
  }
  try {
    // `execFileSync` rather than `execSync`, so nothing goes through a shell.
    // `cwd` is pinned to the repository root: a Vite config is executed from a
    // rewritten temporary file, so the working directory is not something to
    // assume.
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: fileURLToPath(repositoryRoot),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * The `define` entries both Vite configs pass through.
 *
 * `JSON.stringify` because `define` substitutes the text verbatim: an unquoted
 * value would be spliced into the bundle as an expression.
 */
export function buildIdentityDefines() {
  return {
    __LOCKSTATE_VERSION__: JSON.stringify(packageVersion()),
    __LOCKSTATE_COMMIT__: JSON.stringify(shortCommit()),
  };
}
