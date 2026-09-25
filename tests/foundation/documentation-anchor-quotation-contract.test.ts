import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A rooted `file:line` anchor into `src/` or `tests/` carries a quoted
 * fragment beside it, and that fragment is still on or beside the line.
 *
 * ## Why this is a second gate rather than a widening of the first
 *
 * `documentation-source-anchor-contract.test.ts` checks the pair that costs
 * nothing: the file is there, and the line is a line that file has. Its own
 * docblock states the bound it cannot pass, and states it first rather than
 * last -- *"a line number is a fact about every insertion above it, so nothing
 * mechanical can decide whether an anchor lands on the code its sentence
 * means"* -- and quotes ADR 0006 for the sharper form: *"an anchor that drifts
 * onto plausible-looking code is worse than one that drifts onto nothing"*
 * (`tests/foundation/documentation-source-anchor-contract.test.ts:39-41`,
 * `ADR 0006's paragraph is the sharper way to put the limit`).
 * It then says two further things this file must not quietly reverse: that the
 * remedy is *"preferring a symbol name and a quoted line of code over a bare
 * number ... which is a writing convention, also not a mechanism"*
 * (`:42-44`), and that
 * *"there is no allowlist at all today, and one should not be added"*.
 *
 * This file is the mechanism for the first of those and it needs the second.
 * Both are why it is a separate file: putting a budget table inside that one
 * would contradict two paragraphs of its own docblock, and the paragraph
 * refusing an allowlist is right about the thing it refuses -- an allowlist for
 * a *drifted* anchor, where the fix is the anchor. What is grandfathered below
 * is not drift, it is the 1146 anchors written before there was a convention to
 * write them under.
 *
 * ## What the sweep measured, which is the argument for the gate
 *
 * A sweep of twelve ADRs across three pull requests opened 182 rooted
 * `file:line` citations and found 23 dead. Twenty of the twenty-three had been
 * written or re-aimed by those same passes **one day earlier**. Almost every
 * second-time failure landed 10-15 lines away, inside a docblock or a comment
 * *about the right subject* -- which is why a human sweep reads as green: the
 * target looks right.
 *
 * The same shape is everywhere in the live corpus. Three opened while writing
 * this file, each with the document's own sentence beside it:
 *
 * - ADR 0092: *"the same tile `HireStaff` sends every guard to
 *   (`src/main.ts:621`, `src/main.ts:3084-3085`, re-anchored)"*. `main.ts:621`
 *   is `: {`, the opening of a conditional spread of `roomTool`. The word
 *   *re-anchored* is in the sentence.
 * - ADR 0093: *"`JobSystem` is constructed at ... and registered at
 *   `src/simulation/runtime/new-session.ts:1400`"*. That line is
 *   `const occupants = resolveOccupants(sectorId);`, inside a needs-pressure
 *   sum.
 * - ADR 0042: *"the HUD projection
 *   (`src/simulation/presentation/prisoner-projection.ts:397`)"*, cited for
 *   `classifiedAtTickOf`. That line is `readonly everAdmitted: boolean;` --
 *   the right file, the right interface, the wrong field. The
 *   `status-strip-projection.ts:782-787` case the sweep reported is the same
 *   shape: rooms counted where staff were named.
 *
 * A quoted fragment is the thing that makes all three checkable, because the
 * fragment moves with the code and the number does not.
 *
 * ## The measured shape of the corpus, at `54adc87c`
 *
 * 173 markdown files under `docs/` and the repository root, `docs/research/`
 * excluded. They carry **1910** rooted `file:line` anchors into `src/` or
 * `tests/`, spread over **104** documents. **1539** of the 1910 have at least
 * one code span beside them that could serve as a fragment; **764** carry one
 * that actually occurs within three lines of the cited line, and **1146** do
 * not. Those 1146 sit in **89** documents, and 435 of them are in two:
 * `docs/adr/STATUS-QUEUE.md` (260) and `docs/PLAYER_STRINGS.md` (175).
 *
 * How many of the 1146 are *wrong* rather than merely unquoted, measured two
 * ways because neither alone is honest:
 *
 * - **Mechanically certain: 134.** 33 cite a **blank line**; 101 cite a line
 *   that is nothing but punctuation -- a bare block-comment terminator, `})`,
 *   `}`. No sentence means one of those. A further 507 cite a line inside a comment or docblock, which is
 *   the sweep's exact signature but is sometimes deliberate, so they are not
 *   counted here.
 * - **By hand: 11 of 13.** Fourteen were drawn by a fixed-seed sample from the
 *   711 unverified anchors outside the two bulk documents, and thirteen were
 *   opened against their own sentences. Eleven cite something the sentence does
 *   not mean, one (`src/simulation/prisoners/room-instance-registry.ts:81-87`)
 *   is correct and merely unquoted, and one was too ambiguous to call. Five of
 *   the eleven are pinned as controls below rather than only counted.
 *
 * Read together: the unquoted population is majority-wrong, and the two
 * mechanical figures bound it from below rather than describing it.
 *
 * ## The four decisions, and the reasoning for each
 *
 * ### 1. Scope: a pinned per-document budget, not a per-anchor allowlist
 *
 * Grandfathering the corpus is what makes this affordable; requiring it of new
 * anchors is what stops the population growing. "New" is expressed as **a
 * per-document ceiling on unverified anchors**, pinned below as the output of
 * the derivation in this file (see `DERIVATION` and the comment above
 * `UNVERIFIED_BUDGET`).
 *
 * Why a budget rather than the allowlist the brief offered as the other option:
 *
 * - **Size.** The derivation counts 1146 unverified anchors across 89
 *   documents. Eighty-nine rows is a table a reader checks; 1146 is a table a
 *   reader scrolls past, and the largest file in `tests/foundation/` today is
 *   2865 lines.
 * - **It is a ratchet in the direction the corpus needs.** The ceiling is an
 *   upper bound, so quoting an old anchor lowers the count and passes; deleting
 *   a document lowers it and passes. Only *adding* an unverified anchor fails.
 * - **A new document starts at zero**, with no entry in the table, which is
 *   exactly the population the sweep found. Twenty of its twenty-three dead
 *   anchors were a day old. Under a per-anchor allowlist a new document is
 *   equally gated, so this is a tie; under any scheme keyed on a cutoff date or
 *   a commit it is not, which is why neither of those is here.
 *
 * What the budget gives up against an allowlist is named under *blind spots*.
 *
 * ### 2. Tolerance: three lines
 *
 * A fragment counts as present if it occurs on any line in
 * `[first - 3, last + 3]`. Measured over the in-scope corpus, the marginal
 * yield per line of slack falls off a cliff after two:
 *
 * | slack | anchors newly verified | per line |
 * | --- | --- | --- |
 * | 0 | 617 | -- |
 * | 1-2 | +134 | 67 |
 * | 3-5 | +53 | 17.7 |
 * | 6-10 | +80 | 16.0 |
 * | 11-20 | +96 | 9.6 |
 * | 21-50 | +136 | 4.5 |
 *
 * (Those are distances to the *nearest* occurrence of a candidate fragment, so
 * the far buckets are overwhelmingly a symbol that happens to appear elsewhere
 * in the same file rather than a tolerable near-miss.)
 *
 * **What three buys:** a range anchor whose fragment sits on the declaration a
 * line or two inside it; an anchor written against a file that has since taken
 * one or two inserted lines above the target; a fragment quoted from the
 * signature line of the function whose body line is cited.
 *
 * **What it lets through:** any drift of four lines or more that still happens
 * to carry a matching fragment within three lines of the new number -- and,
 * more importantly, it is chosen *below* the defect. The sweep measured drift
 * of 10-15 lines. A tolerance of 10 would have passed every one of those
 * silently, so the number is bounded above by the thing it exists to catch, not
 * only by the coverage it buys.
 *
 * ### 3. Non-vacuity
 *
 * Every substantive assertion here is a "found nothing" claim and a scanner
 * that resolves nothing satisfies all of them. Four things are pinned against
 * that, in increasing strength:
 *
 * - the number of documents scanned and the number carrying an in-scope anchor;
 * - the number of in-scope anchors found, and the number for which the
 *   extractor offered at least one candidate fragment -- an extractor that
 *   silently stopped matching fails both;
 * - the number that **verify**, which no blinded regex can satisfy;
 * - a **positive control** of eight anchors opened by hand while writing this
 *   file: three that must verify and five that must not. A change to the
 *   tolerance, the candidate window or the matcher moves at least one of them,
 *   and unlike a count they say *why*.
 *
 * ### 4. A new file
 *
 * Stated under "Why this is a second gate" above: the existing file's docblock
 * declares the drift check out of its reach and declares itself allowlist-free.
 * Both would become false sentences inside their own file.
 *
 * ## Blind spots, stated because a contract that hides its false negatives is
 * the thing this repository distrusts most
 *
 * - **Swap-in-place.** The budget counts. Deleting one unverified anchor from a
 *   document and adding a different unverified one in the same commit leaves
 *   the count unchanged and passes. A per-anchor allowlist would catch that and
 *   this does not; it is the price of 89 rows instead of 1146.
 * - **A wrong anchor that quotes a fragment which happens to be nearby.** A
 *   fragment matched as a substring anywhere in a seven-line window is a weak
 *   witness. `readonly width?: number` verifies against a dozen lines.
 * - **A fragment that is not from the cited line at all.** The gate matches the
 *   *nearest* candidate in the window, not the one the sentence means, so a
 *   sentence citing three symbols verifies if any one of them lands.
 * - **Prose in a docblock.** A fragment quoted from a comment verifies exactly
 *   as one quoted from code, because nothing here parses TypeScript. ADR 0042's
 *   defect above would still pass if the sentence had quoted the interface's
 *   name instead of the field's.
 * - **`docs/research/` is not scanned**, for the reason its own README gives
 *   and the sibling gate repeats: a dated record does not become wrong, it
 *   becomes older.
 * - **`docs/adr/STATUS-QUEUE.md`'s dated §3 pass accounts are not scanned**,
 *   for the same reason one directory up: see `DATED_ARCHIVE_SECTIONS` below
 *   for the owner's ruling of 2026-09-19 and for what the delimiter is. The
 *   rest of that document -- its header, §§1-2, its undated
 *   `## 3. Still outstanding` and §§4-6 -- is scanned exactly as before.
 * - **Anchors into paths outside `src/` and `tests/`** -- `scripts/`,
 *   `supabase/`, `.github/` -- are counted by neither gate here. They are a
 *   small and slow-moving population; extending to them is a widening of
 *   `IN_SCOPE_ROOTS` and nothing else.
 *
 * ## Watched going red, every assertion, each mutation reverted before the next
 *
 * Documents first, because a gate proved only against itself is not proved:
 *
 * - **ADR 0079's `src/simulation/prisoners/regime.ts:12` shifted to `:22`**
 *   (a zero-budget document): 2 failed -- the control, reporting *"the scan no
 *   longer finds this anchor"*, and the budget, reporting *"1 anchor into src/
 *   or tests/ carr[ies] no quoted fragment ... against a budget of 0"*.
 * - **The same row's `` `DAY_LENGTH_TICKS` `` replaced by the words "the
 *   day-length constant"**, the anchor untouched: 2 failed, the control
 *   flipping `regime.ts:12` from `true` to `false`. This is the case the gate
 *   exists for -- nothing about the anchor changed, only whether anyone can
 *   check it.
 * - **ADR 0103's `src/simulation/incidents/gangs.ts:71` shifted to `:171`** (a
 *   document with a budget of 69): 2 failed, the budget reporting *"70 anchors
 *   ... against a budget of 69"*. The ratchet holds on a document that already
 *   has slack, which is the case a pure "did it grow" check would miss.
 * - **ADR 0012's one unverified anchor repaired** (`:672` -> `:670` beside
 *   `` `carryItemJobSchema` ``): 1 failed -- the spent-budget assertion, naming
 *   the row to delete. A fix must be able to fail this gate, or the table
 *   becomes a licence nobody ever spends down.
 *
 * Then the scanner, because the "found nothing" assertions have no document
 * mutation that can reach them:
 *
 * - **`ANCHOR` blinded (`/^(` -> `/^ZZZ(`)**: 5 failed. All three vacuity pins
 *   read `expected 0 to be greater than 60 / 1100 / 550`.
 * - **`CANDIDATE_WINDOW_CHARS` 160 -> 0**: 4 failed. The anchor count survives
 *   and the fragment count does not, which is the pair that separates "the
 *   anchors went away" from "the fragments went away".
 * - **`TOLERANCE_LINES` 3 -> 100**: 2 failed, and this is the important one.
 *   The three positive controls still pass; **`system.ts:266` and
 *   `refusal-log.ts:325-327` flip from `false` to `true`**, and sixteen budget
 *   rows go spent. A loosened tolerance does not quietly buy coverage here --
 *   it is caught by the two anchors whose defect a loose tolerance forgives.
 *
 * Reverted, all six pass in 292 ms. No document was edited to conform; the four
 * document mutations above were restored from copies and `git status` was clean
 * after each.
 */

