import { expect, test } from './network-changed-fixture';
import type { Page } from './network-changed-fixture';
import type { HarnessRoomLabel } from './room-label-harness-api';
import './room-label-harness-api'; // pulls in the `Window.lockstateRoomLabelHarness` global augmentation

/**
 * The gate `tests/browser/room-label-harness-api.ts` and `room-label-harness.ts`
 * were committed without (issue: PR #1044). Both files record that the pass
 * that wrote the room-name-on-the-map feature had its budget cut before it
 * could write this spec, and drove the same harness by hand in Chromium at
 * 1280x720 instead -- evidence in a commit message, not a gate. This turns
 * that evidence into assertions against the unchanged harness interface.
 *
 * Every number below is quoted from `a08b20cb`'s commit message, which is the
 * hand measurement this spec is replacing with something that runs in CI.
 *
 * ## What is asserted, and why these four things and not more
 *
 * 1. **A name is a constant screen size, not a constant world size.** That is
 *    the property the whole feature rests on -- `ROOM_LABEL_FONT_SIZE_PX` is
 *    scaled by the reciprocal of the camera zoom specifically so a name reads
 *    the same at 0.2 as at 3.0 -- and it is exactly the property a headless
 *    unit test cannot measure, because measuring it needs a real font laid out
 *    in a real canvas (`room-label-harness.ts`'s own docblock). Five zooms,
 *    five names, to two decimal places, matching the hand measurement exactly.
 * 2. **The fit rule really omits a name too wide for its room, and only that
 *    one.** `Security Office` at zoom 0.2 is the one case the shipped fixture
 *    can exercise -- a 6-tile room is 76.8 screen pixels wide there, and 87 px
 *    plus two 4px margins is 95 -- and it is pinned as its own test so a later
 *    change that starts drawing a name wider than its room fails loudly rather
 *    than being read as an improvement.
 * 3. **The words are the catalogue's, through the locale, not a message key
 *    leaking or a hand-typed string.** Read the whole set of drawn names back
 *    and compare against the fixture's own `expectedName`, which is resolved
 *    the same way `room-label-harness.ts` composes it.
 * 4. **A name draws over a bed, not under it.** This is the regression
 *    `a08b20cb` fixed after finding "Canteen" rendered as "teen" at zoom 1.0
 *    and "een" at zoom 3.0 with `ROOM_LABEL_DEPTH` following ADR 0098 option
 *    C's "over the floor and under the objects" literally. Neither a label's
 *    `.text` string nor its measured width changes when a sprite is painted
 *    over part of it -- occlusion is a pixel fact, not a data fact -- so this
 *    is the one claim in this file that needs a real screenshot rather than a
 *    value read off the harness's structured-clone-safe API. It samples the
 *    patch of screen the harness's own fixture comment says the bed sits over
 *    (`STRUCTURES` in `room-label-harness.ts`, a `bed-wooden` centred in the
 *    Canteen) for the name's own ink -- its near-white fill or its near-black
 *    outline, `ROOM_LABEL_COLOR` / `ROOM_LABEL_OUTLINE_COLOR` in
 *    `src/rendering/world/appearance.ts` -- neither of which is a colour any
 *    fallback floor, tint or the bed's own coloured slab
 *    (`object` category fallback, `0x7f8ba0` / `0x55607a` / `0x262d3a` in
 *    the same file) comes anywhere near.
 *
 * A depth check rides alongside (4): `depths().label` sits strictly above the
 * ground buffer and strictly below `BuildOverlay`'s always-present preview
 * depth, which is where `ROOM_LABEL_DEPTH` (`-FLOOR_DEPTH - 1`) puts it. It is
 * cheap and it is real ground truth about the display list, but it cannot by
 * itself distinguish the fixed depth from the original bug -- the buggy
 * `FLOOR_DEPTH + 1` is *also* above the floor and below the preview, by
 * construction, since both of those bounds are billions away and a one-tile
 * bed's own depth is not. The screenshot in (4) is what actually catches the
 * regression; this is the architecture fact that makes the screenshot's
 * result mean something.
 */

const HARNESS_URL = '/tests/browser/room-label-harness.html';
const VIEWPORT = { width: 1280, height: 720 } as const;

/** Every zoom the hand measurement was taken at. */
const ZOOM_LEVELS = [0.2, 0.5, 1, 2, 3] as const;

