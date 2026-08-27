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
 * Run against `fa12249` the publication case failed naming
 * `docs/NAVIGATION.md`, twice, for a sha that existed in the container that
 * wrote the sentence and on no ref this repository publishes: the tip of an
 * unpushed agent worktree branch, which the coordinator's cherry-pick had
 * already rewritten into a different commit. Both anchors now name the
 * published commit, whose measured trees are byte-identical, and that document
 * says beside them what the difference is.
 *
 * The token itself is deliberately not written here. Citing a dead sha to
 * explain why dead shas are bad would make this comment the ninth failure of
 * its own gate -- and it would be a real failure, not a false one, because a
 * reader cannot resolve it either. See `UNPUBLISHED_BY_ORIGIN` for the class;
 * it is a class rather than an accident, and it is the reason the publication
 * case exists at all.
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
  // Empty, and that is a state to defend rather than a gap.
  //
  // It held one entry when this gate first ran: `docs/NAVIGATION.md` anchored
  // both of its frontier-heap measurements at a commit that existed on this
  // disk and on no remote -- the tip of an unpushed `work/410-benchmarks`
  // worktree branch, cited as "(v0.0.121 plus #410)". The measurements were
  // real; the sha nobody else could resolve was the problem.
  //
  // It was settled by naming the published commit whose *measured* trees are
  // the same trees, rather than by allowlisting the unreachable one: `c201547`
  // has an identical subject and byte-identical `src/`, `benchmarks/` and
  // `tooling/`, which are the only trees a navigation benchmark reads, and
  // `docs/NAVIGATION.md` now says so in a note beside the anchor including what
  // else `c201547` carries that the worktree commit did not. That is the shape
  // an entry here should be pushed into before it is written: an allowlist
  // entry preserves a citation nobody can check, and this gate exists because
  // of citations nobody can check.
  //
  // What the class is, since it will recur: `docs/AGENT_WORKFLOW.md`'s
  // worktree-and-cherry-pick method rewrites every commit it lands, so any sha
  // an agent reads out of its own worktree and writes into a document is dead
  // the moment the coordinator picks it. `git branch -r --contains <sha>` is
  // the check. Add an entry only when the anchor genuinely cannot move -- and
  // say why it cannot, not merely that it does not.
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

/**
 * Memoised, because this gate gets slower every time the repository does the
 * thing it exists to encourage.
 *
 * Each lookup is a `git rev-parse` subprocess, four of the tests below call
 * this over the whole corpus, and the corpus only grows -- a citation is how a
 * claim about a tree stops expiring, so writing more of them is correct and
 * each one used to cost four processes. Measured on the container that found
 * this: adding three citations in one change took `resolves every cited commit`
 * from inside Vitest's 5s budget to 5.66s, and the file's own duration was
 * already 7.9s for eight tests. That is a gate failing for a reason that has
 * nothing to do with what it checks.
 *
 * A `Map` rather than a raised timeout, because the timeout would have to be
 * raised again: `docs/AGENT_WORKFLOW.md` warns against raising a timeout to
 * hide a problem, and the problem here is repeated identical work. The
 * resolution is a pure function of the token and the checked-out repository,
 * neither of which changes during a run, so caching it changes no answer --
 * `undefined` is cached too, since a fabricated sha is exactly the token the
 * four tests ask about most.
 *
 * ## And a batch, because the `Map` only removed three of the four passes
 *
 * The `Map` turned 4N subprocesses into N. N is still one subprocess per
 * distinct token and it still grows with the corpus, so the cost did not stop
 * scaling -- it got a constant factor. Re-measured on an idle container after
 * the `Map` landed, `--reporter=verbose`:
 *
 * ```
 * npx vitest run tests/foundation/documentation-commit-citation-contract.test.ts
 *   resolves every cited commit                            564 ms
 * npx vitest run tests/foundation/          # 31 files, the load that matters
 *   resolves every cited commit             1913 / 2792 / 2073 ms, three runs
 * ```
 *
 * Solo is comfortable; **under directory scope one case was spending 38-56% of
 * `vitest.config.ts`'s 5,000 ms `testTimeout` on process startup**, on an idle
 * machine, and the marginal citation costs about 26 ms of that budget. This
 * gate exists to make writing citations cheap, so a design where the corpus
 * growing walks a case back into a timeout is the wrong shape however far away
 * the wall currently is.
 *
 * So `resolveTokens` asks once for everything. `git cat-file --batch-check`
 * reads revisions on stdin and answers one line per input line:
 * `<oid> <type> <size>` when the revision resolves, or the input echoed back
 * with a single word (`missing`, `ambiguous`) when it does not. `^{commit}`
 * peels inside it, so a token naming a tree is `missing` there exactly as
 * `git rev-parse --verify --quiet <token>^{commit}` exits non-zero for it.
 *
 * `git` is still the only authority on what a sha resolves to, which is the
 * rule stated on `git` above and the reason the two mechanisms were run
 * against each other before the swap rather than reasoned about: the whole
 * corpus, plus the shapes around its edges -- `HEAD`, a tag name, an
 * abbreviated and a full tree id, an all-zero abbreviation, a non-hexadecimal
 * run, the empty string. **Zero disagreements**, twice: at `b710c62`, 74
 * distinct tokens, and again at `4ae2e39`, 76. The token count is the moving
 * part -- it is `checked.length` plus the allowlists, and the case below
 * asserts only a floor on it for that reason -- so what is worth re-running is
 * the comparison, not the number:
 *
 * ```
 * # the same distinct tokens through both mechanisms, outside Vitest.
 * # At 4ae2e39, 76 of them:
 * git rev-parse --verify --quiet <token>^{commit}, in a loop   1418 ms
 * git cat-file --batch-check, one process                        22 ms
 * ```
 *
 * (Those probes are described rather than quoted on purpose: an all-zero
 * seven-character run written in the citation form *is* a citation, and this
 * gate correctly failed on the first draft of this comment for exactly that. A
 * file that scans itself has to write about shas the way it asks every other
 * file to.)
 */