const ROOT = join(__dirname, '../..');

/** Read-only dated history. See the blind-spot list. */
const RESEARCH = 'docs/research';

/** Compare document keys and exclusions using repository-style separators. */
function documentPath(file: string): string {
  return relative(ROOT, file).replaceAll('\\', '/');
}

/** The two trees whose churn the sweep measured. */
const IN_SCOPE_ROOTS = ['src/', 'tests/'] as const;

/** Decision 2. Measured; see the table in the docblock. */
const TOLERANCE_LINES = 3;

/**
 * How far from the anchor span a candidate fragment may sit, in characters
 * between the two spans, and in how many intervening code spans. A fragment
 * further away than one clause is not "beside" the anchor in any sense a reader
 * would accept, and widening this is the cheapest way to make the gate lie.
 */
const CANDIDATE_WINDOW_CHARS = 160;
const CANDIDATE_WINDOW_SPANS = 6;

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
].filter((file) => !documentPath(file).startsWith(RESEARCH));

/**
 * The same anchor form the sibling gate reads, deliberately character for
 * character: a backtick span whose **entire** content is a repository-rooted
 * path with an extension, followed by `:N` or `:N-M`. Two gates disagreeing
 * about what an anchor is would be worse than either being narrow.
 */
const ANCHOR = /^((?:docs|src|tests|scripts|supabase|public|\.github)\/[^\s`]*\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?$/;

/** A span that is itself a path or a bare `:NNN` continuation is not a fragment. */
const PATH_LIKE = /^[^\s`]*\.[A-Za-z0-9]+(?::\d+(?:-\d+)?)?$/;
const LINE_CONTINUATION = /^:\d+(?:-\d+)?$/;

interface CodeSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface Citation {
  readonly source: string;
  readonly token: string;
  readonly path: string;
  readonly first: number;
  readonly last: number;
  readonly candidates: readonly string[];
}

function codeSpansIn(text: string): readonly CodeSpan[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => ({
    text: match[1]!,
    start: match.index!,
    end: match.index! + match[0].length,
  }));
}

/**
 * Candidate fragments for the anchor at `index`: neighbouring code spans in the
 * same paragraph, close enough to be part of the same clause, that are not
 * themselves anchors or path fragments.
 */
