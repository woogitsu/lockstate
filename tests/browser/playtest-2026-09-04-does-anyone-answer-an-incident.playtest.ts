import { expect, test, type Page } from '@playwright/test';
import { buildAndPopulate, currentTick, fastForwardToMax, installTee, openApp, panelText, tab } from './playtest-harness';

/**
 * **Does anybody answer an incident, and can the player tell a handled one
 * from an expired one?** Playtest brief of 2026-09-04. Not a gate:
 * `tests/browser/playwright.config.ts` collects `*.spec.ts` only, and this
 * suffix is collected by `tests/browser/playwright.playtest.config.ts`, which
 * nothing in CI drives.
 *
 * Run one act at a time (`-g` is a regex):
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5391 node --experimental-transform-types \
 *   --disable-warning=ExperimentalWarning node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-does-anyone-answer-an-incident.playtest.ts -g "act 1"
 * ```
 *
 * **Two channels are read, and they are kept apart on purpose.**
 *
 * - *What a player sees*: the alerts list, the event band, the refusal band,
 *   the status strip and the Staff panel, read out of the DOM.
 * - *What the simulation knows*: the `hud/incidents` and
 *   `hud/incident-detail` read models, pulled straight off the worker by
 *   `installProjectionProbe` below. **No `src/ui/` module requests either
 *   one** -- so everything this channel reports is invisible to a player
 *   through the shipped interface, which is itself half the answer to the
 *   brief. The probe is an instrument, not a surface.
 *
 * `IncidentDetailViewModel.timeline` carries every state the incident passed
 * through and the tick it did so, so the state sequence is exact regardless
 * of how coarsely this file polls. Polling decides only how precisely a
 * transition can be paired with what was on screen at the time.
 *
 * Findings live in
 * `docs/research/2026-09-04-does-anyone-answer-an-incident.md`.
 */

const SIMULATION_PROTOCOL_VERSION = 1;

interface IncidentRowView {
  readonly incidentId: string;
  readonly type: string;
  readonly sectorId: string;
  readonly state: string;
  readonly terminal: boolean;
  readonly severity: number;
  readonly participantCount: number;
  readonly startedAtTick: number;
  readonly ageTicks: number;
  readonly requiredResponders?: number;
  readonly outcome?: { readonly injuredCount: number; readonly propertyDamage: number; readonly escaped: boolean };
}

interface IncidentsView {
  readonly active: readonly IncidentRowView[];
  readonly resolved: { readonly rows: readonly IncidentRowView[]; readonly total: number };
  readonly summary: Record<string, number>;
  readonly countsByState: readonly { readonly state: string; readonly count: number }[];
  readonly countsByType: readonly { readonly type: string; readonly count: number }[];
  readonly triggerMetrics?: Record<string, number>;
  readonly responseMetrics?: Record<string, number>;
}

interface IncidentDetailView extends IncidentRowView {
  readonly timeline: readonly { readonly state: string; readonly atTick: number }[];
  readonly participantEntityIds: readonly number[];
  readonly injuredEntityIds: readonly number[];
}

/**
 * Captures the worker instance and installs an in-page projection puller.
 *
 * **Must be installed after `installTee`.** That helper replaces `Worker`
 * with a tee subclass; this one subclasses whatever `Worker` is by then, so
 * installing it first would put the tee on top and lose the instance handle.
 *
 * The request it posts is the same `simulation/request-projection` message
 * `src/ui/simulation-projections.ts` sends -- same envelope, same
 * `.strict()` payload -- so a schema change breaks this loudly rather than
 * silently answering something else.
 */
