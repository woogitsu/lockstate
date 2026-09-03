/**
 * The question a management game lives or dies on: **the one ongoing cost the
 * game charges -- 80 a day per guard -- what does it buy that the player can
 * see?**
 *
 * **Not a CI gate** -- `.playtest.ts` is collected only by
 * `tests/browser/playwright.playtest.config.ts`.
 *
 * ## Why this is the question, and why it is A/B
 *
 * `playtest-2026-09-03-does-the-incidents-chip-lie.playtest.ts` runs the *same*
 * prison with **zero** guards. This one runs it with **exactly the number the
 * Staff panel asks for**, changing nothing else: same room, same six beds,
 * same twelve admissions, same clock, same watch length. So the two runs
 * differ in one variable and the difference between them is what a guard buys.
 *
 * Three things are read on both sides, and the third is the one that matters:
 *
 * 1. **Is the hire posted at all?** `DeploymentSystem.assignUnassignedGuards`
 *    posts up to the sector's requirement, and `requiredGuardCountFor`
 *    (`src/simulation/security/deployment-system.ts:100`) scales it with
 *    occupancy -- `Math.ceil(occupants / DEFAULT_SECTOR_PRISONERS_PER_GUARD)`
 *    against a floor of 1. Twelve prisoners therefore ask for two.
 * 2. **Does an incident end differently?** With no guards
 *    `claimableResponders` can never fill a response, so every incident times
 *    out and `lapse` runs: every participant injured, property damaged
 *    (`response-system.ts:604`). With the requirement filled, the response can
 *    mount and `advanceResponse` can reach `resolved` instead.
 * 3. **Can the player tell which of those two happened?** Both terminal
 *    transitions run `reportAllClearIfCalm`
 *    (`src/simulation/incidents/response-system.ts:268`), which is suppressed
 *    only when an escape was announced -- so a fight that guards contained and
 *    a fight that burned out unanswered both end with the same alert row. This
 *    instrument reads the alerts column verbatim on both sides so the two can
 *    be compared word for word.
 *
 * The ground truth for 2 is pulled off the worker rather than inferred:
 * `hud/incidents` answers `summary.resolved`, `summary.lapsed`,
 * `summary.totalInjured`, `summary.totalPropertyDamage` and
 * `responseMetrics`. Nothing in `src/ui` pulls that route -- which is itself
 * one of the readings this instrument takes.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  buildAndPopulate,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  panelText,
  tab,
  type TeeWindow,
} from './playtest-harness.ts';

const log = (line: string) => console.log(`[guard] ${line}`);

interface EventSample {
  readonly tick: number;
  readonly type: string;
}

async function eventSeries(page: Page): Promise<readonly EventSample[]> {
  return page.evaluate(() =>
    ((window as unknown as TeeWindow).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/event')
      .map((message) => {
        const event = (message as { payload: { event: { tick: number; type: string } } }).payload.event;
        return { tick: event.tick, type: event.type };
      }),
  );
}

interface IncidentsView {
  readonly active: readonly { readonly id: string; readonly type: string; readonly state: string }[];
  readonly summary: {
    readonly total: number;
    readonly stillOpen: number;
    readonly resolved: number;
    readonly lapsed: number;
    readonly totalInjured: number;
    readonly totalPropertyDamage: number;
    readonly escapes: number;
  };
  readonly countsByState: readonly { readonly state: string; readonly count: number }[];
  readonly responseMetrics?: Record<string, number>;
  readonly triggerMetrics?: Record<string, number>;
}

async function pullIncidents(page: Page): Promise<{ tick?: number; view?: IncidentsView; error?: string }> {
  return page.evaluate(async () => {
    const worker = (window as unknown as { __guardProbeWorker?: Worker }).__guardProbeWorker;
    if (worker === undefined) return { error: 'no worker was captured' };
    const messageId = crypto.randomUUID();
    worker.postMessage({
      protocolVersion: 1,
      messageId,
      kind: 'simulation/request-projection',
      payload: { projectionId: 'hud/incidents', limit: 50 },
    });
    const replies = (window as unknown as { __guardProbeReplies?: Map<string, unknown> }).__guardProbeReplies;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const reply = replies?.get(messageId) as { tick: number; view?: { data: unknown } } | undefined;
      if (reply !== undefined) return { tick: reply.tick, view: reply.view?.data as never };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { error: 'the worker did not answer the hud/incidents request' };
  });
}

async function captureWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Base = Worker;
    const replies = new Map<string, unknown>();
    (window as unknown as { __guardProbeReplies: Map<string, unknown> }).__guardProbeReplies = replies;
    class ProbeWorker extends Base {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { __guardProbeWorker: Worker }).__guardProbeWorker = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const data = event.data as { kind?: string; replyTo?: string; payload?: unknown };
          if (data?.kind !== 'simulation/projection') return;
          if (typeof data.replyTo !== 'string') return;
          replies.set(data.replyTo, data.payload);
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
  });
}

/**
 * Every tab, swept for the word "incident" outside the status strip.
 *
 * The strip chip is excluded on purpose: the question is whether a player who
 * sees `INCIDENTS 1 · Assault` has anywhere to go to find out *what* -- who is
 * in it, whether anybody is answering it, what the last one cost. `hud/incidents`
 * and `hud/incident-detail` both exist and both answer exactly that.
 */