function candidatesFor(text: string, spans: readonly CodeSpan[], index: number): readonly string[] {
  const anchor = spans[index]!;
  const found: string[] = [];
  const from = Math.max(0, index - CANDIDATE_WINDOW_SPANS);
  const to = Math.min(spans.length - 1, index + CANDIDATE_WINDOW_SPANS);
  for (let other = from; other <= to; other += 1) {
    if (other === index) continue;
    const span = spans[other]!;
    const after = span.start >= anchor.end;
    const gap = after ? span.start - anchor.end : anchor.start - span.end;
    if (gap < 0 || gap > CANDIDATE_WINDOW_CHARS) continue;
    const between = after ? text.slice(anchor.end, span.start) : text.slice(span.end, anchor.start);
    // A blank line is a paragraph break, and a different paragraph is not "beside".
    if (/\n[ \t]*\n/.test(between)) continue;
    const fragment = span.text.trim();
    if (fragment.length < 3) continue;
    if (PATH_LIKE.test(fragment)) continue;
    if (LINE_CONTINUATION.test(fragment)) continue;
    if (!/[A-Za-z_]/.test(fragment)) continue;
    found.push(fragment);
  }
  return found;
}

/**
 * Dated archive *inside* a document, excluded for the reason `docs/research/`
 * is excluded one directory up.
 *
 * **The owner ruled on 2026-09-19: "Wyłączyć datowaną sekcję 3 z liczenia"**
 * -- exclude `docs/adr/STATUS-QUEUE.md`'s dated §3 pass accounts from the
 * counting. The provenance is the weaker kind `AGENTS.md` flags: the owner
 * chose an option an integrating session wrote rather than typing a sentence,
 * so this is read no wider than the label. `AGENTS.md` carries the entry.
 *
 * The argument, established with evidence by #1321 and not restated here: that
 * document is append-mostly dated history, roughly a third of its unverified
 * anchors sit in §3 entries whose coordinates the file has itself ruled must
 * not move -- *"Neither points where it says any more, and neither should be
 * moved"* -- and for those the gate offers no compliant remedy at all. Quoting
 * them is impossible, re-aiming them is forbidden by the record, and raising
 * the budget is forbidden by the gate. The budget is per document but the
 * failure is not: #1308 and #1318 both went red on line arithmetic in a third
 * file with nothing to do with their subject.
 *
 * **The delimiter is the document's own, not a line range.** Every pass
 * account is appended as an `## 3. ...` heading carrying the date of the pass,
 * and runs to the next `## ` heading. The one §3 heading that carries no date
 * -- `## 3. Still outstanding: ADR 0013 §§5-6` -- is the live one and is
 * **not** excluded, which is also why this is scoped to *dated* §3 rather than
 * to §3. A pass account appended tomorrow is excluded with no edit here; a
 * live section is not, unless somebody writes a date into its heading, and the
 * assertions below pin the live headings by name against exactly that.
 *
 * This is deliberately a map rather than a rule about markdown: it names one
 * document, and every other document in the corpus is scanned whole. The
 * `no other document loses an anchor to the dated-archive exclusion` assertion
 * below proves that by measuring it rather than asserting it in prose.
 */
const DATED_ARCHIVE_SECTIONS: ReadonlyMap<string, RegExp> = new Map([
  ['docs/adr/STATUS-QUEUE.md', /^## 3\..*\d{4}-\d{2}-\d{2}/u],
]);

/** An `## ` heading in a markdown document, with its offset and its text. */
interface Heading {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function headingsIn(text: string): readonly Heading[] {
  return [...text.matchAll(/^## .*$/gmu)].map((match) => ({
    text: match[0],
    start: match.index!,
    end: match.index! + match[0].length,
  }));
}

/**
 * Half-open `[start, end)` character ranges of `source`'s dated archive
 * sections. Empty for every document not named in `DATED_ARCHIVE_SECTIONS`.
 */
function archiveRangesIn(source: string, text: string): readonly (readonly [number, number])[] {
  const pattern = DATED_ARCHIVE_SECTIONS.get(source);
  if (pattern === undefined) return [];
  const headings = headingsIn(text);
  const ranges: (readonly [number, number])[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]!;
    if (!pattern.test(heading.text)) continue;
    const next = headings[index + 1];
    ranges.push([heading.start, next === undefined ? text.length : next.start]);
  }
  return ranges;
}

function withinAny(ranges: readonly (readonly [number, number])[], offset: number): boolean {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

function citationsIn(file: string, scanArchive = false): readonly Citation[] {
  const source = documentPath(file);
  const text = readFileSync(file, 'utf8');
  const spans = codeSpansIn(text);
  const archive = scanArchive ? [] : archiveRangesIn(source, text);
  const citations: Citation[] = [];
  for (let index = 0; index < spans.length; index += 1) {
    if (withinAny(archive, spans[index]!.start)) continue;
    // Trailing sentence punctuation is the sentence's, not the anchor's.
    const token = spans[index]!.text.trim().replace(/[.,;]+$/, '');
    const parsed = ANCHOR.exec(token);
    if (parsed === null) continue;
    const path = parsed[1]!;
    if (!IN_SCOPE_ROOTS.some((root) => path.startsWith(root))) continue;
    const first = Number(parsed[2]);
    citations.push({
      source,
      token,
      path,
      first,
      last: parsed[3] === undefined ? first : Number(parsed[3]),
      candidates: candidatesFor(text, spans, index),
    });
  }
  return citations;
}

/** Cited files are read once each; the sibling gate's docblock prices why. */
const fileLines = new Map<string, readonly string[] | null>();

function linesOf(path: string): readonly string[] | null {
  const cached = fileLines.get(path);
  if (cached !== undefined) return cached;
  const target = join(ROOT, path);
  const lines = existsSync(target) ? readFileSync(target, 'utf8').split('\n') : null;
  fileLines.set(path, lines);
  return lines;
}

/** Does some candidate fragment occur within `TOLERANCE_LINES` of the anchor? */
function isVerified(citation: Citation): boolean {
  if (citation.candidates.length === 0) return false;
  const lines = linesOf(citation.path);
  if (lines === null) return false;
  const first = Math.max(1, citation.first - TOLERANCE_LINES);
  const last = Math.min(lines.length, citation.last + TOLERANCE_LINES);
  for (let line = first; line <= last; line += 1) {
    const text = lines[line - 1];
    if (text === undefined) continue;
    if (citation.candidates.some((fragment) => text.includes(fragment))) return true;
  }
  return false;
}

const citations = markdownFiles.flatMap((file) => citationsIn(file));

/**
 * The same scan with the dated-archive exclusion switched off. Nothing gates on
 * it; it exists so the assertions below can *measure* the exclusion's blast
 * radius rather than assert it in prose.
 */
const citationsScanningArchives = markdownFiles.flatMap((file) => citationsIn(file, true));

const verified = citations.filter(isVerified);
const unverified = citations.filter((citation) => !isVerified(citation));

function unverifiedByDocument(): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const citation of unverified) counts.set(citation.source, (counts.get(citation.source) ?? 0) + 1);
  return counts;
}

