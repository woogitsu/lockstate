/**
 * Playtest, 2026-09-04 — **are the fixes real?**
 *
 * Six fixes landed between v0.0.451 and v0.0.469, each answering a finding
 * from the 2026-09-04 play-testing round. A player does not read pull
 * requests. This instrument sits down and plays the exact situation each fix
 * was written for, and reports what a **player** now gets.
 *
 * | act | fix | the situation it was written for |
 * | --- | --- | --- |
 * | 1 | #941 | the Security panel's `Covered` at the guard count that lapses every incident |
 * | 2 | #944 | a real stack of actors on one tile, looked at as pixels |
 * | 3 | #942 | a run of `Admit`/`Hire` presses at every speed |
 * | 4 | #943 | `New prison` pressed over unsaved play, and the sibling `Load` path |
 * | 5 | #945 | removing a standing object, and the pending-order sibling |
 * | 6 | #926 | the Build panel's arm label against its own box |
 *
 * **Not a gate.** `tests/browser/playwright.config.ts` is `testMatch:
 * /.*\.spec\.ts$/`; `.playtest.ts` is collected only by
 * `tests/browser/playwright.playtest.config.ts`, which nothing in CI drives.
 *
 * Run one act at a time (`-g` is a regex):
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5321 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-are-the-fixes-real.playtest.ts -g "act 1"
 * ```
 *
 * **Two channels, never mixed.** Sentences come out of the DOM (`.hud`
 * `innerText`, `getClientRects`, computed style); numbers come off the worker
 * through `playtest-harness`'s tee and through the projection probe. The gap
 * between them is where a fix that is shipped, keyed, tested and rendered by
 * nothing shows up.
 *
 * Findings live in `docs/research/2026-09-04-are-the-fixes-real.md`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  TILE,
  armBuildable,
  buildAndPopulate,
  buy,
  calibrate,
  centreOf,
  currentClock,
  currentTick,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

const SHOTS =
  '/tmp/claude-0/-workspace-lockstate/317b5b29-acc0-5270-82e4-ccecba312c95/scratchpad/are-the-fixes-real';

const SIMULATION_PROTOCOL_VERSION = 1;

test.describe.configure({ mode: 'serial' });

/* ================================================================== */
/* shared instruments                                                  */
/* ================================================================== */

/** Everything a player can read at one moment, in one object. */
interface Screen {
  readonly band: string;
  readonly refusal: string;
  readonly strip: string;
  readonly alerts: readonly string[];
}

async function say(page: Page): Promise<Screen> {
  const alerts = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.hud-alerts__list');
    if (list === null) return [];
    return [...list.children]
      .map((row) => ((row as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim())
      .filter((row) => row.length > 0);
  });
  return {
    band: (await panelText(page, '.hud__event')).replace(/\s+/g, ' ').trim(),
    refusal: (await panelText(page, '.hud__refusal')).replace(/\s+/g, ' ').trim(),
    strip: (await panelText(page, '.hud-strip')).replace(/\n/g, ' | ').trim(),
    alerts,
  };
}

/**
 * The projection probe from
 * `playtest-2026-09-04-does-anyone-answer-an-incident.playtest.ts`, unchanged.
 * **Must be installed after `installTee`** — that helper replaces `Worker`
 * with a tee subclass and this one subclasses whatever `Worker` is by then.
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

async function projection<T>(page: Page, id: string, target?: { kind: 'id'; id: string }): Promise<T | null> {
  return page.evaluate(
    async ({ projectionId, projectionTarget }) =>
      (await (
        window as unknown as { __lsProjection: (p: string, t?: { kind: 'id'; id: string }) => Promise<unknown> }
      ).__lsProjection(projectionId, projectionTarget)) as T,
    { projectionId: id, projectionTarget: target },
  );
}

interface IncidentRowView {
  readonly incidentId: string;
  readonly type: string;
  readonly state: string;
  readonly severity: number;
  readonly requiredResponders?: number;
  readonly outcome?: { readonly injuredCount: number; readonly propertyDamage: number; readonly escaped: boolean };
}
interface IncidentsView {
  readonly active: readonly IncidentRowView[];
  readonly resolved: { readonly rows: readonly IncidentRowView[]; readonly total: number };
  readonly summary: Record<string, number>;
  readonly responseMetrics?: Record<string, number>;
}
interface IncidentDetailView extends IncidentRowView {
  readonly timeline: readonly { readonly state: string; readonly atTick: number }[];
}

/** The whole Security tab's coverage block, split the way a player reads it. */
async function coverageBlock(page: Page): Promise<{
  tone: string;
  summary: string;
  badge: string;
  note: string;
  noteLaidOut: boolean;
  consequence: string;
  consequenceLaidOut: boolean;
  held: string;
}> {
  await tab(page, 'security').click();
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const laidOut = (node: Element | null): boolean =>
      node !== null && !(node as HTMLElement).hidden && node.getClientRects().length > 0;
    const text = (selector: string): string => {
      const node = document.querySelector<HTMLElement>(selector);
      return node === null ? 'ABSENT' : (node.innerText ?? '').replace(/\s+/g, ' ').trim();
    };
    const block = document.querySelector<HTMLElement>('.hud-staff__coverage');
    const notes = [...document.querySelectorAll<HTMLElement>('.hud-staff__coverage .hud-staff__note')];
    const plain = notes.find((node) => !node.classList.contains('hud-staff__coverage-consequence')) ?? null;
    const consequence = notes.find((node) => node.classList.contains('hud-staff__coverage-consequence')) ?? null;
    return {
      tone: block?.dataset['tone'] ?? 'ABSENT',
      summary: text('.hud-staff__coverage-summary'),
      badge: text('.hud-staff__coverage .ui-status-badge'),
      note: plain === null ? 'ABSENT' : (plain.innerText ?? '').replace(/\s+/g, ' ').trim(),
      noteLaidOut: laidOut(plain),
      consequence: consequence === null ? 'ABSENT' : (consequence.innerText ?? '').replace(/\s+/g, ' ').trim(),
      consequenceLaidOut: laidOut(consequence),
      held: text('.hud-staff__held'),
    };
  });
}

