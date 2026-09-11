import { spawnSync } from 'node:child_process';
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
 * ## The assumption this number rests on, stated because it had never been
 *
 * [#449](https://github.com/woogitsu/lockstate/issues/449)'s second item asked
 * for exactly this and it went untaken for two weeks while the first item was
 * discharged over and over: **a release is a proxy for unread history, and
 * the proxy holds only while releases are roughly uniform in size.** That is
 * the sentence the argument above needs and did not have. It is not true here
 * — see `ANCHOR_STALENESS_BUDGET_COMMITS` below, which measures the spread at
 * six-fold across the anchor chain and names #449's own case as worse than
 * either end of it — so the release budget is kept for the reason it was
 * chosen, that a release is a decision point a human made, and a second
 * assertion in the unit it cannot see is added beside it rather than
 * replacing it.
 *
 * ## The two budgets are independent, proved rather than argued
 *
 * On 2026-09-11, with the anchor at `24b96881` (v0.0.577) and the tree at
 * v0.0.579, the header's sha alone was pointed at a commit **154** commits
 * back while its version string was left reading v0.0.577:
 *
 * - `has not fallen more than the staleness budget behind the shipped release`
 *   **passed** — two releases behind, comfortably inside ten.
 * - `has not fallen more than the staleness budget behind in commits either`
 *   **failed** — *"154 commits past it"*, against a budget of 100.
 *
 * That is #449's measured defect reproduced in this repository's own gate: the
 * release budget green over history nobody has read. Restored afterwards and
 * the restoration verified by an empty `git diff`.
 *
 * **And the honest other half: on every window this repository has actually
 * had, the commit budget would never have fired first.** Swept the same day,
 * the most history ever carried by a window inside the release budget is
 * **63** commits historically and **35** today. So this second assertion is
 * currently slack, and it is deliberately not tuned to fire on ordinary work
 * — its value is prospective, for the regime #449 measured, where one release
 * carried 169 commits and this gate reported nine releases of headroom.
 *
 * **AND "35 TODAY" WAS A WINDOW STILL OPEN, NOT A CEILING — IT GREW BEFORE THE
 * DAY DID.** "Today" named the anchor chain's then-current, unclosed window
 * (`24b96881`..`HEAD` at the moment this docblock was written, mid-way through
 * the same 2026-09-11 this file's sweep is dated to). That window kept
 * accepting merges after this sentence landed and closed at **45** commits
 * merge-to-merge (`24b96881`..`b0cf1beb`, the next anchor) — **46** against the
 * `chore(release)` tip one commit past it — not 35. Both figures are still
 * comfortably inside **100** and below the **63**-commit historical ceiling
 * this same sentence states, so nothing here argues for moving either budget
 * constant; the correction is that "today" was never going to hold still long
 * enough to cite as a fixed number, which is the same lesson
 * `docs/adr/STATUS-QUEUE.md`'s own header draws about every dated figure it
 * carries (`docs/AGENT_WORKFLOW.md` §4, "mark both directions").
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
 * The same bound in the other unit, because a release is a proxy for unread
 * history and the proxy is not stable.
 *
 * ## Why a second number rather than a better single one
 *
 * [#449](https://github.com/woogitsu/lockstate/issues/449) is the whole
 * argument and it opens with the measurement: the anchor was **one release**
 * behind while **169 commits** sat unread, and this gate was green. The budget
 * above was chosen in releases because a release is a decision point a human
 * made, which is a real argument and is why it is kept rather than replaced —
 * but it holds only while releases are roughly uniform in size, and they are
 * not.
 *
 * **MEASURED OVER THE WHOLE ANCHOR CHAIN, 39 CONSECUTIVE WINDOWS, ON
 * 2026-09-11.** Every `Re-anchored at` sha this file still carries was
 * resolved and each consecutive pair counted with `git rev-list --count`:
 *
 * | | commits per release |
 * | --- | --- |
 * | minimum | **1.9** |
 * | median | **2.0** |
 * | maximum | **12.0** |
 *
 * So ten releases of headroom has meant anywhere from **20 to 120 commits**,
 * a six-fold spread, and #449's own case was worse than either end of it.
 * The median sits at 2.0 for a mechanical reason worth knowing: an ordinary
 * merge is two commits, the merge itself and the `chore(release)` bump
 * `.github/workflows/version.yml` writes after it.
 *
 * ## Where 100 comes from, and it is derived rather than chosen
 *
 * Two numbers bound it from opposite sides, both read out of the same sweep:
 *
 * - **63** is the most history ever observed inside the release budget — the
 *   largest commit count of any window in the chain spanning ten releases or
 *   fewer. A commit budget at or under that would have fired on a window this
 *   gate was right to leave alone.
 * - **169** is #449's measured defect, the case that has to fire.
 *
 * **100** is the round number between them, 1.6x the observed ceiling and
 * 0.6x the known defect. It is the same method the release budget used on
 * itself — *"the largest round number that would have fired before either
 * became a defect"* — applied to the unit that budget cannot see.
 *
 * ## What this does not fix, stated because the issue's own author measured it
 *
 * Neither unit at any value reaches the errors a re-anchor finds that are not
 * changes to any file. #480's pass found six; **the two sharpest could not
 * have come from a diff** — §5's preamble saying *"§2 holds three entries"*
 * while §2's own heading said four, and a previous pass's correction that was
 * false on the tree it was written against. This file is not in its own
 * dependency set, so no intersection of any size puts it in front of a reader.
 * A budget bounds how much history goes unread. It does not make anybody read
 * the document against itself, and #449 item 2 is discharged by this constant
 * only in the sense that the unit is now two units; the scheduled read that
 * issue's author recommended is a separate thing and is not this.
 *
 * **When it fires, the fix is to re-read the file, not to edit this number** —
 * exactly as for the release budget above.
 */
const ANCHOR_STALENESS_BUDGET_COMMITS = 100;

/**
 * `git` is the authority on what a sha resolves to, and re-implementing any
 * part of that here is how this gate would become a fiction that agrees with
 * itself. A missing or failing `git` is a failure rather than a skip: every
 * checkout of this repository is a git checkout, and CI runs on one. Same rule
 * and same wording as `documentation-commit-citation-contract.test.ts`, which
 * established that a foundation test may shell out to git and that
 * `.github/workflows/ci.yml` checks out all history precisely so it can.
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
 *
 * ## It was two assumptions narrower than that until 2026-09-09, and both cost
 *
 * The pattern spelled the gap between `verified` and `at` as **one literal
 * space**, and the gap between `at` and the sha as another. `STATUS-QUEUE.md`
 * is hand-wrapped prose, so a sha that happened to land at a line start was
 * invisible to this gate — permanently, silently, and in exactly the sentences
 * a re-anchor has to settle. Measured on the tree that widened it: the old
 * pattern read **7** occurrences and the new one reads **25**, and among the
 * eighteen it had never read was a live `verified at` in §4 naming
 * `0e2eb7fb` — neither the anchor of its day nor any anchor since. **A live
 * claim warranted by a commit the header does not name is the entire defect
 * this file's first assertion exists to catch**, and it sat one line break out
 * of reach.
 *
 * That is the second assumption. The first is the words between the verb and
 * the preposition: this corpus writes *"each verified correct at `c57f5fa8`"*
 * and *"Verified rather than taken: at `2732e81e`"*, six occurrences of the
 * first shape alone, none of which the old pattern could see either. So the
 * gap is `[^.\`]{0,40}?` — bounded so it cannot wander into the next clause,
 * period-free so it cannot cross a sentence, backtick-free so it cannot skip
 * over one sha to reach another.
 *
 * **Neither assumption was novel and both were already written down.**
 * `NEXT_FREE_RESTATEMENT` below is `\s`-tolerant and says why in its own
 * docblock — *"this file's paragraphs are hand-wrapped"* — and adds
 * *"(`ANCHOR_LINE` above tolerates the same thing for the same reason; it is
 * not a coincidence that both patterns need it, since both read paragraphs a
 * human keeps re-wrapping)"*. Two of this file's three patterns had learned
 * it. `adr-quotation-verbatim-contract.test.ts` records the identical failure
 * in its own `ATTRIBUTION` and `TRAILING_QUOTE` and states the general rule
 * this change is an application of: *"a pattern that matches prose must treat
 * every gap as whitespace"*.
 *
 * ## What it still cannot see, measured rather than assumed
 *
 * A looser scan — `verified` then up to forty non-backtick characters then a
 * backticked sha, dropping the `at` — finds **five** more. All five are prose
 * *about* a citation rather than a citation: three quote this pattern's own
 * text while discussing it, and *"re-verified at every anchor since
 * `26434e8e`"* names the **start of a range**, not a commit anything was
 * checked at. **A watchdog of that shape — the move
 * `adr-quotation-verbatim-contract.test.ts` makes with its own
 * `ATTRIBUTION_SHAPED` — was written, run, and rejected for that reason**, and
 * is deliberately not declared here: it fires on all five, four of them
 * correctly-written sentences, and the only way to quiet it is an allowlist,
 * which rots faster than the thing it guards. The honest form of "a pattern
 * cannot report its own misses" here is this paragraph and the number in it.
 *
 * ## It bites, and it is not vacuous
 *
 * Four controls, run against the tree that landed the widening rather than
 * argued for:
 *
 * - **Undo the §4 repair this widening exposed** — restore *"stays verified at
 *   `0e2eb7fb`"* — and `names one commit throughout` fails, naming it, with the
 *   line break visible in the reported match. Under the old pattern the same
 *   sentence passed, which is how it survived every anchor that has run this
 *   gate.
 * - **Add a fresh live claim whose sha wraps** — *"stays verified at"*, a line
 *   break, then `` `4ed571f` `` — and the same assertion fails, naming it, with
 *   the break inside the reported match. A real commit rather than an invented
 *   one, because `documentation-commit-citation-contract` reads shas out of
 *   this docblock and a fabricated one fails it. This is the control the old
 *   pattern could not have failed at all.
 * - **Keep the widened `VERIFIED_AT` but restore `HISTORICAL_CLAIM`'s original
 *   four-word trigger list** and it fails on two records — `4ed571f` and
 *   `1e7c63c7` — which is what `were` and `said` are load-bearing for. Neither
 *   is a live claim; both are a superseded entry being quoted.
 * - **Non-vacuity, both sides.** On the landing tree `VERIFIED_AT` matches
 *   **26** occurrences, `HISTORICAL_CLAIM` exempts **24** of them, **23** of
 *   those name a sha that is not the anchor — so the exemption is doing work
 *   rather than being unreachable — and the **2** that remain live both name
 *   the header's own anchor, which is the state this assertion is for.
 */
const VERIFIED_AT = /((?:re-)?verified)\b[^.`]{0,40}?at\s+`([0-9a-f]{7,40})`/gi;

/**
 * The same claim in the past tense, which is a record rather than a claim.
 *
 * `§5` keeps entries reading *"This entry read '…', re-verified at `4ed571f`"*:
 * the sha there is part of the history being corrected, and rewriting it would
 * destroy the record. The same exemption `adr-status-reference-contract.test.ts`
 * grants past-tense status claims, for the same reason.
 */
const HISTORICAL_CLAIM =
  /\b(?:read|used to|had|was|were|said)\b[^.]{0,400}?(?:re-)?verified\b[^.`]{0,40}?at\s+`[0-9a-f]{7,40}`/gis;
// `were` and `said` joined the four on 2026-09-09, with `VERIFIED_AT`'s
// widening above: once the gate could read a wrapped sha it could also read
// *"Both absences **were** re-verified at `1e7c63c7`"* and *"§§3-5 **said**
// 're-verified at `4ed571f`' in five places"*, both of them plainly records of
// a superseded entry and both reported as live claims for want of an
// auxiliary the list did not carry. Two words cut that run from five to three.
// The trade is stated rather than hidden: every word added here can exempt a
// genuinely live claim that happens to carry it earlier in the same sentence,
// which is the same trade the original four made and the reason the list is
// six words and not a part-of-speech.

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

  it('runs on a checkout deep enough to count, and fails rather than skipping when it is not', () => {
    // The convention `documentation-commit-citation-contract` set and the
    // reason it set it: a shallow checkout cannot answer, and a gate that
    // quietly skips when it cannot answer is a gate that reports green for
    // the one configuration it was built to protect against. CI checks out
    // all history on purpose -- `.github/workflows/ci.yml` says so in
    // capitals -- so a shallow tree here is a local configuration to fix,
    // not a case to tolerate.
    expect(
      git(['rev-parse', '--is-shallow-repository']).trim(),
      'this gate counts commits between the anchor and HEAD, which a shallow checkout cannot do. Fetch full history (`git fetch --unshallow`) rather than making this pass',
    ).toBe('false');
  });

  it('has not fallen more than the staleness budget behind in commits either, which is the unit a release does not track', () => {
    const anchorSha = anchors[0]![1]!;

    // Resolved rather than assumed present: the anchor names a commit on
    // `main`, and a tree that cannot see it cannot be measured against it.
    // Reported as its own failure so it is never mistaken for the budget
    // being blown.
    const resolved = spawnSync('git', ['cat-file', '-e', `${anchorSha}^{commit}`], { cwd: REPOSITORY_ROOT });
    expect(
      resolved.status,
      `STATUS-QUEUE.md is anchored at ${anchorSha} and this checkout does not contain that commit, so the commit budget cannot be counted. That is a broken citation rather than stale history -- see documentation-commit-citation-contract for the same failure in the other direction`,
    ).toBe(0);

    const behind = Number.parseInt(git(['rev-list', '--count', `${anchorSha}..HEAD`]).trim(), 10);

    expect(
      behind,
      `STATUS-QUEUE.md is anchored at ${anchorSha} and HEAD is ${String(behind)} commits past it: history that no entry in that file has been read against. The release budget beside this one can be well inside its bound while this one is not -- that is the whole of issue #449, which measured one release carrying 169 commits while this gate was green. Re-read §§3-6 against main and move the anchor — do not raise ANCHOR_STALENESS_BUDGET_COMMITS to make this pass, because the number is what the budget is for`,
    ).toBeLessThanOrEqual(ANCHOR_STALENESS_BUDGET_COMMITS);
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