/*
 * ## DERIVATION
 *
 * `UNVERIFIED_BUDGET` below is the **output of a derivation, not a hand-written
 * list**, and the derivation is the code in this file. To regenerate it after a
 * legitimate bulk change, add this to the bottom of the file, run
 * `npx vitest run tests/foundation/documentation-anchor-quotation-contract.test.ts`,
 * paste the printed table over the constant, and delete it again:
 *
 *     it('derive', () => {
 *       const rows = [...unverifiedByDocument().entries()].sort(([a], [b]) => a.localeCompare(b));
 *       writeFileSync('/tmp/budget.txt', rows.map(([doc, n]) => `  '${doc}': ${n},`).join('\n'));
 *     });
 *
 * It writes a file rather than printing, because
 * `tests/foundation/test-suite-carries-no-scratch-probe-contract.test.ts:83`'s
 * `CONSOLE_WRITE` forbids `console.log` anywhere under `tests/foundation/` --
 * including, as this file found out, inside a comment.
 *
 * Regenerating it is not a neutral act: every row it raises is an anchor nobody
 * can check. Lower a row by quoting the anchors; raise one only with the reason
 * in the commit message.
 */

/**
 * The most unverified `src/`/`tests/` anchors each document may carry.
 *
 * First derived on `origin/main` @ `54adc87c` by the procedure above -- 1146
 * anchors over 89 documents, out of 1910 in scope. A document absent from this
 * table has a budget of zero, which is the whole point: a document written
 * after this gate quotes its anchors or does not cite them.
 *
 * **Re-derived on `origin/main` @ `eeda2e53` (2026-09-18), and the reason is
 * the one the block above demands in writing.** This branch sat unmerged for
 * two days while some sixty commits landed on `main`, and a budget pinned to a
 * merge base is a measurement of that base, not of this branch. Fourteen rows
 * rose, by 61 anchors in total, to 1206 over the same 89 documents out of 1980
 * in scope; no row fell, none was spent, and no document joined or left the
 * table. Every one of the 61 was written on `main` *before* this gate existed,
 * so it belongs to the same grandfathered population as the original 1146 --
 * the ratchet cannot police commits that merged before it did. What it does
 * police is unchanged: a document absent from the table still has a ceiling of
 * zero, and the next unquoted anchor added to any of the fourteen is red.
 *
 *
 * **Re-derived a second time on `origin/main` @ `23374859` (2026-09-18), and
 * the ten anchors it moves split into two different things, which is why they
 * are not summarised as one number.** Nine of the ten are anchors that
 * *verified* at `eeda2e53` and stopped verifying without their documents being
 * touched at all: `adad4f08` (#1291, the #961 resident ceiling) inserted
 * comment blocks into `src/content/default-locale-en.ts`,
 * `src/content/room-catalog.ts` and `src/simulation/objects/room-capacity.ts`,
 * and every anchor below them slid off its line. That is a *regression in
 * checkability*, not the grandfathered population, so the ratchet should not
 * absorb it and mostly does not:
 *
 * - `docs/LOCALIZATION.md` and `docs/adr/0110-...md` are **repaired in this
 *   commit rather than budgeted**, by re-deriving the coordinate with
 *   `grep -n`. Their rows stay at 2 and 6. The code moved verbatim in both
 *   cases -- `'hud.status.prisoners-without-bed'` 167 -> 203, and
 *   `room.security-office`'s catalogue entry 159-163 -> 219-223.
 * - `docs/adr/STATUS-QUEUE.md`, 277 -> **283**, is the one raise of the nine
 *   and it is a raise only because this branch must not write that file:
 *   a re-anchor pass is running on it as this lands. The six are
 *   `src/content/room-catalog.ts:93` and `:94`, and
 *   `src/simulation/objects/room-capacity.ts:176-201` cited four times. All
 *   six now land on docblock prose *about the right subject* -- `:176-201` is
 *   the amended resident-ceiling comment, not `residentCapacity` -- which is
 *   the plausible-drift shape this gate was written for, caught by it, one day
 *   old. **The repair belongs to that pass and will lower this row**; raising
 *   it here buys nothing but the ordering.
 *
 * The tenth is the ordinary kind: `docs/adr/0028-...md`, 16 -> **17**, for
 * `tests/browser/ui-staff-wage.spec.ts:377`, written into that ADR on `main`
 * by the same #961 work and never verifying, because the sentence quotes no
 * symbol beside it at all. Same grandfathered population as the 1206.
 *
 * **What is not re-derived is the rest of the table**, deliberately: a blanket
 * regeneration at each new base would have absorbed all nine silently, and the
 * point of naming them one at a time is that eight of them have an owner.
 * The largest mover is `docs/adr/STATUS-QUEUE.md`, 260 -> 277, and it is worth
 * naming because the seventeen are **not drift**: they came from #1293's
 * re-anchor pass, which re-derived each coordinate with `grep -n` and recorded
 * the evidence. They fail here for the reason this gate exists to state --
 * `src/ui/hud/view-model.ts:2131` is right, and is written with no fragment
 * quoted beside it, so nothing but a human opening the file can tell. Being
 * *correct* and being *checkable* are different properties, and this gate
 * measures the second.
 *
 * **Re-derived a third time, whole, on `origin/main` @ `f1a61702` (2026-09-19),
 * and that is a reversal of the paragraph directly above rather than another
 * instance of it.** That paragraph refused a blanket regeneration on the
 * grounds that naming movers one at a time keeps them owned. It was right for
 * ten anchors and is wrong for this base: twenty-one pull requests merged on
 * 2026-09-19 alone, the branch's merge base moved from `23374859` to
 * `f1a61702`, and the table went **24 documents over budget** at once. Both
 * directions are left standing, per `docs/AGENT_WORKFLOW.md` §4 -- the earlier
 * argument is not retracted, it is bounded: naming movers individually is the
 * right method when the base has moved by a commit, and an assertion about a
 * corpus that has moved by a day's worth of merges instead.
 *
 * The shape of that regeneration, so the number is a reading of the tree and
 * not a claim about it: **1236 unverified anchors over 91 documents, out of
 * 2064 in scope**, against 1213 over 89 out of 1980 at `23374859`. Twenty-two
 * rows rose, **eight fell**, two documents joined, and **none was spent** --
 * so the sibling assertion below, which fails on a row that no longer needs
 * one, had nothing to report. What each group is:
 *
 * - **The eight that fell are repairs, and they are the ratchet paying out.**
 *   `docs/adr/0047-...md` 34 -> **15** is the largest movement in the table in
 *   either direction, from #1240's re-anchor pass (`ece828b8`, `5de1c948`,
 *   `dfecba9d`, `3146dc6d`) which re-opened every anchor in 0028/0029/0042/0047
 *   and quoted what it re-aimed; `0020` 15 -> 10 and `0029` 9 -> 6 follow it,
 *   with five more falling by one each.
 * - **`docs/adr/STATUS-QUEUE.md`, 283 -> 300, is again the largest raise and
 *   again for the reason its own entry above gives.** The prediction in that
 *   entry -- *"The repair belongs to that pass and will lower this row"* -- did
 *   not come true: the re-anchor passes that ran on it since re-derived their
 *   coordinates with `grep -n` and wrote them bare, so the row rose by the
 *   number of correct anchors nobody can check. That is the gate's claim
 *   restated, not a failure of it, and the prediction is left above rather than
 *   edited.
 * - **Two documents join the table and both are new, so neither is drift.**
 *   `docs/adr/0117-...md` (7) did not exist at `54adc87c` and was written and
 *   accepted on `main` (`3f17da4b`, `b98af6b3`, `bdb17265`) -- its anchors
 *   are bare coordinates in parentheses, the shape `0103`'s control bullet
 *   already describes. `docs/ARCHITECTURE.md` (1) is one anchor,
 *   `src/ui/simulation-regime.ts:151`, whose document was not touched in this
 *   window at all: the code moved under it. Same class as the nine `adad4f08`
 *   cases above, one document wide.
 * - **The remaining twenty-one raises are one or two anchors each**, the
 *   largest being `0051` +4 and `0042`, `0022`, `0093`, `0103`,
 *   `docs/HUD_PROJECTIONS.md` and `docs/OPERATIONS.md` at +2. Every one of them
 *   was written on `main` before this gate merged, which is the same
 *   grandfathering argument the two entries above make and the last time it can
 *   be made: once this lands, the ratchet polices every commit after it.
 *
 * **Re-derived a fourth time on `origin/main` @ `89d05651` (2026-09-19) and it
 * came back byte-identical, which is worth a paragraph because the prediction
 * that it would move was reasonable and wrong.** #1301 added 102 lines to
 * `docs/adr/STATUS-QUEUE.md` -- a `### What earns a row in this section`
 * subsection in §2 and a closure blockquote in §3 -- and that document is this
 * table's largest row at 300. The expectation, written into the brief that
 * asked for the re-derivation and into this file's own account of the
 * `adad4f08` cases, was that inserting text above existing anchors slides them
 * and costs checkability. **It does not, and the reason is the direction the
 * gate reads in.** `isVerified` opens the *cited* file and searches
 * `[first - 3, last + 3]` of **its** lines; the citing document's line numbers
 * are never read by anything here. So a row moves when the **code** moves
 * under an anchor, or when the document gains or loses an anchor -- and #1301
 * did neither: `git show` over its three files finds **no** rooted `src/` or
 * `tests/` anchor added and **no** file under `src/` or `tests/` touched at
 * all.
 *
 * The distinction is cheap to state and was not stated anywhere above: the
 * nine `adad4f08` cases slid because **`src/content/room-catalog.ts` and two
 * siblings** took inserted comment blocks, not because any ADR grew. Editing
 * prose around an anchor is free here; editing the code the anchor points at
 * is what this gate charges for.
 *
 * **One row moves on 2026-09-19 for a reason no re-derivation of the whole
 * table would produce, and it is the only row that moves.**
 * `docs/adr/STATUS-QUEUE.md` falls **300 -> 187**. The figure is derived rather
 * than picked, in three steps a single number would hide:
 *
 * - **What the row counted before the ruling was 236, not 300.** #1321 quoted
 *   the code beside 64 anchors that were already correct, on `origin/main` @
 *   `36503522`, and **deliberately left this row at 300** -- in its own words,
 *   *"left where it is on purpose, because lowering it to the new count would
 *   hand the headroom straight back"*. So the 64 between 236 and 300 is
 *   **reserved headroom, not accidental residue**, and that provenance is what
 *   makes it carryable rather than spendable here.
 * - **The ruling takes 113 anchors out of the counting, and nothing else.**
 *   The owner's fifth ruling of 2026-09-19 -- *"Wyłączyć datowaną sekcję 3 z
 *   liczenia"* -- takes effect through `DATED_ARCHIVE_SECTIONS` above rather
 *   than through this table. The counted population falls **236 -> 123**: the
 *   113 that leave are the ones inside dated §3 pass accounts, for which the
 *   gate's remedy was empty, their coordinates being a record the file has
 *   ruled must not move.
 * - **The row therefore falls by those same 113, and by nothing more.**
 *   300 - 113 = **187**, which is the pre-ruling slack of 64 carried across
 *   the change rather than spent: 187 - 123 = 64, the same headroom the row
 *   held at `36503522`. The whole of the ruling's win is banked as budget
 *   retired; none of it is banked as slack removed.
 *
 * **Why the row is not 123, and this is the correction that matters.** An
 * earlier revision of this branch set it to the measured live count, arguing
 * the exclusion should buy correctness and not slack. That was an additional
 * tightening **the owner did not rule and was not offered** -- the label
 * reaches what is *counted*, never how much is *allowed* -- and it was
 * measurably voluntary: with the exclusion in place and the row left at 300
 * this file is green. Voluntary is allowed; unruled and folded into a ruling's
 * own commit is not. It was also the expensive direction, because **a budget
 * can never be raised** -- the assertion below forbids it literally -- so
 * headroom not preserved here cannot be recovered later, and the cost of a
 * zero-slack row lands on whoever's pull request happens to shift a line in a
 * file this document cites, which is exactly how #1308 and #1318 went red on
 * subjects of their own that had nothing to do with it.
 *
 * Measured on this branch off `origin/main` @ `09384b9f` by the DERIVATION
 * procedure above, run twice -- once with the exclusion and once without --
 * and diffed: **exactly one row differs between the two tables**, this one.
 * The other 89 rows, and the two documents outside the table, are byte
 * identical. The assertion `costs no other document a single anchor` below is
 * that same measurement, kept as a test rather than left in this comment, and
 * `carries the pre-ruling slack across the change rather than spending it`
 * pins the 64 so that a future editor who spends it fails rather than drifts.
 *
 * **And the `docs/PLAYER_STRINGS.md` row above was raised by #1292 before the
 * ruling entry above it was written; the two are independent and both are
 * kept.** #1292's own account follows. Its `STATUS-QUEUE.md` paragraph is
 * history: that row is no longer 300 but the number the ruling derives
 * above, and #1292 still does not write it.
 * **Two rows rose on 2026-09-19 for #1292's Security section, and they are the
 * only two: nine further anchors it moved were repaired rather than
 * budgeted.** The branch adds a sixth HUD section and about 2,400 lines under
 * `src/`, so every anchor below its insertion points slid. Eleven anchors
 * stopped verifying. Nine were re-aimed in the citing document with `grep -n`
 * and a fragment quoted beside each -- two in `docs/adr/0022-...md`, three in
 * `0025`, two in `0038`, two in `0091` (plus one each in `0103` and `0106`
 * that cost no row) -- and those six documents' rows are **unchanged**, which
 * is the ratchet working rather than being paid off. The two that could not
 * be repaired:
 *
 * - **`docs/adr/STATUS-QUEUE.md` rose to 302 and then did not need to, which is
 *   the first time the prediction made at `283` has paid out.** One anchor
 *   cited twice and therefore counted twice, `src/content/locale-pl.ts:803`
 *   (`Zlecenie ukończono.`), slid to `:847` when the branch inserted
 *   thirty-one Polish strings above it, and that file was not this branch's to
 *   write. The row was raised to 302 on that basis. Hours later
 *   [#1321](https://github.com/woogitsu/lockstate/pull/1321) merged -- the
 *   re-anchor pass the `283` entry said the repair belonged to -- and it wrote
 *   its coordinates **with fragments quoted beside them**, which is what the
 *   two earlier passes did not do. The document's real count is now **245**
 *   against a row of 300, so the raise was reverted and **this branch leaves
 *   that row exactly as `main` has it**. The prediction is left standing above
 *   with its recorded failure beside it; it was wrong twice and right once.
 * - **`docs/PLAYER_STRINGS.md`, 176 -> 182**, and this one is not drift at
 *   all: the document is generated by `tooling/player-string-inventory.mjs`
 *   and cannot be hand-repaired. Its rows are
 *   `| `key` | English | `src/content/default-locale-en.ts:N` |`, so the only
 *   candidate fragment beside an anchor is a neighbouring row's key -- and
 *   `PATH_LIKE` eats any key whose last segment is a bare word, because
 *   `hud.tab.security` matches `^[^\s`]*\.[A-Za-z0-9]+$` exactly as a
 *   filename does. Of the thirty-one keys the Security section adds, the
 *   twenty-five with a hyphenated last segment (`...sectors-empty`,
 *   `...incident-row`) verify off their neighbours and **six do not**:
 *   `hud.tab.security`, `hud.security-section.title`, `...waiting`,
 *   `...sectors`, `...lockdown` and `...incidents`. The row is therefore a
 *   measurement of this gate's own extractor meeting this repository's key
 *   naming, and the honest fix is in one of those two places rather than in
 *   the strings: renaming a shipped locale key to please a regex would be the
 *   tail wagging the dog.
 */
