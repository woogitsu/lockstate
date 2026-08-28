import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * Every relative markdown link resolves to a file that exists.
 *
 * A confident pointer to a file that is not there is this repository's
 * dominant defect class, and it keeps costing real time: #140 found two
 * (`tests/browser/save-panel-concurrency.spec.ts`, which never existed, and
 * `room-catalog-adapter.ts`, which never existed either), #141 found a third
 * (`THIRD_PARTY_NOTICES.md`, named as the mechanism for recording adapted
 * third-party code and absent), and while adding the paragraph above this one
 * a fourth was very nearly introduced -- `docs/TESTING.md` was given a link to
 * `adr/0011-localization-and-content-authoring.md`, which is not the ADR's
 * filename.
 *
 * Be clear about what this actually covers, because three of those four are
 * **not** links: #140's two were filenames in TypeScript comments, and
 * `THIRD_PARTY_NOTICES.md` was a backticked filename in a sentence. This test
 * would have caught exactly one of the four -- the `docs/TESTING.md` link --
 * and it is worth having for that one, because a link target is unambiguously
 * a path in a way that a filename mentioned in prose is not, so this is the
 * subset that is *mechanically* checkable at all. The other three were each
 * caught by a person reading carefully, which is not a mechanism.
 *
 * **That last sentence stopped being the whole story on 2026-08-28.** It is
 * kept as written because it is why the third describe block below exists:
 * that block runs the rooted-path check of the second one over the comments in
 * `src/`, `tests/`, `tooling/`, `scripts/` and `benchmarks/`, which is where
 * two of those three lived. What is still true is the narrowing -- a bare filename in prose
 * is not checkable and is not checked, wherever it is written.
 *
 * Deliberately narrow. It checks `[text](target)`, not backticked filenames in
 * prose: `` `foo.ts` `` in a sentence may be a module, a concept, a file that
 * is about to exist or an example, and a check that flagged all of them would
 * produce a list nobody reads -- which is the argument
 * `tests/helpers/simulation-enum-source.ts` already makes about enum discovery.
 *
 * That argument is about a *bare filename*, and the second describe block
 * below covers the one subset it does not reach: a backticked token that is
 * **rooted at a top-level directory of this repository and carries a file
 * extension**, like
 * `` `docs/adr/0007-navigation-work-budgets-and-flow-fields.md` ``. Such a
 * token is not plausibly a module name, a concept or an example -- it is a
 * path, and it either resolves or it does not. The measured false-positive
 * rate is what justifies the distinction rather than the argument alone:
 * measured at `7a15b17`, the documentation carried **630** such citations, of
 * which **629** resolved. The single exception is prose about a file that only
 * ever existed on a closed pull request's branch, and it is allowlisted below
 * with that reason.
 *
 * Re-measured at `3bfb799`, after the extractor was taught the two forms it
 * had been blind to (a `file:line` anchor, and the `` `x` `` code span --
 * both below): **3,693** citations across 108 markdown files, of which
 * **3,692** resolve and the exception is still that one. Those are
 * occurrences, not distinct paths -- the same number the check itself counts,
 * so the figure and the check cannot disagree.
 */

const ROOT = join(__dirname, '../..');

/** Markdown outside `node_modules`; `docs/` plus the root-level files. */
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

interface Link {
  readonly source: string;
  readonly target: string;
}

/**
 * `[text](target)` links whose target is a relative path. Absolute URLs and
 * `mailto:` are somebody else's problem; a bare `#anchor` points inside the
 * same document and names no file.
 */
function relativeLinks(path: string): readonly Link[] {
  const source = relative(ROOT, path);
  const links: Link[] = [];
  for (const match of readFileSync(path, 'utf8').matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1]!;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('//')) continue;
    links.push({ source, target });
  }
  return links;
}

const links = markdownFiles.flatMap(relativeLinks);

