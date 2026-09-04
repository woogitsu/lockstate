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

/** Presses a control `count` times as fast as the mouse can, with no waits between. */
async function fastRun(page: Page, selector: string, count: number): Promise<{ elapsedMs: number; box: string }> {
  const handle = page.locator(selector);
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (box === null) throw new Error(`${selector} has no box`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // The press has to land on the control and not on something covering it —
  // a press on a covered point submits nothing at all.
  const hit = await page.evaluate(
    ({ px, py, sel }) => {
      const node = document.elementFromPoint(px, py);
      return `${node?.tagName ?? 'none'}.${node?.className ?? ''} closest=${node?.closest(sel) === null ? 'NO' : 'yes'}`;
    },
    { px: x, py: y, sel: selector },
  );
  const started = Date.now();
  for (let index = 0; index < count; index += 1) {
    await page.mouse.click(x, y);
  }
  return { elapsedMs: Date.now() - started, box: `${Math.round(x)},${Math.round(y)} :: ${hit}` };
}

async function submittedOfType(page: Page, type: string): Promise<number> {
  const commands = await sentCommands(page);
  return commands.filter((command) => command['type'] === type).length;
}

test('act 3: runs of Admit and Hire presses at every speed', async ({ page }) => {
  test.setTimeout(900_000);
  const console_lines: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/sequence|rejected|refus|command/i.test(text)) console_lines.push(`[${message.type()}] ${text}`);
  });
  await installTee(page);
  await openApp(page);

  const transport = page.locator('.hud-strip__transport button');

  for (const [index, speed] of [
    { press: 1, label: '1x' },
    { press: 2, label: '2x' },
    { press: 2, label: '4x' },
  ].entries()) {
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.waitForTimeout(600);
    // Paused -> 1x -> 2x -> 4x, by pressing the transport the way a player does.
    await transport.nth(1).click();
    await page.waitForTimeout(200);
    for (let step = 0; step < index; step += 1) {
      await transport.nth(2).click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1500);
    console.log(`[act3] --- ${speed.label}: clock says ${JSON.stringify(await currentClock(page))} ---`);

    await tab(page, 'overview').click();
    const beforeAdmit = await submittedOfType(page, 'AdmitPrisoner');
    const run = await fastRun(page, '.hud-intake__admit', 25);
    await page.waitForTimeout(4000);
    const afterAdmit = await submittedOfType(page, 'AdmitPrisoner');
    const counts = await latestCounts(page);
    console.log(
      `[act3] ${speed.label} 25 Admit presses in ${run.elapsedMs}ms at ${run.box}` +
        ` -> ${afterAdmit - beforeAdmit} AdmitPrisoner command(s) submitted, worker says prisoners=${counts?.prisoners}`,
    );
    console.log(`[act3] ${speed.label} admit control disabled=${await page.locator('.hud-intake__admit').getAttribute('disabled')} aria-disabled=${await page.locator('.hud-intake__admit').getAttribute('aria-disabled')}`);
    console.log(`[act3] ${speed.label} screen after the run: ${JSON.stringify(await say(page))}`);

    await tab(page, 'security').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    const beforeHire = await submittedOfType(page, 'HireStaff');
    const hireRun = await fastRun(page, '.hud-staff__hire', 8);
    await page.waitForTimeout(4000);
    const afterHire = await submittedOfType(page, 'HireStaff');
    const hired = await latestCounts(page);
    console.log(
      `[act3] ${speed.label} 8 Hire presses in ${hireRun.elapsedMs}ms at ${hireRun.box}` +
        ` -> ${afterHire - beforeHire} HireStaff command(s) submitted, worker says staff=${hired?.staff}` +
        ` funds=${hired?.treasuryMinorUnits}`,
    );
    console.log(`[act3] ${speed.label} console lines so far: ${JSON.stringify(console_lines.slice(-8))}`);
  }
  console.log(`[act3] === every command-ish console line of the whole act (${console_lines.length}) ===`);
  for (const line of console_lines) console.log(`[act3]   ${line}`);
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

