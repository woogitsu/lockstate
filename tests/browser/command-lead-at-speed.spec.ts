import { expect, test, type Page } from './network-changed-fixture';
import { installTee, openApp, type TeeWindow } from './playtest-harness';

/**
 * **A press that follows a long task at ×4 still reaches the simulation, and
 * so does the press after it (issue #942).**
 *
 * ## The defect this gate exists for
 *
 * `SimulationCommandSender` schedules every command a little ahead of where it
 * thinks the kernel has got to, and the margin was twenty *ticks*
 * (`DEFAULT_LEAD_TICKS`). Twenty ticks is one second of kernel time, which is
 * **250 ms of real time at ×4** -- so any real time between the tick a worker
 * message reports and the moment the main thread reads it ate the margin, and
 * the command was refused as `past-tick`. Worse, that refusal cleared the
 * sequence baseline, and every press after it threw *"The simulation has not
 * reported its command sequence yet"* until a snapshot restated the count --
 * which the render feed brings no sooner than its thirty-second consistency
 * poll. **One late press disabled the control surface.** Measured in play at
 * ×4: twenty-five `Admit` presses produced seventeen prisoners, and eight
 * `Hire Guard` presses produced three guards.
 *
 * ## Why this is a browser test at all
 *
 * `tests/unit/ui-simulation-commands.test.ts` carries the arithmetic and the
 * cascade, driven end to end against the shipped worker over a port with a
 * latency. What it cannot carry is the *ordering* that produces the skew in a
 * real page, and that ordering is the whole mechanism: a long task on the main
 * thread lets a click handler run **before** the worker messages queued behind
 * it, so the press is projected from an anchor the length of that task old.
 * Nothing but a real page, a real `Worker` and a real event loop has that
 * property.
 *
 * ## What it does, and why each step is here
 *
 * A real prison at ×4, then one `page.evaluate` that busies the main thread
 * for 600 ms and clicks *Hire* **in the same task**. 600 ms at ×4 is 48 ticks
 * of skew: outside the old 20-tick margin and inside the 80 ticks a real
 * second is at that speed. The clock is genuinely running, the `Worker` is a
 * real worker, and the click is a real `click()` on the real control.
 *
 * Then a second press, pressed normally. That one is the *cascade*: with the
 * baseline dropped by the first refusal it throws before it becomes a command,
 * so it is the difference between losing one press and losing the run.
 *
 * **Both assertions are on what the worker answered**, read off the tee rather
 * than off the screen -- a queued command-result is the simulation agreeing to
 * do the thing, which is the property a player is owed and the one the counts
 * follow from. The staff figure is asserted too, because a command the
 * simulation queued and then refused on its content would satisfy the first
 * assertion and change nothing a player can see.
 */

/** What the worker answered about each command, oldest first. */
async function commandResults(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    ((window as unknown as TeeWindow).lockstateFromWorker ?? [])
      .map((message) => message as { readonly kind?: string; readonly payload?: { readonly status?: string; readonly fault?: { readonly code?: string; readonly message?: string } } })
      .filter((message) => message.kind === 'simulation/command-result')
      .map((message) =>
        message.payload?.status === 'queued'
          ? 'queued'
          : `rejected ${String(message.payload?.fault?.code)}: ${String(message.payload?.fault?.message)}`,
      ),
  );
}

const metric = (page: Page, id: string) => page.locator(`[data-metric="${id}"] .ui-stat__value`);

test.describe('a press after a long task at speed (#942)', () => {
  test('reaches the simulation, and leaves the press after it working (#942)', async ({ page }) => {
    // A page load, a prison, and a 600 ms stall on the main thread. `test.slow()`
    // triples the suite's 60 s budget rather than making this do less: on a
    // loaded runner the page load alone has been measured at 18 s.
    test.slow();

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // ---- ×4, from the transport the player uses ------------------------
    // The strip's three icon buttons are pause, play and fast forward, in that
    // document order (`src/ui/hud/status-strip.ts`). Asserted through the
    // readout rather than the presses, because a press the worker never took
    // would leave the clock at ×1 and make everything below a ×1 measurement.
    const transport = page.locator('.hud-strip__transport button');
    await transport.nth(1).click();
    await transport.nth(2).click();
    await transport.nth(2).click();
    await expect(page.locator('.hud-clock__speed'), 'the worker never took the speed, so this is not a x4 run').toHaveText('×4');

    // ---- the control ---------------------------------------------------
    await page.locator('.ui-tab[data-tab="security"]').click();
    await expect(page.locator('.hud-staff')).toBeVisible();
    await expect(
      page.locator('.hud-staff__list [data-selected="true"]'),
      'no staff role was chosen, so the press below has no subject',
    ).toHaveCount(1);
    await expect(page.locator('.hud-staff__hire')).toBeEnabled();
    expect(await commandResults(page), 'this session has issued a command already, so the counts below are not this press').toEqual([]);

    // ---- the press, behind a real long task ----------------------------
    /*
     * The busy loop and the click are one task deliberately. Message events
     * from the worker queue *behind* this task, so the handler projects from
     * whatever tick the main thread last read -- which is what happens when a
     * frame, a garbage collection or a snapshot deserialisation lands between
     * two presses. Spinning on `performance.now()` rather than sleeping,
     * because a sleep yields to exactly the messages this has to keep waiting.
     */
    await page.evaluate(() => {
      const control = document.querySelector<HTMLElement>('.hud-staff__hire');
      if (control === null) throw new Error('the Hire control was not on the page');
      const until = performance.now() + 600;
      while (performance.now() < until) {
        // Deliberately empty: the point is that this thread is busy.
      }
      control.click();
    });

    await expect
      .poll(async () => commandResults(page), {
        message: 'the press after the stall never became a command the worker accepted',
        timeout: 20_000,
      })
      .toEqual(['queued']);
    await expect(metric(page, 'staff'), 'the command was queued and then changed nothing').toHaveText('1');

    // ---- and the press after it, which is the cascade ------------------
    await page.locator('.hud-staff__hire').click();
    await expect
      .poll(async () => commandResults(page), {
        message: 'the press after the stalled one was refused, which is one dropped press becoming a dropped run',
        timeout: 20_000,
      })
      .toEqual(['queued', 'queued']);
    await expect(metric(page, 'staff')).toHaveText('2');
  });
});
