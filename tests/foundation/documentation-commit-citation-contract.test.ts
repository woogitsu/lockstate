import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A commit sha cited in prose names a commit that exists, and one this
 * repository publishes.
 *
 * ## The defect
 *
 * `tests/foundation/documentation-version-claim-contract.test.ts` requires a
 * version written into `docs/**` to *name the commit it belongs to*, because a
 * bare version is falsified by the next merge. Naming a commit converts an
 * expiring claim into a durable one -- but only if the commit exists, and until
 * this file nothing checked that. `0269665` shipped a fabricated `d0b6e18` in
 * the very commit whose subject was dating an undated count, corrected at
 * `8d90be9`; the paragraph in `docs/HANDOVER-2026-08-26.md` that records it
 * then named a `ba1cba1` that does not exist either, caught by hand before the
 * push. Two fabrications, one of them in the sentence warning about the other.
 *
 * ## Why this could not be built before, and what changed
 *
 * `git rev-parse` is the whole check and it is two seconds. The obstacle was
 * never the check, it was the checkout: `.github/workflows/ci.yml` set no
 * `fetch-depth`, so `actions/checkout` cloned at its default depth of **1**.
 * On one commit every citation fails to resolve, true or fabricated, for a
 * reason that has nothing to do with the citation -- so the handover concluded
 * the gate was unbuildable and named the two ways out it could see: a full
 * fetch, "which is a real cost for a documentation check and is the owner's
 * call", or a gate that skips itself on a shallow clone, "which means it never
 * runs where it matters and becomes the list nobody reads".
 *
 * The owner delegated the call. The first way out was taken, because the cost
 * turned out to be small enough to measure rather than argue about: this
 * repository's bulk is the ~55 MB of art in Git LFS and never enters the git
 * pack, so a full clone packs to 5.61 MiB over 7,971 objects against 3.47 MiB
 * over 945 objects at `--depth 1` -- 2.14 MiB for 1,115 commits across every
 * ref -- and the self-hosted runner reuses its workspace, so the deepening is
 * an `--unshallow` paid once and an incremental fetch after that. The full
 * costing, including the narrower fetches that were rejected, is in the
 * comment on that checkout step; it belongs beside the setting.
 *
 * **The skip was refused outright, and this file is written so it cannot come
 * back.** A gate that passes on a checkout too shallow to answer is worse than
 * no gate, because it manufactures confidence. So a shallow checkout is a
 * **failure** here, with a message naming `fetch-depth` and the file to change,
 * and the depth is separately asserted against the workflow so deleting the
 * setting fails in the commit that deletes it rather than the next time
 * somebody fabricates a sha.
 *
 * ## The citation form, and why it is this narrow
 *
 * A citation is **a backtick span whose entire content is 7 to 40 hexadecimal
 * characters** -- `` `8404321` ``, not a bare 8404321, and not a hexadecimal
 * run that merely sits inside a longer span, which is what the fingerprint
 * digests in `docs/adr/0029`'s comparison table are. Everything about that is
 * deliberate and was measured on the corpus at `fa12249`:
 *
 * - **The whole span, not a substring.** Widening to any word-boundaried hex
 *   run anywhere in the text takes the corpus from 74 distinct tokens to 109
 *   and the non-resolving ones from 3 to 36, and 33 of those 36 additions are
 *   correct: simulation state hashes and checksum fixtures spelled as a
 *   repeated hex digit, atlas digests, RNG outputs, an ed25519 algorithm name,
 *   the sixteen-hex save-envelope checksums in `docs/adr/0038`, and the
 *   40-character
 *   `actions/checkout` pin -- which is a real sha in somebody else's
 *   repository. That is a list nobody reads, which is the argument
 *   `documentation-links-contract.test.ts` makes for staying narrow and
 *   `tests/helpers/simulation-enum-source.ts` makes before it.
 * - **No grammatical cue is required.** The obvious narrowing -- a commit-naming
 *   word before the token, which is how the corpus was checked by hand at
 *   `0269665` -- was tried and rejected on evidence: it cannot see a sha used
 *   as a sentence subject, which is about twenty of today's citations, and one
 *   of the two it would have missed is the fabricated `d0b6e18` itself
 *   ("shipped a fabricated ..."). A form that cannot see the defect it exists
 *   for is not a form.
 * - **No digit is required**, and that is the opposite of the choice
 *   `documentation-version-claim-contract.test.ts` made for its escape-hatch
 *   pattern. Requiring one was tried here too and rejected by the corpus:
 *   `cddaebb` is v0.0.77 and is cited four times in `docs/adr/STATUS-QUEUE.md`
 *   with no digit in it at all. The price is `defaced`, allowlisted below.
 *
 * Two shapes are excluded before the check because they are hexadecimal by
 * coincidence, and both were found by running the check rather than by
 * imagining them -- together they account for 81 of the 278 backticked hex
 * spans in the corpus:
 *
 * - `^\d{8,}$`, an all-decimal run of eight or more characters. This is
 *   `supabase/migrations/` timestamps (`20260824`, `20260824140000` -- the one
 *   non-resolving token the handover's hand check found) and GitHub Actions run
 *   ids (`32996045063`) and a byte count (`268435456`). Eight is the floor
 *   rather than nine because a migration date prefix is eight digits, and the
 *   cost is stated: an abbreviated sha with no letter *anywhere* in eight or
 *   more places would be excluded. Every citation in this corpus is abbreviated
 *   to seven, including the one all-decimal one (`8404321`), so seven-character
 *   tokens stay in scope and that is where the exposure would be.
 * - `^\d+f$`, a decimal with a C# `float` suffix. `docs/adr/0023` and
 *   `docs/research/2026-08-25-room-occupancy.md` quote `170000f` and `100000f`
 *   out of decompiled source.
 *
 * ## What it scans, and what it deliberately does not
 *
 * `docs/**\/*.md`, `tests/**\/*.ts`, `.github/**\/*.yml` and the markdown at
 * the repository root -- the four places this repository writes prose about its
 * own history. The workflows are in scope so that the checkout comment this
 * gate depends on is itself guarded; `AGENTS.md`, `CLAUDE.md` and `README.md`
 * carry no citation today and are scanned so that the first one is checked.
 *
 * **Comments are not stripped**, which is a deliberate departure from nearly
 * every other gate in this directory. They strip comments so that prose
 * *discussing* a mechanism is not read as the mechanism; here the prose **is**
 * the subject, and 25 of the 197 citations are inside doc comments under
 * `tests/`. Stripping would blind this gate to a quarter of its corpus,
 * including every citation in this file.
 *
 * ## What it cannot see
 *
 * - **A sha written bare, or inside a longer span.** `` `git merge-base
 *   --is-ancestor 8a5fdcc f591648` `` in `docs/adr/0029` cites two commits this
 *   gate does not read. That is the price of the narrowness measured above, and
 *   it is a missed failure rather than a false one.
 * - **A fabricated sha in an excluded shape** -- eight or more digits with no
 *   letter, or a decimal ending in `f`.
 * - **Whether a citation is *about* what the sentence says it is about.** A
 *   commit that exists is not a commit where the thing claimed happened, and
 *   nothing mechanical will ever know. This gate closes fabrication, not
 *   misattribution.
 * - **A 40-character sha belonging to another repository**, which resolves
 *   nowhere here and would be reported. None is cited in the form this gate
 *   reads today; the allowlist is where one would go, with the repository
 *   named.
 *
 * ## It bites, and it bit before any mutation
 *
 * Run against `fa12249` the publication case fails naming
 * `docs/NAVIGATION.md`, twice, for a `3d54e4b` that exists in the container
 * that wrote the sentence and on no ref this repository publishes. See
 * `UNPUBLISHED_BY_ORIGIN` for what that commit is; it is a class rather than an
 * accident, and it is the reason the publication case exists at all.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');

const CI_WORKFLOW = '.github/workflows/ci.yml';

/**
 * A commit citation: a backtick span whose *entire* content is a hexadecimal
 * run of abbreviated-to-full sha length. See "The citation form" above for why
 * the span boundaries are part of the pattern.
 */
const CITATION = /`([0-9a-f]{7,40})`/g;

/**
 * Hexadecimal by coincidence. Each entry names a class that exists in this
 * repository, not a class that might.
 */
const NOT_A_COMMIT: ReadonlyMap<RegExp, string> = new Map([
  [/^\d{8,}$/, 'an all-decimal run of eight or more: a supabase/migrations timestamp, an Actions run id, a byte count'],
  [/^\d+f$/, "a C# float literal quoted out of decompiled source in docs/adr/0023 and docs/research/2026-08-25-room-occupancy.md"],
]);

/**
 * Tokens in the citation form that truthfully name no commit.
 *
 * Every entry has to be *true as written* rather than merely tolerated. An
 * allowlist that absorbs a real fabrication is worse than no gate, because it
 * makes the fabrication look reviewed -- the argument
 * `documentation-links-contract.test.ts` spends two cases enforcing, enforced
 * here the same way.
 */
const NAMES_NO_COMMIT_BY_DESIGN: ReadonlyMap<string, string> = new Map([
  [
    'd0b6e18',
    // docs/HANDOVER-2026-08-26.md cites this twice as *the example* of a
    // fabricated sha, and says so out loud: "the `d0b6e18` above is
    // deliberately a sha that resolves to nothing, because it is the example. A
    // checker would have to exempt it". This is that exemption. Removing the
    // entry does not make the documentation better, it makes the sentence
    // unwritable.
    'the fabricated sha docs/HANDOVER-2026-08-26.md cites as its own example of one',
  ],
  [
    'ba1cba1',
    // The second fabrication, in the paragraph warning about the first. It was
    // caught before the push by running the check that paragraph recommends,
    // and the handover keeps it in prose as the record of that near miss.
    'the second fabrication docs/HANDOVER-2026-08-26.md records catching in its own draft',
  ],
  [
    'defaced',
    // documentation-version-claim-contract.test.ts explains why its escape
    // hatch requires a digit by naming two English words spelled in hex; this
    // is the one long enough to reach the citation form. It is the example of a
    // token that is not a commit, so it must not be one.
    'an English word spelled in hex, quoted by documentation-version-claim-contract.test.ts as an example of one',
  ],
]);

/**
 * Tokens that name a commit which exists somewhere but on no ref this
 * repository publishes -- so `git rev-parse` answers differently depending on
 * whose disk it runs on, and CI cannot answer at all.
 *
 * This is the residue `fetch-depth: 0` does not remove, and it has a shape.
 * `fetch-depth: 0` fetches `+refs/heads/*:refs/remotes/origin/*` and
 * `+refs/tags/*:refs/tags/*` (`getRefSpecForAllHistory` at the pinned
 * `actions/checkout` v6), plus the merge ref on a pull request. It therefore
 * fetches all history for every **published** branch and tag, and nothing
 * else: not a deleted branch, and not a commit that was never pushed.
 *
 * The second of those is a standing hazard in this repository specifically,
 * because `docs/AGENT_WORKFLOW.md` has every implementing agent work in its own
 * worktree and the coordinator **cherry-picks**. A sha an agent measures on and
 * writes down is rewritten by that cherry-pick, so the citation is dead the
 * moment it lands. That is not a hypothesis; it is the entry below.
 */
const UNPUBLISHED_BY_ORIGIN: ReadonlyMap<string, string> = new Map([
  [
    '3d54e4b',
    // `docs/NAVIGATION.md` anchors two measurements -- the frontier-heap
    // checksum comparison and the µs/expansion table -- at "`3d54e4b`
    // (v0.0.121 plus #410)". That commit is the tip of a local
    // `work/410-benchmarks` worktree branch and is on no remote: `git branch -r
    // --contains 3d54e4b` is empty. #410's work is published as `c201547`,
    // whose patch-id is identical -- git patch-id --stable reports
    // d74d25bc1b0c0116061f947dda2f850b72ec5fb2 for both -- and whose `src/`,
    // `benchmarks/` and `tooling/` trees are byte-identical to it, so the
    // measured code is published even though the tree the measurement names is
    // not.
    //
    // Re-pointing the anchor at `c201547` is deliberately NOT done here. The
    // parenthetical "(v0.0.121 plus #410)" is true of `3d54e4b` and false of
    // `c201547`, which also carries #424 and three documentation commits, and
    // re-anchoring a measurement onto a tree nobody measured on is the defect
    // this repository keeps paying for rather than a correction of it. It
    // belongs to whoever holds the numbers.
    'the tip of an unpushed work/410-benchmarks worktree branch, cited by docs/NAVIGATION.md as a measurement anchor; published equivalent c201547, same patch-id, identical src/ and benchmarks/ trees',
  ],
]);

/**
 * `git` is the authority on what a sha resolves to, and re-implementing any
 * part of that here is how this gate would become a fiction that agrees with
 * itself. A missing or failing `git` is a failure rather than a skip: every
 * checkout of this repository is a git checkout, and CI runs on one. Same rule
 * and same wording as `ci-configuration-contract.test.ts`.
 */
function git(args: readonly string[]): string {
  const result = spawnSync('git', [...args], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw new Error(`git ${args.join(' ')} could not be run: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${String(result.status)}: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

/** The full commit id a token names, or `undefined` if it names none. */
function commitFor(token: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${token}^{commit}`], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });

  if (result.error !== undefined) {
    throw new Error(`git rev-parse could not be run: ${result.error.message}`);
  }

  const stdout = result.stdout.trim();
  return stdout.length === 0 ? undefined : stdout;
}