const commitCache = new Map<string, string | undefined>();

/**
 * Resolve tokens against `git` and record the answers, at one process for the
 * whole batch. See the comment on `commitCache` for the mechanism and what it
 * was checked against.
 */
function resolveTokens(tokens: readonly string[]): void {
  const pending = [...new Set(tokens)].filter((token) => !commitCache.has(token));
  if (pending.length === 0) return;

  const result = spawnSync('git', ['cat-file', '--batch-check'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    input: `${pending.map((token) => `${token}^{commit}`).join('\n')}\n`,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw new Error(`git cat-file --batch-check could not be run: ${result.error.message}`);
  }

  const lines = result.stdout.split('\n').filter((line) => line.length > 0);

  // Answers are paired with inputs **by position**, which is the one way this
  // could go quietly wrong: a line count that did not match would attribute
  // every verdict to the wrong token, and the corpus would still look checked.
  // So it is a failure and not a repair. `--batch-check` answers one line per
  // input line even for a revision it cannot resolve, so the only routes here
  // are a token carrying whitespace and a `git` not behaving as documented.
  if (lines.length !== pending.length) {
    throw new Error(
      `git cat-file --batch-check answered ${String(lines.length)} lines for ${String(pending.length)} revisions. This code pairs answers with inputs by position, so a mismatch means every verdict below would be attributed to the wrong token; refusing to report one. Look for a citation token containing whitespace.`,
    );
  }

  pending.forEach((token, index) => {
    const fields = lines[index]!.split(' ');
    commitCache.set(token, fields.length === 3 && fields[1] === 'commit' ? fields[0]! : undefined);
  });
}

/** The full commit id a token names, or `undefined` if it names none. */
function commitFor(token: string): string | undefined {
  if (!commitCache.has(token)) resolveTokens([token]);
  return commitCache.get(token);
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

// Everything any case below will ask about, resolved here: collection time,
// which is outside every per-case timeout, in one process. The allowlist keys
// are included because `keeps the allowlists honest` resolves those too, and
// `resolveTokens` de-duplicates, so a token that is both cited and allowlisted
// is asked about once. `commitFor` still answers for a token that is not in
// this set -- it just spawns to do it, which is what this line exists to stop
// being the normal case rather than something it forbids.
resolveTokens([
  ...citations.map(({ token }) => token),
  ...NAMES_NO_COMMIT_BY_DESIGN.keys(),
  ...UNPUBLISHED_BY_ORIGIN.keys(),
]);

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