/**
 * Screen width/height in px, to two decimal places, quoted verbatim from
 * `a08b20cb`'s commit message. Present at every zoom in `ZOOM_LEVELS`.
 */
const CONSTANT_SIZE_NAMES: Readonly<Record<string, { readonly width: number; readonly height: number }>> = {
  Reception: { width: 61.0, height: 16.0 },
  Kitchen: { width: 46.0, height: 16.0 },
  Canteen: { width: 52.0, height: 16.0 },
  Cell: { width: 25.0, height: 16.0 },
};

/** `Security Office` is the odd one: drawn from 0.5 up, omitted at 0.2. */
const SECURITY_OFFICE = { text: 'Security Office', width: 87.0, height: 16.0 } as const;

/** The middle of the fixture, in world units -- where `setZoom` centres the camera. */
const FOCUS_WORLD_X = 8 * 64;
const FOCUS_WORLD_Y = 8 * 64;

function byText(labels: readonly HarnessRoomLabel[], text: string): HarnessRoomLabel | undefined {
  return labels.find((label) => label.text === text);
}

/** Round to two decimal places the same way the hand measurement was taken. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateRoomLabelHarness' in window);
  await page.evaluate(async () => {
    await window.lockstateRoomLabelHarness!.ready;
  });
});

/**
 * Every named room's own centre, in *tile* units, read off a zoom wide enough
 * to see the whole fixture at once (0.2 covers all sixteen tiles either way).
 *
 * Measuring a name at a zoom that keeps a *shared*, fixture-centred camera
 * (`setZoom`) is not the same claim as measuring the name: `RoomLabelLayer`
 * culls a name whose room has scrolled out of the visible tile range, by
 * design (`room-label-layer.ts`'s `overlaps`), and at zoom 3 the shared
 * camera's view is only 213x120 world units around the fixture's middle --
 * wide enough for `Canteen`, which sits there deliberately, and nowhere near
 * `Reception`, `Kitchen`, `Cell` or `Security Office`. So each room is
 * measured under its *own* camera (`setCamera`), the way a player would
 * actually see it: scrolled to.
 *
 * Read at zoom 1, not 0.2: `Security Office` is the one name this fixture
 * omits at 0.2 (that is the point of the omission test below), so 0.2 would
 * never find a centre for it to be recentred on. Zoom 1's shared camera draws
 * all five names at once (asserted directly in the locale test below), so it
 * is a safe place to read every centre from.
 */
async function roomCentresInTiles(
  page: Page,
): Promise<Readonly<Record<string, { readonly tileX: number; readonly tileY: number }>>> {
  await page.evaluate((z) => window.lockstateRoomLabelHarness!.setZoom(z), 1);
  const labels = await page.evaluate(() => window.lockstateRoomLabelHarness!.labels());
  const centres: Record<string, { tileX: number; tileY: number }> = {};
  for (const label of labels) {
    centres[label.text] = { tileX: label.worldX / 64 - 0.5, tileY: label.worldY / 64 - 0.5 };
  }
  return centres;
}

for (const zoom of ZOOM_LEVELS) {
  test(`a name is drawn at a constant screen size at zoom ${zoom}, not a constant world size`, async ({ page }) => {
    const centres = await roomCentresInTiles(page);

    for (const [text, expected] of Object.entries(CONSTANT_SIZE_NAMES)) {
      const centre = centres[text];
      expect(centre, `fixture has no "${text}" to centre on`).not.toBeUndefined();
      await page.evaluate(
        ({ z, tileX, tileY }) => window.lockstateRoomLabelHarness!.setCamera(z, tileX, tileY),
        { z: zoom, tileX: centre!.tileX, tileY: centre!.tileY },
      );
      const labels = await page.evaluate(() => window.lockstateRoomLabelHarness!.labels());
      const label = byText(labels, text);
      expect(label, `"${text}" is not drawn at zoom ${zoom}, centred on its own room`).not.toBeUndefined();
      expect(round2(label!.screenWidthPx), `"${text}" screen width at zoom ${zoom}`).toBe(expected.width);
      expect(round2(label!.screenHeightPx), `"${text}" screen height at zoom ${zoom}`).toBe(expected.height);
    }
  });
}

