import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A repository-shaped contract over `docs/adr/`, in the spirit of
 * `tests/foundation/repository-contract.test.ts` (which asserts pins and
 * tsconfig flags) and `tests/determinism/ambient-nondeterminism-contract.test.ts`
 * (which scans real files off disk rather than a hand-maintained list).
 *
 * The defect this exists for: two ADRs were both numbered 0004 (issue #117).
 * The collision lasted a day, during which twelve further ADRs were added, and
 * nothing in the repository failed -- because nothing read `docs/adr/` at all.
 *
 * Citations in prose and in code comments say "ADR 0004" with no filename, so
 * a duplicated prefix silently splits the citation namespace in two -- an
 * agent told to consult "ADR 0004" before touching the kernel could open a
 * document about chunk sizes and conclude no accepted decision governed the
 * kernel.
 *
 * Scope: these assertions are mechanical. They check that a number resolves to
 * exactly one document, that the index and the directory name the same set of
 * ADRs with the same titles, and that links point at files which exist. Where a
 * link's label names an ADR number, that number is compared against the target;
 * a link whose label names no number can still point at a wrong but existing
 * ADR and pass everything here.
 *
 * What none of it can check is whether a status is *true about the code*. That
 * question is `docs/adr/STATUS-QUEUE.md`'s, and it is answered by a human
 * reading evidence, not by an assertion.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const DOCS_ROOT = join(REPOSITORY_ROOT, 'docs');
const ADR_ROOT = join(DOCS_ROOT, 'adr');

/** `NNNN-kebab-case.md`. `README.md` is the index and is not an ADR. */
const ADR_FILENAME = /^\d{4}-[a-z0-9-]+\.md$/;

/**
 * The documents in `docs/adr/` that are not ADRs.
 *
 * An explicit allow-list rather than a `!/^\d{4}-/` filter, and the difference
 * is the whole point: a filter would make "names every ADR NNNN-kebab-case.md"
 * below **vacuous**, because a misnamed ADR -- `adr-24-rooms.md`,
 * `0024_rooms.md`, `24-rooms.md` -- would stop being an ADR rather than being
 * a malformed one, and the assertion that exists to catch exactly that would
 * skip it. With an allow-list, anything not named here must be a well-formed
 * ADR, and adding a new supporting document is a deliberate edit to this line.
 */
const SUPPORTING_DOCUMENTS: ReadonlySet<string> = new Set(['README.md', 'STATUS-QUEUE.md']);

/**
 * The `# ADR…` heading, capturing the number and the title after the colon.
 * Both separators are in real use in this tree -- `# ADR-0004: Chunk size
 * selection…` and `# ADR 0020: Deterministic Kernel…` -- so both are parsed
 * rather than one being assumed.
 */
const ADR_HEADING = /^#\s+ADR[ -](\d{4})\s*:\s*(.+?)\s*$/;

/**
 * A relative markdown link to an ADR, as written from `docs/` (`./adr/NNNN-…`)
 * or from inside `docs/adr/` (`./NNNN-…`).
 */
const ADR_LINK = /\]\((\.\/(?:adr\/)?\d{4}-[a-z0-9-]+\.md)\)/g;

interface AdrDocument {
  readonly filename: string;
  readonly numberFromFilename: string;
  readonly numberFromHeading: string | undefined;
  readonly titleFromHeading: string | undefined;
  readonly status: string | undefined;
}

/**
 * The status keyword, with the wrapping each side happens to use removed.
 *
 * The two sides genuinely spell the same status differently and always have:
 * an ADR writes `**Accepted.**` or `**Proposed -- pending human approval.** Not
 * accepted.`, while the index writes `Accepted` or
 * `Proposed -- pending human approval`. Comparing the strings would fail on
 * formatting, so this reduces both to the one word that is the status.
 *
 * Anchored at the start rather than searching the whole line, and that is
 * **defensive rather than load-bearing** -- said plainly because the obvious
 * justification is wrong. `**Proposed -- pending human approval.** Not
 * accepted.` does contain "accepted", but an unanchored alternation returns
 * whichever alternative appears *first*, and "Proposed" is first. Measured:
 * replacing this with a case-insensitive search anywhere leaves every
 * assertion below passing.
 *
 * It stays because the inversion it guards against is one edit away -- a
 * status opening `Not accepted. Proposed ...` would read as Accepted to an
 * unanchored scan -- and because a status keyword belongs at the start of a
 * status.
 */
function statusKeyword(status: string): string | undefined {
  const stripped = status.replace(/\*/gu, '').trim();
  const keyword = /^(Accepted|Proposed|Superseded|Deprecated)\b/u.exec(stripped);
  return keyword?.[1];
}

