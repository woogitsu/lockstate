import { inflateSync } from 'node:zlib';

/** Opaque projected authored seat-top samples from real source60/300,e40.
 * Colors are frozen from those PNGs, never learned from a screenshot or reply.
 * Color alone is NOT a discriminator: retained metal shares54/55 values.
 */
export const STAFF_PAD_GRADIENT_RGB_KEYS: readonly number[] = [4671819,4869198,4869454,4935247,5000783,5000784,5001040,5066576,5066577,5066833,5132369,5132370,5132626,5132627,5198163,5198419,5198420,5263956,5264212,5264213,5329748,5329749,5330005,5395541,5395542,5395798,5395799,5461334,5461335,5461591,5527127,5527128,5527384,5592920,5592921,5593177,5658713,5658714,5658970,5724506,5724507,5724763,5790299,5790300,5790556,5856092,5856093,5856349,5921885,5922141,5922142,5987678,5987679,5987935,6053728];
const palette = new Set(STAFF_PAD_GRADIENT_RGB_KEYS);
export type MaterialRect = readonly [number, number, number, number];
export interface MaterialBitmap { readonly width: number; readonly height: number; readonly rgba: Uint8Array }

/** Original independent native rectangles, unchanged. */
export const STAFF_CHAIR_MATERIAL_RECTS: Readonly<Record<0 | 1, readonly MaterialRect[]>> = {
  0: [[770,490,100,115],[940,440,100,115]],
  1: [[825,390,95,100],[885,500,100,105]],
};

/** Decode genuine browser PNG screenshot bytes; no renderer texture read. */
export function decodeStaffMaterialPng(bytes: Buffer): MaterialBitmap {
  if (bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG screenshot required');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const channels = bytes[25] === 6 ? 4 : bytes[25] === 2 ? 3 : 0;
  if (bytes[24] !== 8 || channels === 0 || bytes[28] !== 0) throw new Error('Unsupported material PNG');
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii',offset+4,offset+8) === 'IDAT') chunks.push(bytes.subarray(offset+8,offset+8+length));
    offset += length+12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width*channels;
  if (raw.length !== height*(stride+1)) throw new Error('Incomplete material PNG');
  const pixels = new Uint8Array(height*stride), rgba = new Uint8Array(width*height*4);
  const paeth = (a: number,b: number,c: number): number => {
    const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
    return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
  };
  for (let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)]!;
    for (let x=0;x<stride;x++) {
      const a=x>=channels?pixels[y*stride+x-channels]!:0;
      const up=y>0?pixels[(y-1)*stride+x]!:0;
      const diagonal=y>0&&x>=channels?pixels[(y-1)*stride+x-channels]!:0;
      const delta=filter===0?0:filter===1?a:filter===2?up:filter===3?Math.floor((a+up)/2):filter===4?paeth(a,up,diagonal):NaN;
      if (!Number.isFinite(delta)) throw new Error('Unknown material PNG filter');
      pixels[y*stride+x]=(raw[y*(stride+1)+x+1]!+delta)&255;
    }
  }
  for (let pixel=0;pixel<width*height;pixel++) {
    rgba[pixel*4]=pixels[pixel*channels]!; rgba[pixel*4+1]=pixels[pixel*channels+1]!;
    rgba[pixel*4+2]=pixels[pixel*channels+2]!; rgba[pixel*4+3]=channels===4?pixels[pixel*channels+3]!:255;
  }
  return {width,height,rgba};
}

/** Count the largest connected interior of a broad authored-gradient surface.
 * A5x5 opaque neighborhood rejects thin frame metal; >=3 source RGB values
 * rejects flat body surfaces. Connectedness prevents scattered desk highlights
 * accumulating into a pad. This is stricter material evidence, not a new floor.
 */
export function staffPadSurfacePixels(bitmap: MaterialBitmap, rect: MaterialRect): number {
  const [left,top,width,height]=rect;
  if (left<0||top<0||left+width>bitmap.width||top+height>bitmap.height) throw new Error('Material ROI outside actual PNG');
  const colors=new Uint32Array(width*height), candidate=new Uint8Array(width*height), interior=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const source=((top+y)*bitmap.width+left+x)*4, index=y*width+x;
    const key=(bitmap.rgba[source]!<<16)|(bitmap.rgba[source+1]!<<8)|bitmap.rgba[source+2]!;
    colors[index]=key; candidate[index]=bitmap.rgba[source+3]===255&&palette.has(key)?1:0;
  }
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++) {
    if(candidate[y*width+x]!==1)continue;
    let complete=true; const distinct=new Set<number>();
    for(let dy=-2;dy<=2&&complete;dy++)for(let dx=-2;dx<=2;dx++) {
      const index=(y+dy)*width+x+dx;
      if(candidate[index]!==1){complete=false;break;}
      distinct.add(colors[index]!);
    }
    if(!complete||distinct.size<3)continue;
    interior[y*width+x]=1;
  }
  let largest=0;
  for(let start=0;start<interior.length;start++) {
    if(interior[start]!==1)continue;
    const pending=[start];interior[start]=0;let count=0;
    while(pending.length>0) {
      const index=pending.pop()!;count++;
      const x=index%width,y=Math.floor(index/width);
      for(const next of [x>0?index-1:-1,x+1<width?index+1:-1,y>0?index-width:-1,y+1<height?index+width:-1]) {
        if(next>=0&&interior[next]===1){interior[next]=0;pending.push(next);}
      }
    }
    largest=Math.max(largest,count);
  }
  return largest;
}

export function staffChairPadMaterialPixels(png: Buffer, turns: 0 | 1): number[] {
  const bitmap=decodeStaffMaterialPng(png);
  return STAFF_CHAIR_MATERIAL_RECTS[turns].map(rect=>staffPadSurfacePixels(bitmap,rect));
}