test('act 5: removing a standing bed, and removing a pending one', async ({ page }) => {
  test.setTimeout(1_200_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  console.log(`[act5] calibration: (${origin.originX}, ${origin.originY})`);

  const fundsAtStart = await latestCounts(page);
  console.log(`[act5] funds at start: ${fundsAtStart?.treasuryMinorUnits}`);
  await buy(page, 'bed-wooden', 3);
  const fundsAfterBuy = await latestCounts(page);
  console.log(`[act5] funds after buying 3 beds: ${fundsAfterBuy?.treasuryMinorUnits}`);
  await fastForwardToMax(page);
  await page.waitForTimeout(6000);
  console.log(`[act5] deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  // --- 5a: a STANDING object -----------------------------------------
  await armBuildable(page, 'bed-wooden');
  const standing = centreOf(origin, 14, 14);
  const placed = await press(page, standing.x, standing.y);
  console.log(`[act5] 5a placed a bed at (14,14): ${placed.length} command(s) ${JSON.stringify(placed)}`);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(3000);
  const fundsBuilt = await latestCounts(page);
  console.log(`[act5] 5a funds with the bed standing: ${fundsBuilt?.treasuryMinorUnits}`);
  console.log(`[act5] 5a screen before the removal: ${JSON.stringify(await say(page))}`);

  await tab(page, 'build').click();
  await page.locator('.hud-build__remove').click();
  const onPoint = await page.evaluate(
    ({ x, y }) => {
      const node = document.elementFromPoint(x, y);
      return `${node?.tagName ?? 'none'}#${(node as HTMLElement)?.id ?? ''}.${node?.className ?? ''}`;
    },
    standing,
  );
  console.log(`[act5] 5a what is under the removal press point: ${onPoint}`);
  const removed = await press(page, standing.x, standing.y);
  await page.waitForTimeout(1200);
  const fundsRemoved = await latestCounts(page);
  console.log(`[act5] 5a removal produced ${removed.length} command(s): ${JSON.stringify(removed)}`);
  console.log(
    `[act5] 5a funds ${fundsBuilt?.treasuryMinorUnits} -> ${fundsRemoved?.treasuryMinorUnits}` +
      ` (${(fundsRemoved?.treasuryMinorUnits ?? 0) - (fundsBuilt?.treasuryMinorUnits ?? 0)})`,
  );
  console.log(`[act5] 5a THE SCREEN RIGHT AFTER: ${JSON.stringify(await say(page))}`);
  // The band holds a sentence for a floor of 600ms; read it again a moment
  // later so a sentence that arrived and was displaced is distinguishable
  // from one that was never said.
  await page.waitForTimeout(2500);
  console.log(`[act5] 5a the screen 2.5s later: ${JSON.stringify(await say(page))}`);
  await page.locator('.hud-build__remove').click();

  // --- 5b: a PENDING order, the sibling channel ------------------------
  await armBuildable(page, 'bed-wooden');
  const pending = centreOf(origin, 16, 14);
  const ordered = await press(page, pending.x, pending.y);
  console.log(`[act5] 5b ordered a bed at (16,14): ${ordered.length} command(s)`);
  await page.waitForTimeout(300);
  const fundsOrdered = await latestCounts(page);
  console.log(`[act5] 5b queue right after the order: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  await tab(page, 'build').click();
  await page.locator('.hud-build__remove').click();
  const cancelled = await press(page, pending.x, pending.y);
  await page.waitForTimeout(1200);
  const fundsCancelled = await latestCounts(page);
  console.log(`[act5] 5b removal of a pending order produced ${cancelled.length} command(s): ${JSON.stringify(cancelled)}`);
  console.log(
    `[act5] 5b funds ${fundsOrdered?.treasuryMinorUnits} -> ${fundsCancelled?.treasuryMinorUnits}` +
      ` (${(fundsCancelled?.treasuryMinorUnits ?? 0) - (fundsOrdered?.treasuryMinorUnits ?? 0)})`,
  );
  console.log(`[act5] 5b THE SCREEN RIGHT AFTER: ${JSON.stringify(await say(page))}`);
  await page.locator('.hud-build__remove').click();

  // --- 5c: the same standing removal at a short viewport ---------------
  // `hud.css` drops the alerts list below 720px, so the event band is the
  // only place the sentence can land there.
  await armBuildable(page, 'bed-wooden');
  const third = centreOf(origin, 12, 14);
  await press(page, third.x, third.y);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(3000);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(800);
  const origin600 = await (async () => {
    await tab(page, 'build').click();
    return calibrate(page, { x: 400, y: 300 }, 16);
  })();
  const thirdAt600 = centreOf(origin600, 12, 14);
  await tab(page, 'build').click();
  await page.locator('.hud-build__remove').click();
  const removedSmall = await press(page, thirdAt600.x, thirdAt600.y);
  await page.waitForTimeout(1200);
  console.log(`[act5] 5c at 900x600 the removal produced ${removedSmall.length} command(s): ${JSON.stringify(removedSmall)}`);
  console.log(`[act5] 5c THE SCREEN AT 900x600: ${JSON.stringify(await say(page))}`);
  console.log(
    `[act5] 5c alerts list laid out at 900x600: ${await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.hud-alerts__list');
      return list === null ? 'ABSENT' : String(list.getClientRects().length > 0);
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
