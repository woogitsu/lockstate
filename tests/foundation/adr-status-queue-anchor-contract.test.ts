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
const INDEX_PATH = join(REPOSITORY_ROOT, 'docs/adr/README.md');

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

/**
 * A dated pass's opening clause: "<label> at `<sha>` (v<version>)", e.g.
 * "**THIRTY-NINE at `708b68c7` (v0.0.377), five releases later**". Every
 * re-derivation in §§3-6 opens this way, and it is how a reader tells which
 * commit a given paragraph's counts were taken against.
 *
 * Deliberately unanchored on what precedes "at" — the label varies ("Still
 * THIRTY-FOUR", "THIRTY-NINE is FORTY", a bare count) and is not the part
 * this pattern needs.
 */
const PASS_MARKER = /at `([0-9a-f]{7,40})`\s*\(\*{0,2}v(\d+\.\d+\.\d+)\*{0,2}\)/g;

/**
 * A restatement of `docs/adr/README.md`'s "Next free number" line, inside
 * `STATUS-QUEUE.md`'s own prose.
 *
 * Tolerant of `\s` between every word on purpose: this file's paragraphs are
 * hand-wrapped, and "Next free" ends one line while "number: 0094" opens the
 * next at least twice in the current text (`:6303-6304`, `:6162-6163`). A
 * pattern that required a literal space there would silently stop seeing a
 * restatement the moment prose reflowed across that exact join — which is
 * the opposite of what this test is for. (`ANCHOR_LINE` above tolerates the
 * same thing for the same reason; it is not a coincidence that both patterns
 * need it, since both read paragraphs a human keeps re-wrapping.)
 */
const NEXT_FREE_RESTATEMENT = /Next\s+free\s+number:?\s*\*{0,2}(\d{4})/gi;

/** `**Next free number: 0024.**` in `docs/adr/README.md` — the ground truth
 *  `adr-numbering-contract.test.ts` already keeps honest as `max + 1` off
 *  disk. This file borrows that answer rather than recomputing it. */
const INDEX_NEXT_FREE_NUMBER = /\*\*Next free number:\s*(\d{4})\.?\*\*/u;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

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

/**
 * `STATUS-QUEUE.md` restates `docs/adr/README.md`'s "Next free number" line
 * in its own prose, more than once, because that is the number a reader
 * drafting an ADR is most likely to copy out of this file rather than out of
 * the index. Nothing checked those restatements: a mutation that changed the
 * file's own live restatement from 0094 to 0093 — flatly contradicting the
 * index, which is right — left the whole of `tests/foundation/` green,
 * because `adr-numbering-contract.test.ts` reads the index's line and never
 * looks at this file at all.
 *
 * ## Why this is not `expect(everyRestatement).toBe(indexValue)`
 *
 * `STATUS-QUEUE.md` is a chronological log, not a snapshot: each dated pass
 * re-derives the count that mattered *at that commit* and keeps the previous
 * pass's paragraph standing rather than overwriting it (`docs/AGENT_WORKFLOW.md`
 * §4, "mark both directions"). So the same "Next free number" sentence shape
 * legitimately holds 0069, 0070, 0074, …, 0092 at various points in this file
 * today, each correct about an older commit's tree and none of them wrong. A
 * rule that forced every restatement to equal the index's *current* value
 * would fail on all of that kept history — the exact trap this test's own
 * docblock above already names for `Re-anchored at` — and the fix would be
 * to either edit history this file exists to keep, or delete the finding
 * that started this test.
 *
 * ## The mechanism this borrows, and the one it does not
 *
 * The obvious move is to reuse `HISTORICAL_CLAIM` above verbatim: it already
 * tells a live "Re-anchored at" from a kept one by requiring the kept copy to
 * sit inside a past-tense wrapper — `*"…It read: 'Re-anchored at `main` @
 * …'"*`. **That wrapper does not exist here.** Every kept "Next free number"
 * sentence in this file is ordinary present-tense narrative written when it
 * was true — `"…and **Next free number: 0092** unmoved."` — not a quoted,
 * past-tense record the way a superseded anchor line is. Requiring that
 * wrapper would mean rewording this file until the pattern stopped seeing
 * most of its own restatements, which is the forbidden move stated in the
 * brief this test was written against: silencing the scan loses the
 * property it protects, it does not close the gap.
 *
 * A value-based rule fails for a sharper reason and was tried and rejected
 * first: **the "Next free number" this file states never decreases as the
 * file goes on**, so "does this restatement equal the highest value stated
 * anywhere in the file" looks like it would work. It does not, because the
 * exact mutation this test exists for — changing a live restatement to a
 * *smaller* wrong number — removes that restatement from "the highest value
 * stated anywhere" by construction. A classifier that decides "is this claim
 * live" by inspecting the very value the claim states cannot catch a
 * mutation of that value; it just re-files the mutated sentence as
 * "history" and passes.
 *
 * So the discriminator has to be positional and independent of the number
 * each restatement states — the same shape `HISTORICAL_CLAIM` uses, applied
 * to the marker this file's chronological form actually carries. Every dated
 * pass in §§3-6 opens by naming the commit it was taken at — `PASS_MARKER`,
 * "…at `708b68c7` (v0.0.377)…" — and the header's own re-anchoring line
 * names which commit the *current* pass is. A "Next free number" restatement
 * is therefore **live** iff it falls at or after the last pass-marker that
 * names the header's own anchor commit, and **historical** (exempt,
 * untouched) otherwise. Unlike a value comparison, mutating the stated
 * number cannot move a sentence across that boundary — only rewriting which
 * commit a pass claims to be taken at can, and that is a different, much
 * louder lie this file's other assertions (`declares exactly one
 * re-anchoring line`, `names one commit throughout`) already catch.
 *
 * ## It bites, and it is not vacuous
 *
 * Proved by controls run against the tree that landed it, in the commit
 * message: restoring the current live restatement (`:6303-6304`) to 0093
 * fails `restates the index's Next free number wherever the restatement is
 * live`, naming that line; restoring it instead to some other wrong value
 * fails the same assertion for the same reason, showing the check compares
 * against the index rather than against the literal string "0093"; and the
 * kept historical restatements — 0092 at `:308` and `:6162-6163`, among
 * others — are read, asserted non-empty and left untouched by every run.
 */
