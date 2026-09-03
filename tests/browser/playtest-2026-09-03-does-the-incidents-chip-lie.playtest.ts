/**
 * One question, cornered: **when a fight is open, does the INCIDENTS chip say
 * so?**
 *
 * **Not a CI gate** -- `.playtest.ts` is collected only by
 * `tests/browser/playwright.playtest.config.ts`.
 *
 * ## What was measured before, and why it settled nothing
 *
 * `playtest-2026-09-03-is-there-a-game-here.playtest.ts` recorded the chip
 * reading `0` with the badge `Clear` at all fifty of its samples while the
 * alerts column counted its way to *"A fight has broken out between two
 * prisoners. 26x"*. Sampling every twenty wall seconds at 4x is ~1,930 ticks
 * apart, which is not evidence: `IncidentLog.openIncidents()` returns the
 * non-terminal ones, so a chip at 0 is *correct* if every fight opened and
 * reached `resolved` or `lapsed` between two samples.
 *
 * ## Why this instrument can settle it, in ticks rather than in wall time
 *
 * The first draft of this file polled the DOM chip every 50 ms. That is a
 * better sample interval and still the wrong instrument, because it measures
 * the *renderer's* cadence and can miss a publication between two polls. This
 * one reads the wire instead. Both series come out of the worker tee
 * `installTee` already installs, and each carries its own tick:
 *
 *  - **every `simulation/status-counts` publication**, with
 *    `counts.activeIncidents`. `STATUS_COUNTS_PUBLISH_INTERVAL_MS` is 500
 *    (`src/simulation/worker/state-machine.ts:106`), so at 4x that is a
 *    publication roughly every 48 ticks and *nothing between two of them is
 *    unobserved* -- the series is what the chip was fed, not what a poll
 *    happened to catch.
 *  - **every `simulation/event`**, with `event.tick`, the tick the thing
 *    happened on (`state-machine.ts:728`). `incidents.assault-opened` is
 *    appended by `EventLog.recordIncidentOpened`
 *    (`src/simulation/events/event-log.ts:537`), which is called when the
 *    incident opens -- so the fight row is not a separate story about a
 *    fight, it *is* the incident opening.
 *
 * ## Why no guards, and what the brief for this probe got wrong about it
 *
 * The prison is built with **zero guards**, and the reason is *not* that
 * nothing can then terminate an incident. `LEGAL_TRANSITIONS` at
 * `src/simulation/incidents/incident.ts:24` reads `active: ['notified',
 * 'lapsed']`, so an unanswered incident still reaches a terminal state on its
 * own. What removing the guards buys is a **known, long dwell time**:
 * `DEFAULT_INCIDENT_RESPONSE_POLICY.responseDeadlineTicks` is 600
 * (`response-system.ts:27`) and `isPastDeadline` is `tick -
 * incident.startedAtTick > 600` (`:601`), so an assault nobody answers is open
 * for 601 ticks and then lapses.
 *
 * That is the whole of the argument, and it is arithmetic rather than
 * judgement:
 *
 * | | ticks |
 * | --- | --- |
 * | an unanswered assault stays open for | **601** |
 * | between two status-counts publications at 4x | ~48 |
 * | so publications taken while one assault is open | **~12** |
 * | quiet period between assaults in a sector (`DEFAULT_SECTOR_QUIET_TICKS_AFTER_ASSAULT`) | 2,400 |
 * | so share of the run with an incident open, at one assault per quiet period | **~25%** |
 *
 * A chip that reads 0 at *every* publication in a run that opened several
 * assaults is therefore reading 0 across roughly a quarter of the run in
 * which the log says an incident was open. There is no sampling explanation
 * left for that.
 *
 * ## The refuting sample, taken in the same run
 *
 * The chip reading 0 has one innocent explanation left: the incident really is
 * not open, because something else closed it early -- and then the chip is
 * honest and the finding is about the *incident*, not the readout. So this
 * instrument also pulls `hud/incidents` straight off the worker, which reads
 * the same `IncidentLog` the chip's projection reads
 * (`src/simulation/worker/projection-catalog.ts:417` and
 * `.../status-counts.ts:61` both pass `runtime.incidents`) and returns
 * `summary.stillOpen`, `countsByState` and a `timeline` per incident.
 *
 * - Ground truth says an incident is open and the chip says 0 -> `DEFECT`, and
 *   it is the readout.
 * - Ground truth agrees with the chip -> **NOT a defect of the chip.** The
 *   timelines then say what actually happened to those incidents.
 *
 * The pull is a read: `hud/incidents` has `target: 'none'` and its `project`
 * only walks the log.
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

const log = (line: string) => console.log(`[chip] ${line}`);

/** One `simulation/status-counts` publication, reduced to the incident question. */
interface IncidentCountSample {
  readonly tick: number;
  readonly activeIncidents: number;
  readonly activeIncidentType: string;
}

