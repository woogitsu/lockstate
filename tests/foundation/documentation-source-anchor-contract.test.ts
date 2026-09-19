import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A `file:line` anchor cited in the documentation names a file that exists and
 * a line that file has.
 *
 * ## What this closes, and what it cannot
 *
 * `documentation-links-contract.test.ts` checks that a rooted backticked path
 * is on disk; `documentation-commit-citation-contract.test.ts` checks that a
 * cited sha exists and is published. Neither reads the `:NNN` on the end of a
 * path, and the extractor in the first one actively drops such a token: it
 * requires the span to end in a dot-extension, and `...state-machine.ts:165`
 * does not. So the most common citation form in this corpus was the one form
 * nothing checked.
 *
 * Issue #444 measured the cost. Of the 38 fully-qualified `src/**.ts:NNN`
 * citations into `src/simulation/{worker,protocol,kernel,clock,rng}` outside
 * `docs/research/`, **ten** landed on unrelated code -- a comment inside
 * `COMMAND_REJECTION_FAULT_CODES` cited as the place the worker supplies the
 * clock's 50 ms, a bare block-comment terminator cited as the second such
 * place, an import line
 * cited as the `WorkerState` union, a field block cited as `onTickLoop`'s
 * `catch`. Every one of those was **in range**. This gate would have caught
 * none of them.
 *
 * That is the honest bound and it is stated first rather than last: **a line
 * number is a fact about every insertion above it**, so nothing mechanical can
 * decide whether an anchor lands on the code its sentence means. What is
 * mechanical is the weaker pair -- the file is there, and the line is a line
 * that file has -- and that pair is worth having for the reason
 * `documentation-links-contract.test.ts` gives for its own narrowness: it is
 * the subset that can be checked at all, it costs milliseconds, and it fails in
 * the commit that deletes or truncates the cited module rather than the next
 * time somebody reads the sentence.
 *
 * ADR 0006's paragraph is the sharper way to put the limit: *"an anchor that
 * drifts onto plausible-looking code is worse than one that drifts onto
 * nothing"*. This gate catches only the second kind. The first kind is caught
 * by a person opening the line, which is not a mechanism, and by preferring a
 * symbol name and a quoted line of code over a bare number where the citation
 * names a symbol -- which is a writing convention, also not a mechanism.
 *
 * ## The anchor form
 *
 * A backtick span whose **entire** content is a repository-rooted path with a
 * file extension, followed by `:N` or `:N-M`. Rooted rather than bare is doing
 * real work here and not only reducing false positives: this corpus writes a
 * *deliberately historical* anchor as a bare basename -- ADR 0003's *"the nine
 * used to read `types.ts:7`, `:17`, `:204`"*, ADR 0038's *"the anchor this
 * bullet carried, `kernel.ts:250`, has drifted"*, `STATUS-QUEUE.md`'s *"this
 * entry cited `:437`"* -- because the sentence is about a number that is no
 * longer current. Reading only rooted spans means the gate cannot condemn a
 * sentence whose subject is a stale anchor, and it means this file needs no
 * allowlist for that class. There is no allowlist at all today, and one should
 * not be added for a drifted anchor: the fix for a drifted anchor is the
 * anchor.
 *
 * ## `docs/research/` is out of scope, and is this file's positive control
 *
 * `docs/research/README.md` is explicit that its records are read-only dated
 * history: *"when the code moves on, a record here does not become wrong, it
 * becomes older."* An anchor in a dated record is a statement about the tree on
 * its date, so failing the build on one would demand the one edit that
 * directory forbids. It carries 487 of the corpus's 789 rooted anchors as this
 * was written; both figures move with every document, and the code below is
 * what counts them.
 *
 * Excluding it would normally leave a gate whose every assertion is
 * "found nothing", with no evidence the range check can find anything. It does
 * not, because the excluded directory contains three real failures --
 * `docs/research/audit-2026-08-26/05-performance.md` cites
 * `src/simulation/world/coordinates.ts:144`, `:167` and `:175` in a file of 127
 * lines. So the same check is run over the research corpus as a **positive
 * control**, asserting it still finds exactly those three. That control fails
 * if the extractor stops matching, if the range arithmetic inverts, or if
 * somebody "tidies" the research record -- and it costs one more pass over
 * files already read.
 *
 * ## Watched going red, including once where it must not
 *
 * Measured on this branch, each mutation reverted before the next:
 *
 * - `fixed-step-clock.ts:29` -> `:2900` in `ARCHITECTURE.md`: 1 failed, naming
 *   the document, the anchor and the file's 77 lines.
 * - the same anchor's path misspelled: 1 failed, `no such file`.
 * - the extractor blinded (`^` -> `^ZZZ`): 2 failed -- the vacuity guard and the
 *   positive control -- which is the pair that stops this file from passing by
 *   reading nothing.
 * - `anchor.last > lines` -> `anchor.last > lines + 1000`: 1 failed, the
 *   positive control alone. The in-scope case cannot see a loosened range
 *   because it has nothing out of range to see, which is exactly why the
 *   control is here.
 * - **`state-machine.ts:203` put back to `:165`, the real #444 defect: 3
 *   passed.** That is the bound restated as a measurement rather than as a
 *   caveat. The anchor this gate exists alongside is one it cannot condemn.
 */

