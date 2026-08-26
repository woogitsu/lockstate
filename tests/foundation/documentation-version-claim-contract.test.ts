import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A version written into prose must name the tree it belongs to.
 *
 * ## The defect
 *
 * `docs/HANDOVER-2026-08-26.md:15` said *"`main` is at **v0.0.109**"*. It was
 * false at the commit that added it: `git show f84db43:package.json` reads
 * `0.0.110`, because #399 merged and took its release commit at 19:43:55 while
 * the file was being drafted and `f84db43` landed at 19:46:21. One release
 * stale before it was ever pushed -- not rot, false on arrival. That file's own
 * second paragraph calls a documentation claim that disagrees with the code
 * this repository's most common defect, and names *"a claim can be false the
 * day it is written"* as the sharpest form of it. #417 is that form, in the
 * document that named it.
 *
 * ## Why a gate rather than one more correction
 *
 * Because the cause is mechanical and it will do it again.
 * `.github/workflows/version.yml` bumps the patch on **every** push to `main`.
 * So a sentence stating a bare version is falsified by its own merge, and the
 * author cannot prevent it by being careful: the bump happens after review, in
 * a commit nobody writes. Correcting the sentence without removing the
 * mechanism buys one release.
 *
 * ## The rule
 *
 * A version token in `docs/**` must **name its tree or already be history**:
 *
 * 1. **No document says of `main`, the tree or the repository that it *is* at a
 *    version.** `` `main` is at v0.0.109 ``, `the repository is now v0.0.109`.
 *    This is the sentence #417 is about, and its close paraphrases. Dating a
 *    finding to a release -- `measured at v0.0.104`, `seven deferrals remain at
 *    v0.0.112` -- is not this shape and is what documentation should do.
 * 2. **A version not bound to a commit is strictly older than the release
 *    `package.json` ships.** Writing today's number is what goes stale; writing
 *    a number that is already history cannot.
 *
 * The escape hatch for both is the same and it is the pattern
 * `docs/adr/STATUS-QUEUE.md` already established: **put the commit in the
 * sentence.** `Re-anchored at `main` @ `8d29aa6` (v0.0.111)` is exempt, and so
 * is `` `4ed571f` is v0.0.58 `` -- a version beside a sha identifies a tree and
 * cannot rot, because the tree it names does not change. That is why this gate
 * needs no allowlist: there is nothing to exempt by name, so there is no
 * allowlist to go stale, which is the failure mode
 * `documentation-links-contract.test.ts` has to spend two cases guarding
 * against.
 *
 * ## What happens to this gate at the merge boundary, stated because the
 * anchor gate's answer is different and the difference is the point
 *
 * `adr-status-queue-anchor-contract.test.ts` compares an anchor against
 * `package.json` with a two-sided budget, so a version bump pushes it *towards*
 * red. That is not hypothetical: CI run `32996045063` on `f84db43` -- the merge
 * that added the handover -- failed on exactly that case, *"anchored at v0.0.98
 * and package.json ships 0.0.110: 12 releases"*, for a file the pull request
 * never touched. `main` was red across #399, #400 and #401, and the Deploy
 * workflow gates on `github.event.workflow_run.conclusion == 'success'`.
 *
 * **This gate cannot do that, by construction.** Case 2 is one-sided: it asks
 * that a token be *older* than the shipped version, and a patch bump only makes
 * an older version older. Case 1 does not read `package.json` at all. So the
 * comparison is monotone under `version.yml`: a tree that is green here stays
 * green here through any number of bumps, and no merge can turn `main` red for
 * a document nobody edited. The only way to fail is to write a version claim
 * that is wrong when you write it, on the branch that writes it -- which is the
 * pull request that can fix it.
 *
 * ## What it cannot see
 *
 * **It cannot tell whether a version claim is true.** `measured at v0.0.104`
 * may name a release at which nothing of the sort was measured, and nothing
 * mechanical will ever know. Case 1 enumerates a closed class of subjects and a
 * closed class of verbs, and a novel phrasing evades it; case 2 is the
 * load-bearing half precisely because it needs no grammar. Only the `v` form is
 * scanned -- every one of the 58 version tokens in `docs/` on this repository's
 * own release line at `de4edb5` writes it, and matching bare dotted triples
 * would collide with `pgTAP 1.3.4` and `pnpm 11.22.0`.
 * Tokens outside the shipped major.minor line are out of scope, the same
 * restriction and the same reason as the anchor gate's `patchReleasesBetween`.
 *
 * ## It bites
 *
 * Run against `origin/main` **before** the handover was corrected, case 1 fails
 * naming `docs/HANDOVER-2026-08-26.md:15`. It is not a synthetic mutation: the
 * tree this gate was written on was red under it. Case 2 was proved the other
 * way, by moving one dated measurement in `docs/DETERMINISM.md:102` onto the
 * shipped release: red as `docs/DETERMINISM.md:102 -> v0.0.114`, and green
 * again when the same sentence names the commit it was measured at.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const DOCS_ROOT = join(REPOSITORY_ROOT, 'docs');