describe('every relative markdown link points at a file that exists', () => {
  it('finds markdown and links to check, so this cannot pass vacuously', () => {
    expect(markdownFiles.length).toBeGreaterThan(10);
    expect(links.length).toBeGreaterThan(20);
  });

  it('resolves every link target', () => {
    const broken = links
      .filter(({ source, target }) => {
        // A trailing `#anchor` or `?query` is part of the link, not of the path.
        const path = target.split('#')[0]!.split('?')[0]!;
        // `[text](#)` and `[text](#anchor)` are handled above; a link whose
        // path part is empty after stripping is same-document too.
        if (path.length === 0) return false;
        return !existsSync(resolve(ROOT, dirname(source), path));
      })
      .map(({ source, target }) => `${source} -> ${target}`);

    expect(broken, 'these markdown links name a file that does not exist').toEqual([]);
  });
});

/**
 * A backticked token that is rooted at a top-level repository directory and
 * carries an extension -- `` `src/simulation/economy/procurement.ts` ``, not
 * `` `procurement.ts` `` -- names a path, and this repository has repeatedly
 * been confident about paths that are not there.
 *
 * The class this exists for: `docs/specs/` and `docs/research/NEW_FEATURES.md`
 * are cited across eight open issues and have **never existed in any commit on
 * any branch** (`git log --all --diff-filter=A -- docs/specs` returns nothing).
 * A check cannot reach issue bodies, but it can stop the same citation from
 * being written into the documentation, which is where it would then be read
 * as settled.
 *
 * `tooling/` and `benchmarks/` joined the list on 2026-08-28. They were the
 * two top-level directories of committed source that nothing could cite
 * checkably, and `tooling/` was by then being *scanned* for citations while
 * being uncitable itself, which is an asymmetry with no argument behind it.
 * Measured before adding them, at `3bfb799`: 68 markdown citations and 24 in
 * source comments become checkable, and every one of them resolves.
 *
 * `assets/` is deliberately still absent, and measuring it is what settled
 * that: five documentation citations under it name build output rather than
 * committed files -- `assets/index-ByAs-HH3.js` in `docs/DEPLOYMENT.md` is a
 * hashed bundle name, `assets/intermediate/` in `docs/ART_PIPELINE.md` and ADR
 * 0014 is a working directory the pipeline creates. Those sentences are true
 * and the files are not in git, which is the case a rooted-path check has no
 * way to tell from a defect.
 */
const ROOTED_PATH = /^(?:docs|src|tests|scripts|tooling|benchmarks|supabase|public|\.github)\//;

/**
 * Tokens excluded before the existence check, each because it is not a claim
 * that one specific file is on disk.
 *
 * `*` is a glob; `…`, `...` and `<name>` each stand in for something the
 * sentence deliberately does not write down. ADR 0009's
 * `` `supabase/migrations/…_create_challenge_tables.sql` `` is a migration
 * whose timestamp prefix is not known to the sentence,
 * `tests/unit/module-boundary-rules.test.ts` says its fixture trees are
 * fictional by naming `` `src/alpha/...` ``, and
 * `tests/unit/ui-orchestration-boundaries.test.ts` writes
 * `` `src/ui/<something>/` `` for any subtree at all. A `{}` substitution is
 * the same thing in code -- `` `src/{tree}/index.ts` `` -- and matters because
 * a template literal is delimited by backticks, so an interpolated path quoted
 * in a comment arrives here looking exactly like a citation. Each describes a
 * shape, and a shape has no single path to resolve.
 *
 * Tested against the raw token, before the trailing-punctuation strip below,
 * because that strip runs the other way: it takes the three dots off
 * `src/alpha/...` and leaves behind a claim that the fictional directory those
 * dots were eliding is on disk. Measured: that is exactly what it did.
 */
const NOT_A_SINGLE_PATH = /[*\u2026<>{}]|\.\.\./;

/**
 * Rooted paths that truthfully name a file this repository does not contain,
 * keyed on `<citing file> -> <path>`.
 *
 * Each entry has to earn its place by being *true as written*, not merely
 * tolerated: an allowlist that absorbs a real dangling reference is worse than
 * no check, because it makes the reference look reviewed.
 *
 * **Keyed on the pair since 2026-08-28; it was keyed on the path alone
 * before.** A path-alone key hands out a grant the sentence that earned it
 * never asked for: one honest mention of a path that is absent on purpose
 * silently excuses every other mention of the same path, anywhere in the
 * corpus, including a genuine dangling reference written later by an author
 * who never saw the entry. That is the paragraph above happening to the
 * allowlist itself, and no entry here needs the wider grant -- both corpora
 * are checked against pairs.
 */