describe('docs/adr/STATUS-QUEUE.md: the next free number it restates', () => {
  const statusQueue = readFileSync(STATUS_QUEUE_PATH, 'utf8');
  const index = readFileSync(INDEX_PATH, 'utf8');

  const anchorSha = [...statusQueue.matchAll(ANCHOR_LINE)][0]?.[1];
  const ownPassMarkers = anchorSha === undefined
    ? []
    : [...statusQueue.matchAll(PASS_MARKER)].filter(
        (match) => match[1]!.startsWith(anchorSha) || anchorSha.startsWith(match[1]!),
      );
  // Undefined only if no dated pass has yet been written for the header's own
  // anchor commit; `Number.POSITIVE_INFINITY` then classifies every
  // restatement as historical rather than crashing the suite, and the first
  // `it` below is what actually reports that condition.
  const liveBoundary = ownPassMarkers.at(-1)?.index ?? Number.POSITIVE_INFINITY;

  const restatements = [...statusQueue.matchAll(NEXT_FREE_RESTATEMENT)].map((match) => ({
    value: match[1]!,
    line: lineOf(statusQueue, match.index!),
    text: match[0],
    live: match.index! >= liveBoundary,
  }));

  const indexValue = INDEX_NEXT_FREE_NUMBER.exec(index)?.[1];

  it('names a dated pass taken at the header\'s own anchor commit, so a live restatement can be told from kept history', () => {
    // Non-vacuous by construction: with no such pass, liveBoundary is +Infinity
    // and every assertion below passes by finding nothing live to check --
    // exactly the "reading nothing" shape this file's other tests refuse.
    expect(
      ownPassMarkers.length,
      anchorSha === undefined
        ? 'STATUS-QUEUE.md declares no re-anchoring line at all (see "declares exactly one re-anchoring line" above), so no pass can be matched to it'
        : `no dated pass in STATUS-QUEUE.md opens "at \`${anchorSha}\`" (v<version>) -- the header's own anchor commit -- so nothing here can tell a live "Next free number" restatement from a kept historical one. Write the dated pass this anchor's re-read produced before this gate can check anything`,
    ).toBeGreaterThan(0);
  });

  it('states a "Next free number" in docs/adr/README.md that this file can be checked against', () => {
    expect(
      indexValue,
      '`docs/adr/README.md` must carry a "**Next free number: NNNN.**" line -- adr-numbering-contract.test.ts already requires it, and this test reads it as ground truth rather than recomputing max+1 itself',
    ).toBeDefined();
  });

  it('restates the index\'s Next free number wherever the restatement is live', () => {
    const liveRestatements = restatements.filter((r) => r.live);
    const wrong = liveRestatements.filter((r) => r.value !== indexValue);

    expect(
      wrong.map((r) => `:${String(r.line)} says "${r.text}"`),
      `STATUS-QUEUE.md's live restatement(s) of the Next free number must match docs/adr/README.md's (${String(indexValue)}). A live restatement naming a different number means this file and the index disagree about the one number a reader drafting an ADR is most likely to copy out of here -- which is exactly the mutation (0094 -> 0093) that "tests/foundation/" used to let through with no failure at all. Kept historical restatements -- earlier passes reading a smaller number that was correct about an older commit -- are exempt and are not what this assertion is naming`,
    ).toEqual([]);
  });

  it('finds at least one live restatement to check, and leaves kept historical restatements alone rather than forcing them to agree', () => {
    const liveRestatements = restatements.filter((r) => r.live);
    const historicalDisagreements = restatements.filter((r) => !r.live && r.value !== indexValue);

    // Two-sided, matching the sibling test's own "it bites and it is not
    // vacuous" standard: a boundary with nothing live on either side of it
    // would let every assertion above pass by construction, which is not a
    // gate.
    expect(liveRestatements.length, 'no restatement fell on or after the live pass boundary; the gate above would be vacuous').toBeGreaterThan(0);
    expect(
      historicalDisagreements.length,
      'no kept restatement differs from the current Next free number, so this run cannot show the historical exemption is doing anything rather than merely being unreachable',
    ).toBeGreaterThan(0);
  });
});
