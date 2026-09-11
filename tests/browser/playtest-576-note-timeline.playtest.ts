import { test } from '@playwright/test';
import {
  armBuildable,
  buy,
  calibrate,
  centreOf,
  drag,
  fastForwardToMax,
  installTee,
  openApp,
  panelText,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * Re-measurement of issue #576, run 2026-09-11 against `origin/main` at
 * `be5061f9` (v0.0.579), from a worktree with `git lfs checkout` already run.
 *
 * ## What issue #576 measured, on 2026-08-29
 *
 * Four wall runs around a rectangle, the Build panel's queue polled once a
 * second until empty, then the **same rectangle re-dragged once a second**
 * and the Rooms panel's note read each time -- because `pendingEnclosure`
 * (`src/ui/hud/rooms-panel.ts`) is only recomputed on a new drag, never
 * polled, so a static read cannot observe it changing. That method found the
 * note still saying "open on at least one side" for **17.6-24.3 s** after the
 * queue reported empty, while a SHA-256 of the drawn tiles showed the world
 * itself frozen for **9.7 s** in the same window.
 *
 * ## Why that should no longer reproduce
 *
 * `SimulationSnapshotFeed` (`src/rendering/feed/simulation-snapshot-feed.ts`)
 * gained a sixth `dirty` mark in ADR 0099 (accepted 2026-09-06, `f07429b5`):
 * a change in `simulation/delta`'s fifth header word -- the world revision --
 * sets `dirty`, which makes the next `pump` send the snapshot request this
 * feed already knows how to send, in well under a second rather than waiting
 * for the 30 s consistency poll. `tests/integration/a-finished-build-reaches-
 * the-drawn-frame.test.ts` gates the transport; a sibling added 2026-09-09
 * (`adbad42f`), `tests/integration/a-finished-wall-reaches-the-enclosure-
 * note.test.ts`, gates specifically that `roomPerimeterEnclosure` over the
 * refreshed frame flips `open` -> `sealed` within ADR 0099's 200 ms bound --
 * closing exactly the gap issue #576 found, at the unit/integration level.
 * Neither test is a browser measurement, so this is one.
 *
 * ## This run's result
 *
 * `queueEmptyAt` (the page clock instant the Build panel first read "0
 * waiting - 0 being built") to the first re-drag's note text, timestamped:
 *
 * ```
 * Build panel says the queue is empty, 3033ms into the wait
 * t+19859ms (poll 0) area=12,12,4,4 note="DRAG A RECTANGLE ACROSS THE TILES THIS ROOM SHOULD COVER."
 * NOTE STOPPED SAYING OPEN at t+19859ms (poll 0)
 * ```
 *
 * The note at the first read was **not** the "open on at least one side"
 * text (`hud.rooms.enclosure-open`) -- it had already fallen back to the
 * panel's default arm-hint (`paintNote`'s final branch,
 * `src/ui/hud/rooms-panel.ts:1422`), which only happens when neither
 * `pendingIsTooSmall()` nor `pendingIsUnenclosed()` holds, i.e. the rectangle
 * was already read as sealed. The loop's exit condition fired on the very
 * first iteration, so this run puts **no lower bound above 0** on how long
 * the note could have kept saying open; it found none.
 *
 * **What the ~19.9 s is, and is not.** It is wall-clock time from
 * `waitForQueueEmpty` returning to the first note read, and almost all of it
 * is Playwright driving the Rooms panel's own UI (`tab().click()`, a row
 * click, an arm click, a drag, an `expect`-backed read) rather than anything
 * this test asked the simulation to wait on -- there is no polling loop
 * before poll 0. It is not comparable to issue #576's 17.6-24.3 s, which was
 * the note's *own* staleness with the UI cost already paid once.
 *
 * **What this does not settle.** A tighter bound (does the note flip inside,
 * say, 1 s of the walls finishing, matching ADR 0099's 200 ms figure at the
 * DOM layer) would need the first re-drag to land *before* construction
 * finishes and the loop to then observe the flip -- this run's timing
 * happened to land after. `tests/integration/a-finished-wall-reaches-the-
 * enclosure-note.test.ts` already proves that tighter bound without a
 * browser; this file corroborates that the browser-visible symptom issue
 * #576 reported does not reproduce, at whatever cadence a player's own clicks
 * would drive it at.
 *
 * Not a gate. `*.playtest.ts` is collected only by
 * `tests/browser/playwright.playtest.config.ts`, never by CI.
 */
test('re-measure #576: how long after the queue empties does the note stop saying open', async ({ page }) => {
  test.setTimeout(300_000);
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.hud-clock__day').first().waitFor();
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  console.log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  await buy(page, 'wall-brick', 60);
  await fastForwardToMax(page);
  await page.waitForTimeout(1000);

  // A 4x4 rectangle at tiles 12..15, matching issue #576's own dimensions.
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * 64;
  const eastX = origin.originX + 16 * 64;
  const northY = origin.originY + 12 * 64;
  const southY = origin.originY + 16 * 64;
  for (const run of [
    { name: 'north', a: { x: westX + 32, y: northY }, b: { x: eastX - 32, y: northY } },
    { name: 'south', a: { x: westX + 32, y: southY }, b: { x: eastX - 32, y: southY } },
    { name: 'west', a: { x: westX, y: northY + 32 }, b: { x: westX, y: southY - 32 } },
    { name: 'east', a: { x: eastX, y: northY + 32 }, b: { x: eastX, y: southY - 32 } },
  ]) {
    const produced = await drag(page, run.a, run.b);
    console.log(`wall run ${run.name}: ${produced.length} command(s)`);
  }

  const queueEmptyMs = await waitForQueueEmpty(page);
  const queueEmptyAt = Date.now();
  console.log(`Build panel says the queue is empty, ${queueEmptyMs}ms into the wait`);

  await tab(page, 'rooms').click();
  const roomRow = page.locator('.hud-rooms__list [data-room="room.cell"]');
  await roomRow.click();

  const samples: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const armEl = page.locator('.hud-rooms__arm');
    if ((await armEl.getAttribute('data-armed')) !== 'true') await armEl.click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 15, 15));
    const note = (await panelText(page, '.hud-rooms__note')).trim();
    const area = await page.locator('.hud-rooms__area').getAttribute('data-area');
    const elapsed = Date.now() - queueEmptyAt;
    const line = `t+${elapsed}ms (poll ${i}) area=${area} note=${JSON.stringify(note)}`;
    samples.push(line);
    console.log(line);
    // Cancel so the next iteration is a fresh drag, exactly as issue #576 did.
    const cancelBtn = page.locator('.hud-rooms__cancel');
    if (await cancelBtn.isVisible()) await cancelBtn.click();
    if (!note.toLowerCase().includes('open')) {
      console.log(`NOTE STOPPED SAYING OPEN at t+${elapsed}ms (poll ${i})`);
      break;
    }
    await page.waitForTimeout(1000);
  }
  console.log('--- full timeline ---');
  for (const line of samples) console.log(line);
});
