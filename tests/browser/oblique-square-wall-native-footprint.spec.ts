import { openCameraControls } from './public-camera-controls';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { completedWallLogisticsSave } from './fixtures/completed-wall-logistics';

const poses = [
  { yaw: -45, elevation: 45, turns: 0, raises: 0 },
  { yaw: 45, elevation: 65, turns: 6, raises: 2 },
  { yaw: 45, elevation: 80, turns: 6, raises: 4 },
] as const;

async function installSnapshotReader(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let worker: Worker | undefined;
    const replies = new Map<string,(reply:unknown)=>void>();
    class SnapshotReaderWorker extends RealWorker {
      public constructor(url:string|URL,options?:WorkerOptions) {
        super(url,options);worker=this;
        this.addEventListener('message',(event:MessageEvent) => {
          const replyTo=(event.data as {replyTo?:string}).replyTo;
          if(replyTo===undefined)return;
          const resolve=replies.get(replyTo);
          if(resolve) {replies.delete(replyTo);resolve(event.data);}
        });
      }
    }
    (window as unknown as {Worker:typeof Worker}).Worker=SnapshotReaderWorker as unknown as typeof Worker;
    (window as unknown as {readWallSnapshot:()=>Promise<unknown>}).readWallSnapshot=()=>new Promise((resolve,reject)=>{
      if(!worker) {reject(new Error('Real worker missing'));return;}
      const messageId=crypto.randomUUID();
      const timer=setTimeout(()=>{replies.delete(messageId);reject(new Error('Actual snapshot did not return within existing10s expectation budget'));},10000);
      replies.set(messageId,reply=>{clearTimeout(timer);resolve(reply);});
      worker.postMessage({protocolVersion:1,messageId,kind:'simulation/request-snapshot',payload:{reason:'consistency-check'}});
    });
  });
}

