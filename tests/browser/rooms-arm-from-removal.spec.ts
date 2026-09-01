import { expect, test } from './network-changed-fixture';
import './ui-harness-api';

const HARNESS_URL = '/tests/browser/ui-harness.html';

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate(() => window.lockstateUiHarness.clickTab('rooms'));
});

test('Draw on map switches an active Rooms removal pass into drawing (#735)', async ({ page }) => {
  const armIntents = async (): Promise<readonly string[]> => {
    const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
    return intents.filter((intent) => intent.includes('"arm-room-tool"'));
  };
  const armIntent = (armed: boolean, removing: boolean): string =>
    JSON.stringify({ kind: 'arm-room-tool', armed, roomId: 'room.cell', removing });

  // Removal is itself an armed drawing pass and folds the panel out of the
  // world's way. Open it again exactly as a touch player has to in order to
  // reach the neighbouring Draw control.
  await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('remove'));
  expect(await armIntents()).toEqual([armIntent(true, true)]);
  expect(await page.evaluate(() => window.lockstateUiHarness.roomsProbe())).toMatchObject({
    removePressed: 'true',
    armPressed: 'false',
    folded: 'true',
  });

  await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('fold'));
  expect((await page.evaluate(() => window.lockstateUiHarness.roomsProbe())).removeLaidOut).toBe(true);

  // The press names the replacement mode. It must not toggle the shared
  // `armed` flag off merely because removal also had the world pointer.
  await page.evaluate(() => window.lockstateUiHarness.clickRoomsControl('arm'));
  expect(await armIntents(), 'Draw on map stood the tool down instead of switching its mode').toEqual([
    armIntent(true, true),
    armIntent(true, false),
  ]);

  const drawing = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
  expect(drawing.removePressed, 'the old removal mode survived the Draw press').toBe('false');
  expect(drawing.armPressed, 'Draw on map left no drawing tool armed').toBe('true');
  // This is a fresh drawing pass even though removal was armed before it. On a
  // phone the player had to open the panel to reach Draw, so failing to fold it
  // here leaves the panel covering the map they just asked to draw on.
  expect(drawing.folded, 'switching removal to Draw did not get the panel back out of the way').toBe('true');

  expect(
    await page.evaluate(() => window.lockstateUiHarness.dragWorldRoom({ x: 4, y: 6, width: 2, height: 3 })),
    'the HUD registered no room-gesture sink',
  ).toBe(true);
  const pending = await page.evaluate(() => window.lockstateUiHarness.roomsProbe());
  expect(pending.area, 'the drawing pass did not produce a pending designation rectangle').toBe('4,6,2,3');
  expect(pending.confirmText).toContain('Designate 2 × 3');
});