async function installProjectionProbe(page: Page): Promise<void> {
  await page.addInitScript((protocolVersion: number) => {
    const Base = Worker;
    class ProbeWorker extends Base {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { __lsWorker?: Worker }).__lsWorker = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;

    (window as unknown as { __lsProjection?: unknown }).__lsProjection = (
      projectionId: string,
      target?: { kind: 'id'; id: string },
    ): Promise<unknown> => {
      const worker = (window as unknown as { __lsWorker?: Worker }).__lsWorker;
      if (worker === undefined) return Promise.reject(new Error('no worker captured'));
      const messageId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.removeEventListener('message', onMessage);
          reject(new Error(`no reply for ${projectionId}`));
        }, 15_000);
        const onMessage = (event: MessageEvent): void => {
          const data = event.data as { replyTo?: string; kind?: string; payload?: { view?: { data?: unknown } } };
          if (data?.replyTo !== messageId) return;
          worker.removeEventListener('message', onMessage);
          clearTimeout(timer);
          if (data.kind !== 'simulation/projection') {
            reject(new Error(`${projectionId} answered ${String(data.kind)}`));
            return;
          }
          resolve(data.payload?.view?.data ?? null);
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({
          protocolVersion,
          messageId,
          kind: 'simulation/request-projection',
          payload: { projectionId, ...(target === undefined ? {} : { target }) },
        });
      });
    };
  }, SIMULATION_PROTOCOL_VERSION);
}

async function readIncidents(page: Page): Promise<IncidentsView | null> {
  return page.evaluate(
    async () =>
      (await (window as unknown as { __lsProjection: (id: string) => Promise<unknown> }).__lsProjection(
        'hud/incidents',
      )) as IncidentsView | null,
  );
}

async function readIncidentDetail(page: Page, incidentId: string): Promise<IncidentDetailView | null> {
  return page.evaluate(
    async (id) =>
      (await (
        window as unknown as { __lsProjection: (p: string, t?: { kind: 'id'; id: string }) => Promise<unknown> }
      ).__lsProjection('hud/incident-detail', { kind: 'id', id })) as IncidentDetailView | null,
    incidentId,
  );
}

/** Everything a player can actually read at one moment, in one object. */
interface ScreenSample {
  readonly band: string;
  readonly refusal: string;
  readonly strip: string;
  readonly alerts: readonly string[];
  /** The status strip's own Incidents chip, on its own, because it is the one always-on incident surface. */
  readonly incidentsChip: string;
}

async function readScreen(page: Page): Promise<ScreenSample> {
  const alerts = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.hud-alerts__list');
    if (list === null) return [];
    return [...list.children]
      .map((row) => ((row as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim())
      .filter((row) => row.length > 0);
  });
  const incidentsChip = await page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.hud-strip__metrics [data-metric="incidents"]');
    return chip === null ? 'ABSENT' : (chip.innerText ?? '').replace(/\s+/g, ' ').trim();
  });
  return {
    incidentsChip,
    band: (await panelText(page, '.hud__event')).replace(/\s+/g, ' ').trim(),
    refusal: (await panelText(page, '.hud__refusal')).replace(/\s+/g, ' ').trim(),
    strip: (await panelText(page, '.hud-strip')).replace(/\n/g, ' | ').trim(),
    alerts,
  };
}

/** The Security tab's held-guard block and roster, expanded, as a player scrolling them sees. */
async function readStaffPanel(page: Page): Promise<{ held: string; roster: string }> {
  await tab(page, 'manage').click();
  const rosterHeader = page.locator('.hud-staff__roster .ui-section__header');
  if ((await rosterHeader.count()) > 0 && (await rosterHeader.getAttribute('aria-expanded')) !== 'true') {
    await rosterHeader.click();
  }
  await page.waitForTimeout(150);
  return {
    held: (await panelText(page, '.hud-staff__held')).replace(/\n/g, ' | '),
    roster: (await panelText(page, '.hud-staff__roster')).replace(/\n/g, ' | '),
  };
}

interface Transition {
  readonly incidentId: string;
  readonly type: string;
  readonly severity: number;
  readonly from: string;
  readonly to: string;
  /** Tick the projection first reported the new state; the exact tick comes off the timeline. */
  readonly seenAtTick: number;
  readonly screen: ScreenSample;
}

