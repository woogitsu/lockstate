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

/**
 * The seven-character commit the build was made from, or `''`.
 *
 * ## The order, and why the override comes first
 *
 * The environment before `git`, because on a CI runner it is the *more*
 * reliable source: a shallow or detached checkout still carries the SHA in the
 * environment, and a hosted build image may have no `.git` at all.
 *
 * `LOCKSTATE_COMMIT_SHA` before the two ambient ones, because it is the only
 * one a person sets on purpose. It used to come last, which made it
 * unreachable: `GITHUB_SHA` is always set in Actions, so the variable
 * docs/DEPLOYMENT.md called the override could never override anything.
 * Executed against that order:
 *
 * ```
 * GITHUB_SHA=2a53baa... LOCKSTATE_COMMIT_SHA=64cd379...  ->  "2a53baa"
 * ```
 *
 * ## What the old order actually shipped, which is the reason this moved
 *
 * `GITHUB_SHA` is wrong in exactly one job, and it is the job that publishes
 * the site. A `workflow_run` run is not checked out at the commit that
 * triggered it, so `.github/workflows/deploy.yml`'s `staging` job passes
 * `ref: github.event.workflow_run.head_sha` deliberately -- and the same fact
 * that makes that line necessary makes `GITHUB_SHA` name a different commit:
 * for `workflow_run`, GitHub sets it to the default branch's tip.
 *
 * Both values are visible in one real run. Deploy run 33005151972 (`success`)
 * reports `head_sha` `2a53baa`, `chore(release): v0.0.118`; its `staging` job's
 * log shows the checkout resolving `ref: 64cd3799e0ab...`, which is `64cd379`
 * and carries `0.0.114`. So that deploy built `64cd379`'s tree, read `0.0.114`
 * out of it, and stamped the bundle with a commit seven commits further on that
 * it had not built. Every recent successful Deploy run has a `chore(release)`
 * head_sha, so this was the normal case rather than a race.
 *
 * It defeated the seam's stated purpose -- docs/DEPLOYMENT.md: "The commit
 * beside the version on the badge is still the exact answer whenever one is
 * needed." That job now sets `LOCKSTATE_COMMIT_SHA` to the same expression its
 * checkout takes, and `tests/foundation/build-commit-identity-contract.test.ts`
 * holds both halves: this order, and that the job passes one.
 *
 * The `production` job needs nothing, and that is worth knowing rather than
 * copying: it takes no `ref:`, so it checks out `GITHUB_SHA` and the ambient
 * value is already the built commit.
 */
export function shortCommit() {
  for (const name of ['LOCKSTATE_COMMIT_SHA', 'CF_PAGES_COMMIT_SHA', 'GITHUB_SHA']) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 7);
  }
  try {
    // `execFileSync` rather than `execSync`, so nothing goes through a shell.
    // `cwd` is pinned to the repository root: a Vite config is executed from a
    // rewritten temporary file, so the working directory is not something to
    // assume.
    //
    // **`--short=7` is a minimum, not a length, and this path used to return
    // git's answer untouched.** Git lengthens an abbreviation whenever seven
    // characters are ambiguous in this repository, so this returned eight for
    // some commits and seven for the rest -- while the ambient branch above
    // has always sliced to exactly seven. `8a35167b` is a real instance:
    // `8a351679a5be...` and `8a35167ba0ae...` share their first seven
    // characters, and that commit turned `main` red on 2026-09-08 through
    // `tests/foundation/build-commit-identity-contract.test.ts`.
    //
    // Sliced, so the two branches answer the same shape. The property worth
    // having is that a local build and a CI build **of the same commit** stamp
    // the same string: CI always takes the ambient branch, so seven is what
    // ships, and an unsliced local build disagreed with it on exactly the
    // commits where the id matters most to get right.
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: fileURLToPath(repositoryRoot),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .slice(0, 7);
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
