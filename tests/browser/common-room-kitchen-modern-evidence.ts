/** Current Kitchen native preparation. Only genuine renderer response bodies qualify. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, type Page, type Response, type TestInfo } from '@playwright/test';
import { sessionSnapshotBundleFromTransport, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { openCameraControls } from './public-camera-controls';
import type { OwnedObjectSnapshotData } from './owned-object-worker-evidence';
const pins = {
  stove: {
    assetId: 'furniture.kitchen.stove.variants', descriptorPath: '/game-content/oblique-furniture.kitchen-stove.v1.json',
    source: 'assets/source/blender/furniture.kitchen.stove.soft-light.blend',
    sourceSha256: '7ac1027aca308b946acf902ebf611547621227535dc70b29db1c06d3db2d03bb',
    descriptorLfSha256: '135cde5a764c1cfee7bc28abf91ec2c5c317d73c1044c8aecc46756783400ea7',
    exposedFrame: '/assets/environment/oblique/furniture.kitchen.stove.variants-yaw+60-elev40.2c45a7fe1656.png',
    exposedSha256: '2c45a7fe165699ebdf209ba6a092956d9e8097d3095bc5f09dd35b9344749d65',
    rearFrame: '/assets/environment/oblique/furniture.kitchen.stove.variants-yaw+300-elev40.aed487667fa9.png',
    rearSha256: 'aed487667fa98273e0110f43295fa78f196edffb4415397f37d2797321f6ab1e',
    target: [1,.5,1.1230000257492065], prefix: '/assets/environment/oblique/furniture.kitchen.stove.variants-',
  },
  fridge: {
    assetId: 'furniture.kitchen.fridge.variants', descriptorPath: '/game-content/oblique-furniture.kitchen-fridge.v1.json',
    source: 'assets/source/blender/furniture.kitchen.fridge.soft-light.blend',
    sourceSha256: '1bad1e58abc9cd6c7a5773742df6b365ceb85db0a1e20d3c20a46c2e2508ce7d',
    descriptorLfSha256: 'd4176f99677a6747842ebc8bb2e1650492fb99232464c823a85cc6751f47c46b',
    exposedFrame: '/assets/environment/oblique/furniture.kitchen.fridge.variants-yaw+60-elev40.6d705ce7fcb5.png',
    exposedSha256: '6d705ce7fcb58f091d1f974716fe988cecea85167f6402ea5e55ba563b04b0c6',
    rearFrame: '/assets/environment/oblique/furniture.kitchen.fridge.variants-yaw+300-elev40.a6d73e1d54a8.png',
    rearSha256: 'a6d73e1d54a877812e867aa877d5deda3c944259b35dd95506be64e31ce77fbc',
    target: [.5,.5,1.1999999284744263], prefix: '/assets/environment/oblique/furniture.kitchen.fridge.variants-',
  },
  medicine: {
    assetId: 'fixture.medicine-cabinet.variants', descriptorPath: '/game-content/oblique-fixture.medicine-cabinet.v1.json',
    source: 'assets/source/blender/fixture.medicine-cabinet.soft-light.blend', sourceSha256: '1bb3821056d58d39dc51de6788689ad780e3bed59c20a5f3625714f2480e9732',
    descriptorLfSha256: 'f301d4def0086c6eae4c7ba8c34de972a1844a0b684a1761855659683fdeab0d',
    exposedFrame: '/assets/environment/oblique/fixture.medicine-cabinet.variants-yaw+60-elev40.bdd5f5183c55.png', exposedSha256: 'bdd5f5183c55984e20fe289701dadfb7ff9e350c06e4919e339c85bcb4d8a0bd',
    rearFrame: '/assets/environment/oblique/fixture.medicine-cabinet.variants-yaw+300-elev40.511adeeed0f9.png', rearSha256: '511adeeed0f9051373ae1adc48c9bf424ad5424d41a4512c041e2d5525adc711',
    target: [0.5,0.5,0.5899999737739563], prefix: '/assets/environment/oblique/fixture.medicine-cabinet.variants-',
  },
  medicalBed: {
    assetId: 'furniture.medical-bed.variants', descriptorPath: '/game-content/oblique-furniture.medical-bed.v1.json',
    source: 'assets/source/blender/furniture.medical-bed.soft-light.blend', sourceSha256: '786abf1ae0e37b99ddb507618918f04472560a68f78bcd22a7f3b5097c822c2c',
    descriptorLfSha256: '293bfa9389e3dd04eb704d39bcdc78e97ef3693cb1910f9ab8fa0601d24fe757',
    exposedFrame: '/assets/environment/oblique/furniture.medical-bed.variants-yaw+60-elev40.a2c875cba534.png', exposedSha256: 'a2c875cba5348fa4bfcc76947f0dbf3e335a7a93aaf8de5731700df8fc28f7aa',
    rearFrame: '/assets/environment/oblique/furniture.medical-bed.variants-yaw+300-elev40.d7b0bb53fa1f.png', rearSha256: 'd7b0bb53fa1fbcad780009f57cde8396327d5e5dcb44ecf6709bd72727c360e9',
    target: [0.5,1,0.675000011920929], prefix: '/assets/environment/oblique/furniture.medical-bed.variants-',
  },
} as const;

/** Production decoder and transport hydrator preserve the entire V10 domain bundle. */
export function decodeModernFurnitureSnapshot(raw: unknown): SessionSnapshotBundle {
  const decoded = decodeWorkerToMainMessage(raw);
  expect(decoded.ok, 'actual worker reply must decode').toBe(true);
  if (!decoded.ok || decoded.value.kind !== 'simulation/snapshot') throw Error('Actual snapshot absent');
  const snapshot = decoded.value.payload.snapshot;
  expect(decoded.value.protocolVersion).toBe(1);
  expect(snapshot.schemaId).toBe('simulation-save-payload'); expect(snapshot.schemaVersion).toBe(4);
  if (snapshot.transport !== 'structured-clone') throw Error('Actual snapshot transport absent');
  return sessionSnapshotBundleFromTransport(snapshot.data);
}

