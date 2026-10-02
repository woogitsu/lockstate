import {expect,test} from './network-changed-fixture';
import {installTee,sentCommands} from './playtest-harness';

test('reopening an active large plan withdraws obsolete readiness and blocked squares until the real worker replies',async({page},testInfo)=>{
  await installTee(page);
  await page.addInitScript(()=>{
    const OriginalWorker=Worker;
    const state={holdNext:false,held:false,release:()=>{}};
    (window as unknown as {reopenDelay:typeof state}).reopenDelay=state;
    class DelayedWorker extends OriginalWorker {
      override postMessage(message:unknown,transfer?:Transferable[]|StructuredSerializeOptions):void {
        const query=message as {kind?:string;payload?:{projectionId?:string}};
        if(state.holdNext&&query.kind==='simulation/request-projection'&&query.payload?.projectionId==='world/room-template-preflight') {
          state.holdNext=false;state.held=true;
          state.release=()=>{state.held=false;super.postMessage(message);};
          return;
        }
        if(transfer===undefined) super.postMessage(message);
        else if(Array.isArray(transfer)) super.postMessage(message,transfer);
        else super.postMessage(message,transfer);
      }
    }
    window.Worker=DelayedWorker as typeof Worker;
  });
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/?renderer=oblique');
  await page.getByRole('button',{name:'New prison',exact:true}).click();
  await page.getByRole('button',{name:'Build',exact:true}).click();
  const open=page.getByRole('button',{name:'Room plans',exact:true});
  await open.click();
  const dialog=page.getByRole('dialog',{name:'Room plans'});
  const row=dialog.getByRole('button',{name:'Four-cell row',exact:true});
  await row.click();
  const status=dialog.getByRole('status');
  await expect(status).toHaveText('This footprint is clear.');
  await dialog.getByRole('button',{name:'Place on map',exact:true}).click();
  await page.mouse.move(880,380);
  await expect(page.locator('.room-template-world-ghost polygon')).toHaveCount(112);
  await page.keyboard.press('Escape');
  await expect(page.locator('.room-template-world-ghost')).toBeHidden();
  await open.click();
  await dialog.getByText('Enter coordinates',{exact:true}).click();
  const submit=dialog.getByRole('button',{name:'Place room plan',exact:true});
  for(const previous of ['ready','blocked']) {
    if(previous==='blocked') {
      await dialog.getByRole('spinbutton',{name:'Plan origin X'}).fill('1000');
      await expect(status).toContainText('This footprint is blocked.');
      await expect(dialog.locator('.hud-template__tile--blocked').first()).toBeVisible();
    } else await expect(status).toHaveText('This footprint is clear.');
    await dialog.getByRole('button',{name:'Close plans',exact:true}).click();
    await page.evaluate(()=>{(window as unknown as {reopenDelay:{holdNext:boolean}}).reopenDelay.holdNext=true;});
    await open.click();
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {reopenDelay:{held:boolean}}).reopenDelay.held)).toBe(true);
    await expect(row).toHaveAttribute('aria-pressed','true');
    await expect(status).toHaveAttribute('aria-busy','true');
    await expect(status).toBeEmpty();
    await expect(submit).toBeDisabled();
    await expect(dialog.locator('.hud-template__tile--blocked')).toHaveCount(0);
    await expect(dialog.locator('.hud-template__quote')).toContainText('Materials catalogue value: 5,000');
    await page.screenshot({path:testInfo.outputPath(`reopen-${previous}-pending.png`)});
    await page.evaluate(()=>{(window as unknown as {reopenDelay:{release:()=>void}}).reopenDelay.release();});
    await expect(status).toHaveAttribute('aria-busy','false');
    if(previous==='ready') await expect(submit).toBeEnabled();
    else {await expect(status).toContainText('This footprint is blocked.');await expect(submit).toBeDisabled();}
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  expect((await sentCommands(page)).filter(c=>c.type==='PlaceRoomTemplate')).toHaveLength(0);
});