const ABSENT_BY_DESIGN: ReadonlyMap<string, string> = new Map([
  [
    'docs/adr/README.md -> docs/adr/0018-construction-material-supply.md',
    // `docs/adr/README.md` names this file to explain where the 0018 number
    // went, and states two paragraphs earlier that "0018 is the one number
    // with no file in this directory". The file existed on PR #91's branch,
    // which was closed as superseded by #249. The sentence is history, and it
    // is accurate; it is the absence that is the point of writing it.
    'named by docs/adr/README.md as the file PR #91 added before it was closed as superseded',
  ],
  [
    'tests/foundation/documentation-links-contract.test.ts -> tests/browser/save-panel-concurrency.spec.ts',
    // The first docblock in this file names it as one of the two paths #140
    // found cited and absent. It has never existed in any commit on any
    // branch; naming it is what the sentence is for.
    'named by this file as a path #140 found cited and absent, which has never existed',
  ],
  [
    'tests/foundation/documentation-links-contract.test.ts -> docs/specs/',
    // Same sentence as the entry below, and the same evidence:
    // `git log --all --diff-filter=A -- docs/specs` returns nothing.
    'named by this file as a path cited across eight issues that has never existed',
  ],
  [
    'tests/foundation/documentation-links-contract.test.ts -> docs/research/NEW_FEATURES.md',
    'named by this file as a path cited across eight issues that has never existed',
  ],
  [
    'scripts/verify-cloudflare-build.mjs -> public/.assetsignore',
    // `@cloudflare/vite-plugin` prefixes any `.assetsignore` the repository
    // supplies under `public/` to the one it emits into `dist/`. This
    // repository supplies none, which is why the gate asserts on the built
    // output; the comment's two mentions are conditional and both true.
    'the optional plugin input this repository does not supply, which is the point of the paragraph',
  ],
]);

/** `source -> path`, the key `ABSENT_BY_DESIGN` is written in. */
const cited = ({ source, path }: Citation): string => `${source} -> ${path}`;

/** The path half of such a key. */
const allowedPath = (key: string): string => key.split(' -> ')[1]!;

/** Whether some corpus's citations leave an entry with nothing to excuse. */
function unusedAllowlistEntries(...corpora: readonly (readonly Citation[])[]): readonly string[] {
  const present = new Set(corpora.flat().map(cited));
  return [...ABSENT_BY_DESIGN.keys()].filter((key) => !present.has(key));
}

/**
 * A code span, at any backtick-run length.
 *
 * Markdown -- and the JSDoc that borrows its conventions -- writes
 * `` `x` `` when it wants a span to be visibly a span, and this file's own
 * docblock uses that form for every path it quotes. A one-backtick pattern is
 * therefore blind to precisely the sentences that explain what a path citation
 * is, and it was: the ADR filename offered above as the worked example of a
 * well-formed rooted token was wrong from the day it was written, and the two
 * backticks around it are the reason no check could say so.
 */
