import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A merge conflict marker must not survive into a tracked file.
 *
 * ## The measurement, because that is why this file exists
 *
 * Issue #983 was written after the integrator ran `tests/foundation` against a
 * `docs/research/README.md` that still carried `<<<<<<< HEAD`, `=======` and
 * `>>>>>>> origin/main`, by accident, before resolving it. The suite passed.
 * Re-measured on this branch's base (`1ad2189a`, v0.0.483) with the same three
 * marker lines committed into that file and no other change: `tsc -b` and
 * `tsc -b tsconfig.tools.json` both exit 0, `tests/foundation` reports
 * **483 passed (483)**, and the whole of `pnpm test` reports **401 passed
 * (401)** files and **4729 passed | 1 skipped**. Every gate this repository
 * has says a tree carrying a conflict marker is fine.
 *
 * The reason is structural rather than accidental. `docs/**` is not on the
 * TypeScript path, so `pnpm typecheck` cannot see it; no test imports a
 * Markdown file, so `pnpm test` cannot see it either; and the marker renders
 * as literal text inside a Markdown table cell, so a diff view of
 * `docs/research/README.md` goes on looking approximately right. The file this
 * happens to is not chosen at random: every research note indexes itself into
 * that one append point, so *n* notes landing in parallel cost *n − 1* hand
 * resolutions, and the integrator recorded eight of them by hand across
 * 2026-09-04 and 2026-09-05. Each is a regex over the markers followed by a
 * `git add`. One mis-scoped regex puts the residue on `main`.
 *
 * ## What is scanned, and why that is the boundary
 *
 * Every **tracked** file, enumerated from `git ls-files`, read from the working
 * tree. Not the whole directory tree, and the reason is the subject rather than
 * the arithmetic: a marker under `node_modules/`, `dist/` or
 * `benchmark-results/` is not this repository's file and cannot reach `main`,
 * so a finding there would be a red about work nobody here did.
 * `tests/foundation/typecheck-coverage-contract.test.ts` already draws its
 * subject the same way and for the same reason.
 *
 * **The false-positive argument for that boundary is the one this repository
 * would expect and it is not supported here, so it is not made.** A whole-tree
 * walk was measured rather than imagined: `node_modules/` in this container is
 * 8,499 files and 508 MB, and it contains **zero** lines beginning with a
 * marker and zero lines that are exactly seven `=`. What the boundary actually
 * buys today is the walk staying at 1,413 files instead of ten thousand, and a
 * gate whose subject does not change when a dependency is added.
 *
 * A tracked file is read as text unless its first 8 KiB contain a NUL byte,
 * which is the heuristic `git` itself uses to call a blob binary. Two
 * consequences worth stating because both were measured rather than assumed:
 *
 * - **A Git LFS pointer is a text file, and is therefore in scope.** It is
 *   about 130 bytes reading `version https://git-lfs.github.com/spec/v1`, an
 *   oid and a size. Measured on this base in a container where LFS content is
 *   *not* expanded: 1390 of 1413 tracked files read as text, **62 of them LFS
 *   pointers**, and none produced a finding — no pointer line can begin with a
 *   marker. In a container where the smudge filter has run, those same 62 are
 *   PNG and `.blend` data, the NUL check skips them, and the result is the
 *   same. `docs/AGENT_WORKFLOW.md` records that the direction differs per
 *   container and is not a repository fact, so this gate is written to be
 *   indifferent to it.
 * - **The 23 screenshots under `docs/research/` are skipped as binary.** They
 *   are not covered by `.gitattributes`' LFS globs, so they are real PNG bytes
 *   in every container.
 *
 * Cost of the whole walk, measured on this base: **133 ms** over 27.1 MB.
 *
 * **Tracked means in the index, so a file that has never been `git add`ed is
 * not scanned.** That is the boundary being drawn rather than a gap in it --
 * an unstaged file cannot be committed and cannot reach `main` -- but it is
 * worth knowing while writing a new file, because this contract's own file
 * failed its self-check for exactly that reason before it was staged.
 *
 * ## The three shapes, and why the pair alone is not enough
 *
 * Issue #983 proposes that "a real check should require the *pair* rather than
 * either alone". That is right about false positives and wrong about the
 * defect it is guarding, so this file does both and reports them separately.
 *
 * 1. **A complete hunk** — an open line, then a separator, then a close line,
 *    in that order, with an optional `|||||||` base line from `diff3` style in
 *    between. This is an unresolved conflict, verbatim as `git merge` wrote it.
 * 2. **An unpaired marker line.** The incident #983 describes is a *regex*
 *    resolution: two of the three lines are removed and one is left. A check
 *    that requires the pair is blind to exactly the residue the issue is about,
 *    which is the whole reason the issue exists. So an open, base or close line
 *    that no complete hunk claims is reported on its own.
 * 3. **A marker-shaped line the strict patterns cannot read** — seven or more
 *    of `<`, `>` or `|` at the start of a line, in a shape the two rules above
 *    refuse. This is the second-pattern discipline
 *    `tests/foundation/adr-quotation-verbatim-contract.test.ts` had to learn
 *    when its attribution pattern went silently blind (#981): a pattern cannot
 *    report its own misses, so a looser reading of the same lines is the only
 *    thing that can. Measured on this base: **0** such lines.
 *
 * ## The exclusion rule, which is the part that decides whether this survives
 *
 * A gate that shouts at documentation about merge conflicts gets switched off,
 * and then it guards nothing. Three exclusions, in the order they do work:
 *
 * **1. The marker must start the line.** This is the whole rule, and it is why
 * there is almost nothing to exempt. Prose that quotes a marker quotes it
 * inline, inside backticks — issue #983 does, `docs/TESTING.md` now does, and
 * so does this docblock, whose every line begins with an asterisk. `git` only
 * ever writes a marker at column zero. Measured over all 1390 tracked text
 * files at `1ad2189a`: **0 lines begin with seven `<`, `>`, `|` or `=`**, so
 * the rule has no false positive to trade away today.
 *
 * **2. A bare separator line is never a finding on its own.** `=======` alone
 * is a legal setext heading underline in Markdown and a decorative rule
 * everywhere else, so it is counted only in a file that already carries an
 * open, base or close line. That is a deliberate blind spot with a name: a
 * resolution that deleted the open and close lines and left only the separator
 * is invisible here, and cannot be made visible without accusing ordinary
 * prose. It is the narrowest of the three residues and the only one that
 * carries no ref, so it is also the one a reader is most likely to notice.
 *
 * Measured, so that the exclusion is not taken on faith: `=======` appears as a
 * substring in **15** tracked files at this base — decorative rules in SQL and
 * TypeScript comments, and separator bars printed by the playtest instruments —
 * and **none** of them is a line that is exactly seven `=` and nothing else.
 *
 * **3. `QUOTES_A_CONFLICT` is the escape hatch, and it is empty.** A document
 * that has to reproduce a whole conflict inside a fenced code block would trip
 * rule 1 legitimately. No tracked file does today, so the list is empty and the
 * mechanism is held by fixtures below rather than by a live entry. Every entry
 * it ever gains is asserted to be tracked, to be a `.md` file under `docs/`,
 * and to still contain a marker — an exemption that has stopped guarding
 * anything is a hole with nothing behind it, and is reported as one.
 *
 * **The rejected alternative was exempting fenced code blocks by shape**, which
 * needs no list at all and is therefore tempting. It was refused because a real
 * conflict between two branches that both edited a code sample lands *inside*
 * the fence, and a shape rule cannot tell that from a quotation. A short list
 * that a reviewer sees grow is the cheaper failure.
 *
 * ## Where this lives, and why not `scripts/`
 *
 * `.github/workflows/ci.yml`'s `verify` job runs `pnpm verify` on every
 * `pull_request`, and `package.json` defines that as `pnpm typecheck && pnpm
 * test && …`. So a `tests/foundation` contract runs before a merge with nothing
 * to wire up, in the same command a developer already runs, and in the same
 * suite that was measured green on the conflicted tree. A `scripts/verify-*.mjs`
 * would need a line in `package.json` and a step in the workflow before it
 * gated anything, and would run nowhere else. The issue asks for the first
 * shape and the first shape is right.
 */

/** Seven `<` beginning a line, followed by a ref or nothing. Exactly seven: an eighth is not what `git` writes. */
const CONFLICT_OPEN = /^<{7}(?: |$)/u;

/** The `diff3` and `zdiff3` base section. Absent from the default `merge.conflictStyle`, and free to check for. */
const CONFLICT_BASE = /^\|{7}(?: |$)/u;

/** Exactly seven `=` alone on a line. Never a finding by itself -- see exclusion 2 in the docblock above. */
const CONFLICT_SEPARATOR = /^={7}$/u;

/** Seven `>` beginning a line, followed by a ref or nothing. */
const CONFLICT_CLOSE = /^>{7}(?: |$)/u;

/**
 * Anything that reads as a marker, in any shape.
 *
 * This is the looser second reading that reports what the four strict patterns
 * above cannot match -- an eighth `<`, or a ref pushed up against the seventh
 * with no space. Without it a mangled residue produces no finding *and no
 * report that nothing was checked*, which is the silent-gate shape #981 paid
 * for. `=` is deliberately not in this class: a line of eight or more `=` is an
 * ordinary decorative rule and would make this the pattern that gets the file
 * deleted.
 */
const MARKER_SHAPED = /^[<>|]{7,}/u;

/**
 * Tracked files allowed to carry a line-anchored marker because they reproduce
 * a conflict rather than contain one.
 *
 * Empty, and expected to stay small. Inline quotation in backticks -- which is
 * how every document in this repository that mentions a marker writes one --
 * does not begin a line and needs no entry here.
 */
const QUOTES_A_CONFLICT: readonly string[] = [];

/**
 * A floor, not the live count.
 *
 * 900 against a measured 1390: high enough that a `git ls-files` returning
 * nothing, or a binary heuristic that swallowed the corpus, fails here instead
 * of passing everything downstream; low enough that deleting a directory does
 * not.
 */
const MINIMUM_TEXT_FILES = 900;

const ROOT = join(__dirname, '../..');

const SELF = 'tests/foundation/merge-conflict-marker-contract.test.ts';

type MarkerKind = 'open' | 'base' | 'separator' | 'close' | 'shaped';

interface MarkerLine {
  readonly line: number;
  readonly kind: MarkerKind;
  readonly text: string;
}

interface FileFinding {
  readonly path: string;
  readonly line: number;
  readonly kind: MarkerKind;
  readonly text: string;
}

function classify(line: string): MarkerKind | null {
  if (CONFLICT_OPEN.test(line)) return 'open';
  if (CONFLICT_BASE.test(line)) return 'base';
  if (CONFLICT_CLOSE.test(line)) return 'close';
  if (CONFLICT_SEPARATOR.test(line)) return 'separator';
  if (MARKER_SHAPED.test(line)) return 'shaped';
  return null;
}

/** Every marker-shaped line in one file's text, in order. CRLF is tolerated: `.gitattributes` normalises it, this does not depend on that. */
function scanText(text: string): readonly MarkerLine[] {
  const found: MarkerLine[] = [];
  text.split(/\r?\n/u).forEach((line, index) => {
    const kind = classify(line);
    if (kind !== null) found.push({ line: index + 1, kind, text: line.slice(0, 80) });
  });
  return found;
}

interface Reading {
  /** A complete `open … separator … close` hunk, reported by its opening line. */
  readonly hunks: readonly MarkerLine[];
  /** An open, base or close line no hunk claims, plus any separator keeping it company. */
  readonly residue: readonly MarkerLine[];
  /** Marker-shaped, and none of the strict patterns can read it. */
  readonly unreadable: readonly MarkerLine[];
}

function read(markers: readonly MarkerLine[]): Reading {
  const hunks: MarkerLine[] = [];
  const unclaimed: MarkerLine[] = [];
  const unreadable = markers.filter((marker) => marker.kind === 'shaped');

  const structural = markers.filter((marker) => marker.kind !== 'shaped');
  let index = 0;
  while (index < structural.length) {
    const marker = structural[index];
    if (marker === undefined) break;
    if (marker.kind !== 'open') {
      unclaimed.push(marker);
      index += 1;
      continue;
    }

    let cursor = index + 1;
    let sawSeparator = false;
    let closedAt = -1;
    while (cursor < structural.length) {
      const next = structural[cursor];
      if (next === undefined) break;
      if (next.kind === 'open') break;
      if (next.kind === 'separator') {
        sawSeparator = true;
        cursor += 1;
        continue;
      }
      if (next.kind === 'close') {
        if (sawSeparator) closedAt = cursor;
        break;
      }
      cursor += 1;
    }

    if (closedAt >= 0) {
      hunks.push(marker);
      index = closedAt + 1;
      continue;
    }
    unclaimed.push(marker);
    index += 1;
  }

  const anchors = unclaimed.filter((marker) => marker.kind !== 'separator');
  const residue = anchors.length === 0 ? [] : [...unclaimed].sort((a, b) => a.line - b.line);

  return { hunks, residue, unreadable };
}

interface Corpus {
  readonly text: ReadonlyMap<string, string>;
  readonly binary: readonly string[];
  readonly tracked: readonly string[];
}

function trackedPaths(): readonly string[] {
  const listed = spawnSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  expect(listed.status, `git ls-files failed: ${listed.stderr}`).toBe(0);
  return listed.stdout.split('\0').filter((entry) => entry !== '');
}

/** `git`'s own heuristic: a NUL byte in the first 8 KiB makes a blob binary. */
function looksBinary(absolute: string, size: number): boolean {
  if (size === 0) return false;
  const head = Buffer.alloc(Math.min(8000, size));
  const handle = openSync(absolute, 'r');
  try {
    const bytesRead = readSync(handle, head, 0, head.length, 0);
    return head.subarray(0, bytesRead).includes(0);
  } finally {
    closeSync(handle);
  }
}

function collectCorpus(): Corpus {
  const tracked = trackedPaths();
  const text = new Map<string, string>();
  const binary: string[] = [];

  for (const path of tracked) {
    const absolute = join(ROOT, path);
    const stats = statSync(absolute);
    if (!stats.isFile()) continue;
    if (looksBinary(absolute, stats.size)) {
      binary.push(path);
      continue;
    }
    text.set(path, readFileSync(absolute, 'utf8'));
  }

  return { text, binary, tracked };
}

const corpus = collectCorpus();

/**
 * The whole gate, as a function of its corpus and its exemptions.
 *
 * Pure and parameterised so that the fixtures below exercise the code the
 * repository is actually gated by, rather than a second copy of its logic
 * written beside it -- `docs/TESTING.md` calls a fixture that supplies both
 * sides of a comparison the form this repository keeps paying for.
 */
function collectFindings(
  files: ReadonlyMap<string, string>,
  exempt: readonly string[],
  pick: (reading: Reading) => readonly MarkerLine[],
): readonly FileFinding[] {
  const findings: FileFinding[] = [];
  for (const [path, content] of files) {
    if (exempt.includes(path)) continue;
    for (const marker of pick(read(scanText(content)))) {
      findings.push({ path, line: marker.line, kind: marker.kind, text: marker.text });
    }
  }
  return findings;
}

function findingsOf(pick: (reading: Reading) => readonly MarkerLine[]): readonly FileFinding[] {
  return collectFindings(corpus.text, QUOTES_A_CONFLICT, pick);
}

function describeFindings(findings: readonly FileFinding[]): readonly string[] {
  return findings.map((finding) => `${finding.path}:${finding.line} (${finding.kind}) ${finding.text}`);
}

/*
 * Fixtures. Written as arrays joined with a newline rather than as template
 * literals, so that no line of this file itself begins with a marker: the
 * assertion below that this file is scanned and clean is only worth something
 * if it is not quietly arranged.
 */
const OPEN_LINE = `${'<'.repeat(7)} HEAD`;
const SEPARATOR_LINE = '='.repeat(7);
const CLOSE_LINE = `${'>'.repeat(7)} origin/main`;
const BASE_LINE = `${'|'.repeat(7)} merged common ancestors`;

const UNRESOLVED = [
  '| a row that was already here |',
  OPEN_LINE,
  '| the row this branch added |',
  SEPARATOR_LINE,
  '| the row the other branch added |',
  CLOSE_LINE,
  '',
].join('\n');

const DIFF3_UNRESOLVED = [OPEN_LINE, 'ours', BASE_LINE, 'base', SEPARATOR_LINE, 'theirs', CLOSE_LINE, ''].join('\n');

/** What a mis-scoped resolution leaves: the open line survives alone. */
const HALF_RESOLVED = ['| a row that was already here |', OPEN_LINE, '| the row that was kept |', ''].join('\n');

/** Legitimate prose: a setext heading, and a marker quoted inline. */
const INNOCENT = [
  'Resolving a conflict',
  '='.repeat(21),
  '',
  `A conflict opens with \`${OPEN_LINE}\` and closes with \`${CLOSE_LINE}\`.`,
  '',
  '='.repeat(7),
  '',
].join('\n');

describe('a merge conflict marker cannot reach a tracked file', () => {
  it('reads a corpus large enough for an empty walk to be a failure', () => {
    expect(corpus.tracked.length).toBeGreaterThanOrEqual(MINIMUM_TEXT_FILES);
    expect(corpus.text.size).toBeGreaterThanOrEqual(MINIMUM_TEXT_FILES);

    // No third category. Every tracked regular file is either read as text or
    // named as binary, so a file cannot fall out of the walk unnoticed.
    expect(corpus.text.size + corpus.binary.length).toBe(corpus.tracked.length);

    // The two files this contract makes claims about are in the corpus by name
    // rather than by count: the index #983 is about, and this file.
    expect(corpus.text.has('docs/research/README.md')).toBe(true);
    expect(corpus.text.has(SELF)).toBe(true);
  });

  it('leaves no tracked file carrying an unresolved conflict hunk', () => {
    const findings = findingsOf((reading) => reading.hunks);
    expect(
      describeFindings(findings),
      'a tracked file contains a whole merge conflict, exactly as `git merge` wrote it. Nothing else in this repository can see it: `docs/**` is off the TypeScript path and no test imports a Markdown file, which is how #983 measured 480 green on a conflicted tree. Resolve the conflict; do not delete the markers and keep both halves',
    ).toEqual([]);
  });

  it('leaves no tracked file carrying an unpaired marker line', () => {
    const findings = findingsOf((reading) => reading.residue);
    expect(
      describeFindings(findings),
      'a tracked file contains a conflict marker with no matching pair, which is what a mis-scoped resolution regex leaves behind -- the residue #983 is actually about. Remove the line and check the surrounding text is the resolution you meant',
    ).toEqual([]);
  });

  it('leaves no marker-shaped line the strict patterns cannot read', () => {
    const findings = findingsOf((reading) => reading.unreadable);
    expect(
      describeFindings(findings),
      'a line reads as a conflict marker and none of the four strict patterns can match it, so nothing above checked it. Either it is a mangled marker and the file needs resolving, or the strict patterns need widening to cover the shape',
    ).toEqual([]);
  });

  it('carries no exemption that has stopped guarding anything', () => {
    const stale: string[] = [];
    const misplaced: string[] = [];

    for (const path of QUOTES_A_CONFLICT) {
      if (!path.startsWith('docs/') || !path.endsWith('.md')) {
        misplaced.push(path);
        continue;
      }
      const content = corpus.text.get(path);
      if (content === undefined) {
        stale.push(`${path} (not a tracked text file)`);
        continue;
      }
      const markers = scanText(content).filter((marker) => marker.kind !== 'separator');
      if (markers.length === 0) stale.push(`${path} (no marker left in it)`);
    }

    expect(
      misplaced,
      'an exemption may only name a Markdown document under `docs/`. Source and data files have no reason to reproduce a conflict',
    ).toEqual([]);
    expect(
      stale,
      'an exemption names a file that no longer contains a marker, so it is exempting nothing and hiding whatever lands there next. Delete the entry',
    ).toEqual([]);
  });

  it('scans its own file, which contains the marker strings and is not exempt', () => {
    // The exclusion this gate depends on is that a marker must begin a line.
    // This file is the hardest case for that rule -- it names every marker in
    // prose and builds four of them as fixtures -- so it is the case worth
    // asserting rather than a synthetic one.
    const self = corpus.text.get(SELF);
    expect(self, 'this contract must be able to read itself').toBeTypeOf('string');
    expect(QUOTES_A_CONFLICT).not.toContain(SELF);

    for (const marker of [OPEN_LINE, SEPARATOR_LINE, CLOSE_LINE]) {
      expect(self, `this file must actually contain ${marker} for the check below to prove anything`).toContain(marker);
    }

    const reading = read(scanText(self ?? ''));
    expect(reading.hunks).toEqual([]);
    expect(reading.residue).toEqual([]);
    expect(reading.unreadable).toEqual([]);
  });

  it('reports each of the three shapes, and refuses the two that are ordinary prose', () => {
    const whole = read(scanText(UNRESOLVED));
    expect(whole.hunks.map((marker) => marker.line)).toEqual([2]);
    expect(whole.residue).toEqual([]);

    const diff3 = read(scanText(DIFF3_UNRESOLVED));
    expect(diff3.hunks.map((marker) => marker.line)).toEqual([1]);
    expect(diff3.residue).toEqual([]);

    // The case a pair-only check is blind to, which is why this file does not
    // use one.
    const half = read(scanText(HALF_RESOLVED));
    expect(half.hunks).toEqual([]);
    expect(half.residue.map((marker) => `${marker.line}:${marker.kind}`)).toEqual(['2:open']);

    const mangled = read(scanText([`${'<'.repeat(8)} HEAD`, `${'<'.repeat(7)}HEAD`].join('\n')));
    expect(mangled.unreadable.map((marker) => marker.line)).toEqual([1, 2]);

    // A setext underline and an inline quotation are prose, and a bare
    // separator in a file with no other marker is never a finding.
    const innocent = read(scanText(INNOCENT));
    expect(innocent.hunks).toEqual([]);
    expect(innocent.residue).toEqual([]);
    expect(innocent.unreadable).toEqual([]);
  });

  it('honours an exemption for the file named and for no other', () => {
    const files = new Map([
      ['docs/example-conflict.md', UNRESOLVED],
      ['docs/an-ordinary-note.md', UNRESOLVED],
    ]);

    expect(collectFindings(files, [], (reading) => reading.hunks).map((finding) => finding.path)).toEqual([
      'docs/example-conflict.md',
      'docs/an-ordinary-note.md',
    ]);
    expect(
      collectFindings(files, ['docs/example-conflict.md'], (reading) => reading.hunks).map((finding) => finding.path),
    ).toEqual(['docs/an-ordinary-note.md']);
  });
});
