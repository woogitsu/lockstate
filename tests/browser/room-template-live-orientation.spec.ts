import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

interface Target { templateId: string; origin: { x: number; y: number }; quarterTurns?: number; mirrorX?: boolean }
interface PreflightProbe {
  origin?: { x: number; y: number };
  hold: boolean;
  pending: Target[];
  replies: Array<{ target: Target; verdict: { ok: boolean } }>;
  release(index: number): void;
}

async function installPreflightProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const targets = new Map<string, Target>();
    const releases: Array<() => void> = [];
    const state: PreflightProbe = {
      hold: false, pending: [], replies: [],
      release(index) { releases[index]!(); },
    };
    class ObservedWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const reply = event.data as { kind?: string; replyTo?: string; payload?: { view?: { data?: { ok: boolean } } } };
          const target = reply.replyTo === undefined ? undefined : targets.get(reply.replyTo);
          if (target !== undefined && reply.kind === 'simulation/projection' && reply.payload?.view?.data !== undefined) {
            state.replies.push({ target, verdict: reply.payload.view.data });
          }
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const request = message as { messageId?: string; payload?: { projectionId?: string; target?: Target } };
        const target = request.payload?.target;
        if (request.payload?.projectionId === 'world/room-template-preflight' && target !== undefined) {
          targets.set(request.messageId!, target);
          if (state.hold && target.templateId === 'cell-row-four'
            && target.origin.x === state.origin?.x && target.origin.y === state.origin.y) {
            state.pending.push(target);
            releases.push(() => super.postMessage(message));
            return;
          }
        }
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    window.Worker = ObservedWorker as typeof Worker;
    (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight = state;
  });
}