const CODE_SPAN = /(?<!`)(`+)(?!`)([^\n]*?)(?<!`)\1(?!`)/g;

interface Citation {
  readonly source: string;
  readonly path: string;
}

/**
 * Takes the text rather than the file, because the two corpora hand it
 * different text: a markdown file is scanned whole, and a source file is
 * scanned through `commentsOf` below. One extractor with two callers, rather
 * than two extractors that agree on the day they are written.
 */
function rootedPathCitations(source: string, content: string): readonly Citation[] {
  const citations: Citation[] = [];
  for (const match of content.matchAll(CODE_SPAN)) {
    let raw = match[2]!.trim();
    // `` `x` ``: the outer run delimits and the inner backticks are the
    // span. Anything else keeps its content as written.
    if (raw.length > 1 && raw.startsWith('`') && raw.endsWith('`')) raw = raw.slice(1, -1).trim();
    if (NOT_A_SINGLE_PATH.test(raw)) continue;
    const token = raw
      // Trailing sentence punctuation is the sentence's, not the path's.
      .replace(/[.,;:]+$/, '')
      // A `file:line` anchor names one file and one line, and only the file
      // is checked. A line number rots on every edit above it, so a check
      // that demanded exact lines would be red constantly and deleted within
      // a week -- the same argument this file already makes about gates on
      // equality, and the one `docs/adr/STATUS-QUEUE.md` makes for quoting a
      // sentence instead of numbering it.
      .replace(/:\d+(?:-\d+)?$/, '');
    if (!ROOTED_PATH.test(token)) continue;
    // A path has no spaces, and a token carrying brackets is prose about a
    // path rather than the path itself.
    if (/[\s(),[\]]/.test(token)) continue;
    if (!/\.[a-z0-9]+$/i.test(token) && !token.endsWith('/')) continue;
    citations.push({ source, path: token });
  }
  return citations;
}

const citations = markdownFiles.flatMap((file) => rootedPathCitations(relative(ROOT, file), readFileSync(file, 'utf8')));

describe('every rooted path cited in the documentation is on disk', () => {
  it('finds citations to check, so this cannot pass vacuously', () => {
    // An order of magnitude below the 3,693 measured at `3bfb799`: high
    // enough that an extractor which silently stopped matching fails here,
    // low enough that deleting a documentation file does not. It was 50
    // against the 630 measured at `7a15b17`, and moves with the corpus.
    expect(citations.length).toBeGreaterThan(500);
  });

  it('resolves every cited path', () => {
    const dangling = citations
      .filter((citation) => !ABSENT_BY_DESIGN.has(cited(citation)) && !existsSync(join(ROOT, citation.path)))
      .map(cited);

    expect(dangling, 'these documented paths name a file that does not exist').toEqual([]);
  });
});

/**
 * The same check, over the comments in this repository's own source.
 *
 * ## Why this exists
 *
 * The docblock at the top of this file, about the four dangling paths that
 * paid for the check above: *"The other three were each caught by a person
 * reading carefully, which is not a mechanism."* Two of those three were
 * filenames in TypeScript comments. This is the mechanism.
 *
 * It is deliberately the *same* mechanism -- the same `ROOTED_PATH`, the same
 * `NOT_A_SINGLE_PATH`, the same `CODE_SPAN`, the same `rootedPathCitations`.
 * A second extractor would agree with the first on the day it was written and
 * drift afterwards, and two checks that disagree about what a citation is are
 * worse than one, because only one of them gets read.
 *
 * ## The measurement, which is the whole argument
 *
 * Measured at `3bfb799`, over 705 `.ts`, `.mts` and `.mjs` files under `src/`,
 * `tests/`, `tooling/`, `scripts/` and `benchmarks/`: **2,358** rooted-path
 * citations in comments, of which **2,352** resolve. The remaining six occurrences name
 * four distinct paths that are truthfully absent, allowlisted below with their
 * reasons. That is the same justification the markdown side gave for itself --
 * 629 of 630 at `7a15b17`, 3,692 of 3,693 at `3bfb799` -- and it is what makes
 * this a check rather than a list nobody reads, which is the objection the
 * first docblock raises against flagging bare filenames and which still
 * stands.
 *
 * Ten did not resolve when this was first run, over the 693 files of
 * `0850fe8`. **Three were real**, and are corrected two commits before this
 * one:
 *
 * - `src/rendering/assets/environment-atlas-plan.ts` said
 *   `environment-atlas-plan.test.ts`, under `tests/unit/`, "drives both" of
 *   the failures it throws on. The tests are real; they are
 *   `describe('environment atlas plan')` in `tests/unit/environment-art.test.ts`.
 * - `tests/helpers/production-reachability.ts` said its `findImports` fixtures
 *   were in `module-boundaries.test.ts`, under `tests/unit/`. They are in
 *   `tests/unit/module-boundary-rules.test.ts`.
 * - **this file** offered `0007-navigation-and-pathfinding.md`, under
 *   `docs/adr/`, as its worked example of a well-formed rooted token -- in the
 *   sentence that defines what a rooted token *is*. The ADR is
 *   `docs/adr/0007-navigation-work-budgets-and-flow-fields.md`. The contract
 *   written to catch confident pointers at files that are not there carried
 *   one in its own explanation of what it catches, for as long as it has
 *   existed: `7a887b3` wrote that sentence on 2026-08-24 and nothing touched
 *   the filename in it until 2026-08-28. That is the best argument this block
 *   has for existing, so it is written here rather than left in a commit
 *   message.
 *
 * **Two were the extractor's fault, not an author's**: the elision
 * `src/alpha/...`, which the trailing-punctuation strip stripped down into a
 * claim about a directory, and the placeholder `src/ui/<something>/`, which
 * was a shape all along. `NOT_A_SINGLE_PATH` excludes both shapes now.
 * **The other five are true as written**, naming four distinct paths, and are
 * allowlisted below.
 *
 * ## Comments, not code
 *
 * Scanning a source file whole would be wrong in a way that is easy to miss: a
 * template literal is delimited by backticks, so an interpolated path in code
 * reads as a code span in prose. `commentsOf` keeps only the comments, and it
 * does so without adding a second scanner to this repository.
 *
 * `stripComments` (`tests/helpers/canonical-iteration.ts`) replaces every
 * comment character with a space and keeps every newline, so an offset into
 * the stripped text is an offset into the source -- a property pinned across
 * the whole corpus by `tests/foundation/comment-stripping-contract.test.ts`,
 * *"preserves length and line count, so offsets and line numbers stay true"*,
 * and asserted there over every `.ts` file under `src/` and `tests/`. The
 * comments are therefore exactly the characters at which the two texts differ,
 * and that is all `commentsOf` computes.
 *
 * Its residual error is inherited too, and it runs in the safe direction. That
 * scanner resolves the one genuine ambiguity in lexing JavaScript -- whether
 * `/` divides or opens a regular expression -- so that a mis-read leaves a
 * comment *in* the stripped text rather than taking code *out* of it. Read
 * backwards, as here, that means a mis-read costs a comment this check never
 * looks at. It cannot produce a false citation out of code; it can only miss
 * a real one.
 *
 * ## The allowlist is keyed on the pair, not on the path
 *
 * One `ABSENT_BY_DESIGN` serves both corpora, keyed on `source -> path`, so a
 * grant is worth exactly the sentence that earned it. Keying on the path alone
 * -- which is how it was written until 2026-08-28 -- hands out a grant nobody
 * asked for: the one honest mention excuses every other mention of the same
 * path anywhere, including a genuinely dangling one written later by an author
 * who never saw the entry. That is *"an allowlist that absorbs a real dangling
 * reference is worse than no check"*, the markdown docblock's own words,
 * happening to the allowlist itself. The last test in this file is the
 * demonstration: take an entry's path, cite it from a different file, and it
 * is not excused.
 *
 * ## How to record a path that is meant to be dead
 *
 * This repository's rot discipline requires the opposite of what a checker
 * wants: `docs/AGENT_WORKFLOW.md` §4 says to *"mark both directions rather
 * than overwriting"*, so a corrected citation is supposed to be written down
 * *beside* the correction -- and a dead path recorded that way is a dangling
 * rooted path, standing in the tree on purpose. The two rules are in permanent
 * tension and this is how it is resolved here:
 *
 * - **Write the dead name as a bare filename** --
 *   `environment-art-coverage.test.ts` rather than the same name rooted at
 *   `tests/unit/`. It is out of this check's scope by the same rule that keeps
 *   bare filenames out of it everywhere else, the record survives intact, and
 *   the correction standing next to it supplies the directory. This is the
 *   default, and all three corrections above took it.
 * - **Allowlist it only when the rootedness is the point of the sentence.**
 *   `docs/research/NEW_FEATURES.md` below is not a name that was once wrong;
 *   it is a specific rooted path, cited as settled across eight issues, which
 *   has never existed. Shortening it to `NEW_FEATURES.md` would make the
 *   sentence vaguer and no truer. An entry costs a reviewer's attention once,
 *   and the honesty tests below keep it from outliving its reason.
 *
 * The distinction is whether the sentence is about a *name* or about a *path*.
 * A name that turned out to be wrong is prose; a path that was never there is
 * a claim, and a claim gets an entry with a reason attached.
 *
 * ## What this does not reach
 *
 * Shell, Python, PowerShell and SQL under `scripts/` and `tooling/`: 13 files
 * carrying 11 rooted citations at `3bfb799`, all of which resolve. Reaching
 * them needs a `#`-comment scanner, which is the second extractor this block
 * exists to avoid; the honest statement is that the surface is unchecked and
 * was clean when last counted by hand. A citation split across two lines of a
 * JSDoc is not reached either, for the same reason the markdown side does not
 * reach one split across two lines of prose: `CODE_SPAN` stops at a newline.
 */
const SOURCE_TREES = ['src', 'tests', 'tooling', 'scripts', 'benchmarks'] as const;

/** The extensions `stripComments` is a correct scanner for. */
const SOURCE_FILE = /\.(?:ts|mts|mjs)$/;

function collectSourceFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectSourceFiles(path));
      continue;
    }
    if (SOURCE_FILE.test(entry)) files.push(path);
  }
  return files;
}