/**
 * `| [0019](./0019-....md) | Title | Status |` -- rows that name a file,
 * capturing the number, the link target, the title and the status.
 *
 * The `0018` row is deliberately not matched: it carries no link because it
 * has no file, and `docs/adr/README.md` maintains it by hand.
 */
const INDEX_ROW = /^\|\s*\[(\d{4})\]\((\.\/\d{4}-[a-z0-9-]+\.md)\)\s*\|([^|]*)\|([^|]*)\|/gmu;

/** `**Next free number: 0024.**` -- the one number the index states rather than tabulates. */
const NEXT_FREE_NUMBER = /\*\*Next free number:\s*(\d{4})\.?\*\*/u;

/**
 * A relative markdown link to an ADR *with its label*, so a label that names
 * an ADR number can be checked against the number the link resolves to.
 */
const LABELLED_ADR_LINK = /\[([^\]]*)\]\((\.\/(?:adr\/)?(\d{4})-[a-z0-9-]+\.md)\)/g;

/**
 * The `ADR 0007` / `ADR-0007` shape inside a link label. Global, and every
 * match is collected rather than only the first: a label may legitimately name
 * more than one ADR -- *"supersedes ADR 0012 and ADR 0015"* -- and taking the
 * first number would report such a link as mislabelled whichever of the two it
 * pointed at. The link is accepted when **any** number in its label is the one
 * it resolves to.
 */
const ADR_NUMBERS_IN_LABEL = /ADR[\s-]*(\d{4})/giu;

interface IndexRow {
  readonly target: string;
  readonly title: string;
  readonly status: string;
}

function readIndexRows(): Map<string, IndexRow> {
  const index = readFileSync(join(ADR_ROOT, 'README.md'), 'utf8');
  const rows = new Map<string, IndexRow>();
  for (const row of index.matchAll(INDEX_ROW)) {
    const [, number, target, title, status] = row;
    if (number === undefined || target === undefined || title === undefined || status === undefined) continue;
    rows.set(number, { target, title: title.trim(), status: status.trim() });
  }
  return rows;
}

function listMarkdownFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listMarkdownFiles(full));
      continue;
    }
    if (entry.endsWith('.md')) found.push(full);
  }
  return found;
}

/**
 * Two status styles exist in the tree: a `- Status: …` bullet and a
 * `## Status` section whose first non-blank line carries the value. Both are
 * parsed and normalised to the same string here; this test asserts only that a
 * status is *present and parseable*, never which value it holds. Which ADRs
 * should be Accepted versus Proposed, and whether the two styles should be
 * unified, belong to issues #118 and #119.
 */