const PACKAGE_JSON_PATH = join(REPOSITORY_ROOT, 'package.json');

/**
 * A version token as this repository writes one. The `v` prefix is required:
 * see "What it cannot see".
 */
const VERSION_TOKEN = /v(\d+)\.(\d+)\.(\d+)/g;

/**
 * A present-tense claim that *the tree* is at a version.
 *
 * The subject is what makes this the defect, not the verb. *"measured at
 * v0.0.104"*, *"seven deferrals remain at v0.0.112"* and *"the next merge ships
 * v0.0.109"* all date a finding to a release and are exactly what documentation
 * should do; *"`main` is at v0.0.109"* asserts the state of the repository and
 * is the only one of the four that a merge falsifies. An earlier draft of this
 * pattern keyed on the verb alone and flagged all four -- the three legitimate
 * ones live in `docs/research/2026-08-26-repository-audit.md` and
 * `docs/research/audit-2026-08-26/00-lead-verification.md`, which landed while
 * #417 was being written, so the over-broad version was caught by the corpus
 * rather than by taste.
 *
 * The subject list is closed and so is the verb list, which is the honest limit:
 * *"we are on v0.0.109"* or *"the release in flight is v0.0.109"* would evade
 * it. Case 2 is the half that needs no grammar.
 */
const STATES_A_VERSION =
  /\b(?:`?main`?|`?origin\/main`?|HEAD|the tree|the repository|this repository|the project|the current release|the current version|the shipped release|the shipped version|`?package\.json`?)\b[^.\n]{0,30}?\b(?:is|are|'s|sits?|stands?|remains?|ships?|shipping|runs|running)\b(?:\s+(?:now|currently|still|already|at|on|@))*\s*\*{0,2}v\d+\.\d+\.\d+/gi;

/**
 * A commit sha in the same sentence, which binds the version to a tree.
 *
 * Backticked or bare, because `docs/adr/0028-...:1128` writes *"Measured on
 * `main` at **9d0a125, v0.0.73**"* with the sha inside the emphasis rather than
 * in code spans. One digit is required, so an ordinary word spelled in hex
 * characters -- `defaced`, `accede` -- cannot pass for a commit.
 *
 * **A letter is deliberately not required, and the cost is stated.** Requiring
 * one was tried and rejected: `8404321`, the head of `main` this gate was
 * written against, is seven digits with no letter, so the escape hatch would
 * have refused the very commit a correction wanted to cite. The price is that a
 * long decimal in the same sentence -- a CI run id such as `32996045063` --
 * reads as a sha and would vouch for a version beside it. That is a missed
 * failure rather than a false one, and it is the right way round: a gate that
 * fires on work it has no complaint about does not survive, which
 * `adr-status-queue-anchor-contract.test.ts` argues at length for its own
 * budget and is equally true here.
 */
const COMMIT_SHA = /\b(?=[0-9a-f]{7,40}\b)[0-9a-f]*\d[0-9a-f]*\b/;

/**
 * How far a sentence may reach for its sha. A hard cap as well as a boundary
 * search, so that a paragraph without terminal punctuation cannot let a sha
 * eight sentences away vouch for a version.
 */
const SENTENCE_REACH = 400;

function markdownFilesUnder(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...markdownFilesUnder(path));
    else if (path.endsWith('.md')) found.push(path);
  }
  return found.sort();
}

