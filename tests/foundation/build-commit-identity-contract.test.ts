import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { shortCommit } from '../../tooling/build-identity.mjs';

/**
 * The commit a build stamps itself with is the commit that build was made
 * from.
 *
 * ## The defect
 *
 * `docs/DEPLOYMENT.md` says of the badge: *"The commit beside the version on
 * the badge is still the exact answer whenever one is needed."* That was the
 * whole argument for the seam -- `package.json`'s version is bumped by CI one
 * patch per merge, so a build made inside `v0.0.N..v0.0.N+1` reports `0.0.N`
 * and only the commit identifies it precisely. The staging deploy was stamping
 * a commit it had not built, which makes that sentence false in the one place
 * it is load-bearing.
 *
 * `tooling/build-identity.mjs` read `CF_PAGES_COMMIT_SHA`, then `GITHUB_SHA`,
 * then `LOCKSTATE_COMMIT_SHA`, and returned the first set value. In
 * `deploy.yml`'s `staging` job that is wrong, because a `workflow_run` run is
 * not checked out at the commit that triggered it: the checkout takes
 * `github.event.workflow_run.head_sha` on purpose, while GitHub sets
 * `GITHUB_SHA` to the default branch's tip. Both values are visible in one
 * real run -- Deploy run 33005151972 (`success`) reports `head_sha` `2a53baa`
 * (`chore(release): v0.0.118`) and its checkout log resolves
 * `ref: 64cd3799e0ab...`, which is `64cd379` and carries `0.0.114`. That deploy
 * built `64cd379`'s tree, read `0.0.114` out of it, and stamped it `2a53baa`:
 * a version from one commit, a commit id from another seven commits on, and
 * the commit it named was the one that had not been built.
 *
 * ## And the same defect's other face
 *
 * `docs/DEPLOYMENT.md` also said *"Set `LOCKSTATE_COMMIT_SHA` to override"*. It
 * could not: `GITHUB_SHA` is always set in Actions and came first, so the
 * documented override was unreachable inside the only environment anyone would
 * use it in. Executed against the old order:
 *
 * ```
 * GITHUB_SHA=2a53baa... LOCKSTATE_COMMIT_SHA=64cd379...  ->  "2a53baa"
 * ```
 *
 * One fix answers both: the explicit override leads, and the job that knows
 * which commit it checked out passes it.
 *
 * ## Why both halves are asserted here
 *
 * Either alone is inert. The order without the job setting the variable stamps
 * `GITHUB_SHA` exactly as before; the job setting it without the order is the
 * unreachable-override bug again. So this file holds the pair, and the failure
 * messages point at each other.
 *
 * ## What this file deliberately does not check
 *
 * Whether the *value* GitHub puts in `github.event.workflow_run.head_sha` is
 * the commit CI judged. Nothing on this side of the wire can know that; it is
 * the `Checkout` step's own contract, argued in that step's comment and in
 * `deploy-blocked-announcement-contract.test.ts`. What is checked here is that
 * the stamp and the checkout read the same expression, so they cannot drift
 * apart silently.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml';
const RESOLVER = 'tooling/build-identity.mjs';

/** The `staging` job's lines, comments included. */
function stagingJobLines(): readonly string[] {
  const lines = readFileSync(join(REPOSITORY_ROOT, DEPLOY_WORKFLOW), 'utf8').split(/\r?\n/u);
  const start = lines.indexOf('  staging:');

  expect(
    start,
    `${DEPLOY_WORKFLOW} has no \`staging:\` job. That is the job that publishes the site today (docs/DEPLOYMENT.md, "What currently serves lockstate.io"); if it was renamed, rename it here in the same commit.`,
  ).toBeGreaterThanOrEqual(0);

  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => line.trim().length > 0 && line.search(/\S/u) <= 2);
  return end === -1 ? body : body.slice(0, end);
}

/**
 * Run `shortCommit()` in a child process with a controlled environment.
 *
 * A child rather than mutating `process.env` here, because the resolver falls
 * back to `git rev-parse` in this very repository and a leaked variable would
 * change what a later case in this run sees. `env` is replaced wholesale
 * except for `PATH`, so an inherited `GITHUB_SHA` -- this suite does run in
 * Actions -- cannot decide the answer to a case about precedence.
 */
