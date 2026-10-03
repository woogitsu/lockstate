import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { pendingWallGuardsSave } from './fixtures/pending-wall-guards';

const requirePlaywright = createRequire(createRequire(import.meta.url).resolve('@playwright/test/package.json'));
const { PNG } = requirePlaywright('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } };
};
const wallCatalog = JSON.parse(readFileSync(new URL('../../public/game-content/oblique-square-brick-full-wall.v1.json', import.meta.url), 'utf8')) as {
  frames: { yawDegrees: number; elevationDegrees: number; image: string }[];
};
interface Guard { id: number; x: number; y: number; vx: number; vy: number }
interface Snapshot {
  construction: { orders: { definitionId: string; location: { x: number; y: number }; state: string; footprint?: string }[] };
  simulation: { security: { guards: { records: [number, { tileX: number; tileY: number }][] } } };
  identity: unknown;
}
interface Probe {
  guards: Guard[];
  snapshot: () => Promise<Snapshot>;
  mapClick?: { fx: number; fy: number; trusted: boolean };
  canvasClicks: { x: number; y: number; trusted: boolean }[];
}

async function installProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Original = Worker;
    let active: Worker | undefined;
    const replies = new Map<string, (data: Snapshot) => void>();
    const probe: Probe = { guards: [], canvasClicks: [], snapshot: () => new Promise((resolve, reject) => {
      if (!active) { reject(Error('Actual simulation worker missing')); return; }
      const messageId = crypto.randomUUID();
      const timer = setTimeout(() => { replies.delete(messageId); reject(Error('Actual snapshot exceeded existing10s budget')); }, 10000);
      replies.set(messageId, data => { clearTimeout(timer); resolve(data); });
      active.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
    }) };
    class ObservedWorker extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); active = this;
        this.addEventListener('message', event => {
          const message = event.data as { kind?: string; replyTo?: string; payload?: { snapshot?: { data: Snapshot }; delta?: { data: ArrayBuffer } } };
          if (message.replyTo && message.payload?.snapshot) {
            replies.get(message.replyTo)?.(message.payload.snapshot.data); replies.delete(message.replyTo);
          }
          const buffer = message.kind === 'simulation/delta' ? message.payload?.delta?.data : undefined;
          if (!(buffer instanceof ArrayBuffer)) return;
          const view = new DataView(buffer);
          // Current ADR0040 layout4: six header words, five per actor. Observe
          // real wire coordinates; never fabricate or replace a render frame.
          if (view.getUint32(0, true) !== 4) throw Error('Unexpected actual render delta layout');
          const guards: Guard[] = [];
          for (let record = 0; record < view.getUint32(8, true); record++) {
            const offset = (6 + record * 5) * 4;
            if ((view.getUint32(offset + 4, true) & 255) !== 1) continue;
            guards.push({ id: view.getUint32(offset, true), x: view.getInt32(offset + 8, true) / 256,
              y: view.getInt32(offset + 12, true) / 256, vx: view.getInt16(offset + 16, true), vy: view.getInt16(offset + 18, true) });
          }
          if (guards.length > 0) probe.guards = guards;
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ObservedWorker as unknown as typeof Worker;
    (window as unknown as { pendingWallProbe: Probe }).pendingWallProbe = probe;
    window.addEventListener('click', event => {
      const target = event.target as Element | null;
      if (target?.matches('#game-root canvas')) probe.canvasClicks.push({ x: event.clientX, y: event.clientY, trusted: event.isTrusted });
      const map = target?.closest('.hud-minimap__surface');
      if (!map) return;
      const box = map.getBoundingClientRect();
      probe.mapClick = { fx: (event.clientX - box.x) / box.width, fy: (event.clientY - box.y) / box.height, trusted: event.isTrusted };
    }, true);
  });
}

