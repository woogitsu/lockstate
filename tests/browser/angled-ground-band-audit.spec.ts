import { openCameraControls } from './public-camera-controls';
import {writeFileSync} from 'node:fs';
import {expect,test} from './network-changed-fixture';

test('capture actual 2560 angled ground before and after pose change for band diagnosis',async({page})=>{
  await page.setViewportSize({width:2560,height:1080});await page.goto('/');
  await openCameraControls(page);
  await page.getByRole('button',{name:'New prison',exact:true}).click();
  const view=page.getByRole('combobox',{name:'View',exact:true});await view.selectOption('oblique');await expect(view).toBeEnabled();await expect(view).toHaveValue('oblique');
  await page.getByRole('button',{name:'Build',exact:true}).click();await page.locator('.hud-build__arm').click();
  await page.mouse.move(650,250);await page.mouse.down();await page.mouse.move(2100,730,{steps:10});
  await page.locator('#game-root canvas').screenshot({path:'test-results/ground-band-canvas.png'});
  await page.screenshot({path:'test-results/ground-band-page.png'});
  const raw=await page.evaluate(()=>new Promise<string>(resolve=>requestAnimationFrame(()=>resolve((document.querySelector('#game-root canvas') as HTMLCanvasElement).toDataURL('image/png')))));
  writeFileSync('test-results/ground-band-raw-canvas.png',Buffer.from(raw.split(',')[1]!,'base64'));
  const metadata=await page.evaluate(()=>{
    const canvas=document.querySelector('#game-root canvas') as HTMLCanvasElement;
    const rect=canvas.getBoundingClientRect();
    const gl=canvas.getContext('webgl2')??canvas.getContext('webgl');
    return {canvas:{width:canvas.width,height:canvas.height,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},viewport:{width:innerWidth,height:innerHeight},gl:gl?{maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),maxRenderbufferSize:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)}:undefined,elements:Array.from(document.querySelectorAll('*')).filter(el=>{const r=el.getBoundingClientRect();return r.left<=1800&&r.right>=1800&&r.top<=1000&&r.bottom>=1000;}).map(el=>({tag:el.tagName,class:el.className,background:getComputedStyle(el).backgroundColor,before:{content:getComputedStyle(el,'::before').content,background:getComputedStyle(el,'::before').backgroundColor},after:{content:getComputedStyle(el,'::after').content,background:getComputedStyle(el,'::after').backgroundColor}}))};
  });
  writeFileSync('test-results/ground-band-runtime.json',JSON.stringify(metadata,null,2));

  await page.keyboard.press('Escape');await page.mouse.up();
  await openCameraControls(page);
  await page.getByRole('button',{name:'Rotate camera right',exact:true}).click();
  await page.locator('#game-root canvas').screenshot({path:'test-results/ground-band-rotated-canvas.png'});
  await page.screenshot({path:'test-results/ground-band-rotated-page.png'});
});
