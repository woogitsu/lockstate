/**
 * The question a management game lives or dies on: **the one ongoing cost the
 * game charges -- 80 a day per guard -- what does it buy that the player can
 * see?**
 *
 * **Not a CI gate** -- `.playtest.ts` is collected only by
 * `tests/browser/playwright.playtest.config.ts`.
 *
 * ## Why the arms are staged inside one prison rather than run as two
 *
 * Both arms are the same prison, in the same session, at the same tick rate:
 * six beds, twelve prisoners, one cell. Phase A hires **exactly what the Staff
 * panel asks for**; phase B hires four more and changes nothing else. A second
 * run would have differed in its whole build as well as its roster; staging
 * removes everything but the hire.
 *
 * ## The trap the phases are chosen to test, and where it is written
 *
 * Two different systems draw guards from one roster, and only one of them can
 * use a *posted* guard:
 *
 * - `DeploymentSystem.assignUnassignedGuards` posts guards up to the sector's
 *   requirement. `requiredGuardCountFor`
 *   (`src/simulation/security/deployment-system.ts:100`) scales that
 *   requirement with occupancy -- `Math.ceil(occupants /
 *   DEFAULT_SECTOR_PRISONERS_PER_GUARD)` over a floor of 1 -- so twelve
 *   prisoners ask for two, and the panel says so in the game's own words:
 *   *"0 of 2 | Unguarded | Nobody is on duty. Hire 2 to cover this
 *   population."*
 * - `IncidentResponseSystem.claimableResponders`
 *   (`src/simulation/incidents/response-system.ts:453`) needs
 *   `requiredResponderCount(severity)` guards, which is
 *   `Math.max(1, ceil(severity * 0.5))` (`:299`) -- and it draws them from
 *   `claimableGuardIds`, which is `unassignedGuardIds()` filtered by post
 *   eligibility (`src/simulation/security/post-eligibility.ts:103`).
 *
 * **`unassignedGuardIds()`. A guard standing on a post is not in that list.**
 * So a player who hires exactly the two the panel asks for gets both of them
 * posted and leaves the responder pool empty, and every incident still times
 * out through `lapse` (`response-system.ts:604`: every participant injured,
 * property damaged, and disciplinary points with a surcharge for lapsing --
 * `LAPSED_INCIDENT_SURCHARGE_POINTS` in
 * `src/simulation/prisoners/disciplinary-record.ts`).
 *
 * That is a prediction, and it is why the phases exist rather than an
 * argument: phase A should show `respondersDispatched: 0` with coverage
 * reading *Covered*, and phase B -- two posted, four spare -- should be the
 * first time a response can mount at all.
 *
 * ## The third reading, which is the one about the game
 *
 * Whether the player can tell those two apart. `reportAllClearIfCalm`
 * (`response-system.ts:268`) runs on **both** terminal transitions and is
 * suppressed only when an escape was announced -- so a fight guards contained
 * and a fight that burned out unanswered close with the same alert row. The
 * alerts column is printed verbatim at the end of each phase so the two can be
 * compared word for word. This is the shape of #683, which the owner's ruling
 * of 2026-08-30 fixed for the escape and only for the escape.
 *
 * It also sweeps all five tabs for the word "incident" outside the status
 * strip, because `hud/incidents` and `hud/incident-detail` are built,
 * schema'd and paged, and no file under `src/ui/` or `src/main.ts` references
 * either id.
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

  /** Everything worth reading at the end of a phase, in one block. */
  async function reportPhase(name: string, sinceTick: number): Promise<void> {
    const events = await eventSeries(page);
    const pull = await pullIncidents(page);
    await tab(page, 'security').click();
    log(`=== END OF PHASE ${name} ===`);
    log(`  ticks ${sinceTick} -> ${await currentTick(page)}`);
    log(`  ground truth summary: ${JSON.stringify(pull.view?.summary ?? pull.error)}`);
    log(`  states: ${JSON.stringify(pull.view?.countsByState?.map((entry) => `${entry.state}=${entry.count}`) ?? [])}`);
    log(`  responseMetrics: ${JSON.stringify(pull.view?.responseMetrics ?? {})}`);
    log(`  triggerMetrics: ${JSON.stringify(pull.view?.triggerMetrics ?? {})}`);
    log(`  every incidents.* event so far: ${JSON.stringify(events.filter((event) => event.type.startsWith('incidents.')))}`);
    log(`  staff panel: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' | ')}`);
    log(`  strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    log(`  ALERTS COLUMN, VERBATIM: ${(await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' ; ')}`);
    log(`  counts: ${JSON.stringify(await latestCounts(page))}`);
    await tab(page, 'overview').click();
  }

  async function watch(name: string, milliseconds: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < milliseconds) {
      await page.waitForTimeout(30_000);
      const pull = await pullIncidents(page);
      log(
        `${name} ${Math.round((Date.now() - startedAt) / 1000)}s tick=${await currentTick(page)}` +
          ` | summary ${JSON.stringify(pull.view?.summary ?? pull.error)}` +
          ` | responders ${JSON.stringify(pull.view?.responseMetrics ?? {})}`,
      );
    }
  }

  /** Hires `count` more guards through the Security tab's own control. */
  async function hireMore(count: number): Promise<void> {
    await tab(page, 'security').click();
    const row = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await row.count()) > 0) await row.first().click();
    for (let index = 0; index < count; index += 1) {
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(4000);
    log(`after hiring ${count} more: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' | ')}`);
    await tab(page, 'overview').click();
  }

  const PHASE_MS = Number(process.env['GUARD_PHASE_MS'] ?? 330_000);

  // ---- phase A: exactly the two the panel asked for --------------------
  const phaseAStart = await currentTick(page);
  log(`PHASE A armed at tick ${phaseAStart} with the two guards the panel asked for`);
  await watch('A', PHASE_MS);
  await reportPhase('A (2 hired, both posted)', phaseAStart);

  // ---- phase B: four more, so the responder pool is not empty ----------
  await hireMore(4);
  const phaseBStart = await currentTick(page);
  log(`PHASE B armed at tick ${phaseBStart} with six guards hired`);
  await watch('B', PHASE_MS);
  await reportPhase('B (6 hired, two posted, four spare)', phaseBStart);

  const finalPull = await pullIncidents(page);
  log(`incidents opened across the whole run: ${finalPull.view?.summary.total ?? 'UNREADABLE'}`);
  expect(finalPull.error, 'the ground-truth pull never answered, so nothing here is evidence').toBeUndefined();

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