function pixels(png: Buffer, yaw: number, target: { x: number; y: number }) {
  const image = PNG.sync.read(png);
  if (image.width !== 1920 || image.height !== 1080) throw Error('Native FullHD canvas dimensions changed');
  const radians = yaw * Math.PI / 180;
  // Independent physical projection: native default zoom1.25, tile64,
  // elevation45. Ground target comes solely from trusted public minimap click.
  const project = (x: number, y: number) => ({
    x: 960 + (Math.cos(radians) * (x - target.x) - Math.sin(radians) * (y - target.y)) * 80,
    y: 540 + (Math.sin(radians) * (x - target.x) + Math.cos(radians) * (y - target.y)) * Math.SQRT1_2 * 80,
  });
  const bodies = [19, 21].map(y => {
    const foot = project(20.5, y + .5);
    let orange = 0, blue = 0;
    for (let py = Math.floor(foot.y) - 10; py < Math.floor(foot.y) - 3; py++)
      for (let px = Math.floor(foot.x) - 4; px < Math.floor(foot.x) + 4; px++) {
        if (px < 0 || py < 0 || px >= image.width || py >= image.height) throw Error('Actor probe outside native capture');
        const at = (py * image.width + px) * 4;
        if (image.data[at + 3] !== 255) throw Error('Native actor capture must be opaque');
        const [r, g, b] = [image.data[at]!, image.data[at + 1]!, image.data[at + 2]!];
        if (Math.abs(r - 221) < 8 && Math.abs(g - 131) < 8 && Math.abs(b - 66) < 8) orange++;
        // Authored guard's blue uniform, inspected in the real source PNG.
        // Brown ground/fallback brick and neutral masonry cannot satisfy it.
        if (b > r + 10 && b > g + 8 && b < 160) blue++;
      }
    return { y, foot, orange, blue, body: orange + blue };
  });
  let masonry = 0;
  for (let y = 450; y < 580; y++) for (let x = 900; x < 1020; x++) {
    if (bodies.some(body => Math.abs(x - body.foot.x) < 32)) continue;
    const at = (y * image.width + x) * 4;
    const [r, g, b] = [image.data[at]!, image.data[at + 1]!, image.data[at + 2]!];
    if (r >= 125 && r <= 240 && Math.abs(r - g) < 9 && Math.abs(g - b) < 9) masonry++;
  }
  return { bodies, masonry };
}