/** Existing Bench public recipe reaches source60/e40 for each object orientation. */
export async function frameKitchenModernSource(page: Page, turns: 0 | 1): Promise<void> {
  await openCameraControls(page);
  for (let step=0;step<(turns===0?7:1);step++) await page.getByRole('button', {name:'Rotate camera right',exact:true}).click();
  await page.mouse.move(1200,650); await page.mouse.down({button:'right'});
  await page.mouse.move(1200,667,{steps:3}); await page.mouse.up({button:'right'});
  await page.mouse.move(1300,700);
}
const sha = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
interface NetworkRow {
  url: string; decodedPath: string; status: number; location?: string; sha256?: string;
  bytes?: number; bodyError?: string; encodedPlusInUrl: boolean;
}
interface FurnitureCatalog {
  assetId: string; source: string; sourceSha256: string; resolutionPx: number[];
  nominalPixelsPerTile: number; pivotPx: number[]; cameraTargetTiles: number[];
  frames: { yawDegrees: number; elevationDegrees: number; image: string; sha256: string }[];
}

/** Observe only actual renderer traffic: no synthetic fetch can make a missing consumer pass. */
export function observeKitchenModernNetwork(page: Page, asset: keyof typeof pins) {
  const {descriptorPath,sourceSha256,exposedFrame,exposedSha256} = pins[asset];
  const rows: NetworkRow[] = [];
  const bodies = new Map<string, Buffer>();
  const pending = new Set<Promise<void>>();
  const capture = async (response: Response): Promise<void> => {
    const url = response.url(), decodedPath = decodeURIComponent(new URL(url).pathname);
    if (decodedPath !== descriptorPath && !decodedPath.startsWith(pins[asset].prefix) && !/\/assets\/worker-[^/]+\.js$/.test(decodedPath)) return;
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
          {message:'native Kitchen consumer must request its detailed descriptor and exposed60/40 PNG'}).toBe(true);
      } finally {
        await Promise.all(pending);
        await writeFile(info.outputPath('kitchen-modern-raw-response-provenance.json'),JSON.stringify(rows,null,2));
      }
      for (const row of rows.filter(row => row.status === 307)) {
        expect(row.location).toEqual(expect.any(String));
        expect(decodeURIComponent(new URL(row.location!,row.url).pathname)).toBe(row.decodedPath);
        expect(row.sha256).toBeUndefined(); expect(row.bytes).toBeUndefined();
      }
      await Promise.all(pending);
      const descriptorBody = bodies.get(descriptorPath)!;
      expect(sha(Buffer.from(descriptorBody.toString('utf8').replace(/\r\n/g,'\n')))).toBe(pins[asset].descriptorLfSha256);
      const catalog = JSON.parse(descriptorBody.toString('utf8')) as FurnitureCatalog;
      expect(catalog.assetId).toBe(pins[asset].assetId);
      expect(catalog.source).toBe(pins[asset].source);
      expect(catalog.sourceSha256).toBe(sourceSha256);
      expect(catalog.resolutionPx).toEqual([256,256]); expect(catalog.pivotPx).toEqual([128,128]);
      expect(catalog.cameraTargetTiles).toEqual(pins[asset].target); expect(catalog.nominalPixelsPerTile).toBe(64);
      expect(catalog.frames).toHaveLength(72);
      expect(catalog.frames.filter(frame => frame.yawDegrees===60 && frame.elevationDegrees===40)).toEqual([
        {yawDegrees:60,elevationDegrees:40,image:exposedFrame,sha256:exposedSha256},
      ]);
      expect(catalog.frames.filter(frame=>frame.yawDegrees===300 && frame.elevationDegrees===40)).toEqual([{yawDegrees:300,elevationDegrees:40,image:pins[asset].rearFrame,sha256:pins[asset].rearSha256}]);
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
      const receipt={asset,quarterTurns,sourceSha256,catalog,descriptorHttpBodySha256:sha(descriptorBody),network:rows,exposedFrameBodySha256:sha(png),decoded,
        syntheticFetchUsed:false,privateRendererTextureRead:false,hardwareRoiMeasured:false};
      await writeFile(info.outputPath('kitchen-modern-actual200-exposed-frame.png'),png);
      await writeFile(info.outputPath('kitchen-modern-actual-network-and-htmlimage-evidence.json'),JSON.stringify(receipt,null,2));
      return receipt;
    },
  };
}

/** Existing family's read-only request; archive the raw transport before any assertion. */
export async function readKitchenWholeSnapshot(page: Page, path: string): Promise<SessionSnapshotBundle & OwnedObjectSnapshotData> {
  const raw=await page.evaluate(async()=> {
    const ask=Reflect.get(window,'askWorker') as ((kind:string,payload:unknown)=>Promise<unknown>)|undefined;
    if (ask===undefined) throw Error('Actual Kitchen worker observer absent');
    return ask('simulation/request-snapshot',{reason:'consistency-check'});
  });
  await writeFile(path,JSON.stringify(raw,null,2));
  const data=decodeModernFurnitureSnapshot(raw);
  expect(data.simulation?.objects).toBeDefined(); expect(data.construction).toBeDefined();
  return data as SessionSnapshotBundle & OwnedObjectSnapshotData;
}