const UNVERIFIED_BUDGET: Readonly<Record<string, number>> = {
  'docs/adr/0003-simulation-worker-protocol.md': 9,
  'docs/adr/0005-entity-storage-model.md': 1,
  'docs/adr/0006-simulation-worker-adapter.md': 2,
  'docs/adr/0008-trusted-service-boundary.md': 1,
  'docs/adr/0012-derived-identifier-reproducibility.md': 1,
  'docs/adr/0013-free-tier-cloud-save-capacity.md': 1,
  'docs/adr/0015-actor-identity-allocation.md': 24,
  'docs/adr/0017-money-primary-resource-model.md': 5,
  'docs/adr/0019-tile-ownership-under-overlapping-parcels.md': 8,
  'docs/adr/0020-deterministic-kernel.md': 10,
  'docs/adr/0022-room-zoning-surface.md': 28,
  'docs/adr/0023-room-occupancy-authority.md': 7,
  'docs/adr/0025-guard-hiring-surface.md': 10,
  'docs/adr/0026-entity-id-lifetime.md': 3,
  'docs/adr/0028-object-placement-and-derived-room-capacity.md': 18,
  'docs/adr/0029-concurrent-room-use-claims.md': 6,
  'docs/adr/0034-releasing-a-claimed-guard.md': 6,
  'docs/adr/0038-what-makes-a-save-compatible.md': 15,
  'docs/adr/0039-a-keyboard-route-to-room-zoning.md': 4,
  'docs/adr/0040-the-shape-of-the-render-delta-channel.md': 22,
  'docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md': 1,
  'docs/adr/0042-attaching-consequences-to-the-simulation-loop.md': 49,
  'docs/adr/0043-account-session-states-and-what-they-may-do-to-local-data.md': 4,
  'docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md': 1,
  'docs/adr/0046-shipping-the-telemetry-pipeline.md': 2,
  'docs/adr/0047-raising-a-building-on-open-ground.md': 15,
  'docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md': 3,
  'docs/adr/0050-when-a-sentence-ends.md': 4,
  'docs/adr/0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md': 16,
  'docs/adr/0053-who-may-stand-a-security-post.md': 2,
  'docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md': 4,
  'docs/adr/0056-keeping-a-players-orders-in-the-order-they-gave-them.md': 8,
  'docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md': 3,
  'docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md': 5,
  'docs/adr/0061-what-the-prison-produces-on-its-own.md': 1,
  'docs/adr/0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md': 3,
  'docs/adr/0067-what-an-assault-costs-its-instigator.md': 2,
  'docs/adr/0068-classifying-a-pending-rooms-enclosure-on-the-client.md': 3,
  'docs/adr/0071-what-bounds-a-room-whose-activity-consumes-no-object.md': 1,
  'docs/adr/0073-who-orders-a-contraband-search.md': 3,
  'docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md': 5,
  'docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md': 16,
  'docs/adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md': 6,
  'docs/adr/0081-whether-a-purchase-may-be-partly-filled.md': 5,
  'docs/adr/0082-what-order-build-orders-are-carried-out-in.md': 3,
  'docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md': 11,
  'docs/adr/0084-what-the-alerts-channel-owes-a-player.md': 9,
  'docs/adr/0085-what-the-hud-corner-is-for-and-what-the-strip-may-drop.md': 5,
  'docs/adr/0086-what-refreshes-a-pulled-hud-readout.md': 10,
  'docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md': 8,
  'docs/adr/0089-how-a-host-refusal-names-its-reason.md': 24,
  'docs/adr/0090-medium-as-a-warning-not-a-skipped-step.md': 1,
  'docs/adr/0091-what-clears-the-refusal-band.md': 9,
  'docs/adr/0092-who-decides-where-a-guard-stands.md': 15,
  'docs/adr/0093-a-carry-is-an-action.md': 38,
  'docs/adr/0094-which-names-a-prison-draws-from.md': 7,
  'docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md': 9,
  'docs/adr/0097-what-the-world-view-is-required-to-communicate.md': 18,
  'docs/adr/0098-what-says-which-room-this-is.md': 5,
  'docs/adr/0100-whether-a-rendered-object-sprite-can-be-published-art.md': 1,
  'docs/adr/0101-what-a-zoning-tint-must-deliver.md': 5,
  'docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md': 71,
  'docs/adr/0104-what-undo-takes-back.md': 12,
  'docs/adr/0105-what-makes-a-local-save-the-newest-one.md': 4,
  'docs/adr/0106-how-a-finished-wall-comes-down-without-a-keyboard.md': 4,
  'docs/adr/0107-what-a-stale-build-order-cancellation-is-refused-for.md': 17,
  'docs/adr/0108-what-nobody-can-get-in-should-mean.md': 9,
  'docs/adr/0109-what-a-stale-local-save-is-refused-for.md': 9,
  'docs/adr/0110-what-security-sector-a-room-is-in.md': 6,
  'docs/adr/0111-how-a-room-instances-rectangle-reaches-the-render-side.md': 7,
  'docs/adr/0114-what-a-deleted-prisons-undo-copy-holds-and-when-it-closes.md': 6,
  'docs/adr/0116-whether-a-finished-object-is-an-event.md': 21,
  'docs/adr/0117-what-happens-when-a-guards-post-is-walled-in.md': 7,
  'docs/adr/0119-how-a-language-change-reaches-a-running-page.md': 5,
  'docs/adr/0120-what-a-second-tab-follows.md': 7,
  'docs/adr/README.md': 14,
  'docs/adr/STATUS-QUEUE.md': 187,
  'docs/AGENT_WORKFLOW.md': 2,
  'docs/ARCHITECTURE.md': 1,
  'docs/HANDOVER-2026-08-26.md': 3,
  'docs/HANDOVER-2026-09-15.md': 2,
  'docs/HUD_PROJECTIONS.md': 11,
  'docs/IDENTITY_V5_ROLLOUT.md': 3,
  'docs/INPUT.md': 1,
  'docs/LOCALIZATION.md': 2,
  'docs/OPERATIONS.md': 4,
  'docs/PLAYER_STRINGS.md': 182,
  'docs/TESTING.md': 3,
  'docs/VISUAL_IDENTITY.md': 5,
  'docs/WORLD.md': 2,
};

