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
});
