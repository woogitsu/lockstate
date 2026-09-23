import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exactPixelAspectMatchesFootprint } from '../../tooling/validate-rendered-art-catalog.mjs';
import { expectOk } from '../helpers/expect-ok';

const root = resolve(import.meta.dirname, '..', '..');

/**
 * `art-pipeline-contract.test.ts`'s hash-check test, for the second catalog
 * ADR 0100 added. Same duality, same reason: `assets/rendered/environment/`
 * and `public/game-content/` are both Git LFS content the `verify` job stays
 * a pointer-only checkout against, so a declared `sha256` is checked against
 * either the real bytes or the pointer's own `oid`, and neither branch is
 * vacuous.
 *
 * This is the vitest-layer half of the gate; `tooling/validate-rendered-art-catalog.mjs`
 * (run standalone, and via `pnpm verify:assets`) is the other half and checks
 * the same cross-reference plus the geometry invariants ADR 0100 named. Two
 * gates rather than one because this one runs on every `pnpm test`, the
 * other is the one `pnpm verify:assets` and CI's `assets` job actually call --
 * `tools/`-side and test-side is exactly the split
 * `tests/foundation/art-catalog-generator-contract.test.ts` documents for
 * the source-art generator's own guard.
 */
describe('rendered-art pipeline contract', () => {
  it('declares a content hash that matches the committed render and the published copy, in a full or pointer-only checkout', async () => {
    const catalogPath = resolve(root, 'public/game-content/rendered-art.v1.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as {
      schemaVersion: number;
      kind: string;
      entries: Array<{ assetId: string; image: string; sha256: string; sourceAttribution: { license: string } }>;
    };
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.kind).toBe('lockstate.rendered-art-catalog');
    expect(catalog.entries.length).toBeGreaterThan(0);

    const sidecarPath = resolve(root, 'assets/rendered/environment/environment-objects.render.json');
    const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8')) as {
      entries: Array<{ assetId: string; image: string; sha256: string }>;
    };
    const sidecarById = new Map(sidecar.entries.map((entry) => [entry.assetId, entry]));

    let pointerOnly = 0;
    let hashedBytes = 0;

    for (const entry of catalog.entries) {
      expect(entry.sha256, `${entry.assetId} must declare a sha256`).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.sourceAttribution.license).toBe('project-rendered, reproducible');

      const sidecarEntry = sidecarById.get(entry.assetId);
      expect(sidecarEntry, `${entry.assetId} is published but environment-objects.render.json no longer describes it`).toBeDefined();
      expect(entry.sha256, `${entry.assetId}: catalog sha256 must match the sidecar's`).toBe(sidecarEntry!.sha256);

      // The published copy: readFile rather than access, for the same reason
      // `art-pipeline-contract.test.ts` gives -- a missing file fails here
      // with its own path in the error.
      const publishedBytes = await readFile(resolve(root, 'public/game-content', entry.image));
      const publishedText = publishedBytes.subarray(0, 200).toString('utf8');
      if (publishedText.startsWith('version https://git-lfs.github.com/spec/v1')) {
        const oid = /oid sha256:([a-f0-9]{64})/u.exec(publishedText)?.[1];
        expect(oid, `${entry.image} is an LFS pointer but declares no sha256 oid`).toBeDefined();
        expect(oid, `${entry.image}: the catalog hash must match the published pointer's oid`).toBe(entry.sha256);
        pointerOnly += 1;
      } else {
        const digest = createHash('sha256').update(publishedBytes).digest('hex');
        expect(digest, `${entry.image}: the catalog hash must match the published image bytes`).toBe(entry.sha256);
        hashedBytes += 1;
      }

      // The committed render itself, under assets/rendered/environment/ --
      // proves the published copy did not merely agree with a corrupted
      // sidecar, but with the actual reviewed render PR #1041 shipped.
      const renderedBytes = await readFile(resolve(root, 'assets/rendered/environment', sidecarEntry!.image));
      const renderedText = renderedBytes.subarray(0, 200).toString('utf8');
      if (renderedText.startsWith('version https://git-lfs.github.com/spec/v1')) {
        const oid = /oid sha256:([a-f0-9]{64})/u.exec(renderedText)?.[1];
        expect(oid, `${sidecarEntry!.image} is an LFS pointer but declares no sha256 oid`).toBeDefined();
        expect(oid, `${sidecarEntry!.image}: the sidecar hash must match the committed render's oid`).toBe(entry.sha256);
      } else {
        const digest = createHash('sha256').update(renderedBytes).digest('hex');
        expect(digest, `${sidecarEntry!.image}: the sidecar hash must match the committed render's bytes`).toBe(entry.sha256);
      }

      expect(entry.image, `${entry.image} must embed the first 12 characters of its hash`).toContain(entry.sha256.slice(0, 12));
      expect(entry.image, `${entry.image} must carry the rendered. prefix, to avoid colliding with an owner sheet of the same asset id`).toMatch(
        /^source-art\/rendered\./,
      );
    }

    expect(pointerOnly + hashedBytes).toBe(catalog.entries.length);
  });
});