function filesUnder(directory: string, extensions: readonly string[]): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path, extensions));
      continue;
    }
    if (extensions.some((extension) => entry.endsWith(extension))) found.push(path);
  }
  return found;
}

const scannedFiles: readonly string[] = [
  ...filesUnder(join(REPOSITORY_ROOT, 'docs'), ['.md']),
  ...filesUnder(join(REPOSITORY_ROOT, 'tests'), ['.ts']),
  ...filesUnder(join(REPOSITORY_ROOT, '.github'), ['.yml', '.yaml']),
  ...readdirSync(REPOSITORY_ROOT)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => join(REPOSITORY_ROOT, entry)),
].sort();

interface Citation {
  /** `path:line`, which is how a failure message has to read to be actionable. */
  readonly source: string;
  readonly token: string;
}

const citations: readonly Citation[] = scannedFiles.flatMap((path) => {
  const contents = readFileSync(path, 'utf8');
  const found: Citation[] = [];
  for (const match of contents.matchAll(CITATION)) {
    const token = match[1]!;
    if ([...NOT_A_COMMIT.keys()].some((shape) => shape.test(token))) continue;
    const line = contents.slice(0, match.index).split('\n').length;
    found.push({ source: `${relative(REPOSITORY_ROOT, path)}:${String(line)}`, token });
  }
  return found;
});

