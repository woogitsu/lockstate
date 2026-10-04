import palettes from './canteen-bench-source-material-keys.json' with { type: 'json' };
import edgeKeys from './canteen-bench-rounded-edge-source-keys.json' with { type: 'json' };
import { decodeStaffMaterialPng, type MaterialBitmap, type MaterialRect } from './staff-room-padded-chair/material-observer';

// Actual saved-source triangle ray/material samples, never native PNG training.
// Derivation and rejected palette-only controls are preserved in the research record.
const plateKeys = new Set(palettes.table);
const timberKeys = new Set(palettes.bench);
const roundedEdgeKeys = new Set(edgeKeys);
export const TABLE_MATERIAL_RECTS: readonly (readonly MaterialRect[])[] = [
  [[680,410,170,150],[860,295,190,125]],
  [[850,320,210,95],[1040,420,190,125]],
];
export const BENCH_MATERIAL_RECTS: readonly (readonly MaterialRect[])[] = [
  [[720,415,150,145],[945,410,150,115]],
  [[875,350,135,100],[875,510,145,110]],
];

function interior(bitmap: MaterialBitmap, rect: MaterialRect, palette: ReadonlySet<number>): { mask: Uint8Array; colors: Uint32Array; width: number; height: number } {
  const [left,top,width,height] = rect;
  const colors = new Uint32Array(width*height), candidate = new Uint8Array(width*height), mask = new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const at=((top+y)*bitmap.width+left+x)*4, index=y*width+x;
    const key=(bitmap.rgba[at]!<<16)|(bitmap.rgba[at+1]!<<8)|bitmap.rgba[at+2]!;
    colors[index]=key;
    candidate[index]=bitmap.rgba[at+3]===255&&palette.has(key)?1:0;
  }
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++) {
    let complete=true;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(candidate[(y+dy)*width+x+dx]!==1)complete=false;
    if(complete)mask[y*width+x]=1;
  }
  return {mask,colors,width,height};
}

/** Three authored plate wells/rims, each with a fully opaque source-gradient interior.
 * Their minimum third/largest component area ratio318/379 is measured solely
 * from real source30/60/300 e40. A cot/cabinet/body patch cannot stand in for a plate set. */
export function diningPlateMaterialPixels(bitmap: MaterialBitmap, rect: MaterialRect): number {
  const {mask,width,height}=interior(bitmap,rect,plateKeys), sizes:number[]=[];
  for(let start=0;start<mask.length;start++) {
    if(mask[start]!==1)continue;
    const pending=[start];mask[start]=0;let count=0;
    while(pending.length>0) {
      const at=pending.pop()!;count++;
      const x=at%width,y=Math.floor(at/width);
      for(const next of [x>0?at-1:-1,x+1<width?at+1:-1,y>0?at-width:-1,y+1<height?at+width:-1]) {
        if(next>=0&&mask[next]===1){mask[next]=0;pending.push(next);}
      }
    }
    sizes.push(count);
  }
  sizes.sort((a,b)=>b-a);
  // Actual source component counts:30=[342,340,321],60=[379,345,318],300=[355,348,331].
  if(sizes.length<3||sizes[2]!*379<sizes[0]!*318)return 0;
  return sizes[0]!+sizes[1]!+sizes[2]!;
}

/** The table deliberately shares retained timber maps. Require a source-rounded
 * edge witness inside the complete opaque timber neighborhood. Those ray colors
 * exclude every opaque texel of the unrelated actual table72 matrix. */
export function woodenBenchMaterialPixels(bitmap: MaterialBitmap, rect: MaterialRect): number {
  const {mask,colors}=interior(bitmap,rect,timberKeys);
  let count=0,edgeWitness=false;
  for(let i=0;i<mask.length;i++)if(mask[i]===1){count++;if(roundedEdgeKeys.has(colors[i]!))edgeWitness=true;}
  return edgeWitness?count:0;
}

export function diningPlatePixels(png: Buffer, turns: 0|1): number[] {
  const bitmap=decodeStaffMaterialPng(png);
  return TABLE_MATERIAL_RECTS[turns]!.map(rect=>diningPlateMaterialPixels(bitmap,rect));
}
export function woodenBenchPixels(png: Buffer, turns: 0|1): number[] {
  const bitmap=decodeStaffMaterialPng(png);
  return BENCH_MATERIAL_RECTS[turns]!.map(rect=>woodenBenchMaterialPixels(bitmap,rect));
}
