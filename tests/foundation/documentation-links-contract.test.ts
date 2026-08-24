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
 * `src/content/validate-catalog.ts` already makes about enum discovery.
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
