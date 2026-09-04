import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A documented quotation of source code still appears, verbatim, in the file it
 * names.
 *
 * ## Why a quotation rather than a line number
 *
 * Issue #645 measured the failure this replaces. One Context paragraph of
 * [ADR 0023](../../docs/adr/0023-room-occupancy-authority.md) carried six
 * citations into `src/`; every one was correct when it was written, none was
 * ever edited, and by v0.0.238 all six landed somewhere else -- an interface
 * declaration cited as a summation, two doc comments cited as the branches they
 * describe, a field name (`instance.capacity`) that no longer exists at all.
 * `documentation-source-anchor-contract.test.ts` could condemn none of them,
 * and says so in its own header: *"a line number is a fact about every
 * insertion above it"*, so nothing mechanical can decide whether an anchor
 * landed on the code its sentence means. All six were **in range**.
 *
 * A quotation inverts that. It carries the code with it, so it cannot drift
 * silently; the only thing it can become is a quotation of something that
 * changed, and that is exactly what this file fails on. There is no window, no
 * budget and no version arithmetic, because there is nothing to be stale
 * *relative to*: the claim is about the file as it is now.
 *
 * The owner's ruling on #645 (2026-08-30) named this as the thing to try before
 * building a per-ADR staleness budget on the model of
 * `adr-status-queue-anchor-contract.test.ts`. What it buys and what it does not
 * is set out under "The bound" below.
 *
 * ## Why there is no per-ADR staleness budget, measured rather than argued
 *
 * #645's ruling named three candidates and asked for the third to be tried
 * first. Measured on `4f0b508` (v0.0.238), over the 72 ADRs, of which 46 cite
 * `src/` by `file:line` at all -- 381 anchors between them:
 *
 * 1. **A per-ADR anchor line with `STATUS-QUEUE.md`'s budget of 10 releases.**
 *    This repository took **238 releases in the fourteen days** to that commit,
 *    because `.github/workflows/version.yml` bumps the patch on every push to
 *    `main`. Ten releases is therefore about fourteen hours. Adding that line
 *    to 46 documents would put all 46 permanently red inside a day, on work
 *    none of them touched -- which is the exact failure
 *    `adr-status-queue-anchor-contract.test.ts` says a budget must avoid:
 *    *"a gate that fires on work it has no complaint about does not survive"*.
 *    One document can carry a budget at this cadence because one document can
 *    be re-read in an afternoon. Forty-six cannot.
 * 2. **The ADR's last commit against the last commit of each file it cites.**
 *    Fires on **37 of those 46 today**. It is also silent about whether
 *    anything is wrong: ADR 0023's six citations drifted without a single
 *    commit to ADR 0023, and so would a citation that a refactor left perfectly
 *    correct. It measures editing, not truth.
 * 3. **This.** Fires on exactly the quotations that stopped being verbatim.
 *    Zero today, eight of eight under mutation (below).
 *
 * So the budget is not merely unnecessary here, it is unaffordable at this
 * release cadence, and the reason is in `version.yml` rather than in anything
 * about ADRs. What the budget would have bought and this does not is
 * **coverage**: candidates 1 and 2 say something about every ADR, and this says
 * something only about paragraphs somebody converted. That is the trade, stated
 * plainly, and it is a trade between a gate that is red on 46 documents that
 * are mostly fine and a gate that is red on nothing that is fine.
 *
 * ## The form
 *
 * A quotation is a backtick span. Its attribution is a parenthesis that follows
 * it, naming a repository-rooted path **without** a line number:
 *
 * > `roomCapacity += instance.residentCapacity;`
 * > (verbatim in `src/simulation/presentation/status-strip-projection.ts`)
 *
 * Several quotations from one file may be chained, provided nothing but
 * whitespace separates them, and the count word then has to be right:
 *
 * - no count word -- exactly one quotation binds;
 * - `both` -- exactly two;
 * - `all` -- three or more.
 *
 * The count word is checked because it is the one part of the sentence a reader
 * takes on trust. A paragraph that chains two quotations and says "all" is
 * claiming a coverage the gate is not giving it.
 *
 * **The form is opt-in and this gate polices only documents that use it.** That
 * is deliberate: an implicit rule -- "a backtick span followed by a file path is
 * a quotation" -- was measured against this corpus first and does not work.
 * 71 spans match that shape outside `docs/research/`; 64 are verbatim and the
 * other 7 are not defects but *symbol references* -- `EntityStore.destroy`,
 * `RoomZoningService.zone`, `pnpm verify:stack` -- which name something rather
 * than quote it and must not be required to appear character for character.
 * Nothing in the text distinguishes the two, so the writer has to, and
 * `verbatim in` is how.
 *
 * ## Comparing, and what is normalised away
 *
 * Two things, both forced by the media rather than chosen:
 *
 * - **Comment markers.** A quotation of a comment is a quotation of its text,
 *   not of the prefixes the language needs to carry it, so a leading
 *   block-comment opener or terminator, a leading `*`, a leading `//` or a
 *   leading `#` is stripped from each source line before comparing.
 * - **Whitespace runs.** Markdown re-wraps and source indents, so every run of
 *   whitespace on both sides collapses to one space. A quotation may therefore
 *   span source lines.
 *
 * Nothing else. Case, punctuation and spelling are compared exactly: if the
 * source says `--` the document may not say an em dash, because at that point
 * it is a paraphrase and the reader can no longer grep for it.
 *
 * A quotation must survive normalisation at 12 characters or more. Without that
 * floor the form could be satisfied by quoting `a`, which is in every file.
 *
 * ## The bound, stated first because a green run here reads like more than it is
 *
 * **This cannot tell whether a sentence is true.** It checks that the evidence a
 * sentence offers is still on disk. ADR 0023's sixth drifted citation --
 * *"`room.solitary-cell` for the `high-risk` classification group and
 * `room.cell` for everything else"* -- was a wrong *claim* about a policy whose
 * anchors happened to be fine, and no gate of this shape would have caught it.
 * Only a person reading the code catches that one.
 *
 * It also says nothing about a document that adopts no quotations. Coverage is
 * a writing decision, and the honest way to raise it is to convert paragraphs,
 * not to add an assertion here.
 *
 * ## `docs/research/` is out of scope
 *
 * For the reason `documentation-source-anchor-contract.test.ts` gives for the
 * same exclusion: `docs/research/README.md` keeps those records as dated
 * history -- *"when the code moves on, a record here does not become wrong, it
 * becomes older"* -- so failing the build on one would demand the edit that
 * directory forbids.
 *
 * ## Watched going red
 *
 * Eight mutations, measured on this branch at v0.0.238, each reverted before the
 * next. The full outputs are in the commit that landed this file.
 *
 * - One character changed inside a quotation in ADR 0023
 *   (`residentCapacity` -> `residentCapacty`): **1 failed**, naming the
 *   document, the file and the quotation.
 * - The mutation from the other side, which is the one this gate exists for:
 *   the quotation left alone and the *code* edited
 *   (`roomCapacity += instance.residentCapacity;` -> `roomCapacity += 1;` in
 *   `status-strip-projection.ts`): **1 failed**, with the same message. A
 *   line anchor would have survived this edit unchanged and still pointed at
 *   the wrong thing.
 * - `both` changed to `all` on a two-quotation chain: **1 failed**, on the
 *   count rather than on the quotations, which both still resolved.
 * - The quotation deleted from in front of an attribution, leaving it
 *   orphaned: **1 failed**, *"no quotation immediately before it"*. An
 *   attribution that binds nothing is how this gate would otherwise be
 *   switched off without deleting anything.
 * - A quotation shortened to `r`, which every file contains: **1 failed**,
 *   *"too short to be evidence of anything"*, rather than passing.
 * - The extractor blinded (`verbatim in` -> `verbatimm in`): **6 failed** --
 *   the four written-out fixtures, the corpus floor and the ADR-coverage case.
 * - The converted section deleted from ADR 0023 outright, which is the
 *   vacuity case: **2 failed** -- floor and coverage -- rather than 13 passing
 *   on an empty corpus.
 * - `docs/` dropped from the file walk: **2 failed**, the same pair.
 *
 * ## The wrapped attribution: this gate did not guard, and none of the eight
 * mutations above could see it
 *
 * **Found by mutation on 2026-09-04, and the eight above are left exactly as
 * they stand** -- they were all run and all real, and what the episode records
 * is that a set of mutations can be thorough about the thing it tests and blind
 * to the shape of the input. Every one of them mutated a quotation, a count
 * word or the extractor. None re-wrapped a line.
 *
 * The attribution is prose, and markdown re-wraps prose. `ATTRIBUTION` spelled
 * each gap between its tokens as a **literal space**, so an attribution that
 * wrapped -- most naturally between `verbatim in` and the backticked path,
 * which is where the line gets long -- matched nothing. Two consequences, and
 * the second is the one that makes this the worst failure this file could have:
 *
 * 1. The quotation in front of it was no longer compared to anything.
 * 2. It was **not reported as an orphan either**, because an orphan is an
 *    attribution that *matched* and bound nothing. So the assertion above
 *    whose message is *"an attribution with no quotation in front of it claims
 *    a check that is not being made"* -- this file's own guard against exactly
 *    that -- could not see it.
 *
 * Measured, both directions, on `194f31f5` (v0.0.468). A real quotation in
 * ADR 0023 was falsified (`instance.residentCapacity` ->
 * `instance.THIS_IS_A_LIE`) *and* its attribution wrapped after `verbatim in`:
 * **13 passed, 0 failed**. With the two fixes below, the same mutation is
 * **1 failed**, naming the document, the file and the false quotation.
 *
 * Two defects, two fixes, because either one alone leaves the gate switchable
 * off:
 *
 * - Every gap in `ATTRIBUTION` is `\s` now, in all four places a wrap can land.
 *   Four written-out fixtures cover the four, because the corpus contains no
 *   wrapped attribution today and so cannot notice the pattern going literal
 *   again.
 * - `ATTRIBUTION_SHAPED` reports what `ATTRIBUTION` cannot match. A pattern
 *   cannot report its own misses, so the *only* way an unmatched attribution
 *   becomes visible is a second, looser reading of the same words. Its own
 *   mutation: an attribution given a shape the strict pattern refuses
 *   (`` (verbatim in `…` above) ``) is **1 failed** on *"reads as an
 *   attribution and the pattern cannot match it, so nothing was compared"*,
 *   where before the same edit was **13 passed**.
 *
 * The general lesson, which is `docs/AGENT_WORKFLOW.md` §4's about sentences
 * that rot, applied to a regular expression: **a pattern that matches prose
 * must treat every gap as whitespace, and any pattern that gates something
 * needs a second pattern watching for what it fails to see.** Silence is not
 * evidence.
 */

