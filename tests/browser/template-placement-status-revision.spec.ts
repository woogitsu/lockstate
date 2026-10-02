import {expect,test} from './network-changed-fixture';
import {installTee,sentCommands} from './playtest-harness';

test('an obsolete numeric placement reply cannot overwrite the newly selected plan status or focus',async({page})=>{
  await installTee(page);
  await page.addInitScript(()=>{
    const OriginalWorker=Worker;
    const state={holdNext:false,held:false,settled:false,release:()=>{}};
    (window as unknown as {templateReplyDelay:typeof state}).templateReplyDelay=state;
    class DelayedWorker extends OriginalWorker {
      override postMessage(message:unknown,transfer?:Transferable[]|StructuredSerializeOptions):void {
        const query=message as {messageId?:string;kind?:string;payload?:{projectionId?:string}};
        if(state.holdNext&&query.kind==='simulation/request-projection'&&query.payload?.projectionId==='world/room-template-preflight') {
          state.holdNext=false;state.held=true;
          state.release=()=>{
            state.held=false;
            const observed=(event:MessageEvent)=>{
              if((event.data as {replyTo?:string}).replyTo!==query.messageId) return;
              this.removeEventListener('message',observed);
              setTimeout(()=>{state.settled=true;},0);
            };
            this.addEventListener('message',observed);
            super.postMessage(message);
          };
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
  await page.getByRole('button',{name:'Room plans',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Room plans'});
  await dialog.getByText('Enter coordinates',{exact:true}).click();
  const place=dialog.getByRole('button',{name:'Place room plan',exact:true});
  await expect(place).toBeEnabled();
  await page.evaluate(()=>{(window as unknown as {templateReplyDelay:{holdNext:boolean}}).templateReplyDelay.holdNext=true;});
  await place.click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {templateReplyDelay:{held:boolean}}).templateReplyDelay.held)).toBe(true);
  const yard=dialog.locator('[data-template-id="yard-basic"]');
  await yard.focus();await page.keyboard.press('Enter');
  await expect(yard).toBeFocused();
  await expect(yard).toHaveAttribute('aria-pressed','true');
  await expect(dialog.getByRole('status')).toHaveText('This footprint is clear.');
  await expect(dialog.locator('.hud-template__quote')).toHaveText('Materials catalogue value: 0');
  await expect(place).toBeEnabled();
  await page.evaluate(()=>{(window as unknown as {templateReplyDelay:{release:()=>void}}).templateReplyDelay.release();});
  // Wait for the actual delayed worker round trip and resulting UI promise.
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {templateReplyDelay:{settled:boolean}}).templateReplyDelay.settled)).toBe(true);
  await expect(dialog.getByRole('status')).toHaveText('This footprint is clear.');
  await expect(yard).toBeFocused();
  await expect(place).toBeEnabled();
  expect((await sentCommands(page)).filter(c=>c.type==='PlaceRoomTemplate')).toHaveLength(0);
});