describe('rooted src/ and tests/ anchors in the documentation carry a checkable quoted fragment', () => {
  it('scans documents and finds anchors in them, so nothing below can pass vacuously', () => {
    // Floors, not equalities: a document added or deleted must not fail this,
    // an extractor that silently stopped matching must.
    expect(markdownFiles.length).toBeGreaterThan(150);
    expect(new Set(citations.map((citation) => citation.source)).size).toBeGreaterThan(60);
    expect(citations.length).toBeGreaterThan(900);
  });

  it('offers candidate fragments for most anchors, so the fragment extractor cannot silently die', () => {
    const withCandidates = citations.filter((citation) => citation.candidates.length > 0);

    // 1539 of 1910 on the derivation commit. A candidate window that stopped
    // matching, or a paragraph rule that swallowed everything, lands here.
    expect(withCandidates.length).toBeGreaterThan(1100);
  });

  it('verifies a large body of anchors against the code, so a blinded matcher cannot pass', () => {
    // 764 on the derivation commit. This is the assertion no broken regex
    // satisfies: it is the only one that requires the scan to *resolve*
    // something rather than to find nothing.
    expect(verified.length).toBeGreaterThan(550);
  });

  it('agrees with eight anchors opened by hand, three that must verify and five that must not', () => {
    /*
     * The positive and negative controls, and the strongest of the four
     * non-vacuity pins because they say *why* rather than *how many*. Each was
     * opened in the tree at `54adc87c` while writing this file.
     *
     * **Verifying.**
     * - ADR 0079's table row *"| in-game day | **2,400 ticks** |
     *   `DAY_LENGTH_TICKS`, `src/simulation/prisoners/regime.ts:12` |"*.
     *   `regime.ts:12` is `export const DAY_LENGTH_TICKS = 2_400;`. Exact.
     * - ADR 0103's *"(`src/simulation/incidents/gangs.ts:71`) stays
     *   unwritten"*, beside `adjustReputation`. `gangs.ts:71` is
     *   `public adjustReputation(gangId: string, delta: number): void {`. Exact.
     * - ADR 0093's *"`SAVE_SCHEMA_VERSION` is `5`
     *   (`src/persistence/save-schema.ts:36`)"*. `save-schema.ts:36` is
     *   **blank**; the declaration is `:38`. This one is the tolerance
     *   demonstrating itself: an anchor two lines stale still resolves, because
     *   the fragment moved with the code and the number did not. (The
     *   surrounding sentence is separately wrong -- the constant is `6` --
     *   which is a claim gate's business, not this one's.)
     *
     * **Not verifying, and every one of the five is a real defect.**
     * - `src/main.ts:621` in ADR 0092 is `: {`, the opening of a conditional
     *   spread of `roomTool`; the sentence says `HireStaff`. The sentence also
     *   contains the word *re-anchored*.
     * - `src/simulation/runtime/new-session.ts:1400` in ADR 0093 was
     *   `const occupants = resolveOccupants(sectorId);` at `54adc87c`; the
     *   sentence says `JobSystem` is registered there. Re-opened at `eeda2e53`
     *   the line is **blank** -- the file moved under the anchor and the
     *   anchor is wronger than it was, which is the defect deepening rather
     *   than a different one.
     * - `src/simulation/identity/actor-identity.ts:210` in ADR 0103.
     *   **This row is a repaired one and is kept to show what repair looks
     *   like here.** Until `8149ca33` it read `:188`, which was blank, and it
     *   was pinned as the clearest of the five. That commit re-aimed it to
     *   `:210`, `export const ACTOR_IDENTITY_RNG_STREAM = ...`, which is the
     *   right line. It is still listed among the five that must not verify,
     *   and for a reason the block above predicted only two of three outcomes
     *   for: the anchor did not become verifying, because ADR 0103 cites it
     *   inside a parenthesis of seven bare coordinates -- `:440-483`, `:78`,
     *   `:81`, `:83`, `:104`, `:188` -- with no symbol quoted beside any of
     *   them. A right anchor nobody can check still fails this gate, and that
     *   is the gate's whole claim rather than a false positive in it.
     * - `src/simulation/construction/system.ts:266` in ADR 0019 is cited as
     *   *"-- `submitOrder`, the one named"* in a list of `canBuildAt` call
     *   sites. That line is prose inside `DoorConstructionService`'s docblock.
     * - `src/simulation/refusals/refusal-log.ts:367-369` in ADR 0107 is cited
     *   beside `RemoveWallRefusalReason`; `:369` declares
     *   `ADMIT_REFUSAL_REASONS`, a different refusal family in the same file.
     *   This is the sweep's shape exactly: right file, right subject, wrong
     *   table.
     *
     *   **It read `:325-327` until 2026-09-22 and both ends moved by 42**, when
     *   `refusalSchema.tile` added two paragraphs to `RefusalLog`'s class
     *   comment and four lines to `record`. The row was re-aimed rather than
     *   left, for the reason the `actor-identity.ts` row above gives: an
     *   anchor the scan can no longer find returns a *string* here and would
     *   otherwise fail this control by having its subject vanish. **The defect
     *   it pins survived the move intact** -- the cited range still lands on
     *   `ADMIT_REFUSAL_REASONS` rather than on the wall table -- which is why
     *   this stays a negative and the document's budget is not lowered.
     *
     * If a future commit fixes one of the five, this control goes red naming
     * it -- move that row up into the verifying group and lower the document's
     * budget. That is the control working, not failing.
     *
     * **It fired on 2026-09-18 and neither branch of that sentence was the
     * right one**, which is recorded here rather than smoothed over. `8149ca33`
     * repaired `actor-identity.ts:188` by *re-aiming* it, so the control did
     * not report a verifying anchor -- it reported `the scan no longer finds
     * this anchor`, the third outcome, which `found.length === 0` returns as a
     * string precisely so that a control can never pass by having its subject
     * vanish. The row was re-pointed at the repaired coordinate and stayed a
     * negative, for the reason its own bullet gives.
     */
    const control = (source: string, token: string): boolean | string => {
      const found = citations.filter(
        (citation) => citation.source === source && citation.token === token,
      );
      if (found.length === 0) return `${source} -> ${token}: the scan no longer finds this anchor`;
      return found.every(isVerified);
    };

    expect({
      'regime.ts:12': control('docs/adr/0079-a-sentence-long-enough-to-be-a-history.md', 'src/simulation/prisoners/regime.ts:12'),
      'gangs.ts:71': control('docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md', 'src/simulation/incidents/gangs.ts:71'),
      'save-schema.ts:36': control('docs/adr/0093-a-carry-is-an-action.md', 'src/persistence/save-schema.ts:36'),
      'main.ts:621': control('docs/adr/0092-who-decides-where-a-guard-stands.md', 'src/main.ts:621'),
      'new-session.ts:1400': control('docs/adr/0093-a-carry-is-an-action.md', 'src/simulation/runtime/new-session.ts:1400'),
      'actor-identity.ts:210': control('docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md', 'src/simulation/identity/actor-identity.ts:210'),
      'system.ts:266': control('docs/adr/0019-tile-ownership-under-overlapping-parcels.md', 'src/simulation/construction/system.ts:266'),
      'refusal-log.ts:367-369': control('docs/adr/0107-what-a-stale-build-order-cancellation-is-refused-for.md', 'src/simulation/refusals/refusal-log.ts:367-369'),
    }).toEqual({
      'regime.ts:12': true,
      'gangs.ts:71': true,
      'save-schema.ts:36': true,
      'main.ts:621': false,
      'new-session.ts:1400': false,
      'actor-identity.ts:210': false,
      'system.ts:266': false,
      'refusal-log.ts:367-369': false,
    });
  });

  it('adds no unverified anchor to any document beyond its pinned budget', () => {
    const over: string[] = [];
    for (const [document, count] of [...unverifiedByDocument().entries()].sort()) {
      const budget = UNVERIFIED_BUDGET[document] ?? 0;
      if (count <= budget) continue;
      over.push(
        `${document}: ${count} ${count === 1 ? 'anchor' : 'anchors'} into src/ or tests/ carry no quoted fragment that occurs within ` +
          `${TOLERANCE_LINES} lines of them, against a budget of ${budget}. Quote the code beside the ` +
          `anchor -- \`file.ts:123\`, \`theSymbolOnThatLine\` -- rather than raising the budget.`,
      );
    }

    expect(over, 'these documents cite code by a line number nothing can check').toEqual([]);
  });

  it('pins no budget for a document that no longer needs one', () => {
    // The ratchet's other half: a budget row left behind after its document was
    // fixed or deleted would silently re-admit unverified anchors later.
    const live = unverifiedByDocument();
    const stale = Object.keys(UNVERIFIED_BUDGET).filter(
      (document) => (live.get(document) ?? 0) === 0,
    );

    expect(stale, 'these budget rows are spent; delete them').toEqual([]);
  });
});