for (const yaw of [0, 180]) test(`actual loaded guard stays behind pending whole-square wall at yaw${yaw}`, async ({ page }, info) => {
  const save = pendingWallGuardsSave();
  await installTee(page); await installProbe(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles({ name: 'pending-wall-guards.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
  await page.locator('.save-panel__item').getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.locator('.hud-build__arm').click();
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw Error('Native canvas missing');
  const point = { x: box.x + box.width / 2 + 9 * Math.SQRT1_2 * 80, y: box.y + box.height / 2 };
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, point)).toBe('CANVAS');
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceBuildOrder').length).toBe(1);
  expect((await sentCommands(page)).filter(command => command.type === 'PlaceBuildOrder')).toEqual([
    expect.objectContaining({ definitionId: 'wall-brick', x: 20, y: 20, footprint: 'square' }),
  ]);
  await expect(page.locator('.hud-build')).toHaveAttribute('data-queued', '1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('.hud-build').getAttribute('data-queued') ?? 0)).toBe(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const snapshot = await page.evaluate(() => (window as unknown as { pendingWallProbe: Probe }).pendingWallProbe.snapshot());
  expect(snapshot.construction.orders.filter(order => order.location.x === 20 && order.location.y === 20)).toEqual([
    expect.objectContaining({ definitionId: 'wall-brick', state: 'completed', footprint: 'square' }),
  ]);
  expect(snapshot.identity).toEqual(save.payload.identity);
  expect(snapshot.simulation.security.guards.records.map(([id, record]) => [id, record.tileX, record.tileY])).toEqual([[0, 20, 19], [1, 20, 21]]);
  expect(await page.evaluate(() => (window as unknown as { pendingWallProbe: Probe }).pendingWallProbe.guards))
    .toEqual([{ id: 0, x: 20, y: 19, vx: 0, vy: 0 }, { id: 1, x: 20, y: 21, vx: 0, vy: 0 }]);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const map = page.locator('.hud-minimap__surface');
  const mapBox = await map.boundingBox();
  if (!mapBox) throw Error('Native minimap missing');
  await map.click({ position: { x: mapBox.width * 20.5 / 32, y: mapBox.height * 20.5 / 32 } });
  const click = await page.evaluate(() => (window as unknown as { pendingWallProbe: Probe }).pendingWallProbe.mapClick);
  expect(click?.trusted).toBe(true);
  if (!click) throw Error('Trusted minimap event missing');
  const target = { x: click.fx * 32, y: click.fy * 32 };
  const frame = wallCatalog.frames.find(frame => frame.yawDegrees === (yaw === 180 ? -180 : 0) && frame.elevationDegrees === 45);
  if (!frame) throw Error('Supported current wall frame missing');
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let held = false, completed = false;
  let routeSettled: Promise<void> = Promise.resolve();
  const matcher = '**' + frame.image;
  await page.route(matcher, route => {
    held = true;
    routeSettled = (async () => { await released; await route.continue(); })();
    return routeSettled;
  });
  page.on('requestfinished', request => { if (new URL(request.url()).pathname === frame.image) completed = true; });
  try {
    // -45°→0° or -45°→-180°, always real buttons. Only final wall PNG is held.
    for (let i = 0; i < (yaw === 0 ? 3 : 9); i++) await page.getByRole('button', { name: yaw === 0 ? 'Rotate camera right' : 'Rotate camera left', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    expect(completed).toBe(false);
    const rear = yaw === 0 ? 0 : 1, front = 1 - rear;
    // Front control prevents a missing/delayed actor from giving a false zero.
    await expect.poll(async () => pixels(await canvas.screenshot(), yaw, target).bodies[front]!.body).toBeGreaterThan(10);
    const pendingPng = await canvas.screenshot();
    const pending = pixels(pendingPng, yaw, target);
    await info.attach('pending-wall-canvas', { body: pendingPng, contentType: 'image/png' });
    await info.attach('pending-depth-before-assertions', { body: Buffer.from(JSON.stringify({ yaw, target, pending, frame, held, completed })), contentType: 'application/json' });
    expect(pending.bodies[rear]!.body, 'actual foreground fallback wall must cover rear guard lower torso').toBe(0);
    expect(pending.bodies[front]!.body, 'front guard must remain visible in same pending frame').toBeGreaterThan(10);
    expect(pending.masonry, 'held frame must still use brown fallback, not cached loaded masonry').toBe(0);
    release();
    await expect.poll(() => completed).toBe(true);
    // Network completion alone is insufficient: native authored material and
    // actor must have repainted after the real loader COMPLETE callback.
    await expect.poll(async () => pixels(await canvas.screenshot(), yaw, target).masonry).toBeGreaterThan(200);
    const loadedPng = await canvas.screenshot();
    const loaded = pixels(loadedPng, yaw, target);
    await info.attach('loaded-wall-canvas', { body: loadedPng, contentType: 'image/png' });
    expect(loaded.bodies[rear]!.body).toBe(0);
    expect(loaded.bodies[front]!.blue).toBeGreaterThan(10);
    expect(loaded.bodies[front]!.orange).toBe(0);
    await info.attach('actual-depth-evidence', { body: Buffer.from(JSON.stringify({ yaw, target, pending, loaded, snapshot, guards: await page.evaluate(() => (window as unknown as { pendingWallProbe: Probe }).pendingWallProbe.guards), clicks: await page.evaluate(() => (window as unknown as { pendingWallProbe: Probe }).pendingWallProbe.canvasClicks), held, completed, frame, commands: await sentCommands(page) }, null, 2)), contentType: 'application/json' });
    expect(await sentCommands(page), 'loading/framing must never add simulation commands').toEqual([
      expect.objectContaining({ type: 'PlaceBuildOrder', definitionId: 'wall-brick', x: 20, y: 20, footprint: 'square' }),
    ]);
    expect(await page.evaluate(() => (window as unknown as { pendingWallProbe: Probe }).pendingWallProbe.canvasClicks.every(click => click.trusted))).toBe(true);
  } finally {
    release();
    // A failed depth assertion also releases the genuine held request. Wait
    // for its handler before unroute can auto-continue it a second time.
    await routeSettled;
    await page.unroute(matcher);
  }
});

