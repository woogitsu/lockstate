import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { environmentRenderedArtIds } from '../../src/rendering/assets/environment-sprites';
import { LFS_POINTER_PREFIX, assertSourceInputsAreImages } from '../../tooling/source-art-lfs-guard.mjs';

/**
 * `tooling/build-rendered-art-catalog.mjs`'s equivalent of
 * `tests/foundation/art-catalog-generator-contract.test.ts` -- ADR 0100's
 * second publishing lane needs the same three properties the first one
 * already gets: invocable by name (#141's lesson generalises to any
 * committed-artefact generator, not just the first one written), guarded
 * against publishing pointer text as if it were a render, and unable to
 * silently drift from the sprite registry that names what it should publish.
 *
 * That third property is this lane's own addition, and the reason it needs
 * one: `build-source-art-catalog.mjs` publishes every id its intake manifest
 * names, with no registry to drift from (`environmentSourceAssetIds()` only
 * ever *subsets* the committed catalog, never demands the catalog grow to
 * match it). This generator does the opposite -- it publishes a small,
 * explicit list rather than "all 23 renders" -- specifically so that "art
 * nothing draws costs nothing" (the same rule `environmentSourceAssetIds()`
 * enforces for the owner sheets) holds here too. That rule only holds if the
 * explicit list and `environment-sprites.ts`'s declared `kind: 'rendered-art'`
 * ids cannot quietly diverge, which is what the last test below checks.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERATOR = 'tooling/build-rendered-art-catalog.mjs';
const GUARD = 'tooling/source-art-lfs-guard.mjs';

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('utf8');
const POINTER_HEAD = LFS_POINTER_PREFIX;

function readerFor(heads: Readonly<Record<string, string>>): (assetId: string) => Promise<string> {
  return async (assetId) => {
    const head = heads[assetId];
    if (head === undefined) throw new Error(`the fixture has no input named ${assetId}`);
    return head;
  };
}

describe('the rendered-art catalog generator', () => {
  it('is reachable from package.json rather than only from prose', async () => {
    const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>;
    };
    const invoking = Object.entries(packageJson.scripts ?? {}).filter(([, command]) => command.includes(GENERATOR));
    expect(
      invoking.map(([name]) => name),
      `${GENERATOR} writes a committed artefact and must be invocable by name, or editing an input silently does not regenerate it (#141)`,
    ).not.toEqual([]);
  });

  it('is documented with the command that runs it', async () => {
    const artPipeline = await readFile(path.join(repositoryRoot, 'docs/ART_PIPELINE.md'), 'utf8');
    expect(artPipeline, 'docs/ART_PIPELINE.md must name the script').toContain(GENERATOR);
    expect(artPipeline, 'and the command an operator actually types').toContain('pnpm content:rendered-art');
  });

  it('publishes exactly the ids environment-sprites.ts declares as rendered-art, in either direction', async () => {
    /*
     * `PUBLISHED_ASSET_IDS` is data in a plain .mjs script, kept in sync with
     * `environment-sprites.ts`'s declared `kind: 'rendered-art'` entries by
     * this assertion rather than by import -- the same split
     * `build-source-art-catalog.mjs` has from its own intake manifest, for
     * the same reason: a tooling script cannot import TypeScript.
     *
     * READ AS TEXT RATHER THAN IMPORTED, AND THAT IS NOT A STYLE CHOICE.
     * The first version of this test imported the constant, which executes
     * the generator: its guard and its writes are at module top level, on
     * purpose, because "a check that runs after the damage is done is not a
     * guard". Importing it therefore ran the guard, and the `verify` job
     * deliberately checks out LFS as pointers (ADR 0014, "Verification"), so
     * the guard did exactly what it exists to do and `main` went red with
     *
     *     Refusing to run: 1 of 1 inputs under assets/source/generated/ are
     *     git-lfs pointer files, not images (fixture.cell.toilet_sink.png).
     *
     * `tests/foundation/art-catalog-generator-contract.test.ts` had already
     * settled the shape: it names its own generator as a path string and
     * never imports it. This follows that precedent instead of inventing a
     * second one, and it means this file has no LFS requirement at all.
     */
    const generatorSource = await readFile(path.join(repositoryRoot, GENERATOR), 'utf8');
    const declaration = /export const PUBLISHED_ASSET_IDS = \[([^\]]*)\]/u.exec(generatorSource);
    expect(declaration, `${GENERATOR} must declare PUBLISHED_ASSET_IDS as a literal array this gate can read`).not.toBeNull();
    const published = [...(declaration?.[1] ?? '').matchAll(/'([^']+)'/gu)].map((match) => match[1]);
    expect(published, `${GENERATOR} declares an empty published list, so this gate would compare nothing`).not.toEqual([]);

    const declared = environmentRenderedArtIds();
    expect(
      [...published].sort(),
      'the generator publishes an id no sprite declares, which is exactly the "art nothing draws costs bytes" trap this lane exists to avoid',
    ).toEqual([...declared].sort());
  });
});

describe('the git-lfs guard the rendered-art generator runs before it publishes anything', () => {
  it('refuses a pointer-only checkout, naming the files and the remedy', async () => {
    const entries = ['guard-tower', 'cell-block', 'yard-gate'];
    const refusal = assertSourceInputsAreImages({
      entries,
      readHead: readerFor({ 'guard-tower': POINTER_HEAD, 'cell-block': POINTER_HEAD, 'yard-gate': POINTER_HEAD }),
    });
    await expect(refusal).rejects.toThrow(/Refusing to run/u);
    const message = await refusal.then(
      () => '',
      (thrown: unknown) => (thrown instanceof Error ? thrown.message : String(thrown)),
    );
    expect(message).toContain('3 of 3');
    expect(message).toContain('guard-tower.png');
    expect(message).toContain('git lfs pull');
  });

  it('lets a checkout with real image content through', async () => {
    await expect(
      assertSourceInputsAreImages({
        entries: ['guard-tower', 'cell-block'],
        readHead: readerFor({ 'guard-tower': PNG_HEAD, 'cell-block': PNG_HEAD }),
      }),
    ).resolves.toBeUndefined();
  });

  it('is awaited by the generator before it writes anything into the published directory', async () => {
    const source = await readFile(path.join(repositoryRoot, GENERATOR), 'utf8');
    const refusal = source.indexOf('await assertSourceInputsAreImages(');
    const firstWrite = source.indexOf('await writeFile(path.join(outputDir, image), buffer)');

    expect(refusal, 'the generator must await the git-lfs guard').toBeGreaterThan(-1);
    expect(firstWrite, 'the generator is expected to publish at least one image').toBeGreaterThan(-1);
    expect(
      refusal,
      'the refusal must be awaited before the first image write: a guard that fires after publishing has already done the damage',
    ).toBeLessThan(firstWrite);

    const callLine = source.split('\n').find((line) => line.includes('assertSourceInputsAreImages({'));
    expect(callLine?.trim(), 'the guard must be called unconditionally').toMatch(
      /^await assertSourceInputsAreImages\(/u,
    );
  });

  it('reuses the same guard module as the owner-sheet generator, rather than a second copy of it', async () => {
    const source = await readFile(path.join(repositoryRoot, GENERATOR), 'utf8');
    expect(source, `${GENERATOR} should import its guard from ${GUARD} rather than reimplementing it`).toContain(
      "from './source-art-lfs-guard.mjs'",
    );
  });
});