async function hireOnce(page: Page): Promise<void> {
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(400);
}

/* ================================================================== */
/* act 1 — #941, `Covered` says what it means                          */
/* ================================================================== */

/**
 * The situation the fix was written for, played from a fresh prison: a
 * population big enough that the sector asks for three guards, hiring
 * **exactly what the panel asks for**, and then several incidents.
 *
 * `resolveOccupancyScaledGuardCount` is `max(scheduled, ceil(occupants / 8))`
 * with `scheduled` = 1 (`src/simulation/security/sector-staffing.ts:190`,
 * `src/simulation/security/default-sector.ts:113`), so 17 prisoners asks for
 * 3 — which is the shape the #941 finding measured.
 */
test('act 1: hire exactly what the Security panel asks for, then watch the incidents', async ({ page }) => {
  test.setTimeout(2_400_000);
  await installTee(page);
  await installProjectionProbe(page);
  await openApp(page);

  // Six beds for seventeen admissions: the homeless are what pushes
  // `needsPressure` over the line, so this is a prison that produces
  // incidents while asking for three guards.
  await buildAndPopulate(page, { beds: 6, admits: 17, guards: 0, label: 'act1' });
  const populated = await latestCounts(page);
  console.log(`[act1] after admitting: ${JSON.stringify(populated)}`);

  console.log(`[act1] coverage with nobody hired: ${JSON.stringify(await coverageBlock(page))}`);

  // Hire one at a time until the badge stops asking for more, logging every
  // rung. "Exactly what the panel asks for" is the first hire at which the
  // panel stops naming a number.
  for (let hire = 1; hire <= 6; hire += 1) {
    await hireOnce(page);
    const block = await coverageBlock(page);
    const counts = await latestCounts(page);
    console.log(`[act1] after hire ${hire} (staff=${counts?.staff}): ${JSON.stringify(block)}`);
    if (block.badge.toLowerCase() === 'covered') {
      console.log(`[act1] === the panel says Covered at ${hire} guard(s) hired ===`);
      break;
    }
  }

  const covered = await coverageBlock(page);
  console.log(`[act1] THE SENTENCE A PLAYER READS: ${JSON.stringify(covered.note)} (laid out: ${covered.noteLaidOut})`);
  console.log(`[act1] the consequence line: ${JSON.stringify(covered.consequence)} (laid out: ${covered.consequenceLaidOut})`);
  console.log(`[act1] held block beside it: ${JSON.stringify(covered.held)}`);
  console.log(`[act1] whole Security panel: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);

  await fastForwardToMax(page);
  const startedAt = await currentTick(page);
  console.log(`[act1] running from tick ${startedAt}`);

  // Watch until several incidents have opened and closed, sampling the
  // screen at every state change so the sentence and the outcome are paired.
  const started = Date.now();
  const lastState = new Map<string, string>();
  let view: IncidentsView | null = null;
  for (;;) {
    view = await projection<IncidentsView>(page, 'hud/incidents');
    if (view !== null) {
      for (const row of [...view.active, ...view.resolved.rows]) {
        if (lastState.get(row.incidentId) === row.state) continue;
        lastState.set(row.incidentId, row.state);
        const screen = await say(page);
        console.log(
          `[act1] tick ~${await currentTick(page)} ${row.incidentId} (${row.type} sev ${row.severity},` +
            ` required ${String(row.requiredResponders)}) -> ${row.state}` +
            (row.outcome === undefined ? '' : ` outcome=${JSON.stringify(row.outcome)}`),
        );
        console.log(`[act1]     SCREEN band=${JSON.stringify(screen.band)} alerts=${JSON.stringify(screen.alerts)}`);
      }
      if (view.resolved.rows.length >= 8) break;
    }
    if (Date.now() - started > 900_000) break;
    await page.waitForTimeout(500);
  }

  const ids = view === null ? [] : [...view.active, ...view.resolved.rows].map((row) => row.incidentId);
  console.log(`[act1] === ${ids.length} incident(s) ===`);
  for (const id of ids) {
    const detail = await projection<IncidentDetailView>(page, 'hud/incident-detail', { kind: 'id', id });
    if (detail === null) continue;
    console.log(
      `[act1] ${id} ${detail.type} sev=${detail.severity} required=${String(detail.requiredResponders)} :: ` +
        detail.timeline.map((entry) => `${entry.state}@${entry.atTick}`).join(' -> ') +
        (detail.outcome === undefined ? '' : ` :: ${JSON.stringify(detail.outcome)}`),
    );
  }
  console.log(`[act1] summary=${JSON.stringify(view?.summary)}`);
  console.log(`[act1] responseMetrics=${JSON.stringify(view?.responseMetrics)}`);
  console.log(`[act1] coverage block at the end: ${JSON.stringify(await coverageBlock(page))}`);
  console.log(`[act1] final counts: ${JSON.stringify(await latestCounts(page))}`);
});

/**
 * Act 1b — the same sentence at every shipped viewport, because
 * `.hud-staff__note` is clamped to one line below `max-height: 700px`
 * (`src/ui/hud/hud.css`) and a sentence a player cannot finish reading is a
 * sentence they did not get.
 */
test('act 1b: the covered sentence at five viewports', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(800);
  // An empty prison reads the covered rung: `resolveOccupancyScaledGuardCount`
  // answers 0 for a sector holding nobody (#533), and `describeStaffCoverage`
  // takes the `shortage <= 0` branch.
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 900, height: 600 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    const block = await coverageBlock(page);
    const box = await page.evaluate(() => {
      const notes = [...document.querySelectorAll<HTMLElement>('.hud-staff__coverage .hud-staff__note')];
      const plain = notes.find((node) => !node.classList.contains('hud-staff__coverage-consequence'));
      if (plain === undefined) return 'ABSENT';
      const rect = plain.getBoundingClientRect();
      const style = getComputedStyle(plain);
      return `${Math.round(rect.width)}x${Math.round(rect.height)} scrollH=${plain.scrollHeight} clamp=${style.webkitLineClamp} overflow=${style.overflow} display=${style.display}`;
    });
    console.log(
      `[act1b] ${viewport.width}x${viewport.height} :: badge=${JSON.stringify(block.badge)} summary=${JSON.stringify(block.summary)}` +
        ` note=${JSON.stringify(block.note)} laidOut=${block.noteLaidOut} box=${box}`,
    );
  }
});

/* ================================================================== */
/* act 2 — #944, a shared tile draws both                              */
/* ================================================================== */

/** The actor tee from `playtest-2026-09-04-can-i-see-my-prison.playtest.ts`. */
async function installActorTee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const HEADER_WORDS = 4;
    const RECORD_WORDS = 5;
    const WORD = 4;
    const SUBTILE = 256;
    interface Sample {
      readonly tick: number;
      readonly actors: readonly { id: number; population: number; x: number; y: number; vx: number; vy: number }[];
    }
    const samples: Sample[] = [];
    (window as unknown as { lockstateActorSamples: Sample[] }).lockstateActorSamples = samples;
    const RealWorker = Worker;
    class ActorTeeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as { kind?: string; payload?: { tick?: number; delta?: { data?: ArrayBuffer } } };
          if (message.kind !== 'simulation/delta') return;
          const body = message.payload?.delta?.data;
          if (!(body instanceof ArrayBuffer)) return;
          try {
            const view = new DataView(body);
            const recordCount = view.getUint32(2 * WORD, true);
            const actors = [];
            for (let record = 0; record < recordCount; record += 1) {
              const offset = (HEADER_WORDS + record * RECORD_WORDS) * WORD;
              const packed = view.getUint32(offset + WORD, true);
              actors.push({
                id: view.getUint32(offset, true),
                population: packed & 0xff,
                x: view.getInt32(offset + 2 * WORD, true) / SUBTILE,
                y: view.getInt32(offset + 3 * WORD, true) / SUBTILE,
                vx: view.getInt16(offset + 4 * WORD, true) / SUBTILE,
                vy: view.getInt16(offset + 4 * WORD + 2, true) / SUBTILE,
              });
            }
            samples.push({ tick: message.payload?.tick ?? -1, actors });
            if (samples.length > 400) samples.splice(0, samples.length - 400);
          } catch {
            /* a body this cannot read is not this playtest's finding */
          }
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ActorTeeWorker as unknown as typeof Worker;
  });
}

interface ActorSample {
  readonly tick: number;
  readonly actors: readonly { id: number; population: number; x: number; y: number; vx: number; vy: number }[];
}

async function latestActors(page: Page): Promise<ActorSample | undefined> {
  const samples = await page.evaluate(
    () => (window as unknown as { lockstateActorSamples?: ActorSample[] }).lockstateActorSamples ?? [],
  );
  return samples[samples.length - 1];
}

function tileBox(
  origin: { originX: number; originY: number },
  from: { tx: number; ty: number },
  to: { tx: number; ty: number },
  pad = 0,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.max(0, origin.originX + from.tx * TILE - pad),
    y: Math.max(0, origin.originY + from.ty * TILE - pad),
    width: (to.tx - from.tx + 1) * TILE + 2 * pad,
    height: (to.ty - from.ty + 1) * TILE + 2 * pad,
  };
}

async function look(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const shot = await page.screenshot(clip === undefined ? { animations: 'disabled' } : { clip, animations: 'disabled' });
  writeFileSync(`${SHOTS}/${name}.png`, shot);
  console.log(`  [shot] ${name}.png (${shot.length} bytes) ${clip === undefined ? 'full frame' : JSON.stringify(clip)}`);
}

/** Magnified crop, blitted through a 2D canvas — the WebGL canvas has no readable buffer. */
async function magnify(
  page: Page,
  name: string,
  region: { x: number; y: number; width: number; height: number },
  scale = 6,
): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const frame = await page.screenshot({ animations: 'disabled' });
  const dataUrl = `data:image/png;base64,${frame.toString('base64')}`;
  const magnified = await page.evaluate(
    async ({ url, box, factor }) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('the frame could not be read back'));
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(box.width * factor);
      canvas.height = Math.round(box.height * factor);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no 2d context to magnify into');
      context.imageSmoothingEnabled = false;
      context.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    },
    { url: dataUrl, box: region, factor: scale },
  );
  const bytes = Buffer.from(magnified.split(',')[1] ?? '', 'base64');
  writeFileSync(`${SHOTS}/${name}.png`, bytes);
  console.log(`  [magnified x${scale}] ${name}.png (${bytes.length} bytes) from ${JSON.stringify(region)}`);
}

/** Groups the worker's actors by the tile they stand on, so the stack is a number before it is a picture. */
function stacks(sample: ActorSample | undefined): string {
  if (sample === undefined) return 'no actor keyframe at all';
  const byTile = new Map<string, { prisoners: number; guards: number; points: Set<string> }>();
  for (const actor of sample.actors) {
    const key = `${Math.floor(actor.x)},${Math.floor(actor.y)}`;
    const entry = byTile.get(key) ?? { prisoners: 0, guards: 0, points: new Set<string>() };
    if (actor.population === 1) entry.guards += 1;
    else entry.prisoners += 1;
    entry.points.add(`${actor.x.toFixed(3)},${actor.y.toFixed(3)}`);
    byTile.set(key, entry);
  }
  return [...byTile.entries()]
    .sort((a, b) => b[1].prisoners + b[1].guards - (a[1].prisoners + a[1].guards))
    .map(
      ([tile, entry]) =>
        `tile(${tile}) ${entry.prisoners}P+${entry.guards}G on ${entry.points.size} distinct point(s)`,
    )
    .join(' | ');
}

test('act 2: a real stack on one tile, in pixels', async ({ page }) => {
  test.setTimeout(2_400_000);
  await installActorTee(page);
  await installTee(page);
  await openApp(page);

  // The shape #944 measured: many prisoners, several guards, a room whose
  // `anchorTile` collects everybody it houses and an arrival tile that
  // collects everybody it cannot.
  const origin = await buildAndPopulate(page, { beds: 6, admits: 22, guards: 6, label: 'act2' });
  await fastForwardToMax(page);
  await page.waitForTimeout(8000);

  const sample = await latestActors(page);
  console.log(`[act2] worker at tick ${sample?.tick}: ${sample?.actors.length} actor(s)`);
  console.log(`[act2] STACKS: ${stacks(sample)}`);
  console.log(
    `[act2] every actor: ${JSON.stringify(
      (sample?.actors ?? []).map((a) => `${a.population === 1 ? 'G' : 'P'}@${a.x.toFixed(3)},${a.y.toFixed(3)}`),
    )}`,
  );

  await look(page, '2-full-frame');
  await look(page, '2-the-block', tileBox(origin, { tx: 9, ty: 9 }, { tx: 21, ty: 21 }));
  await magnify(page, '2-cell-magnified', tileBox(origin, { tx: 12, ty: 12 }, { tx: 17, ty: 17 }), 4);

  // Every tile the worker says holds more than one actor, magnified on its own.
  const grouped = new Map<string, number>();
  for (const actor of sample?.actors ?? []) {
    const key = `${Math.floor(actor.x)},${Math.floor(actor.y)}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) {
    if (count < 2) continue;
    const [tx, ty] = key.split(',').map(Number);
    await magnify(
      page,
      `2-stack-of-${count}-at-${tx}-${ty}`,
      tileBox(origin, { tx: tx!, ty: ty! }, { tx: tx!, ty: ty! }, TILE),
      8,
    );
  }
  console.log(`[act2] counts: ${JSON.stringify(await latestCounts(page))}`);
});

