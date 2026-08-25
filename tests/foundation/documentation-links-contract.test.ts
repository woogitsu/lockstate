import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
 * Deliberately narrow. It checks `[text](target)`, not backticked filenames in
 * prose: `` `foo.ts` `` in a sentence may be a module, a concept, a file that
 * is about to exist or an example, and a check that flagged all of them would
 * produce a list nobody reads -- which is the argument
 * `tests/helpers/simulation-enum-source.ts` already makes about enum discovery.
 *
 * That argument is about a *bare filename*, and the second describe block
 * below covers the one subset it does not reach: a backticked token that is
 * **rooted at a top-level directory of this repository and carries a file
 * extension**, like `` `docs/adr/0007-navigation-and-pathfinding.md` ``. Such a
 * token is not plausibly a module name, a concept or an example -- it is a
 * path, and it either resolves or it does not. The measured false-positive
 * rate is what justifies the distinction rather than the argument alone:
 * measured at `7a15b17`, the documentation carries **630** such citations, of
 * which **629** resolve. The single exception is prose about a file that only
 * ever existed on a closed pull request's branch, and it is allowlisted below
 * with that reason.
 *
 * Those are occurrences, not distinct paths -- the same 630 the check itself
 * counts, so the figure and the check cannot disagree.
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
 */
const ROOTED_PATH = /^(?:docs|src|tests|scripts|supabase|public|\.github)\//;

/**
 * Tokens excluded before the existence check, each because it is not a claim
 * that one specific file is on disk.
 *
 * `*` is a glob and `\u2026` is an elision standing in for a name the sentence
 * does not know -- `` `supabase/migrations/\u2026_create_challenge_tables.sql` ``
 * in ADR 0009 is a migration whose timestamp prefix is deliberately not
 * written down. Both describe a shape, and a shape has no single path to
 * resolve.
 */
const NOT_A_SINGLE_PATH = /[*\u2026]/;

/**
 * Rooted paths that truthfully name a file this repository does not contain.
 *
 * Each entry has to earn its place by being *true as written*, not merely
 * tolerated: an allowlist that absorbs a real dangling reference is worse than
 * no check, because it makes the reference look reviewed.
 */
const ABSENT_BY_DESIGN: ReadonlyMap<string, string> = new Map([
  [
    'docs/adr/0018-construction-material-supply.md',
    // `docs/adr/README.md` names this file to explain where the 0018 number
    // went, and states two paragraphs earlier that "0018 is the one number
    // with no file in this directory". The file existed on PR #91's branch,
    // which was closed as superseded by #249. The sentence is history, and it
    // is accurate; it is the absence that is the point of writing it.
    'named by docs/adr/README.md as the file PR #91 added before it was closed as superseded',
  ],
]);

interface Citation {
  readonly source: string;
  readonly path: string;
}

function rootedPathCitations(path: string): readonly Citation[] {
  const source = relative(ROOT, path);
  const citations: Citation[] = [];
  for (const match of readFileSync(path, 'utf8').matchAll(/`([^`\n]+)`/g)) {
    // Trailing sentence punctuation is the sentence's, not the path's.
    const token = match[1]!.trim().replace(/[.,;:]+$/, '');
    if (!ROOTED_PATH.test(token)) continue;
    if (NOT_A_SINGLE_PATH.test(token)) continue;
    // A path has no spaces, and a token carrying brackets is prose about a
    // path rather than the path itself.
    if (/[\s(),[\]]/.test(token)) continue;
    if (!/\.[a-z0-9]+$/i.test(token) && !token.endsWith('/')) continue;
    citations.push({ source, path: token });
  }
  return citations;
}

const citations = markdownFiles.flatMap(rootedPathCitations);

describe('every rooted path cited in the documentation is on disk', () => {
  it('finds citations to check, so this cannot pass vacuously', () => {
    // An order of magnitude below the 630 measured at `7a15b17`: high enough
    // that an extractor which silently stopped matching fails here, low
    // enough that deleting a documentation file does not.
    expect(citations.length).toBeGreaterThan(50);
  });

  it('resolves every cited path', () => {
    const dangling = citations
      .filter(({ path }) => !ABSENT_BY_DESIGN.has(path) && !existsSync(join(ROOT, path)))
      .map(({ source, path }) => `${source} -> ${path}`);

    expect(dangling, 'these documented paths name a file that does not exist').toEqual([]);
  });

  it('keeps the allowlist honest: an entry that starts existing must be removed', () => {
    const nowPresent = [...ABSENT_BY_DESIGN.keys()].filter((path) => existsSync(join(ROOT, path)));

    expect(nowPresent, 'these are allowlisted as absent but are on disk').toEqual([]);
  });

  it('keeps the allowlist used: an entry nothing cites is dead weight', () => {
    const cited = new Set(citations.map(({ path }) => path));
    const uncited = [...ABSENT_BY_DESIGN.keys()].filter((path) => !cited.has(path));

    expect(uncited, 'these allowlist entries are cited by no documentation').toEqual([]);
  });
});
