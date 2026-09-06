import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
