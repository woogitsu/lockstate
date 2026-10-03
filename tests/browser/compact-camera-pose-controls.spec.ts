import { openCameraControls } from './public-camera-controls';
import {expect,test} from './network-changed-fixture';

test('Full HD camera icon group keeps four labelled keyboard actions above the minimap',async({page},testInfo)=>{
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/?renderer=oblique');
  await page.getByRole('button',{name:'New prison',exact:true}).click();
  await openCameraControls(page);
  const group=page.locator('.hud-camera-pose');
  const buttons=group.getByRole('button');
  await expect(buttons).toHaveCount(4);
  const bounds=await group.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(208);
  expect(bounds!.height).toBeLessThanOrEqual(48);
  const minimap=page.locator('.hud-minimap');
  const miniBounds=await minimap.boundingBox();
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(miniBounds!.y);
  const names=['Rotate camera left','Rotate camera right','Raise camera angle','Lower camera angle'];
  const canvas=page.locator('#game-root canvas');
  await buttons.first().focus();
  for(let index=0;index<names.length;index+=1) {
    const button=group.getByRole('button',{name:names[index]!,exact:true});
    await expect(button).toBeFocused();
    await expect(button.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    const reachable=await button.evaluate(el=>{const b=el.getBoundingClientRect();return b.width>=44&&b.height>=44&&el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));});
    expect(reachable).toBe(true);
    const before=await canvas.screenshot();
    await page.keyboard.press('Enter');
    await expect.poll(async()=>(await canvas.screenshot()).equals(before),{message:`${names[index]} must change the composed world image`}).toBe(false);
    if(index<names.length-1) await page.keyboard.press('Tab');
  }
  await page.screenshot({path:testInfo.outputPath('compact-camera-fullhd.png')});
});
