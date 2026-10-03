import { closeCameraControls, openCameraControls } from './public-camera-controls';
import {expect,test} from './network-changed-fixture';
import type {Locator} from './network-changed-fixture';
async function assertReadable(value:Locator):Promise<void> {
  const geometry=await value.evaluate(element=>{
    const bounds=element.getBoundingClientRect();
    const rail=element.closest('.hud-build')!.getBoundingClientRect();
    const range=document.createRange();range.selectNodeContents(element);
    return {width:element.clientWidth,scroll:element.scrollWidth,lines:Array.from(range.getClientRects()).map(rect=>({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom})),bounds:{top:bounds.top,bottom:bounds.bottom},rail:{left:rail.left,right:rail.right}};
  });
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+1);
  expect(geometry.lines.length).toBeGreaterThan(1);
  for(const line of geometry.lines){expect(line.left).toBeGreaterThanOrEqual(geometry.rail.left);expect(line.right).toBeLessThanOrEqual(geometry.rail.right);expect(line.top).toBeGreaterThanOrEqual(geometry.bounds.top-1);expect(line.bottom).toBeLessThanOrEqual(geometry.bounds.bottom+1);}
}
for(const width of [960,1920,2560]) test(`${width} CSS-pixel actual square target and catalogue value stay readable without moving controls during a drag`,async({page})=>{
  await page.setViewportSize({width,height:width===960?540:1080});await page.goto('/');
  await openCameraControls(page);
  await page.getByRole('button',{name:'New prison',exact:true}).click();
  const view=page.getByRole('combobox',{name:'View',exact:true});await view.selectOption('oblique');await expect(view).toBeEnabled();await expect(view).toHaveValue('oblique');
  // The expanded public View overlays this narrow viewport's original map
  // target. Close it after real renderer readiness, before returning to Build.
  await closeCameraControls(page);
  await page.getByRole('button',{name:'Build',exact:true}).click();await page.locator('.hud-build__arm').click();
  await page.mouse.move(width===960?370:650,250);const target=page.locator('.hud-build__target-value');
  expect(await page.evaluate(point=>document.elementFromPoint(point.x,point.y)===document.querySelector('#game-root canvas'),{x:width===960?370:650,y:250})).toBe(true);
  await expect(target).toHaveText(/1 whole squares from -?\d+, -?\d+ \| catalogue value 80/);
  await assertReadable(target);
  const fallback=page.locator('.hud-build__arm-hint');const before=await fallback.boundingBox();
  await page.mouse.down();await page.mouse.move(width-460,width===960?430:730,{steps:10});
  await expect(target).toHaveText(/\d+ whole squares from -?\d+, -?\d+ \| catalogue value \d+/);
  expect(await target.textContent()).not.toMatch(/^1 whole/);await assertReadable(target);
  const after=await fallback.boundingBox();expect(after!.y).toBe(before!.y);
  await page.screenshot({path:`test-results/build-target-readable-${width}.png`});
  await page.keyboard.press('Escape');await page.mouse.up();
});
