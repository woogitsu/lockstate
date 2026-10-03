import { expect,it } from 'vitest';
import { ROOM_TEMPLATE_IDS,instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { roomTemplatePreviewGeometry } from '../../src/content/room-template-preview-geometry';
const footprint=(id:string)=>defaultObjectRegistry.getById(getBuildableDefinition(id).placesObjectId!)!.footprint;

it.each(ROOM_TEMPLATE_IDS)('%s preview transforms every occupied tile, including whole fixtures', id=>{
  for(const mirrorX of [false,true]) {
    const plan=instantiateRoomTemplate(id,{x:-30,y:8},{mirrorX});
    const original=roomTemplatePreviewGeometry(plan,0,footprint);
    const source=JSON.stringify(plan);
    for(let turns=0;turns<4;turns+=1) {
      const actual=roomTemplatePreviewGeometry(plan,turns,footprint);
      // Independent tile-level oracle: fixture rectangle transform must produce
      // exactly the same set as turning its individual authored occupied tiles.
      const expected=original.tiles.map(tile=>{
        const x=tile.x-plan.origin.x,y=tile.y-plan.origin.y;
        const [tx,ty]=turns===0?[x,y]:turns===1?[plan.height-1-y,x]
          :turns===2?[plan.width-1-x,plan.height-1-y]:[y,plan.width-1-x];
        return `${plan.origin.x+tx}:${plan.origin.y+ty}:${tile.role}`;
      }).sort();
      expect(actual.tiles.map(tile=>`${tile.x}:${tile.y}:${tile.role}`).sort()).toEqual(expected);
      expect(actual.fixtureCount).toBe(plan.objects.length);
      expect([actual.width,actual.height]).toEqual(turns%2?[plan.height,plan.width]:[plan.width,plan.height]);
    }
    expect(JSON.stringify(plan)).toBe(source);
  }
});

it('keeps preview origins and full rectangles exact near both signed limits',()=>{
  for(const edge of [Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER-7]) {
    for(let turns=0;turns<4;turns+=1) {
      const preview=roomTemplatePreviewGeometry(instantiateRoomTemplate('cell-basic',{x:edge,y:edge}),turns,footprint);
      expect(preview.tiles.every(t=>Number.isSafeInteger(t.x)&&Number.isSafeInteger(t.y))).toBe(true);
      expect(preview.tiles.filter(t=>t.role==='fixture')).toHaveLength(3);
    }
  }
});
