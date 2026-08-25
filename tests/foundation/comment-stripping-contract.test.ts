import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * The contract for `stripComments`, which nearly every foundation gate in this
 * suite runs its corpus through before scanning it.
 *
 * ## Why this file exists (#278)
 *
 * The stripper removed block comments with one regex and then line comments
 * with another. A `//` comment containing the two characters `/` and `*` --
 * which is what a glob like `src/rendering/**` looks like, and which this
 * repository's comments are full of -- therefore opened a block comment at
 * scan time that ran to the next terminator anywhere below. Measured on the
 * tree as it stood: **197 lines of real code in 19 files were blanked before
 * any gate ever saw them**, including 80 consecutive lines of
 * `src/content/default-locale-en.ts`.
 *
 * That is the worst shape a defect in this suite can take. It does not make a
 * gate fail; it makes a gate scan less and stay green. Three gates were
 * demonstrated blind by injecting a violation into a blanked span and watching
 * them pass:
 * `tests/determinism/canonical-iteration-contract.test.ts`,
 * `tests/foundation/localization-key-completeness.test.ts` and
 * `tests/unit/ui-orchestration-boundaries.test.ts` -- the last of which is the
 * gate for `AGENTS.md` boundary 1.
 *
 * So the replacement is pinned here rather than only inside the module that
 * happens to export it. Two things are checked, and the second matters more:
 *
 * 1. **Fixtures, in both directions.** A comment is removed; text that merely
 *    *looks* like a delimiter -- inside a string, a template, a regular
 *    expression or a URL -- is not.
 * 2. **The real corpus.** Every `.ts` file under `src/` and `tests/` is
 *    stripped and compared line by line against a deliberately dumb,
 *    independent oracle: a line the stripper blanks must *look* like a comment
 *    line, and a line that *is* a whole-line comment must be blanked. A
 *    fixture suite cannot catch a stripper that is wrong about the file it is
 *    actually pointed at; this can, and it is the check that would have failed
 *    the day #278 was introduced.
 */

describe('stripComments removes comments', () => {
  it('removes a whole-line comment, leaving its width and its newline', () => {
    expect(stripComments('// note\nconst kept = 1;')).toBe('       \nconst kept = 1;');
  });

  it('removes a trailing comment, leaving the code before it untouched', () => {
    expect(stripComments('const kept = 2; // note')).toBe('const kept = 2;        ');
  });

  it('removes a block comment, keeping one blank line per line it spanned', () => {
    expect(stripComments('a\n/* two\nthree */\nfour')).toBe('a\n      \n        \nfour');
  });

  it('removes a JSDoc block and keeps the declaration under it', () => {
    expect(stripComments('/** doc */\nexport const KEPT = 3;')).toBe('          \nexport const KEPT = 3;');
  });
});

describe('stripComments does not remove code that looks like a comment', () => {
  it('reads a line comment containing a block-comment opener as one line comment (#278, the reported shape)', () => {
    // The exact case from the issue: a `//` comment naming a glob, followed by
    // a line of real code. Before the fix the glob's `/*` opened a block
    // comment and the code below it was blanked.
    const source = '// glob src/**\nconst kept = 4;';
    expect(stripComments(source)).toBe('              \nconst kept = 4;');
  });

  it('reads a block comment containing a line-comment opener as one block comment (the mirror image)', () => {
    // The failure that reordering the two passes would have produced instead.
    expect(stripComments('/* see // note */\nconst kept = 5;')).toBe('                 \nconst kept = 5;');
  });

  it('leaves a block-comment opener inside a string literal alone', () => {
    const source = "const glob = '/*';\nconst kept = 6;";
    expect(stripComments(source)).toBe(source);
  });

  it('leaves both delimiters inside a template literal alone', () => {
    const source = 'const t = `a // b /* c */ d`;\nconst kept = 7;';
    expect(stripComments(source)).toBe(source);
  });

  it('leaves a line-comment opener inside a regular expression literal alone', () => {
    // `/https:\/\//` ends in `\/` immediately followed by the closing `/`, so
    // the last two characters of the body read as `//` to anything that is not
    // tracking the literal. `src/content/validate-catalog.ts:73` is exactly
    // this shape and lost the rest of its line.
    const source = 'const re = /https:\\/\\//;\nconst kept = 8;';
    expect(stripComments(source)).toBe(source);
  });

  it('leaves a URL in code alone', () => {
    const source = "const url = 'https://example.com/a';\nconst kept = 9;";
    expect(stripComments(source)).toBe(source);
  });

  it('runs an unterminated block comment to the end of the file, as tsc does', () => {
    expect(stripComments('const kept = 10;\n/* never closed\nstill comment')).toBe(
      'const kept = 10;\n               \n             ',
    );
  });
});

