import { expect, test, type Page } from './network-changed-fixture';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { ENVIRONMENT_SPRITE_IDS, ENVIRONMENT_SPRITES } from '../../src/rendering/assets/environment-sprites';
import { FLOOR_ART_DEPTH } from '../../src/rendering/depth';
import { EDGE_WALL_THICKNESS_TILES, PLANNED_OBJECT_TINT, edgeAppearance } from '../../src/rendering/world/appearance';
import { objectSprite } from '../../src/rendering/world/environment-art';
import { catalogueObjectId } from '../../src/rendering/world/structures';
import { DOOR_EDGE_NUMERIC_ID, WALL_EDGE_NUMERIC_ID } from '../../src/simulation/construction/definition';
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
 * The third of those is why the two object cases below are here rather than in
 * the Node suite. #1020 asked for one catalogued object drawn as art, and the
 * pass before this one established that the Node suite cannot tell a mapping
 * row from a drawn bed: it settled for reading `src/rendering/phaser` for the
 * string `objectSprite`, and said so -- *"the gate's detector is a regex, so it
 * proves a reference, not a draw call"*. This is the draw call.
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

  test('packs the Blender overhead door cap while retaining the frontal source door', async ({ page }) => {
    expect(ENVIRONMENT_SPRITES['env.door.interior.cap'].kind).toBe('rendered-art');
    expect(ENVIRONMENT_SPRITES['env.door.interior.face'].kind).toBe('source-art');
    await openHarness(page);
    const reading = await page.evaluate(() => {
      const harness = window.lockstateEnvironmentArtHarness!;
      const cap = harness.atlasFrame('env.door.interior.cap');
      const face = harness.atlasFrame('env.door.interior.face');
      if (cap === undefined || face === undefined) return undefined;
      return {
        capSize: [cap.width, cap.height],
        faceSize: [face.width, face.height],
        timber: harness.atlasPixel(cap.x + Math.floor(cap.width / 2), cap.y + Math.floor(cap.height / 2)),
        jamb: harness.atlasPixel(cap.x + Math.floor(cap.width / 2), cap.y + 8),
      };
    });
    expect(reading).toBeDefined();
    expect(reading!.capSize).toEqual([32, 128]);
    expect(reading!.faceSize).toEqual([128, 124]);
    expect(reading!.timber).toBeDefined();
    expect(reading!.jamb).toBeDefined();
    expect(reading!.timber![3]).toBeGreaterThan(200);
    expect(channelDistance(reading!.timber!, reading!.jamb!)).toBeGreaterThan(20);
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

  /*
   * The first catalogued object drawn as artwork (#1020), from the two sides
   * this file can see it from: the sprite the painter made, and the pixel it
   * put on the screen.
   *
   * Neither is reachable from `tests/unit/environment-art.test.ts`. What is
   * decided there is the mapping and the rectangle; what is decided here is
   * that `paintRow` reached for the mapping at all rather than filling a
   * coloured slab, which is exactly the step that did not exist until this
   * change and that a regex over the painter's source could only guess at.
   */
  test('draws a finished bed from the atlas, over exactly the tiles the simulation reserved', async ({ page }) => {
    const fixture = await openHarness(page);
    const tile = fixture.tileSizePx;

    /*
     * Derived from the content registries rather than written down, so this
     * asserts the renderer agrees with the simulation about the bed rather
     * than agreeing with a number typed twice. `bed-wooden` is the buildable a
     * build order carries; `object.bed` is what the catalog and the artwork
     * are keyed by, and `catalogueObjectId` is the step between them.
     */
    const objectId = catalogueObjectId('bed-wooden');
    expect(objectId, 'bed-wooden no longer places a catalogued object').toBe('object.bed');
    const spriteId = objectSprite(objectId!);
    expect(spriteId, 'object.bed is no longer mapped to artwork').toBeDefined();
    const footprint = defaultObjectRegistry.getById(objectId!)?.footprint;
    expect(footprint, 'object.bed is not in the object catalog').toBeDefined();

    const sprites = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites());
    const beds = sprites.filter((sprite) => sprite.frameName === spriteId);
    expect(beds.length, 'the finished bed order should be drawn as exactly one sprite').toBe(1);

    const bed = beds[0]!;
    expect([bed.x, bed.y], 'the bed sprite is not on the tile the order named').toEqual([
      fixture.bedTileX * tile,
      fixture.bedTileY * tile,
    ]);
    // The footprint the simulation reserved, and not the slab's `bounds`: an
    // object sprite is flat, so it does not carry the coloured block's fake
    // height. `acquireObjectSprite` argues that at length.
    expect([bed.width, bed.height], 'the bed sprite does not cover its footprint').toEqual([
      footprint!.width * tile,
      footprint!.height * tile,
    ]);

    // Filled once on both axes rather than repeated. A bed that tiled would be
    // two half beds, and `tileScale` is the only place that distinction lives.
    const frame = await page.evaluate(
      (name) => window.lockstateEnvironmentArtHarness!.atlasFrame(name),
      spriteId!,
    );
    expect(frame, 'the bed frame is not in the packed atlas').toBeTruthy();
    expect(frame!.width * bed.tileScaleX, 'the bed frame should fill its footprint once across').toBeCloseTo(bed.width, 3);
    expect(frame!.height * bed.tileScaleY, 'the bed frame should fill its footprint once down').toBeCloseTo(bed.height, 3);
  });

  test('puts the bed art on the screen, and the coloured block back when it is taken away', async ({ page }) => {
    const fixture = await openHarness(page);
    const tile = fixture.tileSizePx;

    /*
     * Inside the bed's own footprint and off both tile boundaries: three
     * quarters of a tile down the northern of the two tiles it stands on. That
     * point is under the mattress with the artwork loaded and under the slab's
     * raised top face without it, so both readings are of the thing being
     * compared rather than of the ground beside it.
     */
    const worldX = (fixture.bedTileX + 0.5) * tile;
    const worldY = (fixture.bedTileY + 0.75) * tile;

    const read = async (): Promise<HarnessPixel> =>
      page.evaluate(async (point) => {
        const harness = window.lockstateEnvironmentArtHarness!;
        await harness.centreCameraOn(point.x, point.y);
        return harness.centrePixel();
      }, { x: worldX, y: worldY });

    const withArt = await read();
    expect(withArt[3], 'the renderer produced a transparent frame').toBeGreaterThan(200);

    await page.evaluate(() => window.lockstateEnvironmentArtHarness!.removeArt());
    expect(
      await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites().length),
      'removing the artwork should leave no tiling sprites behind',
    ).toBe(0);
    const withoutArt = await read();

    /*
     * The whole claim of this change, in one comparison: the bed a player is
     * looking at is a different colour because a photograph of a bed is drawn
     * on it, and taking the artwork away brings the coloured block back. Until
     * the painter path landed, both readings were the same slate-blue slab --
     * a row in `SPRITE_BY_OBJECT_ID` changed `objectArtCoverage()` and nothing
     * else, which is the defect this test would have named.
     */
    expect(
      channelDistance(withArt, withoutArt),
      `the bed looked the same with art (${withArt.join(',')}) and without it (${withoutArt.join(',')}), ` +
        'so object.bed is not being drawn from the atlas',
    ).toBeGreaterThan(20);
  });

  /**
   * `PLANNED_OBJECT_TINT` decoded to RGB, so the test below can name the exact
   * colour a coloured-block fallback would have drawn rather than only "some
   * other colour". `channelDistance(..., 20)` alone -- the probe every other
   * test in this file uses -- proves art was drawn and the fallback was not,
   * but not specifically *which* fallback it was not: issue #1028's own
   * author named "differs from the slab" as too weak a claim once a second
   * publishing lane made "the row exists but nothing reads it" a real failure
   * mode again. Comparing against this exact triple closes that gap.
   */
  const FALLBACK_OBJECT_RGB: HarnessPixel = [
    (PLANNED_OBJECT_TINT >> 16) & 0xff,
    (PLANNED_OBJECT_TINT >> 8) & 0xff,
    PLANNED_OBJECT_TINT & 0xff,
    255,
  ];

  /*
   * The first object drawn from ADR 0100's second publishing lane -- a
   * Blender render rather than an owner-sheet crop -- proved on screen the
   * same two ways the bed above already is: the sprite the painter made, and
   * the pixel it put on the screen. `object.toilet`'s only owner-supplied
   * view is a combined toilet+sink column no crop fits into its 1x1
   * footprint (ADR 0100 §Context), which is the whole reason this lane
   * exists rather than a fourteenth `env.object.*` row cut from a sheet.
   */
  test('draws a finished toilet from the atlas, over exactly the tile the simulation reserved', async ({ page }) => {
    const fixture = await openHarness(page);
    const tile = fixture.tileSizePx;

    const objectId = catalogueObjectId('toilet-brick');
    expect(objectId, 'toilet-brick no longer places a catalogued object').toBe('object.toilet');
    const spriteId = objectSprite(objectId!);
    expect(spriteId, 'object.toilet is no longer mapped to artwork').toBeDefined();
    const footprint = defaultObjectRegistry.getById(objectId!)?.footprint;
    expect(footprint, 'object.toilet is not in the object catalog').toBeDefined();

    const sprites = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites());
    const toilets = sprites.filter((sprite) => sprite.frameName === spriteId);
    expect(toilets.length, 'the finished toilet order should be drawn as exactly one sprite').toBe(1);

    const toilet = toilets[0]!;
    expect([toilet.x, toilet.y], 'the toilet sprite is not on the tile the order named').toEqual([
      fixture.toiletTileX * tile,
      fixture.toiletTileY * tile,
    ]);
    expect([toilet.width, toilet.height], 'the toilet sprite does not cover its footprint').toEqual([
      footprint!.width * tile,
      footprint!.height * tile,
    ]);

    const frame = await page.evaluate(
      (name) => window.lockstateEnvironmentArtHarness!.atlasFrame(name),
      spriteId!,
    );
    expect(frame, 'the toilet frame is not in the packed atlas').toBeTruthy();
    expect(frame!.width * toilet.tileScaleX, 'the toilet frame should fill its footprint once across').toBeCloseTo(toilet.width, 3);
    expect(frame!.height * toilet.tileScaleY, 'the toilet frame should fill its footprint once down').toBeCloseTo(toilet.height, 3);
  });

  test('puts the toilet art on the screen, not the fallback slab colour, and the slab back when it is taken away', async ({ page }) => {
    const fixture = await openHarness(page);
    const tile = fixture.tileSizePx;

    // Dead centre of the toilet's own 1x1 tile.
    const worldX = (fixture.toiletTileX + 0.5) * tile;
    const worldY = (fixture.toiletTileY + 0.5) * tile;

    const read = async (): Promise<HarnessPixel> =>
      page.evaluate(async (point) => {
        const harness = window.lockstateEnvironmentArtHarness!;
        await harness.centreCameraOn(point.x, point.y);
        return harness.centrePixel();
      }, { x: worldX, y: worldY });

    const withArt = await read();
    expect(withArt[3], 'the renderer produced a transparent frame').toBeGreaterThan(200);

    // The claim #1028's own author said a bare "differs from the slab" probe
    // could not make: not just "some other colour", but specifically not
    // `CATEGORY_FALLBACK.object.topFill` (127,139,160), the exact slab a
    // coverage bug once let a dead mapping row claim was already drawn.
    expect(
      channelDistance(withArt, FALLBACK_OBJECT_RGB),
      `the toilet tile reads as the fallback slab colour (${FALLBACK_OBJECT_RGB.join(',')}) with art loaded (${withArt.join(',')}), ` +
        'so object.toilet is drawing the coloured block rather than its render',
    ).toBeGreaterThan(20);

    await page.evaluate(() => window.lockstateEnvironmentArtHarness!.removeArt());
    expect(
      await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites().length),
      'removing the artwork should leave no tiling sprites behind',
    ).toBe(0);
    const withoutArt = await read();

    // And the reverse claim, on the same tile: with the artwork gone, the
    // painter falls back to exactly that slab colour, matching `docs/RENDERING.md`'s
    // "art that fails to load leaves a playable, legible tile world".
    expect(
      channelDistance(withoutArt, FALLBACK_OBJECT_RGB),
      `without the artwork, the toilet tile (${withoutArt.join(',')}) does not read as the declared object fallback colour (${FALLBACK_OBJECT_RGB.join(',')})`,
    ).toBeLessThanOrEqual(8);

    expect(
      channelDistance(withArt, withoutArt),
      `the toilet looked the same with art (${withArt.join(',')}) and without it (${withoutArt.join(',')}), ` +
        'so object.toilet is not being drawn from the atlas',
    ).toBeGreaterThan(20);
  });

  /*
   * The second and third rows from ADR 0100's second publishing lane (issue
   * #1020): a bench and a desk, each proved the same two ways the toilet
   * above already is. One parameterised pair rather than four near-identical
   * blocks, because nothing about the two claims -- "the sprite is on the
   * tile the order named, sized to its footprint" and "the pixel differs from
   * the fallback slab, and comes back when the artwork does" -- varies per
   * object; only the buildable id, the catalogued object it places and the
   * fixture tile it stands on do, and those three are exactly what the table
   * below carries.
   *
   * **A third row, a storage rack, stood here from 2026-09-06 to 2026-09-07
   * and is not a fourth case that quietly vanished.** `object.storage-rack`
   * was reverted to the colour fallback (#1059, `environment-art.ts`'s
   * `OBJECTS_ON_COLOUR_FALLBACK` docblock) once a playtest found its closed
   * locker render read as a flat grey seam. The row below uses a new open
   * wooden rack and must pass the same drawn-pixel test.
   */
  const RENDERED_OBJECT_CASES: readonly {
    readonly label: string;
    readonly buildableId: string;
    readonly catalogueId: string;
    readonly expectedSpriteId: string;
    readonly tileOf: (fixture: HarnessWorldFixture) => readonly [number, number];
  }[] = [
    {
      label: 'bench',
      buildableId: 'bench-wooden',
      catalogueId: 'object.bench',
      expectedSpriteId: 'env.object.bench',
      tileOf: (fixture) => [fixture.benchTileX, fixture.benchTileY],
    },
    {
      label: 'desk',
      buildableId: 'desk-wooden',
      catalogueId: 'object.desk',
      expectedSpriteId: 'env.object.desk',
      tileOf: (fixture) => [fixture.deskTileX, fixture.deskTileY],
    },
    {
      label: 'shower head',
      buildableId: 'shower-head-brick',
      catalogueId: 'object.shower-head',
      expectedSpriteId: 'env.object.shower-head',
      tileOf: (fixture) => [fixture.showerTileX, fixture.showerTileY],
    },
    {
      label: 'waste bin',
      buildableId: 'waste-bin-brick',
      catalogueId: 'object.waste-bin',
      expectedSpriteId: 'env.object.waste-bin',
      tileOf: (fixture) => [fixture.wasteBinTileX, fixture.wasteBinTileY],
    },
    {
      label: 'storage rack',
      buildableId: 'storage-rack-wooden',
      catalogueId: 'object.storage-rack',
      expectedSpriteId: 'env.object.storage-rack',
      tileOf: (fixture) => [fixture.storageRackTileX, fixture.storageRackTileY],
    },
    {
      label: 'chair',
      buildableId: 'chair-wooden',
      catalogueId: 'object.chair',
      expectedSpriteId: 'env.object.chair',
      tileOf: (fixture) => [fixture.chairTileX, fixture.chairTileY],
    },
    {
      label: 'dining table',
      buildableId: 'dining-table-wooden',
      catalogueId: 'object.dining-table',
      expectedSpriteId: 'env.object.dining-table',
      tileOf: (fixture) => [fixture.diningTableTileX, fixture.diningTableTileY],
    },
    {
      label: 'medical bed',
      buildableId: 'medical-bed-wooden',
      catalogueId: 'object.medical-bed',
      expectedSpriteId: 'env.object.medical-bed',
      tileOf: (fixture) => [fixture.medicalBedTileX, fixture.medicalBedTileY],
    },
    {
      label: 'medicine cabinet',
      buildableId: 'medicine-cabinet-wooden',
      catalogueId: 'object.medicine-cabinet',
      expectedSpriteId: 'env.object.medicine-cabinet',
      tileOf: (fixture) => [fixture.medicineCabinetTileX, fixture.medicineCabinetTileY],
    },
    {
      label: 'stove',
      buildableId: 'stove-brick',
      catalogueId: 'object.stove',
      expectedSpriteId: 'env.object.stove',
      tileOf: (fixture) => [fixture.stoveTileX, fixture.stoveTileY],
    },
    {
      label: 'washing machine',
      buildableId: 'washing-machine-brick',
      catalogueId: 'object.washing-machine',
      expectedSpriteId: 'env.object.washing-machine',
      tileOf: (fixture) => [fixture.washingMachineTileX, fixture.washingMachineTileY],
    },
    {
      label: 'fridge',
      buildableId: 'fridge-brick',
      catalogueId: 'object.fridge',
      expectedSpriteId: 'env.object.fridge',
      tileOf: (fixture) => [fixture.fridgeTileX, fixture.fridgeTileY],
    },
    {
      label: 'security console',
      buildableId: 'security-console-brick',
      catalogueId: 'object.security-console',
      expectedSpriteId: 'env.object.security-console',
      tileOf: (fixture) => [fixture.securityConsoleTileX, fixture.securityConsoleTileY],
    },
    {
      label: 'utility panel',
      buildableId: 'utility-panel-brick',
      catalogueId: 'object.utility-panel',
      expectedSpriteId: 'env.object.utility-panel',
      tileOf: (fixture) => [fixture.utilityPanelTileX, fixture.utilityPanelTileY],
    },
    {
      label: 'loading dock door',
      buildableId: 'loading-dock-door-wooden',
      catalogueId: 'object.loading-dock-door',
      expectedSpriteId: 'env.object.loading-dock-door',
      tileOf: (fixture) => [fixture.loadingDockDoorTileX, fixture.loadingDockDoorTileY],
    },
    {
      label: 'prep counter',
      buildableId: 'prep-counter-brick',
      catalogueId: 'object.prep-counter',
      expectedSpriteId: 'env.object.prep-counter',
      tileOf: (fixture) => [fixture.prepCounterTileX, fixture.prepCounterTileY],
    },
    {
      label: 'bookshelf',
      buildableId: 'bookshelf-wooden',
      catalogueId: 'object.bookshelf',
      expectedSpriteId: 'env.object.bookshelf',
      tileOf: (fixture) => [fixture.bookshelfTileX, fixture.bookshelfTileY],
    },
  ];

  for (const { label, buildableId, catalogueId, expectedSpriteId, tileOf } of RENDERED_OBJECT_CASES) {
    test(`draws a finished ${label} from the atlas, over exactly the tiles the simulation reserved`, async ({ page }) => {
      const fixture = await openHarness(page);
      const tile = fixture.tileSizePx;
      const [tileX, tileY] = tileOf(fixture);

      const objectId = catalogueObjectId(buildableId);
      expect(objectId, `${buildableId} no longer places a catalogued object`).toBe(catalogueId);
      const spriteId = objectSprite(objectId!);
      expect(spriteId, `${catalogueId} is no longer mapped to artwork`).toBeDefined();
      expect(spriteId, `${catalogueId} resolves to the wrong model`).toBe(expectedSpriteId);
      const footprint = defaultObjectRegistry.getById(objectId!)?.footprint;
      expect(footprint, `${catalogueId} is not in the object catalog`).toBeDefined();

      const sprites = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites());
      const matches = sprites.filter((sprite) => sprite.frameName === spriteId);
      expect(matches.length, `the finished ${label} order should be drawn as exactly one sprite`).toBe(1);

      const drawn = matches[0]!;
      expect([drawn.x, drawn.y], `the ${label} sprite is not on the tile the order named`).toEqual([
        tileX * tile,
        tileY * tile,
      ]);
      expect([drawn.width, drawn.height], `the ${label} sprite does not cover its footprint`).toEqual([
        footprint!.width * tile,
        footprint!.height * tile,
      ]);

      const frame = await page.evaluate(
        (name) => window.lockstateEnvironmentArtHarness!.atlasFrame(name),
        spriteId!,
      );
      expect(frame, `the ${label} frame is not in the packed atlas`).toBeTruthy();
      expect(frame!.width * drawn.tileScaleX, `the ${label} frame should fill its footprint once across`).toBeCloseTo(drawn.width, 3);
      expect(frame!.height * drawn.tileScaleY, `the ${label} frame should fill its footprint once down`).toBeCloseTo(drawn.height, 3);
    });

    test(`puts the ${label} art on the screen, not the fallback slab colour, and the slab back when it is taken away`, async ({ page }) => {
      const fixture = await openHarness(page);
      const tile = fixture.tileSizePx;
      const [tileX, tileY] = tileOf(fixture);

      // Dead centre of the object's north-west tile: inside every one of
      // these footprints (1x1 or 2x1) regardless of which case is running.
      const worldX = (tileX + 0.5) * tile;
      const worldY = (tileY + 0.5) * tile;

      const read = async (): Promise<HarnessPixel> =>
        page.evaluate(async (point) => {
          const harness = window.lockstateEnvironmentArtHarness!;
          await harness.centreCameraOn(point.x, point.y);
          return harness.centrePixel();
        }, { x: worldX, y: worldY });

      const withArt = await read();
      expect(withArt[3], 'the renderer produced a transparent frame').toBeGreaterThan(200);

      expect(
        channelDistance(withArt, FALLBACK_OBJECT_RGB),
        `the ${label} tile reads as the fallback slab colour (${FALLBACK_OBJECT_RGB.join(',')}) with art loaded (${withArt.join(',')}), ` +
          `so ${catalogueId} is drawing the coloured block rather than its render`,
      ).toBeGreaterThan(20);

      await page.evaluate(() => window.lockstateEnvironmentArtHarness!.removeArt());
      expect(
        await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites().length),
        'removing the artwork should leave no tiling sprites behind',
      ).toBe(0);
      const withoutArt = await read();

      expect(
        channelDistance(withoutArt, FALLBACK_OBJECT_RGB),
        `without the artwork, the ${label} tile (${withoutArt.join(',')}) does not read as the declared object fallback colour (${FALLBACK_OBJECT_RGB.join(',')})`,
      ).toBeLessThanOrEqual(8);

      expect(
        channelDistance(withArt, withoutArt),
        `the ${label} looked the same with art (${withArt.join(',')}) and without it (${withoutArt.join(',')}), ` +
          `so ${catalogueId} is not being drawn from the atlas`,
      ).toBeGreaterThan(20);
    });
  }

  /*
   * The state every session's first frames are in.
   *
   * `docs/RENDERING.md` requires that "art that fails to load leaves a
   * playable, legible tile world", and the sheets are Git LFS content fetched
   * over the network -- so the coloured-block fallback is not a degraded mode,
   * it is what the player sees before the atlas arrives. #462 gave the painter
   * `edgeAppearance(value)` for both paths, but only the *art* path was gated:
   * every existing edge assertion above reads `tileSprites()` frame names, and
   * the one test that calls `removeArt()` reads a zoned floor tile.
   *
   * Measured on this branch, with `paintSlab`'s appearance argument in
   * `tile-layer.ts` replaced by the constant `EDGE_WALL_APPEARANCE` -- the
   * shipped defect, restricted to the no-art path: `tsc -b` clean, 309 test
   * files and 3586 Node tests passed, and all six tests in this file passed.
   * Nothing in the repository could observe it, which is why this gate is here
   * and not in `tests/unit/`: `edgeAppearance` itself is a pure function and is
   * already covered in `tests/unit/environment-art.test.ts`, so what is left to
   * prove is the *wiring* -- that the painter passes the per-value appearance
   * rather than a constant -- and wiring can only be observed by drawing.
   */
  test('draws a door differently from a wall when the artwork never arrives', async ({ page }) => {
    const fixture = await openHarness(page);
    const tile = fixture.tileSizePx;

    /*
     * Both edge values are drawn at the wall's height on purpose (a door at its
     * own 0.55 would notch the top of every wall line it sits in), so the two
     * slabs occupy the *same* rectangle and colour is the only thing that can
     * tell them apart. Asserting that first keeps the probe below honest: if
     * the heights ever diverge, the two readings would differ for a reason this
     * test is not measuring.
     */
    const door = edgeAppearance(DOOR_EDGE_NUMERIC_ID);
    const wall = edgeAppearance(WALL_EDGE_NUMERIC_ID);
    expect(door.heightTiles, 'a door edge and a wall edge should be the same height').toBe(wall.heightTiles);

    /*
     * The centre of the side face of a north edge: `slabFaces` puts it at
     * `top + depth - height`, `height` tall. Geometry is used only to aim --
     * every assertion below compares two *rendered* readings against each
     * other, never against a colour this file names, so no expectation here is
     * computed by the code under test.
     */
    const probeY = fixture.wallRowTileY * tile + EDGE_WALL_THICKNESS_TILES * tile - (wall.heightTiles * tile) / 2;
    const wallTileX = fixture.doorTileX - 1;
    expect(wallTileX, 'the tile west of the door should be part of the same wall run').toBeGreaterThanOrEqual(
      fixture.zonedMinTileX,
    );

    const read = async (worldX: number): Promise<HarnessPixel> =>
      page.evaluate(async (point) => {
        const harness = window.lockstateEnvironmentArtHarness!;
        await harness.centreCameraOn(point.x, point.y);
        return harness.centrePixel();
      }, { x: worldX, y: probeY });

    const doorWorldX = (fixture.doorTileX + 0.5) * tile;
    const wallWorldX = (wallTileX + 0.5) * tile;

    /*
     * Aim is proved before the artwork is taken away, and structurally rather
     * than by naming a colour. Both probes sit above the zoned room on ground
     * that carries no floor art, so the only thing at either point that can
     * change when the environment atlas is removed is the edge sprite drawn
     * over it -- a probe that had missed its slab would read the same ground
     * twice. A first attempt guarded this by distance from a bare tile instead
     * and was withdrawn: the terrain is dirt (106,87,68) and a wooden door is
     * (124,96,55), so two correct readings sat 18 apart and the guard fired on
     * a working renderer.
     */
    const doorWithArt = await read(doorWorldX);
    const wallWithArt = await read(wallWorldX);

    await page.evaluate(() => window.lockstateEnvironmentArtHarness!.removeArt());
    expect(
      await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites().length),
      'removing the artwork should leave no tiling sprites behind',
    ).toBe(0);

    const onDoor = await read(doorWorldX);
    const onWall = await read(wallWorldX);

    expect(onDoor[3], 'the renderer produced a transparent frame').toBeGreaterThan(200);
    for (const [name, withArt, withoutArt] of [
      ['door', doorWithArt, onDoor],
      ['wall', wallWithArt, onWall],
    ] as const) {
      expect(
        channelDistance(withArt, withoutArt),
        `the ${name} probe read the same pixel with art (${withArt.join(',')}) and without it (${withoutArt.join(',')}), so it is not on the edge`,
      ).toBeGreaterThan(20);
    }

    // The whole claim, in one comparison: with no artwork at all, the finished
    // door is still not the wall beside it.
    expect(
      channelDistance(onDoor, onWall),
      `the door (${onDoor.join(',')}) is drawn as the wall beside it (${onWall.join(',')}) with no artwork loaded`,
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
