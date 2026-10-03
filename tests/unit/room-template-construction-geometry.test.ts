import { expect, it } from 'vitest';
import { instantiateRoomTemplate, ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { rotateRoomTemplateGeometry } from '../../src/content/room-template-rotation';
import { roomTemplateConstructionGeometry } from '../../src/content/room-template-construction-geometry';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { objectFootprintTiles } from '../../src/simulation/objects/placed-object';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const footprint = (id:string)=>defaultObjectRegistry.getById(getBuildableDefinition(id).placesObjectId!)!.footprint;

it('maps each rotated door into existing canonical north/west edge coordinates', () => {
  const plan=instantiateRoomTemplate('cell-basic',{x:10,y:20});
  const expected=[{x:11,y:26,edge:'north'},{x:11,y:21,edge:'west'},{x:12,y:21,edge:'north'},{x:16,y:22,edge:'west'}];
  for(let turns=0;turns<4;turns+=1) {
    const geometry=rotateRoomTemplateGeometry(plan,turns,footprint);
    expect(roomTemplateConstructionGeometry(geometry).doors).toEqual([{definitionId:'door-wooden',...expected[turns]}]);
  }
});
it.each(ROOM_TEMPLATE_IDS)('%s fixture descriptors reserve exactly the rotated rectangles through the existing oriented-footprint reader', id => {
  for(const mirrorX of [false,true]) for(let turns=0;turns<4;turns+=1) {
    const geometry=rotateRoomTemplateGeometry(instantiateRoomTemplate(id,{x:4,y:8},{mirrorX}),turns,footprint);
    const descriptors=roomTemplateConstructionGeometry(geometry);
    expect(descriptors.walls.every(w=>w.footprint==='square')).toBe(true);
    for(let i=0;i<geometry.objects.length;i+=1) {
      const object=geometry.objects[i]!, descriptor=descriptors.objects[i]!;
      const definition=defaultObjectRegistry.getById(getBuildableDefinition(descriptor.definitionId).placesObjectId!)!;
      const actual=objectFootprintTiles(definition,{x:tileCoordinate(descriptor.x),y:tileCoordinate(descriptor.y)},descriptor.orientation);
      const expected=[];
      for(let dy=0;dy<object.height;dy+=1) for(let dx=0;dx<object.width;dx+=1) expected.push({x:object.x+dx,y:object.y+dy});
      expect(actual).toEqual(expected);
    }
  }
});