/* ================================================================== */
/* act 3 — #942, a run of presses is a run                             */
/* ================================================================== */

/**
 * Presses a control `count` times as fast as the mouse can.
 *
 * `mode: 'resolved'` re-reads the control's box before every press, which is
 * what a player who is *looking at* the button does. `mode: 'fixed'` presses
 * the same physical point every time, which is what a player's hand does --
 * and the difference between the two is a finding in its own right, because
 * the Intake panel re-lays out while the run is in progress.
 */
async function fastRun(
  page: Page,
  selector: string,
  count: number,
  mode: 'resolved' | 'fixed',
): Promise<{ elapsedMs: number; onControl: number; offControl: number; firstMissAt: number; box: string }> {
  const handle = page.locator(selector);
  await expect(handle).toBeVisible();
  const first = await handle.boundingBox();
  if (first === null) throw new Error(`${selector} has no box`);
  let onControl = 0;
  let offControl = 0;
  let firstMissAt = -1;
  const started = Date.now();
  for (let index = 0; index < count; index += 1) {
    const box = mode === 'fixed' ? first : ((await handle.boundingBox()) ?? first);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // A press on a point the control no longer occupies submits nothing at
    // all, and has cost this repository three withdrawn findings.
    const hit = await page.evaluate(
      ({ px, py, sel }) => document.elementFromPoint(px, py)?.closest(sel) !== null,
      { px: x, py: y, sel: selector },
    );
    if (hit) onControl += 1;
    else {
      offControl += 1;
      if (firstMissAt < 0) firstMissAt = index;
    }
    await page.mouse.click(x, y);
  }
  return {
    elapsedMs: Date.now() - started,
    onControl,
    offControl,
    firstMissAt,
    box: `first box ${Math.round(first.x)},${Math.round(first.y)} ${Math.round(first.width)}x${Math.round(first.height)}`,
  };
}

