import { expect, test, type Page } from './network-changed-fixture';
import type { HarnessChunkPosition, HarnessRoomCondition, HarnessRoomRectangle } from './world-scene-harness-api';

/**
 * **A sealed cell is marked on the map and a working one is not** — issue
 * #1022, ADR 0097's accepted option A.
 *
 * `tests/unit/rendering-room-condition-marks.test.ts` pins which rooms earn a
 * mark, and `tests/integration/a-sealed-cell-reaches-the-drawn-frame.test.ts`
 * pins that both payloads reach `RenderFrame` from the real worker encoder.
 * Neither can reach the half that lives in Phaser: that `WorldScene` actually
 * builds the layer, that the layer strokes the rooms the plan names, and that
 * it stops marking a room the moment the simulation says the room is fine.
 * That is what this runs in a real browser.
 *
 * The ordinals are the wire's own (`RENDER_ROOM_CONDITION_*`): 2 `'doorway'`,
 * 4 `'no-way-in'`. They are written as literals here on purpose — a spec that
 * imported the constants would agree with a producer that renumbered them.
 */

const HARNESS_URL = '/tests/browser/world-scene-harness.html';

/** The chunk size every session in this repository runs at (ADR 0004). */
const CHUNK_TILES = 32;
const LOADED_CHUNKS: readonly HarnessChunkPosition[] = [{ chunkX: 0, chunkY: 0 }];

/**
 * Two 2x3 cells sharing a wall: the pair #1022 measured, and the pair ADR
 * 0097's 2026-09-11 amendment is about — *"two adjacent `room.cell` instances
 * sharing a wall are two different answers to `roomAccess`"*.
 *
 * Placed near the middle of the loaded chunk rather than at its corner,
 * because the scene frames its camera on the loaded world and the layer culls
 * by rectangle: a room at tile 4 is off the left of the viewport this harness
 * opens with (scroll 384,664 at zoom 1, measured by driving this harness), and
 * a culled mark is absent for a reason that has nothing to do with the
 * verdict.
 */
const ROOMS: readonly HarnessRoomRectangle[] = [
  { instanceId: 'room.cell:14:22', anchorTileX: 14, anchorTileY: 22, width: 2, height: 3 },
  { instanceId: 'room.cell:16:22', anchorTileX: 16, anchorTileY: 22, width: 2, height: 3 },
];

const SEALED: readonly HarnessRoomCondition[] = [
  { anchorTileX: 14, anchorTileY: 22, condition: 2 },
  { anchorTileX: 16, anchorTileY: 22, condition: 4 },
];

const BOTH_WORKING: readonly HarnessRoomCondition[] = [
  { anchorTileX: 14, anchorTileY: 22, condition: 2 },
  { anchorTileX: 16, anchorTileY: 22, condition: 2 },
];

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => window.lockstateWorldSceneHarness !== undefined);
  await page.evaluate(() => window.lockstateWorldSceneHarness!.ready);
  await page.evaluate(
    ([size, chunks]) => window.lockstateWorldSceneHarness!.loadChunks(size, chunks),
    [CHUNK_TILES, LOADED_CHUNKS] as const,
  );
}

async function publish(
  page: Page,
  rooms: readonly HarnessRoomRectangle[],
  conditions: readonly HarnessRoomCondition[],
): Promise<readonly string[]> {
  await page.evaluate(
    ([published, verdicts]) => window.lockstateWorldSceneHarness!.publishRooms(published, verdicts),
    [rooms, conditions] as const,
  );
  return page.evaluate(() => window.lockstateWorldSceneHarness!.roomConditionMarks());
}

test.describe('the world view says which room does not work', () => {
  test('marks the sealed cell, leaves its working neighbour alone, and clears the mark when it is fixed', async ({ page }) => {
    await openHarness(page);

    expect(await publish(page, ROOMS, SEALED), 'exactly one of two identical cells carries a mark').toEqual([
      'room.cell:16:22:4',
    ]);

    expect(await publish(page, ROOMS, BOTH_WORKING), 'a room that started working loses its mark').toEqual([]);

    expect(
      await publish(page, [], SEALED),
      'a verdict whose rectangle the frame does not hold draws nothing at all',
    ).toEqual([]);
  });
});
