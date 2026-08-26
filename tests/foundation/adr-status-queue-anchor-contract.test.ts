import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `docs/adr/STATUS-QUEUE.md` says which commit it was re-read at. This checks
 * that it says so once, and that it has not stopped saying anything true.
 *
 * ## The defect
 *
 * That file's own introduction calls it a live claim about `main`: *"an entry's
 * evidence is a claim about `main`, so landing the change an entry describes
 * means updating that entry in the same commit"*. It opens with a
 * re-anchoring line naming a commit and a version, and everything below it is
 * warranted by that line.
 *
 * The line stopped moving. It read `4e3976d` (v0.0.65) while `package.json`
 * shipped 0.0.76 — eleven releases — and two of the commits in between had
 * edited the file's §5 without touching it, so the declared anchor was older
 * than parts of the document it anchored. Underneath, five entries in §§3-5
 * said "re-verified at `4ed571f`", which is v0.0.58: a **second** anchor, seven
 * releases older again, in the same file. A reader had two dates and no way to
 * tell which entry belonged to which, which is the exact failure the file
 * exists to prevent in the rest of the corpus.
 *
 * ## What this can and cannot assert, stated because a green `toEqual` here
 * reads like more than it is
 *
 * **It cannot tell whether a sentence in that file is true.** Nothing
 * mechanical can: the file compares decisions to implementations, and that is a
 * human reading evidence. `adr-numbering-contract.test.ts` says so in its own
 * header and it is still right.
 *
 * What it asserts is narrower and is the half that actually failed:
 *
 * 1. **The file declares exactly one anchor.** One re-anchoring line, and every
 *    "verified at `<sha>`" elsewhere in the file names either that same commit
 *    or a commit the sentence is explicitly quoting as *history* (the past-tense
 *    form `read … re-verified at`, which records what a superseded entry used
 *    to claim). Two live anchors is the defect above and it is caught outright.
 * 2. **The anchor has not fallen far behind the release the tree ships.** A
 *    staleness budget, not an equality check — see below.
 *
 * ## Why a budget rather than `anchorVersion === packageVersion`
 *
 * Because equality would be red on `main` permanently and would be deleted
 * within a week, which is worse than no gate. `.github/workflows/version.yml`
 * bumps `package.json` in a commit of its own *after* every merge, and that
 * commit starts no CI run. So the very next pull request would open on a tree
 * whose version is one ahead of any anchor, fail a check it did not cause, and
 * teach everyone that this file's gate is noise. A gate that fires on work it
 * has no complaint about does not survive.
 *
 * `ANCHOR_STALENESS_BUDGET_RELEASES` is therefore a bound on unreviewed
 * history rather than a demand for freshness. It is **10**, chosen against the
 * failure that actually happened rather than from taste: the header lagged by
 * 11 and the body by 18, so 10 is the largest round number that would have
 * fired before either became a defect, and it leaves ten merges of ordinary
 * work untouched. Raising it is a decision to re-read that file less often and
 * should be argued for in the commit that raises it.
 *
 * **When it fires, the fix is to re-read the file, not to edit this number.**
 * Moving the anchor without re-reading §§3-6 is the thing this test is trying
 * to make visible, and it would pass — that is the honest boundary, and it is
 * why the failure message says what work the number stands for.
 *
 * ## It bites, and it is not vacuous
 *
 * Proved by three controls run against the tree that landed it, not asserted:
 *
 * - Restoring the header to `4e3976d` (v0.0.65) fails the budget with *"11
 *   releases of history that no entry in that file has been read against"*, and
 *   fails the single-anchor case too, because the body then names a commit the
 *   header does not.
 * - Restoring one body sentence to *"re-verified at `4ed571f`"* fails the
 *   single-anchor case alone, naming that sentence. This is the exact defect
 *   that was on `main`.
 * - Rewording the anchor line to *"Anchored to main at commit `5044f59`"* fails
 *   **all four** cases rather than passing three of them by reading nothing.
 *   A scanner that stops matching must fail, or the other assertions are a
 *   green light for an empty file.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const STATUS_QUEUE_PATH = join(REPOSITORY_ROOT, 'docs/adr/STATUS-QUEUE.md');
const PACKAGE_JSON_PATH = join(REPOSITORY_ROOT, 'package.json');

/** See the header. A bound on unreviewed history, not a freshness requirement. */
const ANCHOR_STALENESS_BUDGET_RELEASES = 10;

/**
 * The re-anchoring line: a short commit sha and the version it shipped.
 *
 * Anchored on the words "Re-anchored at" so the pattern cannot start matching
 * some other sentence that happens to hold a sha and a version, and written to
 * tolerate the emphasis the file puts on the version (`**v0.0.76**`), because
 * requiring bare text would make a formatting edit look like a missing anchor.
 */
