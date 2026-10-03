import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { roomTemplateConstructionGeometry } from '../../src/content/room-template-construction-geometry';
import { rotateRoomTemplateGeometry } from '../../src/content/room-template-rotation';

const footprint = (id: string) => defaultObjectRegistry.getById(getBuildableDefinition(id).placesObjectId!)!.footprint;

describe('dormant room-plan quarter-turn geometry', () => {
  it('rotates a complete two-tile bed and south door rather than only their anchors', () => {
    const plan = instantiateRoomTemplate('cell-basic', {x:10,y:20});
    const turned = rotateRoomTemplateGeometry(plan, 1, footprint);
    expect([turned.width, turned.height]).toEqual([7,4]);
    expect(turned.origin).toEqual({x:10,y:20});
    expect(turned.objects[0]).toEqual({buildableId:'bed-wooden',x:14,y:21,width:2,height:1,quarterTurns:1});
    expect(turned.doorSquares).toEqual([{x:10,y:21}]);
    expect(turned.zone).toEqual({roomId:'room.cell',x:11,y:21,width:5,height:2});
  });
  it.each(ROOM_TEMPLATE_IDS.flatMap(id => [false,true].map(mirrorX => ({id,mirrorX}))))('$id mirror=$mirrorX preserves all occupied squares and reverses without changing the input', ({id,mirrorX}) => {
    const plan = instantiateRoomTemplate(id, {x:-7,y:30}, {mirrorX});
    const before = JSON.stringify(plan);
    const identity = rotateRoomTemplateGeometry(plan,0,footprint);
    let cycle = identity;
    for (let turn=1;turn<=4;turn+=1) {
      cycle = rotateRoomTemplateGeometry(cycle,1,footprint);
      expect(cycle.origin).toEqual(plan.origin);
      expect(cycle.width*cycle.height).toBe(plan.width*plan.height);
      expect(cycle.wallSquares).toHaveLength(plan.wallSquares.length);
      expect(cycle.doorSquares).toHaveLength(plan.doorSquares.length);
      const claimed = new Set(cycle.wallSquares.map(p=>`${p.x}:${p.y}`));
      for (const door of cycle.doorSquares) expect(claimed.has(`${door.x}:${door.y}`)).toBe(false);
      for (const object of cycle.objects) {
        const original = footprint(object.buildableId);
        expect(object.width*object.height).toBe(original.width*original.height);
        for (let dy=0;dy<object.height;dy+=1) for(let dx=0;dx<object.width;dx+=1) {
          const x=object.x+dx,y=object.y+dy,key=`${x}:${y}`;
          expect(claimed.has(key)).toBe(false);
          expect(cycle.zones.some(z=>x>=z.x&&x<z.x+z.width&&y>=z.y&&y<z.y+z.height)).toBe(true);
          claimed.add(key);
        }
      }
      expect(rotateRoomTemplateGeometry(cycle,-turn,footprint)).toEqual(identity);
    }
    expect(cycle).toEqual(identity);
    expect(JSON.stringify(plan)).toBe(before);
  });
  it('rotates north-door order-tile offsets along with their exact wall squares', () => {
    const plan = instantiateRoomTemplate('cell-row-four',{x:0,y:0});
    const turned = rotateRoomTemplateGeometry(plan,1,footprint);
    for(let i=0;i<plan.doorSquares.length;i+=1) {
      const door=plan.doorSquares[i]!, next=turned.doorSquares[i]!;
      if(door.orderTile) {
        expect(next.orderTile!.x-next.x).toBe(-(door.orderTile.y-door.y));
        expect(next.orderTile!.y-next.y).toBe(door.orderTile.x-door.x);
      }
    }
  });
  it('accepts a safe final half-turn without requiring an unused intermediate footprint', () => {
    const plan = instantiateRoomTemplate('cell-basic', {x:Number.MAX_SAFE_INTEGER-4,y:0});
    const turned = rotateRoomTemplateGeometry(plan,2,footprint);
    expect([turned.width,turned.height]).toEqual([4,7]);
    expect(rotateRoomTemplateGeometry(turned,2,footprint)).toEqual(rotateRoomTemplateGeometry(plan,0,footprint));
  });
  it('refuses non-integral rotations and a swapped footprint outside safe coordinates', () => {
    const plan=instantiateRoomTemplate('cell-basic',{x:Number.MAX_SAFE_INTEGER-4,y:0});
    expect(()=>rotateRoomTemplateGeometry(plan,1,footprint)).toThrow(RangeError);
    expect(()=>rotateRoomTemplateGeometry(plan,0.5,footprint)).toThrow(RangeError);
  });
});

it.each(ROOM_TEMPLATE_IDS)('%s keeps every rotated coordinate safe at both signed world limits', id => {
  const shape=instantiateRoomTemplate(id,{x:0,y:0});
  const extent=Math.max(shape.width,shape.height);
  for(const edge of [Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER-extent]) {
    const plan=instantiateRoomTemplate(id,{x:edge,y:edge});
    for(let turns=0;turns<4;turns+=1) {
      const rotated=rotateRoomTemplateGeometry(plan,turns,footprint);
      const orders=roomTemplateConstructionGeometry(rotated);
      const coordinates=[...orders.walls,...orders.doors,...orders.objects,...rotated.wallSquares,...rotated.doorSquares,...rotated.objects,...rotated.zones];
      expect(coordinates.every(p=>Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y))).toBe(true);
      expect(rotateRoomTemplateGeometry(rotated,-turns,footprint)).toEqual(rotateRoomTemplateGeometry(plan,0,footprint));
    }
  }
});