const sourceFiles = SOURCE_TREES.flatMap((tree) => collectSourceFiles(join(ROOT, tree)));

/**
 * The comments of a source file, with every other character blanked and every
 * newline kept, so what comes out has the shape of the file and none of its
 * code. The inverse of `stripComments`, computed by difference against it --
 * see "Comments, not code" above for why that difference is exact.
 */
function commentsOf(source: string): string {
  const stripped = stripComments(source);
  let comments = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    comments += character === '\n' ? '\n' : stripped[index] === character ? ' ' : character;
  }
  return comments;
}

const sourceCitations = sourceFiles.flatMap((file) =>
  rootedPathCitations(relative(ROOT, file), commentsOf(readFileSync(file, 'utf8'))),
);

describe('every rooted path cited in a source comment is on disk', () => {
  it('finds source files and citations to check, so this cannot pass vacuously', () => {
    // An order of magnitude below the 2,358 measured at `3bfb799`.
    // This is the guard that fails if `commentsOf` ever returns nothing, or if
    // `CODE_SPAN` stops matching: either would leave every assertion below
    // trivially satisfied and the check silently gone.
    expect(sourceFiles.length).toBeGreaterThan(400);
    expect(sourceCitations.length).toBeGreaterThan(200);
  });

  it('reads comments and not code, in both directions', () => {
    const fixture = [
      'const label = "see `docs/in-a-string.md`";',
      'const template = `docs/in-a-template.md`;',
      'const ratio = width / height; // `docs/after-a-division.md`',
      '// `docs/in-a-line-comment.md`',
      '/* `docs/in-a-block-comment.md` */',
    ].join('\n');

    expect(rootedPathCitations('fixture.ts', commentsOf(fixture)).map(({ path }) => path)).toEqual([
      'docs/after-a-division.md',
      'docs/in-a-line-comment.md',
      'docs/in-a-block-comment.md',
    ]);
  });

  it('resolves every cited path', () => {
    const dangling = sourceCitations
      .filter((citation) => !ABSENT_BY_DESIGN.has(cited(citation)) && !existsSync(join(ROOT, citation.path)))
      .map(cited);

    expect(dangling, 'these paths cited in source comments name a file that does not exist').toEqual([]);
  });
});

