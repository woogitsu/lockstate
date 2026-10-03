import { decodeStaffMaterialPng, type MaterialBitmap, type MaterialRect } from './staff-room-padded-chair/material-observer';

/** Exact opaque colors of the retained authored `Cistern teal ceramic band`,
 * ray-projected in the two actual source poses. No screenshot-trained range.
 */
export const TOILET_TEAL_RGB_KEYS: Readonly<Record<0|1,readonly number[]>> = {
  0: [2648685,2714477,2714991,2780271,2780528,2846577,2912371,2912628,2912629,2912884,2978164,3043956,3110007,3110264,3176056,3176313,3176314,3241593,3242106,3307642,3373949,3373950,3439999,3505278,3505535,3505536,3571328,3637121,3637378,3637635,3703171,3703172,3703428,3703429,3768964,3768965,3769221,3769222,3769223,3834757,3834758,3835013,3835014,3900549,3900550,3900551,3900552,3900807,3966342,3966343,3966344,3966345,3966600,3966601,4031881,4032137,4097672,4162694,4163467,4229002,4229260,4360846,4491662,4491919,4492175,4557711],
  1: [2648428,2648942,2714735,2780528,2780784,2780785,2846320,2912371,2912628,2912884,2978164,3110263,3175542,3175800,3176056,3241593,3307386,3307899,3307900,3308156,3373950,3438713,3439743,3504249,3505535,3505792,3505793,3571071,3571072,3571585,3571586,3571842,3636864,3637120,3637121,3637635,3703170,3703171,3703172,3703427,3703428,3703429,3768964,3768965,3769220,3769221,3834756,3834757,3834758,3835013,3835014,3900295,3900550,3900551,3900807,3965830,3966343,3966344,4031880,4031881,4097158,4097673,4097674,4163466],
};
export const TOILET_MATERIAL_RECTS: Readonly<Record<0|1,readonly MaterialRect[]>> = {
  0: [[936,678,53,29],[983,707,16,17]],
  1: [[993,440,44,26],[1040,458,17,18]],
};
export const TOILET_PALETTE_SOURCE_FRAMES = [
  {
    "yawDegrees": 15,
    "elevationDegrees": 40,
    "image": "/assets/environment/oblique/cell-toilet-yaw+15-elev40.47730375f0d1.png",
    "sha256": "47730375f0d182cf9954923fb2e2cbdc9f86b114fbba57cccce51dfab2deccf2"
  },
  {
    "yawDegrees": -15,
    "elevationDegrees": 40,
    "image": "/assets/environment/oblique/cell-toilet-yaw-15-elev40.c3d7053f333f.png",
    "sha256": "c3d7053f333f65f170a25d38c030b8087922392963448a96b3e86adbcbe116a5"
  }
] as const;
const palettes={0:new Set(TOILET_TEAL_RGB_KEYS[0]),1:new Set(TOILET_TEAL_RGB_KEYS[1])};

function countPixels(bitmap: MaterialBitmap,rect: MaterialRect,predicate:(r:number,g:number,b:number,a:number)=>boolean):number {
  const [left,top,width,height]=rect;
  if(left<0||top<0||left+width>bitmap.width||top+height>bitmap.height)throw new Error('Toilet material ROI outside actual PNG');
  let count=0;
  for(let y=top;y<top+height;y++)for(let x=left;x<left+width;x++) {
    const index=(y*bitmap.width+x)*4;
    if(predicate(bitmap.rgba[index]!,bitmap.rgba[index+1]!,bitmap.rgba[index+2]!,bitmap.rgba[index+3]!))count++;
  }
  return count;
}

export function toiletAuthoredTealPixels(bitmap: MaterialBitmap,rect: MaterialRect,turns:0|1):number {
  return countPixels(bitmap,rect,(r,g,b,a)=>a===255&&palettes[turns].has((r<<16)|(g<<8)|b));
}

/** Original independent hardware predicate, unchanged. Its blue-steel pixels
 * are NOT claimed to identify only the thin valve wheel or an isolated shader.
 */
export function toiletOriginalSteelPixels(bitmap: MaterialBitmap,rect: MaterialRect):number {
  return countPixels(bitmap,rect,(r,g,b)=>r>=90&&r<=180&&g>r&&g-r<=12&&b>=g&&b-g<=12);
}

export function toiletMaterialEvidence(png: Buffer,turns:0|1) {
  const bitmap=decodeStaffMaterialPng(png),rects=TOILET_MATERIAL_RECTS[turns];
  const old=turns===0?[49,128,135]:[48,127,135];
  const originalTealPixels=countPixels(bitmap,rects[0]!, (r,g,b)=>r===old[0]&&g===old[1]&&b===old[2]);
  const authoredTealPixels=toiletAuthoredTealPixels(bitmap,rects[0]!,turns);
  const originalSteelPixels=toiletOriginalSteelPixels(bitmap,rects[1]!);
  return {rects,pixels:[authoredTealPixels,originalSteelPixels],originalPixels:[originalTealPixels,originalSteelPixels],
    sourceSha256:'1aa9169f65ea498fd1bfe6a2ee600f058c41f1a76685a0109a17da92db398ad5',
    sourcePose:TOILET_PALETTE_SOURCE_FRAMES[turns],hardwareUniqueSourceIsolationClaimed:false};
}
