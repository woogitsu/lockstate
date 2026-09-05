import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `docs/research/README.md` names every record `docs/research/` holds, and
 * every row it carries sits inside its one table.
 *
 * ## The defect this exists for, measured rather than assumed
 *
 * `tests/foundation/adr-numbering-contract.test.ts` makes an ADR's index row
 * mandatory in the same commit as the ADR, and says why in its own failure
 * message: *"Adding an ADR means adding its row in the same commit, and the
 * index says so itself"*. `docs/research/` had no such check, and the cost was
 * measured on 2026-09-05 by counting the directory against the table:
 *
 * - **Ten records had no row at all.** Eight dated notes, this directory's one
 *   undated audit distillation (`ARCHITECTURE_PATTERN_AUDIT.md`), and the
 *   `design-search-2026-08-29/` corpus, which nothing in the repository linked
 *   to by path -- a directory of six documents reduced from nineteen
 *   owner-supplied answers, reachable only by listing the directory.
 * - **Twenty-four further rows had drifted out of the table**, appended after
 *   the closing bullet of the index's own "Findings" section with no header
 *   above them, so the append point the index describes had become the end of
 *   the *file* rather than the end of the *table*.
 * - One of the ten, `2026-09-05-what-a-sweep-costs-the-response.md`, is cited
 *   by name in
 *   `docs/adr/0073-who-orders-a-contraband-search.md`'s own amendment while
 *   being absent from the index that is supposed to name it. A record an ADR
 *   depends on can therefore be invisible to a reader who starts, as the index
 *   invites them to, at the index.
 *
 * Nothing in the repository failed on any of that, for the same reason
 * `adr-numbering-contract.test.ts` records for the duplicated ADR number:
 * nothing read the directory.
 *
 * ## What this checks, and what it deliberately does not
 *
 * Strictly mechanical. It compares a directory listing against a table and
 * rules on neither. It says nothing about whether a row *describes* its record
 * truthfully -- that is a reading, and the index's own rules about naming a
 * weakest claim are addressed to a person.
 *
 * The `documentation-links-contract` already resolves each row's target and
 * would catch a row pointing at nothing; the direction that was unguarded is
 * the reverse one, a record with no row, which no link check can see because
 * there is no link to check.
 *
 * ## Why a directory is treated differently from a file
 *
 * Two collections live in subdirectories here and they are reached by
 * different routes, so a rule that demanded the same of both would have fired
 * on legitimate work:
 *
 * - `design-search-2026-08-29/` indexes itself with its own `README.md` and
 *   now has a row of its own.
 * - `audit-2026-08-26/` has no `README.md`; all eleven of its documents are
 *   linked, one by one, from `2026-08-26-repository-audit.md`, which is
 *   indexed. Demanding a row for the directory would have asked for a row
 *   pointing at nothing in particular.
 *
 * So a subdirectory holding markdown has to be **named by the index** -- by a
 * row into it, or by a link into it from a record the index names -- and not
 * necessarily by a row. That is the check the `design-search` case actually
 * needed: it was neither. Directories holding only screenshots are a note's
 * own attachments and are not records; they are skipped, which is why the rule
 * keys on holding markdown rather than on existing.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const RESEARCH_ROOT = join(REPOSITORY_ROOT, 'docs', 'research');
const INDEX = join(RESEARCH_ROOT, 'README.md');

/** The index is the table, not a record in it. */
const INDEX_FILENAME = 'README.md';

/** `| [label](./target) | … |` -- the only row shape this table has ever used. */
const INDEX_ROW = /^\|\s*\[([^\]]*)\]\(\.\/([^)]+)\)\s*\|/;

const TABLE_HEADER = '| Record | Question it answered | Decision it fed |';

interface IndexRow {
  readonly label: string;
  readonly target: string;
  readonly line: number;
}

function readIndex(): string[] {
  return readFileSync(INDEX, 'utf8').split('\n');
}

function readRows(): IndexRow[] {
  const rows: IndexRow[] = [];
  readIndex().forEach((line, offset) => {
    const match = INDEX_ROW.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) return;
    rows.push({ label: match[1], target: match[2], line: offset + 1 });
  });
  return rows;
}

/** Top-level markdown records: every `.md` in `docs/research/` but the index. */
function readRecords(): string[] {
  return readdirSync(RESEARCH_ROOT)
    .filter((entry) => entry.endsWith('.md') && entry !== INDEX_FILENAME)
    .filter((entry) => statSync(join(RESEARCH_ROOT, entry)).isFile())
    .sort();
}

