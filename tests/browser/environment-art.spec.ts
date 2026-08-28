import { expect, test, type Page } from '@playwright/test';
import { ENVIRONMENT_SPRITE_IDS } from '../../src/rendering/assets/environment-sprites';
import { FLOOR_ART_DEPTH } from '../../src/rendering/depth';
import type { HarnessPixel, HarnessWorldFixture } from './environment-art-harness-api';

/**
 * The environment artwork, drawn by the real renderer, in a real browser.
 *
 * `docs/TESTING.md` gates this layer on a claim only a real browser can settle,
 * and there are three of them here, each unreachable from the Node suite:
 *
 * 1. **The sheets are real image data.** They are Git LFS content, and a
 *    checkout that has not pulled them serves ~132 bytes of pointer text as
 *    `200 image/png`. Every check short of a decoder waves that through
 *    (`docs/ART_PIPELINE.md`), and only a browser decodes.
 * 2. **The cutting and packing happen on a canvas.** `createImageBitmap` with a
 *    crop and a resize, a 2D context, and Phaser's texture manager: none of it
 *    exists in `environment: 'node'`, which is what `vitest.config.ts` runs.
 * 3. **The pixels on the screen came from the art.** The last assertion here
 *    reads the rendered frame, removes the artwork by hand, reads the same
 *    pixel again, and requires the two to differ. A suite that only proved the
 *    sprites were *created* would stay green if they drew nothing.
 *
 * Everything that can be decided without pixels -- which sheet, which
 * rectangle, which frame, how they pack, what happens when a sprite is missing
 * -- is in `tests/unit/environment-art.test.ts`.
 */

const HARNESS_URL = '/tests/browser/environment-art-harness.html';

async function openHarness(page: Page): Promise<HarnessWorldFixture> {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => window.lockstateEnvironmentArtHarness !== undefined);
  await page.evaluate(async () => {
    const harness = window.lockstateEnvironmentArtHarness!;
    await harness.ready;
    await harness.artLoaded;
  });
  return page.evaluate(() => window.lockstateEnvironmentArtHarness!.fixture);
}

function channelDistance(left: HarnessPixel, right: HarnessPixel): number {
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2]),
  );
}

