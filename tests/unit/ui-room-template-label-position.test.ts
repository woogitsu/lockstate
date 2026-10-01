import { expect, it } from 'vitest';
import { positionRoomTemplateLabel } from '../../src/ui/room-template-label-position';

it('keeps a measured readout outside an angled floor even when its origin is near the top edge', () => {
  const position = positionRoomTemplateLabel({left:570,top:103,right:1548,bottom:1072}, [{x:1059,y:103},{x:1548,y:587},{x:1059,y:1072},{x:570,y:587}], {width:340,height:100}, {x:1059,y:103});
  expect(position).toEqual({x:1208,y:103});
});
it('uses actual readout height and keeps it within the available map rectangle', () => {
  const position = positionRoomTemplateLabel({left:550,top:100,right:1550,bottom:1080}, [{x:700,y:300},{x:1000,y:300},{x:1000,y:700},{x:700,y:700}], {width:340,height:160}, {x:700,y:300});
  expect(position).toEqual({x:700,y:132});
});