function resolveWith(environment: Readonly<Record<string, string>>): string {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      // A `file:` URL rather than a path: an `import` specifier that is a bare
      // Windows path is not a valid one, and `scripts/` is cross-platform by
      // contract (docs/DEPLOYMENT.md).
      `import { shortCommit } from ${JSON.stringify(pathToFileURL(join(REPOSITORY_ROOT, RESOLVER)).href)}; process.stdout.write(shortCommit());`,
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '', ...environment },
    },
  );

  if (result.error !== undefined) {
    throw new Error(`could not run ${RESOLVER}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${RESOLVER} exited ${String(result.status)}: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

// Two real, published, seven-apart commits, so a case that accidentally
// compared a value with itself would not pass. `2a53baa` is the `head_sha` of
// Deploy run 33005151972 and `64cd379` is the ref its `staging` job actually
// checked out.
const AMBIENT = '2a53baaed5edbf427795349e7abd7f1fcd61da77';
const BUILT = '64cd3799e0ab15a79d3818a8dfd8393859c108ff';

describe('a build stamps the commit it was made from', () => {
  it('lets an explicit LOCKSTATE_COMMIT_SHA beat the ambient CI variables', () => {
    expect(
      resolveWith({ GITHUB_SHA: AMBIENT, LOCKSTATE_COMMIT_SHA: BUILT }),
      `\`GITHUB_SHA\` now outranks \`LOCKSTATE_COMMIT_SHA\` in ${RESOLVER}. \`GITHUB_SHA\` is always set in Actions, so with that order the variable docs/DEPLOYMENT.md calls the override can never override anything -- and \`deploy.yml\`'s \`staging\` job sets it precisely because \`GITHUB_SHA\` is the WRONG commit there: on a \`workflow_run\` GitHub sets it to the default branch's tip, not the ref that job checks out. Put \`LOCKSTATE_COMMIT_SHA\` first.`,
    ).toBe(BUILT.slice(0, 7));

    expect(
      resolveWith({ CF_PAGES_COMMIT_SHA: AMBIENT, LOCKSTATE_COMMIT_SHA: BUILT }),
      `\`CF_PAGES_COMMIT_SHA\` now outranks \`LOCKSTATE_COMMIT_SHA\` in ${RESOLVER}. Same rule and same reason as \`GITHUB_SHA\`: an ambient value a platform sets must not beat one a person set on purpose.`,
    ).toBe(BUILT.slice(0, 7));
  });

  it('still prefers an ambient sha to `git`, which is why the environment is read at all', () => {
    // The half that must NOT be lost while fixing the half above. The
    // environment leads `git` because a shallow or detached CI checkout still
    // carries the SHA while a hosted build image may have no `.git` at all --
    // and this repository's own CI checks out detached at a sha.
    const headShort = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    }).stdout.trim();

    // `{7,}` rather than `{7}`, and the difference is the whole of #1094:
    // `--short=7` asks for *at least* seven, and git returns more when seven
    // are ambiguous. This guard read `{7}` and was therefore not a guard at
    // all but a second assertion, one that failed on `8a35167b` -- a commit
    // whose first seven characters are shared with `8a351679a5be...`, so git
    // gave eight -- and took `main` red with it.
    //
    // That shared prefix cannot be written here as a bare sha, and finding
    // out why cost a suite run worth recording:
    // `tests/foundation/documentation-commit-citation-contract.test.ts`
    // rejects it, because `git cat-file -e` cannot resolve an ambiguous
    // abbreviation either. The contract that guards citations catches the
    // same defect this file is about, one level up.
    // What this line is for is catching an empty string from a checkout git
    // cannot read; the length is not its business.
    expect(
      headShort,
      'git could not resolve HEAD in this checkout, so the comparison below would be against an empty string.',
    ).toMatch(/^[0-9a-f]{7,}$/u);

    expect(
      resolveWith({ GITHUB_SHA: AMBIENT }),
      `${RESOLVER} no longer reads \`GITHUB_SHA\` before falling back to \`git\`. The environment leads on purpose: a hosted build image may have no \`.git\` at all, and \`docs/DEPLOYMENT.md\` states the order. Reordering to fix the override must not remove the ambient sources.`,
    ).toBe(AMBIENT.slice(0, 7));

    expect(
      resolveWith({}),
      `${RESOLVER} no longer falls back to \`git rev-parse\` with no variable set. That is the local-build path, and \`lockstate-<version>-unknown\` on the badge is what losing it looks like.`,
      // Sliced, because that is now the resolver's contract on both branches
      // rather than an accident of how long git felt like being. Comparing
      // against the raw `headShort` would re-assert the defect.
    ).toBe(headShort.slice(0, 7));

    // The contract stated directly, rather than only as a comparison: seven
    // characters, whichever branch answered.
    //
    // **Where this case is weak, and it is worth knowing before trusting it.**
    // Both assertions above have teeth only when HEAD's seven-character
    // prefix is ambiguous in this repository -- on any other commit git
    // returns seven from `--short=7` unprompted, the slice is a no-op, and
    // removing it again would go unnoticed here. That is a property of HEAD
    // on the day the suite runs, not of the code under test, and this file
    // cannot fix it: `shortCommit` reads `HEAD` and takes no argument. What
    // would make it a real guard is a resolver that accepts a revision, at
    // which point this could pin `8a35167ba0ae...` and assert seven forever.
    expect(
      resolveWith({}),
      `${RESOLVER}'s \`git\` branch returned an abbreviation that is not seven characters. \`--short=7\` is a minimum and git lengthens it when seven are ambiguous, so this branch must slice like the ambient one above -- otherwise a local build and a CI build of the same commit stamp different strings.`,
    ).toMatch(/^[0-9a-f]{7}$/u);
  });

  it('has the imported resolver agree with the child process, so this file measures the real one', () => {
    // Guard against the child above drifting onto a different module than the
    // one both Vite configs import -- if these disagree, every case here is
    // about a file nothing ships. `shortCommit` is imported at the top of this
    // file from the same specifier `vite.config.ts` uses, and the child is
    // spawned against a path; this is the only case that runs both.
    const previous = process.env['LOCKSTATE_COMMIT_SHA'];
    let inProcess: string;
    try {
      process.env['LOCKSTATE_COMMIT_SHA'] = BUILT;
      inProcess = shortCommit();
    } finally {
      if (previous === undefined) delete process.env['LOCKSTATE_COMMIT_SHA'];
      else process.env['LOCKSTATE_COMMIT_SHA'] = previous;
    }

    expect(
      inProcess,
      `the \`shortCommit\` this file imports from ${RESOLVER} does not answer what the same module answers in a child process. Either the cases above are exercising a different implementation than the one \`vite.config.ts\` imports, or the resolver reads its environment somewhere other than at call time.`,
    ).toBe(resolveWith({ LOCKSTATE_COMMIT_SHA: BUILT }));
  });

  it('has the staging deploy pass the commit it checked out, not the one it was handed', () => {
    const jobLines = stagingJobLines();

    // Vacuity guard: a block parsed down to nothing would fail the assertions
    // below while blaming the workflow instead of this parser.
    expect(
      jobLines.length,
      `the \`staging:\` job in ${DEPLOY_WORKFLOW} parsed to almost no lines; the job parser here is broken.`,
    ).toBeGreaterThan(20);

    // Comments dropped, because that job's comment explains this setting at
    // length and names the variable. Prose describing a setting must not be
    // able to satisfy an assertion that the setting exists.
    const settings = jobLines
      .filter((line) => !line.trim().startsWith('#'))
      .map((line) => line.trim());

    const stamp = settings.find((line) => line.startsWith('LOCKSTATE_COMMIT_SHA:'));

    expect(
      stamp,
      `the \`staging\` job in ${DEPLOY_WORKFLOW} no longer sets \`LOCKSTATE_COMMIT_SHA\`. Without it the build stamps \`GITHUB_SHA\`, which on a \`workflow_run\` is the default branch's tip and not the \`ref:\` that job checks out -- so the published bundle names a commit it was not built from. Deploy run 33005151972 is the recorded instance: \`head_sha\` 2a53baa, checkout ref 64cd379, seven commits apart.`,
    ).toBeDefined();

    // The value has to be the SAME expression the checkout takes, or the two
    // drift and the stamp is wrong again in a new way. `github.ref` vs
    // `github.sha` is the only permitted difference: the checkout wants a ref,
    // the stamp wants a sha, and on a dispatch `github.sha` is that ref's tip.
    const checkoutRef = settings.find((line) => line.startsWith('ref:'));

    expect(
      checkoutRef,
      `the \`staging\` job in ${DEPLOY_WORKFLOW} no longer sets \`ref:\` on its checkout. That line is why the job builds the commit CI judged rather than the default branch's tip; the stamp asserted above is derived from it and is meaningless without it.`,
    ).toBeDefined();

    expect(
      stamp,
      `the \`staging\` job's \`LOCKSTATE_COMMIT_SHA\` no longer reads \`github.event.workflow_run.head_sha\`. It must name the same commit the \`Checkout\` step takes -- that step's \`ref:\` is ${JSON.stringify(checkoutRef)} -- or the bundle is stamped with a commit it was not built from, which is the whole defect this pair exists to close.`,
    ).toContain('github.event.workflow_run.head_sha');

    expect(
      stamp,
      `the \`staging\` job's \`LOCKSTATE_COMMIT_SHA\` has no fallback for a \`workflow_dispatch\`, where \`github.event.workflow_run\` is empty. It should fall back to \`github.sha\`, which on a dispatch is the tip of the \`github.ref\` the checkout takes. An empty value falls through to \`GITHUB_SHA\` in ${RESOLVER}, which is the bug on the automatic path.`,
    ).toContain('github.sha');
  });
});