/** The citations this gate is answerable for: everything not allowlisted. */
const checked: readonly Citation[] = citations.filter(
  ({ token }) => !NAMES_NO_COMMIT_BY_DESIGN.has(token) && !UNPUBLISHED_BY_ORIGIN.has(token),
);

const isShallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true';

/**
 * Every commit a `fetch-depth: 0` checkout would hold: all history for every
 * branch and tag this repository publishes. `--remotes=origin` rather than
 * `--all` on purpose -- `--all` would also walk local branches, which is
 * exactly the difference between this container and CI, and a set that differs
 * between them gives a verdict that differs between them.
 */
const publishedCommits = new Set(
  git(['rev-list', '--remotes=origin', '--tags']).split('\n').filter((line) => line.length > 0),
);

describe('a commit sha cited in prose names a commit that exists', () => {
  it('runs on a checkout deep enough to answer, and fails rather than skipping when it is not', () => {
    // The whole reason this gate did not exist. A shallow checkout cannot
    // distinguish a fabricated sha from a true one, so it must not be allowed
    // to report either. `it.skipIf` here would be the "list nobody reads" the
    // handover predicted; the failure below is the alternative.
    expect(
      isShallow,
      `this checkout is shallow, so no citation can be resolved and every case below would fail for a reason that is not about the citations. ${CI_WORKFLOW} sets \`fetch-depth: 0\` on the \`verify\` job's checkout precisely so that CI is not in this state -- see the comment on that step for the cost and why it is paid. Locally: \`git fetch --unshallow\`. This is deliberately a failure and not a skip: a gate that passes on a checkout too shallow to answer manufactures confidence, which is worse than having no gate.`,
    ).toBe(false);
  });

  it('reads the depth it needs out of the workflow, so deleting the setting fails here', async () => {
    const workflow = readFileSync(join(REPOSITORY_ROOT, CI_WORKFLOW), 'utf8');
    const lines = workflow.split(/\r?\n/u);
    const jobStart = lines.indexOf('  verify:');

    expect(
      jobStart,
      `${CI_WORKFLOW} has no \`verify:\` job. That is the job that runs \`pnpm verify\` and therefore this gate; if it was renamed, rename it here in the same commit.`,
    ).toBeGreaterThanOrEqual(0);

    const body = lines.slice(jobStart + 1);
    const jobEnd = body.findIndex((line) => line.trim().length > 0 && line.search(/\S/u) <= 2);
    const jobLines = jobEnd === -1 ? body : body.slice(0, jobEnd);

    // Vacuity guard: a block parsed down to nothing would fail the assertion
    // below while blaming the workflow instead of this parser.
    expect(
      jobLines.length,
      `the \`verify:\` job in ${CI_WORKFLOW} parsed to almost no lines; the job parser here is broken.`,
    ).toBeGreaterThan(20);

    // Comments dropped first. This file's comment explains the depth at
    // length and names the setting, so a step that only *describes*
    // `fetch-depth: 0` must not be able to satisfy an assertion that it sets
    // it -- the same weakness the provisioning, version bump and deploy
    // checkout contracts in `ci-configuration-contract.test.ts` were each
    // rewritten to close.
    const settings = jobLines.filter((line) => !line.trim().startsWith('#')).map((line) => line.trim());

    expect(
      settings,
      `the \`verify\` job in ${CI_WORKFLOW} no longer checks out at \`fetch-depth: 0\`. At the action's default depth of 1 the checkout holds one commit, so every citation in \`docs/**\` and \`tests/**\` fails to resolve whether or not it is real and this gate reports the whole corpus as fabricated. Restore \`fetch-depth: 0\` on that step, and read the comment there before deciding a narrower depth is cheaper -- the deepest cited commit is 782 commits back on an 833-commit branch, so the honest choices are all of it or none of it.`,
    ).toContain('fetch-depth: 0');
  });

  it('finds citations to check, so nothing below can pass by reading nothing', () => {
    // 197 occurrences across 48 files at `fa12249`, of which 193 are checked
    // (four are allowlisted below). An order of magnitude below that: high
    // enough that an extractor which silently stopped matching fails here, low
    // enough that pruning a document does not.
    expect(scannedFiles.length).toBeGreaterThan(50);
    expect(checked.length).toBeGreaterThan(60);
  });

  it('recognises the citation form it was written for, and the shapes it must not read', () => {
    // Controls, so an edit to `CITATION` or `NOT_A_COMMIT` that stops matching
    // what this gate exists for fails here rather than silently reading less.
    // The literals are the real tokens from the corpus.
    const tokensIn = (text: string): readonly string[] =>
      [...text.matchAll(new RegExp(CITATION.source, 'g'))].map((match) => match[1]!);

    expect(tokensIn('shipped a fabricated `d0b6e18` in the very commit')).toEqual(['d0b6e18']);
    expect(tokensIn('`main` @ `8404321`')).toEqual(['8404321']);
    expect(tokensIn('the line above said `cddaebb` (v0.0.77)')).toEqual(['cddaebb']);

    // Read but then excluded by shape.
    for (const notACommit of ['20260824', '20260824140000', '32996045063', '268435456', '170000f']) {
      expect(tokensIn(`dated \`${notACommit}\``)).toEqual([notACommit]);
      expect(
        [...NOT_A_COMMIT.keys()].some((shape) => shape.test(notACommit)),
        `\`${notACommit}\` is not a commit sha and NOT_A_COMMIT no longer excludes it`,
      ).toBe(true);
    }

    // Not read at all: a sha inside a longer span, and a bare one. Both are
    // the documented blind spot, asserted so that widening the form has to
    // come here and say so.
    expect(tokensIn('`git merge-base --is-ancestor 8a5fdcc f591648` succeeds')).toEqual([]);
    expect(tokensIn('Measured on 8dc95eb with no span at all')).toEqual([]);
  });

  it('resolves every cited commit', () => {
    const fabricated = checked
      .filter(({ token }) => commitFor(token) === undefined)
      .map(({ source, token }) => `${source} -> ${token}`);

    expect(
      fabricated,
      `these cite a commit that does not exist in this repository. A sha is how a claim about a tree stops expiring, so a sha that names nothing is a claim that can never be checked -- and \`git cat-file -e <sha>^{commit}\` before writing one is two seconds. If a citation is real but unreachable from any published branch or tag, it belongs in UNPUBLISHED_BY_ORIGIN with the reason, not here`,
    ).toEqual([]);
  });

  it('cites only commits this repository publishes, so CI reads the same history a reader can', () => {
    // Vacuity guard, and the one case where a small answer is the parser's
    // fault rather than the corpus's: with no `refs/remotes/origin/*` the set
    // below is empty and every citation reads as unpublished.
    expect(
      publishedCommits.size,
      `\`git rev-list --remotes=origin --tags\` found almost no commits, so the check below would report the entire corpus as unpublished. Either this checkout is shallow (see the first case), or it has no \`refs/remotes/origin/*\` -- a \`git init\` plus a single-ref fetch, or a remote under another name. \`git remote -v\` and \`git fetch origin\` first.`,
    ).toBeGreaterThan(500);

    const unpublished = checked
      .filter(({ token }) => {
        const commit = commitFor(token);
        return commit !== undefined && !publishedCommits.has(commit);
      })
      .map(({ source, token }) => `${source} -> ${token}`);

    expect(
      unpublished,
      `these cite a commit that exists on this disk and on no ref this repository publishes, so nobody else can check them and CI cannot either: \`fetch-depth: 0\` fetches all history for every published branch and tag and nothing more. The usual cause is a sha read out of an agent's own worktree before the coordinator cherry-picked it, which rewrites it -- \`git branch -r --contains <sha>\` tells you. Cite the commit as published, or record it in UNPUBLISHED_BY_ORIGIN with what it is and why the anchor cannot move`,
    ).toEqual([]);
  });

  it('keeps the allowlists honest: an entry that starts resolving must be removed', () => {
    const nowResolving = [...NAMES_NO_COMMIT_BY_DESIGN.keys()].filter(
      (token) => commitFor(token) !== undefined,
    );

    expect(
      nowResolving,
      `these are allowlisted as naming no commit and now name one. Either history grew a commit whose abbreviation collides with the example -- in which case the documentation needs a different example, because a sentence about a sha that resolves to nothing has stopped being one -- or the entry was wrong. Do not widen the reason to cover it`,
    ).toEqual([]);

    const nowPublished = [...UNPUBLISHED_BY_ORIGIN.keys()].filter((token) => {
      const commit = commitFor(token);
      return commit !== undefined && publishedCommits.has(commit);
    });

    expect(
      nowPublished,
      `these are allowlisted as unpublished and are now reachable from a published branch or tag, so the citation is checkable and the entry is what is now false. Remove it`,
    ).toEqual([]);
  });

  it('keeps the allowlists used: an entry nothing cites is dead weight', () => {
    const cited = new Set(citations.map(({ token }) => token));
    const uncited = [...NAMES_NO_COMMIT_BY_DESIGN.keys(), ...UNPUBLISHED_BY_ORIGIN.keys()].filter(
      (token) => !cited.has(token),
    );

    expect(
      uncited,
      `these allowlist entries are cited by nothing this gate scans. An exemption for a citation that no longer exists is an exemption waiting to cover a different one`,
    ).toEqual([]);
  });
});