/**
 * `frameAspectDriftFromFootprint == 0.0 "by construction"` is the second claim
 * PR #1041's renderer made, and `docs/ART_PIPELINE.md` ("Reproducibility")
 * records it holding for the original 23 models -- but until this test, nothing
 * checked that *claim itself*, only that the field the renderer writes stays
 * near zero (`tooling/validate-rendered-art-catalog.mjs`'s old Check 3, and
 * only for the currently-published subset of the 23).
 *
 * This recomputes the aspect identity from the sidecar's own primitive
 * fields -- `footprintTiles` and `sizePx` -- for every one of the 30 entries,
 * using `exactPixelAspectMatchesFootprint`, which never reads
 * `frameAspectDriftFromFootprint` at all. The 2026-09-23 fixture batch adds
 * three more models, including the unpublished sink; the storage-rack batch
 * adds one more, the wooden-chair batch another, and the dining-table batch
 * adds the 29th; the infirmary medical bed adds the 30th. It runs with no Blender,
 * no image bytes and no LFS content: `environment-objects.render.json` is plain
 * committed JSON, so this is part of `pnpm test` and therefore of every CI
 * `verify` run, unlike the render-determinism gate
 * (`tests/determinism/environment-render-determinism.test.ts`), which needs
 * Blender and is not.
 *
 * What this does NOT prove: that the sidecar's `sizePx` is what Blender would
 * render *today* -- only that the numbers already committed are internally
 * consistent with each other. Whether Blender reproduces them is the
 * determinism gate's job, not this one's.
 */
describe('environment render aspect invariant (recomputed, not trusted)', () => {
  it('exactly reproduces the footprint aspect, for every one of the 31 rendered entries', async () => {
    const sidecarPath = resolve(root, 'assets/rendered/environment/environment-objects.render.json');
    const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8')) as {
      entries: Array<{ assetId: string; footprintTiles: { width: number; height: number }; sizePx: { width: number; height: number } }>;
    };
    expect(sidecar.entries.length).toBe(31);

    const failures: string[] = [];
    for (const entry of sidecar.entries) {
      const result = exactPixelAspectMatchesFootprint(entry.footprintTiles, entry.sizePx);
      if (!result.ok) failures.push(`${entry.assetId}: ${result.reason}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('is a real check and not a tautology: a mismatched pixel size is rejected', () => {
    // A fixture the code under test does not compute -- 3 wide by 1 tall is
    // not 256x256, and no float tolerance should paper over that.
    const result = exactPixelAspectMatchesFootprint({ width: 3, height: 1 }, { width: 256, height: 256 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/does not exactly reproduce the footprint aspect/);
  });

  it('accepts an exact match with no float tolerance smuggled in', () => {
    // 1.4 tiles by 1 tile, reduced: 7:5. 358x256 is not 7:5 (7*256=1792,
    // 5*358=1790) -- close enough that a naive `Math.abs(ratio - ratio) < 1e-2`
    // check would wrongly accept it. This must still be rejected.
    expect(exactPixelAspectMatchesFootprint({ width: 1.4, height: 1 }, { width: 358, height: 256 }).ok).toBe(false);
    expect(exactPixelAspectMatchesFootprint({ width: 1.4, height: 1 }, { width: 358, height: 255.71428571 }).ok).toBe(false);
    expectOk(exactPixelAspectMatchesFootprint({ width: 1.4, height: 1 }, { width: 1792, height: 1280 }), 'the exactly-7:5 pixel size');
  });

  it('rejects a footprint that is not an exact multiple of 1/20 of a tile', () => {
    // The renderer's own precondition (`_pixel_size`'s docstring: "every
    // declared footprint is an exact multiple of 1/20 of a tile"). A
    // footprint that violates it makes the renderer's own pixel-size
    // derivation meaningless, so this must be reported rather than silently
    // rounded through.
    const result = exactPixelAspectMatchesFootprint({ width: 1.001, height: 1 }, { width: 256, height: 256 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not an exact multiple of 1\/20/);
  });
});