/**
 * The sentence a token sits in: back to the previous sentence end or blank
 * line, forward to the next, and never further than `SENTENCE_REACH`.
 */
function sentenceAround(source: string, index: number): string {
  const from = Math.max(0, index - SENTENCE_REACH);
  const before = source.slice(from, index);
  const startOffsets = [...before.matchAll(/[.!?]\s|\n\s*\n/g)].map((match) => match.index! + match[0].length);
  const start = from + (startOffsets.at(-1) ?? 0);

  const after = source.slice(index, Math.min(source.length, index + SENTENCE_REACH));
  const endMatch = /[.!?]\s|\n\s*\n/.exec(after);
  const end = index + (endMatch === null ? after.length : endMatch.index + endMatch[0].length);

  return source.slice(start, end);
}

interface VersionClaim {
  readonly source: string;
  readonly token: string;
  readonly patch: number;
  readonly sentence: string;
  readonly namesACommit: boolean;
}

const shippedVersion = (JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as { version: string }).version;
const [shippedMajor, shippedMinor, shippedPatch] = shippedVersion.split('.').map(Number) as [number, number, number];

const claims: readonly VersionClaim[] = markdownFilesUnder(DOCS_ROOT).flatMap((path) => {
  const source = readFileSync(path, 'utf8');
  const found: VersionClaim[] = [];
  for (const match of source.matchAll(VERSION_TOKEN)) {
    const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
    // Another release line is a different question, not a stale claim about
    // this one -- and `node v24.19.0` is not a claim about this repository.
    if (major !== shippedMajor || minor !== shippedMinor) continue;
    const line = source.slice(0, match.index).split('\n').length;
    const sentence = sentenceAround(source, match.index);
    found.push({
      source: `${relative(REPOSITORY_ROOT, path)}:${String(line)}`,
      token: match[0],
      patch,
      sentence,
      namesACommit: COMMIT_SHA.test(sentence.replaceAll(VERSION_TOKEN, ' ')),
    });
  }
  return found;
});

describe('a version written into documentation names the tree it belongs to', () => {
  it('finds version claims to check, so nothing below can pass by reading nothing', () => {
    // 58 across `docs/**` at `de4edb5` with this change applied. A quarter of
    // that is low enough that pruning a document does not fail this, high
    // enough that an extractor which stopped matching does.
    expect(claims.length).toBeGreaterThan(15);
  });

  it('does not exempt every claim, so the commit-sha escape hatch cannot swallow the check', () => {
    // 32 of those 58 name no commit and are therefore checked by the staleness
    // case below. If `COMMIT_SHA` widened until everything looked anchored,
    // that case would read nothing and this fails instead.
    expect(claims.filter(({ namesACommit }) => !namesACommit).length).toBeGreaterThan(5);
  });

  it('recognises the sentence this gate was written for, so the pattern cannot rot silently', () => {
    // The literal from `docs/HANDOVER-2026-08-26.md:15` before #417 corrected
    // it. A pattern edit that stops matching this has stopped being the gate.
    expect(new RegExp(STATES_A_VERSION.source, 'i').test('`main` is at **v0.0.109**.')).toBe(true);
  });

  it('says of no tree that it is at a version, which is the claim the next merge falsifies', () => {
    const stated = claims
      .filter(({ namesACommit }) => !namesACommit)
      .filter(({ sentence }) => new RegExp(STATES_A_VERSION.source, 'gi').test(sentence))
      .map(({ source, token }) => `${source} -> ${token}`);

    expect(
      stated,
      `these say the repository is at a version, and .github/workflows/version.yml bumps the patch on every push to main, so each is falsified by its own merge. Either drop the number or name the commit it belongs to -- a version beside a sha identifies a tree and cannot rot`,
    ).toEqual([]);
  });

  it('writes no version that is not already history, unless it names a commit', () => {
    const notYetHistory = claims
      .filter(({ namesACommit }) => !namesACommit)
      .filter(({ patch }) => patch >= shippedPatch)
      .map(({ source, token }) => `${source} -> ${token}`);

    expect(
      notYetHistory,
      `package.json ships ${shippedVersion}, so these name the current release or a future one with no commit to fix them to. The next push to main bumps the patch and they become claims about a tree that is no longer there. Name the commit you read it at`,
    ).toEqual([]);
  });
});
