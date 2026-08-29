import { type Page, expect, test } from '@playwright/test';

/**
 * The Build panel's "Where" readout, in the assembled application (issue #550).
 *
 * ## Why this is here and not in `app-shell.spec.ts`
 *
 * It belongs to that file's subject -- `index.html` plus `src/main.ts`, the
 * only page a player loads -- and it is a separate file for one reason:
 * #550 was fixed while another agent held `tests/browser/`, and one new spec
 * conflicts with nothing. Fold it in when that is no longer true.
 *
 * ## Why it cannot be proven a layer down
 *
 * `tests/unit/ui-build-target-readout.test.ts` owns the decision -- which tool
 * publishes what, and what the string says -- and it drives the two real tools
 * through the real formatter. What it cannot reach is the *wiring*: that
 * `mountHud` attaches the object tool's readout to the Build panel's
 * `setTarget` at all. `vitest.config.ts` runs in `environment: 'node'` and
 * there is no jsdom, so `mountHud` cannot be called from a unit test -- a
 * mutation in that attachment is unobservable there rather than untested. This
 * is the test that kills it.
 *
 * It also needs a *real pointer over a real canvas*: the tile under the aim is
 * decided by the scene from the camera's scroll and zoom, and no harness
 * produces that.
 *
 * ## What it asserts, and why it is not "the readout changed"
 *
 * The measured defect was a line that froze on the last tile the **wall** tool
 * reported and kept naming it while the player aimed a removal somewhere else:
 *
 * ```
 * wall armed, pointer over 20,16   ->  "20, 16 · North"
 * press Remove, pointer over  8,10 ->  "20, 16 · North"
 * press Remove, pointer over  5,18 ->  "20, 16 · North"
 * ```
 *
 * An assertion that the readout is *non-empty*, or that it *differs from the
 * placeholder*, passes against every line above. So the claim here is the
 * player's: **the readout names the tile the pointer is over.** It is settled
 * by making two independent producers answer for the same pointer position --
 * the wall tool, which names a tile *edge*, and the object tool, which names a
 * *tile* -- and requiring their answers to be the same tile or one of its two
 * shared neighbours. `pickEdgeAtWorld` returns `tileY + 1` for a point in the
 * south band of a tile and `tileX + 1` for the east band, so the two producers
 * may legitimately differ by exactly one step on exactly one axis, and by no
 * more than that. A frozen line cannot satisfy it at two positions at once,
 * and neither can a line reporting anything other than where the pointer is.
 */

const APP_URL = '/index.html';

/** The `data-target` shapes the panel writes: an edge aim, and a tile aim. */
const EDGE_AIM = /^-?\d+,-?\d+,(?:north|west),\d+$/u;
const TILE_AIM = /^-?\d+,-?\d+$/u;

/** Loads the real application entry and waits for the renderer and the HUD. */
async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
}

/**
 * Two points on the bare world, far enough apart to be different tiles.
 *
 * The camera starts at zoom 1 and `TILE_SIZE_PX` is 64, so 192 CSS pixels is
 * three tiles -- comfortably more than the one-step disagreement the two
 * producers are allowed, which is what makes "these name different tiles" a
 * real assertion rather than a rounding one.
 *
 * Hit-tested rather than assumed: the HUD's rail, strip and tab bar all sit
 * over the canvas, and a hover that lands on a panel reaches no scene at all.
 */
async function twoWorldPoints(
  page: Page,
): Promise<{ readonly a: { x: number; y: number }; readonly b: { x: number; y: number } } | null> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('the viewport size is needed to aim the hover');
  return page.evaluate(
    ({ width, height }) => {
      const minApartPx = 192;
      for (let y = 8; y < height - 8; y += 16) {
        const row: number[] = [];
        for (let x = 8; x < width - 8; x += 16) {
          if (document.elementFromPoint(x, y)?.tagName.toLowerCase() === 'canvas') row.push(x);
        }
        const first = row[0];
        const last = row.at(-1);
        if (first === undefined || last === undefined || last - first < minApartPx) continue;
        return { a: { x: first, y }, b: { x: last, y } };
      }
      return null;
    },
    { width: viewport.width, height: viewport.height },
  );
}