describe("the dated archive inside docs/adr/STATUS-QUEUE.md, excluded on the owner's 2026-09-19 ruling", () => {
  const queue = 'docs/adr/STATUS-QUEUE.md';
  const queueText = readFileSync(join(ROOT, queue), 'utf8');
  const ranges = archiveRangesIn(queue, queueText);
  const headings = headingsIn(queueText);

  it('keys off the document\'s own heading shape and excludes a substantial archive', () => {
    // A floor, not an equality: a pass appended tomorrow must not fail this,
    // a delimiter that stopped matching must. There were 40 dated §3 headings
    // at `d11021de`, the first dated 2026-09-03 and the last 2026-09-19.
    expect(ranges.length).toBeGreaterThan(30);

    // Every excluded region begins at a heading that is both §3 and dated.
    const excludedHeadings = headings.filter((heading) => withinAny(ranges, heading.start));
    const misshapen = excludedHeadings.filter(
      (heading) => !(/^## 3\./u.test(heading.text) && /\d{4}-\d{2}-\d{2}/u.test(heading.text)),
    );
    expect(misshapen.map((heading) => heading.text), 'an excluded section that is not a dated §3 pass account').toEqual([]);
  });

  it('leaves every live section of that document counted, each pinned by name', () => {
    // The rot this exclusion could suffer is silent widening: a live section
    // whose heading gains a date, or a delimiter that swallows what follows
    // the last pass account. Both land here.
    const live = (prefix: string): string => {
      const heading = headings.find((candidate) => candidate.text.startsWith(prefix));
      if (heading === undefined) return `${prefix}: no such heading in ${queue}`;
      return withinAny(ranges, heading.start) ? `${prefix}: EXCLUDED` : `${prefix}: counted`;
    };

    expect({
      header: withinAny(ranges, 0) ? 'EXCLUDED' : 'counted',
      one: live('## 1. What was decided'),
      two: live('## 2. Nine entries'),
      threeLive: live('## 3. Still outstanding'),
      four: live('## 4. The live risk'),
      five: live('## 5. Where an accepted decision'),
      six: live('## 6. Stale status references'),
      howTo: live('## How to act on a future entry'),
    }).toEqual({
      header: 'counted',
      one: '## 1. What was decided: counted',
      two: '## 2. Nine entries: counted',
      threeLive: '## 3. Still outstanding: counted',
      four: '## 4. The live risk: counted',
      five: '## 5. Where an accepted decision: counted',
      six: '## 6. Stale status references: counted',
      howTo: '## How to act on a future entry: counted',
    });
  });

  it('still finds anchors in that document, so the exclusion cannot have emptied it', () => {
    // If this ever reaches zero the budget row goes spent and the sibling
    // assertion deletes it, which would re-admit unverified anchors silently.
    const remaining = citations.filter((citation) => citation.source === queue);
    const whole = citationsScanningArchives.filter((citation) => citation.source === queue);

    expect(remaining.length).toBeGreaterThan(50);
    expect(whole.length).toBeGreaterThan(remaining.length);
  });

  it('carries the pre-ruling slack across the change rather than spending it', () => {
    /*
     * The row is 187 because 300 - 113 = 187, not because 187 was measured.
     * What is asserted is the DERIVATION: the live count the exclusion left at
     * `faf7ce3a`, plus the headroom the row carried at `36503522`, is the row.
     * #1321 left that headroom deliberately -- "lowering it to the new count
     * would hand the headroom straight back" -- and a budget can never be
     * raised, so an editor who quietly lowers this row to the live count
     * cannot undo it. Spending the slack is therefore a red light.
     *
     * **THE LIVE COUNT IS DELIBERATELY NOT PINNED, AND THE FIRST VERSION OF
     * THIS ASSERTION PINNED IT.** It compared `{ live, budget, slack }`
     * against `{ live: 123, budget: 187, slack: 64 }` as one object, which
     * reads as a tighter check and is in fact the opposite: it makes any
     * movement of `live` a failure, so the 64 of slack the assertion exists to
     * protect could not be used by anybody. The slack IS the permission for
     * `live` to move.
     *
     * Measured, rather than reasoned: combining `faf7ce3a` with #1308 -- a
     * pull request that adds one Polish locale key and touches no document --
     * moved `live` 123 -> 124 by shifting a line this queue cites, and the
     * pinned form failed with `expected { live: 124, budget: 187, slack: 63 }
     * to deeply equal { live: 123, budget: 187, slack: 64 }`. That is a red
     * light on an innocent pull request, which is the exact failure mode
     * #1321 recorded against the old zero-headroom row and the reason this
     * slack was reserved in the first place.
     *
     * So what is pinned is the ROW, against being lowered to the live count,
     * and the floor under the slack. The sibling budget assertion above
     * already fails when `live` exceeds the row; between them, `live` may
     * move freely inside the headroom and may not leave it.
     */
    const SLACK_RESERVED_AT_36503522 = 64;
    const live = citations.filter(
      (citation) => citation.source === queue && !isVerified(citation),
    ).length;
    const budget = UNVERIFIED_BUDGET[queue] ?? 0;

    expect(budget).toBe(123 + SLACK_RESERVED_AT_36503522);
    expect(live).toBeLessThanOrEqual(budget);
  });

  it('costs no other document a single anchor', () => {
    // The exclusion's blast radius, measured rather than promised. Every
    // document but the one named in DATED_ARCHIVE_SECTIONS must be scanned
    // whole, and this is what would catch a delimiter that generalised.
    const per = (all: readonly Citation[]): ReadonlyMap<string, number> => {
      const counts = new Map<string, number>();
      for (const citation of all) counts.set(citation.source, (counts.get(citation.source) ?? 0) + 1);
      return counts;
    };
    const after = per(citations);
    const before = per(citationsScanningArchives);
    const moved = [...before.entries()]
      .filter(([document, count]) => (after.get(document) ?? 0) !== count)
      .map(([document, count]) => `${document}: ${count} -> ${String(after.get(document) ?? 0)}`);

    expect(moved.length).toBe(1);
    expect(moved[0]?.startsWith(`${queue}: `), moved.join(', ')).toBe(true);
  });

  it('agrees with a synthetic document opened by hand, in both directions', () => {
    // The delimiter, exercised on text this test owns, so neither direction
    // depends on the real file still having the shape it has today.
    const synthetic = [
      '# What the owner still has to decide',
      '',
      'The header cites `src/header.ts:1`, `headerSymbol`.',
      '',
      '## 3. Still outstanding: ADR 0013 §§5-6',
      '',
      'The live section cites `src/live.ts:2`, `liveSymbol`.',
      '',
      '## 3. What the anchor pass of 2026-09-19 (third) opened',
      '',
      'The pass account cites `src/archive.ts:3`, `archivedSymbol`.',
      '',
      '## 4. The live risk to watch',
      '',
      'A later live section cites `src/later.ts:4`, `laterSymbol`.',
      '',
    ].join('\n');
    const syntheticRanges = archiveRangesIn(queue, synthetic);
    const state = (needle: string): string =>
      withinAny(syntheticRanges, synthetic.indexOf(needle)) ? 'excluded' : 'counted';

    expect({
      count: syntheticRanges.length,
      header: state('`src/header.ts:1`'),
      live: state('`src/live.ts:2`'),
      archive: state('`src/archive.ts:3`'),
      later: state('`src/later.ts:4`'),
    }).toEqual({ count: 1, header: 'counted', live: 'counted', archive: 'excluded', later: 'counted' });

    // And the same text under any other document's name is scanned whole.
    expect(archiveRangesIn('docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md', synthetic)).toEqual([]);
  });
});