const ROOT = join(__dirname, '../..');

const RESEARCH = join('docs', 'research');

/**
 * The corpus floor.
 *
 * 20 rather than the live count, for the reason
 * `documentation-source-anchor-contract.test.ts` gives for its own: high enough
 * that an extractor which stopped matching fails here, low enough that editing
 * one paragraph does not. ADR 0023 alone carried 24 quotations when this
 * landed; raising this number as documents convert is fine, lowering it to make
 * a red run green is the thing it is here to prevent.
 */
const MINIMUM_QUOTATIONS = 15;

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

const ROOTED_PATH = /^(?:docs|src|tests|scripts|supabase|public|\.github)\/[^\s`]*\.[A-Za-z0-9]+$/;

/**
 * The attribution: an optional count word, the words `verbatim in`, and one
 * backticked rooted path, all inside parentheses.
 *
 * Anchored on the parentheses at both ends so that prose *about* the convention
 * -- this file's own header, or a sentence explaining the form -- cannot be
 * mistaken for a citation using it.
 *
 * **Every gap between the tokens is `\s`, not a literal space, and that is the
 * whole point of this comment.** Markdown re-wraps prose, and this attribution
 * is prose: a wrap can land in any of the four gaps -- after the parenthesis,
 * after the count word, between `verbatim` and `in`, and between `in` and the
 * path. The pattern this replaced spelled all four as one literal space, so a
 * wrapped attribution matched nothing, and an attribution that matches nothing
 * is not checked and was not reported either. See "The wrapped attribution"
 * below for the measurement.
 */
const ATTRIBUTION = /\(\s*(?:(both|all)\s+)?verbatim\s+in\s+`([^`\n]+)`\s*\)/g;

/**
 * Anything that reads as an attribution, whatever shape it is written in: the
 * words `verbatim in` and a backticked path immediately behind them, with no
 * requirement about parentheses, count word or what follows the path.
 *
 * This exists because `ATTRIBUTION` cannot report its own misses. An
 * attribution it does not match produces no citation *and no orphan*, so a
 * quotation in front of it stops being compared and nothing says so -- the
 * silent failure mode this file's own guard against *"a claim of a check that
 * is not made"* is supposed to cover. Anything matched here and not claimed by
 * `ATTRIBUTION` is that miss.
 *
 * Deliberately narrower than "a parenthesis containing a path": that shape
 * matches 427 spans in this corpus of which 399 are ordinary prose citations
 * (`(\`src/ui/save-panel.ts\`)`), so it would report hundreds of things that are
 * not attributions at all. The two words are what make a span a claim of
 * verbatimness, and requiring a rooted path keeps a sentence that uses the
 * words about something other than a file (*"quoted verbatim in the pull
 * request body"*) out of it. Measured on the corpus at v0.0.468: 28 matches
 * here, 28 claimed by `ATTRIBUTION`, none left over.
 */
const ATTRIBUTION_SHAPED = /verbatim\s+in\s+`([^`\n]+)`/g;

/** A backtick span with the whitespace that may separate it from the next one, read right to left. */
const TRAILING_QUOTE = /`([^`\n]+)`\s*$/;

interface Binding {
  readonly path: string;
  readonly countWord: string | undefined;
  readonly quotations: readonly string[];
}

interface Scan {
  readonly bindings: readonly Binding[];
  /** An attribution that matched, with no quotation in front of it to bind. */
  readonly orphans: readonly string[];
  /** An attribution `ATTRIBUTION` could not match, which is therefore checking nothing. */
  readonly unreadable: readonly string[];
}

interface Citation extends Binding {
  readonly source: string;
}

/**
 * Every citation in a markdown text, and every attribution that binds nothing.
 *
 * The walk is backwards from the attribution over whitespace only. Anything
 * else -- a word, a dash, a comma -- ends the chain, so a quotation is bound to
 * an attribution only when a reader would also read them as one unit.
 *
 * One copy of this rule, called by the corpus scan and by the written-out
 * fixtures below. A second copy of a scanner is issue #188 and this repository
 * has paid for it.
 */
function bindCitations(text: string): Scan {
  const bindings: Binding[] = [];
  const orphans: string[] = [];
  const claimed: [number, number][] = [];

  for (const match of text.matchAll(ATTRIBUTION)) {
    claimed.push([match.index, match.index + match[0].length]);
    const quotations: string[] = [];
    let head = text.slice(0, match.index);
    for (;;) {
      const quote = TRAILING_QUOTE.exec(head);
      if (quote === null) break;
      quotations.unshift(quote[1]!);
      head = head.slice(0, quote.index);
    }
    if (quotations.length === 0) {
      orphans.push(match[0]);
      continue;
    }
    bindings.push({ path: match[2]!, countWord: match[1]?.trim(), quotations });
  }

  const unreadable: string[] = [];
  for (const shaped of text.matchAll(ATTRIBUTION_SHAPED)) {
    if (!ROOTED_PATH.test(shaped[1]!)) continue;
    if (claimed.some(([from, to]) => shaped.index >= from && shaped.index < to)) continue;
    unreadable.push(normalizeQuotation(shaped[0]));
  }

  return { bindings, orphans, unreadable };
}

function citationsIn(file: string): {
  readonly citations: readonly Citation[];
  readonly orphans: readonly string[];
  readonly unreadable: readonly string[];
} {
  const source = relative(ROOT, file);
  const { bindings, orphans, unreadable } = bindCitations(readFileSync(file, 'utf8'));
  return {
    citations: bindings.map((binding) => ({ ...binding, source })),
    orphans: orphans.map((orphan) => `${source} -> ${orphan}: no quotation immediately before it`),
    unreadable: unreadable.map(
      (miss) => `${source} -> ${miss}: reads as an attribution and the pattern cannot match it, so nothing was compared`,
    ),
  };
}

/** A comment prefix is punctuation of the medium, not of the sentence being quoted. */
function normalizeSource(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\/\*\*|\/\*|\*\/|\*|\/\/|#)\s?/, ''))
    .join('\n')
    .replace(/\s+/g, ' ');
}

function normalizeQuotation(quotation: string): string {
  return quotation.replace(/\s+/g, ' ').trim();
}

/** How many quotations the count word promises, or `undefined` when it promises a floor instead. */
function expectedCount(countWord: string | undefined): { readonly exact?: number; readonly atLeast?: number } {
  if (countWord === 'both') return { exact: 2 };
  if (countWord === 'all') return { atLeast: 3 };
  return { exact: 1 };
}

const normalizedSources = new Map<string, string>();
function normalizedSourceOf(path: string): string {
  const cached = normalizedSources.get(path);
  if (cached !== undefined) return cached;
  const normalized = normalizeSource(readFileSync(join(ROOT, path), 'utf8'));
  normalizedSources.set(path, normalized);
  return normalized;
}

/** Every complaint one citation earns. A citation can earn more than one. */
function faultsOf(citation: Citation): readonly string[] {
  const faults: string[] = [];
  // The citation reprinted as it is written, so a failure can be grepped for.
  const countWord = citation.countWord === undefined ? '' : `${citation.countWord} `;
  const where = `${citation.source} -> (${countWord}verbatim in \`${citation.path}\`)`;

  if (!ROOTED_PATH.test(citation.path)) {
    return [`${where}: not a repository-rooted path with an extension`];
  }
  if (!existsSync(join(ROOT, citation.path))) {
    return [`${where}: no such file`];
  }

  const { exact, atLeast } = expectedCount(citation.countWord);
  if (exact !== undefined && citation.quotations.length !== exact) {
    faults.push(
      `${where}: binds ${String(citation.quotations.length)} quotations, and the wording promises ${String(exact)}`,
    );
  }
  if (atLeast !== undefined && citation.quotations.length < atLeast) {
    faults.push(
      `${where}: binds ${String(citation.quotations.length)} quotations, and "all" promises at least ${String(atLeast)}`,
    );
  }

  const normalizedSource = normalizedSourceOf(citation.path);
  for (const quotation of citation.quotations) {
    const normalized = normalizeQuotation(quotation);
    if (normalized.length < 12) {
      faults.push(`${where}: the quotation \`${quotation}\` is too short to be evidence of anything`);
      continue;
    }
    if (!normalizedSource.includes(normalized)) {
      faults.push(`${where}: \`${quotation}\` is not in that file`);
    }
  }

  return faults;
}

const markdownFiles = [
  ...collectMarkdownFiles(join(ROOT, 'docs')),
  ...readdirSync(ROOT)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => join(ROOT, entry)),
].filter((file) => !relative(ROOT, file).startsWith(RESEARCH));

const scanned = markdownFiles.map(citationsIn);
const citations = scanned.flatMap((result) => result.citations);
const orphans = scanned.flatMap((result) => result.orphans);
const unreadable = scanned.flatMap((result) => result.unreadable);
const quotationCount = citations.reduce((total, citation) => total + citation.quotations.length, 0);

describe('the extractor and the comparison, against written-out inputs', () => {
  /*
   * A positive control in the shape `content-validation-reachability-contract`
   * uses: the scanner is run on text written out here, so a change that made it
   * stop matching -- or match everything -- fails on inputs whose answer is
   * fixed, not on a corpus that moves. Every assertion over the real corpus
   * below is a `toEqual([])`, and a set of "found nothing" claims cannot notice
   * a scanner finding nothing for the wrong reason.
   */
  it('binds one quotation to a bare attribution, and stops at the first word', () => {
    const { bindings } = bindCitations(
      ('the strip sums it:\n`roomCapacity += x;`\n(verbatim in `src/a.ts`)'),
    );

    expect(bindings).toEqual([
      { path: 'src/a.ts', countWord: undefined, quotations: ['roomCapacity += x;'] },
    ]);
  });

  it('chains across whitespace only', () => {
    const { bindings } = bindCitations(
      ('lines:\n`first line;`\n`second line;`\n(both verbatim in `src/a.ts`)'),
    );

    expect(bindings).toEqual([
      { path: 'src/a.ts', countWord: 'both', quotations: ['first line;', 'second line;'] },
    ]);
  });

  it('does not chain across a word, so a symbol named in prose is not swept in', () => {
    const { bindings } = bindCitations(
      ('`RoomOccupancyViewModel` declares\n`readonly free: number;`\n(verbatim in `src/a.ts`)'),
    );

    expect(bindings).toEqual([
      { path: 'src/a.ts', countWord: undefined, quotations: ['readonly free: number;'] },
    ]);
  });

  it('binds across a line wrap in every gap the attribution has', () => {
    // The four gaps a markdown re-wrap can land in. Written out because the
    // corpus has no wrapped attribution today, so nothing in the `toEqual([])`
    // assertions below would notice the pattern going literal-space again.
    const wraps = [
      'lines:\n`first line;`\n`second line;`\n(\nboth verbatim in `src/a.ts`)',
      'lines:\n`first line;`\n`second line;`\n(both\nverbatim in `src/a.ts`)',
      'lines:\n`first line;`\n`second line;`\n(both verbatim\nin `src/a.ts`)',
      'lines:\n`first line;`\n`second line;`\n(both verbatim in\n`src/a.ts`)',
    ];

    expect(wraps.map((text) => bindCitations(text))).toEqual(
      wraps.map(() => ({
        bindings: [{ path: 'src/a.ts', countWord: 'both', quotations: ['first line;', 'second line;'] }],
        orphans: [],
        unreadable: [],
      })),
    );
  });

  it('reports an attribution whose shape the pattern cannot match, rather than ignoring it', () => {
    // The defect this pair of assertions exists for: an unmatched attribution
    // produced no citation *and* no orphan, so the quotation in front of it
    // stopped being compared and the suite stayed green. Each of these is a
    // shape `ATTRIBUTION` refuses; none may be silent.
    const shapes = [
      'the strip sums it:\n`roomCapacity += x;`\n(three verbatim in `src/a.ts`)',
      'the strip sums it:\n`roomCapacity += x;`\nverbatim in `src/a.ts`',
      'the strip sums it:\n`roomCapacity += x;`\n(verbatim in `src/a.ts`.)',
    ];

    expect(shapes.map((text) => bindCitations(text).unreadable)).toEqual([
      ['verbatim in `src/a.ts`'],
      ['verbatim in `src/a.ts`'],
      ['verbatim in `src/a.ts`'],
    ]);
    expect(shapes.flatMap((text) => [...bindCitations(text).bindings, ...bindCitations(text).orphans])).toEqual([]);
  });

  it('does not read a sentence that uses the words about something other than a file as an attribution', () => {
    // `ATTRIBUTION_SHAPED` drops the parentheses that keep prose out, so the
    // rooted-path requirement is the only thing left doing that job.
    const { bindings, orphans: orphansFound, unreadable: unreadableFound } = bindCitations(
      'the entry is quoted verbatim in `the pull request body` instead',
    );

    expect([...bindings, ...orphansFound, ...unreadableFound]).toEqual([]);
  });

  it('reports an attribution with nothing quotable in front of it', () => {
    const { bindings, orphans: orphansFound } = bindCitations(('as the code says (verbatim in `src/a.ts`)'));

    expect(bindings).toEqual([]);
    expect(orphansFound).toEqual(['(verbatim in `src/a.ts`)']);
  });

  it('reads prose about the convention as prose', () => {
    // This file's own header contains the words. A gate that treated them as a
    // citation would fail on its own documentation.
    const { bindings, orphans: orphansFound } = bindCitations(
      ('the attribution is the words `verbatim in` followed by a path'),
    );

    expect([...bindings, ...orphansFound]).toEqual([]);
  });

  it('accepts a quotation of a comment across its line prefixes and the markdown re-wrap', () => {
    const source = normalizeSource(['  /**', '   * The resident capacity, because this', '   * counter sits beside it.', '   */'].join('\n'));

    expect(source).toContain(normalizeQuotation('The resident capacity, because this\ncounter sits beside it.'));
  });

  it('rejects a quotation that differs by one character', () => {
    const source = normalizeSource('  roomCapacity += instance.residentCapacity;');

    expect(source).not.toContain(normalizeQuotation('roomCapacity += instance.residentCapacty;'));
  });

  it('rejects a paraphrase that swaps the punctuation the source actually uses', () => {
    const source = normalizeSource(' * a share of nothing -- no meaning');

    expect(source).not.toContain(normalizeQuotation('a share of nothing — no meaning'));
  });

  it('counts what each wording promises', () => {
    expect([expectedCount(undefined), expectedCount('both'), expectedCount('all')]).toEqual([
      { exact: 1 },
      { exact: 2 },
      { atLeast: 3 },
    ]);
  });
});

describe('every documented quotation of source code is still in the file it names', () => {
  it('finds quotations to check, so this cannot pass vacuously', () => {
    expect(
      quotationCount,
      `only ${String(quotationCount)} quotations were found in the documentation. Either the extractor stopped matching or the documents that used the form stopped using it; do not lower MINIMUM_QUOTATIONS to make this pass`,
    ).toBeGreaterThanOrEqual(MINIMUM_QUOTATIONS);
  });

  it('finds them in docs/adr/, which is the corpus the form was introduced for', () => {
    // Named separately from the floor above because the floor could one day be
    // met entirely by documents outside `docs/adr/`, and #645's ruling is about
    // ADRs. ADR 0023 is the document that conforms today.
    const inAdrs = citations.filter((citation) => citation.source.startsWith(join('docs', 'adr')));

    expect(
      inAdrs.map((citation) => citation.source),
      'no ADR cites code by quotation any more',
    ).not.toEqual([]);
  });

  it('binds every attribution to a quotation', () => {
    expect(
      orphans,
      'an attribution with no quotation in front of it claims a check that is not being made',
    ).toEqual([]);
  });

  it('leaves no attribution the pattern cannot read', () => {
    expect(
      unreadable,
      'an attribution the pattern cannot match is checking nothing, and produces no orphan to say so -- the quotation in front of it is being taken on trust',
    ).toEqual([]);
  });

  it('resolves every quotation against the file its citation names', () => {
    const faults = citations.flatMap(faultsOf);

    expect(
      faults,
      'a quotation that is no longer in the file it names is either a document to rewrite or a change to the code that nobody told the document about',
    ).toEqual([]);
  });
});
