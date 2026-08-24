import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Documentation claims about the code, asserted against the code.
 *
 * `docs/ARCHITECTURE.md` declares its contracts binding, which is why a false
 * sentence in it is a defect rather than untidiness — and issue #121 found five
 * of them at once. Two of the five were the kind that reads as settled fact and
 * sends an agent in a straight line the wrong way: the architecture topology
 * listed "compressed immutable save versions" and "Supabase cloud sync" as
 * things the app has, when nothing compresses anything and no module in `src/`
 * can reach the cloud client at all. An agent sizing a save assumed a
 * compression ratio that does not exist; an agent asked to finish cloud save
 * hunted for a wiring bug instead of writing the wiring.
 *
 * The prose is corrected. These are the assertions that keep it corrected, and
 * they are the ones #121 identified as mechanically checkable. The value is not
 * in catching a typo — it is that when one of these becomes *false because the
 * code changed*, the test fails and the sentence has to be rewritten in the
 * same change rather than quietly becoming a lie.
 *
 * Deliberately not here: #121's item 1 (whether the trusted-services layer is
 * "asynchronous") and item 5 (whether `ISSUE_BACKLOG.md`'s delivery table
 * should be extended or reduced). The first needs a return-type accounting of
 * `src/services/**` and touches files another change is live in; the second is
 * a product decision `docs/ISSUE_BACKLOG.md` explicitly parks for the owner.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function collectSourceFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
      continue;
    }
    if (entry.name.endsWith('.ts')) files.push(entryPath);
  }
  return files;
}

/** Comments removed, so a sentence *about* a mechanism is not read as the mechanism. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

async function sourceFilesMatching(pattern: RegExp): Promise<readonly string[]> {
  const files = await collectSourceFiles(path.join(repositoryRoot, 'src'));

  // Vacuity guard: an empty or failed walk would make every assertion below
  // pass while reading nothing.
  expect(files.length, 'no TypeScript files found under src/; the walk is broken').toBeGreaterThan(100);

  const matches: string[] = [];
  for (const file of files) {
    if (pattern.test(code(await readFile(file, 'utf8')))) matches.push(path.relative(repositoryRoot, file));
  }
  return matches;
}

describe('docs/ARCHITECTURE.md: what the persistence layer actually does', () => {
  it('compresses nothing, as the topology and the persistence section both now say', async () => {
    // The claim being pinned: "immutable save versions (payloads are not
    // compressed)" and "no payload is compressed anywhere in `src/`".
    //
    // Comment-stripped on purpose: `src/persistence/size.ts` explains that its
    // estimate exists so a *future* storage backend can decide when
    // compression is worth it. Discussing compression is not performing it,
    // and a check that could not tell the difference would have to be
    // allow-listed immediately.
    // No word boundaries: the first version of this used `\bcompress\b`, and a
    // mutation adding `export function compressPayload(...)` walked straight
    // through it, because `P` is a word character. The likeliest real
    // introduction is exactly a name like that, so this matches the substring.
    const compressing = await sourceFilesMatching(/compress|gzip|deflate|zlib|brotli/iu);
    expect(
      compressing,
      'something under src/ now compresses. docs/ARCHITECTURE.md and docs/PERSISTENCE.md both state that nothing does -- correct them in the same change',
    ).toEqual([]);
  });

  it('cannot reach Supabase from the running app, as the topology and the persistence section both now say', async () => {
    // The claim being pinned: "Supabase cloud sync (contract and SQL only --
    // not reachable from the app)" and "nothing under `src/` reads
    // `VITE_SUPABASE_*` or imports `src/persistence/cloud/`".
    //
    // `src/persistence/cloud/` itself is excluded: it *is* the cloud client,
    // and it naming its own configuration is not the app reaching it. What
    // this catches is the wiring appearing anywhere else -- which is a good
    // change to make, and one that must update the documentation with it.
    const reaching = (await sourceFilesMatching(/import\s*\.\s*meta\s*\.\s*env|VITE_SUPABASE|createClient\s*\(/u)).filter(
      (file) => !file.startsWith(path.join('src', 'persistence', 'cloud')),
    );
    expect(
      reaching,
      'a module outside src/persistence/cloud/ now reads Supabase configuration. That is cloud save becoming reachable, which is a real milestone -- say so in docs/ARCHITECTURE.md and docs/CLOUD_SAVE.md in the same change',
    ).toEqual([]);
  });
});

describe('docs/ROADMAP.md: Phase 0 claims only what the repository has', () => {
  it('agrees with package.json about whether a linter or formatter exists', async () => {
    // #121 found Phase 0 claiming "lint/format/test/build CI" and "issue and
    // PR templates" against a repository with no linter, no formatter, no
    // `lint` script and no pull-request template. The roadmap now says so
    // explicitly, and that parenthetical is what this asserts -- in both
    // directions, because adding a linter is a real decision that should
    // update the sentence rather than leave it stale in the other direction.
    const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>;
      readonly devDependencies?: Readonly<Record<string, string>>;
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    const roadmap = await readFile(path.join(repositoryRoot, 'docs/ROADMAP.md'), 'utf8');

    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];
    const linters = dependencyNames.filter((name) => /^(?:eslint|prettier|@biomejs\/biome|oxlint|dprint)$/u.test(name));
    const lintScripts = Object.keys(packageJson.scripts ?? {}).filter((name) => /^(?:lint|format)(?::|$)/u.test(name));

    const repositoryHasOne = linters.length > 0 || lintScripts.length > 0;
    const roadmapSaysThereIsNone = roadmap.includes('there is no linter or formatter in this repository');

    expect(
      { repositoryHasOne, roadmapSaysThereIsNone, linters, lintScripts },
      repositoryHasOne
        ? 'a linter or formatter was added: remove the parenthetical from docs/ROADMAP.md Phase 0, add it to docs/TESTING.md, and gate it in CI'
        : 'docs/ROADMAP.md Phase 0 must keep recording that there is no linter or formatter, because there is not one',
    ).toMatchObject({ repositoryHasOne, roadmapSaysThereIsNone: !repositoryHasOne });
  });

  it('claims no pull-request template while none exists', async () => {
    const githubDirectory = path.join(repositoryRoot, '.github');
    const templates: string[] = [];
    for (const candidate of ['pull_request_template.md', 'PULL_REQUEST_TEMPLATE.md', 'PULL_REQUEST_TEMPLATE']) {
      try {
        await stat(path.join(githubDirectory, candidate));
        templates.push(candidate);
      } catch {
        // Absent, which is the expected state.
      }
    }

    const roadmap = await readFile(path.join(repositoryRoot, 'docs/ROADMAP.md'), 'utf8');
    if (templates.length === 0) {
      expect(
        roadmap,
        'docs/ROADMAP.md Phase 0 must say "issue templates", not "issue and PR templates": there is no pull-request template',
      ).not.toContain('issue and PR templates');
    } else {
      expect(
        roadmap,
        `a pull-request template exists (${templates.join(', ')}), so docs/ROADMAP.md Phase 0 may say so again`,
      ).toContain('PR template');
    }
  });
});