/**
 * Runs the clock forward, sampling the incident read model and the screen
 * together, and logs every state change the moment it is first observed.
 *
 * Returns every transition seen, plus the last incidents view.
 */
async function watch(
  page: Page,
  label: string,
  options: { readonly untilTick?: number; readonly untilMs: number; readonly pollMs?: number; readonly onTransition?: (t: Transition) => Promise<void> },
): Promise<{ readonly transitions: readonly Transition[]; readonly view: IncidentsView | null }> {
  const started = Date.now();
  const lastState = new Map<string, string>();
  const known = new Map<string, IncidentRowView>();
  const transitions: Transition[] = [];
  let view: IncidentsView | null = null;

  for (;;) {
    view = await readIncidents(page);
    const tick = await currentTick(page);
    if (view !== null) {
      const rows = [...view.active, ...view.resolved.rows];
      for (const row of rows) {
        const previous = lastState.get(row.incidentId);
        known.set(row.incidentId, row);
        if (previous === row.state) continue;
        const screen = await readScreen(page);
        const transition: Transition = {
          incidentId: row.incidentId,
          type: row.type,
          severity: row.severity,
          from: previous ?? '(first seen)',
          to: row.state,
          seenAtTick: tick,
          screen,
        };
        lastState.set(row.incidentId, row.state);
        transitions.push(transition);
        console.log(
          `[${label}] tick ~${tick} ${row.incidentId} (${row.type}, sev ${row.severity}, ` +
            `required ${String(row.requiredResponders)}) ${previous ?? '(first seen)'} -> ${row.state}` +
            (row.outcome === undefined
              ? ''
              : ` outcome{injured:${row.outcome.injuredCount} damage:${row.outcome.propertyDamage} escaped:${row.outcome.escaped}}`),
        );
        console.log(`[${label}]     SCREEN band=${JSON.stringify(screen.band)}`);
        console.log(`[${label}]     SCREEN alerts=${JSON.stringify(screen.alerts)}`);
        console.log(`[${label}]     SCREEN incidents-chip=${JSON.stringify(screen.incidentsChip)} refusal=${JSON.stringify(screen.refusal)}`);
        if (options.onTransition !== undefined) await options.onTransition(transition);
      }
    }
    if (options.untilTick !== undefined && tick >= options.untilTick) break;
    if (Date.now() - started > options.untilMs) break;
    await page.waitForTimeout(options.pollMs ?? 400);
  }
  return { transitions, view };
}

/** Dumps every incident the log holds, with its exact timeline off `hud/incident-detail`. */
async function dumpTimelines(page: Page, label: string, view: IncidentsView | null): Promise<void> {
  if (view === null) {
    console.log(`[${label}] no incidents view`);
    return;
  }
  const ids = [...view.active, ...view.resolved.rows].map((row) => row.incidentId);
  console.log(`[${label}] === ${ids.length} incident(s) in the log ===`);
  for (const id of ids) {
    const detail = await readIncidentDetail(page, id);
    if (detail === null) {
      console.log(`[${label}] ${id}: no detail`);
      continue;
    }
    const sequence = detail.timeline.map((entry) => `${entry.state}@${entry.atTick}`).join(' -> ');
    console.log(
      `[${label}] ${id} ${detail.type} sev=${detail.severity} required=${String(detail.requiredResponders)} ` +
        `participants=${detail.participantCount} :: ${sequence}` +
        (detail.outcome === undefined
          ? ' :: no outcome'
          : ` :: injured=${detail.outcome.injuredCount} damage=${detail.outcome.propertyDamage} escaped=${detail.outcome.escaped}`),
    );
  }
  console.log(`[${label}] summary=${JSON.stringify(view.summary)}`);
  console.log(`[${label}] countsByState=${JSON.stringify(view.countsByState)}`);
  console.log(`[${label}] countsByType=${JSON.stringify(view.countsByType)}`);
  console.log(`[${label}] triggerMetrics=${JSON.stringify(view.triggerMetrics)}`);
  console.log(`[${label}] responseMetrics=${JSON.stringify(view.responseMetrics)}`);
}