/**
 * The allowlist's own hygiene, over both corpora at once because one map now
 * serves both. Kept here rather than inside either describe block above: an
 * entry earned by a markdown sentence is not dead weight because no source
 * comment repeats it, and an entry read by only one of the two checks would
 * be exactly the silent over-grant the pair key exists to prevent.
 */
describe('the absent-by-design allowlist earns its entries', () => {
  it('holds no entry whose file has started existing', () => {
    const nowPresent = [...ABSENT_BY_DESIGN.keys()].filter((key) => existsSync(join(ROOT, allowedPath(key))));

    expect(nowPresent, 'these are allowlisted as absent but are on disk').toEqual([]);
  });

  it('holds no entry that nothing cites', () => {
    expect(
      unusedAllowlistEntries(citations, sourceCitations),
      'these allowlist entries are cited by nothing',
    ).toEqual([]);
  });

  it('excuses the sentence that earned the entry and no other', () => {
    for (const key of ABSENT_BY_DESIGN.keys()) {
      const elsewhere: Citation = { source: 'docs/some-other-document.md', path: allowedPath(key) };

      // The path really is absent, so nothing but the allowlist could excuse
      // it -- and cited from a file with no entry of its own, nothing does.
      expect(existsSync(join(ROOT, elsewhere.path))).toBe(false);
      expect(ABSENT_BY_DESIGN.has(cited(elsewhere)), `${key} excuses a citation it never earned`).toBe(false);
    }
  });
});