const ANCHOR_LINE = /Re-anchored at `main` @ `([0-9a-f]{7,40})`\s*\(\*{0,2}v(\d+\.\d+\.\d+)\*{0,2}\)/g;

/**
 * A sentence claiming something was checked at a commit.
 *
 * Deliberately broad on the verb — `verified`, `re-verified`, `stays verified`
 * — because the point is to find every live claim of the shape "this was true
 * at X", not to police one wording.
 */
const VERIFIED_AT = /((?:re-)?verified) at `([0-9a-f]{7,40})`/gi;

/**
 * The same claim in the past tense, which is a record rather than a claim.
 *
 * `§5` keeps entries reading *"This entry read '…', re-verified at `4ed571f`"*:
 * the sha there is part of the history being corrected, and rewriting it would
 * destroy the record. The same exemption `adr-status-reference-contract.test.ts`
 * grants past-tense status claims, for the same reason.
 */
const HISTORICAL_CLAIM = /\b(?:read|used to|had|was)\b[^.]{0,400}?(?:re-)?verified at `[0-9a-f]{7,40}`/gis;

function patchReleasesBetween(anchor: string, shipped: string): number {
  const [anchorMajor, anchorMinor, anchorPatch] = anchor.split('.').map(Number) as [number, number, number];
  const [shippedMajor, shippedMinor, shippedPatch] = shipped.split('.').map(Number) as [number, number, number];
  // Only comparable inside one minor line. A major or minor bump is a
  // different question and is reported as such rather than folded into a
  // patch count that would be meaningless.
  if (anchorMajor !== shippedMajor || anchorMinor !== shippedMinor) return Number.POSITIVE_INFINITY;
  return shippedPatch - anchorPatch;
}

describe('docs/adr/STATUS-QUEUE.md: the anchor it declares', () => {
  const statusQueue = readFileSync(STATUS_QUEUE_PATH, 'utf8');
  const packageVersion = (JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as { version: string }).version;

  const anchors = [...statusQueue.matchAll(ANCHOR_LINE)];

  it('declares exactly one re-anchoring line', () => {
    // Non-vacuous in both directions: zero matches means the line was reworded
    // past this pattern and every assertion below would otherwise pass by
    // reading nothing, which is the shape of gate this repository refuses.
    expect(
      anchors.map((match) => `${match[1]!} (v${match[2]!})`),
      'STATUS-QUEUE.md must open with exactly one "Re-anchored at `main` @ `<sha>` (v<version>)" line; that line is what warrants every claim below it',
    ).toHaveLength(1);
  });

  it('names one commit throughout, so no entry is warranted by a different anchor than the header', () => {
    const anchorSha = anchors[0]![1]!;

    const historicalSpans = [...statusQueue.matchAll(HISTORICAL_CLAIM)].map((match) => [
      match.index!,
      match.index! + match[0].length,
    ] as const);

    const liveClaimsAtAnotherCommit = [...statusQueue.matchAll(VERIFIED_AT)]
      .filter((match) => !match[2]!.startsWith(anchorSha) && !anchorSha.startsWith(match[2]!))
      .filter((match) => !historicalSpans.some(([from, to]) => match.index! >= from && match.index! < to))
      .map((match) => match[0]);

    expect(
      liveClaimsAtAnotherCommit,
      `every live "verified at" in STATUS-QUEUE.md must name the anchor commit (${anchorSha}). A second commit means part of the file was checked on a different tree than the header claims, which is how it came to carry two anchors seven releases apart. Past-tense records of what a superseded entry used to claim are exempt`,
    ).toEqual([]);
  });

  it('has not fallen more than the staleness budget behind the shipped release', () => {
    const anchorVersion = anchors[0]![2]!;
    const behind = patchReleasesBetween(anchorVersion, packageVersion);

    expect(
      behind,
      `STATUS-QUEUE.md is anchored at v${anchorVersion} and package.json ships ${packageVersion}: ${String(behind)} releases of history that no entry in that file has been read against. Re-read §§3-6 against main and move the anchor — do not raise ANCHOR_STALENESS_BUDGET_RELEASES to make this pass, because the number is what the budget is for`,
    ).toBeLessThanOrEqual(ANCHOR_STALENESS_BUDGET_RELEASES);
  });

  it('is not anchored ahead of the tree, which would mean it cites a commit that does not exist here', () => {
    const anchorVersion = anchors[0]![2]!;
    expect(
      patchReleasesBetween(anchorVersion, packageVersion),
      `STATUS-QUEUE.md claims to be anchored at v${anchorVersion} while package.json ships ${packageVersion}`,
    ).toBeGreaterThanOrEqual(0);
  });
});
