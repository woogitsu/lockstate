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
 * exactly one document and that links point at files which exist. They cannot
 * check that a citation points at the *right* document — a link to a wrong but
 * existing ADR passes every assertion here.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const DOCS_ROOT = join(REPOSITORY_ROOT, 'docs');
const ADR_ROOT = join(DOCS_ROOT, 'adr');

/** `NNNN-kebab-case.md`. `README.md` is the index and is not an ADR. */
const ADR_FILENAME = /^\d{4}-[a-z0-9-]+\.md$/;

/**
 * The `# ADR…` heading. Both separators are in real use in this tree --
 * `# ADR-0004: Chunk size selection…` and `# ADR 0020: Deterministic Kernel…`
 * -- so both are parsed rather than one being assumed.
 */
const ADR_HEADING = /^#\s+ADR[ -](\d{4})\s*:/;

/**
 * A relative markdown link to an ADR, as written from `docs/` (`./adr/NNNN-…`)
 * or from inside `docs/adr/` (`./NNNN-…`).
 */
const ADR_LINK = /\]\((\.\/(?:adr\/)?\d{4}-[a-z0-9-]+\.md)\)/g;

interface AdrDocument {
  readonly filename: string;
  readonly numberFromFilename: string;
  readonly numberFromHeading: string | undefined;
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

/** `| [0019](./0019-....md) | Title | Status |` -- rows that name a file. */
const INDEX_ROW = /^\|\s*\[(\d{4})\]\(\.\/\d{4}-[a-z0-9-]+\.md\)\s*\|[^|]*\|([^|]*)\|/gmu;

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
    .filter((entry) => entry !== 'README.md' && statSync(join(ADR_ROOT, entry)).isFile())
    .sort()
    .map((filename) => {
      const body = readFileSync(join(ADR_ROOT, filename), 'utf8');
      return {
        filename,
        numberFromFilename: filename.slice(0, 4),
        numberFromHeading: ADR_HEADING.exec(body.split('\n')[0] ?? '')?.[1],
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

  it('resolves every relative ADR link in docs/ to a file that exists', () => {
    // Catches a link whose *target* is gone -- for example after a rename that
    // missed a citation. It cannot catch a link that resolves to the wrong but
    // existing ADR; that failure mode is not covered by any test here.
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
    const index = readFileSync(join(ADR_ROOT, 'README.md'), 'utf8');

    const indexed = new Map<string, string>();
    for (const row of index.matchAll(INDEX_ROW)) {
      const [, number, status] = row;
      if (number === undefined || status === undefined) continue;
      indexed.set(number, status.trim());
    }

    // Vacuity guard. A table that stopped matching -- a reformat, a column
    // added -- would make every comparison below vacuous, and an empty map
    // reads exactly like agreement.
    expect(indexed.size, 'no ADR rows parsed out of docs/adr/README.md; the table shape changed').toBe(documents.length);

    const disagreements: string[] = [];
    for (const document of documents) {
      const own = document.status === undefined ? undefined : statusKeyword(document.status);
      const listed = indexed.get(document.numberFromFilename);
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