async function submittedOfType(page: Page, type: string): Promise<number> {
  const commands = await sentCommands(page);
  return commands.filter((command) => command['type'] === type).length;
}

test('act 3: runs of Admit and Hire presses at every speed', async ({ page }) => {
  test.setTimeout(1_500_000);
  const consoleLines: string[] = [];
  page.on('console', (message) => {
    const text = message.text().replace(/\s+/g, ' ').slice(0, 200);
    if (/sequence|reject|refus|command/i.test(text)) consoleLines.push(`[${message.type()}] ${text}`);
  });
  await installTee(page);
  await openApp(page);

  /*
   * **One prison, zoned, before a single press.** The first shape of this act
   * pressed `Admit` on a bare fresh prison and got twenty-five refusals of
   * `no-room-to-hold-anybody` -- `src/main.ts:2911` throws before
   * `sender.submit`, so nothing reached the command sender at all and the act
   * measured the wrong refusal. `counts.rooms === 0` is the whole condition,
   * so one zoned cell is what the run needs to be about #942.
   */
  await buildAndPopulate(page, { beds: 6, admits: 0, guards: 0, label: 'act3' });
  console.log(`[act3] the prison the runs happen in: ${JSON.stringify(await latestCounts(page))}`);

  const transport = page.locator('.hud-strip__transport button');
  const pause = transport.nth(0);
  const play = transport.nth(1);
  const faster = transport.nth(2);

  const setSpeed = async (steps: number): Promise<void> => {
    await pause.click();
    await page.waitForTimeout(200);
    await play.click();
    await page.waitForTimeout(200);
    for (let step = 0; step < steps; step += 1) {
      await faster.click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1500);
  };

  /*
   * A warm-up run before any measurement, so every measured run starts from
   * the same panel layout. The Intake panel grows a "with no bed" warning the
   * moment the population passes `accommodationCapacity`, and a run that
   * crosses that boundary is measuring the layout change rather than the
   * command sender.
   */
  await setSpeed(0);
  await tab(page, 'overview').click();
  await fastRun(page, '.hud-intake__admit', 10, 'resolved');
  await page.waitForTimeout(5000);
  console.log(`[act3] after the warm-up: ${JSON.stringify(await latestCounts(page))}`);
  console.log(`[act3] intake panel after the warm-up: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

  for (const speed of [
    { steps: 0, label: '1x' },
    { steps: 1, label: '2x' },
    { steps: 2, label: '4x' },
    // Repeated in the opposite order, because the population grows through
    // the act and a single pass cannot separate speed from population.
    { steps: 2, label: '4x (again)' },
    { steps: 1, label: '2x (again)' },
    { steps: 0, label: '1x (again)' },
  ]) {
    await setSpeed(speed.steps);
    console.log(`[act3] --- ${speed.label}: clock says ${JSON.stringify(await currentClock(page))} ---`);

    await tab(page, 'overview').click();
    await page.waitForTimeout(300);
    const beforeAdmit = await submittedOfType(page, 'AdmitPrisoner');
    const beforeCounts = await latestCounts(page);
    const run = await fastRun(page, '.hud-intake__admit', 25, 'resolved');
    await page.waitForTimeout(6000);
    const afterAdmit = await submittedOfType(page, 'AdmitPrisoner');
    const afterCounts = await latestCounts(page);
    console.log(
      `[act3] ${speed.label} 25 Admit presses in ${run.elapsedMs}ms (${run.onControl} landed on the control,` +
        ` ${run.offControl} off it, ${run.box}) -> ${afterAdmit - beforeAdmit} AdmitPrisoner command(s) submitted` +
        ` | prisoners ${beforeCounts?.prisoners} -> ${afterCounts?.prisoners}` +
        ` (+${(afterCounts?.prisoners ?? 0) - (beforeCounts?.prisoners ?? 0)})`,
    );
    console.log(`[act3] ${speed.label} screen after the admit run: ${JSON.stringify(await say(page))}`);

    await tab(page, 'security').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    await page.waitForTimeout(300);
    const beforeHire = await submittedOfType(page, 'HireStaff');
    const beforeStaff = await latestCounts(page);
    const hireRun = await fastRun(page, '.hud-staff__hire', 8, 'resolved');
    await page.waitForTimeout(6000);
    const afterHire = await submittedOfType(page, 'HireStaff');
    const afterStaff = await latestCounts(page);
    console.log(
      `[act3] ${speed.label} 8 Hire presses in ${hireRun.elapsedMs}ms (${hireRun.onControl} on, ${hireRun.offControl} off)` +
        ` -> ${afterHire - beforeHire} HireStaff command(s) submitted` +
        ` | staff ${beforeStaff?.staff} -> ${afterStaff?.staff} (+${(afterStaff?.staff ?? 0) - (beforeStaff?.staff ?? 0)})` +
        ` | funds ${beforeStaff?.treasuryMinorUnits} -> ${afterStaff?.treasuryMinorUnits}`,
    );
  }

  /*
   * And the same run with the hand held still: twenty-five presses on the
   * point the control occupied when the run began. This is the gesture a
   * player actually makes, and it is a different measurement from the one
   * above.
   */
  await setSpeed(2);
  await tab(page, 'overview').click();
  await page.waitForTimeout(400);
  const fixedBefore = await submittedOfType(page, 'AdmitPrisoner');
  const fixedCounts = await latestCounts(page);
  const fixedRun = await fastRun(page, '.hud-intake__admit', 25, 'fixed');
  await page.waitForTimeout(6000);
  const fixedAfter = await submittedOfType(page, 'AdmitPrisoner');
  const fixedAfterCounts = await latestCounts(page);
  console.log(
    `[act3] FIXED-POINT 25 Admit presses at one point in ${fixedRun.elapsedMs}ms:` +
      ` ${fixedRun.onControl} of them were still on the control, ${fixedRun.offControl} were not` +
      ` (first miss at press ${fixedRun.firstMissAt}, ${fixedRun.box})` +
      ` -> ${fixedAfter - fixedBefore} AdmitPrisoner command(s)` +
      ` | prisoners ${fixedCounts?.prisoners} -> ${fixedAfterCounts?.prisoners}`,
  );

  const sequenceLines = consoleLines.filter((line) => /sequence/i.test(line));
  console.log(`[act3] === console lines mentioning a command sequence: ${sequenceLines.length} ===`);
  for (const line of sequenceLines.slice(0, 20)) console.log(`[act3]   ${line}`);
  const refusalLines = consoleLines.filter((line) => /refus|reject/i.test(line));
  console.log(`[act3] === console lines mentioning a refusal/rejection: ${refusalLines.length} ===`);
  for (const line of refusalLines.slice(0, 20)) console.log(`[act3]   ${line}`);
});

/**
 * Act 3b -- the run #942 is actually about, made from the state a *player*
 * starts one in: a prison that has just been built, nobody admitted yet, and
 * a hand that does not move between presses.
 *
 * Act 3 warms the prison up to a stable layout on purpose, because that is
 * the only way to ask the command sender's question alone. This act asks the
 * player's question instead, and the two answers differ.
 */
test('act 3b: a fixed-point run of Admit presses on a prison nobody has been admitted to', async ({ page }) => {
  test.setTimeout(1_200_000);
  await installTee(page);
  await openApp(page);
  await buildAndPopulate(page, { beds: 6, admits: 0, guards: 0, label: 'act3b' });
  const before = await latestCounts(page);
  console.log(`[act3b] the prison: ${JSON.stringify(before)}`);
  console.log(`[act3b] intake panel before a single press: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

  await tab(page, 'overview').click();
  await page.waitForTimeout(400);
  const handle = page.locator('.hud-intake__admit');
  const box = await handle.boundingBox();
  console.log(`[act3b] Admit sits at ${JSON.stringify(box)} before the run`);
  const beforeSubmitted = await submittedOfType(page, 'AdmitPrisoner');
  const run = await fastRun(page, '.hud-intake__admit', 25, 'fixed');
  await page.waitForTimeout(6000);
  const after = await latestCounts(page);
  console.log(
    `[act3b] 25 presses at one point in ${run.elapsedMs}ms: ${run.onControl} on the control, ${run.offControl} off it,` +
      ` first miss at press ${run.firstMissAt}` +
      ` -> ${(await submittedOfType(page, 'AdmitPrisoner')) - beforeSubmitted} AdmitPrisoner command(s)` +
      ` | prisoners ${before?.prisoners} -> ${after?.prisoners}`,
  );
  console.log(`[act3b] Admit sits at ${JSON.stringify(await handle.boundingBox())} after the run`);
  console.log(`[act3b] intake panel after: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  console.log(`[act3b] screen: ${JSON.stringify(await say(page))}`);
});

/* ================================================================== */
/* act 4 — #943, a new prison keeps the old one                        */
/* ================================================================== */

async function savePanel(page: Page): Promise<{ status: string; kind: string; detail: string; list: string; rows: string[] }> {
  return page.evaluate(() => {
    const status = document.querySelector<HTMLElement>('.save-panel__status');
    return {
      status: (status?.innerText ?? 'ABSENT').trim(),
      kind: status?.dataset['kind'] ?? 'ABSENT',
      detail: (document.querySelector<HTMLElement>('.save-panel__detail')?.innerText ?? 'ABSENT').trim(),
      list: (document.querySelector<HTMLElement>('.save-panel__list')?.innerText ?? 'ABSENT')
        .replace(/\n+/g, ' | ')
        .trim(),
      rows: [...document.querySelectorAll<HTMLElement>('.save-panel__item')].map(
        (item, index) =>
          `${index}: ${(item.querySelector<HTMLElement>('.save-panel__item-label')?.textContent ?? '').trim()}` +
          ` active=${item.getAttribute('data-active')} buttons=${[...item.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).join('/')}`,
      ),
    };
  });
}

/** Counts every dialog a player would have to answer, of any kind. */
function armDialogs(page: Page): { messages: string[] } {
  const messages: string[] = [];
  page.on('dialog', (dialog) => {
    messages.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });
  return { messages };
}

async function domDialogs(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"], .modal, [aria-modal="true"]').length,
  );
}

async function shape(page: Page): Promise<string> {
  const counts = await latestCounts(page);
  return JSON.stringify({
    tick: await currentTick(page),
    clock: await currentClock(page),
    prisoners: counts?.prisoners,
    rooms: counts?.rooms,
    staff: counts?.staff,
    funds: counts?.treasuryMinorUnits,
    accommodation: counts?.accommodationCapacity,
  });
}

test('act 4: New prison over unsaved play, and the Load sibling', async ({ page }) => {
  test.setTimeout(1_800_000);
  const dialogs = armDialogs(page);
  await installTee(page);
  await openApp(page);

  // Prison A, played to a real state, and **never saved by hand**.
  await buildAndPopulate(page, { beds: 3, admits: 5, guards: 2, label: 'act4' });
  await fastForwardToMax(page);
  await page.waitForTimeout(20_000);
  const beforeNew = await shape(page);
  console.log(`[act4] prison A before New prison :: ${beforeNew}`);
  console.log(`[act4] save panel before :: ${JSON.stringify(await savePanel(page))}`);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.waitForTimeout(3000);
  console.log(`[act4] DOM dialogs at the moment of pressing New prison: ${await domDialogs(page)}`);
  console.log(`[act4] native dialogs so far: ${JSON.stringify(dialogs.messages)}`);
  console.log(`[act4] prison B :: ${await shape(page)}`);
  const panelAfterNew = await savePanel(page);
  console.log(`[act4] save panel after New prison :: ${JSON.stringify(panelAfterNew)}`);

  // Back to prison A — the row that is not the active one.
  const rows = page.locator('.save-panel__item');
  const count = await rows.count();
  let loadedIndex = -1;
  for (let index = 0; index < count; index += 1) {
    if ((await rows.nth(index).getAttribute('data-active')) === 'true') continue;
    loadedIndex = index;
    break;
  }
  console.log(`[act4] loading row ${loadedIndex} of ${count}`);
  await rows.nth(loadedIndex).getByRole('button', { name: 'Load' }).click();
  await page.waitForTimeout(6000);
  const afterLoad = await shape(page);
  console.log(`[act4] prison A on the way back :: ${afterLoad}`);
  console.log(`[act4] === before New prison :: ${beforeNew}`);
  console.log(`[act4] === after coming back :: ${afterLoad}`);
  console.log(`[act4] save panel on the way back :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act4] strip on the way back :: ${JSON.stringify(await panelText(page, '.hud-strip'))}`);
  console.log(`[act4] screen on the way back :: ${JSON.stringify(await say(page))}`);
  console.log(`[act4] every dialog of the whole act: ${JSON.stringify(dialogs.messages)} + ${await domDialogs(page)} DOM dialog(s)`);
});

/**
 * Act 4b — the sibling the fix deliberately leaves alone: pressing **Load on
 * the prison that is already live**, over unsaved play.
 * `SessionController.loadPrison` captures the outgoing session only when the
 * prison being loaded is a *different* one
 * (`src/persistence/session/session-controller.ts`), so this row still
 * reverts. The question is only what a player is told before it does.
 */
test('act 4b: Load pressed on the prison already being played', async ({ page }) => {
  test.setTimeout(1_800_000);
  const dialogs = armDialogs(page);
  await installTee(page);
  await openApp(page);

  await buildAndPopulate(page, { beds: 3, admits: 5, guards: 2, label: 'act4b' });
  await fastForwardToMax(page);
  await page.waitForTimeout(20_000);
  const before = await shape(page);
  console.log(`[act4b] the live prison before pressing its own Load :: ${before}`);
  const panel = await savePanel(page);
  console.log(`[act4b] save panel :: ${JSON.stringify(panel)}`);

  const rows = page.locator('.save-panel__item');
  const count = await rows.count();
  let activeIndex = 0;
  for (let index = 0; index < count; index += 1) {
    if ((await rows.nth(index).getAttribute('data-active')) === 'true') activeIndex = index;
  }
  console.log(`[act4b] pressing Load on row ${activeIndex} (the active one) of ${count}`);
  await rows.nth(activeIndex).getByRole('button', { name: 'Load' }).click();
  await page.waitForTimeout(6000);
  const after = await shape(page);
  console.log(`[act4b] === before :: ${before}`);
  console.log(`[act4b] === after  :: ${after}`);
  console.log(`[act4b] dialogs: ${JSON.stringify(dialogs.messages)} + ${await domDialogs(page)} DOM dialog(s)`);
  console.log(`[act4b] save panel after :: ${JSON.stringify(await savePanel(page))}`);
  console.log(`[act4b] screen after :: ${JSON.stringify(await say(page))}`);
});

/* ================================================================== */
/* act 5 — #945, removing a standing object says so                    */
/* ================================================================== */

test('act 5: removing a standing bed, a pending one, and an occupied one', async ({ page }) => {
  test.setTimeout(1_800_000);
  await installTee(page);
  await openApp(page);

  /*
   * **A zoned room first, because a bed on bare ground is refused.** The
   * first shape of this act placed a bed on open world and read
   * *"The object was not placed -- it has to stand in a room you have
   * zoned."*, so nothing was ever standing to remove.
   */
  const origin = await buildAndPopulate(page, { beds: 3, admits: 3, guards: 0, label: 'act5' });
  await page.waitForTimeout(4000);
  console.log(`[act5] the prison: ${JSON.stringify(await latestCounts(page))}`);

  await tab(page, 'build').click();
  await buy(page, 'bed-wooden', 4);
  await page.waitForTimeout(8000);
  console.log(`[act5] after buying four more beds: ${JSON.stringify(await latestCounts(page))}`);

  const removeArmed = async (armed: boolean): Promise<void> => {
    await tab(page, 'build').click();
    const label = (await page.locator('.hud-build__remove').innerText()).trim().toLowerCase();
    const isArmed = label.startsWith('stop');
    if (isArmed !== armed) await page.locator('.hud-build__remove').click();
    await page.waitForTimeout(150);
  };
  const queue = async (): Promise<string> => (await panelText(page, '.hud-build__queue')).replace(/\n/g, ' ');
  const alerts = async (): Promise<readonly string[]> => (await say(page)).alerts;

  // --- 5a: an UNOCCUPIED STANDING object ------------------------------
  await armBuildable(page, 'bed-wooden');
  const spare = centreOf(origin, 13, 16);
  await press(page, spare.x, spare.y);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(4000);
  const built = await latestCounts(page);
  console.log(`[act5] 5a the bed IS standing: accommodationCapacity=${built?.accommodationCapacity} (was 3), queue=${JSON.stringify(await queue())}`);
  const alertsBefore5a = await alerts();

  await removeArmed(true);
  const removed = await press(page, spare.x, spare.y);
  await page.waitForTimeout(900);
  const afterRemove = await latestCounts(page);
  console.log(`[act5] 5a removal produced ${removed.length} command(s): ${JSON.stringify(removed)}`);
  console.log(
    `[act5] 5a accommodation ${built?.accommodationCapacity} -> ${afterRemove?.accommodationCapacity}` +
      ` | funds ${built?.treasuryMinorUnits} -> ${afterRemove?.treasuryMinorUnits}`,
  );
  const screen5a = await say(page);
  console.log(`[act5] 5a BAND: ${JSON.stringify(screen5a.band)}`);
  console.log(`[act5] 5a NEW ALERT ROWS: ${JSON.stringify(screen5a.alerts.filter((row) => !alertsBefore5a.includes(row)))}`);
  await removeArmed(false);

  /* --- 5b: a PENDING order, the sibling channel ------------------------
   *
   * **With the clock PAUSED, so the crew cannot finish the bed between the
   * two presses.** Two earlier shapes of this act failed here and both are
   * worth recording: one placed a single order and removed it a second later,
   * and at x4 the bed was already standing; the next placed eight orders
   * against what was left of the bought materials, and the materials were not
   * the constraint -- `accommodationCapacity` went 3 -> 8 inside the press
   * loop and the tile that was left over had never taken an order at all
   * (*"Nothing was removed -- there is no object on that tile, and none being
   * built there."*). Paused, no tick passes between the two commands, so the
   * order is provably still an order when the removal reaches it.
   */
  const transport = page.locator('.hud-strip__transport button');
  await transport.nth(0).click();
  await page.waitForTimeout(600);
  console.log(`[act5] 5b clock before the order: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);
  const alertsBefore5b = await alerts();
  await armBuildable(page, 'bed-wooden');
  const pendingTile = centreOf(origin, 16, 16);
  const ordered = await press(page, pendingTile.x, pendingTile.y);
  console.log(`[act5] 5b ordered a bed at (16,16) with the clock paused: ${JSON.stringify(ordered)}`);
  await removeArmed(true);
  const cancelled = await press(page, pendingTile.x, pendingTile.y);
  console.log(`[act5] 5b removal command with the clock still paused: ${JSON.stringify(cancelled)}`);
  const beforeResume = await latestCounts(page);
  await transport.nth(1).click();
  await page.waitForTimeout(4000);
  const afterPending = await latestCounts(page);
  console.log(
    `[act5] 5b accommodationCapacity ${beforeResume?.accommodationCapacity} -> ${afterPending?.accommodationCapacity}` +
      ` | queue after ${JSON.stringify(await queue())}`,
  );
  const screen5b = await say(page);
  console.log(`[act5] 5b BAND (sticky -- it keeps the last event): ${JSON.stringify(screen5b.band)}`);
  console.log(`[act5] 5b NEW ALERT ROWS: ${JSON.stringify(screen5b.alerts.filter((row) => !alertsBefore5b.includes(row)))}`);
  console.log(`[act5] 5b WHOLE ALERTS LIST: ${JSON.stringify(screen5b.alerts)}`);
  await removeArmed(false);
  await fastForwardToMax(page);

  // --- 5c: an OCCUPIED standing bed, with somewhere to move to ---------
  await waitForQueueEmpty(page);
  await page.waitForTimeout(4000);
  const beforeOccupied = await latestCounts(page);
  console.log(`[act5] 5c before: ${JSON.stringify(beforeOccupied)}`);
  const alertsBefore5c = await alerts();
  await removeArmed(true);
  const occupied = centreOf(origin, 12, 12);
  const removedOccupied = await press(page, occupied.x, occupied.y);
  console.log(`[act5] 5c removing the bed at (12,12): ${removedOccupied.length} command(s)`);
  const bands: string[] = [];
  for (let sample = 0; sample < 12; sample += 1) {
    const screen = await say(page);
    bands.push(`+${sample * 250}ms ${JSON.stringify(screen.band)}`);
    await page.waitForTimeout(250);
  }
  console.log(`[act5] 5c BAND over three seconds: ${bands.join(' | ')}`);
  const screen5c = await say(page);
  console.log(`[act5] 5c NEW ALERT ROWS: ${JSON.stringify(screen5c.alerts.filter((row) => !alertsBefore5c.includes(row)))}`);
  const afterOccupied = await latestCounts(page);
  console.log(
    `[act5] 5c accommodation ${beforeOccupied?.accommodationCapacity} -> ${afterOccupied?.accommodationCapacity}` +
      ` | occupants ${beforeOccupied?.roomOccupants} -> ${afterOccupied?.roomOccupants}`,
  );
  await removeArmed(false);

  // --- 5d: the same removal at 900x600, where `hud.css` drops the list --
  //
  // The origin measured at 1440x900 is re-used and then *checked*: the
  // `RemoveObject` command carries the tile it resolved to, so a camera that
  // moved on the resize shows up as the wrong tile rather than as a silent
  // wrong answer. An earlier shape re-calibrated here and could not: at
  // 900x600 `calibrate`'s probe found no point that answered with a
  // `RemoveObject` at all, which is recorded in the note as not reached.
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(1500);
  const alertsBefore5d = await alerts();
  await removeArmed(true);
  const target600 = centreOf(origin, 14, 12);
  const beforeSmall = await latestCounts(page);
  const removedSmall = await press(page, target600.x, target600.y);
  await page.waitForTimeout(1200);
  const afterSmall = await latestCounts(page);
  console.log(
    `[act5] 5d pressed the 1440x900 coordinates of tile (14,12) at 900x600: ${JSON.stringify(removedSmall)}` +
      ` | accommodationCapacity ${beforeSmall?.accommodationCapacity} -> ${afterSmall?.accommodationCapacity}`,
  );
  const screen5d = await say(page);
  console.log(`[act5] 5d BAND at 900x600: ${JSON.stringify(screen5d.band)}`);
  console.log(`[act5] 5d NEW ALERT ROWS: ${JSON.stringify(screen5d.alerts.filter((row) => !alertsBefore5d.includes(row)))}`);
  console.log(
    `[act5] 5d where a sentence can land at 900x600: ${await page.evaluate(() => {
      const laidOut = (selector: string): string => {
        const node = document.querySelector<HTMLElement>(selector);
        if (node === null) return 'ABSENT';
        return node.getClientRects().length > 0 ? 'laid out' : 'not laid out';
      };
      return `event band ${laidOut('.hud__event')} | alerts list ${laidOut('.hud-alerts__list')} | alerts panel ${laidOut('.hud-alerts')}`;
    })}`,
  );
});

