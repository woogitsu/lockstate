/** Pending native Bench evidence; public worker/network/image APIs only. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, type Page, type Response, type TestInfo } from '@playwright/test';

export interface BenchSnapshotData {
  kernel: { tick: number };
  world: { version: number };
  simulation: { objects: { placedObjects: {
    placedObjectId: string; objectId: string; sourceOrderId?: string;
    anchorTile: { x: number; y: number }; orientation: number;
  }[] } };
  construction: { orders: {
    id: string; definitionId: string; location: { x: number; y: number };
    state: string; objectOrientation?: number;
  }[] };
}
export function assertBenchProducer(data: BenchSnapshotData, quarterTurns: 0 | 1, built = true): void {
  expect(data.world.version).toBe(1);
  const benches = data.simulation.objects.placedObjects.filter(object => object.objectId === 'object.bench');
  expect(benches).toHaveLength(built ? 2 : 0);
  if (!built) return;
  // Literal scalar rotation of original6x6, authored2x1 fixtures at(1,1)/(3,3).
  // q1 min corner = (20+6-y-1,5+x), independently of production transform readers.
  const anchors = quarterTurns === 0 ? [[21,6],[23,8]] : [[24,6],[22,8]];
  for (const [index, anchor] of anchors.entries()) {
    const [x,y] = anchor as [number,number];
    const id = `room-template-000000000002-2-object-${String(index).padStart(3,'0')}`;
    const expected = { placedObjectId:`object:${x}:${y}`, objectId:'object.bench', anchorTile:{x,y}, orientation:quarterTurns, sourceOrderId:id };
    const objects = benches.filter(object => object.sourceOrderId === id);
    expect(objects).toHaveLength(1); expect(objects[0]).toEqual(expected);
    const orders = data.construction.orders.filter(order => order.id === id);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({id,definitionId:'bench-wooden',state:'completed',location:{x,y}});
    expect(orders[0]!.objectOrientation ?? 0).toBe(quarterTurns);
    expect(benches.filter(object => object.placedObjectId === expected.placedObjectId)).toHaveLength(1);
  }
  expect(new Set(benches.map(object => object.sourceOrderId)).size).toBe(2);
}

const descriptorPath = '/game-content/oblique-canteen-bench.v1.json';
const sourceSha256 = '8518e5d755352f6511bcb4f2165674e1bca44f918f945e7c5cfa09b60ba05986';
const exposedFrame = '/assets/environment/oblique/furniture.corridor.bench.variants-yaw+60-elev40.b2399fd4b40d.png';
const exposedSha256 = 'b2399fd4b40d565ea877fc4af39be18468d191cd5faf5f95bb00c6519c00096a';
const sha = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
interface NetworkRow {
  url: string; decodedPath: string; status: number; location?: string; sha256?: string;
  bytes?: number; bodyError?: string; encodedPlusInUrl: boolean;
}
interface BenchCatalog {
  assetId: string; source: string; sourceSha256: string; resolutionPx: number[];
  nominalPixelsPerTile: number; pivotPx: number[]; cameraTargetTiles: number[];
  frames: { yawDegrees: number; elevationDegrees: number; image: string; sha256: string }[];
}

/** Observe only actual renderer traffic: no synthetic fetch can make a missing consumer pass. */
export function observeBenchNetwork(page: Page) {
  const rows: NetworkRow[] = [];
  const bodies = new Map<string, Buffer>();
  const pending = new Set<Promise<void>>();
  const capture = async (response: Response): Promise<void> => {
    const url = response.url(), decodedPath = decodeURIComponent(new URL(url).pathname);
    if (decodedPath !== descriptorPath && !decodedPath.startsWith('/assets/environment/oblique/furniture.corridor.bench.variants-') && !/\/assets\/worker-[^/]+\.js$/.test(decodedPath)) return;
    const row: NetworkRow = {url,decodedPath,status:response.status(),encodedPlusInUrl:url.includes('%2B') || url.includes('%2b')}; rows.push(row);
    if (row.status === 307) {
      const location = response.headers()['location'];
      if (location !== undefined) row.location = location;
      // Redirects have no PNG body. '+' is literal in a path, never form/query decoding.
      // Validate recorded redirect paths in the awaited evidence call, not an async event callback.
      return;
    }
    if (row.status !== 200) return;
    try {
      const body = await response.body(); row.sha256=sha(body); row.bytes=body.length; bodies.set(decodedPath,body);
    } catch(error) { row.bodyError=String(error); }
  };
  page.on('response', response => {
    const job=capture(response); pending.add(job);
    void job.then(() => pending.delete(job), error => {
      rows.push({url:response.url(),decodedPath:decodeURIComponent(new URL(response.url()).pathname),status:response.status(),encodedPlusInUrl:response.url().includes('%2B'),bodyError:String(error)});
      pending.delete(job);
    });
  });
  return {
    async raw(path: string): Promise<void> { await Promise.all(pending); await writeFile(path,JSON.stringify(rows,null,2)); },
    async evidence(info: TestInfo, quarterTurns: 0 | 1) {
      try {
        await expect.poll(() => bodies.has(descriptorPath) && bodies.has(exposedFrame),
          {message:'native default Bench consumer must request its detailed descriptor and exposed60/40 PNG'}).toBe(true);
      } finally {
        await Promise.all(pending);
        await writeFile(info.outputPath('bench-raw-response-provenance.json'),JSON.stringify(rows,null,2));
      }
      for (const row of rows.filter(row => row.status === 307)) {
        expect(row.location).toEqual(expect.any(String));
        expect(decodeURIComponent(new URL(row.location!,row.url).pathname)).toBe(row.decodedPath);
        expect(row.sha256).toBeUndefined(); expect(row.bytes).toBeUndefined();
      }
      await Promise.all(pending);
      const catalog = JSON.parse(bodies.get(descriptorPath)!.toString('utf8')) as BenchCatalog;
      expect(catalog.assetId).toBe('furniture.corridor.bench.variants');
      expect(catalog.source).toBe('assets/source/blender/furniture.corridor.bench.grounded-detail.blend');
      expect(catalog.sourceSha256).toBe(sourceSha256);
      expect(catalog.resolutionPx).toEqual([256,256]); expect(catalog.pivotPx).toEqual([128,128]);
      expect(catalog.cameraTargetTiles).toEqual([1,.5,.44325]); expect(catalog.nominalPixelsPerTile).toBe(64);
      expect(catalog.frames).toHaveLength(72);
      expect(catalog.frames.filter(frame => frame.yawDegrees===60 && frame.elevationDegrees===40)).toEqual([
        {yawDegrees:60,elevationDegrees:40,image:exposedFrame,sha256:exposedSha256},
      ]);
      const png=bodies.get(exposedFrame)!; expect(sha(png)).toBe(exposedSha256);
      expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
      const decoded=await page.evaluate(async base64 => {
        const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
        const blob=new Blob([bytes],{type:'image/png'}), url=URL.createObjectURL(blob);
        try {
          const image=new Image();
          await new Promise<void>((resolve,reject)=>{ image.onload=()=>resolve(); image.onerror=()=>reject(new Error('actual200 PNG cannot decode as HTMLImage Blob'));image.src=url; });
          const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
          const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
          const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
          let nontransparent=0;for(let index=3;index<pixels.length;index+=4)if(pixels[index]!==0)nontransparent++;
          return {width:image.naturalWidth,height:image.naturalHeight,nontransparent,decoder:'HTMLImageElement from actual200body Blob'};
        } finally {URL.revokeObjectURL(url);}
      },png.toString('base64'));
      expect(decoded.width).toBe(256);expect(decoded.height).toBe(256);expect(decoded.nontransparent).toBeGreaterThan(0);
      const selectedRows=rows.filter(row=>row.decodedPath===exposedFrame && row.status===200);
      expect(selectedRows.length).toBeGreaterThan(0);
      selectedRows.forEach(row=>{expect(row.sha256).toBe(exposedSha256);expect(row.bodyError).toBeUndefined();});
      const receipt={quarterTurns,sourceSha256,catalog,network:rows,exposedFrameBodySha256:sha(png),decoded,
        syntheticFetchUsed:false,privateRendererTextureRead:false,hardwareRoiMeasured:false};
      await writeFile(info.outputPath('bench-actual200-exposed-frame.png'),png);
      await writeFile(info.outputPath('bench-actual-network-and-htmlimage-evidence.json'),JSON.stringify(receipt,null,2));
      return receipt;
    },
  };
}