test.describe('the environment artwork', () => {
  test('cuts every declared sprite out of the published sheets and packs one texture', async ({ page }) => {
    await openHarness(page);
    const atlas = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.atlas());

    expect(atlas, 'no environment atlas was published').toBeDefined();
    // `__BASE` is Phaser's own whole-image frame, present on every texture.
    expect(atlas!.frameNames.filter((name) => name !== '__BASE')).toEqual([...ENVIRONMENT_SPRITE_IDS].sort());
    expect(atlas!.widthPx).toBeGreaterThan(0);
    expect(atlas!.heightPx).toBeGreaterThan(0);
    // The key carries the content-hashed filename of every sheet it was cut
    // from, so it cannot drift from the art (ADR-0014's runtime-access rule).
    expect(atlas!.textureKey).toContain('/game-content/source-art/');
  });

  test('the packed frames hold decoded photographic pixels, not a Git LFS pointer', async ({ page }) => {
    await openHarness(page);

    const readings = await page.evaluate(() => {
      const harness = window.lockstateEnvironmentArtHarness!;
      const out: Record<string, { centre: readonly number[] | undefined; corner: readonly number[] | undefined }> = {};
      for (const name of ['env.floor.institutional', 'env.wall.interior.face']) {
        const rect = harness.atlasFrame(name);
        out[name] =
          rect === undefined
            ? { centre: undefined, corner: undefined }
            : {
                centre: harness.atlasPixel(rect.x + Math.floor(rect.width / 2), rect.y + Math.floor(rect.height / 2)),
                corner: harness.atlasPixel(rect.x + 1, rect.y + 1),
              };
      }
      return out;
    });

    for (const [name, reading] of Object.entries(readings)) {
      expect(reading.centre, `${name} has no centre pixel`).toBeDefined();
      // Opaque: a frame whose rectangle missed the object on the sheet would be
      // transparent here, and a pointer file would not have decoded at all.
      expect(reading.centre![3], `${name} is transparent at its centre`).toBeGreaterThan(200);
      expect(reading.corner![3], `${name} is transparent at its corner`).toBeGreaterThan(200);
      // Neither black nor white: these are photographic renders of concrete,
      // plaster and linoleum, so every channel sits well inside the range.
      for (let channel = 0; channel < 3; channel += 1) {
        expect(reading.centre![channel], `${name} channel ${channel} is at an extreme`).toBeGreaterThan(24);
        expect(reading.centre![channel], `${name} channel ${channel} is at an extreme`).toBeLessThan(240);
      }
    }
  });

  test('draws the zoned room as one tiling floor, and the wall run as walls and a door', async ({ page }) => {
    const fixture = await openHarness(page);
    const sprites = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites());

    const tile = fixture.tileSizePx;
    const floors = sprites.filter((sprite) => sprite.frameName === 'env.floor.institutional');
    const faces = sprites.filter((sprite) => sprite.frameName === 'env.wall.interior.face');
    const caps = sprites.filter((sprite) => sprite.frameName === 'env.wall.interior.cap');
    const doors = sprites.filter((sprite) => sprite.frameName === 'env.door.interior.face');

    // One sprite for the whole room, not one per tile: `mergeFloorRects`
    // collapses the rectangle, which is what keeps a chunk from costing a
    // thousand game objects.
    expect(floors.length, 'the zoned room should be one merged floor sprite').toBe(1);
    const floor = floors[0]!;
    expect([floor.x, floor.y]).toEqual([fixture.zonedMinTileX * tile, fixture.zonedMinTileY * tile]);
    expect([floor.width, floor.height]).toEqual([
      (fixture.zonedMaxTileX - fixture.zonedMinTileX + 1) * tile,
      (fixture.zonedMaxTileY - fixture.zonedMinTileY + 1) * tile,
    ]);
    expect(floor.depth).toBe(FLOOR_ART_DEPTH);

    // The wall run is broken by the door, so it is two runs, and the door is
    // its own sprite. Until this change every non-zero edge value was painted
    // with one appearance and a finished door looked like a wall.
    expect(doors.length, 'the door should be drawn as a door').toBe(1);
    expect(doors[0]!.x).toBe(fixture.doorTileX * tile);
    expect(faces.map((face) => face.x / tile).sort((a, b) => a - b)).toEqual([
      fixture.zonedMinTileX,
      fixture.doorTileX + 1,
    ]);
    expect(faces.map((face) => face.width / tile).sort((a, b) => a - b)).toEqual([1, 2]);

    // The west wall is seen from above, so it gets the cap rather than the face.
    expect(caps.length).toBe(1);
    expect([caps[0]!.x, caps[0]!.width < tile]).toEqual([fixture.westWallTileX * tile, true]);

    // Every wall sprite repeats exactly once per tile along its length, and
    // fills its block exactly once across it. That pair is what puts a panel
    // joint on each tile boundary instead of letting it drift across the grid
    // the player builds on, and what makes the sprite and the coloured block it
    // replaced the same size.
    const frames = await page.evaluate(
      (names) =>
        Object.fromEntries(
          names.map((name) => [name, window.lockstateEnvironmentArtHarness!.atlasFrame(name)] as const),
        ),
      ['env.wall.interior.face', 'env.door.interior.face', 'env.wall.interior.cap'],
    );
    for (const sprite of [...faces, ...doors]) {
      const frame = frames[sprite.frameName];
      expect(frame, `${sprite.frameName} is not in the atlas`).toBeTruthy();
      expect(frame!.width * sprite.tileScaleX, 'a wall face should repeat once per tile').toBeCloseTo(tile, 3);
      expect(frame!.height * sprite.tileScaleY, 'a wall face should fill its block once').toBeCloseTo(sprite.height, 3);
    }
    const capFrame = frames['env.wall.interior.cap']!;
    expect(capFrame.height * caps[0]!.tileScaleY, 'a wall cap should repeat once per tile').toBeCloseTo(tile, 3);
    expect(capFrame.width * caps[0]!.tileScaleX, 'a wall cap should fill its bar once').toBeCloseTo(caps[0]!.width, 3);
  });

  test('puts the floor art on the screen, and the blocks back when it is taken away', async ({ page }) => {
    const fixture = await openHarness(page);
    const tile = fixture.tileSizePx;
    // The middle of a zoned tile, away from the walls and from the grid lines.
    const worldX = (fixture.zonedMinTileX + 0.5) * tile;
    const worldY = (fixture.zonedMaxTileY + 0.5) * tile;

    const withArt = await page.evaluate(async (point) => {
      const harness = window.lockstateEnvironmentArtHarness!;
      await harness.centreCameraOn(point.x, point.y);
      return harness.centrePixel();
    }, { x: worldX, y: worldY });

    // Vacuity guard, before a single pixel is trusted: the frame really was
    // drawn, so an all-zero reading would be a failure rather than a blank
    // page being measured.
    expect(withArt[3], 'the renderer produced a transparent frame').toBeGreaterThan(200);

    const withoutArt = await page.evaluate(async (point) => {
      const harness = window.lockstateEnvironmentArtHarness!;
      harness.removeArt();
      await harness.centreCameraOn(point.x, point.y);
      return harness.centrePixel();
    }, { x: worldX, y: worldY });

    expect(
      await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites().length),
      'removing the artwork should leave no tiling sprites behind',
    ).toBe(0);

    // The whole claim of this change, in one comparison: the tile the player
    // is looking at is a different colour because the artwork is drawn on it.
    expect(
      channelDistance(withArt, withoutArt),
      `the zoned tile looked the same with art (${withArt.join(',')}) and without it (${withoutArt.join(',')})`,
    ).toBeGreaterThan(20);
  });

  test('does not put a full-tile block over the floor where a wall order finished', async ({ page }) => {
    const fixture = await openHarness(page);
    const tile = fixture.tileSizePx;

    /*
     * Two tiles of the same room, both zoned, both drawn with the same floor
     * frame at the same phase -- so they should be the same colour. One of them
     * carries a finished `wall-brick` order as well as the wall edge the order
     * wrote. Drawing both puts a 1x1 brown block over the whole tile, because
     * `structureAppearance` has no footprint for `wall-brick` and falls back to
     * one tile; the wall itself is a fifth of a tile deep, so the block is not
     * hidden by it.
     */
    const read = async (tileX: number, tileY: number): Promise<HarnessPixel> =>
      page.evaluate(async (point) => {
        const harness = window.lockstateEnvironmentArtHarness!;
        await harness.centreCameraOn(point.x, point.y);
        return harness.centrePixel();
      }, { x: (tileX + 0.5) * tile, y: (tileY + 0.5) * tile });

    const plainFloor = await read(fixture.zonedMaxTileX, fixture.zonedMaxTileY);
    const underFinishedWall = await read(fixture.builtWallTileX, fixture.builtWallTileY);

    expect(plainFloor[3], 'the renderer produced a transparent frame').toBeGreaterThan(200);
    expect(
      channelDistance(plainFloor, underFinishedWall),
      `the tile under the finished wall order (${underFinishedWall.join(',')}) is not the floor its neighbour is (${plainFloor.join(',')})`,
    ).toBeLessThanOrEqual(8);
  });

  test('reports nothing but the actor batch it was told to refuse', async ({ page }) => {
    await openHarness(page);
    const errors = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.errors());
    expect(errors.filter((message) => !message.includes('actor atlases'))).toEqual([]);
  });
});