test('the words a player reads come from the catalogue nameKey through the locale', async ({ page }) => {
  const fixture = await page.evaluate(() => window.lockstateRoomLabelHarness!.fixture);
  // Deduped: the fixture zones two adjacent `room.cell` rectangles that merge
  // into one region and therefore one name, exactly like
  // `tests/unit/rendering-room-labels.test.ts`'s "one name, true of every tile"
  // case.
  const expectedNames = [...new Set(fixture.rooms.map((room) => room.expectedName))].sort();
  expect(expectedNames).toEqual(['Canteen', 'Cell', 'Kitchen', 'Reception', 'Security Office']);

  // Zoom 1, shared fixture-centred camera: wide enough that every room in
  // this fixture is on screen at once (checked directly below), so the set of
  // drawn texts is exactly comparable to the catalogue's, with no leaked
  // message key and nothing invented.
  await page.evaluate((z) => window.lockstateRoomLabelHarness!.setZoom(z), 1);
  const labels = await page.evaluate(() => window.lockstateRoomLabelHarness!.labels());
  expect(labels.map((label) => label.text).sort()).toEqual(expectedNames);
});

test('omits a name wider than its room at zoom 0.2, and only that one', async ({ page }) => {
  const centres = await roomCentresInTiles(page);
  const securityOffice = centres[SECURITY_OFFICE.text];
  expect(securityOffice, 'fixture has no "Security Office" to centre on').not.toBeUndefined();

  await page.evaluate(
    ({ tileX, tileY }) => window.lockstateRoomLabelHarness!.setCamera(0.2, tileX, tileY),
    { tileX: securityOffice!.tileX, tileY: securityOffice!.tileY },
  );
  const labelsAt02 = await page.evaluate(() => window.lockstateRoomLabelHarness!.labels());
  expect(
    byText(labelsAt02, SECURITY_OFFICE.text),
    '"Security Office" is drawn at zoom 0.2, where a 6-tile room is 76.8px wide and the name plus margins is 95px',
  ).toBeUndefined();
  // The four shorter names are unaffected by the same rule at their own
  // centred cameras -- this is the "and only that one" half of the claim, not
  // merely "one thing vanished".
  for (const [text, centre] of Object.entries(centres)) {
    if (text === SECURITY_OFFICE.text) continue;
    await page.evaluate(
      ({ tileX, tileY }) => window.lockstateRoomLabelHarness!.setCamera(0.2, tileX, tileY),
      { tileX: centre.tileX, tileY: centre.tileY },
    );
    const labels = await page.evaluate(() => window.lockstateRoomLabelHarness!.labels());
    expect(byText(labels, text), `"${text}" wrongly omitted at zoom 0.2`).not.toBeUndefined();
  }

  for (const zoom of [0.5, 1, 2, 3] as const) {
    await page.evaluate(
      ({ z, tileX, tileY }) => window.lockstateRoomLabelHarness!.setCamera(z, tileX, tileY),
      { z: zoom, tileX: securityOffice!.tileX, tileY: securityOffice!.tileY },
    );
    const labels = await page.evaluate(() => window.lockstateRoomLabelHarness!.labels());
    const label = byText(labels, SECURITY_OFFICE.text);
    expect(label, `"Security Office" is not drawn at zoom ${zoom}`).not.toBeUndefined();
    expect(round2(label!.screenWidthPx), `"Security Office" screen width at zoom ${zoom}`).toBe(
      SECURITY_OFFICE.width,
    );
  }
});

/**
 * The colours a name's own ink can be, and nothing else in this fixture comes
 * near either band. `ROOM_LABEL_COLOR` is `#f2f5f8` (242, 245, 248) and
 * `ROOM_LABEL_OUTLINE_COLOR` is `#0b0e12` (11, 14, 18) -- `src/rendering/world/appearance.ts`.
 * The bed's fallback slab (`bed-wooden` has no explicit row in
 * `STRUCTURE_APPEARANCE`, so it draws with the `object` category fallback) is
 * `0x7f8ba0` / `0x55607a` / `0x262d3a`: every channel of every one of those
 * three sits strictly between the two bands below, so a pixel that clears
 * either threshold cannot be the bed.
 */
function isLabelInk(pixel: readonly [number, number, number]): boolean {
  const isNearWhiteFill = pixel[0] >= 200 && pixel[1] >= 200 && pixel[2] >= 200;
  const isNearBlackOutline = pixel[0] <= 50 && pixel[1] <= 50 && pixel[2] <= 50;
  return isNearWhiteFill || isNearBlackOutline;
}