/* ================================================================== */
/* act 6 — #926, the arm label stays in its box                        */
/* ================================================================== */

interface LabelReading {
  readonly control: string;
  readonly button: string;
  readonly label: string;
  readonly pastButtonPx: number;
  readonly overNeighbourPx: number;
  readonly rowHeight: number;
  readonly text: string;
}

async function measureArmLabel(page: Page): Promise<readonly LabelReading[]> {
  return page.evaluate(() => {
    const readings: LabelReading[] = [];
    interface LabelReading {
      control: string;
      button: string;
      label: string;
      pastButtonPx: number;
      overNeighbourPx: number;
      rowHeight: number;
      text: string;
    }
    for (const [rowSelector, armSelector, neighbourSelector] of [
      ['.hud-build__actions', '.hud-build__arm', '.hud-build__remove'],
      ['.hud-rooms__actions', '.hud-rooms__arm', '.hud-rooms__confirm'],
    ] as const) {
      const row = document.querySelector<HTMLElement>(rowSelector);
      const arm = document.querySelector<HTMLElement>(armSelector);
      const neighbour = document.querySelector<HTMLElement>(neighbourSelector);
      if (arm === null || arm.getClientRects().length === 0) continue;
      const label = arm.querySelector<HTMLElement>('.ui-action__label');
      if (label === null) continue;
      const buttonBox = arm.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const neighbourBox = neighbour?.getBoundingClientRect();
      readings.push({
        control: armSelector,
        button: `${Math.round(buttonBox.x)},${Math.round(buttonBox.y)} ${buttonBox.width.toFixed(1)}x${buttonBox.height.toFixed(1)}`,
        label: `${Math.round(labelBox.x)},${Math.round(labelBox.y)} ${labelBox.width.toFixed(1)}x${labelBox.height.toFixed(1)}`,
        pastButtonPx: Number((labelBox.right - buttonBox.right).toFixed(1)),
        overNeighbourPx:
          neighbourBox === undefined ? Number.NaN : Number((labelBox.right - neighbourBox.left).toFixed(1)),
        rowHeight: Number((row?.getBoundingClientRect().height ?? Number.NaN).toFixed(1)),
        text: (label.innerText ?? '').replace(/\s+/g, ' ').trim(),
      });
    }
    return readings;
  });
}