/** Subdirectories of `docs/research/` that hold at least one markdown file. */
function readCollections(): string[] {
  return readdirSync(RESEARCH_ROOT)
    .filter((entry) => statSync(join(RESEARCH_ROOT, entry)).isDirectory())
    .filter((entry) =>
      readdirSync(join(RESEARCH_ROOT, entry)).some((child) => child.endsWith('.md')),
    )
    .sort();
}

/**
 * Every relative markdown link written inside a file the index names, as a
 * path relative to `docs/research/`. This is what "the index names it" means
 * for a collection reached through a record rather than through a row.
 */
function pathsLinkedFromIndexedRecords(): Set<string> {
  const linked = new Set<string>();
  for (const row of readRows()) {
    const source = join(RESEARCH_ROOT, row.target);
    if (!existsSync(source) || !statSync(source).isFile()) continue;
    const body = readFileSync(source, 'utf8');
    for (const match of body.matchAll(/\]\((\.\/[^)]+|\.\.\/[^)]+)\)/g)) {
      const target = match[1];
      if (target === undefined) continue;
      const resolved = resolve(join(RESEARCH_ROOT, row.target, '..'), target);
      linked.add(relative(RESEARCH_ROOT, resolved));
    }
  }
  return linked;
}

describe('research index contract', () => {
  it('finds records and rows to check', () => {
    // Guards every assertion below. A listing or a row regex that silently
    // matched nothing would make the whole file vacuously green, which is the
    // failure mode `adr-numbering-contract.test.ts` guards the same way.
    expect(readRecords().length).toBeGreaterThan(50);
    expect(readRows().length).toBeGreaterThan(50);
  });

  it('gives every record in docs/research/ exactly one row', () => {
    // The direction no link check can see: a record with no row has no link
    // to be broken. Ten records were in this state on 2026-09-05.
    const targets = readRows().map((row) => row.target);

    const unindexed = readRecords()
      .filter((record) => !targets.includes(record))
      .map((record) => `docs/research/${record} has no row in docs/research/README.md`);

    const duplicated = readRecords()
      .filter((record) => targets.filter((target) => target === record).length > 1)
      .map((record) => `docs/research/${record} has more than one row`);

    expect(
      [...unindexed, ...duplicated],
      'docs/research/README.md and docs/research/ disagree about which records exist. Adding a record means adding its row in the same commit, and the index says so itself',
    ).toEqual([]);
  });

  it('points every row at a file docs/research/ holds', () => {
    const phantom = readRows()
      .filter((row) => !existsSync(join(RESEARCH_ROOT, row.target)))
      .map((row) => `row "${row.label}" links ./${row.target}, which docs/research/ does not hold`);

    expect(phantom).toEqual([]);
  });

  it('names every collection of records that lives in a subdirectory', () => {
    // `design-search-2026-08-29/` -- six documents reduced from nineteen
    // owner-supplied answers -- was linked from nowhere in the repository. A
    // directory listing was the only way to find it.
    const linked = pathsLinkedFromIndexedRecords();
    const rowTargets = readRows().map((row) => row.target);

    const unnamed = readCollections()
      .filter(
        (collection) =>
          !rowTargets.some((target) => target.startsWith(`${collection}/`)) &&
          ![...linked].some((path) => path.startsWith(`${collection}/`)),
      )
      .map(
        (collection) =>
          `docs/research/${collection}/ holds records the index neither rows nor links to`,
      );

    expect(unnamed).toEqual([]);
  });

  it('keeps every row inside the one table', () => {
    // Twenty-four rows had been appended past the end of the table, after a
    // bullet list, with no header above them. They were still in the file and
    // still resolved, so every other check in this repository stayed green.
    const lines = readIndex();
    const header = lines.indexOf(TABLE_HEADER);

    expect(header, `docs/research/README.md no longer carries "${TABLE_HEADER}"`).toBeGreaterThan(
      -1,
    );
    expect(lines[header + 1]?.startsWith('| --- ')).toBe(true);

    let end = header + 2;
    while (lines[end]?.startsWith('| [') === true) end += 1;

    const stranded = readRows()
      .filter((row) => row.line - 1 < header + 2 || row.line - 1 >= end)
      .map(
        (row) =>
          `row "${row.label}" is at line ${row.line}, outside the table that runs to line ${end}`,
      );

    expect(
      stranded,
      'a row sits outside the table. The index appends at one point and that point is the end of the table, not the end of the file',
    ).toEqual([]);
  });
});
