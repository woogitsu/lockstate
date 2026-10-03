/** Pending native Cell toilet evidence: genuine worker replies and renderer response bodies. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, type Page, type Response, type TestInfo } from '@playwright/test';

export interface ToiletSnapshotData {
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
export function assertToiletProducer(data: ToiletSnapshotData, quarterTurns: 0 | 1, built = true): void {
  expect(data.world.version).toBe(1);
  const objects = data.simulation.objects.placedObjects.filter(object => object.objectId === 'object.toilet');
  expect(objects).toHaveLength(built ? 1 : 0);
  if (!built) return;
  // Independent scalar rotation of original4x7,1x1 toilet local(2,4).
  // q1 min corner=(20+7-4-1,5+2)=(22,7); no production transform reader here.
  const [x,y] = quarterTurns === 0 ? [22,9] : [22,7];
  const id = 'room-template-000000000002-2-object-001';
  const expected = {placedObjectId:`object:${x}:${y}`,objectId:'object.toilet',anchorTile:{x,y},orientation:quarterTurns,sourceOrderId:id};
  expect(objects[0]).toEqual(expected);
  const orders=data.construction.orders.filter(order=>order.id===id);
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({id,definitionId:'toilet-brick',state:'completed',location:{x,y}});
  expect(orders[0]!.objectOrientation ?? 0).toBe(quarterTurns);
  expect(data.simulation.objects.placedObjects.filter(object=>object.placedObjectId===expected.placedObjectId)).toHaveLength(1);
  expect(data.simulation.objects.placedObjects.filter(object=>object.sourceOrderId===id)).toHaveLength(1);
}

const descriptorPath = '/game-content/oblique-cell-toilet.v1.json';
const sourceSha256 = '1aa9169f65ea498fd1bfe6a2ee600f058c41f1a76685a0109a17da92db398ad5';
const descriptorCanonicalTextSha256 = 'a4c23422ef4c3225237ebf6669a042429256e9a0f333afeb4afe534b5111bb5c';
const exposedFrame = '/assets/environment/oblique/cell-toilet-yaw+45-elev40.12522e96db7e.png';
const exposedSha256 = '12522e96db7e5cd627928558800c25dda9a33f43643a999213443144a30df312';
const rearFrame = '/assets/environment/oblique/cell-toilet-yaw-45-elev40.b6c822495349.png';
const rearSha256 = 'b6c8224953490be75abe1be417c3b40a3bbdb95cda49746e2b09ecb75636a904';
const sha = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
interface NetworkRow {
  url: string; decodedPath: string; status: number; location?: string; sha256?: string;
  bytes?: number; bodyError?: string; encodedPlusInUrl: boolean; literalPlusInDecodedPath?: boolean; rawPlusInUrl?: boolean; redirectLocationEncodedPlus?: boolean;
}
interface ToiletCatalog {
  assetId: string; source: string; sourceSha256: string; resolutionPx: number[];
  nominalPixelsPerTile: number; pivotPx: number[]; cameraTargetTiles: number[];
  frames: { yawDegrees: number; elevationDegrees: number; image: string; sha256: string }[];
}

/** Observe only actual renderer traffic: no synthetic fetch can make a missing consumer pass. */
export function observeToiletNetwork(page: Page) {
  const rows: NetworkRow[] = [];
  const bodies = new Map<string, Buffer>();
  const pending = new Set<Promise<void>>();
  const capture = async (response: Response): Promise<void> => {
    const url = response.url(), decodedPath = decodeURIComponent(new URL(url).pathname);
    if (decodedPath !== descriptorPath && !decodedPath.startsWith('/assets/environment/oblique/cell-toilet-') && !/\/assets\/worker-[^/]+\.js$/.test(decodedPath)) return;
    const row: NetworkRow = {url,decodedPath,status:response.status(),encodedPlusInUrl:url.includes('%2B') || url.includes('%2b'),literalPlusInDecodedPath:decodedPath.includes('+'),rawPlusInUrl:url.includes('+')}; rows.push(row);
    if (row.status === 307) {
      const location = response.headers()['location'];
      if (location !== undefined) { row.location = location; row.redirectLocationEncodedPlus=/%2b/i.test(location); }
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
          {message:'native default Toilet consumer must request its detailed descriptor and exposed45/40 PNG'}).toBe(true);
      } finally {
        await Promise.all(pending);
        await writeFile(info.outputPath('toilet-raw-response-provenance.json'),JSON.stringify(rows,null,2));
      }
      for (const row of rows.filter(row => row.status === 307)) {
        expect(row.location).toEqual(expect.any(String));
        expect(decodeURIComponent(new URL(row.location!,row.url).pathname)).toBe(row.decodedPath);
        expect(row.sha256).toBeUndefined(); expect(row.bytes).toBeUndefined();
      }
      await Promise.all(pending);
      const descriptor = bodies.get(descriptorPath)!;
      expect(sha(Buffer.from(descriptor.toString('utf8').replace(/\r\n/g, '\n')))).toBe(descriptorCanonicalTextSha256);
      const catalog = JSON.parse(descriptor.toString('utf8')) as ToiletCatalog;
      expect(catalog.assetId).toBe('fixture.cell.toilet_sink');
      expect(catalog.source).toBe('assets/source/blender/fixture.cell.toilet_sink.soft-light.blend');
      expect(catalog.sourceSha256).toBe(sourceSha256);
      expect(catalog.resolutionPx).toEqual([512,512]); expect(catalog.pivotPx).toEqual([256,256]);
      expect(catalog.cameraTargetTiles).toEqual([.5,.5,.5537500381469727]); expect(catalog.nominalPixelsPerTile).toBe(64);
      expect(catalog.frames).toHaveLength(72);
      expect(catalog.frames.filter(frame => frame.yawDegrees===45 && frame.elevationDegrees===40)).toEqual([
        {yawDegrees:45,elevationDegrees:40,image:exposedFrame,sha256:exposedSha256},
      ]);
      expect(catalog.frames.filter(frame => frame.yawDegrees===-45 && frame.elevationDegrees===40)).toEqual([
        {yawDegrees:-45,elevationDegrees:40,image:rearFrame,sha256:rearSha256},
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
      expect(decoded.width).toBe(512);expect(decoded.height).toBe(512);expect(decoded.nontransparent).toBeGreaterThan(0);
      const selectedRows=rows.filter(row=>row.decodedPath===exposedFrame && row.status===200);
      expect(selectedRows.length).toBeGreaterThan(0);
      selectedRows.forEach(row=>{expect(row.sha256).toBe(exposedSha256);expect(row.bodyError).toBeUndefined();});
      const receipt={quarterTurns,sourceSha256,catalog,network:rows,exposedFrameBodySha256:sha(png),decoded,
        syntheticFetchUsed:false,privateRendererTextureRead:false,hardwareRoiMeasured:false};
      await writeFile(info.outputPath('toilet-actual200-exposed-frame.png'),png);
      await writeFile(info.outputPath('toilet-actual-network-and-htmlimage-evidence.json'),JSON.stringify(receipt,null,2));
      return receipt;
    },
  };
}
