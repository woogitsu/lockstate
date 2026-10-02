import {expect,test} from './network-changed-fixture';

test('Full HD first paused square order explains clock dependency and keyboard Play completes it',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});await page.goto('/');
  await page.getByRole('button',{name:'New prison',exact:true}).click();
  const view=page.getByRole('combobox',{name:'View',exact:true});await view.selectOption('oblique');await expect(view).toBeEnabled();
  await page.getByRole('button',{name:'Build',exact:true}).click();await page.locator('.hud-build__arm').click();
  await page.mouse.click(750,350);
  const rows=page.locator('.hud-build__queue-row');await expect(rows).toHaveCount(1);
  const note=page.locator('.hud-build__order-note');await expect(note).toHaveText('An order is queued now and built while the clock runs.');
  const geometry=await note.evaluate(element=>{
    const rect=element.getBoundingClientRect();const rail=element.closest('.hud-build')!.getBoundingClientRect();
    const range=document.createRange();range.selectNodeContents(element);
    return {rail:{top:rail.top,bottom:rail.bottom,left:rail.left,right:rail.right},lines:Array.from(range.getClientRects()).map(line=>({top:line.top,bottom:line.bottom,left:line.left,right:line.right})),rect:{top:rect.top,bottom:rect.bottom}};
  });
  for(const line of geometry.lines){expect(line.top).toBeGreaterThanOrEqual(geometry.rail.top);expect(line.bottom).toBeLessThanOrEqual(geometry.rail.bottom);expect(line.left).toBeGreaterThanOrEqual(geometry.rail.left);expect(line.right).toBeLessThanOrEqual(geometry.rail.right);}
  await page.screenshot({path:'test-results/first-square-clock-hint.png'});
  await page.keyboard.press('Escape');const play=page.getByRole('button',{name:'Play',exact:true});
  for(let index=0;index<100;index++) {if(await play.evaluate(element=>element===document.activeElement))break;await page.keyboard.press('Tab');}
  await expect(play).toBeFocused();await page.keyboard.press('Enter');await expect(rows).toHaveCount(0);
});