/** One `simulation/event`, reduced to "what happened, on which tick". */
interface EventSample {
  readonly tick: number;
  readonly type: string;
}

/**
 * Every status-counts publication so far, with `activeIncidents`.
 *
 * `countsSeries` in the harness is not reused because `CountsSample` has no
 * incident field, and widening the shared shape for one probe would put a
 * field nine other playtests do not read into all of them.
 */
async function incidentCountSeries(page: Page): Promise<readonly IncidentCountSample[]> {
  return page.evaluate(() =>
    ((window as unknown as TeeWindow).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/status-counts')
      .map((message) => {
        const payload = (message as { payload: { tick: number; counts: Record<string, unknown> } }).payload;
        return {
          tick: payload.tick,
          activeIncidents: Number(payload.counts['activeIncidents'] ?? -1),
          activeIncidentType: String(payload.counts['activeIncidentType'] ?? ''),
        };
      }),
  );
}

/** Every domain event so far, with the tick it happened on. */
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

interface IncidentRow {
  readonly id: string;
  readonly type: string;
  readonly state: string;
  readonly severity: number;
  readonly openedAtTick?: number;
  readonly startedAtTick?: number;
}

interface IncidentsView {
  readonly active: readonly IncidentRow[];
  readonly summary: { readonly total: number; readonly stillOpen: number; readonly resolved: number; readonly lapsed: number };
  readonly countsByState: readonly { readonly state: string; readonly count: number }[];
  readonly countsByType: readonly { readonly type: string; readonly count: number }[];
}

/** The ground truth: `IncidentLog`, read through the projection nothing in the UI pulls. */
async function pullIncidents(page: Page): Promise<{ tick?: number; view?: IncidentsView; error?: string }> {
  return page.evaluate(async () => {
    const worker = (window as unknown as { __chipProbeWorker?: Worker }).__chipProbeWorker;
    if (worker === undefined) return { error: 'no worker was captured' };
    const messageId = crypto.randomUUID();
    worker.postMessage({
      protocolVersion: 1,
      messageId,
      kind: 'simulation/request-projection',
      payload: { projectionId: 'hud/incidents', limit: 50 },
    });
    const replies = (window as unknown as { __chipProbeReplies?: Map<string, unknown> }).__chipProbeReplies;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const reply = replies?.get(messageId) as
        | { tick: number; view?: { data: unknown } }
        | undefined;
      if (reply !== undefined) {
        return { tick: reply.tick, view: reply.view?.data as never };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { error: 'the worker did not answer the hud/incidents request' };
  });
}

/**
 * Captures the worker instance and every projection reply.
 *
 * Installed *after* `installTee`, so this subclasses the tee's `Worker` rather
 * than the platform's: init scripts run in the order they were added, both
 * wrappers stay in the chain, and the tee's arrays keep filling. It is a
 * second script rather than an edit to `installTee` because the tee
 * deliberately drops `simulation/projection` to keep its arrays bounded, and
 * nine other playtests depend on it doing that.
 */
async function captureWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Base = Worker;
    const replies = new Map<string, unknown>();
    (window as unknown as { __chipProbeReplies: Map<string, unknown> }).__chipProbeReplies = replies;
    class ProbeWorker extends Base {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { __chipProbeWorker: Worker }).__chipProbeWorker = this;
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

test('does the INCIDENTS chip say so while a fight is open', async ({ page }) => {
  test.setTimeout(2_400_000);

  await installTee(page);
  await captureWorker(page);
  await openApp(page);

  // Six beds for twelve prisoners and **no guards at all**. Both halves are
  // deliberate: the unhoused six carry the `needDeficit` that
  // `scorePrisonerFlashpoint` reads for an assault, and a roster with no
  // guard maximises `staffingShortfall` in the same score -- so the run
  // produces assaults rather than waiting for them. Nothing can respond to
  // one, so each is open for the full 601 ticks.
  await buildAndPopulate(page, { beds: 6, admits: 12, guards: 0, label: 'chip' });

  await tab(page, 'security').click();
  log(`staff panel with zero hires: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' | ')}`);
  await tab(page, 'overview').click();

  const beforeTick = await currentTick(page);
  const beforePull = await pullIncidents(page);
  log(`armed at tick ${beforeTick}. counts=${JSON.stringify(await latestCounts(page))}`);
  log(`ground truth before the watch: ${JSON.stringify(beforePull)}`);

  const WATCH_MS = Number(process.env['CHIP_WATCH_MS'] ?? 600_000);
  const startedAt = Date.now();
  let assaultsSeen = 0;
  const pulls: { tick: number; chip: number; stillOpen: number; states: string }[] = [];

  while (Date.now() - startedAt < WATCH_MS) {
    await page.waitForTimeout(15_000);
    const events = await eventSeries(page);
    const counts = await incidentCountSeries(page);
    assaultsSeen = events.filter((event) => event.type === 'incidents.assault-opened').length;
    const chipEverAbove0 = counts.filter((sample) => sample.activeIncidents > 0).length;
    log(
      `${Math.round((Date.now() - startedAt) / 1000)}s tick=${await currentTick(page)}` +
        ` publications=${counts.length} chip>0 at ${chipEverAbove0} of them` +
        ` | assault-opened events=${assaultsSeen}` +
        ` | incident events=${JSON.stringify(events.filter((e) => e.type.startsWith('incidents.')).length)}`,
    );

    // A pull on every loop, so at least one of them lands inside a 601-tick
    // open window if any exist: the loop is 15 s (~1,450 ticks) apart, the
    // duty cycle is ~25%, so over a ten-minute watch this is forty pulls.
    const pull = await pullIncidents(page);
    if (pull.view !== undefined) {
      const chipNow = counts.at(-1)?.activeIncidents ?? -1;
      pulls.push({
        tick: pull.tick ?? -1,
        chip: chipNow,
        stillOpen: pull.view.summary.stillOpen,
        states: pull.view.countsByState.map((entry) => `${entry.state}=${entry.count}`).join(','),
      });
    }
  }

  // ---- the verdict data -------------------------------------------------
  const events = await eventSeries(page);
  const counts = await incidentCountSeries(page);
  const finalPull = await pullIncidents(page);
  const endTick = await currentTick(page);

  const assaultOpens = events.filter((event) => event.type === 'incidents.assault-opened').map((event) => event.tick);
  const incidentEvents = events.filter((event) => event.type.startsWith('incidents.'));
  const chipAbove0 = counts.filter((sample) => sample.activeIncidents > 0);

  log('=== VERDICT DATA ===');
  log(`ticks ${beforeTick} -> ${endTick} (${endTick - beforeTick} ticks, ${((endTick - beforeTick) / 2400).toFixed(1)} in-game days)`);
  log(`status-counts publications observed: ${counts.length}`);
  log(`every distinct activeIncidents value ever published: ${JSON.stringify([...new Set(counts.map((s) => s.activeIncidents))].sort())}`);
  log(`publications with activeIncidents > 0: ${chipAbove0.length} -> ${JSON.stringify(chipAbove0.slice(0, 40))}`);
  log(`incidents.* events (${incidentEvents.length}): ${JSON.stringify(incidentEvents.slice(0, 60))}`);
  log(`assault-opened ticks: ${JSON.stringify(assaultOpens)}`);

  // For each assault, what the chip was published as while it must have been
  // open. `601` is `responseDeadlineTicks + 1`; with no guards the incident
  // cannot leave `active` before it.
  for (const openedAt of assaultOpens.slice(0, 20)) {
    const window = counts.filter((sample) => sample.tick >= openedAt && sample.tick <= openedAt + 601);
    log(
      `  assault opened at tick ${openedAt}: ${window.length} publication(s) in [${openedAt},${openedAt + 601}]` +
        ` -> activeIncidents ${JSON.stringify(window.map((s) => s.activeIncidents))}`,
    );
  }

  log(`--- the refuting sample: ${pulls.length} pull(s) of hud/incidents beside the chip ---`);
  for (const pull of pulls) {
    log(`  tick ${pull.tick}: IncidentLog stillOpen=${pull.stillOpen} [${pull.states}] | chip published ${pull.chip}`);
  }
  log(`ground truth at the end: ${JSON.stringify(finalPull)}`);
  log(`alerts at the end: ${(await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' ; ')}`);
  log(`strip at the end: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  await page.screenshot({ path: 'playtest-out/chip-verdict.png' });

  expect(assaultOpens.length, 'no assault ever opened, so the probe took no sample at all').toBeGreaterThan(0);
});
