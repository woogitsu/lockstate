import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateAtlasDirectory } from '../../tooling/validate-runtime-atlas.mjs';
import {
  FIXTURE_ASSET_ID,
  FIXTURE_WALK_FRAMES,
  buildAtlasFixture,
  encodeBlankPng,
  writeAtlasFixture,
  type AtlasFixture,
} from '../helpers/atlas-fixture';

/**
 * Issue #32 requires that missing, inconsistent or oversized assets fail
 * validation before build/release. A validator that never rejects anything is
 * worse than none, so every rule the gate claims to enforce gets a case here
 * that proves the broken batch is actually refused.
 *
 * These fixtures are synthetic and tiny: they need no Git LFS content, so this
 * runs in the ordinary `pnpm test` gate. `pnpm verify:assets` runs the same
 * implementation against the real, LFS-backed batch.
 */

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function validateFixture(mutate?: (fixture: AtlasFixture) => void): Promise<readonly string[]> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lockstate-atlas-'));
  temporaryDirectories.push(directory);

  const fixture = buildAtlasFixture();
  mutate?.(fixture);
  const { contractPath } = await writeAtlasFixture(directory, fixture);

  const result = await validateAtlasDirectory(directory, { contract: contractPath });
  return result.errors;
}

function walkManifest(fixture: AtlasFixture) {
  const manifest = fixture.manifests.find((candidate) => candidate.image.includes('.walk.'));
  if (manifest === undefined) throw new Error('fixture shape changed');
  const clip = manifest.clips.walk;
  if (clip === undefined) throw new Error('fixture shape changed');
  return { manifest, clip };
}