async function latestWorldTarget(page: Page): Promise<Target> {
  return page.evaluate(() => {
    const replies = (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight.replies;
    return replies.filter(reply => reply.target.origin.x !== 0 || reply.target.origin.y !== 0).at(-1)!.target;
  });
}

async function ghostGeometry(page: Page) {
  return page.locator('.room-template-world-ghost polygon').evaluateAll(polygons => {
    const points = (polygon: Element) => polygon.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
    const first = points(polygons[0]!);
    const a = [first[1]![0]! - first[0]![0]!, first[1]![1]! - first[0]![1]!];
    const b = [first[3]![0]! - first[0]![0]!, first[3]![1]! - first[0]![1]!];
    const determinant = a[0]! * b[1]! - a[1]! * b[0]!;
    const tiles = polygons.map(polygon => {
      const p = points(polygon)[0]!;
      const dx = p[0]! - first[0]![0]!, dy = p[1]! - first[0]![1]!;
      return { x: Math.round((dx * b[1]! - dy * b[0]!) / determinant), y: Math.round((a[0]! * dy - a[1]! * dx) / determinant), fill: polygon.getAttribute('fill') };
    });
    return {
      width: Math.max(...tiles.map(tile => tile.x)) + 1,
      height: Math.max(...tiles.map(tile => tile.y)) + 1,
      fixtures: tiles.filter(tile => tile.fill === '#a794e3').map(tile => `${tile.x},${tile.y}`).sort(),
      doors: tiles.filter(tile => tile.fill === '#e9bc52').map(tile => `${tile.x},${tile.y}`).sort(),
    };
  });
}

test('native orientation edits keep an armed origin, complete fixtures and latest real preflight after refusal', async ({ page }, testInfo) => {
  await installTee(page);
  await installPreflightProbe(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const open = page.getByRole('button', { name: 'Room plans', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  const rotation = dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' });
  const mirror = dialog.getByRole('checkbox', { name: 'Mirror horizontally before rotation' });
  await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(880, 380);
  const ghost = page.locator('.room-template-world-ghost');
  const label = ghost.getByRole('status');
  const rowQuote = 'Brick × 112 · Wood Plank × 8 · Materials catalogue value: 5,000';
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  const chosen = (await latestWorldTarget(page)).origin;
  await expect(label).toContainText(rowQuote);

  // All following controls use keyboard focus. The map pointer stays at its
  // original physical position, including while a real obstacle is queued.
  await open.focus(); await open.press('Enter');
  const basic = dialog.getByRole('button', { name: 'Basic cell', exact: true });
  await basic.focus(); await basic.press('Enter');
  const advanced = dialog.getByText('Enter coordinates', { exact: true });
  await advanced.focus(); await advanced.press('Enter');
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill(String(chosen.x + 12));
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(chosen.y + 1));
  const place = dialog.getByRole('button', { name: 'Place room plan', exact: true });
  await expect(place).toBeEnabled();
  await place.focus(); await place.press('Enter');
  await expect(dialog.getByRole('status')).toContainText('submitted');
  const row = dialog.getByRole('button', { name: 'Four-cell row', exact: true });
  await row.focus(); await row.press('Enter');
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await rotation.focus(); await rotation.press('ArrowDown');
  await expect(rotation).toHaveValue('1');
  await expect(ghost).toHaveAttribute('data-ready', 'blocked');
  await expect.poll(() => page.evaluate(origin => {
    return (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight.replies.some(reply =>
      reply.target.origin.x === origin.x && reply.target.origin.y === origin.y
      && reply.target.quarterTurns === 1 && !reply.verdict.ok);
  }, chosen)).toBe(true);

  await page.evaluate(origin => {
    const probe = (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight;
    probe.origin = origin; probe.hold = true;
  }, chosen);
  await mirror.focus(); await mirror.press('Space');
  await expect(mirror).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight.pending.length)).toBe(1);
  await expect(ghost).toHaveAttribute('data-ready', 'checking');
  await expect(label).not.toContainText('This footprint is blocked.');
  await expect(label).not.toContainText('Materials catalogue value:');
  await expect.poll(() => ghostGeometry(page)).toEqual({
    width: 16, height: 7,
    fixtures: ['13,5', '14,5', '13,2', '14,2', '1,5', '2,5', '1,2', '2,2', '11,4', '11,1', '4,4', '4,1'].sort(),
    doors: ['9,5', '9,2', '6,5', '6,2'].sort(),
  });
  await rotation.focus(); await rotation.press('ArrowDown');
  await expect(rotation).toHaveValue('2');
  await expect.poll(() => page.evaluate(() => (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight.pending.length)).toBe(2);
  const pending = await page.evaluate(() => (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight.pending);
  expect(pending).toMatchObject([
    { origin: chosen, quarterTurns: 1, mirrorX: true },
    { origin: chosen, quarterTurns: 2, mirrorX: true },
  ]);
  console.log('LIVE_ROOM_ORIENTATION retainedOrigin', JSON.stringify(chosen), 'heldTargets', JSON.stringify(pending));
  await expect(ghost).toHaveAttribute('data-ready', 'checking');
  await expect(ghost.locator('polygon')).toHaveCount(112);
  await page.evaluate(() => (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight.release(1));
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await expect(label).toContainText(rowQuote);
  await expect.poll(() => ghostGeometry(page)).toEqual({
    width: 7, height: 16,
    fixtures: ['1,13', '1,14', '4,13', '4,14', '1,1', '1,2', '4,1', '4,2', '2,11', '5,11', '2,4', '5,4'].sort(),
    doors: ['1,9', '4,9', '1,6', '4,6'].sort(),
  });
  await page.evaluate(() => (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight.release(0));
  await expect.poll(() => page.evaluate(origin => {
    const replies = (window as unknown as { orientationPreflight: PreflightProbe }).orientationPreflight.replies;
    return replies.filter(reply => reply.target.mirrorX && reply.target.origin.x === origin.x && reply.target.origin.y === origin.y).map(reply => ({ turn: reply.target.quarterTurns, ok: reply.verdict.ok }));
  }, chosen)).toEqual([{ turn: 2, ok: true }, { turn: 1, ok: false }]);
  // Wait for the same frames that paint worker results; observing the reply
  // alone would miss an obsolete promise repaint on the next animation frame.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await expect(label).not.toContainText('This footprint is blocked.');
  await expect(label).toContainText(rowQuote);
  const close = dialog.getByRole('button', { name: 'Close plans', exact: true });
  await close.focus(); await close.press('Enter');
  await expect(dialog).toBeHidden();
  await expect.poll(() => ghost.locator('polygon').evaluateAll(polygons => {
    const left = Math.max(document.querySelector('.hud__tabs')!.getBoundingClientRect().right, document.querySelector('.hud__corner')!.getBoundingClientRect().right) + 7;
    const right = document.querySelector('.hud__rail')!.getBoundingClientRect().left - 7;
    const top = document.querySelector('.hud-strip')!.getBoundingClientRect().bottom + 7;
    return polygons.every(p => { const r = p.getBoundingClientRect(); return r.left >= left && r.right <= right && r.top >= top && r.bottom <= innerHeight - 7; });
  })).toBe(true);
  expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toMatchObject([
    { templateId: 'cell-basic', origin: { x: chosen.x + 12, y: chosen.y + 1 } },
  ]);
  await page.screenshot({ path: testInfo.outputPath('live-native-orientation-after-refusal.png') });
});
