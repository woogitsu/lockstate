/** Prepared Common Room native provenance; no browser result claimed here. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, type Page, type Response, type TestInfo } from '@playwright/test';
const descriptorPath = '/game-content/oblique-furniture.common-room-bench.v1.json';
const sourceSha256 = '825f228a6bb81dd03ab06d80c52af02646b92a16880e929c112c461b68992772';
const exposedFrame = '/assets/environment/oblique/furniture.common-room.upholstered-bench-yaw+60-elev40.5941441c6168.png';
const exposedSha256 = '5941441c6168900b1cf2eb6110b9bdb51708d8f2ff2b25c93629c6b3f1d6409a';
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
export function observeCommonRoomNetwork(page: Page) {
  const rows: NetworkRow[] = [];
  const bodies = new Map<string, Buffer>();
  const pending = new Set<Promise<void>>();
  const capture = async (response: Response): Promise<void> => {
    const url = response.url(), decodedPath = decodeURIComponent(new URL(url).pathname);
    if (decodedPath !== descriptorPath && !decodedPath.startsWith('/assets/environment/oblique/furniture.common-room.upholstered-bench-') && !/\/assets\/worker-[^/]+\.js$/.test(decodedPath)) return;
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
          {message:'native Common Room Bench consumer must request its detailed descriptor and exposed60/40 PNG'}).toBe(true);
      } finally {
        await Promise.all(pending);
        await writeFile(info.outputPath('common-room-bench-raw-response-provenance.json'),JSON.stringify(rows,null,2));
      }
      for (const row of rows.filter(row => row.status === 307)) {
        expect(row.location).toEqual(expect.any(String));
        expect(decodeURIComponent(new URL(row.location!,row.url).pathname)).toBe(row.decodedPath);
        expect(row.sha256).toBeUndefined(); expect(row.bytes).toBeUndefined();
      }
      await Promise.all(pending);
      const catalog = JSON.parse(bodies.get(descriptorPath)!.toString('utf8')) as BenchCatalog;
      expect(catalog.assetId).toBe('furniture.common-room.upholstered-bench');
      expect(catalog.source).toBe('assets/source/blender/furniture.common-room.upholstered-bench.angled-detail.blend');
      expect(catalog.sourceSha256).toBe(sourceSha256);
      expect(catalog.resolutionPx).toEqual([256,256]); expect(catalog.pivotPx).toEqual([128,128]);
      expect(catalog.cameraTargetTiles).toEqual([1,.5,.52]); expect(catalog.nominalPixelsPerTile).toBe(64);
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
      await writeFile(info.outputPath('common-room-bench-actual200-exposed-frame.png'),png);
      await writeFile(info.outputPath('common-room-bench-actual-network-and-htmlimage-evidence.json'),JSON.stringify(receipt,null,2));
      return receipt;
    },
  };
}