/** The two numbers a `data-target` names, whichever of the two shapes it is in. */
function tileOf(attribute: string | null): { readonly x: number; readonly y: number } {
  const parts = (attribute ?? '').split(',');
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`no tile in data-target "${attribute ?? ''}"`);
  return { x, y };
}

test.describe('the Build panel says where the player is aiming (#550)', () => {
  test('the "Where" readout names the tile a removal is aimed at, not the wall tool\'s last edge', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    const points = await twoWorldPoints(page);
    expect(points, 'the HUD left no bare world wide enough to hover across at 1280x800').not.toBeNull();
    if (points === null) return;

    await page.locator('.ui-tab[data-tab="build"]').click();
    const readout = page.locator('.hud-build__target-value');
    const block = page.locator('.hud-build__target');
    // The readout has to be *on screen* for any of this to have reached a
    // player: a `textContent` read answers the same on a box the browser never
    // laid out, which is how #220 shipped a message no viewport showed.
    await expect(readout).toBeVisible();

    // ---- the wall tool, which always tracked the pointer ------------------
    const arm = page.locator('.hud-build__arm');
    await arm.click();
    await expect(arm).toHaveText('Stop placing');

    await page.mouse.move(points.a.x, points.a.y);
    await expect(block).toHaveAttribute('data-target', EDGE_AIM);
    const wallAtA = tileOf(await block.getAttribute('data-target'));

    await page.mouse.move(points.b.x, points.b.y);
    await expect(block).toHaveAttribute('data-target', EDGE_AIM);
    const wallAtB = tileOf(await block.getAttribute('data-target'));
    expect(wallAtA, 'the two hover points are the same tile, so this test proves nothing').not.toEqual(wallAtB);

    // ---- the removal, which used to keep showing the line above -----------
    const remove = page.locator('.hud-build__remove');
    await remove.click();
    await expect(remove).toHaveAttribute('aria-pressed', 'true');

    await page.mouse.move(points.b.x, points.b.y);
    // A *tile* aim, with no edge in it: a bed is not laid on a side of a tile,
    // and neither is a deletion. Before the fix this attribute still carried
    // the wall tool's four fields, which is the measurable form of the lie.
    await expect(block).toHaveAttribute('data-target', TILE_AIM);
    const removeAtB = tileOf(await block.getAttribute('data-target'));

    await page.mouse.move(points.a.x, points.a.y);
    await expect(block).toHaveAttribute('data-target', TILE_AIM);
    const removeAtA = tileOf(await block.getAttribute('data-target'));

    // Two positions, two answers. This is the assertion the frozen readout
    // fails first, and it fails it whichever half of the defect is present.
    expect(removeAtA, 'the readout named the same tile at two different aims').not.toEqual(removeAtB);

    // And the answers are about *these* positions, not merely about each other:
    // the wall tool independently named the tile under each of the same two
    // points, and the two producers must agree to within the one step
    // `pickEdgeAtWorld` is allowed to take into the neighbouring tile.
    for (const [edgeAim, tileAim, label] of [
      [wallAtA, removeAtA, 'the first'],
      [wallAtB, removeAtB, 'the second'],
    ] as const) {
      const steps = Math.abs(edgeAim.x - tileAim.x) + Math.abs(edgeAim.y - tileAim.y);
      expect(
        steps,
        `at ${label} hover point the removal readout named ${tileAim.x},${tileAim.y} where the pointer was over ${edgeAim.x},${edgeAim.y}`,
      ).toBeLessThanOrEqual(1);
    }

    // The line a player actually reads, not only the attribute beside it.
    await expect(readout).toBeVisible();
    await expect(readout).not.toHaveText('Point at the world');
    await expect(readout).toHaveText(`${removeAtA.x}, ${removeAtA.y}`);
  });
});
