import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { completedWallLogisticsSave } from './fixtures/completed-wall-logistics';

const poses = [
  { yaw: -45, elevation: 45, turns: 0, raises: 0 },
  { yaw: 45, elevation: 65, turns: 6, raises: 2 },
  { yaw: 45, elevation: 80, turns: 6, raises: 4 },
] as const;

async function wallEvidence(page: Page, png: Buffer, yaw: number, elevation: number) {
  return page.evaluate(async ({ base64, yaw, elevation }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const r = yaw * Math.PI / 180, e = elevation * Math.PI / 180;
    // Independent occupied tile and full-height allowance. Camera buttons turn
    // about the centre after native minimap framing at world20.5,20.5.
    const project = (x: number, y: number, z: number) => ({
      x: canvas.width / 2 + (Math.cos(r) * (x - 20.5) - Math.sin(r) * (y - 20.5)) * 80,
      y: canvas.height / 2 + ((Math.sin(r) * (x - 20.5) + Math.cos(r) * (y - 20.5)) * Math.sin(e) - z * Math.cos(e)) * 80,
    });
    const ground = [[20,20], [21,20], [21,21], [20,21]].map(([x,y]) => project(x!,y!,0));
    const points = [...ground, ...[[20,20], [21,20], [21,21], [20,21]].map(([x,y]) => project(x!,y!,0.75))];
    const cross = (a: {x:number;y:number},b: {x:number;y:number},c: {x:number;y:number}) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const sorted = [...points].sort((a,b) => a.x-b.x || a.y-b.y);
    const half = (list: typeof points) => {
      const h: typeof points = [];
      for (const point of list) { while(h.length>1 && cross(h[h.length-2]!,h.at(-1)!,point)<=0)h.pop(); h.push(point); }
      h.pop(); return h;
    };
    const hull = [...half(sorted),...half([...sorted].reverse())];
    const inside = (x:number,y:number) => hull.every((p,i) => {
      const q=hull[(i+1)%hull.length]!;
      // Three screen pixels cover minimap click rounding and antialiasing.
      return cross(p,q,{x,y})>=-3*Math.hypot(q.x-p.x,q.y-p.y);
    });
    const groundMinX = Math.min(...ground.map(point => point.x));
    const groundMaxX = Math.max(...ground.map(point => point.x));
    let masonryInside=0,masonryOutside=0,masonryOutsideGroundSpan=0;
    const outsideBounds = { left:Infinity, top:Infinity, right:-Infinity, bottom:-Infinity };
    // Isolated wall: the logistics rooms are fifteen rows away. The material
    // palette excludes dark footing/shadows and worker clothes. Native images
    // must still be opened before calling these provisional bounds a defect.
    for(let y=Math.floor(canvas.height/2-200);y<canvas.height/2+170;y++)
      for(let x=Math.floor(canvas.width/2-220);x<canvas.width/2+220;x++) {
        const index=(y*canvas.width+x)*4;
        const red=pixels[index]!,green=pixels[index+1]!,blue=pixels[index+2]!;
        if(red<125 || red>240 || red-green<4 || red-green>32 || green-blue<5 || green-blue>38)continue;
        // Height has no horizontal component. These supported yaw angles are
        // exact authored frames, so even the nearest elevation frame must fit
        // this horizontal ground span. Full prism bounds remain diagnostic:
        // the80° camera legitimately selects a65° authored elevation frame.
        if(x+.5<groundMinX-3 || x+.5>groundMaxX+3)masonryOutsideGroundSpan++;
        if(inside(x+.5,y+.5))masonryInside++;
        else {masonryOutside++;outsideBounds.left=Math.min(outsideBounds.left,x);outsideBounds.top=Math.min(outsideBounds.top,y);
          outsideBounds.right=Math.max(outsideBounds.right,x);outsideBounds.bottom=Math.max(outsideBounds.bottom,y);}
      }
    return { yaw,elevation,ground,hull,groundMinX,groundMaxX,masonryInside,masonryOutside,masonryOutsideGroundSpan,outsideBounds };
  }, { base64: png.toString('base64'), yaw, elevation });
}

for (const pose of poses) test(`native completed Brick wall occupies its chosen whole square at ${pose.yaw}/${pose.elevation}`, async ({ page }, info) => {
  const save = completedWallLogisticsSave();
  await installTee(page);
  const wallTextures: string[] = [];
  page.on('requestfinished', request => { if(request.url().includes('square-brick-'))wallTextures.push(request.url()); });
  await page.setViewportSize({ width:1920,height:1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button',{name:'New prison',exact:true}).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Import',exact:true}).click();
  await (await chooser).setFiles({name:'completed-logistics.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
  await page.locator('.save-panel__item').getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await expect(page.locator('.hud-build')).toHaveAttribute('data-queued','0');
  await page.getByRole('button',{name:'Build',exact:true}).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.locator('.hud-build__arm').click();
  const canvas = page.locator('#game-root canvas');
  const box = await canvas.boundingBox();
  if(!box)throw new Error('World canvas missing');
  const point={x:box.x+box.width/2+9*Math.SQRT1_2*80,y:box.y+box.height/2};
  expect(await page.evaluate(point => document.elementFromPoint(point.x,point.y)?.tagName,point)).toBe('CANVAS');
  await page.mouse.move(point.x,point.y);
  await page.screenshot({path:info.outputPath('whole-square-preview.png')});
  await page.mouse.click(point.x,point.y);
  await expect.poll(async() => (await sentCommands(page)).filter(c=>c.type==='PlaceBuildOrder').length).toBe(1);
  expect((await sentCommands(page)).filter(c=>c.type==='PlaceBuildOrder')).toEqual([
    expect.objectContaining({definitionId:'wall-brick',x:20,y:20,footprint:'square'}),
  ]);
  await expect(page.locator('.hud-build')).toHaveAttribute('data-queued','1');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Fast forward',exact:true}).click();
  await page.getByRole('button',{name:'Fast forward',exact:true}).click();
  await expect(page.locator('.hud-build')).toHaveAttribute('data-queued','0');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  const minimap = page.locator('.hud-minimap__surface');
  const map = await minimap.boundingBox();
  if(!map)throw new Error('Native minimap missing');
  await minimap.click({position:{x:map.width*20.5/32,y:map.height*20.5/32}});
  for(let i=0;i<pose.turns;i++)await page.getByRole('button',{name:'Rotate camera right',exact:true}).click();
  for(let i=0;i<pose.raises;i++)await page.getByRole('button',{name:'Raise camera angle',exact:true}).click();
  await expect.poll(() => wallTextures.some(url => url.includes(`yaw${pose.yaw<0?'-':'+'}${String(Math.abs(pose.yaw)).padStart(3,'0')}-elev${pose.elevation===80?65:pose.elevation}`))).toBe(true);
  await page.screenshot({path:info.outputPath('native-completed-wall.png')});
  const measured = await wallEvidence(page,await canvas.screenshot(),pose.yaw,pose.elevation);
  await writeFile(info.outputPath('native-ground-footprint.json'),JSON.stringify({pose,point,measured,wallTextures,workerCommands:await sentCommands(page)},null,2));
  expect((await sentCommands(page)).filter(c=>c.type==='PlaceBuildOrder')).toHaveLength(1);
  expect(measured.masonryInside,'actual wall material must be visible in the occupied volume').toBeGreaterThan(200);
  expect(measured.masonryOutsideGroundSpan,'visible masonry must fit the horizontal span of its occupied1×1 square; height and shadows cannot justify sideways spill').toBeLessThanOrEqual(20);
});