async function sweepForAnIncidentSurface(page: Page): Promise<void> {
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(400);
    const text = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.hud');
      if (root === null) return 'NO .hud';
      const clone = root.cloneNode(true) as HTMLElement;
      for (const strip of [...clone.querySelectorAll('.hud-strip')]) strip.remove();
      return (clone.innerText ?? '').replace(/\s+/g, ' ');
    });
    const hits = [...text.matchAll(/[^.]{0,70}incident[^.]{0,70}/gi)].map((match) => match[0].trim());
    log(`tab ${id}: ${hits.length} mention(s) of "incident" outside the strip ${JSON.stringify(hits)}`);
  }
}

test('what does the one ongoing cost buy that a player can see', async ({ page }) => {
  test.setTimeout(2_400_000);

  await installTee(page);
  await captureWorker(page);
  await openApp(page);

  // Identical to the zero-guard run in every respect but the last argument.
  await buildAndPopulate(page, { beds: 6, admits: 12, guards: 2, label: 'guard' });

  await tab(page, 'security').click();
  log(`staff panel right after two hires: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' | ')}`);
  await page.waitForTimeout(8000);
  log(`staff panel eight seconds later: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' | ')}`);
  log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await sweepForAnIncidentSurface(page);
  await tab(page, 'overview').click();

  const beforeTick = await currentTick(page);
  log(`armed at tick ${beforeTick}. counts=${JSON.stringify(await latestCounts(page))}`);

  const WATCH_MS = Number(process.env['GUARD_WATCH_MS'] ?? 600_000);
  const startedAt = Date.now();
  while (Date.now() - startedAt < WATCH_MS) {
    await page.waitForTimeout(30_000);
    const events = await eventSeries(page);
    const pull = await pullIncidents(page);
    log(
      `${Math.round((Date.now() - startedAt) / 1000)}s tick=${await currentTick(page)}` +
        ` | incident events=${events.filter((event) => event.type.startsWith('incidents.')).length}` +
        ` | ground truth ${JSON.stringify(pull.view?.summary ?? pull.error)}` +
        ` | states ${JSON.stringify(pull.view?.countsByState?.map((entry) => `${entry.state}=${entry.count}`) ?? [])}`,
    );
  }

  const events = await eventSeries(page);
  const finalPull = await pullIncidents(page);
  const endTick = await currentTick(page);

  log('=== VERDICT DATA ===');
  log(`ticks ${beforeTick} -> ${endTick} (${endTick - beforeTick} ticks, ${((endTick - beforeTick) / 2400).toFixed(1)} in-game days)`);
  log(`every incidents.* event, with the tick it happened on: ${JSON.stringify(events.filter((event) => event.type.startsWith('incidents.')))}`);
  log(`ground truth at the end: ${JSON.stringify(finalPull)}`);
  await tab(page, 'security').click();
  log(`staff panel at the end: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' | ')}`);
  log(`strip at the end: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  log(`ALERTS COLUMN AT THE END, VERBATIM: ${(await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' ; ')}`);
  log(`counts at the end: ${JSON.stringify(await latestCounts(page))}`);
  await page.screenshot({ path: 'playtest-out/what-a-guard-buys.png' });

  /*
   * **Deliberately not an assertion.** "Two guards ran twenty-four in-game
   * days and the prison produced no incident at all" is a *result* about what
   * a guard buys, not a broken instrument -- `staffingShortfall` is a term in
   * `scorePrisonerFlashpoint`, so filling the requirement lowers the score
   * that opens an assault. A red run here would throw the log away to report
   * a finding, so the count is logged and the reading is left to the note.
   */
  log(`incidents opened across the whole run: ${finalPull.view?.summary.total ?? 'UNREADABLE'}`);
  expect(finalPull.error, 'the ground-truth pull never answered, so nothing here is evidence').toBeUndefined();
});