describe('stripComments tracks the constructs a two-pass regex cannot', () => {
  it('strips a comment inside a template substitution, which is code', () => {
    // Seven spaces for `/* c */`, then the space that was already there.
    expect(stripComments('const t = `x ${/* c */ y}`;')).toBe('const t = `x ${        y}`;');
  });

  it('treats the text after a substitution as template text again, not as code', () => {
    const source = 'const t = `x ${y} // z`;\nconst kept = 11;';
    expect(stripComments(source)).toBe(source);
  });

  it('handles a template nested inside a substitution of another template', () => {
    const source = 'const t = `${`in // ner`} /* out */ tail`;\nconst kept = 12;';
    expect(stripComments(source)).toBe(source);
  });

  it('reads a slash inside a regular expression character class as a literal slash', () => {
    const source = 'const re = /[/*]/;\nconst kept = 13;';
    expect(stripComments(source)).toBe(source);
  });

  it('reads a slash after a value as division and still strips the comment after it', () => {
    expect(stripComments('const q = a / b; // note')).toBe('const q = a / b;        ');
    expect(stripComments('const q = (a + b) / 2; // note')).toBe('const q = (a + b) / 2;        ');
  });

  it('does not let an unterminated string literal swallow the rest of the file', () => {
    // A string cannot contain a raw line break, so an unclosed quote ends at
    // the newline. Running it on would be the same swallow-everything failure
    // in a different construct.
    const source = "const s = 'oops;\nconst kept = 14;";
    expect(stripComments(source)).toBe(source);
  });

  it('respects an escaped quote inside a string', () => {
    const source = "const s = 'it\\'s // fine';\nconst kept = 15;";
    expect(stripComments(source)).toBe(source);
  });

  it('preserves length and line count, so offsets and line numbers stay true', () => {
    const source = '/** a\n * b\n */\nconst kept = 16; // trailing\n';
    const stripped = stripComments(source);
    expect(stripped).toHaveLength(source.length);
    expect(stripped.split('\n')).toHaveLength(source.split('\n').length);
  });
});

/**
 * A line the stripper blanks must look like a comment line to a reader.
 *
 * Deliberately dumb, and deliberately not built on the scanner it is checking:
 * an oracle that shared the scanner's idea of where a comment starts would
 * agree with it about the lines it got wrong, which is the whole failure mode
 * here. This one only asks what the line's first two characters are.
 */
const LOOKS_LIKE_A_COMMENT_LINE = /^(?:\/\/|\/\*|\*)/;

const REPOSITORY_ROOT = join(__dirname, '../..');

function listTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

interface StrippedLine {
  readonly where: string;
  readonly before: string;
  readonly after: string;
}

const SCANNED = [...listTypeScriptFiles(join(REPOSITORY_ROOT, 'src')), ...listTypeScriptFiles(join(REPOSITORY_ROOT, 'tests'))];

const lines: StrippedLine[] = [];
let lengthChanged = 0;
for (const path of SCANNED) {
  const source = readFileSync(path, 'utf8');
  const stripped = stripComments(source);
  if (stripped.length !== source.length) lengthChanged += 1;
  const where = relative(REPOSITORY_ROOT, path).split(sep).join(posix.sep);
  const before = source.split('\n');
  const after = stripped.split('\n');
  for (let index = 0; index < before.length; index += 1) {
    lines.push({ where: `${where}:${index + 1}`, before: before[index]!.trim(), after: (after[index] ?? '').trim() });
  }
}

const blankedLines = lines.filter((line) => line.before !== '' && line.after === '');
const survivingLines = lines.filter((line) => line.after !== '');

describe('stripComments over the real repository, in both directions', () => {
  it('reads a corpus large enough for the two assertions below to mean something', () => {
    // Floors at the values measured when this gate was written. A gate over a
    // corpus is only as good as the corpus: a walk that silently collected
    // nothing, or a stripper that silently blanked everything, would satisfy
    // "no code line was blanked" perfectly.
    expect(SCANNED.length, 'fewer .ts files under src/ and tests/ than when this floor was set; the walk is broken').toBeGreaterThanOrEqual(473);
    expect(blankedLines.length, 'far fewer comment lines removed than when this floor was set; the stripper has stopped stripping').toBeGreaterThanOrEqual(20_000);
    expect(survivingLines.length, 'far fewer code lines survive than when this floor was set; the stripper is eating the corpus').toBeGreaterThanOrEqual(50_000);
    expect(lengthChanged, 'stripping changed a file length, so offsets into the stripped text no longer index the source').toBe(0);
  });

  it('blanks no line that is not a comment line -- the #278 direction, which is silent', () => {
    const eaten = blankedLines.filter((line) => !LOOKS_LIKE_A_COMMENT_LINE.test(line.before));
    expect(
      eaten.map((line) => `${line.where}  ${line.before.slice(0, 100)}`),
      'stripComments blanked a line of real code. Every gate that strips before scanning is now blind to it, and none of them will say so -- they will simply find less and stay green. This is #278',
    ).toEqual([]);
  });

  it('blanks every whole-line comment -- the other direction, which is loud but wrong', () => {
    const left = survivingLines.filter((line) => line.before.startsWith('//'));
    expect(
      left.map((line) => `${line.where}  ${line.after.slice(0, 100)}`),
      'a whole-line comment survived stripping, so prose about a mechanism now reads to the gates as the mechanism',
    ).toEqual([]);
  });
});

describe('the oracle above can fail', () => {
  it('rejects a stripped line that ate code, and accepts one that ate a comment', () => {
    // The corpus assertions are `toEqual([])` over a filter. A filter that
    // never matches anything looks exactly like a clean tree, so the predicate
    // is exercised on both answers here rather than only on the corpus, where
    // "found nothing" is the passing state.
    expect(LOOKS_LIKE_A_COMMENT_LINE.test("'save.panel.title': 'Prisons',")).toBe(false);
    expect(LOOKS_LIKE_A_COMMENT_LINE.test('// a line comment')).toBe(true);
    expect(LOOKS_LIKE_A_COMMENT_LINE.test('/** a doc comment')).toBe(true);
    expect(LOOKS_LIKE_A_COMMENT_LINE.test('* a continuation')).toBe(true);
  });
});