describe('runtime atlas validation gate', () => {
  it('accepts a well-formed eight-direction batch', async () => {
    await expect(validateFixture()).resolves.toEqual([]);
  });

  it('rejects an eight-direction clip that is missing a direction', async () => {
    const errors = await validateFixture((fixture) => {
      delete walkManifest(fixture).clip.frames.north;
    });
    expect(errors).toContain(`${FIXTURE_ASSET_ID}.walk.png is missing the north direction`);
  });

  it('rejects a direction that is short of the frames its clip declares', async () => {
    const errors = await validateFixture((fixture) => {
      const { clip } = walkManifest(fixture);
      clip.frames.south = clip.frames.south!.slice(0, FIXTURE_WALK_FRAMES - 1);
    });
    expect(errors).toContain(
      `${FIXTURE_ASSET_ID}.walk.png has ${FIXTURE_WALK_FRAMES - 1} south frames but clip 'walk' declares ${FIXTURE_WALK_FRAMES}`,
    );
  });

  it('rejects two manifests claiming the same logical asset id', async () => {
    const errors = await validateFixture((fixture) => {
      fixture.extraManifests['actor.fixture.clone.atlas-manifests.json'] = fixture.manifests.map((manifest) => ({
        ...manifest,
        image: manifest.image.replace('.base.', '.clone.'),
      }));
    });
    expect(errors.some((error) => error.includes(`duplicate logical asset id "${FIXTURE_ASSET_ID}"`))).toBe(true);
  });

  it('rejects a pivot that differs between an asset own clips', async () => {
    const errors = await validateFixture((fixture) => {
      const idle = fixture.manifests[0];
      if (idle === undefined) throw new Error('fixture shape changed');
      idle.frame.footPivotPx = { x: 0, y: 0 };
    });
    expect(errors.some((error) => error.includes('inconsistent pivots'))).toBe(true);
  });

  it('rejects a pivot that does not match the authored contract', async () => {
    const errors = await validateFixture((fixture) => {
      for (const manifest of fixture.manifests) manifest.frame.footPivotPx = { x: 1, y: 1 };
    });
    expect(errors.some((error) => error.includes('but the contract fixes it at'))).toBe(true);
  });

  it('rejects a manifest with no frame block, so a pivot can never go unchecked', async () => {
    const errors = await validateFixture((fixture) => {
      const idle = fixture.manifests[0];
      if (idle === undefined) throw new Error('fixture shape changed');
      delete (idle as Partial<typeof idle>).frame;
    });
    expect(errors.some((error) => error.includes('has no frame block'))).toBe(true);
  });

  it('rejects an atlas larger than the contract texture limit even when the image agrees', async () => {
    // The image really is this size, so this is not a manifest/image mismatch:
    // it is the oversized-texture rule itself.
    const errors = await validateFixture((fixture) => {
      fixture.contract.atlas.maxDimensionPx = 64;
    });
    expect(errors.some((error) => error.includes('over the 64px contract limit'))).toBe(true);
  });

  it('rejects a frame rectangle that falls outside its atlas', async () => {
    const errors = await validateFixture((fixture) => {
      const { clip } = walkManifest(fixture);
      clip.frames.east = [{ x: 900, y: 900, width: 8, height: 12 }];
    });
    expect(errors.some((error) => error.includes('out-of-bounds east frame'))).toBe(true);
  });

  it('rejects a frame size that contradicts the contract', async () => {
    const errors = await validateFixture((fixture) => {
      for (const manifest of fixture.manifests) {
        manifest.frame.widthPx = 3;
        manifest.frame.heightPx = 3;
      }
    });
    expect(errors.some((error) => error.includes('but the contract fixes them at'))).toBe(true);
  });

  it('rejects an image whose real dimensions disagree with its manifest', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'lockstate-atlas-'));
    temporaryDirectories.push(directory);
    const fixture = buildAtlasFixture();
    const { contractPath } = await writeAtlasFixture(directory, fixture);
    const walk = fixture.manifests[1];
    if (walk === undefined) throw new Error('fixture shape changed');
    await writeFile(path.join(directory, walk.image), encodeBlankPng(walk.widthPx, walk.heightPx + 4));

    const result = await validateAtlasDirectory(directory, { contract: contractPath });
    expect(result.errors).toContain(`${walk.image} dimensions do not match its manifest`);
  });

  it('rejects a Git LFS pointer standing in for image data, instead of passing vacuously', async () => {
    // This is what a checkout without `lfs: true` actually contains. The gate
    // has to say so: a pointer-only run must not look like a green batch.
    const directory = await mkdtemp(path.join(os.tmpdir(), 'lockstate-atlas-'));
    temporaryDirectories.push(directory);
    const fixture = buildAtlasFixture();
    const { contractPath } = await writeAtlasFixture(directory, fixture);
    const idle = fixture.manifests[0];
    if (idle === undefined) throw new Error('fixture shape changed');
    await writeFile(
      path.join(directory, idle.image),
      'version https://git-lfs.github.com/spec/v1\noid sha256:0000\nsize 1\n',
    );

    const result = await validateAtlasDirectory(directory, { contract: contractPath });
    expect(result.errors.some((error) => error.includes('is a Git LFS pointer'))).toBe(true);
  });

  it('rejects a registry that disagrees with the manifests beside it', async () => {
    const errors = await validateFixture((fixture) => {
      fixture.registry.assets = [
        { assetId: FIXTURE_ASSET_ID, manifest: `${FIXTURE_ASSET_ID}.atlas-manifests.json`, clips: ['idle'] },
      ];
    });
    expect(errors.some((error) => error.includes('but its manifest holds'))).toBe(true);
  });

  it('rejects a registry entry pointing at a manifest that is not there', async () => {
    const errors = await validateFixture((fixture) => {
      fixture.registry.assets.push({ assetId: 'actor.ghost.base', manifest: 'actor.ghost.base.atlas-manifests.json', clips: ['idle'] });
    });
    expect(errors.some((error) => error.includes('which is not in this directory'))).toBe(true);
  });

  it('reports every problem in one pass rather than stopping at the first', async () => {
    const errors = await validateFixture((fixture) => {
      const { clip } = walkManifest(fixture);
      delete clip.frames.north;
      delete clip.frames.west;
      fixture.contract.atlas.maxDimensionPx = 64;
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