/**
 * Decodes a screenshot clip back into per-pixel RGB, the same route
 * `playtest-1027-what-a-finished-door-is-drawn-as.playtest.ts` uses and for the
 * same reason: the Phaser canvas here is WebGL with no `preserveDrawingBuffer`,
 * so `toDataURL`/`getImageData` on it read a cleared buffer regardless of what
 * was drawn. `page.screenshot` reads the compositor instead.
 */
async function clipPixels(
  page: Page,
  clip: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Promise<readonly (readonly [number, number, number])[]> {
  const png = await page.screenshot({ clip });
  return page.evaluate(async (data) => {
    const response = await fetch(`data:image/png;base64,${data}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('no 2d context to decode the screenshot with');
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const pixels: [number, number, number][] = [];
    for (let index = 0; index < image.length; index += 4) {
      pixels.push([image[index] ?? -1, image[index + 1] ?? -1, image[index + 2] ?? -1]);
    }
    return pixels;
  }, png.toString('base64'));
}

for (const zoom of [1, 3] as const) {
  test(`a name draws over a bed standing in its room, not under it, at zoom ${zoom}`, async ({ page }) => {
    await page.evaluate((z) => window.lockstateRoomLabelHarness!.setZoom(z), zoom);
    const [labels, depths] = await page.evaluate(() => [
      window.lockstateRoomLabelHarness!.labels(),
      window.lockstateRoomLabelHarness!.depths(),
    ]);
    const canteen = byText(labels, 'Canteen');
    expect(canteen, `"Canteen" is not drawn at zoom ${zoom}`).not.toBeUndefined();

    // `setZoom` centres the camera on the fixture's middle, (8,8) tiles --
    // world (512, 512) -- which `room-label-harness.ts`'s Canteen rectangle is
    // itself centred on, so this is an exact affine map with no separate
    // calibration step.
    const screenCentreX = VIEWPORT.width / 2;
    const screenCentreY = VIEWPORT.height / 2;
    const screenX = screenCentreX + (canteen!.worldX - FOCUS_WORLD_X) * zoom;
    const screenY = screenCentreY + (canteen!.worldY - FOCUS_WORLD_Y) * zoom;

    // The bed (`STRUCTURES` in `room-label-harness.ts`) is one tile wide,
    // anchored at tile x=7 -- its right edge sits at world x=512, exactly the
    // Canteen's centre, so it covers the world-space left half of a name
    // centred there at every zoom. A window over the label's own leftmost 30%
    // -- where "Ca" of "Canteen" is -- lands inside that occlusion at any
    // zoom, which is why zoom 1.0 and 3.0 (the two the original bug's "teen"
    // and "een" screenshots were taken at) both apply here.
    const leftEdgeX = screenX - canteen!.screenWidthPx / 2;
    const probeWidth = Math.max(8, Math.round(canteen!.screenWidthPx * 0.3));
    const clip = {
      x: Math.round(leftEdgeX),
      y: Math.round(screenY - canteen!.screenHeightPx / 2),
      width: probeWidth,
      height: Math.round(canteen!.screenHeightPx),
    };

    const pixels = await clipPixels(page, clip);
    expect(
      pixels.some(isLabelInk),
      `no glyph ink (near-white fill or near-black outline) found in "Canteen"'s left third at zoom ${zoom}; ` +
        `clip=${JSON.stringify(clip)}`,
    ).toBe(true);

    // Ground truth about the display list, alongside the pixel evidence: a
    // name sits strictly above the ground buffer and strictly below
    // `BuildOverlay`'s always-present preview depth. `src/rendering/depth.ts`
    // documents both bounds as fixed and billions away from any real object's
    // depth, which is why this cannot by itself catch the regression above --
    // see this file's header comment.
    expect(depths.label, `label depth at zoom ${zoom}`).toBeDefined();
    expect(depths.floor, `floor depth at zoom ${zoom}`).toBeDefined();
    expect(depths.previewMax, `preview depth at zoom ${zoom}`).toBeDefined();
    expect(depths.label!).toBeGreaterThan(depths.floor!);
    expect(depths.label!).toBeLessThan(depths.previewMax!);
  });
}
