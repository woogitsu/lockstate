import { expect, type Page } from '@playwright/test';

export const APP_URL = '/index.html';
export const TILE = 64;

interface TeeWindow {
  lockstateSentToWorker?: unknown[];
  lockstateFromWorker?: unknown[];
}

export async function installCommandTee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    class CommandTeeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          received.push(event.data);
        });
      }
      public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        sent.push(message);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = CommandTeeWorker as unknown as typeof Worker;
    (window as unknown as TeeWindow).lockstateSentToWorker = sent;
    (window as unknown as TeeWindow).lockstateFromWorker = received;
  });
}

export async function sentCommands(page: Page): Promise<readonly Record<string, unknown>[]> {
  return page.evaluate(() =>
    ((window as unknown as TeeWindow).lockstateSentToWorker ?? [])
      .map((m) => m as { kind?: string; payload?: { command?: { data?: Record<string, unknown> } } })
      .filter((m) => m.kind === 'simulation/submit-command')
      .map((m) => m.payload?.command?.data ?? {}),
  );
}

export async function workerReplies(page: Page): Promise<readonly unknown[]> {
  return page.evaluate(() =>
    ((window as unknown as TeeWindow).lockstateFromWorker ?? []).filter((m) => {
      const kind = (m as { kind?: string }).kind ?? '';
      return kind !== 'simulation/delta' && kind !== 'simulation/snapshot' && kind !== 'simulation/projection';
    }),
  );
}

export async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
}

export async function panelText(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const node = document.querySelector<HTMLElement>(sel);
    if (node === null) return `${sel}: ABSENT`;
    if (node.hidden || node.getClientRects().length === 0) return `${sel}: not laid out`;
    return (node.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
  }, selector);
}

/**
 * Print the CONTAINER, not the parts. #569's retraction: a survey that
 * enumerates known regions cannot find a message in a region it did not know
 * about.
 */
export async function dumpHud(page: Page, label: string): Promise<string> {
  const snapshot = await page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    const refusal = document.querySelector<HTMLElement>('.hud__refusal');
    const rect = (n: HTMLElement | null) => {
      if (n === null) return null;
      const r = n.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    };
    return {
      hudText: hud === null ? 'NO .hud' : (hud.innerText ?? '').replace(/\n{2,}/g, '\n').trim(),
      refusal: refusal === null ? 'ABSENT' : { hidden: refusal.hidden, box: rect(refusal), text: refusal.innerText },
      event: (() => {
        const e = document.querySelector<HTMLElement>('.hud__event');
        return e === null ? 'ABSENT' : { hidden: e.hidden, box: rect(e), text: e.innerText };
      })(),
    };
  });
  console.log(`\n########## HUD @ ${label} ##########`);
  console.log(snapshot.hudText);
  console.log(`--- .hud__refusal: ${JSON.stringify(snapshot.refusal)}`);
  console.log(`--- .hud__event:   ${JSON.stringify(snapshot.event)}`);
  return snapshot.hudText;
}

export async function isWorld(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(({ px, py }) => document.elementFromPoint(px, py)?.tagName.toLowerCase() === 'canvas', {
    px: x,
    py: y,
  });
}

export async function press(page: Page, x: number, y: number): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(120);
  return (await sentCommands(page)).slice(before);
}

export async function drag(
  page: Page,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 8 });
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(200);
  return (await sentCommands(page)).slice(before);
}

export interface Origin {
  originX: number;
  originY: number;
}

/** Derived, then CHECKED against a real RemoveObject press. */
export async function calibrate(page: Page): Promise<Origin> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  const originX = Math.round(viewport.width / 2 - 1024);
  const originY = Math.round(viewport.height / 2 - 1024);
  await page.locator('.hud-build__remove').click();
  const probe = { x: originX + 16 * TILE + TILE / 2, y: originY + 16 * TILE + TILE / 2 };
  const commands = await press(page, probe.x, probe.y);
  const removal = commands.find((c) => c['type'] === 'RemoveObject');
  await page.locator('.hud-build__remove').click();
  if (removal === undefined) throw new Error(`calibration press produced no RemoveObject: ${JSON.stringify(commands)}`);
  expect({ x: removal['x'], y: removal['y'] }, 'calibration rule (viewport/2 - 1024) disagrees with the page').toEqual({
    x: 16,
    y: 16,
  });
  return { originX, originY };
}

export const centreOf = (o: Origin, tx: number, ty: number) => ({
  x: o.originX + tx * TILE + TILE / 2,
  y: o.originY + ty * TILE + TILE / 2,
});

export const cornerOf = (o: Origin, tx: number, ty: number) => ({
  x: o.originX + tx * TILE,
  y: o.originY + ty * TILE,
});

export function attachConsole(page: Page): string[] {
  const lines: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'debug') return;
    const text = message.text();
    if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
    lines.push(`[${message.type()}] ${text}`);
  });
  page.on('pageerror', (error) => lines.push(`[pageerror] ${error.message}`));
  return lines;
}

export async function armBuild(page: Page, buildable: string): Promise<void> {
  await page.locator(`.hud-build__list [data-buildable="${buildable}"]`).click();
  const label = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
  if (label.startsWith('place') || label.startsWith('draw')) await page.locator('.hud-build__arm').click();
}

/** Four wall runs around [x0,y0]..[x1,y1] inclusive tiles. */
export async function wallBox(page: Page, o: Origin, x0: number, y0: number, x1: number, y1: number): Promise<void> {
  const north = o.originY + y0 * TILE;
  const south = o.originY + (y1 + 1) * TILE;
  const west = o.originX + x0 * TILE;
  const east = o.originX + (x1 + 1) * TILE;
  await drag(page, { x: west + TILE / 2, y: north }, { x: east - TILE / 2, y: north });
  await drag(page, { x: west + TILE / 2, y: south }, { x: east - TILE / 2, y: south });
  await drag(page, { x: west, y: north + TILE / 2 }, { x: west, y: south - TILE / 2 });
  await drag(page, { x: east, y: north + TILE / 2 }, { x: east, y: south - TILE / 2 });
}

/** The tab strip, by data attribute — `getByRole('button', {name})` collides with section headers. */
export async function tab(page: import('@playwright/test').Page, id: 'overview' | 'build' | 'rooms' | 'security' | 'regime'): Promise<void> {
  await page.locator(`.hud__tabs [data-tab="${id}"]`).click();
  await page.waitForTimeout(250);
}
