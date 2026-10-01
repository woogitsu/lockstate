import type { RoomTemplatePlan } from './room-template-catalog';
import { rotateRoomTemplateGeometry, type RotatedRoomTemplateGeometry } from './room-template-rotation';

type PreviewRole = 'floor' | 'wall' | 'door' | 'fixture';
interface PreviewTile { readonly x:number; readonly y:number; readonly role:PreviewRole }

/** Dormant preview DTO, using full fixture extents. No UI/command rotation is armed. */
export function roomTemplatePreviewGeometry(
  plan:RoomTemplatePlan | RotatedRoomTemplateGeometry,
  turns:number,
  footprintOf:(id:RoomTemplatePlan['objects'][number]['buildableId'])=>{readonly width:number;readonly height:number},
) {
  const geometry=rotateRoomTemplateGeometry(plan,turns,footprintOf);
  const tiles:PreviewTile[]=[];
  const fill=(rectangle:{x:number;y:number;width:number;height:number},role:PreviewRole)=>{
    for(let dy=0;dy<rectangle.height;dy+=1) for(let dx=0;dx<rectangle.width;dx+=1) {
      tiles.push({x:rectangle.x+dx,y:rectangle.y+dy,role});
    }
  };
  for(const zone of geometry.zones) fill(zone,'floor');
  for(const wall of geometry.wallSquares) tiles.push({...wall,role:'wall'});
  for(const door of geometry.doorSquares) tiles.push({x:door.x,y:door.y,role:'door'});
  for(const fixture of geometry.objects) fill(fixture,'fixture');
  return {origin:geometry.origin,width:geometry.width,height:geometry.height,
    quarterTurns:geometry.quarterTurns,fixtureCount:geometry.objects.length,tiles};
}
