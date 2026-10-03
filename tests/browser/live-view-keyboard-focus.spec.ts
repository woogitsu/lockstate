import {expect,test} from './network-changed-fixture';
import type {Page,Locator} from './network-changed-fixture';
async function tabTo(page:Page,target:Locator):Promise<void> {
  for(let step=0;step<100;step++){
    if(await target.evaluate(element=>element===document.activeElement))return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}
async function bootKeyboard(page:Page):Promise<Locator> {
  await page.setViewportSize({width:1920,height:1080});await page.goto('/');
  const newPrison=page.getByRole('button',{name:'New prison',exact:true});await tabTo(page,newPrison);await page.keyboard.press('Enter');
  const disclosure=page.getByRole('button',{name:'View',exact:true});await tabTo(page,disclosure);await page.keyboard.press('Enter');
  await expect(page.locator('.hud-camera-panel')).toBeVisible();
  const view=page.getByRole('combobox',{name:'View',exact:true});await tabTo(page,view);return view;
}
test('actual keyboard-only live view roundtrip preserves selector focus',async({page})=>{
  const view=await bootKeyboard(page);await expect(view).toHaveValue('world');await expect(view).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(view).toHaveValue('oblique');await expect(view).toBeEnabled();await expect(view).toBeFocused();
  await page.screenshot({path:'test-results/live-view-keyboard-focused.png'});
  await page.keyboard.press('ArrowUp');await expect(view).toHaveValue('world');await expect(view).toBeEnabled();await expect(view).toBeFocused();
});
test('actual keyboard registry failure retains focus for immediate retry',async({page})=>{
  const view=await bootKeyboard(page);const url='**/game-content/oblique-module-registry.v1.json';
  await page.route(url,route=>route.fulfill({status:503,body:'unavailable'}));
  await page.keyboard.press('ArrowDown');await expect(view).toBeEnabled();await expect(view).toHaveValue('world');
  expect(await view.evaluate(element=>(element as HTMLSelectElement).validationMessage)).toContain('Could not change view');await expect(view).toBeFocused();
  await page.unroute(url);await page.keyboard.press('ArrowDown');await expect(view).toHaveValue('oblique');await expect(view).toBeEnabled();await expect(view).toBeFocused();
});

test('keyboard Tab during asynchronous view loading keeps the new focus',async({page})=>{
  const view=await bootKeyboard(page);const url='**/game-content/oblique-module-registry.v1.json';
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route(url,async route=>{await gate;await route.continue();});
  await page.keyboard.press('ArrowDown');await expect(view).toBeDisabled();await page.keyboard.press('Tab');
  const focused=await page.evaluate(()=>document.activeElement?.outerHTML);release();
  await expect(view).toBeEnabled();await expect(view).toHaveValue('oblique');
  expect(await page.evaluate(()=>document.activeElement?.outerHTML)).toBe(focused);await expect(view).not.toBeFocused();
});

test('Tab during delayed registry refusal keeps new focus and truthful failure validity',async({page})=>{
  const view=await bootKeyboard(page);const url='**/game-content/oblique-module-registry.v1.json';
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route(url,async route=>{await gate;await route.fulfill({status:503,body:'unavailable'});});
  await page.keyboard.press('ArrowDown');await expect(view).toBeDisabled();await page.keyboard.press('Tab');
  const focused=await page.evaluate(()=>document.activeElement?.outerHTML);release();
  await expect(view).toBeEnabled();await expect(view).toHaveValue('world');
  expect(await view.evaluate(element=>(element as HTMLSelectElement).validationMessage)).toContain('Could not change view');
  expect(await page.evaluate(()=>document.activeElement?.outerHTML)).toBe(focused);await expect(view).not.toBeFocused();
});
