import {expect,test} from './network-changed-fixture';
import type {Page} from './network-changed-fixture';
interface RendererProbe {workers:number;terminations:number;sent:unknown[];snapshot:()=>Promise<unknown>}
interface ProbeWindow extends Window {rendererProbe:RendererProbe}
async function installProbe(page:Page):Promise<void> {
  await page.addInitScript(()=>{
    const Original=Worker;let active:Worker|undefined;
    const waiters=new Map<string,(reply:unknown)=>void>();
    const probe:RendererProbe={workers:0,terminations:0,sent:[],snapshot:()=>new Promise((resolve,reject)=>{
      if(!active) {reject(Error('no worker'));return;}
      const messageId=crypto.randomUUID();
      const timer=setTimeout(()=>{waiters.delete(messageId);reject(Error('snapshot did not arrive'));},10000);
      waiters.set(messageId,reply=>{clearTimeout(timer);resolve(reply);});
      active.postMessage({protocolVersion:1,messageId,kind:'simulation/request-snapshot',payload:{reason:'consistency-check'}});
    })};
    class Probed extends Original {
      constructor(url:string|URL,options?:WorkerOptions) {
        super(url,options);active=this;probe.workers+=1;
        this.addEventListener('message',event=>{const reply=event.data as {replyTo?:string};if(reply.replyTo) {waiters.get(reply.replyTo)?.(reply);waiters.delete(reply.replyTo);}});
      }
      override terminate():void {probe.terminations+=1;super.terminate();}
      override postMessage(message:unknown,transfer?:Transferable[]|StructuredSerializeOptions):void {
        probe.sent.push(message);
        if(transfer===undefined)super.postMessage(message);else if(Array.isArray(transfer))super.postMessage(message,transfer);else super.postMessage(message,transfer);
      }
    }
    (window as unknown as {Worker:typeof Worker}).Worker=Probed as unknown as typeof Worker;
    (window as unknown as ProbeWindow).rendererProbe=probe;
  });
}
async function state(page:Page) {
  return page.evaluate(async()=>{
    const p=(window as unknown as ProbeWindow).rendererProbe;
    const snapshot=await p.snapshot() as {payload:{snapshot:{data:unknown}}};
    return {workers:p.workers,terminations:p.terminations,data:snapshot.payload.snapshot.data,commands:p.sent.filter(m=>(m as {kind?:string}).kind==='simulation/command')};
  });
}
async function bootUnsavedYard(page:Page):Promise<void> {
  await installProbe(page);await page.setViewportSize({width:1920,height:1080});await page.goto('/');
  await page.getByRole('button',{name:'New prison',exact:true}).click();
  await page.getByRole('button',{name:'Build',exact:true}).click();
  await page.getByRole('button',{name:'Room plans',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Room plans'});
  await dialog.getByRole('button',{name:'Yard',exact:true}).click();
  await dialog.locator('summary').filter({hasText:'Enter coordinates'}).click();
  await dialog.getByRole('spinbutton',{name:'Plan origin X'}).fill('4');
  await dialog.getByRole('spinbutton',{name:'Plan origin Y'}).fill('4');
  await dialog.getByRole('button',{name:'Place room plan',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Play at normal speed',exact:true}).click();
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('1');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
}

test('actual HUD changes both renderers while retaining one unsaved worker world',async({page})=>{
  await bootUnsavedYard(page);
  const view=page.getByRole('combobox',{name:'View',exact:true});
  await expect(view).toHaveValue('world');const before=await state(page);
  const url=page.url();const canvas=page.locator('#game-root canvas');const top=await canvas.screenshot();
  await view.selectOption('oblique');await expect(view).toBeEnabled();await expect(view).toHaveValue('oblique');
  await expect(page.getByRole('button',{name:'Rotate camera right',exact:true})).toBeVisible();
  expect(await state(page)).toEqual(before);expect(page.url()).toBe(url);
  expect((await canvas.screenshot()).equals(top)).toBe(false);
  await page.screenshot({path:'test-results/live-renderer-angled-fullhd.png'});
  await view.selectOption('world');await expect(view).toBeEnabled();await expect(view).toHaveValue('world');
  await expect(page.getByRole('button',{name:'Rotate camera right',exact:true})).toBeHidden();
  expect(await state(page)).toEqual(before);expect(page.url()).toBe(url);
  expect(await page.locator('.room-template-world-ghost').count()).toBe(1);
});

test('failed lazy angled catalogue keeps the existing unsaved world and offers a retry',async({page})=>{
  await bootUnsavedYard(page);const before=await state(page);
  const route='**/game-content/oblique-module-registry.v1.json';
  await page.route(route,route=>route.fulfill({status:503,body:'unavailable'}));
  const view=page.getByRole('combobox',{name:'View',exact:true});
  await view.selectOption('oblique');await expect(view).toBeEnabled();await expect(view).toHaveValue('world');
  expect(await view.evaluate(el=>(el as HTMLSelectElement).validationMessage)).toContain('Could not change view');
  expect(await state(page)).toEqual(before);
  await page.unroute(route);await view.selectOption('oblique');await expect(view).toBeEnabled();await expect(view).toHaveValue('oblique');
  expect(await state(page)).toEqual(before);
});