/** Counts the endings the way the brief asks: by the edge each timeline actually walked. */
async function tallyEdges(page: Page, label: string, view: IncidentsView | null): Promise<void> {
  if (view === null) return;
  const ids = [...view.active, ...view.resolved.rows].map((row) => row.incidentId);
  const edges = new Map<string, number>();
  for (const id of ids) {
    const detail = await readIncidentDetail(page, id);
    if (detail === null) continue;
    for (let index = 1; index < detail.timeline.length; index += 1) {
      const edge = `${detail.timeline[index - 1]!.state} -> ${detail.timeline[index]!.state}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  console.log(`[${label}] EDGE TALLY ${JSON.stringify([...edges.entries()].sort())}`);
}

async function hireGuards(page: Page, count: number): Promise<void> {
  await tab(page, 'manage').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let index = 0; index < count; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(250);
  }
}

test.describe.configure({ mode: 'serial' });

/**
 * Act 0 -- the instrument checking itself before a twenty-minute act leans on
 * it. If `hud/incidents` does not answer, everything below reports nothing
 * and would do so silently.
 */
test('act 0: the projection probe answers, and no src/ui module asks the same question', async ({ page }) => {
  test.setTimeout(180_000);
  await installTee(page);
  await installProjectionProbe(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  const view = await readIncidents(page);
  console.log(`[act0] hud/incidents on a fresh prison: ${JSON.stringify(view)}`);
  console.log(`[act0] screen: ${JSON.stringify(await readScreen(page))}`);
});

/**
 * Act 1 -- a prison with guards enough to answer. Do incidents resolve, and
 * what does the screen say at each transition?
 */
test('act 1: a staffed prison, every incident watched from birth to terminal state', async ({ page }) => {
  test.setTimeout(1_500_000);
  await installTee(page);
  await installProjectionProbe(page);
  await openApp(page);
  // One bed for eight admits: the homeless are what actually pushes
  // `needsPressure` over `hotThreshold` (`sector-risk.ts`'s own measured
  // note), so this is a prison that generates incidents *with* coverage
  // rather than because of its absence.
  await buildAndPopulate(page, { beds: 1, admits: 8, guards: 6, label: 'act1' });
  await fastForwardToMax(page);
  console.log(`[act1] running from tick ${await currentTick(page)} with 6 guards hired`);

  const { view } = await watch(page, 'act1', { untilMs: 900_000, pollMs: 400 });
  await dumpTimelines(page, 'act1', view);
  await tallyEdges(page, 'act1', view);
  const staff = await readStaffPanel(page);
  console.log(`[act1] final Staff panel held=${JSON.stringify(staff.held)}`);
  console.log(`[act1] final Staff panel roster=${JSON.stringify(staff.roster)}`);
  console.log(`[act1] final screen=${JSON.stringify(await readScreen(page))}`);
});

/** Act 2 -- the same prison with nobody to send. Does the player learn that nobody came? */
test('act 2: an unguarded prison, and what the screen says when nobody answers', async ({ page }) => {
  test.setTimeout(1_500_000);
  await installTee(page);
  await installProjectionProbe(page);
  await openApp(page);
  await buildAndPopulate(page, { beds: 1, admits: 8, guards: 0, label: 'act2' });
  await fastForwardToMax(page);
  console.log(`[act2] running from tick ${await currentTick(page)} with 0 guards`);

  const { view } = await watch(page, 'act2', { untilMs: 900_000, pollMs: 400 });
  await dumpTimelines(page, 'act2', view);
  await tallyEdges(page, 'act2', view);
  const staff = await readStaffPanel(page);
  console.log(`[act2] final Staff panel held=${JSON.stringify(staff.held)}`);
  console.log(`[act2] final screen=${JSON.stringify(await readScreen(page))}`);
});

/**
 * Act 3 -- the edge the brief asks about by name: `'responding' -> 'lapsed'`.
 *
 * Recalling one arrived guard can leave a live response record below its
 * required quorum. The containment timer must not resolve that incident.
 *
 * **Why it steps the clock instead of watching it.**
 * `DEFAULT_INCIDENT_RESPONSE_POLICY.containmentTicks` is 60, so `'responding'`
 * is a **three-second** state at 1x and a three-quarter-second one at 4x, and
 * a browser press lands tens of ticks late. Two earlier shapes of this act
 * failed on exactly that and their failures are recorded in the research note:
 * polling at 4x missed whole incidents between samples, and pressing Pause on
 * sight of `'responding'` lost the race to the containment timer. So this act
 * never lets the clock free-run once the prison is warm: it advances in 120ms
 * bursts of 1x (about two ticks) with the clock paused between them. Pause
 * and Play are gestures a player has -- the transport buttons -- not a harness
 * back door.
 *
 * The Full HD follow-up for #1506 catches `'responding'`, recalls exactly one
 * responder through the visible Staff control, and asserts the incident lapses.
 */
test('act 3: recall one responder during containment and watch the ending', async ({ page }) => {
  test.setTimeout(1_500_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installTee(page);
  await installProjectionProbe(page);
  await openApp(page);
  await buildAndPopulate(page, { beds: 1, admits: 8, guards: 6, label: 'act3' });
  await fastForwardToMax(page);

  const transport = page.locator('.hud-strip__transport button');
  const pause = transport.nth(0);
  const normalSpeed = transport.nth(1);

  /*
   * Phase 1, at 4x: run free only until the *first* incident has come and
   * gone, which is cheap, and then stop trusting the free-running clock.
   *
   * Two earlier attempts at this act died here and both are worth recording.
   * Polling `hud/incidents` at 300-400ms while the clock ran at 4x missed
   * whole incidents between samples. Pressing Pause the instant a
   * `'responding'` row appeared did not help either: a browser press lands
   * tens of ticks late, and `containmentTicks` is 60, so the incident
   * resolved *between the press and its arrival* --
   * `active@15100 -> notified@15100 -> responding@15110 -> resolved@15170`,
   * with the pause issued somewhere inside that.
   */
  const started = Date.now();
  for (;;) {
    const view = await readIncidents(page);
    if ((view?.triggerMetrics?.['incidentsTriggered'] ?? 0) > 0) {
      console.log(`[act3] first incident has happened; switching to a stepped clock at tick ${await currentTick(page)}`);
      break;
    }
    if (Date.now() - started > 900_000) throw new Error('no incident ever opened');
    await page.waitForTimeout(300);
  }
  await pause.click();
  await page.waitForTimeout(400);

  /*
   * Phase 2: never let the clock free-run again. Each step is one 120ms burst
   * of 1x, about two ticks against a `'responding'` window of 60. The constant
   * press latency cancels between the
   * unpause and the pause of one burst, so the burst length is wall time, not
   * latency.
   */
  let target: string | undefined;
  let caughtState = 'never';
  for (let step = 0; step < 1_200; step += 1) {
    const view = await readIncidents(page);
    const row = view?.active[0];
    if (row !== undefined && row.state === 'responding') {
      target = row.incidentId;
      caughtState = row.state;
      console.log(`[act3] caught ${row.incidentId} in '${row.state}' after ${step} burst(s), sev ${row.severity}, required ${String(row.requiredResponders)}`);
      break;
    }
    await normalSpeed.click();
    await page.waitForTimeout(120);
    await pause.click();
    await page.waitForTimeout(120);
  }
  if (target === undefined) {
    console.log(`[act3] ABORTING: never caught an incident mid-response (last state ${caughtState}).`);
    await normalSpeed.click();
    const view = await readIncidents(page);
    await dumpTimelines(page, 'act3', view);
    await tallyEdges(page, 'act3', view);
    return;
  }

  const beforeRelease = await readIncidentDetail(page, target);
  expect(beforeRelease?.state).toBe('responding');
  console.log(`[act3] before release: state=${beforeRelease?.state} timeline=${JSON.stringify(beforeRelease?.timeline)}`);
  const staffBefore = await readStaffPanel(page);
  console.log(`[act3] held before release: ${JSON.stringify(staffBefore.held)}`);
  console.log(`[act3] screen before release: ${JSON.stringify(await readScreen(page))}`);

  await tab(page, 'manage').click();
  const responderRow = page.locator('.hud-staff__held .hud-staff__held-row').filter({ hasText: 'Incident Response' }).first();
  expect(await page.locator('.hud-staff__held .hud-staff__held-row').filter({ hasText: 'Incident Response' }).count()).toBeGreaterThan(1);
  await responderRow.locator('button').click();
  expect(await page.locator('.hud-staff__held .hud-staff__held-row').filter({ hasText: 'Incident Response' }).count()).toBe(1);
  console.log(`[act3] recalled one responder at tick ${await currentTick(page)}; held now ${JSON.stringify(await panelText(page, '.hud-staff__held'))}`);

  // The clock has to run for the release commands to be applied at all --
  // a submitted command is executed on a tick, and the deadline that decides
  // the ending is measured in ticks.
  await normalSpeed.click();
  await page.waitForTimeout(200);
  console.log(`[act3] resumed at 1x, tick ${await currentTick(page)}`);

  const afterRelease = await readIncidentDetail(page, target);
  console.log(`[act3] just after release: state=${afterRelease?.state} timeline=${JSON.stringify(afterRelease?.timeline)}`);
  console.log(`[act3] screen just after release: ${JSON.stringify(await readScreen(page))}`);
  const staffAfter = await readStaffPanel(page);
  console.log(`[act3] held just after release: ${JSON.stringify(staffAfter.held)}`);

  // Watch it out at 1x, sampling the target itself every 200ms so the
  // terminal transition is paired with the screen that carried it.
  const deadline = Date.now() + 420_000;
  let lastState = afterRelease?.state ?? 'unknown';
  for (;;) {
    const detail = await readIncidentDetail(page, target);
    if (detail !== null && detail.state !== lastState) {
      const screen = await readScreen(page);
      console.log(`[act3] ${target} ${lastState} -> ${detail.state} (timeline ${JSON.stringify(detail.timeline)})`);
      console.log(`[act3]     SCREEN band=${JSON.stringify(screen.band)}`);
      console.log(`[act3]     SCREEN alerts=${JSON.stringify(screen.alerts)}`);
      console.log(`[act3]     SCREEN incidents-chip=${JSON.stringify(screen.incidentsChip)}`);
      console.log(`[act3]     held=${JSON.stringify((await readStaffPanel(page)).held)}`);
      lastState = detail.state;
      if (detail.terminal) break;
    }
    if (Date.now() > deadline) {
      console.log(`[act3] gave up waiting; ${target} is still ${lastState}`);
      break;
    }
    await page.waitForTimeout(200);
  }

  const finalDetail = await readIncidentDetail(page, target);
  expect(finalDetail?.state).toBe('lapsed');
  console.log(`[act3] TARGET FINAL ${target}: state=${finalDetail?.state} timeline=${JSON.stringify(finalDetail?.timeline)} outcome=${JSON.stringify(finalDetail?.outcome)}`);
  const view = await readIncidents(page);
  await dumpTimelines(page, 'act3', view);
  await tallyEdges(page, 'act3', view);
  console.log(`[act3] final screen=${JSON.stringify(await readScreen(page))}`);
});