const ROOT = join(__dirname, '../..');

const RESEARCH = join('docs', 'research');

/** Markdown under `docs/`, plus the markdown at the repository root. */
function collectMarkdownFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectMarkdownFiles(path));
      continue;
    }
    if (entry.endsWith('.md')) files.push(path);
  }
  return files;
}

const markdownFiles = [
  ...collectMarkdownFiles(join(ROOT, 'docs')),
  ...readdirSync(ROOT)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => join(ROOT, entry)),
];

/**
 * A path rooted at a top-level directory of this repository, carrying an
 * extension, followed by one line number or an inclusive range.
 *
 * Anchored at both ends: a span that merely *contains* one is prose about an
 * anchor rather than the anchor, which is the distinction
 * `documentation-commit-citation-contract.test.ts` makes for shas.
 */
const ANCHOR = /^((?:docs|src|tests|scripts|supabase|public|\.github)\/[^\s`]*\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?$/;

interface Anchor {
  readonly source: string;
  readonly token: string;
  readonly path: string;
  readonly first: number;
  readonly last: number;
}

function anchorsIn(file: string): readonly Anchor[] {
  const source = relative(ROOT, file);
  const anchors: Anchor[] = [];
  for (const match of readFileSync(file, 'utf8').matchAll(/`([^`\n]+)`/g)) {
    // Trailing sentence punctuation is the sentence's, not the anchor's.
    const token = match[1]!.trim().replace(/[.,;]+$/, '');
    const parsed = ANCHOR.exec(token);
    if (parsed === null) continue;
    const first = Number(parsed[2]);
    anchors.push({
      source,
      token,
      path: parsed[1]!,
      first,
      last: parsed[3] === undefined ? first : Number(parsed[3]),
    });
  }
  return anchors;
}

/** `wc -l` semantics: a trailing newline does not open a further line. */
function lineCount(path: string): number {
  const lines = readFileSync(path, 'utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

/**
 * How long a cited file is, or `null` when it is not there -- computed once per
 * distinct path rather than once per anchor.
 *
 * This is a memo and nothing else: every anchor is still checked, against the
 * same number it would have been checked against, so the assertions below are
 * unchanged in what they can catch. It is here because the corpus made the
 * difference large. The 789 rooted anchors the docblock above counted are 4017
 * today and point at 479 distinct files, so reading the target per anchor read
 * **387 MB** where the distinct set is **15 MB** -- a 25-fold multiplier paid
 * entirely for re-reading `kernel.ts` a hundred times. Measured on this branch,
 * that multiplier is the whole of this file's runtime: the two checking tests
 * cost 791-1081 ms and 528-543 ms before the memo and 45-48 ms and 14-15 ms
 * after, over three runs each on an idle container, so the file
 * stopped sitting on the root config's 5 s `testTimeout` under container load,
 * which is what made it go red on a loaded machine and green on an idle one.
 *
 * `null` for an absent file is cached too: `existsSync` on a path cited 40
 * times is 40 syscalls for one answer that cannot change mid-run.
 */
const lineCounts = new Map<string, number | null>();

function lineCountOf(path: string): number | null {
  const cached = lineCounts.get(path);
  if (cached !== undefined) return cached;
  const target = join(ROOT, path);
  const count = existsSync(target) ? lineCount(target) : null;
  lineCounts.set(path, count);
  return count;
}

/** The complaint an anchor earns, or `undefined` if it resolves. */
function faultOf(anchor: Anchor): string | undefined {
  const lines = lineCountOf(anchor.path);
  if (lines === null) return `${anchor.source} -> ${anchor.token}: no such file`;
  if (anchor.first < 1 || anchor.last < anchor.first) {
    return `${anchor.source} -> ${anchor.token}: not a line range`;
  }
  if (anchor.last > lines) {
    return `${anchor.source} -> ${anchor.token}: out of range, ${anchor.path} has ${lines} lines`;
  }
  return undefined;
}

const allAnchors = markdownFiles.flatMap(anchorsIn);
const inScope = allAnchors.filter((anchor) => !anchor.source.startsWith(RESEARCH));
const researchAnchors = allAnchors.filter((anchor) => anchor.source.startsWith(RESEARCH));

describe('every rooted file:line anchor in the documentation is in range', () => {
  it('finds anchors to check, so this cannot pass vacuously', () => {
    // An order of magnitude below the 302 in scope when this gate was written.
    // No sha is put on that figure on purpose: it moves with every document,
    // and `inScope.length` is the live count that the failure message below
    // prints. High enough that an extractor which silently stopped matching
    // fails here; low enough that deleting a document does not.
    expect(inScope.length).toBeGreaterThan(50);
  });

  it('resolves every anchor outside docs/research/', () => {
    const broken = inScope.map(faultOf).filter((fault): fault is string => fault !== undefined);

    expect(broken, 'these documented anchors name a line that is not there').toEqual([]);
  });

  it('still finds the known unresolvable anchors in docs/research/, which it does not police', () => {
    /*
     * The positive control. `docs/research/README.md` keeps these records
     * read-only -- "a record here does not become wrong, it becomes older" --
     * so none of these is a defect and none must be edited. They are the
     * evidence that the check above can fail at all.
     *
     * **This list held three entries, all of one shape -- an anchor gone *out
     * of range* in a file that still exists -- until
     * [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md).** Retiring
     * `JobSystem` deleted the file six more anchors point *at*, which is a
     * second shape (`no such file`), and it is worth naming because the two
     * fail for different reasons and a reader of one entry would not have
     * predicted the other. `documentation-links-contract.test.ts`'s
     * `ABSENT_BY_DESIGN` carries the same six citations as bare paths, with the
     * same reason.
     */
    const broken = researchAnchors.map(faultOf).filter((fault): fault is string => fault !== undefined);

    expect(broken.sort()).toEqual([
      'docs/research/audit-2026-08-26/04-architecture.md -> src/simulation/operations/job-system.ts:114: no such file',
      'docs/research/audit-2026-08-26/05-performance.md -> src/simulation/operations/job-system.ts:154: no such file',
      'docs/research/audit-2026-08-26/05-performance.md -> src/simulation/world/coordinates.ts:144: out of range, src/simulation/world/coordinates.ts has 127 lines',
      'docs/research/audit-2026-08-26/05-performance.md -> src/simulation/world/coordinates.ts:167: out of range, src/simulation/world/coordinates.ts has 127 lines',
      'docs/research/audit-2026-08-26/05-performance.md -> src/simulation/world/coordinates.ts:175: out of range, src/simulation/world/coordinates.ts has 127 lines',
      'docs/research/audit-2026-08-26/09-bug-hunt.md -> src/simulation/operations/job-system.ts:157: no such file',
      'docs/research/audit-2026-08-26/09-bug-hunt.md -> src/simulation/operations/job-system.ts:196-201: no such file',
      'docs/research/audit-2026-08-26/09-bug-hunt.md -> src/simulation/operations/job-system.ts:196-201: no such file',
      'docs/research/audit-2026-08-26/09-bug-hunt.md -> src/simulation/operations/job-system.ts:215-224: no such file',
      'docs/research/2026-09-05-does-the-game-say-there-is-no-door.md -> src/simulation/rooms/enclosure.ts:303: out of range, src/simulation/rooms/enclosure.ts has 294 lines',
      /*
       * **Four more of the first shape, and all four have one cause: ADR
       * 0115's split.** The owner's ruling of 2026-09-16 moved the roster, the
       * inspector and their pure helpers out of `src/ui/hud/regime-panel.ts`
       * into `src/ui/hud/roster-panel.ts`, and that file went from 1,786 lines
       * to 192 -- so every research anchor into its second half is out of
       * range at once.
       *
       * **THIS LIST HELD EIGHT WHEN THE SPLIT WAS WRITTEN AND HOLDS FOUR NOW,
       * AND THE HALVING IS NOT A REPAIR.** #1273 landed ADR 0113 slice 1's
       * regime editor into the half that stayed, taking the file from 192
       * lines back to 388, and four of the eight coordinates -- `:213`,
       * `:196-201` and `:293` twice -- fell back inside that count. **They
       * resolve again without naming what they named**: each was written about
       * a roster or inspector line that is in `roster-panel.ts` now, and what
       * sits at those numbers today is the timetable and the editor. So this
       * gate stopped reporting them not because the citation was repaired but
       * because an unrelated change made the file long enough to swallow it,
       * which is the one failure shape a line-count gate cannot see. Recorded
       * here rather than worked around: `docs/research/` is read-only, the
       * four are no more or less accurate than the four below, and nothing is
       * owed to them.
       *
       * They are listed rather than repaired for the reason the nine above
       * are: `docs/research/README.md` keeps these records read-only, and a
       * dated record of what the code looked like on the day it was read does
       * not become wrong when the code moves. The live citations into the same
       * file -- the ones in `docs/adr/` -- were repaired in that same commit,
       * which is the difference between the two directories and the whole
       * reason this test is split in two.
       */
      'docs/research/2026-08-31-what-a-reload-keeps-and-what-it-says.md -> src/ui/hud/regime-panel.ts:647: out of range, src/ui/hud/regime-panel.ts has 405 lines',
      'docs/research/2026-09-02-the-open-issue-backlog.md -> src/ui/hud/regime-panel.ts:647: out of range, src/ui/hud/regime-panel.ts has 405 lines',
      'docs/research/2026-09-03-what-the-owner-still-owes.md -> src/ui/hud/regime-panel.ts:700-712: out of range, src/ui/hud/regime-panel.ts has 405 lines',
      'docs/research/2026-09-05-where-the-shower-runs-out.md -> src/ui/hud/regime-panel.ts:1370-1372: out of range, src/ui/hud/regime-panel.ts has 405 lines',
    ].sort());
  });
});