async function wallEvidence(page: Page, png: Buffer, yaw: number, elevation: number, target: {x:number;y:number}, cutaway: boolean) {
  return page.evaluate(async ({ base64, yaw, elevation, target, cutaway }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const r = yaw * Math.PI / 180, e = elevation * Math.PI / 180;
    // Independent occupied tile and full-height allowance. Camera buttons turn
    // about the centre after minimap framing. Target derives only from the
    // passive physical click/DOM rectangle, including native click rounding.
    const project = (x: number, y: number, z: number) => ({
      x: canvas.width / 2 + (Math.cos(r) * (x - target.x) - Math.sin(r) * (y - target.y)) * 80,
      y: canvas.height / 2 + ((Math.sin(r) * (x - target.x) + Math.cos(r) * (y - target.y)) * Math.sin(e) - z * Math.cos(e)) * 80,
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
    // At80° the accepted nearest authored elevation is65°. Its local sprite
    // geometry must still pivot at the actual80° ground centre. This catches
    // vertical anchor errors at+45°, where a diagonal shift has zero X effect.
    const centre=project(20.5,20.5,0);
    const authoredElevation=Math.min(elevation,65)*Math.PI/180;
    const authoredPoints = [-.5,.5].flatMap(x=>[-.5,.5].flatMap(y=>[0,cutaway ? 0.34 : 0.75].map(z=>({
      x:centre.x+(Math.cos(r)*x-Math.sin(r)*y)*80,
      y:centre.y+((Math.sin(r)*x+Math.cos(r)*y)*Math.sin(authoredElevation)-z*Math.cos(authoredElevation))*80,
    }))));
    const authoredSorted=[...authoredPoints].sort((a,b)=>a.x-b.x||a.y-b.y);
    const authoredHull=[...half(authoredSorted),...half([...authoredSorted].reverse())];
    const inside = (polygon: typeof hull,x:number,y:number) => polygon.every((p,i) => {
      const q=polygon[(i+1)%polygon.length]!;
      // Three screen pixels cover minimap click rounding and antialiasing.
      return cross(p,q,{x,y})>=-3*Math.hypot(q.x-p.x,q.y-p.y);
    });
    const groundMinX = Math.min(...ground.map(point => point.x));
    const groundMaxX = Math.max(...ground.map(point => point.x));
    let masonryInside=0,masonryOutside=0,masonryOutsideGroundSpan=0,masonryOutsideAuthoredHull=0;
    const outsideBounds = { left:Infinity, top:Infinity, right:-Infinity, bottom:-Infinity };
    // Isolated wall: the logistics rooms are fifteen rows away. The material
    // palette excludes dark footing/shadows and worker clothes. Native images
    // must still be opened before calling these provisional bounds a defect.
    for(let y=Math.floor(canvas.height/2-200);y<canvas.height/2+170;y++)
      for(let x=Math.floor(canvas.width/2-220);x<canvas.width/2+220;x++) {
        const index=(y*canvas.width+x)*4;
        const red=pixels[index]!,green=pixels[index+1]!,blue=pixels[index+2]!;
        // Calibrated from opened native Brick/cap pixels170,167,162 and
        //131,125,118; nearby brown ground132,112,95 is excluded.
        if(red<125 || red>240 || Math.abs(red-green)>=9 || Math.abs(green-blue)>=9)continue;
        // Height has no horizontal component. These supported yaw angles are
        // exact authored frames, so even the nearest elevation frame must fit
        // this horizontal ground span. Full prism bounds remain diagnostic:
        // the80° camera legitimately selects a65° authored elevation frame.
        if(x+.5<groundMinX-3 || x+.5>groundMaxX+3)masonryOutsideGroundSpan++;
        if(!inside(authoredHull,x+.5,y+.5))masonryOutsideAuthoredHull++;
        if(inside(hull,x+.5,y+.5))masonryInside++;
        else {masonryOutside++;outsideBounds.left=Math.min(outsideBounds.left,x);outsideBounds.top=Math.min(outsideBounds.top,y);
          outsideBounds.right=Math.max(outsideBounds.right,x);outsideBounds.bottom=Math.max(outsideBounds.bottom,y);}
      }
    return { yaw,elevation,ground,hull,authoredHull,groundMinX,groundMaxX,masonryInside,masonryOutside,masonryOutsideGroundSpan,masonryOutsideAuthoredHull,outsideBounds };
  }, { base64: png.toString('base64'), yaw, elevation, target,cutaway });
}

for (const cutaway of [false, true]) for (const pose of poses) test(`native completed ${cutaway ? 'cutaway' : 'full'} Brick wall occupies its chosen whole square at ${pose.yaw}/${pose.elevation}`, async ({ page }, info) => {
  const save = completedWallLogisticsSave(cutaway);
  await installTee(page);
  await installSnapshotReader(page);
  await page.addInitScript(()=>{
    window.addEventListener('click',event=>{
      const surface=(event.target as Element | null)?.closest('.hud-minimap__surface');
      if(!surface)return;
      const box=surface.getBoundingClientRect();
      (window as unknown as {wallMinimapClick:unknown}).wallMinimapClick={clientX:event.clientX,clientY:event.clientY,
        rect:{x:box.x,y:box.y,width:box.width,height:box.height},fx:(event.clientX-box.x)/box.width,fy:(event.clientY-box.y)/box.height};
    },true);
  });
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
  await page.getByRole('button',{name:'Build',exact:true}).click();
  await expect.poll(async()=>Number(await page.locator('.hud-build').getAttribute('data-queued') ?? 0)).toBe(0);
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
  await expect.poll(async()=>Number(await page.locator('.hud-build').getAttribute('data-queued') ?? 0)).toBe(0);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const snapshot = await page.evaluate(async()=>{
    const reply=await (window as unknown as {readWallSnapshot:()=>Promise<unknown>}).readWallSnapshot() as {
      payload:{snapshot:{data:{construction:{orders:Array<{definitionId:string;location:{x:number;y:number};state:string;footprint?:string}>}}}}
    };
    return reply.payload.snapshot.data.construction.orders.filter(order=>order.location.x===20 && order.location.y===20);
  });
  expect(snapshot).toEqual([expect.objectContaining({definitionId:'wall-brick',location:{x:20,y:20},state:'completed',footprint:'square',
    materialsAllocated:[{itemId:'item.brick',quantity:2}]})]);
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  const minimap = page.locator('.hud-minimap__surface');
  const map = await minimap.boundingBox();
  if(!map)throw new Error('Native minimap missing');
  await minimap.click({position:{x:map.width*20.5/32,y:map.height*20.5/32}});
  const mapClick=await page.evaluate(()=>(window as unknown as {wallMinimapClick:{fx:number;fy:number}}).wallMinimapClick);
  const target={x:mapClick.fx*32,y:mapClick.fy*32};
  await openCameraControls(page);
  for(let i=0;i<pose.turns;i++)await page.getByRole('button',{name:'Rotate camera right',exact:true}).click();
  for(let i=0;i<pose.raises;i++)await page.getByRole('button',{name:'Raise camera angle',exact:true}).click();
  await expect.poll(() => wallTextures.some(url => url.includes(`square-brick-${cutaway ? 'low' : 'full'}-wall-yaw${pose.yaw<0?'-':'+'}${String(Math.abs(pose.yaw)).padStart(3,'0')}-elev${pose.elevation===80?65:pose.elevation}`))).toBe(true);
  // Request completion can precede Phaser's batch-complete repaint. Require
  // authored material, then retain the exact buffer used for pixel evidence.
  await expect.poll(async()=> (await wallEvidence(page,await canvas.screenshot(),pose.yaw,pose.elevation,target,cutaway)).masonryInside).toBeGreaterThan(200);
  const png=await canvas.screenshot();
  const measured = await wallEvidence(page,png,pose.yaw,pose.elevation,target,cutaway);
  await writeFile(info.outputPath('native-wall-canvas.png'),png);
  await page.screenshot({path:info.outputPath('native-completed-wall.png')});
  await writeFile(info.outputPath('native-ground-footprint.json'),JSON.stringify({cutaway,pose,point,mapClick,target,measured,wallTextures,snapshot,workerCommands:await sentCommands(page)},null,2));
  expect(await sentCommands(page),'camera framing must not submit unintended world commands').toEqual([
    expect.objectContaining({type:'PlaceBuildOrder',definitionId:'wall-brick',x:20,y:20,footprint:'square'}),
  ]);
  expect(measured.masonryInside,'actual wall material must be visible in the occupied volume').toBeGreaterThan(200);
  expect(measured.masonryOutsideGroundSpan,'visible masonry must fit the horizontal span of its occupied1×1 square; height and shadows cannot justify sideways spill').toBeLessThanOrEqual(20);
  expect(measured.masonryOutsideAuthoredHull,'nearest authored frame must pivot at the occupied square ground centre, preserving accepted elevation quantization').toBeLessThanOrEqual(20);
});