function parseStatus(body: string): string | undefined {
  const bullet = /^-\s+Status:\s*(.+)$/m.exec(body);
  if (bullet?.[1] !== undefined) return bullet[1].trim();

  const lines = body.split('\n');
  const headingIndex = lines.findIndex((line) => /^##\s+Status\s*$/.test(line));
  if (headingIndex === -1) return undefined;

  for (const line of lines.slice(headingIndex + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    if (line.trim() !== '') return line.trim();
  }
  return undefined;
}

function readAdrDocuments(): AdrDocument[] {
  return readdirSync(ADR_ROOT)
    .filter((entry) => !SUPPORTING_DOCUMENTS.has(entry) && statSync(join(ADR_ROOT, entry)).isFile())
    .sort()
    .map((filename) => {
      const body = readFileSync(join(ADR_ROOT, filename), 'utf8');
      const heading = ADR_HEADING.exec(body.split('\n')[0] ?? '');
      return {
        filename,
        numberFromFilename: filename.slice(0, 4),
        numberFromHeading: heading?.[1],
        titleFromHeading: heading?.[2],
        status: parseStatus(body),
      };
    });
}

describe('ADR numbering contract', () => {
  it('finds ADRs to check', () => {
    // Guards every assertion below: a glob that silently matched nothing
    // would make the whole suite vacuously green.
    expect(readAdrDocuments().length).toBeGreaterThan(10);
  });

  it('names every ADR NNNN-kebab-case.md', () => {
    const malformed = readAdrDocuments()
      .map((adr) => adr.filename)
      .filter((filename) => !ADR_FILENAME.test(filename));

    expect(malformed).toEqual([]);
  });

  it('gives every ADR a unique four-digit number', () => {
    // The assertion that fails on the pre-fix tree, where both
    // 0004-chunk-size-selection.md and 0004-deterministic-kernel.md existed.
    const byNumber = new Map<string, string[]>();
    for (const adr of readAdrDocuments()) {
      const existing = byNumber.get(adr.numberFromFilename) ?? [];
      existing.push(adr.filename);
      byNumber.set(adr.numberFromFilename, existing);
    }

    const duplicated = [...byNumber.entries()]
      .filter(([, filenames]) => filenames.length > 1)
      .map(([number, filenames]) => `${number}: ${filenames.join(', ')}`);

    expect(duplicated).toEqual([]);
  });

  it('matches each filename number to the number in its heading', () => {
    const mismatched = readAdrDocuments()
      .filter((adr) => adr.numberFromHeading !== adr.numberFromFilename)
      .map((adr) => `${adr.filename}: heading says ${adr.numberFromHeading ?? '(unparseable)'}`);

    expect(mismatched).toEqual([]);
  });

  it('gives every ADR a parseable status', () => {
    const unparseable = readAdrDocuments()
      .filter((adr) => adr.status === undefined || adr.status === '')
      .map((adr) => adr.filename);

    expect(unparseable).toEqual([]);
  });

  it('keeps its supporting-document allow-list honest', () => {
    // `SUPPORTING_DOCUMENTS` is what stops a non-ADR in `docs/adr/` being
    // reported as a malformed ADR. A name that stops existing would silently
    // widen nothing today, but it would leave the next reader believing a file
    // is deliberately exempt when it is simply gone.
    const missing = [...SUPPORTING_DOCUMENTS].filter((name) => !existsSync(join(ADR_ROOT, name)));

    expect(missing, 'SUPPORTING_DOCUMENTS names a file docs/adr/ no longer holds').toEqual([]);
  });

  /*
   * The index and the directory must name the same set of ADRs, in both
   * directions.
   *
   * This was previously enforced only as a side effect: a row-count equality
   * guarding the status comparison below, whose failure message said "the
   * table shape changed". That message is the wrong diagnosis for the common
   * case -- adding an ADR file and forgetting the row -- and a count says
   * nothing at all when one row is added and another dropped in the same edit.
   * `docs/adr/README.md` calls itself "the only recorded statement of which
   * numbers are taken", which is a claim about a *set*, so it is asserted as
   * one.
   */
  it('indexes exactly the ADRs the directory holds', () => {
    const onDisk = readAdrDocuments();
    const rows = readIndexRows();

    const unindexed = onDisk
      .filter((adr) => !rows.has(adr.numberFromFilename))
      .map((adr) => `${adr.filename} has no row in docs/adr/README.md`);

    const numbersOnDisk = new Set(onDisk.map((adr) => adr.numberFromFilename));
    const phantom = [...rows.entries()]
      .filter(([number]) => !numbersOnDisk.has(number))
      .map(([number, row]) => `docs/adr/README.md row ${number} links ${row.target}, which docs/adr/ does not hold`);

    const mismatchedTargets = onDisk
      .filter((adr) => rows.get(adr.numberFromFilename)?.target !== undefined)
      .filter((adr) => rows.get(adr.numberFromFilename)?.target !== `./${adr.filename}`)
      .map((adr) => `${adr.filename}: its row links ${rows.get(adr.numberFromFilename)?.target}`);

    expect(
      [...unindexed, ...phantom, ...mismatchedTargets],
      'docs/adr/README.md and docs/adr/ disagree about which ADRs exist. Adding an ADR means adding its row in the same commit, and the index says so itself',
    ).toEqual([]);
  });

  /*
   * The Title column, which the index header used to exempt from checking.
   *
   * It is the column a reader scans to decide which ADR to open, so a title
   * that has drifted from the document sends them to the wrong one -- the same
   * failure the number checks above exist to prevent, one column over. Cheap
   * to check and strictly mechanical: it compares two strings and rules on
   * neither.
   */
  it('reproduces each ADR title in the row that links to it', () => {
    const rows = readIndexRows();

    const wrong = readAdrDocuments()
      .filter((adr) => rows.has(adr.numberFromFilename))
      .filter((adr) => rows.get(adr.numberFromFilename)?.title !== adr.titleFromHeading)
      .map(
        (adr) =>
          `${adr.filename}: heading says "${adr.titleFromHeading ?? '(unparseable)'}", index says "${rows.get(adr.numberFromFilename)?.title ?? ''}"`,
      );

    expect(wrong, 'docs/adr/README.md reports a title the ADR does not carry').toEqual([]);
  });

  it('states a next free number no ADR on disk has taken', () => {
    const index = readFileSync(join(ADR_ROOT, 'README.md'), 'utf8');
    const declared = NEXT_FREE_NUMBER.exec(index)?.[1];

    expect(declared, 'docs/adr/README.md no longer states a "Next free number"').toBeDefined();

    const taken = readAdrDocuments().map((adr) => Number.parseInt(adr.numberFromFilename, 10));
    const highest = Math.max(...taken);
    const expected = String(highest + 1).padStart(4, '0');

    expect(
      declared,
      `docs/adr/ holds ${String(highest).padStart(4, '0')} as its highest number, so the next free number is ${expected}. Released numbers below it (0018) stay listed in the table and are deliberately not the next free one`,
    ).toBe(expected);
  });

  /*
   * A link whose label names one ADR and whose target is another.
   *
   * The link check below resolves targets and says of itself that it "cannot
   * catch a link that resolves to the wrong but existing ADR". This closes
   * exactly that half, for the subset where the intent is written down: when a
   * label says "ADR 0007", the number is a second, independent statement of
   * where the link goes, and the two can be compared. Labels that name no
   * number -- "the localization ADR", a bare title -- are not checkable this
   * way and are skipped rather than guessed at.
   */
  it('never labels an ADR link with a number other than the one it points at', () => {
    const mislabelled: string[] = [];

    for (const file of listMarkdownFiles(DOCS_ROOT)) {
      const body = readFileSync(file, 'utf8');
      for (const match of body.matchAll(LABELLED_ADR_LINK)) {
        const [, label, target, targetNumber] = match;
        if (label === undefined || targetNumber === undefined) continue;
        const labelled = [...label.matchAll(ADR_NUMBERS_IN_LABEL)].map((named) => named[1]);
        if (labelled.length === 0 || labelled.includes(targetNumber)) continue;
        mislabelled.push(`${relative(REPOSITORY_ROOT, file)}: "${label}" links to ${target ?? ''}`);
      }
    }

    expect(mislabelled, 'an ADR link names one ADR and points at another').toEqual([]);
  });

  it('resolves every relative ADR link in docs/ to a file that exists', () => {
    // Catches a link whose *target* is gone -- for example after a rename that
    // missed a citation. A link that resolves to the wrong but existing ADR is
    // caught by the label check above, but only when the label names a number.
    const broken: string[] = [];

    for (const file of listMarkdownFiles(DOCS_ROOT)) {
      const body = readFileSync(file, 'utf8');
      for (const match of body.matchAll(ADR_LINK)) {
        const target = match[1];
        if (target === undefined) continue;
        if (!existsSync(resolve(dirname(file), target))) {
          broken.push(`${relative(REPOSITORY_ROOT, file)} -> ${target}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });

  /*
   * The index reports each ADR's status, and nothing checked that it reports
   * the status the ADR actually holds.
   *
   * `docs/adr/README.md` says of itself: *"Nothing here changes a status; this
   * table only reports them."* That is a claim about the table, and it was
   * unenforced -- accepting ADR 0019 without touching the index, or editing
   * the index without touching the ADR, both left the tree green. Measured:
   * both mutations survived every assertion in this file.
   *
   * This is #118's defect class one level up. #118 is about statuses that
   * contradict the *code*; this is about a status that contradicts the
   * *document it summarises*, which is cheaper to check and strictly
   * mechanical -- it asserts the two agree, never which value is right. Which
   * ADRs should be Accepted remains #118's and #119's subject, exactly as the
   * header above says.
   */
  it('reports each ADR with the status that ADR itself holds', () => {
    const documents = readAdrDocuments();
    const rows = readIndexRows();

    // Vacuity guard. A table that stopped matching -- a reformat, a column
    // added -- would make every comparison below vacuous, and an empty map
    // reads exactly like agreement. The *disagreement* case now has its own
    // assertion above, with a message that says which side is missing what.
    expect(rows.size, 'no ADR rows parsed out of docs/adr/README.md; the table shape changed').toBeGreaterThan(10);

    const disagreements: string[] = [];
    for (const document of documents) {
      const own = document.status === undefined ? undefined : statusKeyword(document.status);
      const listed = rows.get(document.numberFromFilename)?.status;
      const reported = listed === undefined ? undefined : statusKeyword(listed);

      if (own === undefined) {
        disagreements.push(`${document.filename}: its own status does not start with a known keyword`);
        continue;
      }
      if (listed === undefined) {
        disagreements.push(`${document.filename}: no row in docs/adr/README.md links to it`);
        continue;
      }
      if (reported === undefined) {
        disagreements.push(`${document.filename}: the index reports "${listed}", which starts with no known keyword`);
        continue;
      }
      if (own !== reported) {
        disagreements.push(`${document.filename}: the document says ${own}, the index says ${reported}`);
      }
    }

    expect(
      disagreements,
      'docs/adr/README.md disagrees with an ADR about its own status. The index reports statuses and never sets them, so the document is right and the table is what changes -- unless the document is the one that drifted, in which case say so in the same commit that fixes it',
    ).toEqual([]);
  });
});
