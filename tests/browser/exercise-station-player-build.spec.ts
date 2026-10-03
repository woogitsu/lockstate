import { expect, test } from './network-changed-fixture';
import type { Page } from './network-changed-fixture';
interface StationProbeWindow extends Window { lockstateAsk?: (kind: string, payload: unknown) => Promise<unknown>; lockstateSentToWorker?: unknown[]; lockstateFromWorker?: unknown[]; }
async function installProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    const waiters = new Map<string, (message: unknown) => void>();
    let instance: Worker | undefined;

    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        instance = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const data = event.data as { kind?: string; replyTo?: string };
          const replyTo = data.replyTo;
          if (replyTo !== undefined) {
            const waiter = waiters.get(replyTo);
            if (waiter !== undefined) {
              waiters.delete(replyTo);
              waiter(event.data);
              return;
            }
          }
          const kind = data.kind ?? '';
          if (kind === 'simulation/delta' || kind === 'simulation/snapshot' || kind === 'simulation/projection') return;
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

    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    const probe = window as unknown as StationProbeWindow;
    probe.lockstateSentToWorker = sent;
    probe.lockstateFromWorker = received;
    probe.lockstateAsk = (kind: string, payload: unknown) =>
      new Promise<unknown>((resolve, reject) => {
        if (instance === undefined) {
          reject(new Error('no simulation worker has been constructed yet'));
          return;
        }
        const messageId = crypto.randomUUID();
        const timer = setTimeout(() => {
          waiters.delete(messageId);
          reject(new Error(`the worker did not answer "${kind}" within 20s`));
        }, 20_000);
        waiters.set(messageId, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        instance.postMessage({ protocolVersion: 1, messageId, kind, payload });
      });
  });
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const reply = await (window as StationProbeWindow).lockstateAsk!('simulation/request-snapshot', { reason: 'consistency-check' }) as {payload: {snapshot: {data: {kernel: {tick: number}; construction: {orders: {definitionId: string; state: string}[]}; simulation: {objects?: {placedObjects: {objectId: string; anchorTile: {x: number;y: number}}[]}}}}}};
    return reply.payload.snapshot.data;
  });
}
test('actual angled Build completes a two-square exercise station and preserves it through Save/Load', async ({ page }, info) => {
  await installProbe(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Yard', exact: true }).click();
  await dialog.locator('summary').filter({hasText:'Enter coordinates'}).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('4');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('4');
  await dialog.getByRole('button', { name: 'Place room plan', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Play at normal speed', exact: true }).click();
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('region',{name:'Minimap',exact:true}).getByRole('button',{name:'Expand',exact:true}).click();
  const minimap=page.locator('.hud-minimap__surface');
  const m=await minimap.boundingBox(); if (!m) throw Error('minimap missing');
  await minimap.click({position:{x:m.width*.24,y:m.height*.24}});
  await page.locator('[data-buildable="exercise-station"]').click();
  await page.locator('.hud-build__arm').click();
  await page.mouse.move(940,540);
  await expect(page.locator('.hud-build__target-value')).toHaveText('2 × 1 tiles at 7, 7');
  await expect(page.locator('[data-buildable="exercise-station"]')).toContainText('80');
  const ghostImage=await page.locator('#game-root canvas').screenshot();
  const ghostSamples=await page.evaluate(async base64=>{
    const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'}));
    const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height; const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);
    return [[940,540],[996,500],[1053,460]].map(([x,y])=> {const d=ctx.getImageData(x!-3,y!-3,6,6).data;let delta=0;for(let i=0;i<d.length;i+=4)delta+=d[i+1]!-d[i]!;return delta/36;});
  },ghostImage.toString('base64'));
  expect(ghostSamples[0], 'first occupied square is filled').toBeGreaterThan(10);
  expect(ghostSamples[1], 'second occupied square is filled').toBeGreaterThan(10);
  expect(ghostSamples[2], 'a third square is outside the station footprint').toBeLessThan(0);
  await page.screenshot({path:info.outputPath('station-filled-ghost.png')});
  const canvas=page.locator('#game-root canvas');
  await page.mouse.move(1300,700);
  const before=await canvas.screenshot();
  await page.mouse.click(940,540);
  await page.locator('.hud-build__arm').click();
  await page.getByRole('button', {name:'Fast forward',exact:true}).click();
  await expect.poll(async()=> (await snapshot(page)).simulation.objects?.placedObjects.filter(o=>o.objectId==='object.exercise-station').length,{timeout:15000}).toBe(1);
  await page.getByRole('button', {name:'Pause',exact:true}).click();
  await expect(page.locator('[data-metric="funds"] .ui-stat__value')).toHaveText('24,920');
  const data=await snapshot(page);
  expect(data.construction.orders.filter(o=>o.definitionId==='exercise-station').map(o=>o.state)).toEqual(['completed']);
  expect(data.simulation.objects!.placedObjects.find(o=>o.objectId==='object.exercise-station')!.anchorTile).toEqual({x:7,y:7});
  await page.mouse.move(1300,700);
  const metalPixels = async () => {
    const image=await canvas.screenshot();
    return page.evaluate(async base64=>{
      const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64), char=>char.charCodeAt(0))],{type:'image/png'}));
      const c=document.createElement('canvas'); c.width=bitmap.width; c.height=bitmap.height;
      const ctx=c.getContext('2d')!; ctx.drawImage(bitmap,0,0);
      const d=ctx.getImageData(850,330,200,250).data; let count=0;
      for(let i=0;i<d.length;i+=4) {const r=d[i]!,g=d[i+1]!,b=d[i+2]!; if(r>=30&&r<=110&&g-r>8&&b-r>8&&Math.abs(g-b)<12) count++;}
      return count;
    }, image.toString('base64'));
  };
  expect(await metalPixels(), 'authored teal steel must paint above the Yard in the actual completed scene').toBeGreaterThan(1000);
  const complete=await canvas.screenshot();
  expect(complete.equals(before)).toBe(false);
  await page.screenshot({path:info.outputPath('station-completed.png')});
  await page.locator('.hud-build__coordinates').getByRole('button').click();
  await page.getByRole('spinbutton',{name:'Tile X',exact:true}).fill('8');
  await page.getByRole('spinbutton',{name:'Tile Y',exact:true}).fill('7');
  await page.getByRole('button',{name:'Place order',exact:true}).click();
  const refusalTick=(await snapshot(page)).kernel.tick;
  await page.getByRole('button',{name:'Play at normal speed',exact:true}).click();
  await expect.poll(async()=>(await snapshot(page)).kernel.tick).toBeGreaterThan(refusalTick+2);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  expect((await snapshot(page)).construction.orders.filter(o=>o.definitionId==='exercise-station')).toHaveLength(1);
  expect((await snapshot(page)).simulation.objects!.placedObjects.filter(o=>o.objectId==='object.exercise-station')).toHaveLength(1);
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await page.getByRole('button',{name:'Save now',exact:true}).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  expect((await snapshot(page)).simulation.objects!.placedObjects.filter(o=>o.objectId==='object.exercise-station')).toHaveLength(1);
  await minimap.click({position:{x:m.width*.24,y:m.height*.24}});
  await page.mouse.move(1300,700);
  expect(await metalPixels(), 'authored station pixels survive real Save/Load').toBeGreaterThan(1000);
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await page.screenshot({path:info.outputPath('station-loaded.png')});
});