test('act 6: the arm label against its own button, at five viewports and in three states', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(600);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 900, height: 600 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    const size = `${viewport.width}x${viewport.height}`;

    await tab(page, 'build').click();
    await page.waitForTimeout(250);
    console.log(`[act6] ${size} build ARRIVAL   :: ${JSON.stringify(await measureArmLabel(page))}`);

    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    await page.locator('.hud-build__arm').click();
    await page.waitForTimeout(250);
    console.log(`[act6] ${size} build ARMED     :: ${JSON.stringify(await measureArmLabel(page))}`);
    await page.locator('.hud-build__arm').click();
    await page.waitForTimeout(150);

    await page.locator('.hud-build__remove').click();
    await page.waitForTimeout(250);
    console.log(`[act6] ${size} build REMOVING  :: ${JSON.stringify(await measureArmLabel(page))}`);
    await page.locator('.hud-build__remove').click();
    await page.waitForTimeout(150);

    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.waitForTimeout(250);
    console.log(`[act6] ${size} rooms ARRIVAL   :: ${JSON.stringify(await measureArmLabel(page))}`);

    // And a picture of the row, because "does it look wrong" is the question.
    await tab(page, 'build').click();
    await page.waitForTimeout(250);
    const box = await page.locator('.hud-build__actions').boundingBox();
    if (box !== null) {
      mkdirSync(SHOTS, { recursive: true });
      const shot = await page.screenshot({
        clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 },
        animations: 'disabled',
      });
      writeFileSync(`${SHOTS}/6-actions-row-${size}.png`, shot);
      console.log(`  [shot] 6-actions-row-${size}.png (${shot.length} bytes)`);
    }
  }
});
