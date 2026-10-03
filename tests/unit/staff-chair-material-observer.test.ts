import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeStaffMaterialPng, staffPadSurfacePixels, STAFF_CHAIR_MATERIAL_RECTS, STAFF_PAD_GRADIENT_RGB_KEYS } from '../browser/staff-room-padded-chair/material-observer';

interface Frame { readonly yawDegrees: number; readonly elevationDegrees: number; readonly image: string; readonly sha256: string }
const root=new URL('../../',import.meta.url);
const publicBytes=(path: string): Buffer=>readFileSync(new URL(`public${path}`,root));
const frames=(manifest: string): readonly Frame[] => (JSON.parse(publicBytes(manifest).toString('utf8')) as {frames: readonly Frame[]}).frames;
const score=(frame: Frame): number=> {
  const bytes=publicBytes(frame.image);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(frame.sha256);
  const bitmap=decodeStaffMaterialPng(bytes);
  return staffPadSurfacePixels(bitmap,[0,0,bitmap.width,bitmap.height]);
};

describe('source-authored Staff charcoal gradient discriminator',()=> {
  it('rederives the frozen gradient from opaque projected authored seat-top samples, not screenshots',()=> {
    const authored=frames('/game-content/oblique-furniture-staff-room-padded-chair.v1.json');
    const colors=new Set<number>();
    for(const yaw of [60,300]) {
      const frame=authored.find(row=>row.yawDegrees===yaw&&row.elevationDegrees===40)!;
      const bitmap=decodeStaffMaterialPng(publicBytes(frame.image));
      const a=yaw*Math.PI/180,e=40*Math.PI/180;
      // Actual builder centre0,.09,.648; thickness.092; translated(.5,.5,0).
      // An inset.28 square is strictly inside the authored .45 seat top.
      const polygon: readonly (readonly [number,number])[] = [[-.14,-.14],[.14,-.14],[.14,.14],[-.14,.14]].map(([dx,dy])=> {
        const x=dx!,y=.09+dy!,z=.694-.6600000262260437;
        return [128+64*(Math.cos(a)*x+Math.sin(a)*y),128-64*(-Math.sin(a)*Math.sin(e)*x+Math.cos(a)*Math.sin(e)*y+Math.cos(e)*z)] as const;
      });
      let samples=0;
      for(let y=0;y<256;y++)for(let x=0;x<256;x++) {
        let inside=false;
        for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
          const first=polygon[i]!,second=polygon[j]!;
          if((first[1]>y+.5)!==(second[1]>y+.5)&&x+.5<(second[0]-first[0])*(y+.5-first[1])/(second[1]-first[1])+first[0])inside=!inside;
        }
        if(!inside)continue;
        const index=(y*256+x)*4;expect(bitmap.rgba[index+3]).toBe(255);samples++;
        colors.add((bitmap.rgba[index]!<<16)|(bitmap.rgba[index+1]!<<8)|bitmap.rgba[index+2]!);
      }
      expect(samples).toBe(207);
    }
    expect([...colors].sort((a,b)=>a-b)).toEqual(STAFF_PAD_GRADIENT_RGB_KEYS);
  });
  it('accepts the two real source60/300,e40 charcoal surfaces at the original >40 floor',()=> {
    const authored=frames('/game-content/oblique-furniture-staff-room-padded-chair.v1.json');
    for(const yaw of [60,300]) {
      const frame=authored.find(row=>row.yawDegrees===yaw&&row.elevationDegrees===40);
      expect(frame).toBeDefined();expect(score(frame!)).toBeGreaterThan(40);
    }
  });
  it('rejects every genuine default chair and Staff desk body at the same >40 acceptance floor',()=> {
    for(const manifest of ['/game-content/oblique-cell-chair.v1.json','/game-content/oblique-reception-employee-desk.v1.json']) {
      const actual=frames(manifest);expect(actual).toHaveLength(72);
      for(const frame of actual) expect(score(frame),`${frame.image} cannot stand in for an authored pad`).toBeLessThanOrEqual(40);
    }
  });
  it('retains every original independent per-chair rectangle',()=> {
    expect(STAFF_CHAIR_MATERIAL_RECTS).toEqual({0:[[770,490,100,115],[940,440,100,115]],1:[[825,390,95,100],[885,500,100,105]]});
  });
  it('rejects whole wall bodies including footing, door bodies and the actual Staff woven floor',()=> {
    for(const manifest of ['oblique-square-brick-full-wall.v1.json','oblique-wall-cutaway.v1.json','oblique-wall-west.v1.json','oblique-wall-west-cutaway.v1.json','oblique-cell-door-open.v1.json','oblique-cell-door-north-cutaway.v1.json','oblique-cell-door-west-full.v1.json','oblique-cell-door-west-cutaway.v1.json']) {
      const actual=frames(`/game-content/${manifest}`);expect(actual).toHaveLength(72);
      for(const frame of actual)expect(score(frame),`${frame.image} is not a chair pad`).toBeLessThanOrEqual(40);
    }
    const bitmap=decodeStaffMaterialPng(publicBytes('/game-content/source-art/rendered.floor.staff-room.woven-vinyl.8a17ffe2678c.png'));
    expect(staffPadSurfacePixels(bitmap,[0,0,bitmap.width,bitmap.height])).toBeLessThanOrEqual(40);
  });
});
